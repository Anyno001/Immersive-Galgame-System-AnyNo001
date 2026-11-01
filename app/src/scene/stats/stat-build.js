// 建卡（v0.39）：六维倾向（主擅长 / 次擅长 / 短板）或手动六维（底 8、池 24，单项 3–18，合计 72）加职业；
// 特有技能最多选 3 项，每项 50 起步，未选的不进存档。候选 = 默认 8 项 + 当前世界观附加项 + 玩家自定义项。纯函数，不改入参。
import { BASE_ATTRIBUTES, DEFAULT_SPECIAL_SKILLS, createStatsState, withSkills } from './stat-state.js';
import { LEGACY_ATTRIBUTE_MAP } from './stat-registry.js';
import { WORLD_SKILL_LEXICON, worldSkillNames } from './stat-world-skills.js';
import { ABILITY_KEYS, ABILITY_LABELS, MANUAL_BUILD, MANUAL_TOTAL, abilityKeyOf, defaultPrefs, normalizeManualScores, normalizePrefs, prefsFromScores } from '../../combat/abilities.js';
import { COMBAT_RULES } from '../../combat/rules.js';

export const BUILD_PREF_FIELDS = Object.freeze(['major', 'minor', 'weak']);
export const BUILD_PREF_LABELS = Object.freeze({ major: '主擅长', minor: '次擅长', weak: '短板' });
export const BUILD_SPECIAL_COUNT = 3;
export const BUILD_SPECIAL_VALUE = 50;
export const BUILD_CUSTOM_MAX = 8;
const DEFAULT_PICK = DEFAULT_SPECIAL_SKILLS.slice(0, BUILD_SPECIAL_COUNT);
// 自定义技能名会拼进设置路径 bridge.stats.build.special.<名>：不收点号、空白、数字与标记符号，1–8 字（同学习表词长）。
const CUSTOM_NAME = /^[^\s0-9０-９.\[\]{}<>|:："'`\/]{1,8}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
// 旧属性名（健康 / 理智 / 观察）会被归一成六维，收作技能名会和属性串号；「理智」在 CoC 下是理智值。
const ATTRIBUTE_ALIASES = new Set(Object.keys(LEGACY_ATTRIBUTE_MAP));
const KNOWN_SPECIAL = new Set([...DEFAULT_SPECIAL_SKILLS, ...Object.keys(WORLD_SKILL_LEXICON)]);
const DEFAULT_ROLE = 'warrior';
const CLASS_NAME_MAX = 12;
export const BUILD_ABILITY_OPTIONS = Object.freeze(ABILITY_KEYS.map((key) => [key, ABILITY_LABELS[key]]));
export const BUILD_ROLE_OPTIONS = Object.freeze(Object.entries(COMBAT_RULES.archetypes).map(([key, rule]) => [key, rule.label || key]));

// 校验单个自定义技能名；返回规范名或 null。与基础属性、默认特有技能重名的不收（已有）。
export function validCustomSkillName(raw) {
    const name = String(raw ?? '').trim();
    if (!CUSTOM_NAME.test(name) || RESERVED.has(name)) return null;
    if (BASE_ATTRIBUTES.includes(name) || ATTRIBUTE_ALIASES.has(name) || DEFAULT_SPECIAL_SKILLS.includes(name)) return null;
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

// 倾向三项：认得出的用，认不出的补默认职业的倾向（可能重复，由 buildSummary 报错）。
function normalizePrefFields(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const fallback = defaultPrefs();
    return Object.fromEntries(BUILD_PREF_FIELDS.map((field) => [field, abilityKeyOf(src[field]) || fallback[field]]));
}

// 旧存档的 build.base（60 点分配）不再识别：忽略。
export function normalizeBuild(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const specialSrc = src.special && typeof src.special === 'object' && !Array.isArray(src.special) ? src.special : {};
    const prefs = normalizePrefFields(src.prefs);
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
    const scoresSrc = src.scores && typeof src.scores === 'object' && !Array.isArray(src.scores) ? src.scores : {};
    const scores = Object.fromEntries(ABILITY_KEYS.map((key) => {
        const n = scoresSrc[key] === '' || scoresSrc[key] == null ? NaN : Math.round(Number(scoresSrc[key]));
        return [key, Number.isFinite(n) ? n : MANUAL_BUILD.base];
    }));
    const role = Object.hasOwn(COMBAT_RULES.archetypes, src.role) ? src.role : DEFAULT_ROLE;
    const className = typeof src.className === 'string' ? src.className.trim().slice(0, CLASS_NAME_MAX) : '';
    return { prefs, special, custom, scores, role, className };
}

// 当前可选的特有技能：默认 8 项 → 世界观附加 → 自定义，去重保序。
export function specialCandidates(build, { worldview } = {}) {
    const b = normalizeBuild(build);
    return [...new Set([...DEFAULT_SPECIAL_SKILLS, ...worldSkillNames(worldview), ...b.custom])];
}

// 倾向建卡（自动 / 相对数值）的汇总：倾向三项须互不相同，特有技能最多 3 项。
export function buildSummary(build, { worldview } = {}) {
    const b = normalizeBuild(build);
    const picked = specialCandidates(b, { worldview }).filter((name) => b.special[name] === true);
    const errors = [];
    if (!normalizePrefs(b.prefs)) errors.push('stats-build-prefs-duplicate');
    if (picked.length > BUILD_SPECIAL_COUNT) errors.push('stats-build-too-many-special');
    return { prefs: b.prefs, picked, errors, ok: errors.length === 0 };
}

// 手动六维建卡的汇总：单项 3–18、合计不超过 72。
export function manualBuildSummary(build, { worldview } = {}) {
    const b = normalizeBuild(build);
    const total = ABILITY_KEYS.reduce((sum, key) => sum + b.scores[key], 0);
    const valid = normalizeManualScores(b.scores);
    const picked = specialCandidates(b, { worldview }).filter((name) => b.special[name] === true);
    const errors = [];
    if (!valid) errors.push(total > MANUAL_TOTAL ? 'stats-build-over-total' : 'stats-build-score-range');
    if (picked.length > BUILD_SPECIAL_COUNT) errors.push('stats-build-too-many-special');
    return { scores: b.scores, total, max: MANUAL_TOTAL, left: MANUAL_TOTAL - total, prefs: valid ? prefsFromScores(valid) : null, role: b.role, className: b.className, picked, errors, ok: errors.length === 0 };
}

// 返回 { ok, state } 或 { ok: false, reason }；不合规时不建卡。mode 为 'manual' 时另返回 manual 附件，交战斗侧写初始档案。
export function buildInitialState(build, { worldview, mode } = {}) {
    const b = normalizeBuild(build);
    if (mode === 'manual') {
        const summary = manualBuildSummary(b, { worldview });
        if (!summary.ok) return { ok: false, reason: summary.errors[0], summary };
        const skills = {};
        for (const name of summary.picked) skills[name] = { value: BUILD_SPECIAL_VALUE, marked: false };
        return { ok: true, state: withSkills(createStatsState({ prefs: summary.prefs }), skills), summary, manual: { className: summary.className, role: summary.role, scores: { ...summary.scores } } };
    }
    const summary = buildSummary(b, { worldview });
    if (!summary.ok) return { ok: false, reason: summary.errors[0], summary };
    const skills = {};
    for (const name of summary.picked) skills[name] = { value: BUILD_SPECIAL_VALUE, marked: false };
    return { ok: true, state: withSkills(createStatsState({ prefs: normalizePrefs(b.prefs) }), skills), summary };
}
