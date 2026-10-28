import { IGS_UI_BLUR, IGS_UI_EDGE_NIGHT, IGS_UI_ELEVATION, IGS_UI_FILL, IGS_UI_FONT_SANS, IGS_UI_INK, IGS_UI_NIGHT_RGB, IGS_UI_RADIUS, IGS_UI_THICKNESS, IGS_UI_WARM, igsUiSurface } from '../../styles/ui-material.js';
import { COMBAT_CUTIN_STYLE_TEXT } from './combat-cutin-style.js';
import { COMBAT_HIT_STYLE_TEXT } from './combat-hit-fx-style.js';
import { COMBAT_ENEMY_ART_STYLE_TEXT } from './combat-enemy-art.js';

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
// 情绪特效层（.igs-combat-awaken-fx）：::before 为母题纹样，::after 为粒子；低画质去粒子，减少动态效果全部静止。
const AWAKEN_PATTERN = Object.freeze({
    rage: 'radial-gradient(60% 40% at 50% 110%,color-mix(in srgb,var(--aw) 85%,transparent),transparent 70%),radial-gradient(30% 50% at 20% 105%,color-mix(in srgb,var(--aw) 60%,transparent),transparent 70%),radial-gradient(30% 50% at 80% 105%,color-mix(in srgb,var(--aw) 60%,transparent),transparent 70%)',
    guard: 'radial-gradient(circle at 50% 50%,transparent 34%,color-mix(in srgb,var(--aw) 55%,transparent) 36%,transparent 42%,transparent 54%,color-mix(in srgb,var(--aw) 30%,transparent) 56%,transparent 62%)',
    grief: 'repeating-linear-gradient(90deg,transparent 0 46px,color-mix(in srgb,var(--aw) 35%,transparent) 46px 47px,transparent 47px 91px)',
    resolve: 'repeating-conic-gradient(from 0deg at 50% 50%,color-mix(in srgb,var(--aw) 40%,transparent) 0 4deg,transparent 4deg 18deg)',
    bond: 'repeating-linear-gradient(120deg,transparent 0 30px,color-mix(in srgb,var(--aw) 45%,transparent) 30px 31px,transparent 31px 60px),repeating-linear-gradient(60deg,transparent 0 44px,color-mix(in srgb,var(--aw) 30%,transparent) 44px 45px,transparent 45px 88px)',
    limit: 'linear-gradient(105deg,transparent 46%,var(--aw) 47%,#fff 48%,var(--aw) 49%,transparent 50%),linear-gradient(75deg,transparent 62%,color-mix(in srgb,var(--aw) 70%,transparent) 63%,transparent 64%)',
    vengeance: 'radial-gradient(circle at 50% 50%,transparent 30%,color-mix(in srgb,var(--aw) 55%,transparent) 75%,rgba(0,0,0,.6) 100%)',
    unyielding: 'radial-gradient(55% 45% at 50% 110%,color-mix(in srgb,var(--aw) 80%,transparent),transparent 70%),radial-gradient(25% 45% at 50% 100%,#fff,transparent 70%)',
});
const AWAKEN_PATTERNS = Object.entries(AWAKEN_PATTERN).map(([k, v]) => `.igs-combat-awaken-cutin[data-awaken="${k}"] .igs-combat-awaken-fx::before{background:${v};}`).join('\n');
// 觉醒特写：全屏色幕（底色为情绪色的暗调）+ 情绪纹样 + 居中半身立绘（.igs-combat-cutin-figure.is-awaken，见 combat-cutin-style.js）+ 下方类型与台词；挂在特写层，按 --igs-fx-life 淡入淡出。
const AWAKEN_FX = `${AWAKEN_VARS}
.igs-combat-awaken-cutin{position:absolute;inset:0;overflow:hidden;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--aw) 30%,rgba(${N},.6)),rgba(${N},.88) 75%);animation:igs-combat-awaken-in var(--igs-fx-life,2400ms) ease-out both;}
.igs-combat-awaken-fx{position:absolute;inset:0;}
.igs-combat-awaken-fx::before{content:'';position:absolute;inset:-10%;opacity:.9;animation:igs-combat-awaken-drift 1.6s ease-in-out infinite alternate;}
.igs-combat-awaken-fx::after{content:'';position:absolute;inset:0;background-image:radial-gradient(2px 2px at 12% 80%,var(--aw),transparent),radial-gradient(2px 2px at 28% 60%,#fff,transparent),radial-gradient(3px 3px at 46% 90%,var(--aw),transparent),radial-gradient(2px 2px at 64% 70%,#fff,transparent),radial-gradient(3px 3px at 82% 85%,var(--aw),transparent),radial-gradient(2px 2px at 92% 55%,var(--aw),transparent);animation:igs-combat-awaken-rise 1.4s linear infinite;}
${AWAKEN_PATTERNS}
.igs-combat-awaken-cap{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;max-width:min(92%,640px);padding:0 16px;text-align:center;font-family:${IGS_UI_FONT_SANS};}
.igs-combat-awaken-label{color:var(--aw);font-size:13px;font-weight:700;letter-spacing:.4em;text-shadow:0 0 10px color-mix(in srgb,var(--aw) 70%,transparent),0 1px 3px rgba(0,0,0,.8);}
.igs-combat-awaken-line{color:#fff;font-size:clamp(18px,4.2vmin,30px);font-weight:700;letter-spacing:.08em;line-height:1.35;text-shadow:0 0 14px color-mix(in srgb,var(--aw) 75%,transparent),0 2px 4px rgba(0,0,0,.85);overflow-wrap:anywhere;}
@keyframes igs-combat-awaken-in{0%{opacity:0;}10%,86%{opacity:1;}100%{opacity:0;}}
@keyframes igs-combat-awaken-drift{from{transform:scale(1) translateY(0);}to{transform:scale(1.06) translateY(-2%);}}
@keyframes igs-combat-awaken-rise{from{transform:translateY(12%);opacity:1;}to{transform:translateY(-18%);opacity:0;}}
.igs-combat-awaken-cutin.is-low .igs-combat-awaken-fx::after,#igs-overlay[data-igs-quality="low"] .igs-combat-awaken-fx::after{display:none;}
.igs-combat-awaken-cutin.is-reduced{animation:igs-combat-cutin-fade var(--igs-fx-life,2600ms) linear both;}
.igs-combat-awaken-cutin.is-reduced .igs-combat-awaken-fx::before{animation:none;}
.igs-combat-awaken-cutin.is-reduced .igs-combat-awaken-fx::after{display:none;}
@media (prefers-reduced-motion:reduce){.igs-combat-awaken-cutin{animation:igs-combat-cutin-fade var(--igs-fx-life,2600ms) linear both;}.igs-combat-awaken-fx::before{animation:none!important;}.igs-combat-awaken-fx::after{display:none;}}`;

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
${C} .igs-combat-result:has(>.igs-combat-loot) .igs-combat-result-figure{width:min(var(--r-w),calc((100% - (var(--n,1) - 1) * 16px) / var(--n,1)));}`;
// 战前对阵竖排（竖向面板；不支持容器查询时按视口方向）：敌方在上、我方在下；敌方色块止于敌方区下缘（100% - --t），我方色块从我方一排上沿（--t）起铺，VS 所在一行不铺色块；入场改为上下冲入；底层色块在我方一排沿首框左斜边、末框右斜边裁掉，--t 是我方一排的上沿（舞台半高 + VS 半高 + 行距，与三行网格一致）。
const LOBBY_STACK = `${C} .igs-combat-lobby-stage{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto minmax(0,1fr);grid-template-areas:"enemy" "vs" "ally";}
${C} .igs-combat-lobby{--vs:clamp(40px,min(9cqh,13cqw),64px);--cut:clamp(12px,4.5cqh,32px);}
${C} .igs-combat-lobby-fx{--t:calc(50% + var(--vs) / 2 + var(--l-gap));-webkit-clip-path:polygon(0 0,100% 0,100% var(--t),calc(100% - var(--cut)) 100%,0 100%,var(--cut) var(--t),0 var(--t));clip-path:polygon(0 0,100% 0,100% var(--t),calc(100% - var(--cut)) 100%,0 100%,var(--cut) var(--t),0 var(--t));}
${C} .igs-combat-lobby-fx .is-ally{clip-path:polygon(0 var(--t),100% var(--t),100% 100%,0 100%);background:linear-gradient(0deg,rgba(242,166,92,.34),rgba(242,196,128,.12) 62%,rgba(242,196,128,.05));}
${C} .igs-combat-lobby-fx .is-enemy{clip-path:polygon(0 0,100% 0,100% calc(100% - var(--t)),0 calc(100% - var(--t)));background:linear-gradient(180deg,rgba(10,8,18,.7),rgba(150,26,48,.4) 60%,rgba(120,22,44,.28));}
${C} .igs-combat-lobby[data-intro] .igs-combat-lobby-side.is-ally{animation-name:igs-combat-lobby-from-b;}
${C} .igs-combat-lobby[data-intro] .igs-combat-lobby-side.is-enemy{animation-name:igs-combat-lobby-from-t;}`;
// 竖向面板（宽于窄屏阈值）：主战者一组与队友居中成一排，手牌单独占下一排；主战者按面板高度放大。
const PORTRAIT = `${C} .igs-combat-foot{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "hand" "turn";gap:8px;}
${C} .igs-combat-hand{padding-bottom:24px;}
${C} .igs-combat-hero{justify-content:center;}
${C} .igs-combat-unit[data-size="lg"]{--u-w:clamp(150px,min(20cqh,26cqw),220px);}
${LOBBY_STACK}
${C} .igs-combat-lobby{--l-foe:clamp(80px,min(22cqh,28cqw),220px);}`;
// 窄面板（≤720px）：紧凑排布；支持容器查询时按面板宽度生效，否则回落到视口宽度。
const NARROW = `${C} .igs-combat-head{min-height:40px;padding:4px 6px 0 14px;}
${C} .igs-combat-turn{gap:6px;}
${C} .igs-combat-track{--dot:18px;flex-basis:min(52%,280px);min-width:120px;}
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
${C} .igs-combat-hero-skill{gap:5px;font-size:11px;}
${C} .igs-combat-hero-skill-orb{width:38px;height:38px;}
${C} .igs-combat-hero-skill-orb svg{width:19px;height:19px;}
${C} .igs-combat-hero-skill-cost{width:16px;height:16px;font-size:11px;}
${C} .igs-combat-energy{gap:5px;}
${C} .igs-combat-energy-orb{width:32px;height:32px;}
${C} .igs-combat-energy-orb b{font-size:15px;}
${C} .igs-combat-turn .igs-combat-btn.is-icon{width:46px;min-height:30px;height:30px;}
${C} .igs-combat-turn .igs-combat-btn.is-icon.is-primary{width:62px;}
${C} .igs-combat-btn.is-icon svg{width:18px;height:18px;}
${C} .igs-combat-card{min-height:112px;gap:3px;padding:5px 6px 6px;}
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
// 紧凑横屏（721–1279px）：有助战时控件绝对定位在主战者头像右上方，底边高于静止牌顶、首个圆钮贴住圆框外沿（坐标由面板实测后写入 --igs-hero-ctrl-x / -y，未量到时用保底位置），技能名完整显示；矮面板里控件升进敌方一排高度时，面板按最左敌人左缘写入 --igs-hero-ctrl-w 限宽，技能名省略。没有助战时控件放在主战者上方。撤退在结束回合上方，更宽面板不变。
const FOOT_COMPACT = `${C} .igs-combat-foot{gap:10px;}
${C} .igs-combat-hero{gap:10px;}
${C} .igs-combat-hero-core{flex-direction:column-reverse;align-items:flex-start;gap:6px;}
${C} .igs-combat-controls{flex-direction:row;flex-wrap:wrap;align-items:center;}
${C} .igs-combat-hero:has(>.igs-combat-side.is-ally){position:relative;display:grid;grid-template-columns:auto auto;grid-template-rows:1fr auto;grid-template-areas:"figure controls" "figure mates";gap:6px 10px;}
${C} .igs-combat-hero:has(>.igs-combat-side.is-ally)>.igs-combat-hero-core{display:contents;}
${C} .igs-combat-hero:has(>.igs-combat-side.is-ally) .igs-combat-hero-figure{grid-area:figure;}
${C} .igs-combat-hero:has(>.igs-combat-side.is-ally) .igs-combat-controls{grid-area:auto;position:absolute;left:var(--igs-hero-ctrl-x,calc(100% - 124px));top:var(--igs-hero-ctrl-y,-32px);z-index:2;flex-wrap:nowrap;width:max-content;}
${C} .igs-combat-hero:has(>.igs-combat-side.is-ally) :is(.igs-combat-hero-skill-name,.igs-combat-awaken-name){max-width:9em;}
${C} .igs-combat-hero:has(>.igs-combat-side.is-ally) .igs-combat-controls{max-width:var(--igs-hero-ctrl-w,none);}
${C} .igs-combat-hero:has(>.igs-combat-side.is-ally) .igs-combat-controls>:is(.igs-combat-hero-skill,.igs-combat-awaken){flex:0 1 auto;min-width:0;}
${C} .igs-combat-hero>.igs-combat-side.is-ally{grid-area:mates;}
${C} .igs-combat-turn-btns{flex-direction:column;align-items:flex-end;gap:6px;}`;
// 竖向面板的我方一排：不用圆框，与敌人一样是 3:4 半身立绘（下沿渐隐），主战者与队友同宽（按我方人数 --n 均分，不换行）；
// 队友按奇偶分到主战者左右，主战者居中，人物技能仍贴在主战者右侧（不叠到头像上方，免得多占一行纵向空间），均分宽度时扣掉技能列；选中 / 出手 / 可选目标不画外环，沿用立绘外发光。
const PORTRAIT_ALLIES = `${C} .igs-combat-foot .igs-combat-hero{flex-wrap:nowrap;justify-content:center;align-items:flex-end;gap:8px;}
${C} .igs-combat-hero>.igs-combat-side.is-ally{display:contents;}
${C} .igs-combat-hero .igs-combat-side.is-ally>.igs-combat-unit:nth-child(odd){order:-1;}
${C} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size]{--u-w:min(clamp(64px,13cqh,140px),calc((100cqw - 40px - var(--hero-controls-space,74px) - (var(--n,1) - 1) * 8px) / var(--n,1)));--crop:1;flex:none;}
${C} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size] .igs-combat-portrait{aspect-ratio:3/4;border-radius:0;background:none;box-shadow:none;-webkit-mask-image:linear-gradient(180deg,#000 70%,transparent);mask-image:linear-gradient(180deg,#000 70%,transparent);}
${C} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size] .igs-combat-portrait :is(img,svg,.igs-combat-art){transform:none;object-position:50% 0;}
${C} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size] .igs-combat-unit-info{margin-top:-14px;}`;

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
${C} .igs-combat-intent{--it:var(--igs-cb-warm);position:relative;z-index:1;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0 4px;align-self:center;box-sizing:border-box;width:max-content;max-width:calc(100% + var(--e-gap,0px) - 4px);min-height:24px;margin-bottom:-4px;padding:2px 8px;border-radius:var(--igs-cb-r-m);background:var(--igs-cb-veil);color:var(--igs-cb-ink-soft);font-size:12px;font-weight:600;letter-spacing:.04em;line-height:1.25;text-align:center;box-shadow:0 6px 14px -8px rgba(0,0,0,.7);}
${C} .igs-combat-intent[data-intent="attack"]{--it:var(--igs-cb-attack);}
${C} .igs-combat-intent[data-intent="defend"]{--it:var(--igs-cb-skill);}
${C} .igs-combat-intent[data-intent="heal"]{--it:var(--igs-cb-life);}
${C} .igs-combat-intent[data-intent="debuff"]{--it:var(--igs-cb-power);}
${C} .igs-combat-intent-icon{flex:none;display:grid;place-items:center;color:var(--it);}
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
${C}>.igs-combat-lobby-flash{position:absolute;inset:0;z-index:3;pointer-events:none;background:#fff;opacity:0;animation:igs-combat-lobby-flash .42s .48s ease-out both;}
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
/* 窄面板操作区：原能量槽与技能移入手牌下方左列，回合操作保留右列。 */
${C}[data-igs-combat-docked] .igs-combat-foot:not(.is-ended){grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"hero hero" "hand hand" "dock turn";}
${C}[data-igs-combat-docked] .igs-combat-hero{--hero-controls-space:0px;}
${C}[data-igs-combat-docked] .igs-combat-dock{grid-area:dock;display:flex;align-items:center;gap:10px;min-width:0;padding-top:6px;}
${C}[data-igs-combat-docked] .igs-combat-dock>.igs-combat-energy{position:static;flex:none;}
${C}[data-igs-combat-docked] .igs-combat-dock>.igs-combat-controls{flex:1 1 0;min-width:0;flex-direction:row;flex-wrap:wrap;align-items:center;gap:6px;}
/* 队友与敌人的自动行动演出播放中（根节点 data-igs-combat-auto）：底栏不接收点击，播完再出牌。 */
${C}[data-igs-combat-auto] .igs-combat-foot{pointer-events:none;}
${C} .igs-combat-hero{grid-area:hero;display:flex;align-items:flex-end;gap:14px;min-width:0;}
/* 主战者一组：圆框半身像在左（能量叠在左上角），人物技能 / 牌堆竖排贴在头像右侧；回合按钮在右下角 .igs-combat-turn。 */
${C} .igs-combat-hero-core{flex:none;display:flex;align-items:center;gap:8px;}
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

/* 人物技能徽章：圆形深色底 + 暖色细描环 + 程序图标，左上角暖色费用圆标，右侧单行技能名；整颗按钮 ≥44px 高，触屏可点。 */
${C} .igs-combat-hero-skill{position:relative;flex:none;display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:0;border:0;background:none;color:var(--igs-cb-ink);font:inherit;font-size:12px;font-weight:600;letter-spacing:.04em;line-height:1.2;text-align:left;text-shadow:0 1px 2px rgba(0,0,0,.75);cursor:pointer;}
${C} .igs-combat-hero-skill-orb{position:relative;flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:${igsUiSurface(IGS_UI_THICKNESS.thick)};color:var(--igs-cb-warm);box-shadow:0 0 0 1.5px rgba(242,212,155,.38),0 8px 18px -8px rgba(0,0,0,.75),${IGS_UI_EDGE_NIGHT};transition:transform .18s var(--igs-cb-ease),filter .18s var(--igs-cb-ease),box-shadow .18s var(--igs-cb-ease);}
${C} .igs-combat-hero-skill-orb svg{width:22px;height:22px;stroke-width:1.5;}
${C} .igs-combat-hero-skill:not(.is-disabled):hover .igs-combat-hero-skill-orb{filter:brightness(1.15);transform:translateY(-1px);}
${C} .igs-combat-hero-skill.is-selected .igs-combat-hero-skill-orb{transform:translateY(-1px);box-shadow:0 0 0 2px var(--igs-cb-warm),0 0 14px rgba(242,212,155,.45),0 8px 16px -8px rgba(0,0,0,.75);}
${C} .igs-combat-hero-skill.is-disabled{opacity:.5;}
${C} .igs-combat-hero-skill.is-used .igs-combat-hero-skill-orb svg{opacity:.4;}
${C} .igs-combat-hero-skill-cost{position:absolute;left:-4px;top:-4px;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--igs-cb-warm);color:#1b1d21;font-size:12px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;text-shadow:none;box-shadow:0 0 0 2px rgba(242,212,155,.18);}
${C} .igs-combat-hero-skill-name{min-width:0;max-width:6.5em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* 觉醒按钮：与人物技能徽章同材质的圆形深色底，细环与图标取情绪色（--aw），可用时环光缓慢呼吸；每场一次，用后不再渲染。 */
${C} .igs-combat-awaken{position:relative;flex:none;display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:0;border:0;background:none;color:var(--igs-cb-ink);font:inherit;font-size:12px;font-weight:600;letter-spacing:.04em;line-height:1.2;text-align:left;text-shadow:0 1px 2px rgba(0,0,0,.75);cursor:pointer;}
${C} .igs-combat-awaken-orb{position:relative;flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:${igsUiSurface(IGS_UI_THICKNESS.thick)};color:var(--aw);box-shadow:0 0 0 1.5px color-mix(in srgb,var(--aw) 60%,transparent),0 8px 18px -8px rgba(0,0,0,.75),${IGS_UI_EDGE_NIGHT};transition:transform .18s var(--igs-cb-ease),filter .18s var(--igs-cb-ease);}
${C} .igs-combat-awaken-orb svg{width:22px;height:22px;stroke-width:1.5;}
${C} .igs-combat-awaken:not(.is-disabled) .igs-combat-awaken-orb{animation:igs-combat-awaken-pulse 2.4s ease-in-out infinite;}
${C} .igs-combat-awaken:not(.is-disabled):hover .igs-combat-awaken-orb{filter:brightness(1.15);transform:translateY(-1px);}
${C} .igs-combat-awaken.is-disabled{opacity:.5;}
${C} .igs-combat-awaken-name{min-width:0;max-width:6.5em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:color-mix(in srgb,var(--aw) 45%,var(--igs-cb-ink));}
@keyframes igs-combat-awaken-pulse{0%,100%{box-shadow:0 0 0 1.5px color-mix(in srgb,var(--aw) 60%,transparent),0 8px 18px -8px rgba(0,0,0,.75);}50%{box-shadow:0 0 0 2px var(--aw),0 0 16px color-mix(in srgb,var(--aw) 55%,transparent),0 8px 18px -8px rgba(0,0,0,.75);}}
#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-awaken-orb{animation:none;}
/* 道具栏：一排 34px 圆钮（与人物技能徽章同材质），右上角暖色余量圆标；按钮间距 6px，超出时换行。 */
${C} .igs-combat-items{display:flex;flex-wrap:wrap;gap:6px;max-width:160px;}
${C} .igs-combat-item{position:relative;flex:none;padding:0;border:0;background:none;color:var(--igs-cb-life);cursor:pointer;}
${C} .igs-combat-item-orb{position:relative;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:${igsUiSurface(IGS_UI_THICKNESS.thick)};box-shadow:0 0 0 1.5px rgba(85,199,149,.4),0 6px 14px -6px rgba(0,0,0,.7),${IGS_UI_EDGE_NIGHT};transition:transform .18s var(--igs-cb-ease),filter .18s var(--igs-cb-ease);}
${C} .igs-combat-item-orb svg{width:18px;height:18px;stroke-width:1.5;}
${C} .igs-combat-item:not(.is-disabled):hover .igs-combat-item-orb{filter:brightness(1.15);transform:translateY(-1px);}
${C} .igs-combat-item.is-disabled{opacity:.5;}
${C} .igs-combat-item-count{position:absolute;right:-4px;top:-4px;display:grid;place-items:center;min-width:15px;height:15px;padding:0 3px;box-sizing:border-box;border-radius:8px;background:var(--igs-cb-warm);color:#1b1d21;font-size:10px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;}
${C} .igs-combat-controls{flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:6px;}
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
${C} .igs-combat-hand{--igs-card-w:116px;grid-area:hand;position:relative;display:flex;justify-content:center;align-items:flex-end;min-width:0;overflow:visible;padding:20px 28px 2px;}
${C} .igs-combat-card{--igs-card-tint:var(--igs-cb-skill);position:relative;flex:none;display:flex;flex-direction:column;align-items:stretch;gap:4px;width:var(--igs-card-w);min-height:176px;padding:8px 8px 10px;box-sizing:border-box;border:0;border-radius:var(--igs-cb-r-l);background:${igsUiSurface(IGS_UI_THICKNESS.thick)};color:var(--igs-cb-ink);font:inherit;text-align:left;cursor:pointer;box-shadow:0 14px 28px -14px rgba(0,0,0,.7),${IGS_UI_EDGE_NIGHT};transform-origin:50% 130%;transform:translateY(var(--fan-y,0px)) rotate(var(--fan-r,0deg));transition:transform .18s var(--igs-cb-ease),margin .18s var(--igs-cb-ease),box-shadow .18s var(--igs-cb-ease);}
${C} .igs-combat-card[data-card-type="attack"]{--igs-card-tint:var(--igs-cb-attack);}
${C} .igs-combat-card[data-card-type="power"]{--igs-card-tint:var(--igs-cb-power);}
${C} .igs-combat-hand .igs-combat-card+.igs-combat-card{margin-left:min(-30px,calc((100% - var(--fan-n,1) * var(--igs-card-w)) / (var(--fan-n,2) - 1)));}
${C} .igs-combat-card:is(:hover,:focus-visible,.is-selected){z-index:5;transform:translateY(-22px) rotate(0deg) scale(1.06);}
/* 抬起的牌离开了原来的位置：牌底下补一条透明命中区，盖住抬起让出的空档，指针停在牌下沿时不会因牌上移而失去悬停、来回抖动。 */
${C} .igs-combat-card-hit{position:absolute;left:0;right:0;top:100%;height:0;}
${C} .igs-combat-card:is(:hover,:focus-visible,.is-selected) .igs-combat-card-hit{height:28px;}
${C} .igs-combat-card.is-selected{box-shadow:0 0 0 2px var(--igs-cb-warm),0 18px 32px -14px rgba(0,0,0,.75);}
${C} .igs-combat-card.is-disabled{opacity:.5;}
/* 炉石式拖牌：手牌不让给浏览器平移手势；拖动中原牌隐藏，影子卡（演出层 .is-held）跟随指针并放大，停在可承受的单位上时缩小示意松手即打出。 */
${C} .igs-combat-hand .igs-combat-card{touch-action:none;}
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
/* 带加成 / 减益的数字：虚下划线提示可点；点开的详情浮在面板根节点上（.igs-combat-scale-tip，坐标由面板写入 --tip-x / --tip-y，上方放不下时 data-below 放到数字下方）。 */
${C} .igs-combat-card-text [data-scale-tip]{cursor:help;text-decoration:underline dotted;text-decoration-thickness:1px;text-underline-offset:2px;}
${C}>.igs-combat-scale-tip{position:absolute;left:var(--tip-x,50%);top:var(--tip-y,50%);z-index:6;translate:-50% calc(-100% - 8px);max-width:min(240px,calc(100% - 16px));padding:6px 10px;box-sizing:border-box;border-radius:var(--igs-cb-r-m);background:${igsUiSurface(IGS_UI_THICKNESS.thick)};color:var(--igs-cb-ink);font-size:12px;line-height:1.5;letter-spacing:.04em;white-space:pre-line;font-variant-numeric:tabular-nums;pointer-events:none;box-shadow:0 10px 24px -10px rgba(0,0,0,.8),${IGS_UI_EDGE_NIGHT};}
${C}>.igs-combat-scale-tip[data-below]{translate:-50% 8px;}
${C} .igs-combat-card.is-upgraded .igs-combat-card-name{color:var(--igs-cb-warm);}
${C} .igs-combat-card[data-rarity]:not(:is([data-rarity="basic"],[data-rarity="epic"],[data-rarity="mythic"])):not(.is-selected){box-shadow:0 14px 28px -14px rgba(0,0,0,.7),inset 0 1.5px 0 var(--rar);}
${C} .igs-combat-card[data-rarity]:not(:is([data-rarity="basic"],[data-rarity="epic"],[data-rarity="mythic"])) .igs-combat-card-cost{box-shadow:0 0 0 2px var(--rar);}
${C} .igs-combat-card[data-rarity]:not([data-rarity="basic"]) .igs-combat-card-art{background:radial-gradient(90% 55% at 50% 100%,color-mix(in srgb,var(--rar) 30%,transparent),transparent 72%),radial-gradient(70% 90% at 50% 40%,color-mix(in srgb,var(--igs-card-tint) 22%,transparent),transparent 72%),var(--igs-cb-fill);}
${C} .igs-combat-card[data-rarity="signature"]::before{content:"";position:absolute;left:10px;right:10px;top:0;height:1.5px;border-radius:1px;background:linear-gradient(90deg,transparent,#f2d49b 20%,#ff8a5c 80%,transparent);pointer-events:none;}
${C} .igs-combat-card[data-rarity="signature"]::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,transparent 42%,rgba(255,196,150,.16) 50%,transparent 58%) 0 0/260% 100% no-repeat;animation:igs-combat-sheen 4.8s ease-in-out infinite;}
@keyframes igs-combat-sheen{0%,35%{background-position:120% 0;}100%{background-position:-20% 0;}}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-card[data-rarity="signature"]::after{animation:none;background:none;}}
#igs-overlay[data-igs-quality="low"] ${C} .igs-combat-card[data-rarity="signature"]::after{animation:none;background:none;}
${combatRarityStyle(`${C} .igs-combat-card`)}
${C} .igs-combat-card:is([data-rarity="epic"],[data-rarity="mythic"]):not(.is-selected){box-shadow:0 14px 28px -14px rgba(0,0,0,.7);}
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
@media (prefers-reduced-motion:reduce){${C} .igs-combat-hp-track i,${C} .igs-combat-card,${C} .igs-combat-hero-skill,${C} .igs-combat-awaken-orb{transition:none;animation:none!important;}}
${AWAKEN_FX}
${COMBAT_CUTIN_STYLE_TEXT}
${COMBAT_HIT_STYLE_TEXT}
${COMBAT_ENEMY_ART_STYLE_TEXT}
@media (prefers-reduced-motion:reduce){${C} .igs-combat-portrait :is(img,svg,.igs-combat-art),${C} .igs-combat-energy-liquid::before,${C} .igs-combat-energy-liquid::after,${C} .igs-combat-lobby :is(.igs-combat-lobby-side,.igs-combat-lobby-stage,.igs-combat-lobby-banner,.igs-combat-lobby-fx i),${C} .igs-combat-result :is(.igs-combat-result-title,.igs-combat-result-rays,.igs-combat-result-sparks i){animation:none!important;}${C} .igs-combat-lobby-flash{display:none;}}
#igs-combat-entry{position:absolute;left:50%;bottom:calc(var(--igs-dialog-height,30%) + 14px);z-index:7;transform:translateX(-50%);pointer-events:auto;}
#igs-overlay.igs-record-screen-open #igs-combat-entry{display:none;}
#igs-overlay[data-igs-combat-open] #igs-dialog-layer{visibility:hidden;}
#igs-combat-entry .igs-combat-entry-btn{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:200px;padding:8px 40px 9px;border:0;background:linear-gradient(90deg,transparent,rgba(${N},.72) 20%,rgba(${N},.72) 80%,transparent);color:${IGS_UI_INK.primary};font:inherit;cursor:pointer;text-shadow:0 1px 4px rgba(0,0,0,.75);}
#igs-combat-entry .igs-combat-entry-cap{color:var(--igs-battle-accent,${IGS_UI_WARM});font-size:11px;font-weight:600;letter-spacing:.3em;}
#igs-combat-entry .igs-combat-entry-name{font-size:18px;font-weight:600;letter-spacing:.2em;}
#igs-combat-entry .igs-combat-entry-foes{font-size:12px;opacity:.8;letter-spacing:.1em;}
#igs-combat-entry .igs-combat-entry-btn:focus-visible{outline:2px solid ${IGS_UI_WARM};outline-offset:2px;}
`;
