// 立绘默认高度：没被「调整立绘」单独调过的立绘，先看角色自定义高度，再看性别默认高度（开关打开时按 DNA 判断），最后是立绘基准高度。
import { normalizeSpriteDefaultScale, normalizeSpriteGenderScale, normalizeSpriteHeight } from './settings-normalize.js';
import { canonicalName, characterDnaGender } from './voice-bark.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

// 角色自定义高度和声线一样按主名记在根素材库：{ 角色名: 60~150 }，留空的角色不进表。
export function normalizeCharacterSpriteScales(value) {
    const out = {};
    for (const [name, height] of Object.entries(plain(value) || {})) {
        const key = String(name || '').trim();
        const scale = normalizeSpriteHeight(height);
        if (key && !FORBIDDEN_KEYS.has(key) && scale != null) out[key] = scale;
    }
    return out;
}

// 返回 { characterScale, defaultScale, source }：characterScale 只在角色自定义时有值，交给 resolveSpriteLayout 压过模式整体缩放；
// source 为 manual / female / male / other / base，设置页据此显示「自动」用的是哪一档。
export function resolveSpriteBaseScale(sceneAssets, readerSettings, character) {
    const assets = plain(sceneAssets) || {};
    const reader = plain(readerSettings) || {};
    const base = normalizeSpriteDefaultScale(reader.spriteDefaultScale);
    const name = canonicalName(assets, character);
    if (!name) return { characterScale: null, defaultScale: base, source: 'base' };
    const manualMap = plain(assets.characterSpriteScales) || {};
    const manual = Object.hasOwn(manualMap, name) ? normalizeSpriteHeight(manualMap[name]) : null;
    if (manual != null) return { characterScale: manual, defaultScale: base, source: 'manual' };
    const genders = normalizeSpriteGenderScale(reader.spriteGenderScale);
    if (!genders.enabled) return { characterScale: null, defaultScale: base, source: 'base' };
    const gender = characterDnaGender(assets, name) || 'other';
    return { characterScale: null, defaultScale: genders[gender], source: gender };
}
