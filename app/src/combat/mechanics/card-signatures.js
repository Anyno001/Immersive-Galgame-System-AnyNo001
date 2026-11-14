import { registerMechanic } from './registry.js';

const st = (unit, key) => unit?.statuses?.[key] || 0;
const src = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
const live = (ctx, unit) => unit?.alive && !ctx.state.outcome;
const MINION_STRIKE_ID = 'signature-minion-strike';
const minionStrikeCard = () => ({
    id: MINION_STRIKE_ID, name: '仆从打击', type: 'attack', rarity: 'basic', cost: 0, skillRef: '仆从打击',
    effects: [{ op: 'damage', amount: 6, hits: 1, target: 'enemy' }, { op: 'draw', amount: 1 }, { op: 'exhaust-self' }],
    upgraded: { effects: [{ op: 'damage', amount: 9, hits: 1, target: 'enemy' }, { op: 'draw', amount: 1 }, { op: 'exhaust-self' }] },
});
const handChoices = (state, unit) => state.piles[unit.id].hand.slice();
const label = { 'strike-auto': '狂徒', 'dex-decay': '敏捷衰减', 'focus-decay': '专注衰减', 'retain-save': '保留降费', 'deva-flow': '天神能量', reality: '实境' };

registerMechanic({
    key: 'card-signatures', family: 'general', archetypes: [], unitKinds: ['deck'],
    statuses: Object.entries(label).map(([key, name]) => ({ key, label: name })),
    ops: {
        'transform-minion': {
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'upgraded'], path, state);
                if (kit.scope !== 'top') return kit.addIssue(state, path, 'choose-not-top-level');
                if (e.upgraded !== undefined && typeof e.upgraded !== 'boolean') kit.addIssue(state, kit.joinPath(path, 'upgraded'), 'expected-boolean');
                return { op: e.op, ...(e.upgraded === true ? { upgraded: true } : {}) };
            },
            choice: (state, unit) => ({ options: handChoices(state, unit), count: 1 }),
            apply(ctx, unit, e, aim, source, kit) {
                const [inst] = kit.selectCards(ctx, 'choose', handChoices(ctx.state, unit), 1, 'pick');
                if (!inst) return;
                const known = ctx.state.catalog[unit.id]?.[MINION_STRIKE_ID];
                if (known && known.name !== '仆从打击') return;
                if (!known) kit.ownCatalog(ctx, unit.id)[MINION_STRIKE_ID] = minionStrikeCard();
                const entry = kit.ownCard(ctx, inst);
                const from = entry.cardId;
                entry.cardId = MINION_STRIKE_ID;
                entry.upgraded = e.upgraded === true;
                for (const field of ['grow', 'costMod', 'bonus', 'inscription', 'grants', 'realExhaust']) delete entry[field];
                kit.emit(ctx, { type: 'transform', unitId: unit.id, inst, from, cardId: MINION_STRIKE_ID });
            },
            value: e => 7 + (e.upgraded ? 3 : 0),
            describe: e => `选一张其余手牌，本场变为${e.upgraded ? '升级的' : ''}仆从打击（0 费，造成 ${e.upgraded ? 9 : 6} 伤害，抽 1 张，然后消耗）`,
            brief: () => '仆从变牌',
        },
        'on-event': {
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'trigger', 'then'], path, state);
                if (kit.depth > 0) return kit.addIssue(state, path, 'nested-conditional');
                return { op: e.op, trigger: kit.enumField(e.trigger, kit.joinPath(path, 'trigger'), state, ['exhaust', 'create', 'card-played', 'radiance-shift']),
                    then: kit.arrayField(e.then, kit.joinPath(path, 'then'), state, 1, 2, kit.nested) };
            },
            apply(ctx, unit, e, aim, source) {
                unit.buffs ||= [];
                unit.buffs.push({ id: source.id, trigger: e.trigger, permanent: true, then: e.then });
            },
            value: (e, sum) => sum(e.then) * (e.trigger === 'card-played' ? 4 : 3),
            describe: (e, kit) => `本场每${e.trigger === 'exhaust' ? '真正消耗一张牌' : e.trigger === 'create' ? '生成一张牌（含状态与诅咒）' : e.trigger === 'radiance-shift' ? '次获得或消耗圣辉' : '打出一张牌'}：${kit.sub(e.then)}`,
            brief: () => '持续触发',
        },
        'exhaust-strike': {
            attribute: { ability: 'damage', key: 'amount', tier: 'normal', timing: 'static' },
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount', 'target'], path, state);
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 30),
                    target: kit.enumField(e.target, kit.joinPath(path, 'target'), state, ['enemy'], 'enemy') };
            },
            apply(ctx, unit, e, aim, source, kit) {
                const pile = ctx.state.piles[unit.id];
                const hand = pile.hand.filter(inst => inst !== ctx.inst);
                let count = 0;
                for (const inst of hand) {
                    const index = pile.hand.indexOf(inst);
                    if (index < 0 || !live(ctx, unit)) continue;
                    pile.hand.splice(index, 1);
                    kit.exhaustCard(ctx, unit, inst);
                    count += 1;
                }
                for (let n = 0; n < count && live(ctx, unit); n += 1) {
                    kit.strike(ctx, unit, { op: 'damage', amount: e.amount, hits: 1, target: 'enemy' }, aim, source);
                }
            },
            value: e => e.amount * (4 / 3) * 3 - 1,
            damage: e => e.amount * 10,
            estimateDamage: (e, kit) => kit.estimate([{ op: 'damage', amount: e.amount, hits: 1, target: 'enemy' }])
                * (kit.state?.piles?.[kit.attacker?.id]?.hand || []).filter(inst => inst !== kit.card?.inst).length,
            describe: (e, kit) => `消耗其余全部手牌，每实际消耗一张，对指定敌人造成 ${kit.fmt(e.amount)} 点伤害`,
            brief: () => '消耗连击',
        },
        'orb-barrage': {
            attribute: { ability: 'damage', key: 'amount', tier: 'normal', timing: 'static' },
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount', 'target'], path, state);
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 30),
                    target: kit.enumField(e.target, kit.joinPath(path, 'target'), state, ['enemy'], 'enemy') };
            },
            apply(ctx, unit, e, aim, source, kit) {
                const hits = unit.res?.orbs?.list?.length || 0;
                if (hits) kit.strike(ctx, unit, { op: 'damage', amount: e.amount, hits, target: 'enemy' }, aim, source);
            },
            value: e => e.amount * (4 / 3) * 2,
            damage: e => e.amount * 10,
            estimateDamage: (e, kit) => kit.estimate([{ op: 'damage', amount: e.amount, hits: 1, target: 'enemy' }]) * (kit.attacker?.res?.orbs?.list?.length || 0),
            describe: (e, kit) => `每持有一颗法珠，对指定敌人造成 ${kit.fmt(e.amount)} 点伤害（没有法珠则不攻击）`,
            brief: () => '法珠连击',
        },
        'delay-attack': {
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op'], path, state);
                return { op: e.op };
            },
            apply(ctx, unit, e, aim, source, kit) {
                unit.nextTurn.push({ gain: 'status', status: 'empower-turns', stacks: 1 });
                kit.emit(ctx, { type: 'next-turn', unitId: unit.id, gain: 'attack-double' });
            },
            value: () => 14,
            describe: () => '下回合整回合攻击伤害翻倍',
            brief: () => '下回合倍伤',
        },
        'draw-play': {
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'times'], path, state);
                if (kit.scope !== 'top') return kit.addIssue(state, path, 'choose-not-top-level');
                return { op: e.op, times: kit.intField(e.times, kit.joinPath(path, 'times'), state, 1, 2, 2) };
            },
            choice: (state, unit, e, kit) => ({ options: state.piles[unit.id].draw.filter(inst => !kit.cardView(state, inst)?.unplayable), count: 1 }),
            apply(ctx, unit, e, aim, source, kit) {
                const options = ctx.state.piles[unit.id].draw.filter(inst => !kit.cardView(ctx.state, inst)?.unplayable);
                const [inst] = kit.selectCards(ctx, 'choose', options, 1, 'pick');
                if (inst) kit.autoPlayCard(ctx, unit, inst, e.times, true);
            },
            value: e => e.times * 9,
            describe: e => `从抽牌堆选 1 张牌，免费打出 ${e.times} 次，然后消耗它（内层选牌由程序选择）`,
            brief: () => '选牌连出',
        },
        'extra-turn': {
            validate(e, path, state, kit) { kit.checkKnownFields(e, ['op'], path, state); return { op: e.op }; },
            apply(ctx, unit, e, aim, source, kit) { kit.grantEncore(ctx, unit, true); kit.requestEndTurn(ctx); },
            value: () => 18,
            describe: () => '结束当前回合，立即获得一个额外回合（不限制每场次数）',
            brief: () => '额外回合',
        },
        reboot: {
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount'], path, state);
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 8) };
            },
            apply(ctx, unit, e, aim, source, kit) {
                const pile = ctx.state.piles[unit.id];
                for (const key of ['hand', 'discard', 'exhaust']) {
                    pile.draw.push(...pile[key].filter(inst => inst !== ctx.inst));
                    pile[key] = pile[key].filter(inst => inst === ctx.inst);
                }
                for (let n = pile.draw.length - 1; n > 0; n -= 1) {
                    const j = kit.rollInt(ctx.state, n + 1);
                    [pile.draw[n], pile.draw[j]] = [pile.draw[j], pile.draw[n]];
                }
                kit.emit(ctx, { type: 'reshuffle', unitId: unit.id, count: pile.draw.length, from: 'all' });
                kit.fireBus(ctx, unit, 'shuffle', null);
                kit.drawCards(ctx, unit, e.amount);
            },
            value: e => e.amount * 4 + 2,
            describe: e => `把其余手牌、弃牌和消耗堆全部洗回抽牌堆，然后抽 ${e.amount} 张牌`,
            brief: () => '全堆洗回',
        },
        'finale-hit': {
            attribute: { ability: 'damage', key: 'amount', tier: 'normal', timing: 'static' },
            validate(e, path, state, kit) {
                kit.checkKnownFields(e, ['op', 'amount', 'target'], path, state);
                return { op: e.op, amount: kit.intField(e.amount, kit.joinPath(path, 'amount'), state, 1, 90),
                    target: kit.enumField(e.target, kit.joinPath(path, 'target'), state, ['all-enemies'], 'all-enemies') };
            },
            apply(ctx, unit, e, aim, source, kit) {
                if (!ctx.state.piles[unit.id].draw.length) kit.strike(ctx, unit, { op: 'damage', amount: e.amount, hits: 1, target: 'all-enemies' }, aim, source);
            },
            value: e => e.amount * (4 / 3) * 1.4 * 0.2,
            damage: e => e.amount,
            estimateDamage: (e, kit) => kit.state?.piles?.[kit.attacker?.id]?.draw.length ? 0 : kit.estimate([{ op: 'damage', amount: e.amount, hits: 1, target: 'all-enemies' }]),
            describe: e => `仅抽牌堆为空时可打出：对全体敌人造成 ${e.amount} 点伤害`,
            brief: () => '空堆终结',
        },
    },
    modifiers: {
        'card-play': (state, unit, card) => card.effects?.some(e => e.op === 'finale-hit') && state.piles[unit.id].draw.length ? 'draw-not-empty' : null,
    },
    hooks: {
        'draw-card'(ctx, { unit, inst }, kit) {
            if (!st(unit, 'strike-auto') || !live(ctx, unit)) return;
            const card = kit.cardView(ctx.state, inst);
            if (card && /strike|打击/i.test(card.name)) kit.autoPlayCard(ctx, unit, inst);
        },
        'turn-start-ready'(ctx, { unit }, kit) {
            if (unit.kind !== 'deck' || !live(ctx, unit)) return;
            const dex = st(unit, 'dex-decay');
            if (dex) {
                kit.setStatus(unit, 'dexterity', st(unit, 'dexterity') - dex, undefined, undefined, true);
                kit.emit(ctx, { type: 'status', source: src(unit, 'dex-decay'), target: unit.id, status: 'dexterity', stacks: -dex });
            }
            const focus = st(unit, 'focus-decay');
            if (focus) kit.runEffects(ctx, unit, [{ op: 'focus', amount: -focus }], null, src(unit, 'focus-decay'));
            const flow = st(unit, 'deva-flow');
            if (flow) {
                const res = kit.resOf(ctx, unit);
                res.devaEnergy = Math.min(99, (res.devaEnergy || 0) + flow);
                unit.energy += res.devaEnergy;
                kit.emit(ctx, { type: 'energy', unitId: unit.id, amount: res.devaEnergy, source: src(unit, 'deva-flow') });
            }
        },
        'turn-end-after'(ctx, { unit }, kit) {
            const amount = st(unit, 'retain-save');
            if (!amount || unit.kind !== 'deck') return;
            for (const inst of ctx.state.piles[unit.id].hand) {
                const view = kit.cardView(ctx.state, inst);
                if (typeof view?.cost !== 'number' || view.cost <= 0) continue;
                const entry = kit.ownCard(ctx, inst);
                entry.costMod = Math.max(-99, (entry.costMod || 0) - amount);
                kit.emit(ctx, { type: 'cost-mod', unitId: unit.id, inst, amount: -amount, scope: 'combat' });
            }
        },
        create(ctx, { unit, inst }, kit) {
            if (!st(unit, 'reality') || !inst) return;
            const entry = ctx.state.cards[inst];
            if (!entry || entry.upgraded || !ctx.state.catalog[entry.owner]?.[entry.cardId]?.upgraded) return;
            kit.ownCard(ctx, inst).upgraded = true;
            kit.emit(ctx, { type: 'upgrade-card', unitId: unit.id, inst });
        },
    },
});
