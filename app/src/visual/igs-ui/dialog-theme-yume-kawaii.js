import { buildDialogFrameCss, scalePx, stroke } from './dialog-skin-frame.js';
import { DIALOG_FONT_CHILL_ROUND, DIALOG_FONT_MAOKEN_ZHUYUAN } from './dialog-theme-typography.js';
import {
    YK_BAR_STAR,
    YK_BOW,
    YK_BOW_HOVER,
    YK_CREST,
    YK_DOTS,
    YK_POLAROIDS,
    YK_STAR_ICE,
    YK_STAR_PINK,
    YK_STAFF,
    YK_STAR_PIN,
    YK_STAR_TILE,
    YK_WAIT_WING,
    YK_WING_L,
    YK_WING_R,
} from './dialog-theme-yume-kawaii-art.js';

// 全皮肤只用两款字体：姓名与卡片标题用猫啃珠圆体，其余（台词、选项、说明、输入、情绪签、状态栏数值）用寒蝉全圆体。
export const YK_FONT_TITLE = DIALOG_FONT_MAOKEN_ZHUYUAN;
export const YK_FONT_BODY = DIALOG_FONT_CHILL_ROUND;

export const DIALOG_SKIN_YUME_KAWAII = 'yume-kawaii';

// 可盐可甜：银灰冰蓝的磨砂玻璃。玻璃里铺极淡的白星纹，右下压一枚左倾的天使谱号徽记；
// 右上角探出两张叠放的拍立得，用星星针别住；姓名是玻璃胶囊，左端斜插一枚星星针，尾部飘出一段五线谱。
// 粉色只点在星星上，其余小字一律灰蓝 / 冰蓝。纯色渐变只用半透明平涂或 135° 左上深右下浅，不用竖向浅→深。
// 设计稿与素材生成脚本：IGS/设计与截图/可盐可甜/v5/。
// 正文墨色：比纯灰更偏蓝、也更浅一档，压在浅色玻璃上仍清楚。
export const YK_INK = '#4e6489';
export const YK_INK_SOFT = '#7f93b2';
export const YK_ICE = '#a9bdd8';
export const YK_ICE_DEEP = '#6f88ad';
export const YK_PINK = '#e9a6c0';
const HALO = 'rgba(238,243,250,.92)';
export const YK_GLASS = 'linear-gradient(135deg,rgba(214,225,241,.78),rgba(236,242,250,.74))';
export const YK_GLASS_HI = 'linear-gradient(135deg,rgba(222,232,246,.9),rgba(250,252,255,.9))';
// 玻璃描边：四边等粗的白线，不再叠顶部高光（叠了会显得上粗下细）。
export const YK_EDGE = 'border:1.5px solid rgba(255,255,255,.95);';
// 物品卡、标题卡、战斗卡等小卡片的底：白星纹铺满 + 冰蓝玻璃，和状态栏同一块料。
export const YK_CARD_BG = `${YK_STAR_TILE} 0 0/28px 28px,${YK_GLASS}`;
const GLASS_BLUR = '-webkit-backdrop-filter:blur(14px) saturate(1.2);backdrop-filter:blur(14px) saturate(1.2);';

// 五角星遮罩（单色，颜色由背景决定）：小卡片的动作标记、窄屏阅读的分隔点。皮肤里的星都是五角星，不用四芒星。
const starPath = (cx, cy, r, inner) => Array.from({ length: 10 }, (_, i) => {
    const rr = i % 2 ? r * inner : r;
    const a = (-90 + i * 36) * Math.PI / 180;
    return `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
}).join(' ') + 'Z';
export const YK_STAR_PATH = starPath(12, 12.8, 11, 0.46);
export const YK_STAR_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${YK_STAR_PATH}' stroke='#000' stroke-width='1.6' stroke-linejoin='round'/></svg>`)}")`;
export { YK_STAR_ICE, YK_STAR_PINK, YK_STAR_TILE, YK_WAIT_WING, YK_WING_R };

const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_YUME_KAWAII}"]`;
const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_YUME_KAWAII}"]`;

export const YUME_KAWAII_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_YUME_KAWAII, {
        height: 196,
        text: { top: 30, speakerTop: 38, right: 44, bottom: 10, left: 44 },
        rise: 19,
        frameCss: `background:${YK_GLASS};${YK_EDGE}border-radius:22px;box-shadow:inset 0 0 0 5px rgba(255,255,255,.18),0 0 18px rgba(255,255,255,.35),0 10px 28px rgba(44,56,82,.28);${GLASS_BLUR}isolation:isolate;`,
        speakerCss: `left:30px;top:-19px;width:max-content;max-width:calc(100% - 200px);height:auto;margin:0;padding:6px 22px 6px 40px;white-space:nowrap;overflow:visible;border:1.5px solid rgba(255,255,255,.95);border-radius:999px;background:${YK_GLASS_HI};box-shadow:0 0 12px rgba(255,255,255,.7),0 4px 10px rgba(44,56,82,.2);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font-size:17px;font-weight:400;line-height:1.4;letter-spacing:.14em;text-shadow:0 1px 0 #fff;`,
        textCss: `letter-spacing:.05em;line-height:1.85;text-shadow:${stroke(HALO)};`,
        // 窄屏几何自带（见文末 @media），不再叠加通用的姓名牌缩放。
        mobilePlate: 1,
    }),
    // ::before 是玻璃里的图案：左上一抹柔光 + 右下左倾徽记 + 一层压淡星纹的雾 + 星纹。
    scalePx(`${scope}::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;background:radial-gradient(ellipse 55% 45% at 18% 0%,rgba(255,255,255,.5),transparent 70%),${YK_CREST} right 6px bottom 6px/170px 128px no-repeat,linear-gradient(rgba(234,240,249,.6),rgba(234,240,249,.6)),${YK_STAR_TILE} 0 0/38px 38px;}`),
    // ::after 是右上角探出框外的两张拍立得。
    scalePx(`${scope}::after{content:"";position:absolute;right:-22px;top:-82px;width:158px;height:136px;pointer-events:none;z-index:3;background:${YK_POLAROIDS} center/contain no-repeat;filter:drop-shadow(0 4px 6px rgba(44,56,82,.16));}`),
    `${scope} > *{position:relative;z-index:1;}`,
    // 姓名牌不建自己的层叠上下文（z-index:auto），它的五线谱 ::after 才能落到框的层叠上下文里、压在姓名牌和拍立得下面。
    `${scope} .igs-speaker{position:absolute;z-index:auto;}`,
    // 姓名牌：左端斜插星星针，尾部接一段五线谱（z-index:-1：在姓名牌、拍立得、正文之下，框的玻璃底之上）。
    scalePx(`${scope} .igs-speaker::before{content:"";position:absolute;left:2px;top:-14px;width:38px;height:60px;pointer-events:none;background:${YK_STAR_PIN} center/contain no-repeat;filter:drop-shadow(0 1px 1.5px rgba(60,80,110,.3));}`),
    scalePx(`${scope} .igs-speaker::after{content:"";position:absolute;z-index:-1;left:calc(100% + 2px);top:-44px;width:320px;height:87px;pointer-events:none;background:${YK_STAFF} center/contain no-repeat;transform:rotate(2deg);}`),
    // 框内工具条与输入框：位置不动，只换灰蓝；发送键与输入框同一套半透明白。
    `${scope} #igs-dialog-bar .igs-icon-btn{color:${YK_ICE_DEEP};opacity:.85;}`,
    `${scope} #igs-dialog-bar .igs-icon-btn:hover{color:${YK_ICE_DEEP};background:rgba(255,255,255,.55);}`,
    `${scope} .igs-input,${scope} .igs-send-btn{font-family:${YK_FONT_BODY};background:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.8);box-shadow:none;text-shadow:none;}`,
    `${scope} .igs-input{color:${YK_INK};}`,
    `${scope} .igs-input::placeholder{color:${YK_INK_SOFT};}`,
    `${scope} .igs-send-btn{color:${YK_ICE_DEEP};font-weight:700;}`,
    `${scope} .igs-send-btn:hover{background:rgba(255,255,255,.72);}`,
    // 窄屏：圆角收小，徽记和拍立得缩小，五线谱缩短。
    `@media (max-width:640px){${scalePx([
        `${scope}{border-radius:18px;height:176px;min-height:176px;max-height:176px;}`,
        `${scope},${scope}[data-igs-has-speaker="1"]{padding-left:22px;padding-right:22px;}`,
        `${scope}{padding-top:28px;}${scope}[data-igs-has-speaker="1"]{padding-top:32px;}`,
        `${scope}::before{background-size:auto,120px 90px,auto,32px 32px;background-position:0 0,right 4px bottom 34px,0 0,0 0;}`,
        `${scope}::after{right:-8px;top:-62px;width:108px;height:93px;}`,
        `${scope} .igs-speaker{left:14px;top:-17px;max-width:calc(100% - 110px);padding:5px 16px 5px 32px;font-size:15px;}`,
        `${scope} .igs-speaker::before{left:1px;top:-12px;width:31px;height:49px;}`,
        `${scope} .igs-speaker::after{top:-28px;width:160px;height:44px;}`,
    ].join(''))}}`,
].join('\n');

// 句末等待：一只小翅膀，上下轻点并扇一下。形状不走单色遮罩（翅膀是白底灰蓝边的双色图）。
// 「跟随皮肤」与选择器里手动选「天使翅膀」都画这只双色翅膀；别的皮肤选「天使翅膀」时走通用单色遮罩。
const waitOn = `${overlayScope}[data-igs-click-wait="on"]:is(:not([data-igs-click-wait-glyph]),[data-igs-click-wait-glyph="angel-wing"])`;
export const YUME_KAWAII_CLICK_WAIT_STYLE = [
    `${waitOn} #igs-text::after{width:1.15em;height:1.15em;margin-left:.15em;vertical-align:-.18em;background:${YK_WAIT_WING} center/contain no-repeat;-webkit-mask:none;mask:none;filter:drop-shadow(0 0 2px rgba(255,255,255,.9));transform-origin:15% 70%;animation:igs-yk-flap 1.6s ease-in-out infinite,igs-cw-in .35s ease-out backwards;}`,
    // 打字机播放中照通用规则隐藏（本条选择器更具体，需要单独写一遍）。
    `${waitOn} #igs-text[data-igs-typewriter="running"]::after{opacity:0;animation:none;}`,
    '@keyframes igs-yk-flap{0%,100%{transform:translateY(0) rotate(0);}35%{transform:translateY(-3px) rotate(-14deg);}60%{transform:translateY(-1px) rotate(4deg);}}',
    `@media (prefers-reduced-motion: reduce){${overlayScope}[data-igs-click-wait="on"] #igs-text::after{animation:none !important;}}`,
].join('\n');

// 选项：玻璃胶囊，左侧冰蓝五角星、右侧线稿蝴蝶结；悬停时两端各探出一只完整的小翅膀。
// 选项浮窗是可滚动容器（overflow-y:auto 会连带裁掉横向溢出），贴边时两侧翅膀会被切掉。
// 这里给容器左右各加一条翅膀宽的内边距，再按定位方式把容器往外扩同样的宽度，气泡的位置与宽度保持不变：
// 跟随对话框宽度时容器居中，宽度两边各加一格；随文本宽度时按贴左 / 贴右把锚点外移一格，居中模式同样加宽。
const choiceScope = `${overlayScope} .igs-option-bubble`;
const WING_ROOM = 14;
const layer = `${overlayScope} #igs-option-bubbles`;
// 选项列吊在对话框上方，基础规则只限 max-height:60%，没扣掉底部偏移：本皮肤框高 196px 又有拍立得探出，
// 选项多或字多时列顶被推出阅读器顶边（网页全屏最明显）。照水墨武侠的做法，可用高度改为
// 「容器高 − 顶部留白 − 底部偏移」，仍不超过 60%；放不下时在列内滚动。顶栏工具栏、内嵌模式自带 top 限位，不在此列。
// 两条底部偏移与 original-reader-source.js 的默认 / 悬浮 bottom 规则逐项对应，改那边时这里同步。
const OPT_FREE = `${overlayScope}:not(.igs-toolbar-top):not(.igs-mode-embedded)`;
const OPT_TOP = 'max(16px, env(safe-area-inset-top, 0px) + 8px)';
export const YUME_KAWAII_CHOICE_STYLE = [
    `${layer}{box-sizing:border-box;padding-left:${WING_ROOM}px;padding-right:${WING_ROOM}px;}`,
    // 本皮肤姓名牌高出框顶 19px，选项列另有 margin-bottom:var(--igs-skin-plate-rise) 往上让位，这段也要扣掉，否则列顶仍贴边。
    `${OPT_FREE} #igs-option-bubbles[data-igs-pos]{max-height:min(60%,calc(100% - ${OPT_TOP} - var(--igs-skin-plate-rise,0px) - (24px + var(--igs-dialog-h,220px) + var(--igs-toolbar-h,50px) + 12px)));overscroll-behavior:contain;}`,
    `${OPT_FREE}.igs-floating #igs-option-bubbles[data-igs-pos]{max-height:min(60%,calc(100% - ${OPT_TOP} - var(--igs-skin-plate-rise,0px) - (14px + var(--igs-dialog-h,220px) + var(--igs-toolbar-h,50px) + 10px)));}`,
    `${layer}[data-igs-width="dialog"]{width:calc(var(--igs-dialog-w,min(70%,420px)) + ${WING_ROOM * 2}px);max-width:calc(100vw - 24px + ${WING_ROOM * 2}px);}`,
    `${layer}[data-igs-width="text"]{max-width:calc(min(70%,420px) + ${WING_ROOM * 2}px);}`,
    `${layer}[data-igs-width="text"][data-igs-pos="top-left"]{left:${16 - WING_ROOM}px;}`,
    `${layer}[data-igs-width="text"][data-igs-pos="top-right"]{right:${16 - WING_ROOM}px;}`,
    // 列高受限后改为列内滚动；胶囊不跟着被压扁（flex 默认会把每项压到 min-height，两行字溢出胶囊）。
    `${choiceScope}{flex-shrink:0;box-sizing:border-box;min-height:44px;padding:10px 50px 10px 46px;${YK_EDGE}border-radius:999px;background:${YK_BOW} right 16px center/24px 18px no-repeat,${YK_STAR_ICE} left 18px center/13px 13px no-repeat,${YK_GLASS};-webkit-backdrop-filter:blur(10px) saturate(1.15);backdrop-filter:blur(10px) saturate(1.15);box-shadow:0 0 10px rgba(255,255,255,.4),0 5px 14px rgba(44,56,82,.22);font-family:${YK_FONT_BODY};color:${YK_INK};letter-spacing:.07em;text-shadow:0 1px 0 rgba(255,255,255,.8);overflow:visible;}`,
    `${choiceScope}::before,${choiceScope}::after{content:"";position:absolute;top:50%;width:30px;height:29px;margin-top:-22px;opacity:0;pointer-events:none;z-index:-1;transition:opacity .18s,transform .3s cubic-bezier(.3,1.6,.5,1);}`,
    `${choiceScope}::before{left:-${WING_ROOM}px;background:${YK_WING_L} center/contain no-repeat;transform:translateX(12px) rotate(10deg) scale(.6);transform-origin:90% 75%;}`,
    `${choiceScope}::after{right:-${WING_ROOM}px;background:${YK_WING_R} center/contain no-repeat;transform:translateX(-12px) rotate(-10deg) scale(.6);transform-origin:10% 75%;}`,
    `${choiceScope}:hover{z-index:2;transform:translateY(-2px);color:${YK_ICE_DEEP};background:${YK_BOW_HOVER} right 16px center/24px 18px no-repeat,${YK_STAR_PINK} left 17px center/15px 15px no-repeat,${YK_GLASS_HI};border-color:#fff;box-shadow:0 0 0 3px rgba(169,189,216,.35),0 0 16px rgba(255,255,255,.75),0 8px 18px rgba(44,56,82,.26);}`,
    `${choiceScope}:hover::before,${choiceScope}:hover::after{opacity:1;transform:none;}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
    `@media (max-width:640px){${choiceScope}{min-height:40px;padding:9px 32px 9px 30px;background-size:18px 13px,11px 11px,auto;background-position:right 10px center,left 12px center,0 0;}${choiceScope}::before,${choiceScope}::after{width:24px;height:23px;margin-top:-18px;}${choiceScope}::before{left:-10px;}${choiceScope}::after{right:-10px;}}`,
    `@media (prefers-reduced-motion: reduce){${choiceScope}::before,${choiceScope}::after{transition:none;}}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const panel = `background:${YK_STAR_TILE} 0 0/${s(28)} ${s(28)},${YK_GLASS};${YK_EDGE}border-radius:${s(14)};-webkit-backdrop-filter:blur(12px) saturate(1.15);backdrop-filter:blur(12px) saturate(1.15);box-shadow:0 ${s(6)} ${s(16)} rgba(44,56,82,.22);`;

// 状态栏零件：玻璃小卡、白玻璃情绪胶囊（前面一颗粉五角星）、头像白边（不加角标）；
// 数值条是半透明白轨，填充 = 白波点 + 本条颜色左深右浅，末端一颗小白星站在条上。
// 字体：整块状态栏都用寒蝉全圆体（情绪签、数值、标签）。
export const YUME_KAWAII_HUD_THEME = Object.freeze({
    neutral: '#a9b8cc',
    // 条色板换成灰蓝系，只有「喜欢」与第 4 档留一点粉。
    vars: '--igs-hud-bar-trust:#86a9d6;--igs-hud-bar-like:#e3a3bd;--igs-hud-bar-cold:#8b98d8;--igs-hud-bar-know:#c9c38e;--igs-hud-bar-grudge:#7d9a9a;--igs-hud-bar-desire:#d6929f;--igs-hud-bar-1:#8fb1dd;--igs-hud-bar-2:#9ec6c4;--igs-hud-bar-3:#b6a9dc;--igs-hud-bar-4:#e3a3bd;--igs-hud-bar-5:#a7b8cf;--igs-hud-bar-6:#c4b39a;',
    panel,
    toast: `background:${YK_STAR_TILE} 0 0/${s(28)} ${s(28)},${YK_GLASS_HI};${YK_EDGE}border-radius:${s(14)};box-shadow:0 ${s(6)} ${s(16)} rgba(44,56,82,.22);font-family:${YK_FONT_BODY};color:${YK_INK};text-shadow:none;`,
    ink: YK_INK_SOFT,
    emotion: `position:relative;padding:${s(1)} ${s(10)} ${s(1)} ${s(19)};border:1px solid rgba(255,255,255,.95);border-radius:999px;background:${YK_GLASS_HI};box-shadow:0 ${s(2)} ${s(5)} rgba(44,56,82,.16);font-family:${YK_FONT_BODY};color:${YK_ICE_DEEP};font-weight:400;letter-spacing:.08em;text-shadow:none;`,
    emotionBefore: `content:"";position:absolute;left:${s(6)};top:50%;width:${s(9)};height:${s(9)};margin-top:${s(-4.5)};background:${YK_STAR_PINK} center/contain no-repeat;`,
    avatar: `filter:${ring('#fff', 1.5)} drop-shadow(0 0 1px ${YK_ICE});`,
    placeholder: `background:linear-gradient(135deg,#d9e3f0,#f2f6fb);color:${YK_INK_SOFT};`,
    placeholderSvg: `fill:${YK_INK_SOFT};stroke:${YK_INK_SOFT};`,
    track: `height:${s(7)};border:0;border-radius:999px;overflow:visible;background:rgba(255,255,255,.6);box-shadow:inset 0 0 0 1px rgba(143,165,198,.55);`,
    fill: `border-radius:999px;background:${YK_DOTS} 0 0/${s(6)} ${s(6)},linear-gradient(90deg,var(--igs-hud-fill-color),color-mix(in srgb,var(--igs-hud-fill-color) 55%,#fff)) !important;`,
    value: `font-family:${YK_FONT_BODY};color:${YK_ICE_DEEP};font-weight:400;`,
});

// 数值条末端的小白星「站」在条上：星图 12 格，两只脚尖（含描边）在图内 10.65 格处，
// 星图底边比填充底边低 1.35 格，脚尖正好落在条的最底边。
// HUD_THEMES 的零件表没有 fill 伪元素的位置，这两条随对话框样式一起注入（只在本皮肤生效）。
export const YUME_KAWAII_HUD_EXTRA_STYLE = [
    `${overlayScope} #igs-status-hud .igs-hud-fill::after{content:"";position:absolute;right:${s(-6)};top:auto;bottom:${s(-1.35)};width:${s(12)};height:${s(12)};margin:0;pointer-events:none;background:${YK_BAR_STAR} center/contain no-repeat;}`,
    `${overlayScope} #igs-status-hud .igs-hud-entry-arrow,${overlayScope} #igs-status-hud .igs-hud-entry-item{color:${YK_INK_SOFT};}`,
    // 状态栏整体用寒蝉全圆体（情绪签、数值、标签、地点、BGM 等）。
    `${overlayScope} #igs-status-hud{font-family:${YK_FONT_BODY};}`,
].join('\n');

// 物品卡、物品大演出、随身系统面板、结果卡、关键事件卡、提示弹窗：卡片标题用珠圆体，其余文字用寒蝉全圆体。
// 这些组件各自带默认字体（多为系统黑体），不随对话框正文，这里统一覆盖，只在本皮肤生效。
const CARD_BODY = [
    '.igs-fx-item-card', '.igs-fx-item-showcase-plate', '.igs-bt-panel-wrap .igs-panel', '.igs-bt-count .igs-bt-count-card',
    '.igs-pl-q .igs-pl-q-paper', '.igs-fx-result', '.igs-fx-keyevent', '#igs-toast', '.igs-or-win',
].map((sel) => `${overlayScope} ${sel}`).join(',');
const CARD_TITLE = [
    '.igs-fx-item-name', '.igs-fx-item-showcase-plate .igs-fx-item-name', '.igs-bt-panel .igs-panel-title', '.igs-pl-q .igs-pl-q-head',
    '.igs-fx-result .igs-fx-result-verdict', '.igs-fx-keyevent .igs-fx-keyevent-title',
].map((sel) => `${overlayScope} ${sel}`).join(',');
// 纵向阅读模式（只在本皮肤生效）：
// - 旁白段首是一颗五角星（用户在设置里另选了形状时照用户的），按字身中线对齐：
//   中文字身中心约在基线上 .38em，星框高 .82em，下沿落在基线上 .38em − .41em ≈ −.03em。
// - User 靠右时，台词左侧只留一小段缩进，不再空出整整一个头像位。
const LOG = `#igs-overlay[data-igs-log-skin="${DIALOG_SKIN_YUME_KAWAII}"] #igs-log`;
export const YUME_KAWAII_LOG_READER_STYLE = [
    `#igs-overlay[data-igs-log-skin="${DIALOG_SKIN_YUME_KAWAII}"]:not([data-igs-click-wait-glyph]) #igs-log .igs-log-row.is-narr .igs-log-text::before{width:.82em;height:.82em;margin-right:.5em;vertical-align:-.03em;-webkit-mask:${YK_STAR_MASK} center/contain no-repeat;mask:${YK_STAR_MASK} center/contain no-repeat;}`,
    `${LOG}[data-user-side="right"] .igs-log-row.is-user .igs-log-body{padding-left:24px;}`,
].join('\n');

export const YUME_KAWAII_FONT_STYLE = [
    `${CARD_BODY}{font-family:${YK_FONT_BODY};}`,
    `${CARD_TITLE}{font-family:${YK_FONT_TITLE};font-weight:400;}`,
].join('\n');
