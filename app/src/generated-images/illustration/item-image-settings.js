// 物品图设置规范化：默认关闭；关闭时服务入口必须短路（不读表、不联网）。
// 独立于 autoIllustration.assets，不受场景素材开关门控。
export const ITEM_IMAGE_SIZES = Object.freeze(['1024x1024', '832x832', '640x640']);
// 背包格位图标是用户显示偏好（不是兜底）：image = 显示 AI 物品图（未生成时用 SVG 占位），
// svg = 始终用内置 SVG 图标、不显示任何生图；与是否生成物品图（enabled）相互独立。
export const ITEM_INVENTORY_ICON_MODES = Object.freeze(['image', 'svg']);
export const ITEM_IMAGE_DEFAULTS = Object.freeze({ enabled: false, size: '1024x1024', maxPerFloor: 3, inventoryIcon: 'image' });
const MAX_PER_FLOOR_LIMIT = 5;

export function normalizeItemImageSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const size = ITEM_IMAGE_SIZES.includes(src.size) ? src.size : ITEM_IMAGE_DEFAULTS.size;
    const count = Math.trunc(Number(src.maxPerFloor));
    const maxPerFloor = Number.isFinite(count) && count >= 1
        ? Math.min(count, MAX_PER_FLOOR_LIMIT)
        : ITEM_IMAGE_DEFAULTS.maxPerFloor;
    const inventoryIcon = ITEM_INVENTORY_ICON_MODES.includes(src.inventoryIcon) ? src.inventoryIcon : ITEM_IMAGE_DEFAULTS.inventoryIcon;
    return { enabled: src.enabled === true, size, maxPerFloor, inventoryIcon };
}
