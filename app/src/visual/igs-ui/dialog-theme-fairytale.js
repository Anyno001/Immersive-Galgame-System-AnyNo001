import { buildDialogFrameCss, scalePx, stroke } from './dialog-skin-frame.js';

export const DIALOG_SKIN_FAIRY_TALE = 'fairy-tale';

// 童话小镇：取手绘绘本的奶油纸、鼠尾草绿与暖棕。对话框是一条半透明纸带，顶边一排细小的波浪花边（像遮阳棚的荷叶边），
// 姓名前一枝小叶芽、下方一行渐隐的圆点虚线；右下角极淡的尖顶小屋与城堡剪影、右上角三颗暖金小星只作点缀，不与画面争主。
const SAGE = '122,138,82';
const MOSS = '#5e6b3c';
const INK = '#4a4034';
const LAMP = '#d9a441';
const SCALLOP = 7;
const LINE_Y = 58;
const NARRATION_LINE_Y = 30;

// 纸色随场景时段（overlay 的 data-igs-scene-time）变化：晨微粉、昏转杏、夜里压暗成灯下的旧纸；墨字不翻色。
const PAPER_BY_TIME = Object.freeze({ dawn: '250,240,234', dusk: '249,234,212', night: '192,190,176', midnight: '160,160,150' });
const PAPER_DAY = '250,246,234';
const paper = (alpha) => `rgba(var(--ft-paper,${PAPER_DAY}),${alpha})`;
export const fairyPaper = paper;
const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_FAIRY_TALE}"]`;
const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_FAIRY_TALE}"]`;

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
// 小镇剪影：两间尖顶小屋夹一座带旗的城堡，旁边一团圆树；鼠尾草绿自上而下化入纸色。
const TOWN = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 90"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f8250"/><stop offset=".7" stop-color="#8fa27a" stop-opacity=".5"/><stop offset="1" stop-color="#8fa27a" stop-opacity="0"/></linearGradient></defs><g fill="url(#g)" opacity=".22"><path d="M0 90V62L25 32L50 62V90ZM58 90V48L70 14L82 48V90ZM82 90V58L106 34L130 58V90ZM128 90V60L136 40L144 60V90ZM146 90V66L173 44L200 66V90ZM200 90V60L213 36L226 60V90Z"/><path d="M69.4 15V3H70.6V15ZM70.6 3L79 6L70.6 9Z"/><circle cx="242" cy="72" r="16"/><circle cx="258" cy="78" r="12"/></g></svg>`);
const SPARKLE = 'M12 1.5C12.7 8.1 15.9 11.3 22.5 12C15.9 12.7 12.7 15.9 12 22.5C11.3 15.9 8.1 12.7 1.5 12C8.1 11.3 11.3 8.1 12 1.5Z';
const STARS = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">${[[8, 14, 0.62], [52, 2, 0.42], [88, 12, 0.88]]
    .map(([x, y, k]) => `<path fill="${LAMP}" transform="translate(${x} ${y}) scale(${k})" d="${SPARKLE}"/>`).join('')}</svg>`);
const SPRIG = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 20C9 15 12 11 19 4" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/><path d="M12 11C10 6 12 3 16 2C17 6 15 10 12 11Z"/><path d="M9 15C5 14 3 11 3 8C7 8 10 11 9 15Z"/></svg>`);
export const FAIRY_SPARKLE_MASK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${SPARKLE}"/></svg>`);

// 花边用整行半圆拼出，颜色与纸带顶端一致，接缝处不出现色阶。
const SCALLOPS = `radial-gradient(circle at 50% 100%,${paper('.74')} ${SCALLOP - 0.5}px,${paper(0)} ${SCALLOP}px)`;
const BODY = `linear-gradient(180deg,${paper('.74')},${paper('.8')} 40%,${paper('.88')})`;
const bgSize = (town) => `${town},${SCALLOP * 2}px ${SCALLOP}px,100% calc(100% - ${SCALLOP}px)`;
const DOTS = `radial-gradient(circle,rgba(${SAGE},.7) 1.2px,transparent 1.7px) 0 50%/9px 100% repeat-x`;

export const FAIRY_DIALOG_STYLE = [
    ...Object.entries(PAPER_BY_TIME).map(([time, rgb]) => `${overlayScope}[data-igs-scene-time="${time}"]{--ft-paper:${rgb};}`),
    buildDialogFrameCss(DIALOG_SKIN_FAIRY_TALE, {
        height: 184,
        text: { top: NARRATION_LINE_Y + 14, speakerTop: LINE_Y + 14, right: 72, bottom: 22, left: 72 },
        rise: 0,
        flush: true,
        frameCss: `background-color:transparent;background-image:${TOWN},${SCALLOPS},${BODY};background-position:right 40px bottom,0 0,0 ${SCALLOP}px;background-size:${bgSize('300px 100px')};background-repeat:no-repeat,repeat-x,no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
        // 叶芽画在姓名的左内边距里，长名仍可省略号截断。
        speakerCss: `left:46px;top:${LINE_Y - 36}px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 118px);height:30px;line-height:30px;padding:0 0 0 26px;background:none;border:0;font-size:20px;font-weight:400;letter-spacing:.12em;text-shadow:${stroke(paper('.6'))};`,
        textCss: `letter-spacing:.05em;text-shadow:0 1px 0 ${paper('.55')};`,
    }),
    scalePx(`${scope}{--ft-line-y:${LINE_Y}px;--ft-line-w:44%;}`),
    scalePx(`${scope}:not([data-igs-has-speaker="1"]){--ft-line-y:${NARRATION_LINE_Y}px;--ft-line-w:22%;}`),
    // 圆点虚线：自姓名起笔，向右渐隐。
    scalePx(`${scope}::before{content:"";position:absolute;left:66px;top:var(--ft-line-y);width:var(--ft-line-w);height:4px;margin-top:-2px;background:${DOTS};-webkit-mask:linear-gradient(90deg,#000 55%,transparent);mask:linear-gradient(90deg,#000 55%,transparent);pointer-events:none;}`),
    scalePx(`${scope}::after{content:"";position:absolute;right:56px;top:-26px;width:120px;height:40px;background:${STARS} 0 0/100% 100% no-repeat;filter:drop-shadow(0 0 2px ${paper('.9')});pointer-events:none;opacity:.8;animation:igs-ft-twinkle 5.2s ease-in-out infinite alternate;will-change:opacity;}`),
    '@keyframes igs-ft-twinkle{0%{opacity:.5}60%{opacity:1}100%{opacity:.7}}',
    `#igs-overlay[data-igs-paused] .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_FAIRY_TALE}"]::after{animation-play-state:paused;}`,
    `@media (prefers-reduced-motion: reduce){${scope}::after{animation:none;opacity:.85;}}`,
    scalePx(`${scope} .igs-speaker::before{content:"";position:absolute;left:0;top:50%;width:18px;height:18px;margin-top:-10px;background:rgb(${SAGE});-webkit-mask:${SPRIG} center/contain no-repeat;mask:${SPRIG} center/contain no-repeat;}`),
    // 窄屏收窄两侧留白，剪影同比缩小，星点收进右侧。
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:40px;padding-right:36px;background-position:right 12px bottom,0 0,0 ${SCALLOP}px;background-size:${bgSize('190px 63px')};}${scope} .igs-speaker{left:14px;max-width:calc(100% - 50px);}${scope}::before{left:34px;}${scope}::after{right:16px;}`)}}`,
].join('\n');

// 选项：奶油纸胶囊、一圈极细的鼠尾草绿描边；悬停时纸面泛绿，左侧亮起一颗小星。
const choiceScope = `${overlayScope} .igs-option-bubble`;

export const FAIRY_CHOICE_STYLE = [
    `${choiceScope}{box-sizing:border-box;min-height:44px;padding:10px 44px;border:0;border-radius:999px;background:${paper('.9')};box-shadow:inset 0 0 0 1px rgba(${SAGE},.38),0 2px 8px rgba(60,50,30,.12);color:${INK};letter-spacing:.1em;text-shadow:none;}`,
    `${choiceScope}::before{content:"";position:absolute;left:20px;top:50%;width:11px;height:11px;margin-top:-5.5px;background:${LAMP};-webkit-mask:${FAIRY_SPARKLE_MASK} center/contain no-repeat;mask:${FAIRY_SPARKLE_MASK} center/contain no-repeat;opacity:0;transform:scale(.6);transition:opacity .2s,transform .2s;}`,
    `${choiceScope}:hover{background:linear-gradient(rgba(${SAGE},.16),rgba(${SAGE},.16)),${paper('.95')};box-shadow:inset 0 0 0 1px rgba(${SAGE},.7),0 3px 10px rgba(60,50,30,.16);color:${MOSS};}`,
    `${choiceScope}:hover::before{opacity:1;transform:scale(1);}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const panel = (alpha) => `background:${paper(alpha)};border:0;border-radius:${s(12)};box-shadow:inset 0 0 0 1px rgba(${SAGE},.3),0 2px 10px rgba(60,50,30,.12);`;

// 状态栏零件：圆角纸卡、鼠尾草绿胶囊情绪签、头像右下一颗灯火色小圆点。
export const FAIRY_HUD_THEME = Object.freeze({
    neutral: '#a8a48f',
    panel: panel('.88'),
    toast: `${panel('.96')}color:${INK};text-shadow:none;`,
    ink: INK,
    emotion: `padding:0 ${s(12)};border:0;border-radius:999px;background:rgb(${SAGE});box-shadow:0 0 0 1.5px ${paper(1)};color:#fffaf0;letter-spacing:.12em;text-shadow:none;`,
    avatar: `filter:${ring(paper(1), 2)} ${ring(`rgba(${SAGE},.55)`, 1)};`,
    badge: `content:"";position:absolute;right:${s(-2)};bottom:${s(-2)};width:${s(9)};height:${s(9)};border-radius:50%;background:${LAMP};box-shadow:0 0 0 1.5px ${paper(1)};`,
    placeholder: 'background:linear-gradient(180deg,#f3eedd,#dfe5cc);color:#5e6b3c;',
    placeholderSvg: 'fill:none;stroke:#5e6b3c;stroke-width:1.3;',
    track: `height:${s(6)};border:0;border-radius:999px;background:rgba(${SAGE},.18);`,
    fill: `background:color-mix(in srgb,var(--igs-hud-fill-color) 60%,rgb(${SAGE})) !important;border-radius:999px;`,
    value: 'font-weight:400;',
});
