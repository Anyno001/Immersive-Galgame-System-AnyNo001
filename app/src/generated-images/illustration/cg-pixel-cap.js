// NAI 按总像素扣费：超过 1024×1024 就按大图计费。所有出图尺寸都必须 ≤ 这个数。
export const CG_SIZE_STEP = 64;
export const CG_PIXEL_CAP = 1024 * 1024;

export function parseCgSize(sizeText) {
    const match = String(sizeText || '').trim().match(/^(\d+)\s*[xX×*]\s*(\d+)$/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!(width > 0) || !(height > 0)) return null;
    return { width, height };
}

// 在像素上限内找最接近目标比例的 64 倍数尺寸。面积至少要到上限的 85%，避免为了分毫不差把图画得很小。
export function fitCgSize(aspect, cap) {
    const floor = cap * 0.85;
    let relaxed = null;
    let fitted = null;
    const consider = (best, width, height) => {
        const error = Math.abs(width / height - aspect) / aspect;
        if (!best || error < best.error - 1e-9 || (Math.abs(error - best.error) <= 1e-9 && width * height > best.area)) {
            return { width, height, error, area: width * height };
        }
        return best;
    };
    for (let width = CG_SIZE_STEP; width <= CG_PIXEL_CAP / CG_SIZE_STEP; width += CG_SIZE_STEP) {
        const ideal = width / aspect;
        const rounded = Math.max(CG_SIZE_STEP, Math.round(ideal / CG_SIZE_STEP) * CG_SIZE_STEP);
        for (const height of [rounded - CG_SIZE_STEP, rounded, rounded + CG_SIZE_STEP]) {
            if (height < CG_SIZE_STEP) continue;
            const area = width * height;
            if (area > cap) continue;
            relaxed = consider(relaxed, width, height);
            if (area >= floor) fitted = consider(fitted, width, height);
        }
    }
    const chosen = fitted || relaxed;
    if (!chosen || chosen.width * chosen.height > cap) return null;
    return chosen;
}

// 先对齐到 64 倍数。对齐之后如果超了上限，按原比例缩回上限内。
export function clampPixelPair(width, height) {
    const round64 = (value) => Math.max(CG_SIZE_STEP, Math.round(Number(value) / CG_SIZE_STEP) * CG_SIZE_STEP);
    const roundedWidth = round64(width);
    const roundedHeight = round64(height);
    if (!(roundedWidth > 0) || !(roundedHeight > 0)) return { width: 1024, height: 1024 };
    if (roundedWidth * roundedHeight <= CG_PIXEL_CAP) return { width: roundedWidth, height: roundedHeight };
    const fitted = fitCgSize(roundedWidth / roundedHeight, CG_PIXEL_CAP);
    return fitted ? { width: fitted.width, height: fitted.height } : { width: 1024, height: 1024 };
}

// 尺寸字符串超了上限时按比例缩回。认不出的字符串原样返回，交给调用方决定默认值。
export function clampToPixelCap(sizeText) {
    const parsed = parseCgSize(sizeText);
    if (!parsed) return sizeText;
    const capped = clampPixelPair(parsed.width, parsed.height);
    return `${capped.width}x${capped.height}`;
}
