// 跨天判定与日结算（§7；易错点 C6/D1/D2/D3/D4）。跨天主要看 sleep 标签与明确的日期字样，钟点只作辅助。
import { stripStatDirectives } from './stat-directives.js';
import { coolDown, resetDaily } from './stat-favor-events.js';
import { rollDie, rollOver } from './stat-rng.js';
import { SKILL_MAX, clamp, withBars, withClock, withSkills } from './stat-state.js';

export const SOFT_DAY_FLOORS = 30;
const QUOTED = /“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g;
const MEMORY = /回忆|回想起|记忆中|梦里|梦中|梦境|梦见|闪回|当年|那时候/;
const NEXT_DAY = /第二天|次日|翌日|隔天|第二日/;
const EAT = /吃(?:了|完)?(?:饭|早饭|午饭|晚饭|早餐|午餐|晚餐|夜宵)|用(?:了)?餐/;
const SLEEP = /睡下|入睡|睡着了|上床睡觉|沉沉睡去/;

// 叙述文本：去掉标签、引号内台词，以及回忆、梦境所在的句子。跨天字样与兜底关键词只在这里找。
export function narrationOf(text) {
    return stripStatDirectives(text)
        .replace(QUOTED, ' ')
        .split(/(?<=[。！？!?\n])/)
        .filter((sentence) => !MEMORY.test(sentence))
        .join('');
}

export function isLateHour(hour) {
    return Number.isInteger(hour) && (hour >= 23 || hour < 4);
}

function nightToMorning(lastHour, hour) {
    return Number.isInteger(lastHour) && Number.isInteger(hour) && (lastHour >= 21 || lastHour < 4) && hour >= 5 && hour <= 11;
}

// 一楼最多跨一天；只有 skip 标签能一次跨多天（易错点 D1）。
export function detectDayAdvance({ narration, directives, lastHour, hour }) {
    const skip = directives.find((d) => d.kind === 'skip');
    if (skip) return { kind: 'skip', days: skip.days, capped: Boolean(skip.capped), reason: 'skip' };
    if (directives.some((d) => d.kind === 'sleep')) return { kind: 'day', reason: 'sleep' };
    if (NEXT_DAY.test(narration)) return { kind: 'day', reason: 'next-day' };
    if (nightToMorning(lastHour, hour)) return { kind: 'day', reason: 'clock' };
    return null;
}

// 漏打兜底只补体力（进食）与入睡，好感不兜底（§4.2）。
export function fallbackDirectives(narration, directives) {
    const out = [];
    if (!directives.some((d) => d.kind === 'stamina') && EAT.test(narration)) out.push({ kind: 'stamina', value: '进食', fallback: true });
    if (!directives.some((d) => d.kind === 'sleep' || d.kind === 'skip') && SLEEP.test(narration)) out.push({ kind: 'sleep', fallback: true });
    return out;
}

// 成长：打过勾的技能掷 d100，大于当前值则 +1d10（不超过 90），然后清勾。
function growSkills(skills, random, changes) {
    let next = skills;
    for (const [name, skill] of Object.entries(skills)) {
        if (!skill.marked) continue;
        const check = rollOver(skill.value, random);
        const to = check.passed ? Math.min(SKILL_MAX, skill.value + rollDie(10, random)) : skill.value;
        if (to !== skill.value) changes.push({ source: 'daily', target: '主角', key: name, from: skill.value, to, note: '成长' });
        next = { ...next, [name]: { value: to, marked: false } };
    }
    return next;
}

function coolCharacters(characters, day, days, changes) {
    const next = {};
    for (const [name, character] of Object.entries(characters)) {
        const cooled = coolDown(character, day, days);
        if (cooled !== character) changes.push({ source: 'daily', target: name, key: '好感', from: character.dims.好感, to: cooled.dims.好感, note: '冷却' });
        next[name] = resetDaily(cooled, day);
    }
    return next;
}

function pushBarChanges(from, to, changes, note) {
    for (const key of Object.keys(to)) {
        if (from[key] !== to[key]) changes.push({ source: 'daily', target: '主角', key, from: from[key], to: to[key], note });
    }
}

// 日结算：体力恢复（熬夜后只到 70）、生命 +15、压力 −10、技能成长、好感冷却、每日上限清零。
export function settleDay(state, { random, changes = [] } = {}) {
    const day = state.clock.day + 1;
    const { bars } = state.protagonist;
    const nextBars = {
        ...bars,
        stamina: Math.max(bars.stamina, state.clock.stayedUp ? 70 : 100),
        health: clamp(bars.health + 15, 0, 100),
        stress: clamp(bars.stress - 10, 0, 100),
    };
    pushBarChanges(bars, nextBars, changes, '日结算');
    let next = withBars(state, nextBars);
    next = withSkills(next, growSkills(next.protagonist.skills, random, changes));
    next = { ...next, characters: coolCharacters(next.characters, day, 1, changes) };
    return withClock(next, { day, floorsSinceDay: 0, stayedUp: false });
}

// 时间跳跃：体力、生命回满；冷却最多扣到阶段下限；成长只掷一次。天数已在解析时限到 30 天。
export function settleSkip(state, days, { random, changes = [] } = {}) {
    const day = state.clock.day + days;
    const { bars } = state.protagonist;
    const nextBars = { ...bars, stamina: 100, health: 100 };
    pushBarChanges(bars, nextBars, changes, `跳过${days}天`);
    let next = withBars(state, nextBars);
    next = withSkills(next, growSkills(next.protagonist.skills, random, changes));
    next = { ...next, characters: coolCharacters(next.characters, day, days, changes) };
    return withClock(next, { day, floorsSinceDay: 0, stayedUp: false });
}

// 软跨天：连续 30 楼没有跨天时只清零每日上限，不恢复、不成长，天数不变（易错点 D2）。
export function settleSoftDay(state) {
    const { day } = state.clock;
    const characters = Object.fromEntries(Object.entries(state.characters).map(([name, c]) => [name, resetDaily(c, day)]));
    return withClock({ ...state, characters }, { floorsSinceDay: 0 });
}
