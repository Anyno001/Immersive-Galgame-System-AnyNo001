// 规则 v5 P4b 敌方单位机制：E09 背击、E12 爪牙绑定、E13 召唤爪牙。
// 背击：卡组单位用指定目标的牌转向该敌人（res.facing）；带背击的敌人不在其朝向上时，对它的攻击伤害 ×1.5。朝向的单位倒下后清除朝向。
// 爪牙：summon-minion 经 engineKit.summonUnit 受控入场（场上敌人最多 5 名，写 minion / minionOf）；召唤者倒下时经 engineKit.dismissUnit 退场。
import { registerMechanic } from './registry.js';

export const FLANK_MULT = 1.5;
const MINION_SKILL_ID = 'minion-claw';
const st = (unit, key) => unit?.statuses?.[key] || 0;
const foesOf = (state, unit) => state.order.map((id) => state.units[id]).filter((other) => other?.alive && other.side !== unit.side);
const hasFlanker = (state, unit) => foesOf(state, unit).some((foe) => st(foe, 'flank'));
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}
function face(ctx, unit, targetId, kit) {
    kit.resOf(ctx, unit).facing = targetId;
    kit.emit(ctx, { type: 'face', unitId: unit.id, targetId });
}

registerMechanic({
    key: 'flank', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    statuses: [{ key: 'flank', label: '背击' }],
    modifiers: {
        'outgoing-mult': (attacker, target, value) => {
            const facing = target?.res?.facing;
            return st(attacker, 'flank') && facing && facing !== attacker.id && attacker.side !== target.side ? value * FLANK_MULT : value;
        },
    },
    hooks: {
        // 打出指定敌人的牌时转向它；场上没有背击敌人时不记朝向。
        'play-before'(ctx, { unit, aimId }, kit) {
            const aimed = aimId != null ? ctx.state.units[aimId] : null;
            if (unit.kind !== 'deck' || !aimed?.alive || aimed.side === unit.side || unit.res?.facing === aimId || !hasFlanker(ctx.state, unit)) return;
            face(ctx, unit, aimId, kit);
        },
        // 还没有朝向时，回合开始面向出手顺序里第一名存活敌人。
        'turn-start-after'(ctx, { unit }, kit) {
            if (unit.kind !== 'deck' || unit.res?.facing || !hasFlanker(ctx.state, unit)) return;
            const first = foesOf(ctx.state, unit)[0];
            if (first) face(ctx, unit, first.id, kit);
        },
        defeated(ctx, { unit: fallen }) {
            for (const id of ctx.state.order) {
                const other = ctx.state.units[id];
                if (other?.res?.facing === fallen.id) tidyRes(other, 'facing');
            }
        },
    },
});

registerMechanic({
    key: 'minion-call', family: 'general', archetypes: [], unitKinds: ['skill'],
    ops: {
        'summon-minion': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'hp', 'damage'], path, state);
                const at = (key) => kit.joinPath(path, key);
                return {
                    op: 'summon-minion',
                    amount: kit.intField(effect.amount, at('amount'), state, 1, 2),
                    hp: kit.intField(effect.hp, at('hp'), state, 1, 60),
                    damage: kit.intField(effect.damage, at('damage'), state, 1, 20),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                for (let i = 0; i < effect.amount; i += 1) {
                    const minion = kit.summonUnit(ctx, unit, {
                        name: '爪牙', maxHp: effect.hp, speed: unit.speed, damageScale: unit.damageScale,
                        skills: [{ id: MINION_SKILL_ID, name: '爪击', intent: 'attack', effects: [{ op: 'damage', amount: effect.damage, target: 'enemy' }], weight: 1, cooldown: 0 }],
                    });
                    if (!minion) break;
                }
            },
            value: (e) => e.amount * (e.hp / 4 + e.damage),
            describe: (e) => `召唤 ${e.amount} 名爪牙（生命 ${e.hp}，每次攻击 ${e.damage}；场上敌人最多 5 名，召唤者倒下时爪牙退场）`,
            brief: (e) => `召唤爪牙${e.amount}`,
        },
    },
    hooks: {
        // E12：召唤者倒下时，它召出的爪牙一并退场（不算倒下，不触发击杀奖励）。
        defeated(ctx, { unit: fallen }, kit) {
            if (fallen.minion === true) return;
            for (const id of [...ctx.state.order]) {
                const other = ctx.state.units[id];
                if (other?.alive && other.minionOf === fallen.id) kit.dismissUnit(ctx, other);
            }
        },
    },
    report(event, kit) {
        if (event.type === 'minion-enter' && event.ownerId === kit.actorId) kit.note(event.ownerId, `召来${event.name || '爪牙'}`);
        else if (event.type === 'minion-leave') kit.note(event.unitId, '随召唤者倒下而退场');
    },
});
