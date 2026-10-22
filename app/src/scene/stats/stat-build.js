// 建卡分配点数（§6、§10A、Q5）：基础属性 6 项各 40 起，另有 60 点自由分配（单项 10–80，调低可退回点数）；
// 特有技能最多选 3 项，每项 50 起步，未选的不进存档。纯函数，不改入参。
import { BASE_ATTRIBUTES, DEFAULT_SPECIAL_SKILLS, createStatsState, withSkills } from './stat-state.js';

export const BUILD_BASE_DEFAULT = 40;
export const BUILD_POOL = 60;
export const BUILD_MIN = 10;
export const BUILD_MAX = 80;
export const BUILD_SPECIAL_COUNT = 3;
export const BUILD_SPECIAL_VALUE = 50;
const DEFAULT_PICK = DEFAULT_SPECIAL_SKILLS.slice(0, BUILD_SPECIAL_COUNT);

export function normalizeBuild(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const baseSrc = src.base && typeof src.base === 'object' ? src.base : {};
    const specialSrc = src.special && typeof src.special === 'object' && !Array.isArray(src.special) ? src.special : {};
    const base = {};
    for (const name of BASE_ATTRIBUTES) {
        const n = Math.round(Number(baseSrc[name]));
        base[name] = Number.isFinite(n) ? Math.min(BUILD_MAX, Math.max(BUILD_MIN, n)) : BUILD_BASE_DEFAULT;
    }
    const special = {};
    for (const name of DEFAULT_SPECIAL_SKILLS) {
        special[name] = Object.hasOwn(specialSrc, name) ? specialSrc[name] === true : DEFAULT_PICK.includes(name);
    }
    return { base, special };
}

export function buildSummary(build) {
    const b = normalizeBuild(build);
    const spent = BASE_ATTRIBUTES.reduce((sum, name) => sum + (b.base[name] - BUILD_BASE_DEFAULT), 0);
    const picked = DEFAULT_SPECIAL_SKILLS.filter((name) => b.special[name]);
    const errors = [];
    if (spent > BUILD_POOL) errors.push('stats-build-over-pool');
    if (picked.length > BUILD_SPECIAL_COUNT) errors.push('stats-build-too-many-special');
    return { spent, left: BUILD_POOL - spent, picked, errors, ok: errors.length === 0 };
}

// 返回 { ok, state } 或 { ok: false, reason }；超点或多选时不建卡。
export function buildInitialState(build) {
    const b = normalizeBuild(build);
    const summary = buildSummary(b);
    if (!summary.ok) return { ok: false, reason: summary.errors[0], summary };
    const skills = {};
    for (const name of BASE_ATTRIBUTES) skills[name] = { value: b.base[name], marked: false };
    for (const name of summary.picked) skills[name] = { value: BUILD_SPECIAL_VALUE, marked: false };
    return { ok: true, state: withSkills(createStatsState(), skills), summary };
}
