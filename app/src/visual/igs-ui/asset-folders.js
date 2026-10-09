// 素材页文件夹：只是界面归类（与折叠状态同类），存本地；不写入素材或导入导出数据。
// 场景按全局或当前角色卡分别存；角色所有卡共用，角色文件夹也只有一套，记在全局那份里。
const STORAGE_KEY = 'igs-asset-folders-v1';
export const ASSET_FOLDER_KINDS = Object.freeze(['scenes', 'characters']);
const VIEWS = ['list', 'grid'];
const cleanName = (v) => String(v == null ? '' : v).trim().slice(0, 40);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function normalizeKind(src) {
    const s = src && typeof src === 'object' ? src : {};
    const folders = [];
    for (const f of Array.isArray(s.folders) ? s.folders : []) {
        const n = cleanName(f);
        if (n && !folders.includes(n)) folders.push(n);
    }
    const assign = Object.create(null);
    if (s.assign && typeof s.assign === 'object') {
        for (const [item, f] of Object.entries(s.assign)) {
            const n = cleanName(f);
            if (item && folders.includes(n)) assign[item] = n;
        }
    }
    const collapsed = (Array.isArray(s.collapsed) ? s.collapsed : []).map(cleanName)
        .filter((n, i, a) => (n === '' || folders.includes(n)) && a.indexOf(n) === i);
    return { view: VIEWS.includes(s.view) ? s.view : 'list', folders, collapsed, assign };
}

export function normalizeAssetFolders(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { scenes: normalizeKind(r.scenes), characters: normalizeKind(r.characters) };
}

function readScopes(storage) {
    const text = storage && typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null;
    const all = text ? JSON.parse(text) : null;
    return Object.assign(Object.create(null), all && typeof all.scopes === 'object' ? all.scopes : null);
}

const isCardScope = (key) => /^(?:card|group):/.test(key);
const hasKindData = (kind) => Boolean(kind && ((Array.isArray(kind.folders) && kind.folders.length) || (kind.assign && Object.keys(kind.assign).length)));

// 早先每张卡各有一套角色文件夹。并进全局那套（全局已有的分配不改），卡上的清掉，之后就只读写全局那套。
// 并过的卡上不再有角色文件夹，再跑一遍什么也不做；预设存的文件夹快照不是卡，不动。
function shareCharacterFolders(scopes) {
    let changed = false;
    const shared = normalizeAssetFolders(scopes['']);
    for (const key of Object.keys(scopes)) {
        if (!isCardScope(key) || !scopes[key] || !hasKindData(scopes[key].characters)) continue;
        const source = normalizeAssetFolders(scopes[key]).characters;
        for (const folder of source.folders) if (!shared.characters.folders.includes(folder)) shared.characters.folders.push(folder);
        for (const [item, folder] of Object.entries(source.assign)) if (!own(shared.characters.assign, item)) shared.characters.assign[item] = folder;
        scopes[key] = { ...scopes[key], characters: null };
        changed = true;
    }
    if (changed) scopes[''] = { ...(scopes[''] || {}), characters: shared.characters };
    return changed;
}

function readSharedScopes(storage) {
    const scopes = readScopes(storage);
    if (shareCharacterFolders(scopes) && storage && typeof storage.setItem === 'function') {
        try { storage.setItem(STORAGE_KEY, JSON.stringify({ scopes })); } catch (error) { /* 存不下就下次再并 */ }
    }
    return scopes;
}

// 卡上的场景文件夹 + 全局那套角色文件夹。
function scopedState(scopes, key, fallbackToGlobal) {
    const own_ = own(scopes, key) ? scopes[key] : (fallbackToGlobal ? scopes[''] : null);
    const state = normalizeAssetFolders(own_);
    if (isCardScope(key)) state.characters = normalizeAssetFolders(scopes['']).characters;
    return state;
}

export function loadAssetFolders(storage, scope = '') {
    try {
        const key = String(scope || '');
        return scopedState(readSharedScopes(storage), key, false);
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
        shareCharacterFolders(scopes);
        const key = String(scope || '');
        const next = normalizeAssetFolders(state);
        if (isCardScope(key)) {
            scopes[''] = { ...normalizeAssetFolders(scopes['']), characters: next.characters };
            scopes[key] = { ...next, characters: null };
        } else {
            scopes[key] = next;
        }
        storage.setItem(STORAGE_KEY, JSON.stringify({ scopes }));
        return true;
    } catch (error) {
        console.warn('[IGS] 素材文件夹保存失败', error);
        return false;
    }
}

// 打开角色卡时，这张卡还没建过场景文件夹就先沿用全局的分类，免得全局素材的文件夹一下子全没了。
export function loadAssetFoldersFor(storage, scope = '') {
    try {
        const key = String(scope || '');
        return scopedState(readSharedScopes(storage), key, true);
    } catch (error) {
        return loadAssetFolders(storage, scope);
    }
}

// 旧版按预设名字存文件夹。找回预设时把那份分类并进目标（全局或角色卡），目标里已有的分配不改。
export function mergeAssetFolderScope(storage, fromScope, toScope) {
    try {
        const scopes = readScopes(storage);
        const from = String(fromScope || '');
        const to = String(toScope || '');
        if (!own(scopes, from) || from === to) return false;
        const source = normalizeAssetFolders(scopes[from]);
        const target = loadAssetFoldersFor(storage, to);
        for (const kind of ASSET_FOLDER_KINDS) {
            for (const folder of source[kind].folders) if (!target[kind].folders.includes(folder)) target[kind].folders.push(folder);
            for (const [item, folder] of Object.entries(source[kind].assign)) if (!own(target[kind].assign, item)) target[kind].assign[item] = folder;
        }
        return saveAssetFolders(storage, to, target);
    } catch (error) {
        return false;
    }
}

function edit(state, kind, fn) {
    const next = normalizeAssetFolders(state);
    if (ASSET_FOLDER_KINDS.includes(kind)) fn(next[kind]);
    return normalizeAssetFolders(next);
}

export const setAssetView = (s, kind, view) => edit(s, kind, (k) => { if (VIEWS.includes(view)) k.view = view; });
export const addAssetFolder = (s, kind, name) => edit(s, kind, (k) => {
    const n = cleanName(name);
    if (n && !k.folders.includes(n)) k.folders.push(n);
});
export const renameAssetFolder = (s, kind, from, to) => edit(s, kind, (k) => {
    const a = cleanName(from);
    const b = cleanName(to);
    const i = k.folders.indexOf(a);
    if (i < 0 || !b || (b !== a && k.folders.includes(b))) return;
    k.folders[i] = b;
    k.collapsed = k.collapsed.map((n) => (n === a ? b : n));
    for (const item of Object.keys(k.assign)) if (k.assign[item] === a) k.assign[item] = b;
});
// 删除文件夹只把条目放回「未分类」，不删任何素材。
export const removeAssetFolder = (s, kind, name) => edit(s, kind, (k) => {
    const n = cleanName(name);
    k.folders = k.folders.filter((f) => f !== n);
    for (const item of Object.keys(k.assign)) if (k.assign[item] === n) delete k.assign[item];
});
export const moveAssetToFolder = (s, kind, item, folder) => edit(s, kind, (k) => {
    const n = cleanName(folder);
    if (!item) return;
    if (n && k.folders.includes(n)) k.assign[item] = n;
    else delete k.assign[item];
});
export const toggleAssetFolder = (s, kind, folder) => edit(s, kind, (k) => {
    const n = cleanName(folder);
    k.collapsed = k.collapsed.includes(n) ? k.collapsed.filter((f) => f !== n) : k.collapsed.concat([n]);
});
export const renameAssetItem = (s, kind, from, to) => edit(s, kind, (k) => {
    if (!from || !to || !own(k.assign, from)) return;
    k.assign[to] = k.assign[from];
    delete k.assign[from];
});
export const forgetAssetItem = (s, kind, item) => edit(s, kind, (k) => { delete k.assign[item]; });

// 按文件夹分组；已不存在的条目名直接忽略。
export function groupAssetsByFolder(state, kind, names) {
    const k = normalizeAssetFolders(state)[kind] || normalizeKind(null);
    const groups = k.folders.map((folder) => ({ folder, items: [] }));
    const unfiled = { folder: '', items: [] };
    for (const name of Array.isArray(names) ? names : []) {
        const group = own(k.assign, name) ? groups.find((g) => g.folder === k.assign[name]) : null;
        (group || unfiled).items.push(name);
    }
    return groups.concat([unfiled]);
}
