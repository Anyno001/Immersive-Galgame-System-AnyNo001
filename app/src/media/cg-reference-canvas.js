import { CG_PIXEL_CAP, clampPixelPair } from '../generated-images/illustration/cg-pixel-cap.js';

const fail = (reason) => ({ ok: false, reason, error: '角色位置或画布资料不足，原图保持不变' });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const validSize = (w, h) => [w, h].every((n) => Number.isSafeInteger(n) && n > 0) && w * h <= CG_PIXEL_CAP;
const MASK_GRID = 8;

// 规划坐标不是检测结果；默认中心、同位中心与多中心均不能自动分辨人物。
export function planReferenceCanvas(width, height, meta, characterKey, referenceImage, { legacyPortrait = false } = {}) {
    if (!validSize(width, height)) return fail('cg-size-invalid');
    const characters = meta?.characters;
    if (!Array.isArray(characters) || !characters.length || new Set(characters.map((c) => c.characterKey)).size !== characters.length) return fail('cg-binding-invalid');
    const target = characters.find((c) => c.characterKey === characterKey);
    if (!target) return fail('cg-binding-missing');
    let region = target.region;
    if (!region) {
        if (characters.some((c) => !c.positionExplicit || c.centers?.length !== 1)) return fail('cg-position-missing');
        const points = characters.map((c) => ({ key: c.characterKey, ...c.centers[0] }));
        if (points.some((p) => ![p.x, p.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))) return fail('cg-position-invalid');
        const center = points.find((p) => p.key === characterKey);
        if (points.some((p) => p.key !== characterKey && Math.abs(p.x - center.x) < 0.08)) return fail('cg-position-ambiguous');
        const left = points.filter((p) => p.x < center.x).sort((a, b) => b.x - a.x)[0];
        const right = points.filter((p) => p.x > center.x).sort((a, b) => a.x - b.x)[0];
        const x = left ? (left.x + center.x) / 2 : Math.max(0, center.x - 0.3);
        const end = right ? (right.x + center.x) / 2 : Math.min(1, center.x + 0.3);
        region = { x, y: Math.max(0, center.y - 0.45), width: end - x, height: Math.min(1, center.y + 0.45) - Math.max(0, center.y - 0.45) };
    }
    if (![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1 || region.y + region.height > 1) return fail('cg-region-invalid');
    const rect = { x: Math.floor(region.x * width), y: Math.floor(region.y * height), right: Math.ceil((region.x + region.width) * width), bottom: Math.ceil((region.y + region.height) * height) };
    const plan = finishPlan(width, height, rect);
    if (!plan.ok || referenceImage === undefined) return plan;
    try { return Object.freeze({ ...plan, referenceContent: referencePlacement(referenceImage, plan.reference, legacyPortrait) }); }
    catch { return fail('cg-reference-pixels-invalid'); }
}

function finishPlan(width, height, rect) {
    const margin = Math.ceil(Math.min(width, height) * 0.1);
    const crop = { x: Math.max(0, rect.x - margin), y: Math.max(0, rect.y - margin),
        right: Math.min(width, rect.right + margin), bottom: Math.min(height, rect.bottom + margin) };
    crop.width = crop.right - crop.x; crop.height = crop.bottom - crop.y;
    const size = clampPixelPair(Math.ceil(crop.width / 0.75), crop.height);
    const workWidth = Math.floor(size.width * 0.75);
    const scale = Math.min(workWidth / crop.width, size.height / crop.height);
    // RGB 使用同一比例；不足一格的尾部延续 crop 边缘，剩余留白不开放重绘。
    const work = { x: 0, y: 0, width: Math.ceil(crop.width * scale / MASK_GRID) * MASK_GRID,
        height: Math.ceil(crop.height * scale / MASK_GRID) * MASK_GRID };
    const reference = { x: workWidth, y: 0, width: size.width - workWidth, height: size.height };
    const uploadMask = { grid: MASK_GRID,
        x: Math.floor((rect.x - crop.x) * scale / MASK_GRID) * MASK_GRID,
        y: Math.floor((rect.y - crop.y) * scale / MASK_GRID) * MASK_GRID,
        right: Math.min(work.width, Math.ceil((rect.right - crop.x) * scale / MASK_GRID) * MASK_GRID),
        bottom: Math.min(work.height, Math.ceil((rect.bottom - crop.y) * scale / MASK_GRID) * MASK_GRID) };
    if (uploadMask.right <= uploadMask.x || uploadMask.bottom <= uploadMask.y) return fail('cg-region-invalid');
    return Object.freeze({ ok: true, width, height, scale,
        rect: Object.freeze(rect), crop: Object.freeze(crop), size: Object.freeze(size),
        work: Object.freeze(work), reference: Object.freeze(reference), uploadMask: Object.freeze(uploadMask) });
}

const validPixels = (image) => image && Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height)
    && image.width > 0 && image.height > 0 && image.width * image.height <= CG_PIXEL_CAP
    && image.data?.length === image.width * image.height * 4;
const sourcePoint = (plan, x, y) => ({
    x: clamp(Math.floor(plan.crop.x + (x + 0.5) / plan.scale), plan.crop.x, plan.crop.right - 1),
    y: clamp(Math.floor(plan.crop.y + (y + 0.5) / plan.scale), plan.crop.y, plan.crop.bottom - 1),
});
const workPoint = (plan, x, y) => ({
    x: clamp(Math.floor((x - plan.crop.x + 0.5) * plan.scale), 0, plan.work.width - 1),
    y: clamp(Math.floor((y - plan.crop.y + 0.5) * plan.scale), 0, plan.work.height - 1),
});
const inRect = (rect, x, y) => x >= rect.x && x < rect.right && y >= rect.y && y < rect.bottom;

// 连续构图坐标与 RGB 栅格使用同一比例；不是头脸识别。
export function referenceCanvasCenter(plan, point) {
    if (!plan?.ok || ![point?.x, point?.y].every(Number.isFinite)
        || !inRect(plan.crop, point.x * plan.width, point.y * plan.height)) return null;
    return { x: (point.x * plan.width - plan.crop.x) * plan.scale / plan.size.width,
        y: (point.y * plan.height - plan.crop.y) * plan.scale / plan.size.height };
}

// 仅回贴使用圆角与内侧混合带；输入蒙版独立采用硬边矩形。
function identityMaskWeight(plan, x, y) {
    const { rect } = plan;
    if (!inRect(rect, x, y)) return 0;
    const width = rect.right - rect.x, height = rect.bottom - rect.y;
    const side = Math.min(width, height);
    const radius = Math.min(32, side * 0.12);
    const feather = Math.max(1, Math.min(12, side * 0.02));
    const qx = Math.abs(x + 0.5 - (rect.x + rect.right) / 2) - (width / 2 - radius);
    const qy = Math.abs(y + 0.5 - (rect.y + rect.bottom) / 2) - (height / 2 - radius);
    const distance = radius - Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
        - Math.min(Math.max(qx, qy), 0) - 0.5;
    const t = clamp(distance / feather, 0, 1);
    return Math.round(255 * t * t * (3 - 2 * t));
}

export function buildReferencePixels(source, referenceImage, plan) {
    if (!plan?.ok || !validPixels(source) || source.width !== plan.width || source.height !== plan.height || !validPixels(referenceImage)) throw new Error('cg-pixels-invalid');
    const { size, work, reference } = plan;
    const data = new Uint8ClampedArray(size.width * size.height * 4);
    const mask = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
        data.set([224, 224, 224, 255], i); mask[i + 3] = 255;
    }
    // 工作区的取整留白延续 CG 边缘像素，不引入灰色矩形；延展部分保持黑色蒙版。
    for (let y = 0; y < size.height; y++) for (let x = 0; x < reference.x; x++) {
        const p = sourcePoint(plan, Math.min(x, work.width - 1), Math.min(y, work.height - 1));
        const from = (p.y * source.width + p.x) * 4;
        const to = (y * size.width + x) * 4;
        data.set(source.data.subarray(from, from + 4), to);
        const weight = inRect(plan.uploadMask, x, y) ? 255 : 0;
        mask.set([weight, weight, weight, 255], to);
    }
    drawIdentityReference(data, size.width, referenceImage, plan.referenceContent || referencePlacement(referenceImage, reference));
    return { image: { ...size, data }, mask: { ...size, data: mask } };
}

// 仅去除完全透明的外沿，保留所有非零 alpha 像素；旧头像标定不用于完整衣装参考。
function referencePlacement(image, box, legacyPortrait = false) {
    if (!validPixels(image)) throw new Error('cg-reference-pixels-invalid');
    let crop;
    if (legacyPortrait) crop = image.referenceCrop || { x: 0, y: 0, width: image.width, height: Math.max(1, Math.ceil(image.height * 0.4)) };
    else {
        let left = image.width, top = image.height, right = 0, bottom = 0;
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
            if (!image.data[(y * image.width + x) * 4 + 3]) continue;
            left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
        crop = { x: left, y: top, width: right - left, height: bottom - top };
    }
    if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > image.width || crop.y + crop.height > image.height) throw new Error('cg-reference-crop-invalid');
    const scale = Math.min(box.width / crop.width, box.height / crop.height);
    const width = Math.max(1, Math.floor(crop.width * scale)), height = Math.max(1, Math.floor(crop.height * scale));
    return Object.freeze({ crop: Object.freeze({ ...crop }), scale,
        x: box.x + Math.floor((box.width - width) / 2), y: box.y + Math.floor((box.height - height) / 2), width, height,
        sourceWidth: image.width, sourceHeight: image.height });
}

function drawIdentityReference(data, width, image, placement) {
    if (image.width !== placement.sourceWidth || image.height !== placement.sourceHeight) throw new Error('cg-reference-size-mismatch');
    const { crop, x: left, y: top, width: w, height: h } = placement;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sx = Math.floor(crop.x + (x + 0.5) * crop.width / w), sy = Math.floor(crop.y + (y + 0.5) * crop.height / h);
        const from = (sy * image.width + sx) * 4, to = ((top + y) * width + left + x) * 4;
        const a = image.data[from + 3] / 255;
        for (let k = 0; k < 3; k++) data[to + k] = Math.round(image.data[from + k] * a + data[to + k] * (1 - a));
        data[to + 3] = 255;
    }
}

// 只在原圆角支持区内窄带衔接；内区完整采用重绘图，不按生图强度再次叠加。
export function composeReferencePixels(source, generated, plan) {
    if (!plan?.ok || !validPixels(source) || !validPixels(generated) || source.width !== plan.width || source.height !== plan.height || generated.width !== plan.size.width || generated.height !== plan.size.height) throw new Error('cg-result-size-mismatch');
    const data = new Uint8ClampedArray(source.data);
    const { rect } = plan;
    for (let y = rect.y; y < rect.bottom; y++) for (let x = rect.x; x < rect.right; x++) {
        const { x: wx, y: wy } = workPoint(plan, x, y);
        const p = sourcePoint(plan, wx, wy);
        // 同时约束原像素和缩放后的采样点，防止量化把黑色边界带回 CG。
        const blend = Math.min(identityMaskWeight(plan, x, y),
            identityMaskWeight(plan, p.x, p.y)) / 255;
        if (!blend) continue;
        const from = (wy * generated.width + wx) * 4, to = (y * source.width + x) * 4;
        for (let k = 0; k < 3; k++) data[to + k] = Math.round(source.data[to + k] * (1 - blend) + generated.data[from + k] * blend);
    }
    return { width: source.width, height: source.height, data };
}
