import { resolveMoodGroup } from './mood-groups.js';
import { resolveSceneTimeAsset } from './scene-time.js';

// 指令可独占整行，也可紧跟在正文之后（同一行内混排），因此不做行首锚定。
const SCENE_RE = /\[igs-scene:([^|\]]+)\|([^|\]]+)\|([^|\]]+)(?:\|([^\]]*))?\]/;
const CHAR_RE = /\[igs-char:([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/;
const THOUGHT_RE = /\[igs-thought:([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/;
// 锚定在当前位置的版本：用于「紧贴当前位置」的指令识别。
const SCENE_AT_RE = /^\[igs-scene:([^|\]]+)\|([^|\]]+)\|([^|\]]+)(?:\|([^\]]*))?\]/;
const CHAR_AT_RE = /^\[igs-char:([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/;
const THOUGHT_AT_RE = /^\[igs-thought:([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/;
// 找出当前位置之后最近一条 igs 指令的起始下标；没有则返回 -1。
function nextDirectiveIndex(text) {
    const m = String(text || '').match(/\[igs-(?:scene|char|thought):/);
    return m ? m.index : -1;
}

export function extractSceneDirectives(text) {
    const source = String(text || '');
    if (!source.trim()) return { directives: [], strippedText: source };

    const directives = [];
    const lines = source.split('\n');
    let segmentCount = 0;
    // 待结算的正文本：只有遇到 [igs-scene] 或行尾时才确定它属于哪一段。
    let pending = '';
    // 行首偏移：用于按「字符位置」定位指令，弥补按行计数的段索引与文本管线分段之间的错位。
    let lineOffset = 0;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        const indent = rawLine.length - rawLine.trimStart().length;
        if (!trimmed) continue;
        // 场景切换的唯一依据是 [igs-scene] 标签本身：标签出现在哪里，它之后的正文就属于哪个场景。
        // 一行内可混排任意指令与正文（位置不限），因此按出现顺序消费：
        // 先结算「标签之前的正文」为当前段，标签本身归属「其后的正文段」。
        let rest = trimmed;
        let m;
        let cursor = lineOffset + indent;
        while (rest) {
            // 只认「紧贴当前位置」的指令：否则 SCENE_RE 会越过行首的 thought/char
            // 标签去匹配后面的 scene，把前面的指令当成正文吞掉。
            if ((m = rest.match(SCENE_AT_RE))) {
                // 标签之前的正文自成一段（若有）。
                if (pending.trim()) { segmentCount += 1; pending = ''; }
                directives.push({
                    type: 'scene',
                    scene: m[1].trim(),
                    time: m[2].trim(),
                    weather: m[3].trim(),
                    nsfw: String(m[4] || '').trim().toLowerCase() === 'nsfw',
                    segmentIndex: segmentCount,
                    lineIndex: i,
                    offset: cursor,
                });
            } else if ((m = rest.match(CHAR_AT_RE))) {
                if (pending.trim()) { segmentCount += 1; pending = ''; }
                directives.push({ type: 'char', character: m[1].trim(), mood: m[2].trim(), dialogue: m[3].trim(), segmentIndex: segmentCount, lineIndex: i, offset: cursor });
            } else if ((m = rest.match(THOUGHT_AT_RE))) {
                if (pending.trim()) { segmentCount += 1; pending = ''; }
                directives.push({ type: 'thought', character: m[1].trim(), mood: m[2].trim(), thought: m[3].trim(),segmentIndex: segmentCount, lineIndex: i, offset: cursor });
            } else {
                // 当前位置不是指令：把到「下一条指令之前」的文本计入正文。
                const nextAt = nextDirectiveIndex(rest);
                if (nextAt < 0) { pending += rest; rest = ''; break; }
                pending += rest.slice(0, nextAt);
                rest = rest.slice(nextAt);
                continue;
            }
            rest = rest.slice(m[0].length);
            cursor += m[0].length;
        }
        pending += rest;
        lineOffset += rawLine.length + 1;
    }

    return { directives, strippedText: source };
}
// 按「字符位置」找最近一条 char/thought 指令：用于恢复说话人，
// 不依赖按行计数的 segmentIndex，因此不受文本管线重排版影响。
export function resolveNearestCharacterBefore(directives, offset) {
    const out = { character: '', mood: '', lastDirectiveType: '' };
    if (!Array.isArray(directives) || !directives.length) return out;
    const limit = Number(offset);
    let best = null;
    for (const d of directives) {
        if (d.type !== 'char' && d.type !== 'thought') continue;
        if (Number.isFinite(limit) && Number(d.offset) > limit) continue;
        if (!best || Number(d.offset) >= Number(best.offset)) best = d;
    }
    if (best) {
        out.character = best.character || '';
        out.mood = best.mood || '';
        out.lastDirectiveType = best.type;
    }
    return out;
}



// 取「指定字符位置前方最近的 [igs-scene] 标签」：直接在原文里 lastIndexOf 查找，
// 不做任何偏移累加，因此不受排版、行内混排、段数错位影响。
export function resolveSceneAtSourceOffset(source, position) {
    const empty = { scene: '', time: '', weather: '', nsfw: false, character: '', mood: '', dialogue: '', thought: '', lastDirectiveType: '' };
    const src = String(source || '');
    const limit = Math.max(0, Math.min(src.length, Number(position) || 0));
    const at = src.slice(0, limit).lastIndexOf('[igs-scene:');
    if (at < 0) return empty;
    const m = src.slice(at).match(SCENE_AT_RE);
    if (!m) return empty;
    return {
        scene: m[1].trim(),
        time: m[2].trim(),
        weather: m[3].trim(),
        nsfw: String(m[4] || '').trim().toLowerCase() === 'nsfw',
        character: '', mood: '', dialogue: '', thought: '', lastDirectiveType: 'scene',
    };
}

export function resolveSceneStateAtIndex(directives, segmentIndex) {
    const state = { scene: '', time: '', weather: '', nsfw: false, character: '', mood: '', dialogue: '', thought: '', lastDirectiveType: '' };
    if (!Array.isArray(directives) || !directives.length) return state;
    const targetIndex = normalizeSegmentIndex(segmentIndex);

    for (const directive of directives) {
        const directiveIndex = normalizeSegmentIndex(directive && directive.segmentIndex);
        if (directiveIndex != null && targetIndex != null && directiveIndex > targetIndex) break;
        if (directive.type === 'scene') {
            if (directive.scene) state.scene = directive.scene;
            if (directive.time) state.time = directive.time;
            if (directive.weather) state.weather = directive.weather;
            state.nsfw = directive.nsfw === true;
            state.lastDirectiveType = 'scene';
        } else if (directive.type === 'char') {
            if (directive.character) state.character = directive.character;
            if (directive.mood) state.mood = directive.mood;
            if (directive.dialogue) state.dialogue = directive.dialogue;
            state.lastDirectiveType = 'char';
        } else if (directive.type === 'thought') {
            if (directive.character) state.character = directive.character;
            if (directive.mood) state.mood = directive.mood;
            if (directive.thought) state.thought = directive.thought;
            state.lastDirectiveType = 'thought';
        }
    }

    return state;
}

export function lookupSceneAssetUrls(sceneState, sceneAssets) {
    if (!sceneAssets || !sceneState) return { backgroundUrl: null, spriteUrl: null, spriteSlot: '', spriteCharacter: '' };

    const scenes = sceneAssets.scenes || {};
    const backgroundUrl = lookupSceneUrl(scenes, sceneState.scene, sceneState.time, sceneState.weather, sceneAssets);

    let spriteUrl = null;
    let spriteSlot = '';
    const characters = sceneAssets.characters || {};
    const spriteCharacter = resolveCharacterKey(characters, sceneAssets.characterAliases, sceneState.character);
    if (spriteCharacter) {
        const hit = lookupAssetValue(characters[spriteCharacter], sceneState.mood, sceneAssets.moodGroups);
        spriteUrl = hit.url;
        spriteSlot = hit.slot;
    }

    return { backgroundUrl, spriteUrl, spriteSlot, spriteCharacter: spriteCharacter || '' };
}

export function resolveCharacterKey(characters, characterAliases, characterName) {
    const target = String(characterName || '').trim();
    if (!target || !characters || typeof characters !== 'object') return null;
    if (characters[target] != null) return target;
    const aliases = characterAliases && typeof characterAliases === 'object' ? characterAliases : {};
    for (const key of Object.keys(characters)) {
        const values = Array.isArray(aliases[key]) ? aliases[key] : [];
        if (values.some((value) => String(value || '').trim() === target)) return key;
    }
    return null;
}

// 场景别名沿用 scenes[名].words 存储；先精确命中主名称，再按别名归约。
// 角色别名则由 characterAliases 映射到原角色，避免复制整套立绘槽。
function resolveSceneKey(scenes, sceneName) {
    const target = String(sceneName || '').trim();
    if (!target) return null;
    if (scenes[target] != null) return target;
    for (const key of Object.keys(scenes)) {
        const entry = scenes[key];
        const words = entry && typeof entry === 'object' && Array.isArray(entry.words) ? entry.words : [];
        if (words.some((w) => String(w || '').trim() === target)) return key;
    }
    // 按字模糊匹配兜底：候选词（场景名与别名）全部字都命中目标优先，
    // 其次命中字数多者优先，再次候选字数多者优先；全不中返回 null。
    let bestKey = null;
    let bestScore = null;
    for (const key of Object.keys(scenes)) {
        const entry = scenes[key];
        const words = entry && typeof entry === 'object' && Array.isArray(entry.words) ? entry.words : [];
        for (const candidate of [key, ...words]) {
            const score = scoreSceneFuzzyCandidate(target, candidate);
            if (!score) continue;
            if (!bestScore || compareSceneFuzzyScore(score, bestScore) > 0) {
                bestScore = score;
                bestKey = key;
            }
        }
    }
    return bestKey;
}

function scoreSceneFuzzyCandidate(target, candidate) {
    const text = String(candidate || '').trim();
    if (!text) return null;
    const targetChars = new Set(Array.from(target));
    const chars = Array.from(text);
    let matched = 0;
    for (const char of chars) {
        if (targetChars.has(char)) matched += 1;
    }
    if (!matched) return null;
    return [matched === chars.length ? 1 : 0, matched, chars.length];
}

function compareSceneFuzzyScore(a, b) {
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return a[index] - b[index];
    }
    return 0;
}

// 时间/天气词库是全局组：[{label,words}]。先精确命中 record 的 key，
// 再用 resolveMoodGroup 把细分词归约到组 label 当 key。
function resolveLayerKey(record, requestedKey, groups) {
    const target = String(requestedKey || '').trim();
    if (!target || !record || typeof record !== 'object') return null;
    if (record[target] != null) return target;
    const groupLabel = resolveMoodGroup(target, groups);
    if (groupLabel && record[groupLabel] != null) return groupLabel;
    return null;
}

function lookupSceneUrl(scenes, sceneName, time, weather, sceneAssets) {
    const sceneKey = resolveSceneKey(scenes, sceneName);
    const raw = sceneKey != null ? scenes[sceneKey]
        : (scenes['默认'] != null ? scenes['默认'] : null);
    if (!raw) return null;
    const entry = typeof raw === 'string' ? { url: raw } : raw;
    const timeGroups = sceneAssets && sceneAssets.timeGroups;
    const weatherGroups = sceneAssets && sceneAssets.weatherGroups;
    const timeKey = resolveLayerKey(entry.times, time, timeGroups);
    if (timeKey != null) {
        const timeRaw = entry.times[timeKey];
        const timeEntry = typeof timeRaw === 'string' ? { url: timeRaw } : timeRaw;
        const weatherKey = resolveLayerKey(timeEntry.weathers, weather, weatherGroups);
        if (weatherKey != null) {
            const weatherRaw = timeEntry.weathers[weatherKey];
            const weatherEntry = typeof weatherRaw === 'string' ? { url: weatherRaw } : weatherRaw;
            return (weatherEntry && weatherEntry.url) || (typeof weatherRaw === 'string' ? weatherRaw : null) || null;
        }
        return resolveSceneTimeAsset(timeEntry.url || '', time);
    }
    return resolveSceneTimeAsset(entry.url || '', time);
}

function lookupAssetValue(record, requestedKey, moodGroups) {
    if (!record || typeof record !== 'object') return { url: null, slot: '' };
    if (requestedKey && record[requestedKey]) return { url: record[requestedKey], slot: requestedKey };
    const groupLabel = resolveMoodGroup(requestedKey, moodGroups);
    if (groupLabel && record[groupLabel]) return { url: record[groupLabel], slot: groupLabel };
    if (record['默认']) return { url: record['默认'], slot: '默认' };
    return { url: null, slot: '' };
}

function normalizeSegmentIndex(value) {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    return Math.floor(numeric);
}
