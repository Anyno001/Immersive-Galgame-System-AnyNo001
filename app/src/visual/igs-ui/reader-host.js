import {
    buildIgsTextPayload,
    getMessagePrimaryText,
    getVisibleMessageTextFromElement,
    normalizeSourceFilter,
    normalizeVirtualRegex,
} from '../../scene/message-source.js';
import { resolveSceneStateAtIndex, lookupSceneAssetUrls } from '../../scene/scene-directives.js';
import { normalizeMoodGroups } from '../../scene/mood-groups.js';
import {
    getOriginalReaderHtml,
    getOriginalReaderSource,
    getOriginalReaderStyleText,
    ORIGINAL_READER_REQUIRED_SELECTORS,
    ORIGINAL_READER_STYLE_CONTRACT,
} from './original-reader-source.js';
import { getSettingsShellTemplate } from './settings-shell.js';
import { getSettingsStyleText } from './settings-style.js';
import { getSettingsTabTemplate, SETTINGS_TAB_DEFS } from './settings-tabs.js';
import { getReaderModeIcon } from './icons.js';
import {
    DEFAULT_IMAGE_API,
    DEFAULT_PINNED_TOOLBAR_BUTTONS,
    DEFAULT_SCENE_PROMPT_RULE,
    READER_SETTINGS_SCHEMA_VERSION,
    SETTINGS_PANEL_REQUIRED_SELECTORS,
    SETTINGS_PANEL_TAB_CONTRACT,
    TOOLBAR_ACTIONS,
    VN_THEME_PRESETS,
} from './reader-host-constants.js';
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
    renderPinnedButtons,
    renderSceneAssetList,
    renderScenePresetBar,
    renderTemplate,
    secretInput,
    segmentedInput,
    selectInput,
    textInput,
    textareaInput,
    numberInput,
    disabledAttr,
    modelPicker,
} from './settings-fields.js';
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
    normalizePinnedButtons,
    normalizeReaderMode,
    normalizeSettingsTab,
    normalizeSettingsValue,
    normalizeSpriteLayouts,
    setPath,
} from './settings-normalize.js';
import { clearReaderModeRuntime, exitDocumentFullscreen } from './reader-runtime.js';
import { enterSpriteEditMode } from './sprite-edit.js';
import { createDbPanelController } from '../../shujuku-panel/panel-controller.js';
import { createShujukuClient } from '../../data/shujuku/client.js';
import { readOptionItems } from '../../choices/option-table.js';
import { handleSettingsAction as runSettingsAction } from './settings-actions.js';
import { loadScenePresets } from '../../scene/scene-preset-store.js';
import { LEGACY_READER_MODES } from '../../storage/legacy-igs.js';
import {
    applyReaderSnapshotToDom,
    applyToolbarState,
    buildFallbackReaderOverlay,
    buildFallbackSettingsOverlay,
    normalizeReaderStableLayers,
} from './reader-dom-render.js';

export function createIgsReaderHost(options = {}) {
    const state = {
        activeReader: null,
        activeSettings: null,
    };

    const host = {
        openReader,
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
        readerSettings._sceneAssets = unified.bridge.sceneAssets || null;
        readerSettings._sentencePaging = Boolean(unified.bridge.sentencePaging);
        readerSettings._vnTheme = readerSettings.vnTheme || null;
        const snapshot = buildReaderSnapshot(
            payload,
            nextMode,
            readerSettings,
            payload.startAtEnd === true ? Number.MAX_SAFE_INTEGER : 0,
        );
        const controller = createReaderController();
        const domState = mountReaderDom(snapshot, controller);

        state.activeReader = {
            payload: cloneReaderPayload(payload),
            mode: nextMode,
            index: snapshot.content.currentIndex,
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
        };
        updateMountedReader(snapshot);
        startReaderImagePolling(state.activeReader);

        return {
            ok: true,
            mode: nextMode,
            readerMode: nextMode,
            snapshot: cloneData(snapshot),
            domMounted: Boolean(domState),
            controller,
        };
    }

    function openSettings(openOptions = {}) {
        const normalizedTab = normalizeSettingsTab(openOptions.tab);
        const fallbackMode = state.activeReader ? state.activeReader.mode : undefined;
        if (state.activeSettings) {
            state.activeSettings.tab = normalizedTab;
            return rerenderSettings();
        }

        const initialSnapshot = resolveBridgeConfigSnapshot({ mode: 'default' });
        const controller = createSettingsController();
        const settingsState = {
            tab: normalizedTab,
            draft: cloneData(initialSnapshot),
            asyncState: {},
            controller,
            dom: null,
        };
        state.activeSettings = settingsState;
        settingsState.dom = mountSettingsDom(controller);
        return rerenderSettings();
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

    function closeReader(closeOptions = {}) {
        const current = state.activeReader;
        if (!current) return { ok: true, reason: 'reader-not-open' };
        closeSettings();
        clearReaderToast(current);
        clearReaderModeRuntime(current);
        if (closeOptions.keepFullscreen !== true) {
            exitDocumentFullscreen(getRootDocument(options.global));
        }
        current.imagePollToken += 1;
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
        if (current.dom && typeof current.dom.dispose === 'function') {
            current.dom.dispose();
        }
        unmountNode(current.dom && current.dom.root);
        state.activeSettings = null;
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
        closeSettings();
        closeReader();
        return { ok: true };
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
            switchSceneSubTab(subTab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                state.activeSettings.asyncState.sceneSubTab = subTab === 'characters' ? 'characters' : 'scenes';
                return rerenderSettings();
            },
            setValue(path, value) {
                return updateSettingsValue(path, value);
            },
            toggle(path) {
                const current = getPath(state.activeSettings && state.activeSettings.draft, path);
                return updateSettingsValue(path, !current);
            },
            async invoke(action) {
                return handleSettingsAction(action);
            },
            close() {
                return closeSettings();
            },
        };
    }

    async function submitReaderInput(text) {
        if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        const nextText = String(firstDefined(text, state.activeReader.inputValue, '') || '');
        const send = typeof options.typeAndSend === 'function'
            ? options.typeAndSend
            : async () => ({ ok: false, reason: 'missing-send-handler' });
        const result = await send(nextText);
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
        const bridge = resolveBridgeConfigSnapshot({ mode }).bridge;
        const ob = bridge.optionBubble && typeof bridge.optionBubble === 'object' ? bridge.optionBubble : {};
        const position = (ob.position === 'top-center' || ob.position === 'top-right') ? ob.position : 'top-left';
        return {
            enabled: ob.enabled === true,
            position,
            clickAction: ob.clickAction === 'fill' ? 'fill' : 'send',
            widthFollowsText: ob.widthFollowsText === true,
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

    function hideOptionBubbles(container) {
        if (!container) return;
        container.setAttribute('hidden', '');
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
        clearChildren(container);
        for (const item of items) {
            const display = (item && typeof item === 'object') ? String(item.display || '') : String(item || '');
            const send = (item && typeof item === 'object') ? String(item.send || item.display || '') : String(item || '');
            const bubble = doc.createElement('button');
            bubble.type = 'button';
            bubble.className = 'igs-option-bubble igs-bubble';
            bubble.textContent = display;
            bubble.addEventListener('click', (event) => {
                if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                onOptionBubbleClick(container, send, cfg);
            });
            container.appendChild(bubble);
        }
        container.removeAttribute('hidden');
    }

    async function onOptionBubbleClick(container, text, cfg) {
        hideOptionBubbles(container);
        if (cfg.clickAction === 'fill') {
            if (state.activeReader) {
                state.activeReader.inputValue = text;
                const input = state.activeReader.dom && state.activeReader.dom.input;
                if (input) { input.value = text; if (typeof input.focus === 'function') input.focus(); }
            }
            return;
        }
        await submitReaderInput(text);
    }

    function writeToastSafe(message) {
        try { if (state.activeReader) writeToast(message); } catch (error) { /* ignore */ }
    }

    function updateSettingsValue(path, value) {
        if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
        const draft = state.activeSettings.draft;

        if (path === 'bridge.openMode') {
            const nextMode = normalizeReaderMode(value, draft.bridge);
            setPath(draft, path, nextMode);
            const persisted = persistSettingsDraft({ syncActiveModeFromSettings: true });
            if (persisted.ok === false) return persisted;
            return rerenderSettings();
        }

        setPath(draft, path, normalizeSettingsValue(path, value));
        if (path === 'readerSettings.vnTheme.preset' && value === 'custom') {
            const prevName = (draft.readerSettings.vnTheme && draft.readerSettings.vnTheme._prevPreset) || 'genshin';
            const source = VN_THEME_PRESETS[prevName] || VN_THEME_PRESETS.genshin;
            const fields = ['nameAlign', 'textAlign', 'narrationAlign', 'thoughtAlign', 'dividerSymbol', 'nameFont', 'textFont', 'thoughtFont', 'narrationFont', 'nameColor', 'textColor', 'thoughtColor', 'narrationColor', 'dividerColor'];
            for (const f of fields) {
                setPath(draft, `readerSettings.vnTheme.${f}`, source[f]);
            }
        }
        if (path === 'readerSettings.vnTheme.preset' && value !== 'custom') {
            setPath(draft, 'readerSettings.vnTheme._prevPreset', value);
        }
        if (path.startsWith('readerSettings.vnTheme.') && path !== 'readerSettings.vnTheme.preset' && path !== 'readerSettings.vnTheme._prevPreset') {
            setPath(draft, 'readerSettings.vnTheme.preset', 'custom');
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    function persistSettingsDraft(optionsForPersist = {}) {
        if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
        const draft = state.activeSettings.draft;
        const save = typeof options.saveUnifiedSettings === 'function'
            ? options.saveUnifiedSettings
            : null;
        if (!save) return { ok: false, reason: 'missing-save-handler' };

        const result = save({
            bridge: draft.bridge,
            readerMode: 'default',
            readerSettings: draft.readerSettings,
        });
        if (!result || result.ok === false) {
            return result || { ok: false, reason: 'save-failed' };
        }

        const snapshot = resolveBridgeConfigSnapshot({ mode: 'default' });
        state.activeSettings.draft = cloneData(snapshot);
        rerenderActiveReader({
            syncModeFromSettings: optionsForPersist.syncActiveModeFromSettings === true,
        });
        return result;
    }

    async function handleSettingsAction(action) {
        return runSettingsAction(action, {
            state,
            options,
            closeSettings,
            persistSettingsDraft,
            rerenderSettings,
            buildRegexPreview,
        });
    }

    async function handleReaderAction(action) {
        if (!state.activeReader) return { ok: false, reason: 'reader-not-open' };
        const normalizedAction = String(action || '').trim();
        state.activeReader.lastAction = normalizedAction;

        if (normalizedAction === 'settings') {
            return state.activeReader.controller.openSettings('basic');
        }
        if (normalizedAction === 'hide') {
            return state.activeReader.controller.toggleHidden();
        }
        if (normalizedAction === 'close') {
            return state.activeReader.controller.close();
        }
        if (normalizedAction === 'toggle-bar') {
            return state.activeReader.controller.toggleToolbar();
        }
        if (normalizedAction === 'prev') {
            return moveReaderSegment(-1);
        }
        if (normalizedAction === 'next') {
            return moveReaderSegment(1);
        }
        if (normalizedAction === 'first-page') {
            return jumpReaderSegment(0);
        }
        if (normalizedAction === 'last-page') {
            return jumpReaderSegment(Number.MAX_SAFE_INTEGER);
        }
        if (normalizedAction === 'regen') {
            return regenerateCurrentImage();
        }
        if (normalizedAction === 'rescan') {
            return rescanCurrentImages();
        }
        if (normalizedAction === 'save') {
            return saveCurrentImage();
        }
        if (['prev-turn', 'next-turn'].includes(normalizedAction)) {
            return moveReaderTurn(normalizedAction === 'prev-turn' ? -1 : 1);
        }
        if (normalizedAction === 'sprite-edit') {
            const overlay = state.activeReader.dom && state.activeReader.dom.overlay;
            if (overlay) enterSpriteEditMode(overlay, state.activeReader, buildSpriteEditContext());
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
        rerenderActiveReader();
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
        state.activeReader.mode = nextMode;
        const readerSettings = normalizeReaderSettings(unified.readerSettings, unified.bridge.vnTheme);
        readerSettings._sceneAssets = unified.bridge.sceneAssets || null;
        readerSettings._sentencePaging = Boolean(unified.bridge.sentencePaging);
        readerSettings._vnTheme = readerSettings.vnTheme || null;
        state.activeReader.snapshot = buildReaderSnapshot(state.activeReader.payload, nextMode, readerSettings, state.activeReader.index);
        updateMountedReader(state.activeReader.snapshot);
        return { ok: true };
    }

    async function moveReaderTurn(delta) {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
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

    async function regenerateCurrentImage() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
        if (typeof options.regenerateImage !== 'function') {
            writeToast('当前未接入图片重画能力。');
            return { ok: false, reason: 'provider-not-enabled' };
        }

        const result = await options.regenerateImage(buildImageActionContext(
            current,
            resolveBridgeConfigSnapshot({ mode: current.mode }),
        ));
        if (result && result.imageState && state.activeReader) {
            state.activeReader.payload.imageState = cloneData(result.imageState);
            rerenderActiveReader();
        }
        writeToast(resolveReaderActionToast(result, {
            success: '背景图已更新。',
            fallback: '当前未检测到新的背景图。',
        }));
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
        return getVisibleMessageTextFromElement(element);
    }

    async function rescanCurrentImages() {
        const current = state.activeReader;
        if (!current) return { ok: false, reason: 'reader-not-open' };
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
            if (nextSignature !== previousSignature || nextBoundCount > previousBoundCount || currentUrl) {
                current.payload.imageState = cloneData(result);
                rerenderActiveReader();
                previousSignature = nextSignature;
                previousBoundCount = nextBoundCount;
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

    function buildReaderSnapshot(payload, mode, readerSettings, index = 0) {
        const scene = cloneData(payload.scene || (payload.render && payload.render.scene) || {});
        const render = payload.render || {};
        const stage = render.stage || {};
        const liveMessage = (payload.message && payload.message.raw) || payload.message || payload.raw || '';
        const extracted = buildIgsTextPayload(liveMessage, {
            sourceFilter: payload.sourceFilter,
            virtualRegex: payload.virtualRegex,
            visibleText: payload.visibleText,
            sceneAssets: readerSettings._sceneAssets,
            sentencePaging: readerSettings._sentencePaging,
        });
        const text = firstRenderableText(
            scene.text,
            scene.formattedText,
            payload.formattedText,
            extracted.formattedText,
            extracted.visibleText,
            extracted.cleanedRaw,
            getMessagePrimaryText(liveMessage),
            payload.raw,
        );
        const segments = Array.isArray(payload.textSegments) && payload.textSegments.length
            ? cloneData(payload.textSegments)
            : buildTextSegments(stripSceneDirectiveLines(text));
        const normalizedIndex = Math.max(0, Math.min(segments.length - 1, Number(index) || 0));
        const imageState = normalizeSnapshotImageState(
            payload.imageState,
            resolveSegmentImageIndex(payload, normalizedIndex),
        );
        const displayImageState = applyImageCountOverride(imageState, readerSettings.imageCountOverride);
        const currentText = segments[normalizedIndex] || text;
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
        const sceneDirectives = Array.isArray(extracted.sceneDirectives) ? extracted.sceneDirectives
            : Array.isArray(payload.sceneDirectives) ? payload.sceneDirectives : [];
        let finalBackgroundImage = backgroundImage;
        let spriteImage = null;
        let resolvedSpeaker = scene.speaker || '';
        let spriteCharacter = '';
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
        let sceneStateForBg = null;
        if (slotBoundUrl) {
            finalBackgroundImage = slotBoundUrl;
            spriteImage = null;
        } else if (sceneAssets && sceneAssets.enabled) {
            if (sceneDirectives.length) {
                sceneStateForBg = resolveSceneStateAtIndex(sceneDirectives, normalizedIndex);
                const bgUrls = lookupSceneAssetUrls(sceneStateForBg, sceneAssets);
                finalBackgroundImage = bgUrls.backgroundUrl || '';
            } else {
                finalBackgroundImage = '';
            }
            spriteImage = null;
        }
        // Per-segment classification from the formatted segment text itself.
        // Order matters: thought (*...*) is checked before dialogue ([名字]：) because
        // a thought segment looks like *[名字]：...* and would otherwise match dialogue.
        // Fallback: when the prefix was stripped (single-segment messages), use the
        // directive that lands on this exact segment index.
        let textType = 'narration';
        let bubbleSpeaker = '';
        let segmentBody = currentText;
        let bubbleMood = '';
        let spriteMood = '';
        if (sceneAssetsEnabled) {
            const charThoughtDirectives = sceneDirectives.filter((d) => d.type === 'char' || d.type === 'thought');
            // Match this bubble back to its directive by speaker + dialogue/thought text
            // fingerprint, not by row ordinal. Reformatting (image blocks, italic narration,
            // merged/stripped lines) desyncs any positional counter, so we look the source
            // text up directly. normalizeFingerprint strips the translation tail *（…）*,
            // brackets and whitespace so a substring compare is stable.
            const normalizeFingerprint = (s) => String(s || '')
                .replace(/\*（[^）]*）\*/g, '')
                .replace(/[\[\]\*（）]/g, '')
                .replace(/\s+/g, '')
                .trim();
            const findDirectiveByText = (speaker, body) => {
                const bodyKey = normalizeFingerprint(body);
                if (!bodyKey) return null;
                const probe = bodyKey.slice(0, 12);
                const pool = charThoughtDirectives.filter((d) => !speaker || d.character === speaker);
                for (const d of pool) {
                    const src = normalizeFingerprint(d.type === 'thought' ? d.thought : d.dialogue);
                    if (src && (src.includes(probe) || probe.includes(src.slice(0, 12)))) return d;
                }
                return null;
            };
            // Classify a single segment into {textType, speaker, mood} purely from its
            // own formatted text via fingerprint matching (no positional counter).
            // Returns null when the segment is plain narration with no char/thought tag.
            const classifySegment = (segText) => {
                const seg = String(segText || '');
                const tMatch = seg.match(/^\s*\*\s*(?:\[([^\]]+)\]\s*[:：]\s*)?([\s\S]*?)\s*\*\s*$/);
                const dMatch = seg.match(/^\s*\[([^\]]+)\]\s*[:：]\s*([\s\S]*)$/);
                if (tMatch) {
                    let sp = tMatch[1] ? tMatch[1].trim() : '';
                    const matched = findDirectiveByText(sp, tMatch[2]);
                    if (matched && !sp) sp = matched.character || '';
                    return { textType: 'thought', speaker: sp, mood: matched ? (matched.mood || '') : '', body: seg };
                }
                if (dMatch) {
                    const sp = dMatch[1].trim();
                    const matched = findDirectiveByText(sp, dMatch[2]);
                    return { textType: 'dialogue', speaker: sp, mood: matched ? (matched.mood || '') : '', body: dMatch[2] };
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
            // Single-segment fallback: parseSpeakerPrefix strips the "[名字]：" prefix off
            // a lone segment, so the bubble regex no longer matches. Recover speaker/mood
            // from the directive that lands on this segment index.
            if (textType === 'narration' && scene.speaker) {
                const segDirective = sceneDirectives.find((d) => Number(d.segmentIndex) === normalizedIndex
                    && (d.type === 'char' || d.type === 'thought'));
                if (segDirective) {
                    textType = segDirective.type === 'thought' ? 'thought' : 'dialogue';
                    bubbleSpeaker = segDirective.character || scene.speaker;
                    bubbleMood = segDirective.mood || '';
                }
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
            if (!spriteChar && sceneStateForBg && sceneStateForBg.character) {
                // Fallback for untransformed/legacy paths where the bubble text still
                // carries the raw tag (no reformatted "[名字]：" line to parse).
                spriteChar = sceneStateForBg.character;
                spriteMood = sceneStateForBg.mood || '';
            }
            if (!slotBoundUrl && sceneAssets && sceneAssets.enabled && spriteChar
                && sceneAssets.characters && sceneAssets.characters[spriteChar]) {
                const spriteUrls = lookupSceneAssetUrls({ character: spriteChar, mood: spriteMood }, sceneAssets);
                spriteImage = spriteUrls.spriteUrl || null;
                if (spriteImage) {
                    spriteCharacter = spriteChar;
                    // Position keys follow the resolved image slot (exact mood / group /
                    // 默认), not the raw mood word, so every mood that maps to the same
                    // sprite image shares one position across pages.
                    spriteMood = spriteUrls.spriteSlot || spriteMood;
                }
            }
        }
        const displayText = (!sceneAssetsEnabled && scene.speaker && currentText)
            ? `${scene.speaker}: ${currentText}`
            : (sceneAssetsEnabled ? segmentBody : currentText);
        const overlayClasses = ['igs-stage', 'igs-mode-' + mode];
        if (mode === 'pc' || mode === 'mobile') overlayClasses.push('igs-floating');
        if (mode === 'mobile') overlayClasses.push('igs-floating-mobile');

        return {
            mode,
            messageId: firstDefined(payload.messageId, payload.message && payload.message.id, scene.messageId, null),
            selectors: Array.from(ORIGINAL_READER_REQUIRED_SELECTORS),
            classes: overlayClasses,
            styles: {
                '#igs-overlay': {
                    zIndex: ORIGINAL_READER_STYLE_CONTRACT.overlayZIndex,
                    background: '#000',
                },
                '.igs-dialog': {
                    width: ORIGINAL_READER_STYLE_CONTRACT.dialogWidth,
                    borderRadius: '22px',
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
                textType,
                text: currentText,
                fullText: text,
                displayText,
                segments: cloneData(segments),
                currentIndex: normalizedIndex,
                progress: buildProgressText(normalizedIndex, segments.length, displayImageState),
                backgroundImage: finalBackgroundImage,
                spriteImage,
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
        const body = renderSettingsBody(tab, draft, settingsState.asyncState);
        const tabsHtml = SETTINGS_TAB_DEFS.map(([id, label]) => {
            return `<button type="button" class="igs-settings-tab${tab === id ? ' is-active' : ''}" data-tab="${id}">${label}</button>`;
        }).join('');

        return {
            tab,
            selectors: Array.from(SETTINGS_PANEL_REQUIRED_SELECTORS),
            tabs: SETTINGS_TAB_DEFS.map(([id, label]) => ({
                id,
                label,
                active: id === tab,
                requiredPaths: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredPaths || []),
                requiredActions: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredActions || []),
            })),
            activeContract: SETTINGS_PANEL_TAB_CONTRACT[tab],
            html: `<div id="igs-unified-settings" data-igs-igs-ui="true">${renderTemplate(getSettingsShellTemplate(), {
                version: esc(options.version || '0.5.4'),
                tabs: tabsHtml,
                body,
            })}</div>`,
            resultText: {
                image: settingsState.asyncState.imageResult || '',
                imageModels: settingsState.asyncState.imageModelsMessage || '',
                virtualRegex: settingsState.asyncState.virtualRegexPreview || '',
            },
            draft,
        };
    }

    function renderSettingsBody(tab, draft, asyncState) {
        const bridge = draft.bridge;
        const imageApi = bridge.imageApi;
        const sourceFilter = bridge.sourceFilter;
        const reader = draft.readerSettings;

        if (tab === 'basic') {
            return renderTemplate(getSettingsTabTemplate('basic'), {
                openModeField: `<div class="igs-settings-full igs-segmented-field">${field(
                    'bridge.openMode',
                    '切换模式',
                    segmentedInput(
                        'bridge.openMode',
                        bridge.openMode,
                        [
                            ['pc', '电脑', getReaderModeIcon('pc')],
                            ['mobile', '手机', getReaderModeIcon('mobile')],
                            ['web', '网页全屏', getReaderModeIcon('web')],
                            ['fullscreen', '全屏', getReaderModeIcon('fullscreen')],
                        ],
                        '切换模式',
                    ),
                )}</div>`,
                settingsToggles: checkbox('bridge.showToasts', bridge.showToasts, '显示提示 toast'),
            });
        }

        if (tab === 'regex') {
            return renderTemplate(getSettingsTabTemplate('regex'), {
                filterToggles: checkbox('bridge.sourceFilter.enabled', sourceFilter.enabled, '启用标签筛选')
                    + checkbox('bridge.sourceFilter.stripHtmlComments', sourceFilter.stripHtmlComments, '排除 HTML 注释'),
                untaggedToggle: checkbox(
                    'bridge.sourceFilter.allowUntaggedFallback',
                    sourceFilter.allowUntaggedFallback,
                    '正文保留标签为空时读取清洗全文',
                ),
                textIncludeField: field('bridge.sourceFilter.textIncludeTags', '正文保留标签', textareaInput('bridge.sourceFilter.textIncludeTags', sourceFilter.textIncludeTags, 'content')),
                textExcludeField: field('bridge.sourceFilter.textExcludeTags', '正文排除标签', textareaInput('bridge.sourceFilter.textExcludeTags', sourceFilter.textExcludeTags)),
                imageIncludeField: field('bridge.sourceFilter.imageIncludeTags', '图片保留标签', textareaInput('bridge.sourceFilter.imageIncludeTags', sourceFilter.imageIncludeTags, 'image&#10;text_to_image')),
                regexToggle: checkbox('bridge.virtualRegex.enabled', bridge.virtualRegex.enabled, '启用正文格式化'),
                regexPatternField: field('bridge.virtualRegex.pattern', '查找表达式', textareaInput('bridge.virtualRegex.pattern', bridge.virtualRegex.pattern, '^@bubble:([^|\\n]+)\\|[^|\\n]*\\|\\[?([^\\n]*?)\\]?$')),
                regexFlagsField: field('bridge.virtualRegex.flags', 'flags', textInput('bridge.virtualRegex.flags', bridge.virtualRegex.flags, 'i'), '例如 i、g、s、m；留空表示无 flags。'),
                regexReplacementField: field('bridge.virtualRegex.replacement', '替换文本', textareaInput('bridge.virtualRegex.replacement', bridge.virtualRegex.replacement, '[$1]：$2')),
                regexPreview: esc(asyncState.virtualRegexPreview || '点击“测试当前楼层”预览最终 IGS 正文。'),
            });
        }

        if (tab === 'image') {
            const apiDisabled = imageApi.mode !== 'nai';
            const imageModeNote = imageApi.mode === 'nai'
                ? '内置模式会直接调用图像 API，不再依赖外部插图扩展。'
                : '外部扩展模式会优先按适配器检测 chatu8 / chami。';
            const promptPrefixInput = `<textarea data-path="bridge.imageApi.promptPrefix" placeholder="可选，生成图片时追加到正文前"${disabledAttr(apiDisabled)}>${esc(imageApi.promptPrefix || '')}</textarea>`;
            return renderTemplate(getSettingsTabTemplate('image'), {
                imageModeField: field('bridge.imageApi.mode', '图像模式', selectInput('bridge.imageApi.mode', imageApi.mode, [['extension', '使用现有插图扩展'], ['nai', 'IGS 内置 NAI API']])),
                adapterField: field('bridge.imageApi.externalAdapter', '插图扩展', selectInput('bridge.imageApi.externalAdapter', imageApi.externalAdapter, [['auto', '自动检测'], ['chatu8', 'st-chatu8 / chatu8'], ['chami', 'chami_tavern-scene-plugin']], imageApi.mode === 'nai'), imageModeNote),
                apiGroupClass: 'igs-settings-api-group' + (apiDisabled ? ' is-disabled' : ''),
                endpointField: field('bridge.imageApi.endpoint', '图像 API 地址', textInput('bridge.imageApi.endpoint', imageApi.endpoint, 'https://...', 'text', apiDisabled), apiDisabled ? '内置 NAI API 模式启用时可编辑。' : ''),
                apiKeyField: field('bridge.imageApi.apiKey', 'API Key', secretInput('bridge.imageApi.apiKey', imageApi.apiKey, '留空则不发送 Authorization', apiDisabled)),
                modelField: field('bridge.imageApi.model', '模型', modelPicker('bridge.imageApi.model', imageApi.model, imageApi.availableModels, 'fetch-image-models', 'nai-diffusion-3', apiDisabled)),
                sizeField: field('bridge.imageApi.size', '尺寸', textInput('bridge.imageApi.size', imageApi.size, '832x1216', 'text', apiDisabled)),
                stepsField: field('bridge.imageApi.steps', '步数', numberInput('bridge.imageApi.steps', imageApi.steps, 1, 100, apiDisabled)),
                samplerField: field('bridge.imageApi.sampler', '采样器', textInput('bridge.imageApi.sampler', imageApi.sampler, 'k_euler_ancestral', 'text', apiDisabled)),
                timeoutField: field('bridge.imageApi.requestTimeoutMs', '请求超时 ms', numberInput('bridge.imageApi.requestTimeoutMs', imageApi.requestTimeoutMs, 5000, 300000, apiDisabled)),
                pollIntervalField: field('bridge.imageApi.pollIntervalMs', '轮询间隔 ms', numberInput('bridge.imageApi.pollIntervalMs', imageApi.pollIntervalMs, 500, 30000, apiDisabled)),
                pollAttemptsField: field('bridge.imageApi.pollAttempts', '轮询次数', numberInput('bridge.imageApi.pollAttempts', imageApi.pollAttempts, 1, 240, apiDisabled)),
                promptPrefixField: field('bridge.imageApi.promptPrefix', '图像提示词前缀', promptPrefixInput),
                imageModelsMessage: esc(asyncState.imageModelsMessage || (apiDisabled ? '使用现有插图扩展时无需拉取内置 API 模型；检测插件会检查 chatu8 / chami 链路。' : '可手填模型，也可点击拉取模型获取候选列表。')),
                imageTestActionLabel: imageApi.mode === 'nai' ? '测试生成' : '检测插件',
                imageTestHelp: esc(asyncState.imageResult || (imageApi.mode === 'nai' ? '测试会对当前内置 API 发起真实生成请求；建议先填写 endpoint、模型和 key。' : '检测当前页面可用的外部插图扩展与图片/按钮链路。')),
            });
        }

        if (tab === 'scene') {
            const sceneAssets = bridge.sceneAssets || {};
            const disabled = !sceneAssets.enabled;
            const subTab = asyncState.sceneSubTab === 'characters' ? 'characters' : 'scenes';
            const scenesHtml = renderSceneAssetList(sceneAssets.scenes || {}, {
                expandedSlots: asyncState.expandedSceneSlots instanceof Set ? asyncState.expandedSceneSlots : new Set(),
                timeGroups: sceneAssets.timeGroups || [],
                weatherGroups: sceneAssets.weatherGroups || [],
            });
            const charsHtml = renderCharacterAssetList(sceneAssets.characters || {}, {
                moodGroups: sceneAssets.moodGroups || [],
                expandedSlots: asyncState.expandedSpriteSlots instanceof Set ? asyncState.expandedSpriteSlots : new Set(),
            });
            const scenePresets = loadScenePresets((options.global || globalThis).localStorage);
            const scenePresetBarHtml = renderScenePresetBar(scenePresets, asyncState.scenePresetName || '');
            const subTabsHtml = `<div class="igs-scene-subtabs" role="tablist">`
                + `<button type="button" class="igs-scene-subtab${subTab === 'scenes' ? ' is-active' : ''}" data-scene-subtab="scenes">场景素材</button>`
                + `<button type="button" class="igs-scene-subtab${subTab === 'characters' ? ' is-active' : ''}" data-scene-subtab="characters">角色立绘</button>`
                + `</div>`;
            const scenesPane = `<div class="igs-source-filter">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="igs-source-filter-title">背景场景</div>
          <button class="igs-btn-mgr-icon" data-action="scene-add-bg" type="button" title="添加背景图">+</button>
        </div>
        <div class="igs-source-filter-note">场景名 → 背景图 URL。名为「默认」的条目在无匹配时兜底。子层级（时间→天气）优先级依次升高。</div>
        ${scenesHtml}
      </div>`;
            const charactersPane = `<div class="igs-source-filter">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="igs-source-filter-title">角色立绘</div>
          <button class="igs-btn-mgr-icon" data-action="scene-add-char" type="button" title="添加角色">+</button>
        </div>
        <div class="igs-source-filter-note">角色名 → 情绪 → 立绘 URL。展开情绪槽可预览立绘并编辑该情绪组的词（词库全局共享）。</div>
        <div class="igs-settings-row">${checkbox('bridge.sceneAssets.unifiedSpriteLayout', sceneAssets.unifiedSpriteLayout, '统一角色立绘位置（各情绪共用一套位置）')}</div>
        ${charsHtml}
        <div class="igs-settings-row"><button class="igs-settings-action" data-action="reset-mood-groups" type="button">恢复默认词库</button></div>
      </div>`;
            return renderTemplate(getSettingsTabTemplate('scene'), {
                sceneToggle: checkbox('bridge.sceneAssets.enabled', sceneAssets.enabled, '启用场景素材模式'),
                sceneGroupClass: `igs-settings-section igs-settings-full${disabled ? ' igs-settings-api-group is-disabled' : ''}`,
                promptRuleField: field('bridge.sceneAssets.promptRule', '注入提示词', `<textarea data-path="bridge.sceneAssets.promptRule" placeholder="格式规则..."${disabled ? ' disabled' : ''}>${esc(sceneAssets.promptRule || '')}</textarea>`),
                scenePresetBar: scenePresetBarHtml,
                sceneSubTabs: subTabsHtml,
                sceneSubPane: subTab === 'characters' ? charactersPane : scenesPane,
            });
        }

        const sceneEnabled = !!(bridge.sceneAssets && bridge.sceneAssets.enabled);
        const themeDisabled = !sceneEnabled;
        const vnTheme = reader.vnTheme || {};
        // 对话主题已取消预设选择，恒为自定义：自定义项始终可编辑（仅受场景素材开关 themeDisabled 控制）。
        const themeCustom = true;
        const displayTheme = vnTheme;
        return renderTemplate(getSettingsTabTemplate('reader'), {
            fontSizeField: field('readerSettings.fontSize', '字体大小', selectInput('readerSettings.fontSize', reader.fontSize, [12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30].map((n) => [n, `${n}px`]))),
            dialogWidthField: field('readerSettings.dialogWidth', '对话框宽度', selectInput('readerSettings.dialogWidth', reader.dialogWidth === null ? 'null' : reader.dialogWidth, [['null', '自动'], [200, '200px'], [280, '280px'], [360, '360px'], [440, '440px'], [520, '520px'], [600, '600px'], [680, '680px'], [760, '760px'], [840, '840px'], [920, '920px'], [1000, '1000px'], [1080, '1080px'], [1160, '1160px'], [1280, '1280px']])),
            dialogHeightField: field('readerSettings.dialogHeight', '对话框高度', selectInput('readerSettings.dialogHeight', reader.dialogHeight === null ? 'null' : reader.dialogHeight, [['null', '自适应'], [10, '10px'], [20, '20px'], [40, '40px'], [60, '60px'], [90, '90px'], [130, '130px'], [160, '160px'], [200, '200px'], [250, '250px'], [300, '300px'], [400, '400px'], [500, '500px'], [600, '600px']])),
            glassOpacityField: field('readerSettings.glassOpacity', '玻璃浓度', selectInput('readerSettings.glassOpacity', reader.glassOpacity, [0, .1, .2, .35, .5, .62, .74, .88, 1].map((n) => [n, `${Math.round(n * 100)}%`]))),
            imageCountField: field('readerSettings.imageCountOverride', '检测图像数量', selectInput('readerSettings.imageCountOverride', reader.imageCountOverride === null ? 'null' : reader.imageCountOverride, [['null', '自动']].concat(Array.from({ length: 20 }, (_, index) => [index + 1, `${index + 1}张`])))),
            inputScaleField: field('readerSettings.inputScale', '输入框高度', selectInput('readerSettings.inputScale', reader.inputScale, [20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((n) => [n, `${n}%`]))),
            toolbarScaleField: field('readerSettings.toolbarScale', '工具栏大小', selectInput('readerSettings.toolbarScale', reader.toolbarScale, [20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((n) => [n, `${n}%`]))),
            toolbarDockField: field('readerSettings.toolbarDock', '工具栏位置', selectInput('readerSettings.toolbarDock', reader.toolbarDock || 'float', [['float', '悬浮'], ['top', '顶部固定']])),
            imgModeField: field('readerSettings.imgMode', '图像显示模式', selectInput('readerSettings.imgMode', reader.imgMode, [['adaptive', '自适应'], ['contain', '完整']])),
            imgBrightnessField: field('readerSettings.imgBrightness', '图片亮度', selectInput('readerSettings.imgBrightness', reader.imgBrightness, [50, 60, 70, 80, 88, 90, 100].map((n) => [n, `${n}%`]))),
            readerToggles: checkbox('readerSettings.glassBackdropFilter', reader.glassBackdropFilter, '启用背景滤镜')
                + checkbox('readerSettings.showStatusLine', reader.showStatusLine, '显示状态行')
                + checkbox('bridge.sentencePaging', Boolean(bridge.sentencePaging), '按句号自动分页（启用场景素材时仅分旁白）'),
            optionBubbleToggle: checkbox('bridge.optionBubble.enabled', Boolean(bridge.optionBubble && bridge.optionBubble.enabled), '启用选项气泡'),
            optionBubblePositionField: field('bridge.optionBubble.position', '气泡位置', segmentedInput('bridge.optionBubble.position', (bridge.optionBubble && bridge.optionBubble.position) || 'top-left', [['top-left', '左上角'], ['top-center', '正上方居中'], ['top-right', '右上角']], '气泡位置')),
            optionBubbleActionField: field('bridge.optionBubble.clickAction', '点击选项', segmentedInput('bridge.optionBubble.clickAction', (bridge.optionBubble && bridge.optionBubble.clickAction) || 'send', [['send', '自动发送'], ['fill', '填入输入框']], '点击行为')),
            optionBubbleWidthToggle: checkbox('bridge.optionBubble.widthFollowsText', Boolean(bridge.optionBubble && bridge.optionBubble.widthFollowsText), '气泡宽度随文本变化（关闭则跟随对话框宽度：居中=满宽，左/右上角=半宽）'),
            pinnedButtonsField: renderPinnedButtons(reader.pinnedBtns, reader.hiddenBtns, reader.btnOrder),
            themeGroupClass: `igs-source-filter igs-settings-full${themeDisabled ? ' igs-settings-api-group is-disabled' : ''}`,
            themePresetField: '',
            nameAlignField: field('readerSettings.vnTheme.nameAlign', '对齐', selectInput('readerSettings.vnTheme.nameAlign', displayTheme.nameAlign || 'left', [['left', '左对齐'], ['center', '居中'], ['indent', '首行缩进']], themeDisabled || !themeCustom)),
            textAlignField: field('readerSettings.vnTheme.textAlign', '对齐', selectInput('readerSettings.vnTheme.textAlign', displayTheme.textAlign || 'left', [['left', '左对齐'], ['center', '居中'], ['indent', '首行缩进']], themeDisabled || !themeCustom)),
            narrationAlignField: field('readerSettings.vnTheme.narrationAlign', '对齐', selectInput('readerSettings.vnTheme.narrationAlign', displayTheme.narrationAlign || 'left', [['left', '左对齐'], ['center', '居中'], ['indent', '首行缩进']], themeDisabled || !themeCustom)),
            thoughtAlignField: field('readerSettings.vnTheme.thoughtAlign', '对齐', selectInput('readerSettings.vnTheme.thoughtAlign', displayTheme.thoughtAlign || 'left', [['left', '左对齐'], ['center', '居中'], ['indent', '首行缩进']], themeDisabled || !themeCustom)),
            dividerField: field('readerSettings.vnTheme.dividerSymbol', '样式', selectInput('readerSettings.vnTheme.dividerSymbol', displayTheme.dividerSymbol || 'gradient', [['gradient', '渐变线'], ['none', '无']], themeDisabled || !themeCustom)),
            nameFontField: field('readerSettings.vnTheme.nameFont', '字体', selectInput('readerSettings.vnTheme.nameFont', displayTheme.nameFont || 'inherit', [['inherit', '默认'], ['"KaiTi","STKaiti",serif', '楷体'], ['"SimHei",sans-serif', '黑体'], ['"FangSong","STFangsong",serif', '仿宋'], ['"Microsoft YaHei",sans-serif', '微软雅黑']], themeDisabled || !themeCustom)),
            textFontField: field('readerSettings.vnTheme.textFont', '字体', selectInput('readerSettings.vnTheme.textFont', displayTheme.textFont || 'inherit', [['inherit', '默认'], ['"KaiTi","STKaiti",serif', '楷体'], ['"SimHei",sans-serif', '黑体'], ['"FangSong","STFangsong",serif', '仿宋'], ['"Microsoft YaHei",sans-serif', '微软雅黑']], themeDisabled || !themeCustom)),
            thoughtFontField: field('readerSettings.vnTheme.thoughtFont', '字体', selectInput('readerSettings.vnTheme.thoughtFont', displayTheme.thoughtFont || 'inherit', [['inherit', '默认'], ['"KaiTi","STKaiti",serif', '楷体'], ['"SimHei",sans-serif', '黑体'], ['"FangSong","STFangsong",serif', '仿宋'], ['"Microsoft YaHei",sans-serif', '微软雅黑']], themeDisabled || !themeCustom)),
            nameColorField: field('readerSettings.vnTheme.nameColor', '颜色', colorInput('readerSettings.vnTheme.nameColor', toHex(displayTheme.nameColor || '#ffeeb8'), themeDisabled || !themeCustom)),
            textColorField: field('readerSettings.vnTheme.textColor', '颜色', colorInput('readerSettings.vnTheme.textColor', toHex(displayTheme.textColor || '#f4f4f6'), themeDisabled || !themeCustom)),
            thoughtColorField: field('readerSettings.vnTheme.thoughtColor', '颜色', colorInput('readerSettings.vnTheme.thoughtColor', toHex(displayTheme.thoughtColor || '#c8c8dc'), themeDisabled || !themeCustom)),
            narrationFontField: field('readerSettings.vnTheme.narrationFont', '字体', selectInput('readerSettings.vnTheme.narrationFont', displayTheme.narrationFont || 'inherit', [['inherit', '默认'], ['"KaiTi","STKaiti",serif', '楷体'], ['"SimHei",sans-serif', '黑体'], ['"FangSong","STFangsong",serif', '仿宋'], ['"Microsoft YaHei",sans-serif', '微软雅黑']], themeDisabled || !themeCustom)),
            narrationColorField: field('readerSettings.vnTheme.narrationColor', '颜色', colorInput('readerSettings.vnTheme.narrationColor', toHex(displayTheme.narrationColor || '#f4f4f6'), themeDisabled || !themeCustom)),
            dividerColorField: field('readerSettings.vnTheme.dividerColor', '颜色', colorInput('readerSettings.vnTheme.dividerColor', toHex(displayTheme.dividerColor || '#ffeeb8'), themeDisabled || !themeCustom)),
            themeAdvancedClass: themeCustom ? '' : 'igs-settings-api-group is-disabled',
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

    function mountReaderDom(snapshot, controller) {
        const doc = getRootDocument(options.global);
        if (!doc) return null;
        ensureStyleTag(doc, 'igs-overlay-style', getOriginalReaderStyleText());
        const existing = doc.getElementById('igs-overlay');
        if (existing) existing.remove();

        const root = doc.createElement('div');
        // 挂到 documentElement 而非 body：宿主移动端把 body 设为 position:fixed 且尺寸受限，
        // 会成为 overlay fixed 定位的包含块，导致 100% 取到 body 尺寸而非视口（阅读器被压成一小块）。
        (doc.documentElement || doc.body).appendChild(root);
        installToolbarDragScroll(root, doc);
        root.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-act]');
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
            if (!state.activeReader) return;
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
            }
        };
        if (typeof doc.addEventListener === 'function') {
            doc.addEventListener('keydown', keydownHandler, true);
        }
        const dbController = createDbPanelController(doc, options.global);
        return {
            root,
            doc,
            dbController,
            dispose() {
                if (typeof doc.removeEventListener === 'function') {
                    doc.removeEventListener('keydown', keydownHandler, true);
                }
                dbController.close();
            },
        };
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
                event.preventDefault();
                await controller.invoke(actName);
                return;
            }
        });
        root.addEventListener('input', (event) => {
            const target = event.target;
            if (!target || !target.getAttribute) return;
            if (target.type === 'color') return;
            const path = target.getAttribute('data-path');
            if (path) {
                controller.setValue(path, target.value);
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
            if (event.target && event.target.getAttribute && event.target.getAttribute('data-preset-select') !== null) {
                controller.invoke('scene-preset-apply:' + encodeURIComponent(event.target.value));
                return;
            }
            const path = event.target && event.target.getAttribute ? event.target.getAttribute('data-path') : '';
            if (!path) return;
            controller.setValue(path, event.target.value);
        });
        root.addEventListener('keydown', (event) => {
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
        if (!current || !current.dom || !current.dom.root) return;
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
        });
        syncOptionBubblesAfterRender(current, snapshot);
    }

    function syncOptionBubblesAfterRender(current, snapshot) {
        const overlay = current && current.dom && current.dom.overlay;
        if (!overlay || !overlay.querySelector) return;
        const container = overlay.querySelector('#igs-option-bubbles');
        if (!container) return;
        const cfg = getOptionBubbleConfig();
        const isLastPage = isReaderLastPage(snapshot);
        // 翻页离开最后一页 / 重渲染（如新回复到来）一律收起气泡，避免错页残留。
        if (!cfg.enabled || !isLastPage) {
            hideOptionBubbles(container);
        } else if (container.hasAttribute('hidden')) {
            showOptionBubbles(container, cfg, { silent: true });
        }
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
        normalized.debug = normalizeBoolean(normalized.debug, false);
        normalized.sourceFilter = normalizeSourceFilter(normalized.sourceFilter);
        normalized.virtualRegex = normalizeVirtualRegex(normalized.virtualRegex);
        normalized.sentencePaging = normalizeBoolean(normalized.sentencePaging, false);
        normalized.imageApi = normalizeImageApi(normalized.imageApi);
        normalized.sceneAssets = normalizeSceneAssets(normalized.sceneAssets);
        normalized.vnTheme = normalizeVnTheme(normalized.vnTheme);
        normalized.entry = normalizeEntryConfig(normalized.entry);
        normalized.optionBubble = normalizeOptionBubble(normalized.optionBubble);
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
        normalized.promptRule = String(normalized.promptRule || DEFAULT_SCENE_PROMPT_RULE);
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
        return normalized;
    }

    function normalizeVnTheme(value) {
        const normalized = cloneData(value || {});
        // 对话主题已取消预设选择，恒为自定义；用 genshin 作为各字段的初值来源（fallback）。
        normalized.preset = 'custom';
        const fallback = VN_THEME_PRESETS.genshin;
        const normalizeAlign = (value, def) => (value === 'left' || value === 'center' || value === 'indent') ? value : def;
        normalized.nameAlign = normalizeAlign(normalized.nameAlign, fallback.nameAlign);
        normalized.textAlign = normalizeAlign(normalized.textAlign, fallback.textAlign || 'left');
        normalized.narrationAlign = normalizeAlign(normalized.narrationAlign, fallback.narrationAlign || 'left');
        normalized.thoughtAlign = normalizeAlign(normalized.thoughtAlign, fallback.thoughtAlign || 'left');
        // 分割线只保留「渐变线(gradient)」与「无(none)」；旧符号样式一律归到渐变线。
        normalized.dividerSymbol = normalized.dividerSymbol === 'none' ? 'none' : 'gradient';
        normalized.nameFont = normalized.nameFont || fallback.nameFont;
        normalized.textFont = normalized.textFont || fallback.textFont;
        normalized.thoughtFont = normalized.thoughtFont || fallback.thoughtFont;
        normalized.narrationFont = normalized.narrationFont || fallback.narrationFont;
        normalized.nameColor = normalized.nameColor || fallback.nameColor;
        normalized.textColor = normalized.textColor || fallback.textColor;
        normalized.thoughtColor = normalized.thoughtColor || fallback.thoughtColor;
        normalized.narrationColor = normalized.narrationColor || fallback.narrationColor;
        normalized.dividerColor = normalized.dividerColor || fallback.dividerColor;
        return normalized;
    }

    function normalizeReaderSettings(settings, legacyTheme) {
        const currentVersion = READER_SETTINGS_SCHEMA_VERSION;
        const src = (settings && typeof settings === 'object' && !Array.isArray(settings))
            ? cloneData(settings)
            : {};
        const base = {
            _v: currentVersion,
            fontSize: 18,
            dialogWidth: null,
            dialogHeight: null,
            glassOpacity: 0.62,
            glassBackdropFilter: false,
            toolbarScale: 100,
            toolbarDock: 'float',
            inputScale: 100,
            imgMode: 'adaptive',
            imgBrightness: 88,
            showStatusLine: false,
            imageCountOverride: null,
            pinnedBtns: Array.from(DEFAULT_PINNED_TOOLBAR_BUTTONS),
            hiddenBtns: [],
            btnOrder: TOOLBAR_ACTIONS.map(([id]) => id),
            spriteLayouts: {},
        };
        const normalized = { ...base, ...src, _v: currentVersion };
        normalized.fontSize = normalizeFiniteNumber(normalized.fontSize, base.fontSize);
        normalized.dialogWidth = normalizeNullableNumber(normalized.dialogWidth);
        normalized.dialogHeight = normalizeNullableNumber(normalized.dialogHeight);
        normalized.glassOpacity = normalizeOpacity(normalized.glassOpacity, base.glassOpacity);
        normalized.glassBackdropFilter = normalizeBoolean(normalized.glassBackdropFilter, base.glassBackdropFilter);
        normalized.toolbarScale = normalizeFiniteNumber(normalized.toolbarScale, base.toolbarScale);
        normalized.toolbarDock = normalized.toolbarDock === 'top' ? 'top' : 'float';
        normalized.inputScale = normalizeFiniteNumber(normalized.inputScale, base.inputScale);
        normalized.imgMode = normalized.imgMode === 'contain' ? 'contain' : 'adaptive';
        normalized.imgBrightness = clampNumber(normalizeFiniteNumber(normalized.imgBrightness, base.imgBrightness), 10, 100);
        normalized.showStatusLine = normalizeBoolean(normalized.showStatusLine, false);
        normalized.imageCountOverride = normalizeNullableNumber(normalized.imageCountOverride);
        normalized.pinnedBtns = normalizePinnedButtons(normalized.pinnedBtns);
        normalized.hiddenBtns = normalizeHiddenButtons(normalized.hiddenBtns);
        normalized.btnOrder = normalizeBtnOrder(normalized.btnOrder);
        normalized.spriteLayouts = normalizeSpriteLayouts(normalized.spriteLayouts);
        // 对话主题（vnTheme）按模式存进 readerSettings。独立于 _v 门控处理，避免 schema 版本
        // 不符时被清空。settings.vnTheme 缺失时回退到旧的全局 bridge.vnTheme（legacyTheme），
        // 实现从全局存储到按模式存储的平滑迁移。
        const rawTheme = (src.vnTheme && typeof src.vnTheme === 'object')
            ? src.vnTheme
            : (legacyTheme && typeof legacyTheme === 'object' ? legacyTheme : null);
        normalized.vnTheme = normalizeVnTheme(rawTheme || {});
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

    function writeToast(message) {
        const current = state.activeReader;
        if (!current) return;
        const bridge = resolveBridgeConfigSnapshot({ mode: current.mode }).bridge;
        applyToastToReader(current, bridge.showToasts !== false, message);
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
        if (!save || !state.activeReader) return;
        const mode = state.activeReader.mode;
        const unified = resolveBridgeConfigSnapshot({ mode });
        const result = save({ bridge: unified.bridge, readerMode: unified.readerMode, readerSettings: { ...unified.readerSettings, ...patch } });
        if (!result || result.ok === false) return;
        const refreshed = resolveBridgeConfigSnapshot({ mode });
        const readerSettings = normalizeReaderSettings(refreshed.readerSettings, refreshed.bridge.vnTheme);
        readerSettings._sceneAssets = refreshed.bridge.sceneAssets || null;
        readerSettings._sentencePaging = Boolean(refreshed.bridge.sentencePaging);
        readerSettings._vnTheme = readerSettings.vnTheme || null;
        state.activeReader.snapshot = buildReaderSnapshot(state.activeReader.payload, mode, readerSettings, state.activeReader.index);
        updateMountedReader(state.activeReader.snapshot);
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

function applyToastToReader(current, allowed, message) {
    if (!current || !message || allowed === false) return;
    clearReaderToast(current);
    current.toastMessage = String(message);
    const toast = current.dom && current.dom.overlay ? current.dom.overlay.querySelector("#igs-toast") : null;
    if (toast) {
        toast.textContent = current.toastMessage;
        toast.style.opacity = "1";
    }
    const win = current.dom && current.dom.overlay ? getOwnerWindow(current.dom.overlay) : null;
    const setter = win && typeof win.setTimeout === "function" ? win.setTimeout.bind(win) : setTimeout;
    current.toastTimer = setter(() => {
        current.toastMessage = "";
        if (toast) toast.style.opacity = "0";
        current.toastTimer = null;
    }, 1800);
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

const SCENE_TAG_LINE_RE = /^\[igs-scene:[^\]]*\]/;

function stripSceneDirectiveLines(rawText) {
    return String(rawText || '').split('\n')
        .filter(line => !SCENE_TAG_LINE_RE.test(line.trim()))
        .join('\n');
}
