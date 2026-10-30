// 建卡（合并计划 N1）：六维选主擅长 / 次擅长 / 短板，按战斗标准数组 15 / 14 / 8，其余三项 13 / 12 / 10 由属性视图推导；
// 特有技能最多选 3 项，每项 50 起步，未选的不进存档。候选 = 默认 8 项 + 当前世界观附加项 + 玩家自定义项。纯函数，不改入参。
import { BASE_ATTRIBUTES, DEFAULT_SPECIAL_SKILLS, createStatsState, withSkills } from './stat-state.js';
import { WORLD_SKILL_LEXICON, worldSkillNames } from './stat-world-skills.js';
import { ABILITY_KEYS, ABILITY_LABELS, abilityKeyOf, defaultPrefs, normalizePrefs } from '../../combat/abilities.js';

export const BUILD_PREF_FIELDS = Object.freeze(['major', 'minor', 'weak']);
export const BUILD_PREF_LABELS = Object.freeze({ major: '主擅长', minor: '次擅长', weak: '短板' });
export const BUILD_SPECIAL_COUNT = 3;
export const BUILD_SPECIAL_VALUE = 50;
export const BUILD_CUSTOM_MAX = 8;
const DEFAULT_PICK = DEFAULT_SPECIAL_SKILLS.slice(0, BUILD_SPECIAL_COUNT);
// 自定义技能名会拼进设置路径 bridge.stats.build.special.<名>：不收点号、空白、数字与标记符号，1–8 字（同学习表词长）。
const CUSTOM_NAME = /^[^\s0-9０-９.\[\]{}<>|:："'`\\/]{1,8}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const KNOWN_SPECIAL = new Set([...DEFAULT_SPECIAL_SKILLS, ...Object.keys(WORLD_SKILL_LEXICON)]);

export const BUILD_ABILITY_OPTIONS = Object.freeze(ABILITY_KEYS.map((k) => [k, ABILITY_LABELS[k]]));

// 校验单个自定义技能名；返回规范名或 null。与六维、默认特有技能重名的不收（已有）。
export function validCustomSkillName(raw) {
    const name = String(raw ?? '').trim();
    if (!CUSTOM_NAME.test(name) || RESERVED.has(name)) return null;
    if (BASE_ATTRIBUTES.includes(name) || DEFAULT_SPECIAL_SKILLS.includes(name)) return null;
    return name;
}

function normalizeCustom(raw) {
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const name = validCustomSkillName(item);
        if (name && !out.includes(name)) out.push(name);
        if (out.length >= BUILD_CUSTOM_MAX) break;
    }
    return out;
}

// prefs 原样保留选择（可能重复或缺项），由 buildSummary 判定是否可建卡；缺省取默认职业原型倾向。
function normalizeBuildPrefs(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const d = defaultPrefs();
    return Object.fromEntries(BUILD_PREF_FIELDS.map((f) => [f, abilityKeyOf(src[f]) || d[f]]));
}

export function normalizeBuild(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const specialSrc = src.special && typeof src.special === 'object' && !Array.isArray(src.special) ? src.special : {};
    const prefs = normalizeBuildPrefs(src.prefs);
    const custom = normalizeCustom(src.custom);
    const special = {};
    for (const name of DEFAULT_SPECIAL_SKILLS) {
        special[name] = Object.hasOwn(specialSrc, name) ? specialSrc[name] === true : DEFAULT_PICK.includes(name);
    }
    // 世界观附加项与自定义项：切换世界观后选择原样保留，切回来仍在（无损）。
    for (const [name, value] of Object.entries(specialSrc)) {
        if (!Object.hasOwn(special, name) && (KNOWN_SPECIAL.has(name) || custom.includes(name))) special[name] = value === true;
    }
    for (const name of custom) if (!Object.hasOwn(special, name)) special[name] = false;
    return { prefs, special, custom };
}

// 当前可选的特有技能：默认 8 项 → 世界观附加 → 自定义，去重保序。
export function specialCandidates(build, { worldview } = {}) {
    const b = normalizeBuild(build);
    return [...new Set([...DEFAULT_SPECIAL_SKILLS, ...worldSkillNames(worldview), ...b.custom])];
}

export function buildSummary(build, { worldview } = {}) {
    const b = normalizeBuild(build);
    const picked = specialCandidates(b, { worldview }).filter((name) => b.special[name] === true);
    const errors = [];
    if (!normalizePrefs(b.prefs)) errors.push('stats-build-prefs-duplicate');
    if (picked.length > BUILD_SPECIAL_COUNT) errors.push('stats-build-too-many-special');
    return { prefs: b.prefs, picked, errors, ok: errors.length === 0 };
}

// 返回 { ok, state } 或 { ok: false, reason }；倾向重复或多选时不建卡。
export function buildInitialState(build, { worldview } = {}) {
    const b = normalizeBuild(build);
    const summary = buildSummary(b, { worldview });
    if (!summary.ok) return { ok: false, reason: summary.errors[0], summary };
    const skills = {};
    for (const name of summary.picked) skills[name] = { value: BUILD_SPECIAL_VALUE, marked: false };
    return { ok: true, state: withSkills(createStatsState({ prefs: normalizePrefs(b.prefs) }), skills), summary };
}
