import { buildDialogFrameCss, scalePx } from './dialog-skin-frame.js';

export const DIALOG_SKIN_WASTELAND_RUST = 'wasteland-rust';

// 废土锈铁：一块从废墟里拆下来的铁皮。暗钢底上几团锈斑从角落往里吃，四角各一颗铆钉，内圈一道虚线焊缝，
// 右下一截黄黑警示条；姓名用喷漆模板字直接喷在铁皮左上，前面一小段警示条，边缘带一圈飞漆。装饰全压在边上，正文区只有钢底。
const RUST = '150,72,30';
const SOOT = '#1b1915';
const TAPE = '#d6c6a0';
const INK = '#ece3cf';
export const WASTELAND_HAZARD = '#e3ae2f';
export const wastelandRust = (alpha) => `rgba(${RUST},${alpha})`;
const rust = wastelandRust;
export const WASTELAND_STEEL = 'linear-gradient(180deg,#3b372f,#2a2722 60%,#211e1a)';
export const wastelandStripes = (size) => `repeating-linear-gradient(-45deg,${WASTELAND_HAZARD} 0 ${size}px,${SOOT} ${size}px ${size * 2}px)`;
const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_WASTELAND_RUST}"]`;
const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_WASTELAND_RUST}"]`;

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
// 锈蚀颗粒：一张小噪点图平铺，只栅格化一次。
const GRIME = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .55 0 0 0 0 .4 0 0 0 0 .25 0 0 0 .55 -.18"/></filter><rect width="140" height="140" filter="url(#n)"/></svg>');
// 警示三角：感叹号镂空（evenodd），单色遮罩下也认得出。
export const WASTELAND_HAZARD_MASK = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2.6L22.6 20.8H1.4ZM11 8.6H13L12.7 14.8H11.3ZM12 16.2A1.3 1.3 0 1 0 12 18.8A1.3 1.3 0 1 0 12 16.2Z"/></svg>');
export const wastelandRivet = (x, y) => `radial-gradient(circle at ${x} ${y},#b3a891 0 1.6px,#5a5245 2.4px,rgba(0,0,0,.55) 3.2px,transparent 3.8px)`;
const RIVETS = [['12px', '12px'], ['calc(100% - 12px)', '12px'], ['12px', 'calc(100% - 12px)'], ['calc(100% - 12px)', 'calc(100% - 12px)']]
    .map(([x, y]) => wastelandRivet(x, y)).join(',');
const BLOTCHES = [
    `radial-gradient(ellipse 34% 70% at 100% 100%,${rust('.5')},${rust('.18')} 45%,transparent 72%)`,
    `radial-gradient(ellipse 20% 55% at 0% 0%,${rust('.42')},transparent 70%)`,
    `radial-gradient(ellipse 12% 30% at 38% 100%,${rust('.28')},transparent 70%)`,
].join(',');

export const WASTELAND_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_WASTELAND_RUST, {
        height: 188,
        text: { top: 28, speakerTop: 50, right: 46, bottom: 26, left: 46 },
        rise: 0,
        frameCss: `background:${RIVETS},${BLOTCHES},${GRIME},${WASTELAND_STEEL};background-size:auto,auto,auto,auto,auto,auto,auto,140px 140px,auto;border:2px solid ${SOOT};border-radius:3px;box-shadow:inset 0 1px 0 rgba(255,236,200,.1),inset 0 -2px 0 rgba(0,0,0,.35),0 4px 14px rgba(0,0,0,.5);-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:36px;top:14px;width:max-content;max-width:calc(100% - 72px);height:28px;line-height:28px;margin:0;padding:0 0 0 34px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${wastelandStripes(5)} left center/22px 10px no-repeat;border:0;border-radius:0;box-shadow:none;font-size:20px;font-weight:700;letter-spacing:.28em;text-shadow:0 0 1px rgba(233,220,191,.9),0 0 5px rgba(233,220,191,.32),0 0 12px rgba(233,220,191,.12),0 2px 0 rgba(0,0,0,.55);`,
        textCss: 'letter-spacing:.05em;text-shadow:0 1px 0 rgba(0,0,0,.9),0 0 2px rgba(0,0,0,.7);',
    }),
    // 内圈虚线焊缝；右下一截黄黑警示条，左端化开，压在正文安全区下方。
    scalePx(`${scope}::before{content:"";position:absolute;inset:5px;border:1px dashed rgba(214,190,150,.18);border-radius:2px;pointer-events:none;}`),
    scalePx(`${scope}::after{content:"";position:absolute;right:20px;bottom:8px;width:34%;height:6px;background:${wastelandStripes(7)};-webkit-mask:linear-gradient(90deg,transparent,#000 30%);mask:linear-gradient(90deg,transparent,#000 30%);opacity:.8;pointer-events:none;}`),
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:26px;padding-right:24px;}${scope} .igs-speaker{left:18px;max-width:calc(100% - 36px);}`)}}`,
].join('\n');

// 选项：一块两头铆钉的铁牌；悬停时底下泛起锈色，左侧亮起警示三角、字转琥珀。
const choiceScope = `${overlayScope} .igs-option-bubble`;
const PLATE_RIVETS = `${wastelandRivet('11px', '50%')},${wastelandRivet('calc(100% - 11px)', '50%')}`;

export const WASTELAND_CHOICE_STYLE = [
    `${choiceScope}{box-sizing:border-box;min-height:44px;padding:10px 44px;border:2px solid ${SOOT};border-radius:3px;background:${PLATE_RIVETS},${WASTELAND_STEEL};box-shadow:inset 0 1px 0 rgba(255,236,200,.1),0 2px 6px rgba(0,0,0,.4);color:${INK};letter-spacing:.12em;text-shadow:0 1px 0 rgba(0,0,0,.9);transition:background .18s,color .18s;}`,
    `${choiceScope}::before{content:"";position:absolute;left:22px;top:50%;width:13px;height:13px;margin-top:-6.5px;background:${WASTELAND_HAZARD};-webkit-mask:${WASTELAND_HAZARD_MASK} center/contain no-repeat;mask:${WASTELAND_HAZARD_MASK} center/contain no-repeat;opacity:0;transition:opacity .18s;}`,
    `${choiceScope}:hover{background:${PLATE_RIVETS},radial-gradient(ellipse 60% 140% at 50% 120%,${rust('.45')},transparent 70%),${WASTELAND_STEEL};color:#ffe2a6;}`,
    `${choiceScope}:hover::before{opacity:1;}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const panel = (alpha) => `background:radial-gradient(ellipse 40% 80% at 100% 100%,${rust('.35')},transparent 70%),linear-gradient(180deg,rgba(59,55,47,${alpha}),rgba(33,30,26,${alpha}));border:1.5px solid ${SOOT};border-radius:${s(3)};box-shadow:inset 0 1px 0 rgba(255,236,200,.1),0 2px 8px rgba(0,0,0,.4);`;

// 状态栏零件：锈铁小牌、黄框喷字情绪签、头像一圈黑边、右下一枚警示三角。
export const WASTELAND_HUD_THEME = Object.freeze({
    neutral: '#8f826b',
    panel: panel(0.9),
    toast: `${panel(0.95)}color:${INK};text-shadow:0 1px 0 rgba(0,0,0,.9);`,
    ink: INK,
    emotion: `padding:0 ${s(10)};border:1px solid ${WASTELAND_HAZARD};border-radius:0;background:rgba(0,0,0,.35);color:${WASTELAND_HAZARD};letter-spacing:.16em;text-shadow:0 0 4px rgba(227,174,47,.35);`,
    avatar: `filter:${ring(SOOT, 1.5)};`,
    badge: `content:"";position:absolute;right:${s(-3)};bottom:${s(-3)};width:${s(10)};height:${s(10)};background:${WASTELAND_HAZARD};-webkit-mask:${WASTELAND_HAZARD_MASK} center/contain no-repeat;mask:${WASTELAND_HAZARD_MASK} center/contain no-repeat;`,
    placeholder: `background:linear-gradient(180deg,#3b372f,#211e1a);color:${TAPE};`,
    placeholderSvg: `fill:none;stroke:${TAPE};stroke-width:1.3;`,
    track: `height:${s(5)};border:1px solid ${SOOT};border-radius:0;background:rgba(0,0,0,.35);`,
    fill: `background:color-mix(in srgb,var(--igs-hud-fill-color) 60%,${WASTELAND_HAZARD}) !important;border-radius:0;`,
    value: 'font-weight:700;',
});
