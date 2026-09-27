// 纯色底立绘抠图：从图像四边洪泛，只抠与边缘连通、颜色接近底色的像素，
// 角色内部的白色（衬衫、高光）不与边缘连通，不会被误抠。
const HARD_TOLERANCE = 28;
const SOFT_TOLERANCE = 72;

function colorDistance(data, i, bg) {
    const dr = data[i] - bg[0];
    const dg = data[i + 1] - bg[1];
    const db = data[i + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleBorderColor(data, width, height) {
    const samples = [];
    const push = (x, y) => {
        const i = (y * width + x) * 4;
        samples.push([data[i], data[i + 1], data[i + 2]]);
    };
    const step = Math.max(1, Math.floor(Math.min(width, height) / 32));
    for (let x = 0; x < width; x += step) { push(x, 0); push(x, height - 1); }
    for (let y = 0; y < height; y += step) { push(0, y); push(width - 1, y); }
    const median = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    return [median(0), median(1), median(2)];
}

export function matteSolidBackground(imageData) {
    const { data, width, height } = imageData;
    const bg = sampleBorderColor(data, width, height);
    const visited = new Uint8Array(width * height);
    const stack = [];
    const seed = (x, y) => {
        const p = y * width + x;
        if (!visited[p] && colorDistance(data, p * 4, bg) <= HARD_TOLERANCE) { visited[p] = 1; stack.push(p); }
    };
    for (let x = 0; x < width; x += 1) { seed(x, 0); seed(x, height - 1); }
    for (let y = 0; y < height; y += 1) { seed(0, y); seed(width - 1, y); }
    while (stack.length) {
        const p = stack.pop();
        data[p * 4 + 3] = 0;
        const x = p % width;
        const y = (p - x) / width;
        if (x > 0) seed(x - 1, y);
        if (x < width - 1) seed(x + 1, y);
        if (y > 0) seed(x, y - 1);
        if (y < height - 1) seed(x, y + 1);
    }
    // 边缘羽化：紧邻已抠区域、颜色介于硬/软阈值之间的像素按距离给半透明，消除白边。
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const p = y * width + x;
            if (visited[p]) continue;
            const touches = (x > 0 && visited[p - 1]) || (x < width - 1 && visited[p + 1])
                || (y > 0 && visited[p - width]) || (y < height - 1 && visited[p + width]);
            if (!touches) continue;
            const d = colorDistance(data, p * 4, bg);
            if (d >= SOFT_TOLERANCE) continue;
            const alpha = Math.max(0.05, (d - HARD_TOLERANCE) / (SOFT_TOLERANCE - HARD_TOLERANCE));
            // 去溢色：把混进边缘的底色按 alpha 反推出去，避免灰边。
            for (let k = 0; k < 3; k += 1) {
                const i = p * 4 + k;
                data[i] = Math.max(0, Math.min(255, Math.round((data[i] - bg[k] * (1 - alpha)) / alpha)));
            }
            data[p * 4 + 3] = Math.round(255 * alpha);
        }
    }
    return imageData;
}

export function findOpaqueBounds(imageData, alphaThreshold = 8) {
    const { data, width, height } = imageData;
    let top = height; let left = width; let right = -1; let bottom = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] <= alphaThreshold) continue;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
        }
    }
    if (right < 0) return null;
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function loadImage(globalObject, src) {
    return new Promise((resolve, reject) => {
        const img = new globalObject.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image-load-failed'));
        img.src = src;
    });
}

// 返回 async (dataUrl, { alreadyTransparent }) => dataUrl；环境没有 canvas 时原样返回。
export function createAlphaMatte(globalObject = globalThis) {
    const doc = globalObject && globalObject.document;
    const canUseCanvas = Boolean(doc && typeof doc.createElement === 'function' && typeof globalObject.Image === 'function');
    return async function applyAlphaMatte(dataUrl, { alreadyTransparent = false } = {}) {
        if (!canUseCanvas || !/^data:image\//i.test(String(dataUrl || ''))) return dataUrl;
        try {
            const img = await loadImage(globalObject, dataUrl);
            const canvas = doc.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx || !canvas.width || !canvas.height) return dataUrl;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (!alreadyTransparent) {
                matteSolidBackground(imageData);
                ctx.putImageData(imageData, 0, 0);
            }
            const bounds = findOpaqueBounds(imageData);
            if (!bounds) return dataUrl;
            const out = doc.createElement('canvas');
            out.width = bounds.width;
            out.height = bounds.height;
            out.getContext('2d').drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
            return out.toDataURL('image/png');
        } catch (error) {
            return dataUrl;
        }
    };
}
