import { LIVE_PHONE_MODELS, LIVE_PHONE_MODEL_LABELS, LIVE_PHONE_SIZES } from './danmaku-settings.js';

// 「我的手机」：直播、社区、风暴、线上聊天共用的一台手机外观。
export const PHONE_MODELS = LIVE_PHONE_MODELS;
export const PHONE_MODEL_LABELS = LIVE_PHONE_MODEL_LABELS;
export const PHONE_SIZES = LIVE_PHONE_SIZES;
export const PHONE_RINGTONES = Object.freeze(['classic', 'soft', 'none']);
export const PHONE_RINGTONE_LABELS = Object.freeze({ classic: '经典', soft: '轻柔', none: '静音' });
export const PHONE_CASE_DEFAULT = '#111215';
export const PHONE_CASE_PRESETS = Object.freeze([
    ['#111215', '曜石黑'], ['#e8e6e1', '云母白'], ['#c9ced6', '银灰'], ['#2f4a7a', '夜空蓝'],
    ['#7a2f3a', '酒红'], ['#2f6b52', '松绿'], ['#e7a8b8', '樱粉'], ['#d9b25f', '香槟金'],
]);

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const URL_RE = /^(?:https?:\/\/|data:image\/|blob:|\/|\.\/|\.\.\/)[^"'()\s]*$/;

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// 壁纸合法值：'scene' / 'none' / 'custom'（已选自定义但还没填地址）/ 图片地址。
export function normalizePhoneWallpaper(value, fallback = 'scene') {
    const text = String(value == null ? '' : value).trim();
    if (text === 'scene' || text === 'none' || text === 'custom') return text;
    if (text && URL_RE.test(text) && text.length <= 2000) return text;
    return fallback;
}

// legacy 是旧的 liveFx：myPhone 缺 model / size 时沿用它。
export function normalizeMyPhone(value, legacy) {
    const src = plain(value);
    const old = plain(legacy);
    const model = PHONE_MODELS.includes(src.model) ? src.model : (PHONE_MODELS.includes(old.model) ? old.model : 'full');
    const size = PHONE_SIZES.includes(src.size) ? src.size : (PHONE_SIZES.includes(old.size) ? old.size : 'large');
    const caseColor = HEX_RE.test(String(src.caseColor || '')) ? String(src.caseColor).toLowerCase() : PHONE_CASE_DEFAULT;
    return {
        model,
        size,
        caseColor,
        wallpaper: normalizePhoneWallpaper(src.wallpaper),
        ringtone: PHONE_RINGTONES.includes(src.ringtone) ? src.ringtone : 'classic',
    };
}

// 从整份 readerSettings 取出我的手机（含旧 liveFx 迁移）。
export function myPhoneOf(reader) {
    const src = plain(reader);
    return normalizeMyPhone(src.myPhone, src.liveFx);
}

// 屏幕底图实际地址：scene 用当前场景背景，none 与未填的自定义为空。
export function phoneWallUrl(look, sceneUrl = '') {
    const wall = look && look.wallpaper;
    if (wall === 'none' || wall === 'custom') return '';
    if (!wall || wall === 'scene') return sceneUrl || '';
    return wall;
}

// 写在手机根上；签名没变就不碰 DOM。model 为空时不写机型（聊天层只借壳色）。
export function applyPhoneLook(phoneEl, look) {
    if (!phoneEl || !look) return false;
    const model = PHONE_MODELS.includes(look.model) ? look.model : '';
    const color = HEX_RE.test(String(look.caseColor || '')) ? look.caseColor : '';
    const wall = look.wallpaper && !['scene', 'none', 'custom'].includes(look.wallpaper) ? look.wallpaper : '';
    const mode = wall ? 'image' : (look.wallpaper === 'none' ? 'none' : 'scene');
    const sig = `${model}|${color}|${mode}|${wall}`;
    if (phoneEl.__igsPhoneLook === sig) return false;
    phoneEl.__igsPhoneLook = sig;
    if (model) phoneEl.setAttribute('data-model', model);
    if (color) phoneEl.style.setProperty('--igs-phone-case', color);
    else phoneEl.style.removeProperty('--igs-phone-case');
    if (look.wallpaper !== undefined) {
        phoneEl.setAttribute('data-wall', mode);
        if (wall) phoneEl.style.setProperty('--igs-phone-wall', `url("${wall}")`);
        else phoneEl.style.removeProperty('--igs-phone-wall');
    }
    return true;
}
