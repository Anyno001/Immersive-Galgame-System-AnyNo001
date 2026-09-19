import { resolveMoodGroup } from './mood-groups.js';

const SCENE_RE = /^\[igs-scene:([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/;
const CHAR_RE = /^\[igs-char:([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/;
const THOUGHT_RE = /^\[igs-thought:([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/;

export function extractSceneDirectives(text) {
    const source = String(text || '');
    if (!source.trim()) return { directives: [], strippedText: source };

    const directives = [];
    const lines = source.split('\n');
    let lineCount = 0;
    let segmentCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        let m;
        let isDirective = false;
        if ((m = trimmed.match(SCENE_RE))) {
            isDirective = true;
            directives.push({ type: 'scene', scene: m[1].trim(), time: m[2].trim(), weather: m[3].trim(), segmentIndex: segmentCount, lineIndex: lineCount });
        } else if ((m = trimmed.match(CHAR_RE))) {
            isDirective = true;
            directives.push({ type: 'char', character: m[1].trim(), mood: m[2].trim(), dialogue: m[3].trim(), segmentIndex: segmentCount, lineIndex: lineCount });
        } else if ((m = trimmed.match(THOUGHT_RE))) {
            isDirective = true;
            directives.push({ type: 'thought', character: m[1].trim(), mood: m[2].trim(), thought: m[3].trim(), segmentIndex: segmentCount, lineIndex: lineCount });
        }
        if (trimmed && !isDirective) segmentCount++;
        lineCount++;
    }

    return { directives, strippedText: source };
}

export function resolveSceneStateAtIndex(directives, segmentIndex) {
    const state = { scene: '', time: '', weather: '', character: '', mood: '', dialogue: '', thought: '', lastDirectiveType: '' };
    if (!Array.isArray(directives) || !directives.length) return state;
    const targetIndex = normalizeSegmentIndex(segmentIndex);

    for (const directive of directives) {
        const directiveIndex = normalizeSegmentIndex(directive && directive.segmentIndex);
        if (directiveIndex != null && targetIndex != null && directiveIndex > targetIndex) break;
        if (directive.type === 'scene') {
            if (directive.scene) state.scene = directive.scene;
            if (directive.time) state.time = directive.time;
            if (directive.weather) state.weather = directive.weather;
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
    if (!sceneAssets || !sceneState) return { backgroundUrl: null, spriteUrl: null, spriteSlot: '' };

    const scenes = sceneAssets.scenes || {};
    const backgroundUrl = lookupSceneUrl(scenes, sceneState.scene, sceneState.time, sceneState.weather, sceneAssets);

    let spriteUrl = null;
    let spriteSlot = '';
    const characters = sceneAssets.characters || {};
    if (sceneState.character && characters[sceneState.character]) {
        const hit = lookupAssetValue(characters[sceneState.character], sceneState.mood, sceneAssets.moodGroups);
        spriteUrl = hit.url;
        spriteSlot = hit.slot;
    }

    return { backgroundUrl, spriteUrl, spriteSlot };
}

// 场景名词库是内嵌式：scenes[名].words 是归属该场景的标签词。
// AI 写的细分场景名先精确命中 key，再找哪个场景的 words 包含它（组归约）。
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
