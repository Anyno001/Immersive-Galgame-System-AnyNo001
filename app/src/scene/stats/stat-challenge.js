// 日常挑战数值结算（设计稿 §3.4）：结局与代价类别查表，压力、体力、金钱、好感按难度档增减，胜利压力下降并标记领域技能成长。
// 由战报楼合成的 challenge 指令驱动，不读 AI 标签里的数；金钱按合并余额判断，关系走好感维度并受单楼上限约束。
import { DEFAULT_MONEY_TABLE, STAMINA_DELTA, STRESS_DELTA, walletBalance } from './stat-bars.js';
import { DEFAULT_SPECIAL_SKILLS, clamp, withBars, withCharacter, withClock, withSkills } from './stat-state.js';
import { FLOOR_GAIN_MAX, applyDim } from './stat-favor.js';
import { applyKeyEvent } from './stat-favor-events.js';
import { extraGatesOf } from './stat-traits.js';
import { PROTAGONIST, createEngine, resolveCheck } from './stat-engine.js';
import { DEFEAT_MONEY_LOSS } from './stat-battle.js';
import { CHALLENGE_ENABLED_STAKES } from '../challenge-directives.js';
import { INTIMATE_STOP, INTIMATE_TENSION_START, isRapportWin, markForEnding } from '../intimate-duel.js';

export const CHALLENGE_STRESS_STEPS = Object.freeze({ 轻松: 1, 普通: 2, 艰难: 3 });
export const CHALLENGE_STAMINA_STEPS = Object.freeze({ 轻松: ['中'], 普通: ['重'], 艰难: ['重', '熬夜'] });
export const CHALLENGE_MONEY_TIERS = Object.freeze({ 轻松: '少量', 普通: '普通', 艰难: '昂贵' });
export const CHALLENGE_RELATION_STEPS = Object.freeze({ 轻松: 1, 普通: 2, 艰难: 3 });
export const CHALLENGE_RECONCILE_EVENT = '和解';
const OUTCOMES = Object.freeze(['圆满', '勉强', '失败', '放弃']);

// 放弃的代价为失败的一半，向远离零的方向取整。
const half = (delta) => Math.sign(delta) * Math.ceil(Math.abs(delta) / 2);
const tierOf = (tier) => (Object.hasOwn(CHALLENGE_STRESS_STEPS, tier) ? tier : '普通');

function shiftBar(bars, key, delta, changes, note) {
    const from = Number(bars[key]) || 0;
    const to = clamp(from + delta, 0, 100);
    if (to === from) return bars;
    changes.push({ source: 'challenge', target: '主角', key, from, to, note });
    return { ...bars, [key]: to };
}

// 金钱不设下限：合并余额里战斗积分垫付的部分会让数值侧金钱为负。
function shiftMoney(bars, delta, changes, note) {
    if (!delta) return bars;
    const from = Number(bars.money) || 0;
    changes.push({ source: 'challenge', target: '主角', key: 'money', from, to: from + delta, note });
    return { ...bars, money: from + delta };
}

// 该难度档、该代价类别下的完整失败代价：压力与体力的增减量，金钱档位词，好感扣减。
export function challengeCost(tier, stake) {
    const steps = tierOf(tier);
    if (stake === '体力') return { stress: 0, stamina: CHALLENGE_STAMINA_STEPS[steps].reduce((sum, word) => sum + STAMINA_DELTA[word], 0) };
    if (stake === '金钱') return { stress: 0, stamina: 0, money: CHALLENGE_MONEY_TIERS[steps] };
    if (stake === '关系') return { stress: 0, stamina: 0, favor: Math.min(FLOOR_GAIN_MAX, CHALLENGE_RELATION_STEPS[steps]) };
    return { stress: STRESS_DELTA.上升 * CHALLENGE_STRESS_STEPS[steps], stamina: 0 };
}

// 失败扣钱：按难度档查金钱表，放弃减半，且不超过合并余额的两成。
export function challengeMoneyLoss(bars, tier, outcome, { moneyTable = DEFAULT_MONEY_TABLE, walletExtra = 0 } = {}) {
    const amount = Number(moneyTable[CHALLENGE_MONEY_TIERS[tierOf(tier)]]) || 0;
    const owed = outcome === '放弃' ? Math.ceil(amount / 2) : amount;
    const cap = Math.floor(Math.max(0, walletBalance(bars, walletExtra)) * DEFEAT_MONEY_LOSS);
    return Math.min(owed, cap);
}

function domainSkill(skills, domain) {
    if (domain && skills[domain]) return domain;
    let best = null;
    for (const name of DEFAULT_SPECIAL_SKILLS) {
        const value = Number(skills[name]?.value);
        if (Number.isFinite(value) && (!best || value > best.value)) best = { name, value };
    }
    return best ? best.name : null;
}

function markSkill(state, name) {
    const skill = name && state.protagonist.skills[name];
    return skill && !skill.marked ? withSkills(state, { ...state.protagonist.skills, [name]: { ...skill, marked: true } }) : state;
}

// 对方必须是已登记的人物；调用方给了在场名单（ctx.present）时还要在场。
function counterpartIn(state, name, ctx) {
    if (!name || !Object.hasOwn(state.characters, name)) return null;
    return Array.isArray(ctx.present) && !ctx.present.includes(name) ? null : name;
}

function loseFavor(state, name, delta, ctx, note) {
    const result = applyDim(state.characters[name], '好感', -delta, { random: ctx.random, floorRoom: FLOOR_GAIN_MAX });
    if (result.change && result.change.to !== result.change.from) ctx.changes.push({ source: 'challenge', target: name, key: '好感', from: result.change.from, to: result.change.to, note });
    return withCharacter(state, name, { ...result.character, lastSeenDay: state.clock.day });
}

// 胜利后的和解走关键事件：好感停在关口时用魅力检定突破，不直接加数字。
function reconcile(state, name, ctx) {
    const engine = ctx.engine || createEngine();
    const roll = () => resolveCheck(engine, state, { actor: PROTAGONIST, skill: '魅力', toward: name }, ctx.random);
    const { character, result } = applyKeyEvent(state.characters[name], CHALLENGE_RECONCILE_EVENT, { roll, random: ctx.random, extraGates: ctx.rev >= 2 ? extraGatesOf(state, ctx.traitCat, name) : [] });
    if (result.success) ctx.changes.push({ source: 'challenge', target: name, key: '好感', from: result.gate, to: result.gate + 1, note: `${CHALLENGE_RECONCILE_EVENT}突破` });
    if (result.gate !== null) ctx.events.push({ ...result, target: name });
    return withCharacter(state, name, character);
}

export function intimateProfile(character) {
    const source = character && character.intimate && typeof character.intimate === 'object' ? character.intimate : {};
    return { mark: source.mark || null, tension: Number.isFinite(Number(source.tension)) ? Math.max(0, Math.floor(Number(source.tension))) : INTIMATE_TENSION_START };
}

export function applyIntimate(state, directive, ctx) {
    const ending = directive.ending;
    let next = state;
    if (ending !== INTIMATE_STOP) {
        let bars = state.protagonist.bars;
        if (ending !== '草草收场') bars = shiftBar(bars, 'stress', STRESS_DELTA.下降, ctx.changes, `亲密${ending}`);
        next = withBars(next, bars);
        const name = counterpartIn(next, directive.counterpart, ctx);
        if (name) {
            const profile = intimateProfile(next.characters[name]);
            const mark = markForEnding(ending);
            const intimate = {
                mark: mark || (directive.mechanic === '主导' ? null : profile.mark),
                tension: directive.mechanic === '合拍' && isRapportWin(ending) ? Math.max(0, profile.tension - 1) : profile.tension,
            };
            next = withCharacter(next, name, { ...next.characters[name], intimate });
        } else if (directive.counterpart) ctx.diagnostics.push({ code: 'intimate-counterpart-unknown', name: directive.counterpart });
    }
    next = withClock(next, { lastChallengeReport: directive.reportId || null });
    ctx.events.push({ kind: 'intimate', ending, mechanic: directive.mechanic });
    return next;
}

export function applyChallenge(state, directive, ctx) {
    if (!OUTCOMES.includes(directive.outcome)) return state;
    if (directive.reportId && state.clock.lastChallengeReport === directive.reportId) return state;
    if (directive.ending) return applyIntimate(state, directive, ctx);
    let stake = CHALLENGE_ENABLED_STAKES.includes(directive.stake) ? directive.stake : '压力';
    const counterpart = stake === '关系' ? counterpartIn(state, directive.counterpart, ctx) : null;
    if (stake === '关系' && !counterpart) stake = '压力';
    if (stake !== directive.stake) ctx.diagnostics.push({ code: 'challenge-stake-degraded', from: directive.stake, to: stake });
    const note = `挑战${directive.outcome}`;
    const won = directive.outcome === '圆满' || directive.outcome === '勉强';
    let bars = state.protagonist.bars;
    let next = state;
    if (won) {
        bars = shiftBar(bars, 'stress', STRESS_DELTA.下降, ctx.changes, note);
        const table = ctx.moneyTable || DEFAULT_MONEY_TABLE;
        if (directive.outcome === '圆满' && directive.prize && Object.hasOwn(table, directive.prize)) bars = shiftMoney(bars, Number(table[directive.prize]) || 0, ctx.changes, `${note}奖金`);
    } else {
        const cost = challengeCost(directive.tier, stake);
        const scale = directive.outcome === '放弃' ? half : (delta) => delta;
        bars = shiftBar(bars, 'stress', scale(cost.stress), ctx.changes, note);
        bars = shiftBar(bars, 'stamina', scale(cost.stamina), ctx.changes, note);
        if (stake === '金钱') bars = shiftMoney(bars, -challengeMoneyLoss(bars, directive.tier, directive.outcome, { moneyTable: ctx.moneyTable, walletExtra: ctx.walletExtra }), ctx.changes, note);
        if (stake === '关系') next = loseFavor(next, counterpart, directive.outcome === '放弃' ? Math.ceil(cost.favor / 2) : cost.favor, ctx, note);
    }
    next = withBars(next, bars);
    if (won) next = markSkill(next, domainSkill(next.protagonist.skills, directive.domain));
    if (directive.outcome === '圆满' && stake === '关系') next = reconcile(next, counterpart, ctx);
    next = withClock(next, {
        challenges: (Number(state.clock.challenges) || 0) + 1,
        lastChallengeFloor: Number.isInteger(directive.floor) ? directive.floor : state.clock.lastChallengeFloor ?? null,
        lastChallengeReport: directive.reportId || null,
    });
    ctx.events.push({ kind: 'challenge', outcome: directive.outcome, tier: directive.tier, stake });
    ctx.flags.challenge = { outcome: directive.outcome, tier: directive.tier, stake };
    return next;
}

// 一楼最多结算一场挑战。
export function settleChallenge(state, directives, ctx) {
    const directive = directives.find((d) => d.kind === 'challenge');
    return directive ? applyChallenge(state, directive, ctx) : state;
}
