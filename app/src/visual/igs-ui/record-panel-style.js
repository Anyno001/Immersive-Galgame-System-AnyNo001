export const RECORD_PANEL_STYLE_TEXT = `
#igs-record-panel{position:absolute;inset:0;z-index:11;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;pointer-events:auto;background:rgba(0,0,0,.4);}
#igs-record-panel .igs-record-window{width:min(580px,100%);max-height:min(82dvh,calc(100% - 16px));min-height:0;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;background:var(--igs-db-bg,rgba(31,34,37,.62));border:1px solid var(--igs-db-border,rgba(255,255,255,.16));border-radius:var(--igs-db-radius,8px);color:#e8e6e2;-webkit-backdrop-filter:var(--igs-db-blur,none);backdrop-filter:var(--igs-db-blur,none);box-shadow:0 12px 35px rgba(0,0,0,.35);}
#igs-record-panel header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.14);}
#igs-record-panel h2,#igs-record-panel h3{font-size:16px;margin:0;}
#igs-record-panel button{color:inherit;cursor:pointer;}
#igs-record-panel header button{font-size:24px;border:0;background:transparent;min-width:36px;min-height:36px;}
#igs-record-panel .igs-record-tabs{display:flex;gap:8px;overflow-x:auto;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.1);}
#igs-record-panel .igs-record-scroll{overflow:auto;min-height:0;padding:12px 16px 20px;overscroll-behavior:contain;}
#igs-record-panel .igs-record-tabs button,#igs-record-panel .igs-record-scroll button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);border-radius:7px;padding:8px;min-height:36px;}
#igs-record-panel button:focus-visible{outline:2px solid #f4e3ad;outline-offset:2px;}
#igs-record-panel .igs-record-source{font-size:12px;opacity:.7;}
#igs-record-panel .igs-record-chapter{padding:16px 8px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,.16);}
#igs-record-panel .igs-record-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;}
#igs-record-panel .igs-record-fields div{display:flex;gap:10px;margin:5px 0;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-fields dt{opacity:.65;flex:0 0 5em;}
#igs-record-panel .igs-record-fields dd{margin:0;min-width:0;white-space:pre-wrap;}
#igs-record-panel .igs-record-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;}
#igs-record-panel .igs-record-slots button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-width:0;min-height:72px;overflow-wrap:anywhere;text-align:center;}
#igs-record-panel svg{width:23px;height:23px;flex:none;}
#igs-record-panel [aria-current="true"]{border-color:#f4e3ad!important;}
#igs-record-panel .igs-record-item-detail{padding:14px 0;}
#igs-record-panel .igs-record-item-detail h3{display:flex;align-items:center;gap:8px;}
#igs-record-panel .igs-record-table-scroll{overflow:auto;max-width:100%;}
#igs-record-panel table{border-collapse:collapse;width:100%;text-align:left;}
#igs-record-panel caption{text-align:left;margin-bottom:8px;}
#igs-record-panel th,#igs-record-panel td{padding:8px;border:1px solid rgba(255,255,255,.2);white-space:pre-wrap;overflow-wrap:anywhere;min-width:80px;}
@media(max-width:420px){#igs-record-panel{padding:8px;}#igs-record-panel .igs-record-window{max-height:calc(100% - 12px);}}
`;