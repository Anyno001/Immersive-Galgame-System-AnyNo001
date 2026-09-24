import { CLASSIC_DIALOG_STYLE_TEXT } from './classic-dialog-skin.js';
import { ILLUSTRATED_DIALOG_STYLE_TEXT } from './dialog-theme-skins.js';
import { GRADIENT_VEIL_STYLE_TEXT } from './gradient-veil-dialog-skin.js';
import { MAP_PANEL_STYLE_TEXT } from './map-panel-style.js';
import { RECORD_PANEL_STYLE_TEXT } from './record-panel-style.js';

export const ORIGINAL_READER_ICONS = Object.freeze({
    db: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="display:block"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>',
    prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="15 18 9 12 15 6"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="9 18 15 12 9 6"/></svg>',
    regen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    rescan: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>',
    save: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 5 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 5a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.8 1 1 .3.2.7.3 1.1.3H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
    hide: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    prevTurn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none"/><line x1="5" y1="19" x2="5" y2="5"/></svg>',
    nextTurn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
    toggleBar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:block"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    firstPage: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>',
    lastPage: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:block"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    spriteEdit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 15 22 12 19 9"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
});

export const ORIGINAL_READER_TOOLBAR_BUTTONS = Object.freeze([

    { id: 'prev-turn', title: '上一轮', html: ORIGINAL_READER_ICONS.prevTurn },
    { id: 'first-page', title: '第一页', html: ORIGINAL_READER_ICONS.firstPage },
    { id: 'prev', title: '上一页', html: ORIGINAL_READER_ICONS.prev },
    { id: 'next', title: '下一页', html: ORIGINAL_READER_ICONS.next },
    { id: 'last-page', title: '最后一页', html: ORIGINAL_READER_ICONS.lastPage },
    { id: 'next-turn', title: '下一轮', html: ORIGINAL_READER_ICONS.nextTurn },
    { id: 'regen', title: '重新生图', html: ORIGINAL_READER_ICONS.regen },
    { id: 'save', title: '保存图片', html: ORIGINAL_READER_ICONS.save },
    { id: 'hide', title: '隐藏对话框', html: ORIGINAL_READER_ICONS.hide },
    { id: 'sprite-edit', title: '调整立绘', html: ORIGINAL_READER_ICONS.spriteEdit },
    { id: 'rescan', title: '刷新', html: ORIGINAL_READER_ICONS.rescan },
    { id: 'settings', title: '设置', html: ORIGINAL_READER_ICONS.settings },
]);

const ORIGINAL_READER_STYLE_TEXT = `
#igs-overlay{position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;height:100dvh;z-index:900;background:var(--igs-empty-bg,#16181a);overflow:hidden;overscroll-behavior:none;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;color:#d8d5cf;--igs-empty-bg:#16181a;--igs-glass-fill-alpha:.62;--igs-glass-density:.62;--igs-glass-opacity:.62;--igs-transparent-glass-bg:rgba(31,34,37,.62);--igs-glass-bg:var(--igs-transparent-glass-bg);--igs-glass-border:rgba(207,204,198,.08);--igs-glass-blur:none;--igs-glass-radius:8px;--igs-glass-shadow:none;--igs-choice-soft-shadow:none;--igs-dialog-bg:var(--igs-glass-bg);--igs-dialog-border:transparent;--igs-dialog-blur:var(--igs-glass-blur);--igs-dialog-radius:8px;--igs-dialog-shadow:none;--igs-toolbar-bg:var(--igs-glass-bg);--igs-toolbar-border:var(--igs-glass-border);--igs-toolbar-blur:var(--igs-glass-blur);--igs-toolbar-radius:8px;--igs-toolbar-shadow:none;--igs-choice-bg:var(--igs-glass-bg);--igs-choice-border:rgba(207,204,198,.08);--igs-choice-blur:var(--igs-glass-blur);--igs-choice-radius:6px;--igs-choice-shadow:none;--igs-db-bg:var(--igs-glass-bg);--igs-db-border:var(--igs-glass-border);--igs-db-blur:var(--igs-glass-blur);--igs-db-head-bg:var(--igs-db-bg);--igs-db-head-blur:var(--igs-db-blur);--igs-db-radius:var(--igs-glass-radius);--igs-db-shadow:none;--igs-toolbar-h:50px;}
#igs-overlay,#igs-overlay *{scrollbar-width:none;-ms-overflow-style:none;}
#igs-overlay ::-webkit-scrollbar{display:none;width:0;height:0;}
#igs-overlay.igs-floating,#igs-overlay.igs-mode-web,#igs-overlay.igs-mode-fullscreen{z-index:2147483000;}
#igs-overlay.igs-fading{opacity:0;transition:opacity .25s;}
#igs-bg{position:absolute;inset:0;background-color:var(--igs-empty-bg,#16181a);background-position:center;background-size:cover;background-repeat:no-repeat;transition:opacity .3s ease;filter:brightness(.88);}
#igs-bg-blur{position:absolute;inset:0;background-position:center;background-size:cover;background-repeat:no-repeat;transition:opacity .3s ease;filter:blur(40px) brightness(.55) saturate(1.3);transform:scale(1.12);opacity:0;pointer-events:none;}
#igs-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.6) 0%,rgba(0,0,0,.1) 50%,rgba(0,0,0,0) 80%);pointer-events:none;}
#igs-bg:not([data-igs-has-image="1"])::after{display:none;}
#igs-overlay.igs-scene-nsfw #igs-bg::after{display:block;background:radial-gradient(ellipse at center,rgba(12,14,18,var(--igs-nsfw-veil-center,.30)) 20%,rgba(12,14,18,var(--igs-nsfw-veil-edge,.72)) 100%);}
#igs-sprite{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:40%;height:85%;background-size:100%;background-repeat:no-repeat;background-position:50% 100%;pointer-events:none;z-index:2;display:none;}
#igs-overlay.igs-mode-embedded #igs-sprite.igs-sprite-narration{filter:brightness(.86) saturate(.86)!important;-webkit-filter:brightness(.86) saturate(.86)!important;}

#igs-sprite.igs-sprite-editing{pointer-events:all;cursor:grab;outline:2px dashed rgba(255,255,255,.5);outline-offset:-2px;}
#igs-sprite.igs-sprite-editing.is-dragging{cursor:grabbing;}
#igs-dialog-layer,#igs-toolbar-layer,#igs-option-layer,#igs-db-layer{position:absolute;inset:0;pointer-events:none;}
#igs-dialog-layer{z-index:4;}
#igs-option-layer{z-index:5;}
#igs-toolbar-layer{z-index:7;inset:auto auto 24px 50%;width:min(880px,calc(100vw - 32px));height:var(--igs-dialog-h,160px);transform:translateX(-50%);}
#igs-db-layer{z-index:10;}
#igs-sprite-edit-bar{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;z-index:10;background:rgba(16,16,20,.88);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(20px);border-radius:16px;padding:8px 14px;white-space:nowrap;}
#igs-sprite-edit-bar .igs-se-hint{font-size:12px;color:rgba(255,255,255,.55);margin-right:4px;}
#igs-sprite-edit-bar button{padding:5px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;font-size:13px;cursor:pointer;font-family:inherit;}
#igs-sprite-edit-bar button:hover{background:rgba(255,255,255,.22);}
#igs-sprite-edit-bar .igs-se-save{background:rgba(92,170,255,.25);border-color:rgba(92,170,255,.5);}
#igs-click-layer{position:absolute;inset:0;cursor:pointer;z-index:3;}
#igs-status-hud{position:absolute;z-index:8;top:14px;left:14px;pointer-events:none;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;column-gap:calc(6px * var(--igs-hud-scale,1));width:calc(340px * var(--igs-hud-scale,1));padding:calc(8px * var(--igs-hud-scale,1));border-radius:calc(10px * var(--igs-hud-scale,1));box-sizing:border-box;}
#igs-status-hud.igs-hud-bg-dialog{background:color-mix(in srgb,var(--igs-dialog-bg,var(--igs-glass-bg,rgba(31,34,37,.62))) 50%,transparent);-webkit-backdrop-filter:var(--igs-dialog-blur,none);backdrop-filter:var(--igs-dialog-blur,none);border-radius:calc(6px * var(--igs-hud-scale,1));}
#igs-overlay.igs-toolbar-top #igs-status-hud{top:14px;}
#igs-overlay.igs-mode-embedded #igs-status-hud{top:14px;left:12px;width:calc(320px * var(--igs-hud-scale,1));}
#igs-status-hud.igs-hud-suppressed{opacity:0;}
#igs-status-hud .igs-hud-toggle{position:absolute;inset:0;width:100%;height:100%;align-self:center;padding:0;pointer-events:auto;border:0;background:transparent;border-radius:0;box-shadow:none;color:rgba(255,255,255,.48);cursor:pointer;}
#igs-status-hud .igs-hud-toggle:hover{background:transparent;border-color:transparent;color:rgba(255,255,255,.9);}
#igs-status-hud .igs-hud-toggle svg{display:none;width:calc(18px * var(--igs-hud-scale,1));height:calc(18px * var(--igs-hud-scale,1));transform:translateY(4.5px);}

#igs-status-hud.igs-hud-collapsed .igs-hud-identity,#igs-status-hud.igs-hud-collapsed .igs-hud-metrics,#igs-status-hud.igs-hud-collapsed .igs-hud-overflow{display:none;}
#igs-status-hud.igs-hud-collapsed .igs-hud-toggle{width:calc(36px * var(--igs-hud-scale,1));height:calc(36px * var(--igs-hud-scale,1));border:0;background:transparent;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}
#igs-status-hud.igs-hud-collapsed .igs-hud-toggle svg{display:block;}
.igs-hud-identity{display:flex;flex-direction:column;align-items:center;gap:calc(5px * var(--igs-hud-scale,1));}
.igs-hud-avatar{width:calc(46px * var(--igs-hud-scale,1));height:calc(46px * var(--igs-hud-scale,1));object-fit:cover;display:block;background:transparent;border:0;}
.igs-hud-avatar-empty{display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.42);}
.igs-hud-emotion{max-width:100%;padding:calc(2px * var(--igs-hud-scale,1)) calc(8px * var(--igs-hud-scale,1));border-radius:999px;border:0;background:rgba(255,255,255,.16);color:#e8e6e2;font-size:calc(11px * var(--igs-hud-scale,1));line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.igs-hud-location{display:flex;align-items:center;justify-content:center;gap:calc(4px * var(--igs-hud-scale,1));max-width:100%;min-width:0;}
.igs-hud-location-label{max-width:100%;color:rgba(232,230,226,.82);font-size:calc(11px * var(--igs-hud-scale,1) * var(--igs-hud-location-scale,1));line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px rgba(0,0,0,.72);}
.igs-hud-location{position:relative;top:var(--igs-hud-location-offset,0px);}

.igs-hud-metrics{display:flex;flex-direction:column;justify-content:space-evenly;align-self:stretch;min-width:0;gap:calc(4px * var(--igs-hud-scale,1));}
.igs-hud-metric{display:grid;grid-template-columns:max-content minmax(0,1fr) auto;align-items:center;gap:calc(3px * var(--igs-hud-scale,1));}
.igs-hud-metric-label{font-size:calc(11px * var(--igs-hud-scale,1));color:rgba(255,255,255,.72);white-space:nowrap;}
.igs-hud-track{position:relative;min-width:calc(72px * var(--igs-hud-scale,1));height:calc(5px * var(--igs-hud-scale,1));border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden;}
.igs-hud-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;}
.igs-hud-metric-value{width:7ch;font-size:calc(10px * var(--igs-hud-scale,1));font-weight:600;color:rgba(255,255,255,.72);text-align:left;font-variant-numeric:tabular-nums;}
.igs-hud-overflow{grid-column:2;justify-self:end;font-size:calc(10px * var(--igs-hud-scale,1));color:rgba(255,255,255,.55);}
#igs-option-bubbles{position:absolute;z-index:6;display:flex;flex-direction:column;gap:8px;max-height:60%;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none;pointer-events:auto;}
#igs-option-bubbles::-webkit-scrollbar{display:none;}
#igs-option-bubbles[hidden]{display:none;}
/* 跟随对话框宽度模式（默认）：容器与对话框同宽居中，气泡宽度按位置取 100%/50%，文字超宽才换行。 */
#igs-option-bubbles[data-igs-width="dialog"]{left:50%;transform:translateX(-50%);width:var(--igs-dialog-w,min(70%,420px));max-width:calc(100vw - 24px);}
#igs-option-bubbles[data-igs-width="dialog"][data-igs-pos="top-left"]{align-items:flex-start;}
#igs-option-bubbles[data-igs-width="dialog"][data-igs-pos="top-center"]{align-items:center;}
#igs-option-bubbles[data-igs-width="dialog"][data-igs-pos="top-right"]{align-items:flex-end;}
#igs-option-bubbles[data-igs-width="dialog"][data-igs-pos="top-center"] .igs-option-bubble{width:100%;}
#igs-option-bubbles[data-igs-width="dialog"][data-igs-pos="top-left"] .igs-option-bubble{width:50%;}
#igs-option-bubbles[data-igs-width="dialog"][data-igs-pos="top-right"] .igs-option-bubble{width:50%;}
/* 随文本宽度模式：气泡宽度跟随文字（旧行为），按位置贴左/居中/贴右。 */
#igs-option-bubbles[data-igs-width="text"]{max-width:min(70%,420px);}
#igs-option-bubbles[data-igs-width="text"][data-igs-pos="top-left"]{left:16px;align-items:flex-start;}
#igs-option-bubbles[data-igs-width="text"][data-igs-pos="top-center"]{left:50%;transform:translateX(-50%);align-items:center;}
#igs-option-bubbles[data-igs-width="text"][data-igs-pos="top-right"]{right:16px;align-items:flex-end;}
/* 纵向定位：所有位置统一吊在对话框正上方。 */
#igs-option-bubbles[data-igs-pos]{bottom:calc(24px + var(--igs-dialog-h,220px) + var(--igs-toolbar-h,50px) + 12px);}
#igs-overlay.igs-floating #igs-option-bubbles[data-igs-pos]{bottom:calc(14px + var(--igs-dialog-h,220px) + var(--igs-toolbar-h,50px) + 10px);}
/* 顶部固定工具栏：工具栏在屏幕顶端而非底部，气泡须避让顶部工具栏（加 top 下限，超出走滚动），底部不再为工具栏留空。 */
#igs-overlay.igs-toolbar-top #igs-option-bubbles[data-igs-pos]{top:calc(var(--igs-toolbar-h,50px) + 12px);bottom:calc(24px + var(--igs-dialog-h,220px) + 12px);max-height:none;}
.igs-option-bubble{pointer-events:auto;cursor:pointer;border:1px solid var(--igs-choice-border,rgba(207,204,198,.08));background:var(--igs-choice-bg,var(--igs-glass-bg,rgba(31,34,37,.62)));-webkit-backdrop-filter:var(--igs-choice-blur,none);backdrop-filter:var(--igs-choice-blur,none);border-radius:var(--igs-choice-radius,6px);padding:10px 16px;color:#d8d5cf;font-size:var(--igs-option-font-size,14px);line-height:1.5;text-shadow:none;box-shadow:none;max-width:100%;word-break:break-word;transition:border-color .15s,color .15s,transform .1s;}
.igs-option-bubble:hover{background:var(--igs-choice-bg,var(--igs-glass-bg,rgba(31,34,37,.62)));border-color:rgba(207,204,198,.16);color:#fff;}
.igs-option-bubble:active{transform:scale(.97);}
.igs-dialog{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:min(880px,calc(100vw - 32px));background:var(--igs-dialog-bg,var(--igs-glass-bg,rgba(31,34,37,.62)));border:0;-webkit-backdrop-filter:var(--igs-dialog-blur,none);backdrop-filter:var(--igs-dialog-blur,none);border-radius:var(--igs-dialog-radius,8px);box-shadow:none;padding:10px 26px 18px;z-index:4;overflow:visible;pointer-events:auto;transition:opacity .3s,transform .3s;}
.igs-dialog[data-igs-narration="1"]{padding-top:15px;}
.igs-dialog.igs-hidden{opacity:0;transform:translateX(-50%) translateY(20px);pointer-events:none;}
#igs-overlay.igs-floating #igs-click-layer{cursor:grab;touch-action:none;}
#igs-overlay.igs-floating.is-dragging #igs-click-layer{cursor:grabbing;}
#igs-overlay.igs-floating .igs-dialog{box-sizing:border-box;left:12px;right:12px;bottom:14px;width:auto;transform:translateZ(0);display:flex;flex-direction:column;max-height:none;overflow:visible;padding:7px 18px 14px;}
#igs-overlay.igs-floating .igs-dialog[data-igs-narration="1"]{padding-top:12px;}
#igs-overlay.igs-floating .igs-dialog.igs-hidden{transform:translateY(20px);}
#igs-overlay.igs-floating-mobile .igs-dialog{left:10px;right:10px;bottom:12px;max-height:none;padding:6px 14px 12px;}
#igs-overlay.igs-floating-mobile .igs-dialog[data-igs-narration="1"]{padding-top:11px;}
#igs-overlay.igs-mode-web .igs-dialog,#igs-overlay.igs-mode-fullscreen .igs-dialog{box-sizing:border-box;display:flex;flex-direction:column;max-height:none;overflow:hidden;}
#igs-overlay.igs-mode-web .igs-text,#igs-overlay.igs-mode-fullscreen .igs-text{min-height:0;overflow-y:auto;flex:1 1 auto;}
#igs-overlay.igs-mode-web .igs-progress,#igs-overlay.igs-mode-web .igs-speaker,#igs-overlay.igs-mode-web .igs-divider,#igs-overlay.igs-mode-web .igs-controls,#igs-overlay.igs-mode-fullscreen .igs-progress,#igs-overlay.igs-mode-fullscreen .igs-speaker,#igs-overlay.igs-mode-fullscreen .igs-divider,#igs-overlay.igs-mode-fullscreen .igs-controls{flex-shrink:0;}
#igs-overlay.igs-floating #igs-toolbar-layer{left:12px;right:12px;bottom:14px;width:auto;transform:none;}
#igs-overlay.igs-floating-mobile #igs-toolbar-layer{left:10px;right:10px;bottom:12px;}
.igs-ctrl-bar{position:absolute;top:-50px;right:0;display:flex;gap:6px;z-index:5;padding:6px;background:var(--igs-toolbar-bg,var(--igs-glass-bg,rgba(20,20,22,.62)));border:1px solid var(--igs-toolbar-border,rgba(255,255,255,.14));-webkit-backdrop-filter:var(--igs-toolbar-blur,none);backdrop-filter:var(--igs-toolbar-blur,none);border-radius:var(--igs-toolbar-radius,18px);box-shadow:var(--igs-toolbar-shadow,0 4px 24px rgba(0,0,0,.20));pointer-events:auto;transition:opacity .3s;}
.igs-ctrl-bar.igs-hidden{opacity:0;pointer-events:none;}
#igs-overlay.igs-toolbar-top #igs-toolbar-layer{inset:0 0 auto 0;width:auto;height:auto;transform:none;}
#igs-overlay.igs-toolbar-top .igs-ctrl-bar{position:static;top:auto;right:auto;width:100%;box-sizing:border-box;justify-content:space-between;gap:0;border-radius:0;border-left:none;border-right:none;border-top:none;box-shadow:none;flex-wrap:nowrap;}
#igs-overlay.igs-toolbar-top.igs-toolbar-expanded .igs-ctrl-bar{padding-left:56px;}
#igs-overlay.igs-toolbar-top #igs-bar-btns{flex:1 1 auto;min-width:0;justify-content:space-evenly;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;touch-action:pan-x;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
#igs-overlay.igs-toolbar-top #igs-bar-btns.igs-bar-overflow{justify-content:flex-start;cursor:grab;}
#igs-overlay.igs-toolbar-top #igs-bar-btns.igs-bar-dragging{cursor:grabbing;}
#igs-overlay.igs-toolbar-top #igs-bar-btns::-webkit-scrollbar{display:none;width:0;height:0;}
#igs-overlay.igs-toolbar-top #igs-bar-btns .igs-icon-btn{flex:0 0 auto;}
#igs-overlay.igs-toolbar-top #igs-bar-pinned{flex:0 0 auto;justify-content:flex-end;}
#igs-overlay.igs-toolbar-top .igs-ctrl-bar [data-act="close"]{flex:0 0 auto;}
.igs-icon-btn{width:36px;height:36px;border:1px solid transparent;cursor:pointer;background:transparent;color:rgba(255,255,255,.52);font-size:15px;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;transition:background .18s,border-color .18s,color .18s,transform .12s;outline:none;}
.igs-icon-btn:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.18);color:rgba(255,255,255,.96);}
.igs-icon-btn:active{transform:scale(.96);}
#igs-bar-btns{display:none;gap:6px;align-items:center;}
#igs-bar-pinned{display:flex;gap:6px;align-items:center;}
.igs-progress{font-size:11px;color:rgba(255,255,255,.55);margin-bottom:0;letter-spacing:1px;}
.igs-status-line{font-size:10px;color:rgba(255,255,255,.35);letter-spacing:1px;margin:2px 0 8px;text-align:center;display:none;}
.igs-speaker{font-size:14px;font-weight:600;letter-spacing:1px;margin-top:0;margin-bottom:4px;display:none;text-shadow:none;}
.igs-divider{font-size:11px;letter-spacing:4px;text-align:center;margin-bottom:4px;opacity:.6;display:none;}
.igs-thought{font-style:italic;opacity:.72;font-size:.98em;}
.igs-text{font-size:18px;line-height:1.7;letter-spacing:.5px;min-height:60px;color:#d8d5cf;text-shadow:none;margin-bottom:14px;margin-top:0;white-space:pre-wrap;word-break:break-word;}
.igs-controls{display:flex;align-items:center;gap:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px;}
#igs-overlay.igs-floating .igs-progress{flex-shrink:0;}
#igs-overlay.igs-floating .igs-text{min-height:0;overflow-y:auto;margin-bottom:12px;flex:1 1 auto;}
#igs-overlay.igs-floating .igs-speaker,#igs-overlay.igs-floating .igs-divider{flex-shrink:0;}
#igs-overlay.igs-floating .igs-controls{flex-shrink:0;}
.igs-input{flex:1;min-width:0;height:32px;box-sizing:border-box;padding:0 12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:14px;color:#fff;font-size:14px;line-height:18px;outline:none;font-family:inherit;}
.igs-input:focus{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3);}
.igs-input::placeholder{color:rgba(255,255,255,.4);}
.igs-send-btn{height:32px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:58px;padding:0 12px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.72);font-size:13px;line-height:18px;font-weight:600;letter-spacing:0;white-space:nowrap;cursor:pointer;}
.igs-send-btn:hover{background:rgba(255,255,255,.14);color:rgba(255,255,255,.92);}
.igs-send-btn:focus{border-color:rgba(92,170,255,.58);box-shadow:0 0 0 2px rgba(92,170,255,.18);outline:none;}
.igs-send-btn:disabled{opacity:.55;pointer-events:none;}
@keyframes igs-spin{to{transform:rotate(360deg);}}
.igs-spinner{display:inline-block;width:10px;height:10px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:igs-spin .8s linear infinite;}
.igs-image-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1;}
.igs-image-spinner{width:32px;height:32px;border-width:3px;opacity:.7;}
.igs-image-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1;font-size:13px;color:rgba(255,255,255,.4);letter-spacing:.5px;}
#igs-send-status{display:none;flex:1;align-items:center;gap:8px;padding:8px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;font-size:13px;color:rgba(255,255,255,.55);letter-spacing:.3px;}
#igs-settings{display:none;position:absolute;right:0;bottom:calc(100% + 10px);min-width:232px;background:rgba(16,16,20,.92);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(40px) saturate(180%);border-radius:18px;padding:16px 18px 14px;box-shadow:0 10px 40px rgba(0,0,0,.6);z-index:30;}
#igs-toast{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;min-width:200px;max-width:min(420px,calc(100vw - 32px));padding:10px 14px;border-radius:12px;background:rgba(16,16,20,.88);border:1px solid rgba(255,255,255,.12);font-size:12px;line-height:1.45;opacity:0;pointer-events:none;}
/* 楼层内嵌：容器固定高度、不可拖动、不锁页面滚动，全部层约束在容器内。 */
.igs-embedded-host{position:relative;display:block;width:100%;margin:8px 0;border-radius:8px;overflow:hidden;isolation:isolate;background:#16181a;}
.igs-embedded-root{position:relative;width:100%;height:100%;overflow:hidden;}
.igs-embedded-host[data-igs-embedded-loading="1"]{display:flex;align-items:center;justify-content:center;}
#igs-overlay.igs-mode-embedded{position:relative;inset:auto;width:100%;height:100%;z-index:1;border-radius:6px;}
.igs-mode-embedded .igs-progress{display:none;}
.igs-mode-embedded .igs-dialog{box-sizing:border-box;left:12px;right:12px;bottom:14px;width:auto;height:auto;min-height:0;max-height:calc(100% - 28px);transform:none;display:flex;flex-direction:column;overflow:hidden;padding:9px 18px 14px;}
.igs-mode-embedded .igs-dialog[data-igs-narration="1"]{padding-top:14px;}
.igs-mode-embedded .igs-text{min-height:0;overflow-y:auto;margin-bottom:12px;flex:1 1 auto;}
.igs-mode-embedded .igs-speaker,.igs-mode-embedded .igs-divider{flex-shrink:0;}
.igs-mode-embedded .igs-controls{display:none;}
.igs-mode-embedded #igs-toolbar-layer{inset:14px 14px auto auto;width:auto;height:auto;transform:none;}
.igs-mode-embedded .igs-ctrl-bar{position:static;top:auto;right:auto;display:flex;align-items:center;gap:1.5px;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}
.igs-mode-embedded .igs-ctrl-bar .igs-icon-btn{width:32px;height:32px;border:0;background:transparent;border-radius:0;box-shadow:none;color:rgba(255,255,255,.32);}
.igs-mode-embedded .igs-ctrl-bar .igs-icon-btn svg{width:11px;height:11px;transform:scale(1.2);transform-origin:center;}
.igs-mode-embedded .igs-ctrl-bar .igs-icon-btn:hover{background:transparent;border-color:transparent;color:rgba(255,255,255,.52);}
.igs-mode-embedded #igs-bar-btns,.igs-mode-embedded #igs-bar-pinned,#igs-overlay.igs-default-reader-chrome #igs-bar-btns,#igs-overlay.igs-default-reader-chrome #igs-bar-pinned{display:flex;align-items:center;align-self:center;height:32px;line-height:32px;}
.igs-mode-embedded #igs-bar-btns .igs-icon-btn,.igs-mode-embedded #igs-bar-pinned .igs-icon-btn,#igs-overlay.igs-default-reader-chrome #igs-bar-btns .igs-icon-btn,#igs-overlay.igs-default-reader-chrome #igs-bar-pinned .igs-icon-btn{align-self:center;vertical-align:middle;}
.igs-mode-embedded .igs-ctrl-bar>.igs-icon-btn,#igs-overlay.igs-default-reader-chrome .igs-ctrl-bar>.igs-icon-btn{align-self:center;}
#igs-overlay.igs-default-reader-chrome .igs-dialog{box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;padding:9px 18px 14px;}
#igs-overlay.igs-default-reader-chrome .igs-dialog[data-igs-narration="1"]{padding-top:14px;}
#igs-overlay.igs-default-reader-chrome #igs-toolbar-layer{inset:14px 14px auto auto;width:auto;height:auto;transform:none;}
#igs-overlay.igs-default-reader-chrome .igs-ctrl-bar{position:static;top:auto;right:auto;display:flex;align-items:center;width:auto;gap:1.5px;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}
#igs-overlay.igs-default-reader-chrome .igs-ctrl-bar .igs-icon-btn{width:32px;height:32px;border:0;background:transparent;border-radius:0;box-shadow:none;color:rgba(255,255,255,.32);}
#igs-overlay.igs-default-reader-chrome .igs-ctrl-bar .igs-icon-btn svg{width:11px;height:11px;transform:scale(1.2);transform-origin:center;}
#igs-overlay.igs-default-reader-chrome .igs-ctrl-bar .igs-icon-btn:hover{background:transparent;border-color:transparent;color:rgba(255,255,255,.52);}
.igs-mode-embedded #igs-option-bubbles[data-igs-pos]{top:calc(14px + var(--igs-toolbar-h,32px) + 8px);bottom:calc(14px + var(--igs-dialog-h,220px) + 10px);max-height:none;overflow-y:auto;overscroll-behavior:contain;}
.igs-mode-embedded #igs-option-bubbles[data-igs-width="dialog"]{max-width:calc(100% - 24px);}
.igs-embedded-host{aspect-ratio:8 / 5;max-height:760px;}
.igs-embedded-loading{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:100%;color:rgba(255,255,255,.72);font-size:13px;letter-spacing:.08em;}
.igs-embedded-loading-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35;animation:igs-embedded-pulse 1.1s ease-in-out infinite;}
.igs-embedded-loading-dot:nth-child(2){animation-delay:.18s;}
.igs-embedded-loading-dot:nth-child(3){animation-delay:.36s;}
.igs-embedded-loading-text{margin-left:6px;color:rgba(255,255,255,.5);}
@keyframes igs-embedded-pulse{0%,100%{opacity:.25}50%{opacity:.9}}
@media (max-width:640px){.igs-embedded-host{aspect-ratio:auto;height:min(74dvh,680px);}}
@media (prefers-reduced-motion: reduce){.igs-embedded-loading-dot{animation:none;opacity:.6;}}
@keyframes igs-stage-shake-weak{0%,100%{transform:translate3d(0,0,0)}25%{transform:translate3d(3px,0,0)}50%{transform:translate3d(-3px,0,0)}75%{transform:translate3d(2px,0,0)}}
@keyframes igs-stage-shake-medium{0%,100%{transform:translate3d(0,0,0)}20%{transform:translate3d(6px,0,0)}40%{transform:translate3d(-6px,0,0)}60%{transform:translate3d(4px,0,0)}80%{transform:translate3d(-2px,0,0)}}
@keyframes igs-stage-shake-strong{0%,100%{transform:translate3d(0,0,0)}16%{transform:translate3d(10px,0,0)}32%{transform:translate3d(-10px,0,0)}48%{transform:translate3d(8px,0,0)}64%{transform:translate3d(-6px,0,0)}80%{transform:translate3d(3px,0,0)}}
#igs-stage-motion{position:absolute;inset:0;transform:translate3d(0,0,0);}
#igs-stage-motion.igs-stage-shake-active[data-igs-stage-shake-intensity="weak"]{animation:igs-stage-shake-weak .18s ease-out both}
#igs-stage-motion.igs-stage-shake-active[data-igs-stage-shake-intensity="medium"]{animation:igs-stage-shake-medium .28s ease-out both}
#igs-stage-motion.igs-stage-shake-active[data-igs-stage-shake-intensity="strong"]{animation:igs-stage-shake-strong .38s ease-out both}
@media (prefers-reduced-motion: reduce){#igs-stage-motion.igs-stage-shake-active{animation:none!important;transform:none!important;}}
${MAP_PANEL_STYLE_TEXT}
${RECORD_PANEL_STYLE_TEXT}
${GRADIENT_VEIL_STYLE_TEXT}
${ILLUSTRATED_DIALOG_STYLE_TEXT}
${CLASSIC_DIALOG_STYLE_TEXT}
`.trim();

const ORIGINAL_READER_HTML = `
<div id="igs-stage-motion">
<div id="igs-bg-blur" class="igs-background-layer igs-background-blur-layer"></div>
<div id="igs-bg" class="igs-background-layer"></div>
<div id="igs-sprite" class="igs-character-layer"></div>
<div id="igs-click-layer"></div>
<div id="igs-option-layer" class="igs-choice-layer">
  <div id="igs-option-bubbles" data-igs-pos="top-left" data-igs-width="dialog" hidden></div>
</div>
<div id="igs-dialog-layer" class="igs-dialogue-layer">
<div id="igs-gradient-veil" class="igs-dialog-gradient-veil" hidden></div>
<div class="igs-dialog" id="igs-dialog">
  <div class="igs-progress" id="igs-progress"></div>
  <div class="igs-speaker" id="igs-speaker"></div>
  <div class="igs-divider" id="igs-divider"></div>
  <div class="igs-text" id="igs-text"></div>
  <div class="igs-status-line" id="igs-status-line"></div>
  <div class="igs-controls" id="igs-controls-shujuku_v120-guard">
    <div id="igs-send-status" aria-live="polite"><span class="igs-spinner"></span><span id="igs-send-status-text">已发送，等待 AI 回复…</span></div>
    <input class="igs-input" id="igs-input" type="text" placeholder="输入内容后按 Enter 发送">
    <button class="igs-send-btn" id="igs-send-btn" type="button">发送</button>
  </div>
</div>
</div>
<div id="igs-toolbar-layer" class="igs-hud-layer">
  <div class="igs-ctrl-bar igs-toolbar" id="igs-ctrl-bar" data-igs-toolbar-dock="float">
    <div id="igs-bar-btns">
      ${ORIGINAL_READER_TOOLBAR_BUTTONS.map((button) => (
        `<button class="igs-icon-btn" id="igs-btn-${button.id}" data-act="${button.id}" title="${button.title}" type="button">${button.html}</button>`
      )).join('')}
    </div>
    <div id="igs-settings" aria-hidden="true"></div>
    <div id="igs-bar-pinned"></div>
    <button class="igs-icon-btn" data-act="toggle-bar" title="收纳/展开按钮" type="button">${ORIGINAL_READER_ICONS.toggleBar}</button>
    <button class="igs-icon-btn" data-act="close" title="退出" type="button">${ORIGINAL_READER_ICONS.close}</button>
  </div>
</div>
<div id="igs-db-layer" class="igs-system-layer"></div>
<div id="igs-status-hud" hidden></div>
</div>
<div id="igs-toast" aria-live="polite"></div>
`.trim();

export const ORIGINAL_READER_REQUIRED_SELECTORS = Object.freeze([
    '#igs-overlay',
    '#igs-bg',
    '#igs-bg-blur',
    '#igs-sprite',
    '#igs-click-layer',
    '#igs-dialog-layer',
    '#igs-gradient-veil',
    '.igs-dialogue-layer',
    '#igs-toolbar-layer',
    '.igs-hud-layer',
    '#igs-option-layer',
    '.igs-choice-layer',
    '#igs-db-layer',
    '.igs-system-layer',
    '.igs-dialog',
    '.igs-ctrl-bar',
    '.igs-toolbar',
    '#igs-bar-btns',
    '#igs-settings',
    '.igs-controls',
    '#igs-send-status',
    '#igs-input',
    '#igs-send-btn',
    '#igs-toast',
]);

export const ORIGINAL_READER_STYLE_CONTRACT = Object.freeze({
    overlayZIndex: '2147483000',
    dialogWidth: 'min(880px,calc(100vw - 32px))',
    inputHeight: '32px',
    sendButtonMinWidth: '58px',
    toolbarButtonSize: '36px',
});

export function getOriginalReaderStyleText() {
    return ORIGINAL_READER_STYLE_TEXT;
}

export function getOriginalReaderHtml() {
    return ORIGINAL_READER_HTML;
}

export function getOriginalReaderSource(version = '0.5.4') {
    return {
        version,
        styleText: ORIGINAL_READER_STYLE_TEXT,
        html: ORIGINAL_READER_HTML,
        selectors: Array.from(ORIGINAL_READER_REQUIRED_SELECTORS),
        styleContract: { ...ORIGINAL_READER_STYLE_CONTRACT },
    };
}
