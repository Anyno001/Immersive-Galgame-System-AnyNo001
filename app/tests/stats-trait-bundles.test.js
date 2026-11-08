// 捆绑特质、评定解析归一化、新特质钩子（天生媚骨招人觊觎、龙系、逆鳞）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTraitChange, getTraitByName, listTraits, traitCatalogOf, traitScale } from '../src/scene/stats/stat-traits.js';
import { settleTraitTags } from '../src/scene/stats/stat-trait-hooks.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { TRAIT_DEFS } from '../src/scene/stats/stat-traits.js';
import { judgedNames, parseReviewReply } from '../src/core/trait-review.js';

const ids = (cat, name = '林夏') => listTraits(cat, name).map((t) => `${t.id}:${t.src}`).sort();
const put = (cat, id, src = 'manual', opts) => applyTraitChange(null, cat, '林夏', id, true, src, undefined, opts);

test('捆绑：挂本体连带挂上捆绑项（不占格），摘本体一并摘下', () => {
    const r = put({ traits: {} }, '龙族');
    assert.deepEqual(ids(r.catalog), ['逆鳞:bound', '龙族:manual']);
    assert.equal(r.catalog.traits.林夏.逆鳞.by, '龙族');
    const off = applyTraitChange(null, r.catalog, '林夏', '龙族', false, 'manual');
    assert.deepEqual(ids(off.catalog), []);
});

test('捆绑：bound 项不能单独摘下，自动评定与互斥替换也摘不掉', () => {
    const cat = put({ traits: {} }, '蛇系').catalog;
    assert.equal(applyTraitChange(null, cat, '林夏', '记仇', false, 'manual').reason, 'bound');
    assert.equal(applyTraitChange(null, cat, '林夏', '记仇', false, 'auto').reason, 'bound');
    assert.equal(put(cat, '宽容').reason, 'bound-conflict');
    assert.equal(put({ traits: {} }, '逆鳞').reason, 'bound-only');
});

test('捆绑互斥：与另一本体的捆绑项冲突时拒绝，与普通特质冲突时顶替', () => {
    const killer = put({ traits: {} }, '杀手').catalog;
    assert.equal(put(killer, '熊系').reason, 'bound-conflict');
    const stingy = put({ traits: {} }, '吝啬鬼').catalog;
    assert.equal(put(stingy, '富二代').reason, 'bound-conflict');
    const calm = put({ traits: {} }, '心大').catalog;
    const r = put(calm, '犬系');
    assert.deepEqual(ids(r.catalog), ['犬系:manual', '醋坛子:bound']);
});

test('豁免：只对可豁免的捆绑生效，手动添加不豁免', () => {
    const snake = put({ traits: {} }, '蛇系', 'auto', { waive: ['记仇'] });
    assert.deepEqual(ids(snake.catalog), ['蛇系:auto']);
    assert.deepEqual(snake.catalog.traits.林夏.蛇系.waived, ['记仇']);
    const dragon = put({ traits: {} }, '龙族', 'auto', { waive: ['逆鳞'] });
    assert.deepEqual(ids(dragon.catalog), ['逆鳞:bound', '龙族:auto']);
    assert.deepEqual(dragon.waiveDropped, ['逆鳞']);
    assert.deepEqual(ids(put({ traits: {} }, '蛇系', 'manual', { waive: ['记仇'] }).catalog), ['蛇系:manual', '记仇:bound']);
});

test('解析归一化：去括号、冒号说明、首尾标点，认旧名；对不上的记下', () => {
    const dropped = [];
    const reply = '{"results":[{"name":"林夏","tags":["龙族"],"add":["「龙系」（龙族）","记仇：芥蒂不消退","忠犬。","天生媚骨","魅魔体质","不存在"],"waive":["记仇"]}]}';
    const out = parseReviewReply(reply, TRAIT_DEFS, { dropped });
    assert.deepEqual(out.map((r) => r.id), ['龙系', '记仇', '犬系', '魅魔体质']);
    assert.deepEqual(out[0].waive, ['记仇']);
    assert.deepEqual(dropped, [{ charName: '林夏', word: '不存在' }]);
});

test('初始评定：人设为空且零结果的不记已评，有人设或有结果的记', () => {
    const persona = new Map([['甲', ''], ['乙', '冷酷的妖皇'], ['丙', '']]);
    assert.deepEqual(judgedNames(['甲', '乙', '丙'], persona, [{ charName: '丙', id: '龙系', on: true }]), ['乙', '丙']);
});

const world = (dims = {}) => {
    const c = createCharacter(1, { nsfw: true });
    return { ...createStatsState(), characters: { 林夏: { ...c, dims: { ...c.dims, ...dims } } } };
};
const trs = (map) => Object.fromEntries(Object.entries(map).map(([who, names]) => [who, Object.fromEntries(names.map((n) => [getTraitByName(n).id, { on: true, src: 'manual' }]))]));

test('天生媚骨：在场角色对主角欲望上升略快', () => {
    const changes = [{ source: 'tag', target: '林夏', key: '欲望', from: 10, to: 14 }];
    const s = world({ 欲望: 14 });
    const next = settleTraitTags(s, [], { traits: trs({ 主角: ['天生媚骨'] }), nsfw: true, changes, flags: {}, present: ['林夏'] });
    assert.equal(next.characters.林夏.dims.欲望, 16);
});

test('龙系压力上升减半；逆鳞：主角受伤那一楼芥蒂上升一大档、压力小升', () => {
    assert.equal(traitScale(world(), traitCatalogOf(trs({ 林夏: ['龙系'] }), true), '林夏', '压力', 'up'), 0.5);
    const traits = { 林夏: { 逆鳞: { on: true, src: 'bound', by: '龙系' } } };
    const s = world({ 芥蒂: 0 });
    const next = settleTraitTags(s, [{ kind: 'hurt', value: '轻伤' }], { traits, nsfw: true, changes: [], flags: {}, present: ['林夏'] });
    assert.equal(next.characters.林夏.dims.芥蒂, 10);
    assert.equal(next.characters.林夏.bars.stress, (s.characters.林夏.bars.stress || 0) + 5);
});
