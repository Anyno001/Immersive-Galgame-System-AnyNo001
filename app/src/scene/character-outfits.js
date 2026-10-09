import { resolveCharacterKey } from './scene-directives.js';

export const OUTFIT_RESET = '默认';
export const BUILTIN_NUDE_OUTFIT = '裸体';
const OUTFIT_BASE_WORDS = new Set([OUTFIT_RESET, '原装']);

export function isBuiltinNudeOutfit(name) {
    return String(name || '').trim() === BUILTIN_NUDE_OUTFIT;
}
export const NO_OUTFIT_GROUPS_TEXT = '（暂无登记服装。）';
export const OUTFIT_GROUPS_PLACEHOLDER = '{{outfit_groups}}';
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const INVALID_CHARS = /[|\]\r\n]/;
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

export function isValidOutfitWord(word) {
    const text = typeof word === 'string' ? word.trim() : '';
    return Boolean(text) && !BLOCKED_KEYS.has(text) && !INVALID_CHARS.test(text);
}

export function isValidOutfitName(name) {
    return isValidOutfitWord(name) && !OUTFIT_BASE_WORDS.has(name.trim());
}

function normalizeMoods(value) {
    const out = {};
    for (const [slot, url] of Object.entries(plain(value) || {})) {
        const key = slot.trim();
        if (!key || key === OUTFIT_RESET || BLOCKED_KEYS.has(key) || typeof url !== 'string') continue;
        out[key] = url;
    }
    return out;
}

function normalizeSceneList(value) {
    const out = [];
    for (const item of Array.isArray(value) ? value : []) {
        const name = isValidOutfitWord(item) ? item.trim() : '';
        if (name && !out.includes(name)) out.push(name);
    }
    return out;
}

// 每套服装 { words, moods, scenes?, avatar? }：同一角色内一个词只归一套服装，与服装名重复的词丢弃；服装不设「默认」槽。
// scenes 为空表示不限场景；avatar 为空表示状态栏沿用角色头像。两者缺省时不写出，旧数据结构不变。
export function normalizeCharacterOutfits(value) {
    const out = {};
    for (const [rawChar, rawOutfits] of Object.entries(plain(value) || {})) {
        const character = rawChar.trim();
        const source = plain(rawOutfits);
        if (!character || BLOCKED_KEYS.has(character) || !source) continue;
        const taken = new Set(Object.keys(source).map((n) => n.trim()).filter(isValidOutfitName));
        const outfits = {};
        for (const [rawName, rawEntry] of Object.entries(source)) {
            const name = rawName.trim();
            if (!isValidOutfitName(name) || hasOwn(outfits, name)) continue;
            const entry = plain(rawEntry) || {};
            const words = [];
            for (const word of Array.isArray(entry.words) ? entry.words : []) {
                if (!isValidOutfitWord(word) || taken.has(word.trim())) continue;
                taken.add(word.trim());
                words.push(word.trim());
            }
            outfits[name] = { words, moods: normalizeMoods(entry.moods) };
            const scenes = normalizeSceneList(entry.scenes);
            if (scenes.length) outfits[name].scenes = scenes;
            const avatar = typeof entry.avatar === 'string' ? entry.avatar.trim() : '';
            if (avatar) outfits[name].avatar = avatar;
            // 服装就叫「裸体」时固定引用内置裸体，生图和阅读器都按 wardrobe 认。
            const wardrobe = isBuiltinNudeOutfit(name) ? BUILTIN_NUDE_OUTFIT : (typeof entry.wardrobe === 'string' ? entry.wardrobe.trim() : '');
            if (isValidOutfitName(wardrobe)) outfits[name].wardrobe = wardrobe;
            const note = normalizeOutfitNote(entry.note);
            if (note) outfits[name].note = note;
            const base = typeof entry.base === 'string' ? entry.base.trim() : '';
            if (base) outfits[name].base = base;
        }
        out[character] = outfits;
    }
    return out;
}

// 衣柜：服装名 → 手写生图提示词。角色的某一套服装可点名引用，没点名时按同名服装取。
export function normalizeWardrobe(raw) {
    const out = {};
    for (const [key, value] of Object.entries(plain(raw) || {})) {
        const name = typeof key === 'string' ? key.trim() : '';
        if (!isValidOutfitName(name) || isBuiltinNudeOutfit(name) || hasOwn(out, name)) continue;
        const source = typeof value === 'string' ? { prompt: value } : (plain(value) || {});
        const prompt = typeof source.prompt === 'string' ? source.prompt.replace(/\r\n?/g, '\n').trim() : '';
        const reference = typeof source.reference === 'string' ? source.reference.trim() : '';
        out[name] = { prompt };
        if (reference.startsWith('igs-gen:')) out[name].reference = reference;
        if (source.nsfwBoost === true) out[name].nsfwBoost = true;
        // 新建时填的具体要求，写提示词时带上；不进生图词。
        const note = typeof source.note === 'string' ? source.note.replace(/\r\n?/g, '\n').trim() : '';
        if (note) out[name].note = note;
    }
    return out;
}

export function resolveWardrobePrompt(wardrobe, outfitEntry, outfitName) {
    const map = plain(wardrobe) || {};
    const linked = outfitEntry && typeof outfitEntry.wardrobe === 'string' ? outfitEntry.wardrobe.trim() : '';
    const key = linked && hasOwn(map, linked) ? linked : (hasOwn(map, outfitName) ? outfitName : '');
    if (!key) return null;
    const entry = map[key] || {};
    const resolved = { name: key, prompt: String(entry.prompt || '').trim() };
    if (entry.nsfwBoost === true) resolved.nsfwBoost = true;
    return resolved;
}

export function outfitsOfCharacter(characterOutfits, characterAliases, character) {
    const map = plain(characterOutfits) || {};
    const key = resolveCharacterKey(map, characterAliases, character);
    return key ? { key, outfits: plain(map[key]) || {} } : { key: '', outfits: {} };
}

export function outfitNamesOf(characterOutfits, characterAliases, character) {
    return Object.keys(outfitsOfCharacter(characterOutfits, characterAliases, character).outfits);
}

// 服装栏写法归一：服装名或词池词 → 服装名；保留字「默认」原样返回；其余返回空串（按对白处理）。
export function resolveOutfitToken(outfits, token) {
    const text = String(token || '').trim();
    if (!text) return '';
    if (OUTFIT_BASE_WORDS.has(text)) return OUTFIT_RESET;
    const map = plain(outfits) || {};
    if (hasOwn(map, text)) return text;
    for (const [name, entry] of Object.entries(map)) {
        if (Array.isArray(entry && entry.words) && entry.words.includes(text)) return name;
    }
    return '';
}

export function createOutfitResolver(sceneAssets) {
    const assets = plain(sceneAssets) || {};
    return (character, token) => resolveOutfitToken(
        outfitsOfCharacter(assets.characterOutfits, assets.characterAliases, character).outfits, token);
}

// 表格 / 装备 / DNA 兜底：只认两字以上的服装名或词池词，取最长命中；不同服装同长命中视为冲突。
export function matchOutfitByText(text, outfits) {
    const source = String(text || '');
    if (!source.trim()) return '';
    let best = '';
    let bestLen = 0;
    let tie = false;
    for (const [name, entry] of Object.entries(plain(outfits) || {})) {
        const candidates = [name, ...(Array.isArray(entry && entry.words) ? entry.words : [])];
        let len = 0;
        for (const candidate of candidates) {
            const size = Array.from(candidate).length;
            if (size >= 2 && size > len && source.includes(candidate)) len = size;
        }
        if (!len) continue;
        if (len > bestLen) { best = name; bestLen = len; tie = false; } else if (len === bestLen) tie = true;
    }
    return tie ? '' : best;
}

// 给模型看的穿着说明：一行内，去掉会打断列表的符号。空说明不写出。
export function normalizeOutfitNote(value) {
    return String(value || '').replace(/[\r\n|[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

function outfitPromptLabel(name, entry) {
    const note = normalizeOutfitNote(entry && entry.note);
    return note ? `${name}（${note}）` : name;
}

function outfitPromptLine(character, outfits) {
    const map = plain(outfits) || {};
    const labels = Object.keys(map).map((name) => outfitPromptLabel(name, map[name]));
    return labels.length ? `${character}：${labels.join(' / ')}` : '';
}

export function buildOutfitGroupsText(characterOutfits) {
    const lines = Object.entries(plain(characterOutfits) || {})
        .map(([character, outfits]) => outfitPromptLine(character, outfits))
        .filter(Boolean);
    return lines.length ? lines.join('\n') : NO_OUTFIT_GROUPS_TEXT;
}

function outfitKeyOf(resolveKey, character) {
    const name = String(character || '').trim();
    const key = typeof resolveKey === 'function' ? resolveKey(name) : '';
    return key || name;
}

// 汇总一批指令里每个角色最近一次写出的服装（含「默认」复位），供跨楼层继承。
export function collectLatestOutfits(directives, resolveKey) {
    const out = {};
    for (const d of Array.isArray(directives) ? directives : []) {
        if (!d || (d.type !== 'char' && d.type !== 'thought') || !d.outfit || !d.character) continue;
        out[outfitKeyOf(resolveKey, d.character)] = d.outfit;
    }
    return out;
}

function latestTagAt(directives, character, offset, inheritedOutfits, resolveKey) {
    const key = outfitKeyOf(resolveKey, character);
    if (!key) return { value: '', offset: Number.NaN };
    const limit = Number(offset);
    let best = null;
    for (const d of Array.isArray(directives) ? directives : []) {
        if (!d || (d.type !== 'char' && d.type !== 'thought') || !d.outfit) continue;
        if (Number.isFinite(limit) && Number(d.offset) > limit) continue;
        if (outfitKeyOf(resolveKey, d.character) !== key) continue;
        if (!best || Number(d.offset) >= Number(best.offset)) best = d;
    }
    return best
        ? { value: best.outfit, offset: Number(best.offset) }
        : { value: (plain(inheritedOutfits) || {})[key] || '', offset: Number.NaN };
}

// 本楼当前原文偏移之前该角色最近一次服装栏优先；本楼未写时取跨楼继承。返回原值（含「默认」），空串表示标签从未写过。
export function resolveTagOutfitAt(directives, character, offset, inheritedOutfits, resolveKey) {
    return latestTagAt(directives, character, offset, inheritedOutfits, resolveKey).value;
}

// 本楼当前偏移之前最近一次场景标签的位置；没有时为 -Infinity（场景来自跨楼继承）。
function latestSceneOffset(directives, offset) {
    const limit = Number(offset);
    let best = Number.NEGATIVE_INFINITY;
    for (const d of Array.isArray(directives) ? directives : []) {
        if (!d || d.type !== 'scene' || (Number.isFinite(limit) && Number(d.offset) > limit)) continue;
        best = Math.max(best, Number(d.offset));
    }
    return best;
}

// 服装的适用场景：未填写视为不限；当前场景未知时不限制。scene 可同时给出场景主名与原文写法。
export function outfitAllowsScene(entry, scene) {
    const scenes = entry && Array.isArray(entry.scenes) ? entry.scenes : [];
    const names = (Array.isArray(scene) ? scene : [scene]).map((v) => String(v || '').trim()).filter(Boolean);
    return !scenes.length || !names.length || names.some((name) => scenes.includes(name));
}

function filterOutfitsByScene(outfits, scene) {
    const out = {};
    for (const [name, entry] of Object.entries(outfits)) if (outfitAllowsScene(entry, scene)) out[name] = entry;
    return out;
}

// 场景改名（newName 为空表示删除）时同步各服装的适用场景，避免留下指向不存在场景的条目。
export function renameOutfitScene(characterOutfits, oldName, newName) {
    for (const outfits of Object.values(plain(characterOutfits) || {})) {
        for (const entry of Object.values(plain(outfits) || {})) {
            if (!entry || !Array.isArray(entry.scenes) || !entry.scenes.includes(oldName)) continue;
            const next = entry.scenes.map((name) => (name === oldName ? newName : name)).filter(Boolean);
            entry.scenes = next.filter((name, index) => next.indexOf(name) === index);
            if (!entry.scenes.length) delete entry.scenes;
        }
    }
    return characterOutfits;
}

export function outfitAvatarOf(characterOutfits, characterAliases, character, outfit) {
    const name = String(outfit || '').trim();
    if (!name || name === OUTFIT_RESET) return '';
    const entry = outfitsOfCharacter(characterOutfits, characterAliases, character).outfits[name];
    return entry && typeof entry.avatar === 'string' ? entry.avatar.trim() : '';
}

// 「默认」表示原有立绘，统一归为空串。
export function resolveOutfitAt(directives, character, offset, inheritedOutfits, resolveKey) {
    const value = resolveTagOutfitAt(directives, character, offset, inheritedOutfits, resolveKey);
    return value === OUTFIT_RESET ? '' : value;
}

// 标签从未写服装时的兜底：② 角色表穿着打扮 → ③ 装备表正在穿戴 → ④ DNA 默认外观，均按服装名 / 词池匹配。
// 只读匹配，不回写；clues 读取失败时跳过 ②③ 并带回原因，便于诊断。
export function resolveFallbackOutfit(outfits, { clues, dnaAppearance } = {}) {
    const source = clues && typeof clues === 'object' ? clues : {};
    const reason = source.status === 'read-error' ? String(source.reason || 'read-error') : '';
    const steps = [
        ['profile', Array.isArray(source.profile) ? source.profile.join('\n') : ''],
        ['equipment', Array.isArray(source.worn) ? source.worn.join('\n') : ''],
        ['dna', typeof dnaAppearance === 'string' ? dnaAppearance : ''],
    ];
    for (const [from, text] of steps) {
        const outfit = matchOutfitByText(text, outfits);
        if (outfit) return { outfit, source: from, reason };
    }
    return { outfit: '', source: '', reason };
}

// 立绘服装总入口：① 标签（本楼 → 跨楼继承，「默认」直接复位）→ ②③④ 兜底 → 原有立绘。
// readClues(names) 由宿主层注入（只读 shujuku），场景层不直接访问宿主。
// 适用场景：最近一次场景切换之后本楼明确写出的服装照用；更早的或跨楼继承来的服装不适用当前场景时失效，
// 兜底来源也只在适用当前场景的服装里匹配。scene 为当前场景（主名与原文写法），未知时不限制。
export function resolveSpriteOutfit({ directives, character, offset, inheritedOutfits, sceneAssets, readClues, resolveDna, scene } = {}) {
    const assets = plain(sceneAssets) || {};
    const { key, outfits } = outfitsOfCharacter(assets.characterOutfits, assets.characterAliases, character);
    if (!key || !Object.keys(outfits).length) return { outfit: '', source: '', reason: '' };
    const resolveKey = (name) => outfitsOfCharacter(assets.characterOutfits, assets.characterAliases, name).key || name;
    const tag = latestTagAt(directives, character, offset, inheritedOutfits, resolveKey);
    if (tag.value === OUTFIT_RESET) return { outfit: '', source: 'reset', reason: '' };
    let mismatch = '';
    if (tag.value && hasOwn(outfits, tag.value)) {
        const freshAfterScene = Number.isFinite(tag.offset) && tag.offset >= latestSceneOffset(directives, offset);
        if (freshAfterScene || outfitAllowsScene(outfits[tag.value], scene)) return { outfit: tag.value, source: 'tag', reason: '' };
        mismatch = 'scene-mismatch';
    } else if (tag.value) {
        return { outfit: '', source: 'tag', reason: '' };
    }
    const allowed = filterOutfitsByScene(outfits, scene);
    if (!Object.keys(allowed).length) return { outfit: '', source: '', reason: mismatch };
    const aliases = plain(assets.characterAliases) || {};
    const names = [key, ...(Array.isArray(aliases[key]) ? aliases[key] : [])];
    let clues = null;
    if (typeof readClues === 'function') {
        try { clues = readClues(names); } catch (error) { clues = { status: 'read-error', reason: String((error && error.message) || 'read-failed') }; }
    }
    const dna = typeof resolveDna === 'function' ? resolveDna(key) : null;
    const fallback = resolveFallbackOutfit(allowed, { clues, dnaAppearance: dna && dna.defaultAppearance });
    return mismatch && !fallback.reason ? { ...fallback, reason: mismatch } : fallback;
}

// 位置 / 头部标定的身份：无服装时就是角色名（原有 key 不变），有服装时为「角色|服装」。服装名不含「|」。
export function spriteIdentity(character, outfit) {
    const name = String(character || '');
    const value = String(outfit || '').trim();
    return value && value !== OUTFIT_RESET ? `${name}|${value}` : name;
}

// 只列在场角色的服装：角色主名或任一别名出现在 presentText（角色卡名、群聊成员、最近几层正文）里。
// presentText 为 null 表示拿不到名单，退回全量；两种情况都按字数上限截断。
export function buildScopedOutfitGroupsText(characterOutfits, { presentText = null, characterAliases = {}, limit = 400 } = {}) {
    const text = presentText == null ? null : String(presentText);
    const aliases = plain(characterAliases) || {};
    const entries = Object.entries(plain(characterOutfits) || {})
        .map(([character, outfits]) => [character, outfits, outfitPromptLine(character, outfits)])
        .filter(([, , line]) => line)
        .filter(([character]) => text == null
            || [character, ...(Array.isArray(aliases[character]) ? aliases[character] : [])]
                .some((name) => String(name || '').trim() && text.includes(String(name).trim())));
    if (!entries.length) return NO_OUTFIT_GROUPS_TEXT;
    const lines = [];
    let used = 0;
    for (const [, , line] of entries) {
        const cost = Array.from(line).length + 1;
        if (used + cost > limit && lines.length) {
            lines.push('等');
            break;
        }
        lines.push(line);
        used += cost;
    }
    return lines.join('\n');
}
