// 相册：日常演出「拍照」把当前背景与立绘合成一张 JPEG，存进独立的 IndexedDB igs-photo-album，
// 并以 kind:'photo' 条目并入 CG 库（楼层 CG 翻完后接着翻照片）。照片的收藏 / 隐藏 / 删除只动相册库，不碰楼层插图。
import { compareCgNewestFirst } from './cg-gallery-service.js';

const DB_NAME = 'igs-photo-album';
const DB_VERSION = 1;
const STORE = 'photos';
export const PHOTO_ALBUM_LIMIT = 200;
export const PHOTO_WIDTH = 960;
const PHOTO_KEY_PREFIX = 'photo|';
const PHOTO_CURSOR_PREFIX = 'photo:';

export function normalizePhoto(value) {
    const src = value && typeof value === 'object' ? value : {};
    const id = String(src.id || '').trim();
    const dataUrl = String(src.dataUrl || '');
    if (!id || !/^(data:image\/(jpeg|png|webp);base64,|\/?user\/images\/igs-)/.test(dataUrl)) return null;
    return {
        id,
        chatId: String(src.chatId || ''),
        messageId: Number.isFinite(Number(src.messageId)) ? Number(src.messageId) : 0,
        caption: String(src.caption || '').slice(0, 60),
        dataUrl,
        createdAt: String(src.createdAt || ''),
        favorite: src.favorite === true,
        hidden: src.hidden === true,
    };
}

function byNewest(a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id));
}

export function createMemoryPhotoAlbumStore() {
    const photos = new Map();
    return {
        async list() { return Array.from(photos.values()).map((p) => ({ ...p })).sort(byNewest); },
        async listIds(onProgress) {
            if (typeof onProgress === 'function') onProgress(0);
            const ids = Array.from(photos.keys());
            if (typeof onProgress === 'function') onProgress(ids.length);
            return ids;
        },
        async get(id) { const p = photos.get(String(id)); return p ? { ...p } : null; },
        async put(value) {
            const photo = normalizePhoto(value);
            if (!photo) return { ok: false, reason: 'invalid-photo' };
            photos.set(photo.id, photo);
            return { ok: true, photo };
        },
        async remove(id) { photos.delete(String(id)); return { ok: true }; },
    };
}

export function createIndexedDbPhotoAlbumStore(globalObject = globalThis) {
    const idb = globalObject && globalObject.indexedDB;
    if (!idb) return createMemoryPhotoAlbumStore();
    let dbPromise = null;
    const open = () => {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const req = idb.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = () => {
                    if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return dbPromise;
    };
    const run = async (mode, fn) => {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const req = fn(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = () => reject(tx.error);
        });
    };
    return {
        async list() { return ((await run('readonly', (s) => s.getAll())) || []).map(normalizePhoto).filter(Boolean).sort(byNewest); },
        async listIds(onProgress) {
            const db = await open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readonly');
                const store = tx.objectStore(STORE);
                const ids = [];
                let reported = -1;
                const tell = (force) => {
                    if (typeof onProgress !== 'function' || (!force && ids.length !== 1 && ids.length % 25 !== 0) || reported === ids.length) return;
                    reported = ids.length;
                    onProgress(ids.length);
                };
                tell(true);
                if (typeof store.openKeyCursor !== 'function') {
                    const req = store.getAllKeys();
                    req.onsuccess = () => { for (const id of req.result || []) ids.push(id); };
                } else {
                    const req = store.openKeyCursor();
                    req.onsuccess = () => {
                        const cursor = req.result;
                        if (!cursor) return;
                        ids.push(cursor.key);
                        tell(false);
                        cursor.continue();
                    };
                }
                tx.oncomplete = () => { tell(true); resolve(ids); };
                tx.onerror = () => reject(tx.error);
            });
        },
        async get(id) { return normalizePhoto(await run('readonly', (s) => s.get(String(id)))); },
        async put(value) {
            const photo = normalizePhoto(value);
            if (!photo) return { ok: false, reason: 'invalid-photo' };
            await run('readwrite', (s) => s.put(photo));
            return { ok: true, photo };
        },
        async remove(id) { await run('readwrite', (s) => s.delete(String(id))); return { ok: true }; },
    };
}

function loadImage(doc, url) {
    const Image = doc && doc.defaultView && doc.defaultView.Image;
    const match = /^url\(["']?(.*?)["']?\)$/.exec(String(url || '').trim());
    const src = match ? match[1].replace(/&quot;/g, '"') : '';
    if (!src || typeof Image !== 'function') return Promise.resolve(null);
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function percentPair(value, fallback) {
    const parts = String(value || '').trim().split(/\s+/).map((v) => parseFloat(v));
    const x = Number.isFinite(parts[0]) ? parts[0] : fallback;
    const y = Number.isFinite(parts[1]) ? parts[1] : x;
    return [x, y];
}

// 与 CSS 背景同算法：bg 为 cover + 居中；立绘 background-size 为宽度百分比（高度 auto），position 为百分比对齐。
export function layoutLayer(kind, img, width, height, layer = {}) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    let w;
    let h;
    if (kind === 'bg') {
        const scale = Math.max(width / iw, height / ih);
        w = iw * scale;
        h = ih * scale;
    } else {
        const size = parseFloat(String(layer.size || '100%'));
        w = (width * (Number.isFinite(size) ? size : 100)) / 100;
        h = (w * ih) / iw;
    }
    const [px, py] = kind === 'bg' ? percentPair(layer.position, 50) : percentPair(layer.position, 50);
    return { x: ((width - w) * px) / 100, y: ((height - h) * py) / 100, w, h };
}

export async function composePhoto(doc, shot) {
    if (!doc || typeof doc.createElement !== 'function' || !shot) return '';
    const aspect = shot.aspect > 0 ? shot.aspect : 16 / 9;
    const width = PHOTO_WIDTH;
    const height = Math.round(width / aspect);
    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#1b1c20';
    ctx.fillRect(0, 0, width, height);
    const layers = [
        ['bg', shot.bg],
        ...(Array.isArray(shot.cast) ? shot.cast.map((layer) => ['sprite', layer]) : []),
        ['sprite', shot.sprite],
    ].filter(([, layer]) => layer);
    const images = await Promise.all(layers.map(([, layer]) => loadImage(doc, layer.image)));
    for (const [index, [kind, layer]] of layers.entries()) {
        const img = images[index];
        if (!img) continue;
        const box = layoutLayer(kind, img, width, height, layer);
        if (box) ctx.drawImage(img, box.x, box.y, box.w, box.h);
    }
    try {
        return canvas.toDataURL('image/jpeg', 0.86);
    } catch {
        return '';
    }
}

function photoEntry(photo) {
    return {
        key: `${PHOTO_KEY_PREFIX}${photo.id}`,
        kind: 'photo',
        photoId: photo.id,
        chatId: photo.chatId,
        messageId: photo.messageId,
        slot: '照片',
        dataUrl: photo.dataUrl,
        prompt: photo.caption,
        updatedAt: photo.createdAt,
        hidden: photo.hidden,
        favorite: photo.favorite,
    };
}

// 包装 CG 库服务：楼层 CG 分页取完（next 为空）后，游标切到 photo:<偏移> 继续翻相册。
export function withPhotoAlbum(service, store, options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    const makeId = typeof options.makeId === 'function' ? options.makeId : () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const compose = typeof options.compose === 'function' ? options.compose : composePhoto;
    const getDocument = typeof options.getDocument === 'function' ? options.getDocument : () => globalThis.document;
    const base = service || { loadPage: async () => ({ ok: true, items: [], next: '' }) };
    const isPhotoKey = (key) => String(key || '').startsWith(PHOTO_KEY_PREFIX);

    async function loadPhotos(offset, filters) {
        const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 24;
        let photos = [];
        try { photos = await store.list(filters.deferImages ? { deferImages: true } : undefined); } catch { return { ok: false, reason: 'read-error', items: [], next: '' }; }
        const slice = photos.slice(offset, offset + limit);
        const items = slice.map(photoEntry)
            .filter((e) => (filters.showHidden || !e.hidden) && (!filters.favoritesOnly || e.favorite) && (!filters.chatId || e.chatId === filters.chatId));
        const next = offset + limit < photos.length ? `${PHOTO_CURSOR_PREFIX}${offset + limit}` : '';
        return { ok: true, items, next };
    }

    async function loadPage(filters = {}) {
        const after = String(filters.after || '');
        if (after.startsWith(PHOTO_CURSOR_PREFIX)) return loadPhotos(Number(after.slice(PHOTO_CURSOR_PREFIX.length)) || 0, filters);
        const page = await base.loadPage(filters);
        if (!page || page.ok === false || page.next) return page;
        const photos = await loadPhotos(0, filters);
        if (!photos.ok) return page;
        return { ...page, items: [...(page.items || []), ...photos.items], next: photos.next };
    }

    async function patchPhoto(key, patch) {
        const photo = await store.get(String(key).slice(PHOTO_KEY_PREFIX.length));
        if (!photo) return { ok: false, reason: 'not-found' };
        return store.put({ ...photo, ...patch });
    }

    async function capturePhoto(shot = {}) {
        const dataUrl = await compose(getDocument(), shot);
        if (!dataUrl) return { ok: false, reason: 'compose-failed' };
        const result = await store.put({
            id: makeId(), chatId: shot.chatId, messageId: shot.messageId, caption: shot.caption, dataUrl, createdAt: now(),
        });
        if (result && result.ok) {
            try {
                const photos = await store.list();
                for (const old of photos.slice(PHOTO_ALBUM_LIMIT)) if (!old.favorite) await store.remove(old.id);
            } catch { /* 清理失败下次再清 */ }
        }
        return result;
    }

    async function remove(entry) {
        if (entry && entry.kind === 'photo') {
            if (!store || typeof store.remove !== 'function') return { ok: false, reason: 'delete-unavailable' };
            return store.remove(entry.photoId);
        }
        if (!base.remove) return { ok: false, reason: 'delete-unavailable' };
        return base.remove(entry);
    }

    // 勾选删除走 removeMany。内层那份只认识楼层 CG，照片会全部失败。
    async function removeMany(entries) {
        const keys = [];
        let failed = 0;
        for (const entry of entries || []) {
            const result = await remove(entry);
            if (result && result.ok && entry && entry.key) keys.push(entry.key);
            else failed += 1;
        }
        return { ok: failed === 0, removed: keys.length, failed, keys };
    }

    async function removeAll() {
        let removed = 0;
        let failed = 0;
        for (let guard = 0; guard < 500; guard += 1) {
            const page = await loadPage({ limit: 48, showHidden: true });
            if (!page || page.ok === false) return { ok: false, reason: page && page.reason, removed, failed, keys: [] };
            if (!page.items || !page.items.length) break;
            const batch = await removeMany(page.items);
            removed += batch.removed;
            failed += batch.failed;
            if (!batch.removed) break;
        }
        return { ok: failed === 0, removed, failed, keys: [] };
    }

    async function listCatalogEntries(filters = {}, onProgress) {
        const cg = typeof base.listCatalogEntries === 'function'
            ? await base.listCatalogEntries(filters, onProgress)
            : { ok: true, items: [], next: '' };
        if (!cg || cg.ok === false) return cg || { ok: false, reason: 'read-error', items: [], next: '' };
        if (filters.favoritesOnly || typeof store.listIds !== 'function') return cg;
        let ids = [];
        const tell = (seen) => { if (typeof onProgress === 'function') onProgress({ phase: 'photos', seen }); };
        tell(0);
        try { ids = await store.listIds(tell); } catch { return cg; }
        const photos = (ids || []).map((id) => photoEntry({ id: String(id), chatId: '', messageId: 0, caption: '', dataUrl: '', createdAt: '', hidden: false, favorite: false }))
            .filter((entry) => (filters.showHidden || !entry.hidden) && (!filters.chatId || entry.chatId === filters.chatId));
        return { ok: true, items: [...(cg.items || []), ...photos].sort(compareCgNewestFirst), next: '' };
    }

    async function hydrateEntry(entry) {
        if (entry && entry.kind === 'photo' && entry.photoId && !/^(?:data:image\/|https?:\/\/|blob:)/i.test(String(entry.dataUrl || ''))) {
            const photo = await store.get(entry.photoId);
            return { ...entry, dataUrl: String(photo && photo.dataUrl || '') };
        }
        if (typeof base.hydrateEntry === 'function') return base.hydrateEntry(entry);
        return entry;
    }

    return {
        ...base,
        loadPage,
        listCatalogEntries,
        hydrateEntry,
        capturePhoto,
        setHidden: (key, hidden) => (isPhotoKey(key) ? patchPhoto(key, { hidden: hidden === true }) : base.setHidden(key, hidden)),
        setFavorite: (key, favorite) => (isPhotoKey(key) ? patchPhoto(key, { favorite: favorite === true }) : base.setFavorite(key, favorite)),
        remove,
        removeMany,
        removeAll,
    };
}
