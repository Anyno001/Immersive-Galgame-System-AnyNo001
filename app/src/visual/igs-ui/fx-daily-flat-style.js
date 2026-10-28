// 日常演出「去卡通」覆盖层：放在样式表最末，只压低饱和、去粗描边与拟物填色，改成实色细线 + 深色底板。
// 原则：不压人物躯干与脸（主体挪到画面右侧 / 左侧空处）；一个焦点；童话、绘本类题材不在此列。
const L = '#f4f1ea';
const BG = 'rgba(18,20,26,.84)';
const Z = '#igs-overlay .igs-dfx';

export const FLAT_FX_STYLE_TEXT = `
/* 通用标签：深色底板 + 细线，取代奶油色胶囊 */
${Z}-sing-label,${Z}-dance-label,${Z}-fish-catch,${Z}-draw-label,${Z}-music-label,${Z}-ride-label,${Z}-shopping-label{border:1px solid rgba(244,241,234,.5);background:${BG};color:${L};box-shadow:none;font-weight:500;}

/* 猜拳：挪到人物右侧，不压躯干 */
${Z}-rps{align-items:flex-start;justify-content:flex-start;padding:24% 0 0 66%;box-sizing:border-box;}

/* 扭蛋：细线圆环代替粉色半圆胶囊，结果落在人物右侧 */
${Z}.igs-dfx-gacha{align-items:flex-start;justify-content:flex-start;padding:22% 0 0 68%;box-sizing:border-box;gap:10px;}
${Z}-gacha-capsule{width:44px;height:44px;}
${Z}-gacha-top,${Z}-gacha-bottom{border:1px solid ${L};background:transparent;}
${Z}-gacha-top{border-radius:22px 22px 0 0;}
${Z}-gacha-bottom{border-radius:0 0 22px 22px;}
${Z}-gacha-item{padding:5px 14px;border:1px solid rgba(244,241,234,.5);border-radius:2px;background:${BG};font-weight:500;letter-spacing:.08em;}

/* 抽签（现代）：细线签筒 + 深色签纸，挪到右侧 */
${Z}-omikuji:not(.is-ancient){justify-content:flex-end;padding-right:12%;gap:4%;}
${Z}-omikuji:not(.is-ancient) .igs-dfx-kuji-box{border:1px solid ${L};background:transparent;box-shadow:none;}
${Z}-omikuji:not(.is-ancient) .igs-dfx-kuji-box span{color:${L};}
${Z}-omikuji:not(.is-ancient) .igs-dfx-kuji-stick{background:${L};width:2px;margin-left:-1px;}
${Z}-omikuji:not(.is-ancient) .igs-dfx-slip{background:${BG};border:1px solid rgba(244,241,234,.55);box-shadow:none;color:${L};}
${Z}-omikuji:not(.is-ancient).is-great .igs-dfx-slip{background:${BG};border-color:#e6c97a;box-shadow:none;}
${Z}-omikuji:not(.is-ancient) .igs-dfx-slip-result{color:#e6c97a;text-shadow:none;font-weight:500;}
${Z}-omikuji:not(.is-ancient).is-bad .igs-dfx-slip-result{color:#a9b6c9;}

/* 便签（现代）：深色细线卡，去掉黄纸与胶带 */
${Z}-note:not(.is-fantasy):not(.is-scifi):not(.is-apocalypse):not(.is-taisho):not(.is-horror):not(.is-magic) .igs-dfx-sticky{background:${BG};color:${L};border:1px solid rgba(244,241,234,.5);box-shadow:none;}
${Z}-note:not(.is-fantasy):not(.is-scifi):not(.is-apocalypse):not(.is-taisho):not(.is-horror):not(.is-magic) .igs-dfx-tape{display:none;}

/* 撸猫：剪影压暗并勾一道细边，爪印改细线、只留三枚且止于人物之前 */

/* 购物：细线袋身，挪到右侧 */
${Z}-shopping-bags,${Z}-shopping-sparks{left:74%;}
${Z}-shopping-bag{background:transparent!important;border:1px solid ${L};border-radius:2px;}
${Z}-shopping-bag::before{border:1px solid ${L};}
${Z}-shopping-bag::after{height:1px;background:${L};opacity:.7;}
${Z}-shopping-sparks i{color:${L};text-shadow:none;}
${Z}-shopping-sparks i:nth-child(2){color:${L};text-shadow:none;}

/* 画画：深色细框画布，轮廓线风景，挪到右上 */
${Z}-draw-canvas{left:74%;border:1px solid rgba(244,241,234,.6);background:${BG};box-shadow:none;border-radius:2px;}
${Z}-draw-stroke{background:transparent!important;border:1px solid ${L};opacity:.85;}
${Z}-draw-pencil{background:${L};}
${Z}-draw-pencil::before{background:${L};}
${Z}-draw-pencil::after{background:#171a22;}

/* 抢手柄：单色线描手柄，提示字去粗框，挪到右侧 */
${Z}-snatch-stage{left:74%;}
${Z}-snatch-svg path:first-child{fill:transparent;stroke:${L};stroke-width:1.5;}
${Z}-snatch-svg path:nth-child(2){stroke:${L};stroke-width:2;}
${Z}-snatch-svg circle{fill:transparent;stroke:${L};stroke-width:1.5;}
${Z}-snatch-lines i{height:1px;}
${Z}-snatch-act{color:${L};background:${BG};border:1px solid rgba(244,241,234,.55);border-radius:2px;font-weight:500;font-size:clamp(15px,2.6vw,20px);letter-spacing:.14em;}

/* 摩天轮：单色细线轮；挪到人物远侧（画面右上角三分之一处），不压人物 */
${Z}-ride-wheel{left:78%;top:16%;border-width:1px;border-color:${L};--igs-rd-r:clamp(48px,11vmin,84px);}
${Z}-ride-wheel::after{background:rgba(244,241,234,.18);}
${Z}-ride-hub{background:transparent;border:1px solid ${L};}
${Z}-ride-cabins i::before,${Z}-ride-cabins i:nth-child(3n+2)::before,${Z}-ride-cabins i:nth-child(3n)::before{background:transparent;border:1px solid ${L};}

/* 唱歌：话筒与声波挪到人物头侧远处（right 25%），不压躯干 */
${Z}-sing-notes{left:auto;right:4%;bottom:52%;}
${Z}-sing-waves{left:auto;right:8%;bottom:52%;}
${Z}-sing-waves i{border:1px solid rgba(244,241,234,.6);}
${Z}-sing-notes::before{border:1px solid ${L};background:transparent;}
${Z}-sing-notes::after{background:${L};width:1px;}
${Z}-sing-notes i,${Z}-sing-notes i:nth-child(2),${Z}-sing-notes i:nth-child(3),${Z}-sing-notes i:nth-child(4){color:${L};text-shadow:none;font-weight:400;}

/* 演奏：深色细线谱面，单色音符，挪到右上 */
${Z}-music-staff,${Z}-music-notes{left:74%;width:min(40%,380px);}
${Z}-music-staff{background:${BG};border:1px solid rgba(244,241,234,.5);border-radius:2px;box-shadow:none;}
${Z}-music-staff i{background:rgba(244,241,234,.55);box-shadow:none;}
${Z}-music-notes i,${Z}-music-notes i:nth-child(3n+2),${Z}-music-notes i:nth-child(3n){color:${L};text-shadow:none;}
`;
