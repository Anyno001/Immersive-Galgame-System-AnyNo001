// 规则 v5 P3 召唤「随从与灾厄」（summon 族，只给召唤）：S01 随从、S02 随从攻击、S03 随从转化、S04 灾厄、S05 灾厄来源、S06 魂牌、S07 虚无联动、S08 造牌联动。
// 随从按 D5 依附主人：记在 res.minion = { hp, maxHp }，不进行动顺序、不能被指定；主人受到的未格挡攻击伤害先扣随从生命（hp-loss-before），非攻击伤害与失去生命不挡。
// 随从攻击不经 computeDamage：不吃主人的攻击力与虚弱，只加骨甲（minion-might）层数，目标易伤照常 ×1.5；伤害种类 minion。
// 灾厄 doom 叠在敌人身上，该敌人回合结束时生命 ≤ 灾厄则倒下（种类 doom 登记为失去生命类）；精英与首领的判定值不超过其最大生命的 50%（D7）。
import { registerMechanic } from './registry.js';

export const SOUL_ID = 'summon-soul';
export const SOUL_NAME = '魂';
const MINION_MAX = 99;
const DOOM_CAP_PCT = 0.5;
const st = (unit, key) => unit?.statuses?.[key] || 0;
const statusSource = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
const minionSource = (unit) => ({ unitId: unit.id, kind: 'minion', id: 'minion' });
const living = (state) => state.order.map((id) => state.units[id]).filter((unit) => unit?.alive);
const foesOf = (state, unit) => living(state).filter((other) => other.side !== unit.side);
export const minionOf = (unit) => (unit?.res?.minion?.hp > 0 ? unit.res.minion : null);

function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}

// 召唤（S01）：随从不在时以 N 生命召出；在时最大与当前生命各 +N（上限 99）。
function summon(ctx, unit, amount, kit) {
    const res = kit.resOf(ctx, unit);
    if (!res || amount <= 0 || !unit.alive) return;
    const now = minionOf(unit);
    const maxHp = Math.min(MINION_MAX, (now ? now.maxHp : 0) + amount);
    const hp = Math.min(maxHp, (now ? now.hp : 0) + amount);
    res.minion = { hp, maxHp };
    kit.emit(ctx, { type: 'summon', unitId: unit.id, amount, hp, maxHp, fresh: !now });
}

// 随从失去生命：降到 0 即倒下并移除；带魂契（minion-bond）时全体敌人同步失去等量生命（S03）。返回实际失去量。
function minionLoss(ctx, owner, amount, kit) {
    const minion = minionOf(owner);
    if (!minion || amount <= 0) return 0;
    const lost = Math.min(minion.hp, amount);
    minion.hp -= lost;
    kit.emit(ctx, { type: 'minion-loss', unitId: owner.id, amount: lost, hp: minion.hp });
    if (minion.hp <= 0) {
        tidyRes(owner, 'minion');
        kit.emit(ctx, { type: 'minion-down', unitId: owner.id });
    }
    if (lost > 0 && st(owner, 'minion-bond')) {
        for (const foe of foesOf(ctx.state, owner)) kit.dealDamage(ctx, foe, lost, statusSource(owner, 'minion-bond'), 'minion-bond', false);
    }
    return lost;
}

// 随从攻击（S02、S03）：随从不在时无效；伤害 = 基础 + 骨甲层数（+ 随从当前或最大生命），目标易伤 ×1.5，不吃主人的攻击力与虚弱。
function minionStrike(ctx, owner, effect, targets, kit) {
    const minion = minionOf(owner);
    if (!minion) return;
    const bonus = effect.bonus === 'hp' ? minion.hp : effect.bonus === 'max' ? minion.maxHp : 0;
    const base = effect.amount + st(owner, 'minion-might') + bonus;
    kit.emit(ctx, { type: 'minion-strike', unitId: owner.id });
    for (const target of targets) {
        if (!target?.alive || ctx.state.outcome) continue;
        const value = st(target, 'vulnerable') > 0 ? Math.floor(base * 1.5) : base;
        kit.dealDamage(ctx, target, value, minionSource(owner), 'minion', true);
    }
}

// 牺牲（S03）：随从倒下，换最大生命 ×2 的格挡，或对全体敌人造成等于最大生命的随从伤害。
function sacrifice(ctx, owner, mode, kit) {
    const minion = minionOf(owner);
    if (!minion) return;
    const { maxHp } = minion;
    tidyRes(owner, 'minion');
    kit.emit(ctx, { type: 'minion-down', unitId: owner.id, sacrificed: true });
    if (mode === 'block') kit.gainBlock(ctx, owner, maxHp * 2, minionSource(owner));
    else for (const foe of foesOf(ctx.state, owner)) kit.dealDamage(ctx, foe, maxHp, minionSource(owner), 'minion', true);
}

// 灾厄判定值（S04、D7）：精英与首领不超过其最大生命的 50%。
function doomThreshold(unit) {
    const doom = st(unit, 'doom');
    return unit.tier === 'elite' || unit.tier === 'boss' ? Math.min(doom, Math.floor(unit.maxHp * DOOM_CAP_PCT)) : doom;
}

// 魂牌（S06）：0 费、抽 1 张、打出后消耗的临时牌；catalog 中已有同 ID 异名牌时放弃。
const soulCard = () => ({
    id: SOUL_ID, name: SOUL_NAME, type: 'skill', cost: 0, rarity: 'basic', skillRef: SOUL_NAME,
    effects: [{ op: 'draw', amount: 1 }, { op: 'exhaust-self' }],
});
function writeSoul(ctx, unit, kit) {
    const known = ctx.state.catalog[unit.id]?.[SOUL_ID];
    if (known && known.name !== SOUL_NAME) return false;
    if (!known) kit.ownCatalog(ctx, unit.id)[SOUL_ID] = soulCard();
    return true;
}
const junkCard = (cardId) => typeof cardId === 'string' && /^(status-|curse-)/.test(cardId);

const areaFactor = (target) => (target === 'all-enemies' ? 1.4 : target === 'random-enemy' ? 0.85 : 1);
const BONUS_TEXT = Object.freeze({ hp: '，并追加随从当前生命', max: '，并追加随从最大生命' });
function statusBlock(ctx, unit, amount, id, kit) {
    const value = kit.computeBlock(unit, amount, unit, ctx.state.rulesVersion);
    if (value > 0) kit.gainBlock(ctx, unit, value, statusSource(unit, id));
}

registerMechanic({
    key: 'summon', family: 'summon', archetypes: ['summoner'], unitKinds: ['deck'],
    statuses: [
        { key: 'doom', label: '灾厄', debuff: true },
        { key: 'minion-might', label: '骨甲' },
        { key: 'minion-bond', label: '魂契' },
        { key: 'doom-touch', label: '缠厄' },
        { key: 'doom-reap', label: '噬厄' },
        { key: 'soul-feast', label: '噬魂' },
        { key: 'soul-blight', label: '魂蚀' },
        { key: 'void-draw', label: '虚引' },
        { key: 'void-guard', label: '虚护' },
        { key: 'craft-might', label: '匠力' },
        { key: 'craft-guard', label: '匠盾' },
    ],
    lossKinds: ['doom', 'minion-bond', 'soul-blight'],
    ops: {
        summon: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount'], path, state);
                return { op: 'summon', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 20) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                summon(ctx, unit, effect.amount, kit);
            },
            value: (e) => e.amount * 1.5,
            describe: (e) => `召唤 ${e.amount}：随从不在时以 ${e.amount} 生命召出，在时最大与当前生命 +${e.amount}`,
            brief: (e) => `召唤${e.amount}`,
        },
        'minion-strike': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'target', 'bonus'], path, state);
                const at = (key) => kit.joinPath(path, key);
                return {
                    op: 'minion-strike',
                    amount: kit.intField(effect.amount, at('amount'), state, 1, 30),
                    target: kit.enumField(effect.target, at('target'), state, kit.OFFENSE_TARGETS, 'enemy'),
                    ...(effect.bonus === undefined ? {} : { bonus: kit.enumField(effect.bonus, at('bonus'), state, ['hp', 'max']) }),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                minionStrike(ctx, unit, effect, kit.targets(), kit);
            },
            value: (e) => e.amount * areaFactor(e.target) * 0.9 + (e.bonus ? 6 : 0),
            describe: (e, kit) => `随从${kit.on(e.target)}造成 ${e.amount} 点伤害${BONUS_TEXT[e.bonus] || ''}（随从不在时无效）`,
            brief: (e) => `随从${e.amount}`,
        },
        sacrifice: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'mode'], path, state);
                const mode = kit.enumField(effect.mode, kit.joinPath(path, 'mode'), state, ['block', 'nova']);
                return mode ? { op: 'sacrifice', mode } : undefined;
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                sacrifice(ctx, unit, effect.mode, kit);
            },
            value: (e) => (e.mode === 'block' ? 10 : 12),
            describe: (e) => (e.mode === 'block' ? '牺牲随从：获得等于其最大生命 2 倍的格挡' : '牺牲随从：对全体敌人造成等于其最大生命的伤害'),
            brief: () => '牺牲',
        },
        soul: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount'], path, state);
                return { op: 'soul', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 3) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                if (unit.kind !== 'deck' || !kit.resOf(ctx, unit) || !writeSoul(ctx, unit, kit)) return;
                let count = 0;
                for (let i = 0; i < effect.amount; i += 1) if (kit.addTempCard(ctx, unit, { cardId: SOUL_ID, upgraded: false }, 'hand')) count += 1;
                if (count) kit.emit(ctx, { type: 'soul', unitId: unit.id, count });
            },
            value: (e) => e.amount * 3,
            describe: (e) => `把 ${e.amount} 张魂牌（0 费、抽 1 张、打出后消耗）加入手牌`,
            brief: (e) => `魂${e.amount}`,
        },
    },
    hooks: {
        // S01：主人受到的未格挡攻击伤害先扣随从生命，超出部分由主人承受；非攻击伤害与失去生命不挡。
        'hp-loss-before'(ctx, pre, kit) {
            if (pre.kind !== 'attack' || !minionOf(pre.target)) return;
            pre.hpLoss -= minionLoss(ctx, pre.target, pre.hpLoss, kit);
        },
        // S04：本单位回合结束时生命不高于灾厄判定值即倒下。
        'turn-end-after'(ctx, { unit }, kit) {
            const threshold = unit.alive && st(unit, 'doom') ? doomThreshold(unit) : 0;
            if (threshold <= 0 || unit.hp > threshold) return;
            kit.emit(ctx, { type: 'doom', unitId: unit.id, doom: st(unit, 'doom'), threshold });
            kit.dealDamage(ctx, unit, unit.hp, statusSource(unit, 'doom'), 'doom', false);
        },
        'play-after'(ctx, { unit, card, targetId }, kit) {
            const touch = st(unit, 'doom-touch');
            const target = targetId != null ? ctx.state.units[targetId] : null;
            if (touch && target?.alive && target.side !== unit.side) kit.addStatus(ctx, target, 'doom', touch, statusSource(unit, 'doom-touch'));
            const guard = card?.ethereal ? st(unit, 'void-guard') : 0;
            if (guard && unit.alive) statusBlock(ctx, unit, guard, 'void-guard', kit);
            if (card?.id !== SOUL_ID || !unit.alive || ctx.state.outcome) return;
            const feast = st(unit, 'soul-feast');
            if (feast) summon(ctx, unit, feast, kit);
            const blight = st(unit, 'soul-blight');
            const foes = blight ? foesOf(ctx.state, unit) : [];
            if (foes.length) kit.dealDamage(ctx, foes[kit.rollInt(ctx.state, foes.length)], blight, statusSource(unit, 'soul-blight'), 'soul-blight', false);
        },
        // S07：每抽到一张虚无牌再抽 1 张。
        draw(ctx, { unit, insts }, kit) {
            if (unit.kind !== 'deck' || !st(unit, 'void-draw') || !unit.alive) return;
            const extra = (insts || []).filter((inst) => kit.cardView(ctx.state, inst)?.ethereal).length * st(unit, 'void-draw');
            if (extra > 0) kit.drawCards(ctx, unit, extra);
        },
        // S08：每生成一张临时牌（状态牌与诅咒除外）获得攻击力或格挡。
        create(ctx, { unit, cardId }, kit) {
            if (!unit?.alive || junkCard(cardId)) return;
            const might = st(unit, 'craft-might');
            if (might) kit.addStatus(ctx, unit, 'strength', might, statusSource(unit, 'craft-might'));
            const guard = st(unit, 'craft-guard');
            if (guard) statusBlock(ctx, unit, guard, 'craft-guard', kit);
        },
        // S05 噬厄：本方攻击或随从攻击造成生命损失时，给目标等量灾厄。
        'damage-after'(ctx, { target, source, kind, hpLoss }, kit) {
            if ((kind !== 'attack' && kind !== 'minion') || !(hpLoss > 0) || !target.alive) return;
            const attacker = source?.unitId != null ? ctx.state.units[source.unitId] : null;
            if (!attacker || attacker.side === target.side || !st(attacker, 'doom-reap')) return;
            kit.addStatus(ctx, target, 'doom', hpLoss * st(attacker, 'doom-reap'), statusSource(attacker, 'doom-reap'));
        },
    },
    report(event, kit) {
        if (event.unitId !== kit.actorId) return;
        if (event.type === 'summon') kit.note(event.unitId, event.fresh ? `召出随从（${event.hp} 生命）` : `随从生命 +${event.amount}`);
        else if (event.type === 'minion-down') kit.note(event.unitId, event.sacrificed ? '牺牲随从' : '随从倒下');
        else if (event.type === 'soul') kit.note(event.unitId, `获得 ${event.count} 张魂牌`);
    },
});

