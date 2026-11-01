// battle-state 差分测试：对随机战斗里收集到的状态，逐项对比 v0.39.0 原包与改写后的源码。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/combat/engine.js';
import * as mine from '../src/combat/battle-state.js';
import { CARD_POOL, collectStates, loadV039, makeRng, pick } from './helpers/combat-diff-fixtures.js';

const old = loadV039('src/combat/battle-state.js');
// 原包的 bundle 加载后会占住事件循环，测试跑完需要主动退出。
after(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 100);
});

let assertions = 0;
function same(actual, expected, message) {
    assert.deepStrictEqual(actual, expected, message);
    assertions += 1;
}

test('导出名与常量一致', { skip: !old }, () => {
    same(Object.keys(mine).sort(), Object.keys(old).sort());
    same(mine.LOW_HP_RATIO, old.LOW_HP_RATIO);
    for (const side of ['ally', 'enemy', 'x']) same(mine.opposite(side), old.opposite(side));
    same(mine.cardCountKey('hero#3'), old.cardCountKey('hero#3'));
});

test('状态查询：存活单位、目标、牌面、意图', { skip: !old }, () => {
    const states = collectStates(engine, 15);
    for (const state of states) {
        for (const side of ['ally', 'enemy']) {
            same(mine.livingIds(state, side), old.livingIds(state, side));
            same(mine.weakestId(state, side), old.weakestId(state, side));
            same(mine.lowestRatioId(state, side), old.lowestRatioId(state, side));
        }
        for (const inst of [...Object.keys(state.cards), 'nope']) {
            const view = mine.cardView(state, inst);
            same(view, old.cardView(state, inst), `cardView ${inst}`);
            if (view) for (const energy of [0, 1, 2, 3]) same(mine.canAfford(view, energy), old.canAfford(view, energy));
        }
        for (const id of state.order) same(mine.describeIntent(state, id), old.describeIntent(state, id));
        same(mine.describeIntent(state, 'nobody'), old.describeIntent(state, 'nobody'));
    }
    assert.ok(assertions > 1000);
});

test('效果估算：伤害、格挡、条件', { skip: !old }, () => {
    const rng = makeRng(77);
    const states = collectStates(engine, 8);
    const effectLists = CARD_POOL.map((card) => card.effects);
    effectLists.push(undefined, null, [{ op: 'damage', amount: 7, hits: 3 }], [{ op: 'damage-from-block', target: 'all-enemies' }]);
    for (const effects of effectLists) {
        same(mine.effectsNeedTarget(effects), old.effectsNeedTarget(effects));
        same(mine.effectsPickAlly(effects), old.effectsPickAlly(effects));
    }
    const whens = [
        { kind: 'target-has', value: 'vulnerable' }, { kind: 'self-has', value: 'strength' }, { kind: 'self-hp-below', value: 50 },
        { kind: 'cards-played-gte', value: 2 }, { kind: 'attacks-played-gte', value: 1 }, { kind: 'skills-played-gte', value: 1 },
        { kind: 'same-card-gte', value: 1 }, { kind: 'discarded-gte', value: 1 }, { kind: 'nope' }, undefined,
    ];
    for (const state of states) {
        const ids = state.order;
        for (let i = 0; i < 12; i += 1) {
            const attacker = state.units[pick(rng, ids)];
            const target = rng() < 0.9 ? state.units[pick(rng, ids)] : undefined;
            const aimId = rng() < 0.8 ? target?.id : pick(rng, ids);
            const effects = pick(rng, effectLists);
            same(mine.estimateDamage(state, attacker, target, effects, aimId), old.estimateDamage(state, attacker, target, effects, aimId));
            same(mine.estimateBlock(attacker, effects), old.estimateBlock(attacker, effects));
            same(mine.computeDamage(attacker, target, 6, 2), old.computeDamage(attacker, target, 6, 2));
            same(mine.computeDamage(undefined, target, 9), old.computeDamage(undefined, target, 9));
            same(mine.computeDamage(attacker, undefined, 9, 0), old.computeDamage(attacker, undefined, 9, 0));
            same(mine.computeBlock(attacker, 5), old.computeBlock(attacker, 5));
            same(mine.computeBlock(attacker, 5, target), old.computeBlock(attacker, 5, target));
            same(mine.computeBlock(undefined, 5, target), old.computeBlock(undefined, 5, target));
        }
        const unit = state.units[state.controlledId];
        for (const when of whens) {
            for (const inst of [null, 'strike']) same(mine.conditionHolds(state, unit, when, state.order[0], inst), old.conditionHolds(state, unit, when, state.order[0], inst));
        }
    }
});
