// 遮罩修复编辑器的纯函数层：画笔写入 Alpha 遮罩、合成透明结果、指针坐标映射与有界历史。
// 不依赖 DOM；编辑始终写回原像素坐标。

export const BRUSH_MODES = Object.freeze(['keep', 'erase', 'soft']);

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));

// keep：从工作原图恢复（alpha→255）；erase：删除（alpha→0）；soft：按距离衰减地向 255 提升，适合半透明发丝。
export function applyBrushDab(alpha, width, height, cx, cy, { mode = 'keep', radius = 8, strength = 1 } = {}) {
    if (!BRUSH_MODES.includes(mode)) return alpha;
    const r = Math.max(0.5, Number(radius) || 0);
    const s = Math.max(0, Math.min(1, Number(strength)));
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
            const d = Math.hypot(x - cx, y - cy);
            if (d > r) continue;
            const p = y * width + x;
            if (mode === 'keep') alpha[p] = 255;
            else if (mode === 'erase') alpha[p] = 0;
            else {
                const falloff = 1 - d / r;
                alpha[p] = clampByte(alpha[p] + (255 - alpha[p]) * falloff * s);
            }
        }
    }
    return alpha;
}

// 两点之间按半径的一半取样，避免快速拖动时笔画断开。
export function applyBrushStroke(alpha, width, height, points, options = {}) {
    const list = Array.isArray(points) ? points : [];
    const step = Math.max(0.5, (Number(options.radius) || 8) / 2);
    for (let i = 0; i < list.length; i += 1) {
        const a = list[i];
        const b = list[i + 1];
        applyBrushDab(alpha, width, height, a.x, a.y, options);
        if (!b) continue;
        const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / step);
        for (let k = 1; k < n; k += 1) {
            applyBrushDab(alpha, width, height, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, options);
        }
    }
    return alpha;
}

// 用工作原图的 RGB + 遮罩 alpha 合成透明结果。
export function composeMattedPixels(sourceRgba, alpha) {
    const out = new Uint8ClampedArray(sourceRgba.length);
    for (let p = 0, i = 0; i < sourceRgba.length; p += 1, i += 4) {
        out[i] = sourceRgba[i];
        out[i + 1] = sourceRgba[i + 1];
        out[i + 2] = sourceRgba[i + 2];
        out[i + 3] = alpha[p];
    }
    return out;
}

// 从遮罩 PNG 像素（RGB 存 alpha）取回单通道 alpha。
export function readAlphaFromMaskPixels(maskRgba) {
    const out = new Uint8ClampedArray(maskRgba.length / 4);
    for (let p = 0; p < out.length; p += 1) out[p] = maskRgba[p * 4];
    return out;
}

// 显示尺寸与画布尺寸分离：把指针坐标映射回原像素坐标。
export function mapPointerToImage(clientX, clientY, rect, imageWidth, imageHeight) {
    if (!rect || !rect.width || !rect.height) return null;
    const x = ((clientX - rect.left) / rect.width) * imageWidth;
    const y = ((clientY - rect.top) / rect.height) * imageHeight;
    if (x < 0 || y < 0 || x > imageWidth || y > imageHeight) return null;
    return { x, y };
}

// 有界撤销/重做：只保存在编辑会话中，超出上限丢弃最旧快照。
export function createBoundedHistory(initial, limit = 20) {
    const max = Math.max(1, Math.floor(limit) || 1);
    const past = [];
    const future = [];
    let current = initial;
    return {
        get current() { return current; },
        push(next) {
            past.push(current);
            while (past.length > max) past.shift();
            future.length = 0;
            current = next;
        },
        undo() { if (past.length) { future.push(current); current = past.pop(); } return current; },
        redo() { if (future.length) { past.push(current); current = future.pop(); } return current; },
        canUndo: () => past.length > 0,
        canRedo: () => future.length > 0,
        size: () => past.length,
    };
}
