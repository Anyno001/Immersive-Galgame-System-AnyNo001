import { requireMediaCache } from '../../media/media-cache-owner.js';
import { createAssetRecordCache } from '../../media/asset-record-cache.js';
import { IMAGE_FIELDS, isImageData } from '../../media/image-identity.js';
import { numberParagraphs } from './marker-placer.js';
import { MIN_AUTO_IMAGE_BODY_CHARS, floorBodyLength } from './floor-body-length.js';
import { buildAssetPlannerUserPrompt, parseAssetPlan, buildAssetSlot, buildDictionaryAssetItems } from './asset-prompt.js';
import { requestWithSoftRetry } from './prompt-kit.js';
import { normalizeAutoIllustrationSettings, isStrictBackgroundMatch } from './auto-illustration-settings.js';
import { cgSizeForMode } from './auto-illustration-service.js';
import { supportsNaiTransparentBackground } from '../request-builders/nai-v4-builder.js';
import { collectAssetNeeds, tempAssetKeyOf, GENERATED_ASSET_URL_PREFIX, generatedAssetIdOf, isGeneratedAssetUrl } from '../../scene/asset-match.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { GENERATED_IMAGE_SCHEMA_VERSION, isLegacyGeneratedImage, isQuotaError, normalizeGeneratedImageRecord } from '../../media/generated-asset-store.js';
import { buildCharacterAvatarDescription, buildCharacterSpriteDescription, buildDbgenAssetDescription, buildDbgenBackgroundBatchDescription, buildDbgenSpriteBatchDescription, buildExpressionDiffDescription, buildWardrobeClothingDescription, nsfwClothingBoostLine, applyCharacterDnaToCaption, expressionSpritePrompts, splitExpressionWriteBatches, splitWriteBatches, uprightSpriteCaption } from '../dbgen-prompt.js';
import { normalizeStoredPrompt, promptFromCaption } from '../generation-prompt.js';
import { promptTimeBucket, sceneVariantCaption, sceneVariantTags } from '../scene-variant-tags.js';
import { sceneTimeBucket } from '../../scene/time-bucket.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { isCharacterDnaEmpty, resolveCharacterDna } from '../../scene/character-dna.js';
import { BUILTIN_PROMPTS } from '../prompt-registry.js';

export const GENERATED_ASSET_UPDATED_EVENT = 'igs:generated-asset-updated';
const AVATAR_SIZE = '1024x1024';
// 头像按圆形裁切：只到头、颈、肩，脸占画面大半；胸以下一律进负面。
const AVATAR_POSITIVE = BUILTIN_PROMPTS.avatar.positive;
const AVATAR_NEGATIVE = BUILTIN_PROMPTS.avatar.negative;
// review：等待楼层结束时让用户处理；chat：用户选择仅本聊天使用；
// library：已加入素材库（由生成区条目接管）；discarded：丢弃。
const ACTIVE_TEMP_STATUSES = new Set(['review', 'chat']);
// 清晨、黄昏、夜晚算非白天；认不出的时间不动，保持原来的直接生成。
const isOffDayTime = (time) => { const bucket = sceneTimeBucket(time); return Boolean(bucket) && bucket !== '白天'; };

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
    const minBodyChars = Number.isFinite(Number(deps.minBodyChars)) ? Number(deps.minBodyChars) : MIN_AUTO_IMAGE_BODY_CHARS;
    const sourceFilter = typeof deps.getSourceFilter === 'function' ? deps.getSourceFilter : () => undefined;
    const report = deps.report || (() => {});
    const newId = deps.newId || (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    const locks = new Map();
    // 同一地点的白天底图只画一次：跨楼并发时后到的等先到的画完再取。
    const dayBasePending = new Map();
    const cache = requireMediaCache(deps.mediaCache, 'asset-generation', deps.thumbStore?.mediaCache);
    const pendingImages = new Set();
    const imageTickets = new Map();
    const failedImages = cache.auxiliary.createMap('asset-image-failures');
    const thumbStore = deps.thumbStore || null;
    const makeThumb = typeof deps.makeThumb === 'function' ? deps.makeThumb : null;
    const smallThumbs = Boolean(thumbStore && makeThumb);
    const pendingThumbs = new Set();
    const imageKey = id => `asset:${id}`;
    const thumbKey = id => `thumb:asset:${id}`;
    let tempCursor = {}, retryTarget = null;
    const tempCache = createAssetRecordCache({ store, mediaCache: cache, owner: 'asset-records',
        onChanged: chatId => emit({ chatId, reason: 'hydrated' }),
        onClear: () => { pendingImages.clear(); failedImages.clear(); pendingThumbs.clear(); tempCursor = {}; },
        onError: () => report('error', '素材记录读取失败，本次补图暂停；可在素材 → 待确认中重新读取。'),
        pendingCount: () => pendingImages.size + pendingThumbs.size,
    });
    let offRendered = null;
    let offOnline = null;
    let stopped = false;
    let preparing = null, prepared = false;

    function ready() {
        if (stopped) return Promise.reject(new Error('media-stopped'));
        if (prepared) return Promise.resolve();
        if (!preparing) preparing = Promise.resolve().then(() => store.restore?.()).then(() => {
            if (stopped) throw new Error('media-stopped');
            prepared = true;
        }).finally(() => { preparing = null; });
        return preparing;
    }
    // 本机已有记录时先用它显示，记录恢复（全表扫描 + 拉网络备份）放后台，不让每次打开的第一张图都等它。
    async function displayRecord(id, onEarly) {
        if (!prepared && !stopped && typeof store.peekImageRecord === 'function') {
            const local = await store.peekImageRecord(id).catch(() => null);
            if (local) { onEarly?.(); void ready().catch(() => {}); return local; }
        }
        await ready().catch(error => { if (stopped || typeof store.getImageRecord !== 'function') throw error; });
        return typeof store.getImageRecord === 'function' ? store.getImageRecord(id) : null;
    }
    // extra.display：只要显示地址（blob:）不转 base64；extra.ticket：下载优先级，可事后提升。
    async function displayImage(id, record, extra = {}) {
        const options = { fields: ['dataUrl'], strictRead: true, ...extra };
        return store.hydrateImage && record ? store.hydrateImage(record, options) : store.getImage(id, options);
    }

    const readSettings = () => {
        const raw = getSettings ? getSettings() || {} : {};
        const imageApi = raw.imageApi && typeof raw.imageApi === 'object' ? raw.imageApi : {};
        return {
            auto: normalizeAutoIllustrationSettings(raw.autoIllustration),
            strict: isStrictBackgroundMatch(raw.autoIllustration),
            sceneAssets: raw.sceneAssets && typeof raw.sceneAssets === 'object' ? raw.sceneAssets : {},
            // 没写过这个开关时沿用旧行为：数据库生图的立绘打开透明底。
            dbgenSpriteTransparent: imageApi.dbgenSpriteTransparent !== false,
            spriteModel: String(imageApi.spriteModel || '').trim(),
        };
    };

    // 场景背景和剧情 CG 用同一套尺寸：手机、内嵌竖屏把背景尺寸宽高对调；全屏按窗口实际比例。
    const backgroundSize = (s) => cgSizeForMode(
        s.auto.assets.backgroundSize,
        typeof deps.getReaderMode === 'function' ? deps.getReaderMode() : 'pc',
        typeof deps.getViewport === 'function' ? deps.getViewport() : null,
    );

    function emit(detail) {
        if (stopped) return;
        if (events && typeof events.emit === 'function') events.emit(GENERATED_ASSET_UPDATED_EVENT, detail);
    }

    function invalidateThumb(id) {
        void cache.drop(thumbKey(id)).catch(() => {});
        if (smallThumbs) void thumbStore.remove([id]).catch(() => {});
    }
    function forgetImage(id) { failedImages.delete(id); cache.forget(imageKey(id)); }
    function rememberImage(id, dataUrl) { if (!stopped) { failedImages.delete(id); cache.forget(imageKey(id)); cache.remember(imageKey(id), dataUrl); } }
    function imageFailure(url) {
        if (!isGeneratedAssetUrl(url)) return null;
        const id = generatedAssetIdOf(url);
        if (cache.peek(imageKey(id))) { failedImages.delete(id); return null; }
        const failure = failedImages.get(id);
        if (failure && failure.token !== cache.token(imageKey(id))) { failedImages.delete(id); return null; }
        return failure || null;
    }
    const isMissingImage = url => imageFailure(url)?.missing === true;
    const hasMissingImages = () => [...failedImages.values()].some(value => value.missing);
    const isUnavailableImage = url => Boolean(imageFailure(url));
    const hasUnavailableImages = () => failedImages.size > 0;
    function noteImageFailure(id, error) {
        const missing = ['image-file-not-found', 'image-empty'].includes(error.message);
        const existed = failedImages.has(id);
        failedImages.set(id, { missing, reason: error.message || 'image-read-failed', token: cache.token(imageKey(id)) });
        if (!existed) emit({ imageId: id, reason: missing ? 'image-lost' : 'image-unavailable' });
    }
    function retryImageReads() {
        if (stopped || !failedImages.size) return;
        failedImages.clear();
        emit({ reason: 'image-retry-ready' });
    }

    async function persistTempRecord(record) {
        let old;
        try {
            old = await store.getAsset(record.key);
            await store.putAsset(record);
        } catch (error) {
            if (record.imageId && record.imageId !== old?.imageId) await deleteImagesImpl([record.imageId]);
            throw error;
        }
        tempCache.remember(record);
        if (old?.imageId && old.imageId !== record.imageId) await deleteImagesImpl([old.imageId]);
    }

    function currentChat() {
        const chatId = messageHost.getChatId();
        if (!stopped) tempCache.use(chatId);
        return chatId;
    }
    function tempUrl(record) {
        return record && ACTIVE_TEMP_STATUSES.has(record.status) && record.imageId
            ? `${GENERATED_ASSET_URL_PREFIX}${record.imageId}` : '';
    }
    function tempBackground(scene, time) {
        if (stopped) return '';
        const chatId = currentChat();
        if (!chatId) return '';
        const exact = tempCache.peek(chatId, tempAssetKeyOf(chatId, { type: 'background', name: scene, time }));
        if (tempUrl(exact)) return tempUrl(exact);
        const fallback = tempCache.peekQuery({ chatId, types: ['background'], name: scene, statuses: [...ACTIVE_TEMP_STATUSES], requireImage: true, limit: 1 });
        return tempUrl(fallback?.records[0]);
    }
    function tempSceneTime(scene, time) {
        if (stopped) return null;
        const chatId = currentChat();
        if (!chatId) return null;
        const record = tempCache.peek(chatId, tempAssetKeyOf(chatId, { type: 'background', name: scene, time }));
        return record ? { url: tempUrl(record), status: record.status, skipReason: record.skipReason, floorKey: record.floorKey } : null;
    }
    function tempSprite(name) {
        if (stopped) return '';
        const chatId = currentChat();
        return chatId ? tempUrl(tempCache.peek(chatId, tempAssetKeyOf(chatId, { type: 'sprite', name }))) : '';
    }
    function tempSpriteTags() {
        if (stopped) return {};
        const chatId = currentChat(), out = {};
        for (const record of tempCache.values()) {
            if (record.type !== 'sprite' || !tempUrl(record)) continue;
            const loaded = tempCache.peek(chatId, record.key);
            if (loaded?.tags) out[record.name] = String(loaded.tags);
        }
        return out;
    }

    // options.priority === 'low'：整楼预热，排在当前页要显示的图之后；同一张图后来被当前页要，会提升。
    function resolveUrl(url, options) {
        if (!isGeneratedAssetUrl(url)) return String(url || '');
        if (stopped) return '';
        const id = generatedAssetIdOf(url), key = imageKey(id), hit = cache.peek(key);
        if (hit) { failedImages.delete(id); return hit; }
        const low = options?.priority === 'low';
        if (pendingImages.has(id) && !low) { const waiting = imageTickets.get(id); if (waiting && !waiting.high) { waiting.high = true; waiting.boost?.(); } }
        if (!pendingImages.has(id) && !imageFailure(url)) {
            pendingImages.add(id);
            const ticket = { high: !low, boost: null };
            imageTickets.set(id, ticket);
            const generation = tempCache.epoch();
            let stamp = null, early = false;
            // 恢复记录会失效旧像素引用，必须先完成恢复再取得读图 token；先用本机记录读的，读完若被恢复作废就通知重读一次。
            displayRecord(id, () => { early = true; }).then(async record => {
                if (stopped || tempCache.epoch() !== generation) return;
                stamp = cache.token(key);
                const value = await cache.load(key, async () => {
                    let value = (await displayImage(id, record, { display: true, ticket }))?.dataUrl || '';
                    // 显示地址对应的内存条目若已被淘汰，objectURL 已失效，退回完整 dataUrl。
                    if (/^blob:/i.test(value) && !cache.sourceId(value)) value = (await displayImage(id, record))?.dataUrl || '';
                    if (!value) throw new Error('image-empty');
                    return value;
                }, { persist: false });
                if (tempCache.epoch() !== generation) return;
                if (cache.token(key) !== stamp) { if (early) emit({ imageId: id, reason: 'image-loaded' }); return; }
                if (value) failedImages.delete(id);
                if (cache.peek(key)) emit({ imageId: id, reason: 'image-loaded' });
            })
                .catch(error => {
                    // 预热（低优先级）一直被当前页插队而排队超时，不算读图失败，翻到那页时再读。
                    if (!ticket.high && error.message === 'image-load-timeout') return;
                    if (!stopped && tempCache.epoch() === generation && (stamp == null || cache.token(key) === stamp || error.message === 'image-load-timeout')) noteImageFailure(id, error);
                }).finally(() => { if (imageTickets.get(id) === ticket) imageTickets.delete(id); if (tempCache.epoch() === generation) pendingImages.delete(id); });
        }
        return '';
    }

    async function loadSmallThumb(id) {
        const generation = tempCache.epoch();
        const cached = cache.peek(imageKey(id));
        const release = cached ? cache.pin(imageKey(id)) : () => {};
        try {
            const record = cached ? null : await displayRecord(id);
            if (stopped || tempCache.epoch() !== generation) return;
            const key = thumbKey(id), stamp = cache.token(key);
            const value = await cache.load(key, async () => {
                let dataUrl = await thumbStore.get(id).catch(() => '');
                if (dataUrl) return dataUrl;
                const full = cached || (await displayImage(id, record))?.dataUrl || '';
                if (!full) return '';
                if (!stopped && tempCache.epoch() === generation) failedImages.delete(id);
                const small = await Promise.resolve().then(() => makeThumb(full)).catch(() => '');
                if (small && cache.token(key) === stamp) await thumbStore.put(id, small, stamp);
                return small || full;
            });
            if (value && tempCache.epoch() === generation && cache.token(key) === stamp && cache.peek(key)) emit({ imageId: id, reason: 'image-loaded' });
        } finally { release(); }
    }

    function thumbSourceId(url) {
        const key = cache.sourceId(String(url || ''));
        return key.startsWith('thumb:asset:') ? key.slice(12) : key.startsWith('asset:') ? key.slice(6) : '';
    }

    function resolveThumbUrl(url) {
        if (!isGeneratedAssetUrl(url) || !smallThumbs) return resolveUrl(url);
        const id = generatedAssetIdOf(url), ready = cache.peek(thumbKey(id));
        if (ready) return ready;
        if (!pendingThumbs.has(id)) {
            pendingThumbs.add(id);
            const generation = tempCache.epoch();
            loadSmallThumb(id).catch(() => {}).finally(() => { if (tempCache.epoch() === generation) pendingThumbs.delete(id); });
        }
        return '';
    }

    // 本楼匹配的临时工作区，不依赖缓存是否接纳记录；完成后释放。
    function matchContext(s, floor, numbered, manual) {
        const chatId = floor.chatId;
        const exact = new Map(), backgrounds = new Map(), requests = new Map();
        const assertChat = () => { if (stopped || messageHost.getChatId() !== chatId) throw Object.assign(new Error('media-metadata-stale'), { code: 'media-metadata-stale' }); };
        const recordOf = (type, name, time = '') => {
            const key = tempAssetKeyOf(chatId, { type, name, time });
            if (!exact.has(key)) requests.set(`r:${key}`, async () => { assertChat(); exact.set(key, await tempCache.read(chatId, key)); });
            return exact.get(key);
        };
        const match = { sceneAssets: s.sceneAssets, generatedAssets: s.sceneAssets.generated, strict: s.strict, retryFailedVariants: manual, floorKey: floorKeyOf(floor),
            tempSprite: name => tempUrl(recordOf('sprite', name)),
            tempSceneTime(scene, time) { const record = recordOf('background', scene, time); return record ? { url: tempUrl(record), status: record.status, skipReason: record.skipReason, floorKey: record.floorKey } : null; },
            tempBackground(scene, time) {
                const hit = tempUrl(recordOf('background', scene, time));
                if (hit) return hit;
                if (!backgrounds.has(scene)) requests.set(`b:${scene}`, async () => {
                    assertChat();
                    const page = await tempCache.query({ chatId, types: ['background'], name: scene, statuses: [...ACTIVE_TEMP_STATUSES], requireImage: true, limit: 1 }, { fresh: true });
                    backgrounds.set(scene, page.records[0] || null);
                });
                return tempUrl(backgrounds.get(scene));
            },
            async hydrate() {
                for (;;) {
                    if (s.auto.assets.backgroundEnabled) collectAssetNeeds({ scenes: numbered.scenes }, match, { background: true });
                    if (s.auto.assets.spriteEnabled) collectAssetNeeds({ characters: numbered.characters }, match, { sprite: true });
                    if (!requests.size) return;
                    const tasks = [...requests.values()]; requests.clear();
                    // 顺序查询，避免长楼层同时打开无限个读库事务。
                    for (const read of tasks) await read();
                }
            },
        };
        return match;
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
        // 数据库生图的立绘默认打开透明底，可在图像来源里关掉（V4.5 没有原生透明底）。
        const plannedVia = nai && typeof nai.describe === 'function' ? nai.describe().via : 'nai';
        const dbgenTransparent = plannedVia === 'dbgen' && s.dbgenSpriteTransparent !== false;
        const transparent = isSprite && plannedVia !== 'chatu8' && plannedVia !== 'baibai'
            && (dbgenTransparent || (plannedVia !== 'dbgen' && supportsNaiTransparentBackground(s.spriteModel || s.auto.nai.model)));
        const slot = buildAssetSlot(item, {
            transparent,
            whiteBackground: isSprite && plannedVia === 'dbgen' && !dbgenTransparent,
            templates: s.auto.assets.templates,
            positiveContext: s.auto.nai.artistPrefix,
        });
        const size = isSprite ? s.auto.assets.spriteSize : backgroundSize(s);
        // 数据库生图：描述只说明画什么。正负模板随 userPrompts 传出，出图前合并进最终 caption。
        const userPrompts = { positive: slot.scene, negative: slot.sceneUc };
        const meta = {
            messageId: floor.messageId, size, description: buildDbgenAssetDescription(item.need, { transparent: dbgenTransparent }), userPrompts,
            skipRecall: true,
            imageKind: isSprite ? 'sprite' : 'background',
            ...(dbgenTransparent && { transparent: true }),
            // 背景底图记下种子，之后的时段差分复用它。
            ...(!isSprite && { seed: randomSeed() }),
        };
        let result;
        try { result = await nai.generate(slot, { ...s.auto.nai, size, ...(meta.seed && { seed: meta.seed }) }, meta); } catch (error) { result = { ok: false, error: `NAI 生成失败：${(error && error.message) || error}` }; }
        const key = tempAssetKeyOf(floor.chatId, item.need);
        const base = {
            key, chatId: floor.chatId, floorKey, messageId: floor.messageId, swipeId: floor.swipeId,
            type: item.need.type, name: item.need.name, time: item.need.time || '', weather: item.need.weather || '',
            ...(item.need.variantOf && { variantOf: item.need.variantOf }),
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
            const usedSeed = Number.isInteger(result.seed) && result.seed > 0 ? result.seed : meta.seed;
            if (!isSprite && usedSeed > 0) image.seed = usedSeed;
            const saved = await putImageWithQuotaFallback(image);
            rememberImage(imageId, image.dataUrl);
            record = { ...base, imageId, status: 'review', ...(saved.diagnostic ? { sourceUnavailable: saved.diagnostic } : {}) };
        } else {
            record = { ...base, imageId: '', status: 'failed', error: (result && result.error) || 'NAI 生成失败' };
            report('error', `素材「${item.need.name}」生成失败：${record.error}`);
        }
        await persistTempRecord(record);
        emit({ chatId: floor.chatId, messageId: floor.messageId, swipeId: floor.swipeId, key, reason: 'generated' });
        return record;
    }

    // 已登记场景缺这个时段：拿原图存下的提示词换时间标签直接出图，不写词。
    // 原图没词时交还既有背景写词队列；只有原图本来就是这个时段才跳过。
    async function generateTimeVariant(need, s, floor, floorKey) {
        const key = tempAssetKeyOf(floor.chatId, need);
        const base = {
            key, chatId: floor.chatId, floorKey, messageId: floor.messageId, swipeId: floor.swipeId,
            type: 'background', name: need.name, time: need.time, weather: '', variantOf: need.variantOf, tags: '', createdAt: now(),
        };
        const stored = await getImagePrompt(need.variantOf);
        const caption = stored ? sceneVariantCaption(stored, sceneVariantTags(need.time, '')) : null;
        const baseText = stored && stored.caption ? stored.caption.v4_prompt.caption.base_caption : stored && stored.positive;
        if (!caption) return { ...base, status: 'needs-prompt' };
        let record;
        if (promptTimeBucket(baseText) === sceneTimeBucket(need.time)) {
            record = { ...base, imageId: '', status: 'skipped', skipReason: 'same-time' };
        } else {
            let result;
            // 复用白天底图的种子，构图更接近；底图没存种子才随机。
            const seed = (await getImageSeed(need.variantOf)) || randomSeed();
            try {
                result = await nai.generateDbgenCaption({ caption, size: backgroundSize(s), seed, imageKind: 'background' });
            } catch (error) {
                result = { ok: false, error: `出图失败：${(error && error.message) || error}` };
            }
            if (result && result.ok && result.dataUrl) {
                const imageId = newId();
                const image = { id: imageId, dataUrl: result.dataUrl, type: 'background', createdAt: base.createdAt, seed };
                const prompt = normalizeStoredPrompt(result.prompt) || promptFromCaption(caption);
                if (prompt) image.prompt = prompt;
                await putImageWithQuotaFallback(image);
                rememberImage(imageId, image.dataUrl);
                record = { ...base, imageId, status: 'review' };
            } else {
                record = { ...base, imageId: '', status: 'failed', error: (result && result.error) || '出图失败' };
                report('error', `「${need.name}」${need.time}差分生成失败：${record.error}`);
            }
        }
        await persistTempRecord(record);
        if (record.status !== 'skipped') emit({ chatId: floor.chatId, messageId: floor.messageId, swipeId: floor.swipeId, key, reason: 'generated' });
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
            const seed = randomSeed();
            if (!caption) {
                result = { ok: false, error: written && written.error ? written.error : '没有对应的背景提示词' };
            } else {
                try {
                    result = await nai.generateDbgenCaption({
                        caption,
                        seed,
                        size: backgroundSize(s),
                        imageKind: 'background',
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
                ...(item.need.variantOf && { variantOf: item.need.variantOf }),
                tags: item.tags, createdAt: now(),
            };
            let record;
            if (result && result.ok && result.dataUrl) {
                const imageId = newId();
                const image = { id: imageId, dataUrl: result.dataUrl, type: item.need.type, createdAt: base.createdAt };
                const prompt = normalizeStoredPrompt(result.prompt);
                if (prompt) image.prompt = prompt;
                const usedSeed = Number.isInteger(result.seed) && result.seed > 0 ? result.seed : seed;
                if (usedSeed > 0) image.seed = usedSeed;
                await store.putImage(image);
                rememberImage(imageId, image.dataUrl);
                record = { ...base, imageId, status: 'review' };
            } else {
                record = { ...base, imageId: '', status: 'failed', error: (result && result.error) || 'NAI 生成失败' };
                report('error', `素材「${item.need.name}」生成失败：${record.error}`);
            }
            await persistTempRecord(record);
            emit({ chatId: floor.chatId, messageId: floor.messageId, swipeId: floor.swipeId, key, reason: 'generated' });
            records.push(record);
        }
        return records;
    }

    // 数据库生图：本楼缺的立绘一次写完，再按份出图。超过 8 张均分成两批，一批写完并出完再写下一批。
    async function generateSpriteBatch(items, s, floor, floorKey) {
        const records = [];
        let stopError = '';
        const transparent = s.dbgenSpriteTransparent !== false;
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
                const image = await buildSpriteImageRecord(imageId, result.dataUrl, transparent, base.createdAt);
                const prompt = normalizeStoredPrompt(result.prompt);
                if (prompt) image.prompt = prompt;
                const saved = await putImageWithQuotaFallback(image);
                rememberImage(imageId, image.dataUrl);
                record = { ...base, imageId, status: 'review', ...(saved.diagnostic ? { sourceUnavailable: saved.diagnostic } : {}) };
            } else {
                record = { ...base, imageId: '', status: 'failed', error: (result && result.error) || 'NAI 生成失败' };
                report('error', `素材「${item.need.name}」生成失败：${record.error}`);
            }
            await persistTempRecord(record);
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
                    description: buildDbgenSpriteBatchDescription(batch.map((item) => item.need), { transparent }),
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
                const slot = buildAssetSlot(item, { transparent, whiteBackground: !transparent, templates: s.auto.assets.templates });
                const prompts = expressionSpritePrompts(slot.scene, slot.sceneUc);
                let result;
                if (!caption) {
                    result = { ok: false, error: '没有对应的立绘提示词' };
                } else {
                    try {
                        result = await nai.generateDbgenCaption({
                            caption: uprightSpriteCaption(caption) || caption,
                            size: s.auto.assets.spriteSize,
                            imageKind: 'sprite',
                            messageId: floor.messageId,
                            ...(transparent && { transparent: true }),
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

    function releaseDayBases(floorKey) {
        for (const [dayKey, entry] of dayBasePending) {
            if (entry.floorKey !== floorKey) continue;
            dayBasePending.delete(dayKey);
            entry.resolve();
        }
    }

    async function run(messageId, floor, key, s, manual) {
        // 失败或中途刷新残留的 planning 不算处理完，下次渲染时重试。
        const previous = await store.getFloor(key);
        if (!manual && previous && previous.status === 'done') return { ok: true, reason: 'already-decided' };
        // 不记成已处理：用户点「继续」把这楼写长后，下次渲染照常补素材。
        const bodyChars = floorBodyLength(floor.text, sourceFilter());
        if (!manual && bodyChars < minBodyChars) {
            report('info', `第 ${messageId} 楼跳过素材补全：正文只有 ${bodyChars} 字，少于 ${minBodyChars} 字不自动生图`);
            return { ok: true, reason: 'body-too-short' };
        }
        const numbered = numberParagraphs(floor.text);
        const match = matchContext(s, floor, numbered, manual);
        // 命中的 igs-gen 图先记下，查一遍图片本体还在不在；丢了的按缺图重算，否则一直「已有素材」却显示不出来。
        const probed = new Set();
        const lost = new Set();
        match.isMissingImage = (url) => { probed.add(url); return lost.has(url); };
        // 背景按本楼实际缺的张数生成，不跟立绘共用每层上限。已生成的在匹配时剔掉。
        const collectNeeds = () => [
            s.auto.assets.backgroundEnabled
                ? collectAssetNeeds({ scenes: numbered.scenes, characters: [] }, match, { background: true, sprite: false })
                : [],
            s.auto.assets.spriteEnabled
                ? collectAssetNeeds({ scenes: [], characters: numbered.characters }, match, { background: false, sprite: true, limit: s.auto.assets.maxPerFloor })
                : [],
        ];
        await match.hydrate();
        let [backgroundNeeds, spriteNeeds] = collectNeeds();
        for (const url of probed) {
            const id = generatedAssetIdOf(url);
            if (cache.peek(imageKey(id))) continue;
            let record;
            try { record = await (store.getImageRecord ? store.getImageRecord(id) : store.getImage(id)); }
            catch { report('warn', '素材记录暂时读不到，保留已有引用'); continue; }
            if (!record || !record.dataUrl) {
                lost.add(url);
                await match.hydrate();
                [backgroundNeeds, spriteNeeds] = collectNeeds();
            }
        }
        if (lost.size) {
            report('warn', `第 ${messageId} 楼有 ${lost.size} 张已登记素材的图片找不到了，已跳过失效槽并重新检查兜底`);
        }
        const variantNeeds = backgroundNeeds.filter((need) => need.variantOf);
        const needs = [...backgroundNeeds.filter((need) => !need.variantOf), ...spriteNeeds];
        // 非白天且该地点还没图：先画白天底图，再走时段差分；差分不可用（后端不能按词出图）时仍直接画。
        const dayFirst = [];
        if (s.auto.assets.dayFirst !== false && nai && typeof nai.generateDbgenCaption === 'function') {
            const kept = [];
            const dayKeyOfName = new Map();
            for (const need of needs) {
                if (need.type === 'background' && sceneTimeBucket(need.time) === '白天') dayKeyOfName.set(need.name, tempAssetKeyOf(floor.chatId, need));
            }
            for (const need of needs) {
                if (need.type !== 'background' || !isOffDayTime(need.time)) { kept.push(need); continue; }
                const dayNeed = { type: 'background', name: need.name, time: '白天', weather: '', nsfw: need.nsfw === true };
                const dayKey = dayKeyOfName.get(need.name) || tempAssetKeyOf(floor.chatId, dayNeed);
                dayFirst.push({ need, dayKey });
                if (dayKeyOfName.has(need.name) || dayBasePending.has(dayKey)) continue;
                // 先占位再读缓存，避免两楼同时读到「没有」后各画一遍。
                let resolve;
                const promise = new Promise((done) => { resolve = done; });
                const entry = { promise, resolve, floorKey: key };
                dayBasePending.set(dayKey, entry);
                dayKeyOfName.set(need.name, dayKey);
                const existing = await tempCache.read(floor.chatId, dayKey);
                if (existing && existing.imageId && ACTIVE_TEMP_STATUSES.has(existing.status)) {
                    if (dayBasePending.get(dayKey) === entry) dayBasePending.delete(dayKey);
                    resolve();
                    continue;
                }
                kept.push(dayNeed);
            }
            needs.length = 0;
            needs.push(...kept);
        }
        attachCharacterDna(needs, s.sceneAssets);
        if (!needs.length && !variantNeeds.length && !dayFirst.length) {
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
        let count = 0;
        let attempted = 0;
        const errors = [];
        if (variantNeeds.length) report('info', `第 ${messageId} 楼按原图提示词补 ${variantNeeds.length} 张场景时段差分…`);
        for (const need of variantNeeds) {
            const record = await generateTimeVariant(need, s, floor, key);
            if (record.status === 'needs-prompt') { needs.push(need); continue; }
            if (record.status === 'skipped') continue;
            attempted += 1;
            if (record.status === 'review') count += 1;
            else errors.push(`「${record.name}·${record.time}」${record.error}`);
        }
        // 只缺时段差分时不请求写词。
        let plan = { ok: true, items: [] };
        if (needs.length && backend.ownPrompts) {
            // 数据库生图插件自己按楼层写提示词，不需要副 LLM 出标签。
            report('info', `第 ${messageId} 楼缺少 ${needs.length} 项素材，正在交给数据库生图插件…`);
            plan = { ok: true, items: needs.map((need) => ({ need, tags: '' })) };
        } else if (needs.length) {
            report('info', `第 ${messageId} 楼缺少 ${needs.length} 项素材，正在请求副 LLM…`);
            try {
                const previousText = messageHost.readPreviousAiTexts(messageId, s.auto.llm.contextFloors)
                    .map(toReadableText).join('\n').slice(-1500);
                // 没登记 DNA 的角色补酒馆里的外貌参考（用户人设、角色卡、世界书），DNA 仍优先。
                const loreNames = needs.filter((need) => need.type === 'sprite' && !need.dna).map((need) => need.name);
                const lore = loreNames.length && typeof messageHost.readCharacterLore === 'function'
                    ? await messageHost.readCharacterLore(loreNames).catch(() => [])
                    : [];
                plan = await requestWithSoftRetry(llm, {
                    system: s.auto.llm.prompts.asset,
                    softSystem: s.auto.llm.prompts.assetSoft,
                    user: buildAssetPlannerUserPrompt({ needs, readableText: toReadableText(floor.text).slice(0, 6000), previousText, lore }),
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
        releaseDayBases(key);
        for (const { need, dayKey } of dayFirst) {
            const pending = dayBasePending.get(dayKey);
            if (pending) await pending.promise;
            const base = await tempCache.read(floor.chatId, dayKey);
            if (!base || !base.imageId || !ACTIVE_TEMP_STATUSES.has(base.status)) {
                report('warn', `第 ${messageId} 楼「${need.name}」白天底图没画成，${need.time}差分先跳过`);
                continue;
            }
            report('info', `第 ${messageId} 楼按「${need.name}」白天底图补${need.time}差分…`);
            const variantNeed = { ...need, weather: '', variantOf: base.imageId };
            let record = await generateTimeVariant(variantNeed, s, floor, key);
            if (record.status === 'needs-prompt') record = await generateItem({ need, tags: '' }, s, floor, key);
            if (record.status === 'skipped') continue;
            attempted += 1;
            if (record.status === 'review') count += 1;
            else errors.push(`「${record.name}·${record.time}」${record.error}`);
        }
        const failedCount = attempted + plan.items.length - count;
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
        if (manual) s.auto.assets = { ...s.auto.assets, spriteEnabled: true, backgroundEnabled: true };
        if (!s.auto.assets.spriteEnabled && !s.auto.assets.backgroundEnabled) return { ok: true, reason: 'disabled' };
        if (!s.sceneAssets.enabled) return { ok: true, reason: 'scene-assets-disabled' };
        const floor = messageHost.readFloor(messageId);
        // 手动可补旧楼的素材（续读停在旧楼时）；自动仍只认最新楼。
        if (!floor || !floor.isAi || !(floor.isLatest || manual) || !floor.chatId || !floor.text.trim()) {
            return { ok: true, reason: 'not-eligible' };
        }
        const key = floorKeyOf(floor);
        if (locks.has(key)) return locks.get(key);
        const job = run(Number(messageId), floor, key, s, manual)
            .then(result => { if (result.ok && retryTarget?.chatId === floor.chatId && retryTarget?.messageId === Number(messageId)) retryTarget = null; return result; })
            .catch((error) => {
                if (error.code === 'media-metadata-stale') return { ok: false, reason: 'stale-chat' };
                retryTarget = { chatId: floor.chatId, messageId: Number(messageId), manual };
                report('error', `素材生成异常：${(error && error.message) || error}`);
                return { ok: false, reason: 'error', error: '素材生成失败' };
            })
            .finally(() => { releaseDayBases(key); locks.delete(key); });
        locks.set(key, job);
        return job;
    }

    // 写记录会把整组页索引作废，而本函数是同步读：页索引不在时退回缓存里已有的单条记录，
    // 否则刚生成完的素材当帧读回来是空的，要等下一次异步 query 才显示。
    function reviewPage(floorKey) {
        const chatId = currentChat();
        if (!chatId || !floorKey || stopped) return null;
        const options = { chatId, floorKey, types: ['background', 'sprite'], statuses: ['review'], limit: 24 };
        const page = tempCache.peekQuery(options);
        if (page) return page;
        const records = tempCache.values()
            .filter((record) => record.chatId === chatId && record.floorKey === floorKey && record.status === 'review')
            .slice(0, options.limit);
        return { records, total: records.length, hasNext: false, hasPrevious: false };
    }
    function listReview(floorKey) {
        return (reviewPage(floorKey)?.records || []).map(record => ({ ...record, url: tempUrl(record) }));
    }
    function tempPageOptions() {
        return { chatId: currentChat(), types: ['background', 'sprite'], statuses: [...ACTIVE_TEMP_STATUSES], limit: 24, includeTotal: true, ...tempCursor };
    }
    function tempPage() {
        if (stopped || !messageHost.getChatId()) return { records: [], total: 0, hasNext: false, hasPrevious: false };
        const options = tempPageOptions();
        const page = tempCache.peekQuery(options);
        if (page) return { ...page, loading: false, error: tempCache.status().error };
        // 页索引会被写记录作废，而本函数是同步读：退回缓存里已有的单条记录，
        // 否则刚生成完的素材当帧读回来是空的。翻过页时不兜底，避免把整批记录当第一页。
        const paged = tempCursor.afterKey || tempCursor.beforeKey;
        const records = paged ? [] : tempCache.values().filter((record) => ACTIVE_TEMP_STATUSES.has(record.status)).slice(0, options.limit);
        return { records, total: records.length, hasNext: false, hasPrevious: false, loading: tempCache.status().pending, error: tempCache.status().error };
    }
    function listTemp() { return tempPage().records.map(record => ({ ...record, url: tempUrl(record) })); }
    async function changeTempPage(direction) {
        const page = tempPage();
        if (direction === 'next' && page.hasNext && page.lastKey) tempCursor = { afterKey: page.lastKey };
        else if (direction === 'previous' && page.hasPrevious && page.firstKey) tempCursor = { beforeKey: page.firstKey };
        else tempCursor = {};
        return tempCache.query(tempPageOptions(), { fresh: true });
    }
    async function retryMetadata() {
        const target = retryTarget;
        tempCache.clear();
        if (messageHost.getChatId()) await tempCache.query(tempPageOptions(), { fresh: true });
        if (target && target.chatId === messageHost.getChatId()) return processMessage(target.messageId, { manual: target.manual });
        return { ok: true };
    }
    async function readRecord(key) {
        const chatId = currentChat();
        return chatId && !stopped ? tempCache.read(chatId, key) : null;
    }

    async function setStatus(key, status) {
        const record = await readRecord(key);
        if (!record) return { ok: false, reason: 'not-found' };
        const next = { ...record, status, updatedAt: now() };
        if (status === 'discarded') next.imageId = '';
        await store.putAsset(next);
        if (!stopped) tempCache.remember(next);
        if (status === 'discarded' && record.imageId) {
            const deleted = await store.deleteImage(record.imageId);
            if (!deleted?.retained?.length) { forgetImage(record.imageId); invalidateThumb(record.imageId); }
        }
        emit({ chatId: record.chatId, key, reason: status });
        return { ok: true, record: next };
    }

    async function deleteImages(ids) {
        return deleteImagesImpl(ids);
    }

    // 遮罩编辑器读取：legacy 记录（无原图）只可查看，editable 为 false。
    async function getEditableImage(imageId) {
        const record = normalizeGeneratedImageRecord(await store.getImage(imageId, { fields: '*' }));
        if (!record) return { ok: false, reason: 'not-found' };
        const metadata = typeof store.getImageRecord === 'function' ? await store.getImageRecord(imageId) : record;
        if (IMAGE_FIELDS.some(field => metadata?.[field] && !record[field])) return { ok: false, reason: 'image-read-failed' };
        return { ok: true, record, editable: !isLegacyGeneratedImage(record) };
    }

    // 保存修复结果：按 revision 原子更新；成功后刷新内存缓存并通知重渲染，失败不改任何字段。
    async function saveMatteEdit(imageId, expectedRevision, patch) {
        if (!store || typeof store.updateImage !== 'function') return { ok: false, reason: 'update-unsupported' };
        const result = await store.updateImage(imageId, expectedRevision, patch, now());
        if (!result || !result.ok) return result || { ok: false, reason: 'update-failed' };
        invalidateThumb(imageId);
        rememberImage(imageId, result.record.dataUrl);
        emit({ imageId, reason: 'matte-edited', revision: result.record.revision });
        return { ok: true, revision: result.record.revision };
    }

    async function deleteImagesImpl(ids) {
        let failed = false;
        const retained = [];
        for (const id of ids || []) {
            try {
                const deleted = await store.deleteImage(id);
                if (deleted?.retained?.length) { retained.push(...deleted.retained); continue; }
                if (deleted?.ok === false) { failed = true; continue; }
                forgetImage(id);
                invalidateThumb(id);
            } catch (error) { failed = true; }
        }
        return failed ? { ok: false, reason: 'image-delete-failed', retained } : retained.length ? { ok: true, retained } : { ok: true };
    }

    // 下载用：取 IGS 实际存储的图片 dataUrl（立绘为裁边后的版本），找不到返回空串。
    async function getImageDataUrl(id) {
        const key = String(id || '');
        if (!key) return '';
        const record = await store.getImage(key, { fields: ['dataUrl'] });
        return record && record.dataUrl ? record.dataUrl : '';
    }

    // 透明底只信数据库生图与支持原生透明的 NAI 模型；智绘姬 / 柏宝绘 / 其余 NAI 模型按浅灰底出图再抠图。
    function expressionPaintMeta() {
        const s = readSettings();
        const via = nai && typeof nai.describe === 'function' ? nai.describe().via : 'nai';
        const dbgenTransparent = via === 'dbgen' && s.dbgenSpriteTransparent !== false;
        const transparent = dbgenTransparent || (via === 'nai' && supportsNaiTransparentBackground(s.spriteModel || s.auto.nai.model));
        const slot = buildAssetSlot(
            { need: { type: 'sprite', name: '' }, tags: '', uc: '' },
            {
                transparent,
                whiteBackground: via === 'dbgen' && !dbgenTransparent,
                templates: s.auto.assets.templates,
                positiveContext: s.auto.nai.artistPrefix,
            },
        );
        const prompts = expressionSpritePrompts(slot.scene, slot.sceneUc);
        return {
            size: s.auto.assets.spriteSize,
            imageKind: 'sprite',
            userPrompts: { positive: prompts.positive, negative: prompts.negative },
            transparent,
        };
    }

    // 出图前只补约束：大腿以上、正面、直立。情绪、DNA、服装提示词只发给写词。
    // exact：用户改过的词原样出图，约束也不再盖上去。新图继续记为「改过」。
    async function paintExpressionCaption(name, mood, caption, _dna, { seed, exact = false } = {}) {
        const upright = exact ? caption : (uprightSpriteCaption(caption) || caption);
        const meta = { ...expressionPaintMeta(), promptKind: mood === '默认' ? 'sprite' : 'expression' };
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
        if (exact) image.promptEdited = true;
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
        const paint = { seed: randomSeed() };
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
                        description: buildExpressionDiffDescription(name, basePrompt, pending, dna, outfit, { note, nsfw: nsfw === true, transparent: readSettings().dbgenSpriteTransparent !== false }),
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
                    const slot = captions.find((item) => Number(item && item.slotId) === i + 1);
                    const caption = slot && slot.caption;
                    if (!caption) {
                        missing.push(pending[i]);
                        items.push({ mood: pending[i], ok: false, error: '写提示词没有返回这一份' });
                        continue;
                    }
                    // 漏写的那份第二轮补画才算一张，不然补写后 done 会超过 total（14/9）。
                    painted += 1;
                    reportExpressionProgress(onProgress, { phase: 'paint', done: painted, total: labels.length, mood: pending[i] });
                    const result = await paintExpressionCaption(name, pending[i], caption, dna, paint);
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
        const paint = { seed: randomSeed() };
        const stopped = () => Boolean(signal && signal.aborted);
        const results = [];
        for (let i = 0; i < list.length; i += 1) {
            const { mood, caption } = list[i];
            if (stopped()) {
                results.push({ mood, ok: false, error: '已停止', caption });
                continue;
            }
            reportExpressionProgress(onProgress, { phase: 'paint', done: i + 1, total: list.length, mood });
            results.push(await paintExpressionCaption(name, mood, caption, dna, paint));
        }
        return { ok: true, items: results, stopped: stopped() };
    }

    // 单张重画：有这一格的提示词就不再写词（写词要等插件的模型，单张也得几十秒），
    // 直接叠上当前的表情、衣服、DNA 硬合再出图；显式换一颗随机种子——不传种子时插件用自己的配置，固定种子会画出同一张。
    async function generateExpressionImage({ name, mood, caption, exact = false, basePrompt, dna, outfit, note, nsfw, onProgress } = {}) {
        const label = String(mood || '').trim();
        if (!label) return { ok: false, error: '没有表情' };
        if (caption) {
            reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: label });
            const item = await paintExpressionCaption(name, label, caption, dna, { seed: randomSeed(), exact: exact === true });
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
                painted = await nai.generateDbgenCaption({ caption, size: backgroundSize(s), seed, imageKind: 'background' });
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
                imageKind: 'sprite', promptKind: 'avatar',
                userPrompts: { positive: AVATAR_POSITIVE, negative: AVATAR_NEGATIVE },
            });
        } catch (error) {
            painted = { ok: false, error: (error && error.message) || '出图失败' };
        }
        if (!painted || !painted.ok || !painted.dataUrl) return { ok: false, error: (painted && painted.error) || '出图失败' };
        return { ok: true, dataUrl: painted.dataUrl };
    }

    // 设置页主动出一张默认立绘：先让 LLM 写提示词，再出图，不经过楼内补图。
    // 格子里已有图的「重新生成」带着那张图的 caption 进来：不写词，换一颗新种子直接画。
    async function generateCharacterSprite({ name, dna, nude = false, note = '', caption, exact = false, onProgress } = {}) {
        const who = String(name || '').trim();
        if (!who) return { ok: false, error: '没有角色' };
        if (caption) {
            if (!nai || typeof nai.generateDbgenCaption !== 'function') return { ok: false, error: '当前图像来源不能画立绘' };
            reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: '默认' });
            const repainted = await paintExpressionCaption(who, '默认', caption, dna, { seed: randomSeed(), exact: exact === true });
            if (!repainted.ok) return { ok: false, error: repainted.error || '出图失败', prompt: repainted.prompt };
            return { ok: true, imageId: repainted.imageId, prompt: repainted.prompt };
        }
        if (!nai || typeof nai.writeDbgenPrompt !== 'function' || typeof nai.generateDbgenCaption !== 'function') {
            return { ok: false, error: '当前图像来源不能写立绘' };
        }
        reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: 1, mood: '默认' });
        let written;
        try {
            written = await nai.writeDbgenPrompt({ description: buildCharacterSpriteDescription(who, dna, { nude: nude === true, note, transparent: readSettings().dbgenSpriteTransparent !== false }) });
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
        const meta = { ...expressionPaintMeta(), promptKind: 'wardrobe' };
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

    async function writeWardrobePrompt({ character, outfit, nsfwBoost = false, note = '' } = {}) {
        const name = String(character || '').trim();
        const clothes = String(outfit || '').trim();
        if (!clothes) return { ok: false, error: '没有待确认的服装' };
        if (!nai || typeof nai.writeDbgenPrompt !== 'function') return { ok: false, error: '当前图像来源不能写服装提示词' };
        let written;
        try {
            written = await nai.writeDbgenPrompt({ description: buildWardrobeClothingDescription(name, clothes, { nsfwBoost, note }) });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '写服装提示词失败' };
        }
        if (!written || !written.ok) return { ok: false, error: (written && written.error) || '写服装提示词失败' };
        const prompt = promptFromCaption(written.caption);
        const text = prompt && String(prompt.positive || '').trim();
        if (!text) return { ok: false, error: '写提示词没有返回服装标签' };
        return { ok: true, prompt: text };
    }

    async function getImageSeed(id) {
        const key = String(id || '');
        if (!key || !store || typeof store.getImage !== 'function') return 0;
        try {
            const record = await (typeof store.getImageRecord === 'function' ? store.getImageRecord(key) : store.getImage(key));
            const seed = record && record.seed;
            return Number.isInteger(seed) && seed > 0 ? seed : 0;
        } catch (error) { return 0; }
    }

    // edited：用户在「提示词」里改过并保存。重画时照原样用，不再叠情绪 / 衣服 / DNA。
    async function getImagePrompt(id) {
        const key = String(id || '');
        if (!key || !store || typeof store.getImage !== 'function') return null;
        const record = await (typeof store.getImageRecord === 'function' ? store.getImageRecord(key) : store.getImage(key));
        const prompt = normalizeStoredPrompt(record && record.prompt);
        return prompt && record.promptEdited === true ? { ...prompt, edited: true } : prompt;
    }

    async function saveImagePrompt(id, prompt) {
        const key = String(id || '');
        const stored = normalizeStoredPrompt(prompt);
        if (!key || !stored) return { ok: false, error: '提示词是空的' };
        if (!store || typeof store.getImage !== 'function' || typeof store.putImage !== 'function') {
            return { ok: false, error: '提示词存不了' };
        }
        if (typeof store.patchImageMetadata === 'function') {
            const saved = await store.patchImageMetadata(key, { prompt: stored, promptEdited: true });
            if (!saved?.ok) return { ok: false, error: '找不到这张立绘' };
        } else {
            const record = await store.getImage(key);
            if (!record) return { ok: false, error: '找不到这张立绘' };
            await store.putImage({ ...record, prompt: stored, promptEdited: true });
        }
        return { ok: true, prompt: stored };
    }

    async function readStoredImage(id) {
        const key = String(id || '');
        if (!key || !store || typeof store.getImage !== 'function') return null;
        const record = normalizeGeneratedImageRecord(await store.getImage(key, { fields: '*' }));
        if (!record || !isImageData(record.dataUrl) || IMAGE_FIELDS.some(field => record[field] && !isImageData(record[field]))) return null;
        const metadata = typeof store.getImageRecord === 'function' ? await store.getImageRecord(key) : record;
        if (IMAGE_FIELDS.some(field => metadata?.[field] && !record[field])) return null;
        return JSON.parse(JSON.stringify(record));
    }

    async function importAssetImage(dataUrl, type) {
        if (!['sprite', 'background', 'avatar'].includes(type) || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(String(dataUrl || ''))) {
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
        invalidateThumb(key);
        if (stored.dataUrl) rememberImage(key, stored.dataUrl);
        return { ok: true };
    }

    return {
        processMessage, resolveUrl, isMissingImage, hasMissingImages, isUnavailableImage, hasUnavailableImages, resolveThumbUrl, thumbSourceId, tempBackground, tempSceneTime, tempSprite, tempSpriteTags, listReview, reviewPage, listTemp, tempPage, changeTempPage, retryMetadata, readRecord, setStatus, deleteImages, getImageDataUrl, getImagePrompt, saveImagePrompt, readStoredImage, writeStoredImage, importAssetImage,
        generateExpressionSet, generateExpressionImage, paintExpressionCaptions, generateSceneVariants, generateCharacterSprite, generateCharacterAvatar, writeWardrobePrompt, paintWardrobeReference,
        getEditableImage, saveMatteEdit,
        getRecord: (key) => !stopped && currentChat() ? tempCache.peek(tempCache.scope, key) : null,
        start() {
            stopped = false;
            if (offRendered) return;
            offRendered = messageHost.on('CHARACTER_MESSAGE_RENDERED', (messageId) => processMessage(Number(messageId)));
            if (typeof deps.global?.addEventListener === 'function') {
                deps.global.addEventListener('online', retryImageReads);
                offOnline = () => deps.global.removeEventListener('online', retryImageReads);
            }
            if (readSettings().sceneAssets.enabled) void ready().then(() => emit({ reason: 'records-ready' }))
                .catch(error => { if (!stopped) report('error', `素材记录恢复失败：${error.message}`); });
        },
        clearCache() { tempCache.clear(); },
        stop() {
            stopped = true;
            tempCache.clear();
            if (offOnline) { offOnline(); offOnline = null; }
            if (offRendered) { offRendered(); offRendered = null; }
        },
    };
}
