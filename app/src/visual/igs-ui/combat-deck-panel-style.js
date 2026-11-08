import { IGS_UI_NIGHT_RGB } from '../../styles/ui-material.js';
import { RECORD_PAGE_SHELL_STYLE_TEXT } from './record-page-shell-style.js';
import { SETTINGS_THEME_OPTIONS, getSettingsThemePalette } from './settings-theme.js';
import { COMBAT_UI_VARS, combatRarityStyle } from './combat-panel-style.js';

// 人物状态面板：与日记、目录同一外壳（毛玻璃底、水纹、四套配色、页头、色板），只换选择器；地图页那半不要。
// 版式照日记页：左侧人物名单（圆形首字头像），右侧详情卡片；页签用分段按钮，列表行无描边、按稀有度在左侧标一道实色细条。
const P = '#igs-combat-deck-panel';
const SHELL_STYLE_TEXT = RECORD_PAGE_SHELL_STYLE_TEXT
    .replace(/#igs-map-panel[^,{]*,?/g, '')
    .replace(/,\s*{/g, '{')
    .replaceAll('#igs-record-panel', P);
// 每套配色的警示色取自设置器色板；浅色两套把稀有度色换成深一档，避免浅底上看不清。
const LIGHT_RARITY = Object.freeze({ common: '#8a8178', uncommon: '#3f7fa6', rare: '#7259c4', epic: '#a8741f', mythic: '#c0413f', personal: '#9a55b0', signature: '#c8582c' });
const THEME_EXTRA = SETTINGS_THEME_OPTIONS.map((option) => {
    const palette = getSettingsThemePalette(option.value);
    const sel = `${P}[data-rp-theme="${option.value}"]`;
    const rarity = palette.scheme === 'light'
        ? Object.entries(LIGHT_RARITY).map(([key, color]) => `${sel} [data-rarity="${key}"]{--rar:${color};}`).join('')
        : '';
    return `${sel}{--igs-deck-danger:${palette.tokens.danger};}${rarity}`;
}).join('\n');
export const COMBAT_DECK_PANEL_STYLE_TEXT = `
${SHELL_STYLE_TEXT}
${P}{${COMBAT_UI_VARS}position:absolute;inset:0;z-index:12;display:block;box-sizing:border-box;overflow:hidden;pointer-events:auto;background:transparent;color:var(--igs-rp-text);font-family:var(--igs-rp-font-ui);font-size:14px;line-height:1.5;--igs-deck-danger:#d96c6c;}
${THEME_EXTRA}
/* 战斗共用变量（揭晓舞台、生成表单）改读当前配色，浅色两套里文字与底色跟着变。 */
${P}{--igs-cb-ink:var(--igs-rp-text);--igs-cb-ink-soft:var(--igs-rp-text-soft);--igs-cb-ink-faint:var(--igs-rp-text-faint);--igs-cb-fill:var(--igs-rp-fill);--igs-cb-fill-hover:var(--igs-rp-fill-hover);--igs-cb-fill-active:var(--igs-rp-fill-active);--igs-cb-on-ink:var(--igs-rp-on-ink);--igs-cb-warm:var(--igs-rp-accent);--igs-cb-font:var(--igs-rp-font-ui);}
${P} button{color:inherit;cursor:pointer;font-family:inherit;}
${P} .igs-deck-main{flex:1 1 auto;min-width:0;min-height:0;width:100%;overflow:auto;padding:8px clamp(18px,4vw,56px) 28px;overscroll-behavior:contain;box-sizing:border-box;}
${P} .igs-deck-notice{color:var(--igs-deck-danger);}
${P} .igs-deck-state{margin:48px 0 0;color:var(--igs-rp-text-faint);letter-spacing:.08em;text-align:center;}
${P} .igs-deck-layout{display:grid;grid-template-columns:minmax(220px,26%) minmax(0,1fr);gap:clamp(20px,3vw,40px);align-items:start;}
${P} .igs-deck-side{position:sticky;top:0;min-width:0;}
${P} .igs-deck-roster{display:flex;flex-direction:column;gap:2px;}
${P} .igs-deck-person{display:flex;align-items:center;gap:12px;width:100%;padding:8px 10px;border:0;border-radius:var(--igs-rp-radius-l);background:transparent;text-align:left;transition:background .18s var(--igs-rp-ease);}
${P} .igs-deck-person:hover{background:var(--igs-rp-fill);}
${P} .igs-deck-person[aria-pressed="true"]{background:var(--igs-rp-fill-active);}
${P} .igs-deck-avatar{display:grid;place-items:center;flex:none;width:36px;height:36px;box-sizing:border-box;border-radius:50%;box-shadow:inset 0 0 0 1px var(--igs-rp-text-ghost);color:var(--igs-rp-text-soft);font-size:15px;font-weight:500;line-height:1;}
${P} .igs-deck-person[aria-pressed="true"] .igs-deck-avatar{box-shadow:inset 0 0 0 1.5px var(--igs-rp-accent);color:var(--igs-rp-accent);}
${P} .igs-deck-avatar.is-large{width:52px;height:52px;font-size:21px;box-shadow:inset 0 0 0 1.5px var(--igs-rp-accent);color:var(--igs-rp-accent);}
${P} .igs-deck-person-meta{display:flex;flex-direction:column;min-width:0;}
${P} .igs-deck-person-meta>span{font-size:14px;font-weight:500;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${P} .igs-deck-person-meta>small{color:var(--igs-rp-text-faint);font-size:11px;line-height:1.4;font-variant-numeric:tabular-nums;white-space:nowrap;}
/* 详情卡片：日记阅读卡同一底色与阴影。 */
${P} .igs-deck-detail{display:flex;flex-direction:column;gap:16px;min-width:0;box-sizing:border-box;padding:24px 28px 26px;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-pane);box-shadow:var(--igs-rp-pane-edge);}
${P} .igs-deck-detail-head{display:flex;align-items:center;gap:16px;min-width:0;}
${P} .igs-deck-detail-title{display:flex;flex-direction:column;gap:6px;min-width:0;}
${P} .igs-deck-detail-title h3{margin:0;font-size:20px;font-weight:600;line-height:1.3;letter-spacing:.04em;overflow-wrap:anywhere;}
${P} .igs-deck-tags{display:flex;flex-wrap:wrap;gap:6px;}
${P} .igs-deck-tag{display:inline-flex;align-items:center;padding:1px 8px;border-radius:var(--igs-rp-radius-s);background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);font-size:11px;font-weight:500;line-height:18px;letter-spacing:.04em;white-space:nowrap;font-variant-numeric:tabular-nums;}
${P} .igs-deck-tabs{display:inline-flex;align-self:flex-start;gap:2px;max-width:100%;padding:2px;overflow-x:auto;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);}
${P} .igs-deck-tab{flex:none;min-height:30px;padding:6px 16px;border:0;border-radius:calc(var(--igs-rp-radius-m) - 2px);background:transparent;color:var(--igs-rp-text-soft);font-size:13px;font-weight:500;letter-spacing:.12em;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
${P} .igs-deck-tab:hover{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
${P} .igs-deck-tab[aria-selected="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);font-weight:600;}
${P} .igs-deck-page,${P} .igs-deck-build,${P} .igs-deck-generate,${P} .igs-deck-pending{display:flex;flex-direction:column;gap:12px;min-width:0;}
${P} .igs-deck-pending{margin-bottom:16px;padding:14px 16px;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-pane);box-shadow:var(--igs-rp-pane-edge);}
${P} .igs-deck-section{display:flex;flex-direction:column;gap:6px;min-width:0;}
${P} .igs-deck-section-title{margin:4px 0 0;color:var(--igs-rp-text-faint);font-size:11px;font-weight:500;letter-spacing:.16em;}
/* 字段行：标签固定宽度，内容左边对齐、自动换行。 */
${P} .igs-deck-row{display:grid;grid-template-columns:4.5em minmax(0,1fr);align-items:start;gap:12px;}
${P} .igs-deck-label{padding-top:7px;color:var(--igs-rp-text-faint);font-size:11px;font-weight:500;letter-spacing:.12em;}
${P} .igs-deck-row-body,${P} .igs-deck-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;}
${P} .igs-deck-row-body{min-height:30px;}
${P} .igs-deck-actions{justify-content:flex-end;}
${P} .igs-deck-chip{display:inline-flex;align-items:center;min-height:30px;padding:4px 10px;box-sizing:border-box;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);font-size:13px;font-weight:500;letter-spacing:.04em;font-variant-numeric:tabular-nums;}
${P} .igs-deck-chip.is-locked{color:var(--igs-rp-text-faint);}
${P} .igs-deck-chip-art{flex:none;width:20px;height:20px;margin-right:6px;padding:0;border:0;background:none;cursor:zoom-in;vertical-align:middle;}
${P} .igs-deck-chip-art img{display:block;width:100%;height:100%;object-fit:contain;border-radius:4px;pointer-events:none;}
${P} .igs-deck-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:6px 12px;border:0;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);font-size:13px;font-weight:500;letter-spacing:.04em;white-space:nowrap;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease),opacity .18s var(--igs-rp-ease),transform .12s var(--igs-rp-ease);}
${P} .igs-deck-btn:hover{background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
${P} .igs-deck-btn[aria-pressed="true"]:not(.is-primary){background:var(--igs-rp-fill-active);color:var(--igs-rp-text);font-weight:600;}
${P} .igs-deck-btn.is-primary{min-height:40px;padding:9px 24px;background:var(--igs-rp-accent);color:var(--igs-rp-on-ink);font-size:14px;font-weight:600;letter-spacing:.14em;}
${P} .igs-deck-btn.is-primary:hover{opacity:.88;}
${P} :is(.igs-deck-card,.igs-deck-keepsake,.igs-deck-pool,.igs-generation-form) .igs-deck-btn:not(.is-primary){background:var(--igs-rp-fill-hover);}
${P} :is(.igs-deck-card,.igs-deck-keepsake,.igs-deck-pool,.igs-generation-form) .igs-deck-btn:not(.is-primary):hover{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
${P} .igs-deck-btn.is-step{min-width:32px;padding:0;font-size:16px;line-height:1;}
${P} :is(.igs-deck-btn,.igs-deck-tab,.igs-deck-person):active{transform:scale(.97);}
${P} [aria-disabled="true"]{opacity:.42;cursor:default;}
${P} .igs-deck-input{flex:1 1 160px;min-width:0;max-width:240px;min-height:32px;padding:6px 10px;box-sizing:border-box;border:0;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);color:var(--igs-rp-text);font:inherit;outline:none;}
${P} .igs-deck-input:focus{background:var(--igs-rp-fill-hover);}
${P} .igs-deck-size{color:var(--igs-rp-text-soft);font-size:13px;font-variant-numeric:tabular-nums;}
${P} .igs-deck-size.is-error,${P} .igs-deck-err{color:var(--igs-deck-danger);}
${P} .igs-deck-err{display:block;font-size:12px;overflow-wrap:anywhere;}
${P} .igs-deck-help{margin:0;color:var(--igs-rp-text-faint);font-size:12px;line-height:1.7;overflow-wrap:anywhere;}
/* 六维：属性名在上、数值与调整值在下，格子不随面板拉宽。 */
${P} .igs-deck-abilities{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;margin:0;padding:0;list-style:none;}
${P} .igs-deck-abilities.is-alloc{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));}
${P} .igs-deck-ability{display:flex;align-items:center;gap:8px;min-height:48px;padding:8px 12px;box-sizing:border-box;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);}
${P} .igs-deck-ability-name{flex:1;color:var(--igs-rp-text-faint);font-size:12px;font-weight:500;letter-spacing:.12em;}
${P} .igs-deck-ability-score{min-width:1.6em;color:var(--igs-rp-text);font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;text-align:center;}
${P} .igs-deck-ability.is-added .igs-deck-ability-score{color:var(--igs-rp-accent);}
${P} .igs-deck-ability-mod{min-width:2em;color:var(--igs-rp-text-soft);font-size:12px;font-variant-numeric:tabular-nums;text-align:right;}
/* 列表行（被动、特性、装备、道具）：部位 / 名称 / 说明 / 操作四列对齐，稀有度在左侧标一道实色细条。 */
${P} .igs-deck-collection{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;}
${P} .igs-deck-keepsake{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;min-height:42px;padding:8px 12px;box-sizing:border-box;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);}
${P} .igs-deck-keepsake[data-rarity]::before,${P} .igs-deck-card[data-rarity]:not([data-rarity="basic"])::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:2px;background:var(--rar);}
${P} .igs-deck-slot{flex:none;width:3em;color:var(--igs-rp-text-faint);font-size:12px;letter-spacing:.08em;}
${P} .igs-deck-name{display:inline-flex;align-items:center;flex:0 1 9em;min-width:5em;font-weight:500;letter-spacing:.04em;overflow-wrap:anywhere;}
${P} .igs-deck-name.is-empty,${P} .igs-deck-name.is-locked{color:var(--igs-rp-text-faint);font-weight:400;}
${P} .igs-deck-count{flex:1 1 12em;min-width:0;color:var(--igs-rp-text-soft);font-size:12px;line-height:1.6;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;}
${P} .igs-deck-bag-acts{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto;}
/* 御印选定：可刻副本按钮紧排在待刻项下方，选中后列出刻印前后，确认与取消随后。 */
${P} .igs-deck-seal{display:flex;flex-direction:column;gap:8px;padding:8px 12px 10px;box-sizing:border-box;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);}
${P} .igs-deck-seal-picks{display:flex;flex-wrap:wrap;gap:6px;}
${P} .igs-deck-seal-detail{display:flex;flex-direction:column;gap:2px;}
/* 卡牌行：费用、卡面、名称与效果在左，来源 / 数量 / 操作收在右栏；窄屏右栏整体移到下方。 */
${P} .igs-deck-cards{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;}
${P} .igs-deck-card{--igs-card-tint:var(--igs-cb-skill);position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 12px 10px 14px;box-sizing:border-box;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);}
${P} .igs-deck-card[data-card-type="attack"]{--igs-card-tint:var(--igs-cb-attack);}
${P} .igs-deck-card[data-card-type="power"]{--igs-card-tint:var(--igs-cb-power);}
${P} .igs-deck-card.is-error{box-shadow:inset 0 0 0 1px var(--igs-deck-danger);}
${P} .igs-deck-cost{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--igs-card-tint);color:rgb(${IGS_UI_NIGHT_RGB});font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;}
${P} .igs-deck-art{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:var(--igs-rp-radius-m);overflow:hidden;background:var(--igs-rp-fill-hover);color:var(--igs-card-tint);}
${P} .igs-deck-art svg{width:22px;height:22px;stroke-width:1.4;}
${P} .igs-deck-art img{display:block;width:100%;height:100%;object-fit:cover;}
${P} .igs-deck-card-info{flex:1 1 220px;min-width:0;overflow-wrap:anywhere;}
${P} .igs-deck-card-title{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;}
${P} .igs-deck-card-title .igs-deck-name{flex:none;min-width:0;}
${P} .igs-deck-card[data-rarity="signature"] .igs-deck-name{color:var(--rar);}
${P} .igs-deck-effect{margin:2px 0 0;color:var(--igs-rp-text-soft);font-size:12px;line-height:1.6;overflow-wrap:anywhere;}
${P} .igs-deck-effect summary{cursor:pointer;color:var(--igs-rp-text-faint);}
${P} .igs-deck-card-side{display:flex;align-items:center;gap:12px;margin-left:auto;}
${P} .igs-deck-card-stats{display:flex;flex-direction:column;align-items:flex-end;gap:2px;}
${P} .igs-deck-card-stats .igs-deck-count{flex:none;white-space:nowrap;}
${P} .igs-deck-card-acts{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;}
${P} .igs-deck-req{color:var(--igs-rp-text-soft);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;}
${P} .igs-deck-req.is-up{color:var(--igs-rp-accent);font-weight:600;}
${P} .igs-deck-req.is-down{color:var(--igs-rp-text-faint);}
${P} .igs-deck-pool{padding:12px 14px;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);min-width:0;}
${P} .igs-deck-pool>summary{cursor:pointer;color:var(--igs-rp-text-soft);font-size:13px;overflow-wrap:anywhere;}
${P} .igs-deck-pool .igs-deck-help{margin:8px 0;}
${P} .igs-deck-pool .igs-deck-card{background:var(--igs-rp-fill-hover);}
${P} .igs-generation-form{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);min-width:0;}
${P} .igs-generation-form p{font-size:12px;color:var(--igs-rp-text-soft);margin:4px 0;}
${P} .igs-generation-form textarea,${P} .igs-generation-form select{display:block;box-sizing:border-box;width:100%;padding:9px;margin:5px 0;background:var(--igs-rp-fill-hover);color:inherit;border:0;border-radius:var(--igs-rp-radius-m);font:inherit;resize:vertical;}
${P} .igs-generation-form pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font-size:12px;}
${P} .igs-generation-check{display:flex;align-items:flex-start;gap:8px;margin:8px 0;overflow-wrap:anywhere;}
${P} .igs-generation-check input{flex:none;margin-top:4px;}
${P} .igs-generation-form :is(textarea,select):focus-visible{outline:1px solid var(--igs-rp-accent);outline-offset:2px;}
${P} .igs-generation-form summary{cursor:pointer;overflow-wrap:anywhere;}
/* 抽人物特性揭晓（P-f）：蓄力时背面卡居中呼吸，光圈旋转、粒子向中心聚拢，颜色取预定稀有度（--rar）；第一次翻开（data-fresh）翻面爆光，神话另加震屏与整面板闪白；之后重绘为静止终态。 */
${P} .igs-deck-reveal{display:flex;flex-direction:column;align-items:center;gap:14px;padding:12px 0 4px;}
${P} .igs-deck-reveal-stage{position:relative;display:grid;place-items:center;width:min(220px,60vw);aspect-ratio:1;perspective:900px;}
${P} .igs-deck-reveal-ring{position:absolute;inset:6%;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 30%,color-mix(in srgb,var(--rar) 75%,transparent) 50%,transparent 70% 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));animation:igs-deck-reveal-spin 1.6s linear infinite;}
${P} :is(.igs-deck-reveal-motes,.igs-deck-reveal-sparks){position:absolute;inset:0;pointer-events:none;}
${P} .igs-deck-reveal-motes i{position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px;border-radius:50%;background:var(--rar);box-shadow:0 0 8px var(--rar);opacity:0;animation:igs-deck-reveal-mote 1.4s calc(var(--i) * -.117s) ease-in infinite;}
${P} .igs-deck-reveal-card{position:relative;width:46%;aspect-ratio:5/7;border-radius:var(--igs-cb-r-l);transform-style:preserve-3d;}
${P} .igs-deck-reveal[data-phase="charge"] .igs-deck-reveal-card{animation:igs-deck-reveal-charge 1.2s ease-in-out infinite;}
${P} :is(.igs-deck-reveal-back,.igs-deck-reveal-face){position:absolute;inset:0;border-radius:var(--igs-cb-r-l);-webkit-backface-visibility:hidden;backface-visibility:hidden;}
${P} .igs-deck-reveal-back{background:radial-gradient(60% 50% at 50% 50%,rgba(255,255,255,.16),transparent 70%),linear-gradient(160deg,rgba(255,255,255,.12),rgba(255,255,255,.03)),var(--igs-cb-fill);box-shadow:0 18px 36px -18px rgba(0,0,0,.8);}
${P} .igs-deck-reveal-face{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px;box-sizing:border-box;background:radial-gradient(80% 60% at 50% 30%,color-mix(in srgb,var(--rar) 28%,transparent),transparent 72%),var(--igs-cb-fill);box-shadow:0 0 30px -6px color-mix(in srgb,var(--rar) 60%,transparent),0 18px 36px -18px rgba(0,0,0,.8);text-align:center;}
${P} .igs-deck-reveal-tag{color:var(--rar);font-size:11px;font-weight:600;letter-spacing:.2em;}
${P} .igs-deck-reveal-name{color:var(--igs-cb-ink);font-size:16px;font-weight:600;letter-spacing:.08em;overflow-wrap:anywhere;}
${P} .igs-deck-reveal:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-deck-reveal-name{color:var(--rar);}
${P} .igs-deck-reveal-state{margin:0;color:var(--igs-cb-ink-soft);font-size:13px;letter-spacing:.16em;}
${P} .igs-deck-reveal-info{display:flex;flex-direction:column;align-items:center;gap:4px;max-width:28em;text-align:center;}
${P} .igs-deck-reveal-text{margin:0;color:var(--igs-cb-ink);font-size:14px;}
${P} .igs-deck-reveal-origin{margin:0;color:var(--igs-cb-ink-soft);font-size:12px;}
${P} .igs-deck-reveal-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:min(100%,520px);margin:0;padding:0;list-style:none;}
${P} .igs-deck-reveal-slot{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0;padding:10px 12px;box-sizing:border-box;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);}
${P} .igs-deck-reveal-slot .igs-deck-name{flex:none;min-width:0;}
${P} .igs-deck-reveal-slot .igs-deck-btn{align-self:flex-end;}
${P} .igs-deck-reveal .igs-deck-actions{justify-content:center;}
${P} .igs-deck-reveal[data-fresh] .igs-deck-reveal-back{animation:igs-deck-reveal-back-out .3s ease-in both;}
${P} .igs-deck-reveal[data-fresh] .igs-deck-reveal-face{animation:igs-deck-reveal-face-in .34s .26s ease-out both;}
${P} .igs-deck-reveal[data-fresh] :is(.igs-deck-reveal-info,.igs-deck-reveal-slots){animation:igs-deck-reveal-rise .4s .6s ease-out both;}
${P} .igs-deck-reveal-burst{position:absolute;inset:-10%;border-radius:50%;pointer-events:none;background:radial-gradient(circle,color-mix(in srgb,var(--rar) 70%,#fff) 0,color-mix(in srgb,var(--rar) 35%,transparent) 35%,transparent 68%);opacity:0;animation:igs-deck-reveal-burst .7s .3s ease-out both;}
${P} .igs-deck-reveal-sparks i{position:absolute;left:50%;top:50%;width:4px;height:12px;margin:-6px -2px;border-radius:2px;background:var(--rar);box-shadow:0 0 6px var(--rar);opacity:0;animation:igs-deck-reveal-spark .7s .32s ease-out both;}
${P} .igs-deck-reveal[data-fresh][data-rarity="mythic"] .igs-deck-reveal-stage{animation:igs-deck-reveal-shake .42s .3s linear both;}
${P} .igs-deck-reveal-flash{position:absolute;inset:0;z-index:2;pointer-events:none;background:#fff;opacity:0;animation:igs-deck-reveal-flash .45s .3s ease-out both;}
/* 规则 v6 积分抽卡翻牌：3 张背面朝上并排（卡背纹样、中心徽记与呼吸光，悬停上浮、按下聚光），点一张翻开（翻面、爆光与火花，颜色取稀有度，
   翻开的牌持续描边辉光），其余两张随后亮出并压暗；翻开后加入卡组或放弃。复用揭晓的卡面与翻面动画。 */
${P} .igs-deck-draw{padding:4px 0 0;}
${P} .igs-deck-draw-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:min(100%,480px);perspective:900px;}
${P} .igs-deck-draw-card{position:relative;display:block;width:100%;aspect-ratio:5/7;padding:0;border:0;border-radius:var(--igs-cb-r-l);background:none;color:inherit;font:inherit;transform-style:preserve-3d;transition:transform .18s ease,box-shadow .18s ease;}
${P} .igs-deck-draw-back{overflow:hidden;background:radial-gradient(60% 45% at 50% 50%,color-mix(in srgb,var(--igs-rp-accent) 30%,transparent),transparent 72%),repeating-linear-gradient(45deg,color-mix(in srgb,var(--igs-rp-accent) 10%,transparent) 0 2px,transparent 2px 11px),repeating-linear-gradient(-45deg,color-mix(in srgb,var(--igs-rp-accent) 10%,transparent) 0 2px,transparent 2px 11px),linear-gradient(160deg,color-mix(in srgb,var(--igs-rp-accent) 22%,var(--igs-cb-fill)),var(--igs-cb-fill));box-shadow:inset 0 0 0 5px color-mix(in srgb,var(--igs-rp-accent) 14%,transparent),0 18px 36px -18px rgba(0,0,0,.8);}
${P} .igs-deck-draw-back::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.22) 50%,transparent 60%) 0 0/260% 100% no-repeat;animation:igs-deck-draw-sheen 3.6s ease-in-out infinite;}
${P} .igs-deck-draw-sigil{position:absolute;left:50%;top:50%;width:38%;aspect-ratio:1;transform:translate(-50%,-50%) rotate(45deg);border-radius:18%;background:radial-gradient(circle,color-mix(in srgb,var(--igs-rp-accent) 70%,#fff) 0 14%,transparent 16%),conic-gradient(from 0deg,color-mix(in srgb,var(--igs-rp-accent) 55%,transparent),transparent 25%,color-mix(in srgb,var(--igs-rp-accent) 55%,transparent) 50%,transparent 75%,color-mix(in srgb,var(--igs-rp-accent) 55%,transparent));-webkit-mask:radial-gradient(circle,#000 62%,transparent 64%);mask:radial-gradient(circle,#000 62%,transparent 64%);opacity:.85;}
${P} .igs-deck-draw[data-phase="back"] .igs-deck-draw-card.is-back{animation:igs-deck-draw-breathe 2.4s ease-in-out infinite;}
${P} .igs-deck-draw[data-phase="back"] .igs-deck-draw-card.is-back:nth-child(2){animation-delay:-.8s;}
${P} .igs-deck-draw[data-phase="back"] .igs-deck-draw-card.is-back:nth-child(3){animation-delay:-1.6s;}
${P} button.igs-deck-draw-card{cursor:pointer;}
${P} button.igs-deck-draw-card:not([aria-disabled="true"]):hover{transform:translateY(-6px) scale(1.03);box-shadow:0 0 22px -2px color-mix(in srgb,var(--igs-rp-accent) 65%,transparent);border-radius:var(--igs-cb-r-l);}
${P} button.igs-deck-draw-card[aria-disabled="true"]{cursor:default;opacity:.7;}
${P} button.igs-deck-draw-card.is-flipping{opacity:1;animation:igs-deck-draw-focus .9s ease-in-out infinite;}
${P} button.igs-deck-draw-card:focus-visible{outline:1px solid var(--igs-rp-accent);outline-offset:3px;}
${P} .igs-deck-draw-card .igs-deck-reveal-face{gap:6px;padding:10px 8px;}
${P} .igs-deck-draw-card .igs-deck-reveal-name{font-size:14px;letter-spacing:.04em;}
${P} .igs-deck-draw-card:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-deck-reveal-name{color:var(--rar);}
${P} .igs-deck-draw-card .igs-deck-reveal-tag{color:color-mix(in srgb,var(--rar) 55%,var(--igs-cb-ink));letter-spacing:.12em;}
${P} .igs-deck-draw-text{color:var(--igs-cb-ink-soft);font-size:11px;line-height:1.5;overflow-wrap:anywhere;}
${P} .igs-deck-draw-card.is-chosen{transform:translateY(-8px) scale(1.04);z-index:1;}
${P} .igs-deck-draw-card.is-chosen .igs-deck-reveal-face{box-shadow:0 0 0 1px color-mix(in srgb,var(--rar) 70%,transparent),0 0 34px -4px color-mix(in srgb,var(--rar) 75%,transparent),0 18px 36px -18px rgba(0,0,0,.8);animation:igs-deck-draw-glow 2.6s ease-in-out infinite;}
${P} .igs-deck-draw-card .igs-deck-reveal-burst{inset:-35%;}
${P} .igs-deck-draw-card.is-dim{opacity:.55;}
${P} .igs-deck-draw[data-fresh] .igs-deck-draw-card .igs-deck-reveal-back{animation:igs-deck-reveal-back-out .3s ease-in both;}
${P} .igs-deck-draw[data-fresh] .igs-deck-draw-card.is-chosen .igs-deck-reveal-face{animation:igs-deck-reveal-face-in .34s .26s ease-out both,igs-deck-draw-glow 2.6s 1s ease-in-out infinite;}
${P} .igs-deck-draw[data-fresh] .igs-deck-draw-card.is-dim .igs-deck-reveal-back{animation-delay:.9s;}
${P} .igs-deck-draw[data-fresh] .igs-deck-draw-card.is-dim .igs-deck-reveal-face{animation:igs-deck-reveal-face-in .34s 1.16s ease-out both;}
${P} .igs-deck-draw[data-fresh][data-rarity="mythic"] .igs-deck-draw-row{animation:igs-deck-reveal-shake .42s .3s linear both;}
${P}.igs-rp-narrow .igs-deck-draw-row{gap:8px;}
${P}.igs-rp-narrow .igs-deck-draw-card .igs-deck-reveal-face{padding:8px 6px;}
${P}.igs-rp-narrow .igs-deck-draw-text{font-size:10px;}
${P} .igs-deck-draw[data-still] :is(.igs-deck-draw-row,.igs-deck-draw-card,.igs-deck-reveal-back,.igs-deck-reveal-face,.igs-deck-draw-back::after){animation:none!important;}
${P} .igs-deck-draw[data-still] :is(.igs-deck-reveal-burst,.igs-deck-reveal-sparks){display:none;}
${P} .igs-deck-draw[data-still][data-phase="open"] .igs-deck-reveal-back{display:none;}
#igs-overlay[data-igs-quality="low"] ${P} .igs-deck-draw :is(.igs-deck-reveal-sparks,.igs-deck-draw-back::after){display:none;}
@media (prefers-reduced-motion:reduce){${P} .igs-deck-draw :is(.igs-deck-draw-row,.igs-deck-draw-card,.igs-deck-reveal-back,.igs-deck-reveal-face){animation:none!important;transition:none;}${P} .igs-deck-draw-back::after{animation:none;background:none;}${P} .igs-deck-draw :is(.igs-deck-reveal-burst,.igs-deck-reveal-sparks){display:none;}${P} .igs-deck-draw[data-phase="open"] .igs-deck-reveal-back{display:none;}}
@keyframes igs-deck-draw-breathe{0%,100%{box-shadow:0 0 0 transparent;}50%{box-shadow:0 0 18px -4px color-mix(in srgb,var(--igs-rp-accent) 55%,transparent);}}
@keyframes igs-deck-draw-sheen{0%,40%{background-position:120% 0;}100%{background-position:-20% 0;}}
@keyframes igs-deck-draw-focus{0%,100%{transform:translateY(-6px) scale(1.03);box-shadow:0 0 16px -2px color-mix(in srgb,var(--igs-rp-accent) 55%,transparent);}50%{transform:translateY(-8px) scale(1.05);box-shadow:0 0 30px 2px color-mix(in srgb,var(--igs-rp-accent) 80%,transparent);}}
@keyframes igs-deck-draw-glow{0%,100%{filter:brightness(1);}50%{filter:brightness(1.08);}}

${combatRarityStyle(`${P} :is(.igs-deck-card,.igs-deck-chip,.igs-deck-keepsake,.igs-deck-reveal,.igs-deck-reveal-slot,.igs-deck-draw-card)`)}
${P} .igs-deck-reveal[data-rarity="mythic"]::after{content:none;}
/* 窄屏（容器 <768）：名单变成横向一排，详情卡片收窄内边距，卡牌右栏移到下方。 */
${P}.igs-rp-narrow .igs-deck-main{padding:4px 14px 20px;}
${P}.igs-rp-narrow .igs-deck-layout{grid-template-columns:minmax(0,1fr);gap:14px;}
${P}.igs-rp-narrow .igs-deck-side{position:static;}
${P}.igs-rp-narrow .igs-deck-roster{flex-direction:row;overflow-x:auto;margin:0 -14px;padding:0 14px;gap:4px;}
${P}.igs-rp-narrow .igs-deck-person{flex:0 0 auto;width:auto;padding:6px 14px 6px 6px;}
${P}.igs-rp-narrow .igs-deck-avatar{width:30px;height:30px;font-size:13px;}
${P}.igs-rp-narrow .igs-deck-avatar.is-large{width:44px;height:44px;font-size:18px;}
${P}.igs-rp-narrow .igs-deck-detail{padding:18px 16px 20px;gap:14px;}
${P}.igs-rp-narrow .igs-deck-row{grid-template-columns:4em minmax(0,1fr);gap:8px;}
${P}.igs-rp-narrow .igs-deck-abilities{grid-template-columns:repeat(2,minmax(0,1fr));}
${P}.igs-rp-narrow .igs-deck-abilities.is-alloc{grid-template-columns:minmax(0,1fr);}
${P}.igs-rp-narrow .igs-deck-card-info{flex:1 1 0;}
${P}.igs-rp-narrow .igs-deck-card-side{flex-basis:100%;justify-content:space-between;margin-left:0;}
${P}.igs-rp-narrow .igs-deck-card-stats{flex-direction:row;align-items:center;gap:10px;}
${P}.igs-rp-narrow .igs-deck-tab{padding:6px 14px;}
@media (prefers-reduced-motion:reduce){${P} :is(.igs-deck-btn,.igs-deck-tab,.igs-deck-person){transition:none;}}
@keyframes igs-deck-reveal-spin{to{transform:rotate(1turn);}}
@keyframes igs-deck-reveal-mote{0%{opacity:0;transform:rotate(calc(var(--i) * 30deg)) translateY(-96px) scale(.6);}25%{opacity:1;}100%{opacity:0;transform:rotate(calc(var(--i) * 30deg)) translateY(-12px) scale(1.1);}}
@keyframes igs-deck-reveal-charge{0%,100%{transform:scale(1);box-shadow:0 0 0 transparent;}50%{transform:scale(1.04);box-shadow:0 0 28px color-mix(in srgb,var(--rar) 55%,transparent);}}
@keyframes igs-deck-reveal-back-out{from{transform:rotateY(0);opacity:1;}to{transform:rotateY(90deg);opacity:0;}}
@keyframes igs-deck-reveal-face-in{from{transform:rotateY(-90deg);}to{transform:rotateY(0);}}
@keyframes igs-deck-reveal-burst{0%{opacity:0;transform:scale(.4);}35%{opacity:1;}100%{opacity:0;transform:scale(1.25);}}
@keyframes igs-deck-reveal-spark{0%{opacity:1;transform:rotate(calc(var(--i) * 30deg)) translateY(-20px);}100%{opacity:0;transform:rotate(calc(var(--i) * 30deg)) translateY(-118px);}}
@keyframes igs-deck-reveal-rise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
@keyframes igs-deck-reveal-shake{0%,100%{transform:none;}20%{transform:translate(-5px,2px);}40%{transform:translate(5px,-2px);}60%{transform:translate(-3px,1px);}80%{transform:translate(2px,-1px);}}
@keyframes igs-deck-reveal-flash{0%{opacity:.8;}100%{opacity:0;}}
/* 降级：减少动态效果（data-still，面板按偏好写入；另有媒体查询兜底）直接显示结果，不放光圈、粒子与翻面；低画质去掉粒子与闪白。 */
${P} .igs-deck-reveal[data-still] :is(.igs-deck-reveal-ring,.igs-deck-reveal-motes){display:none;}
${P} .igs-deck-reveal[data-still] .igs-deck-reveal-card{animation:none;}
#igs-overlay[data-igs-quality="low"] ${P} :is(.igs-deck-reveal-motes,.igs-deck-reveal-sparks,.igs-deck-reveal-flash){display:none;}
@media (prefers-reduced-motion:reduce){${P} :is(.igs-deck-reveal-ring,.igs-deck-reveal-motes,.igs-deck-reveal-burst,.igs-deck-reveal-sparks,.igs-deck-reveal-flash){display:none;}${P} .igs-deck-reveal :is(.igs-deck-reveal-stage,.igs-deck-reveal-card,.igs-deck-reveal-back,.igs-deck-reveal-face,.igs-deck-reveal-info,.igs-deck-reveal-slots){animation:none!important;}${P} .igs-deck-reveal[data-fresh] .igs-deck-reveal-back{display:none;}}
`;
