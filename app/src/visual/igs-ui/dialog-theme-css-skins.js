import { buildDialogFrameCss, scalePx, stroke } from './dialog-skin-frame.js';

export const DIALOG_SKIN_DAY_MINIMAL = 'day-minimal';
export const DIALOG_SKIN_WARM_PICTUREBOOK = 'warm-picturebook';
export const DIALOG_SKIN_ELEGANT_EUROPEAN = 'elegant-european';
export const DIALOG_SKIN_MAGIC_ACADEMY = 'magic-academy';

export const CSS_DIALOG_SKINS = Object.freeze([
    DIALOG_SKIN_DAY_MINIMAL,
    DIALOG_SKIN_WARM_PICTUREBOOK,
    DIALOG_SKIN_ELEGANT_EUROPEAN,
    DIALOG_SKIN_MAGIC_ACADEMY,
]);

const ELEGANT_BAND = '__IGS_ASSET__elegant-european/dialog.png__';
const ELEGANT_ORNAMENT_TOP = '__IGS_ASSET__elegant-european/ornament-top.png__';
const ELEGANT_ORNAMENT_BOTTOM = '__IGS_ASSET__elegant-european/ornament-bottom.png__';

function scope(skin) {
    return `#igs-overlay .igs-dialog[data-igs-dialog-skin="${skin}"]`;
}

const NO_CHROME = 'border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;';
const NAME_TEXT = 'width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

// 日间简约：还原作者 frame_message 的深色渐隐名条 + ××× 标记，正文底为半透明白。
const DAY_MINIMAL_BAR = 32;
const dayMinimal = [
    buildDialogFrameCss(DIALOG_SKIN_DAY_MINIMAL, {
        height: 172,
        text: { top: 46, speakerTop: 46, right: 56, bottom: 22, left: 64 },
        rise: 0,
        flush: true,
        frameCss: `background-color:transparent;background-image:linear-gradient(90deg,#333 0,#383835 22%,#5f5e53 34%,rgba(150,149,130,.82) 46%,rgba(205,203,188,.45) 58%,rgba(255,255,255,0) 68%),linear-gradient(180deg,rgba(255,255,255,.8),rgba(250,249,244,.86));background-position:left top,left ${DAY_MINIMAL_BAR}px;background-size:100% ${DAY_MINIMAL_BAR}px,100% calc(100% - ${DAY_MINIMAL_BAR}px);background-repeat:no-repeat;${NO_CHROME}-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);`,
        speakerCss: `left:64px;top:0;${NAME_TEXT}max-width:calc(60% - 64px);height:${DAY_MINIMAL_BAR}px;line-height:${DAY_MINIMAL_BAR}px;padding:0;background:none;border:0;font-size:16px;letter-spacing:.14em;text-shadow:0 1px 2px rgba(0,0,0,.45);`,
        textCss: 'letter-spacing:.06em;text-shadow:0 1px 0 rgba(255,255,255,.8);',
    }),
    scalePx(`${scope(DIALOG_SKIN_DAY_MINIMAL)}::before{content:"\\00d7\\00d7\\00d7";position:absolute;left:18px;top:0;height:${DAY_MINIMAL_BAR}px;line-height:${DAY_MINIMAL_BAR}px;font:15px/${DAY_MINIMAL_BAR}px "Microsoft YaHei",sans-serif;letter-spacing:1px;background:linear-gradient(90deg,#e0826c 0 33.3%,#ebe5d0 33.3% 66.6%,#b9c4a2 66.6%);-webkit-background-clip:text;background-clip:text;color:transparent;pointer-events:none;}`),
    scalePx(`${scope(DIALOG_SKIN_DAY_MINIMAL)}::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,rgba(120,118,104,.5),rgba(120,118,104,.15));pointer-events:none;}`),
].join('\n');

// 温暖绘本：作者的异形姓名牌是「斜纹胶囊 + 断开的外描边」，用 CSS 重建，避免拉伸素材让斜纹变形。
// 外描边画在 ::after 上，靠 overflow:clip + overflow-clip-margin 露出牌外；不支持的浏览器只丢描边。
const WARM_INK = '#4f4a45';
const WARM_PAPER = '#f1ede9';
const warmPicturebook = [
    buildDialogFrameCss(DIALOG_SKIN_WARM_PICTUREBOOK, {
        height: 176,
        text: { top: 28, speakerTop: 36, right: 44, bottom: 26, left: 44 },
        rise: 22,
        frameCss: `background:${WARM_PAPER};border:2px solid ${WARM_INK};border-radius:14px;box-shadow:inset 0 -12px 0 #55514b,0 2px 0 rgba(79,74,69,.18);-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:34px;top:-22px;${NAME_TEXT}overflow:clip;overflow-clip-margin:8px;min-width:210px;max-width:calc(100% - 68px);height:44px;line-height:44px;padding:0 42px 0 58px;background:repeating-linear-gradient(135deg,#5b5650 0 5px,${WARM_INK} 5px 10px);border:0;border-radius:22px;box-shadow:0 0 0 3px ${WARM_PAPER};font-size:17px;font-weight:500;letter-spacing:.16em;text-shadow:0 1px 0 #2f2b27,0 0 3px rgba(47,43,39,.6);`,
        textCss: 'letter-spacing:.05em;text-shadow:0 1px 0 rgba(255,255,255,.6);',
    }),
    scalePx(`${scope(DIALOG_SKIN_WARM_PICTUREBOOK)} .igs-speaker::before{content:"";position:absolute;left:26px;top:50%;width:12px;height:12px;margin-top:-6px;background:linear-gradient(#a6dcd4 0 0) 0 0/5px 5px,linear-gradient(#a6dcd4 0 0) 7px 0/5px 5px,linear-gradient(#a6dcd4 0 0) 0 7px/5px 5px,linear-gradient(#a6dcd4 0 0) 7px 7px/5px 5px;background-repeat:no-repeat;}`),
    scalePx(`${scope(DIALOG_SKIN_WARM_PICTUREBOOK)} .igs-speaker::after{content:"";position:absolute;inset:-6px;border:2px solid ${WARM_INK};border-radius:999px;pointer-events:none;-webkit-mask:linear-gradient(#000 0 0) left top/36% 50% no-repeat,linear-gradient(#000 0 0) right bottom/40% 50% no-repeat,linear-gradient(#000 0 0) right top/30px 100% no-repeat;mask:linear-gradient(#000 0 0) left top/36% 50% no-repeat,linear-gradient(#000 0 0) right bottom/40% 50% no-repeat,linear-gradient(#000 0 0) right top/30px 100% no-repeat;}`),
].join('\n');

// 优雅欧式：作者 frame_message 的通栏黑纱贴合阅读器左右与底边。几何按原图 0.7 缩放：275→192，两道线在 y≈76/168。
// 拼法照作者三切片：中央饰纹（连同穿过它的线段）原样居中不动，两侧细线向外延伸、在两端渐隐；
// 细线不得穿过饰纹，否则会填进花纹之间的空隙。黑纱横向均匀，用一列像素拉满。
const ELEGANT_TOP_LINE = 76;
const ELEGANT_BOTTOM_LINE = 168;
// 饰纹从作者中段切片反合成抠出（200×14，线穿过其 y=10 / y=3）；1px 线稿缩小会糊掉，按原尺寸绘制。
const ELEGANT_ORNAMENT = { width: 200, height: 14 };
const ELEGANT_LINE = 'rgba(255,255,255,.5)';
function elegantLines(y) {
    const side = `calc(50% - ${ELEGANT_ORNAMENT.width / 2}px) 1px`;
    return {
        image: `linear-gradient(90deg,rgba(255,255,255,0) 15px,${ELEGANT_LINE} 100px),linear-gradient(270deg,rgba(255,255,255,0) 15px,${ELEGANT_LINE} 100px)`,
        position: `left ${y}px,right ${y}px`,
        size: `${side},${side}`,
    };
}
const ELEGANT_TOP = elegantLines(ELEGANT_TOP_LINE);
const ELEGANT_BOTTOM = elegantLines(ELEGANT_BOTTOM_LINE);
const elegantEuropean = buildDialogFrameCss(DIALOG_SKIN_ELEGANT_EUROPEAN, {
    height: 192,
    text: { top: 88, speakerTop: 88, right: 72, bottom: 30, left: 72 },
    rise: 0,
    flush: true,
    frameCss: `background-color:transparent;background-image:url("${ELEGANT_ORNAMENT_TOP}"),url("${ELEGANT_ORNAMENT_BOTTOM}"),${ELEGANT_TOP.image},${ELEGANT_BOTTOM.image},url("${ELEGANT_BAND}");background-position:center ${ELEGANT_TOP_LINE - 10}px,center ${ELEGANT_BOTTOM_LINE - 3}px,${ELEGANT_TOP.position},${ELEGANT_BOTTOM.position},0 0;background-size:${ELEGANT_ORNAMENT.width}px ${ELEGANT_ORNAMENT.height}px,${ELEGANT_ORNAMENT.width}px ${ELEGANT_ORNAMENT.height}px,${ELEGANT_TOP.size},${ELEGANT_BOTTOM.size},100% 100%;background-repeat:no-repeat;${NO_CHROME}`,
    // 黑纱上的字用 1px 实描边 + 1px 投影托住，不用模糊光晕（光晕会让字边发虚）。
    speakerCss: `left:56px;top:${ELEGANT_TOP_LINE - 36}px;${NAME_TEXT}max-width:calc(100% - 112px);height:32px;line-height:32px;padding:0;background:none;border:0;font-size:22px;font-weight:400;letter-spacing:.06em;text-shadow:${stroke('rgba(0,0,0,.55)')},0 1px 0 rgba(0,0,0,.9);`,
    textCss: `letter-spacing:.06em;text-shadow:${stroke('rgba(0,0,0,.55)')},0 1px 0 rgba(0,0,0,.85);`,
});

// 魔法学院：午夜蓝底 + 金属色双线框，四角角花，顶边正中一颗星徽；姓名牌为学院色徽带。
// 角花与星点全用渐变绘制，框体随宽度伸缩时只拉长直线，花饰本身不变形。
// 学院配色经 --igs-ma-* 变量注入（reader-dom-render 写在 #igs-overlay 上），选项与状态栏共用；缺省为红金。
export const MAGIC_HOUSES = Object.freeze([
    Object.freeze({ id: 'scarlet', label: '红金', metal: '#d9b45a', hi: '#f0cf78', plateA: '#8f2636', plateB: '#5c1520' }),
    Object.freeze({ id: 'emerald', label: '绿银', metal: '#c3cad3', hi: '#eef2f7', plateA: '#1f6b47', plateB: '#0f3d28' }),
    Object.freeze({ id: 'sapphire', label: '蓝铜', metal: '#c48d58', hi: '#e8b37c', plateA: '#2a4c86', plateB: '#142b55' }),
    Object.freeze({ id: 'amber', label: '黄黑', metal: '#e3bd3e', hi: '#f7da6a', plateA: '#3b3122', plateB: '#1c1810' }),
]);
export const MAGIC_HOUSE_DEFAULT = 'scarlet';
export function normalizeMagicHouse(value) {
    return MAGIC_HOUSES.some((house) => house.id === value) ? value : MAGIC_HOUSE_DEFAULT;
}
export function magicHouseVars(value) {
    const house = MAGIC_HOUSES.find((item) => item.id === normalizeMagicHouse(value));
    return { '--igs-ma-metal': house.metal, '--igs-ma-hi': house.hi, '--igs-ma-plate-a': house.plateA, '--igs-ma-plate-b': house.plateB };
}
export const MAGIC_METAL = 'var(--igs-ma-metal,#d9b45a)';
export const MAGIC_METAL_HI = 'var(--igs-ma-hi,#f0cf78)';
export const MAGIC_PLATE = 'linear-gradient(180deg,var(--igs-ma-plate-a,#8f2636),var(--igs-ma-plate-b,#5c1520))';
const MAGIC_GOLD = MAGIC_METAL;
const MAGIC_NAVY = 'rgba(14,18,44,.95)';
const magicCorner = (x, y) => `linear-gradient(${MAGIC_GOLD} 0 0) ${x} ${y}/22px 1.5px no-repeat,linear-gradient(${MAGIC_GOLD} 0 0) ${x} ${y}/1.5px 22px no-repeat`;
const MAGIC_STARS = [[9, 30], [23, 72], [41, 22], [63, 64], [78, 28], [91, 70]]
    .map(([x, y], i) => `radial-gradient(${i % 2 ? 1 : 1.5}px ${i % 2 ? 1 : 1.5}px at ${x}% ${y}%,rgba(255,240,200,.75),transparent)`).join(',');
const magicAcademy = [
    buildDialogFrameCss(DIALOG_SKIN_MAGIC_ACADEMY, {
        height: 184,
        text: { top: 38, speakerTop: 44, right: 56, bottom: 26, left: 56 },
        rise: 24,
        frameCss: `background:${magicCorner('10px', '10px')},${magicCorner('calc(100% - 10px)', '10px')},${magicCorner('10px', 'calc(100% - 10px)')},${magicCorner('calc(100% - 10px)', 'calc(100% - 10px)')},${MAGIC_STARS},radial-gradient(ellipse 70% 120% at 50% 0,rgba(70,82,150,.35),transparent 70%),linear-gradient(180deg,rgba(24,30,66,.94),rgba(10,12,32,.96));border:1px solid ${MAGIC_GOLD};border-radius:6px;box-shadow:inset 0 0 0 4px ${MAGIC_NAVY},inset 0 0 0 5px color-mix(in srgb,${MAGIC_GOLD} 50%,transparent),0 0 22px rgba(255,214,120,.16),0 6px 18px rgba(0,0,0,.45);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);`,
        speakerCss: `left:30px;top:-24px;${NAME_TEXT}min-width:150px;max-width:calc(100% - 60px);height:40px;line-height:40px;padding:0 32px;background:radial-gradient(circle at 13px 50%,${MAGIC_GOLD} 0 2.5px,transparent 3px),radial-gradient(circle at calc(100% - 13px) 50%,${MAGIC_GOLD} 0 2.5px,transparent 3px),${MAGIC_PLATE};border:1px solid ${MAGIC_GOLD};border-radius:3px;box-shadow:0 0 0 3px ${MAGIC_NAVY},0 0 0 4px color-mix(in srgb,${MAGIC_GOLD} 45%,transparent),0 4px 10px rgba(0,0,0,.4);font-size:19px;letter-spacing:.12em;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.6);`,
        textCss: 'letter-spacing:.05em;text-shadow:0 1px 2px rgba(0,0,0,.75);',
    }),
    scalePx(`${scope(DIALOG_SKIN_MAGIC_ACADEMY)}::after{content:"\\2726";position:absolute;left:50%;top:-11px;transform:translateX(-50%);padding:0 12px;font:16px/20px serif;color:${MAGIC_METAL_HI};background:linear-gradient(rgba(16,20,48,1) 0 0) center/100% 4px no-repeat;text-shadow:0 0 8px rgba(255,214,120,.85);pointer-events:none;}`),
].join('\n');

export const CSS_DIALOG_STYLE_BY_SKIN = Object.freeze({
    [DIALOG_SKIN_DAY_MINIMAL]: dayMinimal,
    [DIALOG_SKIN_WARM_PICTUREBOOK]: warmPicturebook,
    [DIALOG_SKIN_ELEGANT_EUROPEAN]: elegantEuropean,
    [DIALOG_SKIN_MAGIC_ACADEMY]: magicAcademy,
});

export const CSS_DIALOG_STYLE_TEXT = Object.values(CSS_DIALOG_STYLE_BY_SKIN).join('\n');
