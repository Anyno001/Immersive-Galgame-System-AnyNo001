// 规则 v5 G18 免费出牌、G19 能量扩展（只用于卡组单位）；另登记关键字「狡黠」的战报文案（结算在 engine.js discardCard）。
// 免费：freeplay 状态让每回合前 N 张牌 0 费；free-next 让下一张（某类）牌 0 费，打出时消耗一次。
// 能量：dynamo 每回合开始额外获得能量；conserve 把回合结束时未用完的能量留到下回合；energy-double 能量翻倍（至多 10 点）。
import { registerMechanic } from './registry.js';

const ENERGY_CAP = 10;
const CARD_TYPES = ['attack', 'skill', 'power'];
const st = (unit, key) => unit?.statuses?.[key] || 0;
const freeByTurn = (unit) => st(unit, 'freeplay') > (unit?.cardsPlayed || 0);
const freeNextIndex = (unit, type) => (unit?.res?.freeNext || []).findIndex((entry) => !entry.cardType || entry.cardType === type);
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}

registerMechanic({
    key: 'energy-plus', family: 'general', archetypes: [], unitKinds: ['deck'],
    statuses: [
        { key: 'dynamo', label: '充能' },
        { key: 'conserve', label: '蓄能' },
        { key: 'freeplay', label: '免费出牌' },
    ],
    ops: {
        'energy-double': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op'], path, state);
                return { op: 'energy-double' };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const gained = Math.min(unit.energy, Math.max(0, ENERGY_CAP - unit.energy));
                if (gained <= 0) return;
                unit.energy += gained;
                kit.emit(ctx, { type: 'energy', unitId: unit.id, amount: gained });
            },
            value: () => 7,
            describe: () => `能量翻倍（至多 ${ENERGY_CAP} 点）`,
            brief: () => '能量×2',
        },
        'free-next': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'cardType'], path, state);
                return {
                    op: 'free-next',
                    amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 2, 1),
                    ...(effect.cardType === undefined ? {} : { cardType: kit.enumField(effect.cardType, kit.joinPath(path, 'cardType'), state, CARD_TYPES) }),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const res = kit.resOf(ctx, unit);
                res.freeNext = [...(res.freeNext || []), ...Array.from({ length: effect.amount }, () => (effect.cardType ? { cardType: effect.cardType } : {}))];
                kit.emit(ctx, { type: 'free-next', unitId: unit.id, amount: effect.amount, cardType: effect.cardType || null });
            },
            value: (e) => e.amount * (e.cardType ? 3.5 : 4.5),
            describe: (e, kit) => `接下来 ${e.amount} 张${kit.typed(e.cardType)}免费打出`,
            brief: (e) => `免费${e.amount}`,
        },
    },
    modifiers: {
        'card-cost': (state, owner, view) => (freeByTurn(owner) || freeNextIndex(owner, view.type) >= 0 ? 0 : view.cost),
    },
    hooks: {
        // 打出时消耗一次「下一张免费」；本回合前 N 张免费的牌、X 费牌与本来就 0 费的牌不消耗。
        'play-before'(ctx, { unit, card }) {
            if (card.cost === 'X' || freeByTurn(unit) || !((card.baseCost ?? card.cost) > 0)) return;
            const index = freeNextIndex(unit, card.type);
            if (index < 0) return;
            unit.res.freeNext.splice(index, 1);
            if (!unit.res.freeNext.length) tidyRes(unit, 'freeNext');
        },
        'turn-end-before'(ctx, { unit }, kit) {
            if (unit.kind === 'deck' && st(unit, 'conserve') && unit.energy > 0) kit.resOf(ctx, unit).banked = Math.min(unit.energy, ENERGY_CAP);
        },
        'turn-start-after'(ctx, { unit }, kit) {
            if (unit.kind !== 'deck') return;
            const banked = unit.res?.banked || 0;
            if (banked) tidyRes(unit, 'banked');
            const gain = st(unit, 'dynamo') + banked;
            if (gain <= 0) return;
            unit.energy += gain;
            kit.emit(ctx, { type: 'energy', unitId: unit.id, amount: gain });
        },
    },
});

// 关键字「狡黠」的战报文案：被效果弃掉后自动打出，记在当前出手者名下。
registerMechanic({
    key: 'keywords', family: 'general', archetypes: [], unitKinds: ['deck'],
    report(event, kit) {
        if (event.type === 'sly' && event.unitId === kit.actorId) kit.note(event.unitId, '被弃掉的狡黠牌随即打出');
    },
});
