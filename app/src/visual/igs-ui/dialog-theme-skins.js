import {
    CSS_DIALOG_SKINS,
    CSS_DIALOG_STYLE_TEXT,
    DIALOG_SKIN_DAY_MINIMAL,
    DIALOG_SKIN_ELEGANT_EUROPEAN,
    DIALOG_SKIN_WARM_PICTUREBOOK,
} from './dialog-theme-css-skins.js';
import { buildDialogFrameCss, halo } from './dialog-skin-frame.js';

export const DIALOG_SKIN_PLANT_COFFEE = 'plant-coffee';
export const DIALOG_SKIN_BLACK_WHITE_MANGA = 'black-white-manga';
export const DIALOG_SKIN_CUTE_PINK = 'cute-pink';
export const DIALOG_SKIN_RETRO_JAPANESE = 'retro-japanese';
export const DIALOG_SKIN_ADVENTURE_JOURNEY = 'adventure-journey';
export { DIALOG_SKIN_DAY_MINIMAL, DIALOG_SKIN_ELEGANT_EUROPEAN, DIALOG_SKIN_WARM_PICTUREBOOK };

const SLICED_DIALOG_SKINS = Object.freeze([
    DIALOG_SKIN_PLANT_COFFEE,
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_RETRO_JAPANESE,
    DIALOG_SKIN_ADVENTURE_JOURNEY,
]);

// 「插画式」= 固定高度、自带排版默认值的主题，含三片素材主题与纯 CSS 还原主题。
export const ILLUSTRATED_DIALOG_SKINS = Object.freeze([...SLICED_DIALOG_SKINS, ...CSS_DIALOG_SKINS]);

export function isIllustratedDialogSkin(value) {
    const skin = typeof value === 'string' ? value : value && value.dialogSkin;
    return ILLUSTRATED_DIALOG_SKINS.includes(skin);
}

// 构建脚本按字面占位符内联 PNG，这里必须保留完整字面量。
const DIALOG_THEME_ASSETS = Object.freeze({
    [DIALOG_SKIN_PLANT_COFFEE]: Object.freeze({
        dialogLeft: '__IGS_ASSET__plant-coffee/dialog-left.png__',
        dialogCenter: '__IGS_ASSET__plant-coffee/dialog-center.png__',
        dialogRight: '__IGS_ASSET__plant-coffee/dialog-right.png__',
        nameLeft: '__IGS_ASSET__plant-coffee/name-left.png__',
        nameCenter: '__IGS_ASSET__plant-coffee/name-center.png__',
        nameRight: '__IGS_ASSET__plant-coffee/name-right.png__',
    }),
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: Object.freeze({
        dialogLeft: '__IGS_ASSET__black-white-manga/dialog-left.png__',
        dialogCenter: '__IGS_ASSET__black-white-manga/dialog-center.png__',
        dialogRight: '__IGS_ASSET__black-white-manga/dialog-right.png__',
        nameLeft: '__IGS_ASSET__black-white-manga/name-left.png__',
        nameCenter: '__IGS_ASSET__black-white-manga/name-center.png__',
        nameRight: '__IGS_ASSET__black-white-manga/name-right.png__',
    }),
    [DIALOG_SKIN_CUTE_PINK]: Object.freeze({
        dialogLeft: '__IGS_ASSET__cute-pink/dialog-left.png__',
        dialogCenter: '__IGS_ASSET__cute-pink/dialog-center.png__',
        dialogRight: '__IGS_ASSET__cute-pink/dialog-right.png__',
        nameLeft: '__IGS_ASSET__cute-pink/name-left.png__',
        nameCenter: '__IGS_ASSET__cute-pink/name-center.png__',
        nameRight: '__IGS_ASSET__cute-pink/name-right.png__',
    }),
    [DIALOG_SKIN_RETRO_JAPANESE]: Object.freeze({
        dialogLeft: '__IGS_ASSET__retro-japanese/dialog-left.png__',
        dialogCenter: '__IGS_ASSET__retro-japanese/dialog-center.png__',
        dialogRight: '__IGS_ASSET__retro-japanese/dialog-right.png__',
        nameLeft: '__IGS_ASSET__retro-japanese/name-left.png__',
        nameCenter: '__IGS_ASSET__retro-japanese/name-center.png__',
        nameRight: '__IGS_ASSET__retro-japanese/name-right.png__',
    }),
    [DIALOG_SKIN_ADVENTURE_JOURNEY]: Object.freeze({
        dialogLeft: '__IGS_ASSET__adventure-journey/dialog-left.png__',
        dialogCenter: '__IGS_ASSET__adventure-journey/dialog-center.png__',
        dialogRight: '__IGS_ASSET__adventure-journey/dialog-right.png__',
        nameLeft: '__IGS_ASSET__adventure-journey/name-left.png__',
        nameCenter: '__IGS_ASSET__adventure-journey/name-center.png__',
        nameRight: '__IGS_ASSET__adventure-journey/name-right.png__',
    }),
});

// 三片素材皮肤的几何全部来自素材实测：dialog 为原始高度与左右端宽度，
// plate 为姓名牌缩放后的高度与两端宽度（保持素材宽高比），text 为正文安全区内距。
// rise 是姓名牌高出对话框顶边的距离，供选项气泡避让。
export const ILLUSTRATED_DIALOG_SPECS = Object.freeze({
    [DIALOG_SKIN_PLANT_COFFEE]: Object.freeze({
        dialog: { height: 177, left: 130, right: 130 },
        text: { top: 24, speakerTop: 34, right: 44, bottom: 20, left: 42 },
        plate: { height: 42, left: 31, right: 31, x: 62, rise: 12, lineHeight: 42, padding: '0 30px', minWidth: 124 },
        nameCss: 'font-size:15px;font-weight:500;letter-spacing:.2em;text-indent:.2em;',
        textCss: `letter-spacing:.06em;${halo('#f6f1eb', 3)}`,
    }),
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: Object.freeze({
        dialog: { height: 191, left: 90, right: 89 },
        text: { top: 24, speakerTop: 34, right: 42, bottom: 22, left: 40 },
        plate: { height: 56, left: 56, right: 56, x: 24, rise: 30, lineHeight: 54, padding: '0 58px 0 36px', minWidth: 168 },
        nameCss: 'font-size:18px;font-weight:700;letter-spacing:.24em;',
        textCss: `letter-spacing:.04em;${halo('#efe9dd', 3)}`,
    }),
    [DIALOG_SKIN_CUTE_PINK]: Object.freeze({
        dialog: { height: 215, left: 120, right: 145 },
        text: { top: 34, speakerTop: 38, right: 54, bottom: 34, left: 50 },
        plate: { height: 58, left: 34, right: 85, x: 30, rise: 32, lineHeight: 52, padding: '0 46px 0 40px', minWidth: 156 },
        nameCss: 'font-size:17px;font-weight:700;letter-spacing:.14em;text-shadow:0 1px 0 #c24a6f,0 -1px 0 rgba(255,255,255,.35);',
        textCss: `letter-spacing:.05em;${halo('rgba(255,255,255,.95)', 4)}`,
    }),
    // messgeframe_01 按 0.9 缩放（236→212），纸面上沿约在 y=32。正文从上沿下方直接起排，
    // 压在两侧花簇上，靠纸色光晕保持可读；姓名牌骑在上沿，窄屏整体缩到 0.66。
    [DIALOG_SKIN_RETRO_JAPANESE]: Object.freeze({
        dialog: { height: 212, left: 180, right: 171 },
        text: { top: 44, speakerTop: 48, right: 64, bottom: 30, left: 58 },
        plate: { height: 42, left: 21, right: 21, x: 150, rise: 14, lineHeight: 42, padding: '0 36px', minWidth: 150 },
        nameCss: 'font-size:16px;font-weight:600;letter-spacing:.24em;text-indent:.24em;',
        textCss: `letter-spacing:.06em;${halo('#f5ead3', 5)}`,
        compact: Object.freeze({
            dialog: { height: 156, left: 132, right: 125 },
            text: { top: 32, speakerTop: 36, right: 40, bottom: 20, left: 36 },
            plate: { height: 34, left: 17, right: 17, x: 104, rise: 11, lineHeight: 34, padding: '0 26px', minWidth: 112 },
            nameCss: 'font-size:14px;font-weight:600;letter-spacing:.2em;text-indent:.2em;',
            textCss: `letter-spacing:.04em;${halo('#f5ead3', 4)}`,
        }),
    }),
    [DIALOG_SKIN_ADVENTURE_JOURNEY]: Object.freeze({
        dialog: { height: 170, left: 48, right: 48 },
        text: { top: 26, speakerTop: 34, right: 44, bottom: 20, left: 44 },
        plate: { height: 50, left: 41, right: 41, x: 34, rise: 26, lineHeight: 50, padding: '0 50px', minWidth: 176 },
        nameCss: 'font-size:16px;font-weight:600;letter-spacing:.2em;text-indent:.2em;',
        textCss: `letter-spacing:.05em;${halo('#e6dccb', 3)}`,
    }),
});

function px(value) {
    return `${value}px`;
}

export function buildSlicedDialogSkinCss(skin, spec, assets) {
    const { dialog, text, plate } = spec;
    const dialogSize = [px(dialog.left), `calc(100% - ${dialog.left + dialog.right}px)`, px(dialog.right)]
        .map((width) => `${width} ${px(dialog.height)}`).join(',');
    const plateSize = [px(plate.left), `calc(100% - ${plate.left + plate.right}px)`, px(plate.right)]
        .map((width) => `${width} ${px(plate.height)}`).join(',');
    return buildDialogFrameCss(skin, {
        height: dialog.height,
        text,
        rise: plate.rise,
        frameCss: `background-color:transparent;background-image:url("${assets.dialogLeft}"),url("${assets.dialogCenter}"),url("${assets.dialogRight}");background-position:left top,${px(dialog.left)} top,right top;background-size:${dialogSize};background-repeat:no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:${px(plate.x)};top:${px(-plate.rise)};width:max-content;min-width:${px(plate.minWidth)};max-width:calc(100% - ${px(plate.x * 2)});height:${px(plate.height)};line-height:${px(plate.lineHeight)};margin:0;padding:${plate.padding};background-color:transparent;background-image:url("${assets.nameLeft}"),url("${assets.nameCenter}"),url("${assets.nameRight}");background-position:left top,${px(plate.left)} top,right top;background-size:${plateSize};background-repeat:no-repeat;border:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${spec.nameCss || ''}`,
        textCss: spec.textCss || '',
    });
}

export const ILLUSTRATED_DIALOG_STYLE_TEXT = SLICED_DIALOG_SKINS
    .map((skin) => {
        const spec = ILLUSTRATED_DIALOG_SPECS[skin];
        const css = buildSlicedDialogSkinCss(skin, spec, DIALOG_THEME_ASSETS[skin]);
        if (!spec.compact) return css;
        return `${css}\n@media (max-width:640px){\n${buildSlicedDialogSkinCss(skin, spec.compact, DIALOG_THEME_ASSETS[skin])}\n}`;
    })
    .concat(CSS_DIALOG_STYLE_TEXT)
    .join('\n');
