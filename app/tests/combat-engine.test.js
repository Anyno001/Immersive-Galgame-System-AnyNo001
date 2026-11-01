import test from 'node:test';
import assert from 'node:assert/strict';
import { actionProgress, applyAction, createBattle, legalActions, replayBattle, seedFor, upcomingActors } from '../src/combat/engine.js';
import { chooseAllyPlay, chooseSkillIntent } from '../src/combat/policy.js';
import { cardView, computeDamage } from '../src/combat/battle-state.js';
import { BASIC_CARDS, COMBAT_RULES, combatSpeedFor } from '../src/combat/rules.js';
import { normalizeSkill } from '../src/combat/schema.js';


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

test('队友托管（v4）：没有伤害牌时按效果估值挑牌，会落空的牌不打，无牌可打就结束；v3 记录仍按手牌顺序回退', () => {
    const catalog = { ...CARDS, echo: card('echo', 0, [{ op: 'repeat-last', amount: 1 }]) };
    // 开局洗牌后手牌顺序随机；按实例号排好，让「按手牌顺序回退」可判定（mate#0 是 echo）。
    const run = (deck, extra) => { const s = mateTurn(start([hero(filler), mate(deck, { catalog }), foe()], extra)); s.piles.mate.hand.sort(); return s; };
    const mixed = ['echo', 'basic-defend', 'basic-defend', 'basic-defend', 'basic-defend'];
    const v4 = run(mixed);
    assert.equal(v4.rulesVersion, 4);
    assert.deepEqual(chooseAllyPlay(v4, 'mate'), { inst: 'mate#1' });
    assert.equal(chooseAllyPlay(run(Array(5).fill('echo')), 'mate'), null);
    const v3 = run(mixed, { rulesVersion: 3 });
    assert.equal(v3.rulesVersion, 3);
    assert.deepEqual(chooseAllyPlay(v3, 'mate'), { inst: 'mate#0' });
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

test('速度规则：按职业原型 / 敌人档位给基准，按 ID 确定性浮动；规则版本为 4', () => {
    assert.equal(COMBAT_RULES.version, 4);
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

test('道具目标（助手 10-30）：回复道具对己方参战角色使用，每名存活己方单位各一个动作，作用于选中的单位；不能对敌人用；倒下的队友不可选', () => {
    const items = [{ itemId: 'it-potion', name: '回春丹', count: 2, effects: [{ op: 'heal', amount: 12, target: 'ally' }] }];
    const s = start([hero(filler, { hp: 20 }), mate(filler, { hp: 10 }), foe()], { items });
    assert.deepEqual(legalActions(s).filter((a) => a.type === 'item').map((a) => a.targetId).sort(), ['hero', 'mate']);
    assert.equal(applyAction(s, { type: 'item', itemId: 'it-potion', targetId: 'foe' }).error.reason, 'invalid-target');
    const r = act(s, { type: 'item', itemId: 'it-potion', targetId: 'mate' });
    assert.deepEqual([r.units.hero.hp, r.units.mate.hp, r.items.list[0].count], [20, 22, 1]);
    const down = start([hero(filler, { hp: 20 }), mate(filler, { hp: 10 }), foe()], { items });
    down.units.mate.alive = false;
    assert.deepEqual(legalActions(down).filter((a) => a.type === 'item').map((a) => a.targetId), ['hero']);
});

test('道具模板扩充（计划 3.8）：伤害与减益道具对敌方（单体列每名敌人、群体不带目标），攻击增幅单体列每名己方、群体不带目标；能量与抽牌只给使用者', async () => {
    const { ITEM_TEMPLATES, itemFromTemplate } = await import('../src/combat/card-templates.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const keys = Object.keys(ITEM_TEMPLATES);
    const items = keys.map((k) => ({ itemId: `it-${k}`, name: k, count: 1, effects: itemFromTemplate(k).effects }));
    for (const it of items) {
        const n = normalizeLedgerEntry({ id: `item|hero|${it.itemId}`, type: 'item', character: 'hero', anchor: { messageId: 1, swipeId: 0, tagHash: it.itemId, occurrence: 0 },
            payload: { itemId: it.itemId, name: it.name, count: 1, effects: it.effects, description: '' }, createdAt: 1 });
        assert.equal(n.ok, true, `${it.name} ${JSON.stringify(n.errors)}`);
    }
    const s = start([hero(filler), mate(filler), foe(), foe({ id: 'foe2', name: '敌人2' })], { items: items.slice(0, 12) });
    const s2 = start([hero(filler), mate(filler), foe(), foe({ id: 'foe2', name: '敌人2' })], { items: items.slice(12) });
    const targets = (k) => [s, s2].flatMap((st) => legalActions(st)).filter((a) => a.type === 'item' && a.itemId === `it-${k}`).map((a) => a.targetId ?? null).sort();
    for (const k of ['dagger', 'poison-dart', 'weaken-powder', 'sunder', 'frail-dust']) assert.deepEqual(targets(k), ['foe', 'foe2'], k);
    for (const k of ['potion', 'barrier', 'purify', 'war-tonic']) assert.deepEqual(targets(k), ['hero', 'mate'], k);
    for (const k of ['bomb', 'toxic-cloud', 'smoke', 'war-drum', 'tonic', 'scroll']) assert.deepEqual(targets(k), [null], k);
    const dart = act(s, { type: 'item', itemId: 'it-poison-dart', targetId: 'foe2' });
    assert.deepEqual([dart.units.foe.statuses.poison, dart.units.foe2.statuses.poison], [undefined, 6]);
    const drum = act(s2, { type: 'item', itemId: 'it-war-drum' });
    assert.deepEqual([drum.units.hero.statuses.strength, drum.units.mate.statuses.strength, drum.units.foe.statuses.strength], [1, 1, undefined]);
    const tonic = act(s2, { type: 'item', itemId: 'it-war-tonic', targetId: 'mate' });
    assert.deepEqual([tonic.units.hero.statuses.strength, tonic.units.mate.statuses.strength], [undefined, 2]);
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


// ── 规则 v4 第一批：牌实例层、选牌阶段、触发总线、关键字与新效果 ──
const innate = (c) => ({ ...c, innate: true });
const V4 = {
    ...CARDS,
    sulk: innate(card('sulk', 0, [onSelf('weak', 2)])),
    sift: innate(card('sift', 0, [{ op: 'discard', amount: 1, mode: 'choose' }, { op: 'draw', amount: 1 }])),
    reflex: card('reflex', 1, [dmg(3)], { type: 'attack', onDiscard: [{ op: 'draw', amount: 2 }] }),
    toss: innate(card('toss', 0, [{ op: 'discard', amount: 2, mode: 'random' }])),
    haze: innate(card('haze', 1, [{ op: 'block', amount: 3, target: 'self' }], { ethereal: true })),
    tactic: innate(card('tactic', 0, [], { unplayable: true, onDiscard: [{ op: 'energy', amount: 2 }] })),
    calm: innate(card('calm', 1, [{ op: 'block', amount: 4, target: 'self' }])),
    mirror: innate(card('mirror', 1, [{ op: 'copy', amount: 1, from: 'self', to: 'hand' }, { op: 'block', amount: 3, target: 'self' }])),
    forge: innate(card('forge', 1, [{ op: 'create', card: 'token-shard', amount: 2, to: 'hand' }])),
    swarm: innate(card('swarm', 0, [{ op: 'create', card: 'token-spark', amount: 3, to: 'hand' }])),
    heavyI: innate({ ...CARDS.heavy, id: 'heavyI' }),
    echo: innate(card('echo', 1, [{ op: 'repeat-last', amount: 1 }])),
    twice: innate(card('twice', 1, [{ op: 'replay-next', amount: 1, cardType: 'attack' }])),
    jab6: innate(card('jab6', 1, [dmg(6)], { type: 'attack' })),
    rampage: innate(card('rampage', 0, [dmg(5), { op: 'grow', amount: 3 }, { op: 'copy', amount: 1, from: 'self', to: 'hand' }], { type: 'attack' })),
    combo: innate(card('combo', 0, [dmg(2), { op: 'conditional', when: { kind: 'same-card-gte', value: 1 }, then: [dmg(4)] }], { type: 'attack' })),
    frenzy: innate(card('frenzy', 1, [{ op: 'buff', trigger: 'card-played', cardType: 'attack', turns: 1, then: [{ op: 'block', amount: 2, target: 'self' }] }])),
    hone: innate(card('hone', 2, [dmg(3), { op: 'cost-mod', amount: -1, mode: 'self', scope: 'combat' }], { type: 'attack' })),
    dup: innate(card('dup', 1, [{ op: 'copy', amount: 1, from: 'choose', to: 'hand' }])),
};
const hero4 = (deck, extra = {}) => hero(deck, { catalog: V4, ...extra });
const fill = (n, id = 'basic-defend') => Array.from({ length: n }, () => id);
const weakDraw = { id: 'p-weak-draw', name: '虚弱多抽', trigger: 'turn-start', effects: [{ op: 'conditional', when: { kind: 'self-has', value: 'weak' }, then: [{ op: 'draw', amount: 1 }] }] };

test('v4 self-has：自身虚弱时回合开始多抽 1 张', () => {
    const deck = ['sulk', ...fill(9, 'basic-strike')];
    let s = play(start([hero4(deck, { passives: [weakDraw] }), foe()]), 'hero#0');
    assert.equal(s.units.hero.statuses.weak, 2);
    s = act(s, { type: 'end-turn' });
    assert.equal(s.units.hero.statuses.weak, 1);
    assert.equal(s.piles.hero.hand.length, 6);
    const plain = act(start([hero4(deck, { passives: [weakDraw] }), foe()]), { type: 'end-turn' });
    assert.equal(plain.piles.hero.hand.length, 5);
});

test('v4 选牌弃牌：打出时暂停等玩家选，被弃时效果触发，待选阶段只接受 choose，重放一致；回合末弃牌不算被弃', () => {
    const setup = { controlledId: 'hero', units: [hero4(['sift', ...fill(9, 'reflex')]), foe()] };
    let s = play(start(setup.units), 'hero#0');
    assert.equal(s.pending.kind, 'discard');
    assert.equal(s.pending.count, 1);
    assert.equal(s.pending.options.length, 4);
    assert.equal(legalActions(s).length, 4);
    assert.ok(legalActions(s).every((a) => a.type === 'choose' && a.insts.length === 1));
    assert.equal(applyAction(s, { type: 'end-turn' }).error.reason, 'choice-pending');
    assert.equal(applyAction(s, { type: 'choose', insts: ['hero#0'] }).error.reason, 'invalid-choice');
    const pick = s.pending.options[0];
    const chosen = applyAction(s, { type: 'choose', insts: [pick] });
    assert.equal(chosen.ok, true, JSON.stringify(chosen.error));
    s = chosen.state;
    assert.deepEqual(chosen.events.filter((e) => e.type === 'discard').map((e) => e.inst), [pick]);
    assert.equal(s.pending, undefined);
    assert.equal(s.play, undefined);
    assert.equal(s.piles.hero.hand.length, 6);
    assert.deepEqual(s.piles.hero.discard, [pick, 'hero#0']);
    const replay = replayBattle(setup, SEED, [{ type: 'play', inst: 'hero#0' }, { type: 'choose', insts: [pick] }]);
    assert.equal(replay.ok, true, JSON.stringify(replay.error));
    assert.deepEqual(replay.state, s);
    assert.equal(applyAction(s, { type: 'choose', insts: [s.piles.hero.hand[0]] }).error.reason, 'no-choice-pending');
    const ended = applyAction(start(setup.units), { type: 'end-turn' });
    assert.equal(ended.events.filter((e) => e.type === 'discard').length, 0);
});


test('v4 随机弃牌按种子；不能打出的牌只能被弃；虚无回合末消耗且回合末弃牌不触发被弃时；固有进首手、多于抽牌数时首回合多抽', () => {
    const s = start([hero4(['toss', 'tactic', ...fill(8, 'basic-strike')]), foe()]);
    assert.ok(['hero#0', 'hero#1'].every((i) => s.piles.hero.hand.includes(i)));
    assert.equal(applyAction(s, { type: 'play', inst: 'hero#1' }).error.reason, 'card-unplayable');
    assert.ok(!legalActions(s).some((a) => a.inst === 'hero#1'));
    const tossed = applyAction(s, { type: 'play', inst: 'hero#0' });
    assert.equal(tossed.ok, true, JSON.stringify(tossed.error));
    const gone = tossed.events.filter((e) => e.type === 'discard').map((e) => e.inst);
    assert.equal(gone.length, 2);
    assert.equal(tossed.state.units.hero.energy, 3 + (gone.includes('hero#1') ? 2 : 0));
    assert.equal(tossed.state.piles.hero.hand.length, 2);
    assert.deepEqual(applyAction(s, { type: 'play', inst: 'hero#0' }).state, tossed.state);
    const ended = applyAction(start([hero4(['haze', 'tactic', ...fill(8, 'basic-strike')]), foe()]), { type: 'end-turn' });
    assert.equal(ended.ok, true, JSON.stringify(ended.error));
    assert.deepEqual(ended.state.piles.hero.exhaust, ['hero#0']);
    assert.ok(ended.state.piles.hero.discard.includes('hero#1'));
    assert.equal(ended.events.filter((e) => e.type === 'discard').length, 0);
    assert.equal(ended.state.units.hero.energy, 3);
    const many = start([hero4([...fill(6, 'calm'), ...fill(4, 'basic-strike')]), foe()]);
    assert.equal(many.piles.hero.hand.length, 6);
    assert.ok([0, 1, 2, 3, 4, 5].every((i) => many.piles.hero.hand.includes(`hero#${i}`)));
});

test('v4 复制与生成：临时牌带新实例号、只在本场存在，生成牌登记进图鉴；每回合临时牌有上限', () => {
    let s = start([hero4(['mirror', 'forge', ...fill(8, 'basic-defend')]), foe()]);
    s = play(s, 'hero#0');
    assert.ok(!s.piles.hero.hand.includes('hero#0'));
    assert.ok(s.piles.hero.hand.includes('hero#t1'));
    assert.deepEqual(s.cards['hero#t1'], { owner: 'hero', cardId: 'mirror', upgraded: false, temp: true });
    assert.equal(cardView(s, 'hero#t1').temp, true);
    s = play(s, 'hero#1');
    assert.ok(s.piles.hero.hand.includes('hero#t2') && s.piles.hero.hand.includes('hero#t3'));
    assert.equal(s.catalog.hero['token-shard'].name, '碎刃');
    s = play(s, 'hero#t2', 'foe');
    assert.equal(s.units.foe.hp, 56);
    assert.deepEqual(s.piles.hero.exhaust, ['hero#t2']);
    let w = start([hero4([...fill(4, 'swarm'), ...fill(6, 'basic-defend')]), foe()]);
    for (const inst of ['hero#0', 'hero#1', 'hero#2', 'hero#3']) w = play(w, inst);
    assert.equal(Object.values(w.cards).filter((r) => r.temp).length, COMBAT_RULES.tempCardsPerTurn);
    assert.equal(w.piles.hero.hand.length, COMBAT_RULES.handLimit);
});


test('v4 重复上一张与下一张多结算：不付费、不移动那张牌、不算出牌；多结算按次数乘', () => {
    let s = start([hero4(['heavyI', 'echo', 'twice', 'jab6', ...fill(6, 'basic-defend')], { energy: 10 }), foe({ maxHp: 100 })]);
    s = play(s, 'hero#0', 'foe');
    assert.equal(s.units.foe.hp, 85);
    const echoed = applyAction(s, { type: 'play', inst: 'hero#1' });
    assert.equal(echoed.ok, true, JSON.stringify(echoed.error));
    s = echoed.state;
    assert.equal(s.units.foe.hp, 70);
    assert.equal(echoed.events.find((e) => e.type === 'repeat').inst, 'hero#0');
    assert.equal(s.units.hero.cardsPlayed, 2);
    s = play(s, 'hero#2');
    s = play(s, 'hero#3', 'foe');
    assert.equal(s.units.foe.hp, 58);
    assert.deepEqual(s.units.hero.replayNext, []);
    assert.equal(s.units.hero.energy, 5);
});

test('v4 同名连出：本场成长随复制带走；本回合同名牌第 N 次追加效果', () => {
    let s = start([hero4(['rampage', ...fill(9, 'basic-defend')]), foe({ maxHp: 100 })]);
    s = play(s, 'hero#0', 'foe');
    assert.equal(s.units.foe.hp, 95);
    assert.equal(s.cards['hero#0'].grow, 3);
    assert.equal(s.cards['hero#t1'].grow, 3);
    assert.equal(cardView(s, 'hero#t1').effects[0].amount, 8);
    s = play(s, 'hero#t1', 'foe');
    assert.equal(s.units.foe.hp, 87);
    assert.equal(s.cards['hero#t2'].grow, 6);
    let k = start([hero4(['combo', 'combo', ...fill(8, 'basic-defend')]), foe()]);
    k = play(k, 'hero#0', 'foe');
    assert.equal(k.units.foe.hp, 58);
    k = play(k, 'hero#1', 'foe');
    assert.equal(k.units.foe.hp, 52);
});

test('v4 触发总线与限时 BUFF：出牌被动可限牌型、击杀触发、BUFF 在回合结束移除', () => {
    const tempo = { id: 'p-tempo', name: '节奏', trigger: 'card-played', cardType: 'skill', effects: [{ op: 'block', amount: 1, target: 'self' }] };
    const feast = { id: 'p-feast', name: '饱餐', trigger: 'kill', effects: [{ op: 'block', amount: 7, target: 'self' }] };
    let s = start([hero4(['frenzy', 'jab6', ...fill(8, 'basic-defend')], { passives: [tempo, feast] }), foe({ maxHp: 6 }), foe({ id: 'foe2' })]);
    s = play(s, 'hero#0');
    assert.equal(s.units.hero.block, 1);
    assert.equal(s.units.hero.buffs.length, 1);
    const hit = applyAction(s, { type: 'play', inst: 'hero#1', targetId: 'foe' });
    assert.equal(hit.ok, true, JSON.stringify(hit.error));
    s = hit.state;
    assert.equal(s.units.foe.alive, false);
    assert.equal(s.outcome, null);
    assert.equal(s.units.hero.block, 10);
    assert.ok(hit.events.some((e) => e.type === 'buff-trigger' && e.trigger === 'card-played'));
    s = act(s, { type: 'end-turn' });
    assert.deepEqual(s.units.hero.buffs, []);
});

test('v4 单张减费随实例保留；从手牌选一张复制；v3 setup 仍可建局', () => {
    const s = play(start([hero4(['hone', ...fill(9, 'basic-defend')]), foe()]), 'hero#0', 'foe');
    assert.equal(s.cards['hero#0'].costMod, -1);
    assert.equal(cardView(s, 'hero#0').cost, 1);
    assert.equal(cardView(s, 'hero#0').baseCost, 2);
    let d = play(start([hero4(['dup', 'jab6', ...fill(8, 'basic-defend')]), foe()]), 'hero#0');
    assert.equal(d.pending.kind, 'copy');
    assert.equal(legalActions(d).length, 4);
    d = act(d, { type: 'choose', insts: ['hero#1'] });
    assert.equal(d.cards['hero#t1'].cardId, 'jab6');
    assert.ok(d.piles.hero.hand.includes('hero#t1'));
    const units = [hero(['basic-strike', 'basic-defend', 'basic-strike', 'basic-defend', 'basic-strike']), foe()];
    assert.equal(createBattle({ controlledId: 'hero', units, rulesVersion: 3 }, SEED).ok, true);
    assert.equal(createBattle({ controlledId: 'hero', units, rulesVersion: 2 }, SEED).error.reason, 'rules-version-mismatch');
});


// ── v4 第二批机制：人工制品、脆弱、对方出牌、敌方塞状态牌 ──
const artifactPassive = { id: 'plating', name: '人工制品', trigger: 'battle-start', effects: [{ op: 'status', status: 'artifact', stacks: 2, target: 'self' }] };

test('人工制品：抵消下一次减益并减 1 层，用完后减益照常生效', () => {
    const catalog = { ...CARDS, sap: card('sap', 0, [{ op: 'status', status: 'weak', stacks: 2, target: 'enemy' }]) };
    let s = start([hero(['sap', 'sap', 'sap'], { energy: 10, catalog }), foe({ passives: [artifactPassive] })]);
    assert.equal(s.units.foe.statuses.artifact, 2);
    const first = applyAction(s, { type: 'play', inst: 'hero#0', targetId: 'foe' });
    assert.equal(first.ok, true, JSON.stringify(first.error));
    assert.deepEqual(first.events.filter((e) => e.type === 'artifact').map((e) => [e.target, e.status]), [['foe', 'weak']]);
    assert.equal(first.state.units.foe.statuses.artifact, 1);
    assert.equal(first.state.units.foe.statuses.weak, undefined);
    s = play(first.state, 'hero#1', 'foe');
    assert.equal(s.units.foe.statuses.artifact, undefined);
    assert.equal(s.units.foe.statuses.weak, undefined);
    s = play(s, 'hero#2', 'foe');
    assert.equal(s.units.foe.statuses.weak, 2);
});

test('脆弱：承受方获得的格挡 ×0.75 向下取整，本单位回合结束减 1 层', () => {
    const catalog = { ...CARDS, brittle: card('brittle', 0, [onSelf('frail', 2)]) };
    let s = start([hero(['brittle', 'basic-defend', 'footwork'], { energy: 10, catalog }), foe()]);
    s = play(s, 'hero#0');
    assert.equal(s.units.hero.statuses.frail, 2);
    s = play(s, 'hero#2');
    s = play(s, 'hero#1');
    assert.equal(s.units.hero.block, 5);
    s = act(s, { type: 'end-turn' });
    assert.equal(s.units.hero.statuses.frail, 1);
});

test('对方出牌：对侧被动按牌型接收，伤害的主目标是出牌者', () => {
    const passives = [
        { id: 'enrage', name: '激怒', trigger: 'foe-card-played', cardType: 'skill', effects: [onSelf('strength', 1)] },
        { id: 'beat', name: '律动', trigger: 'foe-card-played', effects: [dmg(2)] },
    ];
    let s = start([hero(['basic-strike', 'flex'], { energy: 10 }), foe({ passives })]);
    const strike = applyAction(s, { type: 'play', inst: 'hero#0', targetId: 'foe' });
    assert.equal(strike.ok, true, JSON.stringify(strike.error));
    assert.deepEqual(strike.events.filter((e) => e.type === 'passive').map((e) => [e.unitId, e.passiveId, e.trigger]), [['foe', 'beat', 'foe-card-played']]);
    s = strike.state;
    assert.equal(s.units.hero.hp, 48);
    assert.equal(s.units.foe.statuses.strength, undefined);
    s = play(s, 'hero#1');
    assert.equal(s.units.foe.statuses.strength, 1);
    assert.equal(s.units.hero.hp, 45);
});

test('敌方技能把状态牌塞进我方抽牌堆：临时牌、归主角、不能打出', () => {
    const daze = { id: 'daze', name: '眩晕', intent: 'debuff', effects: [{ op: 'create', card: 'status-daze', amount: 2, to: 'draw' }] };
    let s = start([hero(['basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend'], { energy: 10 }), foe({ skills: [daze] })]);
    const ended = applyAction(s, { type: 'end-turn' });
    assert.equal(ended.ok, true, JSON.stringify(ended.error));
    assert.deepEqual(ended.events.filter((e) => e.type === 'card-created').map((e) => [e.unitId, e.cardId, e.to]),
        [['hero', 'status-daze', 'draw'], ['hero', 'status-daze', 'draw']]);
    s = ended.state;
    const dazes = Object.entries(s.cards).filter(([, ref]) => ref.cardId === 'status-daze');
    assert.equal(dazes.length, 2);
    assert.ok(dazes.every(([, ref]) => ref.owner === 'hero' && ref.temp === true));
    assert.equal(s.catalog.hero['status-daze'].unplayable, true);
    const inHand = dazes.map(([inst]) => inst).filter((inst) => s.piles.hero.hand.includes(inst));
    assert.ok(inHand.length > 0);
    for (const inst of inHand) {
        assert.ok(!legalActions(s).some((a) => a.type === 'play' && a.inst === inst));
        assert.equal(applyAction(s, { type: 'play', inst }).error.reason, 'card-unplayable');
    }
});

test('schema：技能可写生成状态牌', () => {
    const skill = normalizeSkill({ id: 'wound', name: '刺伤', intent: 'debuff', effects: [{ op: 'create', card: 'status-wound', amount: 1, to: 'discard' }] });
    assert.equal(skill.ok, true, JSON.stringify(skill.errors));
    assert.deepEqual(skill.value.effects, [{ op: 'create', card: 'status-wound', amount: 1, to: 'discard' }]);
});


// 全队覆灭（setup.wipe，助手 10-29 选 B）：操控角色倒下后队友托管作战，我方全员倒下才判负。
const WIPE_CARDS = {
    ...CARDS,
    bloodlet: card('bloodlet', 0, [{ op: 'self-damage', amount: 3 }]),
    kamikaze: card('kamikaze', 0, [dmg(15), { op: 'self-damage', amount: 5 }], { type: 'attack' }),
};
const venom = { id: 'venom', name: '毒雾', intent: 'debuff', effects: [{ op: 'status', status: 'poison', stacks: 3, target: 'all-enemies' }] };
const fallen = (deck, hp) => hero(deck, { hp, catalog: WIPE_CARDS });

test('wipe：操控角色出牌自伤倒下后队友继续托管直到分出胜负；不带 wipe 的旧 setup 仍当场判负；重放一致', () => {
    const units = [fallen(['bloodlet', ...DEFENDS], 3), mate(Array(5).fill('heavy')), foe({ maxHp: 40 })];
    const legacy = play(start(units), 'hero#0');
    assert.deepEqual([legacy.units.hero.alive, legacy.outcome], [false, 'defeat']);
    const setup = { controlledId: 'hero', wipe: true, units };
    const created = createBattle(setup, SEED);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    assert.equal(created.state.wipe, true);
    const r = applyAction(created.state, { type: 'play', inst: 'hero#0' });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    const s = r.state;
    assert.deepEqual([s.units.hero.alive, s.units.mate.alive, s.units.foe.alive, s.outcome, s.phase], [false, true, false, 'victory', 'ended']);
    const down = r.events.findIndex((e) => e.type === 'defeated' && e.unitId === 'hero');
    assert.ok(down >= 0 && r.events.slice(down).some((e) => e.type === 'act' && e.unitId === 'mate'));
    assert.ok(!r.events.slice(down).some((e) => e.type === 'turn-start'));
    assert.deepEqual(replayBattle(setup, SEED, [{ type: 'play', inst: 'hero#0' }]).state, s);
    assert.equal(createBattle({ ...setup, wipe: 'yes' }, SEED).error?.reason, 'invalid-setup');
    assert.equal(start(units).wipe, undefined);
});

test('wipe：操控角色在自己回合开始时被中毒击倒，时间轴照常推进，不停在出牌阶段', () => {
    const r = applyAction(start([fallen(filler, 2), mate(Array(5).fill('heavy')), foe({ maxHp: 20, skills: [venom] })], { wipe: true }), { type: 'end-turn' });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    const turn = r.events.findIndex((e) => e.type === 'turn-start' && e.unitId === 'hero');
    const down = r.events.findIndex((e) => e.type === 'defeated' && e.unitId === 'hero');
    assert.ok(turn >= 0 && down > turn, JSON.stringify(r.events.map((e) => e.type)));
    assert.ok(r.events.slice(down).some((e) => e.type === 'act' && e.unitId === 'mate'));
    assert.deepEqual([r.state.units.hero.alive, r.state.units.mate.alive, r.state.outcome], [false, true, 'victory']);
});

test('wipe：我方全员倒下才判负，战报写全队覆灭；操控角色倒下后双方僵持到步数上限判负时队友仍站着，战报照常写落败', async () => {
    const { buildCombatReport } = await import('../src/combat/report.js');
    const report = (r) => buildCombatReport({ combatId: 'chat-1|9', state: r.state, events: r.events }).text;
    const wiped = applyAction(start([fallen(['bloodlet', ...DEFENDS], 3), mate(filler, { maxHp: 5 }), foe({ skills: [claw(99)] })], { wipe: true }), { type: 'play', inst: 'hero#0' });
    assert.equal(wiped.ok, true, JSON.stringify(wiped.error));
    assert.deepEqual([wiped.state.outcome, wiped.state.units.hero.alive, wiped.state.units.mate.alive], ['defeat', false, false]);
    assert.ok(report(wiped).includes('终局：我方全员倒下，全队覆灭。'), report(wiped));
    const stuck = applyAction(start([fallen(['bloodlet', ...DEFENDS], 3), mate(filler), foe()], { wipe: true }), { type: 'play', inst: 'hero#0' });
    assert.equal(stuck.ok, true, JSON.stringify(stuck.error));
    assert.deepEqual([stuck.state.outcome, stuck.state.units.mate.alive, stuck.state.units.foe.alive], ['defeat', true, true]);
    const text = report(stuck);
    assert.ok(text.includes('终局：我方力竭落败。') && !text.includes('全队覆灭'), text);
});

test('wipe + overkill：操控角色打空最后一名敌人的同时倒下，直接判胜，不交给队友空转', () => {
    const r = applyAction(start([fallen(['kamikaze', ...DEFENDS], 5), mate(filler), foe({ maxHp: 10 })], { wipe: true, overkill: true }), { type: 'play', inst: 'hero#0', targetId: 'foe' });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.deepEqual([r.state.outcome, r.state.units.hero.alive, r.state.units.foe.alive], ['victory', false, false]);
    assert.ok(!r.events.some((e) => e.type === 'act'));
});


test('技能助战两动：setup 带 actions 2 时每次出手连用两次技能；旧 setup 与敌人仍一次，重放一致，非法取值拒收', () => {
    const ally = (extra = {}) => ({ id: 'mate', name: '白露', side: 'ally', kind: 'skill', maxHp: 40, skills: [claw(3)], ...extra });
    const units = (extra) => [hero(Array(5).fill('basic-defend')), ally(extra), foe({ maxHp: 300 })];
    // 每次出手（act）到下一次 act 或主角回合开始之间，该单位使用技能的次数。
    const usesPerAct = (events, unitId) => {
        const out = [];
        events.forEach((e, i) => {
            if (e.type !== 'act' || e.unitId !== unitId) return;
            let n = 0;
            for (const x of events.slice(i + 1)) {
                if (x.type === 'act' || x.type === 'turn-start') break;
                if (x.type === 'skill' && x.unitId === unitId) n += 1;
            }
            out.push(n);
        });
        return out;
    };
    const setup = { controlledId: 'hero', units: units({ actions: 2 }) };
    const created = createBattle(setup, SEED);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    assert.equal(created.state.units.mate.actions, 2);
    const r = applyAction(created.state, { type: 'end-turn' });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    const mateUses = usesPerAct(r.events, 'mate');
    assert.ok(mateUses.length > 0 && mateUses.every((n) => n === 2), JSON.stringify(mateUses));
    const foeUses = usesPerAct(r.events, 'foe');
    assert.ok(foeUses.length > 0 && foeUses.every((n) => n === 1), JSON.stringify(foeUses));
    assert.deepEqual(replayBattle(setup, SEED, [{ type: 'end-turn' }]).state, r.state);

    const old = start(units());
    assert.equal(old.units.mate.actions, undefined);
    const oldUses = usesPerAct(applyAction(old, { type: 'end-turn' }).events, 'mate');
    assert.ok(oldUses.length > 0 && oldUses.every((n) => n === 1), JSON.stringify(oldUses));

    assert.equal(createBattle({ controlledId: 'hero', units: units({ actions: 3 }) }, SEED).error?.reason, 'invalid-stat');
    assert.equal(createBattle({ controlledId: 'hero', units: [hero(Array(5).fill('basic-defend'), { actions: 2 }), ally(), foe()] }, SEED).error?.reason, 'invalid-stat');
});
