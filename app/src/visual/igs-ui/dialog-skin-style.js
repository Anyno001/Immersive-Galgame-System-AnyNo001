import { CLASSIC_DIALOG_STYLE_TEXT, DIALOG_SKIN_WESTERN_CLASSIC, normalizeDialogSkin } from './classic-dialog-skin.js';
import { DIALOG_THEME_CHOICE_STYLE_BY_SKIN } from './dialog-theme-choices.js';
import { getDialogThemeHudStyleText, getDialogThemeItemFxStyleText, getDialogThemeToastStyleText } from './dialog-theme-hud.js';
import { ILLUSTRATED_DIALOG_STYLE_BY_SKIN } from './dialog-theme-skins.js';
import { getDialogThemeBattleFxStyleText } from './fx-battle-themes.js';
import { getDialogThemeTitleCardStyleText } from './fx-title-themes.js';

export const DIALOG_SKIN_STYLE_ID = 'igs-dialog-skin-style';
export const DIALOG_SKIN_FALLBACK_ATTR = 'data-igs-skin-fallback';
export const DIALOG_SKIN_ASSET_TIMEOUT_MS = 4000;
const ANCHOR_STYLE_ID = 'igs-overlay-style';

// 构建脚本把这一基址改写成 dist/skins/，源码运行时直接指向 assets/dialog-themes/。
const SKIN_ASSET_BASE = new URL('./assets/dialog-themes/', import.meta.url).href;
const SKIN_ASSET_TOKEN_RE = /__IGS_ASSET__([a-z0-9-]+)\/([a-z0-9-]+\.(?:png|webp))__/g;

// 素材加载失败时的纯色/渐变底：颜色取自各素材中段的实测均色，保证正文墨色仍可读。
const SKIN_FALLBACK_PALETTES = Object.freeze({
    [DIALOG_SKIN_WESTERN_CLASSIC]: { paper: '#3b3b2a', edge: '#b8903f', plate: '#cdb88a', choice: '#3c3929', hover: '#484827', active: '#3d3a28' },
    'plant-coffee': { paper: '#f4efe9', edge: '#5c4949', plate: '#5c4a4a', choice: '#ede7e1', hover: '#a0c568', active: '#6b5b5b' },
    'black-white-manga': { paper: '#f3eee4', edge: '#171412', plate: '#f3eee4', choice: '#f3eee4', hover: '#d8d2c6' },
    'cute-pink': { paper: '#f5eff1', edge: '#5e5356', plate: '#dc86a0', choice: '#ebd9df', hover: '#db8ba2', active: '#71bfc3' },
    'retro-japanese': { paper: '#f2e4d0', edge: '#6b4a36', plate: '#69493e', choice: '#dbc2a6', hover: '#735241', active: '#635b3b', tag: '#69493e' },
    'adventure-journey': { paper: '#d9cfbe', edge: '#3a2d26', plate: '#433831', choice: '#473d37', hover: '#d2c9ba', active: '#9b692f', tag: '#433831' },
    'elegant-european': { veil: 'linear-gradient(180deg,rgba(6,6,12,0),rgba(6,6,12,.72) 28%,rgba(6,6,12,.78))' },
});

function fallbackCss(skin) {
    const p = SKIN_FALLBACK_PALETTES[skin];
    if (!p) return '';
    const root = `#igs-overlay[${DIALOG_SKIN_FALLBACK_ATTR}]`;
    const dialog = `${root} .igs-dialog[data-igs-dialog-skin="${skin}"]`;
    if (p.veil) return `${dialog}{border-image:none!important;background:${p.veil}!important;}`;
    const bubble = `${root}[data-igs-dialog-skin="${skin}"] .igs-option-bubble`;
    const flat = 'border-image:none!important;';
    const rules = [
        `${dialog}{${flat}background:linear-gradient(180deg,color-mix(in srgb,${p.paper} 86%,#fff),${p.paper})!important;border:2px solid ${p.edge}!important;border-radius:10px!important;}`,
        `${dialog} .igs-speaker{${flat}background:${p.plate}!important;border:2px solid ${p.edge}!important;border-radius:999px!important;}`,
        `${bubble}{${flat}background:${p.choice}!important;border:2px solid ${p.edge}!important;border-radius:8px!important;}`,
        `${bubble}:hover{${flat}background:${p.hover}!important;}`,
    ];
    if (p.active) rules.push(`${bubble}:active{${flat}background:${p.active}!important;}`);
    if (p.tag) rules.push(`${root}[data-igs-dialog-skin="${skin}"] #igs-status-hud .igs-hud-emotion{${flat}background:${p.tag}!important;border-radius:3px!important;}`);
    return rules.join('\n');
}

export function resolveSkinAssetUrls(css, base = SKIN_ASSET_BASE) {
    return String(css || '').replace(SKIN_ASSET_TOKEN_RE, (_match, theme, file) => new URL(`${theme}/${file}`, base).href);
}

export function getDialogSkinStyleText(value, { base } = {}) {
    const skin = normalizeDialogSkin(value);
    const parts = [
        ILLUSTRATED_DIALOG_STYLE_BY_SKIN[skin],
        skin === DIALOG_SKIN_WESTERN_CLASSIC ? CLASSIC_DIALOG_STYLE_TEXT : '',
        DIALOG_THEME_CHOICE_STYLE_BY_SKIN[skin],
        getDialogThemeHudStyleText(skin),
        getDialogThemeItemFxStyleText(skin),
        getDialogThemeToastStyleText(skin),
        getDialogThemeBattleFxStyleText(skin),
        getDialogThemeTitleCardStyleText(skin),
        fallbackCss(skin),
    ].filter(Boolean);
    return resolveSkinAssetUrls(parts.join('\n'), base);
}

export function listDialogSkinAssetUrls(styleText) {
    const urls = new Set();
    for (const [, url] of String(styleText || '').matchAll(/url\("([^"]+)"\)/g)) {
        if (!url.startsWith('data:')) urls.add(url);
    }
    return Array.from(urls);
}

// 皮肤 CSS 单独占一个 style，紧跟在阅读器主样式之后，保持与内联时相同的层叠顺序；切换皮肤只替换文本。
export function applyDialogSkinStyle(doc, value, options = {}) {
    if (!doc || !doc.head || typeof doc.createElement !== 'function') return '';
    const skin = normalizeDialogSkin(value);
    let style = doc.getElementById(DIALOG_SKIN_STYLE_ID);
    if (!style) {
        style = doc.createElement('style');
        style.id = DIALOG_SKIN_STYLE_ID;
        const anchor = doc.getElementById(ANCHOR_STYLE_ID);
        if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
            anchor.parentNode.insertBefore(style, anchor.nextSibling || null);
        } else {
            doc.head.appendChild(style);
        }
    }
    if (style.getAttribute && style.getAttribute('data-igs-skin') === skin) return style.textContent || '';
    const text = getDialogSkinStyleText(skin, options);
    style.textContent = text;
    if (style.setAttribute) style.setAttribute('data-igs-skin', skin);
    return text;
}

const watchers = new WeakMap();

function setFallback(root, on) {
    if (!root || typeof root.setAttribute !== 'function') return;
    if (on) root.setAttribute(DIALOG_SKIN_FALLBACK_ATTR, '1');
    else if (typeof root.removeAttribute === 'function') root.removeAttribute(DIALOG_SKIN_FALLBACK_ATTR);
}

// 预取当前皮肤素材：任一张失败或超时未到就切到纯色/渐变底，全部到齐再撤掉，避免出现空白对话框。
export function watchDialogSkinAssets(root, value, styleText, env = {}) {
    if (!root) return null;
    const skin = normalizeDialogSkin(value);
    const current = watchers.get(root);
    if (current && current.skin === skin) return current;
    if (current) current.cancel();
    setFallback(root, false);
    const view = env.window || (root.ownerDocument && root.ownerDocument.defaultView) || globalThis;
    const ImageCtor = env.Image || (view && view.Image);
    const urls = listDialogSkinAssetUrls(styleText).filter((url) => /^(https?:|blob:|\/|\.)/.test(url));
    const state = { skin, pending: urls.length, failed: false, cancelled: false, timer: null, cancel() {} };
    watchers.set(root, state);
    if (!urls.length || typeof ImageCtor !== 'function') return state;
    const setTimer = env.setTimeout || (view && view.setTimeout && view.setTimeout.bind(view)) || setTimeout;
    const clearTimer = env.clearTimeout || (view && view.clearTimeout && view.clearTimeout.bind(view)) || clearTimeout;
    state.cancel = () => {
        state.cancelled = true;
        if (state.timer) clearTimer(state.timer);
    };
    state.timer = setTimer(() => {
        state.timer = null;
        if (!state.cancelled && state.pending > 0) setFallback(root, true);
    }, env.timeoutMs || DIALOG_SKIN_ASSET_TIMEOUT_MS);
    for (const url of urls) {
        const image = new ImageCtor();
        image.onload = () => {
            if (state.cancelled) return;
            state.pending -= 1;
            if (state.pending === 0 && !state.failed) {
                if (state.timer) clearTimer(state.timer);
                state.timer = null;
                setFallback(root, false);
            }
        };
        image.onerror = () => {
            if (state.cancelled) return;
            state.failed = true;
            setFallback(root, true);
        };
        image.src = url;
    }
    return state;
}

export function syncDialogSkinStyle(root, readerSettings, env = {}) {
    if (!root) return;
    const doc = root.ownerDocument || env.document;
    const skin = readerSettings && readerSettings.dialogSkin;
    const text = applyDialogSkinStyle(doc, skin, env);
    watchDialogSkinAssets(root, skin, text, env);
}
