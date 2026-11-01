// 战斗引擎差分测试：同一批种子和动作序列，对比 v0.39.0 原包与改写后的源码。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as engine from '../src/combat/engine.js';
import { ACTION_KINDS, chooseAction, kindOf, loadV039, makeRng, randomSetup } from './helpers/combat-diff-fixtures.js';

const old = loadV039('src/combat/engine.js');
const GAMES = 40;
const MAX_STEPS = 400;
const PREFERENCES = ['play', 'hero-skill', 'trait-skill', 'awaken', 'item', 'escape'];
const stats = { assertions: 0, kinds: new Set(), outcomes: {}, finished: 0, tape: [] };

// 原包的 bundle 加载后会占住事件循环，测试跑完需要主动退出。
after(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 100);
});

const snapshot = (value) => JSON.stringify(value);
function same(actual, expected, message) {
    assert.deepStrictEqual(actual, expected, message);
    stats.assertions += 1;
}

test('导出名与原包一致', { skip: !old }, () => {
    same(Object.keys(engine).sort(), Object.keys(old).sort());
});

test('createBattle 非法入参与原包一致', { skip: !old }, () => {
    const cases = [null, {}, { units: [] }, { units: [{ id: 'a' }] }];
    for (const setup of cases) same(engine.createBattle(setup, 1), old.createBattle(setup, 1));
    const good = randomSetup(makeRng(7));
    same(engine.createBattle(good, -1), old.createBattle(good, -1));
    same(engine.createBattle(good, 1.5), old.createBattle(good, 1.5));
    same(engine.createBattle({ ...good, rulesVersion: 9 }, 1), old.createBattle({ ...good, rulesVersion: 9 }, 1));
});

test('随机战斗逐步差分：状态、事件、合法动作、输入不被修改', { skip: !old }, () => {
    for (let game = 0; game < GAMES; game += 1) {
        const rng = makeRng(1000 + game);
        const setup = randomSetup(rng);
        const seed = Math.floor(rng() * 4294967295);
        const prefer = PREFERENCES[game % PREFERENCES.length];
        const a = engine.createBattle(setup, seed);
        const b = old.createBattle(setup, seed);
        same(a, b, `game ${game} createBattle`);
        assert.ok(a.ok, `game ${game} setup 应合法`);
        let stateNew = a.state;
        let stateOld = b.state;
        const actions = [];
        for (let step = 0; step < MAX_STEPS && !stateNew.outcome; step += 1) {
            const legalNew = engine.legalActions(stateNew);
            same(legalNew, old.legalActions(stateOld), `game ${game} step ${step} legalActions`);
            if (!legalNew.length) break;
            const action = chooseAction(rng, legalNew, prefer);
            actions.push(action);
            stats.kinds.add(kindOf(action));
            const before = snapshot(stateNew);
            const rNew = engine.applyAction(stateNew, action);
            const rOld = old.applyAction(stateOld, action);
            same(rNew, rOld, `game ${game} step ${step} applyAction ${snapshot(action)}`);
            assert.equal(snapshot(stateNew), before, `game ${game} step ${step} 输入 state 被修改`);
            stats.assertions += 1;
            assert.ok(rNew.ok, `game ${game} step ${step} 动作应成功`);
            stateNew = rNew.state;
            stateOld = rOld.state;
        }
        if (stateNew.outcome) {
            stats.finished += 1;
            stats.outcomes[stateNew.outcome] = (stats.outcomes[stateNew.outcome] || 0) + 1;
        }
        stats.tape.push({ setup, seed, actions });
        same(engine.actionProgress(stateNew), old.actionProgress(stateOld));
        same(engine.upcomingActors(stateNew, 8), old.upcomingActors(stateOld, 8));
    }
    assert.equal(stats.finished, GAMES, '每场都应打到结束');
});

test('各类动作在整套测试里都出现过', { skip: !old }, () => {
    for (const kind of ACTION_KINDS) assert.ok(stats.kinds.has(kind), `缺少动作种类 ${kind}`);
    for (const outcome of ['victory', 'defeat', 'escape']) assert.ok(stats.outcomes[outcome] > 0, `缺少结局 ${outcome}`);
});

test('replayBattle 差分（含失败步）', { skip: !old }, () => {
    for (const { setup, seed, actions } of stats.tape) {
        same(engine.replayBattle(setup, seed, actions), old.replayBattle(setup, seed, actions));
        const broken = [...actions.slice(0, 3), { type: 'play', inst: 'nope' }, ...actions.slice(3)];
        same(engine.replayBattle(setup, seed, broken), old.replayBattle(setup, seed, broken));
    }
    same(engine.replayBattle(null, 1, []), old.replayBattle(null, 1, []));
});

test('applyAction 非法输入与原包一致', { skip: !old }, () => {
    const { setup, seed } = stats.tape[0];
    const { state } = engine.createBattle(setup, seed);
    const bad = [null, {}, { type: 'nope' }, { type: 'choose', insts: [] }, { type: 'play', inst: 'x' }, { type: 'play' }, { type: 'awaken' }, { type: 'item', itemId: 'zzz' }, { type: 'hero-skill', skillId: 5 }, { type: 'escape' }];
    for (const action of bad) same(engine.applyAction(state, action), old.applyAction(state, action));
    same(engine.applyAction(null, { type: 'end-turn' }), old.applyAction(null, { type: 'end-turn' }));
    same(engine.applyAction({ ...state, version: 99 }, { type: 'end-turn' }), old.applyAction({ ...state, version: 99 }, { type: 'end-turn' }));
});

test('旧状态可继续分支：同一个 state 重复 applyAction 结果一致', () => {
    const { setup, seed } = stats.tape[0];
    const { state } = engine.createBattle(setup, seed);
    const first = engine.applyAction(state, { type: 'end-turn' });
    const second = engine.applyAction(state, { type: 'end-turn' });
    assert.deepStrictEqual(first, second);
    const third = engine.applyAction(first.state, engine.legalActions(first.state).at(-1));
    const fourth = engine.applyAction(first.state, engine.legalActions(first.state).at(-1));
    assert.deepStrictEqual(third, fourth);
});

test('耗时对比（每步 applyAction 平均）', { skip: !old }, () => {
    const time = (mod) => {
        let steps = 0;
        let total = 0;
        for (const { setup, seed, actions } of stats.tape) {
            let state = mod.createBattle(setup, seed).state;
            for (const action of actions) {
                const t0 = performance.now();
                const result = mod.applyAction(state, action);
                total += performance.now() - t0;
                steps += 1;
                state = result.state;
            }
        }
        return { steps, avgMs: total / steps };
    };
    time(engine);
    time(old);
    const fresh = time(engine);
    const legacy = time(old);
    console.log(`applyAction 每步平均: 新 ${fresh.avgMs.toFixed(4)} ms, 旧 ${legacy.avgMs.toFixed(4)} ms, 共 ${fresh.steps} 步`);
    console.log(`差分断言 ${stats.assertions} 个，战斗 ${GAMES} 场，结局 ${JSON.stringify(stats.outcomes)}`);
    assert.ok(fresh.steps > 0);
});
