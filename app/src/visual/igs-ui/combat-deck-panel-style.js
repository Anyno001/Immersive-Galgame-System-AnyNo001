import { IGS_UI_FILL, IGS_UI_INK, IGS_UI_NIGHT_RGB, IGS_UI_RADIUS, IGS_UI_WARM } from '../../styles/ui-material.js';

// 卡组构筑面板：扁平、无描边；宽屏左右两栏，窄屏上下排布。
const P = '#igs-combat-deck-panel';
export const COMBAT_DECK_PANEL_STYLE_TEXT = `
${P}{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;pointer-events:auto;background:rgba(${IGS_UI_NIGHT_RGB},.94);color:${IGS_UI_INK.primary};font-size:14px;}
${P} .igs-deck-body{display:flex;flex-direction:column;flex:1;min-height:0;}
${P} .igs-deck-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;}
${P} .igs-deck-title{font-weight:600;letter-spacing:.12em;}
${P} .igs-deck-notice{margin:0 14px 6px;padding:6px 10px;border-radius:${IGS_UI_RADIUS.control};background:rgba(255,106,106,.14);color:#ffb3b3;font-size:13px;}
${P} .igs-deck-main{display:flex;flex-direction:column;flex:1;min-height:0;gap:10px;padding:0 14px 12px;overflow:auto;}
${P} .igs-deck-state{margin:24px 0 0;color:${IGS_UI_INK.secondary};text-align:center;}
${P} .igs-deck-layout{display:grid;grid-template-columns:minmax(180px,240px) 1fr;gap:12px;flex:1;min-height:0;}
${P} .igs-deck-roster{display:flex;flex-direction:column;gap:4px;overflow:auto;}
${P} .igs-deck-roster .igs-deck-btn{text-align:left;}
${P} .igs-deck-roster .igs-deck-btn[aria-pressed="true"]{background:${IGS_UI_FILL.hover};font-weight:600;}
${P} .igs-deck-detail,${P} .igs-deck-pending,${P} .igs-deck-generate{display:flex;flex-direction:column;gap:8px;min-width:0;}
${P} .igs-deck-pending{padding:8px 10px;border-radius:${IGS_UI_RADIUS.card};background:${IGS_UI_FILL.rest};}
${P} .igs-deck-row,${P} .igs-deck-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
${P} .igs-deck-actions{justify-content:flex-end;}
${P} .igs-deck-label{min-width:3.5em;color:${IGS_UI_INK.tertiary};font-size:12px;}
${P} .igs-deck-chip{padding:4px 10px;border-radius:${IGS_UI_RADIUS.small};background:${IGS_UI_FILL.rest};font-size:13px;}
${P} .igs-deck-btn{min-height:32px;padding:5px 12px;border:0;border-radius:${IGS_UI_RADIUS.control};background:${IGS_UI_FILL.rest};color:inherit;font:inherit;cursor:pointer;}
${P} .igs-deck-btn:hover{background:${IGS_UI_FILL.hover};}
${P} .igs-deck-btn.is-primary{background:${IGS_UI_WARM};color:#1b1d21;font-weight:600;}
${P} .igs-deck-btn[aria-pressed="true"]:not(.is-primary){background:${IGS_UI_FILL.hover};}
${P} [aria-disabled="true"]{opacity:.45;cursor:default;}
${P} :is(button,[role="button"]):focus-visible{outline:2px solid ${IGS_UI_WARM};outline-offset:1px;}
${P} .igs-deck-size.is-error,${P} .igs-deck-err{color:#ff9a9a;}
${P} .igs-deck-cards{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;}
${P} .igs-deck-card{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 8px;border-radius:${IGS_UI_RADIUS.card};background:${IGS_UI_FILL.rest};}
${P} .igs-deck-card.is-error{background:rgba(255,106,106,.12);}
${P} .igs-deck-cost{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.35);font-size:12px;font-weight:700;}
${P} .igs-deck-name{flex:1;min-width:6em;}
${P} .igs-deck-count{color:${IGS_UI_INK.secondary};font-size:12px;}
@media (max-width:720px){${P} .igs-deck-layout{grid-template-columns:1fr;}${P} .igs-deck-roster{flex-direction:row;overflow-x:auto;}${P} .igs-deck-roster .igs-deck-btn{flex:none;}}
`;
