import { COMBAT_HIT_FX_SKIN_STYLE_TEXT } from './combat-hit-fx-skin.js';
import { COMBAT_HIT_FLOAT_MS, COMBAT_HIT_FLOAT_STAGGER_MS, COMBAT_HIT_REACT_ATTR, COMBAT_HIT_REACT_MS } from './combat-hit-fx.js';

const C = '#igs-combat-panel';
const R = COMBAT_HIT_REACT_ATTR;
const K = `${C} .igs-combat-rarity-fx`;
const S = `${C} .igs-combat-strike`;
// 命中形态图形（combat-strike）：::before 为主图形，::after 为副图形（稀有档只画主图形）；颜色取元素色 --strike，尺寸随档位 --k。
const F = (form) => `${K}[data-strike="${form}"] .igs-combat-strike`;
// 前摇节点（吟唱 / 射击 / 横扫）。
const W = `${C} .igs-combat-windup`;

// 打击感样式：受击抖动 / 格挡与治疗泛光（单位块 data-igs-combat-react）、飘字（.igs-combat-float）、血条残影、出牌飞行卡（.igs-combat-card.is-flying）。
// 只动立绘容器的 translate / scale / filter，不占我方头像裁切用的 transform 与呼吸用的内层 scale。
// 减少动态效果：飘字只淡入淡出，无抖动与残影；低画质：不做受击反馈。
// 命中只落在受击单位上：战斗面板里 fx-battle 的命中节点只留顶部招式条与主角受击的屏幕边缘红光，画面中间的斩线、命中 / 目标名标签与击倒闪光
// （水墨皮肤的笔画、判定墨签与印）都不显示；击倒字改由单位飘字给出。
// 基础命中（is-rank-0）只画形态主图形，没有光晕与副图形。前摇（.igs-combat-windup）挂在演出前层中间：吟唱法阵、射击、近战横扫（钝器为冲击波）；范围攻击（is-aoe）法阵更大。
// 射击（--aim / --reach 为弹道朝向与长度，--impact 为到命中的时长）：前半段集中线收拢、受击单位上的准星收紧锁定；后半段开火（枪口闪光，弓箭为弦响波纹），
// 弹丸拖着弹道飞到准星，到达即命中，弹道与准星随后淡出；范围攻击每个受击单位一道弹道（量不到时扇形三道），多段攻击每段一道、按段依次射出（--wave 为该道的错开时长）。低画质与减少动态效果不画前摇。
export const COMBAT_HIT_STYLE_TEXT = `
${C} .igs-combat-unit[${R}="hit"] .igs-combat-portrait{animation:igs-combat-struck ${COMBAT_HIT_REACT_MS}ms cubic-bezier(.3,.7,.4,1) both;}
${C} .igs-combat-unit[${R}="guard"] .igs-combat-portrait{animation:igs-combat-guarded ${COMBAT_HIT_REACT_MS}ms ease-out both;}
${C} .igs-combat-unit[${R}="heal"] .igs-combat-portrait{animation:igs-combat-healed ${COMBAT_HIT_REACT_MS}ms ease-out both;}
${C} :is(.igs-combat-unit,.cx-unit)[${R}="power"] :is(.igs-combat-portrait,.face,.mface,.art,.igs-combat-power){animation:igs-combat-powered ${COMBAT_HIT_REACT_MS}ms ease-out both;}
@keyframes igs-combat-powered{0%,100%{filter:none;}35%{filter:brightness(1.5) drop-shadow(0 0 6px var(--igs-cb-power));}}
@keyframes igs-combat-struck{0%{translate:0 0;filter:brightness(1.9) saturate(.4);}18%{translate:-7px 1px;filter:brightness(1.3) sepia(.5) hue-rotate(-30deg) saturate(2.4);}36%{translate:6px -1px;}54%{translate:-4px 0;}72%{translate:2px 0;}100%{translate:0 0;filter:none;}}
@keyframes igs-combat-guarded{0%{translate:0 0;filter:brightness(1.6);}30%{translate:0 3px;}100%{translate:0 0;filter:none;}}
@keyframes igs-combat-healed{0%{scale:1;filter:none;}35%{scale:1.03;filter:brightness(1.3) saturate(1.3);}100%{scale:1;filter:none;}}
${C} .igs-combat-float{position:absolute;left:50%;top:22%;z-index:3;translate:-50% 0;pointer-events:none;white-space:nowrap;color:#fff;font-size:22px;font-size:clamp(16px,4.4cqmin,30px);font-weight:800;font-variant-numeric:tabular-nums;line-height:1;text-shadow:0 2px 3px rgba(0,0,0,.85),0 0 12px rgba(0,0,0,.45);animation:igs-combat-float ${COMBAT_HIT_FLOAT_MS}ms cubic-bezier(.2,.8,.3,1) both;animation-delay:calc(var(--i,0) * ${COMBAT_HIT_FLOAT_STAGGER_MS}ms);}
${C} .igs-combat-float.is-damage{color:var(--igs-float-color,color-mix(in srgb,var(--igs-cb-attack) 50%,#fff));}
${C} .igs-combat-float.is-overkill{color:rgba(214,214,226,.86);font-size:17px;font-size:clamp(13px,3.4cqmin,24px);}

${C} .igs-combat-float:is(.is-guard,.is-block){color:color-mix(in srgb,var(--igs-cb-skill) 55%,#fff);font-size:15px;font-size:clamp(12px,3cqmin,20px);}
${C} .igs-combat-float.is-heal{color:color-mix(in srgb,var(--igs-cb-life) 55%,#fff);}
${C} .igs-combat-float.is-power{max-width:180px;white-space:normal;text-align:center;overflow-wrap:anywhere;color:color-mix(in srgb,var(--igs-cb-power) 60%,#fff);font-size:13px;line-height:1.3;}
${C} .igs-combat-float.is-reduced{animation-name:igs-combat-float-still;}
@keyframes igs-combat-float{0%{opacity:0;transform:translateY(10px) scale(.7);}14%{opacity:1;transform:translateY(-4px) scale(1.14);}28%{transform:translateY(-8px) scale(1);}78%{opacity:1;}100%{opacity:0;transform:translateY(-34px) scale(.96);}}
@keyframes igs-combat-float-still{0%,100%{opacity:0;}12%,80%{opacity:1;}}
${C} .igs-combat-hp-track::before{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--igs-combat-hp,100%);border-radius:999px;background:rgba(255,236,214,.55);transition:width .5s cubic-bezier(.4,0,.2,1) .32s;}
${C} .igs-combat-fx .igs-combat-card.is-flying{position:absolute;z-index:4;margin:0;min-height:0;transform:none;transition:none;pointer-events:none;filter:drop-shadow(0 0 10px color-mix(in srgb,var(--igs-card-tint) 70%,transparent)) drop-shadow(0 12px 18px rgba(0,0,0,.5));will-change:transform,opacity;}
#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-unit[${R}] .igs-combat-portrait{animation:none;}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-unit[${R}] .igs-combat-portrait{animation:none;}${C} .igs-combat-float{animation-name:igs-combat-float-still;}${C} .igs-combat-hp-track::before{transition:none;}}
${C} .igs-combat-float{scale:var(--igs-float-scale,1);}
${C} .igs-combat-float.is-guard{color:var(--igs-float-color,color-mix(in srgb,var(--igs-cb-skill) 55%,#fff));}
${C} .igs-combat-float.is-damage:is(.is-heavy-1,.is-heavy-2){z-index:4;scale:min(var(--igs-float-scale,1),1.2);letter-spacing:.02em;}
${C} .igs-combat-float.is-damage.is-heavy-1{color:#ffc35a;font-size:30px;font-size:clamp(22px,6cqmin,40px);text-shadow:0 2px 3px rgba(0,0,0,.9),0 0 10px rgba(255,150,40,.75),0 0 22px rgba(255,110,30,.45);}
${C} .igs-combat-float.is-damage.is-heavy-2{color:#ff6a3d;font-size:38px;font-size:clamp(28px,7.6cqmin,52px);text-shadow:0 2px 3px rgba(0,0,0,.95),0 0 12px rgba(255,80,40,.85),0 0 30px rgba(255,40,20,.55);}
${C} .igs-combat-float.is-damage:is(.is-heavy-1,.is-heavy-2):not(.is-reduced){animation-name:igs-combat-float-heavy;animation-timing-function:cubic-bezier(.2,.9,.3,1);}
@keyframes igs-combat-float-heavy{0%{opacity:0;transform:translateY(-30px) scale(2.3);}10%{opacity:1;transform:translateY(4px) scale(.88);}20%{transform:translateY(-2px) scale(1.14);}32%{transform:translateY(-6px) scale(1);}80%{opacity:1;}100%{opacity:0;transform:translateY(-34px) scale(.96);}}
${C} .igs-combat-unit[${R}="heavy"] .igs-combat-portrait{animation:igs-combat-heavy-struck ${COMBAT_HIT_REACT_MS}ms cubic-bezier(.25,.8,.35,1) both;}
@keyframes igs-combat-heavy-struck{0%{translate:0 0;scale:1.04;filter:brightness(3) saturate(0);}12%{translate:-12px 2px;scale:.97;filter:brightness(1.6) sepia(.6) hue-rotate(-35deg) saturate(3);}28%{translate:10px -2px;scale:1.01;}44%{translate:-7px 1px;}60%{translate:4px 0;filter:brightness(1.15);}78%{translate:-2px 0;}100%{translate:0 0;scale:1;filter:none;}}
${C} .igs-combat-heavy-burst{position:absolute;left:50%;top:42%;z-index:3;width:clamp(90px,60%,200px);aspect-ratio:1;translate:-50% -50%;pointer-events:none;}
${C} .igs-combat-heavy-burst.is-rank-2{width:clamp(120px,82%,260px);}
${C} .igs-combat-heavy-ring{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(255,250,235,.95) 0 12%,rgba(255,170,60,.7) 24%,rgba(255,90,40,.28) 46%,transparent 66%);animation:igs-combat-heavy-ring var(--life) cubic-bezier(.15,.85,.3,1) both;}
${C} .igs-combat-heavy-ring::after{content:"";position:absolute;inset:6%;border-radius:50%;box-shadow:0 0 0 3px rgba(255,214,150,.9),0 0 18px 4px rgba(255,120,40,.6);animation:igs-combat-heavy-shock var(--life) cubic-bezier(.1,.8,.3,1) both;}
${C} .igs-combat-heavy-spark{position:absolute;left:50%;top:50%;width:4px;height:18px;margin:-9px -2px;border-radius:2px;background:linear-gradient(#fff,#ffb347 55%,transparent);box-shadow:0 0 8px rgba(255,150,50,.8);rotate:var(--a);animation:igs-combat-heavy-spark var(--life) cubic-bezier(.1,.8,.3,1) both;}
${C} .igs-combat-heavy-burst.is-rank-2 .igs-combat-heavy-spark{height:26px;margin-top:-13px;}
@keyframes igs-combat-heavy-ring{0%{opacity:0;scale:.2;}12%{opacity:1;scale:.8;}100%{opacity:0;scale:1.25;}}
@keyframes igs-combat-heavy-shock{0%{opacity:0;scale:.3;}15%{opacity:1;}100%{opacity:0;scale:1.6;}}
@keyframes igs-combat-heavy-spark{0%{opacity:0;transform:translateY(0) scaleY(.4);}12%{opacity:1;transform:translateY(-18px) scaleY(1.2);}100%{opacity:0;transform:translateY(-78px) scaleY(.3);}}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-float.is-damage:is(.is-heavy-1,.is-heavy-2){animation-name:igs-combat-float-still;}${C} .igs-combat-heavy-burst{display:none;}}
#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-heavy-ring::after{display:none;}

${C} .igs-combat-card[data-igs-rarity-trail]{box-shadow:0 12px 16px -4px var(--rar),0 30px 25px -8px color-mix(in srgb,var(--rar) 45%,transparent);}
${C} .igs-combat-rarity-fx{position:absolute;inset:0;pointer-events:none;z-index:5;border-radius:inherit;animation:igs-combat-rarity-pulse var(--life) ease-out both;background:radial-gradient(ellipse at center,color-mix(in srgb,var(--rar) 55%,transparent),transparent 72%);}
${C} .igs-combat-rarity-fx.is-hit{inset:4% -15% 10%;background:radial-gradient(ellipse,#fff5d4 0%,color-mix(in srgb,var(--rar) 65%,transparent) 22%,transparent 70%);}
${C} .igs-combat-rarity-fx.is-play{inset:28% 4% auto;padding:18px 8%;border-radius:0;clip-path:polygon(3% 0,100% 0,97% 100%,0 100%);background:linear-gradient(110deg,transparent,color-mix(in srgb,var(--rar) 55%,#151721) 28%,#151721 85%,transparent);color:#fff;font:italic 800 clamp(22px,5cqw,56px)/1.2 var(--igs-cb-font);text-align:center;overflow-wrap:anywhere;animation-name:igs-combat-rarity-banner;}
${C} .igs-combat-rarity-spark{position:absolute;left:50%;top:50%;width:4px;height:9px;background:var(--strike,var(--rar));rotate:var(--a);animation:igs-combat-rarity-spark var(--life) ease-out both;}
${K}.is-hit{--k:1;}
${K}.is-hit.is-rank-1{--k:.75;}
${K}.is-hit.is-rank-3{--k:1.25;}
${S}{position:absolute;inset:0;pointer-events:none;}
${S}::before,${S}::after{content:"";position:absolute;left:50%;top:50%;translate:-50% -50%;opacity:0;animation-duration:var(--life);animation-timing-function:cubic-bezier(.2,.8,.3,1);animation-fill-mode:both;}
${K}.is-rank-1 .igs-combat-strike::after{display:none;}
${K}.is-hit.is-rank-0{--k:.6;background:none;animation:none;}
${K}.is-rank-0 .igs-combat-strike::after{display:none;}
${F('slash')}::before,${F('slash')}::after{width:calc(130% * var(--k));height:calc(7px * var(--k));border-radius:50%;background:linear-gradient(90deg,transparent,var(--strike) 30%,#fff 50%,var(--strike) 70%,transparent);box-shadow:0 0 14px var(--strike);animation-name:igs-strike-slash;}
${F('slash')}::before{rotate:-32deg;}
${F('slash')}::after{rotate:28deg;animation-delay:70ms;}
${F('blunt')}::before{width:calc(90% * var(--k));aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,transparent 58%,var(--strike) 70%,#fff 76%,transparent 100%);animation-name:igs-strike-ring;}
${F('blunt')}::after{width:calc(46% * var(--k));aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,#fff,var(--strike) 45%,transparent 100%);animation-name:igs-strike-pop;}
${F('gun')}::before{width:calc(44% * var(--k));aspect-ratio:1;background:radial-gradient(closest-side,#fff 20%,var(--strike) 55%,transparent);clip-path:polygon(50% 0,60% 38%,100% 50%,60% 62%,50% 100%,40% 62%,0 50%,40% 38%);animation-name:igs-strike-pop;}
${F('gun')}::after{width:calc(140% * var(--k));height:2px;background:linear-gradient(90deg,transparent,var(--strike) 60%,#fff);rotate:-14deg;animation-name:igs-strike-tracer;}
${F('blast')}::before{width:calc(70% * var(--k));aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,#fff 0,#ffe6a6 22%,var(--strike) 52%,color-mix(in srgb,var(--strike) 30%,#3a2418) 78%,transparent);animation-name:igs-strike-bloom;}
${F('blast')}::after{width:calc(120% * var(--k));aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,transparent 64%,color-mix(in srgb,var(--strike) 70%,#fff) 74%,transparent);animation-name:igs-strike-ring;animation-delay:60ms;}
${F('curse')}::before{width:calc(80% * var(--k));aspect-ratio:1;border-radius:50%;background:repeating-conic-gradient(var(--strike) 0 10deg,transparent 10deg 30deg);-webkit-mask:radial-gradient(closest-side,transparent 52%,#000 56%,#000 66%,transparent 70%);mask:radial-gradient(closest-side,transparent 52%,#000 56%,#000 66%,transparent 70%);animation-name:igs-strike-sigil;}
${F('curse')}::after{width:calc(64% * var(--k));aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--strike) 70%,#140a1e),color-mix(in srgb,var(--strike) 35%,transparent) 60%,transparent);animation-name:igs-strike-miasma;}
${F('arcane')}::before{width:calc(86% * var(--k));aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,transparent 60%,var(--strike) 63%,transparent 66%,transparent 78%,color-mix(in srgb,var(--strike) 60%,#fff) 81%,transparent 84%),repeating-conic-gradient(color-mix(in srgb,var(--strike) 55%,transparent) 0 4deg,transparent 4deg 45deg);-webkit-mask:radial-gradient(closest-side,#000 86%,transparent 88%);mask:radial-gradient(closest-side,#000 86%,transparent 88%);animation-name:igs-strike-circle;}
${F('arcane')}::after{width:calc(40% * var(--k));aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,#fff,var(--strike) 50%,transparent);animation-name:igs-strike-pop;}
@keyframes igs-strike-slash{0%{opacity:0;clip-path:inset(0 100% 0 0);}12%{opacity:1;}35%{opacity:1;clip-path:inset(0 0 0 0);}100%{opacity:0;clip-path:inset(0 0 0 0);}}
@keyframes igs-strike-ring{0%{opacity:1;scale:.2;}100%{opacity:0;scale:1.25;}}
@keyframes igs-strike-pop{0%{opacity:1;scale:.4;}30%{opacity:1;scale:1.1;}100%{opacity:0;scale:.9;}}
@keyframes igs-strike-tracer{0%{opacity:1;clip-path:inset(0 100% 0 0);}25%{opacity:1;clip-path:inset(0 0 0 0);}100%{opacity:0;clip-path:inset(0 0 0 100%);}}
@keyframes igs-strike-bloom{0%{opacity:1;scale:.15;}25%{opacity:1;scale:1.05;}100%{opacity:0;scale:1.3;}}
@keyframes igs-strike-sigil{0%{opacity:0;scale:1.4;rotate:-40deg;}25%{opacity:1;scale:1;}100%{opacity:0;scale:.85;rotate:30deg;}}
@keyframes igs-strike-miasma{0%{opacity:0;scale:.6;}30%{opacity:.9;scale:1;}100%{opacity:0;scale:1.2;}}
@keyframes igs-strike-circle{0%{opacity:0;scale:.3;rotate:0deg;}30%{opacity:1;scale:1;}100%{opacity:0;scale:1.1;rotate:90deg;}}
#igs-overlay[data-igs-quality="low"] ${S}{display:none;}
@media(prefers-reduced-motion:reduce){${S}{display:none;}}
${C} .igs-combat-fx[data-igs-rarity] .igs-fx-battle-hit .igs-fx-battle-skill .igs-fx-battle-skill-name{color:var(--igs-rarity-caption);text-shadow:0 0 12px color-mix(in srgb,var(--igs-rarity-caption) 60%,transparent),0 2px 3px rgba(0,0,0,.8);}
@keyframes igs-combat-rarity-pulse{0%{opacity:0;scale:.75;}18%{opacity:.85;scale:1;}100%{opacity:0;scale:1.16;}}
@keyframes igs-combat-rarity-banner{0%{opacity:0;translate:-10% 0;}18%,65%{opacity:1;translate:0 0;}100%{opacity:0;translate:8% 0;}}
@keyframes igs-combat-rarity-spark{0%{opacity:1;transform:translateY(0);}100%{opacity:0;transform:translateY(-90px) scale(.3);}}
${C}[data-igs-combat-shake]{--igs-shake-x:0;--igs-shake-y:0;--shake:3px;animation:igs-combat-rarity-shake 380ms cubic-bezier(.2,.7,.3,1);}
@keyframes igs-combat-rarity-shake{0%,100%{translate:0 0;}18%{translate:calc(var(--igs-shake-x) * var(--shake)) calc(var(--igs-shake-y) * var(--shake));}42%{translate:calc(var(--igs-shake-x) * var(--shake) * -.45) calc(var(--igs-shake-y) * var(--shake) * -.45);}66%{translate:calc(var(--igs-shake-x) * var(--shake) * .2) calc(var(--igs-shake-y) * var(--shake) * .2);}}
${C}[data-igs-combat-hold] .igs-combat-unit[${R}] .igs-combat-portrait{animation-play-state:paused!important;}
${C} .igs-combat-rarity-fx.is-still{animation:none;opacity:.3;scale:1;}
${C} .igs-combat-rarity-fx.is-still::before,${C} .igs-combat-rarity-fx.is-still::after,${C} .igs-combat-rarity-fx.is-low::after{display:none;}
${C}[data-igs-combat-reduced],#igs-overlay[data-igs-quality="low"] ${C}[data-igs-combat-shake]{animation:none;translate:0 0;}
${C}[data-igs-combat-reduced] .igs-combat-rarity-fx{animation:none;opacity:.3;scale:1;}
${C}[data-igs-combat-reduced] .igs-combat-rarity-fx::before,${C}[data-igs-combat-reduced] .igs-combat-rarity-fx::after,${C}[data-igs-combat-reduced] .igs-combat-rarity-spark,#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-rarity-spark,#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-rarity-fx::after{display:none;}
@media(prefers-reduced-motion:reduce){${C}[data-igs-combat-shake]{animation:none;translate:0 0;}${C} .igs-combat-rarity-fx{animation:none;opacity:.3;scale:1;}${C} .igs-combat-rarity-fx::before,${C} .igs-combat-rarity-fx::after,${C} .igs-combat-rarity-spark{display:none;}}
${C} .igs-combat-fx .igs-fx-battle-hit :is(.igs-fx-battle-impact,.igs-fx-battle-flash),${C} .igs-combat-fx .igs-fx-battle-hit .wx:not(.wx-h-who):not(.wx-h-skill){display:none;}
${C} .igs-combat-float.is-ko{color:#ff7a7a;letter-spacing:.12em;}
${W}{position:absolute;left:50%;top:46%;z-index:5;width:clamp(120px,30%,300px);aspect-ratio:1;translate:-50% -50%;pointer-events:none;--k:1;}
${W}.is-rank-0{--k:.85;}
${W}.is-rank-3{--k:1.2;}
${W}::before,${W}::after{content:"";position:absolute;left:50%;top:50%;translate:-50% -50%;opacity:0;animation-duration:var(--life);animation-timing-function:cubic-bezier(.2,.8,.3,1);animation-fill-mode:both;}
${W}.is-cast::before{width:calc(100% * var(--k));aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,transparent 60%,var(--strike) 63%,transparent 66%,transparent 78%,color-mix(in srgb,var(--strike) 60%,#fff) 81%,transparent 84%),repeating-conic-gradient(color-mix(in srgb,var(--strike) 55%,transparent) 0 4deg,transparent 4deg 30deg);-webkit-mask:radial-gradient(closest-side,#000 86%,transparent 88%);mask:radial-gradient(closest-side,#000 86%,transparent 88%);filter:drop-shadow(0 0 10px var(--strike));animation-name:igs-windup-circle;}
${W}.is-cast::after{width:calc(36% * var(--k));aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,#fff,var(--strike) 45%,transparent);animation-name:igs-windup-charge;}
${W}.is-cast.is-aoe{width:clamp(200px,52%,520px);}
${W}.is-cast[data-strike="curse"]::before{background:repeating-conic-gradient(var(--strike) 0 10deg,transparent 10deg 30deg);-webkit-mask:radial-gradient(closest-side,transparent 52%,#000 56%,#000 66%,transparent 70%);mask:radial-gradient(closest-side,transparent 52%,#000 56%,#000 66%,transparent 70%);}
${W}.is-shot::before{width:calc(150% * var(--k));aspect-ratio:1;border-radius:50%;background:repeating-conic-gradient(color-mix(in srgb,var(--strike) 65%,#fff) 0 1.2deg,transparent 1.2deg 15deg);-webkit-mask:radial-gradient(closest-side,transparent 34%,#000 52%,#000 78%,transparent 100%);mask:radial-gradient(closest-side,transparent 34%,#000 52%,#000 78%,transparent 100%);animation:igs-windup-focus var(--impact) cubic-bezier(.4,0,.6,1) both;}
${W}.is-shot::after{width:calc(46% * var(--k));aspect-ratio:1;background:radial-gradient(closest-side,#fff 18%,var(--strike) 46%,transparent 72%);clip-path:polygon(50% 0,60% 38%,100% 50%,60% 62%,50% 100%,40% 62%,0 50%,40% 38%);animation:igs-windup-fire calc(var(--impact) / 2) ease-out calc(var(--impact) / 2) both;}
${W}.is-shot[data-strike="slash"]::after{border-radius:50%;clip-path:none;background:radial-gradient(closest-side,transparent 50%,#fff 58%,var(--strike) 66%,transparent 76%);}
${W}.is-sweep::after{display:none;}
${W} .igs-combat-windup-ray{position:absolute;left:50%;top:50%;width:var(--reach,160%);height:calc(16px * var(--k));transform-origin:0 50%;rotate:calc(var(--aim) + var(--turn,0deg));translate:0 -50%;animation:igs-windup-out var(--fade) linear calc(var(--impact) + var(--wave,0ms)) forwards;}
${W} .igs-combat-windup-ray::before,${W} .igs-combat-windup-ray::after{content:"";position:absolute;top:50%;left:0;}
${W} .igs-combat-windup-ray::before{width:100%;height:calc(3px * var(--k));translate:0 -50%;transform-origin:0 50%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--strike) 70%,transparent) 35%,#fff);box-shadow:0 0 8px var(--strike);animation:igs-windup-trail calc(var(--impact) / 2) linear calc(var(--impact) / 2 + var(--wave,0ms)) both;}
${W} .igs-combat-windup-ray::after{width:calc(26px * var(--k));height:calc(6px * var(--k));translate:-100% -50%;border-radius:999px;background:linear-gradient(90deg,transparent,var(--strike) 40%,#fff);box-shadow:0 0 12px var(--strike),0 0 4px #fff;animation:igs-windup-bolt calc(var(--impact) / 2) linear calc(var(--impact) / 2 + var(--wave,0ms)) both;}
${W}.is-shot[data-strike="blast"] .igs-combat-windup-ray::before{height:calc(7px * var(--k));background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--strike) 35%,#777) 45%,var(--strike));box-shadow:none;filter:blur(1px);}
${W}.is-shot[data-strike="blast"] .igs-combat-windup-ray::after{width:calc(20px * var(--k));height:calc(20px * var(--k));translate:-50% -50%;border-radius:50%;background:radial-gradient(closest-side,#fff 30%,var(--strike) 65%,transparent);}
${W}.is-shot[data-strike="slash"] .igs-combat-windup-ray::after{width:calc(36px * var(--k));height:calc(9px * var(--k));border-radius:0;box-shadow:none;clip-path:polygon(0 40%,76% 40%,76% 0,100% 50%,76% 100%,76% 60%,0 60%);background:linear-gradient(90deg,color-mix(in srgb,var(--strike) 50%,transparent),#fff);}
${W} .igs-combat-windup-lock{position:absolute;left:100%;top:50%;width:calc(46px * var(--k));aspect-ratio:1;translate:-50% -50%;rotate:calc(-1 * (var(--aim) + var(--turn,0deg)));border-radius:50%;background:radial-gradient(closest-side,transparent 56%,var(--strike) 61%,#fff 65%,transparent 70%),linear-gradient(var(--strike),var(--strike)) 50% 0/2px 32% no-repeat,linear-gradient(var(--strike),var(--strike)) 50% 100%/2px 32% no-repeat,linear-gradient(var(--strike),var(--strike)) 0 50%/32% 2px no-repeat,linear-gradient(var(--strike),var(--strike)) 100% 50%/32% 2px no-repeat;filter:drop-shadow(0 0 6px var(--strike));animation:igs-windup-lock var(--impact) cubic-bezier(.2,.8,.3,1) both;}
${W}.is-sweep{width:clamp(260px,70%,760px);aspect-ratio:3/1;}
${W}.is-sweep::before{width:100%;height:100%;background:radial-gradient(50% 100% at 50% 100%,transparent 70%,color-mix(in srgb,var(--strike) 70%,transparent) 80%,#fff 84%,var(--strike) 88%,transparent 96%);filter:drop-shadow(0 0 12px var(--strike));animation-name:igs-windup-sweep;}
${W}.is-sweep[data-strike="blunt"]::before{width:60%;height:auto;aspect-ratio:1;background:radial-gradient(closest-side,transparent 60%,var(--strike) 72%,#fff 78%,transparent 100%);filter:none;animation-name:igs-strike-ring;}
@keyframes igs-windup-circle{0%{opacity:0;scale:.4;rotate:-60deg;}35%{opacity:1;scale:1;}80%{opacity:1;}100%{opacity:0;scale:1.08;rotate:40deg;}}
@keyframes igs-windup-charge{0%{opacity:0;scale:.3;}60%{opacity:1;scale:1;}75%{opacity:1;scale:1.25;}100%{opacity:0;scale:.6;}}
@keyframes igs-windup-focus{0%{opacity:0;scale:1.5;}45%{opacity:.95;scale:1;}55%{opacity:1;scale:.92;}100%{opacity:0;scale:1.25;}}
@keyframes igs-windup-fire{0%{opacity:0;scale:.3;}10%{opacity:1;scale:.9;}35%{opacity:1;scale:1.15;}100%{opacity:0;scale:1.45;}}
@keyframes igs-windup-trail{from{scale:0 1;}to{scale:1 1;}}
@keyframes igs-windup-bolt{0%{left:0;opacity:0;}8%{opacity:1;}90%{opacity:1;}100%{left:100%;opacity:0;}}
@keyframes igs-windup-lock{0%{opacity:0;transform:rotate(-90deg) scale(2);}45%{opacity:1;transform:rotate(0deg) scale(1);}85%{opacity:1;transform:scale(.86);}100%{opacity:1;transform:scale(1.25);}}
@keyframes igs-windup-out{from{opacity:1;}to{opacity:0;}}
@keyframes igs-windup-sweep{0%{opacity:0;clip-path:inset(0 100% 0 0);}20%{opacity:1;}60%{opacity:1;clip-path:inset(0 0 0 0);}100%{opacity:0;clip-path:inset(0 0 0 0);}}
#igs-overlay[data-igs-quality="low"] ${W},${C}[data-igs-combat-reduced] ${W}{display:none;}
@media(prefers-reduced-motion:reduce){${W}{display:none;}}
${COMBAT_HIT_FX_SKIN_STYLE_TEXT}
`;
