const SETTINGS_STYLE_TEXT = `
#igs-unified-settings{--igs-settings-vleft:0px;--igs-settings-vtop:0px;--igs-settings-vw:100vw;--igs-settings-vh:100dvh;--igs-settings-width:min(760px,calc(var(--igs-settings-vw) - 48px));--igs-settings-height:min(760px,calc(var(--igs-settings-vh) - 48px));position:fixed;left:var(--igs-settings-vleft);top:var(--igs-settings-vtop);width:var(--igs-settings-vw);height:var(--igs-settings-vh);z-index:2147483200;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;overflow:hidden;background:rgba(0,0,0,.46);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;color:rgba(255,255,255,.9);}
.igs-settings-shell{width:var(--igs-settings-width);height:var(--igs-settings-height);max-height:none;background:rgba(20,20,22,.86);border:1px solid rgba(255,255,255,.14);border-radius:22px;box-shadow:0 24px 70px rgba(0,0,0,.58);display:flex;flex-direction:column;overflow:hidden;-webkit-backdrop-filter:blur(34px) saturate(180%);backdrop-filter:blur(34px) saturate(180%)}
.igs-settings-head{height:54px;display:flex;align-items:center;gap:10px;padding:0 16px 0 20px;border-bottom:1px solid rgba(255,255,255,.09);flex-shrink:0}
.igs-settings-title{font-size:16px;font-weight:650;letter-spacing:.2px;flex:1}
.igs-settings-badge{font-size:11px;color:rgba(255,255,255,.48);border:1px solid rgba(255,255,255,.10);border-radius:999px;padding:3px 8px}
.igs-settings-close,.igs-settings-action{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.07);color:rgba(255,255,255,.72);border-radius:12px;height:34px;padding:0 12px;font:inherit;cursor:pointer}
.igs-settings-close{width:34px;padding:0;font-size:18px}
.igs-settings-close:hover,.igs-settings-close:focus,.igs-settings-action:hover,.igs-settings-action:focus{background:rgba(255,255,255,.13);color:#fff;outline:none}
.igs-settings-tabs{display:flex;gap:6px;padding:10px 12px 8px;overflow-x:auto;flex-shrink:0;background:rgba(255,255,255,.025)}
.igs-settings-tab{border:0;background:transparent;color:rgba(255,255,255,.48);padding:7px 10px;border-radius:10px;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.igs-settings-tab.is-active{background:rgba(255,255,255,.14);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.22)}
.igs-scene-subtabs{display:flex;gap:6px;margin:8px 0;padding:4px;background:rgba(255,255,255,.04);border-radius:12px}
.igs-scene-subtab{flex:1;border:0;background:transparent;color:rgba(255,255,255,.5);padding:7px 10px;border-radius:9px;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.igs-scene-subtab.is-active{background:rgba(255,255,255,.14);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.22)}
.igs-settings-body{flex:1;min-height:0;overflow-y:auto;padding:14px 20px 16px}
.igs-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
.igs-settings-section{display:flex;flex-direction:column;gap:12px}
.igs-settings-field{display:flex;flex-direction:column;gap:7px;font-size:12px;color:rgba(255,255,255,.58)}
.igs-settings-field em{font-style:normal;font-size:11px;color:rgba(255,255,255,.36);line-height:1.45}
.igs-settings-field input,.igs-settings-field select,.igs-settings-field textarea{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);border-radius:11px;padding:9px 11px;font:inherit;font-size:13px;outline:none}
.igs-settings-field input[type="color"]{width:42px;height:36px;padding:3px;border-radius:8px;cursor:pointer}
.igs-scene-preset-select{box-sizing:border-box;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);border-radius:11px;padding:9px 11px;font:inherit;font-size:13px;outline:none;height:38px}
.igs-scene-preset-select:focus{border-color:rgba(92,170,255,.58);background:rgba(255,255,255,.11)}
.igs-settings-field textarea{min-height:132px;resize:vertical;line-height:1.55;font-family:ui-monospace,Consolas,monospace}
.igs-settings-field input:focus,.igs-settings-field select:focus,.igs-settings-field textarea:focus{border-color:rgba(92,170,255,.58);background:rgba(255,255,255,.11)}
.igs-settings-api-group{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
.igs-settings-api-group.is-disabled{opacity:.52;filter:saturate(.65)}
.igs-settings-api-group.is-disabled input,.igs-settings-api-group.is-disabled select,.igs-settings-api-group.is-disabled textarea{color:rgba(255,255,255,.42);background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.08);cursor:not-allowed}
.igs-settings-api-group.is-disabled .igs-settings-action,.igs-settings-api-group.is-disabled .igs-settings-secret-toggle{cursor:not-allowed}
.igs-settings-api-group.is-disabled .igs-settings-field em{color:rgba(255,255,255,.34)}
.igs-settings-secret{display:flex;align-items:center;gap:8px}
.igs-settings-secret input{flex:1;min-width:0}
.igs-settings-secret-toggle{height:36px;min-width:52px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.07);color:rgba(255,255,255,.68);border-radius:11px;font:inherit;font-size:12px;cursor:pointer}
.igs-settings-secret-toggle:hover,.igs-settings-secret-toggle:focus{background:rgba(255,255,255,.13);color:#fff;outline:none;border-color:rgba(255,255,255,.18)}
.igs-settings-model{display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:8px;width:100%;align-items:center}
.igs-settings-model-row{display:contents}
.igs-settings-model input{height:36px;min-width:0}
.igs-settings-model select{grid-column:1 / -1;height:36px}
.igs-settings-model select:disabled{opacity:.55;cursor:not-allowed}
.igs-settings-inline-action{width:96px;height:36px;padding:0 10px;white-space:nowrap}
.igs-settings-action.is-active,.igs-settings-inline-action.is-active{background:linear-gradient(135deg,rgba(93,190,255,.38),rgba(255,255,255,.20));border-color:rgba(135,216,255,.72);color:#fff;box-shadow:0 0 0 1px rgba(135,216,255,.22) inset,0 0 18px rgba(93,190,255,.20)}
.igs-settings-action[disabled],.igs-settings-inline-action[disabled]{opacity:.55;cursor:not-allowed;pointer-events:none}
.igs-segmented-field .igs-settings-field{width:100%}
.igs-segmented{height:40px;display:grid;grid-template-columns:repeat(var(--igs-segment-count,3),minmax(0,1fr));align-items:center;gap:0;padding:4px;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.075);border-radius:14px;position:relative;overflow:hidden}
.igs-segmented-indicator{position:absolute;top:4px;bottom:4px;left:4px;width:calc((100% - 8px) / var(--igs-segment-count,3));border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,.10));box-shadow:0 1px 4px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.12);transform:translateX(calc(var(--igs-active-index,0) * 100%));transition:transform .16s ease,background .16s ease;pointer-events:none}
.igs-segmented-btn{height:32px;min-width:0;position:relative;z-index:1;border:0;border-radius:10px;background:transparent;color:rgba(255,255,255,.48);font:inherit;font-size:12px;line-height:18px;font-weight:650;letter-spacing:0;white-space:nowrap;cursor:pointer;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;gap:5px;overflow:hidden;transition:color .12s,text-shadow .12s,transform .1s}
.igs-segmented-btn-icon{width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:currentColor}
.igs-segmented-btn-icon svg{width:15px;height:15px;display:block}
.igs-segmented-btn-label{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.igs-segmented-btn:hover{color:rgba(255,255,255,.86)}
.igs-segmented-btn:active{transform:scale(.97)}
.igs-segmented-btn:focus{outline:none;box-shadow:0 0 0 2px rgba(92,170,255,.18)}
.igs-segmented-btn.is-active{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35)}
.igs-switch{height:38px;display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.07);color:rgba(255,255,255,.72);border-radius:12px;padding:0 12px;cursor:pointer;text-align:left;font:inherit;font-size:13px}
.igs-switch i{width:30px;height:18px;border-radius:999px;background:rgba(255,255,255,.18);position:relative;flex-shrink:0}
.igs-switch i:after{content:"";position:absolute;width:14px;height:14px;top:2px;left:2px;border-radius:50%;background:#fff;transition:left .16s}
.igs-switch.is-on{color:#fff;border-color:rgba(10,132,255,.38);background:rgba(10,132,255,.18)}
.igs-switch.is-on i{background:rgb(10,132,255)}
.igs-switch.is-on i:after{left:14px}
.igs-source-filter{grid-column:1/-1;padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.035);display:flex;flex-direction:column;gap:12px}
.igs-source-filter-title{font-size:12px;line-height:18px;font-weight:650;color:rgba(255,255,255,.72)}
.igs-source-filter-note{font-size:11px;line-height:16px;font-weight:400;color:rgba(255,255,255,.38)}
.igs-source-filter-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
.igs-source-filter textarea{min-height:76px}
.igs-body-format textarea[data-path="bridge.virtualRegex.replacement"]{min-height:132px}
.igs-settings-row{display:flex;gap:10px;align-items:center}
.igs-settings-row > *{flex:1}
.igs-settings-result{min-height:18px;font-size:12px;color:rgba(255,255,255,.48);line-height:1.5}
.igs-settings-result.is-ok{color:rgba(93,220,147,.95)}
.igs-settings-result.is-error{color:rgba(255,118,118,.95)}
.igs-settings-danger{border-color:rgba(255,92,92,.24);color:rgba(255,156,156,.88);}
.igs-settings-full{grid-column:1/-1}
.igs-settings-preview{white-space:pre-wrap;max-height:220px;overflow:auto;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.55;border:1px solid rgba(255,255,255,.10);border-radius:12px;background:rgba(0,0,0,.18);padding:12px;color:rgba(255,255,255,.78)}
.igs-btn-mgr-list{display:flex;flex-direction:column;gap:2px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.035);padding:6px;overflow:hidden}
.igs-btn-mgr-row{display:flex;align-items:center;gap:8px;height:36px;padding:0 8px;border-radius:8px;transition:background .12s}
.igs-btn-mgr-row:hover{background:rgba(255,255,255,.07)}
.igs-btn-mgr-row.is-hidden-btn{opacity:.45}
.igs-btn-mgr-handle{cursor:pointer;color:rgba(255,255,255,.32);font-size:14px;user-select:none;width:18px;text-align:center;flex-shrink:0}
.igs-btn-mgr-handle:hover{color:rgba(255,255,255,.7)}
.igs-btn-mgr-handle:active{color:rgba(92,170,255,.9)}
.igs-btn-mgr-label{flex:1;font-size:12px;color:rgba(255,255,255,.78);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.igs-btn-mgr-icon{border:0;background:transparent;color:rgba(255,255,255,.3);cursor:pointer;padding:4px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:color .12s,background .12s}
.igs-btn-mgr-icon:hover{background:rgba(255,255,255,.1);color:rgba(255,255,255,.7)}
.igs-btn-mgr-icon.is-on{color:rgba(93,190,255,.9)}
.igs-btn-mgr-icon.is-on:hover{color:rgba(135,216,255,1);background:rgba(93,190,255,.12)}
.igs-scene-url-input{flex:1;min-width:0;height:28px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:rgba(255,255,255,.85);border-radius:8px;padding:0 8px;font:inherit;font-size:11px;outline:none}
.igs-scene-url-input:focus{border-color:rgba(92,170,255,.5);background:rgba(255,255,255,.10)}
.igs-scene-char-group{margin-bottom:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:4px;background:rgba(255,255,255,.02)}
.igs-scene-empty{font-size:11px;color:rgba(255,255,255,.32);padding:8px;text-align:center}
.igs-mood-groups{margin-top:10px}
.igs-mood-groups>summary{padding:6px 4px;list-style:revert}
.igs-mood-word-list{display:flex;flex-wrap:wrap;gap:6px;padding:6px 4px}
.igs-mood-word-tag{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 6px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
.igs-mood-word-del{border:0;background:transparent;color:rgba(255,255,255,.4);cursor:pointer;font-size:14px;line-height:1;padding:0}
.igs-mood-word-del:hover{color:rgba(255,120,120,.9)}
.igs-sprite-slot{border-bottom:1px solid rgba(255,255,255,.05)}
.igs-sprite-slot:last-child{border-bottom:0}
.igs-sprite-slot-body{display:flex;gap:10px;padding:6px 4px 10px;align-items:flex-start}
.igs-sprite-thumb{width:72px;height:72px;flex-shrink:0;object-fit:contain;border-radius:8px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);cursor:zoom-in}
.igs-sprite-thumb-empty{display:flex;align-items:center;justify-content:center;font-size:10px;color:rgba(255,255,255,.32);cursor:default}
.igs-sprite-thumb-broken{position:relative}
.igs-sprite-words{flex:1;min-width:0}
.igs-sprite-preview-overlay{position:absolute;inset:0;z-index:2147483600;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:24px;box-sizing:border-box}
.igs-sprite-preview-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 12px 48px rgba(0,0,0,.6)}
@media (max-width:640px){#igs-unified-settings{--igs-settings-width:min(760px,calc(var(--igs-settings-vw) - 24px));--igs-settings-height:min(760px,calc(var(--igs-settings-vh) - 24px));padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}.igs-settings-shell{width:var(--igs-settings-width);height:var(--igs-settings-height);border-radius:18px}.igs-settings-grid,.igs-settings-api-group,.igs-source-filter-grid{grid-template-columns:1fr}.igs-segmented{height:40px}.igs-segmented-btn{font-size:11px;padding:0 4px;gap:4px}}
`.trim();

export function getSettingsStyleText() {
    return SETTINGS_STYLE_TEXT;
}
