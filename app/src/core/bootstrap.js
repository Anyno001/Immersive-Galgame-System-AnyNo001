import { createPublicApi, attachPublicApi, detachPublicApi } from '../api/public-api.js';
import { createTavernHelperAdapter, getSillyTavernContext } from '../host/tavern-helper-adapter.js';
import { sceneAssetsForContext } from '../scene/asset-scope.js';
import { createPresetRegistry } from '../presets/preset-registry.js';
import { createInputChannel } from '../host/input-channel.js';
import { parseSceneText } from '../scene/text-parser.js';
import { createSceneState } from '../scene/scene-state.js';
import { resolveScene } from '../scene/scene-resolver.js';
import {
    LEGACY_READER_MODES,
    readLegacyIgsSettings,
    writeLegacyIgsSettings,
    resolveLegacyReaderMode,
} from '../storage/legacy-igs.js';
import { createPresetStore } from '../storage/preset-store.js';
import { createLayerController } from '../visual/layer-controller.js';
import { createStageRenderer } from '../visual/stage-renderer.js';
import { resolveVisualMode } from '../visual/visual-mode.js';
import { DEFAULT_SCENE_PROMPT_RULE, LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3, normalizeScenePromptRule } from '../visual/igs-ui/reader-host-constants.js';
import { createIgsReaderHost } from '../visual/igs-ui/reader-host.js';
import { normalizeChatShowSettings, resolveChatShowPromptRule } from '../visual/igs-ui/chat-show-runtime.js';
import { resolveFxPromptRule, resolveItemFxPromptRule, resolveRomanceFxPromptRule, resolveStageCastFxPromptRule } from '../visual/igs-ui/fx-prompt.js';
import { resolveDanmakuPromptRule } from '../visual/igs-ui/danmaku-prompt.js';
import { resolveTextFxPromptRule } from '../visual/igs-ui/text-fx.js';
import { resolveBilingualPromptRule } from '../visual/igs-ui/bilingual-text.js';
import { resolveDailyFxPromptRule } from '../visual/igs-ui/fx-daily-prompt.js';
import { beginMetaDigestSend, clearMetaDigest, finishMetaDigestSend, onMetaDigestChange, resolveMetaDigestRule } from '../visual/igs-ui/meta-digest.js';
import { applyFxWorldview, resolveWorldviewPromptRule } from '../scene/fx-era.js';
import { resolveWorldview } from '../scene/worldview.js';
import { resolveBattleFxPromptRule } from '../visual/igs-ui/fx-battle-model.js';
import { createEventBus } from './event-bus.js';
import { createMagicWandEntry } from '../host/magic-wand-entry.js';
import { createExtensionPanel } from '../host/extension-panel.js';
import { createReaderImageService } from '../generated-images/reader-image-service.js';
import { createPromptInjector } from '../host/prompt-injector.js';
import { createIllustrationMessageHost } from '../host/illustration-message-host.js';
import { createSecondaryLlm } from '../host/secondary-llm.js';
import { createImageBackend, mergeLegacyNaiSettings } from '../generated-images/image-backend.js';
import { createNaiOfficialClient } from '../generated-images/nai-official-client.js';
import { createImageJobLog } from '../generated-images/image-job-log.js';
import { createIndexedDbIllustrationStore } from '../media/illustration-store.js';
import { createAutoIllustrationService, ILLUSTRATION_PROGRESS_EVENT, ILLUSTRATION_UPDATED_EVENT, readCgViewport } from '../generated-images/illustration/auto-illustration-service.js';
import { createAssetGenerationService, GENERATED_ASSET_UPDATED_EVENT } from '../generated-images/illustration/asset-generation-service.js';
import { createItemAndCgServices } from './item-cg-services.js';
import { createIndexedDbGeneratedAssetStore } from '../media/generated-asset-store.js';
import { createAlphaMatte } from '../media/alpha-matte.js';
import { buildCompactGroupsText, buildCompactMoodGroupsText, buildCompactSceneNamesText, buildMoodGroupsText, buildGroupsText, buildSceneGroupsText, MOOD_GROUPS_PLACEHOLDER, SCENE_GROUPS_PLACEHOLDER, TIME_GROUPS_PLACEHOLDER, WEATHER_GROUPS_PLACEHOLDER } from '../scene/mood-groups.js';
import { buildOutfitGroupsText, buildScopedOutfitGroupsText, normalizeCharacterOutfits, OUTFIT_GROUPS_PLACEHOLDER } from '../scene/character-outfits.js';
import { buildTagGrammar, DEPTH0_REMINDER, normalizePromptPlacement } from '../visual/igs-ui/tag-grammar.js';
import { detectPromptTriggers } from '../scene/prompt-triggers.js';
import { collectPromptContext } from '../host/prompt-context.js';

const IGS_VERSION = '0.34.35';
const SCENE_ASSETS_INJECTION_INITIAL_DELAY_MS = 3000;
const SCENE_ASSETS_INJECTION_RETRY_MS = 1500;
const SCENE_ASSETS_INJECTION_MAX_ATTEMPTS = 5;

// 自动插图 / 素材补全的进度与失败原因：始终写控制台，失败与成功再按「显示提示弹窗」弹出。
function createImageJobReporter(globalObject, getBridge, log) {
    return (level, message) => {
        if (log && typeof log.add === 'function') log.add(level, message);
        const logger = level === 'error' ? console.warn : console.info;
        logger('[IGS 生图]', message);
        if (level === 'info') return;
        if ((getBridge() || {}).showToasts === false) return;
        const toastr = globalObject && globalObject.toastr;
        const type = level === 'success' ? 'success' : (level === 'warn' ? 'warning' : 'error');
        if (toastr && typeof toastr[type] === 'function') toastr[type](message, 'IGS 生图');
    };
}

export function bootstrapIGS(options = {}) {
    const globalObject = options.global || globalThis.window || globalThis;
    function sceneAssetsNow(sceneAssets) {
        return sceneAssetsForContext(sceneAssets, getSillyTavernContext(globalObject));
    }
    const events = options.events || createEventBus();
    const hostAdapter = options.hostAdapter || createTavernHelperAdapter(globalObject);
    const storageLike = options.storage || getStorageLike(globalObject);
    const legacyIgs = options.legacyIgsSettings || readLegacyIgsSettings(storageLike);
    const presetStore = options.presetStore || createPresetStore(storageLike);
    const presetRegistry = options.presetRegistry || createPresetRegistry({ store: presetStore });
    const inputChannel = createInputChannel(hostAdapter);
    const layerController = options.layerController || createLayerController(options.layers || {});
    const renderer = options.renderer || createStageRenderer(layerController);
    const readerImageService = options.readerImageService || createReaderImageService({
        global: globalObject,
        hostAdapter,
        imageGenerator: options.imageGenerator || ((request, opts) => imageBackend.generateForReader(request, {
            ...opts,
            unifiedSettings: {
                ...(opts && opts.unifiedSettings),
                bridge: (() => {
                    const bridge = (opts && opts.unifiedSettings && opts.unifiedSettings.bridge) || {};
                    return { ...bridge, autoIllustration: mergeLegacyNaiSettings(bridge.autoIllustration, bridge.imageApi) };
                })(),
            },
        })),
        providers: options.imageProviders,
        fetch: options.fetch,
    });
    const promptInjector = options.promptInjector || createPromptInjector(globalObject);
    const illustrationMessageHost = options.illustrationMessageHost || createIllustrationMessageHost(globalObject);
    const secondaryLlm = options.secondaryLlm || createSecondaryLlm(globalObject, { fetch: options.fetch });
    const naiOfficialClient = options.naiOfficialClient || createNaiOfficialClient({ fetch: options.fetch || (typeof globalObject.fetch === 'function' ? globalObject.fetch.bind(globalObject) : undefined) });
    const readImageBridge = () => {
        const bridge = (getUnifiedSettingsSnapshot() || {}).bridge || {};
        return { ...bridge, autoIllustration: mergeLegacyNaiSettings(bridge.autoIllustration, bridge.imageApi) };
    };
    const imageJobLog = options.imageJobLog || createImageJobLog({
        storage: storageLike,
        getSettings: () => ((getUnifiedSettingsSnapshot() || {}).bridge || {}).imageJobLog,
    });
    const reportImageJob = options.reportImageJob || createImageJobReporter(globalObject, () => (getUnifiedSettingsSnapshot() || {}).bridge || {}, imageJobLog);
    const imageBackend = options.imageBackend || createImageBackend({
        nai: naiOfficialClient,
        getBridge: readImageBridge,
        global: globalObject,
        report: (level, message) => {
            if (imageJobLog && typeof imageJobLog.add === 'function') imageJobLog.add(level, message);
        },
    });
    // CG 库与自动插图共用同一个插图存储实例。
    const illustrationStore = options.illustrationStore || createIndexedDbIllustrationStore(globalObject);
    const illustrationService = options.illustrationService || createAutoIllustrationService({
        messageHost: illustrationMessageHost,
        llm: secondaryLlm,
        nai: imageBackend,
        store: illustrationStore,
        getSettings: () => readImageBridge().autoIllustration,
        getReaderMode: () => {
            const snapshot = getUnifiedSettingsSnapshot() || {};
            return String(snapshot.readerMode || (snapshot.bridge && snapshot.bridge.openMode) || 'pc');
        },
        getViewport: () => readCgViewport(globalObject),
        getSceneAssets: () => sceneAssetsNow(readImageBridge().sceneAssets),
        events,
        random: options.random,
        report: reportImageJob,
    });
    // 物品图与素材补全共用 igs-generated-assets 存储实例。
    const generatedAssetStore = options.generatedAssetStore || createIndexedDbGeneratedAssetStore(globalObject);
    const assetGenerationService = options.assetGenerationService || createAssetGenerationService({
        messageHost: illustrationMessageHost,
        llm: secondaryLlm,
        nai: imageBackend,
        store: generatedAssetStore,
        matte: options.alphaMatte || createAlphaMatte(globalObject),
        getSettings: () => {
            const bridge = readImageBridge();
            return { autoIllustration: bridge.autoIllustration, sceneAssets: sceneAssetsNow(bridge.sceneAssets) };
        },
        getReaderMode: () => {
            const snapshot = getUnifiedSettingsSnapshot() || {};
            return String(snapshot.readerMode || (snapshot.bridge && snapshot.bridge.openMode) || 'pc');
        },
        getViewport: () => readCgViewport(globalObject),
        events,
        report: reportImageJob,
    });
    const itemCg = createItemAndCgServices({
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
        getPresetRegistry,
        getLegacyIgsSettings,
        getUnifiedSettingsSnapshot,
        saveUnifiedSettings,
        destroy,
        igsUi: null,
        magicWandEntry: null,
        extensionPanel: null,
    };
    let publicApi = null;
    let sceneAssetsInjectionTimer = null;
    app.igsUi = options.igsUi || createIgsReaderHost({
        global: globalObject,
        version: app.version,
        random: options.random,
        getIllustrationSource: (messageId) => illustrationMessageHost.readFloor(messageId),
        getIllustrationUrl: (query) => illustrationService.getIllustrationUrl(query),
        illustrations: illustrationService,
        onIllustrationUpdated: (handler) => events.on(ILLUSTRATION_UPDATED_EVENT, handler),
        onIllustrationProgress: (handler) => events.on(ILLUSTRATION_PROGRESS_EVENT, handler),
        generatedAssets: assetGenerationService,
        // 遮罩修复编辑器的 AI 局部重绘：只经 describeEdit/edit 显式调用，不影响普通生成。
        imageEditBackend: imageBackend,
        alphaMatte: options.alphaMatte || createAlphaMatte(globalObject),
        onGeneratedAssetUpdated: (handler) => events.on(GENERATED_ASSET_UPDATED_EVENT, handler),
        itemImages: itemCg.itemImages,
        cgGallery: itemCg.cgGallery,
        onItemImageUpdated: itemCg.onItemImageUpdated,
        requestMoodClassification({ system, user }, llmSettings) {
            return secondaryLlm.request({ system, user }, llmSettings);
        },
        getCurrentChatId: () => (typeof illustrationMessageHost.getChatId === 'function' ? illustrationMessageHost.getChatId() : ''),
        imageJobLog,
        getUnifiedSettings: getUnifiedSettingsSnapshot,
        saveUnifiedSettings,
        typeAndSend,
        setInputText(text) {
            return typeof hostAdapter.setInputText === 'function' ? hostAdapter.setInputText(text) : { ok: false, reason: 'missing-input-api' };
        },
        fillEmptyInputText(text) {
            return typeof hostAdapter.fillEmptyInputText === 'function' ? hostAdapter.fillEmptyInputText(text) : { ok: false, reason: 'missing-readable-input' };
        },
        // 内嵌模式点小铅笔编辑完成 / 取消后，按原模式重新打开最新楼层；publicApi 在阅读器宿主之后创建，延迟取用。
        reopenReader(mode) {
            return publicApi && typeof publicApi.openLatestAvailable === 'function'
                ? publicApi.openLatestAvailable(mode)
                : { ok: false, reason: 'public-api-not-ready' };
        },
        getAdjacentMessage: hasAdjacentMessageCapability() ? resolveAdjacentMessage : null,
        jumpToMessage: jumpToMessage,
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
    readerImageService.registerProviders(publicApi.api.imageProviders);
    attachPublicApi(globalObject, publicApi);
    app.magicWandEntry = options.magicWandEntry || createMagicWandEntry({
        ...(options.magicWandEntryOptions || {}),
        global: globalObject,
        version: app.version,
        label: '沉浸式Galgame系统',
        open: (mode) => publicApi.openLatestAvailable(mode),
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
    state.status = 'ready';
    // 设置就绪后再按保留规则清理一次启动前遗留的旧日志。
    if (imageJobLog && typeof imageJobLog.prune === 'function') imageJobLog.prune();
    illustrationService.start();
    assetGenerationService.start();
    itemCg.itemImages.start();
    scheduleSceneAssetsInjection(SCENE_ASSETS_INJECTION_INITIAL_DELAY_MS, 1);
    attachChatChangedReinjection();
    attachMetaDigestSync();
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

    function getUnifiedSettingsSnapshot(input = {}) {
        // The shallow merge picks one value per key. Clone only the winning graph;
        // cloning the overwritten sceneAssets tree and then cloning it again is costly.
        const bridge = cloneData({
            ...(state.legacyIgs && state.legacyIgs.bridge || {}),
            ...(state.config || {}),
        });
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
            imageApi: cloneData(bridge.imageApi || {}),
            readerSettings: cloneData(resolvedReaderSettings),
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
        const readerSettingsByMode = cloneData(currentLegacy.readerSettingsByMode || {});
        // v0.21.4 起全模式共用一套设置，统一存取 'default' 桶。
        // 历史上保存按 readerMode 分桶、读取却固定读 'default'，导致移动端存了读不回。
        for (const mode of LEGACY_READER_MODES) {
            if (!readerSettingsByMode[mode]) readerSettingsByMode[mode] = {};
        }
        if (payload.readerSettings && typeof payload.readerSettings === 'object') {
            readerSettingsByMode['default'] = cloneData(payload.readerSettings);
        }
        const nextLegacy = {
            ok: true,
            bridge: nextBridge,
            displayMode,
            readerMode,
            readerSettings: cloneData(readerSettingsByMode['default'] || {}),
            readerSettingsByMode,
        };
        const writeResult = storageLike
            ? writeLegacyIgsSettings(storageLike, nextLegacy)
            : { ok: true, legacy: nextLegacy, persisted: false };
        if (writeResult.ok === false) return writeResult;
        state.legacyIgs = cloneData(writeResult.legacy);
        state.config = cloneData({
            ...(state.config || {}),
            ...nextBridge,
        });
        events.emit('igs:legacy-settings-updated', cloneData(state.legacyIgs));
        // 用户改了日志保留天数 / 条数后立即按新规则清理。
        if (imageJobLog && typeof imageJobLog.prune === 'function') imageJobLog.prune();
        syncSceneAssetsInjectionWithRetry(1);
        return {
            ok: true,
            legacy: cloneData(state.legacyIgs),
            unified: getUnifiedSettingsSnapshot({ mode: readerMode }),
        };
    }

    function syncSceneAssetsInjection(generationType = null) {
        const unified = getUnifiedSettingsSnapshot();
        const sceneAssets = sceneAssetsNow(unified.bridge && unified.bridge.sceneAssets);
        // 世界观：与之冲突的演出开关在这里拨成关，AI 不会收到它们的语法说明；时代规则按世界观追加（现代为空）。
        const worldview = resolveWorldview(sceneAssets);
        const ancient = worldview === 'ancient';
        const eraRule = resolveWorldviewPromptRule(worldview);
        const readerSettings = applyFxWorldview(unified.readerSettings, worldview);
        const placement = normalizePromptPlacement(sceneAssets && sceneAssets.promptPlacement);
        // 交互摘要：只在有待送出的事件时注入，生成结束后清空（见 attachMetaDigestSync）。
        const metaDigestRule = resolveMetaDigestRule(readerSettings && readerSettings.metaFx);
        if (sceneAssets && sceneAssets.promptAdaptive === false) {
            return injectLegacyPromptRules(sceneAssets, readerSettings, { ancient, eraRule, placement, metaDigestRule });
        }
        if (generationType === 'impersonate' || generationType === 'quiet') {
            promptInjector.clear();
            return { ok: true, reason: 'generation-type-skipped' };
        }
        const promptContext = collectPromptContext(resolveTavernContext(), { document: globalObject.document });
        const sceneOn = Boolean(sceneAssets && sceneAssets.enabled && sceneAssets.promptRule);
        const grammar = buildTagGrammar({
            readerSettings,
            sceneRule: sceneOn ? resolvePromptRuleContent(sceneAssets, { compact: true, presentText: promptContext.presentText }) : '',
            ancient,
            expand: detectPromptTriggers(promptContext),
            tailRules: eraRule ? [eraRule] : [],
            dynamicRules: metaDigestRule ? [metaDigestRule] : [],
            moodWord: firstMoodWord(sceneAssets),
        });
        if (!grammar.system) {
            promptInjector.clear();
            return { ok: true, reason: 'scene-assets-disabled' };
        }
        const depth0Content = [placement === 'system' ? DEPTH0_REMINDER : '', grammar.depth0].filter(Boolean).join('\n\n');
        return promptInjector.inject(grammar.system, { placement, depth0Content });
    }

    // 关闭按需注入时的旧行为：各块完整拼接；未自定义的场景规则用改版前的长版原文。
    function injectLegacyPromptRules(sceneAssets, readerSettings, { ancient, eraRule, placement, metaDigestRule }) {
        const rules = [];
        if (sceneAssets && sceneAssets.enabled && sceneAssets.promptRule) {
            const promptRule = sceneAssets.promptRule === DEFAULT_SCENE_PROMPT_RULE ? LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3 : sceneAssets.promptRule;
            rules.push(resolvePromptRuleContent({ ...sceneAssets, promptRule }));
        }
        const chatShow = readerSettings && readerSettings.chatShow;
        if (normalizeChatShowSettings(chatShow).enabled) rules.push(resolveChatShowPromptRule(chatShow, { ancient }));
        const fxRule = resolveFxPromptRule(readerSettings && readerSettings.fxTags, { ancient });
        if (fxRule) rules.push(fxRule);
        const itemFxRule = resolveItemFxPromptRule(Boolean(readerSettings && readerSettings.itemFx && readerSettings.itemFx.enabled));
        if (itemFxRule) rules.push(itemFxRule);
        const textFxRule = resolveTextFxPromptRule(Boolean(readerSettings && readerSettings.textFx && readerSettings.textFx.enabled));
        if (textFxRule) rules.push(textFxRule);
        const bilingualRule = resolveBilingualPromptRule(readerSettings && readerSettings.bilingual);
        if (bilingualRule) rules.push(bilingualRule);
        const dailyFxRule = resolveDailyFxPromptRule(readerSettings && readerSettings.dailyFx);
        if (dailyFxRule) rules.push(dailyFxRule);
        const battleFxRule = resolveBattleFxPromptRule(Boolean(readerSettings && readerSettings.battleFx && readerSettings.battleFx.enabled));
        if (battleFxRule) rules.push(battleFxRule);
        const romanceFxRule = resolveRomanceFxPromptRule(readerSettings && readerSettings.romanceFx);
        if (romanceFxRule) rules.push(romanceFxRule);
        const stageCastFxRule = resolveStageCastFxPromptRule(readerSettings && readerSettings.stageCast);
        if (stageCastFxRule) rules.push(stageCastFxRule);
        const danmakuRule = resolveDanmakuPromptRule(readerSettings);
        if (danmakuRule) rules.push(danmakuRule);
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

    function firstMoodWord(sceneAssets) {
        const groups = sceneAssets && Array.isArray(sceneAssets.moodGroups) ? sceneAssets.moodGroups : [];
        const group = groups.find((g) => g && Array.isArray(g.words) && g.words.some(Boolean));
        return group ? String(group.words.find(Boolean)) : '';
    }

    function moodSlotWords(sceneAssets) {
        const words = new Set();
        for (const moods of Object.values((sceneAssets && sceneAssets.characters) || {})) {
            if (moods && typeof moods === 'object') for (const word of Object.keys(moods)) words.add(word);
        }
        return words;
    }

    function resolvePromptRuleContent(sceneAssets, { compact = false, presentText = null } = {}) {
        let rule = String(sceneAssets.promptRule || '');
        if (rule.includes(MOOD_GROUPS_PLACEHOLDER)) {
            const moods = compact ? buildCompactMoodGroupsText(sceneAssets.moodGroups, moodSlotWords(sceneAssets)) : buildMoodGroupsText(sceneAssets.moodGroups);
            rule = rule.split(MOOD_GROUPS_PLACEHOLDER).join(moods);
        }
        if (rule.includes(SCENE_GROUPS_PLACEHOLDER)) {
            rule = rule.split(SCENE_GROUPS_PLACEHOLDER).join(compact ? buildCompactSceneNamesText(sceneAssets.scenes) : buildSceneGroupsText(sceneAssets.scenes));
        }
        if (rule.includes(TIME_GROUPS_PLACEHOLDER)) {
            rule = rule.split(TIME_GROUPS_PLACEHOLDER).join(compact ? buildCompactGroupsText(sceneAssets.timeGroups) : buildGroupsText(sceneAssets.timeGroups));
        }
        if (rule.includes(WEATHER_GROUPS_PLACEHOLDER)) {
            rule = rule.split(WEATHER_GROUPS_PLACEHOLDER).join(compact ? buildCompactGroupsText(sceneAssets.weatherGroups) : buildGroupsText(sceneAssets.weatherGroups));
        }
        if (rule.includes(OUTFIT_GROUPS_PLACEHOLDER)) {
            const outfits = normalizeCharacterOutfits(sceneAssets.characterOutfits);
            rule = rule.split(OUTFIT_GROUPS_PLACEHOLDER).join(compact
                ? buildScopedOutfitGroupsText(outfits, { presentText, characterAliases: sceneAssets.characterAliases })
                : buildOutfitGroupsText(outfits));
        }
        return compact ? rule.replace(/\n{2,}/g, '\n').trim() : rule;
    }

    function syncSceneAssetsInjectionWithRetry(attempt) {
        const result = syncSceneAssetsInjection();
        if (shouldRetrySceneAssetsInjection(result, attempt)) {
            scheduleSceneAssetsInjection(SCENE_ASSETS_INJECTION_RETRY_MS, attempt + 1);
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
        if (attempt >= SCENE_ASSETS_INJECTION_MAX_ATTEMPTS) return false;
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
        clearSceneAssetsInjectionTimer();
        detachChatChangedReinjection();
        if (typeof state.metaDigestCleanup === 'function') state.metaDigestCleanup();
        state.metaDigestCleanup = null;
        promptInjector.clear();
        illustrationService.stop();
        assetGenerationService.stop();
        itemCg.itemImages.stop();
        if (app.igsUi && typeof app.igsUi.destroy === 'function') {
            app.igsUi.destroy();
        }
        if (app.magicWandEntry && typeof app.magicWandEntry.destroy === 'function') {
            app.magicWandEntry.destroy();
        }
        if (app.extensionPanel && typeof app.extensionPanel.destroy === 'function') {
            app.extensionPanel.destroy();
        }
        detachPublicApi(globalObject, publicApi);
        events.emit('igs:destroy', publicApi);
        events.clear();
        return { ok: true };
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
