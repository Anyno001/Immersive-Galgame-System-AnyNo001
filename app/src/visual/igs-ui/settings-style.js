import {
    IGS_UI_BLUR, IGS_UI_FONT_SANS, IGS_UI_LIQUID_KEYFRAMES, IGS_UI_RADIUS, igsUiLiquidRule,
} from '../../styles/ui-material.js';
import { SETTINGS_THEME_BASE, SETTINGS_THEME_OPTIONS, getSettingsThemePalette, settingsThemeVars } from './settings-theme.js';

const BASE = getSettingsThemePalette(SETTINGS_THEME_BASE);
const THEMED = SETTINGS_THEME_OPTIONS.filter((option) => option.value !== SETTINGS_THEME_BASE).map((option) => [option.value, getSettingsThemePalette(option.value)]);
const themeSelector = (value) => `#igs-unified-settings[data-igs-settings-theme="${value}"]`;

// 四套设置器配色共用同一材质：遮罩层做唯一一层模糊，面板保留厚材质，
// 面板内控件使用参考主题的语义 token；不支持模糊或减少透明度时回退为实心。
// 遮罩底色贴近面板本身，只靠阴影分层；水波纹用该主题高亮色的高饱和版本，淡而不灰。
const SETTINGS_STYLE_TEXT = `
#igs-unified-settings{${settingsThemeVars(SETTINGS_THEME_BASE)}--igs-settings-vleft:0px;--igs-settings-vtop:0px;--igs-settings-vw:100vw;--igs-settings-vh:100dvh;--igs-settings-width:min(760px,calc(var(--igs-settings-vw) - 48px));--igs-settings-height:min(760px,calc(var(--igs-settings-vh) - 48px));position:fixed;left:var(--igs-settings-vleft);top:var(--igs-settings-vtop);width:var(--igs-settings-vw);height:var(--igs-settings-vh);z-index:2147483200;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;overflow:hidden;background:${BASE.backdrop};font-family:${IGS_UI_FONT_SANS};-webkit-font-smoothing:antialiased;color:var(--igs-settings-ink);color-scheme:${BASE.scheme};-webkit-backdrop-filter:${IGS_UI_BLUR};backdrop-filter:${IGS_UI_BLUR}}
${THEMED.map(([value, palette]) => `${themeSelector(value)}{${settingsThemeVars(value)}background:${palette.backdrop};color-scheme:${palette.scheme}}`).join('\n')}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#igs-unified-settings{background:${BASE.backdropSolid}}${THEMED.map(([value, palette]) => `${themeSelector(value)}{background:${palette.backdropSolid}}`).join('')}}
@media (prefers-reduced-transparency:reduce){#igs-unified-settings{-webkit-backdrop-filter:none;backdrop-filter:none;background:${BASE.backdropSolid};--igs-settings-shell-bg:${BASE.shellSolid}}${THEMED.map(([value, palette]) => `${themeSelector(value)}{background:${palette.backdropSolid};--igs-settings-shell-bg:${palette.shellSolid}}`).join('')}}
#igs-unified-settings{--igs-settings-radius-shell:${IGS_UI_RADIUS.card};--igs-settings-radius-control:${IGS_UI_RADIUS.control};--igs-settings-radius-small:${IGS_UI_RADIUS.small}}
#igs-unified-settings,#igs-unified-settings *{box-shadow:none;filter:none}
#igs-unified-settings,#igs-unified-settings *{scrollbar-width:none;-ms-overflow-style:none}
#igs-unified-settings ::-webkit-scrollbar{display:none;width:0;height:0}
.igs-settings-shell{width:var(--igs-settings-width);height:var(--igs-settings-height);max-height:none;background:var(--igs-settings-shell-bg);border:0;border-radius:var(--igs-settings-radius-shell);box-shadow:none;display:flex;flex-direction:column;overflow:hidden;-webkit-backdrop-filter:none;backdrop-filter:none}
#igs-unified-settings .igs-settings-shell{position:relative;z-index:1;box-shadow:var(--igs-settings-shell-shadow)}
#igs-unified-settings{--igs-ui-caustic-size:900px}
${igsUiLiquidRule('#igs-unified-settings::before', .2, { tile: true, tint: 'var(--igs-settings-ripple)' })}
${THEMED.map(([value, palette]) => `${themeSelector(value)}::before{opacity:${palette.ripple}}`).join('\n')}
${IGS_UI_LIQUID_KEYFRAMES}
.igs-settings-head{height:54px;display:flex;align-items:center;gap:10px;padding:0 14px 0 20px;flex-shrink:0}
.igs-settings-title{font-size:15px;font-weight:600;letter-spacing:.08em;flex:0 0 auto;color:var(--igs-settings-ink)}
.igs-settings-head-spacer{flex:1}
.igs-settings-badge{font-family:ui-monospace,Consolas,monospace;font-size:10px;color:var(--igs-settings-ink-4);border:0;border-radius:0;padding:3px 0;letter-spacing:.04em}
.igs-settings-theme-switch{display:inline-flex;align-items:center;gap:5px;margin-left:2px;padding:4px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-field)}
.igs-settings-theme-option{position:relative;width:20px;height:20px;flex:0 0 auto;display:inline-flex;padding:0;border:0;border-radius:var(--igs-settings-radius-small);background:transparent;cursor:pointer;outline:1.5px solid transparent;outline-offset:1.5px;transition:transform .14s ease,outline-color .14s ease}
.igs-settings-theme-option svg{display:block;width:20px;height:20px}
.igs-settings-theme-option:hover,.igs-settings-theme-option:focus-visible{transform:translateY(-1px)}
.igs-settings-theme-option.is-active{outline-color:var(--igs-settings-accent)}
.igs-settings-close,.igs-settings-action{border:0;background:var(--igs-settings-field);color:var(--igs-settings-ink-2);border-radius:var(--igs-settings-radius-control);height:34px;padding:0 12px;font:inherit;font-size:12px;letter-spacing:.04em;cursor:pointer;transition:background-color .14s ease,color .14s ease}
.igs-settings-close{width:34px;padding:0;font-size:18px;letter-spacing:0}
.igs-settings-close:hover,.igs-settings-close:focus-visible,.igs-settings-action:hover,.igs-settings-action:focus-visible{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent);outline:none}
.igs-settings-danger{color:var(--igs-settings-danger);background:transparent}
.igs-settings-danger:hover,.igs-settings-danger:focus-visible{background:var(--igs-settings-danger);color:var(--igs-settings-on-accent)}
.igs-settings-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;margin:2px 20px 6px;padding:3px;overflow-x:auto;flex-shrink:0;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-settings-tab{box-sizing:border-box;width:100%;border:0;background:transparent;color:var(--igs-settings-ink-3);padding:7px 4px;border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;text-align:center;white-space:nowrap;cursor:pointer;transition:background-color .14s ease,color .14s ease}
.igs-settings-tab:hover,.igs-settings-tab:focus-visible{background:var(--igs-settings-field);color:var(--igs-settings-ink);outline:none}
.igs-settings-tab.is-active{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600;box-shadow:none}
.igs-scene-subtabs{display:flex;gap:2px;margin:0;padding:3px;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-scene-subtab{flex:1;border:0;background:transparent;color:var(--igs-settings-ink-3);padding:7px 10px;border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.igs-scene-subtab:hover,.igs-scene-subtab:focus-visible{color:var(--igs-settings-ink);outline:none}
.igs-scene-subtab.is-active{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600;box-shadow:none}
.igs-scene-settings{min-width:0}
.igs-scene-settings-subtabs{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;margin:0 0 12px;padding:3px;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-scene-settings-subtab{height:32px;min-width:0;border:0;background:transparent;color:var(--igs-settings-ink-3);border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;transition:background-color .14s ease,color .14s ease}
.igs-scene-settings-subtab:hover,.igs-scene-settings-subtab:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-scene-settings-subtab.is-active{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600;box-shadow:none}
.igs-scene-settings-subpane{min-width:0}
.igs-reader-settings{min-width:0}
.igs-reader-subtabs{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;margin:0 0 12px;padding:3px;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-reader-subtab{height:32px;min-width:0;border:0;background:transparent;color:var(--igs-settings-ink-3);border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;transition:background-color .14s ease,color .14s ease}
.igs-reader-subtab:hover,.igs-reader-subtab:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-reader-subtab.is-active{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600;box-shadow:none}
.igs-reader-subpane{min-width:0}
.igs-image-settings{min-width:0}
.igs-image-subtabs{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;margin:0 0 12px;padding:3px;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-image-subtab{height:32px;border:0;border-radius:var(--igs-settings-radius-small);background:transparent;color:var(--igs-settings-ink-3);font:inherit;font-size:12px;cursor:pointer}
.igs-image-subtab.is-active{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600}
.igs-image-subtab:hover,.igs-image-subtab:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-image-subpane{min-width:0}
#igs-unified-settings [hidden]{display:none!important}
.igs-settings-body{flex:1;min-height:0;overflow-y:auto;padding:12px 20px 24px;background:transparent}
.igs-settings-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 14px;min-width:0}
.igs-settings-section{display:flex;flex-direction:column;gap:10px;min-width:0}
.igs-settings-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.igs-settings-sub{display:flex;flex-direction:column;gap:12px;min-width:0;margin-left:6px;padding:2px 0 2px 14px;border-left:2px solid var(--igs-settings-highlight)}
.igs-settings-group{display:flex;flex-direction:column;gap:8px;min-width:0}
.igs-settings-group+.igs-settings-group{padding-top:12px;border-top:1px solid var(--igs-settings-line)}
.igs-settings-subhead{font-size:12px;line-height:18px;font-weight:500;color:var(--igs-settings-ink-2)}
.igs-settings-field{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:12px;color:var(--igs-settings-ink-3)}
.igs-settings-field em{font-style:normal;font-size:11px;color:var(--igs-settings-ink-4);line-height:1.5}
.igs-status-hud-tables{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.igs-status-hud-tables>em{display:block;flex-basis:100%;margin-top:2px}
.igs-table-pick{min-width:0;max-width:100%;height:32px;display:inline-flex;align-items:center;gap:7px;padding:0 9px;border:0;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field);color:var(--igs-settings-ink-2);font:inherit;font-size:12px;cursor:pointer}
.igs-table-pick>i{width:12px;height:12px;box-sizing:border-box;border:1px solid var(--igs-settings-line-strong);border-radius:var(--igs-settings-radius-small);background:transparent;flex-shrink:0}
.igs-table-pick>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.igs-table-pick:hover,.igs-table-pick:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-table-pick.is-on{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent)}
.igs-table-pick.is-on>i{border-color:var(--igs-settings-on-accent);background:var(--igs-settings-on-accent)}
.igs-table-pick.is-missing{opacity:.66}
.igs-settings-field input,.igs-settings-field select,.igs-settings-field textarea{width:100%;box-sizing:border-box;border:0;border-bottom:1px solid transparent;background:var(--igs-settings-field);color:var(--igs-settings-ink);border-radius:var(--igs-settings-radius-control);padding:8px 10px;font:inherit;font-size:13px;line-height:1.5;outline:none;transition:background-color .14s ease,border-color .14s ease}
.igs-settings-range{display:flex;align-items:center;gap:10px;min-width:0;width:100%}
.igs-settings-field .igs-settings-range input[type="range"]{min-width:0;flex:1;height:36px;padding:0 8px;cursor:pointer;accent-color:var(--igs-settings-accent)}.igs-settings-range output{flex:none;min-width:3.5em;text-align:right;color:var(--igs-settings-ink-2);font-size:12px}
.igs-settings-field option{background:var(--igs-settings-panel);color:var(--igs-settings-ink)}
.igs-settings-field input[type="color"]{width:42px;height:36px;padding:3px;border-radius:var(--igs-settings-radius-small);cursor:pointer}
.igs-settings-field input[type="color"]::-webkit-color-swatch-wrapper{padding:0}
.igs-settings-field input[type="color"]::-webkit-color-swatch{border:0;border-radius:var(--igs-settings-radius-small)}
.igs-scene-preset-select{box-sizing:border-box;border:0;border-bottom:1px solid transparent;background:var(--igs-settings-field);color:var(--igs-settings-ink);border-radius:var(--igs-settings-radius-control);padding:8px 10px;font:inherit;font-size:13px;outline:none;height:38px}
.igs-scene-preset-select:focus{border-bottom-color:var(--igs-settings-line-strong);background:var(--igs-settings-highlight)}
.igs-settings-field textarea{min-height:132px;resize:vertical;line-height:1.55;font-family:ui-monospace,Consolas,monospace}
.igs-settings-field input:focus,.igs-settings-field select:focus,.igs-settings-field textarea:focus{border-bottom-color:var(--igs-settings-line-strong);background:var(--igs-settings-highlight)}
.igs-settings-api-group{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 14px;min-width:0}
.igs-settings-field input:disabled,.igs-settings-field select:disabled,.igs-settings-field textarea:disabled{opacity:.5;cursor:not-allowed}
.igs-settings-secret{display:flex;align-items:center;gap:8px}
.igs-settings-secret input{flex:1;min-width:0}
.igs-settings-secret-toggle{height:36px;min-width:52px;border:0;background:var(--igs-settings-field);color:var(--igs-settings-ink-3);border-radius:var(--igs-settings-radius-control);font:inherit;font-size:12px;cursor:pointer}
.igs-settings-secret-toggle:hover,.igs-settings-secret-toggle:focus-visible{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent);outline:none}
.igs-settings-model{display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:8px;width:100%;align-items:center}
.igs-settings-model-row{display:contents}
.igs-settings-model input{height:36px;min-width:0}
.igs-settings-model select{grid-column:1/-1;height:36px}
.igs-settings-model select:disabled{opacity:.55;cursor:not-allowed}
.igs-settings-inline-action{width:96px;height:36px;padding:0 10px;white-space:nowrap}
.igs-settings-action.is-active,.igs-settings-inline-action.is-active{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent);box-shadow:none}
.igs-settings-action[disabled],.igs-settings-inline-action[disabled]{opacity:.55;cursor:not-allowed;pointer-events:none}
.igs-segmented-field .igs-settings-field{width:100%}
.igs-segmented{--igs-segment-pad:clamp(0px,calc(2cqi - 5px),6px);--igs-segment-gap:clamp(0px,calc(1.5cqi - 4px),5px);--igs-segment-font:clamp(9px,calc(5px + 1.5cqi),12px);--igs-segment-icon:clamp(8px,calc(3px + 2cqi),15px);container-type:inline-size;height:40px;display:grid;grid-template-columns:repeat(var(--igs-segment-count,3),minmax(0,1fr));align-items:center;gap:2px;padding:4px;box-sizing:border-box;border:0;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control);position:relative;overflow:hidden}
.igs-segmented-indicator{display:none}
.igs-segmented-btn{box-sizing:border-box;width:100%;height:32px;min-width:0;margin:0;padding:0 var(--igs-segment-pad);position:relative;z-index:1;border:0;border-radius:var(--igs-settings-radius-small);background:transparent;color:var(--igs-settings-ink-3);font:inherit;font-size:var(--igs-segment-font);line-height:18px;font-weight:500;letter-spacing:0;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:var(--igs-segment-gap);overflow:hidden;transition:background-color .14s ease,color .14s ease}
.igs-segmented-btn-icon{width:var(--igs-segment-icon);height:var(--igs-segment-icon);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:currentColor}
.igs-segmented-btn-icon svg{width:100%;height:100%;display:block}
.igs-segmented-btn-label{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.igs-segmented-btn:hover{background:var(--igs-settings-highlight);color:var(--igs-settings-ink)}
.igs-segmented-btn:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-segmented-btn.is-active{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600;text-shadow:none}
.igs-switch{height:38px;display:flex;align-items:center;gap:10px;border:0;background:var(--igs-settings-field);color:var(--igs-settings-ink-2);border-radius:var(--igs-settings-radius-control);padding:0 12px;cursor:pointer;text-align:left;font:inherit;font-size:13px;transition:background-color .14s ease,color .14s ease}
.igs-switch:hover,.igs-switch:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-switch i{width:30px;height:18px;border-radius:5px;transition:background-color .18s ease;background:var(--igs-settings-line-strong);position:relative;flex-shrink:0}
.igs-switch i:after{content:"";position:absolute;width:14px;height:14px;top:2px;left:2px;border-radius:3px;transition:left .18s ease;background:var(--igs-settings-knob)}
.igs-switch.is-on{color:var(--igs-settings-ink);background:var(--igs-settings-highlight)}
.igs-switch.is-on i{background:var(--igs-settings-accent)}
.igs-switch.is-on i:after{left:14px;background:var(--igs-settings-on-accent)}
.igs-source-filter{grid-column:1/-1;padding:14px 16px 16px;border:0;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-surface);display:flex;flex-direction:column;gap:14px;min-width:0;max-width:100%;box-sizing:border-box}
.igs-source-filter-title{font-size:13px;line-height:20px;font-weight:600;letter-spacing:.04em;color:var(--igs-settings-ink)}
.igs-source-filter-note{font-size:11px;line-height:16px;font-weight:400;color:var(--igs-settings-ink-4);overflow-wrap:anywhere}
.igs-source-filter-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 14px;min-width:0;align-items:end}
.igs-settings-grid[data-reader-pane="dialog"] .igs-gradient-veil-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px;min-width:0}
.igs-scene-preset-bar{display:flex;align-items:center;gap:6px;min-width:0}
.igs-scene-preset-bar .igs-scene-preset-select{flex:1;min-width:0}
.igs-source-filter textarea{min-height:76px}
.igs-body-format textarea[data-path="bridge.virtualRegex.replacement"]{min-height:132px}
.igs-settings-row{display:flex;gap:10px;align-items:center;min-width:0}
.igs-settings-row > *{flex:1;min-width:0}
.igs-settings-result{font-size:12px;color:var(--igs-settings-ink-3);line-height:1.5}
.igs-settings-result:empty,.igs-settings-preview:empty{display:none}
.igs-settings-result.is-ok{color:var(--igs-settings-ink-2)}
.igs-settings-result.is-error{color:var(--igs-settings-danger)}
.igs-settings-full{grid-column:1/-1}
.igs-settings-preview{white-space:pre-wrap;max-height:220px;overflow:auto;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.55;border:0;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-paper);padding:12px;color:var(--igs-settings-ink-2)}
.igs-btn-mgr-list{display:flex;flex-direction:column;gap:0;border:0;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-paper);padding:4px 6px;overflow:hidden}
.igs-btn-mgr-row{display:flex;align-items:center;gap:8px;height:36px;min-width:0;max-width:100%;box-sizing:border-box;padding:0 8px;border-radius:0;border-bottom:1px solid var(--igs-settings-line);transition:background-color .14s ease}
.igs-btn-mgr-row:last-child{border-bottom:0}
.igs-btn-mgr-row:hover{background:var(--igs-settings-highlight)}
.igs-btn-mgr-row.is-hidden-btn{opacity:.45}
.igs-btn-mgr-handle{cursor:pointer;color:var(--igs-settings-ink-4);font-size:14px;user-select:none;width:18px;text-align:center;flex-shrink:0}
.igs-btn-mgr-handle:hover{color:var(--igs-settings-ink)}
.igs-btn-mgr-handle:active{color:var(--igs-settings-accent)}
.igs-btn-mgr-label{flex:1;font-size:12px;color:var(--igs-settings-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.igs-btn-mgr-icon{border:0;background:transparent;color:var(--igs-settings-ink-4);cursor:pointer;padding:4px;border-radius:var(--igs-settings-radius-small);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:color .14s ease,background-color .14s ease}
.igs-btn-mgr-icon:hover,.igs-btn-mgr-icon:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-btn-mgr-icon.is-on{color:var(--igs-settings-accent)}
.igs-btn-mgr-icon.is-on:hover{color:var(--igs-settings-on-accent);background:var(--igs-settings-accent)}
.igs-scene-url-input{flex:1;min-width:0;height:28px;border:0;border-bottom:1px solid transparent;background:var(--igs-settings-field);color:var(--igs-settings-ink);border-radius:var(--igs-settings-radius-control);padding:0 8px;font:inherit;font-size:11px;outline:none}
.igs-scene-url-input:focus{border-bottom-color:var(--igs-settings-line-strong);background:var(--igs-settings-highlight)}
.igs-scene-char-group{min-width:0;max-width:100%;box-sizing:border-box;margin-bottom:8px;border:0;border-bottom:1px solid var(--igs-settings-line);border-radius:0;padding:4px;background:transparent}
.igs-scene-time-group{margin-left:16px;max-width:calc(100% - 16px)}
.igs-scene-weather-row{margin-left:32px;max-width:calc(100% - 32px)}
.igs-scene-char-group:last-child{border-bottom:0}
.igs-scene-empty{font-size:11px;color:var(--igs-settings-ink-4);padding:8px;text-align:center}
.igs-mood-word-list{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:2px 0}
.igs-mood-word-tag{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 6px;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-highlight);border:0;color:var(--igs-settings-ink-2)}
.igs-mood-word-del{border:0;background:transparent;color:var(--igs-settings-ink-3);cursor:pointer;font-size:14px;line-height:1;padding:0}
.igs-mood-word-del:hover{color:var(--igs-settings-danger)}
.igs-sprite-slot{min-width:0;max-width:100%;border-bottom:1px solid var(--igs-settings-line)}
.igs-sprite-slot:last-child{border-bottom:0}
.igs-sprite-slot-body{display:flex;gap:10px;min-width:0;max-width:100%;box-sizing:border-box;padding:6px 4px 10px;align-items:flex-start}
.igs-sprite-thumb{width:72px;height:72px;flex-shrink:0;object-fit:contain;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-paper);border:0;cursor:zoom-in}
.igs-sprite-thumb-empty{display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--igs-settings-ink-4);cursor:default}
.igs-sprite-thumb-broken{position:relative}
 .igs-status-avatar-row{justify-content:flex-start;gap:8px}
 .igs-status-avatar-row .igs-btn-mgr-label{flex:0 0 auto}
 .igs-status-avatar-thumb{width:28px;height:28px;flex-shrink:0;border-radius:50%;object-fit:cover;background:var(--igs-settings-paper);overflow:hidden}
 .igs-status-avatar-empty{display:inline-flex;align-items:center;justify-content:center;padding:3px;color:var(--igs-settings-ink-4);cursor:default}
.igs-sprite-words{flex:1;min-width:0}
.igs-sprite-preview-overlay{position:absolute;inset:0;z-index:2147483600;background:rgba(9,10,11,.94);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:24px;box-sizing:border-box}
.igs-sprite-preview-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--igs-settings-radius-control);box-shadow:none}
@media (max-width:640px){#igs-unified-settings{--igs-settings-width:min(760px,calc(var(--igs-settings-vw) - 24px));--igs-settings-height:min(760px,calc(var(--igs-settings-vh) - 24px));padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}.igs-settings-shell{width:var(--igs-settings-width);height:var(--igs-settings-height);border-radius:var(--igs-settings-radius-shell)}.igs-settings-grid,.igs-settings-api-group,.igs-source-filter-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:640px){.igs-settings-body{padding:10px 12px 20px}.igs-settings-tabs{margin:2px 12px 6px}.igs-source-filter{padding:12px 12px 14px}.igs-settings-sub{margin-left:2px;padding-left:10px}.igs-settings-grid[data-reader-pane="dialog"] .igs-gradient-veil-settings{grid-template-columns:minmax(0,1fr)}.igs-text-style .igs-settings-row{flex-wrap:wrap}.igs-text-style .igs-settings-row>*{flex:1 1 100px}}
`.trim();

export function getSettingsStyleText() {
    return SETTINGS_STYLE_TEXT;
}
