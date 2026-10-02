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

// 设置页只列真有素材的旧预设；空壳不算「识别到」，免得顶部常驻一块点了也没东西的入口。
export function legacyPresetHasContent(preset) {
    return ['scenes', 'characters', 'wardrobe', 'characterOutfits'].some((key) => Object.keys(cleanMap(plain(preset)[key])).length > 0);
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

// ── 预设库：v0.34.2 起把预设当存档 / 模板用，和旧版共用同一个存储位置，旧预设直接出现在列表里。──

function readPresetStore(storage) {
    const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(LEGACY_PRESET_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    return {
        presets: parsed && isPlain(parsed.presets) ? parsed.presets : {},
        active: parsed && typeof parsed.active === 'string' ? parsed.active : '',
    };
}

function writePresetStore(storage, update) {
    try {
        const store = readPresetStore(storage);
        const presets = update({ ...store.presets });
        storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets, active: store.active }));
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: 'store-write-failed', saveError: error };
    }
}

export function isValidPresetName(name) {
    const label = String(name || '').trim();
    return Boolean(label) && !BLOCKED.has(label) && label.length <= 40;
}

// 这张卡实际在用的一套素材（本卡盖在全局上），存成和旧版一样格式的预设，导出的文件旧版也能读。
export function presetFromAssets(effective, { root = {}, readerSettings = {} } = {}) {
    const source = plain(effective);
    const preset = {};
    for (const field of NAME_FIELDS) preset[field] = clone(cleanMap(source[field]));
    preset.generated = clone(plain(source.generated));
    preset.characterHouses = clone(cleanMap(plain(root).characterHouses));
    for (const field of ['moodGroups', 'timeGroups', 'weatherGroups']) {
        preset[field] = Array.isArray(plain(root)[field]) ? clone(root[field]) : [];
    }
    preset.worldview = resolveWorldview(source);
    preset.spriteLayouts = clone(cleanMap(plain(readerSettings).spriteLayouts));
    preset.spriteHeads = clone(cleanMap(plain(readerSettings).spriteHeads));
    return preset;
}

export function writeNamedPreset(storage, name, preset) {
    if (!isValidPresetName(name) || !isLegacyPresetData(preset)) return { ok: false, reason: 'bad-preset' };
    return writePresetStore(storage, (presets) => ({ ...presets, [String(name).trim()]: preset }));
}

export function removeNamedPreset(storage, name) {
    return writePresetStore(storage, (presets) => {
        delete presets[name];
        return presets;
    });
}

export function renameNamedPreset(storage, from, to) {
    const next = String(to || '').trim();
    if (!isValidPresetName(next)) return { ok: false, reason: 'bad-name' };
    return writePresetStore(storage, (presets) => {
        if (!Object.prototype.hasOwnProperty.call(presets, from)) return presets;
        const out = {};
        for (const [key, value] of Object.entries(presets)) out[key === from ? next : key] = value;
        return out;
    });
}

// 整层换成预设：场景、角色、衣柜等按名字的素材和生成图索引都以预设为准，原来的不留。
export function replaceLibraryWithPack(target, pack) {
    const lib = plain(pack && pack.library);
    for (const field of NAME_FIELDS) target[field] = clone(plain(lib[field]));
    const incoming = plain(lib.generated);
    target.generated = {};
    for (const field of GENERATED_FIELDS) target.generated[field] = clone(plain(incoming[field]));
    return target;
}

// 分层预设：顶层字段是全局那一层（旧版也能当普通预设读），scopeCards 记着存的时候所在那张卡的本卡素材，
// 套用时各回各层：全局回全局，本卡部分回它原来那张卡，不会塞进当前打开的别的卡。
export function layeredPresetFromRoot(root, { cardKey = '', cardLabel = '', readerSettings = {} } = {}) {
    const source = plain(root);
    const preset = presetFromAssets(source, { root: source, readerSettings });
    const card = cardKey ? plain(plain(source.cards)[cardKey]) : null;
    if (card) {
        const library = {};
        for (const field of NAME_FIELDS) library[field] = clone(cleanMap(card[field]));
        library.generated = clone(plain(card.generated));
        if (typeof card.worldview === 'string') library.worldview = card.worldview;
        preset.scopeCards = { [cardKey]: { label: cardLabel || cardKey.replace(/^card:/, ''), library } };
    }
    return preset;
}

export function presetCardLayers(preset) {
    const out = [];
    for (const [key, entry] of Object.entries(plain(plain(preset).scopeCards))) {
        if (!key.trim() || BLOCKED.has(key) || !isPlain(entry) || !isPlain(entry.library)) continue;
        const pack = legacyPresetToPack({ ...entry.library, scenes: plain(entry.library.scenes), characters: plain(entry.library.characters) });
        out.push({ key, label: typeof entry.label === 'string' && entry.label ? entry.label : key, pack, worldview: typeof entry.library.worldview === 'string' ? entry.library.worldview : '' });
    }
    return out;
}

export function isLayeredPreset(preset) {
    return isPlain(plain(preset).scopeCards);
}
