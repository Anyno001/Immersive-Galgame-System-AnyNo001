// 规则 v5 P3 刺客「毒与暗刃」（shadow 族，只给刺客）：A01 毒额外结算、A02 淬刃、A04 毒爆、A05 暗刃、A07 扼喉、A08 尸裂、A09 千刃。
// A01 毒翻倍沿用内置 double，A03 毒雾沿用 each-turn，A06 弃牌收益沿用 buff(discard)，A10 脆弱沿用 sap。
import { registerMechanic } from './registry.js';
import { targetFactor } from './apply-status.js';

export const SHIV_ID = 'shadow-shiv';
export const SHIV_NAME = '暗刃';
export const SHIV_BASE = 4;
const EDGE_MAX = 20;
const FIRST_MAX = 20;
const BURST_EVERY = 3;
const CARRION_PCT = 0.2;
const HONE_MODES = Object.freeze(['edge', 'fan', 'keep', 'first']);
const HONE_AMOUNT = Object.freeze({ edge: 6, first: 13 });
const HONE_TEXT = Object.freeze({
    edge: (n) => `暗刃伤害 +${n}`,
    fan: () => '暗刃改为攻击全体敌人',
    keep: () => '暗刃获得保留',
    first: (n) => `每回合第一张暗刃伤害 +${n}`,
});
const st = (unit, key) => unit?.statuses?.[key] || 0;
const statusSource = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
const living = (state) => state.order.map((id) => state.units[id]).filter((unit) => unit?.alive);
const foesOf = (state, unit) => living(state).filter((other) => other.side !== unit.side);
// 出牌计数键与 battle-state.js 的 cardCountKey 一致（机制文件不引用其他战斗模块）。
const SHIV_COUNT_KEY = `c:${SHIV_ID}`;
export const shivFirstBonus = (unit, cardId) => cardId === SHIV_ID && !(unit?.turnStats?.byCard?.[SHIV_COUNT_KEY] > 0)
    ? unit?.res?.shiv?.first || 0 : 0;

function shivCard(shiv) {
    return {
        id: SHIV_ID, name: SHIV_NAME, type: 'attack', cost: 0, rarity: 'basic', skillRef: SHIV_NAME,
        ...(shiv.keep ? { retain: true } : {}),
        effects: [{ op: 'damage', amount: SHIV_BASE + (shiv.edge || 0), hits: 1, target: shiv.fan ? 'all-enemies' : 'enemy' }, { op: 'exhaust-self' }],
        ...(shiv.upgradable ? { upgraded: { effects: [
            { op: 'damage', amount: SHIV_BASE + (shiv.edge || 0) + 3, hits: 1, target: shiv.fan ? 'all-enemies' : 'enemy' },
            { op: 'exhaust-self' },
        ] } } : {}),
    };
}

// 写入暗刃定义（catalog 中已有同 ID 异名牌时放弃），返回是否可用。
function writeShiv(ctx, unit, kit, shiv) {
    const known = ctx.state.catalog[unit.id]?.[SHIV_ID];
    if (known && known.name !== SHIV_NAME) return false;
    kit.ownCatalog(ctx, unit.id)[SHIV_ID] = shivCard(shiv);
    return true;
}

registerMechanic({
    key: 'shadow-venom', family: 'shadow', archetypes: ['assassin'], unitKinds: ['deck', 'skill'],
    statuses: [
        { key: 'envenom', label: '淬刃' },
        { key: 'venom-burst', label: '毒爆' },
        { key: 'garrote', label: '扼喉', debuff: true },
        { key: 'carrion', label: '尸裂', debuff: true },
        { key: 'bladestorm', label: '千刃' },
    ],
    lossKinds: ['garrote'],
    ops: {
        // A01 毒额外结算：按当前中毒层数让目标失去生命，层数不减。
        'poison-tick': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                return {
                    op: 'poison-tick',
                    amount: kit.intField(effect.amount, at('amount'), state, 1, 2, 1),
                    target: kit.enumField(effect.target, at('target'), state, kit.OFFENSE_TARGETS, 'enemy'),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                for (const target of kit.targets()) {
                    for (let i = 0; i < effect.amount && target.alive && !ctx.state.outcome; i += 1) {
                        const stacks = st(target, 'poison');
                        if (!stacks) break;
                        kit.emit(ctx, { type: 'poison-tick', source, target: target.id, amount: stacks });
                        kit.dealDamage(ctx, target, stacks, source, 'poison', false);
                    }
                }
            },
            value: (e) => e.amount * 6 * targetFactor(e.target),
            describe: (e, kit) => `${kit.on(e.target)}按当前中毒层数立即结算${e.amount > 1 ? ` ${e.amount} 次` : '一次'}（层数不减）`,
            brief: (e) => `毒结${e.amount}`,
        },
    },
    hooks: {
        // A02 淬刃：每段未被格挡的攻击伤害施加等于层数的中毒。
        'damage-after'(ctx, { target, source, kind, amount, blocked }, kit) {
            if (kind !== 'attack' || !(amount > blocked) || source?.unitId == null) return;
            const attacker = ctx.state.units[source.unitId];
            const stacks = st(attacker, 'envenom');
            if (!stacks || !target.alive || attacker.side === target.side) return;
            kit.addStatus(ctx, target, 'poison', stacks, statusSource(attacker, 'envenom'));
        },
        // A04 毒爆：持有者每成功施毒 3 次，对全体敌人造成等于层数的伤害。
        'debuff-applied'(ctx, { target, status, source }, kit) {
            if (status !== 'poison' || source?.unitId == null) return;
            const applier = ctx.state.units[source.unitId];
            const stacks = st(applier, 'venom-burst');
            if (!stacks || !applier.alive || applier.side === target.side) return;
            const res = kit.resOf(ctx, applier);
            res.poisonings = (res.poisonings || 0) + 1;
            if (res.poisonings < BURST_EVERY) return;
            res.poisonings = 0;
            kit.emit(ctx, { type: 'venom-burst', unitId: applier.id, amount: stacks });
            for (const foe of foesOf(ctx.state, applier)) kit.dealDamage(ctx, foe, stacks, statusSource(applier, 'venom-burst'), 'venom-burst', true);
        },
        // A07 扼喉：出牌方每打出一张牌，带扼喉的敌人失去等于层数的生命；A09 千刃：每打出一张牌对全体敌人造成层数伤害。
        'play-after'(ctx, { unit }, kit) {
            for (const foe of foesOf(ctx.state, unit)) {
                const stacks = st(foe, 'garrote');
                if (stacks && unit.alive && !ctx.state.outcome) kit.dealDamage(ctx, foe, stacks, statusSource(unit, 'garrote'), 'garrote', false);
            }
            const storm = st(unit, 'bladestorm');
            if (!storm || !unit.alive) return;
            for (const foe of foesOf(ctx.state, unit)) if (!ctx.state.outcome) kit.dealDamage(ctx, foe, storm, statusSource(unit, 'bladestorm'), 'bladestorm', true);
        },
        // 扼喉只在出牌方本回合有效。
        'turn-end-after'(ctx, { unit }, kit) {
            if (unit.kind !== 'deck') return;
            for (const foe of foesOf(ctx.state, unit)) if (st(foe, 'garrote')) kit.setStatus(foe, 'garrote', 0);
        },
        // A08 尸裂：带尸裂的单位倒下时，按其最大生命的比例伤害同阵营其他存活单位。
        defeated(ctx, { unit }, kit) {
            const stacks = st(unit, 'carrion');
            if (!stacks) return;
            const amount = Math.max(1, Math.floor(unit.maxHp * CARRION_PCT * stacks));
            const others = living(ctx.state).filter((other) => other.side === unit.side && other.id !== unit.id);
            if (!others.length) return;
            kit.emit(ctx, { type: 'carrion', unitId: unit.id, amount });
            for (const other of others) if (!ctx.state.outcome) kit.dealDamage(ctx, other, amount, statusSource(unit, 'carrion'), 'carrion', true);
        },
    },
    report(event, kit) {
        if (event.type === 'venom-burst') kit.note(event.unitId, `毒爆发作，全体敌人受到 ${event.amount} 点伤害`);
        else if (event.type === 'carrion') kit.note(event.unitId, `尸裂波及其他敌人 ${event.amount} 点伤害`);
    },
});

registerMechanic({
    key: 'shadow-shiv', family: 'shadow', archetypes: ['assassin'], unitKinds: ['deck'],
    ops: {
        'discard-shivs': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'upgraded'], path, state);
                if (effect.upgraded !== undefined && typeof effect.upgraded !== 'boolean') kit.addIssue(state, kit.joinPath(path, 'upgraded'), 'expected-boolean');
                return { op: 'discard-shivs', ...(effect.upgraded === true ? { upgraded: true } : {}) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const pile = ctx.state.piles[unit.id];
                let count = 0;
                for (const inst of pile.hand.slice()) {
                    if (inst === ctx.inst || !pile.hand.includes(inst)) continue;
                    kit.discardCard(ctx, unit, inst);
                    count += 1;
                }
                if (!count || !unit.alive || ctx.state.outcome) return;
                const res = kit.resOf(ctx, unit);
                const next = { ...(res.shiv || {}), upgradable: true };
                if (!writeShiv(ctx, unit, kit, next)) return;
                res.shiv = next;
                let made = 0;
                for (let n = 0; n < count; n += 1) {
                    if (kit.addTempCard(ctx, unit, { cardId: SHIV_ID, upgraded: effect.upgraded === true }, 'hand')) made += 1;
                }
                kit.emit(ctx, { type: 'shiv', unitId: unit.id, count: made, discarded: count });
            },
            value: e => 10 + (e.upgraded ? 6 : 0),
            describe: e => `弃掉其余全部手牌，每实际弃掉 1 张，将 1 张${e.upgraded ? '升级的' : ''}暗刃加入手牌`,
            brief: () => '弃牌造刃',
        },
        // A05 暗刃：把 N 张暗刃临时牌加入手牌（每回合临时牌张数有上限）。
        shiv: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount'], path, state);
                return { op: 'shiv', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 4) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                if (unit.kind !== 'deck') return;
                const res = kit.resOf(ctx, unit);
                if (!res || !writeShiv(ctx, unit, kit, res.shiv || {})) return;
                let count = 0;
                for (let i = 0; i < effect.amount; i += 1) if (kit.addTempCard(ctx, unit, { cardId: SHIV_ID, upgraded: false }, 'hand')) count += 1;
                if (count) kit.emit(ctx, { type: 'shiv', unitId: unit.id, count });
            },
            value: (e) => e.amount * 5,
            describe: (e) => `把 ${e.amount} 张暗刃（0 费、打出后消耗，造成 ${SHIV_BASE} 点伤害）加入手牌`,
            brief: (e) => `暗刃${e.amount}`,
        },
        // 暗刃强化：增伤、群攻、保留、首刃，改写本单位暗刃定义，手中暗刃随之变化。
        'hone-shiv': {
            attribute: (effect, card) => effect.mode === 'first'
                ? { ability: 'str', key: 'amount', tier: 'normal', timing: 'static',
                    max: ['template-v1:shiv-first', 'template-v1:phantom-blades'].includes(card?.upgradeModel) ? HONE_AMOUNT.first : 10 } : null,
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'mode', 'amount'], path, state);
                const at = (key) => kit.joinPath(path, key);
                const mode = kit.enumField(effect.mode, at('mode'), state, HONE_MODES);
                if (!HONE_AMOUNT[mode]) {
                    if (effect.amount !== undefined) kit.addIssue(state, at('amount'), 'unknown-field');
                    return { op: 'hone-shiv', mode };
                }
                return { op: 'hone-shiv', mode, amount: kit.intField(effect.amount, at('amount'), state, 1, HONE_AMOUNT[mode]) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                if (unit.kind !== 'deck') return;
                const res = kit.resOf(ctx, unit);
                if (!res) return;
                const prev = res.shiv || {};
                const next = effect.mode === 'edge' ? { ...prev, edge: Math.min(EDGE_MAX, (prev.edge || 0) + effect.amount) }
                    : effect.mode === 'first' ? { ...prev, first: Math.min(FIRST_MAX, (prev.first || 0) + effect.amount) }
                        : { ...prev, [effect.mode]: true };
                if (!writeShiv(ctx, unit, kit, next)) return;
                res.shiv = next;
                kit.emit(ctx, { type: 'hone-shiv', unitId: unit.id, mode: effect.mode });
            },
            value: (e) => (e.mode === 'edge' ? 4 + e.amount * 1.5 : e.mode === 'first' ? 2 + e.amount * 1.2 : e.mode === 'fan' ? 6 : 4),
            describe: (e, kit) => HONE_TEXT[e.mode](e.mode === 'first' ? kit.fmt(e.amount, 'amount', false) : e.amount),
            brief: (e) => (e.mode === 'edge' ? `刃+${e.amount}` : e.mode === 'first' ? `首刃${e.amount}` : e.mode === 'fan' ? '刃群' : '刃留'),
        },
    },
    hooks: {
        // 首刃：本回合打出的第一张暗刃，每次伤害追加首刃值（出牌计数在结算完成后才加）。
        'damage-before'(ctx, payload) {
            const { source, kind } = payload;
            if (kind !== 'attack' || source?.kind !== 'card' || source.id !== SHIV_ID || !ctx.inst) return;
            const attacker = ctx.state.units[source.unitId];
            payload.amount += shivFirstBonus(attacker, source.id);
        },
    },
    report(event, kit) {
        if (event.type === 'shiv' && event.unitId === kit.actorId) kit.note(event.unitId, `取出 ${event.count} 张暗刃`);
    },
});
