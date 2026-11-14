import { esc } from './reader-value-utils.js';
import { cardArtSvg } from './combat-card-art.js';

export function powerBadgesHtml(unit, { compact = false } = {}) {
    const powers = unit.powers || [];
    if (!powers.length) return '';
    const label = power => `${power.name}${power.count > 1 ? ` ×${power.count}` : ''}：${power.text}`;
    if (compact) {
        const text = powers.map(label).join('；');
        const count = powers.reduce((total, power) => total + power.count, 0);
        return `<span class="igs-combat-powers is-compact"><span class="igs-combat-power" data-scale-tip="${esc(text)}" role="button" tabindex="0" aria-label="${esc(text)}">${cardArtSvg({ type: 'power' })}<b>${count}</b></span></span>`;
    }
    return `<span class="igs-combat-powers">${powers.map(power => `<span class="igs-combat-power" data-power="${esc(power.id)}" data-scale-tip="${esc(label(power))}" role="button" tabindex="0" aria-label="${esc(label(power))}">${cardArtSvg({ type: 'power', name: power.name })}<span class="igs-combat-power-name">${esc(power.name)}</span>${power.count > 1 ? `<b>×${power.count}</b>` : ''}</span>`).join('')}</span>`;
}

export const COMBAT_POWER_STYLE_TEXT = `
#igs-combat-panel .igs-combat-powers{display:flex;flex-wrap:wrap;align-items:center;gap:3px;max-width:100%;pointer-events:auto;}
#igs-combat-panel .igs-combat-power{display:inline-flex;align-items:center;gap:3px;min-width:0;max-width:100%;padding:2px 5px;border:0;border-radius:var(--igs-cb-r-s,3px);background:var(--igs-cb-veil);color:var(--igs-cb-power);font:500 11px/1.25 var(--igs-cb-font, sans-serif);cursor:help;}
#igs-combat-panel .igs-combat-power>svg{width:14px;height:14px;flex:none;}
#igs-combat-panel .igs-combat-power-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#igs-combat-panel .igs-combat-power>b{flex:none;font-variant-numeric:tabular-nums;}
#igs-combat-panel .igs-combat-powers.is-compact{display:inline-flex;vertical-align:middle;}
#igs-combat-panel .igs-cx-canvas .igs-combat-power{background:var(--paper,var(--plate,var(--igs-cb-veil)));color:var(--text,var(--igs-cb-ink));border-radius:2px;}
#igs-combat-panel .igs-cx-canvas .igs-combat-power>svg{color:var(--acc,var(--gold-hi,currentColor));}
#igs-combat-panel .igs-cx-canvas .chips:has(.igs-combat-powers){flex-wrap:wrap;}
#igs-combat-panel .igs-cx-canvas .mate>.igs-combat-powers{position:absolute;right:0;top:0;}
`;
