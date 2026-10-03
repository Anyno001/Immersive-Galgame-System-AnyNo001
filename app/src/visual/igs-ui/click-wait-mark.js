export const CLICK_WAIT_MARK_GLYPHS = Object.freeze([
    'auto', 'diamond', 'fleuron', 'sparkle', 'triangle', 'chevron', 'leaf', 'star', 'caret', 'heart',
]);

export const CLICK_WAIT_MARK_LABELS = Object.freeze({
    auto: '跟随对话框主题',
    diamond: '柔光菱形',
    fleuron: '金色笔尖',
    sparkle: '四芒星',
    triangle: '倒三角',
    chevron: '罗盘箭头',
    leaf: '小叶片',
    star: '圆角星',
    caret: '细折角',
    heart: '心跳爱心',
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
    seal: "<rect x='6.5' y='6.5' width='11' height='11' rx='1.4'/>",
    heart: "<path d='M12 20.5C5.5 16 2.5 12.4 2.5 8.6C2.5 5.8 4.7 3.8 7.3 3.8C9.3 3.8 10.9 4.9 12 6.6C13.1 4.9 14.7 3.8 16.7 3.8C19.3 3.8 21.5 5.8 21.5 8.6C21.5 12.4 18.5 16 12 20.5Z'/>",
});

function shapeUrl(shape) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>${SHAPES[shape]}</svg>`;
    return `url("data:image/svg+xml,${svg.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

const ANIMATIONS = Object.freeze({
    breathe: { keyframes: '0%,100%{transform:scale(.8);opacity:.55;}50%{transform:scale(1.06);opacity:1;}', timing: '1.6s ease-in-out infinite', origin: '50% 50%' },
    bob: { keyframes: '0%,100%{transform:translateY(-1px) rotate(-6deg);}50%{transform:translateY(2.5px) rotate(4deg);}', timing: '2s ease-in-out infinite', origin: '50% 10%' },
    twinkle: { keyframes: '0%{transform:rotate(0) scale(.7);opacity:.6;}50%{transform:rotate(45deg) scale(1.08);opacity:1;}100%{transform:rotate(90deg) scale(.7);opacity:.6;}', timing: '2.4s ease-in-out infinite', origin: '50% 50%' },
    bounce: { keyframes: '0%,100%{transform:translateY(-1.5px);}50%{transform:translateY(3px);}', timing: '1.6s cubic-bezier(.45,0,.55,1) infinite', origin: '50% 50%' },
    'bounce-slow': { keyframes: '0%,100%{transform:translateY(-1px);}45%{transform:translateY(3px);}60%{transform:translateY(2.4px);}', timing: '2.4s cubic-bezier(.45,0,.55,1) infinite', origin: '50% 50%' },
    'bounce-steps': { keyframes: '0%{transform:translateY(0);}25%{transform:translateY(-4px);}50%{transform:translateY(0);}75%{transform:translateY(1.5px) scale(1.12,.86);}', timing: '.9s steps(1,end) infinite', origin: '50% 100%' },
    nudge: { keyframes: '0%,100%{transform:translateX(-1px);}50%{transform:translateX(4px);}', timing: '1.3s ease-in-out infinite', origin: '50% 50%' },
    sway: { keyframes: '0%,100%{transform:rotate(-12deg);}50%{transform:rotate(10deg);}', timing: '2.6s ease-in-out infinite', origin: '12% 88%' },
    hop: { keyframes: '0%,100%{transform:translateY(0) scale(1.12,.86);}12%{transform:translateY(0) scale(1);}35%{transform:translateY(-6px) scale(.92,1.08);}55%{transform:translateY(-6px) scale(1);}80%{transform:translateY(0) scale(.96,1.04);}90%{transform:translateY(0) scale(1.14,.84);}', timing: '1.2s ease-in-out infinite', origin: '50% 100%' },
    fade: { keyframes: '0%,100%{transform:translateY(-1px);opacity:.2;}50%{transform:translateY(1.5px);opacity:1;}', timing: '1.4s ease-in-out infinite', origin: '50% 50%' },
    heartbeat: { keyframes: '0%,100%{transform:scale(1);}14%{transform:scale(1.22);}28%{transform:scale(1);}42%{transform:scale(1.16);}70%{transform:scale(1);}', timing: '1.3s ease-in-out infinite', origin: '50% 55%' },
    'veil-breathe': { keyframes: '0%,100%{transform:translateY(0);opacity:.35;}50%{transform:translateY(2px);opacity:1;}', timing: '2.4s ease-in-out infinite', origin: '50% 50%' },
});

const GLYPH_MARKS = Object.freeze({
    diamond: { shape: 'diamond', animation: 'breathe' },
    fleuron: { shape: 'fleuron', animation: 'bob' },
    sparkle: { shape: 'sparkle', animation: 'twinkle' },
    triangle: { shape: 'triangle', animation: 'bounce' },
    chevron: { shape: 'chevron', animation: 'nudge' },
    leaf: { shape: 'leaf', animation: 'sway' },
    star: { shape: 'star', animation: 'hop' },
    caret: { shape: 'caret', animation: 'fade' },
    heart: { shape: 'heart', animation: 'heartbeat' },
});

export const CLICK_WAIT_MARK_SKINS = Object.freeze({
    default: { shape: 'diamond', animation: 'breathe', color: 'rgba(236,230,218,.95)' },
    'western-classic': { shape: 'fleuron', animation: 'bob', color: '#e2bd6b' },
    'elegant-european': { shape: 'sparkle', animation: 'twinkle', color: '#dccff7' },
    'magic-academy': { shape: 'sparkle', animation: 'twinkle', color: '#f0cf78' },
    'fairy-tale': { shape: 'sparkle', animation: 'twinkle', color: '#c8973c' },
    'qinglv-shanshui': { shape: 'seal', animation: 'breathe', color: '#b23a2a' },
    'retro-japanese': { shape: 'triangle-brush', animation: 'bounce-slow', color: '#c23a24' },
    'adventure-journey': { shape: 'chevron', animation: 'nudge', color: '#9a6a2c' },
    'plant-coffee': { shape: 'leaf', animation: 'sway', color: '#6f8446' },
    'warm-picturebook': { shape: 'star', animation: 'hop', color: '#4f9a92' },
    'day-minimal': { shape: 'caret', animation: 'fade', color: '#b0503f' },
    'black-white-manga': { shape: 'triangle', animation: 'bounce-steps', color: '#161616' },
    'cute-pink': { shape: 'heart', animation: 'heartbeat', color: '#e5608c' },
    'gradient-veil': { shape: 'triangle-hollow', animation: 'veil-breathe', color: 'rgba(255,255,255,.92)' },
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

// 两个属性选择器的特异性高于皮肤规则，用户选定的形状总是覆盖皮肤映射，颜色仍跟随皮肤。
const GLYPH_RULES = Object.entries(GLYPH_MARKS)
    .map(([glyph, mark]) => `#igs-overlay[data-igs-click-wait="on"][data-igs-click-wait-glyph="${glyph}"]{${markVars(mark)}}`)
    .join('\n');

export const CLICK_WAIT_MARK_STYLE_TEXT = `
${KEYFRAMES}
@keyframes igs-cw-in{0%{opacity:0;}100%{opacity:1;}}
${SKIN_RULES}
${GLYPH_RULES}
#igs-overlay[data-igs-click-wait="on"] #igs-text::after{content:"";display:inline-block;width:.9em;height:.9em;margin-left:.25em;vertical-align:middle;pointer-events:none;background-color:var(--igs-cw-color,currentColor);-webkit-mask:var(--igs-cw-mask) center/contain no-repeat;mask:var(--igs-cw-mask) center/contain no-repeat;transform-origin:var(--igs-cw-origin,50% 50%);animation:var(--igs-cw-anim),igs-cw-in .35s ease-out backwards;}
#igs-overlay[data-igs-click-wait="on"] #igs-text[data-igs-typewriter="running"]::after{opacity:0;animation:none;}
@media (prefers-reduced-motion: reduce){
#igs-overlay[data-igs-click-wait="on"] #igs-text::after{animation:none!important;}
}
`;
