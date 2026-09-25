export const MAP_PANEL_STYLE_TEXT = `
#igs-status-hud .igs-hud-toggle{z-index:0;}
#igs-status-hud .igs-hud-identity{position:relative;z-index:1;pointer-events:none;}
#igs-status-hud .igs-hud-avatar-frame{position:relative;width:calc(46px * var(--igs-hud-scale,1));height:calc(46px * var(--igs-hud-scale,1));}
#igs-status-hud .igs-hud-entry-anchor{position:relative;max-width:100%;min-width:0;pointer-events:none;}
#igs-status-hud.igs-hud-no-metrics .igs-hud-entry-anchor{display:flex;flex-direction:column;align-items:center;}
#igs-status-hud.igs-hud-character-emotion-only .igs-hud-entry-arrow{top:calc(50% + .5px);}
#igs-status-hud.igs-hud-character-emotion-with-metrics .igs-hud-metrics{align-self:flex-start;height:calc(46px * var(--igs-hud-scale,1));}
#igs-status-hud.igs-hud-size-large .igs-hud-location ~ .igs-hud-entry-arrow{top:calc(50% + 1px);}
#igs-status-hud .igs-hud-entry-arrow{position:absolute;left:calc(100% - 7px);top:calc(50% + 2.5px);transform:translateY(-50%);display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;background:transparent;color:rgba(232,230,226,.7);cursor:pointer;pointer-events:auto;}
#igs-status-hud .igs-hud-entry-arrow svg{width:13px;height:13px;transition:transform .15s ease;}
#igs-status-hud .igs-hud-entry-arrow[aria-expanded="true"] svg{transform:rotate(-90deg);}
#igs-status-hud .igs-hud-location-icon{display:flex;flex:0 0 auto;width:calc(16px * var(--igs-hud-scale,1));height:calc(16px * var(--igs-hud-scale,1));color:rgba(255,255,255,.48);pointer-events:none;}
#igs-status-hud .igs-hud-location-icon svg{display:block;width:100%;height:100%;}
#igs-status-hud .igs-hud-entry-menu{position:absolute;left:calc(100% + 21px);top:calc(50% + 1.5px);transform:translateY(-50%);z-index:3;display:flex;flex-direction:row;align-items:center;gap:4px;padding-left:0;pointer-events:none;}
#igs-status-hud .igs-hud-entry-menu[hidden]{display:none;}
#igs-status-hud .igs-hud-entry-item{display:flex;align-items:center;gap:3px;min-width:0;padding:3px 4px;border:0;background:transparent;color:rgba(232,230,226,.58);font-size:13px;white-space:nowrap;cursor:pointer;pointer-events:auto;}
#igs-status-hud .igs-hud-entry-item:hover{color:#fff;}
#igs-status-hud .igs-hud-entry-item svg{width:12.4px;height:12.4px;flex:none;}
#igs-status-hud .igs-hud-entry-arrow:focus-visible,#igs-status-hud .igs-hud-entry-item:focus-visible{outline:2px solid #f4e3ad;outline-offset:1px;}
#igs-status-hud.igs-hud-suppressed .igs-hud-toggle,#igs-status-hud.igs-hud-suppressed .igs-hud-entry-anchor{pointer-events:none;visibility:hidden;}
@media (pointer:coarse){#igs-status-hud .igs-hud-entry-arrow{width:44px;height:44px;}#igs-status-hud .igs-hud-entry-menu{padding-left:0;}}
#igs-map-panel{position:absolute;inset:0;z-index:11;display:block;padding:0;box-sizing:border-box;pointer-events:auto;background:transparent;color:var(--igs-rp-text,#d8d5cf);}
#igs-map-panel .igs-map-window{position:relative;width:100%;height:100%;max-height:none;min-height:0;overflow:hidden;box-sizing:border-box;background:transparent;border:0;border-radius:0;box-shadow:none;}
#igs-map-panel button{color:inherit;cursor:pointer;font-family:inherit;}
#igs-map-panel .igs-map-main > button[data-map-act="back"],#igs-map-panel .igs-map-main > button[data-map-act="refresh"]{align-self:flex-start;border:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.12));background:rgba(255,255,255,.06);border-radius:var(--igs-rp-radius,8px);padding:6px 12px;min-height:36px;font-size:13px;}
#igs-map-panel .igs-rp-body.igs-map-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,27%);gap:0;padding:0;box-sizing:border-box;}
#igs-map-panel .igs-rp-body.igs-map-body{position:relative;height:100%;}
#igs-map-panel .igs-map-main{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;gap:0;overflow:hidden;}
#igs-map-panel .igs-map-detail{position:relative;min-width:0;min-height:0;overflow:auto;padding:28px clamp(20px,3vw,42px) 32px;border-left:0;background:#080a0c;box-sizing:border-box;}
#igs-map-panel:not(.igs-rp-narrow) .igs-map-detail{background:linear-gradient(90deg,rgba(8,10,12,0) 0%,rgba(8,10,12,.06) 18%,rgba(8,10,12,.18) 38%,rgba(8,10,12,.42) 58%,rgba(8,10,12,.68) 75%,rgba(8,10,12,.86) 88%,rgba(8,10,12,1) 95%,rgba(8,10,12,1) 100%);}
#igs-map-panel .igs-map-detail-art{display:none;}
#igs-map-panel:not(.igs-rp-narrow) .igs-map-detail::after{display:none;}
#igs-map-panel:not(.igs-rp-narrow) .igs-map-detail>*:not(.igs-map-detail-art){position:relative;z-index:1;}
#igs-map-panel:not(.igs-rp-narrow) .igs-map-window::before{display:none;}
#igs-map-panel .igs-rp-head{position:absolute!important;top:0;left:0;right:0;z-index:4;background:linear-gradient(180deg,rgba(8,10,12,.86) 0%,rgba(8,10,12,.52) 42%,rgba(8,10,12,0) 100%);}
#igs-map-panel:not(.igs-rp-narrow) .igs-rp-body.igs-map-body{display:block;position:relative;overflow:hidden;}
#igs-map-panel:not(.igs-rp-narrow) .igs-map-main{position:absolute;inset:0;z-index:1;}
#igs-map-panel:not(.igs-rp-narrow) .igs-map-detail{position:absolute;top:0;right:0;bottom:0;width:clamp(360px,34%,560px);z-index:2;}
#igs-map-panel:not(.igs-rp-narrow) .igs-map-controls{right:calc(clamp(360px,34%,560px) + 18px);}
#igs-map-panel .igs-map-tabs,#igs-map-panel .igs-map-list{display:flex;flex-wrap:wrap;gap:8px;}
#igs-map-panel .igs-map-tabs{padding:8px 16px;flex:none;position:relative;z-index:2;}
#igs-map-panel .igs-map-tabs button{border:1px solid var(--igs-rp-line,rgba(216,213,207,.22));background:var(--igs-rp-panel,rgba(31,34,37,.62));border-radius:var(--igs-rp-radius,8px);padding:6px 12px;min-height:36px;font-size:13px;}
#igs-map-panel .igs-map-scroll{overflow-y:auto;padding:12px clamp(16px,4vw,56px) 24px;min-height:0;overscroll-behavior:contain;box-sizing:border-box;}
#igs-map-panel .igs-map-scroll button,#igs-map-panel .igs-map-list button{border:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.12));background:rgba(255,255,255,.06);border-radius:var(--igs-rp-radius,8px);padding:6px 10px;min-height:36px;}
#igs-map-panel button:focus-visible{outline:1px solid var(--igs-rp-accent,#d8d5cf);outline-offset:2px;}
#igs-map-panel .igs-map-viewport{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;border:0;border-radius:0;background:#080a0c;box-shadow:none;touch-action:none;}
#igs-map-panel:not(.igs-rp-narrow) .igs-map-viewport::after{content:"";position:absolute;inset:auto 0 0;height:38%;z-index:1;pointer-events:none;background:linear-gradient(180deg,transparent 0%,rgba(7,9,11,.16) 35%,rgba(7,9,11,.62) 76%,#080a0c 100%);}
#igs-map-panel .igs-map-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;}
#igs-map-panel .igs-map-basemap{position:absolute;left:0;top:0;display:block;user-select:none;pointer-events:none;}
#igs-map-panel .igs-map-controls{position:absolute;right:18px;bottom:22px;top:auto;z-index:3;display:flex;flex-direction:column;gap:4px;}
#igs-map-panel .igs-map-controls button{display:grid;place-items:center;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:1px solid rgba(216,213,207,.28);border-radius:10px;background:rgba(17,19,22,.62);color:var(--igs-rp-text,#d8d5cf);}
#igs-map-panel .igs-map-controls button:last-child{margin-top:6px;border-radius:50%;}
#igs-map-panel .igs-map-controls svg{width:20px;height:20px;}
#igs-map-panel .igs-map-hint{position:absolute;left:18px;bottom:18px;z-index:3;margin:0;padding:0;color:rgba(216,213,207,.72);font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,.9);pointer-events:none;}
#igs-map-panel .igs-map-marker{position:absolute;display:flex;align-items:center;flex-direction:column;transform:translate(-50%,-100%);transform-origin:50% 100%;max-width:120px;text-align:center;font-size:11px;text-shadow:0 1px 3px #000;z-index:2;}
#igs-map-panel .igs-map-marker button{display:grid;place-items:center;width:44px;height:44px;min-width:44px;min-height:44px;padding:4px;border:0;background:transparent;color:var(--igs-rp-text,#d8d5cf);}
#igs-map-panel .igs-map-marker svg{width:22px;height:22px;color:#eee7c7;fill:#eee7c7;stroke:#fff7d8;stroke-width:1.4;filter:drop-shadow(0 1px 2px rgba(0,0,0,.72));}
@media (min-width:768px){#igs-map-panel .igs-map-marker svg{width:33px;height:33px;}}
#igs-map-panel .igs-map-marker svg *{fill:#eee7c7 !important;stroke:#fff7d8 !important;}
#igs-map-panel .igs-map-marker .igs-map-label{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 6px;border-radius:999px;background:rgba(12,14,16,.64);}
#igs-map-panel .igs-map-marker.igs-map-current button{color:#fff;}
#igs-map-panel .igs-map-marker.igs-map-current button svg{display:none;}
#igs-map-panel .igs-map-marker.igs-map-current button::before{content:"";width:12px;height:12px;border:2px solid #fff7d8;border-radius:50%;background:#eee7c7;box-shadow:0 0 0 4px rgba(238,231,199,.24);}
#igs-map-panel .igs-map-marker.igs-map-current .igs-map-label{background:rgba(12,14,16,.72);color:#fff;}
#igs-map-panel .igs-map-marker.igs-map-selected button{border:1px solid rgba(232,240,255,.86);border-radius:50%;color:#e8f0ff;}
#igs-map-panel .igs-map-marker.igs-map-selected .igs-map-label{background:rgba(238,244,255,.92);color:#1a1d20;text-shadow:none;}
#igs-map-panel .igs-map-marker [aria-current="location"]{color:var(--igs-rp-accent,#d8d5cf);}
#igs-map-panel .igs-map-list{position:absolute;left:18px;bottom:72px;z-index:4;}
#igs-map-panel .igs-map-feedback:empty{display:none;}
#igs-map-panel .igs-map-card{margin:0;padding:0;border:0;border-radius:0;background:transparent;box-sizing:border-box;}
#igs-map-panel .igs-map-card-kicker{display:flex;align-items:center;gap:10px;margin:0 0 18px;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));font-size:12px;letter-spacing:.12em;}
#igs-map-panel .igs-map-card-kicker::after{content:"";display:block;width:30px;height:1px;background:var(--igs-rp-line,rgba(216,213,207,.22));}
#igs-map-panel .igs-map-card h3{margin:0 0 18px;font-size:28px;line-height:1.2;letter-spacing:.06em;font-weight:400;}
#igs-map-panel .igs-map-card-description{margin:0 0 20px;overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.8;}
#igs-map-panel .igs-map-card-people{padding-top:18px;border-top:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.16));}
#igs-map-panel .igs-map-card-people>p{margin:0 0 10px;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));font-size:12px;}
#igs-map-panel .igs-map-card-people>div{display:flex;flex-wrap:wrap;gap:10px 14px;}
#igs-map-panel .igs-map-card-person{display:inline-flex;align-items:center;gap:6px;font-size:13px;}
#igs-map-panel .igs-map-card-person-avatar{display:inline-grid;place-items:center;width:28px;height:28px;border:1px solid var(--igs-rp-line,rgba(216,213,207,.42));border-radius:50%;font-size:13px;}
#igs-map-panel .igs-map-card button{margin:22px 0 0;width:100%;border:0;background:transparent;border-radius:0;padding:10px 0;min-height:44px;}
#igs-map-panel .igs-map-card .igs-map-card-secondary{margin-top:16px;background:transparent;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));}
#igs-map-panel .igs-map-card-note{display:block;margin-top:8px;color:var(--igs-rp-text-faint,rgba(216,213,207,.52));font-size:11px;text-align:center;}
#igs-map-panel .igs-map-detail-empty{margin:0;padding:0;border:0;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));}
#igs-map-panel .igs-map-card p{overflow-wrap:anywhere;white-space:pre-wrap;}
#igs-map-panel .igs-map-card button{margin-right:8px;}
#igs-map-panel details{font-size:12px;margin-top:12px;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));}
#igs-map-panel .igs-map-feedback{min-height:1.3em;font-size:12px;}
#igs-map-panel .igs-map-main > button[data-map-act="refresh"]{display:none!important;}
#igs-map-panel.igs-rp-narrow .igs-rp-body.igs-map-body{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto;gap:0;padding:0;overflow:hidden;align-content:stretch;}
#igs-map-panel.igs-rp-narrow .igs-map-main{min-height:0;}
#igs-map-panel.igs-rp-narrow .igs-map-detail{max-height:34%;padding:18px 12px 14px;border-left:0;border-top:0;background:#080a0c;}
#igs-map-panel.igs-rp-narrow .igs-map-detail::before{content:"";position:absolute;left:0;right:0;top:-72px;height:72px;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,12,0) 0%,rgba(8,10,12,.16) 36%,rgba(8,10,12,.78) 100%);}
#igs-map-panel.igs-rp-narrow .igs-rp-body.igs-map-body{display:block;position:relative;overflow:hidden;}
#igs-map-panel.igs-rp-narrow .igs-map-main{position:absolute;inset:0;z-index:1;}
#igs-map-panel.igs-rp-narrow .igs-map-detail{position:absolute;left:0;right:0;bottom:0;height:34%;max-height:none;z-index:2;display:flex;flex-direction:column;justify-content:flex-end;overflow:auto;box-sizing:border-box;background:linear-gradient(180deg,rgba(8,10,12,0) 0%,rgba(8,10,12,.12) 22%,rgba(8,10,12,.52) 58%,rgba(8,10,12,.9) 82%,#080a0c 100%);}
#igs-map-panel.igs-rp-narrow .igs-map-detail::before{display:none;}
#igs-map-panel.igs-rp-narrow .igs-map-controls button{border:0;background:transparent;}
#igs-map-panel.igs-rp-narrow .igs-map-detail-art{display:none;}
#igs-map-panel.igs-rp-narrow .igs-map-detail{overflow:visible;}
#igs-map-panel.igs-rp-narrow .igs-map-card{margin-bottom:0;}
#igs-map-panel.igs-rp-narrow .igs-map-viewport{flex:1 1 auto;aspect-ratio:auto;min-height:0;}
#igs-map-panel.igs-rp-narrow .igs-map-controls{right:10px;bottom:44px;top:auto;gap:4px;}
#igs-map-panel.igs-rp-narrow .igs-map-hint{left:12px;bottom:14px;}
#igs-map-panel.igs-rp-narrow .igs-map-list{left:12px;bottom:68px;}
#igs-map-panel.igs-rp-narrow .igs-map-card-kicker{margin-bottom:10px;}
#igs-map-panel.igs-rp-narrow .igs-map-card h3{font-size:24px;margin-bottom:10px;}
#igs-map-panel.igs-rp-narrow .igs-map-card-people{padding-top:12px;}
#igs-map-panel.igs-rp-narrow .igs-map-card button{margin-top:14px;}
#igs-map-panel.igs-rp-short .igs-rp-body.igs-map-body{gap:10px;padding-bottom:12px;}
#igs-map-panel.igs-rp-short .igs-map-card{padding:10px;}
#igs-map-panel.igs-rp-short .igs-map-card h3{font-size:16px;}
`;
