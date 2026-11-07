// 特质合成：优先级、占格、拆分、关系状态配方。使用最小假登记表，不依赖 stat-traits.js。
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAIT_RECIPES, resolveCombos, diffCombos, comboNoticeText } from '../src/scene/stats/stat-trait-recipes.js';

const R = (name, parts) => ({ id: name, name, parts, effect: { key: name, text: '说明。' } });

test('配方表：条数、名称唯一、组成项不重复、独有效果有键与说明', () => {
  assert.equal(TRAIT_RECIPES.length, 46);
  assert.equal(new Set(TRAIT_RECIPES.map((r) => r.name)).size, TRAIT_RECIPES.length);
  for (const r of TRAIT_RECIPES) {
    assert.equal(new Set(r.parts).size, r.parts.length, r.name);
    assert.ok(r.effect.key && r.effect.text, r.name);
  }
});

test('齐全即合成，占 1 格', () => {
  const r = resolveCombos(['犬系', '黏人', '爱撒娇']);
  assert.deepEqual(r.combos.map((c) => c.name), ['大型犬']);
  assert.equal(r.slotsUsed, 1);
  assert.equal(r.combos[0].effect.key, 'noGrudgeOnNeglect');
});

test('缺一项不合成，组成项各占一格', () => {
  const r = resolveCombos(['犬系', '黏人']);
  assert.equal(r.combos.length, 0);
  assert.equal(r.slotsUsed, 2);
});

test('合成腾出格子：多出的特质另计', () => {
  const r = resolveCombos(['犬系', '黏人', '爱撒娇', '勤奋', '乐观']);
  assert.equal(r.combos.length, 1);
  assert.equal(r.slotsUsed, 3);
});

test('组成项多的优先，同数按表序', () => {
  const recipes = [R('甲', ['a', 'b']), R('乙', ['a', 'b', 'c']), R('丙', ['c', 'd'])];
  // abc 齐：乙（3 项）先占，甲、丙不再成立
  let r = resolveCombos(['a', 'b', 'c', 'd'], { recipes });
  assert.deepEqual(r.combos.map((c) => c.name), ['乙']);
  assert.equal(r.slotsUsed, 2);
  // 同数：甲、丙共用不了时按表序；这里 b 被甲占
  const rs = [R('甲', ['a', 'b']), R('丁', ['b', 'c'])];
  r = resolveCombos(['a', 'b', 'c'], { recipes: rs });
  assert.deepEqual(r.combos.map((c) => c.name), ['甲']);
  // 表序颠倒则丁先
  r = resolveCombos(['a', 'b', 'c'], { recipes: [rs[1], rs[0]] });
  assert.deepEqual(r.combos.map((c) => c.name), ['丁']);
});

test('真实配方：抖S 同时满足大恶魔与暴君，表序在前者得，且一个特质只参与一个合成', () => {
  const r = resolveCombos(['小恶魔', '抖S', '疯批', '控制狂']);
  assert.deepEqual(r.combos.map((c) => c.name), ['大恶魔']);
  assert.equal(r.slotsUsed, 2);
});

test('不相交的配方可同时成立', () => {
  const r = resolveCombos(['犬系', '黏人', '爱撒娇', '猫系', '傲娇', '冰山']);
  assert.deepEqual(r.combos.map((c) => c.name).sort(), ['大型犬', '高冷猫猫'].sort());
  assert.equal(r.slotsUsed, 2);
});

test('关系状态作组成项，不占格', () => {
  const r = resolveCombos(['知恩图报'], { states: ['救命之恩'] });
  assert.deepEqual(r.combos.map((c) => c.name), ['以身相许']);
  assert.equal(r.slotsUsed, 1);
  assert.equal(resolveCombos(['知恩图报']).combos.length, 0);
  const r2 = resolveCombos(['已标记'], { states: ['信息素契合'] });
  assert.deepEqual(r2.combos.map((c) => c.name), ['灵魂伴侣']);
});

test('支持 id 输入（需 defs）', () => {
  const defs = [{ id: 't1', name: '护短' }, { id: 't2', name: '包容' }];
  const r = resolveCombos(['t1', 't2'], { defs });
  assert.deepEqual(r.combos.map((c) => c.name), ['守护者']);
});

test('主角只能合成「主角可用」项组成的配方', () => {
  const defs = [
    { id: 'a', name: '护短', protagonist: false },
    { id: 'b', name: '包容', protagonist: true },
    { id: 'c', name: '劫后余生', protagonist: true },
    { id: 'd', name: '坚韧', protagonist: true },
    { id: 'e', name: '旧伤', protagonist: true },
  ];
  assert.equal(resolveCombos(['护短', '包容'], { defs, protagonist: true }).combos.length, 0);
  assert.equal(resolveCombos(['护短', '包容'], { defs }).combos.length, 1);
  assert.deepEqual(resolveCombos(['劫后余生', '坚韧', '旧伤'], { defs, protagonist: true }).combos.map((c) => c.name), ['百炼成钢']);
});

test('diffCombos：合成通知', () => {
  const out = diffCombos(['犬系', '黏人'], ['犬系', '黏人', '爱撒娇'], { charName: '林夏' });
  assert.deepEqual(out, [{ type: 'combo', charName: '林夏', name: '大型犬', parts: ['犬系', '黏人', '爱撒娇'] }]);
  assert.equal(comboNoticeText(out[0]), '林夏的「犬系」「黏人」「爱撒娇」合成为「大型犬」！');
});

test('diffCombos：拆分通知，组成项只列仍在的', () => {
  const out = diffCombos(['犬系', '黏人', '爱撒娇'], ['犬系', '爱撒娇'], { charName: '林夏' });
  assert.deepEqual(out, [{ type: 'split', charName: '林夏', name: '大型犬', parts: ['犬系', '爱撒娇'] }]);
  assert.equal(comboNoticeText(out[0]), '林夏的「大型犬」拆回「犬系」「爱撒娇」。');
});

test('diffCombos：无变化无通知；关系状态消失也会拆分', () => {
  assert.deepEqual(diffCombos(['犬系'], ['犬系'], { charName: 'x' }), []);
  const out = diffCombos({ traits: ['知恩图报'], states: ['救命之恩'] }, { traits: ['知恩图报'], states: [] }, { charName: '林夏' });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'split');
  assert.deepEqual(out[0].parts, ['知恩图报']);
});

test('diffCombos：被更大配方吞并时旧合成拆分、新合成成立', () => {
  const recipes = [R('甲', ['a', 'b']), R('乙', ['a', 'b', 'c'])];
  const out = diffCombos(['a', 'b'], ['a', 'b', 'c'], { charName: 'X', recipes });
  assert.deepEqual(out.map((n) => `${n.type}:${n.name}`), ['combo:乙', 'split:甲']);
});
