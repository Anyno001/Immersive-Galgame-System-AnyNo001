// 物品图放大查看：点物品图后在屏幕中央显示大图；点任意处、关闭键或 Esc（阅读器宿主先调 closeItemImageViewer）收起。
// 挂在面板所在的 #igs-overlay 上，不放进面板根节点（面板整块重绘会清掉子节点）；面板关闭时一并收起。
// 图片地址由调用方按物品名现取，这里再过 safeItemImageUrl 白名单，只经属性写入；物品名只进 aria-label 与 alt。
import { safeItemImageUrl } from './fx-item-card.js';

export const ITEM_IMAGE_VIEWER_ID = 'igs-item-viewer';
const opened = new WeakMap();

export function openItemImageViewer(doc, host, { src = '', name = '' } = {}) {
    const url = safeItemImageUrl(src);
    if (!url || !doc?.createElement || typeof host?.appendChild !== 'function') return false;
    closeItemImageViewer(doc);
    const label = String(name || '').trim();
    const el = doc.createElement('div');
    el.id = ITEM_IMAGE_VIEWER_ID;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', label ? `${label}大图` : '物品大图');
    const img = doc.createElement('img');
    img.setAttribute('src', url);
    img.setAttribute('alt', label);
    img.setAttribute('draggable', 'false');
    img.setAttribute('decoding', 'async');
    const shut = doc.createElement('button');
    shut.setAttribute('type', 'button');
    shut.className = 'igs-item-viewer-close';
    shut.setAttribute('aria-label', '关闭大图');
    shut.textContent = '×';
    el.appendChild(img);
    el.appendChild(shut);
    // 点在大图层上的任何位置都只收起大图，不冒泡到阅读器（避免翻页或关掉面板）。
    el.addEventListener('click', (event) => {
        event.stopPropagation?.();
        event.preventDefault?.();
        closeItemImageViewer(doc);
    });
    const previousFocus = doc.activeElement || null;
    host.appendChild(el);
    opened.set(doc, { el, previousFocus });
    shut.focus?.();
    return true;
}

// 有大图开着时收起并返回 true；没有时返回 false（Esc 据此决定是否继续关面板）。
export function closeItemImageViewer(doc) {
    const state = doc ? opened.get(doc) : null;
    if (!state) return false;
    opened.delete(doc);
    state.el.remove?.();
    try { state.previousFocus?.focus?.(); } catch (error) { /* 原焦点已随重绘移除 */ }
    return true;
}

export const ITEM_IMAGE_VIEWER_STYLE_TEXT = `
#igs-item-viewer{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.86);cursor:zoom-out;pointer-events:auto;outline:none;animation:igs-item-viewer-in .16s ease-out both;}
#igs-item-viewer img{display:block;max-width:min(88%,720px);max-height:86%;object-fit:contain;border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.55);-webkit-user-select:none;user-select:none;}
#igs-item-viewer .igs-item-viewer-close{position:absolute;top:12px;right:12px;min-width:44px;min-height:44px;border:none;border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font-size:20px;line-height:1;cursor:pointer;}
#igs-record-panel button.igs-record-item-detail-icon{padding:0;border:0;font:inherit;cursor:zoom-in;overflow:hidden;}
@keyframes igs-item-viewer-in{from{opacity:0;}to{opacity:1;}}
@media (prefers-reduced-motion:reduce){#igs-item-viewer{animation:none;}}
`;
