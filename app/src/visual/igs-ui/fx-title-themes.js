import { stroke } from './dialog-skin-frame.js';
import { getBattleTheme } from './fx-battle-themes.js';
import { DIALOG_SKIN_MAGIC_ACADEMY, MAGIC_METAL_HI, MAGIC_SPARKLE_MASK, magicTint } from './dialog-theme-css-skins.js';
import { DIALOG_SKIN_QINGLV, qinglvSilk } from './dialog-theme-guofeng.js';
import { DIALOG_SKIN_FAIRY_TALE, FAIRY_SPARKLE_MASK, fairyPaper } from './dialog-theme-fairytale.js';
import { DIALOG_SKIN_HORROR_GORE, DIALOG_SKIN_HORROR_PSYCH, HORROR_DROP_MASK, HORROR_HEART_MASK } from './dialog-theme-horror.js';
import { DIALOG_SKIN_SCIFI_HOLO, SCIFI_HOLO, SCIFI_RETICLE_MASK, scifiHolo } from './dialog-theme-scifi.js';
import { DIALOG_SKIN_WASTELAND_RUST, WASTELAND_HAZARD, wastelandStripes } from './dialog-theme-wasteland.js';
import {
    DIALOG_SKIN_ADVENTURE_JOURNEY,
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_DAY_MINIMAL,
    DIALOG_SKIN_PLANT_COFFEE,
    DIALOG_SKIN_RETRO_JAPANESE,
    DIALOG_SKIN_WARM_PICTUREBOOK,
} from './dialog-theme-skins.js';
import { DIALOG_SKIN_GRADIENT_VEIL } from './gradient-veil-dialog-skin.js';

// 过场标题卡（换地点 / 时间变化时的报幕）跟随对话框皮肤：字体、墨色、底色与细线取战斗演出同一份主题。
// 纱底主题是一条两端化开的通栏，卡片主题（绘本、咖啡、漫画、粉、日式、旅途）是与对话框同款的实底卡片；
// 少数皮肤再加专属点缀。古代背景（is-ancient）保留宣纸竖幅，不受皮肤影响；只改静态外观，入场节奏仍是统一的淡入淡出。
const mask = (url) => `-webkit-mask:${url} center/contain no-repeat;mask:${url} center/contain no-repeat;`;
const mark = (size, color, url) => `content:"";display:inline-block;width:${size}px;height:${size}px;margin:0 .55em;vertical-align:.08em;background:${color};${mask(url)}`;
const CARD = 'left:50%;right:auto;transform:translateX(-50%);min-width:min(300px,72%);max-width:86%;box-sizing:border-box;padding:16px 44px 14px;gap:4px;';
const PILL = (bg, ink) => `margin-top:4px;padding:1px 12px;border-radius:999px;background:${bg};color:${ink};text-shadow:none;letter-spacing:.12em;opacity:1;`;

const TITLE_EXTRAS = Object.freeze({
    // 渐变黑幕：没有线，字底下是一团四面化开的黑雾，颜色取用户的黑幕设置。
    [DIALOG_SKIN_GRADIENT_VEIL]: (s) => [
        `${s}{padding:28px 0 24px;background:radial-gradient(ellipse 46% 50% at 50% 50%,var(--igs-gradient-veil-color,rgba(0,0,0,.85)),transparent 74%);}`,
        `${s}::before,${s}::after{display:none;}`,
    ],
    // 魔法星夜：地点两侧各一颗四芒星。
    [DIALOG_SKIN_MAGIC_ACADEMY]: (s) => [
        `${s} .igs-fx-title-main::before,${s} .igs-fx-title-main::after{${mark(13, MAGIC_METAL_HI, MAGIC_SPARKLE_MASK)}filter:drop-shadow(0 0 4px ${magicTint(MAGIC_METAL_HI, 80)});}`,
    ],
    // 青绿山水：一幅横向绢卷，上下石青细线，右下角一方朱砂小印。
    [DIALOG_SKIN_QINGLV]: (s) => [
        `${s}{${CARD}padding:18px 52px 16px;background:${qinglvSilk('.95')};box-shadow:inset 0 3px 0 ${qinglvSilk(1)},inset 0 4px 0 rgba(47,93,124,.55),inset 0 -3px 0 ${qinglvSilk(1)},inset 0 -4px 0 rgba(47,93,124,.55),0 8px 24px rgba(20,30,28,.28);}`,
        `${s}::before{display:none;}`,
        `${s}::after{position:absolute;right:12px;bottom:10px;width:16px;height:16px;border-radius:2px;background:#b23a2a;box-shadow:inset 0 0 0 2px ${qinglvSilk(1)},inset 0 0 0 3px #b23a2a;}`,
        `${s} .igs-fx-title-main{font-weight:400;letter-spacing:.4em;padding-left:.4em;}`,
        `${s} .igs-fx-title-sub{color:#2f5d7c;}`,
    ],
    // 童话小镇：野餐卡片，红白格子布边框，地点前后各一颗灯火色小星；装饰一律实色。
    [DIALOG_SKIN_FAIRY_TALE]: (s) => [
        `${s}{${CARD}border:7px solid transparent;border-radius:14px;background:${fairyPaper(1)} padding-box,repeating-conic-gradient(#e9a3a0 0 25%,#fbf3e6 0 50%) 0 0/14px 14px border-box;box-shadow:0 6px 0 rgba(74,64,52,.18),0 10px 24px rgba(40,30,20,.22);}`,
        `${s}::before,${s}::after{display:none;}`,
        `${s} .igs-fx-title-main::before,${s} .igs-fx-title-main::after{${mark(12, '#e0b45a', FAIRY_SPARKLE_MASK)}}`,
        `${s} .igs-fx-title-sub{color:#6f8250;}`,
    ],
    // 血色噩梦：黑底通栏、地点字下压一道血色错影，末尾一颗血滴。
    [DIALOG_SKIN_HORROR_GORE]: (s) => [
        `${s} .igs-fx-title-main{text-shadow:2px 3px 0 #d1121b,0 2px 8px rgba(0,0,0,.95);}`,
        `${s}::after{width:12px;height:15px;background:#d1121b;${mask(HORROR_DROP_MASK)}}`,
    ],
    // 心理恐怖：表面是粉色校园风的圆角卡，末尾一颗小爱心。
    [DIALOG_SKIN_HORROR_PSYCH]: (s) => [
        `${s}{${CARD}border:2px solid rgba(224,119,157,.55);border-radius:16px;background:rgba(255,250,252,.95);box-shadow:0 4px 0 rgba(224,119,157,.35);}`,
        `${s}::before{display:none;}`,
        `${s}::after{width:15px;height:13px;background:#e0779d;${mask(HORROR_HEART_MASK)}}`,
    ],
    // 日间简约：左侧贴边的暗色渐隐名条，带三色竖标，字靠左排。
    [DIALOG_SKIN_DAY_MINIMAL]: (s) => [
        `${s}{right:auto;align-items:flex-start;padding:10px 96px 11px 24px;gap:2px;color:#f7f5ee;text-shadow:0 1px 2px rgba(0,0,0,.45);background:linear-gradient(180deg,#e0826c 0 33.3%,#ebe5d0 33.3% 66.6%,#b9c4a2 66.6%) left top/4px 100% no-repeat,linear-gradient(90deg,#333,#3a3935 55%,rgba(95,94,83,.75) 78%,transparent);}`,
        `${s}::before,${s}::after{display:none;}`,
        `${s} .igs-fx-title-main{padding-left:0;}`,
        `${s} .igs-fx-title-sub{color:#ebe5d0;}`,
    ],
    [DIALOG_SKIN_WARM_PICTUREBOOK]: (s) => [`${s} .igs-fx-title-sub{${PILL('#4f9a92', '#f4efe9')}}`],
    [DIALOG_SKIN_PLANT_COFFEE]: (s) => [`${s} .igs-fx-title-sub{${PILL('#a5bf6b', '#fff')}}`],
    [DIALOG_SKIN_CUTE_PINK]: (s) => [`${s} .igs-fx-title-sub{${PILL('linear-gradient(180deg,#f29ab5,#e5779a)', '#fff')}}`],
    // 黑白漫画：网点卡 + 粗框硬投影，地点白描边粗斜体，时间压在黑底小条里。
    [DIALOG_SKIN_BLACK_WHITE_MANGA]: (s) => [
        `${s} .igs-fx-title-main{font-style:italic;font-weight:800;text-shadow:${stroke('#fff')},3px 3px 0 rgba(23,20,18,.2);}`,
        `${s} .igs-fx-title-sub{margin-top:4px;padding:1px 10px;background:#171412;color:#fff;text-shadow:none;opacity:1;}`,
    ],
    [DIALOG_SKIN_RETRO_JAPANESE]: (s) => [`${s} .igs-fx-title-sub{color:#8e2c2c;}`],
    [DIALOG_SKIN_ADVENTURE_JOURNEY]: (s) => [`${s} .igs-fx-title-sub{color:#e0b06e;}`],
    // 全息终端：地点两侧各一枚折角准星，时间像屏幕读数一样拉开字距。
    [DIALOG_SKIN_SCIFI_HOLO]: (s) => [
        `${s} .igs-fx-title-main::before,${s} .igs-fx-title-main::after{${mark(11, SCIFI_HOLO, SCIFI_RETICLE_MASK)}filter:drop-shadow(0 0 3px ${scifiHolo('.8')});}`,
        `${s} .igs-fx-title-sub{color:${scifiHolo('.9')};letter-spacing:.3em;}`,
    ],
    // 废土锈铁：锈铁卡底边一条黄黑警示条，时间像喷漆字一样拉开字距。
    [DIALOG_SKIN_WASTELAND_RUST]: (s) => [
        `${s}::after{display:block;content:"";position:absolute;left:0;right:0;top:auto;bottom:0;width:auto;height:5px;margin:0;transform:none;opacity:.9;background:${wastelandStripes(6)};}`,
        `${s} .igs-fx-title-sub{margin-top:6px;color:${WASTELAND_HAZARD};letter-spacing:.3em;text-indent:.3em;text-shadow:0 0 5px rgba(227,174,47,.3),0 2px 0 rgba(0,0,0,.6);opacity:1;}`,
    ],
});

function titleThemeRules(skin, theme) {
    const s = `#igs-overlay[data-igs-dialog-skin="${skin}"] .igs-fx-title-card:not(.is-ancient)`;
    const v = theme.vars || {};
    const ink = v.ink || '#fff';
    const halo = v['title-halo'] || v.halo || 'none';
    const rules = [`${s}{${theme.font ? `font-family:${theme.font};` : ''}color:${ink};text-shadow:${halo};}`];
    if (theme.card) {
        rules.push(`${s}{${CARD}${theme.card}}`, `${s}::before,${s}::after{display:none;}`);
    } else {
        // 纱底：字底下一条两端化开的通栏，上下细线换成主题线色。
        const veil = v.veil || 'rgba(0,0,0,.6)';
        rules.push(`${s}{padding:18px 0 16px;background:linear-gradient(90deg,transparent,${veil} 22%,${veil} 78%,transparent);}`);
        if (v.rule && v.rule !== 'transparent') rules.push(`${s}::before,${s}::after{background:linear-gradient(90deg,transparent,${v.rule},transparent);}`);
    }
    rules.push(`${s} .igs-fx-title-sub{opacity:.92;}`);
    if (TITLE_EXTRAS[skin]) rules.push(...TITLE_EXTRAS[skin](s));
    return rules.join('\n');
}

export function getDialogThemeTitleCardStyleText(skin) {
    const theme = getBattleTheme(skin);
    return theme ? titleThemeRules(skin, theme) : '';
}
