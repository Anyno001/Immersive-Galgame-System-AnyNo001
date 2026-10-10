// 立绘默认高度：没被「调整立绘」单独调过的立绘，先看角色自定义高度，再看性别默认高度（开关打开时按 DNA 判断，
// 没有 DNA 时看生成立绘的 tag；老人、儿童在此基础上再矮一点），最后是立绘基准高度。
import { normalizeSpriteDefaultScale, normalizeSpriteGenderScale, normalizeSpriteHeight } from './settings-normalize.js';
import { canonicalName, characterDnaGender, characterDnaText, detectVoiceGender } from './voice-bark.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

// 年龄只分老人、儿童两档。先认明写的岁数（60 岁以上 / 12 岁以下，写了成年岁数就不再看称呼），再认称呼与 tag；
// 刻意不认单字「老」（老师、老板）、elder（elder sister）和爷爷奶奶这类亲属称呼，childhood friend 也不会误中 child。
const AGE_NUMBER_RE = /(\d{1,3})\s*(?:岁|周岁|歳|years?\s*old)/i;
const ELDER_RE = /\b(?:old (?:man|woman|lady)|elderly|grandpa|grandma)\b|老人|老者|老头|老太|老妇|老翁|老妪|老爷爷|老奶奶|老婆婆|老爷子|年迈|年老|垂暮|花甲|古稀|耄耋|白发苍苍/i;
const CHILD_RE = /\b(?:child|kid|toddler|loli|shota|little (?:girl|boy))\b|儿童|小孩|孩童|幼童|幼女|幼儿|女童|男童|小女孩|小男孩|萝莉|正太|小学生/i;

export function detectSpriteAge(text) {
    const value = String(text || '');
    const number = value.match(AGE_NUMBER_RE);
    if (number) {
        const years = Number(number[1]);
        return years >= 60 ? 'elder' : years <= 12 ? 'child' : '';
    }
    const elder = ELDER_RE.test(value);
    const child = CHILD_RE.test(value);
    return elder === child ? '' : elder ? 'elder' : 'child';
}

// 角色自定义高度和声线一样按主名记在根素材库：{ 角色名: 高度 }，留空的角色不进表。
export function normalizeCharacterSpriteScales(value) {
    const out = {};
    for (const [name, height] of Object.entries(plain(value) || {})) {
        const key = String(name || '').trim();
        const scale = normalizeSpriteHeight(height);
        if (key && !FORBIDDEN_KEYS.has(key) && scale != null) out[key] = scale;
    }
    return out;
}

// 返回 { characterScale, defaultScale, source, age? }：characterScale 只在角色自定义时有值，交给 resolveSpriteLayout 压过模式整体缩放；
// source 为 manual / female / male / other / base，按性别取高度时另给 age（elder / child / ''），设置页据此显示「自动」用的是哪一档。
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
    // 变身形态优先（characterDnaGender 自带覆盖）；其次 DNA，再次待确认 / 仅本聊天立绘的生成 tag。
    const dnaText = characterDnaText(assets, name);
    const tempTags = plain(reader._tempSpriteTags) || {};
    const tagText = Object.hasOwn(tempTags, name) ? tempTags[name] : '';
    const gender = characterDnaGender(assets, name) || detectVoiceGender(tagText) || 'other';
    const age = detectSpriteAge(dnaText) || detectSpriteAge(tagText);
    const shorter = age === 'elder' ? genders.elderShorter : age === 'child' ? genders.childShorter : 0;
    // 矮一截后给个 10% 下限，免得性别默认本来就低时减成 0 或负数。
    return { characterScale: null, defaultScale: Math.max(10, genders[gender] - shorter), source: gender, age };
}
