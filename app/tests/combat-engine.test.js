import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createBattle, legalActions, replayBattle, seedFor } from '../src/combat/engine.js';
import { chooseAllyPlay, chooseSkillIntent } from '../src/combat/policy.js';
import { computeDamage } from '../src/combat/battle-state.js';
import { BASIC_CARDS } from '../src/combat/rules.js';

const card = (id, cost, effects, extra = {}) => ({ id, name: id, type: 'skill', cost, rarity: 'common', effects, skillRef: id, ...extra });
const dmg = (amount, extra = {}) => ({ op: 'damage', amount, target: 'enemy', ...extra });
const onSelf = (status, stacks) => ({ op: 'status', status, stacks, target: 'self' });
const CARDS = {
    ...BASIC_CARDS,
    bash: card('bash', 2, [dmg(8), { op: 'status', status: 'vulnerable', stacks: 2, target: 'enemy' }], { type: 'attack' }),
    heavy: card('heavy', 2, [dmg(15)], { type: 'attack' }),
    twin: card('twin', 1, [dmg(2, { hits: 3 })], { type: 'attack' }),
    whirl: card('whirl', 'X', [dmg(3)], { type: 'attack' }),
    burst: card('burst', 0, [dmg(4), { op: 'exhaust-self' }], { type: 'attack' }),
    finisher: card('finisher', 1, [{ op: 'conditional', when: { kind: 'target-has', value: 'vulnerable' }, then: [dmg(5)] }], { type: 'attack' }),
    flex: card('flex', 0, [onSelf('strength', 2)]),
    footwork: card('footwork', 0, [onSelf('dexterity', 2)]),
    spikes: card('spikes', 1, [onSelf('thorns', 3)]),
    rejuv: card('rejuv', 1, [onSelf('regen', 2)]),
    toxin: card('toxin', 1, [{ op: 'status', status: 'poison', stacks: 3, target: 'enemy' }]),
    mend: card('mend', 1, [{ op: 'heal', amount: 5, target: 'self' }]),
    rush: card('rush', 0, [{ op: 'draw', amount: 2 }]),
    surge: card('surge', 0, [{ op: 'energy', amount: 1 }]),
    aura: card('aura', 0, [onSelf('strength', 1)], { type: 'power' }),
};

const idle = { id: 'idle', name: '蓄势', intent: 'buff', effects: [{ op: 'heal', amount: 1, target: 'self' }] };
const claw = (amount) => ({ id: 'claw', name: '爪击', intent: 'attack', effects: [dmg(amount)] });
const hero = (deck, extra = {}) => ({ id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 50, deck, catalog: CARDS, ...extra });
const foe = (extra = {}) => ({ id: 'foe', name: '敌人', side: 'enemy', kind: 'skill', maxHp: 60, skills: [idle], ...extra });
const SEED = seedFor('chat-1|7');

function start(units, extra = {}) {
    const result = createBattle({ controlledId: 'hero', units, ...extra }, SEED);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result.state;
}

function act(state, action) {
    const result = applyAction(state, action);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result.state;
}

const play = (state, inst, targetId) => act(state, targetId ? { type: 'play', inst, targetId } : { type: 'play', inst });

test('伤害、易伤、多段与条件效果按规则结算，易伤在回合末衰减', () => {
    let s = start([hero(['bash', 'twin', 'finisher', 'finisher', 'basic-strike'], { energy: 10 }), foe()]);
    assert.equal(s.piles.hero.hand.length, 5);
    s = play(s, 'hero#2', 'foe');
    assert.equal(s.units.foe.hp, 60);
    s = play(s, 'hero#0', 'foe');
    assert.equal(s.units.foe.hp, 52);
    assert.equal(s.units.foe.statuses.vulnerable, 2);
    const twin = applyAction(s, { type: 'play', inst: 'hero#1', targetId: 'foe' });
    assert.equal(twin.events.filter((e) => e.type === 'damage').length, 3);
    s = twin.state;
    assert.equal(s.units.foe.hp, 43);
    s = play(s, 'hero#3', 'foe');
    assert.equal(s.units.foe.hp, 36);
    s = play(s, 'hero#4', 'foe');
    assert.equal(s.units.foe.hp, 27);
    assert.equal(s.units.hero.energy, 4);
    s = act(s, { type: 'end-turn' });
    assert.equal(s.units.foe.statuses.vulnerable, 1);
    assert.equal(s.units.foe.hp, 28);
});

test('力量、敏捷、虚弱、格挡与能量', () => {
    let s = start([hero(['flex', 'footwork', 'basic-strike', 'basic-defend', 'surge']), foe()]);
    s = play(s, 'hero#0');
    s = play(s, 'hero#1');
    s = play(s, 'hero#2', 'foe');
    assert.equal(s.units.foe.hp, 52);
    s = play(s, 'hero#3');
    assert.equal(s.units.hero.block, 7);
    s = play(s, 'hero#4');
    assert.equal(s.units.hero.energy, 2);
    assert.equal(computeDamage({ damageScale: 1, statuses: { weak: 1 } }, { statuses: {} }, 8), 6);
    assert.equal(computeDamage({ damageScale: 1.2, statuses: { strength: 1 } }, { statuses: { vulnerable: 1 } }, 10), 19);
});

test('中毒、再生、荆棘在回合边界结算', () => {
    let s = start([hero(['toxin', 'rejuv', 'spikes', 'basic-defend', 'basic-defend'], { hp: 40 }), foe({ skills: [claw(5)] })]);
    s = play(s, 'hero#0', 'foe');
    s = play(s, 'hero#1');
    s = play(s, 'hero#2');
    s = act(s, { type: 'end-turn' });
    assert.equal(s.units.foe.hp, 54);
    assert.equal(s.units.foe.statuses.poison, 2);
    assert.equal(s.units.hero.hp, 37);
    assert.equal(s.units.hero.statuses.regen, 1);
    assert.equal(s.units.hero.statuses.thorns, 3);
});

test('抽牌堆抽空时洗入弃牌堆，牌数守恒', () => {
    let s = start([hero(Array(7).fill('basic-defend')), foe()]);
    assert.deepEqual([s.piles.hero.hand.length, s.piles.hero.draw.length], [5, 2]);
    const result = applyAction(s, { type: 'end-turn' });
    assert.equal(result.ok, true);
    s = result.state;
    const reshuffle = result.events.find((e) => e.type === 'reshuffle');
    assert.equal(reshuffle?.count, 5);
    assert.deepEqual([s.piles.hero.hand.length, s.piles.hero.draw.length, s.piles.hero.discard.length], [5, 2, 0]);
});

test('消耗、能力牌与 X 费用', () => {
    let s = start([hero(['burst', 'aura', 'whirl', 'basic-defend', 'basic-defend']), foe()]);
    s = play(s, 'hero#0', 'foe');
    s = play(s, 'hero#1');
    s = play(s, 'hero#2', 'foe');
    assert.equal(s.units.foe.hp, 44);
    assert.equal(s.units.hero.energy, 0);
    assert.deepEqual(s.piles.hero.exhaust, ['hero#0', 'hero#1']);
    assert.deepEqual(s.piles.hero.discard, ['hero#2']);
    assert.deepEqual(legalActions(s), [{ type: 'end-turn' }]);
});

test('非法动作返回结构化拒绝且状态不变', () => {
    let s = start([hero(['heavy', 'heavy', 'basic-strike', 'basic-defend', 'basic-defend']), foe()]);
    s = play(s, 'hero#0', 'foe');
    const snapshot = JSON.stringify(s);
    const cases = [
        [{ type: 'play', inst: 'hero#1', targetId: 'foe' }, 'insufficient-energy'],
        [{ type: 'play', inst: 'hero#2', targetId: 'hero' }, 'invalid-target'],
        [{ type: 'play', inst: 'hero#2' }, 'invalid-target'],
        [{ type: 'play', inst: 'hero#3', targetId: 'foe' }, 'unexpected-target'],
        [{ type: 'play', inst: 'hero#0', targetId: 'foe' }, 'card-not-in-hand'],
        [{ type: 'escape' }, 'escape-unavailable'],
        [{ type: 'cheat' }, 'invalid-action'],
    ];
    for (const [action, reason] of cases) {
        const result = applyAction(s, action);
        assert.equal(result.ok, false);
        assert.equal(result.error.reason, reason);
        assert.deepEqual(result.events, []);
        assert.equal(result.state, s);
    }
    assert.equal(JSON.stringify(s), snapshot);
});

test('胜利、失败与撤退终局', () => {
    let s = start([hero(Array(5).fill('heavy')), foe({ maxHp: 10 })]);
    s = play(s, 'hero#0', 'foe');
    assert.deepEqual([s.outcome, s.phase], ['victory', 'ended']);
    assert.deepEqual(legalActions(s), []);
    assert.equal(applyAction(s, { type: 'end-turn' }).error.reason, 'battle-ended');
    s = start([hero(Array(5).fill('basic-defend'), { maxHp: 5 }), foe({ skills: [claw(12)] })]);
    s = act(s, { type: 'end-turn' });
    assert.equal(s.outcome, 'defeat');
    s = start([hero(Array(5).fill('basic-defend')), foe()], { canEscape: true });
    assert.equal(act(s, { type: 'escape' }).outcome, 'escape');
});

test('被动触发与敌人阶段切换', () => {
    const bigClaw = { id: 'big-claw', name: '巨爪', intent: 'attack', effects: [dmg(9)] };
    const ready = { id: 'ready', name: '战备', trigger: 'battle-start', effects: [{ op: 'block', amount: 4, target: 'self' }] };
    const harden = { id: 'harden', name: '硬化', trigger: 'on-hit', effects: [{ op: 'block', amount: 3, target: 'self' }] };
    let s = start([
        hero(Array(5).fill('heavy'), { passives: [ready] }),
        foe({ maxHp: 20, passives: [harden], phases: [{ hpBelowPct: 50, addSkills: [bigClaw], removeSkills: ['idle'] }] }),
    ]);
    assert.equal(s.units.hero.block, 4);
    const result = applyAction(s, { type: 'play', inst: 'hero#0', targetId: 'foe' });
    s = result.state;
    assert.equal(s.units.foe.hp, 5);
    assert.equal(s.units.foe.block, 3);
    assert.ok(result.events.some((e) => e.type === 'phase' && e.unitId === 'foe'));
    assert.deepEqual(s.units.foe.skills.map((k) => k.id), ['big-claw']);
    assert.equal(s.intents.foe.skillId, 'big-claw');
});



const mate = (deck, extra = {}) => ({ id: 'mate', name: '队友', side: 'ally', kind: 'deck', maxHp: 30, deck, catalog: CARDS, ...extra });
const filler = Array(5).fill('basic-defend');

test('队友托管：预计受伤超过格挡时优先防御', () => {
    const s = start([hero(filler), mate(['basic-defend', 'basic-strike', 'heavy', 'twin', 'flex']), foe({ skills: [claw(12)] })]);
    assert.equal(s.intents.foe.targetId, 'mate');
    assert.deepEqual(chooseAllyPlay(s, 'mate'), { inst: 'mate#0' });
});

test('队友托管：可击杀时选最便宜的击杀牌', () => {
    const s = start([hero(filler), mate(['heavy', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend']), foe({ maxHp: 6 })]);
    assert.deepEqual(chooseAllyPlay(s, 'mate'), { inst: 'mate#1', targetId: 'foe' });
});

test('队友托管：前两回合先打能力牌，否则按伤害/费用攻击', () => {
    let s = start([hero(filler), mate(['basic-strike', 'aura', 'heavy', 'basic-defend', 'basic-defend']), foe()]);
    assert.deepEqual(chooseAllyPlay(s, 'mate'), { inst: 'mate#1' });
    s = start([hero(filler), mate(['basic-strike', 'twin', 'heavy', 'basic-defend', 'basic-defend']), foe()]);
    assert.deepEqual(chooseAllyPlay(s, 'mate'), { inst: 'mate#2', targetId: 'foe' });
});

test('队友在操控角色结束回合后自动出牌', () => {
    const s = start([hero(filler), mate(Array(5).fill('basic-strike')), foe()]);
    const result = applyAction(s, { type: 'end-turn' });
    assert.equal(result.ok, true);
    assert.equal(result.events.filter((e) => e.type === 'card' && e.unitId === 'mate').length, 3);
    assert.equal(result.state.units.foe.hp, 43);
});

test('技能意图：按权重、冷却选择，同一技能不连续三次', () => {
    const a = { id: 'a', name: 'A', intent: 'attack', effects: [dmg(3)], weight: 1 };
    const b = { id: 'b', name: 'B', intent: 'defend', effects: [{ op: 'block', amount: 3, target: 'self' }], weight: 3 };
    const base = {
        order: ['e', 'h'],
        units: { e: { id: 'e', side: 'enemy', alive: true, skills: [a, b] }, h: { id: 'h', side: 'ally', alive: true, hp: 10, block: 0 } },
        cooldowns: {}, history: {},
    };
    assert.deepEqual(chooseSkillIntent(base, 'e', 0), { skillId: 'a', targetId: 'h' });
    assert.deepEqual(chooseSkillIntent(base, 'e', 0.5), { skillId: 'b', targetId: null });
    assert.equal(chooseSkillIntent({ ...base, history: { e: ['b', 'b'] } }, 'e', 0.9).skillId, 'a');
    assert.equal(chooseSkillIntent({ ...base, cooldowns: { e: { a: 1 } } }, 'e', 0).skillId, 'b');
    assert.equal(chooseSkillIntent({ ...base, cooldowns: { e: { a: 1 } }, history: { e: ['b', 'b'] } }, 'e', 0).skillId, 'b');
});

test('同一种子与动作序列重放两次，事件与状态完全一致', () => {
    const setup = {
        controlledId: 'hero',
        units: [
            hero(['bash', 'twin', 'toxin', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'rush', 'surge', 'whirl']),
            mate(['basic-strike', 'basic-strike', 'basic-defend', 'heavy', 'twin', 'mend']),
            foe({ maxHp: 120, skills: [claw(6), idle, { id: 'jab', name: '刺击', intent: 'attack', effects: [dmg(2, { target: 'random-enemy', hits: 2 })] }] }),
        ],
    };
    const seed = seedFor('chat-1|42');
    let { state } = createBattle(setup, seed);
    const actions = [];
    for (let i = 0; i < 25 && !state.outcome; i += 1) {
        const action = legalActions(state)[0];
        actions.push(action);
        state = applyAction(state, action).state;
    }
    const first = replayBattle(setup, seed, actions);
    const second = replayBattle(setup, seed, actions);
    assert.equal(first.ok, true);
    assert.equal(first.applied, actions.length);
    assert.deepEqual(second.events, first.events);
    assert.deepEqual(second.state, first.state);
    assert.deepEqual(first.state, state);
    assert.ok(first.events.some((e) => e.type === 'reshuffle'));
    const broken = replayBattle(setup, seed, [{ type: 'play', inst: 'nope' }]);
    assert.deepEqual([broken.ok, broken.applied, broken.error.reason, broken.error.index], [false, 0, 'card-not-in-hand', 0]);
});

test('开局配置非法时 fail-closed', () => {
    const units = [hero(filler), foe()];
    const reason = (setup, seed = SEED) => createBattle(setup, seed).error?.reason;
    assert.equal(reason({ controlledId: 'hero', units, rulesVersion: 99 }), 'rules-version-mismatch');
    assert.equal(reason({ controlledId: 'foe', units }), 'invalid-controlled');
    assert.equal(reason({ controlledId: 'hero', units: [hero(filler)] }), 'missing-side');
    assert.equal(reason({ controlledId: 'hero', units: [hero(['ghost']), foe()] }), 'unknown-card');
    assert.equal(reason({ controlledId: 'hero', units: [hero(['__proto__']), foe()] }), 'unknown-card');
    assert.equal(reason({ controlledId: 'hero', units: [hero(filler), foe({ id: '__proto__' })] }), 'invalid-unit-id');
    assert.equal(reason({ controlledId: 'hero', units }, -1), 'invalid-seed');
});
