import {
    buildIgsTextPayload,
    getMessagePrimaryText,
    getVisibleMessageTextFromElement,
    normalizeSourceFilter,
    normalizeVirtualRegex,
} from '../../scene/message-source.js';
import { createSettingsHost } from './settings-host.js';
import { normalizeBridgeConfig, normalizeReaderSettings } from './settings-host-normalize.js';
import { extractSceneDirectives, resolveSceneStateAtIndex, resolveSceneAtSourceOffset, resolveIllustrationForPage, resolveHeldSourceOffsets, locateNarrativeOffset, stripIllustrationMarkers } from '../../scene/scene-directives.js';
import { classifySceneKey, resolveCharacterKey } from '../../scene/scene-directives.js';
import { recordOutfitReview, dropConfirmedOutfitReview } from '../../scene/outfit-review-store.js';
import { draftAssetLibrary, ensureCardLibrary, relocateLegacyCard, rememberAssetScope, resolveAssetScope, sceneAssetsForContext } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';

import { isMarkerDirectiveLine, stripMarkerDirectives } from '../../scene/directive-tags.js';
import { extractFxDirectives, resolveFxAtPage } from '../../scene/fx-directives.js';
import { readStoryNow, resolveDuePromises } from '../../scene/promise-reminder.js';
import { parseTables } from '../../shujuku-panel/panel-model.js';
import { applyDiceToHits } from '../../scene/battle-context.js';
import { normalizeItemImageSettings } from '../../generated-images/illustration/item-image-settings.js';
import { createCgGalleryPanel } from './cg-gallery-panel.js';
import { createReadingProgress, resolvePositionFloor, resolvePositionPage, segmentText, textHash, textHead, READING_METADATA_KEY } from './reading-progress.js';
import { createTurnIndexPanel, positionLabel } from './turn-index-panel.js';
import { createGenerationStrip } from './generation-strip.js';
import { cancelFxEffects } from './fx-runtime.js';
import { cancelDanmaku } from './danmaku-runtime.js';
import { cancelStageDirection } from './stage-direction-runtime.js';
import { cancelSceneGrade } from './scene-grade.js';
import { closeRomanceFx } from './romance-runtime.js';
import { closeMetaFx } from './meta-runtime.js';
import { normalizeRomanceFxSettings, resolveNsfwSpan } from './romance-settings.js';
import { mergeItemEvents, normalizeItemFxSettings } from './fx-item-model.js';
import { applyEatToItems } from './fx-eat-model.js';
import { normalizeDailyFxSettings } from './fx-daily-model.js';
import { normalizeItemName } from '../../data/shujuku/item-catalog.js';
import { cancelDailyFx } from './fx-daily.js';
import { cancelSceneAudio, skipBgmTrack } from './scene-audio.js';
import { applyBgmNoteToDom, toggleBgmNote } from './bgm-note.js';
import { parkAudioBus, unparkAudioBus } from './audio-bus.js';
import { isStagePaused, watchStagePause } from './stage-pause.js';
import { createReaderAutoPlay } from './reader-auto-play.js';
import { isTtsSpeaking, replayTts, setTtsErrorHandler, stopTts } from './tts.js';
import { playUiSfx } from './ui-sfx.js';
import { findLastDreadLevel } from '../../scene/horror.js';
import { parseHtmlCardMarker } from '../../scene/html-cards.js';
import { resolveBackgroundAsset, resolveSpriteAsset, resolveNudeSpriteAsset, isGeneratedAssetUrl, bindGeneratedBackground, bindGeneratedSprite, isNonSpriteSpeaker } from '../../scene/asset-match.js';
import { STAGE_CAST_MAX_SEATS, STAGE_CAST_SCAN_LIMIT, pickCastMembers, resolveCastOffset, resolveStageCast } from '../../scene/stage-cast.js';
import { normalizeStageCastSettings } from './stage-direction-settings.js';
import { resolveRomanceRivalTarget } from './romance-settings.js';
import { clearCastDom } from './stage-cast-render.js';
import { resolveCharacterDna } from '../../scene/character-dna.js';
import { createOutfitResolver, resolveSpriteOutfit } from '../../scene/character-outfits.js';
import { collectOutfitClues } from '../../data/shujuku/outfit-clues.js';
import { isStrictBackgroundMatch } from '../../generated-images/illustration/auto-illustration-settings.js';
import { clearCurrentCg } from '../../generated-images/illustration/clear-current-cg.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { normalizeMoodGroups, resolveMoodGroup } from '../../scene/mood-groups.js';
import { normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';
import {
    getOriginalReaderHtml,
    getOriginalReaderSource,
    getOriginalReaderStyleText,
    ORIGINAL_READER_REQUIRED_SELECTORS,
    ORIGINAL_READER_STYLE_CONTRACT,
} from './original-reader-source.js';
import {
    getImageSubTabTemplate,
    getReaderSubTabTemplate,
    getSettingsTabTemplate,
    normalizeImageSubTab,
    normalizeSceneSubTab,
    normalizeReaderSubTab,
    IMAGE_SUBTAB_DEFS,
    SCENE_RULES_TEMPLATE,
    SCENE_SUBTAB_DEFS,
    READER_SUBTAB_DEFS,
    SETTINGS_TAB_DEFS,
} from './settings-tabs.js';
import { normalizeSettingsTheme } from './settings-theme.js';
import {
    DEFAULT_IMAGE_API,
    DIALOG_FONT_OPTIONS,
    DEFAULT_PINNED_TOOLBAR_BUTTONS,
    DEFAULT_SCENE_PROMPT_RULE,
    normalizeScenePromptRule,
    PROMPT_RULE_OUTFIT_HINT,
    scenePromptRuleOutfitHint,
    READER_SETTINGS_SCHEMA_VERSION,
    SETTINGS_PANEL_REQUIRED_SELECTORS,
    SETTINGS_PANEL_TAB_CONTRACT,
    TOOLBAR_ACTIONS,
    VN_THEME_PRESETS,
} from './reader-host-constants.js';
import { isEmbeddedReaderMode } from '../../schemas/reader-mode.js';
import {
    cloneData,
    esc,
    firstDefined,
    firstNonEmptyString,
    firstRenderableText,
    clampNumber,
    normalizeBoolean,
    normalizeFiniteIndex,
    normalizeFiniteNumber,
    normalizeNullableNumber,
    normalizeOpacity,
    toHex,
} from './reader-value-utils.js';
import {
    checkbox,
    colorInput,
    field,
    renderCharacterAssetList,
    renderMoodGroupList,
    renderMoodReviewList,
    renderPinnedButtons,
    renderSceneAssetList,
    renderGeneratedAssetPane,
    countGeneratedWaiting,
    renderStageShakeSettings,
    renderChatShowSettings,
    renderSystemRoleSettings,
    renderWeatherFxSettings,
    renderTemplate,
    rangeInput,
    secretInput,
    segmentedInput,
    selectInput,
    textInput,
    textareaInput,
    numberInput,
    disabledAttr,
    hiddenAttr,
    modelPicker,
    tableMultiSelect,
} from './settings-fields.js';
import { renderAssetReviewPanel } from './asset-review-panel.js';
import {
    ensureEmbeddedHost,
    findEmbeddedHost,
    hideEmbeddedSourceText,
    hideStorySpan,
    isEmbeddedEditTrigger,
    isStoryHidden,
    resolveEmbeddedHostParent,
    restoreEmbeddedSourceText,
    restoreStorySpan,
    storyLines,
} from './embedded-reader-runtime.js';
import { buildReaderSourceSignature, createReaderSourceCache } from './reader-source-cache.js';
import { createImageResourceCache } from '../../media/resource-cache.js';
import { collectFloorAssetUrls } from './floor-asset-prefetch.js';
import { createChatStreamObserver } from '../../host/chat-stream-observer.js';
import { findAcuDice, formatCheckMessage, resolveDiceCommand } from '../../choices/dice-check.js';
import { buildResultFxPlan, normalizeResultFxSettings, resultDetailOf } from './fx-result-model.js';
import { cancelResultFx, playResultFx } from './fx-result.js';
import { pickFxAccent } from './fx-symbols.js';
import { prefersReducedMotion } from './reduced-motion.js';
import {
    applyImageCountOverride,
    buildImageActionContext,
    buildProgressText,
    countBoundImageSlots,
    normalizePollAttempts,
    normalizePollInterval,
    normalizeSnapshotImageState,
    resolveSegmentImageIndex,
    shouldPollReaderImages,
    waitForReaderImagePoll,
} from './reader-image-state.js';
import {
    attachSettingsViewportEvents,
    clearChildren,
    detachSettingsViewportEvents,
    ensureImageLoadingSpinner,
    ensureStyleTag,
    getOwnerWindow,
    getRootDocument,
    removeImageLoadingSpinner,
    syncSettingsViewportVars,
    unmountNode,
} from './reader-dom-utils.js';
import {
    buildTextSegments,
    getPath,
    normalizeBtnOrder,
    normalizeHiddenButtons,
    normalizePerformanceSettings,
    normalizePinnedButtons,
    normalizeReaderMode,
    normalizeSettingsTab,
    normalizeSettingsValue,
    normalizeSpriteDefaultScale,
    normalizeSpriteDisplayScale,
    normalizeSpriteGenderScale,
    normalizeSpriteLayouts,
    setPath,
} from './settings-normalize.js';
import { clearReaderModeRuntime, exitDocumentFullscreen } from './reader-runtime.js';
import { enterSpriteEditMode } from './sprite-edit.js';
import { enterCgPortraitEdit } from './cg-portrait.js';
import { enterCastSlotEdit } from './cast-slot-edit.js';
import { createDbPanelController } from '../../shujuku-panel/panel-controller.js';
import { createMapPanelController } from './map-panel.js';
import { createRecordPanelController } from './record-panel.js';
import { createShujukuClient } from '../../data/shujuku/client.js';
import { buildStatusHudModel, normalizeStatusHudSettings, resolveStatusAvatar } from '../../data/shujuku/status-hud-model.js';
import { readOptionItems } from '../../choices/option-table.js';
import { createIgsModal } from './igs-modal.js';
import { createOnboardingController } from './onboarding-guide-controller.js';
import { applyPerformanceProfile, applyProfileDetails } from './performance-profile.js';
import { applyFxWorldview } from '../../scene/fx-era.js';
import { applyWorldview, resolveWorldview } from '../../scene/worldview.js';
import { effectiveDialogSkin } from './worldview-skins.js';
import {
    applyTitleSkin,
    buildTitleScreenModel,
    createTitleGate,
    playOpeningCard,
    playTitleBgm,
    reduceTitleAction,
    removeTitleScreen,
    renderTitleScreen,
    shouldGateTitleScreen,
    titleCardOf,
} from './title-screen.js';
import { loadMoodReview, recordMoodReview, removeMoodReview } from '../../scene/mood-review-store.js';
import { applyMoodAssignments, buildMoodClassificationRequest, parseMoodClassification, resolveSecondaryLlm } from '../../scene/mood-classify.js';
import {
    CLASSIC_DIALOG_HEIGHT,
    CLASSIC_DIALOG_WIDTH_PERCENT_DEFAULT,
    CLASSIC_DIALOG_THEME_DEFAULTS,
    DIALOG_SKIN_ADVENTURE_JOURNEY,
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_DAY_MINIMAL,
    DIALOG_SKIN_ELEGANT_EUROPEAN,
    DIALOG_SKIN_GRADIENT_VEIL,
    DIALOG_SKIN_PLANT_COFFEE,
    DIALOG_SKIN_RETRO_JAPANESE,
    DIALOG_SKIN_WARM_PICTUREBOOK,
    DIALOG_SKIN_WESTERN_CLASSIC,
    isIllustratedDialogSkin,
    normalizeClassicDialogWidthPercent,
    normalizeDialogSkin,
} from './classic-dialog-skin.js';
import {
    TYPEWRITER_DEFAULTS,
    cancelTypewriter,
    normalizeTypewriterSettings,
} from './typewriter-runtime.js';
import { cancelStageShakeEffect } from './stage-shake-runtime.js';
import { advanceChatReveal, cancelChatShow, getChatRevealState } from './chat-layer.js';
import { buildChatPageModel, normalizeChatShowSettings } from './chat-show-runtime.js';
import { resolveChatTheme } from './chat-themes.js';
import { isSystemRole, normalizeSystemRoleSettings } from './system-role.js';
import { formatChatBlockAsText, parseChatMarker } from '../../scene/chat-blocks.js';
import { comicContentKey, isComicModeActive } from './comic-settings.js';
import { nextBilingualDisplay, normalizeBilingualSettings, resolveBilingualDisplay, stripBilingualTranslation } from './bilingual-text.js';

import {
    applyReaderSnapshotToDom,
    applyToolbarState,
    buildFallbackReaderOverlay,
    buildFallbackSettingsOverlay,
    normalizeReaderStableLayers,
    pinEmbeddedHostFrame,
} from './reader-dom-render.js';

export function createIgsReaderHost(options = {}) {
    let statusHudClient = null;
    let statusHudCallback = null;
    const state = {
        activeReader: null,
        activeSettings: null,
        // T 键临时切换的双语显示方式 { base, value }：只在本次会话内有效，不写入设置；设置里改了显示方式即失效。
        bilingualDisplay: null,
    };
    // 阅读中朗读出错（接口挂了、Key 错、浏览器拦自动朗读）在阅读器里提示，同一条 30 秒内只弹一次。
    setTtsErrorHandler((message) => applyToastToReader(state.activeReader, true, message, null, 4000));
    // 阅读器里的确认和提示挂在遮罩上。浏览器 alert/confirm 会把全屏模式退出去。
    const pageModal = createIgsModal({
        getHost: () => {
            const overlay = state.activeReader && state.activeReader.dom && state.activeReader.dom.overlay;
            if (overlay) return overlay;
            const doc = (options.global || globalThis).document;
            return doc && (doc.body || doc.documentElement);
        },
        getTheme: () => readSettingsTheme(),
        global: options.global || globalThis,
    });
    // 目录、提示弹窗、续读弹窗跟设置器同一个配色。
    function readSettingsTheme() {
        try { return resolveRenderConfig(state.activeReader ? state.activeReader.mode : 'default').bridge.settingsTheme || ''; } catch (_) { return ''; }
    }
    // 阅读进度：上次位置 / 最远 / 已读 / 存档位，按聊天存本机；真正关闭阅读器或存档时同步进聊天元数据。
    const readingProgress = createReadingProgress({
        getChatId: () => (typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : ''),
        storage: () => (options.global || globalThis).localStorage,
    });
    const progressRuntime = { navigating: false, offered: new Set(), pulled: new Set(), pushed: new Map(), newFloorToastAt: 0 };
    const PROGRESS_NAV_ACTIONS = new Set(['prev', 'next', 'first-page', 'last-page', 'prev-turn', 'next-turn', 'resume-reading', 'turn-first', 'turn-latest', 'skip-read', 'quick-load']);
    let turnIndexPanel = null;
    let generationStripRemount = false;
    // 对话框顶边的生成细线：手动 / 自动出图共用，代替原来常驻的「生图中」提示。
    const generationStrip = createGenerationStrip({
        timers: options.autoPlayTimers || globalThis,
        getDialog: () => (state.activeReader && state.activeReader.dom && state.activeReader.dom.dialog) || null,
    });
    // 新手引导：会话标记与当前步骤挂在宿主实例上，状态只存独立的 localStorage 键。
    const onboarding = createOnboardingController({
        getStorage: () => { try { return (options.global || globalThis).localStorage || null; } catch (_) { return null; } },
        openSettings: (tab) => openSettings({ tab, mode: state.activeReader ? state.activeReader.mode : undefined }),
        getSettingsController: () => (state.activeSettings ? state.activeSettings.controller : null),
        rerenderSettings: () => rerenderSettings(),
        getDocument: () => getRootDocument(options.global),
        applyPerformanceProfile: (answers) => {
            if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
            const draft = state.activeSettings.draft;
            draft.readerSettings = draft.readerSettings || {};
            applyPerformanceProfile(draft.readerSettings, answers);
            applyProfileDetails(draft.readerSettings, answers);
            return { ok: true };
        },
    });

    const sourceCache = createReaderSourceCache({
        parse: (input) => buildIgsTextPayload(input.liveMessage, input.parseOptions),
    });
    const imageResourceCache = createImageResourceCache(options.global || globalThis, { limit: 96 });
    let moodAutoTimer = 0;
    let moodAutoRunning = false;
    let moodAutoAgain = false;
    let moodAutoDisposed = false;
    let moodAutoFloorSent = '';
    let moodAutoFloorWaiting = '';
    let embeddedStoryObserver = null;
    let embeddedStoryTimer = null;
    const streamObserver = createChatStreamObserver({
        global: options.global || globalThis,
        getDocument: () => resolveEmbeddedDocument(state.activeReader),
        onActivity: () => handleChatStreamActivity(),
        onStable: () => handleChatStreamStable(),
        // 硬超时无条件收起等待。全屏在新楼写完之前会让 onStable 返回 false，继续等。
        onTimeout: () => {
            exitEmbeddedLoading();
        },
    });
    // 物品图到达后重绘阅读器：演出占位与背包格位据此替换为生图。
    const offItemImageUpdatedRaw = typeof options.onItemImageUpdated === 'function'
        ? options.onItemImageUpdated(() => { if (state.activeReader) rerenderActiveReader(); })
        : null;
    const offItemImageUpdated = typeof offItemImageUpdatedRaw === 'function' ? offItemImageUpdatedRaw : () => {};
    // 下面几项被 return host 之后的函数引用，必须声明在 return 之前，否则压缩时会被当作死代码删掉。
    const itemEventsShown = new Set();
    const ROMANCE_MEMORY_KEYS = 'igs-romance-memory-keys';
    const ROMANCE_MEMORY_KEYS_LIMIT = 300;
    // 生图从 IndexedDB 一张张异步补回，每张都会发 image-loaded。按窗口合并成一次重绘，
    // 否则 N 张图触发 N 次整页重绘、每次又带上已到的全部 dataUrl，开销随张数平方增长。
    const IMAGE_REFRESH_BATCH_MS = 120;
    let imageRefreshTimer = 0;
    let floorAssetPlan = { key: '', urls: [] };
    let readerImageRefreshPending = false;
    let settingsImageRefreshPending = false;
    // 设置面板全屏盖住阅读器时不重绘后面的舞台，记一笔，关面板时补一次。
    let readerStaleBehindSettings = false;
    function flushDeferredImageRefresh() {
        if (settingsImageRefreshPending && !imageRefreshTimer) scheduleImageRefresh();
    }
    function scheduleImageRefresh({ reader = false, settings = false } = {}) {
        if (reader) readerImageRefreshPending = true;
        if (settings) settingsImageRefreshPending = true;
        if (imageRefreshTimer) return;
        const g = options.global || globalThis;
        const schedule = typeof g.setTimeout === 'function' ? g.setTimeout.bind(g) : setTimeout;
        imageRefreshTimer = schedule(() => {
            imageRefreshTimer = 0;
            const doReader = readerImageRefreshPending;
            const doSettings = settingsImageRefreshPending;
            readerImageRefreshPending = false;
            settingsImageRefreshPending = false;
            if (doReader && state.activeReader) {
                if (state.activeSettings) readerStaleBehindSettings = true;
                else rerenderActiveReader();
            }
            if (doSettings && state.activeSettings && state.activeSettings.tab === 'scene') {
                // 交互中先搁着，松手或菜单收起时由 flushDeferredImageRefresh 补刷。
                if (settingsInteracting()) settingsImageRefreshPending = true;
                else rerenderSettings();
            }
        }, IMAGE_REFRESH_BATCH_MS);
    }
    const offGeneratedAssetUpdated = typeof options.onGeneratedAssetUpdated === 'function'
        ? options.onGeneratedAssetUpdated((detail) => {
            const settings = state.activeSettings;
            const imageLoaded = Boolean(detail && detail.reason === 'image-loaded');
            if (state.activeReader) {
                if (imageLoaded) warmActiveFloorImages();
                if (settings) readerStaleBehindSettings = true;
                else if (imageLoaded) scheduleImageRefresh({ reader: true });
                else rerenderActiveReader();
            }
            if (!settings) return;
            if (imageLoaded) {
                if (settings.tab === 'scene') scheduleImageRefresh({ settings: true });
                return;
            }
            if (settings.asyncState.sceneSubTab === 'review') rerenderSettings();
        })
        : () => {};
    // 日志更新时只替换列表 DOM，不整页重渲染，避免打断正在输入的设置项。
    const offImageJobLog = options.imageJobLog && typeof options.imageJobLog.onChange === 'function'
        ? options.imageJobLog.onChange(() => {
            const current = state.activeSettings;
            if (!current || current.tab !== 'image' || normalizeImageSubTab(current.asyncState.imageSubTab) !== 'logs') return;
            const list = current.dom && current.dom.root && current.dom.root.querySelector
                ? current.dom.root.querySelector('[data-image-log-list]') : null;
            if (list) list.innerHTML = renderImageJobLogList();
            else rerenderSettings();
        })
        : () => {};
    const offIllustrationUpdated = typeof options.onIllustrationUpdated === 'function'
        ? options.onIllustrationUpdated((payload) => {
            const current = state.activeReader;
            if (!current || !payload) return;
            const messageId = Number(payload.messageId);
            const contentId = current.payload && current.payload.messageId != null
                ? current.payload.messageId : current.contentMessageId;
            if (contentId == null || Number(contentId) !== messageId) return;
            const floor = typeof options.getIllustrationSource === 'function'
                ? options.getIllustrationSource(messageId)
                : null;
            if (!floor || floor.chatId !== payload.chatId || floor.swipeId !== payload.swipeId) return;
            if (current.illustrationIdentity && (current.illustrationIdentity.chatId !== floor.chatId
                || current.illustrationIdentity.swipeId !== floor.swipeId)) return;
            const previous = current.payload.message;
            current.payload.raw = floor.text;
            current.payload.message = previous && typeof previous === 'object'
                ? { ...previous, text: floor.text, raw: floor.text }
                : floor.text;
            current.payload.formattedText = null;
            current.payload.textSegments = null;
            current.payload.sceneDirectives = null;
            rerenderActiveReader();
            scheduleEmbeddedStoryHide();
        })
        : () => {};
    const offIllustrationProgress = typeof options.onIllustrationProgress === 'function'
        ? options.onIllustrationProgress((payload) => showIllustrationProgress(payload))
        : () => {};
    const offImageActivity = typeof options.onImageActivity === 'function'
        ? options.onImageActivity((event) => generationStrip.activity(event))
        : () => {};

    const {
        settingsInteracting, openSettings, syncSettingsStagePause, rerenderSettings, closeSettings,
        persistSettingsDraft, reportSettingsFailure, renderImageJobLogList,
    } = createSettingsHost({
        flushDeferredImageRefresh, normalizeUnifiedSettings, onboarding, openCgGallery, options, pageModal,
        playReaderUiSfx, rerenderActiveReader, resolveBridgeConfigSnapshot, scheduleMoodAutoClassify, sourceCache,
        state,
        takeReaderStaleBehindSettings() {
            const stale = readerStaleBehindSettings;
            readerStaleBehindSettings = false;
            return stale;
        },
    });

    const host = {
        openReader,
        replaceReader,
        openSettings,
        closeReader,
        closeSettings,
        getState,
        destroy,
        // 生图服务的进度 / 结果：阅读器开着时进生成细线，返回 true；没开返回 false，由调用方退回酒馆 toastr。
        showImageNotice(level, message) {
            if (!state.activeReader || !generationStrip.getDialogReady()) return false;
            imageNotice(level, message);
            return true;
        },
        getReaderSnapshotContract() {
            return {
                selectors: Array.from(ORIGINAL_READER_REQUIRED_SELECTORS),
                styleContract: { ...ORIGINAL_READER_STYLE_CONTRACT },
            };
        },
        getSettingsSnapshotContract() {
            return {
                selectors: Array.from(SETTINGS_PANEL_REQUIRED_SELECTORS),
                tabs: SETTINGS_TAB_DEFS.map(([id, label]) => ({
                    id,
                    label,
                    requiredPaths: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredPaths || []),
                    requiredActions: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredActions || []),
                })),
            };
        },
    };

    // 翻页配置缓存（见 resolveRenderConfig）；闭包变量必须写在 return 之前。
    let renderConfigCache = null;
    return host;

    function openReader(payload = {}, openOptions = {}) {
        closeReader({ keepFullscreen: true });
        unparkAudioBus();
        const nextMode = normalizeReaderMode(
            firstDefined(
                openOptions.mode,
                payload.mode,
                payload.viewerMode,
                payload.readerMode,
            ),
            resolveBridgeConfigSnapshot({ mode: openOptions.mode }).bridge,
        );
        const unified = resolveBridgeConfigSnapshot({ mode: nextMode });
        const readerSettings = normalizeReaderSettings(unified.readerSettings, unified.bridge.vnTheme);
        attachBridgeReaderExtras(readerSettings, unified.bridge);
        const snapshot = buildReaderSnapshot(
            payload,
            nextMode,
            readerSettings,
            payload.startAtEnd === true ? Number.MAX_SAFE_INTEGER : 0,
        );
        if (!snapshot.content.segments.length) {
            return { ok: false, reason: 'no-readable-text' };
        }
        const controller = createReaderController();
        const domState = mountReaderDom(snapshot, controller, payload);

        state.activeReader = {
            illustrationIdentity: readIllustrationIdentity(snapshot.messageId),
            payload: cloneReaderPayload(payload),
            mode: nextMode,
            index: snapshot.content.currentIndex,
            mountMessageId: snapshot.messageId,
            contentMessageId: snapshot.messageId,
            turnOffset: 0,
            streamPhase: 'idle',
            mountBaselineRaw: getMessagePrimaryText(payload.message && (payload.message.raw || payload.message) || payload.raw || ''),
            mountBaselineVisible: String(payload.visibleText || ''),
            inputValue: '',
            hidden: false,
            dragSuppressClick: false,
            toolbarCollapsed: true,
            lastAction: '',
            toastMessage: '',
            snapshot,
            controller,
            dom: domState,
            floatingState: {
                dragged: false,
                left: null,
                top: null,
            },
            runtime: null,
            toastTimer: null,
            imagePollToken: 0,
            assetLoadRequests: new Set(),
        };
        const current = state.activeReader;
        current.progressArmed = progressRuntime.navigating;
        pullProgressFromMetadata();
        current.titleGate = openOptions.skipTitle !== true && payload.skipTitle !== true && shouldGateTitleScreen({
            readerSettings,
            messageId: snapshot.messageId,
            index: snapshot.content.currentIndex,
            startAtEnd: payload.startAtEnd === true,
        }) ? createTitleGate() : null;
        if (current.titleGate) void resolveTitleHasLater(current);
        current.autoPlayer = createReaderAutoPlay({
            timers: options.autoPlayTimers || globalThis,
            read: () => {
                const overlay = current.dom?.overlay;
                const chat = current.snapshot.content.textType === 'chat' ? getChatRevealState(overlay) : null;
                const chatUnfinished = Boolean(chat && chat.revealed < chat.total);
                return {
                    closed: state.activeReader !== current,
                    page: `${current.snapshot.messageId}:${current.index}:${chat?.revealed || 0}`,
                    blocked: current.hidden || current.streamPhase !== 'idle' || current.spriteEditMode
                        || Boolean(current.titleGate)
                        || Boolean(state.activeSettings) || isStagePaused(overlay)
                        || Boolean(overlay?.ownerDocument?.hidden)
                        || Boolean(overlay?.classList?.contains('igs-options-visible')),
                    // 台词朗读没念完也算忙，念完再翻页。
                    busy: current.dom?.text?.dataset?.igsTypewriter === 'running' || isTtsSpeaking()
                        || Boolean(chatUnfinished && chat.pending),
                    last: isReaderLastPage(current.snapshot) && !chatUnfinished,
                };
            },
            advance: () => handleReaderAction('next'),
            sync: (autoPlay) => {
                current.autoPlay = autoPlay;
                applyToolbarState(current.dom?.overlay, current);
            },
        });
        current.autoPlay = current.autoPlayer.getState();
        updateMountedReader(snapshot);
        startReaderImagePolling(state.activeReader);
        if (!progressRuntime.navigating) void offerResume(current);
        if (domState && domState.overlay) {
            state.activeReader.stopStagePause = watchStagePause(domState.overlay, { offscreen: isEmbeddedReaderMode(nextMode), root: domState.root });
        }
        syncSettingsStagePause();
        syncStatusHudSubscription();
        if (isEmbeddedReaderMode(nextMode)) {
            streamObserver.start();
            startEmbeddedStoryWatch();
        } else {
            stopEmbeddedStoryWatch();
            if (followsHostReply(nextMode)) streamObserver.start();
            else streamObserver.stop();
        }

        if (domState && domState.overlay) onboarding.syncInvite(domState.overlay);
        return {
            ok: true,
            mode: nextMode,
            readerMode: nextMode,
            snapshot: cloneData(snapshot),
            domMounted: Boolean(domState),
            controller,
        };
    }

    // 已打开阅读器时原地替换阅读源：复用同一 reader root、controller 与事件绑定，
    // 不 closeReader→openReader 重建，避免内嵌轮次切换和流式完成时反复重建 DOM。
    function replaceReader(payload = {}, replaceOptions = {}) {
        const current = state.activeReader;
        if (!current) return openReader(payload, replaceOptions);
        const mode = normalizeReaderMode(current.mode, resolveBridgeConfigSnapshot({ mode: current.mode }).bridge);
        const merged = applyReaderPayloadToState(current, mode, { payload, index: 0 });
        if (!merged.content.segments.length) return { ok: false, reason: 'no-readable-text' };
        current.contentMessageId = payload.messageId != null ? payload.messageId : current.contentMessageId;
        current.illustrationIdentity = readIllustrationIdentity(current.contentMessageId);
        if (replaceOptions.turnOffset != null) current.turnOffset = Math.max(0, Number(replaceOptions.turnOffset) || 0);
        current.payload = cloneReaderPayload(payload);
        if (current.turnOffset === 0 || payload.messageId === current.mountMessageId) {
            current.mountBaselineRaw = getMessagePrimaryText(payload.message && (payload.message.raw || payload.message) || payload.raw || '');
            current.mountBaselineVisible = String(payload.visibleText || '');
        }
        current.index = 0;
        current.inputValue = '';
        current.awaitingReply = false;
        current.mountMessageId = replaceOptions.mountMessageId != null ? replaceOptions.mountMessageId : current.mountMessageId;
        current.mode = mode;
        current.snapshot = merged;
        if (current.titleGate && Number(current.contentMessageId) !== 0) dropTitleGate(current);
        updateMountedReader(merged);
        exitEmbeddedLoading();
        if ((isEmbeddedReaderMode(mode) || followsHostReply(mode)) && current.turnOffset === 0) startReaderImagePolling(current);
        return {
            ok: true,
            mode,
            readerMode: mode,
            snapshot: cloneData(merged),
            domMounted: Boolean(current.dom),
            controller: current.controller,
            replaced: true,
        };
    }

    // 物品演出：账本补上物品表变动的获得 / 失去，标出初次获得，并给正文点亮备好已知物品名。
    function decorateItemFx(pageFx, payload, segments, index, directives, readerSettings) {
        const ledger = options.itemLedger;
        const itemFx = normalizeItemFxSettings(readerSettings && readerSettings.itemFx);
        if (!ledger || !itemFx.enabled || !pageFx || !Array.isArray(pageFx.items)) return;
        const messageId = Number(firstDefined(payload.messageId, payload.message && payload.message.id, null));
        if (!Number.isInteger(messageId)) return;
        const identity = state.activeReader && Number(state.activeReader.payload.messageId) === messageId && state.activeReader.illustrationIdentity
            ? state.activeReader.illustrationIdentity : readIllustrationIdentity(messageId);
        const chatId = identity && identity.chatId;
        if (!chatId) return;
        const tagItems = (directives || []).filter((d) => d.kind === 'item').map((d) => ({ action: d.args[0], name: d.args[1], description: d.args[2] || '' }));
        ledger.noteTagItems(chatId, tagItems, messageId);
        mergeItemEvents(pageFx, {
            events: ledger.eventsFor(chatId, messageId, identity.swipeId),
            segments,
            index,
            tagNames: new Set(tagItems.map((item) => normalizeItemName(item.name))),
            shown: itemEventsShown,
            floorKey: `${chatId}|${messageId}|${Number(identity.swipeId) || 0}`,
        });
        for (const item of pageFx.items) if (item.action === 'gain') item.first = ledger.isFirst(chatId, item.name, messageId);
        if (itemFx.mention) pageFx.itemMentions = ledger.knownItems(chatId);
    }

    function readIllustrationIdentity(messageId) {
        const floor = messageId != null && typeof options.getIllustrationSource === 'function'
            ? options.getIllustrationSource(messageId) : null;
        return floor ? { chatId: floor.chatId, swipeId: floor.swipeId } : null;
    }

    // 由当前 payload 重新构建 snapshot：正文解析走 source 缓存，普通换源不会重复整楼解析。
    function applyReaderPayloadToState(current, mode, optionsForRender = {}) {
        const unified = resolveBridgeConfigSnapshot({ mode });
        const readerSettings = normalizeReaderSettings(unified.readerSettings, unified.bridge.vnTheme);
        attachBridgeReaderExtras(readerSettings, unified.bridge);
        return buildReaderSnapshot(optionsForRender.payload || current.payload, mode, readerSettings,
            optionsForRender.index ?? current.index);
    }

    function teardownStatusHudSubscription() {
        if (statusHudClient && statusHudCallback) {
            statusHudClient.unregisterCallback(statusHudCallback);
        }
        statusHudClient = null;
        statusHudCallback = null;
    }

    function syncStatusHudSubscription() {
        const current = state.activeReader;
        const settings = current && current.snapshot && current.snapshot.readerSettings;
        const statusHud = normalizeStatusHudSettings(settings && settings.statusHud);
        const shouldSubscribe = Boolean(current) && statusHud.enabled && statusHud.tables.length > 0;
        if (!shouldSubscribe) {
            teardownStatusHudSubscription();
            return;
        }
        if (statusHudClient && statusHudCallback) return;
        const api = (options.global || globalThis).AutoCardUpdaterAPI || null;
        statusHudClient = createShujukuClient(api);
        statusHudCallback = () => {
            if (!state.activeReader) return;
            refreshStatusHudInActiveReader();
        };
        statusHudClient.registerCallback(statusHudCallback);
    }

    function readStatusHudTablesSafe() {
        const api = (options.global || globalThis).AutoCardUpdaterAPI || null;
        try {
            return createShujukuClient(api).readTables();
        } catch (error) {
            return { ok: false, reason: String((error && error.message) || 'read-failed') };
        }
    }

    function refreshStatusHudInActiveReader() {
        const current = state.activeReader;
        if (!current || !current.dom || !current.dom.overlay) return;
        const settings = current.snapshot && current.snapshot.readerSettings;
        const content = current.snapshot && current.snapshot.content;
        const statusHudSettings = normalizeStatusHudSettings(settings && settings.statusHud);
        const showSceneHud = Boolean(content && content.sceneNsfw && statusHudSettings.showSpriteOnNsfw === false);
        const next = withConcreteAvatar(buildStatusHudModel({
            settings: statusHudSettings,
            sceneAssets: (settings && settings._sceneAssets) || {},
            location: content && content.sceneLocation,
            time: content && content.sceneTime,
            weather: content && content.sceneWeather,
            character: content && !content.sceneNsfw ? content.speaker : '',
            emotion: content && !content.sceneNsfw ? content.statusEmotion : '',
            isNarration: Boolean(content && (content.textType === 'narration' || content.textType === 'thought')) || showSceneHud,
            readResult: readStatusHudTablesSafe(),
            outfitFor: { character: content && content.spriteCharacter, outfit: content && content.spriteOutfit },

        }));
        current.snapshot.content.statusHud = next;
        applyReaderSnapshotToDom(current.dom.overlay, current.snapshot, current, {
            hasActiveSettings: () => Boolean(state.activeSettings),
            resolveAssetUrl: (url) => resolveReaderAssetUrl(url, current),
            // 获得物品演出：只读本聊天物品图本地缓存。
            resolveItemImage: (name) => (options.itemImages && typeof options.itemImages.imageUrlFor === 'function' ? options.itemImages.imageUrlFor(name) : ''),
            chatId: typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : '',
            // 用户角色名：直播主播名与之相同时自动切主播视角；用 getter 跟随切换角色。
            get userName() { return String((getSillyTavernContext(options.global || globalThis) || {}).name1 || ''); },
            onDailyPhoto: saveDailyPhoto,
            onRomanceMemory: saveRomanceMemory,
            onCgPortraitMove: (statusHud) => saveReaderSettingsPatch({ statusHud }),
        });
    }

    function pageUsesAsset(content, source) {
        if (!content || !source) return false;
        if (content.backgroundImage === source || content.spriteImage === source || content.nsfwCgPortrait === source) return true;
        if (content.fx && content.fx.foeImage === source) return true;
        return Array.isArray(content.castSprites) && content.castSprites.some((member) => member && member.image === source);
    }

    function concreteReaderAssetUrl(url) {
        const source = String(url || '').trim();
        if (!source) return '';
        if (!isGeneratedAssetUrl(source)) return source;
        const generatedAssets = options.generatedAssets || null;
        return generatedAssets && typeof generatedAssets.resolveUrl === 'function'
            ? String(generatedAssets.resolveUrl(source) || '')
            : '';
    }

    // 状态栏头像存在图库（igs-gen:）时换成已读回的图；还没读回先空着，读回后 image-loaded 会重绘。
    function withConcreteAvatar(model) {
        if (model && isGeneratedAssetUrl(model.avatar)) model.avatar = concreteReaderAssetUrl(model.avatar);
        return model;
    }

    function warmActiveFloorImages(mountedSnapshot) {
        const current = state.activeReader;
        const payload = current && current.payload;
        const snapshot = mountedSnapshot || (current && current.snapshot);
        if (!payload || !snapshot) return;
        const readerSettings = snapshot.readerSettings || {};
        const liveMessage = (payload.message && payload.message.raw) || payload.message || payload.raw || '';
        const source = String(payload.raw || (typeof liveMessage === 'string' ? liveMessage : '') || '');
        const slots = snapshot.content && Array.isArray(snapshot.content.imageSlots) ? snapshot.content.imageSlots : [];
        const key = `${firstDefined(payload.messageId, payload.message && payload.message.id, '')}:${source.length}:${slots.map((slot) => (slot && slot.url) || '').join('|')}`;
        if (floorAssetPlan.key !== key) {
            const sceneAssets = readerSettings._sceneAssets || null;
            const generatedAssets = options.generatedAssets || null;
            floorAssetPlan = {
                key,
                urls: collectFloorAssetUrls({
                    source,
                    sceneAssets,
                    inheritedOutfits: payload.inheritedOutfits,
                    inheritedScene: payload.inheritedSceneState,
                    imageSlots: slots,
                    systemRole: readerSettings.systemRole,
                    readClues: (names) => collectOutfitClues(readStatusHudTablesSafe(), names),
                    assetMatchCtx: {
                        sceneAssets,
                        generatedAssets: sceneAssets && sceneAssets.generated,
                        strict: readerSettings._strictBackgroundMatch === true,
                        tempBackground: generatedAssets ? generatedAssets.tempBackground : null,
                        tempSceneTime: generatedAssets ? generatedAssets.tempSceneTime : null,
                        tempSprite: generatedAssets ? generatedAssets.tempSprite : null,
                    },
                }),
            };
        }
        for (const url of floorAssetPlan.urls) {
            const concrete = concreteReaderAssetUrl(url);
            if (concrete) imageResourceCache.load(concrete);
        }
    }

    function resolveReaderAssetUrl(url, current) {
        const source = String(url || '').trim();
        if (!source) return '';
        if (isGeneratedAssetUrl(source)) return concreteReaderAssetUrl(source);
        const ready = imageResourceCache.get(source);
        if (ready) return ready;
        // data / blob 已经是本地像素。先原样画上，解码只为了预热缓存；
        // 等解码完再补地址会先把背景清成空的，播 CG 时整屏闪一下。
        const inline = /^(?:data:|blob:)/i.test(source);
        if (!current.assetLoadRequests.has(source)) {
            current.assetLoadRequests.add(source);
            const loading = imageResourceCache.load(source);
            const immediate = imageResourceCache.get(source);
            loading.then(() => {
                current.assetLoadRequests.delete(source);
                if (inline || state.activeReader !== current) return;
                const content = current.snapshot && current.snapshot.content;
                if (!pageUsesAsset(content, source)) return;
                updateMountedReader(current.snapshot);
            });
            if (immediate) return immediate;
        }
        return inline ? source : '';
    }

    function closeReader(closeOptions = {}) {
        const current = state.activeReader;
        if (!current) return { ok: true, reason: 'reader-not-open' };
        if (closeOptions.keepSettings !== true) {
            const closed = closeSettings();
            if (closed.ok === false) {
                reportSettingsFailure(closed);
                return closed;
            }
        }
        if (turnIndexPanel) turnIndexPanel.close();
        // 真正关闭（不是切轮重开）时把阅读进度同步进聊天元数据，换设备也能续读。
        if (closeOptions.keepFullscreen !== true) pushProgressToMetadata();
        teardownStatusHudSubscription();
        current.autoPlayer?.stop();
        stopTts();
        clearReaderToast(current);
        cancelTypewriter(current.dom && current.dom.text, { finish: false });
        const stageMotion = current.dom && current.dom.overlay && current.dom.overlay.querySelector
            ? current.dom.overlay.querySelector('#igs-stage-motion')
            : null;
        cancelStageShakeEffect(stageMotion);
        if (current.dom && current.dom.overlay) cancelChatShow(current.dom.overlay);
        if (current.dom && current.dom.overlay) cancelFxEffects(current.dom.overlay);
        if (current.dom && current.dom.overlay) cancelDanmaku(current.dom.overlay);
        if (current.dom && current.dom.overlay) cancelStageDirection(current.dom.overlay);
        if (current.dom && current.dom.overlay) clearCastDom(current.dom.overlay);
        current.castCollapsedFrom = null;
        if (current.dom && current.dom.overlay) cancelSceneGrade(current.dom.overlay);
        if (current.dom && current.dom.overlay) closeRomanceFx(current.dom.overlay);
        if (current.dom && current.dom.overlay) closeMetaFx(current.dom.overlay);
        if (current.dom && current.dom.overlay) cancelDailyFx(current.dom.overlay);
        if (current.dom && current.dom.overlay) cancelResultFx(current.dom.overlay);
        if (current.dom && current.dom.overlay) cancelSceneAudio(current.dom.overlay);
        parkAudioBus();
        if (typeof current.stopStagePause === 'function') current.stopStagePause();
        clearReaderModeRuntime(current);
        if (closeOptions.keepFullscreen !== true) {
            exitDocumentFullscreen(getRootDocument(options.global));
        }
        current.imagePollToken += 1;
        streamObserver.stop();
        stopEmbeddedStoryWatch();
        sourceCache.invalidate();
        if (current.dom && typeof current.dom.dispose === 'function') {
            current.dom.dispose();
        }
        unmountNode(current.dom && current.dom.root);
        state.activeReader = null;
        return { ok: true };
    }

    function getState() {
        return {
            activeReader: state.activeReader ? {
                mode: state.activeReader.mode,
                index: state.activeReader.index,
                hidden: state.activeReader.hidden,
                dragSuppressClick: state.activeReader.dragSuppressClick,
                toolbarCollapsed: state.activeReader.toolbarCollapsed,
                autoPlay: { ...state.activeReader.autoPlay },
                lastAction: state.activeReader.lastAction,
                inputValue: state.activeReader.inputValue,
                toastMessage: state.activeReader.toastMessage,
                generationTip: generationStrip.getState().tip,
                floatingState: cloneData(state.activeReader.floatingState),
                snapshot: cloneData(state.activeReader.snapshot),
            } : null,
            activeSettings: state.activeSettings ? {
                tab: state.activeSettings.tab,
                snapshot: cloneData(state.activeSettings.snapshot),
            } : null,
        };
    }

    function destroy() {
        moodAutoDisposed = true;
        if (moodAutoTimer) moodAutoTimers().clearTimeout(moodAutoTimer);
        moodAutoTimer = 0;
        const closed = closeSettings();
        if (closed.ok === false) return closed;
        offIllustrationUpdated();
        offIllustrationProgress();
        offImageActivity();
        generationStrip.dispose();
        offGeneratedAssetUpdated();
        offItemImageUpdated();
        offImageJobLog();
        teardownStatusHudSubscription();
        closeReader();
        disarmEditReopen();
        streamObserver.stop();
        imageResourceCache.clear();
        return { ok: true };
    }

    function tracksHostReply(mode) {
        return isEmbeddedReaderMode(mode) || followsHostReply(mode);
    }

    // 全屏与网页全屏：发送后在输入栏显示「正在生成」，新回复写完原地换源。
    function followsHostReply(mode) {
        return mode === 'fullscreen' || mode === 'web';
    }

    function handleChatStreamActivity() {
        const current = state.activeReader;
        if (!current || !tracksHostReply(current.mode)) return;
        // 正在读旧楼且不是自己发的：不拉回最新，只提示一句。
        if (Number(current.turnOffset) > 0 && !current.awaitingReply) { noticeNewFloor(); return; }
        if (isEmbeddedReaderMode(current.mode)) {
            syncEmbeddedStreamMount(current);
            enterEmbeddedLoading();
            return;
        }
        enterReplyWait(current);
    }

    function resolveEmbeddedDocument(current) {
        const mount = current && current.dom && current.dom.embeddedMount;
        return mount && mount.host && mount.host.ownerDocument
            || current && current.dom && current.dom.root && current.dom.root.ownerDocument
            || current && current.dom && current.dom.doc
            || getRootDocument(options.global);
    }

    function syncEmbeddedStreamMount(current) {
        const message = resolveLatestLiveAiMessage(resolveEmbeddedDocument(current));
        return message ? syncEmbeddedReaderMount(current, message) : false;
    }

    function resolveLatestLiveAiMessage(doc) {
        const chat = doc && typeof doc.querySelector === 'function' ? doc.querySelector('#chat') : null;
        if (!chat) return null;
        // 从末尾往前找，不复制整份 children（长对话有上千个楼层节点）；不支持 lastElementChild 的环境退回数组遍历。
        if ('lastElementChild' in chat) {
            for (let element = chat.lastElementChild; element; element = element.previousElementSibling) {
                const found = readLiveAiMessage(element);
                if (found) return found;
            }
            return null;
        }
        const children = chat.children ? Array.from(chat.children) : [];
        for (let index = children.length - 1; index >= 0; index -= 1) {
            const found = readLiveAiMessage(children[index]);
            if (found) return found;
        }
        return null;
    }

    function readLiveAiMessage(element) {
        if (!element || !element.classList || !element.classList.contains('mes')) return null;
        if (readHostBooleanAttribute(element, ['is_user', 'data-is-user'])) return null;
        if (readHostBooleanAttribute(element, ['is_system', 'data-is-system'])) return null;
        const messageId = readLiveMessageId(element);
        return messageId != null ? { id: messageId, element } : null;
    }

    function readHostBooleanAttribute(element, names) {
        if (!element || typeof element.getAttribute !== 'function') return false;
        return names.some((name) => {
            const value = element.getAttribute(name);
            return value === true || value === 1 || value === '1' || value === 'true';
        });
    }

    function readLiveMessageId(element) {
        if (!element || typeof element.getAttribute !== 'function') return null;
        for (const name of ['mesid', 'data-mesid', 'data-message-id', 'data-id']) {
            const raw = element.getAttribute(name);
            const id = Number(raw);
            if (raw != null && Number.isFinite(id) && id >= 0) return id;
        }
        return null;
    }

    function syncEmbeddedReaderMount(current, message) {
        if (!current || !current.dom || !current.dom.root || !message || message.id == null) return false;
        const doc = resolveEmbeddedDocument(current);
        const element = message.element || resolveLiveMessageElement(doc, message.id);
        const resolved = resolveEmbeddedHostParent(element);
        if (!resolved) return false;
        const mount = current.dom.embeddedMount;
        const sameMount = Boolean(
            mount
            && mount.messageId === message.id
            && mount.mesText === resolved.mesText
            && mount.host
            && mount.host.parentNode === resolved.parent
        );
        if (sameMount) {
            hideMountedStory(resolved.mesText, message);
            return false;
        }
        remountEmbeddedReader(current, { ...message, element });
        if (current.dom.embeddedMount) current.mountMessageId = message.id;
        return Boolean(current.dom.embeddedMount);
    }

    // 观察器只在“稳定”后调用一次：读取最新 AI 消息并原地换源。
    // 流式 token 期间不解析正文、不收集图片，避免酒馆卡顿与页面抖动。
    async function handleChatStreamStable() {
        const current = state.activeReader;
        const embedded = Boolean(current && isEmbeddedReaderMode(current.mode));
        if (!current || !tracksHostReply(current.mode)) return true;
        if (Number(current.turnOffset) > 0 && !current.awaitingReply && current.streamPhase !== 'streaming') {
            noticeNewFloor();
            return true;
        }
        if (typeof options.getCurrentMessage !== 'function'
            || typeof options.openViewerFromMessage !== 'function') {
            exitEmbeddedLoading();
            return true;
        }
        // 宿主挂起时该 await 可能无限 pending，超时兜底保证 loading 退出路径必然到达。
        const message = await Promise.race([
            options.getCurrentMessage(),
            new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
        if (!message || message.id == null) {
            if (followsHostReply(current.mode) && current.awaitingReply && !streamObserver.hasGenerationSettled()) return false;
            exitEmbeddedLoading();
            return true;
        }
        // 全屏：用户还停在这一楼。正文比对稍有出入也不能重开，重开会把页码打回第一页并清掉等待提示。
        // 生成没结束就继续等；结束了仍是这一楼，只收起提示，留在当前页。新楼写完再切过去。
        if (followsHostReply(current.mode) && current.awaitingReply) {
            const newFloor = Number(message.id) !== Number(current.contentMessageId);
            if (!streamObserver.hasGenerationSettled() || !newFloor) {
                if (!streamObserver.hasGenerationSettled()) return false;
                exitEmbeddedLoading();
                return true;
            }
        }
        const nextRaw = getMessagePrimaryText(message.raw || message);
        const nextVisible = String(message.visibleText || '');
        const changed = message.id !== current.contentMessageId
            || nextRaw !== current.streamBaselineRaw
            || nextVisible !== current.streamBaselineVisible;
        if (!changed) {
            exitEmbeddedLoading();
            return true;
        }
        current.turnOffset = 0;
        current.mountMessageId = message.id;
        if (embedded) syncEmbeddedReaderMount(current, message);
        try {
            await options.openViewerFromMessage(message.id, current.mode, {
                replaceActive: true,
                turnOffset: 0,
                mountMessageId: message.id,
                message,
            });
        } catch (error) {
            // 宿主异常不得打断阅读器；保持当前内容即可。
        } finally {
            exitEmbeddedLoading();
        }
        return true;
    }

    function enterReplyWait(current) {
        if (!current || !followsHostReply(current.mode)) return;
        if (current.streamPhase !== 'streaming') {
            current.imagePollToken += 1;
            current.imagePolling = false;
            current.streamBaselineRaw = String(current.mountBaselineRaw || '');
            current.streamBaselineVisible = String(current.mountBaselineVisible || '');
            streamObserver.prepareForReply();
        }
        current.streamPhase = 'streaming';
        current.awaitingReply = true;
        const overlay = current.dom && current.dom.overlay;
        if (overlay && overlay.classList) overlay.classList.add('igs-awaiting-reply');
    }

    function enterEmbeddedLoading() {
        const current = state.activeReader;
        const mount = current && current.dom && current.dom.embeddedMount;
        if (!current || !isEmbeddedReaderMode(current.mode) || !mount || !mount.host) return;
        if (current.streamPhase !== 'streaming') {
            current.imagePollToken += 1;
            current.imagePolling = false;
            current.streamBaselineRaw = String(current.mountBaselineRaw || '');
            current.streamBaselineVisible = String(current.mountBaselineVisible || '');
        }
        current.streamPhase = 'streaming';
        current.turnOffset = 0;
        const host = mount.host;
        host.setAttribute('data-igs-embedded-loading', '1');
        if (current.dom.root && current.dom.root.style) current.dom.root.style.display = 'none';
        let loading = host.querySelector && host.querySelector('.igs-embedded-loading');
        if (!loading && host.ownerDocument && typeof host.ownerDocument.createElement === 'function') {
            loading = host.ownerDocument.createElement('div');
            loading.className = 'igs-embedded-loading';
            loading.setAttribute('role', 'status');
            loading.setAttribute('aria-live', 'polite');
            loading.innerHTML = '<span class="igs-embedded-loading-dot"></span><span class="igs-embedded-loading-dot"></span><span class="igs-embedded-loading-dot"></span><span class="igs-embedded-loading-text">正在生成…</span>';
            host.appendChild(loading);
        }
    }

    function exitEmbeddedLoading() {
        const current = state.activeReader;
        if (!current) return;
        current.streamBaselineRaw = '';
        current.streamBaselineVisible = '';
        current.streamPhase = 'idle';
        current.awaitingReply = false;
        const waitingOverlay = current.dom && current.dom.overlay;
        if (waitingOverlay && waitingOverlay.classList) waitingOverlay.classList.remove('igs-awaiting-reply');
        if (moodAutoFloorWaiting && moodAutoFloorWaiting !== moodAutoFloorSent) {
            moodAutoFloorSent = moodAutoFloorWaiting;
            moodAutoFloorWaiting = '';
            scheduleMoodAutoClassify();
        }
        const mount = current.dom && current.dom.embeddedMount;
        const host = mount && mount.host;
        if (host && host.removeAttribute) host.removeAttribute('data-igs-embedded-loading');
        const loading = host && host.querySelector ? host.querySelector('.igs-embedded-loading') : null;
        if (loading && typeof loading.remove === 'function') loading.remove();
        if (current.dom && current.dom.root && current.dom.root.style) current.dom.root.style.display = '';
    }

    function remountEmbeddedReader(current, message) {
        if (!current || !current.dom || !current.dom.root) return;
        const root = current.dom.root;
        const doc = resolveEmbeddedDocument(current);
        teardownEmbeddedMount(current.dom.embeddedMount);
        current.dom.embeddedMount = mountEmbeddedRoot(doc, root, message, message && message.id);
        if (!current.dom.embeddedMount) {
            (doc.documentElement || doc.body).appendChild(root);
        }
    }

    function syncReaderMountForMode(current, mode) {
        if (!current || !current.dom || !current.dom.root) return;
        const doc = current.dom.doc;
        const root = current.dom.root;
        if (isEmbeddedReaderMode(mode)) {
            if (!current.dom.embeddedMount) {
                current.dom.embeddedMount = mountEmbeddedRoot(doc, root, current.payload.message, current.mountMessageId);
            }
            streamObserver.start();
            startEmbeddedStoryWatch();
            return;
        }
        stopEmbeddedStoryWatch();
        if (current.dom.embeddedMount) {
            const wasStreaming = current.streamPhase === 'streaming';
            exitEmbeddedLoading();
            (doc.documentElement || doc.body).appendChild(root);
            teardownEmbeddedMount(current.dom.embeddedMount);
            current.dom.embeddedMount = null;
            if (followsHostReply(mode)) {
                streamObserver.start();
                if (wasStreaming) enterReplyWait(current);
            } else streamObserver.stop();
            return;
        }
        if (followsHostReply(mode)) {
            streamObserver.start();
            return;
        }
        streamObserver.stop();
        exitEmbeddedLoading();
    }

    function createReaderController() {
        return {
            getSnapshot() {
                return state.activeReader ? cloneData(state.activeReader.snapshot) : null;
            },
            setInputValue(value) {
                if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
                state.activeReader.inputValue = String(value || '');
                if (state.activeReader.dom && state.activeReader.dom.input) {
                    state.activeReader.dom.input.value = state.activeReader.inputValue;
                }
                return { ok: true, value: state.activeReader.inputValue };
            },
            async submit(text) {
                return submitReaderInput(text);
            },
            async keydown(event = {}) {
                if (event.key !== 'Enter') {
                    return { ok: true, sent: false, reason: 'ignored-key' };
                }
                if (event.shiftKey) {
                    return { ok: true, sent: false, reason: 'shift-enter-kept' };
                }
                return submitReaderInput(firstDefined(event.value, state.activeReader && state.activeReader.inputValue, ''));
            },
            toggleHidden() {
                if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
                state.activeReader.hidden = !state.activeReader.hidden;
                rerenderActiveReader();
                return { ok: true, hidden: state.activeReader.hidden };
            },
            toggleToolbar() {
                if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
                state.activeReader.toolbarCollapsed = !state.activeReader.toolbarCollapsed;
                applyToolbarState(state.activeReader.dom && state.activeReader.dom.overlay, state.activeReader);
                return { ok: true, collapsed: state.activeReader.toolbarCollapsed };
            },
            toggleStatusHud() {
                const current = state.activeReader;
                if (!current) return { ok: false, reason: 'reader-not-open' };
                const hudSettings = current.snapshot && current.snapshot.readerSettings && current.snapshot.readerSettings.statusHud || {};
                const effectiveCollapsed = hudSettings.collapsed === true || current.toolbarCollapsed === false;
                if (effectiveCollapsed) {
                    current.toolbarCollapsed = true;
                    if (hudSettings.collapsed === true) {
                        const result = saveReaderSettingsPatch({ statusHud: { ...hudSettings, collapsed: false } });
                        if (result && result.ok === false) return result;
                    } else {
                        applyToolbarState(current.dom && current.dom.overlay, current);
                    }
                    return { ok: true, collapsed: false };
                }
                const result = saveReaderSettingsPatch({ statusHud: { ...hudSettings, collapsed: true } });
                if (result && result.ok === false) return result;
                return { ok: true, collapsed: true };
            },
            invokeAction(action) {
                return handleReaderAction(action);
            },
            openSettings(tab) {
                return openSettings({ tab, mode: state.activeReader ? state.activeReader.mode : 'pc' });
            },
            close() {
                return closeReader();
            },
        };
    }

    async function submitReaderInput(text) {
        if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        // 停在旧楼时发送：剧情会接在最新楼后面，先确认，免得以为是在旧楼的语境里接着写。
        if (Number(state.activeReader.turnOffset) > 0) {
            const floorId = currentTurnMessageId(state.activeReader);
            const confirmed = await pageModal.confirm(`现在停在旧楼（第 ${floorId} 楼）。发送后剧情接在最新楼后面，回复到了会切过去。继续发送？`);
            if (!confirmed) return { ok: false, sent: false, reason: 'old-floor-cancelled' };
            if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        }
        const embedded = isEmbeddedReaderMode(state.activeReader.mode);
        const fullscreen = followsHostReply(state.activeReader.mode);
        if (embedded) enterEmbeddedLoading();
        else if (fullscreen) enterReplyWait(state.activeReader);
        const nextText = String(firstDefined(text, state.activeReader.inputValue, '') || '');
        const send = typeof options.typeAndSend === 'function'
            ? options.typeAndSend
            : async () => ({ ok: false, reason: 'missing-send-handler' });
        const result = await send(nextText);
        if ((embedded || fullscreen) && result.ok === false) exitEmbeddedLoading();
        else if (embedded || fullscreen) streamObserver.noteActivity();
        state.activeReader.inputValue = '';
        // 漫画模式：发出去后输入框收起，新回复到了再出来。
        const sentSnapshot = state.activeReader.snapshot;
        if (result.ok !== false && sentSnapshot && isComicModeActive(sentSnapshot.readerSettings)) {
            state.activeReader.comicInputSent = comicContentKey(sentSnapshot);
            const overlay = state.activeReader.dom && state.activeReader.dom.overlay;
            const controls = overlay && overlay.querySelector ? overlay.querySelector('.igs-controls') : null;
            if (controls && controls.setAttribute) controls.setAttribute('data-igs-comic-sent', '1');
        }
        if (state.activeReader.dom && state.activeReader.dom.input) {
            state.activeReader.dom.input.value = '';
        }
        if (!(fullscreen && result.ok !== false)) {
            writeToast(result.ok === false ? (result.reason || '发送失败') : '已发送');
        }
        return {
            ok: result.ok !== false,
            sent: result.ok !== false,
            text: nextText,
            result,
        };
    }

    // 翻页时传入本页快照的 readerSettings（已带 _optionBubble），不再为两个字段重新克隆、整理整份配置。
    function getOptionBubbleConfig(rendered) {
        let ob;
        let reader;
        if (rendered && Object.prototype.hasOwnProperty.call(rendered, '_optionBubble')) {
            ob = rendered._optionBubble;
            reader = rendered;
        } else {
            const mode = state.activeReader && state.activeReader.mode ? state.activeReader.mode : undefined;
            const unified = resolveRenderConfig(mode);
            const bridge = unified.bridge;
            ob = bridge.optionBubble && typeof bridge.optionBubble === 'object' ? bridge.optionBubble : {};
            reader = normalizeReaderSettings(unified.readerSettings, bridge.vnTheme);
        }
        const position = (ob.position === 'top-center' || ob.position === 'top-right') ? ob.position : 'top-left';
        return {
            enabled: ob.enabled === true,
            position,
            clickAction: ob.clickAction === 'fill' ? 'fill' : 'send',
            widthFollowsText: ob.widthFollowsText === true,
            fontSize: reader.optionFontSize,
        };
    }

    function isReaderLastPage(snapshot) {
        const segs = snapshot && snapshot.content && Array.isArray(snapshot.content.segments)
            ? snapshot.content.segments.length : 0;
        const idx = snapshot && snapshot.content ? Number(snapshot.content.currentIndex) : 0;
        return segs <= 0 || idx >= segs - 1;
    }

    function handleOptionBubbleBlankClick(current, snapshot) {
        const cfg = getOptionBubbleConfig();
        if (!cfg.enabled || !isReaderLastPage(snapshot)) return false;
        const overlay = current && current.dom && current.dom.overlay;
        const container = overlay && overlay.querySelector ? overlay.querySelector('#igs-option-bubbles') : null;
        if (!container) return false;
        if (!container.hasAttribute('hidden')) {
            hideOptionBubbles(container);
            return true;
        }
        showOptionBubbles(container, cfg);
        return true;
    }

    function syncStatusHudOptionSuppression(container, visible) {
        const doc = container && container.ownerDocument;
        const overlay = doc && typeof doc.getElementById === 'function' ? doc.getElementById('igs-overlay') : null;
        const hud = doc && typeof doc.getElementById === 'function' ? doc.getElementById('igs-status-hud') : null;
        if (overlay && overlay.classList) {
            if (visible) overlay.classList.add('igs-options-visible');
            else overlay.classList.remove('igs-options-visible');
        }
        if (hud && hud.classList) {
            if (visible) hud.classList.add('igs-hud-suppressed');
            else hud.classList.remove('igs-hud-suppressed');
        }
    }

    function hideOptionBubbles(container) {
        if (!container) return;
        container.setAttribute('hidden', '');
        syncStatusHudOptionSuppression(container, false);
        clearChildren(container);
    }

    function showOptionBubbles(container, cfg, optionsForShow = {}) {
        const doc = container.ownerDocument || getRootDocument(options.global);
        const api = (options.global || globalThis).AutoCardUpdaterAPI || null;
        const items = readOptionItems(createShujukuClient(api));
        if (!items.length) {
            hideOptionBubbles(container);
            if (!optionsForShow.silent) writeToastSafe('未找到选项表（选项 / 选项表 / 行动选项 / 检定建议表）或表为空');
            return;
        }
        container.setAttribute('data-igs-pos', cfg.position);
        container.setAttribute('data-igs-width', cfg.widthFollowsText ? 'text' : 'dialog');
        if (container.style && typeof container.style.setProperty === 'function') container.style.setProperty('--igs-option-font-size', `${cfg.fontSize}px`);
        clearChildren(container);
        for (const item of items) {
            const display = (item && typeof item === 'object') ? String(item.display || '') : String(item || '');
            const send = (item && typeof item === 'object') ? String(item.send || item.display || '') : String(item || '');
            const dice = (item && typeof item === 'object') ? String(item.dice || '').trim() : '';
            const bubble = doc.createElement('button');
            bubble.type = 'button';
            bubble.className = 'igs-option-bubble igs-bubble';
            bubble.textContent = display;
            bubble.addEventListener('pointerenter', () => playReaderUiSfx('hover'));
            bubble.addEventListener('click', (event) => {
                if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                playReaderUiSfx('confirm');
                onOptionBubbleClick(container, send, cfg, dice ? { display, dice } : null);
            });
            container.appendChild(bubble);
        }
        container.removeAttribute('hidden');
        syncStatusHudOptionSuppression(container, true);
    }

    // 骰子命令在点击时才判定（fill 模式重点一次即重掷一次）；判定不可用时按原命令文本降级发送。
    async function resolveOptionSendText(fallback, check) {
        if (!check) return fallback;
        const global = options.global || globalThis;
        const context = getSillyTavernContext(global);
        const result = await resolveDiceCommand(check.dice, findAcuDice(global), {
            random: options.random,
            userName: context && context.name1 ? String(context.name1) : '',
        });
        if (!result || !result.ok) {
            writeToastSafe(`检定未执行：${result && result.reason || '未知原因'}，已按原命令发送`);
            return fallback;
        }
        await playOptionResultFx(result);
        return formatCheckMessage(check.display, result.line);
    }

    // 掷骰展示默认关闭；开启后等结论定格再发送，被关闭阅读器等取消时立即继续，不阻塞发送。
    async function playOptionResultFx(result) {
        const current = state.activeReader;
        const readerSettings = current && current.snapshot && current.snapshot.readerSettings;
        if (!readerSettings || !normalizeResultFxSettings(readerSettings.resultFx).enabled) return;
        const overlay = current.dom && current.dom.overlay;
        const plan = buildResultFxPlan(resultDetailOf(result));
        if (!overlay || !plan) return;
        // 强调色跟随当前对话框皮肤（与物品演出同一取色链路）；取不到时卡片用默认色。
        let accent = '';
        try { accent = pickFxAccent(resolveChatTheme(readerSettings.dialogSkin)) || ''; } catch (error) { accent = ''; }
        let played = null;
        try {
            played = playResultFx(overlay, plan, { reducedMotion: prefersReducedMotion(), random: options.random, accent });
        } catch (error) {
            played = null;
        }
        if (played && played.settled) await played.settled;
    }

    async function onOptionBubbleClick(container, rawText, cfg, check = null) {
        hideOptionBubbles(container);
        const text = await resolveOptionSendText(rawText, check);
        if (cfg.clickAction === 'fill') {
            if (state.activeReader && isEmbeddedReaderMode(state.activeReader.mode)) {
                const fill = typeof options.setInputText === 'function'
                    ? options.setInputText
                    : async () => ({ ok: false, reason: 'missing-input-api' });
                const result = await fill(text);
                if (!result || result.ok === false) writeToastSafe(result && result.reason || '酒馆输入框不可用');
            } else if (state.activeReader) {
                state.activeReader.inputValue = text;
                const input = state.activeReader.dom && state.activeReader.dom.input;
                if (input) { input.value = text; if (typeof input.focus === 'function') input.focus(); }
            }
            return;
        }
        await submitReaderInput(text);
    }

    // 界面音效只在阅读器打开时发声，设置读自当前阅读器快照。
    function playReaderUiSfx(kind) {
        const readerSettings = state.activeReader && state.activeReader.snapshot && state.activeReader.snapshot.readerSettings;
        if (readerSettings) playUiSfx(kind, readerSettings);
    }

    function writeToastSafe(message) {
        try { if (state.activeReader) writeToast(message); } catch (error) { /* ignore */ }
    }

    // 插图服务的楼层进度（含写词阶段）：任何楼都点亮生成细线，不再只认当前楼、不弹提示。
    function showIllustrationProgress(payload) {
        if (!payload || payload.messageId == null) return;
        generationStrip.floor(payload.messageId, payload.phase === 'done');
    }

    async function handleReaderAction(action) {
        if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        const normalizedAction = String(action || '').trim();
        if (state.activeReader.titleGate && normalizedAction !== 'settings' && normalizedAction !== 'close') {
            return { ok: false, reason: 'title-screen' };
        }
        state.activeReader.lastAction = normalizedAction;
        if (PROGRESS_NAV_ACTIONS.has(normalizedAction)) armReadingProgress(state.activeReader);

        if (normalizedAction === 'auto-play') {
            const player = state.activeReader.autoPlayer;
            return { ok: true, ...player.toggle() };
        }
        if (normalizedAction === 'generate-assets') {
            return runManualAssetGeneration();
        }
        if (normalizedAction === 'settings') {
            return state.activeReader.controller.openSettings();
        }
        if (normalizedAction === 'hide') {
            return state.activeReader.controller.toggleHidden();
        }
        if (normalizedAction === 'close') {
            return state.activeReader.controller.close();
        }
        // 地点栏 ♪：点音符展开曲名；换一首在当前情绪池里轮到下一首，并保持展开。
        if (normalizedAction === 'bgm-note') {
            const open = toggleBgmNote(state.activeReader.dom?.overlay);
            return open === null ? { ok: false, reason: 'bgm-not-playing' } : { ok: true, expanded: open };
        }
        if (normalizedAction === 'bgm-next') {
            const skipped = skipBgmTrack();
            if (!skipped || !skipped.track) return { ok: false, reason: 'bgm-not-playing' };
            applyBgmNoteToDom(skipped.root, skipped.track, { open: true });
            return { ok: true, track: skipped.track.name };
        }
        if (normalizedAction === 'toggle-record-menu' || ['map', 'diary', 'inventory', 'relationships', 'favor'].includes(normalizedAction)) {
            const current = state.activeReader;
            const hud = current.snapshot?.content?.statusHud;
            const settings = current.snapshot?.readerSettings;
            const overlay = current.dom?.overlay;
            const host = overlay?.querySelector?.('#igs-status-hud');
            const arrow = host?.querySelector?.('.igs-hud-entry-arrow');
            const menu = host?.querySelector?.('#igs-hud-record-menu');
            if (!hud?.enabled || (!hud.character && !hud.location) || settings?.statusHud?.collapsed || !current.toolbarCollapsed
                || overlay?.classList?.contains('igs-options-visible') || !host || !menu || host.classList?.contains('igs-hud-collapsed'))
                return { ok: false, reason: 'record-entry-not-visible' };
            if (normalizedAction === 'toggle-record-menu') {
                if (current.dom.mapController.isOpen() || current.dom.recordController.isOpen()) return { ok: false, reason: 'panel-open' };
                const expanded = menu.hasAttribute('hidden');
                if (expanded) menu.removeAttribute('hidden');
                else menu.setAttribute('hidden', '');
                arrow?.setAttribute('aria-expanded', String(expanded));
                return { ok: true, expanded };
            }
            if (normalizedAction === 'map' && !hud.character && !hud.location) return { ok: false, reason: 'record-entry-not-visible' };
            if (normalizedAction === 'favor' && !(hud.metrics || []).some(metric => /好感/.test(String(metric?.label || '')))) return { ok: false, reason: 'favor-bar-missing' };
            if (current.dom.mapController.isOpen() || current.dom.recordController.isOpen()) return { ok: false, reason: 'panel-open' };
            if (!menu.hasAttribute('hidden')) {
                menu.setAttribute('hidden', '');
                arrow?.setAttribute('aria-expanded', 'false');
                arrow?.focus?.();
            }
            return normalizedAction === 'map'
                ? current.dom.mapController.open(overlay, settings, current.snapshot?.content?.sceneLocation, current.snapshot?.content?.sceneTime, current.snapshot?.content?.sceneWeather)
                : current.dom.recordController.open(overlay, settings, normalizedAction);
        }
        if (normalizedAction === 'toggle-status-hud') {
            return state.activeReader.controller.toggleStatusHud();
        }
        if (normalizedAction === 'toggle-bar') {
            return state.activeReader.controller.toggleToolbar();
        }
        if (normalizedAction === 'prev') {
            return moveReaderSegment(-1);
        }
        if (normalizedAction === 'next') {
            const current = state.activeReader;
            if (cancelTypewriter(current.dom && current.dom.text, { finish: true })) {
                return {
                    ok: true,
                    moved: false,
                    reason: 'typewriter-completed',
                    index: current.index,
                };
            }
            if (advanceChatReveal(current.dom && current.dom.overlay)) {
                return { ok: true, moved: false, reason: 'chat-revealed', index: current.index };
            }
            if (isReaderLastPage(current.snapshot) && handleOptionBubbleBlankClick(current, current.snapshot)) {
                return { ok: true, moved: false, reason: 'option-bubbles-toggled', index: current.index };
            }
            // 读旧楼读到最后一页：接着进下一楼，一路读到最新。
            if (isReaderLastPage(current.snapshot) && Number(current.turnOffset) > 0) return moveReaderTurn(1);
            return moveReaderSegment(1);
        }
        if (normalizedAction === 'first-page') {
            return jumpReaderSegment(0);
        }
        if (normalizedAction === 'last-page') {
            return jumpReaderSegment(Number.MAX_SAFE_INTEGER);
        }
        if (normalizedAction === 'clear-cg') {
            return clearCurrentIllustration();
        }
        if (normalizedAction === 'clear-floor-cg') {
            return clearFloorIllustrations();
        }
        if (normalizedAction === 'reroll-cg') {
            return rerollCurrentIllustration();
        }
        if (normalizedAction === 'cg-gallery') {
            return openCgGallery();
        }
        if (normalizedAction === 'fill-item-images') {
            return runFillItemImages();
        }
        if (normalizedAction === 'tts-replay') {
            return replayTts();
        }
        if (normalizedAction === 'regen') {
            return generateOrRegenerate();
        }
        if (normalizedAction === 'rescan') {
            return reloadActiveReader();
        }
        if (normalizedAction === 'save') {
            return saveCurrentImage();
        }
        if (['prev-turn', 'next-turn'].includes(normalizedAction)) {
            return moveReaderTurn(normalizedAction === 'prev-turn' ? -1 : 1);
        }
        // 工具栏按钮 id 沿用 first-turn（用户的工具栏排序 / 固定记的是 id），功能改为打开目录。
        if (normalizedAction === 'first-turn' || normalizedAction === 'turn-index') {
            return openTurnIndex();
        }
        if (normalizedAction === 'turn-first' || normalizedAction === 'turn-latest') {
            return jumpToPosition({ edge: normalizedAction === 'turn-first' ? 'first' : 'latest' });
        }
        if (normalizedAction === 'resume-reading') {
            return resumeReading();
        }
        if (normalizedAction === 'skip-read') {
            return skipToUnread();
        }
        if (normalizedAction === 'quick-save') {
            const slot = quickSaveReading();
            writeToast(slot ? `已快速存档：${positionLabel(slot)}` : '存档失败');
            return { ok: Boolean(slot), slot };
        }
        if (normalizedAction === 'quick-load') {
            const quick = readingProgress.getQuick();
            if (!quick) { writeToast('还没有快速存档'); return { ok: true, moved: false, reason: 'no-quick-save' }; }
            return jumpToPosition({ pos: quick });
        }
        if (normalizedAction === 'sprite-edit') {
            const overlay = state.activeReader.dom && state.activeReader.dom.overlay;
            if (overlay && !enterCgPortraitEdit(overlay, buildSpriteEditContext()) && !enterCastSlotEdit(overlay, state.activeReader, buildSpriteEditContext())) enterSpriteEditMode(overlay, state.activeReader, buildSpriteEditContext());
            return { ok: true };
        }
        if (normalizedAction === 'db-panel') {
            const db = state.activeReader.dom && state.activeReader.dom.dbController;
            if (db) db.toggle(
                state.activeReader.dom.overlay,
                state.activeReader.snapshot && state.activeReader.snapshot.readerSettings,
            );
            return { ok: true };
        }

        return { ok: false, reason: 'unknown-reader-action', action: normalizedAction };
    }

    function moveReaderSegment(delta) {
        if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        const segments = state.activeReader.snapshot && state.activeReader.snapshot.content
            ? state.activeReader.snapshot.content.segments || []
            : [];
        const maxIndex = Math.max(0, segments.length - 1);
        const nextIndex = Math.max(0, Math.min(maxIndex, Number(state.activeReader.index || 0) + delta));
        if (nextIndex === state.activeReader.index) {
            writeToast(delta > 0 ? '已经是最后一段' : '已经是第一段');
            return {
                ok: true,
                moved: false,
                index: state.activeReader.index,
                progress: state.activeReader.snapshot && state.activeReader.snapshot.content
                    ? state.activeReader.snapshot.content.progress
                    : '',
            };
        }
        state.activeReader.index = nextIndex;
        state.activeReader.autoPlayer?.refresh();
        rerenderActiveReader();
        playReaderUiSfx('page');
        return {
            ok: true,
            moved: true,
            index: state.activeReader.index,
            progress: state.activeReader.snapshot.content.progress,
        };
    }

    function jumpReaderSegment(targetIndex) {
        if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        const segments = state.activeReader.snapshot && state.activeReader.snapshot.content
            ? state.activeReader.snapshot.content.segments || []
            : [];
        const maxIndex = Math.max(0, segments.length - 1);
        const nextIndex = Math.max(0, Math.min(maxIndex, Number(targetIndex) || 0));
        if (nextIndex === state.activeReader.index) {
            return { ok: true, moved: false, index: state.activeReader.index };
        }
        state.activeReader.index = nextIndex;
        state.activeReader.autoPlayer?.refresh();
        rerenderActiveReader();
        return { ok: true, moved: true, index: state.activeReader.index };
    }

    function rerenderActiveReader(optionsForRender = {}) {
        if (!state.activeReader) return { ok: true, reason: 'reader-not-open' };
        // Veridis 等关键词过滤插件在生成结束后异步写回 DOM，用 readLiveVisibleText
        // 拿当前最新渲染文本，确保翻页/重渲染时阅读器反映真实替换后的词。
        const freshVisible = readLiveVisibleText(state.activeReader);
        if (freshVisible) state.activeReader.payload.visibleText = freshVisible;
        // 普通设置保存必须保留当前 reader mode；只有 openMode 设置本身变化时才同步切换。
        // 确保 readerSettings 与立绘位置始终来自同一个 mode，避免 spriteLayouts 取错 key。
        const syncModeFromSettings = optionsForRender.syncModeFromSettings === true;
        const baseSnapshot = resolveRenderConfig(state.activeReader.mode);
        const nextMode = syncModeFromSettings
            ? normalizeReaderMode(
                firstDefined(baseSnapshot.bridge.openMode, state.activeReader.mode),
                baseSnapshot.bridge,
            )
            : normalizeReaderMode(state.activeReader.mode, baseSnapshot.bridge);
        // 模式没变时第二次读取结果完全相同；整份配置克隆 + 整理随素材库变大，翻页时省掉这一遍。
        const unified = nextMode === state.activeReader.mode ? baseSnapshot : resolveRenderConfig(nextMode);
        const readerSettings = normalizeReaderSettings(unified.readerSettings, unified.bridge.vnTheme);
        attachBridgeReaderExtras(readerSettings, unified.bridge);
        const snapshot = buildReaderSnapshot(state.activeReader.payload, nextMode, readerSettings, state.activeReader.index);
        if (!snapshot.content.segments.length) {
            closeReader({ keepSettings: true });
            return { ok: false, reason: 'no-readable-text' };
        }
        state.activeReader.mode = nextMode;
        syncReaderMountForMode(state.activeReader, nextMode);
        state.activeReader.snapshot = snapshot;
        updateMountedReader(snapshot);
        return { ok: true };
    }

    // 切轮只换阅读源，不调用宿主跳楼：/chat-jump 到截断范围外的旧楼会让酒馆把中间楼层全部渲染出来。
    async function moveReaderTurn(delta) {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const getAdjacentMessage = typeof options.getAdjacentMessage === 'function'
            ? options.getAdjacentMessage
            : null;
        const currentMessageId = currentTurnMessageId(current);
        if (currentMessageId == null || !getAdjacentMessage) {
            writeToast('楼层切换需要宿主消息列表。');
            return { ok: true, moved: false, reason: 'turn-switch-host-required' };
        }
        const target = await getAdjacentMessage(currentMessageId, delta);
        if (!target) {
            writeToast(delta > 0 ? '没有下一轮' : '没有上一轮');
            return { ok: true, moved: false, reason: 'turn-not-found', messageId: currentMessageId };
        }
        const nextOffset = Math.max(0, (Number(current.turnOffset) || 0) - Number(delta));
        return openReaderTurn(current, target, nextOffset, delta > 0 ? '已切到下一轮' : '已切到上一轮');
    }

    function currentTurnMessageId(current) {
        return current.contentMessageId != null
            ? current.contentMessageId
            : (current.snapshot && current.snapshot.messageId);
    }

    async function openReaderTurn(current, target, nextOffset, toast) {
        if (typeof options.openViewerFromMessage !== 'function') {
            return { ok: false, reason: 'missing-open-viewer-handler', messageId: target.id };
        }
        // 内嵌：容器留在最新 AI 楼层原地换源；历史轮次只读文字，不收集 provider 图片、不扫不可见 DOM、不开轮询。
        const embedded = isEmbeddedReaderMode(current.mode);
        // 切轮是用户动作：新开的阅读器直接开始记进度，不出续读提示。
        progressRuntime.navigating = true;
        let result;
        try {
            result = await options.openViewerFromMessage(target.id, current.mode, embedded
                ? { startAtEnd: false, message: target, replaceActive: true, skipImageCollection: nextOffset > 0, turnOffset: nextOffset, skipTitle: true }
                : { startAtEnd: false, message: target, skipTitle: true });
        } finally {
            progressRuntime.navigating = false;
        }
        if (result && result.ok !== false) {
            if (!embedded && state.activeReader) state.activeReader.turnOffset = nextOffset;
            if (state.activeReader) armReadingProgress(state.activeReader);
            writeToast(toast);
            return { ok: true, moved: true, messageId: target.id, reader: result.reader };
        }
        return {
            ok: false,
            moved: false,
            reason: result && result.reason || 'turn-open-failed',
            messageId: target.id,
        };
    }

    // ── 阅读进度 ──
    // 只在用户动过（翻页、切轮、跳转）之后才记位置：刚打开停在最新楼不算，否则会把上次的书签冲掉。
    function armReadingProgress(current) {
        if (!current || current.progressArmed) return;
        current.progressArmed = true;
    }

    function noteReadingProgress(current, snapshot) {
        if (!current || !current.progressArmed || current.titleGate) return;
        const content = snapshot && snapshot.content;
        const segments = content && Array.isArray(content.segments) ? content.segments : [];
        const id = Number(currentTurnMessageId(current));
        if (!Number.isInteger(id) || !segments.length) return;
        const page = Math.max(0, Math.min(segments.length - 1, Number(current.index) || 0));
        const key = `${id}:${page}:${segments.length}`;
        if (current.progressNotedKey === key) return;
        current.progressNotedKey = key;
        readingProgress.notePage({
            id,
            page,
            total: segments.length,
            text: segmentText(segments[page]),
            floorText: content.fullText,
            place: content.sceneLocation,
        });
    }

    async function listTurnsSafe() {
        if (typeof options.listTurns !== 'function') return [];
        try {
            const turns = await options.listTurns();
            return Array.isArray(turns) ? turns : [];
        } catch (error) {
            return [];
        }
    }

    // 跳到某楼某页。target：{ id, page } / { edge: 'first'|'latest' } / { pos }（记下的位置：楼没了退到前一楼，按页首指纹找页）。
    // 只换阅读源，不调宿主跳楼。
    async function jumpToPosition(target = {}) {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const turns = await listTurnsSafe();
        if (!turns.length) {
            writeToast('楼层切换需要宿主消息列表。');
            return { ok: true, moved: false, reason: 'turn-switch-host-required' };
        }
        const ids = turns.map((turn) => Number(turn && turn.id));
        const pos = target.pos || null;
        let index = -1;
        let note = '';
        if (pos) {
            const floor = resolvePositionFloor(pos, ids);
            index = floor.index;
            if (floor.reason === 'missing') note = `原来的第 ${pos.id} 楼已不存在，退到第 ${ids[index]} 楼`;
        } else if (target.edge) {
            index = target.edge === 'first' ? 0 : ids.length - 1;
        } else {
            index = ids.indexOf(Number(target.id));
        }
        if (index < 0) {
            writeToast(`没有第 ${target.id} 楼`);
            return { ok: true, moved: false, reason: 'turn-not-found' };
        }
        if (state.activeReader !== current) return { ok: false, reason: 'reader-changed' };
        armReadingProgress(current);
        const targetId = ids[index];
        if (targetId !== Number(currentTurnMessageId(current))) {
            const toast = index === ids.length - 1 ? '已到最新楼' : index === 0 ? '已回到第一楼' : `已跳到第 ${targetId} 楼`;
            const result = await openReaderTurn(current, turns[index], ids.length - 1 - index, toast);
            if (!result.moved) return result;
        }
        const reader = state.activeReader;
        if (!reader) return { ok: false, reason: 'reader-not-open' };
        const content = reader.snapshot && reader.snapshot.content || {};
        let page = Math.max(0, Number(target.page) || 0);
        if (pos && !note) {
            const resolved = resolvePositionPage(pos, content.segments, content.fullText);
            page = resolved.page;
            if (resolved.reason === 'changed') note = `第 ${targetId} 楼内容变了，从第 1 页读`;
            else if (resolved.reason === 'repaged' || resolved.reason === 'clamped') note = '分页变了，已尽量回到原来的位置';
        } else if (pos) {
            page = 0;
        }
        if (page !== reader.index) jumpReaderSegment(page);
        if (pos) writeToast(note || `续读 ${positionLabel({ id: targetId, page: reader.index })}`);
        else if (note) writeToast(note);
        return { ok: true, moved: true, messageId: targetId, page: reader.index };
    }

    // 上次位置之后是否还有没读完的：上次楼到最新楼之前有未读 / 读了一半的楼，或上次就停在最新楼且还没读完、比现在这页靠后。
    function hasUnreadSince(last, ids, currentPage) {
        if (!last || !ids.length) return false;
        const latest = ids[ids.length - 1];
        if (ids.some((id) => id >= last.id && id < latest && readingProgress.floorState(id) !== 'read')) return true;
        return last.id === latest && readingProgress.floorState(latest) !== 'read' && last.page > (Number(currentPage) || 0);
    }

    // 断点续读：上次位置之后还有没读的（unread），或上次是自己翻回旧楼才退出的（back：比读到过的最远处靠前）。
    // 只追最新楼的人两样都不沾，不打扰。
    function resumeKind(last, ids, currentPage) {
        if (!last || !ids.length) return '';
        if (hasUnreadSince(last, ids, currentPage)) return 'unread';
        const far = readingProgress.getFarthest();
        const latest = ids[ids.length - 1];
        return far && ids.includes(last.id) && last.id < latest && last.id < far.id ? 'back' : '';
    }

    // 续读：上次那楼没读完就回原页；已读完就跳到它后面第一处没读的。
    async function resumeReading() {
        const last = readingProgress.getLast();
        if (!last) return { ok: true, moved: false, reason: 'no-bookmark' };
        if (readingProgress.floorState(last.id) === 'read') return skipToUnread(last.id);
        return jumpToPosition({ pos: last });
    }

    // 跳到下一处没读过的地方：从 fromId（默认当前楼）往后找第一页没读的。
    async function skipToUnread(fromId) {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const turns = await listTurnsSafe();
        const ids = turns.map((turn) => Number(turn && turn.id));
        const start = fromId != null && Number.isInteger(Number(fromId)) ? Number(fromId) : Number(currentTurnMessageId(current));
        const partial = readingProgress.load().partial;
        for (const id of ids) {
            if (id < start || readingProgress.floorState(id) === 'read') continue;
            return jumpToPosition({ id, page: partial[id] != null ? partial[id] + 1 : 0 });
        }
        writeToast('后面都读过了');
        return { ok: true, moved: false, reason: 'all-read' };
    }

    function openTurnIndex(tab) {
        const current = state.activeReader;
        const overlay = current && current.dom && current.dom.overlay;
        if (!overlay || !overlay.ownerDocument) return { ok: false, reason: 'reader-not-open' };
        if (turnIndexPanel && turnIndexPanel.isOpen()) return turnIndexPanel.close();
        turnIndexPanel = createTurnIndexPanel(overlay.ownerDocument, {
            progress: readingProgress,
            tab,
            listTurns: listTurnsSafe,
            snippetOf: (turn) => (turn && (turn.visibleText || getMessagePrimaryText(turn.raw || turn))) || '',
            currentId: () => (state.activeReader ? currentTurnMessageId(state.activeReader) : null),
            onJump: (target) => (state.activeReader ? jumpToPosition(target) : null),
            onUnread: () => {
                const far = readingProgress.getFarthest();
                return state.activeReader ? skipToUnread(far ? far.id : 0) : null;
            },
            onSaveSlot: (key) => saveReadingSlot(key),
            onQuickSave: () => quickSaveReading(),
            confirm: (message) => pageModal.confirm(message),
            prompt: (message, value) => pageModal.prompt(message, value),
            getTheme: () => readSettingsTheme(),
            setTheme: (settingsTheme) => saveBridgePatch({ settingsTheme }),
        });
        return turnIndexPanel.open(overlay);
    }

    function currentReadingPosition() {
        const current = state.activeReader;
        const content = current && current.snapshot && current.snapshot.content;
        const segments = content && Array.isArray(content.segments) ? content.segments : [];
        const id = current ? Number(currentTurnMessageId(current)) : NaN;
        if (!Number.isInteger(id) || !segments.length) return null;
        const page = Math.max(0, Math.min(segments.length - 1, Number(current.index) || 0));
        const thumb = [content.illustrationUrl, content.currentImageUrl, content.backgroundImage]
            .find((url) => typeof url === 'string' && /^(https?:|\/|user\/)/.test(url)) || '';
        return { id, page, head: textHead(segmentText(segments[page])), hash: textHash(content.fullText), thumb, place: content.sceneLocation || '' };
    }

    function saveReadingSlot(key) {
        const pos = currentReadingPosition();
        if (!pos) return { ok: false, reason: 'no-position' };
        const result = readingProgress.saveSlot(pos, key ? { key } : {});
        if (result.ok) pushProgressToMetadata();
        return result;
    }

    function quickSaveReading() {
        const pos = currentReadingPosition();
        const slot = pos ? readingProgress.quickSave(pos) : null;
        if (slot) pushProgressToMetadata();
        return slot;
    }

    // 打开阅读器停在最新楼、上次读到别处时弹窗问：回上次那楼，还是留在最新楼。每个聊天每次只问一次。
    async function offerResume(current) {
        const chatId = typeof options.getCurrentChatId === 'function' ? String(options.getCurrentChatId() || '') : '';
        const last = readingProgress.getLast();
        if (!chatId || !last || progressRuntime.offered.has(chatId) || current.titleGate || Number(current.turnOffset) > 0) return;
        if (last.id === Number(currentTurnMessageId(current)) && last.page === current.index) return;
        progressRuntime.offered.add(chatId);
        const ids = (await listTurnsSafe()).map((turn) => Number(turn && turn.id));
        if (state.activeReader !== current || current.progressArmed) return;
        if (!resumeKind(last, ids, current.index)) return;
        const far = readingProgress.getFarthest();
        const unread = far ? ids.filter((id) => id > far.id).length : 0;
        const message = `上次读到 ${positionLabel(last)}${unread ? `，后面还有 ${unread} 楼没读` : ''}。\n接着上次阅读的地方，还是阅读最新一层？`;
        const resume = await pageModal.confirm(message, { okLabel: `续读 ${last.id} 楼`, cancelLabel: '最新一层' });
        if (!resume || state.activeReader !== current || current.progressArmed) return;
        await jumpToPosition({ pos: last });
    }

    function noticeNewFloor() {
        const at = Date.now();
        if (at - progressRuntime.newFloorToastAt < 20000) return;
        progressRuntime.newFloorToastAt = at;
        writeToast('最新楼有更新。正在读旧楼，不打扰你；要看最新请在目录点「最新」');
    }

    function currentChatIdText() {
        return typeof options.getCurrentChatId === 'function' ? String(options.getCurrentChatId() || '') : '';
    }

    // 聊天元数据里的进度每次会话只合并一次（取更新的位置、已读并集、存档位按更新时间）。
    function pullProgressFromMetadata() {
        const chatId = currentChatIdText();
        if (!chatId || progressRuntime.pulled.has(chatId)) return;
        progressRuntime.pulled.add(chatId);
        try {
            const ctx = getSillyTavernContext(options.global || globalThis);
            const saved = ctx && ctx.chatMetadata && ctx.chatMetadata[READING_METADATA_KEY];
            if (saved) {
                readingProgress.importData(saved);
                progressRuntime.pushed.set(chatId, JSON.stringify(saved));
            }
        } catch (error) {
            // 元数据读不到时只用本机进度。
        }
    }

    // 只在真正关闭阅读器或手动存档时写一次，内容没变不写。
    function pushProgressToMetadata() {
        const chatId = currentChatIdText();
        if (!chatId) return;
        try {
            const ctx = getSillyTavernContext(options.global || globalThis);
            if (!ctx || !ctx.chatMetadata || typeof ctx.saveMetadata !== 'function') return;
            const data = readingProgress.exportData();
            const text = JSON.stringify(data);
            if (progressRuntime.pushed.get(chatId) === text) return;
            progressRuntime.pushed.set(chatId, text);
            ctx.chatMetadata[READING_METADATA_KEY] = data;
            Promise.resolve(ctx.saveMetadata()).catch(() => null);
        } catch (error) {
            // 写元数据失败不影响本机进度。
        }
    }

    function formatReaderProgress(snapshot) {
        if (!snapshot || !snapshot.readerSettings || !snapshot.readerSettings.showStatusLine) return '';
        return snapshot && snapshot.content ? snapshot.content.progress : '';
    }

    // 日常演出拍照：合成当前背景与立绘存入相册（CG 库中的照片），失败静默。
    function saveDailyPhoto(photo) {
        const album = options.cgGallery;
        if (!album || typeof album.capturePhoto !== 'function') return;
        const chatId = typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : '';
        Promise.resolve(album.capturePhoto({ ...photo, chatId })).catch(() => null);
    }

    // 亲密演出的恋爱回忆：与日常演出拍照共用相册；同一聊天同一楼层同一名称只存一次（跨阅读器会话，记在 localStorage）。
    function saveRomanceMemory(photo) {
        const album = options.cgGallery;
        if (!album || typeof album.capturePhoto !== 'function' || !photo) return;
        const chatId = typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : '';
        const key = [chatId, photo.messageId, photo.caption].join('|');
        const storage = (options.global || globalThis).localStorage;
        let keys = [];
        try { keys = JSON.parse((storage && storage.getItem(ROMANCE_MEMORY_KEYS)) || '[]'); } catch { keys = []; }
        if (!Array.isArray(keys)) keys = [];
        if (keys.includes(key)) return;
        keys.push(key);
        try { if (storage) storage.setItem(ROMANCE_MEMORY_KEYS, JSON.stringify(keys.slice(-ROMANCE_MEMORY_KEYS_LIMIT))); } catch { /* 存储满时只影响去重 */ }
        Promise.resolve(album.capturePhoto({ ...photo, chatId })).catch(() => null);
    }

    // CG 库面板：只展示 IGS 已出图的 CG；删除二次确认后走 clearIllustration，跳转只限当前聊天。
    function openCgGallery() {
        const current = state.activeReader;
        const overlay = current && current.dom && current.dom.overlay;
        if (!overlay || !overlay.ownerDocument || !options.cgGallery) return { ok: false, reason: 'cg-gallery-unavailable' };
        const panel = createCgGalleryPanel(overlay.ownerDocument, {
            service: options.cgGallery,
            storage: (options.global || globalThis).localStorage,
            getChatId: () => (typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : ''),
            confirm: (message) => pageModal.confirm(message),
            onJump: (entry) => {
                panel.close();
                if (typeof options.jumpToMessage === 'function') {
                    try { options.jumpToMessage(entry.messageId); } catch (error) { /* 跳转失败不影响面板 */ }
                }
            },
        });
        return panel.open(overlay);
    }

    // 手动「补全物品图」：只补表格里缺图的物品；物品图未开启时直接提示，不联网。
    async function runFillItemImages() {
        const service = options.itemImages;
        if (!service || typeof service.fillMissing !== 'function') return { ok: false, reason: 'item-images-unavailable' };
        const result = await service.fillMissing();
        const toast = typeof writeToastSafe === 'function' ? writeToastSafe : () => {};
        if (result && result.reason === 'disabled') toast('物品图未开启，请先在设置里打开');
        else if (result && result.reason === 'nothing-missing') toast('物品都已有图');
        else if (result && result.ok) toast(`已补全 ${result.count} 张物品图`);
        else toast(`物品图补全失败：${(result && result.error) || '未知原因'}`);
        return result;
    }

    async function clearCurrentIllustration() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const content = current.snapshot && current.snapshot.content || {};
        if (!content.illustrationActive || !content.illustrationUrl || !content.illustrationSlot) {
            writeToastSafe('当前页没有可清扫的 CG。');
            return { ok: true, reason: 'no-current-cg', removed: false, rendered: false };
        }
        const service = options.illustrations;
        if (!service || typeof service.clearIllustration !== 'function') {
            writeToastSafe('当前未接入 CG 清扫能力。');
            return { ok: false, reason: 'clear-unavailable', removed: false, rendered: false };
        }
        if (!(await pageModal.confirm('清扫当前这张 CG？正文里对应的挂载点会一起删掉。'))) {
            return { ok: true, reason: 'cancelled', removed: false, rendered: false };
        }
        const messageId = current.contentMessageId != null ? current.contentMessageId : current.payload.messageId;
        const result = await clearCurrentCg({
            identity: { ...(current.illustrationIdentity || {}), messageId },
            slot: content.illustrationSlot,
            url: content.illustrationUrl,
            clear: (query) => service.clearIllustration(query),
            forceRender: () => {
                if (state.activeReader !== current) return { ok: true, reason: 'reader-changed' };
                const rendered = rerenderActiveReader();
                if (rendered && rendered.ok === false) throw new Error(rendered.reason || 'render-failed');
                return rendered;
            },
        });
        if (result.ok) {
            writeToastSafe(result.removed ? '当前 CG 已清扫。' : '当前页没有可清扫的 CG。');
        } else if (result.removed) {
            writeToastSafe('当前 CG 已删除，但界面重绘失败，请重新加载。');
        } else {
            writeToastSafe(`清扫当前 CG 失败：${result.reason || '未知错误'}`);
        }
        return result;
    }

    // 工具栏「绘制 CG」：已有挂载点时确认后重写提示词再出图；没有则补画过场 / NSFW，补不了再重画当前图。
    async function generateOrRegenerate() {
        const service = options.illustrations;
        const hasCg = service && typeof service.processMessage === 'function';
        if (!hasCg) return regenerateCurrentImage();
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const target = readManualFloor(current);
        if (target.floor && /(?:\[igs-img:|<IMG>)/i.test(target.floor.text)) {
            if (!(await pageModal.confirm('重写本楼提示词，并重画全部 CG？原来的图和挂载点都会换掉。'))) {
                return { ok: true, reason: 'cancelled' };
            }
            return runManualIllustration({ reroll: true });
        }
        const cg = await runManualIllustration({ deferSkip: true });
        if (!cg || !cg.skipMessage) return cg;
        const regen = await regenerateCurrentImage();
        if (regen && regen.reason === 'provider-not-enabled') {
            imageNotice('warn', cg.skipMessage);
            return cg;
        }
        return regen;
    }

    async function rerollCurrentIllustration() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const content = current.snapshot && current.snapshot.content || {};
        if (!content.illustrationSlot) {
            writeToastSafe('当前页没有可重画的 CG。');
            return { ok: true, reason: 'no-current-cg' };
        }
        const service = options.illustrations;
        if (!service || typeof service.rerollSlot !== 'function') {
            writeToastSafe('当前未接入单张重画。');
            return { ok: false, reason: 'reroll-unavailable' };
        }
        if (!(await pageModal.confirm('只重画这一张？提示词不变。'))) {
            return { ok: true, reason: 'cancelled' };
        }
        const messageId = current.contentMessageId != null ? current.contentMessageId : current.payload.messageId;
        const identity = current.illustrationIdentity || {};
        if (current.illustrationPending) {
            writeGenerating();
            return { ok: true, reason: 'busy' };
        }
        current.illustrationPending = true;
        writeGenerating();
        try {
            const result = await service.rerollSlot({
                chatId: identity.chatId,
                messageId,
                swipeId: identity.swipeId,
                slot: content.illustrationSlot,
            });
            if (state.activeReader === current) {
                if (!result || result.ok === false) imageNotice('error', `重画失败：${(result && result.error) || '未返回具体原因'}`);
                else if (result.reason === 'not-eligible') imageNotice('warn', '请打开当前聊天最新的非空 AI 楼层');
                else imageNotice('success', '这一张已重画。');
            }
            return result || { ok: false, reason: 'error' };
        } catch (error) {
            if (state.activeReader === current) imageNotice('error', `重画异常：${(error && error.message) || error || '未知错误'}`);
            return { ok: false, reason: 'error' };
        } finally {
            current.illustrationPending = false;
        }
    }

    async function clearFloorIllustrations() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const service = options.illustrations;
        if (!service || typeof service.clearFloorIllustrations !== 'function') {
            writeToastSafe('当前未接入本楼清扫。');
            return { ok: false, reason: 'clear-unavailable' };
        }
        if (!(await pageModal.confirm('清扫本楼全部 CG？正文里的挂载点会一起删掉，不会马上重画。'))) {
            return { ok: true, reason: 'cancelled' };
        }
        const messageId = current.contentMessageId != null ? current.contentMessageId : current.payload.messageId;
        const identity = current.illustrationIdentity || {};
        const result = await service.clearFloorIllustrations({
            chatId: identity.chatId,
            messageId,
            swipeId: identity.swipeId,
        });
        if (state.activeReader === current) {
            rerenderActiveReader();
            if (result && result.ok && result.reason === 'cleared') writeToastSafe('本楼 CG 已清扫。');
            else if (result && result.ok) writeToastSafe('本楼没有可清扫的 CG。');
            else writeToastSafe(`清扫本楼失败：${(result && result.reason) || '未知错误'}`);
        }
        return result || { ok: false, reason: 'error' };
    }

    function readManualFloor(current) {
        const messageId = current.contentMessageId != null ? current.contentMessageId : current.payload.messageId;
        const floor = messageId != null && typeof options.getIllustrationSource === 'function'
            ? options.getIllustrationSource(messageId) : null;
        if (!floor || !floor.isAi || !floor.isLatest || !floor.chatId || !String(floor.text || '').trim()) {
            return { messageId, reason: 'not-eligible', message: '请打开当前聊天最新的非空 AI 楼层' };
        }
        const identity = current.illustrationIdentity;
        if (!identity || floor.chatId !== identity.chatId || floor.swipeId !== identity.swipeId
            || Number(floor.messageId) !== Number(messageId)) {
            return { messageId, reason: 'stale-floor', message: '聊天或回复版本已变化，请重新打开最新楼层' };
        }
        return { messageId, floor };
    }

    // 过场 / NSFW 插图：手动时跳过过场概率，并重试之前失败的张。
    async function runManualIllustration({ deferSkip = false, reroll = false } = {}) {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const feedback = (level, message, generating = false) => {
            if (options.imageJobLog && typeof options.imageJobLog.add === 'function') options.imageJobLog.add(level, message);
            if (state.activeReader !== current) return;
            if (generating) writeGenerating();
            else imageNotice(level, message);
        };
        const skip = (result, message) => {
            if (!deferSkip) {
                feedback('warn', message);
                return result;
            }
            return { ...result, skipMessage: message };
        };
        const service = options.illustrations;
        if (!service || (reroll ? typeof service.rerollFloor !== 'function' : typeof service.processMessage !== 'function')) {
            return skip({ ok: false, reason: 'service-unavailable' }, '插图已跳过：插图服务未就绪');
        }
        const target = readManualFloor(current);
        if (!target.floor) return skip({ ok: true, reason: target.reason }, `插图已跳过：${target.message}`);
        if (current.illustrationPending) {
            feedback('info', '插图处理中，请等待当前任务完成', true);
            return { ok: true, reason: 'busy' };
        }
        current.illustrationPending = true;
        feedback('info', reroll
            ? `第 ${target.messageId} 楼正在重写提示词并重画…`
            : `第 ${target.messageId} 楼插图：正在检查过场 / NSFW 插图…`, true);
        try {
            const result = reroll
                ? await service.rerollFloor(Number(target.messageId))
                : await service.processMessage(Number(target.messageId), { manual: true });
            const skipped = {
                disabled: '请在设置「生图 → 生图内容」开启 NSFW 或过场插图并保存',
                'not-eligible': '当前楼层不是最新的非空 AI 回复',
                'nothing-missing': '本楼插图都已生成',
                'not-selected': (result && result.why) || '本楼不需要插图',
            };
            if (!result || !result.ok) {
                feedback('error', `插图生成失败：${(result && result.error) || '未返回具体原因'}`);
            } else if (skipped[result.reason]) {
                return skip(result, `插图已跳过：${skipped[result.reason]}`);
            } else {
                feedback('success', `插图完成：已生成 ${result.count || 0} 张`);
            }
            return result || { ok: false, reason: 'error' };
        } catch (error) {
            feedback('error', `插图异常：${(error && error.message) || error || '未知错误'}`);
            return { ok: false, reason: 'error' };
        } finally {
            current.illustrationPending = false;
        }
    }

    async function runManualAssetGeneration({ deferSkip = false } = {}) {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const feedback = (level, message, generating = false) => {
            if (options.imageJobLog && typeof options.imageJobLog.add === 'function') options.imageJobLog.add(level, message);
            if (state.activeReader !== current) return;
            if (generating) writeGenerating();
            else imageNotice(level, message);
        };
        // 没有可补全素材时交给重画当前图，这类跳过不必单独提示。
        const skip = (result, message) => {
            if (!deferSkip) {
                feedback('warn', message);
                return result;
            }
            return { ...result, skipMessage: message };
        };
        const service = options.generatedAssets;
        if (!service || typeof service.processMessage !== 'function') {
            feedback('error', '补全素材不可用：素材生成服务未就绪');
            return { ok: false, reason: 'service-unavailable' };
        }
        const target = readManualFloor(current);
        const messageId = target.messageId;
        if (!target.floor) return skip({ ok: true, reason: target.reason }, `补全素材已跳过：${target.message}`);
        if (current.assetGenerationPending) {
            feedback('info', '补全素材处理中，请等待当前任务完成', true);
            return { ok: true, reason: 'busy' };
        }
        current.assetGenerationPending = true;
        feedback('info', `第 ${messageId} 楼补全素材：正在检查未登记的人物和场景…`, true);
        try {
            const result = await service.processMessage(Number(messageId), { manual: true });
            const skipped = {
                disabled: '请在设置中开启自动背景或自动立绘并保存',
                'scene-assets-disabled': '请在设置中开启场景素材并保存',
                'not-eligible': '当前楼层不是最新的非空 AI 回复',
                'nothing-missing': '本楼没有未登记的人物或场景，已登记的素材不会重复生成',
            };
            if (!result || !result.ok) {
                feedback('error', `补全素材失败：${result && result.error || '素材生成失败（未返回具体原因）'}`);
            } else if (result.reason === 'already-decided') {
                feedback('warn', '补全素材已跳过：当前楼层已处理，请等待当前任务完成后重试');
            } else if (skipped[result.reason]) {
                return skip(result || { ok: false, reason: 'error' }, `补全素材已跳过：${skipped[result.reason]}`);
            } else {
                feedback('success', `补全素材完成：已生成 ${result.count || 0} 项素材，待确认`);
            }
            return result || { ok: false, reason: 'error' };
        } catch (error) {
            feedback('error', `补全素材异常：${(error && error.message) || error || '未知错误'}`);
            return { ok: false, reason: 'error' };
        } finally {
            current.assetGenerationPending = false;
        }
    }

    async function regenerateCurrentImage() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        if (typeof options.regenerateImage !== 'function') {
            writeToast('当前未接入图片重画能力。');
            return { ok: false, reason: 'provider-not-enabled' };
        }
        if (current.regenPending) {
            writeGenerating();
            return { ok: false, reason: 'regen-pending' };
        }
        current.regenPending = true;
        const overlay = current.dom && current.dom.root;
        const bgContainer = overlay && overlay.querySelector ? overlay.querySelector('#igs-bg') : null;
        ensureImageLoadingSpinner(bgContainer);
        writeGenerating();
        let result;
        try {
            result = await options.regenerateImage(buildImageActionContext(
                current,
                resolveBridgeConfigSnapshot({ mode: current.mode }),
            ));
        } catch (error) {
            result = { ok: false, reason: error && error.message || 'regen-failed' };
        } finally {
            current.regenPending = false;
            removeImageLoadingSpinner(bgContainer);
        }
        if (state.activeReader !== current) return result;
        if (result && result.ok !== false && result.imageState) {
            current.payload.imageState = cloneData(result.imageState);
            rerenderActiveReader();
        }
        if (result && result.ok !== false) imageNotice('success', '背景图已更新。');
        else imageNotice('error', `重新生图失败：${describeRegenFailure(result && result.reason)}`);
        return result;
    }

    function readLiveVisibleText(current) {
        if (!current) return '';
        const messageId = current.snapshot && current.snapshot.messageId != null
            ? current.snapshot.messageId
            : (current.payload && current.payload.messageId);
        const doc = getRootDocument(options.global);
        let element = null;
        if (doc && messageId != null) {
            element = doc.querySelector(`#chat .mes[mesid="${messageId}"]`)
                || doc.querySelector(`#chat .mes[data-mesid="${messageId}"]`);
        }
        if (!element && current.payload && current.payload.message) {
            element = current.payload.message.element || null;
        }
        if (!element) return '';
        // 取可见正文要深克隆整条消息 DOM，翻页时每次都做代价不小；宿主回写正文必然改变
        // textContent，所以同一节点且 textContent 未变时复用上次结果。
        const fingerprint = typeof element.textContent === 'string' ? element.textContent : null;
        const memo = current.liveTextMemo;
        if (fingerprint !== null && memo && memo.element === element && memo.fingerprint === fingerprint) {
            return memo.text;
        }
        const text = getVisibleMessageTextFromElement(element);
        current.liveTextMemo = fingerprint === null ? null : { element, fingerprint, text };
        return text;
    }

    // 工具栏「重新加载」：清缓存后按当前楼层走完整打开流程重建阅读器，近似插件重载。
    async function reloadActiveReader() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        if (typeof options.openViewerFromMessage !== 'function') return rescanCurrentImages();
        const messageId = isEmbeddedReaderMode(current.mode)
            ? current.mountMessageId
            : current.snapshot && current.snapshot.messageId;
        if (messageId == null) return rescanCurrentImages();
        const keepIndex = isEmbeddedReaderMode(current.mode) && current.turnOffset > 0 ? 0 : current.index;
        sourceCache.invalidate();
        const result = await options.openViewerFromMessage(messageId, current.mode, { startAtEnd: false });
        if (!result || result.ok === false) {
            writeToast('重新加载失败。');
            return result || { ok: false, reason: 'reload-failed' };
        }
        const next = state.activeReader;
        if (next && keepIndex > 0) {
            const segments = next.snapshot && next.snapshot.content ? next.snapshot.content.segments || [] : [];
            next.index = Math.min(keepIndex, Math.max(0, segments.length - 1));
            rerenderActiveReader();
        }
        writeToast('已重新加载。');
        return { ok: true, reloaded: true, messageId };
    }

    async function rescanCurrentImages() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        sourceCache.invalidate();
        if (typeof options.collectMessageImages !== 'function') {
            writeToast('图片收集不可用。');
            return { ok: false, reason: 'collect-not-available' };
        }
        const overlay = current.dom && current.dom.root || (options.global || globalThis).document && (options.global || globalThis).document.querySelector('#igs-overlay');
        const bgContainer = overlay && overlay.querySelector('#igs-bg');
        ensureImageLoadingSpinner(bgContainer);

        const unified = resolveBridgeConfigSnapshot({ mode: current.mode });
        const context = buildImageActionContext(current, unified);
        // 并行：重扫图片 + 重扫正文（用最新 bridge 配置重新解析）。
        const [imageResult] = await Promise.all([
            options.collectMessageImages({
                ...context,
                messageId: current.snapshot && current.snapshot.messageId,
                preferredImageIndex: context.imageIndex,
                skipCache: true,
                requiresMessageScope: Array.isArray(context.imageState && context.imageState.slots)
                    && context.imageState.slots.length > 0,
            }),
            Promise.resolve().then(() => {
                // 重扫正文：把最新筛选/格式化配置写回 payload，并清掉缓存的分段，
                // 让 rerender 时 buildReaderSnapshot 用最新配置重新解析正文。
                current.payload.sourceFilter = unified.bridge.sourceFilter;
                current.payload.virtualRegex = unified.bridge.virtualRegex;
                current.payload.textSegments = null;
                current.payload.segmentImageSlots = null;
                current.payload.sceneDirectives = null;
                // 重抓 DOM 可见文本：关键词过滤插件（如 Veridis）只改 .mes_text 渲染层、
                // 移动端宿主回写 chat[n].mes 滞后时，刷新需拿到最新渲染文本而非打开时的旧快照。
                const freshVisible = readLiveVisibleText(current);
                if (freshVisible) current.payload.visibleText = freshVisible;
            }),
        ]);

        removeImageLoadingSpinner(bgContainer);
        if (!imageResult || imageResult.ok === false) {
            // 图片没扫到也要应用正文重扫并回到第一页。
            current.index = 0;
            rerenderActiveReader();
            writeToast('已刷新正文（未扫描到图片）。');
            return imageResult || { ok: false, reason: 'rescan-failed' };
        }
        const nextBoundCount = countBoundImageSlots(imageResult);
        current.payload.imageState = cloneData(imageResult);
        current.index = 0;
        rerenderActiveReader();
        writeToast(`已刷新：绑定 ${nextBoundCount}/${imageResult.expectedCount || imageResult.count || 0} 张图。`);
        return { ok: true, boundCount: nextBoundCount, imageState: imageResult };
    }

    async function saveCurrentImage() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const context = buildImageActionContext(
            current,
            resolveBridgeConfigSnapshot({ mode: current.mode }),
        );
        const saveImage = typeof options.saveImage === 'function'
            ? options.saveImage
            : async () => ({ ok: false, reason: 'missing-save-handler' });
        const result = await saveImage({
            ...context,
            url: context.currentUrl,
        });
        writeToast(resolveReaderActionToast(result, {
            success: '背景图保存命令已发出。',
            fallback: '当前背景图不可保存。',
        }));
        return result;
    }

    function startReaderImagePolling(current) {
        if (!current || typeof options.collectMessageImages !== 'function') return;
        if (!shouldPollReaderImages(current.snapshot && current.snapshot.content)) return;
        const token = (current.imagePollToken || 0) + 1;
        current.imagePollToken = token;
        current.imagePolling = true;
        pollReaderImages(current, token);
    }

    async function pollReaderImages(current, token) {
        const unified = resolveBridgeConfigSnapshot({ mode: current.mode });
        const imageApi = unified.bridge && unified.bridge.imageApi || {};
        const intervalMs = normalizePollInterval(imageApi.initialPollIntervalMs || imageApi.pollIntervalMs);
        const attempts = normalizePollAttempts(imageApi.initialPollAttempts);
        let previousSignature = String(current.snapshot && current.snapshot.content && current.snapshot.content.imageSignature || '');
        let previousBoundCount = Number(current.snapshot && current.snapshot.content && current.snapshot.content.imageBoundCount || 0) || 0;
        // 只在拿到新的图片地址时重渲染；同一地址反复命中不再整页重绘。
        let previousUrl = '';

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            await waitForReaderImagePoll(intervalMs, options.global);
            if (!state.activeReader || state.activeReader !== current || current.imagePollToken !== token) return;
            const context = buildImageActionContext(current, resolveBridgeConfigSnapshot({ mode: current.mode }));
            const result = await options.collectMessageImages({
                ...context,
                messageId: current.snapshot && current.snapshot.messageId,
                preferredImageIndex: context.imageIndex,
                requiresMessageScope: Array.isArray(context.imageState && context.imageState.slots)
                    && context.imageState.slots.length > 0,
            });
            if (!result || result.ok === false) continue;
            const nextBoundCount = countBoundImageSlots(result);
            const nextSignature = String(result.signature || '');
            const currentUrl = String(result.currentUrl || result.displayUrl || '').trim();
            if (nextSignature !== previousSignature || nextBoundCount > previousBoundCount || (currentUrl && currentUrl !== previousUrl)) {
                current.payload.imageState = cloneData(result);
                rerenderActiveReader();
                previousSignature = nextSignature;
                previousBoundCount = nextBoundCount;
                previousUrl = currentUrl;
                if (!shouldPollReaderImages(current.snapshot && current.snapshot.content)) {
                    current.imagePolling = false;
                    return;
                }
            }
        }
        if (state.activeReader === current && current.imagePollToken === token) {
            current.imagePolling = false;
            rerenderActiveReader();
        }
    }

    function moodAutoTimers() {
        const clock = options.global || globalThis;
        return {
            setTimeout: typeof clock.setTimeout === 'function' ? clock.setTimeout.bind(clock) : globalThis.setTimeout.bind(globalThis),
            clearTimeout: typeof clock.clearTimeout === 'function' ? clock.clearTimeout.bind(clock) : globalThis.clearTimeout.bind(globalThis),
        };
    }

    function moodAutoContext() {
        const draft = state.activeSettings && state.activeSettings.draft && state.activeSettings.draft.bridge;
        if (draft) {
            return {
                enabled: draft.sceneAssets && draft.sceneAssets.moodAutoClassify === true,
                groups: normalizeMoodGroups(draft.sceneAssets && draft.sceneAssets.moodGroups),
                llm: resolveSecondaryLlm(draft.autoIllustration),
            };
        }
        const unified = resolveBridgeConfigSnapshot({ mode: state.activeReader ? state.activeReader.mode : 'default' });
        const assets = unified.bridge && unified.bridge.sceneAssets;
        return {
            enabled: Boolean(assets && assets.moodAutoClassify === true),
            groups: normalizeMoodGroups(assets && assets.moodGroups),
            llm: resolveSecondaryLlm(unified.bridge && unified.bridge.autoIllustration),
        };
    }

    function reportMoodAuto(message) {
        if (state.activeSettings) {
            state.activeSettings.asyncState.moodAutoStatus = message;
            if (!moodAutoDisposed) rerenderSettings();
            return;
        }
        if (message) writeToastSafe(message);
    }

    function commitAutoMoodGroups(nextGroups) {
        if (state.activeSettings && state.activeSettings.draft && state.activeSettings.draft.bridge) {
            const assets = state.activeSettings.draft.bridge.sceneAssets || (state.activeSettings.draft.bridge.sceneAssets = {});
            assets.moodGroups = cloneData(nextGroups);
            return persistSettingsDraft();
        }
        const save = typeof options.saveUnifiedSettings === 'function' ? options.saveUnifiedSettings : null;
        if (!save) return { ok: false, reason: 'missing-save-handler' };
        const unified = resolveBridgeConfigSnapshot({ mode: state.activeReader ? state.activeReader.mode : 'default' });
        unified.bridge.sceneAssets.moodGroups = nextGroups;
        const result = save({
            bridge: unified.bridge,
            readerMode: unified.readerMode,
            readerSettings: unified.readerSettings,
        });
        return result || { ok: false, reason: 'save-failed' };
    }

    function scheduleMoodAutoClassify() {
        if (moodAutoDisposed) return;
        const clock = moodAutoTimers();
        if (moodAutoTimer) clock.clearTimeout(moodAutoTimer);
        moodAutoTimer = clock.setTimeout(() => {
            moodAutoTimer = 0;
            void runMoodAutoClassify();
        }, 280);
    }

    async function runMoodAutoClassify() {
        if (moodAutoDisposed) return;
        if (moodAutoRunning) {
            moodAutoAgain = true;
            return;
        }
        const storage = (options.global || globalThis).localStorage;
        const context = moodAutoContext();
        if (!context.enabled || !storage || typeof options.requestMoodClassification !== 'function') return;
        const labels = context.groups.map((group) => String(group.label || '').trim()).filter(Boolean);
        if (!labels.length) return;
        const pending = loadMoodReview(storage);
        const fresh = [];
        for (const item of pending) {
            const word = String(item && item.word || '').trim();
            if (!word) continue;
            if (resolveMoodGroup(word, context.groups)) removeMoodReview(storage, word);
            else fresh.push(word);
        }
        if (!fresh.length) return;
        const groupsSnapshot = JSON.stringify(context.groups);
        moodAutoRunning = true;
        try {
            const raw = await options.requestMoodClassification(
                buildMoodClassificationRequest(context.groups, fresh),
                context.llm,
            );
            if (moodAutoDisposed) return;
            const live = moodAutoContext();
            if (!live.enabled || JSON.stringify(live.groups) !== groupsSnapshot) {
                moodAutoAgain = true;
                return;
            }
            const results = parseMoodClassification(raw, fresh, labels);
            const still = fresh.filter((word) => loadMoodReview(storage).some((item) => item.word === word));
            if (!still.length) return;
            const kept = new Map([...results].filter(([word]) => still.includes(word)));
            const saved = commitAutoMoodGroups(applyMoodAssignments(live.groups, kept));
            if (!saved || saved.ok === false) {
                reportMoodAuto('归类失败，新情绪仍留在待确认。');
                return;
            }
            for (const word of still) removeMoodReview(storage, word);
            if (state.activeReader) rerenderActiveReader();
            reportMoodAuto(state.activeSettings ? `已归入 ${still.length} 个新情绪。` : `已把 ${still.length} 个新情绪归入情绪组。`);
        } catch {
            if (!moodAutoDisposed) reportMoodAuto('归类失败，新情绪仍留在待确认。');
        } finally {
            moodAutoRunning = false;
            if (moodAutoAgain && !moodAutoDisposed) {
                moodAutoAgain = false;
                scheduleMoodAutoClassify();
            }
        }
    }

    function noteUnlistedMood(spriteHit, mood, sceneAssets) {
        const word = String(mood || '').trim();
        const quality = spriteHit && spriteHit.quality;
        if (!word || !['fuzzy', 'default', 'none'].includes(quality)) return;
        if (resolveMoodGroup(word, sceneAssets.moodGroups)) return;
        const slots = sceneAssets.characters && sceneAssets.characters[spriteHit.character];
        if (slots && Object.prototype.hasOwnProperty.call(slots, word)) return;
        const storage = (options.global || globalThis).localStorage;
        if (!storage) return;
        recordMoodReview(storage, { word, character: spriteHit.character, quality, group: spriteHit.slot });
    }

    // 一楼里的新情绪收成一份，只请求一次副 API。翻页不再逐条请求。
    function noteFloorMoods(messageId, directives, sceneAssets) {
        if (!sceneAssets || sceneAssets.enabled !== true) return;
        const storage = (options.global || globalThis).localStorage;
        if (!storage || !Array.isArray(directives)) return;
        const seen = new Set();
        const words = [];
        for (const directive of directives) {
            if (!directive || (directive.type !== 'char' && directive.type !== 'thought')) continue;
            const word = String(directive.mood || '').trim();
            if (!word || seen.has(word)) continue;
            seen.add(word);
            if (resolveMoodGroup(word, sceneAssets.moodGroups)) continue;
            const character = resolveCharacterKey(sceneAssets.characters, sceneAssets.characterAliases, directive.character) || directive.character;
            const slots = sceneAssets.characters && sceneAssets.characters[character];
            if (slots && Object.prototype.hasOwnProperty.call(slots, word)) continue;
            words.push(word);
            recordMoodReview(storage, { word, character, quality: 'default' });
        }
        if (sceneAssets.moodAutoClassify !== true || !words.length) return;
        const signature = `${messageId}|${words.join('\n')}`;
        if (signature === moodAutoFloorSent) return;
        if (state.activeReader && state.activeReader.streamPhase === 'streaming') {
            moodAutoFloorWaiting = signature;
            return;
        }
        moodAutoFloorSent = signature;
        moodAutoFloorWaiting = '';
        scheduleMoodAutoClassify();
    }

    // 服装栏写了该角色没登记的服装名：记入待确认服装词，供设置页一键归入或新建。
    function noteUnlistedOutfits(directives, sceneAssets) {
        const storage = (options.global || globalThis).localStorage;
        if (!storage) return;
        const resolveOutfit = createOutfitResolver(sceneAssets);
        dropConfirmedOutfitReview(storage, (character, word) => Boolean(resolveOutfit(character, word)));
        const fresh = [];
        for (const d of directives) {
            if (!d || !d.unknownOutfit || !d.character) continue;
            const character = resolveCharacterKey(sceneAssets.characters, sceneAssets.characterAliases, d.character) || d.character;
            if (recordOutfitReview(storage, { character, word: d.unknownOutfit })) fresh.push(`「${character}」的「${d.unknownOutfit}」`);
        }
        if (fresh.length) writeToast(`有新服装待确认：${fresh.join('、')}。到「素材 → 待确认」里归入已有服装或新建。`, 4200);
    }

    function buildReaderSnapshot(payload, mode, readerSettings, index = 0) {
        const scene = cloneData(payload.scene || (payload.render && payload.render.scene) || {});
        const buildStatusHudForSnapshot = (settings, speaker, emotion, sceneInfo, isNarration, outfitFor) => {
            const statusHud = normalizeStatusHudSettings(settings && settings.statusHud);
            if (!statusHud.enabled) return buildStatusHudModel({ settings: statusHud, character: '', emotion: '', location: '' });
            const sceneAssets = (settings && settings._sceneAssets) || {};
            const readResult = statusHud.tables.length ? readStatusHudTables() : null;
            const info = sceneInfo && typeof sceneInfo === 'object' ? sceneInfo : {};
            return withConcreteAvatar(buildStatusHudModel({ settings: statusHud, sceneAssets, character: speaker, emotion, location: info.location, time: info.time, weather: info.weather, isNarration, readResult, outfitFor }));
        };
        const readStatusHudTables = () => {
            const api = (options.global || globalThis).AutoCardUpdaterAPI || null;
            return createShujukuClient(api).readTables();
        };
        const render = payload.render || {};
        const stage = render.stage || {};
        const liveMessage = (payload.message && payload.message.raw) || payload.message || payload.raw || '';
        const parseOptions = {
            sourceFilter: payload.sourceFilter,
            virtualRegex: payload.virtualRegex,
            visibleText: payload.visibleText,
            sceneAssets: readerSettings._sceneAssets,
            sentencePaging: readerSettings._sentencePaging,
        };
        const sourceSignature = buildReaderSourceSignature({
            messageId: payload.messageId,
            rawText: getMessagePrimaryText(liveMessage),
            visibleText: payload.visibleText,
            sourceFilter: payload.sourceFilter,
            virtualRegex: payload.virtualRegex,
            sceneAssetsEnabled: Boolean(readerSettings._sceneAssets && readerSettings._sceneAssets.enabled),
            sentencePaging: Boolean(readerSettings._sentencePaging),
        });
        const cached = sourceCache.get(sourceSignature, { liveMessage, parseOptions });
        const extracted = cached.value || buildIgsTextPayload(liveMessage, parseOptions);
        // A matched exclusion must never be undone by stale scene/payload text.
        const enforceExcludedText = extracted.hasExcludedTextBlocks === true;
        const text = enforceExcludedText ? extracted.formattedText : firstRenderableText(
            scene.text,
            scene.formattedText,
            payload.formattedText,
            extracted.formattedText,
            extracted.visibleText,
            extracted.cleanedRaw,
            getMessagePrimaryText(liveMessage),
            payload.raw,
        );
        // 剥离空台词分段里的 [人名]：前缀后，再判断是否有可见正文。
        const dialogueBody = (value) => {
            const source = String(value == null ? '' : value).trim();
            const match = source.match(/^\[([^\]\n]+)\]\s*[:：]\s*([\s\S]*)$/);
            return match ? match[2].trim() : source;
        };
        const stripWrappingQuotes = (value) => {
            const source = String(value == null ? '' : value).trim();
            if (source.length < 2) return source;
            const pairs = [['“', '”'], ['‘', '’'], ['「', '」'], ['『', '』'], ['"', '"'], ["'", "'"]];
            for (const [open, close] of pairs) {
                if (source.startsWith(open) && source.endsWith(close)) {
                    return source.slice(open.length, source.length - close.length).trim();
                }
            }
            return source;
        };
        const extractedSegments = Array.isArray(extracted.textSegments) ? extracted.textSegments : [];
        const hasExtractedSegments = extractedSegments.some((segment) => String(segment || '').trim());
        let segments = enforceExcludedText
            ? cloneData(extractedSegments)
            : Array.isArray(payload.textSegments) && payload.textSegments.length
            ? cloneData(payload.textSegments)
            : hasExtractedSegments
                ? cloneData(extractedSegments)
                : buildTextSegments(stripSceneDirectiveLines(text));
        // 场景指令可能紧贴正文（如「正文。[igs-scene:…]」），所有分段来源都必须再剥离一次，
        // 否则标签会作为正文渲染进对话框。
        // 剥离后为空的段（场景标签、空台词、不可见格式字符）直接丢弃。
        const visibleSegments = segments
            .map((seg) => stripSceneDirectivesInline(String(seg || '').replace(/[\u200B-\u200C\u2060-\u2064]/g, '')))
            .filter((seg) => {
                const visible = String(seg || '').trim();
                // ZWJ can join emoji: ignore it when deciding if a page is empty, but preserve it in readable text.
                const readable = visible.replace(/\u200D/g, '');
                return readable.length > 0 && (!/^\[[^\]\n]+\]\s*[:：]/.test(readable)
                    || stripWrappingQuotes(dialogueBody(readable)).length > 0);
            });
        segments = visibleSegments.length ? visibleSegments : enforceExcludedText ? [] : [''];

        const normalizedIndex = Math.max(0, Math.min(segments.length - 1, Number(index) || 0));
        const segmentImageSlots = Array.isArray(payload.segmentImageSlots) && payload.segmentImageSlots.length
            ? payload.segmentImageSlots
            : extracted.segmentImageSlots;
        const imageState = normalizeSnapshotImageState(
            payload.imageState,
            resolveSegmentImageIndex({ imageState: payload.imageState, segmentImageSlots }, normalizedIndex),
        );
        const displayImageState = applyImageCountOverride(imageState, readerSettings.imageCountOverride);
        // 分段缺失时给空串：绝不用整篇 text 兜底，否则会凭空多出一页「全文」。
        const currentText = segments[normalizedIndex] == null ? '' : String(segments[normalizedIndex]);
        const htmlCardIndex = parseHtmlCardMarker(currentText);
        const htmlCard = htmlCardIndex >= 0 && Array.isArray(extracted.htmlCards)
            ? String(extracted.htmlCards[htmlCardIndex] || '')
            : '';
        const sceneAssetsEnabled = readerSettings._sceneAssets && readerSettings._sceneAssets.enabled;
        const backgroundImage = firstNonEmptyString(
            displayImageState.displayUrl,
            displayImageState.currentUrl,
            scene.generatedImage && scene.generatedImage.value,
            stage.layers && stage.layers.generated && stage.layers.generated.resource && stage.layers.generated.resource.value,
            stage.layers && stage.layers.background && stage.layers.background.resource && stage.layers.background.resource.url,
            '',
        );
        const sceneAssets = readerSettings._sceneAssets || null;
        const chatIndex = parseChatMarker(currentText);
        const chatBlock = chatIndex >= 0 && Array.isArray(extracted.chats) ? extracted.chats[chatIndex] || null : null;
        const chatSettings = normalizeChatShowSettings(readerSettings.chatShow);
        // AI 把系统角色写成 [igs-msg] 且整段没有真人消息时，不开聊天页，按系统角色旁白显示。
        const systemOnlyChat = Boolean(chatBlock) && chatBlock.messages.every((m) => m.kind !== 'msg' || isSystemRole(m.sender, readerSettings.systemRole));
        const chatPage = Boolean(chatBlock) && chatSettings.enabled && !systemOnlyChat;
        const chatContext = chatPage ? getSillyTavernContext(options.global || globalThis) : null;
        const chat = chatPage ? buildChatPageModel(chatBlock, chatSettings, {
            userName: chatContext && chatContext.name1 ? String(chatContext.name1) : '',
            characterAliases: sceneAssets && sceneAssets.characterAliases,
            theme: resolveChatTheme(readerSettings.dialogSkin),
            systemRole: readerSettings.systemRole,
            avatarFor: (key) => concreteReaderAssetUrl(resolveStatusAvatar(sceneAssets && sceneAssets.statusAvatars, key)),
        }) : null;
        const hideChatSprite = chatPage && chatSettings.hideSprites;
        const generatedAssets = options.generatedAssets || null;
        const resolveGenerated = (url) => (isGeneratedAssetUrl(url)
            ? (generatedAssets ? generatedAssets.resolveUrl(url) : '')
            : (url || ''));
        const assetMatchCtx = {
            sceneAssets,
            generatedAssets: sceneAssets && sceneAssets.generated,
            strict: readerSettings._strictBackgroundMatch === true,
            tempBackground: generatedAssets ? generatedAssets.tempBackground : null,
            tempSceneTime: generatedAssets ? generatedAssets.tempSceneTime : null,
            tempSprite: generatedAssets ? generatedAssets.tempSprite : null,
        };
        const sceneDirectives = Array.isArray(extracted.sceneDirectives) ? extracted.sceneDirectives
            : Array.isArray(payload.sceneDirectives) ? payload.sceneDirectives : [];
        noteFloorMoods(firstDefined(payload.messageId, payload.message && payload.message.id, ''), sceneDirectives, sceneAssets);
        const hasIgsDirectives = sceneDirectives.length > 0;
        let finalBackgroundImage = backgroundImage;
        let finalBackgroundTimed = false;
        const hideSpriteOnNsfw = !normalizeStatusHudSettings(readerSettings && readerSettings.statusHud).showSpriteOnNsfw;
        let spriteImage = null;
        let resolvedSpeaker = scene.speaker || '';
        let spriteCharacter = '';
        let spriteOutfit = '';
        let nsfwCgPortrait = '';
        let castSprites = [];
        let speakerCastOrder = null;
        // 只给「复制本页诊断」用：记下立绘 / 背景这一页实际命中了哪一路。
        let spriteMatch = null;
        let backgroundMatch = null;
        const extractedSegmentImageSlots = Array.isArray(extracted.segmentImageSlots) ? extracted.segmentImageSlots : [];
        const rawSegmentSlotValue = extractedSegmentImageSlots[normalizedIndex];
        const segmentHasBoundSlot = rawSegmentSlotValue != null
            && Number.isFinite(Number(rawSegmentSlotValue))
            && Number(rawSegmentSlotValue) >= 0;
        const slotBoundUrl = segmentHasBoundSlot
            && Array.isArray(displayImageState.slots)
            && displayImageState.slots[Math.floor(Number(rawSegmentSlotValue))]
            ? String(displayImageState.slots[Math.floor(Number(rawSegmentSlotValue))].url || '').trim()
            : '';
        // 场景切换只看 [igs-scene] 标签：直接在原文里定位「当前页正文」，
        // 再取它前方最近的场景标签。不依赖段数、不做偏移累加。
        const sceneSourceForOffset = String(payload.raw || text || '');
        const currentOffset = sceneDirectives.length
            ? locateTextOffsetInSource(sceneSourceForOffset, currentText)
            : -1;
        const inheritedSceneState = payload.inheritedSceneState && payload.inheritedSceneState.scene
            ? { ...payload.inheritedSceneState, lastDirectiveType: 'scene' }
            : null;
        // 本楼正文解析出的场景优先；AI 漏发 [igs-scene:]（本楼可能仍有 char/thought 指令）
        // 时继承 payload.inheritedSceneState——它由 buildReaderPayload 向前最多追溯
        // 3 个 AI 楼层取得，只影响背景/地点栏，不影响立绘与分页归属。
        const ownSceneState = sceneDirectives.length
            ? (currentOffset >= 0
                ? resolveSceneAtSourceOffset(sceneSourceForOffset, currentOffset)
                : resolveSceneStateAtIndex(sceneDirectives, normalizedIndex))
            : null;
        const sceneStateForBg = (ownSceneState && ownSceneState.scene) ? ownSceneState : inheritedSceneState;
        // 恐怖档位：取当前页正文之前最近的 [igs-dread:N]，本楼没有就用向前追溯到的（见 igs-compat）。
        const ownDread = sceneSourceForOffset.indexOf('[igs-dread') === -1 ? null : (() => {
            const offset = currentOffset >= 0 ? currentOffset : locateTextOffsetInSource(sceneSourceForOffset, currentText);
            return findLastDreadLevel(sceneSourceForOffset, offset >= 0 ? offset : undefined);
        })();
        const sceneDread = ownDread !== null ? ownDread : (payload.inheritedDread == null ? null : payload.inheritedDread);
        // 亲密演出的 NSFW 强度曲线与情事阶段（升温 / 顶点 / 余韵）：只在开启且当前页为 NSFW 时，按与当前页相同的规则判定本楼每页是否 NSFW，
        // 得出当前页在 NSFW 连续段中的位置；上一楼层末尾的场景为 NSFW 时视为延续，不再渐强。
        const romanceForSpan = normalizeRomanceFxSettings(readerSettings.romanceFx);
        const nsfwSpan = romanceForSpan.enabled && sceneStateForBg && sceneStateForBg.nsfw
            ? resolveNsfwSpan(segments.map((segment, index) => {
                if (index === normalizedIndex) return true;
                const offset = sceneDirectives.length ? locateTextOffsetInSource(sceneSourceForOffset, segment) : -1;
                const own = sceneDirectives.length
                    ? (offset >= 0 ? resolveSceneAtSourceOffset(sceneSourceForOffset, offset) : resolveSceneStateAtIndex(sceneDirectives, index))
                    : null;
                const pageState = own && own.scene ? own : inheritedSceneState;
                return Boolean(pageState && pageState.nsfw);
            }), normalizedIndex, Boolean(payload.inheritedSceneState && payload.inheritedSceneState.nsfw))
            : null;
        const fxDirectives = extractFxDirectives(sceneSourceForOffset);
        // 对白页正文带「[名字]：」前缀、心里话页另包 *…*，原文里是「名字|表情|对白」：原样定位不到时去掉前缀再定位，否则紧挨对白的演出标签整页失效。
        const locateFxSegment = (segment) => {
            const exact = locateTextOffsetInSource(sceneSourceForOffset, segment);
            return exact >= 0 ? exact : locateTextOffsetInSource(sceneSourceForOffset, stripSegmentSpeaker(segment));
        };
        let fxOffset = !fxDirectives.length ? -1
            : currentOffset >= 0 ? currentOffset : locateFxSegment(currentText);
        let fxPrevOffset = -1;
        // 聊天/卡片占位页在原文中定位不到，向前找最近一个可定位的页作为起点。
        for (let i = normalizedIndex - 1; fxDirectives.length && i >= 0 && fxPrevOffset < 0; i -= 1) {
            fxPrevOffset = locateFxSegment(segments[i]);
        }
        if (fxDirectives.length && fxOffset < 0 && chatIndex >= 0) {
            const chatStart = sceneSourceForOffset.slice(fxPrevOffset + 1).search(/\[igs-(?:chat:|msg:)/);
            if (chatStart >= 0) fxOffset = fxPrevOffset + 1 + chatStart;
        }
        // 战斗演出开启时 payload 才带 battleContext：跨楼继承未结束的战斗，并把上一条用户消息的检定等级套到主角第一招。
        const battleContext = payload.battleContext || null;
        const battleUserName = battleContext ? String((getSillyTavernContext(options.global || globalThis) || {}).name1 || '') : '';
        const pageFx = resolveFxAtPage(
            battleContext ? applyDiceToHits(fxDirectives, battleContext.dice, battleUserName) : fxDirectives,
            fxOffset, fxPrevOffset, battleContext,
        );
        if (battleContext) pageFx.userName = battleUserName;
        decorateItemFx(pageFx, payload, segments, normalizedIndex, fxDirectives, readerSettings);
        // 食物被吃掉 / 喝掉：表格少了食物、AI 写「使用」食物、或本页有进食标签时，角落卡片换成吃掉 / 喝掉。
        const dailyForEat = normalizeDailyFxSettings(readerSettings && readerSettings.dailyFx);
        applyEatToItems(pageFx, { itemOn: normalizeItemFxSettings(readerSettings && readerSettings.itemFx).enabled, eatOn: dailyForEat.enabled && dailyForEat.eat });
        // 约定到期：payload 带近楼约定时（仅「约定」标签开启），按表名含「全局」的表的当前时间判定当天到期项；读不到则不提醒。
        if (Array.isArray(payload.promiseHistory) && payload.promiseHistory.length) {
            const promiseTables = readStatusHudTablesSafe();
            const storyNow = promiseTables && promiseTables.ok !== false ? readStoryNow(parseTables(promiseTables.data)) : null;
            pageFx.promiseDue = resolveDuePromises(payload.promiseHistory, storyNow);
        }
        // 对手立绘：素材模式下按对手名取默认立绘，供遭遇演出与打对手的出招使用；找不到就不显示。
        const battleFoe = pageFx.battle && pageFx.battle.foe;
        if (battleContext && battleFoe && sceneAssets && sceneAssets.enabled) {
            pageFx.foeImage = resolveGenerated(resolveSpriteAsset(battleFoe, '', assetMatchCtx).url) || '';
        }
        // NSFW 页整楼挂图；SFW 页只在事件那几页显示，之后回到背景和立绘。
        const illustrationHit = /(?:\[igs-img:|<IMG>)/i.test(sceneSourceForOffset)
            ? resolveIllustrationForPage({
                source: sceneSourceForOffset,
                offsets: resolveHeldSourceOffsets(sceneSourceForOffset, segments, (segment, from) => {
                    const find = (text) => locateNarrativeOffset(sceneSourceForOffset, text, from, (slice, start) => locateTextOffsetInSource(slice, text, start));
                    const exact = find(segment);
                    return exact >= 0 ? exact : find(stripSegmentSpeaker(segment));
                }),
                segments,
                index: normalizedIndex,
                holdPages: readerSettings && readerSettings.cgHoldPages,
                inheritedNsfw: Boolean(payload.inheritedSceneState && payload.inheritedSceneState.nsfw),
            })
            : null;
        const floorIdentity = state.activeReader && Number(state.activeReader.payload.messageId) === Number(payload.messageId)
            ? state.activeReader.illustrationIdentity
            : readIllustrationIdentity(payload.messageId);
        const illustrationUrl = illustrationHit && typeof options.getIllustrationUrl === 'function'
            ? String(options.getIllustrationUrl({
                chatId: floorIdentity && floorIdentity.chatId,
                messageId: firstDefined(payload.messageId, payload.message && payload.message.id, null),
                swipeId: floorIdentity && floorIdentity.swipeId,
                slot: illustrationHit.slot,
            }) || '')
            : '';
        // 没生成出自己的图时，只用这条标记已经绑上的槽位图（数据库生图）。
        // 不拿未绑定的图、也不拿别的数组位置上的图来顶。
        const boundMarkerUrl = illustrationHit && !illustrationUrl
            ? resolveBoundSlotImageUrl(displayImageState, illustrationHit.slot)
            : '';
        // 这一页挂了 CG。图还没从存储读回来时不要先铺场景背景，否则两张图先后写上同一层，对话框会跟着闪，最后往往只剩背景。
        const cgWaiting = Boolean(illustrationHit) && !illustrationUrl && !boundMarkerUrl;
        if (illustrationUrl) {
            finalBackgroundImage = illustrationUrl;
            spriteImage = null;
            backgroundMatch = { source: 'cg' };
        } else if (boundMarkerUrl) {
            finalBackgroundImage = boundMarkerUrl;
            spriteImage = null;
            backgroundMatch = { source: 'bound-slot' };
        } else if (cgWaiting) {
            finalBackgroundImage = '';
            spriteImage = null;
            backgroundMatch = { source: 'cg' };
        } else if (slotBoundUrl) {
            finalBackgroundImage = slotBoundUrl;
            spriteImage = null;
            backgroundMatch = { source: 'slot' };
        } else if (sceneAssets && sceneAssets.enabled) {
            if (sceneStateForBg && sceneStateForBg.scene) {
                const bgHit = resolveBackgroundAsset(sceneStateForBg, assetMatchCtx);
                backgroundMatch = { source: bgHit.source, quality: bgHit.quality || '' };
                finalBackgroundImage = resolveGenerated(bgHit.url);
                finalBackgroundTimed = Boolean(finalBackgroundImage) && bgHit.timed === true;
            } else {
                finalBackgroundImage = '';
            }
            spriteImage = null;
        }
        const cgActive = Boolean(illustrationUrl || boundMarkerUrl || cgWaiting);
        // Per-segment classification from the formatted segment text itself.
        // Order matters: thought (*...*) is checked before dialogue ([名字]：) because
        // a thought segment looks like *[名字]：...* and would otherwise match dialogue.
        // Fallback: when the prefix was stripped (single-segment messages), use the
        // directive that lands on this exact segment index.
        // 角色台词若被成对引号整体包裹（AI 偶发额外输出中英文引号），前端不渲染引号。
        let textType = 'narration';
        let bubbleSpeaker = '';
        let segmentBody = currentText;
        let bubbleMood = '';
        let spriteMood = '';
        let systemSpeaker = '';
        if (sceneAssetsEnabled) {
            const charThoughtDirectives = sceneDirectives.filter((d) => d.type === 'char' || d.type === 'thought');
            // Match this bubble back to its directive by speaker + dialogue/thought text
            // fingerprint, not by row ordinal. Reformatting (image blocks, italic narration,
            // merged/stripped lines) desyncs any positional counter, so we look the source
            // text up directly. normalizeFingerprint strips the translation tail *（…）*,
            // bilingual 〖…〗 translations, brackets and whitespace so a substring compare is stable.
            const normalizeFingerprint = (s) => stripBilingualTranslation(s)
                .replace(/\*（[^）]*）\*/g, '')
                .replace(/[\[\]\*（）]/g, '')
                .replace(/\s+/g, '')
                .trim();
            // 严格认领：整句相等，或当前段不少于 6 字且是指令原文的片段。
            // 12 字前缀的双向包含会让「……」「嗯。」这类短台词认领以它开头或含它的旁白，只能用于已判定类型的段补情绪。
            const textMatchesDirective = (bodyKey, d) => {
                const src = normalizeFingerprint(d.type === 'thought' ? d.thought : d.dialogue);
                if (!bodyKey || !src) return false;
                return bodyKey === src || (bodyKey.length >= 6 && src.includes(bodyKey));
            };
            const findDirectiveByText = (speaker, body, match = {}) => {
                const bodyKey = normalizeFingerprint(body);
                if (!bodyKey) return null;
                const probe = bodyKey.slice(0, 12);
                const pool = charThoughtDirectives.filter((d) => (!speaker || d.character === speaker)
                    && (!match.type || d.type === match.type));
                for (const d of pool) {
                    if (match.strict) {
                        if (textMatchesDirective(bodyKey, d)) return d;
                        continue;
                    }
                    const src = normalizeFingerprint(d.type === 'thought' ? d.thought : d.dialogue);
                    if (src && (src.includes(probe) || probe.includes(src.slice(0, 12)))) return d;
                }
                return null;
            };
            const classifySegment = (segText) => {
                // 没有任何 [igs-*:] 指令时禁止按文本外形猜测台词/心理话，统一按旁白兜底。
                if (!hasIgsDirectives) return null;
                const seg = String(segText || '');
                const tMatch = seg.match(/^\s*\*\s*(?:\[([^\]]+)\]\s*[:：]\s*)?([\s\S]*?)\s*\*\s*$/);
                const dMatch = seg.match(/^\s*\[([^\]]+)\]\s*[:：]\s*([\s\S]*)$/);
                if (tMatch) {
                    let sp = tMatch[1] ? tMatch[1].trim() : '';
                    // 正文可能写作 **…**（成对双星号），匹配指令前剥掉残留星号。
                    const bodyText = String(tMatch[2] || '').replace(/^\s*\*+\s*/, '').replace(/\s*\*+\s*$/, '').trim();
                    // 无角色名的 *…* 也可能是 AI 的斜体旁白：只有严格对上某条心里话指令才算心理活动。
                    const matched = sp
                        ? findDirectiveByText(sp, bodyText) || findDirectiveByText(sp, tMatch[2])
                        : findDirectiveByText('', bodyText, { strict: true, type: 'thought' });
                    if (!sp && !matched) return null;
                    if (!sp) sp = matched.character || '';
                    return { textType: 'thought', speaker: sp, mood: matched ? (matched.mood || '') : '', body: seg };
                }
                if (dMatch) {
                    const sp = dMatch[1].trim();
                    const matched = findDirectiveByText(sp, dMatch[2]);
                    return { textType: 'dialogue', speaker: sp, mood: matched ? (matched.mood || '') : '', body: stripWrappingQuotes(dMatch[2]) };
                }
                return null;
            };
            const classified = classifySegment(currentText);
            if (classified) {
                textType = classified.textType;
                bubbleSpeaker = classified.speaker;
                bubbleMood = classified.mood;
                segmentBody = classified.body;
            }
            // 兜底：段落缺「[名字]：」前缀（自定义格式化规则等）时找回说话人。
            // 段索引会错位、文本相似度会误认，两条路径都必须严格对上指令原文，旁白页不借用相邻台词。
            if (!bubbleSpeaker) {
                const probeKey = normalizeFingerprint(String(currentText || '')
                    .replace(/^\s*\*+\s*/, '').replace(/\s*\*+\s*$/, '')
                    .replace(/^\s*\[[^\]]+\]\s*[:：]\s*/, ''));
                const segDirective = sceneDirectives.find((d) => Number(d.segmentIndex) === normalizedIndex
                    && (d.type === 'char' || d.type === 'thought') && textMatchesDirective(probeKey, d));
                // 「……」「嗯。」这类短句旁白与台词可能逐字相同，不带段索引佐证时不按文本认领。
                const matchedDirective = segDirective
                    || (probeKey.length >= 6 ? findDirectiveByText('', probeKey, { strict: true }) : null);
                if (globalThis.__IGS_HUD_DEBUG__) console.log('[FB]', JSON.stringify({ cur: String(currentText || '').slice(0, 30), hit: matchedDirective ? matchedDirective.character : null }));
                if (matchedDirective) {
                    textType = matchedDirective.type === 'thought' ? 'thought' : 'dialogue';
                    bubbleSpeaker = matchedDirective.character || scene.speaker;
                    bubbleMood = matchedDirective.mood || '';
                }
            }
            // 系统类角色的台词按独立旁白样式渲染：不显示立绘与状态栏角色，名字按设置决定。
            if (textType === 'dialogue' && isSystemRole(bubbleSpeaker, readerSettings.systemRole)) {
                textType = 'system';
                systemSpeaker = bubbleSpeaker;
                bubbleSpeaker = '';
                bubbleMood = '';
            }
            resolvedSpeaker = bubbleSpeaker;
            // Sprite resolves from the bubble's own speaker/mood, not the row-counted
            // segmentIndex (which desyncs once char/thought tags are reformatted into
            // visible bubble lines). Background still follows directive accumulation.
            let spriteChar = bubbleSpeaker;
            spriteMood = bubbleMood;
            // Narration pages carry no char/thought tag of their own. Walk backwards
            // through prior segments and inherit the nearest one that classifies as a
            // char/thought bubble, so the sprite stays consistent across narration runs.
            if (!spriteChar) {
                for (let i = normalizedIndex - 1; i >= 0; i--) {
                    const prev = classifySegment(segments[i]);
                    if (prev && prev.speaker) {
                        spriteChar = prev.speaker;
                        spriteMood = prev.mood;
                        break;
                    }
                }
            }
            // 回溯也失败时（段落前缀被剥离，文本已不含「[名字]：」）按段索引取 char/thought 指令。
            // 只用于立绘继承，不改 textType，避免把旁白页误判成角色页。
            if (!spriteChar) {
                for (let i = normalizedIndex; i >= 0; i--) {
                    const d = sceneDirectives.find((x) => Number(x.segmentIndex) === i
                        && (x.type === 'char' || x.type === 'thought') && x.character);
                    if (d) {
                        spriteChar = d.character;
                        spriteMood = d.mood || '';
                  break;
                    }
                }
            }
            if (!spriteChar && sceneStateForBg && sceneStateForBg.character) {
                // Fallback for untransformed/legacy paths where the bubble text still
                // carries the raw tag (no reformatted "[名字]：" line to parse).
                spriteChar = sceneStateForBg.character;
                spriteMood = sceneStateForBg.mood || '';
            }
            // NSFW 挂 CG 时对话框左侧的裸体头像：只跟本页自己的说话人（旁白页不继承上一位，直接不显示）。
            if (cgActive && htmlCardIndex < 0 && bubbleSpeaker && sceneStateForBg && sceneStateForBg.nsfw && sceneAssets && sceneAssets.enabled
                && (textType === 'dialogue' || textType === 'thought')
                && normalizeStatusHudSettings(readerSettings.statusHud).nsfwCgPortrait) {
                nsfwCgPortrait = resolveGenerated(resolveNudeSpriteAsset(bubbleSpeaker, bubbleMood, assetMatchCtx).url) || '';
            }
            // HTML 卡片独占舞台前景：不继承上一段角色的立绘，也不发起素材解析。
            if (htmlCardIndex < 0 && !hideChatSprite && !slotBoundUrl && !cgActive && sceneAssets && sceneAssets.enabled && spriteChar && !(sceneStateForBg && sceneStateForBg.nsfw && hideSpriteOnNsfw)) {
                // 服装按当前页在原文中的位置取该角色最近一次服装栏，本楼没写时取跨楼继承，再按表格 / 装备 / DNA 兜底；指令与偏移同源于原文。
                const outfitMap = sceneAssets.characterOutfits;
                // 对白页正文带「[名字]：」前缀，原文里是「名字|表情|服装|对白」，去掉前缀再定位，避免取到整楼最后一条服装。
                const outfitOffset = currentOffset >= 0 ? currentOffset
                    : locateTextOffsetInSource(sceneSourceForOffset, String(currentText || '').replace(/^\s*\[[^\]\n]*\][：:]\s*/, ''));
                const outfitDirectives = extractSceneDirectives(sceneSourceForOffset, { outfitResolver: createOutfitResolver(sceneAssets) }).directives;
                noteUnlistedOutfits(outfitDirectives, sceneAssets);
                const sceneRaw = String((sceneStateForBg && sceneStateForBg.scene) || '').trim();
                const outfitFor = (character) => (outfitMap && Object.keys(outfitMap).length
                    ? resolveSpriteOutfit({
                        directives: outfitDirectives,
                        character,
                        offset: outfitOffset >= 0 ? outfitOffset : Number.NaN,
                        inheritedOutfits: payload.inheritedOutfits,
                        sceneAssets,
                        scene: [classifySceneKey(sceneAssets.scenes, sceneRaw).key || '', sceneRaw],
                        readClues: (names) => collectOutfitClues(readStatusHudTables(), names),
                        resolveDna: (name) => { const hit = resolveCharacterDna(sceneAssets.characterDna, name); return hit ? hit.dna : null; },
                    }).outfit
                    : '');
                const wantedOutfit = outfitFor(spriteChar);
                const spriteHit = resolveSpriteAsset(spriteChar, spriteMood, assetMatchCtx, wantedOutfit);
                spriteMatch = { character: spriteChar, mood: spriteMood || '', outfit: wantedOutfit || '', source: spriteHit.source, quality: spriteHit.quality || '', slot: spriteHit.slot || '' };
                noteUnlistedMood(spriteHit, spriteMood, sceneAssets);
                spriteImage = resolveGenerated(spriteHit.url) || null;
                if (spriteImage) {
                    spriteCharacter = spriteHit.character || spriteChar;
                    spriteOutfit = spriteHit.outfit || '';
                    // Position keys follow the resolved image slot (exact mood / group /
                    // 默认), not the raw mood word, so every mood that maps to the same
                    // sprite image shares one position across pages.
                    spriteMood = spriteHit.slot || spriteMood;
                }
                if (!chatPage && normalizeStageCastSettings(readerSettings.stageCast).enabled) {
                    const castKeyOf = (name) => resolveCharacterKey(sceneAssets.characters, sceneAssets.characterAliases, name) || name;
                    const speakerKey = castKeyOf(spriteChar);
                    // 修罗场：恋爱对象先于最近开口的人入选，保证对象在台上（romanceDuo 关闭时不钉）。
                    const castPin = normalizeStageCastSettings(readerSettings.stageCast).romanceDuo
                        ? resolveRomanceRivalTarget(pageFx, speakerKey, castKeyOf) : '';
                    const cast = resolveStageCast({
                        directives: outfitDirectives,
                        // 定位失败时按页码取最近一条台词重新定位，避免名单整体清空。
                        offset: resolveCastOffset({ offset: outfitOffset, directives: sceneDirectives, segmentIndex: normalizedIndex, locate: (t) => locateTextOffsetInSource(sceneSourceForOffset, t) }),
                        keyOf: castKeyOf,
                        isEligible: (name) => !isNonSpriteSpeaker(name) && !isSystemRole(name, readerSettings.systemRole),
                        limit: STAGE_CAST_SCAN_LIMIT,
                        // 站位「离开」（castStage 开启时）：离开后没再开口的人不进名单，再次开口即回台。
                        goneAt: normalizeStageCastSettings(readerSettings.stageCast).castStage ? pageFx.goneAt : null,
                    });
                    const picked = pickCastMembers(cast, {
                        speakerKey,
                        pin: castPin,
                        seats: STAGE_CAST_MAX_SEATS - (spriteImage ? 1 : 0),
                        resolve: (m) => {
                            const hit = resolveSpriteAsset(m.character, m.mood, assetMatchCtx, outfitFor(m.character));
                            const image = resolveGenerated(hit.url);
                            return image ? { character: hit.character || m.character, mood: hit.slot || m.mood, outfit: hit.outfit || '', image } : null;
                        },
                    });
                    if (spriteImage && picked.speakerOrder != null) speakerCastOrder = picked.speakerOrder;
                    castSprites.push(...picked.members);
                }
            }
        }
        if (systemSpeaker && normalizeSystemRoleSettings(readerSettings.systemRole).showName) resolvedSpeaker = systemSpeaker;
        if (systemOnlyChat) {
            textType = 'system';
            resolvedSpeaker = normalizeSystemRoleSettings(readerSettings.systemRole).showName
                ? (chatBlock.messages.find((m) => m.kind === 'msg') || {}).sender || '' : '';
            bubbleMood = '';
        }
        if (chatPage) {
            textType = 'chat';
            resolvedSpeaker = '';
            bubbleMood = '';
            if (hideChatSprite) spriteImage = null;
            castSprites = [];
            speakerCastOrder = null;
        }
        const statusSceneInfo = {
            location: firstDefined(sceneStateForBg && sceneStateForBg.scene, scene.location, ''),
            time: firstDefined(sceneStateForBg && sceneStateForBg.time, scene.time, ''),
            weather: firstDefined(sceneStateForBg && sceneStateForBg.weather, scene.weather, ''),
        };
        const isDialogueText = textType === 'dialogue' || textType === 'system' || (!sceneAssetsEnabled && Boolean(scene.speaker) && Boolean(currentText));
        const displayText = htmlCardIndex >= 0 || chatPage ? '' : systemOnlyChat ? chatBlock.messages.map((m) => m.text).filter(Boolean).join('\n') : chatBlock ? formatChatBlockAsText(chatBlock) : (!sceneAssetsEnabled && scene.speaker && currentText)
            ? `${scene.speaker}: ${stripWrappingQuotes(currentText)}`
            : (sceneAssetsEnabled
                ? (isDialogueText ? stripWrappingQuotes(segmentBody) : segmentBody)
                : currentText);
        const overlayClasses = ['igs-stage', 'igs-mode-' + mode];
        if (mode === 'pc' || mode === 'mobile') overlayClasses.push('igs-floating');
        if (mode === 'mobile') overlayClasses.push('igs-floating-mobile');
        if (isEmbeddedReaderMode(mode)) overlayClasses.push('igs-embedded-overlay');

        return {
            mode,
            messageId: firstDefined(payload.messageId, payload.message && payload.message.id, scene.messageId, null),
            selectors: Array.from(ORIGINAL_READER_REQUIRED_SELECTORS),
            classes: overlayClasses,
            styles: {
                '#igs-overlay': {
                    zIndex: ORIGINAL_READER_STYLE_CONTRACT.overlayZIndex,
                },
                '.igs-dialog': {
                    width: ORIGINAL_READER_STYLE_CONTRACT.dialogWidth,
                    borderRadius: '8px',
                    padding: '22px 26px 18px',
                },
                '.igs-input': {
                    height: ORIGINAL_READER_STYLE_CONTRACT.inputHeight,
                },
                '.igs-send-btn': {
                    minWidth: ORIGINAL_READER_STYLE_CONTRACT.sendButtonMinWidth,
                },
                '.igs-icon-btn': {
                    width: ORIGINAL_READER_STYLE_CONTRACT.toolbarButtonSize,
                    height: ORIGINAL_READER_STYLE_CONTRACT.toolbarButtonSize,
                },
                '#igs-sprite': {
                    display: spriteImage ? 'block' : 'none',
                },
            },
            content: {
                speaker: resolvedSpeaker,
                spriteCharacter,
                spriteMood,
                spriteOutfit,
                statusEmotion: bubbleMood,
                textType,
                text: currentText,
                fullText: text,
                displayText,
                htmlCard,
                htmlCardPage: htmlCardIndex >= 0,
                chatPage,
                chat,
                fx: pageFx,
                nsfwSpan,
                segments: cloneData(segments),
                currentIndex: normalizedIndex,
                progress: buildProgressText(normalizedIndex, segments.length, displayImageState),
                backgroundImage: finalBackgroundImage,
                backgroundTimed: finalBackgroundTimed,
                spriteImage,
                spriteMatch,
                backgroundMatch,
                castSprites,
                speakerCastOrder,
                images: cloneData(displayImageState.images),
                imageSlots: cloneData(displayImageState.slots),
                unboundImages: cloneData(displayImageState.unboundImages),
                imageCount: displayImageState.count,
                imageExpectedCount: displayImageState.expectedCount,
                imageBoundCount: displayImageState.boundCount,
                imageUnboundCount: displayImageState.unboundCount,
                imageAvailableCount: displayImageState.availableCount,
                imageSignature: displayImageState.signature,
                activeImageIndex: displayImageState.currentIndex,
                currentImageUrl: displayImageState.displayUrl || displayImageState.currentUrl,
                currentSlotImageUrl: displayImageState.slotUrl,
                imageLoading: Boolean(state.activeReader && state.activeReader.imagePolling),
                sourceKind: firstDefined(scene.sourceKind, payload.sourceKind, 'raw-text'),
                warnings: extracted.warnings,
                errors: extracted.errors,
                sceneLocation: statusSceneInfo.location,
                sceneTime: statusSceneInfo.time,
                sceneWeather: statusSceneInfo.weather,
                sceneDread,
                sceneNsfw: Boolean(sceneStateForBg && sceneStateForBg.nsfw),
                illustrationActive: Boolean(illustrationUrl),
                cgActive,
                nsfwCgPortrait,
                illustrationSlot: illustrationHit ? illustrationHit.slot : null,
                illustrationUrl,
                statusHud: buildStatusHudForSnapshot(readerSettings, sceneStateForBg && sceneStateForBg.nsfw ? '' : resolvedSpeaker, sceneStateForBg && sceneStateForBg.nsfw ? '' : bubbleMood, statusSceneInfo, textType === 'narration' || textType === 'thought' || textType === 'chat' || textType === 'system' || Boolean(sceneStateForBg && sceneStateForBg.nsfw && hideSpriteOnNsfw), { character: spriteCharacter, outfit: spriteOutfit }),
            },
            // _sceneAssets 是整份有效素材库，只读不改；跟着整份深拷贝会让翻页随素材库变大而变慢。
            readerSettings: cloneReaderSettingsShallowAssets(readerSettings),
            input: {
                placeholder: '输入内容后按 Enter 发送',
                enterSends: true,
                shiftEnterSends: false,
            },
            html: `<div id="igs-overlay" class="${overlayClasses.join(' ')}" data-igs-igs-ui="true">${getOriginalReaderHtml()}</div>`,
            source: getOriginalReaderSource(options.version || '0.5.4'),
        };
    }

    // 顶部固定工具栏按钮区横向滚动：移动端 overlay 区域吞掉了原生触摸滚动，
    // 故照搬数据库标签栏的 JS 拖拽滚动（pointerdown 起点 → pointermove 改 scrollLeft），
    // 仅在内容溢出时启动，拖动后抑制紧随的 click 避免误触按钮。参照 panel-controller 的标签栏拖拽。
    function installToolbarDragScroll(root, doc) {
        if (!root || !doc || typeof root.addEventListener !== 'function') return;
        let strip = null;
        let active = false;
        let moved = false;
        let startX = 0;
        let startScroll = 0;
        let pointerId = null;
        let captured = false;
        let suppressClick = false;

        root.addEventListener('pointerdown', (event) => {
            const s = event.target && event.target.closest ? event.target.closest('#igs-bar-btns') : null;
            if (!s) return;
            if (s.scrollWidth <= s.clientWidth + 1) return;
            strip = s;
            active = true;
            moved = false;
            startX = Number(event.clientX) || 0;
            startScroll = Number(s.scrollLeft) || 0;
            pointerId = event.pointerId !== undefined ? event.pointerId : null;
            captured = false;
        });
        root.addEventListener('pointermove', (event) => {
            if (!active || !strip) return;
            const dx = (Number(event.clientX) || 0) - startX;
            if (!moved && Math.abs(dx) < 4) return;
            if (!moved) {
                moved = true;
                try {
                    if (pointerId != null && strip.setPointerCapture) {
                        strip.setPointerCapture(pointerId);
                        captured = true;
                    }
                } catch (err) { /* ignore */ }
                strip.classList.add('igs-bar-dragging');
            }
            strip.scrollLeft = startScroll - dx;
            if (event.cancelable) event.preventDefault();
        });
        const end = () => {
            if (!active) return;
            active = false;
            if (strip) {
                try { if (captured && pointerId != null && strip.releasePointerCapture) strip.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
                strip.classList.remove('igs-bar-dragging');
            }
            if (moved) {
                suppressClick = true;
                const win = doc.defaultView || globalThis;
                if (win && typeof win.setTimeout === 'function') win.setTimeout(() => { suppressClick = false; }, 160);
            }
            strip = null;
            pointerId = null;
            captured = false;
        };
        root.addEventListener('pointerup', end);
        root.addEventListener('pointercancel', end);
        // 拖动后抑制紧随的 click（capture 阶段拦在按钮 click 处理之前）。
        root.addEventListener('click', (event) => {
            if (!suppressClick) return;
            suppressClick = false;
            event.stopPropagation();
            event.preventDefault();
        }, true);
    }

    function mountReaderDom(snapshot, controller, payload = {}) {
        const rootDoc = getRootDocument(options.global);
        const messageDoc = isEmbeddedReaderMode(snapshot.mode)
            && payload.message
            && payload.message.element
            && payload.message.element.ownerDocument;
        const doc = messageDoc || rootDoc;
        if (!doc) return null;
        ensureStyleTag(doc, 'igs-overlay-style', getOriginalReaderStyleText());
        const existing = doc.getElementById('igs-overlay');
        if (existing) existing.remove();

        const root = doc.createElement('div');
        const embeddedMount = isEmbeddedReaderMode(snapshot.mode) ? mountEmbeddedRoot(doc, root, payload.message, snapshot.messageId) : null;
        if (!embeddedMount) {
            // 挂到 documentElement 而非 body：宿主移动端把 body 设为 position:fixed 且尺寸受限，
            // 会成为 overlay fixed 定位的包含块，导致 100% 取到 body 尺寸而非视口（阅读器被压成一小块）。
            (doc.documentElement || doc.body).appendChild(root);
        }
        installToolbarDragScroll(root, doc);
        root.addEventListener('click', async (event) => {
            const button = event.target?.closest?.('[data-act]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            const action = button.getAttribute('data-act');
            await controller.invokeAction(action);
        });
        root.addEventListener('keydown', async (event) => {
            if (event.target && event.target.id === 'igs-input') {
                const result = await controller.keydown({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    value: event.target.value,
                });
                if (result.sent) {
                    event.preventDefault();
                }
            }
        });
        const keydownHandler = (event) => {
            if (onboarding.keydown(event)) return;
            if (!state.activeReader) return;
            if (pageModal.isOpen()) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation?.();
                    pageModal.cancel();
                }
                return;
            }
            const mapPanel = state.activeReader.dom?.mapController;
            const recordPanel = state.activeReader.dom?.recordController;
            if (mapPanel?.isOpen() || recordPanel?.isOpen()) {
                if (event.key === 'Escape') {
                    event.preventDefault(); event.stopPropagation?.();
                    if (mapPanel?.isOpen()) mapPanel.close(); else recordPanel.close();
                } else if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.stopPropagation?.();
                return;
            }
            const host = state.activeReader.dom?.overlay?.querySelector?.('#igs-status-hud');
            const menu = host?.querySelector?.('#igs-hud-record-menu');
            if (event.key === 'Escape' && menu && !menu.hasAttribute('hidden')) {
                event.preventDefault(); event.stopPropagation?.();
                menu.setAttribute('hidden', '');
                const arrow = host.querySelector?.('.igs-hud-entry-arrow');
                arrow?.setAttribute('aria-expanded', 'false'); arrow?.focus?.();
                return;
            }
            // Focused controls own their keyboard input; sliders must not turn pages.
            if (event.key !== 'Escape' && event.target?.closest?.('button, input, select, textarea, [role="button"], [role="slider"]')) return;
            const input = state.activeReader.dom && state.activeReader.dom.input;
            if (doc.activeElement === input && event.key !== 'Escape') return;
            if (event.key === 'Escape') {
                event.preventDefault();
                controller.close();
                return;
            }
            if (event.key === 'ArrowRight' || event.key === ' ') {
                event.preventDefault();
                controller.invokeAction('next');
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                controller.invokeAction('prev');
                return;
            }
            // Home 回第一楼，End 到最新楼。
            if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                controller.invokeAction(event.key === 'Home' ? 'turn-first' : 'turn-latest');
                return;
            }
            if (event.key === 'h' || event.key === 'H') {
                event.preventDefault();
                controller.invokeAction('hide');
                return;
            }
            if ((event.key === 't' || event.key === 'T') && !event.ctrlKey && !event.metaKey && !event.altKey) {
                const reader = state.activeReader.snapshot && state.activeReader.snapshot.readerSettings;
                const display = reader ? resolveBilingualDisplay(reader.bilingual, reader._bilingualDisplay) : '';
                if (!display) return;
                event.preventDefault();
                state.bilingualDisplay = { base: normalizeBilingualSettings(reader.bilingual).display, value: nextBilingualDisplay(display) };
                rerenderActiveReader();
            }
        };
        // 内嵌模式：点挂载楼层的小铅笔（.mes_edit）时先关闭阅读器并恢复原文；
        // 捕获阶段执行且不拦截事件，酒馆随后在冒泡阶段照常打开编辑框（编辑框渲染在 .mes_text 内）。
        const hostEditHandler = (event) => {
            const current = state.activeReader;
            const mount = current && current.dom && current.dom.embeddedMount;
            if (!mount || !isEmbeddedReaderMode(current.mode)) return;
            if (!isEmbeddedEditTrigger(event && event.target, mount.mesText)) return;
            const mode = current.mode;
            const messageId = mount.messageId != null ? mount.messageId : current.mountMessageId;
            const closed = closeReader();
            if (closed.ok !== false) armEditReopen(doc, messageId, mode);
        };
        if (typeof doc.addEventListener === 'function') {
            doc.addEventListener('keydown', keydownHandler, true);
            doc.addEventListener('click', hostEditHandler, true);
        }
        const dbController = createDbPanelController(doc, options.global);
        // 资料页只填空草稿：「前往 / 使用」共用同一条非覆盖、不发送的输入框路径。
        const fillRecordDraft = async text => {
            const current = state.activeReader;
            if (!current) return { ok: false, reason: 'reader-not-open' };
            if (isEmbeddedReaderMode(current.mode)) {
                return typeof options.fillEmptyInputText === 'function'
                    ? options.fillEmptyInputText(text)
                    : { ok: false, reason: 'missing-readable-input' };
            }
            const input = current.dom?.input;
            if (!input) return { ok: false, reason: 'missing-reader-input' };
            if (String(input.value ?? '') !== '') return { ok: false, reason: 'draft-not-empty' };
            input.value = text;
            current.inputValue = text;
            input.focus?.();
            return { ok: true };
        };
        const recordController = createRecordPanelController(doc, options.global, fillRecordDraft, {
            // 背包格位图标是用户选择：生图 / SVG；物品图只读本聊天本地缓存。
            getItemIconMode: () => normalizeItemImageSettings(resolveRenderConfig(state.activeReader ? state.activeReader.mode : 'default').bridge.itemImages).inventoryIcon,
            resolveItemImage: (name) => (options.itemImages && typeof options.itemImages.imageUrlFor === 'function' ? options.itemImages.imageUrlFor(name) : ''),
            subscribeItemImages: (handler) => (typeof options.onItemImageUpdated === 'function' ? options.onItemImageUpdated(handler) : null),
            getTheme: () => resolveRenderConfig(state.activeReader ? state.activeReader.mode : 'default').bridge.settingsTheme,
            setTheme: (settingsTheme) => saveBridgePatch({ settingsTheme }),
        });
        const mapController = createMapPanelController(doc, options.global, fillRecordDraft, {
            getChatId: () => {
                const ctx = getSillyTavernContext(options.global || globalThis);
                return ctx && (typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx.chatId) || '';
            },
        });
        const domState = {
            root,
            doc,
            dbController,
            mapController,
            recordController,
            embeddedMount,
            dispose() {
                if (typeof doc.removeEventListener === 'function') {
                    doc.removeEventListener('keydown', keydownHandler, true);
                    doc.removeEventListener('click', hostEditHandler, true);
                }
                mapController.dispose();
                recordController.close();
                dbController.close();
                teardownEmbeddedMount(domState.embeddedMount);
                domState.embeddedMount = null;
            },
        };
        return domState;
    }

    // 酒馆先把正则界面画进 .mes_text。gal 挂在这一层上面，正文从第一句藏到最后一句。
    function mountEmbeddedRoot(doc, root, message, messageId) {
        const element = message && message.element ? message.element : resolveLiveMessageElement(doc, messageId);
        if (!element) return null;
        const resolved = resolveEmbeddedHostParent(element);
        if (!resolved) return null;
        const targetDoc = resolved.mesText.ownerDocument || element.ownerDocument || doc;
        const host = ensureEmbeddedHost(resolved.parent, targetDoc, findEmbeddedHost(targetDoc));
        if (!host) return null;
        if (root.classList) root.classList.add('igs-embedded-root');
        if (root.style) {
            root.style.width = '100%';
            root.style.height = '100%';
            root.style.position = 'relative';
            root.style.overflow = 'hidden';
        }
        host.appendChild(root);
        hideMountedStory(resolved.mesText, message);
        return { host, mesText: resolved.mesText, messageId, root };
    }

    function hideMountedStory(mesText, message) {
        const reader = state.activeReader;
        const messageId = message && message.id != null
            ? message.id
            : (reader && (reader.mountMessageId != null ? reader.mountMessageId : reader.payload && reader.payload.messageId));
        const floor = messageId != null && typeof options.getIllustrationSource === 'function'
            ? options.getIllustrationSource(messageId) : null;
        const raw = (floor && floor.text)
            || getMessagePrimaryText(message)
            || getMessagePrimaryText(reader && reader.payload && reader.payload.raw)
            || '';
        const tags = reader && reader.sourceFilter && reader.sourceFilter.textIncludeTags;
        const lines = storyLines(raw, tags || 'content');
        // 只藏故事片段；片段定位不到（原文与渲染不一致、宿主缺 Range 等）时整段藏起，避免正文与阅读器重复显示。
        if (lines.length && hideStorySpan(mesText, lines)) {
            if (mesText && typeof mesText.getAttribute === 'function' && mesText.getAttribute('data-igs-embedded-hidden') === '1') restoreEmbeddedSourceText(mesText);
            return;
        }
        hideEmbeddedSourceText(mesText);
    }

    // 酒馆重画 .mes_text（生图写回、铅笔保存）会丢掉藏好的正文。楼层还在就再藏一次。
    function keepEmbeddedStoryHidden() {
        const current = state.activeReader;
        if (!current || !isEmbeddedReaderMode(current.mode) || !current.dom) return;
        const doc = resolveEmbeddedDocument(current);
        const messageId = current.mountMessageId != null
            ? current.mountMessageId
            : (current.payload && current.payload.messageId);
        const element = resolveLiveMessageElement(doc, messageId);
        if (!element) return;
        const resolved = resolveEmbeddedHostParent(element);
        if (!resolved) return;
        const mount = current.dom.embeddedMount;
        const host = mount && mount.host;
        if (!host || host.parentNode !== resolved.parent) {
            syncEmbeddedReaderMount(current, { id: messageId, element });
            return;
        }
        if (mount.mesText !== resolved.mesText) mount.mesText = resolved.mesText;
        if (isStoryHidden(resolved.mesText)) return;
        hideMountedStory(resolved.mesText, { id: messageId, element });
    }

    function scheduleEmbeddedStoryHide() {
        if (embeddedStoryTimer != null) return;
        const globalObject = options.global || globalThis;
        const setter = typeof globalObject.setTimeout === 'function' ? globalObject.setTimeout.bind(globalObject) : setTimeout;
        embeddedStoryTimer = setter(() => {
            embeddedStoryTimer = null;
            keepEmbeddedStoryHidden();
        }, 0);
    }

    function stopEmbeddedStoryWatch() {
        const globalObject = options.global || globalThis;
        const clearer = typeof globalObject.clearTimeout === 'function' ? globalObject.clearTimeout.bind(globalObject) : clearTimeout;
        if (embeddedStoryTimer != null) clearer(embeddedStoryTimer);
        embeddedStoryTimer = null;
        if (embeddedStoryObserver && typeof embeddedStoryObserver.disconnect === 'function') embeddedStoryObserver.disconnect();
        embeddedStoryObserver = null;
    }

    function startEmbeddedStoryWatch() {
        stopEmbeddedStoryWatch();
        const doc = getRootDocument(options.global);
        const chat = doc && typeof doc.querySelector === 'function' ? doc.querySelector('#chat') : null;
        const view = doc && doc.defaultView;
        const Ctor = (options.global && options.global.MutationObserver)
            || (view && view.MutationObserver)
            || (typeof MutationObserver === 'function' ? MutationObserver : null);
        if (!Ctor || !chat) return;
        embeddedStoryObserver = new Ctor((records) => {
            const external = Array.isArray(records) && records.some((record) => {
                const target = record && record.target;
                if (target && target.closest && target.closest('[data-igs-internal-reader="1"]')) return false;
                return true;
            });
            if (external) scheduleEmbeddedStoryHide();
        });
        try {
            embeddedStoryObserver.observe(chat, { childList: true, subtree: true });
        } catch (error) {
            embeddedStoryObserver = null;
        }
    }

    function teardownEmbeddedMount(mount) {
        if (!mount) return;
        restoreStorySpan(mount.mesText);
        restoreEmbeddedSourceText(mount.mesText);
        if (mount.root && mount.root.classList) mount.root.classList.remove('igs-embedded-root');
        if (mount.root && mount.root.style) {
            mount.root.style.width = '';
            mount.root.style.height = '';
            mount.root.style.position = '';
            mount.root.style.overflow = '';
        }
        if (mount.host && typeof mount.host.remove === 'function') mount.host.remove();
    }

    // 点小铅笔关闭内嵌阅读器后，等该楼层编辑框的「完成 / 取消」再按原模式重开；
    // 只等一次；期间阅读器已被其他入口打开、宿主销毁或未注入重开回调时不重开。
    function armEditReopen(doc, messageId, mode) {
        disarmEditReopen();
        if (!doc || typeof doc.addEventListener !== 'function' || typeof options.reopenReader !== 'function') return;
        const root = options.global && typeof options.global.setTimeout === 'function' ? options.global : globalThis;
        const handler = (event) => {
            const finish = resolveHostEditFinish(event && event.target, messageId);
            if (!finish) return;
            disarmEditReopen();
            // 稍等片刻，让酒馆先写回楼层并重渲染，再重新读取最新楼层。
            const timer = root.setTimeout(() => {
                if (state.editReopen && state.editReopen.timer === timer) state.editReopen = null;
                if (state.activeReader) return;
                Promise.resolve()
                    .then(() => options.reopenReader(mode))
                    .catch((error) => console.warn('[IGS] 编辑后重开阅读器失败', error));
            }, 150);
            state.editReopen = { timer, clear: () => root.clearTimeout(timer) };
        };
        doc.addEventListener('click', handler, true);
        state.editReopen = { clear: () => doc.removeEventListener('click', handler, true) };
    }

    function disarmEditReopen() {
        const pending = state.editReopen;
        state.editReopen = null;
        if (pending && typeof pending.clear === 'function') pending.clear();
    }

    function resolveLiveMessageElement(doc, messageId) {
        if (doc && messageId != null && typeof doc.querySelector === 'function') {
            const found = doc.querySelector(`#chat .mes[mesid="${messageId}"]`)
                || doc.querySelector(`#chat .mes[data-mesid="${messageId}"]`);
            if (found) return found;
        }
        const message = state.activeReader && state.activeReader.payload && state.activeReader.payload.message;
        return message && message.element ? message.element : null;
    }

    function updateMountedReader(snapshot) {
        const current = state.activeReader;
        if (!current) return;
        warmActiveFloorImages(snapshot);
        current.autoPlayer?.setSpeed(snapshot.readerSettings?.typewriter?.speed);
        noteReadingProgress(current, snapshot);
        if (!current.dom || !current.dom.root) return;
        generationStripRemount = true;
        const refs = hydrateReaderMount(current.dom.root, snapshot);
        current.dom.overlay = refs.overlay;
        current.dom.dialog = refs.dialog;
        current.dom.input = refs.input;
        current.dom.sendButton = refs.sendButton;
        current.dom.toast = refs.toast;
        current.dom.clickLayer = refs.clickLayer;
        current.dom.text = refs.text;
        current.dom.progress = refs.progress;
        if (current.titleGate) {
            // 主界面盖着时正文不渲染：不打字、不放演出和音效，点「开始」后才从第一页演起。
            const titleOn = !snapshot.readerSettings || snapshot.readerSettings.titleScreen !== false;
            if (titleOn && Number(snapshot.content && snapshot.content.currentIndex) === 0) {
                renderTitleGate(current);
                return;
            }
            dropTitleGate(current);
        }
        if (current.dom.overlay) applyReaderSnapshotToDom(current.dom.overlay, snapshot, current, {
            hasActiveSettings: () => Boolean(state.activeSettings),
            closeSettings,
            handleReaderAction,
            handleBlankClick: () => handleOptionBubbleBlankClick(current, snapshot),
            isActiveReader: (reader) => state.activeReader === reader,
            closeReader,
            resolveAssetUrl: (url) => resolveReaderAssetUrl(url, current),
            // 获得物品演出：只读本聊天物品图本地缓存。
            resolveItemImage: (name) => (options.itemImages && typeof options.itemImages.imageUrlFor === 'function' ? options.itemImages.imageUrlFor(name) : ''),
            chatId: typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : '',
            // 用户角色名：直播主播名与之相同时自动切主播视角；用 getter 跟随切换角色。
            get userName() { return String((getSillyTavernContext(options.global || globalThis) || {}).name1 || ''); },
            onDailyPhoto: saveDailyPhoto,
            onRomanceMemory: saveRomanceMemory,
            onCgPortraitMove: (statusHud) => saveReaderSettingsPatch({ statusHud }),
        });
        if (current.dom.progress) {
            const progressText = formatReaderProgress(snapshot);
            current.dom.progress.textContent = progressText;
            current.dom.progress.style.display = progressText ? 'block' : 'none';
        }
        syncOptionBubblesAfterRender(current, snapshot);
        syncAssetReviewAfterRender(current, snapshot);
        if (generationStripRemount) { generationStripRemount = false; generationStrip.remount(); }
    }

    // 第 0 层之后有没有 AI 楼层：决定「开始」先进世界观页还是直接重播，以及出不出「继续」。
    async function resolveTitleHasLater(current) {
        let hasLater = false;
        if (typeof options.getAdjacentMessage === 'function') {
            try {
                hasLater = Boolean(await options.getAdjacentMessage(0, 1));
            } catch (error) {
                hasLater = false;
            }
        }
        if (state.activeReader !== current || !current.titleGate) return;
        current.titleGate = { ...current.titleGate, hasLater };
        renderTitleGate(current);
    }

    function titleModelOf(current) {
        return buildTitleScreenModel({
            snapshot: current.snapshot,
            gate: current.titleGate,
            card: titleCardOf(getSillyTavernContext(options.global || globalThis)),
            userName: (getSillyTavernContext(options.global || globalThis) || {}).name1 || '',
            globalSkin: resolveBridgeConfigSnapshot({ mode: current.mode }).readerSettings.dialogSkin,
            resolveUrl: (url) => resolveReaderAssetUrl(url, current),
        });
    }

    function renderTitleGate(current) {
        const overlay = current && current.dom && current.dom.overlay;
        if (!overlay || !current.titleGate || current.titleGate.view === 'opening') return;
        const snapshot = current.snapshot;
        const model = titleModelOf(current);
        // 世界观页底部是所选皮肤的真对话框：先按正在选的皮肤挂样式，确认前不写设置。
        applyTitleSkin(overlay, model.view === 'worldview' ? { ...snapshot.readerSettings, dialogSkin: model.pick.skin } : snapshot.readerSettings);
        pinEmbeddedHostFrame(overlay, snapshot.readerSettings && snapshot.readerSettings._cgBackgroundSize, snapshot.mode);
        renderTitleScreen(overlay, model, {
            onAction: (act, value) => { void handleTitleAction(current, act, value); },
        });
        playTitleBgm(overlay, snapshot);
    }

    function dropTitleGate(current) {
        if (!current) return;
        current.titleGate = null;
        if (current.dom && current.dom.overlay) removeTitleScreen(current.dom.overlay);
    }

    async function handleTitleAction(current, act, value) {
        if (state.activeReader !== current || !current.titleGate || current.titleGate.view === 'opening') return;
        const next = reduceTitleAction(current.titleGate, titleModelOf(current), act, value);
        current.titleGate = next.gate;
        if (next.effect === 'close') return current.controller.close();
        if (next.effect === 'settings') return current.controller.openSettings();
        if (next.effect === 'user-char') return generateUserCharFromTitle(current);
        if (next.effect === 'continue') return continueFromTitle(current);
        if (next.effect === 'start') return playOpeningFromTitle(current);
        if (next.effect === 'save' || next.effect === 'save-start') {
            const saved = saveTitlePick(next.pick);
            if (!saved || saved.ok === false) {
                writeToast('世界风格没有保存成功，请稍后再试。');
                renderTitleGate(current);
                return saved;
            }
            current.snapshot = applyReaderPayloadToState(current, current.mode, { index: 0 });
            if (next.effect === 'save-start') return playOpeningFromTitle(current);
            current.titleGate = { ...current.titleGate, view: 'menu', pick: null };
            updateMountedReader(current.snapshot);
            return saved;
        }
        renderTitleGate(current);
        return null;
    }

    // 主菜单「生成主角立绘」：打开设置的角色页，走和「＋ › 用酒馆用户设定生成主角」同一个动作，进度和结果都在那里看；关掉设置回到主菜单。
    async function generateUserCharFromTitle(current) {
        openSettings({ tab: 'scene', mode: current.mode });
        const settings = state.activeSettings;
        if (!settings || !settings.controller || typeof settings.controller.invoke !== 'function') return { ok: false, reason: 'settings-not-open' };
        settings.asyncState.sceneSubTab = 'characters';
        rerenderSettings();
        return settings.controller.invoke('scene-add-user-char');
    }

    async function continueFromTitle(current) {
        dropTitleGate(current);
        // 上次位置之后还有没读完的楼时「继续」接着读；上次是翻回旧楼才退出的就回那一页；已经追平最新就照旧打开最新楼。
        const last = readingProgress.getLast();
        const kind = last ? resumeKind(last, (await listTurnsSafe()).map((turn) => Number(turn && turn.id)), 0) : '';
        if (kind) {
            try {
                const resumed = kind === 'back' ? await jumpToPosition({ pos: last }) : await resumeReading();
                if (resumed && resumed.ok !== false && resumed.moved !== false) return resumed;
            } catch (error) {
                // 续读失败时退回打开最新楼。
            }
        }
        if (typeof options.reopenReader === 'function') {
            try {
                const reopened = await options.reopenReader(current.mode);
                if (reopened && reopened.ok !== false) return reopened;
            } catch (error) {
                // 打开最新楼层失败时退回从第 0 层开始演。
            }
        }
        if (state.activeReader === current) updateMountedReader(current.snapshot);
        return null;
    }

    // 开场标题卡（序章 · 卡名）点一下或到时收起，再从第一页演出第 0 层；地点卡仍由第 0 层自己的过场标题卡出。
    async function playOpeningFromTitle(current) {
        const overlay = current.dom && current.dom.overlay;
        current.titleGate = { ...current.titleGate, view: 'opening' };
        if (overlay) {
            const readerSettings = current.snapshot.readerSettings;
            const timers = options.autoPlayTimers || globalThis;
            applyTitleSkin(overlay, readerSettings);
            await playOpeningCard(overlay, {
                main: '序章',
                sub: titleCardOf(getSillyTavernContext(options.global || globalThis)).name,
                worldview: readerSettings && readerSettings._worldview,
                schedule: (fn, ms) => timers.setTimeout(fn, ms),
            });
        }
        if (state.activeReader !== current) return null;
        dropTitleGate(current);
        current.index = 0;
        current.snapshot = applyReaderPayloadToState(current, current.mode, { index: 0 });
        updateMountedReader(current.snapshot);
        return { ok: true };
    }

    // 有角色卡（或群聊）时世界观与对话框皮肤记在卡上；没有卡时世界观写全局素材、皮肤写阅读器设置。
    function saveTitlePick(pick) {
        if (!pick) return { ok: false, reason: 'no-pick' };
        const scope = resolveAssetScope(getSillyTavernContext(options.global || globalThis));
        if (scope.key) {
            return mutateSceneLibrary((assets) => {
                if (!applyWorldview(assets, pick.worldview)) return { ok: false, reason: 'invalid-worldview' };
                assets.dialogSkin = pick.skin;
                return { ok: true };
            });
        }
        const save = typeof options.saveUnifiedSettings === 'function' ? options.saveUnifiedSettings : null;
        if (!save) return { ok: false, reason: 'missing-save-handler' };
        const unified = resolveBridgeConfigSnapshot({ mode: state.activeReader ? state.activeReader.mode : 'default' });
        const sceneAssets = { ...(unified.bridge.sceneAssets || {}) };
        if (!applyWorldview(sceneAssets, pick.worldview)) return { ok: false, reason: 'invalid-worldview' };
        return save({
            bridge: { ...unified.bridge, sceneAssets },
            readerMode: unified.readerMode,
            readerSettings: { ...unified.readerSettings, dialogSkin: pick.skin },
        }) || { ok: false, reason: 'save-failed' };
    }

    function currentFloorKey(current) {
        const identity = current && current.illustrationIdentity;
        const messageId = current && (current.contentMessageId != null
            ? current.contentMessageId
            : current.snapshot && current.snapshot.messageId);
        if (!identity || !identity.chatId || messageId == null) return '';
        return floorKeyOf({ chatId: identity.chatId, messageId, swipeId: identity.swipeId });
    }

    function syncAssetReviewAfterRender(current, snapshot) {
        const overlay = current && current.dom && current.dom.overlay;
        const service = options.generatedAssets;
        if (!overlay || !overlay.querySelector || !service || typeof service.listReview !== 'function') return;
        let container = overlay.querySelector('#igs-asset-review');
        const floorKey = currentFloorKey(current);
        const items = floorKey && isReaderLastPage(snapshot)
            ? service.listReview(floorKey)
            : [];
        if (!items.length) {
            if (container) container.setAttribute('hidden', '');
            return;
        }
        if (!container) {
            container = overlay.ownerDocument.createElement('div');
            container.id = 'igs-asset-review';
            container.addEventListener('click', (event) => event.stopPropagation());
            overlay.appendChild(container);
        }
        renderAssetReviewPanel(container, items.map((item) => ({
            ...item,
            previewUrl: typeof service.resolveUrl === 'function' ? service.resolveUrl(item.url) : item.url,
        })), {
            onResolve: (item, status, name) => { void resolveGeneratedReview(item, status, name); },
        });
    }

    function mutateSceneLibrary(mutator) {
        if (state.activeSettings) {
            rememberAssetScope(state.activeSettings, getSillyTavernContext(options.global || globalThis));
            const sceneAssets = draftAssetLibrary(state.activeSettings);
            const result = mutator(sceneAssets);
            if (!result || result.ok === false) return result || { ok: false };
            const persisted = persistSettingsDraft();
            if (persisted.ok !== false) rerenderSettings();
            return persisted.ok === false ? persisted : result;
        }
        let result = null;
        const saved = saveBridgePatch((bridge) => {
            const root = bridge.sceneAssets = bridge.sceneAssets || {};
            const scope = resolveAssetScope(getSillyTavernContext(options.global || globalThis));
            relocateLegacyCard(root, scope.key, scope.legacyKey);
            const bucket = scope.key ? ensureCardLibrary(root, scope.key) : root;
            result = mutator(bucket);
            if (!result || result.ok === false) return null;
            return { sceneAssets: root };
        });
        if (!result || result.ok === false) return saved.reason === 'missing-save-handler' ? saved : (result || { ok: false });
        return saved && saved.ok !== false ? result : (saved || { ok: false, reason: 'save-failed' });
    }

    // 设置面板未打开时直接改存档里的 bridge；patch 返回 null 表示放弃保存。
    function saveBridgePatch(buildPatch) {
        const save = typeof options.saveUnifiedSettings === 'function' ? options.saveUnifiedSettings : null;
        if (!save) return { ok: false, reason: 'missing-save-handler' };
        const unified = resolveBridgeConfigSnapshot({ mode: state.activeReader ? state.activeReader.mode : 'default' });
        const patch = typeof buildPatch === 'function' ? buildPatch(unified.bridge) : buildPatch;
        if (!patch) return { ok: false, reason: 'no-change' };
        return save({ bridge: { ...unified.bridge, ...patch }, readerMode: unified.readerMode, readerSettings: unified.readerSettings })
            || { ok: false, reason: 'save-failed' };
    }

    async function resolveGeneratedReview(item, status, name) {
        const service = options.generatedAssets;
        if (!service || !item) return;
        // 「加入素材库并编辑 DNA」= 先按普通入库处理，成功后再打开 DNA 候选确认；候选不自动写入。
        const withDna = status === 'library-dna' && item.type === 'sprite';
        if (status === 'library-dna') status = 'library';
        let addedName = '';
        if (status === 'library' && item.type === 'background') {
            const added = mutateSceneLibrary((assets) => {
                const bound = bindGeneratedBackground(assets, item, name || item.name);
                if (!bound.ok) return bound;
                assets.scenes = bound.scenes;
                return bound;
            });
            if (!added || added.ok === false) {
                writeToastSafe('加入场景素材失败：名称不能为空');
                return;
            }
            addedName = added.name;
            writeToastSafe(`已放入场景素材「${added.name}」`);
        } else if (status === 'library') {
            const added = mutateSceneLibrary((assets) => {
                const bound = bindGeneratedSprite(assets, name || item.name, item.imageId ? `igs-gen:${item.imageId}` : '', { replace: true });
                if (!bound.ok) return bound;
                assets.characters = bound.characters;
                assets.characterAliases = bound.characterAliases;
                return bound;
            });
            if (!added || added.ok === false) {
                writeToastSafe('放入角色立绘失败：名称不能为空');
                return;
            }
            addedName = added.name;
            writeToastSafe(`已放入角色立绘「${added.name}」`);
        }
        if (typeof service.setStatus === 'function') await service.setStatus(item.key, status);
        if (state.activeReader) rerenderActiveReader();
        if (withDna && addedName) openDnaCandidate(addedName, item.tags);
    }

    function openDnaCandidate(characterName, tags) {
        if (!state.activeSettings) openSettings({ tab: 'scene', mode: state.activeReader ? state.activeReader.mode : 'pc' });
        if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
        state.activeSettings.tab = 'scene';
        state.activeSettings.tab = 'scene';
        state.activeSettings.asyncState.sceneSubTab = 'characters';
        state.activeSettings.asyncState.dnaCandidate = { name: String(characterName || ''), tags: String(tags || '') };
        return rerenderSettings();
    }

    function syncOptionBubblesAfterRender(current, snapshot) {
        const overlay = current && current.dom && current.dom.overlay;
        if (!overlay || !overlay.querySelector) return;
        const container = overlay.querySelector('#igs-option-bubbles');
        if (!container) return;
        const cfg = getOptionBubbleConfig(snapshot && snapshot.readerSettings);
        if (container.style && typeof container.style.setProperty === 'function') {
            container.style.setProperty('--igs-option-font-size', `${cfg.fontSize}px`);
        }
        // 每次渲染都收起旧气泡；最后一页需由随后一次未被页内演出消费的推进显式打开。
        hideOptionBubbles(container);
        // 把对话框实际高度/宽度写入 CSS 变量，供气泡定位在对话框正上方、宽度跟随对话框。
        const dialog = overlay.querySelector('#igs-dialog');
        if (dialog && typeof dialog.getBoundingClientRect === 'function') {
            const rect = dialog.getBoundingClientRect();
            const h = Math.round(rect.height || 0);
            if (h > 0) overlay.style.setProperty('--igs-dialog-h', `${h}px`);
            const w = Math.round(rect.width || 0);
            if (w > 0) overlay.style.setProperty('--igs-dialog-w', `${w}px`);
        }
        const toolbar = overlay.querySelector('#igs-ctrl-bar');
        if (toolbar && typeof toolbar.getBoundingClientRect === 'function') {
            const h = Math.round(toolbar.getBoundingClientRect().height || 0);
            if (h > 0) overlay.style.setProperty('--igs-toolbar-h', `${h}px`);
        }
    }

    function hydrateReaderMount(container, snapshot) {
        // 只在首次挂载时重建 DOM；后续渲染复用已有节点，
        // 避免浏览器对相同 URL 的背景图/立绘重新发起加载请求。
        let overlay = container.querySelector('#igs-overlay');
        if (!overlay) {
            clearChildren(container);
            container.innerHTML = snapshot.html;
            overlay = container.querySelector('#igs-overlay');
            if (!overlay) {
                overlay = buildFallbackReaderOverlay(container.ownerDocument || getRootDocument(options.global));
                if (overlay) container.appendChild(overlay);
            }
            normalizeReaderStableLayers(overlay);
        }
        return {
            overlay,
            dialog: overlay ? overlay.querySelector('#igs-dialog') : null,
            input: overlay ? overlay.querySelector('#igs-input') : null,
            sendButton: overlay ? overlay.querySelector('#igs-send-btn') : null,
            toast: overlay ? overlay.querySelector('#igs-toast') : null,
            clickLayer: overlay ? overlay.querySelector('#igs-click-layer') : null,
            text: overlay ? overlay.querySelector('#igs-text') : null,
            progress: overlay ? overlay.querySelector('#igs-progress') : null,
        };
    }

    function attachBridgeReaderExtras(readerSettings, bridge) {
        // readerSettings 是每次新克隆的快照，按世界观拨掉冲突演出不会写回存档。
        const sceneAssets = bridge.sceneAssets
            ? sceneAssetsForContext(bridge.sceneAssets, getSillyTavernContext(options.global || globalThis))
            : null;
        const worldview = resolveWorldview(sceneAssets);
        readerSettings.dialogSkin = effectiveDialogSkin(readerSettings.dialogSkin, sceneAssets);
        Object.assign(readerSettings, applyFxWorldview(readerSettings, worldview));
        // 演出与聊天层据此换皮：_ancientEra 保留给既有古风分支，_worldview 供西幻 / 科幻 / 末日换皮。
        readerSettings._ancientEra = worldview === 'ancient';
        readerSettings._worldview = worldview;
        readerSettings._sceneAssets = sceneAssets;
        readerSettings._sentencePaging = Boolean(bridge.sentencePaging);
        readerSettings._optionBubble = bridge.optionBubble && typeof bridge.optionBubble === 'object' ? bridge.optionBubble : {};
        const bilingualOverride = state.bilingualDisplay;
        readerSettings._bilingualDisplay = bilingualOverride && bilingualOverride.base === normalizeBilingualSettings(readerSettings.bilingual).display ? bilingualOverride.value : '';
        readerSettings._vnTheme = readerSettings.vnTheme || null;
        readerSettings._strictBackgroundMatch = isStrictBackgroundMatch(bridge.autoIllustration);
        readerSettings._cgBackgroundSize = normalizeAutoIllustrationSettings(bridge.autoIllustration).assets.backgroundSize;
        return readerSettings;
    }

    // 翻页重绘只读配置：设置修订号没变就复用上次整理的结果，不再每页深拷贝、整理整份素材库（素材越多翻页越顿）。
    // 宿主不提供修订号时照旧每次重读。
    function cloneReaderSettingsShallowAssets(readerSettings) {
        if (!readerSettings || !readerSettings._sceneAssets) return cloneData(readerSettings);
        const { _sceneAssets: assets, ...rest } = readerSettings;
        return { ...cloneData(rest), _sceneAssets: assets };
    }

    function resolveRenderConfig(mode) {
        const revision = typeof options.getSettingsRevision === 'function' ? options.getSettingsRevision() : null;
        if (revision == null) return resolveBridgeConfigSnapshot({ mode });
        if (renderConfigCache && renderConfigCache.revision === revision && renderConfigCache.mode === mode) return renderConfigCache.value;
        const value = resolveBridgeConfigSnapshot({ mode });
        renderConfigCache = { revision, mode, value };
        return value;
    }

    function resolveBridgeConfigSnapshot(optionsForSnapshot = {}) {
        const getter = typeof options.getUnifiedSettings === 'function'
            ? options.getUnifiedSettings
            : () => ({ bridge: {}, readerSettings: {}, readerMode: 'pc', version: options.version || '0.5.4' });
        const snapshot = getter(optionsForSnapshot) || {};
        return normalizeUnifiedSettings(snapshot, optionsForSnapshot.mode);
    }

    function normalizeUnifiedSettings(snapshot, preferredMode) {
        const bridge = normalizeBridgeConfig(snapshot.bridge);
        const readerMode = normalizeReaderMode(firstDefined(snapshot.readerMode, preferredMode, bridge.openMode), bridge);
        const readerSettings = normalizeReaderSettings(snapshot.readerSettings, bridge.vnTheme);

        return {
            version: snapshot.version || options.version || '0.5.4',
            bridge,
            imageApi: bridge.imageApi,
            readerMode,
            readerSettings,
        };
    }

    function writeToast(message, durationMs) {
        const current = state.activeReader;
        if (!current) return;
        const bridge = resolveRenderConfig(current.mode).bridge;
        applyToastToReader(current, bridge.showToasts !== false, message, normalizeSettingsTheme(bridge.settingsTheme), durationMs);
    }

    // 出图结果进生成细线：失败停红线展开原因；成功 / 跳过弹一下小字。关了「显示提示弹窗」时只留失败的红线。
    function imageNotice(level, message) {
        const current = state.activeReader;
        if (!current || !message) return;
        if (level !== 'error' && resolveRenderConfig(current.mode).bridge.showToasts === false) return;
        generationStrip.notice(level, message);
    }

    // 手动出图：点亮生成细线并在线上方弹一下小字，不再盖一个常驻提示。
    function writeGenerating() {
        if (!state.activeReader) return;
        generationStrip.manual('生图中…');
    }

    function buildSpriteEditContext() {
        return {
            writeToast,
            closeSettings,
            resolveUnifiedSettings: (opts) => resolveBridgeConfigSnapshot(opts),
            saveReaderSettingsPatch,
        };
    }

    function saveReaderSettingsPatch(patch) {
        const save = typeof options.saveUnifiedSettings === 'function' ? options.saveUnifiedSettings : null;
        if (!save || !state.activeReader) return { ok: false, reason: 'missing-save-handler' };
        const mode = state.activeReader.mode;
        const unified = resolveBridgeConfigSnapshot({ mode });
        const result = save({ bridge: unified.bridge, readerMode: unified.readerMode, readerSettings: { ...unified.readerSettings, ...patch } });
        if (!result || result.ok === false) return result || { ok: false, reason: 'save-failed' };
        const refreshed = resolveBridgeConfigSnapshot({ mode });
        const readerSettings = normalizeReaderSettings(refreshed.readerSettings, refreshed.bridge.vnTheme);
        attachBridgeReaderExtras(readerSettings, refreshed.bridge);
        state.activeReader.snapshot = buildReaderSnapshot(state.activeReader.payload, mode, readerSettings, state.activeReader.index);
        updateMountedReader(state.activeReader.snapshot);
        return result;
    }
}

function applyToastToReader(current, allowed, message, theme, durationMs, options) {
    if (!current || !message || allowed === false) return;
    clearReaderToast(current);
    current.toastMessage = String(message);
    const toast = current.dom && current.dom.overlay ? current.dom.overlay.querySelector("#igs-toast") : null;
    if (toast) {
        if (theme) toast.setAttribute("data-igs-toast-theme", theme);
        toast.textContent = current.toastMessage;
        toast.style.opacity = "1";
    }
    if (options && options.sticky === true) return;
    const win = current.dom && current.dom.overlay ? getOwnerWindow(current.dom.overlay) : null;
    const setter = win && typeof win.setTimeout === "function" ? win.setTimeout.bind(win) : setTimeout;
    const stay = Number(durationMs) > 0 ? Number(durationMs) : 1800;
    current.toastTimer = setter(() => {
        current.toastMessage = "";
        if (toast) toast.style.opacity = "0";
        current.toastTimer = null;
    }, stay);
}

function clearReaderToast(current) {
    if (!current) return;
    const win = current.dom && current.dom.overlay ? getOwnerWindow(current.dom.overlay) : null;
    const clearer = win && typeof win.clearTimeout === "function" ? win.clearTimeout.bind(win) : clearTimeout;
    if (current.toastTimer) {
        clearer(current.toastTimer);
        current.toastTimer = null;
    }
    current.toastMessage = "";
    const toast = current.dom && current.dom.overlay ? current.dom.overlay.querySelector("#igs-toast") : null;
    if (toast) {
        toast.textContent = "";
        toast.style.opacity = "0";
    }
}

const REGEN_FAILURE_TEXT = Object.freeze({
    'provider-not-enabled': '当前图像来源无法重画，请在设置「生图 → 图像来源」选择 IGS 内置 NAI 或数据库生图插件并填好配置',
    'invalid-message-id': '找不到当前楼层',
    'regen-failed': '请求出错',
    'regen-button-not-found': '当前楼层没有找到插图插件的生图按钮。若未安装智绘姬，请在设置「生图 → 图像来源」改选 IGS 内置 NAI 或数据库生图插件',
    'image-poll-timeout': '已点击插图插件的生图按钮，但等待超时仍没有新图片，请检查该插件是否正常工作',
});

function describeRegenFailure(reason) {
    const text = String(reason || '').trim();
    if (!text) return '没有拿到新图片';
    if (REGEN_FAILURE_TEXT[text]) return REGEN_FAILURE_TEXT[text];
    return /^[a-z0-9-]+$/i.test(text) ? `没有拿到新图片（${text}）` : text;
}

function resolveReaderActionToast(result, messages) {
    if (!result) return messages.fallback;
    if (result.ok === false) {
        return result.reason || messages.fallback;
    }
    return messages.success;
}

function cloneReaderPayload(payload = {}) {
    const clone = {};
    for (const [key, value] of Object.entries(payload || {})) {
        clone[key] = key === "message" ? (value || null) : cloneData(value);
    }
    return clone;
}

function stripSceneDirectivesInline(rawText) {
    return stripMarkerDirectives(stripIllustrationMarkers(rawText)).trim();
}

// 逐行剥离 [igs-scene:] / [igs-fx:] 标签，丢弃剥离后为空的行，供兜底分段使用。
function stripSceneDirectiveLines(rawText) {
    return stripIllustrationMarkers(rawText).split('\n')
        .map((line) => stripMarkerDirectives(line).trim())
        .filter((line) => line.length > 0 && !isMarkerDirectiveLine(line))
        .join('\n');
}

// 在原文里定位一段正文的位置：先精确匹配，失败再去掉排版符号后匹配。
// 纯函数、不做全局缓存，避免跨页状态残留。
function locateTextOffsetInSource(source, segText, from = 0) {
    const src = String(source || '');
    const needle = String(segText || '').trim();
    if (!src || !needle) return -1;
    const exact = src.indexOf(needle, Math.max(0, Number(from) || 0));
    if (exact >= 0) return exact;
    const loose = needle.replace(/[\s*（）\[\]]+/g, '');
    if (!loose) return -1;
    // 把原文与目标都去掉排版符号，再做一次真实匹配；命中后回推原文下标。
    const fromIndex = Math.max(0, Number(from) || 0);
    const map = [];
    let flat = '';
    for (let i = fromIndex; i < src.length; i += 1) {
        if (/[\s*（）\[\]]/.test(src[i])) continue;
        map.push(i);
        flat += src[i];
    }
    const hit = flat.indexOf(loose);
    if (hit >= 0) {
        const end = hit + loose.length - 1;
        if (end < map.length) return map[hit];
    }
    return -1;
}

function resolveBoundSlotImageUrl(imageState, slot) {
    const numericSlot = Number(slot);
    if (!Number.isInteger(numericSlot) || numericSlot < 1) return '';
    const targetIndex = numericSlot - 1;
    const unbound = new Set((Array.isArray(imageState.unboundImages) ? imageState.unboundImages : [])
        .map((image) => String(image && image.url || '').trim())
        .filter(Boolean));
    const sources = [imageState.slots, imageState.images];
    for (const source of sources) {
        if (!Array.isArray(source)) continue;
        const exact = source.find((image) => Number(image && image.slotIndex) === targetIndex);
        const indexed = source[targetIndex];
        for (const image of [exact, indexed]) {
            const url = String(image && image.url || '').trim();
            if (url && !unbound.has(url)) return url;
        }
    }
    return '';
}

function stripSegmentSpeaker(text) {
    return String(text || '').trim().replace(/^\*+|\*+$/g, '').replace(/^\s*\[[^\]\n]*\][：:]\s*/, '');
}
