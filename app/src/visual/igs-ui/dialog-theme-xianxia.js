import { buildDialogFrameCss, scalePx, stroke } from './dialog-skin-frame.js';

export const DIALOG_SKIN_XIANXIA_INK = 'xianxia-ink';

// 仙侠水墨：宣纸素底、淡墨远山，只用一道剑气细线（淡青起、墨收）定住姓名，右侧大片留白；
// 朱砂只留给点击印与头像小印。与青绿山水同属古代皮肤，但去青绿设色、改纯水墨，更冷清、更江湖气。
const PAPER = '244,241,234';
const INK = '#1f2523';
const QING = '95,127,134';
const QING_RGB = '95,127,134';
const ZHU = '#b23a2a';
const LINE_Y = 80;
const NARRATION_LINE_Y = 56;

// 宣纸随场景时段变化：晨微暖、昏转褐、夜沉为青灰、深夜再暗一档。墨字仍用排版设置里的颜色，夜里只把底色压暗变冷。
// 夜里压暗有下限：旁白淡墨在深夜纸上仍要读得清（对比度约 3.5:1 以上）。
const PAPER_BY_TIME = Object.freeze({ dawn: '246,241,233', dusk: '240,232,220', night: '206,211,213', midnight: '190,197,201' });
const paper = (alpha) => `rgba(var(--xia-paper,${PAPER}),${alpha})`;
export const xianxiaPaper = paper;
const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_XIANXIA_INK}"]`;

// 右下一道极淡的水墨远山，仅作底纹：焦墨主峰、淡墨远峦，山脚化入纸色。
const MOUNTAINS = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 480 100' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='m' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%231f2523'/%3E%3Cstop offset='1' stop-color='%231f2523' stop-opacity='0'/%3E%3C/linearGradient%3E%3ClinearGradient id='f' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%235f7f86'/%3E%3Cstop offset='1' stop-color='%235f7f86' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cg opacity='.18'%3E%3Cpath fill='url(%23f)' opacity='.6' d='M0 100C40 94 72 80 100 72C122 66 134 54 152 50C168 46 180 56 196 60C216 64 230 52 248 46C264 41 278 50 292 56C322 68 362 64 402 70C432 74 458 82 480 86V100Z'/%3E%3Cpath fill='url(%23m)' d='M150 100C182 92 206 78 226 68C240 61 246 42 258 28C266 19 274 22 280 32C288 46 296 52 308 50C320 48 326 34 336 30C346 26 354 38 362 48C374 62 394 66 416 72C442 78 464 86 480 88V100Z'/%3E%3C/g%3E%3C/svg%3E";
// 雾的顶边叠三团极淡的墨气，让边缘有轻微起伏。
const CLOUDS = [[20, 30, 22, 38, '.26'], [62, 26, 30, 30, '.2'], [86, 34, 16, 34, '.18']]
    .map(([x, y, rx, ry, a]) => `radial-gradient(ellipse ${rx}% ${ry}% at ${x}% ${y}%,${paper(a)},${paper(0)} 70%)`).join(',');
// 雾只在最顶上一小段化开；姓名行（约 20%）起纸色就要够厚，否则暗场景透上来墨字发灰看不清。
const MIST = `linear-gradient(180deg,${paper(0)} 0,${paper('.78')} 12%,${paper('.92')} 26%,${paper('.95')} 44%,${paper('.96')})`;
// 剑气细线：淡青起笔、墨色收锋，一道横掠的留白线定住姓名。
const SWORDLINE = `linear-gradient(90deg,rgba(${QING_RGB},0),rgba(${QING_RGB},.55) 8%,rgba(31,37,35,.5) 32%,rgba(31,37,35,0) 60%)`;
const SWORDLINE_NARRATION = `linear-gradient(90deg,rgba(${QING_RGB},0),rgba(${QING_RGB},.32) 7%,rgba(31,37,35,.26) 18%,rgba(31,37,35,0) 34%)`;
const bgSize = (mountain) => `${mountain},100% 1px,100% 100%,100% 100%,100% 100%,100% 100%`;

const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_XIANXIA_INK}"]`;

export const XIANXIA_DIALOG_STYLE = [
    ...Object.entries(PAPER_BY_TIME).map(([time, rgb]) => `${overlayScope}[data-igs-scene-time="${time}"]{--xia-paper:${rgb};}`),
    buildDialogFrameCss(DIALOG_SKIN_XIANXIA_INK, {
        height: 196,
        text: { top: NARRATION_LINE_Y + 14, speakerTop: LINE_Y + 14, right: 72, bottom: 24, left: 72 },
        rise: 0,
        flush: true,
        frameCss: `background-color:transparent;background-image:url("${MOUNTAINS}"),var(--xia-sword),${CLOUDS},${MIST};background-position:right bottom,0 var(--xia-line-y),0 0,0 0,0 0,0 0;background-size:${bgSize('460px 96px')};background-repeat:no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
        // 姓名不托底牌，墨字直接落在纸上；1px 纸色实描边在纸较薄处托住字形。
        speakerCss: `left:72px;top:${LINE_Y - 40}px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 144px);height:32px;line-height:32px;padding:0;background:none;border:0;font-size:20px;font-weight:400;letter-spacing:.2em;text-shadow:${stroke(paper('.9'))},0 0 6px ${paper('.85')};`,
        textCss: `letter-spacing:.06em;text-shadow:0 0 2px ${paper('.95')},0 0 6px ${paper('.8')};`,
    }),
    scalePx(`${scope}{--xia-sword:${SWORDLINE};--xia-line-y:${LINE_Y}px;}`),
    scalePx(`${scope}:not([data-igs-has-speaker="1"]){--xia-sword:${SWORDLINE_NARRATION};--xia-line-y:${NARRATION_LINE_Y}px;}`),
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:36px;padding-right:36px;background-size:${bgSize('300px 63px')};}${scope} .igs-speaker{left:36px;max-width:calc(100% - 72px);}`)}}`,
].join('\n');

// 选项：两端化开的纸带，上下各一道同样收笔的淡青细线；悬停时线转墨、字转淡青。
const choiceLine = (rgb, alpha, edge) => `linear-gradient(90deg,rgba(${rgb},0),rgba(${rgb},${alpha}) 24%,rgba(${rgb},${alpha}) 76%,rgba(${rgb},0)) left ${edge}/100% 1px no-repeat`;
const choiceLines = (rgb, alpha) => `${choiceLine(rgb, alpha, 'top')},${choiceLine(rgb, alpha, 'bottom')}`;
const choiceBand = (alpha) => `linear-gradient(90deg,${paper(0)},${paper(alpha)} 18%,${paper(alpha)} 82%,${paper(0)})`;
const choiceScope = `${overlayScope} .igs-option-bubble`;

export const XIANXIA_CHOICE_STYLE = [
    `${choiceScope}{box-sizing:border-box;min-height:44px;padding:10px 44px;border:0;border-radius:0;background:${choiceLines(QING_RGB, '.55')},${choiceBand('.86')};box-shadow:none;color:${INK};letter-spacing:.14em;text-shadow:none;transition:background .2s,color .2s;}`,
    `${choiceScope}:hover{background:${choiceLines('31,37,35', '.7')},radial-gradient(ellipse 50% 90% at 50% 50%,rgba(${QING_RGB},.14),transparent),${choiceBand('.93')};color:${QING};}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const panel = (alpha) => `background:${paper(alpha)};border:0;border-radius:${s(2)};box-shadow:inset 0 1px 0 rgba(${QING_RGB},.3),inset 0 -1px 0 rgba(${QING_RGB},.3),0 2px 10px rgba(31,37,35,.12);`;

// 状态栏零件：纸面裱条（上下两道淡青细线）、墨色细进度条、头像右下一方朱印。
export const XIANXIA_HUD_THEME = Object.freeze({
    neutral: '#9aa29c',
    panel: panel('.88'),
    toast: `${panel('.96')}color:${INK};text-shadow:none;`,
    ink: INK,
    emotion: `padding:0 ${s(12)};border:0;border-radius:0;background:${paper('.86')};box-shadow:inset 0 -1px 0 rgba(${QING_RGB},.6);color:${QING};letter-spacing:.2em;text-shadow:none;`,
    avatar: `filter:${ring(paper(1), 1.5)} ${ring(`rgba(${QING_RGB},.5)`, 1)};`,
    badge: `content:"";position:absolute;right:${s(-3)};bottom:${s(-3)};width:${s(9)};height:${s(9)};border-radius:${s(1.5)};background:${ZHU};box-shadow:0 0 0 1.5px ${paper(1)};`,
    placeholder: 'background:linear-gradient(180deg,#ebe6d8,#d4dad8);color:#3a4542;',
    placeholderSvg: `fill:none;stroke:${QING};stroke-width:1.3;`,
    track: `height:${s(4)};border:0;border-radius:0;background:rgba(${QING_RGB},.16);`,
    fill: `background:color-mix(in srgb,var(--igs-hud-fill-color) 55%,#3a4542) !important;border-radius:0;`,
    value: 'font-weight:400;',
});
