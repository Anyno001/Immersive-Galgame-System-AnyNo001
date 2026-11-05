// 规则 v5 P3 游侠「猎印与连射」（quarry 族，只给游侠）：R01 猎印与引弦、R02 迟滞、R03 专精先手、R04 连段成长。
// R05 牌库顶操控沿用 pile 族（scout、hunt、stack、boomerang）；R06 破空依赖 P4 E02 飞行，随 P4 实施。
import { registerMechanic } from './registry.js';

const SNARE_STEP = 0.1;
const DEADEYE_MULT = 1.5;
const st = (unit, key) => unit?.statuses?.[key] || 0;
const living = (state) => state.order.map((id) => state.units[id]).filter((unit) => unit?.alive);
const foesOf = (state, unit) => living(state).filter((other) => other.side !== unit.side);
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}

registerMechanic({
    key: 'quarry', family: 'quarry', archetypes: ['ranger'], unitKinds: ['deck', 'skill'],
    statuses: [
        { key: 'hunt-mark', label: '猎印', debuff: true },
        { key: 'snare', label: '迟滞', debuff: true, decay: true },
        { key: 'deadeye', label: '专精先手' },
        { key: 'combo-rise', label: '连段' },
    ],
    lossKinds: ['hunt-mark'],
    ops: {
        // R01 引弦：所有带猎印的敌人失去等于层数的生命（不经格挡），猎印不清除。
        loose: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op'], path, state);
                return { op: 'loose' };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const marked = foesOf(ctx.state, unit).filter((foe) => st(foe, 'hunt-mark'));
                if (!marked.length) return;
                kit.emit(ctx, { type: 'loose', unitId: unit.id, source, count: marked.length });
                for (const foe of marked) {
                    if (ctx.state.outcome) break;
                    kit.dealDamage(ctx, foe, st(foe, 'hunt-mark'), source, 'hunt-mark', false);
                }
            },
            value: () => 5,
            describe: () => '引弦：所有带猎印的敌人失去等于猎印层数的生命（猎印不清除）',
            brief: () => '引弦',
        },
    },
    modifiers: {
        // R04 连段：本回合每次攻击命中后，之后的攻击伤害 +层数。
        'outgoing-add': (attacker, target, value) => value + st(attacker, 'combo-rise') * (attacker?.res?.comboHits || 0),
        // R03 专精先手：每回合前 N 张攻击牌伤害 ×1.5（与 G05 先手叠乘）。
        'outgoing-mult': (attacker, target, value) => (attacker?.res?.aimed && st(attacker, 'deadeye') ? value * DEADEYE_MULT : value),
        // R02 迟滞：攻击者本回合每已打出一张牌，目标受到的攻击伤害 +10%。
        'incoming-mult': (attacker, target, value) => (attacker && st(target, 'snare') ? value * (1 + SNARE_STEP * (attacker.cardsPlayed || 0)) : value),
    },
    hooks: {
        'play-before'(ctx, { unit, card }, kit) {
            if (card?.type === 'attack' && st(unit, 'deadeye') > (unit.turnStats?.attack || 0)) kit.resOf(ctx, unit).aimed = true;
        },
        'action-after'(ctx, { unit }) {
            if (unit.res?.aimed) tidyRes(unit, 'aimed');
        },
        'damage-after'(ctx, { target, source, kind }, kit) {
            if (kind !== 'attack' || source?.unitId == null) return;
            const attacker = ctx.state.units[source.unitId];
            if (!st(attacker, 'combo-rise') || attacker.side === target.side) return;
            const res = kit.resOf(ctx, attacker);
            res.comboHits = (res.comboHits || 0) + 1;
        },
        'turn-end-after'(ctx, { unit }, kit) {
            if (st(unit, 'combo-rise')) kit.setStatus(unit, 'combo-rise', 0);
            if (unit.res?.comboHits) tidyRes(unit, 'comboHits');
        },
    },
    report(event, kit) {
        if (event.type === 'loose' && event.unitId === kit.actorId) kit.note(event.unitId, `引弦令 ${event.count} 名带猎印的敌人失去生命`);
    },
});
