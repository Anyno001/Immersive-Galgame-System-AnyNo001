// DLC 对话框皮肤登记表：外部脚本经 IGS.api.uiSkins.register 写进来，阅读器各处只从这里读，不另存副本。
// 只依赖无副作用的骨架工具，皮肤模块可以放心引用它而不成环。
// 存档里的 dlc-* 皮肤即使 DLC 这次没加载也原样保留（见 normalizeDialogSkin）：渲染时没有任何皮肤 CSS 命中，
// 对话框自然落回磨砂玻璃的通用样式，下次 DLC 加载了照常生效。
import { buildSlicedDialogSkinCss } from './dialog-skin-frame.js';
import { guardDlcCss, isSafeAssetUrl } from './dlc-css-guard.js';

export const DLC_SKIN_ID_RE = /^dlc-[a-z0-9][a-z0-9-]{0,39}$/;
export const DLC_SKIN_BASES = Object.freeze(['illustrated', 'glass']);

const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab)\([0-9a-z.,%\s/-]+\)|[a-z]+)$/i;
const FONT_RE = /^[^{};<>\\]{1,200}$/;
const TYPOGRAPHY_FONTS = ['nameFont', 'textFont', 'thoughtFont', 'narrationFont'];
const TYPOGRAPHY_COLORS = ['nameColor', 'textColor', 'thoughtColor', 'narrationColor'];

const skins = new Map();
const listeners = new Set();
let version = 0;

export function isDlcSkinId(id) {
    return typeof id === 'string' && DLC_SKIN_ID_RE.test(id);
}

export function getDlcSkin(id) {
    return isDlcSkinId(id) ? skins.get(id) || null : null;
}

export function listDlcSkins() {
    return Array.from(skins.values());
}

// 登记表的变更序号：样式缓存按它判断要不要重算。
export function dlcSkinVersion() {
    return version;
}

export function onDlcSkinsChange(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function changed(id) {
    version += 1;
    for (const listener of Array.from(listeners)) {
        try { listener(id); } catch (error) { /* 监听者出错不影响登记 */ }
    }
}

const num = (value, min, max) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

function readPair(value, min, max) {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const a = num(value[0], min, max);
    const b = num(value[1], min, max);
    return a == null || b == null ? null : [a, b];
}

// 三片素材框：尺寸全部是素材实测像素，含义与内置三片皮肤一致（见 docs/DLC_接入指南.md）。
function readFrame(frame, warnings) {
    if (frame == null) return null;
    const fail = (field) => { warnings.push(`frame.${field} 缺失或超出范围，已忽略整个 frame`); return null; };
    if (!frame || typeof frame !== 'object') return fail('（整体）');
    if (!isSafeAssetUrl(frame.image)) return fail('image（需要 https / data / blob 地址）');
    const height = num(frame.height, 60, 480);
    if (height == null) return fail('height');
    const slice = readPair(frame.slice, 0, 2000);
    if (!slice) return fail('slice');
    const left = num(frame.left, 0, 600);
    const right = num(frame.right, 0, 600);
    if (left == null || right == null) return fail('left / right');
    const t = frame.text || {};
    const text = {};
    for (const key of ['top', 'speakerTop', 'right', 'bottom', 'left']) {
        const v = num(t[key], 0, 300);
        if (v == null) return fail(`text.${key}`);
        text[key] = v;
    }
    const p = frame.plate || {};
    if (!isSafeAssetUrl(p.image)) return fail('plate.image（需要 https / data / blob 地址）');
    const plateSlice = readPair(p.slice, 0, 2000);
    if (!plateSlice) return fail('plate.slice');
    const plate = { slice: plateSlice };
    for (const [key, min, max] of [['left', 0, 300], ['right', 0, 300], ['height', 16, 160], ['x', -200, 600], ['rise', -60, 200], ['lineHeight', 10, 160], ['minWidth', 0, 600]]) {
        const v = num(p[key], min, max);
        if (v == null) return fail(`plate.${key}`);
        plate[key] = v;
    }
    plate.padding = typeof p.padding === 'string' && /^[0-9px.\s-]{1,40}$/.test(p.padding) ? p.padding : '0 36px';
    return { dialog: { height, slice, left, right }, text, plate, assets: { dialog: frame.image.trim(), name: p.image.trim() } };
}

function readTypography(value, warnings) {
    const out = {};
    if (!value || typeof value !== 'object') return out;
    for (const key of TYPOGRAPHY_FONTS) {
        if (value[key] == null) continue;
        if (typeof value[key] === 'string' && FONT_RE.test(value[key])) out[key] = value[key];
        else warnings.push(`typography.${key} 不是合法的字体栈，已忽略`);
    }
    for (const key of TYPOGRAPHY_COLORS) {
        if (value[key] == null) continue;
        if (typeof value[key] === 'string' && COLOR_RE.test(value[key].trim())) out[key] = value[key].trim();
        else warnings.push(`typography.${key} 不是合法的颜色，已忽略`);
    }
    if (['left', 'center', 'right'].includes(value.nameAlign)) out.nameAlign = value.nameAlign;
    return out;
}

export function skinScopeAllows(id) {
    const attr = `[data-igs-dialog-skin="${id}"]`;
    return (selector) => (selector.startsWith('#igs-overlay') || selector.startsWith('.igs-dialog')) && selector.includes(attr);
}

// 返回 { ok, id, warnings }；ok:false 时 reason 说明原因，登记表不变。
export function registerDlcSkin(input) {
    const warnings = [];
    if (!input || typeof input !== 'object') return { ok: false, reason: 'invalid-skin', warnings: ['皮肤定义必须是对象'] };
    const id = String(input.id || '');
    if (!isDlcSkinId(id)) return { ok: false, reason: 'invalid-id', warnings: [`id「${id}」不合法：必须以 dlc- 开头，只用小写字母、数字和连字符，最长 44 个字符`] };
    const label = typeof input.label === 'string' ? input.label.trim().slice(0, 20) : '';
    if (!label) return { ok: false, reason: 'missing-label', warnings: ['label（显示名）不能为空'] };
    const frame = readFrame(input.frame, warnings);
    const base = DLC_SKIN_BASES.includes(input.base) ? input.base : (frame ? 'illustrated' : 'glass');
    if (input.base != null && !DLC_SKIN_BASES.includes(input.base)) warnings.push(`base「${input.base}」不认识，已按 ${base} 处理`);
    if (frame && base === 'glass') warnings.push('frame 只在 base: illustrated 时生效，已忽略');
    const accent = typeof input.accent === 'string' && COLOR_RE.test(input.accent.trim()) ? input.accent.trim() : '';
    if (input.accent != null && !accent) warnings.push('accent 不是合法的颜色，已忽略');
    const guarded = guardDlcCss(typeof input.css === 'string' ? input.css : '', { allow: skinScopeAllows(id), label: `皮肤 ${id}` });
    warnings.push(...guarded.warnings);
    const parts = [];
    if (frame && base === 'illustrated') parts.push(buildSlicedDialogSkinCss(id, frame, frame.assets));
    if (accent) parts.push(`#igs-overlay[data-igs-dialog-skin="${id}"]{--igs-dlc-accent:${accent};}`);
    if (guarded.css) parts.push(guarded.css);
    const def = Object.freeze({
        id,
        label,
        base,
        inherit: typeof input.inherit === 'string' ? input.inherit : '',
        worldviews: Object.freeze(Array.isArray(input.worldviews) ? input.worldviews.filter((w) => typeof w === 'string').slice(0, 12) : []),
        typography: Object.freeze(readTypography(input.typography, warnings)),
        accent,
        sfx: typeof input.sfx === 'string' ? input.sfx : '',
        hasFrame: Boolean(frame && base === 'illustrated'),
        cssText: parts.join('\n'),
    });
    const replaced = skins.has(id);
    skins.set(id, def);
    if (replaced) warnings.push(`皮肤 ${id} 已存在，已用新定义覆盖`);
    changed(id);
    return { ok: true, id, warnings };
}

export function unregisterDlcSkin(id) {
    if (!skins.delete(id)) return { ok: false, reason: 'not-found' };
    changed(id);
    return { ok: true, id };
}

// 周边样式（状态栏、战斗、标题卡、聊天配色、界面音效等）借哪套内置皮肤：作者写了 inherit 就用它，
// 否则插画类借「日间简约」、玻璃类借磨砂玻璃。不在内置表里的 inherit 由各张表自己的兜底接住。
export const DLC_DEFAULT_INHERIT = Object.freeze({ illustrated: 'day-minimal', glass: 'default' });
export function dlcBorrowSkin(id) {
    const def = getDlcSkin(id);
    if (!def) return isDlcSkinId(id) ? 'default' : id;
    return def.inherit && !isDlcSkinId(def.inherit) ? def.inherit : DLC_DEFAULT_INHERIT[def.base];
}

// 仅供测试：清空登记表。
export function resetDlcSkinsForTest() {
    skins.clear();
    changed('');
}
