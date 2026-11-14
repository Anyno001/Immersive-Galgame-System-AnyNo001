// 规则 v5 P3 召唤「随从与灾厄」（summon 族，只给召唤）：S01 随从、S02 随从攻击、S03 随从转化、S04 灾厄、S05 灾厄来源、S06 魂牌、S07 虚无联动、S08 造牌联动。
// 随从按 D5 依附主人：记在 res.minion = { hp, maxHp }，不进行动顺序、不能被指定；主人受到的未格挡攻击伤害先扣随从生命（hp-loss-before），非攻击伤害与失去生命不挡。
// 随从攻击不经 computeDamage：不吃主人的攻击力与虚弱，只加骨甲（minion-might）层数，目标易伤照常 ×1.5；伤害种类 minion。
// 灾厄 doom 叠在敌人身上，该敌人回合结束时生命 ≤ 灾厄则倒下（种类 doom 登记为失去生命类）；精英与首领的判定值不超过其最大生命的 50%（D7）。
import { registerMechanic } from './registry.js';

export const SOUL_ID = 'summon-soul';
export const SOUL_NAME = '魂';
const SOURCE_SOUL_ID = 'signature-soul';
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

const minionDamage = (owner, target, effect) => {
    const minion = minionOf(owner);
    if (!minion) return 0;
    const bonus = effect.bonus === 'hp' ? minion.hp : effect.bonus === 'max' ? minion.maxHp : 0;
    const base = effect.amount + st(owner, 'minion-might') + bonus;
    return st(target, 'vulnerable') > 0 ? Math.floor(base * 1.5) : base;
};
// 随从攻击（S02、S03）：随从不在时无效；伤害 = 基础 + 骨甲层数（+ 随从当前或最大生命），目标易伤 ×1.5，不吃主人的攻击力与虚弱。
function minionStrike(ctx, owner, effect, targets, kit) {
    if (!minionOf(owner)) return;
    if (Number.isInteger(owner.res.rattleAttacks)) owner.res.rattleAttacks += 1;
    kit.emit(ctx, { type: 'minion-strike', unitId: owner.id });
    for (const target of targets) {
        if (!target?.alive || ctx.state.outcome) continue;
        kit.dealDamage(ctx, target, minionDamage(owner, target, effect), minionSource(owner), 'minion', true);
    }
    // 规则 v6 G5b：随从出手后（主人的被动）。
    if (ctx.state.rulesVersion >= 6) kit.fireBus(ctx, owner, 'minion-act', null);
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
function sourceSouls(ctx, unit, amount, upgraded, kit) {
    const known = ctx.state.catalog[unit.id]?.[SOURCE_SOUL_ID];
    if (known && known.name !== SOUL_NAME) return;
    if (!known) kit.ownCatalog(ctx, unit.id)[SOURCE_SOUL_ID] = {
        id: SOURCE_SOUL_ID, name: SOUL_NAME, type: 'skill', cost: 0, rarity: 'basic', skillRef: SOUL_NAME,
        effects: [{ op: 'draw', amount: 2 }, { op: 'exhaust-self' }],
        upgraded: { effects: [{ op: 'draw', amount: 3 }, { op: 'exhaust-self' }] },
    };
    let count = 0;
    for (let n = 0; n < amount; n += 1) if (kit.addTempCard(ctx, unit, { cardId: SOURCE_SOUL_ID, upgraded }, 'draw')) count += 1;
    if (count) kit.emit(ctx, { type: 'soul', unitId: unit.id, count, to: 'draw' });
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
    lossKinds: ['doom', 'minion-bond', 'soul-blight', 'spirit'],
    ops: {
        'spirit-loss': {
            attribute: { ability: 'damage', key: 'amount', tier: 'normal', timing: 'static' },
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount', 'target'], path, state);
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 20),
                    target: kit.enumField(e.target, kit.joinPath(path, 'target'), state, ['enemy'], 'enemy') };
            },
            apply(ctx, unit, e, aim, source, kit) {
                for (const target of kit.targets()) kit.dealDamage(ctx, target, e.amount, source, 'spirit', false);
            },
            value: e => e.amount * 1.5,
            damage: e => e.amount,
            estimateDamage: (e, kit) => kit.aimId === kit.target?.id ? e.amount : 0,
            describe: (e, kit) => `使指定敌人失去 ${kit.fmt(e.amount)} 点生命（无视格挡）`,
            brief: e => `失血${e.amount}`,
        },
        'soul-draw': {
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount'], path, state);
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 8) };
            },
            apply(ctx, unit, e, aim, source, kit) { sourceSouls(ctx, unit, e.amount, false, kit); },
            value: e => e.amount * 6,
            describe: e => `将 ${e.amount} 张魂（0 费，抽 2 张牌后消耗；升级抽 3 张）随机加入抽牌堆`,
            brief: e => `入堆魂${e.amount}`,
        },
        dirge: {
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount', 'upgraded'], path, state);
                if (e.upgraded !== undefined && typeof e.upgraded !== 'boolean') kit.addIssue(state, kit.joinPath(path, 'upgraded'), 'expected-boolean');
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 6), ...(e.upgraded === true ? { upgraded: true } : {}) };
            },
            apply(ctx, unit, e, aim, source, kit) {
                const count = Math.min(20, ctx.state.play?.xSpent ?? 0);
                for (let n = 0; n < count && unit.alive && !ctx.state.outcome; n += 1) summon(ctx, unit, e.amount, kit);
                sourceSouls(ctx, unit, count, e.upgraded === true, kit);
            },
            value: e => 2 * (e.amount * 1.5 + (e.upgraded ? 10 : 6)),
            describe: e => `按本次投入 X 点能量召唤 ${e.amount} 共 X 次，并将 X 张${e.upgraded ? '升级的' : ''}魂随机加入抽牌堆`,
            brief: () => 'X召魂',
        },
        rattle: {
            attribute: { ability: 'cha', key: 'amount', tier: 'support', timing: 'static' },
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount', 'target'], path, state);
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 40), target: kit.enumField(e.target, kit.joinPath(path, 'target'), state, ['enemy'], 'enemy') };
            },
            apply(ctx, unit, e, aim, source, kit) {
                const hits = Math.min(20, 1 + (unit.res?.rattleAttacks || 0));
                for (let n = 0; n < hits && unit.alive && !ctx.state.outcome; n += 1) minionStrike(ctx, unit, e, kit.targets(), kit);
            },
            value: e => e.amount * 2.7,
            damage: e => e.amount * 20,
            estimateDamage: (e, kit) => e.target === 'enemy' && kit.aimId !== kit.target?.id ? 0
                : minionDamage(kit.attacker, kit.target, e) * Math.min(20, 1 + (kit.attacker?.res?.rattleAttacks || 0)),
            describe: e => `随从对指定敌人造成 ${e.amount} 点伤害，本回合此前每攻击一次再多打一段（至多 20 段）`,
            brief: () => '随从连段',
        },
        'bind-doom': {
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount', 'target'], path, state);
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 8), target: kit.enumField(e.target, kit.joinPath(path, 'target'), state, ['enemy'], 'enemy') };
            },
            apply(ctx, unit, e, aim, source, kit) {
                const [target] = kit.targets();
                if (target?.alive) (kit.resOf(ctx, unit).doomLinks ||= []).push({ targetId: target.id, amount: e.amount, id: source.id });
            },
            value: e => e.amount * 3,
            describe: e => `本回合每打出一张牌，都对本次指定的敌人施加 ${e.amount} 灾厄`,
            brief: () => '本回合缚厄',
        },
        'doom-all': {
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount', 'target'], path, state);
                const target = kit.enumField(e.target, kit.joinPath(path, 'target'), state, ['all-enemies'], 'all-enemies');
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 60), target };
            },
            apply(ctx, unit, e, aim, source, kit) {
                const foes = foesOf(ctx.state, unit);
                for (const foe of foes) if (foe.alive && !ctx.state.outcome) kit.addStatus(ctx, foe, 'doom', e.amount, source);
                for (const foe of foes) if (foe.alive && !ctx.state.outcome && st(foe, 'doom') >= foe.hp) kit.defeatUnit(ctx, foe, source, 'doom');
            },
            value: e => e.amount * 1.68 + 3,
            describe: e => `对全体敌人施加 ${e.amount} 灾厄，然后立即击倒灾厄不低于生命的敌人（此即时判定不受精英／首领半血限制）`,
            brief: () => '全体灾厄处决',
        },
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
            attribute: { ability: 'cha', key: 'amount', tier: 'support', timing: 'static' },
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
            estimateDamage: (e, kit) => {
                if (!kit.attacker?.attributePolicy) return 0;
                const aim = e.target || 'enemy';
                return aim === 'all-enemies' || (aim === 'enemy' && kit.aimId === kit.target.id)
                    ? minionDamage(kit.attacker, kit.target, e) : 0;
            },
            describe: (e, kit) => `随从${kit.on(e.target)}造成 ${kit.fmt(e.amount, 'amount', false)} 点伤害${BONUS_TEXT[e.bonus] || ''}（随从不在时无效）`,
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
                return { op: 'soul', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 4) };
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
        'battle-start'(ctx, payload, kit) {
            const tracks = effects => (effects || []).some(e => e.op === 'rattle' || tracks(e.then) || tracks(e.a) || tracks(e.b));
            for (const id of ctx.state.order) {
                const unit = ctx.state.units[id];
                if (unit?.kind === 'deck' && Object.values(ctx.state.catalog[id] || {}).some(card => tracks(card.effects) || tracks(card.upgraded?.effects))) kit.resOf(ctx, unit).rattleAttacks = 0;
            }
        },
        'turn-start-before'(ctx, { unit }) {
            if (Number.isInteger(unit.res?.rattleAttacks)) unit.res.rattleAttacks = 0;
        },
        // S01：主人受到的未格挡攻击伤害先扣随从生命，超出部分由主人承受；非攻击伤害与失去生命不挡。
        'hp-loss-before'(ctx, pre, kit) {
            if (pre.kind !== 'attack' || !minionOf(pre.target)) return;
            pre.hpLoss -= minionLoss(ctx, pre.target, pre.hpLoss, kit);
        },
        // S04：本单位回合结束时生命不高于灾厄判定值即倒下。
        'turn-end-after'(ctx, { unit }, kit) {
            if (unit.res?.doomLinks) delete unit.res.doomLinks;
            const threshold = unit.alive && st(unit, 'doom') ? doomThreshold(unit) : 0;
            if (threshold <= 0 || unit.hp > threshold) return;
            kit.emit(ctx, { type: 'doom', unitId: unit.id, doom: st(unit, 'doom'), threshold });
            kit.dealDamage(ctx, unit, unit.hp, statusSource(unit, 'doom'), 'doom', false);
        },
        'play-after'(ctx, { unit, card, targetId }, kit) {
            for (const link of unit.res?.doomLinks || []) {
                const foe = ctx.state.units[link.targetId];
                if (foe?.alive && unit.alive && !ctx.state.outcome) kit.addStatus(ctx, foe, 'doom', link.amount, { unitId: unit.id, kind: 'buff', id: link.id });
            }
            const touch = st(unit, 'doom-touch');
            const target = targetId != null ? ctx.state.units[targetId] : null;
            if (touch && target?.alive && target.side !== unit.side) kit.addStatus(ctx, target, 'doom', touch, statusSource(unit, 'doom-touch'));
            const guard = card?.ethereal ? st(unit, 'void-guard') : 0;
            if (guard && unit.alive) statusBlock(ctx, unit, guard, 'void-guard', kit);
            if (![SOUL_ID, SOURCE_SOUL_ID].includes(card?.id) || !unit.alive || ctx.state.outcome) return;
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

