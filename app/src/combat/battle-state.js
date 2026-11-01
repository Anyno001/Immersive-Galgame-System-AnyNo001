// 战斗状态只读查询：存活单位、目标挑选、牌面视图、伤害/格挡估算、意图描述。
// 这里的函数都不修改 state，引擎与出牌策略共用。行为与 v0.39.0 一致。

export const LOW_HP_RATIO = 0.5;

export const opposite = (side) => (side === 'ally' ? 'enemy' : 'ally');

// 某一方还活着的单位 id（按出手顺序）。
export function livingIds(state, side) {
    return state.order.filter((id) => state.units[id].side === side && state.units[id].alive);
}

// hp+格挡最低的存活单位；并列时取先出现的。
export function weakestId(state, side) {
    let best = null;
    for (const id of livingIds(state, side)) {
        const unit = state.units[id];
        const current = best && state.units[best];
        if (!current || unit.hp + unit.block < current.hp + current.block) best = id;
    }
    return best;
}

// 血量比例最低的存活单位。
export function lowestRatioId(state, side) {
    let best = null;
    let lowest = Infinity;
    for (const id of livingIds(state, side)) {
        const unit = state.units[id];
        const ratio = unit.hp / unit.maxHp;
        if (ratio < lowest) {
            lowest = ratio;
            best = id;
        }
    }
    return best;
}

// 牌实例的当前面貌：合并升级、成长、临时标记与费用修正。找不到定义返回 null。
// 返回新对象，不改 state（catalog 与 cards 里的对象只读）。
export function cardView(state, inst) {
    const entry = state.cards[inst];
    const def = entry && state.catalog[entry.owner]?.[entry.cardId];
    if (!def) return null;
    const { upgraded, ...base } = def;
    let view = !entry.upgraded || !upgraded
        ? { ...base, inst, upgraded: false }
        : { ...base, inst, upgraded: true, cost: upgraded.cost ?? def.cost, effects: upgraded.effects ?? def.effects };
    if (entry.grow) {
        view = {
            ...view,
            effects: view.effects.map((effect) => (effect.op === 'damage' ? { ...effect, amount: Math.min(99, effect.amount + entry.grow) } : effect)),
            grow: entry.grow,
        };
    }
    if (entry.temp) view.temp = true;
    const owner = state.units?.[entry.owner];
    const costShift = (owner?.handCost || 0) + (entry.costMod || 0) + (owner?.turnCostMod?.[inst] || 0);
    if (!costShift || typeof view.cost !== 'number') return view;
    return { ...view, cost: Math.max(0, view.cost + costShift), baseCost: view.cost };
}

// 当前能量是否付得起（X 费要求至少 1 点）。
export function canAfford(card, energy) {
    if (card.unplayable) return false;
    return card.cost === 'X' ? energy > 0 : card.cost <= energy;
}

// 效果里是否有需要指定敌方目标的部分。
export function effectsNeedTarget(effects) {
    return (effects || []).some((effect) => effect.target === 'enemy'
        || (effect.op === 'damage' && !effect.target)
        || (effect.op === 'conditional' && (effect.when?.kind === 'target-has' || effectsNeedTarget(effect.then))));
}

// 效果里是否有需要指定友方目标的部分。
export function effectsPickAlly(effects) {
    return (effects || []).some((effect) => effect.target === 'ally' || (effect.op === 'conditional' && effectsPickAlly(effect.then)));
}

// 单次伤害：先按伤害倍率取整再加力量，虚弱打七五折，易伤乘 1.5。attacker 或 target 可缺省。
export function computeDamage(attacker, target, amount, strengthScale = 1) {
    let value = amount;
    if (attacker) {
        value = Math.round(value * (attacker.damageScale || 1)) + (attacker.statuses.strength || 0) * (strengthScale || 1);
        if (attacker.statuses.weak > 0) value = Math.floor(value * 0.75);
    }
    if (target?.statuses.vulnerable > 0) value = Math.floor(value * 1.5);
    return Math.max(0, value);
}

// 格挡值：加敏捷，脆弱（frail）打七五折。
export function computeBlock(source, amount, target = source) {
    const value = amount + (source?.statuses.dexterity || 0);
    return Math.max(0, target?.statuses.frail > 0 ? Math.floor(value * 0.75) : value);
}

export const cardCountKey = (inst) => `c:${inst}`;

// 条件效果的判定。cardInst 是当前这张牌的实例号（同名牌计数用）。
export function conditionHolds(state, unit, when, targetId, cardInst) {
    const stats = unit.turnStats;
    switch (when?.kind) {
        case 'target-has':
            return (state.units[targetId]?.statuses[when.value] || 0) > 0;
        case 'self-has':
            return (unit.statuses[when.value] || 0) > 0;
        case 'self-hp-below':
            return unit.hp * 100 < unit.maxHp * when.value;
        case 'cards-played-gte':
            return unit.cardsPlayed >= when.value;
        case 'attacks-played-gte':
            return (stats?.attack || 0) >= when.value;
        case 'skills-played-gte':
            return (stats?.skill || 0) >= when.value;
        case 'same-card-gte':
            return cardInst != null && (stats?.byCard?.[cardCountKey(cardInst)] || 0) >= when.value;
        case 'discarded-gte':
            return (stats?.discards || 0) >= when.value;
        default:
            return false;
    }
}

// 估算 attacker 对 target 一组效果的总伤害（目标缺省时为 0）。aimId 是被指定的目标 id。
export function estimateDamage(state, attacker, target, effects, aimId) {
    if (!target) return 0;
    let total = 0;
    for (const effect of effects || []) {
        if (effect.op === 'damage') {
            const aim = effect.target || 'enemy';
            if (aim === 'all-enemies' || (aim === 'enemy' && aimId === target.id)) {
                total += (effect.hits || 1) * computeDamage(attacker, target, effect.amount, effect.strengthScale);
            }
        } else if (effect.op === 'damage-from-block') {
            const aim = effect.target || 'enemy';
            if ((aim === 'all-enemies' || (aim === 'enemy' && aimId === target.id)) && attacker.block > 0) {
                total += computeDamage(attacker, target, attacker.block);
            }
        } else if (effect.op === 'conditional' && conditionHolds(state, attacker, effect.when, aimId)) {
            total += estimateDamage(state, attacker, target, effect.then, aimId);
        }
    }
    return total;
}

// 一组效果能给自己叠多少格挡。
export function estimateBlock(unit, effects) {
    return (effects || []).reduce((total, effect) => (effect.op === 'block' ? total + computeBlock(unit, effect.amount) : total), 0);
}

// 敌方单位当前意图的展示信息；没有意图或单位已倒下返回 null。
export function describeIntent(state, unitId) {
    const unit = state.units[unitId];
    const intent = state.intents?.[unitId];
    const skill = intent && unit?.alive ? unit.skills.find((item) => item.id === intent.skillId) : null;
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
