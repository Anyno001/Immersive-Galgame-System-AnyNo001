// 规则 v5 P4a 敌方状态反应（通用，卡组与技能单位都可带）：E01 晕厥、E02 飞行、E03 失衡、E04 应变、E05 硬化、E06 激怒、E07 刺甲、E08 时滞；
// 另登记游侠 R06 破空（quarry 族）。状态经 apply-status 施加：敌人开战经 ENEMY_AFFIXES 获得，晕厥与飞行另有 SKILL_TEMPLATES 技能。
// 晕厥跳过下一次行动（engine.js 的 act-before），跳过后到下一次正常行动前不会再次晕厥，避免连锁。
import { registerMechanic } from './registry.js';

export const TIME_WARP_CARDS = 12;
const st = (unit, key) => unit?.statuses?.[key] || 0;
const statusSource = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
const foesOf = (state, unit) => state.order.map((id) => state.units[id]).filter((other) => other?.alive && other.side !== unit.side);
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}
// 本次出手里被某攻击者命中的单位：ctx[key] = Map(攻击者 → Set(目标))，出手结束时结算。
function markHit(ctx, key, attackerId, targetId) {
    if (!ctx[key]) ctx[key] = new Map();
    if (!ctx[key].has(attackerId)) ctx[key].set(attackerId, new Set());
    ctx[key].get(attackerId).add(targetId);
}
function stun(ctx, unit, id, kit) {
    kit.addStatus(ctx, unit, 'stun', 1, statusSource(unit, id));
}

registerMechanic({
    key: 'foe-react', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    statuses: [
        { key: 'stun', label: '晕厥', debuff: true },
        { key: 'flying', label: '飞行' },
        { key: 'unsteady', label: '失衡' },
        { key: 'adapt', label: '应变' },
        { key: 'harden', label: '硬化' },
        { key: 'enrage', label: '激怒' },
        { key: 'barbed', label: '刺甲' },
        { key: 'time-warp', label: '时滞' },
    ],
    modifiers: {
        // E02：飞行单位受到的攻击伤害减半（只作用于经 computeDamage 的攻击伤害）。
        'incoming-mult': (attacker, target, value) => (st(target, 'flying') ? value * 0.5 : value),
    },
    hooks: {
        // E01：有晕厥时消耗 1 层并跳过这次行动；记 stunGuard，到下一次正常行动前再施加的晕厥会被抵消。
        'act-before'(ctx, before, kit) {
            const { unit } = before;
            if (st(unit, 'stun') > 0) {
                kit.setStatus(unit, 'stun', st(unit, 'stun') - 1);
                kit.resOf(ctx, unit).stunGuard = true;
                before.skip = true;
                kit.emit(ctx, { type: 'stunned', unitId: unit.id });
            } else if (unit.res?.stunGuard) {
                tidyRes(unit, 'stunGuard');
            }
        },
        'debuff-applied'(ctx, { target, status }, kit) {
            if (status === 'stun' && target.res?.stunGuard && st(target, 'stun')) kit.setStatus(target, 'stun', 0);
        },
        'play-before'(ctx, { unit, card }) {
            if ((card?.effects || []).some((effect) => effect.op === 'damage' && (effect.hits || 1) >= 2)) {
                if (!ctx.multiStrikeBy) ctx.multiStrikeBy = new Set();
                ctx.multiStrikeBy.add(unit.id);
            }
        },
        'damage-after'(ctx, { target, source, kind, blocked }, kit) {
            if (kind !== 'attack' || !target.alive || ctx.state.outcome) return;
            const attacker = source?.unitId != null ? ctx.state.units[source.unitId] : null;
            // E03：格挡被这次攻击打空时晕厥。
            if (blocked > 0 && target.block === 0 && st(target, 'unsteady')) {
                kit.emit(ctx, { type: 'off-balance', unitId: target.id });
                stun(ctx, target, 'unsteady', kit);
            }
            // E02：每次被命中减 1 层飞行（破空的多段攻击额外减 1），减到 0 坠落并晕厥；回合开始恢复。
            const flying = st(target, 'flying');
            if (flying) {
                const res = kit.resOf(ctx, target);
                if (!res.flyMax) res.flyMax = flying;
                const extra = attacker && st(attacker, 'skybreaker') && ctx.multiStrikeBy?.has(attacker.id) ? 1 : 0;
                const left = Math.max(0, flying - 1 - extra);
                kit.setStatus(target, 'flying', left);
                if (!left) {
                    tidyRes(target, 'flyMax');
                    kit.emit(ctx, { type: 'grounded', unitId: target.id, by: attacker?.id ?? null });
                    stun(ctx, target, 'flying', kit);
                }
            }
            // E05：每次受攻击获得格挡，逐次 +1，回合开始重置。
            const harden = st(target, 'harden');
            if (harden && target.alive) {
                const res = kit.resOf(ctx, target);
                const count = res.hardenCount || 0;
                res.hardenCount = count + 1;
                kit.gainBlock(ctx, target, harden + count, statusSource(target, 'harden'));
            }
            if (!attacker || attacker.side === target.side) return;
            if (st(target, 'adapt') && target.kind === 'skill') markHit(ctx, 'adaptHits', attacker.id, target.id);
            if (st(target, 'barbed') && source.kind === 'card') markHit(ctx, 'barbedHits', attacker.id, target.id);
        },
        'action-after'(ctx, { unit, kind }, kit) {
            ctx.multiStrikeBy?.delete(unit.id);
            // E04：被攻击的应变单位在这次出手结束后重选意图。
            const adapted = ctx.adaptHits?.get(unit.id);
            if (adapted) {
                ctx.adaptHits.delete(unit.id);
                for (const id of adapted) kit.replanIntent(ctx, ctx.state.units[id]);
            }
            // E07：一张攻击牌命中带刺甲的敌人，出牌者按刺甲层数受到一次伤害，不按段数。
            const pricked = ctx.barbedHits?.get(unit.id);
            if (!pricked) return;
            ctx.barbedHits.delete(unit.id);
            if (kind !== 'card') return;
            for (const id of pricked) {
                const foe = ctx.state.units[id];
                const spikes = st(foe, 'barbed');
                if (spikes && unit.alive && !ctx.state.outcome) kit.dealDamage(ctx, unit, spikes, statusSource(foe, 'barbed'), 'thorns', true);
            }
        },
        'play-after'(ctx, { unit, card }, kit) {
            if (!card) return;
            let warped = false;
            for (const foe of foesOf(ctx.state, unit)) {
                // E06：对方打出技能或能力牌时获得层数攻击力。
                const rage = card.type === 'skill' || card.type === 'power' ? st(foe, 'enrage') : 0;
                if (rage) kit.addStatus(ctx, foe, 'strength', rage, statusSource(foe, 'enrage'));
                // E08：主角本回合每出满 12 张牌，强制结束回合，带时滞者获得层数攻击力。
                const warp = st(foe, 'time-warp');
                if (warp && unit.id === ctx.state.controlledId && unit.cardsPlayed > 0 && unit.cardsPlayed % TIME_WARP_CARDS === 0) {
                    kit.addStatus(ctx, foe, 'strength', warp, statusSource(foe, 'time-warp'));
                    kit.emit(ctx, { type: 'time-warp', unitId: foe.id, target: unit.id });
                    warped = true;
                }
            }
            if (warped) kit.requestEndTurn(ctx);
        },
        'turn-start-after'(ctx, { unit }, kit) {
            if (unit.res?.hardenCount) tidyRes(unit, 'hardenCount');
            const max = unit.res?.flyMax;
            if (!max) return;
            if (st(unit, 'flying')) kit.setStatus(unit, 'flying', max);
            tidyRes(unit, 'flyMax');
        },
    },
});

// 游侠 R06 破空：多段攻击牌命中飞行敌人时，每段额外计 1 次命中（结算在上面的 damage-after）。
registerMechanic({
    key: 'skybreak', family: 'quarry', archetypes: ['ranger'], unitKinds: ['deck'],
    statuses: [{ key: 'skybreaker', label: '破空' }],
});
