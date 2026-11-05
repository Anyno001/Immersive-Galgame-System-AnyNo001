// 窄屏阅读模式逐皮肤部件：头像框、姓名牌、行间与换场景分割线、情绪胶囊。全部实色，图形为内联 SVG data URL。
// 选择器带皮肤 id，排在 getLogFrameStyleText 之后覆盖；破框头像不画角饰。数值集中在 SPECS 规格表。

// ---- 小图形（24x24 画布，颜色由皮肤传入）----
// 窄屏皮肤部件用的小图形：每个函数返回一段 SVG，颜色由皮肤传入（全部实色）。24x24 画布，显示尺寸由调用处决定。
const wrap = (w, h, body) => `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`;
const sq = (body) => wrap(24, 24, body);
const asUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const M = {
    // 四芒星（魔法）
    spark: (c) => sq(`<path d='M12 2C12.8 8 16 11.2 22 12C16 12.8 12.8 16 12 22C11.2 16 8 12.8 2 12C8 11.2 11.2 8 12 2Z' fill='${c}'/>`),
    // 空心菱形（西式古典）
    diamond: (c) => sq(`<path d='M12 3.5L20.5 12L12 20.5L3.5 12Z' fill='none' stroke='${c}' stroke-width='2'/>`),
    // 实心小菱形
    diamondFill: (c) => sq(`<path d='M12 4L19 12L12 20L5 12Z' fill='${c}'/>`),
    // 空心小圆（优雅欧式）
    ring: (c) => sq(`<circle cx='12' cy='12' r='6' fill='none' stroke='${c}' stroke-width='2'/>`),
    // 珍珠（深海人鱼）
    pearl: (c) => sq(`<circle cx='12' cy='12' r='8' fill='${c}'/><circle cx='9.2' cy='9.2' r='2.4' fill='#ffffff'/>`),
    // 实心圆点
    dot: (c) => sq(`<circle cx='12' cy='12' r='6' fill='${c}'/>`),
    // 印章方块（日式、仙侠）
    seal: (c) => sq(`<rect x='4' y='4' width='16' height='16' rx='2' fill='${c}'/>`),
    // 三峰远山（青绿山水）
    peaks: (c) => sq(`<path d='M1.5 18.5L7.5 9L11.5 14.5L16 7L22.5 18.5' fill='none' stroke='${c}' stroke-width='1.8' stroke-linejoin='round' stroke-linecap='round'/>`),
    // 弦月（水墨武侠）
    moon: (c) => sq(`<path d='M15.5 3.2A9.2 9.2 0 1 0 15.5 20.8A7.4 7.4 0 1 1 15.5 3.2Z' fill='${c}'/>`),
    // 叶片（植物咖啡）
    leaf: (c) => sq(`<path d='M4 20C4 10 10 4 20 4C20 14 14 20 4 20Z' fill='${c}'/>`),
    // 路标圈（冒险旅途）
    waypoint: (c) => sq(`<circle cx='12' cy='12' r='6.5' fill='none' stroke='${c}' stroke-width='2.2'/><circle cx='12' cy='12' r='2' fill='${c}'/>`),
    // 叉（冒险旅途：藏宝标记）
    cross: (c) => sq(`<path d='M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5' stroke='${c}' stroke-width='2.4' stroke-linecap='round'/>`),
    // 四个小方块（温暖绘本）
    quad: (c) => sq(`<rect x='3' y='3' width='8' height='8' fill='${c}'/><rect x='13' y='3' width='8' height='8' fill='${c}'/><rect x='3' y='13' width='8' height='8' fill='${c}'/><rect x='13' y='13' width='8' height='8' fill='${c}'/>`),
    // 浆果（童话小镇）
    berry: (c, g) => sq(`<circle cx='12' cy='14.5' r='7' fill='${c}'/><path d='M12 8.5C12 5.2 14 3.2 18 3.2C18 6.6 15.6 8.6 12 8.5Z' fill='${g}'/>`),
    // 小爱心（超可爱粉）
    heart: (c) => sq(`<path d='M12 21C4 15 2.5 10.5 2.5 8A5 5 0 0 1 12 6.5A5 5 0 0 1 21.5 8C21.5 10.5 20 15 12 21Z' fill='${c}'/>`),
    // 眼（褪色病历）
    eye: (c) => sq(`<path d='M1.5 12C6 5.5 18 5.5 22.5 12C18 18.5 6 18.5 1.5 12Z' fill='none' stroke='${c}' stroke-width='2' stroke-linejoin='round'/><circle cx='12' cy='12' r='3.4' fill='${c}'/>`),
    // 血滴（血色噩梦）
    drop: (c) => sq(`<path d='M12 2C12 2 5.5 10.5 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 10.5 12 2 12 2Z' fill='${c}'/>`),
    // 准星（全息投影）
    reticle: (c) => sq(`<circle cx='12' cy='12' r='5.5' fill='none' stroke='${c}' stroke-width='1.8'/><path d='M12 1.5V7M12 17V22.5M1.5 12H7M17 12H22.5' stroke='${c}' stroke-width='1.8'/>`),
    // 短横条（全息分割线中段、废土名牌竖条）
    barH: (c) => wrap(24, 6, `<rect x='0' y='2' width='24' height='2' fill='${c}'/>`),
    barV: (c) => wrap(6, 24, `<rect x='1' y='3' width='3' height='18' fill='${c}'/>`),
    // 彩旗三面（童话小镇）
    bunting: (a, b, c) => wrap(33, 10, `<path d='M0 0H10L5 9.5Z' fill='${a}'/><path d='M11.5 0H21.5L16.5 9.5Z' fill='${b}'/><path d='M23 0H33L28 9.5Z' fill='${c}'/>`),
    // 网点渐变（黑白漫画）：中间大两边小
    halftone: (c) => wrap(44, 12, `<circle cx='5' cy='6' r='.9' fill='${c}'/><circle cx='12' cy='6' r='1.6' fill='${c}'/><circle cx='22' cy='6' r='2.6' fill='${c}'/><circle cx='32' cy='6' r='1.6' fill='${c}'/><circle cx='39' cy='6' r='.9' fill='${c}'/>`),
    // 三个圆点（超可爱粉：蚂蚁线圆点）
    dots3: (c) => wrap(26, 8, `<circle cx='4' cy='4' r='2.2' fill='${c}'/><circle cx='13' cy='4' r='2.2' fill='${c}'/><circle cx='22' cy='4' r='2.2' fill='${c}'/>`),
};

// ---- 22 套皮肤规格：ring 头像框 / r 圆角 / orn 角饰 / name 姓名牌 / row 行间线 / scene 换场景线 / chip 情绪胶囊 ----

const fade = (c) => `linear-gradient(90deg,${c},transparent)`;

// 魔法星夜两种配色共用：底色近黑，装饰取学院色 / 墨夜自定义色（reader-dom-render 写在 #igs-overlay 上的 --igs-ma-metal）。
const MAGIC_METAL = 'var(--igs-ma-metal,#cfd5f2)';
const MAGIC_LOG = {
    ring: `inset 0 0 0 1px ${MAGIC_METAL}`,
    r: 6,
    row: { line: 'fade', c: '#32333f' },
    scene: { tint: MAGIC_METAL, m: { svg: M.spark('#000'), w: 9, h: 9 } },
    chip: { r: 99, ink: MAGIC_METAL },
    card: '#20212c',
};

const SPECS = {
    'gradient-veil': {
        ring: 'inset 0 0 0 1px #4a4752',
        name: { ul: { bg: fade('#8a8594'), w: '100%', h: 1 } },
        row: { line: 'fade', c: '#3c3a44' },
        scene: { line: 'fade', c: '#3c3a44' },
        chip: { r: 99 },
    },
    default: {
        ring: 'inset 0 0 0 1px #4a4a50, inset 0 1px 0 #5c5c63',
        name: { plate: { r: 6, bg: '#2c2c2f', px: 7 } },
        row: { line: 'solid', c: '#38383c' },
        scene: { line: 'solid', c: '#38383c' },
        chip: { r: 6 },
    },
    'western-classic': {
        ring: 'inset 0 0 0 1px #b8903f, 0 0 0 3px #121212, 0 0 0 4px #46433a',
        row: { line: 'fade', c: '#46433a', m: { svg: M.diamondFill('#b8903f'), w: 8, h: 8 }, gap: 8 },
        scene: { line: 'fade', c: '#46433a', m: { svg: M.diamond('#b8903f'), w: 10, h: 10 } },
        chip: { r: 2, ink: '#d9b061' },
    },
    'elegant-european': {
        ring: 'inset 0 0 0 1px #8a7db8',
        r: 16,
        row: { line: 'fade', c: '#4a4868', m: { svg: M.ring('#8a7db8'), w: 9, h: 9 }, gap: 8 },
        scene: { line: 'fade', c: '#4a4868', m: { svg: M.ring('#8a7db8'), w: 9, h: 9 } },
        chip: { r: 99, bg: '#363350', ink: '#c3b4e6' },
    },
    'magic-academy': MAGIC_LOG,
    'magic-academy-obsidian': MAGIC_LOG,
    'mermaid-deep': {
        ring: 'inset 0 0 0 1px #5b86c0',
        r: 12,
        row: { line: 'fade', c: '#27456f', m: { svg: M.pearl('#c8dcf6'), w: 9, h: 9 }, gap: 8 },
        scene: { line: 'fade', c: '#27456f', m: { svg: M.pearl('#c8dcf6'), w: 9, h: 9 } },
        chip: { r: 99, bg: '#1b3558', ink: '#b6cdf4' },
    },
};
Object.assign(SPECS, {
    'retro-japanese': {
        ring: 'inset 0 0 0 1px #8a6a50, 0 0 0 3px #f1e6d2, 0 0 0 4px #c9b595',
        r: 3,
        row: { line: 'double', c: '#cdbd9f' },
        scene: { line: 'double', c: '#cdbd9f', w: 40 },
        chip: { r: 2, bg: '#efe2c8', ink: '#b8432f' },
    },
    'qinglv-shanshui': {
        ring: 'inset 0 0 0 1px #5f8f86',
        r: 0,
        row: { line: 'fade', c: '#c3cdbf', m: { svg: M.peaks('#5f8f86'), w: 20, h: 10 }, gap: 8 },
        scene: { line: 'fade', c: '#c3cdbf', m: { svg: M.peaks('#5f8f86'), w: 18, h: 9 } },
        chip: { r: 2, bg: '#d3ddd0', ink: '#3f6b6a' },
    },
    'xianxia-ink': {
        ring: 'inset 0 0 0 1px #5a5a56',
        r: 0,
        orn: { svg: M.seal('#b8432f'), w: 8, h: 8, at: 'right:-3px;bottom:-3px' },
        name: { ul: { bg: 'linear-gradient(90deg,#7fa8b0,transparent)', h: 1 }, ulPad: 4 },
        row: { lens: true, c: '#3e3d3a' },
        scene: { line: 'fade', c: '#4a4946' },
        chip: { r: 2, bg: '#2a2a29', ink: '#9fc0c8' },
    },
    'wuxia-ink': {
        ring: 'inset 0 0 0 1px #6a6862',
        r: 2,
        row: { line: 'fade', c: '#3a3935', m: { svg: M.moon('#ece7dd'), w: 10, h: 10 }, gap: 8 },
        scene: { line: 'fade', c: '#4a4944', m: { svg: M.moon('#ece7dd'), w: 10, h: 10 } },
        chip: { r: 99, bg: '#2c2c2b', ink: '#ece7dd' },
    },
    'adventure-journey': {
        ring: 'inset 0 0 0 1px #a08a62, 0 0 0 3px #e9dfc7, 0 0 0 4px #c9b890',
        r: 5,
        row: { line: 'dots', c: '#b3a27c' },
        scene: { line: 'dots', c: '#b3a27c', w: 44, m: { svg: M.cross('#9a6a2c'), w: 11, h: 11 } },
        chip: { r: 4, bg: '#d6c9a8', ink: '#6c4a22' },
    },
    'plant-coffee': {
        ring: 'inset 0 0 0 1px #9aa87a',
        r: 16,
        orn: { svg: M.leaf('#7f8a55'), w: 15, h: 15, at: 'left:-5px;top:-5px', rot: -12 },
        name: { ul: { bg: '#9aa87a', w: '18px', h: 2 }, ulPad: 3 },
        row: { line: 'fade', c: '#d6cab4' },
        scene: { line: 'fade', c: '#d6cab4', m: { svg: M.leaf('#7f8a55'), w: 11, h: 11 } },
        chip: { r: 99, bg: '#e1e4cf', ink: '#6a7543' },
    },
    'warm-picturebook': {
        ring: 'inset 0 0 0 1.5px #4f4a45',
        r: 12,
        row: { line: 'dash', c: '#d9c49f' },
        scene: { line: 'dash', c: '#d9c49f', w: 44 },
        chip: { r: 8, bg: '#f4dfb8', ink: '#4f4a45' },
    },
    'fairy-tale': {
        ring: 'inset 0 0 0 1.5px #e9a597, 0 0 0 3px #f6f1e2, 0 0 0 4px #e0d8c0',
        r: 14,
        row: { line: 'fade', c: '#e0d8c0', m: { svg: M.bunting('#e9a597', '#a9c07a', '#f0d77f'), w: 33, h: 10 }, gap: 8 },
        scene: { line: 'fade', span: 64, c: '#e0d8c0', m: { svg: M.bunting('#e9a597', '#a9c07a', '#f0d77f'), w: 33, h: 10 } },
        chip: { r: 99, bg: '#f2dfd3', ink: '#a8503f' },
    },
});
const BR = (c) => ['0 0', '100% 0', '0 100%', '100% 100%'].map((p, i) => (i % 2 ? [`linear-gradient(${c},${c}) ${p}/7px 1px no-repeat`, `linear-gradient(${c},${c}) ${p}/1px 7px no-repeat`] : [`linear-gradient(${c},${c}) ${p}/7px 1px no-repeat`, `linear-gradient(${c},${c}) ${p}/1px 7px no-repeat`])).flat().join(',');
const RV = (c) => ['2px 2px', 'calc(100% - 2px) 2px', '2px calc(100% - 2px)', 'calc(100% - 2px) calc(100% - 2px)'].map((p) => `radial-gradient(circle at ${p},${c} 0 1.4px,transparent 1.6px)`).join(',');
Object.assign(SPECS, {
    'day-minimal': {
        ring: 'inset 0 0 0 1px #cfd5df',
        r: 12,
        row: { line: 'solid', c: '#e1e4ea' },
        scene: { line: 'solid', c: '#e1e4ea' },
        chip: { r: 99, bg: '#e3e8ef', ink: '#5a6a80' },
    },
    'black-white-manga': {
        ring: 'inset 0 0 0 2px #231f1c',
        r: 0,
        name: { ul: { bg: '#231f1c', h: 3 }, ulPad: 3 },
        row: { line: 'fade', c: '#231f1c', m: { svg: M.halftone('#231f1c'), w: 44, h: 12 }, gap: 6 },
        scene: { line: 'fade', span: 64, c: '#231f1c', m: { svg: M.halftone('#231f1c'), w: 44, h: 12 } },
        chip: { r: 0, bg: '#231f1c', ink: '#ffffff', clip: 'polygon(7% 0,100% 0,93% 100%,0 100%)', px: 12 },
    },
    'cute-pink': {
        ring: 'inset 0 0 0 1.5px #f4a3c0, 0 0 0 2px #fff0f5, 0 0 0 3.5px #f7c2d5',
        r: 14,
        row: { line: 'dots', c: '#f1b3c8', m: { svg: M.heart('#f4a3c0'), w: 11, h: 11 }, gap: 8 },
        scene: { line: 'dots', c: '#f1b3c8', w: 40, m: { svg: M.heart('#f4a3c0'), w: 11, h: 11 } },
        chip: { r: 99, bg: '#ffd9e6', ink: '#c65f86' },
    },
    'horror-psych': {
        ring: 'inset 0 0 0 1px #b9a3bd',
        r: 0,
        row: { line: 'stitch', c: '#c9b3c9' },
        scene: { line: 'stitch', c: '#c9b3c9', w: 44 },
        chip: { r: 0, bg: '#eadbe6', ink: '#7a5fb0' },
    },
    'horror-gore': {
        ring: 'inset 0 0 0 1px #6b1218',
        r: 0,
        orn: { svg: M.drop('#c4101c'), w: 9, h: 11, at: 'left:3px;bottom:-5px' },
        name: { plate: { r: 0, bg: '#000000', px: 6 } },
        row: { line: 'fade', c: '#4a1a1c', m: { svg: M.drop('#c4101c'), w: 8, h: 10 }, gap: 8 },
        scene: { line: 'fade', c: '#4a1a1c', m: { svg: M.drop('#c4101c'), w: 8, h: 10 } },
        chip: { r: 0, bg: '#8a0f18', ink: '#f3ece4' },
    },
    'scifi-holo': {
        ring: 'inset 0 0 0 1px #1f4a66',
        r: 2,
        orn: { css: `inset:-3px;background:${BR('#78e8ff')};` },
        row: { line: 'fade', c: '#1d3a58', m: { svg: M.barH('#78e8ff'), w: 18, h: 6 }, gap: 6 },
        scene: { line: 'fade', c: '#1d3a58', m: { svg: M.barH('#78e8ff'), w: 18, h: 6 } },
        chip: { r: 0, bg: '#143049', ink: '#8fdcf0', clip: 'polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)' },
    },
    'wasteland-rust': {
        ring: 'inset 0 0 0 1px #6a6a6c, 0 0 0 3px #1c1c1e, 0 0 0 4px #4a4a4c',
        r: 2,
        orn: { css: `inset:0;background:${RV('#b7b2a6')};` },
        row: { line: 'dash', c: '#4a4a4c' },
        scene: { line: 'dash', c: '#4a4a4c', w: 44 },
        chip: { r: 2, bg: '#38383a', ink: '#e3ae2f' },
    },
});


// ---- 规格转 CSS ----

const posOf = (side) => (side === 'l' ? '0' : '100%');

// 一段线：side 为线所在的一侧（l 左，r 右），w 为线长表达式。返回高度与背景层。
function lineLayers(kind, c, side, w = '100%') {
    const x = posOf(side);
    switch (kind) {
    case 'solid': return { h: 1, list: [`linear-gradient(${c},${c}) ${x} 50%/${w} 1px no-repeat`] };
    case 'double': return { h: 5, list: [`linear-gradient(${c},${c}) ${x} 0/${w} 1px no-repeat`, `linear-gradient(${c},${c}) ${x} 4px/${w} 1px no-repeat`] };
    case 'dots': return { h: 3, list: [`radial-gradient(circle,${c} 1px,transparent 1.4px) 0 50%/7px 3px repeat-x`] };
    case 'dash': return { h: 1, list: [`repeating-linear-gradient(90deg,${c} 0 5px,transparent 5px 9px) ${x} 50%/${w} 1px no-repeat`] };
    case 'stitch': return { h: 1, list: [`repeating-linear-gradient(90deg,${c} 0 3px,transparent 3px 7px) ${x} 50%/${w} 1px no-repeat`] };
    default: return { h: 1, list: [`linear-gradient(90deg,${side === 'l' ? `transparent,${c}` : `${c},transparent`}) ${x} 50%/${w} 1px no-repeat`] };
    }
}

// 行间分割线（替换原来的虚线）。
function rowCss(S, r) {
    const sel = `${S} .igs-log-row+.igs-log-row::before`;
    if (r.lens) return `${sel}{border-top:0;left:12%;right:12%;height:2px;background:${r.c};clip-path:ellipse(50% 50% at 50% 50%);}`;
    if (!r.m) {
        const L = lineLayers(r.line, r.c, 'l');
        return `${sel}{border-top:0;height:${L.h}px;background:${L.list.join(',')};}`;
    }
    const gap = r.gap ?? 6;
    const w = `calc(50% - ${r.m.w / 2 + gap}px)`;
    const L = lineLayers(r.line, r.c, 'l', w);
    const R = lineLayers(r.line, r.c, 'r', w);
    return `${sel}{border-top:0;top:-${Math.round(r.m.h / 2)}px;height:${r.m.h}px;background:${[`${asUrl(r.m.svg)} 50% 50%/${r.m.w}px ${r.m.h}px no-repeat`, ...L.list, ...R.list].join(',')};}`;
}

// 换场景分割线：文字两侧各一段线，靠文字一端可带小图形。
function sceneCss(S, s) {
    const sel = `${S} .igs-log-scene::`;
    if (!s.m) {
        const L = lineLayers(s.line, s.c, 'l');
        const R = lineLayers(s.line, s.c, 'r');
        return `${sel}before,${sel}after{border-top:0;width:${s.w || 46}px;height:${L.h}px;}\n${sel}before{background:${L.list.join(',')};}\n${sel}after{background:${R.list.join(',')};}`;
    }
    const wd = s.span || 46 + s.m.w;
    const lw = `calc(100% - ${s.m.w + 5}px)`;
    if (s.tint) {
        const m = asUrl(s.m.svg);
        const mask = (side, at) => [`${m} ${at} 50%/${s.m.w}px ${s.m.h}px no-repeat`, ...lineLayers('fade', '#000', side, lw).list].join(',');
        return `${sel}before,${sel}after{border-top:0;width:${wd}px;height:${s.m.h}px;background:${s.tint};}\n${sel}before{-webkit-mask:${mask('l', '100%')};mask:${mask('l', '100%')};}\n${sel}after{-webkit-mask:${mask('r', '0')};mask:${mask('r', '0')};}`;
    }
    const L = lineLayers(s.line, s.c, 'l', lw);
    const R = lineLayers(s.line, s.c, 'r', lw);
    const m = asUrl(s.m.svg);
    return `${sel}before,${sel}after{border-top:0;width:${wd}px;height:${s.m.h}px;}\n${sel}before{background:${[`${m} 100% 50%/${s.m.w}px ${s.m.h}px no-repeat`, ...L.list].join(',')};}\n${sel}after{background:${[`${m} 0 50%/${s.m.w}px ${s.m.h}px no-repeat`, ...R.list].join(',')};}`;
}

const maskBox = (svg, w, h) => `background:${asUrl(svg)} center/contain no-repeat;width:${w}px;height:${h}px;`;

// 头像角饰：贴在头像一角，破框时不画（破框的 ::after 已被框线占用）。
function ornCss(S, o) {
    const sel = `${S}:not([data-shape="break"]) .igs-log-av:not(.is-letter)::after`;
    if (o.css) return `${sel}{content:"";position:absolute;pointer-events:none;z-index:2;${o.css}}`;
    return `${sel}{content:"";position:absolute;pointer-events:none;z-index:2;${o.at};${maskBox(o.svg, o.w, o.h)}${o.rot ? `transform:rotate(${o.rot}deg);` : ''}}`;
}

// 姓名牌：小图形、下划线、尾线、底板，都只加在名字 b 元素上，不盖住名字。
function nameCss(S, n) {
    const out = [];
    const b = `${S} .igs-log-name>b`;
    if (n.ul) out.push(`${b}{padding-bottom:${n.ulPad ?? 3}px;background:${n.ul.bg} 0 100%/${n.ul.w || '100%'} ${n.ul.h}px no-repeat;}`);
    if (n.tail) out.push(`${b}::after{content:"";display:inline-block;width:${n.tail.w}px;height:1px;margin-left:8px;vertical-align:middle;background:linear-gradient(90deg,${n.tail.c},${n.tail.to || 'transparent'});}`);
    if (n.plate) out.push(`${b}{padding:1px ${n.plate.px ?? 8}px;border-radius:${n.plate.r}px;background:${n.plate.bg};}`);
    return out.join('\n');
}

// 情绪胶囊：圆角、底色、字色、切角、前置小图形。
function chipCss(S, c) {
    const out = [];
    const rules = [];
    if (c.r !== undefined) rules.push(`border-radius:${c.r}px`);
    if (c.bg) rules.push(`background:${c.bg}`);
    if (c.ink) rules.push(`color:${c.ink}`);
    if (c.clip) rules.push(`clip-path:${c.clip}`);
    if (c.px) rules.push(`padding:0 calc(${c.px}px * var(--igs-log-mk))`);
    if (rules.length) out.push(`${S} .igs-log-chip{${rules.join(';')};}`);
    if (c.m) out.push(`${S} .igs-log-chip::before{content:"";flex:none;width:calc(${c.m.s}px * var(--igs-log-mk));height:calc(${c.m.s}px * var(--igs-log-mk));margin-right:calc(4px * var(--igs-log-mk));background:${asUrl(c.m.svg)} center/contain no-repeat;}`);
    return out.join('\n');
}


let cache = '';
export function logPartsStyleText() {
    if (cache) return cache;
    const out = [];
    for (const [id, s] of Object.entries(SPECS)) {
        const S = `#igs-overlay[data-igs-log-skin="${id}"] #igs-log`;
        const parts = [];
        parts.push(`${S} .igs-log-av:not(.is-letter),${S} .igs-log-av.is-letter{box-shadow:${s.ring};}`);
        parts.push(`${S}[data-shape="break"] .igs-log-av:not(.is-letter){box-shadow:none;}`);
        if (s.r !== undefined) parts.push(`${S}:not([data-shape]) .igs-log-av,${S}[data-shape="card"] .igs-log-av{border-radius:${s.r}px;}`);
        if (s.orn) parts.push(ornCss(S, s.orn));
        if (s.name) parts.push(nameCss(S, s.name));
        parts.push(rowCss(S, s.row));
        parts.push(sceneCss(S, s.scene));
        if (s.chip) parts.push(chipCss(S, s.chip));
        if (s.card) parts.push(`${S} .igs-log-card{background:${s.card};}`);
        out.push(parts.filter(Boolean).join('\n'));
    }
    cache = out.join('\n');
    return cache;
}
