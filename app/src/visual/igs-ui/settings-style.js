const SETTINGS_STYLE_TEXT = `
#igs-unified-settings{--igs-settings-paper:#16181a;--igs-settings-panel:#1f2225;--igs-settings-surface:#1b1d1f;--igs-settings-field:#282c2f;--igs-settings-line:#2f3336;--igs-settings-line-strong:#4c5255;--igs-settings-ink:#d8d5cf;--igs-settings-ink-2:#bebbb4;--igs-settings-ink-3:#8c9093;--igs-settings-ink-4:#6a6e71;--igs-settings-accent:#cfccc6;--igs-settings-danger:#b08c8c;--igs-settings-highlight:#2b2f32;--igs-settings-vleft:0px;--igs-settings-vtop:0px;--igs-settings-vw:100vw;--igs-settings-vh:100dvh;--igs-settings-width:min(760px,calc(var(--igs-settings-vw) - 48px));--igs-settings-height:min(760px,calc(var(--igs-settings-vh) - 48px));position:fixed;left:var(--igs-settings-vleft);top:var(--igs-settings-vtop);width:var(--igs-settings-vw);height:var(--igs-settings-vh);z-index:2147483200;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;overflow:hidden;background:rgba(9,10,11,.78);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;color:var(--igs-settings-ink);color-scheme:dark;-webkit-backdrop-filter:none;backdrop-filter:none}
#igs-unified-settings[data-igs-settings-theme="day"]{--igs-settings-paper:#f1f1ef;--igs-settings-panel:#f7f7f5;--igs-settings-surface:#fbfbfa;--igs-settings-field:#e8e8e5;--igs-settings-line:#dededa;--igs-settings-line-strong:#b4b4af;--igs-settings-ink:#1a1a1a;--igs-settings-ink-2:#4e4e4c;--igs-settings-ink-3:#85857f;--igs-settings-ink-4:#ababa5;--igs-settings-accent:#202020;--igs-settings-danger:#8e7a7a;--igs-settings-highlight:#e4e4e0;background:rgba(254,255,255,.61);color-scheme:light}
#igs-unified-settings{--igs-settings-radius-shell:8px;--igs-settings-radius-control:6px;--igs-settings-radius-small:4px}
#igs-unified-settings,#igs-unified-settings *{box-shadow:none;filter:none}
#igs-unified-settings,#igs-unified-settings *{scrollbar-width:none;-ms-overflow-style:none}
#igs-unified-settings ::-webkit-scrollbar{display:none;width:0;height:0}
.igs-settings-shell{width:var(--igs-settings-width);height:var(--igs-settings-height);max-height:none;background:var(--igs-settings-panel);border:0;border-radius:var(--igs-settings-radius-shell);box-shadow:none;display:flex;flex-direction:column;overflow:hidden;-webkit-backdrop-filter:none;backdrop-filter:none}
.igs-settings-head{height:54px;display:flex;align-items:center;gap:10px;padding:0 14px 0 20px;border-bottom:1px solid var(--igs-settings-line);flex-shrink:0}
.igs-settings-title{font-size:15px;font-weight:500;letter-spacing:.08em;flex:0 0 auto;color:var(--igs-settings-ink)}
.igs-settings-head-spacer{flex:1}
.igs-settings-badge{font-family:ui-monospace,Consolas,monospace;font-size:10px;color:var(--igs-settings-ink-4);border:0;border-radius:0;padding:3px 0;letter-spacing:.04em}
.igs-settings-theme-toggle{width:32px;height:32px;position:relative;left:-4px;top:3px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--igs-settings-radius-control);background:transparent;color:var(--igs-settings-ink-3);cursor:pointer;transition:background-color .14s ease,color .14s ease}
.igs-settings-theme-toggle svg{display:block;width:11px;height:11px}
.igs-settings-theme-toggle:hover,.igs-settings-theme-toggle:focus-visible{background:var(--igs-settings-field);color:var(--igs-settings-ink);outline:none}
.igs-settings-close,.igs-settings-action{border:0;background:var(--igs-settings-field);color:var(--igs-settings-ink-2);border-radius:var(--igs-settings-radius-control);height:34px;padding:0 12px;font:inherit;font-size:12px;letter-spacing:.04em;cursor:pointer;transition:background-color .14s ease,color .14s ease}
.igs-settings-close{width:34px;padding:0;font-size:18px;letter-spacing:0}
.igs-settings-close:hover,.igs-settings-close:focus-visible,.igs-settings-action:hover,.igs-settings-action:focus-visible{background:var(--igs-settings-accent);color:var(--igs-settings-paper);outline:none}
.igs-settings-danger{color:var(--igs-settings-danger);background:transparent}
.igs-settings-danger:hover,.igs-settings-danger:focus-visible{background:var(--igs-settings-danger);color:var(--igs-settings-paper)}
.igs-settings-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;padding:8px 12px;overflow-x:auto;flex-shrink:0;background:var(--igs-settings-surface);border-bottom:1px solid var(--igs-settings-line)}
.igs-settings-tab{box-sizing:border-box;width:100%;border:0;background:transparent;color:var(--igs-settings-ink-3);padding:7px 4px;border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;text-align:center;white-space:nowrap;cursor:pointer;transition:background-color .14s ease,color .14s ease}
.igs-settings-tab:hover,.igs-settings-tab:focus-visible{background:var(--igs-settings-field);color:var(--igs-settings-ink);outline:none}
.igs-settings-tab.is-active{background:var(--igs-settings-accent);color:var(--igs-settings-paper);box-shadow:none}
.igs-scene-subtabs{display:flex;gap:2px;margin:8px 0;padding:3px;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-scene-subtab{flex:1;border:0;background:transparent;color:var(--igs-settings-ink-3);padding:7px 10px;border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.igs-scene-subtab:hover,.igs-scene-subtab:focus-visible{color:var(--igs-settings-ink);outline:none}
.igs-scene-subtab.is-active{background:var(--igs-settings-accent);color:var(--igs-settings-paper);box-shadow:none}
.igs-scene-settings{min-width:0}
.igs-scene-settings-subtabs{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;margin:10px 0 12px;padding:3px;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-scene-settings-subtab{height:32px;min-width:0;border:0;background:transparent;color:var(--igs-settings-ink-3);border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;transition:background-color .14s ease,color .14s ease}
.igs-scene-settings-subtab:hover,.igs-scene-settings-subtab:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-scene-settings-subtab.is-active{background:var(--igs-settings-accent);color:var(--igs-settings-paper);box-shadow:none}
.igs-scene-settings-subpane{min-width:0}
.igs-reader-settings{min-width:0}
.igs-reader-subtabs{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;margin:0 0 12px;padding:3px;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-reader-subtab{height:32px;min-width:0;border:0;background:transparent;color:var(--igs-settings-ink-3);border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;transition:background-color .14s ease,color .14s ease}
.igs-reader-subtab:hover,.igs-reader-subtab:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-reader-subtab.is-active{background:var(--igs-settings-accent);color:var(--igs-settings-paper);box-shadow:none}
.igs-reader-subpane{min-width:0}
.igs-settings-body{flex:1;min-height:0;overflow-y:auto;padding:16px 20px 18px;background:var(--igs-settings-panel)}
.igs-settings-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 14px;min-width:0}
.igs-settings-section{display:flex;flex-direction:column;gap:10px;min-width:0}
.igs-settings-field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--igs-settings-ink-2)}
.igs-settings-field em{font-style:normal;font-size:11px;color:var(--igs-settings-ink-4);line-height:1.5}
.igs-status-hud-tables{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.igs-status-hud-tables>em{display:block;flex-basis:100%;margin-top:2px}
.igs-table-pick{min-width:0;max-width:100%;height:32px;display:inline-flex;align-items:center;gap:7px;padding:0 9px;border:0;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field);color:var(--igs-settings-ink-2);font:inherit;font-size:12px;cursor:pointer}
.igs-table-pick>i{width:12px;height:12px;box-sizing:border-box;border:1px solid var(--igs-settings-line-strong);border-radius:var(--igs-settings-radius-small);background:transparent;flex-shrink:0}
.igs-table-pick>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.igs-table-pick:hover,.igs-table-pick:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-table-pick.is-on{background:var(--igs-settings-accent);color:var(--igs-settings-paper)}
.igs-table-pick.is-on>i{border-color:var(--igs-settings-paper);background:var(--igs-settings-paper)}
.igs-table-pick.is-missing{opacity:.66}
.igs-settings-field input,.igs-settings-field select,.igs-settings-field textarea{width:100%;box-sizing:border-box;border:0;border-bottom:1px solid transparent;background:var(--igs-settings-field);color:var(--igs-settings-ink);border-radius:var(--igs-settings-radius-control);padding:8px 10px;font:inherit;font-size:13px;line-height:1.5;outline:none;transition:background-color .14s ease,border-color .14s ease}
.igs-settings-field option{background:var(--igs-settings-panel);color:var(--igs-settings-ink)}
.igs-settings-field input[type="color"]{width:42px;height:36px;padding:3px;border-radius:var(--igs-settings-radius-small);cursor:pointer}
.igs-settings-field input[type="color"]::-webkit-color-swatch-wrapper{padding:0}
.igs-settings-field input[type="color"]::-webkit-color-swatch{border:0;border-radius:var(--igs-settings-radius-small)}
.igs-scene-preset-select{box-sizing:border-box;border:0;border-bottom:1px solid transparent;background:var(--igs-settings-field);color:var(--igs-settings-ink);border-radius:var(--igs-settings-radius-control);padding:8px 10px;font:inherit;font-size:13px;outline:none;height:38px}
.igs-scene-preset-select:focus{border-bottom-color:var(--igs-settings-line-strong);background:var(--igs-settings-highlight)}
.igs-settings-field textarea{min-height:132px;resize:vertical;line-height:1.55;font-family:ui-monospace,Consolas,monospace}
.igs-settings-field input:focus,.igs-settings-field select:focus,.igs-settings-field textarea:focus{border-bottom-color:var(--igs-settings-line-strong);background:var(--igs-settings-highlight)}
.igs-settings-api-group{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 14px;min-width:0}
.igs-settings-api-group.is-disabled{opacity:.48}
.igs-settings-api-group.is-disabled input,.igs-settings-api-group.is-disabled select,.igs-settings-api-group.is-disabled textarea{color:var(--igs-settings-ink-4);background:var(--igs-settings-surface);border-bottom-color:transparent;cursor:not-allowed}
.igs-settings-api-group.is-disabled .igs-settings-action,.igs-settings-api-group.is-disabled .igs-settings-secret-toggle{cursor:not-allowed}
.igs-settings-api-group.is-disabled .igs-settings-field em{color:var(--igs-settings-ink-4)}
.igs-settings-secret{display:flex;align-items:center;gap:8px}
.igs-settings-secret input{flex:1;min-width:0}
.igs-settings-secret-toggle{height:36px;min-width:52px;border:0;background:var(--igs-settings-field);color:var(--igs-settings-ink-3);border-radius:var(--igs-settings-radius-control);font:inherit;font-size:12px;cursor:pointer}
.igs-settings-secret-toggle:hover,.igs-settings-secret-toggle:focus-visible{background:var(--igs-settings-accent);color:var(--igs-settings-paper);outline:none}
.igs-settings-model{display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:8px;width:100%;align-items:center}
.igs-settings-model-row{display:contents}
.igs-settings-model input{height:36px;min-width:0}
.igs-settings-model select{grid-column:1/-1;height:36px}
.igs-settings-model select:disabled{opacity:.55;cursor:not-allowed}
.igs-settings-inline-action{width:96px;height:36px;padding:0 10px;white-space:nowrap}
.igs-settings-action.is-active,.igs-settings-inline-action.is-active{background:var(--igs-settings-accent);color:var(--igs-settings-paper);box-shadow:none}
.igs-settings-action[disabled],.igs-settings-inline-action[disabled]{opacity:.55;cursor:not-allowed;pointer-events:none}
.igs-segmented-field .igs-settings-field{width:100%}
.igs-segmented{--igs-segment-pad:clamp(0px,calc(2cqi - 5px),6px);--igs-segment-gap:clamp(0px,calc(1.5cqi - 4px),5px);--igs-segment-font:clamp(9px,calc(5px + 1.5cqi),12px);--igs-segment-icon:clamp(8px,calc(3px + 2cqi),15px);container-type:inline-size;height:40px;display:grid;grid-template-columns:repeat(var(--igs-segment-count,3),minmax(0,1fr));align-items:center;gap:2px;padding:4px;box-sizing:border-box;border:0;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control);position:relative;overflow:hidden}
.igs-segmented-indicator{display:none}
.igs-segmented-btn{box-sizing:border-box;width:100%;height:32px;min-width:0;margin:0;padding:0 var(--igs-segment-pad);position:relative;z-index:1;border:0;border-radius:var(--igs-settings-radius-small);background:transparent;color:var(--igs-settings-ink-3);font:inherit;font-size:var(--igs-segment-font);line-height:18px;font-weight:500;letter-spacing:0;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:var(--igs-segment-gap);overflow:hidden;transition:background-color .14s ease,color .14s ease}
.igs-segmented-btn-icon{width:var(--igs-segment-icon);height:var(--igs-segment-icon);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:currentColor}
.igs-segmented-btn-icon svg{width:100%;height:100%;display:block}
.igs-segmented-btn-label{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.igs-segmented-btn:hover{background:var(--igs-settings-highlight);color:var(--igs-settings-ink)}
.igs-segmented-btn:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-segmented-btn.is-active{background:var(--igs-settings-accent);color:var(--igs-settings-paper);text-shadow:none}
.igs-switch{height:38px;display:flex;align-items:center;gap:10px;border:0;background:var(--igs-settings-field);color:var(--igs-settings-ink-2);border-radius:var(--igs-settings-radius-control);padding:0 12px;cursor:pointer;text-align:left;font:inherit;font-size:13px;transition:background-color .14s ease,color .14s ease}
.igs-switch:hover,.igs-switch:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-switch i{width:30px;height:18px;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-line-strong);position:relative;flex-shrink:0}
.igs-switch i:after{content:"";position:absolute;width:14px;height:14px;top:2px;left:2px;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-ink)}
.igs-switch.is-on{color:var(--igs-settings-ink);background:var(--igs-settings-highlight)}
.igs-switch.is-on i{background:var(--igs-settings-accent)}
.igs-switch.is-on i:after{left:14px;background:var(--igs-settings-paper)}
.igs-source-filter{grid-column:1/-1;padding:12px;border:0;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-surface);display:flex;flex-direction:column;gap:12px;min-width:0;max-width:100%;box-sizing:border-box}
.igs-source-filter-title{font-size:12px;line-height:18px;font-weight:500;letter-spacing:.06em;color:var(--igs-settings-ink)}
.igs-source-filter-note{font-size:11px;line-height:16px;font-weight:400;color:var(--igs-settings-ink-4);overflow-wrap:anywhere}
.igs-source-filter-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 14px;min-width:0}
.igs-source-filter textarea{min-height:76px}
.igs-body-format textarea[data-path="bridge.virtualRegex.replacement"]{min-height:132px}
.igs-settings-row{display:flex;gap:10px;align-items:center;min-width:0}
.igs-settings-row > *{flex:1;min-width:0}
.igs-settings-result{min-height:18px;font-size:12px;color:var(--igs-settings-ink-3);line-height:1.5}
.igs-settings-result.is-ok{color:var(--igs-settings-ink-2)}
.igs-settings-result.is-error{color:var(--igs-settings-danger)}
.igs-settings-full{grid-column:1/-1}
.igs-settings-preview{white-space:pre-wrap;max-height:220px;overflow:auto;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.55;border:0;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-paper);padding:12px;color:var(--igs-settings-ink-2)}
.igs-btn-mgr-list{display:flex;flex-direction:column;gap:0;border:0;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-paper);padding:4px 6px;overflow:hidden}
.igs-btn-mgr-row{display:flex;align-items:center;gap:8px;height:36px;min-width:0;max-width:100%;box-sizing:border-box;padding:0 8px;border-radius:0;border-bottom:1px solid var(--igs-settings-line);transition:background-color .14s ease}
.igs-btn-mgr-row:last-child{border-bottom:0}
.igs-btn-mgr-row:hover{background:var(--igs-settings-highlight)}
.igs-btn-mgr-row.is-hidden-btn{opacity:.45}
.igs-btn-mgr-handle{cursor:pointer;color:var(--igs-settings-ink-4);font-size:14px;user-select:none;width:18px;text-align:center;flex-shrink:0}
.igs-btn-mgr-handle:hover{color:var(--igs-settings-ink)}
.igs-btn-mgr-handle:active{color:var(--igs-settings-accent)}
.igs-btn-mgr-label{flex:1;font-size:12px;color:var(--igs-settings-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.igs-btn-mgr-icon{border:0;background:transparent;color:var(--igs-settings-ink-4);cursor:pointer;padding:4px;border-radius:var(--igs-settings-radius-small);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:color .14s ease,background-color .14s ease}
.igs-btn-mgr-icon:hover,.igs-btn-mgr-icon:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-btn-mgr-icon.is-on{color:var(--igs-settings-accent)}
.igs-btn-mgr-icon.is-on:hover{color:var(--igs-settings-paper);background:var(--igs-settings-accent)}
.igs-scene-url-input{flex:1;min-width:0;height:28px;border:0;border-bottom:1px solid transparent;background:var(--igs-settings-field);color:var(--igs-settings-ink);border-radius:var(--igs-settings-radius-control);padding:0 8px;font:inherit;font-size:11px;outline:none}
.igs-scene-url-input:focus{border-bottom-color:var(--igs-settings-line-strong);background:var(--igs-settings-highlight)}
.igs-scene-char-group{min-width:0;max-width:100%;box-sizing:border-box;margin-bottom:8px;border:0;border-bottom:1px solid var(--igs-settings-line);border-radius:0;padding:4px;background:transparent}
.igs-scene-time-group{margin-left:16px;max-width:calc(100% - 16px)}
.igs-scene-weather-row{margin-left:32px;max-width:calc(100% - 32px)}
.igs-scene-char-group:last-child{border-bottom:0}
.igs-scene-empty{font-size:11px;color:var(--igs-settings-ink-4);padding:8px;text-align:center}
.igs-mood-groups{margin-top:10px}
.igs-mood-groups>summary{padding:6px 4px;list-style:revert;color:var(--igs-settings-ink-2)}
.igs-mood-word-list{display:flex;flex-wrap:wrap;gap:6px;padding:6px 4px}
.igs-mood-word-tag{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 6px;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-highlight);border:0;color:var(--igs-settings-ink-2)}
.igs-mood-word-del{border:0;background:transparent;color:var(--igs-settings-ink-3);cursor:pointer;font-size:14px;line-height:1;padding:0}
.igs-mood-word-del:hover{color:var(--igs-settings-danger)}
.igs-sprite-slot{min-width:0;max-width:100%;border-bottom:1px solid var(--igs-settings-line)}
.igs-sprite-slot:last-child{border-bottom:0}
.igs-sprite-slot-body{display:flex;gap:10px;min-width:0;max-width:100%;box-sizing:border-box;padding:6px 4px 10px;align-items:flex-start}
.igs-sprite-thumb{width:72px;height:72px;flex-shrink:0;object-fit:contain;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-paper);border:0;cursor:zoom-in}
.igs-sprite-thumb-empty{display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--igs-settings-ink-4);cursor:default}
.igs-sprite-thumb-broken{position:relative}
 .igs-status-avatar-row{justify-content:flex-start;gap:8px}
 .igs-status-avatar-row .igs-btn-mgr-label{flex:0 0 auto}
 .igs-status-avatar-thumb{width:28px;height:28px;flex-shrink:0;border-radius:50%;object-fit:cover;background:var(--igs-settings-paper);overflow:hidden}
 .igs-status-avatar-empty{display:inline-flex;align-items:center;justify-content:center;padding:3px;color:var(--igs-settings-ink-4);cursor:default}
.igs-sprite-words{flex:1;min-width:0}
.igs-sprite-preview-overlay{position:absolute;inset:0;z-index:2147483600;background:rgba(9,10,11,.94);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:24px;box-sizing:border-box}
.igs-sprite-preview-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--igs-settings-radius-control);box-shadow:none}
@media (max-width:640px){#igs-unified-settings{--igs-settings-width:min(760px,calc(var(--igs-settings-vw) - 24px));--igs-settings-height:min(760px,calc(var(--igs-settings-vh) - 24px));padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}.igs-settings-shell{width:var(--igs-settings-width);height:var(--igs-settings-height);border-radius:var(--igs-settings-radius-shell)}.igs-settings-grid,.igs-settings-api-group,.igs-source-filter-grid{grid-template-columns:minmax(0,1fr)}}
`.trim();

export function getSettingsStyleText() {
    return SETTINGS_STYLE_TEXT;
}
