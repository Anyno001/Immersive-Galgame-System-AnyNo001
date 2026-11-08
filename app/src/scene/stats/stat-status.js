// 状态底座（计划 docs/STATS_STATUS_TIME_PLAN.md B 批）：读写、日推进、提示词句子、正文标签结算。
// 全部是纯函数：输入的 cat 只读，改动时浅拷出新对象返回（存储配置共享只读，写时浅拷）。
// cat 即 catalog 的一部分：{ statuses, cycles, traits?, nsfw? }；存档结构与定义表见 stat-status-defs.js。
import { CYCLE_DEFS, LEGACY_INJECT_STATUS, STATUS_INJECT_SRC, STATUS_KINDS, STATUS_SRC, STATUS_SRC_RANK, STATUS_TAG_OFF, STATUS_TAG_ON, STATUS_DEFS, getStatusDef, statusInjectText, subInWorlds, withCalc } from './stat-status-defs.js';

const plain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const NAME_MAX = 20;
const KEY_MAX = 12;
const CHAR_MAX = 60;
const DAY_MAX = 1e6;

// 系统按条件自动挂的状态：不进标签名单（正文不必写）。周期状态由 catalog.cycles 按日期挂摘，同样不进名单（标签「来了」仍可校准）。
export const SYSTEM_AUTO_STATUS = Object.freeze(['宿醉', '醉酒', '心情很好', '手头紧', '犯瘾', '信物']);
const CYCLE_ONLY = new Set(CYCLE_DEFS.map((c) => c.status));

export const statusesOf = (cat, name) => (cat && plain(cat.statuses) && plain(cat.statuses[name]) ? cat.statuses[name] : {});
export const hasStatus = (state, cat, name, key) => Object.hasOwn(statusesOf(cat, name), key);

const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null; };

// ───── 存档清洗（stat-persist 调用）─────
export function sanitizeStatuses(raw) {
    const out = {};
    if (!plain(raw)) return out;
    for (const [name, list] of Object.entries(raw).slice(0, CHAR_MAX)) {
        if (!name || name.length > NAME_MAX || !plain(list)) continue;
        const own = {};
        for (const [key, e] of Object.entries(list).slice(0, 40)) {
            if (!key || key.length > KEY_MAX || !plain(e)) continue;
            const def = getStatusDef(key);
            const entry = {
                src: STATUS_SRC.includes(e.src) ? e.src : 'story',
                kind: STATUS_KINDS.includes(e.kind) ? e.kind : def ? def.kind : 'until',
                since: num(e.since, 0, DAY_MAX) ?? 0,
                floor: num(e.floor, 0, DAY_MAX),
            };
            const until = num(e.until, 0, DAY_MAX);
            if (until !== null) entry.until = until;
            if (typeof e.toward === 'string' && e.toward.trim() && e.toward.length <= NAME_MAX) entry.toward = e.toward.trim();
            if (e.inject === false) entry.inject = false;
            if (e.manualLock === true) entry.manualLock = true;
            own[key] = entry;
        }
        if (Object.keys(own).length) out[name] = own;
    }
    return out;
}

export function sanitizeCycles(raw) {
    const out = {};
    if (!plain(raw)) return out;
    for (const [name, list] of Object.entries(raw).slice(0, CHAR_MAX)) {
        if (!name || name.length > NAME_MAX || !plain(list)) continue;
        const own = {};
        for (const [key, e] of Object.entries(list).slice(0, 10)) {
            if (!key || key.length > KEY_MAX || !plain(e)) continue;
            const period = num(e.period, 1, 365) ?? 28;
            own[key] = { period, length: Math.min(period, num(e.length, 1, 365) ?? 5), last: num(e.last, 0, DAY_MAX) ?? 0, on: e.on !== false };
        }
        if (Object.keys(own).length) out[name] = own;
    }
    return out;
}

// ───── 写入 ─────
function setEntry(cat, name, key, entry) {
    const own = { ...statusesOf(cat, name) };
    if (entry) own[key] = entry;
    else delete own[key];
    const statuses = { ...(plain(cat && cat.statuses) ? cat.statuses : {}) };
    if (Object.keys(own).length) statuses[name] = own;
    else delete statuses[name];
    return { ...(cat || {}), statuses };
}

const refuse = (cat, reason) => ({ catalog: cat, changes: [], reason });
const rankOf = (src) => STATUS_SRC_RANK[src] ?? 0;
const srcLabel = { setting: '开场评定', story: '剧情', system: '系统', cycle: '周期', manual: '手动' };

function statusChange(name, key, from, to, note, calc) {
    return withCalc({ source: 'status', target: name, key, from, to, note }, { calc });
}

// 挂上 / 摘下。opts：{ on, src, days, toward, floor, day }。
// 同状态不叠加，只刷新天数与来源（来源只升不降）；互斥状态被顶掉；manualLock 时非 manual 来源不覆盖。
// 返回 { catalog, changes, reason? }；没有变化时 changes 为空。
export function applyStatusChange(cat, name, key, opts = {}) {
    const def = getStatusDef(key);
    const src = STATUS_SRC.includes(opts.src) ? opts.src : 'story';
    if (!def || !name) return refuse(cat, 'unknown');
    const own = statusesOf(cat, name);
    const current = own[key] || null;
    const day = num(opts.day, 0, DAY_MAX) ?? 0;
    if (current && current.manualLock && src !== 'manual') return refuse(cat, 'locked');
    if (opts.on === false) {
        if (!current) return refuse(cat, 'absent');
        return { catalog: setEntry(cat, name, key, null), changes: [statusChange(name, key, 1, 0, '摘下', [{ label: '来源', value: srcLabel[src] }, { label: '结果', value: '摘下' }])] };
    }
    let next = cat;
    const changes = [];
    // 互斥：双向查表；被互斥方手动锁定时，非手动来源挂不上。
    for (const other of Object.keys(own)) {
        if (other === key) continue;
        const od = getStatusDef(other);
        if (!(def.exclusive.includes(other) || (od && od.exclusive.includes(key)))) continue;
        if (own[other].manualLock && src !== 'manual') return refuse(cat, 'locked');
        next = setEntry(next, name, other, null);
        changes.push(statusChange(name, other, 1, 0, `被「${key}」顶替`, [{ label: '互斥', value: key }, { label: '结果', value: '摘下' }]));
    }
    // 周期状态没有周期记录时，标签挂上按该周期的默认持续天数到期。
    const cycleDef = def.kind === 'cycle' ? CYCLE_DEFS.find((c) => c.status === key) : null;
    const days = def.kind === 'timer' ? (num(opts.days, 1, 3650) || def.days) : cycleDef ? (num(opts.days, 1, 3650) || cycleDef.length) : 0;
    const entry = {
        src: current && rankOf(current.src) > rankOf(src) ? current.src : src,
        kind: def.kind,
        since: current ? current.since : day,
        floor: opts.floor !== undefined && opts.floor !== null ? num(opts.floor, 0, DAY_MAX) : current ? current.floor ?? null : null,
        ...(days ? { until: day + days } : {}),
    };
    const toward = typeof opts.toward === 'string' && opts.toward.trim() ? opts.toward.trim().slice(0, NAME_MAX) : current && current.toward;
    if (def.relation && toward) entry.toward = toward;
    if (current && current.inject === false) entry.inject = false;
    if (src === 'manual' || (current && current.manualLock)) entry.manualLock = true;
    next = setEntry(next, name, key, entry);
    const calc = [{ label: '来源', value: srcLabel[entry.src] }, ...(days ? [{ label: '持续天数', value: days }, { label: '到期日', value: entry.until }] : []), { label: '结果', value: current ? '刷新' : '挂上' }];
    changes.push(statusChange(name, key, current ? 1 : 0, 1, current ? '刷新' : '挂上', calc));
    return { catalog: next, changes };
}

// ───── 周期 ─────
const cycleDefOf = (id) => CYCLE_DEFS.find((c) => c.id === id) || null;

// 某天是否在期内：last 为上次开始日，每 period 天一轮，持续 length 天（含开始日）。last 在未来或关闭时不在期内。
export function cycleStateAt(entry, day) {
    if (!entry || entry.on === false) return { active: false };
    const period = Math.max(1, Number(entry.period) || 28);
    const length = Math.min(period, Math.max(1, Number(entry.length) || 5));
    const last = Number(entry.last) || 0;
    if (!(day >= last)) return { active: false };
    const offset = (day - last) % period;
    return { active: offset < length, start: day - offset, offset, period, length, last };
}

const cycleCalc = (s, day, result) => [{ label: '周期', value: `${s.period}天一轮，持续${s.length}天` }, { label: '上次开始', value: s.last }, { label: '当前日', value: day }, { label: '周期内第几天', value: s.offset + 1 }, { label: '结果', value: result }];

// 按日期挂摘周期状态：在期内且没有该状态则挂上（src:'cycle'），不在期内且是周期挂的则摘下（手动锁定的不动）。
export function syncCycles(cat, day) {
    let next = cat;
    const changes = [];
    for (const [name, list] of Object.entries(plain(cat && cat.cycles) ? cat.cycles : {})) {
        for (const [id, entry] of Object.entries(list)) {
            const def = cycleDefOf(id);
            if (!def || !getStatusDef(def.status)) continue;
            const s = cycleStateAt(entry, day);
            const current = statusesOf(next, name)[def.status];
            if (s.active && !current) {
                next = setEntry(next, name, def.status, { src: 'cycle', kind: 'cycle', since: s.start, until: s.start + s.length, floor: null });
                changes.push(statusChange(name, def.status, 0, 1, '周期开始', cycleCalc(s, day, '挂上')));
            } else if (!s.active && current && !current.manualLock && entry.on !== false && current.src === 'cycle') {
                next = setEntry(next, name, def.status, null);
                changes.push(statusChange(name, def.status, 1, 0, '周期结束', [{ label: '当前日', value: day }, { label: '结果', value: '摘下' }]));
            }
        }
    }
    return { catalog: next, changes };
}

// 设置周期（编辑区 / 角色卡用，F 批接界面）：period 默认 28、length 默认 5、last 上次开始日。返回新 cat，不改入参。
export function setCycle(cat, name, id, { period = 28, length = 5, last = 0, on = true } = {}) {
    if (!name || !cycleDefOf(id)) return cat;
    const p = num(period, 1, 365) ?? 28;
    const cycles = { ...(plain(cat && cat.cycles) ? cat.cycles : {}) };
    cycles[name] = { ...(plain(cycles[name]) ? cycles[name] : {}), [id]: { period: p, length: Math.min(p, num(length, 1, 365) ?? 5), last: num(last, 0, DAY_MAX) ?? 0, on: on !== false } };
    return { ...(cat || {}), cycles };
}

// 「今天开始」（接口，界面在 F 批）：上次开始日校准为 day，并立刻挂上周期状态。没有该周期记录时按默认周期新建。
export function startCycleToday(cat, name, id, day, { floor = null } = {}) {
    const def = cycleDefOf(id);
    if (!def || !name) return { catalog: cat, changes: [], reason: 'unknown' };
    const old = plain(cat && cat.cycles && cat.cycles[name]) ? cat.cycles[name][id] : null;
    const withCycle = setCycle(cat, name, id, { period: old ? old.period : def.period, length: old ? old.length : def.length, last: day, on: true });
    const s = cycleStateAt(withCycle.cycles[name][id], day);
    if (statusesOf(withCycle, name)[def.status]) return { catalog: withCycle, changes: [] };
    const next = setEntry(withCycle, name, def.status, { src: 'cycle', kind: 'cycle', since: day, until: day + s.length, floor: num(floor, 0, DAY_MAX) });
    return { catalog: next, changes: [statusChange(name, def.status, 0, 1, '今天开始', cycleCalc(s, day, '挂上'))] };
}

// 正文标签「来了」校准：该状态对应的周期记录存在时，把上次开始日改为当前日。
function calibrateCycle(cat, name, status, day, changes) {
    const def = CYCLE_DEFS.find((c) => c.status === status);
    const old = def && plain(cat && cat.cycles && cat.cycles[name]) ? cat.cycles[name][def.id] : null;
    if (!old || old.on === false) return cat;
    let next = cat;
    if (old.last !== day) {
        changes.push(statusChange(name, status, old.last, day, '校准上次开始日', [{ label: '上次开始', value: old.last }, { label: '校准为', value: day }, { label: '结果', value: day }]));
        next = setCycle(cat, name, def.id, { ...old, last: day });
    }
    // 标签挂上的周期状态改由周期接管（到期自动摘下）；手动锁定的不动。
    const current = statusesOf(next, name)[status];
    if (current && !current.manualLock && current.src !== 'cycle') {
        const length = Math.min(old.period, old.length);
        next = setEntry(next, name, status, { ...current, src: 'cycle', since: day, until: day + length });
    }
    return next;
}

// ───── 日推进 ─────
// day 为推进后的游戏日，days 为经过的天数（日结算 1，时间跳跃为跳过天数）。
// timer 到期摘下；days > 1（时间跳跃）时倒计时直接到期；until、recover 不在此处理；
// cycle：opts.cycles 为真（聊天有日期捕捉）时按日期推算是否在期内，跳跃后按新日期判断。
export function advanceStatuses(cat, day, days = 1, opts = {}) {
    let next = cat;
    const changes = [];
    const jump = Number(days) > 1;
    for (const [name, list] of Object.entries(plain(cat && cat.statuses) ? cat.statuses : {})) {
        for (const [key, e] of Object.entries(list)) {
            if (!e || (e.kind !== 'timer' && e.kind !== 'cycle')) continue;
            // 周期状态：有日期捕捉且有周期记录时由 syncCycles 按日期挂摘；否则（标签挂上、没开日期）按 until 到期，跳跃即到期。
            if (e.kind === 'cycle' && opts && opts.cycles && CYCLE_DEFS.some((c) => c.status === key && plain(cat.cycles) && plain(cat.cycles[name]) && cat.cycles[name][c.id])) continue;
            const until = Number(e.until);
            if (!jump && !(Number.isFinite(until) && until <= day)) continue;
            next = setEntry(next, name, key, null);
            const calc = [{ label: '到期日', value: Number.isFinite(until) ? until : '无' }, { label: '当前日', value: day }, ...(jump ? [{ label: '跳过天数', value: days }] : []), { label: '结果', value: '摘下' }];
            changes.push(statusChange(name, key, 1, 0, jump ? `跳过${days}天，到期摘下` : '到期摘下', calc));
        }
    }
    if (opts && opts.cycles) {
        const r = syncCycles(next, day);
        next = r.catalog;
        changes.push(...r.changes);
    }
    return { catalog: next, changes };
}

// 回满后清除恢复型状态（伤势本身由战斗账本清）。
export function clearRecoverStatuses(cat, name) {
    let next = cat;
    const changes = [];
    for (const [key, e] of Object.entries(statusesOf(cat, name))) {
        if (!e || e.kind !== 'recover' || e.manualLock) continue;
        next = setEntry(next, name, key, null);
        changes.push(statusChange(name, key, 1, 0, '伤势痊愈，摘下', [{ label: '结果', value: '摘下' }]));
    }
    return { catalog: next, changes };
}

// ───── 提示词 ─────
// 只给在场角色、只给 STATUS_INJECT_SRC 来源且 inject !== false 的状态，一状态一句。
export function statusPromptLines(state, cat, present) {
    const lines = [];
    for (const name of Array.isArray(present) ? present : []) {
        const own = statusesOf(cat, name);
        for (const [key, e] of Object.entries(own)) {
            if (!e || !STATUS_INJECT_SRC.includes(e.src) || e.inject === false) continue;
            const text = statusInjectText(getStatusDef(key), name, e.toward);
            if (!text) continue;
            lines.push(`${text}。`);
        }
        // 旧特质五项（无实体、已故、失忆、不眠、附身）：剧情或手动挂上的才注入；开场评定（auto）视同人设已写，不注入。
        const traits = cat && plain(cat.traits) && plain(cat.traits[name]) ? cat.traits[name] : {};
        for (const [label, sentence] of Object.entries(LEGACY_INJECT_STATUS)) {
            const key = LEGACY_TRAIT_KEY[label] || label;
            const t = traits[key];
            if (!t || t.on === false || !['story', 'manual'].includes(t.src)) continue;
            if (Object.hasOwn(own, label)) continue;
            lines.push(`${sentence.replaceAll('{{名}}', name)}。`);
        }
        // 剧情中挂上的猜忌（关系状态，存 relStates）：一句客观事实；开局设定来的不注入。
        const rels = state && state.characters && state.characters[name] && Array.isArray(state.characters[name].relStates) ? state.characters[name].relStates : [];
        if (rels.some((r) => r && r.id === '猜忌' && r.dir === 'ta' && r.src === 'story')) lines.push(`${name}怀疑主角。`);
    }
    return lines;
}
// 旧存档里这五项的键（无实体沿用英文键）。
const LEGACY_TRAIT_KEY = Object.freeze({ 无实体: 'bodiless' });

// 提示词里列出的状态标签名：不含系统自动挂的与只由周期挂的。
export const listableStatusNames = (worlds = null) => STATUS_DEFS.filter((d) => !SYSTEM_AUTO_STATUS.includes(d.name) && !CYCLE_ONLY.has(d.name) && subInWorlds(d.sub, worlds)).map((d) => d.name);

// worlds：聊天的题材列表（E5），为空不过滤；有子类的状态只在该题材在列表里时列出。
export const STATUS_TAG_LINE = (worlds = null) => {
    const names = listableStatusNames(worlds).join('、');
    return `[igs-stat:status|角色名|状态名|开始/结束]（仅在剧情中确实发生时才写，没有变化不写；关系状态另加第五段对象名。可用状态：${names}）`;
};

// ───── 正文标签结算 ─────
export const statusWordOn = (word) => STATUS_TAG_ON.includes(String(word ?? '').trim());
export const statusWordOff = (word) => STATUS_TAG_OFF.includes(String(word ?? '').trim());

// 把本楼的 status 指令依次交给 applyStatusChange。box = { cat }（单次结算的持有者，整体替换不原地改 cat）。
// resolve(名) 返回登记名或 null；主角别名由调用方在 resolve 里处理。返回本楼产生的 changes（已推入 changes 数组）。
export function settleStatusDirectives(box, directives, { day = 0, floor = null, resolve = (n) => n, changes = [], diagnostics = [] } = {}) {
    const seenTags = new Set();
    for (const d of directives) {
        if (!d || d.kind !== 'status') continue;
        const dup = `${d.target}|${d.status}`;
        if (seenTags.has(dup)) continue;
        seenTags.add(dup);
        const who = resolve(d.target);
        if (!who) { diagnostics.push({ code: 'stat-unknown-character', name: d.target, kind: 'status' }); continue; }
        const toward = d.toward ? resolve(d.toward) || d.toward : undefined;
        const r = applyStatusChange(box.cat, who, d.status, { on: d.on, src: 'story', toward, floor, day });
        if (r.reason && r.reason !== 'absent') diagnostics.push({ code: 'stat-status-refused', name: who, status: d.status, reason: r.reason });
        box.cat = r.catalog;
        changes.push(...r.changes);
        // 周期状态「来了」：校准上次开始日（有周期记录才改）。
        if (d.on === true && !r.reason) box.cat = calibrateCycle(box.cat, who, d.status, day, changes);
    }
    return box.cat;
}
