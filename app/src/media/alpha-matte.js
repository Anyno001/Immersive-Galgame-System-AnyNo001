import { decodeImage } from './image-decode.js';
// 纯色底立绘抠图：从图像四边洪泛，只抠与边缘连通、颜色接近底色的像素，
// 封闭空洞仅在极接近底色、平整且达到面积下限时才抠，角色内部的白衣服与高光保留。
const HARD_TOLERANCE = 28;
const SOFT_SPAN = 44;
const HOLE_TOLERANCE = 12;
const HOLE_MAX_CHANNEL_STD = 3;
const HOLE_MAX_MEAN_DIST = 10;
const HOLE_MIN_AREA_RATIO = 0.0002;
const HOLE_MIN_AREA = 64;
const FRINGE_RINGS = 3;
const MIN_ALPHA = 0.1;
const FG_MIN_DIST = 60;

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
    const total = width * height;
    // 底色噪点大时适度放宽硬阈值，上限 38，避免吃掉浅色皮肤/浅发。
    const hist = new Uint32Array(256);
    let borderCount = 0;
    const tally = (x, y) => { hist[Math.min(255, Math.round(colorDistance(data, (y * width + x) * 4, bg)))] += 1; borderCount += 1; };
    for (let x = 0; x < width; x += 1) { tally(x, 0); tally(x, height - 1); }
    for (let y = 1; y < height - 1; y += 1) { tally(0, y); tally(width - 1, y); }
    let acc = 0;
    let p95 = 0;
    while (p95 < 255 && acc + hist[p95] < borderCount * 0.95) { acc += hist[p95]; p95 += 1; }
    const hard = Math.max(HARD_TOLERANCE, Math.min(38, Math.round(p95 * 1.5 + 6)));

    // state: 0 未处理，1 已抠，2 空洞候选已访问，3 过渡带已处理
    const state = new Uint8Array(total);
    const buf = new Int32Array(total);
    let top = 0;
    const seed = (x, y) => {
        const p = y * width + x;
        if (!state[p] && colorDistance(data, p * 4, bg) <= hard) { state[p] = 1; buf[top++] = p; }
    };
    for (let x = 0; x < width; x += 1) { seed(x, 0); seed(x, height - 1); }
    for (let y = 0; y < height; y += 1) { seed(0, y); seed(width - 1, y); }
    while (top) {
        const p = buf[--top];
        data[p * 4 + 3] = 0;
        const x = p % width;
        const y = (p - x) / width;
        if (x > 0) seed(x - 1, y);
        if (x < width - 1) seed(x + 1, y);
        if (y > 0) seed(x, y - 1);
        if (y < height - 1) seed(x, y + 1);
    }

    // 封闭空洞（叉腰、发丝间）：须极接近底色、平整且有一定面积；白衣服的灰色褶皱会使方差超标而保留。
    const minArea = Math.max(HOLE_MIN_AREA, Math.round(total * HOLE_MIN_AREA_RATIO));
    const comp = new Int32Array(total);
    for (let s = 0; s < total; s += 1) {
        if (state[s] || colorDistance(data, s * 4, bg) > HOLE_TOLERANCE) continue;
        let n = 0;
        let top2 = 0;
        let sd = 0;
        const sum = [0, 0, 0];
        const sq = [0, 0, 0];
        state[s] = 2;
        buf[top2++] = s;
        while (top2) {
            const p = buf[--top2];
            comp[n++] = p;
            const i = p * 4;
            sd += colorDistance(data, i, bg);
            for (let k = 0; k < 3; k += 1) { const v = data[i + k]; sum[k] += v; sq[k] += v * v; }
            const x = p % width;
            const push = (q) => {
                if (!state[q] && colorDistance(data, q * 4, bg) <= HOLE_TOLERANCE) { state[q] = 2; buf[top2++] = q; }
            };
            if (x > 0) push(p - 1);
            if (x < width - 1) push(p + 1);
            if (p >= width) push(p - width);
            if (p < total - width) push(p + width);
        }
        if (n < minArea || sd / n > HOLE_MAX_MEAN_DIST) continue;
        let flat = true;
        for (let k = 0; k < 3; k += 1) {
            const mean = sum[k] / n;
            if (Math.sqrt(Math.max(0, sq[k] / n - mean * mean)) > HOLE_MAX_CHANNEL_STD) { flat = false; break; }
        }
        if (!flat) continue;
        for (let j = 0; j < n; j += 1) { state[comp[j]] = 1; data[comp[j] * 4 + 3] = 0; }
    }

    // 过渡带：离已抠区域 3px 内的像素，用邻近实心像素估计前景色，按「混合色在底色→前景色连线上的位置」求 alpha 并去溢色；
    // 深色人物与白底的半透明过渡离底色很远，只看与底色的距离会漏掉。前景估不出或本身接近底色时退回按距离估。
    let frontier = new Int32Array(total);
    let next = new Int32Array(total);
    const cand = new Int32Array(total);
    let cn = 0;
    let fn = 0;
    for (let p = 0; p < total; p += 1) if (state[p] === 1) frontier[fn++] = p;
    for (let ring = 0; ring < FRINGE_RINGS && fn; ring += 1) {
        let nn = 0;
        const visit = (q) => {
            if (state[q] !== 0 && state[q] !== 2) return;
            state[q] = 3;
            cand[cn++] = q;
            next[nn++] = q;
        };
        for (let j = 0; j < fn; j += 1) {
            const p = frontier[j];
            const x = p % width;
            if (x > 0) visit(p - 1);
            if (x < width - 1) visit(p + 1);
            if (p >= width) visit(p - width);
            if (p < total - width) visit(p + width);
        }
        const t = frontier; frontier = next; next = t; fn = nn;
    }
    const R = 3;
    const fg = [0, 0, 0];
    const alphas = new Float32Array(cn);
    for (let j = 0; j < cn; j += 1) {
        const q = cand[j];
        const i = q * 4;
        const x = q % width;
        const y = (q - x) / width;
        let cnt = 0;
        fg[0] = 0; fg[1] = 0; fg[2] = 0;
        for (let yy = Math.max(0, y - R); yy <= Math.min(height - 1, y + R); yy += 1) {
            for (let xx = Math.max(0, x - R); xx <= Math.min(width - 1, x + R); xx += 1) {
                const r = yy * width + xx;
                if (state[r] !== 0) continue;
                const k = r * 4;
                fg[0] += data[k]; fg[1] += data[k + 1]; fg[2] += data[k + 2]; cnt += 1;
            }
        }
        let a = -1;
        if (cnt) {
            const dr = fg[0] / cnt - bg[0];
            const dg = fg[1] / cnt - bg[1];
            const db = fg[2] / cnt - bg[2];
            const len2 = dr * dr + dg * dg + db * db;
            if (len2 > FG_MIN_DIST * FG_MIN_DIST) {
                a = ((data[i] - bg[0]) * dr + (data[i + 1] - bg[1]) * dg + (data[i + 2] - bg[2]) * db) / len2;
            }
        }
        if (a < 0) a = (colorDistance(data, i, bg) - hard) / SOFT_SPAN;
        alphas[j] = Math.max(0, Math.min(1, a));
    }
    for (let j = 0; j < cn; j += 1) {
        const i = cand[j] * 4;
        const a = alphas[j];
        if (a >= 0.98) continue;
        if (a < MIN_ALPHA) { data[i + 3] = 0; continue; }
        for (let k = 0; k < 3; k += 1) {
            data[i + k] = Math.max(0, Math.min(255, Math.round((data[i + k] - bg[k] * (1 - a)) / a)));
        }
        data[i + 3] = Math.round(255 * a);
    }
    return imageData;
}

// 出图方不一定照计划给纯色底：智绘姬 / 柏宝绘接 NAI V5 时常直接回透明底，调用方的 alreadyTransparent 只是预期。
// 四边大半已经透明就当已抠好、只裁边；否则洪泛会把透明像素的 RGB（多为黑色）当底色，连深色描线和黑发一起抠掉。
export function hasTransparentBorder(imageData, alphaThreshold = 8) {
    const { data, width, height } = imageData;
    const step = Math.max(1, Math.floor(Math.min(width, height) / 32));
    let total = 0;
    let clear = 0;
    const check = (x, y) => {
        total += 1;
        if (data[(y * width + x) * 4 + 3] <= alphaThreshold) clear += 1;
    };
    for (let x = 0; x < width; x += step) { check(x, 0); check(x, height - 1); }
    for (let y = 0; y < height; y += step) { check(0, y); check(width - 1, y); }
    return total > 0 && clear * 2 >= total;
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
            const img = await decodeImage(globalObject, dataUrl);
            if (!img) return passthrough(dataUrl, 'image-load-failed');
            const canvas = doc.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx || !canvas.width || !canvas.height) return passthrough(dataUrl, 'no-context');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const detectedTransparent = !alreadyTransparent && hasTransparentBorder(imageData);
            if (!alreadyTransparent && !detectedTransparent) {
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
                diagnostics: { sourceWidth: canvas.width, sourceHeight: canvas.height, crop: bounds, alreadyTransparent, detectedTransparent },
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
