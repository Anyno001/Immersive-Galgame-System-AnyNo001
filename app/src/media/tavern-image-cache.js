// 酒馆文件读回后的浏览器缓存。云酒馆上图片在远端磁盘，按路径留下 dataUrl，同一张不再重新下载。
// 文件名含内容哈希，路径变了就是另一张图。删文件时一并丢掉这条缓存。
const DB_NAME = 'igs-image-cache';
const DB_VERSION = 1;
const MAX_COUNT = 160;
const MAX_BYTES = 192 * 1024 * 1024;

const caches = new WeakMap();
const cacheKey = (path) => String(path || '').replace(/^\//, '');

function memoryStore() {
    const files = new Map();
    const meta = new Map();
    return {
        async get(path) { return files.get(path) || ''; },
        async put(path, dataUrl, usedAt, bytes) {
            files.set(path, dataUrl);
            meta.set(path, { path, usedAt, bytes });
        },
        async touch(path, usedAt) {
            const row = meta.get(path);
            if (row) row.usedAt = usedAt;
        },
        async delete(path) {
            files.delete(path);
            meta.delete(path);
        },
        async allMeta() { return Array.from(meta.values()); },
    };
}

function idbStore(idb) {
    let dbPromise = null;
    const open = () => {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                let req;
                try { req = idb.open(DB_NAME, DB_VERSION); }
                catch (error) { reject(error); return; }
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'path' });
                    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'path' });
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return dbPromise;
    };
    const run = async (storeName, mode, fn) => {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const req = fn(tx.objectStore(storeName));
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = () => reject(tx.error || req && req.error);
            tx.onabort = () => reject(tx.error || req && req.error);
        });
    };
    return {
        async get(path) {
            const row = await run('files', 'readonly', (store) => store.get(path));
            return row && row.dataUrl || '';
        },
        async put(path, dataUrl, usedAt, bytes) {
            await run('files', 'readwrite', (store) => store.put({ path, dataUrl }));
            await run('meta', 'readwrite', (store) => store.put({ path, usedAt, bytes }));
        },
        async touch(path, usedAt) {
            const row = await run('meta', 'readonly', (store) => store.get(path));
            if (!row) return;
            await run('meta', 'readwrite', (store) => store.put({ ...row, usedAt }));
        },
        async delete(path) {
            await run('files', 'readwrite', (store) => store.delete(path));
            await run('meta', 'readwrite', (store) => store.delete(path));
        },
        async allMeta() {
            const rows = await run('meta', 'readonly', (store) => store.getAll());
            return Array.isArray(rows) ? rows : [];
        },
    };
}

export function createLocalImageCache(globalObject = globalThis, options = {}) {
    const now = options.now || (() => Date.now());
    const maxCount = options.maxCount || MAX_COUNT;
    const maxBytes = options.maxBytes || MAX_BYTES;
    const idb = globalObject && globalObject.indexedDB;
    const store = options.store || (idb && typeof idb.open === 'function' ? idbStore(idb) : memoryStore());
    const memory = new Map();
    let meta = null;

    const loadMeta = async () => {
        if (meta) return meta;
        const rows = await store.allMeta().catch(() => []);
        meta = new Map((rows || []).map((row) => [row.path, { usedAt: Number(row.usedAt) || 0, bytes: Number(row.bytes) || 0 }]));
        return meta;
    };
    const trim = async () => {
        const rows = await loadMeta();
        const list = Array.from(rows.entries());
        let bytes = list.reduce((sum, [, row]) => sum + (row.bytes || 0), 0);
        if (list.length <= maxCount && bytes <= maxBytes) return;
        list.sort((a, b) => a[1].usedAt - b[1].usedAt);
        for (const [path, row] of list) {
            if (rows.size <= maxCount && bytes <= maxBytes) break;
            if (rows.size <= 1) break;
            rows.delete(path);
            memory.delete(path);
            bytes -= row.bytes || 0;
            await store.delete(path).catch(() => {});
        }
    };

    return {
        async get(path) {
            const key = cacheKey(path);
            if (!key) return '';
            if (memory.has(key)) {
                const usedAt = now();
                if (meta && meta.has(key)) meta.get(key).usedAt = usedAt;
                store.touch(key, usedAt).catch(() => {});
                return memory.get(key);
            }
            const dataUrl = await store.get(key).catch(() => '');
            if (!dataUrl) return '';
            memory.set(key, dataUrl);
            const usedAt = now();
            const rows = await loadMeta().catch(() => null);
            if (rows && rows.has(key)) rows.get(key).usedAt = usedAt;
            store.touch(key, usedAt).catch(() => {});
            return dataUrl;
        },
        async put(path, dataUrl) {
            const key = cacheKey(path);
            const value = String(dataUrl || '');
            if (!key || !value) return;
            memory.set(key, value);
            const usedAt = now();
            const bytes = value.length;
            const rows = await loadMeta().catch(() => null);
            if (rows) rows.set(key, { usedAt, bytes });
            await store.put(key, value, usedAt, bytes).catch(() => {});
            await trim().catch(() => {});
        },
        async drop(path) {
            const key = cacheKey(path);
            if (!key) return;
            memory.delete(key);
            const rows = meta;
            if (rows) rows.delete(key);
            await store.delete(key).catch(() => {});
        },
    };
}

export function localImageCacheFor(globalObject = globalThis) {
    const key = globalObject || globalThis;
    let cache = caches.get(key);
    if (!cache) {
        cache = createLocalImageCache(key);
        caches.set(key, cache);
    }
    return cache;
}
