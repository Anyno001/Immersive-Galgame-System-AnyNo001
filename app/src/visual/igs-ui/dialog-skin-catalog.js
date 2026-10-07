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

// 对话框皮肤的显示名，顺序即设置页「对话框风格」下拉的顺序；主界面选世界观页的皮肤名也从这里取。
export const DIALOG_SKIN_CHOICES = Object.freeze([
    [DIALOG_SKIN_DEFAULT, '默认'],
    [DIALOG_SKIN_WESTERN_CLASSIC, '西欧古典'],
    [DIALOG_SKIN_ELEGANT_EUROPEAN, '优雅欧式'],
    [DIALOG_SKIN_MAGIC_ACADEMY, '魔法星夜'],
    [DIALOG_SKIN_RETRO_JAPANESE, '复古日式'],
    [DIALOG_SKIN_QINGLV, '青绿山水'],
    [DIALOG_SKIN_ADVENTURE_JOURNEY, '冒险旅途'],
    [DIALOG_SKIN_PLANT_COFFEE, '植物咖啡'],
    [DIALOG_SKIN_WARM_PICTUREBOOK, '温暖绘本'],
    [DIALOG_SKIN_FAIRY_TALE, '童话小镇'],
    [DIALOG_SKIN_DAY_MINIMAL, '日间简约'],
    [DIALOG_SKIN_BLACK_WHITE_MANGA, '黑白漫画'],
    [DIALOG_SKIN_CUTE_PINK, '超可爱粉'],
    [DIALOG_SKIN_GRADIENT_VEIL, '渐变黑幕'],
    [DIALOG_SKIN_HORROR_GORE, '血色噩梦'],
    [DIALOG_SKIN_HORROR_PSYCH, '褪色病历'],
].map((pair) => Object.freeze(pair)));

export function dialogSkinLabel(id) {
    const skin = normalizeDialogSkin(id);
    const hit = DIALOG_SKIN_CHOICES.find(([key]) => key === skin);
    return hit ? hit[1] : DIALOG_SKIN_CHOICES[0][1];
}
