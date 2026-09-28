// 漫画符号：内联 SVG 贴纸（白色外描边 + 深色轮廓 + 主色 + 高光），颜色全部走 CSS 变量，
// 由 fx-style.js 按符号固有色与对话主题强调色混合；部件带 class 供分拍动画使用。
// 坐标系统一为 100×100，viewBox 四周留白给外描边与冲击线。

// 描边型字形：同一路径叠三层（白边 → 墨线 → 主色），得到圆润的贴纸线条。
function strokeGlyph(d, width, cls = '') {
    return `<g class="igs-fx-g ${cls}" fill="none" stroke-linecap="round" stroke-linejoin="round">`
        + `<path class="igs-fx-rim" d="${d}" stroke-width="${width + 11}"/>`
        + `<path class="igs-fx-ink" d="${d}" stroke-width="${width + 5}"/>`
        + `<path class="igs-fx-line" d="${d}" stroke-width="${width}"/>`
        + '</g>';
}

// 填充型形状：白边垫底，主色填充带墨线轮廓，可附加高光；缩小的部件按比例加粗描边，保持同样的贴纸线宽。
// 摆位用外层 <g transform> 承担，动画 class 放内层——CSS transform 会覆盖元素自身的 transform 属性。
function fillShape(d, cls = '', extra = '', x = 0, y = 0, scale = 1) {
    const k = 1 / Math.max(0.5, scale);
    const body = `<g class="igs-fx-g igs-fx-solid ${cls}" stroke-linejoin="round">`
        + `<path class="igs-fx-rim" d="${d}" stroke-width="${(12 * k).toFixed(1)}"/>`
        + `<path class="igs-fx-fill" d="${d}" stroke-width="${(4.5 * k).toFixed(1)}"/>`
        + extra
        + '</g>';
    return scale !== 1 || x || y ? `<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>` : body;
}

// 冲击短线：符号弹出瞬间向外炸开的一圈小线段。
function burst(radius, count, from = -90) {
    let d = '';
    for (let i = 0; i < count; i += 1) {
        const a = (from + (360 / count) * i) * Math.PI / 180;
        const r0 = radius;
        const r1 = radius + (i % 2 ? 7 : 11);
        const p = (r) => `${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`;
        d += `M${p(r0)}L${p(r1)}`;
    }
    return `<path class="igs-fx-burst" d="${d}" fill="none" stroke-width="4" stroke-linecap="round"/>`;
}

const HEART = 'M50 86C22 66 9 49 9 33C9 19 19 10 31 10C40 10 46 15 50 22C54 15 60 10 69 10C81 10 91 19 91 33C91 49 78 66 50 86Z';
const DROP = 'M50 8C50 8 78 44 78 62A28 28 0 0 1 22 62C22 44 50 8 50 8Z';
const STAR = 'M50 6Q55 45 94 50Q55 55 50 94Q45 55 6 50Q45 45 50 6Z';
const shine = (cx, cy, rx, ry, rot = -30) => `<ellipse class="igs-fx-hi" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})"/>`;

// 波浪竖线：每条从 y0 起向下蜿蜒 n 个半波，pathLength=1 便于“从上往下画出”。
function wavyLine(x, y0, halves, amp, cls) {
    let d = `M${x} ${y0}`;
    d += `q${amp} 6 0 12`;
    for (let i = 1; i < halves; i += 1) d += 't0 12';
    return `<g class="igs-fx-g igs-fx-wave ${cls}" fill="none" stroke-linecap="round">`
        + `<path class="igs-fx-rim" d="${d}" stroke-width="10" pathLength="1"/>`
        + `<path class="igs-fx-ink" d="${d}" stroke-width="4.5" pathLength="1"/>`
        + '</g>';
}

const BODIES = Object.freeze({
    anger: burst(44, 8, -67.5)
        + strokeGlyph('M42 12Q40 40 12 42M58 12Q60 40 88 42M42 88Q40 60 12 58M58 88Q60 60 88 58', 10, 'igs-fx-vein')
        + '<path class="igs-fx-hi-line" d="M40 20Q39 30 34 35M60 20Q61 30 66 35" fill="none" stroke-width="3" stroke-linecap="round"/>',
    sweat: fillShape(DROP, 'igs-fx-drop-a', shine(40, 58, 5, 10, 20))
        + fillShape(DROP, 'igs-fx-drop-b', shine(40, 58, 6, 11, 20), 66, 44, .42),
    heart: fillShape(HEART, 'igs-fx-heart-main', shine(30, 30, 8, 5, -35), 4, 14, .8)
        + fillShape(HEART, 'igs-fx-heart-b', shine(30, 30, 9, 6, -35), 68, 2, .3)
        + fillShape(HEART, 'igs-fx-heart-c', shine(30, 30, 9, 6, -35), 80, 34, .22),
    surprise: burst(46, 10, -90)
        + strokeGlyph('M26 16L28 56M27 80l0 .1', 13, 'igs-fx-bang')
        + strokeGlyph('M50 30Q50 14 67 14Q86 14 86 31Q86 43 73 48Q66 51 66 60M66 80l0 .1', 11, 'igs-fx-ques'),
    silence: '<g class="igs-fx-g igs-fx-solid igs-fx-bubble" stroke-linejoin="round">'
        + '<path class="igs-fx-rim" d="M16 22H84Q94 22 94 32V60Q94 70 84 70H40L24 84L28 70H16Q6 70 6 60V32Q6 22 16 22Z" stroke-width="10"/>'
        + '<path class="igs-fx-paper" d="M16 22H84Q94 22 94 32V60Q94 70 84 70H40L24 84L28 70H16Q6 70 6 60V32Q6 22 16 22Z" stroke-width="4"/>'
        + '</g>'
        + '<circle class="igs-fx-fill igs-fx-dot igs-fx-dot-1" cx="29" cy="46" r="7" stroke-width="3"/>'
        + '<circle class="igs-fx-fill igs-fx-dot igs-fx-dot-2" cx="50" cy="46" r="7" stroke-width="3"/>'
        + '<circle class="igs-fx-fill igs-fx-dot igs-fx-dot-3" cx="71" cy="46" r="7" stroke-width="3"/>',
    gloom: wavyLine(20, 4, 6, 7, 'igs-fx-wave-1')
        + wavyLine(40, 2, 8, 7, 'igs-fx-wave-2')
        + wavyLine(60, 4, 7, 7, 'igs-fx-wave-3')
        + wavyLine(80, 8, 5, 7, 'igs-fx-wave-4'),
    sparkle: burst(46, 8, -90)
        + fillShape(STAR, 'igs-fx-star-main', '<circle class="igs-fx-hi" cx="50" cy="50" r="5"/>', 8, 12, .72)
        + fillShape(STAR, 'igs-fx-star-b', '', 66, 2, .3)
        + fillShape(STAR, 'igs-fx-star-c', '', 72, 62, .24),
});

export const MANGA_SYMBOL_SVG = Object.freeze(Object.fromEntries(Object.entries(BODIES).map(([kind, body]) => [
    kind,
    `<svg class="igs-fx-svg" viewBox="-12 -12 124 124" aria-hidden="true" focusable="false">${body}</svg>`,
])));

// 取主题里饱和度最高的颜色作为演出强调色；主题整体偏灰（黑白、灰阶）时返回空串，符号用固有色。
const MIN_CHROMA = 0.14;

function parseHex(value) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || '').trim());
    if (!m) return null;
    const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

// 主题色常是浅金、灰粉这类低饱和色：只取色相，饱和度与明度拉到贴纸需要的鲜亮区间，避免符号被冲淡或发灰。
function vivid(rgb) {
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    const d = max - min;
    const [r, g, b] = rgb;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return `hsl(${Math.round(h)} 88% 60%)`;
}

export function pickFxAccent(theme) {
    if (!theme) return '';
    let best = null;
    let bestChroma = MIN_CHROMA;
    for (const key of ['nameColor', 'thoughtColor', 'dividerColor', 'textColor', 'narrationColor']) {
        const rgb = parseHex(theme[key]);
        if (!rgb) continue;
        const chroma = Math.max(...rgb) - Math.min(...rgb);
        if (chroma > bestChroma) {
            bestChroma = chroma;
            best = rgb;
        }
    }
    return best ? vivid(best) : '';
}

// 集中线：离屏画一次楔形放射线（外粗内尖、长短错落，边缘淡出烤进图里），转成图片缓存复用，
// 取代原先带遮罩、比舞台还大的放射渐变层。画布不可用时返回空串，样式回落到纯 CSS 渐变。
const SPEED_SIZE = 720;
const SPEED_RAYS = 150;
let speedLinesUrl = null;

export function speedLinesImage(doc) {
    if (speedLinesUrl !== null) return speedLinesUrl;
    speedLinesUrl = '';
    try {
        const canvas = doc && typeof doc.createElement === 'function' ? doc.createElement('canvas') : null;
        const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        if (!ctx) return speedLinesUrl;
        canvas.width = SPEED_SIZE;
        canvas.height = SPEED_SIZE;
        const c = SPEED_SIZE / 2;
        const outer = SPEED_SIZE * 0.75;
        // 固定种子的伪随机，保证每次生成的图案一致。
        let seed = 7;
        const rand = () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };
        for (let i = 0; i < SPEED_RAYS; i += 1) {
            const a = (i / SPEED_RAYS) * Math.PI * 2 + (rand() - 0.5) * 0.035;
            const inner = SPEED_SIZE * (0.2 + rand() * 0.16);
            const half = (0.004 + rand() * 0.01);
            const tip = [c + Math.cos(a) * inner, c + Math.sin(a) * inner];
            const grad = ctx.createRadialGradient(c, c, inner, c, c, outer);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(0.35, `rgba(255,255,255,${0.55 + rand() * 0.4})`);
            grad.addColorStop(1, 'rgba(255,255,255,.95)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(tip[0], tip[1]);
            ctx.lineTo(c + Math.cos(a - half) * outer, c + Math.sin(a - half) * outer);
            ctx.lineTo(c + Math.cos(a + half) * outer, c + Math.sin(a + half) * outer);
            ctx.closePath();
            ctx.fill();
        }
        speedLinesUrl = canvas.toDataURL('image/png');
    } catch {
        speedLinesUrl = '';
    }
    return speedLinesUrl;
}

// 开启漫画演出后趁空闲预先生成集中线，首次播放时不再同步绘制。
let warming = false;

export function warmSpeedLines(doc) {
    if (speedLinesUrl !== null || warming) return;
    const view = doc && doc.defaultView;
    if (!view || typeof view.requestIdleCallback !== 'function') return;
    warming = true;
    view.requestIdleCallback(() => {
        warming = false;
        speedLinesImage(doc);
    }, { timeout: 3000 });
}
