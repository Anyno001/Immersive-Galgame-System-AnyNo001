// 特质雷点：三档、同楼取最重、每日上限、冲突处理、强制事项、已知雷点显示。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName } from '../src/scene/stats/stat-traits.js';
import { LANDMINES, landmineView } from '../src/scene/stats/stat-trait-landmines.js';
import { mandatesFromFlags } from '../src/scene/stats/stat-prompt.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';

const high = () => 0.99;
const resolve = (n) => n;
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const on = { on: true, src: 'manual' };
const traitsFor = (who, ...names) => ({ [who]: Object.fromEntries(names.map((n) => [n.startsWith('combo:') ? n : getTraitByName(n).id, on])) });
const mk = (patch = {}) => {
    const c = createCharacter(1, { nsfw: true });
    return { ...c, ...patch, dims: { ...c.dims, ...(patch.dims || {}) } };
};
const world = (chars) => ({ ...createStatsState(), characters: chars });
const favorOf = (r, n = '林夏') => r.state.characters[n].dims.好感;
const ev = (v, n = '林夏') => `[igs-stat:event|${n}|${v}]`;

test('登记表引用的特质都存在', () => {
    for (const [name] of LANDMINES) assert.ok(getTraitByName(name), name);
});

test('轻雷：本楼好感上升作废，不额外扣分', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 30 } }) });
    const r = floor(s, `${ev('拒绝')}[igs-stat:favor|林夏|喜欢|中]`, traitsFor('林夏', '强势'));
    assert.equal(favorOf(r), 30);
    assert.ok(r.changes.some((c) => c.note === '踩雷·强势：被拒绝'));
    assert.equal(r.meta.flags.landmine, undefined);
});

test('雷：上升作废并再扣 3，下一楼强制事项不提特质', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 30, 了解: 99 } }) });
    const r = floor(s, `${ev('顶撞')}[igs-stat:favor|林夏|喜欢|中]`, traitsFor('林夏', '强势'));
    assert.equal(favorOf(r), 27);
    const row = r.changes.find((c) => String(c.note).startsWith('踩雷'));
    assert.equal(row.note, '踩雷·强势：被顶撞');
    assert.ok(row.calc.some((x) => /雷/.test(String(x.value))));
    const m = mandatesFromFlags(r.meta.flags).join('');
    assert.match(m, /林夏对上一楼主角的顶撞心里不快/);
    assert.ok(!m.includes('强势'));
    assert.deepEqual(r.meta.landmines, [{ name: '林夏', key: '强势:event:顶撞' }]);
});

test('重雷：扣 8、芥蒂 +2', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 40 } }) });
    const r = floor(s, ev('背叛'), traitsFor('林夏', '护短'));
    assert.equal(favorOf(r) <= 32, true);
    assert.ok(r.changes.some((c) => c.key === '好感' && c.note === '踩雷·护短：遭背叛' && c.to - c.from === -8));
    assert.ok(r.changes.some((c) => c.key === '芥蒂' && c.note === '踩雷·护短：遭背叛' && c.to - c.from === 2));
    assert.match(mandatesFromFlags(r.meta.flags).join(''), /背叛/);
});

test('同楼同角色多个雷点只取最重的', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 40 } }) });
    const r = floor(s, `${ev('拒绝')}${ev('顶撞')}`, traitsFor('林夏', '强势'));
    assert.equal(r.changes.filter((c) => String(c.note).startsWith('踩雷')).length, 1);
    assert.equal(favorOf(r), 37);
});

test('每个角色每天因雷点扣的好感合计最多 15', () => {
    let s = world({ 林夏: mk({ dims: { 好感: 60 } }) });
    for (let i = 0; i < 3; i += 1) s = floor(s, ev('背叛'), traitsFor('林夏', '护短')).state;
    // 三次重雷各 8，第二次受每日 15 封顶只扣 7，第三次不再扣。
    assert.equal(s.characters.林夏.dims.好感, 45);
});

test('占有狂：旁观亲密只扣好感，不加芥蒂', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 40 } }), 苏晴: mk({ dims: { 好感: 40 } }) });
    const r = floor(s, '[igs-stat:intimate|苏晴|轻]', traitsFor('林夏', '占有狂'), { present: ['林夏', '苏晴'] });
    assert.ok(r.changes.some((c) => c.target === '林夏' && c.key === '好感' && c.note === '踩雷·占有狂：主角与他人亲密' && c.to - c.from === -8));
    assert.ok(!r.changes.some((c) => c.target === '林夏' && c.key === '芥蒂' && String(c.note).startsWith('踩雷')));
});

test('追妻火葬场：芥蒂明显起，强势的拒绝雷点不生效', () => {
    const t = traitsFor('林夏', '强势', 'combo:追妻火葬场');
    const plain = floor(world({ 林夏: mk({ dims: { 好感: 40, 芥蒂: 10 } }) }), ev('拒绝'), t);
    assert.equal((plain.meta.landmines || []).length, 1);
    const hurt = floor(world({ 林夏: mk({ dims: { 好感: 40, 芥蒂: 30 } }) }), ev('拒绝'), t);
    assert.equal(hurt.meta.landmines, undefined);
});

test('未到阶段与重复触发', () => {
    const early = floor(world({ 林夏: mk({ dims: { 好感: 20 } }) }), '[igs-stat:intimate|林夏|轻]', traitsFor('林夏', '禁欲'));
    assert.ok(early.changes.some((c) => c.note === '踩雷·禁欲：好感未到即亲密'));
    assert.equal(early.meta.landmines[0].key, '禁欲:early:亲密');
    const late = floor(world({ 林夏: mk({ dims: { 好感: 60 } }) }), '[igs-stat:intimate|林夏|轻]', traitsFor('林夏', '禁欲'));
    assert.ok(!late.changes.some((c) => String(c.note).startsWith('踩雷')));
    const t = traitsFor('林夏', '冰山');
    const first = floor(world({ 林夏: mk({ dims: { 好感: 60 } }) }), '[igs-stat:event|林夏|约会]', t);
    assert.equal(first.meta.landmines, undefined);
    const second = floor(first.state, '[igs-stat:event|林夏|约会]', t);
    assert.deepEqual(second.meta.landmines, [{ name: '林夏', key: '冰山:repeat:约会' }]);
});

test('新事件标签可解析、条件雷点按好感判定', () => {
    const r = floor(world({ 林夏: mk({ dims: { 好感: 10 } }) }), ev('夸奖'), traitsFor('林夏', '傲娇'));
    assert.deepEqual(r.meta.landmines, [{ name: '林夏', key: '傲娇:event:夸奖' }]);
    const ok = floor(world({ 林夏: mk({ dims: { 好感: 40 } }) }), ev('夸奖'), traitsFor('林夏', '傲娇'));
    assert.equal(ok.meta.landmines, undefined);
    const cold = floor(world({ 林夏: mk({ dims: { 好感: 40 } }) }), ev('冷落'), traitsFor('林夏', '白月光'));
    assert.equal(favorOf(cold), 37);
});

test('不传入对象被原地修改', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 40 } }) });
    const snap = JSON.stringify(s);
    floor(s, ev('顶撞'), traitsFor('林夏', '强势'));
    assert.equal(JSON.stringify(s), snap);
});

test('已知雷点：踩过的显示，了解过半显示全部', () => {
    const known = { '强势:event:顶撞': 3 };
    const some = landmineView(['强势'], known, 10).map((x) => x.text);
    assert.deepEqual(some, ['被顶撞（强势·雷）']);
    assert.equal(landmineView(['强势'], {}, 10).length, 0);
    assert.equal(landmineView(['强势'], {}, 50).length, 4);
    const cat = sanitizeCatalog({ landmineKnown: { 林夏: known } });
    assert.equal(cat.landmineKnown.林夏['强势:event:顶撞'], 3);
});

const low = () => 0.99;
const never = () => 0.11;
test('引起注意：顶撞后了解掷骰通过，心意槽 +2 且下一楼强制事项改写', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 30, 了解: 20 } }) });
    const r = floor(s, ev('顶撞'), traitsFor('林夏', '强势'), { random: low });
    assert.equal(r.state.characters.林夏.heart, 2);
    assert.equal(r.state.characters.林夏.noticeDay, r.state.clock.day);
    assert.match(mandatesFromFlags(r.meta.flags).join(''), /林夏被主角顶撞后表面不悦，心里却开始留意对方/);
    const row = r.changes.find((c) => String(c.note).startsWith('踩雷'));
    assert.ok(row.calc.some((x) => /引起注意/.test(String(x.label || x.key || x.name || JSON.stringify(x)))));
});

test('引起注意：心意槽满溢给好感 +5', () => {
    const s = world({ 林夏: mk({ heart: 3, dims: { 好感: 30, 了解: 20 } }) });
    const r = floor(s, ev('顶撞'), traitsFor('林夏', '强势'), { random: low });
    assert.equal(r.state.characters.林夏.heart, 0);
    assert.equal(favorOf(r), 32);
    assert.ok(r.changes.some((c) => c.note === '心意满溢' && c.to - c.from === 5));
});

test('引起注意：同一游戏日只通过一次，未通过不动心意槽', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 30, 了解: 20 } }) });
    const a = floor(s, ev('顶撞'), traitsFor('林夏', '强势'), { random: low });
    const b = floor(a.state, ev('顶撞'), traitsFor('林夏', '强势'), { random: low });
    assert.equal(b.state.characters.林夏.heart, 2);
    const c = floor(s, ev('顶撞'), traitsFor('林夏', '强势'), { random: never });
    assert.equal(c.state.characters.林夏.heart || 0, 0);
});
