import {
    CSS_DIALOG_SKINS,
    CSS_DIALOG_STYLE_BY_SKIN,
    DIALOG_SKIN_DAY_MINIMAL,
    DIALOG_SKIN_ELEGANT_EUROPEAN,
    DIALOG_SKIN_WARM_PICTUREBOOK,
} from './dialog-theme-css-skins.js';
import { buildDialogFrameCss, halo, stroke, threeSliceCss } from './dialog-skin-frame.js';
import { DIALOG_SKIN_QINGLV, QINGLV_DIALOG_STYLE } from './dialog-theme-guofeng.js';
import { DIALOG_SKIN_FAIRY_TALE, FAIRY_DIALOG_STYLE } from './dialog-theme-fairytale.js';
import { DIALOG_SKIN_HORROR_GORE, DIALOG_SKIN_HORROR_PSYCH, GORE_DIALOG_STYLE, PSYCH_DIALOG_STYLE } from './dialog-theme-horror.js';
import { DIALOG_SKIN_SCIFI_HOLO, SCIFI_DIALOG_STYLE } from './dialog-theme-scifi.js';
import { DIALOG_SKIN_WASTELAND_RUST, WASTELAND_DIALOG_STYLE } from './dialog-theme-wasteland.js';

export const DIALOG_SKIN_PLANT_COFFEE = 'plant-coffee';
export const DIALOG_SKIN_BLACK_WHITE_MANGA = 'black-white-manga';
export const DIALOG_SKIN_CUTE_PINK = 'cute-pink';
export const DIALOG_SKIN_RETRO_JAPANESE = 'retro-japanese';
export const DIALOG_SKIN_ADVENTURE_JOURNEY = 'adventure-journey';
export { DIALOG_SKIN_DAY_MINIMAL, DIALOG_SKIN_ELEGANT_EUROPEAN, DIALOG_SKIN_FAIRY_TALE, DIALOG_SKIN_QINGLV, DIALOG_SKIN_SCIFI_HOLO, DIALOG_SKIN_WARM_PICTUREBOOK, DIALOG_SKIN_WASTELAND_RUST };

const SLICED_DIALOG_SKINS = Object.freeze([
    DIALOG_SKIN_PLANT_COFFEE,
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_RETRO_JAPANESE,
    DIALOG_SKIN_ADVENTURE_JOURNEY,
]);

// 「插画式」= 固定高度、自带排版默认值的主题，含三片素材主题与纯 CSS 还原主题。
export const ILLUSTRATED_DIALOG_SKINS = Object.freeze([...SLICED_DIALOG_SKINS, ...CSS_DIALOG_SKINS, DIALOG_SKIN_QINGLV, DIALOG_SKIN_FAIRY_TALE, DIALOG_SKIN_HORROR_GORE, DIALOG_SKIN_HORROR_PSYCH, DIALOG_SKIN_SCIFI_HOLO, DIALOG_SKIN_WASTELAND_RUST]);

// 「对话框高度自适应」开放给全部插画式主题与西式古典：字少压矮、字多不超原高度。
// 三片素材只横向切、纵向拉伸；伪元素装饰按上下边定位的主题压矮后跟着框走。
export function supportsDialogAutoHeight(value) {
    const skin = typeof value === 'string' ? value : value && value.dialogSkin;
    return skin === 'western-classic' || ILLUSTRATED_DIALOG_SKINS.includes(skin);
}

export function isIllustratedDialogSkin(value) {
    const skin = typeof value === 'string' ? value : value && value.dialogSkin;
    return ILLUSTRATED_DIALOG_SKINS.includes(skin);
}

// 构建脚本按字面占位符把素材外置到 dist/skins/，这里必须保留完整字面量。
const DIALOG_THEME_ASSETS = Object.freeze({
    [DIALOG_SKIN_PLANT_COFFEE]: Object.freeze({
        dialog: '__IGS_ASSET__plant-coffee/dialog.png__',
        name: '__IGS_ASSET__plant-coffee/name.png__',
    }),
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: Object.freeze({
        dialog: '__IGS_ASSET__black-white-manga/dialog.png__',
        name: '__IGS_ASSET__black-white-manga/name.png__',
    }),
    [DIALOG_SKIN_CUTE_PINK]: Object.freeze({
        dialog: '__IGS_ASSET__cute-pink/dialog.png__',
        name: '__IGS_ASSET__cute-pink/name.png__',
    }),
    [DIALOG_SKIN_RETRO_JAPANESE]: Object.freeze({
        dialog: '__IGS_ASSET__retro-japanese/dialog.png__',
        name: '__IGS_ASSET__retro-japanese/name.png__',
    }),
    [DIALOG_SKIN_ADVENTURE_JOURNEY]: Object.freeze({
        dialog: '__IGS_ASSET__adventure-journey/dialog.png__',
        name: '__IGS_ASSET__adventure-journey/name.png__',
    }),
});

// 三片素材皮肤的几何全部来自素材实测：dialog 为原始高度与左右端宽度，
// plate 为姓名牌缩放后的高度与两端宽度（保持素材宽高比），text 为正文安全区内距。
// rise 是姓名牌高出对话框顶边的距离，供选项气泡避让。
export const ILLUSTRATED_DIALOG_SPECS = Object.freeze({
    [DIALOG_SKIN_PLANT_COFFEE]: Object.freeze({
        dialog: { height: 177, left: 130, right: 130, slice: [130, 130] },
        text: { top: 24, speakerTop: 34, right: 44, bottom: 20, left: 42 },
        plate: { height: 42, left: 31, right: 31, slice: [35, 35], x: 62, rise: 12, lineHeight: 42, padding: '0 30px', minWidth: 124 },
        nameCss: 'font-size:15px;font-weight:600;letter-spacing:.2em;text-indent:.2em;text-shadow:0 1px 0 rgba(58,40,34,.55);',
        textCss: `letter-spacing:.06em;${halo('#f6f1eb')}`,
    }),
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: Object.freeze({
        dialog: { height: 191, left: 90, right: 89, slice: [90, 89] },
        text: { top: 26, speakerTop: 36, right: 58, bottom: 24, left: 58 },
        // 姓名牌走漫画标题的路子：撕边纸条放大，得意黑加大收紧字距，白描边外再压一道实黑错位影。
        plate: { height: 66, left: 66, right: 66, slice: [68, 68], x: 20, rise: 38, lineHeight: 64, padding: '0 66px 0 40px', minWidth: 190 },
        nameCss: `font-size:27px;font-weight:700;letter-spacing:.04em;text-shadow:${stroke('#fbf8f1')},3px 3px 0 #171412,4px 4px 0 #fbf8f1;transform:rotate(-2.5deg);transform-origin:0 100%;`,
        textCss: `letter-spacing:.04em;${halo('#efe9dd', 2)}`,
    }),
    [DIALOG_SKIN_CUTE_PINK]: Object.freeze({
        dialog: { height: 215, left: 120, right: 145, slice: [120, 145] },
        text: { top: 34, speakerTop: 38, right: 54, bottom: 34, left: 50 },
        plate: { height: 58, left: 34, right: 85, slice: [40, 100], x: 30, rise: 32, lineHeight: 52, padding: '0 46px 0 40px', minWidth: 156 },
        nameCss: `font-size:17px;font-weight:700;letter-spacing:.14em;text-shadow:${stroke('#d4557c')},0 2px 0 #b03e64,0 3px 4px rgba(120,30,60,.35);`,
        textCss: `letter-spacing:.05em;${halo('rgba(255,255,255,.95)', 4)}`,
    }),
    // messgeframe_01 按 0.9 缩放（236→212），纸面上沿约在 y=32。正文从上沿下方直接起排，
    // 压在两侧花簇上，靠纸色光晕保持可读；姓名牌骑在上沿，窄屏整体缩到 0.66。
    [DIALOG_SKIN_RETRO_JAPANESE]: Object.freeze({
        dialog: { height: 212, left: 180, right: 171, slice: [200, 190] },
        text: { top: 44, speakerTop: 48, right: 64, bottom: 30, left: 58 },
        plate: { height: 42, left: 21, right: 21, slice: [20, 20], x: 150, rise: 14, lineHeight: 42, padding: '0 36px', minWidth: 150 },
        nameCss: 'font-size:16px;font-weight:600;letter-spacing:.24em;text-indent:.24em;text-shadow:0 1px 0 rgba(30,18,12,.7);',
        textCss: `letter-spacing:.06em;${halo('#f5ead3')}`,
        compact: Object.freeze({
            dialog: { height: 156, left: 132, right: 125, slice: [200, 190] },
            text: { top: 32, speakerTop: 36, right: 40, bottom: 20, left: 36 },
            plate: { height: 34, left: 17, right: 17, slice: [20, 20], x: 104, rise: 11, lineHeight: 34, padding: '0 26px', minWidth: 112 },
            nameCss: 'font-size:14px;font-weight:600;letter-spacing:.2em;text-indent:.2em;text-shadow:0 1px 0 rgba(30,18,12,.7);',
            textCss: `letter-spacing:.04em;${halo('#f5ead3')}`,
        }),
    }),
    [DIALOG_SKIN_ADVENTURE_JOURNEY]: Object.freeze({
        dialog: { height: 170, left: 48, right: 48, slice: [48, 48] },
        text: { top: 26, speakerTop: 34, right: 44, bottom: 20, left: 44 },
        plate: { height: 50, left: 41, right: 41, slice: [56, 56], x: 34, rise: 26, lineHeight: 50, padding: '0 50px', minWidth: 176 },
        nameCss: 'font-size:16px;font-weight:600;letter-spacing:.2em;text-indent:.2em;text-shadow:0 1px 0 rgba(20,12,6,.75);',
        textCss: `letter-spacing:.05em;${halo('#e6dccb')}`,
    }),
});

function px(value) {
    return `${value}px`;
}

export function buildSlicedDialogSkinCss(skin, spec, assets, { mobilePlate } = {}) {
    const { dialog, text, plate } = spec;
    return buildDialogFrameCss(skin, {
        height: dialog.height,
        text,
        rise: plate.rise,
        frameCss: `${threeSliceCss(assets.dialog, dialog.slice, dialog.left, dialog.right, 'var(--igs-slice-k,1)')}border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:${px(plate.x)};top:${px(-plate.rise)};width:max-content;min-width:${px(plate.minWidth)};max-width:calc(100% - ${px(plate.x * 2)});height:${px(plate.height)};line-height:${px(plate.lineHeight)};margin:0;padding:${plate.padding};${threeSliceCss(assets.name, plate.slice, plate.left, plate.right)}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${spec.nameCss || ''}`,
        textCss: spec.textCss || '',
        autoHeight: true,
        mobilePlate,
    });
}

function slicedSkinCss(skin) {
    const spec = ILLUSTRATED_DIALOG_SPECS[skin];
    // 自带窄屏几何（compact）的主题已经把姓名牌缩好，不再叠加手机端缩放。
    const own = spec.compact ? { mobilePlate: 1 } : {};
    const css = buildSlicedDialogSkinCss(skin, spec, DIALOG_THEME_ASSETS[skin], own);
    if (!spec.compact) return css;
    return `${css}\n@media (max-width:640px){\n${buildSlicedDialogSkinCss(skin, spec.compact, DIALOG_THEME_ASSETS[skin], own)}\n}`;
}

export const ILLUSTRATED_DIALOG_STYLE_BY_SKIN = Object.freeze({
    ...Object.fromEntries(SLICED_DIALOG_SKINS.map((skin) => [skin, slicedSkinCss(skin)])),
    ...CSS_DIALOG_STYLE_BY_SKIN,
    [DIALOG_SKIN_QINGLV]: QINGLV_DIALOG_STYLE,
    [DIALOG_SKIN_FAIRY_TALE]: FAIRY_DIALOG_STYLE,
    [DIALOG_SKIN_HORROR_GORE]: GORE_DIALOG_STYLE,
    [DIALOG_SKIN_HORROR_PSYCH]: PSYCH_DIALOG_STYLE,
    [DIALOG_SKIN_SCIFI_HOLO]: SCIFI_DIALOG_STYLE,
    [DIALOG_SKIN_WASTELAND_RUST]: WASTELAND_DIALOG_STYLE,
});

export const ILLUSTRATED_DIALOG_STYLE_TEXT = ILLUSTRATED_DIALOG_SKINS
    .map((skin) => ILLUSTRATED_DIALOG_STYLE_BY_SKIN[skin])
    .join('\n');
