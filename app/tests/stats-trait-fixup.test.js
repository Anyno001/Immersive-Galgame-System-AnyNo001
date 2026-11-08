// 补漏规则：登记了却没效果的特质、说明里没做的子效果、检定类别（街头冲突、约会）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName, traitCatalogOf } from '../src/scene/stats/stat-traits.js';
import { traitEdgeOf, diceCategories } from '../src/scene/stats/stat-trait-dice.js';
import { EXT_TAG_HOOKS, EXT_DAILY_HOOKS } from '../src/scene/stats/stat-trait-rules.js';
import { TAG_HOOKS, DAILY_HOOKS } from '../src/scene/stats/stat-trait-rules-fixup.js';

const high = () => 0.99;
const resolve = (n) => n;
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const on = { on: true, src: 'manual' };
const traitsFor = (who, ...names) => ({ [who]: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on])) });
const mk = (patch = {}) => {
    const c = createCharacter(1, { nsfw: true });
    return { ...c, ...patch, dims: { ...c.dims, ...(patch.dims || {}) } };
};
const world = (chars) => ({ ...createStatsState(), characters: chars });

test('补漏规则已注册', () => {
    for (const h of TAG_HOOKS) assert.ok(EXT_TAG_HOOKS.includes(h));
    for (const h of DAILY_HOOKS) assert.ok(EXT_DAILY_HOOKS.includes(h));
});

test('检定类别：街头冲突、约会', () => {
    assert.ok(diceCategories('格斗').includes('街头冲突'));
    assert.ok(diceCategories('恐吓', { social: true }).includes('街头冲突'));
    assert.ok(diceCategories('魅惑', { social: true }).includes('约会'));
    assert.ok(!diceCategories('烹饪').includes('约会'));
});

test('混混：街头冲突类检定多一个奖励骰', () => {
    const s = world({});
    const cat = traitCatalogOf(traitsFor('主角', '混混'), true);
    assert.equal(traitEdgeOf(s, cat, { actor: '主角', skill: '格斗' }).edge, 1);
    assert.equal(traitEdgeOf(s, cat, { actor: '主角', skill: '烹饪' }).edge, 0);
});

test('冷血：共患难事件好感上升减半', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 30 } }) });
    const plain = floor(s, '[igs-stat:event|林夏|共患难][igs-stat:favor|林夏|喜欢|中]');
    const cold = floor(s, '[igs-stat:event|林夏|共患难][igs-stat:favor|林夏|喜欢|中]', traitsFor('林夏', '冷血'));
    assert.ok(cold.state.characters.林夏.dims.好感 > 30);
    assert.ok(cold.changes.some((c) => c.note === '冷血'));
});

test('腹黑：了解未过半时好感记为隐藏', () => {
    const s = world({ 林夏: mk({ dims: { 了解: 10 } }) });
    const r = floor(s, '[igs-stat:favor|林夏|喜欢|中]', traitsFor('林夏', '腹黑'));
    assert.equal(r.state.characters.林夏.favorHidden, true);
});

test('花心：另有好感心动以上的角色时，好感上升补一半', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 60 } }), 苏晴: mk({ dims: { 好感: 60 } }) });
    const plain = floor(s, '[igs-stat:favor|林夏|喜欢|中]');
    const flirt = floor(s, '[igs-stat:favor|林夏|喜欢|中]', traitsFor('林夏', '花心'));
    assert.ok(flirt.state.characters.林夏.dims.好感 > plain.state.characters.林夏.dims.好感);
    assert.ok(flirt.changes.some((c) => c.note === '花心'));
});

test('大佬（主角）：开局金钱高一档，只算一次', () => {
    const s = world({ 林夏: mk() });
    const plain = floor(s, '[igs-stat:favor|林夏|喜欢|小]');
    const boss = floor(s, '[igs-stat:favor|林夏|喜欢|小]', traitsFor('主角', '大佬'));
    assert.ok(boss.state.protagonist.bars.money > plain.state.protagonist.bars.money);
    const again = floor(boss.state, '[igs-stat:favor|林夏|喜欢|小]', traitsFor('主角', '大佬'));
    assert.equal(again.state.protagonist.bars.money, boss.state.protagonist.bars.money);
});
