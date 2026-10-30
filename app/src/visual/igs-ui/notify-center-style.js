// 手机通知中心样式：入口排在观众弹幕入口、回看入口之后；下拉通知栏只用 transform / opacity，色块一律实色。
export const NOTIFY_CENTER_STYLE_TEXT = `
.igs-nc-entry{--igs-aud-entry:28px;order:2;width:calc(var(--igs-aud-entry) * var(--igs-hud-scale,1));height:calc(var(--igs-aud-entry) * var(--igs-hud-scale,1));padding:0;box-sizing:border-box;border:0;background:transparent;color:#f4f1ec;opacity:.55;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));transition:opacity .2s ease;}
.igs-nc-entry[hidden]{display:none;}
/* 仅手机等待通知横幅退场；好友卡复用 notify 外壳，不参与遮挡。 */
@media (max-width:640px){#igs-stage-motion:has(.igs-fx-notify.igs-fx-transient:not(.igs-fx-contact)) .igs-nc-entry{display:none;}}
.igs-nc-entry svg{display:block;width:100%;height:100%;}
.igs-nc-entry[data-size="small"]{--igs-aud-entry:24px;}
.igs-nc-entry[data-size="large"]{--igs-aud-entry:34px;}
/* 社区 / 风暴手机在场时通知入口让位（runtime 在前层打 data-igs-phone-on），手机收起后恢复，通知照常记录。 */
[data-igs-phone-on] .igs-nc-entry{display:none;}
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
/* 手机回读弹窗把操作键放在同一行居中，不让关闭键被 order 推到左边、清除键留在右边。 */
@media (max-width:640px){.igs-nc-bar{flex-wrap:wrap;justify-content:center;}.igs-nc-title{flex:0 0 100%;text-align:center;}}
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
