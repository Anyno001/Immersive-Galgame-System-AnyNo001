// 魔法星夜按说话角色换学院色：手动指定（sceneAssets.characterHouses）→ 角色 DNA 里写到的学院 → 全局「学院配色」。
// 旁白、未登记角色与识别不出学院的角色都落回全局配色。
import { MAGIC_HOUSES, normalizeMagicHouse } from './dialog-theme-css-skins.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const isHouse = (value) => MAGIC_HOUSES.some((house) => house.id === value);

// 学院名、英文名与俗称；按出现先后取第一个命中，写了多个学院的身份以先写的为准。
export const MAGIC_HOUSE_KEYWORDS = Object.freeze({
    scarlet: Object.freeze(['格兰芬多', '葛來分多', 'gryffindor', '狮院', '獅院']),
    emerald: Object.freeze(['斯莱特林', '史萊哲林', 'slytherin', '蛇院']),
    sapphire: Object.freeze(['拉文克劳', '雷文克勞', 'ravenclaw', '鹰院', '鷹院']),
    amber: Object.freeze(['赫奇帕奇', '赫夫帕夫', 'hufflepuff', '獾院']),
});

export function normalizeCharacterHouses(raw) {
    const out = {};
    const source = plainObject(raw);
    if (!source) return out;
    for (const [key, value] of Object.entries(source)) {
        const name = String(key || '').trim();
        if (!name || FORBIDDEN_KEYS.has(name) || hasOwn(out, name) || !isHouse(value)) continue;
        out[name] = value;
    }
    return out;
}

export function detectMagicHouse(text) {
    const source = String(text || '').toLowerCase();
    if (!source) return '';
    let best = '';
    let bestAt = Infinity;
    for (const [house, words] of Object.entries(MAGIC_HOUSE_KEYWORDS)) {
        for (const word of words) {
            const at = source.indexOf(word);
            if (at >= 0 && at < bestAt) {
                best = house;
                bestAt = at;
            }
        }
    }
    return best;
}

// 说话人可能写的是别名；别名表以主名为键，按主名查手动指定与 DNA。
function canonicalName(sceneAssets, name) {
    const target = String(name || '').trim();
    if (!target) return '';
    const maps = [sceneAssets.characterHouses, sceneAssets.characters, sceneAssets.characterDna].map(plainObject);
    if (maps.some((map) => map && hasOwn(map, target))) return target;
    const aliases = plainObject(sceneAssets.characterAliases) || {};
    for (const [key, values] of Object.entries(aliases)) {
        if (Array.isArray(values) && values.some((value) => String(value || '').trim() === target)) return key;
    }
    return target;
}

export function resolveCharacterMagicHouse(sceneAssets, speaker) {
    const assets = plainObject(sceneAssets);
    if (!assets) return { house: '', source: '' };
    const name = canonicalName(assets, speaker);
    if (!name) return { house: '', source: '' };
    const manual = plainObject(assets.characterHouses);
    if (manual && hasOwn(manual, name) && isHouse(manual[name])) return { house: manual[name], source: 'manual' };
    const dnaMap = plainObject(assets.characterDna);
    const dna = dnaMap && hasOwn(dnaMap, name) ? plainObject(dnaMap[name]) : null;
    const detected = dna ? detectMagicHouse(`${dna.identity || ''}\n${dna.defaultAppearance || ''}`) : '';
    return detected ? { house: detected, source: 'dna' } : { house: '', source: '' };
}

export function resolveSpeakerMagicHouse(sceneAssets, speaker, fallback) {
    return resolveCharacterMagicHouse(sceneAssets, speaker).house || normalizeMagicHouse(fallback);
}
