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
#igs-status-hud .igs-hud-entry-item svg path,#igs-status-hud .igs-hud-entry-item svg rect,#igs-status-hud .igs-hud-entry-item svg circle,#igs-status-hud .igs-hud-location-icon svg path,#igs-status-hud .igs-hud-location-icon svg circle{stroke-width:1.8;}
#igs-map-panel{position:absolute;inset:0;z-index:11;display:block;padding:0;box-sizing:border-box;pointer-events:auto;background:#0b0d10;color:var(--igs-rp-text,#ece8e1);}
#igs-map-panel .igs-map-window{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;box-sizing:border-box;background:transparent;border:0;border-radius:0;box-shadow:none;}
#igs-map-panel button{color:inherit;cursor:pointer;font-family:inherit;}
#igs-map-panel .igs-rp-head{position:absolute!important;top:0;left:0;right:0;z-index:5;background:linear-gradient(180deg,rgba(8,10,13,.7) 0%,rgba(8,10,13,.32) 55%,rgba(8,10,13,0) 100%);pointer-events:none;}
#igs-map-panel .igs-rp-head>*{pointer-events:auto;}
#igs-map-panel .igs-rp-body.igs-map-body{position:relative;display:block;height:100%;overflow:hidden;}
#igs-map-panel .igs-map-main{position:absolute;inset:0;z-index:1;}
#igs-map-panel .igs-map-tabs{position:absolute;top:58px;left:50%;z-index:5;display:flex;gap:2px;max-width:calc(100% - 32px);overflow-x:auto;padding:3px;transform:translateX(-50%);border-radius:999px;background:rgba(14,16,20,.52);}
#igs-map-panel .igs-map-overlay-top{position:absolute;top:70px;left:20px;z-index:4;display:flex;flex-direction:column;align-items:flex-start;gap:8px;max-width:min(420px,calc(100% - 40px));pointer-events:none;}
#igs-map-panel .igs-map-overlay-top>*{pointer-events:auto;}
#igs-map-panel .igs-map-overlay-top .igs-rp-notice{margin:0;background:rgba(14,16,20,.6);}
#igs-map-panel .igs-map-back{background:rgba(14,16,20,.58);color:var(--igs-rp-text);}
#igs-map-panel .igs-map-back:hover{background:rgba(30,33,38,.72);}
#igs-map-panel .igs-map-viewport{position:absolute;inset:0;overflow:hidden;background:#0b0d10;touch-action:none;cursor:grab;}
#igs-map-panel .igs-map-viewport:active{cursor:grabbing;}
#igs-map-panel .igs-map-viewport::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 80% 75% at 45% 50%,transparent 58%,rgba(6,8,11,var(--igs-map-vignette,.34)) 100%);}
#igs-map-panel .igs-map-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;isolation:isolate;}
#igs-map-panel .igs-map-world::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:rgba(10,12,16,var(--igs-map-tint,.06));}
#igs-map-panel[data-map-time="day"]{--igs-map-tint:.24;--igs-map-vignette:.42;}
#igs-map-panel[data-map-time="dawn"]{--igs-map-tint:.16;--igs-map-vignette:.4;}
#igs-map-panel[data-map-time="dusk"]{--igs-map-tint:.12;--igs-map-vignette:.38;}
#igs-map-panel[data-map-time="night"]{--igs-map-tint:.04;--igs-map-vignette:.34;}
#igs-map-panel[data-map-time="minight"]{--igs-map-tint:0;--igs-map-vignette:.3;}
#igs-map-panel .igs-map-basemap{position:absolute;left:0;top:0;z-index:0;display:block;user-select:none;pointer-events:none;}
#igs-map-panel .igs-map-marker{position:absolute;z-index:2;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);transform-origin:50% 100%;max-width:160px;text-align:center;font-size:12px;}
#igs-map-panel .igs-map-marker button{position:relative;display:grid;place-items:center;width:44px;height:44px;min-width:44px;min-height:44px;padding:4px;border:0;background:transparent;color:#f6f0df;transition:transform .2s;}
#igs-map-panel .igs-map-marker button:hover{transform:translateY(-2px);}
#igs-map-panel .igs-map-marker svg{width:30px;height:30px;overflow:visible;filter:drop-shadow(0 3px 5px rgba(0,0,0,.55));}
#igs-map-panel .igs-map-marker svg path{fill:rgba(246,240,223,.94);stroke:rgba(18,20,24,.45);stroke-width:1;}
#igs-map-panel .igs-map-marker svg circle{fill:rgba(22,24,29,.78);stroke:none;}
#igs-map-panel .igs-map-label{display:inline-flex;align-items:center;gap:7px;max-width:100%;margin-top:-5px;padding:3px 11px;border-radius:999px;background:rgba(14,16,20,.64);color:#f4efe6;font-size:12px;line-height:1.35;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:none;box-shadow:0 4px 14px rgba(0,0,0,.28);}
#igs-map-panel .igs-map-people{display:inline-flex;flex:none;}
#igs-map-panel .igs-map-people i{display:grid;place-items:center;width:18px;height:18px;margin-left:-5px;border-radius:50%;background:rgba(242,212,155,.92);color:#1b1d21;font-size:10px;font-style:normal;line-height:1;box-shadow:0 0 0 1.5px rgba(14,16,20,.85);}
#igs-map-panel .igs-map-people i:first-child{margin-left:0;}
#igs-map-panel .igs-map-marker.igs-map-auto svg path{fill:rgba(246,240,223,.58);}
#igs-map-panel .igs-map-marker.igs-map-auto .igs-map-label{background:rgba(14,16,20,.5);color:rgba(244,239,230,.86);}
#igs-map-panel .igs-map-marker.igs-map-selected button{transform:scale(1.14);}
#igs-map-panel .igs-map-marker.igs-map-selected svg path{fill:#fff;}
#igs-map-panel .igs-map-marker.igs-map-selected .igs-map-label{background:rgba(246,240,223,.95);color:#15171b;}
#igs-map-panel .igs-map-marker.igs-map-current button svg{display:none;}
#igs-map-panel .igs-map-marker.igs-map-current button::before{content:"";position:relative;z-index:1;width:14px;height:14px;border-radius:50%;background:var(--igs-rp-warm,#f2d49b);box-shadow:0 0 0 3px rgba(20,22,26,.6),0 0 16px rgba(242,212,155,.7);}
#igs-map-panel .igs-map-marker.igs-map-current button::after{content:"";position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:rgba(242,212,155,.5);animation:igs-map-pulse 2.4s ease-out infinite;}
@keyframes igs-map-pulse{from{transform:scale(1);opacity:.7;}to{transform:scale(3.4);opacity:0;}}
#igs-map-panel .igs-map-here{margin-bottom:-8px;padding:2px 9px;border-radius:999px;background:rgba(242,212,155,.94);color:#1b1d21;font-size:11px;line-height:1.45;letter-spacing:.14em;white-space:nowrap;text-shadow:none;box-shadow:0 4px 12px rgba(0,0,0,.3);}
#igs-map-panel .igs-map-controls{position:absolute;right:calc(clamp(300px,30%,420px) + 40px);bottom:22px;z-index:3;display:flex;flex-direction:column;gap:8px;}
#igs-map-panel .igs-map-controls button{display:grid;place-items:center;width:42px;height:42px;min-width:42px;min-height:42px;padding:0;border:0;border-radius:50%;background:rgba(16,18,22,.58);color:var(--igs-rp-text);box-shadow:0 6px 18px rgba(0,0,0,.3);transition:background .2s;}
#igs-map-panel .igs-map-controls button:hover{background:rgba(34,37,43,.74);}
#igs-map-panel .igs-map-controls svg{width:19px;height:19px;stroke-width:1.5;}
#igs-map-panel .igs-map-hint{position:absolute;left:20px;bottom:20px;z-index:3;margin:0;padding:5px 14px;border-radius:999px;background:rgba(14,16,20,.46);color:rgba(236,232,225,.74);font-size:12px;letter-spacing:.06em;pointer-events:none;}
#igs-map-panel .igs-map-feedback{position:absolute;left:50%;bottom:24px;z-index:4;margin:0;padding:8px 18px;transform:translateX(-50%);border-radius:999px;background:rgba(14,16,20,.72);color:var(--igs-rp-warm,#f2d49b);font-size:13px;white-space:nowrap;}
#igs-map-panel .igs-map-feedback:empty{display:none;}
#igs-map-panel .igs-map-detail{position:absolute;top:72px;right:20px;z-index:3;width:clamp(300px,30%,420px);max-height:calc(100% - 92px);overflow:auto;box-sizing:border-box;padding:26px 26px 22px;border-radius:24px;background:linear-gradient(160deg,rgba(255,255,255,.13) 0%,rgba(255,255,255,.04) 45%,rgba(255,255,255,.03) 100%),rgba(16,18,23,.5);-webkit-backdrop-filter:blur(20px) saturate(1.4);backdrop-filter:blur(20px) saturate(1.4);box-shadow:0 20px 60px rgba(0,0,0,.36);}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#igs-map-panel .igs-map-detail{background:rgba(16,18,23,.88);}}
@media (prefers-reduced-transparency:reduce){#igs-map-panel .igs-map-detail{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(16,18,23,.95);}}
#igs-map-panel .igs-map-detail.is-empty{width:auto;padding:10px 18px;border-radius:999px;}
#igs-map-panel .igs-map-detail-art{display:none;}
#igs-map-panel .igs-map-detail-empty{margin:0;color:var(--igs-rp-text-soft);font-size:13px;letter-spacing:.1em;white-space:nowrap;}
#igs-map-panel .igs-map-card{margin:0;padding:0;}
#igs-map-panel .igs-map-card p{overflow-wrap:anywhere;white-space:pre-wrap;}
#igs-map-panel .igs-map-card-kicker{display:flex;align-items:center;gap:8px;margin:0;color:var(--igs-rp-text-soft);font-size:11px;letter-spacing:.26em;}
#igs-map-panel .igs-map-card-kicker::before{content:"";width:6px;height:6px;border-radius:50%;background:rgba(246,240,223,.7);}
#igs-map-panel .igs-map-card h3{margin:8px 0 12px;font-size:26px;line-height:1.3;letter-spacing:.08em;font-weight:400;}
#igs-map-panel .igs-map-card-description{margin:0;font-size:14.5px;line-height:1.85;}
#igs-map-panel .igs-map-card-people{margin-top:18px;}
#igs-map-panel .igs-map-card-people>p{margin:0 0 8px;color:var(--igs-rp-text-soft);font-size:12px;letter-spacing:.12em;}
#igs-map-panel .igs-map-card-people>div{display:flex;flex-wrap:wrap;gap:6px;}
#igs-map-panel .igs-map-card-person{display:inline-flex;align-items:center;gap:6px;padding:3px 12px 3px 3px;border-radius:999px;background:var(--igs-rp-fill,rgba(255,255,255,.055));font-size:13px;}
#igs-map-panel .igs-map-card-person-avatar{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.28),rgba(255,255,255,.08) 72%);font-size:12px;}
#igs-map-panel .igs-map-card-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:22px;}
#igs-map-panel .igs-map-card-actions:empty{display:none;}
#igs-map-panel .igs-map-card-travel{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 30px;border:0;border-radius:999px;background:rgba(255,255,255,.17);color:var(--igs-rp-text);font-size:14px;letter-spacing:.28em;box-shadow:0 8px 22px rgba(0,0,0,.2);transition:background .2s;}
#igs-map-panel .igs-map-card-travel:hover{background:rgba(255,255,255,.25);}
#igs-map-panel .igs-map-card-secondary{min-height:42px;padding:10px 18px;border:0;border-radius:999px;background:transparent;color:var(--igs-rp-text-soft);font-size:13px;letter-spacing:.1em;transition:background .2s,color .2s;}
#igs-map-panel .igs-map-card-secondary:hover{background:var(--igs-rp-fill-hover,rgba(255,255,255,.095));color:var(--igs-rp-text);}
#igs-map-panel .igs-map-card-note{display:block;width:100%;margin:0;color:var(--igs-rp-text-faint);font-size:11px;line-height:1.6;}
#igs-map-panel .igs-map-card-auto{margin-top:10px;}
#igs-map-panel details{margin-top:16px;color:var(--igs-rp-text-soft);font-size:12px;}
#igs-map-panel details summary{cursor:pointer;}
#igs-map-panel.igs-rp-narrow .igs-map-tabs{top:52px;}
#igs-map-panel.igs-rp-narrow .igs-map-overlay-top{top:60px;left:10px;}
#igs-map-panel.igs-rp-narrow .igs-map-detail{top:auto;left:10px;right:10px;bottom:10px;width:auto;max-height:46%;padding:20px 20px 16px;border-radius:22px;}
#igs-map-panel.igs-rp-narrow .igs-map-detail.is-empty{left:50%;right:auto;bottom:14px;padding:8px 16px;transform:translateX(-50%);}
#igs-map-panel.igs-rp-narrow .igs-map-controls{top:112px;right:10px;bottom:auto;}
#igs-map-panel.igs-rp-narrow .igs-map-controls button{width:40px;height:40px;min-width:40px;min-height:40px;}
#igs-map-panel.igs-rp-narrow .igs-map-hint{display:none;}
#igs-map-panel.igs-rp-narrow .igs-map-feedback{bottom:auto;top:64px;}
#igs-map-panel.igs-rp-narrow .igs-map-marker svg{width:26px;height:26px;}
#igs-map-panel.igs-rp-narrow .igs-map-card h3{font-size:22px;margin:6px 0 8px;}
#igs-map-panel.igs-rp-narrow .igs-map-card-actions{margin-top:16px;}
`;
