// 随身系统入口与悬浮窗样式（Origin 系统 原作 vicliaaa，经授权移植）。
// 版式照 IGS 资料页（record-panel-style.js）与设置器（settings-style.js）的界面语言：
// - 无描边：按钮是填充底（field），悬停换 highlight，选中项浮起一块 raised；分组靠留白，行与行之间一条 1px 淡线。
// - 字号四档：页头 16、行主文字 15、描述 14（正文宋体）、元信息 12；积分等级 22 是页头下唯一的视觉重点。
// 颜色只经 --igs-or-* 变量：
// - 基础一套：取设置器「奶油风」配色（settings-theme.js 的 cream）的 token，不另写色值；进度条用 ink-2（与方案图同为褐色），主按钮是墨色底、底色字；
// - 对话框皮肤：dialog-theme-hud.js 的 getDialogThemeOriginStyleText 只给 bg / ink / acc，其余 token 由此派生；
// - 分隔线由墨色与底色混出实色，不用半透明；
// - 不用红绿语义色：紧迫、惩罚用墨色加粗；唯一的成功色是记录页「有数据块」，兜底集中在 ORIGIN_OK 一处（设置器色板没有成功色）。
import { IGS_UI_FONT_SANS, IGS_UI_FONT_SERIF, IGS_UI_RADIUS } from '../../styles/ui-material.js';
import { getSettingsThemePalette } from './settings-theme.js';

const ORIGIN_OK = '#5f9a6e';
export const ORIGIN_BASE_THEME = 'cream';
const base = getSettingsThemePalette(ORIGIN_BASE_THEME).tokens;
// 设置器外壳投影带一条 inset 顶部高光（看起来像描边）；悬浮窗只取外投影。
const SHADOW = String(base['shell-shadow']).split(/,(?![^(]*\))/).filter((part) => !/\binset\b/.test(part)).join(',');
const LINE = '--igs-or-line:color-mix(in srgb,var(--igs-or-ink) 8%,var(--igs-or-bg));';
// 皮肤只给三色时的派生规则（与基础配色的层级关系一致：字三档、底三档）。
export const ORIGIN_DERIVED_TOKENS = '--igs-or-ink-2:color-mix(in srgb,var(--igs-or-ink) 72%,var(--igs-or-bg));--igs-or-ink-3:color-mix(in srgb,var(--igs-or-ink) 52%,var(--igs-or-bg));'
    + '--igs-or-field:color-mix(in srgb,var(--igs-or-ink) 9%,var(--igs-or-bg));--igs-or-highlight:color-mix(in srgb,var(--igs-or-ink) 15%,var(--igs-or-bg));--igs-or-raised:color-mix(in srgb,var(--igs-or-ink) 22%,var(--igs-or-bg));'
    + LINE;
const BASE_TOKENS = `--igs-or-bg:${base.panel};--igs-or-ink:${base.ink};--igs-or-ink-2:${base['ink-2']};--igs-or-ink-3:${base['ink-3']};`
    + `--igs-or-field:${base.field};--igs-or-highlight:${base.highlight};--igs-or-raised:${base.raised};${LINE}`
    + `--igs-or-acc:${base['ink-2']};--igs-or-ok:${ORIGIN_OK};--igs-or-shadow:${SHADOW};--igs-or-menu-shadow:0 8px 24px color-mix(in srgb,var(--igs-or-ink) 16%,transparent);`
    + `--igs-or-font:${IGS_UI_FONT_SANS};--igs-or-font-body:${IGS_UI_FONT_SERIF};--igs-or-r-s:${IGS_UI_RADIUS.small};--igs-or-r-m:${IGS_UI_RADIUS.control};--igs-or-r-l:${IGS_UI_RADIUS.card};`;

export const ORIGIN_PANEL_STYLE_TEXT = `
.igs-or-entry{order:3;}
.igs-or-entry-dot{position:absolute;top:-1px;right:-2px;width:9px;height:9px;border-radius:50%;background:var(--igs-entry-dot);box-shadow:0 0 0 1.5px var(--igs-entry-dot-ring);}
.igs-or-entry-dot[hidden]{display:none;}
.igs-or-win{${BASE_TOKENS}}
.igs-or-win{position:absolute;z-index:3;left:var(--igs-or-x,60px);top:var(--igs-or-y,14px);width:var(--igs-or-w,360px);height:var(--igs-or-h,540px);box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;border-radius:12px;background:var(--igs-or-bg);color:var(--igs-or-ink);font:14px/1.6 var(--igs-or-font);text-shadow:none;box-shadow:var(--igs-or-shadow);-webkit-font-smoothing:antialiased;animation:igs-or-in .22s ease both;}
.igs-or-win[data-dragging]{user-select:none;}
.igs-or-win button{font:inherit;color:inherit;border:0;cursor:pointer;}
.igs-or-top,.igs-or-tabbox{flex:none;}
.igs-or-fill{flex:1;}

.igs-or-head{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;padding:12px 10px 0;cursor:grab;touch-action:none;}
.igs-or-win[data-dragging] .igs-or-head{cursor:grabbing;}
.igs-or-head>.igs-or-hbtn{justify-self:start;}
.igs-or-name{min-width:0;font-size:16px;font-weight:700;letter-spacing:.04em;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.igs-or-hside{display:flex;justify-content:flex-end;gap:2px;}
.igs-or-hbtn{width:32px;height:32px;padding:6px;box-sizing:border-box;border-radius:var(--igs-or-r-m);background:transparent;color:var(--igs-or-ink-3);transition:background-color .14s ease,color .14s ease;}
.igs-or-hbtn:hover,.igs-or-hbtn:focus-visible,.igs-or-hbtn[aria-expanded="true"]{background:var(--igs-or-field);color:var(--igs-or-ink);outline:none;}
.igs-or-hbtn svg{display:block;width:100%;height:100%;}
.igs-or-menu{position:absolute;z-index:4;top:48px;right:10px;min-width:148px;display:flex;flex-direction:column;padding:6px 0;border-radius:12px;background:var(--igs-or-raised);box-shadow:var(--igs-or-menu-shadow);}
.igs-or-mitem{height:36px;padding:0 16px;background:transparent;font-size:14px;text-align:left;color:var(--igs-or-ink-2);transition:background-color .14s ease,color .14s ease;}
.igs-or-mitem:hover,.igs-or-mitem:focus-visible{background:var(--igs-or-field);color:var(--igs-or-ink);outline:none;}
.igs-or-mitem[data-on]{color:var(--igs-or-ink);font-weight:600;}
.igs-or-msep{display:block;height:1px;margin:4px 8px;background:var(--igs-or-line);}
.igs-or-stats{display:flex;align-items:baseline;gap:8px;padding:8px 20px 0;}
.igs-or-stat-k{font-size:12px;line-height:1.4;color:var(--igs-or-ink-3);}
.igs-or-stat-v{font-size:22px;font-weight:700;line-height:1.2;letter-spacing:.01em;font-variant-numeric:tabular-nums;}
.igs-or-stat-lv{font-size:13px;font-weight:600;color:var(--igs-or-ink-2);}
.igs-or-stats>.igs-or-bar{flex:1;align-self:center;margin-left:6px;}
.igs-or-note{padding:14px 0 4px;font-size:12px;color:var(--igs-or-ink-3);}
.igs-or-banner{display:flex;align-items:center;gap:6px;margin:14px 0 0;padding:10px 12px;border-radius:var(--igs-or-r-m);background:var(--igs-or-field);font-size:13px;line-height:1.6;color:var(--igs-or-ink-2);}
.igs-or-banner>span{flex:1;min-width:0;}
.igs-or-ok{color:var(--igs-or-ok);}

.igs-or-tabs{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;margin:14px 20px 0;padding:3px;border-radius:var(--igs-or-r-m);background:var(--igs-or-field);overflow-x:auto;scrollbar-width:none;}
.igs-or-tabs::-webkit-scrollbar{display:none;}
.igs-or-tab{height:30px;padding:0 2px;border-radius:var(--igs-or-r-s);background:transparent;font-size:12px;color:var(--igs-or-ink-3);white-space:nowrap;transition:background-color .14s ease,color .14s ease;}
.igs-or-tab:hover,.igs-or-tab:focus-visible{background:var(--igs-or-highlight);color:var(--igs-or-ink);outline:none;}
.igs-or-tab.is-on{background:var(--igs-or-raised);color:var(--igs-or-ink);font-weight:600;}

.igs-or-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px 20px 22px;scrollbar-width:none;}
.igs-or-body::-webkit-scrollbar{display:none;}
.igs-or-empty{padding:28px 0;text-align:center;font-size:13px;line-height:1.75;color:var(--igs-or-ink-3);}
.igs-or-sub{margin:20px 0 2px;font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--igs-or-ink-3);}
.igs-or-sub:first-child{margin-top:12px;}
.igs-or-ghd{position:relative;display:flex;justify-content:space-between;align-items:center;margin:18px 0 2px;}
.igs-or-ghd-k{font-size:12px;letter-spacing:.04em;color:var(--igs-or-ink-3);}
.igs-or-dd{display:inline-flex;align-items:center;gap:2px;height:28px;margin-right:-8px;padding:0 8px;border-radius:var(--igs-or-r-m);background:transparent;font-size:13px;color:var(--igs-or-ink-2);transition:background-color .14s ease;}
.igs-or-dd:hover,.igs-or-dd:focus-visible,.igs-or-dd[aria-expanded="true"]{background:var(--igs-or-field);outline:none;}
.igs-or-dd svg{display:block;width:14px;height:14px;}
.igs-or-ghd .igs-or-menu{top:32px;right:-10px;min-width:132px;}
.igs-or-center{padding:22px 0;text-align:center;font-size:13px;color:var(--igs-or-ink-3);}

.igs-or-row{padding:12px 0;}
.igs-or-row+.igs-or-row{border-top:1px solid var(--igs-or-line);}
.igs-or-row.is-open{margin:2px -10px;padding:12px 10px 14px;border-radius:var(--igs-or-r-l);background:var(--igs-or-field);}
.igs-or-row.is-open+.igs-or-row,.igs-or-row+.igs-or-row.is-open{border-top-color:transparent;}
.igs-or-row-head{display:flex;align-items:flex-start;gap:10px;}
.igs-or-row-head[data-oa]{cursor:pointer;}
.igs-or-row-head[data-oa]:focus-visible,.igs-or-hero-head:focus-visible{outline:2px solid var(--igs-or-highlight);outline-offset:4px;border-radius:var(--igs-or-r-s);}
.igs-or-row-main{flex:1;min-width:0;}
.igs-or-title{font-size:15px;font-weight:600;line-height:1.5;overflow-wrap:anywhere;}
.igs-or-line{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:2px;}
.igs-or-side{flex:none;display:flex;align-items:baseline;gap:4px;padding-top:3px;}
.igs-or-hero{margin:12px 0 4px;padding:14px 16px 16px;border-radius:var(--igs-or-r-l);background:var(--igs-or-field);}
.igs-or-hero-head{cursor:pointer;}
.igs-or-hero-top{display:flex;align-items:baseline;}
.igs-or-hero-title{margin-top:2px;font-size:18px;font-weight:700;line-height:1.45;overflow-wrap:anywhere;}
.igs-or-desc{margin-top:6px;font-family:var(--igs-or-font-body);font-size:14px;line-height:1.75;color:var(--igs-or-ink-2);overflow-wrap:anywhere;}
.igs-or-detail{margin-top:8px;font-size:13px;line-height:1.7;color:var(--igs-or-ink-2);overflow-wrap:anywhere;}
.igs-or-meta{font-size:12px;line-height:1.5;color:var(--igs-or-ink-3);font-variant-numeric:tabular-nums;}
.igs-or-meta.is-strong{font-weight:700;color:var(--igs-or-ink);}
.igs-or-num{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;}
.igs-or-prog{display:flex;align-items:center;gap:10px;margin-top:12px;}
.igs-or-prog .igs-or-bar{flex:1;}
.igs-or-kv{display:flex;gap:10px;margin-top:8px;font-size:13px;line-height:1.7;color:var(--igs-or-ink-2);overflow-wrap:anywhere;}
.igs-or-kv>.igs-or-meta{flex:none;line-height:1.7;}
.igs-or-bar{display:block;appearance:none;-webkit-appearance:none;height:4px;border:0;border-radius:2px;background:var(--igs-or-field);overflow:hidden;}
.igs-or-bar::-webkit-progress-bar{background:var(--igs-or-field);border-radius:2px;}
.igs-or-bar::-webkit-progress-value{background:var(--igs-or-acc);border-radius:2px;}
.igs-or-bar::-moz-progress-bar{background:var(--igs-or-acc);border-radius:2px;}

.igs-or-ops{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:14px;}
.igs-or-op{height:32px;padding:0 16px;border-radius:9px;background:var(--igs-or-raised);font-size:13px;color:var(--igs-or-ink-2);white-space:nowrap;transition:background-color .14s ease,color .14s ease;}
.igs-or-op:hover,.igs-or-op:focus-visible{background:var(--igs-or-highlight);color:var(--igs-or-ink);outline:none;}
.igs-or-win .igs-or-op.is-main{background:var(--igs-or-ink);color:var(--igs-or-bg);font-weight:600;}
.igs-or-win .igs-or-op.is-main:hover,.igs-or-win .igs-or-op.is-main:focus-visible{background:color-mix(in srgb,var(--igs-or-ink) 86%,var(--igs-or-bg));color:var(--igs-or-bg);}
.igs-or-tail{padding:22px 0 4px;}
.igs-or-foot{flex:none;padding:12px 20px 14px;}
.igs-or-foot[hidden]{display:none;}
.igs-or-cta{display:block;width:100%;height:42px;border-radius:12px;background:var(--igs-or-ink);font-size:14px;font-weight:600;letter-spacing:.06em;transition:background-color .14s ease;}
.igs-or-win .igs-or-cta{color:var(--igs-or-bg);}
.igs-or-cta:hover,.igs-or-cta:focus-visible{background:color-mix(in srgb,var(--igs-or-ink) 86%,var(--igs-or-bg));outline:none;}
.igs-or-links{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:2px 4px;margin-top:8px;}
.igs-or-body .igs-or-links{justify-content:flex-start;margin:6px 0 0 -8px;}
.igs-or-body .igs-or-tail .igs-or-links{justify-content:center;margin:8px 0 0;}
.igs-or-link{height:28px;padding:0 8px;border-radius:var(--igs-or-r-s);background:transparent;font-size:13px;color:var(--igs-or-ink-2);transition:background-color .14s ease,color .14s ease;}
.igs-or-link:hover,.igs-or-link:focus-visible{background:var(--igs-or-field);color:var(--igs-or-ink);outline:none;}
.igs-or-dot{font-style:normal;font-size:12px;color:var(--igs-or-ink-3);}

.igs-or-fold{margin-top:22px;}
.igs-or-fold summary{display:flex;align-items:baseline;gap:8px;padding:8px 0;font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--igs-or-ink-3);cursor:pointer;list-style:none;}
.igs-or-fold summary::-webkit-details-marker{display:none;}
.igs-or-log{display:flex;gap:8px;padding:10px 0;font-size:13px;line-height:1.7;color:var(--igs-or-ink-2);overflow-wrap:anywhere;}
.igs-or-log+.igs-or-log{border-top:1px solid var(--igs-or-line);}
.igs-or-log>.igs-or-meta{flex:none;}

.igs-or-chat{display:flex;flex-direction:column;gap:10px;padding-top:14px;}
.igs-or-turn{align-self:center;margin:6px 0 0;font-size:12px;color:var(--igs-or-ink-3);}
.igs-or-bub{max-width:84%;padding:10px 14px;border-radius:var(--igs-or-r-l);background:var(--igs-or-field);font-size:14px;line-height:1.7;overflow-wrap:anywhere;}
.igs-or-bub.is-me,.igs-or-bub.is-call{align-self:flex-end;background:var(--igs-or-raised);}
.igs-or-bub-who{display:block;margin-bottom:2px;font-size:12px;color:var(--igs-or-ink-3);}
.igs-or-bub-note{display:block;margin-top:4px;font-size:12px;color:var(--igs-or-ink-3);}
.igs-or-chatin{display:flex;gap:6px;}
.igs-or-chatin input{flex:1;min-width:0;height:36px;padding:0 12px;box-sizing:border-box;border:0;border-radius:var(--igs-or-r-m);background:var(--igs-or-field);color:inherit;font:inherit;font-size:14px;outline:none;transition:background-color .14s ease;}
.igs-or-chatin input::placeholder{color:var(--igs-or-ink-3);}
.igs-or-chatin input:focus{background:var(--igs-or-highlight);}
.igs-or-chatin .igs-or-op{height:36px;}

.igs-or-win .igs-resize-handle{color:var(--igs-or-ink-3);}
@keyframes igs-or-in{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){.igs-or-win{animation:none;}}
`.trim();
