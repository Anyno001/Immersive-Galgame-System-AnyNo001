// 一楼的事后结算（§4.2、§7）：标签 → 角色维度 → 生活条 → 熬夜 → 跨天。纯函数，random 由账本按本楼种子提供。
// 返回 { state, changes, meta }，可直接作为 stat-ledger-settle 的 settle 回调结果。
import { parseStatDirectives } from './stat-directives.js';
import { FLOOR_GAIN_MAX, applyDim, baseDelta } from './stat-favor.js';
import { applyGift, applyKeyEvent } from './stat-favor-events.js';
import { DEFAULT_MONEY_TABLE, applyBarDirective, checkModifiers } from './stat-bars.js';
import { SOFT_DAY_FLOORS, detectDayAdvance, fallbackDirectives, isLateHour, narrationOf, settleDay, settleSkip, settleSoftDay } from './stat-day.js';
import { createCharacter, withBars, withCharacter, withClock } from './stat-state.js';
import { settleCombat } from './stat-battle.js';

const CHARACTER_KINDS = new Set(['favor', 'dim', 'gift', 'event']);
const BAR_KINDS = new Set(['stamina', 'hurt', 'stress', 'money']);
const USER_NAME = /^(?:<user>|\{\{user\}\}|主角)$/i;

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

function applyCharacterDirective(current, d, state, ctx) {
    const room = (dim) => FLOOR_GAIN_MAX - (ctx.floorGained.get(`${d.target}|${dim}`) || 0);
    const coef = Number(current.coef) || 1;
    if (d.kind === 'gift') return applyGift(current, d.value, { random: ctx.random, coef, floorRoom: room('好感') });
    if (d.kind === 'event') {
        const mods = checkModifiers(state.protagonist.bars);
        const charm = (Number(state.protagonist.skills.魅力?.value) || 50) + mods.targetShift;
        const { character, result } = applyKeyEvent(current, d.value, { charm, modifiers: { penalty: mods.penalty }, random: ctx.random });
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
            ctx.changes.push({ source: 'tag', target: d.target, key: change.dim, from: change.from, to: change.to, note: change.value });
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

export function settleFloorText(before, text, { random, hour = null, nsfw = false, resolveCharacter, moneyTable = DEFAULT_MONEY_TABLE } = {}) {
    const parsed = parseStatDirectives(text);
    const diagnostics = [...parsed.diagnostics];
    const narration = narrationOf(text);
    const resolve = resolveCharacter || ((name) => (Object.hasOwn(before.characters, name) ? name : null));
    const merged = [...parsed.directives, ...fallbackDirectives(narration, parsed.directives)];
    const directives = dedupeDims(resolveTargets(merged, resolve, diagnostics));
    const ctx = { random, nsfw, moneyTable, changes: [], diagnostics, events: [], flags: {}, floorGained: new Map() };
    let state = settleCharacters(before, directives, ctx);
    state = settleCombat(state, directives, ctx);
    state = settleBars(state, directives, hour, ctx);
    state = settleClock(state, narration, directives, hour, ctx);
    return { state, changes: ctx.changes, meta: { diagnostics, events: ctx.events, flags: ctx.flags } };
}
