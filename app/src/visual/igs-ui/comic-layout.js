import { FALLBACK_HEAD, HEAD_ASPECT, spriteDrawRect } from './fx-anchor.js';

// 漫画对话泡的摆位（纯函数，舞台像素坐标）。

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 说话人头部框：{ cx, top, w, h }；没有立绘几何时返回 null（画外音）。
export function resolveHeadBox(stageW, stageH, sprite) {
    const rect = spriteDrawRect(stageW, stageH, sprite);
    if (!rect) return null;
    const head = sprite.head || FALLBACK_HEAD;
    const w = clamp(rect.w * head.w, Math.min(stageW, stageH) * 0.06, Math.min(stageW, stageH) * 0.6);
    return { cx: rect.left + rect.w * head.x, top: rect.top + rect.h * head.top, w, h: w * HEAD_ASPECT };
}

// 几个泡连成一串：竖排读序从右往左，后一个泡在前一个左侧、略低，彼此咬合一点。
// 放不下（窄屏）时改成上下排列。sizes 为各泡外接半宽半高 { ax, by }。返回相对坐标的泡心与整串外框。
export function arrangeChain(sizes, maxWidth, mode = 'auto') {
    const centers = [];
    let x = 0;
    let y = 0;
    sizes.forEach((s, i) => {
        if (i > 0) {
            const prev = sizes[i - 1];
            x -= (prev.ax + s.ax) * 0.9;
            y += Math.min(prev.by, s.by) * 0.42;
        }
        centers.push([x, y]);
    });
    let box = bounds(centers, sizes);
    if (sizes.length > 1 && (mode === 'column' || (mode === 'auto' && box.w > maxWidth))) {
        centers.length = 0;
        x = 0;
        y = 0;
        sizes.forEach((s, i) => {
            if (i > 0) {
                const prev = sizes[i - 1];
                y += (prev.by + s.by) * 0.9;
                x -= Math.min(prev.ax, s.ax) * 0.3;
            }
            centers.push([x, y]);
        });
        box = bounds(centers, sizes);
    }
    return { centers: centers.map(([cx, cy]) => [cx - box.x, cy - box.y]), w: box.w, h: box.h };
}

function bounds(centers, sizes) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    centers.forEach(([cx, cy], i) => {
        x0 = Math.min(x0, cx - sizes[i].ax);
        x1 = Math.max(x1, cx + sizes[i].ax);
        y0 = Math.min(y0, cy - sizes[i].by);
        y1 = Math.max(y1, cy + sizes[i].by);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function overlapArea(a, b) {
    if (!a || !b) return 0;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
}

// 整串泡的落点。kind：speech / thought / narration / system / offscreen。
// safe 为可用区域 { left, top, right, bottom }；avoid 为要躲开的矩形（工具栏、状态栏、上一句的残影、输入框）。
// chains 为同一串泡的几种排法（横排一串 / 上下错落），连同落点一起比较，挑不挡脸、离嘴近的那种。
export function placeComicGroup({ chains, chain, ...rest }) {
    let best = null;
    for (const option of chains || [chain]) {
        const placed = placeChain({ ...rest, chain: option });
        if (!best || placed.score < best.score) best = placed;
    }
    return best;
}

function placeChain({ stageW, stageH, safe, head, kind, chain, avoid = [], offSide = 'right', gap: gapLevel = 0.55 }) {
    const W = chain.w;
    const H = chain.h;
    const minSide = Math.min(stageW, stageH);
    const fit = (x, y) => {
        const x0 = W > safe.right - safe.left ? (safe.left + safe.right - W) / 2 : clamp(x, safe.left, safe.right - W);
        const y0 = H > safe.bottom - safe.top ? safe.top : clamp(y, safe.top, safe.bottom - H);
        return { x: x0, y: y0, shift: Math.hypot(x0 - x, y0 - y) };
    };
    const candidates = [];
    if (kind === 'narration' || kind === 'system') {
        // 旁白框靠画格上角：竖排读序从右起，先试右上，再试左上、正上。离画格边留一点白，不贴线。
        const inset = clamp(minSide * 0.025, 8, 22);
        candidates.push({ ...fit(safe.right - inset - W, safe.top + inset), pref: 0 });
        candidates.push({ ...fit(safe.left + inset, safe.top + inset), pref: 0.6 });
        candidates.push({ ...fit((stageW - W) / 2, safe.top + inset), pref: 0.9 });
        // 顶边被工具栏、邀请条这类横条占住时，退到它们下面。
        const below = Math.max(safe.top, ...avoid.filter((r) => !r.weight && r.y < safe.top + H * 0.5).map((r) => r.y + r.h));
        if (below > safe.top) {
            candidates.push({ ...fit(safe.right - inset - W, below + inset), pref: 0.3 });
            candidates.push({ ...fit(safe.left + inset, below + inset), pref: 0.7 });
        }
    } else if (!head || kind === 'offscreen') {
        // 画外音：泡贴画面一侧，尾巴伸出画外。
        const right = offSide !== 'left';
        candidates.push({ ...fit(right ? safe.right - W : safe.left, safe.top + stageH * 0.06), pref: 0 });
        candidates.push({ ...fit(right ? safe.right - W : safe.left, safe.top + stageH * 0.22), pref: 0.5 });
        candidates.push({ ...fit(right ? safe.left : safe.right - W, safe.top + stageH * 0.06), pref: 0.7 });
        candidates.push({ ...fit(right ? safe.right - W : safe.left, safe.top + stageH * 0.4), pref: 0.8 });
    } else {
        const toward = head.cx < stageW / 2 ? 1 : -1;
        const gap = head.w * gapLevel;
        const sideX = (dir) => (dir > 0 ? head.cx + gap : head.cx - gap - W);
        const levelY = head.top - H * 0.28;
        candidates.push({ ...fit(sideX(toward), levelY), pref: 0 });
        candidates.push({ ...fit(sideX(toward), head.top - H * 0.82), pref: 0.25 });
        candidates.push({ ...fit(sideX(-toward), levelY), pref: 0.45 });
        candidates.push({ ...fit(head.cx - W / 2, head.top - head.w * gapLevel * 0.4 - H), pref: 0.35 });
        candidates.push({ ...fit(sideX(toward), head.top + head.h * 0.3), pref: 0.4 });
        candidates.push({ ...fit(sideX(-toward), head.top - H * 0.82), pref: 0.55 });
        // 窄屏两侧放不下：挪到下巴以下，压住身体但不挡脸。
        const chin = head.top + head.h * 1.08 + head.w * gapLevel * 0.3;
        candidates.push({ ...fit(head.cx - W / 2, chin), pref: 1.4 });
        candidates.push({ ...fit(sideX(toward), chin), pref: 1.2 });
    }
    const headRect = head ? { x: head.cx - head.w * 0.6, y: head.top - head.h * 0.05, w: head.w * 1.2, h: head.h * 1.15 } : null;
    const mouth = head ? [head.cx, head.top + head.h * 0.8] : null;
    let best = null;
    for (const c of candidates) {
        const rect = { x: c.x, y: c.y, w: W, h: H };
        let score = c.pref + c.shift / minSide * 1.5;
        if (headRect) score += overlapArea(rect, headRect) / (headRect.w * headRect.h) * 14;
        for (const ob of avoid) score += overlapArea(rect, ob) / Math.max(1, Math.min(W * H, ob.w * ob.h)) * (ob.weight || 2.5);
        if (mouth) {
            const nx = clamp(mouth[0], rect.x, rect.x + W);
            const ny = clamp(mouth[1], rect.y, rect.y + H);
            score += Math.hypot(nx - mouth[0], ny - mouth[1]) / minSide;
        }
        if (!best || score < best.score) best = { ...c, score };
    }
    const centers = chain.centers.map(([cx, cy]) => [best.x + cx, best.y + cy]);
    return { x: best.x, y: best.y, w: W, h: H, centers, score: best.score, chain };
}

// 尾巴尖：普通对白指向嘴边、留一点空隙不碰脸；心里话飘向头顶侧上方；画外音伸出画框。
// 返回 { index, tip } 或 null（嘴被泡盖住时不画尾巴）。
export function resolveTail({ kind, head, centers, sizes, stageW, offSide = 'right' }) {
    if (kind === 'narration' || kind === 'system' || !centers.length) return null;
    if (!head || kind === 'offscreen') {
        const right = offSide !== 'left';
        let index = 0;
        centers.forEach(([cx], i) => { if (right ? cx > centers[index][0] : cx < centers[index][0]) index = i; });
        const [cx, cy] = centers[index];
        return { index, tip: [right ? stageW + 24 : -24, cy + sizes[index].by * 0.55] };
    }
    const target = kind === 'thought'
        ? [head.cx + (centers[0][0] > head.cx ? 1 : -1) * head.w * 0.35, head.top + head.h * 0.05]
        : [head.cx, head.top + head.h * 0.8];
    let index = 0;
    let bestD = Infinity;
    centers.forEach(([cx, cy], i) => {
        const d = Math.hypot(cx - target[0], cy - target[1]);
        if (d < bestD) { bestD = d; index = i; }
    });
    const [cx, cy] = centers[index];
    const s = sizes[index];
    // 目标在泡里面（泡盖住了嘴）就不画尾巴。
    if (((target[0] - cx) / s.ax) ** 2 + ((target[1] - cy) / s.by) ** 2 <= 1) return null;
    const gap = head.w * (kind === 'thought' ? 0.1 : 0.22);
    const dx = cx - target[0];
    const dy = cy - target[1];
    const d = Math.hypot(dx, dy) || 1;
    let tip = [target[0] + dx / d * gap, target[1] + dy / d * gap];
    // 尾巴不宜太长：最长约泡半径的 1.6 倍。
    const edge = 1 / Math.sqrt((dx / d / s.ax) ** 2 + (dy / d / s.by) ** 2);
    const maxLen = Math.min(s.ax, s.by) * 1.6;
    const len = Math.hypot(tip[0] - cx, tip[1] - cy) - edge;
    if (len > maxLen) {
        const keep = edge + maxLen;
        tip = [cx - dx / d * keep, cy - dy / d * keep];
    }
    return { index, tip };
}
