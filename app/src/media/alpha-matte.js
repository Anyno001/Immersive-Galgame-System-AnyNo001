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

// ---- PNG 文本块保留：canvas 重编码会丢掉 NAI 写入的 tEXt/iTXt/zTXt（Comment 里有正负提示词与参数），
// 裁边后把原图的文本块原样拷回输出 PNG 的 IHDR 之后。块自带 CRC，原样拷贝即有效。
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_TEXT_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt']);

function isPngBytes(bytes) {
    return Boolean(bytes) && bytes.length >= 33 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function readUint32(bytes, pos) {
    return ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
}

function chunkTypeAt(bytes, pos) {
    return String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
}

export function extractPngTextChunks(bytes) {
    if (!isPngBytes(bytes)) return [];
    const chunks = [];
    let pos = 8;
    while (pos + 12 <= bytes.length) {
        const end = pos + 12 + readUint32(bytes, pos);
        if (end > bytes.length) break;
        const type = chunkTypeAt(bytes, pos);
        if (PNG_TEXT_CHUNKS.has(type)) chunks.push(bytes.subarray(pos, end));
        if (type === 'IEND') break;
        pos = end;
    }
    return chunks;
}

export function injectPngChunks(bytes, chunks) {
    if (!isPngBytes(bytes) || !chunks || !chunks.length || chunkTypeAt(bytes, 8) !== 'IHDR') return bytes;
    const insertAt = 8 + 12 + readUint32(bytes, 8);
    const extra = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(bytes.length + extra);
    out.set(bytes.subarray(0, insertAt), 0);
    let pos = insertAt;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    out.set(bytes.subarray(insertAt), pos);
    return out;
}

function pngDataUrlToBytes(dataUrl, decode) {
    const text = String(dataUrl || '');
    const m = /^data:image\/png;base64,/i.exec(text);
    if (!m) return null;
    const bin = decode(text.slice(m[0].length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function bytesToPngDataUrl(bytes, encode) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:image/png;base64,${encode(bin)}`;
}

// 源图有文本块、输出没有时拷贝过去；任何异常都返回原输出，不影响显示。
export function preservePngTextChunks(sourceDataUrl, outputDataUrl, globalObject = globalThis) {
    try {
        const pick = (name) => (globalObject && typeof globalObject[name] === 'function' ? globalObject[name].bind(globalObject) : null)
            || (typeof globalThis[name] === 'function' ? globalThis[name].bind(globalThis) : null);
        const decode = pick('atob');
        const encode = pick('btoa');
        if (!decode || !encode) return outputDataUrl;
        const chunks = extractPngTextChunks(pngDataUrlToBytes(sourceDataUrl, decode));
        if (!chunks.length) return outputDataUrl;
        const output = pngDataUrlToBytes(outputDataUrl, decode);
        if (!output || extractPngTextChunks(output).length) return outputDataUrl;
        return bytesToPngDataUrl(injectPngChunks(output, chunks), encode);
    } catch (error) {
        return outputDataUrl;
    }
}

// 单通道语义的 Alpha 遮罩像素：RGB 取原 alpha、自身不透明；与透明结果同尺寸。
export function buildAlphaMaskPixels(sourceData) {
    const out = new Uint8ClampedArray(sourceData.length);
    for (let i = 0; i < sourceData.length; i += 4) {
        const a = sourceData[i + 3];
        out[i] = a; out[i + 1] = a; out[i + 2] = a; out[i + 3] = 255;
    }
    return out;
}

function buildAlphaMaskDataUrl(doc, ctx, width, height) {
    try {
        const src = ctx.getImageData(0, 0, width, height);
        const mask = doc.createElement('canvas');
        mask.width = width;
        mask.height = height;
        const mctx = mask.getContext('2d');
        const img = mctx.createImageData(width, height);
        img.data.set(buildAlphaMaskPixels(src.data));
        mctx.putImageData(img, 0, 0);
        return mask.toDataURL('image/png');
    } catch (error) {
        return '';
    }
}

// 返回 async (dataUrl, { alreadyTransparent, detailed }) => dataUrl；detailed 为 true 时返回
// { dataUrl, alphaMaskDataUrl, diagnostics }。无 canvas 或处理失败时 fail-open 返回原图、遮罩为空。
// 裁边重编码后保留原图 PNG 文本块（NAI 元数据）。
export function createAlphaMatte(globalObject = globalThis) {
    const doc = globalObject && globalObject.document;
    const canUseCanvas = Boolean(doc && typeof doc.createElement === 'function' && typeof globalObject.Image === 'function');
    const passthrough = (dataUrl, reason) => ({ dataUrl, alphaMaskDataUrl: '', diagnostics: { fallback: reason } });
    async function matteWithMask(dataUrl, alreadyTransparent) {
        if (!canUseCanvas || !/^data:image\//i.test(String(dataUrl || ''))) return passthrough(dataUrl, 'no-canvas');
        try {
            const img = await loadImage(globalObject, dataUrl);
            const canvas = doc.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx || !canvas.width || !canvas.height) return passthrough(dataUrl, 'no-context');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (!alreadyTransparent) {
                matteSolidBackground(imageData);
                ctx.putImageData(imageData, 0, 0);
            }
            const bounds = findOpaqueBounds(imageData);
            if (!bounds) return passthrough(dataUrl, 'empty-alpha');
            const out = doc.createElement('canvas');
            out.width = bounds.width;
            out.height = bounds.height;
            const outCtx = out.getContext('2d', { willReadFrequently: true });
            outCtx.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
            return {
                dataUrl: preservePngTextChunks(dataUrl, out.toDataURL('image/png'), globalObject),
                alphaMaskDataUrl: buildAlphaMaskDataUrl(doc, outCtx, bounds.width, bounds.height),
                diagnostics: { sourceWidth: canvas.width, sourceHeight: canvas.height, crop: bounds, alreadyTransparent },
            };
        } catch (error) {
            return passthrough(dataUrl, 'error');
        }
    }
    return async function applyAlphaMatte(dataUrl, { alreadyTransparent = false, detailed = false } = {}) {
        const result = await matteWithMask(dataUrl, alreadyTransparent);
        return detailed ? result : result.dataUrl;
    };
}
