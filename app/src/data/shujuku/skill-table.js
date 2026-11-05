// 才艺技能表（角色姓名｜技能｜数值，一行一项）的读取、写回规划与采纳规划。纯函数，不碰数据库插件。
// 六维与特有技能都记在这张表里：IGS 有的项以 IGS 为准写进去，表里 IGS 没有的技能首次读到时收进 IGS。
import { BASE_ATTRIBUTES } from '../../scene/stats/stat-state.js';
import { LEGACY_ATTRIBUTE_MAP } from '../../scene/stats/stat-registry.js';

export const SKILL_TABLE_NAME = '才艺技能表';
export const SKILL_NAME_COLUMNS = Object.freeze(['角色姓名', '姓名', '角色名', '角色真实姓名', '名称']);
export const SKILL_COLUMN = '技能';
export const SKILL_VALUE_COLUMN = '数值';
export const SKILL_VALUE_MIN = 1;
export const SKILL_VALUE_MAX = 99;
const SAN = '理智';
const NUMBER = /-?\d+(?:\.\d+)?/;
const SIX = new Set([...BASE_ATTRIBUTES, ...Object.keys(LEGACY_ATTRIBUTE_MAP)]);

const trim = (v) => String(v ?? '').trim();

// 六维（含旧名）与 CoC 理智不是「技能」：由战斗侧与角色卡管，表里的改动不采纳。
export function isSixAttribute(name) {
    const text = trim(name);
    return SIX.has(text) || text === SAN;
}

// 旧六维名换成现行名；其余原样。
export function canonicalAttribute(name) {
    const text = trim(name);
    return Object.hasOwn(LEGACY_ATTRIBUTE_MAP, text) ? LEGACY_ATTRIBUTE_MAP[text] : text;
}

// 从解析后的表里找才艺技能表：列头含「角色姓名类」「技能」「数值」三列即可，表名不限。
export function findSkillTable(tables) {
    for (const table of tables || []) {
        const cols = (table.columns || []).map(trim);
        const nameCol = cols.findIndex((c) => SKILL_NAME_COLUMNS.includes(c));
        const skillCol = cols.indexOf(SKILL_COLUMN);
        const valueCol = cols.indexOf(SKILL_VALUE_COLUMN);
        if (nameCol >= 0 && skillCol >= 0 && valueCol >= 0 && (table.name === SKILL_TABLE_NAME || cols.length <= 5)) return { table, nameCol, skillCol, valueCol };
    }
    return null;
}

// 格内数值 → 整数（夹在 1–99）；没有数字返回 null。
export function skillCellNumber(text) {
    const hit = String(text ?? '').match(NUMBER);
    if (!hit) return null;
    const v = Number(hit[0]);
    return Number.isFinite(v) ? Math.min(SKILL_VALUE_MAX, Math.max(SKILL_VALUE_MIN, Math.round(v))) : null;
}

// 按 角色键 → 技能名 → { row, value, raw } 整理行（同一角色同一技能多行时取第一行）。
// keyOf(姓名) 把表里的姓名换成 IGS 角色键（主角为「主角」），换不出来的行跳过。
function indexRows(found, { keyOf, canon }) {
    const out = new Map();
    found.table.rows.forEach((row, i) => {
        const key = keyOf(trim(row[found.nameCol]));
        const skill = canon(trim(row[found.skillCol]));
        if (!key || !skill) return;
        const slot = out.get(key) || out.set(key, new Map()).get(key);
        if (!slot.has(skill)) slot.set(skill, { row: i, raw: trim(row[found.valueCol]), value: skillCellNumber(row[found.valueCol]) });
    });
    return out;
}

// wanted：{ 角色键: { 技能: 值 } }，IGS 现有的六维与技能。返回要改的格子与要新增的行。
// heroName：主角在表里用的姓名（新增行时用）；allowInsert 为 false 时只更新已有行。
export function planSkillPush(found, wanted, { keyOf, canon = canonicalAttribute, rowOffset = 1, heroName = '', allowInsert = true } = {}) {
    const writes = [];
    const inserts = [];
    const index = indexRows(found, { keyOf, canon });
    const columns = found.table.columns.map(trim);
    for (const [key, skills] of Object.entries(wanted || {})) {
        const have = index.get(key);
        for (const [skill, raw] of Object.entries(skills || {})) {
            const value = Math.round(Number(raw));
            if (!Number.isFinite(value)) continue;
            const hit = have && have.get(skill);
            if (hit) {
                if (hit.raw !== String(value)) writes.push({ table: found.table.name, rowIndex: hit.row + rowOffset, column: columns[found.valueCol], value: String(value), from: hit.raw });
            } else if (allowInsert) {
                inserts.push({ table: found.table.name, data: { [columns[found.nameCol]]: key === '主角' && heroName ? heroName : key, [columns[found.skillCol]]: skill, [columns[found.valueCol]]: String(value) } });
            }
        }
    }
    return { writes, inserts };
}

// known：{ 角色键: { 技能: 值 } }，IGS 现有项（六维不要放进来）。
// 返回：fresh 表里有、IGS 没有的技能（首次采纳，初值取表格值）；changed 两边都有但数值不同的技能（用户手改）。
// 只看 IGS 认识的角色；六维与理智不采纳。
export function planSkillAdoption(found, known, { keyOf, canon = canonicalAttribute } = {}) {
    const fresh = [];
    const changed = [];
    const index = indexRows(found, { keyOf, canon });
    for (const [key, skills] of index) {
        if (!Object.hasOwn(known || {}, key)) continue;
        for (const [skill, hit] of skills) {
            if (isSixAttribute(skill) || hit.value === null) continue;
            if (!Object.hasOwn(known[key], skill)) { fresh.push({ key, skill, value: hit.value }); continue; }
            const current = Math.round(Number(known[key][skill]) || 0);
            if (current !== hit.value) changed.push({ key, skill, from: current, to: hit.value });
        }
    }
    return { fresh, changed };
}

// 检定取值：不经过 IGS 引擎时按 角色姓名 + 技能 从表里取值（六维与特有技能都是百分制）。
export function lookupSkillValue(tables, name, skill, { keyOf = (n) => n } = {}) {
    const found = findSkillTable(tables);
    if (!found) return null;
    const want = canonicalAttribute(skill);
    const key = keyOf(trim(name));
    for (const row of found.table.rows) {
        if (keyOf(trim(row[found.nameCol])) !== key) continue;
        const own = canonicalAttribute(row[found.skillCol]);
        if (own !== want) continue;
        const value = skillCellNumber(row[found.valueCol]);
        if (value !== null) return value;
    }
    return null;
}
