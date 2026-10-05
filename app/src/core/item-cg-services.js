// 物品图与 CG 库的服务装配：bootstrap 只调用这里，避免在入口堆业务逻辑。
// 物品图默认关闭（itemImages.enabled=false）时服务入口短路，不读表、不联网；CG 库只读本地存储。
import { createItemImageService, ITEM_IMAGE_UPDATED_EVENT } from '../generated-images/illustration/item-image-service.js';
import { createCgGalleryService } from '../media/cg-gallery-service.js';
import { createIndexedDbCgGalleryStore } from '../media/cg-gallery-store.js';
import { createIndexedDbPhotoAlbumStore, withPhotoAlbum } from '../media/photo-album.js';
import { withTavernPhotoFiles } from '../media/tavern-image-files.js';
import { createShujukuClient } from '../data/shujuku/client.js';
import { buildItemCatalog } from '../data/shujuku/item-catalog.js';
import { createItemLedger } from '../data/shujuku/item-ledger.js';
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';

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
    const itemLedger = createItemLedgerSync({ globalObject, messageHost, events, readTables, getReaderSettings: deps.getReaderSettings, ledger: deps.itemLedger });
    return { itemImages, cgGallery, onItemImageUpdated, itemLedger };
}

// 物品演出的账本同步：物品表更新或最新 AI 楼渲染后比对表格，多出 / 少了的物品记成本楼的获得 / 失去事件。
// 跟随「获得物品演出」开关：关闭时不读表、不向表格插件注册回调。
function createItemLedgerSync({ globalObject, messageHost, events, readTables, getReaderSettings, ledger: injected }) {
    const storage = (() => { try { return globalObject && globalObject.localStorage; } catch { return null; } })();
    const ledger = injected || createItemLedger({ storage });
    const enabled = () => {
        const rs = typeof getReaderSettings === 'function' ? getReaderSettings() || {} : {};
        return Boolean(rs.itemFx && rs.itemFx.enabled === true);
    };
    let client = null;
    let timer = null;
    let listening = false;
    const offs = [];

    // 开关可能在运行中切换：每次楼层事件顺带对齐表格回调的注册状态。
    function alignTableCallback() {
        const want = enabled();
        if (want === listening) return;
        if (!client) client = createShujukuClient((globalObject && globalObject.AutoCardUpdaterAPI) || null);
        if (want) client.registerCallback(schedule);
        else client.unregisterCallback(schedule);
        listening = want;
    }

    function latestAiFloor() {
        const ctx = getSillyTavernContext(globalObject);
        const length = ctx && Array.isArray(ctx.chat) ? ctx.chat.length : 0;
        for (let i = length - 1; i >= Math.max(0, length - 3); i -= 1) {
            const floor = messageHost.readFloor(i);
            if (floor && floor.isAi) return floor;
        }
        return null;
    }

    function syncNow() {
        timer = null;
        alignTableCallback();
        if (!enabled()) return;
        const floor = latestAiFloor();
        if (!floor || !floor.chatId) return;
        const read = readTables();
        if (!read || read.ok === false) return;
        const catalog = buildItemCatalog(read);
        if (catalog.status !== 'ready' && catalog.status !== 'empty') return;
        const result = ledger.sync(floor.chatId, catalog.items, floor);
        if (result.changed && events && typeof events.emit === 'function') {
            events.emit(ITEM_IMAGE_UPDATED_EVENT, { chatId: floor.chatId, reason: 'ledger' });
        }
    }

    // 表格插件一次更新会连发多次回调，合并成一次比对。
    const schedule = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(syncNow, 300);
    };

    return {
        ...ledger,
        start() {
            if (offs.length) return;
            alignTableCallback();
            offs.push(() => { if (listening) { client.unregisterCallback(schedule); listening = false; } });
            if (events && typeof events.on === 'function') {
                const off = events.on('igs:legacy-settings-updated', schedule);
                if (typeof off === 'function') offs.push(off);
            }
            for (const name of ['CHARACTER_MESSAGE_RENDERED', 'MESSAGE_SWIPED', 'CHAT_CHANGED']) {
                if (messageHost && typeof messageHost.on === 'function') offs.push(messageHost.on(name, schedule));
            }
        },
        stop() {
            if (timer) clearTimeout(timer);
            timer = null;
            for (const off of offs.splice(0)) { try { off(); } catch { /* 宿主已卸载 */ } }
        },
    };
}
