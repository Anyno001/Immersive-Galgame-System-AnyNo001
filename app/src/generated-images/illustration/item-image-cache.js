// 物品图记录与图片的按聊天缓存：只读本地存储，不联网；同步取图未命中时异步补载并发事件通知重绘。
export function createItemRecordCache({ store, type, emit, imageLimit = 60 }) {
    const images = new Map();
    const pending = new Set();
    let chatId = '';
    let records = new Map();
    let loading = null;

    function rememberImage(id, dataUrl) {
        images.delete(id);
        images.set(id, dataUrl);
        while (images.size > imageLimit) images.delete(images.keys().next().value);
    }

    function ensure(nextChatId) {
        if (nextChatId !== chatId) { chatId = nextChatId; records = new Map(); loading = null; }
        if (!loading) {
            const target = chatId;
            loading = Promise.resolve(store.getAssetsByChat(target)).then((list) => {
                if (chatId !== target) return;
                let found = false;
                for (const record of list || []) {
                    // 已在内存里的记录更新（本轮刚生成），不被旧快照覆盖。
                    if (record && record.type === type && !records.has(record.key)) { records.set(record.key, record); found = true; }
                }
                if (found) emit({ chatId: target, reason: 'hydrated' });
            }).catch(() => { if (chatId === target) loading = null; });
        }
        return loading;
    }

    const get = (targetChatId, key) => (targetChatId === chatId ? records.get(key) || null : null);
    const list = (targetChatId) => (targetChatId === chatId ? Array.from(records.values()) : []);
    function set(record) {
        if (record && record.chatId === chatId) records.set(record.key, record);
    }

    // 同步取图：命中内存直接返回，否则异步从存储补载，补完后发 image-loaded。
    function imageUrl(imageId) {
        if (!imageId) return '';
        const hit = images.get(imageId);
        if (hit) return hit;
        if (!pending.has(imageId)) {
            pending.add(imageId);
            Promise.resolve(store.getImage(imageId)).then((record) => {
                if (record && record.dataUrl) { rememberImage(imageId, record.dataUrl); emit({ imageId, reason: 'image-loaded' }); }
            }).catch(() => {}).finally(() => pending.delete(imageId));
        }
        return '';
    }

    async function dropImage(imageId) {
        if (!imageId) return;
        images.delete(imageId);
        try { await store.deleteImage(imageId); } catch (error) { /* 图片已不存在时忽略 */ }
    }

    return { ensure, get, set, list, imageUrl, rememberImage, dropImage };
}
