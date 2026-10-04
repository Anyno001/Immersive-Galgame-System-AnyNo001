// 快速配置演出：新手问卷与「阅读器 › 演出」的卡片类型胶囊共用。
// 常用演出按热闹程度（tier）开；特定类型的演出只在勾了对应卡片类型时开；声音、亲密各由一题单独决定。
import { PERFORMANCE_FEATURES, isPerformanceFeatureOn } from './performance-presets.js';

export const PROFILE_PATH = 'performanceProfile';

export const CARD_TYPES = Object.freeze([
    Object.freeze(['romance', '日常恋爱']),
    Object.freeze(['school', '校园']),
    Object.freeze(['battle', '冒险战斗']),
    Object.freeze(['fantasy', '奇幻魔法']),
    Object.freeze(['online', '直播网络']),
    Object.freeze(['mystery', '悬疑剧情']),
    Object.freeze(['horror', '恐怖惊悚']),
]);

export const TYPE_FEATURES = Object.freeze({
    romance: Object.freeze(['dailyFx', 'chatShow', 'innerFx']),
    school: Object.freeze(['dailyFx', 'chatShow']),
    battle: Object.freeze(['battleFx', 'flashFx']),
    fantasy: Object.freeze(['battleFx', 'dailyFx']),
    online: Object.freeze(['chatShow', 'liveFx', 'audienceFx']),
    mystery: Object.freeze(['flashFx', 'innerFx']),
    horror: Object.freeze(['flashFx', 'innerFx', 'dailyFx']),
});

export const SPECIAL_FEATURES = Object.freeze(Array.from(new Set(Object.values(TYPE_FEATURES).flat())));
// 声音逐项多选，都不选就是静音；打字机音不是一键档位里的演出，单独写 typewriter.sound.enabled。
export const SOUND_OPTIONS = Object.freeze([
    Object.freeze(['fx', '演出音效']),
    Object.freeze(['ui', '界面音效']),
    Object.freeze(['typing', '打字机音']),
    Object.freeze(['ambient', '环境音']),
    Object.freeze(['bgm', '背景音乐']),
]);
const SOUND_FEATURE_OF = Object.freeze({ fx: 'fxSound', ui: 'uiSound', ambient: 'ambientSound', bgm: 'bgm' });
const SOUND_IDS = SOUND_OPTIONS.map(([id]) => id);
// 旧版三选一答案的换算。
const LEGACY_SOUND = Object.freeze({ mute: [], sfx: ['fx', 'ui', 'typing'], full: SOUND_IDS });
export const DEFAULT_SOUND = Object.freeze(['fx', 'ui', 'typing']);

function normalizeSound(value) {
    if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_SOUND, value)) return [...LEGACY_SOUND[value]];
    if (!Array.isArray(value)) return [...DEFAULT_SOUND];
    return SOUND_IDS.filter((id) => value.includes(id));
}
const LEVELS = Object.freeze({ off: 0, light: 1, standard: 2, full: 3 });

export const PROFILE_QUESTIONS = Object.freeze([
    Object.freeze({ id: 'types', title: '你常玩什么类型的卡？', note: '可多选，决定战斗、直播、线上聊天这些只在特定剧情里用的演出开不开。', multi: true, options: CARD_TYPES }),
    Object.freeze({ id: 'level', title: '喜欢多热闹的画面？', options: Object.freeze([['light', '安静看字'], ['standard', '适度点缀'], ['full', '越热闹越好']]) }),
    Object.freeze({ id: 'sound', title: '要哪些声音？', note: '都不选就是静音。', multi: true, options: SOUND_OPTIONS }),
    Object.freeze({ id: 'adult', title: '卡里有成人向内容吗？', options: Object.freeze([['no', '没有'], ['yes', '有']]) }),
    Object.freeze({ id: 'device', title: '主要在哪看？', options: Object.freeze([['pc', '电脑'], ['phone', '手机']]) }),
]);

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizePerformanceProfile(value) {
    const src = plain(value);
    const typeIds = CARD_TYPES.map(([id]) => id);
    return {
        level: Object.prototype.hasOwnProperty.call(LEVELS, src.level) ? src.level : 'standard',
        types: (Array.isArray(src.types) ? src.types : []).filter((id, i, list) => typeIds.includes(id) && list.indexOf(id) === i),
        sound: normalizeSound(src.sound),
        adult: src.adult === true || src.adult === 'yes',
        ...(src.device === 'phone' || src.device === 'pc' ? { device: src.device } : {}),
    };
}

export function hasPerformanceProfile(reader) {
    return Boolean(plain(reader)[PROFILE_PATH] && typeof plain(reader)[PROFILE_PATH] === 'object');
}

// 各演出在这套配置下该不该开。档位「全部关闭」时一律关。
export function profileFeatureStates(profile) {
    const p = normalizePerformanceProfile(profile);
    const level = LEVELS[p.level];
    const special = new Set(p.types.flatMap((id) => TYPE_FEATURES[id] || []));
    const sound = new Set(p.sound.map((id) => SOUND_FEATURE_OF[id]).filter(Boolean));
    const states = {};
    for (const { key, tier, group } of PERFORMANCE_FEATURES) {
        let on;
        if (group === 'sound') on = sound.has(key);
        else if (key === 'romanceFx') on = p.adult;
        else if (SPECIAL_FEATURES.includes(key)) on = special.has(key);
        else on = tier <= level;
        states[key] = level > 0 && on;
    }
    return states;
}

export function applyPerformanceProfile(reader, profile) {
    if (!reader || typeof reader !== 'object') return false;
    const p = normalizePerformanceProfile(profile);
    for (const [key, enabled] of Object.entries(profileFeatureStates(p))) {
        reader[key] = { ...plain(reader[key]), enabled };
    }
    const typewriter = plain(reader.typewriter);
    reader.typewriter = { ...typewriter, sound: { ...plain(typewriter.sound), enabled: LEVELS[p.level] > 0 && p.sound.includes('typing') } };
    if (p.device) reader.performance = { ...plain(reader.performance), quality: p.device === 'phone' ? 'low' : 'auto' };
    reader[PROFILE_PATH] = { level: p.level, types: p.types, sound: p.sound, adult: p.adult };
    return true;
}

// 第一次点类型胶囊时还没有配置：按现在的开关推一份，尽量不动用户已有的选择。
export function profileFromReader(reader, level) {
    if (hasPerformanceProfile(reader)) return normalizePerformanceProfile(plain(reader)[PROFILE_PATH]);
    const on = (key) => isPerformanceFeatureOn(reader, key);
    return normalizePerformanceProfile({
        level: level || 'standard',
        types: CARD_TYPES.map(([id]) => id).filter((id) => TYPE_FEATURES[id].every(on)),
        sound: SOUND_IDS.filter((id) => (id === 'typing' ? plain(plain(plain(reader).typewriter).sound).enabled !== false : on(SOUND_FEATURE_OF[id]))),
        adult: on('romanceFx'),
    });
}

// 和配置相比用户手动多开、关掉了哪些，显示在档位条下面。
export function profileDiff(reader) {
    if (!hasPerformanceProfile(reader)) return null;
    const expected = profileFeatureStates(plain(reader)[PROFILE_PATH]);
    const added = [];
    const removed = [];
    for (const { key, label } of PERFORMANCE_FEATURES) {
        const actual = isPerformanceFeatureOn(reader, key);
        if (actual === expected[key]) continue;
        if (key === 'fxSound' && !Object.values(expected).some(Boolean)) continue;
        (actual ? added : removed).push(label);
    }
    return { added, removed };
}

export function profileSummary(profile) {
    const p = normalizePerformanceProfile(profile);
    const states = profileFeatureStates(p);
    const labels = PERFORMANCE_FEATURES.filter(({ key }) => states[key]).map(({ label }) => label);
    return LEVELS[p.level] > 0 && p.sound.includes('typing') ? labels.concat('打字机音') : labels;
}

export function typeFeatureLabels() {
    const labelOf = Object.fromEntries(PERFORMANCE_FEATURES.map(({ key, label }) => [key, label]));
    return SPECIAL_FEATURES.map((key) => [labelOf[key], CARD_TYPES.filter(([id]) => TYPE_FEATURES[id].includes(key)).map(([, name]) => name)]);
}
