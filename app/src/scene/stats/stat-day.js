// 跨天判定与日结算（§7；易错点 C6/D1/D2/D3/D4）。跨天主要看 sleep 标签与明确的日期字样，钟点只作辅助。
import { stripStatDirectives } from './stat-directives.js';
import { DESIRE_ROMANCE_FLOOR, coolDown, fadeDesire, fadeGrudge, liveHurts, misunderstandDaysOf, resetDaily } from './stat-favor-events.js';
import { rollDie, rollOver } from './stat-rng.js';
import { SKILL_MAX, barsOf, clamp, isRomance, withBars, withClock, withSkills } from './stat-state.js';
import { hasTrait, traitCatalogOf, traitFlag, traitScale } from './stat-traits.js';
import { dailyTraitPass } from './stat-trait-hooks.js';
import { relaxStress, shiftStress, stressRelaxCalc } from './stat-strain.js';
import { advanceStatuses } from './stat-status.js';
import { statusScale } from './stat-status-auto.js';
import { withCalc } from './stat-status-defs.js';

// 悟性三档（strengthRev ≥ 2）：平庸（默认）、出众、天纵。
export const APTITUDES = Object.freeze(['平庸', '出众', '天纵']);
export const aptitudeTier = (name) => (APTITUDES.includes(name) ? name : '平庸');
// 成长检定：平庸 d100 大于当前值；出众掷两次取好；天纵掷两次取好且判定线按当前值 −10。返回是否通过。
function growthPasses(value, tier, random, retry = false) {
    if (tier === '平庸') return rollOver(value, random).passed || (retry && rollOver(value, random).passed);
    const line = tier === '天纵' ? value - 10 : value;
    const first = rollOver(line, random).passed;
    const second = rollOver(line, random).passed;
    return first || second || (retry && rollOver(line, random).passed);
}
// 能让芥蒂随时间淡化的性格（其余角色的芥蒂不自然消退）。
// 卷王透支体力后的次日：体力只恢复到上限减一档（重度消耗 30）。
export const OVERDRAW_CAP = 70;
// 成长涨幅：天纵 1d10+2，其余 1d10。
export const growthGain = (tier, random) => rollDie(10, random) + (tier === '天纵' ? 2 : 0);

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
export function fallbackDirectives(narration, directives, { frozen = false } = {}) {
    const out = [];
    if (frozen) return out;
    if (!directives.some((d) => d.kind === 'stamina' && !d.target) && EAT.test(narration)) out.push({ kind: 'stamina', value: '进食', fallback: true });
    if (!directives.some((d) => d.kind === 'sleep' || d.kind === 'skip') && SLEEP.test(narration)) out.push({ kind: 'sleep', fallback: true });
    return out;
}

// 成长：打过勾的技能掷 d100，大于当前值则 +1d10（不超过 90），然后清勾。
// aptitude 只在 strengthRev ≥ 2 时传入（'平庸' / '出众' / '天纵'）；没有时按旧规则，随机数消耗与旧楼一致。
function growSkills(skills, random, changes, aptitude, retry = false) {
    let next = skills;
    for (const [name, skill] of Object.entries(skills)) {
        if (!skill.marked) continue;
        const passed = aptitude ? growthPasses(skill.value, aptitude, random, retry) : rollOver(skill.value, random).passed;
        const to = passed ? Math.min(SKILL_MAX, skill.value + (aptitude ? growthGain(aptitude, random) : rollDie(10, random))) : skill.value;
        if (to !== skill.value) changes.push({ source: 'daily', target: '主角', key: name, from: skill.value, to, note: '成长' });
        next = { ...next, [name]: { value: to, marked: false } };
    }
    return next;
}

// NPC 成长：打过勾的技能同样掷 d100，成长概率减半（另掷一次对半），幅度与主角相同；没有勾的角色不消耗随机数。
// skillValueOf(state, 名, 技能) 取当前值（含已有成长）；没有它时只清勾。
function growNpcSkills(state, random, changes, skillValueOf, aptitudeOf) {
    let characters = state.characters;
    for (const [name, character] of Object.entries(state.characters)) {
        const growth = character.skillGrowth;
        if (!growth || !Object.values(growth).some((entry) => entry && entry.marked)) continue;
        const next = {};
        for (const [skill, entry] of Object.entries(growth)) {
            if (!entry || !entry.marked) { next[skill] = entry; continue; }
            const bonus = Number(entry.bonus) || 0;
            let gained = 0;
            if (typeof skillValueOf === 'function') {
                const from = Number(skillValueOf(state, name, skill)) || 0;
                const tier = typeof aptitudeOf === 'function' ? aptitudeTier(aptitudeOf(name)) : null;
                if ((tier ? growthPasses(from, tier, random) : rollOver(from, random).passed) && random() < 0.5) {
                    const to = Math.min(Math.max(SKILL_MAX, from), from + (tier ? growthGain(tier, random) : rollDie(10, random)));
                    gained = to - from;
                    if (gained > 0) changes.push({ source: 'daily', target: name, key: skill, from, to, note: '成长' });
                }
            }
            next[skill] = { ...entry, bonus: bonus + Math.max(0, gained), marked: false };
        }
        characters = { ...characters, [name]: { ...character, skillGrowth: next } };
    }
    return characters === state.characters ? state : { ...state, characters };
}

function coolCharacters(characters, day, days, changes) {
    const next = {};
    for (const [name, character] of Object.entries(characters)) {
        const cooled = coolDown(character, day, days);
        if (cooled !== character) changes.push({ source: 'daily', target: name, key: '好感', from: character.dims.好感, to: cooled.dims.好感, note: '冷却' });
        next[name] = resetDaily(cooled, day, days);
    }
    return next;
}

// strengthRev ≥ 2 的日结算角色处理：好感冷却（离体期间与随身角色暂停，跳跃楼在场角色视作一直在场）、芥蒂淡忘、非恋爱对象欲望淡去、
// 作废超过 7 天的误会账、清每日上限。天数一次算完。ctx：{ detached, traits, nsfw, present, romanceSeen }。
// 特质（只读 hasTrait / traitScale / traitFlag）：随身与「主角在场」类特质不冷却，冷却速度与芥蒂、欲望的消退按特质倍率或停摆。
function coolCharactersRev2(characters, day, days, changes, ctx) {
    const next = {};
    const present = new Set(days > 1 && Array.isArray(ctx.present) ? ctx.present : []);
    const hereAll = new Set(Array.isArray(ctx.present) ? ctx.present : []);
    const cat = traitCatalogOf(ctx.traits, ctx.nsfw);
    const view = { characters };
    for (const [name, character] of Object.entries(characters)) {
        let current = character;
        if (present.has(name)) current = { ...current, lastSeenDay: day };
        const here = { here: hereAll.has(name) };
        // 已故：冻结全部冷却与消退（含时间跳跃），只清每日上限。
        if (hasTrait(view, cat, name, '已故')) { next[name] = resetDaily(current, day, days); continue; }
        // 长生：时间跳跃期间好感不冷却。
        const ageless = days > 1 && hasTrait(view, cat, name, '长生');
        if (!ctx.detached && !ageless && !traitFlag(view, cat, name, 'noCool', here)) {
            const cooled = coolDown(current, day, days, traitScale(view, cat, name, '好感', 'cool'));
            if (cooled !== current) changes.push({ source: 'daily', target: name, key: '好感', from: current.dims.好感, to: cooled.dims.好感, note: '冷却' });
            current = cooled;
        }
        // 芥蒂默认不随时间淡化；只有宽容、以德报怨、老好人、一笑泯恩仇四种性格会淡化。宿仇（芥蒂满过 100）与「记仇」等不消退的特质照旧停摆。
        const grudge = current.feud || traitFlag(view, cat, name, 'noFade:芥蒂') ? { change: null } : fadeGrudge(current, days, traitScale(view, cat, name, '芥蒂', 'fade'));
        if (grudge.change) { current = grudge.character; changes.push({ source: 'daily', target: name, ...grudge.change }); }
        // 欲望每天 −1：非恋爱对象降到 0，恋爱对象只降到 25（夜夜笙歌、病娇等特质照旧停摆）。
        if (!traitFlag(view, cat, name, 'noFade:欲望')) {
            const desire = fadeDesire(current, days, isRomance(current, name, ctx.romanceSeen) ? DESIRE_ROMANCE_FLOOR : 0);
            if (desire.change) { current = desire.character; changes.push({ source: 'daily', target: name, ...desire.change }); }
        }
        if (Array.isArray(current.recentHurts)) {
            const live = liveHurts(current, day, misunderstandDaysOf(view, cat, name));
            if (live.length !== current.recentHurts.length) {
                const { recentHurts, ...rest } = current;
                current = live.length ? { ...rest, recentHurts: live } : rest;
            }
        }
        next[name] = resetDaily(current, day, days);
    }
    return next;
}

// 痴迷的角色离开主角时压力上涨：每个没见到主角的日子 +5。
export const OBSESSED_STRESS = 5;
const BAR_LOG_KEYS = Object.freeze(['stamina', 'stress', 'money']);

// rev ≥ 2 的角色压力日变化：痴迷且这段时间没见到主角时上涨，否则日结算按转换后的走向回落（跳跃不回落）。
function npcStressRev2(c, bars, { stress, day, days, here = false }) {
    const absent = !here && (Number(c.lastSeenDay) || 0) < day - days;
    if (c.obsessed && absent) return shiftStress(bars, OBSESSED_STRESS * Math.max(1, days));
    return stress ? relaxStress(bars, days) : bars;
}

// 角色的生活条随日结算恢复：体力回满、压力 −10（日结算）；时间跳跃只回体力。没有 bars 的旧角色按初值，不产生改动。
// rev2：{ day, days }，压力按转换后的走向与痴迷规则处理；旧楼不传。
function recoverCharacterBars(characters, changes, note, { stress, rev2 = null }) {
    const out = {};
    for (const [name, c] of Object.entries(characters)) {
        const bars = barsOf(c);
        const next = rev2
            ? { ...npcStressRev2(c, bars, { stress, ...rev2, here: Array.isArray(rev2.present) && rev2.present.includes(name) }), stamina: Math.max(bars.stamina, 100) }
            : { ...bars, stamina: Math.max(bars.stamina, 100), ...(stress ? { stress: clamp(bars.stress - 10, 0, 100) } : {}) };
        let changed = false;
        for (const key of Object.keys(next)) {
            if (next[key] === bars[key]) continue;
            changed = true;
            // 转换状态、来源记录等附加字段只存档，不进变动记录。
            if (!rev2 || BAR_LOG_KEYS.includes(key)) changes.push(key === 'stress' && rev2 && next.stress < bars.stress ? withCalc({ source: 'daily', target: name, key, from: bars[key], to: next[key], note }, { calc: stressRelaxCalc(bars.stress, next.stress, rev2.days) }) : { source: 'daily', target: name, key, from: bars[key], to: next[key], note });
        }
        if (rev2 && Object.keys(bars).some((key) => !Object.hasOwn(next, key))) changed = true;
        out[name] = changed ? { ...c, bars: next } : c;
    }
    return out;
}

function pushBarChanges(from, to, changes, note, onlyBars = false, relaxDays = 0) {
    for (const key of Object.keys(to)) {
        if (onlyBars && !BAR_LOG_KEYS.includes(key)) continue;
        if (from[key] === to[key]) continue;
        const row = { source: 'daily', target: '主角', key, from: from[key], to: to[key], note };
        // 压力按比例回落：写明公式（D 批）。
        changes.push(key === 'stress' && relaxDays > 0 && to.stress < from.stress ? withCalc(row, { calc: stressRelaxCalc(from.stress, to.stress, relaxDays) }) : row);
    }
}

// 日结算：体力恢复（熬夜后只到 70）、压力 −10、技能成长、好感冷却、每日上限清零。
// 生命不随过夜恢复（合并计划 Q4）：只有回复标签与战斗结果改变伤势。
// rev ≥ 2：悟性（aptitudeOf）、主角离体（体力不恢复、好感冷却暂停）、随身角色不冷却（traits）、芥蒂淡忘与欲望淡去（romanceSeen 用于判恋爱对象）。
export function settleDay(state, { random, changes = [], skillValueOf, rev = 0, aptitudeOf, traits, nsfw = false, present, romanceSeen, env, statusBox } = {}) {
    const day = state.clock.day + 1;
    const { bars } = state.protagonist;
    const rev2 = Number(rev) >= 2;
    const detached = rev2 && state.protagonist.detached === true;
    // rev ≥ 2：压力按转换后的走向回落（沦陷、扭曲、蜕变不自然变化）。
    const nextBars = {
        ...(rev2 ? relaxStress(bars) : bars),
        stamina: detached ? bars.stamina : Math.min(Math.max(bars.stamina, state.clock.stayedUp || state.clock.overdrawDay === state.clock.day ? OVERDRAW_CAP : 100), statusRecoverCap(statusBox, '主角', bars.stamina)),
        ...(rev2 ? {} : { stress: clamp(bars.stress - 10, 0, 100) }),
    };
    pushBarChanges(bars, nextBars, changes, '日结算', rev2, rev2 ? 1 : 0);
    let next = withBars(state, nextBars);
    next = grow(next, random, changes, skillValueOf, rev2 ? aptitudeOf || (() => '平庸') : null, diligentOf(next, rev2, traits, nsfw));
    const cooled = rev2 ? coolCharactersRev2(next.characters, day, 1, changes, { detached, traits, nsfw, present, romanceSeen }) : coolCharacters(next.characters, day, 1, changes);
    next = { ...next, characters: recoverCharacterBars(cooled, changes, '日结算', { stress: true, rev2: rev2 ? { day, days: 1, present } : null }) };
    next = withClock(next, { day, floorsSinceDay: 0, stayedUp: false, challenges: 0, ...(state.clock.luckyUsed ? { luckyUsed: false } : {}) });
    advanceStatusBox(statusBox, day, 1, changes);
    return rev2 ? dailyTraitPass(next, { traits, nsfw, present, ...(env || {}) }, changes) : next;
}

// E1：状态压低过天体力恢复的上限（感冒、宿醉、中毒等）；只限制「恢复到哪」，不会把已有体力扣掉。无状态返回 100。
function statusRecoverCap(box, name, current) {
    const scale = box && box.cat ? statusScale(box.cat, name, 'staminaRecover') : 1;
    return Math.max(current, Math.round(100 * scale));
}

// 状态推进（B 批）：状态存在 catalog 而非账本状态里，由调用方传入持有者 { cat }；没有时不推进。天数一次算完，到期的摘下并记变动。
function advanceStatusBox(box, day, days, changes) {
    if (!box || !box.cat) return;
    const r = advanceStatuses(box.cat, day, days, { cycles: Boolean(box.cycles) });
    box.cat = r.catalog;
    changes.push(...r.changes);
}

// 成长次数累计进 protagonist.growth（D&D 资历档由它推出，v2 §4.2）。
const diligentOf = (state, rev2, traits, nsfw) => rev2 && hasTrait(state, traitCatalogOf(traits, nsfw), '主角', '努力家');

function grow(state, random, changes, skillValueOf, aptitudeOf, diligent = false) {
    const before = changes.length;
    const next = withSkills(state, growSkills(state.protagonist.skills, random, changes, typeof aptitudeOf === 'function' ? aptitudeTier(aptitudeOf('主角')) : null, diligent));
    const gained = changes.slice(before).filter((c) => c.note === '成长').length;
    const hero = gained ? { ...next, protagonist: { ...next.protagonist, growth: (Number(next.protagonist.growth) || 0) + gained } } : next;
    return growNpcSkills(hero, random, changes, skillValueOf, aptitudeOf);
}

// 入睡回体力（已捕捉日期的聊天）：睡觉标签只恢复体力，不推进日期、不做日结算；熬夜后只到 70。
export function settleRest(state, { changes = [], frozen = false } = {}) {
    if (frozen) return state;
    const { bars } = state.protagonist;
    const stamina = Math.max(bars.stamina, state.clock.stayedUp || state.clock.overdrawDay === state.clock.day ? OVERDRAW_CAP : 100);
    if (stamina === bars.stamina && !state.clock.stayedUp) return state;
    pushBarChanges(bars, { ...bars, stamina }, changes, '入睡');
    return withClock(withBars(state, { ...bars, stamina }), { stayedUp: false });
}

// 时间跳跃：体力回满；冷却最多扣到阶段下限；成长只掷一次。天数已在解析时限到 30 天。
// rev ≥ 2：天数上限 3650（解析阶段决定），冷却、受伤天数、芥蒂淡忘、欲望淡去都按天数一次算完；跳跃楼在场角色（present）不冷却。
export function settleSkip(state, days, { random, changes = [], skillValueOf, rev = 0, aptitudeOf, traits, nsfw = false, present, romanceSeen, env, statusBox } = {}) {
    const day = state.clock.day + days;
    const { bars } = state.protagonist;
    const rev2 = Number(rev) >= 2;
    const detached = rev2 && state.protagonist.detached === true;
    // rev ≥ 2：时间跳跃也减压（按天数复利；跳过 7 天以上降到 20，已低于不动）；主角离体时压力照旧。
    const nextBars = { ...(rev2 ? relaxStress(bars, days) : bars), stamina: detached ? bars.stamina : 100 };
    pushBarChanges(bars, nextBars, changes, `跳过${days}天`, rev2, rev2 ? days : 0);
    let next = withBars(state, nextBars);
    next = grow(next, random, changes, skillValueOf, rev2 ? aptitudeOf || (() => '平庸') : null, diligentOf(next, rev2, traits, nsfw));
    const cooled = rev2 ? coolCharactersRev2(next.characters, day, days, changes, { detached, traits, nsfw, present, romanceSeen }) : coolCharacters(next.characters, day, days, changes);
    next = { ...next, characters: recoverCharacterBars(cooled, changes, `跳过${days}天`, { stress: rev2, rev2: rev2 ? { day, days, present } : null }) };
    advanceStatusBox(statusBox, day, days, changes);
    return withClock(next, { day, floorsSinceDay: 0, stayedUp: false, challenges: 0, ...(state.clock.luckyUsed ? { luckyUsed: false } : {}) });
}

// 软跨天：连续 30 楼没有跨天时只清零每日上限，不恢复、不成长，天数不变（易错点 D2）。
export function settleSoftDay(state) {
    const { day } = state.clock;
    const characters = Object.fromEntries(Object.entries(state.characters).map(([name, c]) => [name, resetDaily(c, day, 0)]));
    return withClock({ ...state, characters }, { floorsSinceDay: 0, challenges: 0 });
}
