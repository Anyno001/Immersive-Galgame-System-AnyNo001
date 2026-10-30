// 一楼的事后结算（§4.2、§7、v2 §5.2 / §7.2）：检定 → 标签 → 角色维度 → 生活条 → 熬夜 → 跨天。
// 纯函数，random 由账本按本楼种子提供；检定走 opts.engine（缺省为 CoC 空注册表）。
// 返回 { state, changes, meta }，可直接作为 stat-ledger-settle 的 settle 回调结果。
import { parseStatDirectives } from './stat-directives.js';
import { FLOOR_GAIN_MAX, applyDim, baseDelta } from './stat-favor.js';
import { applyGift, applyKeyEvent } from './stat-favor-events.js';
import { DEFAULT_MONEY_TABLE, applyBarDirective } from './stat-bars.js';
import { SOFT_DAY_FLOORS, detectDayAdvance, fallbackDirectives, isLateHour, narrationOf, settleDay, settleSkip, settleSoftDay } from './stat-day.js';
import { createCharacter, withBars, withCharacter, withClock } from './stat-state.js';
import { settleCombat } from './stat-battle.js';
import { PROTAGONIST, checkFromPreroll, createEngine, markGrowth, resolveCheck } from './stat-engine.js';
import { registerStorySkill } from './stat-registry.js';

const CHARACTER_KINDS = new Set(['favor', 'dim', 'gift', 'event']);
const BAR_KINDS = new Set(['stamina', 'hurt', 'stress', 'money']);
const USER_NAME = /^(?:<user>|\{\{user\}\}|主角)$/i;
// 社交检定失败时，本楼对该角色的正向好感标签降一档（§7.2）。
const FAVOR_DOWNGRADE = Object.freeze({ 心动: '开心', 感动: '开心', 开心: '平淡' });

// 只结算能解析成已登记角色的标签；路人与解析不了的名字记诊断后丢弃（§5.1B、易错点 C3）。
function resolveTargets(directives, resolve, diagnostics) {
    const out = [];
    for (const d of directives) {
        if (d.kind === 'battle' && d.ally) {
            const ally = USER_NAME.test(d.ally) ? null : resolve(d.ally);
            if (!ally) diagnostics.push({ code: 'stat-unknown-character', name: d.ally });
            out.push({ ...d, ally });
            continue;
        }
        if (!CHARACTER_KINDS.has(d.kind)) { out.push(d); continue; }
        if (USER_NAME.test(d.target)) { diagnostics.push({ code: 'stat-user-target', name: d.target }); continue; }
        const key = resolve(d.target);
        if (key) out.push({ ...d, target: key });
        else diagnostics.push({ code: 'stat-unknown-character', name: d.target });
    }
    return out;
}

// 同一角色同一维度一楼只留一条，取增量绝对值最大的方向（易错点 C5）。
export function dedupeDims(directives) {
    const out = [];
    const slot = new Map();
    for (const d of directives) {
        if (d.kind !== 'favor' && d.kind !== 'dim') { out.push(d); continue; }
        const key = `${d.target}|${d.dim}`;
        if (!slot.has(key)) { slot.set(key, out.length); out.push(d); continue; }
        const i = slot.get(key);
        if (Math.abs(baseDelta(d.dim, d.value)) > Math.abs(baseDelta(out[i].dim, out[i].value))) out[i] = d;
    }
    return out;
}

// 检定结果约束好感（§7.2）：社交检定失败时对象的正向好感降一档；对象不明时按本楼全部正向好感处理。
export function constrainFavor(directives, check) {
    if (!check || !check.social || check.success) return directives;
    const target = check.against || check.toward;
    return directives.map((d) => {
        if (d.kind !== 'favor' || !FAVOR_DOWNGRADE[d.value]) return d;
        if (target && d.target !== target) return d;
        return { ...d, value: FAVOR_DOWNGRADE[d.value], constrained: true };
    });
}

function applyCharacterDirective(current, d, state, ctx) {
    const bonus = ctx.critTarget && (ctx.critTarget === '*' || ctx.critTarget === d.target) ? 1 : 0;
    const room = (dim) => FLOOR_GAIN_MAX + bonus - (ctx.floorGained.get(`${d.target}|${dim}`) || 0);
    const coef = Number(current.coef) || 1;
    if (d.kind === 'gift') return applyGift(current, d.value, { random: ctx.random, coef, floorRoom: room('好感') });
    if (d.kind === 'event') {
        const roll = () => resolveCheck(ctx.engine, state, { actor: PROTAGONIST, skill: '魅力', toward: d.target }, ctx.random);
        const { character, result } = applyKeyEvent(current, d.value, { roll, random: ctx.random });
        ctx.events.push({ target: d.target, ...result });
        return { character, change: result.success ? { dim: '好感', value: `${d.value}突破`, from: result.gate, to: result.gate + 1 } : null };
    }
    return applyDim(current, d.dim, d.value, { random: ctx.random, coef, floorRoom: room(d.dim) });
}

function settleCharacters(before, directives, ctx) {
    let state = before;
    for (const d of directives) {
        if (!CHARACTER_KINDS.has(d.kind)) continue;
        if (d.dim === '欲望' && !ctx.nsfw) { ctx.diagnostics.push({ code: 'stat-dim-disabled', name: d.target, dim: d.dim }); continue; }
        const current = state.characters[d.target] || createCharacter(state.clock.day, { nsfw: ctx.nsfw });
        const { character, change } = applyCharacterDirective(current, d, state, ctx);
        if (change && change.to !== change.from) {
            ctx.changes.push({ source: 'tag', target: d.target, key: change.dim, from: change.from, to: change.to, note: d.constrained ? `${change.value}（检定失败）` : change.value });
            const gain = Math.max(0, change.to - change.from);
            if (gain && d.kind !== 'event') {
                const key = `${d.target}|${change.dim}`;
                ctx.floorGained.set(key, (ctx.floorGained.get(key) || 0) + gain);
            }
        }
        state = withCharacter(state, d.target, { ...character, lastSeenDay: state.clock.day });
    }
    return state;
}

// 23 点以后的行动每天额外记一次熬夜；体力归零时标记强制休息，并按入睡处理。
function settleBars(state, directives, hour, ctx) {
    const list = directives.filter((d) => BAR_KINDS.has(d.kind));
    let stayedUp = state.clock.stayedUp || list.some((d) => d.kind === 'stamina' && d.value === '熬夜');
    if (isLateHour(hour) && !stayedUp) { list.push({ kind: 'stamina', value: '熬夜', late: true }); stayedUp = true; }
    let bars = state.protagonist.bars;
    for (const d of list) {
        const r = applyBarDirective(bars, d, ctx.moneyTable);
        if (r.shortfall) ctx.flags.shortfall = true;
        if (r.change) ctx.changes.push({ source: 'tag', target: '主角', key: r.change.key, from: r.change.from, to: r.change.to, note: d.late ? '23点后熬夜' : d.value });
        bars = r.bars;
    }
    if (bars.stamina <= 0) ctx.flags.forcedRest = true;
    const next = withBars(state, bars);
    return stayedUp !== state.clock.stayedUp ? withClock(next, { stayedUp }) : next;
}

function settleClock(state, narration, directives, hour, ctx) {
    const all = ctx.flags.forcedRest ? [...directives, { kind: 'sleep', forced: true }] : directives;
    const advance = detectDayAdvance({ narration, directives: all, lastHour: state.clock.lastHour, hour });
    let next;
    if (advance && advance.kind === 'skip') {
        next = settleSkip(state, advance.days, { random: ctx.random, changes: ctx.changes });
        if (advance.capped) ctx.flags.skipCapped = true;
    } else if (advance) {
        next = settleDay(state, { random: ctx.random, changes: ctx.changes });
    } else {
        const floors = state.clock.floorsSinceDay + 1;
        if (floors >= SOFT_DAY_FLOORS) { next = settleSoftDay(state); ctx.flags.softDay = true; }
        else next = withClock(state, { floorsSinceDay: floors });
    }
    if (advance) ctx.flags.dayAdvance = advance.reason;
    return Number.isInteger(hour) ? withClock(next, { lastHour: hour }) : next;
}

// roll 标签 + 预掷骰面 → 本楼检定（§5.2）。新技能先登记进本楼的临时目录，结果随 meta.newSkills 交给运行时合并。
function checkFromRollTag(before, tag, opts, ctx) {
    let engine = ctx.engine;
    let skill = engine.registry.resolve(tag.skill);
    if (!skill) {
        const r = registerStorySkill(opts.catalog || {}, tag.skill, { attribute: tag.attribute, floor: opts.floor });
        if (r.created) {
            ctx.newSkills.push(r.entry);
            engine = createEngine({ ...(opts.catalog || {}), story: r.catalog.story }, opts.settings || {}, engine.ruleset.ID);
            skill = r.name;
        } else if (r.reason === 'capped' || r.reason === 'floor-capped') {
            ctx.diagnostics.push({ code: 'stats-skill-cap', name: tag.skill });
            skill = engine.registry.resolve(tag.attribute) || null;
        }
    }
    if (!skill) { ctx.diagnostics.push({ code: 'stats-roll-unknown-skill', name: tag.skill }); return null; }
    let against = null;
    if (tag.against) {
        against = USER_NAME.test(tag.against) ? null : opts.resolveTarget(tag.against);
        if (!against) ctx.diagnostics.push({ code: 'stat-unknown-character', name: tag.against });
    }
    const opposedSkill = tag.opposedSkill ? engine.registry.resolve(tag.opposedSkill) : null;
    return checkFromPreroll(engine, before, opts.preroll, { skill, difficulty: tag.difficulty, against, opposedSkill });
}

// opts：{ random, hour, nsfw, resolveCharacter, moneyTable, engine, check, preroll, catalog, settings, floor }
// check：本楼已定的检定（选项、输入匹配、手动掷骰）；没有时按 roll 标签与预掷骰面重算。
export function settleFloorText(before, text, opts = {}) {
    const { random, hour = null, nsfw = false, resolveCharacter, moneyTable = DEFAULT_MONEY_TABLE } = opts;
    const parsed = parseStatDirectives(text);
    const diagnostics = [...parsed.diagnostics];
    const narration = narrationOf(text);
    const resolve = resolveCharacter || ((name) => (Object.hasOwn(before.characters, name) ? name : null));
    const engine = opts.engine || createEngine();
    const ctx = { random, nsfw, moneyTable, engine, changes: [], diagnostics, events: [], flags: {}, floorGained: new Map(), newSkills: [], critTarget: null };
    const rollTag = parsed.directives.find((d) => d.kind === 'roll') || null;
    let check = opts.check || null;
    let pendingRoll = null;
    if (!check && rollTag) {
        if (opts.preroll) check = checkFromRollTag(before, rollTag, { ...opts, resolveTarget: resolve }, ctx);
        else pendingRoll = { skill: rollTag.skill, difficulty: rollTag.difficulty, against: rollTag.against || null, opposedSkill: rollTag.opposedSkill || null, attribute: rollTag.attribute || null };
    }
    if (check && check.social && check.success && check.ladder === 'crit') ctx.critTarget = check.against || check.toward || '*';
    const merged = [...parsed.directives.filter((d) => d.kind !== 'roll'), ...fallbackDirectives(narration, parsed.directives)];
    const directives = constrainFavor(dedupeDims(resolveTargets(merged, resolve, diagnostics)), check);
    let state = markGrowth(before, check);
    state = settleCharacters(state, directives, ctx);
    state = settleCombat(state, directives, ctx);
    state = settleBars(state, directives, hour, ctx);
    state = settleClock(state, narration, directives, hour, ctx);
    const meta = { diagnostics, events: ctx.events, flags: ctx.flags };
    if (check) meta.check = check;
    if (pendingRoll) meta.pendingRoll = pendingRoll;
    if (ctx.newSkills.length) meta.newSkills = ctx.newSkills;
    if (rollTag) meta.rollTag = { skill: rollTag.skill, difficulty: rollTag.difficulty };
    return { state, changes: ctx.changes, meta };
}
