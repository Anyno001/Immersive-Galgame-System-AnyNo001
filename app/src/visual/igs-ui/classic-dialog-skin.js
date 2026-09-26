import { CLASSIC_DIALOG_ASSETS } from './classic-dialog-assets.js';
import { DIALOG_SKIN_GRADIENT_VEIL } from './gradient-veil-dialog-skin.js';
import {
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_PLANT_COFFEE,
    ILLUSTRATED_DIALOG_SKINS,
    ILLUSTRATED_DIALOG_STYLE_TEXT,
    buildSlicedDialogSkinCss,
    isIllustratedDialogSkin,
} from './dialog-theme-skins.js';

export const DIALOG_SKIN_DEFAULT = 'default';
export const DIALOG_SKIN_WESTERN_CLASSIC = 'western-classic';
export { DIALOG_SKIN_GRADIENT_VEIL };
export {
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_PLANT_COFFEE,
    ILLUSTRATED_DIALOG_SKINS,
    ILLUSTRATED_DIALOG_STYLE_TEXT,
    isIllustratedDialogSkin,
};
export const CLASSIC_DIALOG_HEIGHT = 184;
export const CLASSIC_DIALOG_EDGE_WIDTH = 110;
export const CLASSIC_DIALOG_WIDTH_PERCENT_MIN = 60;
export const CLASSIC_DIALOG_WIDTH_PERCENT_MAX = 100;
export const CLASSIC_DIALOG_WIDTH_PERCENT_DEFAULT = 100;
export const CLASSIC_NAMEPLATE_HEIGHT = 52;
export const CLASSIC_NAMEPLATE_EDGE_WIDTH = 50;
export const CLASSIC_NAMEPLATE_LEFT = 60;
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
    thoughtFont: '"Cormorant Garamond","Source Han Serif CN",serif',
    narrationFont: 'inherit',
    nameColor: '#312b1b',
    textColor: '#f2e5c4',
    thoughtColor: '#6b5146',
    narrationColor: '#e6dcc3',
    dividerColor: '#ffeeb8',
});

export function normalizeDialogSkin(value) {
    if (value === DIALOG_SKIN_WESTERN_CLASSIC) return DIALOG_SKIN_WESTERN_CLASSIC;
    if (value === DIALOG_SKIN_GRADIENT_VEIL) return DIALOG_SKIN_GRADIENT_VEIL;
    if (isIllustratedDialogSkin(value)) return value;
    return DIALOG_SKIN_DEFAULT;
}

export function normalizeClassicDialogWidthPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return CLASSIC_DIALOG_WIDTH_PERCENT_DEFAULT;
    return Math.max(CLASSIC_DIALOG_WIDTH_PERCENT_MIN, Math.min(CLASSIC_DIALOG_WIDTH_PERCENT_MAX, numeric));
}

export function isClassicDialogSkin(readerSettings) {
    return normalizeDialogSkin(readerSettings && readerSettings.dialogSkin) === DIALOG_SKIN_WESTERN_CLASSIC;
}

export function isGradientVeilDialogSkin(readerSettings) {
    return normalizeDialogSkin(readerSettings && readerSettings.dialogSkin) === DIALOG_SKIN_GRADIENT_VEIL;
}

export function isMaterialDialogSkin(readerSettings) {
    const skin = normalizeDialogSkin(readerSettings && readerSettings.dialogSkin);
    return skin === DIALOG_SKIN_WESTERN_CLASSIC || isIllustratedDialogSkin(skin);
}

export function applyDialogSkinAssets(dialog, readerSettings) {
    if (!dialog) return;
    const skin = normalizeDialogSkin(readerSettings && readerSettings.dialogSkin);
    if (skin !== DIALOG_SKIN_WESTERN_CLASSIC && skin !== DIALOG_SKIN_GRADIENT_VEIL && !isIllustratedDialogSkin(skin)) {
        if (typeof dialog.removeAttribute === 'function') dialog.removeAttribute('data-igs-dialog-skin');
        else if (typeof dialog.setAttribute === 'function') dialog.setAttribute('data-igs-dialog-skin', '');
        return;
    }
    dialog.setAttribute('data-igs-dialog-skin', skin);
}

// 姓名牌素材 65×68，可见牌面在上方 0–57px；按 52px 高等比缩放后两端 50px，牌面约 44px。
export const CLASSIC_DIALOG_SPEC = Object.freeze({
    dialog: { height: CLASSIC_DIALOG_HEIGHT, left: CLASSIC_DIALOG_EDGE_WIDTH, right: CLASSIC_DIALOG_EDGE_WIDTH },
    text: { top: 26, speakerTop: 38, right: 50, bottom: 22, left: 50 },
    plate: { height: CLASSIC_NAMEPLATE_HEIGHT, left: CLASSIC_NAMEPLATE_EDGE_WIDTH, right: CLASSIC_NAMEPLATE_EDGE_WIDTH, x: CLASSIC_NAMEPLATE_LEFT, rise: -CLASSIC_NAMEPLATE_TOP, lineHeight: 44, padding: '0 42px', minWidth: 150 },
    nameCss: 'font-size:15px;font-weight:600;letter-spacing:.22em;text-indent:.22em;text-shadow:0 1px 0 rgba(255,236,190,.42);',
    textCss: 'letter-spacing:.06em;',
});

export const CLASSIC_DIALOG_STYLE_TEXT = buildSlicedDialogSkinCss(DIALOG_SKIN_WESTERN_CLASSIC, CLASSIC_DIALOG_SPEC, CLASSIC_DIALOG_ASSETS);
