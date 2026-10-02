import { stroke } from './dialog-skin-frame.js';
import { DIALOG_SKIN_MAGIC_ACADEMY, MAGIC_METAL, MAGIC_METAL_HI, MAGIC_SPARKLE_MASK, MAGIC_VEIL, magicTint } from './dialog-theme-css-skins.js';
import { DIALOG_SKIN_QINGLV, qinglvSilk } from './dialog-theme-guofeng.js';
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
import {
    DIALOG_FONT_CINZEL,
    DIALOG_FONT_HUIWEN,
    DIALOG_FONT_NEO_XIHEI,
    DIALOG_FONT_NEO_ZHISONG,
    DIALOG_FONT_SERIF,
    DIALOG_FONT_SMILEY,
    DIALOG_FONT_WENKAI,
    DIALOG_FONT_WENKAI_LITE,
    DIALOG_FONT_ZCOOL_KUAILE,
} from './dialog-theme-typography.js';
import { DIALOG_SKIN_GRADIENT_VEIL } from './gradient-veil-dialog-skin.js';

// 战斗演出跟随对话框皮肤：名牌、招式条、判定字、结算带与遭遇横幅取主题的底色、墨色、细线与字体，
// 剑光、闪光、受击红边等打击效果不变。暗色纱底主题沿用默认的两端渐隐通栏，只换变量；
// 卡片类主题（素材框、绘本、漫画）改用与对话框同款的实底卡片。古代背景（is-ancient）保留水墨换皮，不受皮肤影响。
const CONTAINERS = ['plate', 'encounter', 'hit', 'result'];
const PART_SELECTORS = Object.freeze({
    plate: '.igs-fx-battle-plate:not(.is-ancient)',
    mark: '.igs-fx-battle-plate:not(.is-ancient) .igs-fx-battle-plate-mark',
    skill: '.igs-fx-battle-hit:not(.is-ancient) .igs-fx-battle-skill',
    skillName: '.igs-fx-battle-hit:not(.is-ancient) .igs-fx-battle-skill-name',
    pop: '.igs-fx-battle-hit:not(.is-ancient) .igs-fx-battle-pop-label',
    dice: '.igs-fx-battle-hit:not(.is-ancient) .igs-fx-battle-pop-dice',
    target: '.igs-fx-battle-hit:not(.is-ancient) .igs-fx-battle-pop-target',
    ribbon: '.igs-fx-battle-result:not(.is-ancient) .igs-fx-battle-ribbon',
    title: '.igs-fx-battle-result:not(.is-ancient) .igs-fx-battle-ribbon-title',
    veil: '.igs-fx-battle-result:not(.is-ancient) .igs-fx-battle-result-veil',
    wipe: '.igs-fx-battle-encounter:not(.is-ancient) .igs-fx-battle-wipe',
    foe: '.igs-fx-battle-encounter:not(.is-ancient) .igs-fx-battle-vs-foe',
});
const CARD_PADDING = Object.freeze({ plate: 'padding:4px 18px 5px 10px;', skill: 'min-width:min(200px,56%);padding:6px 30px 7px;', ribbon: 'min-width:min(380px,76%);padding:14px 44px 12px;' });

const vars = (v) => Object.entries(v).map(([k, value]) => `--igs-bt-${k}:${value};`).join('');
// 学院暮色压暗一半再用：整块通栏直接铺学院色会显得像蓝色色块。
const nightVeil = (percent) => magicTint(`color-mix(in srgb,${MAGIC_VEIL} 34%,#05050a)`, percent);
const softRule = (color, edge) => `linear-gradient(90deg,transparent,${color} 28%,${color} 72%,transparent) left ${edge}/100% 1px no-repeat`;

const BATTLE_THEMES = Object.freeze({
    // 渐变黑幕：没有任何线与框，通栏改成四面都化开的一团黑雾，颜色与浓度取用户的黑幕设置。
    [DIALOG_SKIN_GRADIENT_VEIL]: {
        accent: '#ffeeb8',
        vars: { veil: 'var(--igs-gradient-veil-color,rgba(0,0,0,.85))', rule: 'transparent', ink: '#fff', halo: '0 1px 3px rgba(0,0,0,.9)', 'title-halo': '0 0 16px rgba(255,238,184,.35),0 2px 6px rgba(0,0,0,.8)', wipe: 'var(--igs-gradient-veil-color,rgba(0,0,0,.85))' },
        band: 'background:none;isolation:isolate;',
        extra: (scope) => [
            `${scope} ${PART_SELECTORS.plate}::before,${scope} ${PART_SELECTORS.skill}::before,${scope} ${PART_SELECTORS.ribbon}::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,transparent,var(--igs-bt-veil) 24%,var(--igs-bt-veil) 76%,transparent);-webkit-mask:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent);mask:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent);pointer-events:none;}`,
        ],
        plate: 'padding:8px 64px;',
        skill: 'padding:12px 80px;',
        ribbon: 'padding:28px 120px 24px;',
        dice: 'background:none;padding:0;',
        wipe: 'background:linear-gradient(180deg,transparent,var(--igs-bt-wipe) 34%,var(--igs-bt-wipe) 66%,transparent);',
    },
    // 优雅欧式：黑纱通栏 + 淡紫银线与星光。
    [DIALOG_SKIN_ELEGANT_EUROPEAN]: {
        accent: '#d6c8ff',
        font: DIALOG_FONT_SERIF,
        vars: { veil: 'rgba(6,6,12,.74)', rule: 'rgba(196,176,255,.6)', ink: '#eeeaf3', halo: '0 0 8px rgba(160,136,255,.5),0 1px 3px rgba(0,0,0,.9)', 'title-halo': '0 0 18px rgba(160,136,255,.6),0 2px 4px rgba(0,0,0,.7)', wipe: 'rgba(6,6,12,.9)' },
        title: 'font-style:normal;font-weight:600;',
    },
    // 魔法星夜：暮色薄纱、学院银线，名牌标记换成四芒星。
    [DIALOG_SKIN_MAGIC_ACADEMY]: {
        accent: MAGIC_METAL_HI,
        font: DIALOG_FONT_HUIWEN,
        vars: { veil: nightVeil(80), rule: magicTint(MAGIC_METAL, 62), ink: '#ecebf7', halo: `0 0 10px ${magicTint(MAGIC_METAL_HI, 50)},0 1px 3px rgba(0,0,0,.9)`, 'title-halo': `0 0 20px ${magicTint(MAGIC_METAL_HI, 60)},0 2px 4px rgba(0,0,0,.7)`, wipe: nightVeil(92) },
        mark: `width:11px;height:11px;align-self:center;font-size:0;background:${MAGIC_METAL_HI};-webkit-mask:${MAGIC_SPARKLE_MASK} center/contain no-repeat;mask:${MAGIC_SPARKLE_MASK} center/contain no-repeat;filter:drop-shadow(0 0 3px ${magicTint(MAGIC_METAL_HI, 80)});`,
        title: 'font-style:normal;font-weight:600;',
    },
    // 西欧古典：橄榄墨底、金线。
    'western-classic': {
        accent: '#e2bf72',
        font: DIALOG_FONT_SERIF,
        vars: { veil: 'rgba(42,45,33,.9)', rule: 'rgba(184,144,63,.9)', ink: '#eadfbf', halo: '0 1px 3px rgba(0,0,0,.8)', wipe: 'rgba(38,40,29,.94)' },
        title: 'font-style:normal;font-weight:700;',
    },
    // 青绿山水：绢色烟岚、石青细线，名牌标记是一方朱砂小印；判定字用墨色衬绢边。
    [DIALOG_SKIN_QINGLV]: {
        accent: '#2f5d7c',
        light: true,
        font: DIALOG_FONT_HUIWEN,
        vars: { veil: qinglvSilk('.9'), rule: 'rgba(47,93,124,.55)', ink: '#26332f', halo: `0 1px 0 ${qinglvSilk('.6')}`, 'title-halo': `0 1px 0 ${qinglvSilk('.8')}`, wipe: qinglvSilk('.94'), lose: '#8f2616', escape: '#56625d' },
        mark: `padding:0 3px;border-radius:2px;background:#b23a2a;color:${qinglvSilk(1)};font-size:0;line-height:1;text-shadow:none;--igs-bt-seal:"战";`,
        extra: (scope) => [
            `${scope} ${PART_SELECTORS.mark}::before{content:var(--igs-bt-seal);font-size:12px;letter-spacing:0;}`,
            `${scope} ${PART_SELECTORS.pop}{color:#26332f;font-style:normal;font-weight:700;letter-spacing:.2em;text-shadow:${stroke(qinglvSilk('.85'))},0 0 14px ${qinglvSilk('.9')};}`,
            `${scope} .igs-fx-battle-hit:not(.is-ancient)[data-igs-battle-result="crit"] .igs-fx-battle-pop-label{color:#1f4c66;}`,
            `${scope} .igs-fx-battle-hit:not(.is-ancient)[data-igs-battle-result="ko"] .igs-fx-battle-pop-label{color:#8f2616;}`,
            `${scope} .igs-fx-battle-hit:not(.is-ancient)[data-igs-battle-result="heal"] .igs-fx-battle-pop-label{color:#3f7f6f;}`,
            `${scope} .igs-fx-battle-hit:not(.is-ancient)[data-igs-battle-result="miss"] .igs-fx-battle-pop-label{color:#6f7a75;}`,
            `${scope} ${PART_SELECTORS.dice},${scope} ${PART_SELECTORS.target}{color:#26332f;text-shadow:${stroke(qinglvSilk('.8'))};}`,
            `${scope} ${PART_SELECTORS.foe}{text-shadow:${stroke(qinglvSilk('.7'))},0 0 18px ${qinglvSilk('.9')};}`,
        ],
        title: 'font-style:normal;font-weight:400;letter-spacing:.3em;text-indent:.3em;',
        veil: 'background:rgba(30,40,38,.22);',
    },
    // 日间简约：暗色渐隐名条 + 三色竖标，正文条为半透明白。
    [DIALOG_SKIN_DAY_MINIMAL]: {
        accent: '#d0705a',
        light: true,
        font: DIALOG_FONT_NEO_XIHEI,
        vars: { veil: 'rgba(250,249,244,.88)', rule: 'rgba(120,118,104,.45)', ink: '#3a3935', halo: '0 1px 0 rgba(255,255,255,.8)', 'title-halo': '0 1px 0 rgba(255,255,255,.9)', wipe: 'rgba(250,249,244,.92)', lose: '#b0503f', escape: '#5f6f7a' },
        plate: 'padding:5px 56px 6px 18px;background:linear-gradient(180deg,#e0826c 0 33.3%,#ebe5d0 33.3% 66.6%,#b9c4a2 66.6%) left top/3px 100% no-repeat,linear-gradient(90deg,#333,#3a3935 50%,rgba(95,94,83,.75) 75%,transparent);color:#f7f5ee;text-shadow:0 1px 2px rgba(0,0,0,.45);',
        mark: 'color:#ebe5d0;font-weight:400;',
        skill: 'padding:7px 40px 8px 44px;background:linear-gradient(180deg,#e0826c 0 33.3%,#ebe5d0 33.3% 66.6%,#b9c4a2 66.6%) left top/3px 100% no-repeat,linear-gradient(90deg,var(--igs-bt-veil),var(--igs-bt-veil) 70%,transparent);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);',
        title: 'font-style:normal;font-weight:400;letter-spacing:.24em;text-indent:.24em;',
        foe: 'text-shadow:0 1px 0 rgba(255,255,255,.8);',
    },
    // 温暖绘本：米白圆角卡、深灰描边与底部压条，薄荷强调。
    [DIALOG_SKIN_WARM_PICTUREBOOK]: {
        accent: '#4f9a92',
        light: true,
        font: DIALOG_FONT_WENKAI,
        vars: { ink: '#4f4a45', halo: 'none', 'title-halo': '0 2px 0 rgba(79,74,69,.15)', wipe: '#f1ede9', lose: '#b55a4a', escape: '#6d7f8c' },
        card: 'background:#f1ede9;border:2px solid #4f4a45;border-radius:14px;box-shadow:inset 0 -5px 0 #55514b,0 2px 0 rgba(79,74,69,.18);',
        cardPad: 'padding-bottom:10px;',
        mark: 'padding:0 8px;border-radius:999px;background:#4f4a45;color:#f4efe9;font-weight:400;',
        wipe: 'background:repeating-linear-gradient(135deg,#f1ede9 0 12px,#ebe6e0 12px 24px);box-shadow:inset 0 2px 0 #4f4a45,inset 0 -2px 0 #4f4a45;',
        foe: 'text-shadow:0 2px 0 #f1ede9,0 3px 0 rgba(79,74,69,.2);',
        title: 'font-style:normal;',
    },
    // 植物咖啡：奶白胶囊卡、咖啡色描边、叶绿强调。
    [DIALOG_SKIN_PLANT_COFFEE]: {
        accent: '#6f8f3a',
        light: true,
        font: DIALOG_FONT_WENKAI_LITE,
        vars: { ink: '#5b4643', halo: 'none', 'title-halo': '0 2px 0 rgba(92,73,73,.15)', wipe: '#f3ecdf', lose: '#a8564a', escape: '#6f7f86' },
        card: 'background:#f6f1eb;border:1.5px solid #5c4949;border-radius:18px;box-shadow:0 3px 0 rgba(92,73,73,.2);',
        mark: 'padding:0 8px;border-radius:999px;background:#a5bf6b;color:#fff;font-weight:600;text-shadow:0 1px 0 rgba(70,96,36,.45);',
        wipe: 'background:radial-gradient(rgba(165,191,107,.3) 1.2px,transparent 1.6px) 0 0/10px 10px,#f3ecdf;box-shadow:inset 0 1.5px 0 #5c4949,inset 0 -1.5px 0 #5c4949;',
        foe: 'text-shadow:0 2px 0 #f6f1eb;',
        title: 'font-style:normal;',
    },
    // 黑白漫画：网点纸卡、粗黑框与硬投影；判定字是白描边的黑字。
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: {
        accent: '#171412',
        light: true,
        font: DIALOG_FONT_SMILEY,
        vars: { ink: '#171412', halo: 'none', 'title-halo': `${stroke('#fff')},3px 3px 0 rgba(23,20,18,.2)`, wipe: '#f3eee4', lose: '#171412', escape: '#5e5750' },
        card: 'background:radial-gradient(rgba(23,20,18,.1) 1px,transparent 1.3px) 0 0/5px 5px,#f3eee4;border:2.5px solid #171412;border-radius:2px;box-shadow:4px 4px 0 #171412;',
        mark: 'padding:0 6px;background:#171412;color:#fff;font-style:italic;font-weight:800;',
        wipe: 'background:radial-gradient(rgba(23,20,18,.5) 1.1px,transparent 1.4px) 0 0/6px 6px,#f3eee4;box-shadow:inset 0 3px 0 #171412,inset 0 -3px 0 #171412;',
        foe: `text-shadow:${stroke('#fff')},4px 4px 0 rgba(23,20,18,.25);`,
        extra: (scope) => [
            `${scope} .igs-fx-battle-hit:not(.is-ancient)[data-igs-battle-result] .igs-fx-battle-pop-label{color:#171412;text-shadow:${stroke('#fff')},3px 3px 0 #fff;}`,
            `${scope} ${PART_SELECTORS.dice}{color:#fff;background:#171412;padding:0 8px;}`,
            `${scope} ${PART_SELECTORS.target}{color:#171412;text-shadow:${stroke('#fff')};}`,
        ],
    },
    // 超可爱粉：白底圆角卡、深灰描边、粉色压边。
    [DIALOG_SKIN_CUTE_PINK]: {
        accent: '#e5779a',
        light: true,
        font: DIALOG_FONT_ZCOOL_KUAILE,
        vars: { ink: '#6b4454', halo: 'none', 'title-halo': '0 2px 0 #fff,0 3px 0 rgba(176,62,100,.25)', wipe: '#ffd6e3', lose: '#c24a6f', escape: '#7a8fb0' },
        card: 'background:#fff;border:2px solid #5e5356;border-radius:16px;box-shadow:0 4px 0 #d9416f;',
        mark: 'padding:0 8px;border-radius:999px;background:linear-gradient(180deg,#f29ab5,#e5779a);color:#fff;text-shadow:0 1px 0 #c24a6f;',
        wipe: 'background:repeating-linear-gradient(135deg,#ffe1ea 0 14px,#ffd0de 14px 28px);box-shadow:inset 0 2px 0 #5e5356,inset 0 -2px 0 #5e5356;',
        foe: `color:#fff;text-shadow:${stroke('#d4557c')},0 3px 0 #b03e64;`,
        title: 'font-style:normal;',
    },
    // 复古日式：生成纸卡、茶色双线框、胭脂红强调。
    [DIALOG_SKIN_RETRO_JAPANESE]: {
        accent: '#8e2c2c',
        light: true,
        font: DIALOG_FONT_HUIWEN,
        vars: { ink: '#4a3527', halo: 'none', 'title-halo': '0 2px 0 rgba(255,255,255,.4)', wipe: '#f3e7cf', lose: '#8e2c2c', escape: '#4f5d63' },
        card: 'background:#f3e7cf;border:2px solid #6b4a36;border-radius:3px;box-shadow:inset 0 0 0 3px #f3e7cf,inset 0 0 0 4px #b98c5d,0 2px 6px rgba(0,0,0,.28);',
        mark: 'padding:0 6px;border-radius:2px;background:#69493e;color:#f6e6c4;font-weight:400;',
        wipe: 'background:linear-gradient(180deg,#e6d3b4,#f3e7cf 14%,#f3e7cf 86%,#e6d3b4);box-shadow:inset 0 2px 0 #6b4a36,inset 0 -2px 0 #6b4a36;',
        foe: 'text-shadow:0 2px 0 rgba(255,255,255,.45);',
        title: 'font-style:normal;font-weight:700;letter-spacing:.3em;text-indent:.3em;',
    },
    // 冒险旅途：深皮革卡、铜线内框、琥珀强调。
    [DIALOG_SKIN_ADVENTURE_JOURNEY]: {
        accent: '#e0b06e',
        font: DIALOG_FONT_NEO_ZHISONG,
        vars: { ink: '#ecdcbc', halo: '0 1px 2px rgba(0,0,0,.6)', 'title-halo': '0 2px 4px rgba(0,0,0,.5)', wipe: '#3a2d26' },
        card: 'background:linear-gradient(180deg,#4d3c32,#3a2d26);border:2px solid #2a201b;border-radius:6px;box-shadow:inset 0 0 0 1px #b98a5a,inset 0 0 0 4px #3a2d26,inset 0 0 0 5px rgba(217,170,110,.45),0 3px 8px rgba(0,0,0,.35);',
        mark: 'padding:0 6px;border-radius:2px;background:#c8893a;color:#2a201b;font-family:' + DIALOG_FONT_CINZEL + ';',
        wipe: `background:${softRule('rgba(217,170,110,.6)', '10%')},${softRule('rgba(217,170,110,.6)', '90%')},linear-gradient(180deg,#4d3c32,#3a2d26);box-shadow:inset 0 2px 0 #2a201b,inset 0 -2px 0 #2a201b;`,
        title: 'font-style:normal;font-weight:700;',
    },
});

function battleThemeRules(skin, theme) {
    const scope = `#igs-overlay[data-igs-dialog-skin="${skin}"]`;
    const at = (key) => `${scope} ${PART_SELECTORS[key]}`;
    const containers = CONTAINERS.map((kind) => `${scope} .igs-fx-battle-${kind}:not(.is-ancient)`).join(',');
    const font = theme.font ? `font-family:${theme.font};` : '';
    const rules = [`${containers}{--igs-battle-accent:${theme.accent};${vars(theme.vars || {})}${font}}`];
    if (theme.band) rules.push(`${at('plate')},${at('skill')},${at('ribbon')}{${theme.band}}`);
    if (theme.card) {
        rules.push(`${at('plate')},${at('skill')},${at('ribbon')}{${theme.card}color:var(--igs-bt-ink);text-shadow:var(--igs-bt-halo);}`);
        for (const part of ['plate', 'skill', 'ribbon']) rules.push(`${at(part)}{${CARD_PADDING[part]}${theme.cardPad || ''}}`);
    }
    for (const part of ['plate', 'mark', 'skill', 'dice', 'ribbon', 'title', 'veil', 'wipe', 'foe']) {
        if (theme[part]) rules.push(`${at(part)}{${theme[part]}}`);
    }
    // 浅底主题：骰点与目标名落在场景上，改用主题墨色衬浅色描边，免得白字在浅卡片旁发灰。
    if (theme.light && !theme.extra) rules.push(`${at('dice')},${at('target')}{color:var(--igs-bt-ink);text-shadow:${stroke('rgba(255,255,255,.75)')};}`);
    if (theme.extra) rules.push(...theme.extra(scope));
    return rules.join('\n');
}

export function getDialogThemeBattleFxStyleText(skin) {
    const theme = BATTLE_THEMES[skin];
    return theme ? battleThemeRules(skin, theme) : '';
}

export const BATTLE_THEMED_DIALOG_SKINS = Object.freeze(Object.keys(BATTLE_THEMES));
