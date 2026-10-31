import test from 'node:test';
import assert from 'node:assert/strict';
import * as dnd5e from '../src/scene/stats/rulesets/dnd5e.js';
import { DEFAULT_RULESET, getRuleset, hasRuleset } from '../src/scene/stats/rulesets/index.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { createEngine, resolveCheck, contestCheck, prerollTable, rollPreroll, checkFromPreroll, markGrowth, PROTAGONIST, chanceOf } from '../src/scene/stats/stat-engine.js';
import { createStatsState, createCharacter } from '../src/scene/stats/stat-state.js';

const p = (value, extra = {}) => ({ kind: 'skill', value, learned: true, attributeValue: 50, rank: '普通人', entry: { attribute: '敏捷' }, ...extra });

test('只剩 d20 一套：旧设置与旧存档里的 coc7 按 d20 处理，存档不变（合并计划 Q2）', () => {
    assert.equal(DEFAULT_RULESET, 'dnd5e');
    assert.equal(hasRuleset('coc7'), false);
    assert.equal(getRuleset('coc7').ID, 'dnd5e');
    assert.equal(normalizeStatsSettings({ ruleset: 'coc7' }).ruleset, 'dnd5e');
    const state = createStatsState();
    const before = JSON.stringify(state);
    const r = resolveCheck(createEngine({}, { ruleset: 'coc7' }), state, { actor: PROTAGONIST, skill: '烹饪' }, () => 0.3);
    assert.equal(r.ruleset, 'dnd5e');
    assert.equal(r.die, 20);
    assert.equal(JSON.stringify(state), before);
});

test('D&D：属性值 = 底数/5、修正向下取整；熟练与专精按底数分段，熟练加值看资历', () => {
    assert.equal(dnd5e.scoreOf(50), 10);
    assert.equal(dnd5e.modOf(50), 0);
    assert.equal(dnd5e.modOf(90), 4);
    assert.equal(dnd5e.modOf(40), -1);
    assert.equal(dnd5e.bonusOf(p(60, { attributeValue: 50 })), 2);
    assert.equal(dnd5e.bonusOf(p(80, { attributeValue: 50 })), 4);
    assert.equal(dnd5e.bonusOf(p(80, { attributeValue: 50, rank: '精英' })), 8);
    assert.equal(dnd5e.bonusOf(p(30, { attributeValue: 70 })), 2);
    assert.equal(dnd5e.bonusOf({ kind: 'attribute', value: 70, learned: true, attributeValue: 70, rank: '传奇' }), 2);
});

test('规则模块：DC 10/15/20/25；natural 选项控制自然 20/1；优势取高、劣势取低', () => {
    const prof = p(60, { attributeValue: 50 });
    assert.equal(dnd5e.resolve(prof, { difficulty: '普通' }, { d20: [13, 1] }).success, true);
    assert.equal(dnd5e.resolve(prof, { difficulty: '普通' }, { d20: [12, 1] }).success, false);
    assert.equal(dnd5e.resolve(prof, { difficulty: '极难' }, { d20: [20, 1] }).success, false);
    assert.equal(dnd5e.resolve(prof, { difficulty: '极难', natural: true }, { d20: [20, 1] }).success, true);
    assert.equal(dnd5e.resolve(prof, { difficulty: '普通', edge: 1 }, { d20: [3, 18] }).roll, 18);
    assert.equal(dnd5e.resolve(prof, { difficulty: '普通', edge: -1 }, { d20: [3, 18] }).roll, 3);
    assert.equal(dnd5e.resolve(prof, { difficulty: '简单' }, { d20: [20, 1] }).ladder, 'crit');
});

test('引擎固定按骰面 20 / 1 判大成功、大失败；优势 / 劣势保留', () => {
    const state = createStatsState();
    const engine = createEngine();
    const crit = resolveCheck(engine, state, { actor: PROTAGONIST, skill: '烹饪', difficulty: '极难', raw: { d20: [20, 1] } }, null);
    assert.equal(crit.success, true);
    assert.equal(crit.tier, '大成功');
    const fumble = resolveCheck(engine, state, { actor: PROTAGONIST, skill: '烹饪', difficulty: '简单', raw: { d20: [1, 20] } }, null);
    assert.equal(fumble.success, false);
    assert.equal(fumble.tier, '大失败');
    assert.equal(resolveCheck(engine, state, { actor: PROTAGONIST, skill: '烹饪', ally: true, raw: { d20: [3, 18] } }, null).roll, 18);
});

test('成功率表与计划 §4.3 一致（抽查）', () => {
    const round = (x) => Math.round(x * 100);
    assert.equal(round(dnd5e.chance(p(60, { attributeValue: 50 }), { difficulty: '普通' })), 40);
    assert.equal(round(dnd5e.chance(p(10, { attributeValue: 50, learned: false }), { difficulty: '极难' })), 0);
});
