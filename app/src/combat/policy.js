import {
    canAfford, cardView, effectsNeedTarget, estimateBlock, estimateDamage, livingIds, opposite, weakestId,
} from './battle-state.js';

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
    return play(state, unit, attack || cards[0], targetId);
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
    const targetId = effectsNeedTarget(chosen.effects) ? weakestId(state, opposite(unit.side)) : null;
    return { skillId: chosen.id, targetId };
}
