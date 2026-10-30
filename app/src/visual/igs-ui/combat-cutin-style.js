import { IGS_UI_FONT_SANS, IGS_UI_NIGHT_RGB } from '../../styles/ui-material.js';

// 战斗 cut-in 的立绘分格高宽比（高 / 宽）：样式的 aspect-ratio 与裁切计算共用这一个值，两处不会不一致。
export const COMBAT_CUTIN_FRAME = 1.25;
// 觉醒眼部斜切条的高宽比（高 / 宽）：样式与眼部裁切共用。
export const COMBAT_EYE_FRAME = 0.2;
// 招式名与「觉醒·类型」的拼贴艺术字（剪报式字块，角色名不用）：逐字轮换庞门正道粗书 / 汇文明朝 / 思源黑体字块，缺字落到思源黑体与界面无衬线。
// 三种字体都由 build.js 随包注册并按字切片；COMBAT_CUTIN_ART_FAMILIES 供开面板与播特写时按实际文字预载。
export const COMBAT_CUTIN_ART_FAMILIES = Object.freeze(['IGS-PangMen', 'Huiwen Mincho', 'Source Han Sans CN']);
export const COMBAT_CUTIN_ART_FONT = `"IGS-PangMen","Source Han Sans CN",${IGS_UI_FONT_SANS}`;
const ART_SERIF = '"Huiwen Mincho","Source Han Serif CN",serif';
const ART_SANS = `"Source Han Sans CN",${IGS_UI_FONT_SANS}`;
const N = IGS_UI_NIGHT_RGB;

// 独立命名空间 .igs-combat-cutin-*，不复用阅读器 [igs-fx:cutin] 的 .igs-fx-cutin 样式与关键帧。
// 尺寸用 cq 单位（#igs-combat-panel 是尺寸容器）；不支持容器查询时按小视口单位回落。
// 技能特写：暗幕 + 速度线 + 斜向色带 + 半身立绘（快速推入、缓慢漂移、拉出）+ 角色名与拼贴字招式名（.igs-combat-cutin-ch 逐字盖章落下）+ 一次闪白。
// 减少动态效果：整体淡入淡出，速度线、色带、运镜静止，不闪白；低画质：速度线静止、去投影。
// 开战过场（.igs-combat-opening）：复用色带与闪白节点（不画速度线），「开战」大字斜着砸入后淡出；低画质由 DOM 构造省去闪白，减少动态效果时不播。
// 觉醒特写（.igs-combat-awaken-cutin，其余样式在 combat-panel-style.js）：眼部斜切条切入（.igs-combat-awaken-eye：黑幕上先劈出一道白色斜线，横贯整屏的眼部斜条随即张开并推近，上下各一片情绪色 / 白色碎片对向切入；--aw-lead 为切入时长）与比技能特写更大、带情绪色光晕的半身立绘（.is-awaken，从右侧冲入后缓慢推近，按 --aw-lead 延后进场；窄面板居中）。
export const COMBAT_CUTIN_STYLE_TEXT = `
.igs-combat-cutin{--ct:var(--igs-combat-cutin-tint,#f2c46b);position:absolute;inset:0;overflow:hidden;pointer-events:none;background:linear-gradient(90deg,rgba(${N},.8),rgba(${N},.32) 58%,rgba(${N},.72));animation:igs-combat-cutin-veil var(--igs-fx-life,1800ms) ease-out both;}
.igs-combat-cutin-lines{position:absolute;inset:-20%;opacity:.7;background:repeating-linear-gradient(-12deg,transparent 0 22px,color-mix(in srgb,var(--ct) 24%,transparent) 22px 24px,transparent 24px 52px);animation:igs-combat-cutin-lines .5s linear infinite;}
.igs-combat-cutin-band{position:absolute;left:-12%;right:-12%;top:31%;height:38%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ct) 62%,transparent) 16%,color-mix(in srgb,var(--ct) 82%,#fff 8%) 50%,color-mix(in srgb,var(--ct) 62%,transparent) 84%,transparent);box-shadow:0 0 48px color-mix(in srgb,var(--ct) 55%,transparent);transform:rotate(-8deg);animation:igs-combat-cutin-band var(--igs-fx-life,1800ms) cubic-bezier(.2,.8,.2,1) both;}
.igs-combat-cutin-figure{position:absolute;right:6%;bottom:0;height:min(92cqh,calc(78cqw * ${COMBAT_CUTIN_FRAME}));aspect-ratio:1/${COMBAT_CUTIN_FRAME};transform-origin:50% 30%;filter:drop-shadow(0 18px 30px rgba(0,0,0,.55));animation:igs-combat-cutin-cam var(--igs-fx-life,1800ms) cubic-bezier(.2,.8,.2,1) both;}
.igs-combat-cutin-portrait{position:absolute;inset:0;background-repeat:no-repeat;-webkit-mask-image:linear-gradient(180deg,#000 72%,transparent);mask-image:linear-gradient(180deg,#000 72%,transparent);}
.igs-combat-cutin-cap{position:absolute;left:7%;top:50%;translate:0 -50%;display:flex;flex-direction:column;gap:6px;max-width:min(54%,520px);font-family:${IGS_UI_FONT_SANS};animation:igs-combat-cutin-cap var(--igs-fx-life,1800ms) cubic-bezier(.2,.8,.2,1) both;}
.igs-combat-cutin-name{color:var(--ct);font-size:clamp(11px,1.6cqw,14px);font-weight:700;letter-spacing:.4em;text-shadow:0 1px 3px rgba(0,0,0,.8);}
.igs-combat-cutin-skill{--ch-at:80ms;display:flex;flex-wrap:wrap;align-items:center;gap:.06em;font-family:${COMBAT_CUTIN_ART_FONT};font-size:clamp(24px,min(calc(46cqw / var(--len,4)),8cqh),58px);line-height:1;rotate:-4deg;transform-origin:0 50%;}
.igs-combat-cutin-ch{--f:${COMBAT_CUTIN_ART_FONT};display:inline-block;padding:.07em .1em .05em;font-family:var(--f);font-weight:400;line-height:1;letter-spacing:0;animation:igs-combat-cutin-stamp .34s cubic-bezier(.2,.8,.2,1) calc(var(--ch-at,0ms) + var(--i,0) * 55ms) both;}
.igs-combat-cutin-ch:first-child{font-size:1.22em;}
.igs-combat-cutin-ch[data-v="0"]{background:#fff;color:#0b0b0d;rotate:-5deg;box-shadow:.08em .08em 0 #0b0b0d;}
.igs-combat-cutin-ch[data-v="1"]{--f:${ART_SERIF};background:#0b0b0d;color:#fff;rotate:4deg;font-size:.88em;box-shadow:0 0 0 .05em #fff;}
.igs-combat-cutin-ch[data-v="2"]{background:var(--ct);color:#0b0b0d;rotate:-2deg;font-size:1.06em;box-shadow:-.06em .06em 0 #fff;}
.igs-combat-cutin-ch[data-v="3"]{--f:${ART_SANS};padding-inline:.04em;color:#fff;rotate:7deg;-webkit-text-stroke:.05em #0b0b0d;paint-order:stroke fill;text-shadow:.07em .07em 0 #0b0b0d;}
.igs-combat-cutin-ch[data-sep]{align-self:center;padding:0;background:none;box-shadow:none;color:#fff;font-size:.62em;rotate:0deg;text-shadow:0 1px 3px rgba(0,0,0,.85);}
@keyframes igs-combat-cutin-stamp{0%{opacity:0;scale:2.3;}55%{opacity:1;scale:.9;}100%{opacity:1;scale:1;}}
.igs-combat-cutin-flash{position:absolute;inset:0;background:#fff;mix-blend-mode:screen;animation:igs-combat-cutin-flash .32s ease-out both;}
.igs-combat-cutin-figure.is-awaken{right:3%;height:min(100cqh,calc(66cqw * ${COMBAT_CUTIN_FRAME}));transform-origin:50% 30%;filter:drop-shadow(0 0 24px color-mix(in srgb,var(--aw,#f2c46b) 70%,transparent)) drop-shadow(0 18px 30px rgba(0,0,0,.55));animation:igs-combat-awaken-cam var(--aw-main,2400ms) cubic-bezier(.2,.8,.2,1) var(--aw-lead,0ms) both;}
@container igs-combat (max-width:720px){.igs-combat-cutin-figure:not(.is-awaken){right:50%;translate:50% 0;}.igs-combat-cutin-figure.is-awaken{right:50%;translate:50% 0;height:min(84cqh,calc(100cqw * ${COMBAT_CUTIN_FRAME}));}.igs-combat-cutin-cap{left:6%;right:6%;top:auto;bottom:8%;translate:none;max-width:none;align-items:center;text-align:center;}.igs-combat-cutin-skill{justify-content:center;font-size:clamp(24px,min(calc(80cqw / var(--len,4)),8cqh),52px);}}
@keyframes igs-combat-cutin-veil{0%{opacity:0;}8%,84%{opacity:1;}100%{opacity:0;}}
@keyframes igs-combat-cutin-lines{from{background-position:0 0;}to{background-position:-104px 0;}}
@keyframes igs-combat-cutin-band{0%{opacity:0;transform:rotate(-8deg) translateX(-110%) scaleY(.4);}14%{opacity:1;transform:rotate(-8deg) translateX(0) scaleY(1);}84%{opacity:1;transform:rotate(-8deg) translateX(3%) scaleY(1);}100%{opacity:0;transform:rotate(-8deg) translateX(110%) scaleY(.6);}}
@keyframes igs-combat-cutin-cam{0%{opacity:0;transform:translateX(18%) scale(1.18);}16%{opacity:1;transform:translateX(0) scale(1.06);}82%{opacity:1;transform:translateX(-2%) scale(1);}100%{opacity:0;transform:translateX(-14%) scale(.98);}}
@keyframes igs-combat-cutin-cap{0%{opacity:0;transform:translateX(-24px) skewX(-12deg);}18%{opacity:1;transform:translateX(0) skewX(-6deg);}84%{opacity:1;transform:translateX(6px) skewX(-6deg);}100%{opacity:0;transform:translateX(20px) skewX(-6deg);}}
@keyframes igs-combat-cutin-flash{0%{opacity:.85;}100%{opacity:0;}}
@keyframes igs-combat-cutin-fade{0%,100%{opacity:0;}12%,86%{opacity:1;}}
@keyframes igs-combat-awaken-cam{0%{opacity:0;transform:translateX(34%) scale(1.3);}9%{opacity:1;transform:translateX(-3%) scale(1.02);}15%{transform:none;}86%{opacity:1;transform:scale(1.07);}100%{opacity:0;transform:translateX(-8%) scale(1.1);}}
.igs-combat-awaken-eye{position:absolute;inset:0;z-index:3;overflow:hidden;background:#000;animation:igs-combat-awaken-eye var(--aw-lead,400ms) linear both;}
.igs-combat-awaken-eye-strip{position:absolute;left:50%;top:50%;width:120%;aspect-ratio:1/${COMBAT_EYE_FRAME};translate:-50% -50%;rotate:-9deg;background-color:color-mix(in srgb,var(--aw,#f2c46b) 30%,#000);background-repeat:no-repeat;animation:igs-combat-awaken-slash var(--aw-lead,400ms) cubic-bezier(.2,.8,.2,1) both;}
.igs-combat-awaken-eye-strip::before,.igs-combat-awaken-eye-strip::after{content:'';position:absolute;height:max(5px,8%);animation:igs-combat-awaken-shard var(--aw-lead,400ms) cubic-bezier(.2,.8,.2,1) both;}
.igs-combat-awaken-eye-strip::before{--sd:-1;left:-4%;right:34%;bottom:calc(100% + max(3px,4%));background:var(--aw,#f2c46b);}
.igs-combat-awaken-eye-strip::after{--sd:1;left:28%;right:-4%;top:calc(100% + max(3px,4%));background:color-mix(in srgb,var(--aw,#f2c46b) 25%,#fff);}
@keyframes igs-combat-awaken-eye{0%,82%{opacity:1;}100%{opacity:0;}}
@keyframes igs-combat-awaken-slash{0%,20%{scale:1.04 .03;filter:brightness(0) invert(1);}30%{scale:1.04 .5;filter:brightness(1.6) invert(0);}46%{scale:1.04 1;filter:brightness(1.1) invert(0);}100%{scale:1.14 1.08;filter:brightness(1) invert(0);}}
@keyframes igs-combat-awaken-shard{0%,14%{opacity:0;translate:calc(var(--sd) * 70%) 0;}42%{opacity:1;translate:0 0;}100%{opacity:1;translate:calc(var(--sd) * -4%) 0;}}
.igs-combat-awaken-cutin.is-low .igs-combat-awaken-eye-strip::before,.igs-combat-awaken-cutin.is-low .igs-combat-awaken-eye-strip::after,#igs-overlay[data-igs-quality="low"] .igs-combat-awaken-eye-strip::before,#igs-overlay[data-igs-quality="low"] .igs-combat-awaken-eye-strip::after{animation:none;}
.igs-combat-cutin.is-low .igs-combat-cutin-lines,.igs-combat-awaken-cutin.is-low .igs-combat-cutin-lines,#igs-overlay[data-igs-quality="low"] .igs-combat-cutin-lines{animation:none;}
.igs-combat-cutin.is-low .igs-combat-cutin-figure,.igs-combat-awaken-cutin.is-low .igs-combat-cutin-figure,#igs-overlay[data-igs-quality="low"] .igs-combat-cutin-figure{filter:none;}
.igs-combat-cutin.is-reduced{animation:igs-combat-cutin-fade var(--igs-fx-life,1800ms) linear both;}
.igs-combat-cutin.is-reduced :is(.igs-combat-cutin-lines,.igs-combat-cutin-band,.igs-combat-cutin-figure,.igs-combat-cutin-cap,.igs-combat-cutin-ch),.igs-combat-awaken-cutin.is-reduced :is(.igs-combat-cutin-figure,.igs-combat-cutin-ch){animation:none;}
@media (prefers-reduced-motion:reduce){.igs-combat-cutin{animation:igs-combat-cutin-fade var(--igs-fx-life,1800ms) linear both;}.igs-combat-cutin :is(.igs-combat-cutin-lines,.igs-combat-cutin-band,.igs-combat-cutin-figure,.igs-combat-cutin-cap),.igs-combat-awaken-cutin .igs-combat-cutin-figure,.igs-combat-cutin-ch{animation:none!important;}.igs-combat-cutin-flash{display:none;}}
.igs-combat-opening{--ct:#f2c46b;position:absolute;inset:0;overflow:hidden;pointer-events:none;background:linear-gradient(100deg,rgba(${N},.84),rgba(${N},.5) 50%,rgba(${N},.84));animation:igs-combat-cutin-veil var(--igs-fx-life,800ms) ease-out both;}
.igs-combat-opening-word{position:absolute;left:50%;top:50%;translate:-50% -50%;padding-left:.18em;color:#fff;font-family:${IGS_UI_FONT_SANS};font-size:clamp(56px,min(20cqw,24cqh),168px);font-weight:900;letter-spacing:.18em;line-height:1;white-space:nowrap;text-shadow:0 0 28px color-mix(in srgb,var(--ct) 85%,transparent),0 4px 12px rgba(0,0,0,.85);animation:igs-combat-opening-slam var(--igs-fx-life,800ms) cubic-bezier(.2,.8,.2,1) both;}
@keyframes igs-combat-opening-slam{0%{opacity:0;transform:scale(2.2) skewX(-16deg);}24%{opacity:1;transform:scale(.96) skewX(-10deg);}80%{opacity:1;transform:scale(1) skewX(-10deg);}100%{opacity:0;transform:scale(1.08) skewX(-10deg);}}
@media (prefers-reduced-motion:reduce){.igs-combat-opening{display:none;}}
`;
