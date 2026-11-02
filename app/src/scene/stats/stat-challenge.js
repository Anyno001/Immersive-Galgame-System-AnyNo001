// 日常挑战数值结算（设计稿 §3.4）：结局与代价类别查表，压力、体力按难度档增减，胜利压力下降并标记领域技能成长。
// 第一阶段只接压力、体力；金钱与关系代价降级为压力并记诊断。由战报楼合成的 challenge 指令驱动，不读 AI 标签里的数。
import { STAMINA_DELTA, STRESS_DELTA } from './stat-bars.js';
import { DEFAULT_SPECIAL_SKILLS, clamp, withBars, withClock, withSkills } from './stat-state.js';
import { CHALLENGE_ENABLED_STAKES } from '../challenge-directives.js';

export const CHALLENGE_STRESS_STEPS = Object.freeze({ 轻松: 1, 普通: 2, 艰难: 3 });
export const CHALLENGE_STAMINA_STEPS = Object.freeze({ 轻松: ['中'], 普通: ['重'], 艰难: ['重', '熬夜'] });
const OUTCOMES = Object.freeze(['圆满', '勉强', '失败', '放弃']);

// 放弃的代价为失败的一半，向远离零的方向取整。
const half = (delta) => Math.sign(delta) * Math.ceil(Math.abs(delta) / 2);

function shiftBar(bars, key, delta, changes, note) {
    const from = Number(bars[key]) || 0;
    const to = clamp(from + delta, 0, 100);
    if (to === from) return bars;
    changes.push({ source: 'challenge', target: '主角', key, from, to, note });
    return { ...bars, [key]: to };
}

// 该难度档、该代价类别下的完整失败代价：{ stress, stamina } 的增减量。
export function challengeCost(tier, stake) {
    const steps = Object.hasOwn(CHALLENGE_STRESS_STEPS, tier) ? tier : '普通';
    if (stake === '体力') return { stress: 0, stamina: CHALLENGE_STAMINA_STEPS[steps].reduce((sum, word) => sum + STAMINA_DELTA[word], 0) };
    return { stress: STRESS_DELTA.上升 * CHALLENGE_STRESS_STEPS[steps], stamina: 0 };
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

export function applyChallenge(state, directive, ctx) {
    if (!OUTCOMES.includes(directive.outcome)) return state;
    if (directive.reportId && state.clock.lastChallengeReport === directive.reportId) return state;
    let stake = directive.stake;
    if (!CHALLENGE_ENABLED_STAKES.includes(stake)) {
        ctx.diagnostics.push({ code: 'challenge-stake-degraded', from: stake, to: '压力' });
        stake = '压力';
    }
    const note = `挑战${directive.outcome}`;
    const won = directive.outcome === '圆满' || directive.outcome === '勉强';
    let bars = state.protagonist.bars;
    if (won) {
        bars = shiftBar(bars, 'stress', STRESS_DELTA.下降, ctx.changes, note);
    } else {
        const cost = challengeCost(directive.tier, stake);
        const scale = directive.outcome === '放弃' ? half : (delta) => delta;
        bars = shiftBar(bars, 'stress', scale(cost.stress), ctx.changes, note);
        bars = shiftBar(bars, 'stamina', scale(cost.stamina), ctx.changes, note);
    }
    let next = withBars(state, bars);
    if (won) next = markSkill(next, domainSkill(next.protagonist.skills, directive.domain));
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
