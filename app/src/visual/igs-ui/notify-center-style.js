// 手机通知中心样式：入口排在观众弹幕入口、回看入口之后；下拉通知栏只用 transform / opacity，色块一律实色。
export const NOTIFY_CENTER_STYLE_TEXT = `
.igs-nc-entry{--igs-aud-entry:38px;position:absolute;left:calc(14px + var(--igs-nc-slot,0) * (var(--igs-aud-entry) * var(--igs-hud-scale,1) + 8px));top:var(--igs-nc-top,14px);width:calc(var(--igs-aud-entry) * var(--igs-hud-scale,1));height:calc(var(--igs-aud-entry) * var(--igs-hud-scale,1));padding:7px;box-sizing:border-box;border:0;background:transparent;color:#f4f1ec;opacity:.55;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));transition:opacity .2s ease;}
.igs-nc-entry[hidden]{display:none;}
.igs-nc-entry svg{display:block;width:100%;height:100%;}
.igs-nc-entry[data-size="small"]{--igs-aud-entry:30px;}
.igs-nc-entry[data-size="large"]{--igs-aud-entry:46px;}
.igs-nc-entry:hover,.igs-nc-entry:focus-visible,.igs-nc-entry[data-unread="1"]{opacity:1;}
.igs-nc-entry:focus-visible{outline:2px solid #f4e3ad;outline-offset:2px;border-radius:8px;}
.igs-nc-badge{position:absolute;top:-3px;right:-5px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:#e5484d;color:#fff;font:700 10px/16px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 1.5px #14161a;}
.igs-nc-badge[hidden]{display:none;}
@media (pointer:coarse){.igs-nc-entry::after{content:"";position:absolute;inset:-8px;}}
.igs-nc{position:absolute;inset:0;z-index:3;pointer-events:auto;background:rgba(8,9,12,.5);}
.igs-nc-panel{position:absolute;top:0;left:0;right:0;max-width:440px;max-height:72%;margin:0 auto;display:flex;flex-direction:column;border-radius:0 0 18px 18px;background:#1b1e25;color:#f4f1ec;box-shadow:0 10px 28px rgba(0,0,0,.45);animation:igs-nc-drop .26s cubic-bezier(.2,.8,.3,1) both;}
.igs-nc-bar{display:flex;align-items:center;gap:8px;padding:12px 14px 8px;}
.igs-nc-title{flex:1;font-size:16px;font-weight:700;}
.igs-nc-clear{padding:5px 11px;border:0;border-radius:14px;background:#2b303a;color:#f4f1ec;font-size:12px;cursor:pointer;}
.igs-nc-close{width:30px;height:30px;padding:6px;box-sizing:border-box;border:0;border-radius:50%;background:#2b303a;color:#f4f1ec;cursor:pointer;}
.igs-nc-close svg{display:block;width:100%;height:100%;}
.igs-nc-list{overflow-y:auto;overscroll-behavior:contain;padding:2px 12px 14px;}
.igs-nc-group{margin-top:8px;padding:8px 10px;border-radius:12px;background:#252932;}
.igs-nc-head{display:flex;align-items:center;gap:6px;font-size:12px;color:#c9c6c0;}
.igs-nc-ico{width:16px;height:16px;display:inline-block;}
.igs-nc-ico svg{display:block;width:100%;height:100%;}
.igs-nc-dot{width:8px;height:8px;border-radius:50%;}
.igs-nc-app{flex:1;font-weight:600;}
.igs-nc-item{margin-top:7px;padding-top:7px;border-top:1px solid #343944;}
.igs-nc-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;}
.igs-nc-from{font-weight:600;color:#f4f1ec;}
.igs-nc-floor{margin-left:auto;color:#8f8c86;}
.igs-nc-text{margin-top:2px;font-size:13px;line-height:1.45;word-break:break-word;}
.igs-nc-more{margin-top:6px;font-size:11px;color:#8f8c86;}
@keyframes igs-nc-drop{from{transform:translateY(-100%);opacity:.4;}to{transform:translateY(0);opacity:1;}}
@media (prefers-reduced-motion: reduce){.igs-nc-panel{animation:none;}}
`.trim();
