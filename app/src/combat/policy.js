// 电脑侧决策：同伴（AI 控制的卡牌单位）怎么出牌、敌人下回合出什么技能、「选牌」类效果的自动选择。
// 纯函数，不改 state。随机数由调用方给（chooseSkillIntent 的 roll）。
import { canPlay, cardView, effectsNeedTarget, estimateBlock, estimateDamage, livingIds, opposite, weakestId } from './battle-state.js';
import { estimateEffectsValue } from './rules.js';

// 前几个回合优先打出能力牌。
export const POWER_TURNS = 2;
// 同一技能连续出现达到这个次数后，下次尽量换一个。
export const MAX_SKILL_REPEAT = 2;

// X 费牌按全部能量计费，并按能量次数结算；其余牌结算一次。规则 v5 的重演牌再乘 1 + 重演次数。
const spentCost = (card, energy) => (card.cost === 'X' ? energy : card.cost);
const runTimes = (card, energy, rulesVersion) => (card.cost === 'X' ? energy : 1) * (rulesVersion >= 5 && Number.isInteger(card.replay) && card.replay > 0 ? 1 + card.replay : 1);

// unitId 这一方的敌人按已定意图，预计这回合总共能打出多少伤害。
export function incomingDamage(state, unitId) {
    const unit = state.units[unitId];
    let total = 0;
    for (const foeId of livingIds(state, opposite(unit.side))) {
        const intent = state.intents?.[foeId];
        const skill = intent && state.units[foeId].skills?.find((item) => item.id === intent.skillId);
        if (skill) total += estimateDamage(state, state.units[foeId], unit, skill.effects, intent.targetId);
    }
    return total;
}

// 取评分最高且大于 0 的候选；全部不超过 0 返回 null。并列取先出现的。
function bestBy(items, score) {
    let best = null;
    let top = 0;
    for (const item of items) {
        const value = score(item);
        if (value > top) {
            best = item;
            top = value;
        }
    }
    return best;
}

// 把一张牌包成出牌动作；需要目标时没有目标则放弃（null）。
function playFor(state, unit, card, aimId) {
    if (!effectsNeedTarget(card.effects)) return { inst: card.inst };
    const targetId = aimId ?? weakestId(state, opposite(unit.side));
    return targetId ? { inst: card.inst, targetId } : null;
}

// 评估「重复上一张」「重放下一张」时，只保留此刻真的有对象可作用的效果。
function usableEffects(state, unit, card) {
    const others = (state.piles[unit.id]?.hand || []).filter((inst) => inst !== card.inst).map((inst) => cardView(state, inst)).filter(Boolean);
    return card.effects.filter((effect) => {
        if (effect.op === 'repeat-last') return !!unit.lastPlayed;
        if (effect.op === 'replay-next') return others.some((other) => !other.unplayable && (!effect.cardType || other.type === effect.cardType));
        return true;
    });
}

// 同伴这一步出哪张牌；不出了返回 null。优先级：
// 1. 来袭伤害超过当前格挡时，选单位费用收益最高的格挡牌。
// 2. 能斩杀某个敌人时，选费用最低的那张。
// 3. 前几个回合先打能力牌。
// 4. 对最弱敌人单位费用伤害最高的牌。
// 5. 规则版本 4 起，再按效果价值估算兜底；更早的版本直接出第一张。
export function chooseAllyPlay(state, unitId) {
    const unit = state.units[unitId];
    if (!unit?.alive || unit.kind !== 'deck' || state.outcome) return null;
    const foes = livingIds(state, opposite(unit.side));
    // 规则 v5 出牌限制（E18 等）与 validatePlay / legalActions 共用 canPlay；v3/v4 与 canAfford 相同。
    const playable = (state.piles[unitId]?.hand || []).map((inst) => cardView(state, inst)).filter((card) => card && canPlay(state, unit, card));
    if (!foes.length || !playable.length) return null;
    const perCost = (card, value) => (value * runTimes(card, unit.energy, state.rulesVersion)) / Math.max(0.5, spentCost(card, unit.energy));

    if (incomingDamage(state, unitId) > unit.block) {
        const guard = bestBy(playable, (card) => perCost(card, estimateBlock(unit, card.effects, state.rulesVersion, 'card')));
        if (guard) return playFor(state, unit, guard);
    }

    let kill = null;
    for (const card of playable) {
        const cost = spentCost(card, unit.energy);
        for (const foeId of foes) {
            const foe = state.units[foeId];
            const damage = estimateDamage(state, unit, foe, card.effects, foeId, card) * runTimes(card, unit.energy, state.rulesVersion);
            if (damage > 0 && damage >= foe.hp + foe.block && (!kill || cost < kill.cost)) kill = { card, id: foeId, cost };
        }
    }
    if (kill) return playFor(state, unit, kill.card, kill.id);

    const power = state.turn <= POWER_TURNS && playable.find((card) => card.type === 'power');
    if (power) return playFor(state, unit, power);

    const weakest = weakestId(state, opposite(unit.side));
    const weakestUnit = state.units[weakest];
    const strike = bestBy(playable, (card) => perCost(card, estimateDamage(state, unit, weakestUnit, card.effects, weakest, card)));
    if (strike) return playFor(state, unit, strike, weakest);

    if (!(state.rulesVersion >= 4)) return playFor(state, unit, playable[0], weakest);
    const valued = bestBy(playable, (card) => perCost(card, estimateEffectsValue(usableEffects(state, unit, card))));
    return valued ? playFor(state, unit, valued, weakest) : null;
}

// 「选牌」类效果的自动挑选：弃牌挑价值最低的，其他挑价值最高的；价值相同取手牌里靠前的。
export function pickCards(state, insts, count, mode) {
    const valueOf = (inst) => {
        const card = cardView(state, inst);
        if (!card) return 0;
        const value = card.unplayable ? -5 : estimateEffectsValue(card.effects);
        return mode === 'discard' && card.onDiscard ? value - estimateEffectsValue(card.onDiscard) : value;
    };
    return insts
        .map((inst, index) => ({ inst, index, value: valueOf(inst) }))
        .sort((a, b) => (mode === 'discard' ? a.value - b.value : b.value - a.value) || a.index - b.index)
        .slice(0, count)
        .map((item) => item.inst);
}

// 最近连续重复使用的技能 id（不足 MAX_SKILL_REPEAT 次或不全相同返回 null）。
function repeatedSkill(history) {
    if (history.length < MAX_SKILL_REPEAT) return null;
    const recent = history.slice(-MAX_SKILL_REPEAT);
    return recent.every((id) => id === recent[0]) ? recent[0] : null;
}

// 敌人下回合的意图：按权重随机（roll 取 0~1），避开冷却中的技能与连续重复的技能，大招可用时必出。
export function chooseSkillIntent(state, unitId, roll) {
    const unit = state.units[unitId];
    if (!unit?.alive || !unit.skills?.length) return null;
    const cooldowns = state.cooldowns?.[unitId] || {};
    const repeated = repeatedSkill(state.history?.[unitId] || []);
    const ready = unit.skills.filter((skill) => !(cooldowns[skill.id] > 0));
    const ultimate = ready.find((skill) => skill.ultimate === true);
    const varied = ready.filter((skill) => skill.id !== repeated);
    const pool = varied.length ? varied : ready.length ? ready : unit.skills;
    const weightOf = (skill) => skill.weight || 1;
    const totalWeight = pool.reduce((sum, skill) => sum + weightOf(skill), 0);
    let remaining = Math.min(0.999999, Math.max(0, Number(roll) || 0)) * totalWeight;
    let chosen = pool[pool.length - 1];
    for (const skill of pool) {
        remaining -= weightOf(skill);
        if (remaining < 0) {
            chosen = skill;
            break;
        }
    }
    if (ultimate) chosen = ultimate;
    const targetId = effectsNeedTarget(chosen.effects) ? weakestId(state, opposite(unit.side)) : null;
    return { skillId: chosen.id, targetId };
}
