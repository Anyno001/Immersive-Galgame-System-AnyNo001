import { CLASSIC_DIALOG_ASSETS } from './classic-dialog-assets.js';

export const DIALOG_SKIN_DEFAULT = 'default';
export const DIALOG_SKIN_WESTERN_CLASSIC = 'western-classic';
export const CLASSIC_DIALOG_HEIGHT = 184;
export const CLASSIC_DIALOG_EDGE_WIDTH = 110;
export const CLASSIC_DIALOG_WIDTH_PERCENT_MIN = 60;
export const CLASSIC_DIALOG_WIDTH_PERCENT_MAX = 100;
export const CLASSIC_DIALOG_WIDTH_PERCENT_DEFAULT = 100;
export const CLASSIC_NAMEPLATE_HEIGHT = 50;
export const CLASSIC_NAMEPLATE_EDGE_WIDTH = 40;
export const CLASSIC_NAMEPLATE_WIDTH = 300;
export const CLASSIC_NAMEPLATE_LEFT = 35;
export const CLASSIC_NAMEPLATE_TOP = -22;

export const CLASSIC_DIALOG_THEME_DEFAULTS = Object.freeze({
    preset: 'custom',
    nameAlign: 'center',
    textAlign: 'left',
    narrationAlign: 'left',
    thoughtAlign: 'left',
    dividerSymbol: 'none',
    nameFont: 'inherit',
    textFont: 'inherit',
    thoughtFont: 'inherit',
    narrationFont: 'inherit',
    nameColor: '#312b1b',
    textColor: '#f2e5c4',
    thoughtColor: '#c7c4b2',
    narrationColor: '#e6dcc3',
    dividerColor: '#ffeeb8',
});

export function normalizeDialogSkin(value) {
    return value === DIALOG_SKIN_WESTERN_CLASSIC ? DIALOG_SKIN_WESTERN_CLASSIC : DIALOG_SKIN_DEFAULT;
}

export function normalizeClassicDialogWidthPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return CLASSIC_DIALOG_WIDTH_PERCENT_DEFAULT;
    return Math.max(CLASSIC_DIALOG_WIDTH_PERCENT_MIN, Math.min(CLASSIC_DIALOG_WIDTH_PERCENT_MAX, numeric));
}

export function isClassicDialogSkin(readerSettings) {
    return normalizeDialogSkin(readerSettings && readerSettings.dialogSkin) === DIALOG_SKIN_WESTERN_CLASSIC;
}

export function applyDialogSkinAssets(dialog, readerSettings) {
    if (!dialog) return;
    if (!isClassicDialogSkin(readerSettings)) {
        if (typeof dialog.removeAttribute === 'function') dialog.removeAttribute('data-igs-dialog-skin');
        else if (typeof dialog.setAttribute === 'function') dialog.setAttribute('data-igs-dialog-skin', '');
        return;
    }
    dialog.setAttribute('data-igs-dialog-skin', DIALOG_SKIN_WESTERN_CLASSIC);
}

export const CLASSIC_DIALOG_STYLE_TEXT = `
#igs-overlay .igs-dialog[data-igs-dialog-skin="western-classic"]{box-sizing:border-box;height:184px;min-height:184px;max-height:184px;display:flex;flex-direction:column;overflow:visible;padding:20px 44px 18px;background-color:transparent;background-image:url("${CLASSIC_DIALOG_ASSETS.dialogLeft}"),url("${CLASSIC_DIALOG_ASSETS.dialogCenter}"),url("${CLASSIC_DIALOG_ASSETS.dialogRight}");background-position:left top,110px top,right top;background-size:110px 184px,calc(100% - 220px) 184px,110px 184px;background-repeat:no-repeat;border-radius:0;-webkit-backdrop-filter:none;backdrop-filter:none;}
.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-progress,.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-speaker,.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-divider,.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-controls{flex-shrink:0;}
.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-text{min-height:0;overflow-y:auto;flex:1 1 auto;}
.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-speaker{position:absolute;z-index:2;box-sizing:border-box;left:35px;top:-22px;width:min(300px,calc(100% - 70px));height:50px;line-height:49px;margin:0;padding:1px 36px 0;font-size:13px;font-weight:600;letter-spacing:.5px;-webkit-text-stroke:.6px rgba(255,255,255,.78);paint-order:stroke fill;text-shadow:0 1px 0 rgba(255,255,255,.32);background-color:transparent;background-image:url("${CLASSIC_DIALOG_ASSETS.nameLeft}"),url("${CLASSIC_DIALOG_ASSETS.nameCenter}"),url("${CLASSIC_DIALOG_ASSETS.nameRight}");background-position:left top,40px top,right top;background-size:40px 50px,calc(100% - 80px) 50px,40px 50px;background-repeat:no-repeat;}
.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-divider{display:none;}
#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="western-classic"]{height:min(184px,calc(100% - 28px));min-height:min(184px,calc(100% - 28px));max-height:calc(100% - 28px);padding:20px 44px 18px;}
#igs-overlay .igs-dialog[data-igs-dialog-skin="western-classic"][data-igs-has-speaker="1"]{padding-top:44px;}
`.trim();
