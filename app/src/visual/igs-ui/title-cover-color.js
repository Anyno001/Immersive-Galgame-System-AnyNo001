// 主界面大色块取自角色卡封面：缩到 32×32 统计色相，挑「又多又鲜」的那一档，不取平均色（平均出来是泥灰）。
// 封面偏灰、读不到像素时返回 null，由皮肤强调色兜底。
const SAMPLE = 32;
const HUE_BINS = 12;
const cache = new Map();

function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
}

function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m];
}

function hex(rgb) {
    return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}

function luminance([r, g, b]) {
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// 色块上的字：黑白里对比度高的那个。
export function inkFor(color) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
    if (!m) return '';
    const n = parseInt(m[1], 16);
    const lum = luminance([(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
    return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? '#101014' : '#ffffff';
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function paletteFromPixels(data) {
    const bins = Array.from({ length: HUE_BINS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
    let total = 0;
    let colorful = 0;
    for (let i = 0; i + 3 < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        total += 1;
        const [h, s, l] = rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
        if (s < 0.1 || l < 0.12 || l > 0.9) continue;
        // 越鲜、越接近中间亮度权重越高；色相用单位向量累加，跨 0° 的红色不会被平均成青色。
        // 浅肤色几乎每张人物封面都有，压低权重，免得主色总落在皮肤上。
        const skin = h >= 12 && h <= 45 && l > 0.55 && s < 0.7 ? 0.3 : 1;
        const w = s * s * (1 - Math.abs(l - 0.5)) * skin;
        const bin = bins[Math.floor(h / (360 / HUE_BINS)) % HUE_BINS];
        const rad = (h * Math.PI) / 180;
        bin.w += w; bin.x += Math.cos(rad) * w; bin.y += Math.sin(rad) * w; bin.s += s * w; bin.l += l * w;
        colorful += 1;
    }
    // 有色像素不到 4% 才算黑白封面。
    if (!total || colorful / total < 0.04) return null;
    // 相邻两档并成一组再比，免得一种颜色正好落在档界被拆成两半。
    let best = null;
    for (let i = 0; i < HUE_BINS; i++) {
        const a = bins[i];
        const b = bins[(i + 1) % HUE_BINS];
        const w = a.w + b.w;
        if (!best || w > best.w) best = { w, x: a.x + b.x, y: a.y + b.y, s: a.s + b.s, l: a.l + b.l };
    }
    const h = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360;
    const s = best.s / best.w;
    const l = best.l / best.w;
    // 素淡的封面给素淡的色块：饱和度按原样放大，不一律拉到艳色。
    const block = hex(hslToRgb(h, clamp(s * 1.6, 0.34, 0.76), clamp(l, 0.5, 0.62)));
    const deep = hex(hslToRgb(h, clamp(s * 0.45, 0.12, 0.32), 0.085));
    // 古典系（水墨、古典）用的典雅色：同色相，饱和压到三成上下、亮度略沉，像矿物颜料。
    const muted = hex(hslToRgb(h, clamp(s * 0.55, 0.14, 0.34), clamp(l * 0.9, 0.4, 0.5)));
    return { block, deep, ink: inkFor(block), muted, mutedInk: inkFor(muted) };
}

function readPixels(img, doc) {
    const canvas = doc.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    return g.getImageData(0, 0, SAMPLE, SAMPLE).data;
}

// 已载入的封面 <img> → 配色；同一地址只算一次。
export function coverPaletteOf(img, url) {
    const key = String(url || '');
    if (key && cache.has(key)) return cache.get(key);
    let palette = null;
    try {
        const data = img && img.ownerDocument ? readPixels(img, img.ownerDocument) : null;
        palette = data ? paletteFromPixels(data) : null;
    } catch (error) {
        palette = null;
    }
    if (key) cache.set(key, palette);
    return palette;
}

export function cachedCoverPalette(url) {
    const key = String(url || '');
    return key && cache.has(key) ? { hit: true, palette: cache.get(key) } : { hit: false, palette: null };
}
