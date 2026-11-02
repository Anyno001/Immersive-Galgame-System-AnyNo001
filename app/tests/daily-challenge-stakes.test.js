import test from 'node:test';
import assert from 'node:assert/strict';
import { settleCombat } from '../src/scene/stats/stat-battle.js';
import { challengeCost, challengeMoneyLoss } from '../src/scene/stats/stat-challenge.js';
import { walletBalance } from '../src/scene/stats/stat-bars.js';
import { FAVOR_GATES, applyDim } from '../src/scene/stats/stat-favor.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { CHALLENGE_ENABLED_STAKES } from '../src/scene/challenge-directives.js';
import { buildChallengeReport, challengeDirectiveOf, parseChallengeReport } from '../src/combat/challenge-report.js';
import { CHALLENGE_FOES, challengeHarvest } from '../src/combat/challenge-foes.js';

const newCtx = (over = {}) => ({ changes: [], diagnostics: [], events: [], flags: {}, random: () => 0, ...over });
const stateWith = ({ bars = {}, favor = null, unlocked = [] } = {}) => {
    const base = createStatsState();
    const characters = favor === null ? {} : { 小雪: { ...createCharacter(1), dims: { 好感: favor, 信任: 0, 了解: 0 }, unlocked } };
    return { ...base, characters, protagonist: { ...base.protagonist, bars: { ...base.protagonist.bars, ...bars } } };
};
const directive = (over = {}) => ({ kind: 'challenge', reportId: 'rabc1', outcome: '失败', tier: '普通', stake: '金钱', domain: '话术', floor: 12, counterpart: '', prize: null, ...over });
const settle = (state, d, ctx = newCtx()) => ({ state: settleCombat(state, [d], ctx), ctx });
const favorOf = (state) => state.characters.小雪.dims.好感;

test('金钱与关系代价已放开，由放开的类别决定能否开局', () => {
    assert.ok(CHALLENGE_ENABLED_STAKES.includes('金钱'));
    assert.ok(CHALLENGE_ENABLED_STAKES.includes('关系'));
});

test('失败扣钱按难度档查金钱表，且不超过合并余额的两成', () => {
    const rich = settle(stateWith({ bars: { money: 5000 } }), directive({ tier: '轻松' }));
    assert.equal(rich.state.protagonist.bars.money, 5000 - 20);
    const capped = settle(stateWith({ bars: { money: 1000 } }), directive({ tier: '艰难' }));
    assert.equal(capped.state.protagonist.bars.money, 800);
    assert.equal(capped.state.protagonist.bars.stress, 0);
    assert.equal(capped.ctx.changes[0].key, 'money');
    assert.equal(challengeCost('艰难', '金钱').money, '昂贵');
});

test('合并余额计入战斗积分，扣款记在数值侧金钱上，可为负', () => {
    const merged = settle(stateWith({ bars: { money: 1000 } }), directive({ tier: '艰难' }), newCtx({ walletExtra: 500 }));
    assert.equal(merged.state.protagonist.bars.money, 700);
    const owed = settle(stateWith({ bars: { money: 0 } }), directive({ tier: '艰难' }), newCtx({ walletExtra: 1000 }));
    assert.equal(owed.state.protagonist.bars.money, -200);
    assert.equal(walletBalance(owed.state.protagonist.bars, 1000), 800);
});

test('没有余额时不扣钱，放弃只扣一半', () => {
    const broke = settle(stateWith({ bars: { money: 0 } }), directive({ tier: '艰难' }));
    assert.equal(broke.state.protagonist.bars.money, 0);
    assert.equal(broke.ctx.changes.length, 0);
    const negative = settle(stateWith({ bars: { money: -50 } }), directive());
    assert.equal(negative.state.protagonist.bars.money, -50);
    const gave = settle(stateWith({ bars: { money: 10000 } }), directive({ outcome: '放弃' }));
    assert.equal(gave.state.protagonist.bars.money, 10000 - 50);
    assert.equal(challengeMoneyLoss({ money: 10000 }, '普通', '失败'), 100);
});

test('关系代价走好感扣减：轻松、普通、艰难分别一、二、三，放弃减半', () => {
    for (const [tier, loss, half] of [['轻松', 1, 1], ['普通', 2, 1], ['艰难', 3, 2]]) {
        const lost = settle(stateWith({ favor: 30 }), directive({ stake: '关系', counterpart: '小雪', tier }));
        assert.equal(favorOf(lost.state), 30 - loss, tier);
        assert.equal(lost.ctx.changes[0].target, '小雪');
        assert.equal(lost.state.protagonist.bars.stress, 0);
        const left = settle(stateWith({ favor: 30 }), directive({ stake: '关系', counterpart: '小雪', tier, outcome: '放弃' }));
        assert.equal(favorOf(left.state), 30 - half, tier);
    }
    const floor = settle(stateWith({ favor: -99 }), directive({ stake: '关系', counterpart: '小雪', tier: '艰难' }));
    assert.equal(favorOf(floor.state), -100);
});

test('好感扣分不会绕过关口：停在关口下方再涨仍被关口封顶，已解锁记录不丢', () => {
    assert.equal(FAVOR_GATES[0], 25);
    const dropped = settle(stateWith({ favor: 25 }), directive({ stake: '关系', counterpart: '小雪' })).state;
    assert.equal(favorOf(dropped), 23);
    let character = dropped.characters.小雪;
    for (let i = 0; i < 4; i += 1) character = applyDim(character, '好感', '心动', { random: () => 0 }).character;
    assert.equal(character.dims.好感, 25);
    const unlocked = settle(stateWith({ favor: 30, unlocked: ['gate-25'] }), directive({ stake: '关系', counterpart: '小雪' })).state;
    assert.deepEqual(unlocked.characters.小雪.unlocked, ['gate-25']);
});

test('对方未登记或不在场时关系代价降级为压力并记诊断', () => {
    const missing = settle(stateWith({}), directive({ stake: '关系', counterpart: '小雪' }));
    assert.equal(missing.state.protagonist.bars.stress, 20);
    assert.deepEqual(missing.ctx.diagnostics.map((d) => d.code), ['challenge-stake-degraded']);
    const away = settle(stateWith({ favor: 30 }), directive({ stake: '关系', counterpart: '小雪' }), newCtx({ present: ['阿梅'] }));
    assert.equal(favorOf(away.state), 30);
    assert.equal(away.state.protagonist.bars.stress, 20);
    const here = settle(stateWith({ favor: 30 }), directive({ stake: '关系', counterpart: '小雪' }), newCtx({ present: ['小雪'] }));
    assert.equal(favorOf(here.state), 28);
});

test('关系类圆满走关键事件：不在关口不加分，在关口检定成功才突破', () => {
    const win = { stake: '关系', counterpart: '小雪', outcome: '圆满' };
    const plain = settle(stateWith({ favor: 10 }), directive(win));
    assert.equal(favorOf(plain.state), 10);
    assert.equal(plain.ctx.events.filter((e) => e.target === '小雪').length, 0);
    const atGate = settle(stateWith({ favor: 25 }), directive(win));
    const event = atGate.ctx.events.find((e) => e.target === '小雪');
    assert.equal(event.gate, 25);
    assert.equal(favorOf(atGate.state), event.success ? 26 : 25);
    const decent = settle(stateWith({ favor: 25 }), directive({ ...win, outcome: '勉强' }));
    assert.equal(favorOf(decent.state), 25);
});

test('奖金只发给登记了奖金的难关，且只在圆满时发放', () => {
    assert.deepEqual(Object.entries(CHALLENGE_FOES).filter(([, foe]) => foe.harvest.includes('奖金')).map(([key]) => key), ['judge']);
    assert.deepEqual(challengeHarvest('judge', '圆满', '艰难'), { prize: '昂贵', card: true });
    assert.deepEqual(challengeHarvest('judge', '勉强', '艰难'), { prize: null, card: false });
    assert.equal(challengeHarvest('interviewer', '圆满', '普通').prize, null);
    assert.equal(challengeHarvest('不存在', '圆满', '普通').card, false);
    const report = (foe, outcome) => parseChallengeReport(buildChallengeReport({ combatId: 'ch|1|0|a|0', event: '厨艺比赛', outcome, tier: '普通', domain: '烹饪', foe }).text);
    const won = settle(stateWith({ bars: { money: 0 } }), challengeDirectiveOf(report('judge', '圆满'), 9));
    assert.equal(won.state.protagonist.bars.money, 100);
    const decent = settle(stateWith({ bars: { money: 0 } }), challengeDirectiveOf(report('judge', '勉强'), 9));
    assert.equal(decent.state.protagonist.bars.money, 0);
    const other = settle(stateWith({ bars: { money: 0 } }), challengeDirectiveOf(report('interviewer', '圆满'), 9));
    assert.equal(other.state.protagonist.bars.money, 0);
});

test('战报写出奖金与代价类别的相对描述，且不含数字', () => {
    const body = (text) => text.replace(/<igs-challenge-report[^>]*>|<\/igs-challenge-report>/g, '');
    const prize = buildChallengeReport({ combatId: 'ch|1|0|a|0', event: '比赛', outcome: '圆满', foe: 'judge', allies: ['小雪'] });
    assert.match(body(prize.text), /奖金/);
    assert.match(body(prize.text), /小雪在一旁相助/);
    assert.doesNotMatch(body(prize.text), /[0-9０-９]/);
    for (const stake of ['金钱', '关系']) assert.doesNotMatch(body(buildChallengeReport({ combatId: 'ch|1|0|a|0', outcome: '失败', stake }).text), /[0-9０-９]/);
    assert.match(body(buildChallengeReport({ combatId: 'ch|1|0|a|0', outcome: '失败', stake: '关系' }).text), /裂痕/);
});
