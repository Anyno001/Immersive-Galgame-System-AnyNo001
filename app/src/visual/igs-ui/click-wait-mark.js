// 每个皮肤都有一枚专属符号（见 CLICK_WAIT_MARK_SKINS）；这些符号也都能在选择器里单独选用。
export const CLICK_WAIT_MARK_GLYPHS = Object.freeze([
    'auto', 'diamond', 'fleuron', 'pendant', 'crescent', 'sparkle', 'strawberry', 'seal', 'triangle-brush',
    'compass', 'chevron', 'leaf', 'star', 'caret', 'triangle', 'heart', 'triangle-hollow', 'blood-drop', 'ribbon', 'eye',
]);

export const CLICK_WAIT_MARK_LABELS = Object.freeze({
    auto: '跟随皮肤',
    diamond: '柔光菱形',
    fleuron: '金色笔尖',
    pendant: '珍珠垂坠',
    crescent: '星月',
    sparkle: '四芒星',
    strawberry: '草莓',
    seal: '朱砂小印',
    'triangle-brush': '笔触三角',
    compass: '指南针',
    chevron: '罗盘箭头',
    leaf: '小叶片',
    star: '圆角星',
    caret: '细折角',
    triangle: '倒三角',
    heart: '爱心',
    'triangle-hollow': '空心三角',
    'blood-drop': '血滴',
    ribbon: '蝴蝶结',
    eye: '眼睛',
});

export const CLICK_WAIT_MARK_STYLES = Object.freeze(
    CLICK_WAIT_MARK_GLYPHS.map(id => Object.freeze({ id, label: CLICK_WAIT_MARK_LABELS[id] })),
);

export const CLICK_WAIT_MARK_DEFAULTS = Object.freeze({ enabled: false, glyph: 'auto' });

export function normalizeClickWaitMarkSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        enabled: source.enabled === true,
        glyph: CLICK_WAIT_MARK_GLYPHS.includes(source.glyph) ? source.glyph : CLICK_WAIT_MARK_DEFAULTS.glyph,
    };
}

function syncAttribute(root, name, value) {
    const current = typeof root.getAttribute === 'function' ? root.getAttribute(name) : undefined;
    if (value === null) {
        if (current === null) return;
        if (typeof root.removeAttribute === 'function') root.removeAttribute(name);
        return;
    }
    if (current === value) return;
    if (typeof root.setAttribute === 'function') root.setAttribute(name, value);
}

export function applyClickWaitMark(root, settings) {
    if (!root) return;
    const { enabled, glyph } = normalizeClickWaitMarkSettings(settings);
    syncAttribute(root, 'data-igs-click-wait', enabled ? 'on' : null);
    syncAttribute(root, 'data-igs-click-wait-glyph', enabled && glyph !== 'auto' ? glyph : null);
}

// 所有形状都画在 24×24 画布上，只作遮罩用：颜色由 background-color 决定。
const SHAPES = Object.freeze({
    diamond: "<path d='M12 4.2L18.4 12L12 19.8L5.6 12Z' stroke='#000' stroke-width='2.2' stroke-linejoin='round'/>",
    fleuron: "<path fill-rule='evenodd' d='M12 22.2L6.6 12.6C6.4 8.4 8.4 5 12 1.8C15.6 5 17.6 8.4 17.4 12.6ZM13.5 10.6A1.5 1.5 0 1 0 10.5 10.6A1.5 1.5 0 1 0 13.5 10.6ZM11.55 12.3H12.45V19.4H11.55Z'/>",
    sparkle: "<path d='M12 1.5C12.7 8.1 15.9 11.3 22.5 12C15.9 12.7 12.7 15.9 12 22.5C11.3 15.9 8.1 12.7 1.5 12C8.1 11.3 11.3 8.1 12 1.5Z'/>",
    triangle: "<path d='M4.5 7H19.5L12 19Z' stroke='#000' stroke-width='2.4' stroke-linejoin='round'/>",
    'triangle-brush': "<path d='M3.4 6.1C8.3 5.2 15 5 20.6 6.3C18.1 10.4 15 15 12.4 19.7C12.1 20.2 11.6 20.1 11.4 19.6C9.3 15.1 6.6 10.5 3.4 6.1Z'/><circle cx='21.6' cy='5.2' r='1'/>",
    'triangle-hollow': "<path d='M5 7.5H19L12 18.5Z' fill='none' stroke='#000' stroke-width='1.6' stroke-linejoin='round'/>",
    chevron: "<path d='M22 12L8.2 5.4L11.2 12L8.2 18.6Z'/><circle cx='4.2' cy='12' r='1.7'/>",
    leaf: "<path fill-rule='evenodd' d='M4.5 19.5C4.5 10.6 10.6 4.2 20.2 3.8C20.2 13.6 13.6 19.5 4.5 19.5ZM6.2 18.4Q11.6 12.4 17.6 6.4Q12.4 13.2 6.8 19Z'/><path d='M2.8 21.2L6.4 17.6' stroke='#000' stroke-width='1.6' stroke-linecap='round'/>",
    star: "<path d='M12 4.2L14.29 9.64L20.18 10.14L15.71 14.01L17.05 19.76L12 16.7L6.95 19.76L8.29 14.01L3.82 10.14L9.71 9.64Z' stroke='#000' stroke-width='2.4' stroke-linejoin='round'/>",
    caret: "<path d='M6 9.2L12 15.2L18 9.2' fill='none' stroke='#000' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/>",
    // 优雅欧式：小吊环下垂一滴珍珠。
    pendant: "<path fill-rule='evenodd' d='M12 2.2A2.3 2.3 0 1 0 12 6.8A2.3 2.3 0 1 0 12 2.2ZM12 3.4A1.1 1.1 0 1 1 12 5.6A1.1 1.1 0 1 1 12 3.4Z'/><path d='M12 8C14.6 11.4 17 13.9 17 16.8A5 5 0 0 1 7 16.8C7 13.9 9.4 11.4 12 8Z'/>",
    // 魔法星夜：一弯新月伴一颗小星。
    crescent: "<path d='M14.6 3.6A8.6 8.6 0 1 0 20.6 16.4A6.8 6.8 0 0 1 14.6 3.6Z'/><path d='M19.4 3.2Q19.8 6.2 22.6 6.6Q19.8 7 19.4 10Q19 7 16.2 6.6Q19 6.2 19.4 3.2Z'/>",
    // 冒险旅途：朝下的罗盘指针，顶上一颗铆钉。
    compass: "<path d='M12 22.2L6.6 9.4L12 12.2L17.4 9.4Z'/><circle cx='12' cy='4.6' r='2'/>",
    seal: "<rect x='6.5' y='6.5' width='11' height='11' rx='1.4'/>",
    // 童话小镇的草莓：籽镂空（evenodd），单色遮罩下也认得出。
    strawberry: "<path fill-rule='evenodd' d='M12 6.5C17.5 6.5 20 10 18.6 14.8C17.4 18.8 14 21.6 12 22.5C10 21.6 6.6 18.8 5.4 14.8C4 10 6.5 6.5 12 6.5ZM8.6 11.5a.75 1.05 0 1 0 1.5 0a.75 1.05 0 1 0-1.5 0ZM14 11.5a.75 1.05 0 1 0 1.5 0a.75 1.05 0 1 0-1.5 0ZM11.25 14.4a.75 1.05 0 1 0 1.5 0a.75 1.05 0 1 0-1.5 0ZM9.1 17.2a.7 1 0 1 0 1.4 0a.7 1 0 1 0-1.4 0ZM13.5 17.2a.7 1 0 1 0 1.4 0a.7 1 0 1 0-1.4 0Z'/><path d='M6.6 6.6L10.2 6.4L12 2.2L13.8 6.4L17.4 6.6L14.4 8.6H9.6Z'/>",
    // 血色噩梦：一颗血滴；心理恐怖平时是蝴蝶结，崩坏后换成一只眼（瞳孔镂空）。
    ribbon: "<path d='M12 10.5C9.5 7 5.5 5 3.5 6.5C2 7.6 2.4 12.4 4 13.6C6 15 9.6 13.4 12 11.5ZM12 10.5C14.5 7 18.5 5 20.5 6.5C22 7.6 21.6 12.4 20 13.6C18 15 14.4 13.4 12 11.5Z'/><circle cx='12' cy='11' r='2.3'/><path d='M10.8 12.5L8 19.5L10.2 18.6L11.2 20.6L12.4 13ZM13.2 12.5L16 19.5L13.8 18.6L12.8 20.6L11.6 13Z'/>",
    'blood-drop': "<path d='M12 2.5C15.5 8 18.5 11.6 18.5 15.4A6.5 6.5 0 0 1 5.5 15.4C5.5 11.6 8.5 8 12 2.5Z'/>",
    eye: "<path fill-rule='evenodd' d='M1.8 12C5 6.8 8.4 5 12 5S19 6.8 22.2 12C19 17.2 15.6 19 12 19S5 17.2 1.8 12ZM12 8.4A3.6 3.6 0 1 0 12 15.6A3.6 3.6 0 1 0 12 8.4Z'/><circle cx='12' cy='12' r='1.8'/>",
    heart: "<path d='M12 20.5C5.5 16 2.5 12.4 2.5 8.6C2.5 5.8 4.7 3.8 7.3 3.8C9.3 3.8 10.9 4.9 12 6.6C13.1 4.9 14.7 3.8 16.7 3.8C19.3 3.8 21.5 5.8 21.5 8.6C21.5 12.4 18.5 16 12 20.5Z'/>",
});

function shapeUrl(shape) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>${SHAPES[shape]}</svg>`;
    return `url("data:image/svg+xml,${svg.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

// 只做上下轻点，不左右摇摆、不旋转：tap 匀速上下，soft 带呼吸的明暗，hop 轻跳并在落地时略压扁，steps 是漫画的逐帧跳。
const ANIMATIONS = Object.freeze({
    tap: { keyframes: '0%,100%{transform:translateY(-1.5px);}50%{transform:translateY(2.5px);}', timing: '1.5s cubic-bezier(.45,0,.55,1) infinite', origin: '50% 50%' },
    'tap-soft': { keyframes: '0%,100%{transform:translateY(-1px);opacity:.45;}50%{transform:translateY(2px);opacity:1;}', timing: '1.8s ease-in-out infinite', origin: '50% 50%' },
    'tap-hop': { keyframes: '0%,100%{transform:translateY(0) scale(1.08,.92);}15%{transform:translateY(0) scale(1);}45%{transform:translateY(-4px);}75%{transform:translateY(0) scale(1);}', timing: '1.4s ease-in-out infinite', origin: '50% 100%' },
    'tap-steps': { keyframes: '0%{transform:translateY(0);}25%{transform:translateY(-4px);}50%{transform:translateY(0);}75%{transform:translateY(1.5px) scale(1.12,.86);}', timing: '.9s steps(1,end) infinite', origin: '50% 100%' },
});

const GLYPH_ANIMATIONS = Object.freeze({
    pendant: 'tap-soft', seal: 'tap-soft', caret: 'tap-soft', 'triangle-hollow': 'tap-soft', eye: 'tap-soft',
    strawberry: 'tap-hop', star: 'tap-hop', heart: 'tap-hop', ribbon: 'tap-hop',
});
const GLYPH_MARKS = Object.freeze(Object.fromEntries(CLICK_WAIT_MARK_GLYPHS.filter((id) => id !== 'auto')
    .map((id) => [id, { shape: id, animation: GLYPH_ANIMATIONS[id] || 'tap' }])));
const mark = (shape, color, animation) => ({ shape, color, animation: animation || GLYPH_MARKS[shape].animation });

export const CLICK_WAIT_MARK_SKINS = Object.freeze({
    default: mark('diamond', 'rgba(236,230,218,.95)'),
    'western-classic': mark('fleuron', '#e2bd6b'),
    'elegant-european': mark('pendant', '#dccff7'),
    'magic-academy': mark('crescent', '#f0cf78'),
    'fairy-tale': mark('strawberry', '#dc6a5c'),
    'qinglv-shanshui': mark('seal', '#b23a2a'),
    'retro-japanese': mark('triangle-brush', '#c23a24'),
    'adventure-journey': mark('compass', '#9a6a2c'),
    'plant-coffee': mark('leaf', '#6f8446'),
    'warm-picturebook': mark('star', '#4f9a92'),
    'day-minimal': mark('caret', '#b0503f'),
    'black-white-manga': mark('triangle', '#161616', 'tap-steps'),
    'cute-pink': mark('heart', '#e5608c'),
    'gradient-veil': mark('triangle-hollow', 'rgba(255,255,255,.92)'),
    'horror-gore': mark('blood-drop', '#d1121b'),
    'horror-psych': mark('ribbon', '#e0779d'),
});

function markVars(mark) {
    const animation = ANIMATIONS[mark.animation];
    return `--igs-cw-mask:${shapeUrl(mark.shape)};--igs-cw-anim:igs-cw-${mark.animation} ${animation.timing};--igs-cw-origin:${animation.origin};`;
}

const KEYFRAMES = Object.entries(ANIMATIONS)
    .map(([id, animation]) => `@keyframes igs-cw-${id}{${animation.keyframes}}`)
    .join('\n');

const SKIN_RULES = Object.entries(CLICK_WAIT_MARK_SKINS)
    .map(([skin, mark]) => {
        const selector = skin === 'default' ? '#igs-overlay' : `#igs-overlay[data-igs-dialog-skin="${skin}"]`;
        return `${selector}{${markVars(mark)}--igs-cw-color:${mark.color};}`;
    })
    .join('\n');

// 恐怖档位（horror-dread.js）：崩坏皮肤从 2 档起句末的蝴蝶结换成眼睛；血色 3 档底色转暗红，血滴改成骨白。
const DREAD_RULES = [
    `#igs-overlay[data-igs-dialog-skin="horror-psych"][data-igs-dread="2"]{${markVars(mark('eye', '#8f7a86'))}--igs-cw-color:#8f7a86;}`,
    `#igs-overlay[data-igs-dialog-skin="horror-psych"][data-igs-dread="3"]{${markVars(mark('eye', '#b3161b'))}--igs-cw-color:#b3161b;}`,
    '#igs-overlay[data-igs-dialog-skin="horror-gore"][data-igs-dread="3"]{--igs-cw-color:#f3ece4;}',
].join('\n');

// 两个属性选择器的特异性高于皮肤规则，用户选定的形状总是覆盖皮肤映射，颜色仍跟随皮肤。
const GLYPH_RULES = Object.entries(GLYPH_MARKS)
    .map(([glyph, mark]) => `#igs-overlay[data-igs-click-wait="on"][data-igs-click-wait-glyph="${glyph}"]{${markVars(mark)}}`)
    .join('\n');

export const CLICK_WAIT_MARK_STYLE_TEXT = `
${KEYFRAMES}
@keyframes igs-cw-in{0%{opacity:0;}100%{opacity:1;}}
${SKIN_RULES}
${DREAD_RULES}
${GLYPH_RULES}
#igs-overlay[data-igs-click-wait="on"] #igs-text::after{content:"";display:inline-block;width:.9em;height:.9em;margin-left:.25em;vertical-align:middle;pointer-events:none;background-color:var(--igs-cw-color,currentColor);-webkit-mask:var(--igs-cw-mask) center/contain no-repeat;mask:var(--igs-cw-mask) center/contain no-repeat;transform-origin:var(--igs-cw-origin,50% 50%);animation:var(--igs-cw-anim),igs-cw-in .35s ease-out backwards;}
#igs-overlay[data-igs-click-wait="on"] #igs-text[data-igs-typewriter="running"]::after{opacity:0;animation:none;}
@media (prefers-reduced-motion: reduce){
#igs-overlay[data-igs-click-wait="on"] #igs-text::after{animation:none!important;}
}
`;
