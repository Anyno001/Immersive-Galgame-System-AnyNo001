import {
    buildIgsTextPayload,
    getMessagePrimaryText,
    getVisibleMessageTextFromElement,
    normalizeSourceFilter,
    normalizeVirtualRegex,
} from '../../scene/message-source.js';
import { extractSceneDirectives, resolveSceneStateAtIndex, resolveSceneAtSourceOffset, resolveIllustrationForPage, resolveHeldSourceOffsets, locateNarrativeOffset, stripIllustrationMarkers, resolveNearestCharacterBefore } from '../../scene/scene-directives.js';
import { classifySceneKey, resolveCharacterKey } from '../../scene/scene-directives.js';
import { recordOutfitReview, dropConfirmedOutfitReview } from '../../scene/outfit-review-store.js';
import { assetOwnerKey, assetShadowsGlobal, draftAssetLibrary, draftEffectiveAssets, effectiveSceneAssets, ensureCardLibrary, normalizeAssetCards, relocateLegacyCard, rememberAssetScope, resolveAssetScope, sceneAssetsForContext } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { renderOutfitReviewList, renderWardrobe } from './settings-outfit-fields.js';


import { isMarkerDirectiveLine, stripMarkerDirectives } from '../../scene/directive-tags.js';
import { extractFxDirectives, resolveFxAtPage } from '../../scene/fx-directives.js';
import { readStoryNow, resolveDuePromises } from '../../scene/promise-reminder.js';
import { parseTables } from '../../shujuku-panel/panel-model.js';
import { applyDiceToHits } from '../../scene/battle-context.js';
import { normalizeItemImageSettings } from '../../generated-images/illustration/item-image-settings.js';
import { createCgGalleryPanel } from './cg-gallery-panel.js';
import { cancelFxEffects } from './fx-runtime.js';
import { cancelDanmaku } from './danmaku-runtime.js';
import { cancelStageDirection } from './stage-direction-runtime.js';
import { cancelSceneGrade } from './scene-grade.js';
import { closeRomanceFx } from './romance-runtime.js';
import { closeMetaFx } from './meta-runtime.js';
import { normalizeRomanceFxSettings, resolveNsfwSpan } from './romance-settings.js';
import { cancelDailyFx } from './fx-daily.js';
import { cancelSceneAudio } from './scene-audio.js';
import { parkAudioBus, unparkAudioBus } from './audio-bus.js';
import { isStagePaused, setStagePauseReason, watchStagePause } from './stage-pause.js';
import { createReaderAutoPlay } from './reader-auto-play.js';
import { playUiSfx } from './ui-sfx.js';
import { FX_SETTINGS_NORMALIZERS, normalizeFxReaderSettings } from './fx-settings.js';
import { renderPerformancePresetBar, renderPerformanceSettings } from './performance-settings-layout.js';
import { renderWorldviewRow } from './worldview-fields.js';
import { renderQualityRow } from './render-quality-fields.js';
import { normalizeSpriteHeads } from './fx-anchor.js';
import { parseHtmlCardMarker } from '../../scene/html-cards.js';
import { resolveBackgroundAsset, resolveSpriteAsset, isGeneratedAssetUrl, bindGeneratedBackground, bindGeneratedSprite, fileGeneratedHoldings, normalizeGeneratedLibrary, isNonSpriteSpeaker, collectGeneratedImageIds } from '../../scene/asset-match.js';
import { STAGE_CAST_MAX_SEATS, STAGE_CAST_SCAN_LIMIT, pickCastMembers, resolveCastOffset, resolveStageCast } from '../../scene/stage-cast.js';
import { normalizeStageCastSettings } from './stage-direction-settings.js';
import { resolveRomanceRivalTarget } from './romance-settings.js';
import { clearCastDom } from './stage-cast-render.js';
import { CHARACTER_DNA_FIELDS, normalizeCharacterDnaMap, resolveCharacterDna } from '../../scene/character-dna.js';
import { createOutfitResolver, normalizeCharacterOutfits, normalizeWardrobe, resolveSpriteOutfit } from '../../scene/character-outfits.js';
import { collectOutfitClues } from '../../data/shujuku/outfit-clues.js';
import { CHARACTER_ADD_MENU, renderDnaCandidateBar, renderDnaOnlyCharacterList } from './settings-fields.js';
import { loadMatteEditor } from './sprite-matte-editor.js';
import { mountMatteEditor } from './sprite-matte-editor-mount.js';
import { createCanvasImageCodec } from './sprite-matte-editor-view.js';
import { createInpaintTransaction } from '../../generated-images/illustration/inpaint-transaction.js';
import { isStrictBackgroundMatch } from '../../generated-images/illustration/auto-illustration-settings.js';
import { clearCurrentCg } from '../../generated-images/illustration/clear-current-cg.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { normalizeMoodGroups, resolveMoodGroup } from '../../scene/mood-groups.js';
import { NSFW_COUNT_MAX, normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';
import { normalizeImageSourceMode, mergeLegacyNaiSettings } from '../../generated-images/image-backend.js';
import {
    getOriginalReaderHtml,
    getOriginalReaderSource,
    getOriginalReaderStyleText,
    ORIGINAL_READER_REQUIRED_SELECTORS,
    ORIGINAL_READER_STYLE_CONTRACT,
} from './original-reader-source.js';
import { getSettingsShellTemplate } from './settings-shell.js';
import { getSettingsStyleText } from './settings-style.js';
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
import { getReaderModeIcon } from './icons.js';
import { normalizeSettingsTheme, renderSettingsThemeSwitch } from './settings-theme.js';
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
import { PUBLIC_READER_MODES, getReaderModeLabel, isEmbeddedReaderMode } from '../../schemas/reader-mode.js';
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
    normalizeSpriteLayouts,
    setPath,
} from './settings-normalize.js';
import { clearReaderModeRuntime, exitDocumentFullscreen } from './reader-runtime.js';
import { enterSpriteEditMode } from './sprite-edit.js';
import { enterCastSlotEdit } from './cast-slot-edit.js';
import { createDbPanelController } from '../../shujuku-panel/panel-controller.js';
import { createMapPanelController } from './map-panel.js';
import { createRecordPanelController } from './record-panel.js';
import { createShujukuClient } from '../../data/shujuku/client.js';
import { buildStatusHudModel, listStatusHudTables, normalizeStatusHudSettings, resolveStatusAvatar } from '../../data/shujuku/status-hud-model.js';
import { readOptionItems } from '../../choices/option-table.js';
import { handleSettingsAction as runSettingsAction, releasedGeneratedImageIds } from './settings-actions.js';
import { SETTINGS_NOTICE_MS, describeSettingsFailure, markSettingsButtonBusy, remountSettingsNotice, settingsBusyLabel } from './settings-notice.js';
import { createSettingsDialogs } from './settings-dialog.js';
import { captureSettingsFocus, restoreSettingsFocus } from './settings-focus.js';
import { renderSectionResetButton, sectionResetPlaceholders } from './settings-sections.js';
import { createOnboardingController } from './onboarding-guide-controller.js';
import { normalizeImageJobLogSettings, formatImageJobLogTime, imageJobLogLevelLabel } from '../../generated-images/image-job-log.js';
import { applyFxWorldview } from '../../scene/fx-era.js';
import { resolveWorldview } from '../../scene/worldview.js';
import { loadAssetFoldersFor } from './asset-folders.js';
import { loadLegacyPresets, legacyPresetHasContent } from '../../scene/legacy-preset.js';
import { renderAssetFolderView, renderAssetFolderSelect } from './asset-folder-view.js';
import { loadMoodReview, recordMoodReview } from '../../scene/mood-review-store.js';
import { LEGACY_READER_MODES } from '../../storage/legacy-igs.js';
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
import { DIALOG_SKIN_MAGIC_ACADEMY, MAGIC_HOUSES, MAGIC_HOUSE_DEFAULT, normalizeMagicHouse } from './dialog-theme-css-skins.js';
import { normalizeCharacterHouses } from './magic-house.js';
import { DIALOG_SKIN_QINGLV } from './dialog-theme-guofeng.js';
import { normalizeGradientVeil } from './gradient-veil-dialog-skin.js';
import { SKIN_DIALOG_SCALE_OPTIONS, SKIN_DIALOG_SCALE_DEFAULT, normalizeSkinDialogScale } from './dialog-skin-frame.js';
import { normalizeStageShakeSettings } from './stage-shake-runtime.js';
import { normalizeWeatherFxSettings } from './weather-fx-runtime.js';
import {
    TYPEWRITER_DEFAULTS,
    cancelTypewriter,
    normalizeTypewriterSettings,
} from './typewriter-runtime.js';
import { TYPEWRITER_VOICE_LABELS } from './typewriter-audio.js';
import { cancelStageShakeEffect } from './stage-shake-runtime.js';
import { SETTINGS_SEARCH_INDEX, renderSettingsSearchResults } from './settings-search.js';
import { advanceChatReveal, cancelChatShow, getChatRevealState } from './chat-layer.js';
import { buildChatPageModel, normalizeChatShowSettings } from './chat-show-runtime.js';
import { resolveChatTheme } from './chat-themes.js';
import { isSystemRole, normalizeSystemRoleSettings } from './system-role.js';
import { formatChatBlockAsText, parseChatMarker } from '../../scene/chat-blocks.js';
import { normalizePromptPlacement } from './tag-grammar.js';
import { nextBilingualDisplay, normalizeBilingualSettings, resolveBilingualDisplay, stripBilingualTranslation } from './bilingual-text.js';

const ASSET_MOVE_ALL_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>';
import {
    applyReaderSnapshotToDom,
    applyToolbarState,
    buildFallbackReaderOverlay,
    buildFallbackSettingsOverlay,
    normalizeReaderStableLayers,
} from './reader-dom-render.js';

// 设置页改角色的某一项时，按这些字段里有没有这个角色名判断它在本卡还是全局。
const ASSET_CHARACTER_FIELDS = ['characters', 'characterOutfits', 'characterDna', 'characterAliases', 'statusAvatars'];

export function createIgsReaderHost(options = {}) {
    let statusHudClient = null;
    let statusHudCallback = null;
    const state = {
        activeReader: null,
        activeSettings: null,
        // T 键临时切换的双语显示方式 { base, value }：只在本次会话内有效，不写入设置；设置里改了显示方式即失效。
        bilingualDisplay: null,
    };
    const settingsDialogs = createSettingsDialogs({
        getContainer: () => (state.activeSettings && state.activeSettings.dom ? state.activeSettings.dom.root : null),
        global: options.global || globalThis,
    });
    // 新手引导：会话标记与当前步骤挂在宿主实例上，状态只存独立的 localStorage 键。
    const onboarding = createOnboardingController({
        getStorage: () => { try { return (options.global || globalThis).localStorage || null; } catch (_) { return null; } },
        openSettings: (tab) => openSettings({ tab, mode: state.activeReader ? state.activeReader.mode : undefined }),
        getSettingsController: () => (state.activeSettings ? state.activeSettings.controller : null),
        rerenderSettings: () => rerenderSettings(),
        getDocument: () => getRootDocument(options.global),
    });

    const sourceCache = createReaderSourceCache({
        parse: (input) => buildIgsTextPayload(input.liveMessage, input.parseOptions),
    });
    const imageResourceCache = createImageResourceCache(options.global || globalThis);
    let embeddedStoryObserver = null;
    let embeddedStoryTimer = null;
    const streamObserver = createChatStreamObserver({
        global: options.global || globalThis,
        getDocument: () => resolveEmbeddedDocument(state.activeReader),
        onActivity: () => handleChatStreamActivity(),
        onStable: () => handleChatStreamStable(),
        // 硬超时是最后兜底：handleChatStreamStable 恒返回 true，原条件分支永不退出。
        // 改为无条件强制退出，不再依赖主路径返回值。
        onTimeout: () => {
            exitEmbeddedLoading();
        },
    });
    // 物品图到达后重绘阅读器：演出占位与背包格位据此替换为生图。
    const offItemImageUpdatedRaw = typeof options.onItemImageUpdated === 'function'
        ? options.onItemImageUpdated(() => { if (state.activeReader) rerenderActiveReader(); })
        : null;
    const offItemImageUpdated = typeof offItemImageUpdatedRaw === 'function' ? offItemImageUpdatedRaw : () => {};
    let settingsImageRefreshTimer = 0;
    function scheduleSettingsImageRefresh() {
        if (settingsImageRefreshTimer) return;
        const g = options.global || globalThis;
        const schedule = typeof g.setTimeout === 'function' ? g.setTimeout.bind(g) : setTimeout;
        settingsImageRefreshTimer = schedule(() => {
            settingsImageRefreshTimer = 0;
            if (state.activeSettings && state.activeSettings.tab === 'scene') rerenderSettings();
        }, 0);
    }
    const offGeneratedAssetUpdated = typeof options.onGeneratedAssetUpdated === 'function'
        ? options.onGeneratedAssetUpdated((detail) => {
            if (state.activeReader) rerenderActiveReader();
            const settings = state.activeSettings;
            if (!settings) return;
            if (detail && detail.reason === 'image-loaded') {
                if (settings.tab === 'scene') scheduleSettingsImageRefresh();
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

    const host = {
        openReader,
        replaceReader,
        openSettings,
        closeReader,
        closeSettings,
        getState,
        destroy,
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
                        || Boolean(state.activeSettings) || isStagePaused(overlay)
                        || Boolean(overlay?.ownerDocument?.hidden)
                        || Boolean(overlay?.classList?.contains('igs-options-visible')),
                    busy: current.dom?.text?.dataset?.igsTypewriter === 'running'
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
        if (domState && domState.overlay) {
            state.activeReader.stopStagePause = watchStagePause(domState.overlay, { offscreen: isEmbeddedReaderMode(nextMode), root: domState.root });
        }
        syncSettingsStagePause();
        syncStatusHudSubscription();
        if (isEmbeddedReaderMode(nextMode)) {
            streamObserver.start();
            startEmbeddedStoryWatch();
        } else {
            streamObserver.stop();
            stopEmbeddedStoryWatch();
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
        current.mountMessageId = replaceOptions.mountMessageId != null ? replaceOptions.mountMessageId : current.mountMessageId;
        current.mode = mode;
        current.snapshot = merged;
        updateMountedReader(merged);
        exitEmbeddedLoading();
        if (isEmbeddedReaderMode(mode) && current.turnOffset === 0) startReaderImagePolling(current);
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

    function openSettings(openOptions = {}) {
        const normalizedTab = normalizeSettingsTab(openOptions.tab);
        const fallbackMode = state.activeReader ? state.activeReader.mode : undefined;
        if (state.activeSettings) {
            state.activeSettings.tab = normalizedTab;
            return rerenderSettings();
        }

        const initialSnapshot = resolveBridgeConfigSnapshot({ mode: 'default' });
        // 旧版「其他生图」的 NAI Key 在打开设置时并入统一的 NAI 设置，保存后即完成迁移。
        if (initialSnapshot.bridge) {
            initialSnapshot.bridge.autoIllustration = mergeLegacyNaiSettings(initialSnapshot.bridge.autoIllustration, initialSnapshot.bridge.imageApi);
        }
        const controller = createSettingsController();
        const settingsState = {
            tab: normalizedTab,
            draft: cloneData(initialSnapshot),
            initialOpenMode: initialSnapshot.bridge.openMode,
            asyncState: {},
            committedImageIds: collectGeneratedImageIds(initialSnapshot.bridge && initialSnapshot.bridge.sceneAssets),
            controller,
            dom: null,
        };
        state.activeSettings = settingsState;
        settingsState.dom = mountSettingsDom(controller);
        syncSettingsStagePause();
        playReaderUiSfx('open');
        return rerenderSettings();
    }

    // 设置面板盖住整个舞台（遮罩带全屏模糊），打开期间舞台动画与粒子暂停。
    function syncSettingsStagePause() {
        const overlay = state.activeReader && state.activeReader.dom && state.activeReader.dom.overlay;
        if (overlay) setStagePauseReason(overlay, 'panel:settings', Boolean(state.activeSettings));
    }

    function rerenderSettings() {
        if (!state.activeSettings) {
            return { ok: false, reason: 'settings-not-open' };
        }
        const snapshot = buildSettingsSnapshot(state.activeSettings);
        state.activeSettings.snapshot = snapshot;
        updateMountedSettings(snapshot);
        return {
            ok: true,
            tab: state.activeSettings.tab,
            snapshot: cloneData(snapshot),
            domMounted: Boolean(state.activeSettings.dom),
            controller: state.activeSettings.controller,
        };
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
        const next = buildStatusHudModel({
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

        });
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
        });
    }

    function resolveReaderAssetUrl(url, current) {
        const source = String(url || '').trim();
        if (!source) return '';
        const ready = imageResourceCache.get(source);
        if (ready) return ready;
        if (!current.assetLoadRequests.has(source)) {
            current.assetLoadRequests.add(source);
            const loading = imageResourceCache.load(source);
            const immediate = imageResourceCache.get(source);
            loading.then(() => {
                current.assetLoadRequests.delete(source);
                if (state.activeReader !== current) return;
                const content = current.snapshot && current.snapshot.content;
                if (!content || (content.backgroundImage !== source && content.spriteImage !== source)) return;
                updateMountedReader(current.snapshot);
            });
            if (immediate) return immediate;
        }
        return '';
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
        teardownStatusHudSubscription();
        current.autoPlayer?.stop();
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

    function closeSettings() {
        const current = state.activeSettings;
        if (!current) return { ok: true, reason: 'settings-not-open' };
        const saved = persistSettingsDraft({
            syncActiveModeFromSettings: current.initialOpenMode !== current.draft.bridge.openMode,
        });
        if (saved.ok === false) return saved;
        settingsDialogs.cancel();
        if (current.dom && typeof current.dom.dispose === 'function') {
            current.dom.dispose();
        }
        unmountNode(current.dom && current.dom.root);
        state.activeSettings = null;
        onboarding.onSettingsClosed();
        syncSettingsStagePause();
        playReaderUiSfx('close');
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
        const closed = closeSettings();
        if (closed.ok === false) return closed;
        offIllustrationUpdated();
        offIllustrationProgress();
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

    function handleChatStreamActivity() {
        const current = state.activeReader;
        if (!current || !isEmbeddedReaderMode(current.mode)) return;
        syncEmbeddedStreamMount(current);
        enterEmbeddedLoading();
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
        if (!current || !isEmbeddedReaderMode(current.mode)) return true;
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
            exitEmbeddedLoading();
            return true;
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
        syncEmbeddedReaderMount(current, message);
        current.turnOffset = 0;
        current.mountMessageId = message.id;
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
        streamObserver.stop();
        stopEmbeddedStoryWatch();
        exitEmbeddedLoading();
        if (current.dom.embeddedMount) {
            (doc.documentElement || doc.body).appendChild(root);
            teardownEmbeddedMount(current.dom.embeddedMount);
            current.dom.embeddedMount = null;
        }
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
            openSettings(tab = 'basic') {
                return openSettings({ tab, mode: state.activeReader ? state.activeReader.mode : 'pc' });
            },
            close() {
                return closeReader();
            },
        };
    }

    function createSettingsController() {
        return {
            getSnapshot() {
                return state.activeSettings ? cloneData(state.activeSettings.snapshot) : null;
            },
            switchTab(tab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                state.activeSettings.tab = normalizeSettingsTab(tab);
                return rerenderSettings();
            },
            switchImageSubTab(subTab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                state.activeSettings.asyncState.imageSubTab = normalizeImageSubTab(subTab);
                return rerenderSettings();
            },
            switchReaderSubTab(subTab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                state.activeSettings.asyncState.readerSubTab = normalizeReaderSubTab(subTab);
                return rerenderSettings();
            },
            // 设置搜索：跳到搜索结果所在的分页 / 子页，并展开所在分组与折叠区。
            goToSetting(id) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                const entry = SETTINGS_SEARCH_INDEX.find((item) => item.id === id);
                if (!entry) return { ok: false, reason: 'unknown-setting' };
                const asyncState = state.activeSettings.asyncState;
                state.activeSettings.tab = normalizeSettingsTab(entry.target.tab);
                if (entry.target.readerSubTab) asyncState.readerSubTab = normalizeReaderSubTab(entry.target.readerSubTab);
                asyncState.advancedOpen = { ...(asyncState.advancedOpen || {}) };
                for (const key of entry.target.open) asyncState.advancedOpen[key] = true;
                asyncState.settingsSearch = '';
                return rerenderSettings();
            },
            switchSceneSubTab(subTab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                state.activeSettings.asyncState.sceneSubTab = normalizeSceneSubTab(subTab);
                state.activeSettings.asyncState.wardrobeFocus = '';
                return rerenderSettings();
            },
            setValue(path, value, editOptions) {
                return updateSettingsValue(path, value, editOptions);
            },
            toggle(path) {
                const current = getPath(state.activeSettings && state.activeSettings.draft, path);
                return updateSettingsValue(path, !current);
            },
            async invoke(action) {
                let result;
                try {
                    result = await handleSettingsAction(action);
                } catch (error) {
                    result = { ok: false, reason: 'action-threw', thrown: error };
                }
                reportSettingsFailure(result);
                return result;
            },
            close() {
                const result = closeSettings();
                reportSettingsFailure(result);
                return result;
            },
        };
    }

    async function submitReaderInput(text) {
        if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        const embedded = isEmbeddedReaderMode(state.activeReader.mode);
        if (embedded) {
            enterEmbeddedLoading();
        }
        const nextText = String(firstDefined(text, state.activeReader.inputValue, '') || '');
        const send = typeof options.typeAndSend === 'function'
            ? options.typeAndSend
            : async () => ({ ok: false, reason: 'missing-send-handler' });
        const result = await send(nextText);
        if (embedded && result.ok === false) exitEmbeddedLoading();
        else if (embedded) streamObserver.noteActivity();
        state.activeReader.inputValue = '';
        if (state.activeReader.dom && state.activeReader.dom.input) {
            state.activeReader.dom.input.value = '';
        }
        writeToast(result.ok === false ? (result.reason || '发送失败') : '已发送');
        return {
            ok: result.ok !== false,
            sent: result.ok !== false,
            text: nextText,
            result,
        };
    }

    function getOptionBubbleConfig() {
        const mode = state.activeReader && state.activeReader.mode ? state.activeReader.mode : undefined;
        const unified = resolveBridgeConfigSnapshot({ mode });
        const bridge = unified.bridge;
        const ob = bridge.optionBubble && typeof bridge.optionBubble === 'object' ? bridge.optionBubble : {};
        const reader = normalizeReaderSettings(unified.readerSettings, bridge.vnTheme);
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

    function showIllustrationProgress(payload) {
        const current = state.activeReader;
        if (!current || !payload) return;
        const messageId = Number(payload.messageId);
        const contentId = current.payload && current.payload.messageId != null
            ? current.payload.messageId : current.contentMessageId;
        if (contentId == null || Number(contentId) !== messageId) return;
        if (payload.phase === 'done') {
            if (!current.cgProgress) return;
            current.cgProgress = false;
            if (current.toastMessage === '生图中') clearReaderToast(current);
            return;
        }
        current.cgProgress = true;
        writeGenerating();
    }

    function updateSettingsValue(path, value, editOptions = {}) {
        if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
        const draft = state.activeSettings.draft;

        if (path === 'bridge.openMode') {
            const nextMode = normalizeReaderMode(value, draft.bridge);
            setPath(draft, path, nextMode);
            return rerenderSettings();
        }

        setPath(draft, path, normalizeSettingsValue(path, value));
        const themeKey = path.startsWith('readerSettings.classicVnTheme.') ? 'classicVnTheme' : 'vnTheme';
        const themeRoot = `readerSettings.${themeKey}`;
        if (path === `${themeRoot}.preset` && value === 'custom') {
            const currentTheme = draft.readerSettings[themeKey] || {};
            const prevName = currentTheme._prevPreset || 'genshin';
            const source = themeKey === 'classicVnTheme'
                ? CLASSIC_DIALOG_THEME_DEFAULTS
                : (VN_THEME_PRESETS[prevName] || VN_THEME_PRESETS.genshin);
            const fields = ['nameAlign', 'textAlign', 'narrationAlign', 'thoughtAlign', 'dividerSymbol', 'nameFont', 'textFont', 'thoughtFont', 'narrationFont', 'nameColor', 'textColor', 'thoughtColor', 'narrationColor', 'dividerColor'];
            for (const f of fields) {
                setPath(draft, `${themeRoot}.${f}`, source[f]);
            }
        }
        if (path === `${themeRoot}.preset` && value !== 'custom') {
            setPath(draft, `${themeRoot}._prevPreset`, value);
        }
        if (path.startsWith(`${themeRoot}.`) && path !== `${themeRoot}.preset` && path !== `${themeRoot}._prevPreset`) {
            setPath(draft, `${themeRoot}.preset`, 'custom');
        }
        if (editOptions.liveInput) {
            state.activeSettings.snapshot.draft = cloneData(draft);
            return { ok: true };
        }
        return rerenderSettings();
    }

    function persistSettingsDraft(optionsForPersist = {}) {
        if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
        const draft = state.activeSettings.draft;
        const save = typeof options.saveUnifiedSettings === 'function'
            ? options.saveUnifiedSettings
            : null;
        if (!save) return { ok: false, reason: 'missing-save-handler' };

        if (draft.bridge && draft.bridge.sceneAssets) fileGeneratedHoldings(draft.bridge.sceneAssets);
        let result;
        try {
            result = save({
                bridge: draft.bridge,
                readerMode: 'default',
                readerSettings: draft.readerSettings,
            });
        } catch (error) {
            return { ok: false, reason: 'save-failed', saveError: error };
        }
        if (!result || result.ok === false) {
            return { ok: false, reason: 'save-failed', saveError: result && (result.message || result.reason) };
        }

        const snapshot = resolveBridgeConfigSnapshot({ mode: 'default' });
        const savedAssets = snapshot.bridge && snapshot.bridge.sceneAssets;
        const previousIds = state.activeSettings.committedImageIds || [];
        state.activeSettings.committedImageIds = collectGeneratedImageIds(savedAssets);
        const released = releasedGeneratedImageIds(previousIds, savedAssets, (options.global || globalThis).localStorage);
        const imageService = options.generatedAssets;
        if (released.length && imageService && typeof imageService.deleteImages === 'function') {
            Promise.resolve(imageService.deleteImages(released)).catch(() => {
                const globalObj = options.global || globalThis;
                if (globalObj.alert) globalObj.alert('配置已保存，但有图片没能从本机清掉。');
            });
        }
        state.activeSettings.draft = cloneData(snapshot);
        if (state.activeReader) {
            const current = state.activeReader.payload;
            const filterChanged = JSON.stringify(current.sourceFilter) !== JSON.stringify(snapshot.bridge.sourceFilter);
            const formatChanged = JSON.stringify(current.virtualRegex) !== JSON.stringify(snapshot.bridge.virtualRegex);
            if (filterChanged || formatChanged) {
                current.sourceFilter = cloneData(snapshot.bridge.sourceFilter);
                current.virtualRegex = cloneData(snapshot.bridge.virtualRegex);
                // These values were produced with the old rules; the reader must reparse its message.
                current.textSegments = null;
                current.segmentImageSlots = null;
                current.sceneDirectives = null;
                current.formattedText = '';
                sourceCache.invalidate();
            }
        }
        rerenderActiveReader({
            syncModeFromSettings: optionsForPersist.syncActiveModeFromSettings === true,
        });
        return result;
    }

    function renderImageJobLogList() {
        const log = options.imageJobLog;
        const list = log && typeof log.list === 'function' ? log.list() : [];
        if (!list.length) return '<div class="igs-image-log-empty">暂无日志。开启自动插图或素材补全后，新回复的处理过程会记录在这里。</div>';
        return list.map((e) => `<div class="igs-image-log-item is-${esc(e.level)}"><span class="igs-image-log-time">${esc(formatImageJobLogTime(e.at))}</span><span class="igs-image-log-level">${esc(imageJobLogLevelLabel(e.level))}</span><span class="igs-image-log-msg">${esc(e.message)}</span></div>`).join('');
    }

    // 生图 › CG 库：列出已生成的剧情 CG（含 NSFW 图）与照片，点缩略图用预览层看大图。首次进入时异步读取，读完重绘一次。
    function renderImageCgList() {
        const settings = state.activeSettings;
        const asyncState = settings && settings.asyncState;
        if (!asyncState) return '';
        const service = options.cgGallery;
        if (!service || typeof service.loadPage !== 'function') return '<div class="igs-scene-empty">CG 库不可用</div>';
        if (!Array.isArray(asyncState.imageCgEntries)) {
            if (!asyncState.imageCgLoading) {
                asyncState.imageCgLoading = true;
                Promise.resolve()
                    .then(() => service.loadPage({ limit: 60, showHidden: true }))
                    .then((page) => {
                        asyncState.imageCgEntries = page && page.ok && Array.isArray(page.items) ? page.items : [];
                        asyncState.imageCgStatus = page && page.ok ? '' : 'CG 读取失败';
                    })
                    .catch(() => { asyncState.imageCgEntries = []; asyncState.imageCgStatus = 'CG 读取失败'; })
                    .then(() => {
                        asyncState.imageCgLoading = false;
                        if (state.activeSettings === settings) rerenderSettings();
                    });
            }
            return '<div class="igs-scene-empty">正在读取…</div>';
        }
        const selected = asyncState.imageCgSelected instanceof Set ? asyncState.imageCgSelected : new Set();
        const tiles = asyncState.imageCgEntries.map((entry, index) => {
            const url = String((entry && entry.dataUrl) || '').trim();
            if (!/^(?:data:image\/|https?:\/\/|blob:)/i.test(url)) return '';
            const label = entry.kind === 'photo' ? '照片' : `第 ${entry.messageId} 楼`;
            const on = selected.has(entry.key);
            // 大图按序号回查已读列表，避免把整段 data URL 再塞进 data-action。
            return `<article class="igs-image-cg-tile"><label class="igs-image-cg-check"><input type="checkbox" data-action="image-cg-toggle:${index}" ${on ? 'checked' : ''} aria-label="选择${esc(label)}"></label><button type="button" class="igs-image-cg-view" data-action="image-cg-view:${index}" aria-label="查看${esc(label)}大图"><img src="${esc(url)}" decoding="async" alt=""><span>${esc(label)}</span></button><button type="button" class="igs-image-cg-delete" data-action="image-cg-delete:${index}">删除</button></article>`;
        }).join('');
        return tiles || '<div class="igs-scene-empty">还没有生成过 CG</div>';
    }

    async function handleSettingsAction(action) {
        const onboardingResult = onboarding.handleAction(action);
        if (onboardingResult) return onboardingResult;
        return runSettingsAction(action, {
            state,
            options: { ...options, openMatteEditor, openCgGallery },
            closeSettings,
            persistSettingsDraft,
            rerenderSettings,
            buildRegexPreview,
            dialogs: settingsDialogs,
            getDefaultSettings: () => normalizeUnifiedSettings({}),
            normalizeImportedSettings: (imported) => normalizeUnifiedSettings(imported),
        });
    }

    // 打开遮罩修复编辑器：只编辑 igs-gen: 生成立绘；取消/关闭不写任何资产，保存按 revision 提交。
    async function openMatteEditor(imageId) {
        const globalObj = options.global || globalThis;
        const doc = globalObj && globalObj.document;
        if (!doc || !doc.body) return { ok: false, reason: 'no-document' };
        const codec = createCanvasImageCodec(globalObj);
        if (!codec.available) return { ok: false, reason: 'no-canvas' };
        // AI 局部重绘只在后端协商支持时启用；否则按钮置灰并给出原因，绝不退化为整张重画。
        const backend = options.imageEditBackend;
        const capability = backend && typeof backend.describeEdit === 'function'
            ? backend.describeEdit()
            : { supported: false, message: '当前图像来源不支持局部重绘' };
        const inpaint = capability.supported && typeof options.alphaMatte === 'function'
            ? createInpaintTransaction({ service: options.generatedAssets, backend, matte: options.alphaMatte })
            : null;
        const editor = await loadMatteEditor(options.generatedAssets, imageId, {
            decodeImage: codec.decodeImage,
            encodePixels: codec.encodePixels,
            inpaint,
            aiUnavailableReason: inpaint ? '' : (capability.message || '当前图像来源不支持局部重绘'),
            dna: findDnaForGeneratedImage(imageId),
        });
        mountMatteEditor(doc, editor, {
            onSaved: () => {
                if (state.activeSettings) rerenderSettings();
                if (state.activeReader) rerenderActiveReader();
            },
        });
        return { ok: true, mode: editor.mode, reason: editor.reason || '' };
    }

    // 按生成素材库里引用该图片的角色名取 DNA（经 DNA 主名/原名匹配）；找不到时不注入。
    function findDnaForGeneratedImage(imageId) {
        const draft = state.activeSettings && state.activeSettings.draft;
        const raw = (draft && draft.bridge && draft.bridge.sceneAssets) || {};
        const sa = sceneAssetsForContext(raw, getSillyTavernContext(options.global || globalThis)) || {};
        const chars = normalizeGeneratedLibrary(sa.generated).characters;
        const token = `igs-gen:${imageId}`;
        const name = Object.keys(chars).find((n) => JSON.stringify(chars[n] || {}).includes(token));
        const hit = name ? resolveCharacterDna(sa.characterDna, name) : null;
        return hit ? hit.dna : null;
    }

    async function handleReaderAction(action) {
        if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        const normalizedAction = String(action || '').trim();
        state.activeReader.lastAction = normalizedAction;

        if (normalizedAction === 'auto-play') {
            const player = state.activeReader.autoPlayer;
            return { ok: true, ...player.toggle() };
        }
        if (normalizedAction === 'generate-assets') {
            return runManualAssetGeneration();
        }
        if (normalizedAction === 'settings') {
            return state.activeReader.controller.openSettings('basic');
        }
        if (normalizedAction === 'hide') {
            return state.activeReader.controller.toggleHidden();
        }
        if (normalizedAction === 'close') {
            return state.activeReader.controller.close();
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
        if (normalizedAction === 'sprite-edit') {
            const overlay = state.activeReader.dom && state.activeReader.dom.overlay;
            if (overlay && !enterCastSlotEdit(overlay, state.activeReader, buildSpriteEditContext())) enterSpriteEditMode(overlay, state.activeReader, buildSpriteEditContext());
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
        const baseSnapshot = resolveBridgeConfigSnapshot({ mode: state.activeReader.mode });
        const nextMode = syncModeFromSettings
            ? normalizeReaderMode(
                firstDefined(baseSnapshot.bridge.openMode, state.activeReader.mode),
                baseSnapshot.bridge,
            )
            : normalizeReaderMode(state.activeReader.mode, baseSnapshot.bridge);
        const unified = resolveBridgeConfigSnapshot({ mode: nextMode });
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

    async function moveReaderTurn(delta) {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        // 楼层内嵌：容器始终留在最新 AI 楼层，只切换内部阅读源，不调用宿主跳楼，
        // 避免酒馆滚动、楼层重排和阅读器重建带来的卡顿与跳动。
        if (isEmbeddedReaderMode(current.mode)) {
            return moveEmbeddedReaderTurn(current, delta);
        }
        const currentMessageId = current.snapshot && current.snapshot.messageId;
        const getAdjacentMessage = typeof options.getAdjacentMessage === 'function'
            ? options.getAdjacentMessage
            : null;
        if (currentMessageId == null || !getAdjacentMessage) {
            writeToast('楼层切换需要宿主消息列表。');
            return { ok: true, moved: false, reason: 'turn-switch-host-required' };
        }
        const target = await getAdjacentMessage(currentMessageId, delta);
        if (!target) {
            writeToast(delta > 0 ? '没有下一轮' : '没有上一轮');
            return { ok: true, moved: false, reason: 'turn-not-found', messageId: currentMessageId };
        }
        if (typeof options.jumpToMessage === 'function') {
            try {
                await options.jumpToMessage(target.id);
            } catch (error) {
                // 宿主跳转失败不阻断阅读器切层。
            }
        }
        if (typeof options.openViewerFromMessage !== 'function') {
            return { ok: false, reason: 'missing-open-viewer-handler', messageId: target.id };
        }
        const result = await options.openViewerFromMessage(target.id, current.mode, {
            startAtEnd: false,
            message: target,
        });
        if (result && result.ok !== false) {
            writeToast(delta > 0 ? '已切到下一轮' : '已切到上一轮');
            return { ok: true, moved: true, messageId: target.id, reader: result.reader };
        }
        return {
            ok: false,
            moved: false,
            reason: result && result.reason || 'turn-open-failed',
            messageId: target.id,
        };
    }

    async function moveEmbeddedReaderTurn(current, delta) {
        const getAdjacentMessage = typeof options.getAdjacentMessage === 'function'
            ? options.getAdjacentMessage
            : null;
        const currentMessageId = current.contentMessageId != null
            ? current.contentMessageId
            : (current.snapshot && current.snapshot.messageId);
        if (currentMessageId == null || !getAdjacentMessage) {
            writeToast('楼层切换需要宿主消息列表。');
            return { ok: true, moved: false, reason: 'turn-switch-host-required' };
        }
        const target = await getAdjacentMessage(currentMessageId, delta);
        if (!target) {
            writeToast(delta > 0 ? '没有下一轮' : '没有上一轮');
            return { ok: true, moved: false, reason: 'turn-not-found', messageId: currentMessageId };
        }
        if (typeof options.openViewerFromMessage !== 'function') {
            return { ok: false, reason: 'missing-open-viewer-handler', messageId: target.id };
        }
        // 历史轮次优先读文字：跳过 provider 图片收集，不跳楼、不扫不可见 DOM、不开轮询。
        const nextOffset = Math.max(0, (Number(current.turnOffset) || 0) - Number(delta));
        const result = await options.openViewerFromMessage(target.id, current.mode, {
            startAtEnd: false,
            message: target,
            replaceActive: true,
            skipImageCollection: nextOffset > 0,
            turnOffset: nextOffset,
        });
        if (result && result.ok !== false) {
            writeToast(delta > 0 ? '已切到下一轮' : '已切到上一轮');
            return { ok: true, moved: true, messageId: target.id, reader: result.reader };
        }
        return {
            ok: false,
            moved: false,
            reason: result && result.reason || 'turn-open-failed',
            messageId: target.id,
        };
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
    const ROMANCE_MEMORY_KEYS = 'igs-romance-memory-keys';
    const ROMANCE_MEMORY_KEYS_LIMIT = 300;
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
        const globalObj = options.global || globalThis;
        const panel = createCgGalleryPanel(overlay.ownerDocument, {
            service: options.cgGallery,
            getChatId: () => (typeof options.getCurrentChatId === 'function' ? options.getCurrentChatId() : ''),
            confirm: (message) => (globalObj && typeof globalObj.confirm === 'function' ? globalObj.confirm(message) : false),
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
        const globalObj = options.global || globalThis;
        if (typeof globalObj.confirm === 'function'
            && !globalObj.confirm('清扫当前这张 CG？正文里对应的挂载点会一起删掉。')) {
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
            const globalObj = options.global || globalThis;
            if (typeof globalObj.confirm === 'function'
                && !globalObj.confirm('重写本楼提示词，并重画全部 CG？原来的图和挂载点都会换掉。')) {
                return { ok: true, reason: 'cancelled' };
            }
            return runManualIllustration({ reroll: true });
        }
        const cg = await runManualIllustration({ deferSkip: true });
        if (!cg || !cg.skipMessage) return cg;
        const regen = await regenerateCurrentImage();
        if (regen && regen.reason === 'provider-not-enabled') {
            writeToastSafe(cg.skipMessage);
            return cg;
        }
        return regen;
    }

    async function rerollCurrentIllustration() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        const content = current.snapshot && current.snapshot.content || {};
        if (!content.illustrationActive || !content.illustrationUrl || !content.illustrationSlot) {
            writeToastSafe('当前页没有可重画的 CG。');
            return { ok: true, reason: 'no-current-cg' };
        }
        const service = options.illustrations;
        if (!service || typeof service.rerollSlot !== 'function') {
            writeToastSafe('当前未接入单张重画。');
            return { ok: false, reason: 'reroll-unavailable' };
        }
        const globalObj = options.global || globalThis;
        if (typeof globalObj.confirm === 'function'
            && !globalObj.confirm('只重画这一张？提示词不变。')) {
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
                if (!result || result.ok === false) writeToastSafe(`重画失败：${(result && result.error) || '未返回具体原因'}`);
                else if (result.reason === 'not-eligible') writeToastSafe('请打开当前聊天最新的非空 AI 楼层');
                else writeToastSafe('这一张已重画。');
            }
            return result || { ok: false, reason: 'error' };
        } catch (error) {
            if (state.activeReader === current) writeToastSafe(`重画异常：${(error && error.message) || error || '未知错误'}`);
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
        const globalObj = options.global || globalThis;
        if (typeof globalObj.confirm === 'function'
            && !globalObj.confirm('清扫本楼全部 CG？正文里的挂载点会一起删掉，不会马上重画。')) {
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
            else writeToastSafe(message);
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
            else writeToastSafe(message);
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
        writeToast(result && result.ok !== false
            ? '背景图已更新。'
            : `重新生图失败：${describeRegenFailure(result && result.reason)}`);
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
            return buildStatusHudModel({ settings: statusHud, sceneAssets, character: speaker, emotion, location: info.location, time: info.time, weather: info.weather, isNarration, readResult, outfitFor });
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
            avatarFor: (key) => resolveStatusAvatar(sceneAssets && sceneAssets.statusAvatars, key),
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
            tempSprite: generatedAssets ? generatedAssets.tempSprite : null,
        };
        const sceneDirectives = Array.isArray(extracted.sceneDirectives) ? extracted.sceneDirectives
            : Array.isArray(payload.sceneDirectives) ? payload.sceneDirectives : [];
        const hasIgsDirectives = sceneDirectives.length > 0;
        let finalBackgroundImage = backgroundImage;
        let finalBackgroundTimed = false;
        const hideSpriteOnNsfw = !normalizeStatusHudSettings(readerSettings && readerSettings.statusHud).showSpriteOnNsfw;
        let spriteImage = null;
        let resolvedSpeaker = scene.speaker || '';
        let spriteCharacter = '';
        let spriteOutfit = '';
        let castSprites = [];
        let speakerCastOrder = null;
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
        const markerImageUrl = illustrationHit && !illustrationUrl
            ? resolveIllustrationMarkerImageUrl(displayImageState, illustrationHit.slot)
            : '';
        if (illustrationUrl) {
            finalBackgroundImage = illustrationUrl;
            spriteImage = null;
        } else if (markerImageUrl) {
            finalBackgroundImage = markerImageUrl;
            spriteImage = null;
        } else if (slotBoundUrl) {
            finalBackgroundImage = slotBoundUrl;
            spriteImage = null;
        } else if (sceneAssets && sceneAssets.enabled) {
            if (sceneStateForBg && sceneStateForBg.scene) {
                const bgHit = resolveBackgroundAsset(sceneStateForBg, assetMatchCtx);
                finalBackgroundImage = resolveGenerated(bgHit.url);
                finalBackgroundTimed = Boolean(finalBackgroundImage) && bgHit.timed === true;
            } else {
                finalBackgroundImage = '';
            }
            spriteImage = null;
        }
        const cgActive = Boolean(illustrationUrl || markerImageUrl);
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
                    const castUser = String((getSillyTavernContext(options.global || globalThis) || {}).name1 || '');
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
                        isEligible: (name) => !isNonSpriteSpeaker(name, castUser) && !isSystemRole(name, readerSettings.systemRole),
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
                sceneNsfw: Boolean(sceneStateForBg && sceneStateForBg.nsfw),
                illustrationActive: Boolean(illustrationUrl),
                cgActive,
                illustrationSlot: illustrationHit ? illustrationHit.slot : null,
                illustrationUrl,
                statusHud: buildStatusHudForSnapshot(readerSettings, sceneStateForBg && sceneStateForBg.nsfw ? '' : resolvedSpeaker, sceneStateForBg && sceneStateForBg.nsfw ? '' : bubbleMood, statusSceneInfo, textType === 'narration' || textType === 'thought' || textType === 'chat' || textType === 'system' || Boolean(sceneStateForBg && sceneStateForBg.nsfw && hideSpriteOnNsfw), { character: spriteCharacter, outfit: spriteOutfit }),
            },
            readerSettings: cloneData(readerSettings),
            input: {
                placeholder: '输入内容后按 Enter 发送',
                enterSends: true,
                shiftEnterSends: false,
            },
            html: `<div id="igs-overlay" class="${overlayClasses.join(' ')}" data-igs-igs-ui="true">${getOriginalReaderHtml()}</div>`,
            source: getOriginalReaderSource(options.version || '0.5.4'),
        };
    }

    function buildSettingsSnapshot(settingsState) {
        const draft = normalizeUnifiedSettings(settingsState.draft);
        const tab = normalizeSettingsTab(settingsState.tab);
        const imageSubTab = tab === 'image' ? normalizeImageSubTab(settingsState.asyncState.imageSubTab) : null;
        const readerSubTab = tab === 'reader' ? normalizeReaderSubTab(settingsState.asyncState.readerSubTab) : null;
        const sceneSubTab = tab === 'scene' ? normalizeSceneSubTab(settingsState.asyncState.sceneSubTab) : null;
        const settingsTheme = normalizeSettingsTheme(draft.bridge.settingsTheme);
        const body = renderSettingsBody(tab, draft, settingsState.asyncState);
        const tabsHtml = SETTINGS_TAB_DEFS.map(([id, label]) => {
            return `<button type="button" class="igs-settings-tab${tab === id ? ' is-active' : ''}" data-tab="${id}">${label}</button>`;
        }).join('');

        return {
            tab,
            imageSubTab,
            readerSubTab,
            sceneSubTab,
            settingsTheme,
            settingsThemeSwitch: renderSettingsThemeSwitch(settingsTheme),
            selectors: Array.from(SETTINGS_PANEL_REQUIRED_SELECTORS),
            tabs: SETTINGS_TAB_DEFS.map(([id, label]) => ({
                id,
                label,
                active: id === tab,
                requiredPaths: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredPaths || []),
                requiredActions: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredActions || []),
            })),
            activeContract: SETTINGS_PANEL_TAB_CONTRACT[tab],
            html: `<div id="igs-unified-settings" data-igs-igs-ui="true" data-igs-settings-theme="${settingsTheme}">${renderTemplate(getSettingsShellTemplate(), {
                version: esc(options.version || '0.5.4'),
                tabs: tabsHtml,
                body,
                settingsThemeSwitch: renderSettingsThemeSwitch(settingsTheme),
            })}</div>`,
            resultText: {
                image: settingsState.asyncState.imageResult || '',
                imageModels: settingsState.asyncState.imageModelsMessage || '',
                llmModels: settingsState.asyncState.llmModelsMessage || '',
                naiModels: settingsState.asyncState.naiModelsMessage || '',
                virtualRegex: settingsState.asyncState.virtualRegexPreview || '',
                promptRule: settingsState.asyncState.promptRuleStatus || '',
                promptRuleDraft: settingsState.asyncState.promptRuleDraft,
            },
            draft,
        };
    }

    function renderSettingsBody(tab, draft, asyncState) {
        function buildStatusHudSettingsHtml(reader, options) {
            const statusHud = normalizeStatusHudSettings(reader && reader.statusHud);
            const sectionClass = 'igs-settings-section igs-status-hud-section';
            const toggle = checkbox('readerSettings.statusHud.enabled', statusHud.enabled, '显示左上角状态栏');
            if (!statusHud.enabled) {
                return `<div class="${sectionClass}" data-status-hud>${toggle}</div>`;
            }
            const api = (options.global || globalThis).AutoCardUpdaterAPI || null;
            const listed = api ? listStatusHudTables(createShujukuClient(api).readTables()) : { ok: false, reason: 'missing-api', tables: [] };
            const body = [
                toggle,
                '<div class="igs-settings-sub">',
                checkbox('readerSettings.statusHud.showEmotion', statusHud.showEmotion, '显示情绪标签'),
                checkbox('readerSettings.statusHud.showLocation', statusHud.showLocation, '显示地点栏（仅旁白）'),
                statusHud.showLocation ? `<div class="igs-settings-sub">${checkbox('readerSettings.statusHud.showLocationDetails', statusHud.showLocationDetails, '显示更多的场景信息')}</div>` : '',
                '<div class="igs-source-filter-grid">',
                field('readerSettings.statusHud.size', '状态栏大小', segmentedInput('readerSettings.statusHud.size', statusHud.size, [['small', '小'], ['medium', '中'], ['large', '大']], '状态栏大小')),
                '</div>',
                `<div class="igs-settings-field"><span>显示的表格</span>${tableMultiSelect('readerSettings.statusHud.tables', statusHud.tables, listed.tables, { note: listed.ok ? '' : '数据库插件未就绪' })}</div>`,
                `<details class="igs-settings-sub igs-settings-advanced" data-advanced="status-hud-look"${asyncState.advancedOpen && asyncState.advancedOpen['status-hud-look'] ? ' open' : ''}><summary>高级：头像圆角、背景与配色</summary>`,
                '<div class="igs-source-filter-grid">',
                field('readerSettings.statusHud.avatarRadius', '头像圆角', selectInput('readerSettings.statusHud.avatarRadius', statusHud.avatarRadius, [['square', '方角'], ['soft', '微圆角'], ['small', '小圆角'], ['medium', '中圆角'], ['large', '大圆角'], ['circle', '圆形']])),
                field('readerSettings.statusHud.background', '状态栏背景', segmentedInput('readerSettings.statusHud.background', statusHud.background, [['none', '无背景'], ['dialog', '跟随对话框']], '状态栏背景')),
                field('readerSettings.statusHud.barColor', 'HUD条配色', segmentedInput('readerSettings.statusHud.barColor', statusHud.barColor, [['color', '彩色'], ['grayscale', '灰白']], 'HUD条配色')),
                '</div></details>',
                '</div>',
            ].join('');
            return `<div class="${sectionClass}" data-status-hud>${body}</div>`;
        }

        const bridge = draft.bridge;
        const worldviewAssets = asyncState.assetScopeKey
            ? effectiveSceneAssets(bridge.sceneAssets, asyncState.assetScopeKey)
            : bridge.sceneAssets;
        const imageApi = bridge.imageApi;
        const sourceFilter = bridge.sourceFilter;
        const reader = draft.readerSettings;

        const advancedOpen = (key) => (asyncState.advancedOpen && asyncState.advancedOpen[key] ? ' open' : '');

        if (tab === 'basic') {
            return renderTemplate(getSettingsTabTemplate('basic'), {
                performancePresetBar: renderPerformancePresetBar(reader, { home: true, extraRows: renderWorldviewRow(worldviewAssets) + renderQualityRow(reader) }),
                advancedFilterOpen: advancedOpen('source-filter'),
                advancedRegexOpen: advancedOpen('virtual-regex'),
                openModeField: `<div class="igs-segmented-field">${field(
                    'bridge.openMode',
                    '打开方式',
                    segmentedInput(
                        'bridge.openMode',
                        bridge.openMode,
                        PUBLIC_READER_MODES.map((id) => [id, getReaderModeLabel(id), getReaderModeIcon(id)]),
                        '打开方式',
                    ),
                )}</div>`,
                settingsToggles: checkbox('bridge.showToasts', bridge.showToasts, '显示提示弹窗'),
                resetBasicSourceFilter: renderSectionResetButton('basic-source-filter'),
                filterToggle: checkbox('bridge.sourceFilter.enabled', sourceFilter.enabled, '启用标签筛选'),
                filterHidden: hiddenAttr(!sourceFilter.enabled),
                filterOptionToggles: checkbox('bridge.sourceFilter.stripHtmlComments', sourceFilter.stripHtmlComments, '排除 HTML 注释')
                    + checkbox(
                        'bridge.sourceFilter.allowUntaggedFallback',
                        sourceFilter.allowUntaggedFallback,
                        '正文保留标签为空时读取清洗全文',
                    ),
                textIncludeField: field('bridge.sourceFilter.textIncludeTags', '正文保留标签', textareaInput('bridge.sourceFilter.textIncludeTags', sourceFilter.textIncludeTags, 'content')),
                textExcludeField: field('bridge.sourceFilter.textExcludeTags', '正文排除标签', textareaInput('bridge.sourceFilter.textExcludeTags', sourceFilter.textExcludeTags)),
                htmlCardField: field('bridge.sourceFilter.htmlCardTags', 'HTML 卡片标签（整块单独成页渲染）', textareaInput('bridge.sourceFilter.htmlCardTags', sourceFilter.htmlCardTags, 'htm1fenge')),
                imageIncludeField: field('bridge.sourceFilter.imageIncludeTags', '图片保留标签', textareaInput('bridge.sourceFilter.imageIncludeTags', sourceFilter.imageIncludeTags, 'image&#10;text_to_image')),
                regexToggle: checkbox('bridge.virtualRegex.enabled', bridge.virtualRegex.enabled, '启用正文格式化'),
                regexHidden: hiddenAttr(!bridge.virtualRegex.enabled),
                regexPatternField: field('bridge.virtualRegex.pattern', '查找表达式', textareaInput('bridge.virtualRegex.pattern', bridge.virtualRegex.pattern, '^@bubble:([^|\\n]+)\\|[^|\\n]*\\|\\[?([^\\n]*?)\\]?$')),
                regexFlagsField: field('bridge.virtualRegex.flags', 'flags', textInput('bridge.virtualRegex.flags', bridge.virtualRegex.flags, 'i')),
                regexReplacementField: field('bridge.virtualRegex.replacement', '替换文本', textareaInput('bridge.virtualRegex.replacement', bridge.virtualRegex.replacement, '[$1]：$2')),
                regexExtraRules: (() => {
                    const rules = Array.isArray(bridge.virtualRegex.rules) ? bridge.virtualRegex.rules : [];
                    return `<div class="igs-settings-full igs-settings-sub igs-regex-extra-rules">
                        <div class="igs-settings-section-head"><div class="igs-settings-subhead">自定义规则（依上下顺序生效）</div><button class="igs-settings-action" data-action="add-virtual-regex" type="button">新增一条</button></div>
                        ${rules.map((rule, index) => `<div class="igs-settings-sub igs-regex-extra-rule">
                            <div class="igs-settings-row"><strong>追加规则 ${index + 1}</strong><button class="igs-settings-action" data-action="remove-virtual-regex:${index}" type="button">删除</button></div>
                            <div class="igs-source-filter-grid">
                                ${field(`bridge.virtualRegex.rules.${index}.pattern`, '查找表达式', textareaInput(`bridge.virtualRegex.rules.${index}.pattern`, rule.pattern, '输入正则表达式'))}
                                ${field(`bridge.virtualRegex.rules.${index}.flags`, 'flags', textInput(`bridge.virtualRegex.rules.${index}.flags`, rule.flags, 'i'))}
                                <div class="igs-settings-full">${field(`bridge.virtualRegex.rules.${index}.replacement`, '替换文本', textareaInput(`bridge.virtualRegex.rules.${index}.replacement`, rule.replacement, '输入替换文本'))}</div>
                            </div>
                        </div>`).join('')}
                    </div>`;
                })(),
                regexPreview: esc(asyncState.virtualRegexPreview || ''),
            });
        }

        if (tab === 'image') {
            const sourceMode = normalizeImageSourceMode(imageApi.mode);
            const auto = normalizeAutoIllustrationSettings(mergeLegacyNaiSettings(bridge.autoIllustration, imageApi));
            const sourceNotes = {
                nai: '使用你的 NAI Key 直接生成剧情 CG、素材和重画。',
                dbgen: '提示词、画师串和 NAI Key 在数据库生图插件里设置。',
                extension: '画风沿用智绘姬的设置；填写下方 NAI Key 后，智绘姬出图失败时会改用 NAI。',
            };
            const contentNotes = {
                nai: '当前图像来源：IGS 内置 NAI。',
                dbgen: '当前图像来源：数据库生图插件。',
                extension: '当前图像来源：智绘姬。',
            };
            const openaiDisabled = auto.llm.source !== 'openai';
            const autoTextarea = (path, value, placeholder) => `<textarea data-path="${esc(path)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
            const imageSubTab = normalizeImageSubTab(asyncState.imageSubTab);
            const logSettings = normalizeImageJobLogSettings(bridge.imageJobLog);
            const imageFields = {
                imageLogRetainDaysField: field('bridge.imageJobLog.retainDays', '自动清理：保留天数（0 为不按时间清理）', numberInput('bridge.imageJobLog.retainDays', logSettings.retainDays, 0, 30)),
                imageLogMaxEntriesField: field('bridge.imageJobLog.maxEntries', '自动清理：最多保留条数', numberInput('bridge.imageJobLog.maxEntries', logSettings.maxEntries, 50, 1000)),
                imageLogStatus: esc(asyncState.imageLogStatus || ''),
                imageLogList: imageSubTab === 'logs' ? renderImageJobLogList() : '',
                imageCgStatus: esc(asyncState.imageCgStatus || ''),
                imageCgList: imageSubTab === 'cg' ? renderImageCgList() : '',
                imageSourceField: field('bridge.imageApi.mode', '图像来源', segmentedInput('bridge.imageApi.mode', sourceMode, [['nai', 'IGS 内置 NAI'], ['dbgen', '数据库生图插件'], ['extension', '智绘姬']], '图像来源')),
                imageSourceNote: esc(sourceNotes[sourceMode]),
                imageContentNote: esc(contentNotes[sourceMode]),
                sourceNaiHidden: hiddenAttr(sourceMode === 'dbgen'),
                sourceExtensionHidden: hiddenAttr(sourceMode !== 'extension'),
                sourceDbgenHidden: hiddenAttr(sourceMode !== 'dbgen'),
                advancedNaiOpen: advancedOpen('nai'),
                advancedExtensionOpen: advancedOpen('extension'),
                advancedNsfwOpen: advancedOpen('nsfw'),
                advancedAssetTemplatesOpen: advancedOpen('asset-templates'),
                autoAssetOptionsHidden: hiddenAttr(!auto.assets.spriteEnabled && !auto.assets.backgroundEnabled),
                assetSceneWarnHidden: hiddenAttr(!(auto.assets.spriteEnabled || auto.assets.backgroundEnabled) || Boolean(bridge.sceneAssets && bridge.sceneAssets.enabled)),
                autoLlmNote: esc('用于规划剧情 CG 的画面，可沿用酒馆 API 或单独配置。'),
                adapterField: field('bridge.imageApi.externalAdapter', '识别范围', selectInput('bridge.imageApi.externalAdapter', imageApi.externalAdapter, [['auto', '自动检测'], ['chatu8', '仅智绘姬（st-chatu8）']])),
                pollIntervalField: field('bridge.imageApi.pollIntervalMs', '等待新图：查询间隔（毫秒）', numberInput('bridge.imageApi.pollIntervalMs', imageApi.pollIntervalMs, 500, 30000)),
                pollAttemptsField: field('bridge.imageApi.pollAttempts', '等待新图：查询次数', numberInput('bridge.imageApi.pollAttempts', imageApi.pollAttempts, 1, 240)),
                imageTestActionLabel: sourceMode === 'extension' ? '检测智绘姬' : (sourceMode === 'dbgen' ? '检测并测试生成' : '测试生成'),
                imageTestHelp: esc(asyncState.imageResult || ''),
                autoNsfwField: checkbox('bridge.autoIllustration.nsfwEnabled', auto.nsfwEnabled, 'NSFW 自动生图'),
                autoNsfwHidden: hiddenAttr(!auto.nsfwEnabled),
                autoNsfwCountField: field('bridge.autoIllustration.nsfwCount', '每层张数', numberInput('bridge.autoIllustration.nsfwCount', auto.nsfwCount, 1, NSFW_COUNT_MAX)),
                autoAssetSpriteField: checkbox('bridge.autoIllustration.assets.spriteEnabled', auto.assets.spriteEnabled, '自动补全无名角色立绘'),
                autoAssetBackgroundField: checkbox('bridge.autoIllustration.assets.backgroundEnabled', auto.assets.backgroundEnabled, '自动补全缺失场景背景'),
                autoAssetStrictField: checkbox('bridge.autoIllustration.assets.strictMatch', auto.assets.strictMatch, '精准场景匹配'),
                autoAssetMaxField: field('bridge.autoIllustration.assets.maxPerFloor', '每层最多生成数', numberInput('bridge.autoIllustration.assets.maxPerFloor', auto.assets.maxPerFloor, 1, 16)),
                autoAssetSpriteSizeField: field('bridge.autoIllustration.assets.spriteSize', '立绘尺寸', textInput('bridge.autoIllustration.assets.spriteSize', auto.assets.spriteSize, '832x1216')),
                autoAssetBackgroundSizeField: field('bridge.autoIllustration.assets.backgroundSize', '背景尺寸', textInput('bridge.autoIllustration.assets.backgroundSize', auto.assets.backgroundSize, '1216x832')),
                autoAssetBackgroundTemplateField: field('bridge.autoIllustration.assets.templates.background', '场景正向提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.background', auto.assets.templates.background, '必须包含 {tags}')),
                autoAssetBackgroundNegativeTemplateField: field('bridge.autoIllustration.assets.templates.backgroundNegative', '场景负面提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.backgroundNegative', auto.assets.templates.backgroundNegative, '不希望场景出现的 tag')),
                autoAssetSpriteTemplateField: field('bridge.autoIllustration.assets.templates.sprite', '人物正向提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.sprite', auto.assets.templates.sprite, '必须包含 {tags}')),
                autoAssetSpriteNegativeTemplateField: field('bridge.autoIllustration.assets.templates.spriteNegative', '人物负面提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.spriteNegative', auto.assets.templates.spriteNegative, '不希望人物立绘出现的 tag')),
                autoAssetNsfwExtraField: field('bridge.autoIllustration.assets.templates.nsfwExtra', 'NSFW 附加提示词', autoTextarea('bridge.autoIllustration.assets.templates.nsfwExtra', auto.assets.templates.nsfwExtra, 'NSFW 被拒后重试时追加的提示词')),
                autoInterludeField: checkbox('bridge.autoIllustration.interludeEnabled', auto.interludeEnabled, '过场插图'),
                autoInterludeHidden: hiddenAttr(!auto.interludeEnabled),
                autoInterludeProbabilityField: field('bridge.autoIllustration.interludeProbability', '触发概率 %', numberInput('bridge.autoIllustration.interludeProbability', auto.interludeProbability, 0, 100)),
                autoInterludeMaxField: field('bridge.autoIllustration.interludeMaxCount', '每层最多张数', numberInput('bridge.autoIllustration.interludeMaxCount', auto.interludeMaxCount, 1, 16)),
                autoAssetSpriteField: checkbox('bridge.autoIllustration.assets.spriteEnabled', auto.assets.spriteEnabled, '自动生成角色立绘'),
                autoAssetBackgroundField: checkbox('bridge.autoIllustration.assets.backgroundEnabled', auto.assets.backgroundEnabled, '自动生成场景背景'),
                autoAssetStrictField: checkbox('bridge.autoIllustration.assets.strictMatch', auto.assets.strictMatch, '严格匹配背景素材'),
                autoAssetMaxField: field('bridge.autoIllustration.assets.maxPerFloor', '每层最多素材数', numberInput('bridge.autoIllustration.assets.maxPerFloor', auto.assets.maxPerFloor, 1, 16)),
                autoAssetSpriteSizeField: field('bridge.autoIllustration.assets.spriteSize', '立绘尺寸', textInput('bridge.autoIllustration.assets.spriteSize', auto.assets.spriteSize, '832x1216')),
                autoAssetBackgroundSizeField: field('bridge.autoIllustration.assets.backgroundSize', '背景尺寸', textInput('bridge.autoIllustration.assets.backgroundSize', auto.assets.backgroundSize, '1216x832')),
                autoAssetBackgroundTemplateField: field('bridge.autoIllustration.assets.templates.background', '场景正向提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.background', auto.assets.templates.background, '必须包含 {tags}')),
                autoAssetBackgroundNegativeTemplateField: field('bridge.autoIllustration.assets.templates.backgroundNegative', '场景负面提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.backgroundNegative', auto.assets.templates.backgroundNegative, '不希望场景出现的 tag')),
                autoAssetSpriteTemplateField: field('bridge.autoIllustration.assets.templates.sprite', '人物正向提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.sprite', auto.assets.templates.sprite, '必须包含 {tags}')),
                autoAssetSpriteNegativeTemplateField: field('bridge.autoIllustration.assets.templates.spriteNegative', '人物负面提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.spriteNegative', auto.assets.templates.spriteNegative, '不希望人物立绘出现的 tag')),
                autoAssetNsfwExtraField: field('bridge.autoIllustration.assets.templates.nsfwExtra', 'NSFW 附加提示词', autoTextarea('bridge.autoIllustration.assets.templates.nsfwExtra', auto.assets.templates.nsfwExtra, 'NSFW 被拒后重试时追加的提示词')),
                autoSharedHidden: hiddenAttr((!auto.nsfwEnabled && !auto.interludeEnabled && !auto.assets.spriteEnabled && !auto.assets.backgroundEnabled)
                    || (sourceMode === 'dbgen' && !auto.nsfwEnabled && !auto.interludeEnabled)),
                // 物品图：独立开关（默认关闭，关闭时不读表、不联网）；背包格子图标是用户显示偏好。
                itemImageFields: checkbox('bridge.itemImages.enabled', normalizeItemImageSettings(bridge.itemImages).enabled, '自动生成物品图')
                    + field('bridge.itemImages.inventoryIcon', '背包格子图标', selectInput('bridge.itemImages.inventoryIcon', normalizeItemImageSettings(bridge.itemImages).inventoryIcon, [['image', '生图'], ['svg', 'SVG']])),
                autoLlmApiHidden: hiddenAttr(openaiDisabled),
                autoLlmSourceField: field('bridge.autoIllustration.llm.source', '来源', selectInput('bridge.autoIllustration.llm.source', auto.llm.source, [['tavern', '酒馆当前 API（消耗主模型额度）'], ['openai', '独立 OpenAI 兼容 API']])),
                autoLlmEndpointField: field('bridge.autoIllustration.llm.endpoint', '地址', textInput('bridge.autoIllustration.llm.endpoint', auto.llm.endpoint, 'https://.../v1', 'text', openaiDisabled)),
                autoLlmKeyField: field('bridge.autoIllustration.llm.apiKey', 'API Key', secretInput('bridge.autoIllustration.llm.apiKey', auto.llm.apiKey, '无需 Key 可留空', openaiDisabled)),
                autoLlmModelField: field('bridge.autoIllustration.llm.model', '模型', modelPicker('bridge.autoIllustration.llm.model', auto.llm.model, asyncState.llmModels, 'fetch-llm-models', 'gpt-4o-mini', openaiDisabled)),
                autoLlmModelsMessage: esc(asyncState.llmModelsMessage || ''),
                autoLlmPromptsOpen: advancedOpen('llm-prompts'),
                advancedJailbreakOpen: advancedOpen('llm-jailbreak'),
                autoLlmJailbreakHeadField: field('bridge.autoIllustration.llm.jailbreakHead', '头部附加词', autoTextarea('bridge.autoIllustration.llm.jailbreakHead', auto.llm.jailbreakHead, '')),
                autoLlmJailbreakTailField: field('bridge.autoIllustration.llm.jailbreakTail', '尾部附加词', autoTextarea('bridge.autoIllustration.llm.jailbreakTail', auto.llm.jailbreakTail, '')),
                autoLlmPromptIllustrationField: field('bridge.autoIllustration.llm.prompts.illustration', 'CG 插图规划', autoTextarea('bridge.autoIllustration.llm.prompts.illustration', auto.llm.prompts.illustration, '清空即恢复内置提示词')),
                autoLlmPromptIllustrationSoftField: field('bridge.autoIllustration.llm.prompts.illustrationSoft', 'CG 插图规划 · 温和重试（NSFW 被拒后使用）', autoTextarea('bridge.autoIllustration.llm.prompts.illustrationSoft', auto.llm.prompts.illustrationSoft, '清空即恢复内置提示词')),
                autoLlmPromptAssetField: field('bridge.autoIllustration.llm.prompts.asset', '素材补全规划', autoTextarea('bridge.autoIllustration.llm.prompts.asset', auto.llm.prompts.asset, '清空即恢复内置提示词')),
                autoLlmPromptAssetSoftField: field('bridge.autoIllustration.llm.prompts.assetSoft', '素材补全规划 · 温和重试', autoTextarea('bridge.autoIllustration.llm.prompts.assetSoft', auto.llm.prompts.assetSoft, '清空即恢复内置提示词')),
                autoLlmContextField: field('bridge.autoIllustration.llm.contextFloors', '参考前文楼层数', numberInput('bridge.autoIllustration.llm.contextFloors', auto.llm.contextFloors, 0, 3)),
                autoNaiTransportField: field('bridge.autoIllustration.nai.transport', '传输方式', selectInput('bridge.autoIllustration.nai.transport', auto.nai.transport, [['direct', '浏览器直连'], ['st-proxy', '酒馆 CORS 代理（需开启 enableCorsProxy）']])),
                autoNaiEndpointField: field('bridge.autoIllustration.nai.endpoint', '接口地址', textInput('bridge.autoIllustration.nai.endpoint', auto.nai.endpoint, '留空使用官方 image.novelai.net')),
                autoNaiKeyField: field('bridge.autoIllustration.nai.apiKey', 'NAI Key', secretInput('bridge.autoIllustration.nai.apiKey', auto.nai.apiKey, 'pst-...')),
                autoNaiModelField: field('bridge.autoIllustration.nai.model', '模型', modelPicker('bridge.autoIllustration.nai.model', auto.nai.model, asyncState.naiModels, 'fetch-nai-models', 'nai-diffusion-4-5-full')),
                autoNaiModelsMessage: esc(asyncState.naiModelsMessage || ''),
                autoNaiSizeField: field('bridge.autoIllustration.nai.size', '尺寸', textInput('bridge.autoIllustration.nai.size', auto.nai.size, '832x1216')),
                autoNaiStepsField: field('bridge.autoIllustration.nai.steps', '步数', numberInput('bridge.autoIllustration.nai.steps', auto.nai.steps, 1, 50)),
                autoNaiScaleField: field('bridge.autoIllustration.nai.scale', 'CFG', numberInput('bridge.autoIllustration.nai.scale', auto.nai.scale, 0, 10, false, 'any')),
                autoNaiSamplerField: field('bridge.autoIllustration.nai.sampler', '采样器', textInput('bridge.autoIllustration.nai.sampler', auto.nai.sampler, 'k_euler_ancestral')),
                autoNaiArtistField: field('bridge.autoIllustration.nai.artistPrefix', '画师串 / 固定前缀', autoTextarea('bridge.autoIllustration.nai.artistPrefix', auto.nai.artistPrefix, '可选，拼在每张图的正向提示词最前面')),
                autoNaiNegativeField: field('bridge.autoIllustration.nai.negativePrompt', '负面提示词', autoTextarea('bridge.autoIllustration.nai.negativePrompt', auto.nai.negativePrompt, '')),
            };
            return renderTemplate(getSettingsTabTemplate('image'), {
                imageSubTabs: IMAGE_SUBTAB_DEFS.map(([id, label]) => `<button type="button" class="igs-image-subtab${imageSubTab === id ? ' is-active' : ''}" data-image-subtab="${id}" role="tab" aria-selected="${imageSubTab === id}">${label}</button>`).join(''),
                imageSubPane: renderTemplate(getImageSubTabTemplate(imageSubTab), imageFields),
            });
        }

        if (tab === 'scene') {
            const scopeState = rememberAssetScope(state.activeSettings, getSillyTavernContext(options.global || globalThis));
            // 列表显示这张卡实际会用的一份（本卡盖在全局上）。每条带「本卡 / 全局」标签，改哪条就写回它所在的那一边。
            const sceneAssets = draftEffectiveAssets(state.activeSettings);
            const assetRoot = bridge.sceneAssets || {};
            const cardKey = String(scopeState.assetScopeKey || '');
            const storage = (options.global || globalThis).localStorage;
            const scopeTag = (collection, name) => {
                if (!cardKey) return '';
                const inCard = Boolean(assetOwnerKey(assetRoot, cardKey, [collection], name));
                // 两格切换：亮的那格是现在放的地方，点另一格就迁过去。
                const move = `asset-move:${collection}:${encodeURIComponent(String(name))}`;
                const seg = (here, label, title) => (here
                    ? `<span class="igs-scope-seg is-on" aria-current="true">${label}</span>`
                    : `<button type="button" class="igs-scope-seg" data-action="${move}" title="${title}">${label}</button>`);
                return `<span class="igs-asset-scope-switch" role="group" aria-label="放在本卡还是全局">${seg(inCard, '本卡', '收进本卡：只有这张角色卡用')}${seg(!inCard, '全局', '放到全局：所有角色卡共用')}</span>`
                    + (inCard && assetShadowsGlobal(assetRoot, cardKey, collection, name) ? '<span class="igs-asset-scope-note" title="全局另有一份同名的，这张卡用本卡这份">覆盖全局</span>' : '');
            };
            const legacyPresets = Object.entries(loadLegacyPresets(storage)).filter(([, preset]) => legacyPresetHasContent(preset)).map(([name]) => name);
            const assetScopeBar = `<div class="igs-asset-scope-bar"><span class="igs-asset-scope-name">${cardKey ? `当前角色卡：${esc(scopeState.assetScopeLabel)}` : '没打开角色卡，素材都在全局'}</span>`
                + (scopeState.assetScopeKind === 'card' && cardKey ? '<button type="button" class="igs-settings-action" data-action="asset-card-export">导出这张角色卡</button>' : '')
                + '<button type="button" class="igs-settings-action" data-action="asset-card-import">导入角色卡素材包</button></div>'
                + (legacyPresets.length
                    ? `<details class="igs-asset-legacy"><summary>找回旧版预设（${legacyPresets.length} 个）</summary>`
                        + '<div class="igs-source-filter-note">以前存在本机的素材预设。点一个放进本卡或全局，同名的换成预设里的，其他不动。</div><div class="igs-asset-legacy-list">'
                        + legacyPresets.map((name) => `<button type="button" class="igs-settings-action" data-action="legacy-preset-restore:${encodeURIComponent(name)}">${esc(name)}</button>`).join('')
                        + '</div></details>'
                    : '');
            const disabled = !sceneAssets.enabled;
            const subTab = normalizeSceneSubTab(asyncState.sceneSubTab);
            // 文件夹只是本地界面归类：按当前角色卡存，卡里还没建过就沿用全局的。
            const assetFolders = loadAssetFoldersFor(storage, cardKey);
            const firstUrl = (values) => (values.map((v) => String(v || '').trim()).find(Boolean) || '');
            const generatedService = options.generatedAssets || null;
            const resolveGenerated = (url) => (isGeneratedAssetUrl(url)
                ? (generatedService && typeof generatedService.resolveUrl === 'function' ? generatedService.resolveUrl(url) : '')
                : (url || ''));
            const sceneListOptions = {
                expandedSlots: asyncState.expandedSceneSlots instanceof Set ? asyncState.expandedSceneSlots : new Set(),
                timeGroups: sceneAssets.timeGroups || [],
                weatherGroups: sceneAssets.weatherGroups || [],
                resolveUrl: resolveGenerated,
                folderSelect: (name) => renderAssetFolderSelect('scenes', name, assetFolders.scenes),
                scopeTag,
            };
            const scopeFilters = asyncState.assetScopeFilter && typeof asyncState.assetScopeFilter === 'object' ? asyncState.assetScopeFilter : {};
            const ownedBy = (collection, name) => (assetOwnerKey(assetRoot, cardKey, [collection], name) ? 'card' : 'global');
            const filterOf = (collection) => (cardKey && (scopeFilters[collection] === 'card' || scopeFilters[collection] === 'global') ? scopeFilters[collection] : 'all');
            const scopedEntries = (collection) => {
                const all = sceneAssets[collection] || {};
                const filter = filterOf(collection);
                if (filter === 'all') return all;
                return Object.fromEntries(Object.entries(all).filter(([name]) => ownedBy(collection, name) === filter));
            };
            // 只在打开了角色卡时出现。切到「本卡」可以一键全放到全局，切到「全局」可以一键全收进本卡。
            const scopeFilterBar = (collection) => {
                if (!cardKey) return '';
                const names = Object.keys(sceneAssets[collection] || {});
                const cardCount = names.filter((name) => ownedBy(collection, name) === 'card').length;
                const counts = { all: names.length, card: cardCount, global: names.length - cardCount };
                const filter = filterOf(collection);
                const chip = (id, label) => `<button type="button" class="igs-asset-filter${filter === id ? ' is-active' : ''}" data-action="asset-filter:${collection}:${id}" aria-pressed="${filter === id}">${label}<span class="igs-asset-filter-count">${counts[id]}</span></button>`;
                // 一键迁移常驻在筛选旁：点开选方向，数量为 0 的那项不能点，选了还会再确认一次。
                const bulkItem = (dest, label, count) => `<button type="button" class="igs-add-menu-item" data-action="asset-move-all:${collection}:${dest}" role="menuitem"${count ? '' : ' disabled'}>${label}</button>`;
                const bulk = `<details class="igs-add-menu igs-asset-bulk-menu" data-asset-bulk="${collection}"><summary class="igs-btn-mgr-icon igs-asset-bulk" title="一键迁移" aria-label="一键迁移">${ASSET_MOVE_ALL_SVG}</summary>`
                    + `<div class="igs-add-menu-list" role="menu">${bulkItem('global', `本卡的 ${counts.card} 个全部放到全局`, counts.card)}${bulkItem('card', `全局的 ${counts.global} 个全部收进本卡`, counts.global)}</div></details>`;
                return `<span class="igs-asset-filter-group" role="group" aria-label="按归属筛选" data-asset-filter="${collection}">${chip('all', '全部')}${chip('card', '本卡')}${chip('global', '全局')}</span>${bulk}`;
            };
            const scenesHtml = renderAssetFolderView('scenes', scopedEntries('scenes'), {
                state: assetFolders,
                lead: scopeFilterBar('scenes'),
                renderList: (subset) => renderSceneAssetList(subset, sceneListOptions),
                thumbOf: (name, value) => resolveGenerated(typeof value === 'string' ? value : firstUrl([value && value.url].concat(Object.values((value && value.times) || {}).map((t) => (typeof t === 'string' ? t : t && t.url))))),
            });
            const charListOptions = {
                aliases: sceneAssets.characterAliases || {},
                characterDna: sceneAssets.characterDna || {},
                characterOutfits: sceneAssets.characterOutfits || {},
                outfitTabs: asyncState.outfitTabs || {},
                sceneAssets,
                moodGroups: sceneAssets.moodGroups || [],
                expandedSlots: asyncState.expandedSpriteSlots instanceof Set ? asyncState.expandedSpriteSlots : new Set(),
                statusAvatars: sceneAssets.statusAvatars || {},
                // 角色学院只在魔法世界观下有意义；其他世界观的魔法星夜只当星空框用，不显示这一行。
                magicHouse: reader.dialogSkin === DIALOG_SKIN_MAGIC_ACADEMY && resolveWorldview(worldviewAssets) === 'magic' ? { sceneAssets, fallback: reader.magicHouse } : null,
                resolveUrl: resolveGenerated,
                expressionNotes: normalizeGeneratedLibrary(sceneAssets.generated).expressionNotes,
                folderSelect: (name, opts) => renderAssetFolderSelect('characters', name, assetFolders.characters, opts),
                scopeTag,
                isOpen: (key) => Boolean(asyncState.advancedOpen && asyncState.advancedOpen[key]),
            };
            const charsHtml = renderAssetFolderView('characters', scopedEntries('characters'), {
                state: assetFolders,
                lead: scopeFilterBar('characters'),
                renderList: (subset) => renderCharacterAssetList(subset, charListOptions),
                thumbOf: (name, moods) => resolveGenerated(firstUrl(Object.values(moods || {}).concat([(sceneAssets.statusAvatars || {})[name]]))),
            });
            const generatedArgs = {
                library: normalizeGeneratedLibrary(sceneAssets.generated),
                characters: sceneAssets.characters || {},
                scenes: sceneAssets.scenes || {},
                temp: generatedService && typeof generatedService.listTemp === 'function' ? generatedService.listTemp() : [],
                resolveUrl: resolveGenerated,
                moodGroups: sceneAssets.moodGroups || [],
            };
            // 待确认：AI 写出但没登记的服装词、词库外的情绪词、生成了还没入库的图。
            const resolveOutfit = createOutfitResolver(sceneAssets);
            const outfitReview = dropConfirmedOutfitReview(storage, (character, word) => Boolean(resolveOutfit(character, word)));
            const moodReview = loadMoodReview(storage);
            const waitingCount = outfitReview.length + moodReview.length + countGeneratedWaiting(generatedArgs);
            const reviewPane = `<div class="igs-settings-section igs-review-pane">`
                + renderOutfitReviewList(outfitReview, sceneAssets.characterOutfits || {}, sceneAssets.characters || {})
                + renderMoodReviewList(moodReview)
                + renderGeneratedAssetPane(generatedArgs)
                + `</div>`;
            const scenesPane = `<div class="igs-settings-section">
        <div class="igs-settings-section-head">
          <div class="igs-settings-subhead">背景场景</div>
          <details class="igs-add-menu" data-add-menu="scenes">
            <summary class="igs-btn-mgr-icon" title="新增背景" aria-label="新增背景">+</summary>
            <div class="igs-add-menu-list" role="menu">
              <button class="igs-add-menu-item" data-action="scene-add-bg" type="button" role="menuitem">新增空白场景</button>
              <button class="igs-add-menu-item" data-action="scene-add-default-bg" type="button" role="menuitem">下载默认素材</button>
            </div>
          </details>
        </div>
        ${scenesHtml}
      </div>`;
            const charactersPane = `<div class="igs-settings-section">
        <div class="igs-settings-section-head">
          <div class="igs-settings-subhead">角色立绘</div>
          ${CHARACTER_ADD_MENU}
        </div>
        ${checkbox('bridge.sceneAssets.unifiedSpriteLayout', sceneAssets.unifiedSpriteLayout, '统一角色立绘位置')}
        ${checkbox('bridge.sceneAssets.moodFuzzyMatch', sceneAssets.moodFuzzyMatch, '情绪词模糊匹配')}
        <div class="igs-source-filter-note">词库里没有的相近情绪词也会自动归组（如「嘲弄」归入「嘲讽」）。可能归错，可在「待确认」页核对。</div>
        ${renderDnaCandidateBar(asyncState.dnaCandidate)}
        ${charsHtml}
        ${renderDnaOnlyCharacterList(sceneAssets.characterDna || {}, sceneAssets.characters || {})}
        <div class="igs-settings-row"><button class="igs-settings-action" data-action="reset-mood-groups" type="button">恢复默认词库</button></div>
      </div>`;
            const promptRuleDraft = typeof asyncState.promptRuleDraft === 'string'
                ? asyncState.promptRuleDraft
                : String(sceneAssets.promptRule || '');
            const sceneValues = {
                promptRuleField: `<div class="igs-settings-field"><textarea data-prompt-rule-draft="1" aria-label="AI 格式规则" placeholder="格式规则..."${disabled ? ' disabled' : ''}>${esc(promptRuleDraft)}</textarea></div>`,
                promptRuleStatus: esc(asyncState.promptRuleStatus || ''),
                promptRuleOutfitHint: scenePromptRuleOutfitHint(sceneAssets.promptRule)
                    ? `<div class="igs-source-filter-note" data-result="prompt-rule-outfit">${esc(PROMPT_RULE_OUTFIT_HINT)}</div>` : '',
                promptAdvanced: `<details class="igs-settings-sub igs-settings-advanced" data-advanced="prompt-injection"${asyncState.advancedOpen && asyncState.advancedOpen['prompt-injection'] ? ' open' : ''}><summary>高级：注入位置与按需注入</summary>`
                    + field('bridge.sceneAssets.promptPlacement', '注入位置', selectInput('bridge.sceneAssets.promptPlacement', normalizePromptPlacement(sceneAssets.promptPlacement), [['system', '系统说明区'], ['depth0', '聊天末尾']]),
                        'AI 不按标签输出时改回聊天末尾。')
                    + checkbox('bridge.sceneAssets.promptAdaptive', sceneAssets.promptAdaptive !== false, '按需注入')
                    + '<div class="igs-source-filter-note">只在用得上时附完整说明。</div></details>',
                wardrobeSection: renderWardrobe(scopedEntries('wardrobe'), { resolveUrl: resolveGenerated, scopeTag, focus: asyncState.wardrobeFocus || '', lead: scopeFilterBar('wardrobe') }),
            };
            const sceneSubTabs = SCENE_SUBTAB_DEFS.map(([id, label]) => {
                const count = id === 'review' && waitingCount ? `<span class="igs-scene-subtab-count">${waitingCount}</span>` : '';
                return `<button type="button" class="igs-scene-settings-subtab${subTab === id ? ' is-active' : ''}" data-scene-subtab="${id}" role="tab" aria-selected="${subTab === id ? 'true' : 'false'}">${label}${count}</button>`;
            }).join('');
            const assetPane = (html) => `<div class="igs-settings-grid" data-scene-settings-pane="assets"><div class="igs-source-filter">${html}</div></div>`;
            const sceneSubPane = subTab === 'rules'
                ? renderTemplate(SCENE_RULES_TEMPLATE, sceneValues)
                : assetPane(subTab === 'review' ? reviewPane : (subTab === 'scenes' ? scenesPane : charactersPane));
            return renderTemplate(getSettingsTabTemplate('scene'), {
                sceneToggle: checkbox('bridge.sceneAssets.enabled', sceneAssets.enabled, '启用场景素材模式'),
                sceneHidden: hiddenAttr(disabled),
                assetScopeBar,
                sceneSubTabs,
                sceneSubPane,
            });
        }

        const readerSubTab = normalizeReaderSubTab(asyncState.readerSubTab);
        const sceneEnabled = !!(bridge.sceneAssets && bridge.sceneAssets.enabled);
        const classicDialog = reader.dialogSkin === DIALOG_SKIN_WESTERN_CLASSIC;
        const illustratedDialog = isIllustratedDialogSkin(reader.dialogSkin);
        const gradientVeilDialog = reader.dialogSkin === DIALOG_SKIN_GRADIENT_VEIL;
        const themeDisabled = !sceneEnabled && !classicDialog && !illustratedDialog;
        const themePath = classicDialog ? 'readerSettings.classicVnTheme' : 'readerSettings.vnTheme';
        const vnTheme = reader.vnTheme || {};
        const classicVnTheme = reader.classicVnTheme || CLASSIC_DIALOG_THEME_DEFAULTS;
        // 对话主题已取消预设选择，恒为自定义：自定义项始终可编辑（仅受场景素材开关 themeDisabled 控制）。
        const themeCustom = true;
        const displayTheme = classicDialog ? classicVnTheme : vnTheme;
        const dialogBgEditable = !themeDisabled && !classicDialog;
        const dialogHeightItems = [['null', '自适应'], [.05, '5%'], [.08, '8%'], [.12, '12%'], [.15, '15%'], [.18, '18%'], [.2, '20%'], [.25, '25%'], [.3, '30%'], [.35, '35%'], [.4, '40%']];
        const typewriter = normalizeTypewriterSettings(reader.typewriter);
        const stageShake = normalizeStageShakeSettings(reader.stageShake);
        const chatShow = normalizeChatShowSettings(reader.chatShow);
        const systemRole = normalizeSystemRoleSettings(reader.systemRole);
        const weatherFx = normalizeWeatherFxSettings(reader.weatherFx);
        if (reader.dialogHeight != null && !dialogHeightItems.some(([value]) => String(value) === String(reader.dialogHeight))) {
            dialogHeightItems.splice(1, 0, [reader.dialogHeight, `${reader.dialogHeight}px`]);
        }
        const readerSubTabs = READER_SUBTAB_DEFS.map(([id, label]) => (
            `<button type="button" class="igs-reader-subtab${readerSubTab === id ? ' is-active' : ''}" data-reader-subtab="${id}" role="tab" aria-selected="${readerSubTab === id ? 'true' : 'false'}">${label}</button>`
        )).join('');
        const readerValues = {
            ...sectionResetPlaceholders(),
            fontSizeField: field('readerSettings.fontSize', '字体大小', selectInput('readerSettings.fontSize', reader.fontSize, [12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30].map((n) => [n, `${n}px`]))),
            dialogFontWeightField: field('readerSettings.dialogFontWeight', '对话框字重', selectInput('readerSettings.dialogFontWeight', reader.dialogFontWeight == null ? 'null' : reader.dialogFontWeight, [['null', '跟随当前样式'], [300, '细体'], [400, '常规'], [500, '中等'], [700, '粗体']])),
            dialogSkinField: field('readerSettings.dialogSkin', '对话框风格', selectInput('readerSettings.dialogSkin', reader.dialogSkin, [['default', '默认'], ['western-classic', '西欧古典'], [DIALOG_SKIN_ELEGANT_EUROPEAN, '优雅欧式'], [DIALOG_SKIN_MAGIC_ACADEMY, '魔法星夜'], [DIALOG_SKIN_RETRO_JAPANESE, '复古日式'], [DIALOG_SKIN_QINGLV, '青绿山水'], [DIALOG_SKIN_ADVENTURE_JOURNEY, '冒险旅途'], [DIALOG_SKIN_PLANT_COFFEE, '植物咖啡'], [DIALOG_SKIN_WARM_PICTUREBOOK, '温暖绘本'], [DIALOG_SKIN_DAY_MINIMAL, '日间简约'], [DIALOG_SKIN_BLACK_WHITE_MANGA, '黑白漫画'], [DIALOG_SKIN_CUTE_PINK, '超可爱粉'], [DIALOG_SKIN_GRADIENT_VEIL, '渐变黑幕']])),
            gradientVeilFields: gradientVeilDialog ? '<div class="igs-gradient-veil-settings">' + field('readerSettings.gradientVeil.color', '黑幕颜色', colorInput('readerSettings.gradientVeil.color', reader.gradientVeil.color)) + field('readerSettings.gradientVeil.heightPercent', '渐变高度', selectInput('readerSettings.gradientVeil.heightPercent', reader.gradientVeil.heightPercent, [30, 40, 50, 60, 70].map((n) => [n, `${n}%`]))) + field('readerSettings.gradientVeil.opacity', '最大不透明度', selectInput('readerSettings.gradientVeil.opacity', reader.gradientVeil.opacity, [.4, .55, .7, .85, 1].map((n) => [n, `${Math.round(n * 100)}%`]))) + field('readerSettings.gradientVeil.speakerStyle', '姓名样式', selectInput('readerSettings.gradientVeil.speakerStyle', reader.gradientVeil.speakerStyle, [['default', '默认主题'], ['plain-text', '纯文字']])) + '</div>' : '',
            magicHouseField: reader.dialogSkin === DIALOG_SKIN_MAGIC_ACADEMY ? field('readerSettings.magicHouse', resolveWorldview(bridge.sceneAssets) === 'magic' ? '学院配色' : '配色', selectInput('readerSettings.magicHouse', normalizeMagicHouse(reader.magicHouse), MAGIC_HOUSES.map((house) => [house.id, house.label]))) : '',
            classicDialogWidthPercentField: classicDialog ? field('readerSettings.classicDialogWidthPercent', '电脑端宽度', selectInput('readerSettings.classicDialogWidthPercent', reader.classicDialogWidthPercent, [60, 70, 80, 90, 100].map((n) => [n, `${n}%`]))) : '',
            skinDialogScaleField: classicDialog || illustratedDialog ? field('readerSettings.skinDialogScale', '对话框高度', selectInput('readerSettings.skinDialogScale', reader.skinDialogScale, SKIN_DIALOG_SCALE_OPTIONS.map((n) => [n, n === 1 ? '原尺寸' : `${Math.round(n * 100)}%`]))) : '',
            optionFontSizeField: field('readerSettings.optionFontSize', '选项字体大小', selectInput('readerSettings.optionFontSize', reader.optionFontSize, [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((n) => [n, `${n}px`]))),
            dialogWidthField: field('readerSettings.dialogWidth', '对话框宽度', selectInput('readerSettings.dialogWidth', reader.dialogWidth === null ? 'null' : reader.dialogWidth, [['null', '自动'], [200, '200px'], [280, '280px'], [360, '360px'], [440, '440px'], [520, '520px'], [600, '600px'], [680, '680px'], [760, '760px'], [840, '840px'], [920, '920px'], [1000, '1000px'], [1080, '1080px'], [1160, '1160px'], [1280, '1280px']], classicDialog || illustratedDialog)),
            // 经典/异型对话框的高度只由 skinDialogScale 控制，不再并列一个禁用的像素高度选项。
            dialogHeightField: classicDialog || illustratedDialog ? '' : field('readerSettings.dialogHeight', '对话框高度', selectInput('readerSettings.dialogHeight', reader.dialogHeight === null ? 'null' : reader.dialogHeight, dialogHeightItems)),
            glassOpacityField: field('readerSettings.glassOpacity', '玻璃浓度', selectInput('readerSettings.glassOpacity', reader.glassOpacity, [0, .1, .2, .35, .5, .62, .74, .88, 1].map((n) => [n, `${Math.round(n * 100)}%`]))),
            imageCountField: field('readerSettings.imageCountOverride', '检测图像数量', selectInput('readerSettings.imageCountOverride', reader.imageCountOverride === null ? 'null' : reader.imageCountOverride, [['null', '自动']].concat(Array.from({ length: 20 }, (_, index) => [index + 1, `${index + 1}张`])))),
            inputScaleField: field('readerSettings.inputScale', '输入框高度', selectInput('readerSettings.inputScale', reader.inputScale, [20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((n) => [n, `${n}%`]))),
            toolbarScaleField: field('readerSettings.toolbarScale', '工具栏大小', selectInput('readerSettings.toolbarScale', reader.toolbarScale, [20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((n) => [n, `${n}%`]))),
            toolbarDockField: field('readerSettings.toolbarDock', '工具栏位置', selectInput('readerSettings.toolbarDock', reader.toolbarDock || 'float', [['float', '悬浮'], ['top', '顶部固定']])),
            imgModeField: field('readerSettings.imgMode', '图像显示模式', selectInput('readerSettings.imgMode', reader.imgMode, [['adaptive', '自适应'], ['contain', '完整']])),
            imgBrightnessField: field('readerSettings.imgBrightness', '图片亮度', selectInput('readerSettings.imgBrightness', reader.imgBrightness, [50, 60, 70, 80, 88, 90, 100].map((n) => [n, `${n}%`]))),
            statusLineToggle: checkbox('readerSettings.showStatusLine', reader.showStatusLine, '显示对话框内状态行'),
            backdropFilterToggle: checkbox('readerSettings.glassBackdropFilter', reader.glassBackdropFilter, '启用背景滤镜'),
            advancedDialogSizeOpen: advancedOpen('dialog-size'),
            advancedDialogBackgroundOpen: advancedOpen('dialog-background'),
            typewriterToggle: checkbox('readerSettings.typewriter.enabled', typewriter.enabled, '打字机'),
            playbackSpeed: field('readerSettings.typewriter.speed', '播放速度', segmentedInput('readerSettings.typewriter.speed', typewriter.speed, [['fast', '快'], ['medium', '中'], ['slow', '慢']], '播放速度'), '自动播放与打字机共用'),
            typewriterControls: typewriter.enabled ? `<div class="igs-settings-sub">${[
                `<div class="igs-source-filter-grid">`,
                field('readerSettings.typewriter.mode', '演出方式', segmentedInput('readerSettings.typewriter.mode', typewriter.mode, [['soft', '柔和演出'], ['classic', '经典打字机']], '演出方式')),
                `</div>`,
                typewriter.mode === 'classic' ? `<details class="igs-settings-sub igs-settings-advanced" data-advanced="typewriter-classic"${advancedOpen('typewriter-classic')}><summary>高级：标点停顿与打字音效</summary>` : '',
                typewriter.mode === 'classic' ? checkbox('readerSettings.typewriter.punctuationPause', typewriter.punctuationPause, '标点处停顿') : '',
                typewriter.mode === 'classic' ? checkbox('readerSettings.typewriter.prosody', typewriter.prosody === true, '说话韵律') : '',
                typewriter.mode === 'classic' ? checkbox('readerSettings.typewriter.sound.enabled', typewriter.sound.enabled, '启用打字音效') : '',
                typewriter.mode === 'classic' && typewriter.sound.enabled
                    ? `<div class="igs-settings-sub igs-source-filter-grid">`
                        + field('readerSettings.typewriter.sound.dialoguePreset', '台词音色', selectInput('readerSettings.typewriter.sound.dialoguePreset', typewriter.sound.dialoguePreset, TYPEWRITER_VOICE_LABELS))
                        + field('readerSettings.typewriter.sound.dialogueVolume', '台词音量', rangeInput('readerSettings.typewriter.sound.dialogueVolume', typewriter.sound.dialogueVolume ?? typewriter.sound.volume ?? 0.5, '台词音量'))
                        + field('readerSettings.typewriter.sound.narrationPreset', '旁白音色', selectInput('readerSettings.typewriter.sound.narrationPreset', typewriter.sound.narrationPreset, TYPEWRITER_VOICE_LABELS))
                        + field('readerSettings.typewriter.sound.narrationVolume', '旁白音量', rangeInput('readerSettings.typewriter.sound.narrationVolume', typewriter.sound.narrationVolume ?? typewriter.sound.volume ?? 0.5, '旁白音量'))
                        + field('readerSettings.typewriter.sound.thoughtPreset', '心里话音色', selectInput('readerSettings.typewriter.sound.thoughtPreset', typewriter.sound.thoughtPreset, [['follow', '跟随台词']].concat(TYPEWRITER_VOICE_LABELS)))
                        + `</div>`
                        + checkbox('readerSettings.typewriter.sound.speakerPitch', typewriter.sound.speakerPitch, '按角色区分音高')
                        + `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="typewriter-preview-sound">试听</button>`
                    : '',
                typewriter.mode === 'classic' ? '</details>' : '',
            ].join('')}</div>` : '',
            stageShakeToggle: checkbox('readerSettings.stageShake.enabled', stageShake.enabled, '画面震动'),
            stageShakeSettings: stageShake.enabled ? renderStageShakeSettings(stageShake) : '',
            systemRoleFields: renderSystemRoleSettings(systemRole, {
                fontOptions: DIALOG_FONT_OPTIONS,
                narrationColor: toHex(displayTheme.narrationColor || '#f4f4f6'),
                disabled: themeDisabled,
            }),
            chatShowToggle: checkbox('readerSettings.chatShow.enabled', chatShow.enabled, '线上交流'),
            chatShowSettings: chatShow.enabled ? renderChatShowSettings(chatShow, {
                promptDraft: asyncState.chatPromptDraft,
                promptStatus: asyncState.chatPromptStatus,
            }) : '',
            weatherFxToggle: checkbox('readerSettings.weatherFx.enabled', weatherFx.enabled, '天气'),
            weatherFxSettings: weatherFx.enabled ? renderWeatherFxSettings(weatherFx) : '',
            narrationFilterToggle: checkbox('readerSettings.statusHud.dimSpriteOnNarration', reader.statusHud && reader.statusHud.dimSpriteOnNarration !== false, '旁白时压暗立绘')
                + field('readerSettings.cgHoldPages', '日常 CG 停留', selectInput('readerSettings.cgHoldPages', reader.cgHoldPages || 4, [[2, '2 页'], [3, '3 页'], [4, '4 页'], [6, '6 页'], [8, '8 页']]))
                + '<div class="igs-source-filter-note">非 NSFW 的插图至少停留这么多页，之后有新角色开口、换场景或到下一张图时回到立绘；NSFW 插图保持到下一张。</div>',
            sentencePagingToggle: checkbox('bridge.sentencePaging', Boolean(bridge.sentencePaging), '旁白按句号分页'),
            nsfwSpriteModeField: `<div class="igs-settings-field">${segmentedInput('readerSettings.statusHud.nsfwSpriteMode', normalizeStatusHudSettings(reader.statusHud).nsfwSpriteMode, [['show', '显示立绘'], ['hide', '隐藏立绘'], ['shade', '仅露脸剪影']], 'NSFW 场景立绘')}</div>`
                + '<div class="igs-source-filter-note">仅露脸剪影：头部以下压成剪影。需要先在立绘编辑里标定头部，未标定的立绘整张显示为剪影。</div>',
            nsfwVeilLevelField: field('readerSettings.statusHud.nsfwVeilLevel', '黑幕强度', segmentedInput('readerSettings.statusHud.nsfwVeilLevel', (reader.statusHud && reader.statusHud.nsfwVeilLevel) || 'medium', [['light', '弱'], ['medium', '中'], ['strong', '强']], '黑幕强度')),
            statusHudSection: buildStatusHudSettingsHtml(reader, options),
            optionBubbleToggle: checkbox('bridge.optionBubble.enabled', Boolean(bridge.optionBubble && bridge.optionBubble.enabled), '启用选项气泡'),
            optionBubbleHidden: hiddenAttr(!(bridge.optionBubble && bridge.optionBubble.enabled)),
            optionBubblePositionField: field('bridge.optionBubble.position', '气泡位置', segmentedInput('bridge.optionBubble.position', (bridge.optionBubble && bridge.optionBubble.position) || 'top-left', [['top-left', '左上角'], ['top-center', '正上方居中'], ['top-right', '右上角']], '气泡位置')),
            optionBubbleActionField: field('bridge.optionBubble.clickAction', '点击选项', segmentedInput('bridge.optionBubble.clickAction', (bridge.optionBubble && bridge.optionBubble.clickAction) || 'send', [['send', '自动发送'], ['fill', '填入输入框']], '点击行为')),
            optionBubbleWidthToggle: checkbox('bridge.optionBubble.widthFollowsText', Boolean(bridge.optionBubble && bridge.optionBubble.widthFollowsText), '气泡宽度随文本变化'),
            pinnedButtonsField: renderPinnedButtons(reader.pinnedBtns, reader.hiddenBtns, reader.btnOrder),
            themeNoteHidden: hiddenAttr(!themeDisabled),
            themeHidden: hiddenAttr(themeDisabled),
            dividerHidden: hiddenAttr(themeDisabled || classicDialog),
            nameAlignField: field(`${themePath}.nameAlign`, '对齐', selectInput(`${themePath}.nameAlign`, displayTheme.nameAlign || 'left', [['left', '左对齐'], ['center', '居中'], ['indent', '首行缩进']], themeDisabled || !themeCustom)),
            textAlignField: field(`${themePath}.textAlign`, '对齐', selectInput(`${themePath}.textAlign`, displayTheme.textAlign || 'left', [['left', '左对齐'], ['center', '居中'], ['indent', '首行缩进']], themeDisabled || !themeCustom)),
            narrationAlignField: field(`${themePath}.narrationAlign`, '对齐', selectInput(`${themePath}.narrationAlign`, displayTheme.narrationAlign || 'left', [['left', '左对齐'], ['center', '居中'], ['indent', '首行缩进']], themeDisabled || !themeCustom)),
            thoughtAlignField: field(`${themePath}.thoughtAlign`, '对齐', selectInput(`${themePath}.thoughtAlign`, displayTheme.thoughtAlign || 'left', [['left', '左对齐'], ['center', '居中'], ['indent', '首行缩进']], themeDisabled || !themeCustom)),
            dividerField: field(`${themePath}.dividerSymbol`, '样式', selectInput(`${themePath}.dividerSymbol`, displayTheme.dividerSymbol || 'none', [['gradient', '渐变线'], ['none', '无']], themeDisabled || classicDialog || !themeCustom)),
            nameFontField: field(`${themePath}.nameFont`, '字体', selectInput(`${themePath}.nameFont`, displayTheme.nameFont || 'inherit', DIALOG_FONT_OPTIONS, themeDisabled || !themeCustom)),
            textFontField: field(`${themePath}.textFont`, '字体', selectInput(`${themePath}.textFont`, displayTheme.textFont || 'inherit', DIALOG_FONT_OPTIONS, themeDisabled || !themeCustom)),
            thoughtFontField: field(`${themePath}.thoughtFont`, '字体', selectInput(`${themePath}.thoughtFont`, displayTheme.thoughtFont || 'inherit', DIALOG_FONT_OPTIONS, themeDisabled || !themeCustom)),
            nameColorField: field(`${themePath}.nameColor`, '颜色', colorInput(`${themePath}.nameColor`, toHex(displayTheme.nameColor || '#ffeeb8'), themeDisabled || !themeCustom)),
            textColorField: field(`${themePath}.textColor`, '颜色', colorInput(`${themePath}.textColor`, toHex(displayTheme.textColor || '#f4f4f6'), themeDisabled || !themeCustom)),
            thoughtColorField: field(`${themePath}.thoughtColor`, '颜色', colorInput(`${themePath}.thoughtColor`, toHex(displayTheme.thoughtColor || '#c8c8dc'), themeDisabled || !themeCustom)),
            narrationFontField: field(`${themePath}.narrationFont`, '字体', selectInput(`${themePath}.narrationFont`, displayTheme.narrationFont || 'inherit', DIALOG_FONT_OPTIONS, themeDisabled || !themeCustom)),
            narrationColorField: field(`${themePath}.narrationColor`, '颜色', colorInput(`${themePath}.narrationColor`, toHex(displayTheme.narrationColor || '#f4f4f6'), themeDisabled || !themeCustom)),
            dividerColorField: field(`${themePath}.dividerColor`, '颜色', colorInput(`${themePath}.dividerColor`, toHex(displayTheme.dividerColor || '#ffeeb8'), themeDisabled || classicDialog || !themeCustom)),
            dialogBgField: dialogBgEditable ? field(`${themePath}.dialogBg`, '背景色', colorInput(`${themePath}.dialogBg`, toHex(displayTheme.dialogBg || '#1f2225'), !themeCustom)) : '',
            dialogBgOpacityField: !dialogBgEditable ? '' : field(`${themePath}.bgOpacity`, '背景不透明度', selectInput(`${themePath}.bgOpacity`, displayTheme.bgOpacity == null ? 'null' : displayTheme.bgOpacity, [['null', '跟随玻璃'], [0, '0%'], [.1, '10%'], [.2, '20%'], [.35, '35%'], [.5, '50%'], [.62, '62%'], [.74, '74%'], [.88, '88%'], [1, '100%']], !themeCustom)),
        };
        if (readerSubTab === 'performance') {
            readerValues.performanceSections = renderPerformanceSettings(reader, { worldview: renderWorldviewRow(worldviewAssets), worldviewId: resolveWorldview(worldviewAssets),
                typewriter: readerValues.playbackSpeed + readerValues.typewriterToggle + readerValues.typewriterControls,
                stageShake: [readerValues.stageShakeToggle, readerValues.stageShakeSettings],
                weatherFx: [readerValues.weatherFxToggle, readerValues.weatherFxSettings],
                chatShow: [readerValues.chatShowToggle, readerValues.chatShowSettings],
                narrationFilter: readerValues.narrationFilterToggle,
                sentencePaging: readerValues.sentencePagingToggle,
                nsfw: readerValues.nsfwSpriteModeField + readerValues.nsfwVeilLevelField,
            }, (key) => Boolean(asyncState.advancedOpen && asyncState.advancedOpen[key]));
        }
        return renderTemplate(getSettingsTabTemplate('reader'), {
            readerSubTabs,
            readerSubPane: renderTemplate(getReaderSubTabTemplate(readerSubTab), readerValues),
        });
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
            getItemIconMode: () => normalizeItemImageSettings(resolveBridgeConfigSnapshot({ mode: state.activeReader ? state.activeReader.mode : 'default' }).bridge.itemImages).inventoryIcon,
            resolveItemImage: (name) => (options.itemImages && typeof options.itemImages.imageUrlFor === 'function' ? options.itemImages.imageUrlFor(name) : ''),
            subscribeItemImages: (handler) => (typeof options.onItemImageUpdated === 'function' ? options.onItemImageUpdated(handler) : null),
            getTheme: () => resolveBridgeConfigSnapshot({ mode: state.activeReader ? state.activeReader.mode : 'default' }).bridge.settingsTheme,
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

    function mountSettingsDom(controller) {
        const doc = getRootDocument(options.global);
        if (!doc) return null;
        ensureStyleTag(doc, 'igs-unified-settings-style', getSettingsStyleText());
        const existing = doc.getElementById('igs-unified-settings');
        if (existing) existing.remove();

        const root = doc.createElement('div');
        // 与 #igs-overlay 一致挂到 documentElement：宿主移动端 body 为 position:fixed 时会成为
        // 独立层叠上下文，设置面板挂在 body 内时整体被压在 overlay 之下（z-index 翻不出 body），
        // 且 100vw/100dvh 取到受限的 body 尺寸而非视口。
        (doc.documentElement || doc.body).appendChild(root);
        root.addEventListener('click', async (event) => {
            const tab = event.target.closest('[data-tab]');
            if (tab) {
                controller.switchTab(tab.getAttribute('data-tab'));
                return;
            }
            const imageSubTab = event.target.closest('[data-image-subtab]');
            if (imageSubTab) {
                controller.switchImageSubTab(imageSubTab.getAttribute('data-image-subtab'));
                return;
            }
            const readerSubTab = event.target.closest('[data-reader-subtab]');
            if(readerSubTab) {
                controller.switchReaderSubTab(readerSubTab.getAttribute('data-reader-subtab'));
                return;
            }
            const settingGo = event.target.closest('[data-setting-go]');
            if (settingGo) {
                controller.goToSetting(settingGo.getAttribute('data-setting-go'));
                return;
            }
            const sceneSubTab = event.target.closest('[data-scene-subtab]');
            if (sceneSubTab) {
                controller.switchSceneSubTab(sceneSubTab.getAttribute('data-scene-subtab'));
                return;
            }
            const sw = event.target.closest('[data-switch]');
            if (sw) {
                controller.toggle(sw.getAttribute('data-switch'));
                return;
            }
            const segment = event.target.closest('[data-segment-path]');
            if (segment) {
                controller.setValue(segment.getAttribute('data-segment-path'), segment.getAttribute('data-segment-value'));
                return;
            }
            const action = event.target.closest('[data-action]');
            if (action) {
                const actName = action.getAttribute('data-action');
                if (actName === 'toggle-secret') {
                    const wrap = action.closest('.igs-settings-secret');
                    const input = wrap ? wrap.querySelector('input') : null;
                    if (input) {
                        const show = input.type === 'password';
                        input.type = show ? 'text' : 'password';
                        action.textContent = show ? '隐藏' : '显示';
                        action.setAttribute('aria-pressed', show ? 'true' : 'false');
                    }
                    return;
                }
                if (actName.startsWith('sprite-preview:')) {
                    event.preventDefault();
                    const url = decodeURIComponent(actName.slice('sprite-preview:'.length));
                    showSpritePreviewOverlay(root, url);
                    return;
                }
                // 生图 › CG 库缩略图：按序号回查已读列表，用同一个预览层铺满显示大图。
                if (actName.startsWith('image-cg-view:')) {
                    event.preventDefault();
                    const cgAsync = state.activeSettings && state.activeSettings.asyncState;
                    const cgEntries = cgAsync && Array.isArray(cgAsync.imageCgEntries) ? cgAsync.imageCgEntries : [];
                    const cgEntry = cgEntries[Number(actName.slice('image-cg-view:'.length))];
                    const cgUrl = cgEntry ? String(cgEntry.dataUrl || '').trim() : '';
                    if (cgUrl) showSpritePreviewOverlay(root, cgUrl);
                    return;
                }
                event.preventDefault();
                const busyLabel = settingsBusyLabel(actName);
                if (busyLabel) {
                    if (settingsBusyActions.has(actName)) return;
                    settingsBusyActions.add(actName);
                    const restore = markSettingsButtonBusy(action, busyLabel);
                    try {
                        await controller.invoke(actName);
                    } finally {
                        settingsBusyActions.delete(actName);
                        restore();
                    }
                    return;
                }
                await controller.invoke(actName);
                return;
            }
        });
        root.addEventListener('input', (event) => {
            const target = event.target;
            if (!target || !target.getAttribute) return;
            // 设置搜索只就地刷新结果列表，不写草稿、不整页重绘，保留输入焦点与软键盘。
            if (target.getAttribute('data-settings-search') !== null) {
                const list = root.querySelector('[data-settings-search-results]');
                if (list) list.innerHTML = renderSettingsSearchResults(target.value);
                return;
            }
            if (target.tagName === 'SELECT') return; // change handles dependent fields once
            if (target.getAttribute('data-chat-prompt-draft') !== null) {
                state.activeSettings.asyncState.chatPromptDraft = target.value;
                state.activeSettings.asyncState.chatPromptStatus = '有未保存的修改。';
                const status = root.querySelector('[data-result="chat-prompt"]');
                if (status) status.textContent = state.activeSettings.asyncState.chatPromptStatus;
                return;
            }
            if (target.getAttribute('data-prompt-rule-draft') !== null) {
                state.activeSettings.asyncState.promptRuleDraft = target.value;
                state.activeSettings.asyncState.promptRuleStatus = '有未保存的修改。';
                const status = root.querySelector('[data-result="prompt-rule"]');
                if (status) status.textContent = state.activeSettings.asyncState.promptRuleStatus;
                return;
            }
            if (target.type === 'range' && target.getAttribute('data-path') === 'readerSettings.typewriter.sound.volume') {
                const label = root.querySelector('[data-range-value="readerSettings.typewriter.sound.volume"]');
                if (label) label.textContent = `${Math.round(Number(target.value) * 100)}%`;
                return;
            }
            if (target.type === 'color') return;
            const path = target.getAttribute('data-path');
            if (path) {
                controller.setValue(path, target.value, { liveInput: true });
                return;
            }
            const statusAvatarChar = target.getAttribute('data-status-avatar-char');
            if (statusAvatarChar) {
                rememberAssetScope(state.activeSettings, getSillyTavernContext(options.global || globalThis));
                const assets = draftAssetLibrary(state.activeSettings, { collections: ASSET_CHARACTER_FIELDS, name: statusAvatarChar });
                const avatars = assets.statusAvatars || (assets.statusAvatars = {});
                if (Object.hasOwn(avatars, statusAvatarChar) || !['__proto__', 'constructor', 'prototype'].includes(statusAvatarChar)) {
                    avatars[statusAvatarChar] = target.value;
                    state.activeSettings.snapshot.draft = cloneData(state.activeSettings.draft);
                }
                return;
            }
            const charHouse = target.getAttribute('data-char-house');
            if (charHouse && !['__proto__', 'constructor', 'prototype'].includes(charHouse)) {
                const assets = state.activeSettings.draft.bridge.sceneAssets;
                const houses = assets.characterHouses || (assets.characterHouses = {});
                if (target.value) houses[charHouse] = target.value;
                else delete houses[charHouse];
                state.activeSettings.snapshot.draft = cloneData(state.activeSettings.draft);
                return;
            }
            const wardrobeName = target.getAttribute('data-wardrobe-name');
            if (wardrobeName) {
                if (['__proto__', 'constructor', 'prototype'].includes(wardrobeName)) return;
                rememberAssetScope(state.activeSettings, getSillyTavernContext(options.global || globalThis));
                const assets = draftAssetLibrary(state.activeSettings, { collections: ['wardrobe'], name: wardrobeName });
                const wardrobe = assets.wardrobe && typeof assets.wardrobe === 'object' && !Array.isArray(assets.wardrobe)
                    ? assets.wardrobe : (assets.wardrobe = {});
                const entry = wardrobe[wardrobeName] && typeof wardrobe[wardrobeName] === 'object' && !Array.isArray(wardrobe[wardrobeName])
                    ? wardrobe[wardrobeName] : (wardrobe[wardrobeName] = { prompt: '' });
                entry.prompt = target.value;
                state.activeSettings.snapshot.draft = cloneData(state.activeSettings.draft);
                return;
            }
            const dnaChar = target.getAttribute('data-dna-char');
            const dnaField = target.getAttribute('data-dna-field');
            if (dnaChar && dnaField) {
                // 角色 DNA 输入只更新草稿，关闭设置时统一保存；不重绘，避免丢焦点。
                if (!CHARACTER_DNA_FIELDS.includes(dnaField) || ['__proto__', 'constructor', 'prototype'].includes(dnaChar)) return;
                rememberAssetScope(state.activeSettings, getSillyTavernContext(options.global || globalThis));
                const assets = draftAssetLibrary(state.activeSettings, { collections: ASSET_CHARACTER_FIELDS, name: dnaChar });
                const dnaMap = assets.characterDna && typeof assets.characterDna === 'object' && !Array.isArray(assets.characterDna)
                    ? assets.characterDna : (assets.characterDna = {});
                const entry = Object.hasOwn(dnaMap, dnaChar) && dnaMap[dnaChar] && typeof dnaMap[dnaChar] === 'object' ? dnaMap[dnaChar] : (dnaMap[dnaChar] = {});
                entry[dnaField] = target.value;
                state.activeSettings.snapshot.draft = cloneData(state.activeSettings.draft);
                return;
            }
            const sceneBg = target.getAttribute('data-scene-bg');
            if (sceneBg) {
                controller.invoke('scene-set-bg-url:' + encodeURIComponent(sceneBg) + ':' + target.value);
                return;
            }
            const sceneTimeBg = target.getAttribute('data-scene-time-bg');
            const sceneTime = target.getAttribute('data-scene-time');
            const sceneWeatherBg = target.getAttribute('data-scene-weather-bg');
            const sceneWeather = target.getAttribute('data-scene-weather');
            if (sceneWeatherBg && sceneTime && sceneWeather) {
                controller.invoke('scene-set-weather-url:' + encodeURIComponent(sceneWeatherBg) + ':' + encodeURIComponent(sceneTime) + ':' + encodeURIComponent(sceneWeather) + ':' + target.value);
                return;
            }
            if (sceneTimeBg && sceneTime) {
                controller.invoke('scene-set-time-url:' + encodeURIComponent(sceneTimeBg) + ':' + encodeURIComponent(sceneTime) + ':' + target.value);
                return;
            }
            const outfitNoteChar = target.getAttribute('data-scene-outfit-note-char');
            if (outfitNoteChar) {
                controller.invoke('scene-set-outfit-note:' + [outfitNoteChar, target.getAttribute('data-scene-outfit-note')].map((v) => encodeURIComponent(v || '')).join(':') + ':' + target.value);
                return;
            }
            const outfitAvatarChar = target.getAttribute('data-scene-outfit-avatar-char');
            if (outfitAvatarChar) {
                controller.invoke('scene-set-outfit-avatar-url:' + [outfitAvatarChar, target.getAttribute('data-scene-outfit-avatar')].map((v) => encodeURIComponent(v || '')).join(':') + ':' + target.value);
                return;
            }
            const outfitChar = target.getAttribute('data-scene-outfit-char');
            if (outfitChar) {
                controller.invoke('scene-set-outfit-mood-url:' + [outfitChar, target.getAttribute('data-scene-outfit'), target.getAttribute('data-scene-outfit-mood')].map((v) => encodeURIComponent(v || '')).join(':') + ':' + target.value);
                return;
            }
            const sceneChar = target.getAttribute('data-scene-char');
            const sceneMood = target.getAttribute('data-scene-mood');
            if (sceneChar && sceneMood) {
                controller.invoke('scene-set-mood-url:' + encodeURIComponent(sceneChar) + ':' + encodeURIComponent(sceneMood) + ':' + target.value);
            }
        });
        root.addEventListener('change', (event) => {
            const modelSync = event.target && event.target.getAttribute ? event.target.getAttribute('data-model-sync') : '';
            if (modelSync) {
                controller.setValue(modelSync, event.target.value);
                return;
            }
            // 素材「移到文件夹」只改本地界面归类，不写入设置草稿。
            const folderMoveKind = event.target && event.target.getAttribute ? event.target.getAttribute('data-asset-folder-move') : '';
            if (folderMoveKind) {
                const assetName = event.target.getAttribute('data-asset-name') || '';
                controller.invoke(`asset-folder-move:${folderMoveKind}:${encodeURIComponent(assetName)}:${encodeURIComponent(event.target.value)}`);
                return;
            }
            const reviewChar = event.target && event.target.getAttribute ? event.target.getAttribute('data-outfit-review-char') : '';
            if (reviewChar) {
                if (!event.target.value) return;
                const reviewWord = event.target.getAttribute('data-outfit-review-word') || '';
                controller.invoke(`outfit-review-assign:${[reviewChar, reviewWord, event.target.value].map((value) => encodeURIComponent(value || '')).join(':')}`);
                return;
            }
            const wardrobeChar = event.target && event.target.getAttribute ? event.target.getAttribute('data-outfit-wardrobe-char') : '';
            if (wardrobeChar) {
                const wardrobeOutfit = event.target.getAttribute('data-outfit-wardrobe') || '';
                controller.invoke(`scene-set-outfit-wardrobe-url:${[wardrobeChar, wardrobeOutfit, event.target.value].map((value) => encodeURIComponent(value || '')).join(':')}`);
                return;
            }
            // 一键档位条的「适配世界」下拉：转成 worldview:<id> 动作，未就绪的世界观由动作层拒绝。
            if (event.target && event.target.getAttribute && event.target.getAttribute('data-worldview-select') !== null) {
                controller.invoke('worldview:' + String(event.target.value || ''));
                return;
            }
            const target = event.target;
            const path = event.target && event.target.getAttribute ? event.target.getAttribute('data-path') : '';
            if (event.target && event.target.type === 'range' && !/^readerSettings\.typewriter\.sound\./.test(path || '')) return;
            if (!path) return;
            controller.setValue(path, target.value, { liveInput: target.tagName !== 'SELECT' && target.type !== 'color' });
        });
        // 点下拉菜单（⋯、＋）以外的地方，把开着的菜单收起。
        root.addEventListener('click', (event) => {
            const target = event.target;
            if (!root.querySelectorAll) return;
            for (const menu of root.querySelectorAll('details.igs-add-menu[open]')) {
                if (!(target && typeof menu.contains === 'function' && menu.contains(target))) menu.open = false;
            }
        }, true);
        // toggle 不冒泡，用捕获阶段记住「高级」折叠区的展开状态，避免重渲染后被收起。
        root.addEventListener('toggle', (event) => {
            const target = event.target;
            const key = target && target.getAttribute ? target.getAttribute('data-advanced') : '';
            if (!key || !state.activeSettings || !state.activeSettings.asyncState) return;
            const asyncState = state.activeSettings.asyncState;
            asyncState.advancedOpen = { ...(asyncState.advancedOpen || {}), [key]: target.open === true };
        }, true);
        root.addEventListener('keydown', (event) => {
            if (onboarding.keydown(event, doc)) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                controller.close();
            }
        });

        const domState = {
            root,
            doc,
            overlay: null,
            viewportHandler: null,
            viewportWindow: null,
            viewportRaf: null,
            dispose() {
                detachSettingsViewportEvents(domState);
            },
        };
        return domState;
    }

    function updateMountedReader(snapshot) {
        const current = state.activeReader;
        if (!current) return;
        current.autoPlayer?.setSpeed(snapshot.readerSettings?.typewriter?.speed);
        if (!current.dom || !current.dom.root) return;
        const refs = hydrateReaderMount(current.dom.root, snapshot);
        current.dom.overlay = refs.overlay;
        current.dom.dialog = refs.dialog;
        current.dom.input = refs.input;
        current.dom.sendButton = refs.sendButton;
        current.dom.toast = refs.toast;
        current.dom.clickLayer = refs.clickLayer;
        current.dom.text = refs.text;
        current.dom.progress = refs.progress;
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
        });
        if (current.dom.progress) {
            const progressText = formatReaderProgress(snapshot);
            current.dom.progress.textContent = progressText;
            current.dom.progress.style.display = progressText ? 'block' : 'none';
        }
        syncOptionBubblesAfterRender(current, snapshot);
        syncAssetReviewAfterRender(current, snapshot);
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

    function mutateGeneratedLibrary(mutator) {
        if (state.activeSettings) {
            const bridge = state.activeSettings.draft.bridge = state.activeSettings.draft.bridge || {};
            rememberAssetScope(state.activeSettings, getSillyTavernContext(options.global || globalThis));
            const sceneAssets = draftAssetLibrary(state.activeSettings);
            const result = mutator(sceneAssets.generated);
            if (!result || result.ok === false) return result || { ok: false };
            sceneAssets.generated = result.library;
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
            result = mutator(bucket.generated);
            if (!result || result.ok === false) return null;
            bucket.generated = result.library;
            return { sceneAssets: root };
        });
        if (!result || result.ok === false) return saved.reason === 'missing-save-handler' ? saved : (result || { ok: false });
        return saved && saved.ok !== false ? result : (saved || { ok: false, reason: 'save-failed' });
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
        const cfg = getOptionBubbleConfig();
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



    function updateMountedSettings(snapshot) {
        const current = state.activeSettings;
        if (!current || !current.dom || !current.dom.root) return;
        const container = current.dom.root;
        const prevBody = container.querySelector('.igs-settings-body');
        const scrollTop = prevBody ? prevBody.scrollTop : 0;
        const focus = captureSettingsFocus(container);
        clearChildren(container);
        container.innerHTML = snapshot.html;
        current.dom.overlay = container.querySelector('#igs-unified-settings');
        if (!current.dom.overlay) {
            current.dom.overlay = buildFallbackSettingsOverlay(container.ownerDocument || getRootDocument(options.global), snapshot, {
                version: options.version,
                renderSettingsBody,
            });
            if (current.dom.overlay) container.appendChild(current.dom.overlay);
        }
        if (current.dom.overlay) {
            attachSettingsViewportEvents(current.dom, current.dom.overlay);
        }
        const nextBody = container.querySelector('.igs-settings-body');
        if (nextBody && scrollTop) nextBody.scrollTop = scrollTop;
        restoreSettingsFocus(container, focus);
        remountSettingsNotice(container, current.notice);
        settingsDialogs.remount(container);
        onboarding.mountInSettings(container);
    }

    // 保存失败或动作抛异常时在面板内提示原因；面板重绘时由 updateMountedSettings 补回。
    const settingsBusyActions = new Set();

    function reportSettingsFailure(result) {
        const current = state.activeSettings;
        const message = describeSettingsFailure(result);
        if (!current || !message) return;
        if (result && result.thrown) console.warn('[IGS] 设置操作失败', result.thrown);
        const notice = { message, until: Date.now() + SETTINGS_NOTICE_MS };
        current.notice = notice;
        remountSettingsNotice(current.dom && current.dom.root, notice);
        setTimeout(() => {
            if (state.activeSettings !== current || current.notice !== notice) return;
            current.notice = null;
            remountSettingsNotice(current.dom && current.dom.root, null);
        }, SETTINGS_NOTICE_MS);
    }


    function attachBridgeReaderExtras(readerSettings, bridge) {
        // readerSettings 是每次新克隆的快照，按世界观拨掉冲突演出不会写回存档。
        const sceneAssets = bridge.sceneAssets
            ? sceneAssetsForContext(bridge.sceneAssets, getSillyTavernContext(options.global || globalThis))
            : null;
        const worldview = resolveWorldview(sceneAssets);
        Object.assign(readerSettings, applyFxWorldview(readerSettings, worldview));
        // 演出与聊天层据此换皮：_ancientEra 保留给既有古风分支，_worldview 供西幻 / 科幻 / 末日换皮。
        readerSettings._ancientEra = worldview === 'ancient';
        readerSettings._worldview = worldview;
        readerSettings._sceneAssets = sceneAssets;
        readerSettings._sentencePaging = Boolean(bridge.sentencePaging);
        const bilingualOverride = state.bilingualDisplay;
        readerSettings._bilingualDisplay = bilingualOverride && bilingualOverride.base === normalizeBilingualSettings(readerSettings.bilingual).display ? bilingualOverride.value : '';
        readerSettings._vnTheme = readerSettings.vnTheme || null;
        readerSettings._strictBackgroundMatch = isStrictBackgroundMatch(bridge.autoIllustration);
        readerSettings._cgBackgroundSize = normalizeAutoIllustrationSettings(bridge.autoIllustration).assets.backgroundSize;
        return readerSettings;
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

    function normalizeBridgeConfig(bridge) {
        const normalized = cloneData(bridge || {});
        normalized.openMode = normalizeReaderMode(normalized.openMode, normalized);
        normalized.showToasts = normalizeBoolean(normalized.showToasts, true);
        normalized.settingsTheme = normalizeSettingsTheme(normalized.settingsTheme);
        normalized.debug = normalizeBoolean(normalized.debug, false);
        normalized.sourceFilter = normalizeSourceFilter(normalized.sourceFilter);
        normalized.virtualRegex = normalizeVirtualRegex(normalized.virtualRegex);
        normalized.sentencePaging = normalizeBoolean(normalized.sentencePaging, false);
        normalized.imageApi = normalizeImageApi(normalized.imageApi);
        normalized.sceneAssets = normalizeSceneAssets(normalized.sceneAssets);
        normalized.vnTheme = normalizeVnTheme(normalized.vnTheme);
        normalized.entry = normalizeEntryConfig(normalized.entry);
        normalized.optionBubble = normalizeOptionBubble(normalized.optionBubble);
        normalized.autoIllustration = normalizeAutoIllustrationSettings(normalized.autoIllustration);
        return normalized;
    }

    function normalizeOptionBubble(value) {
        const src = value && typeof value === 'object' ? value : {};
        const position = (src.position === 'top-center' || src.position === 'top-right')
            ? src.position
            : 'top-left';
        return {
            enabled: normalizeBoolean(src.enabled, false),
            position,
            clickAction: src.clickAction === 'fill' ? 'fill' : 'send',
            widthFollowsText: normalizeBoolean(src.widthFollowsText, false),
        };
    }

    function normalizeEntryConfig(value) {
        const src = value && typeof value === 'object' ? value : {};
        return {
            magic: normalizeBoolean(src.magic, true),
        };
    }

    function normalizeImageApi(value) {
        const normalized = {
            ...cloneData(DEFAULT_IMAGE_API),
            ...cloneData(value || {}),
        };
        normalized.availableModels = Array.isArray(normalized.availableModels)
            ? normalized.availableModels.filter(Boolean)
            : [];
        return normalized;
    }

    function normalizeSceneAssets(value) {
        const normalized = cloneData(value || {});
        normalized.enabled = normalizeBoolean(normalized.enabled, false);
        normalized.generated = normalizeGeneratedLibrary(normalized.generated);
        normalized.promptRule = normalizeScenePromptRule(normalized.promptRule);
        normalized.promptPlacement = normalizePromptPlacement(normalized.promptPlacement);
        normalized.promptAdaptive = normalized.promptAdaptive !== false;
        if (!normalized.scenes || typeof normalized.scenes !== 'object' || Array.isArray(normalized.scenes)) {
            normalized.scenes = {};
        }
        // migrate old string-value scenes to object format
        for (const key of Object.keys(normalized.scenes)) {
            const v = normalized.scenes[key];
            if (typeof v === 'string') normalized.scenes[key] = { url: v, times: {} };
            else if (v && typeof v === 'object' && !v.times) normalized.scenes[key].times = {};
            const sceneObj = normalized.scenes[key];
            for (const tKey of Object.keys(sceneObj.times || {})) {
                const tv = sceneObj.times[tKey];
                if (typeof tv === 'string') sceneObj.times[tKey] = { url: tv, weathers: {} };
                else if (tv && typeof tv === 'object' && !tv.weathers) sceneObj.times[tKey].weathers = {};
                const timeObj = sceneObj.times[tKey];
                for (const wKey of Object.keys(timeObj.weathers || {})) {
                    const wv = timeObj.weathers[wKey];
                    if (typeof wv === 'string') timeObj.weathers[wKey] = { url: wv, words: [] };
                }
            }
        }
        if (!normalized.characters || typeof normalized.characters !== 'object' || Array.isArray(normalized.characters)) {
            normalized.characters = {};
        }
        const rawCharacterAliases = normalized.characterAliases && typeof normalized.characterAliases === 'object' && !Array.isArray(normalized.characterAliases)
            ? normalized.characterAliases
            : {};
        normalized.characterAliases = {};
        const claimedCharacterNames = new Set(Object.keys(normalized.characters));
        for (const characterName of Object.keys(normalized.characters)) {
            const aliases = Array.isArray(rawCharacterAliases[characterName]) ? rawCharacterAliases[characterName] : [];
            const nextAliases = [];
            for (const aliasValue of aliases) {
                const alias = String(aliasValue || '').trim();
                if (!alias || claimedCharacterNames.has(alias)) continue;
                claimedCharacterNames.add(alias);
                nextAliases.push(alias);
            }
            normalized.characterAliases[characterName] = nextAliases;
        }
        normalized.characterDna = normalizeCharacterDnaMap(normalized.characterDna);
        normalized.characterOutfits = normalizeCharacterOutfits(normalized.characterOutfits);
        normalized.characterHouses = normalizeCharacterHouses(normalized.characterHouses);
        normalized.wardrobe = normalizeWardrobe(normalized.wardrobe);
        normalized.moodGroups = normalizeMoodGroups(normalized.moodGroups);
        // init group arrays
        if (!Array.isArray(normalized.timeGroups)) normalized.timeGroups = [];
        if (!Array.isArray(normalized.weatherGroups)) normalized.weatherGroups = [];
        // migrate any embedded time/weather words into global groups
        for (const sceneObj of Object.values(normalized.scenes)) {
            for (const [tKey, timeObj] of Object.entries(sceneObj.times || {})) {
                if (!timeObj || typeof timeObj !== 'object') continue;
                if (Array.isArray(timeObj.words) && timeObj.words.length) {
                    let tg = normalized.timeGroups.find((g) => g.label === tKey);
                    if (!tg) { tg = { label: tKey, words: [] }; normalized.timeGroups.push(tg); }
                    for (const w of timeObj.words) if (!tg.words.includes(w)) tg.words.push(w);
                    delete timeObj.words;
                }
                for (const [wKey, wObj] of Object.entries(timeObj.weathers || {})) {
                    if (!wObj || typeof wObj !== 'object') continue;
                    if (Array.isArray(wObj.words) && wObj.words.length) {
                        let wg = normalized.weatherGroups.find((g) => g.label === wKey);
                        if (!wg) { wg = { label: wKey, words: [] }; normalized.weatherGroups.push(wg); }
                        for (const w of wObj.words) if (!wg.words.includes(w)) wg.words.push(w);
                        delete wObj.words;
                    }
                }
            }
        }
        normalized.unifiedSpriteLayout = normalizeBoolean(normalized.unifiedSpriteLayout, false);
        normalized.moodFuzzyMatch = normalizeBoolean(normalized.moodFuzzyMatch, false);
        normalizeAssetCards(normalized);
        return normalized;
    }

    function normalizeVnTheme(value, fallback = VN_THEME_PRESETS.genshin) {
        const normalized = cloneData(value || {});
        // 对话主题已取消预设选择，恒为自定义；用 genshin 作为各字段的初值来源（fallback）。
        normalized.preset = 'custom';
        const normalizeAlign = (value, def) => (value === 'left' || value === 'center' || value === 'indent') ? value : def;
        normalized.nameAlign = normalizeAlign(normalized.nameAlign, fallback.nameAlign);
        normalized.textAlign = normalizeAlign(normalized.textAlign, fallback.textAlign || 'left');
        normalized.narrationAlign = normalizeAlign(normalized.narrationAlign, fallback.narrationAlign || 'left');
        normalized.thoughtAlign = normalizeAlign(normalized.thoughtAlign, fallback.thoughtAlign || 'left');
        // 分割线只保留「渐变线(gradient)」与「无(none)」；旧符号样式一律归到渐变线。
        const dividerSymbol = normalized.dividerSymbol == null ? fallback.dividerSymbol : normalized.dividerSymbol;
        normalized.dividerSymbol = dividerSymbol === 'none' ? 'none' : 'gradient';
        normalized.nameFont = normalized.nameFont || fallback.nameFont;
        normalized.textFont = normalized.textFont || fallback.textFont;
        normalized.thoughtFont = normalized.thoughtFont || fallback.thoughtFont;
        normalized.narrationFont = normalized.narrationFont || fallback.narrationFont;
        normalized.nameColor = normalized.nameColor || fallback.nameColor;
        normalized.textColor = normalized.textColor || fallback.textColor;
        normalized.thoughtColor = normalized.thoughtColor || fallback.thoughtColor;
        normalized.narrationColor = normalized.narrationColor || fallback.narrationColor;
        normalized.dividerColor = normalized.dividerColor || fallback.dividerColor;
        normalized.dialogBg = normalized.dialogBg || fallback.dialogBg;
        normalized.bgOpacity = normalized.bgOpacity == null
            ? null
            : clampNumber(normalizeFiniteNumber(normalized.bgOpacity, 0.62), 0, 1);
        return normalized;
    }

    function normalizeReaderSettings(settings, legacyTheme) {
        const currentVersion = READER_SETTINGS_SCHEMA_VERSION;
        const src = (settings && typeof settings === 'object' && !Array.isArray(settings))
            ? cloneData(settings)
            : {};
        const base = {
            _v: currentVersion,
            dialogSkin: 'default',
            gradientVeil: normalizeGradientVeil(null),
            classicDialogWidthPercent: CLASSIC_DIALOG_WIDTH_PERCENT_DEFAULT,
            skinDialogScale: SKIN_DIALOG_SCALE_DEFAULT,
            magicHouse: MAGIC_HOUSE_DEFAULT,
            fontSize: 18,
            dialogFontWeight: null,
            optionFontSize: 14,
            dialogWidth: null,
            dialogHeight: null,
            glassOpacity: 0.62,
            glassBackdropFilter: false,
            toolbarScale: 100,
            toolbarDock: 'float',
            inputScale: 100,
            imgMode: 'adaptive',
            imgBrightness: 100,
            cgHoldPages: 4,
            showStatusLine: false,
            typewriter: { ...TYPEWRITER_DEFAULTS },
            stageShake: normalizeStageShakeSettings(null),
            chatShow: normalizeChatShowSettings(null),
            systemRole: normalizeSystemRoleSettings(null),
            weatherFx: normalizeWeatherFxSettings(null),
            ...normalizeFxReaderSettings(null),
            imageCountOverride: null,
            pinnedBtns: Array.from(DEFAULT_PINNED_TOOLBAR_BUTTONS),
            hiddenBtns: [],
            btnOrder: TOOLBAR_ACTIONS.map(([id]) => id),
            spriteLayouts: {},
            spriteHeads: {},
            castSlotLayouts: {},
        };
        const normalized = { ...base, ...src, _v: currentVersion };
        delete normalized.emptyBackgroundColor;
        normalized.dialogSkin = normalizeDialogSkin(normalized.dialogSkin);
        normalized.gradientVeil = normalizeGradientVeil(normalized.gradientVeil);
        normalized.classicDialogWidthPercent = normalizeClassicDialogWidthPercent(normalized.classicDialogWidthPercent);
        normalized.skinDialogScale = normalizeSkinDialogScale(normalized.skinDialogScale);
        normalized.magicHouse = normalizeMagicHouse(normalized.magicHouse);
        normalized.fontSize = normalizeFiniteNumber(normalized.fontSize, base.fontSize);
        normalized.dialogFontWeight = normalized.dialogFontWeight != null
            && [300, 400, 500, 700].includes(Number(normalized.dialogFontWeight))
            ? Number(normalized.dialogFontWeight) : null;
        normalized.optionFontSize = clampNumber(normalizeFiniteNumber(normalized.optionFontSize, base.optionFontSize), 10, 30);
        normalized.dialogWidth = normalizeNullableNumber(normalized.dialogWidth);
        const normalizedDialogHeight = normalizeNullableNumber(normalized.dialogHeight);
        if (normalizedDialogHeight == null) {
            normalized.dialogHeight = null;
        } else if (normalizedDialogHeight >= 0 && normalizedDialogHeight <= 1) {
            normalized.dialogHeight = clampNumber(normalizedDialogHeight, 0.05, 0.4);
        } else {
            // 兼容历史 px 设置；用户改选新档位后即保存为 iframe 高度比例。
            normalized.dialogHeight = clampNumber(normalizedDialogHeight, 60, 600);
        }
        normalized.glassOpacity = normalizeOpacity(normalized.glassOpacity, base.glassOpacity);
        normalized.glassBackdropFilter = normalizeBoolean(normalized.glassBackdropFilter, base.glassBackdropFilter);
        normalized.toolbarScale = normalizeFiniteNumber(normalized.toolbarScale, base.toolbarScale);
        normalized.toolbarDock = normalized.toolbarDock === 'top' ? 'top' : 'float';
        normalized.inputScale = normalizeFiniteNumber(normalized.inputScale, base.inputScale);
        normalized.imgMode = normalized.imgMode === 'contain' ? 'contain' : 'adaptive';
        normalized.imgBrightness = clampNumber(normalizeFiniteNumber(normalized.imgBrightness, base.imgBrightness), 10, 100);
        normalized.showStatusLine = normalizeBoolean(normalized.showStatusLine, false);
        normalized.typewriter = normalizeTypewriterSettings(normalized.typewriter);
        normalized.stageShake = normalizeStageShakeSettings(normalized.stageShake);
        normalized.chatShow = normalizeChatShowSettings(normalized.chatShow);
        normalized.systemRole = normalizeSystemRoleSettings(normalized.systemRole);
        normalized.weatherFx = normalizeWeatherFxSettings(normalized.weatherFx);
        normalized.performance = normalizePerformanceSettings(normalized.performance);
        for (const [key, normalize] of Object.entries(FX_SETTINGS_NORMALIZERS)) normalized[key] = normalize(normalized[key]);
        normalized.statusHud = normalizeStatusHudSettings(normalized.statusHud);
        normalized.imageCountOverride = normalizeNullableNumber(normalized.imageCountOverride);
        normalized.pinnedBtns = normalizePinnedButtons(normalized.pinnedBtns);
        normalized.hiddenBtns = normalizeHiddenButtons(normalized.hiddenBtns);
        normalized.btnOrder = normalizeBtnOrder(normalized.btnOrder);
        normalized.spriteLayouts = normalizeSpriteLayouts(normalized.spriteLayouts);
        normalized.spriteHeads = normalizeSpriteHeads(normalized.spriteHeads);
        normalized.castSlotLayouts = normalizeSpriteLayouts(normalized.castSlotLayouts);
        // 对话主题（vnTheme）按模式存进 readerSettings。独立于 _v 门控处理，避免 schema 版本
        // 不符时被清空。settings.vnTheme 缺失时回退到旧的全局 bridge.vnTheme（legacyTheme），
        // 实现从全局存储到按模式存储的平滑迁移。旧的全局 dialogFont 只在读取时迁移为
        // 分类台词字体，避免继续以全局覆盖项压过 textFont。
        const legacyDialogFont = DIALOG_FONT_OPTIONS.some(([font]) => font === src.dialogFont) && src.dialogFont !== 'inherit'
            ? src.dialogFont : '';
        const rawTheme = (src.vnTheme && typeof src.vnTheme === 'object')
            ? src.vnTheme
            : (legacyTheme && typeof legacyTheme === 'object' ? legacyTheme : null);
        const rawClassicTheme = src.classicVnTheme && typeof src.classicVnTheme === 'object'
            ? src.classicVnTheme : null;
        const migratedTheme = legacyDialogFont ? { ...(rawTheme || {}), textFont: legacyDialogFont } : rawTheme;
        const migratedClassicTheme = legacyDialogFont ? { ...(rawClassicTheme || {}), textFont: legacyDialogFont } : rawClassicTheme;
        normalized.vnTheme = normalizeVnTheme(migratedTheme || {});
        normalized.classicVnTheme = normalizeVnTheme(migratedClassicTheme || {}, CLASSIC_DIALOG_THEME_DEFAULTS);
        delete normalized.dialogFont;
        return normalized;
    }

    function buildRegexPreview(bridge) {
        const filter = normalizeSourceFilter(bridge.sourceFilter);
        const virtualRegex = normalizeVirtualRegex(bridge.virtualRegex);
        const previewMessage = resolvePreviewMessage();
        const payload = buildIgsTextPayload(previewMessage, {
            sourceFilter: filter,
            virtualRegex,
        });
        if (!payload.formattedText) {
            return '当前没有可测试的正文内容。';
        }
        if (!virtualRegex.enabled || !virtualRegex.pattern) {
            return `formattedTextLength=${payload.formattedText.length}\n\n最终正文：\n${payload.formattedText}`;
        }
        return [
            `source=${payload.sourceKind}`,
            `tagTextLength=${String(payload.tagText || '').trim().length}`,
            `formattedTextLength=${payload.formattedText.length}`,
            `changed=${payload.virtualRegexChanged === true}`,
            payload.usedFallback ? 'fallback=true' : 'fallback=false',
            '',
            '最终正文：',
            payload.formattedText,
        ].join('\n');
    }

    function resolvePreviewMessage() {
        if (state.activeReader && state.activeReader.payload && state.activeReader.payload.message) {
            return state.activeReader.payload.message;
        }
        if (typeof options.getCurrentMessage === 'function') {
            const message = options.getCurrentMessage();
            if (message && typeof message === 'object' && typeof message.then !== 'function') {
                return message;
            }
        }
        return '';
    }

    function writeToast(message, durationMs) {
        const current = state.activeReader;
        if (!current) return;
        const bridge = resolveBridgeConfigSnapshot({ mode: current.mode }).bridge;
        applyToastToReader(current, bridge.showToasts !== false, message, normalizeSettingsTheme(bridge.settingsTheme), durationMs);
    }

    function writeGenerating() {
        const current = state.activeReader;
        if (!current) return;
        const bridge = resolveBridgeConfigSnapshot({ mode: current.mode }).bridge;
        applyToastToReader(current, true, '生图中', normalizeSettingsTheme(bridge.settingsTheme), 0, { sticky: true });
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

function showSpritePreviewOverlay(root, url) {
    if (!root || !url) return;
    // 挂到设置面板的全屏容器 #igs-unified-settings（position:fixed + 视口变量，已知正常全屏），
    // 而非 doc.body —— 移动端宿主把 body 设为 position:fixed 且高度坍缩，挂 body 会被裁成顶部一条。
    const host = (root.id === 'igs-unified-settings' ? root : root.querySelector && root.querySelector('#igs-unified-settings'))
        || root;
    const doc = root.ownerDocument || root;
    const existing = host.querySelector ? host.querySelector('#igs-sprite-preview-overlay') : null;
    if (existing) existing.remove();
    const overlay = doc.createElement('div');
    overlay.id = 'igs-sprite-preview-overlay';
    overlay.className = 'igs-sprite-preview-overlay';
    const img = doc.createElement('img');
    img.className = 'igs-sprite-preview-img';
    img.src = url;
    overlay.appendChild(img);
    overlay.addEventListener('click', () => overlay.remove());
    host.appendChild(overlay);
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

function resolveIllustrationMarkerImageUrl(imageState, slot) {
    const numericSlot = Number(slot);
    if (!Number.isInteger(numericSlot) || numericSlot < 1) return '';
    const targetIndex = numericSlot - 1;
    const sources = [
        imageState && imageState.slots,
        imageState && imageState.images,
        imageState && imageState.unboundImages,
    ];
    for (const source of sources) {
        if (!Array.isArray(source)) continue;
        const exact = source.find((image) => Number(image && image.slotIndex) === targetIndex);
        const indexed = source[targetIndex];
        for (const image of [exact, indexed]) {
            const url = String(image && image.url || '').trim();
            if (url) return url;
        }
    }
    return '';
}

function stripSegmentSpeaker(text) {
    return String(text || '').trim().replace(/^\*+|\*+$/g, '').replace(/^\s*\[[^\]\n]*\][：:]\s*/, '');
}
