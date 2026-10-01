import { lookupSceneBackground, lookupSceneAssetUrls, resolveCharacterKey, lookupAssetValue } from './scene-directives.js';
import { OUTFIT_RESET, outfitsOfCharacter } from './character-outfits.js';

export const GENERATED_ASSET_URL_PREFIX = 'igs-gen:';

// 这些说话人不是需要立绘的具体角色（旁白、玩家自称、系统提示等）。
const NON_SPRITE_SPEAKERS = new Set(['旁白', '叙述', '系统', '我', '你', '主角', 'user', '{{user}}', 'narrator', 'system']);

const TRUSTED = new Set(['exact', 'alias', 'fuzzy-strong']);

export function isGeneratedAssetUrl(url) {
    return typeof url === 'string' && url.startsWith(GENERATED_ASSET_URL_PREFIX);
}

export function generatedAssetIdOf(url) {
    return isGeneratedAssetUrl(url) ? url.slice(GENERATED_ASSET_URL_PREFIX.length) : '';
}

const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// 生成区与用户上传区分开存放：bridge.sceneAssets.generated = { scenes, characters, characterAliases }，
// 结构与用户区一致，图片地址统一是 igs-gen:<imageId>，图片本体在 IndexedDB。
function normalizeExpressionNotes(value) {
    const src = plainObject(value);
    const out = {};
    for (const [name, moods] of Object.entries(src)) {
        const bucket = {};
        for (const [mood, note] of Object.entries(plainObject(moods))) {
            const item = plainObject(note);
            const positive = typeof item.positive === 'string' ? item.positive : '';
            const negative = typeof item.negative === 'string' ? item.negative : '';
            const error = typeof item.error === 'string' ? item.error : '';
            const caption = item.caption && typeof item.caption === 'object' && !Array.isArray(item.caption)
                ? item.caption : null;
            if (!String(mood || '').trim() || (!positive && !negative && !error && !caption)) continue;
            bucket[String(mood).trim()] = { positive, negative, error, ...(caption ? { caption } : {}) };
        }
        if (Object.keys(bucket).length) out[name] = bucket;
    }
    return out;
}

export function normalizeGeneratedLibrary(value) {
    const src = plainObject(value);
    return {
        scenes: plainObject(src.scenes),
        characters: plainObject(src.characters),
        characterAliases: plainObject(src.characterAliases),
        expressionNotes: normalizeExpressionNotes(src.expressionNotes),
    };
}

export function setGeneratedExpressionImage(library, name, mood, imageId) {
    const next = JSON.parse(JSON.stringify(normalizeGeneratedLibrary(library)));
    const character = String(name || '').trim();
    const label = String(mood || '').trim();
    const id = String(imageId || '').trim();
    if (!character || !label || !id || !next.characters[character]) return { ok: false, reason: 'not-found', library: next };
    next.characters[character] = { ...plainObject(next.characters[character]), [label]: `${GENERATED_ASSET_URL_PREFIX}${id}` };
    if (next.expressionNotes[character]) {
        const notes = { ...next.expressionNotes[character] };
        delete notes[label];
        if (Object.keys(notes).length) next.expressionNotes[character] = notes;
        else delete next.expressionNotes[character];
    }
    return { ok: true, library: next };
}

export function setGeneratedExpressionNote(library, name, mood, note = {}) {
    const next = JSON.parse(JSON.stringify(normalizeGeneratedLibrary(library)));
    const character = String(name || '').trim();
    const label = String(mood || '').trim();
    if (!character || !label) return { ok: false, reason: 'not-found', library: next };
    const item = plainObject(note);
    next.expressionNotes[character] = {
        ...plainObject(next.expressionNotes[character]),
        [label]: {
            positive: typeof item.positive === 'string' ? item.positive : '',
            negative: typeof item.negative === 'string' ? item.negative : '',
            error: typeof item.error === 'string' ? item.error : '',
            ...(item.caption && typeof item.caption === 'object' ? { caption: item.caption } : {}),
        },
    };
    return { ok: true, library: next };
}

// 把一张生成立绘绑到角色立绘的「默认」。角色库没有这个名字就新建。已有的非生成默认图不覆盖。
export function bindGeneratedSprite(sceneAssets, assetName, imageUrl, { replace = false } = {}) {
    const requested = String(assetName || '').trim();
    const url = String(imageUrl || '').trim();
    const assets = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    const characters = { ...plainObject(assets.characters) };
    const aliases = { ...plainObject(assets.characterAliases) };
    if (!requested || !isGeneratedAssetUrl(url)) {
        return { ok: false, reason: 'no-image', created: false, name: '', characters, characterAliases: aliases };
    }
    let key = resolveCharacterKey(characters, aliases, requested);
    const created = !key;
    if (!key) key = requested;
    const current = { ...plainObject(characters[key]) };
    const existing = String(current['默认'] || '').trim();
    if (replace || !existing || isGeneratedAssetUrl(existing)) current['默认'] = url;
    characters[key] = current;
    if (!Array.isArray(aliases[key])) aliases[key] = [];
    if (requested !== key && !aliases[key].includes(requested)) aliases[key].push(requested);
    return { ok: true, created, name: key, characters, characterAliases: aliases };
}

export function addGeneratedAssetToLibrary(library, record, name) {
    const next = JSON.parse(JSON.stringify(normalizeGeneratedLibrary(library)));
    const finalName = String(name || record.name || '').trim();
    if (!finalName) return { ok: false, reason: 'empty-name', library: next };
    const url = `${GENERATED_ASSET_URL_PREFIX}${record.imageId}`;
    const original = String(record.name || '').trim();
    if (record.type === 'background') {
        const entry = plainObject(next.scenes[finalName]);
        const words = Array.isArray(entry.words) ? entry.words : [];
        if (original && original !== finalName && !words.includes(original)) words.push(original);
        const times = plainObject(entry.times);
        if (record.time) times[record.time] = { ...plainObject(times[record.time]), url, weathers: plainObject(plainObject(times[record.time]).weathers) };
        next.scenes[finalName] = { ...entry, url: entry.url || url, words, times };
    } else {
        next.characters[finalName] = { ...plainObject(next.characters[finalName]), 默认: url };
        const aliases = Array.isArray(next.characterAliases[finalName]) ? next.characterAliases[finalName] : [];
        if (original && original !== finalName && !aliases.includes(original)) aliases.push(original);
        next.characterAliases[finalName] = aliases;
    }
    return { ok: true, name: finalName, library: next };
}

export function renameGeneratedLibraryEntry(library, type, oldName, newName) {
    const next = JSON.parse(JSON.stringify(normalizeGeneratedLibrary(library)));
    const target = String(newName || '').trim();
    const bucket = type === 'background' ? next.scenes : next.characters;
    if (!target || bucket[oldName] == null) return { ok: false, reason: 'invalid-name', library: next };
    if (target === oldName) return { ok: true, library: next };
    if (bucket[target] != null) return { ok: false, reason: 'name-exists', library: next };
    const rebuilt = {};
    for (const [key, value] of Object.entries(bucket)) rebuilt[key === oldName ? target : key] = value;
    if (type === 'background') {
        next.scenes = rebuilt;
        const words = Array.isArray(rebuilt[target].words) ? rebuilt[target].words : [];
        if (!words.includes(oldName)) words.push(oldName);
        rebuilt[target].words = words.filter((w) => w !== target);
    } else {
        next.characters = rebuilt;
        const aliases = Array.isArray(next.characterAliases[oldName]) ? next.characterAliases[oldName] : [];
        delete next.characterAliases[oldName];
        next.characterAliases[target] = aliases.filter((a) => a !== target).concat(aliases.includes(oldName) ? [] : [oldName]);
        if (next.expressionNotes[oldName]) {
            next.expressionNotes[target] = next.expressionNotes[oldName];
            delete next.expressionNotes[oldName];
        }
    }
    return { ok: true, library: next };
}

export function removeGeneratedLibraryEntry(library, type, name) {
    const next = JSON.parse(JSON.stringify(normalizeGeneratedLibrary(library)));
    const bucket = type === 'background' ? next.scenes : next.characters;
    const entry = bucket[name];
    delete bucket[name];
    if (type !== 'background') {
        delete next.characterAliases[name];
        delete next.expressionNotes[name];
    }
    return { library: next, imageIds: collectGeneratedImageIds(entry) };
}

export function collectGeneratedImageIds(value, out = []) {
    if (typeof value === 'string') {
        if (isGeneratedAssetUrl(value)) out.push(generatedAssetIdOf(value));
    } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) collectGeneratedImageIds(item, out);
    }
    return Array.from(new Set(out));
}

// 把一条生成素材从 source 库移到 / 复制到 target 库（角色连同别名）。只改库记录，不碰 IndexedDB 图片；
// target 已有同名条目时阻止，避免静默覆盖。move=false 为复制，source 原样返回。
export function transferGeneratedLibraryEntry(source, target, type, name, { move = false } = {}) {
    const src = JSON.parse(JSON.stringify(normalizeGeneratedLibrary(source)));
    const dst = JSON.parse(JSON.stringify(normalizeGeneratedLibrary(target)));
    const bucket = type === 'background' ? 'scenes' : 'characters';
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    if (!name || !own(src[bucket], name)) return { ok: false, reason: 'not-found', source: src, target: dst };
    if (own(dst[bucket], name)) return { ok: false, reason: 'name-exists', source: src, target: dst };
    dst[bucket][name] = JSON.parse(JSON.stringify(src[bucket][name]));
    if (bucket === 'characters') {
        dst.characterAliases[name] = Array.isArray(src.characterAliases[name]) ? src.characterAliases[name].slice() : [];
        if (src.expressionNotes[name]) dst.expressionNotes[name] = JSON.parse(JSON.stringify(src.expressionNotes[name]));
    }
    if (move) {
        delete src[bucket][name];
        if (bucket === 'characters') {
            delete src.characterAliases[name];
            delete src.expressionNotes[name];
        }
    }
    return { ok: true, source: src, target: dst };
}

// 用户素材命中是否可信：普通模式下除「默认」兜底外的命中（含弱模糊）都算；
// 精准生图优先模式下只认精确、别名和强模糊，弱命中仅作为生成完成前的占位。
function isTrustedUserMatch(quality, strict) {
    if (quality === 'none' || quality === 'default') return false;
    return strict ? TRUSTED.has(quality) : true;
}

export function resolveBackgroundAsset(sceneState, ctx = {}) {
    const state = sceneState || {};
    if (!state.scene) return { url: '', source: 'none', needsGeneration: false };
    const user = ctx.sceneAssets ? lookupSceneBackground(state, ctx.sceneAssets) : { url: null, quality: 'none' };
    if (user.url && isTrustedUserMatch(user.quality, ctx.strict === true)) {
        return { url: user.url, source: 'user', quality: user.quality, timed: user.timed === true, needsGeneration: false };
    }
    // 用户已登记的场景（精确/别名/强模糊命中）哪怕该时段没图，也不替用户生成。
    if (TRUSTED.has(user.quality)) {
        return { url: user.url || '', source: user.url ? 'user' : 'none', quality: user.quality, timed: Boolean(user.url) && user.timed === true, needsGeneration: false };
    }
    const library = normalizeGeneratedLibrary(ctx.generatedAssets);
    const generated = lookupSceneBackground(state, { ...ctx.sceneAssets, scenes: library.scenes });
    if (generated.url && TRUSTED.has(generated.quality)) {
        return { url: generated.url, source: 'library', quality: generated.quality, timed: generated.timed === true, needsGeneration: false };
    }
    const temp = typeof ctx.tempBackground === 'function' ? ctx.tempBackground(state.scene, state.time || '') : '';
    if (temp) return { url: temp, source: 'temp', needsGeneration: false };
    return { url: user.url || '', source: user.url ? 'placeholder' : 'none', quality: user.quality, needsGeneration: true };
}

export function resolveSpriteAsset(character, mood, ctx = {}, outfit = '') {
    const name = String(character || '').trim();
    if (!name) return { url: '', slot: '', character: '', source: 'none', needsGeneration: false };
    const userAssets = ctx.sceneAssets || {};
    const outfitName = String(outfit || '').trim();
    // 服装内按当条表情找（精确 → 情绪组 → 模糊）。没命中就用这一套的「平和」，不退回原装。
    if (outfitName && outfitName !== OUTFIT_RESET) {
        const found = outfitsOfCharacter(userAssets.characterOutfits, userAssets.characterAliases, name);
        const entry = found.outfits[outfitName];
        if (entry && entry.moods) {
            const hit = lookupAssetValue(entry.moods, mood, userAssets.moodGroups, userAssets.moodFuzzyMatch === true, false);
            const calm = hit.url ? hit : lookupAssetValue(entry.moods, '平和', userAssets.moodGroups, false, false);
            if (calm.url) return { url: calm.url, slot: calm.slot, outfit: outfitName, character: found.key || name, source: 'user-outfit', quality: hit.url ? hit.quality : 'group', needsGeneration: false };
        }
    }
    const user = lookupSceneAssetUrls({ character: name, mood }, userAssets);
    if (user.spriteUrl) {
        return { url: user.spriteUrl, slot: user.spriteSlot, character: user.spriteCharacter || name, source: 'user', quality: user.spriteQuality, needsGeneration: false };
    }
    // 用户已登记该角色（哪怕槽位空着）就不是「无名角色」，不替用户生成。
    if (resolveCharacterKey(userAssets.characters, userAssets.characterAliases, name)) {
        return { url: '', slot: '', character: name, source: 'none', quality: user.spriteQuality, needsGeneration: false };
    }
    const library = normalizeGeneratedLibrary(ctx.generatedAssets);
    const generated = lookupSceneAssetUrls({ character: name, mood }, { characters: library.characters, characterAliases: library.characterAliases, moodGroups: userAssets.moodGroups, moodFuzzyMatch: userAssets.moodFuzzyMatch });
    if (generated.spriteUrl) {
        return { url: generated.spriteUrl, slot: generated.spriteSlot, character: generated.spriteCharacter || name, source: 'library', quality: generated.spriteQuality, needsGeneration: false };
    }
    const temp = typeof ctx.tempSprite === 'function' ? ctx.tempSprite(name) : '';
    if (temp) return { url: temp, slot: '默认', character: name, source: 'temp', needsGeneration: false };
    return { url: '', slot: '', character: name, source: 'none', needsGeneration: !isNonSpriteSpeaker(name, ctx.userName) && !isKnownCharacterName(name, userAssets, ctx.knownCharacters) };
}

// 正文常用简称/全名互指（「雪乃」↔「雪之下雪乃」）：至少两个字且互为子串即视为同一已登记角色。
function isKnownCharacterName(name, userAssets, knownCharacters) {
    if (Array.from(name).length < 2) return false;
    const aliases = userAssets.characterAliases && typeof userAssets.characterAliases === 'object' ? userAssets.characterAliases : {};
    const candidates = [
        ...Object.keys(userAssets.characters || {}),
        ...Object.values(aliases).flat(),
        ...(Array.isArray(knownCharacters) ? knownCharacters : []),
    ].map((c) => String(c || '').trim()).filter((c) => Array.from(c).length >= 2);
    return candidates.some((c) => c === name || c.includes(name) || name.includes(c));
}

export function isNonSpriteSpeaker(name, userName) {
    const lower = name.toLowerCase();
    if (NON_SPRITE_SPEAKERS.has(name) || NON_SPRITE_SPEAKERS.has(lower)) return true;
    if (userName && name === String(userName).trim()) return true;
    return /^[?？…·.\s]+$/.test(name);
}

// 汇总本楼缺失的素材：场景按「场景名+时间」去重，角色按名字去重；按出现顺序截断到 limit。
export function collectAssetNeeds({ scenes = [], characters = [] } = {}, ctx = {}, flags = {}) {
    const needs = [];
    const seen = new Set();
    const limit = Math.max(0, Number(flags.limit) || 0);
    if (flags.background) {
        for (const scene of scenes) {
            if (!scene || !scene.scene) continue;
            const key = `bg|${scene.scene}|${scene.time || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const hit = resolveBackgroundAsset(scene, ctx);
            if (hit.needsGeneration) {
                needs.push({ type: 'background', name: scene.scene, time: scene.time || '', weather: scene.weather || '', nsfw: scene.nsfw === true });
            }
        }
    }
    if (flags.sprite) {
        for (const character of characters) {
            const key = `char|${character}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (resolveSpriteAsset(character, '', ctx).needsGeneration) needs.push({ type: 'sprite', name: String(character).trim() });
        }
    }
    return limit ? needs.slice(0, limit) : needs;
}

export function tempAssetKeyOf(chatId, need) {
    return need.type === 'background'
        ? `${chatId}|bg|${need.name}|${need.time || ''}`
        : `${chatId}|char|${need.name}`;
}
