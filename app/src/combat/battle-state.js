export const LOW_HP_RATIO = 0.5;

export const opposite = (side) => (side === 'ally' ? 'enemy' : 'ally');

export function livingIds(state, side) {
    return state.order.filter((id) => state.units[id].side === side && state.units[id].alive);
}

export function weakestId(state, side) {
    let best = null;
    for (const id of livingIds(state, side)) {
        const unit = state.units[id];
        const current = best && state.units[best];
        if (!current || unit.hp + unit.block < current.hp + current.block) best = id;
    }
    return best;
}

export function lowestRatioId(state, side) {
    let best = null;
    let ratio = Infinity;
    for (const id of livingIds(state, side)) {
        const unit = state.units[id];
        const r = unit.hp / unit.maxHp;
        if (r < ratio) { ratio = r; best = id; }
    }
    return best;
}

export function cardView(state, inst) {
    const ref = state.cards[inst];
    const base = ref && state.catalog[ref.owner]?.[ref.cardId];
    if (!base) return null;
    const { upgraded, ...rest } = base;
    const view = !ref.upgraded || !upgraded
        ? { ...rest, inst, upgraded: false }
        : { ...rest, inst, upgraded: true, cost: upgraded.cost ?? base.cost, effects: upgraded.effects ?? base.effects };
    // 本回合手牌费用修正（觉醒「决意」等）：数字费用下调、最低 0，X 费不受影响；baseCost 只在修正生效时出现。
    const mod = state.units?.[ref.owner]?.handCost || 0;
    if (!mod || typeof view.cost !== 'number') return view;
    return { ...view, cost: Math.max(0, view.cost + mod), baseCost: view.cost };
}

export function canAfford(card, energy) {
    return card.cost === 'X' ? energy > 0 : card.cost <= energy;
}

export function effectsNeedTarget(effects) {
    return (effects || []).some((e) => e.target === 'enemy'
        || (e.op === 'damage' && !e.target)
        || (e.op === 'conditional' && (e.when?.kind === 'target-has' || effectsNeedTarget(e.then))));
}

// 「为一名队友」类效果：不需要敌方目标时，玩家可以指定一名存活的己方单位；不指定时引擎仍按生命比例最低者结算（兼容旧记录）。
export function effectsPickAlly(effects) {
    return (effects || []).some((e) => e.target === 'ally' || (e.op === 'conditional' && effectsPickAlly(e.then)));
}

export function computeDamage(attacker, target, base, strengthScale = 1) {
    let amount = base;
    if (attacker) {
        amount = Math.round(amount * (attacker.damageScale || 1)) + (attacker.statuses.strength || 0) * (strengthScale || 1);
        if (attacker.statuses.weak > 0) amount = Math.floor(amount * 0.75);
    }
    if (target?.statuses.vulnerable > 0) amount = Math.floor(amount * 1.5);
    return Math.max(0, amount);
}

export function computeBlock(actor, base) {
    return Math.max(0, base + (actor?.statuses.dexterity || 0));
}

export function conditionHolds(state, actor, when, targetId) {
    if (when?.kind === 'target-has') return (state.units[targetId]?.statuses[when.value] || 0) > 0;
    if (when?.kind === 'self-hp-below') return actor.hp * 100 < actor.maxHp * when.value;
    if (when?.kind === 'cards-played-gte') return actor.cardsPlayed >= when.value;
    return false;
}

export function estimateDamage(state, actor, target, effects, primaryId) {
    if (!target) return 0;
    let total = 0;
    for (const e of effects || []) {
        if (e.op === 'damage') {
            const spec = e.target || 'enemy';
            const hitsTarget = spec === 'all-enemies' || (spec === 'enemy' && primaryId === target.id);
            if (hitsTarget) total += (e.hits || 1) * computeDamage(actor, target, e.amount, e.strengthScale);
        } else if (e.op === 'damage-from-block') {
            const spec = e.target || 'enemy';
            const hitsTarget = spec === 'all-enemies' || (spec === 'enemy' && primaryId === target.id);
            if (hitsTarget && actor.block > 0) total += computeDamage(actor, target, actor.block);
        } else if (e.op === 'conditional' && conditionHolds(state, actor, e.when, primaryId)) {
            total += estimateDamage(state, actor, target, e.then, primaryId);
        }
    }
    return total;
}

export function estimateBlock(actor, effects) {
    return (effects || []).reduce((sum, e) => (e.op === 'block' ? sum + computeBlock(actor, e.amount) : sum), 0);
}

export function describeIntent(state, unitId) {
    const unit = state.units[unitId];
    const intent = state.intents?.[unitId];
    const skill = intent && unit?.alive ? unit.skills.find((s) => s.id === intent.skillId) : null;
    if (!skill) return null;
    const target = state.units[intent.targetId] || state.units[state.controlledId];
    return {
        skillId: skill.id,
        name: skill.name,
        intent: skill.intent,
        targetId: intent.targetId ?? null,
        damage: estimateDamage(state, unit, target, skill.effects, intent.targetId),
    };
}
