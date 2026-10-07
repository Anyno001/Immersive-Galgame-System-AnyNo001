// 漫画对话泡的外形（纯函数，输出 SVG path 字符串）。
// 画法：每个部件（泡体、尾巴、思考小圆）各自一条闭合路径；先整体描粗墨线、再整体填纸色，
// 后填的纸色盖住部件之间的内侧墨线，只留外轮廓——泡体与尾巴、连着的几个泡自然融成一个形状。

export function makeRand(seed) {
    let a = (Number(seed) >>> 0) || 0x9e3779b9;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashSeed(text) {
    let h = 2166136261;
    const src = String(text == null ? '' : text);
    for (let i = 0; i < src.length; i += 1) {
        h ^= src.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

const r1 = (v) => Math.round(v * 10) / 10;

// 超椭圆上的点：指数 n 越大越接近圆角矩形；n=2 为椭圆。
export function superPoint(cx, cy, a, b, n, t) {
    const c = Math.cos(t);
    const s = Math.sin(t);
    const e = 2 / n;
    return [cx + a * Math.sign(c) * Math.abs(c) ** e, cy + b * Math.sign(s) * Math.abs(s) ** e];
}

// 包住一组点（文字块各列的首尾角点）所需的最小超椭圆半轴，宽高比按 aspect 给定。
export function fitSuperellipse(points, cx, cy, aspect, n) {
    let scale = 0;
    for (const [x, y] of points) {
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy) / aspect;
        const v = (dx ** n + dy ** n) ** (1 / n);
        if (v > scale) scale = v;
    }
    return { a: scale, b: scale * aspect };
}

// 闭合平滑曲线：Catmull-Rom 转三次贝塞尔。
export function smoothClosedPath(points) {
    const n = points.length;
    if (n < 3) return '';
    let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
    for (let i = 0; i < n; i += 1) {
        const p0 = points[(i - 1 + n) % n];
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        const p3 = points[(i + 2) % n];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return `${d}Z`;
}

function polygonPath(points) {
    return `M${points.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;
}

function perimeter(a, b) {
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

// 泡体：kind 决定轮廓。所有尺寸都是像素；rand 给手绘的细微起伏，同一种子每次画出一样的形状。
export function bodyPath(kind, { cx, cy, a, b, n = 2.4 }, rand) {
    const per = perimeter(a, b);
    if (kind === 'box' || kind === 'narration' || kind === 'system') {
        const r = kind === 'narration' ? 1.5 : Math.min(a, b) * 0.14;
        const x0 = cx - a;
        const y0 = cy - b;
        const x1 = cx + a;
        const y1 = cy + b;
        return `M${r1(x0 + r)} ${r1(y0)}H${r1(x1 - r)}Q${r1(x1)} ${r1(y0)} ${r1(x1)} ${r1(y0 + r)}V${r1(y1 - r)}Q${r1(x1)} ${r1(y1)} ${r1(x1 - r)} ${r1(y1)}H${r1(x0 + r)}Q${r1(x0)} ${r1(y1)} ${r1(x0)} ${r1(y1 - r)}V${r1(y0 + r)}Q${r1(x0)} ${r1(y0)} ${r1(x0 + r)} ${r1(y0)}Z`;
    }
    if (kind === 'shout') {
        // 爆炸框：尖刺长短交错，尖角不圆滑。
        const spikes = Math.max(14, Math.round(per / 34));
        const pts = [];
        for (let i = 0; i < spikes * 2; i += 1) {
            const t = (i / (spikes * 2)) * Math.PI * 2 + (rand() - 0.5) * 0.05;
            const outer = i % 2 === 0;
            const k = outer ? 1.14 + rand() * 0.24 : 0.94 + rand() * 0.04;
            const [x, y] = superPoint(cx, cy, a * k, b * k, 2.2, t);
            pts.push([x, y]);
        }
        return polygonPath(pts);
    }
    if (kind === 'thought') {
        // 云框：沿椭圆排一圈向外鼓的圆弧。
        const bumps = Math.max(9, Math.round(per / 46));
        const pts = [];
        for (let i = 0; i < bumps; i += 1) {
            const t = (i / bumps) * Math.PI * 2 + (rand() - 0.5) * 0.12;
            pts.push(superPoint(cx, cy, a * 0.97, b * 0.97, 2.1, t));
        }
        let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
        for (let i = 0; i < bumps; i += 1) {
            const p = pts[i];
            const q = pts[(i + 1) % bumps];
            const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
            const r = chord * (0.56 + rand() * 0.12);
            d += `A${r1(r)} ${r1(r)} 0 0 1 ${r1(q[0])} ${r1(q[1])}`;
        }
        return `${d}Z`;
    }
    if (kind === 'cute') {
        // 花边软泡：一圈浅浅的波浪边。
        const waves = Math.max(10, Math.round(per / 30));
        const pts = [];
        const steps = waves * 6;
        for (let i = 0; i < steps; i += 1) {
            const t = (i / steps) * Math.PI * 2;
            const k = 1 + 0.035 * Math.abs(Math.sin((t * waves) / 2));
            pts.push(superPoint(cx, cy, a * k, b * k, 2.3, t));
        }
        return smoothClosedPath(pts);
    }
    if (kind === 'fear') {
        // 颤抖框：细密的抖动边。
        const steps = Math.max(48, Math.round(per / 7));
        const pts = [];
        for (let i = 0; i < steps; i += 1) {
            const t = (i / steps) * Math.PI * 2;
            const k = 1 + (rand() - 0.5) * 0.045;
            pts.push(superPoint(cx, cy, a * k, b * k, n, t));
        }
        return polygonPath(pts);
    }
    // 普通对白、小声、阴沉、电话：平滑的超椭圆，带极轻的手绘起伏。
    const steps = 40;
    const pts = [];
    for (let i = 0; i < steps; i += 1) {
        const t = (i / steps) * Math.PI * 2;
        const k = 1 + (rand() - 0.5) * 0.012;
        pts.push(superPoint(cx, cy, a * k, b * k, n, t));
    }
    return smoothClosedPath(pts);
}

// 尾巴：根部埋在泡体里（被纸色盖住接缝），尖端指向说话人嘴边、但不碰到脸。
export function tailPath(kind, body, tip, rand) {
    const { cx, cy, a, b } = body;
    const dx = tip[0] - cx;
    const dy = tip[1] - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const px = -uy;
    const py = ux;
    const rad = Math.min(a, b);
    const baseW = Math.max(10, rad * (kind === 'shout' ? 0.42 : 0.3));
    // 根部取在泡体内 0.6 处，保证与泡体重叠。
    const edge = 1 / Math.sqrt((ux / a) ** 2 + (uy / b) ** 2);
    const bx = cx + ux * edge * 0.6;
    const by = cy + uy * edge * 0.6;
    const left = [bx + px * baseW / 2, by + py * baseW / 2];
    const right = [bx - px * baseW / 2, by - py * baseW / 2];
    if (kind === 'shout') {
        // 喊叫的尾巴是一道折线闪电。
        const mid1 = [left[0] + (tip[0] - left[0]) * 0.45 + px * baseW * 0.5, left[1] + (tip[1] - left[1]) * 0.45 + py * baseW * 0.5];
        const mid2 = [right[0] + (tip[0] - right[0]) * 0.6 - px * baseW * 0.1, right[1] + (tip[1] - right[1]) * 0.6 - py * baseW * 0.1];
        return polygonPath([left, mid1, tip, mid2, right]);
    }
    if (kind === 'phone') {
        // 电话、广播：锯齿电波尾。
        const segs = 4;
        const pts = [left];
        for (let i = 1; i < segs; i += 1) {
            const t = i / segs;
            const side = i % 2 === 0 ? 1 : -1;
            const w = baseW * (1 - t) * 0.5;
            pts.push([bx + (tip[0] - bx) * t + px * (w + side * baseW * 0.35), by + (tip[1] - by) * t + py * (w + side * baseW * 0.35)]);
        }
        pts.push(tip);
        for (let i = segs - 1; i >= 1; i -= 1) {
            const t = i / segs;
            const side = i % 2 === 0 ? 1 : -1;
            const w = baseW * (1 - t) * 0.5;
            pts.push([bx + (tip[0] - bx) * t - px * (w - side * baseW * 0.35), by + (tip[1] - by) * t - py * (w - side * baseW * 0.35)]);
        }
        pts.push(right);
        return polygonPath(pts);
    }
    // 普通尾巴：两条略弯的边，向一侧轻轻甩出。
    const bend = (rand() > 0.5 ? 1 : -1) * baseW * 0.35;
    const c1 = [left[0] + (tip[0] - left[0]) * 0.55 + px * bend, left[1] + (tip[1] - left[1]) * 0.55 + py * bend];
    const c2 = [right[0] + (tip[0] - right[0]) * 0.5 + px * bend, right[1] + (tip[1] - right[1]) * 0.5 + py * bend];
    return `M${r1(left[0])} ${r1(left[1])}Q${r1(c1[0])} ${r1(c1[1])} ${r1(tip[0])} ${r1(tip[1])}Q${r1(c2[0])} ${r1(c2[1])} ${r1(right[0])} ${r1(right[1])}Z`;
}

// 心里话的尾巴：一串由大到小的小圆，从泡边飘向说话人头顶。
export function thoughtTrail(body, tip) {
    const { cx, cy, a, b } = body;
    const dx = tip[0] - cx;
    const dy = tip[1] - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const reach = 1 / Math.sqrt((ux / a) ** 2 + (uy / b) ** 2);
    const edge = [cx + ux * reach * 1.06, cy + uy * reach * 1.06];
    const span = Math.max(0, Math.hypot(tip[0] - edge[0], tip[1] - edge[1]));
    const base = Math.max(5, Math.min(a, b) * 0.12);
    const circles = [];
    [0.18, 0.52, 0.82].forEach((t, i) => {
        const r = base * (1 - i * 0.28);
        circles.push(`M${r1(edge[0] + ux * span * t - r)} ${r1(edge[1] + uy * span * t)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(r * 2)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-r * 2)} 0Z`);
    });
    return circles;
}

// 文字块各列的角点（顶端对齐）：right 为文字块右边，pitch 为列距，lens 为各列像素长度。
export function columnCorners({ left, top, width, pitch, lens, charW }) {
    const pts = [];
    const right = left + width;
    lens.forEach((len, i) => {
        const xR = right - i * pitch;
        const xL = xR - charW;
        pts.push([xR, top], [xL, top], [xR, top + len], [xL, top + len]);
    });
    return pts;
}
