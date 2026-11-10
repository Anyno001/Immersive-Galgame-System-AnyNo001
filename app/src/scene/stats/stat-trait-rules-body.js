// 特质规则分文件：体质、生存、养成、成就。由 stat-traits.js 与 stat-trait-hooks.js 汇总，本文件不得 import stat-traits.js（避免循环）。
// SCALE：[特质键, 维度, 方向(up/down/cool/fade/jealous…), 系数, 条件(character, ctx)?]
// FLAG：[标记, 特质键, 条件?]；DAILY：[特质键, 维度, 数值]
// TAG_HOOKS：每楼事件钩子 (state, api) => state；DAILY_HOOKS：日结算钩子 (state, api) => state。api 见 stat-trait-hooks.js。
// 只改数值，不碰战斗与亲密对决规则；战斗、打工只作为事件（ctx.flags / ctx.events）读取。
//
// 约定：
// - 只 import 底层状态工具（stat-state、stat-strain），它们只在函数体内使用，模块顶层不求值，循环加载安全。
// - 体力、金钱、压力的改动都在本文件内基于底层工具实现，返回新 state，变动记进 ctx.changes（source 为 'trait'）。
// - 天气、地点：数值结算的 ctx 目前不带这两项。钩子只读可选字段 ctx.weather、ctx.place（或 ctx.location / ctx.scene，字符串），
//   读不到时依赖环境的特质（耐寒、耐热、恐高症、怕黑、幽闭恐惧症、野外生存、旧伤的阴雨天）静默不生效，不报错；接线批把识别结果放进 ctx 即可生效。
//   日结算钩子的 ctx 只有 { traits, nsfw, present }，野外生存的「漏餐兜底」目前同样静默。
// - 新增存档字段都挂在 state.clock 上：mealDays（各人最近进食日）、lowStaminaDay（主角体力最近低于一半的日期）、
//   sturdyStreak（连续体力未低于一半的天数）、growDay（主角最近一次成长日）、phobiaDays（环境类效果每天只记一次）。

import { SKILL_MAX, barsOf, clamp, isRomance, withBars, withCharacter, withClock, withSkills } from './stat-state.js';
import { shiftStress } from './stat-strain.js';

const HERO = '主角';
const MONEY_TIERS = ['少量', '普通', '昂贵', '巨额'];
// 恐惧类缓升的压力量（与 stat-trait-hooks 的 TRAIT_STRESS_DAILY 同量级）。
const PHOBIA_STRESS = 3;
// 漏餐体力下降：易饿 10，大胃王额外 5；耐饿不扣。
const MISS_MEAL = Object.freeze({ 易饿: 10, 大胃王: 5 });
// 金钱每天的小额变动：败家子乱花、小有积蓄利息。
const DAILY_MONEY = Object.freeze({ 败家子: -5, 小有积蓄: 5 });
// 旧伤的体力额外下降。
const OLD_WOUND_COST = 5;
const LEARN_SKILL = /学习|阅读|读书|学业|研究|知识/;

// ---- 成就 ----
// 与 stat-traits.js 的 ACHIEVEMENT_DEFS 一致（测试里互相核对）：计数名与门槛。
export const ACHIEVEMENT_RULES = Object.freeze([
    { id: '熟练工', counter: 'workWins', need: 10 },
    { id: '一技之长', counter: 'skillMax', need: 80 },
    { id: '万事通', counter: 'skill60', need: 5 },
    { id: '小有积蓄', counter: 'rich', need: 1 },
    { id: '情场老手', counter: 'romances', need: 3 },
    { id: '身经百战', counter: 'battleWins', need: 10 },
    { id: '劫后余生', counter: 'brokenRecovered', need: 1 },
    { id: '铁打的身体', counter: 'sturdyDays', need: 7 },
]);

// 授予成就时的衔接特质（接线批在授予成就后一并调用 applyTraitChange）：劫后余生 → 坚韧（若有脆弱则替换）；铁打的身体 → 强健。
// 本文件已让「劫后余生」压力上升 ×0.5、「铁打的身体」体力消耗 ×0.5，接线批不挂这两项也不缺效果。
export const ACHIEVEMENT_GRANTS = Object.freeze({ 劫后余生: { gain: '坚韧', replace: 'fragile' }, 铁打的身体: { gain: '强健' } });

// 应授予的成就 id 列表：计数达标且尚未拥有。owned 可为数组、Set 或 { id: 任意 } 对象。纯函数，不读也不写 catalog。
export function checkAchievements(counters, owned) {
    const have = owned instanceof Set ? owned : new Set(Array.isArray(owned) ? owned : Object.keys(owned || {}));
    const c = counters && typeof counters === 'object' ? counters : {};
    return ACHIEVEMENT_RULES.filter((r) => !have.has(r.id) && (Number(c[r.counter]) || 0) >= r.need).map((r) => r.id);
}

// 每楼结算后推进成就计数（纯函数，返回新对象），由接线批在写 catalog.counters 前调用。ctx 取 flags.work / flags.battle / romanceSeen。
// 未覆盖：rich（「富裕档」没有定义）、brokenRecovered（需要压力转换前后对比）——由接线批在 stat-settle 里补。
export function updateAchievementCounters(counters, state, ctx = {}) {
    const next = { ...(counters && typeof counters === 'object' ? counters : {}) };
    const num = (k) => Number(next[k]) || 0;
    const flags = ctx.flags || {};
    if (flags.work && String(flags.work.tier || '').includes('成功')) next.workWins = num('workWins') + 1;
    if (flags.battle && flags.battle.outcome && flags.battle.outcome !== '败' && flags.battle.outcome !== '撤') next.battleWins = num('battleWins') + 1;
    const values = Object.values((state && state.protagonist && state.protagonist.skills) || {}).map((s) => Number(s && s.value) || 0);
    next.skillMax = Math.max(num('skillMax'), ...values, 0);
    next.skill60 = Math.max(num('skill60'), values.filter((v) => v >= 60).length);
    const chars = (state && state.characters) || {};
    next.romances = Math.max(num('romances'), Object.keys(chars).filter((n) => isRomance(chars[n], n, ctx.romanceSeen)).length);
    next.sturdyDays = Math.max(num('sturdyDays'), Number(state && state.clock && state.clock.sturdyStreak) || 0);
    return next;
}

// ---- 底层工具：体力 / 金钱 / 压力 ----
const barsOfName = (state, name) => (name === HERO ? state.protagonist.bars : state.characters[name] ? barsOf(state.characters[name]) : null);
const putBars = (state, name, bars) => (name === HERO ? withBars(state, bars) : withCharacter(state, name, { ...state.characters[name], bars }));

// 改一条生活条数值并记变动；已越界的值不会被硬拉回区间。
function moveBar(state, name, key, delta, note, changes, { min = 0, max = 100 } = {}) {
    const bars = barsOfName(state, name);
    if (!bars || !delta) return state;
    const from = Number(bars[key]) || 0;
    const to = clamp(from + delta, Math.min(min, from), Math.max(max, from));
    if (to === from) return state;
    changes.push({ source: 'trait', target: name, key, from, to, note });
    return putBars(state, name, { ...bars, [key]: to });
}
const moveMoney = (state, name, delta, note, changes) => moveBar(state, name, 'money', delta, note, changes, { min: 0, max: Infinity });

// 压力走 shiftStress，压力转换（沦陷、扭曲等）的规则照旧。
function moveStress(state, name, delta, note, changes) {
    const bars = barsOfName(state, name);
    if (!bars || !delta) return state;
    const moved = shiftStress(bars, delta);
    const from = Number(bars.stress) || 0;
    const to = Number(moved.stress) || 0;
    if (to === from) return state;
    changes.push({ source: 'trait', target: name, key: 'stress', from, to, note });
    return putBars(state, name, moved);
}

// ---- 环境读取（读不到一律视为不匹配）----
const textOf = (ctx, ...keys) => keys.map((k) => (ctx && typeof ctx[k] === 'string' ? ctx[k] : '')).join(' ');
const weatherOf = (ctx) => textOf(ctx, 'weather');
const placeOf = (ctx) => textOf(ctx, 'place', 'location', 'scene');
const timeOf = (ctx) => textOf(ctx, 'time');
const COLD = /寒|冷|雪|冰|霜/;
const HOT = /炎|酷暑|烈日|高温|沙漠|火山|蒸笼|闷热/;
const HEIGHT = /高处|楼顶|屋顶|天台|悬崖|峭壁|塔顶|山顶|高空|高楼/;
const DARK = /夜|黑暗|漆黑|地下|山洞|洞穴/;
const BRIGHT = /白天|白日|白昼|清晨|早晨|上午|中午|正午|午后|下午|晴|阳光|烈日|日光|骄阳/;
const TIGHT = /狭窄|密闭|电梯|衣柜|地窖|地牢|储藏室|管道/;
const WILD = /野外|荒野|森林|山林|露营|丛林|荒岛|野营/;
const RAINY = /雨|阴|潮/;

const isSpend = (c) => c.source === 'tag' || c.source === 'battle';
const lateNote = (note) => note === '熬夜' || note === '23点后熬夜';

// 一天只记一次的标记：返回新 state，当天已记过返回 null。
function onceToday(state, key) {
    const day = state.clock.day;
    const map = state.clock.phobiaDays && typeof state.clock.phobiaDays === 'object' ? state.clock.phobiaDays : {};
    if (map[key] === day) return null;
    return withClock(state, { phobiaDays: { ...map, [key]: day } });
}

// 劫后余生：效果等同「坚韧」（压力上升 ×0.5）。「有脆弱则替换」交给授予时的 applyTraitChange。
export const SCALE = [
    ['劫后余生', '压力', 'up', 0.5],
];

export const FLAG = [];
export const DAILY = [];

// ---- 每楼钩子 ----

// 体力消耗与回复：病秧子、强健（含铁打的身体）、天生媚骨、不眠、耐寒、耐热、耐痛（重伤）、大胃王（进食加倍）、早起鸟、夜猫子。
function staminaHook(state, api) {
    const { ctx, directives } = api;
    const seen = ctx.changes.slice();
    const env = `${weatherOf(ctx)} ${placeOf(ctx)}`;
    const severe = directives.some((d) => d.kind === 'hurt' && d.value === '重伤') || Boolean(ctx.flags && ctx.flags.battleHurt === '重伤');
    let next = state;
    for (const c of seen) {
        if (c.key !== 'stamina' || !isSpend(c) || !barsOfName(next, c.target)) continue;
        const name = c.target;
        const has = (id) => api.has(next, name, id);
        const note = String(c.note || '');
        const delta = c.to - c.from;
        if (delta > 0) {
            if (note === '进食' && has('大胃王')) next = moveBar(next, name, 'stamina', delta, '大胃王', ctx.changes);
            continue;
        }
        const drop = -delta;
        // 天生媚骨：亲密时回复体力而非消耗（撤销消耗后再回复同等数量）。
        if (note === '亲密' && has('魅魔体质')) { next = moveBar(next, name, 'stamina', drop * 2, '天生媚骨', ctx.changes); continue; }
        // 不眠：熬夜没有体力代价。
        if (lateNote(note) && has('不眠')) { next = moveBar(next, name, 'stamina', drop, '不眠', ctx.changes); continue; }
        let factor = 1;
        const names = [];
        const mul = (f, label) => { factor *= f; names.push(label); };
        if (has('病秧子')) mul(1.5, '病秧子');
        if (has('强健')) mul(0.5, '强健');
        else if (has('铁打的身体')) mul(0.5, '铁打的身体');
        else if (has('龙族')) mul(0.5, '龙族');
        if (name === HERO && has('耐寒') && COLD.test(env)) mul(0.5, '耐寒');
        if (name === HERO && has('耐热') && HOT.test(env)) mul(0.5, '耐热');
        if (name === HERO && severe && has('耐痛')) mul(0.5, '耐痛');
        if (lateNote(note) && has('早起鸟')) mul(2, '早起鸟');
        if (lateNote(note) && has('夜猫子')) mul(0.5, '夜猫子');
        const extra = Math.round(drop * (factor - 1));
        if (extra) next = moveBar(next, name, 'stamina', -extra, names.join('·'), ctx.changes);
    }
    // 不眠：不需要入睡。清掉熬夜标记（日结算不再只回到七成），并剔除兜底识别出的「入睡」（兜底本来就不补入睡）。
    // 不原地改 directives：只在 ctx 上记一个标记，结算流程据此取剔除兜底入睡后的副本再过天。
    if (api.has(next, HERO, '不眠')) {
        if (next.clock.stayedUp) next = withClock(next, { stayedUp: false });
        ctx.dropFallbackSleep = true;
    }
    return next;
}

// 金钱：持家能手、败家子（花钱）；打工收入：财迷、穷光蛋、熟练工（与财迷取高，不叠加）。
function moneyHook(state, api) {
    const { ctx } = api;
    const seen = ctx.changes.slice();
    let next = state;
    for (const c of seen) {
        if (c.key !== 'money' || c.source !== 'tag' || !(c.to < c.from) || !barsOfName(next, c.target)) continue;
        const spent = c.from - c.to;
        if (api.has(next, c.target, '持家能手')) next = moveMoney(next, c.target, Math.round(spent * 0.25), '持家能手', ctx.changes);
        if (api.has(next, c.target, '败家子')) next = moveMoney(next, c.target, -Math.round(spent * 0.5), '败家子', ctx.changes);
    }
    // 打工收入按档位差额补减：高一档 / 低一档；已是最高 / 最低档不再动。
    const work = ctx.flags && ctx.flags.work;
    const table = ctx.moneyTable;
    const at = work ? MONEY_TIERS.indexOf(work.income) : -1;
    if (at >= 0 && table) {
        const rich = api.has(next, HERO, '财迷') ? '财迷' : api.has(next, HERO, '熟练工') ? '熟练工' : '';
        const poor = api.has(next, HERO, '穷光蛋') ? '穷光蛋' : '';
        const amountOf = (i) => Number(table[MONEY_TIERS[i]]) || 0;
        let delta = 0;
        if (rich && at < MONEY_TIERS.length - 1) delta += amountOf(at + 1) - amountOf(at);
        if (poor && at > 0) delta -= amountOf(at) - amountOf(at - 1);
        if (delta) next = moveMoney(next, HERO, delta, `打工·${[rich, poor].filter(Boolean).join('·')}`, ctx.changes);
    }
    return next;
}

// 压力与体力：耐痛 / 怕疼鬼（受伤时）、恐高症 / 怕黑 / 幽闭恐惧症（读地点，每天一次）、旧伤（阴雨天或剧烈运动体力额外下降）。
function painEnvHook(state, api) {
    const { ctx, directives } = api;
    const seen = ctx.changes.slice();
    const hurt = api.heroHurt(directives) || Boolean(ctx.flags && ctx.flags.battleHurt);
    let next = state;
    // 耐痛：受伤那一楼主角压力的上升撤销（该楼只要是标签带来的压力上升都算，与受伤同楼发生）。
    if (hurt && api.has(next, HERO, '耐痛')) {
        for (const c of seen) if (c.target === HERO && c.key === 'stress' && c.source === 'tag' && c.to > c.from) next = moveStress(next, HERO, c.from - c.to, '耐痛', ctx.changes);
    }
    if (hurt && api.has(next, HERO, '怕疼鬼')) next = api.bumpHeroStress(next, api.SMALL.压力, '怕疼鬼');
    const place = placeOf(ctx);
    for (const [id, re] of [['恐高症', HEIGHT], ['怕黑', DARK], ['幽闭恐惧症', TIGHT]]) {
        if (!re.test(place) || !api.has(next, HERO, id)) continue;
        const marked = onceToday(next, id);
        if (marked) next = moveStress(marked, HERO, PHOBIA_STRESS, id, ctx.changes);
    }
    // 怕光：白天、明亮地点压力缓升（主角与在场角色，每人每天一次）。
    if (BRIGHT.test(`${timeOf(ctx)} ${weatherOf(ctx)} ${place}`)) {
        for (const name of [HERO, ...Object.keys(next.characters).filter((n) => api.here.has(n))]) {
            if (!api.has(next, name, '怕光')) continue;
            const marked = onceToday(next, `怕光:${name}`);
            if (marked) next = moveStress(marked, name, PHOBIA_STRESS, '怕光', ctx.changes);
        }
    }
    if (api.has(next, HERO, '旧伤')) {
        if (RAINY.test(`${weatherOf(ctx)}`)) {
            const marked = onceToday(next, '旧伤');
            if (marked) next = moveBar(marked, HERO, 'stamina', -OLD_WOUND_COST, '旧伤·阴雨', ctx.changes);
        }
        const hard = directives.some((d) => d.kind === 'stamina' && !d.target && d.value === '重') || Boolean(ctx.flags && ctx.flags.battle);
        if (hard) next = moveBar(next, HERO, 'stamina', -OLD_WOUND_COST, '旧伤·剧烈运动', ctx.changes);
    }
    return next;
}

// 人际：团宠 / 万人嫌（主角挂，所有角色对其好感上升 ×1.2 / ×0.8）、社恐（对方好感在无感及以下时，好感、信任上升减半）。
// 读本楼已记的标签变动补差额；api.bump 保证好感不越过未解锁关口。
function relationHook(state, api) {
    const { ctx } = api;
    const seen = ctx.changes.slice();
    const ups = seen.filter((c) => c.source === 'tag' && c.target !== HERO && (c.key === '好感' || c.key === '信任') && c.to > c.from && state.characters[c.target]);
    if (!ups.length) return state;
    let next = state;
    const loved = api.has(next, HERO, '团宠');
    const unloved = api.has(next, HERO, '万人嫌');
    const shy = api.has(next, HERO, '社恐');
    const favorBefore = (name) => {
        const f = seen.find((c) => c.target === name && c.key === '好感' && c.source === 'tag');
        return f ? f.from : Number(state.characters[name].dims.好感) || 0;
    };
    for (const c of ups) {
        const rise = c.to - c.from;
        if (c.key === '好感' && (loved || unloved)) {
            const amount = Math.round(rise * 0.2);
            if (amount) next = api.bump(next, c.target, '好感', loved ? amount : -amount, loved ? '团宠' : '万人嫌');
        }
        if (shy && favorBefore(c.target) <= 0) {
            const refund = rise - Math.max(1, Math.round(rise / 2));
            if (refund > 0) next = api.bump(next, c.target, c.key, -refund, '社恐');
        }
    }
    return next;
}

// 天生媚骨（内部 id 魅魔体质）招人觊觎：主角挂时，在场角色对其欲望上升略快（本楼标签已涨的量再补一半）。
function alluringHook(state, api) {
    if (!api.has(state, HERO, '魅魔体质')) return state;
    let next = state;
    for (const c of api.ctx.changes.slice()) {
        if (c.source !== 'tag' || c.key !== '欲望' || c.target === HERO || !(c.to > c.from) || !api.here.has(c.target) || !next.characters[c.target]) continue;
        next = api.bump(next, c.target, '欲望', Math.max(1, Math.round((c.to - c.from) * 0.5)), '天生媚骨');
    }
    return next;
}

// 赌徒（自动押）：本楼有主角检定（含打工）且有金钱收支时，成功的收入翻倍、失败的金钱扣减翻倍；检定日记在 clock.checkDay，供日结算判断「没赌的日子」。
function gamblerHook(state, api) {
    const { ctx } = api;
    const work = ctx.flags && ctx.flags.work;
    const won = ctx.checkSuccess !== undefined ? ctx.checkSuccess : work ? String(work.tier || '').includes('成功') : undefined;
    if (won === undefined || !api.has(state, HERO, '赌徒')) return state;
    let next = state.clock.checkDay === state.clock.day ? state : withClock(state, { checkDay: state.clock.day });
    for (const c of ctx.changes.slice()) {
        if (c.target !== HERO || c.key !== 'money' || (c.source !== 'tag' && c.source !== 'battle')) continue;
        if (won && c.to > c.from) next = moveMoney(next, HERO, c.to - c.from, '赌徒·收入翻倍', ctx.changes);
        if (!won && c.to < c.from) next = moveMoney(next, HERO, c.to - c.from, '赌徒·损失翻倍', ctx.changes);
    }
    return next;
}

// 万事通：主角对角色的「了解」上升 ×1.5（SCALE 只能挂在被改动的角色上，这里读本楼已记的了解变动补差额）。
function allRounderHook(state, api) {
    if (!api.has(state, HERO, '万事通')) return state;
    let next = state;
    for (const c of api.ctx.changes.slice()) {
        if (c.source !== 'tag' || c.key !== '了解' || c.target === HERO || !(c.to > c.from) || !next.characters[c.target]) continue;
        const extra = Math.round((c.to - c.from) * 0.5);
        if (extra) next = api.bump(next, c.target, '了解', extra, '万事通');
    }
    return next;
}

// 记账：进食日（漏餐判定）、主角体力低于一半的日期（铁打的身体）。排在体力钩子之后。
function trackHook(state, api) {
    const { directives } = api;
    const day = state.clock.day;
    let next = state;
    const ate = new Set(directives.filter((d) => d.kind === 'stamina' && d.value === '进食').map((d) => d.target || HERO));
    if (ate.size) {
        const meals = { ...(next.clock.mealDays && typeof next.clock.mealDays === 'object' ? next.clock.mealDays : {}) };
        for (const n of ate) meals[n] = day;
        next = withClock(next, { mealDays: meals });
    }
    if ((Number(next.protagonist.bars.stamina) || 0) < 50 && next.clock.lowStaminaDay !== day) next = withClock(next, { lowStaminaDay: day });
    return next;
}

export const TAG_HOOKS = [staminaHook, moneyHook, painEnvHook, relationHook, allRounderHook, alluringHook, gamblerHook, trackHook];

// ---- 日结算钩子（rev ≥ 2；时间跳跃不走这里）----

// 睡眠回复：浅眠回复减半、瞌睡虫加倍、早起鸟略多；读本次日结算已记的体力恢复变动，补差额。
function sleepHook(state, api) {
    let next = state;
    for (const name of [HERO, ...Object.keys(state.characters)]) {
        const rec = [...api.changes].reverse().find((c) => c.source === 'daily' && c.target === name && c.key === 'stamina' && c.note === '日结算' && c.to > c.from);
        if (!rec) continue;
        let factor = 1;
        const names = [];
        if (api.has(next, name, '浅眠')) { factor *= 0.5; names.push('浅眠'); }
        if (api.has(next, name, '瞌睡虫')) { factor *= 2; names.push('瞌睡虫'); }
        const add = api.has(next, name, '早起鸟') ? 5 : 0;
        if (add) names.push('早起鸟');
        if (!names.length) continue;
        const target = clamp(rec.from + Math.round((rec.to - rec.from) * factor) + add, 0, 100);
        const cur = Number(barsOfName(next, name).stamina) || 0;
        next = moveBar(next, name, 'stamina', target - cur, names.join('·'), api.changes);
    }
    return next;
}

// 漏餐：只对「以前进过食」的人判定（从没写过进食标签的聊天不触发），昨天没进食即漏餐。
// 耐饿不扣；野外生存在野外不扣（读不到地点则不生效）；易饿、大胃王各自额外下降。
function missedMealHook(state, api) {
    const meals = state.clock.mealDays;
    if (!meals || typeof meals !== 'object') return state;
    const wild = WILD.test(placeOf(api.ctx));
    let next = state;
    for (const name of [HERO, ...Object.keys(state.characters)]) {
        const last = meals[name];
        if (!Number.isFinite(last) || last >= api.day - 1 || api.has(next, name, '耐饿')) continue;
        if (wild && api.has(next, name, '野外生存')) continue;
        const cost = (api.has(next, name, '易饿') ? MISS_MEAL.易饿 : 0) + (api.has(next, name, '大胃王') ? MISS_MEAL.大胃王 : 0);
        if (cost) next = moveBar(next, name, 'stamina', -cost, '漏餐', api.changes);
    }
    return next;
}

// 金钱每天变动：败家子乱花、小有积蓄利息。
function dailyMoneyHook(state, api) {
    let next = state;
    for (const name of [HERO, ...Object.keys(state.characters)]) {
        for (const id of Object.keys(DAILY_MONEY)) {
            if (api.has(next, name, id)) next = moveMoney(next, name, DAILY_MONEY[id], id === '败家子' ? '败家子·乱花' : '小有积蓄·利息', api.changes);
        }
    }
    return next;
}

// 主角技能成长：学霸（学习、阅读类涨幅加一）、懒虫（距上次成长不满两天则本次作废）。读本次日结算已记的「成长」变动。
function growthHook(state, api) {
    const grown = api.changes.filter((c) => c.source === 'daily' && c.target === HERO && c.note === '成长' && c.to > c.from && state.protagonist.skills[c.key]);
    if (!grown.length) return state;
    const last = Number(state.clock.growDay);
    if (api.has(state, HERO, '懒虫') && Number.isFinite(last) && api.day - last < 2) {
        let skills = state.protagonist.skills;
        for (const c of grown) {
            skills = { ...skills, [c.key]: { ...skills[c.key], value: c.from } };
            api.changes.push({ source: 'trait', target: HERO, key: c.key, from: c.to, to: c.from, note: '懒虫' });
        }
        return withSkills(state, skills);
    }
    let next = state;
    if (api.has(next, HERO, '学霸')) {
        let skills = next.protagonist.skills;
        for (const c of grown) {
            if (!LEARN_SKILL.test(c.key)) continue;
            const to = Math.min(SKILL_MAX, skills[c.key].value + 1);
            if (to === skills[c.key].value) continue;
            api.changes.push({ source: 'trait', target: HERO, key: c.key, from: skills[c.key].value, to, note: '学霸' });
            skills = { ...skills, [c.key]: { ...skills[c.key], value: to } };
        }
        next = withSkills(next, skills);
    }
    return withClock(next, { growDay: api.day });
}

// 连续体力未低于一半的天数（成就「铁打的身体」的累计来源，存 clock.sturdyStreak，由 updateAchievementCounters 读走）。
function streakHook(state, api) {
    const low = state.clock.lowStaminaDay === api.day - 1;
    const streak = low ? 0 : (Number(state.clock.sturdyStreak) || 0) + 1;
    return streak === state.clock.sturdyStreak ? state : withClock(state, { sturdyStreak: streak });
}

// 赌徒：刚过去的那天没有任何检定，压力小升。
function gamblerIdleHook(state, api) {
    if (!api.has(state, HERO, '赌徒') || state.clock.checkDay === api.day - 1) return state;
    return moveStress(state, HERO, PHOBIA_STRESS, '赌徒·没赌', api.changes);
}

export const DAILY_HOOKS = [sleepHook, missedMealHook, dailyMoneyHook, growthHook, streakHook, gamblerIdleHook];

// DICE：[特质键, 检定类别, 奖惩骰数(+1 奖励 / -1 惩罚), 条件(character, ctx)?]
// 一技之长：「该技能」的检定。类别无法区分具体技能，条件读调用方传入的 ctx.skillValue（该次检定所用技能的当前值），没传则不生效。
// 情场老手：约会类检定，类别名用「约会」，约会类检定调用 traitDice 时传这个类别。
export const DICE = [
    ['话痨', '社交', 1],
    ['不善言辞', '社交', -1],
    ['情场老手', '约会', 1],
    ['狐妖', '魅力', 1],
    ['一技之长', '全部', 1, (character, ctx) => Boolean(ctx) && Number(ctx.skillValue) >= 80],
];
