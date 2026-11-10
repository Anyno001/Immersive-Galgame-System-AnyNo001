// 特质规则分文件（B 批·合成专属效果补齐）：天选之子、笨蛋美人（主角）、天才（NPC 不受每日次数限制）、卷王（成长失败一半机会）、
// 万人迷两条追加效果、吸血鬼满三天未吸血与人鱼离水满三天的压力惩罚（深海之心主角在场时取消）。
// 由 stat-trait-rules.js 汇总，排在 fixup 之后。本文件不得 import stat-traits.js 与其他规则文件（避免循环），特质判定一律经 api.has。
// 只改数值，不碰战斗与亲密对决的牌组、主导权、回合与牌效。状态不原地修改。
import { SKILL_MAX, withCharacter, withClock } from './stat-state.js';
import { rollDie } from './stat-rng.js';

export const SCALE = [];
export const FLAG = [];
export const DAILY = [];
export const DICE = [];

const HERO = '主角';
const HEART = 51;
// 「一档换算」：好感小升 2；日结算缓升 3。
const FAVOR_SMALL = 2;
const STRESS_DAY = 3;
const PENALTY_DAYS = 3;
// 每天一次的小记录：clock.combo2Days = { 键: 日期 }。
const KEEP = 'combo2Days';
const num = (v) => Number(v) || 0;
const dimOf = (c, dim) => num(c && c.dims && c.dims[dim]);
const rise = (c) => num(c.to) > num(c.from);
const amountOf = (c) => num(c.to) - num(c.from);
const handled = new WeakSet();
// 去掉卷王预掷记录（不留空字段）。
const dropRolls = (hero) => { const { grindRolls, ...rest } = hero; void grindRolls; return rest; };

const hasCombo = (api, state, name, combo) => api.has(state, name, `combo:${combo}`);
const holdersOf = (state, api, id) => [HERO, ...Object.keys(state.characters)].filter((n) => api.has(state, n, id));
const mapOf = (state, key) => (state.clock[key] && typeof state.clock[key] === 'object' ? state.clock[key] : {});

function once(state, key) {
    const map = mapOf(state, KEEP);
    if (map[key] === state.clock.day) return null;
    return withClock(state, { [KEEP]: { ...map, [key]: state.clock.day } });
}

// 天选之子（主角）：每天第一次关键事件大失败改为普通失败（退回大失败的好感与芥蒂，按普通失败记下关口）。
function chosenOneHook(state, api) {
    if (!hasCombo(api, state, HERO, '天选之子')) return state;
    const { ctx } = api;
    const hits = ctx.changes.filter((c) => c.source === 'tag' && !handled.has(c) && /大失败$/.test(String(c.note || '')) && (c.key === '好感' || c.key === '芥蒂') && state.characters[c.target]);
    if (!hits.length) return state;
    const marked = once(state, '天选之子');
    if (!marked) return state;
    let next = marked;
    const target = hits[0].target;
    for (const c of hits.filter((x) => x.target === target)) {
        handled.add(c);
        next = api.bump(next, target, c.key, -amountOf(c), '天选之子');
    }
    const ev = (ctx.events || []).find((e) => e && e.target === target && e.fumble);
    if (ev && ev.gate != null) next = withCharacter(next, target, { ...next.characters[target], keyFail: { gate: ev.gate, day: next.clock.day } });
    if (ctx.flags && ctx.flags.keyFumble && ctx.flags.keyFumble.target === target) delete ctx.flags.keyFumble;
    return next;
}

// 笨蛋美人（主角）：主角检定失败那一楼，在场所有角色对主角好感小升。NPC 挂此合成时，他人对其的好感无数值，不结算。
function sillyBeautyHook(state, api) {
    if (!hasCombo(api, state, HERO, '笨蛋美人') || api.ctx.checkSuccess !== false) return state;
    let next = state;
    for (const name of api.here) if (name !== HERO && next.characters[name]) next = api.bump(next, name, '好感', FAVOR_SMALL, '笨蛋美人');
    return next;
}

// 万人迷（主角）：初次见面那一楼对方好感小升；三人以上对主角好感在「心动」以上时，这些人吃醋所加芥蒂减半。
function charmerHook(state, api) {
    if (!hasCombo(api, state, HERO, '万人迷')) return state;
    const { ctx } = api;
    let next = state;
    const seen = ctx.lastSeen || {};
    for (const name of Object.keys(next.characters)) if (!Object.hasOwn(seen, name)) next = api.bump(next, name, '好感', FAVOR_SMALL, '万人迷·初见');
    const fans = Object.keys(next.characters).filter((n) => dimOf(next.characters[n], '好感') >= HEART);
    if (fans.length < 3) return next;
    for (const name of fans) {
        for (const c of ctx.changes.filter((x) => x.target === name && x.key === '芥蒂' && x.source === 'tag' && x.note === '吃醋' && rise(x) && !handled.has(x))) {
            handled.add(c);
            const cut = Math.floor(amountOf(c) / 2);
            if (cut > 0) next = api.bump(next, name, '芥蒂', -cut, '万人迷');
        }
    }
    return next;
}

// 天才（NPC）：剧情成长标签不受每日次数限制（本楼因次数上限被拦下的成长照常结算一次 1d10）。
function geniusHook(state, api) {
    const { ctx } = api;
    if (!Array.isArray(ctx.diagnostics) || typeof ctx.skillValueOf !== 'function') return state;
    let next = state;
    for (let i = ctx.diagnostics.length - 1; i >= 0; i -= 1) {
        const dg = ctx.diagnostics[i];
        if (!dg || dg.code !== 'stat-grow-daily-limit' || !next.characters[dg.name] || !hasCombo(api, next, dg.name, '天才')) continue;
        ctx.diagnostics.splice(i, 1);
        const cur = next.characters[dg.name];
        const growth = cur.skillGrowth || {};
        const own = growth[dg.skill] || {};
        const from = num(ctx.skillValueOf(next, dg.name, dg.skill));
        const to = Math.min(Math.max(SKILL_MAX, from), from + rollDie(10, ctx.random));
        if (to <= from) continue;
        ctx.changes.push({ source: 'trait', target: dg.name, key: dg.skill, from, to, note: '天才' });
        next = withCharacter(next, dg.name, { ...cur, skillGrowth: { ...growth, [dg.skill]: { ...own, bonus: num(own.bonus) + (to - from), marked: Boolean(own.marked), tagCount: num(own.tagCount || 1) + 1 } } });
    }
    return next;
}

// 卷王（主角）：为本楼打勾的技能预掷「失败后一半机会」及涨幅，记在 protagonist.grindRolls，日结算时只对没成长的技能生效。
function grindHook(state, api) {
    const hero = state.protagonist;
    if (!hasCombo(api, state, HERO, '卷王')) return hero.grindRolls ? { ...state, protagonist: dropRolls(hero) } : state;
    const random = api.ctx.random || Math.random;
    const rolls = {};
    for (const [skill, s] of Object.entries(hero.skills || {})) if (s && s.marked) rolls[skill] = random() < 0.5 ? rollDie(10, random) : 0;
    return { ...state, protagonist: { ...hero, grindRolls: rolls } };
}

// 吸血鬼：记下吸血的日期（满三天未吸血起，日结算每天压力缓升）。
function biteHook(state, api) {
    if (!api.directives.some((d) => d.kind === 'traitEvent' && d.value === '吸血')) return state;
    let next = state;
    for (const name of holdersOf(next, api, '吸血鬼')) {
        if (name !== HERO && !api.here.has(name)) continue;
        const map = mapOf(next, 'biteDays');
        if (map[name] !== next.clock.day) next = withClock(next, { biteDays: { ...map, [name]: next.clock.day } });
    }
    return next;
}

export const TAG_HOOKS = [chosenOneHook, sillyBeautyHook, charmerHook, geniusHook, grindHook, biteHook];

// ---- 日结算钩子 ----
// api.shiftStress 以内部状态为准，所以先调完压力，再写 clock 与主角字段。
export const DAILY_HOOKS = [
    (state, api) => {
        let next = state;
        const day = api.day;
        // 卷王：成长检定失败的技能按预掷结果再成长一次。
        const rolls = state.protagonist.grindRolls;
        let skillsPatch = null;
        if (rolls && api.has(state, HERO, 'combo:卷王')) {
            const grown = new Set(api.changes.filter((c) => c.source === 'daily' && c.target === HERO && c.note === '成长').map((c) => c.key));
            let skills = state.protagonist.skills;
            let count = 0;
            for (const [skill, gain] of Object.entries(rolls)) {
                const cur = skills[skill];
                if (!gain || grown.has(skill) || !cur) continue;
                const to = Math.min(SKILL_MAX, num(cur.value) + gain);
                if (to <= num(cur.value)) continue;
                api.changes.push({ source: 'trait', target: HERO, key: skill, from: num(cur.value), to, note: '卷王' });
                skills = { ...skills, [skill]: { ...cur, value: to } };
                count += 1;
            }
            skillsPatch = { skills, growth: num(state.protagonist.growth) + count };
        }
        // 吸血鬼：满三天未吸血，每天压力缓升（从未记录时以今天起算）；永夜伴侣免除。
        const bites = mapOf(state, 'biteDays');
        const biteInit = {};
        for (const name of holdersOf(state, api, '吸血鬼')) {
            if (!Object.hasOwn(bites, name)) { biteInit[name] = day; continue; }
            if (day - num(bites[name]) >= PENALTY_DAYS && !hasCombo(api, next, name, '永夜伴侣')) next = api.shiftStress(name, STRESS_DAY, '吸血鬼·未吸血');
        }
        // 人鱼：离水满三天起每天压力缓升；深海之心在主角在场时取消。
        const water = mapOf(state, 'waterDays');
        for (const name of holdersOf(state, api, '人鱼')) {
            const last = num(water[name]);
            if (!last || day - last < PENALTY_DAYS) continue;
            if (api.has(state, name, 'combo:深海之心') && (name === HERO || api.present.has(name))) continue;
            next = api.shiftStress(name, STRESS_DAY, '人鱼·离水');
        }
        if (skillsPatch || rolls) next = { ...next, protagonist: dropRolls({ ...next.protagonist, ...(skillsPatch || {}) }) };
        if (Object.keys(biteInit).length) next = withClock(next, { biteDays: { ...mapOf(next, 'biteDays'), ...biteInit } });
        return next;
    },
];
