// 规则 v5 P4d 我方限制：E18 行动限制、E19 牌面附着、E20 降级（E21 塞垃圾牌沿用 create 与 G23 状态牌，见 card-templates.js 与 enemy-loadout.js）。
// 出牌限制只经 card-play 阶段登记，由 battle-state.js 的 playBlock / canPlay 统一判定（validatePlay、legalActions、托管、面板共用）。
// 挂在我方的限制（禁攻击、攻击加费、禁格挡、少抽）每回合结束减 1 层；出牌上限、技能张数上限是敌方存活时对对方生效的光环；
// 每次出牌受伤沿用既有词缀「心律」（foe-card-played），不另登记。
import { registerMechanic } from './registry.js';

const st = (unit, key) => unit?.statuses?.[key] || 0;
export const MARK_PAIN = 2;
export const SCAR_DAMAGE = 3;
export const CARD_MARKS = Object.freeze(['bound', 'taxed', 'pain', 'ethereal', 'scar']);
const MARK_TEXT = Object.freeze({ bound: '绑定', taxed: '加费', pain: '痛刺', ethereal: '虚无', scar: '受创' });
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}
const foesOf = (state, unit) => state.order.map((id) => state.units[id]).filter((other) => other?.alive && other.side !== unit.side);
// 对方存活单位里某光环的最小层数（多个敌人带同一光环时取最严）；没有时为 0。
function auraOf(state, unit, key) {
    let best = 0;
    for (const foe of foesOf(state, unit)) {
        const n = st(foe, key);
        if (n > 0 && (!best || n < best)) best = n;
    }
    return best;
}

registerMechanic({
    key: 'foe-restrict', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    statuses: [
        { key: 'no-attack', label: '禁攻', debuff: true, decay: true },
        { key: 'attack-tax', label: '攻击加费', debuff: true, decay: true },
        { key: 'no-block', label: '禁守', debuff: true, decay: true },
        { key: 'draw-down', label: '少抽', debuff: true, decay: true },
        { key: 'play-cap', label: '束缚' },
        { key: 'skill-cap', label: '封技' },
        { key: 'downgrade', label: '降级', debuff: true },
    ],
    modifiers: {
        'card-play': (state, unit, card) => {
            if (card.type === 'attack' && st(unit, 'no-attack')) return 'no-attack';
            const cap = auraOf(state, unit, 'play-cap');
            if (cap && (unit.cardsPlayed || 0) >= cap) return 'play-cap';
            const skills = auraOf(state, unit, 'skill-cap');
            if (skills && card.type === 'skill' && (unit.turnStats?.skill || 0) >= skills) return 'skill-cap';
            return null;
        },
        'card-cost': (state, owner, view) => (view.type === 'attack' && st(owner, 'attack-tax') ? view.cost + st(owner, 'attack-tax') : view.cost),
        // 禁守：只把卡牌结算获得的格挡归 0（origin 为 'card'）；技能、被动等其他来源不受影响。
        'block-add': (source, target, value, origin) => (origin === 'card' && st(source, 'no-block') ? 0 : value),
        'draw-count': (state, unit, count) => count - st(unit, 'draw-down'),
        'card-upgrade': (state, owner) => !st(owner, 'downgrade'),
    },
});

// E19 牌面附着：敌方技能 mark-card 给对方的牌附加标记（记在 state.cards[inst].marks，cardView 只在 v5 合并）；牌打出后标记清除。
// 绑定：每回合只能打出一张带绑定的牌；加费：费用 +1；痛刺：打出时失去生命；虚无：回合结束仍在手中则消耗；受创：打出后到自己下一回合开始，每次受到的攻击伤害 +3。
registerMechanic({
    key: 'foe-mark', family: 'general', archetypes: [], unitKinds: ['skill'],
    statuses: [{ key: 'scarred', label: '受创', debuff: true }],
    modifiers: {
        'card-play': (state, unit, card) => (card.marks?.includes('bound') && unit.res?.boundTurn === state.turn ? 'bound' : null),
        'card-cost': (state, owner, view) => (view.marks?.includes('taxed') ? view.cost + 1 : view.cost),
        'incoming-mult': (attacker, target, value) => value + SCAR_DAMAGE * st(target, 'scarred'),
    },
    ops: {
        'mark-card': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'mark', 'amount', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                const mark = kit.enumField(effect.mark, at('mark'), state, CARD_MARKS);
                return mark ? { op: 'mark-card', mark, amount: kit.intField(effect.amount, at('amount'), state, 1, 3), target: 'enemy' } : undefined;
            },
            // 手牌为空时（敌人出手时主角手牌已在回合结束弃掉）改从抽牌堆挑；同一张牌不重复附加同一标记。
            apply(ctx, unit, effect, aimId, source, kit) {
                for (const target of kit.targets()) {
                    const pile = ctx.state.piles[target.id];
                    if (target.kind !== 'deck' || !target.alive || !pile) continue;
                    const from = pile.hand.length ? 'hand' : 'draw';
                    const pool = pile[from].filter((inst) => !(ctx.state.cards[inst]?.marks || []).includes(effect.mark));
                    for (let i = 0; i < effect.amount && pool.length; i += 1) {
                        const [inst] = pool.splice(kit.rollInt(ctx.state, pool.length), 1);
                        const entry = kit.ownCard(ctx, inst);
                        entry.marks = [...(entry.marks || []), effect.mark];
                        kit.emit(ctx, { type: 'card-marked', unitId: unit.id, owner: target.id, inst, mark: effect.mark, from, cardId: entry.cardId });
                    }
                }
            },
            value: (e) => e.amount * 4,
            describe: (e) => `给对方 ${e.amount} 张牌附加「${MARK_TEXT[e.mark]}」（打出后清除）`,
            brief: (e) => `${MARK_TEXT[e.mark]}${e.amount}`,
        },
    },
    hooks: {
        'play-after'(ctx, { unit, inst, card }, kit) {
            const marks = card?.marks;
            if (!marks?.length) return;
            const source = { unitId: unit.id, kind: 'status', id: 'card-mark' };
            delete kit.ownCard(ctx, inst).marks;
            if (marks.includes('bound')) kit.resOf(ctx, unit).boundTurn = ctx.state.turn;
            if (marks.includes('scar')) kit.addStatus(ctx, unit, 'scarred', 1, source);
            if (marks.includes('pain')) kit.dealDamage(ctx, unit, MARK_PAIN, source, 'self', false);
        },
        'turn-start-after'(ctx, { unit }, kit) {
            if (st(unit, 'scarred')) kit.setStatus(unit, 'scarred', 0);
            if (unit.res?.boundTurn != null && unit.res.boundTurn !== ctx.state.turn) tidyRes(unit, 'boundTurn');
        },
    },
    report(event, kit) {
        if (event.type === 'card-marked') kit.note(event.owner, `一张牌被附加「${MARK_TEXT[event.mark]}」`);
    },
});
