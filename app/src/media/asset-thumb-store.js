// 设置页素材缩略图（IndexedDB igs-asset-thumbs）：每张生成 / 上传的图存一张 160 宽小图，
// 设置器列表只读小图，原图（立绘动辄 1024×1536）只在看大图时才读。图被改过（抠图、导入覆盖）或删掉时删掉对应小图。
import { createIdbConnection } from './idb-connection.js';

const DB_NAME = 'igs-asset-thumbs';
const DB_VERSION = 1;
const STORE = 'thumbs';
export const ASSET_THUMB_WIDTH = 160;
const DECODE_TIMEOUT_MS = 15000;

const keyOf = (value) => String(value || '');

export function createMemoryAssetThumbStore() {
    const thumbs = new Map();
    return {
        async get(id) { return thumbs.get(keyOf(id)) || ''; },
        async put(id, dataUrl) { thumbs.set(keyOf(id), String(dataUrl || '')); },
        async remove(ids) { for (const id of ids || []) thumbs.delete(keyOf(id)); },
    };
}

export function createIndexedDbAssetThumbStore(globalObject = globalThis) {
    const idb = globalObject && globalObject.indexedDB;
    if (!idb) return null;
    const conn = createIdbConnection(idb, DB_NAME, DB_VERSION, (db) => {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    });
    return {
        async get(id) {
            const row = await conn.transact(STORE, 'readonly', (tx) => tx.objectStore(STORE).get(keyOf(id)));
            return row && typeof row.dataUrl === 'string' ? row.dataUrl : '';
        },
        async put(id, dataUrl) {
            await conn.transact(STORE, 'readwrite', (tx) => tx.objectStore(STORE).put({ id: keyOf(id), dataUrl: String(dataUrl || '') }));
        },
        async remove(ids) {
            const list = (ids || []).map(keyOf).filter(Boolean);
            if (!list.length) return;
            await conn.transact(STORE, 'readwrite', (tx) => { const s = tx.objectStore(STORE); for (const id of list) s.delete(id); return () => undefined; });
        },
    };
}

// 缩成 160 宽 WebP（立绘要留透明底，不能用 JPEG）；浏览器不支持 WebP 编码时自动给 PNG。没有画布或解码失败返回空串。
export function createAssetThumbnailer(globalObject = globalThis, { width = ASSET_THUMB_WIDTH, quality = 0.82 } = {}) {
    return async function makeThumbnail(src) {
        const doc = globalObject && globalObject.document;
        const ImageCtor = globalObject && globalObject.Image;
        if (!src || !doc || typeof doc.createElement !== 'function' || typeof ImageCtor !== 'function') return '';
        const img = await new Promise((resolve) => {
            const image = new ImageCtor();
            const timer = globalObject.setTimeout(() => resolve(null), DECODE_TIMEOUT_MS);
            image.onload = () => { globalObject.clearTimeout(timer); resolve(image); };
            image.onerror = () => { globalObject.clearTimeout(timer); resolve(null); };
            image.decoding = 'async';
            image.src = src;
        });
        const iw = img && (img.naturalWidth || img.width);
        const ih = img && (img.naturalHeight || img.height);
        if (!iw || !ih) return '';
        if (iw <= width) return '';
        const h = Math.max(1, Math.round((ih * width) / iw));
        const canvas = doc.createElement('canvas');
        canvas.width = width;
        canvas.height = h;
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return '';
        ctx.drawImage(img, 0, 0, width, h);
        try { return canvas.toDataURL('image/webp', quality); } catch { return ''; }
    };
}
