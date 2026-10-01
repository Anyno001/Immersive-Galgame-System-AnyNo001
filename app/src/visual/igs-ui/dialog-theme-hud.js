import { DIALOG_SKIN_GRADIENT_VEIL } from './gradient-veil-dialog-skin.js';
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

// 构建脚本按字面占位符把素材外置到 dist/skins/，这里必须保留完整字面量。
const RETRO_TAG = '__IGS_ASSET__retro-japanese/tag.png__';
const ADVENTURE_TAG = '__IGS_ASSET__adventure-journey/tag.png__';

function s(value) {
    return `calc(${value}px * var(--igs-hud-scale,1))`;
}

// drop-shadow 描边跟随头像的实际圆角，用户设置的头像形状不受主题影响。
function ring(color, width) {
    const w = `${width}px`;
    return `drop-shadow(${w} 0 0 ${color}) drop-shadow(-${w} 0 0 ${color}) drop-shadow(0 ${w} 0 ${color}) drop-shadow(0 -${w} 0 ${color})`;
}

function fillMix(amount, base) {
    return `color-mix(in srgb,var(--igs-hud-fill-color) ${amount}%,${base})`;
}

// 每个主题只描述零件外观；布局网格、资料小菜单与折叠逻辑沿用默认 HUD。
const HUD_THEMES = Object.freeze({
    [DIALOG_SKIN_CUTE_PINK]: {
        neutral: '#b9a7ae',
        panel: `background:#fff;border:2px solid #5e5356;border-radius:${s(16)};box-shadow:0 ${s(4)} 0 #d9416f;`,
        ink: '#6b4454',
        emotion: `padding:${s(2)} ${s(12)} ${s(2)} ${s(20)};border:2px solid #5e5356;border-radius:999px;background:linear-gradient(180deg,#f29ab5,#e5779a);color:#fff;font-weight:700;letter-spacing:.08em;text-shadow:0 1px 0 #c24a6f;position:relative;`,
        emotionBefore: `content:"";position:absolute;left:${s(7)};top:50%;width:${s(6)};height:${s(6)};margin-top:${s(-3)};border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px #5e5356;`,
        avatar: `filter:${ring('#fff', 2)} ${ring('#5e5356', 1.5)};`,
        badge: `content:"\\2665";position:absolute;right:${s(-5)};bottom:${s(-5)};width:${s(16)};height:${s(16)};border-radius:50%;background:#e97c9d;border:1.5px solid #5e5356;color:#fff;font-size:${s(9)};line-height:${s(16)};text-align:center;`,
        placeholder: 'background:repeating-linear-gradient(135deg,#f6b6c9 0 4px,#f29ab5 4px 8px);color:#fff;',
        placeholderSvg: 'fill:#fff;stroke:#fff;',
        track: `height:${s(8)};border:1.5px solid #5e5356;border-radius:999px;background:#fff;`,
        fill: `background:repeating-linear-gradient(135deg,rgba(255,255,255,.34) 0 3px,transparent 3px 6px),${fillMix(80, '#fff')} !important;border-radius:999px;`,
        value: 'font-weight:700;',
    },
    [DIALOG_SKIN_RETRO_JAPANESE]: {
        neutral: '#8c7a66',
        panel: `background:#f3e7cf;border:2px solid #6b4a36;border-radius:${s(3)};box-shadow:inset 0 0 0 ${s(3)} #f3e7cf,inset 0 0 0 ${s(4)} #b98c5d,0 2px 6px rgba(0,0,0,.28);`,
        ink: '#4a3527',
        emotion: `min-height:${s(22)};padding:0 ${s(16)};border:0;border-radius:0;border-image:url("${RETRO_TAG}") 0 20 fill / 0 ${s(11)} stretch;background:transparent;color:#f6e6c4;line-height:${s(22)};letter-spacing:.16em;`,
        avatar: `filter:${ring('#c9a063', 2)} ${ring('#4a3527', 1.5)};`,
        badge: `content:"";position:absolute;right:${s(-4)};bottom:${s(-4)};width:${s(12)};height:${s(12)};border-radius:50%;background:radial-gradient(circle,#f0c64a 0 28%,#2f6e58 30% 100%);box-shadow:0 0 0 1.5px #4a3527;`,
        placeholder: 'background:radial-gradient(circle at 50% 38%,#f6ecd6,#e2cfa9);box-shadow:inset 0 0 0 2px #b98c5d;color:#6b4a36;',
        placeholderSvg: 'fill:#6b4a36;stroke:#6b4a36;',
        track: `height:${s(7)};border:1px solid #6b4a36;border-radius:0;background:#e2d3b5;`,
        fill: `background:linear-gradient(180deg,rgba(255,255,255,.22) 0 40%,transparent 40%),${fillMix(62, '#7a4e33')} !important;border-radius:0;`,
    },
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: {
        neutral: '#171412',
        panel: `background:radial-gradient(rgba(23,20,18,.1) 1px,transparent 1.3px) 0 0/5px 5px,#f3eee4;border:2.5px solid #171412;border-radius:2px;box-shadow:${s(4)} ${s(4)} 0 #171412;`,
        ink: '#171412',
        emotion: `padding:${s(1)} ${s(10)};border:2px solid #171412;border-radius:${s(10)};background:#fff;color:#171412;font-weight:800;letter-spacing:.06em;position:relative;overflow:visible;margin-left:${s(6)};`,
        emotionBefore: `content:"";position:absolute;left:${s(-8)};top:50%;width:${s(8)};height:${s(8)};margin-top:${s(-4)};background:#171412;clip-path:polygon(100% 0,0 50%,100% 100%);`,
        emotionAfter: `content:"";position:absolute;left:${s(-4)};top:50%;width:${s(5)};height:${s(5)};margin-top:${s(-2.5)};background:#fff;clip-path:polygon(100% 0,0 50%,100% 100%);`,
        avatar: `filter:${ring('#171412', 2)} drop-shadow(3px 3px 0 #171412);`,
        placeholder: 'background:radial-gradient(rgba(23,20,18,.28) .9px,transparent 1.2px) 0 0/4px 4px,#fff;color:#171412;',
        placeholderSvg: 'fill:#171412;stroke:#171412;',
        track: `height:${s(9)};border:2px solid #171412;border-radius:0;background:#fff;`,
        fill: 'background:repeating-linear-gradient(-45deg,#171412 0 2px,#fff 2px 4px) !important;border-radius:0;border-right:2px solid #171412;box-sizing:border-box;',
        value: 'font-weight:800;',
    },
    [DIALOG_SKIN_ADVENTURE_JOURNEY]: {
        neutral: '#d9c3a0',
        panel: `background:linear-gradient(180deg,#4d3c32,#3a2d26);border:2px solid #2a201b;border-radius:${s(6)};box-shadow:inset 0 0 0 1px #b98a5a,inset 0 0 0 ${s(4)} #3a2d26,inset 0 0 0 ${s(5)} rgba(217,170,110,.45),0 3px 8px rgba(0,0,0,.35);`,
        ink: '#ecdcbc',
        emotion: `min-height:${s(24)};padding:0 ${s(24)};border:0;border-radius:0;border-image:url("${ADVENTURE_TAG}") 0 56 fill / 0 ${s(20)} stretch;background:transparent;color:#f0dcb8;line-height:${s(24)};letter-spacing:.14em;`,
        avatar: `filter:${ring('#b98a5a', 2)} ${ring('#2a201b', 1.5)};`,
        badge: `content:"";position:absolute;left:50%;bottom:${s(-6)};width:${s(10)};height:${s(10)};margin-left:${s(-5)};background:#c8893a;border:1.5px solid #2a201b;transform:rotate(45deg);`,
        placeholder: 'background:radial-gradient(circle at 50% 35%,#6a5242,#3a2d26);box-shadow:inset 0 0 0 1.5px #b98a5a;color:#d9aa6e;',
        placeholderSvg: 'stroke:#d9aa6e;stroke-width:1.9;',
        track: `height:${s(7)};border:1px solid #b98a5a;border-radius:1px;background:#241a15;`,
        fill: `background:linear-gradient(180deg,rgba(255,236,200,.35) 0 1px,transparent 1px),${fillMix(58, '#c8893a')} !important;border-radius:0;`,
    },
    [DIALOG_SKIN_DAY_MINIMAL]: {
        neutral: '#8a8778',
        panel: `background:linear-gradient(180deg,#e0826c 0 33.3%,#d8d3bf 33.3% 66.6%,#b9c4a2 66.6%) left top/3px 100% no-repeat,rgba(255,255,255,.86);border:0;border-radius:0;box-shadow:0 1px 0 rgba(120,118,104,.35);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);padding-left:${s(12)};`,
        ink: '#3a3935',
        emotion: `padding:${s(2)} ${s(10)} ${s(2)} ${s(12)};border:0;border-radius:0;background:linear-gradient(#e0826c 0 0) left top/3px 100% no-repeat,#3a3935;color:#f7f5ee;letter-spacing:.14em;`,
        avatar: `filter:${ring('#f7f5ee', 1)} ${ring('#3a3935', 1)};`,
        placeholder: 'background:#e7e5dc;color:#8a8778;',
        placeholderSvg: 'stroke:#6f6d62;stroke-width:1.1;',
        track: `height:${s(3)};border:0;border-radius:0;background:rgba(58,57,53,.18);`,
        fill: `background:${fillMix(65, '#8a8778')} !important;border-radius:0;`,
        value: 'font-weight:400;letter-spacing:.04em;',
    },
    [DIALOG_SKIN_WARM_PICTUREBOOK]: {
        neutral: '#8c847c',
        panel: `background:#f1ede9;border:2px solid #4f4a45;border-radius:${s(14)};box-shadow:inset 0 ${s(-6)} 0 #55514b,0 2px 0 rgba(79,74,69,.18);padding-bottom:${s(12)};`,
        ink: '#4f4a45',
        emotion: `padding:${s(2)} ${s(12)} ${s(2)} ${s(24)};border:0;border-radius:999px;background:linear-gradient(#a6dcd4 0 0) ${s(9)} calc(50% - ${s(2.5)})/${s(4)} ${s(4)} no-repeat,linear-gradient(#a6dcd4 0 0) ${s(14)} calc(50% - ${s(2.5)})/${s(4)} ${s(4)} no-repeat,linear-gradient(#a6dcd4 0 0) ${s(9)} calc(50% + ${s(2.5)})/${s(4)} ${s(4)} no-repeat,linear-gradient(#a6dcd4 0 0) ${s(14)} calc(50% + ${s(2.5)})/${s(4)} ${s(4)} no-repeat,repeating-linear-gradient(135deg,#5b5650 0 4px,#4f4a45 4px 8px);box-shadow:0 0 0 2px #f1ede9,0 0 0 3.5px #4f4a45;color:#f4efe9;letter-spacing:.12em;margin:0 ${s(4)};`,
        avatar: `filter:${ring('#f1ede9', 2.5)} ${ring('#4f4a45', 1.5)};`,
        placeholder: 'background:repeating-linear-gradient(135deg,#e7e1da 0 4px,#ded7cf 4px 8px);color:#4f4a45;',
        placeholderSvg: 'fill:#f4efe9;stroke:#4f4a45;stroke-width:1.8;',
        track: `height:${s(9)};border:1.5px solid #4f4a45;border-radius:999px;background:#e3ddd6;`,
        fill: `background:repeating-linear-gradient(135deg,rgba(255,255,255,.22) 0 3px,transparent 3px 6px),${fillMix(78, '#f1ede9')} !important;border-radius:999px;`,
    },
    [CLASSIC]: {
        neutral: '#cdbd92',
        panel: `background:linear-gradient(180deg,rgba(63,67,50,.95),rgba(42,45,33,.95));border:1px solid #b8903f;border-radius:${s(5)};box-shadow:inset 0 0 0 2px rgba(38,31,23,.92),inset 0 0 0 3px rgba(255,214,128,.26),0 3px 10px rgba(0,0,0,.35);`,
        ink: '#eadfbf',
        emotion: `padding:${s(1)} ${s(16)};border:1px solid #8a6a32;border-radius:${s(3)};background:linear-gradient(180deg,#e6d7b3,#c9b386);color:#2e2218;font-weight:600;letter-spacing:.12em;position:relative;`,
        emotionBefore: `content:"";position:absolute;left:${s(5)};top:50%;width:${s(4)};height:${s(4)};margin-top:${s(-2)};background:#8a6a32;transform:rotate(45deg);`,
        emotionAfter: `content:"";position:absolute;right:${s(5)};top:50%;width:${s(4)};height:${s(4)};margin-top:${s(-2)};background:#8a6a32;transform:rotate(45deg);`,
        avatar: `filter:${ring('#d9b061', 1.5)} ${ring('#2a241a', 1)} ${ring('#b8903f', 1)};`,
        placeholder: 'background:radial-gradient(circle at 50% 35%,#4e5340,#2c2f22);color:#d9b061;',
        placeholderSvg: 'stroke:#d9b061;stroke-width:1.4;',
        track: `height:${s(6)};border:1px solid #b8903f;border-radius:${s(3)};background:rgba(0,0,0,.42);`,
        fill: `background:linear-gradient(180deg,rgba(255,240,200,.4),transparent 60%),${fillMix(55, '#d9b061')} !important;border-radius:${s(3)};`,
    },
    [DIALOG_SKIN_ELEGANT_EUROPEAN]: {
        neutral: '#d4cfdc',
        toast: 'background:rgba(6,6,12,.82);border:0;border-bottom:1px solid rgba(196,176,255,.65);border-radius:0;box-shadow:0 0 12px rgba(150,120,255,.35);color:#eeeaf3;',
        panel: `background:linear-gradient(90deg,rgba(236,232,244,.5),rgba(236,232,244,0)) left top/100% 1px no-repeat,linear-gradient(90deg,rgba(236,232,244,.5),rgba(236,232,244,0)) left bottom/100% 1px no-repeat,linear-gradient(90deg,rgba(6,6,12,.72),rgba(6,6,12,.5) 70%,rgba(6,6,12,0));border:0;border-radius:0;box-shadow:none;`,
        ink: '#e4dfeb',
        emotion: `padding:${s(1)} ${s(4)} ${s(1)} ${s(14)};border:0;border-bottom:1px solid rgba(196,176,255,.65);border-radius:0;background:transparent;color:#eeeaf3;letter-spacing:.14em;text-shadow:0 0 8px rgba(160,136,255,.7),0 1px 3px rgba(0,0,0,.9);position:relative;`,
        emotionBefore: `content:"\\2727";position:absolute;left:0;top:50%;transform:translateY(-50%);font-size:${s(9)};color:#c4b0ff;`,
        avatar: `filter:${ring('rgba(236,232,244,.85)', 1)} drop-shadow(0 0 5px rgba(150,120,255,.6));`,
        placeholder: 'background:radial-gradient(circle at 50% 30%,rgba(112,92,186,.55),rgba(12,12,22,.8));color:#e4dfeb;',
        placeholderSvg: 'stroke:#e4dfeb;stroke-width:1;',
        track: `height:${s(2)};border:0;border-radius:0;background:rgba(236,232,244,.2);overflow:visible;`,
        fill: `background:${fillMix(60, '#c4b0ff')} !important;border-radius:0;box-shadow:0 0 6px ${fillMix(70, '#c4b0ff')};`,
        value: 'font-weight:400;',
    },
    [DIALOG_SKIN_PLANT_COFFEE]: {
        neutral: '#a49186',
        panel: `background:#f6f1eb;border:1.5px solid #5c4949;border-radius:${s(18)};box-shadow:0 ${s(3)} 0 rgba(92,73,73,.2);`,
        ink: '#5b4643',
        emotion: `padding:${s(2)} ${s(12)} ${s(2)} ${s(22)};border:1.5px solid #5c4949;border-radius:999px;background:radial-gradient(rgba(255,255,255,.3) 1px,transparent 1.4px) 0 0/5px 5px,#a5bf6b;color:#fff;letter-spacing:.1em;text-shadow:0 1px 0 rgba(70,96,36,.45);position:relative;`,
        emotionBefore: `content:"";position:absolute;left:${s(8)};top:50%;width:${s(8)};height:${s(8)};margin-top:${s(-4)};border-radius:0 100% 0 100%;background:#f6f1eb;transform:rotate(-12deg);`,
        avatar: `filter:${ring('#f6f1eb', 2)} ${ring('#5c4949', 1.5)};`,
        badge: `content:"";position:absolute;right:${s(-3)};bottom:${s(-2)};width:${s(12)};height:${s(12)};border-radius:0 100% 0 100%;background:#a5bf6b;box-shadow:0 0 0 1.5px #5c4949;transform:rotate(-12deg);`,
        placeholder: 'background:#ece2d6;color:#5c4949;',
        placeholderSvg: 'fill:#a5bf6b;stroke:#5c4949;stroke-width:1.5;',
        track: `height:${s(8)};border:1.5px solid #5c4949;border-radius:999px;background:#ece2d6;`,
        fill: `background:radial-gradient(rgba(255,255,255,.28) 1px,transparent 1.4px) 0 0/4px 4px,${fillMix(75, '#a5bf6b')} !important;border-radius:999px;`,
    },
    [DIALOG_SKIN_GRADIENT_VEIL]: {
        neutral: 'rgba(255,255,255,.8)',
        toast: 'background:rgba(0,0,0,.62);border:0;border-radius:0;box-shadow:none;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9);',
        panel: 'background:linear-gradient(90deg,rgba(0,0,0,.125),rgba(0,0,0,.072) 75%,transparent);border-radius:0;-webkit-backdrop-filter:none;backdrop-filter:none;',
        emotion: `padding:0 ${s(2)};border:0;border-bottom:1px solid rgba(255,238,184,.7);border-radius:0;background:transparent;color:#fff;letter-spacing:.12em;text-shadow:0 1px 3px rgba(0,0,0,.9);`,
        avatar: 'filter:drop-shadow(0 2px 6px rgba(0,0,0,.6));',
        placeholder: 'background:rgba(0,0,0,.5);color:rgba(255,255,255,.7);',
        track: `height:${s(3)};border-radius:0;background:rgba(255,255,255,.2);`,
        fill: 'border-radius:0;',
    },
});

function hudThemeRules(skin, theme) {
    const hud = `#igs-overlay[data-igs-dialog-skin="${skin}"] #igs-status-hud`;
    const panel = `${hud}.igs-hud-bg-dialog`;
    const rules = [
        `${hud}{--igs-hud-fill-neutral:${theme.neutral};}`,
        `${panel}{${theme.panel}}`,
        `${hud} .igs-hud-emotion{line-height:1.6;${theme.emotion}}`,
        `${hud} .igs-hud-avatar{${theme.avatar}}`,
        `${hud} .igs-hud-avatar-empty{${theme.placeholder}}`,
        `${hud} .igs-hud-track{${theme.track}}`,
        `${hud} .igs-hud-fill{${theme.fill}}`,
    ];
    if (theme.emotionBefore) rules.push(`${hud} .igs-hud-emotion::before{${theme.emotionBefore}}`);
    if (theme.emotionAfter) rules.push(`${hud} .igs-hud-emotion::after{${theme.emotionAfter}}`);
    if (theme.badge) rules.push(`${hud} .igs-hud-avatar-frame::after{${theme.badge}pointer-events:none;}`);
    if (theme.placeholderSvg) rules.push(`${hud} .igs-hud-avatar-empty svg circle,${hud} .igs-hud-avatar-empty svg path{${theme.placeholderSvg}}`);
    if (theme.value) rules.push(`${hud} .igs-hud-metric-value{${theme.value}}`);
    // 无背景时文字仍落在场景图上，只在主题面板内改用主题墨色。
    if (theme.ink) {
        rules.push(`${panel} .igs-hud-metric-label,${panel} .igs-hud-metric-value,${panel} .igs-hud-overflow,${panel} .igs-hud-location-label{color:${theme.ink};text-shadow:none;}`);
        rules.push(`${panel} .igs-hud-location-icon{color:${theme.ink};opacity:.72;}`);
    }
    return rules.join('\n');
}

// HUD 与情绪标签跟随对话框皮肤：只换零件外观，资料小菜单保持默认样式。
export const DIALOG_THEME_HUD_STYLE_TEXT = Object.entries(HUD_THEMES)
    .map(([skin, theme]) => hudThemeRules(skin, theme))
    .join('\n');

// 物品演出卡片与重要物品大演出沿用同一主题的 HUD 面板、墨色与占位底；间距与动画仍由 fx-item 决定。
// 主题面板会盖掉卡片自带的稀有光晕，这里改用描边强调。
function itemFxThemeRules(skin, theme) {
    const scope = `#igs-overlay[data-igs-dialog-skin="${skin}"]`;
    const ink = theme.ink ? `color:${theme.ink};text-shadow:none;` : '';
    const rules = [
        `${scope} .igs-fx-item-card{${theme.panel}${ink}padding:8px 14px 8px 12px;}`,
        `${scope} .igs-fx-item-card[data-igs-item-rare]{outline:1.5px solid var(--igs-item-accent-c);outline-offset:2px;}`,
        `${scope} .igs-fx-item-showcase-plate{${theme.panel}${ink}padding:18px 26px 16px;outline:2px solid var(--igs-item-accent-c);outline-offset:4px;}`,
        `${scope} .igs-fx-item-icon[data-igs-item-placeholder]{${theme.placeholder}}`,
    ];
    if (theme.ink) rules.push(`${scope} .igs-fx-item-more,${scope} .igs-fx-item-flyer{color:${theme.ink};}`);
    return rules.join('\n');
}

export const DIALOG_THEME_ITEM_FX_STYLE_TEXT = Object.entries(HUD_THEMES)
    .map(([skin, theme]) => itemFxThemeRules(skin, theme))
    .join('\n');

// 提示弹窗跟随对话框皮肤：默认取主题 HUD 面板与墨色；面板为半透明渐变的主题用 toast 字段给实底，保证文字可读。
// 选择器带 #igs-overlay 皮肤前缀，优先于按设置器主题生成的 #igs-toast[data-igs-toast-theme] 规则。
function toastThemeRules(skin, theme) {
    const body = theme.toast || `${theme.panel}${theme.ink ? `color:${theme.ink};text-shadow:none;` : ''}`;
    return `#igs-overlay[data-igs-dialog-skin="${skin}"] #igs-toast{${body}}`;
}

export function getDialogThemeToastStyleText(skin) {
    const theme = HUD_THEMES[skin];
    return theme ? toastThemeRules(skin, theme) : '';
}

export function getDialogThemeHudStyleText(skin) {
    const theme = HUD_THEMES[skin];
    return theme ? hudThemeRules(skin, theme) : '';
}

export function getDialogThemeItemFxStyleText(skin) {
    const theme = HUD_THEMES[skin];
    return theme ? itemFxThemeRules(skin, theme) : '';
}
