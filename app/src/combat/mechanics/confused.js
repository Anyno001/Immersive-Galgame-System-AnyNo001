import { registerMechanic } from './registry.js';

registerMechanic({
    key: 'confused', family: 'general', archetypes: [], unitKinds: ['deck'],
    statuses: [{ key: 'confused', label: '混乱', debuff: true }],
    hooks: {
        'draw-card'(ctx, { unit, inst }, kit) {
            if (unit.kind !== 'deck' || !(unit.statuses.confused > 0)) return;
            const view = kit.cardView(ctx.state, inst);
            if (!view || view.unplayable || typeof view.cost !== 'number') return;
            const cost = kit.rollInt(ctx.state, 4);
            const entry = kit.ownCard(ctx, inst);
            entry.confusedCost = cost;
            delete entry.costMod;
            delete entry.discount;
            if (unit.turnCostMod) {
                delete unit.turnCostMod[inst];
                if (!Object.keys(unit.turnCostMod).length) delete unit.turnCostMod;
            }
            kit.emit(ctx, { type: 'cost-randomized', unitId: unit.id, inst, cost });
        },
    },
});
