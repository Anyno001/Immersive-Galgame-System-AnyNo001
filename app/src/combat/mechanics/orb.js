// 规则 v5 P3 法师「法珠与专注」（orb 族，只给法师）：M01 法珠槽、M02 五种法珠、M03 专注、M04 多重引发与额外触发、
// M05 雷珠群攻、M06 锁定、M07 法珠触发；M08 能力牌重复沿用内置 replay-next（cardType: 'power'），全体减费沿用 arcane 族 conflux。
// 法珠记在 res.orbs = { slots, list: [{ kind, charge? }] }：首次凝结时按默认 3 槽建立，上限 10，先进先出，满槽再凝结先引发最早的一颗。
// 专注记在 res.focus（可为负），flux 为本回合临时专注；源珠不吃专注。法珠伤害为固定值、种类 orb，不经攻击伤害管线（攻击力、心境不加成）。
import { registerMechanic } from './registry.js';

export const ORB_SLOTS_DEFAULT = 3;
export const ORB_SLOTS_MAX = 10;
const ORB_KINDS = ['lightning', 'frost', 'dark', 'plasma', 'glass'];
const ORB_NAME = Object.freeze({ lightning: '雷珠', frost: '霜珠', dark: '蚀珠', plasma: '源珠', glass: '晶珠' });
const ORB_VALUE = Object.freeze({ lightning: 7, frost: 5, dark: 7, plasma: 9, glass: 9 });
const LOCK_KINDS = new Set(['lightning', 'dark']);
const st = (unit, key) => unit?.statuses?.[key] || 0;
const focusOf = (unit) => (unit?.res?.focus || 0) + st(unit, 'flux');
const orbSource = (unit, kind) => ({ unitId: unit.id, kind: 'orb', id: kind });
const foesOf = (state, unit) => state.order.map((id) => state.units[id]).filter((other) => other?.alive && other.side !== unit.side);

function gainEnergy(ctx, unit, amount, kit) {
    unit.energy += amount;
    kit.emit(ctx, { type: 'energy', unitId: unit.id, amount });
}
function orbsOf(ctx, unit, kit) {
    const res = kit.resOf(ctx, unit);
    if (!res) return null;
    if (!res.orbs) res.orbs = { slots: ORB_SLOTS_DEFAULT, list: [] };
    return res.orbs;
}
// 法珠伤害：锁定使雷珠、蚀珠的伤害 ×1.5（M06），普通攻击不受影响。
function orbHit(ctx, unit, target, amount, kind, kit) {
    if (!target?.alive || amount <= 0 || ctx.state.outcome) return;
    const value = LOCK_KINDS.has(kind) && st(target, 'lock-on') ? Math.floor(amount * 1.5) : amount;
    kit.dealDamage(ctx, target, value, orbSource(unit, kind), 'orb', true);
}
// 雷珠：打随机一名敌人；有雷暴（M05）时打全体敌人。
function lightning(ctx, unit, amount, kit) {
    const foes = foesOf(ctx.state, unit);
    if (!foes.length || amount <= 0) return;
    const hit = st(unit, 'arc-storm') ? foes : [foes[kit.rollInt(ctx.state, foes.length)]];
    for (const foe of hit) orbHit(ctx, unit, foe, amount, 'lightning', kit);
}
const valueOf = (unit, base) => Math.max(0, base + focusOf(unit));
// 生命最低的存活敌人（同值取出手顺序靠前者）。
function weakestFoe(state, unit) {
    let best = null;
    for (const foe of foesOf(state, unit)) if (!best || foe.hp < best.hp) best = foe;
    return best;
}
function orbBlock(ctx, unit, amount, kit) {
    if (amount > 0) kit.gainBlock(ctx, unit, amount, orbSource(unit, 'frost'));
}
// 被动（M02）：雷珠打随机敌人、霜珠给格挡、蚀珠蓄积、晶珠打全体并递减（减到 0 不再造成伤害）；源珠给能量，不吃专注。
function passive(ctx, unit, orb, kit) {
    if (!unit.alive || ctx.state.outcome) return;
    if (orb.kind === 'lightning') lightning(ctx, unit, valueOf(unit, 3), kit);
    else if (orb.kind === 'frost') orbBlock(ctx, unit, valueOf(unit, 2), kit);
    else if (orb.kind === 'dark') orb.charge = Math.min(99, (orb.charge || 0) + valueOf(unit, 6));
    else if (orb.kind === 'plasma') gainEnergy(ctx, unit, 1, kit);
    else if (orb.kind === 'glass' && (orb.charge || 0) > 0) {
        const amount = valueOf(unit, orb.charge);
        for (const foe of foesOf(ctx.state, unit)) orbHit(ctx, unit, foe, amount, 'glass', kit);
        orb.charge -= 1;
    }
}
// 引发（M02）：雷珠 8（雷涌另加层数）、霜珠 5 格挡、蚀珠以蓄积值打生命最低的敌人、源珠 2 能量、晶珠全体 8。
function evoke(ctx, unit, orb, kit) {
    if (!unit.alive || ctx.state.outcome) return;
    kit.emit(ctx, { type: 'evoke', unitId: unit.id, orb: orb.kind });
    if (orb.kind === 'lightning') lightning(ctx, unit, valueOf(unit, 8) + st(unit, 'arc-boost'), kit);
    else if (orb.kind === 'frost') orbBlock(ctx, unit, valueOf(unit, 5), kit);
    else if (orb.kind === 'dark') orbHit(ctx, unit, weakestFoe(ctx.state, unit), orb.charge || 0, 'dark', kit);
    else if (orb.kind === 'plasma') gainEnergy(ctx, unit, 2, kit);
    else if (orb.kind === 'glass') for (const foe of foesOf(ctx.state, unit)) orbHit(ctx, unit, foe, valueOf(unit, 8), 'glass', kit);
}
// 凝结（M01）：满槽时先引发最早的一颗再放入；蚀珠初始蓄积 6，晶珠初始 4。
function channel(ctx, unit, kind, kit) {
    const orbs = orbsOf(ctx, unit, kit);
    if (!orbs || !unit.alive || ctx.state.outcome) return;
    if (orbs.list.length >= orbs.slots) evoke(ctx, unit, orbs.list.shift(), kit);
    if (!unit.alive || ctx.state.outcome) return;
    orbs.list.push(kind === 'dark' ? { kind, charge: 6 } : kind === 'glass' ? { kind, charge: 4 } : { kind });
    kit.emit(ctx, { type: 'channel', unitId: unit.id, orb: kind });
}
// 多重引发（M04）：最前一颗引发 times 次后移除。
function evokeFirst(ctx, unit, times, kit) {
    const orbs = unit.res?.orbs;
    const orb = orbs?.list[0];
    if (!orb) return;
    for (let i = 0; i < times && unit.alive && !ctx.state.outcome; i += 1) evoke(ctx, unit, orb, kit);
    const index = orbs.list.indexOf(orb);
    if (index >= 0) orbs.list.splice(index, 1);
}
// 额外触发（M04）：最前一颗的被动额外触发 times 次，不消耗。
function pulseFirst(ctx, unit, times, kit) {
    const orb = unit.res?.orbs?.list[0];
    for (let i = 0; orb && i < times && unit.alive && !ctx.state.outcome; i += 1) passive(ctx, unit, orb, kit);
}


const intOp = (op, min, max) => ({
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'amount'], path, state);
        return { op, amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, min, max) };
    },
});

registerMechanic({
    key: 'orb', family: 'orb', archetypes: ['mage'], unitKinds: ['deck'],
    statuses: [
        { key: 'flux', label: '临时专注' },
        { key: 'arc-storm', label: '雷暴' },
        { key: 'lock-on', label: '锁定', debuff: true, decay: true },
        { key: 'storm-heart', label: '雷心' },
        { key: 'static-shell', label: '静电' },
        { key: 'arc-boost', label: '雷涌' },
    ],
    ops: {
        channel: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'orb', 'amount'], path, state);
                const orb = kit.enumField(effect.orb, kit.joinPath(path, 'orb'), state, ORB_KINDS);
                return orb ? { op: 'channel', orb, amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 3, 1) } : undefined;
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                for (let i = 0; i < effect.amount && unit.alive && !ctx.state.outcome; i += 1) channel(ctx, unit, effect.orb, kit);
            },
            value: (e) => e.amount * (ORB_VALUE[e.orb] || 0),
            describe: (e) => `凝结 ${e.amount} 颗${ORB_NAME[e.orb]}`,
            brief: (e) => `${ORB_NAME[e.orb]}${e.amount}`,
        },
        evoke: {
            ...intOp('evoke', 1, 3),
            apply(ctx, unit, effect, aimId, source, kit) {
                evokeFirst(ctx, unit, effect.amount, kit);
            },
            value: (e) => e.amount * 7,
            describe: (e) => (e.amount > 1 ? `引发最前一颗法珠 ${e.amount} 次` : '引发最前一颗法珠'),
            brief: (e) => `引发${e.amount}`,
        },
        'orb-pulse': {
            ...intOp('orb-pulse', 1, 2),
            apply(ctx, unit, effect, aimId, source, kit) {
                pulseFirst(ctx, unit, effect.amount, kit);
            },
            value: (e) => e.amount * 5,
            describe: (e) => `最前一颗法珠的被动额外触发 ${e.amount} 次`,
            brief: (e) => `触发${e.amount}`,
        },
        'orb-slot': {
            ...intOp('orb-slot', 1, 2),
            apply(ctx, unit, effect, aimId, source, kit) {
                const orbs = orbsOf(ctx, unit, kit);
                if (!orbs) return;
                const next = Math.min(ORB_SLOTS_MAX, orbs.slots + effect.amount);
                if (next === orbs.slots) return;
                orbs.slots = next;
                kit.emit(ctx, { type: 'orb-slot', unitId: unit.id, slots: next });
            },
            value: (e) => e.amount * 6,
            describe: (e) => `法珠槽 +${e.amount}（至多 ${ORB_SLOTS_MAX} 槽）`,
            brief: (e) => `槽+${e.amount}`,
        },
        focus: {
            ...intOp('focus', -3, 3),
            apply(ctx, unit, effect, aimId, source, kit) {
                const res = kit.resOf(ctx, unit);
                if (!res || !effect.amount) return;
                res.focus = Math.max(-10, Math.min(10, (res.focus || 0) + effect.amount));
                kit.emit(ctx, { type: 'focus', unitId: unit.id, delta: effect.amount, value: res.focus });
            },
            value: (e) => e.amount * 6,
            describe: (e) => (e.amount > 0 ? `获得 ${e.amount} 点专注` : `失去 ${-e.amount} 点专注`),
            brief: (e) => `专注${e.amount > 0 ? '+' : ''}${e.amount}`,
        },
    },
    hooks: {
        // 回合结束：雷珠、霜珠、蚀珠、晶珠按槽位顺序触发被动（此时临时专注仍有效）。
        'turn-end-before'(ctx, { unit }, kit) {
            for (const orb of [...(unit.res?.orbs?.list || [])]) {
                if (!unit.alive || ctx.state.outcome) return;
                if (orb.kind !== 'plasma') passive(ctx, unit, orb, kit);
            }
        },
        // 临时专注只持续到本回合结束。
        'turn-end-after'(ctx, { unit }, kit) {
            if (st(unit, 'flux')) kit.setStatus(unit, 'flux', 0);
        },
        // 回合开始：源珠各给 1 点能量。
        'turn-start-after'(ctx, { unit }, kit) {
            for (const orb of unit.res?.orbs?.list || []) if (orb.kind === 'plasma' && unit.alive) passive(ctx, unit, orb, kit);
        },
        // 雷心（M07）：每打出一张能力牌凝结层数颗雷珠；只算出牌前已有的雷心，带雷心的这张牌本身不触发。
        'play-before'(ctx, { unit, card }, kit) {
            const n = card?.type === 'power' ? st(unit, 'storm-heart') : 0;
            if (n) kit.resOf(ctx, unit).stormArmed = n;
        },
        'play-after'(ctx, { unit }, kit) {
            const n = unit.res?.stormArmed || 0;
            if (!n) return;
            delete unit.res.stormArmed;
            if (!Object.keys(unit.res).length) delete unit.res;
            for (let i = 0; i < n && unit.alive && !ctx.state.outcome; i += 1) channel(ctx, unit, 'lightning', kit);
        },
        // 静电（M07）：受到未被格挡的攻击伤害时凝结层数颗雷珠。
        'damage-after'(ctx, { target, kind, hpLoss }, kit) {
            const n = kind === 'attack' && hpLoss > 0 && target.kind === 'deck' ? st(target, 'static-shell') : 0;
            for (let i = 0; i < n && target.alive && !ctx.state.outcome; i += 1) channel(ctx, target, 'lightning', kit);
        },
    },
    report(event, kit) {
        if (event.unitId !== kit.actorId) return;
        if (event.type === 'channel') kit.note(event.unitId, `凝结${ORB_NAME[event.orb]}`);
        else if (event.type === 'evoke') kit.note(event.unitId, `引发${ORB_NAME[event.orb]}`);
        else if (event.type === 'focus') kit.note(event.unitId, event.delta > 0 ? `获得 ${event.delta} 点专注` : `失去 ${-event.delta} 点专注`);
    },
});

