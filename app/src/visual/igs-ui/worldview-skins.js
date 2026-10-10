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
import { DIALOG_SKIN_XIANXIA_INK } from './dialog-theme-xianxia.js';
import { DIALOG_SKIN_FAIRY_TALE } from './dialog-theme-fairytale.js';
import { DIALOG_SKIN_HORROR_GORE, DIALOG_SKIN_HORROR_PSYCH } from './dialog-theme-horror.js';
import { DIALOG_SKIN_SCIFI_HOLO } from './dialog-theme-scifi.js';
import { DIALOG_SKIN_WASTELAND_RUST } from './dialog-theme-wasteland.js';
import { listDlcSkins } from './dlc-skin-registry.js';
import { DIALOG_SKIN_MERMAID } from './dialog-theme-mermaid.js';
import { resolvePlaceAmbience } from '../../scene/place-ambience.js';

// 世界观 → 推荐的对话框皮肤，第一个是该世界观的默认皮肤。主界面选世界观页按这张表出小样与预选；
// 不在表里的皮肤仍可在「其他皮肤」里选，存进角色卡后照样生效。现代排在第一的是默认皮肤，老用户不选也不变样。
export const WORLDVIEW_DIALOG_SKINS = Object.freeze({
    modern: Object.freeze([DIALOG_SKIN_DEFAULT, DIALOG_SKIN_DAY_MINIMAL, DIALOG_SKIN_PLANT_COFFEE, DIALOG_SKIN_CUTE_PINK, DIALOG_SKIN_WARM_PICTUREBOOK, DIALOG_SKIN_BLACK_WHITE_MANGA, DIALOG_SKIN_GRADIENT_VEIL]),
    ancient: Object.freeze([DIALOG_SKIN_QINGLV, DIALOG_SKIN_XIANXIA_INK]),
    fantasy: Object.freeze([DIALOG_SKIN_ELEGANT_EUROPEAN, DIALOG_SKIN_WESTERN_CLASSIC, DIALOG_SKIN_ADVENTURE_JOURNEY, DIALOG_SKIN_FAIRY_TALE]),
    scifi: Object.freeze([DIALOG_SKIN_SCIFI_HOLO, DIALOG_SKIN_GRADIENT_VEIL]),
    apocalypse: Object.freeze([DIALOG_SKIN_WASTELAND_RUST, DIALOG_SKIN_GRADIENT_VEIL]),
    taisho: Object.freeze([DIALOG_SKIN_RETRO_JAPANESE]),
    magic: Object.freeze([DIALOG_SKIN_MAGIC_ACADEMY, DIALOG_SKIN_FAIRY_TALE, DIALOG_SKIN_WARM_PICTUREBOOK]),
    horror: Object.freeze([DIALOG_SKIN_HORROR_GORE, DIALOG_SKIN_HORROR_PSYCH]),
});

export function worldviewDialogSkins(worldview) {
    const id = normalizeWorldview(worldview);
    const list = WORLDVIEW_DIALOG_SKINS[id] || WORLDVIEW_DIALOG_SKINS.modern;
    // DLC 皮肤声明了适用世界观的，排在内置推荐之后。
    const extra = listDlcSkins().filter((def) => def.worldviews.includes(id)).map((def) => def.id);
    return extra.length ? [...list, ...extra] : list;
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

// 场景在水下（地点词同水下氛围，见 place-ambience）时，这一页的对话框自动换成深海人鱼；离开水下就回到原皮肤。
// 只改每页渲染快照里的拷贝，不写回设置；readerSettings.underwaterSkin 关掉则不换。
export function sceneDialogSkin(readerSettings, location) {
    if (!readerSettings || readerSettings.underwaterSkin === false) return readerSettings;
    const place = resolvePlaceAmbience(location, { worldview: readerSettings._worldview });
    if (place && place.kind === 'underwater') readerSettings.dialogSkin = DIALOG_SKIN_MERMAID;
    return readerSettings;
}
