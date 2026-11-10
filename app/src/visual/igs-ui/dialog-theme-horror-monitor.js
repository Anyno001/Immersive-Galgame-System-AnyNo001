import { buildDialogFrameCss, scalePx } from './dialog-skin-frame.js';

// 断帧监控：整个画面被一台旧监控录像处理过。镜头层（去色偏冷、颗粒、暗角、扫描线、取景框、REC 与时间码）随 overlay 上的
// data-igs-dread 0–3 递进，全部是挂在现有节点伪元素上的 CSS，不新增 DOM；对话框退回近似黑幕的载体，名牌是「CAM-03 + 名字」。
// 用色只有近黑、骨白、冷灰与一点血红；画面只压亮度和偏冷，去色不超过 0.5。
export const DIALOG_SKIN_HORROR_MONITOR = 'horror-monitor';
export const MONITOR_SKIN_LABEL = '断帧监控';
const INK = '#121212';
const INK_RAISED = '#1c1c1e';
const BONE = '#ece8de';
const DIM = '#8d8f93';
const HUD_INK = '#a9abaf';
const HAIR = '#3a3c40';
const FRAME_LINE = '#7a7c80';
const BLOOD = '#d3303a';
const BLOOD_DEEP = '#b3202a';
const TINT = '47,90,69';
const ICE = '150,210,255';
export const MONITOR_FONT = '"Source Han Serif CN","Source Han Serif SC","Noto Serif SC",serif';
const NUM_FONT = '"Cinzel","Source Han Serif CN","Source Han Serif SC","Noto Serif SC",serif';

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const r2 = (n) => +n.toFixed(2);
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const O = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_HORROR_MONITOR}"]`;
const D = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_HORROR_MONITOR}"]`;
const at = (level) => `${O}[data-igs-dread="${level}"]`;
const dlg = (level) => `#igs-overlay[data-igs-dread="${level}"] .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_HORROR_MONITOR}"]`;
const GRAIN = `${O} #igs-click-layer::before`;
const HUD = `${O} #igs-dialog-layer::before`;
const BAND = `${O} #igs-dialog-layer::after`;
const FLIP = `${O} .igs-dialog .igs-speaker::after`;

// 颗粒：一张 180px 的静态噪点，只渲染一次，之后靠 steps() 低频切换 background-position，不用 mix-blend-mode。
const NOISE = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .85 0 0 0 0 .85 0 0 0 0 .85 1.4 0 0 0 -.35"/></filter><rect width="180" height="180" filter="url(#n)"/></svg>');

// tint 偏色层、vig 暗角、grain 颗粒、scan 扫描线是强度；bg / spr 是背景与立绘的滤镜；chroma 是立绘边缘的红蓝色散（2 档起）。
const LEVEL_FX = Object.freeze([
    { tint: 0, vig: 0, grain: 0, scan: 0, bg: 'grayscale(.3) brightness(.8) contrast(1.05)', spr: 'hue-rotate(-6deg) saturate(.9) grayscale(.3) brightness(.88) contrast(1.04)', chroma: 0 },
    { tint: 0.16, vig: 0.7, grain: 0.2, scan: 0, bg: 'grayscale(.5) brightness(.56) contrast(1.2)', spr: 'hue-rotate(-8deg) saturate(.8) grayscale(.5) brightness(.74) contrast(1.1)', chroma: 0 },
    { tint: 0.2, vig: 0.8, grain: 0.27, scan: 0.6, bg: 'grayscale(.5) brightness(.56) contrast(1.25)', spr: 'hue-rotate(-8deg) saturate(.8) grayscale(.5) brightness(.74) contrast(1.12)', chroma: 3 },
    { tint: 0.22, vig: 0.9, grain: 0.36, scan: 0.75, bg: 'grayscale(.5) brightness(.56) contrast(1.25)', spr: 'hue-rotate(-8deg) saturate(.8) grayscale(.5) brightness(.74) contrast(1.12)', chroma: 5 },
]);

const SIDES = Object.freeze([['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']]);
const bars = (len, color, offset, sides) => sides.flatMap(([x, y]) => {
    const g = `linear-gradient(${color},${color}) ${x} ${offset}px ${y} ${offset}px`;
    return [`${g}/${len}px 1px no-repeat`, `${g}/1px ${len}px no-repeat`];
});
// 取景框四角 + 扫描线 + 暗角 + 偏色，叠成一层静态背景；窄屏只留顶部两角，贴近屏边。
const lensBg = ({ tint, vig, scan }, mobile) => [
    ...(mobile ? bars(12, FRAME_LINE, 12, SIDES.slice(0, 2)) : bars(18, FRAME_LINE, 28, SIDES)),
    ...(scan ? [`repeating-linear-gradient(180deg,rgba(0,0,0,${r2(0.34 * scan)}) 0 1px,rgba(0,0,0,0) 1px 3px)`] : []),
    `radial-gradient(ellipse 75% 70% at 50% 42%,rgba(18,18,18,0) 38%,rgba(18,18,18,${r2(0.92 * vig)}) 100%)`,
    `linear-gradient(rgba(${TINT},${tint}),rgba(${TINT},${tint}))`,
].join(',');
const chromaOf = (n) => (n ? ` drop-shadow(-${n}px 0 0 rgba(179,32,42,${n > 3 ? 0.7 : 0.6})) drop-shadow(${n}px 0 0 rgba(205,230,255,${n > 3 ? 0.4 : 0.34}))` : '');
const SPRITES = ':is(#igs-sprite:not(.igs-sprite-editing),#igs-cast .igs-cast-sprite:not(.igs-cast-editing),.igs-sd-sprite-ghost)';
const filterPair = (value) => `filter:${value};-webkit-filter:${value};`;

const tcText = (t) => `content:"REC\\A ${t}";`;
const TC_STEPS = Object.freeze(['00:14:31:07', '00:14:32:11', '00:14:33:02', '00:14:34:20', '00:14:35:09', '00:14:36:15']);
// 3 档时间码在第三格跳到一个对不上的值，再接回正常计数。
const TC_GLITCH = Object.freeze(['00:14:31:07', '00:14:32:11', '00:14:31:19', '00:14:34:20', '00:14:35:09', '00:14:36:15']);
const tcFrames = (name, steps) => `@keyframes ${name}{${steps.map((t, i) => `${r2((i * 100) / steps.length)}%{${tcText(t)}}`).join('')}}`;
const calmed = (parts, rules) => [
    `@media (prefers-reduced-motion: reduce){${parts.join(',')}{${rules}}}`,
    `${parts.map((p) => p.replace(O, `${O}[data-igs-quality="low"]`)).join(',')}{${rules}}`,
];

// 镜头层挂在已有节点的伪元素上：#igs-click-layer 的 ::before 是颗粒，::after 是偏色+暗角+扫描线+取景框（都在立绘之上、对话框之下）；
// #igs-dialog-layer 的 ::before 是 REC 与时间码，::after 是 3 档的掉帧横带（都在对话框之上，pointer-events 为 none）。
export const MONITOR_LENS_STYLE = [
    `${O} #igs-bg-blur{filter:blur(40px) brightness(.4) grayscale(.5) var(--igs-grade-bg,);-webkit-filter:blur(40px) brightness(.4) grayscale(.5) var(--igs-grade-bg,);}`,
    `${GRAIN},${O} #igs-click-layer::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;}`,
    `${GRAIN}{background:${NOISE} 0 0/180px;}`,
    `${HUD}{content:"";display:none;position:absolute;top:${s(26)};right:${s(30)};padding-right:${s(14)};box-sizing:content-box;pointer-events:none;white-space:pre;text-align:right;font:600 ${s(12)}/1.5 ${NUM_FONT};letter-spacing:.14em;color:${HUD_INK};background:radial-gradient(circle,${BLOOD} 0 3.5px,transparent 4px) right 0 top ${s(3)}/${s(8)} ${s(8)} no-repeat;}`,
    `${BAND}{content:"";display:none;position:absolute;left:0;right:0;top:41%;height:5%;pointer-events:none;opacity:0;background:${NOISE} 0 0/180px,linear-gradient(${INK},${INK});}`,
    ...LEVEL_FX.flatMap((fx, n) => [
        `${at(n)} #igs-bg{filter:brightness(var(--igs-bg-brightness,1)) var(--igs-grade-bg,) ${fx.bg};-webkit-filter:brightness(var(--igs-bg-brightness,1)) var(--igs-grade-bg,) ${fx.bg};}`,
        `${at(n)} ${SPRITES}{${filterPair(`var(--igs-sprite-dim,) var(--igs-grade-sprite,) var(--igs-sprite-enhance,) ${fx.spr}${chromaOf(fx.chroma)}`)}}`,
        ...(n ? [
            `${at(n)} #igs-click-layer::before{opacity:${fx.grain};animation:igs-hm-grain 4s steps(1) infinite;}`,
            `${at(n)} #igs-click-layer::after{opacity:1;background:${lensBg(fx, false)};}`,
            `@media (max-width:640px){${at(n)} #igs-click-layer::after{background:${lensBg(fx, true)};}}`,
            `${at(n)} #igs-dialog-layer::before{display:block;${tcText(TC_STEPS[0])}animation:${n === 3 ? 'igs-hm-tc-glitch' : 'igs-hm-tc'} 6s steps(1) infinite;}`,
        ] : []),
    ]),
    `@media (max-width:640px){${HUD}{top:${s(14)};right:${s(16)};}}`,
    `${at(3)} #igs-dialog-layer::before{text-shadow:-1px 0 rgba(211,48,58,.75),1px 0 rgba(${ICE},.4);}`,
    `${at(3)} #igs-dialog-layer::after{display:block;animation:igs-hm-band 7s steps(1) infinite;}`,
    '@keyframes igs-hm-grain{0%{background-position:0 0;}25%{background-position:-47px 31px;}50%{background-position:63px -22px;}75%{background-position:-18px -57px;}}',
    tcFrames('igs-hm-tc', TC_STEPS),
    tcFrames('igs-hm-tc-glitch', TC_GLITCH),
    '@keyframes igs-hm-band{0%,89%,95%,100%{opacity:0;}90%{opacity:.8;top:41%;transform:translateX(26px);}92%{opacity:.8;top:58%;transform:translateX(-18px);}}',
    `${[GRAIN, HUD, BAND, FLIP].map((p) => p.replace('#igs-overlay', '#igs-overlay[data-igs-paused]')).join(',')}{animation-play-state:paused;}`,
    ...calmed([GRAIN, HUD, BAND, FLIP], 'animation:none !important;'),
    ...calmed([BAND, FLIP], 'display:none !important;'),
    `${O}[data-igs-quality="low"] #igs-click-layer::before{display:none;}`,
].join('\n');

// ── 对话框：退回近似黑幕的载体，只留顶部一根细线、四角刻度；名牌是「CAM-03 + 名字」，3 档下半截闪成「你自己」 ──
export const MONITOR_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_HORROR_MONITOR, {
        height: 190,
        text: { top: 54, speakerTop: 62, right: 110, bottom: 28, left: 100 },
        rise: 18,
        flush: true,
        frameCss: `isolation:isolate;background:rgba(18,18,18,.92);border:0;border-radius:0;box-shadow:0 -18px 36px -12px rgba(0,0,0,.5);-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:100px;top:-18px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 140px);height:36px;line-height:36px;padding:0 20px;background:${INK_RAISED};border:0;border-radius:0;font-size:18px;font-weight:400;letter-spacing:.2em;text-shadow:none;`,
        textCss: 'letter-spacing:.06em;',
    }),
    scalePx(`${D}::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:${HAIR};pointer-events:none;}`),
    scalePx(`${D}::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;background:${bars(12, DIM, 0, SIDES).join(',')};}`),
    ...[1, 2, 3].map((n) => `${dlg(n)}::after{opacity:1;}`),
    `${D} .igs-speaker::before{content:"CAM-03";margin-right:.9em;font:600 12px ${NUM_FONT};letter-spacing:.14em;color:${DIM};}`,
    `${dlg(2)} .igs-text,${dlg(3)} .igs-text{text-shadow:-1px 0 rgba(179,32,42,.55),1px 0 rgba(${ICE},.3);}`,
    `${dlg(3)} .igs-speaker{text-shadow:-2px 0 rgba(211,48,58,.85),2px 0 rgba(${ICE},.5);}`,
    `${dlg(3)} .igs-speaker::after{content:"你自己";position:absolute;inset:0;text-align:left;padding-left:89px;background:${INK_RAISED};color:${BONE};clip-path:inset(50% 0 0 0);opacity:0;animation:igs-hm-flip 5s steps(1) infinite;}`,
    '@keyframes igs-hm-flip{0%,93%,100%{opacity:0;}94%{opacity:1;}96%{opacity:0;}97%{opacity:1;}99%{opacity:0;}}',
    `@media (max-width:640px){${scalePx(`${D},${D}[data-igs-has-speaker="1"]{padding-left:28px;padding-right:24px;}${D} .igs-speaker{left:16px;max-width:calc(100% - 32px);}`)}}`,
    MONITOR_LENS_STYLE,
].join('\n');

// ── 选项：带编号的回放菜单，悬停/选中行为骨白实色 ──
const choice = `${O} .igs-option-bubble`;
export const MONITOR_CHOICE_STYLE = [
    `${O} #igs-option-bubbles{counter-reset:igs-hm-c;}`,
    `${choice}{position:relative;box-sizing:border-box;min-height:44px;padding:10px 20px 10px 56px;border:0;border-radius:0;background:${INK_RAISED};box-shadow:none;color:#b9b9bd;font-weight:400;letter-spacing:.08em;text-shadow:none;counter-increment:igs-hm-c;transition:background-color .18s,color .18s;}`,
    `${choice}::before{content:"0" counter(igs-hm-c);position:absolute;left:18px;top:50%;transform:translateY(-50%);font:600 12px ${NUM_FONT};letter-spacing:.1em;color:${DIM};}`,
    `${choice}:hover,${choice}:focus-visible{background:${BONE};color:${INK};padding-left:74px;}`,
    `${choice}:hover::before,${choice}:focus-visible::before{content:"▶ 0" counter(igs-hm-c);color:${INK};}`,
    `${choice}:active{transform:translateY(1px);}`,
].join('\n');

// ── HUD：面板为近黑实色，左侧一根冷灰细线；血红只给情绪标签的角标 ──
const panel = (alpha) => `background:rgba(18,18,18,${alpha});border:0;border-radius:0;box-shadow:inset ${s(2)} 0 0 ${FRAME_LINE};`;
export const MONITOR_HUD_THEME = Object.freeze({
    neutral: DIM,
    panel: panel('.9'),
    toast: `${panel('.92')}color:${BONE};text-shadow:none;`,
    ink: BONE,
    emotion: `padding:0 ${s(12)};border:0;border-radius:0;background:${INK_RAISED};color:${BONE};font-weight:400;letter-spacing:.14em;text-shadow:none;box-shadow:inset 0 -${s(2)} 0 ${BLOOD_DEEP};`,
    avatar: `filter:grayscale(.4) contrast(1.05);`,
    badge: `content:"";position:absolute;right:${s(-2)};bottom:${s(-2)};width:${s(7)};height:${s(7)};background:${BLOOD};`,
    placeholder: `background:${INK};color:${DIM};`,
    placeholderSvg: `fill:none;stroke:${DIM};stroke-width:1.4;`,
    track: `height:${s(3)};border:0;border-radius:0;background:rgba(141,143,147,.28);`,
    fill: `background:${BONE} !important;border-radius:0;`,
    value: 'font-weight:400;letter-spacing:.06em;',
});

// ── 句末图标（click-wait-mark.js 的 CLICK_WAIT_MARK_SKINS 项与 DREAD_RULES 项） ──
export const MONITOR_CLICK_WAIT_MARK = Object.freeze({ shape: 'triangle', color: BONE, animation: 'tap-steps' });
export const MONITOR_CLICK_WAIT_DREAD_RULE = `${at(3)}{--igs-cw-color:${BLOOD};}`;

// ── 聊天配色（chat-themes.js 的 palette 参数，顺序：shell, head, headInk, frame, sub, left, right, border） ──
export const MONITOR_CHAT_PALETTE_ARGS = Object.freeze([INK, INK_RAISED, BONE, INK, DIM, '#d9d6cc', '#a9b8ae', 'rgba(141,143,147,.5)']);

// ── 物品框（dialog-theme-item-frames.js 的皮肤项，形状同 horror-gore） ──
export const MONITOR_ITEM_FRAME = Object.freeze({
    mention: '#d3303a',
    ink: BONE,
    card: `background:${INK};border:0;border-radius:0;box-shadow:0 4px 14px rgba(0,0,0,.55);padding-left:17px;`,
    before: `left:0;top:0;bottom:0;width:3px;background:var(--igs-item-mark,${BLOOD_DEEP});`,
    after: `inset:0;background:${bars(9, FRAME_LINE, 3, SIDES).join(',')};`,
    icon: `background:${INK_RAISED};border-radius:0;box-shadow:inset 0 0 0 1px ${HAIR};color:${BONE};`,
    desc: 'color:#b9b9bd;opacity:1;',
});

// ── 字体排版（dialog-theme-typography.js 的 DIALOG_SKIN_TYPOGRAPHY 项；字体栈需登记者用同名常量或直接用 MONITOR_FONT） ──
export const MONITOR_TYPOGRAPHY = Object.freeze({
    nameAlign: 'left',
    nameFont: MONITOR_FONT,
    textFont: MONITOR_FONT,
    thoughtFont: MONITOR_FONT,
    narrationFont: MONITOR_FONT,
    nameColor: BONE,
    textColor: BONE,
    thoughtColor: '#a9c8dc',
    narrationColor: '#b9b9bd',
});

// ── 战斗（fx-battle-themes.js）与标题（fx-title-themes.js） ──
export const MONITOR_BATTLE_THEME = Object.freeze({
    accent: BLOOD_DEEP,
    font: MONITOR_FONT,
    vars: Object.freeze({ veil: 'rgba(18,18,18,.9)', rule: FRAME_LINE, ink: BONE, halo: '0 1px 2px rgba(0,0,0,.95)', 'title-halo': `0 2px 0 ${BLOOD_DEEP}`, wipe: 'rgba(18,18,18,.95)', lose: BLOOD, escape: DIM }),
    mark: `width:8px;height:8px;align-self:center;font-size:0;background:${BLOOD};`,
    title: 'font-style:normal;font-weight:400;letter-spacing:.24em;text-indent:.24em;',
    veil: 'background:rgba(18,18,18,.4);',
});
export const monitorTitleStyle = (sel) => [
    `${sel} .igs-fx-title-main{text-shadow:-2px 0 rgba(211,48,58,.8),2px 0 rgba(${ICE},.4),0 2px 8px rgba(0,0,0,.95);}`,
    `${sel}::after{width:8px;height:8px;background:${BLOOD};}`,
];

// ── 阅读器（log-reader-theme.js 与 log-reader-parts.js） ──
export const MONITOR_LOG_THEME = Object.freeze({ tone: 'dark', veil: INK, ink: BONE, narr: '#b9b9bd', thought: '#a9c8dc', sub: DIM, line: '#2c2c2e', plate: INK_RAISED });
const markSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='8' y='8' width='8' height='8' fill='${BLOOD}'/></svg>`;
export const MONITOR_LOG_PARTS = Object.freeze({
    ring: `inset 0 0 0 1px ${HAIR}`,
    r: 0,
    orn: { svg: markSvg, w: 9, h: 9, at: 'left:3px;bottom:-4px' },
    name: { plate: { r: 0, bg: INK, px: 6 } },
    row: { line: 'fade', c: HAIR, m: { svg: markSvg, w: 8, h: 8 }, gap: 8 },
    scene: { line: 'fade', c: HAIR, m: { svg: markSvg, w: 8, h: 8 } },
    chip: { r: 0, bg: INK_RAISED, ink: BONE },
});

// ── 其余登记项（数据与 gore 同形） ──
export const MONITOR_TEXT_FX_STYLE = `${O}{--igs-tfx-accent:${BLOOD};--igs-tfx-glow:rgba(0,0,0,.9);}`;
export const MONITOR_TITLE_SCREEN_TONE = 'dark';
export const MONITOR_UI_SFX_PROFILE = 'dread';
