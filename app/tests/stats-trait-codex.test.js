// 特质图鉴：点亮、视图、快合成提示、NSFW 过滤、清空。使用最小假登记表。
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCodex, lightTrait, lightCombo, codexView, clearCodex, syncCodex } from '../src/scene/stats/stat-trait-codex.js';

const DEFS = [
  { id: 'dog', name: '犬系', group: '动物系', nsfw: false, desc: '像小狗。' },
  { id: 'cling', name: '黏人', group: '性格', nsfw: false, desc: '爱贴着。' },
  { id: 'coy', name: '爱撒娇', group: '性格', nsfw: false, desc: '爱撒娇。' },
  { id: 'spicy', name: '一碰就软', group: '床上', nsfw: true, desc: '敏感。' },
];
const RECIPES = [
  { id: '大型犬', name: '大型犬', parts: ['犬系', '黏人', '爱撒娇'], effect: { key: 'k', text: '独有。' }, nsfw: false },
  { id: '软', name: '软', parts: ['一碰就软', '黏人'], effect: { key: 'k2', text: '独有二。' }, nsfw: true },
];
const meta = { charName: '林夏', cardName: '测试卡', date: '2026-11-07' };

test('点亮：首次记录角色名、卡名、日期；重复不覆盖；不改原对象', () => {
  const s0 = emptyCodex();
  const a = lightTrait(s0, 'dog', meta);
  assert.equal(a.isNew, true);
  assert.deepEqual(a.store.traits.dog, { char: '林夏', card: '测试卡', date: '2026-11-07' });
  assert.deepEqual(s0.traits, {});
  const b = lightTrait(a.store, 'dog', { charName: '别人', cardName: '别卡' });
  assert.equal(b.isNew, false);
  assert.equal(b.store.traits.dog.char, '林夏');
  const c = lightCombo(b.store, '大型犬', meta);
  assert.equal(c.isNew, true);
  assert.equal(c.store.combos['大型犬'].card, '测试卡');
});

test('视图：进度、未点亮显示「？？？」、已点亮显示名称与说明', () => {
  let s = lightTrait(emptyCodex(), 'dog', meta).store;
  s = lightCombo(s, '大型犬', meta).store;
  const v = codexView(s, [], DEFS, RECIPES);
  // NSFW 关：3 个特质 + 1 个合成
  assert.deepEqual(v.progress, { lit: 2, total: 4 });
  const perf = v.groups.find((g) => g.group === '动物系');
  assert.equal(perf.items[0].name, '犬系');
  assert.equal(perf.items[0].desc, '像小狗。');
  const social = v.groups.find((g) => g.group === '性格');
  assert.equal(social.items[0].name, '？？？');
  assert.equal(social.items[0].desc, '');
  assert.equal(v.combos.items[0].name, '大型犬');
  assert.deepEqual(v.combos.items[0].parts, ['犬系', '黏人', '爱撒娇']);
});

test('未点亮的合成显示「？？？」，不泄露组成项', () => {
  const v = codexView(emptyCodex(), [], DEFS, RECIPES);
  const it = v.combos.items[0];
  assert.equal(it.name, '？？？');
  assert.equal(it.parts, null);
  assert.deepEqual(it.hints, []);
});

test('快合成提示：缺一项时显示已有项与「？」；缺两项不提示', () => {
  const chars = [
    { charName: '林夏', traits: ['犬系', '黏人'] },
    { charName: '路人', traits: ['犬系'] },
  ];
  const v = codexView(emptyCodex(), chars, DEFS, RECIPES);
  const it = v.combos.items[0];
  assert.deepEqual(it.hints, [{ charName: '林夏', parts: ['犬系', '黏人', '？'] }]);
  assert.equal(it.name, '？？？');
});

test('快合成提示支持 id 输入，已点亮的合成不再提示', () => {
  const chars = [{ charName: '林夏', traits: ['dog', 'cling'] }];
  const v = codexView(emptyCodex(), chars, DEFS, RECIPES);
  assert.equal(v.combos.items[0].hints.length, 1);
  const lit = lightCombo(emptyCodex(), '大型犬', meta).store;
  assert.equal(codexView(lit, chars, DEFS, RECIPES).combos.items[0].hints.length, 0);
});

test('NSFW 关闭时 nsfw 特质与含 nsfw 的配方都不出现，开启后出现', () => {
  const off = codexView(emptyCodex(), [], DEFS, RECIPES);
  assert.ok(!off.groups.some((g) => g.group === '床上'));
  assert.equal(off.combos.items.length, 1);
  assert.equal(off.progress.total, 4);
  const on = codexView(emptyCodex(), [], DEFS, RECIPES, { nsfwOn: true });
  assert.ok(on.groups.some((g) => g.group === '床上'));
  assert.equal(on.combos.items.length, 2);
  assert.equal(on.progress.total, 6);
  // 快合成提示同样不泄露 nsfw 配方
  const chars = [{ charName: '林夏', traits: ['黏人'] }];
  assert.equal(codexView(emptyCodex(), chars, DEFS, RECIPES).combos.items.length, 1);
  assert.equal(codexView(emptyCodex(), chars, DEFS, RECIPES, { nsfwOn: true }).combos.items[1].hints.length, 1);
});

test('清空图鉴', () => {
  const s = lightTrait(emptyCodex(), 'dog', meta).store;
  const cleared = clearCodex(s);
  assert.deepEqual(cleared, { traits: {}, combos: {} });
  assert.equal(codexView(cleared, [], DEFS, RECIPES).progress.lit, 0);
});

test('syncCodex：按当前角色批量点亮特质与合成，返回新增项', () => {
  const chars = [{ charName: '林夏', traits: ['犬系', '黏人', '爱撒娇'] }];
  const r = syncCodex(emptyCodex(), chars, DEFS, RECIPES, { cardName: '测试卡', date: '2026-11-07' });
  assert.deepEqual(r.newTraits.map((t) => t.id), ['dog', 'cling', 'coy']);
  assert.deepEqual(r.newCombos.map((c) => c.id), ['大型犬']);
  assert.equal(r.store.combos['大型犬'].char, '林夏');
  const again = syncCodex(r.store, chars, DEFS, RECIPES);
  assert.equal(again.newTraits.length + again.newCombos.length, 0);
});

test('存储容错：传入 null / 残缺对象不报错', () => {
  assert.equal(codexView(null, null, DEFS, RECIPES).progress.lit, 0);
  assert.equal(lightTrait({}, 'dog', meta).isNew, true);
});
