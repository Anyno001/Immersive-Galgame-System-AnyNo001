// 漫画符号定位：按立绘在舞台里的实际绘制矩形（background-size 宽度百分比 + background-position）
// 与立绘透明通道探测出的头部位置换算落点，电脑/窄屏/全屏/内嵌各模式统一按真实像素计算。
const HEAD_CACHE_LIMIT = 48;
const PROBE_W = 48;
const ALPHA_MIN = 40;
const PROBE_TIMEOUT_MS = 160;
const FALLBACK_HEAD = Object.freeze({ x: 0.5, top: 0.04, w: 0.3 });

// 头部单位偏移：dx 以头宽、dy 以头高为单位，原点在头顶中心。
export const SYMBOL_OFFSETS = Object.freeze({
    anger: { dx: 0.45, dy: 0.15, size: 0.4 },
    sweat: { dx: 0.56, dy: 0.4, size: 0.32 },
    heart: { dx: 0.5, dy: 0, size: 0.4 },
    surprise: { dx: 0.25, dy: -0.28, size: 0.42 },
    silence: { dx: 0.7, dy: -0.05, size: 0.4 },
    gloom: { dx: 0, dy: 0.4, size: 0.8 },
    sparkle: { dx: 0.62, dy: 0.32, size: 0.38 },
});

const headCache = new Map();
const pending = new Map();

function finite(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
    return max < min ? (min + max) / 2 : Math.max(min, Math.min(max, value));
}

// 纯函数：返回符号中心点（舞台像素）与符号边长；没有立绘时落在舞台右上方。
export function resolveSymbolPlacement(kind, geo) {
    const stageW = finite(geo && geo.stageW, 0);
    const stageH = finite(geo && geo.stageH, 0);
    if (!(stageW > 0) || !(stageH > 0)) return null;
    const offset = SYMBOL_OFFSETS[kind] || SYMBOL_OFFSETS.anger;
    const floor = clamp(finite(geo.dialogTop, stageH), stageH * 0.3, stageH);
    const minSide = Math.min(stageW, stageH);
    const sprite = geo.sprite;
    let headX = stageW * 0.62;
    let headTop = stageH * 0.1;
    let headW = minSide * 0.22;
    if (sprite && sprite.naturalW > 0 && sprite.naturalH > 0) {
        const imgW = stageW * finite(sprite.scale, 100) / 100;
        const imgH = imgW * sprite.naturalH / sprite.naturalW;
        const left = (stageW - imgW) * finite(sprite.posX, 50) / 100;
        const top = (stageH - imgH) * finite(sprite.posY, 100) / 100;
        const head = sprite.head || FALLBACK_HEAD;
        headX = left + imgW * head.x;
        headTop = top + imgH * head.top;
        headW = imgW * head.w;
    }
    headW = clamp(headW, minSide * 0.08, minSide * 0.6);
    const headH = headW * 1.1;
    const size = clamp(headW * offset.size, 22, Math.max(22, minSide * 0.16));
    const flip = headX > stageW * 0.72 && offset.dx > 0;
    const pad = size * 0.55 + 4;
    const x = clamp(headX + (flip ? -offset.dx : offset.dx) * headW, pad, stageW - pad);
    const y = clamp(headTop + offset.dy * headH, pad, floor - pad);
    return { x: Math.round(x), y: Math.round(y), size: Math.round(size), flip };
}

// 在缩略画布里找第一行不透明像素作为头顶，取头顶下方一段的不透明列范围作为头宽与头部中心。
export function scanHeadFromAlpha(data, width, height) {
    let top = -1;
    for (let y = 0; y < height && top < 0; y += 1) {
        let count = 0;
        for (let x = 0; x < width; x += 1) if (data[(y * width + x) * 4 + 3] > ALPHA_MIN) count += 1;
        if (count >= 2) top = y;
    }
    if (top < 0) return null;
    const band = Math.max(2, Math.round(width * 0.22));
    let minX = width;
    let maxX = -1;
    for (let y = top; y < Math.min(height, top + band); y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] <= ALPHA_MIN) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
    }
    if (maxX < minX) return null;
    const w = (maxX - minX + 1) / width;
    // 整幅不透明（背景未抠）时探测无意义，回落默认头位。
    if (top === 0 && w > 0.95) return null;
    return { x: (minX + maxX + 1) / 2 / width, top: top / height, w: clamp(w, 0.08, 0.6) };
}

function remember(url, info) {
    headCache.delete(url);
    headCache.set(url, info);
    while (headCache.size > HEAD_CACHE_LIMIT) headCache.delete(headCache.keys().next().value);
    return info;
}

export function peekSpriteHead(url) {
    return url ? headCache.get(url) || null : null;
}

function readAlpha(img, doc) {
    const canvas = doc.createElement('canvas');
    const w = PROBE_W;
    const h = Math.max(1, Math.round(PROBE_W * img.naturalHeight / img.naturalWidth));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return scanHeadFromAlpha(ctx.getImageData(0, 0, w, h).data, w, h);
}

function loadImage(url, doc, cors) {
    return new Promise((resolve) => {
        const ImageCtor = doc.defaultView && doc.defaultView.Image;
        if (typeof ImageCtor !== 'function') return resolve(null);
        const img = new ImageCtor();
        if (cors) img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

function isCrossOrigin(url, doc) {
    try {
        const base = doc.defaultView && doc.defaultView.location ? doc.defaultView.location.href : undefined;
        const parsed = new URL(url, base);
        return /^https?:$/.test(parsed.protocol) && Boolean(base) && parsed.origin !== new URL(base).origin;
    } catch {
        return false;
    }
}

// 每个立绘地址只探测一次；跨域图片先按 CORS 读像素，读不到就只取尺寸、头位用默认值。
export function probeSpriteHead(url, doc) {
    if (!url || !doc) return Promise.resolve(null);
    const cached = headCache.get(url);
    if (cached) return Promise.resolve(cached);
    if (pending.has(url)) return pending.get(url);
    const job = (async () => {
        const cross = isCrossOrigin(url, doc);
        let img = await loadImage(url, doc, cross);
        let head = null;
        if (img) {
            try { head = readAlpha(img, doc); } catch { head = null; }
        } else if (cross) {
            img = await loadImage(url, doc, false);
        }
        if (!img) return null;
        return remember(url, { naturalW: img.naturalWidth, naturalH: img.naturalHeight, head: head || FALLBACK_HEAD });
    })().finally(() => pending.delete(url));
    pending.set(url, job);
    return job;
}

export function waitSpriteHead(url, doc, schedule) {
    const cached = peekSpriteHead(url);
    if (cached || !url) return Promise.resolve(cached);
    return new Promise((resolve) => {
        let done = false;
        const finish = (value) => { if (!done) { done = true; resolve(value); } };
        probeSpriteHead(url, doc).then(finish, () => finish(null));
        schedule(() => finish(null), PROBE_TIMEOUT_MS);
    });
}

export function clearSpriteHeadCache() {
    headCache.clear();
    pending.clear();
}
