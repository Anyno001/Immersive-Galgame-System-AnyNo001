import { DIALOG_SKIN_GRADIENT_VEIL } from './gradient-veil-dialog-skin.js';
import { DIALOG_SKIN_MAGIC_ACADEMY, MAGIC_METAL, MAGIC_METAL_HI, MAGIC_SPARKLE_MASK, magicTint, magicVeil } from './dialog-theme-css-skins.js';
import { DIALOG_SKIN_QINGLV, QINGLV_CHOICE_STYLE } from './dialog-theme-guofeng.js';
import {
    DIALOG_SKIN_ADVENTURE_JOURNEY,
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_DAY_MINIMAL,
    DIALOG_SKIN_ELEGANT_EUROPEAN,
    DIALOG_SKIN_PLANT_COFFEE,
    DIALOG_SKIN_RETRO_JAPANESE,
    DIALOG_SKIN_WARM_PICTUREBOOK,
} from './dialog-theme-skins.js';

const CLASSIC = 'western-classic';

function scope(skin) {
    return `#igs-overlay[data-igs-dialog-skin="${skin}"]`;
}

function bubbleRules(skin, rules) {
    const s = scope(skin);
    return Object.entries(rules)
        .map(([suffix, body]) => `${s} .igs-option-bubble${suffix}{${body}}`)
        .join('\n');
}

// 构建脚本按字面占位符把素材外置到 dist/skins/，这里必须保留完整字面量。
const CHOICE_ASSETS = Object.freeze({
    [DIALOG_SKIN_CUTE_PINK]: ['__IGS_ASSET__cute-pink/choice.png__', '__IGS_ASSET__cute-pink/choice-hover.png__', '__IGS_ASSET__cute-pink/choice-active.png__'],
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: ['__IGS_ASSET__black-white-manga/choice.png__', '__IGS_ASSET__black-white-manga/choice-hover.png__', null],
    [CLASSIC]: ['__IGS_ASSET__western-classic/choice.png__', '__IGS_ASSET__western-classic/choice-hover.png__', '__IGS_ASSET__western-classic/choice-active.png__'],
    [DIALOG_SKIN_PLANT_COFFEE]: ['__IGS_ASSET__plant-coffee/choice.png__', '__IGS_ASSET__plant-coffee/choice-hover.png__', '__IGS_ASSET__plant-coffee/choice-active.png__'],
    [DIALOG_SKIN_RETRO_JAPANESE]: ['__IGS_ASSET__retro-japanese/choice.png__', '__IGS_ASSET__retro-japanese/choice-hover.png__', '__IGS_ASSET__retro-japanese/choice-active.png__'],
    [DIALOG_SKIN_ADVENTURE_JOURNEY]: ['__IGS_ASSET__adventure-journey/choice.png__', '__IGS_ASSET__adventure-journey/choice-hover.png__', '__IGS_ASSET__adventure-journey/choice-active.png__'],
});

// 作者选项按钮素材的九宫格：source 为原图高度，slice 为原图切线（上右下左），height 为渲染高度；
// 两端装饰按 height/source 等比缩放，中段随文字宽度拉伸，多行选项时上下切线之间纵向拉伸。
const IMAGE_CHOICE_SPECS = Object.freeze({
    [DIALOG_SKIN_CUTE_PINK]: { source: 56, slice: [18, 64, 22, 48], height: 46, padding: '0 40px 0 46px', css: `color:#6b4454;font-weight:500;letter-spacing:.08em;`, hover: 'color:#fff;text-shadow:0 1px 0 rgba(184,52,92,.45);', active: 'color:#fff;' },
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: { source: 66, slice: [22, 48, 22, 48], height: 50, padding: '0 44px', css: `color:#1f1b19;font-weight:700;letter-spacing:.1em;`, hover: 'color:#171412;' },
    [CLASSIC]: { source: 62, slice: [20, 40, 22, 40], height: 48, padding: '0 40px', css: `color:#eadfbf;letter-spacing:.1em;text-shadow:0 1px 2px rgba(0,0,0,.55);`, hover: 'color:#fff0c4;', active: 'color:#fff0c4;' },
    [DIALOG_SKIN_PLANT_COFFEE]: { source: 57, slice: [18, 30, 20, 30], height: 46, padding: '0 34px', css: `color:#5b4643;letter-spacing:.08em;`, hover: 'color:#fff;text-shadow:0 1px 0 rgba(70,96,36,.45);', active: 'color:#fff;' },
    [DIALOG_SKIN_RETRO_JAPANESE]: { source: 64, slice: [20, 96, 24, 40], height: 52, padding: '0 64px 6px 48px', css: `color:#4a3527;letter-spacing:.14em;`, hover: 'color:#f6e7c8;', active: 'color:#f6e7c8;' },
    [DIALOG_SKIN_ADVENTURE_JOURNEY]: { source: 78, slice: [24, 80, 24, 80], height: 54, padding: '0 60px', css: `color:#efdfc3;letter-spacing:.12em;text-shadow:0 1px 2px rgba(0,0,0,.5);`, hover: 'color:#3f3027;text-shadow:none;', active: 'color:#fff4dc;' },
});

function borderImage(url, spec) {
    const scale = spec.height / spec.source;
    const widths = spec.slice.map((value) => `${Math.round(value * scale)}px`).join(' ');
    return `border-image:url("${url}") ${spec.slice.join(' ')} fill / ${widths} stretch;`;
}

function imageChoiceRules(skin) {
    const spec = IMAGE_CHOICE_SPECS[skin];
    const [normal, hover, active] = CHOICE_ASSETS[skin];
    const rules = {
        '': `box-sizing:border-box;min-height:${spec.height}px;padding:${spec.padding};border:0 solid transparent;border-radius:0;background:transparent;box-shadow:none;${borderImage(normal, spec)}${spec.css}`,
        ':hover': `border-color:transparent;background:transparent;${borderImage(hover, spec)}${spec.hover || ''}`,
    };
    if (active) rules[':active'] = `transform:none;${borderImage(active, spec)}${spec.active || ''}`;
    return bubbleRules(skin, rules);
}

const DAY_STRIPES = 'linear-gradient(90deg,#e0826c 0 3px,transparent 3px 5px,#d8d3bf 5px 8px,transparent 8px 10px,#b9c4a2 10px 13px)';
const WARM_DOTS = 'linear-gradient(#a6dcd4 0 0) 0 0/5px 5px,linear-gradient(#a6dcd4 0 0) 7px 0/5px 5px,linear-gradient(#a6dcd4 0 0) 0 7px/5px 5px,linear-gradient(#a6dcd4 0 0) 7px 7px/5px 5px';
const ELEGANT_LINE = 'linear-gradient(90deg,rgba(236,232,244,0),rgba(236,232,244,.5) 18%,rgba(236,232,244,.5) 82%,rgba(236,232,244,0))';

// 选项跟随对话框皮肤：只改外观，位置、宽度模式与字号仍由选项设置控制；默认皮肤保持霜夜选项。
export const DIALOG_THEME_CHOICE_BASE_STYLE_TEXT = [
    '#igs-overlay[data-igs-dialog-skin] #igs-option-bubbles{margin-bottom:var(--igs-skin-plate-rise,0px);}',
    '#igs-overlay[data-igs-dialog-skin] .igs-option-bubble{position:relative;-webkit-backdrop-filter:none;backdrop-filter:none;transition:background-color .18s,border-color .18s,color .18s,box-shadow .18s,transform .12s;}',
    '#igs-overlay[data-igs-dialog-skin] .igs-option-bubble:focus-visible{outline:2px solid currentColor;outline-offset:3px;}',
].join('\n');

export const DIALOG_THEME_CHOICE_STYLE_BY_SKIN = Object.freeze({
    ...Object.fromEntries(Object.keys(IMAGE_CHOICE_SPECS).map((skin) => [skin, imageChoiceRules(skin)])),
    // 漫画例图里选中项左侧带一枚四角星。
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: [imageChoiceRules(DIALOG_SKIN_BLACK_WHITE_MANGA), bubbleRules(DIALOG_SKIN_BLACK_WHITE_MANGA, {
        ':hover::before': 'content:"\\2726";position:absolute;left:34px;top:50%;transform:translateY(-50%);font-size:1.05em;color:#171412;',
    })].join('\n'),
    [DIALOG_SKIN_DAY_MINIMAL]: bubbleRules(DIALOG_SKIN_DAY_MINIMAL, {
        '': `box-sizing:border-box;min-height:42px;padding:9px 40px 9px 44px;border:0;border-radius:0;background:linear-gradient(90deg,rgba(51,51,51,.9),rgba(62,62,58,.84) 70%,rgba(90,89,78,.78));box-shadow:0 1px 0 rgba(255,255,255,.35) inset;color:#f3f1ea;letter-spacing:.12em;`,
        '::before': `content:"";position:absolute;left:14px;top:50%;width:13px;height:14px;margin-top:-7px;background:${DAY_STRIPES};`,
        ':hover': 'background:linear-gradient(90deg,#c9604c,#d27560 70%,#d98b74);color:#fff;',
        ':active': 'transform:translateX(2px);',
    }),
    [DIALOG_SKIN_WARM_PICTUREBOOK]: bubbleRules(DIALOG_SKIN_WARM_PICTUREBOOK, {
        '': `box-sizing:border-box;min-height:44px;padding:9px 44px 9px 50px;border:2px solid #4f4a45;border-radius:999px;background:#f1ede9;box-shadow:0 3px 0 rgba(79,74,69,.28);color:#4f4a45;font-weight:500;letter-spacing:.1em;`,
        '::before': `content:"";position:absolute;left:22px;top:50%;width:12px;height:12px;margin-top:-6px;background:${WARM_DOTS};background-repeat:no-repeat;`,
        ':hover': 'border-color:#4f4a45;background:repeating-linear-gradient(135deg,#5b5650 0 5px,#4f4a45 5px 10px);box-shadow:0 0 0 3px #f1ede9,0 0 0 5px #4f4a45;color:#f4efe9;',
        ':active': 'transform:translateY(2px);box-shadow:0 0 0 3px #f1ede9,0 0 0 5px #4f4a45;',
    }),
    [DIALOG_SKIN_ELEGANT_EUROPEAN]: bubbleRules(DIALOG_SKIN_ELEGANT_EUROPEAN, {
        '': `box-sizing:border-box;min-height:44px;padding:10px 40px;border:0;border-radius:0;background:${ELEGANT_LINE} left top/100% 1px no-repeat,${ELEGANT_LINE} left bottom/100% 1px no-repeat,linear-gradient(90deg,rgba(8,8,16,0),rgba(8,8,16,.55) 20%,rgba(8,8,16,.55) 80%,rgba(8,8,16,0));box-shadow:none;color:#eeeaf3;letter-spacing:.12em;text-shadow:0 1px 3px rgba(0,0,0,.8);`,
        ':hover': `background:${ELEGANT_LINE} left top/100% 1px no-repeat,${ELEGANT_LINE} left bottom/100% 1px no-repeat,linear-gradient(90deg,rgba(96,78,168,0),rgba(96,78,168,.72) 22%,rgba(112,92,186,.78) 50%,rgba(96,78,168,.72) 78%,rgba(96,78,168,0));color:#fff;text-shadow:0 0 8px rgba(196,176,255,.6);`,
    }),
    // 星夜选项：暮色薄纱横带 + 上下两道渐隐银线，上线正中一颗四芒星，悬停时星光亮起。
    [DIALOG_SKIN_MAGIC_ACADEMY]: bubbleRules(DIALOG_SKIN_MAGIC_ACADEMY, {
        '': `box-sizing:border-box;min-height:44px;padding:10px 44px;border:0;border-radius:0;background:linear-gradient(90deg,transparent,${magicTint(MAGIC_METAL, 60)},transparent) left top/100% 1px no-repeat,linear-gradient(90deg,transparent,${magicTint(MAGIC_METAL, 35)},transparent) left bottom/100% 1px no-repeat,linear-gradient(90deg,transparent,${magicVeil(74)} 20%,${magicVeil(74)} 80%,transparent);box-shadow:none;color:#ecebf7;letter-spacing:.12em;text-shadow:0 1px 3px rgba(6,6,24,.85);`,
        '::before': `content:"";position:absolute;left:50%;top:-5px;width:10px;height:10px;margin-left:-5px;background:${MAGIC_METAL_HI};-webkit-mask:${MAGIC_SPARKLE_MASK} center/contain no-repeat;mask:${MAGIC_SPARKLE_MASK} center/contain no-repeat;opacity:.55;transition:opacity .2s,filter .2s;`,
        ':hover': `background:linear-gradient(90deg,transparent,${magicTint(MAGIC_METAL_HI, 90)},transparent) left top/100% 1px no-repeat,linear-gradient(90deg,transparent,${magicTint(MAGIC_METAL_HI, 55)},transparent) left bottom/100% 1px no-repeat,radial-gradient(ellipse 45% 120% at 50% 50%,${magicTint(MAGIC_METAL, 22)},transparent),linear-gradient(90deg,transparent,${magicVeil(84)} 16%,${magicVeil(84)} 84%,transparent);color:#fff;text-shadow:0 0 10px ${magicTint(MAGIC_METAL_HI, 60)},0 1px 3px rgba(6,6,24,.85);`,
        ':hover::before': `opacity:1;filter:drop-shadow(0 0 4px ${MAGIC_METAL_HI});`,
        ':active': 'transform:translateY(1px);',
    }),
    [DIALOG_SKIN_QINGLV]: QINGLV_CHOICE_STYLE,
    [DIALOG_SKIN_GRADIENT_VEIL]: bubbleRules(DIALOG_SKIN_GRADIENT_VEIL, {
        '': 'padding:11px 32px;border:0;border-radius:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.6) 18%,rgba(0,0,0,.6) 82%,transparent);box-shadow:none;color:rgba(255,255,255,.88);text-shadow:0 1px 3px rgba(0,0,0,.85);letter-spacing:.1em;',
        '::after': 'content:"";position:absolute;left:20%;right:20%;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.32),transparent);transition:background .18s;',
        ':hover': 'border:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.78) 14%,rgba(0,0,0,.78) 86%,transparent);color:#fff;',
        ':hover::after': 'background:linear-gradient(90deg,transparent,rgba(255,238,184,.85),transparent);',
    }),
});

export const DIALOG_THEME_CHOICE_STYLE_TEXT = [
    DIALOG_THEME_CHOICE_BASE_STYLE_TEXT,
    ...Object.values(DIALOG_THEME_CHOICE_STYLE_BY_SKIN),
].join('\n');
