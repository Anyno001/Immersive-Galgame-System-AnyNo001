// 状态底座（计划 docs/STATS_STATUS_TIME_PLAN.md B 批）：读写、日推进、提示词句子、正文标签结算。
// 全部是纯函数：输入的 cat 只读，改动时浅拷出新对象返回（存储配置共享只读，写时浅拷）。
// cat 即 catalog 的一部分：{ statuses, cycles, traits?, nsfw? }；存档结构与定义表见 stat-status-defs.js。
import { CYCLE_DEFS, LEGACY_INJECT_STATUS, STATUS_INJECT_SRC, STATUS_KINDS, STATUS_SRC, STATUS_SRC_RANK, STATUS_TAG_OFF, STATUS_TAG_ON, STATUS_DEFS, getStatusDef, statusInjectText, withCalc } from './stat-status-defs.js';

const plain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const NAME_MAX = 20;
const KEY_MAX = 12;
const CHAR_MAX = 60;
const DAY_MAX = 1e6;

// 系统按条件自动挂的状态：不进标签名单（正文不必写）。周期状态由周期挂摘，但「身体不适」也可由剧情挂，仍然列出。
export const SYSTEM_AUTO_STATUS = Object.freeze(['宿醉']);
const CYCLE_ONLY = new Set(CYCLE_DEFS.map((c) => c.status).filter((s) => s !== '身体不适'));

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
    const days = def.kind === 'timer' ? (num(opts.days, 1, 3650) || def.days) : 0;
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

// ───── 日推进 ─────
// day 为推进后的游戏日，days 为经过的天数（日结算 1，时间跳跃为跳过天数）。
// timer 到期摘下；days > 1（时间跳跃）时倒计时直接到期；until、cycle、recover 不在此处理。
export function advanceStatuses(cat, day, days = 1) {
    let next = cat;
    const changes = [];
    const jump = Number(days) > 1;
    for (const [name, list] of Object.entries(plain(cat && cat.statuses) ? cat.statuses : {})) {
        for (const [key, e] of Object.entries(list)) {
            if (!e || e.kind !== 'timer') continue;
            const until = Number(e.until);
            if (!jump && !(Number.isFinite(until) && until <= day)) continue;
            next = setEntry(next, name, key, null);
            const calc = [{ label: '到期日', value: Number.isFinite(until) ? until : '无' }, { label: '当前日', value: day }, ...(jump ? [{ label: '跳过天数', value: days }] : []), { label: '结果', value: '摘下' }];
            changes.push(statusChange(name, key, 1, 0, jump ? `跳过${days}天，到期摘下` : '到期摘下', calc));
        }
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
    }
    return lines;
}
// 旧存档里这五项的键（无实体沿用英文键）。
const LEGACY_TRAIT_KEY = Object.freeze({ 无实体: 'bodiless' });

// 提示词里列出的状态标签名：不含系统自动挂的与只由周期挂的。
export const listableStatusNames = () => STATUS_DEFS.filter((d) => !SYSTEM_AUTO_STATUS.includes(d.name) && !CYCLE_ONLY.has(d.name)).map((d) => d.name);

export const STATUS_TAG_LINE = () => {
    const names = listableStatusNames().join('、');
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
    }
    return box.cat;
}
