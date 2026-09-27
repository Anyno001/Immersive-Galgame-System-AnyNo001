import { lookupSceneBackground, lookupSceneAssetUrls, resolveCharacterKey } from './scene-directives.js';

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
export function normalizeGeneratedLibrary(value) {
    const src = plainObject(value);
    return {
        scenes: plainObject(src.scenes),
        characters: plainObject(src.characters),
        characterAliases: plainObject(src.characterAliases),
    };
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
    }
    return { ok: true, library: next };
}

export function removeGeneratedLibraryEntry(library, type, name) {
    const next = JSON.parse(JSON.stringify(normalizeGeneratedLibrary(library)));
    const bucket = type === 'background' ? next.scenes : next.characters;
    const entry = bucket[name];
    delete bucket[name];
    if (type !== 'background') delete next.characterAliases[name];
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
        return { url: user.url, source: 'user', quality: user.quality, needsGeneration: false };
    }
    const library = normalizeGeneratedLibrary(ctx.generatedAssets);
    const generated = lookupSceneBackground(state, { ...ctx.sceneAssets, scenes: library.scenes });
    if (generated.url && TRUSTED.has(generated.quality)) {
        return { url: generated.url, source: 'library', quality: generated.quality, needsGeneration: false };
    }
    const temp = typeof ctx.tempBackground === 'function' ? ctx.tempBackground(state.scene, state.time || '') : '';
    if (temp) return { url: temp, source: 'temp', needsGeneration: false };
    return { url: user.url || '', source: user.url ? 'placeholder' : 'none', quality: user.quality, needsGeneration: true };
}

export function resolveSpriteAsset(character, mood, ctx = {}) {
    const name = String(character || '').trim();
    if (!name) return { url: '', slot: '', character: '', source: 'none', needsGeneration: false };
    const userAssets = ctx.sceneAssets || {};
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
    return { url: '', slot: '', character: name, source: 'none', needsGeneration: !isNonSpriteSpeaker(name, ctx.userName) };
}

function isNonSpriteSpeaker(name, userName) {
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
