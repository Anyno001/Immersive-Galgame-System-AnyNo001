const O = '#igs-overlay[data-igs-duel]';
const R = `${O} #igs-combat-panel`;

export const INTIMATE_DUEL_STYLE_TEXT = `
${R}{background:var(--igs-cb-duel-ground,#121212);}
${R} .igs-duel-result{justify-content:center;gap:18px;padding:0 0 6px;}
${R} .igs-duel-result .igs-combat-actions{margin:0;flex:0 0 auto;}
`;
