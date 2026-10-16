import { IGS_UI_EDGE_NIGHT, IGS_UI_ELEVATION, IGS_UI_NIGHT_RGB, IGS_UI_THICKNESS, igsUiSurface } from '../../styles/ui-material.js';

export const MAP_PANEL_STYLE_TEXT = `
#igs-status-hud .igs-hud-toggle{z-index:0;}
#igs-status-hud .igs-hud-identity{display:contents;}
#igs-status-hud .igs-hud-avatar-frame{position:relative;grid-column:1;grid-row:1;align-self:center;width:calc(46px * var(--igs-hud-scale,1));height:calc(46px * var(--igs-hud-scale,1));}
#igs-status-hud .igs-hud-entry-anchor{position:relative;z-index:1;grid-column:2;grid-row:1;align-self:center;justify-self:start;display:flex;align-items:center;gap:calc(3px * var(--igs-hud-scale,1));max-width:100%;min-width:0;pointer-events:none;}
#igs-status-hud .igs-hud-emotion{flex:none;}
#igs-status-hud .igs-hud-metrics{grid-column:1 / 3;grid-row:2;display:grid;grid-template-columns:max-content minmax(0,1fr) auto;align-items:center;justify-content:normal;align-self:auto;gap:calc(4px * var(--igs-hud-scale,1)) calc(5px * var(--igs-hud-scale,1));margin-top:calc(7px * var(--igs-hud-scale,1));}
#igs-status-hud .igs-hud-metric{display:contents;}
#igs-status-hud.igs-hud-no-metrics .igs-hud-metrics{display:none;}
#igs-status-hud .igs-hud-avatar-empty{box-sizing:border-box;padding:calc(9px * var(--igs-hud-scale,1));background:rgba(255,255,255,.16);color:rgba(255,255,255,.62);}
#igs-status-hud .igs-hud-overflow{grid-column:3;grid-row:2;}
#igs-status-hud .igs-hud-entry-arrow{position:relative;display:grid;place-items:center;flex:none;width:14px;height:20px;margin-left:calc(-2px * var(--igs-hud-scale,1));padding:0;border:0;background:transparent;color:rgba(232,230,226,.7);cursor:pointer;pointer-events:auto;}
#igs-status-hud .igs-hud-entry-arrow::after{content:"";position:absolute;inset:-6px -8px;}
#igs-status-hud .igs-hud-entry-arrow svg{width:12px;height:12px;transition:transform .15s ease;}
#igs-status-hud .igs-hud-entry-arrow[aria-expanded="true"] svg{transform:rotate(-90deg);}
#igs-status-hud .igs-hud-location-icon{display:flex;flex:0 0 auto;width:calc(16px * var(--igs-hud-scale,1));height:calc(16px * var(--igs-hud-scale,1));color:rgba(255,255,255,.48);pointer-events:none;}
#igs-status-hud .igs-hud-location-icon svg{display:block;width:100%;height:100%;}
#igs-status-hud .igs-hud-entry-menu{position:relative;z-index:3;display:flex;flex-direction:row;align-items:center;gap:1px;margin-left:calc(2px * var(--igs-hud-scale,1));padding-left:calc(4px * var(--igs-hud-scale,1));border-left:1px solid rgba(255,255,255,.2);pointer-events:none;}
#igs-status-hud .igs-hud-entry-menu[hidden]{display:none;}
#igs-status-hud .igs-hud-entry-item{display:flex;align-items:center;gap:3px;min-width:0;padding:3px;border:0;background:transparent;color:rgba(232,230,226,.58);font-size:13px;white-space:nowrap;cursor:pointer;pointer-events:auto;}
#igs-status-hud .igs-hud-entry-item:hover{color:#fff;}
#igs-status-hud .igs-hud-entry-item svg{width:12.4px;height:12.4px;flex:none;}
#igs-status-hud .igs-hud-entry-arrow:focus-visible,#igs-status-hud .igs-hud-entry-item:focus-visible{outline:2px solid #f4e3ad;outline-offset:1px;}
#igs-status-hud.igs-hud-suppressed .igs-hud-toggle,#igs-status-hud.igs-hud-suppressed .igs-hud-entry-anchor{pointer-events:none;visibility:hidden;}
@media (pointer:coarse){#igs-status-hud .igs-hud-entry-arrow::after{inset:-12px -14px;}}
#igs-status-hud .igs-hud-entry-item svg path,#igs-status-hud .igs-hud-entry-item svg rect,#igs-status-hud .igs-hud-entry-item svg circle,#igs-status-hud .igs-hud-location-icon svg path,#igs-status-hud .igs-hud-location-icon svg circle{stroke-width:1.8;}
#igs-map-panel{--igs-map-chrome:rgba(${IGS_UI_NIGHT_RGB},.82);--igs-map-chrome-hover:rgba(${IGS_UI_NIGHT_RGB},.94);}
#igs-map-panel{position:absolute;inset:0;z-index:11;display:block;padding:0;box-sizing:border-box;pointer-events:auto;background:#0b0d10;color:var(--igs-rp-text,#eceae6);}
#igs-map-panel .igs-map-window{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;box-sizing:border-box;background:transparent;border:0;border-radius:0;box-shadow:none;}
#igs-map-panel button{color:inherit;cursor:pointer;font-family:inherit;}
#igs-map-panel .igs-rp-head{position:absolute!important;top:0;left:0;right:0;z-index:5;background:linear-gradient(180deg,rgba(8,10,13,.72) 0%,rgba(8,10,13,.3) 58%,rgba(8,10,13,0) 100%);pointer-events:none;}
#igs-map-panel .igs-rp-head>*{pointer-events:auto;}
#igs-map-panel .igs-rp-body.igs-map-body{position:relative;display:block;height:100%;overflow:hidden;}
#igs-map-panel .igs-map-main{position:absolute;inset:0;z-index:1;}
#igs-map-panel .igs-map-tabs .igs-rp-chip{border-radius:calc(var(--igs-rp-radius-m) - 2px);}
#igs-map-panel .igs-map-source{display:flex;flex-direction:column;gap:6px;padding:6px;border-radius:var(--igs-rp-radius-m);background:var(--igs-map-chrome);-webkit-backdrop-filter:var(--igs-rp-blur);backdrop-filter:var(--igs-rp-blur);}
#igs-map-panel .igs-map-source-switch{display:flex;gap:2px;padding:2px;border-radius:calc(var(--igs-rp-radius-m) - 2px);background:var(--igs-rp-fill);}
#igs-map-panel .igs-map-source-switch button{flex:1;min-height:30px;padding:5px 14px;border:0;border-radius:calc(var(--igs-rp-radius-m) - 4px);background:transparent;color:var(--igs-rp-text-soft);font-size:13px;font-weight:500;letter-spacing:.08em;white-space:nowrap;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-map-panel .igs-map-source-switch button:hover{color:var(--igs-rp-text);}
#igs-map-panel .igs-map-source-switch button[aria-pressed="true"]{background:var(--igs-rp-warm);color:#1b1d21;font-weight:600;}
#igs-map-panel .igs-map-source-sub{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:0 2px;}
#igs-map-panel .igs-map-source-state{color:var(--igs-rp-text-soft);font-size:12px;letter-spacing:.06em;white-space:nowrap;}
#igs-map-panel .igs-map-source-chip{display:inline-flex;align-items:center;gap:4px;min-height:26px;padding:3px 10px;border:0;border-radius:var(--igs-rp-radius-s);background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);font-size:12px;letter-spacing:.06em;white-space:nowrap;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-map-panel .igs-map-source-chip:hover{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
#igs-map-panel .igs-map-source-chip[aria-pressed="true"]{box-shadow:inset 0 0 0 1px var(--igs-rp-warm);color:var(--igs-rp-text);}
#igs-map-panel .igs-map-source-chip svg{width:13px;height:13px;}
#igs-map-panel .igs-map-levels{display:flex;align-items:center;gap:8px;margin:0 0 14px;min-width:0;}
#igs-map-panel .igs-map-levels-back{flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-map-panel .igs-map-levels-back:hover{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
#igs-map-panel .igs-map-levels-back svg{width:16px;height:16px;}
#igs-map-panel .igs-map-levels-trail{display:flex;align-items:center;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:none;font-size:12px;letter-spacing:.06em;white-space:nowrap;}
#igs-map-panel .igs-map-levels-trail button{flex:none;padding:4px 6px;border:0;border-radius:var(--igs-rp-radius-s);background:none;color:var(--igs-rp-text-faint);font:inherit;}
#igs-map-panel .igs-map-levels-trail button:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
#igs-map-panel .igs-map-levels-trail span{flex:none;padding:4px 6px;color:var(--igs-rp-text);font-weight:600;}
#igs-map-panel .igs-map-levels-trail i{flex:none;color:var(--igs-rp-text-faint);font-style:normal;opacity:.6;}
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
#igs-map-panel .igs-map-marker button{position:relative;display:grid;place-items:center;width:44px;height:44px;min-width:44px;min-height:44px;padding:4px;border:0;background:transparent;color:#f6f0df;transition:transform .2s var(--igs-rp-ease);}
#igs-map-panel .igs-map-marker button:hover{transform:translateY(-2px);}
#igs-map-panel .igs-map-marker svg{width:28px;height:28px;overflow:visible;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));}
#igs-map-panel .igs-map-marker svg path{fill:rgba(236,234,230,.94);stroke:none;}
#igs-map-panel .igs-map-marker svg circle{fill:rgba(22,24,29,.8);stroke:none;}
#igs-map-panel .igs-map-label{display:inline-flex;align-items:center;gap:6px;max-width:100%;margin-top:-5px;padding:3px 8px;border-radius:var(--igs-rp-radius-s);background:rgba(18,20,23,.8);color:var(--igs-rp-text);font-size:12px;font-weight:500;line-height:1.35;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:none;box-shadow:0 2px 8px rgba(0,0,0,.28);}
#igs-map-panel .igs-map-people{display:inline-flex;flex:none;}
#igs-map-panel .igs-map-people i{display:grid;place-items:center;width:16px;height:16px;margin-left:-4px;border-radius:50%;background:var(--igs-rp-warm);color:#1b1d21;font-size:9px;font-weight:600;font-style:normal;line-height:1;}
#igs-map-panel .igs-map-people i:first-child{margin-left:0;}
#igs-map-panel .igs-map-marker.igs-map-auto svg path{fill:rgba(236,234,230,.58);}
#igs-map-panel .igs-map-marker.igs-map-auto .igs-map-label{background:rgba(18,20,23,.62);color:var(--igs-rp-text-soft);}
#igs-map-panel .igs-map-marker.igs-map-selected button{transform:scale(1.12);}
#igs-map-panel .igs-map-marker.igs-map-selected svg path{fill:#fff;}
#igs-map-panel .igs-map-marker.igs-map-selected .igs-map-label{background:var(--igs-rp-text);color:var(--igs-rp-on-ink);font-weight:600;}
#igs-map-panel .igs-map-marker.igs-map-current button svg{display:none;}
#igs-map-panel .igs-map-marker.igs-map-current button::before{content:"";position:relative;z-index:1;width:12px;height:12px;border-radius:50%;background:var(--igs-rp-warm);box-shadow:0 0 0 3px rgba(18,20,23,.7);}
#igs-map-panel .igs-map-marker.igs-map-current button::after{content:"";position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(242,212,155,.45);animation:igs-map-pulse 2.4s ease-out infinite;}
@keyframes igs-map-pulse{from{transform:scale(1);opacity:.7;}to{transform:scale(3.4);opacity:0;}}
#igs-map-panel .igs-map-here{max-width:160px;overflow:hidden;text-overflow:ellipsis;margin-bottom:-8px;padding:2px 7px;border-radius:var(--igs-rp-radius-s);background:var(--igs-rp-warm);color:#1b1d21;font-size:11px;font-weight:600;line-height:1.45;letter-spacing:.1em;white-space:nowrap;text-shadow:none;}
#igs-map-panel .igs-map-detail{position:absolute;top:72px;right:20px;z-index:3;width:clamp(300px,30%,400px);max-height:calc(100% - 92px);overflow:auto;box-sizing:border-box;padding:22px 22px 20px;border-radius:var(--igs-rp-radius-l);background:${igsUiSurface(IGS_UI_THICKNESS.thick)};-webkit-backdrop-filter:var(--igs-rp-blur);backdrop-filter:var(--igs-rp-blur);box-shadow:${IGS_UI_ELEVATION},${IGS_UI_EDGE_NIGHT};}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#igs-map-panel .igs-map-detail{background:rgba(${IGS_UI_NIGHT_RGB},.95);}}
@media (prefers-reduced-transparency:reduce){#igs-map-panel .igs-map-detail{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(${IGS_UI_NIGHT_RGB},.97);}}
#igs-map-panel .igs-map-detail.is-empty{width:auto;padding:9px 14px;border-radius:var(--igs-rp-radius-m);}
#igs-map-panel .igs-map-detail.is-empty{display:flex;align-items:center;gap:10px;}
#igs-map-panel .igs-map-detail.is-empty .igs-map-levels{margin:0;}
#igs-map-panel .igs-map-detail-art{display:none;}
#igs-map-panel .igs-map-detail-empty{margin:0;color:var(--igs-rp-text-soft);font-size:13px;letter-spacing:.06em;white-space:nowrap;}
#igs-map-panel .igs-map-card{margin:0;padding:0;}
#igs-map-panel .igs-map-card p{overflow-wrap:anywhere;white-space:pre-wrap;}
#igs-map-panel .igs-map-card-kicker{display:flex;align-items:center;gap:8px;margin:0;color:var(--igs-rp-text-faint);font-size:11px;font-weight:500;letter-spacing:.16em;}
#igs-map-panel .igs-map-card-kicker::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--igs-rp-warm);}
#igs-map-panel .igs-map-card h3{margin:8px 0 10px;font-size:22px;line-height:1.3;letter-spacing:.04em;font-weight:600;}
#igs-map-panel .igs-map-card-description{margin:0;font-family:var(--igs-rp-font-body);font-size:15px;line-height:1.85;}
#igs-map-panel .igs-map-card-people{margin-top:18px;}
#igs-map-panel .igs-map-card-people>p{margin:0 0 8px;color:var(--igs-rp-text-faint);font-size:11px;font-weight:500;letter-spacing:.16em;}
#igs-map-panel .igs-map-card-people>div{display:flex;flex-wrap:wrap;gap:6px;}
#igs-map-panel .igs-map-card-person{display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 3px;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);font-size:13px;font-weight:500;}
#igs-map-panel .igs-map-card-person-avatar{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--igs-rp-fill-active);font-size:12px;font-weight:600;}
#igs-map-panel .igs-map-card-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:22px;}
#igs-map-panel .igs-map-card-actions:empty{display:none;}
#igs-map-panel .igs-map-card-travel{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 24px;border:0;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-text);color:var(--igs-rp-on-ink);font-size:14px;font-weight:600;letter-spacing:.2em;transition:opacity .18s var(--igs-rp-ease),transform .12s var(--igs-rp-ease);}
#igs-map-panel .igs-map-card-travel:hover{opacity:.88;}
#igs-map-panel .igs-map-card-travel:active,#igs-map-panel .igs-map-card-secondary:active{transform:scale(.97);}
#igs-map-panel .igs-map-card-secondary{min-height:40px;padding:9px 14px;border:0;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);font-size:13px;font-weight:500;letter-spacing:.06em;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-map-panel .igs-map-card-secondary:hover{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
#igs-map-panel .igs-map-card-note{display:block;width:100%;margin:0;color:var(--igs-rp-text-faint);font-size:11px;line-height:1.6;}
#igs-map-panel .igs-map-card-auto{margin-top:10px;}
#igs-map-panel details{margin-top:16px;color:var(--igs-rp-text-faint);font-size:12px;}
#igs-map-panel details summary{cursor:pointer;}
#igs-map-panel.igs-rp-narrow .igs-map-detail{top:auto;left:10px;right:10px;bottom:10px;width:auto;max-height:46%;padding:18px 18px 14px;}
#igs-map-panel.igs-rp-narrow .igs-map-marker svg{width:24px;height:24px;}
#igs-map-panel.igs-rp-narrow .igs-map-card h3{font-size:19px;margin:6px 0 8px;}
#igs-map-panel.igs-rp-narrow .igs-map-card-actions{margin-top:16px;}
#igs-map-panel .igs-rp-head .igs-rp-back{background:var(--igs-map-chrome);}
#igs-map-panel .igs-rp-head .igs-rp-back:hover{background:var(--igs-map-chrome-hover);}
#igs-map-panel .igs-rp-head .igs-rp-title{text-shadow:0 1px 2px rgba(0,0,0,.7),0 0 12px rgba(0,0,0,.45);}
#igs-map-panel .igs-rp-head-end{justify-self:end;display:flex;align-items:center;min-width:0;}
#igs-map-panel .igs-map-tools{display:flex;align-items:center;gap:2px;padding:2px;border-radius:var(--igs-rp-radius-m);background:var(--igs-map-chrome);}
#igs-map-panel .igs-map-tools button{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:calc(var(--igs-rp-radius-m) - 2px);background:transparent;color:var(--igs-rp-text-soft);transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-map-panel .igs-map-tools button:hover{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
#igs-map-panel .igs-map-tools button[aria-expanded="true"]{background:var(--igs-rp-fill-active,var(--igs-rp-fill-hover));color:var(--igs-rp-text);}
#igs-map-panel .igs-map-tools svg{width:18px;height:18px;stroke-width:1.6;}
#igs-map-panel .igs-map-source-menu{position:absolute;top:calc(58px + env(safe-area-inset-top,0px));right:16px;z-index:6;}
#igs-map-panel .igs-map-source-menu[hidden]{display:none;}
#igs-map-panel .igs-map-top{position:absolute;top:calc(62px + env(safe-area-inset-top,0px));left:50%;z-index:4;display:flex;flex-direction:column;align-items:center;gap:6px;max-width:calc(100% - 32px);transform:translateX(-50%);pointer-events:none;}
#igs-map-panel .igs-map-top>*{pointer-events:auto;}
#igs-map-panel .igs-map-tabs{display:flex;gap:2px;max-width:100%;overflow-x:auto;padding:2px;border-radius:var(--igs-rp-radius-m);background:var(--igs-map-chrome);}
#igs-map-panel .igs-map-status{margin:0;padding:5px 12px;border-radius:var(--igs-rp-radius-m);background:var(--igs-map-chrome);color:var(--igs-rp-text-soft);font-size:12px;line-height:1.5;letter-spacing:.04em;text-align:center;overflow-wrap:anywhere;pointer-events:none;}
#igs-map-panel .igs-map-status:empty{display:none;}
#igs-map-panel .igs-map-card{position:relative;}
#igs-map-panel .igs-map-card-close{position:absolute;top:-10px;right:-10px;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-faint);transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-map-panel .igs-map-card-close:hover{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
#igs-map-panel .igs-map-card-close svg{width:16px;height:16px;}
#igs-map-panel .igs-map-card h3{padding-right:24px;}
#igs-map-panel.igs-rp-narrow .igs-rp-head{padding-left:8px;padding-right:10px;column-gap:8px;}
#igs-map-panel.igs-rp-narrow .igs-map-zoom{display:none;}
#igs-map-panel.igs-rp-narrow .igs-map-source-menu{left:10px;right:10px;}
#igs-map-panel.igs-rp-narrow .igs-map-top{top:calc(56px + env(safe-area-inset-top,0px));}
#igs-map-panel.igs-rp-narrow .igs-map-detail.is-passive{display:none;}
#igs-map-panel.igs-rp-narrow .igs-map-detail.is-passive.has-levels{display:flex;left:50%;right:auto;bottom:14px;width:auto;max-width:calc(100% - 20px);padding:4px 10px 4px 4px;border-radius:var(--igs-rp-radius-m);transform:translateX(-50%);}
#igs-map-panel.igs-rp-narrow .igs-map-detail.is-passive .igs-map-levels{margin:0;}
#igs-map-panel.igs-rp-narrow .igs-map-detail.is-passive>:not(.igs-map-levels){display:none;}
`;
