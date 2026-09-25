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
