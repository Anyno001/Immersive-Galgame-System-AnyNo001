// 弹幕防挡脸：横飞弹幕层用径向渐变遮罩在主播的脸上挖一个柔边椭圆洞，弹幕从脸前淡出而不是盖住脸。
// 这里只放纯函数：脸在哪（立绘 / 舞台立绘 / 默认 / 用户手调）、规范化、输出 CSS 变量；DOM 与手势在 danmaku-live.js。
import { HEAD_ASPECT } from './fx-anchor.js';

// 椭圆比脸部框稍大一点：宽高都乘 1.15。
export const FACE_PAD = 1.15;
// 没有脸部信息（CG、封面图、探测失败）时的默认位置：相对弹幕层的百分比。
export const DEFAULT_FACE = Object.freeze({ cx: 50, cy: 34, rx: 22, ry: 15 });
const PORTRAIT_HEIGHT = 0.86;

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

// 手调的防挡脸区域：四个值都有才算，否则当作没调过（null）。
export function normalizeFaceBox(value) {
    if (!value || typeof value !== 'object') return null;
    const { cx, cy, rx, ry } = value;
    if ([cx, cy, rx, ry].some((n) => n === null || n === undefined || n === '' || !Number.isFinite(Number(n)))) return null;
    return {
        cx: round1(Math.min(100, Math.max(0, Number(cx)))),
        cy: round1(Math.min(100, Math.max(0, Number(cy)))),
        rx: round1(Math.min(60, Math.max(4, Number(rx)))),
        ry: round1(Math.min(60, Math.max(4, Number(ry)))),
    };
}

function fromHead(cx, cy, d, w, h) {
    return normalizeFaceBox({
        cx: cx / w * 100,
        cy: cy / h * 100,
        rx: d / 2 * FACE_PAD / w * 100,
        ry: d * HEAD_ASPECT / 2 * FACE_PAD / h * 100,
    });
}

// 脸的椭圆（相对弹幕层的百分比）。优先级：手调 > 立绘脸部定位 > 默认。
// input：{ w, h } 弹幕层像素尺寸；manual 手调值；
// source 'portrait'：手机里的立绘，需要 portrait {x,y,zoom}（直播取景）、natural {w,h}、head {x,top,w}；
// source 'stage'：全屏时舞台上的立绘，需要 rect {left,top,w,h}（立绘在舞台上的绘制框）与 head。
export function liveFaceBox(input = {}) {
    const manual = normalizeFaceBox(input.manual);
    if (manual) return { ...manual, source: 'manual' };
    const w = num(input.w, 0);
    const h = num(input.h, 0);
    const head = input.head;
    const headOk = head && Number.isFinite(Number(head.x)) && Number.isFinite(Number(head.top)) && Number(head.w) > 0;
    if (w > 0 && h > 0 && headOk) {
        if (input.source === 'portrait' && input.natural && input.natural.w > 0 && input.natural.h > 0) {
            const frame = input.portrait || {};
            const imgH = h * PORTRAIT_HEIGHT * num(frame.zoom, 100) / 100;
            const imgW = imgH * input.natural.w / input.natural.h;
            const bottom = h * (1 + num(frame.y, 0) / 100);
            const centerX = w * (0.5 + num(frame.x, 0) / 100);
            const d = Number(head.w) * imgW;
            const box = fromHead(centerX + (Number(head.x) - 0.5) * imgW, bottom - imgH + Number(head.top) * imgH + d * HEAD_ASPECT / 2, d, w, h);
            if (box) return { ...box, source: 'portrait' };
        }
        if (input.source === 'stage' && input.rect && input.rect.w > 0 && input.rect.h > 0) {
            const d = Number(head.w) * input.rect.w;
            const box = fromHead(input.rect.left + Number(head.x) * input.rect.w, input.rect.top + Number(head.top) * input.rect.h + d * HEAD_ASPECT / 2, d, w, h);
            if (box) return { ...box, source: 'stage' };
        }
    }
    return { ...DEFAULT_FACE, source: 'default' };
}

// 写进样式的变量：单位全是百分比，遮罩渐变直接用。
export function faceVars(box) {
    return {
        '--igs-face-x': `${box.cx}%`,
        '--igs-face-y': `${box.cy}%`,
        '--igs-face-rx': `${box.rx}%`,
        '--igs-face-ry': `${box.ry}%`,
    };
}

// 手调拖动：椭圆整体平移（dx / dy 为层宽高的百分比），中心限制在层内。
export function moveFaceBox(box, dx, dy) {
    return normalizeFaceBox({ ...box, cx: box.cx + dx, cy: box.cy + dy });
}

// 角上手柄缩放：手柄在椭圆右下 45 度那一点，拖到哪里半径就按那一点反推（不小于 4%）。
export function resizeFaceBox(box, px, py) {
    return normalizeFaceBox({ ...box, rx: Math.abs(px - box.cx) / Math.SQRT1_2, ry: Math.abs(py - box.cy) / Math.SQRT1_2 });
}
