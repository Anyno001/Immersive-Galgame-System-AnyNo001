import { requireMediaCache } from '../../media/media-cache-owner.js';
import { createAssetRecordCache } from '../../media/asset-record-cache.js';
// 物品图 / 卡面图记录与图片的按聊天缓存：只读本地存储，不联网；同步取图未命中时异步补载并发事件通知重绘。
// owner 是媒体缓存登记名（物品 item-records、卡面 card-records），两类记录各占一份预算，互不清理。
export function createItemRecordCache({ store, type, emit, mediaCache, onError, owner = 'item-records' }) {
    const images = requireMediaCache(mediaCache, owner);
    const keyOf = id => `asset:${id}`;
    const pending = new Set();
    const metadata = createAssetRecordCache({ store, mediaCache: images, owner,
        onChanged: chatId => emit({ chatId, reason: 'hydrated' }),
        onClear: () => pending.clear(), pendingCount: () => pending.size, onError,
    });
    function rememberImage(id, dataUrl) { images.remember(keyOf(id), dataUrl); }
    function ensure(chatId) { metadata.use(chatId); }
    const get = (chatId, key) => metadata.peek(chatId, key);
    const read = (chatId, key) => metadata.read(chatId, key);
    const page = (chatId, options = {}) => metadata.query({ limit: 24, ...options, chatId, types: [type] });
    function set(record) { metadata.remember(record); }

    // 同步取图：命中内存直接返回，否则异步从存储补载，补完后发 image-loaded。
    function imageUrl(imageId) {
        if (!imageId) return '';
        const hit = images.peek(keyOf(imageId));
        if (hit) return hit;
        if (!pending.has(imageId)) {
            pending.add(imageId);
            const generation = metadata.epoch();
            const stamp = images.token(keyOf(imageId));
            images.load(keyOf(imageId), async () => (await store.getImage(imageId, { fields: ['dataUrl'] }))?.dataUrl || '', { persist: false }).then(value => {
                if (value && metadata.epoch() === generation && images.token(keyOf(imageId)) === stamp) emit({ imageId, reason: 'image-loaded' });
            }).catch(() => {}).finally(() => { if (metadata.epoch() === generation) pending.delete(imageId); });
        }
        return '';
    }

    async function dropImage(imageId) {
        if (!imageId) return;
        const result = await store.deleteImage(imageId);
        if (result?.ok === false) throw new Error(result.reason || 'image-delete-failed');
        if (!result?.retained?.length) images.forget(keyOf(imageId));
        return result;
    }

    return { ensure, get, read, set, page, imageUrl, rememberImage, dropImage, status: metadata.status, clear: metadata.clear, destroy: metadata.destroy };
}
