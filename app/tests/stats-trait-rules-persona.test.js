// 性格、天资组特质规则：每条已接规则至少一条用例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName, traitCatalogOf, traitDice } from '../src/scene/stats/stat-traits.js';

const high = () => 0.99;
const resolve = (n) => n;
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const base = () => createStatsState();
const npc = (patch = {}, bars = {}) => {
    const c = createCharacter(1, { nsfw: true });
    return { ...base(), characters: { 林夏: { ...c, ...patch, dims: { ...c.dims, ...(patch.dims || {}) }, bars: { ...c.bars, ...bars } } } };
};
const heroStress = (stress) => ({ ...npc(), protagonist: { ...base().protagonist, bars: { stamina: 100, money: 0, stress } } });
const on = { on: true, src: 'manual' };
const traitsFor = (who, ...names) => ({ [who]: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on])) });
const dims = (r) => r.state.characters.林夏.dims;
const hero = (r) => r.state.protagonist.bars;
const dayState = (patch = {}, stress = 30) => ({ ...npc(patch), protagonist: { ...base().protagonist, bars: { stamina: 100, money: 0, stress } }, clock: { ...base().clock, day: 9 } });
const day = (state, who, names, present) => settleDay(state, { random: high, rev: 2, traits: traitsFor(who, ...names), nsfw: true, present });

// ---- 倍率与开关 ----

test('玻璃心 / 木头人：好感、信任下降 ×1.5 / ×0.5', () => {
    const start = npc({ dims: { 好感: 30, 信任: 30 } });
    const plain = floor(start, '[igs-stat:favor|林夏|失望|中]');
    const sens = floor(start, '[igs-stat:favor|林夏|失望|中]', traitsFor('林夏', '玻璃心'));
    const dull = floor(start, '[igs-stat:favor|林夏|失望|中]', traitsFor('林夏', '木头人'));
    assert.ok(dims(sens).好感 < dims(plain).好感);
    assert.ok(dims(dull).好感 > dims(plain).好感);
    const t = (names) => dims(floor(start, '[igs-stat:trust|林夏|下降|中]', names.length ? traitsFor('林夏', ...names) : {})).信任;
    assert.ok(t(['玻璃心']) < t([]));
    assert.ok(t(['木头人']) > t([]));
});

test('醋坛子：吃醋所加芥蒂变多；不拘小节：吃醋不加芥蒂', () => {
    const start = npc({ dims: { 好感: 30, 芥蒂: 10 } });
    const text = '[igs-stat:favor|林夏|吃醋|中]';
    const plain = dims(floor(start, text)).芥蒂;
    assert.ok(dims(floor(start, text, traitsFor('林夏', '醋坛子'))).芥蒂 > plain);
    assert.equal(dims(floor(start, text, traitsFor('林夏', '不拘小节'))).芥蒂, 10);
});

test('冷血：好感冷却加倍；纯爱战士：成为恋人后好感不冷却', () => {
    const run = (names, patch = {}) => day(dayState({ dims: { 好感: 60 }, lastSeenDay: 1, ...patch }), '林夏', names, []).characters.林夏.dims.好感;
    const plain = run([]);
    assert.ok(run(['冷血']) < plain);
    assert.equal(run(['纯爱战士'], { romance: true }), 60);
    assert.equal(run(['纯爱战士']), plain, '未成恋人照常冷却');
});

test('好奇宝宝：了解上升加快', () => {
    const text = '[igs-stat:know|林夏|上升|大]';
    const plain = dims(floor(npc(), text)).了解;
    assert.ok(dims(floor(npc(), text, traitsFor('林夏', '好奇宝宝'))).了解 > plain);
});

test('老好人：芥蒂上升减半', () => {
    const text = '[igs-stat:grudge|林夏|上升|大]';
    const plain = dims(floor(npc(), text)).芥蒂;
    assert.ok(dims(floor(npc(), text, traitsFor('林夏', '老好人'))).芥蒂 < plain);
});

// ---- 每日 ----

test('工作狂：每天压力缓升', () => {
    const plain = day(dayState(), '主角', [], ['林夏']).protagonist.bars.stress;
    assert.equal(day(dayState(), '主角', ['工作狂'], ['林夏']).protagonist.bars.stress, plain + 3);
});

test('e人：主角独处的日子压力缓升，有人在场不升', () => {
    const plain = day(dayState(), '主角', [], []).protagonist.bars.stress;
    assert.equal(day(dayState(), '主角', ['e人'], []).protagonist.bars.stress, plain + 3);
    assert.equal(day(dayState(), '主角', ['e人'], ['林夏']).protagonist.bars.stress, day(dayState(), '主角', [], ['林夏']).protagonist.bars.stress);
});

test('i人：与人相处的日子压力缓升，独处不升', () => {
    const plain = day(dayState(), '主角', [], ['林夏']).protagonist.bars.stress;
    assert.equal(day(dayState(), '主角', ['i人'], ['林夏']).protagonist.bars.stress, plain + 3);
    assert.equal(day(dayState(), '主角', ['i人'], []).protagonist.bars.stress, day(dayState(), '主角', [], []).protagonist.bars.stress);
});

// ---- 每楼事件 ----

test('e人 / i人：主角压力下降加倍（e人须有人在场，i人须独处）', () => {
    const text = '[igs-stat:stress|下降|中]';
    const run = (names, present) => hero(floor(heroStress(50), text, traitsFor('主角', ...names), { present })).stress;
    assert.equal(run([], ['林夏']), 40);
    assert.equal(run(['e人'], ['林夏']), 30);
    assert.equal(run(['e人'], []), 40, '独处不加倍');
    assert.equal(run(['i人'], []), 30);
    assert.equal(run(['i人'], ['林夏']), 40, '有人在场不加倍');
});

test('e人 / i人：角色自身压力下降加倍', () => {
    const text = '[igs-stat:stress|林夏|下降|中]';
    const run = (name, present) => floor(npc({}, { stress: 50 }), text, traitsFor('林夏', name), { present }).state.characters.林夏.bars.stress;
    assert.equal(run('e人', ['林夏']), 30);
    assert.equal(run('i人', []), 30);
});

test('好胜 / 佛系 / 完美主义者：读战斗与挑战结果', () => {
    const challenge = (outcome) => ({ extraDirectives: [{ kind: 'challenge', outcome, tier: '普通', stake: '压力', domain: '' }] });
    const run = (names, outcome) => hero(floor(heroStress(50), '', traitsFor('主角', ...names), challenge(outcome))).stress;
    const plainFail = run([], '失败');
    const plainWin = run([], '圆满');
    assert.ok(plainFail > 50 && plainWin < 50);
    assert.equal(run(['好胜'], '失败'), plainFail + 5);
    assert.equal(run(['好胜'], '圆满'), plainWin - 5);
    assert.equal(run(['佛系'], '失败'), 50);
    assert.equal(run(['佛系'], '圆满'), 50);
    assert.equal(run(['完美主义者'], '失败'), plainFail + (plainFail - 50));
    assert.equal(run(['完美主义者'], '圆满'), plainWin - 5, '大成功压力下降');
    assert.equal(run(['完美主义者'], '勉强'), run([], '勉强'), '普通成功无变化');
});

test('害羞鬼：欲望上升时压力小升；亲密那一楼好感小升', () => {
    const r = floor(npc({ dims: { 好感: 30 } }), '[igs-stat:desire|林夏|上升|中]', traitsFor('林夏', '害羞鬼'));
    assert.equal(r.state.characters.林夏.bars.stress, 5);
    const i = floor(npc({ dims: { 好感: 30 } }), '[igs-stat:intimate|林夏|轻]');
    const s = floor(npc({ dims: { 好感: 30 } }), '[igs-stat:intimate|林夏|轻]', traitsFor('林夏', '害羞鬼'));
    assert.equal(dims(s).好感, dims(i).好感 + 2);
});

test('慕强者：主角战斗胜利那一楼，在场的其好感额外上升', () => {
    const text = '林夏在场。[igs-stat:battle|杂兵]';
    const plain = floor(npc({ dims: { 好感: 10 } }), text, {}, { present: ['林夏'] });
    const strong = floor(npc({ dims: { 好感: 10 } }), text, traitsFor('林夏', '慕强者'), { present: ['林夏'] });
    const outcome = plain.meta.events.find((e) => e.kind === 'battle').outcome;
    if (outcome === '败') assert.equal(dims(strong).好感, dims(plain).好感);
    else assert.equal(dims(strong).好感, dims(plain).好感 + 2);
    const away = floor(npc({ dims: { 好感: 10 } }), text, traitsFor('林夏', '慕强者'), { present: [] });
    assert.equal(dims(away).好感, dims(plain).好感, '不在场不生效');
});

test('讲义气：共患难事件好感与信任额外上升', () => {
    const text = '[igs-stat:event|林夏|共患难]';
    const plain = floor(npc({ dims: { 好感: 10 } }), text);
    const loyal = floor(npc({ dims: { 好感: 10 } }), text, traitsFor('林夏', '讲义气'));
    assert.equal(dims(loyal).好感, dims(plain).好感 + 1);
    assert.equal(dims(loyal).信任, dims(plain).信任 + 1);
});

test('浪漫主义者：约会、告白事件好感额外上升', () => {
    for (const ev of ['约会', '告白']) {
        const text = `[igs-stat:event|林夏|${ev}]`;
        const plain = floor(npc({ dims: { 好感: 10 } }), text);
        assert.equal(dims(floor(npc({ dims: { 好感: 10 } }), text, traitsFor('林夏', '浪漫主义者'))).好感, dims(plain).好感 + 1, ev);
    }
});

test('现实派：送礼好感额外上升', () => {
    const text = '[igs-stat:gift|林夏|书]';
    const plain = floor(npc({ dims: { 好感: 10 } }), text);
    assert.equal(dims(floor(npc({ dims: { 好感: 10 } }), text, traitsFor('林夏', '现实派'))).好感, dims(plain).好感 + 1);
});

test('过目不忘：了解不下降（失忆除外）', () => {
    const start = npc({ dims: { 了解: 30 } });
    const text = '[igs-stat:know|林夏|下降|中]';
    assert.ok(dims(floor(start, text)).了解 < 30);
    assert.equal(dims(floor(start, text, traitsFor('林夏', '过目不忘'))).了解, 30);
    assert.ok(dims(floor(start, text, traitsFor('林夏', '过目不忘', '失忆'))).了解 < 30);
});

test('工作狂：打工收入高一档', () => {
    const state = npc();
    const text = '[igs-stat:work|打工]';
    const plain = floor(state, text);
    const busy = floor(state, text, traitsFor('主角', '工作狂'));
    const tier = plain.meta.flags.work && plain.meta.flags.work.income;
    if (tier && tier !== '巨额') assert.ok(hero(busy).money > hero(plain).money);
    else assert.equal(hero(busy).money, hero(plain).money);
});

// ---- 检定骰 ----

test('幸运儿 / 倒霉蛋 / 冒失鬼：检定奖惩骰', () => {
    const dice = (who, names, category) => traitDice(base(), traitCatalogOf(traitsFor(who, ...names), true), who, category);
    assert.equal(dice('主角', ['幸运儿'], '社交'), 1);
    assert.equal(dice('主角', ['倒霉蛋'], '战斗'), -1);
    assert.equal(dice('主角', ['冒失鬼'], '敏捷'), -1);
    assert.equal(dice('主角', ['冒失鬼'], '手工'), -1);
    assert.equal(dice('主角', ['冒失鬼'], '社交'), 0);
    assert.equal(dice('主角', ['幸运儿', '冒失鬼'], '敏捷'), 0);
});
