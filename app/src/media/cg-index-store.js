// CG 库目录（IndexedDB igs-cg-index）：每张楼层 CG / 照片一条轻记录，缩略图单独一张表。
// entries：{ key, kind, chatId, messageId, swipeId, slot, photoId, updatedAt, ready, hidden, favorite }，不含任何图片。
// thumbs：{ key, dataUrl, stamp }，320 宽 JPEG；stamp 等于生成时条目的 updatedAt，图换了就对不上、重新生成。
// 原图仍在 igs-illustrations / igs-photo-album 与酒馆文件里，只有看大图时才读。
import { createIdbConnection } from './idb-connection.js';
import { localImageCacheFor } from './tavern-image-cache.js';
import { requireMediaCache } from './media-cache-owner.js';
import { cgEntryStamp } from './cg-entry-stamp.js';

const DB_NAME = 'igs-cg-index';
const DB_VERSION = 2;
const ENTRIES = 'entries';
const THUMBS = 'thumbs';

const keyOf = (value) => String(value || '');

export function createMemoryCgIndexStore({ mediaCache } = {}) {
    const entries = new Map();
    const cache = requireMediaCache(mediaCache, 'cg-index');
    return {
        mediaCache: cache,
        async getAll() { return Array.from(entries.values(), (e) => ({ ...e })); },
        async putMany(list) { for (const e of list || []) if (e && e.key) entries.set(e.key, { ...e }); },
        async upsert(list) {
            for (const e of list || []) {
                if (!e || !e.key) continue;
                const old = entries.get(e.key);
                entries.set(e.key, old ? { ...e, hidden: old.hidden, favorite: old.favorite } : { ...e });
            }
        },
        async patch(key, fields) {
            const current = entries.get(keyOf(key));
            if (current) entries.set(current.key, { ...current, ...fields, key: current.key });
        },
        async removeMany(keys) { for (const k of keys || []) { entries.delete(keyOf(k)); await cache.dropPrefix(`thumb:cg:${keyOf(k)}:`); } },
        async getThumbs(keys) {
            const out = new Map();
            for (const k of keys || []) {
                const stamp = cgEntryStamp(entries.get(keyOf(k)));
                const dataUrl = await cache.get(`thumb:cg:${keyOf(k)}:${stamp}`);
                if (dataUrl) out.set(keyOf(k), { key: keyOf(k), dataUrl, stamp });
            }
            return out;
        },
        async putThumb(key, dataUrl, stamp) { await cache.put(`thumb:cg:${keyOf(key)}:${String(stamp || '')}`, dataUrl); },

    };
}

export function createIndexedDbCgIndexStore(globalObject = globalThis) {
    const idb = globalObject && globalObject.indexedDB;
    if (!idb) return createMemoryCgIndexStore({ mediaCache: localImageCacheFor(globalObject) });
    const conn = createIdbConnection(idb, DB_NAME, DB_VERSION, (db) => {
        if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: 'key' });
        if (db.objectStoreNames.contains(THUMBS)) db.deleteObjectStore(THUMBS);
    });
    const cache = localImageCacheFor(globalObject);
    return {
        mediaCache: cache,
        async getAll() { return (await conn.transact(ENTRIES, 'readonly', (tx) => tx.objectStore(ENTRIES).getAll())) || []; },
        async putMany(list) {
            const rows = (list || []).filter((e) => e && e.key);
            if (!rows.length) return;
            await conn.transact(ENTRIES, 'readwrite', (tx) => { const s = tx.objectStore(ENTRIES); for (const e of rows) s.put(e); return () => undefined; });
        },
        // 插图写入时用：条目已在就保留它的隐藏 / 收藏，其余字段换新。
        async upsert(list) {
            const rows = (list || []).filter((e) => e && e.key);
            if (!rows.length) return;
            await conn.transact(ENTRIES, 'readwrite', (tx) => {
                const s = tx.objectStore(ENTRIES);
                for (const e of rows) {
                    const req = s.get(e.key);
                    req.onsuccess = () => { const old = req.result; s.put(old ? { ...e, hidden: old.hidden, favorite: old.favorite } : e); };
                }
                return () => undefined;
            });
        },
        // 只改已有条目的几个字段；条目不在就不建。
        async patch(key, fields) {
            await conn.transact(ENTRIES, 'readwrite', (tx) => {
                const s = tx.objectStore(ENTRIES);
                const req = s.get(keyOf(key));
                req.onsuccess = () => { if (req.result) s.put({ ...req.result, ...fields, key: req.result.key }); };
                return () => undefined;
            });
        },
        async removeMany(keys) {
            const list = (keys || []).map(keyOf).filter(Boolean);
            if (!list.length) return;
            await conn.transact(ENTRIES, 'readwrite', (tx) => {
                const e = tx.objectStore(ENTRIES);
                for (const k of list) e.delete(k);
                return () => undefined;
            });
            for (const key of list) await cache.dropPrefix(`thumb:cg:${key}:`);
        },
        async getThumbs(keys) {
            const list = (keys || []).map(keyOf).filter(Boolean), out = new Map();
            const records = await conn.transact(ENTRIES, 'readonly', tx => {
                const requests = list.map(key => tx.objectStore(ENTRIES).get(key));
                return () => requests.map(request => request.result);
            });
            await Promise.all(records.map(async (record, i) => {
                const stamp = cgEntryStamp(record), dataUrl = await cache.get(`thumb:cg:${list[i]}:${stamp}`);
                if (dataUrl) out.set(list[i], { key: list[i], dataUrl, stamp });
            }));
            return out;
        },
        async putThumb(key, dataUrl, stamp) { await cache.put(`thumb:cg:${keyOf(key)}:${String(stamp || '')}`, dataUrl); },

    };
}
