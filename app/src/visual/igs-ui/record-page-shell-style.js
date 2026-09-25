// 四类资料页共用外壳样式 token。步骤 2 冻结起点，校准后只允许在此文件改值。
export const RECORD_PAGE_SHELL_STYLE_TEXT = `
#igs-record-panel,#igs-map-panel{
  --igs-rp-bg:#16181a;
  --igs-rp-text:#d8d5cf;
  --igs-rp-text-soft:rgba(216,213,207,.72);
  --igs-rp-text-faint:rgba(216,213,207,.52);
  --igs-rp-panel:rgba(31,34,37,.62);
  --igs-rp-line:rgba(216,213,207,.22);
  --igs-rp-line-soft:rgba(216,213,207,.12);
  --igs-rp-accent:#d8d5cf;
  --igs-rp-radius:8px;
  --igs-rp-radius-sheet:20px;
  --igs-rp-font-body:"Source Han Serif CN","Noto Serif CJK SC","Songti SC",serif;
  --igs-rp-font-latin:"Cormorant Garamond","Source Han Serif CN",serif;
  --igs-rp-title-size:24px;
  --igs-rp-body-size:17px;
  --igs-rp-line-height:1.8;
  --igs-rp-veil:linear-gradient(to top,rgba(8,9,10,.92) 0%,rgba(8,9,10,.55) 46%,rgba(8,9,10,.18) 100%);
  --igs-rp-veil-title:linear-gradient(to bottom,rgba(8,9,10,.55),rgba(8,9,10,0));
}
#igs-overlay.igs-record-screen-open{background:transparent!important;}
#igs-record-panel .igs-rp-page,#igs-map-panel .igs-rp-page{
  position:absolute;inset:0;display:flex;flex-direction:column;
  font-family:var(--igs-rp-font-body);color:var(--igs-rp-text);
  font-size:var(--igs-rp-body-size);line-height:var(--igs-rp-line-height);
  background:transparent;overflow:hidden;box-sizing:border-box;
}
#igs-record-panel .igs-rp-page::before,#igs-map-panel .igs-rp-page::before{
  content:"";position:absolute;inset:0;background:var(--igs-rp-veil);pointer-events:none;z-index:0;
}
#igs-record-panel .igs-rp-head,#igs-map-panel .igs-rp-head{
  position:relative;z-index:2;display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;
  min-height:64px;padding:10px 16px calc(6px + env(safe-area-inset-top,0px) * 0);
  padding-top:calc(10px + env(safe-area-inset-top,0px));
  background:var(--igs-rp-veil-title);flex:none;
}
#igs-record-panel .igs-rp-title,#igs-map-panel .igs-rp-title{
  margin:0;justify-self:center;font-size:var(--igs-rp-title-size);font-weight:400;
  min-width:0;letter-spacing:.14em;display:flex;align-items:center;gap:18px;white-space:nowrap;
}
#igs-record-panel .igs-rp-title,#igs-map-panel .igs-rp-title{font-size:calc(var(--igs-rp-title-size) - 2px);letter-spacing:.22em;}
#igs-record-panel .igs-rp-title::before,#igs-record-panel .igs-rp-title::after,
#igs-map-panel .igs-rp-title::before,#igs-map-panel .igs-rp-title::after{
  content:"";display:block;width:56px;height:1px;background:var(--igs-rp-line);
}
#igs-record-panel .igs-rp-back,#igs-map-panel .igs-rp-back{
  justify-self:start;width:44px;height:44px;min-width:44px;min-height:44px;display:grid;place-items:center;
  padding:0;border:0;background:transparent;color:var(--igs-rp-text);cursor:pointer;border-radius:var(--igs-rp-radius);
}
#igs-record-panel .igs-rp-back svg,#igs-map-panel .igs-rp-back svg{width:21px;height:21px;stroke-width:1.4;opacity:.86;}
#igs-record-panel .igs-rp-body,#igs-map-panel .igs-rp-body{
  position:relative;z-index:1;flex:1 1 auto;min-height:0;display:flex;overflow:hidden;
}
#igs-record-panel button:focus-visible,#igs-map-panel button:focus-visible{
  outline:1px solid var(--igs-rp-accent);outline-offset:2px;
}
#igs-record-panel.igs-rp-narrow,#igs-map-panel.igs-rp-narrow{
  --igs-rp-title-size:20px;--igs-rp-body-size:15px;--igs-rp-line-height:1.78;
}
#igs-record-panel.igs-rp-narrow .igs-rp-title::before,#igs-record-panel.igs-rp-narrow .igs-rp-title::after,
#igs-map-panel.igs-rp-narrow .igs-rp-title::before,#igs-map-panel.igs-rp-narrow .igs-rp-title::after{width:32px;}
#igs-record-panel.igs-rp-narrow .igs-rp-title,#igs-map-panel.igs-rp-narrow .igs-rp-title{gap:12px;}
#igs-record-panel.igs-rp-short .igs-rp-head,#igs-map-panel.igs-rp-short .igs-rp-head{position:sticky;top:0;}
`;
