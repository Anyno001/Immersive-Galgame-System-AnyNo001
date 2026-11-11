// v0.39.2 平衡补丁的行为用例（共创者 9f12ee5e 新增测试按本地接口改写）：首轮先手不双动、敌人随机选目标、
// 群体折算下限、助战绝招取自身技能、初始装备由程序定加成、主角至少 1 件、专属卡 Lv5 / Lv10 解锁、开战标签后的纯标记行、重新开始。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createBattle, legalActions, replayBattle, seedFor, upcomingActors } from '../src/combat/engine.js';
import { chooseSkillIntent } from '../src/combat/policy.js';
import { BASIC_CARDS, COMBAT_RULES, crowdScaleFor, encounterScaleFor, expProgress, signatureCardAt, signatureSlotOf, signatureUnlockLevel } from '../src/combat/rules.js';
import { createCombatLedger, signaturePending } from '../src/combat/ledger.js';
import { generateEntities, generationWrites, growthEntity, profileGearEntity } from '../src/combat/generation.js';
import { buildSetup } from '../src/combat/session.js';
import { extractCombatStart } from '../src/scene/combat-directives.js';
import { extractLossDirectives, scanLossTags, scanGainTags } from '../src/scene/combat-directives.js';
import { gearIdFor, itemIdFor, ledgerEntryId, REWARD_SLOT_COUNT } from '../src/combat/schema.js';
import { planRewardSlots, victoryExpFor } from '../src/combat/rewards.js';
import { flipOrder } from '../src/combat/flip.js';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createInventoryTables } from '../src/data/shujuku/inventory-tables.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';
import { equippedGear, placeGear, removeGear, slotGearList } from '../src/combat/gear-slots.js';
import { traitLinks } from '../src/combat/traits.js';
import { attributeMultiplier, cardAbility, createAttributePolicy, policyOf, scalePositive, canAttributeSift } from '../src/combat/attribute-policy.js';

test('卡牌属性策略：普通与保守倍率、舍入、冻结职业、非法策略拒收和筛牌资格', () => {
    const attributes = { role: 'warrior', scores: { str: 16, dex: 16, con: 10, int: 8, wis: 14, cha: 20 }, proficiency: 2 };
    const policy = createAttributePolicy({ attributes, classProfile: { archetype: 'mage' } });
    assert.equal(policy.role, 'mage');
    for (const [key, normal, support] of [['str', 1.24, 1.12], ['int', 0.92, 0.96], ['wis', 1.16, 1.08], ['cha', 1.3, 1.15]]) {
        assert.equal(attributeMultiplier(policy, key), normal);
        assert.equal(attributeMultiplier(policy, key, 'support'), support);
    }
    assert.deepEqual([scalePositive(30, 1.24), scalePositive(6, 1.24), scalePositive(1, 0.7), scalePositive(0, 1.3), scalePositive(-2, 1.3)], [37, 7, 1, 0, -2]);
    assert.equal(attributeMultiplier({ ...policy, proficiency: 9 }, 'int'), 1.3);
    assert.equal(cardAbility(policy, 'assassin', 'damage'), 'str');
    assert.equal(cardAbility(policy, 'mage', 'block'), 'int');
    assert.equal(cardAbility(policy, 'general', 'damage'), 'int');
    assert.equal(cardAbility(policy, 'general', 'block'), 'dex');
    assert.equal(canAttributeSift({ attributePolicy: policy }), true);
    assert.equal(policyOf({}), null);
    assert.throws(() => policyOf({ attributePolicy: { ...policy, version: 99 } }), /invalid-attribute-policy/);
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const codes = (result) => result.diagnostics.map((item) => item.code);

// ---------- 引擎 ----------
const dmg = (amount) => ({ op: 'damage', amount, target: 'enemy' });
const idle = { id: 'idle', name: '蓄势', intent: 'buff', effects: [{ op: 'heal', amount: 1, target: 'self' }] };
const claw = (amount) => ({ id: 'claw', name: '爪击', intent: 'attack', effects: [dmg(amount)] });
const hero = (deck, extra = {}) => ({ id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 50, deck, catalog: BASIC_CARDS, ...extra });
const foe = (extra = {}) => ({ id: 'foe', name: '敌人', side: 'enemy', kind: 'skill', maxHp: 60, skills: [idle], ...extra });
const filler = Array(5).fill('basic-defend');
const SEED = seedFor('chat-1|7');
function start(units, extra = {}) {
    const result = createBattle({ controlledId: 'hero', units, ...extra }, SEED);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result.state;
}

test('属性快照：仅显式 v6 新局启用、策略冻结深拷贝、非法快照拒收，旧局逐事件重放不变', () => {
    const policy = createAttributePolicy({ attributes: { scores: { str: 16, dex: 12, con: 10, int: 8, wis: 14, cha: 10 }, proficiency: 2 }, classProfile: { archetype: 'warrior' } });
    const units = () => [hero(filler, { attributePolicy: clone(policy) }), foe()];
    const setup = { rulesVersion: 6, attributeRules: 1, controlledId: 'hero', units: units() };
    const created = createBattle(setup, SEED);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    assert.deepEqual(created.state.units.hero.attributePolicy, policy);
    assert.notEqual(created.state.units.hero.attributePolicy, setup.units[0].attributePolicy);
    assert.notEqual(created.state.units.hero.attributePolicy.scores, setup.units[0].attributePolicy.scores);
    setup.units[0].attributePolicy.scores.str = 30;
    assert.equal(created.state.units.hero.attributePolicy.scores.str, 16);
    assert.equal(created.state.units.foe.attributePolicy, undefined);
    for (const attributeRules of [0, 2, '1', true, null]) {
        assert.equal(createBattle({ ...setup, attributeRules }, SEED).error?.reason, 'invalid-attribute-rules');
    }
    for (const rulesVersion of [undefined, 3, 4, 5]) {
        assert.equal(createBattle({ ...setup, rulesVersion }, SEED).error?.reason, 'invalid-attribute-rules');
    }
    for (const invalid of [undefined, null, {}, { ...policy, version: 99 }, { ...policy, role: 'general' },
        { ...policy, proficiency: 1 }, { ...policy, proficiency: 10 }, { ...policy, proficiency: 2.5 },
        ...[0, 31, 10.5, '16', undefined].map(str => ({ ...policy, scores: { ...policy.scores, str } }))]) {
        assert.equal(createBattle({ ...setup, units: [hero(filler, { attributePolicy: invalid }), foe()] }, SEED).error?.reason, 'invalid-attribute-policy');
    }
    const legacy = { rulesVersion: 6, controlledId: 'hero', units: [hero(filler), foe()] };
    const mixed = { ...legacy, units: [hero(filler, { attributePolicy: { version: 99 } }), foe({ attributePolicy: policy })] };
    const base = createBattle(legacy, SEED);
    const ignored = createBattle(mixed, SEED);
    assert.deepEqual(ignored, base);
    let a = base.state;
    let b = ignored.state;
    const actions = [{ type: 'play', inst: a.piles.hero.hand[0] }, { type: 'end-turn' }];
    for (const action of actions) {
        const expected = applyAction(a, action);
        const actual = applyAction(b, action);
        assert.equal(expected.ok, true, JSON.stringify(expected.error));
        assert.deepEqual(actual.events, expected.events);
        assert.deepEqual(actual.state, expected.state);
        a = expected.state;
        b = actual.state;
    }
    assert.deepEqual(replayBattle(mixed, SEED, actions).state, a);
    assert.deepEqual(replayBattle(legacy, SEED, actions).state, a);
});

test('卡牌逐效果倍率：跨职业读取自身六维，成长与刻印先合并，预估和实际结算一致且不重复缩放', async () => {
    const { cardView, estimateDamage, estimateBlock } = await import('../src/combat/battle-state.js');
    const { attributeCardView } = await import('../src/combat/card-attributes.js');
    const policy = createAttributePolicy({ attributes: { scores: { str: 16, dex: 12, con: 30, int: 8, wis: 14, cha: 20 }, proficiency: 2 }, classProfile: { archetype: 'assassin' } });
    for (const [archetype, hit, block] of [['warrior', 37, 32], ['guardian', 37, 32], ['assassin', 37, 32], ['ranger', 37, 32], ['mage', 28, 28], ['priest', 35, 35], ['summoner', 39, 39], ['bard', 39, 39], ['general', 37, 32]]) {
        const card = { id: 'attribute-card', name: '双式', type: 'attack', cost: 0, rarity: 'common', archetype, effects: [dmg(30), { op: 'block', amount: 30 }] };
        const setup = { rulesVersion: 6, attributeRules: 1, controlledId: 'hero', units: [hero(Array(5).fill(card.id), { attributePolicy: policy, catalog: { [card.id]: card } }), foe({ maxHp: 999 })] };
        const created = createBattle(setup, SEED);
        assert.equal(created.ok, true, JSON.stringify(created.error));
        const state = created.state;
        const inst = state.piles.hero.hand[0];
        const view = cardView(state, inst);
        assert.deepEqual(view.effects.map(e => e.amount), [hit, block], archetype);
        assert.deepEqual(cardView(state, inst), view);
        assert.equal(attributeCardView(view, state.units.hero), view);
        const expectedHit = estimateDamage(state, state.units.hero, state.units.foe, view.effects, 'foe', view);
        const expectedBlock = estimateBlock(state.units.hero, view.effects, 6, 'card', state, 'foe');
        const action = { type: 'play', inst, targetId: 'foe' };
        const played = applyAction(state, action);
        assert.equal(played.ok, true, JSON.stringify(played.error));
        assert.equal(played.events.filter(e => e.type === 'damage' && e.target === 'foe').reduce((sum, e) => sum + e.amount, 0), expectedHit);
        assert.equal(played.state.units.hero.block, expectedBlock);
        assert.deepEqual(replayBattle(setup, SEED, [action]).state, played.state);
        assert.deepEqual(card.effects.map(e => e.amount), [30, 30]);
    }
    const card = { id: 'grown-card', name: '成长斩', type: 'attack', cost: 0, rarity: 'common', archetype: 'warrior', effects: [dmg(6)], upgraded: { effects: [dmg(30)] } };
    const created = createBattle({ rulesVersion: 6, attributeRules: 1, controlledId: 'hero', units: [hero(Array(5).fill({ cardId: card.id, upgraded: true, bonus: { damage: 3 }, inscription: 'sharp' }), { attributePolicy: policy, catalog: { [card.id]: card } }), foe({ maxHp: 999 })] }, SEED);
    const view = cardView(created.state, created.state.piles.hero.hand[0]);
    assert.equal(view.effects[0].amount, 45);
    assert.equal(view.attributeScaling[0].base, 36);
    const effects = [
        { op: 'conditional', when: { kind: 'self-has', value: 'strength' }, then: [dmg(30)] },
        { op: 'random-branch', a: [{ op: 'heal', amount: 30 }], b: [{ op: 'block', amount: 30 }] },
        { op: 'status', status: 'strength', stacks: 10 }, { op: 'status', status: 'weak', stacks: 2 },
        { op: 'next-turn', gain: 'status', status: 'poison', stacks: 10 },
        { op: 'self-damage', amount: 4 }, { op: 'draw', amount: 3 },
    ];
    const nested = attributeCardView({ ...card, effects, onDiscard: [dmg(30)] }, { attributePolicy: policy });
    assert.equal(nested.effects[0].then[0].amount, 37);
    assert.deepEqual([nested.effects[1].a[0].amount, nested.effects[1].b[0].amount], [35, 32]);
    assert.deepEqual(nested.effects.slice(2).map(e => e.stacks ?? e.amount), [11, 2, 11, 4, 3]);
    assert.equal(nested.onDiscard[0].amount, 37);
    assert.equal(attributeCardView(card, {}), card);
});

test('卡牌计数倍率：原始合计只舍入一次，攻击力不重复换算，估算与结算共用金额', async () => {
    const { cardView, estimateDamage, estimateBlock } = await import('../src/combat/battle-state.js');
    const policy = createAttributePolicy({ attributes: { scores: { str: 16, dex: 16, con: 10, int: 10, wis: 16, cha: 10 }, proficiency: 2 }, classProfile: { archetype: 'warrior' } });
    for (const [op, expected] of [['tally-strike', 15], ['tally-guard', 15], ['tally-heal', 15]]) {
        const card = { id: 'tally-card', name: '计数', type: 'skill', cost: 0, rarity: 'common', archetype: 'warrior', effects: [{ op, amount: 1, per: 3, max: 10, source: 'strength', ...(op === 'tally-strike' ? { target: 'enemy' } : {}) }] };
        const setup = { rulesVersion: 6, attributeRules: 1, controlledId: 'hero', units: [hero(Array(5).fill(card.id), { hp: 1, attributePolicy: policy, catalog: { [card.id]: card }, passives: [{ id: 'strength-passive', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 3, target: 'self' }] }] }), foe({ maxHp: 999 })] };
        const state = createBattle(setup, SEED).state;
        const inst = state.piles.hero.hand[0];
        const view = cardView(state, inst);
        assert.equal(view.effects[0].amount, 1);
        assert.equal(state.units.hero.statuses.strength, 3);
        const damage = estimateDamage(state, state.units.hero, state.units.foe, view.effects, 'foe', view);
        const block = estimateBlock(state.units.hero, view.effects, 6, 'card', state, 'foe');
        const action = { type: 'play', inst, ...(op === 'tally-strike' ? { targetId: 'foe' } : {}) };
        const played = applyAction(state, action);
        assert.equal(played.ok, true, JSON.stringify(played.error));
        if (op === 'tally-strike') assert.equal(played.events.find(e => e.type === 'damage' && e.target === 'foe').amount, damage);
        if (op === 'tally-guard') assert.equal(played.state.units.hero.block, block);
        const amount = op === 'tally-strike' ? played.events.find(e => e.type === 'damage' && e.target === 'foe').amount
            : op === 'tally-guard' ? played.state.units.hero.block : played.state.units.hero.hp - 1;
        assert.equal(amount, op === 'tally-strike' ? expected : expected - 3);
        assert.deepEqual(replayBattle(setup, SEED, [action]).state, played.state);
    }
});

test('卡牌来源边界：持续与弃牌效果只换算一次，人物技能与职业装备特性被动保持原值', async () => {
    const { cardView } = await import('../src/combat/battle-state.js');
    const policy = createAttributePolicy({ attributes: { scores: { str: 16, dex: 16, con: 10, int: 10, wis: 16, cha: 10 }, proficiency: 2 }, classProfile: { archetype: 'warrior' } });
    const power = { id: 'attribute-power', name: '恒守', type: 'power', cost: 0, rarity: 'common', archetype: 'warrior', effects: [{ op: 'each-turn', then: [{ op: 'block', amount: 30 }] }] };
    const discarded = { id: 'attribute-discard', name: '弃守', type: 'skill', cost: 0, rarity: 'common', archetype: 'warrior', effects: [{ op: 'energy', amount: 1 }], onDiscard: [{ op: 'block', amount: 30 }] };
    const toss = { id: 'attribute-toss', name: '弃手', type: 'skill', cost: 0, rarity: 'common', effects: [{ op: 'discard-hand' }] };
    const passives = ['class', 'personal', 'gear', 'trait'].map(source => ({ id: `boundary-${source}`, source, trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 2, target: 'self' }] }));
    const setup = { rulesVersion: 6, attributeRules: 1, controlledId: 'hero', units: [hero([power.id, discarded.id, toss.id], {
        draw: 3, attributePolicy: policy, passives, catalog: { [power.id]: power, [discarded.id]: discarded, [toss.id]: toss },
        heroSkill: { id: 'boundary-hero', name: '人物技', effects: [dmg(30)] },
    }), foe({ maxHp: 999 })] };
    const created = createBattle(setup, SEED);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    assert.equal(created.state.units.hero.statuses.strength, 8);
    let state = created.state;
    const instOf = id => Object.keys(state.cards).find(inst => state.cards[inst].cardId === id);
    const actions = [];
    const act = action => {
        actions.push(action);
        const result = applyAction(state, action);
        assert.equal(result.ok, true, JSON.stringify(result.error));
        state = result.state;
        return result;
    };
    assert.equal(cardView(state, instOf(discarded.id)).onDiscard[0].amount, 37);
    const skill = act({ type: 'hero-skill', targetId: 'foe' });
    assert.equal(skill.events.find(e => e.type === 'damage' && e.target === 'foe').amount, 38);
    act({ type: 'play', inst: instOf(power.id) });
    const tossed = act({ type: 'play', inst: instOf(toss.id) });
    assert.equal(tossed.events.find(e => e.type === 'block' && e.source?.kind === 'on-discard').amount, 37);
    assert.equal(state.units.hero.powers[0].effects[0].amount, 37);
    const next = act({ type: 'end-turn' });
    assert.equal(next.events.find(e => e.type === 'block' && e.source?.kind === 'power').amount, 37);
    assert.equal(state.units.hero.powers[0].effects[0].amount, 37);
    assert.deepEqual(replayBattle(setup, SEED, actions).state, state);
    assert.equal(power.effects[0].then[0].amount, 30);
    assert.equal(discarded.onDiscard[0].amount, 30);
});

test('卡牌机制倍率：法珠冻结来源、蚀珠只缩放蓄积，霜晶效能与源珠次数不变', () => {
    const policy = createAttributePolicy({ attributes: { scores: { str: 8, dex: 30, con: 10, int: 18, wis: 10, cha: 10 }, proficiency: 2 }, classProfile: { archetype: 'mage' } });
    for (const [orb, expected] of [['lightning', [9, 16]], ['frost', [6, 9]], ['dark', [17]], ['glass', [8, 13]], ['plasma', [1, 2]]]) {
        const channel = { id: 'orb-card', name: '凝珠', type: 'skill', cost: 0, rarity: 'common', archetype: 'mage', effects: [{ op: 'channel', orb, amount: 1 }] };
        const pulse = { id: 'orb-pulse-card', name: '引珠', type: 'skill', cost: 0, rarity: 'common', archetype: 'mage', effects: [{ op: 'orb-pulse', amount: 1 }, { op: 'evoke', amount: 1 }] };
        const setup = { rulesVersion: 6, attributeRules: 1, controlledId: 'hero', units: [hero([channel.id, pulse.id], {
            attributePolicy: policy, draw: 2, catalog: { [channel.id]: channel, [pulse.id]: pulse },
            passives: [{ id: 'orb-focus', trigger: 'battle-start', effects: [{ op: 'focus', amount: 3 }, { op: 'apply-status', status: 'arc-core', stacks: 2 }, { op: 'apply-status', status: 'arc-boost', stacks: 1 }] }],
        }), foe({ maxHp: 999 })] };
        let state = createBattle(setup, SEED).state;
        const actions = [];
        const play = id => {
            const inst = state.piles.hero.hand.find(key => state.cards[key].cardId === id);
            const action = { type: 'play', inst };
            actions.push(action);
            const result = applyAction(state, action);
            assert.equal(result.ok, true, JSON.stringify(result.error));
            state = result.state;
            return result.events;
        };
        play(channel.id);
        const frozen = clone(state);
        const stored = state.units.hero.res.orbs.list[0];
        assert.equal(Boolean(stored._attribute), orb !== 'plasma');
        if (orb === 'dark') assert.equal(stored.charge, 7);
        const events = play(pulse.id);
        const type = orb === 'frost' ? 'block' : orb === 'plasma' ? 'energy' : 'damage';
        assert.deepEqual(events.filter(e => e.type === type && (type !== 'damage' || e.target === 'foe')).map(e => e.amount), expected, orb);
        assert.equal(events.filter(e => e.type === 'evoke').length, 1);
        assert.equal(state.units.hero.res?.orbs?.list.length, 0);
        assert.deepEqual(replayBattle(setup, SEED, actions).state, state);
        assert.equal(frozen.units.hero.res.orbs.list.length, 1);
    }
});

test('卡牌机制来源：雷心与静电混合人物技能增量不继承倍率，旧局来源与逐事件重放保持一致', () => {
    const policy = createAttributePolicy({ attributes: { scores: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 }, proficiency: 2 }, classProfile: { archetype: 'mage' } });
    for (const status of ['storm-heart', 'static-shell']) {
        const power = { id: 'source-power', name: '法阵', type: 'power', cost: 0, rarity: 'common', effects: [{ op: 'apply-status', status, stacks: 1 }] };
        const trigger = { id: 'source-trigger', name: '启阵', type: 'power', cost: 0, rarity: 'common', effects: [{ op: 'energy', amount: 1 }] };
        const units = [hero([power.id, trigger.id], {
            draw: 2, attributePolicy: policy, catalog: { [power.id]: power, [trigger.id]: trigger },
            heroSkill: { id: 'source-skill', name: '人物阵', effects: [{ op: 'apply-status', status, stacks: 1 }] },
        }), foe({ maxHp: 999, skills: [claw(1)] })];
        const setup = { rulesVersion: 6, attributeRules: 1, controlledId: 'hero', units };
        let state = createBattle(setup, SEED).state;
        const actions = [];
        const act = action => {
            actions.push(action);
            const result = applyAction(state, action);
            assert.equal(result.ok, true, JSON.stringify(result.error));
            state = result.state;
            return result;
        };
        const instOf = id => state.piles.hero.hand.find(inst => state.cards[inst].cardId === id);
        act({ type: 'play', inst: instOf(power.id) });
        const before = clone(state);
        act({ type: 'hero-skill' });
        const groups = state.units.hero.res.attributeStatuses[status];
        assert.deepEqual(groups.map(group => [group.stacks, Boolean(group._attribute)]), [[1, true], [1, false]]);
        assert.deepEqual(before.units.hero.res.attributeStatuses[status].map(group => group.stacks), [1]);
        if (status === 'storm-heart') act({ type: 'play', inst: instOf(trigger.id) });
        else act({ type: 'end-turn' });
        assert.deepEqual(state.units.hero.res.orbs.list.map(orb => Boolean(orb._attribute)), [true, false]);
        assert.deepEqual(replayBattle(setup, SEED, actions).state, state);
        const legacy = { ...setup };
        delete legacy.attributeRules;
        const old = replayBattle(legacy, SEED, actions);
        assert.equal(old.ok, true, JSON.stringify(old.error));
        assert.equal(old.state.units.hero.res.attributeStatuses, undefined);
        assert.deepEqual(old.state.units.hero.res.orbs.list.map(orb => Boolean(orb._attribute)), [false, false]);
    }
});

function attributeBattleRun(cards, policy, extra = {}, enemy = {}) {
    const setup = { rulesVersion: 6, attributeRules: 1, controlledId: 'hero', units: [hero(cards.map(card => card.id), {
        draw: cards.length, attributePolicy: policy, catalog: Object.fromEntries(cards.map(card => [card.id, card])), ...extra,
    }), foe({ maxHp: 999, ...enemy })] };
    const created = createBattle(setup, SEED);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    let state = created.state;
    const actions = [];
    const act = action => {
        const result = applyAction(state, action);
        assert.equal(result.ok, true, JSON.stringify(result.error));
        actions.push(action);
        state = result.state;
        return result;
    };
    return {
        get state() { return state; },
        act,
        play(id, targetId) { return act({ type: 'play', inst: state.piles.hero.hand.find(inst => state.cards[inst].cardId === id), ...(targetId ? { targetId } : {}) }); },
        replay() { assert.deepEqual(replayBattle(setup, SEED, actions).state, state); },
    };
}

test('卡牌机制随从：基础攻击与骨甲新增量各换算一次，当前和最大生命派生量、牺牲不缩放', async () => {
    const { cardView, estimateDamage } = await import('../src/combat/battle-state.js');
    const policy = createAttributePolicy({ attributes: { scores: { str: 8, dex: 8, con: 10, int: 10, wis: 10, cha: 18 }, proficiency: 2 }, classProfile: { archetype: 'summoner' } });
    for (const bonus of ['hp', 'max']) {
        const buff = { id: 'minion-buff', name: '骨甲', type: 'skill', cost: 0, rarity: 'common', archetype: 'summoner', effects: [{ op: 'apply-status', status: 'minion-might', stacks: 4 }] };
        const hit = { id: 'minion-hit', name: '随从击', type: 'attack', cost: 0, rarity: 'common', archetype: 'summoner', effects: [{ op: 'minion-strike', amount: 10, target: 'enemy', bonus }] };
        const sacrifice = { id: 'minion-end', name: '牺牲', type: 'skill', cost: 0, rarity: 'common', effects: [{ op: 'sacrifice', mode: 'nova' }] };
        const run = attributeBattleRun([buff, hit, sacrifice], policy, { passives: [{ id: 'minion-passive', trigger: 'battle-start', effects: [{ op: 'summon', amount: 12 }, { op: 'apply-status', status: 'minion-might', stacks: 2 }] }] });
        run.play(buff.id);
        assert.equal(run.state.units.hero.statuses['minion-might'], 7);
        const inst = run.state.piles.hero.hand.find(key => run.state.cards[key].cardId === hit.id);
        const view = cardView(run.state, inst);
        assert.equal(view.effects[0].amount, 12);
        const estimated = estimateDamage(run.state, run.state.units.hero, run.state.units.foe, view.effects, 'foe', view);
        const result = run.play(hit.id, 'foe');
        assert.equal(result.events.find(e => e.type === 'damage' && e.kind === 'minion').amount, 31);
        assert.equal(estimated, 31);
        const end = run.play(sacrifice.id);
        assert.equal(end.events.find(e => e.type === 'damage' && e.kind === 'minion').amount, 12);
        run.replay();
    }
});


test('卡牌机制圣辉：辉击辉愈与恒愈只换算新增量，非卡牌层数和X圣辉次数不变', () => {
    const policy = createAttributePolicy({ attributes: { scores: { str: 8, dex: 8, con: 10, int: 8, wis: 18, cha: 8 }, proficiency: 2 }, classProfile: { archetype: 'priest' } });
    const blessing = { id: 'halo-buff', name: '圣环', type: 'power', cost: 0, rarity: 'common', archetype: 'priest', effects: [
        { op: 'apply-status', status: 'halo-strike', stacks: 4 }, { op: 'apply-status', status: 'halo-mend', stacks: 3 }, { op: 'apply-status', status: 'steady-mend', stacks: 4 },
    ] };
    const strike = { id: 'halo-x', name: '圣辉击', type: 'attack', cost: 0, radiance: 'X', rarity: 'common', archetype: 'priest', effects: [dmg(10)] };
    const run = attributeBattleRun([blessing, strike], policy, { hp: 1, passives: [{ id: 'halo-passive', trigger: 'battle-start', effects: [
        { op: 'radiance', amount: 3 }, { op: 'apply-status', status: 'halo-strike', stacks: 2 }, { op: 'apply-status', status: 'halo-mend', stacks: 1 }, { op: 'apply-status', status: 'steady-mend', stacks: 1 },
    ] }] });
    run.play(blessing.id);
    assert.deepEqual(['halo-strike', 'halo-mend', 'steady-mend'].map(key => run.state.units.hero.statuses[key]), [7, 5, 6]);
    const spent = run.play(strike.id, 'foe');
    assert.deepEqual(spent.events.filter(e => e.type === 'damage' && e.kind === 'attack').map(e => e.amount), [13, 13, 13]);
    assert.equal(spent.events.find(e => e.type === 'damage' && e.kind === 'halo').amount, 7);
    assert.equal(spent.events.find(e => e.type === 'heal' && e.source?.id === 'halo-mend').amount, 5);
    assert.equal(run.state.units.hero.res.radiance, 0);
    const next = run.act({ type: 'end-turn' });
    assert.equal(next.events.find(e => e.type === 'heal' && e.source?.id === 'steady-mend').amount, 6);
    assert.equal(run.state.units.hero.statuses['steady-mend'], 6);
    run.replay();
});


test('卡牌机制乐势：心盾止水观兆只换算卡牌新增量，心境能量与门槛不变', () => {
    const policy = createAttributePolicy({ attributes: { scores: { str: 8, dex: 8, con: 10, int: 8, wis: 8, cha: 18 }, proficiency: 2 }, classProfile: { archetype: 'bard' } });
    const buff = { id: 'cadence-buff', name: '乐盾', type: 'power', cost: 0, rarity: 'common', archetype: 'bard', effects: [
        { op: 'apply-status', status: 'stance-ward', stacks: 4 }, { op: 'apply-status', status: 'calm-guard', stacks: 4 }, { op: 'apply-status', status: 'scry-ward', stacks: 4 },
    ] };
    const calm = { id: 'cadence-calm', name: '静心', type: 'skill', cost: 0, rarity: 'common', effects: [{ op: 'enter-stance', stance: 'calm' }, { op: 'foresee', amount: 1 }] };
    const ascend = { id: 'cadence-ascend', name: '神临', type: 'skill', cost: 0, rarity: 'common', effects: [{ op: 'momentum', amount: 5 }, { op: 'momentum', amount: 5 }] };
    const run = attributeBattleRun([buff, calm, ascend], policy, { passives: [{ id: 'cadence-passive', trigger: 'battle-start', effects: [
        { op: 'apply-status', status: 'stance-ward', stacks: 2 }, { op: 'apply-status', status: 'calm-guard', stacks: 2 }, { op: 'apply-status', status: 'scry-ward', stacks: 2 },
    ] }] });
    run.play(buff.id);
    assert.deepEqual(['stance-ward', 'calm-guard', 'scry-ward'].map(key => run.state.units.hero.statuses[key]), [7, 7, 7]);
    const entered = run.play(calm.id);
    assert.deepEqual(entered.events.filter(e => e.type === 'block').map(e => e.amount), [7, 7]);
    const ended = run.act({ type: 'end-turn' });
    assert.equal(ended.events.find(e => e.type === 'block' && e.source?.id === 'calm-guard').amount, 7);
    const ascended = run.play(ascend.id);
    assert.deepEqual(ascended.events.filter(e => e.type === 'momentum').map(e => e.delta), [5, 5]);
    assert.deepEqual(ascended.events.filter(e => e.type === 'energy').map(e => e.amount), [2, 3]);
    assert.equal(run.state.units.hero.res.stance, 'divinity');
    assert.equal(run.state.units.hero.res.momentum, 0);
    run.replay();
});

test('卡牌机制猎印与临时攻防：本次增量换算、已有状态和引弦派生伤害不重复倍率', () => {
    const policy = createAttributePolicy({ attributes: { scores: { str: 18, dex: 8, con: 10, int: 8, wis: 8, cha: 8 }, proficiency: 2 }, classProfile: { archetype: 'ranger' } });
    const mark = { id: 'mark-card', name: '猎印', type: 'skill', cost: 0, rarity: 'common', archetype: 'ranger', effects: [{ op: 'apply-status', status: 'hunt-mark', stacks: 4, target: 'enemy' }, { op: 'apply-status', status: 'flex', stacks: 4 }] };
    const hit = { id: 'mark-hit', name: '引弦', type: 'attack', cost: 0, rarity: 'common', archetype: 'ranger', effects: [dmg(10), { op: 'loose' }] };
    const run = attributeBattleRun([mark, hit], policy, { passives: [{ id: 'mark-passive', trigger: 'battle-start', effects: [{ op: 'apply-status', status: 'flex', stacks: 2 }, { op: 'apply-status', status: 'hunt-mark', stacks: 2, target: 'enemy' }] }] });
    run.play(mark.id, 'foe');
    assert.equal(run.state.units.hero.statuses.flex, 7);
    assert.equal(run.state.units.foe.statuses['hunt-mark'], 7);
    const result = run.play(hit.id, 'foe');
    assert.deepEqual(result.events.filter(e => e.type === 'damage').map(e => [e.kind, e.amount]), [['attack', 20], ['hunt-mark', 7]]);
    run.act({ type: 'end-turn' });
    assert.equal(run.state.units.hero.statuses.flex, undefined);
    run.replay();
});


test('卡牌机制暗刃：动态牌按刺客力量换算，首击卡牌增量与人物技能增量各自入池，估算和重放一致', async () => {
    const { cardView, estimateDamage } = await import('../src/combat/battle-state.js');
    const policy = createAttributePolicy({ attributes: { scores: { str: 16, dex: 10, con: 10, int: 30, wis: 10, cha: 10 }, proficiency: 2 }, classProfile: { archetype: 'mage' } });
    const tune = { id: 'shiv-tune', name: '磨刃', type: 'power', cost: 0, rarity: 'common', archetype: 'assassin', effects: [{ op: 'hone-shiv', mode: 'edge', amount: 4 }, { op: 'hone-shiv', mode: 'first', amount: 5 }] };
    const create = { id: 'shiv-create', name: '取刃', type: 'skill', cost: 0, rarity: 'common', archetype: 'assassin', effects: [{ op: 'shiv', amount: 2 }] };
    const run = attributeBattleRun([tune, create], policy, { heroSkill: { id: 'shiv-skill', name: '人物磨刃', effects: [{ op: 'hone-shiv', mode: 'first', amount: 2 }] } });
    run.play(tune.id);
    assert.deepEqual(run.state.units.hero.res.shiv, { edge: 4, first: 6 });
    run.act({ type: 'hero-skill' });
    assert.equal(run.state.units.hero.res.shiv.first, 8);
    run.play(create.id);
    assert.equal(run.state.catalog.hero['shadow-shiv'].effects[0].amount, 8);
    for (const expected of [18, 10]) {
        const inst = run.state.piles.hero.hand.find(key => run.state.cards[key].cardId === 'shadow-shiv');
        const view = cardView(run.state, inst);
        assert.equal(view.archetype, 'assassin');
        assert.equal(view.effects[0].amount, 10);
        const estimated = estimateDamage(run.state, run.state.units.hero, run.state.units.foe, view.effects, 'foe', view);
        const hit = run.act({ type: 'play', inst, targetId: 'foe' });
        assert.equal(hit.events.find(e => e.type === 'damage' && e.kind === 'attack').amount, expected);
        assert.equal(estimated, expected);
    }
    assert.equal(run.state.units.hero.res.shiv.first, 8);
    run.replay();
});


const siftPolicy = dex => createAttributePolicy({ attributes: { scores: { str: 10, dex, con: 10, int: 10, wis: 10, cha: 10 }, proficiency: 2 }, classProfile: { archetype: 'mage' } });
const siftCard = (id, extra = {}) => ({ id, name: id, type: 'skill', cost: 0, rarity: 'common', innate: true, effects: [{ op: 'draw', amount: 3 }, { op: 'discard', amount: 1, mode: 'choose' }], ...extra });
function siftRun(cards, { dex = 16, reserve = 20, draw = cards.length, ...extra } = {}) {
    return attributeBattleRun(cards, siftPolicy(dex), { deck: [...cards.map(card => card.id), ...Array(reserve).fill('basic-defend')], draw, catalog: { ...BASIC_CARDS, ...Object.fromEntries(cards.map(card => [card.id, card])) }, ...extra });
}
const drawnCount = result => result.events.filter(e => e.type === 'draw' && e.unitId === 'hero').reduce((sum, e) => sum + e.count, 0);
function chooseSift(run, keep = []) {
    const { count, options } = run.state.pending;
    return run.act({ type: 'choose', insts: options.filter(inst => !keep.includes(run.state.cards[inst].cardId)).slice(0, count) });
}

test('敏捷筛牌：抽3弃1变抽4选弃2，挂起恢复只领一次，同回合第二张不触发而下回合恢复', () => {
    const cards = [siftCard('sift-one'), siftCard('sift-two')];
    const run = siftRun(cards);
    const first = run.play(cards[0].id);
    assert.equal(drawnCount(first), 4);
    assert.equal(run.state.pending.count, 2);
    assert.equal(run.state.play.siftExtra, 1);
    assert.equal(run.state.units.hero.turnStats.attributeSift, true);
    const suspended = clone(run.state);
    assert.equal(applyAction(run.state, { type: 'choose', insts: [] }).error?.reason, 'invalid-choice');
    assert.deepEqual(run.state, suspended);
    run.replay();
    const picked = chooseSift(run, [cards[1].id]);
    assert.equal(picked.events.filter(e => e.type === 'discard').length, 2);
    assert.equal(drawnCount(picked), 0);
    assert.deepEqual(suspended.pending.count, 2);
    const second = run.play(cards[1].id);
    assert.equal(drawnCount(second), 3);
    assert.equal(run.state.pending.count, 1);
    chooseSift(run);
    run.act({ type: 'end-turn' });
    assert.equal(run.state.units.hero.turnStats?.attributeSift, undefined);
    run.replay();
});


test('敏捷筛牌边界：敏捷15、随机弃牌、整手重抽与未实际多抽到牌不追加弃牌', () => {
    const base = siftCard('sift-boundary');
    for (const [label, card, options, expectedDraw, expectedDiscard] of [
        ['dex15', base, { dex: 15 }, 3, 1],
        ['random', { ...base, effects: [{ op: 'draw', amount: 3 }, { op: 'discard', amount: 1, mode: 'random' }] }, {}, 3, 1],
        ['redraw', { ...base, effects: [{ op: 'discard-hand', redraw: true }] }, { draw: 3 }, 2, 2],
        ['no-draw', base, { passives: [{ id: 'stop-draw', trigger: 'battle-start', effects: [{ op: 'status', status: 'no-draw', stacks: 1, target: 'self' }] }], draw: 3 }, 0, 1],
        ['hand-limit', base, { draw: COMBAT_RULES.handLimit }, 1, 1],
        ['empty', base, { reserve: 2, draw: 3 }, 0, 1],
        ['only-base', base, { reserve: 5, draw: 3 }, 3, 1],
    ]) {
        const run = siftRun([card], options);
        const played = run.play(card.id);
        assert.equal(drawnCount(played), expectedDraw, label);
        assert.equal(run.state.units.hero.turnStats?.attributeSift, undefined, label);
        const chosen = run.state.pending ? chooseSift(run) : played;
        assert.equal(chosen.events.filter(e => e.type === 'discard').length, expectedDiscard, label);
        run.replay();
    }
});

test('敏捷筛牌重演与恢复：首轮额外抽弃，重演及免费狡黠不领取，下一自身回合恢复', () => {
    const recurring = siftCard('sift-recurring', { retain: true, replay: 1, effects: [{ op: 'draw', amount: 3 }, { op: 'discard', amount: 1, mode: 'choose' }, { op: 'recur', to: 'hand' }] });
    const run = siftRun([recurring], { draw: 3 });
    assert.equal(drawnCount(run.play(recurring.id)), 4);
    assert.equal(run.state.pending.count, 2);
    const repeat = chooseSift(run);
    assert.equal(drawnCount(repeat), 3);
    assert.equal(run.state.pending.count, 1);
    chooseSift(run);
    run.act({ type: 'end-turn' });
    assert.equal(drawnCount(run.play(recurring.id)), 4);
    assert.equal(run.state.pending.count, 2);
    chooseSift(run);
    chooseSift(run);
    run.replay();
    const sly = siftCard('sift-sly', { sly: true });
    const toss = siftCard('sift-toss', { effects: [{ op: 'discard', amount: 1, mode: 'choose' }] });
    const free = siftRun([sly, toss], { draw: 3 });
    free.play(toss.id);
    const slyInst = free.state.pending.options.find(inst => free.state.cards[inst].cardId === sly.id);
    const result = free.act({ type: 'choose', insts: [slyInst] });
    assert.equal(drawnCount(result), 3);
    assert.equal(free.state.units.hero.turnStats.attributeSift, undefined);
    assert.equal(free.state.pending, undefined);
    free.replay();
});


test('开局先手计入行动条：速度快的主角首轮不再连动两回合，旧 setup 行为不变，顺序槽与实际一致', () => {
    const units = () => [hero(filler, { speed: 150 }), foe({ speed: 100 })];
    const legacy = start(units());
    assert.deepEqual(upcomingActors(legacy, 3), ['hero', 'hero', 'foe']);
    const old = applyAction(legacy, { type: 'end-turn' });
    assert.deepEqual(old.events.filter((e) => e.type === 'act').map((e) => e.unitId), []);
    const charged = start(units(), { openingCharged: true });
    assert.deepEqual(upcomingActors(charged, 3), ['hero', 'foe', 'hero']);
    const next = applyAction(charged, { type: 'end-turn' });
    assert.equal(next.ok, true);
    assert.deepEqual(next.events.filter((e) => e.type === 'act').map((e) => e.unitId), ['foe']);
    assert.deepEqual([next.state.phase, next.state.turn, next.state.openingDebt], ['player', 2, undefined]);
    assert.equal(createBattle({ controlledId: 'hero', openingCharged: 'yes', units: units() }, SEED).error?.reason, 'invalid-setup');
});

test('敌人随机选攻击对象（setup.randomTargets）：开启时按种子在存活的我方单位中随机挑，同一种子重放一致；旧 setup 仍打生命 + 格挡最低者；非布尔值拒绝建局', () => {
    const units = () => [hero(['basic-strike'], { maxHp: 50 }), { id: 'mate', name: '队友', side: 'ally', kind: 'skill', maxHp: 90, skills: [idle] }, foe({ skills: [claw(5)] })];
    const seeds = Array.from({ length: 40 }, (_, i) => seedFor(`rt|${i}`));
    const targetOf = (extra, seed) => {
        const result = createBattle({ controlledId: 'hero', units: units(), ...extra }, seed);
        assert.equal(result.ok, true, JSON.stringify(result.error));
        return result.state.intents.foe?.targetId;
    };
    assert.ok(seeds.every((seed) => targetOf({}, seed) === 'hero'));
    assert.deepEqual([...new Set(seeds.map((seed) => targetOf({ randomTargets: true }, seed)))].sort(), ['hero', 'mate']);
    assert.equal(targetOf({ randomTargets: true }, seeds[3]), targetOf({ randomTargets: true }, seeds[3]));
    assert.equal(createBattle({ controlledId: 'hero', randomTargets: 'yes', units: units() }, SEED).error?.reason, 'invalid-setup');
});

test('初期折算（规则 v6）：单敌到四敌按人数取档，每五个有效胜场恢复，超过第一名后备不再打折', () => {
    assert.equal(COMBAT_RULES.maxFoesOnField, 3);
    for (const [wins, scales] of [[0, [0.8, 0.4, 0.28, 0.22]], [4, [0.8, 0.4, 0.28, 0.22]],
        [5, [0.85, 0.55, 0.46, 0.42]], [9, [0.85, 0.55, 0.46, 0.42]],
        [10, [0.9, 0.7, 0.64, 0.61]], [14, [0.9, 0.7, 0.64, 0.61]],
        [15, [0.95, 0.85, 0.82, 0.81]], [19, [0.95, 0.85, 0.82, 0.81]], [20, [1, 1, 1, 1]], [50, [1, 1, 1, 1]]]) {
        for (const n of [1, 2, 3, 4, 5, 8, 50]) assert.equal(crowdScaleFor(n, wins), scales[Math.min(n, 4) - 1], `n=${n}, wins=${wins}`);
    }
    assert.equal(crowdScaleFor(1), 0.8, '单敌也受初期保护');
    assert.equal(crowdScaleFor(2), 0.4, '零胜时使用初始档');
    for (const invalid of [-1, NaN, '10', 1.5]) assert.equal(crowdScaleFor(3, invalid), 0.28);
    assert.equal(crowdScaleFor(3), 0.28);
    assert.equal(crowdScaleFor(4), 0.22);
});

test('敌方编制（规则 v6）：新建 setup 写 foeCap 3；场上普通敌人超过 foeCap 时 too-many-enemies；爪牙占剩余 2 位，普通敌人位与爪牙位互不挤占', () => {
    const skill = { id: 'hit', name: '打', intent: 'attack', effects: [{ op: 'damage', amount: 1, target: 'enemy' }] };
    const call = { id: 'call', name: '唤', intent: 'special', effects: [{ op: 'summon-minion', amount: 2, hp: 5, damage: 1 }] };
    const foe = (id, skills = [skill]) => ({ id, name: id, side: 'enemy', kind: 'skill', maxHp: 30, skills });
    const heroUnit = { id: 'hero', name: '我', side: 'ally', kind: 'deck', maxHp: 600, deck: Array(10).fill('k'), catalog: { k: { id: 'k', name: '斩', type: 'attack', cost: 0, effects: [{ op: 'damage', amount: 40, target: 'enemy' }] } } };
    const four = [heroUnit, foe('a'), foe('b'), foe('c'), foe('d')];
    assert.equal(createBattle({ controlledId: 'hero', foeCap: 3, units: four }, 1).error?.reason, 'too-many-enemies');
    assert.equal(createBattle({ controlledId: 'hero', foeCap: 3, reserve: ['d'], units: four }, 1).ok, true);
    assert.equal(createBattle({ controlledId: 'hero', units: four }, 1).ok, true, '不带 foeCap 的旧 setup 仍按总位置 5');
    for (const rulesVersion of [3, 4, 5]) {
        assert.equal(createBattle({ controlledId: 'hero', rulesVersion, units: [...four, foe('e')] }, 1).ok, true, `v${rulesVersion} 保留五名普通敌人`);
    }
    assert.equal(createBattle({ controlledId: 'hero', rulesVersion: 6, units: four }, 1).error?.reason, 'too-many-enemies');
    assert.equal(createBattle({ controlledId: 'hero', rulesVersion: 6, foeCap: 5, units: four }, 1).error?.reason, 'invalid-setup');
    const defaults = createBattle({ controlledId: 'hero', rulesVersion: 6, reserve: ['d'], units: four }, 1);
    assert.equal(defaults.ok, true);
    assert.equal(defaults.state.foeCap, 3, '显式 v6 缺 foeCap 时运行时同样限三名');
    for (const crowd of [0, -1, 1.1, NaN, '0.65']) {
        assert.equal(createBattle({ controlledId: 'hero', crowd, units: [heroUnit, foe('a')] }, 1).error?.reason, 'invalid-setup');
    }
    assert.equal(createBattle({ controlledId: 'hero', foeCap: 0, units: four }, 1).error?.reason, 'invalid-setup');
    const created = createBattle({ controlledId: 'hero', rulesVersion: 6, reserve: ['d', 'e'], units: [heroUnit, foe('a', [call]), foe('b'), foe('c'), foe('d'), foe('e')] }, 1);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    let state = created.state;
    for (let i = 0; i < 3 && !state.outcome; i += 1) state = applyAction(state, { type: 'end-turn' }).state;
    const living = state.order.filter((id) => state.units[id].side === 'enemy' && state.units[id].alive);
    assert.deepEqual([living.filter((id) => !state.units[id].minion).length, living.filter((id) => state.units[id].minion).length], [3, 2]);
    assert.deepEqual(state.reserve, ['d', 'e'], '爪牙入场不消耗后备');
    const strike = targetId => {
        const action = legalActions(state).find(action => action.type === 'play' && action.targetId === targetId);
        assert.ok(action, `可以攻击 ${targetId}`);
        const result = applyAction(state, action);
        assert.equal(result.ok, true, JSON.stringify(result.error));
        state = result.state;
        return result.events;
    };
    assert.equal(strike('a-m1').some(event => event.type === 'reinforce'), false);
    assert.deepEqual(state.reserve, ['d', 'e'], '爪牙死亡不由后备补位');
    assert.deepEqual(strike('b').filter(event => event.type === 'reinforce').map(event => [event.replaced, event.unitId]), [['b', 'd']]);
    assert.deepEqual(state.reserve, ['e']);
    assert.equal(state.units['a-m2'].alive, true, '普通敌人补位不挤走存活爪牙');
    const departed = strike('a');
    assert.equal(state.units['a-m2'].left, true, '召唤者倒下后爪牙退场');
    assert.deepEqual(departed.filter(event => event.type === 'reinforce').map(event => [event.replaced, event.unitId]), [['a', 'e']]);
    assert.equal(state.reserve, undefined, '仅两名普通敌人的倒下消耗两名后备');
});

test('专属卡槽位：ID 带 -g<n> 按槽位，否则按档案位置；Lv5 / Lv10 解锁', () => {
    assert.deepEqual(COMBAT_RULES.signatureUnlockLevels, [5, 10]);
    assert.deepEqual([signatureUnlockLevel(1), signatureUnlockLevel(2), signatureUnlockLevel(3)], [5, 10, Infinity]);
    assert.equal(signatureSlotOf({ id: 'pc-g2' }, 0), 2);
    assert.equal(signatureSlotOf({ id: 'legacy' }, 1), 2);
    assert.equal(signatureSlotOf({ id: 'pc-g9' }, 0), 1);
    const profile = { signatureCards: [{ id: 'pc-g2', name: 'b' }, { id: 'old', name: 'a' }] };
    assert.equal(signatureCardAt(profile, 2)?.name, 'b');
    assert.equal(signatureCardAt({}, 1), null);
});

// ---------- 开战标签 ----------
test('开战标签不限位置：其后跟标记行、正文、分隔线或状态栏都生效（觉醒照常并入）；友方写「无」视为没有队友', () => {
    const body = [
        '铁面人抬起黑刀横在身前。',
        '[igs-char:? ? ? |冷漠|玄色夜行衣|挡路的小辈。那就一起。]',
        '[igs-combat:awaken|陈默|怒火|你伤了她，我就是拼了这条命也要把你留下！]',
        '[igs-combat:start|暗夜偷袭・铁面刺客|铁面刺客|麟青砚|首领]',
        '',
        '[igs-stat:favor|麟青砚|受伤]',
        '[igs-stat:hurt|重伤]',
        '[igs-combat:rel|麟青砚|碾压]',
        '[igs-combat:rel|铁面刺客|碾压]',
    ].join('\n');
    const { start: parsed, diagnostics } = extractCombatStart(body);
    assert.equal(parsed?.encounter, '暗夜偷袭・铁面刺客', JSON.stringify(diagnostics));
    assert.deepEqual([parsed.tier, parsed.allies, parsed.awaken?.type], ['boss', ['麟青砚'], 'rage']);
    assert.equal(codes({ diagnostics }).includes('combat-start-not-tail'), false);
    const prose = extractCombatStart(`${body}\n他还想说什么。\n===========\n状态栏：HP 30/30`);
    assert.equal(prose.start?.encounter, '暗夜偷袭・铁面刺客', JSON.stringify(prose.diagnostics));
    assert.equal(prose.start.awaken?.type, 'rage');
    assert.deepEqual(extractCombatStart('[igs-combat:start|森林遭遇战|森林狼*5|无|普通]\n===========').start?.allies, []);
    const twice = extractCombatStart('[igs-combat:start|甲|狼]\n正文。\n[igs-combat:start|乙|狼]');
    assert.equal(twice.start.encounter, '乙');
    assert.deepEqual(codes(twice), ['combat-start-duplicate']);
});

// ---------- 初始装备 ----------
const LLM = { source: 'tavern' };
const reply = (pairs) => JSON.stringify({ entities: pairs.map(([key, value]) => ({ key, value })) });

test('初始装备（profile-gear）：模型只给名称、部位与稀有度，加成属性由程序抽定；空列表合法、不落账；主角空列表与同部位两件拒收并定向修正', async () => {
    const entity = profileGearEntity('陈默');
    assert.deepEqual([entity.kind, entity.optional, entity.input], ['profile-gear', true, { name: '陈默' }]);
    const good = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [['青锋剑', 'weapon', 'rare', '师门所赐']] }]]), llm: LLM });
    assert.equal(good.ok, true, JSON.stringify(good.rejected));
    const items = good.accepted[0].gear.items;
    assert.deepEqual([good.accepted[0].gear.name, items.length, items[0].slot, items[0].rarity, items[0].bonus.amount, items[0].description], ['陈默', 1, 'weapon', 'rare', 3, '师门所赐']);
    assert.ok(['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(items[0].bonus.ability));
    // 同名同稀有度结果恒定（加成六维与被动都按装备 ID 种子定）
    const again = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [['青锋剑', 'weapon', 'rare', '师门所赐']] }]]), llm: LLM });
    assert.deepEqual(again.accepted[0].gear.items, items);
    const none = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [] }]]), llm: LLM });
    assert.deepEqual([none.ok, none.accepted[0].gear.items], [true, []]);
    assert.deepEqual(generationWrites(none), { profiles: [], entries: [] });
    const required = profileGearEntity('陈默', { required: true });
    assert.deepEqual(required.input, { name: '陈默', required: true });
    const empty = await generateEntities([required], { request: async () => reply([[required.key, { gear: [] }]]), llm: LLM });
    assert.equal(empty.ok, false);
    assert.ok(empty.rejected[0].errors.some((e) => e.reason === 'invalid-length'));
    const dup = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [['甲', 'weapon', 'common'], ['乙', 'weapon', 'common']] }]]), llm: LLM });
    assert.deepEqual([dup.ok, dup.requests], [false, 3]);
    assert.ok(dup.rejected[0].errors.some((e) => e.reason === 'slot-duplicate'));
});

// ---------- 会话：重新开始 ----------
test('重新开始：对局中与撤退后用同一 setup 换新种子从头打，撤掉聊天记录里的旧结果，续战读到新对局；胜利后不给', async () => {
    const { createCombatSession, locateCombatStart, sessionKeyFor } = await import('../src/combat/session.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const chat = [{ is_user: true, mes: '出发' }, { is_user: false, mes: '前方出现了敌人。\n[igs-combat:start|史莱姆|草原]', swipe_id: 0 }];
    const located = locateCombatStart(chat, 1);
    assert.equal(located.ok, true);
    const makeRecord = (units) => {
        const setup = { rulesVersion: COMBAT_RULES.version, controlledId: 'hero', canEscape: true, units };
        return { v: 1, combatId: located.combatId, anchor: located.anchor, seed: seedFor(located.combatId), setup, actions: [], encounter: '草原', tiers: ['normal'], expTargets: ['我'] };
    };
    const records = new Map();
    const chatRecord = {
        read: () => ({ ok: true, value: records.get(located.combatId) || null }),
        write: async (anchor, combatId, patch) => { records.set(combatId, { ...(records.get(combatId) || {}), ...patch }); return { ok: true }; },
    };
    const stubLedger = { effectiveState: async () => ({ ok: true, offers: new Map(), attributes: {}, characters: new Map(), classes: new Map() }), append: async () => ({ ok: true }), scan: async () => ({ ok: true }) };
    const open = (record) => {
        const storage = createCountingStorage({ [sessionKeyFor('chat-1')]: JSON.stringify(record) });
        const make = () => createCombatSession({ ledger: stubLedger, tables: {}, storage, chat, getChatId: () => 'chat-1', userName: '我', chatRecord, send: async () => ({ ok: true, messageId: 2 }), now: () => 1000 });
        const session = make();
        assert.equal(session.resume().ok, true);
        return { session, make };
    };

    const { session, make } = open(makeRecord([hero(filler, { speed: 100 }), foe({ skills: [claw(3)], maxHp: 200 })]));
    const { setup, seed } = session.state().record;
    assert.equal(session.state().status, 'battle');
    assert.equal(session.act({ type: 'end-turn' }).ok, true);
    const mid = await session.restart();
    assert.equal(mid.ok, true, JSON.stringify(mid.reason));
    const record = session.state().record;
    assert.deepEqual([session.state().status, record.actions.length, record.restarts], ['battle', 0, 1]);
    assert.notEqual(record.seed, seed);
    assert.deepEqual(record.setup, setup);
    // 撤退后结果写进聊天记录；重新开始先把它撤成 null
    assert.equal(session.act({ type: 'escape' }).ok, true);
    assert.equal(session.state().status, 'ended');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(typeof records.get(located.combatId)?.result?.reportId, 'string');
    const again = await session.restart();
    assert.equal(again.ok, true, JSON.stringify(again.reason));
    assert.equal(records.get(located.combatId).result, null);
    assert.deepEqual([session.state().status, session.state().record.restarts], ['battle', 2]);
    session.flushPersist();
    const reopened = make();
    assert.equal(reopened.resume().session.status, 'battle');
    assert.equal(reopened.state().record.restarts, 2);

    // 胜利后不给：敌人 1 血，一张打击即胜
    records.clear();
    const won = open(makeRecord([hero(Array(5).fill('basic-strike'), { speed: 100 }), foe({ maxHp: 1 })])).session;
    const strike = won.state().legal.find((a) => a.type === 'play');
    assert.ok(strike);
    won.act(strike);
    if (won.state().status === 'battle') won.act({ type: 'end-turn' });
    assert.equal(won.state().battle.outcome, 'victory');
    assert.equal((await won.restart()).reason, 'combat-restart-unavailable');
});

test('战斗胜利积分（v6 G5g）会话收尾：普通战斗胜利向战报楼写一条 battle-points，档位取最高敌人档位，金额按战斗 ID 定额且可被账本校验', async () => {
    const { createCombatSession, locateCombatStart, sessionKeyFor } = await import('../src/combat/session.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const { BATTLE_POINTS_TAG_HASH } = await import('../src/combat/ledger.js');
    const { battlePoints } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    for (const [tiers, tier] of [[['normal'], 'normal'], [['normal', 'boss'], 'boss']]) {
        const chat = [{ is_user: true, mes: '出发' }, { is_user: false, mes: '前方出现了敌人。\n[igs-combat:start|史莱姆|草原]', swipe_id: 0 }];
        const located = locateCombatStart(chat, 1);
        assert.equal(located.ok, true);
        const setup = { rulesVersion: COMBAT_RULES.version, controlledId: 'hero', canEscape: true, units: [hero(Array(5).fill('basic-strike'), { speed: 100 }), foe({ maxHp: 1 })] };
        const record = { v: 1, combatId: located.combatId, anchor: located.anchor, seed: seedFor(located.combatId), setup, actions: [], encounter: '草原', tiers, expTargets: ['我'] };
        const records = new Map();
        const chatRecord = {
            read: () => ({ ok: true, value: records.get(located.combatId) || null }),
            write: async (anchor, combatId, patch) => { records.set(combatId, { ...(records.get(combatId) || {}), ...patch }); return { ok: true }; },
        };
        const appended = [];
        const ledger = {
            effectiveState: async () => ({ ok: true, offers: new Map(), attributes: {}, characters: new Map(), classes: new Map() }),
            append: async (entries) => { appended.push(...entries); return { ok: true }; },
            scan: async () => ({ ok: true }),
        };
        const storage = createCountingStorage({ [sessionKeyFor('chat-1')]: JSON.stringify(record) });
        const send = async (text) => { chat.push({ is_user: true, mes: text, swipe_id: 0 }); return { ok: true, messageId: chat.length - 1 }; };
        const session = createCombatSession({ ledger, tables: {}, storage, chat, getChatId: () => 'chat-1', userName: '我', chatRecord, send, now: () => 1000 });
        assert.equal(session.resume().ok, true);
        const strike = session.state().legal.find((a) => a.type === 'play');
        assert.ok(strike);
        session.act(strike);
        if (session.state().status === 'battle') session.act({ type: 'end-turn' });
        assert.equal(session.state().battle.outcome, 'victory');
        const done = await session.finish();
        assert.equal(done.ok, true, JSON.stringify(done.reason));
        assert.equal(done.battlePoints?.ok, true);
        const paid = appended.filter((entry) => entry.type === 'battle-points');
        assert.equal(paid.length, 1);
        const [entry] = paid;
        assert.equal(entry.character, 'hero');
        assert.deepEqual(entry.anchor, { messageId: 2, swipeId: 0, tagHash: BATTLE_POINTS_TAG_HASH, occurrence: 0 });
        assert.deepEqual(entry.payload, { amount: battlePoints(tier, located.combatId), tier, combatId: located.combatId, reportId: entry.payload.reportId });
        assert.equal(typeof entry.payload.reportId, 'string');
        assert.equal(normalizeLedgerEntry(entry).ok, true, JSON.stringify(normalizeLedgerEntry(entry).errors));
    }
});

test('弱敌战（v6 G3d）会话收尾：setup 带 weakFoes 时战报写 weak="1"、经验 1/4，battle-points 带 weak 且按 1/4 定额、不带遗物加成，可被账本校验', async () => {
    const { createCombatSession, locateCombatStart, sessionKeyFor } = await import('../src/combat/session.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const { weakBattlePoints } = await import('../src/combat/points.js');
    const { reportWeakOf } = await import('../src/combat/report.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const chat = [{ is_user: true, mes: '出发' }, { is_user: false, mes: '前方出现了敌人。\n[igs-combat:start|史莱姆|草原]', swipe_id: 0 }];
    const located = locateCombatStart(chat, 1);
    assert.equal(located.ok, true);
    const setup = { rulesVersion: COMBAT_RULES.version, controlledId: 'hero', canEscape: true, weakFoes: true, units: [hero(Array(5).fill('basic-strike'), { speed: 100 }), foe({ maxHp: 1 })] };
    assert.ok(COMBAT_RULES.version >= 6);
    assert.equal(createBattle({ ...setup, weakFoes: false }, 1).ok, false, 'weakFoes 只接受 true');
    const record = { v: 1, combatId: located.combatId, anchor: located.anchor, seed: seedFor(located.combatId), setup, actions: [], encounter: '草原', tiers: ['normal'], expTargets: ['我'] };
    const records = new Map();
    const chatRecord = {
        read: () => ({ ok: true, value: records.get(located.combatId) || null }),
        write: async (anchor, combatId, patch) => { records.set(combatId, { ...(records.get(combatId) || {}), ...patch }); return { ok: true }; },
    };
    const appended = [];
    const ledger = {
        effectiveState: async () => ({ ok: true, offers: new Map(), attributes: {}, characters: new Map(), classes: new Map() }),
        append: async (entries) => { appended.push(...entries); return { ok: true }; },
        scan: async () => ({ ok: true }),
    };
    const storage = createCountingStorage({ [sessionKeyFor('chat-1')]: JSON.stringify(record) });
    const send = async (text) => { chat.push({ is_user: true, mes: text, swipe_id: 0 }); return { ok: true, messageId: chat.length - 1 }; };
    const session = createCombatSession({ ledger, tables: {}, storage, chat, getChatId: () => 'chat-1', userName: '我', chatRecord, send, now: () => 1000 });
    assert.equal(session.resume().ok, true);
    session.act(session.state().legal.find((a) => a.type === 'play'));
    if (session.state().status === 'battle') session.act({ type: 'end-turn' });
    assert.equal(session.state().battle.outcome, 'victory');
    const done = await session.finish();
    assert.equal(done.ok, true, JSON.stringify(done.reason));
    const reportText = chat[chat.length - 1].mes;
    assert.equal(reportWeakOf(reportText), true, reportText);
    const expAmount = Math.floor(COMBAT_RULES.tiers.normal.exp / 4);
    assert.match(reportText, new RegExp(`\\[igs-combat:exp\\|我\\|${expAmount}\\|`), reportText);
    const paid = appended.filter((entry) => entry.type === 'battle-points');
    assert.equal(paid.length, 1);
    assert.deepEqual(paid[0].payload, { amount: weakBattlePoints('normal', located.combatId), tier: 'normal', combatId: located.combatId, reportId: paid[0].payload.reportId, weak: true });
    assert.equal(normalizeLedgerEntry(paid[0]).ok, true, JSON.stringify(normalizeLedgerEntry(paid[0]).errors));
});

// ---------- 账本：专属卡按等级解锁 / 助战绝招 ----------
const attack = (id, amount = 6) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount }] });
const guard = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const STARTER = [
    'basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend',
    'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2',
];
const classDef = (id) => ({
    kind: 'class', id, className: '剑士', archetype: 'warrior',
    classPassive: { id: `p-${id}`, name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] },
    classPool: [1, 2, 5, 6].map((n) => attack(`c${n}`)).concat([3, 4, 7, 8].map((n) => guard(`c${n}`))),
});
const heroDef = () => ({
    kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
    personalPassive: { id: 'pp-pc-hero', name: '意志', trigger: 'on-low-hp', effects: [{ op: 'block', amount: 6 }] },
    personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')],
    starterDeck: [...STARTER],
});
const row = (def, createdAt, version = 1) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version, createdAt, definition: def });
const ai = (mes) => ({ mes, swipe_id: 0, is_user: false });
const user = (mes) => ({ mes, is_user: true });
const report = (result, body) => `<igs-combat-report result="${result}">${body}</igs-combat-report>`;
const win = (amount) => user(report('win', `[igs-combat:exp|我|${amount}|大胜]`));
const expFor = (level) => { let n = 0; while (n <= 100000 && expProgress(n).level < level) n += 1; return n; };

function memoryTables(profile = []) {
    const tables = { profile: [...profile], ledger: [] };
    tables.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(tables.profile), ledger: clone(tables.ledger) });
    tables.append = async (kind, records) => {
        const written = [];
        for (const record of records) if (!tables[kind].some((x) => x.id === record.id)) { tables[kind].push(clone(record)); written.push(record.id); }
        return { ok: true, written, present: [], rejected: [], pending: [] };
    };
    return tables;
}
function ledgerSetup(profiles, initial) {
    const tables = memoryTables(profiles);
    const ref = { chat: initial };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7 });
    return { tables, ref, ledger };
}
const heroOf = (state) => state.characters.get('pc-hero');

test('卡牌归属：新字段校验、旧牌回退、固定与临时牌解析，开战还原不修改账本目录', async () => {
    const { normalizeCard } = await import('../src/combat/schema.js');
    const { solveCardTemplate } = await import('../src/combat/card-templates.js');
    const { cardArchetypeOf } = await import('../src/combat/card-origin.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const base = { ...solveCardTemplate('strike', 1, 'common'), id: 'origin-card', name: '旧斩', cost: 1, rarity: 'common' };
    assert.equal(normalizeCard(base).ok, true);
    assert.equal(normalizeCard({ ...base, archetype: 'mage' }).value.archetype, 'mage');
    assert.equal(normalizeCard({ ...base, archetype: 'unknown' }).ok, false);
    assert.equal(cardArchetypeOf(base), 'general');
    assert.equal(cardArchetypeOf(base, { 'origin-card': 'priest' }), 'priest');
    assert.equal(cardArchetypeOf({ ...base, archetype: 'mage' }, { 'origin-card': 'warrior' }), 'mage');
    for (const [id, role] of [['fx-mage-01', 'mage'], ['fx-general-01', 'general'], ['shadow-shiv', 'assassin'], ['forge-blade', 'warrior'], ['summon-soul', 'summoner'], ['token-miracle', 'bard'], ['token-boulder', 'warrior']]) {
        assert.equal(cardArchetypeOf({ id }), role);
    }
    assert.throws(() => cardArchetypeOf({ ...base, archetype: 'unknown' }), /invalid-card-archetype/);
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [user('出发')]);
    const me = heroOf(await ledger.effectiveState());
    const before = clone([...me.catalog]);
    const setup = buildSetup({ heroId: me.id, controllable: [me.id], allies: [me], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) }, { enemies: [{ name: '狼', count: 1 }], tier: 'normal' }).setup;
    const catalog = setup.units.find(unit => unit.id === me.id).catalog;
    assert.equal(catalog.c1.archetype, 'warrior');
    assert.equal(catalog.m1.archetype, 'general');
    assert.equal(catalog['basic-strike'].archetype, 'general');
    assert.deepEqual(clone([...me.catalog]), before);
    assert.equal(me.catalog.get('c1').archetype, undefined);
    const current = {
        ...me, classProfile: { ...me.classProfile, archetype: 'mage' },
        attributes: { ...me.attributes, role: 'assassin', scores: { str: 16, dex: 12, con: 10, int: 18, wis: 14, cha: 10 }, proficiency: 2 },
        battleGrowth: { cards: { c1: { damage: 3, block: 0 } }, hpMax: 0 },
    };
    const frozen = buildSetup({ heroId: me.id, controllable: [me.id], allies: [current], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) }, { enemies: [{ name: '狼', count: 1 }], tier: 'normal' }).setup;
    const frozenHero = frozen.units.find(unit => unit.id === me.id);
    assert.equal(frozen.attributeRules, 1);
    assert.equal(frozenHero.attributePolicy.role, 'mage');
    assert.equal(frozenHero.attributePolicy.proficiency, 2);
    assert.equal(frozenHero.catalog.c1.archetype, 'warrior');
    assert.equal(frozenHero.catalog.c1.effects[0].amount, me.catalog.get('c1').effects[0].amount + 3);
    assert.deepEqual(frozenHero.catalog.m1.effects, me.catalog.get('m1').effects);
    assert.equal(frozenHero.catalog.c1.scaling, undefined);
    current.attributes.scores.int = 1;
    assert.equal(frozenHero.attributePolicy.scores.int, 18);
    const battle = createBattle(frozen, SEED);
    assert.equal(battle.ok, true, JSON.stringify(battle.error));
    assert.deepEqual(battle.state.units[me.id].attributePolicy, frozenHero.attributePolicy);
    assert.deepEqual(replayBattle(frozen, SEED, []).state, battle.state);
    const { assembleClass, assembleGrowth } = await import('../src/combat/generation-assembly.js');
    for (const [archetype, expected] of [['mage', 'mage'], [undefined, 'general']]) {
        const grown = assembleGrowth({ name: '新斩', template: 'strike', cost: 1 }, { key: 'origin-growth', input: { output: 'card', rarity: 'common', templates: ['strike'], archetype } });
        assert.equal(grown.value?.card.archetype, expected, JSON.stringify(grown));
    }
    const cls = classDef('cls-blade');
    cls.classPool[1].archetype = 'mage';
    const upgrades = ledgerSetup([row(cls, 1), row(heroDef(), 2)], ['斩c1', '斩c2', '斩m1'].map(name => ai(`[igs-combat:upgrade|我|${name}|精进]`)));
    const scan = await upgrades.ledger.scan();
    const pending = scan.pendingGeneration.filter(item => item.kind === 'upgrade');
    assert.equal(pending.length, 3);
    const targets = ['c1', 'c2', 'm1'];
    const entries = pending.map((item, index) => ({
        id: ledgerEntryId('upgrade', 'pc-hero', item.anchor), type: 'upgrade', character: 'pc-hero', anchor: item.anchor,
        payload: { targetId: targets[index], card: { ...base, id: `up-${index}`, archetype: 'bard' } }, createdAt: 7,
    }));
    assert.equal((await upgrades.ledger.append(entries)).ok, true);
    const upgraded = heroOf(await upgrades.ledger.effectiveState());
    assert.deepEqual(targets.map(id => upgraded.catalog.get(id).archetype), [undefined, 'mage', undefined]);
    assert.deepEqual(targets.map(id => cardArchetypeOf(upgraded.catalog.get(id), upgraded.cardOrigins)), ['warrior', 'mage', 'general']);
    const nextClass = assembleClass({ className: '灵契师', archetype: 'summoner' }, { key: 'empty-class' }).profile;
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(nextClass, 2), row(heroDef(), 3)]);
    const switchedLedger = createCombatLedger({ tables, chat: () => [ai('转职')], userName: '主角', wallet: () => 1000, now: () => 7 });
    const oldHero = heroOf(await switchedLedger.effectiveState());
    assert.equal((await switchedLedger.respecClass(oldHero.id, nextClass.id)).ok, true);
    const switched = heroOf(await switchedLedger.effectiveState());
    assert.deepEqual(switched.classProfile.classPool, []);
    assert.deepEqual(switched.deckEntries, oldHero.deckEntries);
    assert.deepEqual([...switched.owned], [...oldHero.owned]);
    assert.equal(switched.catalog.get('c1').archetype, undefined, '旧目录不补写归属');
    assert.equal(cardArchetypeOf(switched.catalog.get('c1'), switched.cardOrigins), 'warrior');
    assert.equal(switched.classProfile.archetype, 'summoner');
    assert.deepEqual((await switchedLedger.effectiveState()).diagnostics, []);
});

test('专属卡按等级解锁：Lv5 / Lv10 解锁对应槽位、等级退回重新锁上；剧情提前解锁不重复计；档案没有该槽位时记待生成，写新版本档案后解锁', async () => {
    // 旧档案预生成的专属卡（ID 不带槽位后缀）占第 1 槽，沿用旧规则：升级不自动解锁、不记待生成，只由剧情 learn 解锁。
    const legacy = { id: 'g1', name: '天翔一闪', type: 'attack', cost: 2, rarity: 'signature', effects: [{ op: 'damage', amount: 14 }] };
    const legacyProfiles = () => [row(classDef('cls-blade'), 1), row({ ...heroDef(), signatureCards: [legacy] }, 2)];

    const old = ledgerSetup(legacyProfiles(), [win(expFor(5) - 1), win(1)]);
    await old.ledger.scan();
    let state = await old.ledger.effectiveState();
    assert.equal(heroOf(state).level, 5);
    assert.equal(heroOf(state).owned.get('g1') || 0, 0);
    assert.equal(heroOf(state).deck.includes('g1'), false);
    assert.equal(Object.hasOwn(heroOf(state), 'signatureDue'), false);
    assert.deepEqual(signaturePending(state), []);

    const early = ledgerSetup(legacyProfiles(), [ai('剑光乍起。\n[igs-combat:learn|我|天翔一闪|拔刀即斩]'), win(expFor(5))]);
    const learn = growthEntity((await early.ledger.scan()).pendingGeneration.find((p) => p.kind === 'learn'), heroOf(await early.ledger.effectiveState()), { now: 2 });
    assert.equal((await early.ledger.append([learn.entry])).ok, true);
    assert.equal(heroOf(await early.ledger.effectiveState()).owned.get('g1'), 1);

    // 单条 EXP 上限 1000，升到 Lv10 分两场战报：第 1 槽在第 0 楼跨级，第 2 槽在第 1 楼跨级。
    const fresh = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [win(1000), win(expFor(10) - 1000)]);
    await fresh.ledger.scan();
    state = await fresh.ledger.effectiveState();
    assert.equal(heroOf(state).level, 10);
    assert.deepEqual(heroOf(state).signatureDue.map((d) => [d.slot, d.level, d.anchor.messageId]), [[1, 5, 0], [2, 10, 1]]);
    const pending = signaturePending(state);
    assert.deepEqual(pending.map((p) => [p.kind, p.characterId, p.slots, p.anchor.messageId]), [['signature', 'pc-hero', [1, 2], 0]]);
    const { entity } = growthEntity(pending[0], heroOf(state), { profileMeta: state.profileMeta });
    assert.deepEqual([entity.kind, entity.input.slots, entity.input.costSlots, entity.fixed.version], ['signature-card', [1, 2], [2, 3], 2]);
    const request = async () => JSON.stringify({ entities: [{ key: entity.key, value: { cards: [['天翔一闪', 'strike'], ['终焉雷鸣', 'strike']] } }] });
    const result = await generateEntities([entity], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    const writes = generationWrites(result, { createdAt: 9 });
    assert.deepEqual([writes.profiles.length, writes.entries.length, writes.profiles[0].version], [1, 0, 2]);
    assert.ok(writes.profiles[0].definition.signatureCards.every(card => card.archetype === 'warrior'));
    fresh.tables.profile.push(clone(writes.profiles[0]));
    state = await fresh.ledger.effectiveState();
    assert.deepEqual(['pc-hero-g1', 'pc-hero-g2'].map((id) => heroOf(state).owned.get(id)), [1, 1]);
    assert.deepEqual(heroOf(state).profile.signatureCards.map((c) => [c.id, c.name, c.cost]), [['pc-hero-g1', '天翔一闪', 2], ['pc-hero-g2', '终焉雷鸣', 3]]);
    assert.equal(Object.hasOwn(heroOf(state), 'signatureDue'), false);
    assert.deepEqual(signaturePending(state), []);
    // 与档案已有专属卡重名时拒收
    const onlyFirst = { ...heroOf(state), profile: { ...heroOf(state).profile, signatureCards: [heroOf(state).profile.signatureCards[0]] } };
    const dupEntity = growthEntity({ ...pending[0], slots: [2] }, onlyFirst, { profileMeta: state.profileMeta }).entity;
    const dup = await generateEntities([dupEntity], { request: async () => JSON.stringify({ entities: [{ key: dupEntity.key, value: { cards: [['天翔一闪', 'strike']] } }] }), llm: LLM });
    assert.equal(dup.ok, false);
    assert.ok(dup.rejected[0].errors.some((e) => e.reason === 'name-duplicate'));
});

test('助战绝招（ace / legend）取角色自己伤害最高的技能强化：同名、数值 ×1.5、带冷却；新 setup 带 openingCharged / randomTargets', async () => {
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { scaleSkills } = await import('../src/combat/card-scaling.js');
    const skill = (id, amount) => ({ id, name: `技${id}`, intent: 'attack', effects: [{ op: 'damage', amount }] });
    const ace = { kind: 'skill-character', id: 'sc-ace', name: '白露', tier: 'ace', base: { hp: 50 },
        skills: [skill('s1', 10), skill('s2', 6), { id: 's3', name: '守', intent: 'defend', effects: [{ op: 'block', amount: 6 }] }],
        passives: [{ id: 'pa1', name: '守夜', trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }] }] };
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2), row(ace, 3)], [user('出发')]);
    const state = await ledger.effectiveState();
    const lobby = { heroId: 'pc-hero', controllable: ['pc-hero'], allies: [heroOf(state), state.characters.get('sc-ace')], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) };
    const built = buildSetup(lobby, { enemies: [{ name: '狼', count: 1 }], tier: 'normal' });
    assert.equal(built.ok, true, JSON.stringify(built));
    assert.deepEqual([built.setup.openingCharged, built.setup.randomTargets], [true, true]);
    const unit = built.setup.units.find((u) => u.id === 'sc-ace');
    const expectedSkills = scaleSkills(ace.skills, state.characters.get('sc-ace').attributes).map((s) => Math.min(99, Math.max(1, Math.round(s.effects[0].amount * 1.3))));
    assert.deepEqual(unit.skills.slice(0, 3).map((s) => s.effects[0].amount), expectedSkills);
    const ult = unit.skills.find((s) => s.ultimate);
    assert.deepEqual([ult.id, ult.cooldown, ult.name], ['sc-ace-u1', 3, '技s1']);
    assert.equal(ult.effects[0].amount, Math.min(99, Math.round(expectedSkills[0] * 1.5)));
    const battle = createBattle(built.setup, 1);
    assert.equal(battle.ok, true, JSON.stringify(battle.error));
    assert.equal(chooseSkillIntent(battle.state, 'sc-ace', 0.9).skillId, 'sc-ace-u1');
});

test('场外排位（v6 G3b，场上普通敌人 3 名）：首领 → 精英 → 普通，精英先于普通怪上场与补位；同一 combatId 结果不变', async () => {
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [user('出发')]);
    const state = await ledger.effectiveState();
    const enemies = new Map([['狼', templateEnemy('狼', 'normal')], ['头狼', templateEnemy('头狼', 'elite')]]);
    const lobby = { heroId: 'pc-hero', controllable: ['pc-hero'], allies: [heroOf(state)], enemies };
    const start = { enemies: [{ name: '狼', count: 6 }, { name: '头狼', count: 2 }], tier: 'normal' };
    const built = buildSetup(lobby, start, { combatId: 'c-elite' });
    assert.equal(built.ok, true, JSON.stringify(built));
    const tierOf = (id) => (built.setup.units.find((u) => u.id === id)?.name.startsWith('头狼') ? 'elite' : 'normal');
    assert.equal(built.setup.foeCap, 3);
    assert.equal(built.setup.crowd, 0.22);
    assert.equal(built.setup.reserve.length, 5);
    assert.deepEqual(built.setup.reserve.map(tierOf), ['normal', 'normal', 'normal', 'normal', 'normal']);
    assert.deepEqual(buildSetup(lobby, start, { combatId: 'c-elite' }).setup.reserve, built.setup.reserve);
});

test('多敌建局（v6 G3b）：胜场阶梯烘焙生命与伤害并保存 crowd，旧 setup 重放不再次缩放', async () => {
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [user('出发')]);
    const me = heroOf(await ledger.effectiveState());
    const lobby = { heroId: me.id, controllable: [me.id], allies: [me], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) };
    const make = (count, wins) => buildSetup({ ...lobby, battleWins: wins }, { enemies: [{ name: '狼', count }], tier: 'normal' }, { combatId: 'g3b-scale' }).setup;
    const single = make(1, 20).units.find(unit => unit.side === 'enemy');
    for (const [wins, scales] of [[0, [0.8, 0.4, 0.28, 0.22]], [4, [0.8, 0.4, 0.28, 0.22]],
        [5, [0.85, 0.55, 0.46, 0.42]], [9, [0.85, 0.55, 0.46, 0.42]],
        [10, [0.9, 0.7, 0.64, 0.61]], [14, [0.9, 0.7, 0.64, 0.61]],
        [15, [0.95, 0.85, 0.82, 0.81]], [19, [0.95, 0.85, 0.82, 0.81]], [20, [1, 1, 1, 1]]]) {
        for (const count of [1, 2, 3, 4, 8]) {
            const setup = make(count, wins);
            const scale = scales[Math.min(count, 4) - 1];
            assert.equal(setup.crowd, scale);
            for (const enemy of setup.units.filter(unit => unit.side === 'enemy')) {
                assert.equal(enemy.maxHp, Math.max(1, Math.round(single.maxHp * scale)));
                assert.equal(enemy.damageScale, Math.round(single.damageScale * scale * 100) / 100);
            }
            const created = createBattle(setup, 1);
            assert.equal(created.ok, true, JSON.stringify(created.error));
            assert.equal(created.state.crowd, scale);
            assert.deepEqual(replayBattle(setup, 1, []).state, created.state);
        }
    }
    for (const rulesVersion of [3, 4, 5, 6]) {
        const saved = { ...make(2, 10), rulesVersion };
        delete saved.attributeRules;
        delete saved.hpLossRules;
        delete saved.crowd;
        delete saved.foeCap;
        delete saved.trackHpLoss;
        delete saved.rewardOwner;
        const replayed = replayBattle(saved, 1, []);
        assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
        assert.equal(replayed.state.crowd, undefined);
        for (const enemy of saved.units.filter(unit => unit.side === 'enemy')) {
            assert.equal(replayed.state.units[enemy.id].maxHp, enemy.maxHp);
            assert.equal(replayed.state.units[enemy.id].damageScale, enemy.damageScale);
        }
    }
});

test('剧情精英校准：职业初期数值每五胜恢复，生成标记、混合编制与保存重放一致', async () => {
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { scaleEnemyStats } = await import('../src/combat/rules.js');
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [user('出发')]);
    const me = heroOf(await ledger.effectiveState());
    const template = templateEnemy('头狼', 'elite');
    const base = scaleEnemyStats(template);
    const make = (role, wins, generated = false, count = 1) => buildSetup({
        heroId: me.id, controllable: [me.id], battleWins: wins,
        allies: [{ ...me, classProfile: { ...me.classProfile, archetype: role } }],
        enemies: new Map([['头狼', { ...template, generated }]]),
    }, { tier: 'elite', enemies: [{ name: '头狼', count }] }).setup;
    for (const role of Object.keys(COMBAT_RULES.archetypes)) {
        const opening = COMBAT_RULES.openingEliteScale[role];
        let previous = 0;
        for (const wins of [0, 4, 5, 9, 10, 14, 15, 19, 20, 50]) {
            const expected = opening + (1.4 - opening) * Math.min(4, Math.floor(wins / 5)) / 4;
            const factor = crowdScaleFor(1, wins) * encounterScaleFor('elite', wins, role);
            assert.ok(Math.abs(factor - expected) < 1e-12);
            assert.ok(factor >= previous);
            previous = factor;
            for (const generated of [false, true]) {
                const setup = make(role, wins, generated);
                const enemy = setup.units.find(unit => unit.side === 'enemy');
                assert.equal(enemy.maxHp, Math.round(base.hp * expected));
                assert.equal(enemy.damageScale, Math.round(base.damageScale * expected * 100) / 100);
                const created = createBattle(setup, 7);
                assert.equal(created.ok, true, JSON.stringify(created.error));
                assert.deepEqual(replayBattle(setup, 7, []).state, created.state);
            }
        }
    }
    for (const wins of [0, 5, 10, 15, 20]) {
        assert.equal(encounterScaleFor('normal', wins, 'warrior'), 1);
        assert.equal(encounterScaleFor('boss', wins, 'warrior'), 1);
        assert.equal(encounterScaleFor('elite', wins, 'unknown'), 1.4 / crowdScaleFor(1, wins));
    }
    const setup = make('guardian', 0, false, 4);
    assert.equal(setup.reserve.length, 1);
    const expected = crowdScaleFor(4) * encounterScaleFor('elite', 0, 'guardian');
    for (const enemy of setup.units.filter(unit => unit.side === 'enemy')) assert.equal(enemy.maxHp, Math.round(base.hp * expected));
    const saved = clone(setup);
    make('mage', 20);
    assert.deepEqual(replayBattle(saved, 7, []).state, createBattle(setup, 7).state);
});


test('多敌会话（v6 G3b）：按开战楼冻结普通胜场，保存后重放不漂移，弱敌不推进阶梯，回退后新局降档', async t => {
    const { createCombatSession, sessionKeyFor } = await import('../src/combat/session.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { createCombatChatRecord } = await import('../src/host/combat-chat-record.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const { reportIdFor } = await import('../src/combat/report.js');
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: db.api });
    assert.equal((await tables.ensure()).ok, true);
    const enemy = { ...templateEnemy('狼', 'normal'), skills: [{ ...idle, id: 'wait-a' }, { ...idle, id: 'wait-b' }] };
    assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2), row(enemy, 3)])).ok, true);
    const victory = (i, weak = false) => {
        const rid = reportIdFor(`g3b-win-${i}`);
        return user(`<igs-combat-report id="${rid}" result="win"${weak ? ' weak="1"' : ''}>胜利</igs-combat-report>\n[igs-combat:exp|主角|1|战斗:${rid}]`);
    };
    const chat = [ai('序章'), ...Array.from({ length: 9 }, (_, i) => victory(i))];
    const anchor = chat.length;
    chat.push(ai('[igs-combat:start|林间交战|狼*4]'), victory(9));
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    assert.equal((await ledger.scan()).ok, true);
    assert.equal(heroOf(await ledger.effectiveState()).purge.battle, 10);
    const storage = createCountingStorage();
    const chatRecord = createCombatChatRecord({ SillyTavern: { getContext: () => ({ chat, saveChat: async () => {} }) } });
    const session = createCombatSession({ ledger, tables, storage, chatRecord, chat: () => chat,
        getChatId: () => 'g3b-count', userName: '主角', now: () => 7, retryDelays: [], llm: { source: 'tavern' },
        request: async prompt => JSON.stringify({ entities: JSON.parse(prompt.user).entities.map(entity => ({ key: entity.key,
            value: entity.kind === 'encounter-theme' ? { theme: 'western' }
                : Object.fromEntries(['slots', 'reserve'].map(set => [set, (entity.input[set] || []).map((slot, i) => [
                    `林间旧物${set}${i}`, slot.kind === 'item' ? 'potion' : slot.kind === 'card' ? (slot.cost === 0 ? 'jab' : 'strike')
                        : slot.kind === 'gear' ? (slot.templates?.[0] || 'opening-guard') : null, '林间战利品',
                ])])),
        })) }),
    });
    t.after(() => { session.dispose(); tables.client.dispose(); });
    assert.equal((await session.prepare(anchor)).ok, true);
    assert.equal(session.state().lobby.battleWins, 9, '准备写入奖励并重读后，仍只取开战楼之前胜场');
    assert.equal(session.start().ok, true);
    session.flushPersist();
    const saved = JSON.parse(storage.data.get(sessionKeyFor('g3b-count')));
    assert.equal(saved.setup.crowd, 0.42);
    const firstUnits = clone(saved.setup.units);
    session.reset();
    assert.equal(session.resume().ok, true);
    assert.equal(session.state().record.setup.crowd, 0.42, '全账本已十胜，恢复仍沿用本场保存档位');
    assert.deepEqual(session.state().record.setup.units, firstUnits);
    session.reset();
    chat.push(victory('weak', true));
    assert.equal((await ledger.scan()).ok, true);
    assert.equal(heroOf(await ledger.effectiveState()).purge.battle, 10, '弱敌胜利不推进普通胜场');
    const next = chat.length;
    chat.push(ai('[igs-combat:start|下一场交战|狼*4]'));
    assert.equal((await session.prepare(next)).ok, true);
    assert.equal(session.state().lobby.battleWins, 10);
    assert.equal(session.start().ok, true);
    assert.equal(session.state().record.setup.crowd, 0.61, '第十胜后的下一场提升一档');
    session.reset();
    chat.splice(anchor);
    chat.push(ai('[igs-combat:start|回退后交战|狼*4]'));
    assert.equal(heroOf(await ledger.effectiveState()).purge.battle, 9);
    assert.equal((await session.prepare(anchor)).ok, true);
    assert.equal(session.state().lobby.battleWins, 9);
    assert.equal(session.start().ok, true);
    assert.equal(session.state().record.setup.crowd, 0.42, '回退后新建战斗按九胜降档');
});

test('统一失去物：数量省略为1、全角数量、全部与角色默认值；非法标签只记诊断，获得与失去锚点不相撞', () => {
    const text = [
        '[igs-fx:item|失去|青锋剑|被缴械]',
        '[igs-fx:item|失去|回春丹||２|爱丽丝]',
        '[igs-fx:item|失去|火把||全部]',
        '[igs-fx:item|失去|铜钱||很多]',
        '[igs-fx:item|失去|||1]',
        '[igs-fx:item|获得|青锋剑|被缴械|武器]',
    ].join('\n');
    const { directives, diagnostics } = extractLossDirectives(text);
    assert.deepEqual(directives.map((d) => [d.character, d.name, d.count ?? 'all', d.reason]), [['我', '青锋剑', 1, '被缴械'], ['爱丽丝', '回春丹', 2, ''], ['我', '火把', 'all', '']]);
    assert.deepEqual(diagnostics.map((d) => [d.code, d.field, d.problem]), [['combat-loss-invalid', 'count', 'not-integer'], ['combat-loss-invalid', 'name', 'required']]);
    const losses = scanLossTags(text);
    assert.equal(losses.length, 5);
    assert.equal(new Set([...losses, ...scanGainTags(text)].map((tag) => tag.tagHash)).size, 6);
});

test('统一失去物（未注入背包）：装备卸下并移出持有，再获得保留原加成；失去楼换swipe后重放恢复', async () => {
    const gain = '[igs-fx:item|获得|铁弓|猎户的弓|武器|稀有]';
    const regain = '[igs-fx:item|获得|铁弓|夺回的弓|武器]';
    const { ref, ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai(gain), ai('[igs-fx:item|失去|铁弓|被搜走]'), ai(regain)]);
    const anchorOf = (messageId, text) => {
        const [tag] = scanGainTags(text);
        return { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
    };
    const equip = (anchor, description, rarity, bonus) => ({ id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, createdAt: 1,
        payload: { gearId: gearIdFor('铁弓'), name: '铁弓', slot: 'weapon', description, rarity, bonus } });
    const bonus = { ability: 'dex', amount: 3 };
    assert.equal((await ledger.append([equip(anchorOf(0, gain), '猎户的弓', 'rare', bonus)])).ok, true);
    assert.equal((await ledger.scan()).ok, true);
    let me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.gear.slots.weapon ?? null, me.gear.bag.length], [null, 0]);
    assert.equal((await ledger.append([equip(anchorOf(2, regain), '夺回的弓', 'common', { ability: 'dex', amount: 1 })])).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.gear.slots.weapon?.description, me.gear.slots.weapon?.rarity, me.gear.slots.weapon?.bonus], ['猎户的弓', 'rare', bonus]);
    ref.chat[1].swipe_id = 1;
    assert.equal(heroOf(await ledger.effectiveState()).gear.slots.weapon?.description, '夺回的弓');
});

test('统一失去物：物品表扣减、已丢失不删行、装备卸下保留定义；补扫幂等，再获得恢复原加成', async () => {
    const host = createLedgerMockHost();
    host.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: host.api });
    const inventory = createInventoryTables({ api: host.api, client: tables.client, serial: tables.serial });
    assert.equal((await tables.ensure()).ok, true);
    assert.equal((await inventory.ensure()).ok, true);
    assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2)])).ok, true);
    const gain = '[igs-fx:item|获得|回春丹|回复|道具]';
    const chat = [ai(gain)];
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', inventory, now: () => 7 });
    const ring = { gearId: gearIdFor('铜戒'), name: '铜戒', slot: 'accessory', description: '刻着家纹', rarity: 'epic', bonus: { ability: 'con', amount: 4 } };
    assert.equal((await ledger.grantInitialGear('pc-hero', [ring], { anchor: { messageId: 0, swipeId: 0 } })).ok, true);
    const [tag] = scanGainTags(gain);
    const anchor = { messageId: 0, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
    assert.equal((await ledger.append([{ id: ledgerEntryId('item', 'pc-hero', anchor), type: 'item', character: 'pc-hero', anchor, createdAt: 1,
        payload: { itemId: itemIdFor('回春丹'), name: '回春丹', count: 2, effects: [{ op: 'heal', amount: 10 }], description: '回复' } }])).ok, true);
    assert.equal((await inventory.changeQuantities({ name: '火把', delta: 2, category: '杂物' })).ok, true);
    chat.push(ai('[igs-fx:item|失去|铜戒|被搜走]\n[igs-fx:item|失去|回春丹|被抢走]\n[igs-fx:item|失去|火把||全部]'));
    const scan = await ledger.scan();
    assert.equal(scan.ok, true, JSON.stringify(scan));
    const lost = inventory.read().inventory.items.filter((item) => item.lost);
    assert.deepEqual(lost.map((item) => [item.name, item.quantity]), [['铜戒', 1], ['火把', 2]]);
    assert.equal(host.calls.deleteRow, 0);
    let me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.gear.slots.accessory ?? null, me.gear.bag.length, me.others.length, me.items.map((item) => [item.name, item.count])], [null, 0, 0, [['回春丹', 1]]]);
    await ledger.scan();
    assert.equal(tables.read().ledger.filter((entry) => entry.type === 'lose').length, 3);

    const regained = '[igs-fx:item|获得|铜戒|夺回的戒指|饰品]';
    chat.push(ai(regained));
    const [again] = scanGainTags(regained);
    const back = { messageId: 2, swipeId: 0, tagHash: again.tagHash, occurrence: again.occurrence };
    const result = await ledger.append([{ id: ledgerEntryId('equip', 'pc-hero', back), type: 'equip', character: 'pc-hero', anchor: back, createdAt: 8,
        payload: { ...ring, description: '普通的戒指', rarity: 'common', bonus: { ability: 'con', amount: 1 } } }]);
    assert.equal(result.ok, true, JSON.stringify(result));
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.gear.slots.accessory?.description, me.gear.slots.accessory?.rarity, me.gear.slots.accessory?.bonus], ['刻着家纹', 'epic', ring.bonus]);
    const restored = inventory.read().inventory.items.find((item) => item.name === '铜戒');
    assert.deepEqual([restored.quantity, restored.category, restored.lost], [1, '装备', undefined]);
});

test('奖励槽位：普通盲翻卡牌率为杂兵30%、精英40%、首领50%；保留保底槽、备用套和翻牌联动', () => {
    const character = { kind: 'deck-character', id: 'pc-hero' };
    const targets = { normal: 0.3, elite: 0.4, boss: 0.5 };
    const hits = Object.fromEntries(Object.keys(targets).map((tier) => [tier, { main: 0, reserve: 0 }]));
    const samples = 3000;
    const rank = (rarity) => ['common', 'uncommon', 'rare', 'epic', 'mythic'].indexOf(rarity);
    for (let i = 0; i < samples; i += 1) {
        for (const tier of Object.keys(targets)) {
            const combatId = `cb|${i}`;
            const plan = planRewardSlots({ combatId, tier, enemyTiers: [tier], character });
            assert.deepEqual([plan.exp, plan.slots.length, plan.reserve.length], [victoryExpFor([tier]), REWARD_SLOT_COUNT, REWARD_SLOT_COUNT]);
            for (const [set, slots] of [['main', plan.slots], ['reserve', plan.reserve]]) {
                const index = flipOrder({ combatId, slots: plan.slots, reserve: plan.reserve }, set)[0];
                hits[tier][set] += slots[index].kind === 'card' ? 1 : 0;
                for (const slot of slots) {
                    assert.ok(rank(slot.rarity) >= 0);
                    if (slot.kind === 'card') {
                        assert.ok([0, 1, 2, 3].includes(slot.cost));
                        if (tier === 'normal') assert.ok(rank(slot.rarity) <= 1);
                    }
                    if (slot.kind === 'item') assert.equal(slot.count, rank(slot.rarity) >= 3 ? 2 : 1);
                }
                if (tier !== 'normal') assert.notEqual(slots[0].kind, 'keepsake');
                if (tier === 'boss') assert.ok(rank(slots[0].rarity) >= 3);
            }
        }
    }
    for (const tier of Object.keys(targets)) for (const set of ['main', 'reserve']) {
        const rate = hits[tier][set] / samples;
        assert.ok(Math.abs(rate - targets[tier]) < 0.035, `${tier} ${set} card ${rate}`);
    }
    const base = planRewardSlots({ combatId: 'cb|x', tier: 'elite', character });
    assert.deepEqual(base, planRewardSlots({ combatId: 'cb|x', tier: 'elite', character }));
    const reflip = planRewardSlots({ combatId: 'cb|x', tier: 'elite', character, links: { reflip: true } });
    assert.deepEqual([reflip.slots.length, reflip.reserve.length], [REWARD_SLOT_COUNT + 1, REWARD_SLOT_COUNT + 1]);
    const lucky = planRewardSlots({ combatId: 'cb|x', tier: 'elite', character, links: { fortune: true } });
    for (const set of ['slots', 'reserve']) {
        const steps = lucky[set].map((slot, i) => rank(slot.rarity) - rank(base[set][i].rarity));
        assert.deepEqual([steps.filter((step) => step === 1).length, steps.every((step) => step === 0 || step === 1)], [1, true]);
    }
    for (let i = 0; i < 50; i += 1) {
        const plan = planRewardSlots({ combatId: `cb|s${i}`, tier: 'boss', character: { kind: 'skill-character', id: 'sc-a' } });
        assert.ok([...plan.slots, ...plan.reserve].every((slot) => slot.kind !== 'card'));
    }
});

test('正文完成：普通正文和重复就绪通知都检查主角档案，仍转发开战准备与成长楼层', async t => {
    const { bootstrapIGS } = await import('../src/index.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createCombatServices } = await import('../src/core/combat-services.js');
    const callbacks = new Set(), calls = [];
    const global = { localStorage: createMemoryStorage() };
    const services = { ...createCombatServices({ global }),
        syncRegex() {}, refreshGrowth() {}, takeoverInventory() {},
        prepareProtagonist() { calls.push(['protagonist']); },
        autoPrepare(id) { calls.push(['prepare', id]); },
        autoGrowth(id) { calls.push(['growth', id]); },
    };
    const vn = bootstrapIGS({ global, autoAttachMagicWand: false, combatServices: services,
        illustrationMessageHost: {
            getChatId: () => 'ordinary-story', readFloor: id => ({ messageId: id, text: '只是普通正文，没有开战或立绘标签。' }),
            on: () => () => {}, readPreviousAiTexts: () => [], readCharacterLore: async () => [],
            onImageFloorReady(fn) { callbacks.add(fn); return () => callbacks.delete(fn); },
            attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }), destroy() {},
        },
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    t.after(() => vn.shutdown());
    const notify = () => { for (const callback of callbacks) callback(7); };
    assert.ok(callbacks.size > 0, '已订阅正文完成通知');
    calls.length = 0;
    notify(); notify();
    assert.deepEqual(calls, [
        ['protagonist'], ['prepare', 7], ['growth', 7],
        ['protagonist'], ['prepare', 7], ['growth', 7],
    ]);
});

test('背包装备详情：显示原六维加成与被动，物品描述保持文本转义', async t => {
    const { JSDOM } = await import('jsdom');
    const { createRecordPanelController } = await import('../src/visual/igs-ui/record-panel.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const dom = new JSDOM('<div id="igs-overlay"></div>');
    const host = createLedgerMockHost({ supportCallbacks: true });
    host.sheets.sheet_userbag = { ...userInventorySheet(), content: [
        ['row_id', '物品名称', '数量', '类别', '描述/效果'],
        ['1', '铜戒', '1', '装备', '<img src=x onerror=alert(1)>'],
    ] };
    const gear = { gearId: gearIdFor('铜戒'), name: '铜戒', slot: 'accessory', rarity: 'rare',
        bonus: { ability: 'str', amount: 3 }, passive: { name: '护心', description: '每回合获得2点格挡' }, count: 1 };
    const inventory = { ok: true, points: 0, gear: { slots: {}, bag: [gear] }, items: [], collection: [], others: [] };
    const panel = createRecordPanelController(dom.window.document,
        { AutoCardUpdaterAPI: host.api, localStorage: createMemoryStorage() }, null,
        { getHeroInventory: () => inventory });
    t.after(() => { panel.close(); dom.window.close(); });
    assert.equal(panel.open(dom.window.document.querySelector('#igs-overlay'), {}, 'inventory').ok, true);
    assert.equal(panel.getState().model.status, 'ready');
    const item = dom.window.document.querySelector('.igs-record-slots [data-record-act="select"]');
    assert.ok(item, '物品表中的装备可选');
    item.click();
    const detail = dom.window.document.querySelector('.igs-record-item-detail');
    assert.ok(detail);
    assert.match(detail.textContent, /加成.*力量 \+3/);
    assert.match(detail.textContent, /被动.*每回合获得2点格挡/);
    assert.ok(detail.textContent.includes('<img src=x onerror=alert(1)>'));
    assert.equal(detail.querySelector('img'), null);
});


test('永久成长账本（G24 / G25）：经真实写口写入并回读；同 ID 幂等；累计封顶 20；战报 ID 不符失效；下一场目录与最大生命带上成长', async () => {
    const { BATTLE_GROWTH_TAG_HASH } = await import('../src/combat/ledger.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const host = createLedgerMockHost();
    host.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: host.api });
    assert.equal((await tables.ensure()).ok, true);
    assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2)])).ok, true);
    const floor = (id) => user(`<igs-combat-report id="${id}" result="win">战报</igs-combat-report>`);
    const chat = [floor('r1')];
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    const before = heroOf(await ledger.effectiveState());
    assert.equal(Object.hasOwn(before, 'battleGrowth'), false);

    const entryAt = (messageId, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_GROWTH_TAG_HASH, occurrence: 0 };
        return { id: ledgerEntryId('battle-growth', 'pc-hero', anchor), type: 'battle-growth', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const first = entryAt(0, { cards: [{ cardId: 'c1', damage: 2, block: 0 }, { cardId: 'c3', damage: 0, block: 1 }], hpMax: 3, reportId: 'r1' });
    const written = await ledger.append([first]);
    assert.equal(written.ok, true, JSON.stringify(written));
    assert.deepEqual(tables.read().ledger.filter((e) => e.type === 'battle-growth').map((e) => e.id), [first.id]);
    assert.equal((await ledger.append([clone(first)])).ok, true);
    assert.equal(tables.read().ledger.filter((e) => e.type === 'battle-growth').length, 1);

    let me = heroOf(await ledger.effectiveState());
    assert.deepEqual(me.battleGrowth, { cards: { c1: { damage: 2, block: 0 }, c3: { damage: 0, block: 1 } }, hpMax: 3 });
    assert.equal(me.hpMax - before.hpMax, 3);

    chat.push(floor('r2'));
    assert.equal((await ledger.append([entryAt(1, { cards: [{ cardId: 'c1', damage: 20, block: 0 }], hpMax: 20, reportId: 'r2' })])).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.battleGrowth.cards.c1.damage, me.battleGrowth.hpMax], [20, 20]);

    chat[1] = floor('r9');
    const stale = await ledger.effectiveState();
    assert.ok(stale.inactive.some((item) => item.reason === 'battle-growth-report-invalid'));
    me = heroOf(stale);
    assert.deepEqual([me.battleGrowth.cards.c1.damage, me.battleGrowth.hpMax], [2, 3]);

    const lobbyOf = (character) => ({ heroId: 'pc-hero', controllable: ['pc-hero'], allies: [character], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) });
    const unitOf = (character) => {
        const built = buildSetup(lobbyOf(character), { enemies: [{ name: '狼', count: 1 }], tier: 'normal' });
        assert.equal(built.ok, true, JSON.stringify(built));
        return built.setup.units.find((u) => u.id === 'pc-hero');
    };
    const grown = unitOf(me);
    const plain = unitOf({ ...me, battleGrowth: undefined, hpMax: me.hpMax - 3 });
    assert.equal(grown.catalog.c1.effects[0].amount - plain.catalog.c1.effects[0].amount, 2);
    assert.equal(grown.catalog.c3.effects[0].amount - plain.catalog.c3.effects[0].amount, 1);
    assert.equal(grown.maxHp - plain.maxHp, 3);
    assert.equal(createBattle(buildSetup(lobbyOf(me), { enemies: [{ name: '狼', count: 1 }], tier: 'normal' }).setup, 1).ok, true);
});


test('单张副本（P5a）：起始卡组每张一个副本；带 copyId 的永久成长只记那一张，旧的按牌 ID 成长由同名每张继承；战报失效即回退；开战牌面只给那一张加成', async () => {
    const { BATTLE_GROWTH_TAG_HASH } = await import('../src/combat/ledger.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { cardView } = await import('../src/combat/battle-state.js');
    const floor = (id) => user(`<igs-combat-report id="${id}" result="win">战报</igs-combat-report>`);
    const { ledger, ref } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [floor('r1'), floor('r2')]);
    let me = heroOf(await ledger.effectiveState());
    assert.equal(me.copies.length, STARTER.length);
    assert.equal(new Set(me.deckEntries.map((e) => e.copyId)).size, STARTER.length);
    const c1 = me.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.copyId);
    assert.equal(c1.length, 3);
    const entryAt = (messageId, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_GROWTH_TAG_HASH, occurrence: 0 };
        return { id: ledgerEntryId('battle-growth', 'pc-hero', anchor), type: 'battle-growth', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const bonusOf = (view) => view.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.bonus?.damage || 0);
    assert.equal((await ledger.append([entryAt(0, { cards: [{ cardId: 'c1', copyId: c1[1], damage: 3, block: 0 }], hpMax: 0, reportId: 'r1' })])).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual(bonusOf(me), [0, 3, 0]);
    assert.equal(Object.hasOwn(me, 'battleGrowth'), false);

    assert.equal((await ledger.append([entryAt(1, { cards: [{ cardId: 'c1', damage: 2, block: 0 }], hpMax: 0, reportId: 'r2' })])).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual(me.battleGrowth.cards.c1, { damage: 2, block: 0 });
    assert.deepEqual(bonusOf(me), [0, 3, 0]);

    const lobbyOf = (character) => ({ heroId: 'pc-hero', controllable: ['pc-hero'], allies: [character], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) });
    const built = buildSetup(lobbyOf(me), { enemies: [{ name: '狼', count: 1 }], tier: 'normal' });
    assert.equal(built.ok, true, JSON.stringify(built));
    const created = createBattle(built.setup, 1);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    const amountOf = (copyId) => {
        const inst = Object.keys(created.state.cards).find((key) => created.state.cards[key].copyId === copyId);
        return cardView(created.state, inst).effects[0].amount;
    };
    const frozen = built.setup.units.find(unit => unit.id === me.id);
    const raw = frozen.catalog.c1.effects[0].amount;
    const multiplier = attributeMultiplier(frozen.attributePolicy, 'str');
    assert.equal(amountOf(c1[0]), scalePositive(raw, multiplier));
    assert.equal(amountOf(c1[1]), scalePositive(raw + 3, multiplier));
    assert.equal(amountOf(c1[2]), amountOf(c1[0]));

    ref.chat = [floor('r9'), floor('r2')];
    const stale = await ledger.effectiveState();
    assert.ok(stale.inactive.some((item) => item.reason === 'battle-growth-report-invalid'));
    assert.deepEqual(bonusOf(heroOf(stale)), [0, 0, 0]);
});

test('同模型并卡（P5a）：带 merge 的学牌记录与已持有牌模型一致时并为那张牌的一张副本，不新建目录条目；不带标记的旧记录与模型不同的牌照旧新建', async () => {
    const tag = (skill) => ai(`剑光乍起。\n[igs-combat:learn|我|${skill}|习得]`);
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [tag('新斩'), tag('旧斩'), tag('重斩'), tag('异源斩')]);
    const pending = (await ledger.scan()).pendingGeneration.filter((p) => p.kind === 'learn');
    assert.equal(pending.length, 4);
    const learnAt = (p, card, merge) => ({ id: ledgerEntryId('learn', 'pc-hero', p.anchor), type: 'learn', character: 'pc-hero', anchor: p.anchor, payload: { card, ...(merge ? { merge: true } : {}) }, createdAt: 7 });
    const same = (id, name) => ({ ...attack(id), name });
    const written = await ledger.append([
        learnAt(pending[0], same('lc-a', '新斩'), true),
        learnAt(pending[1], same('lc-b', '旧斩'), false),
        learnAt(pending[2], { ...attack('lc-c'), type: 'skill', name: '重斩' }, true),
        learnAt(pending[3], { ...same('lc-d', '异源斩'), archetype: 'mage' }, true),
    ]);
    assert.equal(written.ok, true, JSON.stringify(written));
    const state = await ledger.effectiveState();
    const me = heroOf(state);
    assert.equal(me.owned.get('c1'), 4);
    assert.equal(me.catalog.has('lc-a'), false);
    assert.equal(me.copies.filter((r) => r.cardId === 'c1').length, 4);
    assert.deepEqual(['lc-b', 'lc-c', 'lc-d'].map((id) => [me.catalog.has(id), me.owned.get(id)]), [[true, 1], [true, 1], [true, 1]]);
    assert.equal(me.catalog.get('lc-d').archetype, 'mage');
    assert.equal(state.diagnostics.some((d) => d.code === 'combat-card-id-collision'), false);
});


test('卡牌刻印（P5b）：inscribe 记录按副本刻印，不带 copyId 取卡组里第一张未刻的同名副本；已刻、牌面不符记诊断；标签失效即回退；开战牌面只给那一张', async () => {
    const { scanCombatTags } = await import('../src/scene/combat-directives.js');
    const { cardView } = await import('../src/combat/battle-state.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const lines = ['[igs-combat:inscribe|主角|斩c1|锋利|开悟]', '[igs-combat:inscribe|主角|斩c1|锋利|再悟]', '[igs-combat:inscribe|主角|斩c1|灵动|误刻]'];
    const { ledger, ref } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], lines.map(ai));
    const entryAt = (messageId, payload) => {
        const [tag] = scanCombatTags(lines[messageId]);
        const anchor = { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId('inscribe', 'pc-hero', anchor), type: 'inscribe', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    let me = heroOf(await ledger.effectiveState());
    const c1 = me.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.copyId);
    const marks = (view) => view.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.inscription ?? null);
    assert.deepEqual(marks(me), [null, null, null]);
    assert.equal((await ledger.append([
        entryAt(0, { cardId: 'c1', inscription: 'sharp', reason: '开悟' }),
        entryAt(1, { cardId: 'c1', copyId: c1[0], inscription: 'sharp', reason: '再悟' }),
        entryAt(2, { cardId: 'c1', inscription: 'nimble', reason: '误刻' }),
    ])).ok, true);
    const effective = await ledger.effectiveState();
    me = heroOf(effective);
    assert.deepEqual(marks(me), ['sharp', null, null]);
    const codes = effective.diagnostics.map((d) => d.code);
    assert.ok(codes.includes('combat-inscribe-copy-invalid'), JSON.stringify(codes));
    assert.ok(codes.includes('combat-inscribe-invalid'), JSON.stringify(codes));

    const built = buildSetup({ heroId: 'pc-hero', controllable: ['pc-hero'], allies: [me], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) }, { enemies: [{ name: '狼', count: 1 }], tier: 'normal' });
    assert.equal(built.ok, true, JSON.stringify(built));
    const created = createBattle(built.setup, 1);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    const instOfCopy = (copyId) => Object.keys(created.state.cards).find((key) => created.state.cards[key].copyId === copyId);
    assert.equal(created.state.cards[instOfCopy(c1[0])].inscription, 'sharp');
    assert.equal(created.state.cards[instOfCopy(c1[1])].inscription, undefined);
    assert.equal(cardView(created.state, instOfCopy(c1[0])).effects[0].amount - cardView(created.state, instOfCopy(c1[1])).effects[0].amount, 3);

    ref.chat = lines.map(() => ai('正文'));
    const stale = await ledger.effectiveState();
    assert.ok(stale.inactive.some((item) => item.reason === 'tag-missing'));
    assert.deepEqual(marks(heroOf(stale)), [null, null, null]);
});

test('卡牌刻印（P5b）：重建保留带刻印的副本（旧个人池牌与减张的职业牌），螺旋只限基础攻击与基础防御，不带 copyId 的刻印只取卡组里的副本', async () => {
    const { scanCombatTags } = await import('../src/scene/combat-directives.js');
    const { inscribable } = await import('../src/combat/mechanics/inscription.js');
    const { TOKEN_CARDS } = await import('../src/combat/rules.js');
    assert.equal(inscribable(BASIC_CARDS['basic-strike'], 'spiral'), true);
    assert.equal(inscribable(BASIC_CARDS['basic-defend'], 'spiral'), true);
    for (const id of ['token-shard', 'token-ward', 'token-spark']) assert.equal(inscribable(TOKEN_CARDS[id], 'spiral'), false, id);

    const lines = [
        '[igs-combat:inscribe|主角|斩m1|锋利|a]', '[igs-combat:inscribe|主角|攻击|螺旋|b]', '[igs-combat:inscribe|主角|斩c2|螺旋|c]',
        '[igs-combat:inscribe|主角|斩c1|锋利|d]', '正文', '正文', '[igs-combat:inscribe|主角|斩c5|锋利|e]',
    ];
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], lines.map(ai));
    const tagEntry = (messageId, payload) => {
        const [tag] = scanCombatTags(lines[messageId]);
        const anchor = { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId('inscribe', 'pc-hero', anchor), type: 'inscribe', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const floorEntry = (type, messageId, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: type, occurrence: 0 };
        return { id: ledgerEntryId(type, 'pc-hero', anchor), type, character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const classCards = ['c2', 'c2', 'c2', 'c3', 'c3', 'c3', 'c4', 'c4', 'c4', 'c5'];
    const newDeck = ['basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend', ...classCards, 'n1', 'n1', 'n2', 'n2'];
    const marks = [
        tagEntry(0, { cardId: 'm1', inscription: 'sharp', reason: 'a' }),
        tagEntry(1, { cardId: 'basic-strike', inscription: 'spiral', reason: 'b' }),
        tagEntry(2, { cardId: 'c2', inscription: 'spiral', reason: 'c' }),
        tagEntry(3, { cardId: 'c1', inscription: 'sharp', reason: 'd' }),
    ];
    const rebuild = floorEntry('rebuild', 4, { personalPool: [attack('n1'), guard('n2'), attack('n3'), guard('n4')], starterDeck: newDeck, cost: 200 });
    assert.equal((await ledger.append([...marks, rebuild])).ok, true);
    let effective = await ledger.effectiveState();
    const diag = (entry) => effective.diagnostics.find((d) => d.id === entry.id)?.code ?? null;
    assert.deepEqual(marks.map(diag), [null, null, 'combat-inscribe-invalid', null]);
    assert.equal(diag(rebuild), null, JSON.stringify(effective.diagnostics));
    let me = heroOf(effective);
    const copiesOf = (view, cardId) => view.copies.filter((c) => c.cardId === cardId);
    assert.deepEqual(copiesOf(me, 'm1').map((c) => c.inscription), ['sharp']);
    assert.equal(me.catalog.has('m1'), true);
    assert.equal(me.catalog.has('m2'), false);
    assert.deepEqual(copiesOf(me, 'c1').map((c) => c.inscription), ['sharp']);
    assert.deepEqual(me.deck, newDeck);
    assert.equal(me.deckEntries.filter((e) => e.cardId === 'basic-strike' && e.inscription === 'spiral').length, 1);
    const m1Copy = copiesOf(me, 'm1')[0].copyId;
    assert.equal(me.deckEntries.some((e) => e.copyId === m1Copy), false);

    // 把刻印的 m1 放回卡组、换下唯一一张 c5：之后不带 copyId 刻 c5 只看卡组，记诊断。
    const swapped = [...newDeck.slice(0, 15), 'm1', ...newDeck.slice(16)];
    const deck = floorEntry('deck', 5, { cards: swapped, revision: 1 });
    const late = tagEntry(6, { cardId: 'c5', inscription: 'sharp', reason: 'e' });
    assert.equal((await ledger.append([deck, late])).ok, true);
    effective = await ledger.effectiveState();
    me = heroOf(effective);
    assert.equal(me.deckEntries.find((e) => e.cardId === 'm1')?.inscription, 'sharp');
    assert.equal(me.deckEntries.some((e) => e.cardId === 'c5'), false);
    assert.deepEqual(copiesOf(me, 'c5').map((c) => c.inscription ?? null), [null]);
    assert.equal(diag(late), 'combat-inscribe-no-copy');
});


test('刻印奖励（P5b）：开启刻印的卡组角色按种子出刻印槽并定下刻印与卡组副本，未开启、技能角色、无可刻副本时不出；翻牌入账经 loot 刻在那张副本上', async () => {
    const { assembleReward } = await import('../src/combat/generation-assembly.js');
    const { reportIdFor, attachLoot } = await import('../src/combat/report.js');
    const { inscribable } = await import('../src/combat/mechanics/inscription.js');
    const rid = reportIdFor('cb|ins');
    const lines = [ai('正文'), ai('续写')];
    const { ledger, ref } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], lines);
    const me = heroOf(await ledger.effectiveState());
    const deckCopy = new Set(me.deckEntries.map((e) => e.copyId));
    const all = (plan) => [...plan.slots, ...plan.reserve];
    let found = null;
    let seen = 0;
    for (let i = 0; i < 200; i += 1) {
        const plan = planRewardSlots({ combatId: `cb|${i}`, tier: 'boss', character: me, inscribe: true });
        for (const slot of all(plan).filter((s) => s.kind === 'inscribe')) {
            seen += 1;
            assert.ok(deckCopy.has(slot.copyId), slot.copyId);
            assert.equal(inscribable(me.catalog.get(slot.cardId), slot.inscription), true);
            if (!found && plan.slots.includes(slot)) found = { combatId: `cb|${i}`, slot };
        }
        assert.equal(all(planRewardSlots({ combatId: `cb|${i}`, tier: 'boss', character: me })).some((s) => s.kind === 'inscribe'), false);
        assert.equal(all(planRewardSlots({ combatId: `cb|${i}`, tier: 'boss', character: { kind: 'skill-character', id: 'sc' }, inscribe: true })).some((s) => s.kind === 'inscribe'), false);
        assert.equal(all(planRewardSlots({ combatId: `cb|${i}`, tier: 'boss', character: { ...me, deckEntries: [] }, inscribe: true })).some((s) => s.kind === 'inscribe'), false);
    }
    assert.ok(seen > 20 && found, `inscribe slots ${seen}`);
    assert.deepEqual(planRewardSlots({ combatId: found.combatId, tier: 'boss', character: me, inscribe: true }).slots[found.slot.index], found.slot);

    const assembled = assembleReward({ slots: [[null, null, '血战之后']] }, { key: 'k', input: { seed: 's', slots: [found.slot] } });
    assert.equal(assembled.errors, undefined, JSON.stringify(assembled.errors));
    const insSlot = assembled.value.slots[0];
    assert.deepEqual([insSlot.kind, insSlot.copyId, insSlot.inscription, insSlot.origin], ['inscribe', found.slot.copyId, found.slot.inscription, '血战之后']);

    const filler = (index) => ({ index, kind: 'keepsake', rarity: 'rare', name: `杂物${index}`, origin: '' });
    const slots = [0, 1, 2].map((index) => (index === found.slot.index ? { ...insSlot, index } : filler(index)));
    const offerAnchor = { messageId: 0, swipeId: 0, tagHash: 'offer', occurrence: 0 };
    const offer = { id: ledgerEntryId('offer', 'pc-hero', offerAnchor), type: 'offer', character: 'pc-hero', anchor: offerAnchor, payload: { combatId: 'cb|ins', tier: 'boss', exp: 10, reveal: 0, slots }, createdAt: 7 };
    assert.equal((await ledger.append([offer])).ok, true);
    const reportText = attachLoot(`<igs-combat-report result="win" id="${rid}">终局：我方获胜。</igs-combat-report>`, { character: '主角', reportId: rid, index: found.slot.index, set: 'main', slot: insSlot });
    assert.ok(reportText.includes(`在「${insSlot.cardName}」上刻下了`), reportText);
    ref.chat = [ai('正文'), user(reportText)];
    const scanned = await ledger.scan();
    const loot = scanned.entries.filter((e) => e.type === 'loot');
    assert.equal(loot.length, 1, JSON.stringify(scanned.diagnostics));
    assert.equal((await ledger.append(loot)).ok, true);
    const after = await ledger.effectiveState();
    assert.equal(after.diagnostics.some((d) => d.id === loot[0].id), false, JSON.stringify(after.diagnostics));
    const hero = heroOf(after);
    assert.equal(hero.deckEntries.find((e) => e.copyId === insSlot.copyId)?.inscription, insSlot.inscription);
    assert.equal(hero.deckEntries.filter((e) => e.inscription).length, 1);
});

test('刻印标签（P5b）：扫描正文 inscribe 标签按牌名取卡组里第一张可刻副本写明 copyId；同楼多个标签分到不同副本；刻印名未知、牌不在卡组、牌面不符记诊断；入账后再扫不重复', async () => {
    const lines = [
        '[igs-combat:inscribe|主角|斩c1|锋利|开悟]', '[igs-combat:inscribe|我|斩c1|灵动|误刻]', '[igs-combat:inscribe|主角|斩c9|锋利|无此牌]',
        '[igs-combat:inscribe|主角|斩c1|闪耀|无此印]', '[igs-combat:inscribe|主角|斩m3|锋利|不在卡组]',
        '剑意再起。\n[igs-combat:inscribe|主角|斩c1|锋利|再悟]\n[igs-combat:inscribe|主角|斩c1|墨染|三悟]',
    ];
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], lines.map(ai));
    const scanned = await ledger.scan();
    const entries = scanned.entries.filter((e) => e.type === 'inscribe');
    assert.deepEqual(entries.map((e) => [e.anchor.messageId, e.payload.cardId, e.payload.inscription]), [[0, 'c1', 'sharp'], [5, 'c1', 'sharp'], [5, 'c1', 'ink']]);
    assert.equal(new Set(entries.map((e) => e.payload.copyId)).size, 3);
    const diag = (messageId) => scanned.diagnostics.find((d) => d.messageId === messageId && String(d.code).startsWith('combat-inscribe'))?.code;
    assert.deepEqual([1, 2, 3, 4].map(diag), ['combat-inscribe-invalid', 'combat-inscribe-card-unknown', 'combat-inscribe-unknown', 'combat-inscribe-card-unknown']);
    assert.equal(scanned.diagnostics.some((d) => d.code === 'combat-tag-unknown'), false);
    assert.equal((await ledger.append(entries)).ok, true);
    const effective = await ledger.effectiveState();
    assert.equal(effective.diagnostics.some((d) => entries.some((e) => e.id === d.id)), false, JSON.stringify(effective.diagnostics));
    const me = heroOf(effective);
    assert.deepEqual(me.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.inscription ?? null), ['sharp', 'sharp', 'ink']);
    assert.equal((await ledger.scan()).entries.filter((e) => e.type === 'inscribe').length, 0);
});

test('宝物多槽（规则 v6）：最多 4 件，第 5 件顶替最早一件；面板按 slotIndex 换指定格、卸下一件不动其余；旧单值按一件读；联动聚合全部宝物', async () => {
    const names = ['玉佩', '铜镜', '香囊', '骨笛', '金铃'];
    const tags = names.map((name) => `[igs-fx:item|获得|${name}|传家之物|宝物]`);
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], tags.map(ai));
    const equip = (i) => {
        const [tag] = scanGainTags(tags[i]);
        const anchor = { messageId: i, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, createdAt: 1,
            payload: { gearId: gearIdFor(names[i]), name: names[i], slot: 'treasure', description: '传家之物', rarity: 'rare', bonus: { ability: 'wis', amount: 1 } } };
    };
    const worn = async () => {
        const me = heroOf(await ledger.effectiveState());
        return [me.gear.slots.treasure.map((g) => g.name), me.gear.bag.map((g) => g.name)];
    };
    const first = await ledger.append([0, 1, 2, 3].map(equip));
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.deepEqual(await worn(), [names.slice(0, 4), []]);
    assert.equal((await ledger.append([equip(4)])).ok, true);
    assert.deepEqual(await worn(), [['铜镜', '香囊', '骨笛', '金铃'], ['玉佩']]);
    const swapped = await ledger.setGear('pc-hero', gearIdFor('玉佩'), true, 1);
    assert.equal(swapped.ok, true, JSON.stringify(swapped));
    assert.deepEqual(await worn(), [['铜镜', '玉佩', '骨笛', '金铃'], ['香囊']]);
    assert.equal((await ledger.setGear('pc-hero', gearIdFor('骨笛'), false)).ok, true);
    assert.deepEqual(await worn(), [['铜镜', '玉佩', '金铃'], ['香囊', '骨笛']]);
    assert.equal((await ledger.setGear('pc-hero', gearIdFor('骨笛'), true)).ok, true);
    assert.deepEqual(await worn(), [['铜镜', '玉佩', '金铃', '骨笛'], ['香囊']]);

    const legacy = { treasure: 'a' };
    assert.deepEqual([slotGearList(legacy.treasure), equippedGear({ weapon: 'w', treasure: ['a', 'b'] })], [['a'], ['w', 'a', 'b']]);
    placeGear(legacy, 'treasure', 'b');
    assert.deepEqual(legacy.treasure, ['a', 'b']);
    removeGear(legacy, 'a');
    removeGear(legacy, 'b');
    assert.equal('treasure' in legacy, false);
    assert.deepEqual(traitLinks([], { treasure: [{ link: 'fortune' }, { link: 'reveal', rarity: 'mythic' }] }), { reveal: 2, reflip: false, fortune: true });
});

test('宝物重穿：只有稀有度、没有加成与被动的宝物卸下后可再装回，稀有度不丢', async () => {
    const name = '石印';
    const text = `[igs-fx:item|获得|${name}|旧物|宝物]`;
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai(text)]);
    const [tag] = scanGainTags(text);
    const anchor = { messageId: 0, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
    const first = await ledger.append([{ id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, createdAt: 1,
        payload: { gearId: gearIdFor(name), name, slot: 'treasure', description: '旧物', rarity: 'rare' } }]);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal((await ledger.setGear('pc-hero', gearIdFor(name), false)).ok, true);
    const again = await ledger.setGear('pc-hero', gearIdFor(name), true);
    assert.equal(again.ok, true, JSON.stringify(again));
    const me = heroOf(await ledger.effectiveState());
    assert.deepEqual(me.gear.slots.treasure.map((g) => [g.name, g.rarity]), [[name, 'rare']]);
});

test('规则 v6 卡牌三选一：本职业固定 2 + 随机 1 按种子定，按比例混入无色固定卡；旧调用形状不变；翻牌取候选 / 跳过，战报第 5 字段经账本兑现', async () => {
    const { assembleReward } = await import('../src/combat/generation-assembly.js');
    const { reportIdFor, attachLoot } = await import('../src/combat/report.js');
    const { CARD_TEMPLATES, templatesFor } = await import('../src/combat/card-templates.js');
    const { fixedCard, fixedCardGroup } = await import('../src/combat/fixed-cards/index.js');
    const { emptyPick, flipCard, flipView, lootOf, normalizePick, pickCardChoice } = await import('../src/combat/flip.js');
    const rank = (rarity) => ['common', 'uncommon', 'rare', 'epic', 'mythic'].indexOf(rarity);
    const strip = ({ fixedIds, randomAt, archetype, relic, ...rest }) => rest;
    const me = { kind: 'deck-character', id: 'pc-hero', classProfile: { archetype: 'warrior' }, owned: new Map() };
    let cards = 0;
    let general = 0;
    let found = null;
    for (let i = 0; i < 600; i += 1) {
        for (const tier of ['normal', 'elite', 'boss']) {
            const combatId = `cb|v6|${i}`;
            const plan = planRewardSlots({ combatId, tier, character: me, candidates: true });
            const old = planRewardSlots({ combatId, tier, character: me });
            assert.deepEqual([...plan.slots, ...plan.reserve].map(strip), [...old.slots, ...old.reserve]);
            assert.ok([...old.slots, ...old.reserve].every((slot) => slot.fixedIds === undefined));
            // 规则 v6 遗物宝物（G5f）：relic 只出现在宝物槽上，旧调用不带。
            assert.ok([...old.slots, ...old.reserve].every((slot) => slot.relic === undefined));
            for (const slot of [...plan.slots, ...plan.reserve].filter((s) => s.relic)) assert.equal(slot.gearSlot, 'treasure');
            for (const slot of [...plan.slots, ...plan.reserve].filter((s) => s.kind === 'card')) {
                cards += 1;
                assert.equal(slot.archetype, 'warrior');
                assert.equal(slot.fixedIds.length, 2);
                assert.equal(new Set(slot.fixedIds).size, 2);
                assert.ok([0, 1, 2].includes(slot.randomAt));
                assert.equal(fixedCardGroup(slot.fixedIds[0]), 'warrior');
                const last = fixedCardGroup(slot.fixedIds[1]);
                assert.ok(['warrior', 'general'].includes(last), last);
                if (last === 'general') general += 1;
                for (const id of slot.fixedIds) assert.ok(rank(fixedCard(id).rarity) <= Math.max(rank('uncommon'), Math.min(rank(slot.rarity), rank('rare'))), `${id} ${slot.rarity}`);
                if (!found && tier === 'boss' && plan.slots.includes(slot)) found = { combatId, slot, slots: plan.slots };
            }
        }
    }
    assert.ok(cards > 500 && found, `card slots ${cards}`);
    assert.ok(Math.abs(general / cards - 0.25) < 0.04, `general share ${general / cards}`);
    assert.ok([...planRewardSlots({ combatId: 'cb|v6|s', tier: 'boss', character: { kind: 'skill-character', id: 'sc' }, candidates: true }).slots].every((s) => s.kind !== 'card'));

    const table = templatesFor('warrior');
    let assembled = null;
    for (const key of Object.keys(table)) {
        const tried = assembleReward({ slots: [['裂空斩', key, '血战之后']] }, { key: 'k', input: { seed: 's', slots: [found.slot] } });
        if (!tried.errors) { assembled = tried; break; }
    }
    assert.ok(assembled, 'no warrior template solvable for the slot');
    const foreign = Object.keys(CARD_TEMPLATES).find((key) => !Object.hasOwn(table, key));
    if (foreign) assert.ok(assembleReward({ slots: [['裂空斩', foreign, '']] }, { key: 'k', input: { seed: 's', slots: [found.slot] } }).errors);
    const cardSlot = assembled.value.slots[0];
    assert.equal(cardSlot.choices.length, 3);
    assert.equal(cardSlot.card.archetype, 'warrior');
    assert.equal(cardSlot.choices[found.slot.randomAt].id, cardSlot.card.id);
    assert.deepEqual(cardSlot.choices.filter((_, i) => i !== found.slot.randomAt).map((c) => [c.id, c.model]), found.slot.fixedIds.map((id) => [id, 'fixed']));

    const filler = (index) => ({ index, kind: 'keepsake', rarity: 'rare', name: `杂物${index}`, origin: '' });
    const slots = found.slots.map((slot) => (slot.index === found.slot.index ? { ...cardSlot, index: slot.index } : filler(slot.index)));
    const reward = { combatId: found.combatId, slots };
    const order = flipOrder(reward, 'main');
    const at = order.indexOf(found.slot.index);
    const flipped = flipCard(reward, emptyPick(), at).pick;
    assert.equal(flipView(reward, flipped).needCard, true);
    assert.equal(lootOf(reward, flipped).pick, undefined);
    assert.equal(pickCardChoice(reward, flipped, 3).ok, false);
    assert.equal(pickCardChoice(reward, emptyPick(), 0).reason, 'combat-flip-not-ready');
    const other = flipCard(reward, emptyPick(), order.findIndex((index) => index !== found.slot.index)).pick;
    assert.equal(pickCardChoice(reward, other, 0).reason, 'combat-flip-card-unavailable');
    assert.equal(flipView(reward, other).needCard, undefined);
    const chosen = pickCardChoice(reward, flipped, 'skip').pick;
    assert.deepEqual([flipView(reward, chosen).needCard, flipView(reward, chosen).card, lootOf(reward, chosen).pick], [false, 'skip', 'skip']);
    assert.deepEqual(normalizePick(chosen, reward), chosen);
    assert.equal(normalizePick({ ...other, card: 0 }, reward), null);

    const rid = reportIdFor(found.combatId);
    const body = `<igs-combat-report result="win" id="${rid}">终局：我方获胜。</igs-combat-report>`;
    assert.equal(attachLoot(body, { character: '主角', reportId: rid, index: found.slot.index, set: 'main', slot: slots[found.slot.index] }), body);
    const fixedAt = [0, 1, 2].find((i) => i !== found.slot.randomAt);
    const settle = async (pick) => {
        const { ledger, ref } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文'), ai('续写')]);
        const before = heroOf(await ledger.effectiveState());
        const offerAnchor = { messageId: 0, swipeId: 0, tagHash: 'offer', occurrence: 0 };
        const offer = { id: ledgerEntryId('offer', 'pc-hero', offerAnchor), type: 'offer', character: 'pc-hero', anchor: offerAnchor, payload: { combatId: found.combatId, tier: 'boss', exp: 10, reveal: 0, slots }, createdAt: 7 };
        const appended = await ledger.append([offer]);
        assert.equal(appended.ok, true, JSON.stringify(appended));
        const text = attachLoot(body, { character: '主角', reportId: rid, index: found.slot.index, set: 'main', slot: slots[found.slot.index], pick });
        assert.ok(text.endsWith(`|${found.slot.index}|main|${pick}]`), text);
        ref.chat = [ai('正文'), user(text)];
        const scanned = await ledger.scan();
        const loot = scanned.entries.filter((e) => e.type === 'loot');
        assert.equal(loot.length, 1, JSON.stringify(scanned.diagnostics));
        assert.equal(loot[0].payload.pick, pick);
        assert.equal((await ledger.append(loot)).ok, true);
        const after = await ledger.effectiveState();
        assert.equal(after.diagnostics.some((d) => d.id === loot[0].id), false, JSON.stringify(after.diagnostics));
        return { text, before, hero: heroOf(after) };
    };
    const fixedId = cardSlot.choices[fixedAt].id;
    const tookFixed = await settle(fixedAt);
    assert.ok(tookFixed.text.includes(`领悟了「${cardSlot.choices[fixedAt].name}」`), tookFixed.text);
    assert.deepEqual([tookFixed.hero.owned.get(fixedId), tookFixed.hero.catalog.get(fixedId)?.model, tookFixed.hero.deckEntries.length], [1, 'fixed', tookFixed.before.deckEntries.length + 1]);
    const tookRandom = await settle(found.slot.randomAt);
    assert.equal(tookRandom.hero.deckEntries.length, tookRandom.before.deckEntries.length + 1);
    assert.equal(tookRandom.hero.owned.get(fixedId), undefined);
    const skipped = await settle('skip');
    assert.ok(skipped.text.includes('放下了这次领悟的机会'), skipped.text);
    assert.equal(skipped.hero.deckEntries.length, skipped.before.deckEntries.length);
});


test('规则 v6 取消自由组卡：卡组合规时 saveDeck 拒写 deck 记录，面板不出加入 / 移出 / 保存；已有 deck 记录照旧重放', async () => {
    const { deckDetailView } = await import('../src/visual/igs-ui/combat-deck-panel-model.js');
    const { ledger, tables } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文')]);
    const me = heroOf(await ledger.effectiveState());
    assert.equal(me.deckNeedsAdjust, false);
    const before = tables.ledger.length;
    const locked = await ledger.saveDeck('pc-hero', me.deck.slice(0, 18));
    assert.equal(locked.reason, 'combat-deck-locked');
    assert.equal(tables.ledger.length, before);
    assert.equal(deckDetailView(me, null).deckEditable, false);

    const anchor = { messageId: 0, swipeId: 0, tagHash: 'deck', occurrence: 0 };
    const trimmed = me.deck.slice(0, 18);
    const old = { id: ledgerEntryId('deck', 'pc-hero', anchor), type: 'deck', character: 'pc-hero', anchor, payload: { cards: trimmed, revision: 1 }, createdAt: 7 };
    assert.equal((await ledger.append([old])).ok, true);
    const replayed = heroOf(await ledger.effectiveState());
    assert.deepEqual(replayed.deck, trimmed);
    assert.equal(replayed.deckNeedsAdjust, false);
});
test('规则 v6 按场次删卡：第 5 场胜利战报里的删牌标签入账，跳过不写，过期与重复扫描不扣费，费用 75 + 50 × 已删次数，删后不少于 10 张', async () => {
    const { reportIdFor } = await import('../src/combat/report.js');
    const { purgeOpportunity, purgeChance } = await import('../src/combat/ledger.js');
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]);
    const ref = { chat: [ai('正文')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, wallet: () => 1000 });
    const ridOf = (i) => reportIdFor(`cb|purge|${i}`);
    const winFloor = (i, copyId = '') => {
        const rid = ridOf(i);
        return user(`<igs-combat-report id="${rid}" result="win">终局：我方获胜。</igs-combat-report>\n[igs-combat:exp|主角|5|战斗:${rid}]${copyId ? `\n[igs-combat:purge|主角|${rid}|${copyId}]` : ''}`);
    };
    const settle = async () => {
        const scanned = await ledger.scan();
        assert.equal((await ledger.append(scanned.entries)).ok, true);
        return { scanned, me: heroOf(await ledger.effectiveState()) };
    };
    const addWins = async (from, to, copyAt = {}) => {
        for (let i = from; i < to; i += 1) ref.chat.push(winFloor(i, copyAt[i]), ai(`第${i}场后[igs-combat:exp|主角|3|历练]`));
        return settle();
    };
    let { me } = await addWins(0, 4);
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.reason, me.purge.next], [4, false, 'combat-purge-not-due', 5]);
    // 结算页口径：第 5 场战报尚未发出时按下一场算，正好满 5 场可删；第 4 场已计入、不在档上。
    assert.deepEqual([purgeChance(me, ridOf(4)).battle, purgeChance(me, ridOf(4)).available, purgeChance(me, ridOf(4)).cost], [5, true, 75]);
    assert.equal(purgeChance(me, ridOf(3)).reason, 'combat-purge-not-due');
    const size = me.deck.length;
    const target = me.deckEntries.at(-1).copyId;
    let scanned;
    ({ me, scanned } = await addWins(4, 5, { 4: target }));
    assert.deepEqual(scanned.entries.filter((e) => e.type === 'purge').map((e) => [e.payload.copyId, e.payload.cost, e.payload.battle, e.payload.reportId]), [[target, 75, 5, ridOf(4)]]);
    assert.deepEqual([me.deck.length, me.deckEntries.some((e) => e.copyId === target), me.purge.reason, me.purge.cost], [size - 1, false, 'combat-purge-used', 125]);
    assert.equal(me.points, 1000 - 75);
    // 重复扫描同一楼不再写删牌记录，不重复扣费。
    ({ me, scanned } = await settle());
    assert.deepEqual([scanned.entries.filter((e) => e.type === 'purge').length, me.points, me.deck.length], [0, 1000 - 75, size - 1]);
    // 第 6 场战报里手写的删牌标签：不在档上，不入账。
    ({ me, scanned } = await addWins(5, 6, { 5: me.deckEntries[0].copyId }));
    assert.equal(scanned.entries.filter((e) => e.type === 'purge').length, 0);
    assert.ok(scanned.diagnostics.some((d) => d.code === 'combat-purge-not-due'), JSON.stringify(scanned.diagnostics));
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.next], [6, false, 10]);
    // 第 10 场跳过（战报不带删牌标签）：机会过期作废，费用不变。
    ({ me } = await addWins(6, 10));
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.cost], [10, true, 125]);
    ({ me } = await addWins(10, 11));
    assert.equal(me.purge.reason, 'combat-purge-not-due');
    assert.deepEqual([me.points, me.deck.length], [1000 - 75, size - 1]);
    // 过期后再补写第 10 场的删牌标签不入账。
    assert.equal(purgeChance(me, ridOf(9)).reason, 'combat-purge-expired');
    const small = { kind: 'deck-character', battleWins: new Set([1, 2, 3, 4, 5]), purges: 0, purgedAt: new Set(), deck: Array(10).fill('c1') };
    assert.equal(purgeOpportunity(small).reason, 'combat-purge-deck-min');
    assert.equal(purgeOpportunity({ ...small, deck: Array(11).fill('c1') }).available, true);
    const { purgeCost } = await import('../src/combat/points.js');
    for (const [used, cost] of [[0, 75], [8, 475], [9, 500], [10, 500], [100, 500]]) {
        assert.equal(purgeCost(used), cost);
        assert.equal(purgeOpportunity({ ...small, purges: used, deck: Array(11).fill('c1') }).cost, cost);
    }
    assert.equal(purgeCost(9, 0), 525, '历史记录仍按原费用策略重放');
    assert.equal(tables.ledger.find((e) => e.type === 'purge').payload.costVersion, 1);
});
test('删卡费用版本：新记录第十次封顶500，历史第十次525保持原值重放', async () => {
    const { reportIdFor } = await import('../src/combat/report.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]);
    const chat = [ai('启程')];
    const makeLedger = () => createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7, wallet: () => 10000 });
    const ledger = makeLedger();
    for (let n = 1; n <= 10; n += 1) {
        const target = heroOf(await ledger.effectiveState()).deckEntries.at(-1).copyId;
        for (let i = 1; i <= 5; i += 1) {
            const rid = reportIdFor(`cb|capped-purge|${n}|${i}`);
            chat.push(user(`<igs-combat-report id="${rid}" result="win">终局：我方获胜。</igs-combat-report>\n[igs-combat:exp|主角|5|战斗:${rid}]${i === 5 ? `\n[igs-combat:purge|主角|${rid}|${target}]` : ''}`), ai('继续前行'));
            const scan = await ledger.scan();
            assert.equal(scan.ok, true, JSON.stringify(scan));
            assert.equal(scan.entries.filter(e => e.type === 'purge').length, i === 5 ? 1 : 0, JSON.stringify({ n, i, diagnostics: scan.diagnostics }));
        }
    }
    const purges = tables.ledger.filter(e => e.type === 'purge');
    assert.deepEqual(purges.map(e => e.payload.cost), [75, 125, 175, 225, 275, 325, 375, 425, 475, 500]);
    const capped = heroOf(await makeLedger().effectiveState());
    assert.equal(capped.deck.length, 10);
    assert.equal(capped.points, 10000 - 2975);
    assert.equal(capped.purge.cost, 500);
    const last = purges.at(-1);
    assert.equal(normalizeLedgerEntry({ ...last, payload: { ...last.payload, costVersion: 2 } }).ok, false);
    for (const entry of purges) delete entry.payload.costVersion;
    last.payload.cost = 525;
    const legacy = heroOf(await makeLedger().effectiveState());
    assert.equal(legacy.deck.length, 10);
    assert.equal(legacy.points, 10000 - 3000);
    assert.equal(legacy.purge.cost, 500);
});

test('规则 v6 G3c 每 5 场免费升级：与删卡共用胜场、互不占用，跳过过期、弱敌不推进、同副本删升冲突拒收、重复扫描不重复、楼层回退撤销', async () => {
    const { reportIdFor, attachCardUpgrade } = await import('../src/combat/report.js');
    const { upgradeChance, upgradableCard } = await import('../src/combat/ledger.js');
    const { extractGrowthDirectives } = await import('../src/scene/combat-directives.js');
    const { COMBAT_REPORT_FIND } = await import('../src/host/combat-report-regex.js');
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]);
    const ref = { chat: [ai('正文')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, wallet: () => 1000 });
    const ridOf = (i) => reportIdFor(`cb|upgrade|${i}`);
    const winFloor = (i, tags = {}, weak = false) => {
        const rid = ridOf(i);
        const extra = [tags.purge ? `[igs-combat:purge|主角|${rid}|${tags.purge}]` : '', tags.upgrade ? `[igs-combat:card-upgrade|主角|${rid}|${tags.upgrade}]` : ''].filter(Boolean);
        return user(`<igs-combat-report id="${rid}" result="win"${weak ? ' weak="1"' : ''}>终局：我方获胜。</igs-combat-report>\n[igs-combat:exp|主角|5|战斗:${rid}]${extra.map((t) => `\n${t}`).join('')}`);
    };
    const settle = async () => {
        const scanned = await ledger.scan();
        assert.equal((await ledger.append(scanned.entries)).ok, true);
        return { scanned, me: heroOf(await ledger.effectiveState()) };
    };
    const addWins = async (from, to, tagsAt = {}) => {
        for (let i = from; i < to; i += 1) ref.chat.push(winFloor(i, tagsAt[i]), ai(`第${i}场后`));
        return settle();
    };
    const ups = (scanned) => scanned.entries.filter((e) => e.type === 'card-upgrade');
    const strikes = (me) => me.deckEntries.filter((e) => e.cardId === 'basic-strike');
    let { me } = await addWins(0, 4);
    assert.deepEqual([me.upgrade.battle, me.upgrade.available, me.upgrade.reason, me.upgrade.next], [4, false, 'combat-card-upgrade-not-due', 5]);
    assert.deepEqual([upgradeChance(me, ridOf(4)).battle, upgradeChance(me, ridOf(4)).available], [5, true]);
    // 专属卡与无升级版的牌不可选。
    assert.equal(upgradableCard({ rarity: 'signature', upgraded: { cost: 0 } }), false);
    assert.equal(upgradableCard({ rarity: 'common' }), false);
    const [s0, s1] = strikes(me).map((e) => e.copyId);
    const purgeTarget = me.deckEntries.find((e) => e.cardId === 'c1').copyId;
    // 无升级版的副本写进升级标签：拒收。
    const before = ref.chat.length;
    let scanned;
    // 第 5 场：同场删卡与升级各用各的机会；升级免费。
    ({ me, scanned } = await addWins(4, 5, { 4: { purge: purgeTarget, upgrade: s0 } }));
    assert.deepEqual(ups(scanned).map((e) => e.payload), [{ copyId: s0, cardId: 'basic-strike', battle: 5, reportId: ridOf(4) }]);
    assert.equal(scanned.entries.filter((e) => e.type === 'purge').length, 1);
    assert.deepEqual([strikes(me).find((e) => e.copyId === s0).upgraded, me.upgrade.reason, me.purge.reason, me.points], [true, 'combat-card-upgrade-used', 'combat-purge-used', 1000 - 75]);
    // 重复扫描不重复写入。
    ({ me, scanned } = await settle());
    assert.equal(ups(scanned).length, 0);
    // 第 6 场手写升级标签：不在档上。
    ({ me, scanned } = await addWins(5, 6, { 5: { upgrade: s1 } }));
    assert.equal(ups(scanned).length, 0);
    assert.ok(scanned.diagnostics.some((d) => d.code === 'combat-card-upgrade-not-due'), JSON.stringify(scanned.diagnostics));
    // 弱敌胜利不推进胜场，升级标签拒收，第 10 场机会照常。
    ref.chat.push(winFloor(90, { upgrade: s1 }, true), ai('弱敌后'));
    ({ me, scanned } = await settle());
    assert.equal(ups(scanned).length, 0);
    assert.equal(me.upgrade.battle, 6);
    ({ me } = await addWins(6, 10));
    assert.deepEqual([me.upgrade.battle, me.upgrade.available], [10, true]);
    // 第 10 场的机会跨过一场弱敌不过期（只看普通胜场）；再赢一场普通战斗即过期。
    ref.chat.push(winFloor(91, {}, true), ai('弱敌后'));
    ({ me } = await settle());
    assert.deepEqual([me.upgrade.battle, me.upgrade.available], [10, true]);
    ({ me } = await addWins(10, 11));
    assert.equal(me.upgrade.reason, 'combat-card-upgrade-not-due');
    assert.equal(upgradeChance(me, ridOf(9)).reason, 'combat-card-upgrade-expired');
    assert.equal(strikes(me).find((e) => e.copyId === s1).upgraded, false);
    // 第 15 场同一张副本既删又升：升级拒收，删卡照常。
    await addWins(11, 14);
    ({ me, scanned } = await addWins(14, 15, { 14: { purge: s1, upgrade: s1 } }));
    assert.equal(ups(scanned).length, 0);
    assert.ok(scanned.diagnostics.some((d) => d.code === 'combat-card-upgrade-purge-conflict'), JSON.stringify(scanned.diagnostics));
    assert.equal(me.deckEntries.some((e) => e.copyId === s1), false);
    assert.equal(me.upgrade.available, true);
    // 楼层回退到第 5 场之前：升级撤销，场次回到 4。
    ref.chat.length = before;
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.upgrade.battle, strikes(me).find((e) => e.copyId === s0).upgraded], [4, false]);
    // 战报标记、解析与折叠正则。
    const text = attachCardUpgrade('<igs-combat-report id="rab" result="win">终局</igs-combat-report>', { character: '主角', reportId: 'rab', copyId: s0, name: '攻击' });
    assert.match(text, /升级：主角把卡组里的「攻击」升级了。\n<\/igs-combat-report>\n\[igs-combat:card-upgrade\|主角\|rab\|/);
    assert.equal(attachCardUpgrade(text, { character: '主角', reportId: 'rab', copyId: s1, name: '攻击' }), text);
    assert.deepEqual(extractGrowthDirectives(text, { raw: true }).directives.filter((d) => d.kind === 'card-upgrade').map((d) => [d.reportId, d.copyId]), [['rab', s0]]);
    const find = new RegExp(COMBAT_REPORT_FIND.slice(1, COMBAT_REPORT_FIND.lastIndexOf('/')), 'gi');
    assert.equal(text.match(find)?.[0], text);
});
test('规则 v6 G3c 翻牌选择：升级选择持久化、旧进度兼容、删升不能同副本、重抽保留、视图 needUpgrade', async () => {
    const { emptyPick, flipView, laterPick, normalizePick, pickPurgeChoice, pickUpgradeChoice, rerollPick } = await import('../src/combat/flip.js');
    const offer = { combatId: 'g3c', reveal: 0, slots: [{ index: 0, kind: 'keepsake', rarity: 'common', name: '甲' }, { index: 1, kind: 'keepsake', rarity: 'common', name: '乙' }, { index: 2, kind: 'keepsake', rarity: 'common', name: '丙' }],
        reserve: [{ index: 0, kind: 'keepsake', rarity: 'common', name: '丁' }, { index: 1, kind: 'keepsake', rarity: 'common', name: '戊' }, { index: 2, kind: 'keepsake', rarity: 'common', name: '己' }] };
    const cards = [{ copyId: 'a:0' }, { copyId: 'b:0' }];
    const upgrade = { battle: 5, available: true, cards };
    const purge = { battle: 5, cost: 75, available: true, cards };
    const old = { set: 'main', flipped: [0], choice: 0 };
    assert.deepEqual(normalizePick(old, offer), old);
    assert.equal(flipView(offer, old, {}, null, upgrade).needUpgrade, true);
    assert.equal(flipView(offer, old).needUpgrade, undefined);
    const up = pickUpgradeChoice(upgrade, old, 'a:0');
    assert.deepEqual(up.pick, { ...old, upgrade: 'a:0' });
    assert.equal(pickUpgradeChoice(upgrade, old, 'x:9').reason, 'combat-card-upgrade-copy-missing');
    assert.equal(pickUpgradeChoice({ available: false, reason: 'combat-card-upgrade-none' }, old, 'a:0').reason, 'combat-card-upgrade-none');
    assert.equal(pickPurgeChoice(purge, up.pick, 'a:0').reason, 'combat-purge-upgrade-conflict');
    const both = pickPurgeChoice(purge, up.pick, 'b:0').pick;
    assert.equal(pickUpgradeChoice(upgrade, both, 'b:0').reason, 'combat-card-upgrade-purge-conflict');
    assert.equal(pickUpgradeChoice(upgrade, { ...old, purge: 'skip' }, 'skip').ok, true);
    assert.equal(normalizePick({ ...old, purge: 'a:0', upgrade: 'a:0' }, offer), null);
    assert.equal(normalizePick({ ...old, upgrade: 7 }, offer), null);
    assert.deepEqual(normalizePick(both, offer), both);
    assert.equal(laterPick(old, up.pick), up.pick);
    const view = flipView(offer, both, {}, purge, upgrade);
    assert.deepEqual([view.needUpgrade, view.upgrade.pick, view.needPurge, view.purge.pick], [false, 'a:0', false, 'b:0']);
    const rerolled = rerollPick(offer, { ...emptyPick(), upgrade: 'a:0' }, { points: 999, payer: true });
    assert.deepEqual(rerolled.pick, { set: 'reserve', flipped: [], choice: null, upgrade: 'a:0' });
});

test('规则 v6 积分抽卡：150 抽 3 张本职业候选（固定 2 + 随机 1，种子定、不含无色），翻开一张后加入卡组或放弃，每抽只翻一次，放弃不退款，候选不合规或金钱不足拒写', async () => {
    const { planCardDraw } = await import('../src/combat/rewards.js');
    const { FIXED_GENERAL_CARDS, fixedCard, fixedClassPool, isFixedCardId } = await import('../src/combat/fixed-cards/index.js');
    const { drawCardEntity } = await import('../src/combat/generation.js');
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]);
    const ref = { chat: [ai('正文')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, wallet: () => 1000 });
    let me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.cardDraws, me.pendingDraw], [0, null]);
    const own = new Set(fixedClassPool('warrior').map((card) => card.id));
    const plan = planCardDraw(me);
    assert.deepEqual(planCardDraw(me), plan);
    assert.equal(plan.fixedIds.length, 2);
    assert.ok(plan.fixedIds.every((id) => own.has(id)), JSON.stringify(plan.fixedIds));
    const randomCard = (id) => ({ id, name: '裂岩斩', type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 3 }, { op: 'block', amount: 3 }] });
    const choicesOf = (p, card) => { const list = p.fixedIds.map((id) => clone(fixedCard(id))); list.splice(p.randomAt, 0, card); return list; };
    // 候选不合规：混入无色固定卡或别的职业的固定卡都拒写，不扣钱。
    const general = choicesOf(plan, randomCard(plan.cardId));
    general[general.findIndex((c) => isFixedCardId(c.id))] = clone(FIXED_GENERAL_CARDS[0]);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: plan.drawId, choices: general })).reason, 'combat-card-draw-choices-invalid');
    const foreign = choicesOf(plan, randomCard(plan.cardId));
    foreign[foreign.findIndex((c) => isFixedCardId(c.id))] = clone(fixedClassPool('mage')[0]);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: plan.drawId, choices: foreign })).reason, 'combat-card-draw-choices-invalid');
    assert.equal(heroOf(await ledger.effectiveState()).points, 1000);
    // 抽：扣 150，成为待选；有待选时不能再抽。
    assert.equal((await ledger.drawCard('pc-hero', { drawId: plan.drawId, choices: choicesOf(plan, randomCard(plan.cardId)) })).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.cardDraws, me.pendingDraw.drawId, me.pendingDraw.choices.length, me.pendingDraw.choices[plan.randomAt].id], [850, 1, plan.drawId, 3, plan.cardId]);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: 'cd-other', choices: choicesOf(plan, randomCard('dc-other')) })).reason, 'combat-card-draw-pending');
    // 翻前放弃：不退款，卡组不变。
    const size = me.deck.length;
    assert.equal((await ledger.pickCard('pc-hero', 'cd-wrong', 'skip')).reason, 'combat-card-pick-invalid');
    assert.equal((await ledger.pickCard('pc-hero', plan.drawId, 'skip')).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.pendingDraw, me.deck.length], [850, null, size]);
    // 第二抽种子随已抽次数变化；未翻不能加入，翻开随机卡后只能收下翻开的那张，且不能再翻。
    const second = planCardDraw(me);
    assert.notEqual(second.drawId, plan.drawId);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: second.drawId, choices: choicesOf(second, randomCard(second.cardId)) })).ok, true);
    assert.equal((await ledger.pickCard('pc-hero', second.drawId, second.randomAt)).reason, 'combat-card-pick-unflipped');
    assert.equal((await ledger.flipCard('pc-hero', 'cd-wrong', second.randomAt)).reason, 'combat-card-flip-invalid');
    assert.equal((await ledger.flipCard('pc-hero', second.drawId, second.randomAt)).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.pendingDraw.drawId, me.pendingDraw.flipped, me.deck.length], [second.drawId, second.randomAt, size]);
    const otherAt = second.randomAt === 0 ? 1 : 0;
    assert.equal((await ledger.flipCard('pc-hero', second.drawId, otherAt)).reason, 'combat-card-flip-done');
    assert.equal((await ledger.pickCard('pc-hero', second.drawId, otherAt)).reason, 'combat-card-pick-unflipped');
    assert.equal((await ledger.pickCard('pc-hero', second.drawId, second.randomAt)).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.pendingDraw, me.deck.length, me.owned.get(second.cardId), me.catalog.get(second.cardId)?.name], [700, null, size + 1, 1, '裂岩斩']);
    // 第三抽翻开固定卡后放弃：不退款，卡组不变。
    const third = planCardDraw(me);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: third.drawId, choices: choicesOf(third, randomCard(third.cardId)) })).ok, true);
    const thirdAt = third.randomAt === 0 ? 1 : 0;
    assert.equal((await ledger.flipCard('pc-hero', third.drawId, thirdAt)).ok, true);
    assert.equal((await ledger.pickCard('pc-hero', third.drawId, 'skip')).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.pendingDraw, me.deck.length], [550, null, size + 1]);
    // 第四抽翻开固定卡并加入：按 ID 进目录加一张副本。
    const fourth = planCardDraw(me);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: fourth.drawId, choices: choicesOf(fourth, randomCard(fourth.cardId)) })).ok, true);
    const fixedAt = fourth.randomAt === 0 ? 1 : 0;
    const fixedId = fourth.fixedIds[0];
    const before = me.owned.get(fixedId) || 0;
    assert.equal((await ledger.flipCard('pc-hero', fourth.drawId, fixedAt)).ok, true);
    assert.equal((await ledger.pickCard('pc-hero', fourth.drawId, fixedAt)).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.deck.length, me.owned.get(fixedId), me.catalog.get(fixedId)?.id, me.cardDraws], [400, size + 2, before + 1, fixedId, 4]);
    // 随机候选请求只给本职业模板，稀有度、费用与 ID 由程序定。
    const entity = drawCardEntity({ character: me, plan: planCardDraw(me) });
    assert.deepEqual([entity.kind, entity.fixed.archetype, entity.input.allowedTemplates.includes('strike')], ['draw-card', 'warrior', true]);
    const { assembleDrawCard } = await import('../src/combat/generation-assembly.js');
    const drawn = assembleDrawCard({ card: ['裂岩斩', 'strike'] }, { key: entity.key, fixed: { ...entity.fixed, cost: 1, rarity: 'common' } });
    assert.equal(drawn.value?.archetype, 'warrior', JSON.stringify(drawn));
    // 金钱不足拒写。
    const poor = createCombatLedger({ tables: memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]), chat: () => [ai('正文')], userName: '主角', now: () => 7, wallet: () => 100 });
    const p0 = planCardDraw(heroOf(await poor.effectiveState()));
    assert.equal((await poor.drawCard('pc-hero', { drawId: p0.drawId, choices: choicesOf(p0, randomCard(p0.cardId)) })).reason, 'combat-points-insufficient');
});

test('等级免费额度：抽卡与升级独立、零扣费、非法或重复拒收、胜场机会保留、回退恢复', async () => {
    const { planCardDraw } = await import('../src/combat/rewards.js');
    const { fixedCard } = await import('../src/combat/fixed-cards/index.js');
    const { upgradableRows } = await import('../src/combat/ledger.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const env = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [
        ai(`[igs-combat:exp|主角|${expFor(2)}|历练]`), ai('使用额度'),
    ]);
    let gates = 0;
    const ledger = createCombatLedger({ tables: env.tables, chat: () => env.ref.chat, userName: '主角', now: () => 7,
        spendingGate: async () => { gates += 1; return { ok: false, reason: 'points-settlement-pending' }; } });
    const scanned = await ledger.scan();
    assert.equal((await ledger.append(scanned.entries)).ok, true);
    const before = heroOf(await ledger.effectiveState());
    assert.deepEqual([before.freeDraws, before.freeUpgrades, before.points], [[2], [2], 0]);
    const plan = planCardDraw(before);
    const choices = plan.fixedIds.map(id => clone(fixedCard(id)));
    choices.splice(plan.randomAt, 0, { id: plan.cardId, name: '免费斩', type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] });
    const draw = level => ledger.drawCard(before.id, { drawId: plan.drawId, choices, free: { level } });
    assert.equal((await draw(3)).reason, 'combat-card-draw-free-level-unreached');
    assert.equal((await draw(4)).reason, 'combat-card-draw-free-level-invalid');
    assert.equal((await draw(2)).ok, true);
    let me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.cardDraws, me.freeDraws, me.freeUpgrades], [0, 1, [], [2]]);
    assert.notEqual(planCardDraw(me).drawId, plan.drawId, '免费与付费共用抽卡种子序列');
    assert.equal((await draw(2)).reason, 'combat-card-draw-free-used');
    assert.equal((await ledger.pickCard(me.id, plan.drawId, 'skip')).ok, true);
    const target = upgradableRows(me)[0];
    assert.ok(target);
    const upgrade = (level, copyId = target.copyId) => ledger.upgradeCard(me.id, { level, copyId, cardId: target.cardId });
    assert.equal((await upgrade(3)).reason, 'combat-card-upgrade-free-level-unreached');
    assert.equal((await upgrade(4)).reason, 'combat-card-upgrade-free-level-invalid');
    assert.equal((await upgrade(2, 'missing:0')).reason, 'combat-card-upgrade-copy-missing');
    assert.deepEqual(heroOf(await ledger.effectiveState()).freeUpgrades, [2]);
    assert.equal((await upgrade(2)).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.freeDraws, me.freeUpgrades, me.points, me.upgrade], [[], [], 0, before.upgrade]);
    assert.equal(me.deckEntries.find(item => item.copyId === target.copyId).upgraded, true);
    assert.equal((await upgrade(2)).reason, 'combat-card-upgrade-free-used');
    assert.equal(gates, 0, '零扣费不经过积分支出门禁');
    const drawEntry = env.tables.ledger.find(entry => entry.type === 'card-draw');
    const upgradeEntry = env.tables.ledger.find(entry => entry.type === 'card-upgrade');
    assert.equal(normalizeLedgerEntry({ ...drawEntry, payload: { ...drawEntry.payload, cost: 150 } }).ok, false);
    assert.equal(normalizeLedgerEntry({ ...upgradeEntry, payload: { ...upgradeEntry.payload, battle: 5, reportId: 'r5' } }).ok, false);
    assert.deepEqual((await ledger.effectiveState()).diagnostics, []);
    env.ref.chat.pop();
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.freeDraws, me.freeUpgrades, me.cardDraws, me.pendingDraw], [[2], [2], 0, null]);
    assert.equal(me.deckEntries.find(item => item.copyId === target.copyId).upgraded, false);
});

test('旧 reward 只允许历史重放，已领等级不再发免费额度，新写入拒绝', async () => {
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const env = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai(`[igs-combat:exp|主角|${expFor(2)}|历练]`), ai('旧领奖')]);
    assert.equal((await env.ledger.append((await env.ledger.scan()).entries)).ok, true);
    const before = heroOf(await env.ledger.effectiveState());
    const anchor = { messageId: 1, swipeId: 0, tagHash: 'reward', occurrence: 0 };
    const entry = { id: ledgerEntryId('reward', before.id, anchor), type: 'reward', character: before.id, anchor,
        payload: { level: 2, choice: { kind: 'card', cardId: 'c1' } }, createdAt: 7 };
    assert.equal(normalizeLedgerEntry(entry).ok, true);
    const rejected = await env.ledger.append(entry);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.rejected[0].reason, 'combat-reward-retired');
    assert.equal(env.tables.ledger.some(item => item.type === 'reward'), false);
    await env.tables.append('ledger', [entry]);
    const after = heroOf(await env.ledger.effectiveState());
    assert.deepEqual([after.claimedLevels, after.freeDraws, after.freeUpgrades], [[2], [], []]);
    assert.equal(after.deck.length, before.deck.length + 1);
    assert.equal(after.owned.get('c1'), (before.owned.get('c1') || 0) + 1);
    assert.deepEqual((await env.ledger.effectiveState()).diagnostics, []);
});


test('战斗胜利积分（v6 G5g）：按档位与战斗 ID 定额；锚定胜利战报楼写进主角积分，战报换楼或败北失效；金额越界拒收', async () => {
    const { BATTLE_POINTS_TAG_HASH } = await import('../src/combat/ledger.js');
    const { BATTLE_POINTS_RANGE, battlePoints, battleTierOf } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    assert.deepEqual([battleTierOf(['normal', 'elite']), battleTierOf(['elite', 'boss']), battleTierOf([]), battleTierOf(undefined)], ['elite', 'boss', 'normal', 'normal']);
    for (const tier of ['normal', 'elite', 'boss']) {
        const [min, max] = BATTLE_POINTS_RANGE[tier];
        const seen = new Set();
        for (let n = 0; n < 60; n += 1) {
            const amount = battlePoints(tier, `cb-${n}`);
            assert.ok(amount >= min && amount <= max, `${tier} ${amount}`);
            seen.add(amount);
        }
        assert.ok(seen.size > 1, tier);
        assert.equal(battlePoints(tier, 'cb-x'), battlePoints(tier, 'cb-x'));
    }

    const floor = (id, result = 'win') => user(`<igs-combat-report id="${id}" result="${result}">战报</igs-combat-report>`);
    const { ledger, ref, tables } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [floor('r1')]);
    const hero = 'pc-hero';
    const entryAt = (messageId, payload, character = hero) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_POINTS_TAG_HASH, occurrence: 0 };
        return { id: ledgerEntryId('battle-points', character, anchor), type: 'battle-points', character, anchor, payload, createdAt: 7 };
    };
    const before = heroOf(await ledger.effectiveState()).points;
    const amount = battlePoints('elite', 'cb-1');
    const paid = { amount, tier: 'elite', combatId: 'cb-1', reportId: 'r1' };
    assert.equal((await ledger.append([entryAt(0, paid)])).ok, true);
    assert.equal((await ledger.append([entryAt(0, paid)])).ok, true);
    assert.equal(tables.ledger.filter((e) => e.type === 'battle-points').length, 1);
    assert.equal(heroOf(await ledger.effectiveState()).points - before, amount);

    ref.chat = [floor('r9')];
    const moved = await ledger.effectiveState();
    assert.ok(moved.inactive.some((item) => item.reason === 'battle-points-report-invalid'));
    assert.equal(heroOf(moved).points, before);
    ref.chat = [floor('r1', 'lose')];
    assert.equal(heroOf(await ledger.effectiveState()).points, before);

    assert.equal(normalizeLedgerEntry(entryAt(0, { amount: 16, tier: 'normal', combatId: 'cb-1', reportId: 'r1' })).ok, false);
    assert.equal(normalizeLedgerEntry(entryAt(0, { amount: 31, tier: 'boss', combatId: 'cb-1', reportId: 'r1' })).ok, false);
    const forged = amount === 16 ? 17 : 16;
    assert.equal(normalizeLedgerEntry(entryAt(0, { ...paid, amount: forged })).ok, false);
    assert.equal(normalizeLedgerEntry(entryAt(0, { amount, tier: 'elite', reportId: 'r1' })).ok, false);
});

test('胜利积分加成（v6 G5f-4c）：按持有的加金币遗物特性快照加成，可复核；赤鳞果另记遗物生命上限；快照遗物当时未持有或数值伪造即拒收', async () => {
    const { BATTLE_POINTS_TAG_HASH } = await import('../src/combat/ledger.js');
    const { battlePoints } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const { heldOffCombat, winPointsBonus } = await import('../src/combat/relics/off-combat.js');
    const coin = { relicId: 'rl-r-18', model: 'original' };
    const hat = { relicId: 'rl-u-02', model: 'original' };
    const scale = { relicId: 'rl-s-08', model: 'original' };
    assert.equal(winPointsBonus([], 13), null);
    assert.equal(winPointsBonus([{ relicId: 'rl-r-18', model: 'split' }], 13), null, '拆解模型是战斗内被动，不加成');
    assert.deepEqual(winPointsBonus([coin, hat], 13), { points: 8 + 3, hpMax: 0, relics: [coin, hat] });
    assert.deepEqual(winPointsBonus([scale], 13), { points: 0, hpMax: 1, relics: [scale] });
    assert.deepEqual(heldOffCombat([{ relic: coin }, { relic: coin }, { relic: { relicId: 'rl-c-02', model: 'original' } }, {}], 'win-points'), [coin]);

    const floor = (id) => user(`<igs-combat-report id="${id}" result="win">战报</igs-combat-report>`);
    const traitAt = (messageId, relic) => {
        const anchor = { messageId, swipeId: 0, tagHash: 'trait', occurrence: 0 };
        return { id: ledgerEntryId('trait', 'pc-hero', anchor), type: 'trait', character: 'pc-hero', anchor, createdAt: 7, payload: { traitId: `tr-${messageId}`, name: '遗物特性', rarity: 'rare', kind: 'passive', relic, cost: 100 } };
    };
    // 基础 2 槽已被天生特性占满，新特性先进待选；换掉天生被动后才算持有（D-19：待选中的特性不生效）。
    const pickAt = (messageId) => {
        const anchor = { messageId, swipeId: 0, tagHash: 'trait', occurrence: 1 };
        return { id: ledgerEntryId('trait-pick', 'pc-hero', anchor), type: 'trait-pick', character: 'pc-hero', anchor, createdAt: 7, payload: { traitId: `tr-${messageId}`, drop: 'pp-pc-hero' } };
    };
    const gain = (messageId, relic) => [traitAt(messageId, relic), pickAt(messageId)];
    const pointsAt = (messageId, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_POINTS_TAG_HASH, occurrence: 0 };
        return { id: ledgerEntryId('battle-points', 'pc-hero', anchor), type: 'battle-points', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const amount = battlePoints('normal', 'cb-1');
    const base = { amount, tier: 'normal', combatId: 'cb-1', reportId: 'r1' };
    const withBonus = (relics) => ({ ...base, bonus: winPointsBonus(relics, amount) });

    assert.equal(normalizeLedgerEntry(pointsAt(1, withBonus([coin, hat]))).ok, true);
    assert.equal(normalizeLedgerEntry(pointsAt(1, { ...base, bonus: { ...winPointsBonus([coin], amount), points: 9 } })).ok, false, '加成数值伪造');
    assert.equal(normalizeLedgerEntry(pointsAt(1, { ...base, bonus: { points: 8, hpMax: 0, relics: [coin, coin] } })).ok, false, '同一件不能重复计');
    assert.equal(normalizeLedgerEntry(pointsAt(1, { ...base, bonus: { points: 0, hpMax: 0, relics: [{ relicId: 'rl-c-02', model: 'original' }] } })).ok, false, '非加金币遗物');

    // 特性在胜利战报之前已持有：定额 + 加成写进积分。
    const held = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文'), floor('r1')]);
    const before = heroOf(await held.ledger.effectiveState()).points;
    await held.tables.append('ledger', [traitAt(0, coin), pointsAt(1, withBonus([coin]))]);
    const pendingState = await held.ledger.effectiveState();
    assert.ok(pendingState.diagnostics.some((item) => item.code === 'combat-points-bonus-not-held'), '待选中的特性不算持有');
    assert.equal(heroOf(pendingState).points - before, -100);
    await held.tables.append('ledger', [pickAt(0)]);
    const heldState = await held.ledger.effectiveState();
    assert.equal(heldState.diagnostics.some((item) => item.code === 'combat-points-bonus-not-held'), false);
    assert.equal(heroOf(heldState).points - before, amount + 8 - 100);

    // 特性在胜利之后才拿到：重放时快照遗物不在持有里，整条拒收。
    const late = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文'), floor('r1'), ai('之后')]);
    const lateBefore = heroOf(await late.ledger.effectiveState()).points;
    await late.tables.append('ledger', [...gain(2, coin), pointsAt(1, withBonus([coin]))]);
    const lateState = await late.ledger.effectiveState();
    assert.ok(lateState.diagnostics.some((item) => item.code === 'combat-points-bonus-not-held'));
    assert.equal(heroOf(lateState).points - lateBefore, -100);

    // 赤鳞果：每胜最大生命 +1 记在遗物来源，不进战斗成长。
    const hp = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文'), floor('r1')]);
    const hpBefore = heroOf(await hp.ledger.effectiveState()).hpMax;
    await hp.tables.append('ledger', [...gain(0, scale), pointsAt(1, withBonus([scale]))]);
    const hpHero = heroOf(await hp.ledger.effectiveState());
    assert.equal(hpHero.hpMax - hpBefore, 1);
    assert.equal(hpHero.relicHpMax, 1);
    assert.equal(hpHero.battleGrowth, undefined);
});

test('获得时遗物（v6 G5f-4d）：特性真正装上才结算，按装上记录 ID 定随机升级 / 刻印 / 复制，最大生命记遗物来源、回满清伤势，同件只结算一次，御印挂起后选定，楼层回退撤销', async () => {
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const { vitalsOf } = await import('../src/combat/vitals.js');
    const at = (type, messageId, occurrence, payload, tagHash = 'trait') => {
        const anchor = { messageId, swipeId: 0, tagHash, occurrence };
        return { id: ledgerEntryId(type, 'pc-hero', anchor), type, character: 'pc-hero', anchor, createdAt: 7, payload };
    };
    const traitAt = (messageId, relicId, occurrence = 0) => at('trait', messageId, occurrence, { traitId: `tr-${messageId}-${occurrence}`, name: '遗物特性', rarity: 'rare', kind: 'passive', relic: { relicId, model: 'original' }, pickup: true, cost: 100 });
    const pickAt = (messageId, traitId, drop = 'pp-pc-hero', occurrence = 1) => at('trait-pick', messageId, occurrence, { traitId, drop });
    // 基础 2 槽被天生特性占满：新特性先进待选，换掉天生被动后才算装上。
    const gain = (messageId, relicId) => [traitAt(messageId, relicId), pickAt(messageId, `tr-${messageId}-0`)];
    const setup = (chat, profiles = [row(classDef('cls-blade'), 1), row(heroDef(), 2)]) => {
        const tables = memoryTables(profiles);
        const ref = { chat };
        const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, wallet: () => 1000 });
        return { tables, ref, ledger, hero: async () => heroOf(await ledger.effectiveState()) };
    };
    const plain = () => setup([ai('正文'), ai('得到遗物'), ai('之后')]);

    // 历史记录没有显式标记时不追溯触发；新的公开写口保存引用与标记。
    const legacy = plain();
    const oldTrait = traitAt(1, 'rl-r-14');
    delete oldTrait.payload.pickup;
    await legacy.tables.append('ledger', [oldTrait, pickAt(1, 'tr-1-0')]);
    const oldHero = await legacy.hero();
    assert.equal(oldHero.relicHpMax, undefined);
    assert.equal(oldHero.traits[0].pickup, undefined);
    const direct = plain();
    assert.equal((await direct.ledger.unlockTraitSlot('pc-hero', 3)).ok, true);
    const incoming = { traitId: 'tr-direct', name: '山莓', rarity: 'common', kind: 'passive', relic: { relicId: 'rl-c-17', model: 'original' } };
    assert.equal((await direct.ledger.drawTrait('pc-hero', incoming)).ok, true);
    const recorded = direct.tables.ledger.find((entry) => entry.type === 'trait');
    assert.deepEqual(recorded.payload.relic, incoming.relic);
    assert.equal(recorded.payload.pickup, true);
    assert.deepEqual([(await direct.hero()).relicHpMax, (await direct.hero()).pendingTrait], [7, null]);
    assert.equal(normalizeLedgerEntry({ ...recorded, payload: { ...recorded.payload, pickup: false } }).ok, false);
    assert.equal(normalizeLedgerEntry({ ...recorded, payload: { ...recorded.payload, relic: { relicId: 'rl-c-17', model: 'split' } } }).ok, false);


    // 最大生命：待选中不结算；换入后记遗物来源；同一件换下再装上不重复；楼层回退撤销。
    const hp = plain();
    const base = await hp.hero();
    await hp.tables.append('ledger', [traitAt(1, 'rl-r-14')]);
    let me = await hp.hero();
    assert.ok(me.pendingTrait);
    assert.deepEqual([me.hpMax, me.relicHpMax], [base.hpMax, undefined], '待选中的特性不结算（D-19）');
    await hp.tables.append('ledger', [pickAt(1, 'tr-1-0')]);
    me = await hp.hero();
    assert.deepEqual([me.hpMax - base.hpMax, me.relicHpMax, me.battleGrowth], [14, 14, undefined]);
    await hp.tables.append('ledger', [traitAt(1, 'rl-r-14', 2), pickAt(1, 'tr-1-2', 'tr-1-0', 3)]);
    me = await hp.hero();
    assert.deepEqual([me.traits.map((t) => t.traitId), me.relicHpMax], [['tr-1-2'], 14], '同一件只结算一次');
    hp.ref.chat = [ai('正文')];
    me = await hp.hero();
    assert.deepEqual([me.hpMax, me.relicHpMax, me.traits.length], [base.hpMax, undefined, 0], '装上记录随楼层回退作废');

    // 解锁槽位放出待选也算装上。
    const slot = plain();
    await slot.tables.append('ledger', [traitAt(1, 'rl-c-17'), at('trait-slot', 1, 1, { slot: 3, cost: 500 })]);
    me = await slot.hero();
    assert.deepEqual([me.pendingTrait, me.relicHpMax], [null, 7]);

    // 伤势按掉血量结转（上限提高时当前生命同步提高）；蜜格饼回满。
    const hurt = setup([ai('正文'), user('<igs-combat-report id="r1" result="win">战报</igs-combat-report>'), ai('得到'), ai('再得到')]);
    const full = (await hurt.hero()).hpMax;
    await hurt.tables.append('ledger', [at('wound', 1, 0, { hp: full - 30, maxHp: full, down: false, reportId: 'r1' }, 'wound'), ...gain(2, 'rl-c-17')]);
    me = await hurt.hero();
    assert.deepEqual([me.hpMax, vitalsOf(me.hpMax, me.wound).hp], [full + 7, full + 7 - 30]);
    await hurt.tables.append('ledger', [traitAt(3, 'rl-s-13'), pickAt(3, 'tr-3-0', 'tr-2-0')]);
    me = await hurt.hero();
    assert.deepEqual([me.hpMax, me.wound], [full + 14, null]);

    // 随机升级：只升牌型相符、有升级版的副本，按装上记录 ID 定，重放恒定。
    const upgradedOf = (hero) => hero.deckEntries.filter((e) => e.upgraded);
    const whet = plain();
    const before = await whet.hero();
    assert.equal(upgradedOf(before).length, 0);
    await whet.tables.append('ledger', gain(1, 'rl-c-21'));
    me = await whet.hero();
    const lifted = upgradedOf(me);
    assert.equal(lifted.length, 2);
    assert.ok(lifted.every((e) => me.catalog.get(e.cardId).type === 'attack' && me.catalog.get(e.cardId).upgraded));
    const again = plain();
    await again.tables.append('ledger', gain(1, 'rl-c-21'));
    assert.deepEqual(upgradedOf(await again.hero()).map((e) => e.copyId), lifted.map((e) => e.copyId), '同一记录 ID 结果恒定');
    const paint = plain();
    await paint.tables.append('ledger', gain(1, 'rl-c-20'));
    me = await paint.hero();
    assert.deepEqual(upgradedOf(me).map((e) => me.catalog.get(e.cardId).type), ['skill', 'skill']);

    // 随机刻印：木札任意 3 张灵巧；拳刺 1 张攻击牌动量。
    const inscribedOf = (hero, key) => hero.deckEntries.filter((e) => e.inscription === key);
    const tag = plain();
    await tag.tables.append('ledger', gain(1, 'rl-s-11'));
    assert.equal(inscribedOf(await tag.hero(), 'deft').length, 3);
    const punch = plain();
    await punch.tables.append('ledger', gain(1, 'rl-s-16'));
    me = await punch.hero();
    assert.deepEqual(inscribedOf(me, 'momentum').map((e) => me.catalog.get(e.cardId).type), ['attack']);

    // 人偶镜：卡组多 1 张同名副本，带原副本的升级与刻印，不带成长。
    const mirror = plain();
    const deckBefore = (await mirror.hero()).deck.length;
    await mirror.tables.append('ledger', [...gain(1, 'rl-s-11'), traitAt(2, 'rl-s-07'), pickAt(2, 'tr-2-0', 'tr-1-0')]);
    me = await mirror.hero();
    const twin = me.deckEntries.find((e) => e.copyId.includes('.mirror'));
    assert.equal(me.deck.length, deckBefore + 1);
    assert.ok(twin && !twin.bonus);
    assert.ok(me.deckEntries.some((e) => e.copyId !== twin.copyId && e.cardId === twin.cardId && e.upgraded === twin.upgraded && (e.inscription || null) === (twin.inscription || null)));

    // 御印：装上后挂起一次选定，列出可刻的攻击 / 技能副本；选定后刻御准，不能重复，副本须在可选列表；回退撤销。
    const seal = plain();
    await seal.tables.append('ledger', gain(1, 'rl-s-18'));
    me = await seal.hero();
    assert.equal(me.relicInscribe.length, 1);
    const due = me.relicInscribe[0];
    assert.deepEqual([due.relic, due.inscription], [{ relicId: 'rl-s-18', model: 'original' }, 'sovereign']);
    assert.ok(due.copies.length > 0 && due.copies.every((id) => ['attack', 'skill'].includes(me.catalog.get(me.deckEntries.find((e) => e.copyId === id).cardId).type)));
    assert.equal(me.deckEntries.some((e) => e.inscription), false, '御印不随机刻');
    const target = me.deckEntries.find((e) => e.copyId === due.copies[0]);
    const ask = (copyId, cardId) => seal.ledger.inscribeRelic('pc-hero', { relicId: 'rl-s-18', model: 'original', copyId, cardId, inscription: 'sovereign' });
    assert.equal((await ask('nope:0', target.cardId)).ok, false);
    assert.equal((await ask(target.copyId, target.cardId)).ok, true);
    me = await seal.hero();
    assert.deepEqual([me.relicInscribe, me.deckEntries.find((e) => e.copyId === target.copyId).inscription], [undefined, 'sovereign']);
    const twice = await ask(due.copies[1], me.deckEntries.find((e) => e.copyId === due.copies[1]).cardId);
    assert.deepEqual([twice.ok, twice.reason], [false, 'combat-relic-inscribe-unavailable']);
    seal.ref.chat = [ai('正文')];
    me = await seal.hero();
    assert.deepEqual([me.relicInscribe, me.deckEntries.some((e) => e.inscription)], [undefined, false]);

    const sealEntry = (relicId) => at('relic-inscribe', 1, 4, { relicId, model: 'original', copyId: 'start:0', cardId: 'c1', inscription: 'sovereign' });
    assert.equal(normalizeLedgerEntry(sealEntry('rl-s-18')).ok, true);
    assert.equal(normalizeLedgerEntry(sealEntry('rl-x-99')).ok, false, '未知遗物');

    // 把升级、刻印和两种成长都放在复制前，验证新副本只保留前两者。
    const markedClass = classDef('cls-blade');
    const markedProfile = heroDef();
    const withUpgrade = (card) => ({ ...card, upgraded: { effects: card.effects.map((effect) => ({ ...effect, amount: effect.amount + 2 })) } });
    markedClass.classPool = markedClass.classPool.map(withUpgrade);
    markedProfile.personalPool = markedProfile.personalPool.map(withUpgrade);
    const marked = setup([user('<igs-combat-report id="grow" result="win">战报</igs-combat-report>'), ai('刻印'), ai('复制')], [row(markedClass, 1), row(markedProfile, 2)]);
    const markedBefore = await marked.hero();
    const sharedCards = [...new Set(markedBefore.deck)].map((cardId) => ({ cardId, damage: 4, block: 3 }));
    const copyCards = markedBefore.deckEntries.map(({ cardId, copyId }) => ({ cardId, copyId, damage: 2, block: 1 }));
    await marked.tables.append('ledger', [at('battle-growth', 0, 0, { cards: [...sharedCards, ...copyCards], hpMax: 0, reportId: 'grow' }, 'battle-growth')]);
    const fit = markedBefore.deckEntries.filter((e) => (markedBefore.owned.get(e.cardId) || 0) < 3);
    for (const [i, entry] of fit.entries()) {
        const upgrade = at('reward', 0, i, { level: i + 2, choice: { kind: 'upgrade', targetId: entry.cardId } }, 'reward');
        const card = markedBefore.catalog.get(entry.cardId);
        if (card.upgraded) {
            marked.ref.chat[0].mes += `\n[igs-combat:exp|主角|${expFor(i + 2)}|历练]`;
            const scanned = await marked.ledger.scan();
            await marked.ledger.append(scanned.entries);
            await marked.tables.append('ledger', [upgrade]);
        }
        marked.ref.chat[1].mes += `\n[igs-combat:inscribe|主角|${card.name}|灵巧|印记]`;
    }
    const marks = await marked.ledger.scan();
    assert.deepEqual(marks.diagnostics, [], '复制前的刻印必须通过正文扫描');
    await marked.ledger.append(marks.entries);
    const sourceHero = await marked.hero();
    assert.ok(fit.every(({ copyId }) => sourceHero.deckEntries.some((entry) => entry.copyId === copyId && entry.upgraded && entry.inscription === 'deft')), '复制前源副本已升级并刻印');
    await marked.tables.append('ledger', gain(2, 'rl-s-07'));
    const markedHero = await marked.hero();
    const markedTwin = markedHero.deckEntries.find((e) => e.copyId.includes('.mirror'));
    assert.ok(markedTwin?.upgraded && markedTwin.inscription === 'deft', JSON.stringify({
        twin: markedTwin, candidates: markedHero.deckEntries.filter((e) => fit.some((f) => f.cardId === e.cardId)),
        diagnostics: (await marked.ledger.effectiveState()).diagnostics,
    }));
    assert.equal(markedTwin.bonus, undefined);
    const lobby = { heroId: markedHero.id, controllable: [markedHero.id], allies: [markedHero], enemies: [] };
    const built = buildSetup(lobby, { enemies: [], tier: 'normal' });
    assert.equal(built.ok, true);
    const unit = built.setup.units[0];
    const twinEntry = unit.deck.find((e) => e.copyId === markedTwin.copyId);
    assert.equal(twinEntry.bonus, undefined, '镜像开战时不带共享成长');
    assert.equal(Object.hasOwn(twinEntry, 'localGrowth'), false, '内部标记不进入战斗存档');
    const original = unit.deck.find((e) => e.cardId === markedTwin.cardId && e.copyId !== markedTwin.copyId);
    assert.deepEqual(original.bonus, { damage: 6, block: 4 }, '原副本共享与独立成长只叠一次');
    assert.equal(built.setup.attributeRules, 1);
    assert.deepEqual(unit.catalog[markedTwin.cardId].effects, markedHero.catalog.get(markedTwin.cardId).effects, '目录保留原值，副本的成长、刻印与属性在牌面合并');

    // 御印通过真实服务写口落到模拟宿主表，重建服务后仍可回读，不需要模型参与。
    const { createCombatServices } = await import('../src/core/combat-services.js');
    const host = createLedgerMockHost({ supportCallbacks: true });
    host.sheets.sheet_userbag = userInventorySheet();
    const persisted = createCombatTables({ api: host.api });
    const ensured = await persisted.ensure();
    assert.equal(ensured.ok, true, JSON.stringify(ensured));
    assert.equal((await persisted.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2)])).ok, true);
    const chatRef = { chat: [ai('正文'), ai('装上御印')] };
    let enabled = true;
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const serviceOptions = {
        global: { AutoCardUpdaterAPI: host.api, SillyTavern: { getContext: () => ({ chat: chatRef.chat }) } },
        storage: createMemoryStorage(),
        getChatId: () => 'pickup-seal', getUserName: () => '主角', getWallet: () => 1000,
        getReaderSettings: () => ({ combatExpansion: { enabled } }),
    };
    const services = createCombatServices(serviceOptions);
    const serviceLedger = services.getLedger();
    const sealTrait = { traitId: 'tr-service', name: '御印', rarity: 'rare', kind: 'passive', relic: { relicId: 'rl-s-18', model: 'original' } };
    assert.equal((await serviceLedger.drawTrait('pc-hero', sealTrait)).ok, true);
    assert.equal((await services.pickTrait({ drop: 'pp-pc-hero' })).ok, true);
    const heldSeal = heroOf(await serviceLedger.effectiveState());
    const sealCopy = heldSeal.relicInscribe[0].copies[0];
    chatRef.chat.push(ai('选定刻印'));
    const chooseSeal = { relicId: 'rl-s-18', model: 'original', copyId: sealCopy };
    assert.equal((await services.inscribeRelic({ ...chooseSeal, copyId: 'missing:0' })).reason, 'combat-relic-inscribe-invalid');
    const writtenSeal = await services.inscribeRelic(chooseSeal);
    assert.equal(writtenSeal.ok, true, JSON.stringify(writtenSeal));
    const restoredServices = createCombatServices(serviceOptions);
    const restoredLedger = restoredServices.getLedger();
    const restoredSeal = heroOf(await restoredLedger.effectiveState());
    assert.equal(restoredSeal.relicInscribe, undefined);
    assert.equal(restoredSeal.deckEntries.find((entry) => entry.copyId === sealCopy).inscription, 'sovereign');
    const storedSeal = (await restoredLedger.read()).entries.find((entry) => entry.type === 'relic-inscribe');
    assert.equal(storedSeal.anchor.messageId, 2);
    assert.deepEqual(storedSeal.payload, { ...chooseSeal, cardId: writtenSeal.cardId, inscription: 'sovereign' });
    assert.equal((await restoredServices.inscribeRelic(chooseSeal)).reason, 'combat-relic-inscribe-unavailable');
    chatRef.chat[2].swipe_id = 1;
    let rewound = heroOf(await restoredLedger.effectiveState());
    assert.equal(rewound.deckEntries.find((entry) => entry.copyId === sealCopy).inscription, undefined);
    assert.ok(rewound.relicInscribe[0].copies.includes(sealCopy), '切换选定楼 swipe 恢复待刻');
    chatRef.chat[2].swipe_id = 0;
    assert.equal(heroOf(await restoredLedger.effectiveState()).relicInscribe, undefined);
    chatRef.chat = chatRef.chat.slice(0, 2);
    rewound = heroOf(await restoredLedger.effectiveState());
    assert.ok(rewound.relicInscribe[0].copies.includes(sealCopy), '删除选定楼恢复待刻');
    assert.equal(rewound.deckEntries.find((entry) => entry.copyId === sealCopy).inscription, undefined);
    chatRef.chat[1].swipe_id = 1;
    rewound = heroOf(await restoredLedger.effectiveState());
    assert.equal(rewound.relicInscribe, undefined, '装上楼失效后待刻一起撤销');
    enabled = false;
    assert.equal((await restoredServices.inscribeRelic(chooseSeal)).reason, 'combat-disabled');

    // 旧式卡组记录仍可回放，用它固定合法的十张候选，验证不足与耗尽。
    const narrow = ['basic-strike', ...STARTER.filter((id) => ['basic-defend', 'c3', 'c4', 'm2'].includes(id))];
    const deckAt = (cards) => at('deck', 0, 0, { cards, revision: 1 }, 'deck');
    const scarceUpgrade = plain();
    await scarceUpgrade.tables.append('ledger', [deckAt(narrow), ...gain(1, 'rl-c-21')]);
    assert.deepEqual(upgradedOf(await scarceUpgrade.hero()).map((entry) => entry.cardId), ['basic-strike'], '只有一张能升级时只升一张');
    const noUpgrade = plain();
    await noUpgrade.tables.append('ledger', [deckAt(narrow.map((id) => id === 'basic-strike' ? 'c1' : id)), ...gain(1, 'rl-c-21')]);
    assert.equal(upgradedOf(await noUpgrade.hero()).length, 0, '没有升级形态时不凭空升级');
    const scarceInscribe = plain();
    await scarceInscribe.tables.append('ledger', [deckAt(narrow), ...gain(1, 'rl-s-10')]);
    assert.deepEqual(inscribedOf(await scarceInscribe.hero(), 'sharp').map((entry) => entry.cardId), ['basic-strike'], '只有一张攻击牌可刻时不重复刻同副本');
    const noSeal = plain();
    await noSeal.tables.append('ledger', [deckAt(narrow)]);
    const noSealBefore = await noSeal.hero();
    noSeal.ref.chat[0].mes += narrow.map((id) => `\n[igs-combat:inscribe|主角|${noSealBefore.catalog.get(id).name}|灵巧|印记]`).join('');
    const occupied = await noSeal.ledger.scan();
    assert.deepEqual(occupied.diagnostics, []);
    assert.equal((await noSeal.ledger.append(occupied.entries)).ok, true);
    assert.equal((await noSeal.hero()).deckEntries.filter((entry) => entry.inscription).length, narrow.length);
    await noSeal.tables.append('ledger', gain(1, 'rl-s-18'));
    assert.equal((await noSeal.hero()).relicInscribe, undefined, '御印获得时无可刻对象即作废，不挂空待选');
    const noMirror = plain();
    await noMirror.tables.append('ledger', [deckAt(STARTER.slice(0, 12)), ...gain(1, 'rl-s-07')]);
    assert.equal((await noMirror.hero()).deck.length, 12, '所有同名牌已达获得上限时不复制');
    for (const current of [scarceUpgrade, noUpgrade, scarceInscribe, noSeal, noMirror]) {
        assert.deepEqual((await current.ledger.effectiveState()).diagnostics, []);
    }
    // 删除装上楼，升级、刻印、镜像均由重放自然撤销，不另写补偿流水。
    for (const current of [whet, paint, tag, punch, mirror]) {
        current.ref.chat = [ai('正文')];
        const rolled = await current.hero();
        assert.equal(rolled.deckEntries.some((entry) => entry.upgraded || entry.inscription || entry.localGrowth), false);
        assert.equal(rolled.deck.length, STARTER.length);
    }
    // 旧升级张数先分配到原副本，遗物升级与镜像不能挪用这份分配。
    const mixed = setup([ai(`[igs-combat:exp|主角|${expFor(2)}|历练]`), ai('升级'), ai('复制')]);
    const mixedScan = await mixed.ledger.scan();
    assert.equal((await mixed.ledger.append(mixedScan.entries)).ok, true);
    await mixed.tables.append('ledger', [at('reward', 0, 0, { level: 2, choice: { kind: 'upgrade', targetId: 'basic-strike' } }, 'reward')]);
    const mixedBefore = await mixed.hero();
    const legacyCopy = mixedBefore.deckEntries.find((entry) => entry.cardId === 'basic-strike' && entry.upgraded).copyId;
    await mixed.tables.append('ledger', gain(1, 'rl-c-21'));
    const mixedAfter = await mixed.hero();
    assert.equal(mixedAfter.deckEntries.find((entry) => entry.copyId === legacyCopy).upgraded, true);
    assert.equal(upgradedOf(mixedAfter).filter((entry) => entry.cardId === 'basic-strike').length, 3);
    const beforeMirror = mixedAfter.deckEntries.map(({ copyId, upgraded }) => [copyId, upgraded]);
    await mixed.tables.append('ledger', [traitAt(2, 'rl-s-07'), pickAt(2, 'tr-2-0', 'tr-1-0')]);
    const mixedMirror = await mixed.hero();
    assert.deepEqual(mixedMirror.deckEntries.filter((entry) => !entry.localGrowth).map(({ copyId, upgraded }) => [copyId, upgraded]), beforeMirror);
    assert.deepEqual((await mixed.ledger.effectiveState()).diagnostics, []);




});

test('加卡遗物（v6 G5f-4e）：实际新增副本自动升级、每五张回血与每张积分，旧记录/待选/跳过/拒收不触发，回退撤销', async () => {
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const at = (type, messageId, occurrence, payload, tagHash = 'trait') => {
        const anchor = { messageId, swipeId: 0, tagHash, occurrence };
        return { id: ledgerEntryId(type, 'pc-hero', anchor), type, character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const traits = ['rl-c-06', 'rl-u-10', 'rl-r-07', 'rl-r-16', 'rl-r-26'];
    const setup = (profile = heroDef()) => {
        const env = ledgerSetup([row(classDef('cls-blade'), 1), row(profile, 2)], [ai('持有特性'), user('<igs-combat-report id="hurt" result="win">战报</igs-combat-report>'), ai('学牌'), ai('之后')]);
        const trait = (i, occurrence) => at('trait', 0, occurrence, { traitId: `added-tr-${i}`, name: '加卡特性', rarity: 'rare', kind: 'passive', relic: { relicId: traits[i], model: 'original' }, cost: 100 });
        const entries = [
            trait(0, 0), at('trait-pick', 0, 1, { traitId: 'added-tr-0', drop: 'pp-pc-hero' }),
            trait(1, 2), at('trait-pick', 0, 3, { traitId: 'added-tr-1', drop: 'pc-hero-h0' }),
            at('trait-slot', 0, 4, { slot: 3, cost: 500 }), trait(2, 5),
            at('trait-slot', 0, 6, { slot: 4, cost: 1000 }), trait(3, 7),
            at('trait-slot', 0, 8, { slot: 5, cost: 2000 }), trait(4, 9),
        ];
        return { ...env, entries, hero: async () => heroOf(await env.ledger.effectiveState()) };
    };
    const fresh = (id, type = 'attack') => ({ id, name: `新牌${id}`, type, rarity: 'common', cost: 1,
        effects: [{ op: type === 'attack' ? 'damage' : 'block', amount: type === 'attack' ? 6 : 5 }], upgraded: { effects: [{ op: type === 'attack' ? 'damage' : 'block', amount: type === 'attack' ? 8 : 7 }] } });
    const learnAt = (i, card, added = true) => {
        const anchor = { messageId: 2, swipeId: 0, tagHash: `learn${i}`, occurrence: 0 };
        return { id: ledgerEntryId('learn', 'pc-hero', anchor), type: 'learn', character: 'pc-hero', anchor, payload: { card, merge: true, ...(added ? { added: true } : {}) }, createdAt: 7 };
    };
    const env = setup();
    await env.tables.append('ledger', env.entries);
    const base = await env.hero();
    assert.equal(base.traits.length, 5, '五件加卡特性已真正装上');
    assert.deepEqual((await env.ledger.effectiveState()).diagnostics, []);
    const wound = at('wound', 1, 0, { hp: base.hpMax - 45, maxHp: base.hpMax, down: false, reportId: 'hurt' }, 'wound');
    await env.tables.append('ledger', [wound]);
    const cards = ['attack', 'skill', 'power', 'attack', 'skill'].map((type, i) => fresh(`added-${i}`, type));
    env.ref.chat[2].mes = cards.map((card, i) => `[igs-combat:learn|主角|${card.name}|历练${i}]`).join('\n');
    // 以真实扫描锚点写 learn，覆盖重放时标签有效性校验。
    const { extractGrowthDirectives } = await import('../src/scene/combat-directives.js');
    const directives = extractGrowthDirectives(env.ref.chat[2].mes).directives;
    const learns = cards.map((card, i) => {
        const directive = directives[i];
        const entry = learnAt(i, card);
        entry.anchor = { messageId: 2, swipeId: 0, tagHash: directive.tagHash, occurrence: directive.occurrence };
        entry.id = ledgerEntryId('learn', 'pc-hero', entry.anchor);
        const normalized = normalizeLedgerEntry(entry);
        assert.equal(normalized.ok, true, JSON.stringify(normalized.errors));
        return normalized.value;
    });
    await env.tables.append('ledger', learns.slice(0, 4));
    let me = await env.hero();
    assert.equal(me.points - base.points, 60);
    assert.equal(me.wound.hp, base.hpMax - 45, '未满五张不回血');
    assert.ok(me.deckEntries.slice(-4).every((entry) => entry.upgraded), '三种牌型均自动升级');
    await env.tables.append('ledger', learns.slice(4));
    me = await env.hero();
    assert.equal(me.points - base.points, 75);
    assert.equal(me.wound.hp, base.hpMax - 25);
    assert.equal(me.deck.length - base.deck.length, 5);
    const learnedModels = [...me.catalog.values()].filter((card) => card.id.startsWith('added-'));
    assert.equal(learnedModels.length, 3, '五张新牌按三种模型归并，不依赖重放后保留的目录 ID');
    assert.deepEqual(['attack', 'skill', 'power'].map((type) => me.deckEntries.filter((entry) => learnedModels.some((card) => card.id === entry.cardId && card.type === type)).length), [2, 2, 1]);
    assert.equal(me.deckEntries.at(-1).upgraded, true, '并卡副本也自动升级');
    assert.deepEqual((await env.ledger.effectiveState()).diagnostics, []);
    assert.deepEqual(await env.hero(), me, '重复读取不重复奖励');
    env.ref.chat[2].swipe_id = 1;
    const rolled = await env.hero();
    assert.deepEqual([rolled.points, rolled.deck.length, rolled.wound.hp], [base.points, base.deck.length, base.hpMax - 45]);
    env.ref.chat[2].swipe_id = 0;
    assert.equal((await env.hero()).points, me.points);
    const old = setup();
    await old.tables.append('ledger', old.entries);
    old.ref.chat[2].mes = env.ref.chat[2].mes;
    const oldBefore = await old.hero();
    const oldLearns = learns.map((entry) => { const copy = clone(entry); delete copy.payload.added; return copy; });
    await old.tables.append('ledger', oldLearns);
    const oldHero = await old.hero();
    assert.equal(oldHero.points, oldBefore.points);
    assert.equal(oldHero.deckEntries.slice(-5).some((entry) => entry.upgraded), false);
    assert.equal(normalizeLedgerEntry({ ...learns[0], payload: { ...learns[0].payload, added: false } }).ok, false);
    assert.equal(normalizeLedgerEntry(at('card-pick', 2, 0, { drawId: 'draw-x', pick: 'skip', added: true })).ok, false);
    assert.equal(normalizeLedgerEntry(at('reward', 2, 0, { level: 2, choice: { kind: 'skip' }, added: true })).ok, false);

    // 公开写口：免费／付费积分抽卡和人偶镜实际新增副本才触发。
    const { planCardDraw } = await import('../src/combat/rewards.js');
    const { fixedCard } = await import('../src/combat/fixed-cards/index.js');
    const publicEnv = setup();
    await publicEnv.tables.append('ledger', publicEnv.entries);
    publicEnv.ref.chat[3].mes = `[igs-combat:exp|主角|${expFor(2)}|历练]`;
    const expScan = await publicEnv.ledger.scan();
    assert.equal((await publicEnv.ledger.append(expScan.entries)).ok, true);
    const publicBefore = await publicEnv.hero();
    assert.deepEqual(publicBefore.freeDraws, [2]);
    let publicHero = publicBefore;
    // 余额只用于写口扣费验证，不产生额外加卡事件。
    const paidLedger = createCombatLedger({ tables: publicEnv.tables, chat: () => publicEnv.ref.chat, userName: '主角', wallet: () => 10000, now: () => 7 });
    for (const mode of ['fixed', 'random', 'skip']) {
        const beforePick = heroOf(await paidLedger.effectiveState());
        const plan = planCardDraw(beforePick);
        const choices = plan.fixedIds.map((id) => clone(fixedCard(id)));
        choices.splice(plan.randomAt, 0, fresh(plan.cardId));
        assert.equal((await paidLedger.drawCard('pc-hero', { drawId: plan.drawId, choices, ...(mode === 'fixed' ? { free: { level: 2 } } : {}) })).ok, true);
        assert.equal(heroOf(await paidLedger.effectiveState()).deck.length, beforePick.deck.length, '待翻牌不触发加卡');
        const position = mode === 'fixed' ? (plan.randomAt === 0 ? 1 : 0) : plan.randomAt;
        assert.equal((await paidLedger.flipCard('pc-hero', plan.drawId, position)).ok, true);
        const beforeWrite = heroOf(await paidLedger.effectiveState());
        const picked = await paidLedger.pickCard('pc-hero', plan.drawId, mode === 'skip' ? 'skip' : position);
        assert.equal(picked.ok, true, JSON.stringify(picked));
        publicHero = heroOf(await paidLedger.effectiveState());
        assert.equal(publicHero.points - beforeWrite.points, mode === 'skip' ? 0 : 15);
        assert.equal(publicHero.deck.length - beforeWrite.deck.length, mode === 'skip' ? 0 : 1);
        if (mode !== 'skip') assert.equal(publicHero.deckEntries.at(-1).upgraded, true);
    }
    const beforeMirror = heroOf(await paidLedger.effectiveState());
    assert.equal((await paidLedger.drawTrait('pc-hero', { traitId: 'added-mirror', name: '人偶镜', kind: 'passive', rarity: 'rare', relic: { relicId: 'rl-s-07', model: 'original' } })).ok, true);
    const waitingMirror = heroOf(await paidLedger.effectiveState());
    assert.equal(waitingMirror.deck.length, beforeMirror.deck.length, '待选期间没有加卡');
    assert.equal((await paidLedger.pickTrait('pc-hero', 'added-mirror', 'added-tr-2')).ok, true);
    const afterMirror = heroOf(await paidLedger.effectiveState());
    assert.equal(afterMirror.deck.length, beforeMirror.deck.length + 1);
    assert.equal(afterMirror.points - waitingMirror.points, 15, '人偶镜走同一加卡入口');
    assert.equal(publicEnv.tables.ledger.find((entry) => entry.payload.traitId === 'added-mirror').payload.added, true);
    assert.deepEqual((await paidLedger.effectiveState()).diagnostics, []);

    const { attachLoot, reportIdFor } = await import('../src/combat/report.js');
    const { cardCopyLimit } = await import('../src/combat/rules.js');
    for (const mode of ['single', 'fixed', 'random', 'skip', 'cap']) {
        const lootEnv = setup();
        await lootEnv.tables.append('ledger', lootEnv.entries);
        const plan = planCardDraw(await lootEnv.hero());
        const choices = plan.fixedIds.map((id) => clone(fixedCard(id)));
        choices.splice(plan.randomAt, 0, fresh(plan.cardId));
        const pick = mode === 'random' ? plan.randomAt : (plan.randomAt === 0 ? 1 : 0);
        const card = mode === 'single' ? fresh('added-single') : choices[pick];
        if (mode === 'cap') {
            lootEnv.ref.chat[2].mes = Array.from({ length: cardCopyLimit(card.rarity) }, (_, i) => `[igs-combat:learn|主角|${card.name}|上限${i}]`).join('\n');
            const tags = extractGrowthDirectives(lootEnv.ref.chat[2].mes).directives;
            await lootEnv.tables.append('ledger', tags.map((tag, i) => {
                const entry = learnAt(i, card, false);
                entry.anchor = { messageId: 2, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
                entry.id = ledgerEntryId('learn', 'pc-hero', entry.anchor);
                return entry;
            }));
            assert.equal((await lootEnv.hero()).owned.get(card.id), cardCopyLimit(card.rarity));
        }
        const slot = { index: 0, kind: 'card', rarity: card.rarity, name: card.name, origin: '', card, ...(mode === 'single' ? {} : { choices }) };
        const slots = [slot, ...[1, 2].map((index) => ({ index, kind: 'keepsake', rarity: 'common', name: `杂物${index}`, origin: '' }))];
        const combatId = `added-loot-${mode}`;
        assert.equal((await lootEnv.ledger.append([at('offer', 0, 0, { combatId, tier: 'normal', exp: 10, reveal: 0, slots }, 'offer')])).ok, true);
        const reportId = reportIdFor(combatId);
        lootEnv.ref.chat[3] = user(attachLoot(`<igs-combat-report result="win" id="${reportId}">我方获胜。</igs-combat-report>`, {
            character: '主角', reportId, index: 0, set: 'main', slot, ...(mode === 'single' ? {} : { pick: mode === 'skip' ? 'skip' : pick }),
        }));
        const beforeLoot = await lootEnv.hero();
        const scanned = await lootEnv.ledger.scan();
        const loots = scanned.entries.filter((entry) => entry.type === 'loot');
        assert.equal(loots.length, 1, JSON.stringify(scanned.diagnostics));
        assert.equal(loots[0].payload.added, mode === 'skip' ? undefined : true);
        await lootEnv.ledger.append(loots);
        const afterLoot = await lootEnv.hero();
        const gained = mode === 'skip' || mode === 'cap' ? 0 : 1;
        assert.equal(afterLoot.deck.length - beforeLoot.deck.length, gained, mode);
        assert.equal(afterLoot.points - beforeLoot.points, gained * 15, `${mode} 只按真正入组结算`);
        if (gained) assert.equal(afterLoot.deckEntries.at(-1).upgraded, true, mode);
    }

    const signature = { id: 'pc-hero-g1', name: '专属斩', type: 'attack', cost: 2, rarity: 'signature', effects: [{ op: 'damage', amount: 14 }] };
    for (const added of [true, false]) {
        const sigEnv = setup({ ...heroDef(), signatureCards: [signature] });
        await sigEnv.tables.append('ledger', sigEnv.entries);
        const beforeSignature = await sigEnv.hero();
        sigEnv.ref.chat[3] = win(expFor(5));
        if (added) {
            const scanned = await sigEnv.ledger.scan();
            assert.equal(scanned.ok, true, JSON.stringify(scanned.diagnostics));
            assert.equal(scanned.entries.find((entry) => entry.type === 'exp').payload.added, true);
        } else {
            const tag = extractGrowthDirectives(sigEnv.ref.chat[3].mes, { raw: true, expCap: false }).directives.find((directive) => directive.kind === 'exp');
            const entry = at('exp', 3, tag.occurrence, { amount: tag.amount, reason: tag.reason }, tag.tagHash);
            assert.equal((await sigEnv.ledger.append([entry])).ok, true);
        }
        const afterSignature = await sigEnv.hero();
        assert.equal(afterSignature.level, 5);
        assert.equal(afterSignature.owned.get(signature.id), 1);
        assert.equal(afterSignature.deck.length - beforeSignature.deck.length, 1);
        assert.equal(afterSignature.points - beforeSignature.points, added ? 15 : 0, '历史经验记录不追溯加卡收益');
        assert.equal(afterSignature.deckEntries.find((entry) => entry.cardId === signature.id).upgraded, false);
        assert.deepEqual((await sigEnv.ledger.effectiveState()).diagnostics, []);
    }
});




test('弱敌战（v6 G3d）：敌人全为「远逊」不计场次、不给删卡；槽位数不变、多出普通劣等杂物；经验与胜利积分 1/4、不带遗物加成；劣等杂物卖价 1/4', async () => {
    const { weakFoesOf } = await import('../src/combat/session.js');
    const { buildCombatReport, reportIdFor, reportWeakOf } = await import('../src/combat/report.js');
    const { BATTLE_POINTS_TAG_HASH } = await import('../src/combat/ledger.js');
    const { battlePoints, sellPrice, weakBattlePoints } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    // 判定：全部远逊才算弱敌战；没有关系档按「相当」（D-23）。
    const start = { enemies: [{ name: '小猫' }, { name: '小狗' }] };
    const tiers = (a, b) => new Map([['小猫', a && { tier: a }], ['小狗', b && { tier: b }]]);
    assert.equal(weakFoesOf(start, tiers('outclassed', 'outclassed')), true);
    assert.equal(weakFoesOf(start, tiers('outclassed', 'weaker')), false);
    assert.equal(weakFoesOf(start, tiers('outclassed', null)), false);
    assert.equal(weakFoesOf({ enemies: [] }, new Map()), false);

    // 奖励：槽位数不变，绝大多数为普通劣等杂物，其余槽稀有度封顶普通；经验 1/4；只在 v6（candidates）生效。
    const me = { kind: 'deck-character', id: 'pc-hero', classProfile: { archetype: 'warrior' }, owned: new Map() };
    let junk = 0;
    let total = 0;
    for (let i = 0; i < 60; i += 1) {
        const args = { combatId: `cb|weak|${i}`, tier: 'boss', enemyTiers: ['boss'], character: me, candidates: true, links: { reflip: true } };
        const full = planRewardSlots(args);
        const weak = planRewardSlots({ ...args, weak: true });
        assert.equal(weak.weak, true);
        assert.equal(weak.slots.length, full.slots.length, '槽位数不变（再翻照常加槽）');
        assert.equal(weak.reserve.length, full.reserve.length);
        assert.equal(weak.exp, Math.floor(full.exp / 4));
        for (const slot of [...weak.slots, ...weak.reserve]) {
            total += 1;
            assert.equal(slot.rarity, 'common', JSON.stringify(slot));
            assert.notEqual(slot.gearSlot, 'treasure');
            if (slot.kind === 'keepsake') { assert.equal(slot.junk, true); junk += 1; }
        }
        assert.deepEqual(planRewardSlots(args), full, '普通战斗不受影响');
        assert.equal(planRewardSlots({ ...args, candidates: false, weak: true }).weak, undefined, '旧规则不走弱敌战');
    }
    assert.ok(junk / total > 0.88, `劣等杂物 ${junk}/${total}`);

    // 战报：经验 1/4，战报块带 weak="1"。
    const built = buildCombatReport({ combatId: 'cb-w', state: { outcome: 'victory', units: {} }, events: [], enemyTiers: ['normal'], expTargets: ['主角'], weak: true });
    assert.equal(built.ok, true, JSON.stringify(built));
    assert.equal(built.exp[0].amount, Math.floor(COMBAT_RULES.tiers.normal.exp / 4));
    assert.equal(reportWeakOf(built.text), true);
    assert.equal(reportWeakOf(buildCombatReport({ combatId: 'cb-w', state: { outcome: 'victory', units: {} }, events: [], enemyTiers: ['normal'], expTargets: ['主角'] }).text), false);

    // 劣等杂物卖价 1/4（至少 1）。
    for (const key of ['a', 'b', 'c']) assert.equal(sellPrice('common', key, { junk: true }), Math.max(1, Math.floor(sellPrice('common', key) / 4)));

    // 账本：弱敌战胜利不计场次、战报里的删牌标签不入账；积分记录的 weak 须与战报一致。
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]);
    const ref = { chat: [ai('正文')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, wallet: () => 1000 });
    const copyId = heroOf(await ledger.effectiveState()).deckEntries[0].copyId;
    const weakRid = reportIdFor('cb|weak-floor');
    const fullRid = reportIdFor('cb|full-floor');
    ref.chat.push(user(`<igs-combat-report id="${weakRid}" result="win" weak="1">终局：我方获胜。</igs-combat-report>\n[igs-combat:exp|主角|5|战斗:${weakRid}]\n[igs-combat:purge|主角|${weakRid}|${copyId}]`));
    const scanned = await ledger.scan();
    assert.equal(scanned.entries.some((e) => e.type === 'purge'), false);
    assert.ok(scanned.diagnostics.some((d) => d.code === 'combat-purge-weak-report'), JSON.stringify(scanned.diagnostics));
    assert.equal((await ledger.append(scanned.entries)).ok, true);
    let hero = heroOf(await ledger.effectiveState());
    assert.equal(hero.purge, undefined, '弱敌战不计胜场');
    ref.chat.push(user(`<igs-combat-report id="${fullRid}" result="win">终局：我方获胜。</igs-combat-report>\n[igs-combat:exp|主角|5|战斗:${fullRid}]`));
    assert.equal((await ledger.append((await ledger.scan()).entries)).ok, true);
    hero = heroOf(await ledger.effectiveState());
    assert.equal(hero.purge.battle, 1);

    const pointsAt = (messageId, occurrence, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_POINTS_TAG_HASH, occurrence };
        return { id: ledgerEntryId('battle-points', 'pc-hero', anchor), type: 'battle-points', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const weakPaid = { amount: weakBattlePoints('normal', 'cb|weak-floor'), tier: 'normal', combatId: 'cb|weak-floor', reportId: weakRid, weak: true };
    const fullPaid = { amount: battlePoints('normal', 'cb|full-floor'), tier: 'normal', combatId: 'cb|full-floor', reportId: fullRid };
    assert.equal(normalizeLedgerEntry(pointsAt(1, 0, weakPaid)).ok, true);
    assert.equal(normalizeLedgerEntry(pointsAt(1, 0, { ...weakPaid, amount: battlePoints('normal', 'cb|weak-floor') })).ok, false, '弱敌战不能按全额');
    assert.equal(normalizeLedgerEntry(pointsAt(1, 0, { ...weakPaid, bonus: { points: 5, hpMax: 0, relics: [{ relicId: 'rl-c-01', model: 'original' }] } })).ok, false, '弱敌战不带遗物加成');
    assert.equal(normalizeLedgerEntry(pointsAt(1, 0, { ...weakPaid, weak: false })).ok, false);
    const before = hero.points;
    await tables.append('ledger', [
        pointsAt(1, 0, weakPaid), pointsAt(2, 0, fullPaid),
        pointsAt(1, 1, { amount: battlePoints('normal', 'cb|weak-floor'), tier: 'normal', combatId: 'cb|weak-floor', reportId: weakRid }),
        pointsAt(2, 1, { ...fullPaid, amount: weakBattlePoints('normal', 'cb|full-floor'), weak: true }),
    ]);
    const state = await ledger.effectiveState();
    assert.equal(state.inactive.filter((item) => item.reason === 'battle-points-weak-mismatch').length, 2);
    assert.equal(heroOf(state).points - before, weakPaid.amount + fullPaid.amount);
});

test('弱敌战（v6 G3d）新建链：开战楼关系冻结，奖励失败重试与重新准备不漂移，setup、战报与真实账本同口径', async t => {
    const { createCombatSession, sessionKeyFor } = await import('../src/combat/session.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { attributeViewFor } = await import('../src/combat/ledger.js');
    const { createCombatChatRecord } = await import('../src/host/combat-chat-record.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const { weakBattlePoints } = await import('../src/combat/points.js');
    const { reportWeakOf } = await import('../src/combat/report.js');
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: db.api });
    assert.equal((await tables.ensure()).ok, true);
    const enemy = { ...templateEnemy('小猫', 'normal'), skills: [{ ...idle, id: 'wait-a' }, { ...idle, id: 'wait-b' }] };
    assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2), row(enemy, 3)])).ok, true);
    const chat = [ai('[igs-combat:rel|小猫|远逊]'), ai('[igs-combat:start|桥头弱敌|小猫]'), ai('[igs-combat:rel|小猫|相当]')];
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    assert.equal((await ledger.scan()).ok, true);
    assert.equal(attributeViewFor(await ledger.effectiveState(), '小猫').tier, 'even');
    assert.equal(attributeViewFor(await ledger.effectiveState({ throughMessageId: 1 }), '小猫').tier, 'outclassed');
    assert.equal((await ledger.effectiveState({ throughMessageId: -1 })).reason, 'combat-floor-invalid');
    const chatRecord = createCombatChatRecord({ SillyTavern: { getContext: () => ({ chat, saveChat: async () => {} }) } });
    const storage = createCountingStorage();
    let rejectReward = true;
    const rewardRequests = [];
    const request = async prompt => {
        const entities = JSON.parse(prompt.user).entities;
        rewardRequests.push(...entities);
        return JSON.stringify({ entities: entities.map(entity => ({
        key: entity.key,
        value: entity.kind === 'encounter-theme' ? { theme: 'western' }
            : rejectReward ? {} : Object.fromEntries(['slots', 'reserve'].map(set => [set,
                (entity.input[set] || []).map((slot, i) => [`旧物${set}${i}`,
                    slot.kind === 'item' ? 'potion' : slot.kind === 'card' ? (slot.cost === 0 ? 'jab' : 'strike')
                        : slot.kind === 'gear' ? (slot.templates?.[0] || 'opening-guard') : null,
                    '桥头战利品'])])),
        })) });
    };
    const options = { ledger, tables, storage, chat: () => chat, getChatId: () => 'g3d-new', userName: '主角', chatRecord,
        request, retryDelays: [], llm: { source: 'tavern' }, now: () => 7,
        send: async text => { chat.push(user(text)); return { ok: true, messageId: chat.length - 1 }; } };
    const session = createCombatSession(options);
    t.after(() => { session.dispose(); tables.client.dispose(); });
    const prepared = await session.prepare(1);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.equal(session.state().lobby.weakFoes, true);
    assert.equal(session.state().reward.status, 'failed');
    assert.equal(chatRecord.read(session.state().anchor, session.state().combatId).value.prepared.weakFoes, true);
    rejectReward = false;
    const retried = await session.retryReward();
    assert.equal(retried.ok, true, JSON.stringify(retried));
    assert.equal(session.state().reward.status, 'ready', JSON.stringify({ reward: session.state().reward, requests: rewardRequests }));
    const combatId = session.state().combatId;
    const offer = (await ledger.effectiveState()).offers.get(combatId);
    assert.equal(offer.exp, Math.floor(COMBAT_RULES.tiers.normal.exp / 4));
    assert.equal(offer.slots.length, REWARD_SLOT_COUNT);
    assert.ok([...offer.slots, ...offer.reserve].every(slot => slot.rarity === 'common'));
    assert.ok(offer.slots.some(slot => slot.junk === true));
    session.reset();
    assert.equal((await session.prepare(1)).ok, true);
    assert.equal(session.state().lobby.weakFoes, true, '重新准备读取已存判定，不取之后的关系');
    assert.equal(session.start().ok, true);
    session.flushPersist();
    assert.equal(JSON.parse(storage.data.get(sessionKeyFor('g3d-new'))).setup.weakFoes, true);
    for (let i = 0; i < 400 && session.state().status === 'battle'; i += 1) {
        const state = session.state();
        const action = state.legal.find(a => a.type === 'play') || state.legal.find(a => a.type === 'end-turn');
        assert.ok(action, '存在合法出牌或结束回合动作');
        assert.equal(session.act(action).ok, true);
    }
    assert.equal(session.state().battle.outcome, 'victory');
    assert.equal((await session.loadFlip()).ok, true);
    assert.equal(session.state().flip.purge, undefined);
    assert.equal((await session.flip(0)).ok, true);
    if (session.state().flip.needCard) assert.equal((await session.pickCard('skip')).ok, true);
    const before = heroOf(await ledger.effectiveState({ raw: true }));
    const done = await session.finish();
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(reportWeakOf(chat.at(-1).mes), true);
    const paid = tables.read().ledger.filter(entry => entry.type === 'battle-points');
    assert.equal(paid.length, 1);
    assert.equal(paid[0].payload.weak, true);
    assert.equal(paid[0].payload.amount, weakBattlePoints('normal', combatId));
    assert.equal(paid[0].payload.bonus, undefined);
    const after = heroOf(await ledger.effectiveState({ raw: true }));
    assert.equal(after.exp - before.exp, offer.exp);
    assert.equal(after.points - before.points, paid[0].payload.amount);
    assert.equal(after.purge, undefined, '弱敌胜利不计普通胜场');
});

test('劣等杂物（v6 G3d）库存往返：同名不同品质分开、同品质叠加，品质旁的回收价值与真实到账一致', async t => {
    const { JSDOM } = await import('jsdom');
    const { createRecordPanelController } = await import('../src/visual/igs-ui/record-panel.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createCombatServices } = await import('../src/core/combat-services.js');
    const { reportIdFor, attachLoot } = await import('../src/combat/report.js');
    const { sellPrice } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const { scanGrowthTags, computeEffectiveState } = await import('../src/combat/ledger.js');
    const { heroInventoryView } = await import('../src/combat/inventory-view.js');
    for (const firstJunk of [false, true]) {
        const db = createLedgerMockHost({ supportCallbacks: true });
        db.sheets.sheet_userbag = userInventorySheet();
        const tables = createCombatTables({ api: db.api });
        const inventory = createInventoryTables({ api: db.api, client: tables.client, serial: tables.serial });
        assert.equal((await tables.ensure()).ok, true);
        assert.equal((await inventory.ensure()).ok, true);
        assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2)])).ok, true);
        const chat = [ai('桥头')];
        const ledger = createCombatLedger({ tables, inventory, chat: () => chat, userName: '主角', now: () => 7 });
        t.after(() => tables.client.dispose());
        let sequence = 0;
        const award = async junk => {
            const combatId = `cb|stock|${sequence++}`;
            const reportId = reportIdFor(combatId);
            const anchor = { messageId: chat.length - 1, swipeId: 0, tagHash: 'offer', occurrence: sequence };
            const slot = { index: 0, kind: 'keepsake', rarity: 'common', name: '旧铜铃', origin: '桥头战利品', ...(junk ? { junk: true } : {}) };
            const slots = [slot, ...[1, 2].map(index => ({ ...slot, index, name: `未选杂物${index}` }))];
            const offer = { id: ledgerEntryId('offer', 'pc-hero', anchor), type: 'offer', character: 'pc-hero', anchor,
                payload: { combatId, tier: 'normal', exp: 5, reveal: 0, slots }, createdAt: 7 };
            assert.equal((await ledger.append([offer])).ok, true);
            chat.push(user(attachLoot(`<igs-combat-report result="win" id="${reportId}">战报</igs-combat-report>`,
                { character: '主角', reportId, index: 0, set: 'main', slot })));
            const pending = scanGrowthTags(await ledger.read(), chat, { userName: '主角', messageIds: [chat.length - 1], now: 7 });
            const forged = clone(pending.entries.find(entry => entry.type === 'loot'));
            assert.ok(forged);
            if (junk) delete forged.payload.slot.junk;
            else forged.payload.slot.junk = true;
            const beforeStock = clone(inventory.read().inventory.items);
            const rejected = await ledger.append([forged]);
            assert.ok(rejected.stock.some(item => item.skipped && item.reason === 'combat-loot-slot-mismatch'), JSON.stringify(rejected));
            assert.equal(tables.read().ledger.some(entry => entry.id === forged.id), false, '品质不符不写领取记录');
            assert.deepEqual(inventory.read().inventory.items, beforeStock, '品质不符不改库存');
            // 同一领取身份仍可按 offer 的真实品质入库。
            const scanned = await ledger.scan({ messageIds: [chat.length - 1] });
            assert.equal(scanned.ok, true, JSON.stringify(scanned));
            assert.equal(scanned.entries.filter(entry => entry.type === 'loot').length, 1);
            chat.push(ai('下一场'));
        };

        await award(firstJunk);
        await award(!firstJunk);
        await award(true);
        await award(true);
        await award(true);
        let heroView = heroOf(await ledger.effectiveState({ raw: true }));
        assert.equal(heroView.collection.length, 2);
        const junk = heroView.collection.find(item => item.junk === true);
        const normal = heroView.collection.find(item => item.junk !== true);
        assert.ok(junk && normal);
        assert.notEqual(junk.itemId, normal.itemId);
        assert.equal(junk.count, 4);
        assert.equal(normal.count, 1);
        const definition = inventory.read().gear.rows.find(row => row.name === junk.name)?.definition;
        assert.equal(definition?.junk, true, '装配定义读回保留劣等标记');
        assert.equal((await ledger.scan()).ok, true);
        assert.deepEqual(heroOf(await ledger.effectiveState({ raw: true })).collection, heroView.collection, '重复扫描不重复领取');
        const dom = new JSDOM('<div id="igs-overlay"></div>');
        const services = createCombatServices({
            global: { AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => ({ chat }) } },
            storage: createMemoryStorage(), getChatId: () => `recycle-${firstJunk}`, getUserName: () => '主角',
            getReaderSettings: () => ({ combatExpansion: { enabled: true } }),
        });
        t.after(() => services.resetChat());
        const beforeInvalid = clone(inventory.read().inventory.items);
        const ledgerSize = tables.read().ledger.length;
        for (const count of [0, -1, 1.5, '2', null, NaN, Number.MAX_SAFE_INTEGER + 1]) {
            const rejected = await services.sellHeroItem('keepsake', junk.itemId, count);
            assert.equal(rejected.reason, 'combat-sell-count-invalid', String(count));
        }
        assert.equal((await services.sellHeroItem('keepsake', junk.itemId, 5)).reason, 'combat-sell-count-insufficient');
        assert.equal(tables.read().ledger.length, ledgerSize, '非法数量不写账本');
        assert.deepEqual(inventory.read().inventory.items, beforeInvalid, '非法数量不改库存');
        let saleFinished;
        let sale = new Promise(resolve => { saleFinished = resolve; });
        const soldCounts = [];
        const panel = createRecordPanelController(dom.window.document,
            { AutoCardUpdaterAPI: db.api, localStorage: createMemoryStorage() }, null, {
                getHeroInventory: () => ({ ...heroView, ok: heroView.inventory?.ok === true }),
                sellHeroItem: async (kind, key, count) => {
                    assert.equal(kind, 'keepsake');
                    assert.equal(key, junk.itemId);
                    soldCounts.push(count);
                    const result = await services.sellHeroItem(kind, key, count);
                    heroView = heroOf(await ledger.effectiveState({ raw: true }));
                    saleFinished(result);
                    return result;
                },
            });
        t.after(() => { panel.close(); dom.window.close(); });
        assert.equal(panel.open(dom.window.document.querySelector('#igs-overlay'), {}, 'inventory').ok, true);
        const button = [...dom.window.document.querySelectorAll('[data-record-act="select"]')].find(node => node.textContent.includes(junk.name));
        assert.ok(button, '库存中的劣等杂物可选');
        button.click();
        const price = sellPrice(junk.rarity, junk.itemId, { junk: true });
        const qualityRow = () => [...dom.window.document.querySelectorAll('.igs-record-item-detail .igs-record-fields div')].find(node => node.querySelector('dt')?.textContent === '品质');
        assert.equal(qualityRow()?.querySelector('dd')?.textContent, `劣等 · ${price} 积分`);
        const recycle = dom.window.document.querySelector('[data-record-act="sell"]');
        assert.equal(recycle.textContent, '回收');
        recycle.click();
        const modalOf = () => dom.window.document.querySelector('.igs-page-modal[role="dialog"]');
        let modal = modalOf();
        assert.ok(modal, '点击回收打开独立确认弹窗');
        assert.equal(dom.window.document.querySelector('[data-record-act="sell"]'), recycle, '原回收按钮保持不变');
        assert.equal(dom.window.document.querySelector('.igs-record-item-actions [data-igs-modal="ok"]'), null);
        assert.ok(modal.textContent.includes(`是否回收「${junk.name}」`));
        assert.ok(modal.textContent.includes(`${price} 积分`));
        const quantity = modal.querySelector('input[type="number"]');
        assert.equal(quantity.value, '1');
        assert.equal(quantity.max, '4');
        const setQuantity = (dialog, value) => {
            const input = dialog.querySelector('input[type="number"]');
            input.value = String(value);
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        };
        for (const value of ['', 0, 1.5, 5]) {
            setQuantity(modal, value);
            assert.equal(modal.querySelector('[data-igs-modal="ok"]').disabled, true);
            modal.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            assert.equal(modalOf(), modal, '非法数量不能由 Enter 确认');
        }
        setQuantity(modal, 2);
        assert.equal(modal.querySelector('[data-igs-modal="ok"]').disabled, false);
        assert.equal(modal.querySelector('.igs-page-modal-summary').textContent, `总计 ${price * 2} 积分`);
        assert.equal(qualityRow()?.querySelector('dd')?.textContent, `劣等 · ${price} 积分`);
        assert.equal(tables.read().ledger.filter(entry => entry.type === 'sell').length, 0, '确认前不回收、不入账');
        const stockBeforeConfirm = clone(inventory.read().inventory.items);
        recycle.click();
        assert.equal(modalOf(), modal, '连续点击回收不重复打开或提交');
        modal.querySelector('[data-igs-modal="cancel"]').click();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(modalOf(), null);
        assert.equal(dom.window.document.activeElement, recycle, '取消后焦点返回回收按钮');
        recycle.click();
        modal = modalOf();
        modal.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(modalOf(), null, 'Esc 取消确认');
        recycle.click();
        const staleConfirm = modalOf().querySelector('[data-igs-modal="ok"]');
        panel.close();
        assert.equal(modalOf(), null, '关闭面板清理确认弹窗');
        staleConfirm.click();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(inventory.read().inventory.items, stockBeforeConfirm);
        assert.equal(tables.read().ledger.filter(entry => entry.type === 'sell').length, 0, '取消、Esc、关闭面板均不回收');
        assert.equal(panel.open(dom.window.document.querySelector('#igs-overlay'), {}, 'inventory').ok, true);
        [...dom.window.document.querySelectorAll('[data-record-act="select"]')].find(node => node.textContent.includes(junk.name)).click();
        dom.window.document.querySelector('[data-record-act="sell"]').click();
        setQuantity(modalOf(), 2);
        const confirm = modalOf().querySelector('[data-igs-modal="ok"]');
        assert.equal(confirm.textContent, '确认');
        const beforePoints = heroView.points;
        confirm.click();
        confirm.click();
        const result = await sale;
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(modalOf(), null);
        assert.equal(tables.read().ledger.filter(entry => entry.type === 'sell').length, 1, '重复确认只提交一条批量记录');
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.price, price * 2);
        assert.equal(heroView.points - beforePoints, price * 2);
        assert.deepEqual(soldCounts, [2]);
        assert.equal(dom.window.document.querySelector('.igs-record-feedback').textContent, `已回收${junk.name} × 2，获得 ${price * 2} 积分`);
        assert.equal(heroView.collection.find(item => item.itemId === junk.itemId).count, 2);
        assert.equal(inventory.read().inventory.items.find(item => item.name === junk.name)?.quantity, 2);
        assert.ok(inventory.read().gear.rows.some(item => item.name === junk.name), '部分回收保留装配定义');
        assert.equal(heroView.collection.find(item => item.itemId === normal.itemId).count, 1);
        const sold = tables.read().ledger.find(entry => entry.type === 'sell');
        assert.equal(sold.payload.count, 2);
        assert.equal(sold.payload.junk, true);
        assert.equal(normalizeLedgerEntry(sold).ok, true);
        for (const count of [0, -1, 1.5, '2', null]) {
            assert.equal(normalizeLedgerEntry({ ...sold, payload: { ...sold.payload, count } }).ok, false);
        }
        for (const payload of [{ gearId: 'gear-probe', junk: true }, { lootId: 'loot-probe', junk: true }]) {
            assert.equal(normalizeLedgerEntry({ ...sold, payload }).ok, false, '不支持的卖出目标不能静默丢弃 junk');
        }
        const snapshot = await ledger.read();
        const legacy = { ...snapshot, entries: snapshot.entries.map(entry => clone(entry)) };
        delete legacy.entries.find(entry => entry.id === sold.id).payload.count;
        const legacyState = computeEffectiveState(legacy, chat, { userName: '主角', heroInventory: heroInventoryView(inventory.read()) });
        assert.equal(legacyState.ok, true);
        assert.equal(heroOf(legacyState).points, heroView.points - price, '旧 sell 缺 count 按单件重放');
        sale = new Promise(resolve => { saleFinished = resolve; });
        dom.window.document.querySelector('[data-record-act="sell"]').click();
        assert.equal(modalOf().querySelector('input').max, '2', '回读后上限变为剩余数量');
        setQuantity(modalOf(), 2);
        modalOf().querySelector('[data-igs-modal="ok"]').click();
        const full = await sale;
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(full.ok, true, JSON.stringify(full));
        assert.equal(full.price, price * 2);
        assert.deepEqual(soldCounts, [2, 2]);
        assert.equal(heroView.collection.some(item => item.itemId === junk.itemId), false);
        assert.equal(inventory.read().inventory.items.some(item => item.name === junk.name), false, '全量回收删除物品表行');
        assert.equal(inventory.read().gear.rows.some(item => item.name === junk.name), false, '全量回收删除装配定义');
        assert.equal([...dom.window.document.querySelectorAll('.igs-record-slot-name')].some(node => node.textContent === junk.name), false, 'UI 回读移除耗尽物品');
        assert.equal(heroView.points - beforePoints, price * 4);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, heroView.points, '重新重放积分不重复增加');
        const ring = { gearId: gearIdFor('回收铜戒'), name: '回收铜戒', slot: 'accessory', rarity: 'rare', bonus: { ability: 'con', amount: 3 } };
        assert.equal((await ledger.grantInitialGear('pc-hero', [ring], { anchor: { messageId: chat.length - 1, swipeId: 0 } })).ok, true);
        assert.equal((await inventory.changeQuantities({ name: ring.name, delta: 3, category: '装备' })).ok, true);
        const gearPrice = sellPrice(ring.rarity, ring.gearId);
        const beforeGear = tables.read().ledger.length;
        assert.equal((await services.sellHeroItem('gear', ring.gearId, 4)).reason, 'combat-sell-count-insufficient', '穿戴件不计入上限');
        assert.equal(tables.read().ledger.length, beforeGear);
        const spares = await services.sellHeroItem('gear', ring.gearId, 3);
        assert.equal(spares.ok, true, JSON.stringify(spares));
        assert.equal(spares.price, gearPrice * 3);
        assert.equal(inventory.read().inventory.items.find(item => item.name === ring.name)?.quantity, 1);
        assert.ok(inventory.read().gear.rows.some(item => item.name === ring.name), '保留穿戴件的定义');
        heroView = heroOf(await ledger.effectiveState({ raw: true }));
        assert.ok(equippedGear(heroView.gear.slots).some(item => item.gearId === ring.gearId));
        assert.equal((await services.sellHeroItem('gear', ring.gearId)).reason, 'combat-gear-equipped');
        assert.equal((await ledger.setGear('pc-hero', ring.gearId, false)).ok, true);
        const lastGear = await services.sellHeroItem('gear', ring.gearId);
        assert.equal(lastGear.ok, true, JSON.stringify(lastGear));
        assert.equal(lastGear.price, gearPrice, '省略数量仍回收一件');
        assert.equal(inventory.read().inventory.items.some(item => item.name === ring.name), false);
        assert.equal(inventory.read().gear.rows.some(item => item.name === ring.name), false);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points - beforePoints, price * 4 + gearPrice * 4);
        const originalDelete = db.api.deleteRow;
        const gearTableName = inventory.read().gear.name;
        const normalBefore = inventory.read();
        const pointsBeforeFailure = heroOf(await ledger.effectiveState({ raw: true })).points;
        let cleanupAttempts = 0;
        db.api.deleteRow = function (first, second) {
            const tableName = first && typeof first === 'object' ? first.tableName : first;
            if (tableName === gearTableName) { cleanupAttempts += 1; return false; }
            return originalDelete.call(this, first, second);
        };
        t.after(() => { db.api.deleteRow = originalDelete; });
        const cleanupFailed = await services.sellHeroItem('keepsake', normal.itemId);
        assert.equal(cleanupFailed.ok, false, JSON.stringify(cleanupFailed));
        assert.ok(cleanupAttempts > 0, '通过真实装配表删除写口注入失败');
        assert.equal(cleanupFailed.stock[0].restored, true);
        assert.equal(cleanupFailed.stock[0].revoked, true);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, pointsBeforeFailure, '失败回收撤销积分');
        const normalAfter = inventory.read();
        const stockOf = snapshot => snapshot.inventory.items.find(item => item.name === normal.name);
        assert.deepEqual(
            [stockOf(normalAfter)?.quantity, stockOf(normalAfter)?.description, stockOf(normalAfter)?.category],
            [stockOf(normalBefore)?.quantity, stockOf(normalBefore)?.description, stockOf(normalBefore)?.category],
            '定义删除失败后恢复物品数量与文本字段',
        );
        assert.deepEqual(normalAfter.gear.rows.find(item => item.name === normal.name)?.definition,
            normalBefore.gear.rows.find(item => item.name === normal.name)?.definition);
        db.api.deleteRow = originalDelete;
        const unverifiedLedger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7,
            inventory: { ...inventory, async setGearRow(name, record) {
                const result = await inventory.setGearRow(name, record);
                return record === null && result.ok ? { ok: false, reason: 'gear-write-unverified' } : result;
            } },
        });
        const unverified = await unverifiedLedger.sellKeepsake(normal.itemId);
        assert.equal(unverified.ok, false, JSON.stringify(unverified));
        assert.equal(unverified.stock[0].restored, true, '删除已执行但回执未确认时恢复原定义');
        assert.equal(unverified.stock[0].revoked, true);
        assert.equal(stockOf(inventory.read())?.quantity, stockOf(normalBefore)?.quantity);
        assert.deepEqual(inventory.read().gear.rows.find(item => item.name === normal.name)?.definition,
            normalBefore.gear.rows.find(item => item.name === normal.name)?.definition);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, pointsBeforeFailure);
        const rollbackLedger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7,
            inventory: {
                ...inventory,
                setGearRow: (name, record) => record === null
                    ? Promise.resolve({ ok: false, reason: 'gear-write-failed' }) : inventory.setGearRow(name, record),
                changeQuantities: changes => (Array.isArray(changes) ? changes : [changes]).some(change => change.delta > 0)
                    ? Promise.resolve({ ok: false, reason: 'inventory-write-failed', applied: [] }) : inventory.changeQuantities(changes),
            },
        });
        const rollbackFailed = await rollbackLedger.sellKeepsake(normal.itemId);
        assert.equal(rollbackFailed.ok, false, JSON.stringify(rollbackFailed));
        assert.equal(rollbackFailed.reason, 'combat-sell-rollback-failed', '补偿失败不得报回收成功');
        assert.equal(rollbackFailed.stock[0].restored, false);
        assert.equal(rollbackFailed.stock[0].revoked, true);
        assert.equal(stockOf(inventory.read()), undefined);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, pointsBeforeFailure);
        const originalStock = stockOf(normalBefore);
        assert.equal((await inventory.changeQuantities({
            name: originalStock.name, delta: originalStock.quantity,
            description: originalStock.description, category: originalStock.category,
        })).ok, true, '故障解除后显式恢复受影响的测试库存');
        assert.equal(stockOf(inventory.read())?.quantity, originalStock.quantity);
        const retried = await services.sellHeroItem('keepsake', normal.itemId);
        assert.equal(retried.ok, true, JSON.stringify(retried));
        const normalPrice = sellPrice(normal.rarity, normal.itemId);
        assert.equal(retried.price, normalPrice);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, pointsBeforeFailure + normalPrice, '重试只结算一次');
        assert.equal(inventory.read().inventory.items.some(item => item.name === normal.name), false);
        assert.equal(inventory.read().gear.rows.some(item => item.name === normal.name), false);
    }
});

test('奖励失血事实（v6 G5f-4f）：实际扣血累计、回血不抵销、写时复制与重放隔离；旧 setup 保持未知', async () => {
    const { buildCombatReport, reportHpLostOf } = await import('../src/combat/report.js');
    const card = { id: 'loss-probe', name: '浴血归元', type: 'attack', rarity: 'common', cost: 0,
        effects: [{ op: 'self-damage', amount: 3 }, { op: 'heal', amount: 3, target: 'self' }, dmg(6)] };
    const setup = { rulesVersion: 6, trackHpLoss: true, controlledId: 'hero', rewardOwner: 'hero',
        units: [hero(Array(5).fill(card.id), { speed: 100, catalog: { [card.id]: card } }), foe()] };
    const created = createBattle(setup, SEED);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    const before = clone(created.state);
    const action = legalActions(created.state).find(item => item.type === 'play');
    assert.ok(action);
    const played = applyAction(created.state, action);
    assert.equal(played.ok, true, JSON.stringify(played.error));
    assert.equal(played.state.hpLost.hero, 3, '回血不能把本场失血抹掉');
    assert.equal(played.state.hpLost.foe, 6);
    assert.equal(played.state.units.hero.hp, 50);
    assert.deepEqual(created.state, before, '新动作不能改动之前的状态');
    assert.deepEqual(replayBattle(setup, SEED, [action]).state, played.state);
    const finished = { ...played.state, outcome: 'victory' };
    const report = buildCombatReport({ combatId: 'loss-fact', state: finished, events: [...created.events, ...played.events] });
    assert.equal(report.hpLost, 3);
    assert.equal(reportHpLostOf(report.text), 3);
    assert.equal(reportHpLostOf('<igs-combat-report hp-lost="0" result="win">'), 0);
    for (const value of ['-1', 'NaN', '1.5', '9007199254740992']) assert.equal(reportHpLostOf(`<igs-combat-report hp-lost="${value}">`), null);
    for (const rulesVersion of [3, 4, 5, 6]) {
        const oldSetup = { ...setup, rulesVersion };
        delete oldSetup.trackHpLoss;
        delete oldSetup.rewardOwner;
        const old = createBattle(oldSetup, SEED);
        assert.equal(old.ok, true);
        assert.equal(Object.hasOwn(old.state, 'hpLost'), false);
        const oldReport = buildCombatReport({ combatId: 'old-loss', state: { ...old.state, outcome: 'victory' }, events: old.events });
        assert.equal(Object.hasOwn(oldReport, 'hpLost'), false);
        assert.equal(reportHpLostOf(oldReport.text), null);
    }
    const blocked = createBattle({ rulesVersion: 6, trackHpLoss: true, controlledId: 'hero',
        units: [hero(filler, { speed: 100, passives: [{ id: 'shield', name: '护盾', trigger: 'battle-start', effects: [{ op: 'block', amount: 50 }] }] }), foe({ skills: [claw(6)] })] }, SEED);
    assert.equal(blocked.ok, true, JSON.stringify(blocked.error));
    const ended = applyAction(blocked.state, { type: 'end-turn' });
    assert.equal(ended.ok, true);
    assert.equal(ended.state.hpLost.hero || 0, 0, '被格挡的伤害不算失血');
});


test('奖励遗物（v6 G5f-4f）：加槽封顶四、四候选带合法刻印、无伤升级按战报兑现到新副本，积分抽卡仍为三候选', async () => {
    const { assembleReward } = await import('../src/combat/generation-assembly.js');
    const { templatesFor } = await import('../src/combat/card-templates.js');
    const { planCardDraw } = await import('../src/combat/rewards.js');
    const { fixedCard } = await import('../src/combat/fixed-cards/index.js');
    const { attachLoot, reportIdFor } = await import('../src/combat/report.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const { settleRewardOffer, rewardCardMarks } = await import('../src/combat/reward-cards.js');
    const { inscribable } = await import('../src/combat/mechanics/inscription.js');
    const { emptyPick, flipCard, chooseCard, pickCardChoice, normalizePick, lootOf } = await import('../src/combat/flip.js');
    const refs = ['rl-r-20', 'rl-s-06', 'rl-s-12', 'rl-s-23'].map(relicId => ({ relicId, model: 'original' }));
    const character = { kind: 'deck-character', id: 'pc-hero', classProfile: { archetype: 'warrior' }, owned: new Map(), traits: refs.map(relic => ({ relic })) };
    const plan = planRewardSlots({ combatId: 'g5f-reward', tier: 'normal', character, candidates: true });
    assert.deepEqual(planRewardSlots({ combatId: 'g5f-reward', tier: 'normal', character, candidates: true }), plan);
    assert.equal(plan.slots.length, 4);
    assert.equal(plan.reserve.length, 4);
    assert.equal(plan.slots[3].kind, 'card');
    assert.equal(plan.slots[3].fixedIds.length, 3);
    assert.equal(planRewardSlots({ combatId: 'g5f-reward', tier: 'normal', character, candidates: true, links: { reflip: true } }).slots.length, 4);
    assert.equal(planRewardSlots({ combatId: 'g5f-reward', tier: 'elite', character, candidates: true }).slots.length, 3, '普通战限定的加槽不应用于精英');
    const morning = { ...character, traits: [{ relic: { relicId: 'rl-r-32', model: 'original' } }] };
    const elite = planRewardSlots({ combatId: 'g5f-morning', tier: 'elite', character: morning, candidates: true });
    assert.deepEqual([elite.slots.length, elite.slots[3].kind, elite.slots[3].rarity], [4, 'card', 'rare']);
    assert.equal(planRewardSlots({ combatId: 'g5f-morning', tier: 'boss', character: morning, candidates: true }).slots.length, 3);
    const draw = planCardDraw(character);
    assert.equal(draw.fixedIds.length, 2, '奖励遗物不改变积分抽卡协议');
    let slot;
    for (const key of Object.keys(templatesFor('warrior'))) {
        const built = assembleReward({ slots: [['裂空斩', key, '历练所得']] }, { key: 'reward-probe', input: { seed: plan.seed, slots: [plan.slots[3]] } });
        if (!built.errors) { slot = built.value.slots[0]; break; }
    }
    assert.ok(slot, '奖励槽可由本职业模板装配');
    assert.equal(slot.choices.length, 4);
    assert.equal(slot.choices[plan.slots[3].randomAt].id, slot.card.id);
    assert.equal(slot.marks.filter(mark => mark.inscription).length, 1);
    for (const [i, mark] of slot.marks.entries()) if (mark.inscription) assert.equal(inscribable(slot.choices[i], mark.inscription), true);
    const fillerSlot = index => ({ index, kind: 'keepsake', rarity: 'common', name: `杂物${index}`, origin: '' });
    const slots = [0, 1, 2].map(fillerSlot).concat(slot);
    const offer = { combatId: 'g5f-reward', tier: 'normal', exp: 10, reveal: 0, slots, reserve: clone(slots), flipRelics: refs };
    const snapshot = clone(offer);
    const settled = settleRewardOffer(offer, 0);
    assert.ok(settled.slots[3].marks.every((mark, i) => mark.upgraded === !!slot.choices[i].upgraded));
    assert.deepEqual(offer, snapshot, '结算不改动预生成奖励单');
    for (const hpLost of [null, 1]) assert.equal(settleRewardOffer(offer, hpLost).slots[3].marks.some(mark => mark.upgraded), false);
    const position = flipOrder(offer, 'main').indexOf(3);
    let pick = flipCard(offer, emptyPick(), position).pick;
    pick = flipCard(offer, pick, (position + 1) % 4).pick;
    pick = chooseCard(offer, pick, position).pick;
    pick = pickCardChoice(offer, pick, 3).pick;
    assert.deepEqual(normalizePick(pick, offer), pick);
    assert.equal(lootOf(offer, pick).pick, 3);
    assert.equal(pickCardChoice(offer, pick, 4).ok, false);
    const oldOffer = { ...offer, slots: slots.map(item => item.kind === 'card' ? { ...item, choices: item.choices.slice(0, 3), marks: item.marks.slice(0, 3) } : item) };
    assert.equal(normalizePick(pick, oldOffer), null, '旧三候选仍拒绝越界位置');

    const at = (type, messageId, occurrence, payload, tagHash = 'trait') => {
        const anchor = { messageId, swipeId: 0, occurrence, tagHash };
        return { id: ledgerEntryId(type, 'pc-hero', anchor), type, character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    for (const hpLost of [0, 3, null]) for (const index of [plan.slots[3].randomAt, ...slot.choices.map((_, i) => i).filter(i => i !== plan.slots[3].randomAt).slice(0, 1), slot.marks.findIndex(mark => mark.inscription)]) {
        const env = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('特性'), ai('备战'), user('待发战报')]);
        const traits = refs.map((relic, i) => at('trait', 0, i * 3, { traitId: `reward-tr-${i}`, name: '奖励特性', kind: 'passive', rarity: 'rare', relic, cost: 100 }));
        await env.tables.append('ledger', [traits[0], at('trait-pick', 0, 1, { traitId: 'reward-tr-0', drop: 'pp-pc-hero' }), traits[1], at('trait-pick', 0, 4, { traitId: 'reward-tr-1', drop: 'pc-hero-h0' }), at('trait-slot', 0, 5, { slot: 3, cost: 500 }), traits[2], at('trait-slot', 0, 8, { slot: 4, cost: 1000 }), traits[3]]);
        const before = heroOf(await env.ledger.effectiveState());
        assert.equal(before.traits.length, 4);
        const offered = await env.ledger.append([at('offer', 1, 0, offer, 'offer')]);
        assert.equal(offered.ok, true, JSON.stringify(offered));
        const reportId = reportIdFor(offer.combatId);
        env.ref.chat[2] = user(attachLoot(`<igs-combat-report id="${reportId}" result="win"${hpLost === null ? '' : ` hp-lost="${hpLost}"`}>获胜</igs-combat-report>`, { character: '主角', reportId, index: 3, set: 'main', slot: settled.slots[3], pick: index }));
        const scanned = await env.ledger.scan();
        assert.equal(scanned.ok, true, JSON.stringify(scanned));
        assert.equal(scanned.entries.filter(entry => entry.type === 'loot').length, 1, JSON.stringify(scanned.diagnostics));
        let state = await env.ledger.effectiveState();
        assert.deepEqual(state.diagnostics, []);
        const after = heroOf(state);
        const gained = after.deckEntries.find(entry => entry.copyId.startsWith('loot|'));
        assert.ok(gained);
        const expected = rewardCardMarks(slot, index, hpLost);
        assert.equal(gained.upgraded, expected.upgraded === true);
        assert.equal(gained.inscription || null, expected.inscription || null);
        assert.equal(after.deck.length, before.deck.length + 1);
        assert.deepEqual(heroOf(await env.ledger.effectiveState()), after, '重复读取不重复发放');
        env.ref.chat[2].swipe_id = 1;
        assert.equal(heroOf(await env.ledger.effectiveState()).deck.length, before.deck.length);
        env.ref.chat[2].swipe_id = 0;
        assert.equal(heroOf(await env.ledger.effectiveState()).deck.length, before.deck.length + 1);
    }
    const invalid = at('offer', 0, 0, { ...offer, slots: [...slots.slice(0, 3), { ...slot, marks: [{ inscription: 'not-a-key' }, {}, {}, {}] }] }, 'offer');
    assert.equal(normalizeLedgerEntry(invalid).ok, false);
    assert.ok(fixedCard(draw.fixedIds[0]));
});

test('奖励周期（v6 G5f-4f）：只累计持有期间的新普通胜利，弱敌和历史未知不推进，换下保留余数，回退重算', async () => {
    const relic = { relicId: 'rl-u-08', model: 'original' };
    const key = 'rl-u-08:original';
    const battle = (id, known = true, weak = false) => user(`<igs-combat-report id="${id}" result="win"${known ? ' hp-lost="0"' : ''}${weak ? ' weak="1"' : ''}>胜利</igs-combat-report>\n[igs-combat:exp|主角|10|战斗:${id}]`);
    const env = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [
        battle('before-held'), ai('装上糖果'), battle('candy-first'), battle('weak-candy', true, true),
        battle('candy-first'), battle('old-candy', false), ai('换下糖果'), battle('without-candy'), ai('装回糖果'), battle('candy-second'),
    ]);
    const at = (type, messageId, occurrence, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: 'trait', occurrence };
        return { id: ledgerEntryId(type, 'pc-hero', anchor), type, character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const trait = (id, ref) => ({ traitId: id, name: id, kind: 'passive', rarity: 'rare', relic: ref, cost: 100 });
    await env.tables.append('ledger', [at('trait', 1, 0, trait('candy', relic)), at('trait-pick', 1, 1, { traitId: 'candy', drop: 'pp-pc-hero' })]);
    const read = async () => heroOf(await env.ledger.effectiveState());
    const candidateCount = me => {
        for (let i = 0; i < 100; i += 1) {
            const slot = planRewardSlots({ combatId: `candy-count-${i}`, tier: 'normal', character: me, candidates: true }).slots.find(item => item.kind === 'card' && item.fixedIds);
            if (slot) return slot.fixedIds.length + 1;
        }
        assert.fail('应有可检查的卡牌奖励槽');
    };
    assert.equal(candidateCount(await read()), 3, '首次胜利前不加候选');
    assert.equal((await env.ledger.scan({ messageIds: [0, 2, 3, 4, 5] })).ok, true);
    assert.equal((await read()).flipWins[key], 1, '持有前、弱敌、重复战报与缺失血事实都不推进');
    assert.equal(candidateCount(await read()), 4, '第二场普通胜利的预生成候选加一');
    assert.equal((await env.ledger.scan({ messageIds: [0, 2, 3, 4, 5] })).ok, true);
    assert.equal((await read()).flipWins[key], 1, '补扫不重复累计');
    await env.tables.append('ledger', [
        at('trait', 6, 0, trait('other-flip', { relicId: 'rl-s-12', model: 'original' })),
        at('trait-pick', 6, 1, { traitId: 'other-flip', drop: 'candy' }),
    ]);
    assert.equal((await env.ledger.scan({ messageIds: [7] })).ok, true);
    assert.equal((await read()).flipWins[key], 1);
    assert.equal(candidateCount(await read()), 3, '没有装上时不增加候选');
    await env.tables.append('ledger', [at('trait', 8, 0, trait('candy-again', relic)), at('trait-pick', 8, 1, { traitId: 'candy-again', drop: 'other-flip' })]);
    assert.equal(candidateCount(await read()), 4, '重新装上继承此前余数');
    assert.equal((await env.ledger.scan({ messageIds: [9] })).ok, true);
    assert.equal((await read()).flipWins[key], 2);
    assert.equal(candidateCount(await read()), 3);
    env.ref.chat[9].swipe_id = 1;
    assert.equal((await read()).flipWins[key], 1);
    assert.equal(candidateCount(await read()), 4);
    env.ref.chat[9].swipe_id = 0;
    assert.equal((await read()).flipWins[key], 2);
    assert.deepEqual((await env.ledger.effectiveState()).diagnostics, []);
});

test('奖励恢复（v6 G5f-4f）：刷新重放、聊天结果与发件箱恢复都保留失血事实及四候选标记', async t => {
    const { createCombatSession, locateCombatStart, sessionKeyFor, outboxKeyFor } = await import('../src/combat/session.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const { reportHpLostOf } = await import('../src/combat/report.js');
    const chat = [user('出发'), ai('前方出现敌人。\n[igs-combat:start|史莱姆|草原]')];
    const located = locateCombatStart(chat, 1);
    assert.equal(located.ok, true);
    const probe = { id: 'restore-probe', name: '归元斩', type: 'attack', rarity: 'common', cost: 0,
        effects: [{ op: 'self-damage', amount: 3 }, { op: 'heal', amount: 3, target: 'self' }, dmg(6)] };
    const setup = { rulesVersion: 6, trackHpLoss: true, controlledId: 'hero', rewardOwner: 'hero',
        units: [hero(Array(5).fill(probe.id), { speed: 100, catalog: { [probe.id]: probe } }), foe({ maxHp: 7 })] };
    const record = { v: 1, combatId: located.combatId, anchor: located.anchor, seed: seedFor(located.combatId), setup, actions: [], encounter: '草原', tiers: ['normal'], expTargets: ['我'] };
    const candidates = [0, 1, 2, 3].map(i => ({ id: `restore-${i}`, name: `候选${i}`, type: 'attack', rarity: 'common', cost: 1,
        effects: [dmg(6)], upgraded: { effects: [dmg(8)] } }));
    const slot = { index: 0, kind: 'card', rarity: 'common', name: '领悟', origin: '', card: candidates[0], choices: candidates, upgradeNoDamage: true, marks: [{ inscription: 'sharp' }, {}, {}, {}] };
    const offer = { combatId: located.combatId, character: 'hero', slots: [slot, ...[1, 2].map(index => ({ index, kind: 'keepsake', rarity: 'common', name: `杂物${index}`, origin: '' }))], reveal: 0 };
    const ledger = { effectiveState: async () => ({ ok: true, offers: new Map([[located.combatId, offer]]), attributes: {}, characters: new Map(), classes: new Map() }),
        append: async () => ({ ok: true }), scan: async () => ({ ok: true }) };
    const results = new Map();
    const chatRecord = { read: () => ({ ok: true, value: clone(results.get(located.combatId) || null) }),
        write: async (_anchor, combatId, patch) => { results.set(combatId, { ...(results.get(combatId) || {}), ...clone(patch) }); return { ok: true }; } };
    const storage = createCountingStorage({ [sessionKeyFor('restore')]: JSON.stringify(record) });
    const open = (recordStore = chatRecord, targetStorage = storage) => {
        const session = createCombatSession({ ledger, tables: {}, storage: targetStorage, chat, chatRecord: recordStore,
            getChatId: () => 'restore', userName: '我', send: async () => ({ ok: false, reason: 'offline' }), now: () => 7 });
        t.after(() => session.dispose());
        assert.equal(session.resume().ok, true);
        return session;
    };
    const session = open();
    assert.equal(session.act(session.state().legal.find(action => action.type === 'play')).ok, true);
    session.flushPersist();
    const mid = open();
    assert.equal(mid.state().battle.hpLost.hero, 3);
    assert.equal(mid.state().battle.units.hero.hp, 50);
    assert.equal(mid.act(mid.state().legal.find(action => action.type === 'play')).ok, true);
    assert.equal(mid.state().battle.outcome, 'victory');
    assert.equal((await mid.loadFlip()).ok, true);
    const pos = flipOrder(offer, 'main').indexOf(0);
    assert.equal((await mid.flip(pos)).ok, true);
    assert.equal((await mid.pickCard(3)).ok, true);
    const chosen = mid.state().flip.cards.find(item => item.chosen).slot;
    assert.equal(chosen.choices.length, 4);
    assert.equal(chosen.marks.some(mark => mark.upgraded), false, '回血后的失血仍阻止无伤升级');
    const failed = await mid.finish();
    assert.equal(failed.reason, 'combat-report-send-failed');
    const outbox = JSON.parse(storage.getItem(outboxKeyFor('restore')))[located.combatId];
    assert.equal(outbox.hpLost, 6);
    assert.equal(reportHpLostOf(outbox.text), 6);
    assert.ok(outbox.text.includes('|0|main|3]'));
    const fromChat = open();
    assert.equal(fromChat.state().status, 'send-failed');
    assert.equal(fromChat.state().report.hpLost, 6);
    assert.equal((await fromChat.loadFlip()).ok, true);
    assert.equal(fromChat.state().flip.card, 3);
    assert.deepEqual(fromChat.state().flip.cards.find(item => item.chosen).slot, chosen);
    const withoutResult = { read: () => ({ ok: true, value: { flip: results.get(located.combatId).flip } }), write: async () => ({ ok: true }) };
    const fromOutbox = open(withoutResult);
    assert.equal(fromOutbox.state().report.hpLost, 6);
    assert.equal((await fromOutbox.loadFlip()).ok, true);
    assert.equal(fromOutbox.state().flip.card, 3);
    assert.deepEqual(fromOutbox.state().flip.cards.find(item => item.chosen).slot, chosen);
    for (const hpLost of [0, null]) {
        const text = `<igs-combat-report id="${outbox.reportId}" result="win"${hpLost === null ? '' : ' hp-lost="0"'}>获胜</igs-combat-report>`;
        const persisted = { ...outbox, text };
        delete persisted.hpLost;
        const restoredStorage = createCountingStorage({ [sessionKeyFor('restore')]: JSON.stringify(record), [outboxKeyFor('restore')]: JSON.stringify({ [located.combatId]: persisted }) });
        const restored = open(withoutResult, restoredStorage);
        assert.equal((await restored.loadFlip()).ok, true);
        const restoredSlot = restored.state().flip.cards.find(item => item.chosen).slot;
        assert.equal(restoredSlot.marks.every(mark => mark.upgraded === true), hpLost === 0, '旧战报未知失血不当作零');
        assert.equal(restoredSlot.marks[0].inscription, 'sharp');
    }
});

test('奖励快照（v6 G5f-4f）：公开装上特性后同楼备战，出单后换下不改原奖励，回退安装则奖励失效', async t => {
    const { createCombatSession, locateCombatStart } = await import('../src/combat/session.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { createCombatChatRecord } = await import('../src/host/combat-chat-record.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: db.api });
    assert.equal((await tables.ensure()).ok, true);
    const enemy = { ...templateEnemy('狼', 'normal'), skills: [{ ...idle, id: 'wait-a' }, { ...idle, id: 'wait-b' }] };
    assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2), row(enemy, 3)])).ok, true);
    const chat = [ai('[igs-combat:start|林间交战|狼]')];
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', wallet: () => 10000, now: () => 7 });
    const trait = (id, relicId) => ({ traitId: id, name: id, kind: 'passive', rarity: 'rare', relic: { relicId, model: 'original' } });
    assert.equal((await ledger.drawTrait('pc-hero', trait('same-floor-extra', 'rl-r-20'))).ok, true);
    assert.equal((await ledger.pickTrait('pc-hero', 'same-floor-extra', 'pp-pc-hero')).ok, true);
    const chatRecord = createCombatChatRecord({ SillyTavern: { getContext: () => ({ chat, saveChat: async () => {} }) } });
    const session = createCombatSession({ ledger, tables, storage: createCountingStorage(), chatRecord, chat: () => chat,
        getChatId: () => 'g5f-same-floor', userName: '主角', now: () => 7, retryDelays: [], llm: { source: 'tavern' },
        request: async prompt => JSON.stringify({ entities: JSON.parse(prompt.user).entities.map(entity => ({ key: entity.key,
            value: entity.kind === 'encounter-theme' ? { theme: 'western' }
                : Object.fromEntries(['slots', 'reserve'].map(set => [set, (entity.input[set] || []).map((slot, i) => [
                    `旧物${set}${i}`, slot.kind === 'item' ? 'potion' : slot.kind === 'card' ? (slot.cost === 0 ? 'jab' : 'strike')
                        : slot.kind === 'gear' ? (slot.templates?.[0] || 'opening-guard') : null, '林间所得',
                ])])),
        })) }),
    });
    t.after(() => { session.dispose(); tables.client.dispose(); });
    assert.equal((await session.prepare(0)).ok, true);
    const combatId = locateCombatStart(chat, 0).combatId;
    let state = await ledger.effectiveState();
    const offer = clone(state.offers.get(combatId));
    assert.ok(offer, JSON.stringify(state.diagnostics));
    assert.equal(offer.afterPanel, 2);
    assert.equal(offer.slots.length, 4);
    assert.equal(offer.slots[3].kind, 'card');
    assert.deepEqual(offer.flipRelics, [{ relicId: 'rl-r-20', model: 'original' }]);
    assert.equal((await ledger.drawTrait('pc-hero', trait('same-floor-other', 'rl-s-12'))).ok, true);
    assert.equal((await ledger.pickTrait('pc-hero', 'same-floor-other', 'same-floor-extra')).ok, true);
    state = await ledger.effectiveState();
    assert.equal(heroOf(state).traits.some(item => item.traitId === 'same-floor-extra'), false);
    assert.deepEqual(state.offers.get(combatId), offer, '出单后的面板记录不能穿越快照边界');
    assert.deepEqual(state.diagnostics, []);
    const snapshot = await ledger.read();
    const installed = [...snapshot.entries].find(entry => entry.type === 'trait-pick' && entry.payload.traitId === 'same-floor-extra');
    const revoke = { id: `revoke|${installed.id}`, type: 'revoke', character: 'pc-hero', anchor: installed.anchor,
        payload: { targetEntryId: installed.id }, createdAt: 8 };
    assert.equal((await ledger.append([revoke])).ok, true);
    state = await ledger.effectiveState();
    assert.equal(state.offers.has(combatId), false, '原安装失效时快照校验仍拒绝奖励');
    assert.ok(state.diagnostics.some(item => item.code === 'combat-offer-relic-not-held'));
});

test('奖励候选耗尽（v6 G5f-4f）：回退单随机卡仍保留无伤升级与刻印并落到新增副本', async () => {
    const { fixedClassPool } = await import('../src/combat/fixed-cards/index.js');
    const { cardCopyLimit } = await import('../src/combat/rules.js');
    const { assembleReward } = await import('../src/combat/generation-assembly.js');
    const { templatesFor } = await import('../src/combat/card-templates.js');
    const { attachLoot, reportIdFor } = await import('../src/combat/report.js');
    const { inscribable } = await import('../src/combat/mechanics/inscription.js');
    const refs = ['rl-r-20', 'rl-s-12', 'rl-s-23'].map(relicId => ({ relicId, model: 'original' }));
    const env = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('持有特性')]);
    const ledger = createCombatLedger({ tables: env.tables, chat: () => env.ref.chat, userName: '主角', wallet: () => 10000, now: () => 7 });
    for (const [i, relic] of refs.entries()) {
        if (i === 2) assert.equal((await ledger.unlockTraitSlot('pc-hero', 3)).ok, true);
        const traitId = `exhausted-${i}`;
        assert.equal((await ledger.drawTrait('pc-hero', { traitId, name: '奖励特性', kind: 'passive', rarity: 'rare', relic })).ok, true);
        if (i < 2) assert.equal((await ledger.pickTrait('pc-hero', traitId, i === 0 ? 'pp-pc-hero' : 'pc-hero-h0')).ok, true);
    }
    const before = heroOf(await ledger.effectiveState());
    env.ref.chat.push(ai('备战'), user('待发战报'));
    const character = { ...before, owned: new Map(fixedClassPool('warrior').map(card => [card.id, cardCopyLimit(card.rarity)])) };
    const plan = planRewardSlots({ combatId: 'exhausted-reward', tier: 'normal', character, candidates: true });
    const planned = plan.slots[3];
    assert.equal(planned.fixedIds, undefined, '固定池耗尽按既有契约回退单卡');
    assert.equal(planned.upgradeNoDamage, true);
    assert.equal(planned.inscribe, 1);
    let slot;
    for (const key of Object.keys(templatesFor('warrior'))) {
        const built = assembleReward({ slots: [['余烬斩', key, '战后领悟']] }, { key: 'exhausted', input: { seed: plan.seed, slots: [planned] } });
        if (!built.errors && built.value.slots[0].card.upgraded) { slot = built.value.slots[0]; break; }
    }
    assert.ok(slot, '单随机卡具有升级形态');
    assert.equal(slot.choices, undefined);
    assert.equal(slot.marks.length, 1);
    assert.ok(inscribable(slot.card, slot.marks[0].inscription));
    const slots = [0, 1, 2].map(index => ({ index, kind: 'keepsake', rarity: 'common', name: `杂物${index}`, origin: '' })).concat(slot);
    const anchor = { messageId: 1, swipeId: 0, tagHash: 'offer', occurrence: 0 };
    assert.equal((await ledger.append([{ id: ledgerEntryId('offer', 'pc-hero', anchor), type: 'offer', character: 'pc-hero', anchor,
        payload: { combatId: plan.seed, tier: 'normal', exp: 10, reveal: 0, slots, flipRelics: refs }, createdAt: 7 }])).ok, true);
    const reportId = reportIdFor(plan.seed);
    env.ref.chat[2] = user(attachLoot(`<igs-combat-report id="${reportId}" result="win" hp-lost="0">胜利</igs-combat-report>`, {
        character: '主角', reportId, index: 3, set: 'main', slot,
    }));
    const scanned = await ledger.scan();
    assert.equal(scanned.ok, true, JSON.stringify(scanned));
    const state = await ledger.effectiveState();
    assert.deepEqual(state.diagnostics, []);
    const copy = heroOf(state).deckEntries.find(entry => entry.copyId.startsWith('loot|'));
    assert.ok(copy, JSON.stringify(scanned.diagnostics));
    assert.equal(copy.upgraded, true);
    assert.equal(copy.inscription, slot.marks[0].inscription);
    assert.equal(heroOf(state).deck.length, before.deck.length + 1);
});

test('职业固定被动（v6 G6）：八职业三阶结构合法，新档案忽略模型被动，旧档案不补标记', async () => {
    const { CLASS_PASSIVES, fixedClassPassive } = await import('../src/combat/class-passives.js');
    const { normalizeProfile } = await import('../src/combat/schema.js');
    const { assembleClass } = await import('../src/combat/generation-assembly.js');
    assert.equal(Object.keys(CLASS_PASSIVES).length, 8);
    for (const archetype of Object.keys(COMBAT_RULES.archetypes)) {
        for (const tier of [1, 2, 3]) {
            const classPassive = fixedClassPassive(archetype, tier, 'fixed-p');
            const checked = normalizeProfile({ ...classDef('cls-blade'), archetype, classPassive, classPassiveVersion: 1 });
            assert.equal(checked.ok, true, `${archetype}/${tier}: ${JSON.stringify(checked.errors)}`);
        }
        const raw = { className: '测试职业', archetype, passive: { effects: [{ op: 'energy', amount: 999 }] } };
        const built = assembleClass(raw, { key: archetype });
        assert.equal(built.errors, undefined, JSON.stringify(built.errors));
        assert.deepEqual(built.profile.classPool, []);
        assert.equal(normalizeProfile(built.profile).ok, true);
        assert.deepEqual(assembleClass({ ...raw, cards: [['过时牌', 'invalid']] }, { key: archetype }).profile, built.profile);
        assert.equal(built.profile.classPassiveVersion, 1);
        assert.deepEqual(built.profile.classPassive, fixedClassPassive(archetype, 1, `${built.profile.id}-p1`));
        delete raw.passive;
        assert.deepEqual(assembleClass(raw, { key: archetype }).profile, built.profile);
    }
    const old = normalizeProfile(classDef('cls-blade'));
    assert.equal(old.ok, true);
    assert.equal(Object.hasOwn(old.value, 'classPassiveVersion'), false);
    assert.equal(old.value.classPassive.name, '锋锐');
    assert.equal(normalizeProfile({ ...classDef('cls-blade'), classPassiveVersion: 2 }).ok, false);
    assert.equal(fixedClassPassive('unknown'), null);
    assert.equal(fixedClassPassive('mage', 4), null);
    const copy = fixedClassPassive('mage', 2);
    copy.effects[1].amount = 1;
    assert.equal(fixedClassPassive('mage', 2).effects[1].amount, 3);
});

test('职业固定被动（v6 G6）实战：力量、格挡、前三回合抽牌、召唤首次量与圣辉逐阶兑现', async () => {
    const { fixedClassPassive } = await import('../src/combat/class-passives.js');
    const setupFor = (archetype, tier) => ({ rulesVersion: 6, controlledId: 'hero', openingCharged: true,
        units: [hero(Array(30).fill('basic-defend'), { passives: [fixedClassPassive(archetype, tier)], speed: 100 }), foe({ speed: 100 })] });
    for (const tier of [1, 2, 3]) {
        const warrior = createBattle(setupFor('warrior', tier), SEED);
        assert.equal(warrior.ok, true);
        assert.equal(warrior.state.units.hero.statuses.strength, tier);
        assert.equal(createBattle(setupFor('guardian', tier), SEED).state.units.hero.block, [8, 12, 15][tier - 1]);
        assert.equal(createBattle(setupFor('priest', tier), SEED).state.units.hero.res.radiance, [3, 7, 9][tier - 1]);
        const setup = setupFor('assassin', tier);
        let state = createBattle(setup, SEED).state;
        assert.equal(state.piles.hero.hand.length, tier === 3 ? 8 : 7);
        const actions = [];
        for (let turn = 2; turn <= 4; turn += 1) {
            const action = { type: 'end-turn' };
            const result = applyAction(state, action);
            assert.equal(result.ok, true);
            actions.push(action);
            state = result.state;
            assert.equal(state.turn, turn);
            assert.equal(state.piles.hero.hand.length, tier > 1 && turn <= 3 ? (tier === 3 ? 8 : 7) : 5);
        }
        assert.deepEqual(replayBattle(JSON.parse(JSON.stringify(setup)), SEED, actions).state, state);
        const summoned = createBattle(setupFor('summoner', tier), SEED).state;
        const first = [1, 7, 9][tier - 1];
        assert.equal(summoned.units.hero.res.minion.hp, first);
        const second = applyAction(summoned, { type: 'end-turn' });
        assert.equal(second.ok, true);
        assert.equal(second.state.units.hero.res.minion.hp, first + tier);
        assert.equal(summoned.units.hero.res.minion.hp, first, '前一快照不被写穿');
    }
});

test('职业固定被动（v6 G6）雷珠与临时牌：双路雷伤、旧雷涌、奇迹保留消耗及弃牌伤害可重放', async () => {
    const { fixedClassPassive } = await import('../src/combat/class-passives.js');
    const { TOKEN_CARDS } = await import('../src/combat/rules.js');
    for (const tier of [1, 2, 3]) {
        const pulse = { id: 'pulse', name: '鸣雷', type: 'skill', cost: 0, effects: [
            { op: 'apply-status', status: 'arc-boost', stacks: 3, target: 'self' },
            { op: 'orb-pulse', amount: 1 }, { op: 'evoke', amount: 1 },
        ] };
        const setup = { rulesVersion: 6, controlledId: 'hero', units: [
            hero(Array(5).fill('pulse'), { catalog: { pulse }, passives: [fixedClassPassive('mage', tier)] }), foe(),
        ] };
        const created = createBattle(setup, SEED);
        assert.equal(created.ok, true);
        assert.equal(created.state.units.hero.res.orbs.list.length, tier === 1 ? 1 : 3);
        const action = { type: 'play', inst: created.state.piles.hero.hand[0] };
        const played = applyAction(created.state, action);
        assert.equal(played.ok, true, JSON.stringify(played.error));
        assert.equal(60 - played.state.units.foe.hp, 14 + 2 * (tier - 1));
        assert.deepEqual(replayBattle(clone(setup), SEED, [action]).state, played.state);
        const bardSetup = { rulesVersion: 6, controlledId: 'hero', units: [
            hero(filler, { passives: [fixedClassPassive('bard', tier)] }), foe(),
        ] };
        const bard = createBattle(bardSetup, SEED).state;
        const tokens = bard.piles.hero.hand.filter(id => bard.cards[id].cardId === 'token-miracle');
        assert.equal(tokens.length, [1, 3, 4][tier - 1]);
        assert.ok(tokens.every(id => bard.cards[id].temp));
        const kept = applyAction(bard, { type: 'end-turn' });
        assert.ok(tokens.every(id => kept.state.piles.hero.hand.includes(id)));
        const play = { type: 'play', inst: tokens[0] };
        const used = applyAction(kept.state, play);
        assert.equal(used.ok, true);
        assert.equal(used.state.units.hero.energy, kept.state.units.hero.energy + 1);
        assert.ok(used.state.piles.hero.exhaust.includes(tokens[0]));
        assert.deepEqual(replayBattle(clone(bardSetup), SEED, [{ type: 'end-turn' }, play]).state, used.state);
        const discard = { id: 'discard', name: '换手', type: 'skill', cost: 0, effects: [{ op: 'discard', amount: 1, mode: 'random' }] };
        const ranger = start([hero(Array(5).fill('discard'), { catalog: { discard }, passives: [fixedClassPassive('ranger', tier)] }), foe()], { rulesVersion: 6 });
        const hit = applyAction(ranger, { type: 'play', inst: ranger.piles.hero.hand[0] });
        assert.equal(hit.ok, true);
        assert.equal(60 - hit.state.units.foe.hp, tier + 1);
        assert.equal(applyAction(ranger, { type: 'end-turn' }).state.units.foe.hp, 60, '自然弃牌不触发');
    }
    assert.equal(TOKEN_CARDS['token-miracle'].cost, 0);
    assert.equal(TOKEN_CARDS['token-grace'].name, '天籁');
});

test('职业固定被动（v6 G6）账本：逐阶写入、重建回读、换职业重置与回退，旧职业仍按旧算法', async (t) => {
    const { fixedClassPassive } = await import('../src/combat/class-passives.js');
    const { passiveAtTier, solveCardTemplate } = await import('../src/combat/card-templates.js');
    for (const archetype of [...Object.keys(COMBAT_RULES.archetypes), 'legacy']) {
        const cls = { ...classDef('cls-blade'), archetype: archetype === 'legacy' ? 'warrior' : archetype };
        if (archetype !== 'legacy') Object.assign(cls, { classPassiveVersion: 1, classPassive: fixedClassPassive(archetype, 1, 'p-cls-blade') });
        const db = createLedgerMockHost({ supportCallbacks: true });
        db.sheets.sheet_userbag = userInventorySheet();
        const tables = createCombatTables({ api: db.api });
        t.after(() => tables.client.dispose());
        assert.equal((await tables.ensure()).ok, true);
        assert.equal((await tables.append('profile', [row(cls, 1), row(heroDef(), 2), row({ ...classDef('cls-other'), className: '别派' }, 3)])).ok, true);
        const chat = Array.from({ length: Math.ceil(expFor(10) / 50) }, (_, i) => ai(`[igs-combat:exp|我|${Math.min(50, expFor(10) - i * 50)}|修炼]`));
        const baseFloors = chat.length;
        const open = () => createCombatLedger({ tables, chat: () => chat, userName: '主角', wallet: () => 10000, now: () => 7 });
        let ledger = open();
        assert.equal((await ledger.scan()).ok, true);
        const heroOfInitial = heroOf(await ledger.effectiveState());
        const expected = tier => archetype === 'legacy' ? passiveAtTier(heroOfInitial.classProfile.classPassive, tier) : fixedClassPassive(archetype, tier, 'p-cls-blade');
        const baseDeck = clone(heroOfInitial.deck);
        for (const tier of [2, 3]) {
            chat.push(ai(`晋升${tier}`));
            const rarity = tier === 2 ? 'rare' : 'epic';
            const cards = [1, 2, 3].map(n => ({ id: `tier-${tier}-${n}`, name: `新招${tier}${n}`, cost: n, rarity, ...solveCardTemplate('strike', n, rarity) }));
            const result = await ledger.ascendClass('pc-hero', { classRef: cls.id, tier, tierName: `阶${tier}`, cards });
            assert.equal(result.ok, true, `${archetype}: ${JSON.stringify(result)}`);
            ledger = open();
            const view = heroOf(await ledger.effectiveState());
            assert.equal(view.classTier, tier);
            assert.deepEqual(view.classProfile.classPassive, expected(tier));
            assert.deepEqual(view.deck, baseDeck);
            assert.deepEqual((await ledger.effectiveState()).classes.get(cls.id).classPassive, heroOfInitial.classProfile.classPassive);
        }
        chat[baseFloors + 1].swipe_id = 1;
        assert.equal(heroOf(await ledger.effectiveState()).classTier, 2);
        assert.deepEqual(heroOf(await ledger.effectiveState()).classProfile.classPassive, expected(2));
        chat[baseFloors + 1].swipe_id = 0;
        chat.push(ai('转职'));
        assert.equal((await ledger.respecClass('pc-hero', 'cls-other')).ok, true);
        assert.equal(heroOf(await ledger.effectiveState()).classTier, 1);
        chat.pop();
        assert.equal(heroOf(await ledger.effectiveState()).classTier, 3);
        chat.splice(baseFloors);
        assert.deepEqual(heroOf(await ledger.effectiveState()).classProfile.classPassive, expected(1));
    }
});