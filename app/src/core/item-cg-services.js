// 物品图与 CG 库的服务装配：bootstrap 只调用这里，避免在入口堆业务逻辑。
// 物品图默认关闭（itemImages.enabled=false）时服务入口短路，不读表、不联网；CG 库只读本地存储。
import { createItemImageService, ITEM_IMAGE_UPDATED_EVENT } from '../generated-images/illustration/item-image-service.js';
import { createCgGalleryService } from '../media/cg-gallery-service.js';
import { createIndexedDbCgGalleryStore } from '../media/cg-gallery-store.js';
import { createIndexedDbPhotoAlbumStore, withPhotoAlbum } from '../media/photo-album.js';
import { withTavernPhotoFiles } from '../media/tavern-image-files.js';
import { createShujukuClient } from '../data/shujuku/client.js';

export function createItemAndCgServices(deps = {}) {
    const { globalObject, messageHost, llm, nai, generatedAssetStore, illustrationStore, clearIllustration, getBridge, events, matte, report } = deps;
    // 表格只在物品图服务真正需要时读取；读取失败按 read-error 处理，不抛到调用方。
    const readTables = () => {
        try {
            return createShujukuClient((globalObject && globalObject.AutoCardUpdaterAPI) || null).readTables();
        } catch (error) {
            return { ok: false, reason: String((error && error.message) || '读取失败') };
        }
    };
    const itemImages = deps.itemImageService || createItemImageService({
        messageHost, llm, nai, store: generatedAssetStore, events, readTables, matte, report,
        getSettings: () => (typeof getBridge === 'function' ? getBridge() || {} : {}),
    });
    // 相册照片并入 CG 库：注入的 cgGalleryService（测试替身）保持原样，默认服务外包一层相册。
    const cgGallery = deps.cgGalleryService || withPhotoAlbum(createCgGalleryService({
        illustrationStore,
        galleryStore: deps.cgGalleryStore || createIndexedDbCgGalleryStore(globalObject),
        clearIllustration,
    }), deps.photoAlbumStore || withTavernPhotoFiles(createIndexedDbPhotoAlbumStore(globalObject), globalObject), { getDocument: () => globalObject && globalObject.document });
    const onItemImageUpdated = (handler) => (events && typeof events.on === 'function' ? events.on(ITEM_IMAGE_UPDATED_EVENT, handler) : () => {});
    return { itemImages, cgGallery, onItemImageUpdated };
}
