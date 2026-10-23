import { IGS_UI_FILL, IGS_UI_INK, IGS_UI_NIGHT_RGB, IGS_UI_RADIUS, IGS_UI_WARM } from '../../styles/ui-material.js';

// 战斗面板：扁平、无描边；窄屏上下排布；手牌重叠成扇形握牌、不滚动，悬停/聚焦/选中抬起。面板自带的演出层不受 panel:combat 暂停影响。
const P = '#igs-overlay #igs-combat-panel';
export const COMBAT_PANEL_STYLE_TEXT = `
#igs-combat-panel{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;pointer-events:auto;background:linear-gradient(180deg,rgba(${IGS_UI_NIGHT_RGB},.42),rgba(${IGS_UI_NIGHT_RGB},.6) 55%,rgba(${IGS_UI_NIGHT_RGB},.88));color:${IGS_UI_INK.primary};font-size:14px;}
${P} :is(#igs-fx-stage,#igs-fx-front),${P} :is(#igs-fx-stage,#igs-fx-front) *,${P} :is(#igs-fx-stage,#igs-fx-front) *::before,${P} :is(#igs-fx-stage,#igs-fx-front) *::after{animation-play-state:running!important;}
#igs-combat-panel .igs-combat-body{position:relative;z-index:1;display:flex;flex-direction:column;flex:1;min-height:0;}
#igs-combat-panel .igs-combat-fx{position:absolute;inset:0;z-index:2;overflow:hidden;pointer-events:none;}
#igs-combat-panel .igs-combat-fx #igs-stage-motion{position:absolute;inset:0;}
#igs-combat-panel .igs-combat-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;}
#igs-combat-panel .igs-combat-title{font-weight:600;letter-spacing:.12em;}
#igs-combat-panel .igs-combat-notice{margin:0 14px 6px;padding:6px 10px;border-radius:${IGS_UI_RADIUS.control};background:rgba(255,106,106,.14);color:#ffb3b3;font-size:13px;}
#igs-combat-panel .igs-combat-main{display:flex;flex-direction:column;flex:1;min-height:0;gap:10px;padding:0 14px 12px;overflow:auto;}
#igs-combat-panel .igs-combat-state{margin:24px 0 0;color:${IGS_UI_INK.secondary};text-align:center;}
#igs-combat-panel .igs-combat-row,#igs-combat-panel .igs-combat-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
#igs-combat-panel .igs-combat-actions{justify-content:flex-end;}
#igs-combat-panel .igs-combat-label{min-width:3.5em;color:${IGS_UI_INK.tertiary};font-size:12px;}
#igs-combat-panel .igs-combat-chip{padding:4px 10px;border-radius:${IGS_UI_RADIUS.small};background:${IGS_UI_FILL.rest};font-size:13px;}
#igs-combat-panel .igs-combat-btn{min-height:32px;padding:5px 14px;border:0;border-radius:${IGS_UI_RADIUS.control};background:${IGS_UI_FILL.rest};color:inherit;font:inherit;cursor:pointer;}
#igs-combat-panel .igs-combat-btn:hover{background:${IGS_UI_FILL.hover};}
#igs-combat-panel .igs-combat-btn.is-primary{background:${IGS_UI_WARM};color:#1b1d21;font-weight:600;}
#igs-combat-panel [aria-disabled="true"]{opacity:.45;cursor:default;}
#igs-combat-panel :is(button,[role="button"]):focus-visible{outline:2px solid ${IGS_UI_WARM};outline-offset:1px;}
#igs-combat-panel .igs-combat-field{display:grid;grid-template-columns:1fr 1fr;gap:16px;flex:1;min-height:0;align-content:center;}
#igs-combat-panel .igs-combat-side{display:flex;flex-direction:column;justify-content:center;gap:8px;}
#igs-combat-panel .igs-combat-unit{display:flex;align-items:stretch;gap:10px;padding:8px 10px;border-radius:${IGS_UI_RADIUS.card};background:${IGS_UI_FILL.rest};}
#igs-combat-panel .igs-combat-unit-info{flex:1;min-width:0;}
#igs-combat-panel .igs-combat-portrait{flex:none;width:72px;height:96px;overflow:hidden;border-radius:${IGS_UI_RADIUS.small};background:rgba(0,0,0,.25);}
#igs-combat-panel .igs-combat-portrait img,#igs-combat-panel .igs-combat-portrait svg{display:block;width:100%;height:100%;object-fit:cover;object-position:top center;}
#igs-combat-panel .igs-combat-portrait[data-side="enemy"] img{object-fit:contain;object-position:center bottom;}
#igs-combat-panel .igs-combat-unit.is-controlled .igs-combat-portrait{width:96px;height:128px;}
#igs-combat-panel .igs-combat-lobby-stage{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;padding:8px 0;}
#igs-combat-panel .igs-combat-lobby-figure{display:flex;flex-direction:column;align-items:center;gap:4px;margin:0;}
#igs-combat-panel .igs-combat-lobby-figure .igs-combat-portrait{width:120px;height:160px;}
#igs-combat-panel .igs-combat-lobby-figure figcaption{font-size:13px;color:${IGS_UI_INK.secondary};}
#igs-combat-panel .igs-combat-unit.is-controlled{background:${IGS_UI_FILL.hover};}
#igs-combat-panel .igs-combat-unit.is-down{opacity:.4;}
#igs-combat-panel .igs-combat-unit.is-targetable{cursor:pointer;box-shadow:inset 0 0 0 2px ${IGS_UI_WARM};}
#igs-combat-panel .igs-combat-unit-name{display:flex;justify-content:space-between;gap:6px;font-weight:600;}
#igs-combat-panel .igs-combat-block{color:#8fd8ff;font-weight:500;font-size:12px;}
#igs-combat-panel .igs-combat-hp{position:relative;height:16px;margin-top:6px;border-radius:${IGS_UI_RADIUS.small};background:rgba(255,255,255,.08);overflow:hidden;font-size:11px;}
#igs-combat-panel .igs-combat-hp i{position:absolute;inset:0 auto 0 0;width:var(--igs-combat-hp,100%);background:rgba(220,80,80,.7);transition:width .3s ease;}
#igs-combat-panel .igs-combat-hp span{position:relative;display:block;text-align:center;line-height:16px;}
#igs-combat-panel .igs-combat-statuses{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;font-size:11px;color:${IGS_UI_INK.secondary};}
#igs-combat-panel .igs-combat-intent{margin-top:4px;color:${IGS_UI_WARM};font-size:12px;}
#igs-combat-panel .igs-combat-foot{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(0,0,0,.22);}
#igs-combat-panel .igs-combat-energy{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:${IGS_UI_WARM};color:#1b1d21;font-weight:700;}
#igs-combat-panel .igs-combat-hand{--igs-card-w:124px;position:relative;display:flex;justify-content:center;align-items:flex-end;flex:1;min-width:0;overflow:visible;padding:20px 8px 2px;}
#igs-combat-panel .igs-combat-card{position:relative;flex:none;display:flex;flex-direction:column;align-items:stretch;gap:4px;width:var(--igs-card-w);min-height:176px;padding:6px;border:0;border-radius:${IGS_UI_RADIUS.card};background:rgb(46,50,60);color:inherit;font:inherit;text-align:left;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.45);transform-origin:50% 130%;transform:translateY(var(--fan-y,0px)) rotate(var(--fan-r,0deg));transition:transform .18s ease,margin .18s ease;}
#igs-combat-panel .igs-combat-hand .igs-combat-card+.igs-combat-card{margin-left:min(-30px,calc((100% - var(--fan-n,1) * var(--igs-card-w)) / (var(--fan-n,2) - 1)));}
#igs-combat-panel .igs-combat-card:is(:hover,:focus-visible,.is-selected){z-index:5;transform:translateY(-22px) rotate(0deg) scale(1.08);}
#igs-combat-panel .igs-combat-card-art{display:block;height:64px;overflow:hidden;border-radius:${IGS_UI_RADIUS.small};}
#igs-combat-panel .igs-combat-card-art svg{display:block;width:100%;height:100%;}
#igs-combat-panel .igs-combat-card-type{color:${IGS_UI_INK.tertiary};font-size:11px;text-align:center;}
#igs-combat-panel .igs-combat-card-text{font-size:11.5px;line-height:1.35;color:${IGS_UI_INK.secondary};}
#igs-combat-panel .igs-combat-card[data-card-type="attack"]{background:rgb(70,44,46);}
#igs-combat-panel .igs-combat-card[data-card-type="power"]{background:rgb(56,48,82);}
#igs-combat-panel .igs-combat-card.is-selected{box-shadow:inset 0 0 0 2px ${IGS_UI_WARM},0 6px 16px rgba(0,0,0,.5);}
#igs-combat-panel .igs-combat-card.is-disabled{filter:grayscale(.7) brightness(.6);}
#igs-combat-panel .igs-combat-card-cost{position:absolute;left:4px;top:4px;z-index:1;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:${IGS_UI_WARM};color:#1b1d21;font-size:12px;font-weight:700;}
#igs-combat-panel .igs-combat-card-name{padding-left:24px;font-size:13px;font-weight:600;line-height:1.4;}
#igs-combat-panel .igs-combat-piles{flex:none;display:flex;flex-direction:column;gap:2px;color:${IGS_UI_INK.tertiary};font-size:12px;}
#igs-combat-panel .igs-combat-end,#igs-combat-panel .igs-combat-reward{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:${IGS_UI_RADIUS.card};background:${IGS_UI_FILL.rest};}
#igs-combat-panel .igs-combat-end-label{font-size:22px;font-weight:700;letter-spacing:.2em;text-align:center;}
#igs-combat-panel .igs-combat-end[data-outcome="defeat"] .igs-combat-end-label{color:#ff8a8a;}
@media (max-width:720px){#igs-combat-panel .igs-combat-field{grid-template-columns:1fr;align-content:start;}#igs-combat-panel .igs-combat-side.is-enemy{order:-1;}#igs-combat-panel .igs-combat-foot{flex-wrap:wrap;}#igs-combat-panel .igs-combat-hand{--igs-card-w:96px;order:3;flex-basis:100%;}#igs-combat-panel .igs-combat-card{min-height:150px;}#igs-combat-panel .igs-combat-card-art{height:52px;}#igs-combat-panel .igs-combat-portrait{width:56px;height:74px;}#igs-combat-panel .igs-combat-unit.is-controlled .igs-combat-portrait{width:64px;height:86px;}#igs-combat-panel .igs-combat-lobby-figure .igs-combat-portrait{width:88px;height:118px;}}
@media (prefers-reduced-motion: reduce){#igs-combat-panel .igs-combat-hp i,#igs-combat-panel .igs-combat-card{transition:none;}}
#igs-combat-entry{position:absolute;left:50%;bottom:calc(var(--igs-dialog-height,30%) + 14px);z-index:7;transform:translateX(-50%);pointer-events:auto;}
#igs-overlay.igs-record-screen-open #igs-combat-entry{display:none;}
#igs-overlay[data-igs-combat-open] #igs-dialog-layer{visibility:hidden;}
#igs-combat-entry .igs-combat-entry-btn{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:200px;padding:8px 40px 9px;border:0;background:linear-gradient(90deg,transparent,rgba(8,9,14,.72) 20%,rgba(8,9,14,.72) 80%,transparent);color:#f4f1ea;font:inherit;cursor:pointer;text-shadow:0 1px 4px rgba(0,0,0,.75);}
#igs-combat-entry .igs-combat-entry-cap{color:var(--igs-battle-accent,${IGS_UI_WARM});font-size:11px;font-weight:700;letter-spacing:.3em;}
#igs-combat-entry .igs-combat-entry-name{font-size:18px;font-weight:700;letter-spacing:.2em;}
#igs-combat-entry .igs-combat-entry-foes{font-size:12px;opacity:.8;letter-spacing:.1em;}
#igs-combat-entry .igs-combat-entry-btn:focus-visible{outline:2px solid ${IGS_UI_WARM};outline-offset:2px;}

`;
