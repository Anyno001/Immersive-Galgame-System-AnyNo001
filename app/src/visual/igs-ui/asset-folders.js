// 素材页文件夹：只是界面归类（与折叠状态同类），按全局或当前角色卡分别存本地；不写入素材或导入导出数据。
import { editFolderState, groupFolderItems, normalizeFolderState } from './folder-state.js';
import { writeCheckedStorage } from '../../storage/checked-storage-write.js';
export const ASSET_FOLDERS_STORAGE_KEY = 'igs-asset-folders-v1';
const STORAGE_KEY = ASSET_FOLDERS_STORAGE_KEY;
export const ASSET_FOLDER_KINDS = Object.freeze(['scenes', 'characters']);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const normalizeKind = normalizeFolderState;

export function normalizeAssetFolders(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { scenes: normalizeKind(r.scenes), characters: normalizeKind(r.characters) };
}

function readScopes(storage) {
    const text = storage && typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null;
    const all = text ? JSON.parse(text) : null;
    return Object.assign(Object.create(null), all && typeof all.scopes === 'object' ? all.scopes : null);
}

export function loadAssetFolders(storage, scope = '') {
    try {
        const scopes = readScopes(storage);
        const key = String(scope || '');
        return normalizeAssetFolders(own(scopes, key) ? scopes[key] : null);
    } catch (error) {
        console.warn('[IGS] 素材文件夹读取失败，按未分类显示', error);
        return normalizeAssetFolders(null);
    }
}

export function saveAssetFolders(storage, scope, state) {
    try {
        if (!storage || typeof storage.setItem !== 'function') return false;
        let scopes;
        try { scopes = readScopes(storage); } catch { scopes = Object.create(null); }
        scopes[String(scope || '')] = normalizeAssetFolders(state);
        return writeCheckedStorage(storage, STORAGE_KEY, JSON.stringify({ scopes })).ok;
    } catch (error) {
        console.warn('[IGS] 素材文件夹保存失败', error);
        return false;
    }
}

// 打开角色卡时，这张卡还没建过文件夹就先沿用全局的分类，免得全局素材的文件夹一下子全没了。
export function loadAssetFoldersFor(storage, scope = '') {
    try {
        const scopes = readScopes(storage);
        const key = String(scope || '');
        return normalizeAssetFolders(own(scopes, key) ? scopes[key] : scopes['']);
    } catch (error) {
        return loadAssetFolders(storage, scope);
    }
}

// 旧版按预设名字存文件夹。找回预设时把那份分类并进目标（全局或角色卡），目标里已有的分配不改。
export function mergeAssetFolderScope(storage, fromScope, toScope, { strict = false } = {}) {
    try {
        const scopes = readScopes(storage);
        const from = String(fromScope || '');
        const to = String(toScope || '');
        if (!own(scopes, from) || from === to) return strict;
        const source = normalizeAssetFolders(scopes[from]);
        const target = normalizeAssetFolders(own(scopes, to) ? scopes[to] : scopes['']);
        for (const kind of ASSET_FOLDER_KINDS) {
            for (const folder of source[kind].folders) if (!target[kind].folders.includes(folder)) target[kind].folders.push(folder);
            for (const [item, folder] of Object.entries(source[kind].assign)) if (!own(target[kind].assign, item)) target[kind].assign[item] = folder;
        }
        return saveAssetFolders(storage, to, target);
    } catch (error) {
        return false;
    }
}

function edit(state, kind, operation, params) {
    const next = normalizeAssetFolders(state);
    if (ASSET_FOLDER_KINDS.includes(kind)) next[kind] = editFolderState(next[kind], operation, params);
    return next;
}

export const setAssetView = (s, kind, view) => edit(s, kind, 'view', { view });
export const addAssetFolder = (s, kind, name) => edit(s, kind, 'add', { name });
export const renameAssetFolder = (s, kind, from, to) => edit(s, kind, 'rename', { name: from, to });
export const removeAssetFolder = (s, kind, name) => edit(s, kind, 'remove', { name });
export const moveAssetToFolder = (s, kind, item, folder) => edit(s, kind, 'move', { item, to: folder });
export const toggleAssetFolder = (s, kind, name) => edit(s, kind, 'toggle', { name });
export const renameAssetItem = (s, kind, from, to) => edit(s, kind, 'rename-item', { item: from, to });
export const forgetAssetItem = (s, kind, item) => edit(s, kind, 'forget-item', { item });

export function groupAssetsByFolder(state, kind, names) {
    return groupFolderItems(normalizeAssetFolders(state)[kind], names);
}
