import test from 'node:test';
import assert from 'node:assert/strict';
import { settleCombat } from '../src/scene/stats/stat-battle.js';
import { applyChallenge, challengeCost } from '../src/scene/stats/stat-challenge.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';

const newCtx = () => ({ changes: [], diagnostics: [], events: [], flags: {}, random: () => 0.5 });
const withBars = (bars, skills = null) => {
    const base = createStatsState();
    return { ...base, protagonist: { ...base.protagonist, bars: { ...base.protagonist.bars, ...bars }, ...(skills ? { skills } : {}) } };
};
const directive = (over = {}) => ({ kind: 'challenge', reportId: 'rabc1', outcome: '失败', tier: '普通', stake: '压力', domain: '话术', floor: 12, ...over });
const settle = (state, d, ctx = newCtx()) => ({ state: settleCombat(state, [d], ctx), ctx });

test('失败按难度档扣压力：轻松、普通、艰难分别上升一、二、三次', () => {
    for (const [tier, delta] of [['轻松', 10], ['普通', 20], ['艰难', 30]]) {
        const { state } = settle(withBars({ stress: 10 }), directive({ tier }));
        assert.equal(state.protagonist.bars.stress, 10 + delta, tier);
        assert.equal(state.protagonist.bars.stamina, 100);
    }
});

test('失败按难度档扣体力：中、重、重加熬夜', () => {
    for (const [tier, delta] of [['轻松', -15], ['普通', -30], ['艰难', -50]]) {
        const { state } = settle(withBars({}), directive({ tier, stake: '体力' }));
        assert.equal(state.protagonist.bars.stamina, 100 + delta, tier);
        assert.equal(state.protagonist.bars.stress, 0);
        assert.equal(challengeCost(tier, '体力').stamina, delta);
    }
});

test('放弃的代价为失败的一半，没有收获', () => {
    for (const [tier, stress, stamina] of [['轻松', 5, -8], ['普通', 10, -15], ['艰难', 15, -25]]) {
        const asStress = settle(withBars({ stress: 20 }), directive({ outcome: '放弃', tier }));
        assert.equal(asStress.state.protagonist.bars.stress, 20 + stress, tier);
        const asStamina = settle(withBars({}), directive({ outcome: '放弃', tier, stake: '体力' }));
        assert.equal(asStamina.state.protagonist.bars.stamina, 100 + stamina, tier);
        assert.equal(asStamina.state.protagonist.skills.话术.marked, false);
    }
});

test('圆满与勉强都没有代价：压力下降一次并标记领域技能成长', () => {
    for (const outcome of ['圆满', '勉强']) {
        const { state, ctx } = settle(withBars({ stress: 40 }), directive({ outcome, tier: '艰难', stake: '体力' }));
        assert.equal(state.protagonist.bars.stress, 30, outcome);
        assert.equal(state.protagonist.bars.stamina, 100, outcome);
        assert.equal(state.protagonist.skills.话术.marked, true, outcome);
        assert.equal(ctx.flags.challenge.outcome, outcome);
    }
});

test('领域不在技能表时回落到最高的特有技能', () => {
    const skills = { 烹饪: { value: 30, marked: false }, 话术: { value: 70, marked: false } };
    const { state } = settle(withBars({}, skills), directive({ outcome: '圆满', domain: '屠龙术' }));
    assert.equal(state.protagonist.skills.话术.marked, true);
    assert.equal(state.protagonist.skills.烹饪.marked, false);
});

test('同一战报重复出现只结算一次', () => {
    const first = settle(withBars({ stress: 0 }), directive());
    const again = settle(first.state, directive());
    assert.equal(again.state, first.state);
    assert.equal(first.state.clock.challenges, 1);
    const other = settle(first.state, directive({ reportId: 'rabc2' }));
    assert.equal(other.state.protagonist.bars.stress, 40);
    assert.equal(other.state.clock.challenges, 2);
});

test('结算不改动传入的状态，楼层回退即回到结算前', () => {
    const before = withBars({ stress: 10 });
    const snapshot = JSON.stringify(before);
    const { state } = settle(before, directive());
    assert.equal(JSON.stringify(before), snapshot);
    assert.notEqual(state, before);
});

test('压力、体力钳在 0 到 100，不出现 NaN', () => {
    const high = settle(withBars({ stress: 95, stamina: 10 }), directive({ tier: '艰难' }));
    assert.equal(high.state.protagonist.bars.stress, 100);
    const low = settle(withBars({ stress: 95, stamina: 10 }), directive({ tier: '艰难', stake: '体力' }));
    assert.equal(low.state.protagonist.bars.stamina, 0);
    const floor = settle(withBars({ stress: 0 }), directive({ outcome: '圆满' }));
    assert.equal(floor.state.protagonist.bars.stress, 0);
    for (const { state } of [high, low, floor]) for (const value of Object.values(state.protagonist.bars)) assert.ok(Number.isFinite(value));
    const junk = settle(withBars({}), directive({ tier: '不存在', stake: undefined }));
    for (const value of Object.values(junk.state.protagonist.bars)) assert.ok(Number.isFinite(value));
});

test('未登记的代价类别按压力结算并记诊断', () => {
    const { state, ctx } = settle(withBars({ money: 500, stress: 0 }), directive({ stake: '赔礼' }));
    assert.equal(state.protagonist.bars.money, 500);
    assert.equal(state.protagonist.bars.stress, 20);
    assert.deepEqual(ctx.diagnostics.map((d) => d.code), ['challenge-stake-degraded']);
});

test('没有合法结局的指令不改变状态；旧存档缺少时钟字段时按零计', () => {
    const before = withBars({});
    assert.equal(applyChallenge(before, directive({ outcome: '未知' }), newCtx()), before);
    const legacy = { ...before, clock: { day: 1, lastHour: null, floorsSinceDay: 0, stayedUp: false } };
    const { state } = settle(legacy, directive({ floor: 7 }));
    assert.equal(state.clock.challenges, 1);
    assert.equal(state.clock.lastChallengeFloor, 7);
});

test('一楼没有挑战指令时结算原样返回', () => {
    const before = withBars({});
    assert.equal(settleCombat(before, [], newCtx()), before);
});
