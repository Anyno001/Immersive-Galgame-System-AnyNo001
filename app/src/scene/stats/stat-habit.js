// 习惯机制：同一角色被反复做同一件事，影响逐次减小。计划见 docs/STATS_HABIT_PLAN.md。
// 叶子模块：只从 stat-state、stat-status-defs 导入（避免循环引用，见 v0.39.79）。
// 计数存在角色档 habit: { [行为]: { n, day } }，只读 before 的值、结算末尾写回一次，同一楼重算不会重复累计。
import { isRomance, withCharacter } from './stat-state.js';
import { calcRow } from './stat-status-defs.js';

export const OFFENSE_KEYS = Object.freeze(['顶撞', '命令', '批评', '拒绝', '冷落', '炫耀']);
export const POSITIVE_KEYS = Object.freeze(['送礼', '夸奖', '约会', '亲密', '求助']);
const POSITIVE_EVENTS = new Set(['夸奖', '求助']);
// 第 1、2、3、4 次及以后的倍率。
const MULTS = Object.freeze([1, 0.6, 0.3, 0.1]);
// 强势类前 5 次保留屡犯升档，第 6 次起才进入习惯打折；记仇、偏执狂的冒犯不打折。
export const STRONG_TRAITS = Object.freeze(['强势', '女王', '大小姐', '控制狂', '龙系']);
export const GRUDGE_TRAITS = Object.freeze(['记仇', '偏执狂']);
export const STRONG_FREE = 5;
export const REUNION_DAYS = 7;
export const REUNION_FAVOR = 26;

const num = (v) => Number(v) || 0;
export const habitMult = (order) => MULTS[Math.min(MULTS.length, Math.max(1, order)) - 1];

// 有效次数：恋人不消退；其余某行为整整一个游戏日没发生，次数 −1。
export function effectiveCount(entry, day, lover) {
    const n = Math.max(0, Math.floor(num(entry && entry.n)));
    if (!n || lover) return n;
    const last = Number(entry.day);
    return Math.max(0, n - (Number.isFinite(last) ? Math.max(0, day - last - 1) : 0));
}

// 按倍率取整；keepOne 为真时保底 1（好感扣分与正面收益），否则可到 0（芥蒂、信任）。
export function scaleByHabit(amount, h, keepOne = false) {
    if (!h || !(h.mult < 1) || !amount) return amount;
    const v = Math.round(amount * h.mult);
    return keepOne ? Math.max(1, v) : v;
}

export const showHabit = (h) => Boolean(h && h.n >= 2 && (h.exempt || h.mult < 1));
export const habitRow = (h) => calcRow('习惯', h.exempt ? `第${h.n}次（${h.exempt}，未打折）` : `第${h.n}次，×${h.mult}`);
export const habitNoteSuffix = (h) => (!h || !(h.mult < 1) ? '' : h.key === '送礼' ? '（收礼收惯了）' : '（习惯了）');

// 特质钩子的同事件加芥蒂：按该冒犯行为的习惯倍率取整，可到 0。
export const hookGrudge = (ctx, name, key, amount) => scaleByHabit(amount, offenseHabit(ctx && ctx.habit, name, key));
export const pickHabit = (hb, dir) => (hb ? (dir === 'neg' ? hb.offense : dir === 'pos' ? hb.positive : null) || null : null);
// 某个冒犯行为的习惯条目（没有该行为时退回本楼最新鲜的那条）。
export const offenseHabit = (map, name, key) => { const hb = map && typeof map.get === 'function' ? map.get(name) : null; return hb ? hb.by[key] || hb.offense || null : null; };

// 恋爱结束后恢复按天消退：从结束那天起算，把各行为的日期刷成当天。
export function refreshHabit(habit, day) {
    if (!habit || typeof habit !== 'object') return habit;
    return Object.fromEntries(Object.entries(habit).map(([k, e]) => [k, { ...e, day }]));
}

/// 预扫本楼：{ 名 → { lover, reunion, offense, positive, by, offenseKeys, positiveKeys, base } }。不改任何传入对象。
/// 恋人与重逢都读 before（楼首）；directives / reviewEvents 口径与雷点 hit() 一致。
export function scanHabit({ before, directives, reviewEvents, has, day, here, lastSeen, romanceSeen }) {
    const out = new Map();
    const evs = (Array.isArray(reviewEvents) ? reviewEvents : []).filter((e) => e && e.type && e.name && e.dir !== 'me');
    for (const name of Object.keys(before.characters)) {
        const cur = before.characters[name];
        const off = new Set();
        const pos = new Set();
        for (const d of directives) {
            if (d.target !== name) continue;
            if ((d.kind === 'event' || d.kind === 'traitEvent') && OFFENSE_KEYS.includes(d.value)) off.add(d.value);
            if ((d.kind === 'event' || d.kind === 'traitEvent') && POSITIVE_EVENTS.has(d.value)) pos.add(d.value);
            if (d.kind === 'event' && d.value === '约会') pos.add('约会');
            if (d.kind === 'gift') pos.add('送礼');
            if (d.kind === 'intimate') pos.add('亲密');
        }
        for (const e of evs) {
            if (e.name !== name) continue;
            if (OFFENSE_KEYS.includes(e.type)) off.add(e.type);
            if (POSITIVE_EVENTS.has(e.type)) pos.add(e.type);
        }
        const lover = isRomance(cur, name, romanceSeen);
        const seen = lastSeen && lastSeen[name];
        const long = Number.isFinite(seen) && here.has(name) && day - seen >= REUNION_DAYS;
        const back = evs.some((e) => e.name === name && e.type === '重逢') || long;
        const reunion = back && num(cur.reunionDay) !== day && (lover || num(cur.dims && cur.dims.好感) >= REUNION_FAVOR);
        if (!off.size && !pos.size && !reunion) continue;
        const hard = GRUDGE_TRAITS.find((t) => has(name, t));
        const strong = hard ? null : STRONG_TRAITS.find((t) => has(name, t));
        const base = {};
        const by = {};
        const entry = (key, offense) => {
            const n = effectiveCount(cur.habit && cur.habit[key], day, lover);
            base[key] = n;
            const order = n + 1;
            if (offense && hard) return { key, n: order, mult: 1, exempt: hard };
            if (offense && strong) return order <= STRONG_FREE ? { key, n: order, mult: 1, exempt: strong } : { key, n: order, mult: habitMult(order - STRONG_FREE + 1), exempt: null };
            return { key, n: order, mult: habitMult(order), exempt: null };
        };
        const freshest = (list) => list.reduce((best, e) => (!best || e.mult > best.mult ? e : best), null);
        const offList = [...off].map((k) => (by[k] = entry(k, true)));
        const posList = [...pos].map((k) => entry(k, false));
        out.set(name, { lover, reunion, offense: freshest(offList), positive: freshest(posList), by, offenseKeys: [...off], positiveKeys: [...pos], base });
    }
    return out;
}

/// 雷点之后一次性写回：每个出现的行为 +1（重逢缓冲那一楼冒犯不计），重逢当天标记 reunionDay。写时浅拷。
export function commitHabit(state, map, day) {
    let next = state;
    if (!map) return next;
    for (const [name, hb] of map) {
        const cur = next.characters[name];
        if (!cur) continue;
        const keys = [...(hb.reunion ? [] : hb.offenseKeys), ...hb.positiveKeys];
        const patch = {};
        if (keys.length) {
            const habit = { ...(cur.habit && typeof cur.habit === 'object' ? cur.habit : {}) };
            for (const k of keys) habit[k] = { n: hb.base[k] + 1, day };
            patch.habit = habit;
        }
        if (hb.reunion && hb.offenseKeys.length) patch.reunionDay = day;
        if (Object.keys(patch).length) next = withCharacter(next, name, { ...cur, ...patch });
    }
    return next;
}
