import { resolveMoodGroup } from './mood-groups.js';

// 指令可独占整行，也可紧跟在正文之后（同一行内混排），因此不做行首锚定。
const SCENE_RE = /\[igs-scene:([^|\]]+)\|([^|\]]+)\|([^|\]]+)(?:\|([^\]]*))?\]/;
const CHAR_RE = /\[igs-char:([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/;
const THOUGHT_RE = /\[igs-thought:([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/;

export function extractSceneDirectives(text) {
    const source = String(text || '');
    if (!source.trim()) return { directives: [], strippedText: source };

    const directives = [];
    const lines = source.split('\n');
    let segmentCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        // 一行内可出现任意数量的指令，位置不限（行首、正文之后、甚至夹在正文中间）。
        // 从左到右扫描：指令前的文本算正文；指令归属「其所在正文段」，
        // 使 A 段用 A 场景、B 段用 B 场景。
        let rest = trimmed;
        let m;
        let textBefore = '';
        while (rest) {
            if ((m = rest.match(SCENE_RE))) {
                textBefore += rest.slice(0, m.index);
                directives.push({
                    type: 'scene',
                    scene: m[1].trim(),
                    time: m[2].trim(),
                    weather: m[3].trim(),
                    nsfw: String(m[4] || '').trim().toLowerCase() === 'nsfw',
                    segmentIndex: segmentCount,
                    lineIndex: i,
                });
            } else if ((m = rest.match(CHAR_RE))) {
                textBefore += rest.slice(0, m.index);
                directives.push({ type: 'char', character: m[1].trim(), mood: m[2].trim(), dialogue: m[3].trim(), segmentIndex: segmentCount, lineIndex: i });
            } else if ((m = rest.match(THOUGHT_RE))) {
                textBefore += rest.slice(0, m.index);
                directives.push({ type: 'thought', character: m[1].trim(), mood: m[2].trim(), thought: m[3].trim(), segmentIndex: segmentCount, lineIndex: i });
            } else {
                break;
            }
            rest = rest.slice(m.index + m[0].length);
        }
        textBefore += rest;
        // 该行剥离所有指令后仍有正文才占一个正文段；纯指令行不占段，
        // 其 segmentIndex 指向「其后第一个正文段」，因此段首指令与段末预告
        // 指令都等价地生效于下一段。
        if (textBefore.trim()) segmentCount++;
    }

    return { directives, strippedText: source };
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
    return null;
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
        return timeEntry.url || null;
    }
    return entry.url || null;
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
