import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResultFxPlan, normalizeResultFxSettings, resultDetailOf, rollingFrames } from '../src/visual/igs-ui/fx-result-model.js';
import { resolveDiceCommand } from '../src/choices/dice-check.js';

function mockAcuDice({ attr = 62, roll = 17, left = 38, right = 12 } = {}) {
    return {
        getAttributeValue: () => attr,
        checkByCharacter: async () => ({ roll }),
        contest: async () => ({ left: { roll: left }, right: { roll: right } }),
    };
}

test('gate:fx-result settings default off and only true enables', () => {
    assert.deepEqual(normalizeResultFxSettings(undefined), { enabled: false });
    assert.deepEqual(normalizeResultFxSettings({ enabled: 'yes' }), { enabled: false });
    assert.deepEqual(normalizeResultFxSettings({ enabled: true }), { enabled: true });
});

test('gate:fx-result dice-check exposes detail without changing line', async () => {
    const result = await resolveDiceCommand('检定 陈屿 照顾 难度=困难', mockAcuDice(), {});
    assert.equal(result.ok, true);
    assert.equal(result.line, '元叙事：陈屿发起了【照顾】检定，1d100=17，需≤31，【困难成功】。');
    assert.deepEqual(result.detail, {
        kind: 'check', actor: '陈屿', attribute: '照顾', roll: 17, target: 62, threshold: 31,
        tier: '困难成功', outcome: '困难成功', success: true,
    });
});

test('gate:fx-result check plan shows real roll and threshold', async () => {
    const { detail } = await resolveDiceCommand('检定 陈屿 照顾 难度=困难', mockAcuDice(), {});
    const plan = buildResultFxPlan(detail);
    assert.equal(plan.type, 'dice');
    assert.equal(plan.title, '陈屿·照顾');
    assert.deepEqual(plan.reels, [{ label: '1d100', value: 17, sub: '需≤31' }]);
    assert.equal(plan.verdict, '困难成功');
    assert.equal(plan.tone, 'success');
});

test('gate:fx-result tones for crit, fumble and failure', async () => {
    const crit = buildResultFxPlan((await resolveDiceCommand('检定 A 力量', mockAcuDice({ roll: 3 }), {})).detail);
    assert.equal(crit.tone, 'crit');
    const fumble = buildResultFxPlan((await resolveDiceCommand('检定 A 力量', mockAcuDice({ roll: 99 }), {})).detail);
    assert.equal(fumble.tone, 'fumble');
    const fail = buildResultFxPlan((await resolveDiceCommand('检定 A 力量', mockAcuDice({ roll: 80 }), {})).detail);
    assert.equal(fail.tone, 'fail');
    const shortOfHard = buildResultFxPlan((await resolveDiceCommand('检定 A 力量 难度=困难', mockAcuDice({ roll: 50 }), {})).detail);
    assert.equal(shortOfHard.tone, 'fail');
});

test('gate:fx-result contest plan has two reels and winner tone', async () => {
    const { detail } = await resolveDiceCommand('对抗 林晚 理智 vs 白墨 察言观色', mockAcuDice({ attr: 50, left: 38, right: 8 }), {});
    const plan = buildResultFxPlan(detail);
    assert.equal(plan.reels.length, 2);
    assert.deepEqual(plan.reels.map((reel) => reel.value), [38, 8]);
    assert.equal(plan.verdict, '白墨胜出');
    assert.equal(plan.tone, 'fail');
});

test('gate:fx-result fixed plan skips rolling; incomplete detail never fabricates', async () => {
    const fixed = buildResultFxPlan(resultDetailOf(await resolveDiceCommand('必成', null, {})));
    assert.deepEqual(fixed.reels, []);
    assert.equal(fixed.rollMs, 0);
    assert.equal(fixed.verdict, '必定成功');
    assert.equal(buildResultFxPlan(resultDetailOf(await resolveDiceCommand('必败', null, {}))).tone, 'fail');
    assert.equal(buildResultFxPlan(null), null);
    assert.equal(buildResultFxPlan({ kind: 'check', roll: 'x' }), null);
    assert.equal(buildResultFxPlan({ kind: 'contest', left: { roll: 3 }, right: {} }), null);
    assert.equal(buildResultFxPlan({ kind: 'unknown' }), null);
    assert.equal(resultDetailOf(await resolveDiceCommand('无', null, {})), null);
    assert.equal(resultDetailOf(await resolveDiceCommand('检定 A 力量', null, {})), null);
    assert.equal(resultDetailOf({ ok: true, line: 'x', detail: { kind: 'check', roll: 5 } }).kind, 'check');
});

test('gate:fx-result rolling frames always end on the real value', () => {
    let seed = 0;
    const frames = rollingFrames(17, 8, () => { seed = (seed + 0.37) % 1; return seed; });
    assert.equal(frames.length, 8);
    assert.equal(frames[7], 17);
    for (const value of frames) assert.ok(value >= 1 && value <= 100);
    assert.deepEqual(rollingFrames(42, 1), [42]);
});
