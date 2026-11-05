// 战斗面板「风格化皮肤共用版式」：只改位置、尺寸与结构显隐，不定颜色与装饰（颜色沿用各皮肤自己的文件）。
// 作用范围是除 initial（初始方案）以外的全部皮肤，选择器统一以 SP 开头；initial 下新增的卡面插槽节点一律隐藏，初始方案的像素不变。
// SP 带两个 id，压过 combat-panel-style.js 里所有只含一个 id 的规则（含容器查询里的竖向 / 窄面板规则），不依赖书写顺序。
const C = '#igs-combat-panel';
const SP = `#igs-overlay ${C}:not([data-igs-combat-skin="initial"])`;

// 卡面插槽：数值、单位、同名张数、关键字全称、加成明细。初始方案不显示。
const SLOT_HIDDEN = `${C} :is(.igs-combat-card-value,.igs-combat-card-unit,.igs-combat-card-stack,.igs-combat-card-kwfull,.igs-combat-card-bonus){display:none;}`;

// 几何参数（竖屏 / 横屏）：都是面板容器的比例（cqw / cqh），概念稿 390×844、1280×720 的像素值换算而来。
// 圆环：rx 左右半径、w 正前方立绘宽、lift 后排上抬、back 后排缩小到的比例、dim 后排压暗到的亮度、foot 正前方脚底到面板底的距离、hp 头顶血条长度。
// 卡牌：tab 窄签宽高、sel 选中放大牌宽高。
const VARS_PORT = `${SP} .igs-combat-body{--ring-rx:38.5cqw;--ring-w:min(103.8cqw,calc((100cqh - var(--ring-foot) - 110px) * .75));--ring-lift:7.1cqh;--ring-back:.55;--ring-dim:.45;--ring-foot:32.9cqh;--ring-hp:220px;--track-h:clamp(120px,26cqh,230px);--tab-w:70px;--vis:47px;--tab-h:118px;--sel-w:136px;--sel-h:198px;--sel-lift:28px;}`;
const VARS_LAND = `${SP} .igs-combat-body{--ring-rx:32cqw;--ring-w:25.8cqw;--ring-lift:11.1cqh;--ring-back:.58;--ring-dim:.5;--ring-foot:24.3cqh;--ring-hp:260px;--track-h:clamp(120px,32cqh,230px);--tab-w:96px;--vis:60px;--tab-h:140px;--sel-w:160px;--sel-h:214px;--sel-lift:30px;}`;

// 卡面：数值与单位（窄签与放大牌共用）。数值加成时变亮 / 变暗由皮肤自己着色，这里只留 is-up / is-down 两个钩子。
const SLOT = `${SP} .igs-combat-card-value{display:block;font-size:26px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;}
${SP} .igs-combat-card-unit{display:block;margin-top:2px;font-size:10px;font-weight:600;letter-spacing:.08em;color:var(--igs-cb-ink-soft);}
${SP} .igs-combat-card-stack{position:absolute;left:32px;top:10px;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--igs-cb-ink-soft);}`;

// 步骤 2：敌人圆环。敌人区脱离文档流、以 .igs-combat-body 为基准按「脚底」定位；每个敌人用 --fx（左右，-1..1）与 --fd（深度，1 正前方）算位置：
// 水平 = fx × rx，上抬 = (1 - fd) × lift，缩放 = back + (1 - back) × fd，压暗 = dim + (1 - dim) × fd²。只有正前方显示头顶信息。
// 点击：单位块与立绘本身不接收指针，只留立绘中间一条命中区（::after），免得正前方宽大的立绘盖住后排；选目标时命中区的点击冒泡到单位块（data-combat-act="target"）。
const RING = `${SP} .igs-combat-main:has(>.igs-combat-field){padding:0;gap:0;}
${SP} .igs-combat-head,${SP} .igs-combat-notice{position:relative;z-index:3;}
${SP} .igs-combat-foot{position:relative;z-index:2;}
${SP} .igs-combat-field{padding:0;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy{position:absolute;left:0;right:0;bottom:var(--ring-foot);z-index:0;display:block;height:0;pointer-events:none;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-unit{--e-w:var(--ring-w);--ring-s:calc(var(--ring-back) + (1 - var(--ring-back)) * var(--fd,1));position:absolute;left:50%;bottom:calc((1 - var(--fd,1)) * var(--ring-lift));z-index:var(--fz,1);width:var(--ring-w);gap:0;pointer-events:none;translate:calc(-50% + var(--fx,0) * var(--ring-rx)) 0;scale:var(--ring-s);transform-origin:50% 100%;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-portrait{position:relative;order:2;aspect-ratio:3/4;max-height:none;pointer-events:none;filter:brightness(calc(var(--ring-dim) + (1 - var(--ring-dim)) * var(--fd,1) * var(--fd,1)));}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-portrait[data-side="enemy"] img{max-height:none;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-portrait::after{content:"";position:absolute;left:30%;right:30%;top:0;bottom:0;pointer-events:auto;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-unit.is-targetable{cursor:pointer;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-unit:not(.is-front) :is(.igs-combat-intent,.igs-combat-unit-info){display:none;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-unit.is-front>.igs-combat-intent{order:0;position:relative;z-index:1;margin:0 0 0;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-unit.is-front>.igs-combat-unit-info{order:1;position:relative;z-index:1;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:2px 8px;width:max-content;max-width:100cqw;margin:4px auto calc(var(--ring-w) * -.07);pointer-events:none;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-unit-info::before{display:none;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-unit-name{order:0;flex:none;max-width:120px;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-hp{order:1;flex:none;width:var(--ring-hp);margin-top:0;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-unit-badges{order:2;position:static;flex-direction:row;flex-wrap:wrap;justify-content:center;align-items:center;gap:3px;max-width:none;width:100%;}
${SP} .igs-combat-field>.igs-combat-side.is-enemy .igs-combat-statuses{flex-wrap:wrap;justify-content:center;max-height:none;overflow:visible;}`;

// 行动顺序：竖排贴左（竖屏右手持机；横屏同在左侧）。SVG 细线转竖，出手点菱形在上、起点在下；头像按进度 --p 自下而上，我方在线左、敌方在线右。
const TRACK = `${SP} .igs-combat-head>.igs-combat-track{position:absolute;left:8px;top:calc(100% + 6px);z-index:3;flex:none;width:calc(var(--dot) * 2 + 10px);min-width:0;height:var(--track-h);margin:0;}
${SP} .igs-combat-track-line{display:none;}
${SP} .igs-combat-head>.igs-combat-track::before{content:"";position:absolute;left:50%;top:var(--dot);bottom:calc(var(--dot) / 2);width:2px;translate:-50% 0;background:#55565b;}
${SP} .igs-combat-track-goal{left:50%;top:calc(var(--dot) / 2);transform:translate(-50%,-50%);}
${SP} .igs-combat-track-dot{left:auto;right:calc(50% + 2px);top:calc((1 - var(--p,0)) * (100% - var(--dot)));bottom:auto;transition:top .5s cubic-bezier(.4,0,.2,1),box-shadow .18s var(--igs-cb-ease);}
${SP} .igs-combat-track-dot[data-side="enemy"]{right:auto;left:calc(50% + 2px);top:calc((1 - var(--p,0)) * (100% - var(--dot)));bottom:auto;}
${SP} .igs-combat-track-dot.is-snap{transition:none;}
${SP} .igs-combat-head>.igs-combat-track~.igs-combat-speed,${SP} .igs-combat-head>.igs-combat-restart{margin-left:auto;}
${SP} .igs-combat-head>.igs-combat-restart+.igs-combat-speed{margin-left:8px;}`;

// 步骤 3：底栏。停靠区、工具组、回合组的外壳用 display:contents 摊平，里面的节点直接作网格项；竖屏 / 横屏各给一套网格。
// 通用：撤退 / 取消钮在结束回合左侧；牌堆写成文字「抽牌 N · 弃牌 N」。
const FOOT_COMMON = `${SP} .igs-combat-foot:not(.is-ended){display:grid;align-items:end;grid-template-areas:none;background:linear-gradient(180deg,transparent,rgba(10,10,11,.5));}
${SP} :is(.igs-combat-dock,.igs-combat-dock-tools,.igs-combat-dock-row){display:contents;}
${SP} .igs-combat-hero{--hero-controls-space:0px;grid-area:auto;gap:8px;align-items:flex-end;}
${SP} .igs-combat-hero-core{gap:0;}
${SP} .igs-combat-hero-figure:has(>.igs-combat-controls){margin-left:0;}
${SP} .igs-combat-dock>.igs-combat-energy{position:static;flex:none;}
${SP} .igs-combat-dock .igs-combat-trait-ring{position:static;display:flex;align-items:center;gap:4px;aspect-ratio:auto;pointer-events:none;}
${SP} .igs-combat-dock .igs-combat-trait-ring>.igs-combat-trait{position:relative;left:auto;right:auto;top:auto;margin:0;translate:none;pointer-events:auto;}
${SP} .igs-combat-dock .igs-combat-controls{position:relative;inset:auto;display:flex;flex-direction:row;align-items:center;gap:4px;aspect-ratio:auto;pointer-events:auto;}
${SP} .igs-combat-dock .igs-combat-controls>*{position:relative;right:auto;top:auto;}
${SP} .igs-combat-dock .igs-combat-controls>.igs-combat-awaken{right:auto;top:auto;}
${SP} .igs-combat-dock .igs-combat-controls:has(>.igs-combat-awaken) .igs-combat-item-menu{bottom:calc(100% + 6px);}
${SP} .igs-combat-dock .igs-combat-ctl{width:44px;height:28px;}
${SP} .igs-combat-turn{display:contents;}
${SP} .igs-combat-turn-btns{display:flex;align-items:center;gap:8px;}
${SP} .igs-combat-turn-btns>:is([data-combat-act="escape"],[data-combat-act="stop"],[data-combat-act="cancel"]){order:-1;}
${SP} .igs-combat-piles{gap:0;font-size:12px;}
${SP} .igs-combat-piles>span+span::before{content:"·";margin:0 6px;}
${SP} .igs-combat-piles b{margin-left:4px;}`;

// 竖屏底栏（自上而下）：第 1 排 道具与人物技能（靠右、在结束回合上方）；第 2 排 能量（手牌起点左侧上方）· 牌堆文字 · 撤退与结束回合（右侧同一排）；
// 第 3 排 手牌；第 4 排 主战者与队友（离底 ≥34px）。排与排间距 14px（第 1、2 排之间 6px）。
const FOOT_PORT = `${SP} .igs-combat-foot:not(.is-ended){grid-template-columns:auto minmax(0,1fr) auto;column-gap:8px;row-gap:6px;padding:4px 12px 34px;}
${SP} .igs-combat-dock-row{display:flex;align-items:center;gap:6px;grid-column:2/4;grid-row:1;justify-self:end;}
${SP} .igs-combat-dock>.igs-combat-energy{grid-column:1;grid-row:2;}
${SP} .igs-combat-piles{grid-column:2;grid-row:2;justify-self:center;}
${SP} .igs-combat-turn-btns{grid-column:3;grid-row:2;justify-self:end;}
${SP} .igs-combat-hand{grid-column:1/-1;grid-row:3;margin-top:8px;}
${SP} .igs-combat-hero{grid-column:1/-1;grid-row:4;margin-top:10px;justify-content:center;flex-wrap:nowrap;}
${SP} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size]{--u-w:min(clamp(48px,7.2cqh,92px),calc((100cqw - 24px - (var(--n,1) - 1) * 8px) / var(--n,1)));}
${SP} .igs-combat-dock .igs-combat-item-menu{left:auto;right:0;}`;

// 横屏底栏（一排）：主战者与队友在左下 · 能量 · 手牌居中靠下 · 道具、技能、牌堆在手牌右侧 · 结束回合在最右。
const FOOT_LAND = `${SP} .igs-combat-foot:not(.is-ended){grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);column-gap:12px;row-gap:0;padding:4px 16px 16px;}
${SP} .igs-combat-hero{grid-column:1;grid-row:1;justify-self:start;}
${SP} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size="lg"]{--u-w:clamp(76px,15cqh,110px);}
${SP} .igs-combat-hero .igs-combat-unit[data-side="ally"][data-size="sm"]{--u-w:clamp(44px,8.5cqh,64px);}
${SP} .igs-combat-dock>.igs-combat-energy{grid-column:1;grid-row:1;justify-self:end;align-self:end;}
${SP} .igs-combat-hand{grid-column:2;grid-row:1;width:clamp(440px,37.5cqw,480px);}
${SP} .igs-combat-dock-tools{display:flex;flex-direction:column;align-items:flex-start;gap:8px;grid-column:3;grid-row:1;justify-self:start;align-self:end;}
${SP} .igs-combat-dock-row{display:flex;align-items:center;gap:6px;}
${SP} .igs-combat-turn-btns{grid-column:3;grid-row:1;justify-self:end;flex-direction:column;align-items:flex-end;gap:8px;}`;

// 手牌：窄签只显示费用、牌名、数值 + 单位；选中的牌放大并显示效果说明、关键字全称（细框文字）与加成明细。放大牌按原槽位居中（首张贴左、末张贴右），相邻牌不位移。
// 窄签可见宽度 --vis = 相邻牌错开后露出的部分，牌名限制在其内；扇形角度与下沉按 .3 比例收小。
const HAND = `${SP} .igs-combat-hand{--igs-card-w:var(--tab-w);height:var(--tab-h);box-sizing:border-box;padding:0 12px;align-items:flex-end;overflow:visible;}
${SP} .igs-combat-hand .igs-combat-card{width:var(--tab-w);height:var(--tab-h);min-height:0;gap:2px;padding:6px;transform:translateY(calc(var(--fan-y,0px) * .12)) rotate(calc(var(--fan-r,0deg) * .2));}
${SP} .igs-combat-hand .igs-combat-card+.igs-combat-card{margin-left:min(-8px,calc((100% - var(--fan-n,1) * var(--tab-w)) / (var(--fan-n,2) - 1)));}
${SP} .igs-combat-hand .igs-combat-card:is(:hover,:focus-visible,.is-hover,.is-chosen){transform:translateY(-6px) rotate(0deg);}
${SP} .igs-combat-hand .igs-combat-card.is-selected{z-index:6;width:var(--sel-w);height:var(--sel-h);margin-right:calc(var(--tab-w) - var(--sel-w));translate:calc((var(--tab-w) - var(--sel-w)) / 2) 0;transform:translateY(calc(var(--sel-lift) * -1)) rotate(0deg);}
${SP} .igs-combat-hand .igs-combat-card.is-selected:first-child{translate:0 0;}
${SP} .igs-combat-hand .igs-combat-card.is-selected:last-child{translate:calc(var(--tab-w) - var(--sel-w)) 0;}
${SP} .igs-combat-card-cost{left:6px;top:6px;width:22px;height:22px;font-size:12px;}
${SP} .igs-combat-card-name{order:1;min-height:0;margin-top:24px;padding-left:0;max-width:calc(var(--vis) - 10px);font-size:12px;line-height:1.3;}
${SP} .igs-combat-card-art,${SP} .igs-combat-card-type{display:none;}
${SP} .igs-combat-card-text{display:none;}
${SP} .igs-combat-card-value{order:2;margin-top:auto;}
${SP} .igs-combat-card-unit{order:3;}
${SP} .igs-combat-card-stack{left:32px;top:10px;}
${SP} .igs-combat-card.is-selected :is(.igs-combat-card-name){max-width:none;margin-top:24px;font-size:13px;}
${SP} .igs-combat-card.is-selected .igs-combat-card-value{margin-top:6px;}
${SP} .igs-combat-card.is-selected .igs-combat-card-text{order:4;display:block;overflow:visible;-webkit-line-clamp:unset;line-clamp:unset;margin-top:4px;font-size:11px;line-height:1.45;}
${SP} .igs-combat-card.is-selected .igs-combat-card-kwfull{order:5;display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}
${SP} .igs-combat-card-kwfull>i{padding:0 6px;border:1px solid var(--igs-cb-ink-faint);font-style:normal;font-size:10px;line-height:16px;color:var(--igs-cb-ink-soft);}
${SP} .igs-combat-card.is-selected .igs-combat-card-bonus{order:6;display:block;margin-top:auto;font-size:10px;line-height:1.4;color:var(--igs-cb-ink-soft);}`;

export const COMBAT_PANEL_LAYOUT_STYLE_TEXT = `
${SLOT_HIDDEN}
@supports (container-type:size){
${RING}
${TRACK}
${FOOT_COMMON}
${SLOT}
${HAND}
@container igs-combat (orientation:portrait){
${VARS_PORT}
${FOOT_PORT}
}
@container igs-combat (orientation:landscape){
${VARS_LAND}
${FOOT_LAND}
}
}
`;

