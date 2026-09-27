// 生成素材存储：images 存图片本体（素材库与临时素材共用，按 id 引用），
// assets 存本聊天的临时素材记录（按 chatId / floorKey 查询），floors 记录楼层是否已处理过。
const DB_NAME = 'igs-generated-assets';
const DB_VERSION = 1;

const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

export function createMemoryGeneratedAssetStore() {
    const images = new Map();
    const assets = new Map();
    const floors = new Map();
    return {
        async getImage(id) { return clone(images.get(id)); },
        async putImage(value) { images.set(value.id, clone(value)); },
        async deleteImage(id) { images.delete(id); },
        async getAssetsByChat(chatId) { return Array.from(assets.values()).filter((a) => a.chatId === chatId).map(clone); },
        async getAssetsByFloor(floorKey) { return Array.from(assets.values()).filter((a) => a.floorKey === floorKey).map(clone); },
        async putAsset(value) { assets.set(value.key, clone(value)); },
        async getFloor(key) { return clone(floors.get(key)); },
        async putFloor(key, value) { floors.set(key, clone({ ...value, key })); },
    };
}

export function createIndexedDbGeneratedAssetStore(globalObject = globalThis) {
    const idb = globalObject && globalObject.indexedDB;
    if (!idb) return createMemoryGeneratedAssetStore();
    let dbPromise = null;
    const open = () => {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const req = idb.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('floors')) db.createObjectStore('floors', { keyPath: 'key' });
                    if (!db.objectStoreNames.contains('assets')) {
                        const store = db.createObjectStore('assets', { keyPath: 'key' });
                        store.createIndex('chatId', 'chatId', { unique: false });
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
        async getImage(id) { return (await run('images', 'readonly', (s) => s.get(id))) || null; },
        async putImage(value) { await run('images', 'readwrite', (s) => s.put(value)); },
        async deleteImage(id) { await run('images', 'readwrite', (s) => s.delete(id)); },
        async getAssetsByChat(chatId) { return (await run('assets', 'readonly', (s) => s.index('chatId').getAll(chatId))) || []; },
        async getAssetsByFloor(floorKey) { return (await run('assets', 'readonly', (s) => s.index('floorKey').getAll(floorKey))) || []; },
        async putAsset(value) { await run('assets', 'readwrite', (s) => s.put(value)); },
        async getFloor(key) { return (await run('floors', 'readonly', (s) => s.get(key))) || null; },
        async putFloor(key, value) { await run('floors', 'readwrite', (s) => s.put({ ...value, key })); },
    };
}
