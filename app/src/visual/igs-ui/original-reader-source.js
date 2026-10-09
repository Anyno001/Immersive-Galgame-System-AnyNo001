import { DIALOG_THEME_CHOICE_BASE_STYLE_TEXT } from './dialog-theme-choices.js';
import { GRADIENT_VEIL_STYLE_TEXT } from './gradient-veil-dialog-skin.js';
import { MAP_PANEL_STYLE_TEXT } from './map-panel-style.js';
import { BGM_NOTE_STYLE_TEXT } from './bgm-note.js';
import { MAP_LIGHT_LAYER_STYLE_TEXT } from './map-light-layers.js';
import { WEATHER_FX_STYLE_TEXT } from './weather-fx-style.js';
import { FX_STYLE_TEXT } from './fx-style.js';
import { DANMAKU_STYLE_TEXT } from './danmaku-style.js';
import { FEED_STYLE_TEXT } from './feed-style.js';
import { STORM_STYLE_TEXT } from './storm-style.js';
import { NOTIFY_CENTER_STYLE_TEXT } from './notify-center-style.js';
import { SPAM_SMS_STYLE_TEXT } from './spam-sms-style.js';
import { STAGE_DIRECTION_STYLE_TEXT } from './stage-direction-style.js';
import { STAGE_CAST_STYLE_TEXT } from './stage-cast-render.js';
import { SCENE_GRADE_STYLE_TEXT } from './scene-grade.js';
import { ROMANCE_STYLE_TEXT } from './romance-style.js';
import { INTIMATE_STYLE_TEXT } from './romance-intimate-style.js';
import { SENSES_STYLE_TEXT } from './romance-senses-style.js';
import { DREAM_STYLE_TEXT } from './romance-solo.js';
import { META_STYLE_TEXT } from './meta-style.js';
import { CG_PORTRAIT_STYLE_TEXT } from './cg-portrait.js';
import { TEXT_FX_STYLE_TEXT } from './text-fx.js';
import { BILINGUAL_STYLE_TEXT } from './bilingual-text.js';
import { DIALOG_TYPESETTING_STYLE_TEXT } from './dialog-theme-typography.js';
import { CLICK_WAIT_MARK_STYLE_TEXT } from './click-wait-mark.js';
import { DAILY_FX_STYLE_TEXT } from './fx-daily-style.js';
import { ITEM_FX_STYLE_TEXT } from './fx-item.js';
import { BATTLE_FX_STYLE_TEXT } from './fx-battle.js';
import { RESULT_FX_STYLE_TEXT } from './fx-result.js';
import { CG_GALLERY_STYLE_TEXT } from './cg-gallery-panel.js';
import { TURN_INDEX_STYLE_TEXT } from './turn-index-panel.js';
import { GENERATION_STRIP_STYLE_TEXT } from './generation-strip.js';
import { INVENTORY_IMAGE_STYLE_TEXT } from './inventory-slot-image.js';
import { ITEM_CG_ICONS } from './item-cg-icons.js';
import { ASSET_REVIEW_STYLE_TEXT } from './asset-review-panel.js';
import { RECORD_PANEL_STYLE_TEXT } from './record-panel-style.js';
import { RECORD_PAGE_SHELL_STYLE_TEXT } from './record-page-shell-style.js';
import { HTML_CARD_LAYER_STYLE_TEXT } from './html-card-layer.js';
import { CHAT_LAYER_STYLE_TEXT } from './chat-layer.js';
import { SPRITE_OUTFIT_SWAP_STYLE_TEXT } from './sprite-outfit-swap.js';
import { STAGE_PAUSE_STYLE_TEXT } from './stage-pause.js';
import { COMIC_STYLE_TEXT } from './comic-style.js';
import { MANGA_BACK_STYLE_TEXT } from './manga-back.js';
import { CROWD_STYLE_TEXT } from './crowd-fx.js';

import { SETTINGS_THEME_OPTIONS, getSettingsThemePalette } from './settings-theme.js';
import { STATUS_HUD_PHONE_MEDIA } from '../../data/shujuku/status-hud-model.js';
import {
    IGS_UI_BLUR, IGS_UI_EDGE_NIGHT, IGS_UI_ELEVATION, IGS_UI_FONT_SANS, IGS_UI_INK, IGS_UI_RADIUS, IGS_UI_THICKNESS, igsUiSurface,
} from '../../styles/ui-material.js';

// 提示弹窗兜底配色：对话框皮肤有专属主题时由 dialog-theme-hud.js 的提示弹窗规则覆盖，否则取设置器主题的面板 token。
const TOAST_THEME_STYLE_TEXT = SETTINGS_THEME_OPTIONS.map(({ value }) => {
    const { tokens } = getSettingsThemePalette(value);
    return `#igs-toast[data-igs-toast-theme="${value}"]{background:${tokens['shell-bg']};color:${tokens.ink};box-shadow:${tokens['shell-shadow']};}`;
}).join('');

export const ORIGINAL_READER_ICONS = Object.freeze({
    db: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="display:block"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>',
    prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="15 18 9 12 15 6"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="9 18 15 12 9 6"/></svg>',
    play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="m8 5 11 7-11 7z"/></svg>',
    replay: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    stop: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
    assets: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><circle cx="9" cy="7" r="3.2"/><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2"/><path d="M13 20l3.2-4.2 2 2.5 1.3-1.6L22 20z"/><path d="M18 4v5M15.5 6.5h5"/></svg>',
    // 绘制 / 重画系列：同一圆角画框与线宽。整楼 = 两层叠框 + 星芒，单张 = 单框 + 循环箭头；小尺寸只靠框内大符号区分。
    regen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M8 3h11a2 2 0 0 1 2 2v11"/><rect x="3" y="7" width="14" height="14" rx="2"/><path d="M10 9.6l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1z" fill="currentColor"/></svg>',
    clearCg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 10v6M14 10v6"/></svg>',
    clearFloorCg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 10v6M14 10v6"/><path d="M4 3h16"/></svg>',
    rerollCg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M16.5 12a4.5 4.5 0 1 1-1.32-3.18"/><path d="M16.5 6.5v3h-3"/></svg>',
    rescan: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>',
    save: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 5 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 5a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.8 1 1 .3.2.7.3 1.1.3H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
    hide: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    prevTurn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none"/><line x1="5" y1="19" x2="5" y2="5"/></svg>',
    nextTurn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
    firstTurn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
    quickSave: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M6 3.5h12v17l-6-4.5-6 4.5z"/><path d="M12 6.5v6M9.5 10l2.5 2.5 2.5-2.5"/></svg>',
    quickLoad: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M6 3.5h12v17l-6-4.5-6 4.5z"/><path d="M12 12.5v-6M9.5 9l2.5-2.5L14.5 9"/></svg>',
    toggleBar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:block"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    firstPage: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>',
    lastPage: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:block"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    spriteEdit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 15 22 12 19 9"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
});

export const ORIGINAL_READER_TOOLBAR_BUTTONS = Object.freeze([
    // group 决定工具栏分隔：nav 翻页 / create 画图与素材 / view 画面 / system 系统。
    // 按钮可被用户重排、隐藏、固定，分隔由 applyToolbarState 按实际可见顺序标记，不写死在 DOM 里。
    // title 同时是悬停提示与读屏名称：用动词短语，一眼看懂做什么。
    { id: 'first-turn', group: 'nav', title: '目录（续读、回第 0 层、跳到某楼、存档）', html: ORIGINAL_READER_ICONS.firstTurn },
    { id: 'prev-turn', group: 'nav', title: '上一轮', html: ORIGINAL_READER_ICONS.prevTurn },
    { id: 'first-page', group: 'nav', title: '第一页', html: ORIGINAL_READER_ICONS.firstPage },
    { id: 'prev', group: 'nav', title: '上一页', html: ORIGINAL_READER_ICONS.prev },
    { id: 'next', group: 'nav', title: '下一页', html: ORIGINAL_READER_ICONS.next },
    { id: 'last-page', group: 'nav', title: '最后一页', html: ORIGINAL_READER_ICONS.lastPage },
    { id: 'next-turn', group: 'nav', title: '下一轮', html: ORIGINAL_READER_ICONS.nextTurn },
    { id: 'auto-play', group: 'nav', title: '自动播放', html: ORIGINAL_READER_ICONS.play },
    { id: 'tts-replay', group: 'nav', title: '重听这句', html: ORIGINAL_READER_ICONS.replay },
    { id: 'quick-save', group: 'nav', title: '快速存档', html: ORIGINAL_READER_ICONS.quickSave },
    { id: 'quick-load', group: 'nav', title: '快速读档', html: ORIGINAL_READER_ICONS.quickLoad },
    { id: 'regen', group: 'create', title: '绘制 CG', html: ORIGINAL_READER_ICONS.regen },
    { id: 'reroll-cg', group: 'create', title: '重画这张（提示词不变，只重画当前这一张）', html: ORIGINAL_READER_ICONS.rerollCg },
    { id: 'clear-cg', group: 'create', title: '清扫当前 CG', html: ORIGINAL_READER_ICONS.clearCg },
    { id: 'clear-floor-cg', group: 'create', title: '清扫本楼（删掉本楼全部 CG 和挂载点，不重新出图）', html: ORIGINAL_READER_ICONS.clearFloorCg },
    { id: 'generate-assets', group: 'create', title: '补全立绘与背景', html: ORIGINAL_READER_ICONS.assets },
    { id: 'fill-item-images', group: 'create', title: '补全物品图', html: ITEM_CG_ICONS.fillItemImages },
    { id: 'cg-gallery', group: 'create', title: 'CG 库', html: ITEM_CG_ICONS.cgGallery },
    { id: 'save', group: 'view', title: '保存图片', html: ORIGINAL_READER_ICONS.save },
    { id: 'hide', group: 'view', title: '隐藏对话框', html: ORIGINAL_READER_ICONS.hide },
    { id: 'sprite-edit', group: 'view', title: '调整立绘', html: ORIGINAL_READER_ICONS.spriteEdit },
    { id: 'rescan', group: 'system', title: '重新加载', html: ORIGINAL_READER_ICONS.rescan },
    { id: 'settings', group: 'system', title: '设置', html: ORIGINAL_READER_ICONS.settings },
]);

// 对话框底部快捷栏：经典 galgame 文本框底部那一排。透明底、跟对话框文字同色，换皮肤自动跟随；手机居中，电脑（精确指针）靠左。
const DIALOG_BAR_STYLE_TEXT = `
#igs-dialog-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0;margin-top:4px;flex-shrink:0;pointer-events:auto;color:inherit;}
#igs-dialog-bar[hidden]{display:none!important;}
@media (hover:hover) and (pointer:fine){#igs-dialog-bar:not([data-igs-align]){justify-content:flex-start;}}
#igs-dialog-bar[data-igs-align="left"]{justify-content:flex-start;}
#igs-dialog-bar[data-igs-align="center"]{justify-content:center;}
#igs-dialog-bar[data-igs-align="right"]{justify-content:flex-end;}
#igs-dialog-bar .igs-icon-btn{width:28px;height:26px;min-width:28px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:transparent;color:inherit;opacity:.34;cursor:pointer;box-shadow:none;transition:opacity .15s,background .15s;}
#igs-dialog-bar .igs-icon-btn:hover,#igs-dialog-bar .igs-icon-btn:focus-visible{opacity:.9;background:rgba(127,127,127,.12);}
#igs-dialog-bar .igs-icon-btn:focus-visible{outline:1px solid currentColor;outline-offset:1px;}
#igs-dialog-bar .igs-icon-btn[aria-pressed="true"]{opacity:.8;}
#igs-dialog-bar .igs-icon-btn:disabled{opacity:.14;cursor:default;}
#igs-dialog-bar .igs-icon-btn svg{width:14px;height:14px;}
#igs-dialog-bar .igs-icon-btn.igs-group-start{margin-left:6px;}
.igs-mode-embedded #igs-dialog-bar{margin-top:2px;}
`;

const ORIGINAL_READER_STYLE_TEXT = `
#igs-overlay{position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;height:100dvh;z-index:900;background:var(--igs-empty-bg,#16181a);overflow:hidden;overscroll-behavior:none;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;color:#d8d5cf;--igs-empty-bg:#16181a;--igs-glass-fill-alpha:.62;--igs-glass-density:.62;--igs-glass-opacity:.62;--igs-transparent-glass-bg:rgba(31,34,37,.62);--igs-glass-bg:var(--igs-transparent-glass-bg);--igs-glass-border:rgba(207,204,198,.08);--igs-glass-blur:none;--igs-glass-radius:8px;--igs-glass-shadow:none;--igs-choice-soft-shadow:none;--igs-dialog-bg:var(--igs-glass-bg);--igs-dialog-border:transparent;--igs-dialog-blur:var(--igs-glass-blur);--igs-dialog-radius:8px;--igs-dialog-shadow:none;--igs-toolbar-bg:var(--igs-glass-bg);--igs-toolbar-border:var(--igs-glass-border);--igs-toolbar-blur:var(--igs-glass-blur);--igs-toolbar-radius:8px;--igs-toolbar-shadow:none;--igs-choice-bg:var(--igs-glass-bg);--igs-choice-border:rgba(207,204,198,.08);--igs-choice-blur:var(--igs-glass-blur);--igs-choice-radius:6px;--igs-choice-shadow:none;--igs-db-bg:var(--igs-glass-bg);--igs-db-border:var(--igs-glass-border);--igs-db-blur:var(--igs-glass-blur);--igs-db-head-bg:var(--igs-db-bg);--igs-db-head-blur:var(--igs-db-blur);--igs-db-radius:var(--igs-glass-radius);--igs-db-shadow:none;--igs-toolbar-h:50px;}
#igs-overlay,#igs-overlay *{scrollbar-width:none;-ms-overflow-style:none;}
#igs-overlay ::-webkit-scrollbar{display:none;width:0;height:0;}
#igs-overlay.igs-floating,#igs-overlay.igs-mode-web,#igs-overlay.igs-mode-fullscreen{z-index:2147483000;}
#igs-overlay.igs-fading{opacity:0;transition:opacity .25s;}
#igs-overlay.igs-cinema-bars #igs-stage-motion::before,#igs-overlay.igs-cinema-bars #igs-stage-motion::after{content:"";position:absolute;left:0;right:0;height:var(--igs-cinema-bar,10%);background:#000;z-index:1;pointer-events:none;}
#igs-overlay.igs-cinema-bars #igs-stage-motion::before{top:0;}
#igs-overlay.igs-cinema-bars #igs-stage-motion::after{bottom:0;}
#igs-overlay.igs-cinema-bars #igs-stage-motion[data-igs-cg="1"]::before,#igs-overlay.igs-cinema-bars #igs-stage-motion[data-igs-cg="1"]::after{display:none;}
#igs-bg{position:absolute;inset:0;background-color:var(--igs-empty-bg,#16181a);background-position:center;background-size:cover;background-repeat:no-repeat;transition:opacity .3s ease;filter:brightness(1);}
#igs-bg-blur{position:absolute;inset:0;background-position:center;background-size:cover;background-repeat:no-repeat;transition:opacity .3s ease;filter:blur(40px) brightness(.55) saturate(1.3);transform:scale(1.12);opacity:0;pointer-events:none;display:none;}
#igs-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.35) 0%,rgba(0,0,0,.06) 50%,rgba(0,0,0,0) 80%);pointer-events:none;}
#igs-bg:not([data-igs-has-image="1"])::after{display:none;}
#igs-overlay.igs-scene-nsfw #igs-bg::after{display:block;background:radial-gradient(ellipse at center,rgba(12,14,18,var(--igs-nsfw-veil-center,.30)) 20%,rgba(12,14,18,var(--igs-nsfw-veil-edge,.72)) 100%);}
#igs-sprite{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:40%;height:85%;background-size:100%;background-repeat:no-repeat;background-position:50% 100%;pointer-events:none;z-index:2;display:none;}
#igs-overlay.igs-mode-embedded #igs-sprite.igs-sprite-narration{filter:brightness(.86) saturate(.86) var(--igs-grade-sprite,) var(--igs-sprite-enhance,)!important;-webkit-filter:brightness(.86) saturate(.86) var(--igs-grade-sprite,) var(--igs-sprite-enhance,)!important;}

#igs-sprite.igs-sprite-editing{pointer-events:all;cursor:grab;touch-action:none;overscroll-behavior:contain;outline:2px dashed rgba(255,255,255,.5);outline-offset:-2px;}
#igs-sprite.igs-sprite-editing.is-dragging{cursor:grabbing;}
#igs-dialog-layer,#igs-toolbar-layer,#igs-option-layer,#igs-db-layer{position:absolute;inset:0;pointer-events:none;}
#igs-dialog-layer{z-index:4;}
#igs-option-layer{z-index:5;}
#igs-toolbar-layer{z-index:7;inset:auto auto 24px 50%;width:min(880px,calc(100vw - 32px));height:var(--igs-dialog-h,160px);transform:translateX(-50%);}
#igs-db-layer{z-index:10;}
#igs-sprite-edit-bar{position:absolute;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:10;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;max-width:calc(100% - 24px);padding:4px 4px 4px 14px;border:0;border-radius:18px;background:var(--igs-dialog-bg,rgba(16,16,20,.88));color:inherit;box-shadow:0 4px 14px rgba(0,0,0,.18);font-size:12px;line-height:1;}
#igs-sprite-edit-bar .igs-se-hint{margin-right:6px;opacity:.7;letter-spacing:.02em;white-space:nowrap;}
#igs-sprite-edit-bar button{height:28px;min-width:52px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;}
#igs-sprite-edit-bar button:hover{background:color-mix(in srgb,currentColor 10%,transparent);}
#igs-sprite-edit-bar .igs-se-save,#igs-sprite-edit-bar button.is-on{background:color-mix(in srgb,currentColor 14%,transparent);font-weight:600;}
#igs-sprite-edit-bar .igs-se-save:hover,#igs-sprite-edit-bar button.is-on:hover{background:color-mix(in srgb,currentColor 20%,transparent);}
.igs-head-edit-layer{position:absolute;inset:0;z-index:9;cursor:crosshair;touch-action:none;background:rgba(0,0,0,.18);}
.igs-head-marker{position:absolute;box-sizing:border-box;border:2px dashed #ffd23f;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 0 1px rgba(0,0,0,.45);pointer-events:none;}
.igs-head-marker::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#ffd23f;}
.igs-head-edit-layer .igs-fx-symbol.is-preview{animation:none;opacity:.9;pointer-events:none;}
#igs-click-layer{position:absolute;inset:0;cursor:pointer;z-index:3;}
/* 双击看全 CG：收起对话框、状态栏、工具栏、选项、立绘。背景和演出层不动。 */
#igs-overlay[data-igs-cg-only="1"] :is(#igs-dialog-layer,#igs-status-hud,#igs-toolbar-layer,#igs-option-layer,#igs-db-layer,#igs-toast,#igs-sprite,#igs-cast,#igs-sprite-edit-bar,#igs-asset-review,#igs-bg-blur,#igs-map-panel,#igs-record-panel,#igs-cg-gallery,#igs-turn-index,#igs-resume-bar){display:none!important;pointer-events:none!important;}
#igs-status-hud{position:absolute;z-index:8;top:14px;left:14px;pointer-events:none;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;column-gap:calc(6px * var(--igs-hud-scale,1));width:calc(340px * var(--igs-hud-scale,1));max-width:calc(100% - 28px);padding:calc(8px * var(--igs-hud-scale,1));border-radius:calc(10px * var(--igs-hud-scale,1));box-sizing:border-box;}
#igs-status-hud.igs-hud-bg-dialog{background:color-mix(in srgb,var(--igs-dialog-bg,var(--igs-glass-bg,rgba(31,34,37,.62))) 50%,transparent);border-radius:calc(6px * var(--igs-hud-scale,1));}
#igs-overlay.igs-toolbar-top #igs-status-hud{top:14px;}
#igs-overlay.igs-mode-embedded #igs-status-hud{top:14px;left:12px;--igs-hud-edge-x:12px;width:calc(320px * var(--igs-hud-scale,1));}
#igs-overlay #igs-status-hud[data-igs-hud-pos]{z-index:6;--igs-hud-px:var(--igs-hud-x,0);--igs-hud-py:var(--igs-hud-y,0);top:calc(14px + (100% - 28px) * var(--igs-hud-py) / 100);left:calc(var(--igs-hud-edge-x,14px) + (100% - var(--igs-hud-edge-x,14px) * 2) * var(--igs-hud-px) / 100);transform:translate(calc(var(--igs-hud-px) * -1%),calc(var(--igs-hud-py) * -1%));}
#igs-overlay #igs-status-hud[data-igs-hud-pos].igs-hud-no-metrics{width:max-content;}
#igs-overlay #igs-status-hud[data-igs-hud-pos].igs-hud-collapsed{width:calc(36px * var(--igs-hud-scale,1));height:calc(36px * var(--igs-hud-scale,1));padding:0;}
@media ${STATUS_HUD_PHONE_MEDIA}{#igs-overlay #igs-status-hud[data-igs-hud-pos]{--igs-hud-px:var(--igs-hud-mx,0);--igs-hud-py:var(--igs-hud-my,0);}}
#igs-status-hud.igs-hud-suppressed{opacity:0;}
#igs-status-hud .igs-hud-toggle{position:absolute;inset:0;width:100%;height:100%;align-self:center;padding:0;pointer-events:auto;border:0;background:transparent;border-radius:0;box-shadow:none;color:rgba(255,255,255,.48);cursor:pointer;}
#igs-status-hud .igs-hud-toggle:hover{background:transparent;border-color:transparent;color:rgba(255,255,255,.9);}
#igs-status-hud .igs-hud-toggle svg{display:none;width:calc(18px * var(--igs-hud-scale,1));height:calc(18px * var(--igs-hud-scale,1));transform:translateY(4.5px);}

#igs-status-hud.igs-hud-collapsed .igs-hud-identity,#igs-status-hud.igs-hud-collapsed .igs-hud-metrics,#igs-status-hud.igs-hud-collapsed .igs-hud-overflow{display:none;}
#igs-status-hud.igs-hud-collapsed .igs-hud-toggle{width:calc(36px * var(--igs-hud-scale,1));height:calc(36px * var(--igs-hud-scale,1));border:0;background:transparent;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}
#igs-status-hud.igs-hud-collapsed .igs-hud-toggle svg{display:block;}
.igs-hud-identity{display:flex;flex-direction:column;align-items:center;gap:calc(4px * var(--igs-hud-scale,1));}
.igs-hud-avatar{width:calc(46px * var(--igs-hud-scale,1));height:calc(46px * var(--igs-hud-scale,1));object-fit:cover;display:block;background:transparent;border:0;}
.igs-hud-avatar-empty{display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.42);}
.igs-hud-emotion{max-width:100%;padding:calc(2px * var(--igs-hud-scale,1)) calc(8px * var(--igs-hud-scale,1));border-radius:999px;border:0;background:rgba(255,255,255,.16);color:#e8e6e2;font-size:calc(11px * var(--igs-hud-scale,1));line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.igs-hud-location{display:flex;align-items:center;justify-content:center;gap:calc(4px * var(--igs-hud-scale,1));max-width:100%;min-width:0;}
.igs-hud-location-label{max-width:100%;color:rgba(232,230,226,.82);font-size:calc(11px * var(--igs-hud-scale,1) * var(--igs-hud-location-scale,1));line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px rgba(0,0,0,.72);}

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
#igs-overlay.igs-toolbar-top #igs-option-bubbles[data-igs-pos]{top:calc(var(--igs-toolbar-h,50px) + 14px + 12px);bottom:calc(24px + var(--igs-dialog-h,220px) + 12px);max-height:none;}
.igs-option-bubble{pointer-events:auto;cursor:pointer;border:1px solid var(--igs-choice-border,rgba(207,204,198,.08));background:var(--igs-choice-bg,var(--igs-glass-bg,rgba(31,34,37,.62)));-webkit-backdrop-filter:var(--igs-choice-blur,none);backdrop-filter:var(--igs-choice-blur,none);border-radius:var(--igs-choice-radius,6px);padding:10px 16px;color:#d8d5cf;font-size:var(--igs-option-font-size,14px);line-height:1.5;text-shadow:none;box-shadow:none;max-width:100%;word-break:break-word;transition:border-color .15s,color .15s,transform .1s;}
.igs-option-bubble:hover{background:var(--igs-choice-bg,var(--igs-glass-bg,rgba(31,34,37,.62)));border-color:rgba(207,204,198,.16);color:#fff;}
.igs-option-bubble:active{transform:scale(.97);}
.igs-dialog{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:min(880px,calc(100vw - 32px));background:var(--igs-dialog-bg,var(--igs-glass-bg,rgba(31,34,37,.62)));border:0;-webkit-backdrop-filter:var(--igs-dialog-blur,none);backdrop-filter:var(--igs-dialog-blur,none);border-radius:var(--igs-dialog-radius,8px);box-shadow:none;padding:10px 26px 18px;z-index:4;overflow:visible;pointer-events:auto;transition:opacity .3s,transform .3s;}
.igs-dialog[data-igs-narration="1"]{padding-top:15px;}
.igs-dialog,.igs-dialog *{-webkit-user-select:none;user-select:none;}
.igs-dialog input,.igs-dialog textarea{-webkit-user-select:text;user-select:text;}
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
.igs-ctrl-bar{position:absolute;top:-50px;right:0;display:flex;align-items:flex-start;gap:6px;z-index:5;padding:6px;background:var(--igs-toolbar-bg,var(--igs-glass-bg,rgba(20,20,22,.62)));border:1px solid var(--igs-toolbar-border,rgba(255,255,255,.14));-webkit-backdrop-filter:var(--igs-toolbar-blur,none);backdrop-filter:var(--igs-toolbar-blur,none);border-radius:var(--igs-toolbar-radius,18px);box-shadow:var(--igs-toolbar-shadow,0 4px 24px rgba(0,0,0,.20));pointer-events:auto;transition:opacity .3s;}
.igs-ctrl-bar.igs-hidden{opacity:0;pointer-events:none;}
#igs-bar-btns{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0;max-width:min(336px,calc(100vw - 112px));justify-content:flex-start;align-content:flex-start;}
/* 顶部固定栏贴右上角收成一团，不把按钮、菜单、关闭撑到屏幕两头。 */
#igs-overlay.igs-toolbar-top #igs-toolbar-layer{inset:14px 14px auto auto;width:auto;max-width:calc(100% - 28px);height:auto;transform:none;}
#igs-overlay.igs-toolbar-top .igs-ctrl-bar{position:static;top:auto;right:auto;width:auto;max-width:100%;box-sizing:border-box;justify-content:flex-end;align-items:flex-start;gap:1.5px;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;flex-wrap:nowrap;}
#igs-overlay.igs-toolbar-top #igs-bar-btns{flex:0 1 auto;min-width:0;max-width:336px;justify-content:flex-start;align-content:flex-start;flex-wrap:wrap;overflow:visible;}
#igs-overlay.igs-toolbar-top #igs-bar-btns.igs-bar-overflow{justify-content:flex-start;cursor:grab;}
#igs-overlay.igs-toolbar-top #igs-bar-btns.igs-bar-dragging{cursor:grabbing;}
#igs-overlay.igs-toolbar-top #igs-bar-btns::-webkit-scrollbar{display:none;width:0;height:0;}
#igs-overlay.igs-toolbar-top #igs-bar-btns .igs-icon-btn{flex:0 0 auto;}
#igs-overlay.igs-toolbar-top #igs-bar-pinned{flex:0 0 auto;justify-content:flex-end;}
#igs-overlay.igs-toolbar-top .igs-ctrl-bar [data-act="close"]{flex:0 0 auto;}
#igs-overlay.igs-toolbar-top .igs-ctrl-bar .igs-icon-btn{width:32px;height:32px;border:0;background:transparent;border-radius:0;box-shadow:none;color:rgba(255,255,255,.32);}
#igs-overlay.igs-toolbar-top .igs-ctrl-bar .igs-icon-btn svg{width:11px;height:11px;transform:scale(1.2);transform-origin:center;}
#igs-overlay.igs-toolbar-top .igs-ctrl-bar .igs-icon-btn:hover{background:transparent;border-color:transparent;color:rgba(255,255,255,.52);}
.igs-icon-btn{width:36px;height:36px;border:1px solid transparent;cursor:pointer;background:transparent;color:rgba(255,255,255,.52);font-size:15px;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;transition:background .18s,border-color .18s,color .18s,transform .12s;outline:none;}
.igs-icon-btn:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.18);color:rgba(255,255,255,.96);}
.igs-icon-btn:active{transform:scale(.96);}
.igs-icon-btn.igs-group-start{position:relative;margin-left:5px;}
.igs-icon-btn.igs-group-start::before{content:none;}
#igs-bar-btns{display:none;gap:6px;align-items:center;}
#igs-bar-pinned{display:flex;gap:6px;align-items:center;}
.igs-progress{display:none;font-size:11px;color:rgba(255,255,255,.55);margin-bottom:0;letter-spacing:1px;}
.igs-speaker{caret-color:transparent;font-size:14px;font-weight:600;letter-spacing:1px;margin-top:0;margin-bottom:4px;display:none;text-shadow:none;}
.igs-divider{font-size:11px;letter-spacing:4px;text-align:center;margin-bottom:4px;opacity:.6;display:none;}
.igs-thought{font-style:italic;opacity:.72;font-size:.98em;}
.igs-text{caret-color:transparent;font-size:18px;line-height:1.7;letter-spacing:.5px;min-height:60px;color:#d8d5cf;text-shadow:none;margin-bottom:14px;margin-top:0;white-space:pre-wrap;word-break:break-word;}
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
#igs-overlay.igs-awaiting-reply #igs-send-status{display:flex;}
#igs-send-status{gap:6px;}
.igs-send-status-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35;animation:igs-embedded-pulse 1.1s ease-in-out infinite;}
.igs-send-status-dot:nth-child(2){animation-delay:.18s;}
.igs-send-status-dot:nth-child(3){animation-delay:.36s;}
#igs-send-status-text{margin-left:4px;}
@media (prefers-reduced-motion: reduce){.igs-send-status-dot{animation:none;opacity:.6;}}
#igs-overlay.igs-awaiting-reply #igs-input,#igs-overlay.igs-awaiting-reply #igs-send-btn{display:none;}
#igs-settings{display:none;position:absolute;right:0;bottom:calc(100% + 10px);min-width:232px;background:rgba(16,16,20,.92);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(40px) saturate(180%);border-radius:18px;padding:16px 18px 14px;box-shadow:0 10px 40px rgba(0,0,0,.6);z-index:30;}
#igs-toast{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 64px);transform:translateX(-50%);z-index:40;display:flex;align-items:center;justify-content:center;min-width:160px;max-width:min(400px,calc(100% - 32px));min-height:38px;box-sizing:border-box;padding:8px 18px;border:0;border-radius:${IGS_UI_RADIUS.card};background:${igsUiSurface(IGS_UI_THICKNESS.thick)};-webkit-backdrop-filter:${IGS_UI_BLUR};backdrop-filter:${IGS_UI_BLUR};box-shadow:${IGS_UI_ELEVATION},${IGS_UI_EDGE_NIGHT};color:${IGS_UI_INK.primary};font-family:${IGS_UI_FONT_SANS};font-size:13px;font-weight:500;line-height:1.5;letter-spacing:.02em;text-align:center;text-shadow:none;-webkit-font-smoothing:antialiased;opacity:0;pointer-events:none;transition:opacity .2s ease;}
${TOAST_THEME_STYLE_TEXT}
#igs-toast:empty{visibility:hidden;}
/* 手机：避开刘海与顶部工具栏，窄屏下不强撑最小宽度，长文本可换行。 */
@media (max-width:640px){#igs-toast{top:calc(env(safe-area-inset-top,0px) + 56px);min-width:0;width:max-content;max-width:calc(100% - 24px);padding:8px 14px;}}
#igs-overlay.igs-floating-mobile #igs-toast{top:calc(env(safe-area-inset-top,0px) + 56px);min-width:0;width:max-content;max-width:calc(100% - 24px);padding:8px 14px;}
/* 触屏（手机、平板）：工具栏图标外观不变，可点范围上下撑到 44px，手指不用对准那 32px。 */
@media (pointer:coarse){#igs-overlay .igs-ctrl-bar .igs-icon-btn{position:relative;}#igs-overlay .igs-ctrl-bar .igs-icon-btn::after{content:"";position:absolute;left:0;right:0;top:50%;height:max(100%,44px);transform:translateY(-50%);}}
/* 楼层内嵌：容器固定高度、不可拖动、不锁页面滚动，全部层约束在容器内。 */
.igs-embedded-host{position:relative;display:block;width:100%;margin:8px 0;border-radius:8px;overflow:hidden;isolation:isolate;background:#16181a;overscroll-behavior:auto;touch-action:pan-y;}
.igs-parallel-blocks{display:block;width:100%;margin:8px 0 0;position:relative;}
.igs-embedded-root{position:relative;width:100%;height:100%;overflow:hidden;}
.igs-embedded-host[data-igs-embedded-loading="1"]{display:flex;align-items:center;justify-content:center;}
#igs-overlay.igs-mode-embedded{position:relative;inset:auto;width:100%;height:100%;z-index:1;border-radius:6px;overscroll-behavior:auto;touch-action:pan-y;}
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
.igs-mode-embedded #igs-bar-btns,.igs-mode-embedded #igs-bar-pinned,#igs-overlay.igs-default-reader-chrome:not(.igs-toolbar-top) #igs-bar-btns,#igs-overlay.igs-default-reader-chrome:not(.igs-toolbar-top) #igs-bar-pinned{display:flex;align-items:center;align-self:center;height:32px;line-height:32px;}
.igs-mode-embedded #igs-bar-btns .igs-icon-btn,.igs-mode-embedded #igs-bar-pinned .igs-icon-btn,#igs-overlay.igs-default-reader-chrome:not(.igs-toolbar-top) #igs-bar-btns .igs-icon-btn,#igs-overlay.igs-default-reader-chrome:not(.igs-toolbar-top) #igs-bar-pinned .igs-icon-btn{align-self:center;vertical-align:middle;}
.igs-mode-embedded .igs-ctrl-bar>.igs-icon-btn,#igs-overlay.igs-default-reader-chrome:not(.igs-toolbar-top) .igs-ctrl-bar>.igs-icon-btn{align-self:center;}
#igs-overlay.igs-default-reader-chrome .igs-dialog{box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;padding:9px 18px 14px;}
#igs-overlay.igs-default-reader-chrome .igs-controls{border-top:0;}
#igs-overlay.igs-default-reader-chrome .igs-input{border:0;}
#igs-overlay.igs-default-reader-chrome .igs-send-btn{border:0;box-shadow:none;}
#igs-overlay.igs-default-reader-chrome .igs-dialog[data-igs-narration="1"]{padding-top:14px;}
#igs-overlay.igs-default-reader-chrome .igs-ctrl-bar{gap:1.5px;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}
#igs-overlay.igs-default-reader-chrome .igs-ctrl-bar .igs-icon-btn{width:32px;height:32px;border:0;background:transparent;border-radius:0;box-shadow:none;color:rgba(255,255,255,.32);}
#igs-overlay.igs-default-reader-chrome .igs-ctrl-bar .igs-icon-btn svg{width:11px;height:11px;transform:scale(1.2);transform-origin:center;}
#igs-overlay.igs-default-reader-chrome .igs-ctrl-bar .igs-icon-btn:hover{background:transparent;border-color:transparent;color:rgba(255,255,255,.52);}
/* 输入区：不描边，底色是正文色的一层薄纱，文字和占位跟正文色；悬浮时用对话框底色做底板。 */
#igs-overlay .igs-controls{border-top:0;}
#igs-overlay .igs-input,#igs-overlay .igs-send-btn,#igs-overlay #igs-send-status{border:0;box-shadow:none;color:var(--igs-bar-ink,#fff);}
#igs-overlay .igs-input{border-radius:10px;background:color-mix(in srgb,var(--igs-bar-ink,#fff) 9%,transparent);}
#igs-overlay .igs-input:focus{background:color-mix(in srgb,var(--igs-bar-ink,#fff) 14%,transparent);}
#igs-overlay .igs-input::placeholder{color:color-mix(in srgb,var(--igs-bar-ink,#fff) 45%,transparent);}
#igs-overlay .igs-send-btn{border-radius:10px;background:color-mix(in srgb,var(--igs-bar-ink,#fff) 14%,transparent);}
#igs-overlay .igs-send-btn:hover{background:color-mix(in srgb,var(--igs-bar-ink,#fff) 22%,transparent);}
#igs-overlay .igs-send-btn:focus{box-shadow:none;}
#igs-overlay #igs-send-status{background:color-mix(in srgb,var(--igs-bar-ink,#fff) 7%,transparent);}
#igs-overlay[data-igs-input="float"]>.igs-controls{position:absolute;z-index:7;left:50%;transform:translateX(-50%);bottom:calc(24px + var(--igs-dialog-h,160px) + 10px);width:min(620px,calc(100% - 32px));box-sizing:border-box;padding:6px;border-radius:14px;background:color-mix(in srgb,var(--igs-bar-plate,rgb(18,18,20)) 72%,transparent);}
#igs-overlay[data-igs-input="float"]:not(.igs-toolbar-top)>.igs-controls{bottom:calc(24px + var(--igs-dialog-h,160px) + 50px);}
#igs-overlay[data-igs-input="float"][data-igs-options-on]:not(.igs-free-input)>.igs-controls{display:none!important;}
/* 工具栏统一：干净的半透明小底板，淡淡跟随皮肤（--igs-bar-plate 对话框底色、--igs-bar-ink 正文色，由渲染层写入）；单行、等大、等距，不用毛玻璃和阴影。 */
#igs-overlay #igs-ctrl-bar{display:flex;flex-wrap:nowrap;align-items:center;gap:0;padding:2px 3px;border:0;border-radius:10px;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;background:color-mix(in srgb,var(--igs-bar-plate,rgb(18,18,20)) 5%,transparent);color:var(--igs-bar-ink,#fff);}
#igs-overlay:not(.igs-toolbar-top):not(.igs-mode-embedded) #igs-ctrl-bar{top:auto;bottom:calc(100% + 8px);}
#igs-overlay #igs-ctrl-bar{align-items:flex-start;}
#igs-overlay #igs-bar-btns,#igs-overlay #igs-bar-pinned{gap:0!important;align-items:center;align-content:flex-start;height:auto;min-height:28px;}
/* 放得下就一行；放不下按整格换行，每行右对齐、同一网格，不横向滚动。 */
#igs-overlay #igs-bar-btns{flex-wrap:wrap;justify-content:flex-end;overflow:visible;max-width:calc(100vw - 120px);}
#igs-overlay.igs-toolbar-top #igs-bar-btns.igs-bar-overflow{cursor:auto;}
#igs-overlay.igs-toolbar-top #igs-bar-btns,#igs-overlay.igs-toolbar-top #igs-bar-btns.igs-bar-overflow{max-width:calc(100vw - 120px);flex-wrap:wrap;justify-content:flex-end;}
#igs-overlay #igs-bar-btns::-webkit-scrollbar{display:none;}
#igs-overlay #igs-ctrl-bar .igs-icon-btn{flex:0 0 auto;width:28px;height:28px;min-width:28px;padding:0;margin:0;border:0;border-radius:7px;background:transparent;box-shadow:none;color:inherit;opacity:.5;transition:opacity .15s,background-color .15s;}
#igs-overlay #igs-ctrl-bar .igs-icon-btn:hover,#igs-overlay #igs-ctrl-bar .igs-icon-btn:focus-visible{opacity:.95;background:transparent;}
#igs-overlay #igs-ctrl-bar .igs-icon-btn[aria-pressed="true"]{position:relative;opacity:.85;}
/* 开着的按钮下方一个小圆点（图标同色，随皮肤正文色）；::after 留给触屏放大点击区。 */
#igs-overlay #igs-ctrl-bar .igs-icon-btn[aria-pressed="true"]::before{content:"";position:absolute;left:50%;bottom:2px;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:currentColor;pointer-events:none;}
#igs-overlay #igs-ctrl-bar .igs-icon-btn:disabled{opacity:.2;}
#igs-overlay #igs-ctrl-bar .igs-icon-btn svg{width:13px;height:13px;transform:none;}
/* 分组、固定区、折叠钮与普通按钮同间距，第一排和折叠钮在同一条线上。 */
#igs-overlay #igs-ctrl-bar .igs-icon-btn.igs-group-start,#igs-overlay #igs-bar-pinned,#igs-overlay #igs-ctrl-bar>.igs-icon-btn{margin-left:0;}
#igs-overlay #igs-ctrl-bar>.igs-icon-btn{align-self:flex-start;}
#igs-overlay #igs-ctrl-bar>[data-act="toggle-bar"] svg{transition:transform .2s ease;}
#igs-overlay.igs-toolbar-expanded #igs-ctrl-bar>[data-act="toggle-bar"] svg{transform:rotate(180deg);}
/* 未展开时没有底板也没有描边；展开后是一层羽化的轻毛玻璃（5% 皮肤对话框底色、四边渐隐），底色与模糊程度都跟随对话框，不描边。 */
#igs-overlay #igs-ctrl-bar{background:transparent;isolation:isolate;}
#igs-overlay.igs-toolbar-expanded.igs-toolbar-top #igs-ctrl-bar,#igs-overlay.igs-toolbar-expanded.igs-mode-embedded #igs-ctrl-bar{position:relative;}
#igs-overlay.igs-toolbar-expanded #igs-ctrl-bar::before{content:"";position:absolute;inset:-6px -8px;z-index:-1;pointer-events:none;background:color-mix(in srgb,var(--igs-bar-plate,rgb(18,18,20)) 5%,transparent);-webkit-backdrop-filter:var(--igs-bar-blur,blur(6px));backdrop-filter:var(--igs-bar-blur,blur(6px));-webkit-mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent),linear-gradient(180deg,transparent,#000 8px,#000 calc(100% - 8px),transparent);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent),linear-gradient(180deg,transparent,#000 8px,#000 calc(100% - 8px),transparent);mask-composite:intersect;animation:igs-bar-plate-in .2s ease both;}
@keyframes igs-bar-plate-in{from{opacity:0;}to{opacity:1;}}
.igs-mode-embedded .igs-ctrl-bar,.igs-mode-embedded #igs-bar-btns,#igs-overlay.igs-default-reader-chrome:not(.igs-toolbar-top) .igs-ctrl-bar,#igs-overlay.igs-default-reader-chrome:not(.igs-toolbar-top) #igs-bar-btns{justify-content:flex-end;}
.igs-mode-embedded #igs-option-bubbles[data-igs-pos]{top:calc(14px + var(--igs-toolbar-h,32px) + 8px);bottom:calc(14px + var(--igs-dialog-h,220px) + 10px);max-height:none;overflow-y:auto;overscroll-behavior:contain;}
.igs-mode-embedded #igs-option-bubbles[data-igs-width="dialog"]{max-width:calc(100% - 24px);}
.igs-embedded-host{width:100%;min-height:220px;}
.igs-embedded-host[data-igs-frame="size"]{min-height:0;}
.igs-embedded-loading{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:100%;color:rgba(255,255,255,.72);font-size:13px;letter-spacing:.08em;}
.igs-embedded-loading-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35;animation:igs-embedded-pulse 1.1s ease-in-out infinite;}
.igs-embedded-loading-dot:nth-child(2){animation-delay:.18s;}
.igs-embedded-loading-dot:nth-child(3){animation-delay:.36s;}
.igs-embedded-loading-text{margin-left:6px;color:rgba(255,255,255,.5);}
@keyframes igs-embedded-pulse{0%,100%{opacity:.25}50%{opacity:.9}}
@media (prefers-reduced-motion: reduce){.igs-embedded-loading-dot{animation:none;opacity:.6;}}
@keyframes igs-stage-shake-weak{0%,100%{transform:translate3d(0,0,0)}25%{transform:translate3d(3px,0,0)}50%{transform:translate3d(-3px,0,0)}75%{transform:translate3d(2px,0,0)}}
@keyframes igs-stage-shake-medium{0%,100%{transform:translate3d(0,0,0)}20%{transform:translate3d(6px,0,0)}40%{transform:translate3d(-6px,0,0)}60%{transform:translate3d(4px,0,0)}80%{transform:translate3d(-2px,0,0)}}
@keyframes igs-stage-shake-strong{0%,100%{transform:translate3d(0,0,0)}16%{transform:translate3d(10px,0,0)}32%{transform:translate3d(-10px,0,0)}48%{transform:translate3d(8px,0,0)}64%{transform:translate3d(-6px,0,0)}80%{transform:translate3d(3px,0,0)}}
#igs-stage-motion{position:absolute;inset:0;transform:translate3d(0,0,0);}
#igs-stage-motion.igs-stage-shake-active[data-igs-stage-shake-intensity="weak"]{animation:igs-stage-shake-weak .18s ease-out both}
#igs-stage-motion.igs-stage-shake-active[data-igs-stage-shake-intensity="medium"]{animation:igs-stage-shake-medium .28s ease-out both}
#igs-stage-motion.igs-stage-shake-active[data-igs-stage-shake-intensity="strong"]{animation:igs-stage-shake-strong .38s ease-out both}
@media (prefers-reduced-motion: reduce){#igs-stage-motion.igs-stage-shake-active{animation:none!important;transform:none!important;}}
${WEATHER_FX_STYLE_TEXT}
${ASSET_REVIEW_STYLE_TEXT}
${MAP_PANEL_STYLE_TEXT}
${BGM_NOTE_STYLE_TEXT}
${MAP_LIGHT_LAYER_STYLE_TEXT}
${RECORD_PAGE_SHELL_STYLE_TEXT}
${RECORD_PANEL_STYLE_TEXT}
${GRADIENT_VEIL_STYLE_TEXT}
${DIALOG_THEME_CHOICE_BASE_STYLE_TEXT}
${HTML_CARD_LAYER_STYLE_TEXT}
${CHAT_LAYER_STYLE_TEXT}
${SPRITE_OUTFIT_SWAP_STYLE_TEXT}
${FX_STYLE_TEXT}
${STAGE_DIRECTION_STYLE_TEXT}
${STAGE_CAST_STYLE_TEXT}
${SCENE_GRADE_STYLE_TEXT}
${ROMANCE_STYLE_TEXT}
${INTIMATE_STYLE_TEXT}
${SENSES_STYLE_TEXT}
${DREAM_STYLE_TEXT}
${META_STYLE_TEXT}
${CG_PORTRAIT_STYLE_TEXT}
${DIALOG_TYPESETTING_STYLE_TEXT}
${TEXT_FX_STYLE_TEXT}
${BILINGUAL_STYLE_TEXT}
${CLICK_WAIT_MARK_STYLE_TEXT}
${DAILY_FX_STYLE_TEXT}
${ITEM_FX_STYLE_TEXT}
${BATTLE_FX_STYLE_TEXT}
${RESULT_FX_STYLE_TEXT}
${DANMAKU_STYLE_TEXT}
${FEED_STYLE_TEXT}
${STORM_STYLE_TEXT}
${NOTIFY_CENTER_STYLE_TEXT}
${SPAM_SMS_STYLE_TEXT}
${COMIC_STYLE_TEXT}
${MANGA_BACK_STYLE_TEXT}
${CROWD_STYLE_TEXT}
${CG_GALLERY_STYLE_TEXT}
${TURN_INDEX_STYLE_TEXT}
${DIALOG_BAR_STYLE_TEXT}
${GENERATION_STRIP_STYLE_TEXT}
${INVENTORY_IMAGE_STYLE_TEXT}
${STAGE_PAUSE_STYLE_TEXT}
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
  <div class="igs-controls" id="igs-controls-shujuku_v120-guard">
    <div id="igs-send-status" aria-live="polite"><span class="igs-send-status-dot"></span><span class="igs-send-status-dot"></span><span class="igs-send-status-dot"></span><span id="igs-send-status-text">正在生成…</span></div>
    <input class="igs-input" id="igs-input" type="text" placeholder="输入内容后按 Enter 发送">
    <button class="igs-send-btn" id="igs-send-btn" type="button">发送</button>
  </div>
  <div id="igs-dialog-bar" class="igs-dialog-bar" role="toolbar" aria-label="快捷操作" hidden></div>
</div>
</div>
<div id="igs-toolbar-layer" class="igs-hud-layer">
  <div class="igs-ctrl-bar igs-toolbar" id="igs-ctrl-bar" data-igs-toolbar-dock="float">
    <div id="igs-bar-btns">
      ${ORIGINAL_READER_TOOLBAR_BUTTONS.map((button) => (
        `<button class="igs-icon-btn" id="igs-btn-${button.id}" data-act="${button.id}" title="${button.title}" aria-label="${button.title}" type="button">${button.html}</button>`
      )).join('')}
    </div>
    <div id="igs-settings" aria-hidden="true"></div>
    <div id="igs-bar-pinned"></div>
    <button class="igs-icon-btn" data-act="toggle-bar" title="收起/展开工具栏" type="button">${ORIGINAL_READER_ICONS.toggleBar}</button>
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
