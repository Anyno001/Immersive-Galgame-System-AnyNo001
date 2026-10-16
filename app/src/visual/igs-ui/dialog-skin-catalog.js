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
import { DIALOG_SKIN_MERMAID } from './dialog-theme-mermaid.js';
import { DIALOG_SKIN_FAIRY_TALE } from './dialog-theme-fairytale.js';
import { DIALOG_SKIN_HORROR_GORE, DIALOG_SKIN_HORROR_PSYCH } from './dialog-theme-horror.js';
import { DIALOG_SKIN_SCIFI_HOLO } from './dialog-theme-scifi.js';
import { DIALOG_SKIN_WASTELAND_RUST } from './dialog-theme-wasteland.js';
import { getDlcSkin, isDlcSkinId, listDlcSkins } from './dlc-skin-registry.js';

// 对话框皮肤的显示名，顺序即设置页「对话框风格」下拉的顺序；主界面选世界观页的皮肤名也从这里取。
export const DIALOG_SKIN_CHOICES = Object.freeze([
    [DIALOG_SKIN_GRADIENT_VEIL, '渐变黑幕'],
    [DIALOG_SKIN_DEFAULT, '磨砂玻璃'],
    [DIALOG_SKIN_WESTERN_CLASSIC, '西欧古典'],
    [DIALOG_SKIN_ELEGANT_EUROPEAN, '优雅欧式'],
    [DIALOG_SKIN_MAGIC_ACADEMY, '魔法星夜'],
    [DIALOG_SKIN_MERMAID, '深海人鱼'],
    [DIALOG_SKIN_RETRO_JAPANESE, '复古日式'],
    [DIALOG_SKIN_QINGLV, '青绿山水'],
    [DIALOG_SKIN_ADVENTURE_JOURNEY, '冒险旅途'],
    [DIALOG_SKIN_PLANT_COFFEE, '植物咖啡'],
    [DIALOG_SKIN_WARM_PICTUREBOOK, '温暖绘本'],
    [DIALOG_SKIN_FAIRY_TALE, '童话小镇'],
    [DIALOG_SKIN_DAY_MINIMAL, '日间简约'],
    [DIALOG_SKIN_BLACK_WHITE_MANGA, '黑白漫画'],
    [DIALOG_SKIN_CUTE_PINK, '超可爱粉'],
    [DIALOG_SKIN_SCIFI_HOLO, '全息投影'],
    [DIALOG_SKIN_WASTELAND_RUST, '废土锈铁'],
    [DIALOG_SKIN_HORROR_GORE, '血色噩梦'],
    [DIALOG_SKIN_HORROR_PSYCH, '褪色病历'],
].map((pair) => Object.freeze(pair)));

// 内置皮肤 + 已登记的 DLC 皮肤（排在最后）。current 是存档里的 DLC 皮肤但这次没加载时，补一项「未加载」，
// 下拉框才不会把用户的选择显示成别的皮肤。
export function getDialogSkinChoices(current) {
    const dlc = listDlcSkins().map((def) => [def.id, `${def.label} · DLC`]);
    const missing = isDlcSkinId(current) && !getDlcSkin(current) ? [[current, `${current}（DLC 未加载）`]] : [];
    return dlc.length || missing.length ? [...DIALOG_SKIN_CHOICES, ...dlc, ...missing] : DIALOG_SKIN_CHOICES;
}

export function dialogSkinLabel(id) {
    const skin = normalizeDialogSkin(id);
    if (isDlcSkinId(skin)) {
        const def = getDlcSkin(skin);
        return def ? def.label : `${skin}（DLC 未加载）`;
    }
    const hit = DIALOG_SKIN_CHOICES.find(([key]) => key === skin);
    return hit ? hit[1] : DIALOG_SKIN_CHOICES[0][1];
}
