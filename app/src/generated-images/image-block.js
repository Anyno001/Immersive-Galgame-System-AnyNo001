// 论坛体「屏蔽生图」：开着论坛体且勾了这一项时，所有出图与素材入库都不跑。
// 只在读取时盖一层，不改用户存下的生图设置；关掉论坛体或取消勾选即恢复原样。
import { IMAGE_ENTRY_METHODS } from './generation-activity.js';

export const IMAGES_BLOCKED_REASON = 'images-blocked';
const BLOCKED_TEXT = '论坛体已屏蔽生图';

export function forumBlocksImages(readerSettings) {
    const forum = readerSettings && readerSettings.forumReader;
    return Boolean(forum && forum.on === true && forum.noImages === true);
}

// 给生图服务看的配置：自动 CG、立绘、背景、衣装入库、物品图一律视为关，并带上 imagesBlocked 标记。
export function withImagesBlocked(bridge) {
    const auto = bridge.autoIllustration && typeof bridge.autoIllustration === 'object' ? bridge.autoIllustration : {};
    const assets = auto.assets && typeof auto.assets === 'object' ? auto.assets : {};
    return {
        ...bridge,
        imagesBlocked: true,
        autoIllustration: { ...auto, nsfwEnabled: false, interludeEnabled: false, backfillOldFloors: false,
            assets: { ...assets, spriteEnabled: false, backgroundEnabled: false, outfitAutoGenerate: false } },
        itemImages: { ...(bridge.itemImages || {}), enabled: false },
    };
}

// 图像后端的出图入口（手动与自动都经过这里）：屏蔽时直接返回失败，不联网。
export function blockImageBackend(backend, isBlocked) {
    if (!backend || typeof isBlocked !== 'function') return backend;
    const wrapped = { ...backend };
    for (const name of IMAGE_ENTRY_METHODS) {
        if (typeof backend[name] !== 'function') continue;
        wrapped[name] = (...args) => (isBlocked()
            ? Promise.resolve({ ok: false, reason: IMAGES_BLOCKED_REASON, error: BLOCKED_TEXT })
            : backend[name](...args));
    }
    return wrapped;
}
