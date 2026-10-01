import { numberParagraphs } from './marker-placer.js';
import { buildAssetPlannerUserPrompt, parseAssetPlan, buildAssetSlot, buildDictionaryAssetItems } from './asset-prompt.js';
import { requestWithSoftRetry } from './prompt-kit.js';
import { normalizeAutoIllustrationSettings, isStrictBackgroundMatch } from './auto-illustration-settings.js';
import { supportsNaiTransparentBackground } from '../request-builders/nai-v4-builder.js';
import { collectAssetNeeds, tempAssetKeyOf, GENERATED_ASSET_URL_PREFIX, generatedAssetIdOf, isGeneratedAssetUrl } from '../../scene/asset-match.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { GENERATED_IMAGE_SCHEMA_VERSION, isLegacyGeneratedImage, isQuotaError, normalizeGeneratedImageRecord } from '../../media/generated-asset-store.js';
import { buildDbgenAssetDescription, buildExpressionDiffDescription, buildWardrobeClothingDescription, expressionSpritePrompts, uprightSpriteCaption } from '../dbgen-prompt.js';
import { normalizeStoredPrompt, promptFromCaption } from '../generation-prompt.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { isCharacterDnaEmpty, resolveCharacterDna } from '../../scene/character-dna.js';

export const GENERATED_ASSET_UPDATED_EVENT = 'igs:generated-asset-updated';
const IMAGE_CACHE_LIMIT = 60;
// review：等待楼层结束时让用户处理；chat：用户选择仅本聊天使用；
// library：已加入素材库（由生成区条目接管）；discarded：丢弃。
const ACTIVE_TEMP_STATUSES = new Set(['review', 'chat']);

function toReadableText(raw) {
    return numberParagraphs(raw).paragraphs.map((p) => p.text).join('\n');
}

// 按既有别名归约为立绘需求挂上主名 DNA；空 DNA 不挂，保持无 DNA 时的旧行为。
export function attachCharacterDna(needs, sceneAssets) {
    const dnaMap = sceneAssets && sceneAssets.characterDna;
    if (!dnaMap || typeof dnaMap !== 'object' || Array.isArray(dnaMap)) return needs;
    const canonical = (name) => resolveCharacterKey(sceneAssets.characters || {}, sceneAssets.characterAliases || {}, name) || '';
    for (const need of needs) {
        if (!need || need.type !== 'sprite') continue;
        const hit = resolveCharacterDna(dnaMap, need.name, canonical);
        if (hit && !isCharacterDnaEmpty(hit.dna)) need.dna = hit.dna;
    }
    return needs;
}

export function createAssetGenerationService(deps) {
    const { messageHost, llm, nai, store, getSettings, events } = deps;
    const matte = deps.matte || (async (dataUrl) => dataUrl);
    const now = deps.now || (() => new Date().toISOString());
    const report = deps.report || (() => {});
    const newId = deps.newId || (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    const locks = new Map();
    const images = new Map();
    const pendingImages = new Set();
    let tempChatId = '';
    let tempRecords = new Map();
    let tempLoading = null;
    let offRendered = null;

    const readSettings = () => {
        const raw = getSettings ? getSettings() || {} : {};
        return {
            auto: normalizeAutoIllustrationSettings(raw.autoIllustration),
            strict: isStrictBackgroundMatch(raw.autoIllustration),
            sceneAssets: raw.sceneAssets && typeof raw.sceneAssets === 'object' ? raw.sceneAssets : {},
        };
    };

    function emit(detail) {
        if (events && typeof events.emit === 'function') events.emit(GENERATED_ASSET_UPDATED_EVENT, detail);
    }

    function rememberImage(id, dataUrl) {
        images.delete(id);
        images.set(id, dataUrl);
        while (images.size > IMAGE_CACHE_LIMIT) images.delete(images.keys().next().value);
    }

    function loadTempRecords(chatId) {
        if (!chatId) return Promise.resolve();
        if (chatId === tempChatId && !tempLoading) return Promise.resolve();
        if (chatId === tempChatId && tempLoading) return tempLoading;
        tempChatId = chatId;
        tempRecords = new Map();
        tempLoading = store.getAssetsByChat(chatId).then((list) => {
            if (tempChatId !== chatId) return;
            for (const record of list || []) tempRecords.set(record.key, record);
            tempLoading = null;
            if (tempRecords.size) emit({ chatId, reason: 'hydrated' });
        }).catch(() => { tempLoading = null; });
        return tempLoading;
    }

    function currentTempRecords() {
        const chatId = messageHost.getChatId();
        if (chatId !== tempChatId) void loadTempRecords(chatId);
        return chatId === tempChatId ? tempRecords : new Map();
    }

    function tempUrl(record) {
        return record && ACTIVE_TEMP_STATUSES.has(record.status) && record.imageId
            ? `${GENERATED_ASSET_URL_PREFIX}${record.imageId}` : '';
    }

    function tempBackground(scene, time) {
        const records = currentTempRecords();
        const exact = records.get(tempAssetKeyOf(tempChatId, { type: 'background', name: scene, time }));
        if (tempUrl(exact)) return tempUrl(exact);
        for (const record of records.values()) {
            if (record.type === 'background' && record.name === scene && tempUrl(record)) return tempUrl(record);
        }
        return '';
    }

    function tempSprite(name) {
        return tempUrl(currentTempRecords().get(tempAssetKeyOf(tempChatId, { type: 'sprite', name })));
    }

    // 同步取图：命中内存直接返回；否则异步从 IndexedDB 补并在补完后通知重渲染。
    function resolveUrl(url) {
        if (!isGeneratedAssetUrl(url)) return String(url || '');
        const id = generatedAssetIdOf(url);
        const hit = images.get(id);
        if (hit) return hit;
        if (!pendingImages.has(id)) {
            pendingImages.add(id);
            store.getImage(id).then((record) => {
                if (record && record.dataUrl) {
                    rememberImage(id, record.dataUrl);
                    emit({ imageId: id, reason: 'image-loaded' });
                }
            }).catch(() => {}).finally(() => pendingImages.delete(id));
        }
        return '';
    }

    function matchContext(s, userName, knownCharacters = []) {
        return {
            sceneAssets: s.sceneAssets,
            generatedAssets: s.sceneAssets.generated,
            strict: s.strict,
            tempBackground,
            tempSprite,
            userName,
            knownCharacters,
        };
    }

    // 立绘图片记录 schema v2：保存不可变原图、当前透明结果、遮罩与 revision；dataUrl 仍是旧消费者读取的透明结果。
    async function buildSpriteImageRecord(imageId, originalDataUrl, transparent, createdAt) {
        const raw = await matte(originalDataUrl, { alreadyTransparent: transparent, detailed: true });
        // 兼容旧注入：matte 只返回字符串时按旧契约处理，没有遮罩。
        const result = typeof raw === 'string'
            ? { dataUrl: raw, alphaMaskDataUrl: '' }
            : (raw && typeof raw === 'object' ? raw : { dataUrl: originalDataUrl, alphaMaskDataUrl: '' });
        return {
            schemaVersion: GENERATED_IMAGE_SCHEMA_VERSION,
            id: imageId,
            type: 'sprite',
            originalDataUrl,
            workingDataUrl: '',
            dataUrl: typeof result.dataUrl === 'string' && result.dataUrl ? result.dataUrl : originalDataUrl,
            alphaMaskDataUrl: typeof result.alphaMaskDataUrl === 'string' ? result.alphaMaskDataUrl : '',
            // 自动抠图的裁边偏移：编辑器据此把原图对齐到遮罩坐标；没有时为 null。
            matteCrop: result.diagnostics && result.diagnostics.crop ? { ...result.diagnostics.crop } : null,
            revision: 1,
            createdAt,
            updatedAt: createdAt,
        };
    }

    // 额度不足时降级为只存透明结果（记录为 legacy），已生成的立绘不丢失，并给出可诊断标记。
    async function putImageWithQuotaFallback(image) {
        try {
            await store.putImage(image);
            return { ok: true };
        } catch (error) {
            if (!isQuotaError(error) || !image.originalDataUrl) throw error;
            await store.putImage({
                id: image.id, dataUrl: image.dataUrl, type: image.type, createdAt: image.createdAt,
                ...(image.prompt ? { prompt: image.prompt } : {}),
            });
            report('warn', '素材图片存储空间不足，已只保存透明结果，之后无法从原图修复抠图（source-unavailable: quota）');
            return { ok: true, diagnostic: 'quota' };
        }
    }

    async function generateItem(item, s, floor, floorKey) {
        const isSprite = item.need.type === 'sprite';
        // 智绘姬出图不保证透明底：走智绘姬时按浅灰底模板出图并抠图，不信任 NAI 模型的原生透明能力。
        // 数据库生图的立绘默认要透明底，不看沉浸式插件自己填的 NAI 模型。
        const plannedVia = nai && typeof nai.describe === 'function' ? nai.describe().via : 'nai';
        const transparent = isSprite && plannedVia !== 'chatu8'
            && (plannedVia === 'dbgen' || supportsNaiTransparentBackground(s.auto.nai.model));
        const slot = buildAssetSlot(item, { transparent, templates: s.auto.assets.templates });
        const size = isSprite ? s.auto.assets.spriteSize : s.auto.assets.backgroundSize;
        // 数据库生图：描述只说明画什么。正负模板随 userPrompts 传出，出图前合并进最终 caption。
        const userPrompts = { positive: slot.scene, negative: slot.sceneUc };
        const meta = {
            messageId: floor.messageId, size, description: buildDbgenAssetDescription(item.need), userPrompts,
            skipRecall: true,
            ...(isSprite && plannedVia === 'dbgen' && { transparent: true }),
        };
        let result;
        try { result = await nai.generate(slot, { ...s.auto.nai, size }, meta); } catch (error) { result = { ok: false, error: `NAI 生成失败：${(error && error.message) || error}` }; }
        const key = tempAssetKeyOf(floor.chatId, item.need);
        const base = {
            key, chatId: floor.chatId, floorKey, messageId: floor.messageId, swipeId: floor.swipeId,
            type: item.need.type, name: item.need.name, time: item.need.time || '', weather: item.need.weather || '',
            tags: item.tags, createdAt: now(),
        };
        let record;
        if (result && result.ok && result.dataUrl) {
            const imageId = newId();
            const image = isSprite
                ? await buildSpriteImageRecord(imageId, result.dataUrl, transparent, base.createdAt)
                : { id: imageId, dataUrl: result.dataUrl, type: item.need.type, createdAt: base.createdAt };
            const prompt = normalizeStoredPrompt(result.prompt);
            if (prompt) image.prompt = prompt;
            const saved = await putImageWithQuotaFallback(image);
            rememberImage(imageId, image.dataUrl);
            record = { ...base, imageId, status: 'review', ...(saved.diagnostic ? { sourceUnavailable: saved.diagnostic } : {}) };
        } else {
            record = { ...base, imageId: '', status: 'failed', error: (result && result.error) || 'NAI 生成失败' };
            report('error', `素材「${item.need.name}」生成失败：${record.error}`);
        }
        await store.putAsset(record);
        if (tempChatId === floor.chatId) tempRecords.set(key, record);
        emit({ chatId: floor.chatId, messageId: floor.messageId, swipeId: floor.swipeId, key, reason: 'generated' });
        return record;
    }

    async function run(messageId, floor, key, s, manual) {
        // 失败或中途刷新残留的 planning 不算处理完，下次渲染时重试。
        const previous = await store.getFloor(key);
        if (!manual && previous && previous.status === 'done') return { ok: true, reason: 'already-decided' };
        await loadTempRecords(floor.chatId);
        const numbered = numberParagraphs(floor.text);
        const needs = collectAssetNeeds(
            { scenes: numbered.scenes, characters: numbered.characters },
            matchContext(
                s,
                messageHost.getUserName ? messageHost.getUserName() : '',
                messageHost.getCharacterNames ? messageHost.getCharacterNames() : [],
            ),
            { background: s.auto.assets.backgroundEnabled, sprite: s.auto.assets.spriteEnabled, limit: s.auto.assets.maxPerFloor },
        );
        attachCharacterDna(needs, s.sceneAssets);
        if (!needs.length) {
            await store.putFloor(key, { status: 'done', count: 0, updatedAt: now() });
            return { ok: true, reason: 'nothing-missing' };
        }
        const backend = nai && typeof nai.describe === 'function' ? nai.describe() : { ready: { ok: true } };
        if (!backend.ready.ok) {
            await store.putFloor(key, { status: 'failed', error: backend.ready.error, updatedAt: now() });
            report('error', `第 ${messageId} 楼素材未开始：${backend.ready.error}`);
            return { ok: false, reason: 'backend-unavailable', error: backend.ready.error };
        }
        await store.putFloor(key, { status: 'planning', updatedAt: now() });
        let plan;
        if (backend.ownPrompts) {
            // 数据库生图插件自己按楼层写提示词，不需要副 LLM 出标签。
            report('info', `第 ${messageId} 楼缺少 ${needs.length} 项素材，正在交给数据库生图插件…`);
            plan = { ok: true, items: needs.map((need) => ({ need, tags: '' })) };
        } else {
            report('info', `第 ${messageId} 楼缺少 ${needs.length} 项素材，正在请求副 LLM…`);
            try {
                const previousText = messageHost.readPreviousAiTexts(messageId, s.auto.llm.contextFloors)
                    .map(toReadableText).join('\n').slice(-1500);
                plan = await requestWithSoftRetry(llm, {
                    system: s.auto.llm.prompts.asset,
                    softSystem: s.auto.llm.prompts.assetSoft,
                    user: buildAssetPlannerUserPrompt({ needs, readableText: toReadableText(floor.text).slice(0, 6000), previousText }),
                    parse: (reply) => parseAssetPlan(reply, needs),
                }, s.auto.llm);
            } catch (error) {
                plan = { ok: false, error: '副 LLM 规划失败' };
            }
        }
        if (!plan.ok) {
            const items = buildDictionaryAssetItems(needs);
            report('warn', `第 ${messageId} 楼素材规划失败：${plan.error}${items.length ? '，改用内置词典兜底' : ''}`);
            if (items.length) plan = { ok: true, items, fromDictionary: true };
        }
        if (!plan.ok) {
            await store.putFloor(key, { status: 'failed', error: plan.error, updatedAt: now() });
            report('error', `第 ${messageId} 楼素材未发送生图请求：${plan.error}`);
            return { ok: false, reason: 'plan-failed', error: plan.error };
        }
        let count = 0;
        const errors = [];
        for (const item of plan.items) {
            const record = await generateItem(item, s, floor, key);
            if (record.status === 'review') count += 1;
            else errors.push(`「${record.name}」${record.error}`);
        }
        const failedCount = plan.items.length - count;
        await store.putFloor(key, { status: failedCount ? 'failed' : 'done', count, updatedAt: now() });
        if (count) report('success', `第 ${messageId} 楼已生成 ${count} 项素材，待确认`);
        const result = { ok: failedCount === 0, reason: failedCount ? 'generation-failed' : 'done', count, failedCount };
        if (failedCount) {
            // 同一原因（如 NAI 500）只说一次，避免按钮提示被重复内容撑长。
            const unique = Array.from(new Set(errors.map((e) => e.replace(/^「[^」]*」/, ''))));
            result.error = `${failedCount} 项失败${count ? `（成功 ${count} 项）` : ''}：${unique.length === 1 ? unique[0] : errors.join('；')}`;
        }
        return result;
    }

    async function processMessage(messageId, { manual = false } = {}) {
        const s = readSettings();
        if (!s.auto.assets.spriteEnabled && !s.auto.assets.backgroundEnabled) return { ok: true, reason: 'disabled' };
        if (!s.sceneAssets.enabled) return { ok: true, reason: 'scene-assets-disabled' };
        const floor = messageHost.readFloor(messageId);
        if (!floor || !floor.isAi || !floor.isLatest || !floor.chatId || !floor.text.trim()) {
            return { ok: true, reason: 'not-eligible' };
        }
        const key = floorKeyOf(floor);
        if (locks.has(key)) return locks.get(key);
        const job = run(Number(messageId), floor, key, s, manual)
            .catch((error) => {
                report('error', `素材生成异常：${(error && error.message) || error}`);
                return { ok: false, reason: 'error', error: '素材生成失败' };
            })
            .finally(() => locks.delete(key));
        locks.set(key, job);
        return job;
    }

    function listReview(floorKey) {
        return Array.from(currentTempRecords().values())
            .filter((r) => r.floorKey === floorKey && r.status === 'review')
            .map((r) => ({ ...r, url: tempUrl(r) }));
    }

    function listTemp() {
        return Array.from(currentTempRecords().values())
            .filter((r) => ACTIVE_TEMP_STATUSES.has(r.status))
            .map((r) => ({ ...r, url: tempUrl(r) }));
    }

    async function setStatus(key, status) {
        const record = currentTempRecords().get(key);
        if (!record) return { ok: false, reason: 'not-found' };
        const next = { ...record, status, updatedAt: now() };
        if (status === 'discarded' && record.imageId) {
            await store.deleteImage(record.imageId);
            images.delete(record.imageId);
            next.imageId = '';
        }
        tempRecords.set(key, next);
        await store.putAsset(next);
        emit({ chatId: record.chatId, key, reason: status });
        return { ok: true, record: next };
    }

    async function deleteImages(ids) {
        return deleteImagesImpl(ids);
    }

    // 遮罩编辑器读取：legacy 记录（无原图）只可查看，editable 为 false。
    async function getEditableImage(imageId) {
        const record = normalizeGeneratedImageRecord(await store.getImage(imageId));
        if (!record) return { ok: false, reason: 'not-found' };
        return { ok: true, record, editable: !isLegacyGeneratedImage(record) };
    }

    // 保存修复结果：按 revision 原子更新；成功后刷新内存缓存并通知重渲染，失败不改任何字段。
    async function saveMatteEdit(imageId, expectedRevision, patch) {
        if (!store || typeof store.updateImage !== 'function') return { ok: false, reason: 'update-unsupported' };
        const result = await store.updateImage(imageId, expectedRevision, patch, now());
        if (!result || !result.ok) return result || { ok: false, reason: 'update-failed' };
        rememberImage(imageId, result.record.dataUrl);
        emit({ imageId, reason: 'matte-edited', revision: result.record.revision });
        return { ok: true, revision: result.record.revision };
    }

    async function deleteImagesImpl(ids) {
        for (const id of ids || []) {
            images.delete(id);
            try { await store.deleteImage(id); } catch (error) { /* 图片已不存在时忽略 */ }
        }
    }

    // 下载用：取 IGS 实际存储的图片 dataUrl（立绘为裁边后的版本），找不到返回空串。
    async function getImageDataUrl(id) {
        const key = String(id || '');
        if (!key) return '';
        const hit = images.get(key);
        if (hit) return hit;
        const record = await store.getImage(key);
        return record && record.dataUrl ? record.dataUrl : '';
    }

    function expressionPaintMeta() {
        const s = readSettings();
        const slot = buildAssetSlot(
            { need: { type: 'sprite', name: '' }, tags: '', uc: '' },
            { transparent: true, templates: s.auto.assets.templates },
        );
        const prompts = expressionSpritePrompts(slot.scene, slot.sceneUc);
        return {
            size: s.auto.assets.spriteSize,
            userPrompts: { positive: prompts.positive, negative: prompts.negative },
            transparent: true,
        };
    }

    async function paintExpressionCaption(name, mood, caption) {
        const upright = uprightSpriteCaption(caption) || caption;
        const meta = expressionPaintMeta();
        let painted;
        try {
            painted = await nai.generateDbgenCaption({ ...meta, caption: upright });
        } catch (error) {
            painted = { ok: false, error: (error && error.message) || '出图失败' };
        }
        if (!painted || !painted.ok || !painted.dataUrl) {
            return {
                mood,
                ok: false,
                error: (painted && painted.error) || '出图失败',
                prompt: normalizeStoredPrompt(painted && painted.prompt) || promptFromCaption(upright),
                caption: upright,
            };
        }
        const imageId = newId();
        const createdAt = now();
        const image = await buildSpriteImageRecord(imageId, painted.dataUrl, true, createdAt);
        const prompt = normalizeStoredPrompt(painted.prompt) || promptFromCaption(upright);
        if (prompt) image.prompt = prompt;
        await putImageWithQuotaFallback(image);
        rememberImage(imageId, image.dataUrl);
        return { mood, ok: true, imageId, prompt, name };
    }

    function reportExpressionProgress(onProgress, event) {
        if (typeof onProgress === 'function') onProgress(event);
    }

    // 一次写词拿回全部分，再按表情顺序串行出图。某一张失败不影响后面的。
    async function generateExpressionSet({ name, basePrompt, moods, dna, outfit, onProgress } = {}) {
        const labels = (Array.isArray(moods) ? moods : []).map((item) => String(item || '').trim()).filter(Boolean);
        if (!labels.length) return { ok: false, error: '没有表情分组' };
        if (!nai || typeof nai.writeDbgenPrompt !== 'function' || typeof nai.generateDbgenCaption !== 'function') {
            return { ok: false, error: '当前图像来源不能写表情差分' };
        }
        reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: labels.length });
        let written;
        try {
            written = await nai.writeDbgenPrompt({
                description: buildExpressionDiffDescription(name, basePrompt, labels, dna, outfit),
            });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '写提示词失败' };
        }
        if (!written || !written.ok) return { ok: false, error: (written && written.error) || '写提示词失败' };
        const captions = Array.isArray(written.captions) ? written.captions : [];
        const items = [];
        for (let i = 0; i < labels.length; i += 1) {
            reportExpressionProgress(onProgress, { phase: 'paint', done: i + 1, total: labels.length, mood: labels[i] });
            const slot = captions.find((item) => Number(item && item.slotId) === i + 1);
            const caption = slot && slot.caption;
            if (!caption) {
                items.push({ mood: labels[i], ok: false, error: '写提示词没有返回这一份' });
                continue;
            }
            items.push(await paintExpressionCaption(name, labels[i], caption));
        }
        return { ok: true, items };
    }

    // 失败槽重画：已有 caption 就只出这一张，不再写词。
    async function generateExpressionImage({ name, mood, caption, basePrompt, dna, outfit, onProgress } = {}) {
        const label = String(mood || '').trim();
        if (!label) return { ok: false, error: '没有表情' };
        if (caption) {
            reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: label });
            const item = await paintExpressionCaption(name, label, caption);
            return { ok: true, items: [item] };
        }
        return generateExpressionSet({ name, basePrompt, moods: [label], dna, outfit, onProgress });
    }

    function clothingCaption(prompt) {
        const text = String(prompt || '').trim();
        return {
            v4_prompt: { caption: { base_caption: text, char_captions: [] } },
            v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } },
        };
    }

    // 衣柜参考图：用已有服装提示词直接出图，不再写提示词。
    async function paintWardrobeReference({ prompt } = {}) {
        const text = String(prompt || '').trim();
        if (!text) return { ok: false, error: '这套衣服还没有提示词' };
        if (!nai || typeof nai.generateDbgenCaption !== 'function') return { ok: false, error: '当前图像来源不能出参考图' };
        const meta = expressionPaintMeta();
        let painted;
        try {
            painted = await nai.generateDbgenCaption({ ...meta, caption: clothingCaption(text) });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '出参考图失败' };
        }
        if (!painted || !painted.ok || !painted.dataUrl) return { ok: false, error: (painted && painted.error) || '出参考图失败' };
        const imageId = newId();
        const createdAt = now();
        const image = await buildSpriteImageRecord(imageId, painted.dataUrl, true, createdAt);
        const stored = normalizeStoredPrompt(painted.prompt) || { positive: text, negative: '' };
        if (stored) image.prompt = stored;
        await putImageWithQuotaFallback(image);
        rememberImage(imageId, image.dataUrl);
        return { ok: true, imageId };
    }

    async function writeWardrobePrompt({ character, outfit } = {}) {
        const name = String(character || '').trim();
        const clothes = String(outfit || '').trim();
        if (!clothes) return { ok: false, error: '没有待确认的服装' };
        if (!nai || typeof nai.writeDbgenPrompt !== 'function') return { ok: false, error: '当前图像来源不能写服装提示词' };
        let written;
        try {
            written = await nai.writeDbgenPrompt({ description: buildWardrobeClothingDescription(name, clothes) });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '写服装提示词失败' };
        }
        if (!written || !written.ok) return { ok: false, error: (written && written.error) || '写服装提示词失败' };
        const prompt = promptFromCaption(written.caption);
        const text = prompt && String(prompt.positive || '').trim();
        if (!text) return { ok: false, error: '写提示词没有返回服装标签' };
        return { ok: true, prompt: text };
    }

    async function getImagePrompt(id) {
        const key = String(id || '');
        if (!key || !store || typeof store.getImage !== 'function') return null;
        const record = await store.getImage(key);
        return normalizeStoredPrompt(record && record.prompt);
    }

    async function saveImagePrompt(id, prompt) {
        const key = String(id || '');
        const stored = normalizeStoredPrompt(prompt);
        if (!key || !stored) return { ok: false, error: '提示词是空的' };
        if (!store || typeof store.getImage !== 'function' || typeof store.putImage !== 'function') {
            return { ok: false, error: '提示词存不了' };
        }
        const record = await store.getImage(key);
        if (!record) return { ok: false, error: '找不到这张立绘' };
        await store.putImage({ ...record, prompt: stored });
        return { ok: true, prompt: stored };
    }

    return {
        processMessage, resolveUrl, tempBackground, tempSprite, listReview, listTemp, setStatus, deleteImages, getImageDataUrl, getImagePrompt, saveImagePrompt,
        generateExpressionSet, generateExpressionImage, writeWardrobePrompt, paintWardrobeReference,
        getEditableImage, saveMatteEdit,
        getRecord: (key) => currentTempRecords().get(key) || null,
        start() {
            if (offRendered) return;
            offRendered = messageHost.on('CHARACTER_MESSAGE_RENDERED', (messageId) => {
                void processMessage(Number(messageId));
            });
        },
        stop() {
            if (offRendered) { offRendered(); offRendered = null; }
        },
    };
}
