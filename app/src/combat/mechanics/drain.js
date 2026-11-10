// 规则 v5 G07 吸取：按攻击结算伤害，再按本次对敌方实际扣除的生命回复出手者（与固定回复分开）。
import { registerMechanic } from './registry.js';
import { targetFactor } from './apply-status.js';

const toDamage = (effect) => ({ op: 'damage', amount: effect.amount, hits: effect.hits || 1, target: effect.target || 'enemy' });

registerMechanic({
    key: 'drain', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    ops: {
        drain: {
            attribute: { ability: 'damage', key: 'amount', tier: 'normal', timing: 'static' },
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'hits', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                return {
                    op: 'drain',
                    amount: kit.intField(effect.amount, at('amount'), state, 1, 40),
                    hits: kit.intField(effect.hits, at('hits'), state, 1, 3, 1),
                    target: kit.enumField(effect.target, at('target'), state, kit.OFFENSE_TARGETS, 'enemy'),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const units = ctx.state.units;
                const before = Object.keys(units).filter((id) => units[id].side !== unit.side).map((id) => [id, units[id].hp]);
                kit.strike(ctx, unit, toDamage(effect), aimId, source);
                const gained = before.reduce((sum, [id, hp]) => sum + Math.max(0, hp - units[id].hp), 0);
                if (gained > 0 && unit.alive && !ctx.state.outcome) kit.heal(ctx, unit, gained, source);
            },
            value: (e) => e.amount * (e.hits || 1) * (4 / 3 + 0.6) * targetFactor(e.target),
            damage: (e) => e.amount * (e.hits || 1),
            estimateDamage: (e, kit) => kit.estimate([toDamage(e)]),
            describe: (e, kit) => `${kit.on(e.target)}造成 ${kit.fmt(e.amount)} 点伤害${e.hits > 1 ? ` ×${e.hits}` : ''}，按实际扣除的生命回复`,
            brief: (e) => `吸${e.amount}`,
            scale: { ability: 'phys', key: 'amount', max: 40 },
        },
    },
});
