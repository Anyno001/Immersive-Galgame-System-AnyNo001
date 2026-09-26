const DB_NAME = 'igs-illustrations';
const DB_VERSION = 1;

export function floorKeyOf({ chatId, messageId, swipeId }) {
    return `${chatId}|${messageId}|${Number(swipeId) || 0}`;
}

export function slotKeyOf(floor, slot) {
    return `${floorKeyOf(floor)}|${slot}`;
}

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
    };
}
