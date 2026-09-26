// 地图视口纯函数：相机模型 screen = world * k + [tx, ty]（transform-origin 0 0）。
// 所有函数无副作用、不接触 DOM，坐标单位为世界像素（底图自然像素）与屏幕 CSS px。
export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 4;

// 无底图时的中性坐标平面尺寸（仅比例有意义，针按 0–1 坐标投影）。
export const MAP_FALLBACK_WORLD = Object.freeze({ width: 1600, height: 900 });

// 初始镜头：等比拟合底图到视口并居中；资料页地图默认使用 cover，保留 contain 供其他调用者兼容。
export function fitMapCamera(viewW, viewH, worldW, worldH, mode = 'contain') {
    if (!(viewW > 0) || !(viewH > 0) || !(worldW > 0) || !(worldH > 0)) return { k: 1, tx: 0, ty: 0 };
    const k = mode === 'cover' ? Math.max(viewW / worldW, viewH / worldH) : Math.min(viewW / worldW, viewH / worldH);
    return { k, tx: (viewW - worldW * k) / 2, ty: (viewH - worldH * k) / 2 };
}

// 缩放范围以拟合倍率 baseK 为 1×，允许 1–4×。
export function mapZoomBounds(baseK) {
    return { min: baseK * MAP_MIN_ZOOM, max: baseK * MAP_MAX_ZOOM };
}

// 围绕屏幕焦点 (fx, fy) 缩放：焦点对应的世界点在缩放前后保持不动。
export function zoomMapCamera(camera, factor, fx, fy, baseK) {
    const { min, max } = mapZoomBounds(baseK);
    const k2 = Math.min(max, Math.max(min, camera.k * factor));
    if (k2 === camera.k) return camera;
    const ratio = k2 / camera.k;
    return { k: k2, tx: fx - (fx - camera.tx) * ratio, ty: fy - (fy - camera.ty) * ratio };
}

export function panMapCamera(camera, dx, dy) {
    return { k: camera.k, tx: camera.tx + dx, ty: camera.ty + dy };
}

// 把世界点 (wx, wy) 移到视口中心；世界尺寸大于视口时夹紧边缘，避免露出底图外的空白。
export function centerMapCamera(camera, viewW, viewH, worldW, worldH, wx, wy) {
    if (!camera || !(viewW > 0) || !(viewH > 0)) return camera;
    const clamp = (value, span, view) => span <= view ? (view - span) / 2 : Math.min(0, Math.max(view - span, value));
    return {
        k: camera.k,
        tx: clamp(viewW / 2 - wx * camera.k, worldW * camera.k, viewW),
        ty: clamp(viewH / 2 - wy * camera.k, worldH * camera.k, viewH),
    };
}

export function mapWorldToScreen(camera, x, y) {
    return { x: x * camera.k + camera.tx, y: y * camera.k + camera.ty };
}

export function mapScreenToWorld(camera, sx, sy) {
    return { x: (sx - camera.tx) / camera.k, y: (sy - camera.ty) / camera.k };
}

// 0–1 归一化坐标 → 世界像素。禁止按外容器百分比摆放，必须以底图自然宽高为基准。
export function mapPinWorldPoint(x, y, worldW, worldH) {
    return { x: x * worldW, y: y * worldH };
}

// 表格未记录坐标的地点：在中心椭圆的黄金角候选点里，贪心选离已有针最远处（超过阈值后偏向中心），
// 结果只由输入顺序决定，重绘与刷新不会跳位。aspect 为世界宽高比，用于按屏幕距离而非归一化距离避让。
export function autoPlaceMapPoints(fixed, count, aspect = 16 / 9) {
    const total = Math.max(0, Math.floor(Number(count) || 0));
    if (!total) return [];
    const ratio = Number(aspect) > 0 ? Number(aspect) : 16 / 9;
    const candidateCount = Math.max(96, total * 12);
    const candidates = [];
    for (let index = 0; index < candidateCount; index += 1) {
        const radius = Math.sqrt((index + 0.5) / candidateCount);
        const angle = index * 2.399963229728653;
        candidates.push({ x: 0.5 + radius * 0.34 * Math.cos(angle), y: 0.5 + radius * 0.28 * Math.sin(angle), used: false });
    }
    const placed = (Array.isArray(fixed) ? fixed : []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    const distance = (a, b) => Math.hypot((a.x - b.x) * ratio, a.y - b.y);
    const out = [];
    for (let step = 0; step < total; step += 1) {
        let best = null;
        let bestScore = -Infinity;
        for (const candidate of candidates) {
            if (candidate.used) continue;
            const nearest = placed.length ? Math.min(...placed.map(point => distance(point, candidate))) : 1;
            const score = Math.min(nearest, 0.2) - Math.hypot(candidate.x - 0.5, candidate.y - 0.5) * 0.04;
            if (score > bestScore) { best = candidate; bestScore = score; }
        }
        if (!best) break;
        best.used = true;
        const point = { x: Math.round(best.x * 1000) / 1000, y: Math.round(best.y * 1000) / 1000 };
        placed.push(point);
        out.push(point);
    }
    return out;
}
