export const DIALOG_SKIN_PLANT_COFFEE = 'plant-coffee';
export const DIALOG_SKIN_BLACK_WHITE_MANGA = 'black-white-manga';
export const DIALOG_SKIN_CUTE_PINK = 'cute-pink';

export const ILLUSTRATED_DIALOG_SKINS = Object.freeze([
    DIALOG_SKIN_PLANT_COFFEE,
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
]);

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
});

// 三片素材皮肤的几何全部来自素材实测：dialog 为原始高度与左右端宽度，
// plate 为姓名牌缩放后的高度与两端宽度（保持素材宽高比），text 为正文安全区内距。
// rise 是姓名牌高出对话框顶边的距离，供选项气泡避让。
export const ILLUSTRATED_DIALOG_SPECS = Object.freeze({
    [DIALOG_SKIN_PLANT_COFFEE]: Object.freeze({
        dialog: { height: 177, left: 130, right: 130 },
        text: { top: 30, speakerTop: 42, right: 56, bottom: 24, left: 52 },
        plate: { height: 42, left: 31, right: 31, x: 62, rise: 12, lineHeight: 42, padding: '0 30px', minWidth: 124 },
        nameCss: 'font-size:15px;font-weight:500;letter-spacing:.2em;text-indent:.2em;',
        textCss: '--igs-skin-text-scale:.96;letter-spacing:.06em;',
    }),
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: Object.freeze({
        dialog: { height: 191, left: 90, right: 89 },
        text: { top: 30, speakerTop: 40, right: 62, bottom: 28, left: 64 },
        plate: { height: 56, left: 56, right: 56, x: 24, rise: 30, lineHeight: 54, padding: '0 58px 0 36px', minWidth: 168 },
        nameCss: 'font-size:18px;font-weight:700;letter-spacing:.24em;',
        textCss: 'letter-spacing:.04em;',
    }),
    [DIALOG_SKIN_CUTE_PINK]: Object.freeze({
        dialog: { height: 215, left: 120, right: 145 },
        text: { top: 46, speakerTop: 46, right: 70, bottom: 38, left: 78 },
        plate: { height: 58, left: 34, right: 85, x: 30, rise: 32, lineHeight: 52, padding: '0 46px 0 40px', minWidth: 156 },
        nameCss: 'font-size:17px;font-weight:700;letter-spacing:.14em;text-shadow:0 1px 0 #c24a6f,0 -1px 0 rgba(255,255,255,.35);',
        textCss: '--igs-skin-text-scale:.97;letter-spacing:.05em;',
    }),
});

function px(value) {
    return `${value}px`;
}

export function buildSlicedDialogSkinCss(skin, spec, assets) {
    const { dialog, text, plate } = spec;
    const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${skin}"]`;
    const dialogSize = [px(dialog.left), `calc(100% - ${dialog.left + dialog.right}px)`, px(dialog.right)]
        .map((width) => `${width} ${px(dialog.height)}`).join(',');
    const plateSize = [px(plate.left), `calc(100% - ${plate.left + plate.right}px)`, px(plate.right)]
        .map((width) => `${width} ${px(plate.height)}`).join(',');
    const padding = (top) => `padding:${px(top)} ${px(text.right)} ${px(text.bottom)} ${px(text.left)};`;
    return [
        `${scope}{box-sizing:border-box;height:${px(dialog.height)};min-height:${px(dialog.height)};max-height:${px(dialog.height)};display:flex;flex-direction:column;overflow:visible;${padding(text.top)}background-color:transparent;background-image:url("${assets.dialogLeft}"),url("${assets.dialogCenter}"),url("${assets.dialogRight}");background-position:left top,${px(dialog.left)} top,right top;background-size:${dialogSize};background-repeat:no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}`,
        `${scope}[data-igs-has-speaker="1"]{${padding(text.speakerTop)}}`,
        `${scope} .igs-progress,${scope} .igs-speaker,${scope} .igs-divider,${scope} .igs-controls{flex-shrink:0;}`,
        `${scope} .igs-divider{display:none;}`,
        `${scope} .igs-text{min-height:0;margin:0;overflow-y:auto;flex:1 1 auto;text-shadow:none;${spec.textCss || ''}}`,
        `${scope} .igs-speaker{position:absolute;z-index:2;box-sizing:border-box;left:${px(plate.x)};top:${px(-plate.rise)};width:max-content;min-width:${px(plate.minWidth)};max-width:calc(100% - ${px(plate.x * 2)});height:${px(plate.height)};line-height:${px(plate.lineHeight)};margin:0;padding:${plate.padding};background-color:transparent;background-image:url("${assets.nameLeft}"),url("${assets.nameCenter}"),url("${assets.nameRight}");background-position:left top,${px(plate.left)} top,right top;background-size:${plateSize};background-repeat:no-repeat;border:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${spec.nameCss || ''}}`,
        `#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="${skin}"]{height:min(${px(dialog.height)},calc(100% - 28px));min-height:min(${px(dialog.height)},calc(100% - 28px));max-height:calc(100% - 28px);}`,
        `#igs-overlay[data-igs-dialog-skin="${skin}"]{--igs-skin-plate-rise:${px(plate.rise)};}`,
    ].join('\n');
}

export const ILLUSTRATED_DIALOG_STYLE_TEXT = ILLUSTRATED_DIALOG_SKINS
    .map((skin) => buildSlicedDialogSkinCss(skin, ILLUSTRATED_DIALOG_SPECS[skin], DIALOG_THEME_ASSETS[skin]))
    .join('\n');
