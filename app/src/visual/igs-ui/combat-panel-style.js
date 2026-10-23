import { IGS_UI_FILL, IGS_UI_INK, IGS_UI_NIGHT_RGB, IGS_UI_RADIUS, IGS_UI_WARM } from '../../styles/ui-material.js';

// 战斗面板：扁平、无描边；窄屏上下排布、手牌横向滚动。面板自带的演出层不受 panel:combat 暂停影响。
const P = '#igs-overlay #igs-combat-panel';
export const COMBAT_PANEL_STYLE_TEXT = `
#igs-combat-panel{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;pointer-events:auto;background:rgba(${IGS_UI_NIGHT_RGB},.94);color:${IGS_UI_INK.primary};font-size:14px;}
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
#igs-combat-panel .igs-combat-unit{padding:8px 10px;border-radius:${IGS_UI_RADIUS.card};background:${IGS_UI_FILL.rest};}
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
#igs-combat-panel .igs-combat-hand{display:flex;gap:6px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:thin;padding:2px;}
#igs-combat-panel .igs-combat-card{flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:86px;min-height:104px;padding:8px;border:0;border-radius:${IGS_UI_RADIUS.card};background:${IGS_UI_FILL.hover};color:inherit;font:inherit;text-align:left;cursor:pointer;}
#igs-combat-panel .igs-combat-card[data-card-type="attack"]{background:rgba(220,90,80,.22);}
#igs-combat-panel .igs-combat-card[data-card-type="power"]{background:rgba(150,120,230,.22);}
#igs-combat-panel .igs-combat-card.is-selected{box-shadow:inset 0 0 0 2px ${IGS_UI_WARM};}
#igs-combat-panel .igs-combat-card.is-disabled{opacity:.4;}
#igs-combat-panel .igs-combat-card-cost{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.35);font-size:12px;font-weight:700;}
#igs-combat-panel .igs-combat-card-name{font-size:13px;line-height:1.3;}
#igs-combat-panel .igs-combat-piles{flex:none;display:flex;flex-direction:column;gap:2px;color:${IGS_UI_INK.tertiary};font-size:12px;}
#igs-combat-panel .igs-combat-end,#igs-combat-panel .igs-combat-reward{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:${IGS_UI_RADIUS.card};background:${IGS_UI_FILL.rest};}
#igs-combat-panel .igs-combat-end-label{font-size:22px;font-weight:700;letter-spacing:.2em;text-align:center;}
#igs-combat-panel .igs-combat-end[data-outcome="defeat"] .igs-combat-end-label{color:#ff8a8a;}
@media (max-width:720px){#igs-combat-panel .igs-combat-field{grid-template-columns:1fr;align-content:start;}#igs-combat-panel .igs-combat-side.is-enemy{order:-1;}#igs-combat-panel .igs-combat-foot{flex-wrap:wrap;}#igs-combat-panel .igs-combat-hand{order:3;flex-basis:100%;}#igs-combat-panel .igs-combat-card{width:76px;min-height:92px;}}
@media (prefers-reduced-motion: reduce){#igs-combat-panel .igs-combat-hp i{transition:none;}}
#igs-combat-entry{position:absolute;left:50%;bottom:calc(var(--igs-dialog-height,30%) + 14px);z-index:7;transform:translateX(-50%);pointer-events:auto;}
#igs-overlay.igs-record-screen-open #igs-combat-entry{display:none;}
#igs-combat-entry .igs-combat-entry-btn{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:200px;padding:8px 40px 9px;border:0;background:linear-gradient(90deg,transparent,rgba(8,9,14,.72) 20%,rgba(8,9,14,.72) 80%,transparent);color:#f4f1ea;font:inherit;cursor:pointer;text-shadow:0 1px 4px rgba(0,0,0,.75);}
#igs-combat-entry .igs-combat-entry-cap{color:var(--igs-battle-accent,${IGS_UI_WARM});font-size:11px;font-weight:700;letter-spacing:.3em;}
#igs-combat-entry .igs-combat-entry-name{font-size:18px;font-weight:700;letter-spacing:.2em;}
#igs-combat-entry .igs-combat-entry-foes{font-size:12px;opacity:.8;letter-spacing:.1em;}
#igs-combat-entry .igs-combat-entry-btn:focus-visible{outline:2px solid ${IGS_UI_WARM};outline-offset:2px;}

`;
