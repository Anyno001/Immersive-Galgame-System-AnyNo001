// 相册：日常演出「拍照」把当前背景与立绘合成一张 JPEG，存进独立的 IndexedDB igs-photo-album。
// CG 库通过 media/cg-library.js 把照片当 kind:'photo' 条目列出；收藏 / 隐藏 / 删除只动相册库，不碰楼层插图。
import { createIdbConnection } from './idb-connection.js';

const DB_NAME = 'igs-photo-album';
const DB_VERSION = 1;
const STORE = 'photos';
export const PHOTO_ALBUM_LIMIT = 200;
export const PHOTO_WIDTH = 960;

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
        async listIds() { return Array.from(photos.keys()); },
        async get(id) { const p = photos.get(String(id)); return p ? { ...p } : null; },
        async getMany(ids) { return (ids || []).map((id) => { const p = photos.get(String(id)); return p ? { ...p } : null; }); },
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
    const conn = createIdbConnection(idb, DB_NAME, DB_VERSION, (db) => {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    });
    const run = (mode, fn) => conn.transact(STORE, mode, (tx) => fn(tx.objectStore(STORE)));
    return {
        async list() { return ((await run('readonly', (s) => s.getAll())) || []).map(normalizePhoto).filter(Boolean).sort(byNewest); },
        async listIds() { return Array.from((await run('readonly', (s) => s.getAllKeys())) || [], String); },
        async get(id) { return normalizePhoto(await run('readonly', (s) => s.get(String(id)))); },
        async getMany(ids) {
            const list = (ids || []).map(String);
            if (!list.length) return [];
            return run('readonly', (s) => {
                const reqs = list.map((id) => s.get(id));
                return () => reqs.map((req) => normalizePhoto(req.result));
            });
        },
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
