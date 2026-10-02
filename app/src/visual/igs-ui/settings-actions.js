import { DEFAULT_VIRTUAL_REGEX } from '../../scene/message-source.js';
import { cloneData } from './reader-value-utils.js';
import { DEFAULT_SCENE_PROMPT_RULE, TOOLBAR_ACTIONS } from './reader-host-constants.js';
import { findDbgenApi } from '../../generated-images/image-backend.js';
import { formatEditablePrompt, formatStoredPrompt, normalizeStoredPrompt, parseEditablePrompt } from '../../generated-images/generation-prompt.js';
import { getNextSettingsTheme, normalizeSettingsTheme } from './settings-theme.js';
import { DEFAULT_MOOD_GROUPS, normalizeMoodGroups } from '../../scene/mood-groups.js';
import { loadScenePresets, saveScenePresets, saveActiveScenePresetName } from '../../scene/scene-preset-store.js';
import { clearMoodReview, loadMoodReview, removeMoodReview } from '../../scene/mood-review-store.js';
import { normalizeStatusHudSettings } from '../../data/shujuku/status-hud-model.js';
import { normalizeStatusAvatars } from '../../data/shujuku/status-hud-model.js';
import { normalizeStageShakeSettings } from './stage-shake-runtime.js';
import { CHAT_SHOW_PROMPT_RULE, isValidChatContactName, normalizeChatPromptRule, normalizeChatShowSettings } from './chat-show-runtime.js';
import { normalizeSystemRoleSettings, stripRoleBrackets } from './system-role.js';
import { playChatSfx } from './chat-sfx.js';
import { normalizeTypewriterSettings } from './typewriter-runtime.js';
import { resolveTypewriterVoice, scheduleTypewriterAudio } from './typewriter-audio.js';
import { normalizeWeatherFxSettings } from './weather-fx-runtime.js';
import { FX_SETTINGS_NORMALIZERS, FX_WORD_LIST_PATHS } from './fx-settings.js';
import { ROMANCE_ACTIONS_MAX, normalizeRomanceFxSettings } from './romance-settings.js';
import { META_GLOBAL_SCOPE, META_LINE_KINDS, META_LINES_MAX, normalizeMetaFxSettings } from './meta-settings.js';
import { applyPerformancePreset } from './performance-presets.js';
import { applyWorldview, resolveWorldview } from '../../scene/worldview.js';
import { normalizeBgmSettings } from './scene-audio.js';
import { normalizeSpriteHeads } from './fx-anchor.js';
import { formatImageJobLogText } from '../../generated-images/image-job-log.js';
import { addGeneratedAssetToLibrary, bindGeneratedSprite, collectGeneratedImageIds, generatedAssetIdOf, isGeneratedAssetUrl, normalizeGeneratedLibrary, removeGeneratedLibraryEntry, renameGeneratedLibraryEntry, setGeneratedExpressionNote, transferGeneratedLibraryEntry } from '../../scene/asset-match.js';
import { resolveCharacterDna } from '../../scene/character-dna.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { normalizeCharacterDna, normalizeCharacterDnaMap, removeCharacterDna, renameCharacterDna } from '../../scene/character-dna.js';
import { normalizeCharacterHouses } from './magic-house.js';
import { handleOutfitAction } from './settings-outfit-actions.js';
import { markSettingsButtonBusy, showSettingsProgress } from './settings-notice.js';
import { createSettingsDialogs } from './settings-dialog.js';
import { SETTINGS_SECTIONS, buildSettingsExport, parseSettingsImport, resetSettingsSection, settingsExportFileName } from './settings-sections.js';
import { normalizeCharacterOutfits, normalizeWardrobe, renameOutfitScene, resolveWardrobePrompt } from '../../scene/character-outfits.js';

import { migrateSpriteKeys } from './sprite-key-migration.js';
import { NAI_OFFICIAL_MODELS } from '../../generated-images/request-builders/nai-v4-builder.js';
import { ASSET_FOLDER_KINDS, addAssetFolder, forgetAssetItem, loadAssetFolders, moveAssetToFolder, removeAssetFolder, renameAssetFolder, renameAssetItem, saveAssetFolders, setAssetView, toggleAssetFolder } from './asset-folders.js';
import { mergeDefaultBackgrounds } from '../../backgrounds/merge-default-backgrounds.js';

// 草稿深拷贝后顶层 imageApi 与 bridge.imageApi 不再是同一对象，面板只改后者；生图读取优先顶层，这里对齐为面板当前值。
function cloneImageDraft(draft) {
    const settings = cloneData(draft);
    if (settings && settings.bridge && settings.bridge.imageApi) settings.imageApi = settings.bridge.imageApi;
    return settings;
}

const STATUS_AVATAR_MAX_BYTES = 512 * 1024;
const STATUS_AVATAR_MIME = /^image\/(?:png|jpeg|jpg|webp|gif|bmp|svg\+xml)$/i;

function decodeSeg(value) {
    try { return decodeURIComponent(String(value == null ? '' : value)); }
    catch (error) { return String(value == null ? '' : value); }
}

function operationFailed(result) {
    return result === false || Boolean(result && typeof result === 'object' && result.ok === false);
}

function assetFolderScope(settingsState, options) {
    const globalObj = options.global || globalThis;
    return { globalObj, storage: globalObj.localStorage, scope: settingsState.asyncState.scenePresetName || '' };
}

// 素材文件夹只是本地界面归类：不改草稿、不触发设置持久化。
async function runAssetFolderAction(action, settingsState, options, dialogs) {
    const m = /^asset-(view|edit|folder-add|folder-rename|folder-remove|folder-toggle|folder-move):([a-z]+)(?::(.*))?$/.exec(action);
    if (!m || !ASSET_FOLDER_KINDS.includes(m[2])) return false;
    const [, op, kind, rest = ''] = m;
    const { globalObj, storage, scope } = assetFolderScope(settingsState, options);
    let state = loadAssetFolders(storage, scope);
    if (op === 'view') {
        state = setAssetView(state, kind, rest);
    } else if (op === 'edit') {
        // 缩略图卡片「修改」：切回列表并展开所在文件夹；背景场景同时展开该条目。素材数据不动。
        const name = decodeSeg(rest);
        state = setAssetView(state, kind, 'list');
        const folder = Object.prototype.hasOwnProperty.call(state[kind].assign, name) ? state[kind].assign[name] : '';
        if (state[kind].collapsed.includes(folder)) state = toggleAssetFolder(state, kind, folder);
        if (kind === 'scenes' && name) {
            if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
            settingsState.asyncState.expandedSceneSlots.add('bg\x00' + name);
        }
    } else if (op === 'folder-add') {
        const name = ((await dialogs.prompt('新文件夹名称：', '')) || '').trim();
        if (!name) return true;
        state = addAssetFolder(state, kind, name);
    } else if (op === 'folder-rename') {
        const from = decodeSeg(rest);
        const to = ((await dialogs.prompt(`重命名文件夹「${from}」为：`, from)) || '').trim();
        if (!to || to === from) return true;
        if (state[kind].folders.includes(to)) {
            if (globalObj.alert) globalObj.alert(`文件夹「${to}」已存在`);
            return true;
        }
        state = renameAssetFolder(state, kind, from, to);
    } else if (op === 'folder-remove') {
        const name = decodeSeg(rest);
        if (!await dialogs.confirm(`删除文件夹「${name}」？里面的素材会移回未分类，不会被删除。`)) return true;
        state = removeAssetFolder(state, kind, name);
    } else if (op === 'folder-toggle') {
        state = toggleAssetFolder(state, kind, decodeSeg(rest));
    } else {
        const c = rest.indexOf(':');
        if (c < 0) return true;
        state = moveAssetToFolder(state, kind, decodeSeg(rest.slice(0, c)), decodeSeg(rest.slice(c + 1)));
    }
    saveAssetFolders(storage, scope, state);
    return true;
}

// 条目改名后同步它的文件夹归属，避免改名后掉回未分类。
function syncAssetFolderItem(settingsState, options, kind, from, to) {
    const { storage, scope } = assetFolderScope(settingsState, options);
    const state = loadAssetFolders(storage, scope);
    if (Object.prototype.hasOwnProperty.call(state[kind].assign, from)) saveAssetFolders(storage, scope, renameAssetItem(state, kind, from, to));
}

// 条目删除后清掉它的文件夹归属，避免之后同名新建时被自动归回旧文件夹。
function forgetAssetFolderItem(settingsState, options, kind, name) {
    const { storage, scope } = assetFolderScope(settingsState, options);
    const state = loadAssetFolders(storage, scope);
    if (Object.prototype.hasOwnProperty.call(state[kind].assign, name)) saveAssetFolders(storage, scope, forgetAssetItem(state, kind, name));
}

function installGeneratedCharacter(sceneAssets, name, replace = false) {
    const library = normalizeGeneratedLibrary(sceneAssets.generated);
    const bound = bindGeneratedSprite(sceneAssets, name, library.characters[name] && library.characters[name]['默认'], { replace });
    if (!bound.ok) return bound;
    sceneAssets.characters = bound.characters;
    sceneAssets.characterAliases = bound.characterAliases;
    return bound;
}

function characterExpressionDna(sceneAssets, name) {
    const hit = resolveCharacterDna(
        sceneAssets.characterDna,
        name,
        (raw) => resolveCharacterKey(sceneAssets.characters || {}, sceneAssets.characterAliases || {}, raw) || '',
    );
    return hit ? hit.dna : null;
}

function expressionNoteKey(name, outfit) {
    return outfit ? `${name}\u0001${outfit}` : name;
}

function firstGeneratedOutfitUrl(entry) {
    const moods = entry && entry.moods && typeof entry.moods === 'object' ? entry.moods : {};
    for (const url of Object.values(moods)) {
        const text = String(url || '').trim();
        if (isGeneratedAssetUrl(text)) return text;
    }
    return '';
}

function clearExpressionNote(library, key, mood) {
    if (!library.expressionNotes[key]) return library;
    const notes = { ...library.expressionNotes[key] };
    delete notes[mood];
    if (Object.keys(notes).length) library.expressionNotes[key] = notes;
    else delete library.expressionNotes[key];
    return library;
}

function applyCharacterExpression(sceneAssets, name, item) {
    const characters = { ...(sceneAssets.characters || {}) };
    const current = { ...(characters[name] || {}) };
    let library = normalizeGeneratedLibrary(sceneAssets.generated);
    if (item && item.ok && item.imageId) {
        current[item.mood] = `igs-gen:${item.imageId}`;
        library = clearExpressionNote(library, name, item.mood);
    } else {
        if (!Object.prototype.hasOwnProperty.call(current, item.mood)) current[item.mood] = '';
        const noted = setGeneratedExpressionNote(library, name, item.mood, {
            positive: item && item.prompt ? item.prompt.positive : '',
            negative: item && item.prompt ? item.prompt.negative : '',
            error: (item && item.error) || '出图失败',
            caption: item && item.caption,
        });
        if (noted.ok) library = noted.library;
    }
    characters[name] = current;
    sceneAssets.characters = characters;
    sceneAssets.generated = library;
}

function settingsProgressHost(globalObj) {
    const doc = globalObj && globalObj.document;
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById('igs-unified-settings') : null;
}

function reportExpressionProgress(globalObj, event) {
    const host = settingsProgressHost(globalObj);
    if (!host || !event) return;
    const total = Math.max(0, Number(event.total) || 0);
    const done = Math.max(0, Number(event.done) || 0);
    const writing = event.phase === 'write';
    showSettingsProgress(host, {
        text: writing
            ? '写词'
            : `${done}/${total} ${event.mood || ''}`.trim(),
        ratio: writing || !total ? 0 : done / total,
        indeterminate: writing,
        button: writing ? '写词' : `${done}/${total}`,
    });
}

function clearExpressionProgress(globalObj) {
    const host = settingsProgressHost(globalObj);
    if (host) showSettingsProgress(host, null);
}

function markExpressionActionBusy(globalObj, action) {
    const host = settingsProgressHost(globalObj);
    const button = host && typeof host.querySelector === 'function'
        ? host.querySelector(`[data-action="${action}"]`)
        : null;
    return markSettingsButtonBusy(button, '写词');
}

function applyOutfitExpression(sceneAssets, name, outfitName, item) {
    const mood = item && item.mood;
    if (!mood || mood === '默认') return;
    const all = { ...(sceneAssets.characterOutfits || {}) };
    const outfits = { ...(all[name] || {}) };
    const entry = { ...(outfits[outfitName] || { words: [], moods: {} }) };
    const moods = { ...(entry.moods && typeof entry.moods === 'object' ? entry.moods : {}) };
    const noteKey = expressionNoteKey(name, outfitName);
    let library = normalizeGeneratedLibrary(sceneAssets.generated);
    if (item.ok && item.imageId) {
        moods[mood] = `igs-gen:${item.imageId}`;
        library = clearExpressionNote(library, noteKey, mood);
    } else {
        if (!Object.prototype.hasOwnProperty.call(moods, mood)) moods[mood] = '';
        const noted = setGeneratedExpressionNote(library, noteKey, mood, {
            positive: item && item.prompt ? item.prompt.positive : '',
            negative: item && item.prompt ? item.prompt.negative : '',
            error: (item && item.error) || '出图失败',
            caption: item && item.caption,
        });
        if (noted.ok) library = noted.library;
    }
    entry.moods = moods;
    outfits[outfitName] = entry;
    all[name] = outfits;
    sceneAssets.characterOutfits = all;
    sceneAssets.generated = library;
}

function persistGeneratedLibrary(persistSettingsDraft) {
    try {
        return persistSettingsDraft();
    } catch (error) {
        return { ok: false, reason: 'generated-asset-persist-failed' };
    }
}

function restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft) {
    sceneAssets.generated = previousLibrary;
    try {
        const rollback = persistSettingsDraft();
        return !operationFailed(rollback);
    } catch (error) {
        return false;
    }
}

function generatedOperationFailure(globalObj, message, reason) {
    if (globalObj && typeof globalObj.alert === 'function') globalObj.alert(message);
    return { ok: false, reason };
}

// 生成素材图片可能被多个场景预设共用：只删当前设置与所有预设都不再引用的图片。
export function unreferencedGeneratedImageIds(imageIds, sceneAssets, storage) {
    const inUse = new Set(collectGeneratedImageIds(sceneAssets));
    for (const preset of Object.values(loadScenePresets(storage))) {
        for (const id of collectGeneratedImageIds(preset)) inUse.add(id);
    }
    return (Array.isArray(imageIds) ? imageIds : []).filter((id) => !inUse.has(id));
}

// 下载文件名：去掉 Windows / 各浏览器不允许的字符，保证以 .png 结尾。
export function sanitizeDownloadName(name) {
    const cleaned = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    const base = cleaned || '素材.png';
    return /\.png$/i.test(base) ? base : `${base}.png`;
}

// 把 data:image/...;base64 转成 Blob 下载；环境缺 Blob/URL 时退回直接用 dataUrl 作为链接。
function triggerDataUrlDownload(globalObj, dataUrl, fileName) {
    const doc = globalObj.document;
    if (!doc || typeof doc.createElement !== 'function') return { ok: false, reason: 'no-document' };
    const BlobCtor = globalObj.Blob || globalThis.Blob;
    const urlApi = globalObj.URL || globalThis.URL;
    const decode = typeof globalObj.atob === 'function' ? globalObj.atob.bind(globalObj) : (typeof globalThis.atob === 'function' ? globalThis.atob : null);
    const m = /^data:([^;,]+);base64,/i.exec(String(dataUrl));
    let href = dataUrl;
    let objectUrl = '';
    if (m && BlobCtor && urlApi && typeof urlApi.createObjectURL === 'function' && decode) {
        const bin = decode(String(dataUrl).slice(m[0].length));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        objectUrl = urlApi.createObjectURL(new BlobCtor([bytes], { type: m[1] }));
        href = objectUrl;
    }
    const a = doc.createElement('a');
    a.href = href;
    a.download = fileName;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    if (objectUrl && typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(objectUrl);
    return { ok: true, fileName };
}

export async function handleSettingsAction(action, ctx) {
    const {
        state,
        options,
        closeSettings,
        persistSettingsDraft,
        rerenderSettings,
        buildRegexPreview,
    } = ctx;

    if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
    const normalizedAction = String(action || '').trim();
    const settingsState = state.activeSettings;
    const dialogs = ctx.dialogs || createSettingsDialogs({ global: options.global || globalThis });

    if (normalizedAction.startsWith('settings-reset-section:')) {
        const sectionId = normalizedAction.slice('settings-reset-section:'.length);
        const section = SETTINGS_SECTIONS[sectionId];
        if (!section || typeof ctx.getDefaultSettings !== 'function') return { ok: false, reason: 'unknown-section' };
        if (!await dialogs.confirm(`把「${section.label}」这一区的设置恢复为默认值？`, { okLabel: '重置' })) return rerenderSettings();
        const reset = resetSettingsSection(settingsState.draft, sectionId, ctx.getDefaultSettings());
        if (reset.ok === false) return reset;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'settings-export-all') {
        const globalObj = options.global || globalThis;
        const doc = globalObj.document;
        if (!doc || typeof doc.createElement !== 'function') return { ok: false, reason: 'no-document' };
        const json = JSON.stringify(buildSettingsExport(settingsState.draft, { version: options.version }), null, 2);
        const BlobCtor = globalObj.Blob || globalThis.Blob;
        const urlApi = globalObj.URL || globalThis.URL;
        if (!BlobCtor || !urlApi || typeof urlApi.createObjectURL !== 'function') return { ok: false, reason: 'no-download' };
        const url = urlApi.createObjectURL(new BlobCtor([json], { type: 'application/json' }));
        const fileName = settingsExportFileName(options.version);
        const a = doc.createElement('a');
        a.href = url;
        a.download = fileName;
        doc.body.appendChild(a);
        a.click();
        doc.body.removeChild(a);
        if (typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(url);
        return { ok: true, fileName };
    }

    if (normalizedAction === 'settings-import-all') {
        const globalObj = options.global || globalThis;
        const doc = globalObj.document;
        if (!doc || typeof doc.createElement !== 'function') return { ok: false, reason: 'no-document' };
        if (typeof ctx.normalizeImportedSettings !== 'function') return { ok: false, reason: 'import-unavailable' };
        const fileResult = await pickPresetFile(doc);
        if (!fileResult) return rerenderSettings();
        const parsed = parseSettingsImport(fileResult.data, settingsState.draft);
        if (!parsed.ok) {
            if (globalObj.alert) globalObj.alert(`导入失败：${parsed.message}`);
            return rerenderSettings();
        }
        if (!await dialogs.confirm(`用「${fileResult.fileName}」覆盖当前全部设置？API Key 不在文件里，会保留本机现有的。`, { okLabel: '导入' })) return rerenderSettings();
        const normalized = ctx.normalizeImportedSettings({ bridge: parsed.bridge, readerSettings: parsed.readerSettings });
        settingsState.draft.bridge = normalized.bridge;
        settingsState.draft.readerSettings = normalized.readerSettings;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'toggle-settings-theme' || normalizedAction.startsWith('set-settings-theme:')) {
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const nextTheme = normalizedAction === 'toggle-settings-theme'
            ? getNextSettingsTheme(bridge.settingsTheme)
            : normalizeSettingsTheme(normalizedAction.slice('set-settings-theme:'.length));
        if (nextTheme === bridge.settingsTheme) return rerenderSettings();
        bridge.settingsTheme = nextTheme;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'close') {
        return closeSettings();
    }

    // 生图页的「打开 CG 库」：先按正常流程关闭设置（保存草稿），再在阅读器里打开 CG 库。
    if (normalizedAction === 'open-cg-gallery') {
        if (typeof options.openCgGallery !== 'function') return { ok: false, reason: 'cg-gallery-unavailable' };
        const closed = closeSettings();
        if (closed && closed.ok === false) return closed;
        const opened = options.openCgGallery();
        const globalObj = options.global || globalThis;
        if (opened && opened.ok === false && globalObj && typeof globalObj.alert === 'function') globalObj.alert('请先打开阅读器，再查看 CG 库。');
        return opened;
    }

    if (normalizedAction.startsWith('gen-lib-rename:')) {
        const rest = normalizedAction.slice('gen-lib-rename:'.length);
        const colon = rest.indexOf(':');
        if (colon < 0) return rerenderSettings();
        const type = decodeSeg(rest.slice(0, colon));
        const oldName = decodeSeg(rest.slice(colon + 1));
        if (type !== 'background' && type !== 'sprite') return rerenderSettings();
        const globalObj = options.global || globalThis;
        const newName = ((await dialogs.prompt(`生成素材「${oldName}」的新名称：`, oldName)) || '').trim();
        if (!newName || newName === oldName) return rerenderSettings();
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridge.sceneAssets = bridge.sceneAssets || {};
        const previousLibrary = normalizeGeneratedLibrary(sceneAssets.generated);
        const result = renameGeneratedLibraryEntry(sceneAssets.generated, type, oldName, newName);
        if (!result.ok) {
            if (globalObj.alert) globalObj.alert(result.reason === 'name-exists' ? `生成素材「${newName}」已存在。` : '生成素材改名失败。');
            return rerenderSettings();
        }
        sceneAssets.generated = result.library;
        const persisted = persistGeneratedLibrary(persistSettingsDraft);
        if (operationFailed(persisted)) {
            if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                return generatedOperationFailure(globalObj, '生成素材改名失败，且无法恢复原设置。', 'generated-asset-rename-rollback-failed');
            }
            return persisted;
        }
        return rerenderSettings();
    }

    // 生成素材移到 / 复制到其他场景预设：先写目标预设，再从当前库移除；任一步失败都不丢图片引用，也不删图。
    if (normalizedAction.startsWith('gen-lib-transfer:')) {
        const [mode, rawType, rawName, rawPreset] = normalizedAction.slice('gen-lib-transfer:'.length).split(':');
        const type = decodeSeg(rawType);
        const name = decodeSeg(rawName);
        const targetName = decodeSeg(rawPreset);
        if ((mode !== 'move' && mode !== 'copy') || (type !== 'background' && type !== 'sprite') || !name || !targetName) return rerenderSettings();
        const globalObj = options.global || globalThis;
        const storage = globalObj.localStorage;
        const activeName = settingsState.asyncState.scenePresetName || '';
        const presets = loadScenePresets(storage);
        if (!Object.prototype.hasOwnProperty.call(presets, targetName) || targetName === activeName) return rerenderSettings();
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridge.sceneAssets = bridge.sceneAssets || {};
        const previousLibrary = normalizeGeneratedLibrary(sceneAssets.generated);
        const move = mode === 'move';
        const result = transferGeneratedLibraryEntry(previousLibrary, presets[targetName].generated, type, name, { move });
        if (!result.ok) {
            if (globalObj.alert) globalObj.alert(result.reason === 'name-exists' ? `预设「${targetName}」的生成素材库里已有「${name}」，已阻止。` : `生成素材「${name}」不存在。`);
            return rerenderSettings();
        }
        presets[targetName] = { ...presets[targetName], generated: result.target };
        // 移走时同步当前预设已保存的生成素材库，避免切回当前预设时条目又出现；旧预设没有该字段则不动。
        if (move && activeName && Object.prototype.hasOwnProperty.call(presets, activeName) && Object.prototype.hasOwnProperty.call(presets[activeName], 'generated')) {
            presets[activeName] = { ...presets[activeName], generated: result.source };
        }
        const written = saveScenePresets(storage, presets);
        if (written.ok === false) return written;
        if (move) {
            sceneAssets.generated = result.source;
            const persisted = persistGeneratedLibrary(persistSettingsDraft);
            if (operationFailed(persisted)) {
                if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                    return generatedOperationFailure(globalObj, '移动生成素材失败，且无法恢复原设置。', 'generated-asset-transfer-rollback-failed');
                }
                return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('gen-lib-remove:')) {
        const rest = normalizedAction.slice('gen-lib-remove:'.length);
        const colon = rest.indexOf(':');
        if (colon < 0) return rerenderSettings();
        const type = decodeSeg(rest.slice(0, colon));
        const name = decodeSeg(rest.slice(colon + 1));
        if (type !== 'background' && type !== 'sprite') return rerenderSettings();
        const globalObj = options.global || globalThis;
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridge.sceneAssets = bridge.sceneAssets || {};
        const library = normalizeGeneratedLibrary(sceneAssets.generated);
        const previousLibrary = library;
        const bucket = type === 'background' ? library.scenes : library.characters;
        if (!Object.prototype.hasOwnProperty.call(bucket, name)) return rerenderSettings();
        const confirmed = await dialogs.confirm(`删除生成素材「${name}」及其图片？`);
        if (!confirmed) return rerenderSettings();
        const result = removeGeneratedLibraryEntry(library, type, name);
        sceneAssets.generated = result.library;
        const persisted = persistGeneratedLibrary(persistSettingsDraft);
        if (operationFailed(persisted)) {
            if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                return generatedOperationFailure(globalObj, '删除生成素材失败，且无法恢复原设置。', 'generated-asset-remove-rollback-failed');
            }
            return persisted;
        }
        const service = options.generatedAssets;
        if (service && typeof service.deleteImages === 'function') {
            try {
                const deleted = await service.deleteImages(unreferencedGeneratedImageIds(result.imageIds, sceneAssets, globalObj.localStorage));
                if (operationFailed(deleted)) {
                    if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                        return generatedOperationFailure(globalObj, '删除生成素材失败，且无法恢复原设置。', 'generated-asset-remove-rollback-failed');
                    }
                    return generatedOperationFailure(globalObj, '生成素材图片删除失败，已恢复素材库记录。', 'generated-asset-remove-images-failed');
                }
            } catch (error) {
                if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                    return generatedOperationFailure(globalObj, '删除生成素材失败，且无法恢复原设置。', 'generated-asset-remove-rollback-failed');
                }
                return generatedOperationFailure(globalObj, '生成素材图片删除失败，已恢复素材库记录。', 'generated-asset-remove-images-failed');
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('gen-temp-accept:')) {
        const key = decodeSeg(normalizedAction.slice('gen-temp-accept:'.length));
        const service = options.generatedAssets;
        if (!service || typeof service.getRecord !== 'function' || typeof service.setStatus !== 'function') {
            return { ok: false, reason: 'generated-assets-unavailable' };
        }
        const record = service.getRecord(key);
        if (!record || !record.imageId) return rerenderSettings();
        const globalObj = options.global || globalThis;
        const suggestedName = String(record.name || '').trim();
        const requestedName = ctx.dialogs || typeof globalObj.prompt === 'function'
            ? await dialogs.prompt(`生成素材「${suggestedName}」的入库名称：`, suggestedName)
            : suggestedName;
        const name = String(requestedName == null ? '' : requestedName).trim();
        if (!name) return rerenderSettings();
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridge.sceneAssets = bridge.sceneAssets || {};
        const previousLibrary = normalizeGeneratedLibrary(sceneAssets.generated);
        const added = addGeneratedAssetToLibrary(previousLibrary, record, name);
        if (!added.ok) return rerenderSettings();
        sceneAssets.generated = added.library;
        if (record.type !== 'background') installGeneratedCharacter(sceneAssets, added.name);
        const persisted = persistGeneratedLibrary(persistSettingsDraft);
        if (operationFailed(persisted)) {
            if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                return generatedOperationFailure(globalObj, '生成素材入库失败，且无法恢复原设置。', 'generated-asset-accept-rollback-failed');
            }
            return persisted;
        }
        let status;
        try {
            status = await service.setStatus(key, 'library');
        } catch (error) {
            status = { ok: false, reason: 'generated-asset-status-failed' };
        }
        if (operationFailed(status)) {
            if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                return generatedOperationFailure(options.global || globalThis, '生成素材入库失败，且无法恢复原设置。', 'generated-asset-accept-rollback-failed');
            }
            return status;
        }
        return rerenderSettings();
    }

    // 打开遮罩修复编辑器：由宿主注入 openMatteEditor，未注入时明确失败，不静默无响应。
    if (normalizedAction.startsWith('gen-matte-edit:')) {
        const imageId = decodeSeg(normalizedAction.slice('gen-matte-edit:'.length));
        const globalObj = options.global || globalThis;
        if (!imageId || typeof options.openMatteEditor !== 'function') {
            return generatedOperationFailure(globalObj, '抠图修复编辑器当前不可用。', 'matte-editor-unavailable');
        }
        try { return await options.openMatteEditor(imageId); }
        catch (error) { return generatedOperationFailure(globalObj, '打开抠图修复编辑器失败。', 'matte-editor-open-failed'); }
    }

    if (normalizedAction.startsWith('gen-asset-prompt:')) {
        const imageId = decodeSeg(normalizedAction.slice('gen-asset-prompt:'.length));
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        if (!imageId || !service || typeof service.getImagePrompt !== 'function') {
            return generatedOperationFailure(globalObj, '找不到这份素材的生图提示词。', 'generated-asset-prompt-unavailable');
        }
        let prompt = null;
        try {
            prompt = await service.getImagePrompt(imageId);
        } catch (error) {
            prompt = null;
        }
        const text = formatStoredPrompt(prompt) || '这条素材没有保存生图提示词。';
        if (typeof dialogs.view === 'function') await dialogs.view(text);
        else if (typeof globalObj.alert === 'function') globalObj.alert(text);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('gen-adopt-sprite:')) {
        const name = decodeSeg(normalizedAction.slice('gen-adopt-sprite:'.length));
        const globalObj = options.global || globalThis;
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridge.sceneAssets = bridge.sceneAssets || {};
        const adopted = installGeneratedCharacter(sceneAssets, name, true);
        if (!adopted.ok) return generatedOperationFailure(globalObj, '这份生成立绘没有可绑定的图片。', 'generated-sprite-adopt-failed');
        const persisted = persistGeneratedLibrary(persistSettingsDraft);
        if (operationFailed(persisted)) return persisted;
        const boundMessage = `已把这张图设为「${adopted.name}」的默认立绘。`;
        if (globalObj.toastr && typeof globalObj.toastr.success === 'function') globalObj.toastr.success(boundMessage, 'IGS');
        return rerenderSettings();
    }

    if (/^(?:char|outfit)-expression-prompt:/.test(normalizedAction)) {
        const outfitMode = normalizedAction.startsWith('outfit-expression-prompt:');
        const prefix = outfitMode ? 'outfit-expression-prompt:' : 'char-expression-prompt:';
        const parts = normalizedAction.slice(prefix.length).split(':').map(decodeSeg);
        const name = parts[0] || '';
        const outfitName = outfitMode ? (parts[1] || '') : '';
        const mood = parts[outfitMode ? 2 : 1] || '';
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridge.sceneAssets = bridge.sceneAssets || {};
        const character = (sceneAssets.characters || {})[name];
        const outfitEntry = outfitMode ? (((sceneAssets.characterOutfits || {})[name] || {})[outfitName]) : null;
        if (!name || !mood || !character || (outfitMode && !outfitEntry)) return rerenderSettings();
        if (typeof dialogs.edit !== 'function') {
            return generatedOperationFailure(globalObj, '提示词编辑当前不可用。', 'expression-prompt-unavailable');
        }
        const slotUrl = outfitMode ? String((outfitEntry.moods || {})[mood] || '') : String(character[mood] || '');
        const imageId = generatedAssetIdOf(slotUrl);
        const library = normalizeGeneratedLibrary(sceneAssets.generated);
        const note = (library.expressionNotes[expressionNoteKey(name, outfitName)] || {})[mood];
        let prompt = null;
        if (imageId && service && typeof service.getImagePrompt === 'function') {
            try { prompt = await service.getImagePrompt(imageId); } catch (error) { prompt = null; }
        }
        if (!prompt && note) prompt = normalizeStoredPrompt(note);
        const text = formatEditablePrompt(prompt);
        if (!text) return generatedOperationFailure(globalObj, '这张立绘没有保存提示词。', 'expression-prompt-missing');
        const edited = await dialogs.edit('这张立绘的提示词', text);
        if (edited == null) return rerenderSettings();
        const next = parseEditablePrompt(edited);
        if (!next) return generatedOperationFailure(globalObj, '提示词是空的。', 'expression-prompt-empty');
        if (imageId && service && typeof service.saveImagePrompt === 'function') {
            let saved;
            try { saved = await service.saveImagePrompt(imageId, next); }
            catch (error) { saved = { ok: false, error: '提示词没存上。' }; }
            if (!saved || !saved.ok) {
                return generatedOperationFailure(globalObj, (saved && saved.error) || '提示词没存上。', 'expression-prompt-save-failed');
            }
        } else {
            const noted = setGeneratedExpressionNote(library, expressionNoteKey(name, outfitName), mood, {
                positive: next.positive,
                negative: next.negative,
                error: (note && note.error) || '',
                caption: next.caption,
            });
            if (!noted.ok) return generatedOperationFailure(globalObj, '提示词没存上。', 'expression-prompt-save-failed');
            sceneAssets.generated = noted.library;
            const persisted = persistGeneratedLibrary(persistSettingsDraft);
            if (operationFailed(persisted)) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('gen-expression-prompt:')) {
        const rest = normalizedAction.slice('gen-expression-prompt:'.length);
        const colon = rest.indexOf(':');
        const name = decodeSeg(colon < 0 ? rest : rest.slice(0, colon));
        const mood = decodeSeg(colon < 0 ? '' : rest.slice(colon + 1));
        const globalObj = options.global || globalThis;
        const bridge = settingsState.draft.bridge || {};
        const note = (((bridge.sceneAssets || {}).generated || {}).expressionNotes || {})[name];
        const item = note && note[mood];
        const text = formatStoredPrompt(item) || '这条表情没有保存生图提示词。';
        if (typeof dialogs.view === 'function') await dialogs.view(text);
        else if (typeof globalObj.alert === 'function') globalObj.alert(text);
        return rerenderSettings();
    }

    if (/^(?:char|outfit)-expression-(?:set|retry):/.test(normalizedAction)) {
        const outfitMode = normalizedAction.startsWith('outfit-expression-');
        const retry = normalizedAction.includes('-expression-retry:');
        const prefix = `${outfitMode ? 'outfit' : 'char'}-expression-${retry ? 'retry' : 'set'}:`;
        const parts = normalizedAction.slice(prefix.length).split(':').map(decodeSeg);
        const name = parts[0] || '';
        const outfitName = outfitMode ? (parts[1] || '') : '';
        const mood = retry ? (parts[outfitMode ? 2 : 1] || '') : '';
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridge.sceneAssets = bridge.sceneAssets || {};
        const character = (sceneAssets.characters || {})[name];
        const outfitEntry = outfitMode ? (((sceneAssets.characterOutfits || {})[name] || {})[outfitName]) : null;
        if (!name || !character || (outfitMode && !outfitEntry)) return rerenderSettings();
        if (!service || typeof service.generateExpressionSet !== 'function' || typeof service.getImagePrompt !== 'function') {
            return generatedOperationFailure(globalObj, '表情差分当前不可用。', 'expression-unavailable');
        }
        const labels = normalizeMoodGroups(sceneAssets.moodGroups).map((group) => group.label);
        const ownUrl = outfitMode ? firstGeneratedOutfitUrl(outfitEntry) : '';
        const baseUrl = ownUrl || String(character['默认'] || '');
        const defaultId = generatedAssetIdOf(baseUrl);
        let basePrompt = null;
        try { basePrompt = defaultId ? await service.getImagePrompt(defaultId) : null; }
        catch (error) { basePrompt = null; }
        if (!basePrompt) {
            const originId = generatedAssetIdOf(String(character['默认'] || ''));
            if (originId && originId !== defaultId) {
                try { basePrompt = await service.getImagePrompt(originId); }
                catch (error) { basePrompt = null; }
            }
        }
        const library = normalizeGeneratedLibrary(sceneAssets.generated);
        const noteKey = expressionNoteKey(name, outfitName);
        const note = retry ? (library.expressionNotes[noteKey] || {})[mood] : null;
        let savedCaption = note && note.caption;
        if (retry && !savedCaption) {
            const slotUrl = outfitMode ? String((outfitEntry.moods || {})[mood] || '') : String((character || {})[mood] || '');
            const slotId = generatedAssetIdOf(slotUrl);
            if (slotId) {
                try {
                    const saved = await service.getImagePrompt(slotId);
                    if (saved && saved.caption) savedCaption = saved.caption;
                    else if (saved && (saved.positive || saved.negative)) {
                        const parsed = parseEditablePrompt([
                            saved.positive ? `scene: ${saved.positive}` : '',
                            saved.negative ? `scene_uc: ${saved.negative}` : '',
                        ].filter(Boolean).join('\n'));
                        savedCaption = parsed && parsed.caption;
                    }
                } catch (error) { savedCaption = null; }
            }
        }
        if (!savedCaption && !basePrompt) {
            return generatedOperationFailure(globalObj, outfitMode
                ? '先把一张带提示词的生成立绘放进这套服装，或绑定到这个角色的原装。'
                : '先把一张带提示词的生成立绘绑定到这个角色。', 'expression-prompt-missing');
        }
        const dna = characterExpressionDna(sceneAssets, name);
        const clothes = outfitMode ? resolveWardrobePrompt(sceneAssets.wardrobe, outfitEntry, outfitName) : null;
        const outfit = outfitMode ? { name: outfitName, words: outfitEntry.words, ownImage: Boolean(ownUrl), prompt: clothes ? clothes.prompt : '' } : null;
        if (retry && !mood) return rerenderSettings();
        if (!retry) {
            const slots = outfitMode ? (outfitEntry.moods || {}) : (character || {});
            const filled = labels.filter((label) => String(slots[label] || '').trim()).length;
            const who = outfitName ? `「${name}」的服装「${outfitName}」` : `「${name}」`;
            const confirmed = await dialogs.confirm(filled
                ? `重新生成${who}的全部 ${labels.length} 张表情差分。已有 ${filled} 张将被替换。`
                : `生成${who}的 ${labels.length} 张表情差分。先写提示词，再按顺序出图。`);
            if (!confirmed) return rerenderSettings();
        }
        let result;
        const onProgress = (event) => reportExpressionProgress(globalObj, event);
        const restoreBusy = retry ? () => {} : markExpressionActionBusy(globalObj, normalizedAction);
        try {
            result = retry && savedCaption && typeof service.generateExpressionImage === 'function'
                ? await service.generateExpressionImage({ name, mood, caption: savedCaption, onProgress })
                : retry
                    ? await service.generateExpressionImage({ name, mood, basePrompt, dna, outfit, onProgress })
                    : await service.generateExpressionSet({ name, basePrompt, moods: labels, dna, outfit, onProgress });
        } catch (error) {
            clearExpressionProgress(globalObj);
            restoreBusy();
            return generatedOperationFailure(globalObj, '表情差分生成失败。', 'expression-generate-failed');
        }
        if (!result || !result.ok) {
            clearExpressionProgress(globalObj);
            restoreBusy();
            return generatedOperationFailure(globalObj, (result && result.error) || '表情差分生成失败。', 'expression-generate-failed');
        }
        const liveBridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const liveAssets = liveBridge.sceneAssets = liveBridge.sceneAssets || {};
        for (const item of result.items || []) {
            if (outfitMode) applyOutfitExpression(liveAssets, name, outfitName, item);
            else applyCharacterExpression(liveAssets, name, item);
        }
        const persisted = persistGeneratedLibrary(persistSettingsDraft);
        if (operationFailed(persisted)) {
            clearExpressionProgress(globalObj);
            restoreBusy();
            return persisted;
        }
        const rendered = await rerenderSettings();
        clearExpressionProgress(globalObj);
        restoreBusy();
        return rendered;
    }

    // 下载 IGS 实际存储的素材图片：立绘为裁边后带原图 PNG 文本块的版本，背景为原图。
    if (normalizedAction.startsWith('gen-asset-download:')) {
        const rest = normalizedAction.slice('gen-asset-download:'.length);
        const colon = rest.indexOf(':');
        const imageId = decodeSeg(colon < 0 ? rest : rest.slice(0, colon));
        const fileName = sanitizeDownloadName(colon < 0 ? '' : decodeSeg(rest.slice(colon + 1)));
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        if (!imageId || !service || typeof service.getImageDataUrl !== 'function') {
            return { ok: false, reason: 'generated-assets-unavailable' };
        }
        let dataUrl = '';
        try {
            dataUrl = await service.getImageDataUrl(imageId);
        } catch (error) {
            dataUrl = '';
        }
        if (!dataUrl) return generatedOperationFailure(globalObj, '找不到这份素材的图片，可能已被删除。', 'generated-asset-image-missing');
        try {
            return triggerDataUrlDownload(globalObj, dataUrl, fileName);
        } catch (error) {
            return generatedOperationFailure(globalObj, '素材图片下载失败。', 'generated-asset-download-failed');
        }
    }

    if (normalizedAction.startsWith('gen-temp-discard:')) {
        const key = decodeSeg(normalizedAction.slice('gen-temp-discard:'.length));
        const globalObj = options.global || globalThis;
        const confirmed = await dialogs.confirm('丢弃这份临时生成素材及其图片？');
        if (!confirmed) return rerenderSettings();
        const service = options.generatedAssets;
        if (!service || typeof service.setStatus !== 'function') {
            return { ok: false, reason: 'generated-assets-unavailable' };
        }
        let status;
        try {
            status = await service.setStatus(key, 'discarded');
        } catch (error) {
            status = { ok: false, reason: 'generated-asset-status-failed' };
        }
        if (operationFailed(status)) return status;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('status-hud-toggle-table:')) {
        const rest = normalizedAction.slice('status-hud-toggle-table:'.length);
        const colon = rest.indexOf(':');
        if (colon < 0) return rerenderSettings();
        const uid = decodeSeg(rest.slice(0, colon));
        const name = decodeSeg(rest.slice(colon + 1));
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeStatusHudSettings(readerDraft.statusHud);
        const key = uid || `name:${name}`;
        const exists = current.tables.some((item) => (uid && item.uid === uid) || (!uid && item.name === name));
        current.tables = exists
            ? current.tables.filter((item) => !((uid && item.uid === uid) || (!uid && item.name === name)))
            : current.tables.concat([{ uid, name }]);
        readerDraft.statusHud = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('status-avatar-set-url:')) {
        const rest = normalizedAction.slice('status-avatar-set-url:'.length);
        const colon = rest.indexOf(':');
        if (colon > 0) {
            const charName = decodeSeg(rest.slice(0, colon));
            const url = decodeSeg(rest.slice(colon + 1)).trim();
            const sceneAssets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            const avatars = normalizeStatusAvatars(sceneAssets.statusAvatars);
            if (url) {
                const normalized = normalizeStatusAvatars({ [charName]: url });
                if (!normalized[charName]) return rerenderSettings();
                avatars[charName] = normalized[charName];
            } else {
                delete avatars[charName];
            }
            sceneAssets.statusAvatars = avatars;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('chat-show-')) {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeChatShowSettings(readerDraft.chatShow);
        const ask = async (message) => String((await dialogs.prompt(message, '')) || '').trim();
        const [verb, ...args] = normalizedAction.slice('chat-show-'.length).split(':');
        const [name, alias] = args.map(decodeSeg);
        let changed = false;
        if (verb === 'preview-sound') {
            const sound = { volume: current.sound.volume, preset: current.sound.preset, audioScheduler: options.chatSfxScheduler };
            playChatSfx('receive', sound);
            playChatSfx('send', { ...sound, delay: 0.45 });
            return { ok: true, previewed: current.sound.preset };
        }
        if (verb === 'save-prompt' || verb === 'reset-prompt') {
            const draft = typeof settingsState.asyncState.chatPromptDraft === 'string' ? settingsState.asyncState.chatPromptDraft : '';
            current.promptRule = verb === 'reset-prompt' ? '' : normalizeChatPromptRule(draft);
            readerDraft.chatShow = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) {
                settingsState.asyncState.chatPromptStatus = '保存失败，请重试。';
                return rerenderSettings();
            }
            settingsState.asyncState.chatPromptDraft = current.promptRule || CHAT_SHOW_PROMPT_RULE;
            settingsState.asyncState.chatPromptStatus = verb === 'reset-prompt'
                ? '已恢复默认提示词并保存。'
                : current.promptRule ? '自定义提示词已保存并更新注入规则。' : '内容为空或与默认一致，已使用默认提示词。';
            return rerenderSettings();
        }
        if (verb === 'add-contact') {
            const next = await ask('新增联系人（角色主名，不能含 . | [ ]）：');
            if (isValidChatContactName(next) && !current.contacts[next]) {
                current.contacts[next] = { aliases: [], color: '', side: 'auto' };
                changed = true;
            }
        } else if (verb === 'remove-contact' && current.contacts[name]) {
            delete current.contacts[name];
            changed = true;
        } else if (verb === 'add-alias' && current.contacts[name]) {
            const next = await ask(`为「${name}」新增别名（网名、昵称等）：`);
            if (next && next !== name && !current.contacts[name].aliases.includes(next)) {
                current.contacts[name].aliases.push(next);
                changed = true;
            }
        } else if (verb === 'remove-alias' && current.contacts[name]) {
            current.contacts[name].aliases = current.contacts[name].aliases.filter((item) => item !== alias);
            changed = true;
        }
        if (changed) {
            readerDraft.chatShow = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'typewriter-preview-sound') {
        const { sound } = normalizeTypewriterSettings((settingsState.draft.readerSettings || {}).typewriter);
        // Six dialogue notes, then six narration notes after a short gap.
        const notes = (offset) => Array.from({ length: 6 }, (_, i) => ({ text: '字', timeMs: 80 + offset + i * 110 }));
        const play = (textType, volume, offset) => {
            const voice = resolveTypewriterVoice(sound, textType, '试听');
            scheduleTypewriterAudio(notes(offset), { textType, volume, audioScheduler: options.typewriterAudioScheduler, preset: voice.preset, pitch: voice.pitch });
            return voice.preset;
        };
        return { ok: true, previewed: [play('dialogue', sound.dialogueVolume, 0), play('narration', sound.narrationVolume, 900)] };
    }

    if (normalizedAction === 'system-role-follow-color') {
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        readerDraft.systemRole = { ...normalizeSystemRoleSettings(readerDraft.systemRole), color: '' };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'system-role-add-word' || normalizedAction.startsWith('system-role-remove-word:')) {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeSystemRoleSettings(readerDraft.systemRole);
        if (normalizedAction === 'system-role-add-word') {
            const word = stripRoleBrackets(await dialogs.prompt('新增系统类角色名（如 系统、公告、旁白君）：', ''));
            if (!word || current.words.some((w) => w.toLowerCase() === word.toLowerCase())) return rerenderSettings();
            current.words.push(word);
        } else {
            const word = decodeSeg(normalizedAction.slice('system-role-remove-word:'.length));
            current.words = current.words.filter((w) => w !== word);
        }
        readerDraft.systemRole = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'stage-shake-add-emotion') {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeStageShakeSettings(readerDraft.stageShake);
        const raw = await dialogs.prompt('新增震动触发情绪（中文）：', '');
        const emotion = String(raw == null ? '' : raw).trim();
        if (emotion && !current.emotions.includes(emotion) && !/[A-Za-z]/u.test(emotion) && /[\u3400-\u9fff]/u.test(emotion)) {
            current.emotions.push(emotion);
            readerDraft.stageShake = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('stage-shake-remove-emotion:')) {
        const emotion = decodeSeg(normalizedAction.slice('stage-shake-remove-emotion:'.length));
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeStageShakeSettings(readerDraft.stageShake);
        current.emotions = current.emotions.filter((item) => item !== emotion);
        readerDraft.stageShake = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    const perfPresetAction = normalizedAction.match(/^perf-preset:([a-z]+)$/);
    if (perfPresetAction) {
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        applyPerformancePreset(readerDraft, perfPresetAction[1]);
        return rerenderSettings();
    }

    const worldviewAction = normalizedAction.match(/^worldview:([a-z-]+)$/);
    if (worldviewAction) {
        const bridgeDraft = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridgeDraft.sceneAssets = bridgeDraft.sceneAssets || {};
        applyWorldview(sceneAssets, worldviewAction[1]);
        return rerenderSettings();
    }

    const fxWordAction = normalizedAction.match(/^fx-word-(add|remove):([^:]+)(?::(.*))?$/);
    if (fxWordAction) {
        const path = decodeSeg(fxWordAction[2]);
        if (!FX_WORD_LIST_PATHS.includes(path)) return rerenderSettings();
        const [top, ...rest] = path.split('.');
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = FX_SETTINGS_NORMALIZERS[top](readerDraft[top]);
        const parent = rest.slice(0, -1).reduce((obj, key) => obj[key], current);
        const leaf = rest[rest.length - 1];
        let changed = false;
        if (fxWordAction[1] === 'add') {
            const globalObj = options.global || globalThis;
            const raw = await dialogs.prompt('新增触发情绪（中文）：', '');
            const emotion = String(raw == null ? '' : raw).trim();
            if (emotion && !parent[leaf].includes(emotion) && !/[A-Za-z]/u.test(emotion) && /[\u3400-\u9fff]/u.test(emotion)) {
                parent[leaf].push(emotion);
                changed = true;
            }
        } else {
            const emotion = decodeSeg(fxWordAction[3] || '');
            parent[leaf] = parent[leaf].filter((item) => item !== emotion);
            changed = true;
        }
        if (changed) {
            readerDraft[top] = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    // Meta 互动台词：按「通用 / 角色」分组增删，弹窗输入。
    const metaLine = normalizedAction.match(/^meta-(line-add|line-remove|scope-add|scope-remove)(?::([^:]*))?(?::([a-zA-Z0-9]+))?(?::(\d+))?$/);
    if (metaLine) {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeMetaFxSettings(readerDraft.metaFx);
        const scope = metaLine[2] == null ? '' : decodeSeg(metaLine[2]);
        const kind = META_LINE_KINDS.includes(metaLine[3]) ? metaLine[3] : '';
        const ask = async (message) => {
            const raw = await dialogs.prompt(message, '');
            return raw == null ? '' : String(raw).trim();
        };
        let changed = false;
        if (metaLine[1] === 'line-add' && scope && kind) {
            const pools = current.lines[scope] = current.lines[scope] || {};
            const list = pools[kind] = pools[kind] || [];
            const line = list.length < META_LINES_MAX ? await ask('新增台词（不超过40个字）：') : '';
            if (line && !list.includes(line)) { list.push(line); changed = true; }
        } else if (metaLine[1] === 'line-remove' && scope && kind && current.lines[scope] && current.lines[scope][kind]) {
            current.lines[scope][kind].splice(Number(metaLine[4]), 1);
            changed = true;
        } else if (metaLine[1] === 'scope-add') {
            const name = await ask('角色名（与立绘角色名一致）：');
            if (name && name !== META_GLOBAL_SCOPE && !current.lines[name]) { current.lines[name] = {}; changed = true; }
        } else if (metaLine[1] === 'scope-remove' && scope && scope !== META_GLOBAL_SCOPE && current.lines[scope]) {
            delete current.lines[scope];
            changed = true;
        }
        if (changed) {
            readerDraft.metaFx = normalizeMetaFxSettings(current);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    // 亲密演出快捷动作：增 / 改 / 删，名称与模板用弹窗输入（模板里写 {角色} 代表当前立绘角色）。
    const romanceAction = normalizedAction.match(/^romance-action-(add|edit|remove)(?::(\d+))?$/);
    if (romanceAction) {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeRomanceFxSettings(readerDraft.romanceFx);
        const index = Number(romanceAction[2]);
        const ask = async (message, fallback) => {
            const raw = await dialogs.prompt(message, fallback);
            return raw == null ? null : String(raw).trim();
        };
        let changed = false;
        if (romanceAction[1] === 'remove' && current.actions[index]) {
            current.actions.splice(index, 1);
            changed = true;
        } else if (romanceAction[1] === 'add' && current.actions.length < ROMANCE_ACTIONS_MAX) {
            const name = await ask('动作名称（不超过8个字）：', '');
            const text = name ? await ask('写入输入框的文字，{角色} 会换成当前角色名：', `（{角色}）`) : null;
            if (name && text) { current.actions.push({ name, text }); changed = true; }
        } else if (romanceAction[1] === 'edit' && current.actions[index]) {
            const item = current.actions[index];
            const name = await ask('动作名称（不超过8个字）：', item.name);
            const text = name ? await ask('写入输入框的文字，{角色} 会换成当前角色名：', item.text) : null;
            if (name && text) { current.actions[index] = { name, text }; changed = true; }
        }
        if (changed) {
            readerDraft.romanceFx = normalizeRomanceFxSettings(current);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    const bgmTrackAction = normalizedAction.match(/^bgm-track-(add|edit|remove)(?::(.*))?$/);
    if (bgmTrackAction) {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeBgmSettings(readerDraft.bgm);
        const id = decodeSeg(bgmTrackAction[2] || '');
        const index = current.tracks.findIndex((track) => track.id === id);
        if (bgmTrackAction[1] === 'remove') {
            if (index < 0) return rerenderSettings();
            current.tracks.splice(index, 1);
        } else {
            const ask = (message, fallback) => dialogs.prompt(message, fallback);
            const existing = index >= 0 ? current.tracks[index] : null;
            if (bgmTrackAction[1] === 'edit' && !existing) return rerenderSettings();
            const url = await ask('音频直链（http/https）：', existing ? existing.url : '');
            if (url == null || !String(url).trim()) return rerenderSettings();
            const name = await ask('曲目名称：', existing ? existing.name : '');
            if (name == null) return rerenderSettings();
            const keywords = await ask('匹配关键词，用逗号或空格分隔（如 教室, 雨, 夜）；留空为默认曲：', existing ? existing.keywords.join(', ') : '');
            if (keywords == null) return rerenderSettings();
            const track = {
                id: existing ? existing.id : `t${Date.now().toString(36)}`,
                name: String(name).trim(),
                url: String(url).trim(),
                keywords: String(keywords).split(/[,，、\s]+/u).filter(Boolean),
            };
            if (existing) current.tracks[index] = track;
            else current.tracks.push(track);
            const normalized = normalizeBgmSettings(current);
            if (normalized.tracks.length < current.tracks.length) {
                if (typeof globalObj.alert === 'function') globalObj.alert('链接无效：只支持 http/https 音频直链。');
                return rerenderSettings();
            }
            current.tracks = normalized.tracks;
        }
        readerDraft.bgm = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    const weatherWordAdd = normalizedAction.match(/^weather-fx-add-(indoor|outdoor)$/);
    if (weatherWordAdd) {
        const scene = weatherWordAdd[1];
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeWeatherFxSettings(readerDraft.weatherFx);
        const listKey = `${scene}Words`;
        const raw = await dialogs.prompt(scene === 'indoor' ? '新增室内地点词：' : '新增室外地点词：', '');
        const word = String(raw == null ? '' : raw).trim();
        if (word && !current[listKey].includes(word)) {
            current[listKey].push(word);
            readerDraft.weatherFx = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    const weatherWordRemove = normalizedAction.match(/^weather-fx-remove-(indoor|outdoor):/);
    if (weatherWordRemove) {
        const listKey = `${weatherWordRemove[1]}Words`;
        const word = decodeSeg(normalizedAction.slice(weatherWordRemove[0].length));
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeWeatherFxSettings(readerDraft.weatherFx);
        current[listKey] = current[listKey].filter((item) => item !== word);
        readerDraft.weatherFx = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('status-avatar-pick:')) {
        const charName = decodeSeg(normalizedAction.slice('status-avatar-pick:'.length));
        const globalObj = options.global || globalThis;
        const doc = globalObj.document;
        if (!doc || !charName) return rerenderSettings();
        const picked = await pickStatusAvatarFile(doc);
        if (!picked) return rerenderSettings();
        if (picked.ok === false) {
            if (globalObj.alert) globalObj.alert(picked.reason === 'too-large' ? '图片过大，请选择更小的图片。' : '仅支持图片文件。');
            return rerenderSettings();
        }
        const sceneAssets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const avatars = normalizeStatusAvatars(sceneAssets.statusAvatars);
        avatars[charName] = picked.dataUrl;
        sceneAssets.statusAvatars = avatars;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('status-avatar-clear:')) {
        const charName = decodeSeg(normalizedAction.slice('status-avatar-clear:'.length));
        const sceneAssets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const avatars = normalizeStatusAvatars(sceneAssets.statusAvatars);
        delete avatars[charName];
        sceneAssets.statusAvatars = avatars;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'reset-virtual-regex') {
        settingsState.draft.bridge.virtualRegex = cloneData(DEFAULT_VIRTUAL_REGEX);
        settingsState.asyncState.virtualRegexPreview = '已恢复默认正文替换，已自动保存。';
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'test-virtual-regex') {
        settingsState.asyncState.virtualRegexPreview = buildRegexPreview(settingsState.draft.bridge);
        return rerenderSettings();
    }

    if (normalizedAction === 'add-virtual-regex') {
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const virtualRegex = bridge.virtualRegex = bridge.virtualRegex || {};
        const rules = Array.isArray(virtualRegex.rules) ? virtualRegex.rules.slice() : [];
        rules.push({ pattern: '', flags: '', replacement: '' });
        virtualRegex.rules = rules;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('remove-virtual-regex:')) {
        const index = Number(normalizedAction.slice('remove-virtual-regex:'.length));
        const virtualRegex = settingsState.draft.bridge && settingsState.draft.bridge.virtualRegex;
        const rules = virtualRegex && Array.isArray(virtualRegex.rules) ? virtualRegex.rules.slice() : [];
        if (!Number.isInteger(index) || index < 0 || index >= rules.length) return rerenderSettings();
        rules.splice(index, 1);
        virtualRegex.rules = rules;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'fetch-nai-models') {
        settingsState.asyncState.naiModels = NAI_OFFICIAL_MODELS.slice();
        settingsState.asyncState.naiModelsMessage = `NAI 官方没有模型列表接口，已载入内置 ${NAI_OFFICIAL_MODELS.length} 个模型（V5 / V4.5 / V4）。`;
        return rerenderSettings();
    }

    if (normalizedAction === 'fetch-llm-models') {
        if (typeof options.fetchLlmModels !== 'function') {
            settingsState.asyncState.llmModelsMessage = '当前未接入副 LLM 模型拉取能力。';
            return rerenderSettings();
        }
        try {
            const result = await options.fetchLlmModels({ settings: cloneData(settingsState.draft) });
            if (!result || result.ok === false || !Array.isArray(result.models) || !result.models.length) {
                settingsState.asyncState.llmModelsMessage = String(result && (result.reason || result.error) || '副 LLM 模型拉取失败。');
                return rerenderSettings();
            }
            settingsState.asyncState.llmModels = result.models;
            settingsState.asyncState.llmModelsMessage = String(result.message || `已拉取 ${result.models.length} 个副 LLM 模型。`);
        } catch (error) {
            settingsState.asyncState.llmModelsMessage = String(error && error.message || '副 LLM 模型拉取失败。');
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'fetch-image-models') {
        if (typeof options.fetchImageModels !== 'function') {
            settingsState.asyncState.imageModelsMessage = '当前未接入内置图像模型拉取能力。';
            return rerenderSettings();
        }
        let result;
        try {
            result = await options.fetchImageModels({
                settings: cloneImageDraft(settingsState.draft),
                message: state.activeReader && state.activeReader.payload && state.activeReader.payload.message || null,
                mode: settingsState.readerMode,
            });
        } catch (error) {
            result = { ok: false, reason: `图像模型拉取失败：${error && error.message || error}` };
        }
        if (!result || result.ok === false) {
            settingsState.asyncState.imageModelsMessage = String(result && result.reason || '图像模型拉取失败');
            return rerenderSettings();
        }
        settingsState.draft.bridge.imageApi.availableModels = Array.isArray(result.models)
            ? result.models.filter(Boolean)
            : [];
        settingsState.draft.bridge.imageApi.modelsFetchedAt = String(result.modelsFetchedAt || new Date().toISOString());
        settingsState.asyncState.imageModelsMessage = String(result.message || `已拉取 ${settingsState.draft.bridge.imageApi.availableModels.length} 个模型。`);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'image-log-refresh' || normalizedAction === 'image-log-clear' || normalizedAction === 'image-log-copy') {
        const log = options.imageJobLog;
        if (!log || typeof log.list !== 'function') {
            settingsState.asyncState.imageLogStatus = '当前未接入生图日志。';
            return rerenderSettings();
        }
        if (normalizedAction === 'image-log-clear') {
            const result = log.clear();
            settingsState.asyncState.imageLogStatus = `已清空 ${result.removed} 条日志。`;
        } else if (normalizedAction === 'image-log-copy') {
            const text = formatImageJobLogText(log.list());
            const root = options.global || globalThis;
            const clipboard = root && root.navigator && root.navigator.clipboard;
            if (!text) {
                settingsState.asyncState.imageLogStatus = '暂无日志可复制。';
            } else if (clipboard && typeof clipboard.writeText === 'function') {
                try {
                    await clipboard.writeText(text);
                    settingsState.asyncState.imageLogStatus = '已复制全部日志到剪贴板。';
                } catch (error) {
                    settingsState.asyncState.imageLogStatus = '复制失败：浏览器拒绝访问剪贴板，可手动选中日志复制。';
                }
            } else {
                settingsState.asyncState.imageLogStatus = '当前环境不支持剪贴板，可手动选中日志复制。';
            }
        } else {
            const pruned = typeof log.prune === 'function' ? log.prune().removed : 0;
            settingsState.asyncState.imageLogStatus = pruned ? `已按自动清理规则移除 ${pruned} 条旧日志。` : '';
        }
        return rerenderSettings();
    }

    // 生图 › CG 库「刷新」：丢弃已读列表，重绘时重新读取。
    if (normalizedAction === 'image-cg-refresh') {
        settingsState.asyncState.imageCgEntries = null;
        settingsState.asyncState.imageCgStatus = '';
        return rerenderSettings();
    }

    if (normalizedAction === 'open-dbgen-settings') {
        const api = findDbgenApi(options.global || globalThis);
        if (!api || typeof api.openManagement !== 'function') {
            settingsState.asyncState.imageResult = '未检测到数据库生图插件，请确认已安装并启用。';
            return rerenderSettings();
        }
        await api.openManagement();
        return { ok: true };
    }

    if (normalizedAction === 'test-image') {
        if (typeof options.testImageApi !== 'function') {
            settingsState.asyncState.imageResult = '当前未接入图像测试能力。';
            return rerenderSettings();
        }
        let result;
        try {
            result = await options.testImageApi({
                settings: cloneImageDraft(settingsState.draft),
                message: state.activeReader && state.activeReader.payload && state.activeReader.payload.message || null,
                mode: settingsState.readerMode,
            });
        } catch (error) {
            result = { ok: false, message: `测试失败：${error && error.message || error}` };
        }
        settingsState.asyncState.imageResult = String(
            result && (result.message || result.reason)
            || (settingsState.draft.bridge.imageApi.mode === 'nai'
                ? '图像 API 生成测试失败。'
                : '插图扩展检测失败。'),
        );
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toggle-toolbar-pin:')) {
        const id = normalizedAction.slice('toggle-toolbar-pin:'.length);
        const allowed = TOOLBAR_ACTIONS.some(([actionId]) => actionId === id);
        if (!allowed) return { ok: false, reason: 'unknown-toolbar-pin', id };
        const currentPins = Array.isArray(settingsState.draft.readerSettings.pinnedBtns)
            ? settingsState.draft.readerSettings.pinnedBtns.slice()
            : [];
        const currentHidden = Array.isArray(settingsState.draft.readerSettings.hiddenBtns)
            ? settingsState.draft.readerSettings.hiddenBtns.slice()
            : [];
        const index = currentPins.indexOf(id);
        if (index >= 0) {
            currentPins.splice(index, 1);
        } else {
            if (!currentHidden.includes(id)) currentPins.push(id);
        }
        settingsState.draft.readerSettings.pinnedBtns = currentPins;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toolbar-toggle-visible:')) {
        const id = normalizedAction.slice('toolbar-toggle-visible:'.length);
        const allowed = TOOLBAR_ACTIONS.some(([actionId]) => actionId === id);
        if (!allowed) return { ok: false, reason: 'unknown-toolbar-btn', id };
        const currentHidden = Array.isArray(settingsState.draft.readerSettings.hiddenBtns)
            ? settingsState.draft.readerSettings.hiddenBtns.slice()
            : [];
        const idx = currentHidden.indexOf(id);
        if (idx >= 0) {
            currentHidden.splice(idx, 1);
        } else {
            currentHidden.push(id);
            const currentPins = Array.isArray(settingsState.draft.readerSettings.pinnedBtns)
                ? settingsState.draft.readerSettings.pinnedBtns.slice()
                : [];
            const pinIdx = currentPins.indexOf(id);
            if (pinIdx >= 0) {
                currentPins.splice(pinIdx, 1);
                settingsState.draft.readerSettings.pinnedBtns = currentPins;
            }
        }
        settingsState.draft.readerSettings.hiddenBtns = currentHidden;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toolbar-move-up:')) {
        const id = normalizedAction.slice('toolbar-move-up:'.length);
        const order = Array.isArray(settingsState.draft.readerSettings.btnOrder)
            ? settingsState.draft.readerSettings.btnOrder.slice()
            : TOOLBAR_ACTIONS.map(([actionId]) => actionId);
        const currentIndex = order.indexOf(id);
        if (currentIndex <= 0) return { ok: true, reason: 'already-first' };
        [order[currentIndex - 1], order[currentIndex]] = [order[currentIndex], order[currentIndex - 1]];
        settingsState.draft.readerSettings.btnOrder = order;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'reset-prompt-rule') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.promptRule = DEFAULT_SCENE_PROMPT_RULE;
        settingsState.asyncState.promptRuleDraft = DEFAULT_SCENE_PROMPT_RULE;
        settingsState.asyncState.promptRuleStatus = '已恢复默认提示词并保存。';
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'save-prompt-rule') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const nextRule = typeof settingsState.asyncState.promptRuleDraft === 'string'
            ? settingsState.asyncState.promptRuleDraft
            : String(settingsState.draft.bridge.sceneAssets.promptRule || '');
        settingsState.draft.bridge.sceneAssets.promptRule = nextRule;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) {
            settingsState.asyncState.promptRuleStatus = '保存失败，请重试。';
            return rerenderSettings();
        }
        settingsState.asyncState.promptRuleDraft = nextRule;
        settingsState.asyncState.promptRuleStatus = '提示词已保存并更新注入规则。';
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-add-bg') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.scenes = settingsState.draft.bridge.sceneAssets.scenes || {};
        const existingKeys = Object.keys(settingsState.draft.bridge.sceneAssets.scenes);
        const newName = '场景' + (existingKeys.length + 1);
        settingsState.draft.bridge.sceneAssets.scenes[newName] = { url: '', times: {} };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 素材库「新增 → 下载默认素材」：把内置默认背景包合并进当前场景素材，同名跳过、不覆盖，并归入默认文件夹。
    if (normalizedAction === 'scene-add-default-bg') {
        const globalObj = options.global || globalThis;
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const sceneAssets = settingsState.draft.bridge.sceneAssets;
        const merged = mergeDefaultBackgrounds(sceneAssets.scenes);
        if (!merged.added.length) {
            if (globalObj.alert) globalObj.alert(`默认素材已全部在素材库里（${merged.skipped.length} 个同名场景已跳过）。`);
            return rerenderSettings();
        }
        const skippedNote = merged.skipped.length ? `已有的 ${merged.skipped.length} 个同名场景会跳过，不覆盖。` : '';
        if (!await dialogs.confirm(`下载 ${merged.added.length} 个默认背景到素材库？${skippedNote}`, { okLabel: '下载' })) return rerenderSettings();
        const previousScenes = sceneAssets.scenes;
        sceneAssets.scenes = merged.scenes;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) {
            sceneAssets.scenes = previousScenes;
            return persisted;
        }
        const { storage, scope } = assetFolderScope(settingsState, options);
        let folders = loadAssetFolders(storage, scope);
        for (const { name, folder } of merged.added) {
            if (!folder) continue;
            if (!folders.scenes.folders.includes(folder)) folders = addAssetFolder(folders, 'scenes', folder);
            folders = moveAssetToFolder(folders, 'scenes', name, folder);
        }
        saveAssetFolders(storage, scope, folders);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-bg:')) {
        const name = decodeSeg(normalizedAction.slice('scene-remove-bg:'.length));
        forgetAssetFolderItem(settingsState, options, 'scenes', name);
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.scenes = settingsState.draft.bridge.sceneAssets.scenes || {};
        delete settingsState.draft.bridge.sceneAssets.scenes[name];
        renameOutfitScene(settingsState.draft.bridge.sceneAssets.characterOutfits, name, '');
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-bg:')) {
        const oldName = decodeSeg(normalizedAction.slice('scene-rename-bg:'.length));
        const globalObj = options.global || globalThis;
        const newName = ((await dialogs.prompt(`重命名场景「${oldName}」为：`, oldName)) || '').trim();
        if (newName && newName !== oldName) {
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            const scenes = settingsState.draft.bridge.sceneAssets.scenes || {};
            if (Object.prototype.hasOwnProperty.call(scenes, newName)) {
                if (globalObj.alert) globalObj.alert(`场景「${newName}」已存在（同名），已阻止`);
                return rerenderSettings();
            }
            settingsState.draft.bridge.sceneAssets.scenes = reorderKey(scenes, oldName, newName);
            renameOutfitScene(settingsState.draft.bridge.sceneAssets.characterOutfits, oldName, newName);
            const sl = settingsState.asyncState.expandedSceneSlots;
            renameSetPrefix(sl, `bg\x00${oldName}`, `bg\x00${newName}`);
            renameSetPrefix(sl, `time\x00${oldName}\x00`, `time\x00${newName}\x00`);
            renameSetPrefix(sl, `weather\x00${oldName}\x00`, `weather\x00${newName}\x00`);
            syncAssetFolderItem(settingsState, options, 'scenes', oldName, newName);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-bg-url:')) {
        const rest = normalizedAction.slice('scene-set-bg-url:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const name = decodeSeg(rest.slice(0, colonIdx));
            const url = rest.slice(colonIdx + 1);
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            settingsState.draft.bridge.sceneAssets.scenes = settingsState.draft.bridge.sceneAssets.scenes || {};
            const scene = settingsState.draft.bridge.sceneAssets.scenes[name];
            if (scene && typeof scene === 'object') {
                scene.url = url;
            } else {
                settingsState.draft.bridge.sceneAssets.scenes[name] = { url, times: {} };
            }
        }
        return { ok: true };
    }

    if (normalizedAction.startsWith('scene-add-time:')) {
        const sceneName = decodeSeg(normalizedAction.slice('scene-add-time:'.length));
        const globalObj = options.global || globalThis;
        const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
        const scene = scenes[sceneName];
        if (scene && typeof scene === 'object') {
            const newTime = ((await dialogs.prompt('时间名称（建议与时间组名一致）：', '')) || '').trim();
            if (!newTime) return rerenderSettings();
            scene.times = scene.times || {};
            if (Object.prototype.hasOwnProperty.call(scene.times, newTime)) {
                if (globalObj.alert) globalObj.alert(`「${sceneName}」已有时间「${newTime}」（同名）`);
                return rerenderSettings();
            }
            scene.times[newTime] = { url: '', weathers: {} };
            const timeGroups = ensureTimeGroups(settingsState);
            if (!timeGroups.some((g) => g.label === newTime)) timeGroups.unshift({ label: newTime, words: [newTime] });
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-time:')) {
        const rest = normalizedAction.slice('scene-remove-time:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const sceneName = decodeSeg(rest.slice(0, colonIdx));
            const timeName = decodeSeg(rest.slice(colonIdx + 1));
            const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
            const scene = scenes[sceneName];
            if (scene && scene.times) delete scene.times[timeName];
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-time:')) {
        const rest = normalizedAction.slice('scene-rename-time:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const sceneName = decodeSeg(rest.slice(0, colonIdx));
            const oldTime = decodeSeg(rest.slice(colonIdx + 1));
            const globalObj = options.global || globalThis;
            const newTime = ((await dialogs.prompt(`重命名时间「${oldTime}」为：`, oldTime)) || '').trim();
            if (newTime && newTime !== oldTime) {
                const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                const scene = scenes[sceneName];
                if (scene && scene.times) {
                    if (Object.prototype.hasOwnProperty.call(scene.times, newTime)) {
                        if (globalObj.alert) globalObj.alert(`时间「${newTime}」已存在（同名），已阻止`);
                        return rerenderSettings();
                    }
                    scene.times = reorderKey(scene.times, oldTime, newTime);
                    // global sync: rename same time slot in all other scenes
                    for (const [otherSn, otherSv] of Object.entries(scenes)) {
                        if (otherSn === sceneName || !otherSv || typeof otherSv !== 'object') continue;
                        if (Object.prototype.hasOwnProperty.call(otherSv.times || {}, oldTime)
                            && !Object.prototype.hasOwnProperty.call(otherSv.times, newTime)) {
                            otherSv.times = reorderKey(otherSv.times, oldTime, newTime);
                        }
                    }
                    // sync timeGroups label
                    const timeGroups = ensureTimeGroups(settingsState);
                    const tg = timeGroups.find((g) => g.label === oldTime);
                    if (tg) {
                        tg.label = newTime;
                        const wi = Array.isArray(tg.words) ? tg.words.indexOf(oldTime) : -1;
                        if (wi >= 0) tg.words[wi] = newTime;
                    }
                    // update Set keys for all scenes
                    const sl = settingsState.asyncState.expandedSceneSlots;
                    for (const sn of Object.keys(scenes)) {
                        renameSetPrefix(sl, `time\x00${sn}\x00${oldTime}`, `time\x00${sn}\x00${newTime}`);
                        renameSetPrefix(sl, `weather\x00${sn}\x00${oldTime}\x00`, `weather\x00${sn}\x00${newTime}\x00`);
                    }
                    const persisted = persistSettingsDraft();
                    if (persisted.ok === false) return persisted;
                }
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-time-url:')) {
        const rest = normalizedAction.slice('scene-set-time-url:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const url = after.slice(second + 1);
                const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                const scene = scenes[sceneName];
                if (scene && scene.times && scene.times[timeName] != null) {
                    const t = scene.times[timeName];
                    if (typeof t === 'object') t.url = url;
                    else scene.times[timeName] = { url, weathers: {} };
                    const persisted = persistSettingsDraft();
                    if (persisted.ok === false) return persisted;
                }
            }
        }
        return { ok: true };
    }

    if (normalizedAction.startsWith('scene-add-weather:')) {
        const rest = normalizedAction.slice('scene-add-weather:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const sceneName = decodeSeg(rest.slice(0, colonIdx));
            const timeName = decodeSeg(rest.slice(colonIdx + 1));
            const globalObj = options.global || globalThis;
            const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
            const scene = scenes[sceneName];
            if (scene && scene.times && typeof scene.times[timeName] === 'object') {
                const timeEntry = scene.times[timeName];
                const newWeather = ((await dialogs.prompt('天气名称（建议与天气组名一致）：', '')) || '').trim();
                if (!newWeather) return rerenderSettings();
                timeEntry.weathers = timeEntry.weathers || {};
                if (Object.prototype.hasOwnProperty.call(timeEntry.weathers, newWeather)) {
                    if (globalObj.alert) globalObj.alert(`「${timeName}」已有天气「${newWeather}」（同名）`);
                    return rerenderSettings();
                }
                timeEntry.weathers[newWeather] = { url: '' };
                const weatherGroups = ensureWeatherGroups(settingsState);
                if (!weatherGroups.some((g) => g.label === newWeather)) weatherGroups.unshift({ label: newWeather, words: [newWeather] });
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-weather:')) {
        const rest = normalizedAction.slice('scene-remove-weather:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const weatherName = decodeSeg(after.slice(second + 1));
                const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                const scene = scenes[sceneName];
                if (scene && scene.times && scene.times[timeName]) {
                    const t = scene.times[timeName];
                    if (t && t.weathers) delete t.weathers[weatherName];
                }
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-weather:')) {
        const rest = normalizedAction.slice('scene-rename-weather:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const oldWeather = decodeSeg(after.slice(second + 1));
                const globalObj = options.global || globalThis;
                const newWeather = ((await dialogs.prompt(`重命名天气「${oldWeather}」为：`, oldWeather)) || '').trim();
                if (newWeather && newWeather !== oldWeather) {
                    const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                    const scene = scenes[sceneName];
                    if (scene && scene.times && scene.times[timeName]) {
                        const t = scene.times[timeName];
                        if (t && t.weathers) {
                            if (Object.prototype.hasOwnProperty.call(t.weathers, newWeather)) {
                                if (globalObj.alert) globalObj.alert(`天气「${newWeather}」已存在（同名），已阻止`);
                                return rerenderSettings();
                            }
                            // global sync: rename same weather slot across all scenes/times
                            for (const [gsn, gsv] of Object.entries(scenes)) {
                                if (!gsv || typeof gsv !== 'object') continue;
                                for (const [gtn, gtv] of Object.entries(gsv.times || {})) {
                                    if (!gtv || typeof gtv !== 'object') continue;
                                    const gw = gtv.weathers || {};
                                    if (Object.prototype.hasOwnProperty.call(gw, oldWeather)
                                        && !Object.prototype.hasOwnProperty.call(gw, newWeather)) {
                                        const ow = gw[oldWeather];
                                        gw[oldWeather] = typeof ow === 'string' ? { url: ow } : (ow || { url: '' });
                                        gtv.weathers = reorderKey(gw, oldWeather, newWeather);
                                    }
                                }
                            }
                            // sync weatherGroups label
                            const weatherGroups = ensureWeatherGroups(settingsState);
                            const wg = weatherGroups.find((g) => g.label === oldWeather);
                            if (wg) {
                                wg.label = newWeather;
                                const wi = Array.isArray(wg.words) ? wg.words.indexOf(oldWeather) : -1;
                                if (wi >= 0) wg.words[wi] = newWeather;
                            }
                            // update Set keys for all scenes/times
                            const sl = settingsState.asyncState.expandedSceneSlots;
                            for (const [gsn2, gsv2] of Object.entries(scenes)) {
                                if (!gsv2 || typeof gsv2 !== 'object') continue;
                                for (const gtn2 of Object.keys(gsv2.times || {})) {
                                    renameSetPrefix(sl, `weather\x00${gsn2}\x00${gtn2}\x00${oldWeather}`, `weather\x00${gsn2}\x00${gtn2}\x00${newWeather}`);
                                }
                            }
                            const persisted = persistSettingsDraft();
                            if (persisted.ok === false) return persisted;
                        }
                    }
                }
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-weather-url:')) {
        const rest = normalizedAction.slice('scene-set-weather-url:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const after2 = after.slice(second + 1);
                const third = after2.indexOf(':');
                if (third > 0) {
                    const weatherName = decodeSeg(after2.slice(0, third));
                    const url = after2.slice(third + 1);
                    const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                    const scene = scenes[sceneName];
                    if (scene && scene.times && scene.times[timeName]) {
                        const t = scene.times[timeName];
                        if (t && t.weathers) {
                        const existing = t.weathers[weatherName];
                        if (existing && typeof existing === 'object') {
                            existing.url = url;
                        } else {
                            t.weathers[weatherName] = { url, words: [] };
                        }
                    }
                    }
                }
            }
        }
        return { ok: true };
    }

    const outfitResult = handleOutfitAction(normalizedAction, { settingsState, options, persistSettingsDraft, rerenderSettings, dialogs });
    if (outfitResult) return outfitResult;

    if (normalizedAction === 'scene-add-char') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
        settingsState.draft.bridge.sceneAssets.characterAliases = settingsState.draft.bridge.sceneAssets.characterAliases || {};
        const existingKeys = Object.keys(settingsState.draft.bridge.sceneAssets.characters);
        const newName = '角色' + (existingKeys.length + 1);
        settingsState.draft.bridge.sceneAssets.characters[newName] = { '默认': '' };
        settingsState.draft.bridge.sceneAssets.characterAliases[newName] = [];
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // DNA-only 角色：先登记资料、后补立绘；主名与别名沿用既有冲突规则。
    if (normalizedAction === 'scene-add-dna-char' || normalizedAction.startsWith('scene-rename-dna-char:')) {
        const globalObj = options.global || globalThis;
        const renaming = normalizedAction !== 'scene-add-dna-char';
        const oldName = renaming ? decodeSeg(normalizedAction.slice('scene-rename-dna-char:'.length)) : '';
        const name = ((await dialogs.prompt(renaming ? `重命名角色 DNA「${oldName}」为：` : '新增角色 DNA，角色名：', oldName)) || '').trim();
        if (!name || name === oldName) return rerenderSettings();
        const sceneAssets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const characters = sceneAssets.characters || {};
        const aliases = ensureCharacterAliases(settingsState);
        const alertFn = (msg) => { if (globalObj.alert) globalObj.alert(msg); };
        if (['__proto__', 'constructor', 'prototype'].includes(name)) { alertFn(`「${name}」不能用作角色名`); return rerenderSettings(); }
        const aliasOwner = Object.keys(aliases).find((n) => Array.isArray(aliases[n]) && aliases[n].includes(name));
        if (aliasOwner) { alertFn(`「${name}」已是角色「${aliasOwner}」的别名，请编辑主角色的 DNA`); return rerenderSettings(); }
        const dnaMap = normalizeCharacterDnaMap(sceneAssets.characterDna);
        if (renaming) {
            if (Object.prototype.hasOwnProperty.call(characters, oldName)) return rerenderSettings();
            if (Object.prototype.hasOwnProperty.call(characters, name)) { alertFn(`角色「${name}」已存在（同名）`); return rerenderSettings(); }
            const result = renameCharacterDna(dnaMap, oldName, name);
            if (!result.ok) { alertFn(`角色 DNA 中已有「${name}」，已阻止`); return rerenderSettings(); }
            sceneAssets.characterDna = result.map;
        } else {
            if (Object.prototype.hasOwnProperty.call(dnaMap, name)) { alertFn(`角色「${name}」已有 DNA`); return rerenderSettings(); }
            dnaMap[name] = normalizeCharacterDna(null);
            sceneAssets.characterDna = dnaMap;
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-dna-char:')) {
        const name = decodeSeg(normalizedAction.slice('scene-remove-dna-char:'.length));
        const sceneAssets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const globalObj = options.global || globalThis;
        if (!await dialogs.confirm(`删除角色「${name}」的 DNA？`)) return rerenderSettings();
        sceneAssets.characterDna = removeCharacterDna(sceneAssets.characterDna, name);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 审核卡传来的 DNA 候选：只在用户点「采用」时写入 defaultAppearance，且不覆盖已填写内容。
    if (normalizedAction === 'scene-accept-dna-candidate') {
        const candidate = settingsState.asyncState.dnaCandidate;
        const name = candidate && typeof candidate.name === 'string' ? candidate.name.trim() : '';
        if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)) {
            settingsState.asyncState.dnaCandidate = null;
            return rerenderSettings();
        }
        const sceneAssets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const dnaMap = normalizeCharacterDnaMap(sceneAssets.characterDna);
        const entry = Object.prototype.hasOwnProperty.call(dnaMap, name) ? dnaMap[name] : normalizeCharacterDna(null);
        if (!entry.defaultAppearance) entry.defaultAppearance = String(candidate.tags || '').trim();
        dnaMap[name] = entry;
        sceneAssets.characterDna = dnaMap;
        settingsState.asyncState.dnaCandidate = null;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-dismiss-dna-candidate') {
        settingsState.asyncState.dnaCandidate = null;
        return rerenderSettings();
    }

    // 生图设置页的「管理角色 DNA」只跳转到场景 → 角色分页，DNA 仍只有一份权威数据。
    if (normalizedAction === 'open-character-dna') {
        settingsState.tab = 'scene';
        settingsState.asyncState.sceneSubTab = 'characters';
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-char:')) {
        const name = decodeSeg(normalizedAction.slice('scene-remove-char:'.length));
        forgetAssetFolderItem(settingsState, options, 'characters', name);
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
        settingsState.draft.bridge.sceneAssets.characterAliases = settingsState.draft.bridge.sceneAssets.characterAliases || {};
        delete settingsState.draft.bridge.sceneAssets.characters[name];
        delete settingsState.draft.bridge.sceneAssets.characterAliases[name];
        if (settingsState.draft.bridge.sceneAssets.statusAvatars && typeof settingsState.draft.bridge.sceneAssets.statusAvatars === 'object') {
            delete settingsState.draft.bridge.sceneAssets.statusAvatars[name];
        }
        if (settingsState.draft.bridge.sceneAssets.characterHouses && typeof settingsState.draft.bridge.sceneAssets.characterHouses === 'object') {
            delete settingsState.draft.bridge.sceneAssets.characterHouses[name];
        }
        settingsState.draft.bridge.sceneAssets.characterDna = removeCharacterDna(settingsState.draft.bridge.sceneAssets.characterDna, name);
        if (settingsState.draft.bridge.sceneAssets.characterOutfits && typeof settingsState.draft.bridge.sceneAssets.characterOutfits === 'object') {
            delete settingsState.draft.bridge.sceneAssets.characterOutfits[name];
        }
        migrateSpriteKeys(settingsState.draft.readerSettings, { character: name }, null);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-add-char-alias:')) {
        const charName = decodeSeg(normalizedAction.slice('scene-add-char-alias:'.length));
        const globalObj = options.global || globalThis;
        const alias = ((await dialogs.prompt(`为角色「${charName}」添加别名：`, '')) || '').trim();
        if (!alias) return rerenderSettings();
        const sceneAssets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const characters = sceneAssets.characters || {};
        const aliases = ensureCharacterAliases(settingsState);
        if (Object.prototype.hasOwnProperty.call(characters, alias)) {
            if (globalObj.alert) globalObj.alert(`「${alias}」已是角色主名称`);
            return rerenderSettings();
        }
        const duplicateOwner = Object.keys(aliases).find((name) => Array.isArray(aliases[name]) && aliases[name].includes(alias));
        if (duplicateOwner) {
            if (globalObj.alert) globalObj.alert(`别名「${alias}」已属于角色「${duplicateOwner}」`);
            return rerenderSettings();
        }
        if (!Object.prototype.hasOwnProperty.call(characters, charName)) return rerenderSettings();
        aliases[charName].push(alias);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-char-alias:')) {
        const rest = normalizedAction.slice('scene-remove-char-alias:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const alias = decodeSeg(rest.slice(colonIdx + 1));
            const aliases = ensureCharacterAliases(settingsState);
            aliases[charName] = (aliases[charName] || []).filter((value) => value !== alias);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-add-mood:')) {
        const charName = decodeSeg(normalizedAction.slice('scene-add-mood:'.length));
        const globalObj = options.global || globalThis;
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
        const char = settingsState.draft.bridge.sceneAssets.characters[charName];
        if (char && typeof char === 'object') {
            const newMood = ((await dialogs.prompt('情绪/槽名称（建议与情绪组名一致）：', '')) || '').trim();
            if (!newMood) return rerenderSettings();
            if (Object.prototype.hasOwnProperty.call(char, newMood)) {
                if (globalObj.alert) globalObj.alert(`「${charName}」已有「${newMood}」槽（同名）`);
                return rerenderSettings();
            }
            char[newMood] = '';
            // 槽名若在词库中无对应组，自动建组并把组名作为第一个词
            const groups = ensureMoodGroups(settingsState);
            if (!groups.some((g) => g.label === newMood)) {
                groups.unshift({ label: newMood, words: [newMood] });
            }
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-mood:')) {
        const rest = normalizedAction.slice('scene-remove-mood:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const mood = decodeSeg(rest.slice(colonIdx + 1));
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
            const char = settingsState.draft.bridge.sceneAssets.characters[charName];
            if (char && typeof char === 'object') delete char[mood];
            migrateSpriteKeys(settingsState.draft.readerSettings, { character: charName, outfit: '', mood }, null);
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-mood-url:')) {
        const rest = normalizedAction.slice('scene-set-mood-url:'.length);
        const firstColon = rest.indexOf(':');
        if (firstColon > 0) {
            const charName = decodeSeg(rest.slice(0, firstColon));
            const afterChar = rest.slice(firstColon + 1);
            const secondColon = afterChar.indexOf(':');
            if (secondColon > 0) {
                const mood = decodeSeg(afterChar.slice(0, secondColon));
                const url = afterChar.slice(secondColon + 1);
                settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
                settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
                if (!settingsState.draft.bridge.sceneAssets.characters[charName]) {
                    settingsState.draft.bridge.sceneAssets.characters[charName] = {};
                }
                settingsState.draft.bridge.sceneAssets.characters[charName][mood] = url;
            }
        }
        return { ok: true };
    }

    if (normalizedAction.startsWith('scene-rename-char:')) {
        const oldName = decodeSeg(normalizedAction.slice('scene-rename-char:'.length));
        const globalObj = options.global || globalThis;
        const newName = ((await dialogs.prompt(`重命名角色「${oldName}」为：`, oldName)) || '').trim();
        if (newName && newName !== oldName) {
            const sceneAssets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            const chars = sceneAssets.characters || {};
            const aliases = ensureCharacterAliases(settingsState);
            if (Object.prototype.hasOwnProperty.call(chars, newName)) {
                if (globalObj.alert) globalObj.alert(`角色「${newName}」已存在（同名）`);
                return rerenderSettings();
            }
            const aliasOwner = Object.keys(aliases).find((name) => Array.isArray(aliases[name]) && aliases[name].includes(newName));
            if (aliasOwner) {
                if (globalObj.alert) globalObj.alert(`「${newName}」已是角色「${aliasOwner}」的别名`);
                return rerenderSettings();
            }
            const dnaRename = renameCharacterDna(sceneAssets.characterDna, oldName, newName);
            if (!dnaRename.ok) {
                if (globalObj.alert) globalObj.alert(dnaRename.reason === 'name-exists' ? `角色 DNA 中已有「${newName}」，改名会覆盖其资料，已阻止` : `「${newName}」不能用作角色名`);
                return rerenderSettings();
            }
            sceneAssets.characters = reorderKey(chars, oldName, newName);
            sceneAssets.characterAliases = reorderKey(aliases, oldName, newName);
            if (sceneAssets.statusAvatars && typeof sceneAssets.statusAvatars === 'object') {
                sceneAssets.statusAvatars = reorderKey(sceneAssets.statusAvatars, oldName, newName);
            }
            if (sceneAssets.characterHouses && typeof sceneAssets.characterHouses === 'object') {
                sceneAssets.characterHouses = reorderKey(sceneAssets.characterHouses, oldName, newName);
            }
            if (sceneAssets.characterDna && typeof sceneAssets.characterDna === 'object') {
                sceneAssets.characterDna = dnaRename.map;
            }
            if (sceneAssets.characterOutfits && typeof sceneAssets.characterOutfits === 'object' && !Array.isArray(sceneAssets.characterOutfits)) {
                sceneAssets.characterOutfits = reorderKey(sceneAssets.characterOutfits, oldName, newName);
            }
            migrateSpriteKeys(settingsState.draft.readerSettings, { character: oldName }, { character: newName });
            renameSetPrefix(settingsState.asyncState.expandedSpriteSlots, `${oldName}\x00`, `${newName}\x00`);
            syncAssetFolderItem(settingsState, options, 'characters', oldName, newName);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-mood:')) {
        const rest = normalizedAction.slice('scene-rename-mood:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const oldMood = decodeSeg(rest.slice(colonIdx + 1));
            const globalObj = options.global || globalThis;
            const newMood = ((await dialogs.prompt(`重命名情绪「${oldMood}」为：`, oldMood)) || '').trim();
            if (newMood && newMood !== oldMood) {
                settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
                const chars = settingsState.draft.bridge.sceneAssets.characters || {};
                // 同名检查：该角色已有同名槽，或词库已有同名情绪组 → 阻止，避免覆盖丢失
                if (chars[charName] && Object.prototype.hasOwnProperty.call(chars[charName], newMood)) {
                    if (globalObj.alert) globalObj.alert(`「${charName}」已有「${newMood}」槽（同名），改名会覆盖，已阻止`);
                    return rerenderSettings();
                }
                const groups = ensureMoodGroups(settingsState);
                if (groups.some((g) => g.label === newMood && g.label !== oldMood)) {
                    if (globalObj.alert) globalObj.alert(`词库已有情绪组「${newMood}」（同名），改名会覆盖，已阻止`);
                    return rerenderSettings();
                }
                // 改角色槽名
                if (chars[charName]) {
                    chars[charName] = reorderKey(chars[charName], oldMood, newMood);
                    renameSetPrefix(settingsState.asyncState.expandedSpriteSlots, `${charName}\x00${oldMood}`, `${charName}\x00${newMood}`);
                    migrateSpriteKeys(settingsState.draft.readerSettings, { character: charName, outfit: '', mood: oldMood }, { mood: newMood });
                }
                // 同步词库里同名情绪组的组名（全局：所有角色用到该组名的槽一起改）
                const group = groups.find((g) => g.label === oldMood);
                if (group) {
                    group.label = newMood;
                    const wordIdx = Array.isArray(group.words) ? group.words.indexOf(oldMood) : -1;
                    if (wordIdx >= 0) group.words[wordIdx] = newMood;
                    for (const otherName of Object.keys(chars)) {
                        if (otherName === charName) continue;
                        const other = chars[otherName];
                        if (other && typeof other === 'object' && Object.prototype.hasOwnProperty.call(other, oldMood)
                            && !Object.prototype.hasOwnProperty.call(other, newMood)) {
                            chars[otherName] = reorderKey(other, oldMood, newMood);
                            renameSetPrefix(settingsState.asyncState.expandedSpriteSlots, `${otherName}\x00${oldMood}`, `${otherName}\x00${newMood}`);
                            migrateSpriteKeys(settingsState.draft.readerSettings, { character: otherName, outfit: '', mood: oldMood }, { mood: newMood });
                        }
                    }
                }
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'reset-mood-groups') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.moodGroups = cloneData(DEFAULT_MOOD_GROUPS);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'mood-add-group') {
        const globalObj = options.global || globalThis;
        const groups = ensureMoodGroups(settingsState);
        const raw = ((await dialogs.prompt('新情绪组名称：', '')) || '').trim();
        if (!raw) return rerenderSettings();
        if (groups.some((g) => g.label === raw)) {
            if (globalObj.alert) globalObj.alert(`情绪组「${raw}」已存在（同名）`);
            return rerenderSettings();
        }
        // 组名自动作为该组第一个词
        groups.unshift({ label: raw, words: [raw] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-remove-group:')) {
        const label = decodeSeg(normalizedAction.slice('mood-remove-group:'.length));
        const groups = ensureMoodGroups(settingsState);
        const idx = groups.findIndex((g) => g.label === label);
        if (idx >= 0) groups.splice(idx, 1);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-rename-group:')) {
        const oldLabel = decodeSeg(normalizedAction.slice('mood-rename-group:'.length));
        const globalObj = options.global || globalThis;
        const newLabel = ((await dialogs.prompt(`重命名情绪组「${oldLabel}」为：`, oldLabel)) || '').trim();
        if (newLabel && newLabel !== oldLabel) {
            const groups = ensureMoodGroups(settingsState);
            if (groups.some((g) => g.label === newLabel)) {
                if (globalObj.alert) globalObj.alert(`情绪组「${newLabel}」已存在`);
                return rerenderSettings();
            }
            const group = groups.find((g) => g.label === oldLabel);
            if (group) group.label = newLabel;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-add-word:')) {
        const label = decodeSeg(normalizedAction.slice('mood-add-word:'.length));
        const globalObj = options.global || globalThis;
        const word = ((await dialogs.prompt(`向「${label}」组添加情绪词：`, '')) || '').trim();
        if (word) {
            const groups = ensureMoodGroups(settingsState);
            const dupGroup = groups.find((g) => Array.isArray(g.words) && g.words.includes(word));
            if (dupGroup) {
                // 词撞名：弹窗询问是否删掉重复词再加到当前组
                const proceed = await dialogs.confirm(`「${word}」已存在于「${dupGroup.label}」组。是否删除重复词并加入「${label}」组？`);
                if (!proceed) return rerenderSettings();
                dupGroup.words = dupGroup.words.filter((w) => w !== word);
            }
            const group = groups.find((g) => g.label === label);
            if (group) group.words.push(word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    // 待确认情绪词只有一个「加入」：填写情绪组（模糊匹配到的组预填），加入后从列表移除。
    if (normalizedAction.startsWith('mood-review-assign:')) {
        const word = decodeSeg(normalizedAction.slice('mood-review-assign:'.length));
        const globalObj = options.global || globalThis;
        const storage = globalObj.localStorage;
        const item = loadMoodReview(storage).find((entry) => entry.word === word);
        const groups = ensureMoodGroups(settingsState);
        const suggested = item && groups.some((g) => g.label === item.group) ? item.group : '';
        const names = groups.map((g) => g.label).join('、');
        const label = ((await dialogs.prompt(`把「${word}」加入哪个情绪组？\n可选：${names}`, suggested)) || '').trim();
        if (!label) return rerenderSettings();
        const group = groups.find((g) => g.label === label);
        if (!group) {
            if (globalObj.alert) globalObj.alert(`情绪组「${label}」不存在`);
            return rerenderSettings();
        }
        for (const other of groups) {
            if (other !== group && Array.isArray(other.words)) other.words = other.words.filter((w) => w !== word);
        }
        if (!group.words.includes(word)) group.words.push(word);
        removeMoodReview(storage, word);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-review-dismiss:')) {
        const written = removeMoodReview((options.global || globalThis).localStorage, decodeSeg(normalizedAction.slice('mood-review-dismiss:'.length)));
        if (written.ok === false) return written;
        return rerenderSettings();
    }

    if (normalizedAction === 'mood-review-clear') {
        const written = clearMoodReview((options.global || globalThis).localStorage);
        if (written.ok === false) return written;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-remove-word:')) {
        const rest = normalizedAction.slice('mood-remove-word:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const label = decodeSeg(rest.slice(0, colonIdx));
            const word = decodeSeg(rest.slice(colonIdx + 1));
            const groups = ensureMoodGroups(settingsState);
            const group = groups.find((g) => g.label === label);
            if (group) {
                if (group.words.length <= 1) {
                    const globalObj = options.global || globalThis;
                    if (globalObj.alert) globalObj.alert('每个情绪组至少保留 1 个词');
                    return rerenderSettings();
                }
                const wi = group.words.indexOf(word);
                if (wi >= 0) group.words.splice(wi, 1);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-mood:')) {
        const rest = normalizedAction.slice('scene-toggle-mood:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const mood = decodeSeg(rest.slice(colonIdx + 1));
            const key = charName + "\x00" + mood;
            if (!(settingsState.asyncState.expandedSpriteSlots instanceof Set)) {
                settingsState.asyncState.expandedSpriteSlots = new Set();
            }
            const set = settingsState.asyncState.expandedSpriteSlots;
            if (set.has(key)) set.delete(key); else set.add(key);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-create-group:')) {
        const label = decodeSeg(normalizedAction.slice('mood-create-group:'.length));
        const globalObj = options.global || globalThis;
        const groups = ensureMoodGroups(settingsState);
        if (groups.some((g) => g.label === label)) {
            if (globalObj.alert) globalObj.alert(`情绪组「${label}」已存在（同名）`);
            return rerenderSettings();
        }
        // 组名自动作为该组第一个词
        groups.unshift({ label, words: [label] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-preset-save') {
        const globalObj = options.global || globalThis;
        const sa = settingsState.draft.bridge.sceneAssets || {};
        let name = settingsState.asyncState.scenePresetName || '';
        if (!name) {
            name = ((await dialogs.prompt('预设名称：', '')) || '').trim();
            if (!name) return rerenderSettings();
        }
        const storage = globalObj.localStorage;
        const presets = loadScenePresets(storage);
        presets[name] = {
            scenes: cloneData(sa.scenes || {}),
            characters: cloneData(sa.characters || {}),
            characterAliases: cloneData(sa.characterAliases || {}),
            characterDna: normalizeCharacterDnaMap(sa.characterDna),
            characterOutfits: normalizeCharacterOutfits(sa.characterOutfits),
            wardrobe: normalizeWardrobe(sa.wardrobe),
            moodGroups: cloneData(sa.moodGroups || []),
            statusAvatars: cloneData(sa.statusAvatars || {}),
            characterHouses: normalizeCharacterHouses(sa.characterHouses),
            timeGroups: cloneData(sa.timeGroups || []),
            weatherGroups: cloneData(sa.weatherGroups || []),
            ancient: sa.ancient === true,
            worldview: resolveWorldview(sa),
            generated: normalizeGeneratedLibrary(sa.generated),
            spriteLayouts: cloneData((settingsState.draft.readerSettings && settingsState.draft.readerSettings.spriteLayouts) || {}),
            spriteHeads: cloneData((settingsState.draft.readerSettings && settingsState.draft.readerSettings.spriteHeads) || {}),
        };
        const written = saveScenePresets(storage, presets);
        if (written.ok === false) return written;
        settingsState.asyncState.scenePresetName = saveActiveScenePresetName((options.global || globalThis).localStorage, name);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-preset-apply:')) {
        const name = decodeSeg(normalizedAction.slice('scene-preset-apply:'.length));
        if (name) {
            const globalObj = options.global || globalThis;
            const presets = loadScenePresets(globalObj.localStorage);
            const preset = presets[name];
            if (preset) {
                // 切预设会用预设内容整体覆盖当前场景配置与立绘位置。未存进任何预设的改动
                // 会在覆盖后丢失，所以切换前先确认（取消则保持当前配置不动）。
                if (!await dialogs.confirm(`切换到预设「${name}」会用该预设的场景、角色立绘和位置覆盖当前配置，未保存到预设的改动将丢失。是否继续？`)) {
                    return rerenderSettings();
                }
                settingsState.asyncState.scenePresetName = saveActiveScenePresetName((options.global || globalThis).localStorage, name);
                settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
                settingsState.draft.bridge.sceneAssets.scenes = cloneData(preset.scenes || {});
                settingsState.draft.bridge.sceneAssets.characters = cloneData(preset.characters || {});
                settingsState.draft.bridge.sceneAssets.characterAliases = cloneData(preset.characterAliases || {});
                // 旧预设没有 characterDna 字段：保留当前 DNA，避免静默清空。
                if (Object.prototype.hasOwnProperty.call(preset, 'characterDna')) {
                    settingsState.draft.bridge.sceneAssets.characterDna = normalizeCharacterDnaMap(preset.characterDna);
                }
                // 旧预设没有 characterOutfits 字段：同理保留当前服装。
                if (Object.prototype.hasOwnProperty.call(preset, 'characterOutfits')) {
                    settingsState.draft.bridge.sceneAssets.characterOutfits = normalizeCharacterOutfits(preset.characterOutfits);
                }
                if (Object.prototype.hasOwnProperty.call(preset, 'wardrobe')) {
                    settingsState.draft.bridge.sceneAssets.wardrobe = normalizeWardrobe(preset.wardrobe);
                }
                settingsState.draft.bridge.sceneAssets.moodGroups = cloneData(preset.moodGroups || []);
                settingsState.draft.bridge.sceneAssets.statusAvatars = cloneData(preset.statusAvatars || {});
                // 旧预设没有 characterHouses 字段：保留当前角色学院。
                if (Object.prototype.hasOwnProperty.call(preset, 'characterHouses')) {
                    settingsState.draft.bridge.sceneAssets.characterHouses = normalizeCharacterHouses(preset.characterHouses);
                }
                settingsState.draft.bridge.sceneAssets.timeGroups = cloneData(preset.timeGroups || []);
                settingsState.draft.bridge.sceneAssets.weatherGroups = cloneData(preset.weatherGroups || []);
                // 世界观随预设走（同步写 worldview 与 ancient）；早于该开关的旧预设按现代，只有 ancient:true 的按古代。
                applyWorldview(settingsState.draft.bridge.sceneAssets, resolveWorldview(preset));
                // 旧预设没有 generated 字段：保留当前生成素材库，避免静默清空。
                if (Object.prototype.hasOwnProperty.call(preset, 'generated')) {
                    settingsState.draft.bridge.sceneAssets.generated = normalizeGeneratedLibrary(preset.generated);
                }
                if (preset.spriteLayouts && typeof preset.spriteLayouts === 'object') {
                    settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
                    settingsState.draft.readerSettings.spriteLayouts = cloneData(preset.spriteLayouts);
                }
                if (preset.spriteHeads && typeof preset.spriteHeads === 'object') {
                    settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
                    settingsState.draft.readerSettings.spriteHeads = cloneData(preset.spriteHeads);
                }
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            } else {
                settingsState.asyncState.scenePresetName = saveActiveScenePresetName((options.global || globalThis).localStorage, name);
            }
        } else {
            settingsState.asyncState.scenePresetName = saveActiveScenePresetName((options.global || globalThis).localStorage, name);
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-preset-rename') {
        const oldName = settingsState.asyncState.scenePresetName || '';
        if (!oldName) return rerenderSettings();
        const globalObj = options.global || globalThis;
        const newName = ((await dialogs.prompt(`重命名预设「${oldName}」为：`, oldName)) || '').trim();
        if (!newName || newName === oldName) return rerenderSettings();
        const storage = globalObj.localStorage;
        const presets = loadScenePresets(storage);
        if (!presets[oldName]) return rerenderSettings();
        presets[newName] = presets[oldName];
        delete presets[oldName];
        const written = saveScenePresets(storage, presets);
        if (written.ok === false) return written;
        settingsState.asyncState.scenePresetName = saveActiveScenePresetName((options.global || globalThis).localStorage, newName);
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-preset-import') {
        const globalObj = options.global || globalThis;
        const doc = globalObj.document;
        if (!doc) return { ok: false, reason: 'no-document' };
        const fileResult = await pickPresetFile(doc);
        if (!fileResult) return rerenderSettings();
        const name = ((await dialogs.prompt('预设名称：', fileResult.fileName)) || '').trim();
        if (!name) return rerenderSettings();
        const storage = globalObj.localStorage;
        const presets = loadScenePresets(storage);
        presets[name] = {
            scenes: fileResult.data.scenes || {},
            characters: fileResult.data.characters || {},
            characterAliases: fileResult.data.characterAliases || {},
            ...(Object.prototype.hasOwnProperty.call(fileResult.data, 'characterDna') ? { characterDna: normalizeCharacterDnaMap(fileResult.data.characterDna) } : {}),
            ...(Object.prototype.hasOwnProperty.call(fileResult.data, 'characterOutfits') ? { characterOutfits: normalizeCharacterOutfits(fileResult.data.characterOutfits) } : {}),
            ...(Object.prototype.hasOwnProperty.call(fileResult.data, 'wardrobe') ? { wardrobe: normalizeWardrobe(fileResult.data.wardrobe) } : {}),
            moodGroups: fileResult.data.moodGroups || [],
            statusAvatars: (fileResult.data.statusAvatars && typeof fileResult.data.statusAvatars === 'object') ? fileResult.data.statusAvatars : {},
            ...(Object.prototype.hasOwnProperty.call(fileResult.data, 'characterHouses') ? { characterHouses: normalizeCharacterHouses(fileResult.data.characterHouses) } : {}),
            timeGroups: fileResult.data.timeGroups || [],
            weatherGroups: fileResult.data.weatherGroups || [],
            // 早于时代开关的旧文件都是现代背景。
            ancient: fileResult.data.ancient === true,
            worldview: resolveWorldview(fileResult.data),
            spriteLayouts: (fileResult.data.spriteLayouts && typeof fileResult.data.spriteLayouts === 'object') ? fileResult.data.spriteLayouts : {},
            spriteHeads: normalizeSpriteHeads(fileResult.data.spriteHeads),
        };
        const written = saveScenePresets(storage, presets);
        if (written.ok === false) return written;
        settingsState.asyncState.scenePresetName = saveActiveScenePresetName((options.global || globalThis).localStorage, name);
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.scenes = cloneData(presets[name].scenes);
        settingsState.draft.bridge.sceneAssets.characters = cloneData(presets[name].characters);
        settingsState.draft.bridge.sceneAssets.characterAliases = cloneData(presets[name].characterAliases || {});
        if (Object.prototype.hasOwnProperty.call(presets[name], 'characterDna')) {
            settingsState.draft.bridge.sceneAssets.characterDna = cloneData(presets[name].characterDna);
        }
        if (Object.prototype.hasOwnProperty.call(presets[name], 'characterOutfits')) {
            settingsState.draft.bridge.sceneAssets.characterOutfits = cloneData(presets[name].characterOutfits);
        }
        if (Object.prototype.hasOwnProperty.call(presets[name], 'wardrobe')) {
            settingsState.draft.bridge.sceneAssets.wardrobe = cloneData(presets[name].wardrobe);
        }
        settingsState.draft.bridge.sceneAssets.statusAvatars = cloneData(presets[name].statusAvatars || {});
        if (Object.prototype.hasOwnProperty.call(presets[name], 'characterHouses')) {
            settingsState.draft.bridge.sceneAssets.characterHouses = cloneData(presets[name].characterHouses);
        }
        settingsState.draft.bridge.sceneAssets.moodGroups = cloneData(presets[name].moodGroups);
        settingsState.draft.bridge.sceneAssets.timeGroups = cloneData(presets[name].timeGroups || []);
        settingsState.draft.bridge.sceneAssets.weatherGroups = cloneData(presets[name].weatherGroups || []);
        applyWorldview(settingsState.draft.bridge.sceneAssets, resolveWorldview(presets[name]));
        settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        settingsState.draft.readerSettings.spriteLayouts = cloneData(presets[name].spriteLayouts);
        settingsState.draft.readerSettings.spriteHeads = cloneData(presets[name].spriteHeads);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-preset-export') {
        const name = settingsState.asyncState.scenePresetName || '';
        if (!name) return rerenderSettings();
        const globalObj = options.global || globalThis;
        const presets = loadScenePresets(globalObj.localStorage);
        const preset = presets[name];
        if (!preset) return rerenderSettings();
        const doc = globalObj.document;
        if (!doc) return { ok: false, reason: 'no-document' };
        const json = JSON.stringify({ scenes: preset.scenes || {}, characters: preset.characters || {}, characterAliases: preset.characterAliases || {}, ...(Object.prototype.hasOwnProperty.call(preset, 'characterDna') ? { characterDna: preset.characterDna } : {}), ...(Object.prototype.hasOwnProperty.call(preset, 'characterOutfits') ? { characterOutfits: preset.characterOutfits } : {}), ...(Object.prototype.hasOwnProperty.call(preset, 'characterHouses') ? { characterHouses: preset.characterHouses } : {}), ...(Object.prototype.hasOwnProperty.call(preset, 'wardrobe') ? { wardrobe: preset.wardrobe } : {}), moodGroups: preset.moodGroups || [], timeGroups: preset.timeGroups || [], weatherGroups: preset.weatherGroups || [], ancient: preset.ancient === true, worldview: resolveWorldview(preset), spriteLayouts: preset.spriteLayouts || {}, spriteHeads: preset.spriteHeads || {}, statusAvatars: preset.statusAvatars || {} }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = `${name}.json`;
        doc.body.appendChild(a);
        a.click();
        doc.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { ok: true };
    }

    if (normalizedAction === 'scene-preset-delete') {
        const name = settingsState.asyncState.scenePresetName || '';
        if (!name) return rerenderSettings();
        const globalObj = options.global || globalThis;
        if (!await dialogs.confirm(`删除预设「${name}」？`)) return rerenderSettings();
        const storage = globalObj.localStorage;
        const presets = loadScenePresets(storage);
        delete presets[name];
        const written = saveScenePresets(storage, presets);
        if (written.ok === false) return written;
        settingsState.asyncState.scenePresetName = saveActiveScenePresetName((options.global || globalThis).localStorage, '');
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('asset-') && await runAssetFolderAction(normalizedAction, settingsState, options, dialogs)) {
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-bg:')) {
        const key = 'bg\x00' + decodeSeg(normalizedAction.slice('scene-toggle-bg:'.length));
        if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
        const set = settingsState.asyncState.expandedSceneSlots;
        if (set.has(key)) set.delete(key); else set.add(key);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-time:')) {
        const rest = normalizedAction.slice('scene-toggle-time:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const key = 'time\x00' + decodeSeg(rest.slice(0, c)) + '\x00' + decodeSeg(rest.slice(c + 1));
            if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
            const set = settingsState.asyncState.expandedSceneSlots;
            if (set.has(key)) set.delete(key); else set.add(key);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-weather:')) {
        const rest = normalizedAction.slice('scene-toggle-weather:'.length);
        const c1 = rest.indexOf(':'); const c2 = c1 >= 0 ? rest.indexOf(':', c1 + 1) : -1;
        if (c1 > 0 && c2 > c1) {
            const key = 'weather\x00' + decodeSeg(rest.slice(0, c1)) + '\x00' + decodeSeg(rest.slice(c1 + 1, c2)) + '\x00' + decodeSeg(rest.slice(c2 + 1));
            if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
            const set = settingsState.asyncState.expandedSceneSlots;
            if (set.has(key)) set.delete(key); else set.add(key);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-add-bg-word:')) {
        const sceneName = decodeSeg(normalizedAction.slice('scene-add-bg-word:'.length));
        const globalObj = options.global || globalThis;
        const alias = ((await dialogs.prompt(`为场景「${sceneName}」添加别名：`, '')) || '').trim();
        if (alias) {
            const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
            if (Object.prototype.hasOwnProperty.call(scenes, alias)) {
                if (globalObj.alert) globalObj.alert(`「${alias}」已是场景主名称`);
                return rerenderSettings();
            }
            const dup = findSceneWord(scenes, alias);
            if (dup) {
                const proceed = await dialogs.confirm(`别名「${alias}」已属于${dup.label}。是否移动到场景「${sceneName}」？`);
                if (!proceed) return rerenderSettings();
                removeSceneWordEntry(scenes, dup);
            }
            const s = scenes[sceneName];
            if (s && typeof s === 'object') { if (!Array.isArray(s.words)) s.words = []; s.words.push(alias); }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-bg-word:')) {
        const rest = normalizedAction.slice('scene-remove-bg-word:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const sceneName = decodeSeg(rest.slice(0, c)); const word = decodeSeg(rest.slice(c + 1));
            const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
            const s = scenes[sceneName];
            if (s && Array.isArray(s.words)) {
                s.words = s.words.filter((w) => w !== word);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('time-add-word:')) {
        const label = decodeSeg(normalizedAction.slice('time-add-word:'.length));
        const globalObj = options.global || globalThis;
        const word = ((await dialogs.prompt(`向时间组「${label}」添加词：`, '')) || '').trim();
        if (word) {
            const groups = ensureTimeGroups(settingsState);
            const dup = groups.find((g) => Array.isArray(g.words) && g.words.includes(word));
            if (dup) {
                const proceed = await dialogs.confirm(`「${word}」已存在于时间组「${dup.label}」。是否删除重复词并加入「${label}」？`);
                if (!proceed) return rerenderSettings();
                dup.words = dup.words.filter((w) => w !== word);
            }
            const g = groups.find((g) => g.label === label);
            if (g) g.words.push(word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('time-remove-word:')) {
        const rest = normalizedAction.slice('time-remove-word:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const label = decodeSeg(rest.slice(0, c)); const word = decodeSeg(rest.slice(c + 1));
            const groups = ensureTimeGroups(settingsState);
            const g = groups.find((g) => g.label === label);
            if (g && Array.isArray(g.words)) {
                const globalObj = options.global || globalThis;
                if (g.words.length <= 1) { if (globalObj.alert) globalObj.alert('至少保留 1 个词'); return rerenderSettings(); }
                g.words = g.words.filter((w) => w !== word);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('time-create-group:')) {
        const label = decodeSeg(normalizedAction.slice('time-create-group:'.length));
        const globalObj = options.global || globalThis;
        const groups = ensureTimeGroups(settingsState);
        if (groups.some((g) => g.label === label)) { if (globalObj.alert) globalObj.alert(`时间组「${label}」已存在`); return rerenderSettings(); }
        groups.unshift({ label, words: [label] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('weather-add-word:')) {
        const label = decodeSeg(normalizedAction.slice('weather-add-word:'.length));
        const globalObj = options.global || globalThis;
        const word = ((await dialogs.prompt(`向天气组「${label}」添加词：`, '')) || '').trim();
        if (word) {
            const groups = ensureWeatherGroups(settingsState);
            const dup = groups.find((g) => Array.isArray(g.words) && g.words.includes(word));
            if (dup) {
                const proceed = await dialogs.confirm(`「${word}」已存在于天气组「${dup.label}」。是否删除重复词并加入「${label}」？`);
                if (!proceed) return rerenderSettings();
                dup.words = dup.words.filter((w) => w !== word);
            }
            const g = groups.find((g) => g.label === label);
            if (g) g.words.push(word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('weather-remove-word:')) {
        const rest = normalizedAction.slice('weather-remove-word:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const label = decodeSeg(rest.slice(0, c)); const word = decodeSeg(rest.slice(c + 1));
            const groups = ensureWeatherGroups(settingsState);
            const g = groups.find((g) => g.label === label);
            if (g && Array.isArray(g.words)) {
                const globalObj = options.global || globalThis;
                if (g.words.length <= 1) { if (globalObj.alert) globalObj.alert('至少保留 1 个词'); return rerenderSettings(); }
                g.words = g.words.filter((w) => w !== word);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('weather-create-group:')) {
        const label = decodeSeg(normalizedAction.slice('weather-create-group:'.length));
        const globalObj = options.global || globalThis;
        const groups = ensureWeatherGroups(settingsState);
        if (groups.some((g) => g.label === label)) { if (globalObj.alert) globalObj.alert(`天气组「${label}」已存在`); return rerenderSettings(); }
        groups.unshift({ label, words: [label] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    return { ok: false, reason: 'unknown-settings-action', action: normalizedAction };
}

function reorderKey(obj, oldKey, newKey) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) result[k === oldKey ? newKey : k] = v;
    return result;
}

function renameSetPrefix(set, oldPrefix, newPrefix) {
    if (!(set instanceof Set)) return;
    const toUpdate = [];
    for (const key of set) if (key.startsWith(oldPrefix)) toUpdate.push(key);
    for (const k of toUpdate) { set.delete(k); set.add(newPrefix + k.slice(oldPrefix.length)); }
}

function findSceneWord(scenes, word) {
    for (const [sn, sv] of Object.entries(scenes || {})) {
        const s = typeof sv === 'string' ? {} : (sv || {});
        if (Array.isArray(s.words) && s.words.includes(word)) return { type: 'bg', keys: [sn], word, label: `场景「${sn}」` };
    }
    return null;
}

function removeSceneWordEntry(scenes, entry) {
    const [sn, tn, wn] = entry.keys;
    let arr = null;
    if (entry.type === 'bg') arr = scenes[sn] && scenes[sn].words;
    else if (entry.type === 'time') arr = scenes[sn] && scenes[sn].times && scenes[sn].times[tn] && scenes[sn].times[tn].words;
    else arr = scenes[sn] && scenes[sn].times && scenes[sn].times[tn] && scenes[sn].times[tn].weathers && scenes[sn].times[tn].weathers[wn] && scenes[sn].times[tn].weathers[wn].words;
    if (Array.isArray(arr)) { const i = arr.indexOf(entry.word); if (i >= 0) arr.splice(i, 1); }
}

function pickStatusAvatarFile(doc) {
    return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        let done = false;
        let timeoutId = null;
        const finish = (val) => {
            if (done) return;
            done = true;
            if (timeoutId !== null) clearTimeout(timeoutId);
            resolve(val);
        };
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) { finish(null); return; }
            const type = String(file.type || '');
            if (type && !STATUS_AVATAR_MIME.test(type)) { finish({ ok: false, reason: 'not-image' }); return; }
            if (Number(file.size) > STATUS_AVATAR_MAX_BYTES) { finish({ ok: false, reason: 'too-large' }); return; }
            const fr = new FileReader();
            fr.onload = (e) => {
                const dataUrl = String((e && e.target && e.target.result) || '');
                if (!/^data:image\//i.test(dataUrl)) { finish({ ok: false, reason: 'not-image' }); return; }
                finish({ ok: true, dataUrl });
            };
            fr.onerror = () => finish({ ok: false, reason: 'read-failed' });
            fr.readAsDataURL(file);
        };
        input.click();
        timeoutId = setTimeout(() => finish(null), 300000);
    });
}

function pickPresetFile(doc) {
    return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        let done = false;
        let timeoutId = null;
        const finish = (val) => {
            if (done) return;
            done = true;
            if (timeoutId !== null) clearTimeout(timeoutId);
            resolve(val);
        };
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) { finish(null); return; }
            const fileName = file.name.replace(/\.json$/i, '');
            const fr = new FileReader();
            fr.onload = (e) => { try { finish({ fileName, data: JSON.parse(e.target.result) }); } catch { finish(null); } };
            fr.onerror = () => finish(null);
            fr.readAsText(file);
        };
        input.click();
        timeoutId = setTimeout(() => finish(null), 300000);
    });
}

function ensureTimeGroups(settingsState) {
    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sa = settingsState.draft.bridge.sceneAssets;
    if (!Array.isArray(sa.timeGroups)) sa.timeGroups = [];
    return sa.timeGroups;
}

function ensureWeatherGroups(settingsState) {
    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sa = settingsState.draft.bridge.sceneAssets;
    if (!Array.isArray(sa.weatherGroups)) sa.weatherGroups = [];
    return sa.weatherGroups;
}

function ensureMoodGroups(settingsState) {    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sa = settingsState.draft.bridge.sceneAssets;
    if (!Array.isArray(sa.moodGroups)) {
        sa.moodGroups = normalizeMoodGroups(sa.moodGroups);
    }
    return sa.moodGroups;
}

function ensureCharacterAliases(settingsState) {
    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sceneAssets = settingsState.draft.bridge.sceneAssets;
    if (!sceneAssets.characterAliases || typeof sceneAssets.characterAliases !== 'object' || Array.isArray(sceneAssets.characterAliases)) {
        sceneAssets.characterAliases = {};
    }
    for (const name of Object.keys(sceneAssets.characters || {})) {
        if (!Array.isArray(sceneAssets.characterAliases[name])) sceneAssets.characterAliases[name] = [];
    }
    return sceneAssets.characterAliases;
}
