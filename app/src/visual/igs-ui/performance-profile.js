// 快速配置演出：新手问卷写一份配置，演出页的档位按它换热闹程度。
// 常用演出按热闹程度（tier）开；特定类型的演出只在问卷里勾了对应卡片类型时开，之后由用户在「题材专属」里自己管；声音、亲密各由一题单独决定。
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
    // 细调题分章：展开那一章才问，没展开的章不改对应设置。
    Object.freeze({ id: 'typing', section: 'pace', title: '文字怎么出来？', options: Object.freeze([['instant', '整段直接显示'], ['fast', '快速打字'], ['medium', '中速打字'], ['slow', '慢慢打字']]) }),
    Object.freeze({ id: 'cghold', section: 'pace', title: '日常 CG 出来后留几页？', options: Object.freeze([['2', '2 页'], ['4', '4 页'], ['6', '6 页'], ['8', '8 页']]) }),
    Object.freeze({ id: 'cards', section: 'pace', title: '换场景、打电话时要不要过场卡和分屏？', options: Object.freeze([['on', '要，有仪式感'], ['off', '不要，直接切']]) }),
    Object.freeze({ id: 'mood', section: 'look', title: '喜欢什么气质的对话框？', options: Object.freeze([['plain', '简洁现代'], ['classic', '西式古典'], ['guofeng', '古风国画'], ['cute', '可爱绘本'], ['dark', '暗黑恐怖'], ['veil', '电影黑幕']]) }),
    Object.freeze({ id: 'size', section: 'look', title: '字号？', options: Object.freeze([['small', '小'], ['normal', '适中'], ['large', '大']]) }),
    Object.freeze({ id: 'cinema', section: 'look', title: '背景要电影黑边吗？', note: '上下两条黑边只盖背景，人物照常。', options: Object.freeze([['off', '不要'], ['on', '要']]) }),
]);

export const PROFILE_SECTIONS = Object.freeze([
    Object.freeze({ id: 'pace', title: '细调阅读节奏' }),
    Object.freeze({ id: 'look', title: '细调视觉风格' }),
]);

const MOOD_SKINS = Object.freeze({ plain: 'default', classic: 'western-classic', guofeng: 'qinglv-shanshui', cute: 'warm-picturebook', dark: 'horror-gore', veil: 'gradient-veil' });
const FONT_SIZES = Object.freeze({ small: 14, normal: 16, large: 20 });

// 只写答过的细调题；没展开的章节、没选的题都不动。
export function applyProfileDetails(reader, answers) {
    if (!reader || typeof reader !== 'object') return false;
    const a = plain(answers);
    const open = Array.isArray(a.sections) ? a.sections : [];
    const has = (section, id) => open.includes(section) && typeof a[id] === 'string' && a[id];
    if (has('pace', 'typing')) {
        const typewriter = plain(reader.typewriter);
        reader.typewriter = a.typing === 'instant' ? { ...typewriter, enabled: false } : { ...typewriter, enabled: true, speed: a.typing };
    }
    if (has('pace', 'cghold')) reader.cgHoldPages = Number(a.cghold);
    if (has('pace', 'cards')) {
        const on = a.cards === 'on';
        reader.titleCard = { ...plain(reader.titleCard), enabled: on || plain(reader.titleCard).enabled === true, onLocation: on, call: on };
    }
    if (has('look', 'mood') && MOOD_SKINS[a.mood]) reader.dialogSkin = MOOD_SKINS[a.mood];
    if (has('look', 'size') && FONT_SIZES[a.size]) reader.fontSize = FONT_SIZES[a.size];
    if (has('look', 'cinema')) reader.cinemaBars = a.cinema === 'on';
    return true;
}

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

// keepSpecial：演出页切档位时不动「题材专属」开关（「全部关闭」仍一律关）。
export function applyPerformanceProfile(reader, profile, { keepSpecial = false } = {}) {
    if (!reader || typeof reader !== 'object') return false;
    const p = normalizePerformanceProfile(profile);
    const skipSpecial = keepSpecial && LEVELS[p.level] > 0;
    for (const [key, enabled] of Object.entries(profileFeatureStates(p))) {
        if (skipSpecial && SPECIAL_FEATURES.includes(key)) continue;
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

// 和配置相比用户手动多开、关掉了哪些，显示在档位条下面。「题材专属」开关归用户自己管，不算偏离（全部关闭时除外）。
export function profileDiff(reader) {
    if (!hasPerformanceProfile(reader)) return null;
    const profile = normalizePerformanceProfile(plain(reader)[PROFILE_PATH]);
    const expected = profileFeatureStates(profile);
    const userManaged = LEVELS[profile.level] > 0;
    const added = [];
    const removed = [];
    for (const { key, label } of PERFORMANCE_FEATURES) {
        if (userManaged && SPECIAL_FEATURES.includes(key)) continue;
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

