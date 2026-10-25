import { recoverOperation, linkRecoverySignals, wakeRecoveringOperations } from '../../storage/automatic-recovery.js';
import { applyOperationEdits } from '../../storage/operation-edits.js';
import { appendInputDraft } from '../../host/input-channel.js';
import { readLive2dConfig, resolveCharacterLive2dBinding } from './live2d-config.js';
import { disposeLive2dStage } from './live2d-stage.js';
import { openLive2dPanel } from './live2d-panel.js';
import { createMediaLeaseScope } from '../../media/media-lease-scope.js';
import { bindImageCacheDocument } from '../../media/tavern-image-cache.js';
import { buildIgsTextPayload, getMessagePrimaryText, getVisibleMessageTextFromElement, normalizeSourceFilter, normalizeVirtualRegex } from '../../scene/message-source.js';
import { applyVoiceBark, canonicalName, noteFormGender, setActiveFormGenders } from './voice-bark.js';
import { createSettingsHost } from './settings-host.js';
import { createRecoveryNotice } from './recovery-notice.js';
import { handleSettingsAction } from './settings-actions.js';
import { normalizeBridgeConfig, normalizeReaderSettings } from './settings-host-normalize.js';
import { extractSceneDirectives, resolveSceneAtSourceOffset, resolveIllustrationForPage, resolveHeldSourceOffsets, locateNarrativeOffset, stripIllustrationMarkers, classifySceneKey, resolveCharacterKey, setCharacterNameFallback, lookupAssetValue } from '../../scene/scene-directives.js';

import { recordOutfitReview, dropConfirmedOutfitReview, removeOutfitReview, storyOutfitSourceHash } from '../../scene/outfit-review-store.js';
import { assetOwnerKey, draftAssetLibrary, draftEffectiveAssets, effectiveSceneAssets, ensureCardLibrary, relocateLegacyCard, rememberAssetScope, resolveAssetScope, sceneAssetsForContext } from '../../scene/asset-scope.js';
import { createStoryOutfitService } from '../../generated-images/illustration/story-outfit-service.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { secondaryLlmText } from '../../host/secondary-llm-result.js';

import { isMarkerDirectiveLine, stripMarkerDirectives } from '../../scene/directive-tags.js';
import { overlayStatsMetrics } from '../../scene/stats/stat-metrics.js';
import { readStoryNow, resolveDuePromises } from '../../scene/promise-reminder.js';
import { normalizeItemImageSettings } from '../../generated-images/illustration/item-image-settings.js';
import { createCgGalleryPanel } from './cg-gallery-panel.js';
import { createRewindController, REWIND_NOTICE } from './rewind.js';
import { createReadingProgress, resolvePositionFloor, resolvePositionPage, segmentText, textHash, textHead, READING_METADATA_KEY } from './reading-progress.js';
import { createTurnIndexPanel, positionLabel } from './turn-index-panel.js';
import { createGenerationStrip } from './generation-strip.js';
import { createMissedHint, detectMissedAssets } from './missed-assets.js';
import { cancelFxEffects } from './fx-runtime.js';
import { cancelDanmaku } from './danmaku-runtime.js';
import { cancelStageDirection } from './stage-direction-runtime.js';
import { cancelSceneGrade } from './scene-grade.js';
import { closeRomanceFx } from './romance-runtime.js';
import { closeMetaFx } from './meta-runtime.js';
import { normalizeRomanceFxSettings, resolveRomanceRivalTarget } from './romance-settings.js';
import { mergeItemEvents, normalizeItemFxSettings } from './fx-item-model.js';
import { applyEatToItems } from './fx-eat-model.js';
import { normalizeDailyFxSettings } from './fx-daily-model.js';
import { cancelDailyFx } from './fx-daily.js';
import { cancelSceneAudio, skipBgmTrack } from './scene-audio.js';
import { applyBgmNoteToDom, toggleBgmNote } from './bgm-note.js';
import { audioBusContext, busInput, parkAudioBus, resumeAudioBus, unparkAudioBus } from './audio-bus.js';
import { isStagePaused, markStageActive, watchStagePause } from './stage-pause.js';
import { scheduleFontGuard } from './font-guard.js';
import { createReaderAutoPlay } from './reader-auto-play.js';
import { decideTts, guessTtsLine, isTtsSpeaking, listSystemVoices, normalizeTtsSettings, replayTts, setTtsErrorHandler, speakTtsLine, stopTts } from './tts.js';
import { resolveRegionCrop } from './stage-snapshot.js';
import { playUiSfx } from './ui-sfx.js';
import { parseHtmlCardMarker } from '../../scene/html-cards.js';
import { isGeneratedAssetUrl, generatedAssetIdOf, bindGeneratedBackground, bindGeneratedSprite } from '../../scene/asset-match.js';
import { STAGE_CAST_MAX_SEATS, pickCastMembers } from '../../scene/stage-cast.js';
import { resolveReaderSpriteAsset } from './reader-sprite-asset.js';
import { normalizeStageCastSettings } from './stage-direction-settings.js';
import { SPRITE_BACK_MOOD } from './sprite-turn.js';
import { isReactMoodHit } from '../../scene/react-mood.js';

import { clearCastDom } from './stage-cast-render.js';
import { hasGroupSuffix, sameFoeName, splitFoeNames } from '../../scene/creature-battle.js';
import { foeIsDown } from './creature-battle-model.js';
import { CREATURE_FOE_SLOTS, composeCreatureStage, creatureProfileOf, isGiantCreature, resolveCreatureFoes } from './creature-layout.js';
import { createOutfitResolver, fuzzyOutfitName, normalizeWardrobe } from '../../scene/character-outfits.js';
import { isStrictBackgroundMatch, normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';
import { clearCurrentCg } from '../../generated-images/illustration/clear-current-cg.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { cgEntryFromPhoto } from '../../media/cg-library.js';
import { normalizeMoodGroups, resolveMoodGroup } from '../../scene/mood-groups.js';

import { getOriginalReaderHtml, getOriginalReaderSource, getOriginalReaderStyleText, ORIGINAL_READER_REQUIRED_SELECTORS, ORIGINAL_READER_STYLE_CONTRACT } from './original-reader-source.js';
import { SETTINGS_CATEGORIES, categoryOfPage, currentSettingsPage, openSettingsPage } from './settings-pages.js';
import { normalizeSettingsTheme } from './settings-theme.js';
import { DEFAULT_IMAGE_API, DIALOG_FONT_OPTIONS, DEFAULT_PINNED_TOOLBAR_BUTTONS, DEFAULT_SCENE_PROMPT_RULE, normalizeScenePromptRule, PROMPT_RULE_OUTFIT_HINT, scenePromptRuleOutfitHint, READER_SETTINGS_SCHEMA_VERSION, SETTINGS_PANEL_REQUIRED_SELECTORS, SETTINGS_PANEL_TAB_CONTRACT, TOOLBAR_ACTIONS, VN_THEME_PRESETS } from './reader-host-constants.js';
import { eventToShortcut, findShortcutAction, resolveShortcuts } from './reader-shortcuts.js';
import { isEmbeddedReaderMode } from '../../schemas/reader-mode.js';
import { buildWaitStageModel, createWaitStageRuntime } from './wait-stage-runtime.js';
import { getWaitStageGamePack, subscribeWaitStageGamePack } from './wait-stage-games-api.js';
import { onDlcSkinsChange } from './dlc-skin-registry.js';
import { onDlcFxChange } from '../../scene/fx-registry.js';
import { cloneData, esc, firstDefined, firstNonEmptyString, firstRenderableText, clampNumber, normalizeBoolean, normalizeFiniteIndex, normalizeFiniteNumber, normalizeNullableNumber, normalizeOpacity, toHex } from './reader-value-utils.js';
import { checkbox, colorInput, field, renderCharacterAssetList, renderMoodGroupList, renderMoodReviewList, renderPinnedButtons, renderSceneAssetList, renderGeneratedAssetPane, countGeneratedWaiting, renderStageShakeSettings, renderChatShowSettings, renderSystemRoleSettings, renderWeatherFxSettings, renderTemplate, rangeInput, secretInput, segmentedInput, selectInput, textInput, textareaInput, numberInput, disabledAttr, hiddenAttr, modelPicker, tableMultiSelect } from './settings-fields.js';
import { renderAssetReviewPanel } from './asset-review-panel.js';
import { ensureEmbeddedHost, findEmbeddedHost, hideEmbeddedSourceText, hideStorySpan, isEmbeddedEditTrigger, isStoryHidden, resolveEmbeddedHostParent, restoreEmbeddedSourceText, restoreStorySpan, storyLines } from './embedded-reader-runtime.js';
import { createReaderSourceCache } from './reader-source-cache.js';
import { prepareReaderFloor, stripWrappingQuotes } from './reader-floor-plan.js';
import { prepareReaderFloorAssets } from './reader-floor-assets.js';
import { createReaderTableData } from '../../data/shujuku/reader-table-data.js';
import { createImageResourceCache } from '../../media/resource-cache.js';
import { collectFloorAssetUrls } from './floor-asset-prefetch.js';
import { createChatStreamObserver, isUserFloorNode } from '../../host/chat-stream-observer.js';
import { findAcuDice, formatCheckMessage, resolveDiceCommand } from '../../choices/dice-check.js';
import { buildResultFxPlan, normalizeResultFxSettings, resultDetailOf } from './fx-result-model.js';
import { cancelResultFx, playResultFx } from './fx-result.js';
import { pickFxAccent } from './fx-symbols.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { applyImageCountOverride, buildImageActionContext, buildProgressText, countBoundImageSlots, normalizePollAttempts, normalizePollInterval, normalizeSnapshotImageState, resolveSegmentImageIndex, shouldPollReaderImages, waitForReaderImagePoll } from './reader-image-state.js';
import { attachSettingsViewportEvents, clearChildren, detachSettingsViewportEvents, ensureImageLoadingSpinner, ensureStyleTag, getOwnerWindow, getRootDocument, removeImageLoadingSpinner, setImageRetryState, syncSettingsViewportVars, unmountNode } from './reader-dom-utils.js';
import { buildTextSegments, getPath, normalizeBtnOrder, normalizeHiddenButtons, normalizePerformanceSettings, normalizePinnedButtons, normalizeReaderMode, normalizeSettingsTab, normalizeSettingsValue, normalizeSpriteDefaultScale, normalizeSpriteDisplayScale, normalizeSpriteGenderScale, normalizeSpriteLayouts, setPath } from './settings-normalize.js';
import { clearReaderModeRuntime, exitDocumentFullscreen } from './reader-runtime.js';
import { enterSpriteEditMode } from './sprite-edit.js';
import { enterCgPortraitEdit } from './cg-portrait.js';
import { enterLivePortraitEdit } from './danmaku-live.js';
import { enterCastSlotEdit } from './cast-slot-edit.js';
import { createDbPanelController } from '../../shujuku-panel/panel-controller.js';
import { createMapPanelController } from './map-panel.js';
import { createRecordPanelController } from './record-panel.js';
import { createShujukuClient } from '../../data/shujuku/client.js';
import { buildStatusHudModel, normalizeStatusHudSettings, resolveStatusAvatar } from '../../data/shujuku/status-hud-model.js';
import { readOptionItems } from '../../choices/option-table.js';
import { buildItemActionText, extractBodyChoices, listPresentNames, normalizeOptionSources, splitQuickActions } from '../../choices/option-sources.js';
import { buildItemCatalog } from '../../data/shujuku/item-catalog.js';
import { createIgsModal } from './igs-modal.js';
import { runCgConsistencyAction } from './cg-consistency-action.js';
import { createOnboardingController } from './onboarding-guide-controller.js';
import { applyPerformanceProfile, applyProfileDetails } from './performance-profile.js';
import { applyFxWorldview } from '../../scene/fx-era.js';
import { applyWorldview, resolveWorldview } from '../../scene/worldview.js';
import { effectiveDialogSkin, sceneDialogSkin } from './worldview-skins.js';
import { applyTitleSkin, buildTitleScreenModel, createTitleGate, nextTitleCoverTurn, playOpeningCard, playTitleBgm, reduceTitleAction, removeTitleScreen, renderTitleScreen, shouldGateTitleScreen, titleCardOf } from './title-screen.js';
import { loadMoodReview, recordMoodReview, removeMoodReview } from '../../scene/mood-review-store.js';
import { applyMoodAssignments, buildMoodClassificationRequest, parseMoodClassification, resolveSecondaryLlm } from '../../scene/mood-classify.js';
import { CLASSIC_DIALOG_HEIGHT, CLASSIC_DIALOG_WIDTH_PERCENT_DEFAULT, CLASSIC_DIALOG_THEME_DEFAULTS, DIALOG_SKIN_ADVENTURE_JOURNEY, DIALOG_SKIN_BLACK_WHITE_MANGA, DIALOG_SKIN_CUTE_PINK, DIALOG_SKIN_DAY_MINIMAL, DIALOG_SKIN_ELEGANT_EUROPEAN, DIALOG_SKIN_GRADIENT_VEIL, DIALOG_SKIN_PLANT_COFFEE, DIALOG_SKIN_RETRO_JAPANESE, DIALOG_SKIN_WARM_PICTUREBOOK, DIALOG_SKIN_WESTERN_CLASSIC, isIllustratedDialogSkin, normalizeClassicDialogWidthPercent, normalizeDialogSkin } from './classic-dialog-skin.js';
import { TYPEWRITER_DEFAULTS, cancelTypewriter, normalizeTypewriterSettings } from './typewriter-runtime.js';
import { cancelStageShakeEffect } from './stage-shake-runtime.js';
import { advanceChatReveal, cancelChatShow, getChatRevealState } from './chat-layer.js';
import { buildChatPageModel, normalizeChatShowSettings } from './chat-show-runtime.js';
import { resolveChatTheme } from './chat-themes.js';
import { isSystemRole, normalizeSystemRoleSettings } from './system-role.js';
import { formatChatBlockAsText, parseChatMarker } from '../../scene/chat-blocks.js';
import { comicContentKey, isComicModeActive } from './comic-settings.js';
import { nextBilingualDisplay, normalizeBilingualSettings, resolveBilingualDisplay } from './bilingual-text.js';

import { applyReaderSnapshotToDom, applyToolbarState, buildFallbackReaderOverlay, buildFallbackSettingsOverlay, normalizeReaderStableLayers, pinEmbeddedHostFrame, watchTitleEmbeddedFrame } from './reader-dom-render.js';

const CHARACTER_COLLECTIONS = ['characters', 'characterOutfits', 'characterDna', 'characterAliases', 'statusAvatars'];

// 翻页时设置没变就复用上次整理好的阅读器设置：每次整份深拷贝再跑几十项整理，是翻页最大的一块 JS 开销。
// 存储配置是共享只读的，改设置会换新引用，按引用判断即可。返回浅拷贝：调用方只改顶层字段，下层对象只读。
let normalizedReaderMemo = null;
function normalizeReaderSettingsCached(settings, legacyTheme) {
    const memo = normalizedReaderMemo;
    if (memo && settings && memo.settings === settings && memo.legacyTheme === legacyTheme) return { ...memo.value };
    const value = normalizeReaderSettings(settings, legacyTheme);
    normalizedReaderMemo = settings && typeof settings === 'object' ? { settings, legacyTheme, value } : null;
    return { ...value };
}

// 只在确有图本体读空时才交给素材匹配：平时不传，匹配不必逐槽检查、也不复制素材表。
function missingImageProbe(generatedAssets) {
    return generatedAssets && typeof generatedAssets.hasMissingImages === 'function' && generatedAssets.hasMissingImages()
        ? generatedAssets.isMissingImage : undefined;
}

function unavailableImageProbe(generatedAssets) {
    return generatedAssets && typeof generatedAssets.hasUnavailableImages === 'function' && generatedAssets.hasUnavailableImages()
        ? generatedAssets.isUnavailableImage : undefined;
}

// 阅读器认领的 Esc：IGS 自己的面板、弹窗照常收到（冒泡途经它们），到 <html> 再截住，不让酒馆 document 上的「中止生成」收到。
const claimedReaderEscapes = new WeakSet();
const escapeGuardDocs = new WeakSet();

function installReaderEscapeGuard(doc) {
    const html = doc && doc.documentElement;
    if (!html || escapeGuardDocs.has(doc) || typeof html.addEventListener !== 'function') return;
    escapeGuardDocs.add(doc);
    html.addEventListener('keydown', (event) => {
        if (claimedReaderEscapes.has(event)) event.stopPropagation();
    });
}

function claimReaderEscape(event) {
    if (event && typeof event === 'object') claimedReaderEscapes.add(event);
}

export function createIgsReaderHost(options = {}) {
    bindImageCacheDocument(getRootDocument(options.global), options.media?.cache);
    // 快速连翻的整页渲染最小间隔（见 renderTurnedPage）；放闭包开头，避免提前调用时未初始化。
    const PAGE_RENDER_GAP_MS = Number.isFinite(options.pageRenderGapMs) ? options.pageRenderGapMs : 32;
    let statusHudClient = null;
    let statusHudCallback = null;
    let statusHudApi = null;
    let statusHudTimer = 0;
    // 翻旧楼补插图：每楼每次刷新页面只试一次，同一时间只画一楼。
    const backfillTried = new Set();
    let backfillBusy = false;
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
    const rewindController = createRewindController({
        getContext: () => getSillyTavernContext(options.global || globalThis),
        getChatId: () => (typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : ''),
        storage: () => (options.global || globalThis).localStorage,
        progress: readingProgress,
        loadBranchApi: async () => {
            const g = options.global || globalThis;
            for (const win of [g, g.parent, g.top]) {
                try {
                    const origin = win && win.location && win.location.origin;
                    if (origin && origin !== 'null') return await import(/* @vite-ignore */ `${origin}/scripts/bookmarks.js`);
                } catch (_) { /* 换下一层窗口 */ }
            }
            return null;
        },
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
    const missedHint = createMissedHint({
        getDialog: () => (state.activeReader && state.activeReader.dom && state.activeReader.dom.dialog) || null,
        onRetry: () => runManualIllustration(),
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
    const tableData = createReaderTableData(() => (options.global || globalThis).AutoCardUpdaterAPI || null);
    const preparedFloorKey = Symbol('reader-floor-preparation');
    const imageResourceCache = createImageResourceCache(options.global || globalThis, { limit: 96 });
    let mediaHostDisposed = false;
    const offMediaClear = options.media?.cache?.onClear(() => {
        state.activeReader?.assetLoadRequests?.clear();
        queueMicrotask(() => {
            if (mediaHostDisposed) return;
            if (state.activeReader) rerenderActiveReader();
            if (state.activeSettings && isAssetSettingsPage(state.activeSettings)) scheduleImageRefresh({ settings: true });
        });
    }) || (() => {});
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
        onStable: (settled) => handleChatStreamStable(settled),
        isUserFloor: (messageId) => isUserFloorId(messageId),
        onTimeout: () => {
            waitStage.showSlow();
        },
    });
    // 等待过场：五种阅读器模式共用黑屏 + 一句台词（回放角色说过的话 + 通用兜底）。
    // 回复写完后，没在玩就地换页；正在玩小游戏时先留在这一层，等玩家点「加载下一楼」。
    // 等待小游戏的惩罚 CG：写词出图沿用楼内 CG 的来源，成图原样存进 CG 库相册，小游戏只记照片 id。
    const waitStagePenalty = {
        status() {
            const service = options.illustrations;
            if (!service || typeof service.paintStandaloneCg !== 'function') return { ok: false, nsfw: false };
            return service.standaloneCgStatus();
        },
        async paint({ characters, outfits, nude, description, nsfw, caption, aspect } = {}) {
            const service = options.illustrations;
            if (!service || typeof service.paintStandaloneCg !== 'function') return { ok: false, error: '生图服务没有接入' };
            const result = await service.paintStandaloneCg({ characters, outfits, nude, description, nsfw, aspect });
            if (!result || !result.ok) return { ok: false, error: (result && result.error) || 'CG 生成失败' };
            const album = options.cgGallery;
            let id = '';
            if (album && typeof album.keepPhoto === 'function') {
                const chatId = typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : '';
                const saved = await Promise.resolve(album.keepPhoto({ dataUrl: result.dataUrl, chatId, caption })).catch(() => null);
                id = saved && saved.ok && saved.photo ? saved.photo.id : '';
            }
            return { ok: true, url: result.dataUrl, id, size: result.size, request: result.request, prompt: result.prompt };
        },
        async read(id) {
            const album = options.cgGallery;
            if (!id || !album || typeof album.readFull !== 'function') return { ok: false };
            const got = await Promise.resolve(album.readFull(cgEntryFromPhoto({ id }))).catch(() => null);
            return got && got.ok ? { ok: true, url: got.dataUrl } : { ok: false };
        },
    };
    // 麻将对手的打法：宿主只交出角色卡世界书里按名字命中的条目和一次副 API 文本请求，怎么问、怎么用由小游戏定。
    const waitStagePersona = {
        status() {
            if (typeof options.readCardWorldbook !== 'function' || typeof options.requestSecondaryText !== 'function') {
                return { ok: false, reason: 'unavailable' };
            }
            const via = moodAutoContext().llm.source === 'openai' ? 'secondary' : 'tavern';
            // 没单独配副 API 时走酒馆当前连接，正文还在写就别去抢。
            const current = state.activeReader;
            if (via === 'tavern' && current && current.streamPhase === 'streaming') return { ok: false, reason: 'busy', via };
            return { ok: true, via, chat: typeof options.getCurrentChatId === 'function' ? String(options.getCurrentChatId() || '') : '' };
        },
        async lore(names) {
            try {
                const list = await options.readCardWorldbook(Array.isArray(names) ? names : []);
                return { ok: true, list: Array.isArray(list) ? list : [] };
            } catch (error) {
                return { ok: false, list: [] };
            }
        },
        async ask({ system, user } = {}) {
            const status = waitStagePersona.status();
            if (!status.ok) return { ok: false, reason: status.reason };
            try {
                const raw = await options.requestSecondaryText({ system, user }, moodAutoContext().llm);
                const text = secondaryLlmText(raw);
                return text.trim() ? { ok: true, text } : { ok: false, reason: 'empty' };
            } catch (error) {
                return { ok: false, reason: 'failed', error: String(error && error.message || '') };
            }
        },
    };
    // 小游戏的图在显示时才读、读一张租一张：整卡几百张立绘一起读会挤爆图片缓存，排在后面的超时后被记成读不到。
    const WAIT_STAGE_IMAGE_TIMEOUT_MS = 90000;
    const waitStageImageWaiters = new Map();
    let waitStageLeases = null;
    function loadWaitStageImage(url) {
        const source = String(url || '').trim();
        if (!source || !isGeneratedAssetUrl(source)) return source;
        const id = generatedAssetIdOf(source);
        waitStageLeases ||= options.media?.cache ? createMediaLeaseScope(options.media.cache) : null;
        waitStageLeases?.use(`asset:${id}`);
        const service = options.generatedAssets;
        const stored = service?.imageAvailability?.(source);
        if (stored?.status === 'missing') return '';
        const ready = stored?.status === 'read-error' && typeof service.retryImageRead === 'function'
            ? String(service.retryImageRead(source) || '') : concreteReaderAssetUrl(source);
        if (ready) return ready;
        return new Promise((resolve) => {
            const g = options.global || globalThis;
            const waiters = waitStageImageWaiters.get(id) || new Set();
            waitStageImageWaiters.set(id, waiters);
            const waiter = (value) => {
                g.clearTimeout(timer);
                waiters.delete(waiter);
                if (!waiters.size) waitStageImageWaiters.delete(id);
                resolve(value);
            };
            waiter.source = source;
            const timer = g.setTimeout(() => waiter(''), WAIT_STAGE_IMAGE_TIMEOUT_MS);
            waiters.add(waiter);
        });
    }
    function settleWaitStageImage(detail) {
        const waiters = detail && detail.imageId ? waitStageImageWaiters.get(detail.imageId) : null;
        if (!waiters) return;
        for (const waiter of [...waiters]) {
            if (detail.reason === 'image-lost') { waiter(''); continue; }
            if (detail.reason !== 'image-loaded') continue;
            const value = concreteReaderAssetUrl(waiter.source);
            if (value) waiter(value);
        }
    }
    function releaseWaitStageImages() {
        waitStageLeases?.releaseAll();
    }
    const waitStage = createWaitStageRuntime({
        penalty: waitStagePenalty,
        persona: waitStagePersona,
        loadImage: (url) => loadWaitStageImage(url),
        releaseImages: () => releaseWaitStageImages(),
        audio: { context: () => audioBusContext(), input: () => busInput('sfx'), resume: () => resumeAudioBus() },
        getDoc: () => resolveEmbeddedDocument(state.activeReader),
        onVoice: (line) => playWaitStageVoice(line),
        onExitReady: () => finishPendingWaitExit(),
        onDismiss: () => {
            streamObserver.cancelPending();
            exitEmbeddedLoading();
        },
        onClose: () => closeReader(),
    });
    let pendingReplyMessage = null;
    // 小游戏脚本可能比阅读器晚装上：装上或卸掉都要重排一次工具栏里的「小游戏」。
    const offWaitGamePack = subscribeWaitStageGamePack((pack) => {
        const current = state.activeReader;
        if (!pack && waitStage.isPlaying()) waitStage.close();
        if (current) applyToolbarState(current.dom && current.dom.overlay, current);
    });
    // 物品图到达后重绘阅读器：演出占位与背包格位据此替换为生图。
    const offItemImageUpdatedRaw = typeof options.onItemImageUpdated === 'function'
        // 物品图可能一批连着到，和生图一样按窗口合并成一次重绘。
        ? options.onItemImageUpdated(() => { if (state.activeReader) scheduleImageRefresh({ reader: true }); })
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
    let floorAssetPlan = { key: '', reader: null, urls: [] };
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
                if (waitStage.isOpen()) void refreshWaitStageModel(state.activeReader);
                else if (state.activeSettings) readerStaleBehindSettings = true;
                else rerenderActiveReader();
            }
            if (doSettings && state.activeSettings && isAssetSettingsPage(state.activeSettings)) {
                // 交互中先搁着，松手或菜单收起时由 flushDeferredImageRefresh 补刷。
                if (settingsInteracting()) settingsImageRefreshPending = true;
                else rerenderSettings();
            }
        }, IMAGE_REFRESH_BATCH_MS);
    }
    const offGeneratedAssetUpdated = typeof options.onGeneratedAssetUpdated === 'function'
        ? options.onGeneratedAssetUpdated((detail) => {
            settleWaitStageImage(detail);
            sourceCache.visitPrepared(floor => floor.assets?.invalidate(detail));
            const settings = state.activeSettings;
            const imageLost = Boolean(detail && detail.reason === 'image-lost');
            // 图本体读空和读回都合并重绘；只使这张图相关的匹配失效。
            const imageLoaded = imageLost || Boolean(detail && detail.reason === 'image-loaded');
            if (state.activeReader) {
                if (imageLoaded && !imageLost) warmActiveFloorImages(null, detail.imageId);
                if (settings) readerStaleBehindSettings = true;
                if (imageLoaded) {
                    if (waitStage.isOpen() || !settings) scheduleImageRefresh({ reader: true });
                } else if (!settings) rerenderActiveReader();
            }
            if (!settings) return;
            if (imageLoaded) {
                if (isAssetSettingsPage(settings)) scheduleImageRefresh({ settings: true });
                return;
            }
            if (['review', 'scene-review'].includes(currentSettingsPage(settings))) rerenderSettings();
        })
        : () => {};
    const offSettingsUpdated = typeof options.onSettingsUpdated === 'function'
        ? options.onSettingsUpdated(() => {
            renderConfigCache = null;
            floorAssetPlan = { key: '', reader: null, urls: [] };
            if (!state.activeReader) return;
            if (state.activeSettings) readerStaleBehindSettings = true;
            else if (state.activeReader) scheduleImageRefresh({ reader: true });
        })
        : () => {};
    // 日志更新时只替换列表 DOM，不整页重渲染，避免打断正在输入的设置项。
    const offImageJobLog = options.imageJobLog && typeof options.imageJobLog.onChange === 'function'
        ? options.imageJobLog.onChange(() => {
            const current = state.activeSettings;
            if (!current || currentSettingsPage(current) !== 'logs') return;
            const list = current.dom && current.dom.root && current.dom.root.querySelector
                ? current.dom.root.querySelector('[data-image-log-list]') : null;
            if (list) list.innerHTML = renderImageJobLogList();
            else rerenderSettings();
        })
        : () => {};
    // DLC 中途登记 / 注销：重绘当前阅读器与设置页（皮肤样式、下拉、演出开关），同一轮里多次登记只重绘一次。
    let dlcRerenderQueued = false;
    const onDlcChange = () => {
        sourceCache.invalidate();
        if (dlcRerenderQueued) return;
        dlcRerenderQueued = true;
        Promise.resolve().then(() => {
            dlcRerenderQueued = false;
            try {
                if (state.activeReader) rerenderActiveReader();
                if (state.activeSettings) rerenderSettings();
            } catch (error) { /* 重绘失败不影响登记，下一次翻页照常生效 */ }
        });
    };
    const offDlcSkins = onDlcSkinsChange(onDlcChange);
    const offDlcFx = onDlcFxChange(onDlcChange);
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
        persistSettingsDraft, reportSettingsFailure, renderImageJobLogList, withCharacterDnaDraftSync,
    } = createSettingsHost({
        flushDeferredImageRefresh, normalizeUnifiedSettings, onboarding, openCgGallery, options, pageModal,
        playReaderUiSfx, rerenderActiveReader, resolveBridgeConfigSnapshot, scheduleMoodAutoClassify, sourceCache,
        state, openLive2dManager,
        invalidateFloorAssetPlan() { floorAssetPlan.key = ''; },
        takeReaderStaleBehindSettings() {
            const stale = readerStaleBehindSettings;
            readerStaleBehindSettings = false;
            return stale;
        },
    });

    const recoveryNotice = createRecoveryNotice({
        global: options.global || globalThis,
        getDocument: () => getRootDocument(options.global),
        getTheme: readSettingsTheme,
        openSettings,
    });

    const host = {
        openReader,
        replaceReader,
        openSettings,
        withCharacterDnaDraftSync,
        syncStoryOutfitDraft(before, next) {
            const draft = state.activeSettings?.draft.bridge;
            if (!draft) return;
            draft.sceneAssets = applyOperationEdits(before, next, draft.sceneAssets);
            rerenderSettings();
        },
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
                tabs: SETTINGS_CATEGORIES.map(([id, label]) => ({
                    id,
                    label,
                    requiredPaths: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredPaths || []),
                    requiredActions: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredActions || []),
                })),
            };
        },
    };

    // 角色、场景两个分类的页面里有缩略图：图片到了要刷新它们。
    function isAssetSettingsPage(settings) {
        const category = categoryOfPage(currentSettingsPage(settings));
        return category === 'chars' || category === 'scenes';
    }

    // 翻页配置缓存（见 resolveRenderConfig）；闭包变量必须写在 return 之前。
    let renderConfigCache = null;
    const reviewRecoveries = new Map();
    const readerRecoveryController = new AbortController();
    // 正文出现衣柜没有的新衣服：排队到本楼最后一页，和新素材入库同一个面板里问。
    const pendingOutfitAsks = [];
    const storyOutfits = options.storyOutfits || (options.generatedAssets?.writeWardrobePrompt && (options.global || globalThis).localStorage
        ? createStoryOutfitService({
            storage: (options.global || globalThis).localStorage,
            assets: options.generatedAssets,
            getContext: storyOutfitContext,
            commit: commitStoryOutfit,
            onAutoResult(row, result) {
                if (result?.saved) {
                    for (let i = pendingOutfitAsks.length - 1; i >= 0; i--)
                        if (pendingOutfitAsks[i].character === row.character && pendingOutfitAsks[i].word === row.word)
                            pendingOutfitAsks.splice(i, 1);
                    if (state.activeReader) rerenderActiveReader();
                }
            },
            onChanged() {
                const current = state.activeReader;
                if (current) syncAssetReviewAfterRender(current, current.snapshot);
            },
        }) : null);
    const offStoryOutfits = options.storyOutfits?.subscribe?.(() => {
        const current = state.activeReader;
        if (current) syncAssetReviewAfterRender(current, current.snapshot);
    }) || (() => {});
    // 等待巡检计时器（startReplyWatchdog 用）；必须在 return 之前声明。
    let replyWatchdog = null;
    return host;

    function openReader(payload = {}, openOptions = {}) {
        // 开着时重开（切轮、报错后重建）带上没发出去的草稿；关掉再开是新输入框。
        const draft = state.activeReader ? String(state.activeReader.inputValue || '') : '';
        const prevInput = state.activeReader && state.activeReader.dom && state.activeReader.dom.input;
        const draftFocused = Boolean(prevInput && prevInput.ownerDocument && prevInput.ownerDocument.activeElement === prevInput);
        closeReader({ keepFullscreen: true });
        payload = cloneReaderPayload(payload);
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
        const unified = resolveRenderConfig(nextMode);
        const readerSettings = normalizeReaderSettingsCached(unified.readerSettings, unified.bridge.vnTheme);
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
            payload,
            mode: nextMode,
            index: snapshot.content.currentIndex,
            mountMessageId: snapshot.messageId,
            contentMessageId: snapshot.messageId,
            turnOffset: Math.max(0, Number(firstDefined(openOptions.turnOffset, payload.turnOffset, 0)) || 0),
            streamPhase: 'idle',
            mountBaselineRaw: getMessagePrimaryText(payload.message && (payload.message.raw || payload.message) || payload.raw || ''),
            mountBaselineVisible: String(payload.visibleText || ''),
            inputValue: draft,
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
            assetLoadRequests: new Map(),
        };
        const current = state.activeReader;
        current.progressArmed = progressRuntime.navigating;
        // 重来待办先取：分支会带着原聊天的阅读进度元数据，先按截断后的进度覆盖，再跳过元数据合并。
        arriveAtRewind(current);
        pullProgressFromMetadata();
        current.titleGate = openOptions.skipTitle !== true && payload.skipTitle !== true && shouldGateTitleScreen({
            readerSettings,
            messageId: snapshot.messageId,
            index: snapshot.content.currentIndex,
            startAtEnd: payload.startAtEnd === true,
        }) ? createTitleGate({ coverTurn: nextTitleCoverTurn((options.global || globalThis).localStorage) }) : null;
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
        // 正打着字被重开：焦点也接回新输入框，后续按键不会落到翻页快捷键上。
        if (draftFocused && current.dom && current.dom.input && typeof current.dom.input.focus === 'function') {
            current.dom.input.focus();
        }
        startReaderImagePolling(state.activeReader);
        if (!progressRuntime.navigating) void offerResume(current);
        if (domState && domState.overlay) {
            state.activeReader.stopStagePause = watchStagePause(domState.overlay, { offscreen: isEmbeddedReaderMode(nextMode), root: domState.root });
            scheduleFontGuard(domState.overlay);
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
        return withLazySnapshot({
            ok: true,
            mode: nextMode,
            readerMode: nextMode,
            snapshot: lazySnapshotCopy(snapshot),
            domMounted: Boolean(domState),
            controller,
        });
    }

    // 已打开阅读器时原地替换阅读源：复用同一 reader root、controller 与事件绑定，
    // 不 closeReader→openReader 重建，避免内嵌轮次切换和流式完成时反复重建 DOM。
    function replaceReader(payload = {}, replaceOptions = {}) {
        const current = state.activeReader;
        if (!current) return openReader(payload, replaceOptions);
        payload = cloneReaderPayload(payload);
        const mode = normalizeReaderMode(current.mode, resolveBridgeConfigSnapshot({ mode: current.mode }).bridge);
        const merged = applyReaderPayloadToState(current, mode, { payload, index: 0 });
        if (!merged.content.segments.length) return { ok: false, reason: 'no-readable-text' };
        current.contentMessageId = payload.messageId != null ? payload.messageId : current.contentMessageId;
        current.illustrationIdentity = readIllustrationIdentity(current.contentMessageId);
        if (replaceOptions.turnOffset != null) current.turnOffset = Math.max(0, Number(replaceOptions.turnOffset) || 0);
        current.payload = payload;
        if (current.turnOffset === 0 || payload.messageId === current.mountMessageId) {
            current.mountBaselineRaw = getMessagePrimaryText(payload.message && (payload.message.raw || payload.message) || payload.raw || '');
            current.mountBaselineVisible = String(payload.visibleText || '');
        }
        current.index = 0;
        // 输入框里没发出去的草稿留着：出图写回、回复失败都会走这里原地换源。
        current.awaitingReply = false;
        current.mountMessageId = replaceOptions.mountMessageId != null ? replaceOptions.mountMessageId : current.mountMessageId;
        current.mode = mode;
        current.snapshot = merged;
        if (current.titleGate && Number(current.contentMessageId) !== 0) dropTitleGate(current);
        updateMountedReader(merged);
        exitEmbeddedLoading();
        if ((isEmbeddedReaderMode(mode) || followsHostReply(mode)) && current.turnOffset === 0) startReaderImagePolling(current);
        return withLazySnapshot({
            ok: true,
            mode,
            readerMode: mode,
            snapshot: lazySnapshotCopy(merged),
            domMounted: Boolean(current.dom),
            controller: current.controller,
            replaced: true,
        });
    }

    // 物品演出：账本补上物品表变动的获得 / 失去，标出初次获得，并给正文点亮备好已知物品名。
    function decorateItemFx(pageFx, payload, segments, index, prepared, readerSettings) {
        const ledger = options.itemLedger;
        const itemFx = normalizeItemFxSettings(readerSettings && readerSettings.itemFx);
        if (!ledger || !itemFx.enabled || !pageFx || !Array.isArray(pageFx.items)) return;
        const messageId = Number(firstDefined(payload.messageId, payload.message && payload.message.id, null));
        if (!Number.isInteger(messageId)) return;
        const identity = state.activeReader && Number(state.activeReader.payload.messageId) === messageId && state.activeReader.illustrationIdentity
            ? state.activeReader.illustrationIdentity : readIllustrationIdentity(messageId);
        const chatId = identity && identity.chatId;
        if (!chatId) return;
        const identityKey = `${chatId}|${messageId}|${identity.swipeId}`;
        if (prepared.ledgerTagKey !== identityKey) {
            ledger.noteTagItems(chatId, prepared.tagItems, messageId);
            prepared.ledgerTagKey = identityKey;
        }
        mergeItemEvents(pageFx, {
            events: ledger.eventsFor(chatId, messageId, identity.swipeId),
            segments,
            index,
            tagNames: prepared.tagNames,
            pageFor: prepared.itemPageFor,
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
        const unified = resolveRenderConfig(mode);
        const readerSettings = normalizeReaderSettingsCached(unified.readerSettings, unified.bridge.vnTheme);
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
        statusHudApi = null;
        if (statusHudTimer) {
            const g = options.global || globalThis;
            (g.clearTimeout || clearTimeout).call(g, statusHudTimer);
            statusHudTimer = 0;
        }
    }

    function syncStatusHudSubscription() {
        const current = state.activeReader;
        const settings = current && current.snapshot && current.snapshot.readerSettings;
        const statusHud = normalizeStatusHudSettings(settings && settings.statusHud);
        const shouldSubscribe = Boolean(current) && ((statusHud.enabled && statusHud.tables.length > 0)
            || Boolean(settings?._sceneAssets?.enabled && Object.keys(settings._sceneAssets.characterOutfits || {}).length)
            || Boolean(current.payload?.promiseHistory?.length));
        if (!shouldSubscribe) {
            teardownStatusHudSubscription();
            return;
        }
        const api = (options.global || globalThis).AutoCardUpdaterAPI || null;
        if (statusHudClient && statusHudCallback && statusHudApi === api) return;
        teardownStatusHudSubscription();
        statusHudApi = api;
        statusHudClient = createShujukuClient(api);
        // 数据库插件后台填表时会连发回调：合并成 250ms 一次，内容没变就不整页重绘。
        statusHudCallback = () => {
            tableData.invalidate();
            if (!state.activeReader || statusHudTimer) return;
            const g = options.global || globalThis;
            const schedule = typeof g.setTimeout === 'function' ? g.setTimeout.bind(g) : setTimeout;
            statusHudTimer = schedule(() => {
                statusHudTimer = 0;
                if (state.activeReader) rerenderActiveReader();
            }, 250);
        };
        statusHudClient.registerCallback(statusHudCallback);
    }

    function readStatusHudTablesSafe() {
        return tableData.read();
    }

    function readerPageAssetUrls(content) {
        if (!content) return [];
        return [content.backgroundImage, content.spriteImage, content.pendingSpriteRef, content.nsfwCgPortrait,
            content.fx && content.fx.foeImage,
            content.giantSprite && content.giantSprite.image,
            ...(Array.isArray(content.castSprites) ? content.castSprites.map(member => member && member.image) : []),
            ...(Array.isArray(content.pendingCastRefs) ? content.pendingCastRefs : [])].filter(Boolean);
    }

    function pageUsesAsset(content, source) {
        return Boolean(source) && readerPageAssetUrls(content).includes(source);
    }

    function concreteReaderAssetUrl(url, priority) {
        const source = String(url || '').trim();
        if (!source) return '';
        if (!isGeneratedAssetUrl(source)) return source;
        const generatedAssets = options.generatedAssets || null;
        return generatedAssets && typeof generatedAssets.resolveUrl === 'function'
            ? String(generatedAssets.resolveUrl(source, priority ? { priority } : undefined) || '')
            : '';
    }

    // 选图只使用已知资源状态；缓存未命中先加载，不伪装成图片丢失或换衣许可。
    function readerSpriteAvailability(url) {
        const current = state.activeReader;
        const service = options.generatedAssets;
        const stored = isGeneratedAssetUrl(url) ? service?.imageAvailability?.(url) : null;
        if (stored && ['missing', 'read-error'].includes(stored.status)) return stored;
        const concrete = concreteReaderAssetUrl(url);
        if (!concrete) return { status: stored?.status === 'unverified' ? 'loading' : stored?.status || 'unverified' };
        const status = imageResourceCache.inspect(concrete);
        if (status.status !== 'unverified' || imageResourceCache.get(concrete)) return status;
        if (current) resolveReaderAssetUrl(concrete, current);
        return imageResourceCache.inspect(concrete);
    }

    // 状态栏头像存在图库（igs-gen:）时换成已读回的图；还没读回先空着，读回后 image-loaded 会重绘。
    function withConcreteAvatar(model) {
        if (model && isGeneratedAssetUrl(model.avatar)) model.avatar = concreteReaderAssetUrl(model.avatar);
        return model;
    }

    function warmActiveFloorImages(mountedSnapshot, loadedImageId = '') {
        const current = state.activeReader;
        const payload = current && current.payload;
        const snapshot = mountedSnapshot || (current && current.snapshot);
        if (!payload || !snapshot) return;
        const readerSettings = snapshot.readerSettings || {};
        const liveMessage = (payload.message && payload.message.raw) || payload.message || payload.raw || '';
        const source = String(payload.raw || (typeof liveMessage === 'string' ? liveMessage : '') || '');
        const slots = snapshot.content && Array.isArray(snapshot.content.imageSlots) ? snapshot.content.imageSlots : [];
        const floor = snapshot[preparedFloorKey];
        const key = `${firstDefined(payload.messageId, payload.message && payload.message.id, '')}:${source.length}:${slots.map((slot) => (slot && slot.url) || '').join('|')}`;
        const live2dKey = JSON.stringify([readerSettings._live2d?.enabled, Object.keys(readerSettings._live2d?.bindings || {})]);
        const planKey = key + ':' + live2dKey;
        const planChanged = floorAssetPlan.key !== planKey || floorAssetPlan.reader !== current || floorAssetPlan.floor !== floor;
        if (planChanged) {
            floorAssetPlan = {
                key: planKey, reader: current, floor,
                urls: collectFloorAssetUrls({ prepared: floor, imageSlots: slots }),
            };
        }
        const updatedUrls = floor?.assets?.takeUpdatedUrls() || [];
        if (!planChanged) for (const url of updatedUrls) {
            const concrete = concreteReaderAssetUrl(url);
            if (concrete) imageResourceCache.load(concrete);
        }
        // 每楼只完整预热一次；缓存放不下的后续页图片由出场页按需读，不能在每次重绘中反复补满。
        const spriteRef = loadedImageId ? `igs-gen:${loadedImageId}` : '';
        if (!planChanged) {
            if (!spriteRef || !floorAssetPlan.urls.includes(spriteRef)) return;
            const ready = concreteReaderAssetUrl(spriteRef);
            if (ready) imageResourceCache.load(ready);
            return;
        }
        // 整楼预热用低优先级，让当前页要显示的图先下载。
        for (const url of floorAssetPlan.urls) {
            const concrete = concreteReaderAssetUrl(url, 'low');
            if (concrete) imageResourceCache.load(concrete);
        }
    }

    function resolveReaderAssetUrl(url, current) {
        const source = String(url || '').trim();
        if (!source) return '';
        const leases = current.assetLeases ||= options.media?.cache ? createMediaLeaseScope(options.media.cache) : null;
        if (isGeneratedAssetUrl(source)) { leases?.use(`asset:${source.slice(8)}`); return concreteReaderAssetUrl(source); }
        const ownedKey = options.media?.cache?.sourceId?.(source);
        if (ownedKey) leases?.use(ownedKey);
        const ready = imageResourceCache.get(source);
        if (ready) { const key = options.media?.cache?.sourceId?.(ready); if (key) leases?.use(key); return ready; }
        // data / blob 已经是本地像素。先原样画上，解码只为了预热缓存；
        // 等解码完再补地址会先把背景清成空的，播 CG 时整屏闪一下。
        const inline = /^(?:data:|blob:)/i.test(source);
        if (!current.assetLoadRequests.has(source)) {
            const request = {};
            current.assetLoadRequests.set(source, request);
            const loading = imageResourceCache.load(source);
            const immediate = imageResourceCache.get(source);
            loading.then(() => {
                if (current.assetLoadRequests.get(source) !== request) return;
                current.assetLoadRequests.delete(source);
                if (inline || state.activeReader !== current) return;
                // 读取结束不等于出现可显示的新图；读空或被预算淘汰时不能自行重绘、重读。
                const loaded = imageResourceCache.get(source);
                if (!loaded || loaded === immediate) return;
                const content = current.snapshot && current.snapshot.content;
                if (!pageUsesAsset(content, source)) return;
                updateMountedReader(current.snapshot);
            }, () => {
                if (current.assetLoadRequests.get(source) === request) current.assetLoadRequests.delete(source);
            });
            if (immediate) return immediate;
        }
        return inline ? source : '';
    }

    function closeReader(closeOptions = {}) {
        const current = state.activeReader;
        if (!current) return { ok: true, reason: 'reader-not-open' };
        current.replyRecoveryController?.abort();
        if (closeOptions.keepSettings !== true) {
            const closed = closeSettings();
            if (closed.ok === false) {
                reportSettingsFailure(closed);
                return closed;
            }
        }
        if (turnIndexPanel) turnIndexPanel.close();
        current.consistencyTask?.controller.abort();
        if (current.consistencyTask) pageModal.cancel();
        // 真正关闭（不是切轮重开）时把阅读进度同步进聊天元数据，换设备也能续读。
        if (closeOptions.keepFullscreen !== true) pushProgressToMetadata();
        teardownStatusHudSubscription();
        current.autoPlayer?.stop();
        stopTts();
        clearReaderToast(current);
        cancelTypewriter(current.dom && current.dom.text, { finish: false });
        current.spriteTextWait?.release();
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
        stopTitleFrameWatch(current);
        if (current.pageRenderTimer) clearTimeout(current.pageRenderTimer);
        current.pageRenderTimer = 0;
        clearReaderModeRuntime(current);
        if (closeOptions.keepFullscreen !== true) {
            exitDocumentFullscreen(getRootDocument(options.global));
        }
        current.assetLeases?.releaseAll();
        if (floorAssetPlan.reader === current) floorAssetPlan = { key: '', reader: null, urls: [] };
        current.imagePollToken += 1;
        streamObserver.stop();
        stopReplyWatchdog();
        stopEmbeddedStoryWatch();
        // 关阅读器时把等待过场一并收掉，别留下还在轮台词的一层和等着换页的旧楼。
        waitStage.close();
        pendingReplyMessage = null;
        sourceCache.invalidate();
        tableData.invalidate();
        if (current.dom && typeof current.dom.dispose === 'function') {
            current.dom.dispose();
        }
        unmountNode(current.dom && current.dom.root);
        state.activeReader = null;
        wakeRecoveringOperations(options.global || globalThis);
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
                snapshot: cloneSnapshotKeepAssets(state.activeReader.snapshot),
            } : null,
            activeSettings: state.activeSettings ? {
                tab: state.activeSettings.tab,
                snapshot: cloneSnapshotKeepAssets(state.activeSettings.snapshot),
            } : null,
        };
    }

    function destroy() {
        readerRecoveryController.abort();
        recoveryNotice.dispose();
        state.activeSettings?.recoveryController?.abort();
        moodAutoDisposed = true;
        if (moodAutoTimer) moodAutoTimers().clearTimeout(moodAutoTimer);
        moodAutoTimer = 0;
        const closed = closeSettings();
        if (closed.ok === false) return closed;
        mediaHostDisposed = true; offMediaClear();
        offIllustrationUpdated();
        offDlcSkins();
        offDlcFx();
        offIllustrationProgress();
        offImageActivity();
        generationStrip.dispose();
        offGeneratedAssetUpdated();
        offSettingsUpdated();
        offStoryOutfits();
        if (!options.storyOutfits) storyOutfits?.dispose();
        offItemImageUpdated();
        offWaitGamePack();
        offImageJobLog();
        teardownStatusHudSubscription();
        closeReader();
        sourceCache.invalidate();
        tableData.invalidate();
        disarmEditReopen();
        streamObserver.stop();
        imageResourceCache.destroy();
        return { ok: true };
    }

    // 五种模式都跟宿主回复：发送后进等待过场，新回复写完原地换源。内嵌另有一套挂载路径。
    function tracksHostReply(mode) {
        return Boolean(mode);
    }

    // 旧调用点按模式判定的写法保留：现在五种模式一律跟回复，统一由等待过场承接。
    function followsHostReply() {
        return true;
    }

    function handleChatStreamActivity() {
        const current = state.activeReader;
        if (!current || !tracksHostReply(current.mode)) return;
        // 正在读旧楼且不是自己发的：不拉回最新，只提示一句。
        if (Number(current.turnOffset) > 0 && !current.awaitingReply) { noticeNewFloor(); return; }
        if (isEmbeddedReaderMode(current.mode)) {
            syncEmbeddedStreamMount(current);
            enterEmbeddedLoading({ observed: true });
            return;
        }
        enterReplyWait(current, { observed: true });
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
        if (messageId == null || isUserFloorId(messageId)) return null;
        return { id: messageId, element };
    }

    // 以聊天数据为准：插件改写用户楼时 DOM 的 is_user 可能丢失。
    function isUserFloorId(messageId) {
        if (typeof options.isUserFloor !== 'function') return false;
        try { return options.isUserFloor(messageId) === true; } catch (error) { return false; }
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
    async function handleChatStreamStable(settled) {
        const current = state.activeReader;
        if (!current || !tracksHostReply(current.mode)) return true;
        if (!streamObserver.hasGenerationSettled()) return false;
        if (Number(current.turnOffset) > 0 && !current.awaitingReply && current.streamPhase !== 'streaming') {
            noticeNewFloor();
            return true;
        }
        if (typeof options.getCurrentMessage !== 'function'
            || typeof options.openViewerFromMessage !== 'function') {
            showReplyFailure(current, 'read');
            return false;
        }
        if (settled.reason === 'stopped' || settled.reason === 'failed') {
            showReplyFailure(current, settled.reason);
            return settled.reason === 'stopped';
        }
        let message;
        try {
            message = await readReplyMessage();
        } catch (error) {
            if (state.activeReader === current && streamObserver.isCurrentRevision(settled.revision)) {
                showReplyFailure(current, 'read');
            }
            return false;
        }
        if (state.activeReader !== current || !streamObserver.isCurrentRevision(settled.revision)) return false;
        if (!streamObserver.hasGenerationSettled()) return false;
        if (!message || message.id == null || message.isUser || message.isSystem
            || message.is_user || message.is_system || isUserFloorId(message.id)) {
            showReplyFailure(current, 'empty');
            return false;
        }
        const nextRaw = getMessagePrimaryText(message.raw || message);
        const nextVisible = String(message.visibleText || '');
        const baselineId = current.replyBaselineMessageId ?? current.contentMessageId;
        const changed = Number(message.id) !== Number(baselineId)
            || nextRaw.trim() !== String(current.streamBaselineRaw || '').trim();
        const parsed = buildIgsTextPayload(message, {
            sourceFilter: current.payload.sourceFilter,
            virtualRegex: current.payload.virtualRegex,
            sceneAssets: current.snapshot.readerSettings._sceneAssets,
            visibleText: nextVisible,
        });
        if (!changed || !(parsed.textSegments.length || parsed.htmlCards.length || parsed.chats.length)) {
            showReplyFailure(current, 'empty');
            return false;
        }
        // 回复已写完：正在玩就先记下这一楼，等玩家点「加载下一楼」再换。
        if (!waitStage.replyArrived()) {
            pendingReplyMessage = { reader: current, message, revision: settled.revision };
            return true;
        }
        await applyReplyMessage(current, message, settled.revision);
        return true;
    }

    // 换到新写的这一楼：内嵌要先把阅读器挂到新楼层里，其余模式就地换源。
    async function applyReplyMessage(current, message, revision, { confirmed = false } = {}) {
        const canReplace = () => state.activeReader === current && (confirmed || streamObserver.isCurrentRevision(revision));
        if (!current || !canReplace()) return;
        const embedded = isEmbeddedReaderMode(current.mode);
        const previous = { turnOffset: current.turnOffset, mountMessageId: current.mountMessageId };
        current.turnOffset = 0;
        current.mountMessageId = message.id;
        if (embedded) syncEmbeddedReaderMount(current, message);
        try {
            const result = await recoverOperation(() => options.openViewerFromMessage(message.id, current.mode, {
                replaceActive: true,
                turnOffset: 0,
                mountMessageId: message.id,
                message,
                canReplace,
            }), { signal: readerRecoveryController.signal, isActive: canReplace,
                global: options.global || globalThis, repair: () => sourceCache.invalidate() });
            if (!canReplace()) return;
            if (result && result.ok === false) {
                current.turnOffset = previous.turnOffset;
                current.mountMessageId = previous.mountMessageId;
                showReplyFailure(current, result.reason === 'no-readable-text' ? 'empty' : 'read');
                return;
            }
            exitEmbeddedLoading();
        } catch (error) {
            if (canReplace()) {
                current.turnOffset = previous.turnOffset;
                current.mountMessageId = previous.mountMessageId;
                showReplyFailure(current, 'read');
            }
        }
    }

    // 玩家点「加载下一楼」：之后 #chat 的任何变动（含别的插件改按钮）都会让观察器版本号前进，
    // 这里不再核对版本号，否则静默放弃、等待层卡在「正在打开下一楼…」。记录丢了就现读最新楼。
    async function finishPendingWaitExit() {
        const current = state.activeReader;
        const pending = pendingReplyMessage;
        pendingReplyMessage = null;
        if (!current) return;
        if (pending && pending.reader === current) {
            await applyReplyMessage(current, pending.message, pending.revision, { confirmed: true });
            return;
        }
        let message = null;
        try { message = await readReplyMessage(); } catch (error) { /* 读不到就退回当前楼 */ }
        if (state.activeReader !== current) return;
        if (message && message.id != null && !message.isUser && !message.is_user && !isUserFloorId(message.id)) {
            await applyReplyMessage(current, message, null, { confirmed: true });
            return;
        }
        exitEmbeddedLoading();
    }

    async function readReplyMessage() {
        const timers = options.global || globalThis;
        let timeout;
        try {
            return await Promise.race([
                Promise.resolve().then(() => options.getCurrentMessage()),
                new Promise((_, reject) => {
                    timeout = timers.setTimeout(() => reject(new Error('reply-read-timeout')), 5000);
                }),
            ]);
        } finally {
            timers.clearTimeout(timeout);
        }
    }

    function showReplyFailure(current, kind) {
        if (state.activeReader !== current) return;
        if (kind !== 'stopped') {
            current.streamPhase = 'streaming';
            current.awaitingReply = true;
            mountWaitStage(current, { embedded: isEmbeddedReaderMode(current.mode) });
            waitStage.showSlow();
            if (kind === 'read') return; // 稳定观察器自动续读现有回复，不重发故事请求。
            if (current.replyRecovery) return;
            const controller = new AbortController();
            const chatId = options.getCurrentChatId?.();
            current.replyRecoveryController = controller;
            const linked = linkRecoverySignals([controller.signal, readerRecoveryController.signal]), signal = linked.signal;
            current.replyRecovery = recoverOperation(async () => {
                streamObserver.prepareForReply();
                return await options.resumeReply?.() || { ok: false, reason: 'reply-host-not-ready' };
            }, { signal, global: options.global || globalThis, initialDelayMs: 1000,
                isActive: () => state.activeReader === current && options.getCurrentChatId?.() === chatId,
            }).finally(() => { linked.release(); current.replyRecovery = null; current.replyRecoveryController = null; });
            return;
        }
        current.replyRecoveryController?.abort();
        pendingReplyMessage = null;
        streamObserver.cancelPending();
        current.streamPhase = 'error';
        wakeRecoveringOperations(options.global || globalThis);
        current.awaitingReply = false;
        const overlay = current.dom && current.dom.overlay;
        if (overlay && overlay.classList) overlay.classList.remove('igs-awaiting-reply');
        mountWaitStage(current, { embedded: isEmbeddedReaderMode(current.mode) });
        waitStage.showFailure(kind);
    }

    // 等待过场的台词池是从最近几楼的正文里现抽的，等树跑完再补一次即可。
    async function refreshWaitStageModel(current) {
        if (!current) return null;
        const turns = await listTurnsSafe();
        if (state.activeReader !== current || !waitStage.isOpen()) return null;
        const all = turns.length ? turns.slice(-7) : (Array.isArray(current.payload && current.payload.turns) ? current.payload.turns.slice(-7) : []);
        // 牌面保留图库原地址（igs-gen:），这里不读图；小游戏显示哪张再用 loadImage 读哪张。
        const model = buildWaitStageModel({
            settings: current.snapshot && current.snapshot.readerSettings && current.snapshot.readerSettings.waitStage,
            turns: all,
            sceneAssets: current.snapshot && current.snapshot.readerSettings && current.snapshot.readerSettings._sceneAssets,
            spriteHeads: current.snapshot && current.snapshot.readerSettings && current.snapshot.readerSettings.spriteHeads,
        });
        waitStage.update(model);
        return model;
    }

    // 语气音：回放角色自己的台词时配一声短音；通用兜底句不放。
    function playWaitStageVoice(line) {
        const current = state.activeReader;
        if (!current || !line || !line.who) return;
        const settings = current.snapshot && current.snapshot.readerSettings;
        if (!settings) return;
        const root = current.dom && (current.dom.overlay || (current.dom.embeddedMount && current.dom.embeddedMount.host));
        if (!root) return;
        try {
            applyVoiceBark(root, {
                key: `waitstage:${line.who}:${line.text}`,
                textType: 'dialogue',
                speaker: line.who,
                mood: line.mood || '',
                cast: [line.who],
            }, settings.voiceBark, settings._sceneAssets);
        } catch (error) {
            // 语气音失败不影响过场。
        }
    }

    // 关掉「等待过场」只收起台词与小游戏，三点等待反馈五种模式都留着（内嵌关了就是开天窗）。
    function mountWaitStage(current, { embedded = false } = {}) {
        const host = embedded
            ? (current.dom && current.dom.embeddedMount && current.dom.embeddedMount.host)
            : (current.dom && current.dom.overlay);
        if (!host) return;
        // 层已经在等就别重建：重建会把台词轮换打回第一句，也会抹掉玩家点开的小游戏。
        if (waitStage.isOpen(host)) {
            waitStage.enterWait();
            return;
        }
        const settings = (current.snapshot && current.snapshot.readerSettings && current.snapshot.readerSettings.waitStage) || null;
        waitStage.open(host, { embedded, settings, model: null });
        void refreshWaitStageModel(current);
    }

    // 工具栏「小游戏」：不等回复也把这一层叫出来玩，再按一次或点「返回阅读」收起。
    function toggleMiniGames() {
        const current = state.activeReader;
        const host = current && current.dom && current.dom.overlay;
        if (!host) return { ok: false, reason: 'reader-not-open' };
        if (waitStage.isPlaying()) {
            waitStage.close();
            return { ok: true, open: false };
        }
        // 正在等回复时小游戏本来就摆在等待层里。
        if (waitStage.isOpen()) return { ok: false, reason: 'awaiting-reply' };
        if (!getWaitStageGamePack()) return { ok: false, reason: 'wait-games-not-installed' };
        const settings = (current.snapshot && current.snapshot.readerSettings && current.snapshot.readerSettings.waitStage) || null;
        waitStage.open(host, { settings, model: null, play: true });
        void refreshWaitStageModel(current);
        return { ok: true, open: true };
    }

    // observed：观察器自己报的活动，本轮生命周期已武装；再 prepareForReply 会抹掉刚记下的活动与结束标记，等待层就退不掉。
    function enterReplyWait(current, { observed = false } = {}) {
        if (!current) return;
        if (current.streamPhase !== 'streaming') {
            // 正在玩的小游戏留着，下面 mountWaitStage 会把它就地变成等待层。
            if (!waitStage.isPlaying()) waitStage.close();
            pendingReplyMessage = null;
            current.imagePollToken += 1;
            current.imagePolling = false;
            current.streamBaselineRaw = String(current.mountBaselineRaw || '');
            current.replyBaselineMessageId = current.contentMessageId;
            if (!observed) streamObserver.prepareForReply();
        }
        current.streamPhase = 'streaming';
        current.awaitingReply = true;
        const overlay = current.dom && current.dom.overlay;
        if (overlay && overlay.classList) overlay.classList.add('igs-awaiting-reply');
        mountWaitStage(current);
        startReplyWatchdog();
    }

    // 等待中兜底：生成结束信号丢了时等待层会一直轮台词。每几秒看一眼，新 AI 楼已落地就补一次稳定处理。
    // 只认楼号比发送前大的 AI 楼，回复没到时不触发，免得读到用户楼当成空回复去重发。
    // 计时器变量声明在上面 return host 之前：写在 return 之后会被压缩器当死代码删掉，线上报 cl is not defined。

    function startReplyWatchdog() {
        if (replyWatchdog != null) return;
        const timers = options.global || globalThis;
        if (typeof timers.setInterval !== 'function') return;
        replyWatchdog = timers.setInterval(checkReplyLanded, 4000);
    }

    function stopReplyWatchdog() {
        if (replyWatchdog == null) return;
        const timers = options.global || globalThis;
        if (typeof timers.clearInterval === 'function') timers.clearInterval(replyWatchdog);
        replyWatchdog = null;
    }

    function checkReplyLanded() {
        const current = state.activeReader;
        if (!current || current.streamPhase !== 'streaming') { stopReplyWatchdog(); return; }
        const latest = resolveLatestLiveAiMessage(resolveEmbeddedDocument(current));
        const baselineId = current.replyBaselineMessageId ?? current.contentMessageId;
        if (!latest || baselineId == null || !(Number(latest.id) > Number(baselineId))) return;
        streamObserver.kick();
    }

    function enterEmbeddedLoading({ observed = false } = {}) {
        const current = state.activeReader;
        const mount = current && current.dom && current.dom.embeddedMount;
        if (!current || !isEmbeddedReaderMode(current.mode) || !mount || !mount.host) return;
        if (current.streamPhase !== 'streaming') {
            waitStage.close();
            pendingReplyMessage = null;
            current.imagePollToken += 1;
            current.imagePolling = false;
            current.streamBaselineRaw = String(current.mountBaselineRaw || '');
            current.replyBaselineMessageId = current.contentMessageId;
            if (!observed) streamObserver.prepareForReply();
        }
        current.streamPhase = 'streaming';
        current.turnOffset = 0;
        mount.host.setAttribute('data-igs-embedded-loading', '1');
        if (current.dom.root && current.dom.root.style) current.dom.root.style.display = 'none';
        mountWaitStage(current, { embedded: true });
        startReplyWatchdog();
    }

    function exitEmbeddedLoading() {
        const current = state.activeReader;
        if (!current) return;
        pendingReplyMessage = null;
        stopReplyWatchdog();
        current.streamBaselineRaw = '';
        current.replyBaselineMessageId = null;
        current.streamPhase = 'idle';
        wakeRecoveringOperations(options.global || globalThis);
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
        waitStage.close();
        if (current.dom && current.dom.root && current.dom.root.style) current.dom.root.style.display = '';
        if (current.deferredReviewKey) syncAssetReviewAfterRender(current, current.snapshot);
    }

    function remountEmbeddedReader(current, message) {
        if (!current || !current.dom || !current.dom.root) return;
        const root = current.dom.root;
        const doc = resolveEmbeddedDocument(current);
        // 换楼要换宿主节点，留在旧宿主里的层一并作废（同 syncReaderMountForMode）。
        waitStage.close();
        teardownEmbeddedMount(current.dom.embeddedMount);
        current.dom.embeddedMount = mountEmbeddedRoot(doc, root, message, message && message.id);
        if (!current.dom.embeddedMount) {
            (doc.documentElement || doc.body).appendChild(root);
            return;
        }
        // 酒馆重画楼层（开场白最常见）后宿主是新建的，没钉过比例，只剩最小高度、宽度占满，看着就是横屏。
        // 主界面盖着时正文不渲染，不会再钉，这里补钉，观察器改绑到新宿主。
        if (current.titleGate) {
            stopTitleFrameWatch(current);
            pinTitleFrame(current, current.dom.overlay);
        } else if (current.snapshot) {
            const reader = current.snapshot.readerSettings || {};
            pinEmbeddedHostFrame(current.dom.overlay, reader._cgBackgroundSize, current.snapshot.mode, reader.embeddedHeight);
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
            // 宿主节点马上要被拆掉，先清理过场层与小游戏状态。
            waitStage.close();
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
                return state.activeReader ? cloneSnapshotKeepAssets(state.activeReader.snapshot) : null;
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
        if (state.activeReader.streamPhase === 'streaming') {
            text = firstDefined(text, state.activeReader.inputValue, '');
            await recoverOperation(() => ({ ok: state.activeReader?.streamPhase !== 'streaming' }), {
                signal: readerRecoveryController.signal, global: options.global || globalThis,
                isActive: () => Boolean(state.activeReader),
                retryUnchanged: false,
                waitFor: { message: '正在等待本次回复生成完成，随后自动发送已输入的内容。' },
                canResume: () => state.activeReader?.streamPhase !== 'streaming',
            });
            if (!state.activeReader) return { ok: true, cancelled: true };
        }
        // 停在旧楼时发送：剧情会接在最新楼后面，先确认，免得以为是在旧楼的语境里接着写。
        if (Number(state.activeReader.turnOffset) > 0) {
            const floorId = currentTurnMessageId(state.activeReader);
            const confirmed = await pageModal.confirm(`现在停在旧楼（第 ${floorId} 楼）。发送后剧情接在最新楼后面，回复到了会切过去。继续发送？`);
            if (!confirmed) return { ok: false, sent: false, reason: 'old-floor-cancelled' };
            if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        }
        const current = state.activeReader;
        const nextText = String(firstDefined(text, current.inputValue, '') || '');
        if (!nextText.trim()) return { ok: false, sent: false, reason: 'empty-input' };
        const embedded = isEmbeddedReaderMode(current.mode);
        const fullscreen = followsHostReply(current.mode);
        if (embedded) enterEmbeddedLoading();
        else if (fullscreen) enterReplyWait(current);
        current.inputValue = nextText;
        if (typeof options.getCurrentMessage === 'function') {
            try {
                const baseline = await readReplyMessage();
                if (state.activeReader !== current) return { ok: false, sent: false, reason: 'reader-changed' };
                if (baseline && baseline.id != null) {
                    current.replyBaselineMessageId = baseline.id;
                    current.streamBaselineRaw = getMessagePrimaryText(baseline.raw || baseline);
                }
            } catch (error) {
                // 尚未发送时读取不到最新楼，保留打开阅读器时的基线。
            }
        }
        if (state.activeReader !== current) return { ok: false, sent: false, reason: 'reader-changed' };
        const send = typeof options.typeAndSend === 'function'
            ? options.typeAndSend
            : async () => ({ ok: false, reason: 'missing-send-handler' });
        let result;
        result = await recoverOperation(async () => await send(nextText) || { ok: true }, {
            signal: readerRecoveryController.signal,
            isActive: () => state.activeReader === current, global: options.global || globalThis,
        });
        if (state.activeReader !== current) return { ok: result.ok !== false, sent: result.ok !== false, text: nextText, result };
        if (result.ok === false) {
            showReplyFailure(current, 'send');
        } else {
            if (current.streamPhase === 'streaming') streamObserver.noteActivity();
            current.inputValue = '';
        }
        // 漫画模式：发出去后输入框收起，新回复到了再出来。
        const sentSnapshot = current.snapshot;
        if (result.ok !== false && current.streamPhase === 'streaming' && sentSnapshot && isComicModeActive(sentSnapshot.readerSettings)) {
            state.activeReader.comicInputSent = comicContentKey(sentSnapshot);
            const overlay = state.activeReader.dom && state.activeReader.dom.overlay;
            const controls = overlay && overlay.querySelector ? overlay.querySelector('.igs-controls') : null;
            if (controls && controls.setAttribute) controls.setAttribute('data-igs-comic-sent', '1');
        }
        if (current.dom && current.dom.input) {
            current.dom.input.value = current.inputValue;
        }
        if (!(embedded || fullscreen)) {
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
            reader = normalizeReaderSettingsCached(unified.readerSettings, bridge.vnTheme);
        }
        const position = (ob.position === 'top-center' || ob.position === 'top-right') ? ob.position : 'top-left';
        return {
            enabled: ob.enabled === true,
            position,
            clickAction: ob.clickAction === 'fill' ? 'fill' : 'send',
            widthFollowsText: ob.widthFollowsText === true,
            fontSize: reader.optionFontSize,
            sources: normalizeOptionSources(ob),
        };
    }

    function readOptionItemCatalog(api) {
        try {
            const catalog = buildItemCatalog(createShujukuClient(api).readTables());
            return catalog && Array.isArray(catalog.items) ? catalog.items : [];
        } catch (error) {
            return [];
        }
    }

    function showItemPanel(container, cfg, catalog) {
        const doc = container.ownerDocument || getRootDocument(options.global);
        const overlay = container.closest && container.closest('#igs-overlay');
        const content = state.activeReader && state.activeReader.snapshot && state.activeReader.snapshot.content;
        const context = getSillyTavernContext(options.global || globalThis);
        const present = listPresentNames(content, context && context.name1 ? String(context.name1) : '');
        const make = (className, text) => {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = `igs-option-bubble igs-bubble ${className}`;
            button.textContent = text;
            return button;
        };
        const bind = (button, handler) => {
            button.addEventListener('pointerenter', () => playReaderUiSfx('hover'));
            button.addEventListener('click', (event) => {
                if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                playReaderUiSfx('confirm');
                handler();
            });
            return button;
        };
        const back = (label, handler) => bind(make('igs-option-mini', label), handler);
        const toList = () => showOptionBubbles(container, cfg, { silent: true });
        const startPanel = (className) => {
            clearChildren(container);
            container.setAttribute('data-igs-panel', 'item');
            // 图片、状态栏等同页异步更新会重绘阅读器；目录与动作菜单应继续留在当前页。
            const snapshot = state.activeReader && state.activeReader.snapshot;
            container.setAttribute('data-igs-panel-page', `${snapshot && snapshot.chatId || ''}|${snapshot && snapshot.messageId}|${snapshot && snapshot.swipeId || 0}|${snapshot && snapshot.content && snapshot.content.currentIndex}`);
            const panel = doc.createElement('div');
            panel.className = `igs-option-panel ${className}`;
            container.appendChild(panel);
            return panel;
        };
        const sendAction = (action, item, target) => {
            const text = buildItemActionText(action, item.name, target);
            if (!text) return;
            container.removeAttribute('data-igs-panel');
            onOptionBubbleClick(container, text, cfg);
        };
        const chooseAction = (item) => {
            const panel = startPanel('igs-option-actions');
            const title = doc.createElement('div');
            title.className = 'igs-option-panel-title';
            title.textContent = `【${item.name}】`;
            panel.appendChild(title);
            if (item.description) {
                const desc = doc.createElement('div');
                desc.className = 'igs-option-panel-desc';
                desc.textContent = item.description;
                panel.appendChild(desc);
            }
            const row = doc.createElement('div');
            row.className = 'igs-option-row';
            row.appendChild(bind(make('igs-option-mini', '使用'), () => sendAction('use', item)));
            if (present.length) {
                for (const name of present) row.appendChild(bind(make('igs-option-mini', `交给${name}`), () => sendAction('give', item, name)));
            } else {
                row.appendChild(bind(make('igs-option-mini', '交给…'), () => {
                    const text = buildItemActionText('give', item.name, '');
                    container.removeAttribute('data-igs-panel');
                    hideOptionBubbles(container);
                    if (overlay && overlay.classList) overlay.classList.add('igs-free-input');
                    onOptionBubbleClick(container, text, cfg, null, true);
                }));
            }
            row.appendChild(bind(make('igs-option-mini', '查看'), () => sendAction('inspect', item)));
            row.appendChild(back('返回', () => choosePick()));
            panel.appendChild(row);
        };
        const choosePick = () => {
            const panel = startPanel('igs-option-items');
            const grid = doc.createElement('div');
            grid.className = 'igs-option-grid';
            for (const item of catalog) {
                const button = make('igs-option-item', '');
                let url = '';
                try { url = options.itemImages && typeof options.itemImages.imageUrlFor === 'function' ? options.itemImages.imageUrlFor(item.name) : ''; } catch (error) { url = ''; }
                if (url) {
                    const img = doc.createElement('img');
                    img.className = 'igs-option-item-img';
                    img.setAttribute('src', url);
                    img.setAttribute('alt', '');
                    img.setAttribute('draggable', 'false');
                    button.appendChild(img);
                }
                const name = doc.createElement('span');
                name.className = 'igs-option-item-name';
                name.textContent = item.name;
                button.appendChild(name);
                if (item.description) {
                    const desc = doc.createElement('span');
                    desc.className = 'igs-option-item-desc';
                    desc.textContent = item.description;
                    button.appendChild(desc);
                }
                grid.appendChild(bind(button, () => chooseAction(item)));
            }
            panel.appendChild(grid);
            const row = doc.createElement('div');
            row.className = 'igs-option-row';
            row.appendChild(back('返回', toList));
            panel.appendChild(row);
        };
        choosePick();
    }

    function isReaderLastPage(snapshot) {
        const segs = snapshot && snapshot.content && Array.isArray(snapshot.content.segments)
            ? snapshot.content.segments.length : 0;
        const idx = snapshot && snapshot.content ? Number(snapshot.content.currentIndex) : 0;
        return segs <= 0 || idx >= segs - 1;
    }

    function handleOptionBubbleBlankClick(current, snapshot) {
        // 历史楼层只读；末页的点击用于继续阅读下一轮，不打开当前数据库的选项。
        if (Number(current && current.turnOffset) > 0) return false;
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
        container.removeAttribute('data-igs-panel');
        container.removeAttribute('data-igs-panel-page');
        syncStatusHudOptionSuppression(container, false);
        clearChildren(container);
    }

    function showOptionBubbles(container, cfg, optionsForShow = {}) {
        const doc = container.ownerDocument || getRootDocument(options.global);
        const api = (options.global || globalThis).AutoCardUpdaterAPI || null;
        const sources = cfg.sources || normalizeOptionSources(null);
        let items = readOptionItems(createShujukuClient(api));
        // 有选项表时以表为准；表缺失或为空才读正文末尾的编号选项。
        if (!items.length && sources.bodyFallback) {
            const content = state.activeReader && state.activeReader.snapshot && state.activeReader.snapshot.content;
            items = extractBodyChoices(content && (content.fullText || content.text));
        }
        const quick = splitQuickActions(sources.quickActions);
        const itemCatalog = sources.itemButton ? readOptionItemCatalog(api) : [];
        const floatOverlay = container.closest && container.closest('#igs-overlay');
        const floatInput = Boolean(floatOverlay && floatOverlay.getAttribute('data-igs-input') === 'float');
        // 悬浮输入框没有选项时也只给一条「采取其他行动」，点了才出框。
        if (!items.length && !quick.length && !itemCatalog.length && !floatInput) {
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
        container.removeAttribute('data-igs-panel');
        container.removeAttribute('data-igs-panel-page');
        if (quick.length) {
            const row = doc.createElement('div');
            row.className = 'igs-option-row';
            for (const phrase of quick) {
                const mini = doc.createElement('button');
                mini.type = 'button';
                mini.className = 'igs-option-bubble igs-bubble igs-option-mini';
                mini.textContent = phrase;
                mini.addEventListener('pointerenter', () => playReaderUiSfx('hover'));
                mini.addEventListener('click', (event) => {
                    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                    playReaderUiSfx('confirm');
                    onOptionBubbleClick(container, phrase, cfg);
                });
                row.appendChild(mini);
            }
            container.appendChild(row);
        }
        if (itemCatalog.length) {
            const entry = doc.createElement('button');
            entry.type = 'button';
            entry.className = 'igs-option-bubble igs-bubble igs-item-entry-bubble';
            entry.textContent = '使用物品';
            entry.addEventListener('pointerenter', () => playReaderUiSfx('hover'));
            entry.addEventListener('click', (event) => {
                if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                playReaderUiSfx('confirm');
                showItemPanel(container, cfg, itemCatalog);
            });
            container.appendChild(entry);
        }
        const overlayForInput = container.closest && container.closest('#igs-overlay');
        if (overlayForInput && overlayForInput.classList) overlayForInput.classList.remove('igs-free-input');
        if (overlayForInput && overlayForInput.getAttribute('data-igs-input') === 'float') {
            const free = doc.createElement('button');
            free.type = 'button';
            free.className = 'igs-option-bubble igs-bubble igs-free-input-bubble';
            free.textContent = '采取其他行动';
            free.addEventListener('click', (event) => {
                if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                playReaderUiSfx('confirm');
                hideOptionBubbles(container);
                overlayForInput.classList.add('igs-free-input');
                const input = overlayForInput.querySelector('#igs-input');
                if (input && typeof input.focus === 'function') input.focus();
            });
            container.appendChild(free);
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

    async function onOptionBubbleClick(container, rawText, cfg, check = null, forceFill = false) {
        hideOptionBubbles(container);
        const text = await resolveOptionSendText(rawText, check);
        if (cfg.clickAction === 'fill' || forceFill) {
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
        if (payload.kind === 'consistency') return; // 当前任务由阅读器身份绑定的回调展示。
        generationStrip.floor(payload.messageId, payload.phase === 'done');
    }

    function openLive2dManager(character = '') {
        state.live2dEditor?.close(true);
        const win = options.global || globalThis;
        let storage; try { storage = win.localStorage; } catch { /* 编辑器会报告保存错误 */ }
        const settings = state.activeSettings;
        const scope = settings ? rememberAssetScope(settings, getSillyTavernContext(win)).assetScopeKey || '' : resolveAssetScope(getSillyTavernContext(win)).key;
        const assets = settings ? draftEffectiveAssets(settings) : state.activeReader?.snapshot?.readerSettings?._sceneAssets || {};
        const current = state.activeReader || { dom: { overlay: settings?.dom?.root }, snapshot: { content: {} } };
        state.live2dEditor = openLive2dPanel(current, storage, () => {
            if (state.activeSettings) rerenderSettings();
            if (state.activeReader) rerenderActiveReader();
        }, { root: current.dom?.overlay || settings?.dom?.root, scope, scopeLabel: settings?.asyncState?.assetScopeLabel || '当前角色卡', character, characters: assets.characters || {}, moodGroups: assets.moodGroups, onClose: () => { state.live2dEditor = null; } });
        return state.live2dEditor;
    }

    async function handleReaderAction(action) {
        if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        const normalizedAction = String(action || '').trim();
        if (state.activeReader.titleGate && normalizedAction !== 'settings' && normalizedAction !== 'close') {
            return { ok: false, reason: 'title-screen' };
        }
        state.activeReader.lastAction = normalizedAction;
        if (PROGRESS_NAV_ACTIONS.has(normalizedAction)) armReadingProgress(state.activeReader);

        if (normalizedAction === 'live2d-settings') {
            const name = state.activeReader.snapshot.content.spriteCharacter || state.activeReader.snapshot.content.speaker || '';
            openSettings({ tab: 'chars', page: 'chars' });
            return openLive2dManager(name);
        }
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
            // 读到最后一页：后面还有楼就接着进下一楼。不只看 turnOffset：新楼生成时阅读器没跟过去（设置开着、
            // 生成没走阅读器等），turnOffset 仍是 0，后面却已经有楼了。
            if (isReaderLastPage(current.snapshot) && (Number(current.turnOffset) > 0
                || (!current.awaitingReply && current.streamPhase !== 'streaming'))) {
                const moved = await moveReaderTurn(1, { quiet: true });
                if (moved.reason !== 'turn-not-found') return moved;
            }
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
        if (normalizedAction === 'retry-failed-cg') {
            return rerollCurrentIllustration({ skipConfirm: true });
        }
        if (normalizedAction === 'consistency-cg') {
            return redrawCurrentConsistency();
        }
        if (normalizedAction === 'cg-gallery') {
            return openCgGallery();
        }
        if (normalizedAction === 'mini-games') {
            return toggleMiniGames();
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
            if (overlay && !enterLivePortraitEdit(overlay, buildSpriteEditContext()) && !enterCgPortraitEdit(overlay, buildSpriteEditContext()) && !enterCastSlotEdit(overlay, state.activeReader, buildSpriteEditContext())) enterSpriteEditMode(overlay, state.activeReader, buildSpriteEditContext());
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

    // 快速连翻：距上次整页渲染不到 PAGE_RENDER_GAP_MS 只记页码，到点按最后停的那页渲染一次；中间页不放演出、不起音效。
    function renderTurnedPage(current) {
        if (current.pageRenderTimer) return;
        const wait = PAGE_RENDER_GAP_MS - (Date.now() - (current.pageRenderAt || 0));
        if (wait <= 0) {
            current.pageRenderAt = Date.now();
            rerenderActiveReader();
            return;
        }
        current.pageRenderTimer = setTimeout(() => {
            current.pageRenderTimer = 0;
            if (state.activeReader !== current) return;
            current.pageRenderAt = Date.now();
            rerenderActiveReader();
        }, wait);
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
        renderTurnedPage(state.activeReader);
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
        const readerSettings = normalizeReaderSettingsCached(unified.readerSettings, unified.bridge.vnTheme);
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
        readerStaleBehindSettings = false;
        return { ok: true };
    }

    // 切轮只换阅读源，不调用宿主跳楼：/chat-jump 到截断范围外的旧楼会让酒馆把中间楼层全部渲染出来。
    async function moveReaderTurn(delta, { quiet = false } = {}) {
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
            if (!quiet) writeToast(delta > 0 ? '没有下一轮' : '没有上一轮');
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
            result = await recoverOperation(() => options.openViewerFromMessage(target.id, current.mode, embedded
                ? { startAtEnd: false, message: target, replaceActive: true, skipImageCollection: nextOffset > 0, turnOffset: nextOffset, skipTitle: true }
                : { startAtEnd: false, message: target, turnOffset: nextOffset, skipTitle: true }), {
                    signal: readerRecoveryController.signal,
                    isActive: () => Boolean(state.activeReader), global: options.global || globalThis });
        } finally {
            progressRuntime.navigating = false;
        }
        if (result && result.ok !== false) {
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
            userName: String((getSillyTavernContext(options.global || globalThis) || {}).name1 || ''),
            listTurns: listTurnsSafe,
            snippetOf: (turn) => (turn && (turn.visibleText || getMessagePrimaryText(turn.raw || turn))) || '',
            rawOf: (turn) => getMessagePrimaryText(turn && (turn.raw || turn)) || '',
            linesOf: (turn) => backlogLinesOf(turn),
            avatarOf: (name) => backlogAvatarOf(name, overlay.ownerDocument),
            currentPage: () => (state.activeReader ? Number(state.activeReader.index) || 0 : -1),
            ttsOn: () => Boolean(state.activeReader && normalizeTtsSettings(state.activeReader.snapshot?.readerSettings?.tts).enabled),
            canSpeak: (line) => {
                const readerSettings = state.activeReader?.snapshot?.readerSettings || {};
                const plan = decideTts({}, { key: '', textType: line.textType, speaker: line.speaker, text: line.text }, readerSettings.tts, { sceneAssets: readerSettings._sceneAssets, voices: listSystemVoices(), record: false });
                return Boolean(plan && !plan.skip);
            },
            speak: (line) => {
                const readerSettings = state.activeReader?.snapshot?.readerSettings || {};
                return speakTtsLine({ key: '', textType: line.textType, speaker: line.speaker, text: line.text }, readerSettings.tts, readerSettings._sceneAssets);
            },
            currentId:() => (state.activeReader ? currentTurnMessageId(state.activeReader) : null),
            onJump: (target) => (state.activeReader ? jumpToPosition(target) : null),
            onUnread: () => {
                const far = readingProgress.getFarthest();
                return state.activeReader ? skipToUnread(far ? far.id : 0) : null;
            },
            onRewind: (pos) => rewindFromPosition(pos),
            onSaveSlot: (key) => saveReadingSlot(key),
            onQuickSave: () => quickSaveReading(),
            confirm: (message, labels) => pageModal.confirm(message, labels),
            prompt: (message, value) => pageModal.prompt(message, value),
            getTheme: () => readSettingsTheme(),
            setTheme: (settingsTheme) => saveBridgePatch({ settingsTheme }),
        });
        return turnIndexPanel.open(overlay);
    }

    // 回想：按阅读器同一套分页拆出这一楼的每一页，page 与阅读器页号对应（点一句可跳回那页）。
    function backlogLinesOf(turn) {
        const current = state.activeReader;
        const readerSettings = (current && current.snapshot && current.snapshot.readerSettings) || {};
        let segments = [];
        try {
            segments = buildIgsTextPayload(turn && (turn.raw || turn), {
                sourceFilter: current && current.payload && current.payload.sourceFilter,
                virtualRegex: current && current.payload && current.payload.virtualRegex,
                visibleText: turn && turn.visibleText,
                sceneAssets: readerSettings._sceneAssets,
                sentencePaging: readerSettings._sentencePaging,
                dialogueSentencePaging: readerSettings._dialogueSentencePaging,
            }).textSegments || [];
        } catch (_) { segments = []; }
        return segments
            .map((seg) => stripSceneDirectivesInline(String(seg || '').replace(/[\u200B-\u200C\u2060-\u2064]/g, '')).trim())
            .filter(Boolean)
            .map((seg, page) => ({ ...guessTtsLine(seg), page }));
    }

    // 回想头像：状态栏头像优先，没有就裁默认立绘的脸；都没有返回 null（面板显示姓名首字）。
    function backlogAvatarOf(name, doc) {
        const current = state.activeReader;
        const assets = (current && current.snapshot && current.snapshot.readerSettings && current.snapshot.readerSettings._sceneAssets) || {};
        const key = resolveCharacterKey(assets.characters || {}, assets.characterAliases, name) || name;
        if (!current || !key) return null;
        const status = resolveStatusAvatar(assets.statusAvatars, key);
        if (status) return { url: resolveReaderAssetUrl(status, current) };
        const characters = assets.characters || {};
        const sprite = lookupAssetValue(characters[key], '', assets.moodGroups).url;
        const url = sprite ? resolveReaderAssetUrl(sprite, current) : '';
        return url ? { url, crop: resolveRegionCrop({ url }, 'face', 1, doc) } : null;
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
        return { id, page, head: textHead(segmentText(segments[page])), hash: textHash(content.fullText), thumb, place: content.sceneLocation || '', swipe: messageSwipeId(id) };
    }

    // 该楼当前选中的版本号；读不到记 null。
    function messageSwipeId(id) {
        try {
            const ctx = getSillyTavernContext(options.global || globalThis);
            const swipe = ctx && Array.isArray(ctx.chat) && ctx.chat[id] ? ctx.chat[id].swipe_id : null;
            return Number.isInteger(swipe) && swipe >= 0 ? swipe : null;
        } catch (_) { return null; }
    }

    // 从存档位或某一楼重来：建分支并切过去。失败不改动，只提示。
    async function rewindFromPosition(pos) {
        const result = await rewindController.rewind(pos);
        if (!result.ok) { if (!result.canUseCurrent) writeToast(result.text); return result; }
        // 阅读器若随聊天切换留着就立刻定位，否则等新聊天里阅读器打开时取走待办。
        if (state.activeReader) arriveAtRewind(state.activeReader);
        return result;
    }

    // 新分支里取走重来待办：导入截断后的进度，阅读器停在存档那页并提示一行。
    function arriveAtRewind(current) {
        const target = rewindController.consumePending();
        if (!target) return;
        progressRuntime.offered.add(currentChatIdText());
        progressRuntime.pulled.add(currentChatIdText());
        pushProgressToMetadata();
        setTimeout(async () => {
            if (state.activeReader !== current) return;
            await jumpToPosition({ pos: target });
            writeToast(REWIND_NOTICE);
        }, 400);
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
        // 默认用主界面样式（继续 / 最新一层）；设置里可改回简易弹窗。
        if (current.snapshot?.readerSettings?.resumePrompt !== 'simple') {
            current.titleGate = createTitleGate({ coverTurn: nextTitleCoverTurn((options.global || globalThis).localStorage), resume: { label: positionLabel(last) } });
            renderTitleGate(current);
            return;
        }
        const message = `上次读到 ${positionLabel(last)}${unread ? `，后面还有 ${unread} 楼没读` : ''}。\n接着上次阅读的地方，还是阅读最新一层？`;
        const resume = await pageModal.confirm(message, { okLabel: '继续上次', cancelLabel: '最新一层' });
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
            onReroll: (entry) => {
                const service = options.illustrations;
                if (!service || typeof service.rerollSlot !== 'function') return Promise.resolve({ ok: false, error: '当前未接入单张重画' });
                return service.rerollSlot({ chatId: entry.chatId, messageId: entry.messageId, swipeId: entry.swipeId, slot: entry.slot });
            },
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
            imageNotice(cg.reason === 'nothing-missing' ? 'skipped' : 'warn', cg.skipMessage);
            return cg;
        }
        return regen;
    }

    async function rerollCurrentIllustration({ skipConfirm = false } = {}) {
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
        if (!skipConfirm && !(await pageModal.confirm('只重画这一张？提示词不变。'))) {
            return { ok: true, reason: 'cancelled' };
        }
        const messageId = current.contentMessageId != null ? current.contentMessageId : current.payload.messageId;
        const identity = current.illustrationIdentity || {};
        if (current.illustrationPending) {
            writeGenerating();
            return { ok: true, reason: 'busy' };
        }
        setIllustrationPending(current, true);
        writeGenerating();
        paintRetryPlaceholder(current, { busy: true });
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
            current.imageFailureReason = result && result.ok !== false ? '' : retryFailureReason(result);
            return result || { ok: false, reason: 'error' };
        } catch (error) {
            current.imageFailureReason = retryFailureReason(error);
            if (state.activeReader === current) imageNotice('error', `重画异常：${(error && error.message) || error || '未知错误'}`);
            return { ok: false, reason: 'error' };
        } finally {
            setIllustrationPending(current, false);
            if (state.activeReader === current) paintRetryPlaceholder(current, { busy: false, reason: current.imageFailureReason });
        }
    }

    function retryFailureReason(source) {
        const failure = source && source.failure;
        return String((failure && failure.reason) || '').trim();
    }

    function paintRetryPlaceholder(current, retry) {
        const overlay = current && current.dom && current.dom.overlay;
        const bg = overlay && overlay.querySelector ? overlay.querySelector('#igs-bg') : null;
        setImageRetryState(bg, retry);
    }

    function setIllustrationPending(current, pending) {
        current.illustrationPending = pending;
        if (current.snapshot?.content) current.snapshot.content.imageRetrying = pending;
        if (state.activeReader === current) applyToolbarState(current.dom?.overlay, current);
    }

    async function redrawCurrentConsistency() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const content = current.snapshot?.content || {};
        const service = options.illustrations;
        if (!content.illustrationSlot || !content.illustrationActive || !content.illustrationUrl)
            return { ok: false, reason: 'no-current-cg', error: '当前页没有已保存的 IGS CG' };
        if (!service?.redrawConsistency || !service?.acceptConsistency || !service?.cancelConsistency) {
            imageNotice('warn', '当前未接入角色一致性重绘。');
            return { ok: false, reason: 'consistency-unavailable' };
        }
        if (current.consistencyTask) {
            current.consistencyTask.controller.abort();
            return { ok: true, reason: 'cancelled' };
        }
        if (current.illustrationPending) return { ok: false, reason: 'consistency-busy' };
        const identity = current.illustrationIdentity || {};
        const query = { chatId: identity.chatId,
            messageId: current.contentMessageId ?? current.payload.messageId,
            swipeId: identity.swipeId, slot: content.illustrationSlot };
        const controller = new AbortController();
        const stillCurrent = () => state.activeReader === current
            && String(current.illustrationIdentity?.chatId) === String(query.chatId)
            && Number(current.illustrationIdentity?.swipeId) === Number(query.swipeId)
            && Number(current.contentMessageId ?? current.payload.messageId) === Number(query.messageId)
            && Number(current.snapshot?.content?.illustrationSlot) === Number(query.slot);
        const task = { controller, stillCurrent };
        current.consistencyTask = task;
        setIllustrationPending(current, true);
        rerenderActiveReader();
        try {
            const result = await runCgConsistencyAction({ service, query, modal: pageModal,
                signal: controller.signal, stillCurrent,
                onProgress: (detail) => {
                    if (current.consistencyTask === task && stillCurrent())
                        generationStrip.progress(task, detail);
                } });
            if (state.activeReader === current && !controller.signal.aborted) {
                if (result?.ok && result.reason === 'accepted') {
                    rerenderActiveReader();
                    imageNotice(result.warning ? 'warn' : 'success', result.warning
                        ? 'CG 已保存，目录或显示同步需刷新重试。' : '角色一致性候选已接受。');
                } else if (result?.reason !== 'cancelled') {
                    imageNotice('warn', result?.error || `一致性重绘未保存：${result?.reason || '未知原因'}`);
                }
            }
            return result;
        } finally {
            controller.abort();
            generationStrip.progress(task, { phase: 'done' });
            if (current.consistencyTask === task) current.consistencyTask = null;
            setIllustrationPending(current, false);
            if (state.activeReader === current) rerenderActiveReader();
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
        // 工具栏按阅读器当前楼层出图：续读停在旧楼就画旧楼，不再要求最新楼。
        if (!floor || !floor.isAi || !floor.chatId || !String(floor.text || '').trim()) {
            return { messageId, reason: 'not-eligible', message: '当前楼层不是非空的 AI 回复' };
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
                feedback(result && result.reason === 'nothing-missing' ? 'skipped' : 'warn', message);
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
        setIllustrationPending(current, true);
        feedback('info', reroll
            ? `第 ${target.messageId} 楼正在重写提示词并重画…`
            : `第 ${target.messageId} 楼插图：正在检查过场 / NSFW 插图…`, true);
        try {
            const result = reroll
                ? await service.rerollFloor(Number(target.messageId))
                : await service.processMessage(Number(target.messageId), { manual: true });
            const skipped = {
                disabled: '请在设置「生图与AI › 画师与模型」开启 NSFW 或过场插图并保存',
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
            setIllustrationPending(current, false);
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
                feedback(result && result.reason === 'nothing-missing' ? 'skipped' : 'warn', message);
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
                'nothing-missing': '本楼已有可用素材，或时段差分已跳过、已丢弃，无需重复生成',
            };
            if (!result || !result.ok) {
                feedback('error', `补全素材失败：${result && result.error || '素材生成失败（未返回具体原因）'}`);
            } else if (result.reason === 'already-decided') {
                feedback('warn', '补全素材已跳过：当前楼层已处理，请等待当前任务完成后重试');
            } else if (skipped[result.reason]) {
                return skip(result || { ok: false, reason: 'error' }, `补全素材已跳过：${skipped[result.reason]}`);
            } else {
                feedback('success', `补全素材完成：已生成 ${result.count || 0} 项，可在「场景 › 待确认」查看与入库`);
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
            // 重画已经落定：在跑的后台轮询可能还拿着旧一版（绑定数为 0）的收集结果，
            // 让它作废，否则签名一变就整页重绘，把刚画好的图盖回去。
            current.imagePollToken += 1;
            current.imagePolling = false;
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
        const sourceElement = element.querySelector?.('.mes_text') || element;
        const fingerprint = typeof sourceElement.textContent === 'string' ? sourceElement.textContent : null;
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
        // 只在用户显式刷新时重试失败资源；普通翻页/重绘不清失败状态。
        imageResourceCache.clearFailures();
        options.generatedAssets?.clearImageReadFailures?.();
        floorAssetPlan = { key: '', urls: [] };
        if (typeof options.openViewerFromMessage !== 'function') return rescanCurrentImages();
        const messageId = isEmbeddedReaderMode(current.mode)
            ? current.mountMessageId
            : current.snapshot && current.snapshot.messageId;
        if (messageId == null) return rescanCurrentImages();
        const keepIndex = isEmbeddedReaderMode(current.mode) && current.turnOffset > 0 ? 0 : current.index;
        const turnOffset = isEmbeddedReaderMode(current.mode) ? 0 : current.turnOffset;
        sourceCache.invalidate();
        tableData.invalidate();
        const result = await options.openViewerFromMessage(messageId, current.mode, { startAtEnd: false, turnOffset });
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
        tableData.invalidate();
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
            // 收集期间可能已经重画过：这一份是旧结果，套用会把刚画好的图盖掉。
            if (!state.activeReader || state.activeReader !== current || current.imagePollToken !== token) return;
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
        const result = save({
            bridge: { ...unified.bridge, sceneAssets: { ...(unified.bridge.sceneAssets || {}), moodGroups: nextGroups } },
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
            if (recordOutfitReview(storage, { character, word: d.unknownOutfit })) fresh.push({ character, word: d.unknownOutfit });
        }
        if (!fresh.length) return;
        // 自动衣柜开着（默认）时不打断阅读：排到本楼最后一页的入库面板里，用下拉菜单选归入已有 / 用衣柜 / 生成新衣服。
        if (sceneAssets.wardrobeAutoFlow !== false) {
            const wardrobe = normalizeWardrobe(sceneAssets.wardrobe);
            for (const { character, word } of fresh) {
                if (pendingOutfitAsks.some((a) => a.character === character && a.word === word)) continue;
                const fuzzy = Object.prototype.hasOwnProperty.call(wardrobe, word) ? word : fuzzyOutfitName(wardrobe, word);
                const outfits = (sceneAssets.characterOutfits && sceneAssets.characterOutfits[character]) || {};
                pendingOutfitAsks.push({ character, word, choices: [
                    ...(fuzzy ? [{ value: `w:${fuzzy}`, label: `用衣柜里的「${fuzzy}」` }] : []),
                    ...Object.keys(outfits).map((name) => ({ value: `o:${name}`, label: `归入「${name}」（加别名）` })),
                    { value: 'new', label: `生成新衣服「${word}」` },
                ] });
            }
            return;
        }
        writeToast(`有新服装待确认：${fresh.map((f) => `「${f.character}」的「${f.word}」`).join('、')}。到「角色 › 待确认」里归入已有服装或新建。`, 4200);
    }

    function buildReaderSnapshot(payload, mode, readerSettings, index = 0) {
        const scene = payload.scene || (payload.render && payload.render.scene) || {};
        const buildStatusHudForSnapshot = (settings, speaker, emotion, sceneInfo, isNarration, outfitFor) => {
            const statusHud = normalizeStatusHudSettings(settings && settings.statusHud);
            if (!statusHud.enabled) return buildStatusHudModel({ settings: statusHud, character: '', emotion: '', location: '' });
            const sceneAssets = (settings && settings._sceneAssets) || {};
            const readResult = statusHud.tables.length ? readStatusHudTables() : null;
            const info = sceneInfo && typeof sceneInfo === 'object' ? sceneInfo : {};
            const hud = buildStatusHudModel({ settings: statusHud, sceneAssets, character: speaker, emotion, location: info.location, time: info.time, weather: info.weather, isNarration, readResult, outfitFor, parsedTables: statusHud.tables.length ? tableData.parsed() : [], rowFor: tableData.rowFor });
            // 数值系统接管时，已登记角色的 HUD 条以 IGS 为准（易错点 H3）。
            const statsLookup = typeof options.statsLookup === 'function' ? options.statsLookup() : null;
            return withConcreteAvatar(overlayStatsMetrics(hud, statsLookup, speaker));
        };
        const readStatusHudTables = () => tableData.read();
        const render = payload.render || {};
        const stage = render.stage || {};
        const liveMessage = (payload.message && payload.message.raw) || payload.message || payload.raw || '';
        const parseOptions = {
            sourceFilter: payload.sourceFilter,
            virtualRegex: payload.virtualRegex,
            visibleText: payload.visibleText,
            sceneAssets: readerSettings._sceneAssets,
            sentencePaging: readerSettings._sentencePaging,
            dialogueSentencePaging: readerSettings._dialogueSentencePaging,
        };
        const sourceSignature = sourceCache.signature({
            messageId: payload.messageId,
            rawText: getMessagePrimaryText(liveMessage),
            visibleText: payload.visibleText,
            sourceFilter: payload.sourceFilter,
            virtualRegex: payload.virtualRegex,
            sceneAssetsEnabled: Boolean(readerSettings._sceneAssets && readerSettings._sceneAssets.enabled),
            sentencePaging: Boolean(readerSettings._sentencePaging),
            dialogueSentencePaging: Boolean(readerSettings._dialogueSentencePaging),
        });
        const cached = sourceCache.get(sourceSignature, { liveMessage, parseOptions });
        const extracted = cached.value || buildIgsTextPayload(liveMessage, parseOptions);
        const chatId = typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : '';
        tableData.useFloor(`${chatId}|${payload.messageId ?? ''}`);
        const userName = String((getSillyTavernContext(options.global || globalThis) || {}).name1 || '');
        const prepared = sourceCache.prepare(sourceSignature, [
            scene.text, scene.formattedText, scene.speaker, payload.formattedText, payload.textSegments, payload.raw,
            payload.inheritedSceneState, payload.inheritedOutfits, payload.inheritedDread,
            payload.liveContext, payload.stormContext, payload.battleContext, readerSettings._sceneAssets,
            JSON.stringify(readerSettings.systemRole), readerSettings.liveFx?.enabled === true,
            readerSettings.feedFx?.enabled === true, readerSettings.feedFx?.storm?.enabled !== false,
            readerSettings.cgHoldPages, userName, chatId,
            JSON.stringify([readerSettings._live2d?.enabled, Object.keys(readerSettings._live2d?.bindings || {})]),
        ], () => {
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
            const extractedSegments = Array.isArray(extracted.textSegments) ? extracted.textSegments : [];
            const hasExtractedSegments = extractedSegments.some((segment) => String(segment || '').trim());
            let segments = enforceExcludedText
                ? extractedSegments
                : Array.isArray(payload.textSegments) && payload.textSegments.length
                ? payload.textSegments
                : hasExtractedSegments
                    ? extractedSegments
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

            const floor = prepareReaderFloor({ text, segments, extracted, payload, scene, readerSettings, userName });
            noteFloorMoods(firstDefined(payload.messageId, payload.message && payload.message.id, ''), floor.sceneDirectives, readerSettings._sceneAssets);
            if (readerSettings._sceneAssets?.enabled) noteUnlistedOutfits(floor.outfitDirectives, readerSettings._sceneAssets);
            return floor;
        });
        const { text, segments } = prepared;
        if (!segments.length) return { content: { segments: [] } };
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
            pagesAfter: segments.length - 1 - normalizedIndex,
            avatarFor: (key) => concreteReaderAssetUrl(resolveStatusAvatar(sceneAssets && sceneAssets.statusAvatars, key)),
        }) : null;
        const hideChatSprite = chatPage && chatSettings.hideSprites;
        const generatedAssets = options.generatedAssets || null;
        const resolveGenerated = (url) => (isGeneratedAssetUrl(url)
            ? (generatedAssets ? generatedAssets.resolveUrl(url) : '')
            : (url || ''));
        const assetMatchCtx = {
            chatId,
            sceneAssets,
            generatedAssets: sceneAssets && sceneAssets.generated,
            imageAvailability: readerSpriteAvailability,
            strict: readerSettings._strictBackgroundMatch === true,
            live2dConfig: readerSettings._live2d,
            tempBackground: generatedAssets ? generatedAssets.tempBackground : null,
            tempSceneTime: generatedAssets ? generatedAssets.tempSceneTime : null,
            tempSprite: generatedAssets ? generatedAssets.tempSprite : null,
            isMissingImage: missingImageProbe(generatedAssets),
            isUnavailableImage: unavailableImageProbe(generatedAssets),
            tempSpriteForOutfit: generatedAssets ? generatedAssets.tempSpriteForOutfit : null,
        };
        const floorAssets = prepareReaderFloorAssets(prepared, { payload, readerSettings, assetMatchCtx, tableData });
        const page = prepared.pages[normalizedIndex];
        let finalBackgroundImage = backgroundImage;
        let finalBackgroundTimed = false;
        const hideSpriteOnNsfw = !normalizeStatusHudSettings(readerSettings && readerSettings.statusHud).showSpriteOnNsfw;
        let spriteImage = null;
        let spriteLive2d = null;
        let pendingSpriteRef = '';
        let resolvedSpeaker = scene.speaker || '';
        let spriteCharacter = '';
        let spriteOutfit = '';
        // 本页说话人立绘已换成登记的「背影」图：渲染层不再镜像、不再压暗缩小。
        let spriteBackArt = false;
        let nsfwCgPortrait = '';
        let castSprites = [];
        // 非人角色：巨型候选（不占同屏槽位，渲染在立绘层后的独立层）与战斗对手。
        let castGiants = [];
        let creatureFoes = [];
        let pendingCastRefs = [];
        let spriteLeft = false;
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
        const { sceneStateForBg, sceneDread } = page;
        const inheritedSceneState = prepared.inheritedSceneState;
        const nsfwSpan = normalizeRomanceFxSettings(readerSettings.romanceFx).enabled ? page.nsfwSpan || null : null;
        const pageFx = cloneData(page.fx);
        decorateItemFx(pageFx, payload, segments, normalizedIndex, prepared, readerSettings);
        // 食物被吃掉 / 喝掉：表格少了食物、AI 写「使用」食物、或本页有进食标签时，角落卡片换成吃掉 / 喝掉。
        const dailyForEat = normalizeDailyFxSettings(readerSettings && readerSettings.dailyFx);
        applyEatToItems(pageFx, { itemOn: normalizeItemFxSettings(readerSettings && readerSettings.itemFx).enabled, eatOn: dailyForEat.enabled && dailyForEat.eat });
        // 约定到期：payload 带近楼约定时（仅「约定」标签开启），按表名含「全局」的表的当前时间判定当天到期项；读不到则不提醒。
        if (Array.isArray(payload.promiseHistory) && payload.promiseHistory.length) {
            if (prepared.promiseRevision !== tableData.revision || prepared.promiseHistory !== payload.promiseHistory) {
                const promiseTables = readStatusHudTablesSafe();
                const storyNow = promiseTables && promiseTables.ok !== false ? readStoryNow(tableData.parsed()) : null;
                prepared.promiseDue = resolveDuePromises(payload.promiseHistory, storyNow);
                prepared.promiseRevision = tableData.revision;
                prepared.promiseHistory = payload.promiseHistory;
            }
            pageFx.promiseDue = cloneData(prepared.promiseDue);
        }
        // 对手立绘：素材模式下按对手名取默认立绘，供遭遇演出与打对手的出招使用；找不到就不显示。
        const battleContext = payload.battleContext || null;
        const battleFoe = pageFx.battle && pageFx.battle.foe;
        if (battleContext && battleFoe && sceneAssets && sceneAssets.enabled) {
            pageFx.foeImage = resolveGenerated(floorAssets.sprite(battleFoe, '').url) || '';
        }
        // 非人对手（有 creature 档案；可写多个）：战斗未结束的页面自动上台，结束那一页也认得对手（击倒 / 败北 / 撤退演出）。
        // 人类对手与待定档不取图、行为不变。二阶段后的页面基准立绘换成狂暴档；演出用的威吓 / 受创 / 狂暴三档图随 fx 带给战斗演出。
        const creatureFoeRaw = battleFoe || (pageFx.battleOver && pageFx.battleOver.foe) || '';
        if (creatureFoeRaw && sceneAssets && sceneAssets.enabled && !(readerSettings.battleFx && readerSettings.battleFx.creature === false)) {
            const foeState = pageFx.battle || pageFx.battleOver || {};
            creatureFoes = resolveCreatureFoes({
                raw: creatureFoeRaw, dnaMap: sceneAssets.characterDna, canonical: (name) => canonicalName(sceneAssets, name),
                spriteOf: (name, mood) => floorAssets.sprite(name, mood), resolve: resolveGenerated,
                frenzy: foeState.frenzy, phases: pageFx.phases, withTiers: Boolean(battleContext),
            });
            // 本场战斗里已被击倒 / 收服的对手（群怪要所有身影都倒了）不再上台；本页自己的击倒与收服由演出播放。
            creatureFoes = creatureFoes.filter((f) => !foeIsDown(pageFx, f.raw, {
                group: f.profile.group === true || hasGroupSuffix(f.raw) || (pageFx.hits || []).some((h) => hasGroupSuffix(h.target) && sameFoeName(h.target, f.raw)),
                size: f.profile.size,
            }));
            if (battleContext && creatureFoes.length) {
                if (creatureFoes.length === 1 && splitFoeNames(creatureFoeRaw).length === 1) pageFx.foeTiers = creatureFoes[0].tiers;
                else pageFx.foes = creatureFoes.map((f) => ({ name: f.raw, image: f.image, tiers: f.tiers }));
            }
        }
        // NSFW 页整楼挂图；SFW 页只在事件那几页显示，之后回到背景和立绘。
        const illustrationHit = prepared.illustrations[normalizedIndex];
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
        // CG 库：本页没有生成 / 插件 CG 时，按关键词或 [igs-cg:名字] 显示作者预置的那张，停留同 CG 停留页数。
        const eventCg = !illustrationHit && !slotBoundUrl && sceneAssets && sceneAssets.enabled && sceneAssets.eventCgs
            ? prepared.eventCgs[normalizedIndex]
            : null;
        const eventCgUrl = eventCg ? String(resolveGenerated(eventCg.url) || '') : '';
        // 标记只定位 CG；没有可显示图片时保留正常舞台，读回后再切入 CG。
        const cgWaiting = Boolean(illustrationHit) && !illustrationUrl && !boundMarkerUrl;
        if (illustrationUrl) {
            finalBackgroundImage = illustrationUrl;
            spriteImage = null;
            backgroundMatch = { source: 'cg' };
        } else if (boundMarkerUrl) {
            finalBackgroundImage = boundMarkerUrl;
            spriteImage = null;
            backgroundMatch = { source: 'bound-slot' };
        } else if (eventCgUrl) {
            finalBackgroundImage = eventCgUrl;
            spriteImage = null;
            backgroundMatch = { source: 'event-cg' };
        } else if (slotBoundUrl) {
            finalBackgroundImage = slotBoundUrl;
            spriteImage = null;
            backgroundMatch = { source: 'slot' };
        } else if (sceneAssets && sceneAssets.enabled) {
            if (sceneStateForBg && sceneStateForBg.scene) {
                const bgHit = floorAssets.background(sceneStateForBg);
                backgroundMatch = { source: bgHit.source, quality: bgHit.quality || '' };
                finalBackgroundImage = resolveGenerated(bgHit.url);
                finalBackgroundTimed = Boolean(finalBackgroundImage) && bgHit.timed === true;
                // 本楼写了新场景但图还没生成：先暂用上一楼场景的背景顶替，免得整屏空白；
                // 本楼场景图一生成就按上面的正常路径覆盖，不需要额外撤销。
                if (!finalBackgroundImage && bgHit.needsGeneration && inheritedSceneState
                    && inheritedSceneState.scene && inheritedSceneState.scene !== sceneStateForBg.scene) {
                    const inheritedHit = floorAssets.background(inheritedSceneState);
                    const inheritedUrl = resolveGenerated(inheritedHit.url);
                    if (inheritedUrl) {
                        finalBackgroundImage = inheritedUrl;
                        finalBackgroundTimed = false;
                        backgroundMatch = { source: 'inherited', quality: inheritedHit.quality || '' };
                    }
                }
            } else {
                finalBackgroundImage = '';
            }
            spriteImage = null;
        }
        const cgActive = Boolean(illustrationUrl || boundMarkerUrl || eventCgUrl);
        // Per-segment classification from the formatted segment text itself.
        // Order matters: thought (*...*) is checked before dialogue ([名字]：) because
        // a thought segment looks like *[名字]：...* and would otherwise match dialogue.
        // Fallback: when the prefix was stripped (single-segment messages), use the
        // directive that lands on this exact segment index.
        // 角色台词若被成对引号整体包裹（AI 偶发额外输出中英文引号），前端不渲染引号。
        let { textType, bubbleSpeaker, segmentBody, bubbleMood, spriteMood, systemSpeaker } = page;
        const { spriteChar, narrationDropped } = page;
        spriteLeft = page.spriteLeft;
        if (sceneAssetsEnabled) {
            resolvedSpeaker = bubbleSpeaker;
            // NSFW 挂 CG 时对话框左侧的裸体头像：只跟本页自己的说话人（旁白页不继承上一位，直接不显示）。
            if (cgActive && htmlCardIndex < 0 && bubbleSpeaker && sceneStateForBg && sceneStateForBg.nsfw && sceneAssets && sceneAssets.enabled
                && (textType === 'dialogue' || textType === 'thought')
                && normalizeStatusHudSettings(readerSettings.statusHud).nsfwCgPortrait) {
                nsfwCgPortrait = resolveGenerated(floorAssets.nude(bubbleSpeaker, bubbleMood).url) || '';
            }
            // HTML 卡片独占舞台前景：不继承上一段角色的立绘，也不发起素材解析。
            if (htmlCardIndex < 0 && !hideChatSprite && !slotBoundUrl && !cgActive && sceneAssets && sceneAssets.enabled && (spriteChar || narrationDropped) && !(sceneStateForBg && sceneStateForBg.nsfw && hideSpriteOnNsfw)) {
                // 服装与偏移已按整楼原文准备；本页直接取对应结果，表格更新后按现有通知补齐。
                const outfitMap = sceneAssets.characterOutfits;
                const outfitOffset = page.outfitOffset;
                setActiveFormGenders([]);
                let outfitTrace = null;
                const outfitFor = (character) => withFormGender(character,
                    (outfitTrace = floorAssets.outfitFor(normalizedIndex, character)).outfit);
                // 变身形态：记下这一页在场角色的形态性别，供高度 / 语气音 / 朗读读取。
                const withFormGender = (character, outfit) => {
                    const name = canonicalName(sceneAssets, character);
                    const own = name && outfitMap && Object.hasOwn(outfitMap, name) ? outfitMap[name] : null;
                    const entry = own && outfit && Object.hasOwn(own, outfit) ? own[outfit] : null;
                    noteFormGender(name, entry && entry.form ? entry.form.gender : '');
                    return outfit;
                };
                const wantedOutfit = spriteChar ? outfitFor(spriteChar) : '';
                const outfitWhy = { outfitSource: (outfitTrace && outfitTrace.source) || '', outfitReason: (outfitTrace && outfitTrace.reason) || '', outfitOffset };
                // 模型按剧情原始情绪取绑定；即使加载失败也不回退普通静态差分。
                spriteLive2d = resolveCharacterLive2dBinding(readerSettings._live2d, sceneAssets, spriteChar, spriteMood);
                let spriteHit = !spriteLive2d && spriteChar ? floorAssets.sprite(spriteChar, spriteMood, wantedOutfit) : { url: '', source: '' };
                if (spriteLive2d) {
                    spriteCharacter = spriteChar;
                    spriteOutfit = wantedOutfit;
                }
                // 陪衬反应换表情（stageCast.enabled && castReact）：react 写的情绪保持到这个人下次开口；
                // 只在真有这张表情图时换，落到默认 / 平和兜底就维持原表情。
                const castForReact = normalizeStageCastSettings(readerSettings.stageCast);
                const reactMoodOf = castForReact.enabled && castForReact.castReact
                    ? page.reactMoodOf
                    : () => '';
                const speakerReactMood = spriteChar ? reactMoodOf(spriteChar) : '';
                if (speakerReactMood && !spriteLive2d) {
                    const reactHit = floorAssets.sprite(spriteChar, speakerReactMood, wantedOutfit);
                    if (isReactMoodHit(reactHit)) {
                        spriteHit = reactHit;
                        spriteMood = speakerReactMood;
                    }
                }
                if (spriteChar && !spriteLive2d) spriteMatch = { character: spriteChar, mood: spriteMood || '', outfit: wantedOutfit || '', source: spriteHit.source, quality: spriteHit.quality || '', slot: spriteHit.slot || '', reason: spriteHit.reason || '', ...outfitWhy };
                if (spriteChar && !spriteLive2d) noteUnlistedMood(spriteHit, spriteMood, sceneAssets);
                spriteImage = spriteChar ? resolveGenerated(spriteHit.url) || null : null;
                if (!spriteImage && spriteChar && isGeneratedAssetUrl(spriteHit.url)) pendingSpriteRef = spriteHit.url;
                if (spriteImage) {
                    spriteCharacter = spriteHit.character || spriteChar;
                    spriteOutfit = withFormGender(spriteCharacter, spriteHit.outfit || '');
                    // Position keys follow the resolved image slot (exact mood / group /
                    // 默认), not the raw mood word, so every mood that maps to the same
                    // sprite image shares one position across pages.
                    spriteMood = spriteHit.slot || spriteMood;
                    // 背影：本页该角色处于背对姿态（castStage 开）且登记了名为「背影」的表情立绘时换成这张图；
                    // 只认精确槽位，不走情绪组 / 默认兜底；站位仍按原表情槽位取，前后不跳位。没有这张图时渲染层退回镜像 + 压暗 + 缩小。
                    if (normalizeStageCastSettings(readerSettings.stageCast).castStage && pageFx && pageFx.poses) {
                        const backKey = resolveCharacterKey(sceneAssets.characters, sceneAssets.characterAliases, spriteCharacter) || spriteCharacter;
                        const backPose = Object.entries(pageFx.poses).find(([name]) => (resolveCharacterKey(sceneAssets.characters, sceneAssets.characterAliases, name) || name) === backKey);
                        if (backPose && backPose[1] && backPose[1].back === true) {
                            const backHit = floorAssets.sprite(spriteChar, SPRITE_BACK_MOOD, wantedOutfit);
                            const backUrl = backHit.slot === SPRITE_BACK_MOOD && backHit.quality === 'exact' ? resolveGenerated(backHit.url) : '';
                            if (backUrl) {
                                spriteImage = backUrl;
                                spriteBackArt = true;
                            }
                        }
                    }
                }
                // 巨型非人角色不进同屏槽位：说话人是巨型时，图交给巨型层。
                if (spriteImage && isGiantCreature(creatureProfileOf(sceneAssets.characterDna, spriteCharacter))) {
                    castGiants.push({ character: spriteCharacter, image: spriteImage, speaker: true });
                    spriteImage = null;
                }
                if (!chatPage && normalizeStageCastSettings(readerSettings.stageCast).enabled) {
                    // 与同屏名单同一套主名换算（上传区 + 生成区）。
                    const castKeyOf = (name) => prepared.keyOf(name);
                    const speakerKey = spriteChar ? castKeyOf(spriteChar) : '';
                    // 修罗场：恋爱对象先于最近开口的人入选，保证对象在台上（romanceDuo 关闭时不钉）。
                    const castPin = speakerKey && normalizeStageCastSettings(readerSettings.stageCast).romanceDuo
                        ? resolveRomanceRivalTarget(pageFx, speakerKey, castKeyOf) : '';
                    const cast = page.cast;
                    const picked = pickCastMembers(cast, {
                        speakerKey,
                        pin: castPin,
                        seats: STAGE_CAST_MAX_SEATS - (spriteImage || spriteLive2d ? 1 : 0),
                        speakerTemp: Boolean((spriteImage || spriteLive2d) && page.focusTemp),
                        resolve: (m) => {
                            if (resolveCharacterLive2dBinding(readerSettings._live2d, sceneAssets, m.character, m.mood)) return null;
                            const memberOutfit = outfitFor(m.character);
                            let hit = floorAssets.sprite(m.character, m.mood, memberOutfit);
                            const memberReact = reactMoodOf(m.character);
                            if (memberReact) {
                                const reactHit = floorAssets.sprite(m.character, memberReact, memberOutfit);
                                if (isReactMoodHit(reactHit)) hit = reactHit;
                            }
                            const image = resolveGenerated(hit.url);
                            if (!image && isGeneratedAssetUrl(hit.url)) pendingCastRefs.push(hit.url);
                            if (image && isGiantCreature(creatureProfileOf(sceneAssets.characterDna, hit.character || m.character))) {
                                castGiants.push({ character: hit.character || m.character, image });
                                return null;
                            }
                            return image ? { character: hit.character || m.character, mood: hit.slot || m.mood, outfit: hit.outfit || '', image } : null;
                        },
                    });
                    // 旁白点名的临时焦点不挤掉已开口坐满的人：这一页主立绘不上台。
                    if (picked.hideSpeaker) { spriteImage = null; spriteLive2d = null; }
                    if ((spriteImage || spriteLive2d) && picked.speakerOrder != null) speakerCastOrder = picked.speakerOrder;
                    castSprites.push(...picked.members);
                }
            }
        }
        // 非人角色编排：巨型取代、对手自动上台。没有非人角色时 composeCreatureStage 不会运行，人类页面原样。
        let giantSprite = null;
        let creatureFoePin = '';
        const creatureStageOpen = sceneAssetsEnabled && htmlCardIndex < 0 && !chatPage && !slotBoundUrl && !cgActive && sceneAssets && sceneAssets.enabled
            && !(sceneStateForBg && sceneStateForBg.nsfw && hideSpriteOnNsfw);
        if (creatureStageOpen && (castGiants.length || (creatureFoes.length && !spriteLive2d))) {
            const foeOne = creatureFoes.length === 1 ? creatureFoes[0] : null;
            // 后来者取代：陪衬巨型 < 战斗对手巨型（多个时最后一个）< 说话人巨型。
            const foeGiants = creatureFoes.filter((f) => f.image && isGiantCreature(f.profile) && !castGiants.some((g) => g.character === f.name))
                .map((f) => ({ character: f.name, image: f.image }));
            const giants = [...castGiants.filter((g) => !g.speaker), ...foeGiants, ...castGiants.filter((g) => g.speaker)];
            const slotFoes = creatureFoes.filter((f) => f.image && !isGiantCreature(f.profile) && !spriteLive2d);
            const speakerBefore = spriteImage ? { character: spriteCharacter, image: spriteImage, mood: spriteMood, outfit: spriteOutfit, order: speakerCastOrder } : null;
            const composed = composeCreatureStage({
                speaker: speakerBefore, members: castSprites, giants,
                foe: foeOne && slotFoes.length ? { character: foeOne.name, image: foeOne.image, mood: '', outfit: '' } : null,
                foes: foeOne ? [] : slotFoes.slice(0, CREATURE_FOE_SLOTS).map((f) => ({ character: f.name, image: f.image, mood: '', outfit: '' })),
                castOn: normalizeStageCastSettings(readerSettings.stageCast).enabled,
            });
            if (composed.speaker !== speakerBefore) {
                const next = composed.speaker;
                spriteImage = next ? next.image : null;
                if (next) {
                    spriteCharacter = next.character;
                    spriteMood = next.mood || '';
                    spriteOutfit = next.outfit || '';
                    speakerCastOrder = Number.isFinite(next.order) ? next.order : null;
                }
            }
            castSprites = composed.members;
            giantSprite = composed.giant;
            creatureFoePin = composed.pin;
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
            if (hideChatSprite) { spriteImage = null; spriteLive2d = null; }
            castSprites = [];
            pendingCastRefs = [];
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
            [preparedFloorKey]: prepared,
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
                spriteLeft,
                spriteBackArt,
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
                segments,
                currentIndex: normalizedIndex,
                progress: buildProgressText(normalizedIndex, segments.length, displayImageState),
                backgroundImage: finalBackgroundImage,
                backgroundTimed: finalBackgroundTimed,
                spriteImage,
                spriteLive2d,
                pendingSpriteRef,
                spriteMatch,
                backgroundMatch,
                castSprites,
                giantSprite,
                creatureFoePin,
                userChar: { key: prepared.userKey || '', source: prepared.userSource || '' },
                pendingCastRefs,
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
                imageRetrying: Boolean(state.activeReader && state.activeReader.illustrationPending),
                imageFailureReason: (state.activeReader && state.activeReader.imageFailureReason) || '',
                sourceKind: firstDefined(scene.sourceKind, payload.sourceKind, 'raw-text'),
                warnings: extracted.warnings,
                errors: extracted.errors,
                sceneLocation: statusSceneInfo.location,
                sceneTime: statusSceneInfo.time,
                sceneWeather: statusSceneInfo.weather,
                sceneDread,
                sceneNsfw: Boolean(sceneStateForBg && sceneStateForBg.nsfw),
                cgNsfw: Boolean(eventCgUrl && eventCg.nsfw),
                illustrationActive: Boolean(illustrationUrl),
                cgActive,
                cgWaiting,
                nsfwCgPortrait,
                illustrationSlot: illustrationHit ? illustrationHit.slot : null,
                illustrationUrl,
                statusHud: buildStatusHudForSnapshot(readerSettings, sceneStateForBg && sceneStateForBg.nsfw ? '' : resolvedSpeaker, sceneStateForBg && sceneStateForBg.nsfw ? '' : bubbleMood, statusSceneInfo, textType === 'narration' || textType === 'thought' || textType === 'chat' || textType === 'system' || Boolean(sceneStateForBg && sceneStateForBg.nsfw && hideSpriteOnNsfw), { character: spriteCharacter, outfit: spriteOutfit }),
            },
            // _sceneAssets 是整份有效素材库，只读不改；跟着整份深拷贝会让翻页随素材库变大而变慢。
            readerSettings: sceneDialogSkin(cloneReaderSettingsShallowAssets(readerSettings), statusSceneInfo.location),
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
        bindImageCacheDocument(doc, options.media?.cache);
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
        // 草稿随打随记：出图写回、生成报错会重绘或重开阅读器，按记下的值回填，打到一半的字不丢。
        root.addEventListener('input', (event) => {
            if (event.target && event.target.id === 'igs-input' && state.activeReader) {
                state.activeReader.inputValue = String(event.target.value || '');
            }
        });
        const keydownHandler = (event) => {
            // 全屏阅读器里的 Esc 归 IGS：酒馆在 document 上把 Esc 当「中止生成」，不能让它冒泡过去。
            if (event.key === 'Escape' && state.activeReader && !isEmbeddedReaderMode(state.activeReader.mode)) {
                claimReaderEscape(event);
            }
            if (onboarding.keydown(event)) return;
            if (!state.activeReader) return;
            if (state.activeSettings?.asyncState?.shortcutRecording) return;
            if (state.activeReader.live2dPanel) {
                if (event.key === 'Escape') {
                    event.preventDefault(); event.stopPropagation?.();
                    state.activeReader.live2dPanel.close();
                }
                return;
            }

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
            // 牌桌盖在正文上：Esc 只收起小游戏，翻页类快捷键也别穿过去改动底下的楼层。
            if (waitStage.isPlaying()) {
                if (event.key === 'Escape') {
                    event.preventDefault(); event.stopPropagation?.();
                    waitStage.close();
                }
                return;
            }
            const optionLayer = state.activeReader.dom?.overlay?.querySelector?.('#igs-option-bubbles');
            if (event.key === 'Escape' && optionLayer && !optionLayer.hasAttribute('hidden') && optionLayer.hasAttribute('data-igs-panel')) {
                event.preventDefault(); event.stopPropagation?.();
                hideOptionBubbles(optionLayer);
                return;
            }
            // Focused controls own their keyboard input; sliders must not turn pages.
            if (event.key !== 'Escape' && event.target?.closest?.('button, input, select, textarea, [role="button"], [role="slider"], .igs-dfx-document-scroll, .igs-ancient-panel-scroll')) return;
            const input = state.activeReader.dom && state.activeReader.dom.input;
            if (doc.activeElement === input && event.key !== 'Escape') return;
            if (event.key === 'Escape') {
                event.preventDefault();
                controller.close();
                return;
            }
            const reader = state.activeReader.snapshot && state.activeReader.snapshot.readerSettings;
            const action = findShortcutAction(resolveShortcuts(reader && reader.shortcuts), eventToShortcut(event));
            if (!action) return;
            event.preventDefault();
            if (action === 'bilingual-toggle') {
                const reader = state.activeReader.snapshot && state.activeReader.snapshot.readerSettings;
                const display = reader ? resolveBilingualDisplay(reader.bilingual, reader._bilingualDisplay) : '';
                if (!display) return;
                state.bilingualDisplay = { base: normalizeBilingualSettings(reader.bilingual).display, value: nextBilingualDisplay(display) };
                rerenderActiveReader();
                return;
            }
            controller.invokeAction(action);
        };
        // 内嵌模式：点挂载楼层的小铅笔（.mes_edit）时先关闭阅读器并恢复原文；
        // 捕获阶段执行且不拦截事件，酒馆随后在冒泡阶段照常打开编辑框（编辑框渲染在 .mes_text 内）。
        const hostEditHandler = (event) => {
            const current = state.activeReader;
            const mount = current && current.dom && current.dom.embeddedMount;
            if (!mount || !isEmbeddedReaderMode(current.mode)) return;
            const mode = current.mode;
            const messageId = mount.messageId != null ? mount.messageId : current.mountMessageId;
            if (!isEmbeddedEditTrigger(event && event.target, mount.mesText, { host: mount.host, messageId })) return;
            const closed = closeReader();
            if (closed.ok !== false) armEditReopen(doc, messageId, mode);
        };
        if (typeof doc.addEventListener === 'function') {
            doc.addEventListener('keydown', keydownHandler, true);
            doc.addEventListener('click', hostEditHandler, true);
        }
        installReaderEscapeGuard(doc);
        const dbController = createDbPanelController(doc, options.global);
        // 「前往 / 使用」保留原草稿并追加命令，不发送消息。
        const fillRecordDraft = async text => {
            const current = state.activeReader;
            if (!current) return { ok: false, reason: 'reader-not-open' };
            if (isEmbeddedReaderMode(current.mode)) {
                return typeof options.fillEmptyInputText === 'function'
                    ? options.fillEmptyInputText(text, { append: true })
                    : { ok: false, reason: 'missing-readable-input' };
            }
            const input = current.dom?.input;
            if (!input) return { ok: false, reason: 'missing-reader-input' };
            input.value = appendInputDraft(input.value, text);
            current.inputValue = input.value;
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
            // 数值系统接管已登记角色的人物数值；未接管时返回 null，人际关系页照旧读表格。
            statsLookup: () => (typeof options.statsLookup === 'function' ? options.statsLookup() : null),
        });
        const mapController = createMapPanelController(doc, options.global, fillRecordDraft, {
            mediaCache: options.media?.cache,
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
                state.activeReader?.live2dPanel?.close(true);
                if (state.activeReader) disposeLive2dStage(state.activeReader);
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
                // 挪出去的插件面板（状态栏、动画小部件）自己刷新不碰正文，不算外部改动，免得每次都重跑一遍藏正文。
                if (target && target.closest && target.closest('[data-igs-internal-reader="1"], [data-igs-parallel-blocks="1"]')) return false;
                // 插件改写用户楼不碰 AI 正文，不必重跑。
                if (isUserFloorNode(target, isUserFloorId)) return false;
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

    // 翻到旧楼时补插图（设置里默认关；开关由插图服务判断）。最新楼归自动出图管。
    // 每楼每次刷新页面只试一次，失败也不反复重试；同一时间只画一楼，不和工具栏手动出图抢。
    function backfillOldFloor(current) {
        if (!current || !current.progressArmed || current.titleGate || backfillBusy || current.illustrationPending) return;
        const service = options.illustrations;
        if (!service || typeof service.processMessage !== 'function') return;
        const target = readManualFloor(current);
        if (!target.floor || target.floor.isLatest) return;
        const key = `${target.floor.chatId}:${target.messageId}:${target.floor.swipeId}`;
        if (backfillTried.has(key)) return;
        backfillTried.add(key);
        backfillBusy = true;
        setIllustrationPending(current, true);
        Promise.resolve().then(() => service.processMessage(Number(target.messageId), { backfill: true }))
            .then((result) => {
                if (result && result.ok && result.count) imageNotice('success', `第 ${target.messageId} 楼已补全 ${result.count} 张插图`);
                else if (result && !result.ok) imageNotice('error', `第 ${target.messageId} 楼插图补全失败：${result.error || '未返回具体原因'}`);
            })
            .catch(() => {})
            .finally(() => {
                backfillBusy = false;
                setIllustrationPending(current, false);
            });
    }

    function updateMountedReader(snapshot) {
        const current = state.activeReader;
        if (!current) return;
        markStageActive(current.dom?.overlay);
        const leases = current.assetLeases ||= options.media?.cache ? createMediaLeaseScope(options.media.cache) : null;
        leases?.begin();
        for (const url of readerPageAssetUrls(snapshot.content)) {
            const key = isGeneratedAssetUrl(url) ? `asset:${url.slice(8)}`
                : options.media?.cache?.sourceId?.(url) || imageResourceCache.keyOf(url);
            leases?.use(key);
        }
        if (current.consistencyTask && !current.consistencyTask.stillCurrent()) current.consistencyTask.controller.abort();
        warmActiveFloorImages(snapshot);
        current.autoPlayer?.setSpeed(snapshot.readerSettings?.typewriter?.speed);
        noteReadingProgress(current, snapshot);
        backfillOldFloor(current);
        if (!current.dom || !current.dom.root) { current.assetLeases?.releaseAll(); return; }
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
            if (current.titleGate.resume || (titleOn && Number(snapshot.content && snapshot.content.currentIndex) === 0)) {
                renderTitleGate(current);
                current.assetLeases?.releaseAll();
                return;
            }
            dropTitleGate(current);
        }
        if (current.dom.overlay) applyReaderSnapshotToDom(current.dom.overlay, snapshot, current, {
            hasActiveSettings: () => Boolean(state.activeSettings),
            closeSettings,
            handleReaderAction,
            // 点击层监听只绑一次，闭包里的 current/snapshot 是首次渲染的；必须读当前阅读器，否则按旧页判断「末页」会吞掉翻页。
            handleBlankClick: () => {
                const live = state.activeReader || current;
                return handleOptionBubbleBlankClick(live, live.snapshot || snapshot);
            },
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
            onLivePortraitMove: (liveFx) => saveReaderSettingsPatch({ liveFx }),
        });
        current.assetLeases?.end();
        if (current.dom.progress) {
            const progressText = formatReaderProgress(snapshot);
            current.dom.progress.textContent = progressText;
            current.dom.progress.style.display = progressText ? 'block' : 'none';
        }
        syncOptionBubblesAfterRender(current, snapshot);
        syncAssetReviewAfterRender(current, snapshot);
        syncMissedAssetsHint(current, snapshot);
        if (generationStripRemount) { generationStripRemount = false; generationStrip.remount(); }
    }

    function syncMissedAssetsHint(current, snapshot) {
        const idle = current.awaitingReply !== true && current.streamPhase !== 'streaming' && !current.illustrationPending
            && !(snapshot.content && snapshot.content.imageLoading) && generationStrip.getState().phase === 'idle';
        const target = idle && typeof options.isIllustrationEnabled === 'function' && options.isIllustrationEnabled()
            ? readManualFloor(current) : {};
        const floor = target.floor;
        const content = snapshot.content || {};
        const detection = floor ? detectMissedAssets({
            enabled: true,
            busy: false,
            isLatest: floor.isLatest !== false,
            text: floor.text,
            expected: content.imageExpectedCount,
            bound: content.imageBoundCount,
        }) : { missed: false };
        missedHint.sync(detection, floor ? `${floor.chatId}:${floor.messageId}:${floor.swipeId}:${detection.reason}` : '');
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

    // 0 楼已有的 CG（生成插图与 CG 库事件图）：主界面封面拿来轮换。插图还在后台读的先跳过，下次打开再轮到。
    function titleCgCovers(current) {
        const snapshot = current.snapshot;
        const floor = snapshot && snapshot[preparedFloorKey];
        if (!floor) return [];
        const urls = [];
        const slots = new Set();
        const identity = current.illustrationIdentity || readIllustrationIdentity(0);
        if (typeof options.getIllustrationUrl === 'function') {
            for (const hit of floor.illustrations || []) {
                if (!hit || slots.has(hit.slot)) continue;
                slots.add(hit.slot);
                urls.push(String(options.getIllustrationUrl({ chatId: identity && identity.chatId, messageId: 0, swipeId: identity && identity.swipeId, slot: hit.slot }) || ''));
            }
        }
        const sceneAssets = snapshot.readerSettings && snapshot.readerSettings._sceneAssets;
        if (sceneAssets && sceneAssets.enabled && sceneAssets.eventCgs) {
            const generatedAssets = options.generatedAssets || null;
            for (const hit of floor.eventCgs || []) {
                if (!hit || !hit.url) continue;
                urls.push(String((isGeneratedAssetUrl(hit.url) ? (generatedAssets ? generatedAssets.resolveUrl(hit.url) : '') : resolveReaderAssetUrl(hit.url, current)) || ''));
            }
        }
        return urls.filter(Boolean);
    }

    function titleModelOf(current) {
        return buildTitleScreenModel({
            cgCovers: titleCgCovers(current),
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
        pinTitleFrame(current, overlay);
        renderTitleScreen(overlay, model, {
            onAction: (act, value) => { void handleTitleAction(current, act, value); },
        });
        playTitleBgm(overlay, snapshot);
    }

    function pinTitleFrame(current, overlay) {
        const snapshot = current.snapshot;
        if (!overlay || !snapshot) return;
        // 主界面盖着时不走正文渲染，原地切到内嵌的 overlay 拿不到内嵌类名，钉框会直接跳过。
        if (isEmbeddedReaderMode(snapshot.mode) && overlay.classList) overlay.classList.add('igs-mode-embedded');
        pinEmbeddedHostFrame(overlay, snapshot.readerSettings && snapshot.readerSettings._cgBackgroundSize, snapshot.mode, snapshot.readerSettings && snapshot.readerSettings.embeddedHeight);
        if (!current.stopTitleFrameWatch && isEmbeddedReaderMode(snapshot.mode)) {
            current.stopTitleFrameWatch = watchTitleEmbeddedFrame(overlay, () => {
                const live = current.snapshot;
                const reader = (live && live.readerSettings) || {};
                return live ? { backgroundSize: reader._cgBackgroundSize, mode: live.mode, heightScale: reader.embeddedHeight } : null;
            });
        }
    }

    function stopTitleFrameWatch(current) {
        if (typeof current.stopTitleFrameWatch === 'function') current.stopTitleFrameWatch();
        current.stopTitleFrameWatch = null;
    }

    function dropTitleGate(current) {
        if (!current) return;
        stopTitleFrameWatch(current);
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
        if (next.effect === 'latest') {
            dropTitleGate(current);
            updateMountedReader(current.snapshot);
            return null;
        }
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
        openSettings({ page: 'chars', mode: current.mode });
        const settings = state.activeSettings;
        if (!settings || !settings.controller || typeof settings.controller.invoke !== 'function') return { ok: false, reason: 'settings-not-open' };
        openSettingsPage(settings, 'chars');
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
        if (!service) return;
        const context = storyOutfitContext();
        if (current.streamPhase !== 'streaming' && storyOutfits && context && snapshot.readerSettings?._sceneAssets?.enabled) {
            const assets = effectiveSceneAssets(context.root, context.scopeKey);
            const observed = storyOutfits.observe(extractSceneDirectives(context.text, { outfitResolver: createOutfitResolver(assets) }).directives, context);
            if (observed.ok) void storyOutfits.autoGenerate(context);
        }
        if (!overlay || !overlay.querySelector) return;
        let container = overlay.querySelector('#igs-asset-review');
        const floorKey = currentFloorKey(current);
        // 没读完就重 roll：流式期间不弹，记下旧楼，等新回复载入完在最后一页一并补问。
        if (current.streamPhase === 'streaming') {
            if (floorKey && !current.deferredReviewKey && service.listReview(floorKey).length) current.deferredReviewKey = floorKey;
            if (container) container.setAttribute('hidden', '');
            return;
        }
        const lastPage = isReaderLastPage(snapshot);
        let items = floorKey && lastPage
            ? service.listReview(floorKey)
            : [];
        const deferredKey = current.deferredReviewKey;
        if (deferredKey && deferredKey !== floorKey) {
            const deferred = service.listReview(deferredKey);
            if (!deferred.length) current.deferredReviewKey = '';
            else if (lastPage) items = deferred.concat(items);
        } else if (deferredKey) current.deferredReviewKey = '';
        const storyAsks = lastPage ? storyOutfits?.list({ context }) || [] : [];
        const allStoryAsks = storyOutfits?.list({ includeDeferred: true, context }) || [];
        const outfitAsks = lastPage ? [...storyAsks, ...pendingOutfitAsks.filter(ask =>
            !createOutfitResolver(snapshot.readerSettings?._sceneAssets || {})(ask.character, ask.word)
            && !service.tempSpriteForOutfit?.(ask.character, ask.word)
            && !allStoryAsks.some(row => row.character === ask.character && row.word === ask.word))] : [];
        if (!items.length && !outfitAsks.length) {
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
            onResolve: completeGeneratedReview,
            outfitAsks,
            onOutfit: (ask, picked) => resolveOutfitAsk(ask, picked),
        });
    }

    function storyOutfitContext() {
        const current = state.activeReader;
        if (!current) return null;
        const { floor } = readManualFloor(current);
        if (!floor) return null;
        const scope = resolveAssetScope(getSillyTavernContext(options.global || globalThis));
        const { bridge } = resolveBridgeConfigSnapshot({ mode: current.mode });
        const root = cloneData(bridge.sceneAssets || {});
        relocateLegacyCard(root, scope.key, scope.legacyKey);
        return { root, scopeKey: scope.key, floorKey: floorKeyOf(floor), messageId: Number(floor.messageId),
            sourceHash: storyOutfitSourceHash(floor.text), text: floor.text,
            autoGenerate: bridge.autoIllustration?.assets?.outfitAutoGenerate === true };
    }

    function commitStoryOutfit(next, expected, guard) {
        const context = storyOutfitContext();
        if (!guard() || !context)
            return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT' };
        if (state.activeSettings) {
            const draft = state.activeSettings.draft.bridge;
            const previous = draft.sceneAssets;
            draft.sceneAssets = applyOperationEdits(expected, draft.sceneAssets, next);
            const result = persistSettingsDraft();
            if (!result?.ok) draft.sceneAssets = previous;
            else rerenderSettings();
            return result;
        }
        return saveBridgePatch(bridge => guard() ? { sceneAssets: applyOperationEdits(expected, bridge.sceneAssets, next) } : null);
    }

    async function resolveStoryOutfit(ask, picked) {
        if (!picked) {
            storyOutfits.defer(ask.id);
            return;
        }
        // adopt 同步登记在途选择并通知面板收起，随后等待后台处理。
        const aliasName = picked.startsWith('o:') ? picked.slice(2) : '';
        const pending = picked === 'retry' ? storyOutfits.retry(ask.id)
            : aliasName ? storyOutfits.alias(ask.id, aliasName) : storyOutfits.adopt(ask.id, picked);
        const current = state.activeReader;
        if (current) syncAssetReviewAfterRender(current, current.snapshot);
        const result = await pending;
        if (result?.saved || (result?.ok && picked !== 'retry')) {
            for (let i = pendingOutfitAsks.length - 1; i >= 0; i--)
                if (pendingOutfitAsks[i].character === ask.character && pendingOutfitAsks[i].word === ask.word)
                    pendingOutfitAsks.splice(i, 1);
            if (state.activeReader) rerenderActiveReader();
        }
        if (result?.ok && !result.alreadyHandled && picked !== 'retry') {
            imageNotice('success', aliasName ? `已把「${ask.word}」归入「${aliasName}」` : picked === 'sprite' ? '衣装和对应立绘已入库' : '衣装已入库衣柜');
        }
        if (state.activeReader) syncAssetReviewAfterRender(state.activeReader, state.activeReader.snapshot);
        return result;
    }

    // 段末新衣服面板的确认：加别名原地完成；用衣柜 / 生成新衣服要出图，交给素材页的自动衣柜流程（带上已选项，不再二次询问）。
    function resolveOutfitAsk(ask, picked) {
        if (ask.id && storyOutfits) return resolveStoryOutfit(ask, picked);
        const at = pendingOutfitAsks.indexOf(ask);
        if (at >= 0) pendingOutfitAsks.splice(at, 1);
        if (picked && picked.startsWith('o:')) {
            const name = picked.slice(2);
            const added = mutateSceneLibrary((assets) => {
                const entry = assets.characterOutfits && assets.characterOutfits[ask.character] && assets.characterOutfits[ask.character][name];
                if (!entry || typeof entry !== 'object') return { ok: false };
                entry.words = Array.isArray(entry.words) ? entry.words : [];
                if (!entry.words.includes(ask.word)) entry.words.push(ask.word);
                return { ok: true };
            }, { character: ask.character });
            if (added && added.ok !== false) {
                removeOutfitReview((options.global || globalThis).localStorage, ask.character, ask.word);
                writeToastSafe(`已把「${ask.word}」归入「${ask.character}」的「${name}」`);
            } else writeToastSafe('归入失败，可到「角色 › 待确认」里处理');
        } else if (picked) {
            if (!state.activeSettings) openSettings({ page: 'review', mode: state.activeReader ? state.activeReader.mode : 'pc' });
            const settings = state.activeSettings;
            if (settings && settings.controller && typeof settings.controller.invoke === 'function') {
                settings.controller.invoke(`outfit-review-auto:${encodeURIComponent(ask.character)}:${encodeURIComponent(ask.word)}:${encodeURIComponent(picked)}`);
            }
        }
        if (state.activeReader) rerenderActiveReader();
    }

    // character：改的是哪个角色。写回本卡或全局里已有的那一份，不改别的卡。
    function mutateSceneLibrary(mutator, { character = '' } = {}) {
        const target = character ? { collections: CHARACTER_COLLECTIONS, name: character } : undefined;
        if (state.activeSettings) {
            rememberAssetScope(state.activeSettings, getSillyTavernContext(options.global || globalThis));
            const sceneAssets = draftAssetLibrary(state.activeSettings, target);
            const result = mutator(sceneAssets);
            if (!result || result.ok === false) return result || { ok: false };
            const persisted = persistSettingsDraft();
            if (persisted.ok !== false) rerenderSettings();
            return persisted.ok === false ? persisted : result;
        }
        let result = null;
        const saved = saveBridgePatch((bridge) => {
            // 存储里的配置只读：mutator 会原地改素材库，先拷一份再改（只在这类低频的入库操作上发生）。
            const root = cloneData(bridge.sceneAssets || {});
            const scope = resolveAssetScope(getSillyTavernContext(options.global || globalThis));
            relocateLegacyCard(root, scope.key, scope.legacyKey);
            const owner = scope.key ? (character ? assetOwnerKey(root, scope.key, CHARACTER_COLLECTIONS, character) : scope.key) : '';
            const bucket = owner ? ensureCardLibrary(root, owner) : root;
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

    function completeGeneratedReview(item, status, name) {
        if (reviewRecoveries.has(item.key)) return reviewRecoveries.get(item.key);
        const scope = resolveAssetScope(getSillyTavernContext(options.global || globalThis)).key;
        const chatId = options.getCurrentChatId?.();
        const job = recoverOperation(async () => {
            const latest = await options.generatedAssets?.readRecord?.(item.key);
            return resolveGeneratedReview(latest || item, status, name);
        }, { global: options.global || globalThis, signal: readerRecoveryController.signal,
            isActive: () => Boolean(state.activeReader)
                && options.getCurrentChatId?.() === chatId
                && resolveAssetScope(getSillyTavernContext(options.global || globalThis)).key === scope,
            onRecover: ({ attempt }) => { if (attempt === 1) writeToastSafe('正在自动完成素材入库'); },
        }).finally(() => reviewRecoveries.delete(item.key));
        reviewRecoveries.set(item.key, job);
        return job;
    }

    async function resolveGeneratedReview(item, status, name) {
        const service = options.generatedAssets;
        if (!service || !item) return;
        const withDna = status === 'library-dna' && item.type === 'sprite';
        if (status === 'library-dna') status = 'library';
        if (status === 'library' && item.type === 'sprite') {
            const activeSettings = state.activeSettings;
            const scope = () => resolveAssetScope(getSillyTavernContext(options.global || globalThis)).key;
            const sourceScope = scope();
            const snapshot = resolveBridgeConfigSnapshot({ mode: 'default' });
            const settingsState = activeSettings || { draft: cloneData(snapshot), asyncState: {} };
            let committedAssets = cloneData(snapshot.bridge.sceneAssets);
            const save = () => {
                if (state.activeSettings !== activeSettings || scope() !== sourceScope)
                    return { ok: false, reason: 'DNA_ADOPTION_CONFLICT', writeAttempted: false };
                if (activeSettings) return persistSettingsDraft();
                const current = resolveBridgeConfigSnapshot({ mode: 'default' });
                if (typeof options.saveUnifiedSettings !== 'function') return { ok: false, reason: 'missing-save-handler', writeAttempted: false };
                const merged = applyOperationEdits(committedAssets, current.bridge.sceneAssets,
                    settingsState.draft.bridge.sceneAssets);
                let saved;
                try { saved = options.saveUnifiedSettings({ bridge: { ...current.bridge,
                    sceneAssets: merged }, readerMode: 'default', readerSettings: current.readerSettings }); }
                catch { return { ok: false, reason: 'save-failed' }; }
                if (!saved || saved.ok === false) return saved || { ok: false, reason: 'save-failed' };
                committedAssets = cloneData(merged);
                settingsState.draft.bridge.sceneAssets = merged;
                return saved;
            };
            let adoptionError = '';
            const result = await handleSettingsAction(`gen-temp-accept:${encodeURIComponent(item.key)}`, {
                state: { activeSettings: settingsState },
                options: { ...options, generatedAssets: service },
                dialogs: { prompt: async () => String(name || item.name || '').trim(),
                    alert: (message) => { adoptionError = String(message || ''); } },
                persistSettingsDraft: save, rerenderSettings: () => ({ ok: true }),
            });
            if (!result?.ok || service.getRecord?.(item.key)?.status !== 'library') {
                const failure = result?.ok === false ? result
                    : { ok: false, reason: 'DNA_ADOPTION_CONFLICT' };
                return failure;
            }
            if (activeSettings) rerenderSettings();
            if (state.activeReader) rerenderActiveReader();
            const assets = sceneAssetsForContext(settingsState.draft.bridge.sceneAssets,
                getSillyTavernContext(options.global || globalThis));
            const known = { ...assets.characterDna, ...assets.characters };
            const addedName = resolveCharacterKey(known, assets.characterAliases, name || item.name) || name || item.name;
            writeToastSafe(`已放入角色立绘「${addedName}」`);
            if (withDna) {
                if (!state.activeSettings) openSettings({ tab: 'scene', mode: state.activeReader?.mode || 'pc' });
                await state.activeSettings?.controller?.invoke('open-character-dna');
                const settings = state.activeSettings;
                if (!settings?.asyncState?.advancedOpen?.[`char-dna:${addedName}`]) {
                    await settings?.controller?.invoke(`scene-toggle-dna:${encodeURIComponent(addedName)}`);
                }
            }
            return result;
        }
        if (status === 'library' && item.type === 'background') {
            const added = mutateSceneLibrary((assets) => {
                const bound = bindGeneratedBackground(assets, item, name || item.name);
                if (!bound.ok) return bound;
                assets.scenes = bound.scenes;
                return bound;
            });
            if (!added || added.ok === false) return added || { ok: false, reason: 'save-failed' };
            writeToastSafe(`已放入场景素材「${added.name}」`);
        }
        let updated;
        try { updated = typeof service.setStatus === 'function' ? await service.setStatus(item.key, status) : { ok: false }; }
        catch (error) { updated = { ok: false }; }
        if (!updated || updated.ok === false) {
            return updated || { ok: false, reason: 'generated-asset-status-failed' };
        }
        if (state.activeReader) rerenderActiveReader();
        return { ok: true };
    }

    function openDnaCandidate(characterName, tags) {
        if (!state.activeSettings) openSettings({ page: 'chars', mode: state.activeReader ? state.activeReader.mode : 'pc' });
        if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
        openSettingsPage(state.activeSettings, 'chars');
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
        // 同页重绘不打断正在挑选的物品；翻页、切楼、换 swipe 或回读旧楼时必须清掉。
        const panelPage = `${snapshot && snapshot.chatId || ''}|${snapshot && snapshot.messageId}|${snapshot && snapshot.swipeId || 0}|${snapshot && snapshot.content && snapshot.content.currentIndex}`;
        const keepItemPanel = cfg.enabled && Number(current.turnOffset) === 0 && isReaderLastPage(snapshot)
            && container.getAttribute('data-igs-panel') === 'item'
            && !container.hasAttribute('hidden') && container.getAttribute('data-igs-panel-page') === panelPage;
        if (keepItemPanel) syncStatusHudOptionSuppression(container, true);
        else hideOptionBubbles(container);
        // 悬浮输入框 + 选项气泡：框先藏着，等选项里点「采取其他行动」才出现；翻离最后一页就收回。
        if (cfg.enabled && !(Number(current.turnOffset) > 0)) overlay.setAttribute('data-igs-options-on', '1');
        else overlay.removeAttribute('data-igs-options-on');
        if ((!isReaderLastPage(snapshot) || Number(current.turnOffset) > 0) && overlay.classList) overlay.classList.remove('igs-free-input');
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
        setCharacterNameFallback(!sceneAssets || sceneAssets.nameFallback !== false);
        readerSettings.dialogSkin = effectiveDialogSkin(readerSettings.dialogSkin, sceneAssets);
        Object.assign(readerSettings, applyFxWorldview(readerSettings, worldview, { carryPhone: Boolean(sceneAssets && sceneAssets.carryPhone === true) }));
        // 演出与聊天层据此换皮：_ancientEra 保留给既有古风分支，_worldview 供西幻 / 科幻 / 末日换皮。
        readerSettings._ancientEra = worldview === 'ancient';
        // 随身手机：线上聊天换回手机样式（chat-layer 读这个标记）。
        readerSettings._carryPhone = Boolean(readerSettings.feedFx && readerSettings.feedFx.carryPhone === true);
        readerSettings._worldview = worldview;
        readerSettings._sceneAssets = sceneAssets;
        readerSettings._live2dScope = resolveAssetScope(getSillyTavernContext(options.global || globalThis)).key;
        let live2dStorage;
        try { live2dStorage = (options.global || globalThis).localStorage; } catch { /* 存储不可用时默认关闭绑定 */ }
        readerSettings._live2d = readLive2dConfig(live2dStorage, readerSettings._live2dScope);
        // 还没入库的生成立绘的 tag：立绘默认高度据此判断没有 DNA 的角色性别与老人 / 儿童。
        const spriteTagService = options.generatedAssets;
        readerSettings._tempSpriteTags = spriteTagService && typeof spriteTagService.tempSpriteTags === 'function'
            ? spriteTagService.tempSpriteTags() : {};
        readerSettings._sentencePaging = Boolean(bridge.sentencePaging);
        readerSettings._dialogueSentencePaging = Boolean(bridge.dialogueSentencePaging);
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
    // 快照只会改顶层字段（如 sceneDialogSkin 换皮），浅拷贝就够；下层对象一律只读。
    function cloneReaderSettingsShallowAssets(readerSettings) {
        return readerSettings && typeof readerSettings === 'object' ? { ...readerSettings } : readerSettings;
    }

    // 对外返回的快照副本：深拷贝但 _sceneAssets（整份素材库，只读）按引用带过去，避免每次随素材库变大而变慢。
    function cloneSnapshotKeepAssets(snapshot) {
        const rs = snapshot && snapshot.readerSettings;
        if (!rs || typeof rs !== 'object' || !('_sceneAssets' in rs)) return cloneData(snapshot);
        const { _sceneAssets: assets, ...rest } = rs;
        const copy = cloneData({ ...snapshot, readerSettings: rest });
        copy.readerSettings._sceneAssets = assets;
        return copy;
    }

    // 返回值里的 snapshot 改惰性：首次访问才深拷并缓存，没人读就零开销（外部拿到的仍是独立副本）。
    function lazySnapshotCopy(snapshot) {
        return { __lazySnapshot: snapshot };
    }

    function withLazySnapshot(result) {
        const source = result.snapshot && result.snapshot.__lazySnapshot;
        let copy;
        let done = false;
        Object.defineProperty(result, 'snapshot', {
            enumerable: true,
            configurable: true,
            get() {
                if (!done) { copy = cloneSnapshotKeepAssets(source); done = true; }
                return copy;
            },
            set(value) { copy = value; done = true; },
        });
        return result;
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
        const readerSettings = normalizeReaderSettingsCached(snapshot.readerSettings, bridge.vnTheme);

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
        const readerSettings = normalizeReaderSettingsCached(refreshed.readerSettings, refreshed.bridge.vnTheme);
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
    'provider-not-enabled': '当前图像来源无法重画，请在设置「生图与AI › 图像来源」选择 IGS 内置 NAI 或数据库生图插件并填好配置',
    'invalid-message-id': '找不到当前楼层',
    'regen-failed': '请求出错',
    'regen-button-not-found': '当前楼层没有找到插图插件的生图按钮。若未安装智绘姬，请在设置「生图与AI › 图像来源」改选 IGS 内置 NAI 或数据库生图插件',
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
