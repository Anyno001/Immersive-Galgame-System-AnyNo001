import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createBattle } from '../src/combat/engine.js';
import { chooseAllyPlay } from '../src/combat/policy.js';
import { CHALLENGE_FOES, pickFoe } from '../src/combat/challenge-foes.js';
import {
    CHALLENGE_FOE_ID, CHALLENGE_HERO_ID, CHALLENGE_TIER_RULES, CHALLENGE_WILL, buildChallengeSetup, challengeCombatIdFor, challengeOutcomeOf, challengeResultOf, foeThickness, willFor,
} from '../src/combat/challenge-setup.js';
import { STAMINA_LOW, STRESS_HIGH } from '../src/scene/stats/stat-bars.js';

const snapshot = (over = {}) => ({ bars: { stamina: 100, stress: 0 }, skills: { 话术: { value: 60 }, 烹饪: { value: 40 } }, ...over });
const startOf = (over = {}) => ({ event: '终面', domain: '话术', tier: '普通', stake: '压力', counterpart: '', ...over });
const build = (start, state = snapshot()) => buildChallengeSetup({ start, state, user: { name: '我' } });

// 托管打完一局：每步取托管出牌，没有可出的牌就结束回合；回合上限由适配层判定。
function autoplay(setup, seed) {
    let { state } = createBattle(setup, seed);
    for (let guard = 0; guard < 400; guard += 1) {
        const done = challengeResultOf(state, setup.challenge.rounds);
        if (done) return { state, ...done };
        const pick = chooseAllyPlay(state, CHALLENGE_HERO_ID);
        const next = applyAction(state, pick ? { type: 'play', ...pick } : { type: 'end-turn' });
        state = next.ok ? next.state : applyAction(state, { type: 'end-turn' }).state;
    }
    assert.fail('托管没有在步数内打完');
}

test('同一输入得到完全相同的 setup，引擎无需职业档案即可建局', () => {
    const a = build(startOf());
    const b = build(startOf());
    assert.deepEqual(a, b);
    assert.ok(a.ok);
    const created = createBattle(a.setup, 1234);
    assert.ok(created.ok, JSON.stringify(created.error));
    assert.deepEqual(createBattle(a.setup, 1234).state, created.state);
    assert.equal(a.setup.units.find((u) => u.id === CHALLENGE_HERO_ID).kind, 'deck');
    assert.ok(!('classRef' in a.setup.units[0]));
});

test('每个难度档和难关模板都能建局，托管能打出胜负并给出挑战结局', () => {
    for (const tier of Object.keys(CHALLENGE_TIER_RULES)) {
        for (const foe of Object.values(CHALLENGE_FOES)) {
            const { setup } = build(startOf({ tier, event: foe.words[0] }));
            const played = autoplay(setup, 777);
            assert.ok(['win', 'lose'].includes(played.result), `${tier} ${foe.name}`);
            assert.ok(['圆满', '勉强', '失败'].includes(challengeOutcomeOf(played.result, played.willRatio, played)));
        }
    }
});

test('体力低或压力高时意志各降一档，阈值与数值侧一致', () => {
    assert.equal(CHALLENGE_WILL.staminaLow, STAMINA_LOW);
    assert.equal(CHALLENGE_WILL.stressHigh, STRESS_HIGH);
    const base = willFor({ stamina: 100, stress: 0 });
    assert.equal(willFor({ stamina: STAMINA_LOW, stress: STRESS_HIGH }), base);
    assert.equal(willFor({ stamina: STAMINA_LOW - 1, stress: 0 }), base - CHALLENGE_WILL.step);
    assert.equal(willFor({ stamina: 100, stress: STRESS_HIGH + 1 }), base - CHALLENGE_WILL.step);
    assert.equal(willFor({ stamina: 0, stress: 100 }), base - 2 * CHALLENGE_WILL.step);
    const tired = build(startOf(), snapshot({ bars: { stamina: 10, stress: 90 } }));
    assert.equal(tired.setup.units[0].maxHp, base - 2 * CHALLENGE_WILL.step);
});

test('难度越高难关越厚，回合上限在四到六之间递增', () => {
    const hp = ['轻松', '普通', '艰难'].map((tier) => foeThickness(tier).hp);
    assert.deepEqual(hp, [...hp].sort((a, b) => a - b));
    assert.equal(new Set(hp).size, 3);
    const rounds = ['轻松', '普通', '艰难'].map((tier) => foeThickness(tier).rounds);
    assert.deepEqual(rounds, [4, 5, 6]);
});

test('领域留空时取主角最高的领域技能，标签领域优先', () => {
    assert.equal(build(startOf({ domain: '' })).setup.challenge.domain, '话术');
    assert.equal(build(startOf({ domain: '' }), snapshot({ skills: { 话术: { value: 10 }, 烹饪: { value: 70 } } })).setup.challenge.domain, '烹饪');
    assert.equal(build(startOf({ domain: '烹饪' })).setup.challenge.domain, '烹饪');
    assert.equal(build({ event: '', tier: '普通' }).ok, false);
});

test('难关按事件名挑选，对方名字用来给难关命名', () => {
    assert.equal(pickFoe('公司终面', '话术'), 'interviewer');
    assert.equal(pickFoe('冷战后的和好', ''), 'counterpart');
    assert.equal(pickFoe('熬夜赶稿', '应变'), 'deadline');
    assert.equal(pickFoe('无从归类', '学习'), 'examiner');
    assert.equal(pickFoe('无从归类', ''), 'elder');
    assert.equal(build(startOf({ counterpart: '林总' })).setup.units[1].name, '林总');
    assert.equal(build(startOf()).setup.units[1].id, CHALLENGE_FOE_ID);
});

test('回合上限到时按进展比例判胜负，成功最多算勉强', () => {
    const { setup } = build(startOf({ tier: '轻松' }));
    const { state } = createBattle(setup, 9);
    const rounds = setup.challenge.rounds;
    assert.equal(challengeResultOf(state, rounds), null);
    const foe = state.units[CHALLENGE_FOE_ID];
    const limit = (hp, turn = rounds + 1) => challengeResultOf({ ...state, turn, units: { ...state.units, [CHALLENGE_FOE_ID]: { ...foe, hp } } }, rounds);
    assert.deepEqual([limit(foe.maxHp).result, limit(Math.floor(foe.maxHp / 2)).result, limit(Math.floor(foe.maxHp / 2) + 1).result], ['lose', 'win', 'lose']);
    assert.equal(limit(1, rounds), null);
    assert.equal(limit(1).byLimit, true);
    assert.equal(challengeOutcomeOf('win', 1, { byLimit: true }), '勉强');
    assert.equal(challengeOutcomeOf('win', 0.6), '圆满');
    assert.equal(challengeOutcomeOf('win', 0.59), '勉强');
    assert.equal(challengeOutcomeOf('lose', 1), '失败');
    assert.equal(challengeOutcomeOf('escape', 1), '放弃');
});

test('可以放弃：撤退结局映射为放弃，关闭放弃时不能撤退', () => {
    const { setup } = build(startOf());
    const { state } = createBattle(setup, 3);
    const left = applyAction(state, { type: 'escape' });
    assert.ok(left.ok);
    assert.equal(challengeResultOf(left.state, 5).result, 'escape');
    const locked = createBattle(build(startOf({ allowEscape: false })).setup, 3).state;
    assert.equal(applyAction(locked, { type: 'escape' }).ok, false);
});

test('挑战战斗标识带 ch 前缀，不与战斗局相撞', () => {
    const id = challengeCombatIdFor({ messageId: 12, swipeId: 0, tagHash: 'abc', occurrence: 0 });
    assert.equal(id, 'ch|12|0|abc|0');
});
