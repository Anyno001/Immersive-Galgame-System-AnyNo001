import { buildDialogFrameCss, scalePx, threeSliceCss } from './dialog-skin-frame.js';

export const DIALOG_SKIN_DAY_MINIMAL = 'day-minimal';
export const DIALOG_SKIN_WARM_PICTUREBOOK = 'warm-picturebook';
export const DIALOG_SKIN_ELEGANT_EUROPEAN = 'elegant-european';

export const CSS_DIALOG_SKINS = Object.freeze([
    DIALOG_SKIN_DAY_MINIMAL,
    DIALOG_SKIN_WARM_PICTUREBOOK,
    DIALOG_SKIN_ELEGANT_EUROPEAN,
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

// 优雅欧式：作者 frame_message 的通栏黑纱贴合阅读器左右与底边。底板由左右两片拼成（两端 200px 渐隐线保形、
// 中段纯色拉伸），中央饰纹单独叠放，避免随宽度被拉变形。几何按原图 0.7 缩放：275→192，两道线在 y≈76/168。
const ELEGANT_EDGE = 140;
const ELEGANT_TOP_LINE = 76;
const ELEGANT_BOTTOM_LINE = 168;
// 饰纹从作者中段切片反合成抠出（200×14，线穿过其 y=10 / y=3）；1px 线稿缩小会糊掉，按原尺寸绘制。
const ELEGANT_ORNAMENT = { width: 200, height: 14 };
const elegantEuropean = buildDialogFrameCss(DIALOG_SKIN_ELEGANT_EUROPEAN, {
    height: 192,
    text: { top: 88, speakerTop: 88, right: 72, bottom: 30, left: 72 },
    rise: 0,
    flush: true,
    frameCss: `${threeSliceCss(ELEGANT_BAND, [200, 200], ELEGANT_EDGE, ELEGANT_EDGE)}background-image:url("${ELEGANT_ORNAMENT_TOP}"),url("${ELEGANT_ORNAMENT_BOTTOM}");background-position:center ${ELEGANT_TOP_LINE - 10}px,center ${ELEGANT_BOTTOM_LINE - 3}px;background-size:${ELEGANT_ORNAMENT.width}px ${ELEGANT_ORNAMENT.height}px;background-repeat:no-repeat;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
    speakerCss: `left:56px;top:${ELEGANT_TOP_LINE - 36}px;${NAME_TEXT}max-width:calc(100% - 112px);height:32px;line-height:32px;padding:0;background:none;border:0;font-size:22px;font-weight:400;letter-spacing:.06em;text-shadow:0 0 8px rgba(195,180,230,.55),0 1px 3px rgba(0,0,0,.9);`,
    textCss: 'letter-spacing:.06em;text-shadow:0 1px 2px rgba(0,0,0,.85),0 0 6px rgba(0,0,0,.45);',
});

export const CSS_DIALOG_STYLE_BY_SKIN = Object.freeze({
    [DIALOG_SKIN_DAY_MINIMAL]: dayMinimal,
    [DIALOG_SKIN_WARM_PICTUREBOOK]: warmPicturebook,
    [DIALOG_SKIN_ELEGANT_EUROPEAN]: elegantEuropean,
});

export const CSS_DIALOG_STYLE_TEXT = Object.values(CSS_DIALOG_STYLE_BY_SKIN).join('\n');
