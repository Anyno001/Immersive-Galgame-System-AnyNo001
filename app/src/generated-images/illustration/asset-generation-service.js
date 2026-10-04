import { numberParagraphs } from './marker-placer.js';
import { buildAssetPlannerUserPrompt, parseAssetPlan, buildAssetSlot, buildDictionaryAssetItems } from './asset-prompt.js';
import { requestWithSoftRetry } from './prompt-kit.js';
import { normalizeAutoIllustrationSettings, isStrictBackgroundMatch } from './auto-illustration-settings.js';
import { cgSizeForMode } from './auto-illustration-service.js';
import { supportsNaiTransparentBackground } from '../request-builders/nai-v4-builder.js';
import { collectAssetNeeds, tempAssetKeyOf, GENERATED_ASSET_URL_PREFIX, generatedAssetIdOf, isGeneratedAssetUrl } from '../../scene/asset-match.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { GENERATED_IMAGE_SCHEMA_VERSION, isLegacyGeneratedImage, isQuotaError, normalizeGeneratedImageRecord } from '../../media/generated-asset-store.js';
import { buildCharacterAvatarDescription, buildCharacterSpriteDescription, buildDbgenAssetDescription, buildDbgenBackgroundBatchDescription, buildDbgenSpriteBatchDescription, buildExpressionDiffDescription, buildWardrobeClothingDescription, nsfwClothingBoostLine, applyCharacterDnaToCaption, applyLookToCaption, applyMoodToCaption, expressionLookTags, expressionPaintDna, expressionSpritePrompts, splitExpressionWriteBatches, splitWriteBatches, uprightSpriteCaption } from '../dbgen-prompt.js';
import { normalizeStoredPrompt, promptFromCaption } from '../generation-prompt.js';
import { sceneVariantCaption, sceneVariantTags } from '../scene-variant-tags.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { isCharacterDnaEmpty, resolveCharacterDna } from '../../scene/character-dna.js';

export const GENERATED_ASSET_UPDATED_EVENT = 'igs:generated-asset-updated';
const IMAGE_CACHE_LIMIT = 60;
// 正在显示的图不淘汰：一页缩略图超过上限时，按张数硬淘汰会把刚读回的图挤掉，
// 重绘后又缺图再读，循环闪「载入中」。近几秒内被取用过的图保留，离开页面后再按上限回收。
const IMAGE_IN_USE_MS = 5000;
const AVATAR_SIZE = '1024x1024';
// 头像按圆形裁切：只到头、颈、肩，脸占画面大半；胸以下一律进负面。
const AVATAR_POSITIVE = 'chibi, solo, portrait, head and shoulders, neck, face focus, close-up, large face, centered, looking at viewer, smile, simple background';
const AVATAR_NEGATIVE = 'upper body, cowboy shot, full body, lower body, waist, hips, midriff, navel, legs, feet, hands, arms, cleavage, multiple views, realistic, text, watermark, signature, frame, border';
// review：等待楼层结束时让用户处理；chat：用户选择仅本聊天使用；
// library：已加入素材库（由生成区条目接管）；discarded：丢弃。
const ACTIVE_TEMP_STATUSES = new Set(['review', 'chat']);

function randomSeed() {
    return Math.floor(Math.random() * 4294967295);
}

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
    const imageUsedAt = new Map();
    const clock = deps.clock || (() => Date.now());
    const pendingImages = new Set();
    // 设置页缩略图用 blob: 短地址：dataUrl 直接拼进 HTML 时一页几十 MB，重绘、开菜单都卡；
    // 短地址浏览器按地址缓存已解码的图，重绘不重载、不闪。
    const urlApi = deps.urlApi || globalThis.URL;
    const BlobCtor = deps.Blob || globalThis.Blob;
    const canThumbUrl = Boolean(urlApi && typeof urlApi.createObjectURL === 'function' && BlobCtor);
    const thumbUrls = new Map();
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

    // 场景背景补全与剧情 CG 用同一套横竖规则：手机内嵌/竖屏触屏把背景尺寸宽高对调。
    const backgroundSize = (s) => cgSizeForMode(
        s.auto.assets.backgroundSize,
        typeof deps.getReaderMode === 'function' ? deps.getReaderMode() : 'pc',
        typeof deps.getViewport === 'function' ? deps.getViewport() : null,
    );

    function emit(detail) {
        if (events && typeof events.emit === 'function') events.emit(GENERATED_ASSET_UPDATED_EVENT, detail);
    }

    function dropThumb(id) {
        const url = thumbUrls.get(id);
        if (!url) return;
        thumbUrls.delete(id);
        try { if (typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(url); } catch (error) { /* 已失效 */ }
    }

    function forgetImage(id) {
        images.delete(id);
        imageUsedAt.delete(id);
        dropThumb(id);
    }

    function touchImage(id, dataUrl) {
        if (images.get(id) !== dataUrl) dropThumb(id);
        images.delete(id);
        images.set(id, dataUrl);
        imageUsedAt.set(id, clock());
    }

    function rememberImage(id, dataUrl) {
        touchImage(id, dataUrl);
        const cutoff = clock() - IMAGE_IN_USE_MS;
        // Map 按取用先后排序，最旧的都还在用就说明整页都在用，停止淘汰。
        while (images.size > IMAGE_CACHE_LIMIT) {
            const oldest = images.keys().next().value;
            if ((imageUsedAt.get(oldest) || 0) > cutoff) break;
            forgetImage(oldest);
        }
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
        if (hit) {
            touchImage(id, hit);
            return hit;
        }
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

    function dataUrlToBlob(dataUrl) {
        const m = /^data:([^;,]+);base64,/i.exec(dataUrl);
        if (!m || typeof globalThis.atob !== 'function') return null;
        const bin = globalThis.atob(dataUrl.slice(m[0].length));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        return new BlobCtor([bytes], { type: m[1] });
    }

    // 设置页缩略图取图：返回 blob: 短地址，内存里已有图就当场转好，不多等一轮重绘；
    // 还没从存储读回返回空串，读回后发 image-loaded。环境不支持 blob 地址时退回 dataUrl。
    function resolveThumbUrl(url) {
        if (!isGeneratedAssetUrl(url) || !canThumbUrl) return resolveUrl(url);
        const id = generatedAssetIdOf(url);
        const dataUrl = images.get(id);
        if (!dataUrl) return resolveUrl(url);
        touchImage(id, dataUrl);
        let ready = thumbUrls.get(id);
        if (!ready) {
            let blob = null;
            try { blob = dataUrlToBlob(dataUrl); } catch (error) { blob = null; }
            if (!blob) return dataUrl;
            ready = urlApi.createObjectURL(blob);
            thumbUrls.set(id, ready);
        }
        return ready;
    }

    function matchContext(s, knownCharacters = []) {
        return {
            sceneAssets: s.sceneAssets,
            generatedAssets: s.sceneAssets.generated,
            strict: s.strict,
            tempBackground,
            tempSprite,
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
        // 智绘姬 / 柏宝绘出图不保证透明底：走它们时按浅灰底模板出图并抠图，不信任 NAI 模型的原生透明能力。
        // 数据库生图的立绘默认要透明底，不看沉浸式插件自己填的 NAI 模型。
        const plannedVia = nai && typeof nai.describe === 'function' ? nai.describe().via : 'nai';
        const transparent = isSprite && plannedVia !== 'chatu8' && plannedVia !== 'baibai'
            && (plannedVia === 'dbgen' || supportsNaiTransparentBackground(s.auto.nai.model));
        const slot = buildAssetSlot(item, { transparent, templates: s.auto.assets.templates });
        const size = isSprite ? s.auto.assets.spriteSize : backgroundSize(s);
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

    // 数据库生图：本楼缺的背景一次写完，跳过召回。已入库或本聊天已有的不在这份名单里。
    async function generateBackgroundBatch(items, s, floor, floorKey) {
        const needs = items.map((item) => item.need);
        let written;
        try {
            written = await nai.writeDbgenPrompt({
                description: buildDbgenBackgroundBatchDescription(needs),
                messageId: floor.messageId,
            });
        } catch (error) {
            written = { ok: false, error: `写提示词失败：${(error && error.message) || error}` };
        }
        const captions = written && written.ok && Array.isArray(written.captions)
            ? written.captions.slice().sort((a, b) => (Number(a.slotId) || 0) - (Number(b.slotId) || 0))
            : [];
        const records = [];
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            const caption = captions[index] && captions[index].caption;
            const slot = buildAssetSlot(item, { transparent: false, templates: s.auto.assets.templates });
            let result;
            if (!caption) {
                result = { ok: false, error: written && written.error ? written.error : '没有对应的背景提示词' };
            } else {
                try {
                    result = await nai.generateDbgenCaption({
                        caption,
                        size: backgroundSize(s),
                        messageId: floor.messageId,
                        userPrompts: { positive: slot.scene, negative: slot.sceneUc },
                    });
                } catch (error) {
                    result = { ok: false, error: `NAI 生成失败：${(error && error.message) || error}` };
                }
            }
            const key = tempAssetKeyOf(floor.chatId, item.need);
            const base = {
                key, chatId: floor.chatId, floorKey, messageId: floor.messageId, swipeId: floor.swipeId,
                type: item.need.type, name: item.need.name, time: item.need.time || '', weather: item.need.weather || '',
                tags: item.tags, createdAt: now(),
            };
            let record;
            if (result && result.ok && result.dataUrl) {
                const imageId = newId();
                const image = { id: imageId, dataUrl: result.dataUrl, type: item.need.type, createdAt: base.createdAt };
                const prompt = normalizeStoredPrompt(result.prompt);
                if (prompt) image.prompt = prompt;
                await store.putImage(image);
                rememberImage(imageId, image.dataUrl);
                record = { ...base, imageId, status: 'review' };
            } else {
                record = { ...base, imageId: '', status: 'failed', error: (result && result.error) || 'NAI 生成失败' };
                report('error', `素材「${item.need.name}」生成失败：${record.error}`);
            }
            await store.putAsset(record);
            if (tempChatId === floor.chatId) tempRecords.set(key, record);
            emit({ chatId: floor.chatId, messageId: floor.messageId, swipeId: floor.swipeId, key, reason: 'generated' });
            records.push(record);
        }
        return records;
    }

    // 数据库生图：本楼缺的立绘一次写完，再按份出图。超过 8 张均分成两批，一批写完并出完再写下一批。
    async function generateSpriteBatch(items, s, floor, floorKey) {
        const records = [];
        let stopError = '';
        const putSpriteRecord = async (item, result) => {
            const key = tempAssetKeyOf(floor.chatId, item.need);
            const base = {
                key, chatId: floor.chatId, floorKey, messageId: floor.messageId, swipeId: floor.swipeId,
                type: item.need.type, name: item.need.name, time: item.need.time || '', weather: item.need.weather || '',
                tags: item.tags, createdAt: now(),
            };
            let record;
            if (result && result.ok && result.dataUrl) {
                const imageId = newId();
                const image = await buildSpriteImageRecord(imageId, result.dataUrl, true, base.createdAt);
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
        };
        for (const batch of splitWriteBatches(items)) {
            if (stopError) {
                for (const item of batch) records.push(await putSpriteRecord(item, { ok: false, error: stopError }));
                continue;
            }
            let written;
            try {
                written = await nai.writeDbgenPrompt({
                    description: buildDbgenSpriteBatchDescription(batch.map((item) => item.need)),
                    messageId: floor.messageId,
                });
            } catch (error) {
                written = { ok: false, error: `写提示词失败：${(error && error.message) || error}` };
            }
            const captions = written && written.ok && Array.isArray(written.captions) ? written.captions : [];
            if (!written || !written.ok) {
                stopError = written && written.error ? written.error : '写提示词失败';
                for (const item of batch) records.push(await putSpriteRecord(item, { ok: false, error: stopError }));
                continue;
            }
            for (let index = 0; index < batch.length; index += 1) {
                const item = batch[index];
                const found = captions.find((entry) => Number(entry.slotId) === index + 1);
                const caption = found && found.caption;
                const slot = buildAssetSlot(item, { transparent: true, templates: s.auto.assets.templates });
                const prompts = expressionSpritePrompts(slot.scene, slot.sceneUc);
                let result;
                if (!caption) {
                    result = { ok: false, error: '没有对应的立绘提示词' };
                } else {
                    try {
                        result = await nai.generateDbgenCaption({
                            caption: applyCharacterDnaToCaption(caption, item.need && item.need.dna),
                            size: s.auto.assets.spriteSize,
                            messageId: floor.messageId,
                            transparent: true,
                            userPrompts: { positive: prompts.positive, negative: prompts.negative },
                        });
                    } catch (error) {
                        result = { ok: false, error: `NAI 生成失败：${(error && error.message) || error}` };
                    }
                }
                records.push(await putSpriteRecord(item, result));
            }
        }
        return records;
    }

    async function run(messageId, floor, key, s, manual) {
        // 失败或中途刷新残留的 planning 不算处理完，下次渲染时重试。
        const previous = await store.getFloor(key);
        if (!manual && previous && previous.status === 'done') return { ok: true, reason: 'already-decided' };
        await loadTempRecords(floor.chatId);
        const numbered = numberParagraphs(floor.text);
        const match = matchContext(
            s,
            messageHost.getCharacterNames ? messageHost.getCharacterNames() : [],
        );
        // 背景按本楼实际缺的张数生成，不跟立绘共用每层上限。已生成的在匹配时剔掉。
        const backgroundNeeds = s.auto.assets.backgroundEnabled
            ? collectAssetNeeds({ scenes: numbered.scenes, characters: [] }, match, { background: true, sprite: false })
            : [];
        const spriteNeeds = s.auto.assets.spriteEnabled
            ? collectAssetNeeds({ scenes: [], characters: numbered.characters }, match, { background: false, sprite: true, limit: s.auto.assets.maxPerFloor })
            : [];
        const needs = [...backgroundNeeds, ...spriteNeeds];
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
        const backgrounds = plan.items.filter((item) => item.need && item.need.type === 'background');
        const sprites = plan.items.filter((item) => item.need && item.need.type === 'sprite');
        const batchBackgrounds = backend.ownPrompts && backgrounds.length && nai && typeof nai.writeDbgenPrompt === 'function';
        const batchSprites = backend.ownPrompts && sprites.length && nai && typeof nai.writeDbgenPrompt === 'function';
        const queue = plan.items.filter((item) => {
            if (batchBackgrounds && item.need && item.need.type === 'background') return false;
            if (batchSprites && item.need && item.need.type === 'sprite') return false;
            return true;
        });
        if (batchBackgrounds) {
            for (const record of await generateBackgroundBatch(backgrounds, s, floor, key)) {
                if (record.status === 'review') count += 1;
                else errors.push(`「${record.name}」${record.error}`);
            }
        }
        if (batchSprites) {
            for (const record of await generateSpriteBatch(sprites, s, floor, key)) {
                if (record.status === 'review') count += 1;
                else errors.push(`「${record.name}」${record.error}`);
            }
        }
        for (const item of queue) {
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
            forgetImage(record.imageId);
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
        let failed = false;
        for (const id of ids || []) {
            try {
                await store.deleteImage(id);
                forgetImage(id);
            } catch (error) { failed = true; }
        }
        return failed ? { ok: false, reason: 'image-delete-failed' } : { ok: true };
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

    // 透明底只信数据库生图与支持原生透明的 NAI 模型；智绘姬 / 柏宝绘 / 其余 NAI 模型按浅灰底出图再抠图。
    function expressionPaintMeta() {
        const s = readSettings();
        const via = nai && typeof nai.describe === 'function' ? nai.describe().via : 'nai';
        const transparent = via === 'dbgen' || (via === 'nai' && supportsNaiTransparentBackground(s.auto.nai.model));
        const slot = buildAssetSlot(
            { need: { type: 'sprite', name: '' }, tags: '', uc: '' },
            { transparent, templates: s.auto.assets.templates },
        );
        const prompts = expressionSpritePrompts(slot.scene, slot.sceneUc);
        return {
            size: s.auto.assets.spriteSize,
            userPrompts: { positive: prompts.positive, negative: prompts.negative },
            transparent,
        };
    }

    // 标签顺序：DNA → 表情 → 衣服与长相 → 写词结果。
    async function paintExpressionCaption(name, mood, caption, dna, { look = '', seed, nsfw = false } = {}) {
        const upright = uprightSpriteCaption(applyCharacterDnaToCaption(applyMoodToCaption(applyLookToCaption(caption, look), mood, { nsfw }), dna)) || caption;
        const meta = expressionPaintMeta();
        let painted;
        try {
            painted = await nai.generateDbgenCaption({ ...meta, caption: upright, ...(seed != null && { seed }) });
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
        const image = await buildSpriteImageRecord(imageId, painted.dataUrl, meta.transparent, createdAt);
        const prompt = normalizeStoredPrompt(painted.prompt) || promptFromCaption(upright);
        if (prompt) image.prompt = prompt;
        await putImageWithQuotaFallback(image);
        rememberImage(imageId, image.dataUrl);
        return { mood, ok: true, imageId, prompt, name };
    }

    function reportExpressionProgress(onProgress, event) {
        if (typeof onProgress === 'function') onProgress(event);
    }

    // 按 9 张分批写词：不超过 9 张一次写完，超过 9 张平分 2 批，超过 18 张平分 3 批。
    // 一批写完并逐张出完，再写下一批；某一张失败不影响后面的。
    // 插件少给某几份时只在这一批里补写；signal 中止后已画好的图保留，还没写的批不再写。
    // 一次点击里各批共用一颗新种子：衣服、画风接近；删掉重来、补画都是新种子，不会画回旧图。
    async function generateExpressionSet({ name, basePrompt, moods, dna, outfit, note, nsfw, onProgress, signal } = {}) {
        const labels = (Array.isArray(moods) ? moods : []).map((item) => String(item || '').trim()).filter(Boolean);
        if (!labels.length) return { ok: false, error: '没有表情分组' };
        if (!nai || typeof nai.writeDbgenPrompt !== 'function' || typeof nai.generateDbgenCaption !== 'function') {
            return { ok: false, error: '当前图像来源不能写表情差分' };
        }
        const paint = {
            look: expressionLookTags(basePrompt, outfit),
            seed: randomSeed(),
            nsfw: nsfw === true,
        };
        const paintDna = expressionPaintDna(dna, outfit);
        const stopped = () => Boolean(signal && signal.aborted);
        const items = [];
        let painted = 0;
        let writeError = '';
        for (const batch of splitExpressionWriteBatches(labels)) {
            if (stopped()) break;
            if (writeError) {
                for (const mood of batch) items.push({ mood, ok: false, error: writeError });
                continue;
            }
            let pending = batch.slice();
            // 每一批最多两轮：第一轮写这一批，第二轮只补插件漏掉的那几份。
            for (let round = 0; round < 2 && pending.length; round += 1) {
                if (stopped()) break;
                reportExpressionProgress(onProgress, { phase: 'write', done: painted, total: labels.length });
                let written;
                try {
                    written = await nai.writeDbgenPrompt({
                        description: buildExpressionDiffDescription(name, basePrompt, pending, dna, outfit, { note, nsfw: paint.nsfw }),
                    });
                } catch (error) {
                    const message = (error && error.message) || '写提示词失败';
                    if (!items.length) return { ok: false, error: message };
                    for (const mood of pending) items.push({ mood, ok: false, error: message });
                    writeError = message;
                    break;
                }
                if (!written || !written.ok) {
                    const message = (written && written.error) || '写提示词失败';
                    if (!items.length) return { ok: false, error: message };
                    for (const mood of pending) items.push({ mood, ok: false, error: message });
                    writeError = message;
                    break;
                }
                const captions = Array.isArray(written.captions) ? written.captions : [];
                const missing = [];
                for (let i = 0; i < pending.length; i += 1) {
                    if (stopped()) {
                        // 词已经写好的带上，存成注记，之后「继续生图」不用重写。
                        for (let j = i; j < pending.length; j += 1) {
                            const left = captions.find((item) => Number(item && item.slotId) === j + 1);
                            items.push({ mood: pending[j], ok: false, error: '已停止', ...(left && left.caption && { caption: left.caption }) });
                        }
                        pending = [];
                        break;
                    }
                    painted += 1;
                    reportExpressionProgress(onProgress, { phase: 'paint', done: painted, total: labels.length, mood: pending[i] });
                    const slot = captions.find((item) => Number(item && item.slotId) === i + 1);
                    const caption = slot && slot.caption;
                    if (!caption) {
                        missing.push(pending[i]);
                        items.push({ mood: pending[i], ok: false, error: '写提示词没有返回这一份' });
                        continue;
                    }
                    const result = await paintExpressionCaption(name, pending[i], caption, paintDna, paint);
                    items.push(result);
                }
                pending = round === 0 ? missing : [];
            }
        }
        return { ok: true, items, stopped: stopped() };
    }

    // 继续生图：词已经写好（停下、超时、出图失败留下的），直接按存下的词出图，不重写；这一批共用一颗新种子。
    async function paintExpressionCaptions({ name, items, basePrompt, dna, outfit, nsfw, onProgress, signal } = {}) {
        const list = (Array.isArray(items) ? items : []).filter((item) => item && item.mood && item.caption);
        if (!list.length) return { ok: false, error: '没有写好词、还没出图的表情' };
        if (!nai || typeof nai.generateDbgenCaption !== 'function') return { ok: false, error: '当前图像来源不能出图' };
        const paint = { look: expressionLookTags(basePrompt, outfit), seed: randomSeed(), nsfw: nsfw === true };
        const paintDna = expressionPaintDna(dna, outfit);
        const stopped = () => Boolean(signal && signal.aborted);
        const results = [];
        for (let i = 0; i < list.length; i += 1) {
            const { mood, caption } = list[i];
            if (stopped()) {
                results.push({ mood, ok: false, error: '已停止', caption });
                continue;
            }
            reportExpressionProgress(onProgress, { phase: 'paint', done: i + 1, total: list.length, mood });
            results.push(await paintExpressionCaption(name, mood, caption, paintDna, paint));
        }
        return { ok: true, items: results, stopped: stopped() };
    }

    // 单张重画：有这一格的提示词就不再写词（写词要等插件的模型，单张也得几十秒），
    // 直接叠上当前的表情、衣服、DNA 硬合再出图；显式换一颗随机种子——不传种子时插件用自己的配置，固定种子会画出同一张。
    async function generateExpressionImage({ name, mood, caption, basePrompt, dna, outfit, note, nsfw, onProgress } = {}) {
        const label = String(mood || '').trim();
        if (!label) return { ok: false, error: '没有表情' };
        if (caption) {
            reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: label });
            const look = expressionLookTags(basePrompt, outfit);
            const item = await paintExpressionCaption(name, label, caption, expressionPaintDna(dna, outfit), { look, seed: randomSeed(), nsfw: nsfw === true });
            return { ok: true, items: [item] };
        }
        return generateExpressionSet({ name, basePrompt, moods: [label], dna, outfit, note, nsfw, onProgress });
    }

    // 场景时间/天气差分：读场景原图存下的提示词，换上目标时间天气标签直接出图，不写词。
    // 一次点击的一批共用一颗新种子，构图尽量接近；signal 中止后已出的图保留。
    async function generateSceneVariants({ baseImageId, scene, variants, onProgress, signal } = {}) {
        const list = (Array.isArray(variants) ? variants : []).filter((item) => item && (item.time || item.weather));
        if (!list.length) return { ok: false, error: '没有要画的时间/天气' };
        if (!nai || typeof nai.generateDbgenCaption !== 'function') return { ok: false, error: '当前图像来源不能出图' };
        const stored = await getImagePrompt(baseImageId);
        if (!stored) return { ok: false, error: '场景原图没有存提示词' };
        const s = readSettings();
        const seed = randomSeed();
        const items = [];
        for (let i = 0; i < list.length; i += 1) {
            const { time = '', weather = '' } = list[i];
            const label = [time, weather].filter(Boolean).join('·');
            if (signal && signal.aborted) {
                items.push({ time, weather, ok: false, error: '已停止' });
                continue;
            }
            reportExpressionProgress(onProgress, { phase: 'paint', done: i + 1, total: list.length, mood: label });
            const caption = sceneVariantCaption(stored, sceneVariantTags(time, weather));
            if (!caption) {
                items.push({ time, weather, ok: false, error: '场景原图的提示词是空的' });
                continue;
            }
            let painted;
            try {
                painted = await nai.generateDbgenCaption({ caption, size: backgroundSize(s), seed });
            } catch (error) {
                painted = { ok: false, error: (error && error.message) || '出图失败' };
            }
            if (!painted || !painted.ok || !painted.dataUrl) {
                items.push({ time, weather, ok: false, error: (painted && painted.error) || '出图失败' });
                continue;
            }
            const imageId = newId();
            const image = { id: imageId, dataUrl: painted.dataUrl, type: 'background', createdAt: now() };
            const prompt = normalizeStoredPrompt(painted.prompt) || promptFromCaption(caption);
            if (prompt) image.prompt = prompt;
            await putImageWithQuotaFallback(image);
            rememberImage(imageId, image.dataUrl);
            items.push({ time, weather, ok: true, imageId, scene });
        }
        return { ok: items.some((item) => item.ok), items, stopped: Boolean(signal && signal.aborted), error: (items.find((item) => !item.ok) || {}).error || '' };
    }

    // 状态栏头像：Q 版大头，方图、不抠图，直接把图交回去，由设置页缩小后存进头像。
    async function generateCharacterAvatar({ name, dna, onProgress } = {}) {
        const who = String(name || '').trim();
        if (!who) return { ok: false, error: '没有角色' };
        if (!nai || typeof nai.writeDbgenPrompt !== 'function' || typeof nai.generateDbgenCaption !== 'function') {
            return { ok: false, error: '当前图像来源不能生成头像' };
        }
        reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: 1, mood: '头像' });
        let written;
        try {
            written = await nai.writeDbgenPrompt({ description: buildCharacterAvatarDescription(who, dna) });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '写提示词失败' };
        }
        if (!written || !written.ok || !written.caption) {
            return { ok: false, error: (written && written.error) || '写提示词失败' };
        }
        reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: '头像' });
        let painted;
        try {
            painted = await nai.generateDbgenCaption({
                caption: applyCharacterDnaToCaption(written.caption, dna),
                size: AVATAR_SIZE,
                userPrompts: { positive: AVATAR_POSITIVE, negative: AVATAR_NEGATIVE },
            });
        } catch (error) {
            painted = { ok: false, error: (error && error.message) || '出图失败' };
        }
        if (!painted || !painted.ok || !painted.dataUrl) return { ok: false, error: (painted && painted.error) || '出图失败' };
        return { ok: true, dataUrl: painted.dataUrl };
    }

    // 设置页主动出一张默认立绘：写一份提示词，再出图。不经过楼内补图。
    async function generateCharacterSprite({ name, dna, nude = false, onProgress } = {}) {
        const who = String(name || '').trim();
        if (!who) return { ok: false, error: '没有角色' };
        const backend = nai && typeof nai.describe === 'function' ? nai.describe() : null;
        if (!nude && backend && backend.mode && backend.mode !== 'dbgen') {
            if (backend.ready && !backend.ready.ok) return { ok: false, error: backend.ready.error || '图像来源不可用' };
            if (typeof nai.generate !== 'function') return { ok: false, error: '当前图像来源不能生成立绘' };
            const s = readSettings();
            const transparent = backend.via !== 'chatu8' && supportsNaiTransparentBackground(s.auto.nai.model);
            const slot = buildAssetSlot({ need: { type: 'sprite', name: who, dna }, tags: '', uc: '' }, {
                transparent, templates: s.auto.assets.templates,
            });
            reportExpressionProgress(onProgress, { phase: 'paint', done: 0, total: 1, mood: '默认' });
            let painted;
            try {
                painted = await nai.generate(slot, { ...s.auto.nai, size: s.auto.assets.spriteSize });
            } catch (error) {
                return { ok: false, error: (error && error.message) || '出图失败' };
            }
            if (!painted || !painted.ok || !painted.dataUrl) {
                return { ok: false, error: (painted && painted.error) || '出图失败' };
            }
            try {
                const imageId = newId();
                const createdAt = now();
                const image = await buildSpriteImageRecord(imageId, painted.dataUrl, transparent, createdAt);
                const prompt = normalizeStoredPrompt(painted.prompt);
                if (prompt) image.prompt = prompt;
                await putImageWithQuotaFallback(image);
                rememberImage(imageId, image.dataUrl);
                return { ok: true, imageId, prompt };
            } catch (error) {
                return { ok: false, error: (error && error.message) || '立绘保存失败' };
            }
        }
        if (!nai || typeof nai.writeDbgenPrompt !== 'function' || typeof nai.generateDbgenCaption !== 'function') {
            return { ok: false, error: '当前图像来源不能写立绘' };
        }
        reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: 1, mood: '默认' });
        let written;
        try {
            written = await nai.writeDbgenPrompt({ description: buildCharacterSpriteDescription(who, dna, { nude: nude === true }) });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '写提示词失败' };
        }
        if (!written || !written.ok || !written.caption) {
            return { ok: false, error: (written && written.error) || '写提示词失败' };
        }
        reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: '默认' });
        const painted = await paintExpressionCaption(who, '默认', written.caption, dna);
        if (!painted.ok) return { ok: false, error: painted.error || '出图失败', prompt: painted.prompt };
        return { ok: true, imageId: painted.imageId, prompt: painted.prompt };
    }

    function clothingCaption(prompt, { nsfwBoost = false } = {}) {
        const text = String(prompt || '').trim();
        const boost = nsfwBoost ? nsfwClothingBoostLine('clothes') : '';
        return {
            v4_prompt: { caption: { base_caption: [text, boost].filter(Boolean).join('\n'), char_captions: [] } },
            v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } },
        };
    }

    // 衣柜参考图：用已有服装提示词直接出图，不再写提示词。
    async function paintWardrobeReference({ prompt, nsfwBoost = false } = {}) {
        const text = String(prompt || '').trim();
        if (!text) return { ok: false, error: '这套衣服还没有提示词' };
        if (!nai || typeof nai.generateDbgenCaption !== 'function') return { ok: false, error: '当前图像来源不能出参考图' };
        const meta = expressionPaintMeta();
        let painted;
        try {
            painted = await nai.generateDbgenCaption({ ...meta, caption: clothingCaption(text, { nsfwBoost }) });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '出参考图失败' };
        }
        if (!painted || !painted.ok || !painted.dataUrl) return { ok: false, error: (painted && painted.error) || '出参考图失败' };
        const imageId = newId();
        const createdAt = now();
        const image = await buildSpriteImageRecord(imageId, painted.dataUrl, meta.transparent, createdAt);
        const stored = normalizeStoredPrompt(painted.prompt) || { positive: text, negative: '' };
        if (stored) image.prompt = stored;
        await putImageWithQuotaFallback(image);
        rememberImage(imageId, image.dataUrl);
        return { ok: true, imageId };
    }

    async function writeWardrobePrompt({ character, outfit, nsfwBoost = false } = {}) {
        const name = String(character || '').trim();
        const clothes = String(outfit || '').trim();
        if (!clothes) return { ok: false, error: '没有待确认的服装' };
        if (!nai || typeof nai.writeDbgenPrompt !== 'function') return { ok: false, error: '当前图像来源不能写服装提示词' };
        let written;
        try {
            written = await nai.writeDbgenPrompt({ description: buildWardrobeClothingDescription(name, clothes, { nsfwBoost }) });
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

    async function readStoredImage(id) {
        const key = String(id || '');
        if (!key || !store || typeof store.getImage !== 'function') return null;
        const record = normalizeGeneratedImageRecord(await store.getImage(key));
        return record ? JSON.parse(JSON.stringify(record)) : null;
    }

    async function importAssetImage(dataUrl, type) {
        if (!['sprite', 'background'].includes(type) || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(String(dataUrl || ''))) {
            return { ok: false, error: '图片格式不受支持' };
        }
        const imageId = newId();
        const createdAt = now();
        const record = type === 'sprite'
            ? { schemaVersion: GENERATED_IMAGE_SCHEMA_VERSION, id: imageId, type, dataUrl, originalDataUrl: dataUrl, workingDataUrl: '', alphaMaskDataUrl: '', revision: 1, createdAt, updatedAt: createdAt }
            : { id: imageId, type, dataUrl, createdAt };
        try {
            await store.putImage(record);
        } catch (error) {
            return { ok: false, error: isQuotaError(error) ? '图片存储空间不足' : ((error && error.message) || '图片保存失败') };
        }
        rememberImage(imageId, dataUrl);
        return { ok: true, imageId };
    }

    async function writeStoredImage(record) {
        const image = record && typeof record === 'object' ? record : null;
        const key = image && String(image.id || '');
        if (!key || !store || typeof store.putImage !== 'function') return { ok: false, error: '图片存不了' };
        const stored = { ...image, id: key };
        await store.putImage(stored);
        if (stored.dataUrl) rememberImage(key, stored.dataUrl);
        return { ok: true };
    }

    return {
        processMessage, resolveUrl, resolveThumbUrl, tempBackground, tempSprite, listReview, listTemp, setStatus, deleteImages, getImageDataUrl, getImagePrompt, saveImagePrompt, readStoredImage, writeStoredImage, importAssetImage,
        generateExpressionSet, generateExpressionImage, paintExpressionCaptions, generateSceneVariants, generateCharacterSprite, generateCharacterAvatar, writeWardrobePrompt, paintWardrobeReference,
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
