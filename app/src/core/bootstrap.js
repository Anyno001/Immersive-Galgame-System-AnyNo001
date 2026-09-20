import { createPublicApi, attachPublicApi, detachPublicApi } from '../api/public-api.js';
import { createTavernHelperAdapter } from '../host/tavern-helper-adapter.js';
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
import { normalizeScenePromptRule } from '../visual/igs-ui/reader-host-constants.js';
import { createIgsReaderHost } from '../visual/igs-ui/reader-host.js';
import { createEventBus } from './event-bus.js';
import { createMagicWandEntry } from '../host/magic-wand-entry.js';
import { createExtensionPanel } from '../host/extension-panel.js';
import { createReaderImageService } from '../generated-images/reader-image-service.js';
import { createPromptInjector } from '../host/prompt-injector.js';
import { buildMoodGroupsText, buildGroupsText, buildSceneGroupsText, MOOD_GROUPS_PLACEHOLDER, SCENE_GROUPS_PLACEHOLDER, TIME_GROUPS_PLACEHOLDER, WEATHER_GROUPS_PLACEHOLDER } from '../scene/mood-groups.js';

const IGS_VERSION = '0.23.86';
const SCENE_ASSETS_INJECTION_INITIAL_DELAY_MS = 3000;
const SCENE_ASSETS_INJECTION_RETRY_MS = 1500;
const SCENE_ASSETS_INJECTION_MAX_ATTEMPTS = 5;

export function bootstrapIGS(options = {}) {
    const globalObject = options.global || globalThis.window || globalThis;
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
        imageGenerator: options.imageGenerator,
        providers: options.imageProviders,
        fetch: options.fetch,
    });
    const promptInjector = options.promptInjector || createPromptInjector(globalObject);
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
        hostAdapter,
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
        getUnifiedSettings: getUnifiedSettingsSnapshot,
        saveUnifiedSettings,
        typeAndSend,
        setInputText(text) {
            return typeof hostAdapter.setInputText === 'function' ? hostAdapter.setInputText(text) : { ok: false, reason: 'missing-input-api' };
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
    scheduleSceneAssetsInjection(SCENE_ASSETS_INJECTION_INITIAL_DELAY_MS, 1);
    attachChatChangedReinjection();
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
        const bridge = {
            ...cloneData(state.legacyIgs && state.legacyIgs.bridge || {}),
            ...cloneData(state.config || {}),
        };
        if (bridge.sceneAssets && typeof bridge.sceneAssets === 'object' && !Array.isArray(bridge.sceneAssets)) {
            bridge.sceneAssets = {
                ...cloneData(bridge.sceneAssets),
                promptRule: normalizeScenePromptRule(bridge.sceneAssets.promptRule),
            };
        }
        const readerMode = resolveLegacyReaderMode(
            input && typeof input === 'object' ? input.mode : input,
            state.legacyIgs && state.legacyIgs.displayMode,
            bridge,
        );
        const readerSettingsByMode = cloneData(state.legacyIgs && state.legacyIgs.readerSettingsByMode || {});
        // 优先 default 桶；老用户 default 为空时回退到旧的 pc/mobile 分桶或顶层 readerSettings。
        const hasKeys = (obj) => obj && typeof obj === 'object' && Object.keys(obj).length > 0;
        const resolvedReaderSettings = hasKeys(readerSettingsByMode['default']) ? readerSettingsByMode['default']
            : hasKeys(readerSettingsByMode['pc']) ? readerSettingsByMode['pc']
            : hasKeys(readerSettingsByMode['mobile']) ? readerSettingsByMode['mobile']
            : state.legacyIgs.readerSettings || {};
        return {
            version: app.version,
            bridge,
            imageApi: cloneData(bridge.imageApi || {}),
            readerSettings: cloneData(resolvedReaderSettings),
        };
    }

    function saveUnifiedSettings(payload = {}) {
        const currentLegacy = state.legacyIgs || readLegacyIgsSettings(storageLike);
        const nextBridge = {
            ...cloneData(currentLegacy.bridge || {}),
            ...cloneData(state.config || {}),
            ...cloneData(payload.bridge || {}),
        };
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
        state.config = {
            ...cloneData(state.config || {}),
            ...cloneData(nextBridge),
        };
        events.emit('igs:legacy-settings-updated', cloneData(state.legacyIgs));
        syncSceneAssetsInjectionWithRetry(1);
        return {
            ok: true,
            legacy: cloneData(state.legacyIgs),
            unified: getUnifiedSettingsSnapshot({ mode: readerMode }),
        };
    }

    function syncSceneAssetsInjection() {
        const unified = getUnifiedSettingsSnapshot();
        const sceneAssets = unified.bridge && unified.bridge.sceneAssets;
        if (sceneAssets && sceneAssets.enabled && sceneAssets.promptRule) {
            return promptInjector.inject(resolvePromptRuleContent(sceneAssets));
        }
        promptInjector.clear();
        return { ok: true, reason: 'scene-assets-disabled' };
    }

    function resolvePromptRuleContent(sceneAssets) {
        let rule = String(sceneAssets.promptRule || '');
        if (rule.includes(MOOD_GROUPS_PLACEHOLDER)) {
            rule = rule.split(MOOD_GROUPS_PLACEHOLDER).join(buildMoodGroupsText(sceneAssets.moodGroups));
        }
        if (rule.includes(SCENE_GROUPS_PLACEHOLDER)) {
            rule = rule.split(SCENE_GROUPS_PLACEHOLDER).join(buildSceneGroupsText(sceneAssets.scenes));
        }
        if (rule.includes(TIME_GROUPS_PLACEHOLDER)) {
            rule = rule.split(TIME_GROUPS_PLACEHOLDER).join(buildGroupsText(sceneAssets.timeGroups));
        }
        if (rule.includes(WEATHER_GROUPS_PLACEHOLDER)) {
            rule = rule.split(WEATHER_GROUPS_PLACEHOLDER).join(buildGroupsText(sceneAssets.weatherGroups));
        }
        return rule;
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

    function attachChatChangedReinjection() {
        const context = resolveTavernContext();
        const eventSource = context && context.eventSource;
        const eventTypes = context && (context.event_types || context.eventTypes);
        const eventName = eventTypes && eventTypes.CHAT_CHANGED;
        if (!eventSource || !eventName || typeof eventSource.on !== 'function') return;
        const handler = () => {
            if (state.destroyed) return;
            syncSceneAssetsInjectionWithRetry(1);
        };
        try {
            eventSource.on(eventName, handler);
        } catch (error) { return; }
        state.chatChangedCleanup = () => {
            try {
                if (typeof eventSource.removeListener === 'function') eventSource.removeListener(eventName, handler);
                else if (typeof eventSource.off === 'function') eventSource.off(eventName, handler);
            } catch (error) { /* */ }
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
        promptInjector.clear();
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
