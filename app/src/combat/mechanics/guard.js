// 规则 v5 G06 护命：失去生命之前按次抵消（伤害与失去生命同样计次），发 buffer 事件。
// 规则 v5 G21 恶意：持有者每成功对敌方施加一次减益（被人工制品挡下不算），对其造成等于层数的伤害。
import { registerMechanic } from './registry.js';

const st = (unit, key) => unit?.statuses?.[key] || 0;

registerMechanic({
    key: 'buffer', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    statuses: [{ key: 'buffer', label: '护命' }],
    hooks: {
        'hp-loss-before'(ctx, payload, kit) {
            const { target } = payload;
            if (!(payload.hpLoss > 0) || !st(target, 'buffer')) return;
            kit.setStatus(target, 'buffer', st(target, 'buffer') - 1);
            payload.hpLoss = 0;
            kit.emit(ctx, { type: 'buffer', source: payload.source, target: target.id });
        },
    },
    report(event, kit) {
        if (event.type === 'buffer' && kit.fromCurrentAction) kit.note(event.target, '{who}的护命挡下了这次失血');
    },
});

registerMechanic({
    key: 'malice', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    statuses: [{ key: 'malice', label: '恶意' }],
    hooks: {
        'debuff-applied'(ctx, { target, source }, kit) {
            const applier = source?.unitId != null ? ctx.state.units[source.unitId] : null;
            const stacks = st(applier, 'malice');
            if (!stacks || !applier.alive || !target.alive || applier.side === target.side) return;
            kit.dealDamage(ctx, target, stacks, { unitId: applier.id, kind: 'status', id: 'malice' }, 'malice', true);
        },
    },
});
