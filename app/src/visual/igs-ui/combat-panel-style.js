import { IGS_UI_BLUR, IGS_UI_EDGE_NIGHT, IGS_UI_ELEVATION, IGS_UI_FILL, IGS_UI_FONT_SANS, IGS_UI_INK, IGS_UI_NIGHT_RGB, IGS_UI_RADIUS, IGS_UI_THICKNESS, IGS_UI_WARM, igsUiSurface } from '../../styles/ui-material.js';
import { COMBAT_CUTIN_ART_FONT, COMBAT_CUTIN_STYLE_TEXT } from './combat-cutin-style.js';
import { COMBAT_HIT_STYLE_TEXT } from './combat-hit-fx-style.js';
import { COMBAT_KO_FALL_STYLE_TEXT } from './combat-ko-fall.js';
import { COMBAT_LINE_STYLE_TEXT } from './combat-lines.js';
import { COMBAT_STAGE_FX_STYLE_TEXT } from './combat-stage-fx.js';
import { COMBAT_ENEMY_ART_STYLE_TEXT } from './combat-enemy-art.js';
import { COMBAT_PANEL_SKIN_VEIL_STACK, COMBAT_PANEL_SKIN_VEIL_STYLE_TEXT } from './combat-panel-skin-veil.js';
import { COMBAT_PANEL_LAYOUT_STYLE_TEXT } from './combat-panel-layout.js';
import { TARGET_PICKER_STYLE_TEXT } from './combat-target-picker.js';
import { CANVAS_STYLE_TEXT } from './combat-skin-registry.js';
import { INTIMATE_DUEL_STYLE_TEXT } from './intimate-duel-style.js';
import { INTIMATE_DUEL_FX_STYLE_TEXT } from './intimate-duel-fx.js';
import { COMBAT_ENTRY_SKIN_STYLE_TEXT } from './combat-entry-skin-style.js';
import { COMBAT_POWER_STYLE_TEXT } from './combat-power-badges.js';

// 战斗面板与卡组构筑面板共用的视觉 token：墨色、填充、圆角、字体取自 ui-material，与资料页、地图、设置一致；
// 语义色沿用状态栏数值条色板（reader-dom-render 的 STATUS_HUD_COLOR_VARS），类型只用色点与图标着色区分，不铺整块底色。
export const COMBAT_UI_VARS = `--igs-cb-ink:${IGS_UI_INK.primary};--igs-cb-ink-soft:${IGS_UI_INK.secondary};--igs-cb-ink-faint:${IGS_UI_INK.tertiary};`
    + `--igs-cb-fill:${IGS_UI_FILL.rest};--igs-cb-fill-hover:${IGS_UI_FILL.hover};--igs-cb-fill-active:${IGS_UI_FILL.active};`
    + `--igs-cb-warm:${IGS_UI_WARM};--igs-cb-on-ink:rgb(${IGS_UI_NIGHT_RGB});--igs-cb-veil:rgba(${IGS_UI_NIGHT_RGB},.62);`
    + `--igs-cb-r-s:${IGS_UI_RADIUS.small};--igs-cb-r-m:${IGS_UI_RADIUS.control};--igs-cb-r-l:${IGS_UI_RADIUS.card};`
    + `--igs-cb-ease:cubic-bezier(.2,.8,.2,1);--igs-cb-font:${IGS_UI_FONT_SANS};`
    + '--igs-cb-attack:#ea8a8a;--igs-cb-skill:#57aaee;--igs-cb-power:#b57fe0;--igs-cb-life:#55c795;';

// 手牌与构筑卡共用稀有度色：普通白、罕见蓝、稀有紫、史诗金、神话红。
export const combatRarityStyle = (selector) => `
${selector}{--rar:transparent;}
${selector}[data-rarity="common"]{--rar:#eceae6;}
${selector}[data-rarity="uncommon"]{--rar:#7fb8d9;}
${selector}[data-rarity="rare"]{--rar:#ad94f0;}
${selector}[data-rarity="epic"]{--rar:#f2d49b;}
${selector}[data-rarity="mythic"]{--rar:#ef7777;position:relative;}
${selector}[data-rarity="personal"]{--rar:#d9a4e8;}
${selector}[data-rarity="signature"]{--rar:#ff8a5c;}
${selector}:is([data-rarity="epic"],[data-rarity="mythic"]) :is(.igs-combat-card-cost,.igs-deck-cost){box-shadow:none;background:color-mix(in srgb,var(--rar) 24%,var(--igs-cb-on-ink));color:var(--rar);}
${selector}:is([data-rarity="epic"],[data-rarity="mythic"]) :is(.igs-combat-card-name,.igs-deck-name){color:var(--rar);}
${selector}[data-rarity="mythic"]::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,transparent 42%,color-mix(in srgb,var(--rar) 16%,transparent) 50%,transparent 58%) 0 0/260% 100% no-repeat;animation:igs-rarity-sheen 6.8s ease-in-out infinite;}
@keyframes igs-rarity-sheen{0%,35%{background-position:120% 0;}100%{background-position:-20% 0;}}
@media (prefers-reduced-motion:reduce){${selector}[data-rarity="mythic"]::after{animation:none;background:none;}}
#igs-overlay[data-igs-quality="low"] ${selector}[data-rarity="mythic"]::after{animation:none;background:none;}
`;

// 浮起卡片（奖励）：与地图详情卡同一材质——霜夜厚层加颗粒、无描边，只靠阴影与顶边高光分层。战前对阵与结算画面直接铺在面板上，不走卡片。
export const combatUiCard = (selector) => `${selector}{border-radius:var(--igs-cb-r-l);background:${igsUiSurface(IGS_UI_THICKNESS.thick)};-webkit-backdrop-filter:${IGS_UI_BLUR};backdrop-filter:${IGS_UI_BLUR};box-shadow:${IGS_UI_ELEVATION},${IGS_UI_EDGE_NIGHT};}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){${selector}{background:rgba(${IGS_UI_NIGHT_RGB},.95);}}
@media (prefers-reduced-transparency:reduce){${selector}{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(${IGS_UI_NIGHT_RGB},.97);}}`;

const C = '#igs-combat-panel';
const P = '#igs-overlay #igs-combat-panel';
const N = IGS_UI_NIGHT_RGB;

// 觉醒情绪色：怒火红焰、守护盾光、悲恸冷蓝、决意金光、羁绊光丝、极限雷光、复仇暗红、不屈白焰。按钮与特写共用 --aw。
const AWAKEN_COLORS = Object.freeze({ rage: '#ff6a3d', guard: '#7fd3ff', grief: '#7fa6e0', resolve: '#f2c46b', bond: '#ffb0cf', limit: '#c7b8ff', vengeance: '#c4303f', unyielding: '#f6f2e8' });
const AWAKEN_VARS = Object.entries(AWAKEN_COLORS).map(([k, v]) => `[data-awaken="${k}"]{--aw:${v};}`).join('\n');
// 情绪母题纹样（.igs-combat-awaken-fx::before）与粒子（::after）；低画质去粒子，减少动态效果全部静止。决意不用纹样，改为下方 AWAKEN_EMBERS 的升腾火星。
const AWAKEN_PATTERN = Object.freeze({
    rage: 'radial-gradient(60% 40% at 50% 110%,color-mix(in srgb,var(--aw) 85%,transparent),transparent 70%),radial-gradient(30% 50% at 20% 105%,color-mix(in srgb,var(--aw) 60%,transparent),transparent 70%),radial-gradient(30% 50% at 80% 105%,color-mix(in srgb,var(--aw) 60%,transparent),transparent 70%)',
    guard: 'radial-gradient(circle at 50% 50%,transparent 34%,color-mix(in srgb,var(--aw) 55%,transparent) 36%,transparent 42%,transparent 54%,color-mix(in srgb,var(--aw) 30%,transparent) 56%,transparent 62%)',
    grief: 'repeating-linear-gradient(90deg,transparent 0 46px,color-mix(in srgb,var(--aw) 35%,transparent) 46px 47px,transparent 47px 91px)',
    bond: 'repeating-linear-gradient(120deg,transparent 0 30px,color-mix(in srgb,var(--aw) 45%,transparent) 30px 31px,transparent 31px 60px),repeating-linear-gradient(60deg,transparent 0 44px,color-mix(in srgb,var(--aw) 30%,transparent) 44px 45px,transparent 45px 88px)',
    limit: 'linear-gradient(105deg,transparent 46%,var(--aw) 47%,#fff 48%,var(--aw) 49%,transparent 50%),linear-gradient(75deg,transparent 62%,color-mix(in srgb,var(--aw) 70%,transparent) 63%,transparent 64%)',
    vengeance: 'radial-gradient(circle at 50% 50%,transparent 30%,color-mix(in srgb,var(--aw) 55%,transparent) 75%,rgba(0,0,0,.6) 100%)',
    unyielding: 'radial-gradient(55% 45% at 50% 110%,color-mix(in srgb,var(--aw) 80%,transparent),transparent 70%),radial-gradient(25% 45% at 50% 100%,#fff,transparent 70%)',
});
const AWAKEN_PATTERNS = Object.entries(AWAKEN_PATTERN).map(([k, v]) => `.igs-combat-awaken-cutin[data-awaken="${k}"] .igs-combat-awaken-fx::before{background:${v};}`).join('\n');
// 决意·升腾火星（助手 10-31 选定）：两层光点自下而上循环飘升、越往上越淡，细碎亮点一层、大颗虚化一层；替换纹样层与通用粒子层。
// 低画质与减少动态效果沿用下方通用规则（选择器同权重、位置在后）：去掉虚化层，亮点层静止。
const AWAKEN_EMBERS = `.igs-combat-awaken-cutin[data-awaken="resolve"] .igs-combat-awaken-fx::before{inset:0;opacity:1;background:radial-gradient(3px 3px at 18% 22%,#fff,transparent),radial-gradient(4px 4px at 62% 48%,var(--aw),transparent),radial-gradient(2px 2px at 40% 78%,#fff,transparent),radial-gradient(5px 5px at 86% 12%,color-mix(in srgb,var(--aw) 70%,#fff),transparent),radial-gradient(3px 3px at 8% 64%,var(--aw),transparent),radial-gradient(2px 2px at 74% 90%,#fff,transparent);background-size:170px 210px;filter:drop-shadow(0 0 3px var(--aw));-webkit-mask-image:linear-gradient(0deg,#000 35%,transparent 95%);mask-image:linear-gradient(0deg,#000 35%,transparent 95%);animation:igs-combat-awaken-ember 2.2s linear infinite;}
.igs-combat-awaken-cutin[data-awaken="resolve"] .igs-combat-awaken-fx::after{opacity:.8;transform:none;background:radial-gradient(9px 9px at 26% 34%,color-mix(in srgb,var(--aw) 55%,transparent),transparent),radial-gradient(12px 12px at 72% 70%,color-mix(in srgb,var(--aw) 45%,transparent),transparent),radial-gradient(7px 7px at 50% 8%,rgba(255,255,255,.5),transparent);background-size:320px 380px;filter:blur(1.5px);animation:igs-combat-awaken-ember-slow 4.6s linear infinite;}
@keyframes igs-combat-awaken-ember{from{background-position:0 0;}to{background-position:0 -210px;}}
@keyframes igs-combat-awaken-ember-slow{from{background-position:0 0;}to{background-position:0 -380px;}}`;

// 觉醒特写（助手 10-29 方案 A，全长 --igs-fx-life）：有可信头位时先切眼部斜切条（--aw-lead，见 combat-cutin-style.js），再接主段。主段沿技能特写的布局加强：
// 暗幕叠情绪色光（立绘一侧更亮）+ 情绪母题纹样与粒子 + 情绪色速度线 + 宽斜带（技能特写同款，更宽更亮）与反向细斜带交叉 + 右侧放大推近、带情绪色光晕的半身立绘
// + 左侧字幕组（角色名、更大的庞门正道纯字「觉醒·类型」、逐字出现的台词条）+ 开场与收尾两次闪白（收尾在 --aw-end，面板同时震一下，见 combat-panel.js）。
// 主段各层按 --aw-lead 延后进场（--aw-main 为主段时长）。窄面板：立绘居中、字幕组压在下方居中。低画质去粒子、纹样与速度线静止、去投影、不震；
// 减少动态效果不切眼部、不闪白、不震，整体淡入淡出、各层静止、台词整句显示。
const AWAKEN_FX = `${AWAKEN_VARS}
.igs-combat-awaken-cutin{--ct:var(--aw);--aw-main:calc(var(--igs-fx-life,3000ms) - var(--aw-lead,0ms));position:absolute;inset:0;overflow:hidden;pointer-events:none;background:radial-gradient(60% 75% at 72% 45%,color-mix(in srgb,var(--aw) 34%,transparent),transparent 70%),linear-gradient(90deg,rgba(${N},.88),rgba(${N},.5) 58%,rgba(${N},.78));animation:igs-combat-awaken-in var(--igs-fx-life,3000ms) ease-out both;}
.igs-combat-awaken-fx{position:absolute;inset:0;}
.igs-combat-awaken-fx::before{content:'';position:absolute;inset:-10%;opacity:.85;animation:igs-combat-awaken-drift 1.6s ease-in-out infinite alternate;}
.igs-combat-awaken-fx::after{content:'';position:absolute;inset:0;background-image:radial-gradient(2px 2px at 12% 80%,var(--aw),transparent),radial-gradient(2px 2px at 28% 60%,#fff,transparent),radial-gradient(3px 3px at 46% 90%,var(--aw),transparent),radial-gradient(2px 2px at 64% 70%,#fff,transparent),radial-gradient(3px 3px at 82% 85%,var(--aw),transparent),radial-gradient(2px 2px at 92% 55%,var(--aw),transparent);animation:igs-combat-awaken-rise 1.4s linear infinite;}
${AWAKEN_PATTERNS}
${AWAKEN_EMBERS}
.igs-combat-awaken-cutin .igs-combat-cutin-lines{opacity:.85;background:repeating-linear-gradient(-12deg,transparent 0 20px,color-mix(in srgb,var(--aw) 42%,transparent) 20px 23px,transparent 23px 52px);animation-duration:.35s;}
.igs-combat-awaken-band{--r:-10deg;--d:-1;--b:color-mix(in srgb,var(--aw) 60%,var(--igs-combat-cutin-tint,var(--aw)));position:absolute;left:-14%;right:-14%;top:27%;height:46%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--b) 66%,transparent) 14%,color-mix(in srgb,var(--b) 90%,#fff 10%) 50%,color-mix(in srgb,var(--b) 66%,transparent) 86%,transparent);box-shadow:0 0 64px color-mix(in srgb,var(--b) 60%,transparent);transform:rotate(var(--r));animation:igs-combat-awaken-band var(--aw-main,2400ms) cubic-bezier(.2,.8,.2,1) var(--aw-lead,0ms) both;}
.igs-combat-awaken-band.is-cross{--r:5deg;--d:1;top:71%;height:6%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--aw) 60%,#fff) 18%,color-mix(in srgb,var(--aw) 25%,#fff) 50%,color-mix(in srgb,var(--aw) 60%,#fff) 82%,transparent);box-shadow:0 0 30px color-mix(in srgb,var(--aw) 75%,transparent);animation-delay:calc(var(--aw-lead,0ms) + 80ms);}
.igs-combat-awaken-cutin .igs-combat-cutin-flash{opacity:0;animation:igs-combat-cutin-flash .32s ease-out var(--aw-lead,0ms) forwards;}
.igs-combat-awaken-cutin .igs-combat-cutin-flash.is-awaken-end{animation-delay:var(--aw-end,2550ms);}
.igs-combat-awaken-cap{position:absolute;left:6%;top:50%;z-index:1;display:flex;flex-direction:column;align-items:flex-start;gap:clamp(6px,1.4cqh,12px);max-width:min(50%,640px);translate:0 -50%;font-family:${IGS_UI_FONT_SANS};animation:igs-combat-awaken-cap var(--aw-main,2400ms) cubic-bezier(.2,.8,.2,1) var(--aw-lead,0ms) both;}
.igs-combat-awaken-label{display:flex;flex-direction:column;align-items:flex-start;gap:clamp(4px,1cqh,10px);}
.igs-combat-awaken-name{padding:.25em .7em .25em .9em;border-radius:var(--igs-cb-r-s,4px);background:rgba(${N},.72);color:#fff;font-size:clamp(12px,1.7cqw,16px);font-weight:700;letter-spacing:.36em;text-shadow:0 0 10px color-mix(in srgb,var(--aw) 70%,transparent);}
.igs-combat-awaken-kind{--ch-at:calc(var(--aw-lead,0ms) + 120ms);display:flex;flex-wrap:wrap;align-items:center;gap:.06em;font-family:${COMBAT_CUTIN_ART_FONT};font-size:clamp(32px,min(calc(52cqw / var(--len,5)),13cqh),92px);line-height:1;rotate:-5deg;transform-origin:0 50%;}
.igs-combat-awaken-line{margin-top:clamp(4px,1.2cqh,12px);max-width:min(100%,560px);padding:.36em .9em;background:linear-gradient(90deg,rgba(${N},.84),rgba(${N},.64) 80%,rgba(${N},.32));color:#fff;font-size:clamp(14px,min(2.4cqw,3.6cqh),24px);font-weight:700;letter-spacing:.06em;line-height:1.4;text-shadow:0 0 12px color-mix(in srgb,var(--aw) 70%,transparent),0 2px 4px rgba(0,0,0,.85);overflow-wrap:anywhere;clip-path:inset(-1em);animation:igs-combat-awaken-type calc(var(--aw-main,2400ms) * .4) steps(var(--n,12),end) calc(var(--aw-lead,0ms) + 420ms) both;}
@keyframes igs-combat-awaken-in{0%{opacity:0;}4%,86%{opacity:1;}100%{opacity:0;}}
@keyframes igs-combat-awaken-band{0%{opacity:0;transform:rotate(var(--r)) translateX(calc(var(--d) * 110%)) scaleY(.3);}12%{opacity:1;transform:rotate(var(--r)) translateX(0) scaleY(1.08);}18%{transform:rotate(var(--r)) translateX(0) scaleY(1);}86%{opacity:1;transform:rotate(var(--r)) translateX(calc(var(--d) * -3%)) scaleY(1);}100%{opacity:0;transform:rotate(var(--r)) translateX(calc(var(--d) * -110%)) scaleY(.5);}}
@keyframes igs-combat-awaken-cap{0%{opacity:0;transform:translateX(-32px) skewX(-14deg);}14%{opacity:1;transform:translateX(0) skewX(-6deg);}86%{opacity:1;transform:translateX(6px) skewX(-6deg);}100%{opacity:0;transform:translateX(24px) skewX(-6deg);}}
@keyframes igs-combat-awaken-type{from{clip-path:inset(-1em 100% -1em -1em);}to{clip-path:inset(-1em);}}
@keyframes igs-combat-awaken-drift{from{transform:scale(1) translateY(0);}to{transform:scale(1.06) translateY(-2%);}}
@keyframes igs-combat-awaken-rise{from{transform:translateY(12%);opacity:1;}to{transform:translateY(-18%);opacity:0;}}
@container igs-combat (max-width:720px){.igs-combat-awaken-cutin{background:radial-gradient(70% 55% at 50% 38%,color-mix(in srgb,var(--aw) 34%,transparent),transparent 70%),linear-gradient(180deg,rgba(${N},.6),rgba(${N},.4) 45%,rgba(${N},.86));}.igs-combat-awaken-band{top:50%;height:30%;}.igs-combat-awaken-band.is-cross{top:80%;height:4%;}.igs-combat-awaken-cap{left:5%;right:5%;top:auto;bottom:7%;translate:none;max-width:none;align-items:center;text-align:center;}.igs-combat-awaken-label{align-items:center;}.igs-combat-awaken-kind{justify-content:center;transform-origin:50% 50%;font-size:clamp(28px,min(calc(86cqw / var(--len,5)),9cqh),68px);}.igs-combat-awaken-line{max-width:100%;}}
.igs-combat-awaken-cutin.is-low .igs-combat-awaken-fx::after,#igs-overlay[data-igs-quality="low"] .igs-combat-awaken-fx::after{display:none;}
.igs-combat-awaken-cutin.is-low .igs-combat-awaken-fx::before,#igs-overlay[data-igs-quality="low"] .igs-combat-awaken-fx::before{animation:none;}
.igs-combat-awaken-cutin.is-low .igs-combat-awaken-band,#igs-overlay[data-igs-quality="low"] .igs-combat-awaken-band{box-shadow:none;}
.igs-combat-awaken-cutin.is-reduced{animation:igs-combat-cutin-fade var(--igs-fx-life,3000ms) linear both;}
.igs-combat-awaken-cutin.is-reduced .igs-combat-awaken-fx::before{animation:none;}
.igs-combat-awaken-cutin.is-reduced .igs-combat-awaken-fx::after{display:none;}
.igs-combat-awaken-cutin.is-reduced :is(.igs-combat-cutin-lines,.igs-combat-awaken-band,.igs-combat-awaken-cap,.igs-combat-awaken-line){animation:none;}
@media (prefers-reduced-motion:reduce){.igs-combat-awaken-cutin{animation:igs-combat-cutin-fade var(--igs-fx-life,3000ms) linear both;}.igs-combat-awaken-fx::before{animation:none!important;}.igs-combat-awaken-fx::after{display:none;}.igs-combat-awaken-cutin :is(.igs-combat-cutin-lines,.igs-combat-awaken-band,.igs-combat-awaken-cap,.igs-combat-awaken-line){animation:none!important;}.igs-combat-awaken-eye{display:none;}}`;

// 单位宽度随面板本身的尺寸放大（cqw / cqh 取 #igs-combat-panel，不看视口）；敌人放大以便横向散开，我方宽度即圆框头像直径，主战者大于队友。
const SCALE_WIDE = `${C} .igs-combat-unit{--u-w:clamp(128px,min(28cqh,20cqw),240px);}
${C} .igs-combat-unit[data-size="lg"]{--u-w:clamp(150px,min(26cqh,16cqw),232px);}
${C} .igs-combat-unit[data-size="sm"]{--u-w:clamp(64px,min(13cqh,8cqw),108px);}
${C} .igs-combat-result{--r-title:clamp(40px,min(11cqh,7cqw),96px);--r-w:clamp(96px,min(26cqh,16cqw),220px);--r-foe:clamp(84px,min(18cqh,12cqw),170px);}
${C} .igs-combat-result:not([data-outcome="victory"]){--r-title:clamp(34px,min(8cqh,6cqw),72px);--r-w:clamp(84px,min(20cqh,13cqw),180px);}
${C} .igs-combat-lobby{--l-foe:clamp(96px,min(42cqh,20cqw),240px);}`;
// 宽屏横向面板（宽于窄屏阈值）：1 名敌人立绘约占面板高 45%、2 名约 38%，3 名以上沿用按宽度均分；敌人脚下一圈淡色光晕。
// 主战者圆框上限提到 280px，手牌宽度随面板高度放大（约为主战者直径的 0.6），卡高按原比例跟随。
const WIDE = `${C} .igs-combat-side.is-enemy[data-n="1"] .igs-combat-unit{--u-w:clamp(128px,33.75cqh,360px);}
${C} .igs-combat-side.is-enemy[data-n="2"] .igs-combat-unit{--u-w:clamp(128px,28.5cqh,320px);}
${C} .igs-combat-side.is-enemy .igs-combat-unit-info::before{content:"";position:absolute;left:4%;right:4%;top:-26px;z-index:-1;height:30px;border-radius:50%;background:radial-gradient(closest-side,rgba(236,226,206,.2),rgba(236,226,206,.07) 62%,transparent);pointer-events:none;}
${C} .igs-combat-unit[data-size="lg"]{--u-w:clamp(150px,min(26cqh,16cqw),280px);}
${C} .igs-combat-hand{--igs-card-w:clamp(116px,min(15.6cqh,9.6cqw),152px);}
${C} .igs-combat-hand .igs-combat-card{min-height:calc(var(--igs-card-w) * 1.52);}
${C} .igs-combat-result:has(>.igs-combat-loot){display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto;grid-template-areas:"head head" "team loot" "actions actions";column-gap:clamp(20px,4cqw,48px);--r-title:clamp(36px,min(8cqh,6cqw),72px);}
${C} .igs-combat-result:has(>.igs-combat-loot):has(>.igs-combat-feats){grid-template-rows:auto auto minmax(0,1fr) auto;grid-template-areas:"head head" "feats feats" "team loot" "actions actions";}
${C} .igs-combat-result:has(>.igs-combat-loot)>.igs-combat-result-head{grid-area:head;}
${C} .igs-combat-result:has(>.igs-combat-loot)>.igs-combat-feats{grid-area:feats;}
${C} .igs-combat-result:has(>.igs-combat-loot)>.igs-combat-result-team{grid-area:team;align-self:center;justify-content:flex-end;}
${C} .igs-combat-result:has(>.igs-combat-loot)>.igs-combat-loot{grid-area:loot;align-self:center;align-items:flex-start;}
${C} .igs-combat-result:has(>.igs-combat-loot)>.igs-combat-actions{grid-area:actions;}
${C} .igs-combat-result:has(>.igs-combat-loot) .igs-combat-loot-row{--loot-w:min(21cqh,132px,calc((100% - (var(--n,3) - 1) * 12px) / var(--n,3)));justify-content:flex-start;}
${C} .igs-combat-result:has(>.igs-combat-loot) .igs-combat-result-figure{width:min(var(--r-w),calc((100% - (var(--n,1) - 1) * 16px) / var(--n,1)));}
/* 横向面板（≥721px）右下角回合组竖排：撤退 / 取消在最上，抽牌 / 弃牌数量在中间，结束回合在最下的角落（turn-btns 不成盒，按 order 排）。 */
${C} .igs-combat-turn-btns{display:contents;}
${C} .igs-combat-turn-btns>:is([data-combat-act="escape"],[data-combat-act="stop"],[data-combat-act="cancel"]){order:-1;}
/* 撤退是透明底图标钮：收窄成 34px 方钮、右缘仍与结束回合对齐，图标更靠右。 */
${C} .igs-combat-turn .igs-combat-turn-btns>.igs-combat-btn.is-icon:is([data-combat-act="escape"],[data-combat-act="stop"]){width:34px;}`;
// 战前对阵竖排（竖向面板；不支持容器查询时按视口方向）：敌方在上、我方在下；敌方色块止于敌方区下缘（100% - --t），我方色块从我方一排上沿（--t）起铺，VS 所在一行不铺色块；入场改为上下冲入；底层色块在我方一排沿首框左斜边、末框右斜边裁掉，--t 是我方一排的上沿（舞台半高 + VS 半高 + 行距，与三行网格一致）。
const LOBBY_STACK = `${C} .igs-combat-lobby-stage{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto minmax(0,1fr);grid-template-areas:"enemy" "vs" "ally";}
${C} .igs-combat-lobby{--vs:clamp(40px,min(9cqh,13cqw),64px);--cut:clamp(12px,4.5cqh,32px);}
${C} .igs-combat-lobby-fx{--t:calc(50% + var(--vs) / 2 + var(--l-gap));-webkit-clip-path:polygon(0 0,100% 0,100% var(--t),calc(100% - var(--cut)) 100%,0 100%,var(--cut) var(--t),0 var(--t));clip-path:polygon(0 0,100% 0,100% var(--t),calc(100% - var(--cut)) 100%,0 100%,var(--cut) var(--t),0 var(--t));}
${C} .igs-combat-lobby-fx .is-ally{clip-path:polygon(0 var(--t),100% var(--t),100% 100%,0 100%);background:linear-gradient(0deg,rgba(242,166,92,.34),rgba(242,196,128,.12) 62%,rgba(242,196,128,.05));}
${C} .igs-combat-lobby-fx .is-enemy{clip-path:polygon(0 0,100% 0,100% calc(100% - var(--t)),0 calc(100% - var(--t)));background:linear-gradient(180deg,rgba(10,8,18,.7),rgba(150,26,48,.4) 60%,rgba(120,22,44,.28));}
${C} .igs-combat-lobby[data-intro] .igs-combat-lobby-side.is-ally{animation-name:igs-combat-lobby-from-b;}
${C} .igs-combat-lobby[data-intro] .igs-combat-lobby-side.is-enemy{animation-name:igs-combat-lobby-from-t;}
${COMBAT_PANEL_SKIN_VEIL_STACK}`;
// 竖向面板（宽于窄屏阈值）：主战者一组与队友居中成一排，手牌单独占下一排；主战者按面板高度放大。
const PORTRAIT = `${C} .igs-combat-foot{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "hand" "turn";gap:8px;}
${C} .igs-combat-hand{padding-bottom:24px;}
${C} .igs-combat-hero{justify-content:center;}
${C} .igs-combat-unit[data-size="lg"]{--u-w:clamp(150px,min(20cqh,26cqw),220px);}
${LOBBY_STACK}
${C} .igs-combat-lobby{--l-foe:clamp(80px,min(22cqh,28cqw),220px);}`;
// 窄面板（≤720px）：紧凑排布；支持容器查询时按面板宽度生效，否则回落到视口宽度。
const NARROW = `${C} .igs-combat-head{min-height:40px;gap:6px;padding:2px 6px 0 14px;}
/* 窄面板顶栏：标题最多两行（超出省略）、每行至少两个字，不再被挤成竖排撑高顶栏；行动条按 100px 起算、占满剩余宽度，放得下时标题保持一行，行动条到 100px 后标题才折行；关闭 / 倍速按钮不被压窄；错误提示收紧。 */
${C} .igs-combat-head>.igs-combat-icon-btn{flex:none;}
${C} .igs-combat-title{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;min-width:2.2em;max-height:2.5em;overflow:hidden;font-size:13px;line-height:1.25;letter-spacing:.06em;}
${C} .igs-combat-round{padding:2px 8px 2px calc(8px + .12em);}
${C} .igs-combat-notice{margin:0 10px 4px;padding:6px 10px;font-size:12px;line-height:1.5;}
${C} .igs-combat-turn{gap:6px;}
${C} .igs-combat-track{--dot:18px;flex:1 1 100px;min-width:100px;}
${C} .igs-combat-main{gap:6px;padding:0 10px 6px;}
${C} .igs-combat-field{padding:0;}
${C} .igs-combat-side{gap:10px;}
${C} .igs-combat-side.is-enemy{--e-gap:10px;}
${C} .igs-combat-unit{--u-w:84px;}
${C} .igs-combat-unit[data-size="lg"]{--u-w:108px;}
${C} .igs-combat-unit[data-size="sm"]{--u-w:44px;}
${C} .igs-combat-intent{gap:0 3px;min-height:22px;padding:2px 6px;font-size:11px;}
${C} .igs-combat-intent-icon svg{width:14px;height:14px;}
${C} .igs-combat-intent-value{font-size:15px;}
${C} .igs-combat-foot{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "hand" "turn";gap:6px;padding:4px 6px 6px;}
${C} .igs-combat-hero{justify-content:center;gap:8px;}
${C} .igs-combat-hero-core{gap:6px;}
${C} .igs-combat-hand{--igs-card-w:88px;padding:8px 14px 16px;}
${C} .igs-combat-unit[data-size="lg"] .igs-combat-unit-name{gap:2px;}
${C} :is(.igs-combat-hero-figure,.igs-combat-trait){--orb:30px;}
${C} .igs-combat-trait-orb svg{width:16px;height:16px;}
${C} .igs-combat-trait-cost{right:-3px;top:-3px;width:14px;height:14px;font-size:10px;}
${C} .igs-combat-energy{gap:5px;}
${C} .igs-combat-energy-orb{width:32px;height:32px;}
${C} .igs-combat-energy-orb b{font-size:15px;}
${C} .igs-combat-turn .igs-combat-btn.is-icon{width:46px;min-height:30px;height:30px;}
${C} .igs-combat-turn .igs-combat-btn.is-icon.is-primary{width:62px;}
${C} .igs-combat-btn.is-icon svg{width:18px;height:18px;}
${C} .igs-combat-card{min-height:112px;gap:3px;padding:5px 6px 6px;}
/* 窄面板手牌：关键字与效果说明同排，说明最多两行（超出以省略号截断，全文在读屏标签里），牌高与普通牌一致，手牌区不被长说明撑高、回合按钮不被挤出面板。 */
${C} .igs-combat-card-text{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;}
${C} .igs-combat-card-kw{display:inline;margin-right:.35em;}
${C} .igs-combat-card-cost{width:22px;height:22px;font-size:12px;}
${C} .igs-combat-card-art{height:24px;}
${C} .igs-combat-card-art svg{width:20px;height:20px;}
${C} .igs-combat-reward{padding:16px 16px 14px;}
${C} .igs-combat-lobby{--l-foe:96px;--l-gap:10px;--l-slot:4px;--band:28px;--vs:clamp(34px,10cqw,52px);gap:6px;}
${C} .igs-combat-lobby-banner{gap:10px;padding:5px 22px 6px calc(22px + .2em);}
${C} .igs-combat-lobby-name{font-size:16px;letter-spacing:.14em;}
${C} .igs-combat-lobby [data-combat-act="start"]{min-height:44px;padding:8px 30px 8px calc(30px + .3em);font-size:16px;}
${C} .igs-combat-plate b{font-size:13px;}
${C} .igs-combat-result{--r-title:36px;--r-w:96px;--r-foe:84px;}
${C} .igs-combat-lobby-side.is-enemy .igs-combat-lobby-figure:nth-child(2n){margin-bottom:calc(var(--w) * .08);}
`;
const SCALE_NARROW = `${C} .igs-combat-unit{--u-w:clamp(84px,min(26cqw,12cqh),140px);}
${C} .igs-combat-unit[data-size="lg"]{--u-w:clamp(96px,min(27.7cqw,12.8cqh),150px);}
${C} .igs-combat-unit[data-size="sm"]{--u-w:clamp(40px,min(11cqw,6cqh),68px);}
${C} .igs-combat-result{--r-title:clamp(34px,min(12cqw,7cqh),64px);--r-w:clamp(64px,min(26cqw,16cqh),150px);--r-foe:clamp(56px,min(22cqw,12cqh),120px);}
${C} .igs-combat-result:not([data-outcome="victory"]){--r-title:clamp(30px,min(10cqw,6cqh),52px);--r-w:clamp(60px,min(22cqw,13cqh),130px);}
${C} .igs-combat-lobby{--l-foe:clamp(60px,min(18cqh,26cqw),150px);}`;
// 高竖向面板（竖屏整页，高 ≥700px）：主战者一组居中，队友放不下时换到下一排居中，手牌在最下方；单位按面板高度放大，主战者仍大于队友。
const TALL = `${C} .igs-combat-foot{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "hand" "turn";gap:6px;}
${C} .igs-combat-hero{flex-wrap:wrap;justify-content:center;row-gap:8px;}
${C} .igs-combat-unit{--u-w:clamp(84px,min(32cqw,17cqh),200px);}
${C} .igs-combat-unit[data-size="lg"]{--u-w:clamp(108px,min(34cqw,18cqh),200px);}
${C} .igs-combat-unit[data-size="sm"]{--u-w:clamp(50px,min(16cqw,8cqh),92px);}
${C} .igs-combat-lobby{--l-foe:clamp(84px,min(20cqh,34cqw),200px);}`;
// 紧凑横屏（721–1279px）：排布同宽面板、间距收紧。
const FOOT_COMPACT = `${C} .igs-combat-foot{gap:10px;}
${C} .igs-combat-hero{gap:10px;}
${C} .igs-combat-hero-core{gap:6px;}`;
// 竖向面板的我方一排：不用圆框，与敌人一样是 3:4 半身立绘（下沿渐隐），主战者与队友同宽（按我方人数 --n 均分，不换行）；
// 队友按奇偶分到主战者左右，主战者居中，觉醒与道具在主战者左侧、底边对齐（不叠到头像上），均分宽度时扣掉这一列；选中 / 出手 / 可选目标不画外环，沿用立绘外发光。
const PORTRAIT_ALLIES = `${C} .igs-combat-foot .igs-combat-hero{flex-wrap:nowrap;justify-content:center;align-items:flex-end;gap:8px;}
${C} .igs-combat-hero>.igs-combat-side.is-ally{display:contents;}
${C} .igs-combat-hero .igs-combat-side.is-ally>.igs-combat-unit:nth-child(odd){order:-1;}
${C} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size]{--u-w:min(clamp(64px,13cqh,140px),calc((100cqw - 40px - var(--hero-controls-space,74px) - (var(--n,1) - 1) * 8px) / var(--n,1)));--crop:1;flex:none;}
${C} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size] .igs-combat-portrait{aspect-ratio:3/4;border-radius:0;background:none;box-shadow:none;-webkit-mask-image:linear-gradient(180deg,#000 70%,transparent);mask-image:linear-gradient(180deg,#000 70%,transparent);}
${C} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size] .igs-combat-portrait :is(img,svg,.igs-combat-art){transform:none;object-position:50% 0;}
${C} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size] .igs-combat-unit-info{margin-top:-14px;}
/* 竖向半身立绘没有圆框：主动特性圆球并排挨着（间距 4px）在主战者立绘上沿外侧（间隙 3px），右缘与立绘右缘对齐，比两侧队友头顶稍高；
   我方一排顶部留出一颗圆球高，免得压到敌方；不另占一列，我方均分宽度不受影响，没有队友时也不在右侧留空。 */
${C} .igs-combat-hero:has(.igs-combat-trait-ring){padding-top:calc(var(--orb,44px) + 6px);}
${C} .igs-combat-hero .igs-combat-trait-ring{aspect-ratio:3/4;}
${C} .igs-combat-hero .igs-combat-trait-ring>.igs-combat-trait{left:auto;right:0;top:calc(-3px - var(--orb,44px));margin-left:0;translate:none;}
${C} .igs-combat-hero .igs-combat-trait-ring>.igs-combat-trait:not(:last-child){right:calc(var(--orb,44px) + 4px);}
${C} .igs-combat-hero:not(:has(>.igs-combat-side.is-ally)) .igs-combat-hero-figure:has(>.igs-combat-trait-ring){margin-right:0;}
/* 竖向半身立绘没有圆框：觉醒 / 道具竖排在主战者立绘左侧外沿（间隙 6px）、底边与单位块齐平；立绘左侧留出按钮宽，均分我方宽度时扣掉这一列。 */
${C} .igs-combat-hero{--hero-controls-space:40px;}
${C} .igs-combat-hero-figure>.igs-combat-controls{left:auto;right:calc(100% + 6px);top:auto;bottom:0;display:flex;aspect-ratio:auto;}
${C} .igs-combat-hero-figure>.igs-combat-controls>*{position:relative;right:auto;top:auto;}
${C} .igs-combat-hero-figure>.igs-combat-controls>.igs-combat-awaken{right:auto;top:auto;}
${C} .igs-combat-hero .igs-combat-hero-figure:has(>.igs-combat-controls){margin-left:40px;}`;

// 战斗面板：扁平、无描边；场景背景保留并压暗，单位以站立立绘呈现；手牌重叠成扇形握牌、不滚动，悬停 / 聚焦 / 选中抬起。面板自带的演出层不受 panel:combat 暂停影响。
export const COMBAT_PANEL_STYLE_TEXT = `
${C}{${COMBAT_UI_VARS}position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;pointer-events:auto;background:radial-gradient(120% 80% at 50% 0%,rgba(${N},.16),rgba(${N},.46) 62%),linear-gradient(180deg,rgba(${N},0) 42%,rgba(${N},.74));color:var(--igs-cb-ink);font-family:var(--igs-cb-font);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;}
${C}{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
${C} :is(img,a){-webkit-user-drag:none;}
${P} :is(#igs-fx-stage,#igs-fx-front),${P} :is(#igs-fx-stage,#igs-fx-front) *,${P} :is(#igs-fx-stage,#igs-fx-front) *::before,${P} :is(#igs-fx-stage,#igs-fx-front) *::after{animation-play-state:running!important;}
${C} .igs-combat-body{position:relative;z-index:1;display:flex;flex-direction:column;flex:1;min-height:0;}
${C} .igs-combat-fx{position:absolute;inset:0;z-index:2;overflow:hidden;pointer-events:none;}
${C} .igs-combat-fx #igs-stage-motion{position:absolute;inset:0;}
${C} .igs-combat-head{display:flex;align-items:center;justify-content:flex-start;gap:8px;min-height:48px;padding:6px 10px 2px 18px;}
${C} .igs-combat-head>[data-combat-act="close"]{margin-left:auto;}
${C} .igs-combat-title{font-size:16px;font-weight:600;letter-spacing:.2em;text-shadow:0 1px 2px rgba(0,0,0,.7),0 0 12px rgba(0,0,0,.45);}
${C} .igs-combat-round{position:relative;isolation:isolate;flex:none;padding:2px 12px 2px calc(12px + .12em);color:var(--igs-cb-on-ink);font-size:12px;font-style:italic;font-weight:800;letter-spacing:.12em;line-height:1.5;white-space:nowrap;}
${C} .igs-combat-round::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-16deg);background:linear-gradient(90deg,#f7dfaa,#eab06c);}
${C} .igs-combat-icon-btn{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:var(--igs-cb-r-m);background:transparent;color:var(--igs-cb-ink-soft);cursor:pointer;transition:background .18s var(--igs-cb-ease),color .18s var(--igs-cb-ease);}
${C} .igs-combat-icon-btn:hover{background:var(--igs-cb-fill-hover);color:var(--igs-cb-ink);}
${C} .igs-combat-icon-btn svg{width:18px;height:18px;stroke-width:1.6;}
${C} .igs-combat-speed{width:auto;min-width:36px;padding:0 8px;font-size:13px;font-weight:700;letter-spacing:.04em;font-variant-numeric:tabular-nums;}
${C} .igs-combat-speed[aria-pressed="true"]{background:var(--igs-cb-fill-hover);color:#f7dfaa;}
${C} .igs-combat-head>.igs-combat-speed{margin-left:auto;}
${C} .igs-combat-head>.igs-combat-track+.igs-combat-speed{margin-left:8px;}
${C} .igs-combat-head>.igs-combat-speed+[data-combat-act="close"]{margin-left:2px;}
${C} .igs-combat-notice{margin:0 14px 6px;padding:8px 12px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);color:#f2b8b5;font-size:13px;line-height:1.6;}
${C} .igs-combat-main{display:flex;flex-direction:column;flex:1;min-height:0;gap:10px;padding:0 14px 12px;overflow:auto;scrollbar-width:none;}
${C} .igs-combat-main::-webkit-scrollbar{display:none;}
${C} .igs-combat-state{margin:24px 0 0;color:var(--igs-cb-ink-soft);font-size:14px;letter-spacing:.06em;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.7);}
${C} .igs-combat-row,${C} .igs-combat-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}
${C} .igs-combat-actions{justify-content:flex-end;}
${C} .igs-combat-label{min-width:3.5em;color:var(--igs-cb-ink-faint);font-size:11px;font-weight:500;letter-spacing:.16em;}
${C} .igs-combat-chip{display:inline-flex;align-items:center;min-height:28px;padding:4px 10px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);color:var(--igs-cb-ink-soft);font-size:13px;font-weight:500;letter-spacing:.04em;}
${C} .igs-combat-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 18px;border:0;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);color:var(--igs-cb-ink-soft);font:inherit;font-size:13px;font-weight:500;letter-spacing:.06em;cursor:pointer;transition:background .18s var(--igs-cb-ease),color .18s var(--igs-cb-ease),opacity .18s var(--igs-cb-ease),transform .12s var(--igs-cb-ease);}
${C} .igs-combat-btn:hover{background:var(--igs-cb-fill-hover);color:var(--igs-cb-ink);}
${C} .igs-combat-btn.is-primary{padding:9px 24px;background:var(--igs-cb-ink);color:var(--igs-cb-on-ink);font-size:14px;font-weight:600;letter-spacing:.14em;}
${C} .igs-combat-btn.is-primary:hover{opacity:.88;}
${C} :is(.igs-combat-btn,.igs-combat-icon-btn):active{transform:scale(.97);}
${C} [aria-disabled="true"]{opacity:.45;cursor:default;}
${C} :is(button,[role="button"]):focus-visible{outline:2px solid var(--igs-cb-warm);outline-offset:2px;}
${C}:focus{outline:none;}
${C} .igs-combat-field{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:auto;padding:4px 0;}
${C} .igs-combat-side{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-end;gap:18px;}
${C} .igs-combat-side.is-enemy{--e-gap:18px;align-self:stretch;flex-wrap:nowrap;justify-content:space-evenly;gap:var(--e-gap);}
${C} .igs-combat-side.is-enemy .igs-combat-unit{--e-w:min(var(--u-w),calc((100% - (var(--n,1) - 1) * var(--e-gap)) / var(--n,1)));width:var(--e-w);}
${C} .igs-combat-unit{--u-w:112px;position:relative;flex:none;display:flex;flex-direction:column;gap:2px;width:var(--u-w);box-sizing:border-box;outline-offset:4px;}
${C} .igs-combat-unit[data-size="lg"]{--u-w:160px;}
${C} .igs-combat-unit[data-size="sm"]{--u-w:68px;font-size:12px;}
${C} .igs-combat-unit-info{min-width:0;margin-top:-14px;position:relative;text-shadow:0 1px 2px rgba(0,0,0,.8),0 0 10px rgba(0,0,0,.5);}
/* 我方是圆框头像：主战者取半身、队友取头肩，按 --crop 从立绘顶部放大；名字 / 格挡 / 血条排在头像下方。 */
${C} .igs-combat-unit[data-side="ally"]{--crop:1.75;}
${C} .igs-combat-unit[data-side="ally"][data-size="lg"]{--crop:1.3;}
${C} .igs-combat-unit[data-side="ally"] .igs-combat-unit-info{margin-top:6px;}
${C} .igs-combat-portrait{flex:none;width:100%;aspect-ratio:3/4;overflow:hidden;color:rgba(150,170,200,.42);-webkit-mask-image:linear-gradient(180deg,#000 70%,transparent);mask-image:linear-gradient(180deg,#000 70%,transparent);}
${C} .igs-combat-portrait[data-side="enemy"]{color:rgba(196,120,130,.42);}
${C} .igs-combat-portrait :is(img,svg,.igs-combat-art){display:block;width:100%;height:100%;object-fit:cover;object-position:top center;filter:drop-shadow(0 8px 14px rgba(0,0,0,.5));transition:filter .18s var(--igs-cb-ease);}
${C} .igs-combat-portrait[data-side="enemy"] img{object-fit:contain;object-position:center bottom;}
/* 有图的敌人：立绘框按图片比例收缩（高度上限仍为 3:4），意图标签贴在图片上沿，横图上方不再留大块空白；剪影保持 3:4 框。 */
${C} .igs-combat-portrait[data-side="enemy"]:has(img){aspect-ratio:auto;max-height:calc(var(--e-w,var(--u-w)) * 4 / 3);}
${C} .igs-combat-portrait[data-side="enemy"] img{height:auto;max-height:calc(var(--e-w,var(--u-w)) * 4 / 3);}
${C} .igs-combat-unit[data-side="ally"] .igs-combat-portrait{aspect-ratio:1;border-radius:50%;-webkit-mask-image:none;mask-image:none;background:radial-gradient(circle at 50% 30%,rgba(255,255,255,.12),rgba(${N},.78) 72%);box-shadow:0 0 0 1.5px rgba(255,255,255,.22),0 10px 22px -10px rgba(0,0,0,.75);}
${C} .igs-combat-unit[data-side="ally"].is-controlled .igs-combat-portrait{box-shadow:0 0 0 2px rgba(242,212,155,.75),0 10px 22px -10px rgba(0,0,0,.75);}
${C} .igs-combat-unit[data-side="ally"] .igs-combat-portrait :is(img,svg,.igs-combat-art){object-position:50% 0;transform:scale(var(--crop));transform-origin:50% 0;filter:none;}
${C} .igs-combat-unit.is-controlled .igs-combat-unit-name>span{color:var(--igs-cb-warm);}
${C} .igs-combat-unit.is-down{opacity:.4;filter:grayscale(.8);}
${C} .igs-combat-unit.is-targetable{cursor:pointer;}
${C} .igs-combat-unit.is-targetable .igs-combat-portrait :is(img,svg,.igs-combat-art){filter:drop-shadow(0 0 4px rgba(242,212,155,.9)) drop-shadow(0 0 12px rgba(242,212,155,.55));}
${C} .igs-combat-unit.is-targetable:is(:hover,.is-drop-hover) .igs-combat-portrait :is(img,svg,.igs-combat-art){filter:drop-shadow(0 0 6px rgba(242,212,155,1)) drop-shadow(0 0 18px rgba(242,212,155,.7)) brightness(1.08);}
/* 单位名牌与血条：与战前名牌同一套斜切（::before 与轨道 skewX，无描边）；我方暖色、敌方冷红。 */
${C} .igs-combat-unit-name{position:relative;isolation:isolate;display:flex;flex-wrap:nowrap;justify-content:space-between;align-items:center;gap:4px;padding:1px 9px;font-size:13px;font-weight:600;letter-spacing:.04em;white-space:nowrap;}
${C} .igs-combat-unit-name::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-14deg);background:linear-gradient(90deg,rgba(214,140,74,.5),rgba(150,92,52,.28));}
${C} .igs-combat-unit[data-side="enemy"] .igs-combat-unit-name::before{background:linear-gradient(90deg,rgba(128,24,46,.72),rgba(62,14,30,.5));}
${C} .igs-combat-unit-name>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${C} .igs-combat-block{flex:none;display:inline-flex;align-items:center;gap:2px;color:var(--igs-cb-skill);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;}
${C} .igs-combat-block svg{width:13px;height:13px;stroke-width:1.6;}
${C} .igs-combat-hp{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;margin-top:4px;}
${C} .igs-combat-hp-track{position:relative;height:6px;border-radius:1px;background:rgba(255,255,255,.14);overflow:hidden;transform:skewX(-14deg);}
${C} .igs-combat-hp-track i{position:absolute;left:0;top:0;bottom:0;width:var(--igs-combat-hp,100%);border-radius:0;background:linear-gradient(90deg,color-mix(in srgb,var(--igs-cb-life) 42%,#fff),var(--igs-cb-life));transition:width .3s var(--igs-cb-ease);}
${C} .igs-combat-unit[data-side="enemy"] .igs-combat-hp-track i{background:linear-gradient(90deg,color-mix(in srgb,var(--igs-cb-attack) 42%,#fff),var(--igs-cb-attack));}
${C} .igs-combat-hp-value{font-size:10px;font-weight:600;color:var(--igs-cb-ink-soft);font-variant-numeric:tabular-nums;}
/* 格挡与状态覆盖在立绘右下角，限制在本单位宽度内，不参与名牌或队列的尺寸计算。 */
${C} .igs-combat-unit-badges{position:absolute;right:2px;bottom:calc(100% + 2px);z-index:1;display:flex;flex-direction:column;align-items:flex-end;gap:3px;max-width:100%;pointer-events:none;}
${C} .igs-combat-unit-badges>.igs-combat-block{max-width:100%;box-sizing:border-box;padding:0 4px;background:var(--igs-cb-veil);line-height:15px;}
${C} .igs-combat-statuses{display:flex;flex-wrap:wrap-reverse;justify-content:flex-end;gap:3px;max-width:100%;max-height:33px;overflow:hidden;pointer-events:none;}
${C} .igs-combat-statuses span{height:15px;padding:0 5px;border-radius:var(--igs-cb-r-s);background:var(--igs-cb-veil);color:var(--igs-cb-ink-soft);font-size:11px;font-weight:500;line-height:15px;white-space:nowrap;font-variant-numeric:tabular-nums;text-shadow:none;}
${C} .igs-combat-statuses b{color:var(--igs-cb-ink);font-weight:700;}
/* 带注释的状态片与资源项：悬停或点按弹出 .igs-combat-scale-tip；外层容器不接收指针，这里单独打开。 */
${C} :is(.igs-combat-statuses,.igs-cx-canvas) [data-status][data-scale-tip],${C} .cx-res[data-scale-tip]{pointer-events:auto;cursor:help;}
/* 规则 v5 主战者资源条：我方一排末尾独占一行、居中；每项为深色小底加图形与数值，无描边。法珠 16px 一颗，10 槽约 178px，竖屏 320px 宽仍放得下。 */
${C} .igs-combat-hero:has(>.igs-combat-res){flex-wrap:wrap;row-gap:6px;}
${C} .igs-combat-hero>.igs-combat-res{order:9;flex:0 0 100%;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 6px;min-width:0;}
${C} .igs-combat-res-item{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;border-radius:var(--igs-cb-r-s);background:var(--igs-cb-veil);color:var(--igs-cb-ink-soft);font-size:11px;font-weight:600;line-height:20px;font-variant-numeric:tabular-nums;white-space:nowrap;}
${C} .cx-res-ico{flex:none;width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}
${C} .igs-combat-res-item b{color:var(--igs-cb-ink);font-weight:700;}
${C} .igs-combat-res-item[data-res="radiance"]{color:var(--igs-cb-warm);}
${C} .igs-combat-res-item[data-res="forge"]{color:var(--igs-cb-attack);}
${C} .igs-combat-res-item[data-res="minion"]{color:var(--igs-cb-life);}
${C} .igs-combat-res-item[data-stance="calm"]{color:var(--igs-cb-skill);}
${C} .igs-combat-res-item[data-stance="wrath"]{color:var(--igs-cb-attack);}
${C} .igs-combat-res-item[data-stance="divinity"]{color:var(--igs-cb-warm);}
${C} .cx-orbs{display:flex;flex-wrap:wrap;justify-content:center;gap:2px;}
${C} .cx-orb{flex:none;width:16px;height:16px;}
${C} .cx-orb circle{fill:rgba(255,255,255,.12);}
${C} .cx-orb[data-orb] circle{fill:var(--orb);}
${C} .cx-orb path{fill:rgba(20,20,24,.72);stroke:none;}
${C} .cx-orb[data-orb="frost"] path{fill:none;stroke:rgba(20,20,24,.72);stroke-width:1.4;stroke-linecap:round;}
${C} .cx-orb[data-orb="lightning"]{--orb:#f0d27a;}
${C} .cx-orb[data-orb="frost"]{--orb:#8fd0f5;}
${C} .cx-orb[data-orb="dark"]{--orb:#a98ad8;}
${C} .cx-orb[data-orb="plasma"]{--orb:#f2a35c;}
${C} .cx-orb[data-orb="glass"]{--orb:#9fe8dc;}
${C} .cx-pips{display:inline-flex;gap:2px;}
${C} .cx-pips i{width:5px;height:9px;border-radius:1px;background:rgba(255,255,255,.14);transform:skewX(-14deg);}
${C} .cx-pips i.is-on{background:currentColor;}
${C} .cx-res-hp{position:relative;width:40px;height:5px;border-radius:1px;background:rgba(255,255,255,.14);overflow:hidden;transform:skewX(-14deg);}
${C} .cx-res-hp i{position:absolute;left:0;top:0;bottom:0;width:var(--p,0%);background:currentColor;}
/* 画布皮肤：资源行复用皮肤自己的状态片（.chips / .chip），颜色与底色随皮肤；主战者信息区只有 112–196px 宽，法珠缩到 12px 并在片内换行，10 槽排两行。 */
${C} #igs-cx-canvas .cx-res-row{flex-wrap:wrap;}
${C} #igs-cx-canvas .cx-res-row>.cx-res[data-res="orbs"]{height:auto;max-width:100%;flex-wrap:wrap;}
${C} #igs-cx-canvas .cx-res-row .cx-orbs{flex:1 1 auto;min-width:0;justify-content:flex-start;}
${C} #igs-cx-canvas .cx-res-row .cx-orb{width:12px;height:12px;}
${C} #igs-cx-canvas .cx-res-row .cx-res-ico{width:11px;height:11px;}

${C} .igs-combat-intent{--it:var(--igs-cb-warm);position:relative;z-index:1;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0 4px;align-self:center;box-sizing:border-box;width:max-content;max-width:calc(100% + var(--e-gap,0px) - 4px);min-height:24px;margin-bottom:-4px;padding:2px 8px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-veil);color:var(--igs-cb-ink-soft);font-size:12px;font-weight:600;letter-spacing:.04em;line-height:1.25;text-align:center;box-shadow:0 6px 14px -8px rgba(0,0,0,.7);}
${C} .igs-combat-intent:is([data-intent^="attack"],[data-intent="explode"]){--it:var(--igs-cb-attack);}
${C} .igs-combat-intent[data-intent^="defend"]{--it:var(--igs-cb-skill);}
${C} .igs-combat-intent[data-intent="heal"]{--it:var(--igs-cb-life);}
${C} .igs-combat-intent[data-intent="debuff"]{--it:var(--igs-cb-power);}
${C} .igs-combat-intent-icon{flex:none;display:inline-flex;align-items:center;gap:3px;color:var(--it);}
${C} .igs-combat-intent-icon svg{width:16px;height:16px;stroke-width:1.8;}
${C} .igs-combat-intent :is(.igs-combat-intent-value,.igs-combat-intent-kind){flex:none;color:var(--it);font-weight:700;}
${C} .igs-combat-intent-value{font-size:17px;line-height:1;font-variant-numeric:tabular-nums;}
${C} .igs-combat-intent-name{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;}
/* 战前对阵（格斗游戏式）：铺满面板、不走卡片。顶部是遭遇名斜切横幅带档位，中间 我方 · VS · 敌方（横屏左右；竖屏见 LOBBY_STACK），底部操作。
   舞台底层 .igs-combat-lobby-fx：我方半区偏暖、敌方半区偏冷红并压暗，VS 所在一段不铺色块；底层带裁切、自成层叠上下文，白闪 .igs-combat-lobby-flash 由面板控制器在首次画出战前时挂到面板根节点（与 .igs-combat-body / .igs-combat-fx 并列），铺满整个面板，不拦点击。我方每人一块街霸式平行四边形立绘框，铺满本侧色块：框高随舞台、框宽按人数均分，
   斜边水平跨度为 --cut，相邻框斜边相扣、留 --l-slot 窄缝；外侧框斜边以外的底层色块裁掉（横屏裁左端，竖屏裁我方一排的左右两端，见 LOBBY_STACK）。名牌是框底色带（高 --band），选中的主战者框底提亮（data-picked）。敌人不用立绘框：站立立绘宽 --l-foe（首领档 1.2 倍），
   按每排人数（--k）均分、不按总人数压缩，偶数位抬高一截错落排开，4 名以上分前后两排。入场（data-intro）双方冲入、白闪与震屏；减少动态效果只留静态斜切，低画质不画白闪。 */
${C} .igs-combat-lobby{--l-foe:128px;--l-gap:16px;--l-slot:6px;--cut:clamp(16px,9cqh,56px);--band:34px;--vs:clamp(48px,min(14cqh,8cqw),96px);flex:1 0 auto;display:flex;flex-direction:column;gap:10px;padding:2px 0 6px;}
${C} .igs-combat-lobby-top{position:relative;z-index:1;display:flex;justify-content:center;}
${C} .igs-combat-lobby-banner{position:relative;isolation:isolate;display:flex;align-items:center;gap:14px;max-width:min(92%,640px);box-sizing:border-box;padding:6px 34px 7px calc(34px + .2em);}
${C} .igs-combat-lobby-banner::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-18deg);background:linear-gradient(90deg,rgba(226,160,96,.92),rgba(170,96,62,.84) 56%,rgba(132,26,48,.86));}
${C} .igs-combat-lobby-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:20px;font-style:italic;font-weight:800;letter-spacing:.2em;line-height:1.3;text-shadow:0 2px 4px rgba(0,0,0,.45);}
${C} .igs-combat-lobby-tier{flex:none;padding:1px 10px 1px calc(10px + .3em);background:#fff3d6;color:var(--igs-cb-on-ink);font-size:12px;font-style:italic;font-weight:800;letter-spacing:.3em;transform:skewX(-18deg);}
${C} .igs-combat-lobby[data-tier="elite"] .igs-combat-lobby-tier{background:var(--igs-cb-warm);}
${C} .igs-combat-lobby[data-tier="boss"] .igs-combat-lobby-tier{background:var(--igs-cb-attack);color:#fff;}
${C} .igs-combat-lobby-stage{--vsw:calc(var(--vs) * 1.4 + 8px);position:relative;isolation:isolate;flex:1;display:grid;grid-template-columns:minmax(0,1fr) var(--vsw) minmax(0,1fr);grid-template-areas:"ally vs enemy";align-items:stretch;gap:var(--l-gap);}
${C} .igs-combat-lobby-fx{--e:calc(50% + var(--vsw) / 2 + var(--l-gap));position:absolute;inset:0;overflow:hidden;pointer-events:none;-webkit-clip-path:polygon(var(--cut) 0,100% 0,calc(100% - var(--cut)) 100%,0 100%);clip-path:polygon(var(--cut) 0,100% 0,calc(100% - var(--cut)) 100%,0 100%);}
${C} .igs-combat-lobby-fx i{position:absolute;inset:0;z-index:-1;}
/* 分屏：外轮廓是平行四边形（两端斜边跨度 --cut、同向）；我方色块止于我方区右缘（与最后一个立绘框斜边重合），敌方色块从敌方区左缘（--e）起铺、斜边同向；VS 所在的中间一列不铺色块，露出场景底图。VS 列宽固定为 --vsw 以便算出两侧边缘。 */
${C} .igs-combat-lobby-fx .is-ally{clip-path:polygon(0 0,calc(100% - var(--e)) 0,calc(100% - var(--e) - var(--cut)) 100%,0 100%);background:linear-gradient(90deg,rgba(242,166,92,.34),rgba(242,196,128,.12) 62%,rgba(242,196,128,.05));}
${C} .igs-combat-lobby-fx .is-enemy{clip-path:polygon(calc(var(--e) + var(--cut)) 0,100% 0,100% 100%,var(--e) 100%);background:linear-gradient(270deg,rgba(10,8,18,.7),rgba(150,26,48,.4) 60%,rgba(120,22,44,.28));}
${C}>.igs-combat-lobby-flash{position:absolute;inset:0;z-index:3;pointer-events:none;background:var(--ce-flash,#fff);opacity:0;animation:igs-combat-lobby-flash .42s .48s ease-out both;}
${C} .igs-combat-lobby-side{display:flex;justify-content:center;min-width:0;}
${C} .igs-combat-lobby-side.is-ally{grid-area:ally;align-items:stretch;min-height:120px;}
${C} .igs-combat-lobby-side.is-enemy{grid-area:enemy;align-self:center;align-items:flex-end;gap:var(--l-gap);}
${C} .igs-combat-lobby-figure{position:relative;min-width:0;margin:0;}
/* 我方立绘框：每框同一个平行四边形，铺满本侧色块，立绘层贴满整框，立绘 cover、取景偏上保住头部；外侧框斜边以外的底层色块由 .igs-combat-lobby-fx 的裁切去掉。框色调 --ft 取该角色立绘压到 25×25 后的最亮色（行内 --igs-combat-ally-tint，值为 r,g,b），没有时用默认暖金：框底是面板同系深色，头部位置打一圈 --ft 光晕，名牌色带同色；选中的主战者光晕与色带加强。 */
${C} .igs-combat-lobby-figure[data-side="ally"]{flex:1 1 0;display:block;-webkit-clip-path:polygon(var(--cut) 0,100% 0,calc(100% - var(--cut)) 100%,0 100%);clip-path:polygon(var(--cut) 0,100% 0,calc(100% - var(--cut)) 100%,0 100%);--ft:var(--igs-combat-ally-tint,242,196,128);background:radial-gradient(120% 70% at 55% 18%,rgba(var(--ft),.5),rgba(var(--ft),.16) 55%,transparent 80%),linear-gradient(180deg,rgba(${N},.42),rgba(${N},.72));}
${C} .igs-combat-lobby-figure[data-side="ally"]+.igs-combat-lobby-figure{margin-left:calc(var(--l-slot) - var(--cut));}
${C} .igs-combat-lobby-figure[data-picked]{z-index:2;background:radial-gradient(120% 75% at 55% 18%,rgba(var(--ft),.8),rgba(var(--ft),.3) 55%,transparent 82%),linear-gradient(180deg,rgba(${N},.3),rgba(${N},.62));}
${C} .igs-combat-lobby-figure[data-side="ally"] .igs-combat-portrait[data-side]{position:absolute;inset:0;width:auto;height:auto;max-height:none;aspect-ratio:auto;}
${C} .igs-combat-lobby-figure[data-side="ally"] .igs-combat-portrait[data-side] img{height:100%;max-height:none;object-fit:cover;object-position:50% 10%;}
/* 敌人：不用立绘框，站立立绘下接斜切名牌；宽 --l-foe（首领档 1.2 倍），按每排人数（--k）均分，偶数位抬高一截错落排开。有图的敌人立绘按图片比例收缩（高度上限 3:4），横图怪物站在底线上；剪影与图集格保持 3:4。 */
${C} .igs-combat-lobby-figure[data-side="enemy"]{--w:var(--l-foe);flex:none;display:flex;flex-direction:column;align-items:center;width:min(var(--w),calc((100% - (var(--k,1) - 1) * var(--l-gap)) / var(--k,1)));}
${C} .igs-combat-lobby-figure[data-tier="boss"]{--w:calc(var(--l-foe) * 1.2);}
${C} .igs-combat-lobby-side.is-enemy .igs-combat-lobby-figure:nth-child(2n){margin-bottom:calc(var(--w) * .14);}
/* 敌人两排（data-rows，4 名以上）：每排按 --k 均分宽度；后排在后、略暗，前排上移约 0.6 个立绘宽压住后排下沿（百分比外边距按宽度计算）。 */
${C} .igs-combat-lobby-side.is-enemy[data-rows]{flex-direction:column;align-items:stretch;justify-content:center;}
${C} .igs-combat-lobby-row{display:flex;justify-content:center;align-items:flex-end;gap:var(--l-gap);min-width:0;}
${C} .igs-combat-lobby-row.is-back{filter:brightness(.82);}
${C} .igs-combat-lobby-row.is-front{position:relative;z-index:1;margin-top:calc(min(var(--l-foe),calc((100% - (var(--k,1) - 1) * var(--l-gap)) / var(--k,1))) * -.6);}
${C} .igs-combat-lobby-figure[data-side="enemy"] .igs-combat-portrait[data-side]{width:100%;height:auto;max-height:none;aspect-ratio:3/4;}
${C} .igs-combat-lobby-figure[data-side="enemy"] .igs-combat-portrait[data-side]:has(img){aspect-ratio:auto;max-height:calc(var(--w) * 4 / 3);}
${C} .igs-combat-lobby-figure[data-side="enemy"] .igs-combat-portrait[data-side] img{height:auto;max-height:calc(var(--w) * 4 / 3);}
/* 名牌：平行四边形色块（::before，无描边）；名字在前，Lv 与职业缩小；托管、首领是斜标。敌人名牌是立绘下方的独立斜切色块，压住立绘下沿，冷红色；
   我方名牌铺满立绘框（可操控角色即整框可点的选择按钮），框底是暖色色带，文字让开右下斜角，选中时色带亮起。键盘焦点画在名字上（框外的焦点环会被斜切裁掉）。 */
${C} .igs-combat-plate{position:relative;isolation:isolate;z-index:1;display:flex;align-items:baseline;justify-content:center;gap:6px;width:100%;max-width:100%;box-sizing:border-box;min-height:34px;margin:-12px 0 0;padding:5px 14px;border:0;background:none;color:var(--igs-cb-ink);font:inherit;letter-spacing:.04em;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.6);}
${C} .igs-combat-plate::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-16deg);background:linear-gradient(90deg,rgba(214,140,74,.86),rgba(150,92,52,.78));}
${C} .igs-combat-lobby-figure[data-side="enemy"] .igs-combat-plate::before{background:linear-gradient(90deg,rgba(128,24,46,.92),rgba(62,14,30,.86));}
${C} .igs-combat-plate b{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:16px;font-weight:800;letter-spacing:.06em;line-height:1.2;}
${C} .igs-combat-plate small{flex:none;color:rgba(255,244,226,.78);font-size:11px;font-weight:600;line-height:1.2;}
/* 我方名牌一行：固定一行高、可换行并裁掉第二行；名字可缩（省略号），Lv 与职业不缩，放不下就整段落到被裁掉的下一行。 */
${C} .igs-combat-plate-row{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:5px;min-width:0;max-width:100%;height:20px;overflow:hidden;}
${C} .igs-combat-plate-row>*{line-height:20px;}
${C} .igs-combat-plate-row small+small::before{content:"· ";}
${C} .igs-combat-plate em{position:absolute;right:-4px;top:-14px;padding:0 7px;font-size:10px;font-style:italic;font-weight:800;letter-spacing:.16em;line-height:16px;transform:skewX(-16deg);}
${C} .igs-combat-lobby-figure[data-side="ally"] .igs-combat-plate{position:absolute;inset:0;width:auto;min-height:0;align-items:flex-end;margin:0;padding:0 calc(var(--cut) + 8px) calc(var(--band) * .22) 8px;}
${C} .igs-combat-lobby-figure[data-side="ally"] .igs-combat-plate::before{inset:auto 0 0;height:var(--band);transform:none;background:linear-gradient(90deg,rgba(var(--ft),.46),rgba(var(--ft),.2)),linear-gradient(rgba(${N},.88),rgba(${N},.88));}
${C} .igs-combat-lobby-figure[data-picked] .igs-combat-plate::before{background:linear-gradient(90deg,rgba(var(--ft),.58),rgba(var(--ft),.3)),linear-gradient(rgba(${N},.84),rgba(${N},.84));}
${C} .igs-combat-lobby-figure[data-side="ally"] .igs-combat-plate em{right:10px;top:8px;}
${C} .igs-combat-plate em[data-tag="auto"]{background:rgba(${N},.86);color:var(--igs-cb-ink-soft);}
${C} .igs-combat-plate em[data-tag="boss"]{background:var(--igs-cb-attack);color:#fff;}
${C} button.igs-combat-plate{cursor:pointer;transition:color .18s var(--igs-cb-ease);}
${C} button.igs-combat-plate:hover::before{filter:brightness(1.15);}
${C} button.igs-combat-plate:focus-visible{outline:none;}
${C} button.igs-combat-plate:focus-visible b{outline:2px solid var(--igs-cb-warm);outline-offset:2px;}
${C} button.igs-combat-plate[aria-pressed="true"]{color:var(--igs-cb-on-ink);text-shadow:none;}
${C} button.igs-combat-plate[aria-pressed="true"]::before{background:linear-gradient(90deg,#f7dfaa,#e9a35a);}
${C} button.igs-combat-plate[aria-pressed="true"] small{color:rgba(${N},.7);}
${C} .igs-combat-lobby-vs{grid-area:vs;position:relative;z-index:2;display:grid;place-items:center;padding:0 4px;}
${C} .igs-combat-lobby-vs b{position:relative;display:block;padding-right:.08em;color:#fff3d6;font-size:var(--vs);font-style:italic;font-weight:900;letter-spacing:.02em;line-height:1;text-shadow:0 2px 6px rgba(0,0,0,.6);}
${C} .igs-combat-lobby :is(.igs-combat-lobby-absent,.igs-combat-lobby-reward,.igs-combat-actions){position:relative;z-index:1;justify-content:center;}
${C} .igs-combat-lobby .igs-combat-actions{gap:18px;}
${C} .igs-combat-lobby [data-combat-act="skip"]{background:transparent;}
${C} .igs-combat-lobby [data-combat-act="skip"]:hover{background:var(--igs-cb-fill-hover);}
${C} .igs-combat-lobby [data-combat-act="start"]{position:relative;isolation:isolate;min-height:48px;padding:10px 46px 10px calc(46px + .3em);background:none;font-size:18px;font-style:italic;font-weight:800;letter-spacing:.3em;}
${C} .igs-combat-lobby [data-combat-act="start"]::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-18deg);background:linear-gradient(90deg,#f7dfaa,#e9a35a);box-shadow:0 10px 22px -10px rgba(233,163,90,.8);}
${C} .igs-combat-lobby[data-intro] .igs-combat-lobby-banner{animation:igs-combat-lobby-banner .45s var(--igs-cb-ease) both;}
${C} .igs-combat-lobby[data-intro] .igs-combat-lobby-side.is-ally{animation:igs-combat-lobby-from-l .5s var(--igs-cb-ease) both;}
${C} .igs-combat-lobby[data-intro] .igs-combat-lobby-side.is-enemy{animation:igs-combat-lobby-from-r .5s var(--igs-cb-ease) both;}
${C} .igs-combat-lobby[data-intro] .igs-combat-lobby-stage{animation:igs-combat-lobby-shake .3s .5s linear both;}
${C}[data-igs-combat-reduced] .igs-combat-lobby :is(.igs-combat-lobby-side,.igs-combat-lobby-stage,.igs-combat-lobby-banner,.igs-combat-lobby-fx i){animation:none!important;}
${C}[data-igs-combat-reduced] .igs-combat-lobby-flash,#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-lobby-flash{display:none;}
@keyframes igs-combat-lobby-from-l{from{opacity:0;transform:translateX(-46%) skewX(-10deg);}70%{opacity:1;transform:translateX(3%) skewX(-2deg);}to{opacity:1;transform:none;}}
@keyframes igs-combat-lobby-from-r{from{opacity:0;transform:translateX(46%) skewX(10deg);}70%{opacity:1;transform:translateX(-3%) skewX(2deg);}to{opacity:1;transform:none;}}
@keyframes igs-combat-lobby-from-t{from{opacity:0;transform:translateY(-40%);}70%{opacity:1;transform:translateY(3%);}to{opacity:1;transform:none;}}
@keyframes igs-combat-lobby-from-b{from{opacity:0;transform:translateY(40%);}70%{opacity:1;transform:translateY(-3%);}to{opacity:1;transform:none;}}
@keyframes igs-combat-lobby-flash{0%{opacity:.75;}100%{opacity:0;}}
@keyframes igs-combat-lobby-shake{0%,100%{transform:none;}20%{transform:translate(-4px,2px);}40%{transform:translate(4px,-2px);}60%{transform:translate(-3px,1px);}80%{transform:translate(2px,-1px);}}
@keyframes igs-combat-lobby-banner{from{opacity:0;transform:translateX(-12%) skewX(-12deg);}to{opacity:1;transform:none;}}
${C} .igs-combat-foot{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"hero hand turn";align-items:end;gap:14px;padding:2px 16px 12px;background:linear-gradient(180deg,rgba(${N},0),rgba(${N},.5));}
${C} .igs-combat-foot.is-ended{display:flex;justify-content:center;}
${C} .igs-combat-dock{display:none;}
/* 窄面板操作区：能量槽、主动特性圆球组与觉醒 / 道具依次移入手牌下方左列（竖向一排没有余高放头像上方的圆球），回合操作保留右列。 */
${C}[data-igs-combat-docked] .igs-combat-foot:not(.is-ended){grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"hero hero" "hand hand" "dock turn";}
${C}[data-igs-combat-docked] .igs-combat-hero{--hero-controls-space:0px;}
${C}[data-igs-combat-docked] .igs-combat-dock{grid-area:dock;display:flex;align-items:center;gap:10px;min-width:0;padding-top:6px;}
${C}[data-igs-combat-docked] .igs-combat-dock>.igs-combat-energy{position:static;flex:none;}
${C}[data-igs-combat-docked] .igs-combat-dock>.igs-combat-controls{flex:none;}
${C}[data-igs-combat-docked] .igs-combat-dock>.igs-combat-trait-ring{position:static;flex:none;display:flex;gap:4px;aspect-ratio:auto;}
${C}[data-igs-combat-docked] .igs-combat-dock>.igs-combat-trait-ring>.igs-combat-trait{position:relative;left:auto;right:auto;top:auto;margin:0;translate:none;}
/* 队友与敌人的自动行动演出播放中（根节点 data-igs-combat-auto）：底栏不接收点击，播完再出牌。 */
${C}[data-igs-combat-auto] .igs-combat-foot{pointer-events:none;}
${C} .igs-combat-hero{grid-area:hero;display:flex;align-items:flex-end;gap:14px;min-width:0;}
/* 主战者一组：圆框半身像靠左（能量叠在左上角，主动特性圆球在头像右上方外侧，觉醒 / 道具两块小长方形按钮在头像左下方圆框外沿），回合按钮在右下角 .igs-combat-turn。 */
${C} .igs-combat-hero-core{flex:none;display:flex;align-items:center;gap:8px;}
${C} .igs-combat-hero-figure:has(>.igs-combat-controls){margin-left:10px;}
/* 能量圆标叠在主战者圆框头像左上角（方框角落在圆外）。 */
${C} .igs-combat-hero-figure{position:relative;flex:none;}
${C} .igs-combat-hero-figure>.igs-combat-energy{position:absolute;left:-6px;top:-6px;z-index:2;flex-direction:column;gap:2px;}
/* 右下角回合操作组：底栏网格区（宽屏第三列，竖屏 / 窄屏手牌下方一排靠右）；按钮扁平（宽大于高、无阴影），撤退透明底并与结束回合拉开间距，结束回合在最右的角落。 */
${C} .igs-combat-turn{grid-area:turn;justify-self:end;display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
${C} .igs-combat-turn-btns{display:flex;align-items:center;gap:10px;}
/* 右上角行动条：SVG 细线 + 右端菱形出手点；头像按 --p 沿线定位（我方线上、敌方线下），位置变化 0.5s 过渡；is-snap 时瞬移（出手者回到起点）。操控角色暖色环，我方绿环、敌方红环；正在出手的头像与立绘外发光。 */
${C} .igs-combat-head>.igs-combat-track{margin-left:auto;}
${C} .igs-combat-head>.igs-combat-track+[data-combat-act="close"]{margin-left:8px;}
${C} .igs-combat-track{--dot:22px;position:relative;flex:0 1 min(46%,360px);min-width:140px;height:calc(2 * var(--dot) + 8px);}
${C} .igs-combat-track-line{position:absolute;left:0;top:50%;width:calc(100% - var(--dot) / 2);height:12px;transform:translateY(-50%);overflow:visible;fill:none;stroke:rgba(236,234,230,.5);stroke-width:1.2;stroke-linecap:round;}
${C} .igs-combat-track-line .is-tick{stroke:rgba(236,234,230,.3);}
${C} .igs-combat-track-goal{position:absolute;left:calc(100% - var(--dot) / 2);top:50%;width:12px;height:12px;transform:translate(-50%,-50%);fill:var(--igs-cb-warm);filter:drop-shadow(0 0 4px rgba(242,212,155,.6));}
${C} .igs-combat-track-dot{--ring:var(--igs-cb-life);position:absolute;left:calc(var(--p,0) * (100% - var(--dot)));bottom:calc(50% + 3px);z-index:1;display:grid;place-items:center;box-sizing:border-box;width:var(--dot);height:var(--dot);border-radius:50%;overflow:hidden;background:rgba(${N},.78);box-shadow:0 0 0 1.5px var(--ring);color:var(--igs-cb-ink);font-size:10px;font-weight:600;line-height:1;transition:left .5s cubic-bezier(.4,0,.2,1),box-shadow .18s var(--igs-cb-ease);}
${C} .igs-combat-track-dot[data-side="enemy"]{--ring:var(--igs-cb-attack);bottom:auto;top:calc(50% + 3px);}
${C} .igs-combat-track-dot[data-controlled]{--ring:var(--igs-cb-warm);}
${C} .igs-combat-track-dot.is-snap{transition:none;}
${C} .igs-combat-track-dot.is-acting{z-index:2;box-shadow:0 0 0 2px var(--igs-cb-warm),0 0 10px rgba(242,212,155,.6);}
${C} .igs-combat-track-dot img{width:100%;height:100%;object-fit:cover;object-position:50% 0;transform:scale(1.6);transform-origin:50% 0;}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-track-dot{transition:none;}}
${C} .igs-combat-unit.is-acting .igs-combat-portrait :is(img,svg,.igs-combat-art){filter:drop-shadow(0 0 6px rgba(242,212,155,.95)) drop-shadow(0 0 16px rgba(242,212,155,.6));}
${C} .igs-combat-unit[data-side="ally"].is-acting .igs-combat-portrait{box-shadow:0 0 0 2px var(--igs-cb-warm),0 0 16px rgba(242,212,155,.55);}
/* 我方圆框头像可选为目标 / 承受方时：圆框外暖色环 + 外发光（圆框内立绘被裁切，drop-shadow 看不到）。 */
${C} .igs-combat-unit[data-side="ally"].is-targetable .igs-combat-portrait{box-shadow:0 0 0 2px var(--igs-cb-warm),0 0 16px rgba(242,212,155,.55);}
${C} .igs-combat-unit[data-side="ally"].is-targetable:is(:hover,.is-drop-hover) .igs-combat-portrait{box-shadow:0 0 0 2.5px var(--igs-cb-warm),0 0 22px rgba(242,212,155,.75);}
/* 呼吸：IGS「立绘活动 → 待机呼吸」开启时控制器在面板根节点写 data-igs-combat-breathe；只动独立的 scale 属性，不占我方头像裁切用的 transform；倒下的单位不呼吸，按序号错开相位；低画质档停。 */
${C}[data-igs-combat-breathe] .igs-combat-unit:not(.is-down) .igs-combat-portrait :is(img,svg,.igs-combat-art){animation:igs-combat-breathe 4.6s ease-in-out infinite;}
${C}[data-igs-combat-breathe] .igs-combat-unit:nth-child(2n) .igs-combat-portrait :is(img,svg,.igs-combat-art){animation-delay:-1.6s;}
${C}[data-igs-combat-breathe] .igs-combat-unit:nth-child(3n) .igs-combat-portrait :is(img,svg,.igs-combat-art){animation-delay:-3s;}
${C} .igs-combat-portrait[data-side="enemy"] :is(img,svg,.igs-combat-art){transform-origin:50% 100%;}
#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-portrait :is(img,svg,.igs-combat-art){animation:none;}
@keyframes igs-combat-breathe{0%,100%{scale:1 1;}50%{scale:1.004 1.011;}}
/* 队友小圆头像排成一排、底边对齐，不换行也不上下错位。 */
${C} .igs-combat-hero>.igs-combat-side.is-ally{align-items:flex-end;flex-wrap:nowrap;}
${C} .igs-combat-turn .igs-combat-btn{box-shadow:none;}
${C} .igs-combat-turn [data-combat-act="escape"]{background:transparent;color:var(--igs-cb-ink-soft);}
${C} .igs-combat-turn [data-combat-act="escape"]:hover{background:var(--igs-cb-fill-hover);color:var(--igs-cb-ink);}
${C} .igs-combat-hero .igs-combat-side{gap:8px;flex-wrap:nowrap;}
${C} .igs-combat-hero>.igs-combat-side.is-ally{flex:0 1 auto;min-width:0;}
${C} .igs-combat-hero .igs-combat-side.is-ally .igs-combat-unit{flex:0 1 auto;min-width:0;}

/* 主动特性圆球（助手 10-29，最多 2 颗）：都在主战者圆框头像右上方外沿、球的边缘贴着圆框（离框约 3px），落在队友头像稍上方；固有在前。
   1 颗时球心在方位 -30.5°（球心距圆心 = 圆框半径 + 球半径 + 3px，--c / --s 为其余弦与正弦）；2 颗时以该方位为中线沿圆框切向各让开半颗球加 3px（--k 为 -1 / 1，间距 6px），
   径向收进 2px 抵消切向偏出，两颗都贴着圆框、彼此挨着，不随头像大小拉开；不另占一栏、不挤队友，没有队友时头像右侧留出两颗球宽。
   圆球组 .igs-combat-trait-ring 盖住头像区域、自身不接收指针（点头像仍弹单位详情）。
   与卡面同材质的圆形深色底 + 按名称与效果匹配的卡面纹样，暖色图标 + 右上角暖色费用圆标；固有特性为暖色细环，抽到的特性细环取稀有度色（--rar）。点开的详情见 .igs-combat-scale-tip.is-trait。 */
${C} .igs-combat-hero:not(:has(>.igs-combat-side.is-ally)) .igs-combat-hero-figure:has(>.igs-combat-trait-ring){margin-right:calc(var(--orb,44px) * 2 + 8px);}
/* 只有 1 名队友时队友头像比两颗球窄：队友一栏至少两颗球宽，圆球不伸进手牌区（竖向面板队友一栏是 display:contents，不受影响；窄面板圆球组已移入停靠区）。 */
${C} .igs-combat-hero:has(>.igs-combat-hero-core .igs-combat-trait-ring)>.igs-combat-side.is-ally{min-width:calc(var(--orb,44px) * 2 + 4px);}
${C}{--orb:38px;}
${C} .igs-combat-trait-ring{position:absolute;left:0;right:0;top:0;z-index:2;aspect-ratio:1;pointer-events:none;}
${C} .igs-combat-trait-ring>.igs-combat-trait{--c:.8616;--s:-.5075;--k:0;position:absolute;left:calc(50% + (50% + var(--orb,44px) / 2 + 3px - 2px * var(--k) * var(--k)) * var(--c) - (var(--orb,44px) / 2 + 3px) * var(--k) * var(--s));top:calc(50% + (50% + var(--orb,44px) / 2 + 3px - 2px * var(--k) * var(--k)) * var(--s) + (var(--orb,44px) / 2 + 3px) * var(--k) * var(--c));translate:-50% -50%;pointer-events:auto;touch-action:none;}
${C} .igs-combat-trait-ring>.igs-combat-trait:first-child:not(:only-child){--k:-1;}
${C} .igs-combat-trait-ring>.igs-combat-trait+.igs-combat-trait{--k:1;}
${C} .igs-combat-trait{--ring:rgba(242,212,155,.38);position:relative;flex:none;padding:0;border:0;border-radius:50%;background:none;color:var(--igs-cb-warm);font:inherit;cursor:pointer;}
${C} .igs-combat-trait[data-rarity]{--ring:color-mix(in srgb,var(--rar) 70%,transparent);}
${C} .igs-combat-trait-orb{position:relative;display:grid;place-items:center;width:var(--orb,44px);height:var(--orb,44px);border-radius:50%;background:${igsUiSurface(IGS_UI_THICKNESS.thick)};box-shadow:0 0 0 1.5px var(--ring),0 8px 18px -8px rgba(0,0,0,.75),${IGS_UI_EDGE_NIGHT};transition:transform .18s var(--igs-cb-ease),filter .18s var(--igs-cb-ease),box-shadow .18s var(--igs-cb-ease);}
${C} .igs-combat-trait-orb svg{width:19px;height:19px;stroke-width:1.5;}
${C} .igs-combat-trait:not(.is-disabled):hover .igs-combat-trait-orb{filter:brightness(1.15);transform:translateY(-1px);}
${C} .igs-combat-trait.is-selected .igs-combat-trait-orb{transform:translateY(-1px);box-shadow:0 0 0 2px var(--igs-cb-warm),0 0 14px rgba(242,212,155,.45),0 8px 16px -8px rgba(0,0,0,.75);}
${C} .igs-combat-trait.is-disabled{opacity:.5;}
${C} .igs-combat-trait.is-used .igs-combat-trait-orb svg{opacity:.4;}
${C} .igs-combat-trait-cost{position:absolute;right:-3px;top:-3px;display:grid;place-items:center;width:16px;height:16px;border-radius:50%;background:var(--igs-cb-warm);color:#1b1d21;font-size:11px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;text-shadow:none;box-shadow:0 0 0 2px rgba(242,212,155,.18);}
${combatRarityStyle(`${C} .igs-combat-trait`)}
/* 主动特性圆球拖动发动（与拖牌同一套）：拖动中原圆球隐藏，影子圆球（演出层 .is-flying.is-held）跟随指针并放大，停在可承受的单位上时缩小示意松手即发动。 */
${C} .igs-combat-trait.is-lifted{opacity:0;}
/* 拖动中（拖牌或拖圆球）圆球不接收指针：松在主战者头像上时命中头像本身，不被盖在头像边界上的圆球挡住。 */
${C}[data-igs-combat-dragging] .igs-combat-trait-ring>.igs-combat-trait{pointer-events:none;}
${C} .igs-combat-fx .igs-combat-trait.is-flying{position:absolute;z-index:6;margin:0;translate:none;pointer-events:none;transform-origin:50% 50%;scale:1.12;transition:scale .14s var(--igs-cb-ease);}
${C} .igs-combat-fx .igs-combat-trait.is-flying.is-armed{scale:.86;}
/* 头像可点开单位详情：手形光标。 */
${C} .igs-combat-portrait[data-combat-act="unit-info"]{cursor:pointer;}
/* 觉醒 / 道具：主战者头像左下角外侧两块竖排的小长方形文字按钮（觉醒在上、道具在下），同宽、扁平无描边。
   觉醒每场一次，只在可用时出现：底色取情绪色（--aw）暗调，背景里光点缓缓上浮、一道斜光扫过（.igs-combat-ctl-fx），低画质与减少动态效果时静止。
   道具点开后在按钮组上方弹出道具列表（.igs-combat-item-menu：图标、名称、暖色余量），点一项直接使用；没有道具时置灰。 */
${C} .igs-combat-controls{position:relative;flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:3px;}
${C} .igs-combat-items{position:relative;display:block;}
/* 圆框头像（横向面板）：按钮组是盖住头像区域的正方形层（与圆球组同法，自身不接收指针）。道具（下）右上角落在圆框外 3px、方位左下 44.8°（cos .709 / sin .705），
   底边与头像底边齐平；觉醒（上）在它上方 3px、左移 17px，沿圆框外沿错开、整块仍在框外。主战者靠左，头像框左侧只留 10px。 */
${C} .igs-combat-hero-figure>.igs-combat-controls{position:absolute;left:0;right:0;top:0;z-index:3;display:block;aspect-ratio:1;pointer-events:none;}
${C} .igs-combat-hero-figure>.igs-combat-controls>*{position:absolute;right:calc(50% + (50% + 3px) * .709);top:calc(50% + (50% + 3px) * .705);pointer-events:auto;}
${C} .igs-combat-hero-figure>.igs-combat-controls>.igs-combat-awaken{right:calc(50% + (50% + 3px) * .709 + 17px);top:calc(50% + (50% + 3px) * .705 - 23px);}
${C} .igs-combat-ctl{position:relative;display:grid;place-items:center;width:34px;height:20px;padding:0;box-sizing:border-box;overflow:hidden;border:0;border-radius:5px;background:rgba(${N},.82);color:var(--igs-cb-ink);font:inherit;font-size:11px;font-weight:600;letter-spacing:.12em;text-indent:.12em;line-height:1;white-space:nowrap;cursor:pointer;transition:filter .18s var(--igs-cb-ease),background .18s var(--igs-cb-ease);}
${C} .igs-combat-ctl:not(.is-disabled):hover,${C} .igs-combat-ctl.is-open{background:var(--igs-cb-fill-hover);}
${C} .igs-combat-ctl.is-disabled{opacity:.45;cursor:default;}
${C} .igs-combat-ctl.igs-combat-awaken{background:color-mix(in srgb,var(--aw) 34%,rgba(${N},.9));color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6);}
${C} .igs-combat-ctl.igs-combat-awaken:hover{filter:brightness(1.15);}
${C} .igs-combat-ctl-label{position:relative;z-index:1;}
${C} .igs-combat-ctl-fx{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,color-mix(in srgb,var(--aw) 70%,#fff) 0 1px,transparent 1.6px),radial-gradient(circle,color-mix(in srgb,var(--aw) 50%,#fff) 0 .8px,transparent 1.3px);background-size:14px 16px,9px 12px;background-position:0 0,5px 3px;animation:igs-combat-ctl-rise 2.6s linear infinite;}
${C} .igs-combat-ctl-fx::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,color-mix(in srgb,var(--aw) 55%,#fff) 50%,transparent 65%);background-size:240% 100%;opacity:.45;animation:igs-combat-ctl-sheen 2.8s ease-in-out infinite;}
@keyframes igs-combat-ctl-rise{to{background-position:0 -16px,5px -9px;}}
@keyframes igs-combat-ctl-sheen{0%{background-position:130% 0;}60%,100%{background-position:-30% 0;}}
#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-ctl-fx,#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-ctl-fx::after,${C}[data-igs-combat-reduced] .igs-combat-ctl-fx,${C}[data-igs-combat-reduced] .igs-combat-ctl-fx::after{animation:none;}
${C} .igs-combat-item-menu{position:absolute;left:0;bottom:calc(100% + 6px);z-index:6;display:flex;flex-direction:column;gap:2px;width:max-content;min-width:132px;max-width:220px;padding:4px;box-sizing:border-box;border-radius:8px;background:${igsUiSurface(IGS_UI_THICKNESS.thick)};box-shadow:0 12px 24px -10px rgba(0,0,0,.8),${IGS_UI_EDGE_NIGHT};}
${C} .igs-combat-item{display:flex;align-items:center;gap:6px;width:100%;padding:5px 8px;box-sizing:border-box;border:0;border-radius:6px;background:none;color:var(--igs-cb-ink);font:inherit;font-size:12px;text-align:left;cursor:pointer;}
/* 觉醒在道具上方时，道具列表再上移一块按钮高，不盖住觉醒。 */
${C} .igs-combat-controls:has(>.igs-combat-awaken) .igs-combat-item-menu{bottom:calc(100% + 29px);}
${C} .igs-combat-item:not(.is-disabled):hover{background:var(--igs-cb-fill-hover);}
${C} .igs-combat-item.is-disabled{opacity:.5;}
${C} .igs-combat-item-icon{flex:none;display:grid;color:var(--igs-cb-life);}
${C} .igs-combat-item-icon svg{width:16px;height:16px;stroke-width:1.5;}
${C} .igs-combat-item-icon img{width:16px;height:16px;object-fit:contain;}
${C} .igs-combat-item-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${C} .igs-combat-item-count{flex:none;display:grid;place-items:center;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:var(--igs-cb-warm);color:#1b1d21;font-size:10px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;}

${C} .igs-combat-energy{flex:none;display:flex;align-items:center;gap:6px;}
/* 能量槽：深色玻璃圆槽 + 暖色细环，里面是暖色液体。液面高度 = 当前 / 每回合（--fill，0–1），用掉多少降多少（控制器用 WAAPI 从上次液面过渡到新液面）；
   液面上两层波纹横向错速流动。空能量时液体沉到槽底以下（--sink）。低画质与减少动态效果时波纹静止、液面直接到位。 */
${C} .igs-combat-energy-orb{position:relative;isolation:isolate;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 30%,rgba(255,255,255,.12),rgba(${N},.9) 72%);color:#fff;line-height:1;font-variant-numeric:tabular-nums;box-shadow:0 0 0 1.5px rgba(242,212,155,.6),0 8px 18px -8px rgba(0,0,0,.6);}
${C} .igs-combat-energy-liquid{position:absolute;inset:0;z-index:0;transform:translateY(calc((1 - var(--fill,0)) * 100% + var(--sink,0px)));background:linear-gradient(180deg,#f7e2b4,var(--igs-cb-warm) 40%,#d8a65a);pointer-events:none;}
${C} .igs-combat-energy-liquid::before,${C} .igs-combat-energy-liquid::after{content:"";position:absolute;left:0;bottom:calc(100% - 1px);width:200%;height:6px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 6' preserveAspectRatio='none'%3E%3Cpath d='M0 3Q5 0 10 3T20 3V6H0Z' fill='%23f7e2b4'/%3E%3C/svg%3E") repeat-x 0 0/50% 100%;animation:igs-combat-wave 2.6s linear infinite;}
${C} .igs-combat-energy-liquid::after{bottom:calc(100% - 2px);opacity:.55;animation-duration:1.7s;animation-direction:reverse;}
${C} .igs-combat-energy.is-empty .igs-combat-energy-liquid{--sink:8px;}
${C} .igs-combat-energy-orb b{position:relative;z-index:1;font-size:18px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.7),0 0 6px rgba(0,0,0,.35);}
${C} .igs-combat-energy.is-empty .igs-combat-energy-orb b{color:var(--igs-cb-ink-faint);}
#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-energy-liquid::before,#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-energy-liquid::after{animation:none;}
@keyframes igs-combat-wave{from{transform:translateX(0);}to{transform:translateX(-50%);}}
${C} .igs-combat-piles{flex:none;display:flex;gap:10px;color:var(--igs-cb-ink-faint);font-size:11px;font-weight:500;letter-spacing:.06em;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.7);}
${C} .igs-combat-piles b{margin-left:3px;color:var(--igs-cb-ink-soft);font-size:12px;font-weight:600;}
/* 回合操作是扁平图标按钮（文字只在 aria-label / title），由 .igs-combat-turn 统一排在右下角。 */
${C} .igs-combat-btn.is-icon{width:52px;min-height:34px;height:34px;padding:0;}
${C} .igs-combat-btn.is-icon svg{width:20px;height:20px;stroke-width:1.6;}
${C} .igs-combat-btn.is-icon.is-primary{width:72px;padding:0;}
/* 待选阶段的确认钮（「弃掉 k/N」）与图标按钮同高，文字不换行。 */
${C} .igs-combat-turn [data-combat-act="choose-confirm"]{min-height:34px;height:34px;padding:0 16px;font-size:13px;letter-spacing:.06em;white-space:nowrap;}
${C} .igs-combat-hand{--igs-card-w:116px;grid-area:hand;position:relative;display:flex;justify-content:center;align-items:flex-end;min-width:0;overflow:visible;padding:20px 28px 2px;}
${C} .igs-combat-card{--igs-card-tint:var(--igs-cb-skill);position:relative;flex:none;display:flex;flex-direction:column;align-items:stretch;gap:4px;width:var(--igs-card-w);min-height:176px;padding:8px 8px 10px;box-sizing:border-box;border:0;border-radius:var(--igs-cb-r-l);background:${igsUiSurface(IGS_UI_THICKNESS.thick)};color:var(--igs-cb-ink);font:inherit;text-align:left;cursor:pointer;box-shadow:0 14px 28px -14px rgba(0,0,0,.7),${IGS_UI_EDGE_NIGHT};transform-origin:50% 130%;transform:translateY(var(--fan-y,0px)) rotate(var(--fan-r,0deg));transition:transform .18s var(--igs-cb-ease),margin .18s var(--igs-cb-ease),box-shadow .18s var(--igs-cb-ease);}
${C} .igs-combat-card[data-card-type="attack"]{--igs-card-tint:var(--igs-cb-attack);}
${C} .igs-combat-card[data-card-type="power"]{--igs-card-tint:var(--igs-cb-power);}
${C} .igs-combat-hand .igs-combat-card+.igs-combat-card{margin-left:min(-30px,calc((100% - var(--fan-n,1) * var(--igs-card-w)) / (var(--fan-n,2) - 1)));}
${C} .igs-combat-card:is(:hover,:focus-visible,.is-selected,.is-hover,.is-chosen){z-index:5;transform:translateY(-22px) rotate(0deg) scale(1.06);}
/* 抬起的牌离开了原来的位置：牌底下补一条透明命中区，盖住抬起让出的空档，指针停在牌下沿时不会因牌上移而失去悬停、来回抖动。 */
${C} .igs-combat-card-hit{position:absolute;left:0;right:0;top:100%;height:0;}
${C} .igs-combat-card:is(:hover,:focus-visible,.is-selected,.is-hover,.is-chosen) .igs-combat-card-hit{height:28px;}
/* 待选阶段：已选的候选牌与选中态同样抬起、暖色环；非候选牌按 is-disabled 置灰。 */
${C} .igs-combat-card:is(.is-selected,.is-chosen){box-shadow:0 0 0 2px var(--igs-cb-warm),0 18px 32px -14px rgba(0,0,0,.75);}
${C} .igs-combat-card.is-disabled{opacity:.5;}
/* 炉石式拖牌：手牌不让给浏览器平移手势；拖动中原牌隐藏，影子卡（演出层 .is-held）跟随指针并放大，停在可承受的单位上时缩小示意松手即打出。 */
${C} .igs-combat-hand .igs-combat-card{touch-action:none;}
/* 画布皮肤的手牌、特性圆球与出牌影子同样不让给浏览器平移手势；面板与画布及内嵌宿主滚动容器不把滚动传给页面。 */
${C} :is(.cx-hand [data-combat-act="card"],.cx-trait[data-combat-act="hero-skill"],.igs-cx-ghost,.igs-cx-ghost *){touch-action:none;}
${C},${C} #igs-cx-canvas{overscroll-behavior:contain;}
[data-igs-embedded-host="1"]:has(#igs-overlay[data-igs-combat-open]){overscroll-behavior:contain;}
${C} .igs-combat-card.is-lifted{opacity:0;}
${C}[data-igs-combat-dragging],${C}[data-igs-combat-dragging] *{cursor:grabbing;}
${C} .igs-combat-fx .igs-combat-card.is-flying.is-held{z-index:6;transform-origin:50% 50%;scale:1.08;transition:scale .14s var(--igs-cb-ease);}
${C} .igs-combat-fx .igs-combat-card.is-flying.is-held.is-armed{scale:.84;}
${C} .igs-combat-card-cost{position:absolute;left:6px;top:6px;z-index:1;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--igs-cb-warm);color:#1b1d21;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;box-shadow:0 0 0 3px rgba(242,212,155,.18);}
${C} .igs-combat-card-name{min-height:22px;padding-left:26px;font-size:13px;font-weight:600;letter-spacing:.04em;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${C} .igs-combat-card-art{display:grid;place-items:center;height:56px;border-radius:var(--igs-cb-r-m);background:radial-gradient(70% 90% at 50% 40%,color-mix(in srgb,var(--igs-card-tint) 22%,transparent),transparent 72%),var(--igs-cb-fill);color:var(--igs-card-tint);}
${C} .igs-combat-card-art svg{width:28px;height:28px;stroke-width:1.4;}
${C} .igs-combat-card-art img{display:block;width:100%;height:100%;object-fit:cover;border-radius:inherit;}
${C} .igs-combat-card-type{display:flex;align-items:center;justify-content:center;gap:5px;color:var(--igs-cb-ink-faint);font-size:11px;font-weight:500;letter-spacing:.16em;}
${C} .igs-combat-card-type::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--igs-card-tint);}
${C} .igs-combat-card-text{font-size:11.5px;line-height:1.45;color:var(--igs-cb-ink-soft);}
${C} .igs-combat-card-text .igs-scale-up{color:#5fd0b8;font-weight:600;}
${C} .igs-combat-card-text .igs-scale-down{color:var(--igs-cb-ink-faint);}
${C} .igs-cx-canvas .card .igs-scale-up{color:var(--jade,var(--acc,var(--igs-cb-accent)));font-weight:600;}
${C} .igs-cx-canvas .card .igs-scale-down{color:var(--dim,var(--igs-cb-ink-faint));}
/* v4 关键字（不能打出、固有、虚无、临时、被丢弃时）单独成行排在效果前；减费的费用球转青绿；临时牌略降饱和度，与正常手牌区分（不加描边）。 */
${C} .igs-combat-card-kw{display:block;color:var(--igs-cb-ink);font-weight:600;}
${C} .igs-combat-card-cost.is-down{background:#5fd0b8;}
${C} .igs-combat-card.is-temp{filter:saturate(.55);}
/* 带加成 / 减益的数字：虚下划线提示可点；点开的详情浮在面板根节点上（.igs-combat-scale-tip，坐标由面板写入 --tip-x / --tip-y，上方放不下时 data-below 放到数字下方）。 */
${C} :is(.igs-combat-card-text,.igs-cx-canvas .card) [data-scale-tip]{cursor:help;text-decoration:underline dotted;text-decoration-thickness:1px;text-underline-offset:2px;}
${C}>.igs-combat-scale-tip{position:absolute;left:var(--tip-x,50%);top:var(--tip-y,50%);z-index:6;translate:-50% calc(-100% - 8px);max-width:min(240px,calc(100% - 16px));padding:6px 10px;box-sizing:border-box;border-radius:var(--igs-cb-r-m);background:${igsUiSurface(IGS_UI_THICKNESS.thick)};color:var(--igs-cb-ink);font-size:12px;line-height:1.5;letter-spacing:.04em;white-space:pre-line;font-variant-numeric:tabular-nums;pointer-events:none;box-shadow:0 10px 24px -10px rgba(0,0,0,.8),${IGS_UI_EDGE_NIGHT};}
${C}>.igs-combat-scale-tip[data-below]{translate:-50% 8px;}
/* 人物特性详情：名称与稀有度（固有为暖色）、主动的能量与次数或被动的触发时机、效果、来历。 */
${C}>.igs-combat-scale-tip.is-trait{display:grid;gap:3px;max-width:min(260px,calc(100% - 16px));padding:8px 12px;white-space:normal;}
${C} .igs-combat-trait-tip-name{display:flex;align-items:baseline;gap:8px;font-size:13px;}
${C} .igs-combat-trait-tip-name i{font-style:normal;font-size:11px;font-weight:600;color:var(--rar);}
${combatRarityStyle(`${C} .igs-combat-trait-tip-name i`)}
${C} .igs-combat-trait-tip-name i[data-rarity="innate"]{--rar:var(--igs-cb-warm);}
${C} :is(.igs-combat-trait-tip-meta,.igs-combat-trait-tip-origin){color:var(--igs-cb-ink-faint);font-size:11px;}
/* 单位详情（点头像）：按组列出技能、被动与尚未触发的阶段；可能较长，限高在面板内、可滚动，面板写入上沿 --tip-y（data-free）。 */
${C}>.igs-combat-scale-tip.is-unit{gap:8px;max-width:min(300px,calc(100% - 16px));max-height:calc(100% - 16px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;pointer-events:auto;}
${C}>.igs-combat-scale-tip[data-free]{translate:-50% 0;}
${C} .igs-combat-unit-tip-group{display:grid;gap:4px;}
${C} .igs-combat-unit-tip-label{color:var(--igs-cb-warm);font-size:11px;font-weight:600;letter-spacing:.12em;}
${C} .igs-combat-unit-tip-item{display:grid;gap:1px;color:var(--igs-cb-ink-soft);font-size:11.5px;}
${C} .igs-combat-unit-tip-item b{display:flex;align-items:baseline;gap:6px;color:var(--igs-cb-ink);font-size:12px;font-weight:600;}
${C} .igs-combat-unit-tip-item i{font-style:normal;font-size:10.5px;font-weight:600;color:var(--rar);}
${combatRarityStyle(`${C} .igs-combat-unit-tip-item i`)}
${C} .igs-combat-unit-tip-item i[data-rarity="innate"]{--rar:var(--igs-cb-warm);}
${C} .igs-combat-unit-tip-meta{color:var(--igs-cb-ink-faint);font-size:11px;}
${C} .igs-combat-card.is-upgraded .igs-combat-card-name{color:var(--igs-cb-warm);}
${C} .igs-combat-card[data-rarity]:not(:is([data-rarity="basic"],[data-rarity="epic"],[data-rarity="mythic"])):not(.is-selected,.is-chosen){box-shadow:0 14px 28px -14px rgba(0,0,0,.7),inset 0 1.5px 0 var(--rar);}
${C} .igs-combat-card[data-rarity]:not(:is([data-rarity="basic"],[data-rarity="epic"],[data-rarity="mythic"])) .igs-combat-card-cost{box-shadow:0 0 0 2px var(--rar);}
${C} .igs-combat-card[data-rarity]:not([data-rarity="basic"]) .igs-combat-card-art{background:radial-gradient(90% 55% at 50% 100%,color-mix(in srgb,var(--rar) 30%,transparent),transparent 72%),radial-gradient(70% 90% at 50% 40%,color-mix(in srgb,var(--igs-card-tint) 22%,transparent),transparent 72%),var(--igs-cb-fill);}
${C} .igs-combat-card[data-rarity="signature"]::before{content:"";position:absolute;left:10px;right:10px;top:0;height:1.5px;border-radius:1px;background:linear-gradient(90deg,transparent,#f2d49b 20%,#ff8a5c 80%,transparent);pointer-events:none;}
${C} .igs-combat-card[data-rarity="signature"]::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,transparent 42%,rgba(255,196,150,.16) 50%,transparent 58%) 0 0/260% 100% no-repeat;animation:igs-combat-sheen 4.8s ease-in-out infinite;}
@keyframes igs-combat-sheen{0%,35%{background-position:120% 0;}100%{background-position:-20% 0;}}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-card[data-rarity="signature"]::after{animation:none;background:none;}}
#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-card[data-rarity="signature"]::after{animation:none;background:none;}
${combatRarityStyle(`${C} .igs-combat-card`)}
${C} .igs-combat-card:is([data-rarity="epic"],[data-rarity="mythic"]):not(.is-selected,.is-chosen){box-shadow:0 14px 28px -14px rgba(0,0,0,.7);}
${C} .igs-combat-reward{display:flex;flex-direction:column;gap:12px;width:min(480px,100%);margin:12px auto 0;box-sizing:border-box;padding:20px 22px 18px;}
/* 结算画面：铺在面板上、不走卡片。标题字号 --r-title、我方等大立绘宽 --r-w、败北 / 撤退时保留的敌人宽 --r-foe，容器查询按面板尺寸改写；内容自上而下拉开：标题置顶，「发送战报」在最下。 */
${C} .igs-combat-result{--r-tint:var(--igs-cb-ink);--r-title:44px;--r-w:128px;--r-foe:112px;position:relative;isolation:isolate;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:14px;min-height:min-content;overflow:hidden;padding:4px 0 6px;}
${C} .igs-combat-result[data-outcome="victory"]{--r-tint:var(--igs-cb-warm);}
${C} .igs-combat-result[data-outcome="defeat"]{--r-tint:var(--igs-cb-attack);}
${C} .igs-combat-result-head{position:relative;display:grid;place-items:center;align-self:stretch;padding:calc(var(--r-title) * .3) 0;}
${C} .igs-combat-result-title{position:relative;z-index:1;padding:0 .5em 0 .82em;color:var(--r-tint);font-size:var(--r-title);font-style:italic;font-weight:800;letter-spacing:.32em;line-height:1.15;text-align:center;white-space:nowrap;text-shadow:0 0 calc(var(--r-title) * .45) color-mix(in srgb,var(--r-tint) 50%,transparent),0 2px 6px rgba(0,0,0,.6);}
/* 结算大标题与战前横幅、名牌同一套斜切：标题背后一条两端渐隐的斜切暗色带（无描边），颜色随结果。 */
${C} .igs-combat-result-title::before{content:"";position:absolute;left:0;right:0;top:14%;bottom:10%;z-index:-1;transform:skewX(-18deg);background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--r-tint) 24%,rgba(${N},.8)) 16%,color-mix(in srgb,var(--r-tint) 24%,rgba(${N},.8)) 84%,transparent);}
/* 胜利：背后放射光芒缓慢旋转（按 --igs-cb-result-t 接续，重绘不跳角度），金色粒子从标题下方升起；标题由大到正常落定见下方结算入场。 */
${C} .igs-combat-result-rays{position:absolute;left:50%;top:50%;z-index:-1;width:calc(var(--r-title) * 8);aspect-ratio:1;translate:-50% -50%;pointer-events:none;background:radial-gradient(closest-side,rgba(242,212,155,.3),transparent 60%),repeating-conic-gradient(rgba(242,212,155,.2) 0deg 5deg,transparent 5deg 15deg);-webkit-mask-image:radial-gradient(closest-side,#000 25%,transparent);mask-image:radial-gradient(closest-side,#000 25%,transparent);animation:igs-combat-result-spin 48s linear var(--igs-cb-result-t,0ms) infinite;}
${C} .igs-combat-result-sparks{position:absolute;left:50%;top:0;z-index:-1;width:calc(var(--r-title) * 7);max-width:100%;height:calc(100% + var(--r-title) * 1.5);translate:-50% 0;pointer-events:none;}
${C} .igs-combat-result-sparks i{position:absolute;left:calc(4% + var(--i) * 8%);bottom:0;width:4px;height:4px;border-radius:50%;background:#ffe6b0;box-shadow:0 0 6px 2px rgba(242,212,155,.65);opacity:0;animation:igs-combat-result-spark 3.4s ease-out infinite;animation-delay:calc(var(--i) * -.29s);}
${C} .igs-combat-result-sparks i:nth-child(2n){--dx:-14px;}
${C} .igs-combat-result-sparks i:nth-child(3n){width:3px;height:3px;animation-duration:2.7s;}
${C} .igs-combat-result-team{display:flex;justify-content:center;align-items:flex-end;gap:16px;align-self:stretch;}
${C} .igs-combat-result-figure{flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;width:min(var(--r-w),calc((100% - (var(--n,1) - 1) * 16px) / var(--n,1)));margin:0;}
${C} .igs-combat-result-figure figcaption{display:flex;flex-direction:column;align-items:center;max-width:100%;font-size:13px;font-weight:600;letter-spacing:.04em;line-height:1.35;text-shadow:0 1px 2px rgba(0,0,0,.8),0 0 10px rgba(0,0,0,.5);}
${C} .igs-combat-result-figure figcaption span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${C} .igs-combat-result-figure figcaption span+span{color:var(--igs-cb-ink-soft);font-size:12px;font-weight:500;}
${C} .igs-combat-result .igs-combat-side.is-enemy[data-n] .igs-combat-unit{--u-w:var(--r-foe);}
${C} .igs-combat-result .igs-combat-actions{justify-content:center;}
/* 结算入场（根节点 data-igs-combat-result-in：本场第一次画出结算后的一小段时间，胜利横幅此时还在上面淡出）：整块淡入接住换画面，标题落定、光芒淡入，
   成就、队伍、战利品与按钮依次升起；期间重绘按 --igs-cb-result-t（负的已过毫秒）接着播，不从头重播。 */
${C}[data-igs-combat-result-in] .igs-combat-result{animation:igs-combat-result-fade .35s ease-out var(--igs-cb-result-t,0ms) both;}
${C}[data-igs-combat-result-in] .igs-combat-result-title{animation:igs-combat-result-fade .5s var(--igs-cb-ease) var(--igs-cb-result-t,0ms) both;}
${C}[data-igs-combat-result-in] .igs-combat-result[data-outcome="victory"] .igs-combat-result-title{animation:igs-combat-result-in .9s var(--igs-cb-ease) var(--igs-cb-result-t,0ms) both;}
${C}[data-igs-combat-result-in] .igs-combat-result-rays{animation:igs-combat-result-fade 1.2s ease-out var(--igs-cb-result-t,0ms) both,igs-combat-result-spin 48s linear var(--igs-cb-result-t,0ms) infinite;}
${C}[data-igs-combat-result-in] .igs-combat-feat{animation:igs-combat-feat-in .6s var(--igs-cb-ease) calc(var(--igs-cb-result-t,0ms) + .45s) both;}
${C}[data-igs-combat-result-in] .igs-combat-result-team{animation:igs-combat-result-rise .5s var(--igs-cb-ease) calc(var(--igs-cb-result-t,0ms) + .3s) both;}
${C}[data-igs-combat-result-in] .igs-combat-result .igs-combat-loot{animation:igs-combat-result-rise .5s var(--igs-cb-ease) calc(var(--igs-cb-result-t,0ms) + .5s) both;}
${C}[data-igs-combat-result-in] .igs-combat-result .igs-combat-actions{animation:igs-combat-result-rise .4s var(--igs-cb-ease) calc(var(--igs-cb-result-t,0ms) + .7s) both;}
@keyframes igs-combat-result-rise{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
/* 成就牌子：与结算标题同一套斜切暗色带（无描边），晚于标题落定；超杀用攻击色。 */
${C} .igs-combat-feats{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 18px;max-width:100%;}
${C} .igs-combat-feat{position:relative;isolation:isolate;display:flex;flex-direction:column;align-items:center;gap:2px;max-width:100%;padding:6px 20px;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.8);}
${C} .igs-combat-feat::before{content:"";position:absolute;inset:0;z-index:-1;transform:skewX(-14deg);background:linear-gradient(90deg,color-mix(in srgb,var(--igs-cb-warm) 32%,rgba(10,10,14,.72)),rgba(10,10,14,.6));}
${C} .igs-combat-feat b{color:var(--igs-cb-warm);font-size:16px;font-weight:800;letter-spacing:.2em;white-space:nowrap;}
${C} .igs-combat-feat b span{font-variant-numeric:tabular-nums;letter-spacing:.04em;}
${C} .igs-combat-feat>span{max-width:100%;color:var(--igs-cb-ink-soft);font-size:12px;font-style:italic;}
${C} .igs-combat-feat[data-feat="overkill"] b{color:color-mix(in srgb,var(--igs-cb-attack) 70%,#fff);}
${C} .igs-combat-feat[data-feat="overkill"]::before{background:linear-gradient(90deg,color-mix(in srgb,var(--igs-cb-attack) 34%,rgba(10,10,14,.72)),rgba(10,10,14,.6));}
${C}[data-igs-combat-reduced] .igs-combat-feat{animation:none!important;}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-feat{animation:none!important;}}
@keyframes igs-combat-feat-in{from{opacity:0;transform:translateY(8px) scale(.94);}to{opacity:1;transform:none;}}
${C}[data-igs-combat-reduced] .igs-combat-result :is(.igs-combat-result-title,.igs-combat-result-rays){animation:none!important;}
${C}[data-igs-combat-reduced] .igs-combat-result-sparks,#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-result-sparks{display:none;}
@keyframes igs-combat-result-in{0%{opacity:0;transform:scale(1.45);}55%{opacity:1;}100%{opacity:1;transform:none;}}
@keyframes igs-combat-result-fade{from{opacity:0;}to{opacity:1;}}
@keyframes igs-combat-result-spin{to{rotate:360deg;}}
@keyframes igs-combat-result-spark{0%{opacity:0;transform:translate(0,0) scale(.6);}18%{opacity:1;}100%{opacity:0;transform:translate(var(--dx,12px),calc(var(--r-title) * -2.4)) scale(1);}}
/* 战利品翻牌：卡背一律相同、不透出稀有度；翻开的牌按稀有度着色（无描边，只靠顶边高光与底部色晕）。刚翻开的牌翻面入场，自己翻开的按稀有度出光效（data-fx：1 柔光、2 闪光加粒子、3 金色光环、4 光柱），其余牌晚一拍、降一档；自己翻开神话时其余牌多停一拍（data-pause）。 */
${C} .igs-combat-result:has(>.igs-combat-loot) .igs-combat-result-figure{width:min(calc(var(--r-w) * .7),calc((100% - (var(--n,1) - 1) * 16px) / var(--n,1)));}
${C} .igs-combat-loot{display:flex;flex-direction:column;align-items:center;gap:10px;align-self:stretch;}
${C} .igs-combat-loot-cap{color:var(--igs-cb-warm);font-size:13px;font-weight:700;letter-spacing:.2em;text-shadow:0 1px 2px rgba(0,0,0,.8);}
${C} .igs-combat-loot-row{--loot-w:min(132px,calc((100% - (var(--n,3) - 1) * 12px) / var(--n,3)));display:flex;justify-content:center;gap:12px;width:100%;}
${C} .igs-combat-loot-card{--rar:transparent;--loot-delay:0s;--fx-at:calc(var(--loot-delay) + .26s);position:relative;isolation:isolate;flex:none;width:var(--loot-w);aspect-ratio:5/7;margin:0;padding:0;border:0;border-radius:var(--igs-cb-r-m);background:none;color:var(--igs-cb-ink);font:inherit;text-align:center;transition:transform .18s var(--igs-cb-ease),opacity .3s ease;}
${C} .igs-combat-loot-card.is-later{--loot-delay:.55s;}
${C} .igs-combat-loot[data-pause] .igs-combat-loot-card.is-later{--loot-delay:1.1s;}
${C} button.igs-combat-loot-card{cursor:pointer;}
${C} button.igs-combat-loot-card[aria-disabled="true"]{cursor:default;}
${C} button.igs-combat-loot-card:not([aria-disabled="true"]):hover{transform:translateY(-4px);}
${C} button.igs-combat-loot-card:focus-visible{outline:2px solid var(--igs-cb-warm);outline-offset:3px;}
${C} .igs-combat-loot-back,${C} .igs-combat-loot-face{position:absolute;inset:0;border-radius:inherit;}
${C} .igs-combat-loot-back{background:repeating-linear-gradient(45deg,rgba(242,212,155,.07) 0 6px,transparent 6px 12px),radial-gradient(circle at 50% 50%,rgba(242,212,155,.2),transparent 56%),linear-gradient(160deg,rgb(40,36,58),rgb(14,12,22));box-shadow:0 14px 28px -14px rgba(0,0,0,.7),inset 0 1.5px 0 rgba(242,212,155,.22);}
${C} .igs-combat-loot-back::after{content:"";position:absolute;left:50%;top:50%;width:26%;aspect-ratio:1;translate:-50% -50%;rotate:45deg;background:rgba(242,212,155,.2);}
${C} .igs-combat-loot-face{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;padding:12px 8px;overflow:hidden;background:radial-gradient(90% 60% at 50% 100%,color-mix(in srgb,var(--rar) 34%,transparent),transparent 72%),linear-gradient(160deg,rgb(34,32,48),rgb(16,14,24));box-shadow:0 14px 28px -14px rgba(0,0,0,.7),inset 0 1.5px 0 var(--rar);}
${C} .igs-combat-loot-tag{color:var(--rar);font-size:11px;font-weight:700;letter-spacing:.12em;}
${C} .igs-combat-loot-name{max-width:100%;font-size:15px;font-weight:700;line-height:1.3;overflow-wrap:anywhere;}
${C} .igs-combat-loot-origin{max-width:100%;color:var(--igs-cb-ink-soft);font-size:11px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
${combatRarityStyle(`${C} .igs-combat-loot-card`)}
${C} .igs-combat-loot-card:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-combat-loot-name{color:var(--rar);}
${C} .igs-combat-loot-card.is-chosen{transform:translateY(-6px);}
${C} .igs-combat-loot-card.is-chosen .igs-combat-loot-face{box-shadow:0 0 22px -2px color-mix(in srgb,var(--rar) 70%,transparent),0 14px 28px -14px rgba(0,0,0,.7),inset 0 1.5px 0 var(--rar);}
${C} .igs-combat-loot-card.is-dim{opacity:.6;}
${C} .igs-combat-loot-tools{display:flex;justify-content:center;}
${C} .igs-combat-purge-sheet{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}
${C} .igs-combat-purge-veil{position:absolute;inset:0;background:rgba(0,0,0,.6);cursor:pointer;}
${C} .igs-combat-purge-box{position:relative;display:flex;flex-direction:column;gap:12px;width:min(520px,100%);max-height:100%;padding:16px;box-sizing:border-box;overflow:auto;border-radius:var(--igs-cb-r-m);background:rgba(${N},.96);}
${C} .igs-combat-purge{display:flex;flex-wrap:wrap;gap:8px;}
${C} .igs-combat-purge .igs-combat-btn{flex:1 1 140px;}
${C} .igs-combat-purge .igs-combat-btn[aria-pressed="true"]{background:var(--igs-cb-fill-hover);color:var(--igs-cb-ink);}
${C} .igs-combat-purge-detail{display:grid;gap:4px;padding:12px 14px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill);}
${C} .igs-combat-purge-detail .igs-combat-trait-tip-text{font-size:13px;line-height:1.6;color:var(--igs-cb-ink);}
${C} .igs-combat-purge-detail>.igs-combat-actions{justify-content:flex-end;margin-top:6px;}
${C} .igs-combat-purge-box>.igs-combat-actions{justify-content:flex-end;}
${C} .igs-combat-upgrade-compare{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:4px;}
${C} .igs-combat-upgrade-side{display:grid;gap:2px;align-content:start;padding:8px 10px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-fill-hover);}
${C} .igs-combat-loot-card.is-fresh .igs-combat-loot-back{animation:igs-combat-loot-back-out .26s ease-in var(--loot-delay) both;}
${C} .igs-combat-loot-card.is-fresh .igs-combat-loot-face{animation:igs-combat-loot-face-in .34s var(--igs-cb-ease) var(--fx-at) both;}
${C} .igs-combat-loot-card :is(.igs-combat-loot-burst,.igs-combat-loot-sparks,.igs-combat-loot-ring,.igs-combat-loot-pillar){position:absolute;pointer-events:none;}
${C} .igs-combat-loot-burst{inset:-14%;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--rar) 80%,#fff),color-mix(in srgb,var(--rar) 30%,transparent) 45%,transparent 75%);opacity:0;animation:igs-combat-loot-burst .9s ease-out var(--fx-at) both;}
${C} .igs-combat-loot-card[data-fx="2"] .igs-combat-loot-burst{inset:-30%;}
${C} .igs-combat-loot-card[data-fx="3"] .igs-combat-loot-burst{inset:-44%;}
${C} .igs-combat-loot-card[data-fx="4"] .igs-combat-loot-burst{inset:-60%;}
${C} .igs-combat-loot-sparks{left:50%;top:50%;width:0;height:0;z-index:2;}
${C} .igs-combat-loot-sparks i{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;background:color-mix(in srgb,var(--rar) 60%,#fff);box-shadow:0 0 8px 2px color-mix(in srgb,var(--rar) 70%,transparent);opacity:0;rotate:calc(var(--i) * 36deg);animation:igs-combat-loot-spark .8s ease-out var(--fx-at) both;}
${C} .igs-combat-loot-ring{left:50%;top:50%;width:100%;aspect-ratio:1;translate:-50% -50%;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,transparent 60%,color-mix(in srgb,var(--rar) 80%,#fff) 70%,transparent 82%);opacity:0;animation:igs-combat-loot-ring .9s ease-out var(--fx-at) both;}
${C} .igs-combat-loot-pillar{left:50%;bottom:-10%;width:64%;height:260%;translate:-50% 0;z-index:-1;transform-origin:50% 100%;background:linear-gradient(to top,color-mix(in srgb,var(--rar) 70%,#fff),color-mix(in srgb,var(--rar) 40%,transparent) 50%,transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent);mask-image:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent);opacity:0;animation:igs-combat-loot-pillar 1.2s ease-out var(--fx-at) both;}
@keyframes igs-combat-loot-back-out{from{transform:perspective(600px) rotateY(0);}to{opacity:0;transform:perspective(600px) rotateY(90deg);}}
@keyframes igs-combat-loot-face-in{from{transform:perspective(600px) rotateY(-90deg);}to{transform:none;}}
@keyframes igs-combat-loot-burst{0%{opacity:0;transform:scale(.4);}25%{opacity:1;}100%{opacity:0;transform:scale(1.15);}}
@keyframes igs-combat-loot-spark{0%{opacity:0;transform:translateY(0) scale(.6);}20%{opacity:1;}100%{opacity:0;transform:translateY(-96px) scale(1);}}
@keyframes igs-combat-loot-ring{0%{opacity:0;transform:scale(.3);}30%{opacity:1;}100%{opacity:0;transform:scale(2);}}
@keyframes igs-combat-loot-pillar{0%{opacity:0;transform:scaleY(.1);}25%{opacity:1;transform:scaleY(1);}100%{opacity:0;transform:scaleY(1);}}
/* 减少动态效果：直接显示翻开后的牌与选定高亮，不翻面、不出光效；低画质去掉粒子与光柱（全屏白闪由 flashScreen 按低画质跳过）。 */
${C}[data-igs-combat-reduced] .igs-combat-loot-card,${C}[data-igs-combat-reduced] .igs-combat-loot-card :is(.igs-combat-loot-back,.igs-combat-loot-face){animation:none!important;transition:none;}
${C}[data-igs-combat-reduced] .igs-combat-loot-card.is-face .igs-combat-loot-back,${C}[data-igs-combat-reduced] .igs-combat-loot-card :is(.igs-combat-loot-burst,.igs-combat-loot-sparks,.igs-combat-loot-ring,.igs-combat-loot-pillar){display:none;}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-loot-card,${C} .igs-combat-loot-card :is(.igs-combat-loot-back,.igs-combat-loot-face){animation:none!important;transition:none;}${C} .igs-combat-loot-card.is-face .igs-combat-loot-back,${C} .igs-combat-loot-card :is(.igs-combat-loot-burst,.igs-combat-loot-sparks,.igs-combat-loot-ring,.igs-combat-loot-pillar){display:none;}}
#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-loot-card :is(.igs-combat-loot-sparks,.igs-combat-loot-pillar){display:none;}
${combatUiCard(`${C} .igs-combat-reward`)}
@supports not (container-type:size){@media (max-width:720px){${NARROW}}@media (orientation:portrait){${LOBBY_STACK}}}
@supports (container-type:size){
${C}{container:igs-combat/size;}
${SCALE_WIDE}
@container igs-combat (orientation:landscape) and (min-width:721px){${WIDE}}
@container igs-combat (orientation:landscape) and (min-width:721px) and (max-width:1279px){${FOOT_COMPACT}}
@container igs-combat (orientation:portrait){${PORTRAIT}}
@container igs-combat (max-width:720px){${NARROW}
${SCALE_NARROW}}
@container igs-combat (orientation:portrait) and (min-height:700px){${TALL}}
@container igs-combat (orientation:portrait){${PORTRAIT_ALLIES}}
}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-hp-track i,${C} .igs-combat-card,${C} .igs-combat-trait-orb,${C} .igs-combat-ctl-fx,${C} .igs-combat-ctl-fx::after{transition:none;animation:none!important;}}
${AWAKEN_FX}
${COMBAT_CUTIN_STYLE_TEXT}
${COMBAT_STAGE_FX_STYLE_TEXT}
${COMBAT_HIT_STYLE_TEXT}
${COMBAT_KO_FALL_STYLE_TEXT}
${COMBAT_LINE_STYLE_TEXT}
${COMBAT_ENEMY_ART_STYLE_TEXT}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-portrait :is(img,svg,.igs-combat-art),${C} .igs-combat-energy-liquid::before,${C} .igs-combat-energy-liquid::after,${C} .igs-combat-lobby :is(.igs-combat-lobby-side,.igs-combat-lobby-stage,.igs-combat-lobby-banner,.igs-combat-lobby-fx i),${C} .igs-combat-result :is(.igs-combat-result-title,.igs-combat-result-rays,.igs-combat-result-sparks i){animation:none!important;}${C} .igs-combat-lobby-flash{display:none;}}
${C} .igs-challenge-allies{position:relative;z-index:1;justify-content:center;}
${C} .igs-challenge-allies button.igs-combat-chip{border:0;font:inherit;font-size:13px;cursor:pointer;}
${C} .igs-challenge-allies button.igs-combat-chip[aria-pressed="true"]{background:var(--igs-cb-warm);color:var(--igs-cb-on-ink);}
${C} .igs-challenge-harvest{display:flex;flex-direction:column;gap:6px;align-items:center;padding:8px 0;}
${C} .igs-challenge-harvest-row{display:flex;align-items:baseline;gap:10px;color:var(--igs-cb-ink);font-size:14px;}
${C} .igs-challenge-harvest-row small{color:var(--igs-cb-ink-soft);font-size:12px;}
${C} .igs-challenge-feats .igs-combat-chip[data-earned="false"]{color:var(--igs-cb-ink-faint);}
${C} .igs-challenge-feats .igs-combat-chip[data-earned="true"]{color:var(--igs-cb-warm);}
${C} .igs-challenge-history{display:flex;flex-direction:column;gap:2px;margin:6px 0;padding:0;list-style:none;overflow-y:auto;}
${C} .igs-challenge-history-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,2fr) auto auto;gap:10px;align-items:baseline;padding:6px 10px;border-radius:var(--igs-cb-r-s);background:var(--igs-cb-fill);color:var(--igs-cb-ink-soft);font-size:13px;}
${C} .igs-challenge-history-row b{color:var(--igs-cb-ink);font-weight:600;}
${C} .igs-challenge-history-row em{font-style:normal;}
${C} .igs-challenge-history-row small{color:var(--igs-cb-ink-faint);}
#igs-combat-entry{position:absolute;left:50%;bottom:calc(var(--igs-dialog-height,30%) + 14px);z-index:7;transform:translateX(-50%);pointer-events:auto;}
#igs-overlay.igs-record-screen-open #igs-combat-entry{display:none;}
#igs-overlay[data-igs-combat-open] #igs-dialog-layer{visibility:hidden;}
#igs-overlay[data-igs-combat-open] #igs-stage-motion[data-igs-cg] #igs-bg{background-image:var(--igs-combat-backdrop,none)!important;background-size:cover!important;}
#igs-combat-entry .igs-combat-entry-btn,#igs-combat-resume .igs-combat-entry-btn{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:min(200px,70vw);padding:8px 40px 9px;border:0;background:linear-gradient(90deg,transparent,rgba(${N},.72) 20%,rgba(${N},.72) 80%,transparent);color:${IGS_UI_INK.primary};font:inherit;cursor:pointer;text-shadow:0 1px 4px rgba(0,0,0,.75);}
#igs-combat-entry .igs-combat-entry-btn:focus-visible,#igs-combat-resume .igs-combat-entry-btn:focus-visible{outline:2px solid ${IGS_UI_WARM};outline-offset:2px;}
${COMBAT_PANEL_SKIN_VEIL_STYLE_TEXT}
${COMBAT_ENTRY_SKIN_STYLE_TEXT}
${COMBAT_PANEL_LAYOUT_STYLE_TEXT}
${CANVAS_STYLE_TEXT}
${COMBAT_POWER_STYLE_TEXT}
${C} :is(.igs-combat-unit,.cx-unit)[data-swap="out"]{animation:igs-combat-swap-out 520ms var(--igs-cb-ease) var(--swap-t,0ms) both;pointer-events:none;}
${C} :is(.igs-combat-unit,.cx-unit)[data-swap="in"]{animation:igs-combat-swap-in 620ms cubic-bezier(.2,.9,.25,1.15) var(--swap-t,0ms) both;}
@keyframes igs-combat-swap-out{0%{opacity:.4;translate:0 0;}100%{opacity:0;translate:0 18%;}}
@keyframes igs-combat-swap-in{0%{opacity:0;translate:40% 0;}60%{opacity:1;translate:-4% 0;}100%{opacity:1;translate:0 0;}}
${C}[data-igs-combat-reduced] :is(.igs-combat-unit,.cx-unit)[data-swap],#igs-overlay[data-igs-quality="low"] ${C} :is(.igs-combat-unit,.cx-unit)[data-swap]{animation:none;}
@media(prefers-reduced-motion:reduce){${C} :is(.igs-combat-unit,.cx-unit)[data-swap]{animation:none;}}
${TARGET_PICKER_STYLE_TEXT}
${INTIMATE_DUEL_STYLE_TEXT}
${INTIMATE_DUEL_FX_STYLE_TEXT}
`;
