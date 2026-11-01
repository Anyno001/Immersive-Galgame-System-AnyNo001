// 战斗面板「黑幕」皮肤（data-igs-combat-skin="veil"，开启战斗时的默认皮肤）：只覆盖外观，不改版式、时序与演出结构。
// 规则同对话框皮肤 gradient-veil：中间是同一块近黑，只在边缘化开；没有线与框，斜切色带拉直；白字靠黑投影站稳；强调色只用一种淡金。
// 共创原作者的外观保留为「初始方案」（data-igs-combat-skin="initial"），不受本文件影响。
const V = '#igs-combat-panel[data-igs-combat-skin="veil"]';
const EDGE = '#0a0a0b';
const GOLD = '#ffeeb8';
const HALO = '0 1px 3px #000,0 0 14px #000';
const K = `${V} .igs-combat-card[data-card-type]`;
const VEIL_X = `linear-gradient(90deg,transparent,${EDGE} 22%,${EDGE} 78%,transparent)`;
// 战前对阵色块：从外侧边缘的近黑向 VS 一侧化开。deg 为渐变方向（横排 90 / 270，竖排 0 / 180）。
const lobbySide = (deg) => `linear-gradient(${deg}deg,${EDGE},rgba(10,10,11,.6) 62%,transparent)`;

export const COMBAT_PANEL_SKIN_VEIL_STYLE_TEXT = `
${V}{--igs-cb-warm:${GOLD};background:linear-gradient(180deg,rgba(10,10,11,.55),rgba(10,10,11,.2) 34%,rgba(10,10,11,.35) 62%,rgba(10,10,11,.92));}
${V} :is(.igs-combat-title,.igs-combat-unit-name,.igs-combat-plate,.igs-combat-lobby-banner,.igs-combat-round,.igs-combat-result-title){text-shadow:${HALO};}
/* 斜切色带：拉直，换成两端化开的黑幕 */
${V} :is(.igs-combat-round,.igs-combat-unit-name,.igs-combat-plate,.igs-combat-lobby-banner,.igs-combat-result-title)::before{transform:none;background:${VEIL_X};}
${V} .igs-combat-unit[data-side="enemy"] .igs-combat-unit-name::before{background:${VEIL_X};}
${V} .igs-combat-round{color:${GOLD};font-style:normal;padding-left:22px;padding-right:22px;}
${V} .igs-combat-unit-name{padding-left:16px;padding-right:16px;}
${V} .igs-combat-plate{color:#fff;}
${V} .igs-combat-plate em{transform:none;font-style:normal;}
${V} .igs-combat-plate em[data-tag="boss"]{background:${EDGE};color:${GOLD};}
${V} .igs-combat-lobby-banner{padding-left:64px;padding-right:64px;color:#fff;}
${V} .igs-combat-result-title{font-style:normal;color:#fff;}
/* 战前对阵：暖橙、暗红两块色块换成从外侧化开的黑幕，VS 白字不斜 */
${V} .igs-combat-lobby-fx .is-ally{background:${lobbySide(90)};}
${V} .igs-combat-lobby-fx .is-enemy{background:${lobbySide(270)};}
${V} .igs-combat-lobby-vs b{color:#fff;font-style:normal;font-weight:800;letter-spacing:.16em;text-shadow:0 0 16px rgba(255,238,184,.35),0 2px 6px #000;}
/* 按钮：近黑实底、白字；主按钮淡金字，不描边 */
${V} .igs-combat-btn{background:${EDGE};color:#d9d7d1;}
${V} .igs-combat-btn:hover{background:#1a1b1f;color:#fff;}
${V} .igs-combat-btn.is-primary{background:${EDGE};color:${GOLD};}
${V} .igs-combat-btn.is-primary:hover{background:#1a1b1f;}
/* 战前立绘框：暖金光晕与半透明底换成近黑框底，只在头部留一点淡金光；名牌改黑幕带、白字，敌方名牌不再铺暗红 */
${V} .igs-combat-lobby-figure[data-side="ally"]{background:radial-gradient(90% 55% at 55% 16%,rgba(255,238,184,.16),transparent 70%),linear-gradient(180deg,#141416,${EDGE});}
${V} .igs-combat-lobby-figure[data-picked]{background:radial-gradient(90% 55% at 55% 16%,rgba(255,238,184,.26),transparent 70%),linear-gradient(180deg,#18181b,${EDGE});}
${V} .igs-combat-lobby-figure .igs-combat-plate::before,${V} .igs-combat-lobby-figure[data-side="ally"] .igs-combat-plate::before,${V} .igs-combat-lobby-figure[data-picked] .igs-combat-plate::before{background:${VEIL_X};}
${V} .igs-combat-lobby-figure[data-side="enemy"] .igs-combat-plate::before{background:${VEIL_X};}
${V} .igs-combat-lobby-name{font-style:normal;text-shadow:${HALO};}
/* 选中的主战者名牌：初始方案按下时改深色字，压在黑幕上看不清，这里保持白字加黑投影，淡金标示选中 */
${V} button.igs-combat-plate[aria-pressed="true"]{color:${GOLD};text-shadow:${HALO};}
${V} .igs-combat-plate small{color:#bcbab4;}
/* 档位小标：不斜，近黑底淡金字；首领档用暗红字，不铺色块 */
${V} .igs-combat-lobby-tier{transform:none;font-style:normal;background:${EDGE};color:${GOLD};}
${V} .igs-combat-lobby[data-tier="boss"] .igs-combat-lobby-tier{background:${EDGE};color:#cf6a64;}
/* 开始战斗：斜切暖金块换成直切黑幕带，淡金字，无投影 */
${V} .igs-combat-lobby [data-combat-act="start"]{font-style:normal;color:${GOLD};padding-left:64px;padding-right:64px;}
${V} .igs-combat-lobby [data-combat-act="start"]::before{transform:none;background:${VEIL_X};box-shadow:none;}
/* 开战过场：暖金色带换成黑幕带，只留淡金字光；大字不斜 */
${V} .igs-combat-opening{--ct:${GOLD};}
${V} .igs-combat-opening .igs-combat-cutin-band{background:linear-gradient(90deg,transparent,${EDGE} 18%,${EDGE} 82%,transparent);box-shadow:none;}
${V} .igs-combat-opening-word{text-shadow:0 0 24px rgba(255,238,184,.45),0 4px 12px #000;}
/* 我方头像：去掉暖金环，平时是近黑间隙 + 暗灰细线；操控、出手、可选目标时换淡金细环，光晕改淡金 */
${V} .igs-combat-unit[data-side="ally"] .igs-combat-portrait{box-shadow:0 0 0 4px ${EDGE},0 0 0 5px #2b2c30,0 10px 22px -10px #000;}
${V} .igs-combat-unit[data-side="ally"].is-controlled .igs-combat-portrait{box-shadow:0 0 0 4px ${EDGE},0 0 0 5px ${GOLD},0 10px 22px -10px #000;}
${V} .igs-combat-unit[data-side="ally"]:is(.is-acting,.is-targetable) .igs-combat-portrait{box-shadow:0 0 0 4px ${EDGE},0 0 0 5px ${GOLD},0 0 18px rgba(255,238,184,.45);}
${V} .igs-combat-unit[data-side="ally"].is-targetable:is(:hover,.is-drop-hover) .igs-combat-portrait{box-shadow:0 0 0 4px ${EDGE},0 0 0 5px ${GOLD},0 0 24px rgba(255,238,184,.6);}
/* 血条直切；能量球淡金细环，液面淡金 */
${V} .igs-combat-hp-track{transform:none;}
${V} .igs-combat-energy-orb{box-shadow:0 0 0 1px ${GOLD},0 8px 18px -8px #000;}
${V} .igs-combat-energy-liquid{background:linear-gradient(180deg,#fff6dc,${GOLD} 40%,#e3d3a2);}
${V} .igs-combat-trait{--ring:#3a3a3c;}
/* 行动条：出手点与出手中的头像光晕改淡金 */
${V} .igs-combat-track-goal{filter:drop-shadow(0 0 4px rgba(255,238,184,.6));}
${V} .igs-combat-track-dot.is-acting{box-shadow:0 0 0 2px ${GOLD},0 0 10px rgba(255,238,184,.5);}
/* 结算成就条：斜切暖色带拉直成黑幕 */
${V} .igs-combat-feat::before{transform:none;background:${VEIL_X};}
/* 技能特写：保留斜带（唯一的锐利来源），色带换近黑，上下各一条两端渐隐的强调色细线 */
${V} .igs-combat-cutin-band{background:linear-gradient(var(--ct),var(--ct)) top/100% 1px no-repeat,linear-gradient(var(--ct),var(--ct)) bottom/100% 1px no-repeat,${EDGE};-webkit-mask:linear-gradient(90deg,transparent,#000 16%,#000 84%,transparent);mask:linear-gradient(90deg,transparent,#000 16%,#000 84%,transparent);box-shadow:none;}
${V} .igs-combat-opening .igs-combat-cutin-band{background:${EDGE};}
/* 觉醒：两段式不动；眼部斜条底改近黑，主段宽斜带换黑幕，交叉细斜带不用；情绪色只留在字光与立绘光晕 */
${V} .igs-combat-awaken-eye-strip{background-color:${EDGE};}
${V} .igs-combat-awaken-band{background:linear-gradient(90deg,transparent,${EDGE} 14%,${EDGE} 86%,transparent);box-shadow:none;}
${V} .igs-combat-awaken-band.is-cross{display:none;}
/* ===== 战斗中画面 ===== */
/* 卡牌：尖角经典样式。类型三色（攻击红 / 技能翠 / 能力紫），普通牌偏灰、强化牌鲜艳（同色相）；底部 4px 类型色条，数值同色 */
${K}{--tc:#b0706a;border-radius:0;background:linear-gradient(to top,var(--tc) 0 4px,#1c1c1e 4px);}
${K}[data-card-type="skill"]{--tc:#6fa892;}
${K}[data-card-type="power"]{--tc:#8f84b8;}
${K}[data-card-type="attack"].is-upgraded{--tc:#ff5446;}
${K}[data-card-type="skill"].is-upgraded{--tc:#3fe6a6;}
${K}[data-card-type="power"].is-upgraded{--tc:#a78bff;}
${K}:is(.is-selected,.is-chosen){background:linear-gradient(to top,var(--tc) 0 5px,#2e2e33 5px);}
${K} .igs-combat-card-name,${K}.is-upgraded .igs-combat-card-name,${K}:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-combat-card-name{color:var(--igs-cb-ink);}
${K} .igs-combat-card-value{color:var(--tc);}
${K} .igs-combat-card-unit{color:var(--igs-cb-ink-soft);}
${K} .igs-combat-card-kwfull>i{border-radius:0;}
/* 稀有度：牌框粗细与层数，只用灰白明度；个人、专属在左上角加红角；神话的流光与专属的细线不用 */
${K}[data-rarity]:not(.is-selected){box-shadow:0 14px 28px -14px rgba(0,0,0,.7);}
${K}[data-rarity="common"]:not(.is-selected){box-shadow:inset 0 0 0 1.5px #6a6a70,0 14px 28px -14px rgba(0,0,0,.7);}
${K}[data-rarity="uncommon"]:not(.is-selected){box-shadow:inset 0 0 0 2px #d8d6cf,0 14px 28px -14px rgba(0,0,0,.7);}
${K}:is([data-rarity="rare"],[data-rarity="personal"],[data-rarity="signature"]):not(.is-selected){box-shadow:inset 0 0 0 2px #ece9e1,inset 0 0 0 4px #1c1c1e,inset 0 0 0 5px #ece9e1,0 14px 28px -14px rgba(0,0,0,.7);}
${K}[data-rarity="epic"]:not(.is-selected){box-shadow:inset 0 0 0 3px #f4f2ec,inset 0 0 0 5px #1c1c1e,inset 0 0 0 6.5px #f4f2ec,0 14px 28px -14px rgba(0,0,0,.7);}
${K}[data-rarity="mythic"]:not(.is-selected){box-shadow:inset 0 0 0 3px #fffaf0,inset 0 0 0 5px #1c1c1e,inset 0 0 0 6.5px #fffaf0,0 0 16px 3px rgba(255,250,240,.5),0 14px 28px -14px rgba(0,0,0,.7);}
${K}[data-rarity="mythic"]::after{display:none;}
${K}[data-rarity="signature"]::before{display:none;}
${K}:is([data-rarity="personal"],[data-rarity="signature"])::after{content:"";display:block;position:absolute;left:0;top:0;right:auto;bottom:auto;inset:0 auto auto 0;width:14px;height:14px;border-radius:0;background:#e5483f;clip-path:polygon(0 0,100% 0,0 100%);animation:none;z-index:3;pointer-events:none;}
/* 费用：稀有度不再画在费用币上；减费的费用币深底、金圈、金字 */
${K}[data-rarity] .igs-combat-card-cost{box-shadow:none;}
${K}:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-combat-card-cost{background:var(--igs-cb-warm);color:#1b1d21;}
${K} .igs-combat-card-cost.is-down{background:#121214;color:${GOLD};box-shadow:inset 0 0 0 1.5px ${GOLD};}
/* 费用不够：去色压暗 */
${K}.is-disabled{opacity:1;filter:grayscale(1) brightness(.55);}
/* 牌堆：纯文字「抽牌 N · 弃牌 N」 */
${V} .igs-combat-piles{color:#bcbab4;font-weight:600;letter-spacing:.06em;}
${V} .igs-combat-piles b{color:#fff;font-weight:700;}
/* 台词条、战利品标题：不要左竖线，改成两端化开的黑幕 */
${V} .igs-combat-awaken-line{background:${VEIL_X};padding-left:2.4em;padding-right:2.4em;}
${V} .igs-combat-loot-cap{position:relative;isolation:isolate;padding:4px 48px;}
${V} .igs-combat-loot-cap::before{content:"";position:absolute;inset:0;z-index:-1;background:${VEIL_X};}
${V} .igs-combat-loot-card{border-radius:0;}
${V} .igs-combat-loot-face{border-radius:0;}
`;

// 竖排战前（敌上我下）：色块改为上下化开；与面板样式的 LOBBY_STACK 放在同一条件下，多一层 .igs-combat-lobby 保证压过横排规则。
export const COMBAT_PANEL_SKIN_VEIL_STACK = `${V} .igs-combat-lobby .igs-combat-lobby-fx .is-enemy{background:${lobbySide(180)};}
${V} .igs-combat-lobby .igs-combat-lobby-fx .is-ally{background:${lobbySide(0)};}`;
