import { recoverOperation, linkRecoverySignals, recoveryFailureText, RECOVERY_ATTEMPTS } from '../../storage/automatic-recovery.js';
import { requireMediaCache } from '../../media/media-cache-owner.js';
import { createAssetRecordCache } from '../../media/asset-record-cache.js';
import { IMAGE_FIELDS, isImageData } from '../../media/image-identity.js';
import { imageBackendMethod } from '../backend-methods.js';
import { isImageSeed, resolveImageSeed } from '../image-seed.js';
import { characterGenerationSeed, sceneGenerationSeed } from '../../scene/generation-seeds.js';

import { numberParagraphs } from './marker-placer.js';
import { MIN_AUTO_IMAGE_BODY_CHARS, floorBodyLength } from './floor-body-length.js';
import { buildAssetPlannerUserPrompt, parseAssetPlan, buildAssetSlot, buildDictionaryAssetItems } from './asset-prompt.js';
import { requestWithSoftRetry, normalizeMatteColor } from './prompt-kit.js';
import { normalizeAutoIllustrationSettings, isStrictBackgroundMatch } from './auto-illustration-settings.js';
import { ASSET_PLANNER_SYSTEM_PROMPT, ASSET_PLANNER_SOFT_SYSTEM_PROMPT } from './asset-prompt.js';
import { cgSizeForMode } from './auto-illustration-service.js';
import { supportsNaiTransparentBackground } from '../request-builders/nai-v4-builder.js';
import { collectAssetNeeds, collectGeneratedImageIds, tempAssetKeyOf, GENERATED_ASSET_URL_PREFIX, generatedAssetIdOf, isGeneratedAssetUrl } from '../../scene/asset-match.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { GENERATED_IMAGE_SCHEMA_VERSION, isLegacyGeneratedImage, isQuotaError, normalizeGeneratedImageRecord } from '../../media/generated-asset-store.js';
import { checkImageStorageRoom, IMAGE_STORAGE_FULL_MESSAGE, plannedImageCount } from '../../media/image-storage-room.js';
import { buildCharacterAvatarDescription, buildCharacterSpriteDescription, buildDbgenAssetDescription, buildDbgenBackgroundBatchDescription, buildDbgenSpriteBatchDescription, buildExpressionDiffDescription, buildWardrobeClothingDescription, nsfwClothingBoostLine, expressionLookTags, expressionPaintDna, expressionSpritePrompts, splitExpressionWriteBatches, splitWriteBatches, uprightSpriteCaption } from '../dbgen-prompt.js';
import { composeSpriteCaption, hasSpriteDna, spritePromptNeedsWriting } from '../sprite-prompt-composition.js';
import { normalizeStoredPrompt, promptFromCaption, promptProvenance, storedPromptFromResult } from '../generation-prompt.js';
import { promptTimeBucket, sceneVariantCaption, sceneVariantTags } from '../scene-variant-tags.js';
import { sceneTimeBucket } from '../../scene/time-bucket.js';
import { extractSceneDirectives, resolveCharacterKey } from '../../scene/scene-directives.js';
import { createOutfitResolver, isValidOutfitName, isBuiltinNudeOutfit } from '../../scene/character-outfits.js';
import { prepareCharacterDnaSave } from '../../scene/character-dna-preparation.js';
import { normalizeCharacterDna, isCharacterDnaEmpty, resolveCharacterDna, CHARACTER_DNA_REQUIRED_VIEWS } from '../../scene/character-dna.js';
import { buildCharacterContext, spriteAdoptionEvidence } from '../../scene/character-identity.js';
import { outfitAdoptionEvidence } from '../../scene/outfit-identity.js';
import { prepareCharacterCaption } from '../character-caption.js';
import { BUILTIN_PROMPTS } from '../prompt-registry.js';
import { spriteSchemeOf, expressionFragmentDescription } from '../prompt-scheme.js';
import { creatureOf, creatureFraming, creatureCanvasSize, creatureMoodLabels, creatureNeedsReference } from '../../scene/creature-profile.js';
import { creatureHintsOf } from '../../scene/creature-registry.js';
import { CREATURE_FORM_JUDGE_RULE, creatureFormJudgeDescription, parseCreatureFormJudgement } from '../prompt-tasks/creature.js';
import { creatureFixedPrompts, creaturePaintMeta } from '../creature-sprite.js';
import { creatureSpriteBatchDescription, creatureSingleSpriteDescription, creatureExpressionDescription, creatureAssetDescription } from '../prompt-tasks/creature.js';
import { DNA_WEIGHT_RULE } from '../prompt-tasks/common.js';
import { usesCharacterTemplates, characterPromptTask, singleCharacterContext, preflightCharacterTask, savedExpressionTemplate, characterTemplateInput, characterPromptRecovery, bindAutoSpriteOutfitNames, checkSpriteRecoveryBinding } from './character-prompt-task.js';
import { inheritImageTaskLease, imageTaskState, bindImageTaskTarget } from '../image-task-runtime.js';
import { cgCharacterState } from './cg-character-bindings.js';
import { externalPromptDescription } from '../external-prompt-reference.js';
import { createExternalSpriteDnaPreparation } from './external-sprite-dna.js';

export const GENERATED_ASSET_UPDATED_EVENT = 'igs:generated-asset-updated';
const AVATAR_SIZE = '1024x1024';
// 头像按圆形裁切：只到头、颈、肩，脸占画面大半；胸以下一律进负面。
const AVATAR_POSITIVE = BUILTIN_PROMPTS.avatar.positive;
const AVATAR_NEGATIVE = BUILTIN_PROMPTS.avatar.negative;

function assetCharacterContext(needs, assets) {
    const characters = new Map();
    for (const need of needs) {
        if (need.type !== 'sprite') continue;
        const [character] = buildCharacterContext([need.name], assets);
        if (!character) continue;
        if (isValidOutfitName(need.outfitName)) character.outfit = { name: need.outfitName,
            description: character.outfits.find(outfit => outfit.name === need.outfitName)?.description || '' };
        characters.set(character.characterKey, character);
    }
    return [...characters.values()];
}
// review：等待楼层结束时让用户处理；chat：用户选择仅本聊天使用；
// library：已加入素材库（由生成区条目接管）；discarded：丢弃。
const ACTIVE_TEMP_STATUSES = new Set(['review', 'chat']);
// 清晨、黄昏、夜晚算非白天；认不出的时间不动，保持原来的直接生成。
const isOffDayTime = (time) => { const bucket = sceneTimeBucket(time); return Boolean(bucket) && bucket !== '白天'; };
const staleSprite = guard => ({ ok: false, reason: 'stale-target', stopGeneration: true,
    error: `${guard?.failureReason?.() || '立绘生成目标已失效'}，已停止立绘生成` });

const secs = ms => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;

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
        if (hit && (!isCharacterDnaEmpty(hit.dna) || hit.dna.identityInitialized === true)) need.dna = hit.dna;
    }
    return needs;
}

export function createAssetGenerationService(deps) {
    const { messageHost, llm, nai, store, getSettings, getPromptScheme, events } = deps;
    const writePrompt = imageBackendMethod(nai, 'writePrompt');
    const generateCaption = imageBackendMethod(nai, 'generateCaption');
    const describeTask = signal => nai?.describe?.(imageTaskState({ signal })?.config, { signal }) || { via: 'nai', ready: { ok: true } };
    const taskBackend = signal => ({ describe: () => describeTask(signal) });
    const externalSource = signal => ['dbgen', 'extension', 'baibai'].includes(describeTask(signal).mode);

    const matte = deps.matte || (async (dataUrl) => dataUrl);
    const now = deps.now || (() => new Date().toISOString());
    const minBodyChars = Number.isFinite(Number(deps.minBodyChars)) ? Number(deps.minBodyChars) : MIN_AUTO_IMAGE_BODY_CHARS;
    const sourceFilter = typeof deps.getSourceFilter === 'function' ? deps.getSourceFilter : () => undefined;
    const report = deps.report || (() => {});
    const newId = deps.newId || (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    const locks = new Map();
    // 本聊天内已判定为人类的战斗对手：不再自动建档，避免每楼重复判定。
    const judgedHuman = new Set();
    const runningFloors = new Map(), pendingFloors = new Map();
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
        onError: () => report('info', '素材记录正在自动恢复，完成后继续原操作。'),
        pendingCount: () => pendingImages.size + pendingThumbs.size,
    });
    let offRendered = null;
    let offOnline = null, imageRecoveryTimer = null;
    let stopped = false;
    let recoveryController = new AbortController();
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

    // 当前生效的生图方案：任务冻结的预设优先，数据库生图等不冻结预设的任务取实时当前预设。
    const schemeFor = signal => {
        const frozen = imageTaskState({ signal })?.promptPreset;
        return frozen ? spriteSchemeOf(frozen.data) : (getPromptScheme ? getPromptScheme() : spriteSchemeOf(null));
    };
    const readSettings = signal => {
        const live = getSettings ? getSettings() || {} : {};
        const captured = imageTaskState({ signal })?.config;
        const raw = captured ? { ...live, imageApi: captured.imageApi, autoIllustration: captured.autoIllustration } : live;
        const imageApi = raw.imageApi && typeof raw.imageApi === 'object' ? raw.imageApi : {};
        return {
            auto: normalizeAutoIllustrationSettings(raw.autoIllustration),
            strict: isStrictBackgroundMatch(raw.autoIllustration),
            sceneAssets: raw.sceneAssets && typeof raw.sceneAssets === 'object' ? raw.sceneAssets : {},
            // 没写过这个开关时沿用旧行为：数据库生图的立绘打开透明底。
            dbgenSpriteTransparent: imageApi.dbgenSpriteTransparent !== false,
            naiSpriteTransparent: imageApi.naiSpriteTransparent !== false,
            matteColor: normalizeMatteColor(imageApi.spriteMatteColor),
            externalSpriteDna: imageApi.externalSpriteDna === true,
            promptScheme: schemeFor(signal),
            imageApi,
            ...(signal && { taskSignal: signal }),
            spriteModel: String(imageApi.spriteModel || '').trim(),
        };
    };

    const prepareExternalSpriteDna = createExternalSpriteDnaPreparation({ llm, readSettings,
        isExternal: externalSource, isBuiltin: signal => describeTask(signal).mode === 'nai', isStopped: () => stopped, readChat: () => messageHost.getChatId(),
        captureTarget: deps.captureCharacterDnaTarget,
        readLore: names => typeof messageHost.readCharacterLore === 'function'
            ? messageHost.readCharacterLore(names, { includeWorldInfo: typeof llm?.prepareImagePrompt !== 'function' }) : [],
    });
    async function withExternalSpriteDna(request = {}, generate) {
        const prepared = await prepareExternalSpriteDna(request);
        if (!prepared.ok) return prepared;
        return generate({ ...request, dna: prepared.dna, shouldStart: prepared.shouldStart });
    }

    function spriteTransparent(s = readSettings()) {
        const via = describeTask(s.taskSignal).via;
        if (via === 'dbgen') return s.dbgenSpriteTransparent;
        if (via === 'nai') return s.naiSpriteTransparent
            && supportsNaiTransparentBackground(s.spriteModel || s.auto.nai.model);
        return false;
    }

    const builtinSeeds = signal => describeTask(signal).mode === 'nai' || describeTask(signal).via === 'nai';
    const spriteSeed = (name, fallback, signal) => resolveImageSeed(
        builtinSeeds(signal) ? characterGenerationSeed(readSettings(signal).sceneAssets, name) ?? fallback : fallback);
    const backgroundSeed = async (name, imageId, signal) => {
        const saved = builtinSeeds(signal) ? sceneGenerationSeed(readSettings(signal).sceneAssets, name) : undefined;
        if (isImageSeed(saved)) return saved;
        const original = builtinSeeds(signal) && imageId ? await store.getImage(imageId) : null;
        return resolveImageSeed(original?.seed);
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
        return failure?.retryReady ? null : failure || null;
    }
    const isMissingImage = url => imageFailure(url)?.missing === true;
    const hasMissingImages = () => [...failedImages.values()].some(value => value.missing);
    const isUnavailableImage = url => Boolean(imageFailure(url));
    const hasUnavailableImages = () => failedImages.size > 0;
    function noteImageFailure(id, error) {
        const missing = ['image-file-not-found', 'image-empty'].includes(error.message);
        const previous = failedImages.get(id), token = cache.token(imageKey(id));
        const existed = Boolean(previous);
        const attempts = error?.result?.recoveryStopped ? RECOVERY_ATTEMPTS
            : previous?.token === token ? (previous.attempts || 0) + 1 : 1;
        failedImages.set(id, { missing, reason: error.message || 'image-read-failed', token, attempts, retryReady: false });
        if (!existed) emit({ imageId: id, reason: missing ? 'image-lost' : 'image-unavailable' });
        if (!missing && attempts < RECOVERY_ATTEMPTS && !imageRecoveryTimer) {
            imageRecoveryTimer = setTimeout(() => { imageRecoveryTimer = null; retryImageReads(false); }, 1000);
            imageRecoveryTimer?.unref?.();
        }
    }
    function retryImageReads(reconnected = true) {
        if (stopped || !failedImages.size) return;
        let ready = false;
        for (const [id, failure] of [...failedImages]) {
            if (failure.missing || (!reconnected && failure.attempts >= RECOVERY_ATTEMPTS)) continue;
            failedImages.set(id, { ...failure, ...(reconnected && { attempts: 0 }), retryReady: true });
            ready = true;
        }
        if (ready) emit({ reason: 'image-retry-ready' });
    }

    async function persistTempRecord(record) {
        const old = await recoverOperation(() => store.getAsset(record.key), { repeatable: 'read', signal: recoveryController.signal, isActive: () => !stopped });
        if (stopped) return;
        const saved = await recoverOperation(() => store.putAsset(record), { repeatable: 'save', signal: recoveryController.signal, isActive: () => !stopped });
        if (saved?.cancelled || stopped) return;
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

    function currentTempRecords() {
        const chatId = currentChat();
        return new Map([...tempCache.values()].filter(record => record.chatId === chatId).map(record => [record.key, record]));
    }

    function tempSpriteForOutfit(name, outfit) {
        const match = tempSpriteRecord(name), record = match?.record;
        return record?.characterKey === match?.characterKey && record?.outfitName === outfit ? tempUrl(record) : '';
    }

    function imageAvailability(url) {
        const id = generatedAssetIdOf(url);
        if (!id) return { status: 'unverified' };
        if (cache.peek(imageKey(id))) return { status: 'available' };
        const failure = imageFailure(url);
        return { status: failure ? (failure.missing ? 'missing' : 'read-error') : pendingImages.has(id) ? 'loading' : 'unverified' };
    }
    const retryImageRead = url => { failedImages.delete(generatedAssetIdOf(url)); return resolveUrl(url); };
    const clearImageReadFailures = () => failedImages.clear();

    function tempSpriteRecord(name) {
        const assets = readSettings().sceneAssets;
        const keyOf = value => buildCharacterContext([value], assets)[0]?.characterKey;
        const key = keyOf(name);
        if (!key) return null;
        const matches = [...currentTempRecords().values()].filter(record => record.type === 'sprite'
            && tempUrl(record) && keyOf(record.name) === key);
        // 历史别名记录只在唯一绑定时复用，不按 Map 顺序猜候选。
        return matches.length === 1 ? { record: matches[0], characterKey: key } : null;
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

    // 完整图片记录始终保留；保存暂时失败时续写同一记录，不删原图或遮罩。
    async function persistGeneratedImage(image) {
        const saved = await recoverOperation(() => store.putImage(image), { repeatable: 'save', signal: recoveryController.signal, isActive: () => !stopped });
        return saved?.cancelled || saved?.ok === false ? saved : { ok: true, ...(saved?.timing && { timing: saved.timing }) };
    }

    async function generateItem(item, s, floor, floorKey) {
        const isSprite = item.need.type === 'sprite';
        const spriteGuard = s.spriteShouldStart?.forCharacter?.(item.need.name) || s.spriteShouldStart;
        // 智绘姬 / 柏宝绘出图不保证透明底：走它们时按浅灰底模板出图并抠图，不信任 NAI 模型的原生透明能力。
        // NAI 与 DBG 分别读取自己的开关；原生透明能力仍由实际模型约束。
        const plannedVia = describeTask(s.taskSignal).via;
        const transparent = isSprite && spriteTransparent(s);
        const slot = inheritImageTaskLease(item, buildAssetSlot(externalSource(s.taskSignal)
            ? { ...item, need: { ...item.need, dna: undefined } } : item, {
            transparent,
            whiteBackground: isSprite && (plannedVia === 'nai' || plannedVia === 'dbgen') && !transparent,
            matteColor: s.matteColor,
            templates: s.auto.assets.templates,
            positiveContext: s.auto.nai.artistPrefix,
            scheme: s.promptScheme,
        }));
        const itemCreature = isSprite ? creatureOf(item.need.dna) : null;
        const size = itemCreature ? creatureCanvasSize(itemCreature, s.auto.assets.spriteSize)
            : isSprite ? s.auto.assets.spriteSize : backgroundSize(s);
        const seed = isSprite ? spriteSeed(item.need.name, undefined, s.taskSignal) : await backgroundSeed(item.need.name, undefined, s.taskSignal);
        // 数据库生图：描述只说明画什么。正负模板随 userPrompts 传出，出图前合并进最终 caption。
        const userPrompts = { positive: slot.scene, negative: slot.sceneUc };
        const characterContext = isSprite ? assetCharacterContext([item.need], s.sceneAssets) : undefined;
        const outfitName = isSprite && isValidOutfitName(item.need.outfitName) ? item.need.outfitName : '';
        const autoSpriteOutfitNames = outfitName && characterContext.length === 1
            ? [{ slotId: 1, characterKey: characterContext[0].characterKey, name: outfitName }] : [];
        const meta = {
            signal: s.taskSignal, messageId: floor.messageId, size, description: itemCreature ? creatureAssetDescription(item.need, { transparent, includeDna: !externalSource(s.taskSignal) })
                : buildDbgenAssetDescription(item.need, { transparent, includeDna: !externalSource(s.taskSignal), scheme: s.promptScheme }), userPrompts,
            skipRecall: true, seed,
            ...(isSprite && { characterContext }),
            ...(isSprite && spriteGuard && { shouldStart: spriteGuard }),
            ...(autoSpriteOutfitNames.length && { autoSpriteOutfitNames }),
            ...(isSprite && !externalSource(s.taskSignal) && hasSpriteDna(item.need.dna) && { replaceCharacterKeywords: false }),
            imageKind: isSprite ? 'sprite' : 'background',
            ...(itemCreature && { promptKind: 'creature' }),
            ...(transparent && { transparent: true }),
        };
        let result;
        try { result = isSprite && spriteGuard && !spriteGuard()
            ? { ok: false, error: '角色或 DNA 开关已变化，已停止' }
            : await nai.generate(slot, { ...s.auto.nai, size, seed }, meta); } catch (error) { result = { ok: false, error: `NAI 生成失败：${(error && error.message) || error}` }; }
        if (isSprite && spriteGuard && !spriteGuard()) result = { ok: false, error: '角色或 DNA 开关已变化，未接收迟到图片' };
        if (isSprite && result?.ok && result.characterMeta && autoSpriteOutfitNames.length) {
            const bound = bindAutoSpriteOutfitNames({ slotId: 1, characterMeta: result.characterMeta },
                { purpose: 'sprite' }, autoSpriteOutfitNames);
            result = { ...result, characterMeta: bound.characterMeta };
        }
        const key = tempAssetKeyOf(floor.chatId, item.need);
        const base = {
            key, chatId: floor.chatId, floorKey, messageId: floor.messageId, swipeId: floor.swipeId,
            type: item.need.type, name: item.need.name, time: item.need.time || '', weather: item.need.weather || '',
            ...(item.need.variantOf && { variantOf: item.need.variantOf }),
            ...(outfitName && { outfitName }),
            tags: item.tags, createdAt: now(),
        };
        let image, imageId;
        if (result && result.ok && result.dataUrl) {
            imageId = newId();
            image = isSprite
                ? await buildSpriteImageRecord(imageId, result.dataUrl, transparent, base.createdAt)
                : { id: imageId, dataUrl: result.dataUrl, type: item.need.type, createdAt: base.createdAt };
            if (isSprite && spriteGuard && !spriteGuard()) result = staleSprite(spriteGuard);
        }
        let record;
        if (result && result.ok && result.dataUrl) {
            const prompt = storedPromptFromResult(result);
            if (prompt) { image.prompt = prompt; Object.assign(image, promptProvenance(prompt)); }
            if (isSprite && result.characterMeta) image.characterMeta = result.characterMeta;
            if (builtinSeeds(s.taskSignal)) image.seed = resolveImageSeed(result.seed ?? seed);
            const saved = await persistGeneratedImage(image);
            rememberImage(imageId, image.dataUrl);
            record = { ...base, imageId, status: 'review', ...(isImageSeed(image.seed) && { seed: image.seed }), ...(saved.diagnostic ? { sourceUnavailable: saved.diagnostic } : {}) };
            if (image.characterMeta) record.characterMeta = image.characterMeta;
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
        const seed = await backgroundSeed(need.name, need.variantOf, s.taskSignal);
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
                result = await generateCaption({ signal: s.taskSignal, caption, size: backgroundSize(s), seed, imageKind: 'background' });
            } catch (error) {
                result = { ok: false, error: `出图失败：${(error && error.message) || error}` };
            }
            if (result && result.ok && result.dataUrl) {
                const imageId = newId();
                const image = { id: imageId, dataUrl: result.dataUrl, type: 'background', createdAt: base.createdAt,
                    ...(builtinSeeds(s.taskSignal) && { seed: resolveImageSeed(result.seed ?? seed) }) };
                const prompt = storedPromptFromResult(result, caption);
                if (prompt) { image.prompt = prompt; Object.assign(image, promptProvenance(prompt)); }
                await persistGeneratedImage(image);
                rememberImage(imageId, image.dataUrl);
                record = { ...base, imageId, status: 'review', ...(isImageSeed(image.seed) && { seed: image.seed }) };
            } else {
                record = { ...base, imageId: '', status: 'failed', error: (result && result.error) || '出图失败' };
                report('error', `「${need.name}」${need.time}差分生成失败：${record.error}`);
            }
        }
        await persistTempRecord(record);
        if (record.status !== 'skipped') emit({ chatId: floor.chatId, messageId: floor.messageId, swipeId: floor.swipeId, key, reason: 'generated' });
        return record;
    }

    // 本楼缺背景同次写词；内置活动预设完成全部要求，之后只发送定稿。
    async function generateBackgroundBatch(items, s, floor, floorKey) {
        const needs = items.map((item) => item.need);
        const builtin = describeTask(s.taskSignal).mode === 'nai' && typeof llm?.prepareImagePrompt === 'function';
        const requirements = builtin ? buildAssetSlot({ need: { type: 'background' }, tags: '', uc: '' },
            { templates: s.auto.assets.templates }) : null;
        let written;
        try {
            written = await writePrompt({ signal: s.taskSignal,
                description: buildDbgenBackgroundBatchDescription(needs),
                imagePromptTask: 'background',
                messageId: floor.messageId,
                ...(builtin && {
                    outputs: { slotIds: needs.map((_, index) => index + 1) },
                    userPrompts: { positive: requirements.scene,
                        negative: requirements.sceneUc },
                    writingRequirements: { size: backgroundSize(s), transparent: false },
                }),
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
            const entry = builtin ? captions.find(row => row.slotId === index + 1) : captions[index];
            const seed = await backgroundSeed(item.need.name, undefined, s.taskSignal);
            const caption = entry?.caption;
            const slot = builtin ? null : buildAssetSlot(item, { transparent: false, templates: s.auto.assets.templates });
            let result;
            if (!caption) {
                result = { ok: false, error: written && written.error ? written.error : '没有对应的背景提示词' };
            } else {
                try {
                    result = await generateCaption(inheritImageTaskLease(entry, { signal: s.taskSignal,
                        caption,
                        seed,
                        size: backgroundSize(s),
                        imageKind: 'background',
                        messageId: floor.messageId,
                        ...(builtin ? { captionMode: 'final' }
                            : { userPrompts: { positive: slot.scene, negative: slot.sceneUc } }),
                    }));
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
                const image = { id: imageId, dataUrl: result.dataUrl, type: item.need.type, createdAt: base.createdAt,
                    ...(builtinSeeds(s.taskSignal) && { seed: resolveImageSeed(result.seed ?? seed) }) };
                const prompt = storedPromptFromResult(result);
                if (prompt) { image.prompt = prompt; Object.assign(image, promptProvenance(prompt)); }
                await store.putImage(image);
                rememberImage(imageId, image.dataUrl);
                record = { ...base, imageId, status: 'review', ...(isImageSeed(image.seed) && { seed: image.seed }) };
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
        // 非人角色按形态、体型、落地、画布分批：固定词与取景因档案而异；人类角色全部落在同一组，流程不变。
        const profileKey = item => { const p = creatureOf(item.need.dna); return p ? [p.form, p.size, p.anchor, p.canvas].join('|') : ''; };
        if (new Set(items.map(profileKey)).size > 1) {
            const groups = new Map();
            for (const item of items) groups.set(profileKey(item), [...(groups.get(profileKey(item)) || []), item]);
            const merged = [];
            for (const group of groups.values()) merged.push(...await generateSpriteBatch(group, s, floor, floorKey));
            return merged;
        }
        const profile = creatureOf(items[0]?.need.dna), creature = Boolean(profile);
        const records = [];
        const guardOf = item => s.spriteShouldStart?.forCharacter?.(item.need.name) || s.spriteShouldStart;
        const itemCurrent = item => !guardOf(item) || guardOf(item)();
        let stopError = '';
        const template = items.every(item => usesCharacterTemplates(taskBackend(s.taskSignal), item.need.dna));
        const paintMeta = template ? expressionPaintMeta({ template: true, signal: s.taskSignal, creature: profile }) : null;
        const transparent = template ? paintMeta.transparent : spriteTransparent(s);
        const builtin = template && describeTask(s.taskSignal).mode === 'nai' && typeof llm?.prepareImagePrompt === 'function';
        const numberedText = builtin ? toReadableText(floor.text) : undefined;
        const previousText = builtin ? messageHost.readPreviousAiTexts(floor.messageId, s.auto.llm.contextFloors)
            .map(toReadableText).join('\n') : undefined;
        let lore;
        if (builtin && typeof messageHost.readCharacterLore === 'function') {
            try {
                lore = await messageHost.readCharacterLore(items.filter(item => !item.need.dna || creatureNeedsReference(item.need.dna)).map(item => item.need.name),
                    { includeWorldInfo: creature });
                if (!Array.isArray(lore)) throw new Error('invalid-lore');
            } catch {
                stopError = '角色设定读取失败，未发送自动立绘请求';
            }
        }
        // 整次点击先冻结全部身份；下一批不重新读取已改变的资料。
        const story = template ? cgCharacterState(floor.text, items.map(item => item.need.name), s.sceneAssets,
            typeof messageHost.readPreviousAiTexts === 'function'
                ? messageHost.readPreviousAiTexts(floor.messageId, 3) : []) : null;
        const contexts = template ? new Map(items.map((item) => {
            const c = story.atFirstAppearance(item.need.name);
            const name = isValidOutfitName(item.need.outfitName) ? item.need.outfitName : c.outfit.name;
            const description = name === c.outfit.name ? c.outfit.description
                : c.outfits.find(outfit => outfit.name === name)?.description || '';
            return [item.need.name, singleCharacterContext(c.characterKey, c.dna,
                name ? { name, prompt: description } : undefined,
                s.sceneAssets)[0]];
        })) : null;
        // 写词即存：写词返回的身份 DNA 与新衣装立刻入库，不等图片入库；记下改动供丢弃图片时还原。
        const saveWrittenProfile = (input, characterName) => {
            if (externalSource(s.taskSignal) || typeof deps.captureCharacterDnaTarget !== 'function') return undefined;
            let target;
            try { target = deps.captureCharacterDnaTarget(characterName); } catch { return undefined; }
            if (!target || (target.owner && target.scope && target.owner !== target.scope)) return undefined;
            const prepared = prepareCharacterCaption(input);
            if (!prepared.ok) return undefined;
            const write = { version: 1, character: target.name, scope: target.scope, owner: target.owner || '' };
            const candidate = prepared.dnaCandidates?.characters?.find(c => c.characterKey === target.name);
            if (candidate) {
                const before = target.rawDna?.() ?? null;
                const dna = prepareCharacterDnaSave(target.dna, candidate, target.name);
                const saved = dna.ok ? target.save(dna.dna) : null;
                if (saved?.ok) write.dna = { before, after: target.rawDna?.() ?? saved.dna };
            }
            const clothing = prepared.outfitSnapshot?.characters?.find(c => c.characterKey === target.name && c.source === 'candidate');
            if (clothing && isValidOutfitName(clothing.name) && !isBuiltinNudeOutfit(clothing.name) && typeof target.saveOutfit === 'function') {
                const saved = target.saveOutfit(clothing);
                if (saved?.ok && saved.created) write.outfit = { name: saved.name, entry: saved.entry,
                    ...(saved.wardrobeKey && { wardrobeKey: saved.wardrobeKey, wardrobe: saved.wardrobe }) };
            }
            return write.dna || write.outfit ? write : undefined;
        };
        const putSpriteRecord = async (item, result, profileWrite) => {
            if (!itemCurrent(item)) result = staleSprite(guardOf(item));
            const key = tempAssetKeyOf(floor.chatId, item.need);
            const base = {
                key, chatId: floor.chatId, floorKey, messageId: floor.messageId, swipeId: floor.swipeId,
                type: item.need.type, name: item.need.name, time: item.need.time || '', weather: item.need.weather || '',
                ...(isValidOutfitName(item.need.outfitName) && { outfitName: item.need.outfitName }),
                tags: item.tags, createdAt: now(),
            };
            let record;
            if (result && result.ok && result.dataUrl) {
                const imageId = newId();
                const image = await buildSpriteImageRecord(imageId, result.dataUrl, transparent, base.createdAt);
                if (!itemCurrent(item)) return putSpriteRecord(item, staleSprite(guardOf(item)));
                if (builtinSeeds(s.taskSignal) && isImageSeed(result.seed)) image.seed = result.seed;
                const prompt = storedPromptFromResult(result);
                if (prompt) { image.prompt = prompt; Object.assign(image, promptProvenance(prompt)); }
                if (result.characterMeta) image.characterMeta = result.characterMeta;
                Object.assign(image, characterPromptRecovery(result));
                if (result.identityContext) image.identityContext = structuredClone(result.identityContext);
                if (result.outfitContext) image.outfitContext = structuredClone(result.outfitContext);
                const saved = await persistGeneratedImage(image);
                rememberImage(imageId, image.dataUrl);
                record = { ...base, imageId, status: 'review', ...(isImageSeed(image.seed) && { seed: image.seed }), ...promptProvenance(image), ...characterPromptRecovery(image),
                    ...(profileWrite && { profileWrite }),
                    ...(image.identityContext && { identityContext: structuredClone(image.identityContext) }),
                    ...(image.outfitContext && { outfitContext: structuredClone(image.outfitContext) }),
                    ...(saved.diagnostic ? { sourceUnavailable: saved.diagnostic } : {}) };
                if (image.characterMeta) record.characterMeta = image.characterMeta;
            } else {
                record = { ...base, imageId: '', status: 'failed', error: (result && result.error) || 'NAI 生成失败' };
                report('error', `素材「${item.need.name}」生成失败：${record.error}`);
            }
            await persistTempRecord(record);
            emit({ chatId: floor.chatId, messageId: floor.messageId, swipeId: floor.swipeId, key, reason: 'generated' });
            return record;
        };
        for (const group of splitWriteBatches(items)) {
            const batch = [];
            for (const item of group) {
                if (itemCurrent(item)) batch.push(item);
                else records.push(await putSpriteRecord(item, staleSprite(guardOf(item))));
            }
            if (!batch.length) continue;
            const batchCurrent = () => batch.map(itemCurrent).some(Boolean);
            if (s.spriteShouldStart && !s.spriteShouldStart()) stopError = '角色或 DNA 开关已变化，已停止';
            if (stopError) {
                for (const item of batch) records.push(await putSpriteRecord(item, { ok: false, error: stopError }));
                continue;
            }
            let written;
            const context = template ? [...new Map(batch.map((item) => {
                const c = contexts.get(item.need.name); return [c.characterKey, c];
            })).values()] : undefined;
            const task = template ? characterPromptTask(context, 'sprite', 'half_body',
                batch.map((item) => [contexts.get(item.need.name).characterKey])) : null;
            const autoSpriteOutfitNames = creature ? [] : batch.flatMap((item, index) => isValidOutfitName(item.need.outfitName)
                ? [{ slotId: index + 1, characterKey: template ? contexts.get(item.need.name).characterKey
                    : buildCharacterContext([item.need.name], s.sceneAssets)[0]?.characterKey,
                name: item.need.outfitName }] : []);
            try {
                written = await writePrompt({ signal: s.taskSignal,
                    imagePromptTask: 'sprite',
                    shouldStart: batchCurrent,
                    ...(autoSpriteOutfitNames.length && { autoSpriteOutfitNames }),
                    description: creature ? creatureSpriteBatchDescription(batch.map(item => ({ name: item.need.name, profile: item.need.dna.creature })))
                        : template ? '整理本轮角色的三景别纯 TAG 外貌、独立性格与指定衣装 DNA。每份第一行必须是 slotid: 本轮实际槽号，第二行是 character: 规范角色键，单人单份也不能省略图头。首次身份候选在明确设定内协调补全普通外貌，新衣装缺说明时逐件用准确英文 TAG 表达颜色、材质与款式，无法准确表达的细节省略；已有资料逐字保留。三景别只写稳定身体外貌，不夹带衣装、灰尘、临时伤势、表情或姿态；衣装独立交付。可选身份 UC 只写实际英文排除标签，无额外项则省略或留空，不写默认值或沿用说明。只交资料字段，不生成构图、动作、场景或完整绘图提示词。\n' + DNA_WEIGHT_RULE
                        : buildDbgenSpriteBatchDescription(batch.map((item) => item.need), { transparent, template, includeDna: !externalSource(s.taskSignal), scheme: s.promptScheme }),
                    messageId: floor.messageId,
                    ...(builtin && { numberedText, previousText,
                        ...(lore !== undefined && { lore }),
                        outputs: { slotIds: task.promptTask.slots.map(slot => slot.slotId) } }),
                    ...(template ? { ...task, outputs: { format: 'sprite-data' }, userPrompts: paintMeta.userPrompts,
                        writingRequirements: { size: paintMeta.size, transparent, framing: creature ? creatureFraming(profile) : 'half_body' } }
                        : { characterContext: assetCharacterContext(batch.map((item) => item.need), s.sceneAssets) }),
                });
            } catch (error) {
                written = { ok: false, error: `写提示词失败：${(error && error.message) || error}` };
            }
            if (!batchCurrent()) written = staleSprite(s.spriteShouldStart);
            const captions = written && written.ok && Array.isArray(written.captions) ? written.captions : [];
            if (!written || !written.ok) {
                stopError = written && written.error ? written.error : '写提示词失败';
                for (const item of batch) records.push(await putSpriteRecord(item, { ok: false, error: stopError }));
                continue;
            }
            for (let index = 0; index < batch.length; index += 1) {
                const item = batch[index];
                const spriteGuard = guardOf(item);
                if (!itemCurrent(item)) {
                    records.push(await putSpriteRecord(item, staleSprite(spriteGuard)));
                    continue;
                }
                const found = bindAutoSpriteOutfitNames(captions.find((entry) => Number(entry.slotId) === index + 1),
                    task?.promptTask || { purpose: 'sprite' }, autoSpriteOutfitNames);
                const caption = found && found.caption;
                const seed = spriteSeed(item.need.name, undefined, s.taskSignal);
                const slot = buildAssetSlot({ need: { type: 'sprite', name: item.need.name }, tags: '', uc: '' },
                    { transparent, whiteBackground: !transparent, matteColor: s.matteColor, templates: s.auto.assets.templates, scheme: s.promptScheme });
                const prompts = creature ? creatureFixedPrompts(profile, { transparent, whiteBackground: !transparent, matteColor: s.matteColor })
                    : expressionSpritePrompts(slot.scene, slot.sceneUc, s.promptScheme);
                let result, profileWrite;
                if (!caption) {
                    result = { ok: false, error: '没有对应的立绘提示词' };
                } else if (template) {
                    if (!found.promptRecipe) result = { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '立绘写词缺少动态模板' };
                    else {
                        const input = characterTemplateInput(found, task.promptTask, task.characterContext);
                        try { profileWrite = saveWrittenProfile(input, contexts.get(item.need.name).characterKey); } catch { profileWrite = undefined; }
                        try {
                            result = await generateCaption({ signal: s.taskSignal, ...input, size: paintMeta.size, seed,
                                imageKind: 'sprite', promptKind: creature ? 'creature' : 'sprite', messageId: floor.messageId,
                                ...(spriteGuard && { shouldStart: spriteGuard }),
                                ...(transparent && { transparent: true }), replaceCharacterKeywords: false });
                            if (result.ok) result = { ...result, ...spriteAdoptionEvidence(input, result), ...outfitAdoptionEvidence(input, result) };
                        } catch (error) { result = { ok: false, error: error.message || '出图失败' }; }
                    }
                } else {
                    try {
                        result = await generateCaption({ signal: s.taskSignal,
                            caption: externalSource(s.taskSignal) || creature ? caption : uprightSpriteCaption(caption, s.promptScheme) || caption,
                            size: creature ? creatureCanvasSize(profile, s.auto.assets.spriteSize) : s.auto.assets.spriteSize,
                            ...(creature && { promptKind: 'creature' }),
                            seed,
                            characterMeta: found.characterMeta,
                            imageKind: 'sprite',
                            messageId: floor.messageId,
                            ...(transparent && { transparent: true }),
                            userPrompts: { positive: prompts.positive, negative: prompts.negative },
                            ...(spriteGuard && { shouldStart: spriteGuard }),
                        });
                        if (result.ok && found.characterMeta) result = {
                            ...result, characterMeta: found.characterMeta,
                        };
                    } catch (error) {
                        result = { ok: false, error: `NAI 生成失败：${(error && error.message) || error}` };
                    }
                }
                if (!itemCurrent(item)) result = staleSprite(spriteGuard);
                if (builtinSeeds(s.taskSignal) && result?.ok) result = { ...result, seed: resolveImageSeed(result.seed ?? seed) };
                records.push(await putSpriteRecord(item, result, profileWrite));
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

    // 自动建的临时档案形态待定：先判定对手是人类、半人形还是完全非人形。
    // 人类：删除临时档案，按原人类流程补立绘；半人形与完全非人形：写入形态继续非人流程；判定失败的本轮跳过，下一楼再试。
    async function judgeAutoCreatureForms(needs, spriteNeeds, s, floor, messageId) {
        const pending = needs.filter(need => need.type === 'sprite' && creatureOf(need.dna)?.form === 'auto');
        if (!pending.length) return s;
        const names = pending.map(need => need.name);
        let verdict = {};
        try {
            let lore = [];
            if (typeof messageHost.readCharacterLore === 'function') lore = await messageHost.readCharacterLore(names, { includeWorldInfo: true }).catch(() => []);
            const user = creatureFormJudgeDescription({ names, readableText: toReadableText(floor.text), lore: Array.isArray(lore) ? lore : [] });
            const judged = await requestWithSoftRetry(llm, { signal: s.taskSignal, system: CREATURE_FORM_JUDGE_RULE,
                softSystem: CREATURE_FORM_JUDGE_RULE, user, ...(s.spriteShouldStart && { shouldStart: s.spriteShouldStart }),
                parse: reply => parseCreatureFormJudgement(reply, names) }, s.auto.llm);
            if (judged.ok) verdict = judged.verdict;
        } catch { /* 判定失败按未判定处理。 */ }
        const drop = new Set();
        const registerOne = async hint => { try { await deps.registerCreatureProfiles?.([hint]); } catch { /* 保存失败不阻断本楼。 */ } };
        for (const need of pending) {
            const form = verdict[need.name];
            if (!form) { drop.add(need); continue; }
            if (form === 'human') {
                judgedHuman.add(`${floor.chatId}|${need.name}`);
                await registerOne({ name: need.name, source: 'discard' });
                need.dna = undefined;
            } else {
                await registerOne({ name: need.name, source: 'creature', form });
                need.dna = { ...need.dna, creature: { ...need.dna.creature, form } };
            }
        }
        if (drop.size) {
            report('warn', `第 ${messageId} 楼战斗对手「${[...drop].map(need => need.name).join('、')}」的形态判定失败，本轮不补立绘`);
            for (const list of [needs, spriteNeeds]) for (let i = list.length - 1; i >= 0; i -= 1) if (drop.has(list[i])) list.splice(i, 1);
        }
        return { ...s, sceneAssets: readSettings(s.taskSignal).sceneAssets };
    }

    async function run(messageId, floor, key, s, manual, refresh = false) {
        if (manual) s.auto.assets = { ...s.auto.assets, spriteEnabled: true, backgroundEnabled: true };
        // 失败或中途刷新残留的 planning 不算处理完，下次渲染时重试。
        const previous = await store.getFloor(key);
        // 已完成楼层不因重复渲染重发；仅手动补全或成功任务期间收到的新正文通知可重算。
        if (!manual && !refresh && previous?.status === 'done') return { ok: true, reason: 'already-decided' };
        // 重算仍按有效素材匹配，已有图片不会重复生成。
        // 不记成已处理：用户点「继续」把这楼写长后，下次渲染照常补素材。
        const bodyChars = floorBodyLength(floor.text, sourceFilter());
        if (!manual && bodyChars < minBodyChars) {
            report('info', `第 ${messageId} 楼跳过素材补全：正文只有 ${bodyChars} 字，少于 ${minBodyChars} 字不自动生图`);
            return { ok: true, reason: 'body-too-short' };
        }
        const numbered = numberParagraphs(floor.text);
        const outfitResolver = createOutfitResolver(s.sceneAssets);
        // 原名只用于本次补图，不经衣装词池改名，也不把楼末换装套到首次触发上。
        const characterTriggers = extractSceneDirectives(floor.text, {
            outfitResolver: (name, token) => {
                const resolved = outfitResolver(name, token);
                return resolved && isValidOutfitName(token) ? token : resolved;
            },
        }).directives.filter(d => d.type === 'char' || d.type === 'thought');
        // AI 标注的非人角色与战斗对手：先登记档案（战斗对手建临时档），本楼随即按档案补立绘。
        // 战斗对手自动建档的排除：开关关闭、近期以角色标签或说话人出现过的人物、本聊天已判为人类的名字。
        const spokenKeys = new Set();
        const canonicalOf = name => resolveCharacterKey({ ...s.sceneAssets.characterDna, ...s.sceneAssets.characters, ...s.sceneAssets.characterOutfits },
            s.sceneAssets.characterAliases || {}, name) || String(name || '').trim();
        const noteSpeakers = text => { try { for (const name of numberParagraphs(text).characters) spokenKeys.add(canonicalOf(name)); } catch { /* 解析失败按未出现处理。 */ } };
        noteSpeakers(floor.text);
        if (typeof messageHost.readPreviousAiTexts === 'function') {
            try { for (const text of messageHost.readPreviousAiTexts(messageId, Math.max(3, s.auto.llm.contextFloors || 0))) noteSpeakers(text); } catch { /* 读不到前文时只按本楼判断。 */ }
        }
        const creatureHints = s.auto.assets.spriteEnabled ? creatureHintsOf(floor.text)
            .filter(hint => hint.source !== 'battle' || (s.auto.assets.creatureAutoProfile !== false
                && !spokenKeys.has(canonicalOf(hint.name)) && !judgedHuman.has(`${floor.chatId}|${hint.name}`))) : [];
        if (creatureHints.length && typeof deps.registerCreatureProfiles === 'function') {
            try {
                const registered = await deps.registerCreatureProfiles(creatureHints);
                if (registered?.ok && registered.changed) s = { ...s, sceneAssets: readSettings(s.taskSignal).sceneAssets };
            } catch { /* 登记失败不阻断本楼其余素材。 */ }
        }
        const creatureNames = creatureHints.map(hint => canonicalOf(hint.name)).filter(name => creatureOf(s.sceneAssets.characterDna?.[name]));
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
                ? collectAssetNeeds({ scenes: [], characters: [...numbered.characters, ...creatureNames.filter(name => !numbered.characters.includes(name))], characterTriggers }, match, { background: false, sprite: true, limit: s.auto.assets.maxPerFloor })
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
        s = await judgeAutoCreatureForms(needs, spriteNeeds, s, floor, messageId);
        if (!needs.length && !variantNeeds.length && !dayFirst.length) {
            await store.putFloor(key, { status: 'done', count: 0, updatedAt: now() });
            return { ok: true, reason: 'nothing-missing' };
        }
        let backend = describeTask(s.taskSignal);
        if (!backend.ready.ok && typeof nai.waitUntilReady === 'function') {
            const ready = await nai.waitUntilReady({ signal: s.taskSignal || recoveryController.signal,
                shouldStart: () => !stopped && messageHost.getChatId() === floor.chatId
                    && floorKeyOf(messageHost.readFloor(messageId) || {}) === key });
            if (!ready.ok) return ready;
            backend = describeTask(s.taskSignal);
        }
        if (!backend.ready.ok) {
            await store.putFloor(key, { status: 'failed', error: backend.ready.error, updatedAt: now() });
            report('error', `第 ${messageId} 楼素材未开始：${backend.ready.error}`);
            return { ok: false, reason: 'backend-unavailable', error: backend.ready.error };
        }
        const floorFailure = () => {
            const live = messageHost.readFloor(messageId);
            if (stopped) return '生成任务已停止';
            if (messageHost.getChatId() !== floor.chatId) return '当前聊天已切换';
            if (!live) return '生成所用楼层已不存在';
            if (floorKeyOf(live) !== key) return '生成所用楼层或回复分支已变化';
            return '';
        };
        const floorCurrent = () => !floorFailure();
        let preparedGuard;
        if (externalSource(s.taskSignal) && s.externalSpriteDna && spriteNeeds.length) {
            report('info', `检查本楼 ${spriteNeeds.length} 个角色的 DNA，缺资料角色将一次合并生成…`);
            const prepared = await prepareExternalSpriteDna.batch({ characters: spriteNeeds.map(({ name, dna }) => ({ name, dna })),
                onProgress: event => { if (event.message) report('info', event.message); },
                shouldStart: floorCurrent, numberedText: toReadableText(floor.text),
                previousText: typeof messageHost.readPreviousAiTexts === 'function'
                    ? messageHost.readPreviousAiTexts(messageId, s.auto.llm.contextFloors).map(toReadableText).join('\n') : '' });
            if (!prepared.ok) {
                await store.putFloor(key, { status: 'failed', error: prepared.error, updatedAt: now() });
                report('error', `第 ${messageId} 楼未继续生成立绘：${prepared.error}`);
                return { ...prepared, stopGeneration: true };
            }
            for (const need of spriteNeeds) need.dna = prepared.characters.find(row => row.name === need.name)?.dna;
            s = { ...s, sceneAssets: readSettings().sceneAssets };
            preparedGuard = prepared.shouldStart;
        }
        if (spriteNeeds.length) s = { ...s, spriteShouldStart: () => floorCurrent() && (!preparedGuard || preparedGuard()) };
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
        const builtinTemplates = backend.mode === 'nai' && typeof llm?.prepareImagePrompt === 'function'
            && typeof writePrompt === 'function' && typeof generateCaption === 'function';
        if (needs.length && (backend.ownPrompts || builtinTemplates)) {
            // 内置人物任务复用模板批处理，不先写一轮旧内容词再补身份。
            report('info', builtinTemplates
                ? `第 ${messageId} 楼缺少 ${needs.length} 项素材，正在使用内置写词链…`
                : `第 ${messageId} 楼缺少 ${needs.length} 项素材，正在交给数据库生图插件…`);
            plan = { ok: true, items: needs.map((need) => ({ need, tags: '' })) };
        } else if (needs.length) {
            report('info', `第 ${messageId} 楼缺少 ${needs.length} 项素材，正在请求副 LLM…`);
            try {
                const previousText = messageHost.readPreviousAiTexts(messageId, s.auto.llm.contextFloors)
                    .map(toReadableText).join('\n');
                // 没登记 DNA 的角色补酒馆里的外貌参考（用户人设、角色卡、世界书），DNA 仍优先。
                const loreNames = needs.filter((need) => need.type === 'sprite' && !need.dna).map((need) => need.name);
                const lore = loreNames.length && typeof messageHost.readCharacterLore === 'function'
                    ? await messageHost.readCharacterLore(loreNames,
                        { includeWorldInfo: typeof llm?.prepareImagePrompt !== 'function' }).catch(() => [])
                    : [];
                const description = buildAssetPlannerUserPrompt({
                    needs: externalSource(s.taskSignal) ? needs.map(need => ({ ...need, dna: undefined })) : needs,
                    readableText: toReadableText(floor.text), previousText, lore });
                const user = externalSource(s.taskSignal) ? externalPromptDescription(description,
                    assetCharacterContext(needs, s.sceneAssets),
                    { imagePromptTask: 'sprite' }) : description;
                plan = await requestWithSoftRetry(llm, { signal: s.taskSignal,
                    system: ASSET_PLANNER_SYSTEM_PROMPT,
                    softSystem: ASSET_PLANNER_SOFT_SYSTEM_PROMPT,
                    user,
                    ...(s.spriteShouldStart && { shouldStart: s.spriteShouldStart }),
                    imagePrompt: { task: needs.some(need => need.type === 'sprite') ? 'sprite' : 'background',
                        input: { description: user,
                        outputs: { format: 'asset-plan', items: needs.map((need, index) => ({
                            id: `${need.type === 'background' ? 'bg' : 'ch'}${index + 1}`, type: need.type })) } } },
                    parse: (reply) => parseAssetPlan(reply, needs),
                }, s.auto.llm);
            } catch (error) {
                plan = { ok: false, error: '副 LLM 规划失败' };
            }
        }
        if (!plan.ok && !plan.stopGeneration) {
            const items = buildDictionaryAssetItems(needs);
            report('warn', `第 ${messageId} 楼素材规划失败：${plan.error}${items.length ? '，改用内置词典兜底' : ''}`);
            if (items.length) plan = { ok: true, items, fromDictionary: true };
        }
        if (!plan.ok) {
            await store.putFloor(key, { status: 'failed', error: plan.error, updatedAt: now() });
            report('error', `第 ${messageId} 楼素材未发送生图请求：${plan.error}`);
            return { ok: false, reason: plan.reason || 'plan-failed', error: plan.error };
        }
        const backgrounds = plan.items.filter((item) => item.need && item.need.type === 'background');
        const sprites = plan.items.filter((item) => item.need && item.need.type === 'sprite');
        const batchBackgrounds = (backend.ownPrompts || builtinTemplates) && backgrounds.length && nai && typeof writePrompt === 'function';
        const batchSprites = (backend.ownPrompts || builtinTemplates) && sprites.length && nai && typeof writePrompt === 'function';
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
        if (locks.has(key)) {
            if (!manual && runningFloors.has(key) && runningFloors.get(key) !== floor.text)
                pendingFloors.set(key, floor.text);
            return locks.get(key);
        }
        const job = (async () => {
            let current = floor, config = s, result, refresh = false;
            do {
                pendingFloors.delete(key);
                runningFloors.set(key, current.text);
                const shouldStart = () => !stopped && messageHost.getChatId() === current.chatId
                    && floorKeyOf(messageHost.readFloor(Number(messageId)) || {}) === key;
                const target = bindImageTaskTarget({ signal: recoveryController.signal,
                    subscribe: messageHost.on?.bind(messageHost), isCurrent: shouldStart });
                const input = { signal: target.signal, shouldStart: target.shouldStart };
                const execute = guarded => recoverOperation(() => run(Number(messageId), current, key,
                    readSettings(guarded.signal), manual, refresh), {
                    retryUnchanged: false,
                    signal: guarded.signal, isActive: guarded.shouldStart,
                    onRecover: () => report('info', '素材任务正在自动恢复'),
                });
                try { result = await (typeof llm?.runImageTask === 'function'
                    ? llm.runImageTask(input, execute) : execute(input)); }
                finally { target.release(); }
                // 只消费成功处理期间收到的新正文通知；失败不自动重发。
                if (!result?.ok || result.stopGeneration || !pendingFloors.has(key)) break;
                const latest = messageHost.readFloor(messageId);
                if (!latest?.isAi || !latest.isLatest || floorKeyOf(latest) !== key
                    || latest.text === current.text) break;
                config = readSettings();
                if (!config.sceneAssets.enabled
                    || (!config.auto.assets.spriteEnabled && !config.auto.assets.backgroundEnabled)) break;
                current = latest;
                refresh = true;
            } while (true);
            return result;
        })()
            .catch((error) => {
                if (error.code === 'media-metadata-stale') return { ok: false, reason: 'stale-chat' };
                retryTarget = { chatId: floor.chatId, messageId: Number(messageId), manual };
                report('error', `素材生成异常：${(error && error.message) || error}`);
                return { ok: false, reason: 'error', error: '素材生成失败' };
            })
            .then(result => { if (result.ok && retryTarget?.chatId === floor.chatId && retryTarget?.messageId === Number(messageId)) retryTarget = null; return result; })
            .finally(() => { releaseDayBases(key); locks.delete(key); runningFloors.delete(key); pendingFloors.delete(key); });
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

    async function setStatus(key, status, expected) {
        const record = await readRecord(key);
        if (!record) return { ok: false, reason: 'not-found' };
        if (expected && (record.imageId !== expected.imageId || record.status !== expected.status
            || (Object.hasOwn(expected, 'updatedAt') && record.updatedAt !== expected.updatedAt))) {
            return { ok: false, reason: 'DNA_ADOPTION_CONFLICT' };
        }
        const next = { ...record, status, updatedAt: now() };
        if (status === 'discarded') next.imageId = '';
        await store.putAsset(next);
        if (!stopped) tempCache.remember(next);
        if (status === 'discarded' && record.imageId) {
            const deleted = await deleteImagesImpl([record.imageId]);
            if (!deleted.ok) return deleted;
            if (!deleted.retainedIds?.includes(record.imageId)) next.imageId = '';
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
    async function saveMatteEdit(imageId, expectedRevision, patch, options = {}) {
        if (!store || typeof store.updateImage !== 'function') return { ok: false, reason: 'update-unsupported' };
        const linked = linkRecoverySignals([recoveryController.signal, options.signal]);
        let result, attemptedRevision;
        try { result = await recoverOperation(async () => {
            const record = await store.getImageRecord?.(imageId) || await store.getImage(imageId);
            attemptedRevision = record?.revision ?? expectedRevision;
            return store.updateImage(imageId, attemptedRevision, patch, now());
        }, { repeatable: 'save', signal: linked.signal, isActive: () => !stopped,
            repair: async result => {
                if (!['stale-revision', 'revision-conflict'].includes(result?.reason)) return;
                const latest = await store.getImageRecord?.(imageId) || await store.getImage(imageId);
                return { changed: Boolean(latest && latest.revision !== attemptedRevision) };
            },
            shouldRecover: value => !['source-unavailable', 'not-found', 'empty-result'].includes(value?.reason) });
        } finally { linked.release(); }
        if (!result || !result.ok) return result || { ok: false, reason: 'update-failed' };
        invalidateThumb(imageId);
        rememberImage(imageId, result.record.dataUrl);
        emit({ imageId, reason: 'matte-edited', revision: result.record.revision });
        return { ok: true, revision: result.record.revision };
    }

    async function deleteImagesImpl(ids) {
        const wanted = [...new Set(ids || [])].filter(Boolean);
        if (!wanted.length) return { ok: true };
        // 整批预检后，每张实际删除前再次读取；文件适配器将复核下沉至异步读图之后。
        const readHeld = async () => {
            const held = new Set();
            if (deps.readProtectedImageIds) {
                const extra = await deps.readProtectedImageIds();
                if (!Array.isArray(extra)) throw new Error('image-reference-unavailable');
                for (const id of extra) held.add(id);
            }
            for (const id of collectGeneratedImageIds(readSettings().sceneAssets)) held.add(id);
            return held;
        };
        let held;
        try { held = await readHeld();
        } catch { return { ok: false, reason: 'image-reference-unavailable' }; }
        let failed = false;
        const retainedIds = [];
        for (const id of wanted) {
            let referenceFailed = false;
            const beforeDelete = async () => {
                try { return !(await readHeld()).has(id); }
                catch { referenceFailed = true; throw new Error('image-reference-unavailable'); }
            };
            try {
                if (held.has(id) || !(await beforeDelete())) {
                    retainedIds.push(id);
                    continue;
                }
                const result = await store.deleteImage(id, { beforeDelete });
                if (result?.retained === true || result?.retained?.length) { retainedIds.push(id); continue; }
                forgetImage(id);
                failedImages.delete(id);
                invalidateThumb(id);
            } catch {
                if (referenceFailed) return { ok: false, reason: 'image-reference-unavailable' };
                failed = true;
            }
        }
        return failed ? { ok: false, reason: 'image-delete-failed' }
            : { ok: true, ...(retainedIds.length && { retainedIds, retained: retainedIds }) };
    }

    // 下载用：取 IGS 实际存储的图片 dataUrl（立绘为裁边后的版本），找不到返回空串。
    async function getImageDataUrl(id) {
        const key = String(id || '');
        if (!key) return '';
        const record = await store.getImage(key, { fields: ['dataUrl'], original: true });
        return record && record.dataUrl ? record.dataUrl : '';
    }

    // 内置 NAI 原生透明受独立开关和模型能力双重约束；外部来源保留各自策略。
    function expressionPaintMeta({ template = false, signal, creature } = {}) {
        const s = { ...readSettings(signal), taskSignal: signal };
        const via = describeTask(signal).via;
        const transparent = spriteTransparent(s);
        // 非人角色使用独立的固定词、取景与画布。
        if (creature) return creaturePaintMeta(creature, { transparent, whiteBackground: (via === 'nai' || via === 'dbgen') && !transparent, matteColor: s.matteColor,
            ...(!template && { positiveContext: s.auto.nai.artistPrefix }), spriteSize: s.auto.assets.spriteSize, signal });
        const slot = buildAssetSlot(
            { need: { type: 'sprite', name: '' }, tags: '', uc: '' },
            {
                transparent,
                whiteBackground: (via === 'nai' || via === 'dbgen') && !transparent,
                matteColor: s.matteColor,
                templates: s.auto.assets.templates,
                fixedSpritePrompts: template,
                scheme: s.promptScheme,
                ...(!template && { positiveContext: s.auto.nai.artistPrefix }),
            },
        );
        const prompts = template ? { positive: slot.scene, negative: slot.sceneUc } : expressionSpritePrompts(slot.scene, slot.sceneUc, s.promptScheme);
        return {
            size: s.auto.assets.spriteSize,
            imageKind: 'sprite',
            userPrompts: { positive: prompts.positive, negative: prompts.negative },
            transparent,
            ...(signal && { signal }),
        };
    }

    // 模板及手改定稿绕过旧正文组合；身份只由 image-backend 的准备入口展开。
    function saveOutfitDna(save, clothing, { signal, shouldStart } = {}) {
        return recoverOperation(() => save(clothing), {
            repeatable: 'save',
            signal: signal || recoveryController.signal,
            isActive: () => !stopped && (!shouldStart || shouldStart()),
        });
    }

    async function paintExpressionCaption(...args) {
        const options = args[4] || {};
        return recoverOperation(() => paintExpressionCaptionOnce(...args), {
            retryUnchanged: false,
            signal: options.signal || recoveryController.signal,
            isActive: () => !stopped && (!options.shouldStart || options.shouldStart()),
            onRecover: ({ attempt }) => { if (attempt === 1) report('info', '正在自动续接本张立绘'); },
        });
    }

    async function paintExpressionCaptionOnce(name, mood, caption, dna, { look = '', seed, nsfw = false, exact = false, characterMeta, writtenFromDna = false, templateInput, paintMeta, history, signal, shouldStart, outfitName = '', identityDna } = {}) {
        seed = spriteSeed(name, seed, signal);
        const finalEdit = exact && usesCharacterTemplates(taskBackend(signal), dna);
        const protocol = templateInput || (finalEdit ? { caption, captionMode: 'final' } : null);
        const creature = Boolean(creatureOf(dna));
        let upright = caption;
        if (!externalSource(signal) && !protocol && !exact && !creature) upright = uprightSpriteCaption(caption, schemeFor(signal)) || caption;
        const rawMeta = paintMeta || expressionPaintMeta({ signal });
        const { userPrompts, ...sendMeta } = rawMeta;
        const meta = { ...(protocol || externalSource(signal) ? sendMeta : rawMeta), promptKind: creature ? 'creature' : mood === '默认' ? 'sprite' : 'expression' };
        const stopped = () => Boolean(signal?.aborted)
            || (typeof shouldStart === 'function' && shouldStart() !== true);
        if (stopped()) return { mood, ok: false, reason: 'stale-target', error: '已停止', caption,
            ...characterPromptRecovery(templateInput), ...(exact && { edited: true }),
            ...(characterMeta !== undefined && { characterMeta }) };
        let painted;
        const paintStartedAt = Date.now();
        try {
            painted = await generateCaption(inheritImageTaskLease(protocol, { ...meta, caption: upright, ...(seed != null && { seed }),
                ...(protocol || {}), ...(signal && { signal }),
                ...(shouldStart && { shouldStart }),
                ...(characterMeta !== undefined && { characterMeta }),
                ...((!externalSource(signal) && hasSpriteDna(dna)) || exact ? { replaceCharacterKeywords: false } : {}) }));
        } catch (error) {
            painted = { ok: false, error: (error && error.message) || '出图失败' };
        }
        if (stopped()) painted = { ok: false, reason: 'stale-target', error: '目标已变化，未接收迟到图片' };
        if (!painted || !painted.ok || !painted.dataUrl) {
            return {
                mood,
                ok: false,
                error: (painted && painted.error) || '出图失败',
                ...(painted?.reason && { reason: painted.reason }),
                ...(painted?.stopGeneration && { stopGeneration: true }),
                ...(painted?.recoveryStopped && { recoveryStopped: true }),
                prompt: storedPromptFromResult(painted, upright),
                caption: protocol?.caption || upright,
                ...characterPromptRecovery(templateInput), ...(exact && { edited: true }),
                ...(characterMeta !== undefined && { characterMeta }),
            };
        }
        const imageId = newId();
        const createdAt = now();
        const paintDoneAt = Date.now();
        const image = await buildSpriteImageRecord(imageId, painted.dataUrl, meta.transparent, createdAt);
        const matteDoneAt = Date.now();
        if (builtinSeeds(signal)) image.seed = resolveImageSeed(painted.seed ?? seed);
        let prompt = storedPromptFromResult(painted, upright);
        if (!externalSource(signal) && exact && history && prompt) prompt = { ...promptProvenance(history), ...prompt, captionMode: 'final' };
        if (prompt) { image.prompt = prompt; Object.assign(image, promptProvenance(prompt)); }
        if (exact) { image.promptEdited = true; if (!externalSource(signal)) image.captionMode = 'final'; }
        if (painted.characterMeta || characterMeta) image.characterMeta = painted.characterMeta || characterMeta;
        if (painted.dnaCandidates !== undefined) image.dnaCandidates = structuredClone(painted.dnaCandidates);
        Object.assign(image, characterPromptRecovery(templateInput));
        if (!exact && templateInput?.expression !== undefined) image.expression = structuredClone(templateInput.expression);
        if (!templateInput && !exact) image.generationTarget = { characterKey: name, outfitName,
            dna: normalizeCharacterDna(identityDna ?? dna) };
        Object.assign(image, spriteAdoptionEvidence(templateInput, painted));
        Object.assign(image, outfitAdoptionEvidence(templateInput, painted));
        // 保存重试用尽时 recoverOperation 会直接抛错：不接住的话整批异常中止，本批已存好的图也回不到设置里。
        let saved;
        try { saved = await persistGeneratedImage(image); }
        catch (error) { saved = { ...(error?.result || {}), ok: false, saveError: error }; }
        report('info', `立绘计时（${name}·${mood}）：出图 ${secs(paintDoneAt - paintStartedAt)}，抠图 ${secs(matteDoneAt - paintDoneAt)}，保存 ${secs(Date.now() - matteDoneAt)}${saved?.timing ? `（恢复 ${secs(saved.timing.restore)}、上传图片 ${secs(saved.timing.upload)}、等同步并写记录 ${secs(saved.timing.write)}）` : ''}`);
        // 没存上就不能报成功：否则格子会指向一张不存在的图，已画好的表情也看不到。
        if (saved?.ok === false) {
            const cancelled = saved.cancelled === true;
            const failure = saved.saveError ? { ...saved, error: saved.error || saved.saveError } : saved;
            const quota = isQuotaError(saved.saveError) || /quota|存储.*满|空间不足/i.test(recoveryFailureText(failure));
            return { mood, ok: false, reason: cancelled ? 'cancelled' : 'image-save-failed', stopGeneration: true, recoveryStopped: true,
                error: cancelled ? '已停止' : quota ? IMAGE_STORAGE_FULL_MESSAGE : `图片没存上：${recoveryFailureText(failure)}`,
                prompt, caption: protocol?.caption || upright,
                ...characterPromptRecovery(templateInput), ...(exact && { edited: true }),
                ...(characterMeta !== undefined && { characterMeta }) };
        }
        rememberImage(imageId, image.dataUrl);
        return { mood, ok: true, imageId, prompt, name, characterMeta: image.characterMeta,
            ...(isImageSeed(image.seed) && { seed: image.seed }),
            ...promptProvenance(image), ...characterPromptRecovery(image),
            ...(image.outfitContext && { outfitContext: structuredClone(image.outfitContext) }),
            ...(image.identityContext && { identityContext: structuredClone(image.identityContext) }) };
    }

    function reportExpressionProgress(onProgress, event) {
        if (typeof onProgress === 'function') onProgress(event);
    }

    // 按 9 张分批写词：不超过 9 张一次写完，超过 9 张平分 2 批，超过 18 张平分 3 批。
    // 一批写完并逐张出完，再写下一批；某一张失败不影响后面的。
    // 插件少给某几份时只在这一批里补写；signal 中止后已画好的图保留，还没写的批不再写。
    // 内置 NAI 优先复用已入库角色种子；尚未建档时只在本批共享随机种子。
    async function generateExpressionSet({ name, basePrompt, moods, dna, outfit, note, nsfw, onProgress, signal, messageId, shouldStart, onOutfitDna } = {}) {
        const labels = (Array.isArray(moods) ? moods : []).map((item) => String(item || '').trim()).filter(Boolean);
        if (creatureOf(dna)) return generateCreatureExpressionSet({ name, moods: labels, dna, note, nsfw, onProgress, signal, messageId, shouldStart });
        if (!labels.length) return { ok: false, error: '没有表情分组' };
        if (!nai || typeof generateCaption !== 'function') {
            return { ok: false, error: '当前图像来源不能出表情差分' };
        }
        const template = usesCharacterTemplates(taskBackend(signal), dna);
        let context = singleCharacterContext(name, dna, outfit, readSettings(signal).sceneAssets);
        const paintMeta = template ? expressionPaintMeta({ template: true, signal }) : null;
        if (template) {
            const checked = preflightCharacterTask(context, 'derived', 'half_body', outfit);
            if (!checked.ok) return checked;
            dna = context[0].dna;
            outfit = outfit ? structuredClone(outfit) : outfit;
        }
        let outfitWrite;
        if (template && (!context[0].outfit.description?.trim() || !context[0].outfit.descriptionHalfBody?.trim())) {
            // 新衣装同次建立双份资料；旧衣装只从完整母版补半身视图。
            const task = characterPromptTask(context, 'derived', 'half_body', [[name]]);
            reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: labels.length });
            const written = await writePrompt({ signal, ...task, imagePromptTask: 'outfit',
                description: `为角色「${name}」设计指定衣装「${context[0].outfit.name}」。参考角色资料中的性别、体型和本轮参考设定，保留已知衣装要求，逐件补全颜色、材质、剪裁与层次。outfit_name 使用「${context[0].outfit.name}」，outfit_description 只写这套衣装的完整英文穿着描述，不写人物外貌、动作或场景。${note ? `用户要求：${note}` : ''}`,
                outputs: { format: 'sprite-data' }, userPrompts: paintMeta.userPrompts,
                ...(messageId !== undefined && { messageId }),
                ...(signal && { signal }), ...(shouldStart && { shouldStart }) });
            if (!written?.ok) return written || { ok: false, error: '衣装资料提取失败' };
            const entry = written.captions?.find(item => item.slotId === 1);
            if (!entry) return { ok: false, reason: 'SPRITE_DATA_INVALID', error: '缺少本套衣装资料' };
            const prepared = prepareCharacterCaption(characterTemplateInput(entry, task.promptTask, context));
            if (!prepared.ok) return prepared;
            const clothing = prepared.outfitSnapshot?.characters?.[0];
            if (!clothing || prepared.outfitSnapshot.characters.length !== 1)
                return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '衣装资料无法唯一绑定' };
            outfitWrite = entry;
            if (!isValidOutfitName(clothing.name)) return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '缺少有效的衣装名称' };
            if (signal?.aborted || (shouldStart && !shouldStart()))
                return { ok: false, reason: 'stale-target', stopGeneration: true, error: '目标已变化，未保存服装 DNA' };
            if (typeof onOutfitDna === 'function') {
                const saved = await saveOutfitDna(onOutfitDna, clothing, { signal, shouldStart });
                if (!saved?.ok) return saved || { ok: false, reason: 'outfit-dna-save-failed', error: '服装 DNA 保存失败' };
            }
            outfit = { ...outfit, name: clothing.name, prompt: clothing.description,
                ...(clothing.descriptionHalfBody !== undefined && { promptHalfBody: clothing.descriptionHalfBody }) };
            context = singleCharacterContext(name, dna, outfit, readSettings(signal).sceneAssets);
            // 未提供持久化回调的独立调用保持候选来源，不冒充已保存。
            if (typeof onOutfitDna === 'function') context[0].outfits = context[0].outfits
                .filter(item => item.name !== clothing.name).concat(clothing);
        }
        if (template && labels.every(mood => mood === '默认' || mood === '平和')) {
            const entries = labels.map(mood => savedExpressionTemplate(context, mood, paintMeta.userPrompts));
            for (const entry of entries) {
                if (!entry.ok || !entry.available) return { ok: false, reason: 'OUTFIT_TEMPLATE_INVALID', error: '缺少服装 DNA' };
                const checked = prepareCharacterCaption(characterTemplateInput(entry.value, entry.value.promptTask, context));
                if (!checked.ok) return checked;
            }
            return paintExpressionCaptions({ name, items: entries.map((entry, index) => ({
                mood: labels[index], ...entry.value })).map(entry => inheritImageTaskLease(outfitWrite, entry)),
                dna, outfit, nsfw, onProgress, signal,
                ...(shouldStart && { shouldStart }) });
        }
        if (typeof writePrompt !== 'function') {
            return { ok: false, error: '当前图像来源不能写表情差分' };
        }
        const paint = {
            ...(!template && { look: expressionLookTags(basePrompt, outfit, dna),
                writtenFromDna: spritePromptNeedsWriting(dna, outfit) }),
            ...(template && { paintMeta }),
            seed: randomSeed(), outfitName: outfit?.name || '', identityDna: dna,
            nsfw: nsfw === true,
        };
        const paintDna = template ? dna : expressionPaintDna(dna, outfit);
        // 某张图没存上（空间不足等）后不再继续出图，剩下的词留给「继续生图」。
        let saveHalted = false;
        const stopped = () => saveHalted || Boolean(signal && signal.aborted)
            || (typeof shouldStart === 'function' && shouldStart() !== true);
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
                const task = template ? characterPromptTask(context, 'derived', 'half_body', pending.map(() => [name])) : null;
                let written;
                try {
                    written = await writePrompt(inheritImageTaskLease(outfitWrite, { signal,
                        imagePromptTask: outfit?.name || outfit?.nude ? 'outfit' : 'expression',
                        description: template ? expressionFragmentDescription(pending, note, schemeFor(signal))
                            : buildExpressionDiffDescription(name, basePrompt, pending, dna, outfit, { note, nsfw: paint.nsfw,
                            transparent: template ? paintMeta.transparent : spriteTransparent(readSettings(signal)), template, includeDna: !externalSource(signal), scheme: schemeFor(signal) }),
                        ...(!template && { characterContext: context }),
                        ...(template && { ...task, outputs: { format: 'expression-fragments' }, userPrompts: paintMeta.userPrompts,
                            writingRequirements: { size: paintMeta.size, transparent: paintMeta.transparent,
                                framing: 'half_body', nsfw: paint.nsfw } }),
                        ...(messageId !== undefined && { messageId }),
                        ...(signal && { signal }),
                        ...(shouldStart && { shouldStart }),
                    }));
                } catch (error) {
                    const message = (error && error.message) || '写提示词失败';
                    if (!items.length) return { ok: false, error: message };
                    for (const mood of pending) items.push({ mood, ok: false, error: message });
                    writeError = message;
                    break;
                }
                if (!written || !written.ok) {
                    const message = (written && written.error) || '写提示词失败';
                    if (!items.length) return { ...written, ok: false, error: message, ...(stopped() && { stopped: true }) };
                    if (written?.stopGeneration || stopped()) return { ...written, ok: false, items, stopped: true };
                    for (const mood of pending) items.push({ mood, ok: false, error: message });
                    writeError = message;
                    break;
                }
                const captions = Array.isArray(written.captions) ? written.captions : [];
                if (template && typeof onOutfitDna === 'function') {
                    // 整批校验后才保存独立服装 DNA；保存失败时不发任何绘图请求。
                    let clothing;
                    for (const slot of captions) {
                        const checked = prepareCharacterCaption(characterTemplateInput(slot, task.promptTask, context));
                        if (!checked.ok) return checked;
                        const selected = checked.outfitSnapshot?.characters?.filter(c => c.characterKey === name);
                        if (selected?.length !== 1 || (outfit?.name && selected[0].name !== outfit.name))
                            return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '服装 DNA 无法唯一绑定当前衣装' };
                        const signature = JSON.stringify([selected[0].name, selected[0].description]);
                        if (clothing && signature !== JSON.stringify([clothing.name, clothing.description]))
                            return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '同批服装 DNA 不一致，已停止出图' };
                        clothing = selected[0];
                    }
                    if (clothing?.source === 'candidate') {
                        if (stopped()) return { ok: false, reason: 'stale-target', error: '目标已变化，未保存服装 DNA' };
                        const saved = await saveOutfitDna(onOutfitDna, clothing, { signal, shouldStart });
                        if (!saved?.ok) return saved || { ok: false, reason: 'outfit-dna-save-failed', error: '服装 DNA 保存失败' };
                        outfit = { ...outfit, name: clothing.name, prompt: clothing.description,
                            ...(clothing.descriptionHalfBody !== undefined && { promptHalfBody: clothing.descriptionHalfBody }) };
                        // 只有已确认保存成功才更新本任务基线；当前批次与后续批次共用保存值。
                        context = singleCharacterContext(name, dna, outfit, readSettings(signal).sceneAssets);
                        context[0].outfits = context[0].outfits.filter(c => c.name !== clothing.name)
                            .concat(clothing);
                        task.characterContext = structuredClone(context);
                    }
                }
                const missing = [];
                for (let i = 0; i < pending.length; i += 1) {
                    if (stopped()) {
                        // 词已经写好的带上，存成注记，之后「继续生图」不用重写。
                        for (let j = i; j < pending.length; j += 1) {
                            const left = captions.find((item) => Number(item && item.slotId) === j + 1);
                            items.push({ mood: pending[j], ok: false, error: '已停止', ...(left && left.caption && {
                                caption: left.caption, ...(template && characterPromptRecovery(
                                    characterTemplateInput(left, task.promptTask, context))) }) });
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
                    if (template && !slot.promptRecipe) {
                        items.push({ mood: pending[i], ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '表情写词缺少动态模板' });
                        continue;
                    }
                    // 漏写的那份第二轮补画才算一张，不然补写后 done 会超过 total（14/9）。
                    painted += 1;
                    reportExpressionProgress(onProgress, { phase: 'paint', done: painted, total: labels.length, mood: pending[i] });
                    const result = await paintExpressionCaption(name, pending[i], caption, paintDna, { ...paint,
                        ...(template && { templateInput: characterTemplateInput(slot, task.promptTask, context), characterMeta: slot.characterMeta }), signal, ...(shouldStart && { shouldStart }) });
                    items.push(result);
                    if (result.reason === 'image-save-failed' || result.reason === 'cancelled') saveHalted = true;
                }
                pending = round === 0 ? missing : [];
            }
        }
        return { ok: true, items, stopped: stopped() };
    }

    // 恢复时用当前双 DNA 和独立表情重组；旧记录没有片段时仅补写表情，不发送历史动作。
    async function paintExpressionCaptions({ name, items, basePrompt, dna, outfit, nsfw, onProgress, signal, shouldStart, onOutfitDna } = {}) {
        const list = (Array.isArray(items) ? items : []).filter(item => item && item.mood && item.caption)
            .map(item => inheritImageTaskLease(item, structuredClone(item)));
        if (!list.length) return { ok: false, error: '没有写好词、还没出图的表情' };
        if (!nai || typeof generateCaption !== 'function') return { ok: false, error: '当前图像来源不能出图' };
        const paint = { look: expressionLookTags(basePrompt, outfit, dna), seed: randomSeed(), nsfw: nsfw === true,
            writtenFromDna: spritePromptNeedsWriting(dna, outfit) };
        const paintDna = expressionPaintDna(dna, outfit);
        outfit = outfit ? structuredClone(outfit) : outfit;
        let context = singleCharacterContext(name, dna, outfit, readSettings(signal).sceneAssets);
        const templateMeta = expressionPaintMeta({ template: true, signal });
        const stopped = () => Boolean(signal && signal.aborted)
            || (typeof shouldStart === 'function' && shouldStart() !== true);
        const results = [];
        let generationStopped = false;
        for (let i = 0; i < list.length; i += 1) {
            const { mood, caption } = list[i];
            if (generationStopped || stopped()) {
                results.push({ mood, ok: false, error: '已停止', caption, ...characterPromptRecovery(list[i]) });
                continue;
            }
            reportExpressionProgress(onProgress, { phase: 'paint', done: i + 1, total: list.length, mood });
            let item = list[i];
            const exact = item.edited === true || item.promptEdited === true;
            if (!exact && usesCharacterTemplates(taskBackend(signal), dna)) {
                const binding = checkSpriteRecoveryBinding(item, name, context[0].outfit.name);
                if (!binding.ok) {
                    results.push({ ...binding, mood, caption, ...characterPromptRecovery(item) });
                    continue;
                }
                const checked = preflightCharacterTask(context, 'derived', 'half_body', outfit);
                if (!checked.ok) {
                    results.push({ ...checked, mood, caption, ...characterPromptRecovery(item) });
                    continue;
                }
                if (!context[0].outfit.descriptionHalfBody?.trim()
                    || (item.expression === undefined && !['默认', '平和'].includes(mood))) {
                    const regenerated = await generateExpressionSet({ name, dna: context[0].dna, outfit,
                        moods: [mood], nsfw, onProgress, signal, shouldStart, onOutfitDna });
                    results.push(...(regenerated.items || [{ ...regenerated, mood, caption, ...characterPromptRecovery(item) }]));
                    const completed = regenerated.items?.find(result => result.ok)?.outfitSnapshot?.characters;
                    if (completed?.length === 1 && completed[0].characterKey === name
                        && completed[0].name === context[0].outfit.name && completed[0].descriptionHalfBody?.trim()) {
                        outfit = { ...outfit, name: completed[0].name, prompt: completed[0].description,
                            promptHalfBody: completed[0].descriptionHalfBody };
                        context = singleCharacterContext(name, dna, outfit, readSettings(signal).sceneAssets);
                    }
                    generationStopped = regenerated.stopped === true || regenerated.stopGeneration === true
                        || regenerated.items?.some(result => result.stopGeneration === true) === true;
                    continue;
                }
                const built = savedExpressionTemplate(context, mood, templateMeta.userPrompts,
                    { ...(item.expression !== undefined && { expression: item.expression }) });
                if (!built.ok || !built.available) {
                    results.push({ mood, ...(!built.ok ? built : { ok: false, reason: 'OUTFIT_TEMPLATE_INVALID', error: '缺少当前衣装或独立表情资料' }) });
                    continue;
                }
                item = inheritImageTaskLease(list[i], { ...built.value, mood });
            }
            const templateInput = !exact && usesCharacterTemplates(taskBackend(signal), dna) && item.promptRecipe
                ? characterTemplateInput(inheritImageTaskLease(item, { ...item, rebindOutfit: true }), item.promptTask, context) : undefined;
            results.push(await paintExpressionCaption(name, mood, caption, templateInput ? context[0].dna : paintDna,
                { ...paint, exact, history: item, signal, ...(shouldStart && { shouldStart }),
                    ...(item.characterMeta !== undefined && { characterMeta: templateInput?.characterMeta || item.characterMeta }),
                    ...(templateInput && { templateInput, paintMeta: templateMeta }) }));
            generationStopped = results.at(-1)?.stopGeneration === true;
        }
        return { ok: true, items: results, stopped: generationStopped || stopped() };
    }

    // 非人角色的姿态差分：整体姿态只改姿态与状态词，身份 DNA 原样复用，同一整套种子；没有衣装环节。
    // 完全非人形默认出四档（常态、威吓、受创、狂暴），请求里没有对应档位时按四档补齐。
    async function generateCreatureExpressionSet({ name, moods, dna, note, nsfw, onProgress, signal, messageId, shouldStart } = {}) {
        const profile = creatureOf(dna);
        if (!nai || typeof generateCaption !== 'function' || typeof writePrompt !== 'function') {
            return { ok: false, error: '当前图像来源不能出表情差分' };
        }
        if (!usesCharacterTemplates(taskBackend(signal), dna)) {
            return { ok: false, error: '非人角色的姿态差分需要内置写词链，当前图像来源暂不支持' };
        }
        const tiers = creatureMoodLabels(profile);
        const requested = (Array.isArray(moods) ? moods : []).filter(Boolean);
        const picked = tiers ? tiers.filter(mood => requested.includes(mood)) : requested;
        const labels = tiers ? (picked.length ? picked : tiers) : requested;
        if (!labels.length) return { ok: false, error: '没有表情分组' };
        const framing = creatureFraming(profile);
        let context = singleCharacterContext(name, dna, undefined, readSettings(signal).sceneAssets);
        const paintMeta = expressionPaintMeta({ template: true, signal, creature: profile });
        const checked = preflightCharacterTask(context, 'derived', framing);
        if (!checked.ok) return checked;
        dna = context[0].dna;
        const paint = { paintMeta, seed: randomSeed(), outfitName: '', identityDna: dna, nsfw: nsfw === true };
        let saveHalted = false;
        const stopped = () => saveHalted || Boolean(signal && signal.aborted)
            || (typeof shouldStart === 'function' && shouldStart() !== true);
        const items = [];
        let painted = 0, writeError = '';
        for (const batch of splitExpressionWriteBatches(labels)) {
            if (stopped()) break;
            if (writeError) {
                for (const mood of batch) items.push({ mood, ok: false, error: writeError });
                continue;
            }
            let pending = batch.slice();
            for (let round = 0; round < 2 && pending.length; round += 1) {
                if (stopped()) break;
                reportExpressionProgress(onProgress, { phase: 'write', done: painted, total: labels.length });
                const task = characterPromptTask(context, 'derived', framing, pending.map(() => [name]));
                let written;
                try {
                    written = await writePrompt({ signal, imagePromptTask: 'expression',
                        description: creatureExpressionDescription(name, profile, pending, { note, nsfw: paint.nsfw }),
                        ...task, outputs: { format: 'expression-fragments' }, userPrompts: paintMeta.userPrompts,
                        writingRequirements: { size: paintMeta.size, transparent: paintMeta.transparent, framing, nsfw: paint.nsfw },
                        ...(messageId !== undefined && { messageId }), ...(shouldStart && { shouldStart }) });
                } catch (error) {
                    const message = (error && error.message) || '写提示词失败';
                    if (!items.length) return { ok: false, error: message };
                    for (const mood of pending) items.push({ mood, ok: false, error: message });
                    writeError = message;
                    break;
                }
                if (!written || !written.ok) {
                    const message = (written && written.error) || '写提示词失败';
                    if (!items.length) return { ...written, ok: false, error: message, ...(stopped() && { stopped: true }) };
                    if (written?.stopGeneration || stopped()) return { ...written, ok: false, items, stopped: true };
                    for (const mood of pending) items.push({ mood, ok: false, error: message });
                    writeError = message;
                    break;
                }
                const captions = Array.isArray(written.captions) ? written.captions : [];
                const missing = [];
                for (let i = 0; i < pending.length; i += 1) {
                    if (stopped()) {
                        for (let j = i; j < pending.length; j += 1) items.push({ mood: pending[j], ok: false, error: '已停止' });
                        pending = [];
                        break;
                    }
                    const slot = captions.find((item) => Number(item && item.slotId) === i + 1);
                    if (!slot || !slot.caption) {
                        missing.push(pending[i]);
                        items.push({ mood: pending[i], ok: false, error: '写提示词没有返回这一份' });
                        continue;
                    }
                    if (!slot.promptRecipe) {
                        items.push({ mood: pending[i], ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '表情写词缺少动态模板' });
                        continue;
                    }
                    painted += 1;
                    reportExpressionProgress(onProgress, { phase: 'paint', done: painted, total: labels.length, mood: pending[i] });
                    const result = await paintExpressionCaption(name, pending[i], slot.caption, dna, { ...paint,
                        templateInput: characterTemplateInput(slot, task.promptTask, context), characterMeta: slot.characterMeta,
                        signal, ...(shouldStart && { shouldStart }) });
                    items.push(result);
                    if (result.reason === 'image-save-failed' || result.reason === 'cancelled') saveHalted = true;
                }
                pending = round === 0 ? missing : [];
            }
        }
        return { ok: true, items, stopped: stopped() };
    }

    // 非人角色的默认立绘：已有完整身份时直接用程序模板重画，缺资料时写词；没有衣装环节。
    async function generateCreatureSprite({ name, dna, note = '', caption, exact = false, onProgress, characterMeta, history, signal, shouldStart } = {}) {
        const profile = creatureOf(dna);
        const framing = creatureFraming(profile);
        const stopped = () => Boolean(signal?.aborted) || (typeof shouldStart === 'function' && shouldStart() !== true);
        const stale = () => ({ ok: false, reason: 'stale-target', stopGeneration: true, error: '角色或作用域已变化，已停止' });
        const context = singleCharacterContext(name, dna, undefined, readSettings(signal).sceneAssets);
        const meta = expressionPaintMeta({ template: true, signal, creature: profile });
        let input;
        if (exact && caption) input = { caption, captionMode: 'final' };
        else {
            const ready = preflightCharacterTask(context, 'derived', framing);
            const complete = context[0].dna.personality !== undefined
                && ['full_body', 'half_body', 'portrait'].every(view => context[0].dna.views?.[view]?.subject?.trim());
            const built = ready.ok && complete ? savedExpressionTemplate(context, '平和', meta.userPrompts, { purpose: 'sprite', framing }) : null;
            if (built?.ok && built.available) {
                input = characterTemplateInput(built.value, built.value.promptTask, context);
                characterMeta = built.value.characterMeta;
            } else {
                if (signal?.aborted) return { ok: false, error: '已停止' };
                const task = characterPromptTask(context, 'sprite', framing, [[name]]);
                const checked = preflightCharacterTask(context, task.promptTask.purpose, framing);
                if (!checked.ok) return checked;
                reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: 1, mood: '平和' });
                let written;
                try {
                    written = await writePrompt({ signal, ...task, imagePromptTask: 'sprite',
                        description: creatureSingleSpriteDescription(name, profile, { note }),
                        outputs: { format: 'sprite-data' }, userPrompts: meta.userPrompts,
                        writingRequirements: { size: meta.size, transparent: meta.transparent, framing },
                        ...(shouldStart && { shouldStart }) });
                } catch (error) { return { ok: false, error: error.message || '写提示词失败' }; }
                if (stopped()) return stale();
                if (!written?.ok) return written || { ok: false, error: '写提示词失败' };
                const entry = written.captions?.find((c) => c.slotId === 1) || (!written.captions && written);
                if (!entry?.promptRecipe) return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '立绘写词缺少动态模板' };
                input = characterTemplateInput(entry, task.promptTask, task.characterContext);
                characterMeta = entry.characterMeta;
            }
        }
        if (stopped()) return stale();
        reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: '平和' });
        return paintExpressionCaption(name, '平和', input.caption, dna,
            { templateInput: input, paintMeta: meta, exact, history, characterMeta, seed: randomSeed(), signal, shouldStart });
    }

    // 普通立绘重画按当前资料重组；仅手改定稿原样发送。
    async function generateExpressionImage({ name, mood, caption, exact = false, basePrompt, dna, outfit, note, nsfw, onProgress, promptRecipe, characterMeta, history, signal, promptTask, slotId, dnaCandidates, expression, shouldStart, onOutfitDna } = {}) {
        const label = String(mood || '').trim();
        if (!label) return { ok: false, error: '没有表情' };
        if (caption && (exact || usesCharacterTemplates(taskBackend(signal), dna))) {
            return paintExpressionCaptions({ name, items: [{ mood: label, caption,
                ...characterPromptRecovery({ promptRecipe, characterMeta, promptTask, slotId, dnaCandidates, expression: expression ?? history?.expression }),
                ...(exact && { edited: true }), ...(history && { ...promptProvenance(history) }) }],
                basePrompt, dna, outfit, nsfw, onProgress, signal, ...(shouldStart && { shouldStart }),
                ...(onOutfitDna && { onOutfitDna }) });
        }
        if (caption && (externalSource(signal) || exact || !spritePromptNeedsWriting(dna, outfit))) {
            reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: label });
            const look = expressionLookTags(basePrompt, outfit, dna);
            const item = await paintExpressionCaption(name, label, caption, expressionPaintDna(dna, outfit), { look, seed: randomSeed(),
                nsfw: nsfw === true, exact: exact === true, signal, ...(shouldStart && { shouldStart }) });
            return { ok: true, items: [item] };
        }
        return generateExpressionSet({ name, basePrompt, moods: [label], dna, outfit, note, nsfw, onProgress, signal,
            ...(shouldStart && { shouldStart }), ...(onOutfitDna && { onOutfitDna }) });
    }

    // 场景时间/天气差分：读场景原图存下的提示词，换上目标时间天气标签直接出图，不写词。
    // 内置 NAI 复用场景或原图种子；旧图缺种子时本批随机，成功采用后固定。
    async function generateSceneVariants({ baseImageId, scene, variants, onProgress, signal } = {}) {
        const list = (Array.isArray(variants) ? variants : []).filter((item) => item && (item.time || item.weather));
        if (!list.length) return { ok: false, error: '没有要画的时间/天气' };
        if (!nai || typeof generateCaption !== 'function') return { ok: false, error: '当前图像来源不能出图' };
        const stored = await getImagePrompt(baseImageId);
        if (!stored) return { ok: false, error: '场景原图没有存提示词' };
        const s = readSettings(signal);
        const seed = await backgroundSeed(scene, baseImageId, signal);
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
                painted = await generateCaption({ signal, caption, size: backgroundSize(s), seed, imageKind: 'background' });
            } catch (error) {
                painted = { ok: false, error: (error && error.message) || '出图失败' };
            }
            if (!painted || !painted.ok || !painted.dataUrl) {
                items.push({ time, weather, ok: false, error: (painted && painted.error) || '出图失败' });
                continue;
            }
            const imageId = newId();
            const image = { id: imageId, dataUrl: painted.dataUrl, type: 'background', createdAt: now(),
                ...(builtinSeeds(signal) && { seed: resolveImageSeed(painted.seed ?? seed) }) };
            const prompt = storedPromptFromResult(painted, caption);
            if (prompt) { image.prompt = prompt; Object.assign(image, promptProvenance(prompt)); }
            await persistGeneratedImage(image);
            rememberImage(imageId, image.dataUrl);
            items.push({ time, weather, ok: true, imageId, scene, ...(isImageSeed(image.seed) && { seed: image.seed }) });
        }
        return { ok: items.some((item) => item.ok), items, stopped: Boolean(signal && signal.aborted), error: (items.find((item) => !item.ok) || {}).error || '' };
    }

    // 状态栏头像：Q 版大头，方图、不抠图，直接把图交回去，由设置页缩小后存进头像。
    async function generateCharacterAvatar({ name, dna, onProgress, signal, shouldStart } = {}) {
        const who = String(name || '').trim();
        if (!who) return { ok: false, error: '没有角色' };
        const stopped = () => Boolean(signal?.aborted) || (typeof shouldStart === 'function' && shouldStart() !== true);
        const stale = () => ({ ok: false, reason: 'stale-target', stopGeneration: true, error: '角色、衣装或作用域已变化，已停止' });
        if (stopped()) return stale();
        if (!nai || typeof writePrompt !== 'function' || typeof generateCaption !== 'function') {
            return { ok: false, error: '当前图像来源不能生成头像' };
        }
        if (usesCharacterTemplates(taskBackend(signal), dna)) {
            const context = singleCharacterContext(who, dna, undefined, readSettings(signal).sceneAssets);
            const checked = preflightCharacterTask(context, 'derived', 'portrait');
            if (!checked.ok) return checked;
            if (signal?.aborted) return { ok: false, error: '已停止' };
            const task = characterPromptTask(context, 'derived', 'portrait', [[who]]);
            reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: 1, mood: '头像' });
            let written;
            try {
                written = await writePrompt({ signal, ...task,
                    imagePromptTask: 'avatar',
                    description: buildCharacterAvatarDescription(who, dna, { template: true }),
                    userPrompts: { positive: AVATAR_POSITIVE, negative: AVATAR_NEGATIVE },
                    writingRequirements: { size: AVATAR_SIZE, framing: 'portrait' },
                    ...(signal && { signal }), ...(shouldStart && { shouldStart }) });
            } catch (error) { return { ok: false, error: error.message || '写提示词失败' }; }
            if (stopped()) return stale();
            if (!written?.ok) return written || { ok: false, error: '写提示词失败' };
            const entry = written.captions?.find((c) => c.slotId === 1) || (!written.captions && written);
            if (!entry?.promptRecipe) return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '头像写词缺少动态模板' };
            if (signal?.aborted) return { ok: false, error: '已停止' };
            reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: '头像' });
            let painted;
            try {
                painted = await generateCaption({ signal, ...characterTemplateInput(entry, task.promptTask, task.characterContext),
                    size: AVATAR_SIZE, imageKind: 'sprite', promptKind: 'avatar',
                    replaceCharacterKeywords: false, ...(signal && { signal }), ...(shouldStart && { shouldStart }) });
            } catch (error) { return { ok: false, error: error.message || '出图失败' }; }
            if (stopped()) return stale();
            if (!painted?.ok || !painted.dataUrl) return painted || { ok: false, error: '出图失败' };
            return { ok: true, dataUrl: painted.dataUrl,
                prompt: storedPromptFromResult(painted), ...promptProvenance(painted) };
        }
        reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: 1, mood: '头像' });
        let written;
        try {
            written = await writePrompt({ signal, imagePromptTask: 'avatar', description: buildCharacterAvatarDescription(who, dna, { includeDna: !externalSource(signal) }),
                characterContext: singleCharacterContext(who, dna, undefined, readSettings(signal).sceneAssets),
                ...(signal && { signal }), ...(shouldStart && { shouldStart }) });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '写提示词失败' };
        }
        if (!written || !written.ok || !written.caption) {
            return { ...written, ok: false, error: (written && written.error) || '写提示词失败' };
        }
        if (stopped()) return stale();
        reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: '头像' });
        let painted;
        try {
            painted = await generateCaption({ signal,
                caption: externalSource(signal) ? written.caption : composeSpriteCaption(written.caption, dna, { scheme: schemeFor(signal) }),
                ...(!externalSource(signal) && hasSpriteDna(dna) && { replaceCharacterKeywords: false }),
                size: AVATAR_SIZE,
                imageKind: 'sprite', promptKind: 'avatar',
                userPrompts: { positive: AVATAR_POSITIVE, negative: AVATAR_NEGATIVE },
                ...(signal && { signal }), ...(shouldStart && { shouldStart }),
            });
        } catch (error) {
            painted = { ok: false, error: (error && error.message) || '出图失败' };
        }
        if (stopped()) return stale();
        if (!painted || !painted.ok || !painted.dataUrl) return { ok: false, error: (painted && painted.error) || '出图失败' };
        return { ok: true, dataUrl: painted.dataUrl };
    }

    // 设置页主动出一张默认立绘：先让 LLM 写提示词，再出图，不经过楼内补图。
    // 旧图重画仅在可直接组合或逐图手改时复用 caption；需要转译则按当前 DNA 写词。
    async function generateCharacterSprite({ name, dna, nude = false, note = '', caption, exact = false, onProgress, characterMeta, promptRecipe, history, signal, shouldStart, onOutfitDna } = {}) {
        const who = String(name || '').trim();
        if (!who) return { ok: false, error: '没有角色' };
        const stopped = () => Boolean(signal?.aborted) || (typeof shouldStart === 'function' && shouldStart() !== true);
        const stale = () => ({ ok: false, reason: 'stale-target', stopGeneration: true, error: '角色、衣装或作用域已变化，已停止' });
        if (stopped()) return stale();
        if (creatureOf(dna) && usesCharacterTemplates(taskBackend(signal), dna)) return generateCreatureSprite({ name: who, dna, note, caption, exact, onProgress, characterMeta, history, signal, shouldStart });
        if (usesCharacterTemplates(taskBackend(signal), dna)) {
            const context = singleCharacterContext(who, dna, nude ? { nude: true } : undefined, readSettings(signal).sceneAssets);
            const meta = expressionPaintMeta({ template: true, signal });
            let input;
            if (exact && caption) input = { caption, captionMode: 'final' };
            else {
                // 普通重生图只读取当前资料，不沿用历史 Scene／Char 的剧情姿势。
                const ready = preflightCharacterTask(context, 'derived', 'half_body');
                const complete = nude || (context[0].dna.personality !== undefined
                    && ['full_body', 'half_body', 'portrait'].every(view => context[0].dna.views?.[view]?.subject?.trim()));
                const built = ready.ok && complete && context[0].outfit.descriptionHalfBody?.trim() ? savedExpressionTemplate(context, '平和', meta.userPrompts,
                    { purpose: nude ? 'derived' : 'sprite' }) : null;
                if (built?.ok && built.available) {
                    input = characterTemplateInput(built.value, built.value.promptTask, context);
                    characterMeta = built.value.characterMeta;
                } else {
                if (signal?.aborted) return { ok: false, error: '已停止' };
                const task = characterPromptTask(context, nude ? 'derived' : 'sprite', 'half_body', [[who]]);
                const checked = preflightCharacterTask(context, task.promptTask.purpose, 'half_body');
                if (!checked.ok) return checked;
                // 身份未建档时由写词模型首次设计外貌；手动入口没有楼层正文触发世界书，直接附上人设、角色卡与点名条目。
                let lore;
                if (!nude && !CHARACTER_DNA_REQUIRED_VIEWS.every(view => context[0].dna.views?.[view]?.subject?.trim())
                    && typeof messageHost.readCharacterLore === 'function') {
                    try { lore = await messageHost.readCharacterLore([who], { includeWorldInfo: true }); } catch { lore = null; }
                    if (!Array.isArray(lore)) return { ok: false, reason: 'dna-lore-unavailable', error: '角色设定读取失败，未发送立绘请求' };
                    if (stopped()) return stale();
                }
                reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: 1, mood: '平和' });
                let written;
                try {
                    written = await writePrompt({ signal, ...task, ...(lore?.length && { lore }),
                        imagePromptTask: nude ? 'outfit' : 'sprite',
                        description: nude
                            ? `整理本次显式裸体或形态资料，保留其语义，不改变已保存身份、不新增衣物；只交衣装资料字段，不生成构图、动作或场景。用户要求：${note || ''}`
                            : `整理详细三景别外貌、独立性格与本套衣装 DNA。首次身份候选在明确设定内协调补全普通外貌，新衣装缺说明时逐件完成颜色、材质与结构；已有资料逐字保留。只交资料字段，不生成构图、姿势或场景。用户要求：${note || ''}`,
                        outputs: { format: 'sprite-data' },
                        userPrompts: meta.userPrompts,
                        writingRequirements: { size: meta.size, transparent: meta.transparent, framing: 'half_body' },
                        ...(signal && { signal }), ...(shouldStart && { shouldStart }) });
                } catch (error) { return { ok: false, error: error.message || '写提示词失败' }; }
                if (stopped()) return stale();
                if (!written?.ok) return written || { ok: false, error: '写提示词失败' };
                const entry = written.captions?.find((c) => c.slotId === 1) || (!written.captions && written);
                if (!entry?.promptRecipe) return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '立绘写词缺少动态模板' };
                input = characterTemplateInput(entry, task.promptTask, task.characterContext);
                characterMeta = entry.characterMeta;
                }
            }
            if (!exact && !nude && typeof onOutfitDna === 'function') {
                const checked = prepareCharacterCaption(input);
                if (!checked.ok) return checked;
                const clothing = checked.outfitSnapshot?.characters?.[0];
                if (!clothing || checked.outfitSnapshot.characters.length !== 1)
                    return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '立绘衣装无法唯一绑定' };
                if (!input.characterContext[0].outfits.some(item => item.name === clothing.name
                    && item.description === clothing.description && item.descriptionHalfBody === clothing.descriptionHalfBody)) {
                    if (stopped()) return stale();
                    const saved = await saveOutfitDna(onOutfitDna, clothing, { signal, shouldStart });
                    if (!saved?.ok) return saved || { ok: false, reason: 'outfit-dna-save-failed', error: '服装 DNA 保存失败' };
                    if (stopped()) return stale();
                    const updated = singleCharacterContext(who, dna,
                        { name: clothing.name, prompt: clothing.description,
                            ...(clothing.descriptionHalfBody !== undefined && { promptHalfBody: clothing.descriptionHalfBody }) }, readSettings(signal).sceneAssets);
                    input = inheritImageTaskLease(input, { ...input, characterContext: updated });
                    const rebound = prepareCharacterCaption(input);
                    if (!rebound.ok) return rebound;
                }
            }
            reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: '平和' });
            const painted = await paintExpressionCaption(who, '平和', input.caption, dna,
                { templateInput: input, paintMeta: meta, exact, history, characterMeta, seed: randomSeed(), signal, shouldStart });
            return painted;
        }
        const paintDna = nude ? expressionPaintDna(dna, { nude: true }) : dna;
        const needsWriting = !externalSource(signal) && spritePromptNeedsWriting(paintDna, nude ? { nude: true } : undefined);
        if (caption && (exact || !needsWriting)) {
            if (!nai || typeof generateCaption !== 'function') return { ok: false, error: '当前图像来源不能画立绘' };
            reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: '平和' });
            const repainted = await paintExpressionCaption(who, '平和', caption, paintDna, { ...(nude && { look: 'nude' }), seed: randomSeed(), exact: exact === true, characterMeta, signal, shouldStart });
            if (!repainted.ok) return { ok: false, error: repainted.error || '出图失败', prompt: repainted.prompt };
            return { ok: true, imageId: repainted.imageId, prompt: repainted.prompt, characterMeta: repainted.characterMeta,
                ...(isImageSeed(repainted.seed) && { seed: repainted.seed }) };
        }
        if (!nai || typeof writePrompt !== 'function' || typeof generateCaption !== 'function') {
            return { ok: false, error: '当前图像来源不能写立绘' };
        }
        reportExpressionProgress(onProgress, { phase: 'write', done: 0, total: 1, mood: '平和' });
        let written;
        try {
            written = await writePrompt({ signal, imagePromptTask: 'sprite', description: buildCharacterSpriteDescription(who, paintDna, { nude: nude === true, note, transparent: spriteTransparent(readSettings(signal)), includeDna: !externalSource(signal), scheme: schemeFor(signal) }),
                characterContext: singleCharacterContext(who, dna, nude ? { nude: true } : undefined, readSettings(signal).sceneAssets),
                ...(signal && { signal }), ...(shouldStart && { shouldStart }),
            });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '写提示词失败' };
        }
        if (!written || !written.ok || !written.caption) {
            return { ...written, ok: false, error: (written && written.error) || '写提示词失败' };
        }
        reportExpressionProgress(onProgress, { phase: 'paint', done: 1, total: 1, mood: '平和' });
        const painted = await paintExpressionCaption(who, '平和', written.caption, paintDna,
            { ...(nude && { look: 'nude' }), writtenFromDna: needsWriting, characterMeta: written.characterMeta, signal, shouldStart });
        if (!painted.ok) return { ok: false, error: painted.error || '出图失败', prompt: painted.prompt };
        return { ok: true, imageId: painted.imageId, prompt: painted.prompt, characterMeta: painted.characterMeta,
            ...(isImageSeed(painted.seed) && { seed: painted.seed }) };
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
    async function paintWardrobeReference({ prompt, nsfwBoost = false, signal, shouldStart } = {}) {
        const text = String(prompt || '').trim();
        if (!text) return { ok: false, error: '这套衣服还没有提示词' };
        if (!nai || typeof generateCaption !== 'function') return { ok: false, error: '当前图像来源不能出参考图' };
        const meta = { ...expressionPaintMeta({ signal }), promptKind: 'wardrobe', ...(shouldStart && { shouldStart }) };
        let painted;
        try {
            painted = await generateCaption({ signal, ...meta, caption: clothingCaption(text, { nsfwBoost }) });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '出参考图失败' };
        }
        if (!painted || !painted.ok || !painted.dataUrl) return { ok: false, error: (painted && painted.error) || '出参考图失败' };
        const imageId = newId();
        const createdAt = now();
        const image = await buildSpriteImageRecord(imageId, painted.dataUrl, meta.transparent, createdAt);
        const stored = storedPromptFromResult(painted) || { positive: text, negative: '' };
        if (stored) { image.prompt = stored; Object.assign(image, promptProvenance(stored)); }
        await persistGeneratedImage(image);
        rememberImage(imageId, image.dataUrl);
        return { ok: true, imageId };
    }

    async function writeWardrobePrompt({ character, outfit, nsfwBoost = false, note = '', messageId, signal, sourceText, shouldStart } = {}) {
        const name = String(character || '').trim();
        const clothes = String(outfit || '').trim();
        if (!clothes) return { ok: false, error: '没有待确认的服装' };
        if (!nai || typeof writePrompt !== 'function') return { ok: false, error: '当前图像来源不能写服装提示词' };
        const stale = () => signal?.aborted || (typeof shouldStart === 'function' && !shouldStart());
        if (stale()) return { ok: false, reason: 'request-stale', error: '衣装任务已取消或目标失效' };
        const builtin = describeTask(signal).mode === 'nai' && typeof llm?.prepareImagePrompt === 'function';
        if (builtin && messageId !== undefined && (typeof sourceText !== 'string' || !sourceText.trim()))
            return { ok: false, reason: 'outfit-source-unavailable', error: '剧情衣装缺少本楼正文，未发送写词请求' };
        const dualDna = builtin && Boolean(name);
        let written;
        try {
            if (dualDna) {
                const assets = readSettings(signal).sceneAssets;
                const context = singleCharacterContext(name, assets.characterDna?.[name], { name: clothes }, assets);
                const task = characterPromptTask(context, 'derived', 'half_body', [[name]]);
                written = await writePrompt({ signal, ...task, imagePromptTask: 'outfit',
                    description: `为角色「${name}」的衣装「${clothes}」一次生成完整服装 DNA 和半身服装 DNA。依据本轮正文、衣装要求与角色资料交付 outfit_description 和 outfit_half_body；半身版从同一完整母版仅删除画外标签，不输出人物外貌、动作或场景。${note ? `用户要求：${note}` : ''}`,
                    outputs: { format: 'sprite-data' },
                    userPrompts: expressionPaintMeta({ template: true, signal }).userPrompts,
                    ...(sourceText !== undefined && { numberedText: toReadableText(sourceText) }),
                    ...(shouldStart && { shouldStart }),
                    ...(messageId !== undefined && { messageId }) });
            } else written = await writePrompt({ signal, imagePromptTask: 'wardrobe',
                description: buildWardrobeClothingDescription(name, clothes, { nsfwBoost, note }),
                ...(builtin && { outputs: { purpose: 'outfit-dna', slotIds: [1] },
                    ...(sourceText !== undefined && { numberedText: toReadableText(sourceText) }) }),
                ...(shouldStart && { shouldStart }),
                ...(messageId !== undefined && { messageId }), ...(signal && { signal }) });
        } catch (error) {
            return { ok: false, error: (error && error.message) || '写服装提示词失败' };
        }
        if (stale()) return { ok: false, reason: 'request-stale', error: '衣装任务已取消或目标失效' };
        if (!written || !written.ok) return { ...written, ok: false, error: (written && written.error) || '写服装提示词失败' };
        if (dualDna) {
            const outfits = written.captions?.find(item => item.slotId === 1)?.outfitSnapshot?.characters;
            const clothing = outfits?.[0];
            if (outfits?.length !== 1 || clothing.characterKey !== name || clothing.name !== clothes
                || !clothing.description?.trim() || !clothing.descriptionHalfBody?.trim())
                return { ok: false, reason: 'SPRITE_DATA_INVALID', error: '缺少本套衣装的完整或半身服装 DNA' };
            return { ok: true, prompt: clothing.description, promptHalfBody: clothing.descriptionHalfBody };
        }
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
        return prompt ? { ...prompt, ...promptProvenance(record), revision: normalizeGeneratedImageRecord(record).revision,
            ...(record.expression !== undefined && { expression: structuredClone(record.expression) }),
            ...(record.promptEdited === true && { edited: true }),
            ...(record.characterMeta && { characterMeta: record.characterMeta }) } : null;
    }

    async function saveImagePrompt(id, prompt, expectedRevision) {
        const key = String(id || '');
        let stored;
        try { stored = normalizeStoredPrompt(prompt); }
        catch { return { ok: false, reason: 'PROMPT_PROVENANCE_INVALID', error: '提示词来源资料无效' }; }
        if (!key || !stored) return { ok: false, error: '提示词是空的' };
        if (!store || typeof store.getImage !== 'function' || typeof store.updateImagePrompt !== 'function') {
            return { ok: false, error: '提示词存不了' };
        }
        const record = await (store.getImageRecord ? store.getImageRecord(key) : store.getImage(key));
        if (!record) return { ok: false, error: '找不到这张立绘' };
        const revision = expectedRevision === undefined ? normalizeGeneratedImageRecord(record).revision : expectedRevision;
        const saved = await recoverOperation(async () => {
            const live = await (store.getImageRecord ? store.getImageRecord(key) : store.getImage(key));
            return store.updateImagePrompt(key, live?.revision ?? revision, stored, now());
        }, { repeatable: 'save', signal: recoveryController.signal, isActive: () => !stopped });
        if (!saved?.ok) return { ok: false, reason: saved?.reason || 'update-failed',
            error: saved?.reason === 'stale-revision' ? '图片或提示词已变化，请重新打开编辑' : '提示词没存上' };
        return { ok: true, prompt: saved.record.prompt, revision: saved.record.revision };
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

    async function readStoredImageRecord(id) {
        return typeof store.getImageRecord === 'function' ? store.getImageRecord(String(id)) : store.getImage(String(id));
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

    async function writeStoredImage(record, { cacheDisplay = true } = {}) {
        const image = record && typeof record === 'object' ? record : null;
        const key = image && String(image.id || '');
        if (!key || !store || typeof store.putImage !== 'function') return { ok: false, error: '图片存不了' };
        let stored;
        try {
            stored = { ...image, id: key, ...promptProvenance(image),
                ...(image.prompt !== undefined && { prompt: normalizeStoredPrompt(image.prompt) }) };
        } catch {
            return { ok: false, reason: 'PROMPT_PROVENANCE_INVALID', error: '图片提示词来源资料无效' };
        }
        await store.putImage(stored, { cacheDisplay });
        invalidateThumb(key);
        if (cacheDisplay && stored.dataUrl) rememberImage(key, stored.dataUrl);
        return { ok: true };
    }

    const service = {
        usesCharacterTemplates: dna => usesCharacterTemplates(nai, dna),
        processMessage, resolveUrl, isMissingImage, hasMissingImages, isUnavailableImage, hasUnavailableImages, resolveThumbUrl, thumbSourceId, tempBackground, tempSceneTime, tempSprite, tempSpriteTags, listReview, reviewPage, listTemp, tempPage, changeTempPage, retryMetadata, readRecord, setStatus, deleteImages, getImageDataUrl, getImagePrompt, saveImagePrompt, readStoredImage, readStoredImageRecord, writeStoredImage, importAssetImage,
        prepareExternalSpriteDna,
        generateExpressionSet: request => withExternalSpriteDna({ ...request, requireDna: Boolean(deps.captureCharacterDnaTarget) }, generateExpressionSet),
        generateExpressionImage: request => withExternalSpriteDna({ ...request, requireDna: Boolean(deps.captureCharacterDnaTarget) }, generateExpressionImage),
        paintExpressionCaptions: request => withExternalSpriteDna({ ...request, requireDna: Boolean(deps.captureCharacterDnaTarget) }, paintExpressionCaptions),
        generateCharacterSprite: request => withExternalSpriteDna(request, generateCharacterSprite),
        generateCharacterAvatar: request => withExternalSpriteDna({ ...request, requireDna: Boolean(deps.captureCharacterDnaTarget) }, generateCharacterAvatar),
        generateSceneVariants, writeWardrobePrompt, paintWardrobeReference,
        getEditableImage, saveMatteEdit, imageAvailability, retryImageRead, clearImageReadFailures, tempSpriteForOutfit,
        getRecord: (key) => !stopped && currentChat() ? tempCache.peek(tempCache.scope, key) : null,
        start() {
            stopped = false;
            if (recoveryController.signal.aborted) recoveryController = new AbortController();
            if (offRendered) return;
            const onFloorReady = messageId => processMessage(Number(messageId));
            offRendered = typeof messageHost.onImageFloorReady === 'function'
                ? messageHost.onImageFloorReady(onFloorReady)
                : messageHost.on('CHARACTER_MESSAGE_RENDERED', onFloorReady);
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
            recoveryController.abort();
            clearTimeout(imageRecoveryTimer); imageRecoveryTimer = null;
            tempCache.clear();
            if (offOnline) { offOnline(); offOnline = null; }
            if (offRendered) { offRendered(); offRendered = null; }
            pendingFloors.clear();
        },
    };
    for (const method of ['generateExpressionSet', 'generateExpressionImage', 'paintExpressionCaptions',
        'generateCharacterSprite', 'generateCharacterAvatar', 'generateSceneVariants', 'writeWardrobePrompt',
        'paintWardrobeReference', 'importAssetImage', 'readStoredImage', 'readStoredImageRecord', 'getImagePrompt', 'writeStoredImage']) {
        const execute = service[method];
        const generation = method.startsWith('generate') || ['paintExpressionCaptions', 'paintWardrobeReference', 'writeWardrobePrompt'].includes(method);
        service[method] = (...args) => {
            const objectInput = args[0] && typeof args[0] === 'object';
            const linked = linkRecoverySignals([objectInput && args[0].signal, recoveryController.signal]);
            const chat = messageHost.getChatId?.();
            const target = generation ? bindImageTaskTarget({ signal: linked.signal,
                subscribe: messageHost.on?.bind(messageHost),
                isCurrent: () => !stopped && messageHost.getChatId?.() === chat
                    && (!args[0]?.shouldStart || args[0].shouldStart()) }) : null;
            const input = inheritImageTaskLease(args[0], { ...(objectInput && args[0]), signal: target?.signal || linked.signal,
                ...(target && { shouldStart: target.shouldStart }) });
            const captured = generation && typeof llm?.runImageTask === 'function';
            const run = async guarded => {
                // 存储空间明显装不下这一批时不发任何请求，免得出完图才发现存不下。
                const planned = generation ? plannedImageCount(method, args[0]) : 0;
                if (planned) {
                    const room = await checkImageStorageRoom(deps.global || globalThis, planned);
                    if (!room.ok) return { ...room, stopGeneration: true };
                }
                if (generation && method !== 'writeWardrobePrompt' && typeof nai?.waitUntilReady === 'function') {
                    const ready = await nai.waitUntilReady(guarded);
                    if (!ready.ok) return ready;
                }
                const perform = () => execute(...(objectInput && captured ? [guarded, ...args.slice(1)] : args));
                const readOnly = ['readStoredImage', 'readStoredImageRecord', 'getImagePrompt'].includes(method);
                return recoverOperation(perform, {
                retryUnchanged: false,
                signal: guarded.signal,
                global: deps.global || llm?.recoveryGlobal || globalThis,
                isActive: () => !stopped && (!guarded.shouldStart || guarded.shouldStart()),
                ...(readOnly && { observe: async () => ({ completed: true, value: await perform() }) }),
                onRecover: () => report('info', '正在自动恢复原操作'),
                });
            };
            return Promise.resolve(captured
                ? llm.runImageTask(input, run) : run(input)).finally(() => { target?.release(); linked.release(); });
        };
    }
    return service;

}
