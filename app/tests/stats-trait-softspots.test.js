// 特质软肋与进化。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName } from '../src/scene/stats/stat-traits.js';
import { softspotView } from '../src/scene/stats/stat-trait-softspots.js';
import { evolveCandidates, applyEvolutions } from '../src/scene/stats/stat-trait-evolve.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';

const high = () => 0.99;
const floor = (state, text, traits = {}) => settleFloorText(state, text, { random: high, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits });
const on = { on: true, src: 'manual' };
const traitsFor = (who, ...names) => ({ [who]: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on])) });
const mk = (patch = {}) => {
    const c = createCharacter(1, { nsfw: true });
    return { ...c, ...patch, dims: { ...c.dims, ...(patch.dims || {}) } };
};
const world = (chars) => ({ ...createStatsState(), characters: chars });
const ev = (v) => `[igs-stat:event|林夏|${v}]`;

test('软肋触发：心意槽加 1，记录已知软肋', () => {
    const r = floor(world({ 林夏: mk({ dims: { 好感: 30 } }) }), ev('守约'), traitsFor('林夏', '记仇'));
    assert.equal(r.state.characters.林夏.heart, 1);
    assert.deepEqual(r.meta.softspots, [{ name: '林夏', key: '记仇:守约' }]);
});

test('软肋每天一次', () => {
    const r1 = floor(world({ 林夏: mk({ dims: { 好感: 30 } }) }), ev('夸奖'), traitsFor('林夏', '犬系'));
    const r2 = floor(r1.state, ev('夸奖'), traitsFor('林夏', '犬系'));
    assert.equal(r1.state.characters.林夏.heart, 1);
    assert.equal(r2.state.characters.林夏.heart, 1);
});

test('同楼踩雷不结算软肋', () => {
    const r = floor(world({ 林夏: mk({ dims: { 好感: 30 } }) }), `${ev('夸奖')}${ev('批评')}`, traitsFor('林夏', '玻璃心'));
    assert.equal(r.meta.softspots, undefined);
    assert.ok(!r.state.characters.林夏.heart);
});

test('已知软肋：触发过恒显示，了解过半显示全部', () => {
    assert.deepEqual(softspotView(['记仇'], {}, 10), []);
    assert.equal(softspotView(['记仇'], { '记仇:守约': 3 }, 10).length, 1);
    assert.equal(softspotView(['记仇'], {}, 60).length, 1);
    assert.deepEqual(sanitizeCatalog({ softKnown: { 林夏: { '记仇:守约': 3 } } }).softKnown, { 林夏: { '记仇:守约': 3 } });
});

test('傲娇进化为坦率，来源沿用', () => {
    const s = world({ 林夏: mk({ noticeCount: { 傲娇: 3 } }) });
    const traits = { 林夏: { 傲娇: { on: true, src: 'story' } } };
    const list = evolveCandidates(s, traits);
    assert.deepEqual(list, [{ name: '林夏', from: '傲娇', to: '坦率' }]);
    assert.deepEqual(applyEvolutions(traits, list), { 林夏: { 坦率: { on: true, src: 'story' } } });
});

test('冰山信任 80 进化为融化的冰山', () => {
    const s = world({ 林夏: mk({ dims: { 信任: 80 } }) });
    const list = evolveCandidates(s, { 林夏: { 冰山: on } });
    assert.equal(list[0].to, '融化的冰山');
    assert.equal(evolveCandidates(world({ 林夏: mk({ dims: { 信任: 79 } }) }), { 林夏: { 冰山: on } }).length, 0);
});

test('捆绑项与合成组成项不进化', () => {
    const s = world({ 林夏: mk({ noticeCount: { 傲娇: 3 } }) });
    assert.equal(evolveCandidates(s, { 林夏: { 傲娇: { on: true, src: 'bound', by: '猫系' } } }).length, 0);
    assert.equal(evolveCandidates(s, { 林夏: { 傲娇: on, 'combo:某某': { on: true, src: 'auto', parts: ['傲娇', '冰山'] } } }).length, 0);
});

test('玻璃心并肩取胜 8 次进化为坚韧；有互斥特质、不足 8 次、捆绑项不进化', () => {
    const own = { 林夏: { 玻璃心: { on: true, src: 'story' } } };
    assert.equal(evolveCandidates(world({ 林夏: mk({ comradeWins: 7 }) }), own).length, 0);
    const list = evolveCandidates(world({ 林夏: mk({ comradeWins: 8 }) }), own);
    assert.deepEqual(list, [{ name: '林夏', from: '玻璃心', to: '坚韧' }]);
    assert.deepEqual(applyEvolutions(own, list), { 林夏: { 坚韧: { on: true, src: 'story' } } });
    assert.equal(evolveCandidates(world({ 林夏: mk({ comradeWins: 9 }) }), { 林夏: { 玻璃心: on, 爱哭鬼: on } }).length, 0);
});

test('主角挂玻璃心：主角取胜 8 次（clock.heroBattleWins）进化', () => {
    const s = { ...world({}), clock: { ...createStatsState().clock, heroBattleWins: 8 } };
    assert.equal(evolveCandidates(s, { 主角: { 玻璃心: on } })[0].to, '坚韧');
});
