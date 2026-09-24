export const MAP_PANEL_STYLE_TEXT = `
#igs-status-hud .igs-hud-toggle{z-index:0;}
#igs-status-hud .igs-hud-identity{position:relative;z-index:1;pointer-events:none;}
#igs-status-hud .igs-hud-avatar-frame{position:relative;width:calc(46px * var(--igs-hud-scale,1));height:calc(46px * var(--igs-hud-scale,1));}
#igs-status-hud .igs-hud-entry-anchor{position:relative;max-width:100%;min-width:0;pointer-events:none;}
#igs-status-hud.igs-hud-no-metrics .igs-hud-entry-anchor{display:flex;flex-direction:column;align-items:center;}
#igs-status-hud.igs-hud-character-emotion-only .igs-hud-entry-arrow{top:calc(50% + .5px);}
#igs-status-hud.igs-hud-character-emotion-with-metrics .igs-hud-metrics{align-self:flex-start;height:calc(46px * var(--igs-hud-scale,1));}
#igs-status-hud .igs-hud-entry-arrow{position:absolute;left:calc(100% - 7px);top:calc(50% + 2.5px);transform:translateY(-50%);display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;background:transparent;color:rgba(232,230,226,.7);cursor:pointer;pointer-events:auto;}
#igs-status-hud .igs-hud-entry-arrow svg{width:13px;height:13px;transition:transform .15s ease;}
#igs-status-hud .igs-hud-entry-arrow[aria-expanded="true"] svg{transform:rotate(-90deg);}
#igs-status-hud .igs-hud-location-icon{display:flex;flex:0 0 auto;width:calc(16px * var(--igs-hud-scale,1));height:calc(16px * var(--igs-hud-scale,1));color:rgba(255,255,255,.48);pointer-events:none;}
#igs-status-hud .igs-hud-location-icon svg{display:block;width:100%;height:100%;}
#igs-status-hud .igs-hud-entry-menu{position:absolute;left:calc(100% + 18px);top:calc(50% + 2.5px);transform:translateY(-50%);z-index:3;display:flex;flex-direction:row;align-items:center;gap:4px;padding-left:0;pointer-events:none;}
#igs-status-hud .igs-hud-entry-menu[hidden]{display:none;}
#igs-status-hud .igs-hud-entry-item{display:flex;align-items:center;gap:3px;min-width:0;padding:3px 4px;border:0;background:transparent;color:rgba(232,230,226,.58);font-size:11px;white-space:nowrap;cursor:pointer;pointer-events:auto;}
#igs-status-hud .igs-hud-entry-item:hover{color:#fff;}
#igs-status-hud .igs-hud-entry-item svg{width:10.4px;height:10.4px;flex:none;}
#igs-status-hud .igs-hud-entry-arrow:focus-visible,#igs-status-hud .igs-hud-entry-item:focus-visible{outline:2px solid #f4e3ad;outline-offset:1px;}
#igs-status-hud.igs-hud-suppressed .igs-hud-toggle,#igs-status-hud.igs-hud-suppressed .igs-hud-entry-anchor{pointer-events:none;visibility:hidden;}
@media (pointer:coarse){#igs-status-hud .igs-hud-entry-arrow{width:44px;height:44px;}#igs-status-hud .igs-hud-entry-menu{padding-left:0;}}
#igs-map-panel{position:absolute;inset:0;z-index:11;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;pointer-events:auto;background:rgba(0,0,0,.4);}
#igs-map-panel .igs-map-window{width:min(580px,100%);max-height:min(82dvh,calc(100% - 16px));min-height:0;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;background:var(--igs-db-bg,rgba(31,34,37,.62));border:1px solid var(--igs-db-border,rgba(255,255,255,.16));border-radius:var(--igs-db-radius,8px);color:#e8e6e2;-webkit-backdrop-filter:var(--igs-db-blur,none);backdrop-filter:var(--igs-db-blur,none);box-shadow:0 12px 35px rgba(0,0,0,.35);}
#igs-map-panel header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.14);}
#igs-map-panel h2,#igs-map-panel h3{font-size:16px;margin:0;}
#igs-map-panel button{color:inherit;cursor:pointer;}
#igs-map-panel header button{font-size:24px;border:0;background:transparent;min-width:32px;min-height:32px;}
#igs-map-panel .igs-map-tabs,#igs-map-panel .igs-map-list{display:flex;flex-wrap:wrap;gap:8px;}
#igs-map-panel .igs-map-tabs{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.1);}
#igs-map-panel .igs-map-scroll{overflow-y:auto;padding:12px 16px 20px;min-height:0;overscroll-behavior:contain;}
#igs-map-panel .igs-map-scroll button,#igs-map-panel .igs-map-tabs button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);border-radius:7px;padding:6px 9px;}
#igs-map-panel button:focus-visible{outline:2px solid #f4e3ad;outline-offset:2px;}
#igs-map-panel .igs-map-level{opacity:.72;font-size:12px;}
#igs-map-panel .igs-map-plane{position:relative;margin:14px 14px 20px;aspect-ratio:1.8;min-height:130px;border:1px solid rgba(255,255,255,.23);border-radius:8px;background:rgba(255,255,255,.045);}
#igs-map-panel .igs-map-marker{position:absolute;display:flex;align-items:center;flex-direction:column;transform:translate(-50%,-75%);max-width:100px;text-align:center;font-size:11px;text-shadow:0 1px 3px #000;}
#igs-map-panel .igs-map-marker button{display:grid;place-items:center;width:32px;height:32px;padding:4px;border:0;background:transparent;color:#f4e3ad;}
#igs-map-panel .igs-map-marker svg{width:22px;height:22px;}
#igs-map-panel .igs-map-marker span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#igs-map-panel .igs-map-card{margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(255,255,255,.06);}
#igs-map-panel .igs-map-card p{overflow-wrap:anywhere;white-space:pre-wrap;}
#igs-map-panel .igs-map-card button{margin-right:8px;}
#igs-map-panel details{font-size:12px;opacity:.84;margin-top:12px;}
#igs-map-panel .igs-map-feedback{min-height:1.3em;font-size:12px;}
@media(max-width:420px){#igs-map-panel{padding:8px;}#igs-map-panel .igs-map-window{max-height:calc(100% - 12px);}#igs-map-panel .igs-map-plane{aspect-ratio:1.2;}}
`;