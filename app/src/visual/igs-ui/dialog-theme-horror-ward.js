import { buildDialogFrameCss, scalePx } from './dialog-skin-frame.js';

// 恐怖皮肤「无影灯」（设计稿 gal/恐怖主题设计稿，定稿）。随 overlay 上的 data-igs-dread 0–3 升级（见 horror-dread.js）。
// 舞台不做灯光：画面层只有冷偏色、暗角、颗粒与扫描线；医院元素只落在界面部件上（病床卡名牌、心电线句末图标、处置选择、护理记录提示卡）。
// 0 平静；1 加颗粒与暗角；2 加扫描线，名牌心电线转红，正文边缘出红青色散；3 立绘区压暗，心电线拉平，句末箭尖消失，名牌改写为「无名氏」。
export const DIALOG_SKIN_HORROR_WARD = 'horror-ward';

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const overlayOf = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_HORROR_WARD}"]`;
const scopeOf = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_HORROR_WARD}"]`;
const atLevel = (level) => `#igs-overlay[data-igs-dread="${level}"] .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_HORROR_WARD}"]`;
const overlayAtLevel = (level) => `${overlayOf}[data-igs-dread="${level}"]`;

// 近黑一档（微冷），不用 #000、不带棕。
const INK = '#101214';
const INK_PANEL = '#0f1214';
const ICE = '#dce8ee';
const BED = '#4b5a62';
const LINE = '#3d454b';
const SLATE = '#26323a';
const CHOICE_INK = '#aebbc2';
const ALERT = '#a8222c';
const FRINGE_RED = 'rgba(168,34,44,.5)';
const FRINGE_ICE = 'rgba(160,220,240,.3)';
const FONT_WARD = '"Source Han Serif CN","Source Han Serif SC","Noto Serif SC",serif';
const BED_LABEL = '病床 03';
const UNNAMED = '无名氏';

// ── 心电线：名牌上的一段（74×14）与句末图标（26×14，尾端箭尖）──
const ecgPlate = (color, flat) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="74" height="14" viewBox="0 0 74 14"><path d="${flat ? 'M0 7H74' : 'M0 7H14L17 7L20 1.5L24 12.5L27 7H46L49 7L52 1.5L56 12.5L59 7H74'}" fill="none" stroke="${color}" stroke-width="1.3"/></svg>`);
const ECG_PLATE = ecgPlate(BED, false);
const ECG_PLATE_ALERT = ecgPlate(ALERT, false);
const ECG_PLATE_FLAT = ecgPlate(BED, true);
const ecgWait = (flat) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 14"><path d="${flat ? 'M0 7H26' : 'M0 7H4L6.5 2L9.5 12L12 7H21'}" fill="none" stroke="#000" stroke-width="1.3"/>${flat ? '' : '<path d="M21 7L23 0L26 7L23 14Z"/>'}</svg>`);
export const HORROR_ECG_MASK = ecgWait(false);
export const HORROR_ECG_FLAT_MASK = ecgWait(true);
const ECG_BLIP_MASK = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 10"><path d="M0 5H6L8 1L11 9L13 5H22" fill="none" stroke="#000" stroke-width="1.4"/></svg>');
const SQUARE = (color) => `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='6' y='6' width='12' height='12' fill='${color}'/></svg>`;

// ── 画面层（挂在 #igs-click-layer::before / ::after，只在本皮肤下生效）──
// 每档：偏色 tint、暗角边缘 vig、整体压暗 dim、扫描线 scan（alpha，0 = 无）、颗粒不透明度 grain。
// 变暗靠压亮度与偏冷，不靠去色，原色仍可辨认。
const STAGE = Object.freeze([
    { tint: 0.08, vig: 0.5, dim: 0.2, scan: 0, grain: 0 },
    { tint: 0.14, vig: 0.62, dim: 0.22, scan: 0, grain: 0.06 },
    { tint: 0.16, vig: 0.7, dim: 0.24, scan: 0.08, grain: 0.08 },
    { tint: 0.18, vig: 0.78, dim: 0.36, scan: 0.1, grain: 0.1 },
]);
const solid = (rgba) => `linear-gradient(${rgba},${rgba})`;
const stageLayers = ({ tint, vig, dim, scan }) => [
    ...(scan ? [`repeating-linear-gradient(to bottom,rgba(0,0,0,${scan}) 0 1px,transparent 1px 3px)`] : []),
    `radial-gradient(ellipse 75% 70% at 50% 42%,rgba(9,10,12,0) 38%,rgba(9,10,12,${vig}) 100%)`,
    solid(`rgba(14,18,22,${dim})`),
    solid(`rgba(29,79,99,${tint})`),
].join(',');
const GRAIN_TILE = 180;
const GRAIN = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${GRAIN_TILE}" height="${GRAIN_TILE}"><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 3 0 0 0 -1.35"/></filter><rect width="${GRAIN_TILE}" height="${GRAIN_TILE}" filter="url(#n)"/></svg>`);
const layer = 'content:"";position:absolute;inset:0;pointer-events:none;';

export const WARD_STAGE_STYLE = [
    // z-index 3：压在立绘、背景与演出层之上，低于对话框（4）、选项（6）与工具栏；pointer-events:none，不挡点击。
    `${overlayOf} #igs-click-layer::before{${layer}background:${stageLayers(STAGE[0])};}`,
    `${overlayOf} #igs-click-layer::after{${layer}background:${GRAIN} 0 0/${GRAIN_TILE}px ${GRAIN_TILE}px;opacity:0;}`,
    ...STAGE.slice(1).map((level, i) => `${overlayAtLevel(i + 1)} #igs-click-layer::before{background:${stageLayers(level)};}`),
    ...STAGE.slice(1).map((level, i) => `${overlayAtLevel(i + 1)} #igs-click-layer::after{opacity:${level.grain};animation:igs-hw-grain 1.1s steps(1,end) infinite;}`),
    // 颗粒是静态噪点图，每 1.1 秒用 steps() 换一次平铺偏移，不叠 mix-blend-mode。
    '@keyframes igs-hw-grain{0%{background-position:0 0;}25%{background-position:-47px 31px;}50%{background-position:63px -22px;}75%{background-position:-18px -57px;}}',
    // 暂停（页面失焦/静置）、系统「减少动态效果」、低画质：颗粒停在静态图上，不再换位。
    `#igs-overlay[data-igs-paused][data-igs-dialog-skin="${DIALOG_SKIN_HORROR_WARD}"] #igs-click-layer::after,${overlayOf}[data-igs-quality="low"] #igs-click-layer::after{animation:none;}`,
    `@media (prefers-reduced-motion: reduce){${overlayOf} #igs-click-layer::after{animation:none !important;}}`,
].join('\n');

const scope = scopeOf;
const ward = atLevel;

export const WARD_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_HORROR_WARD, {
        height: 190,
        text: { top: 40, speakerTop: 60, right: 58, bottom: 32, left: 58 },
        rise: 20,
        frameCss: `isolation:isolate;background:${INK_PANEL};border:0;border-radius:0;box-shadow:0 -14px 30px -12px rgba(0,0,0,.5);-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:24px;top:-20px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 48px);height:40px;line-height:40px;padding:0 100px 0 16px;background:${ECG_PLATE} right 14px center/74px 14px no-repeat,${ICE};border:0;border-radius:0;color:${INK} !important;font-family:${FONT_WARD};font-size:19px;font-weight:400;letter-spacing:.22em;text-shadow:none;`,
        textCss: 'letter-spacing:.06em;',
    }),
    // 顶边一道不随缩放的细线。
    `${scope}::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;z-index:-1;pointer-events:none;background:${LINE};}`,
    // 病床号：名牌文字前的小字，写死在 CSS 里，不依赖正文；病床号字号不跟随缩放。
    scalePx(`${scope} .igs-speaker::before{content:"${BED_LABEL}";margin-right:14px;font-size:11px;font-weight:600;letter-spacing:.14em;color:${BED};vertical-align:middle;}`),
    // 2 危险：心电线转红，正文边缘出红青色散。
    scalePx(`${ward(2)} .igs-speaker{background-image:${ECG_PLATE_ALERT},linear-gradient(${ICE},${ICE});}`),
    `${ward(2)} .igs-text{text-shadow:-1px 0 ${FRINGE_RED},1px 0 ${FRINGE_ICE};}`,
    // 3 爆发：心电线拉平；真实姓名收成 0 字号，用伪元素显示「无名氏」（TTS 与目录读的是 DOM 文本，不受影响）。
    scalePx(`${ward(3)} .igs-speaker{background-image:${ECG_PLATE_FLAT},linear-gradient(${ICE},${ICE});font-size:0 !important;}`),
    `${ward(3)} .igs-speaker::after{content:"${UNNAMED}";font-size:19px;letter-spacing:.22em;color:${INK};}`,
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:20px;padding-right:20px;}${scope} .igs-speaker{left:12px;max-width:calc(100% - 24px);}`)}}`,
].join('\n');

const wardChoice = `${overlayOf} .igs-option-bubble`;
export const WARD_CHOICE_STYLE = [
    `${wardChoice}{box-sizing:border-box;min-height:44px;padding:10px 18px 10px 40px;border:0;border-radius:0;background:${INK};box-shadow:none;color:${CHOICE_INK};font-family:${FONT_WARD};letter-spacing:.08em;text-shadow:none;transition:background-color .15s,color .15s;}`,
    `${wardChoice}::before{content:"";position:absolute;left:18px;top:50%;width:8px;height:8px;margin-top:-4px;background:${LINE};transition:background-color .15s;}`,
    `${wardChoice}:hover{background:${SLATE};color:#fff;}`,
    `${wardChoice}:hover::before{background:${ICE};}`,
    `${wardChoice}:active{transform:translateY(1px);}`,
].join('\n');

const wardPanel = (alpha) => `background:rgba(16,18,20,${alpha});border:0;border-radius:0;box-shadow:inset 0 ${s(1)} 0 ${LINE};`;
export const WARD_HUD_THEME = Object.freeze({
    neutral: '#7f8c93',
    panel: wardPanel('.92'),
    toast: `${wardPanel('.95')}color:${CHOICE_INK};text-shadow:none;`,
    ink: ICE,
    emotion: `padding:0 ${s(12)};border:0;border-radius:0;background:${ICE};color:${INK};font-weight:600;letter-spacing:.12em;text-shadow:none;`,
    avatar: `filter:${ring(INK, 2)} ${ring(BED, 1.5)};`,
    badge: `content:"";position:absolute;right:${s(-2)};bottom:${s(-3)};width:${s(8)};height:${s(8)};background:${ICE};box-shadow:0 0 0 ${s(1.5)} ${INK};`,
    placeholder: `background:${INK};color:${BED};`,
    placeholderSvg: `fill:none;stroke:${BED};stroke-width:1.4;`,
    track: `height:${s(4)};border:0;border-radius:0;background:rgba(75,90,98,.35);`,
    fill: `background:${ICE} !important;border-radius:0;`,
    value: 'font-weight:600;',
});

// chat-themes.js：palette(shell, head, headInk, frame, sub, left, right, border)
export const WARD_CHAT_PALETTE = Object.freeze(['#14181b', INK, ICE, INK, '#7f8c93', '#e6eef2', '#9fb3be', 'rgba(61,69,75,.9)']);

// dialog-theme-item-frames.js：与 'horror-gore' 同形（mention/ink/card/before/after/icon/desc）。
export const WARD_ITEM_FRAME = Object.freeze({
    mention: '#8fb4c6',
    ink: ICE,
    card: `background:${INK};border:0;border-radius:0;box-shadow:inset 0 1px 0 ${LINE},0 4px 14px rgba(0,0,0,.5);padding-left:17px;`,
    before: `left:0;top:0;bottom:0;width:4px;background:${ICE};`,
    after: `inset:0;background:linear-gradient(${ALERT},${ALERT}) 0 0/100% 1px no-repeat;`,
    icon: `background:#1a2024;border-radius:0;box-shadow:inset 0 0 0 1px ${LINE};color:${ICE};`,
    desc: `color:${CHOICE_INK};opacity:1;`,
});

// dialog-theme-typography.js：REFERENCE_DIALOG_TYPOGRAPHY['horror-ward']。思源宋体，不用 Huiwen Mincho。
export const WARD_TYPOGRAPHY = Object.freeze({
    nameAlign: 'left',
    nameFont: FONT_WARD,
    textFont: FONT_WARD,
    thoughtFont: FONT_WARD,
    narrationFont: FONT_WARD,
    nameColor: INK,
    textColor: ICE,
    thoughtColor: '#8fb4c6',
    narrationColor: '#9aa8b0',
});

// fx-battle-themes.js：与 DIALOG_SKIN_HORROR_GORE 条目同形（accent/font/vars/mark/title/veil）。font 填 WARD_TYPOGRAPHY.nameFont。
export const WARD_BATTLE_THEME = Object.freeze({
    accent: ICE,
    font: FONT_WARD,
    vars: Object.freeze({ veil: 'rgba(16,18,20,.9)', rule: ICE, ink: ICE, halo: '0 1px 2px rgba(0,0,0,.95)', 'title-halo': `0 2px 0 ${ALERT}`, wipe: 'rgba(16,18,20,.95)', lose: '#d24a54', escape: '#7f8c93' }),
    mark: `width:22px;height:10px;align-self:center;font-size:0;background:${ICE};-webkit-mask:${ECG_BLIP_MASK} center/contain no-repeat;mask:${ECG_BLIP_MASK} center/contain no-repeat;`,
    title: 'font-style:normal;font-weight:600;letter-spacing:.2em;text-indent:.2em;',
    veil: 'background:rgba(14,22,28,.35);',
});

// fx-title-themes.js：与 DIALOG_SKIN_HORROR_GORE 条目同形，(s) => string[]。
export const WARD_TITLE_THEME = (sel) => [
    `${sel} .igs-fx-title-main{text-shadow:2px 3px 0 ${ALERT},0 2px 8px rgba(0,0,0,.95);}`,
    `${sel}::after{width:22px;height:10px;background:${ICE};-webkit-mask:${ECG_BLIP_MASK} center/contain no-repeat;mask:${ECG_BLIP_MASK} center/contain no-repeat;}`,
];

// log-reader-theme.js：与 'horror-gore' 同形。
export const WARD_LOG_READER_THEME = Object.freeze({ tone: 'dark', veil: '#121416', ink: ICE, narr: '#9aa8b0', thought: '#8fb4c6', sub: '#7f8c93', line: '#2f383e', plate: '#1c2226' });

// log-reader-parts.js：与 'horror-gore' 同形；svg 字段是原始 SVG 字符串（24×24 画布）。
export const WARD_LOG_READER_PART = Object.freeze({
    ring: `inset 0 0 0 1px ${LINE}`,
    r: 0,
    name: { plate: { r: 0, bg: ICE, px: 6 } },
    row: { line: 'fade', c: '#2f383e', m: { svg: SQUARE(LINE), w: 8, h: 8 }, gap: 8 },
    scene: { line: 'fade', c: '#2f383e', m: { svg: SQUARE(ICE), w: 8, h: 8 } },
    chip: { r: 0, bg: SLATE, ink: ICE },
});

// text-fx.js：追加到样式串（与 horror-gore 的 --igs-tfx-accent 行同位置）。
export const WARD_TEXT_FX_STYLE = `${overlayOf}{--igs-tfx-accent:#d24a54;--igs-tfx-glow:rgba(0,0,0,.9);}`;
export const WARD_UI_SFX_MOOD = 'dread';
export const WARD_TITLE_SCREEN_TONE = 'dark';

// click-wait-mark.js：追加到 CLICK_WAIT_MARK_STYLE_TEXT。句末图标是一小段心电线加箭尖，3 档拉平且箭尖消失。
// 形状宽于 24×24，故本皮肤自带遮罩并覆盖尺寸；用户选了具体形状（data-igs-click-wait-glyph）时让位给通用规则，颜色仍跟随。
const ecgMarkVars = (mask, anim) => `--igs-cw-mask:${mask};--igs-cw-anim:${anim};--igs-cw-origin:50% 50%;`;
const BREATH = 'igs-cw-tap-breath 2.4s ease-in-out infinite';
const waitOn = `${overlayOf}[data-igs-click-wait="on"]:not([data-igs-click-wait-glyph])`;
export const WARD_CLICK_WAIT_STYLE = [
    `${overlayOf}{--igs-cw-color:${ICE};}`,
    `${overlayAtLevel(2)}{--igs-cw-color:${ALERT};}`,
    `${overlayAtLevel(3)}{--igs-cw-color:${BED};}`,
    `${waitOn}{${ecgMarkVars(HORROR_ECG_MASK, BREATH)}}`,
    `${overlayAtLevel(3)}[data-igs-click-wait="on"]:not([data-igs-click-wait-glyph]){${ecgMarkVars(HORROR_ECG_FLAT_MASK, 'igs-hw-still 1s linear infinite')}}`,
    `${waitOn} #igs-text::after{width:1.7em;}`,
    '@keyframes igs-hw-still{from,to{opacity:1;}}',
].join('\n');
