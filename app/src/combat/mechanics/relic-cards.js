// 规则 v6 卡牌操作（G5d，原版遗物的降费到打出、升级抽牌堆与刚抽到的牌、从消耗堆复制、扣减能量）。只用于卡组单位，只在规则 v6 结算。
// 已有能力直接复用、不在此重复：随机造牌（含本回合免费）为 fixed-pile 的 random-card，批量保留 / 虚无为 grant-flag，
// 按费用检索为 pile 的 search（cost 过滤），能量结转为 energy-plus 的「蓄能」状态。
import { registerMechanic } from './registry.js';

const CARD_TYPES = ['attack', 'skill', 'power'];
const DISCOUNT_MAX = 3;
const pileOf = (ctx, unit) => ctx.state.piles[unit.id];
const v6 = (ctx) => ctx.state.rulesVersion >= 6;
const typeField = (effect, path, state, kit) => (effect.cardType === undefined ? {} : { cardType: kit.enumField(effect.cardType, kit.joinPath(path, 'cardType'), state, CARD_TYPES) });
const upgradable = (state, inst) => {
    const entry = state.cards[inst];
    return Boolean(entry && entry.upgraded !== true && state.catalog[entry.owner]?.[entry.cardId]?.upgraded);
};
function upgradeInst(ctx, unit, kit, inst) {
    if (!upgradable(ctx.state, inst)) return false;
    kit.ownCard(ctx, inst).upgraded = true;
    kit.emit(ctx, { type: 'upgrade-card', unitId: unit.id, inst });
    return true;
}
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}

// 降费到打出：随机 N 张手牌（费用大于 0、可限牌型）费用 -amount，直到这张牌被打出为止（换回合、进弃牌堆仍保留）。
const discountOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'amount', 'count', 'cardType'], path, state);
        return {
            op: 'discount-card',
            amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, DISCOUNT_MAX, 1),
            count: kit.intField(effect.count, kit.joinPath(path, 'count'), state, 1, 3, 1),
            ...typeField(effect, path, state, kit),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        if (!v6(ctx)) return;
        // 运行时效果未必经过 validate 归一化：可省字段在此取默认值。
        const amount = effect.amount ?? 1;
        const options = pileOf(ctx, unit).hand.filter((inst) => {
            const card = kit.cardView(ctx.state, inst);
            return inst !== ctx.inst && card && typeof card.cost === 'number' && card.cost > 0 && (!effect.cardType || card.type === effect.cardType);
        });
        for (const inst of kit.selectCards(ctx, 'random', options, Math.min(effect.count ?? 1, options.length), 'cost')) {
            const entry = kit.ownCard(ctx, inst);
            entry.discount = Math.min(DISCOUNT_MAX, (entry.discount || 0) + amount);
            kit.emit(ctx, { type: 'discount', unitId: unit.id, inst, amount });
        }
    },
    value: (e) => e.amount * (e.count ?? 1) * (e.cardType ? 2.5 : 3),
    describe: (e, kit) => `随机 ${e.count ?? 1} 张手牌中的${kit.typed(e.cardType)}费用 -${e.amount}，直到打出为止`,
    brief: (e) => `降费${e.amount}`,
};

// 升级牌堆：draw 为随机升级抽牌堆里 amount 张牌（本场）；drawn 为本回合接下来抽到的 amount 张牌抽到即升级。
const upgradePileOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'from', 'amount'], path, state);
        return {
            op: 'upgrade-pile',
            from: kit.enumField(effect.from, kit.joinPath(path, 'from'), state, ['draw', 'drawn']),
            amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 10, 1),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        if (!v6(ctx)) return;
        const amount = effect.amount ?? 1;
        if (effect.from === 'drawn') {
            const res = kit.resOf(ctx, unit);
            res.upgradeDrawn = Math.min(10, (res.upgradeDrawn || 0) + amount);
            return;
        }
        const options = pileOf(ctx, unit).draw.filter((inst) => upgradable(ctx.state, inst));
        for (const inst of kit.selectCards(ctx, 'random', options, Math.min(amount, options.length), 'pick')) upgradeInst(ctx, unit, kit, inst);
    },
    value: (e) => e.amount * (e.from === 'drawn' ? 2.5 : 2),
    describe: (e) => (e.from === 'drawn' ? `本回合接下来抽到的 ${e.amount} 张牌本场升级` : `本场随机升级抽牌堆中的 ${e.amount} 张牌`),
    brief: (e) => `升级${e.amount}`,
};

// 从消耗堆复制：按种子从消耗堆随机挑 amount 张（不可打出、状态牌与诅咒除外），各复制一张临时牌加入手牌，原牌留在消耗堆。
const copyExhaustOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'amount', 'cardType'], path, state);
        return { op: 'copy-exhausted', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 2, 1), ...typeField(effect, path, state, kit) };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        if (!v6(ctx)) return;
        const options = pileOf(ctx, unit).exhaust.filter((inst) => {
            const card = kit.cardView(ctx.state, inst);
            return card && !card.unplayable && !/^(status-|curse-)/.test(card.id) && (!effect.cardType || card.type === effect.cardType);
        });
        for (const inst of kit.selectCards(ctx, 'random', options, Math.min(effect.amount ?? 1, options.length), 'pick')) {
            const entry = ctx.state.cards[inst];
            kit.addTempCard(ctx, unit, { cardId: entry.cardId, upgraded: entry.upgraded === true }, 'hand');
        }
    },
    value: (e) => e.amount * 6,
    describe: (e, kit) => `随机复制消耗堆中的 ${e.amount} 张${kit.typed(e.cardType)}作为临时牌加入手牌`,
    brief: (e) => `复制消耗${e.amount}`,
};

// 扣减能量（代价）：now 立即失去，next-turn 下回合开始时失去（不低于 0）。
const loseEnergyOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'amount', 'timing'], path, state);
        return {
            op: 'lose-energy',
            amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 3, 1),
            timing: kit.enumField(effect.timing, kit.joinPath(path, 'timing'), state, ['now', 'next-turn'], 'now'),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        if (!v6(ctx)) return;
        const amount = effect.amount ?? 1;
        if (effect.timing === 'next-turn') {
            const res = kit.resOf(ctx, unit);
            res.energyDebt = Math.min(10, (res.energyDebt || 0) + amount);
            return;
        }
        drain(ctx, unit, amount, kit);
    },
    value: (e) => -e.amount * (e.timing === 'next-turn' ? 5 : 6),
    describe: (e) => `${e.timing === 'next-turn' ? '下回合开始时' : ''}失去 ${e.amount} 点能量`,
    brief: (e) => `能量-${e.amount}`,
};
function drain(ctx, unit, amount, kit) {
    const lost = Math.min(unit.energy, amount);
    if (lost <= 0) return;
    unit.energy -= lost;
    kit.emit(ctx, { type: 'energy', unitId: unit.id, amount: -lost });
}

registerMechanic({
    key: 'relic-cards', family: 'general', archetypes: [], unitKinds: ['deck'],
    ops: { 'discount-card': discountOp, 'upgrade-pile': upgradePileOp, 'copy-exhausted': copyExhaustOp, 'lose-energy': loseEnergyOp },
    modifiers: {
        'card-cost': (state, owner, view) => {
            const discount = state.rulesVersion >= 6 ? state.cards?.[view.inst]?.discount || 0 : 0;
            return discount ? view.cost - discount : view.cost;
        },
    },
    hooks: {
        'play-after'(ctx, { inst }, kit) {
            if (v6(ctx) && ctx.state.cards[inst]?.discount) delete kit.ownCard(ctx, inst).discount;
        },
        draw(ctx, { unit, insts }, kit) {
            if (!v6(ctx) || !(unit?.res?.upgradeDrawn > 0)) return;
            for (const inst of insts || []) {
                if (!(unit.res.upgradeDrawn > 0)) break;
                if (upgradeInst(ctx, unit, kit, inst)) unit.res.upgradeDrawn -= 1;
            }
            if (!(unit.res.upgradeDrawn > 0)) tidyRes(unit, 'upgradeDrawn');
        },
        'turn-start-after'(ctx, { unit }, kit) {
            const debt = v6(ctx) ? unit?.res?.energyDebt || 0 : 0;
            if (!debt) return;
            tidyRes(unit, 'energyDebt');
            drain(ctx, unit, debt, kit);
        },
        'turn-end-after'(ctx, { unit }) {
            if (unit?.res?.upgradeDrawn) tidyRes(unit, 'upgradeDrawn');
        },
    },
});
