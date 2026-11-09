export const STATS_HERO_CARD_STYLE_TEXT = `
#igs-unified-settings .igs-stats-content{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr);gap:14px;min-width:0}
#igs-unified-settings .igs-stats-hero-section{gap:10px}
#igs-unified-settings .igs-stats-dash{display:grid;gap:10px;min-width:0}
#igs-unified-settings .igs-stats-day{font-size:11px;color:var(--igs-settings-ink-3);font-variant-numeric:tabular-nums}
#igs-unified-settings .igs-stats-overview{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,1.2fr);gap:12px;align-items:stretch}
#igs-unified-settings .igs-stats-radar-panel,#igs-unified-settings .igs-stats-resources{padding:14px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-field);min-width:0}
#igs-unified-settings .igs-stats-dash h4{margin:0;font:inherit;font-size:12px;font-weight:600;letter-spacing:.06em;color:var(--igs-settings-ink-2)}
#igs-unified-settings .igs-stats-radar{display:block;width:100%;max-width:280px;height:auto;margin:0 auto;overflow:visible}
#igs-unified-settings .igs-stats-radar-ring{fill:none;stroke:var(--igs-settings-ink-3);stroke-opacity:.22;stroke-width:1}
#igs-unified-settings .igs-stats-radar-axis{fill:none;stroke:var(--igs-settings-ink-3);stroke-opacity:.16;stroke-width:1}
#igs-unified-settings .igs-stats-radar-fill{fill:var(--igs-settings-accent);fill-opacity:.22;stroke:var(--igs-settings-accent);stroke-width:2;stroke-linejoin:round}
#igs-unified-settings .igs-stats-radar-dot{fill:var(--igs-settings-accent)}
#igs-unified-settings .igs-stats-radar-name{fill:var(--igs-settings-ink-2);font-size:12px}
#igs-unified-settings .igs-stats-radar-value{fill:var(--igs-settings-ink);font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
#igs-unified-settings .igs-stats-condition{display:flex;flex-direction:column;gap:12px;min-width:0}
#igs-unified-settings .igs-stats-resources{display:grid;gap:16px;flex:1}
#igs-unified-settings .igs-stats-meter-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:7px;font-size:12px;color:var(--igs-settings-ink-2)}
#igs-unified-settings .igs-stats-meter-head b{color:var(--igs-settings-ink);font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
#igs-unified-settings .igs-stats-meter-head small{font-size:11px;font-weight:400;color:var(--igs-settings-ink-3)}
#igs-unified-settings .igs-stats-meter-track{height:8px;border-radius:6px;overflow:hidden;background:color-mix(in srgb,var(--igs-settings-ink) 8%,var(--igs-settings-field))}
#igs-unified-settings .igs-stats-meter-track>i{display:block;height:100%;border-radius:inherit}
#igs-unified-settings .igs-stats-meter.is-life i{background:var(--igs-settings-danger)}
#igs-unified-settings .igs-stats-meter.is-stamina i{background:var(--igs-settings-stamina)}
#igs-unified-settings .igs-stats-meter.is-stress i{background:var(--igs-settings-stress)}
#igs-unified-settings .igs-stats-wallets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#igs-unified-settings .igs-stats-wallet{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-field);min-width:0}
#igs-unified-settings .igs-stats-wallet>svg{width:24px;height:24px;flex:none;fill:none;stroke:var(--igs-settings-accent);stroke-width:1.5;stroke-linejoin:round}
#igs-unified-settings .igs-stats-wallet>div{display:grid;gap:4px;min-width:0}
#igs-unified-settings .igs-stats-wallet span{font-size:11px;color:var(--igs-settings-ink-2);overflow-wrap:anywhere}
#igs-unified-settings .igs-stats-wallet strong{font-size:22px;font-weight:600;line-height:1.2;color:var(--igs-settings-ink);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
#igs-unified-settings .igs-stats-wallet>.igs-settings-action{flex-basis:100%;font-size:11px;min-height:30px;height:auto;padding:6px}
#igs-unified-settings .igs-stats-skills{margin-top:10px;padding:10px 12px;border:0;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-field)}
#igs-unified-settings .igs-stats-skills>summary{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--igs-settings-ink);cursor:pointer;list-style:none}
#igs-unified-settings .igs-stats-skills>summary::after{content:'＋';width:auto;height:auto;border:0;margin-left:auto;color:var(--igs-settings-ink-3);transform:none;transition:none}
#igs-unified-settings .igs-stats-skills[open]>summary::after{content:'−'}
#igs-unified-settings .igs-stats-skills>:not(summary){margin-left:0;margin-right:0}
#igs-unified-settings .igs-stats-skills>summary>span{font-size:11px;color:var(--igs-settings-ink-3)}
#igs-unified-settings .igs-stats-skills > summary::-webkit-details-marker{display:none}
#igs-unified-settings .igs-stats-skills[open] > summary{margin-bottom:12px}
#igs-unified-settings .igs-stats-skill-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
#igs-unified-settings .igs-stats-skill{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--igs-settings-surface);border-radius:var(--igs-settings-radius-small);font-size:12px;color:var(--igs-settings-ink-2);min-width:0}
#igs-unified-settings .igs-stats-skill > span{overflow-wrap:anywhere}
#igs-unified-settings .igs-stats-skill b{color:var(--igs-settings-ink);font-variant-numeric:tabular-nums}
#igs-unified-settings .igs-stats-skill i{font-style:normal;color:var(--igs-settings-stamina);margin-left:4px}
#igs-unified-settings [data-advanced="stats-hero-edit"] > .igs-settings-section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
#igs-unified-settings [data-advanced="stats-hero-edit"] .igs-settings-sub{border:0;margin:12px 0 0;padding:0}
#igs-unified-settings [data-advanced="stats-hero-edit"] input{width:100%;box-sizing:border-box}
#igs-unified-settings .igs-stats-empty{font-size:12px;color:var(--igs-settings-ink-3)}
#igs-unified-settings .igs-stats-hero-section > div > .igs-settings-row{margin-top:10px}
@media(max-width:640px){
#igs-unified-settings .igs-stats-overview{grid-template-columns:minmax(0,1fr)}
#igs-unified-settings .igs-stats-condition{grid-row:1}
#igs-unified-settings .igs-stats-radar{max-width:260px}
#igs-unified-settings .igs-stats-resources{gap:12px}
#igs-unified-settings .igs-stats-skill-list{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`.trim();