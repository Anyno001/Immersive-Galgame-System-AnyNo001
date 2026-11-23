// 战斗核心打击感与主题光栅特效演出（伤害命中、破盾爆碎、卡肉顿帧、增益 Buff / 减益 Debuff、血条延迟残影）：
// 全面去除卡通化与手绘 SVG 几何图形，改为按 10 套皮肤主题模型驱动的写实/绘本/水墨/赛博/星秘/水彩/暗黑透明通道光栅美术纹理（RGBA Alpha WebP，深/浅底皮肤零黑框融合）。
// 纯视觉演出，只挂载临时演出节点与属性，不改任何战斗数值或重放结果；自动适配 1x/2x 倍速、低画质与减少动态效果。
import { resolveVfxTheme, vfxTextureUrl } from './combat-vfx-themes.js';

export const COMBAT_IMPACT_TIERS = Object.freeze({
    1: Object.freeze({ hold: 38, shake: 2.2, vignette: '', motes: 4, life: 520, sfx: '' }),
    2: Object.freeze({ hold: 78, shake: 5.2, vignette: 'heavy', motes: 7, life: 640, sfx: 'battle-impact-rare' }),
    3: Object.freeze({ hold: 120, shake: 9, vignette: 'massive', motes: 10, life: 780, sfx: 'battle-impact-epic' }),
    4: Object.freeze({ hold: 150, shake: 11.5, vignette: 'ko', motes: 12, life: 940, sfx: 'battle-ko' }),
});

export const COMBAT_IMPACT_VIGNETTE_ATTR = 'data-igs-combat-vignette';

const ELEMENT_FILTERS = Object.freeze({
    fire: 'hue-rotate(-14deg) saturate(1.45) brightness(1.12)',
    ice: 'hue-rotate(155deg) saturate(1.3) brightness(1.16)',
    thunder: 'hue-rotate(12deg) saturate(1.35) brightness(1.22)',
    wind: 'hue-rotate(102deg) saturate(1.2) brightness(1.1)',
    water: 'hue-rotate(168deg) saturate(1.35) brightness(1.1)',
    earth: 'hue-rotate(-8deg) saturate(1.15) contrast(1.12)',
    poison: 'hue-rotate(78deg) saturate(1.45) brightness(1.08)',
    holy: 'saturate(1.15) brightness(1.28)',
    shadow: 'hue-rotate(232deg) saturate(1.42) contrast(1.18)',
});

const C = '#igs-combat-panel';
const S_UNIT = `${C} :is(.igs-combat-unit,.cx-unit)`;
const S_PORTRAIT = `:is(.igs-combat-portrait,.art,.face,.mface)`;

export const COMBAT_IMPACT_FX_STYLE_TEXT = `
/* 1. 全皮肤（含九套画布皮肤）卡肉顿帧（Hitstop）与高反差电影命中白闪帧 */
${C}[data-igs-combat-hold] :is(.igs-combat-unit,.cx-unit)[data-igs-combat-react] ${S_PORTRAIT},
${C}[data-igs-combat-hold] .igs-hx-canvas *,
${C}[data-igs-combat-hold] .igs-impact-burst,
${C}[data-igs-combat-hold] .igs-impact-burst *,
${C}[data-igs-combat-hold] .igs-shield-break,
${C}[data-igs-combat-hold] .igs-shield-break *,
${C}[data-igs-combat-hold] .igs-combat-heavy-burst *,
${C}[data-igs-combat-hold] .igs-combat-rarity-fx *{animation-play-state:paused !important;}
${C}[data-igs-combat-hold] :is(.igs-combat-unit,.cx-unit):is([data-igs-combat-react="hit"],[data-igs-combat-react="heavy"]) ${S_PORTRAIT}{filter:brightness(2.45) contrast(1.32) saturate(.22) !important;}

/* 2. 重击 / 巨创 / 击倒 / 主角受创的电影感暗角闪震 */
${C}::after{content:"";position:absolute;inset:0;z-index:26;pointer-events:none;opacity:0;}
${C}[${COMBAT_IMPACT_VIGNETTE_ATTR}="heavy"]::after{background:radial-gradient(ellipse at center,transparent 56%,rgba(255,176,82,.22) 88%,rgba(220,86,36,.38) 100%);animation:igs-vignette-pop 340ms ease-out both;}
${C}[${COMBAT_IMPACT_VIGNETTE_ATTR}="massive"]::after{background:radial-gradient(ellipse at center,rgba(255,248,228,.12) 0%,transparent 50%,rgba(245,92,46,.34) 85%,rgba(145,18,20,.54) 100%);animation:igs-vignette-pop 460ms cubic-bezier(.18,.88,.32,1) both;}
${C}[${COMBAT_IMPACT_VIGNETTE_ATTR}="ko"]::after{background:radial-gradient(ellipse at center,rgba(255,252,240,.24) 0%,transparent 44%,rgba(245,112,62,.36) 82%,rgba(8,6,10,.64) 100%);animation:igs-vignette-pop 580ms cubic-bezier(.15,.85,.3,1) both;}
${C}[${COMBAT_IMPACT_VIGNETTE_ATTR}="hurt"]::after{background:radial-gradient(ellipse at center,transparent 50%,rgba(220,42,54,.32) 86%,rgba(140,10,20,.54) 100%);animation:igs-vignette-pop 420ms ease-out both;}
@keyframes igs-vignette-pop{0%{opacity:0;}14%{opacity:1;}100%{opacity:0;}}

/* 3. 全画布皮肤血条延迟掉血白金残影 */
${C} .cx-hp{position:relative;overflow:hidden;}
${C} .cx-hp::before{content:"";position:absolute;left:0;top:0;bottom:0;z-index:0;width:var(--igs-combat-hp,100%);background:linear-gradient(90deg,rgba(255,248,228,.88),rgba(255,198,122,.7));transition:width .58s cubic-bezier(.22,1,.36,1) .28s;pointer-events:none;}
${C} .cx-hp>i{position:relative;z-index:1;transition:width .16s cubic-bezier(.2,.8,.3,1) !important;}
${C} .cx-hp>:not(i){position:relative;z-index:2;}

/* 4. 全皮肤受击挤压回弹、格挡弹震、治疗上扬、增益光提、减益下沉、中毒震颤 */
${S_UNIT}[data-igs-combat-react="hit"] ${S_PORTRAIT}{animation:igs-react-hit 360ms cubic-bezier(.24,1.35,.42,1) both !important;}
${S_UNIT}[data-igs-combat-react="heavy"] ${S_PORTRAIT}{animation:igs-react-heavy 460ms cubic-bezier(.2,1.25,.38,1) both !important;}
${S_UNIT}[data-igs-combat-react="guard"] ${S_PORTRAIT}{animation:igs-react-guard 360ms cubic-bezier(.22,1,.36,1) both !important;}
${S_UNIT}[data-igs-combat-react="heal"] ${S_PORTRAIT}{animation:igs-react-heal 460ms ease-out both !important;}
${S_UNIT}[data-igs-combat-react="buff"] ${S_PORTRAIT}{animation:igs-react-buff 480ms cubic-bezier(.22,1,.36,1) both !important;}
${S_UNIT}[data-igs-combat-react="debuff"] ${S_PORTRAIT}{animation:igs-react-debuff 440ms cubic-bezier(.3,.7,.4,1) both !important;}
${S_UNIT}[data-igs-combat-react="poison"] ${S_PORTRAIT}{animation:igs-react-poison 420ms ease-out both !important;}
@keyframes igs-react-hit{0%{translate:0 0;scale:1;filter:brightness(2.15) saturate(.25);}16%{translate:10px -2px;scale:.93 1.06;filter:brightness(1.4) sepia(.38) hue-rotate(-26deg) saturate(1.9);}38%{translate:-7px 1px;scale:1.03 .98;}62%{translate:4px 0;scale:.99 1.01;}82%{translate:-2px 0;}100%{translate:0 0;scale:1;filter:none;}}
@keyframes igs-react-heavy{0%{translate:0 0;scale:1.05 .96;filter:brightness(2.85) contrast(1.35) saturate(0);}14%{translate:17px -4px;scale:.9 1.09;rotate:3deg;filter:brightness(1.55) sepia(.48) hue-rotate(-30deg) saturate(2.5);}32%{translate:-13px 2px;scale:1.04 .97;rotate:-2deg;}52%{translate:8px -1px;scale:.98 1.02;rotate:1deg;filter:brightness(1.12);}74%{translate:-4px 0;rotate:-.4deg;}100%{translate:0 0;scale:1;rotate:0deg;filter:none;}}
@keyframes igs-react-guard{0%{translate:0 0;scale:1;filter:brightness(1.65) drop-shadow(0 0 12px rgba(130,214,255,.78));}24%{translate:0 4px;scale:1.04 .96;}58%{translate:0 -1px;scale:.99 1.01;}100%{translate:0 0;scale:1;filter:none;}}
@keyframes igs-react-heal{0%{translate:0 0;scale:1;filter:none;}32%{translate:0 -4px;scale:1.03;filter:brightness(1.28) drop-shadow(0 0 12px rgba(108,238,172,.72));}100%{translate:0 0;scale:1;filter:none;}}
@keyframes igs-react-buff{0%{translate:0 0;scale:1;filter:none;}28%{translate:0 -5px;scale:1.04;filter:brightness(1.36) drop-shadow(0 0 14px rgba(255,216,120,.78));}65%{translate:0 -2px;scale:1.01;}100%{translate:0 0;scale:1;filter:none;}}
@keyframes igs-react-debuff{0%{translate:0 0;scale:1;filter:none;}18%{translate:-5px 5px;scale:.97 .95;filter:brightness(.82) sepia(.42) hue-rotate(242deg) saturate(2) drop-shadow(0 0 12px rgba(182,82,255,.65));}42%{translate:5px 4px;}68%{translate:-3px 2px;}100%{translate:0 0;scale:1;filter:none;}}
@keyframes igs-react-poison{0%{translate:0 0;filter:none;}22%{translate:-4px 2px;filter:brightness(1.22) sepia(.55) hue-rotate(68deg) saturate(2.3) drop-shadow(0 0 12px rgba(128,232,78,.72));}52%{translate:4px 1px;}100%{translate:0 0;filter:none;}}

/* 5. 精致电影字效飘字（去除浮夸卡通感，高反差立体投影） */
${C} .igs-combat-float{margin-left:var(--dx,0px);}
${C} .igs-combat-float.is-poison{color:#9ef266;text-shadow:0 2px 4px rgba(0,0,0,.92),0 0 14px rgba(114,228,62,.72);}
${C} .igs-combat-float.is-buff{font-size:14px;font-size:clamp(12px,2.9cqmin,20px);color:#f9e2a4;letter-spacing:.06em;text-shadow:0 2px 4px rgba(0,0,0,.94),0 0 12px rgba(246,196,86,.68);animation-name:igs-float-buff;}
${C} .igs-combat-float.is-debuff{font-size:14px;font-size:clamp(12px,2.9cqmin,20px);color:#f58cb4;letter-spacing:.06em;text-shadow:0 2px 4px rgba(0,0,0,.95),0 0 12px rgba(186,68,242,.72);animation-name:igs-float-debuff;}
${C} .igs-combat-float.is-debuff.is-status-poison{color:#a8f270;text-shadow:0 2px 4px rgba(0,0,0,.95),0 0 12px rgba(108,218,54,.72);}
${C} .igs-combat-float.is-debuff.is-status-confused{color:#e2b8ff;text-shadow:0 2px 4px rgba(0,0,0,.95),0 0 14px rgba(196,118,255,.82),0 0 6px rgba(246,210,118,.48);}
${C} .igs-combat-float.is-artifact{font-size:14px;font-size:clamp(12px,2.9cqmin,20px);color:#fff2c6;letter-spacing:.1em;text-shadow:0 2px 4px rgba(0,0,0,.94),0 0 14px rgba(255,216,120,.82);}
${C} .igs-combat-float.is-cleanse{font-size:14px;font-size:clamp(12px,2.9cqmin,20px);color:#c2f4ff;letter-spacing:.1em;text-shadow:0 2px 4px rgba(0,0,0,.94),0 0 14px rgba(120,230,255,.78);}
${C} .igs-combat-float.is-shield-break{z-index:5;font-size:18px;font-size:clamp(15px,3.8cqmin,25px);color:#d0f4ff;letter-spacing:.16em;text-shadow:0 2px 4px rgba(0,0,0,.96),0 0 14px rgba(108,218,255,.88),0 0 28px rgba(64,168,255,.48);animation-name:igs-float-break;}
@keyframes igs-float-buff{0%{opacity:0;transform:translateY(14px) scale(.8);}18%{opacity:1;transform:translateY(-6px) scale(1.08);}34%{transform:translateY(-10px) scale(1);}78%{opacity:1;}100%{opacity:0;transform:translateY(-38px) scale(.98);}}
@keyframes igs-float-debuff{0%{opacity:0;transform:translateY(-14px) scale(1.18);}18%{opacity:1;transform:translateY(4px) scale(.96);}32%{transform:translateY(0) scale(1);}78%{opacity:1;}100%{opacity:0;transform:translateY(22px) scale(.95);}}
@keyframes igs-float-break{0%{opacity:0;transform:translateY(6px) scale(1.58);}14%{opacity:1;transform:translateY(-4px) scale(.94);}26%{transform:translateY(-6px) scale(1.06);}76%{opacity:1;transform:translateY(-14px) scale(1);}100%{opacity:0;transform:translateY(-34px) scale(.95);}}

/* 6. 主题透明光栅纹理命中爆点（.igs-impact-burst，零 SVG、真实 RGBA Alpha 透明叠加，深色/浅色皮肤全兼容无黑框） */
${C} .igs-impact-burst{position:absolute;left:calc(50% + var(--ox,0px));top:calc(44% + var(--oy,0px));z-index:48;width:var(--sz,210px);height:var(--sz,210px);translate:-50% -50%;pointer-events:none;--fx-c:#f7e5c0;--life:540ms;overflow:visible;}
${C} :is(.lead,.mate) .igs-impact-burst{left:calc(36px + var(--ox,0px));top:calc(36px + var(--oy,0px));width:calc(var(--sz,210px) * .68);height:calc(var(--sz,210px) * .68);}
${C} .igs-impact-burst .vfx-tex{position:absolute;inset:-14%;width:128%;height:128%;object-fit:contain;pointer-events:none;filter:var(--tex-f,none);transform-origin:50% 50%;user-select:none;-webkit-user-drag:none;}
${C} .igs-impact-burst .vfx-tex.is-sub{inset:-6%;width:112%;height:112%;opacity:.86;}
${C} .igs-impact-burst .vfx-glow{position:absolute;left:50%;top:50%;width:52%;height:52%;translate:-50% -50%;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.82) 0 12%,color-mix(in srgb,var(--fx-c) 54%,transparent) 42%,transparent 74%);animation:igs-vfx-glow var(--life) cubic-bezier(.15,.85,.3,1) both;}
${C} .igs-impact-burst .vfx-wave{position:absolute;left:50%;top:50%;width:66%;height:66%;translate:-50% -50%;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--fx-c) 76%,#fff);box-shadow:0 0 16px color-mix(in srgb,var(--fx-c) 58%,transparent);animation:igs-vfx-wave var(--life) cubic-bezier(.14,.88,.28,1) both;}
${C} .igs-impact-burst .vfx-mote{position:absolute;left:50%;top:50%;width:var(--ms,3px);height:var(--ms,3px);border-radius:50%;background:#fff;box-shadow:0 0 6px 1.5px var(--fx-c);animation:igs-vfx-mote var(--life) cubic-bezier(.16,.84,.3,1) both;animation-delay:var(--md,0ms);}

/* 按招式形态的电影级纹理动势 */
${C} .igs-impact-burst.is-slash .vfx-tex.is-main{animation:igs-tex-slash var(--life) cubic-bezier(.12,.88,.24,1) both;}
${C} .igs-impact-burst.is-slash .vfx-tex.is-sub{animation:igs-tex-burst var(--life) cubic-bezier(.15,.86,.28,1) both;animation-delay:30ms;}
${C} .igs-impact-burst:is(.is-blunt,.is-blast,.is-arcane) .vfx-tex.is-main{animation:igs-tex-burst var(--life) cubic-bezier(.14,.88,.26,1) both;}
${C} .igs-impact-burst.is-gun .vfx-tex.is-main{animation:igs-tex-pierce var(--life) cubic-bezier(.1,.9,.22,1) both;}
${C} .igs-impact-burst.is-curse .vfx-tex.is-main{animation:igs-tex-curse var(--life) cubic-bezier(.2,.82,.3,1) both;}
${C} .igs-impact-burst.is-guard .vfx-tex.is-main{animation:igs-tex-guard var(--life) cubic-bezier(.16,.88,.3,1) both;}
${C} .igs-impact-burst.is-poison .vfx-tex.is-main{animation:igs-tex-poison var(--life) ease-out both;}
${C} .igs-impact-burst.is-ko .vfx-tex.is-main{animation:igs-tex-ko var(--life) cubic-bezier(.12,.9,.22,1) both;}
${C} .igs-impact-burst.is-ko .vfx-tex.is-sub{animation:igs-tex-slash var(--life) cubic-bezier(.12,.88,.24,1) both;}
${C} .igs-impact-burst .vfx-tex.is-bolt{animation:igs-tex-bolt calc(var(--life) * .82) cubic-bezier(.12,.9,.25,1) both;}

/* 主题特色动势微调（水墨晕染、科技电弧闪频、漫画硬切、星秘缓旋、柔粉轻漾） */
${C}[data-igs-combat-skin="ink"] .igs-impact-burst.is-slash .vfx-tex.is-main{animation-timing-function:cubic-bezier(.18,.92,.28,1);}
${C}[data-igs-combat-skin="tech"] .igs-impact-burst .vfx-tex.is-main{animation-timing-function:cubic-bezier(.08,.94,.2,1);}
${C}[data-igs-combat-skin="mystic"] .igs-impact-burst.is-arcane .vfx-tex.is-main{animation-name:igs-tex-astral;}

@keyframes igs-tex-slash{0%{opacity:0;transform:rotate(var(--ang,0deg)) scaleX(var(--flip,1)) scale(.42) translate(-18%,14%);}15%{opacity:1;transform:rotate(var(--ang,0deg)) scaleX(var(--flip,1)) scale(1.06) translate(2%,-2%);}44%{opacity:.95;transform:rotate(calc(var(--ang,0deg) + 4deg)) scaleX(var(--flip,1)) scale(1.14) translate(5%,-4%);}100%{opacity:0;transform:rotate(calc(var(--ang,0deg) + 9deg)) scaleX(var(--flip,1)) scale(1.24) translate(8%,-7%);}}
@keyframes igs-tex-burst{0%{opacity:0;transform:rotate(var(--ang,0deg)) scale(.32);}14%{opacity:1;transform:rotate(var(--ang,0deg)) scale(1.05);}48%{opacity:.9;transform:rotate(calc(var(--ang,0deg) + 6deg)) scale(1.16);}100%{opacity:0;transform:rotate(calc(var(--ang,0deg) + 14deg)) scale(1.34);}}
@keyframes igs-tex-pierce{0%{opacity:0;transform:rotate(var(--ang,0deg)) scale(.3,.7) translateX(-20%);}12%{opacity:1;transform:rotate(var(--ang,0deg)) scale(1.18,.82) translateX(4%);}40%{opacity:.92;transform:rotate(var(--ang,0deg)) scale(1.24,.76) translateX(8%);}100%{opacity:0;transform:rotate(var(--ang,0deg)) scale(1.32,.68) translateX(14%);}}
@keyframes igs-tex-curse{0%{opacity:0;transform:rotate(calc(var(--ang,0deg) + 28deg)) scale(1.42);}24%{opacity:1;transform:rotate(var(--ang,0deg)) scale(.96);}68%{opacity:.88;transform:rotate(calc(var(--ang,0deg) - 18deg)) scale(1.04);}100%{opacity:0;transform:rotate(calc(var(--ang,0deg) - 34deg)) scale(.84);}}
@keyframes igs-tex-guard{0%{opacity:0;transform:scale(.58);}18%{opacity:.92;transform:scale(.94);}55%{opacity:.78;transform:scale(.98);}100%{opacity:0;transform:scale(1.12);}}
@keyframes igs-tex-poison{0%{opacity:0;transform:translateY(14px) scale(.56) rotate(-8deg);}24%{opacity:.96;transform:translateY(-4px) scale(1.06) rotate(4deg);}72%{opacity:.84;transform:translateY(-16px) scale(1.14) rotate(12deg);}100%{opacity:0;transform:translateY(-28px) scale(1.22) rotate(18deg);}}
@keyframes igs-tex-ko{0%{opacity:0;transform:scale(.28) rotate(-14deg);}14%{opacity:1;transform:scale(1.24) rotate(4deg);}48%{opacity:.96;transform:scale(1.34) rotate(10deg);}100%{opacity:0;transform:scale(1.56) rotate(18deg);}}
@keyframes igs-tex-astral{0%{opacity:0;transform:scale(.4) rotate(-32deg);}22%{opacity:1;transform:scale(1.08) rotate(12deg);}72%{opacity:.88;transform:scale(1.18) rotate(48deg);}100%{opacity:0;transform:scale(1.28) rotate(72deg);}}
@keyframes igs-tex-bolt{0%{opacity:0;transform:rotate(var(--ang,0deg)) scale(.7);}16%{opacity:1;transform:rotate(var(--ang,0deg)) scale(1.08);}42%{opacity:.55;transform:rotate(var(--ang,0deg)) scale(1.1);}62%{opacity:.95;transform:rotate(var(--ang,0deg)) scale(1.12);}100%{opacity:0;transform:rotate(var(--ang,0deg)) scale(1.16);}}
@keyframes igs-vfx-glow{0%{opacity:0;scale:.25;}14%{opacity:.95;scale:1.08;}46%{opacity:.5;scale:1.2;}100%{opacity:0;scale:1.45;}}
@keyframes igs-vfx-wave{0%{opacity:0;scale:.24;}16%{opacity:.82;scale:.82;}100%{opacity:0;scale:1.68;}}
@keyframes igs-vfx-mote{0%{opacity:0;transform:translate(0,0) scale(.4);}16%{opacity:1;transform:translate(calc(var(--mx,40px) * .36),calc(var(--my,-36px) * .36)) scale(1.15);}100%{opacity:0;transform:translate(var(--mx,40px),var(--my,-36px)) scale(.2);}}

/* 7. 破盾（格挡被打碎）主题透明光栅晶盾爆碎特效（.igs-shield-break，零 SVG） */
${C} .igs-shield-break{position:absolute;left:50%;top:44%;z-index:49;width:230px;height:230px;translate:-50% -50%;pointer-events:none;--sb-life:700ms;--fx-c:#8be0ff;overflow:visible;}
${C} :is(.lead,.mate) .igs-shield-break{left:36px;top:36px;width:154px;height:154px;}
${C} .igs-shield-break .sb-flash{position:absolute;inset:16%;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.88) 0 14%,color-mix(in srgb,var(--fx-c) 64%,transparent) 44%,transparent 76%);animation:igs-sb-flash var(--sb-life) cubic-bezier(.14,.86,.28,1) both;}
${C} .igs-shield-break .sb-tex{position:absolute;inset:-8%;width:116%;height:116%;object-fit:contain;pointer-events:none;transform-origin:50% 50%;user-select:none;-webkit-user-drag:none;animation:igs-sb-tex var(--sb-life) cubic-bezier(.12,.88,.24,1) both;}
${C} .igs-shield-break .sb-tex.is-echo{inset:-14%;width:128%;height:128%;opacity:.58;animation-name:igs-sb-echo;animation-delay:38ms;}
${C} .igs-shield-break .sb-glint{position:absolute;left:50%;top:50%;width:var(--gs,3.5px);height:var(--gs,3.5px);border-radius:50%;background:#fff;box-shadow:0 0 8px 2px var(--fx-c);animation:igs-sb-glint var(--sb-life) cubic-bezier(.16,.84,.3,1) both;animation-delay:var(--gd,0ms);}
@keyframes igs-sb-flash{0%{opacity:0;scale:.25;}14%{opacity:1;scale:1.15;}46%{opacity:.48;scale:1.36;}100%{opacity:0;scale:1.58;}}
@keyframes igs-sb-tex{0%{opacity:0;transform:scale(.52) rotate(-8deg);}14%{opacity:1;transform:scale(.96) rotate(2deg);}52%{opacity:.92;transform:scale(1.16) rotate(7deg) translateY(6px);}100%{opacity:0;transform:scale(1.34) rotate(13deg) translateY(18px);}}
@keyframes igs-sb-echo{0%{opacity:0;transform:scale(.62) rotate(112deg);}18%{opacity:.62;transform:scale(1.04) rotate(120deg);}100%{opacity:0;transform:scale(1.42) rotate(132deg) translateY(14px);}}
@keyframes igs-sb-glint{0%{opacity:0;transform:translate(0,0) scale(.4);}16%{opacity:1;transform:translate(calc(var(--gx,50px) * .35),calc(var(--gy,-30px) * .35)) scale(1.25);}100%{opacity:0;transform:translate(var(--gx,50px),calc(var(--gy,-30px) + 26px)) scale(.2);}}

/* 8. 主题透明光栅增益 Buff / 减益 Debuff / 治疗 / 护盾 / 免疫 / 净化光效（.igs-status-fx，零 SVG） */
${C} .igs-status-fx{position:absolute;left:50%;top:48%;z-index:45;width:var(--ssz,210px);height:var(--ssz,210px);translate:-50% -50%;pointer-events:none;--st-c:#ffe29a;--st-life:820ms;--st-f:none;overflow:visible;}
${C} :is(.lead,.mate) .igs-status-fx{left:36px;top:36px;width:142px;height:142px;}
${C} .igs-status-fx .st-tex{position:absolute;inset:-6%;width:112%;height:112%;object-fit:contain;pointer-events:none;filter:var(--st-f);transform-origin:50% 50%;user-select:none;-webkit-user-drag:none;}
${C} .igs-status-fx .st-halo{position:absolute;left:50%;top:50%;width:68%;height:68%;translate:-50% -50%;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--st-c) 40%,transparent) 0 26%,transparent 72%);animation:igs-st-halo var(--st-life) ease-out both;}
${C} .igs-status-fx.is-buff .st-tex,${C} .igs-status-fx.is-heal .st-tex,${C} .igs-status-fx.is-cleanse .st-tex{animation:igs-st-tex-rise var(--st-life) cubic-bezier(.18,.84,.3,1) both;}
${C} .igs-status-fx.is-block .st-tex{animation:igs-st-tex-condense var(--st-life) cubic-bezier(.16,.88,.3,1) both;}
${C} .igs-status-fx.is-artifact .st-tex{animation:igs-st-tex-prism var(--st-life) cubic-bezier(.14,.88,.28,1) both;}
${C} .igs-status-fx.is-debuff .st-tex{animation:igs-st-tex-sink var(--st-life) cubic-bezier(.22,.82,.32,1) both;}
${C} .igs-status-fx.is-debuff-poison .st-tex{animation:igs-tex-poison var(--st-life) ease-out both;}
${C} .igs-status-fx.is-debuff-confused .st-tex{animation:igs-st-tex-vortex var(--st-life) cubic-bezier(.2,.82,.3,1) both;}
${C} .igs-status-fx.is-debuff-vulnerable .st-tex{animation:igs-st-tex-crack var(--st-life) cubic-bezier(.16,.86,.28,1) both;}
${C} .igs-status-fx .st-dust{position:absolute;left:var(--dx,50%);top:var(--dy,64%);width:var(--ds,3px);height:var(--ds,3px);border-radius:50%;background:#fff;box-shadow:0 0 7px 1.5px var(--st-c);animation:igs-st-dust-up var(--st-life) ease-out both;animation-delay:var(--dd,0ms);}
${C} .igs-status-fx.is-debuff .st-dust{animation-name:igs-st-dust-down;}

@keyframes igs-st-halo{0%{opacity:0;scale:.45;}24%{opacity:.85;scale:1.05;}100%{opacity:0;scale:1.35;}}
@keyframes igs-st-tex-rise{0%{opacity:0;transform:translateY(24px) scale(.72);}22%{opacity:.96;transform:translateY(-2px) scale(1.02);}72%{opacity:.78;transform:translateY(-18px) scale(1.08);}100%{opacity:0;transform:translateY(-36px) scale(1.14);}}
@keyframes igs-st-tex-condense{0%{opacity:0;transform:scale(1.16) translateY(6px);filter:brightness(1.45);}20%{opacity:.96;transform:scale(.96) translateY(0);filter:brightness(1.18);}56%{opacity:.92;transform:scale(1) translateY(0);filter:brightness(1.04);}100%{opacity:0;transform:scale(1.04) translateY(-4px);filter:brightness(1);}}
@keyframes igs-st-tex-prism{0%{opacity:0;transform:scale(.62) rotate(-12deg);}18%{opacity:1;transform:scale(1.08) rotate(4deg);}100%{opacity:0;transform:scale(1.28) rotate(14deg);}}
@keyframes igs-st-tex-sink{0%{opacity:0;transform:scaleY(-1) translateY(28px) scale(.86);}24%{opacity:.94;transform:scaleY(-1) translateY(-4px) scale(1.04);}74%{opacity:.78;transform:scaleY(-1) translateY(-18px) scale(1.08);}100%{opacity:0;transform:scaleY(-1) translateY(-32px) scale(1.12);}}
@keyframes igs-st-tex-vortex{0%{opacity:0;transform:scale(.5) rotate(-52deg);}24%{opacity:.96;transform:scale(1.06) rotate(8deg);}74%{opacity:.84;transform:scale(1.14) rotate(56deg);}100%{opacity:0;transform:scale(1.24) rotate(94deg);}}
@keyframes igs-st-tex-crack{0%{opacity:0;transform:scale(1.25) rotate(10deg);}20%{opacity:.96;transform:scale(.96) rotate(-2deg);}66%{opacity:.82;transform:scale(1.04) rotate(-6deg);}100%{opacity:0;transform:scale(1.16) rotate(-10deg);}}
@keyframes igs-st-dust-up{0%{opacity:0;transform:translateY(10px) scale(.4);}24%{opacity:.95;transform:translateY(-14px) scale(1.1);}100%{opacity:0;transform:translateY(-64px) scale(.2);}}
@keyframes igs-st-dust-down{0%{opacity:0;transform:translateY(-14px) scale(.5);}24%{opacity:.92;transform:translateY(6px) scale(1);}100%{opacity:0;transform:translateY(52px) scale(.2);}}

/* 9. 压制旧版手绘尖刺 SVG 命中光（由主题光栅纹理接管，彻底消除卡通尖刺感） */
${C} .igs-hx-canvas .hx-hitfx .hx-fxlight{display:none !important;}
${C} .igs-combat-rarity-fx.is-hit .igs-combat-strike{display:none !important;}
${C} .igs-combat-heavy-burst .igs-combat-heavy-spark{display:none !important;}

/* 10. 减少动态效果与低画质优雅退化 */
${C}[data-igs-combat-reduced] .igs-impact-burst,
${C}[data-igs-combat-reduced] .igs-shield-break,
${C}[data-igs-combat-reduced] .igs-status-fx,
${C}[data-igs-combat-reduced]::after,
#igs-overlay[data-igs-quality="low"] ${C} .igs-impact-burst .vfx-mote,
#igs-overlay[data-igs-quality="low"] ${C} .igs-shield-break .sb-glint,
#igs-overlay[data-igs-quality="low"] ${C} .igs-status-fx .st-dust,
#igs-overlay[data-igs-quality="low"] ${C}::after{display:none !important;}
#igs-overlay[data-igs-quality="low"] ${S_UNIT}[data-igs-combat-react] ${S_PORTRAIT}{animation:none !important;}
@media(prefers-reduced-motion:reduce){
  ${C} .igs-impact-burst,${C} .igs-shield-break,${C} .igs-status-fx,${C}::after{display:none !important;}
  ${S_UNIT}[data-igs-combat-react] ${S_PORTRAIT}{animation:none !important;}
  ${C} .cx-hp::before{transition:none !important;}
}
`;

// 计算本次命中的卡肉分档（1 轻击 / 2 重击或破盾 / 3 巨创 / 4 击倒终结），按皮肤主题模型微调顿帧与震屏力度。
export function impactTierFor(marks, { rarity = null, maxHp = 0, isKo = false, heavyRank = 0, skin = '' } = {}) {
    const list = Array.isArray(marks) ? marks : [];
    const hasHit = list.some((m) => m.kind === 'damage' || m.kind === 'overkill');
    const hasBreak = list.some((m) => m.kind === 'shield-break');
    const hasGuard = !hasHit && !hasBreak && list.some((m) => m.kind === 'guard');
    const theme = resolveVfxTheme(skin);
    const scaleTier = (level, base) => ({
        level,
        ...base,
        hold: Math.round(base.hold * theme.hitstopScale),
        shake: Number((base.shake * theme.shakeScale).toFixed(2)),
    });
    if (isKo || list.some((m) => m.kind === 'ko')) return scaleTier(4, COMBAT_IMPACT_TIERS[4]);
    if (!hasHit && !hasBreak) {
        if (hasGuard) return scaleTier(1, { hold: 24, shake: 1.5, vignette: '', motes: 4, life: 460, sfx: '' });
        return { level: 0, hold: 0, shake: 0, vignette: '', motes: 0, life: 0, sfx: '' };
    }
    const dmg = list.reduce((s, m) => s + (m.kind === 'damage' || m.kind === 'overkill' ? Number(m.amount) || 0 : 0), 0);
    const hp = Number(maxHp) || 0;
    const rarRank = Number(rarity?.rank) || 0;
    if (heavyRank >= 2 || rarRank >= 3 || dmg >= 24 || (hp > 0 && dmg >= 8 && dmg >= hp * 0.4)) {
        return scaleTier(3, COMBAT_IMPACT_TIERS[3]);
    }
    if (hasBreak || heavyRank >= 1 || rarRank >= 2 || dmg >= 12 || (hp > 0 && dmg >= 5 && dmg >= hp * 0.2)) {
        return scaleTier(2, COMBAT_IMPACT_TIERS[2]);
    }
    return scaleTier(1, COMBAT_IMPACT_TIERS[1]);
}

function makeTexImg(doc, src, cls, filter = '') {
    const img = doc.createElement('img');
    img.className = `vfx-tex ${cls}`;
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    img.setAttribute?.('aria-hidden', 'true');
    if (filter && filter !== 'none') img.style?.setProperty?.('--tex-f', filter);
    return img;
}

// 挂载按皮肤主题模型定制的光栅命中特效：无任何 SVG，多段连击自动交替翻转斩向并微偏落点。
export function showImpactBurst(doc, unitEl, spec = {}, { reduced = false, low = false, schedule } = {}) {
    if (reduced || !unitEl || !doc?.createElement) return [];
    const theme = resolveVfxTheme(spec.skin);
    const kind = spec.isKo ? 'ko' : (spec.kind || spec.form || 'slash');
    const level = Math.max(1, Math.min(4, Number(spec.level) || 1));
    const tier = COMBAT_IMPACT_TIERS[level] || COMBAT_IMPACT_TIERS[1];
    const hitIdx = Number(spec.hitIndex) || 0;
    const color = spec.color || (
        kind === 'guard' ? theme.palette.guard
            : kind === 'poison' ? theme.palette.poison
                : kind === 'ko' ? theme.palette.ko
                    : level >= 2 ? theme.palette.heavy : theme.palette.hit
    );
    const size = Math.round(kind === 'ko' ? 286 : 186 + level * 32);
    const jitterX = hitIdx > 0 ? ((hitIdx % 2 ? 1 : -1) * Math.min(20, 8 + hitIdx * 5)) : 0;
    const jitterY = hitIdx > 0 ? (((hitIdx % 3) - 1) * 11) : 0;
    const ang = hitIdx > 0 ? ((hitIdx % 2 ? 1 : -1) * (14 + (hitIdx % 3) * 14)) : (kind === 'gun' ? -16 : 0);
    const flip = hitIdx % 2 === 1 ? -1 : 1;

    const el = doc.createElement('span');
    el.className = `igs-impact-burst is-${kind} is-level-${level} is-theme-${theme.pack}`;
    el.setAttribute?.('aria-hidden', 'true');
    el.setAttribute?.('data-vfx-theme', theme.id);
    el.style?.setProperty?.('--fx-c', color);
    el.style?.setProperty?.('--life', `${tier.life}ms`);
    el.style?.setProperty?.('--sz', `${size}px`);
    el.style?.setProperty?.('--ox', `${jitterX}px`);
    el.style?.setProperty?.('--oy', `${jitterY}px`);
    el.style?.setProperty?.('--ang', `${ang}deg`);
    el.style?.setProperty?.('--flip', String(flip));

    const glow = doc.createElement('i');
    glow.className = 'vfx-glow';
    el.appendChild(glow);
    if (level >= 2 && kind !== 'poison') {
        const wave = doc.createElement('i');
        wave.className = 'vfx-wave';
        el.appendChild(wave);
    }

    const elemFilter = (spec.element && ELEMENT_FILTERS[spec.element]) || '';
    const mainSlot = kind === 'poison' ? 'poison'
        : kind === 'guard' ? 'shield'
            : (kind === 'slash' || kind === 'gun') ? 'slash' : 'burst';
    const mainFilter = kind === 'curse' ? (elemFilter || theme.filters.debuff)
        : kind === 'guard' ? ''
            : kind === 'poison' ? '' : elemFilter;
    el.appendChild(makeTexImg(doc, vfxTextureUrl(theme.id, mainSlot), 'is-main', mainFilter));

    // 重击以上斩击叠一层核心冲击波纹理；击倒终结叠一层斩裂光；雷元素叠写真闪电纹理。
    if (!low && kind === 'slash' && level >= 2) {
        el.appendChild(makeTexImg(doc, vfxTextureUrl(theme.id, 'burst'), 'is-sub', elemFilter));
    } else if (!low && kind === 'ko') {
        el.appendChild(makeTexImg(doc, vfxTextureUrl(theme.id, 'slash'), 'is-sub', elemFilter));
    }
    if (!low && spec.element === 'thunder') {
        el.appendChild(makeTexImg(doc, vfxTextureUrl(theme.id, 'lightning'), 'is-bolt'));
    }

    if (!low) {
        for (let i = 0; i < tier.motes; i += 1) {
            const rad = ((Math.PI * 2) / tier.motes) * i + hitIdx * 0.4;
            const dist = 48 + level * 18 + (i % 3) * 14;
            const m = doc.createElement('i');
            m.className = 'vfx-mote';
            m.style?.setProperty?.('--mx', `${Math.round(Math.cos(rad) * dist)}px`);
            m.style?.setProperty?.('--my', `${Math.round(Math.sin(rad) * dist)}px`);
            m.style?.setProperty?.('--ms', `${2.5 + (i % 3) * 0.8}px`);
            m.style?.setProperty?.('--md', `${(i % 3) * 26}ms`);
            el.appendChild(m);
        }
    }

    unitEl.appendChild(el);
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    later(() => el.remove?.(), tier.life);
    return [el];
}

// 破盾（格挡被打碎）主题光栅晶盾爆碎特效：加载当前皮肤专属碎盾美术纹理 + 双层景深回响 + 细碎高光微尘。
export function showShieldBreak(doc, unitEl, { skin = '', reduced = false, low = false, schedule } = {}) {
    if (reduced || !unitEl || !doc?.createElement) return [];
    const theme = resolveVfxTheme(skin);
    const life = 700;
    const el = doc.createElement('span');
    el.className = `igs-shield-break is-theme-${theme.pack}`;
    el.setAttribute?.('aria-hidden', 'true');
    el.setAttribute?.('data-vfx-theme', theme.id);
    el.style?.setProperty?.('--sb-life', `${life}ms`);
    el.style?.setProperty?.('--fx-c', theme.palette.break);

    const flash = doc.createElement('i');
    flash.className = 'sb-flash';
    el.appendChild(flash);

    const src = vfxTextureUrl(theme.id, 'shatter');
    const main = doc.createElement('img');
    main.className = 'sb-tex';
    main.src = src;
    main.alt = '';
    main.decoding = 'async';
    main.setAttribute?.('aria-hidden', 'true');
    el.appendChild(main);

    if (!low) {
        const echo = doc.createElement('img');
        echo.className = 'sb-tex is-echo';
        echo.src = src;
        echo.alt = '';
        echo.decoding = 'async';
        echo.setAttribute?.('aria-hidden', 'true');
        el.appendChild(echo);

        const glints = [
            [-74, -48, 3.6, 0], [70, -52, 3.2, 18], [-82, 12, 3, 28], [78, 16, 3.4, 12],
            [-54, 48, 2.8, 36], [58, 44, 3, 22], [-22, -74, 3.2, 10], [28, -68, 2.8, 30],
        ];
        for (const [gx, gy, gs, gd] of glints) {
            const g = doc.createElement('i');
            g.className = 'sb-glint';
            g.style?.setProperty?.('--gx', `${gx}px`);
            g.style?.setProperty?.('--gy', `${gy}px`);
            g.style?.setProperty?.('--gs', `${gs}px`);
            g.style?.setProperty?.('--gd', `${gd}ms`);
            el.appendChild(g);
        }
    }

    unitEl.appendChild(el);
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    later(() => el.remove?.(), life);
    return [el];
}

// 挂载按皮肤主题模型定制的增益 Buff / 减益 Debuff / 护盾 / 治疗 / 免疫 / 净化光栅特效（同类别去重，零 SVG）。
export function showStatusFx(doc, unitEl, marks, { skin = '', reduced = false, low = false, schedule } = {}) {
    if (reduced || !unitEl || !doc?.createElement || !Array.isArray(marks) || !marks.length) return [];
    const theme = resolveVfxTheme(skin);
    const seen = new Set();
    const nodes = [];
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);

    const spawn = ({ cls, key, slot, color, filter, life = 820 }) => {
        if (seen.has(key)) return;
        seen.add(key);
        const el = doc.createElement('span');
        el.className = `igs-status-fx ${cls} is-theme-${theme.pack}`;
        el.setAttribute?.('aria-hidden', 'true');
        el.setAttribute?.('data-vfx-theme', theme.id);
        el.style?.setProperty?.('--st-life', `${life}ms`);
        el.style?.setProperty?.('--st-c', color);
        if (filter) el.style?.setProperty?.('--st-f', filter);

        const halo = doc.createElement('i');
        halo.className = 'st-halo';
        el.appendChild(halo);

        const img = doc.createElement('img');
        img.className = 'st-tex';
        img.src = vfxTextureUrl(theme.id, slot);
        img.alt = '';
        img.decoding = 'async';
        img.setAttribute?.('aria-hidden', 'true');
        el.appendChild(img);

        if (!low) {
            const isDebuff = cls.includes('is-debuff');
            for (let i = 0; i < 6; i += 1) {
                const d = doc.createElement('i');
                d.className = 'st-dust';
                d.style?.setProperty?.('--dx', `${20 + i * 12}%`);
                d.style?.setProperty?.('--dy', `${isDebuff ? 24 + (i % 3) * 10 : 72 - (i % 3) * 10}%`);
                d.style?.setProperty?.('--ds', `${2.4 + (i % 3) * 0.7}px`);
                d.style?.setProperty?.('--dd', `${i * 44}ms`);
                el.appendChild(d);
            }
        }
        unitEl.appendChild(el);
        nodes.push(el);
        later(() => el.remove?.(), life);
    };

    for (const m of marks) {
        if (m.kind === 'buff') {
            spawn({ cls: 'is-buff', key: 'buff', slot: 'aura', color: theme.palette.buff, filter: theme.filters.buff, life: 840 });
        } else if (m.kind === 'debuff') {
            if (m.status === 'poison') {
                spawn({ cls: 'is-debuff is-debuff-poison', key: 'debuff-poison', slot: 'poison', color: theme.palette.poison, filter: '', life: 820 });
            } else if (m.status === 'confused') {
                spawn({ cls: 'is-debuff is-debuff-confused', key: 'debuff-confused', slot: 'confused', color: theme.palette.confused, filter: '', life: 860 });
            } else if (m.status === 'vulnerable') {
                spawn({ cls: 'is-debuff is-debuff-vulnerable', key: 'debuff-vulnerable', slot: 'shatter', color: theme.palette.vulnerable, filter: theme.filters.vulnerable, life: 780 });
            } else {
                spawn({ cls: 'is-debuff', key: 'debuff', slot: 'aura', color: theme.palette.debuff, filter: theme.filters.debuff, life: 820 });
            }
        } else if (m.kind === 'block') {
            spawn({ cls: 'is-block', key: 'block', slot: 'shield', color: theme.palette.guard, filter: 'saturate(1.08) brightness(1.06)', life: 760 });
        } else if (m.kind === 'heal') {
            spawn({ cls: 'is-heal', key: 'heal', slot: 'aura', color: theme.palette.heal, filter: theme.filters.heal, life: 860 });
        } else if (m.kind === 'artifact') {
            spawn({ cls: 'is-artifact', key: 'artifact', slot: 'shield', color: theme.palette.artifact, filter: theme.filters.artifact, life: 780 });
        } else if (m.kind === 'cleanse') {
            spawn({ cls: 'is-cleanse', key: 'cleanse', slot: 'aura', color: theme.palette.cleanse, filter: theme.filters.cleanse, life: 780 });
        }
    }
    return nodes;
}

// 面板边缘暗角闪震（重击 / 巨创 / 击倒 / 主角受创）。
export function pulseVignette(root, kind, { reduced = false, low = false, schedule } = {}) {
    if (!root || !kind || reduced || low) return false;
    root.removeAttribute?.(COMBAT_IMPACT_VIGNETTE_ATTR);
    void root.offsetWidth;
    root.setAttribute?.(COMBAT_IMPACT_VIGNETTE_ATTR, kind);
    const ms = kind === 'ko' ? 580 : kind === 'massive' ? 460 : 420;
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    later(() => {
        if (root.getAttribute?.(COMBAT_IMPACT_VIGNETTE_ATTR) === kind) root.removeAttribute?.(COMBAT_IMPACT_VIGNETTE_ATTR);
    }, ms);
    return true;
}
