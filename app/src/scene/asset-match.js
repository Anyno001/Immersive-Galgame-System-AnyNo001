import { isInnerDemonName } from './inner-demon.js';
import { isImageSeed } from '../generated-images/image-seed.js';
import { lookupSceneBackground, lookupSceneAssetUrls, resolveCharacterKey, lookupAssetValue, sceneTimeSlot } from './scene-directives.js';
import { BUILTIN_NUDE_OUTFIT, OUTFIT_RESET, isBuiltinNudeOutfit, outfitsOfCharacter } from './character-outfits.js';
import { promptProvenance } from '../generated-images/generation-prompt.js';
import { characterPromptRecovery } from '../generated-images/illustration/character-prompt-task.js';
import { appearanceCharacterKey, resolveCharacterAppearance } from './character-appearance.js';
import { creatureOf } from './creature-profile.js';

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
            bucket[String(mood).trim()] = { positive, negative, error, ...(caption ? { caption } : {}),
                ...promptProvenance(item), ...characterPromptRecovery(item) };
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
            ...promptProvenance(item), ...characterPromptRecovery(item),
        },
    };
    return { ok: true, library: next };
}

// 新生成的基础立绘写入「平和」。角色库没有这个名字就新建，旧默认图独立保留。
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
    const existing = String(current['平和'] || '').trim();
    if (replace || !existing || isGeneratedAssetUrl(existing)) current['平和'] = url;
    characters[key] = current;
    if (!Array.isArray(aliases[key])) aliases[key] = [];
    if (requested !== key && !aliases[key].includes(requested)) aliases[key].push(requested);
    return { ok: true, created, name: key, characters, characterAliases: aliases };
}

// 背景入库进场景素材，不进生成素材库。已有同名场景时补上这个时段的图，不覆盖用户已经放好的主图。
export function bindGeneratedBackground(sceneAssets, record, name) {
    const finalName = String(name || (record && record.name) || '').trim();
    const imageId = String(record && record.imageId || '').trim();
    const assets = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    const scenes = { ...plainObject(assets.scenes) };
    if (!finalName || !imageId) return { ok: false, reason: 'empty-name', name: '', scenes };
    const url = `${GENERATED_ASSET_URL_PREFIX}${imageId}`;
    // 时段差分入库到只在生成区的场景时，主图仍用差分的原图。
    const baseUrl = record.variantOf ? `${GENERATED_ASSET_URL_PREFIX}${record.variantOf}` : url;
    const entry = { ...plainObject(scenes[finalName]) };
    if (!isImageSeed(entry.seed) && isImageSeed(record.seed)) entry.seed = record.seed;
    const words = Array.isArray(entry.words) ? entry.words.slice() : [];
    const original = String(record.name || '').trim();
    if (original && original !== finalName && !words.includes(original)) words.push(original);
    const times = { ...plainObject(entry.times) };
    const time = String(record.time || '').trim();
    if (time) {
        const slot = plainObject(times[time]);
        times[time] = { ...slot, url, weathers: plainObject(slot.weathers) };
    }
    scenes[finalName] = { ...entry, url: String(entry.url || '').trim() || baseUrl, words, times };
    return { ok: true, name: finalName, scenes };
}

export function addGeneratedAssetToLibrary(library, record, name) {
    const next = JSON.parse(JSON.stringify(normalizeGeneratedLibrary(library)));
    const finalName = String(name || record.name || '').trim();
    if (!finalName) return { ok: false, reason: 'empty-name', library: next };
    const url = `${GENERATED_ASSET_URL_PREFIX}${record.imageId}`;
    const original = String(record.name || '').trim();
    if (record.type === 'background') {
        const entry = plainObject(next.scenes[finalName]);
        if (!isImageSeed(entry.seed) && isImageSeed(record.seed)) entry.seed = record.seed;
        const words = Array.isArray(entry.words) ? entry.words : [];
        if (original && original !== finalName && !words.includes(original)) words.push(original);
        const times = plainObject(entry.times);
        if (record.time) times[record.time] = { ...plainObject(times[record.time]), url, weathers: plainObject(plainObject(times[record.time]).weathers) };
        next.scenes[finalName] = { ...entry, url: entry.url || url, words, times };
    } else {
        next.characters[finalName] = { ...plainObject(next.characters[finalName]), 平和: url };
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

function walkGeneratedImageIds(value, out) {
    if (typeof value === 'string') {
        if (isGeneratedAssetUrl(value)) out.push(generatedAssetIdOf(value));
    } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) walkGeneratedImageIds(item, out);
    }
}

export function collectGeneratedImageIds(value, out = []) {
    walkGeneratedImageIds(value, out);
    return Array.from(new Set(out));
}

// 生成素材库只是刚生成时的暂存。已经写进场景或角色的图，从这里拿掉，图片文件仍留在那一处引用上。
export function fileGeneratedHoldings(sceneAssets) {
    if (!sceneAssets || typeof sceneAssets !== 'object') return sceneAssets;
    fileGeneratedBucket(sceneAssets);
    const cards = sceneAssets.cards;
    if (cards && typeof cards === 'object' && !Array.isArray(cards)) {
        for (const card of Object.values(cards)) fileGeneratedBucket(card);
    }
    return sceneAssets;
}


function placeSpriteUrl(bucket, name, mood, url) {
    if (!name || !isGeneratedAssetUrl(url)) return false;
    const characters = { ...plainObject(bucket.characters) };
    const current = { ...plainObject(characters[name]) };
    const existing = String(current[mood] || '').trim();
    if (existing && existing !== url) return existing === url;
    if (!existing) current[mood] = url;
    characters[name] = current;
    bucket.characters = characters;
    const aliases = { ...plainObject(bucket.characterAliases) };
    if (!Array.isArray(aliases[name])) aliases[name] = [];
    bucket.characterAliases = aliases;
    return true;
}

function placeBackgroundUrls(bucket, name, entry) {
    const scene = plainObject(entry);
    const mainId = generatedAssetIdOf(scene.url);
    if (mainId) {
        const bound = bindGeneratedBackground(bucket, { imageId: mainId, name }, name);
        if (bound.ok) bucket.scenes = bound.scenes;
    }
    for (const [time, slot] of Object.entries(plainObject(scene.times))) {
        const id = generatedAssetIdOf(plainObject(slot).url);
        if (!id) continue;
        const bound = bindGeneratedBackground(bucket, { imageId: id, name, time }, name);
        if (bound.ok) bucket.scenes = bound.scenes;
    }
}

function fileGeneratedBucket(bucket) {
    if (!bucket || typeof bucket !== 'object' || !bucket.generated) return;
    const generated = normalizeGeneratedLibrary(bucket.generated);
    for (const [name, entry] of Object.entries({ ...generated.characters })) {
        if (Object.hasOwn(bucket.characterDefaultOutfits || {}, name)) continue;
        const moods = plainObject(entry);
        let blocked = false;
        for (const [mood, url] of Object.entries(moods)) {
            if (!isGeneratedAssetUrl(url)) continue;
            const characters = plainObject(bucket.characters);
            const existing = String(plainObject(characters[name])[mood] || '').trim();
            if (existing && existing !== url) { blocked = true; continue; }
            placeSpriteUrl(bucket, name, mood, url);
        }
        const placed = new Set(collectGeneratedImageIds((bucket.characters || {})[name]));
        const held = collectGeneratedImageIds(moods);
        if (!blocked && held.every((id) => placed.has(id))) {
            delete generated.characters[name];
            delete generated.characterAliases[name];
        }
    }
    for (const [name, entry] of Object.entries({ ...generated.scenes })) {
        placeBackgroundUrls(bucket, name, entry);
        const placed = new Set(collectGeneratedImageIds((bucket.scenes || {})[name]));
        const held = collectGeneratedImageIds(entry);
        if (held.every((id) => placed.has(id))) delete generated.scenes[name];
    }
    bucket.generated = generated;
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

// 失败不算已有差分；自动避免重复发送，手动补全允许重试。明确丢弃的仍尊重用户选择。
function missingTimeVariant(state, hit, ctx) {
    if (hit.timed === true || !hit.key || !TRUSTED.has(hit.quality) || !isGeneratedAssetUrl(hit.url)) return null;
    const time = sceneTimeSlot(state.time, ctx.sceneAssets && ctx.sceneAssets.timeGroups);
    if (!time) return null;
    const temp = typeof ctx.tempSceneTime === 'function' ? ctx.tempSceneTime(hit.key, time) : null;
    const retry = temp && ((temp.status === 'failed' && (ctx.retryFailedVariants === true || (ctx.floorKey && temp.floorKey !== ctx.floorKey)))
        || (temp.status === 'skipped' && temp.skipReason !== 'same-time'));
    const url = temp?.url && !unavailableImage(temp.url, ctx) ? temp.url : '';
    return { scene: hit.key, time, baseImageId: generatedAssetIdOf(hit.url), url, tried: Boolean(temp) && !retry && !(temp?.url && lostImage(temp.url, ctx)) };
}

function withTimeVariant(result, state, hit, ctx) {
    const variant = missingTimeVariant(state, hit, ctx);
    if (!variant) return result;
    if (variant.url) return { ...result, url: variant.url, source: 'temp', timed: true };
    return variant.tried ? result : { ...result, timeVariant: { scene: variant.scene, time: variant.time, baseImageId: variant.baseImageId } };
}

// 补素材时才传 isMissingImage：登记着 igs-gen 图但图片本体已丢（清缓存、文件夹里没了），按缺图处理。
function lostImage(url, ctx) {
    return Boolean(url) && isGeneratedAssetUrl(url) && typeof ctx.isMissingImage === 'function' && ctx.isMissingImage(url);
}

function unavailableImage(url, ctx) {
    return lostImage(url, ctx) || (Boolean(url) && isGeneratedAssetUrl(url) && typeof ctx.isUnavailableImage === 'function' && ctx.isUnavailableImage(url));
}

// 已丢失的 igs-gen 图不能挡住兜底：先把它从候选里摘掉，再按正常顺序查情绪组/平和/默认。
function liveSlots(record, ctx) {
    if (!record || typeof record !== 'object' || (typeof ctx.isMissingImage !== 'function' && typeof ctx.isUnavailableImage !== 'function')) return record;
    let out = record;
    for (const [slot, url] of Object.entries(record)) {
        if (unavailableImage(url, ctx)) {
            if (out === record) out = { ...record };
            delete out[slot];
        }
    }
    return out;
}

function liveCharacter(characters, aliases, name, ctx) {
    const key = resolveCharacterKey(characters, aliases, name);
    // 先定位角色，再检查他的槽位。另一角色读图失败不能让整库逐槽检查。
    return key ? { [key]: liveSlots(characters[key], ctx) } : {};
}

function hasLostImage(record, ctx) {
    return Boolean(record) && typeof record === 'object' && Object.values(record).some((url) => lostImage(url, ctx));
}

export function resolveBackgroundAsset(sceneState, ctx = {}) {
    const state = sceneState || {};
    if (!state.scene) return { url: '', source: 'none', needsGeneration: false };
    const availability = { isUnavailableImage: url => unavailableImage(url, ctx) };
    const user = ctx.sceneAssets ? lookupSceneBackground(state, ctx.sceneAssets, availability) : { url: null, quality: 'none' };
    const userAvailable = user.url && !unavailableImage(user.url, ctx);
    if (userAvailable && isTrustedUserMatch(user.quality, ctx.strict === true)) {
        return withTimeVariant({ url: user.url, source: 'user', quality: user.quality, timed: user.timed === true, needsGeneration: false }, state, user, ctx);
    }
    const library = normalizeGeneratedLibrary(ctx.generatedAssets);
    const generated = lookupSceneBackground(state, { ...ctx.sceneAssets, scenes: library.scenes }, availability);
    if (generated.url && TRUSTED.has(generated.quality) && !unavailableImage(generated.url, ctx)) {
        return withTimeVariant({ url: generated.url, source: 'library', quality: generated.quality, timed: generated.timed === true, needsGeneration: false }, state, generated, ctx);
    }
    const temp = typeof ctx.tempBackground === 'function' ? ctx.tempBackground(state.scene, state.time || '') : '';
    if (temp && !unavailableImage(temp, ctx)) return { url: temp, source: 'temp', needsGeneration: false };
    const placeholder = userAvailable ? user : lookupSceneBackground({ ...state, scene: '默认' }, ctx.sceneAssets, availability);
    return { url: placeholder.url || '', source: placeholder.url ? 'placeholder' : 'none', quality: placeholder.quality, needsGeneration: true };
}

function lookupSpriteWithFallback(sceneState, sceneAssets) {
    const hit = lookupSceneAssetUrls(sceneState, sceneAssets);
    if (hit.spriteUrl || !hit.spriteCharacter) return hit;
    const slots = sceneAssets.characters[hit.spriteCharacter];
    if (!slots || typeof slots !== 'object') return hit;
    // 正常表情链与默认都没有时，只在同角色原装内选平和或可用图，避免有图却整个人消失。
    const slot = String(slots['平和'] || '').trim() ? '平和'
        : Object.keys(slots).find(key => String(slots[key] || '').trim());
    return slot ? { ...hit, spriteUrl: slots[slot], spriteSlot: slot, spriteQuality: 'default' } : hit;
}

export function resolveSpriteAsset(character, mood, ctx = {}, outfit = '') {
    const name = String(character || '').trim();
    if (!name) return { url: '', slot: '', character: '', source: 'none', needsGeneration: false };
    const userAssets = ctx.sceneAssets || {};
    const appearanceKey = appearanceCharacterKey(userAssets, name);
    const legacySlots = [userAssets.characters?.[appearanceKey], userAssets.generated?.characters?.[appearanceKey]];
    const hasLegacySprite = legacySlots.some(slots => Object.values(slots || {}).some(url => typeof url === 'string' && url.trim()));
    if (appearanceKey && (Object.hasOwn(userAssets.characterDefaultOutfits || {}, appearanceKey)
        || (!hasLegacySprite && Object.keys(userAssets.characterOutfits?.[appearanceKey] || {}).length))) {
        const availability = url => {
            if (lostImage(url, ctx)) return { status: 'missing' };
            if (unavailableImage(url, ctx)) return { status: 'read-error' };
            const state = typeof ctx.imageAvailability === 'function'
                ? ctx.imageAvailability(url) : ctx.imageAvailability?.[url];
            // 显示时保留正在加载的引用，让中央缓存完成读取；不改变一致性参考的核验规则。
            return state === 'loading' ? 'unverified'
                : state?.status === 'loading' ? { ...state, status: 'unverified' } : state;
        };
        const selected = resolveCharacterAppearance({ characterKey: appearanceKey, requestedOutfit: outfit,
            mood, sceneAssets: userAssets, ownerScope: ctx.ownerScope || '', imageAvailability: availability });
        if (!selected.ok) return { url: '', slot: '', character: appearanceKey, source: 'none', quality: 'none',
            requestedOutfit: outfit, ...(selected.effectiveOutfit && { outfit: selected.effectiveOutfit }),
            reason: selected.reason, fallbackReason: selected.fallbackReason || '',
            needsGeneration: selected.reason === 'outfit-image-missing' };
        return { url: selected.spriteImage.url, slot: selected.spriteImage.slot, character: appearanceKey,
            requestedOutfit: selected.requestedOutfit, outfit: selected.effectiveOutfit,
            source: selected.selectionSource === 'requested' ? 'user-outfit' : 'user-default-outfit',
            selectionSource: selected.selectionSource, fallbackReason: selected.fallbackReason, reason: '',
            quality: selected.spriteImage.quality, needsGeneration: false };
    }
    const outfitName = String(outfit || '').trim();
    // 服装内按当条表情找（精确 → 情绪组 → 模糊 → 同方向另一档）→ 裸体底图 → 这一套的「平和」→ 这一套任意一张；
    // 整套一张图都没有才退回原装——换了衣服却闪回原装的衣服比表情不准更违和。
    if (outfitName && outfitName !== OUTFIT_RESET) {
        const found = outfitsOfCharacter(userAssets.characterOutfits, userAssets.characterAliases, name);
        const rawEntry = found.outfits[outfitName];
        // 已丢失的内部图槽先摘掉再查：命中已丢的槽不应挡住平和/任意槽/原装兜底。
        const liveMoods = rawEntry && rawEntry.moods ? liveSlots(rawEntry.moods, ctx) : null;
        const entry = liveMoods && liveMoods !== rawEntry.moods ? { ...rawEntry, moods: liveMoods } : rawEntry;
        if (entry && entry.moods) {
            const hit = lookupAssetValue(entry.moods, mood, userAssets.moodGroups, userAssets.moodFuzzyMatch === true, false);
            const base = isBuiltinNudeOutfit(entry.wardrobe) ? String(entry.base || '').trim() : '';
            const nudeBase = unavailableImage(base, ctx) ? '' : base;
            const calm = hit.url || nudeBase ? {} : lookupAssetValue(entry.moods, '平和', userAssets.moodGroups, false, false);
            const anySlot = hit.url || nudeBase || calm.url ? '' : Object.keys(entry.moods).find((slot) => String(entry.moods[slot] || '').trim());
            const own = hit.url ? hit
                : nudeBase ? { url: nudeBase, slot: BUILTIN_NUDE_OUTFIT, quality: 'exact' }
                : calm.url ? calm
                : anySlot ? { url: entry.moods[anySlot], slot: anySlot, quality: 'group' } : {};
            const picked = own.url ? own : lookupAssetValue(liveSlots((userAssets.characters || {})[found.key || name], ctx), '默认', userAssets.moodGroups, false, false);
            if (picked.url && !unavailableImage(picked.url, ctx)) return { url: picked.url, slot: picked.slot, outfit: outfitName, character: found.key || name, source: 'user-outfit', quality: hit.url ? hit.quality : (nudeBase && picked.url === nudeBase ? 'exact' : 'group'), needsGeneration: false };
        }
    }
    // 原装查表前先摘掉已丢失的内部图槽：未命中情绪照样落到组/同向档/平和/默认，不被死链截断。
    const liveChars = liveCharacter(userAssets.characters, userAssets.characterAliases, name, ctx);
    const liveUserAssets = { ...userAssets, characters: liveChars };
    const user = lookupSpriteWithFallback({ character: name, mood }, liveUserAssets);
    if (user.spriteUrl && !unavailableImage(user.spriteUrl, ctx)) {
        // 兜住的图还在，但同一角色名下还有死链槽：照常显示兜底图，同时保留缺图标记让补图链重画那张。
        const key = resolveCharacterKey({ ...userAssets.characterDna, ...userAssets.characterOutfits, ...userAssets.characters }, userAssets.characterAliases, name);
        const dangling = key ? hasLostImage((userAssets.characters || {})[key], ctx) : false;
        return { url: user.spriteUrl, slot: user.spriteSlot, character: user.spriteCharacter || name, source: 'user', quality: user.spriteQuality, needsGeneration: dangling };
    }
    const registeredKey = resolveCharacterKey({ ...userAssets.characterDna, ...userAssets.characterOutfits, ...userAssets.characters }, userAssets.characterAliases, name);
    // 显示匹配只读图片引用，不整理全库的 expressionNotes。
    const library = plainObject(ctx.generatedAssets);
    const libraryAliases = { ...userAssets.characterAliases, ...library.characterAliases };
    const libraryName = resolveCharacterKey(library.characters, libraryAliases, name) ? name : registeredKey || name;
    const libraryAssets = { characters: liveCharacter(library.characters, libraryAliases, libraryName, ctx), characterAliases: libraryAliases, moodGroups: userAssets.moodGroups, moodFuzzyMatch: userAssets.moodFuzzyMatch };
    let generated = lookupSpriteWithFallback({ character: name, mood }, libraryAssets);
    if (!generated.spriteUrl && registeredKey && registeredKey !== name) generated = lookupSpriteWithFallback({ character: registeredKey, mood }, libraryAssets);
    if (generated.spriteUrl && !unavailableImage(generated.spriteUrl, ctx)) {
        return { url: generated.spriteUrl, slot: generated.spriteSlot, character: generated.spriteCharacter || name, source: 'library', quality: generated.spriteQuality, needsGeneration: false };
    }
    const temp = typeof ctx.tempSprite === 'function' ? ctx.tempSprite(name) || (registeredKey && registeredKey !== name ? ctx.tempSprite(registeredKey) : '') : '';
    if (temp && !unavailableImage(temp, ctx)) return { url: temp, slot: '默认', character: name, source: 'temp', needsGeneration: false };
    const missingRegistered = registeredKey && hasLostImage((userAssets.characters || {})[registeredKey], ctx);
    // 副 API 先建档的新角色尚未有图；出图失败后，下次补全仍需处理，不能因刚保存 DNA 变成“已登记”而跳过。
    const preparedOnly = registeredKey && userAssets.characterDna?.[registeredKey]?.identitySource === 'secondary-api'
        && !userAssets.characters?.[registeredKey] && !userAssets.characterOutfits?.[registeredKey];
    // 非人角色只登记了档案、还没有任何立绘：需要补图。
    const creatureUndrawn = Boolean(registeredKey && creatureOf((userAssets.characterDna || {})[registeredKey])
        && !userAssets.characters?.[registeredKey] && !userAssets.characterOutfits?.[registeredKey]);
    const unavailableRegistered = registeredKey && Object.values((userAssets.characters || {})[registeredKey] || {}).some(url => unavailableImage(url, ctx));
    return { url: '', slot: '', character: name, source: 'none', reason: unavailableRegistered ? 'original-unavailable' : registeredKey || generated.spriteCharacter ? 'original-empty' : 'character-unregistered', needsGeneration: Boolean(missingRegistered || preparedOnly || creatureUndrawn) || (!registeredKey && !isNonSpriteSpeaker(name) && !isKnownCharacterName(name, userAssets)) };
}

// NSFW 挂 CG 时的对话框头像：只在衣柜引用「裸体」的那几套里找（当条表情 → 裸体底图 → 这一套的「平和」），
// 找不到就返回空，不退回穿衣立绘。
export function resolveNudeSpriteAsset(character, mood, ctx = {}) {
    const name = String(character || '').trim();
    if (!name) return { url: '', character: '' };
    const userAssets = ctx.sceneAssets || {};
    const found = outfitsOfCharacter(userAssets.characterOutfits, userAssets.characterAliases, name);
    for (const entry of Object.values(found.outfits || {})) {
        if (!entry || !isBuiltinNudeOutfit(entry.wardrobe)) continue;
        const hit = entry.moods ? lookupAssetValue(entry.moods, mood, userAssets.moodGroups, userAssets.moodFuzzyMatch === true, false) : {};
        const base = String(entry.base || '').trim();
        const calm = !hit.url && !base && entry.moods ? lookupAssetValue(entry.moods, '平和', userAssets.moodGroups, false, false) : {};
        const url = hit.url || base || calm.url || '';
        if (url) return { url, character: found.key || name };
    }
    return { url: '', character: found.key || name };
}

// 素材里已登记角色的简称/全名互指（「雪乃」↔「雪之下雪乃」）：至少两个字且互为子串即视为同一人。角色卡名不在此列。
function isKnownCharacterName(name, userAssets) {
    if (Array.from(name).length < 2) return false;
    const aliases = userAssets.characterAliases && typeof userAssets.characterAliases === 'object' ? userAssets.characterAliases : {};
    const candidates = [
        ...Object.keys(userAssets.characters || {}),
        ...Object.values(aliases).flat(),
    ].map((c) => String(c || '').trim()).filter((c) => Array.from(c).length >= 2);
    return candidates.some((c) => c === name || c.includes(name) || name.includes(c));
}

export function isNonSpriteSpeaker(name) {
    // 心魔 / 人格分裂等自我对话的说话人名不是一个要画立绘的角色。
    if (isInnerDemonName(name)) return true;
    const lower = name.toLowerCase();
    if (NON_SPRITE_SPEAKERS.has(name) || NON_SPRITE_SPEAKERS.has(lower)) return true;
    return /^[?？…·.\s]+$/.test(name);
}

// 汇总本楼缺失的素材：场景按「场景名+时间」去重，角色按名字去重；按出现顺序截断到 limit。
export function collectAssetNeeds({ scenes = [], characters = [], characterTriggers = [] } = {}, ctx = {}, flags = {}) {
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
            } else if (hit.timeVariant) {
                const { scene: name, time, baseImageId } = hit.timeVariant;
                const variantKey = `bg-time|${name}|${time}`;
                if (seen.has(variantKey)) continue;
                seen.add(variantKey);
                needs.push({ type: 'background', name, time, weather: '', variantOf: baseImageId });
            }
        }
    }
    if (flags.sprite) {
        for (const character of characters) {
            const key = `char|${character}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const asset = resolveSpriteAsset(character, '', ctx);
            if (!asset.needsGeneration) continue;
            const name = String(character).trim();
            // 待确认立绘仅抑制重复补全，不成为正式衣装或默认图源。
            const temp = typeof ctx.tempSprite === 'function' ? ctx.tempSprite(name) : '';
            if (temp && !lostImage(temp, ctx)) continue;
            const trigger = characterTriggers.find(d => d.character === name);
            const outfitName = trigger?.unknownOutfit || trigger?.outfit || asset.outfit || '';
            needs.push({ type: 'sprite', name, ...(outfitName && { outfitName }) });
        }
    }
    return limit ? needs.slice(0, limit) : needs;
}

export function tempAssetKeyOf(chatId, need) {
    return need.type === 'background'
        ? `${chatId}|bg|${need.name}|${need.time || ''}`
        : `${chatId}|char|${need.name}`;
}
