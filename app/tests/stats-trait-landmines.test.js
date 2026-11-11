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

test('不传入对象被原地修改', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 40 } }) });
    const snap = JSON.stringify(s);
    floor(s, ev('顶撞'), traitsFor('林夏', '强势'));
    assert.equal(JSON.stringify(s), snap);
});

const low = () => 0.99;
const never = () => 0.11;

// ───── 特质加深 A 批 ─────
const tierOf = (r) => { const row = r.changes.find((c) => String(c.note).startsWith('踩雷') && c.key === '好感'); return row && row.calc.find((x) => x.label === '档位').value; };

