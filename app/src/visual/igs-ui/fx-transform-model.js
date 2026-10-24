// 立绘变形层的纯逻辑：标签解析、取景换算、局部贴片落位。不碰 DOM，方便单测。
import { HEAD_ASPECT } from './fx-anchor.js';

const text = (value) => String(value == null ? '' : value).trim();
const lookup = (map, key) => {
    const k = text(key).toLowerCase();
    return Object.hasOwn(map, k) ? map[k] : '';
};

export const XF_REFLECT_KINDS = Object.freeze({ 车窗: 'window', 窗: 'window', 窗玻璃: 'window', window: 'window', 水面: 'water', 水中: 'water', 湖面: 'water', 池水: 'water', water: 'water' });
export const XF_SILHOUETTE_MODES = Object.freeze({ 玻璃: 'glass', 磨砂玻璃: 'glass', 磨砂: 'glass', 毛玻璃: 'glass', glass: 'glass', 逆光: 'back', 背光: 'back', 剪影: 'back', back: 'back' });
export const XF_FRAME_STYLES = Object.freeze({ 监控: 'monitor', 摄像头: 'monitor', 监视: 'monitor', monitor: 'monitor', 全息: 'holo', 投影: 'holo', holo: 'holo', 回忆: 'memory', 记忆: 'memory', 回想: 'memory', memory: 'memory' });
export const XF_WARP_STYLES = Object.freeze({ 故障: 'glitch', 乱码: 'glitch', glitch: 'glitch', 负片: 'negative', 反色: 'negative', negative: 'negative', 黑眼: 'blackeye', 黑瞳: 'blackeye', 压黑: 'blackeye', blackeye: 'blackeye', 错位: 'shift', 断裂: 'shift', shift: 'shift', 颤抖: 'tremble', 威压: 'tremble', 发抖: 'tremble', tremble: 'tremble' });
export const XF_ZOOM_REGIONS = Object.freeze({ 手: 'hand', 手指: 'hand', 指尖: 'hand', hand: 'hand', 唇: 'lip', 嘴唇: 'lip', 嘴: 'lip', lip: 'lip', 眼: 'eye', 眼睛: 'eye', 眼神: 'eye', eye: 'eye', 颈: 'neck', 脖颈: 'neck', 脖子: 'neck', 后颈: 'neck', neck: 'neck', 脸: 'face', 面庞: 'face', face: 'face', 腰: 'waist', waist: 'waist' });
export const XF_MARK_STYLES = Object.freeze({ 潮红: 'blush', 红晕: 'blush', 脸红: 'blush', blush: 'blush', 吻痕: 'kiss', 唇印: 'kiss', 红唇: 'kiss', kiss: 'kiss', 咬痕: 'bite', 牙印: 'bite', bite: 'bite', 契约: 'sigil', 契约纹: 'sigil', 印记: 'sigil', 咒印: 'sigil', sigil: 'sigil', 淤青: 'bruise', 瘀青: 'bruise', 淤痕: 'bruise', bruise: 'bruise' });
export const XF_MARK_PARTS = Object.freeze({ 脸颊: 'cheek', 脸: 'cheek', 面颊: 'cheek', cheek: 'cheek', 颈: 'neck', 脖颈: 'neck', 脖子: 'neck', neck: 'neck', 额: 'brow', 额头: 'brow', 眉心: 'brow', brow: 'brow', 唇: 'lip', 嘴角: 'lip', lip: 'lip', 眼角: 'eye', 眼: 'eye', eye: 'eye' });
const MARK_PART_DEFAULT = Object.freeze({ blush: 'cheek', kiss: 'neck', bite: 'neck', sigil: 'brow', bruise: 'cheek' });
const MARK_STYLE_DEFAULT = Object.freeze({ cheek: 'blush', neck: 'kiss', brow: 'sigil', lip: 'kiss', eye: 'blush' });

export const XF_KINDS = Object.freeze(['mirror', 'reflect', 'silhouette', 'frame', 'warp', 'zoom', 'mark', 'spirit']);

// 把字段按各自的词表归类，剩下的第一个当角色名：字段顺序写反或省略一项都能读对。
function classify(fields, maps) {
    const found = {};
    let who = '';
    for (const raw of fields) {
        const field = text(raw);
        if (!field) continue;
        let hit = false;
        for (const [name, map] of Object.entries(maps)) {
            const value = lookup(map, field);
            if (value && !found[name]) {
                found[name] = value;
                hit = true;
                break;
            }
        }
        if (!hit && !who) who = field;
    }
    return { who, ...found };
}

// 返回 fx-directives 统一的 args 数组：[type, ...固定顺序的字段]；缺必填返回 null。
export function parseTransformFx(type, fields) {
    const list = Array.isArray(fields) ? fields : [];
    switch (type) {
    case 'mirror': return ['mirror', text(list[0])];
    case 'spirit': return ['spirit', text(list[0])];
    case 'reflect': {
        const { who, kind } = classify(list, { kind: XF_REFLECT_KINDS });
        return ['reflect', kind || 'window', who];
    }
    case 'silhouette': {
        const { who, mode } = classify(list, { mode: XF_SILHOUETTE_MODES });
        return ['silhouette', who, mode || 'glass'];
    }
    case 'frame': {
        const { who, style } = classify(list, { style: XF_FRAME_STYLES });
        return ['frame', style || 'monitor', who];
    }
    case 'warp': {
        const { who, style } = classify(list, { style: XF_WARP_STYLES });
        return ['warp', who, style || 'glitch'];
    }
    case 'zoom': {
        const { who, region } = classify(list, { region: XF_ZOOM_REGIONS });
        return ['zoom', who, region || 'face'];
    }
    case 'mark': {
        const { who, style, part } = classify(list, { style: XF_MARK_STYLES, part: XF_MARK_PARTS });
        if (!style && !part) return null;
        const usePart = part || MARK_PART_DEFAULT[style];
        return ['mark', who, usePart, style || MARK_STYLE_DEFAULT[usePart]];
    }
    default: return null;
    }
}

export function transformFxOf(args) {
    const [type, a = '', b = '', c = ''] = args || [];
    switch (type) {
    case 'mirror': case 'spirit': return { type, who: a };
    case 'reflect': return { type, kind: a, who: b };
    case 'frame': return { type, style: a, who: b };
    case 'silhouette': return { type, who: a, mode: b };
    case 'warp': return { type, who: a, style: b };
    case 'zoom': return { type, who: a, region: b };
    case 'mark': return { type, who: a, part: b, style: c };
    default: return null;
    }
}

const round = (n) => Math.round(n * 100) / 100;

// 整身取景：整张立绘缩到放进宽 1、高 ratio 的取景框里，贴底居中。a 为原图高宽比。
export function fitCrop(a, ratio) {
    const aspect = Number(a) > 0 ? Number(a) : 1.6;
    const w = Math.min(1, ratio / aspect);
    return { size: round(w * 100), x: 50, y: 100 };
}

// 局部贴片落点（头宽、头高单位的偏移）。Q1：只按头部标定近似叠加，不处理衣领遮挡。
export const MARK_SPOTS = Object.freeze({
    cheek: Object.freeze([Object.freeze({ dx: -0.27, dy: 0.62 }), Object.freeze({ dx: 0.27, dy: 0.62 })]),
    neck: Object.freeze([Object.freeze({ dx: 0.12, dy: 1.08 })]),
    brow: Object.freeze([Object.freeze({ dx: 0, dy: 0.13 })]),
    lip: Object.freeze([Object.freeze({ dx: 0.04, dy: 0.84 })]),
    eye: Object.freeze([Object.freeze({ dx: 0.24, dy: 0.5 })]),
});

// anchor 为头部中心 { x, y, d }（舞台百分比），aspect 为舞台宽高比；返回各贴片中心（舞台百分比）。
export function markPlacement(part, anchor, aspect = 16 / 9) {
    const spots = Object.hasOwn(MARK_SPOTS, part) ? MARK_SPOTS[part] : MARK_SPOTS.cheek;
    const d = Number(anchor && anchor.d) || 14;
    const hh = d * HEAD_ASPECT * (aspect > 0 ? aspect : 16 / 9);
    const top = (Number(anchor && anchor.y) || 26) - hh / 2;
    return spots.map((s) => ({ x: round((Number(anchor && anchor.x) || 50) + s.dx * d), y: round(top + s.dy * hh) }));
}
