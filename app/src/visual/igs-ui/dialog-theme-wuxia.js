import { buildDialogFrameCss } from './dialog-skin-frame.js';
import { WX_BAR, WX_LEAD, WX_RUBBING, WX_SEAL_MASK, WX_SEAL_MASK_WIDE, maskOf, wxEdge } from './wuxia-ink-svg.js';

export const DIALOG_SKIN_WUXIA_INK = 'wuxia-ink';

// 水墨武侠：夜墨拓本。几何、渐变节点、纹理与笔形一律取 plan/wuxia-ink-ui/v6 定稿原值（笔形与滤镜见 wuxia-ink-svg.js）。
// 对话框不画框：自下而上一层墨纱，纱内极淡的拓本石纹；姓名尾端拖出一道月白干笔。朱砂只落在演出的印章上。
const INK_RGB = '12,11,10';
const MOON_RGB = '236,231,221';
const MOON = '#ece7dd';
const JIAO = '#1c1b19';
const SONG = '"LXGW Neo ZhiSong","Source Han Serif CN",serif';
// 随场景时段：深夜纱底再沉一档，晨、昏只给墨加极轻的冷暖调，文字颜色不变。
const INK_BY_TIME = Object.freeze({ dawn: '12,12,14', dusk: '15,12,9', night: '8,8,9', midnight: '4,4,5' });
const ink = (a) => `rgba(var(--wx-ink,${INK_RGB}),${a})`;
const moon = (a) => `rgba(${MOON_RGB},${a})`;
export const wuxiaInk = ink;
export const WUXIA_MOON = MOON;
export const WUXIA_JIAO = JIAO;
export const WUXIA_BRUSH = WX_LEAD;
export const WUXIA_RUBBING_LAYER = `${WX_RUBBING} 0 0/1024px 512px repeat`;
const overlay = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_WUXIA_INK}"]`;
const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_WUXIA_INK}"]`;
// v6 .dlg::before：墨纱高出框顶 120px，节点 0 → .38@90px → .74@150px → .88@210px → .93。
const VEIL = `linear-gradient(180deg,${ink(0)} 0,${ink('.38')} 90px,${ink('.74')} 150px,${ink('.88')} 210px,${ink('.93')})`;

export const WUXIA_DIALOG_STYLE = [
    ...Object.entries(INK_BY_TIME).map(([time, rgb]) => `${overlay}[data-igs-scene-time="${time}"]{--wx-ink:${rgb};}`),
    buildDialogFrameCss(DIALOG_SKIN_WUXIA_INK, {
        height: 196,
        text: { top: 58, speakerTop: 84, right: 72, bottom: 24, left: 72 },
        rise: 0,
        flush: true, mobilePlate: 1,
        frameCss: 'background:transparent;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;',
        speakerCss: 'left:72px;top:30px;width:max-content;max-width:calc(100% - 144px);height:34px;line-height:34px;margin:0;padding:0;white-space:nowrap;overflow:visible;background:none;border:0;font-size:26px;font-weight:400;letter-spacing:.14em;color:#f3eee4;text-shadow:0 1px 2px rgba(0,0,0,.6);',
        textCss: 'position:relative;z-index:1;line-height:1.85;letter-spacing:.06em;text-shadow:0 1px 2px rgba(0,0,0,.55);',
    }),
    `${scope}::before{content:"";position:absolute;z-index:0;pointer-events:none;left:0;right:0;top:-120px;bottom:0;background:${VEIL};}`,
    // 石纹：v6 --rubbing 原样平铺 1024×512，不做皮肤缩放换算；只在纱的浓处出现。
    `${scope}::after{content:"";position:absolute;z-index:0;pointer-events:none;left:0;right:0;top:-40px;bottom:0;opacity:.8;background:${WX_RUBBING} 0 0/1024px 512px repeat;-webkit-mask:linear-gradient(180deg,transparent,#000 120px);mask:linear-gradient(180deg,transparent,#000 120px);}`,
    // 引笔：v6 lead 干笔（dryh 飞白 + 前四成实墨），月白 .5，距姓名尾端 14px。
    // 粗细、竖直位置与长度都以姓名文字为基准（em + 姓名框中线），字号或行高怎么变，引笔与字的比例都不变。
    `${scope} .igs-speaker::after{content:"";position:absolute;left:calc(100% + 14px);top:calc(50% - .075em);width:min(15.4em,44vw);height:.35em;pointer-events:none;background:${moon('.5')};${maskOf(WX_LEAD)}}`,
    // 手机竖屏（策划书 §1.5）：两侧 28，姓名 23px，引笔约 6.5 字宽（23px 时 150px）；粗细与位置沿用上面的 em 规则。
    `@media (max-width:640px){${scope},${scope}[data-igs-has-speaker="1"]{padding-left:28px;padding-right:28px;}${scope} .igs-speaker{left:28px;max-width:calc(100% - 56px);font-size:23px;}${scope} .igs-speaker::after{width:min(6.5em,40vw);}}`,
].join('\n');

// 选项（v6 .opt）：墨拓签条叠石纹，起首一道月白短竖笔；悬停翻作月白纸、焦墨字。字号仍由选项设置控制。
const choice = `${overlay} .igs-option-bubble`;
const tick = (head, tail) => `linear-gradient(180deg,${head} 0,${head} 50%,${tail} 80%,transparent)`;
// 默认 / 悬浮布局下的选项列（顶栏工具栏、内嵌模式已自带 top 限位，不在此列）。
const OPT_FREE = `${overlay}:not(.igs-toolbar-top):not(.igs-mode-embedded)`;
// 选项列顶端离屏幕上缘至少留 16px，刘海屏再让出安全区。
const OPT_TOP = 'max(16px, env(safe-area-inset-top, 0px) + 8px)';

export const WUXIA_CHOICE_STYLE = [
    `${choice}{position:relative;box-sizing:border-box;min-width:min(420px,86%);padding:12px 56px 13px 66px;border:0;border-radius:0;background:${WUXIA_RUBBING_LAYER},${ink('.9')};box-shadow:none;color:${MOON};font-family:${SONG};font-weight:400;letter-spacing:.14em;text-shadow:none;transition:background .18s,color .18s;}`,
    `${choice}::before{content:"";position:absolute;left:34px;top:50%;width:5px;height:22px;transform:translateY(-50%) skewY(-8deg);border-radius:3px 2px 1px 1px;pointer-events:none;background:${tick(`rgb(${MOON_RGB})`, moon('.4'))};}`,
    `${choice}:hover{background:rgb(${MOON_RGB});color:${JIAO};}`,
    `${choice}:hover::before{background:${tick(JIAO, 'rgba(28,27,25,.4)')};}`,
    `${choice}:active{transform:translateY(1px);}`,
    // 选项列吊在对话框上方，基础规则只限 max-height:60%，没扣掉底部偏移：有姓名、正文多行时对话框变高，列顶被推出屏幕。
    // 可用高度改为「容器高 − 顶部留白 − 底部偏移」，仍不超过原 60%；放不下时在列内滚动，首项始终在屏内。
    // 两条底部偏移与 original-reader-source.js 的默认 / 悬浮 bottom 规则逐项对应，改那边时这里同步。
    `${OPT_FREE} #igs-option-bubbles[data-igs-pos]{max-height:min(60%,calc(100% - ${OPT_TOP} - (24px + var(--igs-dialog-h,220px) + var(--igs-toolbar-h,50px) + 12px)));overscroll-behavior:contain;}`,
    `${OPT_FREE}.igs-floating #igs-option-bubbles[data-igs-pos]{max-height:min(60%,calc(100% - ${OPT_TOP} - (14px + var(--igs-dialog-h,220px) + var(--igs-toolbar-h,50px) + 10px)));}`,
    // 手机竖屏：收窄签条留白与字距，少换行、压低整列高度；起首竖笔随左内距内移。
    `@media (max-width:640px){${choice}{min-width:0;width:calc(100% - 40px);padding:8px 24px 9px 44px;letter-spacing:.06em;}${choice}::before{left:22px;}}`,
].join('\n');

// 状态栏（v6 .hud）：墨底 .8 叠石纹，左缘一道上实下枯的月白干笔；头像外留 2px 再一线月白 .5（形状随用户设置）；进度条是干笔。
const s = (v) => `calc(${v}px * var(--igs-hud-scale,1))`;
// 干笔离面板左缘留 8px，不贴边。
const EDGE = `${wxEdge('rgba(236,231,221,.8)')} ${s(8)} ${s(8)}/${s(6)} calc(100% - ${s(16)}) no-repeat`;

export const WUXIA_HUD_THEME = Object.freeze({
    neutral: moon('.5'),
    // 干笔右移 8px 后左内距同步加 8（20→28），干笔与头像、数值行的间距不变。
    panel: `padding:${s(12)} ${s(16)} ${s(14)} ${s(28)};background:${EDGE},${WUXIA_RUBBING_LAYER},${ink('.8')};border:0;border-radius:0;box-shadow:none;`,
    toast: `padding-left:${s(28)};background:radial-gradient(circle,rgb(${MOON_RGB}) 0 2.5px,transparent 3px) ${s(9)} 50%/6px 6px no-repeat,${WUXIA_RUBBING_LAYER},${ink('.86')};border:0;border-radius:0;box-shadow:none;color:${MOON};font-family:${SONG};letter-spacing:.12em;text-shadow:none;`,
    ink: '#c7c1b6',
    // 情绪词钤作朱砂小印：毛边印泥、纸色楷书，字多时横向撑开。
    emotion: `padding:${s(2)} ${s(8)} ${s(1)};border:0;border-radius:0;background:#a8382a;color:#f5ece0;font-family:"IGS-MaShanZheng","LXGW WenKai",serif;font-weight:400;letter-spacing:.16em;text-shadow:none;transform:rotate(-2deg);${maskOf(WX_SEAL_MASK_WIDE)}`,
    // 头像外留 2px 再一线月白 .5（v6 .ava）；圆形 / 方形 / 圆角沿用用户在状态栏设置里的选择，这里不改形状。
    avatar: `outline:1px solid ${moon('.5')};outline-offset:2px;filter:none;`,
    placeholder: 'background:linear-gradient(160deg,#5b5852,#2e2c29);color:rgba(236,231,221,.72);',
    placeholderSvg: `fill:none;stroke:${moon('.6')};stroke-width:1.2;`,
    track: `height:${s(9)};border:0;border-radius:0;background:${moon('.16')};${maskOf(WX_BAR)}`,
    fill: `background:rgb(${MOON_RGB}) !important;border-radius:0;${maskOf(WX_BAR)}`,
    value: 'font-weight:400;',
});


// 物品卡（v6 .item 拓片小品）：选了水墨武侠时物品演出一律按古代分支建节点（带单字印），这里再压过宣纸卷轴。
// :not(#igs-wx-x) 抬一级特异度，高于古代宣纸规则的 :not(#igs-era-x)。
const IO = `${overlay}:not(#igs-wx-x)`;
const SEAL = `display:flex;align-items:center;justify-content:center;border-radius:0;box-shadow:none;transform:none;opacity:1;background:#a8382a;color:#f5ece0;font-family:"IGS-MaShanZheng","LXGW WenKai",serif;font-weight:400;line-height:1;writing-mode:horizontal-tb;${maskOf(WX_SEAL_MASK)}`;
const RUB = `${WUXIA_RUBBING_LAYER},rgba(12,11,10,.92)`;

export const WUXIA_ITEM_STYLE = [
    // 拓片从右上角出，不居中挡住立绘。
    `${IO} .igs-fx-item-showcase{--igs-item-accent-c:#a8382a;box-sizing:border-box;align-items:flex-start;justify-content:flex-end;padding:clamp(56px,12%,96px) clamp(12px,4%,36px) 0 0;background:radial-gradient(ellipse closest-side at 50% 46%,rgba(28,27,25,0) 62%,rgba(28,27,25,.42) 86%,rgba(28,27,25,.72) 100%);}`,
    `${IO} .igs-fx-item-showcase .igs-fx-item-showcase-plate{animation:igs-wx-item-in .5s cubic-bezier(.3,.7,.3,1) .06s both;}`,
    '@keyframes igs-wx-item-in{from{opacity:0;transform:translate(28px,-20px)}to{opacity:1;transform:none}}',
    `${IO} .igs-fx-item-showcase :is(.igs-fx-item-showcase-rays,.igs-fx-item-showcase-burst,.igs-fx-item-showcase-icon){display:none;}`,
    `${IO} .igs-fx-item-showcase .igs-fx-item-showcase-plate{display:block;writing-mode:vertical-rl;box-sizing:border-box;height:300px;max-height:72%;width:auto;min-width:0;max-width:none;margin:0;padding:30px 24px;border:1px solid rgba(${MOON_RGB},.1);border-radius:0;outline:none;background:${RUB};box-shadow:none;color:#f3eee4;text-shadow:none;text-align:center;font-family:${SONG};}`,
    `${IO} .igs-fx-item-showcase .igs-fx-item-showcase-plate::before{content:"";position:absolute;inset:6px;left:6px;right:6px;top:6px;bottom:6px;width:auto;height:auto;border:1px solid rgba(${MOON_RGB},.2);border-radius:0;background:none;box-shadow:none;pointer-events:none;}`,
    `${IO} .igs-fx-item-showcase .igs-fx-item-showcase-plate::after{display:none;}`,
    `${IO} .igs-fx-item-showcase .igs-fx-item-showcase-label{display:block;font-size:0;letter-spacing:0;color:#a39e95;}`,
    `${IO} .igs-fx-item-showcase .igs-fx-item-showcase-label::before{content:attr(data-igs-item-act);font:400 13px ${SONG};letter-spacing:.5em;}`,
    `${IO} .igs-fx-item-showcase .igs-fx-item-showcase-name{display:block;margin:0 12px 0 14px;font:400 34px "IGS-MaShanZheng","LXGW WenKai",serif;letter-spacing:.24em;color:#f3eee4;}`,
    `${IO} .igs-fx-item-showcase .igs-fx-item-showcase-desc{display:block;font:400 14px/2 ${SONG};letter-spacing:.08em;color:#c7c1b6;text-align:start;opacity:1;}`,
    `${IO} .igs-fx-item-showcase .igs-fx-item-showcase-seal{position:absolute;right:20px;bottom:18px;width:30px;height:30px;margin:0;font-size:17px;${SEAL}}`,
    `@media (max-width:640px){${IO} .igs-fx-item-showcase{padding:56px 16px 0 0;}${IO} .igs-fx-item-showcase .igs-fx-item-showcase-plate{height:320px;}}`,
    `${IO} .igs-fx-item-stack .igs-fx-item-card{gap:10px;padding:8px 12px 8px 14px;border:0;border-radius:0;outline:none;filter:none;background:${RUB};color:#ece7dd;text-shadow:none;font-family:${SONG};box-shadow:inset 0 0 0 1px rgba(${MOON_RGB},.1),inset 0 0 0 6px rgba(12,11,10,.92),inset 0 0 0 7px rgba(${MOON_RGB},.2),0 4px 14px rgba(0,0,0,.45);}`,
    `${IO} .igs-fx-item-stack .igs-fx-item-card::before{display:none;}`,
    `${IO} .igs-fx-item-stack .igs-fx-item-icon,${IO} .igs-fx-item-stack .igs-fx-item-icon[data-igs-item-placeholder]{border-radius:0;background:rgba(${MOON_RGB},.06);box-shadow:inset 0 0 0 1px rgba(${MOON_RGB},.3);color:${MOON};opacity:1;}`,
    `${IO} .igs-fx-item-stack .igs-fx-item-name{color:#f3eee4;font:400 17px "IGS-MaShanZheng","LXGW WenKai",serif;letter-spacing:.08em;}`,
    `${IO} .igs-fx-item-stack .igs-fx-item-desc{color:#c7c1b6;opacity:1;}`,
    // 单字印钤在卡片右下角（基础规则是贴顶）；整张卡只这一方印。
    `${IO} .igs-fx-item-stack .igs-fx-item-seal{align-self:flex-end;width:22px;height:22px;font-size:14px;${SEAL}}`,
    `${IO} .igs-fx-item-stack .igs-fx-item-more{border:0;border-radius:0;background:rgba(12,11,10,.9);color:#c7c1b6;font-family:${SONG};}`,
].join('\n');

