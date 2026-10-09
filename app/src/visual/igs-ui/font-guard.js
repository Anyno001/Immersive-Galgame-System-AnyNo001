// 全局字体兜底：酒馆主题常用 `*{font-family:…!important}` 强制正文字体，会压过阅读器 / 设置器里的所有字体。
// 挂载后读一次根节点的实际字体：认不出是我们写的无衬线栈，就给根节点挂 data-igs-font-guard，
// 由 cascade layer 里的 !important（优先级高于未分层的 !important）把整棵树拉回无衬线。
// 没被夺舍时不挂，皮肤自选字体照常生效。
import { IGS_UI_FONT_SANS } from '../../styles/ui-material.js';

export const FONT_GUARD_ATTR = 'data-igs-font-guard';
const STYLE_ID = 'igs-font-guard-style';
// 阅读器挂在 #igs-overlay 本身；设置器的 #igs-unified-settings 每次重绘都会换，属性挂在它的外层容器上。
const GUARDED = `#igs-overlay[${FONT_GUARD_ATTR}],[${FONT_GUARD_ATTR}] #igs-unified-settings`;

export const FONT_GUARD_STYLE_TEXT = `@layer igs-font-guard{:is(${GUARDED}){font-family:${IGS_UI_FONT_SANS}!important;}`
    + `:is(${GUARDED}) :not(svg,svg *){font-family:inherit!important;}}`;

// 我们自己的栈里一定带这几个名字之一；被主题换掉后一个都不剩。
const OWN_FONT_RE = /apple-system|PingFang|Microsoft YaHei|Noto Sans/i;

function ensureStyle(doc) {
    if (!doc || doc.getElementById(STYLE_ID) || typeof doc.createElement !== 'function') return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = FONT_GUARD_STYLE_TEXT;
    (doc.head || doc.documentElement).appendChild(style);
}

// probe：读字体的节点（默认 root 本身）；root：挂属性的节点。
export function applyFontGuard(root, probe = root) {
    const doc = root && root.ownerDocument;
    const view = doc && doc.defaultView;
    if (!view || typeof view.getComputedStyle !== 'function' || typeof root.setAttribute !== 'function') return false;
    if (root.hasAttribute && root.hasAttribute(FONT_GUARD_ATTR)) return true;
    if (!probe) return false;
    const family = String(view.getComputedStyle(probe).fontFamily || '');
    if (!family || OWN_FONT_RE.test(family)) return false;
    ensureStyle(doc);
    root.setAttribute(FONT_GUARD_ATTR, '1');
    return true;
}

// 挂载后等样式表生效再测。
export function scheduleFontGuard(root) {
    const view = root && root.ownerDocument && root.ownerDocument.defaultView;
    if (!view) return;
    const run = () => {
        try {
            const probe = root.id === 'igs-overlay' ? root : root.querySelector && root.querySelector('#igs-unified-settings');
            applyFontGuard(root, probe);
        } catch {
            // 读不到计算样式时不兜底。
        }
    };
    if (typeof view.requestAnimationFrame === 'function') view.requestAnimationFrame(run);
    else if (typeof view.setTimeout === 'function') view.setTimeout(run, 0);
}
