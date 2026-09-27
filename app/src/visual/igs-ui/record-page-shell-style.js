import {
    IGS_UI_BLUR, IGS_UI_BLUR_VIVID, IGS_UI_FILL, IGS_UI_PANE, IGS_UI_PANE_EDGE, IGS_UI_FONT_SANS, IGS_UI_FONT_SERIF, IGS_UI_INK, IGS_UI_NIGHT_RGB,
    IGS_UI_LIQUID_KEYFRAMES, IGS_UI_RADIUS, IGS_UI_THICKNESS, IGS_UI_WARM, igsUiLiquidRule, igsUiSurface,
} from '../../styles/ui-material.js';
import { IGS_RIPPLE_ART } from '../../styles/ui-ripple-art.js';

// 四类资料页共用外壳：整页一层「通透艳丽」的模糊（薄色罩 + 高饱和 + 压暗），
// 其上是水纹流光，再上是悬浮薄玻璃片（半透明填充 + 顶边 1px 反光，不描边）。
// 界面文字用黑体，只有正文内容（日记、描述）用宋体。
export const RECORD_PAGE_SHELL_STYLE_TEXT = `
#igs-record-panel,#igs-map-panel{
  --igs-rp-bg:rgb(${IGS_UI_NIGHT_RGB});
  --igs-rp-text:${IGS_UI_INK.primary};
  --igs-rp-text-soft:${IGS_UI_INK.secondary};
  --igs-rp-text-faint:${IGS_UI_INK.tertiary};
  --igs-rp-text-ghost:${IGS_UI_INK.quaternary};
  --igs-rp-fill:${IGS_UI_FILL.rest};
  --igs-rp-pane:${IGS_UI_PANE};
  --igs-rp-pane-edge:${IGS_UI_PANE_EDGE};
  --igs-rp-reading:rgba(18,20,23,.34);
  --igs-rp-fill-hover:${IGS_UI_FILL.hover};
  --igs-rp-fill-active:${IGS_UI_FILL.active};
  --igs-rp-line-soft:rgba(236,234,230,.07);
  --igs-rp-on-ink:rgb(${IGS_UI_NIGHT_RGB});
  --igs-rp-warm:${IGS_UI_WARM};
  --igs-rp-radius-s:${IGS_UI_RADIUS.small};
  --igs-rp-radius-m:${IGS_UI_RADIUS.control};
  --igs-rp-radius-l:${IGS_UI_RADIUS.card};
  --igs-rp-blur:${IGS_UI_BLUR};
  --igs-rp-font-ui:${IGS_UI_FONT_SANS};
  --igs-rp-font-body:${IGS_UI_FONT_SERIF};
  --igs-rp-title-size:16px;
  --igs-rp-body-size:14px;
  --igs-rp-line-height:1.6;
  --igs-rp-diary-size:17px;
  --igs-rp-ease:cubic-bezier(.2,.8,.2,1);
}
#igs-overlay.igs-record-screen-open{background:transparent!important;}
#igs-record-panel .igs-rp-page,#igs-map-panel .igs-rp-page{
  position:absolute;inset:0;display:flex;flex-direction:column;
  font-family:var(--igs-rp-font-ui);color:var(--igs-rp-text);
  font-size:var(--igs-rp-body-size);line-height:var(--igs-rp-line-height);
  background:transparent;overflow:hidden;box-sizing:border-box;text-shadow:none;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
}
#igs-record-panel .igs-rp-page::before{
  content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
  background:${igsUiSurface(IGS_UI_THICKNESS.airy)};
  -webkit-backdrop-filter:${IGS_UI_BLUR_VIVID};backdrop-filter:${IGS_UI_BLUR_VIVID};
}
${igsUiLiquidRule('#igs-record-panel .igs-rp-page::after', .4)}
#igs-record-panel[data-record-category="diary"]{--igs-ui-ripple:${IGS_RIPPLE_ART.diary};}
#igs-record-panel[data-record-category="inventory"]{--igs-ui-ripple:${IGS_RIPPLE_ART.inventory};}
#igs-record-panel[data-record-category="relationships"]{--igs-ui-ripple:${IGS_RIPPLE_ART.relationships};}
${IGS_UI_LIQUID_KEYFRAMES}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  #igs-record-panel .igs-rp-page::before{background:rgba(${IGS_UI_NIGHT_RGB},.95);}
}
@media (prefers-reduced-transparency:reduce){
  #igs-record-panel .igs-rp-page::before{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(${IGS_UI_NIGHT_RGB},.97);}
}
#igs-record-panel .igs-rp-head,#igs-map-panel .igs-rp-head{
  position:relative;z-index:2;display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;
  min-height:60px;padding:8px 16px 4px;padding-top:calc(8px + env(safe-area-inset-top,0px));
  background:transparent;flex:none;
}
#igs-record-panel .igs-rp-title,#igs-map-panel .igs-rp-title{
  margin:0;justify-self:center;font-size:var(--igs-rp-title-size);font-weight:600;
  min-width:0;letter-spacing:.2em;padding-left:.2em;white-space:nowrap;color:var(--igs-rp-text);
}
#igs-record-panel .igs-rp-back,#igs-map-panel .igs-rp-back{
  justify-self:start;width:44px;height:44px;min-width:44px;min-height:44px;display:grid;place-items:center;
  padding:0;border:0;background:transparent;color:var(--igs-rp-text);cursor:pointer;border-radius:var(--igs-rp-radius-m);transition:background .18s var(--igs-rp-ease);
}
#igs-record-panel .igs-rp-back:hover,#igs-map-panel .igs-rp-back:hover{background:var(--igs-rp-fill-hover);}
#igs-record-panel .igs-rp-back svg,#igs-map-panel .igs-rp-back svg{width:20px;height:20px;stroke-width:1.6;}
#igs-record-panel .igs-rp-body,#igs-map-panel .igs-rp-body{
  position:relative;z-index:1;flex:1 1 auto;min-height:0;display:flex;overflow:hidden;
}
#igs-record-panel button:focus-visible,#igs-map-panel button:focus-visible{outline:2px solid rgba(236,234,230,.5);outline-offset:2px;}
#igs-record-panel,#igs-map-panel,#igs-record-panel *,#igs-map-panel *{scrollbar-width:none;}
#igs-record-panel ::-webkit-scrollbar,#igs-map-panel ::-webkit-scrollbar{display:none;}
#igs-record-panel .igs-rp-chip,#igs-map-panel .igs-rp-chip,#igs-record-panel .igs-rp-segment button{
  display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:6px 12px;border:0;border-radius:var(--igs-rp-radius-m);
  background:transparent;color:var(--igs-rp-text-soft);font-size:13px;font-weight:500;letter-spacing:.04em;line-height:1.2;white-space:nowrap;
  transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);
}
#igs-record-panel .igs-rp-chip:hover,#igs-map-panel .igs-rp-chip:hover,#igs-record-panel .igs-rp-segment button:hover{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
#igs-record-panel .igs-rp-chip[aria-pressed="true"],#igs-map-panel .igs-rp-chip[aria-pressed="true"],#igs-record-panel .igs-rp-segment button[aria-pressed="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);font-weight:600;}
#igs-record-panel .igs-rp-chip small{font-size:11px;font-weight:500;opacity:.56;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-rp-chip svg,#igs-map-panel .igs-rp-chip svg,#igs-record-panel .igs-rp-segment svg{width:15px;height:15px;flex:none;stroke-width:1.6;}
#igs-record-panel .igs-rp-segment{display:inline-flex;gap:2px;padding:2px;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);}
#igs-record-panel .igs-rp-segment button{min-height:30px;border-radius:calc(var(--igs-rp-radius-m) - 2px);}
#igs-record-panel .igs-rp-icon-btn{display:grid;place-items:center;width:36px;height:36px;min-width:36px;padding:0;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-record-panel .igs-rp-icon-btn:hover,#igs-record-panel .igs-rp-icon-btn[aria-expanded="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
#igs-record-panel .igs-rp-icon-btn svg{width:18px;height:18px;stroke-width:1.6;}
#igs-record-panel .igs-rp-btn,#igs-map-panel .igs-rp-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:9px 24px;border:0;border-radius:var(--igs-rp-radius-m);
  background:var(--igs-rp-text);color:var(--igs-rp-on-ink);font-size:14px;font-weight:600;letter-spacing:.14em;
  transition:opacity .18s var(--igs-rp-ease),transform .12s var(--igs-rp-ease);
}
#igs-record-panel .igs-rp-btn:hover,#igs-map-panel .igs-rp-btn:hover{opacity:.88;}
#igs-record-panel .igs-rp-btn:active,#igs-map-panel .igs-rp-btn:active,#igs-record-panel .igs-rp-chip:active,#igs-map-panel .igs-rp-chip:active,#igs-record-panel .igs-rp-icon-btn:active{transform:scale(.97);}
#igs-record-panel .igs-rp-notice,#igs-map-panel .igs-rp-notice{margin:0 0 12px;padding:8px 12px;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);font-size:13px;line-height:1.6;overflow-wrap:anywhere;}
#igs-record-panel .igs-rp-dot{display:inline-block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--igs-rp-warm);}
#igs-record-panel .igs-rp-search{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 12px;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);color:var(--igs-rp-text-faint);transition:background .18s var(--igs-rp-ease);}
#igs-record-panel .igs-rp-search:focus-within{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text-soft);}
#igs-record-panel .igs-rp-search svg{width:15px;height:15px;flex:none;stroke-width:1.6;}
#igs-record-panel .igs-rp-search input{
  flex:1;min-width:0;width:9em;height:100%;margin:0;padding:0;border:0!important;outline:0!important;border-radius:0;
  background:transparent!important;box-shadow:none!important;color:var(--igs-rp-text);font:inherit;font-size:13px;line-height:1;
  -webkit-appearance:none;appearance:none;text-shadow:none;
}
#igs-record-panel .igs-rp-search input::placeholder{color:var(--igs-rp-text-faint);}
#igs-record-panel .igs-rp-search input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;}
#igs-record-panel .igs-rp-switch{position:relative;flex:none;width:30px;height:18px;border-radius:5px;background:var(--igs-rp-fill-active);transition:background .2s var(--igs-rp-ease);}
#igs-record-panel .igs-rp-switch::after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:3px;background:var(--igs-rp-text-soft);transition:transform .2s var(--igs-rp-ease),background .2s var(--igs-rp-ease);}
#igs-record-panel [aria-pressed="true"] .igs-rp-switch{background:var(--igs-rp-text);}
#igs-record-panel [aria-pressed="true"] .igs-rp-switch::after{transform:translateX(12px);background:var(--igs-rp-on-ink);}
#igs-record-panel.igs-rp-narrow,#igs-map-panel.igs-rp-narrow{
  --igs-rp-title-size:15px;--igs-rp-line-height:1.58;
}
#igs-record-panel.igs-rp-short .igs-rp-head,#igs-map-panel.igs-rp-short .igs-rp-head{min-height:50px;padding-top:calc(4px + env(safe-area-inset-top,0px));}
@media (prefers-reduced-motion:reduce){
  #igs-record-panel *,#igs-map-panel *{transition:none!important;animation:none!important;}
}
`;
