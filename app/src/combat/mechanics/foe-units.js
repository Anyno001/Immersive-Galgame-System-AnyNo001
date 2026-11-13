// 规则 v5 P4b 敌方单位机制：E09 背击、E10 分裂、E11 复生、E12 爪牙绑定、E13 召唤爪牙、E17 自爆与限时撤离。
// 背击：卡组单位用指定目标的牌转向该敌人（res.facing）；带背击的敌人不在其朝向上时，对它的攻击伤害 ×1.5。朝向的单位倒下后清除朝向。
// 爪牙：summon-minion 经 engineKit.summonUnit 受控入场（场上敌人最多 5 名，写 minion / minionOf）；召唤者倒下时经 engineKit.dismissUnit 退场。
import { registerMechanic } from './registry.js';

export const FLANK_MULT = 1.5;
export const REVIVE_TURNS = 2;
export const REVIVE_HP = 0.5;
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
        // M8：对带遭遇分组的指定敌人使用道具（单目标药水）同样转向；全体与随机目标不带 aimId，不转向。
        // 只认带 encounter 的目标：旧战斗没有该字段，道具不改朝向，重放不变。
        'item-before'(ctx, { unit, aimId }, kit) {
            const aimed = aimId != null ? ctx.state.units[aimId] : null;
            if (unit.kind !== 'deck' || !aimed?.alive || !aimed.encounter || aimed.side === unit.side || unit.res?.facing === aimId || !hasFlanker(ctx.state, unit)) return;
            face(ctx, unit, aimId, kit);
        },
        // 还没有朝向、或朝向的单位已不在场（倒下、分裂、退场）时，回合开始面向出手顺序里第一名存活敌人。
        'turn-start-after'(ctx, { unit }, kit) {
            const current = unit.res?.facing;
            if (unit.kind !== 'deck' || (current && ctx.state.units[current]?.alive) || !hasFlanker(ctx.state, unit)) return;
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

registerMechanic({
    key: 'foe-life', family: 'general', archetypes: [], unitKinds: ['skill'],
    statuses: [{ key: 'split', label: '分裂' }, { key: 'revive', label: '不灭' }],
    hooks: {
        // E10：生命降到最大生命一半及以下时分裂（子体不再分裂）。
        'hp-loss-after'(ctx, { target }, kit) {
            if (!target.alive || !st(target, 'split') || target.splitFrom || target.hp * 2 > target.maxHp) return;
            kit.splitUnit(ctx, target);
        },
        // E11：带不灭的敌人倒下时，若还有其他敌人存活，记下复活回合；同组全部倒下则按原规则判胜。
        // M8：带遭遇分组时只看同组存活者；同组最后一名倒下时取消同组所有待复活（整组算一次击倒，不再复活）。
        defeated(ctx, { unit }, kit) {
            if (unit.side === 'enemy' && unit.encounter && kit.encounterFallen(ctx.state, unit)) {
                for (const id of ctx.state.order) {
                    const other = ctx.state.units[id];
                    if (other?.encounter === unit.encounter && other.res?.reviveAt != null) tidyRes(other, 'reviveAt');
                }
                return;
            }
            if (unit.side !== 'enemy' || unit.minion === true || !st(unit, 'revive')) return;
            const others = unit.encounter || ctx.state.order.some((id) => id !== unit.id && ctx.state.units[id]?.alive && ctx.state.units[id].side === 'enemy');
            if (!others) return;
            const at = ctx.state.turn + REVIVE_TURNS;
            kit.resOf(ctx, unit).reviveAt = at;
            kit.emit(ctx, { type: 'revive-pending', unitId: unit.id, at });
        },
        // 到期后在主角回合开始以一半生命复活，保留不灭，可再次复生。
        'turn-start-after'(ctx, { unit }, kit) {
            if (unit.id !== ctx.state.controlledId) return;
            for (const id of [...ctx.state.order]) {
                const other = ctx.state.units[id];
                const at = other?.res?.reviveAt;
                if (at == null || other.alive || at > ctx.state.turn) continue;
                const keep = st(other, 'revive');
                tidyRes(other, 'reviveAt');
                kit.reviveUnit(ctx, other, Math.ceil(other.maxHp * REVIVE_HP), keep ? { revive: keep } : {});
            }
        },
    },
    report(event, kit) {
        if (event.type === 'split') kit.note(event.unitId, `分裂成 ${event.into.length} 只`);
        else if (event.type === 'revive-pending') kit.note(event.unitId, '倒下后仍在蠢动');
    },
});

// M3 随从表：summon-kin 按召唤者 kin 表里的种类召唤指定随从；split-into 本体离场，分出随从表里的种类（异种分裂）。
// 种类必须登记在召唤者的 kin 表（建局 kinProblem 经 refs 核对）。随从表单位不进后备，召唤者倒下时随 E12 退场（minion 为真时）。
const KIN_KEY_MAX = 4;
const kinKeys = (effect) => (Array.isArray(effect?.kin) ? effect.kin.filter((key) => typeof key === 'string') : []);
const kinField = (effect, path, state, kit) => kit.arrayField(effect.kin, kit.joinPath(path, 'kin'), state, 1, KIN_KEY_MAX, (item, itemPath, st) => kit.idField(item, itemPath, st));
const aliveKin = (state, owner, key) => state.order.filter((id) => {
    const other = state.units[id];
    return other?.alive && other.kinOf === owner.id && other.kinKey === key;
}).length;

registerMechanic({
    key: 'foe-kin', family: 'general', archetypes: [], unitKinds: ['skill'],
    ops: {
        // pick：order 依次取 kin 列表（循环），random 按种子在未达上限的种类中抽；cap 为同一召唤者同种类在场上限。
        'summon-kin': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'kin', 'amount', 'pick', 'cap'], path, state);
                const at = (key) => kit.joinPath(path, key);
                return {
                    op: 'summon-kin',
                    kin: kinField(effect, path, state, kit),
                    amount: kit.intField(effect.amount, at('amount'), state, 1, 4, 1),
                    pick: kit.enumField(effect.pick, at('pick'), state, ['order', 'random'], 'order'),
                    ...(effect.cap === undefined ? {} : { cap: kit.intField(effect.cap, at('cap'), state, 1, 5) }),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const keys = kinKeys(effect);
                const amount = effect.amount ?? 1;
                for (let i = 0; i < amount && keys.length; i += 1) {
                    const open = keys.filter((key) => effect.cap === undefined || aliveKin(ctx.state, unit, key) < effect.cap);
                    if (!open.length) break;
                    const key = effect.pick === 'random'
                        ? open[kit.rollInt(ctx.state, open.length)]
                        : keys[i % keys.length];
                    if (!open.includes(key)) continue;
                    if (!kit.spawnKin(ctx, unit, key, 'summon')) break;
                }
            },
            refs: kinKeys,
            value: (e) => (e.amount ?? 1) * 6,
            describe: (e) => `召唤 ${e.amount ?? 1} 名随从${e.pick === 'random' ? '（种类随机）' : ''}${e.cap ? `，同种在场至多 ${e.cap} 名` : ''}（场上敌人最多 5 名）`,
            brief: (e) => `召唤${e.amount ?? 1}`,
        },
        // hp：current 时子体当前与最大生命取本体当前生命，kin 时取随从表生命；本体离场不算倒下。
        'split-into': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'kin', 'hp'], path, state);
                return {
                    op: 'split-into',
                    kin: kinField(effect, path, state, kit),
                    hp: kit.enumField(effect.hp, kit.joinPath(path, 'hp'), state, ['current', 'kin'], 'current'),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                kit.splitIntoKin(ctx, unit, kinKeys(effect), effect.hp ?? 'current');
            },
            refs: kinKeys,
            value: (e) => kinKeys(e).length * 4,
            describe: (e) => `分裂为 ${kinKeys(e).length} 只${e.hp === 'kin' ? '' : '（生命取分裂时的当前生命）'}`,
            brief: () => '分裂',
        },
    },
    report(event, kit) {
        if (event.type === 'kin-enter' && event.cause === 'death') kit.note(event.ownerId, `倒下时生出${event.name}`);
    },
});

registerMechanic({
    key: 'foe-exit', family: 'general', archetypes: [], unitKinds: ['skill'],
    statuses: [{ key: 'fuse', label: '自爆' }, { key: 'flee', label: '遁逃' }],
    hooks: {
        // E17：敌方技能单位自己的回合结束时倒计时减 1。自爆归 0：对方全体受到等于自身当前生命的伤害后离场；遁逃归 0：撤离战场（D11）。
        'turn-end-after'(ctx, { unit }, kit) {
            if (unit.side !== 'enemy' || unit.kind !== 'skill') return;
            const fuse = st(unit, 'fuse');
            if (fuse) {
                kit.setStatus(unit, 'fuse', fuse - 1);
                if (fuse === 1) {
                    const blast = unit.hp;
                    kit.emit(ctx, { type: 'blast', unitId: unit.id, amount: blast });
                    for (const target of foesOf(ctx.state, unit)) {
                        if (ctx.state.outcome) break;
                        kit.dealDamage(ctx, target, blast, { unitId: unit.id, kind: 'status', id: 'fuse' }, 'blast', true);
                    }
                    kit.retireUnit(ctx, unit, 'explode');
                    return;
                }
            }
            const flee = st(unit, 'flee');
            if (!flee) return;
            kit.setStatus(unit, 'flee', flee - 1);
            if (flee === 1) kit.retireUnit(ctx, unit, 'fled');
        },
    },
    report(event, kit) {
        if (event.type === 'blast') kit.note(event.unitId, `自爆，波及对方全体 ${event.amount} 点伤害`);
        else if (event.type === 'unit-leave' && event.reason === 'fled') kit.note(event.unitId, '趁乱撤离了战场');
    },
});
