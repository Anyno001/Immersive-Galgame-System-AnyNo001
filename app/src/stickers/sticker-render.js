import { STICKER_SETS, pickSticker } from './sticker-catalog.js';

// 表情包渲染。图来自 assets/stickers/<套组>/，构建脚本把下面两个 new URL 字面量改写为 ./stickers/<套组>/ 并复制素材。
// 占位 SVG 只在图片加载失败时兜底（installStickerFallback）：圆角实色卡 + 情绪名，颜色取 CSS 变量
// （--igs-sticker-ph-bg / --igs-sticker-ph-ink），浅色深色各一套，变量由各阅读器的样式文件定义。
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BASES = Object.freeze({
    daimao: new URL('../../assets/stickers/daimao/', import.meta.url),
    nga: new URL('../../assets/stickers/nga/', import.meta.url),
});

export function stickerPlaceholderSvg(name) {
    const text = esc(name);
    const size = Array.from(String(name)).length > 2 ? 22 : 30;
    return `<svg class="igs-sticker-ph" viewBox="0 0 100 100" role="img" aria-label="${text}"><rect x="2" y="2" width="96" height="96" rx="22" fill="var(--igs-sticker-ph-bg,#ececf1)"/><text x="50" y="54" text-anchor="middle" dominant-baseline="middle" font-size="${size}" font-weight="700" fill="var(--igs-sticker-ph-ink,#4a4a55)">${text}</text></svg>`;
}

export function stickerImageUrl(image, setId = 'daimao') {
    return new URL(encodeURIComponent(image.file), BASES[setId] || BASES.daimao).href;
}

// 一张图的 <img>：呆猫八条是 240 方图（宽度由样式控制），AC娘按原始宽高写进变量，由样式按比例显示。
export function stickerImgHtml(image, setId, alt, inline) {
    const size = inline && image.w && image.h ? ` width="${image.w}" height="${image.h}" style="--sw:${image.w};--sh:${image.h}"` : '';
    return `<img src="${esc(stickerImageUrl(image, setId))}" alt="${esc(alt)}" draggable="false" loading="lazy"${size}>`;
}

// 一个表情包的 HTML：认不出情绪、描述也对不上、或这个套组没有对应图时返回空串（静默丢弃）。
// set / overrides 决定套组与用户修改（缺省呆猫八条）；AC娘套组出行内小图（is-inline），其余出整块图。
export function stickerHtml(nameOrAlias, { persona, seed, disabled, catalog, pool, set, overrides, cls = '' } = {}) {
    const hit = pickSticker(nameOrAlias, { persona, seed, disabled, catalog, pool, set, overrides });
    if (!hit) return '';
    const setId = STICKER_SETS[set] ? set : 'daimao';
    const inline = Boolean(STICKER_SETS[setId].inline);
    const alt = hit.image && hit.image.desc ? hit.image.desc : hit.name;
    const label = hit.name;
    const inner = hit.image && hit.image.file ? stickerImgHtml(hit.image, setId, alt, inline) : stickerPlaceholderSvg(label);
    const shown = inline ? ' is-inline' : '';
    return `<span class="igs-sticker${shown}${cls ? ` ${cls}` : ''}" data-sticker="${esc(hit.id)}" title="${esc(label)}">${inner}</span>`;
}

// 阅读器侧把设置里的 stickers（规范化后；宿主另挂 personaOf(名字) → persona 数组）整理成挑图参数：论坛按所选套组，线上聊天固定呆猫八条。
export function stickerOptsOf(stickerSettings, { forum = false, speaker = '' } = {}) {
    const s = stickerSettings && typeof stickerSettings === 'object' ? stickerSettings : {};
    return {
        set: forum && s.set ? s.set : 'daimao',
        overrides: s.overrides,
        disabled: Array.isArray(s.disabled) ? s.disabled : [],
        persona: speaker && typeof s.personaOf === 'function' ? s.personaOf(speaker) || [] : [],
    };
}

// 图片加载失败时换成占位卡：error 事件不冒泡，只能在文档上用捕获监听；每个文档只装一次。
const FALLBACK_DOCS = new WeakSet();
export function installStickerFallback(doc) {
    if (!doc || typeof doc.addEventListener !== 'function' || FALLBACK_DOCS.has(doc)) return;
    FALLBACK_DOCS.add(doc);
    doc.addEventListener('error', (event) => {
        const img = event.target;
        if (!img || img.tagName !== 'IMG' || !img.closest) return;
        const box = img.closest('.igs-sticker');
        if (!box) return;
        box.innerHTML = stickerPlaceholderSvg(box.getAttribute('title') || img.getAttribute('alt') || '');
    }, true);
}

// 文本里的 [igs-sticker:名] 全部换成表情包 HTML（文本其余部分调用方已转义）。
export const STICKER_TAG_G = /[\[【［]\s*igs\s*-?\s*sticker\s*[:：]\s*([^\]】］\n]*?)\s*[\]】］]/gi;

export function replaceStickerTags(html, opts) {
    return String(html == null ? '' : html).replace(STICKER_TAG_G, (all, name) => stickerHtml(name, opts));
}
