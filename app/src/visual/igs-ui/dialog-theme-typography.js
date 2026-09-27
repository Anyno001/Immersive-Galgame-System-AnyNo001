export const DIALOG_FONT_SERIF = '"Source Han Serif CN","Noto Serif CJK SC","Songti SC",serif';
export const DIALOG_FONT_ROUNDED = '"IGS Rounded","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
export const DIALOG_FONT_CLASSIC_DISPLAY = '"Cormorant Garamond","Source Han Serif CN",serif';
export const DIALOG_FONT_WENKAI = '"LXGW WenKai","Source Han Serif CN",serif';
export const DIALOG_FONT_NEO_ZHISONG = '"LXGW Neo ZhiSong","Source Han Serif CN",serif';
export const DIALOG_FONT_NEO_XIHEI = '"LXGW Neo XiHei","Source Han Sans CN","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_SOURCE_HAN_SANS = '"Source Han Sans CN","LXGW Neo XiHei","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_HUIWEN = '"Huiwen Mincho","Source Han Serif CN",serif';
export const DIALOG_FONT_YUYANG = '"Tsanger YuYang","LXGW WenKai",serif';
export const DIALOG_FONT_SMILEY = '"Smiley Sans","Source Han Sans CN","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_ZCOOL_KUAILE = '"ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_CINZEL = '"Cinzel","LXGW Neo ZhiSong","Source Han Serif CN",serif';
export const DIALOG_FONT_CORMORANT = '"Cormorant Garamond","LXGW Neo ZhiSong","Source Han Serif CN",serif';
export const DIALOG_FONT_GREAT_VIBES = '"Great Vibes","Pinyon Script","Source Han Serif CN",serif';
export const DIALOG_FONT_QUICKSAND = '"Quicksand","Caveat","Tsanger YuYang",sans-serif';
export const DIALOG_FONT_IM_FELL = '"IM Fell English SC","Cinzel","Source Han Serif CN",serif';

// 素材主题的默认排版；用户在主题页改过的值仍优先（见 settings-normalize 的 applyReferenceTypographyDefaults）。
const REFERENCE_DIALOG_TYPOGRAPHY = Object.freeze({
    'western-classic': Object.freeze({
        nameAlign: 'center',
        nameFont: DIALOG_FONT_CINZEL,
        textFont: DIALOG_FONT_SERIF,
        thoughtFont: DIALOG_FONT_SERIF,
        narrationFont: DIALOG_FONT_SERIF,
        nameColor: '#2e2218',
        textColor: '#f2e5c4',
        thoughtColor: '#c9b98f',
        narrationColor: '#ddd3b8',
    }),
    'plant-coffee': Object.freeze({
        nameAlign: 'center',
        nameFont: DIALOG_FONT_QUICKSAND,
        textFont: DIALOG_FONT_YUYANG,
        thoughtFont: DIALOG_FONT_YUYANG,
        narrationFont: DIALOG_FONT_YUYANG,
        nameColor: '#f6ecd9',
        textColor: '#5b4643',
        thoughtColor: '#7f8a55',
        narrationColor: '#7a6660',
    }),
    'black-white-manga': Object.freeze({
        nameAlign: 'left',
        nameFont: DIALOG_FONT_SMILEY,
        textFont: DIALOG_FONT_SOURCE_HAN_SANS,
        thoughtFont: DIALOG_FONT_SOURCE_HAN_SANS,
        narrationFont: DIALOG_FONT_SOURCE_HAN_SANS,
        nameColor: '#171412',
        textColor: '#231f1c',
        thoughtColor: '#5e5750',
        narrationColor: '#2f2925',
    }),
    'cute-pink': Object.freeze({
        nameAlign: 'center',
        nameFont: DIALOG_FONT_ZCOOL_KUAILE,
       textFont: DIALOG_FONT_ROUNDED,
        thoughtFont: DIALOG_FONT_ROUNDED,
        narrationFont: DIALOG_FONT_ROUNDED,
        nameColor: '#ffffff',
        textColor: '#5d3a4a',
        thoughtColor: '#c65f86',
        narrationColor: '#7d6070',
    }),
    'retro-japanese': Object.freeze({
        nameAlign: 'center',
        nameFont: DIALOG_FONT_HUIWEN,
        textFont: DIALOG_FONT_WENKAI,
        thoughtFont: DIALOG_FONT_WENKAI,
        narrationFont: DIALOG_FONT_WENKAI,
        nameColor: '#f6e6c4',
        textColor: '#46322a',
        thoughtColor: '#2f6e58',
        narrationColor: '#6b5645',
    }),
    'adventure-journey': Object.freeze({
        nameAlign: 'center',
        nameFont: DIALOG_FONT_CINZEL,
        textFont: DIALOG_FONT_NEO_ZHISONG,
        thoughtFont: DIALOG_FONT_NEO_ZHISONG,
        narrationFont: DIALOG_FONT_NEO_ZHISONG,
        nameColor: '#f0dcb8',
        textColor: '#45372d',
        thoughtColor: '#9a6a2c',
        narrationColor: '#6c5b4d',
    }),
    'day-minimal': Object.freeze({
        nameAlign: 'left',
        nameFont: DIALOG_FONT_CORMORANT,
        textFont: DIALOG_FONT_NEO_XIHEI,
        thoughtFont: DIALOG_FONT_NEO_XIHEI,
        narrationFont: DIALOG_FONT_NEO_XIHEI,
        nameColor: '#f7f5ee',
        textColor: '#3a3935',
        thoughtColor: '#b0503f',
        narrationColor: '#5f5d55',
    }),
    'warm-picturebook': Object.freeze({
        nameAlign: 'center',
        nameFont: DIALOG_FONT_YUYANG,
        textFont: DIALOG_FONT_WENKAI,
        thoughtFont: DIALOG_FONT_WENKAI,
        narrationFont: DIALOG_FONT_WENKAI,
        nameColor: '#f4efe9',
        textColor: '#4f4a45',
        thoughtColor: '#4f9a92',
        narrationColor: '#706861',
    }),
    'elegant-european': Object.freeze({
        nameAlign: 'left',
        nameFont: DIALOG_FONT_GREAT_VIBES,
        textFont: DIALOG_FONT_SERIF,
        thoughtFont: DIALOG_FONT_SERIF,
        narrationFont: DIALOG_FONT_SERIF,
        nameColor: '#ffffff',
        textColor: '#eeeaf3',
        thoughtColor: '#c3b4e6',
        narrationColor: '#d4cfdc',
    }),
});

export function getReferenceDialogTypography(dialogSkin) {
    return REFERENCE_DIALOG_TYPOGRAPHY[dialogSkin] || null;
}
