// 素材页文件夹：只是界面归类（与折叠状态同类），按全局或当前角色卡分别存本地；不写入素材或导入导出数据。
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
        storage.setItem(STORAGE_KEY, JSON.stringify({ scopes }));
        return true;
    } catch (error) {
        console.warn('[IGS] 素材文件夹保存失败', error);
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
