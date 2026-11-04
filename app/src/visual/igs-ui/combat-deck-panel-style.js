import { IGS_UI_BLUR, IGS_UI_NIGHT_RGB, IGS_UI_THICKNESS, igsUiSurface } from '../../styles/ui-material.js';
import { COMBAT_UI_VARS, combatRarityStyle } from './combat-panel-style.js';

// 人物状态面板：与资料页同一外壳材质（霜夜厚层 + 颗粒 + 全屏模糊一层），扁平、无描边；宽屏左右两栏，窄屏上下排布；详情按页签分五页。
const P = '#igs-combat-deck-panel';
const N = IGS_UI_NIGHT_RGB;
export const COMBAT_DECK_PANEL_STYLE_TEXT = `
${P}{${COMBAT_UI_VARS}position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;pointer-events:auto;background:radial-gradient(120% 90% at 0% 0%,rgba(255,255,255,.08),rgba(255,255,255,0) 70%),${igsUiSurface(IGS_UI_THICKNESS.thick)};-webkit-backdrop-filter:${IGS_UI_BLUR};backdrop-filter:${IGS_UI_BLUR};color:var(--igs-cb-ink);font-family:var(--igs-cb-font);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){${P}{background:rgba(${N},.96);}}
@media (prefers-reduced-transparency:reduce){${P}{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(${N},.97);}}
${P} .igs-deck-body{display:flex;flex-direction:column;flex:1;min-height:0;}
${P} .igs-deck-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:52px;padding:6px 10px 2px 18px;}
${P} .igs-deck-title{font-size:16px;font-weight:600;letter-spacing:.2em;}
${P} .igs-deck-icon-btn{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:var(--igs-cb-r-m);background:transparent;color:var(--igs-cb-ink-soft);cursor:pointer;transition:background .18s var(--igs-cb-ease),color .18s var(--igs-cb-ease);}
${P} .igs-deck-icon-btn:hover{background:var(--igs-cb-fill-hover);color:var(--igs-cb-ink);}
${P} .igs-deck-icon-btn svg{width:18px;height:18px;stroke-width:1.6;}
${P} .igs-deck-notice{margin:0 16px 8px;padding:8px 12px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);color:#f2b8b5;font-size:13px;line-height:1.6;}
${P} .igs-deck-main{display:flex;flex-direction:column;flex:1;min-height:0;gap:12px;padding:0 16px 14px;overflow:auto;scrollbar-width:none;}
${P} .igs-deck-main::-webkit-scrollbar{display:none;}
${P} .igs-generation-form{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);min-width:0;}
${P} .igs-generation-form p{font-size:12px;color:var(--igs-cb-ink-soft);margin:4px 0;}
${P} .igs-generation-form textarea,${P} .igs-generation-form select{display:block;box-sizing:border-box;width:100%;padding:9px;margin:5px 0;background:var(--igs-cb-fill);color:inherit;border:0;border-radius:var(--igs-cb-r-m);font:inherit;resize:vertical;}
${P} .igs-generation-form pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;scrollbar-width:none;font-size:12px;}
${P} .igs-generation-check{display:flex;align-items:flex-start;gap:8px;margin:8px 0;overflow-wrap:anywhere;}
${P} .igs-generation-check input{flex:none;margin-top:4px;}
${P} .igs-generation-form pre::-webkit-scrollbar{display:none;}
${P} .igs-generation-form :is(textarea,select):focus-visible{outline:1px solid var(--igs-cb-warm);outline-offset:2px;}
${P} .igs-generation-form summary{cursor:pointer;overflow-wrap:anywhere;}
${P} .igs-deck-state{margin:24px 0 0;color:var(--igs-cb-ink-soft);letter-spacing:.06em;text-align:center;}
${P} .igs-deck-layout{display:grid;grid-template-columns:minmax(180px,240px) 1fr;gap:16px;flex:1;min-height:0;}
${P} .igs-deck-roster{display:flex;flex-direction:column;gap:2px;overflow:auto;scrollbar-width:none;}
${P} .igs-deck-roster .igs-deck-btn{justify-content:flex-start;min-height:40px;background:transparent;text-align:left;}
${P} .igs-deck-roster .igs-deck-btn:hover{background:var(--igs-cb-fill-hover);}
${P} .igs-deck-roster .igs-deck-btn[aria-pressed="true"]{background:var(--igs-cb-fill-active);color:var(--igs-cb-ink);font-weight:600;}
${P} .igs-deck-detail,${P} .igs-deck-pending,${P} .igs-deck-generate,${P} .igs-deck-build{display:flex;flex-direction:column;gap:10px;min-width:0;}
${P} .igs-deck-pending{padding:10px 12px;border-radius:var(--igs-cb-r-l);background:var(--igs-cb-fill);}
${P} .igs-deck-row,${P} .igs-deck-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}
${P} .igs-deck-actions{justify-content:flex-end;}
${P} .igs-deck-label{min-width:3.5em;color:var(--igs-cb-ink-faint);font-size:11px;font-weight:500;letter-spacing:.16em;}
${P} .igs-deck-chip{display:inline-flex;align-items:center;min-height:28px;padding:4px 10px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);color:var(--igs-cb-ink-soft);font-size:13px;font-weight:500;letter-spacing:.04em;}
${P} .igs-deck-chip-art{flex:none;width:20px;height:20px;margin-right:6px;padding:0;border:0;background:none;cursor:zoom-in;}
${P} .igs-deck-chip-art img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;}
${P} .igs-deck-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:6px 12px;border:0;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);color:var(--igs-cb-ink-soft);font:inherit;font-size:13px;font-weight:500;letter-spacing:.04em;cursor:pointer;transition:background .18s var(--igs-cb-ease),color .18s var(--igs-cb-ease),opacity .18s var(--igs-cb-ease),transform .12s var(--igs-cb-ease);}
${P} .igs-deck-btn:hover{background:var(--igs-cb-fill-hover);color:var(--igs-cb-ink);}
${P} .igs-deck-btn[aria-pressed="true"]:not(.is-primary){background:var(--igs-cb-fill-active);color:var(--igs-cb-ink);font-weight:600;}
${P} .igs-deck-btn.is-primary{min-height:40px;padding:9px 24px;background:var(--igs-cb-ink);color:var(--igs-cb-on-ink);font-size:14px;font-weight:600;letter-spacing:.14em;}
${P} .igs-deck-input{flex:1 1 160px;min-width:0;max-width:240px;min-height:32px;padding:6px 10px;box-sizing:border-box;border:0;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);color:var(--igs-cb-ink);font:inherit;outline:none;}
${P} .igs-deck-input:focus{background:var(--igs-cb-fill-hover);}
${P} .igs-deck-btn.is-primary:hover{opacity:.88;}
${P} :is(.igs-deck-btn,.igs-deck-icon-btn,.igs-deck-tab):active{transform:scale(.97);}
${P} [aria-disabled="true"]{opacity:.45;cursor:default;}
${P} :is(button,[role="button"]):focus-visible{outline:2px solid var(--igs-cb-warm);outline-offset:2px;}
${P} .igs-deck-size{color:var(--igs-cb-ink-soft);font-size:13px;font-variant-numeric:tabular-nums;}
${P} .igs-deck-size.is-error,${P} .igs-deck-err{color:#f2b8b5;}
${P} .igs-deck-err{font-size:12px;overflow-wrap:anywhere;}
${P} .igs-deck-cards{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;}
${P} .igs-deck-card{--igs-card-tint:var(--igs-cb-skill);display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-height:44px;padding:6px 8px 6px 10px;box-sizing:border-box;border-radius:var(--igs-cb-r-m);background:transparent;transition:background .18s var(--igs-cb-ease);}
${P} .igs-deck-card:hover{background:var(--igs-cb-fill);}
${P} .igs-deck-card[data-card-type="attack"]{--igs-card-tint:var(--igs-cb-attack);}
${P} .igs-deck-card[data-card-type="power"]{--igs-card-tint:var(--igs-cb-power);}
${P} .igs-deck-card.is-error{background:rgba(234,138,138,.1);}
${P} .igs-deck-cost{flex:none;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:color-mix(in srgb,var(--igs-card-tint) 26%,transparent);color:var(--igs-cb-ink);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;}
${P} .igs-deck-name{flex:1;min-width:6em;font-weight:500;letter-spacing:.04em;}
${P} .igs-deck-card-info{flex:1 1 200px;min-width:0;overflow-wrap:anywhere;}
${P} .igs-deck-effect,${P} .igs-deck-help{margin:4px 0;color:var(--igs-cb-ink-soft);font-size:12px;line-height:1.6;overflow-wrap:anywhere;}
${P} .igs-deck-effect summary{cursor:pointer;color:var(--igs-cb-ink-faint);}
${P} .igs-deck-pool{padding:10px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);min-width:0;}
${P} .igs-deck-pool>summary{cursor:pointer;color:var(--igs-cb-ink-soft);overflow-wrap:anywhere;}
${P} .igs-deck-count{color:var(--igs-cb-ink-faint);font-size:12px;font-variant-numeric:tabular-nums;}
${P} .igs-deck-req{color:var(--igs-cb-ink-soft);font-size:12px;font-variant-numeric:tabular-nums;}
${P} .igs-deck-req.is-up{color:#5fd0b8;}
${P} .igs-deck-req.is-down{color:var(--igs-cb-ink-faint);}
${P} .igs-deck-art{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:var(--igs-cb-r-m);overflow:hidden;background:radial-gradient(70% 90% at 50% 40%,color-mix(in srgb,var(--igs-card-tint) 22%,transparent),transparent 72%),var(--igs-cb-fill);color:var(--igs-card-tint);}
${P} .igs-deck-art svg{width:20px;height:20px;stroke-width:1.4;}
${P} .igs-deck-art img{display:block;width:100%;height:100%;object-fit:cover;}
${P} .igs-deck-card[data-rarity]:not(:is([data-rarity="basic"],[data-rarity="epic"],[data-rarity="mythic"])) .igs-deck-cost{box-shadow:0 0 0 2px var(--rar);}
${P} .igs-deck-card[data-rarity="signature"] .igs-deck-name{color:#f6c9a8;}
${P} .igs-deck-chip.is-locked{color:var(--igs-cb-ink-faint);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rar) 40%,transparent);}
${P} .igs-deck-tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;}
${P} .igs-deck-tabs::-webkit-scrollbar{display:none;}
${P} .igs-deck-tab{flex:none;min-height:34px;padding:6px 16px;border:0;border-radius:var(--igs-cb-r-m);background:transparent;color:var(--igs-cb-ink-soft);font:inherit;font-size:13px;font-weight:500;letter-spacing:.16em;cursor:pointer;transition:background .18s var(--igs-cb-ease),color .18s var(--igs-cb-ease),transform .12s var(--igs-cb-ease);}
${P} .igs-deck-tab:hover{background:var(--igs-cb-fill-hover);color:var(--igs-cb-ink);}
${P} .igs-deck-tab[aria-selected="true"]{background:var(--igs-cb-fill-active);color:var(--igs-cb-ink);font-weight:600;}
${P} .igs-deck-page{display:flex;flex-direction:column;gap:10px;min-width:0;}
${P} .igs-deck-abilities{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0;padding:0;list-style:none;}
${P} .igs-deck-abilities.is-alloc{grid-template-columns:repeat(2,minmax(0,1fr));}
${P} .igs-deck-ability{display:flex;align-items:center;gap:8px;min-height:44px;padding:6px 10px;box-sizing:border-box;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);}
${P} .igs-deck-ability-name{flex:1;color:var(--igs-cb-ink-faint);font-size:12px;font-weight:500;letter-spacing:.16em;}
${P} .igs-deck-ability-score{min-width:1.6em;color:var(--igs-cb-ink);font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;text-align:center;}
${P} .igs-deck-ability.is-added .igs-deck-ability-score{color:#5fd0b8;}
${P} .igs-deck-ability-mod{min-width:2.4em;color:var(--igs-cb-ink-soft);font-size:12px;font-variant-numeric:tabular-nums;text-align:right;}
${P} .igs-deck-btn.is-step{min-width:32px;min-height:32px;padding:0;font-size:16px;line-height:1;}
${P} .igs-deck-collection{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;}
${P} .igs-deck-keepsake{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;min-height:40px;padding:8px 10px;box-sizing:border-box;border-radius:var(--igs-cb-r-m);}
${P} .igs-deck-keepsake:hover{background:var(--igs-cb-fill);}
${P} .igs-deck-bag-acts{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto;}
${P} .igs-deck-name.is-empty,${P} .igs-deck-name.is-locked{opacity:.55;}
/* 抽人物特性揭晓（P-f）：蓄力时背面卡居中呼吸，光圈旋转、粒子向中心聚拢，颜色取预定稀有度（--rar）；第一次翻开（data-fresh）翻面爆光，神话另加震屏与整面板闪白；之后重绘为静止终态。 */
${P} .igs-deck-reveal{display:flex;flex-direction:column;align-items:center;gap:14px;padding:12px 0 4px;}
${P} .igs-deck-reveal-stage{position:relative;display:grid;place-items:center;width:min(220px,60vw);aspect-ratio:1;perspective:900px;}
${P} .igs-deck-reveal-ring{position:absolute;inset:6%;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 30%,color-mix(in srgb,var(--rar) 75%,transparent) 50%,transparent 70% 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));animation:igs-deck-reveal-spin 1.6s linear infinite;}
${P} :is(.igs-deck-reveal-motes,.igs-deck-reveal-sparks){position:absolute;inset:0;pointer-events:none;}
${P} .igs-deck-reveal-motes i{position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px;border-radius:50%;background:var(--rar);box-shadow:0 0 8px var(--rar);opacity:0;animation:igs-deck-reveal-mote 1.4s calc(var(--i) * -.117s) ease-in infinite;}
${P} .igs-deck-reveal-card{position:relative;width:46%;aspect-ratio:5/7;border-radius:var(--igs-cb-r-l);transform-style:preserve-3d;}
${P} .igs-deck-reveal[data-phase="charge"] .igs-deck-reveal-card{animation:igs-deck-reveal-charge 1.2s ease-in-out infinite;}
${P} :is(.igs-deck-reveal-back,.igs-deck-reveal-face){position:absolute;inset:0;border-radius:var(--igs-cb-r-l);-webkit-backface-visibility:hidden;backface-visibility:hidden;}
${P} .igs-deck-reveal-back{background:radial-gradient(60% 50% at 50% 50%,rgba(255,255,255,.16),transparent 70%),linear-gradient(160deg,rgba(255,255,255,.12),rgba(255,255,255,.03)),var(--igs-cb-fill);box-shadow:0 18px 36px -18px rgba(0,0,0,.8);}
${P} .igs-deck-reveal-face{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px;box-sizing:border-box;background:radial-gradient(80% 60% at 50% 30%,color-mix(in srgb,var(--rar) 28%,transparent),transparent 72%),var(--igs-cb-fill);box-shadow:0 0 30px -6px color-mix(in srgb,var(--rar) 60%,transparent),0 18px 36px -18px rgba(0,0,0,.8);text-align:center;}
${P} .igs-deck-reveal-tag{color:var(--rar);font-size:11px;font-weight:600;letter-spacing:.2em;}
${P} .igs-deck-reveal-name{color:var(--igs-cb-ink);font-size:16px;font-weight:600;letter-spacing:.08em;overflow-wrap:anywhere;}
${P} .igs-deck-reveal:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-deck-reveal-name{color:var(--rar);}
${P} .igs-deck-reveal-state{margin:0;color:var(--igs-cb-ink-soft);font-size:13px;letter-spacing:.16em;}
${P} .igs-deck-reveal-info{display:flex;flex-direction:column;align-items:center;gap:4px;max-width:28em;text-align:center;}
${P} .igs-deck-reveal-text{margin:0;color:var(--igs-cb-ink);font-size:14px;}
${P} .igs-deck-reveal-origin{margin:0;color:var(--igs-cb-ink-soft);font-size:12px;}
${P} .igs-deck-reveal-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:min(100%,520px);margin:0;padding:0;list-style:none;}
${P} .igs-deck-reveal-slot{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0;padding:10px 12px;box-sizing:border-box;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);}
${P} .igs-deck-reveal-slot .igs-deck-name{flex:none;min-width:0;}
${P} .igs-deck-reveal-slot .igs-deck-btn{align-self:flex-end;}
${P} .igs-deck-reveal .igs-deck-actions{justify-content:center;}
${P} .igs-deck-reveal[data-fresh] .igs-deck-reveal-back{animation:igs-deck-reveal-back-out .3s ease-in both;}
${P} .igs-deck-reveal[data-fresh] .igs-deck-reveal-face{animation:igs-deck-reveal-face-in .34s .26s ease-out both;}
${P} .igs-deck-reveal[data-fresh] :is(.igs-deck-reveal-info,.igs-deck-reveal-slots){animation:igs-deck-reveal-rise .4s .6s ease-out both;}
${P} .igs-deck-reveal-burst{position:absolute;inset:-10%;border-radius:50%;pointer-events:none;background:radial-gradient(circle,color-mix(in srgb,var(--rar) 70%,#fff) 0,color-mix(in srgb,var(--rar) 35%,transparent) 35%,transparent 68%);opacity:0;animation:igs-deck-reveal-burst .7s .3s ease-out both;}
${P} .igs-deck-reveal-sparks i{position:absolute;left:50%;top:50%;width:4px;height:12px;margin:-6px -2px;border-radius:2px;background:var(--rar);box-shadow:0 0 6px var(--rar);opacity:0;animation:igs-deck-reveal-spark .7s .32s ease-out both;}
${P} .igs-deck-reveal[data-fresh][data-rarity="mythic"] .igs-deck-reveal-stage{animation:igs-deck-reveal-shake .42s .3s linear both;}
${P} .igs-deck-reveal-flash{position:absolute;inset:0;z-index:2;pointer-events:none;background:#fff;opacity:0;animation:igs-deck-reveal-flash .45s .3s ease-out both;}

${combatRarityStyle(`${P} :is(.igs-deck-card,.igs-deck-chip,.igs-deck-reveal,.igs-deck-reveal-slot)`)}
${P} .igs-deck-reveal[data-rarity="mythic"]::after{content:none;}
@media (max-width:720px){${P} .igs-deck-layout{grid-template-columns:1fr;}${P} .igs-deck-roster{flex-direction:row;overflow-x:auto;}${P} .igs-deck-roster .igs-deck-btn{flex:none;}${P} .igs-deck-main{padding:0 12px 12px;}${P} .igs-deck-abilities{grid-template-columns:repeat(2,minmax(0,1fr));}${P} .igs-deck-abilities.is-alloc{grid-template-columns:1fr;}}
@media (prefers-reduced-motion:reduce){${P} :is(.igs-deck-btn,.igs-deck-card,.igs-deck-icon-btn,.igs-deck-tab){transition:none;}}
@keyframes igs-deck-reveal-spin{to{transform:rotate(1turn);}}
@keyframes igs-deck-reveal-mote{0%{opacity:0;transform:rotate(calc(var(--i) * 30deg)) translateY(-96px) scale(.6);}25%{opacity:1;}100%{opacity:0;transform:rotate(calc(var(--i) * 30deg)) translateY(-12px) scale(1.1);}}
@keyframes igs-deck-reveal-charge{0%,100%{transform:scale(1);box-shadow:0 0 0 transparent;}50%{transform:scale(1.04);box-shadow:0 0 28px color-mix(in srgb,var(--rar) 55%,transparent);}}
@keyframes igs-deck-reveal-back-out{from{transform:rotateY(0);opacity:1;}to{transform:rotateY(90deg);opacity:0;}}
@keyframes igs-deck-reveal-face-in{from{transform:rotateY(-90deg);}to{transform:rotateY(0);}}
@keyframes igs-deck-reveal-burst{0%{opacity:0;transform:scale(.4);}35%{opacity:1;}100%{opacity:0;transform:scale(1.25);}}
@keyframes igs-deck-reveal-spark{0%{opacity:1;transform:rotate(calc(var(--i) * 30deg)) translateY(-20px);}100%{opacity:0;transform:rotate(calc(var(--i) * 30deg)) translateY(-118px);}}
@keyframes igs-deck-reveal-rise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
@keyframes igs-deck-reveal-shake{0%,100%{transform:none;}20%{transform:translate(-5px,2px);}40%{transform:translate(5px,-2px);}60%{transform:translate(-3px,1px);}80%{transform:translate(2px,-1px);}}
@keyframes igs-deck-reveal-flash{0%{opacity:.8;}100%{opacity:0;}}
/* 降级：减少动态效果（data-still，面板按偏好写入；另有媒体查询兜底）直接显示结果，不放光圈、粒子与翻面；低画质去掉粒子与闪白。 */
${P} .igs-deck-reveal[data-still] :is(.igs-deck-reveal-ring,.igs-deck-reveal-motes){display:none;}
${P} .igs-deck-reveal[data-still] .igs-deck-reveal-card{animation:none;}
#igs-overlay[data-igs-quality="low"] ${P} :is(.igs-deck-reveal-motes,.igs-deck-reveal-sparks,.igs-deck-reveal-flash){display:none;}
@media (prefers-reduced-motion:reduce){${P} :is(.igs-deck-reveal-ring,.igs-deck-reveal-motes,.igs-deck-reveal-burst,.igs-deck-reveal-sparks,.igs-deck-reveal-flash){display:none;}${P} .igs-deck-reveal :is(.igs-deck-reveal-stage,.igs-deck-reveal-card,.igs-deck-reveal-back,.igs-deck-reveal-face,.igs-deck-reveal-info,.igs-deck-reveal-slots){animation:none!important;}${P} .igs-deck-reveal[data-fresh] .igs-deck-reveal-back{display:none;}}
`;
