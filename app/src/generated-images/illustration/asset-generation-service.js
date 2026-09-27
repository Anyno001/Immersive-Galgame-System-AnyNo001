import { numberParagraphs } from './marker-placer.js';
import { buildAssetPlannerUserPrompt, parseAssetPlan, buildAssetSlot, buildDictionaryAssetItems } from './asset-prompt.js';
import { requestWithSoftRetry } from './prompt-kit.js';
import { normalizeAutoIllustrationSettings, isStrictBackgroundMatch } from './auto-illustration-settings.js';
import { supportsNaiTransparentBackground } from '../request-builders/nai-v4-builder.js';
import { collectAssetNeeds, tempAssetKeyOf, GENERATED_ASSET_URL_PREFIX, generatedAssetIdOf, isGeneratedAssetUrl } from '../../scene/asset-match.js';
import { floorKeyOf } from '../../media/illustration-store.js';

export const GENERATED_ASSET_UPDATED_EVENT = 'igs:generated-asset-updated';
const IMAGE_CACHE_LIMIT = 60;
// review：等待楼层结束时让用户处理；chat：用户选择仅本聊天使用；
// library：已加入素材库（由生成区条目接管）；discarded：丢弃。
const ACTIVE_TEMP_STATUSES = new Set(['review', 'chat']);

function toReadableText(raw) {
    return numberParagraphs(raw).paragraphs.map((p) => p.text).join('\n');
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

    function matchContext(s, userName) {
        return {
            sceneAssets: s.sceneAssets,
            generatedAssets: s.sceneAssets.generated,
            strict: s.strict,
            tempBackground,
            tempSprite,
            userName,
        };
    }

    async function generateItem(item, s, floor, floorKey) {
        const isSprite = item.need.type === 'sprite';
        const transparent = isSprite && supportsNaiTransparentBackground(s.auto.nai.model);
        const slot = buildAssetSlot(item, { transparent, templates: s.auto.assets.templates });
        const size = isSprite ? s.auto.assets.spriteSize : s.auto.assets.backgroundSize;
        let result;
        try { result = await nai.generate(slot, { ...s.auto.nai, size }); } catch (error) { result = { ok: false, error: `NAI 生成失败：${(error && error.message) || error}` }; }
        const key = tempAssetKeyOf(floor.chatId, item.need);
        const base = {
            key, chatId: floor.chatId, floorKey, messageId: floor.messageId, swipeId: floor.swipeId,
            type: item.need.type, name: item.need.name, time: item.need.time || '', weather: item.need.weather || '',
            tags: item.tags, createdAt: now(),
        };
        let record;
        if (result && result.ok && result.dataUrl) {
            const dataUrl = isSprite ? await matte(result.dataUrl, { alreadyTransparent: transparent }) : result.dataUrl;
            const imageId = newId();
            await store.putImage({ id: imageId, dataUrl, type: item.need.type, createdAt: base.createdAt });
            rememberImage(imageId, dataUrl);
            record = { ...base, imageId, status: 'review' };
        } else {
            record = { ...base, imageId: '', status: 'failed', error: (result && result.error) || 'NAI 生成失败' };
            report('error', `素材「${item.need.name}」生成失败：${record.error}`);
        }
        await store.putAsset(record);
        if (tempChatId === floor.chatId) tempRecords.set(key, record);
        emit({ chatId: floor.chatId, messageId: floor.messageId, swipeId: floor.swipeId, key, reason: 'generated' });
        return record;
    }

    async function run(messageId, floor, key, s) {
        // 失败或中途刷新残留的 planning 不算处理完，下次渲染时重试。
        const previous = await store.getFloor(key);
        if (previous && previous.status === 'done') return { ok: true, reason: 'already-decided' };
        await loadTempRecords(floor.chatId);
        const numbered = numberParagraphs(floor.text);
        const needs = collectAssetNeeds(
            { scenes: numbered.scenes, characters: numbered.characters },
            matchContext(s, messageHost.getUserName ? messageHost.getUserName() : ''),
            { background: s.auto.assets.backgroundEnabled, sprite: s.auto.assets.spriteEnabled, limit: s.auto.assets.maxPerFloor },
        );
        if (!needs.length) {
            await store.putFloor(key, { status: 'done', count: 0, updatedAt: now() });
            return { ok: true, reason: 'nothing-missing' };
        }
        await store.putFloor(key, { status: 'planning', updatedAt: now() });
        report('info', `第 ${messageId} 楼缺少 ${needs.length} 项素材，正在请求副 LLM…`);
        let plan;
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
        for (const item of plan.items) {
            const record = await generateItem(item, s, floor, key);
            if (record.status === 'review') count += 1;
        }
        await store.putFloor(key, { status: 'done', count, updatedAt: now() });
        if (count) report('success', `第 ${messageId} 楼已生成 ${count} 项素材，待确认`);
        return { ok: true, reason: 'done', count };
    }

    async function processMessage(messageId) {
        const s = readSettings();
        if (!s.auto.assets.spriteEnabled && !s.auto.assets.backgroundEnabled) return { ok: true, reason: 'disabled' };
        if (!s.sceneAssets.enabled) return { ok: true, reason: 'scene-assets-disabled' };
        const floor = messageHost.readFloor(messageId);
        if (!floor || !floor.isAi || !floor.isLatest || !floor.chatId || !floor.text.trim()) {
            return { ok: true, reason: 'not-eligible' };
        }
        const key = floorKeyOf(floor);
        if (locks.has(key)) return locks.get(key);
        const job = run(Number(messageId), floor, key, s)
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
        for (const id of ids || []) {
            images.delete(id);
            try { await store.deleteImage(id); } catch (error) { /* 图片已不存在时忽略 */ }
        }
    }

    return {
        processMessage, resolveUrl, tempBackground, tempSprite, listReview, listTemp, setStatus, deleteImages,
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
