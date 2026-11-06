import { recoverOperation, createOperationCheckpoint, checkpointService, wakeRecoveringOperations } from '../../storage/automatic-recovery.js';
// 设置器的打开 / 关闭、挂载、事件委托、草稿写入与保存。reader-host 只负责把阅读器侧的依赖交进来。
import { updateCharCounts } from './prompt-entries-fields.js';
import { applyTtsVoiceSearch, restoreTtsVoiceSearch } from './tts-voice-search.js';
import { withCharacterDnaDraftSync } from './settings-external-sprite-dna.js';
import { draftAssetLibrary, effectiveSceneAssets, rememberAssetScope, sceneAssetsForContext } from '../../scene/asset-scope.js';
import { resolveWorldview } from '../../scene/worldview.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { placeRowMenu } from './settings-outfit-fields.js';
import { splitMigrationWords } from '../../scene/outfit-migration.js';
import { cgReasonText } from '../../media/cg-library.js';
import { setStagePauseReason } from './stage-pause.js';
import { scheduleFontGuard } from './font-guard.js';
import { fileGeneratedHoldings, normalizeGeneratedLibrary, collectGeneratedImageIds } from '../../scene/asset-match.js';
import { CHARACTER_DNA_EDIT_FIELDS, editCharacterDnaField, resolveCharacterDna } from '../../scene/character-dna.js';
import { loadMatteEditor } from './sprite-matte-editor.js';
import { mountMatteEditor } from './sprite-matte-editor-mount.js';
import { createCanvasImageCodec } from './sprite-matte-editor-view.js';
import { createInpaintTransaction } from '../../generated-images/illustration/inpaint-transaction.js';
import { normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';
import { readWindowViewport, resolutionNearCap } from '../../generated-images/illustration/auto-illustration-service.js';
import { mergeLegacyNaiSettings } from '../../generated-images/image-backend.js';
import { getSettingsStyleText } from './settings-style.js';
import { categoryOfPage, currentSettingsPage, defaultPageOfCategory, isSettingsCategory, isSettingsPage, normalizeSettingsPage, openSettingsPage, resolveSettingsPage, resolveSettingsTarget } from './settings-pages.js';
import { recordSettingsRecent, settingsRecentLabel } from './settings-recent.js';
import { migrateTables, MIGRATE_BACKUP_KEY } from '../../data/shujuku/table-migrate.js';
import { downloadStatsTemplate, fetchStatsTemplate, importStatsTemplate, statsTemplateChatDiff, STATS_TEMPLATE_PRESET_NAME } from './stats-template-link.js';
import { createShujukuClient } from '../../data/shujuku/client.js';
import { VN_THEME_PRESETS } from './reader-host-constants.js';
import { cloneData } from './reader-value-utils.js';
import { attachSettingsViewportEvents, clearChildren, detachSettingsViewportEvents, ensureStyleTag, getRootDocument, unmountNode } from './reader-dom-utils.js';
import { getPath, normalizeReaderMode, normalizeSettingsValue, setPath } from './settings-normalize.js';
import { FX_PACKS_ACTIVE, packSwitchPath } from '../../scene/fx-packs.js';
import { handleSettingsAction as runSettingsAction, releasedGeneratedImageIds } from './settings-actions.js';
import { ensureModelProfilesLoaded, handleModelProfileAction, isImmediateSavePath, setModelProfileSelection } from './settings-model-profiles.js';
import { handleWorldInfoFilterAction, WORLD_INFO_FILTER_GROUP } from './settings-world-info-filter.js';
import { SETTINGS_NOTICE_MS, beginSettingsProgress, describeSettingsFailure, markSettingsButtonBusy, remountSettingsNotice, remountSettingsProgress, settingsBusyLabel } from './settings-notice.js';
import { createSettingsDialogs } from './settings-dialog.js';
import { captureSettingsFocus, restoreSettingsFocus } from './settings-focus.js';
import { CLASSIC_DIALOG_THEME_DEFAULTS } from './classic-dialog-skin.js';
import { SETTINGS_SEARCH_INDEX, buildSettingsSearchIndex, findSettingNode, renderSettingsSearchResults } from './settings-search.js';
import { eventToShortcut } from './reader-shortcuts.js';
import { canMorph, morphChildren } from './settings-dom-morph.js';
import { buildFallbackSettingsOverlay } from './reader-dom-render.js';
import { createSettingsRenderer } from './settings-host-render.js';
import { createImagePromptEditor } from './settings-image-prompt-editor.js';
import { handleImagePromptAction } from './settings-image-prompt-actions.js';
import { describeFailure, imagePromptStatusClass, imagePromptStatusText } from './settings-image-prompt-labels.js';
import { handleArtistLibraryAction, setArtistLibraryField, setArtistSelection } from './settings-artist-library.js';
import { preserveConfiguredArtists } from '../../generated-images/artist-library.js';
import { pickImagePromptFile } from './settings-image-prompt-io.js';
import { previewStatusHudPosition } from './status-hud-position-fields.js';
import { listSystemVoices, onSystemVoicesChanged } from './tts.js';
import { normalizeBuild } from '../../scene/stats/stat-build.js';
import { refreshStatsBuildStatus } from './stats-settings-fields.js';
import { BATTLE_MODE_PATH, COMBAT_PRESET_PATH, checkCombatExpansionReady, planBattleMode, planCombatPreset } from './combat-settings.js';
import { ensureEnemyAtlas } from './combat-enemy-atlas.js';
import { probeCombatTableSupport } from '../../data/shujuku/combat-tables.js';
import { originChatStatus, runAttachedOriginOp } from './origin-attach.js';

// 设置页改角色的某一项时，按这些字段里有没有这个角色名判断它在本卡还是全局。
const ASSET_CHARACTER_FIELDS = ['characters', 'characterOutfits', 'characterDna', 'characterAliases', 'statusAvatars'];
const LAST_SETTINGS_PAGE_KEY = 'igs:settings-last-page:v1';
// 建卡分配的默认值（基础属性 40、默认预选的特有技能）只在规范化时补出，原始草稿里没有。
// 改动前先把规范化结果写回草稿：开关按界面显示值取反，默认选中的技能才能取消，其余技能才能选上。
const STATS_BUILD_PATH = 'bridge.stats.build';
function materializeStatsBuild(draft, path) {
    if (!draft || !String(path).startsWith(`${STATS_BUILD_PATH}.`)) return;
    setPath(draft, STATS_BUILD_PATH, normalizeBuild(getPath(draft, STATS_BUILD_PATH)));
}

export function createSettingsHost(deps) {
    const {
        flushDeferredImageRefresh, normalizeUnifiedSettings, onboarding, openCgGallery, options, pageModal,
        playReaderUiSfx, rerenderActiveReader, resolveBridgeConfigSnapshot, scheduleMoodAutoClassify, sourceCache,
        state, takeReaderStaleBehindSettings, invalidateFloorAssetPlan, openLive2dManager,
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
    const { buildSettingsSnapshot, renderSettingsBody, renderPageForIndex, renderImageJobLogList, buildRegexPreview, settingsLowQuality } = createSettingsRenderer({
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
            const page = currentSettingsPage(current);
            storage.setItem(LAST_SETTINGS_PAGE_KEY, JSON.stringify({ tab: categoryOfPage(page), page }));
        } catch (error) {
            try { console.warn('[IGS] 设置页记忆写入失败：', error); } catch { /* 控制台不可用时不影响切页 */ }
        }
    }

    // 上次停留的页面。新格式 { tab, page }；旧格式 { tab, readerSubTab, sceneSubTab, imageSubTab } 走旧 id 映射。
    function readLastSettingsPage() {
        try {
            const storage = (options.global || globalThis).localStorage;
            const stored = storage && storage.getItem(LAST_SETTINGS_PAGE_KEY);
            const parsed = stored ? JSON.parse(stored) : null;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
            return resolveSettingsPage(parsed);
        } catch { /* 无存储权限或存档损坏时仍可打开设置 */ }
        return '';
    }

    // 显式指定（阅读器工具按钮、引导跳转）始终优先于上次停留的位置；只给了新分类 id 时，上次停在这一类里就回到那一页。
    function explicitSettingsPage(openOptions, lastPage) {
        const raw = openOptions && typeof openOptions === 'object' ? openOptions : {};
        if (isSettingsPage(raw.page)) return normalizeSettingsPage(raw.page);
        const tab = String(raw.tab || '').trim();
        if (!tab) return '';
        const page = resolveSettingsPage(raw);
        if (isSettingsCategory(tab) && lastPage && categoryOfPage(lastPage) === tab && defaultPageOfCategory(tab) === page) return lastPage;
        return page;
    }

    function openSettings(openOptions = {}) {
        const lastPage = readLastSettingsPage();
        const explicit = explicitSettingsPage(openOptions, lastPage);
        if (state.activeSettings) {
            if (explicit) openSettingsPage(state.activeSettings, explicit);
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
            tab: 'dash',
            // 草稿是设置里唯一可原地改的副本：打开时整份拷一次，存储里那份是共享只读的。
            draft: cloneData(initialSnapshot),
            initialOpenMode: initialSnapshot.bridge.openMode,
            asyncState: {},
            recoveryController: new AbortController(),
            committedImageIds: collectGeneratedImageIds(initialSnapshot.bridge && initialSnapshot.bridge.sceneAssets),
            controller,
            dom: null,
        };
        openSettingsPage(settingsState, explicit || lastPage || 'dash');
        state.activeSettings = settingsState;
        const naiDraft = settingsState.draft.bridge.autoIllustration.nai;
        const preserved = preserveConfiguredArtists(naiDraft);
        if (preserved.ok) settingsState.draft.bridge.autoIllustration.nai = preserved.value;
        else settingsState.asyncState.artistLibrary = { status: preserved.reason };
        if (options.presetRegistry) {
            const editor = createImagePromptEditor(options.presetRegistry);
            settingsState.asyncState.imagePromptEditor = editor;
            const initialized = editor.initialize();
            if (!initialized.ok) editor.state.status = `初始化失败：${initialized.reason}`;
        }
        settingsState.dom = mountSettingsDom(controller);
        // 浏览器的系统声音是异步加载的：打开时还是空的就等 voiceschanged，到了就刷新设置页，设置关闭时取消。
        if (!listSystemVoices().length) {
            const stop = onSystemVoicesChanged(() => {
                if (state.activeSettings !== settingsState || !listSystemVoices().length) return;
                stop();
                settingsState.stopVoicesWatch = null;
                rerenderSettings();
            });
            settingsState.stopVoicesWatch = stop;
        }
        syncSettingsStagePause();
        playReaderUiSfx('open');
        rememberSettingsPage(settingsState);
        const rendered = rerenderSettings();
        scheduleSearchIndexPrebuild(settingsState);
        return rendered;
    }

    // 设置面板盖住整个舞台（遮罩带全屏模糊），打开期间舞台动画与粒子暂停。
    function syncSettingsStagePause() {
        const overlay = state.activeReader && state.activeReader.dom && state.activeReader.dom.overlay;
        if (overlay) setStagePauseReason(overlay, 'panel:settings', Boolean(state.activeSettings));
    }

    // 写草稿的入口都要调：递增修订号，让设置页缓存的整理结果作废。
    function touchDraft() {
        const current = state.activeSettings;
        if (current) current.draftRevision = (current.draftRevision || 0) + 1;
    }

    // renderOptions.draftUnchanged：只换页、展开折叠这类不碰草稿的重绘，草稿修订号没变就复用上次整理结果。
    function rerenderSettings(renderOptions) {
        if (!state.activeSettings) {
            return { ok: false, reason: 'settings-not-open' };
        }
        state.activeSettings.reuseNormalized = Boolean(renderOptions && renderOptions.draftUnchanged === true);
        const snapshot = buildSettingsSnapshot(state.activeSettings);
        state.activeSettings.snapshot = snapshot;
        updateMountedSettings(snapshot);
        if (['source', 'llm', 'origin'].includes(state.activeSettings.asyncState.page)) {
            ensureModelProfilesLoaded(state.activeSettings, { global: options.global || globalThis, onChange: (panel) => { if (state.activeSettings === panel) rerenderSettings(); } });
        }
        return {
            ok: true,
            tab: state.activeSettings.tab,
            // draft 已是本次归一化出的新副本，不再整份深拷贝第二遍（每次点按钮、改字段都会走到这里）。
            snapshot: { ...cloneData({ ...snapshot, draft: null }), draft: snapshot.draft },
            domMounted: Boolean(state.activeSettings.dom),
            controller: state.activeSettings.controller,
        };
    }

    // 提示词编辑器自动保存：输入停顿 1.2 秒、失焦、折叠、切换预设、关闭设置时保存一次；只就地更新状态行，不重绘。
    let imagePromptSaveTimer = null;
    function clearImagePromptSaveTimer() {
        if (imagePromptSaveTimer) clearTimeout(imagePromptSaveTimer);
        imagePromptSaveTimer = null;
    }
    function flushImagePromptSave(root) {
        clearImagePromptSaveTimer();
        const panel = state.activeSettings, editor = panel?.asyncState.imagePromptEditor;
        if (!editor || !editor.state.dirty) return;
        editor.autoSave();
        showImagePromptStatus(root || panel.dom?.root, editor);
    }
    function scheduleImagePromptSave(root) {
        clearImagePromptSaveTimer();
        const panel = state.activeSettings;
        imagePromptSaveTimer = setTimeout(() => {
            imagePromptSaveTimer = null;
            if (state.activeSettings === panel) flushImagePromptSave(root);
        }, 1200);
    }
    function showImagePromptStatus(root, editor) {
        const el = root?.querySelector?.('[data-image-prompt-status]');
        if (!el) return;
        el.textContent = imagePromptStatusText(editor.state);
        el.className = `igs-settings-result ${imagePromptStatusClass(editor.state)}`.trim();
    }

    // 关闭设置时：提示词编辑器有未保存修改时先自动保存，再落盘设置。
    function saveSettingsNow(panel, persistOptions = {}) {
        const editor = panel.asyncState.imagePromptEditor;
        clearImagePromptSaveTimer();
        if (editor?.state.dirty) {
            const draftResult = editor.autoSave();
            if (!draftResult.ok) return draftResult;
        }
        return persistSettingsDraft(persistOptions);
    }

    // 后台生图任务读已保存配置：接口地址、密钥、模型等字段改完（change）即落盘，不等关闭设置。
    // 打字途中停顿 800ms 也落盘，不必等失焦；同一面板内只保留最后一次。
    let immediateSaveTimer = null;
    function persistImmediateField(path, { debounce = false } = {}) {
        if (!state.activeSettings || !isImmediateSavePath(path)) return;
        clearTimeout(immediateSaveTimer);
        immediateSaveTimer = null;
        const panel = state.activeSettings;
        const run = () => {
            immediateSaveTimer = null;
            if (state.activeSettings !== panel) return;
            const result = persistSettingsDraft();
            if (result && result.ok === false) reportSettingsFailure(result);
        };
        if (debounce) immediateSaveTimer = setTimeout(run, 800);
        else run();
    }

    function closeSettings() {
        const current = state.activeSettings;
        if (!current) return { ok: true, reason: 'settings-not-open' };
        const saveForClose = () => saveSettingsNow(current, { syncActiveModeFromSettings: current.initialOpenMode !== current.draft.bridge.openMode });
        const saved = saveForClose();
        if (saved.ok === false) {
            if (!current.asyncState.closingRecovery) {
                current.asyncState.closingRecovery = recoverOperation(saveForClose, { signal: current.recoveryController.signal,
                    repeatable: 'save',
                    isActive: () => state.activeSettings === current,
                    global: options.global || globalThis }).then(result => {
                    delete current.asyncState.closingRecovery;
                    if (result?.ok === false || result === false) { reportSettingsFailure(result); return result; }
                    return closeSettings();
                });
            }
            return { ok: true, pending: true, completion: current.asyncState.closingRecovery };
        }
        cancelSearchIndexPrebuild(current);
        state.live2dEditor?.close(true);
        settingsDialogs.cancel();
        if (current.stopVoicesWatch) current.stopVoicesWatch();
        current.stopVoicesWatch = null;
        if (current.dom && typeof current.dom.dispose === 'function') {
            current.dom.dispose();
        }
        unmountNode(current.dom && current.dom.root);
        state.activeSettings = null;
        current.recoveryController.abort();
        settingsPointerDown = false;
        onboarding.onSettingsClosed();
        syncSettingsStagePause();
        scheduleMoodAutoClassify();
        // persistSettingsDraft 已用最新配置同步重绘；消费延迟到图标记即可，避免关页重复构建快照。
        takeReaderStaleBehindSettings();
        playReaderUiSfx('close');
        return { ok: true };
    }

    // 打开设置后趁空闲预建搜索索引，首次按键就不必同步渲染全部页面；关掉设置时取消未执行的预建。
    function scheduleSearchIndexPrebuild(panel) {
        const host = options.global || globalThis;
        const run = () => {
            panel.searchIndexIdle = null;
            if (state.activeSettings !== panel || panel.searchIndex) return;
            ensureSearchIndex();
        };
        if (typeof host.requestIdleCallback === 'function') {
            const id = host.requestIdleCallback(run, { timeout: 4000 });
            panel.searchIndexIdle = { cancel: () => { if (typeof host.cancelIdleCallback === 'function') host.cancelIdleCallback(id); } };
        } else {
            const id = setTimeout(run, 300);
            if (id && typeof id.unref === 'function') id.unref();
            panel.searchIndexIdle = { cancel: () => clearTimeout(id) };
        }
    }

    function cancelSearchIndexPrebuild(panel) {
        const idle = panel && panel.searchIndexIdle;
        panel.searchIndexIdle = null;
        if (idle) idle.cancel();
    }

    // 搜索索引：打开设置后空闲时预建；预建前就搜索则第一次输入时同步建，缓存在本次打开的设置状态上，关掉设置即丢弃。
    function ensureSearchIndex() {
        const current = state.activeSettings;
        if (!current) return null;
        if (!current.searchIndex) {
            cancelSearchIndexPrebuild(current);
            try {
                const indexDraft = normalizeUnifiedSettings(current.draft, undefined, { mutableSource: true });
                current.searchIndex = buildSettingsSearchIndex((page) => renderPageForIndex(current, page, indexDraft));
            } catch (error) {
                try { console.warn('[IGS] 设置搜索索引构建失败：', error); } catch { /* 控制台不可用时忽略 */ }
                current.searchIndex = SETTINGS_SEARCH_INDEX;
            }
        }
        return current.searchIndex;
    }

    function jumpToTarget(rawTarget, entry) {
        const current = state.activeSettings;
        const target = resolveSettingsTarget(rawTarget);
        const asyncState = current.asyncState;
        openSettingsPage(current, target.page);
        asyncState.advancedOpen = { ...(asyncState.advancedOpen || {}) };
        for (const key of target.open) asyncState.advancedOpen[key] = true;
        asyncState.settingsSearch = '';
        rememberSettingsPage(current);
        const result = rerenderSettings({ draftUnchanged: true });
        revealSetting({ ...entry, target });
        return result;
    }

    // open：要自动展开的折叠 key（新手引导用）；不传则不动折叠状态。
    function switchPage(page, open) {
        if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
        openSettingsPage(state.activeSettings, page);
        if (Array.isArray(open) && open.length) {
            const asyncState = state.activeSettings.asyncState;
            asyncState.advancedOpen = { ...(asyncState.advancedOpen || {}) };
            for (const key of open) asyncState.advancedOpen[key] = true;
        }
        state.activeSettings.asyncState.wardrobeFocus = '';
        delete state.activeSettings.asyncState.migrateRows;
        rememberSettingsPage(state.activeSettings);
        return rerenderSettings({ draftUnchanged: true });
    }

    function createSettingsController() {
        return {
            getSnapshot() {
                return state.activeSettings ? cloneData(state.activeSettings.snapshot) : null;
            },
            // 点分类：进该分类的默认页；上次停在这一类里就回到那一页。旧的 basic / reader / scene / image 也认。
            switchTab(tab) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                const page = resolveSettingsPage({ tab });
                const remembered = state.activeSettings.asyncState.pageByCategory && state.activeSettings.asyncState.pageByCategory[String(tab).trim()];
                const keep = isSettingsCategory(tab) && isSettingsPage(remembered) && defaultPageOfCategory(tab) === page;
                openSettingsPage(state.activeSettings, keep ? remembered : page);
                state.activeSettings.asyncState.wardrobeFocus = '';
                rememberSettingsPage(state.activeSettings);
                return rerenderSettings({ draftUnchanged: true });
            },
            switchPage,
            // 旧的子页切换：只作兼容入口，映射到新页面。
            switchImageSubTab(subTab) {
                return switchPage(resolveSettingsPage({ tab: 'image', imageSubTab: subTab }));
            },
            switchReaderSubTab(subTab) {
                return switchPage(resolveSettingsPage({ tab: 'reader', readerSubTab: subTab }));
            },
            switchSceneSubTab(subTab) {
                return switchPage(resolveSettingsPage({ tab: 'scene', sceneSubTab: subTab }));
            },
            // 设置搜索：跳到搜索结果所在页面，并展开所在折叠区。
            goToSetting(id) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                if (id === 'image-prompt-presets'
                    && state.activeSettings.draft.bridge.imageApi.mode !== 'nai')
                    return { ok: false, reason: 'nai-settings-source-required' };
                const entry = (ensureSearchIndex() || SETTINGS_SEARCH_INDEX).find((item) => item.id === id) || SETTINGS_SEARCH_INDEX.find((item) => item.id === id);
                if (!entry) return { ok: false, reason: 'unknown-setting' };
                return jumpToTarget(entry.target, entry);
            },
            // 搜索索引（手写条目 + 自动索引）；第一次取时才按页面渲染建一次，缓存在本次打开的设置状态上。
            getSearchIndex() {
                return state.activeSettings ? ensureSearchIndex() : null;
            },
            // 仪表盘「最近改过」：回到那一项所在页，找得到折叠位置就一并展开。
            goToPath(path, page) {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                const wanted = String(path || '');
                const hit = (ensureSearchIndex() || []).find((item) => item.target.path === wanted && (!isSettingsPage(page) || item.target.page === page));
                const target = hit ? hit.target : { page: isSettingsPage(page) ? page : 'dash', open: [], path: wanted };
                return jumpToTarget(target, { label: '', target });
            },
            setValue(path, value, editOptions) {
                return updateSettingsValue(path, value, editOptions);
            },
            setArtistLibraryField(key, value) {
                touchDraft();
                const panel = state.activeSettings;
                if (!panel) return { ok: false, reason: 'settings-not-open' };
                const result = setArtistLibraryField(panel, key, value);
                if (!result.ok) {
                    (panel.asyncState.artistLibrary ||= {}).status = `操作失败：${result.reason}`;
                }
                rerenderSettings();
                return result;
            },
            setArtistSelection(target, id) {
                touchDraft();
                const panel = state.activeSettings;
                if (!panel) return { ok: false, reason: 'settings-not-open' };
                let result = setArtistSelection(panel, target, id);
                if (result.ok) result = persistSettingsDraft();
                if (!result.ok) (panel.asyncState.artistLibrary ||= {}).status = result.reason;
                rerenderSettings();
                return result;
            },
            // render：true 总是重绘；'auto' 只在字段联动影响其他控件时重绘；false 不重绘。
            setImagePromptField(address, value, { render = true } = {}) {
                touchDraft();
                const panel = state.activeSettings, editor = panel?.asyncState.imagePromptEditor;
                if (panel && panel.draft.bridge.imageApi.mode !== 'nai')
                    return { ok: false, reason: 'nai-settings-source-required' };
                if (!editor) return { ok: false, reason: 'prompt-editor-unavailable' };
                const result = editor.edit(address, value);
                editor.state.status = result.ok ? '' : `字段错误：${describeFailure(result)}`;
                if (render === 'auto' ? result.rerender === true : render) rerenderSettings();
                return result;
            },
            toggle(path) {
                touchDraft();
                const draft = state.activeSettings && state.activeSettings.draft;
                materializeStatsBuild(draft, path);
                const current = getPath(draft, path);
                return updateSettingsValue(path, !current);
            },
            async invoke(action) {
                touchDraft();
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
        touchDraft();
        const draft = state.activeSettings.draft;

        if (path === 'bridge.openMode') {
            const nextMode = normalizeReaderMode(value, draft.bridge);
            setPath(draft, path, nextMode);
            return rerenderSettings();
        }

        // 对话框高度下拉里的「自适应 / 固定」：写 dialogAutoHeight，不动高度比例；选具体比例时顺手关掉自适应。
        if (path === 'readerSettings.skinDialogScale' && (value === 'auto' || value === 'fixed')) {
            setPath(draft, 'readerSettings.dialogAutoHeight', value === 'auto');
            return editOptions.liveInput ? { ok: true } : rerenderSettings();
        }
        // 「战斗」页三选一：虚拟 path，拆成 battleFx / combatExpansion 两个字段；选卡牌战斗走同一套开启前检查，不通过则退回原选项。
        if (path === BATTLE_MODE_PATH) {
            const plan = planBattleMode(value, value === 'card' ? checkCombatExpansionReady({
                api: (options.global || globalThis).AutoCardUpdaterAPI || null,
                autoIllustration: draft.bridge && draft.bridge.autoIllustration,
            }) : null);
            for (const [writePath, writeValue] of plan.writes) setPath(draft, writePath, writeValue);
            if (!plan.ok && plan.message) showSettingsNotice(plan.message);
            rerenderSettings();
            return plan.ok ? { ok: true } : { ok: false, reason: plan.reason, missing: plan.missing };
        }
        // 「仅日常挑战」预设：虚拟 path，写对决类型与日常字段的缺省值。
        if (path === COMBAT_PRESET_PATH) {
            const plan = planCombatPreset(value);
            for (const [writePath, writeValue] of plan.writes) setPath(draft, writePath, writeValue);
            rerenderSettings();
            return { ok: plan.ok };
        }
        // 卡牌战斗开启前检查数据库表与副 LLM；通过后数值系统一并打开，战斗开着时数值系统不能单独关。
        if (path === 'readerSettings.combatExpansion.enabled' && value === true) {
            const ready = checkCombatExpansionReady({
                api: (options.global || globalThis).AutoCardUpdaterAPI || null,
                autoIllustration: draft.bridge && draft.bridge.autoIllustration,
            });
            if (!ready.ok) {
                setPath(draft, path, false);
                showSettingsNotice(ready.message);
                return { ok: false, reason: ready.reason, missing: ready.missing };
            }
            setPath(draft, 'bridge.stats.enabled', true);
        }
        if (path === 'bridge.stats.enabled' && value !== true && draft.readerSettings && draft.readerSettings.combatExpansion && draft.readerSettings.combatExpansion.enabled === true) {
            setPath(draft, path, true);
            showSettingsNotice('卡牌战斗开启时数值系统不能单独关闭');
            rerenderSettings();
            return { ok: false, reason: 'stats-combat-locked' };
        }
        if (path === 'bridge.stats.enabled' && value === true) {
            const api = (options.global || globalThis).AutoCardUpdaterAPI || null;
            const support = probeCombatTableSupport(api);
            if (!support.ok) {
                setPath(draft, path, false);
                showSettingsNotice(api ? `数据库不支持数值系统所需的表：缺少 ${support.missing.join('、')}` : '未检测到数据库（shujuku），无法开启数值系统');
                return { ok: false, reason: support.reason, missing: support.missing };
            }
        }
        materializeStatsBuild(draft, path);
        setPath(draft, path, normalizeSettingsValue(path, value));
        if (path === 'readerSettings.skinDialogScale') setPath(draft, 'readerSettings.dialogAutoHeight', false);
        // 题材包总开关打开时，该包全部细项一起开（defaultOn 通用包的细项本来就默认开，不再逐个写脏草稿）；关掉时细项原样保留。
        if (value === true && path.startsWith('readerSettings.')) {
            const pack = FX_PACKS_ACTIVE.find((p) => !p.defaultOn && `readerSettings.${packSwitchPath(p)}` === path);
            if (pack) for (const kind of pack.kinds) setPath(draft, `readerSettings.dailyFx.${kind}`, true);
        }
        // 台词朗读与角色语气音二选一：打开一个就关掉另一个。
        if (value === true && (path === 'readerSettings.tts.enabled' || path === 'readerSettings.voiceBark.enabled')) {
            setPath(draft, path === 'readerSettings.tts.enabled' ? 'readerSettings.voiceBark.enabled' : 'readerSettings.tts.enabled', false);
        }
        // 主界面选的皮肤记在角色卡上、会盖过全局；用户在这里亲手换风格时以此为准，清掉卡上那份。
        if (path === 'readerSettings.dialogSkin' && state.activeSettings.asyncState && state.activeSettings.asyncState.assetScopeKey) {
            delete draftAssetLibrary(state.activeSettings).dialogSkin;
        }
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
            // 建卡分配数字框：剩余点数与「按分配启用」就地刷新，不整页重绘。
            if (path.startsWith(`${STATS_BUILD_PATH}.`)) refreshStatsBuildStatus(state.activeSettings.dom && state.activeSettings.dom.root, getPath(draft, STATS_BUILD_PATH));
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
        const savedIds = collectGeneratedImageIds(savedAssets);
        state.activeSettings.committedImageIds = savedIds;
        const released = releasedGeneratedImageIds(previousIds, savedAssets, (options.global || globalThis).localStorage, savedIds);
        const imageService = options.generatedAssets;
        if (released.length && imageService && typeof imageService.deleteImages === 'function') {
            const reportDeleteFailure = () => {
                const message = '配置已保存，但部分图片未能从本机清除。';
                if (state.activeSettings) settingsDialogs.alert(message);
                else pageModal.alert(message);
            };
            Promise.resolve().then(() => imageService.deleteImages(released)).then((result) => {
                if (result === false || (result && result.ok === false)) reportDeleteFailure();
            }).catch(reportDeleteFailure);
        }
        // 草稿不重拷：存储那份是从草稿深拷出来的，两边不共享；草稿继续作为设置里唯一可原地改的副本。
        if (state.activeReader) {
            const current = state.activeReader.payload;
            const filterChanged = JSON.stringify(current.sourceFilter) !== JSON.stringify(snapshot.bridge.sourceFilter);
            const formatChanged = JSON.stringify(current.virtualRegex) !== JSON.stringify(snapshot.bridge.virtualRegex);
            const pagingChanged = snapshot.bridge.sentencePaging !== state.activeReader.snapshot?.readerSettings?._sentencePaging
                || snapshot.bridge.dialogueSentencePaging !== state.activeReader.snapshot?.readerSettings?._dialogueSentencePaging;
            if (filterChanged || formatChanged || pagingChanged) {
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
        if (optionsForPersist.spriteAssetChanged === true) invalidateFloorAssetPlan?.();
        rerenderActiveReader({
            syncModeFromSettings: optionsForPersist.syncActiveModeFromSettings === true,
        });
        return result;
    }

    const STATS_ATTRIBUTES = ['健康', '力量', '敏捷', '理智', '观察', '魅力'];
    async function runStatsOp(spec) {
        const op = typeof options.statsOp === 'function' ? options.statsOp : null;
        if (!op) return { ok: false, reason: 'stats-runtime-missing' };
        const [kind, raw = ''] = spec.split(/:(.*)/s);
        // hero-set 的参数是「编码后的技能名|数值」，数值为空表示清除手改。
        // relation-set 的参数是「编码后的角色名|好感,信任,了解[,欲望]」（当前值，用来预填数字框）。
        const [namePart, valuePart = ''] = kind === 'hero-set' || kind === 'relation-set' || kind === 'relation-forced' ? raw.split('|') : [raw];
        const name = namePart ? decodeURIComponent(namePart) : '';
        let result;
        try {
            if (kind === 'generate' || kind === 'backfill' || kind === 'backup') {
                result = await op(kind);
                if (kind === 'generate' && result && result.ok && result.skipped && typeof settingsDialogs.alert === 'function') await settingsDialogs.alert('没有缺数值的角色。');
            }
            else if (kind === 'relation-import') {
                result = await op('relation', 'import-table', '', {});
                if (result && result.ok && typeof settingsDialogs.alert === 'function') await settingsDialogs.alert(`已导入：${result.imported.join('、')}`);
            }
            else if (kind === 'relation-forced') result = await op('relation', 'forced', name, { forced: valuePart === '1' });
            else if (kind === 'hero-set') result = await op('hero', 'set', name, { value: valuePart });
            else if (kind === 'hero-assign') {
                result = await op('hero', 'assign', '', {});
                if (result && result.reason === 'needs-confirm') {
                    result = await settingsDialogs.confirm('重新分配会覆盖已分配与手改的技能值，继续？') ? await op('hero', 'assign', '', { overwrite: true }) : { ok: true, cancelled: true };
                }
            }
            else if (kind === 'skill-attr') {
                const attribute = await settingsDialogs.choose(`「${name}」归入哪项属性？`, STATS_ATTRIBUTES.map((value) => ({ value, label: value })));
                result = attribute ? await op('skill', 'edit', name, { attribute }) : { ok: true, cancelled: true };
            } else if (kind === 'skill-rename') {
                const to = String((await settingsDialogs.prompt(`把「${name}」改名为：`, name)) || '').trim();
                result = to && to !== name ? await op('skill', 'edit', name, { name: to }) : { ok: true, cancelled: true };
            } else if (kind === 'skill-merge') {
                const to = String((await settingsDialogs.prompt(`把「${name}」合并到哪项技能（填技能名）：`, '')) || '').trim();
                result = to ? await op('skill', 'merge', name, { to }) : { ok: true, cancelled: true };
            } else if (kind === 'skill-remove') {
                result = await settingsDialogs.confirm(`删除剧情技能「${name}」？主角已有的数值保留。`) ? await op('skill', 'remove', name) : { ok: true, cancelled: true };
            } else if (kind === 'sheet-edit') {
                const text = String((await settingsDialogs.prompt(`修改「${name}」的一项数值，格式：项目 档位（如「话术 精通」「敏捷 出众」）。技能档：未学、入门、熟练、精通、大师；属性档：很弱、偏弱、普通、出众、顶尖。`, '')) || '').trim();
                const [skill, tier] = text.split(/\s+/);
                result = skill && tier ? await op('sheet', 'edit', name, { skill, tier }) : { ok: true, cancelled: true };
            } else if (kind === 'relation-fill') {
                const busy = typeof settingsDialogs.busy === 'function' ? settingsDialogs.busy('正在按人设计算初始关系，角色较多时需要几十秒。') : null;
                try { result = await op('relation', 'fill-start', '', {}); } finally { if (busy) busy.close(); }
                if (result && result.ok && typeof settingsDialogs.alert === 'function') {
                    await settingsDialogs.alert(result.filled.length ? `已补填初始关系：${result.filled.join('、')}` : '按人设判断，这些角色与主角都还是陌生关系，数值未改动。');
                }
            } else if (kind === 'relation-set') {
                const before = valuePart.split(',').map((v) => (v === '' ? NaN : Number(v)));
                // 第四项是欲望，只有开启 NSFW 后建档的角色才带。
                const dims = ['好感', '信任', '了解', '欲望'].slice(0, Math.max(3, before.length));
                const values = await settingsDialogs.numbers(`修改「${name}」的关系数值`, dims.map((key, i) => ({ key, label: key, value: Number.isFinite(before[i]) ? before[i] : 0, min: key === '欲望' ? 0 : -100, max: 100 })), { okLabel: '保存' });
                // 只提交改动过的项，没改的维度不记手改。
                const payload = values ? Object.fromEntries(dims.filter((key, i) => values[key] !== before[i]).map((key) => [key, values[key]])) : {};
                result = Object.keys(payload).length ? await op('relation', 'set', name, payload) : { ok: true, cancelled: true };
            } else if (kind === 'sheet-regen') {
                result = await settingsDialogs.confirm(`重新生成「${name}」的数值？手改过的内容会被覆盖。`) ? await op('sheet', 'regen', name) : { ok: true, cancelled: true };
            } else if (kind === 'sheet-remove') {
                result = await settingsDialogs.confirm(`删除「${name}」的角色卡？之后按普通人参与检定。`) ? await op('sheet', 'remove', name) : { ok: true, cancelled: true };
            } else result = { ok: false, reason: 'stats-op-unknown' };
        } catch (error) {
            result = { ok: false, reason: 'stats-op-threw', thrown: error };
        }
        if (result && result.ok === false && result.reason && !result.cancelled && typeof settingsDialogs.alert === 'function') {
            const text = { 'stats-no-model': '没有可用的辅助模型，请先在自动插图设置里接好写词模型。', 'stats-generating': '正在生成回复，结束后再试。', 'stats-sheet-edit-invalid': '格式不对，请写成「项目 档位」。', 'stats-relation-invalid': '关系数值须为-100到100的整数。', 'stats-relation-missing': '该角色还没有结算记录，下一楼回复后再改。', 'stats-table-none': '数据库表格里没有可导入的新角色。', 'stats-import-no-floor': '本聊天启用数值后还没有结算过回复，下一楼回复后再导入。', 'stats-inactive': '本聊天未启用数值系统。', 'stats-no-ledger': '本聊天还没有数值存档。', 'stats-start-none': '没有需要补填的角色：已登记角色的关系数值都已定过。', 'stats-start-failed': '补填失败，辅助模型的回复无法解析，可稍后重试。', 'stats-chat-changed': '计算期间切换了聊天，未写入。','stats-hero-skill-invalid': '技能值须为1到99的整数。', 'stats-hero-skills-coc-only': '主角技能分配仅适用于CoC规则。', 'stats-hero-skills-busy': '另一个聊天的分配尚未完成。', 'stats-hero-skills-invalid': '分配失败，回复无法解析。', 'stats-hero-skills-empty': '分配失败，回复中没有有效档位。' }[result.reason];
            if (text) await settingsDialogs.alert(text);
        }
        if (state.activeSettings) rerenderSettings();
        return result || { ok: false };
    }

    // 随身系统存档区操作（重算、清空）与本聊天暂停 / 恢复：交给宿主 options.originOp，结束后重绘。引擎未接入时返回 origin-engine-missing。
    async function runOriginOp(kind) {
        // 宿主没给 originOp 时走接入点登记的引擎（origin-attach.js）；也没登记时返回 origin-engine-missing。
        const op = typeof options.originOp === 'function' ? options.originOp : runAttachedOriginOp;
        let result;
        try {
            if (kind === 'recalc') result = await op('recalc');
            else if (kind === 'reset') result = await settingsDialogs.confirm('清空本聊天的随身系统存档？任务、积分、属性与记录都会移除。') ? await op('reset') : { ok: true, cancelled: true };
            else if (kind === 'pause' || kind === 'resume' || kind === 'import') result = await op(kind);
            else if (kind === 'world') {
                const current = (typeof options.originChat === 'function' ? options.originChat() : originChatStatus()) || {};
                const next = await settingsDialogs.prompt('本聊天的世界名或简述', current.world || '');
                result = next === null ? { ok: true, cancelled: true } : await op('world', next);
            }
            else result = { ok: false, reason: 'origin-op-unknown' };
        } catch (error) {
            result = { ok: false, reason: 'origin-op-threw', thrown: error };
        }
        if (result && result.ok === false && result.reason && !result.cancelled && typeof settingsDialogs.alert === 'function') {
            const text = (typeof result.text === 'string' && result.text.trim())
                || { 'origin-engine-missing': '随身系统尚未就绪，请打开一个聊天后再试。', busy: '系统正在处理上一项请求，请稍后再试。', disabled: '请先开启随身系统。' }[result.reason];
            if (text) await settingsDialogs.alert(text);
        }
        if (state.activeSettings) rerenderSettings();
        return result || { ok: false };
    }

    const recoveringSettingsActions = new Map();
    function anchorCgViewport() {
        const draft = state.activeSettings && state.activeSettings.draft;
        if (!draft) return { ok: false, reason: 'settings-not-open' };
        const live = readWindowViewport(options.global || globalThis);
        const size = resolutionNearCap(live.width, live.height);
        if (!size) {
            showSettingsNotice('没有量到当前宽高');
            return { ok: false, reason: 'viewport-unavailable' };
        }
        const { width, height } = size;
        setPath(draft, 'bridge.autoIllustration.assets.anchoredWidth', normalizeSettingsValue('bridge.autoIllustration.assets.anchoredWidth', width));
        setPath(draft, 'bridge.autoIllustration.assets.anchoredHeight', normalizeSettingsValue('bridge.autoIllustration.assets.anchoredHeight', height));
        rerenderSettings();
        persistImmediateField('bridge.autoIllustration.assets.anchoredWidth');
        showSettingsNotice(`已锚定出图 ${width}×${height}`);
        return { ok: true, width, height };
    }

    function handleSettingsAction(action) {
        if (action === 'anchor-cg-viewport') return Promise.resolve(anchorCgViewport());
        if (String(action).startsWith('origin-op:')) return runOriginOp(String(action).slice('origin-op:'.length));
        if (action === 'origin-chat-pause') return runOriginOp('pause');
        if (action === 'origin-chat-resume') return runOriginOp('resume');
        if (String(action).startsWith('live2d-edit:')) return Promise.resolve(openLive2dManager?.(decodeURIComponent(String(action).slice('live2d-edit:'.length))));
        // 数值系统提示词「恢复默认」：清空覆盖值，规范化后回到默认模板（§9）。
        if (String(action).startsWith('stats-prompt-reset:')) {
            const id = String(action).slice('stats-prompt-reset:'.length);
            if (!/^[a-zA-Z]+$/.test(id)) return Promise.resolve({ ok: false, reason: 'stats-prompt-unknown' });
            return Promise.resolve(updateSettingsValue(`bridge.stats.prompts.${id}`, ''));
        }
        if (action === 'combat-rule-prompt-reset') return Promise.resolve(updateSettingsValue('readerSettings.combatExpansion.rulePrompt', ''));
        // 敌人图集：只在用户点击时才下载或删除；管理器首次使用时才创建。
        if (action === 'combat-enemy-atlas-download' || action === 'combat-enemy-atlas-remove') {
            const atlas = ensureEnemyAtlas(options.global || globalThis);
            const job = action === 'combat-enemy-atlas-download' ? atlas.download() : atlas.remove();
            return Promise.resolve(job).then((result) => { if (state.activeSettings) rerenderSettings(); return result; });
        }
        // 失效提示词提醒「知道了」：之后不再显示。
        if (action === 'stats-prompt-stale-ack') return Promise.resolve(updateSettingsValue('bridge.stats.staleNoticeSeen', true));
        // 建档方式（快速 / 手动等）：交给运行时，结束后重绘。
        if (String(action).startsWith('stats-build-mode:')) {
            let result;
            try {
                result = typeof options.statsChatAction === 'function'
                    ? options.statsChatAction('mode', { mode: String(action).slice('stats-build-mode:'.length) })
                    : { ok: false, reason: 'stats-runtime-missing' };
            } catch (error) {
                result = { ok: false, reason: 'stats-chat-action-threw', thrown: error };
            }
            if (state.activeSettings) rerenderSettings();
            return Promise.resolve(result || { ok: false, reason: 'stats-runtime-missing' });
        }
        // 变动记录「按时间 / 按角色」：只是界面视图，记在折叠状态里，不进设置。
        if (String(action).startsWith('stats-log-view:')) {
            if (state.activeSettings && state.activeSettings.asyncState) {
                const asyncState = state.activeSettings.asyncState;
                asyncState.advancedOpen = { ...(asyncState.advancedOpen || {}), 'stats-log-by-role': String(action).endsWith(':role') };
                rerenderSettings();
            }
            return Promise.resolve({ ok: true });
        }
        // 数值 v2 存档区操作（角色卡、剧情技能、补全、旧版备份）：交给运行时，结束后重绘。
        if (String(action).startsWith('stats-op:')) return runStatsOp(String(action).slice('stats-op:'.length));
        // 适配版表格模板下载（§8C）。
        // 推送映射「确认映射」：给当前模板指纹写一个空覆盖，之后不再提示「新的表格模板」（§8B 第 5 条）。
        if (String(action).startsWith('stats-mapping-confirm:')) {
            const fp = String(action).slice('stats-mapping-confirm:'.length);
            if (!/^tpl-[0-9a-f]{1,8}$/.test(fp)) return Promise.resolve({ ok: false, reason: 'stats-mapping-unknown' });
            const draft = state.activeSettings && state.activeSettings.draft;
            const existing = draft && draft.bridge && draft.bridge.stats && draft.bridge.stats.push && draft.bridge.stats.push.mappings && draft.bridge.stats.push.mappings[fp];
            return Promise.resolve(updateSettingsValue(`bridge.stats.push.mappings.${fp}`, existing && typeof existing === 'object' ? { ...existing } : {}));
        }
        if (action === 'stats-template-download') {
            return Promise.resolve()
                .then(() => downloadStatsTemplate((options.global || globalThis).document))
                .catch((error) => ({ ok: false, reason: 'stats-template-download-threw', thrown: error }));
        }
        // 适配版模板直接导入数据库：global 存进模板预设库；chat 替换当前聊天的模板，先确认。
        if (action === 'stats-template-import' || action === 'stats-template-apply-chat') {
            return (async () => {
                const api = (options.global || globalThis).AutoCardUpdaterAPI || null;
                if (!api || typeof api.importTemplateFromData !== 'function') {
                    showSettingsNotice('未检测到数据库（shujuku）的模板导入接口，请改用下载后手动导入');
                    return { ok: false, reason: 'missing-api' };
                }
                const client = createShujukuClient(api);
                const fetched = await fetchStatsTemplate();
                if (!fetched.ok) {
                    showSettingsNotice('适配版表格模板读取失败，请稍后重试或改用下载');
                    return fetched;
                }
                const scope = action === 'stats-template-apply-chat' ? 'chat' : 'global';
                if (scope === 'chat') {
                    const current = client.getTableTemplate();
                    const hidden = current.ok ? statsTemplateChatDiff(current.data, fetched.data).hidden : [];
                    const extra = hidden.length ? `\n当前聊天的以下表不在模板中，导入后将被隐藏：${hidden.join('、')}` : '';
                    if (!await settingsDialogs.confirm(`以适配版模板替换当前聊天的表格模板？已有数据保留。${extra}`, { okLabel: '替换' })) return { ok: true, cancelled: true };
                }
                const result = await importStatsTemplate(client, fetched.data, scope);
                showSettingsNotice(result.ok
                    ? (scope === 'chat' ? '已用于本聊天' : `已存入数据库模板预设「${STATS_TEMPLATE_PRESET_NAME}」`)
                    : `导入失败${result.message ? `：${result.message}` : ''}`);
                return result;
            })().catch((error) => ({ ok: false, reason: 'stats-template-import-threw', thrown: error }));
        }
        // 旧聊天迁移到新表结构：先备份旧表进 chatMetadata，再换模板并搬数据；不自动执行。
        if (action === 'stats-table-migrate') {
            return (async () => {
                const global = options.global || globalThis;
                const api = global.AutoCardUpdaterAPI || null;
                if (!api || typeof api.importTemplateFromData !== 'function') {
                    showSettingsNotice('未检测到数据库（shujuku）的模板导入接口，无法迁移');
                    return { ok: false, reason: 'missing-api' };
                }
                if (!await settingsDialogs.confirm('把本聊天迁移到新表结构？迁移前会备份旧表；秘密与属性格搬到新位置，随身财物不搬。', { okLabel: '迁移' })) return { ok: true, cancelled: true };
                const fetched = await fetchStatsTemplate();
                if (!fetched.ok) {
                    showSettingsNotice('适配版表格模板读取失败，请稍后重试');
                    return fetched;
                }
                const backup = (text) => {
                    const ctx = getSillyTavernContext(global);
                    if (!ctx || !ctx.chatMetadata || typeof ctx.chatMetadata !== 'object') return { ok: false, reason: 'no-chat-metadata' };
                    ctx.chatMetadata[MIGRATE_BACKUP_KEY] = text;
                    const persist = typeof ctx.saveMetadata === 'function' ? ctx.saveMetadata : null;
                    if (!persist) return { ok: false, reason: 'no-save-metadata' };
                    persist.call(ctx);
                    return { ok: true };
                };
                const result = await migrateTables(createShujukuClient(api), fetched.data, { backup });
                if (result.skipped) showSettingsNotice('本聊天已是新表结构或没有角色数值表，无需迁移');
                else if (result.ok) {
                    showSettingsNotice(`迁移完成：补写 ${result.wrote} 格，新增 ${result.inserted} 行`);
                    if (result.warnings.some((w) => w.code === 'migrate-belongings-not-moved') && typeof settingsDialogs.alert === 'function') await settingsDialogs.alert('主角信息表原有的「随身财物」未迁移：钱请在角色数值表的金钱里填，物品请在物品表里补记。旧内容已在备份里。');
                } else showSettingsNotice(`迁移未完成：${result.reason}${result.backedUp ? '（旧表已备份，可重试）' : ''}`);
                return result;
            })().catch((error) => ({ ok: false, reason: 'stats-table-migrate-threw', thrown: error }));
        }
        // 数值系统「本聊天」启用 / 暂停：直接交给运行时，结果重绘后反映到按钮与状态说明。
        if (action === 'stats-chat-enable' || action === 'stats-chat-disable' || action === 'stats-chat-enable-build') {
            let result;
            try {
                // 「按分配启用」用草稿里的分配（可能还没保存），不读已落盘的设置。
                const draftStats = state.activeSettings && state.activeSettings.draft && state.activeSettings.draft.bridge && state.activeSettings.draft.bridge.stats;
                // 世界观附加技能按设置页当前世界观计入，与建卡区显示的候选一致。
                const draftBridge = state.activeSettings && state.activeSettings.draft && state.activeSettings.draft.bridge;
                const scopeKey = state.activeSettings && state.activeSettings.asyncState && state.activeSettings.asyncState.assetScopeKey;
                const worldAssets = draftBridge ? (scopeKey ? effectiveSceneAssets(draftBridge.sceneAssets, scopeKey) : draftBridge.sceneAssets) : null;
                const payload = action === 'stats-chat-enable-build' ? { build: draftStats ? draftStats.build : undefined, worldview: resolveWorldview(worldAssets) } : undefined;
                result = typeof options.statsChatAction === 'function'
                    ? options.statsChatAction(action === 'stats-chat-disable' ? 'disable' : 'enable', payload)
                    : { ok: false, reason: 'stats-runtime-missing' };
            } catch (error) {
                result = { ok: false, reason: 'stats-chat-action-threw', thrown: error };
            }
            if (state.activeSettings) rerenderSettings();
            return Promise.resolve(result || { ok: false, reason: 'stats-runtime-missing' });
        }
        if (recoveringSettingsActions.has(action)) return recoveringSettingsActions.get(action);
        const panel = state.activeSettings;
        if (!panel) return Promise.resolve({ ok: true, cancelled: true });
        const checkpoint = createOperationCheckpoint();
        let dialogIndex = 0, recoveryProgress;
        const dialogs = new Proxy(settingsDialogs, { get(target, method) {
            const fn = target[method];
            if (typeof fn !== 'function') return fn;
            if (['confirm', 'prompt', 'edit', 'choose', 'pick'].includes(method))
                return (...args) => checkpoint.step(`dialog:${dialogIndex++}`, () => fn.apply(target, args));
            return fn.bind(target);
        } });
        const recoveryOptions = { ...options,
            generatedAssets: checkpointService(options.generatedAssets, checkpoint, 'assets'),
            itemImages: checkpointService(options.itemImages, checkpoint, 'items') };
        const job = recoverOperation(async () => {
            dialogIndex = 0;
            return performSettingsAction(action, recoveryOptions, dialogs, checkpoint);
        }, {
            global: options.global || globalThis,
            signal: panel.recoveryController.signal,
            isActive: () => state.activeSettings === panel,
            onRecover({ result, phase, message }) {
                panel.asyncState.operationRecovery = { action, phase, reason: String(result?.reason || 'operation-pending') };
                recoveryProgress ||= beginSettingsProgress(() => panel.dom?.root, '正在自动恢复操作…');
                recoveryProgress.update(message || '正在修复并续接原操作…');
                // 保留现有表单、文件和已完成结果，下一轮从原操作继续。
                rerenderSettings();
            },
            async repair() {
                await Promise.allSettled([options.generatedAssets?.retryMetadata?.(), options.itemImages?.retryMetadata?.()]);
            },
        }).then(result => {
            if (result?.ok && !result.cancelled && ['image-cache-clear', 'purge-asset-cache'].includes(action))
                wakeRecoveringOperations(options.global || globalThis, { type: 'storage-capacity-changed' });
            return result;
        }).finally(() => {
            checkpoint.clear();
            recoveryProgress?.end();
            delete panel.asyncState.operationRecovery;
            recoveringSettingsActions.delete(action);
        });
        recoveringSettingsActions.set(action, job);
        return job;
    }

    async function performSettingsAction(action, recoveryOptions = options, recoveryDialogs = settingsDialogs, checkpoint) {
        if (action.startsWith('artist-library:')) {
            const panel = state.activeSettings;
            if (!panel) return { ok: false, reason: 'settings-not-open' };
            if (panel.asyncState.artistLibraryBusy) return { ok: false, reason: '画师操作正在进行' };
            panel.asyncState.artistLibraryBusy = true;
            try {
                const result = await handleArtistLibraryAction(action, {
                    panel, dialogs: recoveryDialogs, global: options.global || globalThis,
                    readFile: global => checkpoint.step('file:artist-import', () => pickImagePromptFile(global)),
                    persistSettingsDraft, isCurrent: () => state.activeSettings === panel,
                });
                if (state.activeSettings === panel) {
                    const libraryState = panel.asyncState.artistLibrary ||= {};
                    if (!result.ok) libraryState.status = `操作失败：${result.reason}`;
                    else if (result.cancelled) libraryState.status = '已取消；配置未修改。';
                    rerenderSettings();
                }
                return result;
            } finally {
                panel.asyncState.artistLibraryBusy = false;
            }
        }
        if (action.startsWith('image-prompt:')) {
            const panel = state.activeSettings, editor = panel?.asyncState.imagePromptEditor;
            if (panel && panel.draft.bridge.imageApi.mode !== 'nai')
                return { ok: false, reason: 'nai-settings-source-required' };
            if (!editor) return { ok: false, reason: 'prompt-editor-unavailable' };
            if (panel.asyncState.imagePromptBusy) return { ok: false, reason: 'prompt-editor-busy' };
            // 动作（含切换提示词组）开始前先冲刷并清掉防抖计时器。
            flushImagePromptSave();
            panel.asyncState.imagePromptBusy = true;
            try {
                const result = await handleImagePromptAction(action, {
                    editor, dialogs: recoveryDialogs, global: options.global || globalThis,
                    readFile: global => checkpoint.step('file:prompt-import', () => pickImagePromptFile(global)),
                    isCurrent: () => state.activeSettings === panel && panel.asyncState.imagePromptEditor === editor
                        && panel.draft.bridge.imageApi.mode === 'nai',
                });
                if (state.activeSettings === panel) {
                    editor.state.status = result.ok ? '' : `操作失败：${describeFailure(result, editor.state.preset?.data)}`;
                    rerenderSettings();
                }
                return result;
            } finally {
                panel.asyncState.imagePromptBusy = false;
            }
        }
        if (action.startsWith('wi-filter:')) {
            const panel = state.activeSettings;
            if (!panel) return { ok: false, reason: 'settings-not-open' };
            return handleWorldInfoFilterAction(action, { panel, global: options.global || globalThis,
                persistSettingsDraft, rerenderSettings, isCurrent: () => state.activeSettings === panel });
        }
        if (action.startsWith('model-profile:')) {
            const panel = state.activeSettings;
            if (!panel) return { ok: false, reason: 'settings-not-open' };
            return handleModelProfileAction(action, { panel, dialogs: recoveryDialogs, global: options.global || globalThis,
                persistSettingsDraft, rerenderSettings, isCurrent: () => state.activeSettings === panel });
        }
        const onboardingResult = onboarding.handleAction(action);
        if (onboardingResult) return onboardingResult;
        return runSettingsAction(action, {
            state,
            options: { ...recoveryOptions, recoveryCheckpoint: checkpoint, openMatteEditor, openCgGallery },
            closeSettings,
            persistSettingsDraft,
            rerenderSettings,
            buildRegexPreview,
            dialogs: recoveryDialogs,
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
        scheduleFontGuard(root);
        root.addEventListener('click', async (event) => {
            // 窄屏侧边栏：☰ 和遮罩切换抽屉，开关记在遮罩根节点上（重绘不会丢）。
            const navToggle = event.target.closest('[data-nav-toggle]');
            if (navToggle) {
                setNavOpen(root, !isNavOpen(root));
                return;
            }
            const category = event.target.closest('[data-cat]');
            if (category) {
                setNavOpen(root, false);
                controller.switchTab(category.getAttribute('data-cat'));
                return;
            }
            const pageTab = event.target.closest('[data-page]');
            if (pageTab) {
                controller.switchPage(pageTab.getAttribute('data-page'));
                return;
            }
            const recent = event.target.closest('[data-recent-path]');
            if (recent) {
                controller.goToPath(recent.getAttribute('data-recent-path'), recent.getAttribute('data-recent-page'));
                return;
            }
            const legacyTab = event.target.closest('[data-tab]');
            if (legacyTab) {
                controller.switchTab(legacyTab.getAttribute('data-tab'));
                return;
            }
            const imageSubTab = event.target.closest('[data-image-subtab]');
            if (imageSubTab) {
                controller.switchImageSubTab(imageSubTab.getAttribute('data-image-subtab'));
                return;
            }
            const readerSubTab = event.target.closest('[data-reader-subtab]');
            if (readerSubTab) {
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
                noteRecentChange(sw, sw.getAttribute('data-switch'));
                controller.toggle(sw.getAttribute('data-switch'));
                return;
            }
            const segment = event.target.closest('[data-segment-path]');
            if (segment) {
                noteRecentChange(segment, segment.getAttribute('data-segment-path'));
                controller.setValue(segment.getAttribute('data-segment-path'), segment.getAttribute('data-segment-value'));
                persistImmediateField(segment.getAttribute('data-segment-path'));
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
                    if (url) showSpritePreviewOverlay(root, url, action.getAttribute('data-preview-note') || '');
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
                        showSettingsNotice(actName.startsWith('gen-temp-accept:') ? '正在入库，请稍候。' : '这一张仍在生成，完成后会自动替换。');
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
            const voiceSearch = target.getAttribute('data-tts-voice-search');
            if (voiceSearch !== null) {
                const queries = state.activeSettings.asyncState.ttsVoiceSearch || (state.activeSettings.asyncState.ttsVoiceSearch = Object.create(null));
                queries[voiceSearch] = target.value;
                applyTtsVoiceSearch(target);
                return;
            }
            const promptField = target.getAttribute('data-image-prompt-field');
            if (promptField !== null && target.tagName !== 'SELECT' && target.type !== 'checkbox') {
                const edited = controller.setImagePromptField(promptField, target.value, { render: false });
                const editor = state.activeSettings?.asyncState.imagePromptEditor;
                if (editor) {
                    showImagePromptStatus(root, editor);
                    if (edited?.ok) scheduleImagePromptSave(root);
                }
                return;
            }
            // 设置搜索只就地刷新结果列表，不写草稿、不整页重绘，保留输入焦点与软键盘。
            if (target.getAttribute('data-settings-search') !== null) {
                const list = root.querySelector('[data-settings-search-results]');
                const index = target.value && String(target.value).trim() ? ensureSearchIndex() || SETTINGS_SEARCH_INDEX : SETTINGS_SEARCH_INDEX;
                // 提示词组编辑器只在内置 NAI 下渲染，外部图像来源不给找不到的入口。
                const nai = state.activeSettings?.draft?.bridge?.imageApi?.mode === 'nai';
                if (list) list.innerHTML = renderSettingsSearchResults(target.value,
                    nai ? index : index.filter(entry => !entry.target?.open?.includes('image-prompt-editor')));
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
            const ttsBatch = target.getAttribute('data-tts-batch');
            if (ttsBatch) {
                const batches = state.activeSettings.asyncState.ttsBatch || (state.activeSettings.asyncState.ttsBatch = {});
                batches[ttsBatch] = { open: true, text: target.value };
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
                if (target.tagName === 'TEXTAREA') updateCharCounts(root, path, target.value);
                controller.setValue(path, target.value, { liveInput: true });
                persistImmediateField(path, { debounce: true });
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
                if (!CHARACTER_DNA_EDIT_FIELDS.includes(dnaField) || ['__proto__', 'constructor', 'prototype'].includes(dnaChar)) return;
                rememberAssetScope(state.activeSettings, getSillyTavernContext(options.global || globalThis));
                const assets = draftAssetLibrary(state.activeSettings, { collections: ASSET_CHARACTER_FIELDS, name: dnaChar });
                const dnaMap = assets.characterDna && typeof assets.characterDna === 'object' && !Array.isArray(assets.characterDna)
                    ? assets.characterDna : (assets.characterDna = {});
                const entry = Object.hasOwn(dnaMap, dnaChar) && dnaMap[dnaChar] && typeof dnaMap[dnaChar] === 'object' ? dnaMap[dnaChar] : (dnaMap[dnaChar] = {});
                dnaMap[dnaChar] = editCharacterDnaField(entry, dnaField, target.value);
                state.activeSettings.snapshot.draft = state.activeSettings.draft;
                return;
            }
            // 原装迁移清单：服装名 / 别名 / 说明只改草稿，不重绘（保焦点），点「迁移」时才落盘。
            const migChar = target.getAttribute('data-mig-char');
            const migField = target.getAttribute('data-mig-field');
            if (migChar && migField) {
                const rows = state.activeSettings.asyncState.migrateRows;
                const row = Array.isArray(rows) ? rows.find((item) => item.character === migChar) : null;
                if (row) {
                    if (migField === 'words') row.words = splitMigrationWords(target.value);
                    else if (migField === 'name' || migField === 'note') row[migField] = String(target.value || '');
                    state.activeSettings.snapshot.draft = state.activeSettings.draft;
                }
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
            const target = event.target;
            // 数值页「我的角色」的技能值输入：不进设置草稿，直接写聊天存档。
            const heroSkill = target?.getAttribute?.('data-stats-hero-skill');
            if (heroSkill != null) {
                controller.invoke(`stats-op:hero-set:${encodeURIComponent(heroSkill)}|${String(target.value).trim()}`);
                return;
            }
            const artistSelection = target?.getAttribute?.('data-artist-selection');
            if (artistSelection != null) {
                controller.setArtistSelection(artistSelection, target.value);
                return;
            }
            const artistField = target?.getAttribute?.('data-artist-library-field');
            if (artistField != null) {
                controller.setArtistLibraryField(artistField, target.value);
                return;
            }
            if (target?.getAttribute && state.activeSettings?.asyncState.imagePromptEditor) {
                const editor = state.activeSettings.asyncState.imagePromptEditor;
                const address = target.getAttribute('data-image-prompt-field');
                if (address !== null) {
                    controller.setImagePromptField(address, target.type === 'checkbox' ? target.checked : target.value, { render: 'auto' });
                    flushImagePromptSave(root);
                    return;
                }
                if (target.getAttribute('data-image-prompt-select') !== null) {
                    if (target.value) controller.invoke(`image-prompt:select:${encodeURIComponent(target.value)}`);
                    return;
                }
                const formatAdd = target.getAttribute('data-image-prompt-format-add');
                if (formatAdd !== null) {
                    const [group, ...rest] = formatAdd.split('|');
                    // 新添加的场合默认展开。
                    if (target.value && state.activeSettings) {
                        const asyncState = state.activeSettings.asyncState;
                        asyncState.advancedOpen = { ...(asyncState.advancedOpen || {}), [`perf-ip-occrow-${group}-${rest.join('|')}-${target.value}`]: true };
                    }
                    if (target.value) controller.invoke(`image-prompt:format-add:${encodeURIComponent(group)}:${encodeURIComponent(rest.join('|'))}:${encodeURIComponent(target.value)}`);
                    return;
                }
                const importId = target.getAttribute('data-image-prompt-import-choice');
                if (importId !== null) {
                    editor.state.importChoices[importId] = target.value; return;
                }
            }
            const profileKind = target?.getAttribute?.('data-model-profile-select');
            if (profileKind) {
                // 下拉选中即切换：写入草稿并落盘，后台任务随即改用新预设。
                if (!state.activeSettings) return;
                setModelProfileSelection(state.activeSettings, profileKind, target.value);
                if (target.value) controller.invoke(`model-profile:apply:${profileKind}`);
                return;
            }
            const modelSync = event.target && event.target.getAttribute ? event.target.getAttribute('data-model-sync') : '';
            if (modelSync) {
                controller.setValue(modelSync, event.target.value);
                persistImmediateField(modelSync);
                return;
            }
            // 角色学院 / 声线下拉：交给动作层写草稿并保存（input 监听不处理 SELECT）。
            const charSelect = event.target && event.target.getAttribute ? event.target : null;
            const charHouse = charSelect ? charSelect.getAttribute('data-char-house') : null;
            if (charHouse) {
                controller.invoke(`char-house:${encodeURIComponent(charHouse)}:${encodeURIComponent(charSelect.value || '')}`);
                return;
            }
            const charNameColor = charSelect ? charSelect.getAttribute('data-char-name-color') : null;
            if (charNameColor) {
                controller.invoke(`char-name-color:${encodeURIComponent(charNameColor)}:${encodeURIComponent(charSelect.value || '')}`);
                return;
            }
            // 声音库条目：改完（失焦或回车）才保存。
            const voiceFolder = charSelect?.getAttribute('data-tts-folder-move');
            if (voiceFolder) {
                controller.invoke(`tts-voice-folder-move:${voiceFolder}:${encodeURIComponent(charSelect.getAttribute('data-asset-name') || '')}:${encodeURIComponent(charSelect.value || '')}`);
                return;
            }
            const voiceLib = charSelect ? charSelect.getAttribute('data-tts-voice') : null;
            if (voiceLib) {
                controller.invoke(`tts-voice-edit:${voiceLib}:${charSelect.getAttribute('data-voice-index')}:${charSelect.getAttribute('data-voice-part')}:${encodeURIComponent(charSelect.value || '')}`);
                return;
            }
            const voiceField = !charSelect ? '' : charSelect.hasAttribute('data-char-voice') ? 'pack'
                : charSelect.hasAttribute('data-char-voice-pitch') ? 'pitch'
                    : charSelect.hasAttribute('data-char-voice-speed') ? 'speed'
                        : charSelect.hasAttribute('data-char-voice-tts') ? 'tts'
                            : charSelect.hasAttribute('data-char-voice-ttsThought') ? 'ttsThought'
                            : charSelect.hasAttribute('data-char-voice-ttsVolume') ? 'ttsVolume'
                                : charSelect.hasAttribute('data-char-voice-ttsSpeed') ? 'ttsSpeed'
                                    : charSelect.hasAttribute('data-char-voice-ttsThoughtSpeed') ? 'ttsThoughtSpeed'
                                        : charSelect.hasAttribute('data-char-voice-ttsThoughtVolume') ? 'ttsThoughtVolume'
                                : charSelect.hasAttribute('data-char-voice-ttsGender') ? 'ttsGender'
                                : charSelect.hasAttribute('data-char-voice-ttsStyle') ? 'ttsStyle' : '';
            if (voiceField) {
                const voiceChar = charSelect.getAttribute(voiceField === 'pack' ? 'data-char-voice' : `data-char-voice-${voiceField}`) || '';
                controller.invoke(`char-voice:${voiceField}:${encodeURIComponent(voiceChar)}:${encodeURIComponent(charSelect.value || '')}`);
                return;
            }
            const creatureChar = charSelect ? charSelect.getAttribute('data-char-creature') : null;
            if (creatureChar) {
                const creatureField = charSelect.getAttribute('data-creature-field') || '';
                const creatureValue = charSelect.type === 'checkbox' ? String(charSelect.checked) : charSelect.value || '';
                controller.invoke(`char-creature:${creatureField}:${encodeURIComponent(creatureChar)}:${encodeURIComponent(creatureValue)}`);
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
            const formChar = event.target && event.target.getAttribute ? event.target.getAttribute('data-outfit-form-char') : '';
            if (formChar) {
                controller.invoke(`scene-set-outfit-form:${[formChar, event.target.getAttribute('data-outfit-form') || '', event.target.value, event.target.getAttribute('data-outfit-form-field') || 'gender'].map((value) => encodeURIComponent(value || '')).join(':')}`);
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
            if (event.target && event.target.getAttribute && event.target.getAttribute('data-carry-phone') !== null) {
                controller.invoke(event.target.checked ? 'carry-phone:on' : 'carry-phone:off');
                return;
            }
            if (event.target && event.target.getAttribute && event.target.getAttribute('data-carry-phone-prompt') !== null) {
                controller.invoke('carry-phone-prompt:' + encodeURIComponent(String(event.target.value || '')));
                return;
            }
            const horrorKind = event.target && event.target.getAttribute ? event.target.getAttribute('data-horror-select') : null;
            if (horrorKind === 'style' || horrorKind === 'gore') {
                controller.invoke(`horror-${horrorKind}:` + String(event.target.value || ''));
                return;
            }
            const path = event.target && event.target.getAttribute ? event.target.getAttribute('data-path') : '';
            if (path) noteRecentChange(target, path);
            if (event.target && event.target.type === 'range' && !/^readerSettings\.(typewriter\.sound|statusHud\.position)\./.test(path || '')) return;
            if (!path) return;
            controller.setValue(path, target.value, { liveInput: target.tagName !== 'SELECT' && target.type !== 'color' });
            persistImmediateField(path);
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
        // 工具栏「按钮管理」：按住 ☰ 拖动换行，松手提交顺序；没拖动时仍按点击上移处理。
        let btnDrag = null;
        const btnRowId = (row) => {
            const handle = row && row.querySelector ? row.querySelector('.igs-btn-mgr-handle') : null;
            return handle ? String(handle.getAttribute('data-action') || '').replace(/^toolbar-move-up:/, '') : '';
        };
        root.addEventListener('pointerdown', (event) => {
            const handle = event.target && event.target.closest ? event.target.closest('.igs-btn-mgr-handle') : null;
            const row = handle && handle.closest('.igs-btn-mgr-row');
            if (row && row.parentNode) btnDrag = { row, list: row.parentNode, startY: Number(event.clientY) || 0, moved: false };
        });
        root.addEventListener('pointermove', (event) => {
            if (!btnDrag) return;
            const y = Number(event.clientY) || 0;
            if (!btnDrag.moved && Math.abs(y - btnDrag.startY) < 6) return;
            btnDrag.moved = true;
            if (event.cancelable) event.preventDefault();
            for (const other of btnDrag.list.children) {
                if (other === btnDrag.row) continue;
                const rect = other.getBoundingClientRect();
                if (y < rect.top || y > rect.bottom) continue;
                btnDrag.list.insertBefore(btnDrag.row, y < rect.top + rect.height / 2 ? other : other.nextSibling);
                break;
            }
        });
        const btnDragEnd = () => {
            const drag = btnDrag;
            btnDrag = null;
            if (!drag || !drag.moved) return;
            const swallow = (event) => { event.stopPropagation(); event.preventDefault(); };
            root.addEventListener('click', swallow, true);
            (doc.defaultView || globalThis).setTimeout(() => root.removeEventListener('click', swallow, true), 0);
            controller.invoke('toolbar-reorder:' + Array.from(drag.list.children, btnRowId).filter(Boolean).join(','));
        };
        root.addEventListener('pointerup', btnDragEnd);
        root.addEventListener('pointercancel', btnDragEnd);
        root.addEventListener('pointerdown', pointerDown, true);
        root.addEventListener('pointerup', pointerUp, true);
        root.addEventListener('pointercancel', pointerUp, true);
        // 草稿修订号：用户操作（输入、改选、点按钮等）都可能原地改草稿，捕获阶段先递增；纯导航点击（换分类、换页、跳转）不碰草稿，放过。
        const DRAFT_EVENTS = ['input', 'change', 'keydown', 'paste', 'cut', 'drop', 'compositionend', 'focusout', 'click', 'dblclick', 'contextmenu', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dragend', 'touchend'];
        const PURE_NAV = '[data-cat],[data-page],[data-tab],[data-image-subtab],[data-reader-subtab],[data-scene-subtab],[data-setting-go],[data-recent-path],[data-nav-toggle]';
        for (const type of DRAFT_EVENTS) {
            root.addEventListener(type, (event) => {
                const el = event.target;
                if (el && typeof el.closest === 'function' && el.closest(PURE_NAV) && !el.closest('[data-action]')) return;
                touchDraft();
            }, true);
        }
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
            // 世界书筛选：首次展开时读当前启用的书，之后重绘不再自动读；收起不重绘。
            if (key === WORLD_INFO_FILTER_GROUP) {
                if (target.open) handleSettingsAction('wi-filter:open').catch(() => {});
                return;
            }
            if (key.startsWith('image-prompt-') || key.startsWith('perf-ip-')) {
                if (!target.open) flushImagePromptSave(root);
                // 折叠的组不渲染内容：展开时重绘一次补出内容。
                else if (key.startsWith('image-prompt-group-')) rerenderSettings({ draftUnchanged: true });
            }
            // 敌人立绘管理折叠时不渲染行：展开时重绘一次补出内容。
            if (key === 'combat-enemy-sprites' && target.open) rerenderSettings({ draftUnchanged: true });
        }, true);
        root.addEventListener('keydown', (event) => {
            if (onboarding.keydown(event, doc)) return;
            const recording = state.activeSettings && state.activeSettings.asyncState && state.activeSettings.asyncState.shortcutRecording;
            if (recording) {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === 'Escape') {
                    state.activeSettings.asyncState.shortcutRecording = '';
                    rerenderSettings();
                    return;
                }
                const combo = eventToShortcut(event);
                if (combo) controller.invoke(`shortcut-set:${recording}:${combo}`);
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                if (isNavOpen(root)) { setNavOpen(root, false); return; }
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

    // 「最近改过」：用户改了某一项时记一笔（path / 标签 / 所在页）。只在事件里写，失败静默。
    function noteRecentChange(target, path) {
        try {
            const current = state.activeSettings;
            if (!current || !path) return;
            const label = settingsRecentLabel(target);
            if (!label) return;
            recordSettingsRecent((options.global || globalThis).localStorage, { path, label, page: currentSettingsPage(current) });
        } catch { /* 记录失败不影响设置本身 */ }
    }

    // 重绘会沿用上一页的滚动位置，跳到别的分页后停在随机位置：这里改为滚到目标项并闪一下，找不到就回顶部。
    function revealSetting(entry) {
        const root = state.activeSettings && state.activeSettings.dom && state.activeSettings.dom.root;
        const body = root && root.querySelector('.igs-settings-body');
        if (!body) return;
        const node = findSettingNode(body, entry);
        if (!node || typeof node.getBoundingClientRect !== 'function' || typeof body.getBoundingClientRect !== 'function') {
            body.scrollTop = 0;
            return;
        }
        body.scrollTop = Math.max(0, body.scrollTop + node.getBoundingClientRect().top - body.getBoundingClientRect().top - 48);
        if (!node.classList) return;
        node.classList.add('igs-settings-search-flash');
        (options.global || globalThis).setTimeout(() => node.classList.remove('igs-settings-search-flash'), 1600);
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
        // 换了页面就回到顶部，同一页内重绘沿用滚动位置。
        const pageChanged = current.renderedPage !== snapshot.page;
        current.renderedPage = snapshot.page;
        const nextBody = container.querySelector('.igs-settings-body');
        if (nextBody && pageChanged) nextBody.scrollTop = 0;
        else if (nextBody && scrollTop) nextBody.scrollTop = scrollTop;
        restoreTtsVoiceSearch(container, current.asyncState.ttsVoiceSearch);
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
        withCharacterDnaDraftSync: target => withCharacterDnaDraftSync(target, () => state.activeSettings),
    };
}

// 窄屏分类抽屉的开关记在 #igs-unified-settings 的 data-igs-nav 上，整页重绘（只换内部）不会丢。
function navHost(root) {
    return root && typeof root.querySelector === 'function' ? root.querySelector('#igs-unified-settings') : null;
}

function isNavOpen(root) {
    const host = navHost(root);
    return Boolean(host && host.getAttribute('data-igs-nav') === 'open');
}

function setNavOpen(root, open) {
    const host = navHost(root);
    if (!host) return;
    if (open) host.setAttribute('data-igs-nav', 'open');
    else host.removeAttribute('data-igs-nav');
}

// note：大图底部的一行说明，比如淡色借图「这一格还没有自己的图」。
function showSpritePreviewOverlay(root, url, note = '') {
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
    if (note) {
        const caption = doc.createElement('div');
        caption.className = 'igs-sprite-preview-note';
        caption.textContent = note;
        overlay.appendChild(caption);
    }
    overlay.addEventListener('click', () => overlay.remove());
    host.appendChild(overlay);
}
