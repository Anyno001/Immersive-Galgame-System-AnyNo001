export const RECORD_PANEL_STYLE_TEXT = `
#igs-overlay.igs-record-screen-open #igs-click-layer,#igs-overlay.igs-record-screen-open #igs-sprite,#igs-overlay.igs-record-screen-open #igs-dialog-layer,#igs-overlay.igs-record-screen-open #igs-toolbar-layer,#igs-overlay.igs-record-screen-open #igs-option-layer,#igs-overlay.igs-record-screen-open #igs-status-hud,#igs-overlay.igs-record-screen-open #igs-sprite-edit-bar{display:none!important;pointer-events:none!important;}
#igs-overlay.igs-record-screen-open #igs-db-layer{inset:0;z-index:20;pointer-events:none;}
#igs-record-panel{position:absolute;inset:0;z-index:11;display:flex;align-items:stretch;justify-content:stretch;padding:0;box-sizing:border-box;pointer-events:auto;background:rgba(8,10,14,.78);color:#e8e6e2;}
#igs-record-panel .igs-record-window{width:100%;height:100%;max-height:none;min-height:0;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;background:transparent;border:0;border-radius:0;color:#e8e6e2;box-shadow:none;}
#igs-record-panel header{position:relative;display:flex;justify-content:center;align-items:center;min-height:72px;padding:14px 72px;border-bottom:1px solid rgba(255,255,255,.18);}
#igs-record-panel[data-record-category="diary"] h2,#igs-record-panel[data-record-category="inventory"] h2{position:absolute;left:50%;transform:translateX(-50%);max-width:calc(100% - 116px);font-size:17px;font-weight:600;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#igs-record-panel[data-record-category="diary"] .igs-record-bookshelf,#igs-record-panel[data-record-category="inventory"] .igs-record-slots{justify-content:center;}
#igs-record-panel[data-record-category="diary"] .igs-record-book,#igs-record-panel[data-record-category="inventory"] .igs-record-slots button{border:0;}
#igs-record-panel h2,#igs-record-panel h3{font-size:20px;margin:0;text-align:center;}
#igs-record-panel[data-record-category="diary"] .igs-record-body,#igs-record-panel[data-record-category="diary"] .igs-record-fields,#igs-record-panel[data-record-category="inventory"] .igs-record-fields{font-size:13px;line-height:1.55;}
#igs-record-panel button{color:inherit;cursor:pointer;}
#igs-record-panel header .igs-record-back{position:absolute;left:16px;top:14px;display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;background:transparent;}
#igs-record-panel header .igs-record-back svg{width:22px;height:22px;stroke-width:1.4;opacity:.82;}
#igs-record-panel .igs-record-head-spacer{width:44px;height:44px;}
#igs-record-panel .igs-record-tabs{display:flex;gap:8px;overflow-x:auto;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.1);}
#igs-record-panel .igs-record-scroll{overflow:auto;min-height:0;padding:18px clamp(16px,4vw,56px) 36px;overscroll-behavior:contain;}
#igs-record-panel .igs-record-tabs button,#igs-record-panel .igs-record-scroll button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);border-radius:7px;padding:8px;min-height:36px;}
#igs-record-panel button:focus-visible{outline:2px solid #f4e3ad;outline-offset:2px;}
#igs-record-panel .igs-record-source{font-size:12px;opacity:.7;}
#igs-record-panel[data-record-category="diary"] .igs-record-source,#igs-record-panel[data-record-category="inventory"] .igs-record-source{display:none;}
#igs-record-panel .igs-record-chapter{padding:16px 8px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,.16);}
#igs-record-panel .igs-record-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;}
#igs-record-panel .igs-record-fields div{display:flex;gap:10px;margin:5px 0;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-fields dt{opacity:.65;flex:0 0 5em;}
#igs-record-panel .igs-record-fields dd{margin:0;min-width:0;white-space:pre-wrap;}
#igs-record-panel .igs-record-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,112px));gap:10px;}
#igs-record-panel .igs-record-slots button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:0;min-height:96px;overflow-wrap:anywhere;text-align:center;background:rgba(255,255,255,.07);}
#igs-record-panel .igs-record-slots button svg{width:38px;height:38px;}
#igs-record-panel .igs-record-slot-name{max-width:100%;font-size:12px;line-height:1.3;}
#igs-record-panel .igs-record-slot-quantity{position:absolute;right:7px;bottom:6px;font-size:11px;color:rgba(255,255,255,.72);font-variant-numeric:tabular-nums;}
#igs-record-panel svg{width:23px;height:23px;flex:none;}
#igs-record-panel [aria-current="true"]{border-color:#f4e3ad!important;}
#igs-record-panel .igs-record-item-detail{margin-top:18px;padding:18px 0;border-top:1px solid rgba(255,255,255,.16);}
#igs-record-panel .igs-record-item-detail h3{display:flex;align-items:center;justify-content:center;gap:6px;font-size:17px;}
#igs-record-panel .igs-record-item-detail h3 svg{width:26px;height:26px;}
#igs-record-panel .igs-record-bookshelf{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,132px));gap:10px;}
#igs-record-panel .igs-record-book{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:128px;text-align:center;background:linear-gradient(145deg,rgba(125,92,54,.55),rgba(57,39,27,.72));box-shadow:none;}
#igs-record-panel .igs-record-book svg{width:34px;height:34px;}
#igs-record-panel .igs-record-book span{font-size:12px;line-height:1.3;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-book small{font-size:10px;opacity:.72;}
#igs-record-panel .igs-record-diary-detail{margin-top:20px;padding:20px 4px;border-top:1px solid rgba(255,255,255,.18);}
#igs-record-panel .igs-record-diary-detail h3{font-size:17px;text-align:center;}
#igs-record-panel .igs-record-date{margin:6px 0 14px;color:rgba(255,255,255,.65);font-size:11px;text-align:center;}
#igs-record-panel .igs-record-table-scroll{overflow:auto;max-width:100%;}
#igs-record-panel table{border-collapse:collapse;width:100%;text-align:left;}
#igs-record-panel caption{text-align:left;margin-bottom:8px;}
#igs-record-panel th,#igs-record-panel td{padding:8px;border:1px solid rgba(255,255,255,.2);white-space:pre-wrap;overflow-wrap:anywhere;min-width:80px;}
@media(max-width:420px){#igs-record-panel header{min-height:64px;padding-left:58px;padding-right:58px;}#igs-record-panel h2{font-size:17px;}#igs-record-panel .igs-record-scroll{padding-left:12px;padding-right:12px;}#igs-record-panel .igs-record-slots{grid-template-columns:repeat(auto-fit,minmax(88px,108px));gap:8px;}#igs-record-panel .igs-record-slots button{min-height:88px;}#igs-record-panel .igs-record-bookshelf{grid-template-columns:repeat(auto-fit,minmax(96px,120px));gap:8px;}#igs-record-panel .igs-record-book{min-height:112px;}}
`;