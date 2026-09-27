import fs from 'node:fs';
import path from 'node:path';

// 开发工具：生成 src/styles/ui-ripple-art.js（不进 bundle）。用法：node scripts/ripple-art.mjs
// 水纹流光：对平滑噪声场取等值线（互不相交，天然是一圈圈水纹），再把每条线描成
// 变宽笔触带——两端尖收、按节奏鼓起、被低频遮罩截成长短不一的段落。
// 纯矢量、确定性（同一预设永远生成同一张图）；运行时只读预生成结果，避免移动端加载时现算卡顿。
const W = 1600;
const H = 1000;
const CELL = 8;

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function gradientNoise(seed) {
    const random = rng(seed);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const angles = perm.map(() => random() * Math.PI * 2);
    const grad = (ix, iy) => angles[perm[(perm[ix & 255] + iy) & 255]];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    return (x, y) => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const dot = (ix, iy) => {
            const a = grad(ix, iy);
            return Math.cos(a) * (x - ix) + Math.sin(a) * (y - iy);
        };
        const u = fade(x - x0);
        const v = fade(y - y0);
        const top = dot(x0, y0) + u * (dot(x0 + 1, y0) - dot(x0, y0));
        const bottom = dot(x0, y0 + 1) + u * (dot(x0 + 1, y0 + 1) - dot(x0, y0 + 1));
        return top + v * (bottom - top);
    };
}

function contours(field, level) {
    const cols = Math.ceil(W / CELL) + 1;
    const rows = Math.ceil(H / CELL) + 1;
    const values = new Float64Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) values[j * cols + i] = field(i * CELL, j * CELL) - level;
    const value = (i, j) => values[j * cols + i];
    const points = new Map();
    const edgePoint = (i, j, horizontal) => {
        const key = `${i},${j},${horizontal ? 'h' : 'v'}`;
        if (!points.has(key)) {
            const a = value(i, j);
            const b = horizontal ? value(i + 1, j) : value(i, j + 1);
            const t = a / (a - b);
            points.set(key, horizontal ? [(i + t) * CELL, j * CELL] : [i * CELL, (j + t) * CELL]);
        }
        return key;
    };
    const links = new Map();
    const link = (a, b) => {
        if (!links.has(a)) links.set(a, []);
        if (!links.has(b)) links.set(b, []);
        links.get(a).push(b);
        links.get(b).push(a);
    };
    for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
            const tl = value(i, j) > 0;
            const tr = value(i + 1, j) > 0;
            const br = value(i + 1, j + 1) > 0;
            const bl = value(i, j + 1) > 0;
            const edges = [];
            if (tl !== tr) edges.push(edgePoint(i, j, true));
            if (tr !== br) edges.push(edgePoint(i + 1, j, false));
            if (bl !== br) edges.push(edgePoint(i, j + 1, true));
            if (tl !== bl) edges.push(edgePoint(i, j, false));
            if (edges.length === 2) link(edges[0], edges[1]);
            else if (edges.length === 4) { link(edges[0], edges[1]); link(edges[2], edges[3]); }
        }
    }
    const seen = new Set();
    const lines = [];
    const walk = (start) => {
        const chain = [start];
        seen.add(start);
        let current = start;
        for (;;) {
            const next = (links.get(current) || []).find(key => !seen.has(key));
            if (!next) break;
            seen.add(next);
            chain.push(next);
            current = next;
        }
        return chain;
    };
    for (const [key, neighbours] of links) if (!seen.has(key) && neighbours.length === 1) lines.push(walk(key));
    for (const key of links.keys()) if (!seen.has(key)) lines.push(walk(key));
    return lines.map(chain => chain.map(key => points.get(key)));
}

function resample(line, step) {
    const out = [line[0]];
    let carry = 0;
    for (let k = 1; k < line.length; k++) {
        const [ax, ay] = line[k - 1];
        const [bx, by] = line[k];
        const length = Math.hypot(bx - ax, by - ay);
        let d = step - carry;
        while (d <= length) {
            out.push([ax + (bx - ax) * d / length, ay + (by - ay) * d / length]);
            d += step;
        }
        carry = length - (d - step);
    }
    return out;
}

function smooth(line, passes) {
    let current = line;
    for (let p = 0; p < passes; p++) {
        current = current.map((point, k) => {
            if (k === 0 || k === current.length - 1) return point;
            const [px, py] = current[k - 1];
            const [nx, ny] = current[k + 1];
            return [(px + point[0] * 2 + nx) / 4, (py + point[1] * 2 + ny) / 4];
        });
    }
    return current;
}

function ribbon(points, widths) {
    const left = [];
    const right = [];
    for (let k = 0; k < points.length; k++) {
        const [px, py] = points[Math.max(0, k - 1)];
        const [nx, ny] = points[Math.min(points.length - 1, k + 1)];
        const dx = nx - px;
        const dy = ny - py;
        const length = Math.hypot(dx, dy) || 1;
        const half = widths[k] / 2;
        const ox = -dy / length * half;
        const oy = dx / length * half;
        left.push(`${(points[k][0] + ox).toFixed(1)} ${(points[k][1] + oy).toFixed(1)}`);
        right.push(`${(points[k][0] - ox).toFixed(1)} ${(points[k][1] - oy).toFixed(1)}`);
    }
    const all = left.concat(right.reverse()).map(pair => pair.split(' ').map(Number));
    let d = `M${all[0][0].toFixed(1)} ${all[0][1].toFixed(1)}l`;
    for (let k = 1; k < all.length; k++) d += `${k > 1 ? ' ' : ''}${+(all[k][0] - all[k - 1][0]).toFixed(1)} ${+(all[k][1] - all[k - 1][1]).toFixed(1)}`;
    return `${d}z`;
}

export function buildRippleSvg(preset) {
    const {
        seed, scale, levels, field: shape = 'flow', center = [0.5, 0.5], ringScale = 180,
        wMin, wMax, period, sharp, maskScale, gap, minRun = 60, opacityRange = [0.5, 1],
    } = preset;
    const noise = gradientNoise(seed);
    const mask = gradientNoise(seed + 101);
    const random = rng(seed + 7);
    const flow = (x, y) => noise(x / scale, y / scale) + 0.45 * noise(x / scale * 2.1 + 17, y / scale * 2.1 + 5);
    const field = shape === 'rings'
        ? (x, y) => Math.hypot(x - center[0] * W, (y - center[1] * H) * 1.25) / ringScale + 0.9 * flow(x, y)
        : flow;
    const paths = [];
    for (const level of levels) {
        for (const raw of contours(field, level)) {
            if (raw.length < 6) continue;
            const line = resample(smooth(resample(raw, 4), 3), 7);
            let run = [];
            const flush = () => {
                if (run.length * 7 >= minRun) paths.push(stroke(run));
                run = [];
            };
            for (const point of line) {
                if (mask(point[0] / maskScale, point[1] / maskScale) > gap) run.push(point);
                else flush();
            }
            flush();
        }
    }
    function stroke(points) {
        const total = (points.length - 1) * 7;
        const phase = random() * Math.PI * 2;
        const localPeriod = period * (0.7 + random() * 0.6);
        const taper = Math.min(48, total / 3);
        const widths = points.map((_, k) => {
            const s = k * 7;
            const pulse = Math.pow(Math.max(0, Math.sin(Math.PI * 2 * s / localPeriod + phase)), sharp);
            const ends = Math.min(1, s / taper, (total - s) / taper);
            return (wMin + (wMax - wMin) * pulse) * Math.sin(Math.max(0, ends) * Math.PI / 2);
        });
        const alpha = opacityRange[0] + (opacityRange[1] - opacityRange[0]) * random();
        return `<path fill-opacity="${alpha.toFixed(2)}" d="${ribbon(points, widths)}"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><g fill="#fff">${paths.join('')}</g></svg>`;
}

export function rippleImage(preset) {
    return `url("data:image/svg+xml,${encodeURIComponent(buildRippleSvg(preset))}")`;
}

// 每个界面一种节奏：设置「静」、日记「呼吸」、背包「短促」、关系「涟漪」。
export const IGS_RIPPLE_PRESETS = Object.freeze({
    settings: { seed: 3, scale: 520, levels: [-0.12, 0.2], wMin: 0.3, wMax: 3.4, period: 900, sharp: 5, maskScale: 420, gap: -0.02, minRun: 120 },
    diary: { seed: 21, scale: 460, levels: [-0.22, 0.02, 0.26], wMin: 0.35, wMax: 5.6, period: 560, sharp: 2.4, maskScale: 380, gap: 0.02, minRun: 100 },
    inventory: { seed: 42, scale: 300, levels: [-0.18, 0.14], wMin: 0.3, wMax: 4.2, period: 150, sharp: 7, maskScale: 260, gap: 0.06, minRun: 50 },
    relationships: { seed: 8, scale: 420, field: 'rings', center: [0.3, 0.5], ringScale: 170, levels: [1.2, 1.9, 2.6, 3.3, 4.0], wMin: 0.3, wMax: 6.2, period: 420, sharp: 4, maskScale: 300, gap: -0.04, minRun: 80 },
});


const out = path.resolve(import.meta.dirname, '..', 'src', 'styles', 'ui-ripple-art.js');
const entries = Object.entries(IGS_RIPPLE_PRESETS).map(([name, preset]) => `    ${name}: ${JSON.stringify(rippleImage(preset))},`);
fs.writeFileSync(out, `// 由 scripts/ripple-art.mjs 生成，勿手改；调节奏改脚本里的预设后重新生成。\nexport const IGS_RIPPLE_ART = Object.freeze({\n${entries.join('\n')}\n});\n`);
console.log('ripple art written', `${(fs.statSync(out).size / 1024).toFixed(1)}KB`);
