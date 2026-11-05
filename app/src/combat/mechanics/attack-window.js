// 规则 v5 G03 蓄势消耗、G04 倍伤窗口、G05 先手。
// 一次出手（出牌、技能单位出手、人物技能）里有攻击命中，出手结算完时清蓄势、扣一次倍伤（先扣三倍伤）。
// 倍伤回合按回合衰减；先手只作用于本回合第一张攻击牌的全部伤害。
import { registerMechanic } from './registry.js';

const st = (unit, key) => unit?.statuses?.[key] || 0;
const ACTION_KINDS = new Set(['card', 'skill', 'hero-skill']);
const multOf = (unit) => (st(unit, 'overpower') ? 3 : st(unit, 'empower') || st(unit, 'empower-turns') ? 2 : 1);
const primed = (unit) => Boolean(unit?.res?.primed) && st(unit, 'first-strike') > 0;

registerMechanic({
    key: 'attack-window', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    statuses: [
        { key: 'empower', label: '倍伤' },
        { key: 'empower-turns', label: '倍伤回合', decay: true },
        { key: 'overpower', label: '三倍伤' },
        { key: 'first-strike', label: '先手' },
    ],
    modifiers: {
        'outgoing-mult': (attacker, target, value) => value * multOf(attacker) * (primed(attacker) ? 1.5 : 1),
    },
    hooks: {
        'play-before'(ctx, { unit, card }, kit) {
            if (card?.type === 'attack' && st(unit, 'first-strike') && !((unit.turnStats?.attack || 0) > 0)) kit.resOf(ctx, unit).primed = true;
        },
        'damage-after'(ctx, { source, kind }) {
            if (kind === 'attack' && ACTION_KINDS.has(source?.kind) && source.unitId != null) {
                if (!ctx.attackedBy) ctx.attackedBy = new Set();
                ctx.attackedBy.add(source.unitId);
            }
        },
        'action-after'(ctx, { unit }, kit) {
            if (unit.res?.primed) {
                delete unit.res.primed;
                if (!Object.keys(unit.res).length) delete unit.res;
            }
            if (!ctx.attackedBy?.delete(unit.id)) return;
            if (st(unit, 'vigor')) kit.setStatus(unit, 'vigor', 0);
            if (st(unit, 'overpower')) kit.setStatus(unit, 'overpower', st(unit, 'overpower') - 1);
            else if (st(unit, 'empower')) kit.setStatus(unit, 'empower', st(unit, 'empower') - 1);
        },
    },
});
