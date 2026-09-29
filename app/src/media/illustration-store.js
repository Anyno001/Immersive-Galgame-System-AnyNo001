const DB_NAME = 'igs-illustrations';
const DB_VERSION = 1;

export function floorKeyOf({ chatId, messageId, swipeId }) {
    return `${chatId}|${messageId}|${Number(swipeId) || 0}`;
}

export function slotKeyOf(floor, slot) {
    return `${floorKeyOf(floor)}|${slot}`;
}

// floorKey = chatId|messageId|swipeId；chatId 可能含 '|'，只从右侧取两段。
export function parseFloorKey(floorKey) {
    const parts = String(floorKey || '').split('|');
    if (parts.length < 3) return null;
    const swipeId = Number(parts.pop());
    const messageId = Number(parts.pop());
    const chatId = parts.join('|');
    if (!chatId || !Number.isInteger(messageId) || messageId < 0 || !Number.isInteger(swipeId) || swipeId < 0) return null;
    return { chatId, messageId, swipeId };
}

// CG 库分页上限：slots 记录内嵌 dataUrl，单页必须有界，避免一次读入全部图片。
const PAGE_LIMIT_MAX = 48;
const pageLimitOf = (limit) => Math.max(1, Math.min(Math.trunc(Number(limit)) || 24, PAGE_LIMIT_MAX));

export function createMemoryIllustrationStore() {
    const floors = new Map();
    const slots = new Map();
    const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
    return {
        async getFloor(key) { return clone(floors.get(key)); },
        async putFloor(key, value) { floors.set(key, clone({ ...value, key })); },
        async getSlots(floorKey) {
            return Array.from(slots.values()).filter((s) => s.floorKey === floorKey).map(clone).sort((a, b) => a.slot - b.slot);
        },
        async putSlot(floorKey, value) { slots.set(`${floorKey}|${value.slot}`, clone({ ...value, floorKey })); },
        async deleteSlot(floorKey, slot) { return slots.delete(`${floorKey}|${slot}`); },
        // CG 库：按 key 升序只读分页，只返回已出图（done）的槽位；不修改任何记录。
        async listDoneSlotsPage({ after = '', limit = 24 } = {}) {
            const size = pageLimitOf(limit);
            const keys = Array.from(slots.keys()).filter((k) => !after || k > after).sort();
            const items = [];
            for (const k of keys) {
                const v = slots.get(k);
                if (v && v.status === 'done' && v.dataUrl) items.push(clone({ ...v, key: k }));
                if (items.length >= size) return { items, next: k };
            }
            return { items, next: '' };
        },
    };
}

export function createIndexedDbIllustrationStore(globalObject = globalThis) {
    const idb = globalObject && globalObject.indexedDB;
    if (!idb) return createMemoryIllustrationStore();
    let dbPromise = null;
    const open = () => {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const req = idb.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('floors')) db.createObjectStore('floors', { keyPath: 'key' });
                    if (!db.objectStoreNames.contains('slots')) {
                        const store = db.createObjectStore('slots', { keyPath: 'key' });
                        store.createIndex('floorKey', 'floorKey', { unique: false });
                    }
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
            tx.onerror = () => reject(tx.error);
        });
    };
    return {
        async getFloor(key) { return (await run('floors', 'readonly', (s) => s.get(key))) || null; },
        async putFloor(key, value) { await run('floors', 'readwrite', (s) => s.put({ ...value, key })); },
        async getSlots(floorKey) {
            const list = await run('slots', 'readonly', (s) => s.index('floorKey').getAll(floorKey));
            return (list || []).sort((a, b) => a.slot - b.slot);
        },
        async putSlot(floorKey, value) {
            await run('slots', 'readwrite', (s) => s.put({ ...value, floorKey, key: `${floorKey}|${value.slot}` }));
        },
        async deleteSlot(floorKey, slot) {
            await run('slots', 'readwrite', (s) => s.delete(`${floorKey}|${slot}`));
            return true;
        },
        // CG 库只读游标分页：不升 DB_VERSION、不建新索引；按主键升序，只收 done 槽位。
        async listDoneSlotsPage({ after = '', limit = 24 } = {}) {
            const size = pageLimitOf(limit);
            const db = await open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('slots', 'readonly');
                const KeyRange = globalObject.IDBKeyRange;
                const range = after && KeyRange ? KeyRange.lowerBound(after, true) : null;
                const req = tx.objectStore('slots').openCursor(range);
                const items = [];
                let next = '';
                req.onsuccess = () => {
                    const cursor = req.result;
                    if (!cursor) return;
                    const value = cursor.value;
                    if (value && value.status === 'done' && value.dataUrl) items.push(value);
                    if (items.length >= size) { next = String(cursor.key); return; }
                    cursor.continue();
                };
                tx.oncomplete = () => resolve({ items, next });
                tx.onerror = () => reject(tx.error);
            });
        },
    };
}
