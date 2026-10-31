import { FX_STYLE_TEXT } from './fx-style.js';
import { logThemeStyleText } from './log-reader-theme.js';
import { LOG_AVATAR_BOX, LOG_PERCENTS } from './log-reader-model.js';
import { getLogFrameStyleText } from './dialog-theme-item-frames.js';

// 情绪胶囊的字色取漫画符号同一套色相（fx-style 里 .igs-fx-symbol[data-kind] 的 --igs-fx-hue），不另抄一份。
const CHIP_HUES = [...FX_STYLE_TEXT.matchAll(/\.igs-fx-symbol\[data-kind="([a-z-]+)"\]\{--igs-fx-hue:(#[0-9a-fA-F]{3,8})/g)]
    .map(([, kind, hue]) => `#igs-log .igs-log-chip[data-kind="${kind}"]{--igs-log-hue:${hue};}`).join('');

const CARD = LOG_AVATAR_BOX.card;
const BREAK = LOG_AVATAR_BOX.break;
const ON = '#igs-overlay[data-igs-log-reader="on"]';
const PERCENT_RULES = LOG_PERCENTS.map((n) => `#igs-log[data-veil="${n}"]{--igs-log-h:${n}%;}#igs-log[data-density="${n}"] .igs-log-veil{opacity:${n / 100};}`).join('');

// 作用域：#igs-overlay[data-igs-log-reader="on"]。背景、CG、天气、调色照常；立绘、同屏、对话框正文让给 log 列表。
// 配色变量挂在 overlay 上（列表与底部输入框共用）：默认值在前，逐皮肤规则同特异性、排在后面覆盖。
export const LOG_READER_STYLE_TEXT = `
${ON}{--igs-log-veil:18 18 20;--igs-log-ink:#f4f1f6;--igs-log-narr:#d9d3e0;--igs-log-thought:#c9bfe0;--igs-log-sub:#a9a3b2;--igs-log-line:#34323a;--igs-log-plate:#26242b;--igs-log-acc:var(--igs-cw-color,var(--igs-log-ink));--igs-log-h:85%;--igs-log-fs:15px;--igs-log-foot:64px;}
${logThemeStyleText()}
${CHIP_HUES}
#igs-log{display:none;}
${ON} #igs-log{display:block;position:absolute;inset:0;z-index:1;pointer-events:none;}
${PERCENT_RULES}
${ON} :is(#igs-sprite,#igs-cast,#igs-giant,#igs-gradient-veil,.igs-cg-portrait){display:none!important;}
${ON} #igs-stage-motion.igs-stage-shake-active{animation:none!important;}
${ON} #igs-fx-front .igs-fx-flash{display:none!important;}
${ON} #igs-dialog-layer .igs-dialog{left:0!important;right:0!important;bottom:0!important;top:auto!important;width:auto!important;max-width:none!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:8px 18px max(12px,env(safe-area-inset-bottom))!important;transform:none!important;background:none!important;background-image:none!important;border:0!important;border-image:none!important;border-radius:0!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;z-index:2;}
${ON} #igs-dialog-layer .igs-dialog::before,${ON} #igs-dialog-layer .igs-dialog::after{display:none!important;}
${ON} #igs-dialog-layer .igs-dialog>:not(.igs-controls):not(#igs-dialog-bar){display:none!important;}
${ON} #igs-dialog-layer .igs-dialog #igs-dialog-bar{color:var(--igs-log-sub);}
${ON} #igs-dialog-layer .igs-dialog .igs-input{background:var(--igs-log-plate)!important;color:var(--igs-log-ink)!important;border:0!important;box-shadow:none!important;}
${ON} #igs-dialog-layer .igs-dialog .igs-input::placeholder{color:var(--igs-log-sub)!important;}
${ON} #igs-dialog-layer .igs-dialog .igs-send-btn{background:var(--igs-log-acc)!important;color:rgb(var(--igs-log-veil))!important;border:0!important;box-shadow:none!important;}
/* 自下而上的渐变：下半段实色，往上很快转浓，只在最顶端一小段过渡到透明。 */
#igs-log .igs-log-veil{position:absolute;left:0;right:0;bottom:0;height:var(--igs-log-h);background:linear-gradient(to top,rgb(var(--igs-log-veil)) 0%,rgb(var(--igs-log-veil)) 62%,rgb(var(--igs-log-veil) / .94) 78%,rgb(var(--igs-log-veil) / .7) 90%,rgb(var(--igs-log-veil) / 0) 100%);}
/* 闪白只闪背景：压在渐变之下。 */
#igs-log .igs-log-flash{position:absolute;inset:0;background:#fff;opacity:0;}
#igs-log .igs-log-flash.is-on{animation:igs-log-flash .8s ease-out both;}
@keyframes igs-log-flash{0%{opacity:.85;}100%{opacity:0;}}
#igs-log .igs-log-scroll{position:absolute;left:0;right:0;bottom:var(--igs-log-foot);top:calc(100% - var(--igs-log-h) + 40px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;display:flex;flex-direction:column;padding:0 18px;pointer-events:auto;cursor:pointer;-webkit-mask:linear-gradient(to bottom,transparent 0,#000 56px);mask:linear-gradient(to bottom,transparent 0,#000 56px);user-select:none;-webkit-user-select:none;}
#igs-log .igs-log-scroll::-webkit-scrollbar{display:none;}
#igs-log .igs-log-list{margin-top:auto;display:flex;flex-direction:column;padding-top:56px;}
#igs-log,#igs-log .igs-log-scroll{transition:opacity .35s;}
/* 隐藏对话：渐变与列表一起淡出，只留背景 / CG 与工具栏；点画面恢复。 */
#igs-log[data-hidden] .igs-log-scroll,#igs-log[data-hidden] .igs-log-veil{opacity:0;pointer-events:none;}
/* 两栏：头像列固定宽，正文列左右对齐到同一条线；▶ 钉在右上角，有 ▶ 的行正文让出一列。
   --igs-log-pt 是行顶留白，▶ 跟着它对齐首行；带头像的组头多留一截，情绪符号不贴分割线。 */
#igs-log .igs-log-row{--igs-log-pt:22px;display:grid;grid-template-columns:${CARD.w}px 1fr;column-gap:14px;padding:var(--igs-log-pt) 0 22px;position:relative;opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s;}
#igs-log .igs-log-row.is-in{opacity:1;transform:none;}
#igs-log .igs-log-row.is-old .igs-log-body{opacity:.6;}
#igs-log .igs-log-row.is-old .igs-log-av{filter:saturate(.7) brightness(.9);}
#igs-log .igs-log-row:not(.is-narr):not(.is-cont):not(.is-noav){--igs-log-pt:34px;}
#igs-log[data-shape="break"] .igs-log-row:not(.is-narr):not(.is-cont):not(.is-noav){--igs-log-pt:${34 + BREAK.h - CARD.h}px;}
#igs-log .igs-log-row+.igs-log-row::before{content:"";position:absolute;left:0;right:0;top:0;border-top:1px dashed var(--igs-log-line);}
#igs-log .igs-log-row.is-cont{--igs-log-pt:0px;}
#igs-log .igs-log-row:has(+.igs-log-row.is-cont){padding-bottom:10px;}
#igs-log .igs-log-row.is-cont::before,#igs-log .igs-log-row.is-same::before{display:none;}
#igs-log .igs-log-row.is-same:not(.is-noav){--igs-log-pt:18px;}
#igs-log[data-shape="break"] .igs-log-row.is-same:not(.is-noav){--igs-log-pt:${18 + BREAK.h - CARD.h}px;}
#igs-log .igs-log-row.is-same.is-noav{--igs-log-pt:6px;}
#igs-log .igs-log-row.is-cont .igs-log-av{visibility:hidden;height:0;}
#igs-log .igs-log-av{position:relative;width:${CARD.w}px;height:${CARD.h}px;border-radius:14px;background-color:var(--igs-log-plate);background-repeat:no-repeat;grid-column:1;grid-row:1/span 2;align-self:start;transition:filter .35s,box-shadow .2s;}
#igs-log .igs-log-av.is-letter{display:grid;place-items:center;font-size:20px;font-weight:600;color:#121212;background-color:var(--igs-log-hue);}
#igs-log[data-shape="circle"] .igs-log-av{border-radius:50%;}
/* 破框：头顶伸出底板。 */
#igs-log[data-shape="break"] .igs-log-av:not(.is-letter){background:none;}
#igs-log[data-shape="break"] .igs-log-av:not(.is-letter)::before{content:"";position:absolute;left:0;right:0;bottom:0;height:${BREAK.plate}px;border-radius:14px;background:var(--igs-log-plate);}
#igs-log .igs-log-cut{display:none;}
#igs-log[data-shape="break"] .igs-log-cut{display:block;position:absolute;left:0;right:0;bottom:0;height:${BREAK.h}px;border-radius:0 0 14px 14px;background-repeat:no-repeat;}
#igs-log[data-shape="break"] .igs-log-av{margin-top:${CARD.h - BREAK.h}px;height:${BREAK.h}px;}
#igs-log[data-shape="break"] .igs-log-av.is-letter{margin-top:${CARD.h - BREAK.plate}px;height:${BREAK.plate}px;}
#igs-log .igs-log-body{grid-column:2;min-width:0;transition:opacity .35s;}
/* 名字贴头像上沿；只有一行台词时正好落在头像下沿，多行时往下长。 */
#igs-log .igs-log-row:not(.is-narr):not(.is-cont):not(.is-noav) .igs-log-body{display:flex;flex-direction:column;justify-content:space-between;min-height:${CARD.h}px;}
#igs-log .igs-log-name{display:flex;align-items:center;gap:8px;min-height:22px;margin-bottom:2px;font-family:var(--igs-log-name-font,inherit);font-size:15.5px;font-weight:700;line-height:1.2;letter-spacing:.04em;color:color-mix(in oklab,var(--igs-log-hue) 78%,#fff);}
#igs-log[data-tone="light"] .igs-log-name{color:color-mix(in oklab,var(--igs-log-hue) 55%,var(--igs-log-ink));}
/* 重播键：目录回想同款喇叭，无底板。台词紧跟名字（靠右的 User 在名字左边）；旁白浮在末行右端。 */
#igs-log .igs-log-play{flex:none;width:24px;height:22px;margin-left:-2px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--igs-log-sub);display:grid;place-items:center;cursor:pointer;}
/* 旁白没有名字行：键浮在末行右端，末行放不下就落到下一行。 */
#igs-log .igs-log-row.is-narr .igs-log-body{font-size:calc(var(--igs-log-fs) - .5px);}
#igs-log .igs-log-body>.igs-log-play{float:right;margin:calc((var(--igs-log-fs) * 1.75 - 22px) / 2) 0 0 8px;}
#igs-log .igs-log-body:has(>.igs-log-play)>.igs-log-text{display:inline;}
#igs-log[data-user-side="right"] .igs-log-row.is-user .igs-log-body:has(>.igs-log-play){text-align:right;}
#igs-log[data-user-side="right"] .igs-log-row.is-user .igs-log-body>.igs-log-play{float:left;margin-left:0;margin-right:8px;}
#igs-log .igs-log-play svg{width:16px;height:16px;}

#igs-log .igs-log-text{font-family:var(--igs-log-font,inherit);font-size:var(--igs-log-fs);line-height:1.75;color:var(--igs-log-ink);word-break:break-word;text-align:justify;paint-order:stroke fill;-webkit-text-stroke:var(--igs-log-stroke,0 transparent);text-shadow:var(--igs-log-shadow,none);}
#igs-log .igs-log-text .igs-thought{color:var(--igs-log-thought)!important;}
/* 情绪胶囊：名字后的实色小底两字词，不带符号。 */
/* 情绪大小：--igs-log-mk 大 1 / 中 .75 / 小 .5；大号胶囊与名字行同高（22px），符号同步缩放。 */
#igs-log{--igs-log-mk:.75;}
#igs-log[data-mood-size="l"]{--igs-log-mk:1;}
#igs-log[data-mood-size="s"]{--igs-log-mk:.5;}
#igs-log .igs-log-chip{--igs-log-hue:var(--igs-log-sub);display:inline-flex;align-items:center;height:calc(22px * var(--igs-log-mk));padding:0 calc(10px * var(--igs-log-mk));border-radius:99px;background:var(--igs-log-plate);color:color-mix(in oklab,var(--igs-log-hue) 70%,var(--igs-log-ink));font-family:inherit;font-size:max(9px,calc(13.5px * var(--igs-log-mk)));font-weight:500;letter-spacing:0;cursor:pointer;}
/* User：默认与角色同侧同栏；靠右时整行镜像，栏宽不变。关了 User 头像时正文占满整行。 */
#igs-log .igs-log-row.is-noav{grid-template-columns:1fr!important;}
#igs-log .igs-log-row.is-noav .igs-log-av{display:none;}
#igs-log .igs-log-row.is-noav .igs-log-body{grid-column:1!important;}
#igs-log[data-user-side="right"] .igs-log-row.is-user{grid-template-columns:1fr ${CARD.w}px;}
#igs-log[data-user-side="right"] .igs-log-row.is-user .igs-log-av{grid-column:2;}
#igs-log[data-user-side="right"] .igs-log-row.is-user .igs-log-body{grid-column:1;grid-row:1;padding-right:0;}
#igs-log[data-user-side="right"] .igs-log-row.is-user .igs-log-name{justify-content:flex-end;}
/* User 靠右：重播键放在名字左边。 */
#igs-log[data-user-side="right"] .igs-log-row.is-user .igs-log-name .igs-log-play{order:-1;margin:0 -2px 0 0;}
#igs-log[data-user-side="right"] .igs-log-row.is-user .igs-log-text{text-align:right;}

/* 旁白：通栏等宽；段首放句末等待符号（跟随皮肤与用户选的形状）。 */
#igs-log .igs-log-row.is-narr{grid-template-columns:1fr;}
#igs-log .igs-log-row.is-narr .igs-log-body{grid-column:1;}
#igs-log .igs-log-row.is-narr .igs-log-text{font-family:var(--igs-log-narr-font,var(--igs-log-font,inherit));color:var(--igs-log-narr);font-size:calc(var(--igs-log-fs) - .5px);}
#igs-log .igs-log-row.is-narr.is-thought .igs-log-text{color:var(--igs-log-thought);}
#igs-log .igs-log-row.is-narr .igs-log-text::before{content:"";display:inline-block;width:14px;height:14px;margin-right:7px;vertical-align:-1px;background:var(--igs-log-acc);-webkit-mask:var(--igs-cw-mask) center/contain no-repeat;mask:var(--igs-cw-mask) center/contain no-repeat;}
#igs-log .igs-log-label{font-weight:700;margin-right:.4em;color:var(--igs-log-ink);}
#igs-log .igs-log-row.is-thought .igs-log-text{color:var(--igs-log-thought);}
#igs-log .igs-log-row.is-thought:not(.is-narr) .igs-log-text::before{content:"（";}
#igs-log .igs-log-row.is-thought:not(.is-narr) .igs-log-text::after{content:"）";}
/* 换场景：一条分隔线。 */
#igs-log .igs-log-scene{display:flex;align-items:center;justify-content:center;gap:12px;padding:28px 0 14px;font-size:11px;letter-spacing:.3em;color:var(--igs-log-sub);opacity:0;transition:opacity .5s;}
#igs-log .igs-log-scene.is-in{opacity:1;}
#igs-log .igs-log-scene::before,#igs-log .igs-log-scene::after{content:"";width:46px;border-top:1px solid var(--igs-log-line);}
#igs-log .igs-log-scene+.igs-log-row::before{display:none;}
#igs-log .igs-log-scene-card{display:inline-block;padding:6px 16px;border-radius:999px;background:var(--igs-log-plate);color:var(--igs-log-sub);letter-spacing:.3em;}
/* 物品、来电：列表里的小卡片。 */
#igs-log .igs-log-card{display:flex;align-items:center;gap:8px;margin:0 0 14px ${CARD.w + 14}px;padding:8px 12px;border-radius:12px;background:var(--igs-log-plate);color:var(--igs-log-ink);font-size:12.5px;line-height:1.4;}
#igs-log .igs-log-card b{color:var(--igs-log-acc);font-weight:600;}
#igs-log .igs-log-card span{color:var(--igs-log-sub);}
/* 流水展开：每个字淡入，错开播放。 */
#igs-log .igs-log-fl{opacity:0;animation:igs-log-fl .26s ease-out forwards;}
@keyframes igs-log-fl{0%{opacity:0;filter:blur(2px);}100%{opacity:1;filter:none;}}
#igs-log .igs-log-fade{animation:igs-log-fade .42s ease-out both;}
@keyframes igs-log-fade{0%{opacity:0;}100%{opacity:1;}}
/* 震屏的简化：只抖这一行。 */
#igs-log .igs-log-row.is-shake .igs-log-body{animation:igs-log-shake .4s ease-out;}
@keyframes igs-log-shake{20%{transform:translateX(-3px);}40%{transform:translateX(3px);}60%{transform:translateX(-2px);}80%{transform:translateX(1px);}}
/* 情绪符号：头像右上角，入场弹一下；循环只给最新两枚，暂停 / 屏外时停住。复用漫画符号的配色与 SVG。 */
/* 位置：有头位时锚在头顶右侧（--igs-log-sym-x/y 由裁切算出），否则落在头像右上角。 */
${getLogFrameStyleText()}
#igs-log{--igs-log-plate-h:${BREAK.plate}px;}
#igs-log .igs-log-av>.igs-fx-symbol{--igs-fx-size:calc(32px * var(--igs-log-mk));left:calc(var(--igs-log-sym-x,calc(100% + 12px * var(--igs-log-mk) - var(--igs-fx-size) * .6)) - var(--igs-fx-size) * .4);top:calc(var(--igs-log-sym-y,calc(var(--igs-fx-size) * .62 - 12px * var(--igs-log-mk))) - var(--igs-fx-size) * .62);right:auto;margin:0;z-index:2;cursor:pointer;animation:igs-log-pop .45s cubic-bezier(.3,1.6,.5,1) both;}
#igs-log .igs-log-av>.igs-fx-symbol.is-loop{animation:igs-log-pop .45s cubic-bezier(.3,1.6,.5,1) both,var(--igs-log-loop,igs-log-bob) 2.6s ease-in-out .45s infinite;}
#igs-log .igs-log-av>.igs-fx-symbol.is-once{animation:igs-log-pop .45s cubic-bezier(.3,1.6,.5,1) both,var(--igs-log-loop,igs-log-bob) 1.1s ease-in-out .3s 1;}
#igs-log .igs-log-av>.igs-fx-symbol.is-done,#igs-log .igs-log-av>.igs-fx-symbol.is-done *{animation:none!important;}
#igs-log .igs-fx-symbol[data-kind="heart"],#igs-log .igs-fx-symbol[data-kind="blush"],#igs-log .igs-fx-symbol[data-kind="bloom"]{--igs-log-loop:igs-log-beat;}
#igs-log .igs-fx-symbol[data-kind="sweat"],#igs-log .igs-fx-symbol[data-kind="drool"]{--igs-log-loop:igs-log-drip;}
#igs-log .igs-fx-symbol[data-kind="anger"],#igs-log .igs-fx-symbol[data-kind="fire"]{--igs-log-loop:igs-log-shake-sym;}
#igs-overlay[data-igs-paused] #igs-log .igs-fx-symbol.is-loop,#igs-log .igs-log-row.is-off .igs-fx-symbol.is-loop{animation-play-state:paused;}
@keyframes igs-log-pop{0%{transform:scale(.2);opacity:0;}100%{transform:scale(1);opacity:1;}}
@keyframes igs-log-bob{0%,60%,100%{transform:none;}70%{transform:translateY(-4px) scale(1.08);}80%{transform:translateY(0) scale(.96,1.04);}}
@keyframes igs-log-beat{0%,55%,100%{transform:none;}62%{transform:scale(1.18);}70%{transform:scale(.96);}78%{transform:scale(1.1);}88%{transform:none;}}
@keyframes igs-log-drip{0%,50%{transform:none;opacity:1;}80%{transform:translateY(5px);opacity:.3;}81%{transform:translateY(-3px);opacity:0;}100%{transform:none;opacity:1;}}
@keyframes igs-log-shake-sym{0%,62%,100%{transform:none;}66%{transform:rotate(-10deg) scale(1.1);}72%{transform:rotate(8deg) scale(1.1);}78%{transform:rotate(-4deg);}}
/* 调整立绘：头像描一圈强调色，可拖动、滚轮 / 双指缩放。 */
#igs-log[data-editing] .igs-log-av:not(.is-letter){box-shadow:0 0 0 2px var(--igs-log-acc);cursor:grab;touch-action:none;}
#igs-log[data-editing] .igs-log-row.is-cont .igs-log-av{visibility:hidden;}
#igs-log-edit-bar{position:absolute;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:10;display:flex;align-items:center;gap:4px;max-width:calc(100% - 24px);padding:4px 4px 4px 14px;border-radius:18px;background:rgb(var(--igs-log-veil));color:var(--igs-log-ink);font-size:12px;line-height:1;pointer-events:auto;}
#igs-log-edit-bar span{margin-right:6px;color:var(--igs-log-sub);white-space:nowrap;}
#igs-log-edit-bar button{height:28px;min-width:52px;padding:0 12px;border:0;border-radius:999px;background:var(--igs-log-plate);color:inherit;font:inherit;cursor:pointer;white-space:nowrap;}
#igs-log-edit-bar button[data-log-edit="save"]{background:var(--igs-log-acc);color:rgb(var(--igs-log-veil));font-weight:600;}
@media (prefers-reduced-motion:reduce){#igs-log .igs-fx-symbol,#igs-log .igs-fx-symbol *,#igs-log .igs-log-fl,#igs-log .igs-log-fade,#igs-log .igs-log-row.is-shake .igs-log-body,#igs-log .igs-log-flash.is-on{animation:none!important;}#igs-log .igs-log-fl{opacity:1;}}
`;
