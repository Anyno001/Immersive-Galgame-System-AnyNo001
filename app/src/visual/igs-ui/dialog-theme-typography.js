export const DIALOG_FONT_SERIF = '"Source Han Serif CN","Noto Serif CJK SC","Songti SC",serif';
export const DIALOG_FONT_ROUNDED = '"IGS Rounded","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
export const DIALOG_FONT_CLASSIC_DISPLAY = '"Cormorant Garamond","Source Han Serif CN",serif';
export const DIALOG_FONT_WENKAI = '"LXGW WenKai","Source Han Serif CN",serif';
export const DIALOG_FONT_WENKAI_LITE = '"LXGW WenKai Lite","LXGW WenKai",serif';
export const DIALOG_FONT_NEO_ZHISONG = '"LXGW Neo ZhiSong","Source Han Serif CN",serif';
export const DIALOG_FONT_NEO_XIHEI = '"LXGW Neo XiHei","Source Han Sans CN","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_SOURCE_HAN_SANS = '"Source Han Sans CN","LXGW Neo XiHei","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_HUIWEN = '"Huiwen Mincho","Source Han Serif CN",serif';
export const DIALOG_FONT_YUYANG = '"Tsanger YuYang","LXGW WenKai",serif';
export const DIALOG_FONT_SMILEY = '"Smiley Sans","Source Han Sans CN","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_ZCOOL_KUAILE = '"ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
export const DIALOG_FONT_YOZAI = '"Yozai","LXGW WenKai",serif';
export const DIALOG_FONT_CINZEL = '"Cinzel","LXGW Neo ZhiSong","Source Han Serif CN",serif';
export const DIALOG_FONT_CORMORANT = '"Cormorant Garamond","LXGW Neo ZhiSong","Source Han Serif CN",serif';
export const DIALOG_FONT_GREAT_VIBES = '"Great Vibes","Pinyon Script","Source Han Serif CN",serif';
export const DIALOG_FONT_PINYON_SCRIPT = '"Pinyon Script","Source Han Serif CN",serif';
export const DIALOG_FONT_QUICKSAND = '"Quicksand","Caveat","Tsanger YuYang",sans-serif';
export const DIALOG_FONT_CAVEAT = '"Caveat","Quicksand","Tsanger YuYang",sans-serif';
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
        textFont: DIALOG_FONT_WENKAI_LITE,
        thoughtFont: DIALOG_FONT_WENKAI_LITE,
        narrationFont: DIALOG_FONT_WENKAI_LITE,
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
        textFont: DIALOG_FONT_YOZAI,
        thoughtFont: DIALOG_FONT_YOZAI,
        narrationFont: DIALOG_FONT_YOZAI,
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
        // 文楷笔画细，原 #46322a 压在纸色与花簇上偏淡；加深到 #2f2119 提高对比。
        textColor: '#2f2119',
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
        nameFont: DIALOG_FONT_YOZAI,
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
    // 魔法星夜：月光银白，内心独白取淡长春花蓝，旁白再淡一层；姓名用纤细的 Cormorant 衬线。
    'magic-academy': Object.freeze({
        nameAlign: 'left',
        nameFont: DIALOG_FONT_CORMORANT,
        textFont: DIALOG_FONT_HUIWEN,
        thoughtFont: DIALOG_FONT_HUIWEN,
        narrationFont: DIALOG_FONT_HUIWEN,
        nameColor: '#f1effb',
        textColor: '#ecebf7',
        thoughtColor: '#b8c3ff',
        narrationColor: '#c9c7dd',
    }),
    // 童话小镇：姓名用圆润的站酷快乐体，正文文楷，心里话转鼠尾草绿；墨色取暖棕，不用纯黑。
    'fairy-tale': Object.freeze({
        nameAlign: 'left',
        nameFont: DIALOG_FONT_ZCOOL_KUAILE,
        textFont: DIALOG_FONT_WENKAI,
        thoughtFont: DIALOG_FONT_WENKAI,
        narrationFont: DIALOG_FONT_WENKAI,
        nameColor: '#b65a4d',
        textColor: '#4a4034',
        thoughtColor: '#6f8250',
        narrationColor: '#776c5c',
    }),
    // 青绿山水：明朝体托住绢本气质，内心独白换楷书以示区别；墨色取黛青，旁白淡一层。
    'qinglv-shanshui': Object.freeze({
        nameAlign: 'left',
        nameFont: DIALOG_FONT_HUIWEN,
        textFont: DIALOG_FONT_HUIWEN,
        thoughtFont: DIALOG_FONT_WENKAI,
        narrationFont: DIALOG_FONT_HUIWEN,
        nameColor: '#1f2b28',
        textColor: '#26332f',
        thoughtColor: '#2f5d7c',
        narrationColor: '#56625d',
    }),
    // 血色噩梦（波普血浆）：名字是红块上的骨白得意黑，正文用干脆的新晰黑；心里话亮红，旁白褪成灰。
    'horror-gore': Object.freeze({
        nameAlign: 'left',
        nameFont: DIALOG_FONT_SMILEY,
        textFont: DIALOG_FONT_NEO_XIHEI,
        thoughtFont: DIALOG_FONT_NEO_XIHEI,
        narrationFont: DIALOG_FONT_NEO_XIHEI,
        nameColor: '#f3ece4',
        textColor: '#f3ece4',
        thoughtColor: '#ff5a62',
        narrationColor: '#b3aaa4',
    }),
    // 心理恐怖（正常界面崩坏）：先装成可爱校园风，名字圆体白字，正文梅子色，心里话淡紫。
    'horror-psych': Object.freeze({
        nameAlign: 'left',
        nameFont: DIALOG_FONT_ZCOOL_KUAILE,
        textFont: DIALOG_FONT_ROUNDED,
        thoughtFont: DIALOG_FONT_ROUNDED,
        narrationFont: DIALOG_FONT_ROUNDED,
        nameColor: '#ffffff',
        textColor: '#6b4a5c',
        thoughtColor: '#8c72c4',
        narrationColor: '#8f7a86',
    }),
});

export function getReferenceDialogTypography(dialogSkin) {
    return REFERENCE_DIALOG_TYPOGRAPHY[dialogSkin] || null;
}

// 同一字号下各字体的字面大小与字形疏密差异明显：手写/楷体字面偏小、笔画密，需略放大并加行距，
// 否则切换主题时正文忽大忽小。按字体栈首个字体取值，用户在主题页自选字体时同样生效。
const DIALOG_FONT_METRICS = Object.freeze({
    'LXGW WenKai': Object.freeze({ scale: 1.04, leading: 1.06 }),
    'LXGW WenKai Lite': Object.freeze({ scale: 1.04, leading: 1.06 }),
    'LXGW Neo ZhiSong': Object.freeze({ scale: 1, leading: 1.04 }),
    'Source Han Serif CN': Object.freeze({ scale: 1, leading: 1.04 }),
    'Huiwen Mincho': Object.freeze({ scale: 1.02, leading: 1.05 }),
    'Tsanger YuYang': Object.freeze({ scale: 1.04, leading: 1.06 }),
    Yozai: Object.freeze({ scale: 1.07, leading: 1.06 }),
    'Smiley Sans': Object.freeze({ scale: 1.06, leading: 1.02 }),
    'ZCOOL KuaiLe': Object.freeze({ scale: 1.03, leading: 1.04 }),
});
const NEUTRAL_FONT_METRICS = Object.freeze({ scale: 1, leading: 1 });

export function primaryFontFamily(fontStack) {
    const first = String(fontStack || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    return first && first !== 'inherit' ? first : '';
}

export function resolveDialogFontMetrics(fontStack) {
    return DIALOG_FONT_METRICS[primaryFontFamily(fontStack)] || NEUTRAL_FONT_METRICS;
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);
const preloadedFamilies = new Set();

// font-display:swap 下首句会先用回退字体排版，经典打字机按回退字形测量后遮罩会错位；
// 渲染时提前请求本主题用到的字体，之后切换台词/心声/旁白不再闪字。
export function preloadDialogFonts(doc, fontStacks) {
    const fonts = doc && doc.fonts;
    if (!fonts || typeof fonts.load !== 'function') return;
    for (const stack of fontStacks) {
        const family = primaryFontFamily(stack);
        if (!family || GENERIC_FAMILIES.has(family) || preloadedFamilies.has(family)) continue;
        preloadedFamilies.add(family);
        try {
            const pending = fonts.load(`16px "${family}"`, '字');
            if (pending && typeof pending.catch === 'function') pending.catch(() => preloadedFamilies.delete(family));
        } catch {
            preloadedFamilies.delete(family);
        }
    }
}

// 中文正文排版：严格避头尾、中西文自动间距、字距微调；不支持的浏览器按原样渲染。
export const DIALOG_TYPESETTING_STYLE_TEXT = `
#igs-overlay #igs-text{line-break:strict;overflow-wrap:break-word;text-autospace:normal;font-kerning:normal;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
`;
