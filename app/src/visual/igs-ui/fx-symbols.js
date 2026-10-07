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

const polar = (deg, r) => {
    const a = deg * Math.PI / 180;
    return `${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`;
};

// 冲击短线：符号弹出瞬间沿给定角度向外炸开的小线段，长短交替。
function rays(radius, angles) {
    const d = angles.map((deg, i) => `M${polar(deg, radius)}L${polar(deg, radius + (i % 2 ? 7 : 11))}`).join('');
    return `<path class="igs-fx-burst" d="${d}" fill="none" stroke-width="4" stroke-linecap="round"/>`;
}

function burst(radius, count, from = -90) {
    return rays(radius, Array.from({ length: count }, (_, i) => from + (360 / count) * i));
}

const HEART = 'M50 86C22 66 9 49 9 33C9 19 19 10 31 10C40 10 46 15 50 22C54 15 60 10 69 10C81 10 91 19 91 33C91 49 78 66 50 86Z';
// 心碎：沿锯齿裂缝把心形拆成左右两半，两半各自带描边，裂缝处自然露出白边。
const HEART_L = 'M50 86C22 66 9 49 9 33C9 19 19 10 31 10C40 10 46 15 50 22L44 38L54 52L44 66Z';
const HEART_R = 'M50 22C54 15 60 10 69 10C81 10 91 19 91 33C91 49 78 66 50 86L44 66L54 52L44 38Z';
const DROP = 'M50 8C50 8 78 44 78 62A28 28 0 0 1 22 62C22 44 50 8 50 8Z';
const STAR = 'M50 6Q55 45 94 50Q55 55 50 94Q45 55 6 50Q45 45 50 6Z';
const BULB = 'M50 8C31 8 18 22 18 40C18 52 25 60 31 66C35 70 36 73 36 76H64C64 73 65 70 69 66C75 60 82 52 82 40C82 22 69 8 50 8Z';
const BULB_BASE = 'M36 79H64V86Q64 93 57 93H43Q36 93 36 86Z';
const FLAME = 'M50 4C57 22 76 30 80 52C84 76 68 94 50 94C32 94 16 80 18 58C19 46 26 37 33 31C33 41 37 48 43 51C39 34 43 18 50 4Z';
const FLAME_IN = 'M50 46C55 57 65 62 65 75C65 86 58 92 50 92C42 92 35 86 35 77C35 69 41 64 44 56C46 62 48 65 51 65C49 58 48 52 50 46Z';
const PUFF = 'M30 70C16 70 10 60 14 51C8 42 16 30 28 33C30 22 44 17 53 25C60 16 76 20 77 33C88 34 93 46 86 55C92 64 84 74 72 71C66 79 50 79 44 72C40 74 34 73 30 70Z';
// 螺旋：交替圆心的半圆逐圈放大，圈距 12 保证三层描边叠起来仍留有缝隙。
const SPIRAL = 'M50 50a6 6 0 0 1 12 0a12 12 0 0 1 -24 0a18 18 0 0 1 36 0a24 24 0 0 1 -48 0a30 30 0 0 1 60 0';
// 音符：所有子路径同为顺时针，非零环绕下符头、符杆与符梁合成一个整体轮廓。
const noteHead = (cx, cy) => `M${cx - 12} ${cy}a12 9 -20 1 1 24 0a12 9 -20 1 1 -24 0Z`;
const NOTE_PAIR = `${noteHead(34, 76)}${noteHead(74, 64)}M41 28H46V75H41ZM81 16H86V63H81ZM41 22L86 10V21L41 33Z`;
const NOTE = `${noteHead(40, 80)}M47 20H53V79H47ZM53 20Q74 28 72 50Q66 36 53 36Z`;
const GHOST = 'M50 12C30 12 22 28 24 46C25 62 20 74 30 82C34 74 38 84 44 76C48 86 54 78 58 84C64 74 70 84 76 72C80 58 76 46 76 36C76 22 66 12 50 12Z';
const SWEAT_DROP = 'M50 8Q72 40 72 58A22 22 0 0 1 28 58Q28 40 50 8Z';
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0Z`;
const zee = (x, y, s) => `M${x} ${y}h${s}l${-s} ${s}h${s}`;
// 六瓣冰晶：每条主干末端带一个 V 形分叉。
const SNOWFLAKE = [-90, -30, 30, 90, 150, 210]
    .map((deg) => `M50 50L${polar(deg, 40)}M${polar(deg - 22, 32)}L${polar(deg, 24)}L${polar(deg + 22, 32)}`)
    .join('');
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

// 小花：五片圆瓣绕中心（同向圆弧，非零环绕下合成一个轮廓），花心另画一层。
const FLOWER = [-90, -18, 54, 126, 198].map((deg) => {
    const [x, y] = polar(deg, 20).split(' ').map(Number);
    return circle(x, y, 15);
}).join('');
const flowerCore = '<circle class="igs-fx-bloom-core" cx="50" cy="50" r="10" stroke-width="4"/>';
const BUBBLE_SPEECH = 'M14 14H86Q96 14 96 24V58Q96 68 86 68H40L26 84L30 68H14Q4 68 4 58V24Q4 14 14 14Z';
const BLUSH = (x) => `M${x} 50a18 11 0 1 1 36 0a18 11 0 1 1 -36 0Z`;
const zigzag = (x, y, n, w = 8) => `M${x} ${y}` + Array.from({ length: n }, (_, i) => `l${w} ${i % 2 ? 8 : -8}`).join('');

const BODIES = Object.freeze({
    anger: burst(44, 8, -67.5)
        + strokeGlyph('M42 12Q40 40 12 42M58 12Q60 40 88 42M42 88Q40 60 12 58M58 88Q60 60 88 58', 10, 'igs-fx-vein')
        + '<path class="igs-fx-hi-line" d="M40 20Q39 30 34 35M60 20Q61 30 66 35" fill="none" stroke-width="3" stroke-linecap="round"/>',
    sweat: fillShape(SWEAT_DROP, 'igs-fx-drop-a', shine(40, 58, 5, 10, 20))
        + fillShape(SWEAT_DROP, 'igs-fx-drop-b', shine(40, 58, 6, 11, 20), 66, 44, .42),
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
    bulb: rays(44, [-90, -130, -50, -170, -10])
        + '<g class="igs-fx-g igs-fx-bulb">'
        + fillShape(BULB, 'igs-fx-bulb-glass', shine(33, 30, 6, 11, 30)
            + '<path class="igs-fx-filament" d="M42 64V52L50 58L58 52V64" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>')
        + fillShape(BULB_BASE, 'igs-fx-bulb-base', '<path class="igs-fx-filament" d="M40 86H60" fill="none" stroke-width="3" stroke-linecap="round"/>')
        + '</g>',
    note: fillShape(NOTE_PAIR, 'igs-fx-note-main', shine(30, 73, 5, 3, -20))
        + fillShape(NOTE, 'igs-fx-note-b', '', 2, 0, .34),
    zzz: strokeGlyph(zee(10, 66, 18), 6, 'igs-fx-z-1')
        + strokeGlyph(zee(34, 40, 24), 7, 'igs-fx-z-2')
        + strokeGlyph(zee(62, 8, 30), 8, 'igs-fx-z-3'),
    heartbreak: fillShape(HEART_L, 'igs-fx-break-l', shine(28, 30, 8, 5, -35))
        + fillShape(HEART_R, 'igs-fx-break-r'),
    sigh: fillShape(PUFF, 'igs-fx-puff', shine(40, 38, 9, 5, -15))
        + fillShape(circle(12, 84, 6), 'igs-fx-puff-b')
        + fillShape(circle(2, 96, 3.5), 'igs-fx-puff-c'),
    dizzy: strokeGlyph(SPIRAL, 3.5, 'igs-fx-spiral')
        + '<g class="igs-fx-orbit">'
        + fillShape(STAR, '', '', 74, 2, .24)
        + fillShape(STAR, '', '', 4, 72, .2)
        + '</g>',
    fire: fillShape(FLAME, 'igs-fx-flame', `<path class="igs-fx-flame-in" d="${FLAME_IN}"/>`),
    frost: burst(46, 6, -60)
        + strokeGlyph(SNOWFLAKE, 4, 'igs-fx-crystal')
        + fillShape(SWEAT_DROP, 'igs-fx-drop-b', shine(40, 58, 6, 11, 20), 70, 58, .34),
    // 进食分镜用的符号（也可被情绪词单独触发）：口水、啊呜、嚼嚼、咕咚、小花、红晕、喷火、哈气、皱巴线、啊～气泡、满足、咕嘟气泡。
    drool: strokeGlyph('M44 6Q46 22 50 32', 4, 'igs-fx-drool-line')
        + fillShape(DROP, 'igs-fx-drool', shine(40, 58, 6, 11, 20), 22, 28, .56),
    chomp: burst(46, 8, -67.5)
        + strokeGlyph('M16 34L28 48L40 34L52 48L64 34L76 48L84 38', 6, 'igs-fx-jaw-top')
        + strokeGlyph('M16 72L28 58L40 72L52 58L64 72L76 58L84 68', 6, 'igs-fx-jaw-bottom'),
    munch: strokeGlyph('M26 22Q46 50 26 78', 6, 'igs-fx-munch-a')
        + strokeGlyph('M50 32Q62 50 50 68', 6, 'igs-fx-munch-b')
        + fillShape(circle(78, 38, 6), 'igs-fx-crumb-a')
        + fillShape(circle(84, 62, 4.5), 'igs-fx-crumb-b'),
    gulp: strokeGlyph('M50 8q-10 9 0 18t0 18t0 18', 6, 'igs-fx-gulp')
        + strokeGlyph('M36 66L50 84L64 66', 7, 'igs-fx-gulp'),
    bloom: fillShape(FLOWER, 'igs-fx-bloom-main', flowerCore + shine(38, 32, 6, 4, -35), 8, 8, .78)
        + fillShape(FLOWER, 'igs-fx-bloom-b', flowerCore, 66, 0, .32)
        + fillShape(FLOWER, 'igs-fx-bloom-c', flowerCore, 74, 64, .26),
    blush: fillShape(BLUSH(4), 'igs-fx-blush', '<path class="igs-fx-hi-line" d="M12 56L18 44M21 56L27 44M30 56L36 44" fill="none" stroke-width="3" stroke-linecap="round"/>')
        + fillShape(BLUSH(60), 'igs-fx-blush', '<path class="igs-fx-hi-line" d="M68 56L74 44M77 56L83 44M86 56L92 44" fill="none" stroke-width="3" stroke-linecap="round"/>'),
    spicy: rays(44, [-40, -15, 15, 40])
        + `<g transform="rotate(90 50 50)">${fillShape(FLAME, 'igs-fx-spicy-flame', `<path class="igs-fx-flame-in" d="${FLAME_IN}"/>`)}</g>`,
    steam: strokeGlyph('M26 88q-9-10 0-20t0-20t0-20', 5, 'igs-fx-steam-a')
        + strokeGlyph('M50 92q-9-10 0-20t0-20t0-20t0-20', 5, 'igs-fx-steam-b')
        + strokeGlyph('M74 86q-9-10 0-20t0-20', 5, 'igs-fx-steam-c'),
    sour: strokeGlyph(zigzag(6, 26, 4), 4.5, 'igs-fx-sour-a')
        + strokeGlyph(zigzag(60, 18, 4), 4.5, 'igs-fx-sour-b')
        + strokeGlyph(zigzag(30, 82, 5), 4.5, 'igs-fx-sour-c'),
    aah: '<g class="igs-fx-g igs-fx-solid igs-fx-bubble igs-fx-aah" stroke-linejoin="round">'
        + `<path class="igs-fx-rim" d="${BUBBLE_SPEECH}" stroke-width="10"/>`
        + `<path class="igs-fx-paper" d="${BUBBLE_SPEECH}" stroke-width="4"/>`
        + '<text class="igs-fx-aah-text" x="50" y="53" text-anchor="middle" font-size="32" font-weight="900">啊～</text>'
        + '</g>'
        + fillShape(HEART, 'igs-fx-heart-b', '', 72, 64, .3),
    full: fillShape(PUFF, 'igs-fx-puff', shine(40, 38, 9, 5, -15))
        + fillShape(HEART, 'igs-fx-heart-b', '', 70, 0, .26)
        + fillShape(circle(12, 84, 6), 'igs-fx-puff-b'),
    bubbles: fillShape(circle(36, 72, 15), 'igs-fx-bub-a', shine(30, 66, 5, 3, -30))
        + fillShape(circle(64, 44, 11), 'igs-fx-bub-b', shine(60, 40, 4, 2.5, -30))
        + fillShape(circle(44, 16, 7), 'igs-fx-bub-c'),
    soul: fillShape(GHOST, 'igs-fx-soul', '<circle cx="42" cy="38" r="4" fill="#1b1b1b"/><circle cx="58" cy="38" r="4" fill="#1b1b1b"/>' + shine(36, 26, 6, 3, -30)),
    raincloud: fillShape(PUFF, 'igs-fx-puff', shine(40, 38, 9, 5, -15))
        + strokeGlyph('M30 82l-5 12M50 82l-5 12M70 82l-5 12', 3.5, 'igs-fx-rain'),
    glint: strokeGlyph('M8 46h32v16q0 10-10 10h-12q-10 0-10-10zM60 46h32v16q0 10-10 10h-12q-10 0-10-10zM40 52h20', 4, 'igs-fx-glasses')
        + fillShape(STAR, 'igs-fx-star-main', '', 12, 30, .36)
        + fillShape(STAR, 'igs-fx-star-b', '', 64, 30, .36),
    darkface: fillShape('M6 66Q6 14 50 14Q94 14 94 66Q50 54 6 66Z', 'igs-fx-shade')
        + strokeGlyph('M30 26v22M44 22v26M58 22v26M72 26v22', 2.5, 'igs-fx-shade-lines'),
    tears: strokeGlyph('M26 8Q20 50 30 94M74 8Q80 50 70 94', 10, 'igs-fx-tear'),
    sweatfly: fillShape(SWEAT_DROP, 'igs-fx-drop-a', '', 0, 6, .5)
        + fillShape(SWEAT_DROP, 'igs-fx-drop-b', '', 52, 0, .42)
        + fillShape(SWEAT_DROP, 'igs-fx-drop-c', '', 30, 50, .38),
    nosebleed: strokeGlyph('M50 8Q44 46 54 78', 9, 'igs-fx-bleed') + fillShape(SWEAT_DROP, 'igs-fx-drop-a', '', 34, 64, .32),
});

const svgOf = (body) => `<svg class="igs-fx-svg" viewBox="-12 -12 124 124" aria-hidden="true" focusable="false">${body}</svg>`;

export const MANGA_SYMBOL_SVG = Object.freeze(Object.fromEntries(Object.entries(BODIES).map(([kind, body]) => [kind, svgOf(body)])));

// 古代背景：只替换带现代器物或西文的三个符号——灯泡换油灯，五线谱音符换墨点，Zzz 换鼻涕泡（贴在鼻尖，定位用 snot）。
const LAMP_BOWL = 'M12 66H88Q84 88 50 90Q16 88 12 66ZM40 90H60L64 96H36Z';
const LAMP_FLAME = 'M50 14C58 30 66 38 66 50A16 16 0 0 1 34 50C34 38 42 30 50 14Z';
const LAMP_FLAME_IN = 'M50 34C54 42 58 46 58 52A8 8 0 0 1 42 52C42 46 46 42 50 34Z';
const ANCIENT_BODIES = Object.freeze({
    bulb: rays(44, [-90, -130, -50, -165, -15])
        + '<g class="igs-fx-g igs-fx-lamp">'
        + fillShape(LAMP_FLAME, 'igs-fx-lamp-flame', `<path class="igs-fx-flame-in" d="${LAMP_FLAME_IN}"/>`)
        + fillShape(LAMP_BOWL, 'igs-fx-lamp-bowl', shine(30, 73, 7, 2.5, 0))
        + '</g>',
    note: strokeGlyph('M8 72C24 40 38 40 50 56S74 74 92 36', 5, 'igs-fx-inkwave')
        + fillShape(circle(22, 38, 7), 'igs-fx-inkdot-1')
        + fillShape(circle(56, 28, 5.5), 'igs-fx-inkdot-2')
        + fillShape(circle(82, 60, 6.5), 'igs-fx-inkdot-3'),
    zzz: fillShape(circle(46, 48, 34), 'igs-fx-snot', shine(32, 32, 9, 5, -35))
        + fillShape(circle(86, 84, 7), 'igs-fx-snot-b'),
});
export const ANCIENT_SYMBOL_SVG = Object.freeze(Object.fromEntries(Object.entries(ANCIENT_BODIES).map(([kind, body]) => [kind, svgOf(body)])));
// 古代版与现代版定位不同的符号：鼻涕泡贴鼻尖，不在头顶。
export const ANCIENT_SYMBOL_PLACEMENT = Object.freeze({ zzz: 'snot' });

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
