import { IGS_UI_FONT_SANS, IGS_UI_NIGHT_RGB } from '../../styles/ui-material.js';

// 战斗 cut-in 的立绘分格高宽比（高 / 宽）：样式的 aspect-ratio 与裁切计算共用这一个值，两处不会不一致。
export const COMBAT_CUTIN_FRAME = 1.25;
const N = IGS_UI_NIGHT_RGB;

// 独立命名空间 .igs-combat-cutin-*，不复用阅读器 [igs-fx:cutin] 的 .igs-fx-cutin 样式与关键帧。
// 尺寸用 cq 单位（#igs-combat-panel 是尺寸容器）；不支持容器查询时按小视口单位回落。
// 技能特写：暗幕 + 速度线 + 斜向色带 + 半身立绘（快速推入、缓慢漂移、拉出）+ 角色名与招式名 + 一次闪白。
// 减少动态效果：整体淡入淡出，速度线、色带、运镜静止，不闪白；低画质：速度线静止、去投影。
// 开战过场（.igs-combat-opening）：复用色带与闪白节点（不画速度线），「开战」大字斜着砸入后淡出；低画质由 DOM 构造省去闪白，减少动态效果时不播。
export const COMBAT_CUTIN_STYLE_TEXT = `
.igs-combat-cutin{--ct:var(--igs-combat-cutin-tint,#f2c46b);position:absolute;inset:0;overflow:hidden;pointer-events:none;background:linear-gradient(90deg,rgba(${N},.8),rgba(${N},.32) 58%,rgba(${N},.72));animation:igs-combat-cutin-veil var(--igs-fx-life,1800ms) ease-out both;}
.igs-combat-cutin-lines{position:absolute;inset:-20%;opacity:.7;background:repeating-linear-gradient(-12deg,transparent 0 22px,color-mix(in srgb,var(--ct) 24%,transparent) 22px 24px,transparent 24px 52px);animation:igs-combat-cutin-lines .5s linear infinite;}
.igs-combat-cutin-band{position:absolute;left:-12%;right:-12%;top:31%;height:38%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ct) 62%,transparent) 16%,color-mix(in srgb,var(--ct) 82%,#fff 8%) 50%,color-mix(in srgb,var(--ct) 62%,transparent) 84%,transparent);box-shadow:0 0 48px color-mix(in srgb,var(--ct) 55%,transparent);transform:rotate(-8deg);animation:igs-combat-cutin-band var(--igs-fx-life,1800ms) cubic-bezier(.2,.8,.2,1) both;}
.igs-combat-cutin-figure{position:absolute;right:6%;bottom:0;height:min(92cqh,calc(78cqw * ${COMBAT_CUTIN_FRAME}));aspect-ratio:1/${COMBAT_CUTIN_FRAME};transform-origin:50% 30%;filter:drop-shadow(0 18px 30px rgba(0,0,0,.55));animation:igs-combat-cutin-cam var(--igs-fx-life,1800ms) cubic-bezier(.2,.8,.2,1) both;}
.igs-combat-cutin-portrait{position:absolute;inset:0;background-repeat:no-repeat;-webkit-mask-image:linear-gradient(180deg,#000 72%,transparent);mask-image:linear-gradient(180deg,#000 72%,transparent);}
.igs-combat-cutin-cap{position:absolute;left:7%;top:50%;translate:0 -50%;display:flex;flex-direction:column;gap:6px;max-width:min(54%,520px);font-family:${IGS_UI_FONT_SANS};animation:igs-combat-cutin-cap var(--igs-fx-life,1800ms) cubic-bezier(.2,.8,.2,1) both;}
.igs-combat-cutin-name{color:var(--ct);font-size:clamp(11px,1.6cqw,14px);font-weight:700;letter-spacing:.4em;text-shadow:0 1px 3px rgba(0,0,0,.8);}
.igs-combat-cutin-skill{color:#fff;font-size:clamp(22px,min(6cqw,7cqh),48px);font-weight:800;letter-spacing:.08em;line-height:1.15;text-shadow:0 0 18px color-mix(in srgb,var(--ct) 80%,transparent),0 3px 6px rgba(0,0,0,.85);overflow-wrap:anywhere;}
.igs-combat-cutin-flash{position:absolute;inset:0;background:#fff;mix-blend-mode:screen;animation:igs-combat-cutin-flash .32s ease-out both;}
.igs-combat-cutin-figure.is-awaken{position:relative;right:auto;bottom:auto;flex:none;height:min(52cqh,calc(64cqw * ${COMBAT_CUTIN_FRAME}));animation:igs-combat-cutin-rise var(--igs-fx-life,2600ms) cubic-bezier(.2,.8,.2,1) both;}
@container igs-combat (max-width:720px){.igs-combat-cutin-figure:not(.is-awaken){right:50%;translate:50% 0;}.igs-combat-cutin-cap{left:6%;right:6%;top:auto;bottom:8%;translate:none;max-width:none;align-items:center;text-align:center;}}
@keyframes igs-combat-cutin-veil{0%{opacity:0;}8%,84%{opacity:1;}100%{opacity:0;}}
@keyframes igs-combat-cutin-lines{from{background-position:0 0;}to{background-position:-104px 0;}}
@keyframes igs-combat-cutin-band{0%{opacity:0;transform:rotate(-8deg) translateX(-110%) scaleY(.4);}14%{opacity:1;transform:rotate(-8deg) translateX(0) scaleY(1);}84%{opacity:1;transform:rotate(-8deg) translateX(3%) scaleY(1);}100%{opacity:0;transform:rotate(-8deg) translateX(110%) scaleY(.6);}}
@keyframes igs-combat-cutin-cam{0%{opacity:0;transform:translateX(18%) scale(1.18);}16%{opacity:1;transform:translateX(0) scale(1.06);}82%{opacity:1;transform:translateX(-2%) scale(1);}100%{opacity:0;transform:translateX(-14%) scale(.98);}}
@keyframes igs-combat-cutin-cap{0%{opacity:0;transform:translateX(-24px) skewX(-12deg);}18%{opacity:1;transform:translateX(0) skewX(-6deg);}84%{opacity:1;transform:translateX(6px) skewX(-6deg);}100%{opacity:0;transform:translateX(20px) skewX(-6deg);}}
@keyframes igs-combat-cutin-rise{0%{opacity:0;transform:translateY(8%) scale(1.12);}14%{opacity:1;transform:translateY(0) scale(1.04);}86%{opacity:1;transform:scale(1);}100%{opacity:0;transform:scale(.98);}}
@keyframes igs-combat-cutin-flash{0%{opacity:.85;}100%{opacity:0;}}
@keyframes igs-combat-cutin-fade{0%,100%{opacity:0;}12%,86%{opacity:1;}}
.igs-combat-cutin.is-low .igs-combat-cutin-lines,#igs-overlay[data-igs-quality="low"] .igs-combat-cutin-lines{animation:none;}
.igs-combat-cutin.is-low .igs-combat-cutin-figure,#igs-overlay[data-igs-quality="low"] .igs-combat-cutin-figure{filter:none;}
.igs-combat-cutin.is-reduced{animation:igs-combat-cutin-fade var(--igs-fx-life,1800ms) linear both;}
.igs-combat-cutin.is-reduced :is(.igs-combat-cutin-lines,.igs-combat-cutin-band,.igs-combat-cutin-figure,.igs-combat-cutin-cap),.igs-combat-awaken-cutin.is-reduced .igs-combat-cutin-figure{animation:none;}
@media (prefers-reduced-motion:reduce){.igs-combat-cutin{animation:igs-combat-cutin-fade var(--igs-fx-life,1800ms) linear both;}.igs-combat-cutin :is(.igs-combat-cutin-lines,.igs-combat-cutin-band,.igs-combat-cutin-figure,.igs-combat-cutin-cap),.igs-combat-awaken-cutin .igs-combat-cutin-figure{animation:none!important;}.igs-combat-cutin-flash{display:none;}}
.igs-combat-opening{--ct:#f2c46b;position:absolute;inset:0;overflow:hidden;pointer-events:none;background:linear-gradient(100deg,rgba(${N},.84),rgba(${N},.5) 50%,rgba(${N},.84));animation:igs-combat-cutin-veil var(--igs-fx-life,800ms) ease-out both;}
.igs-combat-opening-word{position:absolute;left:50%;top:50%;translate:-50% -50%;padding-left:.18em;color:#fff;font-family:${IGS_UI_FONT_SANS};font-size:clamp(56px,min(20cqw,24cqh),168px);font-weight:900;letter-spacing:.18em;line-height:1;white-space:nowrap;text-shadow:0 0 28px color-mix(in srgb,var(--ct) 85%,transparent),0 4px 12px rgba(0,0,0,.85);animation:igs-combat-opening-slam var(--igs-fx-life,800ms) cubic-bezier(.2,.8,.2,1) both;}
@keyframes igs-combat-opening-slam{0%{opacity:0;transform:scale(2.2) skewX(-16deg);}24%{opacity:1;transform:scale(.96) skewX(-10deg);}80%{opacity:1;transform:scale(1) skewX(-10deg);}100%{opacity:0;transform:scale(1.08) skewX(-10deg);}}
@media (prefers-reduced-motion:reduce){.igs-combat-opening{display:none;}}
`;
