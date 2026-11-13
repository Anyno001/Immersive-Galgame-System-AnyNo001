// 其他角色改名与合并：状态、变动记录、聊天级目录里以名字为键的数据一并换名。全部是纯函数，不改入参。
import { DIM_MAX, clamp, dimMin } from './stat-state.js';

const NAME_MAX = 20;
const NAME_BAD = /[|｜\[\]【】:：\n\r]/;
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validPersonName(name) {
    return typeof name === 'string' && name.length > 0 && name.length <= NAME_MAX && !NAME_BAD.test(name);
}

// 曾用名 → 现用名；最多跟 8 层，防止坏档成环。
export function canonPersonName(renames, name) {
    let cur = name;
    for (let i = 0; i < 8 && plain(renames) && Object.hasOwn(renames, cur) && renames[cur] !== cur; i += 1) cur = renames[cur];
    return cur;
}

// 两份档案并成一人：各项数值相加（两个名字各自从 0 记起），其余以现用名那份为准，缺的用旧名补。
// 习惯、踩雷日期、当日扣分账：不让现用名那份整个覆盖旧名。habit 取 n 较大、日期较晚；mineLast 取较晚日；mineDay 同日相加。
function mergeHabit(old, cur) {
    const out = {};
    if (plain(old.habit) || plain(cur.habit)) {
        const habit = { ...(plain(old.habit) ? old.habit : {}) };
        for (const [k, e] of Object.entries(plain(cur.habit) ? cur.habit : {})) {
            const o = habit[k];
            habit[k] = o ? { n: Math.max(Number(o.n) || 0, Number(e.n) || 0), day: Math.max(Number(o.day) || 0, Number(e.day) || 0) } : e;
        }
        out.habit = habit;
    }
    if (plain(old.mineLast) || plain(cur.mineLast)) {
        const last = { ...(plain(old.mineLast) ? old.mineLast : {}) };
        for (const [k, v] of Object.entries(plain(cur.mineLast) ? cur.mineLast : {})) last[k] = Math.max(Number(last[k]) || 0, Number(v) || 0);
        out.mineLast = last;
    }
    if (plain(old.mineDay) || plain(cur.mineDay)) {
        const a = plain(old.mineDay) ? old.mineDay : {};
        const b = plain(cur.mineDay) ? cur.mineDay : {};
        out.mineDay = a.day === b.day ? { day: a.day, lost: (Number(a.lost) || 0) + (Number(b.lost) || 0) } : (Number(b.day) || 0) >= (Number(a.day) || 0) && b.day !== undefined ? b : a;
    }
    return out;
}

function mergeCharacter(old, cur) {
    const dims = { ...old.dims };
    for (const [k, v] of Object.entries(cur.dims || {})) dims[k] = clamp((Number(dims[k]) || 0) + (Number(v) || 0), dimMin(k), DIM_MAX);
    const romance = old.romance === true || cur.romance === true ? true : cur.romance ?? old.romance;
    return {
        ...old, ...cur, dims,
        unlocked: [...new Set([...(old.unlocked || []), ...(cur.unlocked || [])])],
        lastSeenDay: Math.max(Number(old.lastSeenDay) || 0, Number(cur.lastSeenDay) || 0),
        heart: Math.max(Number(old.heart) || 0, Number(cur.heart) || 0),
        ...mergeHabit(old, cur),
        ...(romance === undefined ? {} : { romance }),
    };
}

export function renameInState(state, from, to) {
    if (!state || !plain(state.characters) || !Object.hasOwn(state.characters, from)) return state;
    const { [from]: old, ...rest } = state.characters;
    rest[to] = rest[to] ? mergeCharacter(old, rest[to]) : old;
    return { ...state, characters: rest };
}

export function renameChangeRows(rows, from, to) {
    if (!Array.isArray(rows) || !rows.some((r) => r && r.target === from)) return rows;
    return rows.map((r) => (r && r.target === from ? { ...r, target: to } : r));
}

// 楼层 meta.manual（手改数值，键为角色名）。
export function renameFloorMeta(meta, from, to) {
    if (!plain(meta) || !plain(meta.manual) || !Object.hasOwn(meta.manual, from)) return meta;
    const { [from]: old, ...rest } = meta.manual;
    rest[to] = { ...old, ...(rest[to] || {}) };
    return { ...meta, manual: rest };
}

const moveKey = (map, from, to, join = null) => {
    if (!plain(map) || !Object.hasOwn(map, from)) return map;
    const { [from]: old, ...rest } = map;
    rest[to] = Object.hasOwn(rest, to) ? (join ? join(old, rest[to]) : rest[to]) : old;
    return rest;
};
const moveItem = (list, from, to) => (Array.isArray(list) && list.includes(from) ? [...new Set(list.map((n) => (n === from ? to : n)))] : list);
const spread = (old, cur) => ({ ...old, ...cur });

export function renameCatalog(catalog, from, to) {
    const renames = {};
    for (const [k, v] of Object.entries(plain(catalog.renames) ? catalog.renames : {})) if (k !== to) renames[k] = v === from ? to : v;
    renames[from] = to;
    const queue = catalog.queue || {};
    return {
        ...catalog,
        renames,
        sheets: moveKey(catalog.sheets, from, to),
        traits: moveKey(catalog.traits, from, to, spread),
        aptitude: moveKey(catalog.aptitude, from, to),
        heroNotes: moveKey(catalog.heroNotes, from, to),
        traitNotes: moveKey(catalog.traitNotes, from, to),
        landmineKnown: moveKey(catalog.landmineKnown, from, to, spread),
        softKnown: moveKey(catalog.softKnown, from, to, spread),
        statuses: moveKey(catalog.statuses, from, to),
        cycles: moveKey(catalog.cycles, from, to),
        counters: moveKey(catalog.counters, `瘾:${from}`, `瘾:${to}`),
        romanceSeen: moveItem(catalog.romanceSeen, from, to),
        notified: moveItem(catalog.notified, from, to),
        traitInit: moveItem(catalog.traitInit, from, to),
        queue: { ...queue, people: moveItem(queue.people, from, to) },
        fameBars: Array.isArray(catalog.fameBars) ? catalog.fameBars.map((b) => (b && b.owner === from ? { ...b, owner: to } : b)) : catalog.fameBars,
        intimacyForced: [],
    };
}
