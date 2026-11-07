// 极端性格、资源互换、床上专属三组特质规则的结算用例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { settleTraitTags } from '../src/scene/stats/stat-trait-hooks.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName, traitCatalogOf, traitDice, traitFlag, traitScale } from '../src/scene/stats/stat-traits.js';
import { RICH_FROM } from '../src/scene/stats/stat-trait-rules-extreme.js';

const traitsOf = (...names) => ({ 林夏: Object.fromEntries(names.map((n) => [getTraitByName(n).id, { on: true, src: 'manual' }])) });
const heroTraits = (...names) => ({ 主角: Object.fromEntries(names.map((n) => [getTraitByName(n).id, { on: true, src: 'manual' }])) });
const world = (patch = {}, bars = {}, hero = {}) => {
    const base = createCharacter(1, { nsfw: true });
    const s = createStatsState();
    return {
        ...s,
        protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, ...hero } },
        characters: { 林夏: { ...base, ...patch, dims: { ...base.dims, ...(patch.dims || {}) }, bars: { ...base.bars, ...bars } } },
    };
};
// 直接调用事件钩子：changes 里预置「本楼其他结算已落下的变动」，flags 为战斗、打工结果。
const tags = (state, directives, traits, { nsfw = true, changes = [], flags = {} } = {}) => {
    const ctx = { traits, nsfw, changes, flags, present: ['林夏'], diagnostics: [] };
    return { state: settleTraitTags(state, directives, ctx), changes };
};
const day = (state, traits, nsfw = true) => {
    const changes = [];
    return { state: settleDay(state, { random: () => 0.99, changes, rev: 2, traits, nsfw, present: ['林夏'] }), changes };
};
const dims = (r) => r.state.characters.林夏.dims;
const barsOf = (r) => r.state.characters.林夏.bars;
const cat = (traits, nsfw = true) => traitCatalogOf(traits, nsfw);

// ---- 极端性格：倍率与开关 ----

test('花痴：好感、欲望上升与冷却都加倍', () => {
    const c = cat(traitsOf('花痴'));
    const s = world();
    assert.equal(traitScale(s, c, '林夏', '好感', 'up'), 2);
    assert.equal(traitScale(s, c, '林夏', '欲望', 'up'), 2);
    assert.equal(traitScale(s, c, '林夏', '好感', 'cool'), 2);
});

test('无欲无求：好感上升减半且不冷却；欲望上升被退回', () => {
    const traits = traitsOf('无欲无求');
    const c = cat(traits);
    const s = world({ dims: { 好感: 30, 欲望: 10 } });
    assert.equal(traitScale(s, c, '林夏', '好感', 'up'), 0.5);
    assert.equal(traitFlag(s, c, '林夏', 'noCool'), true);
    const changes = [{ source: 'tag', target: '林夏', key: '欲望', from: 10, to: 16 }];
    const r = tags(world({ dims: { 欲望: 16 } }), [], traits, { changes });
    assert.equal(dims(r).欲望, 10);
});

test('偏执狂：信任上升减半，芥蒂不自然消退', () => {
    const c = cat(traitsOf('偏执狂'));
    const s = world();
    assert.equal(traitScale(s, c, '林夏', '信任', 'up'), 0.5);
    assert.equal(traitFlag(s, c, '林夏', 'noFade:芥蒂'), true);
});

test('没心没肺：芥蒂消退加倍，了解上升减半', () => {
    const c = cat(traitsOf('没心没肺'));
    const s = world();
    assert.equal(traitScale(s, c, '林夏', '芥蒂', 'fade'), 2);
    assert.equal(traitScale(s, c, '林夏', '了解', 'up'), 0.5);
});

test('佛系：芥蒂上升减半，压力上升 ×0.75', () => {
    const c = cat(traitsOf('佛系'));
    const s = world();
    assert.equal(traitScale(s, c, '林夏', '芥蒂', 'up'), 0.5);
    assert.equal(traitScale(s, c, '林夏', '压力', 'up'), 0.75);
});

test('疯批：压力过半起欲望、好感上升 ×1.5，未过半不变', () => {
    const c = cat(traitsOf('疯批'));
    const calm = world({}, { stress: 20 });
    const tense = world({}, { stress: 60 });
    assert.equal(traitScale(calm, c, '林夏', '欲望', 'up'), 1);
    assert.equal(traitScale(tense, c, '林夏', '欲望', 'up'), 1.5);
    assert.equal(traitScale(tense, c, '林夏', '好感', 'up'), 1.5);
});

// ---- 极端性格：战斗 ----

test('战斗狂：战斗胜利压力下降一大档；败了不降', () => {
    const traits = heroTraits('战斗狂');
    const s = world({}, {}, { stress: 50 });
    const win = tags(s, [], traits, { flags: { battle: { outcome: '胜' } } });
    assert.equal(win.state.protagonist.bars.stress, 30);
    const lose = tags(s, [], traits, { flags: { battle: { outcome: '败' } } });
    assert.equal(lose.state.protagonist.bars.stress, 50);
});

test('战斗狂：多日无战斗每天压力缓升，战斗后重新计时', () => {
    const traits = heroTraits('战斗狂');
    const b = tags(world({}, {}, { stress: 40 }), [], traits, { flags: { battle: { outcome: '胜' } } }).state;
    assert.equal(b.protagonist.traitMarks.lastBattleDay, 1);
    // 战斗后第一天不加，第二天起每天缓升。
    const d1 = day(b, traits);
    const d2 = day(d1.state, traits);
    assert.ok(!d1.changes.some((c) => c.note === '战斗狂'));
    assert.ok(d2.changes.some((c) => c.target === '主角' && c.key === 'stress' && c.note === '战斗狂' && c.to > c.from));
});

test('战斗狂：战斗类检定多一个奖励骰', () => {
    const s = world();
    assert.equal(traitDice(s, cat(traitsOf('战斗狂')), '林夏', '战斗'), 1);
    assert.equal(traitDice(s, cat(traitsOf('战斗狂')), '林夏', '社交'), 0);
});

test('厌战：战斗那一楼压力上升 ×2', () => {
    const traits = heroTraits('厌战');
    const s = world({}, {}, { stress: 10 });
    const up = [{ kind: 'stress', value: '上升', strength: '中' }];
    assert.equal(tags(s, up, traits, { flags: { battle: { outcome: '胜' } } }).state.protagonist.bars.stress, 20);
    assert.equal(tags(s, up, traits).state.protagonist.bars.stress, 10);
});

// ---- 资源互换 ----

test('吝啬鬼：收入压力下降，花钱压力上升加倍；送礼好感折半', () => {
    const traits = heroTraits('吝啬鬼');
    const s = world({}, {}, { stress: 30 });
    const earn = tags(s, [], traits, { changes: [{ source: 'tag', target: '主角', key: 'money', from: 0, to: 100 }] });
    assert.equal(earn.state.protagonist.bars.stress, 25);
    const spend = tags(s, [], traits, { changes: [{ source: 'tag', target: '主角', key: 'money', from: 100, to: 0 }] });
    assert.equal(spend.state.protagonist.bars.stress, 40);
    const gift = tags(world({ dims: { 好感: 8 } }), [{ kind: 'gift', target: '林夏', value: '花' }], traitsOf('吝啬鬼'), { changes: [{ source: 'tag', target: '林夏', key: '好感', from: 0, to: 8 }] });
    assert.equal(dims(gift).好感, 4);
});

test('购物解压：花钱压力下降一小档，每天最多一次', () => {
    const traits = heroTraits('购物解压');
    const spent = [{ source: 'tag', target: '主角', key: 'money', from: 100, to: 0 }];
    const first = tags(world({}, {}, { stress: 30 }), [], traits, { changes: [...spent] });
    assert.equal(first.state.protagonist.bars.stress, 25);
    const second = tags(first.state, [], traits, { changes: [...spent] });
    assert.equal(second.state.protagonist.bars.stress, 25);
});

test('化悲愤为食欲：压力过半进食体力回复 ×1.5；压力低时不加', () => {
    const traits = heroTraits('化悲愤为食欲');
    const eat = [{ source: 'tag', target: '主角', key: 'stamina', from: 40, to: 50, note: '进食' }];
    const high = tags(world({}, {}, { stress: 60, stamina: 50 }), [], traits, { changes: [...eat] });
    assert.equal(high.state.protagonist.bars.stamina, 55);
    const low = tags(world({}, {}, { stress: 10, stamina: 50 }), [], traits, { changes: [...eat] });
    assert.equal(low.state.protagonist.bars.stamina, 50);
});

test('越累越清醒：体力低于三成多一个奖励骰', () => {
    const c = cat(traitsOf('越累越清醒'));
    assert.equal(traitDice(world({}, { stamina: 20 }), c, '林夏', '学习'), 1);
    assert.equal(traitDice(world({}, { stamina: 80 }), c, '林夏', '学习'), 0);
    assert.equal(traitDice(world(), cat(heroTraits('越累越清醒')), '主角', '社交', { stamina: 10 }), 1);
});

test('存款即安全感：富裕档每天压力额外下降；跌出富裕压力小升', () => {
    const traits = heroTraits('存款即安全感');
    const d = day(world({}, {}, { money: RICH_FROM + 1, stress: 40 }), traits);
    assert.ok(d.changes.some((c) => c.note === '存款即安全感' && c.to < c.from));
    const poor = day(world({}, {}, { money: 5, stress: 40 }), traits);
    assert.ok(!poor.changes.some((c) => c.note === '存款即安全感'));
    const drop = tags(world({}, {}, { stress: 10 }), [], traits, { changes: [{ source: 'tag', target: '主角', key: 'money', from: RICH_FROM + 5, to: 3 }] });
    assert.equal(drop.state.protagonist.bars.stress, 15);
});

test('运动解压：体力消耗中及以上压力下降；轻不触发', () => {
    const traits = heroTraits('运动解压');
    const s = world({}, {}, { stress: 30 });
    assert.equal(tags(s, [{ kind: 'stamina', value: '中' }], traits).state.protagonist.bars.stress, 25);
    assert.equal(tags(s, [{ kind: 'stamina', value: '轻' }], traits).state.protagonist.bars.stress, 30);
});

test('睡一觉就好：入睡时压力再降一份', () => {
    const traits = heroTraits('睡一觉就好');
    const s = world({}, {}, { stress: 40 });
    assert.equal(tags(s, [{ kind: 'sleep' }], traits).state.protagonist.bars.stress, 30);
    assert.equal(tags(s, [], traits).state.protagonist.bars.stress, 40);
});

test('压力变动力：压力过半时打工收入高一档', () => {
    const traits = heroTraits('压力变动力');
    const flags = { work: { income: '普通' } };
    const hi = tags(world({}, {}, { stress: 60, money: 100 }), [], traits, { flags });
    assert.equal(hi.state.protagonist.bars.money, 100 + 500 - 100);
    const lo = tags(world({}, {}, { stress: 10, money: 100 }), [], traits, { flags });
    assert.equal(lo.state.protagonist.bars.money, 100);
});

// ---- 床上专属 ----

const intimate = [{ kind: 'intimate', target: '林夏', value: '中' }];
const cost = (n) => [{ source: 'tag', target: '林夏', key: 'stamina', from: 100, to: 100 - n, note: '亲密' }];

test('体力怪物：亲密体力消耗减半', () => {
    const r = tags(world({}, { stamina: 90 }), intimate, traitsOf('体力怪物'), { changes: cost(10) });
    assert.equal(barsOf(r).stamina, 95);
});

test('一碰就软：亲密体力消耗略快、欲望上升略快', () => {
    const changes = [...cost(10), { source: 'tag', target: '林夏', key: '欲望', from: 0, to: 10 }];
    const r = tags(world({ dims: { 欲望: 10 } }, { stamina: 90 }), intimate, traitsOf('一碰就软'), { changes });
    assert.equal(barsOf(r).stamina, 85);
    assert.equal(dims(r).欲望, 15);
});

test('敏感体质：亲密时欲望上升加倍', () => {
    const changes = [{ source: 'tag', target: '林夏', key: '欲望', from: 0, to: 6 }];
    const r = tags(world({ dims: { 欲望: 6 } }), intimate, traitsOf('敏感体质'), { changes });
    assert.equal(dims(r).欲望, 12);
});

test('反差萌：平时欲望上升减半，当天亲密后加倍', () => {
    const traits = traitsOf('反差萌');
    const changes = [{ source: 'tag', target: '林夏', key: '欲望', from: 0, to: 10 }];
    const calm = tags(world({ dims: { 欲望: 10 } }), [], traits, { changes: [...changes] });
    assert.equal(dims(calm).欲望, 5);
    const done = tags(world({ dims: { 欲望: 10 }, traitMarks: { intimateDay: 1 } }), [], traits, { changes: [...changes] });
    assert.equal(dims(done).欲望, 20);
});

test('事后黏人：亲密那一楼好感、信任各小升', () => {
    const r = tags(world(), intimate, traitsOf('事后黏人'));
    assert.equal(dims(r).好感, 2);
    assert.equal(dims(r).信任, 1);
});

test('事后冷淡：亲密那一楼欲望清零，好感增量退回', () => {
    const changes = [{ source: 'tag', target: '林夏', key: '好感', from: 10, to: 14 }];
    const r = tags(world({ dims: { 好感: 14, 欲望: 30 } }), intimate, traitsOf('事后冷淡'), { changes });
    assert.equal(dims(r).欲望, 0);
    assert.equal(dims(r).好感, 10);
});

test('夜夜笙歌：欲望每天回升；连续两天未亲密压力小升', () => {
    const traits = traitsOf('夜夜笙歌');
    const s = world({ dims: { 欲望: 20 }, traitMarks: { intimateDay: 1 } }, { stress: 10 });
    const d1 = day(s, traits);
    assert.ok(dims(d1).欲望 >= 20, '欲望不低于原值');
    const d2 = day(d1.state, traits);
    assert.ok(d2.changes.some((c) => c.note === '夜夜笙歌' && c.key === 'stress' && c.to > c.from));
});

test('初体验：第一次亲密好感上升一大档、压力小升，只触发一次', () => {
    const traits = traitsOf('初体验');
    const r = tags(world(), intimate, traits);
    assert.equal(dims(r).好感, 6);
    assert.equal(barsOf(r).stress, 5);
    const again = tags(r.state, intimate, traits);
    assert.equal(dims(again).好感, 6);
});

test('调教中：亲密后欲望自然消退的下限逐次提高，日结算守住下限', () => {
    const traits = traitsOf('调教中');
    const a = tags(world({ dims: { 欲望: 30 } }), intimate, traits).state;
    assert.equal(a.characters.林夏.traitMarks.trainFloor, 2);
    const b = tags(a, intimate, traits).state;
    assert.equal(b.characters.林夏.traitMarks.trainFloor, 4);
    // 欲望在下限边上时，自然消退不会掉破下限。
    const low = { ...b, characters: { 林夏: { ...b.characters.林夏, dims: { ...b.characters.林夏.dims, 欲望: 4 } } } };
    assert.ok(day(low, traits).state.characters.林夏.dims.欲望 >= 3);
});

test('秒回血：亲密结束后体力回复一档', () => {
    const r = tags(world({}, { stamina: 50 }), intimate, traitsOf('秒回血'));
    assert.equal(barsOf(r).stamina, 60);
});

test('床上专属：NSFW 关闭时视为未挂，不生效', () => {
    const r = tags(world({}, { stamina: 50 }), intimate, traitsOf('秒回血'), { nsfw: false });
    assert.equal(barsOf(r).stamina, 50);
    assert.equal(dims(tags(world(), intimate, traitsOf('事后黏人'), { nsfw: false })).好感, 0);
});
