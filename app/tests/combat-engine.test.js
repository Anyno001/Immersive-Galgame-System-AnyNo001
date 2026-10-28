import test from 'node:test';
import assert from 'node:assert/strict';
import { actionProgress, applyAction, createBattle, legalActions, replayBattle, seedFor, upcomingActors } from '../src/combat/engine.js';
import { chooseAllyPlay, chooseSkillIntent } from '../src/combat/policy.js';
import { cardView, computeDamage } from '../src/combat/battle-state.js';
import { BASIC_CARDS, COMBAT_RULES, combatSpeedFor } from '../src/combat/rules.js';

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
    cover: card('cover', 1, [{ op: 'block', amount: 5, target: 'ally' }]),
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
// 行动值时间轴下队友在自己行动时才抽牌回能；策略用例直接把 5 张牌放进手牌并回满能量，模拟轮到队友行动。
const mateTurn = (s) => {
    s.piles.mate.hand = [...s.piles.mate.draw];
    s.piles.mate.draw = [];
    s.units.mate.energy = s.units.mate.energyPerTurn;
    return s;
};

test('队友托管：预计受伤超过格挡时优先防御', () => {
    const s = mateTurn(start([hero(filler), mate(['basic-defend', 'basic-strike', 'heavy', 'twin', 'flex']), foe({ skills: [claw(12)] })]));
    assert.equal(s.intents.foe.targetId, 'mate');
    assert.deepEqual(chooseAllyPlay(s, 'mate'), { inst: 'mate#0' });
});

test('队友托管：可击杀时选最便宜的击杀牌', () => {
    const s = mateTurn(start([hero(filler), mate(['heavy', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend']), foe({ maxHp: 6 })]));
    assert.deepEqual(chooseAllyPlay(s, 'mate'), { inst: 'mate#1', targetId: 'foe' });
});

test('队友托管：前两回合先打能力牌，否则按伤害/费用攻击', () => {
    let s = mateTurn(start([hero(filler), mate(['basic-strike', 'aura', 'heavy', 'basic-defend', 'basic-defend']), foe()]));
    assert.deepEqual(chooseAllyPlay(s, 'mate'), { inst: 'mate#1' });
    s = mateTurn(start([hero(filler), mate(['basic-strike', 'twin', 'heavy', 'basic-defend', 'basic-defend']), foe()]));
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

test('行动值时间轴：快的敌人在操控角色下一回合前出手两次，顺序槽推演与实际出手一致', () => {
    const fast = foe({ id: 'fast', name: '快', speed: 250 });
    const slow = foe({ id: 'slow', name: '慢', speed: 100 });
    const s = start([hero(filler, { speed: 100 }), fast, slow]);
    assert.equal(s.phase, 'player');
    const predicted = upcomingActors(s, 5);
    assert.deepEqual(predicted, ['hero', 'fast', 'fast', 'slow', 'hero']);
    const r = applyAction(s, { type: 'end-turn' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.events.filter((e) => e.type === 'act').map((e) => e.unitId), ['fast', 'fast', 'slow']);
    assert.deepEqual([r.state.phase, r.state.turn], ['player', 2]);
    assert.equal(upcomingActors(r.state, 1)[0], 'hero');
    // 行动条：出牌阶段操控角色停在出手点；每次自动出手的 act 快照里出手者到达出手点，回合开始快照里操控角色到达出手点。
    assert.equal(actionProgress(s).hero, 1);
    const acts = r.events.filter((e) => e.type === 'act');
    assert.ok(acts.every((e) => e.track?.[e.unitId] === 1));
    assert.equal(r.events.find((e) => e.type === 'turn-start')?.track?.hero, 1);
    assert.ok(Object.values(actionProgress(r.state)).every((p) => p >= 0 && p <= 1));
    assert.equal(createBattle({ controlledId: 'hero', units: [hero(filler, { speed: 0 }), foe()] }, SEED).error?.reason, 'invalid-stat');
});

test('速度规则：按职业原型 / 敌人档位给基准，按 ID 确定性浮动；规则版本为 3', () => {
    assert.equal(COMBAT_RULES.version, 3);
    const a = combatSpeedFor({ archetype: 'assassin', id: 'pc-x' });
    assert.equal(a, combatSpeedFor({ archetype: 'assassin', id: 'pc-x' }));
    assert.ok(a >= 115 && a <= 125);
    assert.equal(combatSpeedFor({ tier: 'boss' }), 92);
    assert.equal(combatSpeedFor({}), COMBAT_RULES.defaultSpeed);
});

test('为一名队友：可指定存活的己方单位，不指定时按生命比例最低者，敌人不能作目标', () => {
    const s = start([hero(Array(5).fill('cover')), mate(filler), foe()]);
    const inst = s.piles.hero.hand[0];
    assert.deepEqual(legalActions(s).filter((a) => a.type === 'play' && a.inst === inst).map((a) => a.targetId).sort(), ['hero', 'mate']);
    assert.equal(play(s, inst, 'mate').units.mate.block, 5);
    assert.equal(applyAction(s, { type: 'play', inst, targetId: 'foe' }).error.reason, 'invalid-target');
    const auto = play(s, inst);
    assert.equal(auto.units.hero.block + auto.units.mate.block, 5);
});

const V3 = {
    slam: card('slam', 1, [{ op: 'damage-from-block', target: 'enemy' }], { type: 'attack' }),
    bloodlet: card('bloodlet', 0, [{ op: 'self-damage', amount: 3 }, { op: 'energy', amount: 2 }]),
    entrench: card('entrench', 1, [{ op: 'double', stat: 'block', target: 'self' }]),
    heavyblade: card('heavyblade', 2, [dmg(4, { strengthScale: 3 })], { type: 'attack' }),
    catalyst: card('catalyst', 1, [{ op: 'double', stat: 'poison', target: 'enemy' }]),
    limitbreak: card('limitbreak', 1, [{ op: 'double', stat: 'strength', target: 'self' }]),
    ghost: card('ghost', 1, [onSelf('intangible', 1)]),
    focus: card('focus', 0, [onSelf('no-draw', 1), { op: 'draw', amount: 2 }]),
    prep: card('prep', 1, [{ op: 'next-turn', gain: 'energy', amount: 2 }, { op: 'next-turn', gain: 'draw', amount: 2 }]),
    fumes: card('fumes', 1, [{ op: 'each-turn', then: [{ op: 'status', status: 'poison', stacks: 2, target: 'all-enemies' }] }], { type: 'power' }),
};
const heroV3 = (deck, extra = {}) => hero(deck, { catalog: { ...CARDS, ...V3 }, ...extra });
const DEFENDS = Array(4).fill('basic-defend');

test('v3：伤害取格挡、格挡翻倍、自伤换能量、力量按倍数生效', () => {
    let s = start([heroV3(['basic-defend', 'entrench', 'slam', 'bloodlet', 'heavyblade'], { energy: 10 }), foe()]);
    s = play(s, 'hero#0');
    s = play(s, 'hero#1');
    assert.equal(s.units.hero.block, 10);
    s = play(s, 'hero#2', 'foe');
    assert.deepEqual([s.units.foe.hp, s.units.hero.block], [50, 10]);
    s = play(s, 'hero#3');
    assert.deepEqual([s.units.hero.hp, s.units.hero.block, s.units.hero.energy], [47, 10, 9]);
    s = play(s, 'hero#4', 'foe');
    assert.equal(s.units.foe.hp, 46);
    let k = start([heroV3(['flex', 'heavyblade', ...Array(3).fill('basic-defend')], { energy: 10 }), foe()]);
    k = play(k, 'hero#0');
    k = play(k, 'hero#1', 'foe');
    assert.equal(k.units.foe.hp, 50);
});

test('v3：中毒与力量翻倍', () => {
    let s = start([heroV3(['toxin', 'catalyst', 'flex', 'limitbreak', 'basic-defend'], { energy: 10 }), foe()]);
    s = play(s, 'hero#0', 'foe');
    s = play(s, 'hero#1', 'foe');
    assert.equal(s.units.foe.statuses.poison, 6);
    s = play(s, 'hero#2');
    s = play(s, 'hero#3');
    assert.equal(s.units.hero.statuses.strength, 4);
});

test('v3：无形覆盖其间敌方行动、下回合开始衰减；禁抽只持续本回合', () => {
    let s = start([heroV3(['ghost', ...DEFENDS]), foe({ skills: [claw(20)] })]);
    s = play(s, 'hero#0');
    s = act(s, { type: 'end-turn' });
    assert.deepEqual([s.units.hero.hp, s.units.hero.statuses.intangible], [49, undefined]);
    let d = start([heroV3(Array(7).fill('focus')), foe()]);
    d = play(d, d.piles.hero.hand[0]);
    assert.deepEqual([d.piles.hero.hand.length, d.piles.hero.draw.length, d.units.hero.statuses['no-draw']], [4, 2, 1]);
    d = act(d, { type: 'end-turn' });
    assert.deepEqual([d.piles.hero.hand.length, d.units.hero.statuses['no-draw']], [5, undefined]);
});

test('v3：下回合生效的能量与抽牌；能力牌每回合开始触发', () => {
    let s = start([heroV3(Array(10).fill('prep')), foe()]);
    s = play(s, s.piles.hero.hand[0]);
    assert.equal(s.units.hero.energy, 2);
    s = act(s, { type: 'end-turn' });
    assert.deepEqual([s.units.hero.energy, s.piles.hero.hand.length, s.units.hero.nextTurn], [5, 7, []]);
    let p = start([heroV3(['fumes', ...DEFENDS]), foe()]);
    p = play(p, 'hero#0');
    assert.deepEqual([p.units.foe.statuses.poison, p.piles.hero.exhaust], [undefined, ['hero#0']]);
    const r = applyAction(p, { type: 'end-turn' });
    assert.equal(r.state.units.foe.statuses.poison, 2);
    assert.ok(r.events.some((e) => e.type === 'power-trigger' && e.cardId === 'fumes'));
});

test('觉醒：每场 1 次、不耗能量；决意本回合降费并抽牌，回合结束恢复；无觉醒或非法类型时不可用', () => {
    const deck = Array(7).fill('heavy');
    let s = start([hero(deck), foe()], { awaken: { type: 'resolve', line: '到此为止' } });
    assert.ok(legalActions(s).some((a) => a.type === 'awaken'));
    const r = applyAction(s, { type: 'awaken' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.events.filter((e) => e.type === 'awaken').map((e) => [e.awakenType, e.line]), [['resolve', '到此为止']]);
    s = r.state;
    assert.deepEqual([s.units.hero.energy, s.piles.hero.hand.length, cardView(s, s.piles.hero.hand[0]).cost], [3, 7, 1]);
    for (let i = 0; i < 3; i += 1) s = play(s, s.piles.hero.hand[0], 'foe');
    assert.deepEqual([s.units.hero.energy, s.units.foe.hp], [0, 15]);
    assert.equal(applyAction(s, { type: 'awaken' }).error.reason, 'awaken-used');
    assert.ok(!legalActions(s).some((a) => a.type === 'awaken'));
    s = act(s, { type: 'end-turn' });
    assert.deepEqual([s.units.hero.handCost, cardView(s, s.piles.hero.hand[0]).cost], [undefined, 2]);
    const plain = start([hero(deck), foe()]);
    assert.equal(applyAction(plain, { type: 'awaken' }).error.reason, 'awaken-unavailable');
    assert.ok(!legalActions(plain).some((a) => a.type === 'awaken'));
    assert.equal(createBattle({ controlledId: 'hero', units: [hero(deck), foe()], awaken: { type: 'nope' } }, SEED).error?.reason, 'invalid-awaken');
});

test('觉醒：不屈首次致死保留 1 生命并获得格挡，重放一致；悲恸按最大生命比例回复', () => {
    const units = [hero(Array(5).fill('basic-defend')), foe({ skills: [claw(99)] })];
    let s = start(units, { awaken: { type: 'unyielding' } });
    s = act(s, { type: 'awaken' });
    assert.equal(s.units.hero.statuses.endure, 1);
    const r = applyAction(s, { type: 'end-turn' });
    assert.equal(r.ok, true);
    assert.deepEqual([r.state.units.hero.hp, r.state.units.hero.alive, r.state.outcome, r.state.units.hero.statuses.endure], [1, true, null, undefined]);
    assert.equal(r.events.filter((e) => e.type === 'endure').length, 1);
    const replay = replayBattle({ controlledId: 'hero', units, awaken: { type: 'unyielding' } }, SEED, [{ type: 'awaken' }, { type: 'end-turn' }]);
    assert.deepEqual(replay.state, r.state);
    let g = start([hero(Array(5).fill('basic-defend'), { hp: 20 }), foe()], { awaken: { type: 'grief', line: '' } });
    g = act(g, { type: 'awaken' });
    assert.deepEqual([g.units.hero.hp, g.units.hero.statuses.strength, g.units.hero.statuses.dexterity], [28, 2, 2]);
});



test('一次性道具：不耗能量、每回合 1 次、用完不可用；回合开始恢复可用；净化移除减益；非法 setup.items 拒绝建局', () => {
    const items = [
        { itemId: 'it-potion', name: '回春丹', count: 2, effects: [{ op: 'heal', amount: 12, target: 'self' }] },
        { itemId: 'it-purify', name: '清心散', count: 1, effects: [{ op: 'cleanse', target: 'self' }] },
    ];
    let s = start([hero(Array(5).fill('basic-defend'), { hp: 20 }), foe()], { items });
    assert.deepEqual(legalActions(s).filter((a) => a.type === 'item').map((a) => a.itemId), ['it-potion', 'it-purify']);
    const r = applyAction(s, { type: 'item', itemId: 'it-potion' });
    assert.equal(r.ok, true);
    assert.ok(r.events.some((e) => e.type === 'item' && e.name === '回春丹'));
    s = r.state;
    assert.deepEqual([s.units.hero.hp, s.units.hero.energy, s.items.list[0].count], [32, 3, 1]);
    assert.equal(applyAction(s, { type: 'item', itemId: 'it-purify' }).error.reason, 'item-used');
    assert.ok(!legalActions(s).some((a) => a.type === 'item'));
    s = act(s, { type: 'end-turn' });
    s = act(s, { type: 'item', itemId: 'it-potion' });
    assert.equal(s.items.list[0].count, 0);
    s = act(s, { type: 'end-turn' });
    assert.equal(applyAction(s, { type: 'item', itemId: 'it-potion' }).error.reason, 'item-empty');
    assert.equal(applyAction(s, { type: 'item', itemId: 'nope' }).error.reason, 'item-unavailable');
    s.units.hero.statuses.weak = 2;
    s.units.hero.statuses.poison = 3;
    s = act(s, { type: 'item', itemId: 'it-purify' });
    assert.deepEqual([s.units.hero.statuses.weak, s.units.hero.statuses.poison], [undefined, undefined]);
    const plain = start([hero(Array(5).fill('basic-defend')), foe()]);
    assert.equal(plain.items, undefined);
    assert.equal(applyAction(plain, { type: 'item', itemId: 'it-potion' }).error.reason, 'item-unavailable');
    const bad = (list) => createBattle({ controlledId: 'hero', units: [hero(Array(5).fill('basic-defend')), foe()], items: list }, SEED).error?.reason;
    assert.equal(bad([{ itemId: 'x', count: 0, effects: [{ op: 'heal', amount: 1 }] }]), 'invalid-items');
    assert.equal(bad([{ itemId: 'x', count: 1, effects: [] }]), 'invalid-items');
    assert.equal(bad('x'), 'invalid-items');
});


test('攻击伤害带段号：范围攻击同一段的各目标共用段号，多段与随机目标每段递增；中毒等非攻击伤害不带', () => {
    const extra = {
        sweep: card('sweep', 1, [dmg(3, { target: 'all-enemies' })], { type: 'attack' }),
        scatter: card('scatter', 1, [dmg(2, { target: 'random-enemy', hits: 3 })], { type: 'attack' }),
    };
    const s = start([hero(['sweep', 'scatter', 'twin', 'toxin', 'basic-strike'], { energy: 10, catalog: { ...CARDS, ...extra } }), foe(), foe({ id: 'foe2', name: '敌人二' })]);
    const playAny = (state, inst) => {
        const action = legalActions(state).find((a) => a.type === 'play' && a.inst === inst && (!a.targetId || a.targetId === 'foe'));
        const r = applyAction(state, action);
        assert.equal(r.ok, true, JSON.stringify(r.error));
        return r;
    };
    const strikes = (r) => r.events.filter((e) => e.type === 'damage' && e.kind === 'attack').map((e) => [e.target, e.strike]);
    let r = playAny(s, 'hero#0');
    assert.deepEqual(strikes(r), [['foe', 1], ['foe2', 1]]);
    r = playAny(r.state, 'hero#1');
    assert.deepEqual(strikes(r).map(([, n]) => n), [1, 2, 3]);
    r = playAny(r.state, 'hero#2');
    assert.deepEqual(strikes(r), [['foe', 1], ['foe', 2], ['foe', 3]]);
    r = playAny(r.state, 'hero#3');
    const end = applyAction(r.state, { type: 'end-turn' });
    const poison = end.events.filter((e) => e.type === 'damage' && e.kind === 'poison');
    assert.ok(poison.length > 0);
    assert.ok(poison.every((e) => !Object.hasOwn(e, 'strike')));
});


test('鞭尸与超杀：overkill 战斗打空最后一名敌人后不立即判胜，倒下的敌人仍可作目标（不掉血、不触发荆棘），不能撤退，结束回合判胜；战报不写鞭尸，成就按事件推导', async () => {
    const { combatFeats, COMBAT_OVERKILL_HITS } = await import('../src/combat/feats.js');
    const { collectTurns } = await import('../src/combat/report.js');
    const spiky = { id: 'spiky', trigger: 'battle-start', effects: [onSelf('thorns', 3)] };
    const deck = ['heavy', 'twin', 'basic-strike', 'basic-strike', 'basic-defend'];
    const created = createBattle({ controlledId: 'hero', overkill: true, canEscape: true, units: [hero(deck, { energy: 10 }), foe({ maxHp: 15, passives: [spiky] })] }, SEED);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    let s = created.state;
    const events = [...created.events];
    const step = (action) => { const r = applyAction(s, action); assert.equal(r.ok, true, JSON.stringify(r.error)); events.push(...r.events); s = r.state; return r; };
    const kill = step({ type: 'play', inst: 'hero#0', targetId: 'foe' });
    assert.deepEqual([s.outcome, s.phase, s.units.foe.alive, s.units.hero.hp], [null, 'player', false, 47]);
    assert.ok(kill.events.some((e) => e.type === 'defeated' && e.unitId === 'foe'));
    assert.ok(!kill.events.some((e) => e.type === 'battle-end'));
    assert.ok(legalActions(s).some((a) => a.type === 'play' && a.inst === 'hero#1' && a.targetId === 'foe'));
    assert.ok(!legalActions(s).some((a) => a.type === 'escape'));
    assert.equal(applyAction(s, { type: 'escape' }).error.reason, 'escape-unavailable');
    const whip = step({ type: 'play', inst: 'hero#1', targetId: 'foe' });
    assert.deepEqual(whip.events.filter((e) => e.type === 'damage').map((e) => [e.target, e.amount, e.hpLoss, e.overkill, e.strike]), [['foe', 2, 0, true, 1], ['foe', 2, 0, true, 2], ['foe', 2, 0, true, 3]]);
    assert.deepEqual([s.units.foe.hp, s.units.hero.hp, s.outcome], [0, 47, null]);
    step({ type: 'play', inst: 'hero#2', targetId: 'foe' });
    step({ type: 'play', inst: 'hero#3', targetId: 'foe' });
    const end = step({ type: 'end-turn' });
    assert.deepEqual(end.events.map((e) => e.type), ['battle-end']);
    assert.deepEqual([s.outcome, s.phase], ['victory', 'ended']);
    assert.deepEqual(collectTurns(events, s.units).flatMap((t) => t.actions.map((a) => a.skill)), ['heavy']);
    assert.deepEqual(combatFeats(events, s), [{ id: 'honor-kill' }, { id: 'overkill', hits: COMBAT_OVERKILL_HITS }]);
    assert.equal(createBattle({ controlledId: 'hero', overkill: 'yes', units: [hero(deck), foe()] }, SEED).error?.reason, 'invalid-setup');
});

test('鞭尸：仍有存活敌人时单体攻击可打倒下的敌人（只记鞭尸、不波及存活者），随机攻击只打存活的；旧 setup 不能选倒下的敌人；击杀有溢出、超杀不足 5 段不出成就', async () => {
    const { combatFeats } = await import('../src/combat/feats.js');
    const extra = { scatter: card('scatter', 1, [dmg(2, { target: 'random-enemy', hits: 3 })], { type: 'attack' }) };
    const units = () => [hero(['heavy', 'twin', 'scatter', 'basic-strike', 'basic-defend'], { energy: 10, catalog: { ...CARDS, ...extra } }), foe({ maxHp: 10 }), foe({ id: 'foe2', name: '敌人二' })];
    let s = play(start(units(), { overkill: true }), 'hero#0', 'foe');
    assert.deepEqual(legalActions(s).filter((a) => a.inst === 'hero#1').map((a) => a.targetId), ['foe', 'foe2']);
    const whip = applyAction(s, { type: 'play', inst: 'hero#1', targetId: 'foe' });
    assert.equal(whip.ok, true, JSON.stringify(whip.error));
    assert.ok(whip.events.filter((e) => e.type === 'damage').every((e) => e.target === 'foe' && e.overkill === true));
    assert.equal(whip.state.units.foe2.hp, 60);
    const scatter = applyAction(whip.state, legalActions(whip.state).find((a) => a.inst === 'hero#2'));
    assert.equal(scatter.ok, true, JSON.stringify(scatter.error));
    assert.ok(scatter.events.filter((e) => e.type === 'damage').every((e) => e.target === 'foe2' && !e.overkill));
    assert.equal(scatter.state.units.foe2.hp, 54);
    const legacy = play(start(units()), 'hero#0', 'foe');
    assert.deepEqual(legalActions(legacy).filter((a) => a.inst === 'hero#1').map((a) => a.targetId), ['foe2']);
    assert.equal(applyAction(legacy, { type: 'play', inst: 'hero#1', targetId: 'foe' }).error.reason, 'invalid-target');
    const created = createBattle({ controlledId: 'hero', overkill: true, units: [hero(['heavy', 'twin', 'basic-strike', 'basic-defend', 'basic-defend'], { energy: 10 }), foe({ maxHp: 10 })] }, SEED);
    let f = created.state;
    const events = [...created.events];
    for (const action of [{ type: 'play', inst: 'hero#0', targetId: 'foe' }, { type: 'play', inst: 'hero#1', targetId: 'foe' }, { type: 'play', inst: 'hero#2', targetId: 'foe' }, { type: 'end-turn' }]) {
        const r = applyAction(f, action);
        assert.equal(r.ok, true, JSON.stringify(r.error));
        events.push(...r.events);
        f = r.state;
    }
    assert.equal(f.outcome, 'victory');
    assert.deepEqual(combatFeats(events, f), []);
    assert.deepEqual(combatFeats(events, { ...f, outcome: 'defeat' }), []);
});
