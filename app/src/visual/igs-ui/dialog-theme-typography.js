export const DIALOG_FONT_SERIF = '"Source Han Serif CN","Noto Serif CJK SC","Songti SC",serif';
export const DIALOG_FONT_ROUNDED = '"IGS Rounded","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
export const DIALOG_FONT_CLASSIC_DISPLAY = '"Cormorant Garamond","Source Han Serif CN",serif';

// 素材主题的默认排版；用户在主题页改过的值仍优先（见 settings-normalize 的 applyReferenceTypographyDefaults）。
const REFERENCE_DIALOG_TYPOGRAPHY = Object.freeze({
    'western-classic': Object.freeze({
        nameAlign: 'center',
        nameFont: DIALOG_FONT_CLASSIC_DISPLAY,
        textFont: DIALOG_FONT_SERIF,
        narrationFont: DIALOG_FONT_SERIF,
        thoughtFont: DIALOG_FONT_SERIF,
        nameColor: '#2e2218',
        textColor: '#f2e5c4',
        thoughtColor: '#c9b98f',
        narrationColor: '#ddd3b8',
    }),
    'plant-coffee': Object.freeze({
        nameAlign: 'center',
        nameFont: DIALOG_FONT_ROUNDED,
        textFont: DIALOG_FONT_ROUNDED,
        narrationFont: DIALOG_FONT_ROUNDED,
        thoughtFont: DIALOG_FONT_ROUNDED,
        nameColor: '#f6ecd9',
        textColor: '#5b4643',
        thoughtColor: '#7f8a55',
        narrationColor: '#7a6660',
    }),
    // 漫画惯例：对白用黑体，旁白框用明朝（宋体）。
    'black-white-manga': Object.freeze({
        nameAlign: 'left',
        nameFont: DIALOG_FONT_SANS,
        textFont: DIALOG_FONT_SANS,
        narrationFont: DIALOG_FONT_SERIF,
        thoughtFont: DIALOG_FONT_SANS,
        nameColor: '#171412',
        textColor: '#231f1c',
        thoughtColor: '#5e5750',
        narrationColor: '#2f2925',
    }),
    'cute-pink': Object.freeze({
        nameAlign: 'center',
        nameFont: DIALOG_FONT_ROUNDED,
        textFont: DIALOG_FONT_ROUNDED,
        narrationFont: DIALOG_FONT_ROUNDED,
        thoughtFont: DIALOG_FONT_ROUNDED,
        nameColor: '#ffffff',
        textColor: '#5d3a4a',
        thoughtColor: '#c65f86',
        narrationColor: '#7d6070',
    }),
});

export function getReferenceDialogTypography(dialogSkin) {
    return REFERENCE_DIALOG_TYPOGRAPHY[dialogSkin] || null;
}
