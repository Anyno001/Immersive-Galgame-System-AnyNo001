// 「只改脸部」表情差分的纯计算：裁切框、重绘遮罩、羽化回贴。不碰画布与网络。
export const FACE_WORK_SIDE = 1024;
export const FACE_MASK_GRID = 8;
export const FACE_FEATHER = 0.06;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function normalizeExpressionRoute(nai = {}) {
    const route = nai && nai.expressionRoute;
    if (route === 'full' || route === 'face' || route === 'director') return route;
    return nai && (nai.directorEmotion === true || nai.directorEmotion === 'true') ? 'director' : 'full';
}

export function normalizeFaceBox(box) {
    if (!box || typeof box !== 'object') return null;
    const v = ['cx', 'cy', 'rx', 'ry'].map((key) => Number(box[key]));
    if (!v.every(Number.isFinite) || v[2] <= 0 || v[3] <= 0) return null;
    return { cx: clamp(v[0], 0, 1), cy: clamp(v[1], 0, 1), rx: clamp(v[2], 0.005, 0.75), ry: clamp(v[3], 0.005, 0.75) };
}

// 以椭圆中心取正方形裁切，边长为椭圆较长半径的 3 倍；靠边时平移而不缩小。返回像素坐标。
export function planFaceCrop(width, height, box) {
    const b = normalizeFaceBox(box);
    if (!b || !(width > 0) || !(height > 0)) return null;
    const cx = b.cx * width, cy = b.cy * height, rx = b.rx * width, ry = b.ry * height;
    const side = Math.max(16, Math.min(Math.ceil(Math.max(rx, ry) * 2 * 1.5), width, height));
    const x = clamp(Math.round(cx - side / 2), 0, width - side);
    const y = clamp(Math.round(cy - side / 2), 0, height - side);
    return { x, y, side, work: FACE_WORK_SIDE, scale: FACE_WORK_SIDE / side,
        ellipse: { cx: cx - x, cy: cy - y, rx, ry } };
}

// 遮罩 RGBA（work×work）：椭圆外扩一格后按 8 像素网格取整，白为重绘。
export function buildFaceMask(plan) {
    const { work, scale, ellipse } = plan;
    const data = new Uint8ClampedArray(work * work * 4);
    const cx = ellipse.cx * scale, cy = ellipse.cy * scale;
    const rx = ellipse.rx * scale + FACE_MASK_GRID, ry = ellipse.ry * scale + FACE_MASK_GRID;
    for (let gy = 0; gy < work; gy += FACE_MASK_GRID) {
        for (let gx = 0; gx < work; gx += FACE_MASK_GRID) {
            const dx = (gx + FACE_MASK_GRID / 2 - cx) / rx, dy = (gy + FACE_MASK_GRID / 2 - cy) / ry;
            const v = dx * dx + dy * dy <= 1 ? 255 : 0;
            for (let y = gy; y < gy + FACE_MASK_GRID; y += 1) {
                for (let x = gx; x < gx + FACE_MASK_GRID; x += 1) {
                    const i = (y * work + x) * 4;
                    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
                }
            }
        }
    }
    return data;
}

// 羽化椭圆权重：椭圆外为 0，边缘内 6% 半径线性过渡到 1。
export function faceBlendWeight(ellipse, x, y) {
    const dx = (x + 0.5 - ellipse.cx) / ellipse.rx, dy = (y + 0.5 - ellipse.cy) / ellipse.ry;
    const d = Math.hypot(dx, dy);
    if (d >= 1) return 0;
    return d <= 1 - FACE_FEATHER ? 1 : (1 - d) / FACE_FEATHER;
}

// 把重绘结果（side×side RGBA）按羽化权重混入底图原像素；只改 RGB，透明度与椭圆外保持原样。原地修改并返回 base。
export function blendFaceInto(base, baseWidth, plan, painted) {
    const { x: x0, y: y0, side, ellipse } = plan;
    for (let y = 0; y < side; y += 1) {
        for (let x = 0; x < side; x += 1) {
            const w = faceBlendWeight(ellipse, x, y);
            if (w <= 0) continue;
            const o = ((y0 + y) * baseWidth + x0 + x) * 4, p = (y * side + x) * 4;
            for (let c = 0; c < 3; c += 1) base[o + c] = Math.round(base[o + c] * (1 - w) + painted[p + c] * w);
        }
    }
    return base;
}

// 无法探测时：图像上部居中的默认椭圆。
export function defaultFaceBox(width, height) {
    const rx = 0.14, ry = 0.14 * width / height;
    return { cx: 0.5, cy: Math.min(0.9, 0.16 + ry * 0.5), rx, ry: Math.min(0.4, ry * 1.1) };
}

// scanFaceFromAlpha 的 {x, eye, w} 换算成椭圆（相对宽高）。
export function faceBoxFromScan(scan, width, height) {
    if (!scan) return defaultFaceBox(width, height);
    const faceW = scan.w;
    return normalizeFaceBox({ cx: scan.x, cy: scan.eye + 0.25 * faceW * width / height,
        rx: 0.6 * faceW, ry: 0.75 * faceW * width / height });
}

export const FACE_PRESERVE_TAGS = 'same character, same hairstyle, same eye color, consistent lighting';
