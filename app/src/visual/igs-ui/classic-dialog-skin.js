import { CLASSIC_DIALOG_ASSETS } from './classic-dialog-assets.js';

export const DIALOG_SKIN_DEFAULT = 'default';
export const DIALOG_SKIN_WESTERN_CLASSIC = 'western-classic';
export const CLASSIC_DIALOG_HEIGHT = 184;
export const CLASSIC_DIALOG_EDGE_WIDTH = 110;
export const CLASSIC_NAMEPLATE_HEIGHT = 34;
export const CLASSIC_NAMEPLATE_EDGE_WIDTH = 32.5;
export const CLASSIC_NAMEPLATE_WIDTH = 187;

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
#igs-overlay .igs-dialog[data-igs-dialog-skin="western-classic"]{box-sizing:border-box;height:184px;min-height:184px;max-height:184px;display:flex;flex-direction:column;overflow:hidden;padding:20px 44px 18px;background-color:transparent;background-image:url("${CLASSIC_DIALOG_ASSETS.dialogLeft}"),url("${CLASSIC_DIALOG_ASSETS.dialogCenter}"),url("${CLASSIC_DIALOG_ASSETS.dialogRight}");background-position:left top,110px top,right top;background-size:110px 184px,calc(100% - 220px) 184px,110px 184px;background-repeat:no-repeat;border-radius:0;-webkit-backdrop-filter:none;backdrop-filter:none;}
.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-progress,.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-speaker,.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-divider,.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-controls{flex-shrink:0;}
.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-text{min-height:0;overflow-y:auto;flex:1 1 auto;}
.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-speaker{box-sizing:border-box;width:187px;height:34px;line-height:34px;margin:-8px 0 4px -20px;padding:0 22px;background-color:transparent;background-image:url("${CLASSIC_DIALOG_ASSETS.nameLeft}"),url("${CLASSIC_DIALOG_ASSETS.nameCenter}"),url("${CLASSIC_DIALOG_ASSETS.nameRight}");background-position:left top,32.5px top,right top;background-size:32.5px 34px,calc(100% - 65px) 34px,32.5px 34px;background-repeat:no-repeat;}
.igs-dialog[data-igs-dialog-skin="western-classic"] .igs-divider{display:none;}
#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="western-classic"]{height:min(184px,calc(100% - 28px));min-height:min(184px,calc(100% - 28px));max-height:calc(100% - 28px);padding:20px 44px 18px;}
`.trim();
