// 四类资料页共用外壳样式 token：液态磨玻璃。整页只保留一层 backdrop 模糊（资料页），
// 其上元素全部无描边，只用透明度、柔光渐变与留白分层，避免多层模糊叠加的合成开销。
export const RECORD_PAGE_SHELL_STYLE_TEXT = `
#igs-record-panel,#igs-map-panel{
  --igs-rp-bg:#16181a;
  --igs-rp-text:#ece8e1;
  --igs-rp-text-soft:rgba(236,232,225,.74);
  --igs-rp-text-faint:rgba(236,232,225,.5);
  --igs-rp-panel:rgba(255,255,255,.06);
  --igs-rp-fill:rgba(255,255,255,.055);
  --igs-rp-fill-hover:rgba(255,255,255,.095);
  --igs-rp-fill-active:rgba(255,255,255,.16);
  --igs-rp-sheen:linear-gradient(160deg,rgba(255,255,255,.1) 0%,rgba(255,255,255,.035) 40%,rgba(255,255,255,.018) 64%,rgba(255,255,255,.055) 100%);
  --igs-rp-line:rgba(236,232,225,.16);
  --igs-rp-line-soft:rgba(236,232,225,.08);
  --igs-rp-accent:#f3efe7;
  --igs-rp-warm:#f2d49b;
  --igs-rp-glow:0 14px 40px rgba(0,0,0,.26);
  --igs-rp-radius:14px;
  --igs-rp-radius-sheet:22px;
  --igs-rp-blur:22px;
  --igs-rp-text-shadow:0 1px 3px rgba(0,0,0,.22);
  --igs-rp-font-body:"Source Han Serif CN","Noto Serif CJK SC","Songti SC",serif;
  --igs-rp-font-latin:"Cormorant Garamond","Source Han Serif CN",serif;
  --igs-rp-title-size:20px;
  --igs-rp-body-size:16px;
  --igs-rp-line-height:1.8;
}
#igs-overlay.igs-record-screen-open{background:transparent!important;}
#igs-record-panel .igs-rp-page,#igs-map-panel .igs-rp-page{
  position:absolute;inset:0;display:flex;flex-direction:column;
  font-family:var(--igs-rp-font-body);color:var(--igs-rp-text);
  font-size:var(--igs-rp-body-size);line-height:var(--igs-rp-line-height);
  background:transparent;overflow:hidden;box-sizing:border-box;text-shadow:var(--igs-rp-text-shadow);
}
#igs-record-panel .igs-rp-page::before{
  content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
  background:radial-gradient(120% 80% at 12% -10%,rgba(255,255,255,.07),transparent 55%),
    radial-gradient(90% 70% at 110% 110%,rgba(150,170,200,.07),transparent 60%),
    linear-gradient(180deg,rgba(12,14,18,.44) 0%,rgba(12,14,18,.6) 100%);
  -webkit-backdrop-filter:blur(var(--igs-rp-blur)) saturate(1.3);backdrop-filter:blur(var(--igs-rp-blur)) saturate(1.3);
}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  #igs-record-panel .igs-rp-page::before{background:linear-gradient(180deg,rgba(12,14,18,.8),rgba(12,14,18,.88));}
}
@media (prefers-reduced-transparency:reduce){
  #igs-record-panel .igs-rp-page::before{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(16,18,22,.95);}
}
#igs-record-panel .igs-rp-head,#igs-map-panel .igs-rp-head{
  position:relative;z-index:2;display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;
  min-height:64px;padding:10px 16px 6px;padding-top:calc(10px + env(safe-area-inset-top,0px));
  background:transparent;flex:none;
}
#igs-record-panel .igs-rp-title,#igs-map-panel .igs-rp-title{
  margin:0;justify-self:center;font-size:var(--igs-rp-title-size);font-weight:400;
  min-width:0;letter-spacing:.32em;padding-left:.32em;white-space:nowrap;color:var(--igs-rp-text);
}
#igs-record-panel .igs-rp-back,#igs-map-panel .igs-rp-back{
  justify-self:start;width:44px;height:44px;min-width:44px;min-height:44px;display:grid;place-items:center;
  padding:0;border:0;background:transparent;color:var(--igs-rp-text);cursor:pointer;border-radius:50%;transition:background .2s;
}
#igs-record-panel .igs-rp-back:hover,#igs-map-panel .igs-rp-back:hover{background:var(--igs-rp-fill-hover);}
#igs-record-panel .igs-rp-back svg,#igs-map-panel .igs-rp-back svg{width:20px;height:20px;stroke-width:1.5;}
#igs-record-panel .igs-rp-body,#igs-map-panel .igs-rp-body{
  position:relative;z-index:1;flex:1 1 auto;min-height:0;display:flex;overflow:hidden;
}
#igs-record-panel button:focus-visible,#igs-map-panel button:focus-visible{outline:2px solid rgba(243,239,231,.55);outline-offset:2px;}
#igs-record-panel,#igs-map-panel,#igs-record-panel *,#igs-map-panel *{scrollbar-width:none;}
#igs-record-panel ::-webkit-scrollbar,#igs-map-panel ::-webkit-scrollbar{display:none;}
#igs-record-panel .igs-rp-chip,#igs-map-panel .igs-rp-chip,#igs-record-panel .igs-rp-segment button{
  display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:6px 14px;border:0;border-radius:999px;
  background:transparent;color:var(--igs-rp-text-soft);font-size:13px;letter-spacing:.06em;line-height:1.2;white-space:nowrap;
  transition:background .2s,color .2s;
}
#igs-record-panel .igs-rp-chip:hover,#igs-map-panel .igs-rp-chip:hover,#igs-record-panel .igs-rp-segment button:hover{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
#igs-record-panel .igs-rp-chip[aria-pressed="true"],#igs-map-panel .igs-rp-chip[aria-pressed="true"],#igs-record-panel .igs-rp-segment button[aria-pressed="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
#igs-record-panel .igs-rp-chip small{font-size:11px;opacity:.62;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-rp-chip svg,#igs-map-panel .igs-rp-chip svg,#igs-record-panel .igs-rp-segment svg{width:15px;height:15px;flex:none;stroke-width:1.5;}
#igs-record-panel .igs-rp-segment{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:var(--igs-rp-fill);}
#igs-record-panel .igs-rp-icon-btn{display:grid;place-items:center;width:38px;height:38px;min-width:38px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--igs-rp-text-soft);transition:background .2s,color .2s;}
#igs-record-panel .igs-rp-icon-btn:hover,#igs-record-panel .igs-rp-icon-btn[aria-expanded="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
#igs-record-panel .igs-rp-icon-btn svg{width:18px;height:18px;stroke-width:1.5;}
#igs-record-panel .igs-rp-btn,#igs-map-panel .igs-rp-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:10px 28px;border:0;border-radius:999px;
  background:rgba(255,255,255,.17);color:var(--igs-rp-text);font-size:14px;letter-spacing:.24em;text-shadow:none;
  box-shadow:0 8px 22px rgba(0,0,0,.2);transition:background .2s,transform .2s;
}
#igs-record-panel .igs-rp-btn:hover,#igs-map-panel .igs-rp-btn:hover{background:rgba(255,255,255,.25);transform:translateY(-1px);}
#igs-record-panel .igs-rp-notice,#igs-map-panel .igs-rp-notice{margin:0 0 12px;padding:8px 14px;border-radius:12px;background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);font-size:13px;line-height:1.6;overflow-wrap:anywhere;}
#igs-record-panel .igs-rp-dot{display:inline-block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--igs-rp-warm);box-shadow:0 0 8px rgba(242,212,155,.6);}
#igs-record-panel .igs-rp-search{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);transition:background .2s;}
#igs-record-panel .igs-rp-search:focus-within{background:var(--igs-rp-fill-hover);}
#igs-record-panel .igs-rp-search svg{width:15px;height:15px;flex:none;stroke-width:1.5;}
#igs-record-panel .igs-rp-search input{
  flex:1;min-width:0;width:9em;height:100%;margin:0;padding:0;border:0!important;outline:0!important;border-radius:0;
  background:transparent!important;box-shadow:none!important;color:var(--igs-rp-text);font:inherit;font-size:13px;line-height:1;
  -webkit-appearance:none;appearance:none;text-shadow:none;
}
#igs-record-panel .igs-rp-search input::placeholder{color:var(--igs-rp-text-faint);}
#igs-record-panel .igs-rp-search input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;}
#igs-record-panel .igs-rp-switch{position:relative;flex:none;width:30px;height:18px;border-radius:999px;background:rgba(255,255,255,.14);transition:background .2s;}
#igs-record-panel .igs-rp-switch::after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.66);transition:transform .2s,background .2s;}
#igs-record-panel [aria-pressed="true"] .igs-rp-switch{background:rgba(242,212,155,.5);}
#igs-record-panel [aria-pressed="true"] .igs-rp-switch::after{transform:translateX(12px);background:#fff;}
#igs-record-panel.igs-rp-narrow,#igs-map-panel.igs-rp-narrow{
  --igs-rp-title-size:18px;--igs-rp-body-size:15px;--igs-rp-line-height:1.78;--igs-rp-blur:16px;
}
#igs-record-panel.igs-rp-short .igs-rp-head,#igs-map-panel.igs-rp-short .igs-rp-head{min-height:52px;padding-top:calc(4px + env(safe-area-inset-top,0px));}
@media (prefers-reduced-motion:reduce){
  #igs-record-panel *,#igs-map-panel *{transition:none!important;animation:none!important;}
}
`;
