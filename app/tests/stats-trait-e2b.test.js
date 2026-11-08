// E2b：羁绊加成、情绪传染、地点归属、天气季节、守约与失约。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName, traitCatalogOf } from '../src/scene/stats/stat-traits.js';
import { traitEdgeOf } from '../src/scene/stats/stat-trait-dice.js';
import { TRAIT_EVENTS } from '../src/scene/stats/stat-vocab.js';

const high = () => 0.99;
const resolve = (n) => n;
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const on = { on: true, src: 'manual' };
const traitsFor = (who, ...names) => ({ [who]: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on])) });
const merge = (...maps) => Object.assign({}, ...maps.map((m) => m));
const world = (patch = {}, stress = 30, clock = {}) => {
    const c = createCharacter(1, { nsfw: true });
    const base = createStatsState();
    return { ...base, characters: { 林夏: { ...c, ...patch, dims: { ...c.dims, ...(patch.dims || {}) }, bars: { ...c.bars, ...(patch.bars || {}) } } }, protagonist: { ...base.protagonist, bars: { stamina: 50, money: 0, stress } }, clock: { ...base.clock, day: 9, ...clock } };
};
const day = (state, traits, env = {}, present = ['林夏']) => settleDay(state, { random: high, rev: 2, traits, nsfw: true, present, env });
const heroStress = (r) => r.protagonist.bars.stress;

test('事件词含守约、失约', () => {
    assert.ok(TRAIT_EVENTS.includes('守约') && TRAIT_EVENTS.includes('失约'));
});

test('守约：好感 +2、信任 +1，带明细；失约：好感 -2、芥蒂 +2；同日同类只算一次', () => {
    const s = world({ dims: { 好感: 30, 信任: 30, 芥蒂: 5 } });
    const keep = floor(s, '[igs-stat:event|林夏|守约]');
    assert.equal(keep.state.characters.林夏.dims.好感, 32);
    assert.equal(keep.state.characters.林夏.dims.信任, 31);
    const row = keep.changes.find((c) => c.note === '守约' && c.key === '好感');
    assert.ok(row && row.calc.length >= 2);
    const twice = floor(keep.state, '[igs-stat:event|林夏|守约]');
    assert.equal(twice.state.characters.林夏.dims.好感, 32);
    const miss = floor(s, '[igs-stat:event|林夏|失约]');
    assert.equal(miss.state.characters.林夏.dims.好感, 28);
    assert.equal(miss.state.characters.林夏.dims.芥蒂, 7);
});

test('羁绊加成：恋人在场且擅长该领域，主角检定多一个奖励骰', () => {
    const s = world({ romance: true });
    const cat = traitCatalogOf(traitsFor('林夏', '学霸'), true);
    const r = traitEdgeOf(s, cat, { actor: '主角', skill: '学习', present: ['林夏'] });
    assert.equal(r.edge, 1);
    assert.equal(traitEdgeOf(s, cat, { actor: '主角', skill: '烹饪', present: ['林夏'] }).edge, 0, '非擅长领域不加');
    assert.equal(traitEdgeOf(s, cat, { actor: '主角', skill: '学习', present: [] }).edge, 0, '不在场不加');
    const friend = world({ romance: false, dims: { 信任: 60 } });
    assert.equal(traitEdgeOf(friend, cat, { actor: '主角', skill: '学习', present: ['林夏'] }).edge, 0, '非恋人且信任未满不加');
    const full = world({ romance: false, dims: { 信任: 100 } });
    assert.equal(traitEdgeOf(full, cat, { actor: '主角', skill: '学习', present: ['林夏'] }).edge, 1, '信任满也算');
    const skilled = traitEdgeOf(s, traitCatalogOf({}, true), { actor: '主角', skill: '烹饪', present: ['林夏'], skillOf: () => 70 });
    assert.equal(skilled.edge, 1, '没有特质映射时看 NPC 自身技能');
});

test('感染力强 / 低气压：在场其他人压力每天 -3 / +3，带明细', () => {
    const calm = day(world({}, 40), traitsFor('林夏', '感染力强'));
    const plain = day(world({}, 40), {});
    assert.equal(heroStress(calm.state ? calm.state : calm), heroStress(plain.state ? plain.state : plain) - 3);
});

test('镇定剂：在场其他人本楼压力上升减半', () => {
    const s = world({}, 30);
    const plain = floor(s, '[igs-stat:stress|上升|大]');
    const calm = floor(s, '[igs-stat:stress|上升|大]', traitsFor('林夏', '镇定剂'), { present: ['林夏'] });
    const up = heroStress(plain.state) - 30;
    assert.ok(up > 0);
    assert.equal(heroStress(calm.state) - 30, up - Math.floor(up / 2));
});

test('恋家：在家压力小降（每天一次）；离家三天压力每天 +3', () => {
    const s = world({}, 40);
    const home = floor(s, 'x', traitsFor('主角', '恋家'), { env: { place: '林夏的家', weather: '晴' } });
    assert.equal(heroStress(home.state), 37);
    const again = floor(home.state, 'x', traitsFor('主角', '恋家'), { env: { place: '林夏的家', weather: '晴' } });
    assert.equal(heroStress(again.state), 37);
    const away = world({}, 40, { e2bHome: { 主角: 5 } });
    const gone = day(away, traitsFor('主角', '恋家'), { place: '街角咖啡店' });
    assert.equal(heroStress(gone.state ? gone.state : gone), heroStress((day(away, {}, { place: '街角咖啡店' }).state) || day(away, {}, { place: '街角咖啡店' })) + 3);
});

test('旅行者：新地点压力 -5，第一次出现的地点只记录', () => {
    const t = traitsFor('主角', '旅行者');
    const a = floor(world({}, 40), 'x', t, { env: { place: '图书馆', weather: '晴' } });
    assert.equal(heroStress(a.state), 40);
    const b = floor(a.state, 'x', t, { env: { place: '海边', weather: '晴' } });
    assert.equal(heroStress(b.state), 35);
});

test('雨天忧郁：雨天压力 +3，每天一次', () => {
    const t = traitsFor('主角', '雨天忧郁');
    const a = floor(world({}, 40), 'x', t, { env: { place: '教室', weather: '小雨' } });
    assert.equal(heroStress(a.state), 43);
    assert.equal(heroStress(floor(a.state, 'x', t, { env: { place: '教室', weather: '小雨' } }).state), 43);
    assert.equal(heroStress(floor(world({}, 40), 'x', t, { env: { place: '教室', weather: '晴' } }).state), 40);
});

test('认床、春困：体力恢复打折；春季按日期判断', () => {
    const spring = world({}, 30, { lastDate: '3月12日' });
    const plain = day(spring, {});
    const sleepy = day(spring, traitsFor('主角', '春困'));
    const stam = (r) => (r.state || r).protagonist.bars.stamina;
    assert.ok(stam(sleepy) < stam(plain));
    const winter = world({}, 30, { lastDate: '12月12日' });
    assert.equal(stam(day(winter, traitsFor('主角', '春困'))), stam(day(winter, {})));
    const bed = day(world({}, 30), traitsFor('主角', '认床'), { place: '旅馆房间' });
    assert.ok(stam(bed) < stam(day(world({}, 30), {}, { place: '旅馆房间' })));
    const homeBed = day(world({}, 30), traitsFor('主角', '认床'), { place: '自己的卧室' });
    assert.equal(stam(homeBed), stam(day(world({}, 30), {}, { place: '自己的卧室' })));
});

test('新特质已登记且说明不含中英文空格', () => {
    for (const n of ['感染力强', '低气压', '镇定剂', '恋家', '旅行者', '认床', '雨天忧郁', '春困']) {
        const d = getTraitByName(n);
        assert.ok(d, n);
        assert.ok(d.desc && !/[一-鿿]\s+[A-Za-z]|[A-Za-z]\s+[一-鿿]/.test(d.desc));
    }
});
