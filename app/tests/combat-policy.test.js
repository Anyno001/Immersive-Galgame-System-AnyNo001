// policy 差分测试：对随机战斗里收集到的状态，对比 v0.39.0 原包与改写后的出牌/技能/选牌策略。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/combat/engine.js';
import * as mine from '../src/combat/policy.js';
import { collectStates, loadV039, makeRng } from './helpers/combat-diff-fixtures.js';

const old = loadV039('src/combat/policy.js');
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
    same(mine.POWER_TURNS, old.POWER_TURNS);
    same(mine.MAX_SKILL_REPEAT, old.MAX_SKILL_REPEAT);
});

test('同伴出牌、来袭伤害、敌人意图', { skip: !old }, () => {
    const rng = makeRng(31);
    const states = collectStates(engine, 20);
    const seen = { play: 0, intent: 0, guard: 0 };
    for (const state of states) {
        for (const id of state.order) {
            const play = mine.chooseAllyPlay(state, id);
            same(play, old.chooseAllyPlay(state, id), `chooseAllyPlay ${id}`);
            if (play) seen.play += 1;
            const incoming = mine.incomingDamage(state, id);
            same(incoming, old.incomingDamage(state, id));
            if (incoming > 0) seen.guard += 1;
            for (const roll of [0, 0.25, rng(), 0.999, 1.5, -1, 'x', undefined]) {
                const intent = mine.chooseSkillIntent(state, id, roll);
                same(intent, old.chooseSkillIntent(state, id, roll), `chooseSkillIntent ${id} ${roll}`);
                if (intent) seen.intent += 1;
            }
        }
        // rulesVersion 3 走兜底分支（直接出第一张）。
        const legacy = { ...state, rulesVersion: 3 };
        for (const id of state.order) same(mine.chooseAllyPlay(legacy, id), old.chooseAllyPlay(legacy, id));
        // 历史里连续重复同一技能时要换招。
        const first = (id) => state.units[id].skills?.[0]?.id;
        const repeated = { ...state, history: Object.fromEntries(state.order.map((id) => [id, [first(id), first(id)]])) };
        for (const id of state.order) same(mine.chooseSkillIntent(repeated, id, 0.1), old.chooseSkillIntent(repeated, id, 0.1));
        same(mine.chooseAllyPlay(state, 'nobody'), old.chooseAllyPlay(state, 'nobody'));
    }
    assert.ok(seen.play > 50 && seen.intent > 50 && seen.guard > 20, JSON.stringify(seen));
});

test('选牌：弃牌取价值低、其他取价值高', { skip: !old }, () => {
    const states = collectStates(engine, 15);
    let picks = 0;
    for (const state of states) {
        const hand = state.piles[state.controlledId]?.hand || [];
        for (const mode of ['discard', 'copy', 'cost']) {
            for (const count of [0, 1, 2, 3]) {
                same(mine.pickCards(state, hand, count, mode), old.pickCards(state, hand, count, mode));
                picks += 1;
            }
        }
        same(mine.pickCards(state, [...hand, 'nope'], 2, 'discard'), old.pickCards(state, [...hand, 'nope'], 2, 'discard'));
    }
    assert.ok(picks > 100);
});
