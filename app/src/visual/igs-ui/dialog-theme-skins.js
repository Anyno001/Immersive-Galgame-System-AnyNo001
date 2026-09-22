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

const DIALOG_THEME_ASSETS = Object.freeze({
    [DIALOG_SKIN_PLANT_COFFEE]: Object.freeze({
        'dialog-left': '__IGS_ASSET__plant-coffee/dialog-left.png__',
        'dialog-center': '__IGS_ASSET__plant-coffee/dialog-center.png__',
        'dialog-right': '__IGS_ASSET__plant-coffee/dialog-right.png__',
        'name-left': '__IGS_ASSET__plant-coffee/name-left.png__',
        'name-center': '__IGS_ASSET__plant-coffee/name-center.png__',
        'name-right': '__IGS_ASSET__plant-coffee/name-right.png__',
    }),
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: Object.freeze({
        'dialog-left': '__IGS_ASSET__black-white-manga/dialog-left.png__',
        'dialog-center': '__IGS_ASSET__black-white-manga/dialog-center.png__',
        'dialog-right': '__IGS_ASSET__black-white-manga/dialog-right.png__',
        'name-left': '__IGS_ASSET__black-white-manga/name-left.png__',
        'name-center': '__IGS_ASSET__black-white-manga/name-center.png__',
        'name-right': '__IGS_ASSET__black-white-manga/name-right.png__',
    }),
    [DIALOG_SKIN_CUTE_PINK]: Object.freeze({
        'dialog-left': '__IGS_ASSET__cute-pink/dialog-left.png__',
        'dialog-center': '__IGS_ASSET__cute-pink/dialog-center.png__',
        'dialog-right': '__IGS_ASSET__cute-pink/dialog-right.png__',
        'name-left': '__IGS_ASSET__cute-pink/name-left.png__',
        'name-center': '__IGS_ASSET__cute-pink/name-center.png__',
        'name-right': '__IGS_ASSET__cute-pink/name-right.png__',
    }),
});

function asset(theme, part) {
    return DIALOG_THEME_ASSETS[theme][part];
}

const PLANT = DIALOG_SKIN_PLANT_COFFEE;
const MANGA = DIALOG_SKIN_BLACK_WHITE_MANGA;
const CUTE = DIALOG_SKIN_CUTE_PINK;

export const ILLUSTRATED_DIALOG_STYLE_TEXT = `
#igs-overlay .igs-dialog[data-igs-dialog-skin="${PLANT}"]{box-sizing:border-box;height:177px;min-height:177px;max-height:177px;display:flex;flex-direction:column;overflow:visible;padding:16px 42px 16px;background-color:transparent;background-image:url("${asset(PLANT,'dialog-left')}"),url("${asset(PLANT,'dialog-center')}"),url("${asset(PLANT,'dialog-right')}");background-position:left top,130px top,right top;background-size:130px 177px,calc(100% - 260px) 177px,130px 177px;background-repeat:no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${PLANT}"] .igs-progress,#igs-overlay .igs-dialog[data-igs-dialog-skin="${PLANT}"] .igs-speaker,#igs-overlay .igs-dialog[data-igs-dialog-skin="${PLANT}"] .igs-divider,#igs-overlay .igs-dialog[data-igs-dialog-skin="${PLANT}"] .igs-controls{flex-shrink:0;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${PLANT}"] .igs-text{min-height:0;overflow-y:auto;flex:1 1 auto;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${PLANT}"] .igs-speaker{position:absolute;z-index:2;box-sizing:border-box;left:35px;top:-16px;width:min(400px,calc(100% - 70px));height:47px;line-height:46px;margin:0;padding:1px 28px 0;font-size:13px;font-weight:600;letter-spacing:.5px;background:transparent url("${asset(PLANT,'name-left')}") left top/35px 47px no-repeat;border:0;text-shadow:none;background-image:url("${asset(PLANT,'name-left')}"),url("${asset(PLANT,'name-center')}"),url("${asset(PLANT,'name-right')}");background-position:left top,35px top,right top;background-size:35px 47px,calc(100% - 70px) 47px,35px 47px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${PLANT}"][data-igs-has-speaker="1"]{padding-top:39px;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${PLANT}"] .igs-divider{display:none;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${MANGA}"]{box-sizing:border-box;height:191px;min-height:191px;max-height:191px;display:flex;flex-direction:column;overflow:visible;padding:18px 40px 18px;background-color:transparent;background-image:url("${asset(MANGA,'dialog-left')}"),url("${asset(MANGA,'dialog-center')}"),url("${asset(MANGA,'dialog-right')}");background-position:left top,90px top,right top;background-size:90px 191px,calc(100% - 179px) 191px,89px 191px;background-repeat:no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${MANGA}"] .igs-progress,#igs-overlay .igs-dialog[data-igs-dialog-skin="${MANGA}"] .igs-speaker,#igs-overlay .igs-dialog[data-igs-dialog-skin="${MANGA}"] .igs-divider,#igs-overlay .igs-dialog[data-igs-dialog-skin="${MANGA}"] .igs-controls{flex-shrink:0;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${MANGA}"] .igs-text{min-height:0;overflow-y:auto;flex:1 1 auto;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${MANGA}"] .igs-speaker{position:absolute;z-index:2;box-sizing:border-box;left:40px;top:-24px;width:min(460px,calc(100% - 80px));height:68px;line-height:67px;margin:0;padding:1px 42px 0;font-size:13px;font-weight:600;letter-spacing:.5px;background-image:url("${asset(MANGA,'name-left')}"),url("${asset(MANGA,'name-center')}"),url("${asset(MANGA,'name-right')}");background-position:left top,68px top,right top;background-size:68px 68px,calc(100% - 136px) 68px,68px 68px;background-repeat:no-repeat;color:#241b19;text-shadow:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${MANGA}"][data-igs-has-speaker="1"]{padding-top:58px;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${MANGA}"] .igs-divider{display:none;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${CUTE}"]{box-sizing:border-box;height:215px;min-height:215px;max-height:215px;display:flex;flex-direction:column;overflow:visible;padding:20px 44px 18px;background-color:transparent;background-image:url("${asset(CUTE,'dialog-left')}"),url("${asset(CUTE,'dialog-center')}"),url("${asset(CUTE,'dialog-right')}");background-position:left top,120px top,right top;background-size:120px 215px,calc(100% - 265px) 215px,145px 215px;background-repeat:no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${CUTE}"] .igs-progress,#igs-overlay .igs-dialog[data-igs-dialog-skin="${CUTE}"] .igs-speaker,#igs-overlay .igs-dialog[data-igs-dialog-skin="${CUTE}"] .igs-divider,#igs-overlay .igs-dialog[data-igs-dialog-skin="${CUTE}"] .igs-controls{flex-shrink:0;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${CUTE}"] .igs-text{min-height:0;overflow-y:auto;flex:1 1 auto;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${CUTE}"] .igs-speaker{position:absolute;z-index:2;box-sizing:border-box;left:35px;top:-24px;width:min(430px,calc(100% - 70px));height:68px;line-height:67px;margin:0;padding:1px 42px 0;font-size:13px;font-weight:600;letter-spacing:.5px;color:#5d4554;text-shadow:none;background-image:url("${asset(CUTE,'name-left')}"),url("${asset(CUTE,'name-center')}"),url("${asset(CUTE,'name-right')}");background-position:left top,40px top,right top;background-size:40px 68px,calc(100% - 140px) 68px,100px 68px;background-repeat:no-repeat;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${CUTE}"][data-igs-has-speaker="1"]{padding-top:58px;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="${CUTE}"] .igs-divider{display:none;}
#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="${PLANT}"]{height:min(177px,calc(100% - 28px));min-height:min(177px,calc(100% - 28px));max-height:calc(100% - 28px);}
#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="${MANGA}"]{height:min(191px,calc(100% - 28px));min-height:min(191px,calc(100% - 28px));max-height:calc(100% - 28px);}
#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="${CUTE}"]{height:min(215px,calc(100% - 28px));min-height:min(215px,calc(100% - 28px));max-height:calc(100% - 28px);}
`.trim();
