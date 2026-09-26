import { DIALOG_SKIN_GRADIENT_VEIL } from './gradient-veil-dialog-skin.js';
import {
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_PLANT_COFFEE,
} from './dialog-theme-skins.js';
import {
    DIALOG_FONT_ROUNDED,
    DIALOG_FONT_SANS,
    DIALOG_FONT_SERIF,
} from './dialog-theme-typography.js';

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

// 选项跟随对话框皮肤：只改外观，位置、宽度模式与字号仍由选项设置控制；默认皮肤保持霜夜选项。
export const DIALOG_THEME_CHOICE_STYLE_TEXT = [
    '#igs-overlay[data-igs-dialog-skin] #igs-option-bubbles{margin-bottom:var(--igs-skin-plate-rise,0px);}',
    '#igs-overlay[data-igs-dialog-skin] .igs-option-bubble{position:relative;-webkit-backdrop-filter:none;backdrop-filter:none;transition:background-color .18s,border-color .18s,color .18s,box-shadow .18s,transform .12s;}',
    '#igs-overlay[data-igs-dialog-skin] .igs-option-bubble:focus-visible{outline:2px solid currentColor;outline-offset:3px;}',
    bubbleRules(CLASSIC, {
        '': `padding:10px 42px;border:1px solid #b8903f;border-radius:4px;background:linear-gradient(180deg,rgba(63,67,50,.95),rgba(42,45,33,.95));box-shadow:inset 0 0 0 2px rgba(38,31,23,.92),inset 0 0 0 3px rgba(255,214,128,.26),0 3px 10px rgba(0,0,0,.35);color:#f2e5c4;font-family:${DIALOG_FONT_SERIF};letter-spacing:.08em;`,
        '::before': 'content:"";position:absolute;left:18px;top:50%;width:6px;height:6px;border:1px solid #d9b061;transform:translateY(-50%) rotate(45deg);transition:background-color .18s;',
        '::after': 'content:"";position:absolute;right:18px;top:50%;width:6px;height:6px;border:1px solid #d9b061;transform:translateY(-50%) rotate(45deg);transition:background-color .18s;',
        ':hover': 'border-color:#e8c170;background:linear-gradient(180deg,rgba(78,82,60,.96),rgba(52,55,40,.96));color:#ffe9b0;box-shadow:inset 0 0 0 2px rgba(38,31,23,.92),inset 0 0 0 3px rgba(255,214,128,.42),0 0 14px rgba(232,193,112,.28);',
        ':hover::before': 'background:#d9b061;',
        ':hover::after': 'background:#d9b061;',
    }),
    bubbleRules(DIALOG_SKIN_PLANT_COFFEE, {
        '': `padding:10px 40px;border:1.5px solid #5c4949;border-radius:999px;background:#f6f1eb;box-shadow:0 3px 0 rgba(92,73,73,.2);color:#5b4643;font-family:${DIALOG_FONT_ROUNDED};letter-spacing:.06em;`,
        '::before': 'content:"";position:absolute;left:19px;top:50%;width:10px;height:10px;border-radius:0 100% 0 100%;background:#a5bf6b;transform:translateY(-50%) rotate(-12deg);transition:background-color .18s;',
        ':hover': 'border-color:#5c4949;background:#5c4949;color:#f6ecd9;',
        ':hover::before': 'background:#c9dd8f;',
        ':active': 'transform:translateY(2px);box-shadow:0 1px 0 rgba(92,73,73,.2);',
    }),
    `${scope(DIALOG_SKIN_BLACK_WHITE_MANGA)} #igs-option-bubbles{box-sizing:border-box;padding:0 5px 5px 0;}`,
    bubbleRules(DIALOG_SKIN_BLACK_WHITE_MANGA, {
        '': `padding:10px 24px;border:2.5px solid #171412;border-radius:2px;background:radial-gradient(rgba(23,20,18,.09) 1px,transparent 1.3px) 0 0/5px 5px,#f3eee4;box-shadow:4px 4px 0 #171412;color:#1f1b19;font-family:${DIALOG_FONT_SANS};font-weight:700;letter-spacing:.08em;`,
        ':hover': 'border-color:#171412;background:#171412;color:#f7f3ea;box-shadow:2px 2px 0 #171412;transform:translate(2px,2px);',
        ':active': 'box-shadow:0 0 0 #171412;transform:translate(4px,4px);',
    }),
    `${scope(DIALOG_SKIN_CUTE_PINK)} #igs-option-bubbles{box-sizing:border-box;padding-bottom:5px;}`,
    bubbleRules(DIALOG_SKIN_CUTE_PINK, {
        '': `padding:10px 28px;border:2px solid #5e5356;border-radius:999px;background:#fff;box-shadow:0 4px 0 #d9416f;color:#5d3a4a;font-family:${DIALOG_FONT_ROUNDED};font-weight:500;letter-spacing:.06em;`,
        '::before': 'content:"\\2665";margin-right:.45em;color:#e97c9d;font-size:.9em;transition:color .18s;',
        ':hover': 'border-color:#5e5356;background:linear-gradient(180deg,#f29ab5,#e5779a);box-shadow:0 2px 0 #b8345c;color:#fff;transform:translateY(2px);',
        ':hover::before': 'color:#fff;',
        ':active': 'box-shadow:0 0 0 #b8345c;transform:translateY(4px);',
    }),
    bubbleRules(DIALOG_SKIN_GRADIENT_VEIL, {
        '': 'padding:11px 32px;border:0;border-radius:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.6) 18%,rgba(0,0,0,.6) 82%,transparent);box-shadow:none;color:rgba(255,255,255,.88);text-shadow:0 1px 3px rgba(0,0,0,.85);letter-spacing:.1em;',
        '::after': 'content:"";position:absolute;left:20%;right:20%;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.32),transparent);transition:background .18s;',
        ':hover': 'border:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.78) 14%,rgba(0,0,0,.78) 86%,transparent);color:#fff;',
        ':hover::after': 'background:linear-gradient(90deg,transparent,rgba(255,238,184,.85),transparent);',
    }),
].join('\n');
