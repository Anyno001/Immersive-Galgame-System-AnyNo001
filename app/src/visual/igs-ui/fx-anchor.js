import { spriteIdentity } from '../../scene/character-outfits.js';


// 漫画符号定位：按立绘在舞台里的实际绘制矩形（background-size 高度百分比 + background-position）
// 与立绘透明通道探测出的头部位置换算落点，电脑/窄屏/全屏/内嵌各模式统一按真实像素计算。
const HEAD_CACHE_LIMIT = 48;
const PROBE_W = 48;
const ALPHA_MIN = 40;
const PROBE_TIMEOUT_MS = 160;
export const FALLBACK_HEAD = Object.freeze({ x: 0.5, top: 0.04, w: 0.3 });
export const HEAD_ASPECT = 1.1;

// 头部单位偏移：dx 以头宽、dy 以头高为单位，原点在头顶中心。
export const SYMBOL_OFFSETS = Object.freeze({
    anger: { dx: 0.45, dy: 0.15, size: 0.4 },
    sweat: { dx: 0.56, dy: 0.4, size: 0.32 },
    heart: { dx: 0.5, dy: 0, size: 0.4 },
    surprise: { dx: 0.25, dy: -0.28, size: 0.42 },
    silence: { dx: 0.7, dy: -0.05, size: 0.4 },
    gloom: { dx: 0, dy: 0.4, size: 0.8 },
    sparkle: { dx: 0.62, dy: 0.32, size: 0.38 },
    bulb: { dx: 0, dy: -0.4, size: 0.46 },
    note: { dx: 0.6, dy: 0.05, size: 0.38 },
    zzz: { dx: 0.6, dy: -0.12, size: 0.44 },
    heartbreak: { dx: 0.55, dy: 0.1, size: 0.4 },
    sigh: { dx: 0.62, dy: 0.72, size: 0.42 },
    dizzy: { dx: 0, dy: -0.28, size: 0.5 },
    fire: { dx: 0.58, dy: 0.12, size: 0.44 },
    frost: { dx: 0.6, dy: 0.22, size: 0.4 },
    // 进食符号：嘴角、嘴边、脸颊、下巴一带；红晕与皱巴线罩在脸上（dx 为 0 不翻转）。
    drool: { dx: 0.2, dy: 0.8, size: 0.26 },
    chomp: { dx: 0.42, dy: 0.78, size: 0.36 },
    munch: { dx: 0.5, dy: 0.66, size: 0.34 },
    gulp: { dx: 0.08, dy: 1.08, size: 0.28 },
    bloom: { dx: 0.5, dy: -0.02, size: 0.46 },
    blush: { dx: 0, dy: 0.6, size: 0.62 },
    spicy: { dx: 0.5, dy: 0.8, size: 0.42 },
    steam: { dx: 0.35, dy: 0.55, size: 0.4 },
    sour: { dx: 0, dy: 0.3, size: 0.86 },
    aah: { dx: 0.82, dy: -0.05, size: 0.56 },
    full: { dx: 0.62, dy: 0.72, size: 0.42 },
    bubbles: { dx: 0.45, dy: 0.35, size: 0.38 },
    // 古代背景的鼻涕泡：贴在鼻尖一侧。
    snot: { dx: 0.2, dy: 0.62, size: 0.36 },
    soul: { dx: 0.15, dy: -0.75, size: 0.7 },
    raincloud: { dx: 0, dy: -0.85, size: 0.85 },
    glint: { dx: 0, dy: 0.38, size: 0.75 },
    darkface: { dx: 0, dy: 0.28, size: 1.05 },
    tears: { dx: 0, dy: 0.72, size: 0.95 },
    sweatfly: { dx: 0.45, dy: -0.1, size: 0.6 },
    nosebleed: { dx: 0.02, dy: 0.66, size: 0.28 },
});

const headCache = new Map();
const pending = new Map();
// 加载失败的地址也记下来，避免每次渲染都重新下载一张打不开的立绘。
const failed = new Set();

function finite(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
    return max < min ? (min + max) / 2 : Math.max(min, Math.min(max, value));
}

// 比例 100：图高等于舞台高，宽度按原图比例。不同宽高比的立绘不用各自改比例。
export function spriteBackgroundSize(scale) {
    return `auto ${finite(scale, 100)}%`;
}

// 立绘在舞台里的绘制矩形：background-size 的高度百分比，宽度按原图比例。
export function spriteDrawRect(stageW, stageH, sprite) {
    if (!sprite || !(sprite.naturalW > 0) || !(sprite.naturalH > 0)) return null;
    const h = stageH * finite(sprite.scale, 100) / 100;
    if (!(h > 0)) return null;
    const w = h * sprite.naturalW / sprite.naturalH;
    return { left: (stageW - w) * finite(sprite.posX, 50) / 100, top: (stageH - h) * finite(sprite.posY, 100) / 100, w, h };
}

// 翻转原点要用图的实际宽度百分比。读不到原图时退回比例值本身。
export function spriteWidthPercent(stageW, stageH, sprite) {
    const rect = spriteDrawRect(stageW, stageH, sprite);
    if (!rect || !(stageW > 0)) return finite(sprite && sprite.scale, 100);
    return rect.w / stageW * 100;
}

// 头部标定：{ x, top, w } 均相对立绘原图（x 为头部中心、top 为头顶、w 为头宽），与阅读模式无关；aspect 为原图高宽比。
export function headToMarker(head, rect) {
    const d = head.w * rect.w;
    return { cx: rect.left + head.x * rect.w, cy: rect.top + head.top * rect.h + d * HEAD_ASPECT / 2, d };
}

export function markerToHead(marker, rect) {
    return {
        x: clamp((marker.cx - rect.left) / rect.w, -0.5, 1.5),
        top: clamp((marker.cy - marker.d * HEAD_ASPECT / 2 - rect.top) / rect.h, -0.5, 1.5),
        w: clamp(marker.d / rect.w, 0.02, 1),
    };
}

export function normalizeSpriteHead(value) {
    if (!value || typeof value !== 'object') return null;
    const x = Number(value.x);
    const top = Number(value.top);
    const w = Number(value.w);
    if (![x, top, w].every(Number.isFinite) || !(w > 0)) return null;
    const out = { x: clamp(x, -0.5, 1.5), top: clamp(top, -0.5, 1.5), w: clamp(w, 0.02, 1) };
    const aspect = Number(value.aspect);
    if (Number.isFinite(aspect) && aspect > 0) out.aspect = aspect;
    return out;
}

export function normalizeSpriteHeads(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out = {};
    for (const [key, head] of Object.entries(value)) {
        const normalized = normalizeSpriteHead(head);
        if (key && normalized) out[key] = normalized;
    }
    return out;
}

export function spriteHeadKey(character, mood, outfit = '') {
    const identity = spriteIdentity(character, outfit);
    return mood ? `${identity}::${mood}` : identity;
}

// 表情单独标定优先，其次角色（或「角色|服装」）标定；服装未标定时回落到角色标定；都没有返回 null 走自动识别。
export function resolveSpriteHead(heads, character, mood, outfit = '') {
    if (!heads || !character) return null;
    const identity = spriteIdentity(character, outfit);
    if (identity !== character) {
        return (mood && heads[spriteHeadKey(character, mood, outfit)]) || heads[identity] || heads[character] || null;
    }
    return (mood && heads[spriteHeadKey(character, mood)]) || heads[character] || null;
}

export function measureStage(motion) {
    const stageW = Number(motion && motion.clientWidth);
    const stageH = Number(motion && motion.clientHeight);
    if (!(stageW > 0) || !(stageH > 0)) return null;
    let dialogTop = stageH;
    const dialog = motion.querySelector('#igs-dialog-layer .igs-dialog');
    // 漫画模式的对话框铺满舞台、只是透明的点击面，不算遮挡。
    const comicHost = dialog && dialog.getAttribute && dialog.getAttribute('data-igs-comic-host') === '1';
    // 手机焦点：对话框用 class 淡出（不 display:none），几何上当作隐藏。
    const focused = typeof motion.closest === 'function' && Boolean(motion.closest('.igs-phone-focus'));
    if (dialog && !comicHost && !focused && typeof dialog.getBoundingClientRect === 'function' && typeof motion.getBoundingClientRect === 'function') {
        const d = dialog.getBoundingClientRect();
        const m = motion.getBoundingClientRect();
        // 舞台可能被外层 transform 缩放：矩形差值换回舞台自身的 CSS 像素。
        if (d.height > 0 && m.height > 0) dialogTop = (d.top - m.top) * (stageH / m.height);
    }
    // 顶部固定的工具栏（含地点栏）下沿：手机这类贴顶的层从它下面开始，不和顶栏叠字。
    let topInset = 0;
    const doc = motion.ownerDocument;
    const bar = doc && typeof doc.getElementById === 'function' ? doc.getElementById('igs-ctrl-bar') : null;
    if (bar && typeof bar.getBoundingClientRect === 'function' && typeof motion.getBoundingClientRect === 'function') {
        const b = bar.getBoundingClientRect();
        const m = motion.getBoundingClientRect();
        const k = m.height > 0 ? stageH / m.height : 1;
        const bottom = (b.bottom - m.top) * k;
        if (b.height > 0 && (b.top - m.top) * k < stageH * 0.2 && bottom > 0) topInset = Math.min(stageH * 0.25, bottom);
    }
    return { stageW, stageH, dialogTop, topInset };
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
    const rect = spriteDrawRect(stageW, stageH, sprite);
    if (rect) {
        const head = sprite.head || FALLBACK_HEAD;
        headX = rect.left + rect.w * head.x;
        headTop = rect.top + rect.h * head.top;
        headW = rect.w * head.w;
    }
    headW = clamp(headW, minSide * 0.08, minSide * 0.6);
    const headH = headW * HEAD_ASPECT;
    const size = clamp(headW * offset.size, 22, Math.max(22, minSide * 0.16));
    const flip = headX > stageW * 0.72 && offset.dx > 0;
    const pad = size * 0.55 + 4;
    const x = clamp(headX + (flip ? -offset.dx : offset.dx) * headW, pad, stageW - pad);
    const y = clamp(headTop + offset.dy * headH, pad, floor - pad);
    return { x: Math.round(x), y: Math.round(y), size: Math.round(size), flip };
}

function opaqueRow(data, width, y) {
    let count = 0;
    for (let x = 0; x < width; x += 1) if (data[(y * width + x) * 4 + 3] > ALPHA_MIN) count += 1;
    return count >= 2;
}

// 在缩略画布里找第一行不透明像素作为头顶，取头顶下方一段的不透明列范围作为头宽与头部中心。
export function scanHeadFromAlpha(data, width, height) {
    let top = -1;
    for (let y = 0; y < height && top < 0; y += 1) {
        if (opaqueRow(data, width, y)) top = y;
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

// 最低一行不透明像素的下沿，相对原图高度。1 表示脚就在图的底边；小于 1 表示脚上面还有透明边。
export function scanFeetFromAlpha(data, width, height) {
    let bottom = -1;
    for (let y = height - 1; y >= 0 && bottom < 0; y -= 1) {
        if (opaqueRow(data, width, y)) bottom = y;
    }
    if (bottom < 0) return null;
    return (bottom + 1) / height;
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
    const data = ctx.getImageData(0, 0, w, h).data;
    return { head: scanHeadFromAlpha(data, w, h), feet: scanFeetFromAlpha(data, w, h) };
}

function loadImage(url, doc, cors) {
    return new Promise((resolve) => {
        const ImageCtor = doc.defaultView && doc.defaultView.Image;
        if (typeof ImageCtor !== 'function') return resolve(null);
        const img = new ImageCtor();
        if (cors) img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        // 先异步解码，避免随后 drawImage 在主线程同步解码整张大图。
        img.onload = () => {
            if (!(img.naturalWidth > 0)) return resolve(null);
            if (typeof img.decode !== 'function') return resolve(img);
            img.decode().then(() => resolve(img), () => resolve(img));
        };
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
    if (failed.has(url)) return Promise.resolve(null);
    if (pending.has(url)) return pending.get(url);
    const job = (async () => {
        const cross = isCrossOrigin(url, doc);
        let img = await loadImage(url, doc, cross);
        let metrics = null;
        if (img) {
            try { metrics = readAlpha(img, doc); } catch { metrics = null; }
        } else if (cross) {
            img = await loadImage(url, doc, false);
        }
        if (!img) {
            failed.add(url);
            if (failed.size > HEAD_CACHE_LIMIT) failed.delete(failed.values().next().value);
            return null;
        }
        const feet = metrics && Number(metrics.feet) > 0 ? Number(metrics.feet) : 1;
        return remember(url, { naturalW: img.naturalWidth, naturalH: img.naturalHeight, head: (metrics && metrics.head) || FALLBACK_HEAD, feet });
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
    failed.clear();
}
