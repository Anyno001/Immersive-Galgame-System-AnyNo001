// 设置器的打开 / 关闭、挂载、事件委托、草稿写入与保存。reader-host 只负责把阅读器侧的依赖交进来。
import { draftAssetLibrary, rememberAssetScope, sceneAssetsForContext } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { placeRowMenu } from './settings-outfit-fields.js';
import { cgReasonText } from '../../media/cg-library.js';
import { setStagePauseReason } from './stage-pause.js';
import { fileGeneratedHoldings, normalizeGeneratedLibrary, collectGeneratedImageIds } from '../../scene/asset-match.js';
import { CHARACTER_DNA_FIELDS, resolveCharacterDna } from '../../scene/character-dna.js';
import { loadMatteEditor } from './sprite-matte-editor.js';
import { mountMatteEditor } from './sprite-matte-editor-mount.js';
import { createCanvasImageCodec } from './sprite-matte-editor-view.js';
import { createInpaintTransaction } from '../../generated-images/illustration/inpaint-transaction.js';
import { normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';
import { mergeLegacyNaiSettings } from '../../generated-images/image-backend.js';
import { getSettingsStyleText } from './settings-style.js';
import { normalizeImageSubTab, normalizeSceneSubTab, normalizeReaderSubTab } from './settings-tabs.js';
import { VN_THEME_PRESETS } from './reader-host-constants.js';
import { cloneData } from './reader-value-utils.js';
import { attachSettingsViewportEvents, clearChildren, detachSettingsViewportEvents, ensureStyleTag, getRootDocument, unmountNode } from './reader-dom-utils.js';
import { getPath, normalizeReaderMode, normalizeSettingsTab, normalizeSettingsValue, setPath } from './settings-normalize.js';
import { handleSettingsAction as runSettingsAction, releasedGeneratedImageIds } from './settings-actions.js';
import { SETTINGS_NOTICE_MS, describeSettingsFailure, markSettingsButtonBusy, remountSettingsNotice, remountSettingsProgress, settingsBusyLabel } from './settings-notice.js';
import { createSettingsDialogs } from './settings-dialog.js';
import { captureSettingsFocus, restoreSettingsFocus } from './settings-focus.js';
import { CLASSIC_DIALOG_THEME_DEFAULTS } from './classic-dialog-skin.js';
import { SETTINGS_SEARCH_INDEX, renderSettingsSearchResults } from './settings-search.js';
import { canMorph, morphChildren } from './settings-dom-morph.js';
import { buildFallbackSettingsOverlay } from './reader-dom-render.js';
import { createSettingsRenderer } from './settings-host-render.js';
import { previewStatusHudPosition } from './status-hud-position-fields.js';

// 设置页改角色的某一项时，按这些字段里有没有这个角色名判断它在本卡还是全局。
const ASSET_CHARACTER_FIELDS = ['characters', 'characterOutfits', 'characterDna', 'characterAliases', 'statusAvatars'];
const LAST_SETTINGS_PAGE_KEY = 'igs:settings-last-page:v1';

export function createSettingsHost(deps) {
    const {
        flushDeferredImageRefresh, normalizeUnifiedSettings, onboarding, openCgGallery, options, pageModal,
        playReaderUiSfx, rerenderActiveReader, resolveBridgeConfigSnapshot, scheduleMoodAutoClassify, sourceCache,
        state, takeReaderStaleBehindSettings,
    } = deps;
    const settingsDialogs = createSettingsDialogs({
        getContainer: () => (state.activeSettings && state.activeSettings.dom ? state.activeSettings.dom.root : null),
        global: options.global || globalThis,
    });
    // 快照 → 遮罩内层 HTML；不放进快照字段，免得 getSnapshot/克隆多带一份。
    const settingsShellHtml = new WeakMap();
    const settingsBusyActions = new Set();
    // 手指按着或 ⋯ 菜单开着时不整页重绘：重绘会收掉菜单、换掉按下的按钮，点击落空。
    let settingsPointerDown = false;
    const { buildSettingsSnapshot, renderSettingsBody, renderImageJobLogList, buildRegexPreview, settingsLowQuality } = createSettingsRenderer({
        normalizeUnifiedSettings, options, rerenderSettings, settingsShellHtml, state,
    });

    function settingsInteracting() {
        const root = state.activeSettings && state.activeSettings.dom && state.activeSettings.dom.root;
        if (settingsPointerDown) return true;
        return Boolean(root && typeof root.querySelector === 'function' && root.querySelector('details.igs-add-menu[open]'));
    }

    function rememberSettingsPage(current) {
        try {
            const storage = (options.global || globalThis).localStorage;
            if (!storage || typeof storage.setItem !== 'function') return;
            const page = current.asyncState || {};
            storage.setItem(LAST_SETTINGS_PAGE_KEY, JSON.stringify({
                tab: normalizeSettingsTab(current.tab),
                readerSubTab: normalizeReaderSubTab(page.readerSubTab),
                sceneSubTab: normalizeSceneSubTab(page.sceneSubTab),
                imageSubTab: normalizeImageSubTab(page.imageSubTab),
            }));
        } catch (error) {
            try { console.warn('[IGS] 设置页记忆写入失败：', error); } catch { /* 控制台不可用时不影响切页 */ }
        }
    }

    function openSettings(openOptions = {}) {
        // 显式指定页签（阅读器工具按钮、引导跳转）始终优先于上次停留的位置。
        let lastPage = null;
        try {
            const storage = (options.global || globalThis).localStorage;
            const stored = storage && storage.getItem(LAST_SETTINGS_PAGE_KEY);
            const parsed = stored ? JSON.parse(stored) : null;
            lastPage = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch { /* 无存储权限时仍可打开设置 */ }
        const normalizedTab = normalizeSettingsTab(openOptions.tab || (state.activeSettings && state.activeSettings.tab) || (lastPage && lastPage.tab));
        const fallbackMode = state.activeReader ? state.activeReader.mode : undefined;
        if (state.activeSettings) {
            state.activeSettings.tab = normalizedTab;
            rememberSettingsPage(state.activeSettings);
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
            asyncState: {
                readerSubTab: normalizeReaderSubTab(lastPage && lastPage.readerSubTab),
                sceneSubTab: normalizeSceneSubTab(lastPage && lastPage.sceneSubTab),
                imageSubTab: normalizeImageSubTab(lastPage && lastPage.imageSubTab),
            },
            committedImageIds: collectGeneratedImageIds(initialSnapshot.bridge && initialSnapshot.bridge.sceneAssets),
            controller,
            dom: null,
        };
        state.activeSettings = settingsState;
        settingsState.dom = mountSettingsDom(controller);
        syncSettingsStagePause();
        playReaderUiSfx('open');
        rememberSettingsPage(settingsState);
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
        settingsPointerDown = false;
        onboarding.onSettingsClosed();
        syncSettingsStagePause();
        scheduleMoodAutoClassify();
        if (takeReaderStaleBehindSettings() && state.activeReader) rerenderActiveReader();
        playReaderUiSfx('close');
        return { ok: true };
    }

    function createSettingsController() {
        return {
            getSnapshot() {
                return state.activeSettings ? cloneData(state.activeSettings.snapshot) : null;
            },
            switchTab(tab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                state.activeSettings.tab = normalizeSettingsTab(tab);
                rememberSettingsPage(state.activeSettings);
                return rerenderSettings();
            },
            switchImageSubTab(subTab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                state.activeSettings.asyncState.imageSubTab = normalizeImageSubTab(subTab);
                rememberSettingsPage(state.activeSettings);
                return rerenderSettings();
            },
            switchReaderSubTab(subTab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                state.activeSettings.asyncState.readerSubTab = normalizeReaderSubTab(subTab);
                rememberSettingsPage(state.activeSettings);
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
                if (entry.target.sceneSubTab) asyncState.sceneSubTab = normalizeSceneSubTab(entry.target.sceneSubTab);
                asyncState.advancedOpen = { ...(asyncState.advancedOpen || {}) };
                for (const key of entry.target.open) asyncState.advancedOpen[key] = true;
                asyncState.settingsSearch = '';
                rememberSettingsPage(state.activeSettings);
                return rerenderSettings();
            },
            switchSceneSubTab(subTab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                state.activeSettings.asyncState.sceneSubTab = normalizeSceneSubTab(subTab);
                state.activeSettings.asyncState.wardrobeFocus = '';
                rememberSettingsPage(state.activeSettings);
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
            // getSnapshot() clones before exposing this value; do not deep-copy the entire
            // asset library for every keystroke (including long prompts and API keys).
            state.activeSettings.snapshot.draft = draft;
            return { ok: true };
        }
        if (path === 'bridge.sceneAssets.moodAutoClassify' && value === true) scheduleMoodAutoClassify();
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
        // The next settings open trims and validates asset templates. Persist the same
        // canonical values now, otherwise an unchanged second close rewrites the bridge.
        // Keep the draft intact on failure and avoid copying the large sceneAssets tree.
        const auto = draft.bridge && draft.bridge.autoIllustration;
        const bridgeToSave = auto && auto.assets && auto.assets.templates
            ? { ...draft.bridge, autoIllustration: {
                ...auto, assets: { ...auto.assets, templates: normalizeAutoIllustrationSettings(auto).assets.templates },
            } }
            : draft.bridge;
        let result;
        try {
            result = save({
                bridge: bridgeToSave,
                readerMode: 'default',
                readerSettings: draft.readerSettings,
            });
        } catch (error) {
            return { ok: false, reason: 'save-failed', saveError: error };
        }
        if (!result || result.ok === false) {
            return {
                ok: false,
                reason: 'save-failed',
                saveError: result && (result.message || result.reason),
                ...(result && result.rollbackFailed ? { rollbackFailed: true } : {}),
            };
        }

        const snapshot = resolveBridgeConfigSnapshot({ mode: 'default' });
        const savedAssets = snapshot.bridge && snapshot.bridge.sceneAssets;
        const previousIds = state.activeSettings.committedImageIds || [];
        state.activeSettings.committedImageIds = collectGeneratedImageIds(savedAssets);
        const released = releasedGeneratedImageIds(previousIds, savedAssets, (options.global || globalThis).localStorage);
        const imageService = options.generatedAssets;
        if (released.length && imageService && typeof imageService.deleteImages === 'function') {
            const reportDeleteFailure = () => {
                const message = '配置已保存，但有图片没能从本机清掉。';
                if (state.activeSettings) settingsDialogs.alert(message);
                else pageModal.alert(message);
            };
            Promise.resolve().then(() => imageService.deleteImages(released)).then((result) => {
                if (result === false || (result && result.ok === false)) reportDeleteFailure();
            }).catch(reportDeleteFailure);
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
                // 缩略图大图预览：URL 直接取 <img> 自己的 src，不在 data-action 里再嵌一份（dataUrl 动辄几百 KB）。
                if (actName === 'sprite-preview' || actName.startsWith('sprite-preview:')) {
                    event.preventDefault();
                    const url = actName === 'sprite-preview'
                        ? String(action.getAttribute('src') || '')
                        : decodeURIComponent(actName.slice('sprite-preview:'.length));
                    if (url) showSpritePreviewOverlay(root, url);
                    // 列表里是 160 宽小图：先放小图，原图读到再换上。
                    const service = options.generatedAssets;
                    const fullId = url && service && typeof service.thumbSourceId === 'function' ? service.thumbSourceId(url) : '';
                    if (fullId && typeof service.getImageDataUrl === 'function') {
                        service.getImageDataUrl(fullId).then((full) => {
                            const img = full && root.querySelector ? root.querySelector('#igs-sprite-preview-overlay .igs-sprite-preview-img') : null;
                            if (img) img.src = full;
                        }).catch(() => {});
                    }
                    return;
                }
                // 生图 › CG 库：先用缩略图铺满，原图读到再换（预览已关就不再弹）；读失败的格子点一下重试。
                if (actName.startsWith('image-cg-view:')) {
                    event.preventDefault();
                    const cgView = state.activeSettings && state.activeSettings.asyncState && state.activeSettings.asyncState.imageCg;
                    const cgEntry = cgView ? cgView.state.entries[Number(actName.slice('image-cg-view:'.length))] : null;
                    if (!cgEntry) return;
                    const cgTile = cgView.tileOf(cgEntry.key);
                    if (cgTile.state === 'failed') { cgView.retry(cgEntry.key); return; }
                    if (cgTile.url) showSpritePreviewOverlay(root, cgTile.url);
                    else showSettingsNotice('正在读取原图…');
                    cgView.readFull(cgEntry).then((result) => {
                        const stillOpen = !cgTile.url || Boolean(root.querySelector && root.querySelector('#igs-sprite-preview-overlay'));
                        if (result && result.ok) { if (stillOpen) showSpritePreviewOverlay(root, result.dataUrl); }
                        else showSettingsNotice(`原图读取失败：${cgReasonText(result && result.reason)}`);
                    });
                    return;
                }
                event.preventDefault();
                const busyLabel = settingsBusyLabel(actName);
                if (busyLabel) {
                    // 菜单项点完就收起菜单，进度看底部进度条；同一格还在画时说一声，不再静默吞掉。
                    const menu = action.closest('details.igs-add-menu');
                    if (menu) menu.open = false;
                    if (settingsBusyActions.has(actName)) {
                        showSettingsNotice('这一张还在画，画好会自动换上。');
                        return;
                    }
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
            // 状态栏位置拉杆：拖动中只挪小舞台，松手（change）才写草稿。
            if (target.type === 'range' && target.hasAttribute('data-hud-pos-axis')) {
                previewStatusHudPosition(target);
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
                    state.activeSettings.snapshot.draft = state.activeSettings.draft;
                }
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
                state.activeSettings.snapshot.draft = state.activeSettings.draft;
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
                state.activeSettings.snapshot.draft = state.activeSettings.draft;
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
            // 角色学院 / 声线下拉：交给动作层写草稿并保存（input 监听不处理 SELECT）。
            const charSelect = event.target && event.target.getAttribute ? event.target : null;
            const charHouse = charSelect ? charSelect.getAttribute('data-char-house') : null;
            if (charHouse) {
                controller.invoke(`char-house:${encodeURIComponent(charHouse)}:${encodeURIComponent(charSelect.value || '')}`);
                return;
            }
            const voiceField = !charSelect ? '' : charSelect.hasAttribute('data-char-voice') ? 'pack'
                : charSelect.hasAttribute('data-char-voice-pitch') ? 'pitch'
                    : charSelect.hasAttribute('data-char-voice-speed') ? 'speed' : '';
            if (voiceField) {
                const voiceChar = charSelect.getAttribute(voiceField === 'pack' ? 'data-char-voice' : `data-char-voice-${voiceField}`) || '';
                controller.invoke(`char-voice:${voiceField}:${encodeURIComponent(voiceChar)}:${encodeURIComponent(charSelect.value || '')}`);
                return;
            }
            // 角色立绘高度：输完（失焦或回车）才保存，打字途中不重绘。
            const heightChar = charSelect ? charSelect.getAttribute('data-char-height') : null;
            if (heightChar) {
                controller.invoke(`char-height:${encodeURIComponent(heightChar)}:${encodeURIComponent(charSelect.value || '')}`);
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
            const moodReviewWord = event.target && event.target.getAttribute ? event.target.getAttribute('data-mood-review-word') : '';
            if (moodReviewWord) {
                if (!event.target.value) return;
                controller.invoke(`mood-review-assign:${encodeURIComponent(moodReviewWord)}:${encodeURIComponent(event.target.value)}`);
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
            const horrorKind = event.target && event.target.getAttribute ? event.target.getAttribute('data-horror-select') : null;
            if (horrorKind === 'style' || horrorKind === 'gore') {
                controller.invoke(`horror-${horrorKind}:` + String(event.target.value || ''));
                return;
            }
            const target = event.target;
            const path = event.target && event.target.getAttribute ? event.target.getAttribute('data-path') : '';
            if (event.target && event.target.type === 'range' && !/^readerSettings\.(typewriter\.sound|statusHud\.position)\./.test(path || '')) return;
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
        const pointerDown = () => { settingsPointerDown = true; };
        const pointerUp = () => {
            settingsPointerDown = false;
            // 让这次点击先落到按钮上，再补刷搁着的缩略图。
            (doc.defaultView || globalThis).setTimeout(flushDeferredImageRefresh, 0);
        };
        root.addEventListener('pointerdown', pointerDown, true);
        root.addEventListener('pointerup', pointerUp, true);
        root.addEventListener('pointercancel', pointerUp, true);
        // toggle 不冒泡，用捕获阶段记住「高级」折叠区的展开状态，避免重渲染后被收起。
        root.addEventListener('toggle', (event) => {
            const target = event.target;
            if (target && target.classList && target.classList.contains('igs-add-menu')) {
                placeRowMenu(target, doc.defaultView || globalThis);
                if (!target.open) flushDeferredImageRefresh();
            }
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

    function updateMountedSettings(snapshot) {
        const current = state.activeSettings;
        if (!current || !current.dom || !current.dom.root) return;
        // 输入弹窗期间保留真实输入节点；整页重建会反复关闭、唤起手机软键盘。
        if (settingsDialogs.hasTextInput()) return;
        const container = current.dom.root;
        const prevBody = container.querySelector('.igs-settings-body');
        const scrollTop = prevBody ? prevBody.scrollTop : 0;
        const focus = captureSettingsFocus(container);
        // 遮罩层带全屏 backdrop-filter 与焦散动画：重绘只换遮罩里的内容，遮罩节点本身留着，
        // 免得每次改设置都重建一次全屏模糊合成层、焦散动画从头播。
        // 兜底遮罩（宿主不解析 innerHTML 时手搭的）不复用，仍按旧路整块重建。
        const prevOverlay = current.dom.overlayParsed && current.dom.overlay && current.dom.overlay.parentNode === container
            ? current.dom.overlay : null;
        const shell = settingsShellHtml.get(snapshot);
        if (prevOverlay && shell) {
            prevOverlay.setAttribute('data-igs-settings-theme', shell.theme);
            if (settingsLowQuality(current.draft)) prevOverlay.setAttribute('data-igs-quality', 'low');
            else prevOverlay.removeAttribute('data-igs-quality');
            if (canMorph(prevOverlay)) morphChildren(prevOverlay, shell.html);
            else prevOverlay.innerHTML = shell.html;
        } else {
            clearChildren(container);
            container.innerHTML = snapshot.html;
            current.dom.overlay = container.querySelector('#igs-unified-settings');
            current.dom.overlayParsed = Boolean(current.dom.overlay);
        }
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
        remountSettingsProgress(container);
        settingsDialogs.remount(container);
        onboarding.mountInSettings(container);
    }

    // 保存失败或动作抛异常时在面板内提示原因；面板重绘时由 updateMountedSettings 补回。
    function reportSettingsFailure(result) {
        const message = describeSettingsFailure(result);
        if (!message) return;
        if (result && result.thrown) console.warn('[IGS] 设置操作失败', result.thrown);
        showSettingsNotice(message);
    }

    function showSettingsNotice(message) {
        const current = state.activeSettings;
        if (!current || !message) return;
        const notice = { message, until: Date.now() + SETTINGS_NOTICE_MS };
        current.notice = notice;
        remountSettingsNotice(current.dom && current.dom.root, notice);
        setTimeout(() => {
            if (state.activeSettings !== current || current.notice !== notice) return;
            current.notice = null;
            remountSettingsNotice(current.dom && current.dom.root, null);
        }, SETTINGS_NOTICE_MS);
    }

    return {
        settingsInteracting, openSettings, syncSettingsStagePause, rerenderSettings, closeSettings,
        persistSettingsDraft, reportSettingsFailure, renderImageJobLogList,
    };
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
