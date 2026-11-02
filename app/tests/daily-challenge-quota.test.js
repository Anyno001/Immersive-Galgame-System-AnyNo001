import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeQuota, parseChallengeStart } from '../src/scene/challenge-directives.js';
import { applyChallenge } from '../src/scene/stats/stat-challenge.js';
import { settleDay, settleSkip, settleSoftDay } from '../src/scene/stats/stat-day.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';

const random = () => 0.5;
const newCtx = () => ({ changes: [], diagnostics: [], events: [], flags: {} });
const used = (floor = 10, over = {}) => applyChallenge(createStatsState(), { kind: 'challenge', reportId: 'rq1', outcome: '勉强', tier: '普通', stake: '压力', domain: '话术', floor, ...over }, newCtx());

test('新存档额度可用，用掉一次后当天不能再开', () => {
    assert.deepEqual(challengeQuota(createStatsState(), { floor: 20 }), { ok: true, used: 0, perDay: 1 });
    const state = used();
    assert.equal(state.clock.challenges, 1);
    assert.deepEqual(challengeQuota(state, { floor: 99 }), { ok: false, reason: 'quota', used: 1, perDay: 1 });
});

test('每日上限可调到三次，超出范围时夹回', () => {
    assert.equal(challengeQuota(used(), { perDay: 2, cooldownFloors: 0, floor: 50 }).ok, true);
    assert.equal(challengeQuota(used(), { perDay: 99, cooldownFloors: 0, floor: 50 }).perDay, 3);
    assert.equal(challengeQuota(used(), { perDay: 0, cooldownFloors: 0, floor: 50 }).perDay, 1);
});

test('楼数冷却：间隔不足时不通过，达到间隔后通过', () => {
    const state = used(10);
    const settings = { perDay: 3, cooldownFloors: 8 };
    assert.deepEqual([13, 17, 18, 40].map((floor) => challengeQuota(state, { ...settings, floor }).ok), [false, false, true, true]);
    assert.equal(challengeQuota(state, { ...settings, floor: 13 }).reason, 'cooldown');
    assert.equal(challengeQuota(state, settings).ok, true);
});

test('额度不通过时标签被忽略，提示词侧据此省略语法行', () => {
    const quota = challengeQuota(used(), { floor: 12 });
    const result = parseChallengeStart('正文\n[igs-challenge:终面]', { quota });
    assert.equal(result.start, null);
    assert.equal(result.diagnostics[0].code, 'challenge-quota');
});

test('跨天、跳过多天、软跨天都清零当天挑战次数，冷却楼号保留', () => {
    const state = used(10);
    assert.equal(state.clock.challenges, 1);
    for (const next of [settleDay(state, { random }), settleSkip(state, 3, { random }), settleSoftDay(state)]) {
        assert.equal(next.clock.challenges, 0);
        assert.equal(next.clock.lastChallengeFloor, 10);
        assert.equal(challengeQuota(next, { floor: 11 }).ok, false);
        assert.equal(challengeQuota(next, { floor: 18 }).ok, true);
    }
});

test('旧存档没有挑战字段时额度按零计', () => {
    const legacy = { ...createStatsState(), clock: { day: 3, lastHour: null, floorsSinceDay: 0, stayedUp: false } };
    assert.equal(challengeQuota(legacy, { floor: 1 }).ok, true);
});
