// 敌人模板 M7 战斗外影响：盗金（steal-gold）、偷牌（steal-card）与永久寄生（implant-card）。只限技能单位。
// 金币来自 setup.purse（开战时剧情货币余额快照，state.purse 为本场仍在我方手里的金币）；
// 每次使用按实际可偷金额扣 state.purse，记在持有者 res.stolenGold。持有者倒下时如数归还；
// 分裂、自爆退场也归还；撤离（fled）或战斗结束仍在场的持有者带走金币，战后由 goldLostOf 计为损失。
// 偷牌只偷带长期副本 ID（copyId）的牌（临时牌、状态牌不偷），从手牌、抽牌堆、弃牌堆按种子取一张，记在 res.stolenCards；
// 对方长期副本（含已被偷而未归还的）不多于 deckMin 张时不偷，保证战后卡组仍合规（项目选择，原版无此限制）。
// 归还规则同盗金；被带走的副本由 cardsLostOf 列出，战后按副本 ID 写账本 card-lost 从长期卡组移除。
// 永久寄生（implant-card）：往对方长期卡组植入一张指定牌，不进入本场牌堆，记在 state.implanted（胜、败、撤退都保留），
// 战后由 cardsAddedOf 列出，按账本 card-implant 加一张新副本。原版移除寄生牌时失去最大生命的惩罚未实现。
import { registerMechanic } from './registry.js';

function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}

// 可植入的牌（只由敌方 implant-card 植入；账本按此表补目录，不接受外部定义）。
export const IMPLANT_CARDS = Object.freeze({
    'curse-parasite': Object.freeze({ id: 'curse-parasite', name: '寄生', type: 'skill', cost: 0, rarity: 'basic', effects: Object.freeze([]), unplayable: true, skillRef: '寄生' }),
});
export const IMPLANT_CARD_IDS = Object.freeze(Object.keys(IMPLANT_CARDS));

// 有长期副本（copyId）的对方卡组单位：指定目标优先，否则对方操控角色。
function deckFoe(state, unit, aimId) {
    const fits = (u) => !!u?.alive && u.side !== unit.side && u.kind === 'deck' && !!state.piles[u.id];
    const aimed = aimId != null ? state.units[aimId] : null;
    const victim = fits(aimed) ? aimed : fits(state.units[state.controlledId]) ? state.units[state.controlledId] : null;
    return victim;
}
const hasLongTermCards = (state, ownerId) => Object.values(state.cards).some((card) => card?.owner === ownerId && !card.temp && typeof card.copyId === 'string' && card.copyId);

function giveGoldBack(ctx, holder, kit) {
    const amount = holder.res?.stolenGold || 0;
    if (!amount) return;
    ctx.state.purse = (ctx.state.purse || 0) + amount;
    tidyRes(holder, 'stolenGold');
    kit.emit(ctx, { type: 'gold-returned', unitId: holder.id, amount });
}

function giveCardsBack(ctx, holder, kit) {
    const list = holder.res?.stolenCards;
    if (!list?.length) return;
    for (const item of list) {
        const pile = ctx.state.piles[item.owner];
        if (!pile) continue;
        const to = pile.hand.length < kit.handLimit ? 'hand' : 'discard';
        pile[to].push(item.inst);
        kit.emit(ctx, { type: 'card-recovered', unitId: holder.id, owner: item.owner, inst: item.inst, cardId: item.cardId, to });
    }
    tidyRes(holder, 'stolenCards');
}

function giveBack(ctx, holder, kit) {
    giveGoldBack(ctx, holder, kit);
    giveCardsBack(ctx, holder, kit);
}

// 战斗结束时被带走的金币：撤离者与仍在场者手里的盗金之和（倒下、分裂、自爆者已归还）。
export function goldLostOf(state) {
    let lost = 0;
    for (const unit of Object.values(state?.units || {})) {
        const amount = unit?.res?.stolenGold || 0;
        if (amount > 0 && (unit.alive || unit.left === 'fled')) lost += amount;
    }
    return lost;
}

// 战斗结束时被带走的长期副本：[{ owner, copyId, cardId }]，按单位顺序与偷取顺序。
export function cardsLostOf(state) {
    const lost = [];
    for (const id of state?.order || []) {
        const unit = state.units?.[id];
        if (!unit?.res?.stolenCards?.length || !(unit.alive || unit.left === 'fled')) continue;
        for (const item of unit.res.stolenCards) lost.push({ owner: item.owner, copyId: item.copyId, cardId: item.cardId });
    }
    return lost;
}

// 本场植入对方长期卡组的牌：[{ owner, cardId }]，按植入顺序。
export function cardsAddedOf(state) {
    return Array.isArray(state?.implanted) ? state.implanted.map((item) => ({ owner: item.owner, cardId: item.cardId })) : [];
}

const STEAL_PILES = Object.freeze(['hand', 'draw', 'discard']);

registerMechanic({
    key: 'foe-heist', family: 'general', archetypes: [], unitKinds: ['skill'],
    ops: {
        'steal-gold': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'target'], path, state);
                return { op: 'steal-gold', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 999), target: 'enemy' };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const purse = ctx.state.purse || 0;
                const amount = Math.min(effect.amount, purse);
                if (amount <= 0 || !unit.alive) return;
                const res = kit.resOf(ctx, unit);
                if (!res) return;
                ctx.state.purse = purse - amount;
                res.stolenGold = (res.stolenGold || 0) + amount;
                kit.emit(ctx, { type: 'gold-stolen', unitId: unit.id, amount });
            },
            value: (e) => Math.min(8, 2 + e.amount / 10),
            describe: (e) => `盗走 ${e.amount} 金币，倒下后归还，撤离则带走`,
            brief: (e) => `盗金${e.amount}`,
        },
        'steal-card': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'target'], path, state);
                return { op: 'steal-card', target: 'enemy' };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                if (!unit.alive) return;
                const state = ctx.state;
                const victim = deckFoe(state, unit, aimId);
                if (!victim) return;
                const pile = state.piles[victim.id];
                let held = 0;
                for (const card of Object.values(state.cards)) if (card?.owner === victim.id && !card.temp && typeof card.copyId === 'string' && card.copyId) held += 1;
                for (const id of state.order) {
                    const list = state.units[id]?.res?.stolenCards;
                    if (list) held -= list.filter((item) => item.owner === victim.id).length;
                }
                if (held <= kit.deckMin) return;
                const pool = [];
                for (const from of STEAL_PILES) for (const inst of pile[from]) {
                    const card = state.cards[inst];
                    if (card && !card.temp && typeof card.copyId === 'string' && card.copyId) pool.push({ from, inst });
                }
                if (!pool.length) return;
                const res = kit.resOf(ctx, unit);
                if (!res) return;
                const { from, inst } = pool[kit.rollInt(state, pool.length)];
                pile[from].splice(pile[from].indexOf(inst), 1);
                const card = state.cards[inst];
                if (!res.stolenCards) res.stolenCards = [];
                res.stolenCards.push({ inst, owner: victim.id, copyId: card.copyId, cardId: card.cardId });
                kit.emit(ctx, { type: 'card-stolen', unitId: unit.id, owner: victim.id, inst, from, cardId: card.cardId });
            },
            value: () => 8,
            describe: () => '偷走对方卡组里的一张牌，倒下后归还，撤离则带走（从卡组永久移除）',
            brief: () => '偷牌',
        },
        'implant-card': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'cardId', 'target'], path, state);
                return { op: 'implant-card', cardId: kit.enumField(effect.cardId, kit.joinPath(path, 'cardId'), state, IMPLANT_CARD_IDS, IMPLANT_CARD_IDS[0]), target: 'enemy' };
            },
            // 只对带长期副本的卡组单位生效（没有长期卡组的单位战后无处可写）；不改本场牌堆。
            apply(ctx, unit, effect, aimId, source, kit) {
                if (!unit.alive || !IMPLANT_CARDS[effect.cardId]) return;
                const state = ctx.state;
                const victim = deckFoe(state, unit, aimId);
                if (!victim || !hasLongTermCards(state, victim.id)) return;
                // state 顶层浅拷贝：换新数组，不改输入局面。
                state.implanted = [...(state.implanted || []), { owner: victim.id, cardId: effect.cardId }];
                kit.emit(ctx, { type: 'card-implanted', unitId: unit.id, owner: victim.id, cardId: effect.cardId });
            },
            value: () => 6,
            describe: (e) => `往对方卡组永久植入一张「${IMPLANT_CARDS[e.cardId]?.name || e.cardId}」（战后生效，败退也保留）`,
            brief: () => '寄生',
        },
    },
    hooks: {
        defeated(ctx, { unit }, kit) {
            giveBack(ctx, unit, kit);
        },
        // 分裂、自爆不发 defeated：主角回合开始时归还已离场（非撤离）者手里的金币与牌。
        'turn-start-after'(ctx, { unit }, kit) {
            if (unit.id !== ctx.state.controlledId) return;
            for (const id of [...ctx.state.order]) {
                const other = ctx.state.units[id];
                if (other && !other.alive && other.left && other.left !== 'fled' && (other.res?.stolenGold || other.res?.stolenCards)) giveBack(ctx, other, kit);
            }
        },
    },
    report(event, kit) {
        if (event.type === 'gold-stolen') kit.note(event.unitId, `盗走了 ${event.amount} 金币`);
        else if (event.type === 'gold-returned') kit.note(event.unitId, `倒下，${event.amount} 金币被夺回`);
        else if (event.type === 'card-stolen') kit.note(event.unitId, '偷走了一张牌');
        else if (event.type === 'card-recovered') kit.note(event.unitId, '被偷的牌被夺回');
        else if (event.type === 'card-implanted') kit.note(event.owner, `卡组里被植入了「${IMPLANT_CARDS[event.cardId]?.name || event.cardId}」`);
    },
});
