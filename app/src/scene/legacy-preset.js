// 旧版「素材预设」：v0.34.0 之前设置页可以保存 / 切换 / 导入 / 导出整套素材，存在 localStorage 的 igs:scene-presets:v1，
// 导出成一个 json（scenes / characters / characterAliases / … / spriteLayouts / spriteHeads）。
// 新版改成按角色卡和全局两层存放后，这里负责把旧预设读出来，按名字合并进某一层，不删任何已有条目。
import { normalizeCharacterOutfits, normalizeWardrobe } from './character-outfits.js';
import { normalizeCharacterDnaMap } from './character-dna.js';
import { normalizeGeneratedLibrary } from './asset-match.js';
import { resolveWorldview } from './worldview.js';

export const LEGACY_PRESET_KEY = 'igs:scene-presets:v1';

const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const isPlain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
const NAME_FIELDS = ['scenes', 'characters', 'characterAliases', 'characterDna', 'characterOutfits', 'wardrobe', 'statusAvatars'];
const GENERATED_FIELDS = ['scenes', 'characters', 'characterAliases', 'expressionNotes'];

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

// 旧预设文件没有 format 字段，至少带 scenes / characters 之一。新版的角色卡包和全局配置都是 zip，不会走到这里。
export function isLegacyPresetData(data) {
    if (!isPlain(data) || typeof data.format === 'string') return false;
    return isPlain(data.scenes) || isPlain(data.characters);
}

function cleanMap(value) {
    const out = {};
    for (const [key, item] of Object.entries(plain(value))) {
        const name = String(key).trim();
        if (name && !BLOCKED.has(name)) out[name] = item;
    }
    return out;
}

// 旧预设 → 新版一份素材库 + 跟着走的阅读器 / 词库数据。缺的字段按空处理。
export function legacyPresetToPack(data) {
    const source = plain(data);
    const library = {
        scenes: cleanMap(source.scenes),
        characters: cleanMap(source.characters),
        characterAliases: cleanMap(source.characterAliases),
        characterDna: normalizeCharacterDnaMap(source.characterDna),
        characterOutfits: normalizeCharacterOutfits(source.characterOutfits),
        wardrobe: normalizeWardrobe(source.wardrobe),
        statusAvatars: cleanMap(source.statusAvatars),
        generated: normalizeGeneratedLibrary(source.generated),
    };
    // 早于世界观字段的旧文件只有 ancient 开关，false 就是现代。
    const hasWorldview = typeof source.worldview === 'string' || typeof source.ancient === 'boolean';
    return {
        library,
        characterHouses: cleanMap(source.characterHouses),
        moodGroups: Array.isArray(source.moodGroups) ? source.moodGroups : [],
        timeGroups: Array.isArray(source.timeGroups) ? source.timeGroups : [],
        weatherGroups: Array.isArray(source.weatherGroups) ? source.weatherGroups : [],
        worldview: hasWorldview ? resolveWorldview(source) : '',
        spriteLayouts: cleanMap(source.spriteLayouts),
        spriteHeads: cleanMap(source.spriteHeads),
    };
}

export function legacyPackSummary(pack) {
    const lib = plain(pack && pack.library);
    return {
        scenes: Object.keys(plain(lib.scenes)).length,
        characters: Object.keys(plain(lib.characters)).length,
        outfits: Object.values(plain(lib.characterOutfits)).reduce((sum, item) => sum + Object.keys(plain(item)).length, 0),
    };
}

// 会被覆盖的同名条目（目标里已经有、预设里也有）。只数场景和角色，给确认框用。
export function legacyPackConflicts(target, pack) {
    const lib = plain(pack && pack.library);
    const into = plain(target);
    const names = [];
    for (const field of ['scenes', 'characters']) {
        for (const name of Object.keys(plain(lib[field]))) {
            if (Object.prototype.hasOwnProperty.call(plain(into[field]), name)) names.push(name);
        }
    }
    return names;
}

// 按名字合并进 target（根上的全局库，或 cards[key]）。同名以预设为准，其他条目原样保留。
export function mergeLegacyLibrary(target, pack) {
    const lib = plain(pack && pack.library);
    for (const field of NAME_FIELDS) {
        target[field] = { ...plain(target[field]), ...clone(plain(lib[field])) };
    }
    const generated = plain(target.generated);
    const incoming = plain(lib.generated);
    target.generated = {};
    for (const field of GENERATED_FIELDS) {
        target.generated[field] = { ...plain(generated[field]), ...clone(plain(incoming[field])) };
    }
    return target;
}

// 浏览器里还留着的旧预设。新版不再写这一项，读坏了就当没有。
export function loadLegacyPresets(storage) {
    try {
        const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(LEGACY_PRESET_KEY) : null;
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        const presets = parsed && isPlain(parsed.presets) ? parsed.presets : {};
        const out = {};
        for (const [name, preset] of Object.entries(presets)) {
            if (String(name).trim() && !BLOCKED.has(name) && isLegacyPresetData(preset)) out[name] = preset;
        }
        return out;
    } catch (error) {
        return {};
    }
}

// 旧版全局配置 zip 里带的预设：写回同一个存储位置，和本机原有的合并（同名以文件为准），之后在设置页找回。
export function storeLegacyPresets(storage, presets) {
    const incoming = {};
    for (const [name, preset] of Object.entries(plain(presets))) {
        if (String(name).trim() && !BLOCKED.has(name) && isLegacyPresetData(preset)) incoming[name] = preset;
    }
    if (!Object.keys(incoming).length) return { ok: true, count: 0 };
    try {
        const raw = storage.getItem(LEGACY_PRESET_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const current = parsed && isPlain(parsed.presets) ? parsed.presets : {};
        const active = parsed && typeof parsed.active === 'string' ? parsed.active : '';
        storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { ...current, ...incoming }, active }));
        return { ok: true, count: Object.keys(incoming).length };
    } catch (error) {
        return { ok: false, reason: 'store-write-failed', saveError: error };
    }
}
