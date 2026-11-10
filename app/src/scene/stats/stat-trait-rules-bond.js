// 特质规则分文件：恩情、仇怨、罪犯（含双向关系状态）。由 stat-traits.js 与 stat-trait-hooks.js 汇总，本文件不得 import stat-traits.js（避免循环）。
// SCALE：[特质键, 维度, 方向(up/down/cool/fade/jealous…), 系数, 条件(character, ctx)?]
// FLAG：[标记, 特质键, 条件?]；DAILY：[特质键, 维度, 数值]
// TAG_HOOKS：每楼事件钩子 (state, api) => state；DAILY_HOOKS：日结算钩子 (state, api) => state。api 见 stat-trait-hooks.js。
//
// 【关系状态的存法】两人之间的状态记在非主角一侧的档案上：state.characters[名].relStates = [{ id, dir, since, ... }]。
//   id：状态名（救命之恩、恩怨两难、欠你人情、结怨、血仇、爱恨交织、共犯）；宿仇沿用 stat-strain.js 的 character.feud，不重复记。
//   dir：'ta' = TA 对你（TA 欠你 / TA 恨你），'me' = 你对 TA（你欠 TA / 你恨 TA），'both' = 共犯这类不分方向。
//   since：挂上那天；hold：结怨的芥蒂保底值；n：血仇已经历的恩情事件次数。
//   写入一律返回新 state，不原地改。
// 【事件入口】正文标签读不到「救命」「背叛」「偷窃」这类语义，由副模型或演出层填 ctx.bondEvents：
//   [{ type, target?, who?, dir?, by? }]，type 取值见 EVENT_TYPES；标签里读得到的（芥蒂上升、共患难 / 交心事件、被迫类压力来源、战斗标签、打工）本文件自行推导。
import { shiftStress } from './stat-strain.js';
import { DIM_MAX, barsOf, clamp, dimMin, isRomance, withBars, withCharacter } from './stat-state.js';
import { START_FIX_VALUE, START_MODIFIERS } from './stat-vocab.js';
import { calcRow, withCalc } from './stat-status-defs.js';
import { INTIMATE_STOP } from '../intimate-duel.js';

export const EVENT_TYPES = Object.freeze([
    '救命', '帮忙', '报恩', '遇险', '结怨', '血仇', '和解', '道歉', '复仇', '决裂', '共犯', '挟持', '获救',
    '身份揭开', '偷窃成功', '偷窃被发现', '谎言揭穿', '被追查', '被抓', '杀伤', '猜忌',
]);

// 「一档」换算（沿用普通档强度表）：信任下降小 3 / 大 15；芥蒂上升小 2 / 大 10、下降大 10；压力小 5 / 大 20；好感信任一大档 6。
const TRUST_DROP = 3;
export const TRUST_DROP_BIG = 15;
const GRUDGE_UP_SMALL = 2;
export const GRUDGE_UP_BIG = 10;
const GRUDGE_DOWN_BIG = 10;
const STRESS_BIG = 20;
const STRESS_SMALL = 5;
const FAVOR_DOWN_CAP = 3;
const DAILY_STRESS = 3;
const FADE_DAYS = 7;
const LIKE = 26;
const CAPTIVE_DAYS = 3;
// 结怨可随时间淡去的性格；芥蒂淡到「小心结」下限即解开（与 stat-favor-events.js 的 GRUDGE_FADE_FLOOR 同值）。
const FORGIVING = Object.freeze(['宽容', '以德报怨', '老好人', '一笑泯恩仇']);
const GRUDGE_FADE_FLOOR = 25;
// 惯偷偷到手的金额：少量档。打工收入档位表（少量 20、普通 100、昂贵 500、巨额 3000）。
const MONEY_TABLE = Object.freeze({ 少量: 20, 普通: 100, 昂贵: 500, 巨额: 3000 });
const MONEY_ORDER = Object.freeze(['少量', '普通', '昂贵', '巨额']);

const dimOf = (c, dim) => Number(c && c.dims && c.dims[dim]) || 0;
// 结怨挂上多少天内算「近期」（与误会账同为七天）；相安升同心的好感门槛（深爱档下限，同 stat-favor 的 FAVOR_STAGES）。
const RECENT_HATE_DAYS = 7;
const DEEP_LOVE = 76;

export const SCALE = [
    ['骗子', '了解', 'up', 0.5],
    ['混混', '信任', 'up', 0.75],
    ['前科犯', '信任', 'up', 0.5, (c) => dimOf(c, '信任') <= 50],
    ['前科犯', '信任', 'up', 1.5, (c) => dimOf(c, '信任') > 50],
    ['以德报怨', '芥蒂', 'up', 0.5],
];
export const FLAG = [];
export const DAILY = [
    ['黑帮', '压力', DAILY_STRESS],
    ['大佬', '压力', DAILY_STRESS],
];

// ---- 关系状态读写（纯函数，返回新 state） ----

export const relStatesOf = (state, name) => {
    const own = state && state.characters && state.characters[name] && state.characters[name].relStates;
    return Array.isArray(own) ? own : [];
};
export const findRel = (state, name, id, dir = null) => relStatesOf(state, name).find((r) => r.id === id && (dir === null || r.dir === dir)) || null;
export const hasRel = (state, name, id, dir = null) => Boolean(findRel(state, name, id, dir));

function setRels(state, name, list) {
    const cur = state.characters[name];
    return cur ? withCharacter(state, name, { ...cur, relStates: list }) : state;
}
export function addRel(state, name, id, dir, extra = {}) {
    if (!state.characters[name]) return state;
    const list = relStatesOf(state, name).filter((r) => !(r.id === id && r.dir === dir));
    return setRels(state, name, [...list, { id, dir, since: state.clock.day, ...extra }]);
}
export function dropRel(state, name, id, dir = null) {
    const list = relStatesOf(state, name);
    const kept = list.filter((r) => !(r.id === id && (dir === null || r.dir === dir)));
    return kept.length === list.length ? state : setRels(state, name, kept);
}
function patchRel(state, name, id, dir, patch) {
    return setRels(state, name, relStatesOf(state, name).map((r) => (r.id === id && r.dir === dir ? { ...r, ...patch } : r)));
}
function setFeud(state, name, on) {
    const cur = state.characters[name];
    if (!cur || Boolean(cur.feud) === on) return state;
    if (on) return withCharacter(state, name, { ...cur, feud: true });
    const { feud, ...rest } = cur;
    return withCharacter(state, name, rest);
}

// 关系状态带来的检定奖励骰：欠你人情（受恩方被求助，多一骰，用掉后由调用方 consumeFavorDice 清除）；
// 结怨「你恨 TA」（主角对 TA 的对抗检定多一骰）。返回 0 或 1。
export function bondDice(state, actor, opponent = null) {
    if (actor === '主角') return opponent && hasRel(state, opponent, '结怨', 'me') ? 1 : 0;
    return hasRel(state, actor, '欠你人情', 'ta') ? 1 : 0;
}
export const consumeFavorDice = (state, actor) => dropRel(state, actor, '欠你人情', 'ta');

// 主角对抗时的「结怨对象」：对方与主角之间有结怨 / 血仇（任一方向）或宿仇。
export const hatesOpponent = (state, name) => Boolean(state && state.characters && state.characters[name] && (state.characters[name].feud || hasRel(state, name, '结怨') || hasRel(state, name, '血仇')));

// ---- 猜忌 / 心结（关系状态，TA 对主角） ----
// 记账字段：src（setting 开局 / story 剧情）、trust、grudge（开局扣的信任、加的芥蒂数额，正数）。
// 角色档案的 startMods 记已挂过的开局修饰，解除后不会重复补挂。
const OPENING_RELS = ['猜忌', '心结'];
const PAIR_RELS = ['相安', '同心'];

// 开局修饰对应的扣加数额，按 START_FIX 档位换算。
export function openingRelAmounts(mod) {
    const tier = OPENING_RELS.includes(mod) ? START_MODIFIERS[mod] : null;
    if (!tier) return null;
    return { trust: tier.信任 ? -START_FIX_VALUE.信任[tier.信任] : 0, grudge: tier.芥蒂 ? START_FIX_VALUE.芥蒂[tier.芥蒂] : 0 };
}

// 给角色挂开局猜忌 / 心结。offsets 为实际生效的开局修正（负信任、正芥蒂），传入时数额不超过它。
export function attachOpeningRels(state, name, mods, { offsets = null, src = 'setting' } = {}) {
    const cur = state.characters[name];
    if (!cur) return state;
    const done = Array.isArray(cur.startMods) ? cur.startMods : [];
    let next = state;
    const added = [];
    for (const mod of mods || []) {
        const amt = OPENING_RELS.includes(mod) && !done.includes(mod) && !added.includes(mod) ? openingRelAmounts(mod) : null;
        if (!amt) continue;
        const trust = offsets ? Math.min(amt.trust, Math.max(0, -(Number(offsets.信任) || 0))) : amt.trust;
        const grudge = offsets ? Math.min(amt.grudge, Math.max(0, Number(offsets.芥蒂) || 0)) : amt.grudge;
        next = addRel(next, name, mod, 'ta', { src, trust, grudge });
        added.push(mod);
    }
    return added.length ? withCharacter(next, name, { ...next.characters[name], startMods: [...done, ...added] }) : next;
}

// 旧档修复：info = { notes: { 角色: 起始关系变动 note }, jealous: [曾吃醋的角色] }（由运行时扫账本给出）。
// 起始关系·恋人 且 romance 仍为 undefined 补 true；note 里带猜忌 / 心结且还没处理过则补挂关系状态；吃醋记录补 jealousSeen。
export function repairLegacyStart(state, info) {
    if (!info) return state;
    let next = state;
    for (const [name, note] of Object.entries(info.notes || {})) {
        const cur = next.characters[name];
        if (!cur) continue;
        const parts = String(note).replace(/^起始关系·/, '').split('+');
        if (parts[0] === '恋人' && cur.romance === undefined) next = withCharacter(next, name, { ...cur, romance: true });
        next = attachOpeningRels(next, name, parts.slice(1), { src: 'setting' });
    }
    for (const name of info.jealous || []) {
        const cur = next.characters[name];
        if (cur && !cur.jealousSeen) next = withCharacter(next, name, { ...cur, jealousSeen: true });
    }
    return next;
}

// 误会解除时的关系状态清理：猜忌 / 心结摘掉，按一半退回开局扣的信任与加的芥蒂；近 7 天挂上的结怨（TA 恨你）一并摘掉。
const halfBack = (n) => (n > 0 ? Math.max(1, Math.round(n / 2)) : 0);
export function hasClearableBond(state, name) {
    if (OPENING_RELS.some((id) => hasRel(state, name, id, 'ta'))) return true;
    const hate = findRel(state, name, '结怨', 'ta');
    return Boolean(hate && Number.isFinite(Number(hate.since)) && state.clock.day - Number(hate.since) <= RECENT_HATE_DAYS);
}
export function clearBond(state, name, changes) {
    let next = state;
    for (const id of OPENING_RELS) {
        const r = findRel(next, name, id, 'ta');
        if (!r) continue;
        const dims = { ...next.characters[name].dims };
        for (const [dim, back, sign] of [['信任', halfBack(Number(r.trust) || 0), 1], ['芥蒂', halfBack(Number(r.grudge) || 0), -1]]) {
            if (!back) continue;
            const from = Number(dims[dim]) || 0;
            const to = clamp(from + sign * back, dimMin(dim), DIM_MAX);
            if (to === from) continue;
            dims[dim] = to;
            changes.push({ source: 'tag', target: name, key: dim, from, to, note: '误会解除·' + id });
        }
        next = dropRel(withCharacter(next, name, { ...next.characters[name], dims }), name, id, 'ta');
    }
    const hate = findRel(next, name, '结怨', 'ta');
    if (hate && Number.isFinite(Number(hate.since)) && next.clock.day - Number(hate.since) <= RECENT_HATE_DAYS) next = dropRel(next, name, '结怨', 'ta');
    return next;
}

// 背叛：猜忌坐实转结怨。摘掉猜忌；TA 无以德报怨、尚未结怨（或宿仇）则挂结怨。
export function betrayHate(state, api, name) {
    if (!state.characters[name]) return state;
    const next = dropRel(state, name, '猜忌', 'ta');
    if (api.has(next, name, '以德报怨') || hates(next, name)) return next;
    return addRel(next, name, '结怨', 'ta', { hold: dimOf(next.characters[name], '芥蒂') });
}

// ---- 相安 / 同心（两位恋爱对象之间，记在双方档案上，dir 为 both，toward 为对方） ----
const hasPair = (state, a, id, b) => relStatesOf(state, a).some((r) => r.id === id && r.toward === b);
const pairPartners = (state, name) => relStatesOf(state, name).filter((r) => PAIR_RELS.includes(r.id) && r.toward).map((r) => r.toward);
export const pairPartnersOf = pairPartners;
function setPair(state, a, b, id) {
    if (!state.characters[a]) return state;
    const kept = relStatesOf(state, a).filter((r) => !(PAIR_RELS.includes(r.id) && r.toward === b));
    return setRels(state, a, [...kept, { id, dir: 'both', since: state.clock.day, toward: b }]);
}

// TA 恨你：结怨（TA 方向）或宿仇。
const hates = (state, name) => hasRel(state, name, '结怨', 'ta') || Boolean(state.characters[name] && state.characters[name].feud);
const hatesCharacter = (c) => Boolean(c && (c.feud || (Array.isArray(c.relStates) && c.relStates.some((r) => r.id === '结怨' && r.dir === 'ta'))));

export const DICE = [
    ['杀手', '战斗', 1],
    ['混混', '街头冲突', 1],
    ['黑客', '技术', 1],
    // 睚眦必报：对抗结怨对象。NPC 读自己档案上的结怨 / 宿仇；主角由调用方在 ctx.hates 说明对手是否结怨对象。
    ['睚眦必报', '对抗', 1, (c, ctx) => hatesCharacter(c) || Boolean(ctx && ctx.hates === true)],
    ['逆鳞', '对抗', 1, (c, ctx) => hatesCharacter(c) || Boolean(ctx && ctx.hates === true)],
];

// ---- 钩子内部工具 ----

// 本楼标签结算（source 为 tag）里某角色某维度已发生的涨幅或跌幅合计。
function sumTag(ctx, name, key, sign, pass = null) {
    let sum = 0;
    for (const c of ctx.changes || []) {
        if (c.source !== 'tag' || c.target !== name || c.key !== key || (pass && !pass(c))) continue;
        const d = Number(c.to) - Number(c.from);
        if (sign > 0 ? d > 0 : d < 0) sum += d;
    }
    return sum;
}

function bumpStress(state, name, delta, note, changes) {
    if (!delta) return state;
    const hero = name === '主角';
    const cur = hero ? null : state.characters[name];
    if (!hero && !cur) return state;
    const bars = hero ? state.protagonist.bars : barsOf(cur);
    const moved = shiftStress(bars, delta);
    const from = Number(bars.stress) || 0;
    const to = Number(moved.stress) || 0;
    if (to === from) return state;
    changes.push({ source: 'trait', target: name, key: 'stress', from, to, note });
    return hero ? withBars(state, moved) : withCharacter(state, name, { ...cur, bars: moved });
}

function bumpMoney(state, name, amount, note, changes) {
    const hero = name === '主角';
    const cur = hero ? null : state.characters[name];
    if (!amount || (!hero && !cur)) return state;
    const bars = hero ? state.protagonist.bars : barsOf(cur);
    const from = Number(bars.money) || 0;
    const moved = { ...bars, money: from + amount };
    changes.push({ source: 'trait', target: name, key: 'money', from, to: moved.money, note });
    return hero ? withBars(state, moved) : withCharacter(state, name, { ...cur, bars: moved });
}

const toList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const eventsOf = (ctx) => (Array.isArray(ctx.bondEvents) ? ctx.bondEvents.filter((e) => e && EVENT_TYPES.includes(e.type)) : []);

// ---- 罪犯类事件钩子 ----

function crimeHook(state, api) {
    const { ctx, directives } = api;
    const changes = ctx.changes;
    const events = eventsOf(ctx);
    const others = (who) => [...api.here].filter((n) => n !== who && n !== '主角' && state.characters[n]);
    const holds = (name, id) => api.has(state, name, id);
    let next = state;
    for (const ev of events) {
        const who = ev.who;
        if (!who) continue;
        // 通缉犯：身份被揭开那一楼，在场角色对其信任下降一档。
        if (ev.type === '身份揭开' && holds(who, '通缉犯')) for (const n of others(who)) next = api.bump(next, n, '信任', -TRUST_DROP, '通缉犯');
        // 惯偷：偷窃成功金钱小增；被发现在场角色对其信任下降一大档。
        if (ev.type === '偷窃成功' && holds(who, '惯偷')) next = bumpMoney(next, who, MONEY_TABLE.少量, '惯偷', changes);
        if (ev.type === '偷窃被发现' && holds(who, '惯偷')) for (const n of others(who)) next = api.bump(next, n, '信任', -TRUST_DROP_BIG, '惯偷');
        // 骗子：谎言被揭穿，对方信任下降一大档、芥蒂上升一档（对方指 ev.by，缺省为在场角色）。
        if (ev.type === '谎言揭穿' && holds(who, '骗子')) {
            const by = toList(ev.by).filter((n) => next.characters[n]);
            for (const n of by.length ? by : others(who)) {
                next = api.bump(next, n, '信任', -TRUST_DROP_BIG, '骗子');
                next = api.bump(next, n, '芥蒂', GRUDGE_UP_SMALL, '骗子');
            }
        }
        // 鹰系：主角说谎被揭穿那一楼，其芥蒂上升加倍（本楼标签已给的量再补一份，没有就补一小档）。
        if (ev.type === '谎言揭穿' && who === '主角') {
            for (const n of Object.keys(next.characters)) if (holds(n, '鹰系')) next = api.bump(next, n, '芥蒂', Math.max(GRUDGE_UP_SMALL, sumTag(ctx, n, '芥蒂', 1)), '鹰系');
        }
        // 黑客：被追查那一楼压力小升。
        if (ev.type === '被追查' && holds(who, '黑客')) next = bumpStress(next, who, STRESS_SMALL, '黑客', changes);
    }
    // 杀手：杀伤事件（本楼有战斗标签，或事件入口给出杀伤）之后其压力不上升，退回本楼标签结算的压力增量。
    const bloodshed = directives.some((d) => d.kind === 'battle') || events.some((e) => e.type === '杀伤');
    if (bloodshed) {
        for (const name of ['主角', ...Object.keys(next.characters)]) {
            if (!holds(name, '杀手')) continue;
            const up = sumTag(ctx, name, 'stress', 1);
            if (up > 0) next = bumpStress(next, name, -up, '杀手', changes);
        }
    }
    // 黑帮：灰色收入，本楼打工收入再高一档。
    const work = ctx.flags && ctx.flags.work;
    if (work && work.income && holds('主角', '黑帮')) {
        const at = MONEY_ORDER.indexOf(work.income);
        if (at >= 0) next = bumpMoney(next, '主角', MONEY_TABLE[MONEY_ORDER[Math.min(at + 1, 3)]] - MONEY_TABLE[work.income], '黑帮', changes);
    }
    // 逆鳞：亲近者（主角）受伤那一楼，在场的其芥蒂上升一大档、压力小升。
    if (api.heroHurt(directives)) {
        for (const n of Object.keys(next.characters)) {
            if (!api.here.has(n) || !holds(n, '逆鳞')) continue;
            next = api.bump(next, n, '芥蒂', GRUDGE_UP_BIG, '逆鳞');
            next = bumpStress(next, n, STRESS_SMALL, '逆鳞', changes);
        }
    }
    next = accompliceHook(next, api, events);
    next = captiveHook(next, api, events);
    return next;
}

// 共犯（双向）：NPC 挂共犯特质或共犯关系状态，伙伴为主角。彼此信任不下降；一方被抓，另一方压力上升一大档。
function accompliceHook(state, api, events) {
    const { ctx } = api;
    let next = state;
    const mates = Object.keys(next.characters).filter((n) => api.has(next, n, '共犯') || hasRel(next, n, '共犯'));
    for (const n of mates) {
        const drop = sumTag(ctx, n, '信任', -1);
        if (drop < 0) next = api.bump(next, n, '信任', -drop, '共犯');
    }
    for (const ev of events) {
        if (ev.type !== '被抓' || !ev.who) continue;
        if (ev.who === '主角') for (const n of mates) next = bumpStress(next, n, STRESS_BIG, '共犯', ctx.changes);
        else if (mates.includes(ev.who)) next = api.bumpHeroStress(next, STRESS_BIG, '共犯');
    }
    return next;
}

// 斯德哥尔摩：被挟持、关押期间，对挟持者不记芥蒂，好感上升再多一半。
// 挟持来自事件入口，或本楼其压力上升且来源是「被迫 / 被支配」；记在 character.captiveDay，获救、压力下降或超过几天即结束。
function captiveHook(state, api, events) {
    const { ctx, directives } = api;
    const day = state.clock.day;
    let next = state;
    for (const name of Object.keys(next.characters)) {
        const cur = next.characters[name];
        const forced = directives.some((d) => d.kind === 'stress' && d.target === name && d.value === '上升' && (d.source === '被迫' || d.source === '被支配'));
        const taken = events.some((e) => e.type === '挟持' && e.target === name);
        const freed = events.some((e) => e.type === '获救' && e.target === name);
        if (forced || taken) next = withCharacter(next, name, { ...cur, captiveDay: day });
        else if (freed && cur.captiveDay !== undefined) { const { captiveDay, ...rest } = cur; next = withCharacter(next, name, rest); }
        if (!api.has(next, name, '斯德哥尔摩') || next.characters[name].captiveDay === undefined) continue;
        const grudge = sumTag(ctx, name, '芥蒂', 1);
        if (grudge > 0) next = api.bump(next, name, '芥蒂', -grudge, '斯德哥尔摩');
        const favor = sumTag(ctx, name, '好感', 1);
        if (favor > 0) next = api.bump(next, name, '好感', Math.floor(favor / 2), '斯德哥尔摩');
    }
    return next;
}

// ---- 恩情、仇怨：状态持续效果与事件转换 ----

// 恩情类状态的倍率：受恩（欠恩）的一方挂着「知恩图报」时数值效果加倍。
const gratitude = (state, api, debtor) => (api.has(state, debtor, '知恩图报') ? 2 : 1);

// 状态的持续效果：对本楼标签结算结果做修正。
function ongoing(state, api) {
    const { ctx } = api;
    let next = state;
    for (const name of Object.keys(state.characters)) {
        if (!relStatesOf(state, name).length) continue;
        const gain = sumTag(ctx, name, '好感', 1);
        const loss = sumTag(ctx, name, '好感', -1);
        // 救命之恩（TA 欠你）：TA 对主角好感单楼最多下降一小档。
        if (hasRel(state, name, '救命之恩', 'ta') && loss < -FAVOR_DOWN_CAP) next = api.bump(next, name, '好感', -FAVOR_DOWN_CAP - loss, '救命之恩');
        // 恩怨两难：芥蒂不再上升；每次好感上升 TA 压力同步小升。
        if (hasRel(state, name, '恩怨两难', 'ta')) {
            const up = sumTag(ctx, name, '芥蒂', 1);
            if (up > 0) next = api.bump(next, name, '芥蒂', -up, '恩怨两难');
            if (gain > 0) next = bumpStress(next, name, STRESS_SMALL, '恩怨两难', ctx.changes);
        }
        // 结怨（TA 恨你）：TA 好感上升减半。
        if (hasRel(state, name, '结怨', 'ta') && gain > 0) next = api.bump(next, name, '好感', -Math.floor(gain / 2), '结怨');
        // 猜忌（TA 对你）：信任上升减半（四舍五入）。
        // 开局设定与误会解除退回的信任不算在内。
        if (hasRel(state, name, '猜忌', 'ta')) next = halveTrust(next, api, name, sumTag(ctx, name, '信任', 1, (c) => !/^(起始关系|开局修正|误会解除)/.test(String(c.note || ''))));
        // 爱恨交织：好感上升时欲望同步小升。
        if (hasRel(state, name, '爱恨交织', 'ta') && gain > 0) next = api.bump(next, name, '欲望', api.SMALL.欲望, '爱恨交织');
    }
    return next;
}

// 猜忌：本楼标签结算给的信任上升量 gain 减去一半，变动带明细。
function halveTrust(state, api, name, gain) {
    const cut = Math.round(gain / 2);
    if (gain <= 0 || cut <= 0) return state;
    const list = api.ctx.changes;
    const before = list.length;
    const next = api.bump(state, name, '信任', -cut, '猜忌');
    if (list.length > before) {
        const row = list[list.length - 1];
        list[list.length - 1] = withCalc(row, { calc: [calcRow('信任上升', gain), calcRow('猜忌 减半', -cut), calcRow('结果', row.to - row.from)] });
    }
    return next;
}

// 冰释前嫌的清除：宿仇无「一笑泯恩仇」时先转为恩怨两难，有则直接清除。
function resolveHate(state, api, name, dir) {
    let next = state;
    let cleared = false;
    if (hasRel(next, name, '结怨', dir)) { next = dropRel(next, name, '结怨', dir); cleared = true; }
    if (dir === 'me') {
        if (hasRel(next, name, '血仇', 'me')) { next = dropRel(next, name, '血仇', 'me'); cleared = true; }
        return { state: next, cleared };
    }
    if (hasRel(next, name, '恩怨两难', 'ta')) { next = dropRel(next, name, '恩怨两难', 'ta'); cleared = true; }
    else if (next.characters[name].feud) {
        next = dropRel(setFeud(next, name, false), name, '血仇', 'ta');
        if (!api.has(next, name, '一笑泯恩仇')) next = addRel(next, name, '恩怨两难', 'ta');
        cleared = true;
    }
    return { state: next, cleared };
}

export function applyEvent(state, api, ev) {
    const name = ev.target;
    const cur = name && state.characters[name];
    if (!cur) return state;
    let next = state;
    const dir = ev.dir === 'me' ? 'me' : 'ta';
    switch (ev.type) {
    case '救命': {
        if (dir === 'ta') {
            if (cur.feud) {
                // 救了宿仇：转为恩怨两难；血仇需两次恩情事件才转。
                const blood = findRel(next, name, '血仇', 'ta');
                if (blood && (Number(blood.n) || 0) < 1) return patchRel(next, name, '血仇', 'ta', { n: (Number(blood.n) || 0) + 1 });
                next = dropRel(setFeud(next, name, false), name, '血仇', 'ta');
                return addRel(next, name, '恩怨两难', 'ta');
            }
            const m = gratitude(next, api, name);
            next = addRel(next, name, '救命之恩', 'ta');
            next = api.bump(next, name, '信任', api.BIG.信任 * m, '救命之恩');
            return api.bump(next, name, '芥蒂', -GRUDGE_DOWN_BIG * m, '救命之恩');
        }
        next = addRel(next, name, '救命之恩', 'me');
        return api.bump(next, name, '好感', api.SMALL.好感 * gratitude(next, api, '主角'), '救命之恩');
    }
    case '帮忙': return addRel(next, name, '欠你人情', dir);
    case '遇险':
        // 你欠 TA 一命：TA 遇险那一楼主角压力额外上升。
        return hasRel(next, name, '救命之恩', 'me') ? api.bumpHeroStress(next, STRESS_SMALL * gratitude(next, api, '主角'), '救命之恩') : next;
    case '报恩': {
        const life = hasRel(next, name, '救命之恩', dir);
        next = dropRel(next, name, life ? '救命之恩' : '欠你人情', dir);
        if (dir === 'me' && life) {
            const m = gratitude(next, api, '主角');
            next = api.bump(next, name, '好感', api.BIG.好感 * m, '报恩');
            next = api.bump(next, name, '信任', api.BIG.信任 * m, '报恩');
        }
        // 恩怨分明：TA 报恩后对主角好感上升一大档（主角没有好感条，不结算主角一侧）。
        if (dir === 'ta' && api.has(next, name, '恩怨分明')) next = api.bump(next, name, '好感', api.BIG.好感, '恩怨分明');
        return next;
    }
    case '结怨': {
        if (dir === 'ta') {
            if (api.has(next, name, '以德报怨') || hasRel(next, name, '结怨', 'ta') || cur.feud) return next;
            next = addRel(next, name, '结怨', 'ta', { hold: dimOf(cur, '芥蒂') + GRUDGE_UP_BIG });
            return api.bump(next, name, '芥蒂', GRUDGE_UP_BIG, '结怨');
        }
        return api.has(next, '主角', '以德报怨') ? next : addRel(next, name, '结怨', 'me');
    }
    case '血仇': {
        if (dir === 'me') return addRel(next, name, '血仇', 'me');
        next = dropRel(next, name, '结怨', 'ta');
        next = setFeud(addRel(next, name, '血仇', 'ta', { n: 0 }), name, true);
        return api.bump(next, name, '芥蒂', 100 - dimOf(next.characters[name], '芥蒂'), '血仇');
    }
    case '和解': {
        // 冰释前嫌：结怨 / 宿仇清除，芥蒂下降一大档，信任上升一小档。
        let any = false;
        for (const d of ['ta', 'me']) {
            const r = resolveHate(next, api, name, d);
            next = r.state;
            any = any || r.cleared;
        }
        if (!any) return next;
        next = api.bump(next, name, '芥蒂', -GRUDGE_DOWN_BIG, '冰释前嫌');
        return api.bump(next, name, '信任', api.SMALL.信任, '冰释前嫌');
    }
    case '道歉': return dropRel(next, name, '结怨', 'ta');
    case '复仇': {
        // 大仇得报：报复方压力下降一大档，结怨清除。
        if (dir === 'ta') return bumpStress(dropRel(next, name, '结怨', 'ta'), name, -STRESS_BIG, '大仇得报', api.ctx.changes);
        return api.bumpHeroStress(dropRel(next, name, '结怨', 'me'), -STRESS_BIG, '大仇得报');
    }
    case '决裂':
        // 恩怨两难走向决裂，转回宿仇。
        return hasRel(next, name, '恩怨两难', 'ta') ? setFeud(dropRel(next, name, '恩怨两难', 'ta'), name, true) : next;
    case '共犯': return hasRel(next, name, '共犯') ? next : addRel(next, name, '共犯', 'both');
    case '猜忌': return dir === 'ta' && !hasRel(next, name, '猜忌', 'ta') ? addRel(next, name, '猜忌', 'ta', { src: 'story', trust: 0, grudge: 0 }) : next;
    default: return next;
    }
}

// 标签读得到的推导：芥蒂上升「大」及以上（睚眦必报「中」及以上）挂结怨，芥蒂本身已由标签结算；对「恩怨两难 / 结怨 / 宿仇」的人写共患难或交心事件视为和解。
function derivedEvents(state, api) {
    const out = [];
    for (const d of api.directives) {
        if (d.kind === 'dim' && d.dim === '芥蒂' && d.value === '上升' && state.characters[d.target]) {
            const level = d.strength || '小';
            const hit = level === '大' || level === '重大' || (level === '中' && api.has(state, d.target, '睚眦必报'));
            if (hit && !api.has(state, d.target, '以德报怨') && !hates(state, d.target)) out.push({ type: '_结怨标签', target: d.target });
        }
        if (d.kind === 'event' && ['共患难', '交心', '托付', '立誓'].includes(d.value) && state.characters[d.target] && (hates(state, d.target) || hasRel(state, d.target, '恩怨两难', 'ta'))) out.push({ type: '和解', target: d.target });
    }
    return out;
}

// 爱恨交织：结怨或宿仇存在且好感到「喜欢」时挂上，条件不再成立即摘除。
function refreshLoveHate(state) {
    let next = state;
    for (const name of Object.keys(next.characters)) {
        const on = hates(next, name) && dimOf(next.characters[name], '好感') >= LIKE;
        const has = hasRel(next, name, '爱恨交织', 'ta');
        if (on && !has) next = addRel(next, name, '爱恨交织', 'ta');
        else if (!on && has) next = dropRel(next, name, '爱恨交织', 'ta');
    }
    return next;
}

function bondHook(state, api) {
    let next = ongoing(state, api);
    for (const ev of [...eventsOf(api.ctx), ...derivedEvents(next, api)]) {
        if (ev.type === '_结怨标签') next = addRel(next, ev.target, '结怨', 'ta', { hold: dimOf(next.characters[ev.target], '芥蒂') });
        else next = applyEvent(next, api, ev);
    }
    next = refreshLoveHate(next);
    // 结怨不自然消退：每楼末尾记下芥蒂保底值，日结算时若被淡忘则补回。
    for (const name of Object.keys(next.characters)) {
        if (hasRel(next, name, '结怨', 'ta')) next = patchRel(next, name, '结怨', 'ta', { hold: dimOf(next.characters[name], '芥蒂') });
    }
    next = harmonyHook(next, api);
    next = rivalWinHook(next, api);
    return next;
}

// 修罗场转后宫：两位恋爱对象（isRomance）都有过吃醋记录（jealousSeen），同一楼对两人都写了共患难 / 交心，
// 或两人同楼在场（ctx.present）且写了其中一人的共患难 / 交心 → 双方互挂「相安」；
// 已相安、双方好感都到深爱档（76）再次满足 → 升「同心」（相安与同心同楼不连升）。
function harmonyHook(state, api) {
    const { ctx, directives } = api;
    let next = state;
    for (const c of ctx.changes) {
        const cur = c.source === 'tag' && c.note === '吃醋' ? next.characters[c.target] : null;
        if (cur && !cur.jealousSeen) next = withCharacter(next, c.target, { ...cur, jealousSeen: true });
    }
    const hit = new Set(directives.filter((d) => d.kind === 'event' && ['共患难', '交心', '托付', '立誓'].includes(d.value) && next.characters[d.target]).map((d) => d.target));
    if (!hit.size) return next;
    const present = new Set(Array.isArray(ctx.present) ? ctx.present : []);
    const names = Object.keys(next.characters).filter((n) => next.characters[n].jealousSeen && isRomance(next.characters[n], n, ctx.romanceSeen));
    for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
            const [x, y] = [names[i], names[j]];
            if (!((hit.has(x) && hit.has(y)) || (hit.has(x) && present.has(y)) || (hit.has(y) && present.has(x)))) continue;
            if (hasPair(next, x, '同心', y)) continue;
            if (hasPair(next, x, '相安', y)) {
                if (hasPair(state, x, '相安', y) && dimOf(next.characters[x], '好感') >= DEEP_LOVE && dimOf(next.characters[y], '好感') >= DEEP_LOVE) next = setPair(setPair(next, x, y, '同心'), y, x, '同心');
                continue;
            }
            next = setPair(setPair(next, x, y, '相安'), y, x, '相安');
        }
    }
    return next;
}

// 相爱相杀：亲密对决（主导，我方主导 / 险胜）或战斗中胜过对方，TA 好感上升一小档（主角没有好感条，只结算 TA 一侧）。
// 对方：亲密对决取战报的 counterpart；战斗取在场且不是同伴的合成持有者。
const DUEL_WIN = ['我方主导', '险胜'];
function rivalWinHook(state, api) {
    const { ctx, directives } = api;
    const battle = ctx.flags && ctx.flags.battle;
    const won = battle && battle.outcome && battle.outcome !== '败' && battle.outcome !== '撤' ? battle : null;
    const duels = directives.filter((d) => d.kind === 'challenge' && d.ending && d.ending !== INTIMATE_STOP && d.mechanic === '主导' && DUEL_WIN.includes(d.ending));
    if (!won && !duels.length) return state;
    const allies = new Set(won ? [won.ally, ...(won.allies || [])].filter(Boolean) : []);
    const present = new Set([...(Array.isArray(ctx.present) ? ctx.present : []), ...directives.map((d) => d.target).filter(Boolean)]);
    let next = state;
    for (const name of Object.keys(next.characters)) {
        if (!api.has(next, name, 'combo:相爱相杀')) continue;
        const duel = duels.some((d) => d.counterpart === name);
        const fight = won && present.has(name) && !allies.has(name);
        if (duel || fight) next = api.bump(next, name, '好感', api.SMALL.好感, '相爱相杀');
    }
    return next;
}

export const TAG_HOOKS = [crimeHook, bondHook];

// ---- 日结算钩子 ----

function bondDaily(state, api) {
    const { changes, present, day } = api;
    let next = state;
    let heroOwes = false;
    for (const name of Object.keys(next.characters)) {
        // 白眼狼：救命之恩过七天自动淡化为欠你人情（知恩图报不淡化）。
        const life = findRel(next, name, '救命之恩', 'ta');
        if (life && api.has(next, name, '白眼狼') && !api.has(next, name, '知恩图报') && day - (Number(life.since) || day) >= FADE_DAYS) {
            next = addRel(dropRel(next, name, '救命之恩', 'ta'), name, '欠你人情', 'ta');
        }
        // 恩怨分明：欠恩期间每天压力缓升（NPC 欠主角记在 ta，主角欠 TA 记在 me）。
        const owesTa = hasRel(next, name, '救命之恩', 'ta') || hasRel(next, name, '欠你人情', 'ta');
        if (owesTa && api.has(next, name, '恩怨分明')) next = bumpStress(next, name, DAILY_STRESS, '恩怨分明', changes);
        if (hasRel(next, name, '救命之恩', 'me') || hasRel(next, name, '欠你人情', 'me')) heroOwes = true;
        // 结怨（TA 恨你）不自然消退：芥蒂被日结算淡忘的部分补回。
        // 宽容一类性格（宽容、以德报怨、老好人、一笑泯恩仇）例外：不补回，芥蒂淡到 25 以下时结怨自行解开。
        const hate = findRel(next, name, '结怨', 'ta');
        const forgiving = hate && FORGIVING.some((id) => api.has(next, name, id));
        if (forgiving && dimOf(next.characters[name], '芥蒂') <= GRUDGE_FADE_FLOOR) {
            next = dropRel(next, name, '结怨', 'ta');
        } else if (hate && !forgiving && Number.isFinite(hate.hold) && dimOf(next.characters[name], '芥蒂') < hate.hold) {
            const c = next.characters[name];
            changes.push({ source: 'daily', target: name, key: '芥蒂', from: dimOf(c, '芥蒂'), to: hate.hold, note: '结怨不消退' });
            next = withCharacter(next, name, { ...c, dims: { ...c.dims, 芥蒂: hate.hold } });
        }
        // 结怨（你恨 TA）：TA 在场时主角压力缓升。
        if (hasRel(next, name, '结怨', 'me') && present.has(name)) next = bumpStress(next, '主角', DAILY_STRESS, '结怨', changes);
        // 被挟持超过几天自动视为结束。
        const cur = next.characters[name];
        if (cur.captiveDay !== undefined && day - cur.captiveDay > CAPTIVE_DAYS) {
            const { captiveDay, ...rest } = cur;
            next = withCharacter(next, name, rest);
        }
    }
    if (heroOwes && api.has(next, '主角', '恩怨分明')) next = bumpStress(next, '主角', DAILY_STRESS, '恩怨分明', changes);
    return refreshLoveHate(next);
}

export const DAILY_HOOKS = [bondDaily];
