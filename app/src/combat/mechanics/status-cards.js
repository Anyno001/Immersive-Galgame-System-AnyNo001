// 规则 v5 G23 状态牌：灼痕、空洞、痛楚的结算（黏浊是可打出的牌，付 1 费打出后消耗，不需要钩子）；
// L06 回合结束多保留手牌 retain-hand（实际保留在 engine.js settleHand）。只在 v5 战斗、卡组单位上生效。
import { registerMechanic } from './registry.js';

export const BURN_DAMAGE = 2;
export const PAIN_LOSS = 1;
export const VOID_ENERGY = 1;
const RETAIN_MAX = 3;
// 不能打出的状态牌没有效果字段，牌面规则写在这里。
export const STATUS_CARD_TEXT = Object.freeze({
    'status-burn': `回合结束时在手牌中：受到 ${BURN_DAMAGE} 点伤害`,
    'status-void': `抽到时失去 ${VOID_ENERGY} 点能量`,
    'status-pain': `在手牌中时：每打出一张牌失去 ${PAIN_LOSS} 点生命`,
});
const REPORT_TEXT = Object.freeze({
    'status-burn': (n) => `手中的灼痕造成 ${n} 点伤害`,
    'status-void': (n) => `抽到空洞，失去 ${n} 点能量`,
    'status-pain': (n) => `痛楚发作，失去 ${n} 点生命`,
});

const isCard = (ctx, inst, cardId) => ctx.state.cards[inst]?.cardId === cardId;
const inHand = (ctx, unit, cardId) => (ctx.state.piles[unit.id]?.hand || []).filter((inst) => isCard(ctx, inst, cardId)).length;

registerMechanic({
    key: 'status-cards', family: 'general', archetypes: [], unitKinds: ['deck'],
    hooks: {
        'turn-end-before'(ctx, { unit }, kit) {
            if (unit.kind !== 'deck' || !unit.alive) return;
            const count = inHand(ctx, unit, 'status-burn');
            if (!count) return;
            const amount = count * BURN_DAMAGE;
            kit.emit(ctx, { type: 'status-card', unitId: unit.id, cardId: 'status-burn', count, amount });
            kit.dealDamage(ctx, unit, amount, { unitId: unit.id, kind: 'status', id: 'status-burn' }, 'burn', true);
        },
        draw(ctx, { unit, insts }, kit) {
            if (unit.kind !== 'deck') return;
            const count = (insts || []).filter((inst) => isCard(ctx, inst, 'status-void')).length;
            if (!count) return;
            const amount = Math.min(unit.energy || 0, count * VOID_ENERGY);
            unit.energy -= amount;
            kit.emit(ctx, { type: 'status-card', unitId: unit.id, cardId: 'status-void', count, amount });
        },
        'play-after'(ctx, { unit }, kit) {
            if (unit.kind !== 'deck' || !unit.alive) return;
            const count = inHand(ctx, unit, 'status-pain');
            if (!count) return;
            const amount = count * PAIN_LOSS;
            kit.emit(ctx, { type: 'status-card', unitId: unit.id, cardId: 'status-pain', count, amount });
            kit.dealDamage(ctx, unit, amount, { unitId: unit.id, kind: 'status', id: 'status-pain' }, 'self', false);
        },
    },
    report(event, kit) {
        if (event.type === 'status-card' && event.unitId === kit.actorId && REPORT_TEXT[event.cardId]) kit.note(event.unitId, REPORT_TEXT[event.cardId](event.amount));
    },
});

registerMechanic({
    key: 'retain-hand', family: 'general', archetypes: [], unitKinds: ['deck'],
    ops: {
        'retain-hand': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount'], path, state);
                return { op: 'retain-hand', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, RETAIN_MAX, 1) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const res = kit.resOf(ctx, unit);
                res.retainHand = Math.min(RETAIN_MAX, (res.retainHand || 0) + effect.amount);
                kit.emit(ctx, { type: 'retain-hand', unitId: unit.id, amount: effect.amount });
            },
            value: (e) => e.amount * 3,
            describe: (e) => `本回合结束时多保留 ${e.amount} 张手牌`,
            brief: (e) => `留${e.amount}`,
        },
    },
});
