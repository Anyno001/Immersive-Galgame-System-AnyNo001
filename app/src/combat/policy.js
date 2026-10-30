import {
    canAfford, cardView, effectsNeedTarget, estimateBlock, estimateDamage, livingIds, opposite, weakestId,
} from './battle-state.js';
import { estimateEffectsValue } from './rules.js';

export const POWER_TURNS = 2;
export const MAX_SKILL_REPEAT = 2;

const costOf = (card, energy) => (card.cost === 'X' ? energy : card.cost);
const repeatOf = (card, energy) => (card.cost === 'X' ? energy : 1);

export function incomingDamage(state, unitId) {
    const unit = state.units[unitId];
    let total = 0;
    for (const id of livingIds(state, opposite(unit.side))) {
        const intent = state.intents?.[id];
        const skill = intent && state.units[id].skills?.find((k) => k.id === intent.skillId);
        if (skill) total += estimateDamage(state, state.units[id], unit, skill.effects, intent.targetId);
    }
    return total;
}

function best(cards, score) {
    let pick = null;
    let top = 0;
    for (const card of cards) {
        const value = score(card);
        if (value > top) { pick = card; top = value; }
    }
    return pick;
}

function play(state, unit, card, targetId) {
    if (!effectsNeedTarget(card.effects)) return { inst: card.inst };
    const id = targetId ?? weakestId(state, opposite(unit.side));
    return id ? { inst: card.inst, targetId: id } : null;
}

// 此刻会落空的效果不计价：本回合还没打过牌时的「重复上一张」，手里没有可接的牌时的「下一张多结算」。
function liveEffects(state, unit, card) {
    const rest = (state.piles[unit.id]?.hand || []).filter((i) => i !== card.inst).map((i) => cardView(state, i)).filter(Boolean);
    return card.effects.filter((e) => {
        if (e.op === 'repeat-last') return Boolean(unit.lastPlayed);
        if (e.op === 'replay-next') return rest.some((c) => !c.unplayable && (!e.cardType || c.type === e.cardType));
        return true;
    });
}

export function chooseAllyPlay(state, unitId) {
    const unit = state.units[unitId];
    if (!unit?.alive || unit.kind !== 'deck' || state.outcome) return null;
    const foes = livingIds(state, opposite(unit.side));
    const cards = (state.piles[unitId]?.hand || [])
        .map((inst) => cardView(state, inst))
        .filter((card) => card && canAfford(card, unit.energy));
    if (!foes.length || !cards.length) return null;
    const perCost = (card, value) => (value * repeatOf(card, unit.energy)) / Math.max(0.5, costOf(card, unit.energy));
    if (incomingDamage(state, unitId) > unit.block) {
        const guard = best(cards, (card) => perCost(card, estimateBlock(unit, card.effects)));
        if (guard) return play(state, unit, guard);
    }
    let kill = null;
    for (const card of cards) {
        const cost = costOf(card, unit.energy);
        for (const id of foes) {
            const foe = state.units[id];
            const damage = estimateDamage(state, unit, foe, card.effects, id) * repeatOf(card, unit.energy);
            if (damage > 0 && damage >= foe.hp + foe.block && (!kill || cost < kill.cost)) kill = { card, id, cost };
        }
    }
    if (kill) return play(state, unit, kill.card, kill.id);
    const power = state.turn <= POWER_TURNS && cards.find((card) => card.type === 'power');
    if (power) return play(state, unit, power);
    const targetId = weakestId(state, opposite(unit.side));
    const target = state.units[targetId];
    const attack = best(cards, (card) => perCost(card, estimateDamage(state, unit, target, card.effects, targetId)));
    if (attack) return play(state, unit, attack, targetId);
    // v3 战斗（含在 v4 引擎上重放的 v3 记录）保持按手牌顺序回退，重放结果不变。
    if (!(state.rulesVersion >= 4)) return play(state, unit, cards[0], targetId);
    // v4：没有伤害牌时按效果估值 / 费用挑牌；没有值得打的牌就结束回合，不空耗能量。
    const useful = best(cards, (card) => perCost(card, estimateEffectsValue(liveEffects(state, unit, card))));
    return useful ? play(state, unit, useful, targetId) : null;
}

// 自动选牌（托管角色、重复结算等不能暂停的场合）：弃牌先弃估值最低的（不能打出的、带被弃时效果的优先），复制与减费取估值最高的；同值按手牌顺序。
export function pickCards(state, options, count, purpose) {
    const score = (inst) => {
        const card = cardView(state, inst);
        if (!card) return 0;
        const v = card.unplayable ? -5 : estimateEffectsValue(card.effects);
        return purpose === 'discard' && card.onDiscard ? v - estimateEffectsValue(card.onDiscard) : v;
    };
    const ranked = options.map((inst, i) => ({ inst, i, v: score(inst) }))
        .sort((a, b) => (purpose === 'discard' ? a.v - b.v : b.v - a.v) || a.i - b.i);
    return ranked.slice(0, count).map((r) => r.inst);
}

function repeatedSkill(recent) {
    if (recent.length < MAX_SKILL_REPEAT) return null;
    const tail = recent.slice(-MAX_SKILL_REPEAT);
    return tail.every((id) => id === tail[0]) ? tail[0] : null;
}

export function chooseSkillIntent(state, unitId, roll) {
    const unit = state.units[unitId];
    if (!unit?.alive || !unit.skills?.length) return null;
    const cooldowns = state.cooldowns?.[unitId] || {};
    const repeated = repeatedSkill(state.history?.[unitId] || []);
    const ready = unit.skills.filter((skill) => !(cooldowns[skill.id] > 0));
    // 强度档绝招：冷却结束即优先使用；旧战斗的技能不带 ultimate 标记，行为不变（roll 仍照常消耗，重放确定）。
    const ultimate = ready.find((skill) => skill.ultimate === true);
    const fresh = ready.filter((skill) => skill.id !== repeated);
    const pool = fresh.length ? fresh : (ready.length ? ready : unit.skills);
    const weightOf = (skill) => skill.weight || 1;
    const total = pool.reduce((sum, skill) => sum + weightOf(skill), 0);
    let pick = Math.min(0.999999, Math.max(0, Number(roll) || 0)) * total;
    let chosen = pool[pool.length - 1];
    for (const skill of pool) {
        pick -= weightOf(skill);
        if (pick < 0) { chosen = skill; break; }
    }
    if (ultimate) chosen = ultimate;
    const targetId = effectsNeedTarget(chosen.effects) ? weakestId(state, opposite(unit.side)) : null;
    return { skillId: chosen.id, targetId };
}
