import { createIdbConnection } from './idb-connection.js';

const DB_NAME = 'igs-illustrations';
const DB_VERSION = 1;

let serial = 0;
const revisionOf = (record) => Number.isSafeInteger(record?.revision) ? record.revision : 0;
const revisionToken = () => `${Date.now().toString(36)}-${++serial}-${Math.random().toString(36).slice(2)}`;
const revised = (old, value, floorKey) => ({ ...value, floorKey, key: `${floorKey}|${value.slot}`,
    revision: revisionOf(old) + 1, revisionToken: revisionToken() });

// 检查与写入属于同一存储事务；token 防止删除后重建时 revision 碰巧相同。
function slotPatch(old, expectedRevision, patch, options) {
    if (!old) return { ok: false, reason: 'not-found' };
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== revisionOf(old)
        || options.expectedToken !== old.revisionToken) return { ok: false, reason: 'stale-revision' };
    if (options.shouldCommit && !options.shouldCommit()) return { ok: false, reason: 'stale-target' };
    if (patch.dataUrl !== undefined && !patch.dataUrl) return { ok: false, reason: 'empty-result' };
    const { key, floorKey, slot, revision, revisionToken: token, ...fields } = patch;
    const next = { ...old, ...fields };
    // 合成 CG 没有整图 wire；使用显式选项，避免文件层复制丢掉 undefined 后留下旧来源。
    if (options.clearSentPrompt === true) delete next.sentPrompt;
    if (options.preserveBaseline && !old.consistencyBaselineDataUrl) {
        next.consistencyBaselineDataUrl = old.dataUrl;
        next.consistencyBaselineMeta = { revision: revisionOf(old),
            ...Object.fromEntries(['characterMeta', 'caption', 'originalSize', 'prompt', 'promptRecipe',
                'dnaSnapshot', 'outfitSnapshot', 'sentPrompt', 'consistencyPrompt', 'captionMode', 'promptEdited']
                .filter((field) => old[field] !== undefined).map((field) => [field, structuredClone(old[field])])) };
    }
    return { ok: true, record: revised(old, next, old.floorKey) };
}

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
        async putSlot(floorKey, value) {
            const key = `${floorKey}|${value.slot}`;
            const record = revised(slots.get(key), value, floorKey);
            slots.set(key, clone(record));
            return clone(record);
        },
        async updateSlot(floorKey, slot, expectedRevision, patch, options = {}) {
            await options.beforeCommit?.();
            const key = `${floorKey}|${slot}`;
            const result = slotPatch(slots.get(key), expectedRevision, patch, options);
            if (result.ok) slots.set(key, clone(result.record));
            return clone(result);
        },
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
            return run('slots', 'readwrite', (s) => {
                let record;
                const req = s.get(`${floorKey}|${value.slot}`);
                req.onsuccess = () => {
                    record = revised(req.result, value, floorKey);
                    s.put(record);
                };
                return () => record;
            });
        },
        async updateSlot(floorKey, slot, expectedRevision, patch, options = {}) {
            // 配置复核必须在事务外完成；请求回调中的 shouldCommit 只做同步判断。
            await options.beforeCommit?.();
            return run('slots', 'readwrite', (s) => {
                let result;
                const req = s.get(`${floorKey}|${slot}`);
                req.onsuccess = () => {
                    try {
                        result = slotPatch(req.result,expectedRevision, patch, options);
                        if (result.ok) s.put(result.record);
                    } catch { result = { ok: false, reason: 'update-failed' }; }
                };
                return () => result;
            });
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
