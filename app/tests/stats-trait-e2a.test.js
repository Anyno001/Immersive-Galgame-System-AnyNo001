// E2a：新特质（通用、世界观、二次元人设）、别名与删除表、无神论者、结怨不淡化。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { DELETED_TRAITS, applyTraitChange, getTraitByName, getTraitDef, sanitizeTraits, traitCatalogOf, traitDice } from '../src/scene/stats/stat-traits.js';
import { resolveCombos, TRAIT_RECIPES } from '../src/scene/stats/stat-trait-recipes.js';
import { traitEdgeOf } from '../src/scene/stats/stat-trait-dice.js';

const high = () => 0.99;
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const on = { on: true, src: 'manual' };
const traitsFor = (who, ...names) => ({ [who]: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on])) });
const world = (patch = {}, stress = 30) => {
    const c = createCharacter(1, { nsfw: true });
    const base = createStatsState();
    return { ...base, characters: { 林夏: { ...c, ...patch, dims: { ...c.dims, ...(patch.dims || {}) }, bars: { ...c.bars, ...(patch.bars || {}) } } }, protagonist: { ...base.protagonist, bars: { ...base.protagonist.bars, stress } } };
};
const day = (state, traits, present = ['林夏']) => settleDay(state, { random: high, rev: 2, traits, nsfw: true, present });
const edge = (state, names, skill, extra = {}) => traitEdgeOf(state, traitCatalogOf(traitsFor('主角', ...names), true), { skill, ...extra }).edge;
const rev = (type, name) => [{ type, name }];

test('新特质已登记：互斥、题材子类、别名与删除表', () => {
    for (const n of ['医术', '路痴', '方向感强', '手巧', '动物缘', '灵觉', '属性亲和', '勇者', '魔王', '圣女', '圣职者', '抗体携带者', '义体改造', '中二病', '大小姐', '兄弟姐妹控', '爱哭鬼', '吐槽役', '公众人物', '大器晚成', '御姐', '女王']) assert.ok(getTraitDef(n), n);
    assert.ok(getTraitDef('路痴').exclusive.includes('方向感强'));
    assert.ok(getTraitDef('手巧').exclusive.includes('冒失鬼'));
    assert.ok(getTraitDef('勇者').exclusive.includes('魔王'));
    assert.equal(getTraitDef('勇者').sub, '西幻');
    assert.equal(getTraitDef('抗体携带者').sub, '末世');
    assert.equal(getTraitDef('义体改造').sub, '星际');
    assert.equal(getTraitDef('勇者').protagonist, true);
    assert.equal(getTraitDef('魔王').protagonist, true);
    const t = sanitizeTraits({ 林夏: { 懂药理: on, 阴阳眼: on, 学者: on, 商人: on } }).林夏;
    assert.deepEqual(Object.keys(t).sort(), ['医术', '学霸', '灵觉']);
    for (const n of ['商人', '剑修', '心魔', '废柴', '基因改造']) assert.ok(DELETED_TRAITS.includes(n), n);
});

test('勇者：战斗取胜那一楼压力小降', () => {
    const base = world({}, 40);
    const run = (names) => floor(base, '林夏在场。[igs-stat:battle|杂兵]', traitsFor('主角', ...names), { present: ['林夏'] });
    const plain = run([]);
    const outcome = plain.meta.events.find((e) => e.kind === 'battle').outcome;
    const brave = run(['勇者']);
    if (outcome === '败' || outcome === '撤') assert.equal(brave.state.protagonist.bars.stress, plain.state.protagonist.bars.stress);
    else {
        assert.equal(brave.state.protagonist.bars.stress, plain.state.protagonist.bars.stress - 5);
        assert.equal(brave.state.characters.林夏.dims.信任, plain.state.characters.林夏.dims.信任 + 1);
    }
});

test('魔王：同场其他人压力每天缓升；圣女缓降；吐槽役缓降主角压力', () => {
    const s = world({}, 50);
    const plain = day(s, {}).protagonist.bars.stress;
    assert.ok(day(s, traitsFor('林夏', '魔王')).protagonist.bars.stress > plain);
    assert.ok(day(s, traitsFor('林夏', '圣女')).protagonist.bars.stress < plain);
    assert.ok(day(s, traitsFor('林夏', '吐槽役')).protagonist.bars.stress < plain);
});

test('无神论者：信仰质疑那一楼芥蒂上升退回', () => {
    const text = '[igs-stat:grudge|林夏|上升|中]';
    const run = (names) => floor(world(), text, traitsFor('林夏', ...names), { reviewEvents: rev('信仰质疑', '林夏') }).state.characters.林夏.dims.芥蒂;
    assert.ok(run([]) > 0);
    assert.equal(run(['无神论者']), 0);
});

test('女王：被迫顺从好感小升；拒绝芥蒂小升；合成后改为欲望', () => {
    const r = floor(world(), '[igs-stat:stress|上升|大|被迫]', traitsFor('林夏', '女王'), { present: ['林夏'] });
    assert.ok(r.changes.some((c) => c.note === '女王' && c.key === '好感' && c.calc.length >= 2));
    const refuse = floor(world(), '[igs-stat:favor|林夏|冷淡]', traitsFor('林夏', '女王'), { present: ['林夏'], reviewEvents: rev('拒绝', '林夏') });
    assert.ok(refuse.changes.some((c) => c.note === '女王' && c.key === '芥蒂'));
});

test('结怨不随时间淡化：默认补回芥蒂，宽容、以德报怨、老好人、一笑泯恩仇才淡化，淡到 25 解开', () => {
    const hate = (g) => world({ dims: { 芥蒂: g }, lastSeenDay: 1, relStates: [{ id: '结怨', dir: 'ta', since: 0, hold: g }] });
    const after = (g, names) => day(hate(g), traitsFor('林夏', ...names), []).characters.林夏;
    assert.equal(after(60, []).dims.芥蒂, 60);
    assert.equal(after(60, ['记仇']).dims.芥蒂, 60);
    for (const n of ['宽容', '以德报怨', '老好人', '一笑泯恩仇']) assert.ok(after(60, [n]).dims.芥蒂 < 60, n);
    assert.ok(after(25, ['宽容']).relStates.every((r) => r.id !== '结怨'), '淡到 25 解开');
    assert.ok(after(25, []).relStates.some((r) => r.id === '结怨'), '默认不解开');
    // 没有结怨关系的普通芥蒂照常淡忘。
    assert.equal(day(world({ dims: { 芥蒂: 60 }, lastSeenDay: 1 }), {}, []).characters.林夏.dims.芥蒂, 59);
});
