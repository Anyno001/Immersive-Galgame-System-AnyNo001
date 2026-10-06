import { createIdbConnection } from './idb-connection.js';

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
        // CG 库目录：全部槽位的主键（含未出图的），记录本身不读。
        async listSlotKeys() { return Array.from(slots.keys()); },
        async getSlotRecord(key) {
            const value = slots.get(String(key || ''));
            return value ? clone(value) : null;
        },
        async getSlotRecords(keys) {
            return (keys || []).map((key) => { const value = slots.get(String(key || '')); return value ? clone(value) : null; });
        },
    };
}

export function createIndexedDbIllustrationStore(globalObject = globalThis) {
    const idb = globalObject && globalObject.indexedDB;
    if (!idb) return createMemoryIllustrationStore();
    const conn = createIdbConnection(idb, DB_NAME, DB_VERSION, (db) => {
        if (!db.objectStoreNames.contains('floors')) db.createObjectStore('floors', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('slots')) {
            const store = db.createObjectStore('slots', { keyPath: 'key' });
            store.createIndex('floorKey', 'floorKey', { unique: false });
        }
    });
    const run = (storeName, mode, fn) => conn.transact(storeName, mode, (tx) => fn(tx.objectStore(storeName)));
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
        // 一次 getAllKeys 拿全部主键，记录本身（可能内嵌旧 base64）不读。
        async listSlotKeys() {
            return Array.from((await run('slots', 'readonly', (s) => s.getAllKeys())) || [], String);
        },
        async getSlotRecord(key) {
            return (await run('slots', 'readonly', (s) => s.get(String(key || '')))) || null;
        },
        // 同一个事务里按主键取几条，结果与 keys 一一对应，缺的为 null。
        async getSlotRecords(keys) {
            const list = (keys || []).map((key) => String(key || ''));
            if (!list.length) return [];
            return run('slots', 'readonly', (s) => {
                const reqs = list.map((key) => s.get(key));
                return () => reqs.map((req) => req.result || null);
            });
        },
    };
}
