import { normalizeWorldview } from '../../scene/worldview.js';
import { normalizeHorrorStyle } from '../../scene/horror.js';
import {
    DIALOG_SKIN_ADVENTURE_JOURNEY,
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_DAY_MINIMAL,
    DIALOG_SKIN_DEFAULT,
    DIALOG_SKIN_ELEGANT_EUROPEAN,
    DIALOG_SKIN_GRADIENT_VEIL,
    DIALOG_SKIN_PLANT_COFFEE,
    DIALOG_SKIN_RETRO_JAPANESE,
    DIALOG_SKIN_WARM_PICTUREBOOK,
    DIALOG_SKIN_WESTERN_CLASSIC,
    normalizeDialogSkin,
} from './classic-dialog-skin.js';
import { DIALOG_SKIN_MAGIC_ACADEMY } from './dialog-theme-css-skins.js';
import { DIALOG_SKIN_QINGLV } from './dialog-theme-guofeng.js';
import { DIALOG_SKIN_FAIRY_TALE } from './dialog-theme-fairytale.js';
import { DIALOG_SKIN_HORROR_GORE, DIALOG_SKIN_HORROR_PSYCH } from './dialog-theme-horror.js';

// 世界观 → 推荐的对话框皮肤，第一个是该世界观的默认皮肤。主界面选世界观页按这张表出小样与预选；
// 不在表里的皮肤仍可在「其他皮肤」里选，存进角色卡后照样生效。现代排在第一的是默认皮肤，老用户不选也不变样。
export const WORLDVIEW_DIALOG_SKINS = Object.freeze({
    modern: Object.freeze([DIALOG_SKIN_DEFAULT, DIALOG_SKIN_DAY_MINIMAL, DIALOG_SKIN_PLANT_COFFEE, DIALOG_SKIN_CUTE_PINK, DIALOG_SKIN_WARM_PICTUREBOOK, DIALOG_SKIN_BLACK_WHITE_MANGA, DIALOG_SKIN_GRADIENT_VEIL]),
    ancient: Object.freeze([DIALOG_SKIN_QINGLV]),
    fantasy: Object.freeze([DIALOG_SKIN_ELEGANT_EUROPEAN, DIALOG_SKIN_WESTERN_CLASSIC, DIALOG_SKIN_ADVENTURE_JOURNEY, DIALOG_SKIN_FAIRY_TALE]),
    scifi: Object.freeze([DIALOG_SKIN_GRADIENT_VEIL, DIALOG_SKIN_DEFAULT]),
    apocalypse: Object.freeze([DIALOG_SKIN_GRADIENT_VEIL, DIALOG_SKIN_DEFAULT]),
    taisho: Object.freeze([DIALOG_SKIN_RETRO_JAPANESE]),
    magic: Object.freeze([DIALOG_SKIN_MAGIC_ACADEMY, DIALOG_SKIN_FAIRY_TALE, DIALOG_SKIN_WARM_PICTUREBOOK]),
    horror: Object.freeze([DIALOG_SKIN_HORROR_GORE, DIALOG_SKIN_HORROR_PSYCH]),
});

export function worldviewDialogSkins(worldview) {
    return WORLDVIEW_DIALOG_SKINS[normalizeWorldview(worldview)] || WORLDVIEW_DIALOG_SKINS.modern;
}

// 选中某个世界观时预选的皮肤：这张卡记过且在推荐里 → 全局皮肤在推荐里 → 恐怖的心理风格用褪色病历 → 推荐第一个。
export function pickWorldviewDialogSkin(worldview, { cardSkin, globalSkin, horrorStyle } = {}) {
    const list = worldviewDialogSkins(worldview);
    for (const candidate of [cardSkin, globalSkin]) {
        const skin = typeof candidate === 'string' && candidate ? normalizeDialogSkin(candidate) : '';
        if (skin && list.includes(skin)) return skin;
    }
    if (normalizeWorldview(worldview) === 'horror' && normalizeHorrorStyle(horrorStyle) === 'psych') return DIALOG_SKIN_HORROR_PSYCH;
    return list[0];
}

// 阅读器实际用的皮肤：角色卡记了就用卡上的，否则用全局设置。
export function effectiveDialogSkin(globalSkin, sceneAssets) {
    const own = sceneAssets && typeof sceneAssets === 'object' && typeof sceneAssets.dialogSkin === 'string' ? sceneAssets.dialogSkin : '';
    return normalizeDialogSkin(own || globalSkin);
}
