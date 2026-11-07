// 特质的「事件类」结算钩子（只对 strengthRev ≥ 2）：本楼标签与在场状态触发的小幅数值联动。
// 倍率类（好感、信任、芥蒂、压力的乘数）在 stat-settle / stat-favor 里经 traitScale 读取；这里只放需要读本楼标签的联动与日结算后处理。
// 钩子只读 hasTrait / traitScale / traitFlag，不各自读字段；读不到的环境一律静默不生效。只改数值，不碰战斗与亲密对决规则。
import { FAVOR_GATES, gateKey } from './stat-favor.js';
import { DIM_MAX, barsOf, clamp, withBars, withCharacter } from './stat-state.js';
import { hasTrait, traitCatalogOf, traitDaily, traitFlag } from './stat-traits.js';
import { shiftStress } from './stat-strain.js';
import { EXT_DAILY_HOOKS, EXT_TAG_HOOKS } from './stat-trait-rules.js';

// 「一小档」「一大档」换算：沿用普通档强度表（好感 小 2 / 大 6，信任 小 1 / 大 6），压力 小 5。
const SMALL = Object.freeze({ 好感: 2, 信任: 1, 欲望: 2, 压力: 5 });
const BIG = Object.freeze({ 好感: 6, 信任: 6 });
// 缓升 / 额外下降的日结算量。
export const TRAIT_STRESS_DAILY = 3;
const HEAVY = new Set(['大', '极大']);

const heroDirectives = (directives, kind) => directives.filter((d) => d.kind === kind && !d.target);
const heroStressUp = (directives) => heroDirectives(directives, 'stress').filter((d) => d.value === '上升');
const heroBigStress = (directives) => heroStressUp(directives).some((d) => HEAVY.has(d.strength));
const heroHurt = (directives) => directives.some((d) => (d.kind === 'hurt' && !d.target) || (d.kind === 'stamina' && !d.target && d.value === '受伤'));

// 好感上升不越过未解锁的关口。
function capGate(character, from, to) {
    for (const gate of FAVOR_GATES) if (from <= gate && to > gate && !(character.unlocked || []).includes(gateKey(gate))) return gate;
    return to;
}

function bump(state, name, dim, amount, note, ctx) {
    const cur = state.characters[name];
    if (!cur || !cur.dims || (dim === '欲望' && !Object.hasOwn(cur.dims, '欲望'))) return state;
    const from = Number(cur.dims[dim]) || 0;
    let to = clamp(from + amount, dim === '欲望' ? 0 : -DIM_MAX, DIM_MAX);
    if (dim === '好感' && amount > 0) to = capGate(cur, from, to);
    if (to === from) return state;
    ctx.changes.push({ source: 'trait', target: name, key: dim, from, to, note });
    return withCharacter(state, name, { ...cur, dims: { ...cur.dims, [dim]: to } });
}

function bumpHeroStress(state, delta, note, ctx) {
    const bars = state.protagonist.bars;
    const next = shiftStress(bars, delta);
    const from = Number(bars.stress) || 0;
    const to = Number(next.stress) || 0;
    if (to === from) return state;
    ctx.changes.push({ source: 'trait', target: '主角', key: 'stress', from, to, note });
    return withBars(state, next);
}

// 本楼在场名单：结算传入的在场名单（缺省按本楼标签点名的角色）。
function hereSet(directives, ctx) {
    const set = new Set(Array.isArray(ctx.present) ? ctx.present : []);
    for (const d of directives) if (d.target) set.add(d.target);
    return set;
}

/// 白月光：本楼有「提起」事件指向白月光时，其他对主角好感达「心动」的角色按吃醋结算（补一条吃醋标签交给原结算），每人每天最多一次。
export function moonlightJealousy(state, directives, ctx) {
    const cat = ctx.traitCat || traitCatalogOf(ctx.traits, ctx.nsfw);
    const mentioned = directives.filter((d) => d.kind === 'traitEvent' && d.value === '提起' && hasTrait(state, cat, d.target, '白月光')).map((d) => d.target);
    if (!mentioned.length) return { state, directives: [] };
    const day = state.clock.day;
    const out = [];
    let next = state;
    for (const [name, cur] of Object.entries(state.characters)) {
        if (mentioned.includes(name) || (Number(cur.dims.好感) || 0) < 51 || cur.moonJealousDay === day) continue;
        out.push({ kind: 'favor', target: name, dim: '好感', value: '吃醋', strength: '中' });
        next = withCharacter(next, name, { ...cur, moonJealousDay: day });
    }
    return { state: next, directives: out };
}

// 每楼事件类联动：抖M、抖S、护短、熊系、猫系、包容。
export function settleTraitTags(before, directives, ctx) {
    const cat = ctx.traitCat || traitCatalogOf(ctx.traits, ctx.nsfw);
    const here = hereSet(directives, ctx);
    let state = before;
    const stressUp = heroStressUp(directives).length > 0;
    for (const name of Object.keys(state.characters)) {
        const has = (id) => hasTrait(state, cat, name, id);
        // 抖M：自己压力上升时欲望同步小升。
        if (has('抖M') && directives.some((d) => d.kind === 'stress' && d.target === name && d.value === '上升')) state = bump(state, name, '欲望', SMALL.欲望, '抖M', ctx);
        // 抖S：主角压力上升的那一楼，其欲望小升。
        if (has('抖S') && stressUp && here.has(name)) state = bump(state, name, '欲望', SMALL.欲望, '抖S', ctx);
        // 护短：主角受伤、压力上升「大」及以上的那一楼，对主角好感、信任额外上升一小档。
        if (has('护短') && here.has(name) && (heroHurt(directives) || heroBigStress(directives))) {
            state = bump(state, name, '好感', SMALL.好感, '护短', ctx);
            state = bump(state, name, '信任', SMALL.信任, '护短', ctx);
        }
        // 熊系：主角受伤那一楼，其对主角好感上升一大档。
        if (has('熊系') && here.has(name) && heroHurt(directives)) state = bump(state, name, '好感', BIG.好感, '熊系', ctx);
        // 包容：主角压力上升「大」及以上的那一楼，其在场时主角压力额外下降一小档。
        if (has('包容') && here.has(name) && heroBigStress(directives)) state = bumpHeroStress(state, -SMALL.压力, '包容', ctx);
        // 猫系：主角压力达七成以上时，其在场的那一楼主角压力额外下降。
        if (has('猫系') && here.has(name) && (Number(state.protagonist.bars.stress) || 0) >= 70) state = bumpHeroStress(state, -SMALL.压力, '猫系', ctx);
    }
    // 分组规则文件的事件钩子：api 提供只读判定与写入工具，钩子返回新 state。
    for (const hook of EXT_TAG_HOOKS) {
        const api = { cat, here, directives, ctx, SMALL, BIG, HEAVY, heroStressUp, heroBigStress, heroHurt,
            has: (s, name, id) => hasTrait(s, cat, name, id),
            bump: (s, name, dim, amount, note) => bump(s, name, dim, amount, note, ctx),
            bumpHeroStress: (s, delta, note) => bumpHeroStress(s, delta, note, ctx) };
        state = hook(state, api) || state;
    }
    return state;
}

// 日结算后处理（rev ≥ 2，settleDay 专用）：每天固定压力（乐天派）、不在身边缓升（黏人、犬系）、在场缓降（爱撒娇、兔系）、元气。
// days 为本次推进天数（日结算 1）；跳跃楼不调用。ctx：{ traits, nsfw, present }。
export function dailyTraitPass(state, ctx, changes) {
    const cat = traitCatalogOf(ctx.traits, ctx.nsfw);
    const present = new Set(Array.isArray(ctx.present) ? ctx.present : []);
    const day = state.clock.day;
    let next = state;
    const shiftBars = (name, delta, note) => {
        if (!delta) return;
        const hero = name === '主角';
        const bars = hero ? next.protagonist.bars : barsOf(next.characters[name]);
        const moved = shiftStress(bars, delta);
        const from = Number(bars.stress) || 0;
        const to = Number(moved.stress) || 0;
        if (to === from) return;
        changes.push({ source: 'daily', target: name, key: 'stress', from, to, note });
        next = hero ? withBars(next, moved) : withCharacter(next, name, { ...next.characters[name], bars: moved });
    };
    shiftBars('主角', traitDaily(next, cat, '主角', '压力'), '特质');
    for (const name of Object.keys(next.characters)) {
        shiftBars(name, traitDaily(next, cat, name, '压力'), '特质');
        const absent = !present.has(name) && (Number(next.characters[name].lastSeenDay) || 0) < day - 1;
        if (absent && traitFlag(next, cat, name, 'absentStress')) shiftBars(name, TRAIT_STRESS_DAILY, '主角不在身边');
        if (present.has(name) && traitFlag(next, cat, name, 'hereRelief')) shiftBars(name, -TRAIT_STRESS_DAILY, '主角在场');
        if (present.has(name) && hasTrait(next, cat, name, '元气')) shiftBars('主角', -TRAIT_STRESS_DAILY, '元气');
    }
    // 分组规则文件的日结算钩子：shiftStress 直接改写 next，钩子也可返回新 state。
    for (const hook of EXT_DAILY_HOOKS) {
        const api = { cat, present, day, changes, ctx, TRAIT_STRESS_DAILY,
            has: (s, name, id) => hasTrait(s, cat, name, id),
            shiftStress: (name, delta, note) => { shiftBars(name, delta, note); return next; } };
        next = hook(next, api) || next;
    }
    return next;
}
