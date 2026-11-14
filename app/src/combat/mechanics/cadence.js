// 规则 v5 P3 乐师「心境、乐势与预知」（cadence 族，只给乐师）：B01 心境、B02 乐势、B03 乐势来源、B04 心境联动、
// B05 预知、B06 保留减费、B07 回响、B08 加演；B09 随机分支沿用 cadence 族已有模板 fumble。
// 心境记在 res.stance（neutral / calm / wrath / divinity），乐势记在 res.momentum（0–9）；怒意与神临的倍率经伤害修正阶段，只作用于攻击伤害。
// 预知取抽牌堆顶（draw 数组末尾），按 pile.js 的约定由程序按估值弃牌，直接移入弃牌堆、不经 discardCard，不触发任何弃牌收益。
// 加演只经 engineKit.grantEncore 登记，行动顺序由 engine.js 处理。
import { registerMechanic } from './registry.js';

const MOMENTUM_GOAL = 10;
const MOMENTUM_KEEP = 9;
const STANCES = ['neutral', 'calm', 'wrath', 'divinity'];
const STANCE_NAME = Object.freeze({ neutral: '中立', calm: '静心', wrath: '怒意', divinity: '神临' });
const STANCE_VALUE = Object.freeze({ neutral: 1, calm: 5, wrath: 4, divinity: 14 });
const OUT_MULT = Object.freeze({ wrath: 2, divinity: 3 });
const CALM_EXIT_ENERGY = 2;
const DIVINITY_ENERGY = 3;
const st = (unit, key) => unit?.statuses?.[key] || 0;
const stanceOf = (unit) => unit?.res?.stance || 'neutral';
const statusSource = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}
function gainEnergy(ctx, unit, amount, kit) {
    unit.energy += amount;
    kit.emit(ctx, { type: 'energy', unitId: unit.id, amount });
}
function statusBlock(ctx, unit, amount, id, kit) {
    const value = kit.computeBlock(unit, amount, unit, ctx.state.rulesVersion);
    if (value > 0) kit.gainBlock(ctx, unit, value, statusSource(unit, id));
}

// 进入心境（B01）：同一心境不重复进入；离开静心 +2 能量，进入神临 +3 能量；每次切换触发心盾，进入怒意时触发怒思（B04）。
function enterStance(ctx, unit, next, kit) {
    const res = kit.resOf(ctx, unit);
    if (!res || !unit.alive) return false;
    const prev = stanceOf(unit);
    if (prev === next) {
        if (!Object.keys(res).length) delete unit.res;
        return false;
    }
    res.stance = next;
    kit.emit(ctx, { type: 'stance', unitId: unit.id, from: prev, to: next });
    if (prev === 'calm') gainEnergy(ctx, unit, CALM_EXIT_ENERGY, kit);
    if (next === 'divinity') gainEnergy(ctx, unit, DIVINITY_ENERGY, kit);
    const ward = st(unit, 'stance-ward');
    if (ward) statusBlock(ctx, unit, ward, 'stance-ward', kit);
    const draws = next === 'wrath' ? st(unit, 'wrath-draw') : 0;
    if (draws && unit.alive && !ctx.state.outcome) kit.drawCards(ctx, unit, draws);
    return true;
}

// 获得乐势（B02）：累计到 10 进入神临，扣掉 10 后余下的保留，最多 9。
function gainMomentum(ctx, unit, amount, kit) {
    const res = kit.resOf(ctx, unit);
    if (!res || amount <= 0 || !unit.alive) return;
    let value = (res.momentum || 0) + amount;
    const ascend = value >= MOMENTUM_GOAL;
    if (ascend) value = Math.min(MOMENTUM_KEEP, value - MOMENTUM_GOAL);
    res.momentum = value;
    kit.emit(ctx, { type: 'momentum', unitId: unit.id, delta: amount, value, ascend });
    if (ascend) enterStance(ctx, unit, 'divinity', kit);
}

// 预知（B05）：查看抽牌堆顶 N 张（抽牌堆不足时只看现有的，不洗牌），弃掉不能打出的牌与估值不到所见最高者一半的牌；
// 弃掉的牌直接移入弃牌堆，不经 discardCard：不计弃牌数，不触发被丢弃时、狡黠与弃牌总线。其余按原顺序留在堆顶。
const DEAD_ID = /^(status-|curse-)/;
function foresee(ctx, unit, amount, kit) {
    const pile = ctx.state.piles[unit.id];
    if (!pile) return;
    const seen = pile.draw.slice(-amount);
    const rated = seen.map((inst) => {
        const card = kit.cardView(ctx.state, inst);
        const dead = !card || Boolean(card.unplayable) || DEAD_ID.test(card.id);
        return { inst, dead, value: dead ? 0 : kit.cardValue(card.effects) };
    });
    const best = Math.max(0, ...rated.map((r) => r.value));
    const tossed = rated.filter((r) => r.dead || r.value < best / 2).map((r) => r.inst);
    for (const inst of tossed) {
        pile.draw.splice(pile.draw.lastIndexOf(inst), 1);
        pile.discard.push(inst);
    }
    kit.emit(ctx, { type: 'foresee', unitId: unit.id, seen: seen.length, discarded: tossed });
    const ward = st(unit, 'scry-ward');
    if (ward) statusBlock(ctx, unit, ward, 'scry-ward', kit);
    // 规则 v6 G5b：预知后。
    if (ctx.state.rulesVersion >= 6) kit.fireBus(ctx, unit, 'foresee', null);
}

// 保留减费（B06）：回合结束后仍在手中的牌记进 res.kept，下一回合这些牌费用 -1；每个回合结束重新记。
const keptOf = (owner) => (st(owner, 'keep-discount') && Array.isArray(owner?.res?.kept) ? owner.res.kept : null);

registerMechanic({
    key: 'cadence', family: 'cadence', archetypes: ['bard'], unitKinds: ['deck'],
    statuses: [
        { key: 'chant', label: '吟诵' },
        { key: 'seethe', label: '酝怒' },
        { key: 'stance-ward', label: '心盾' },
        { key: 'wrath-draw', label: '怒思' },
        { key: 'calm-guard', label: '止水' },
        { key: 'scry-ward', label: '观兆' },
        { key: 'keep-discount', label: '余韵' },
        { key: 'echo-play', label: '回响' },
    ],
    ops: {
        'enter-stance': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'stance'], path, state);
                const stance = kit.enumField(effect.stance, kit.joinPath(path, 'stance'), state, STANCES);
                return stance ? { op: 'enter-stance', stance } : undefined;
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                enterStance(ctx, unit, effect.stance, kit);
            },
            value: (e) => STANCE_VALUE[e.stance] || 0,
            describe: (e, kit) => (e.stance === 'neutral' ? `回到${kit.kw('res:stance:neutral', '中立')}心境` : `进入${kit.kw(`res:stance:${e.stance}`, STANCE_NAME[e.stance])}`),
            brief: (e) => STANCE_NAME[e.stance] || '',
        },
        momentum: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount'], path, state);
                return { op: 'momentum', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 5) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                gainMomentum(ctx, unit, effect.amount, kit);
            },
            value: (e) => e.amount * 1.5,
            describe: (e, kit) => `获得 ${e.amount} 点${kit.kw('res:momentum', '乐势')}`,
            brief: (e) => `乐势${e.amount}`,
        },
        foresee: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount'], path, state);
                return { op: 'foresee', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 5) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                foresee(ctx, unit, effect.amount, kit);
            },
            value: (e) => e.amount * 1.5,
            describe: (e) => `预知 ${e.amount}：查看抽牌堆顶 ${e.amount} 张，弃掉无用的牌（不触发弃牌效果）`,
            brief: (e) => `预知${e.amount}`,
        },
        'curtain-call': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op'], path, state);
                return { op: 'curtain-call' };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                kit.grantEncore(ctx, unit);
            },
            value: () => 12,
            describe: () => '加演：本回合结束后立即再行动一次，敌人不动（每场一次）',
            brief: () => '加演',
        },
    },
    modifiers: {
        'outgoing-mult': (attacker, target, value) => value * (OUT_MULT[stanceOf(attacker)] || 1),
        'incoming-mult': (attacker, target, value) => (stanceOf(target) === 'wrath' ? value * 2 : value),
        'card-cost': (state, owner, view) => {
            const kept = keptOf(owner);
            return kept && kept.includes(view.inst) && state.piles?.[owner.id]?.hand.includes(view.inst) ? view.cost - 1 : view.cost;
        },
    },
    hooks: {
        // 回合开始：先退出上回合的神临，再处理酝怒（进入怒意），最后吟诵获得乐势（可能当场再进神临）。
        'turn-start-after'(ctx, { unit }, kit) {
            if (unit.kind !== 'deck' || !unit.alive) return;
            if (stanceOf(unit) === 'divinity') enterStance(ctx, unit, 'neutral', kit);
            if (st(unit, 'seethe') && unit.alive) {
                kit.setStatus(unit, 'seethe', 0);
                enterStance(ctx, unit, 'wrath', kit);
            }
            const chant = st(unit, 'chant');
            if (chant && unit.alive && !ctx.state.outcome) gainMomentum(ctx, unit, chant, kit);
        },
        'turn-end-after'(ctx, { unit }, kit) {
            if (unit.kind !== 'deck') return;
            const guard = stanceOf(unit) === 'calm' ? st(unit, 'calm-guard') : 0;
            if (guard) statusBlock(ctx, unit, guard, 'calm-guard', kit);
            const hand = ctx.state.piles[unit.id]?.hand || [];
            if (st(unit, 'keep-discount') && hand.length) kit.resOf(ctx, unit).kept = [...hand];
            else if (unit.res?.kept) tidyRes(unit, 'kept');
        },
        // 回响（B07）：每回合前 N 张牌整张多执行一次。
        'play-before'(ctx, before, kit) {
            const echo = st(before.unit, 'echo-play');
            if (!echo || (before.unit.cardsPlayed || 0) >= echo) return;
            before.runs *= 2;
            kit.emit(ctx, { type: 'replay', unitId: before.unit.id, inst: before.inst, times: 1, echo: true });
        },
    },
    report(event, kit) {
        if (event.unitId !== kit.actorId) return;
        if (event.type === 'stance') kit.note(event.unitId, event.to === 'neutral' ? '回到中立心境' : `进入${STANCE_NAME[event.to]}`);
        else if (event.type === 'momentum' && event.ascend) kit.note(event.unitId, '乐势满 10，进入神临');
        else if (event.type === 'foresee') kit.note(event.unitId, event.discarded.length ? `预知 ${event.seen} 张，弃掉 ${event.discarded.length} 张` : `预知 ${event.seen} 张`);
        else if (event.type === 'encore') kit.note(event.unitId, '加演：立即再行动一次');
    },
});

