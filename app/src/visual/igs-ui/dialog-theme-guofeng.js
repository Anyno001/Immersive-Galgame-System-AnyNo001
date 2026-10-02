import { buildDialogFrameCss, scalePx, stroke } from './dialog-skin-frame.js';

export const DIALOG_SKIN_QINGLV = 'qinglv-shanshui';

// 青绿山水：取《千里江山图》的绢色、石青、石绿。对话框不画框，是从画面底部升起的一层烟岚，
// 顶边完全虚化，让场景自然退进雾里；只用一道左起右收的细线定住姓名，右侧大片留白。
// 右下一抹远山极淡（峰青麓绿、山脚化入雾中），仅作底纹，不与画面争主。朱砂只留给点击印与头像小印。
const SHIQING = '47,93,124';
const SHILV = '79,143,127';
const INK = '#26332f';
const LINE_Y = 80;
const NARRATION_LINE_Y = 56;

// 绢色随场景时段（overlay 的 data-igs-scene-time）变化：晨微粉、昏转缃、夜沉为月白、深夜再暗一档。
// 墨字仍用排版设置里的颜色（可被用户改写），所以夜里只把底色压暗变冷，不翻成深底浅字。
// 变量挂在 overlay 上，选项、状态栏、提示与物品卡片同步取色。
const SILK_BY_TIME = Object.freeze({ dawn: '243,236,232', dusk: '241,229,210', night: '178,186,192', midnight: '150,160,168' });
const SILK_DAY = '244,240,229';
const silk = (alpha) => `rgba(var(--qlv-silk,${SILK_DAY}),${alpha})`;
export const qinglvSilk = silk;
const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_QINGLV}"]`;

const MOUNTAINS = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 480 100' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='f' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%234c7d9b'/%3E%3Cstop offset='1' stop-color='%237fb3a0' stop-opacity='0'/%3E%3C/linearGradient%3E%3ClinearGradient id='n' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%232f5d7c'/%3E%3Cstop offset='.5' stop-color='%234f8f7f'/%3E%3Cstop offset='1' stop-color='%234f8f7f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cg opacity='.16'%3E%3Cpath fill='url(%23f)' opacity='.55' d='M0 100C40 96 70 84 98 78C120 73 132 60 150 56C166 52 178 62 194 66C214 70 228 58 246 52C262 47 276 56 290 62C320 74 360 70 400 76C430 80 456 86 480 88V100Z'/%3E%3Cpath fill='url(%23n)' d='M150 100C180 94 204 82 224 74C238 68 244 50 256 36C264 27 272 30 278 40C286 54 294 60 306 58C318 56 324 42 334 38C344 34 352 46 360 56C372 70 392 74 414 80C440 86 462 92 480 94V100Z'/%3E%3C/g%3E%3C/svg%3E";
// 雾的顶边叠三团极淡的云气，让边缘有轻微起伏，不是一条机械的直线渐变。
const CLOUDS = [[18, 30, 22, 38, '.28'], [63, 26, 30, 30, '.22'], [88, 34, 16, 34, '.2']]
    .map(([x, y, rx, ry, a]) => `radial-gradient(ellipse ${rx}% ${ry}% at ${x}% ${y}%,${silk(a)},${silk(0)} 70%)`).join(',');
const MIST = `linear-gradient(180deg,${silk(0)} 0,${silk('.5')} 22%,${silk('.82')} 40%,${silk('.9')} 58%,${silk('.93')})`;
const HORIZON = `linear-gradient(90deg,rgba(${SHIQING},0),rgba(${SHIQING},.6) 9%,rgba(${SHILV},.42) 34%,rgba(${SHILV},0) 64%)`;
// 旁白没有姓名：线收短、调淡、上移，正文随之上提，版面不留一块空着的名位。
const HORIZON_NARRATION = `linear-gradient(90deg,rgba(${SHIQING},0),rgba(${SHIQING},.34) 8%,rgba(${SHILV},.2) 20%,rgba(${SHILV},0) 36%)`;
const bgSize = (mountain) => `${mountain},100% 1px,100% 100%,100% 100%,100% 100%,100% 100%`;

const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_QINGLV}"]`;

export const QINGLV_DIALOG_STYLE = [
    ...Object.entries(SILK_BY_TIME).map(([time, rgb]) => `${overlayScope}[data-igs-scene-time="${time}"]{--qlv-silk:${rgb};}`),
    buildDialogFrameCss(DIALOG_SKIN_QINGLV, {
        height: 196,
        text: { top: NARRATION_LINE_Y + 14, speakerTop: LINE_Y + 14, right: 72, bottom: 24, left: 72 },
        rise: 0,
        flush: true,
        frameCss: `background-color:transparent;background-image:url("${MOUNTAINS}"),var(--qlv-horizon),${CLOUDS},${MIST};background-position:right bottom,0 var(--qlv-line-y),0 0,0 0,0 0,0 0;background-size:${bgSize('460px 96px')};background-repeat:no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
        // 姓名不托底牌，墨字直接落在雾上；1px 绢色实描边在雾较薄处托住字形。
        speakerCss: `left:72px;top:${LINE_Y - 40}px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 144px);height:32px;line-height:32px;padding:0;background:none;border:0;font-size:20px;font-weight:400;letter-spacing:.2em;text-shadow:${stroke(silk('.55'))};`,
        textCss: `letter-spacing:.06em;text-shadow:0 1px 0 ${silk('.5')};`,
    }),
    scalePx(`${scope}{--qlv-horizon:${HORIZON};--qlv-line-y:${LINE_Y}px;}`),
    scalePx(`${scope}:not([data-igs-has-speaker="1"]){--qlv-horizon:${HORIZON_NARRATION};--qlv-line-y:${NARRATION_LINE_Y}px;}`),
    // 窄屏收窄两侧留白，远山同比缩小，免得占满整条底边。
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:36px;padding-right:36px;background-size:${bgSize('300px 63px')};}${scope} .igs-speaker{left:36px;max-width:calc(100% - 72px);}`)}}`,
].join('\n');

// 选项：两端化开的绢带，上下各一道同样收笔的石青细线；悬停时线转石绿、字转石青。
const choiceLine = (rgb, alpha, edge) => `linear-gradient(90deg,rgba(${rgb},0),rgba(${rgb},${alpha}) 24%,rgba(${rgb},${alpha}) 76%,rgba(${rgb},0)) left ${edge}/100% 1px no-repeat`;
const choiceLines = (rgb, alpha) => `${choiceLine(rgb, alpha, 'top')},${choiceLine(rgb, alpha, 'bottom')}`;
const choiceBand = (alpha) => `linear-gradient(90deg,${silk(0)},${silk(alpha)} 18%,${silk(alpha)} 82%,${silk(0)})`;
const choiceScope = `${overlayScope} .igs-option-bubble`;

export const QINGLV_CHOICE_STYLE = [
    `${choiceScope}{box-sizing:border-box;min-height:44px;padding:10px 44px;border:0;border-radius:0;background:${choiceLines(SHIQING, '.6')},${choiceBand('.86')};box-shadow:none;color:${INK};letter-spacing:.14em;text-shadow:none;transition:background .2s,color .2s;}`,
    `${choiceScope}:hover{background:${choiceLines(SHILV, '.8')},radial-gradient(ellipse 50% 90% at 50% 50%,rgba(${SHILV},.16),transparent),${choiceBand('.93')};color:#1f4c66;}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const panel = (alpha) => `background:${silk(alpha)};border:0;border-radius:${s(2)};box-shadow:inset 0 1px 0 rgba(${SHIQING},.32),inset 0 -1px 0 rgba(${SHIQING},.32),0 2px 10px rgba(30,40,38,.12);`;

// 状态栏零件：绢面裱条（上下两道石青细线）、石绿细进度条、头像右下一方朱印。
export const QINGLV_HUD_THEME = Object.freeze({
    neutral: '#9aa59f',
    panel: panel('.88'),
    toast: `${panel('.96')}color:${INK};text-shadow:none;`,
    ink: INK,
    emotion: `padding:0 ${s(12)};border:0;border-radius:0;background:${silk('.86')};box-shadow:inset 0 -1px 0 rgba(${SHILV},.6);color:#2f5d7c;letter-spacing:.2em;text-shadow:none;`,
    avatar: `filter:${ring(silk(1), 1.5)} ${ring(`rgba(${SHIQING},.5)`, 1)};`,
    badge: `content:"";position:absolute;right:${s(-3)};bottom:${s(-3)};width:${s(9)};height:${s(9)};border-radius:${s(1.5)};background:#b23a2a;box-shadow:0 0 0 1.5px ${silk(1)};`,
    placeholder: 'background:linear-gradient(180deg,#ebe6d8,#d6ded6);color:#2f5d7c;',
    placeholderSvg: 'fill:none;stroke:#2f5d7c;stroke-width:1.3;',
    track: `height:${s(4)};border:0;border-radius:0;background:rgba(${SHIQING},.16);`,
    fill: `background:color-mix(in srgb,var(--igs-hud-fill-color) 55%,#4f8f7f) !important;border-radius:0;`,
    value: 'font-weight:400;',
});
