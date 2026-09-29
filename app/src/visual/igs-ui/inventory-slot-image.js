// 背包格位与详情头的物品图：有本聊天物品图时显示图片，否则保留原有 SVG 图标。
// 图片只经注入的 resolveImage(name) 同步读取本地缓存；URL 走与演出相同的白名单。
import { safeItemImageUrl } from './fx-item.js';

const escapeAttr = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function resolveInventoryImage(resolveImage, name) {
    if (typeof resolveImage !== 'function' || !String(name || '').trim()) return '';
    try { return safeItemImageUrl(resolveImage(String(name).trim())); } catch (error) { return ''; }
}

// fallbackIconHtml 为原有 RECORD_ICONS[...] 字符串；返回值直接放进格位图标容器。
export function inventoryIconHtml(name, fallbackIconHtml, resolveImage, mode = 'image') {
    // 用户选择 SVG 显示时始终用内置图标，不读取、不显示任何物品生图。
    if (mode === 'svg') return fallbackIconHtml;
    const url = resolveInventoryImage(resolveImage, name);
    if (!url) return fallbackIconHtml;
    return `<img class="igs-record-item-image" src="${escapeAttr(url)}" alt="" decoding="async" draggable="false">`;
}

export const INVENTORY_IMAGE_STYLE_TEXT = `
#igs-record-panel .igs-record-item-image{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;}
`;
