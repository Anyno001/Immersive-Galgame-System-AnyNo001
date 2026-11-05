const O = '#igs-overlay[data-igs-duel]';
const R = `${O} #igs-combat-panel`;
const S = `${O} #igs-sprite`;

export const INTIMATE_DUEL_STYLE_TEXT = `
${R}{inset:0 0 0 auto;width:58%;}
${R}{background:var(--igs-cb-duel-ground,#121212);}
${R} .igs-duel-result{justify-content:center;gap:18px;padding:0 0 6px;}
${R} .igs-duel-result .igs-combat-actions{margin:0;flex:0 0 auto;}
${S}{left:21%;width:38%;}
@media(max-width:720px),(max-aspect-ratio:1/1){
${R}{inset:auto 0 0 0;width:auto;height:62%;}
${S}{left:50%;top:0;bottom:auto;width:70%;height:36%;background-position:50% 0;}
}
${O}[data-igs-log-reader] #igs-combat-panel{inset:auto 0 0 0;width:auto;height:62%;}
${O}[data-igs-log-reader] #igs-sprite{left:50%;top:0;bottom:auto;width:70%;height:36%;background-position:50% 0;}
`;
