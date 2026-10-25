import { normalizePromptEntries } from '../scene/prompt-entries.js';
import { createMediaRuntime } from '../media/media-runtime.js';
import { createPublicApi, attachPublicApi, detachPublicApi } from '../api/public-api.js';
import { createTavernHelperAdapter, getSillyTavernContext } from '../host/tavern-helper-adapter.js';
import { sceneAssetsForContext, resolveAssetScope } from '../scene/asset-scope.js';
import { createCharacterDnaStore } from './character-dna-store.js';
import { creatureSystemEnabled, normalizeCreatureDisplaySettings, setCreatureSystem } from '../scene/creature-profile.js';
import { createStoryOutfitRuntime } from './story-outfit-runtime.js';
import { migrateSpriteSystem } from '../scene/sprite-system-migration.js';
import { captureOutfitScope, prepareCgOutfitCandidates } from '../scene/outfit-identity.js';
import { loadStoryOutfitCandidates, saveStoryOutfitCandidates } from '../scene/outfit-review-store.js';
import { withTavernGeneratedAssetFiles } from '../media/tavern-generated-assets.js';
import { withTavernIllustrationFiles } from '../media/tavern-illustrations.js';
import { readReferenceImageUrl } from '../media/reference-image-reader.js';
import { localImageCacheFor } from '../media/tavern-image-cache.js';
import { createPresetRegistry } from '../presets/preset-registry.js';
import { createInputChannel } from '../host/input-channel.js';
import { parseSceneText } from '../scene/text-parser.js';
import { createSceneState } from '../scene/scene-state.js';
import { resolveScene } from '../scene/scene-resolver.js';
import { LEGACY_READER_MODES, readLegacyIgsSettings, writeLegacyIgsSettings, resolveLegacyReaderMode } from '../storage/legacy-igs.js';
import { createPresetStore } from '../storage/preset-store.js';
import { createTavernSettingsSync } from '../storage/tavern-settings-file.js';
import { createExpressionNotesFile, fillExpressionNotes } from '../storage/expression-notes-file.js';
import { createLayerController } from '../visual/layer-controller.js';
import { createStageRenderer } from '../visual/stage-renderer.js';
import { resolveVisualMode } from '../visual/visual-mode.js';
import { DEFAULT_SCENE_PROMPT_RULE, LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3, normalizeScenePromptRule } from '../visual/igs-ui/reader-host-constants.js';
import { createIgsReaderHost } from '../visual/igs-ui/reader-host.js';
import { normalizeChatShowSettings, resolveChatShowPromptRule } from '../visual/igs-ui/chat-show-runtime.js';
import { resolveBgmPromptRule, resolveDlcFxPromptRule, resolveFxPromptRule, resolveItemFxPromptRule, resolveRomanceFxPromptRule, resolveStageCastFxPromptRule } from '../visual/igs-ui/fx-prompt.js';
import { resolveDanmakuPromptRule } from '../visual/igs-ui/danmaku-prompt.js';
import { resolveFeedPromptRule } from '../visual/igs-ui/feed-prompt.js';
import { mentionedFeedPlatforms } from '../scene/feed-platforms.js';
import { resolveTextFxPromptRule } from '../visual/igs-ui/text-fx.js';
import { resolveBilingualPromptRule } from '../visual/igs-ui/bilingual-text.js';
import { resolveDailyFxPromptRule } from '../visual/igs-ui/fx-daily-prompt.js';
import { normalizeFxPromptsSettings } from '../visual/igs-ui/fx-settings.js';
import { beginMetaDigestSend, clearMetaDigest, finishMetaDigestSend, onMetaDigestChange, resolveMetaDigestRule } from '../visual/igs-ui/meta-digest.js';
import { resolveLiveDigestRule } from '../visual/igs-ui/danmaku-interact.js';
import { applyFxWorldview, resolveCarryPhonePrompt, resolveWorldviewPromptRule } from '../scene/fx-era.js';
import { resolveWorldview } from '../scene/worldview.js';
import { resolveBattleFxPromptRule } from '../visual/igs-ui/fx-battle-model.js';
import { resolveCreatureFxPromptRule } from '../visual/igs-ui/fx-creature-model.js';
import { createEventBus } from './event-bus.js';
import { createMagicWandEntry } from '../host/magic-wand-entry.js';
import { createExtensionPanel } from '../host/extension-panel.js';
import { createReaderImageService } from '../generated-images/reader-image-service.js';
import { createPromptInjector } from '../host/prompt-injector.js';
import { createStatsRuntime } from './stats-runtime.js';
import { describeLlmReady } from '../generated-images/illustration/caption-writer.js';
import { statsFxOf, statsNoticeLines } from '../scene/stats/stat-fx.js';
import { clearStatsRivals, registerStatsRivals } from '../visual/igs-ui/romance-runtime.js';
import { normalizeStatsSettings } from '../scene/stats/stat-settings.js';
import { createShujukuClient } from '../data/shujuku/client.js';
import { describeStatMappings } from '../data/shujuku/stats-push.js';
import { buildInitialState } from '../scene/stats/stat-build.js';
import { createIllustrationMessageHost } from '../host/illustration-message-host.js';
import { createSecondaryLlm } from '../host/secondary-llm.js';
import { createImageWorldInfoSource } from '../host/image-world-info.js';
import { createImagePromptLlm } from '../generated-images/image-prompt-runtime.js';
import { createBuiltinImageTaskRuntime } from '../generated-images/builtin-image-task-runtime.js';
import { createImageBackend, mergeLegacyNaiSettings } from '../generated-images/image-backend.js';
import { createCharacterReferenceRecovery } from './character-reference-recovery.js';
import { wakeRecoveringOperations } from '../storage/automatic-recovery.js';
import { IMAGE_ACTIVITY_EVENT, trackImageActivity } from '../generated-images/generation-activity.js';
import { createNaiOfficialClient } from '../generated-images/nai-official-client.js';
import { createImageJobLog } from '../generated-images/image-job-log.js';
import { createIndexedDbIllustrationStore } from '../media/illustration-store.js';
import { createIndexedDbCgIndexStore } from '../media/cg-index-store.js';
import { createAssetThumbnailer, createIndexedDbAssetThumbStore } from '../media/asset-thumb-store.js';
import { withCgIndexSync } from '../media/cg-library.js';
import { createAutoIllustrationService, ILLUSTRATION_PROGRESS_EVENT, ILLUSTRATION_UPDATED_EVENT, readCgViewport } from '../generated-images/illustration/auto-illustration-service.js';
import { createAssetGenerationService, GENERATED_ASSET_UPDATED_EVENT } from '../generated-images/illustration/asset-generation-service.js';
import { protectedAssetImageIds } from '../generated-images/illustration/asset-image-references.js';
import { createItemAndCgServices } from './item-cg-services.js';
import { createIndexedDbGeneratedAssetStore } from '../media/generated-asset-store.js';
import { createCanvasImageCodec } from '../media/canvas-image-codec.js';
import { isGeneratedAssetUrl, generatedAssetIdOf } from '../scene/asset-match.js';
import { createAlphaMatte } from '../media/alpha-matte.js';
import { firstMoodWord, resolvePromptRuleContent, scenePromptRuleEnabled } from '../scene/prompt-rule-content.js';
import { buildTagGrammar, DEPTH0_REMINDER, GRAMMAR_HEADER, normalizePromptPlacement } from '../visual/igs-ui/tag-grammar.js';
import { resolvePromptTriggers, setLastPromptReport } from '../scene/prompt-triggers.js';
import { collectPromptContext } from '../host/prompt-context.js';

const IGS_VERSION = '0.37.12';
const SCENE_ASSETS_INJECTION_INITIAL_DELAY_MS = 3000;
const SCENE_ASSETS_INJECTION_RETRY_MS = 1500;

// 自动插图 / 素材补全的进度与失败原因：始终写控制台；阅读器开着时交给对话框顶边的生成细线，
// 没开时失败与成功再按「显示提示弹窗」弹酒馆 toastr。

// 非人角色总开关与巨型铺满随已保存的设置同步到运行时；读不到设置时保持默认（开）。
function syncCreatureSystem(legacy) {
    const by = legacy && legacy.readerSettingsByMode && typeof legacy.readerSettingsByMode === 'object' ? legacy.readerSettingsByMode : {};
    const rs = by.default && Object.keys(by.default).length ? by.default : (legacy && legacy.readerSettings) || {};
    const { enabled, giantFill } = normalizeCreatureDisplaySettings(rs.creatureDisplay);
    setCreatureSystem({ enabled, giantFill });
}
export function createImageJobReporter(globalObject, getBridge, log, getReaderNotice) {
    return (level, message) => {
        if (log && typeof log.add === 'function') log.add(level, message);
        const logger = level === 'error' ? console.warn : console.info;
        logger('[IGS 生图]', message);
        try {
            const readerNotice = typeof getReaderNotice === 'function' ? getReaderNotice() : null;
            if (readerNotice && readerNotice(level, message)) return;
        } catch (error) { /* 阅读器还没建好或细线出错时照旧弹 toastr */ }
        if (level === 'info') return;
        if ((getBridge() || {}).showToasts === false) return;
        const toastr = globalObject && globalObject.toastr;
        const type = level === 'success' ? 'success' : (level === 'warn' ? 'warning' : 'error');
        if (toastr && typeof toastr[type] === 'function') toastr[type](message, 'IGS 生图');
    };
}

const OPEN_FAILURE_TEXT = Object.freeze({
    'no-readable-text': '本楼未读取到可显示的正文，阅读器未打开。请检查正文标签设置。',
    'no-message': '当前聊天没有可读取的楼层。',
});

function notifyOpenFailure(globalObject, reason) {
    const text = OPEN_FAILURE_TEXT[reason] || `阅读器未打开（${reason || '未知原因'}）。`;
    console.warn('[IGS] 打开阅读器失败：', reason);
    const toastr = globalObject && globalObject.toastr;
    if (toastr && typeof toastr.warning === 'function') toastr.warning(text, 'IGS');
}

export function bootstrapIGS(options = {}) {
    const globalObject = options.global || globalThis.window || globalThis;
    function sceneAssetsNow(sceneAssets) {
        return sceneAssetsForContext(sceneAssets, getSillyTavernContext(globalObject));
    }
    const events = options.events || createEventBus();
    const offRecoveryWake = events.on('igs:legacy-settings-updated', () => wakeRecoveringOperations(globalObject));
    const mediaCache = localImageCacheFor(globalObject);
    let destroying = null;
    // getUnifiedSettingsSnapshot 的复用缓存（见该函数）；启动途中就会被调用，所以放在最前面声明。
    let unifiedCache = null;
    const hostAdapter = options.hostAdapter || createTavernHelperAdapter(globalObject);
    const storageLike = options.storage || getStorageLike(globalObject);
    const legacyIgs = options.legacyIgsSettings || readLegacyIgsSettings(storageLike);
    syncCreatureSystem(legacyIgs);
    const presetStore = options.presetStore || createPresetStore(storageLike);
    const presetRegistry = options.presetRegistry || createPresetRegistry({ store: presetStore });
    const inputChannel = createInputChannel(hostAdapter);
    const layerController = options.layerController || createLayerController(options.layers || {});
    const renderer = options.renderer || createStageRenderer(layerController);
    const readerImageOptions = (opts = {}) => {
        const bridge = opts.unifiedSettings?.bridge || {};
        return { ...opts, unifiedSettings: {
            ...opts.unifiedSettings,
            bridge: { ...bridge, autoIllustration: mergeLegacyNaiSettings(bridge.autoIllustration, bridge.imageApi) },
        } };
    };
    const readerImageService = options.readerImageService || createReaderImageService({
        mediaCache,
        global: globalObject,
        getUnifiedSettings: getUnifiedSettingsSnapshot,
        hostAdapter,
        imageGenerator: options.imageGenerator || ((request, opts) =>
            imageBackend.generateForReader(request, readerImageOptions(opts))),
        providers: options.imageProviders,
        fetch: options.fetch,
    });
    const promptInjector = options.promptInjector || createPromptInjector(globalObject);
    const illustrationMessageHost = options.illustrationMessageHost || createIllustrationMessageHost(globalObject);
    const naiOfficialClient = options.naiOfficialClient || createNaiOfficialClient({ fetch: options.fetch || (typeof globalObject.fetch === 'function' ? globalObject.fetch.bind(globalObject) : undefined) });
    // 只读一两个字段的地方用浅合并，不为一个开关整份深拷贝配置（素材库大时每条生图日志、每次取阅读模式都很贵）。
    const peekBridge = () => ({ ...(state.legacyIgs && state.legacyIgs.bridge || {}), ...(state.config || {}) });
    const readImageBridge = () => {
        const bridge = (getUnifiedSettingsSnapshot() || {}).bridge || {};
        return { ...bridge, autoIllustration: mergeLegacyNaiSettings(bridge.autoIllustration, bridge.imageApi) };
    };
    const imageTaskRuntime = createBuiltinImageTaskRuntime({ readBridge: readImageBridge, registry: presetRegistry, global: globalObject,
        subscribeSettings: handler => events.on('igs:legacy-settings-updated', handler) });
    const secondaryLlm = createImagePromptLlm(options.secondaryLlm
        || createSecondaryLlm(globalObject, { fetch: options.fetch }), presetRegistry, imageTaskRuntime,
        createImageWorldInfoSource(globalObject));
    const imageJobLog = options.imageJobLog || createImageJobLog({
        storage: storageLike,
        getSettings: () => cloneData(peekBridge().imageJobLog),
    });
    const reportImageJob = options.reportImageJob || createImageJobReporter(
        globalObject,
        () => ({ showToasts: peekBridge().showToasts }),
        imageJobLog,
        () => (app.igsUi && typeof app.igsUi.showImageNotice === 'function' ? app.igsUi.showImageNotice.bind(app.igsUi) : null),
    );
    // 所有出图（手动 / 自动，CG / 立绘 / 背景 / 物品）都经过这一层，开始和结束各发一次活动事件给阅读器的生成细线。
    const imageBackend = trackImageActivity(options.imageBackend || createImageBackend({
        nai: naiOfficialClient,
        getBridge: readImageBridge,
        global: globalObject,
        llm: secondaryLlm,
        onRetry: (event) => { const notice = app.igsUi && app.igsUi.showImageNotice; if (typeof notice === 'function') notice.call(app.igsUi, 'info', event.text); },
        taskRuntime: imageTaskRuntime,
        report: (level, message) => {
            if (imageJobLog && typeof imageJobLog.add === 'function') imageJobLog.add(level, message);
        },
    }), (event) => events.emit(IMAGE_ACTIVITY_EVENT, event));
    // CG 库与自动插图共用同一个插图存储实例；写入 / 删除槽位时顺手更新 CG 库目录。
    const cgIndexStore = options.cgIndexStore || createIndexedDbCgIndexStore(globalObject);
    const illustrationStore = options.illustrationStore || withCgIndexSync(withTavernIllustrationFiles(createIndexedDbIllustrationStore(globalObject), globalObject), cgIndexStore, globalObject);
    const readerModeNow = () => {
        const bridge = peekBridge();
        return String(resolveLegacyReaderMode(undefined, state.legacyIgs && state.legacyIgs.displayMode, bridge) || bridge.openMode || 'pc');
    };
    const illustrationService = options.illustrationService || createAutoIllustrationService({
        messageHost: illustrationMessageHost,
        llm: secondaryLlm,
        nai: imageBackend,
        store: illustrationStore,
        mediaCache,
        getSettings: () => readImageBridge().autoIllustration,
        getReaderMode: readerModeNow,
        getViewport: () => readCgViewport(globalObject, readerModeNow()),
        getSceneAssets: () => sceneAssetsNow(readImageBridge().sceneAssets),
        ensureCgReferences: createCharacterReferenceRecovery({
            readAssets: () => readImageBridge().sceneAssets,
            readContext: () => getSillyTavernContext(globalObject),
            saveAssets: sceneAssets => saveUnifiedSettings({ bridge: { sceneAssets } }),
            getService: () => assetGenerationService,
        }),
        captureCgOutfitScope: (keys) => captureOutfitScope(readImageBridge().sceneAssets || {},
            resolveAssetScope(getSillyTavernContext(globalObject)).key, keys),
        stageCgOutfits: (record, floor) => {
            const bridge = readImageBridge();
            const staged = prepareCgOutfitCandidates(bridge.sceneAssets || {},
                resolveAssetScope(getSillyTavernContext(globalObject)).key, record, floor);
            if (!staged.ok) return staged;
            const loaded = loadStoryOutfitCandidates(storageLike);
            if (!loaded.ok) return loaded;
            const existing = new Set(loaded.items.map(row => row.id));
            return saveStoryOutfitCandidates(storageLike, staged.items.filter(row => !existing.has(row.id)));
        },
        imageCodec: options.imageCodec || createCanvasImageCodec(globalObject),
        readSpritePrompt: async (url) => (isGeneratedAssetUrl(url) && typeof assetGenerationService?.getImagePrompt === 'function'
            ? assetGenerationService.getImagePrompt(generatedAssetIdOf(url)) : null),
        readCgReferenceImage: async (url, options) => {
            if (!isGeneratedAssetUrl(url)) {
                const dataUrl = await readReferenceImageUrl(url, globalObject, options);
                return dataUrl === null ? null : { type: 'sprite', dataUrl };
            }
            const id = generatedAssetIdOf(url);
            if (typeof generatedAssetStore.readImage !== 'function') throw new Error('reference-read-unavailable');
            const image = await generatedAssetStore.readImage(id, options);
            if (image && (image.id !== id || image.type !== 'sprite')) throw new Error('reference-type-invalid');
            return image;
        },
        subscribeCgAppearance: handler => {
            const offs = [events.on('igs:legacy-settings-updated', () => handler({})),
                events.on(GENERATED_ASSET_UPDATED_EVENT, detail => {
                    if (!['image-loaded', 'hydrated'].includes(detail?.reason)) handler(detail);
                })];
            for (const name of ['CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED'])
                offs.push(illustrationMessageHost.on(name, () => handler({ targetChanged: true })));
            return () => offs.forEach(off => off?.());
        },
        resolveCgReference: async (characterKey, assets) => {
            const url = assets.characters?.[characterKey]?.['默认'] || assets.generated?.characters?.[characterKey]?.['默认'] || '';
            if (!isGeneratedAssetUrl(url)) return url;
            const image = await generatedAssetStore.getImage(generatedAssetIdOf(url));
            return image?.dataUrl || '';
        },
        getSourceFilter: () => readImageBridge().sourceFilter,
        events,
        random: options.random,
        report: reportImageJob,
    });
    // 物品图与素材补全共用 igs-generated-assets 存储实例。
    const generatedAssetStore = options.generatedAssetStore || withTavernGeneratedAssetFiles(createIndexedDbGeneratedAssetStore(globalObject), globalObject);
    const characterDnaStore = createCharacterDnaStore({
        readAssets: () => readImageBridge().sceneAssets,
        readContext: () => getSillyTavernContext(globalObject),
        saveAssets: sceneAssets => saveUnifiedSettings({ bridge: { sceneAssets } }),
    });
    const assetGenerationService = options.assetGenerationService || createAssetGenerationService({
        global: globalObject,
        messageHost: illustrationMessageHost,
        llm: secondaryLlm,
        nai: imageBackend,
        registerCreatureProfiles: hints => (creatureSystemEnabled() ? characterDnaStore.registerCreatures(hints) : { ok: true, changed: false }),
        captureCharacterDnaTarget: name => {
            const target = characterDnaStore.capture(name);
            return app.igsUi?.withCharacterDnaDraftSync?.(target) || target;
        },
        store: generatedAssetStore,
        mediaCache,
        readProtectedImageIds: () => protectedAssetImageIds({
            readSceneAssets: () => readImageBridge().sceneAssets || {},
            storage: storageLike, illustrationStore,
        }),
        matte: options.alphaMatte || createAlphaMatte(globalObject),
        getSettings: () => {
            const bridge = readImageBridge();
            return { autoIllustration: bridge.autoIllustration, sceneAssets: sceneAssetsNow(bridge.sceneAssets), imageApi: bridge.imageApi };
        },
        getReaderMode: readerModeNow,
        getViewport: () => readCgViewport(globalObject, readerModeNow()),
        getSourceFilter: () => readImageBridge().sourceFilter,
        events,
        report: reportImageJob,
        thumbStore: options.assetThumbStore !== undefined ? options.assetThumbStore : createIndexedDbAssetThumbStore(globalObject),
        makeThumb: createAssetThumbnailer(globalObject),
    });
    const storyOutfits = assetGenerationService.writeWardrobePrompt && storageLike
        ? createStoryOutfitRuntime({ storage: storageLike, assets: assetGenerationService,
            messageHost: illustrationMessageHost,
            readContext: () => getSillyTavernContext(globalObject), readBridge: readImageBridge,
            saveAssets: sceneAssets => saveUnifiedSettings({ bridge: { sceneAssets } }),
            onAssetsSaved: (before, next) => app.igsUi?.syncStoryOutfitDraft?.(before, next),
            onAutoResult(_row, result) {
                if (result?.ok) reportImageJob('success', '剧情衣装和对应立绘已入库');
                else reportImageJob('error', '剧情衣装自动处理未完成，请查看衣装审核与生图日志');
            },
        }) : null;
    generatedAssetStore.setReferenceResolver?.(() => readImageBridge().sceneAssets);
    const media = createMediaRuntime(globalObject, { generatedAssetStore });
    const itemCg = createItemAndCgServices({
        mediaCache: media.cache,
        globalObject,
        messageHost: illustrationMessageHost,
        llm: secondaryLlm,
        nai: imageBackend,
        generatedAssetStore,
        illustrationStore,
        clearIllustration: (query) => illustrationService.clearIllustration(query),
        getBridge: readImageBridge,
        events,
        matte: options.alphaMatte || createAlphaMatte(globalObject),
        report: reportImageJob,
        itemImageService: options.itemImageService,
        cgGalleryService: options.cgGalleryService,
        cgGalleryStore: options.cgGalleryStore,
        cgIndexStore,
        getReaderSettings: () => (getUnifiedSettingsSnapshot() || {}).readerSettings || {},
    });
    const state = {
        status: 'booting',
        config: mergeInitialConfig(options.config, legacyIgs),
        legacyIgs,
        currentScene: createSceneState(),
        lastRender: null,
        destroyed: false,
    };

    const app = {
        version: IGS_VERSION,
        global: globalObject,
        media,
        events,
        illustrations: illustrationService,
        generatedAssets: assetGenerationService,
        imageJobLog,
        hostAdapter,
        itemImages: itemCg.itemImages,
        cgGallery: itemCg.cgGallery,
        storage: storageLike,
        presetRegistry,
        refresh,
        typeAndSend,
        generateImage,
        collectMessageImages,
        getState,
        getConfig,
        getPresetRegistry,
        getLegacyIgsSettings,
        getUnifiedSettingsSnapshot,
        saveUnifiedSettings,
        destroy,
        shutdown,
        igsUi: null,
        magicWandEntry: null,
        extensionPanel: null,
    };
    const offMediaClear = media.cache.onClear(() => {
        events.emit('igs:media-cache-cleared');
    });
    let publicApi = null;
    let sceneAssetsInjectionTimer = null;
    app.igsUi = options.igsUi || createIgsReaderHost({
        global: globalObject,
        // statsRuntime 在阅读器之后创建，这里按需读取。
        statsLookup: () => (app.statsRuntime && typeof app.statsRuntime.metricsLookup === 'function' ? app.statsRuntime.metricsLookup() : null),
        statsChat: () => (app.statsRuntime ? app.statsRuntime.chatStatus() : null),
        statsArchive: () => (app.statsRuntime ? app.statsRuntime.archive() : null),
        // 推送映射页：读当前表格，按草稿里的覆盖值标出每列状态；没装数据库插件时返回 null。
        statsMappings: (overridesByFingerprint) => {
            const api = globalObject.AutoCardUpdaterAPI;
            return api ? describeStatMappings(createShujukuClient(api).readTables(), overridesByFingerprint || {}) : null;
        },
        statsChatAction: (kind, payload) => {
            if (!app.statsRuntime) return { ok: false, reason: 'stats-runtime-missing' };
            if (kind !== 'enable') return app.statsRuntime.disableForChat();
            // 按分配启用：超点或多选时不建卡，返回原因；已有存档（之前暂停过）时沿用冻结的数值，分配不覆盖（§10A）。
            if (payload && Object.hasOwn(payload, 'build')) {
                // 世界观附加技能只在当前世界观下计入；与设置页显示的候选保持一致。
                const built = buildInitialState(payload.build, { worldview: payload.worldview });
                if (!built.ok) return { ok: false, reason: built.reason };
                return app.statsRuntime.enableForChat({ initial: built.state });
            }
            return app.statsRuntime.enableForChat();
        },
        media,
        version: app.version,
        presetRegistry,
        random: options.random,
        getIllustrationSource: (messageId) => illustrationMessageHost.readFloor(messageId),
        getIllustrationUrl: (query) => illustrationService.getIllustrationUrl(query),
        illustrations: illustrationService,
        isIllustrationEnabled: () => { const cfg = readImageBridge().autoIllustration || {}; return Boolean(cfg.nsfwEnabled || cfg.interludeEnabled); },
        onIllustrationUpdated: (handler) => events.on(ILLUSTRATION_UPDATED_EVENT, handler),
        onIllustrationProgress: (handler) => events.on(ILLUSTRATION_PROGRESS_EVENT, handler),
        onImageActivity: (handler) => events.on(IMAGE_ACTIVITY_EVENT, handler),
        generatedAssets: assetGenerationService,
        storyOutfits,
        // 遮罩修复编辑器的 AI 局部重绘：只经 describeEdit/edit 显式调用，不影响普通生成。
        imageEditBackend: imageBackend,
        alphaMatte: options.alphaMatte || createAlphaMatte(globalObject),
        onGeneratedAssetUpdated: (handler) => events.on(GENERATED_ASSET_UPDATED_EVENT, handler),
        onSettingsUpdated: (handler) => events.on('igs:legacy-settings-updated', handler),
        itemImages: itemCg.itemImages,
        cgGallery: itemCg.cgGallery,
        onItemImageUpdated: itemCg.onItemImageUpdated,
        itemLedger: itemCg.itemLedger,
        requestMoodClassification({ system, user }, llmSettings) {
            return secondaryLlm.request({ system, user }, llmSettings);
        },
        requestSecondaryText({ system, user }, llmSettings) {
            return secondaryLlm.request({ system, user }, llmSettings);
        },
        readCardWorldbook: (names) => (typeof illustrationMessageHost.readCardWorldbook === 'function'
            ? illustrationMessageHost.readCardWorldbook(names) : []),
        getCurrentChatId: () => (typeof illustrationMessageHost.getChatId === 'function' ? illustrationMessageHost.getChatId() : ''),
        imageJobLog,
        getUnifiedSettings: getUnifiedSettingsSnapshot,
        // 配置每次写入（保存、从酒馆文件恢复）都加一；阅读器翻页据此复用上次整理好的配置。
        getSettingsRevision: () => state.settingsRevision || 0,
        saveUnifiedSettings,
        typeAndSend,
        resumeReply: () => hostAdapter.resumeReply?.() || { ok: false, reason: 'reply-host-not-ready' },
        setInputText(text) {
            return typeof hostAdapter.setInputText === 'function' ? hostAdapter.setInputText(text) : { ok: false, reason: 'missing-input-api' };
        },
        fillEmptyInputText(text, options) {
            return typeof hostAdapter.fillEmptyInputText === 'function' ? hostAdapter.fillEmptyInputText(text, options) : { ok: false, reason: 'missing-readable-input' };
        },
        // 内嵌模式点小铅笔编辑完成 / 取消后，按原模式重新打开最新楼层；publicApi 在阅读器宿主之后创建，延迟取用。
        reopenReader(mode) {
            return publicApi && typeof publicApi.openLatestAvailable === 'function'
                ? publicApi.openLatestAvailable(mode)
                : { ok: false, reason: 'public-api-not-ready' };
        },
        getAdjacentMessage: hasAdjacentMessageCapability() ? resolveAdjacentMessage : null,
        isUserFloor: (messageId) => Boolean(hostAdapter && typeof hostAdapter.isUserFloor === 'function'
            && hostAdapter.isUserFloor(messageId)),
        jumpToMessage: jumpToMessage,
        listTurns: hasAdjacentMessageCapability() ? listReaderTurns : null,
        openViewerFromMessage(messageId, mode, openOptions = {}) {
            if (!publicApi || typeof publicApi.openViewerFromMessage !== 'function') {
                return { ok: false, reason: 'public-api-not-ready', messageId, mode, openOptions };
            }
            return publicApi.openViewerFromMessage(messageId, mode, openOptions);
        },
        collectMessageImages(context = {}) {
            return readerImageService.collect({
                ...context,
                providers: getImageProviders(),
                unifiedSettings: getUnifiedSettingsSnapshot({ mode: context.mode }),
            });
        },
        fetchLlmModels(context = {}) {
            const llm = context.settings && context.settings.bridge && context.settings.bridge.autoIllustration && context.settings.bridge.autoIllustration.llm;
            return secondaryLlm.fetchModels(llm);
        },
        fetchImageModels(context = {}) {
            return readerImageService.fetchModels({
                ...context,
                providers: getImageProviders(),
                unifiedSettings: context.settings || context.unifiedSettings || getUnifiedSettingsSnapshot({ mode: context.mode }),
            });
        },
        testImageApi(context = {}) {
            return readerImageService.test({
                ...context,
                imageGenerator: options.imageGenerator || ((request, opts) =>
                    (imageBackend.testForReader || imageBackend.generateForReader)
                        .call(imageBackend, request, readerImageOptions(opts))),
                providers: getImageProviders(),
                unifiedSettings: context.settings || context.unifiedSettings || getUnifiedSettingsSnapshot({ mode: context.mode }),
            });
        },
        regenerateImage(context = {}) {
            return readerImageService.regenerate({
                ...context,
                providers: getImageProviders(),
                unifiedSettings: getUnifiedSettingsSnapshot({ mode: context.mode }),
            });
        },
        saveImage(context = {}) {
            return readerImageService.save(context);
        },
        getCurrentMessage: () => hostAdapter.getCurrentMessage(),
    });
    publicApi = createPublicApi(app);
    // QR 按钮经 loader 直接调用此入口，失败时 loader 只写控制台，表现为点击无反应；失败原因在此提示。
    const openLatestQuiet = publicApi.openLatestAvailable;
    publicApi.openLatestAvailable = (...args) => Promise.resolve()
        .then(() => openLatestQuiet(...args))
        .then((result) => {
            if (result && result.ok === false) notifyOpenFailure(globalObject, result.reason);
            return result;
        }, (error) => {
            notifyOpenFailure(globalObject, error && error.message || String(error));
            throw error;
        });
    readerImageService.registerProviders(publicApi.api.imageProviders);
    attachPublicApi(globalObject, publicApi);
    app.magicWandEntry = options.magicWandEntry || createMagicWandEntry({
        ...(options.magicWandEntryOptions || {}),
        global: globalObject,
        media,
        version: app.version,
        label: '沉浸式Galgame系统',
        open: (mode) => openLatestQuiet(mode),
        resolveMode: () => {
            const snapshot = publicApi.getUnifiedSettings({});
            return snapshot && (snapshot.readerMode || snapshot.bridge && snapshot.bridge.openMode) || 'pc';
        },
    });
    app.extensionPanel = options.extensionPanel || createExtensionPanel({
        global: globalObject,
        label: '沉浸式Galgame系统',
        openSettings: () => publicApi.openSettings({}),
        openReader: () => publicApi.openLatestAvailable(),
        getEntryConfig: () => resolveEntryConfig(),
        setEntryConfig: (next) => saveEntryConfig(next),
    });
    function resolveEntryConfig() {
        const snapshot = publicApi.getUnifiedSettings({});
        const entry = snapshot && snapshot.bridge && snapshot.bridge.entry;
        return { magic: !entry || entry.magic !== false };
    }
    function saveEntryConfig(next) {
        const cfg = { magic: next.magic !== false };
        if (typeof saveUnifiedSettings === 'function') {
            saveUnifiedSettings({ bridge: { entry: cfg } });
        }
        applyEntryConfig(cfg);
    }
    function applyEntryConfig(cfg) {
        const entry = cfg || resolveEntryConfig();
        if (entry.magic) app.magicWandEntry.attach();
        else if (typeof app.magicWandEntry.destroy === 'function') app.magicWandEntry.destroy();
    }
    if (options.autoAttachMagicWand !== false) {
        applyEntryConfig(resolveEntryConfig());
        if (app.extensionPanel && typeof app.extensionPanel.attach === 'function') {
            app.extensionPanel.attach();
        }
    }
    runSpriteMigration();
    function runSpriteMigration() {
        const bridge = { ...state.legacyIgs?.bridge, ...state.config };
        const planned = migrateSpriteSystem(bridge.sceneAssets, state.legacyIgs?.readerSettingsByMode || {});
        if (!planned.changed) return;
        const assets = Object.keys(planned.sceneAssets.generated?.expressionNotes || {}).length
            ? { ...planned.sceneAssets, spriteMigrationNotesPending: true } : planned.sceneAssets;
        const saved = saveUnifiedSettings({ bridge: { sceneAssets: assets },
            readerSettingsByMode: planned.readerSettingsByMode, spriteMigration: true });
        state.spriteMigration = saved.ok ? { ok: true } : { ok: false, reason: saved.reason };
        if (!saved.ok) console.warn('[IGS] 旧立绘迁移保存失败，原数据保持不变，可在下次保存或启动时重试。');
    }
    // 全局配置镜像到酒馆 user/files：另一台设备存得更新时写回本机并刷新运行时设置。
    if (!options.storage && storageLike && options.tavernSettingsSync !== false) {
        state.settingsSync = createTavernSettingsSync(globalObject, {
            storage: storageLike,
            onUploaded: () => { if (!state.destroyed) void media.referencesChanged().catch(() => {}); },
            onRestored: () => {
                if (state.destroyed) return;
                void media.referencesChanged().catch(() => {});
                state.legacyIgs = readLegacyIgsSettings(storageLike);
                syncCreatureSystem(state.legacyIgs);
                state.config = mergeInitialConfig(options.config, state.legacyIgs);
                runSpriteMigration();
                state.settingsRevision = (state.settingsRevision || 0) + 1;
                if (typeof presetRegistry.hydrate === 'function') presetRegistry.hydrate();
                events.emit('igs:legacy-settings-updated', state.legacyIgs);
                if (options.autoAttachMagicWand !== false) applyEntryConfig(resolveEntryConfig());
                applyFileExpressionNotes();
                applyImageCacheLimit(state.config);
                syncSceneAssetsInjectionWithRetry(1);
            },
        });
        void state.settingsSync.start();
    }
    // 立绘提示词单独落酒馆文件（localStorage 不存这段）：读回后补进运行时配置。
    if (!options.storage && storageLike && options.tavernSettingsSync !== false) {
        state.notesFile = createExpressionNotesFile(globalObject, {
            onUploaded: body => {
                const assets = state.config?.sceneAssets;
                if (state.destroyed || !assets?.spriteMigrationNotesPending
                    || JSON.stringify(assets.generated?.expressionNotes || {}) !== body) return;
                saveUnifiedSettings({ bridge: { sceneAssets: { ...assets, spriteMigrationNotesPending: false } } });
            },
        });
        void state.notesFile.load().then((notes) => {
            if (state.destroyed) return;
            if (notes) {
                state.fileExpressionNotes = notes;
                if (applyFileExpressionNotes()) events.emit('igs:legacy-settings-updated', state.legacyIgs);
            }
            const current = state.config?.sceneAssets?.generated?.expressionNotes;
            if (current) {
                state.fileExpressionNotes = cloneData(current);
                state.notesFile.save(current);
            }
        });
    }
    // 存储里的配置只读：补进来的提示词按路径浅拷出新的 bridge 再整份换上，并升版本让缓存失效。
    function applyFileExpressionNotes() {
        const notes = state.fileExpressionNotes;
        if (!notes) return false;
        const withNotes = (bridge) => {
            const sa = bridge && bridge.sceneAssets;
            if (!sa || typeof sa !== 'object') return bridge;
            const generated = sa.generated && typeof sa.generated === 'object' ? sa.generated : {};
            const current = generated.expressionNotes && typeof generated.expressionNotes === 'object' ? generated.expressionNotes : {};
            const next = {};
            for (const [name, moods] of Object.entries(current)) next[name] = moods && typeof moods === 'object' && !Array.isArray(moods) ? { ...moods } : moods;
            if (!fillExpressionNotes(next, notes)) return bridge;
            const migrated = migrateSpriteSystem({ ...sa, generated: { ...generated, expressionNotes: next } });
            return { ...bridge, sceneAssets: migrated.sceneAssets };
        };
        const config = withNotes(state.config);
        const legacyBridge = state.legacyIgs && state.legacyIgs.bridge;
        const nextLegacyBridge = legacyBridge === state.config ? config : withNotes(legacyBridge);
        if (config === state.config && nextLegacyBridge === legacyBridge) return false;
        state.config = config;
        if (nextLegacyBridge !== legacyBridge) state.legacyIgs = { ...state.legacyIgs, bridge: nextLegacyBridge };
        state.settingsRevision = (state.settingsRevision || 0) + 1;
        return true;
    }
    function applyImageCacheLimit(bridge) {
        const cache = mediaCache;
        if (cache && typeof cache.setDisplayCompression === 'function') {
            void cache.setDisplayCompression(bridge?.imageCache?.compressDisplay !== false).catch(error => console.warn('[IGS 图片缓存] 设置未完成', error));
        }
        if (cache && typeof cache.setMaxCount === 'function') {
            void cache.setMaxCount(bridge && bridge.imageCache && bridge.imageCache.maxCount);
        }
    }

    state.status = 'ready';
    // 设置就绪后再按保留规则清理一次启动前遗留的旧日志。
    if (imageJobLog && typeof imageJobLog.prune === 'function') imageJobLog.prune();
    applyImageCacheLimit((getUnifiedSettingsSnapshot() || {}).bridge);
    illustrationService.start();
    assetGenerationService.start();
    storyOutfits?.start();
    itemCg.itemImages.start();
    itemCg.itemLedger.start();
    scheduleSceneAssetsInjection(SCENE_ASSETS_INJECTION_INITIAL_DELAY_MS, 1);
    attachChatChangedReinjection();
    attachMetaDigestSync();
    // 数值系统：总开关关闭时 sync() 不挂任何监听；设置保存后重新同步（易错点 H1）。
    const statsRuntime = createStatsRuntime({
        getContext: resolveTavernContext,
        readSettings: () => ((getUnifiedSettingsSnapshot() || {}).bridge || {}).stats,
        getPushClient: () => (globalObject.AutoCardUpdaterAPI ? createShujukuClient(globalObject.AutoCardUpdaterAPI) : null),
        // 词表冲突时的辅助模型（§4.1、G1/G2）：只用独立 API。生成开始事件会被宿主等待，此时再走酒馆 generateRaw 等于嵌套主生成，可能互相阻塞，因此沿用酒馆 API 时不启用，按无需检定继续。
        getModelRequest: () => {
            const auto = ((getUnifiedSettingsSnapshot() || {}).bridge || {}).autoIllustration || {};
            const llm = auto.llm;
            if (!llm || llm.source !== 'openai' || !describeLlmReady(llm).ok) return null;
            return (prompt) => secondaryLlm.request({ system: prompt.system, user: prompt.user }, llm);
        },
        onChange: (statsState, entry, info) => {
            // 换聊天时清掉上一个聊天的吃醋情敌，同名角色不串（§5.3 修罗场联动）。
            if (info && info.chatChanged) clearStatsRivals();
            events.emit('igs:stats-updated', { state: statsState, entry });
            // 演出数据（P5）：只在本楼有新结算时发出；没有可播内容时 statsFxOf 返回 null，直接跳过。
            if (!entry) return;
            const hudLabel = normalizeStatsSettings(((getUnifiedSettingsSnapshot() || {}).bridge || {}).stats).hudLabel;
            const fx = statsFxOf(entry, { hudLabel });
            if (!fx) return;
            events.emit('igs:stats-fx', { messageId: entry.messageId, swipeId: entry.swipeId, ...fx });
            // 吃醋扣过好感的角色登记为修罗场情敌来源；主对象仍只认 romance 第 3 栏。
            if (fx.jealous && fx.jealous.length) registerStatsRivals(fx.jealous);
            // 成长与战斗结果走阅读器生成细线（不弹窗、不挡画面，§10）；阅读器未打开时 info 级不退回 toastr。
            const notice = app.igsUi && app.igsUi.showImageNotice;
            if (typeof notice === 'function') {
                for (const line of statsNoticeLines(fx)) {
                    try { notice.call(app.igsUi, 'info', line); } catch (error) { /* 细线出错不影响结算 */ }
                }
            }
        },
    });
    app.statsRuntime = statsRuntime;
    state.statsSettingsOff = events.on('igs:legacy-settings-updated', () => statsRuntime.sync());
    statsRuntime.sync();
    events.emit('igs:ready', publicApi);

    return publicApi;

    async function refresh(context = {}) {
        ensureAlive();
        const message = context.message
            || await resolveContextMessage(context.messageId)
            || await hostAdapter.getCurrentMessage();
        const textScene = context.textScene || parseSceneText(getMessageText(message), {
            messageId: message && message.id,
            textFilterPreset: resolvePresetInput(context, 'textFilterPreset', 'text-filter-preset', state.config.textFilterPreset),
            textFormatPreset: resolvePresetInput(context, 'textFormatPreset', 'text-format-preset', state.config.textFormatPreset),
            sceneRegexPreset: resolvePresetInput(context, 'sceneRegexPreset', 'scene-regex-preset', state.config.sceneRegexPreset),
        });
        const scene = resolveScene({
            ...context,
            previousScene: state.currentScene,
            textScene,
        });
        const visualMode = resolveVisualMode(scene, context.visualSettings || state.config.visual || {});
        const renderedScene = createSceneState({ ...scene, visualMode });
        const renderResult = renderer.render(renderedScene, {
            mode: context.mode,
            viewerMode: context.viewerMode,
            visualSettings: context.visualSettings || state.config.visual || {},
            readerSettings: context.readerSettings,
            layoutSettings: context.layoutSettings,
            viewport: context.viewport || getViewport(globalObject),
            isMobile: context.isMobile,
            legacyIgs: state.legacyIgs,
            systemMessages: context.systemMessages,
            choiceState: context.choiceState,
        });
        state.currentScene = renderedScene;
        state.lastRender = renderResult;
        events.emit('igs:scene', renderedScene);
        return { ok: true, scene: renderedScene, render: renderResult };
    }

    async function typeAndSend(text) {
        ensureAlive();
        return inputChannel.typeAndSend(text);
    }

    function generateImage(request, generateOptions = {}) {
        return readerImageService.generate({
            request: typeof request === 'string' ? { prompt: request } : cloneData(request),
            prompt: typeof request === 'string'
                ? request
                : request && (request.prompt || request.input) || '',
            message: generateOptions.message || request && request.message || null,
            messageId: generateOptions.messageId || request && request.messageId || null,
            mode: generateOptions.mode,
            unifiedSettings: generateOptions.unifiedSettings || getUnifiedSettingsSnapshot({ mode: generateOptions.mode }),
            providers: getImageProviders(),
            generateOptions: cloneData(generateOptions),
        });
    }

    async function collectMessageImages(context = {}) {
        return readerImageService.collect({
            ...context,
            providers: getImageProviders(),
            unifiedSettings: context.unifiedSettings || getUnifiedSettingsSnapshot({ mode: context.mode }),
        });
    }

    // 只读引用（共享只读，不要原地改）：只要配置时用它，免得 getState() 深拷整份阅读器快照和预设库。
    function getConfig() {
        return state.config;
    }

    function getState() {
        return {
            status: state.status,
            config: state.config,
            legacyIgs: state.legacyIgs,
            presets: presetRegistry.snapshot(),
            currentScene: state.currentScene,
            lastRender: state.lastRender,
            destroyed: state.destroyed,
            igsUi: app.igsUi ? app.igsUi.getState() : null,
            magicWandEntry: app.magicWandEntry && typeof app.magicWandEntry.getState === 'function'
                ? app.magicWandEntry.getState()
                : null,
        };
    }

    function getPresetRegistry() {
        return presetRegistry;
    }

    function getLegacyIgsSettings() {
        return cloneData(state.legacyIgs);
    }

    // 存储里的配置（state.config / state.legacyIgs）是共享只读的：只在 saveUnifiedSettings 换整份，从不原地改。
    // 所以这里不深拷，同一版本（settingsRevision）同一模式直接复用上次的结果；拿到的人只读，要改就浅拷改到的那层。
    function getUnifiedSettingsSnapshot(input = {}) {
        const modeKey = input && typeof input === 'object' ? input.mode : input;
        const revision = state.settingsRevision || 0;
        if (unifiedCache && unifiedCache.revision === revision && unifiedCache.modeKey === modeKey
            && unifiedCache.legacy === state.legacyIgs && unifiedCache.config === state.config) return unifiedCache.value;
        const value = buildUnifiedSettingsSnapshot(input);
        unifiedCache = { revision, modeKey, legacy: state.legacyIgs, config: state.config, value };
        return value;
    }
    function buildUnifiedSettingsSnapshot(input) {
        const bridge = {
            ...(state.legacyIgs && state.legacyIgs.bridge || {}),
            ...(state.config || {}),
        };
        if (bridge.sceneAssets && typeof bridge.sceneAssets === 'object' && !Array.isArray(bridge.sceneAssets)) {
            bridge.sceneAssets = {
                ...bridge.sceneAssets,
                promptRule: normalizeScenePromptRule(bridge.sceneAssets.promptRule),
            };
        }
        const readerMode = resolveLegacyReaderMode(
            input && typeof input === 'object' ? input.mode : input,
            state.legacyIgs && state.legacyIgs.displayMode,
            bridge,
        );
        const readerSettingsByMode = state.legacyIgs && state.legacyIgs.readerSettingsByMode || {};
        // 优先 default 桶；老用户 default 为空时回退到旧的 pc/mobile 分桶或顶层 readerSettings。
        const hasKeys = (obj) => obj && typeof obj === 'object' && Object.keys(obj).length > 0;
        const resolvedReaderSettings = hasKeys(readerSettingsByMode['default']) ? readerSettingsByMode['default']
            : hasKeys(readerSettingsByMode['pc']) ? readerSettingsByMode['pc']
            : hasKeys(readerSettingsByMode['mobile']) ? readerSettingsByMode['mobile']
            : state.legacyIgs.readerSettings || {};
        return {
            version: app.version,
            bridge,
            readerMode,
            imageApi: bridge.imageApi || {},
            readerSettings: resolvedReaderSettings,
        };
    }

    function saveUnifiedSettings(payload = {}) {
        const currentLegacy = state.legacyIgs || readLegacyIgsSettings(storageLike);
        // Merge first, then copy the winning values once. Copying each source before
        // the shallow merge duplicates large sceneAssets libraries that get overwritten.
        const nextBridge = cloneData({
            ...(currentLegacy.bridge || {}),
            ...(state.config || {}),
            ...(payload.bridge || {}),
        });
        const displayMode = resolveLegacyReaderMode(
            nextBridge.openMode,
            currentLegacy.displayMode,
            nextBridge,
        );
        const readerMode = resolveLegacyReaderMode(
            payload.readerMode,
            displayMode,
            nextBridge,
        );
        // 只换 default 桶，其余桶原样共享（只读）。
        let readerSettingsByMode = { ...(currentLegacy.readerSettingsByMode || {}),
            ...cloneData(payload.readerSettingsByMode || {}) };
        const hasValues = value => value && typeof value === 'object' && Object.keys(value).length > 0;
        if (!hasValues(readerSettingsByMode.default)) readerSettingsByMode.default = cloneData(
            [readerSettingsByMode.pc, readerSettingsByMode.mobile, currentLegacy.readerSettings].find(hasValues) || {});
        // v0.21.4 起全模式共用一套设置，统一存取 'default' 桶。
        // 历史上保存按 readerMode 分桶、读取却固定读 'default'，导致移动端存了读不回。
        for (const mode of LEGACY_READER_MODES) {
            if (!readerSettingsByMode[mode]) readerSettingsByMode[mode] = {};
        }
        if (payload.readerSettings && typeof payload.readerSettings === 'object') {
            readerSettingsByMode['default'] = cloneData(payload.readerSettings);
        }
        const migration = migrateSpriteSystem(nextBridge.sceneAssets, readerSettingsByMode);
        nextBridge.sceneAssets = migration.sceneAssets;
        if (migration.changed && Object.keys(nextBridge.sceneAssets?.generated?.expressionNotes || {}).length)
            nextBridge.sceneAssets = { ...nextBridge.sceneAssets, spriteMigrationNotesPending: true };
        readerSettingsByMode = migration.readerSettingsByMode;
        const nextLegacy = {
            ok: true,
            bridge: nextBridge,
            displayMode,
            readerMode,
            readerSettings: readerSettingsByMode['default'] || {},
            readerSettingsByMode,
        };
        const writeResult = storageLike
            ? writeLegacyIgsSettings(storageLike, nextLegacy, { migration: migration.changed || payload.spriteMigration === true })
            : { ok: true, legacy: nextLegacy, persisted: false };
        if (writeResult.ok === false) return writeResult;
        const savedNotes = nextBridge.sceneAssets && nextBridge.sceneAssets.generated && nextBridge.sceneAssets.generated.expressionNotes;
        if (state.notesFile) state.notesFile.save(savedNotes);
        // 文件里那份跟着用户的删改走，之后的补缺不把删掉的提示词补回来。
        if (savedNotes && typeof savedNotes === 'object') state.fileExpressionNotes = cloneData(savedNotes);
        // 整份替换：nextBridge 是本次唯一一次深拷（payload 多半是设置草稿，之后还会被原地改），已含 state.config 全部键。
        // 从此它和 writeResult.legacy 都只读，config 与 legacy.bridge 共用同一份。
        state.legacyIgs = writeResult.legacy;
        syncCreatureSystem(state.legacyIgs);
        state.config = nextBridge;
        state.settingsRevision = (state.settingsRevision || 0) + 1;
        // 监听方只当通知用（不读载荷），传引用即可；需要数据请走 getUnifiedSettings。
        events.emit('igs:legacy-settings-updated', state.legacyIgs);
        // 用户改了日志保留天数 / 条数后立即按新规则清理。
        if (imageJobLog && typeof imageJobLog.prune === 'function') imageJobLog.prune();
        applyImageCacheLimit(nextBridge);
        syncSceneAssetsInjectionWithRetry(1);
        return {
            ok: true,
            legacy: state.legacyIgs,
            // 调用方基本不读这份，按需再生成，免得每次保存都多拷一遍。
            get unified() { return getUnifiedSettingsSnapshot({ mode: readerMode }); },
        };
    }

    function syncSceneAssetsInjection(generationType = null) {
        const unified = getUnifiedSettingsSnapshot();
        const sceneAssets = sceneAssetsNow(unified.bridge && unified.bridge.sceneAssets);
        // 世界观：与之冲突的演出开关在这里拨成关，AI 不会收到它们的语法说明；时代规则按世界观追加（现代为空）。
        const worldview = resolveWorldview(sceneAssets);
        const ancient = worldview === 'ancient';
        // 随身带着现代手机：提示句追加在时代规则后面（开关关或世界观为现代时为空）。
        const carryPhoneRule = resolveCarryPhonePrompt(worldview, sceneAssets);
        const eraRule = [resolveWorldviewPromptRule(worldview, sceneAssets), carryPhoneRule].filter(Boolean).join('\n');
        const worldviewSettings = applyFxWorldview(unified.readerSettings, worldview, { carryPhone: Boolean(carryPhoneRule) });
        // 手机社区按世界观换平台：把世界观写进传给提示词的快照（新对象，不改原设置）。
        const readerSettings = worldviewSettings && typeof worldviewSettings === 'object'
            ? { ...worldviewSettings, feedFx: { ...(worldviewSettings.feedFx || {}), worldview } }
            : worldviewSettings;
        const placement = normalizePromptPlacement(sceneAssets && sceneAssets.promptPlacement);
        // 交互摘要：只在有待送出的事件时注入，生成结束后清空（见 attachMetaDigestSync）。
        // 直播互动与 Meta 互动共用待送出事件，各自开关、各自成段，合并后走同一条注入路径。
        const metaDigestRule = [resolveMetaDigestRule(readerSettings && readerSettings.metaFx), resolveLiveDigestRule(readerSettings)].filter(Boolean).join('\n\n');
        const promptContext = collectPromptContext(resolveTavernContext(), { document: globalObject.document });
        const outfitContext = { previousAiTexts: promptContext.previousAiTexts,
            sourceFilter: unified.bridge?.sourceFilter, virtualRegex: unified.bridge?.virtualRegex };
        if (sceneAssets && sceneAssets.promptAdaptive === false) {
            return injectLegacyPromptRules(sceneAssets, readerSettings, { ancient, eraRule, placement, metaDigestRule, outfitContext });
        }
        if (generationType === 'impersonate' || generationType === 'quiet') {
            promptInjector.clear();
            return { ok: true, reason: 'generation-type-skipped' };
        }
        // 社区平台写法只展开最近提到的平台，其余只列名字。
        if (readerSettings && readerSettings.feedFx) readerSettings.feedFx.mentioned = mentionedFeedPlatforms([promptContext.userText, ...(promptContext.recentAiTexts || []).slice(-2)]);
        const sceneOn = Boolean(sceneAssets && sceneAssets.enabled && scenePromptRuleEnabled(sceneAssets) && sceneAssets.promptRule);
        const entries = sceneAssets && sceneAssets.promptEntries;
        const triggers = resolvePromptTriggers({ ...promptContext, entries });
        const grammar = buildTagGrammar({
            readerSettings,
            sceneRule: sceneOn ? resolvePromptRuleContent(sceneAssets, { compact: true, presentText: promptContext.presentText, ...outfitContext }) : '',
            ancient,
            expand: triggers.hits,
            tailRules: eraRule ? [eraRule] : [],
            dynamicRules: metaDigestRule ? [metaDigestRule] : [],
            moodWord: firstMoodWord(sceneAssets),
            entries,
        });
        // 记下每块展开与否、原因和字数，诊断与设置页拿来对着调关键词。
        setLastPromptReport({ at: Date.now(), blocks: Object.fromEntries(Object.entries(triggers.report).filter(([key]) => key in grammar.sizes || triggers.report[key].reason === 'off').map(([key, item]) => [key, { ...item, chars: grammar.sizes[key] || 0, ...(grammar.placements && grammar.placements[key] ? grammar.placements[key] : {}) }])) });
        if (!grammar.system) {
            promptInjector.clear();
            return { ok: true, reason: 'scene-assets-disabled' };
        }
        const depth0Content = [placement === 'system' ? DEPTH0_REMINDER : '', grammar.depth0].filter(Boolean).join('\n\n');
        return promptInjector.inject(grammar.system, { placement, depth0Content, segments: grammar.segments });
    }

    // 关闭按需注入时的旧行为：各块完整拼接；未自定义的场景规则用改版前的长版原文。
    function injectLegacyPromptRules(sceneAssets, readerSettings, { ancient, eraRule, placement, metaDigestRule, outfitContext }) {
        const rules = [];
        // 场景规则自带 [igs标签语法] 头部（含通用机制）；没有它时，若后面有演出规则就补一次兜底，
        // 因为各演出块已把通用机制抽到头部、自身不再复述。
        let hasHeader = false;
        if (sceneAssets && sceneAssets.enabled && scenePromptRuleEnabled(sceneAssets) && sceneAssets.promptRule) {
            const promptRule = sceneAssets.promptRule === DEFAULT_SCENE_PROMPT_RULE
                ? `${LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3}\n{{previous_outfit_dna}}`
                : sceneAssets.promptRule;
            rules.push(resolvePromptRuleContent({ ...sceneAssets, promptRule }, outfitContext));
            hasHeader = true;
        }
        const rs = readerSettings || {};
        const fxStart = rules.length;
        const chatShow = rs.chatShow;
        // 随身手机：聊天与来电等手机演出按现代写法。
        const phoneAncient = ancient && !(rs.feedFx && rs.feedFx.carryPhone === true);
        // 演出提示词入口：inject 关掉就不发任何演出标签用法；某块覆盖文本非空时用用户自己写的（功能本身关着则不发）。
        const fxPrompts = normalizeFxPromptsSettings(rs.fxPrompts);
        const pushFx = (key, builtin) => {
            if (!fxPrompts.inject || !builtin) return;
            rules.push(fxPrompts[key].trim() || builtin);
        };
        if (normalizeChatShowSettings(chatShow).enabled) pushFx('chat', resolveChatShowPromptRule(chatShow, { ancient: phoneAncient }));
        pushFx('fx', resolveFxPromptRule(rs.fxTags, { ancient: phoneAncient }));
        pushFx('dlc', resolveDlcFxPromptRule(rs.dlcFx));
        pushFx('item', resolveItemFxPromptRule(Boolean(rs.itemFx && rs.itemFx.enabled)));
        pushFx('text', resolveTextFxPromptRule(Boolean(rs.textFx && rs.textFx.enabled)));
        pushFx('bilingual', resolveBilingualPromptRule(rs.bilingual));
        pushFx('daily', resolveDailyFxPromptRule(rs.dailyFx));
        pushFx('battle', resolveBattleFxPromptRule(Boolean(rs.battleFx && rs.battleFx.enabled)));
        // 非人角色标签：与 pushFx 同一注入条件（inject 打开且战斗演出开启）；条目关闭则不发，条目正文非空时用用户的覆盖文本。
        { const entry = normalizePromptEntries(sceneAssets && sceneAssets.promptEntries).creature;
            const creatureRule = resolveCreatureFxPromptRule(Boolean(rs.battleFx && rs.battleFx.enabled && rs.battleFx.creature !== false) && creatureSystemEnabled());
            if (fxPrompts.inject && creatureRule && entry.mode !== 'off') rules.push(entry.text.trim() || creatureRule); }
        pushFx('romance', resolveRomanceFxPromptRule(rs.romanceFx));
        pushFx('bgm', resolveBgmPromptRule(rs.bgm));
        pushFx('cast', resolveStageCastFxPromptRule(rs.stageCast));
        const danmakuRule = resolveDanmakuPromptRule(readerSettings, fxPrompts.inject
            ? { live: fxPrompts.live, audience: fxPrompts.audience }
            : { live: false, audience: false });
        if (danmakuRule) rules.push(danmakuRule);
        pushFx('feed', resolveFeedPromptRule(readerSettings));
        // 没有场景头部、但确实注入了演出规则时，在演出规则前补一次通用机制说明。
        if (!hasHeader && rules.length > fxStart) rules.splice(fxStart, 0, GRAMMAR_HEADER);
        const split = placement === 'system';
        if (metaDigestRule && !split) rules.push(metaDigestRule);
        if (rules.length && eraRule) rules.push(eraRule);
        if (!rules.length) {
            promptInjector.clear();
            return { ok: true, reason: 'scene-assets-disabled' };
        }
        const depth0Content = split ? [DEPTH0_REMINDER, metaDigestRule].filter(Boolean).join('\n\n') : '';
        return promptInjector.inject(rules.join('\n\n'), { placement, depth0Content });
    }

    function syncSceneAssetsInjectionWithRetry(attempt) {
        const result = syncSceneAssetsInjection();
        if (shouldRetrySceneAssetsInjection(result, attempt)) {
            scheduleSceneAssetsInjection(Math.min(30000,
                SCENE_ASSETS_INJECTION_RETRY_MS * 2 ** Math.min(attempt, 5)), attempt + 1);
        }
        return result;
    }

    function scheduleSceneAssetsInjection(delayMs, attempt) {
        clearSceneAssetsInjectionTimer();
        const schedule = typeof globalObject.setTimeout === 'function'
            ? globalObject.setTimeout.bind(globalObject)
            : setTimeout;
        sceneAssetsInjectionTimer = schedule(() => {
            sceneAssetsInjectionTimer = null;
            syncSceneAssetsInjectionWithRetry(attempt);
        }, delayMs);
    }

    function clearSceneAssetsInjectionTimer() {
        if (sceneAssetsInjectionTimer == null) return;
        const cancel = typeof globalObject.clearTimeout === 'function'
            ? globalObject.clearTimeout.bind(globalObject)
            : typeof clearTimeout === 'function' ? clearTimeout : null;
        if (cancel) cancel(sceneAssetsInjectionTimer);
        sceneAssetsInjectionTimer = null;
    }

    function shouldRetrySceneAssetsInjection(result, attempt) {
        if (!result || result.ok !== false) return false;
        if (state.destroyed) return false;
        return result.reason !== 'empty-content';
    }

    function resolveTavernContext() {
        try {
            const candidates = [globalObject, globalThis, typeof window !== 'undefined' ? window : null];
            for (const root of candidates) {
                if (root && root.SillyTavern && typeof root.SillyTavern.getContext === 'function') {
                    return root.SillyTavern.getContext();
                }
            }
        } catch (error) { /* */ }
        return null;
    }

    // 换聊天时重算；生成开始时按本轮上下文重算（按需块与在场角色服装），代写与静默生成期间清空，结束后恢复。
    function attachChatChangedReinjection() {
        const context = resolveTavernContext();
        const eventSource = context && context.eventSource;
        const eventTypes = (context && (context.event_types || context.eventTypes)) || {};
        if (!eventSource || typeof eventSource.on !== 'function') return;
        const resync = () => {
            if (state.destroyed) return;
            syncSceneAssetsInjectionWithRetry(1);
        };
        const onGenerationStarted = (type) => {
            if (state.destroyed) return;
            syncSceneAssetsInjection(typeof type === 'string' ? type : null);
        };
        const bindings = [
            [eventTypes.CHAT_CHANGED, resync],
            [eventTypes.GENERATION_STARTED, onGenerationStarted],
            [eventTypes.GENERATION_ENDED, resync],
            [eventTypes.GENERATION_STOPPED, resync],
        ].filter(([name]) => name);
        const bound = [];
        for (const [name, handler] of bindings) {
            try {
                eventSource.on(name, handler);
                bound.push([name, handler]);
            } catch (error) { /* */ }
        }
        state.chatChangedCleanup = () => {
            for (const [name, handler] of bound) {
                try {
                    if (typeof eventSource.removeListener === 'function') eventSource.removeListener(name, handler);
                    else if (typeof eventSource.off === 'function') eventSource.off(name, handler);
                } catch (error) { /* */ }
            }
        };
    }

    // 交互摘要：事件变化后 1 秒内合并重注入；生成开始时记下已送出的事件，结束后只清掉这部分；换聊天时全部清空。
    function attachMetaDigestSync() {
        let timer = null;
        const offChange = onMetaDigestChange(() => {
            if (timer != null) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                if (!state.destroyed) syncSceneAssetsInjectionWithRetry(1);
            }, 1000);
        });
        const context = resolveTavernContext();
        const eventSource = context && context.eventSource;
        const eventTypes = (context && (context.event_types || context.eventTypes)) || {};
        const bindings = [
            [eventTypes.GENERATION_STARTED, (type, params, dryRun) => { if (dryRun !== true) beginMetaDigestSend(); }],
            [eventTypes.GENERATION_ENDED, finishMetaDigestSend],
            [eventTypes.CHAT_CHANGED, clearMetaDigest],
        ].filter(([name]) => name);
        if (eventSource && typeof eventSource.on === 'function') {
            for (const [name, handler] of bindings) {
                try { eventSource.on(name, handler); } catch (error) { /* */ }
            }
        }
        state.metaDigestCleanup = () => {
            if (timer != null) clearTimeout(timer);
            offChange();
            if (!eventSource) return;
            for (const [name, handler] of bindings) {
                try {
                    if (typeof eventSource.removeListener === 'function') eventSource.removeListener(name, handler);
                    else if (typeof eventSource.off === 'function') eventSource.off(name, handler);
                } catch (error) { /* */ }
            }
        };
    }

    function detachChatChangedReinjection() {
        if (typeof state.chatChangedCleanup === 'function') {
            state.chatChangedCleanup();
            state.chatChangedCleanup = null;
        }
    }

    function destroy() {
        if (state.destroyed) return { ok: true, reason: 'already-destroyed' };
        state.destroyed = true;
        state.status = 'destroyed';
        let finish;
        destroying = new Promise(resolve => { finish = resolve; });
        const tasks = [];
        const close = callback => {
            try { tasks.push(Promise.resolve(callback())); }
            catch (error) { tasks.push(Promise.reject(error)); }
        };
        close(clearSceneAssetsInjectionTimer);
        close(detachChatChangedReinjection);
        close(() => state.settingsSync?.stop());
        close(() => state.notesFile?.flush());
        close(() => state.metaDigestCleanup?.());
        state.metaDigestCleanup = null;
        close(() => state.statsSettingsOff?.());
        close(() => app.statsRuntime?.destroy());
        close(() => imageTaskRuntime.dispose());
        close(() => promptInjector.clear());
        close(() => storyOutfits?.dispose());
        close(() => illustrationService.stop());
        close(() => assetGenerationService.stop());
        close(() => itemCg.itemImages.stop());
        close(() => itemCg.itemLedger.stop());
        close(offMediaClear);
        close(offRecoveryWake);
        close(() => readerImageService.destroy?.());
        close(() => app.igsUi?.destroy?.());
        close(() => app.magicWandEntry?.destroy?.());
        close(() => app.extensionPanel?.destroy?.());
        close(() => media.destroy());
        close(() => detachPublicApi(globalObject, publicApi));
        close(() => events.emit('igs:destroy', publicApi));
        close(() => events.clear());
        Promise.allSettled(tasks).then(results => {
            const failed = results.find(result => result.status === 'rejected');
            finish(failed ? { ok: false, reason: 'shutdown-failed', error: failed.reason?.message || String(failed.reason) } : { ok: true });
        });
        return { ok: true };
    }

    function shutdown() {
        if (!state.destroyed) destroy();
        return destroying;
    }

    function ensureAlive() {
        if (state.destroyed) {
            throw new Error('IGS instance has been destroyed.');
        }
    }

    async function resolveContextMessage(messageId) {
        if (messageId == null || !hostAdapter || typeof hostAdapter.getMessageById !== 'function') {
            return null;
        }
        return hostAdapter.getMessageById(messageId);
    }

    async function resolveAdjacentMessage(messageId, delta = 1) {
        if (messageId == null || !hostAdapter) return null;
        if (typeof hostAdapter.getAdjacentMessage === 'function') {
            return hostAdapter.getAdjacentMessage(messageId, delta);
        }
        if (typeof hostAdapter.listMessages !== 'function') {
            return null;
        }
        const normalizedId = Number(messageId);
        const messages = await hostAdapter.listMessages();
        const step = Number(delta) < 0 ? -1 : 1;
        const aiTurns = Array.isArray(messages) ? messages.filter(isVisibleAiTurn) : [];
        const currentTurnIndex = aiTurns.findIndex((message) => Number(message && message.id) === normalizedId);
        if (currentTurnIndex >= 0) {
            return aiTurns[currentTurnIndex + step] || null;
        }
        const currentIndex = messages.findIndex((message) => Number(message && message.id) === normalizedId);
        if (currentIndex < 0) return null;
        for (let index = currentIndex + step; index >= 0 && index < messages.length; index += step) {
            if (isVisibleAiTurn(messages[index])) return messages[index];
        }
        return null;
    }

    async function listReaderTurns() {
        if (typeof hostAdapter.listTurns === 'function') return hostAdapter.listTurns();
        if (typeof hostAdapter.listMessages !== 'function') return [];
        const messages = await hostAdapter.listMessages();
        return Array.isArray(messages) ? messages.filter(isVisibleAiTurn) : [];
    }

    function hasAdjacentMessageCapability() {
        return Boolean(
            hostAdapter
            && (
                typeof hostAdapter.getAdjacentMessage === 'function'
                || typeof hostAdapter.listMessages === 'function'
            ),
        );
    }

    function isVisibleAiTurn(message) {
        return Boolean(
            message
            && !isTruthyTurnFlag(message.isUser)
            && !isTruthyTurnFlag(message.isSystem)
            && !isTruthyTurnFlag(message.isHidden),
        );
    }

    function isTruthyTurnFlag(value) {
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    async function jumpToMessage(messageId) {
        if (!hostAdapter || typeof hostAdapter.jumpToMessage !== 'function') {
            return { ok: false, reason: 'missing-jump-api', messageId };
        }
        return hostAdapter.jumpToMessage(messageId);
    }

    function getImageProviders() {
        if (!publicApi || !publicApi.api || !publicApi.api.imageProviders || typeof publicApi.api.imageProviders.list !== 'function') {
            return [];
        }
        return publicApi.api.imageProviders.list();
    }

    function resolvePresetInput(context, contextKey, presetType, fallbackConfig) {
        if (Object.prototype.hasOwnProperty.call(context, contextKey)) {
            return context[contextKey];
        }

        const currentPreset = presetRegistry.getCurrentData(presetType);
        if (currentPreset) return currentPreset;

        return fallbackConfig;
    }
}

export function destroyIGS(globalObject = globalThis.window || globalThis) {
    if (globalObject && globalObject.IGS && typeof globalObject.IGS.destroy === 'function') {
        return globalObject.IGS.destroy();
    }
    return { ok: true, reason: 'not-running' };
}

function getMessageText(message) {
    if (typeof message === 'string') return message;
    if (!message || typeof message !== 'object') return '';
    return message.text || message.message || message.content || message.mes || '';
}

function getStorageLike(globalObject) {
    try {
        return globalObject && globalObject.localStorage ? globalObject.localStorage : null;
    } catch (error) {
        return null;
    }
}

function getViewport(globalObject) {
    const visualViewport = globalObject && globalObject.visualViewport;
    if (visualViewport && Number.isFinite(visualViewport.width) && Number.isFinite(visualViewport.height)) {
        return {
            width: visualViewport.width,
            height: visualViewport.height,
        };
    }

    const width = Number(globalObject && globalObject.innerWidth);
    const height = Number(globalObject && globalObject.innerHeight);
    if (Number.isFinite(width) && Number.isFinite(height)) {
        return { width, height };
    }

    return { width: 0, height: 0 };
}

function mergeInitialConfig(explicitConfig, legacyIgs) {
    const nextConfig = cloneData(explicitConfig || {});
    if (!legacyIgs || legacyIgs.ok === false) return nextConfig;
    return {
        ...cloneData(legacyIgs.bridge || {}),
        ...nextConfig,
    };
}

function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}
