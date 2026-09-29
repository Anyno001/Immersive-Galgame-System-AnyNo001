// CG 库状态库（IndexedDB igs-cg-gallery）：只记录隐藏与收藏，键为 slotKey（chatId|messageId|swipeId|slot）。
// 不存图片、不写 igs-illustrations；「隐藏」只影响 CG 库视图，不影响楼层显示。
const DB_NAME = 'igs-cg-gallery';
const DB_VERSION = 1;
const STORE = 'marks';

export function normalizeCgMark(value) {
    const src = value && typeof value === 'object' ? value : {};
    const key = String(src.key || '').trim();
    if (!key) return null;
    return { key, hidden: src.hidden === true, favorite: src.favorite === true, updatedAt: String(src.updatedAt || '') };
}

// 既不隐藏也不收藏的标记没有信息量，直接删除，保持库小。
const isEmptyMark = (mark) => !mark.hidden && !mark.favorite;

export function createMemoryCgGalleryStore() {
    const marks = new Map();
    return {
        async getAll() { return Array.from(marks.values()).map((m) => ({ ...m })); },
        async get(key) { const m = marks.get(String(key || '')); return m ? { ...m } : null; },
        async put(value) {
            const mark = normalizeCgMark(value);
            if (!mark) return { ok: false, reason: 'invalid-key' };
            if (isEmptyMark(mark)) marks.delete(mark.key);
            else marks.set(mark.key, mark);
            return { ok: true, mark };
        },
        async remove(key) { marks.delete(String(key || '')); return { ok: true }; },
    };
}

export function createIndexedDbCgGalleryStore(globalObject = globalThis) {
    const idb = globalObject && globalObject.indexedDB;
    if (!idb) return createMemoryCgGalleryStore();
    let dbPromise = null;
    const open = () => {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const req = idb.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => { dbPromise = null; reject(req.error); };
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
        async getAll() { return (await run('readonly', (s) => s.getAll())) || []; },
        async get(key) { return (await run('readonly', (s) => s.get(String(key || '')))) || null; },
        async put(value) {
            const mark = normalizeCgMark(value);
            if (!mark) return { ok: false, reason: 'invalid-key' };
            await run('readwrite', (s) => (isEmptyMark(mark) ? s.delete(mark.key) : s.put(mark)));
            return { ok: true, mark };
        },
        async remove(key) { await run('readwrite', (s) => s.delete(String(key || ''))); return { ok: true }; },
    };
}
