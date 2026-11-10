import { buildDialogFrameCss, scalePx } from './dialog-skin-frame.js';

// 血色·细流：对话框近似黑幕，血只出现在名牌左侧一处，是一条上粗下细、末端为细长水滴的暗红实色细流，
// 随 data-igs-dread 0–3 逐档变长（2 档起带旁支与窄湿亮边）。画面层只有冷偏色、暗角与颗粒，档位越高越明显。
// 血没有描边、发光和投影；画面随档位去色压暗偏冷（立绘红衣仍可辨），对话框是从近黑向上渐隐的黑幕。
export const DIALOG_SKIN_HORROR_GORE = 'horror-gore';

const INK = '#121214';
const INK_RAISED = '#1c1c1e';
const LINE = '#26272a';
const BONE = '#e4e1d9';
const DIM = '#8d8f93';
const OPTION_INK = '#a3a5a9';
const BLOOD = '#9c1b24';
const BLOOD_DEEP = '#6b1720';
const BLOOD_TEXT = '#c4747c';
const FONT_SERIF = '"Source Han Serif CN","Source Han Serif SC","Noto Serif SC",serif';

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const overlay = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_HORROR_GORE}"]`;
const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_HORROR_GORE}"]`;
const at = (level) => `#igs-overlay[data-igs-dread="${level}"] .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_HORROR_GORE}"]`;
const overlayAt = (level) => `${overlay}[data-igs-dread="${level}"]`;

// 细长水滴：窄而尖的泪滴形，用于名牌标记、战斗与标题的末尾记号；不再是旧版的正圆血珠。
export const HORROR_DROP_MASK = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 24"><path d="M6 1C6.5 7.5 10 12.5 10 17A4 4 0 0 1 2 17C2 12.5 5.5 7.5 6 1Z"/></svg>');

// 细流：固定种子生成，静态 SVG。宽度上粗下细，下段有一处略鼓的拉长水滴，再收成针尖；边缘带轻微不规则。
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const f2 = (n) => n.toFixed(2);
const poly = (left, right, fill) => `<path d="M${left.map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L')}L${[...right].reverse().map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L')}Z" fill="${fill}"/>`;
const FLOW_LENGTH = [0, 28, 60, 104];
const flowSvg = (level) => {
    const len = FLOW_LENGTH[level];
    const rand = rng(11 + level);
    const cx = 6;
    const width = (t) => {
        let w = 5.2 * (1 - t) ** 1.2 + 0.7;
        if (t < 0.08) w += 2.2 * (1 - t / 0.08);
        if (t > 0.78 && t < 0.97) w += 1.6 * Math.sin((Math.PI * (t - 0.78)) / 0.19);
        if (t >= 0.97) w *= (1 - t) / 0.03;
        return w;
    };
    const center = (y) => cx + 0.7 * Math.sin(y * 0.09 + 1.3) - Math.max(0, y / len - 0.5) * 1.1;
    const left = [];
    const right = [];
    for (let y = 0; y <= len; y += 3) {
        const t = y / len;
        const w = width(t);
        const k = 0.9 * (1 - t * 0.6);
        left.push([center(y) - w / 2 + (rand() - 0.5) * k, y]);
        right.push([center(y) + w / 2 + (rand() - 0.5) * k, y]);
    }
    left[0][1] += 1.8;
    right[0][1] += 0.4;
    left[1][1] += 0.5;
    left.push([center(len), len + 0.5]);
    const fill = `url(#igs-bl-${level})`;
    let body = poly(left, right, fill);
    if (level >= 2) {
        const reach = len * (level === 2 ? 0.4 : 0.55);
        const y0 = len * 0.22;
        const bl = [];
        const br = [];
        for (let k = 0; k <= 1.001; k += 0.08) {
            const y = y0 + k * reach;
            const w = 1.7 * (1 - k) ** 1.1 + (k < 0.97 ? 0.3 : 0);
            const x = center(y0) + 1.4 + 2.2 * k + (rand() - 0.5) * 0.4;
            bl.push([x - w / 2, y]);
            br.push([x + w / 2, y]);
        }
        body += poly(bl, br, fill);
        const hl = [];
        const hr = [];
        for (let y = len * 0.4; y <= len * 0.8; y += 3) {
            const w = width(y / len);
            hl.push([center(y) - w / 2 + 0.5, y]);
            hr.push([center(y) - w / 2 + 1.15, y]);
        }
        body += poly(hl, hr, '#a3252d');
    }
    const stops = '<stop offset="0" stop-color="#4f0f15"/><stop offset=".55" stop-color="#741820"/><stop offset="1" stop-color="#92212a"/>';
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 ${len + 4}" width="14" height="${len + 4}"><defs><linearGradient id="igs-bl-${level}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${len}">${stops}</linearGradient></defs>${body}</svg>`);
};
const FLOWS = [0, 1, 2, 3].map((level) => (level ? flowSvg(level) : ''));
const flowRule = (level) => scalePx(`${at(level)}[data-igs-has-speaker="1"]::before{display:block;width:14px;height:${FLOW_LENGTH[level] + 4}px;background:${FLOWS[level]} 0 0/14px ${FLOW_LENGTH[level] + 4}px no-repeat;}`);

// 画面层：只在 #igs-click-layer 的 ::before（冷偏色 + 暗角）与 ::after（静态噪点图）上做（挂 overlay 会盖住对话框），不碰背景与立绘的滤镜，不用 mix-blend-mode。
// 颗粒是一张预渲染的小图，2、3 档才用 steps() 低频换位，1 档静止，0 档不显示。
const NOISE = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .86 0 0 0 0 .9 0 0 0 0 .95 2.4 0 0 0 -.9"/></filter><rect width="160" height="160" filter="url(#n)"/></svg>');
// vig 暗角、tint 冷偏色、grain 颗粒、scan 扫描线；bg / spr 是背景与立绘滤镜，chroma 是立绘左缘的暗红错位（2 档起）。
const LEVEL_FX = Object.freeze([
    { vig: 0.6, tint: 0.06, grain: 0, scan: 0, bg: 'grayscale(.2) brightness(.9) contrast(1.05)', spr: 'saturate(.95) brightness(.95)', chroma: 0 },
    { vig: 0.7, tint: 0.1, grain: 0.08, scan: 0, bg: 'grayscale(.35) brightness(.72) contrast(1.1)', spr: 'hue-rotate(-6deg) saturate(.85) grayscale(.3) brightness(.82)', chroma: 0 },
    { vig: 0.86, tint: 0.16, grain: 0.14, scan: 0.4, bg: 'grayscale(.5) brightness(.6) contrast(1.15)', spr: 'hue-rotate(-8deg) saturate(.8) grayscale(.45) brightness(.76) contrast(1.1)', chroma: 3 },
    { vig: 0.94, tint: 0.18, grain: 0.2, scan: 0.55, bg: 'grayscale(.5) brightness(.52) contrast(1.2)', spr: 'hue-rotate(-8deg) saturate(.8) grayscale(.5) brightness(.72) contrast(1.15)', chroma: 5 },
]);
const SPRITES = ':is(#igs-sprite:not(.igs-sprite-editing),#igs-cast .igs-cast-sprite:not(.igs-cast-editing),.igs-sd-sprite-ghost)';
const filterPair = (value) => `filter:${value};-webkit-filter:${value};`;
const chromaOf = (n) => (n ? ` drop-shadow(-${n}px 0 0 rgba(156,27,36,${n > 3 ? 0.6 : 0.5}))` : '');
const PICTURE = [
    ...LEVEL_FX.flatMap((fx, n) => [
        `${overlayAt(n)}{--igs-bl-vig:${fx.vig};--igs-bl-tint:${fx.tint};--igs-bl-grain:${fx.grain};--igs-bl-scan:${fx.scan};}`,
        `${overlayAt(n)} #igs-bg{${filterPair(`brightness(var(--igs-bg-brightness,1)) var(--igs-grade-bg,) ${fx.bg}`)}}`,
        `${overlayAt(n)} #igs-bg-blur{${filterPair(`blur(40px) brightness(.5) var(--igs-grade-bg,) ${fx.bg}`)}}`,
        `${overlayAt(n)} ${SPRITES}{${filterPair(`var(--igs-sprite-dim,) var(--igs-grade-sprite,) var(--igs-sprite-enhance,) ${fx.spr}${chromaOf(fx.chroma)}`)}}`,
    ]),
    `${overlay} #igs-click-layer::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(180deg,rgba(0,0,0,calc(.34 * var(--igs-bl-scan))) 0 1px,rgba(0,0,0,0) 1px 3px),radial-gradient(ellipse 75% 70% at 50% 42%,rgba(9,9,11,0) 38%,rgba(9,9,11,var(--igs-bl-vig)) 100%),linear-gradient(rgba(27,36,48,var(--igs-bl-tint)),rgba(27,36,48,var(--igs-bl-tint)));}`,
    `${overlay} #igs-click-layer::after{content:"";position:absolute;inset:0;pointer-events:none;background:${NOISE} 0 0/160px 160px;opacity:var(--igs-bl-grain);}`,
    `${overlayAt(0)} #igs-click-layer::after{display:none;}`,
    `${overlayAt(2)} #igs-click-layer::after,${overlayAt(3)} #igs-click-layer::after{animation:igs-bl-grain 1.2s steps(1,end) infinite;}`,
    '@keyframes igs-bl-grain{0%{background-position:0 0;}25%{background-position:-47px 31px;}50%{background-position:63px -22px;}75%{background-position:-18px -57px;}}',
    `${overlay}[data-igs-paused] #igs-click-layer::after,${overlay}[data-igs-quality="low"] #igs-click-layer::after{animation:none;}`,
    `@media (prefers-reduced-motion: reduce){${overlay} #igs-click-layer::after{animation:none !important;}}`,
];

export const GORE_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_HORROR_GORE, {
        height: 200,
        text: { top: 52, speakerTop: 58, right: 90, bottom: 28, left: 74 },
        rise: 18,
        flush: true,
        frameCss: `isolation:isolate;background:none;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:74px;top:12px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 140px);height:30px;line-height:30px;padding:0;background:none;border:0;border-radius:0;box-shadow:none;color:${BONE};font-family:${FONT_SERIF};font-size:21px;font-weight:400;letter-spacing:.4em;text-shadow:none;`,
        textCss: 'letter-spacing:.08em;',
        mobilePlate: 1,
    }),
    // 细流（::before）放在负 z-index 里（frame 已 isolation），永远压在正文下面；只在有名牌时出现。
    scalePx(`${scope}::before{content:"";display:none;position:absolute;left:52px;top:0;z-index:-1;pointer-events:none;transform-origin:50% 0;}`),
    ...[1, 2, 3].map(flowRule),
    `${scope}[data-igs-has-speaker="1"]::before{animation:igs-bl-flow .9s cubic-bezier(.3,.7,.4,1) backwards;}`,
    '@keyframes igs-bl-flow{from{transform:scaleY(.15);}}',
    `${at(2)} .igs-text,${at(3)} .igs-text{text-shadow:-1px 0 rgba(156,27,36,.5);}`,
    `${scope}[data-igs-paused]::before{animation-play-state:paused;}`,
    `@media (prefers-reduced-motion: reduce){${scope}::before{animation:none !important;}}`,
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:30px;padding-right:22px;}${scope} .igs-speaker{left:30px;max-width:calc(100% - 60px);font-size:17px;letter-spacing:.3em;}${scope}::before{left:12px;}`)}}`,
    `${overlay} #igs-dialog-layer::before{content:"";position:absolute;left:0;right:0;bottom:0;height:56%;pointer-events:none;background:linear-gradient(to top,#0c0c0e 0,rgba(12,12,14,.95) 40%,rgba(12,12,14,0) 100%);}`,
    '@media (max-width:640px){' + `${overlay} #igs-dialog-layer::before{height:46%;}` + '}',
    ...PICTURE,
].join('\n');

const choice = `${overlay} .igs-option-bubble`;
export const GORE_CHOICE_STYLE = [
    `${choice}{box-sizing:border-box;min-height:44px;padding:10px 46px;border:0;border-top:1px solid ${LINE};border-radius:0;background:${INK};box-shadow:none;color:${OPTION_INK};font-family:${FONT_SERIF};letter-spacing:.08em;text-shadow:none;transition:color .18s;}`,
    `${choice}::before{content:"";position:absolute;left:20px;top:50%;width:5px;height:5px;margin-top:-2px;background:${BONE};opacity:0;transition:opacity .18s;}`,
    `${choice}:hover{color:${BONE};}`,
    `${choice}:hover::before{opacity:1;}`,
    `${choice}:active{transform:translateY(1px);}`,
    `@media (max-width:640px){${choice}{padding:10px 16px 10px 34px;}${choice}::before{left:14px;}}`,
].join('\n');

const panel = (alpha) => `background:rgba(18,18,20,${alpha});border:0;border-radius:0;box-shadow:inset 0 0 0 1px ${LINE};`;
export const GORE_HUD_THEME = Object.freeze({
    neutral: DIM,
    panel: panel('.9'),
    toast: `${panel('.94')}color:${BONE};text-shadow:none;`,
    ink: BONE,
    emotion: `padding:0 ${s(12)};border:0;border-radius:0;background:${BLOOD_DEEP};color:${BONE};font-weight:400;letter-spacing:.12em;text-shadow:none;`,
    avatar: `filter:${ring(INK, 2)};`,
    badge: `content:"";position:absolute;right:${s(-2)};bottom:${s(-4)};width:${s(6)};height:${s(12)};background:${BLOOD};-webkit-mask:${HORROR_DROP_MASK} center/contain no-repeat;mask:${HORROR_DROP_MASK} center/contain no-repeat;`,
    placeholder: `background:${INK};color:${BLOOD_TEXT};`,
    placeholderSvg: `fill:none;stroke:${BLOOD_TEXT};stroke-width:1.4;`,
    track: `height:${s(4)};border:0;border-radius:0;background:${LINE};`,
    fill: `background:${BLOOD} !important;border-radius:0;`,
    value: 'font-weight:400;',
});

// 其余注册表里登记成字面量的条目，在这里集中给出新值，供登记的人逐项替换（旧值见交付说明）。
export const GORE_REGISTRY_VALUES = Object.freeze({
    label: '血色',
    clickWaitMark: Object.freeze({ shape: 'triangle', color: '#8d8f93' }),
    chatPalette: Object.freeze({ shell: INK, head: '#0e0e10', headInk: BONE, frame: '#0e0e10', sub: DIM, left: BONE, right: BLOOD_TEXT, border: 'rgba(156,27,36,.45)' }),
    textFxVars: Object.freeze({ accent: BLOOD_TEXT, glow: 'rgba(0,0,0,.9)' }),
    typography: Object.freeze({
        nameAlign: 'left',
        nameFont: FONT_SERIF,
        textFont: FONT_SERIF,
        thoughtFont: FONT_SERIF,
        narrationFont: FONT_SERIF,
        nameColor: BONE,
        textColor: BONE,
        thoughtColor: BLOOD_TEXT,
        narrationColor: '#a3a5a9',
    }),
    itemFrame: Object.freeze({
        red: BLOOD,
        mention: BLOOD_TEXT,
        ink: BONE,
        card: `background:${INK};border:0;border-radius:0;box-shadow:0 4px 14px rgba(0,0,0,.5);padding-left:17px;`,
        icon: `background:${INK_RAISED};border-radius:0;box-shadow:inset 0 0 0 1px ${BLOOD_DEEP};color:${BONE};`,
        desc: 'color:#b9b9bd;opacity:1;',
    }),
    battle: Object.freeze({
        accent: BLOOD_TEXT,
        markColor: BLOOD,
        vars: Object.freeze({ veil: 'rgba(14,14,16,.92)', rule: BLOOD_DEEP, ink: BONE, halo: '0 1px 2px rgba(0,0,0,.95)', 'title-halo': `0 2px 0 ${BLOOD_DEEP}`, wipe: 'rgba(14,14,16,.95)', lose: BLOOD_TEXT, escape: DIM }),
        markSize: 'width:6px;height:12px;',
        veil: 'background:rgba(14,14,16,.35);',
    }),
    titleColor: BLOOD,
    titleShadow: `2px 3px 0 ${BLOOD_DEEP},0 2px 8px rgba(0,0,0,.95)`,
    logReader: Object.freeze({ ring: `inset 0 0 0 1px ${BLOOD_DEEP}`, dropColor: BLOOD, line: '#3a2a2c', chip: Object.freeze({ bg: BLOOD_DEEP, ink: BONE }), plate: '#0e0e10' }),
    logReaderTheme: Object.freeze({ tone: 'dark', veil: '#121214', ink: BONE, narr: '#a3a5a9', thought: BLOOD_TEXT, sub: DIM, line: LINE, plate: INK_RAISED }),
});
