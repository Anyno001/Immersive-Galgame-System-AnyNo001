// 特质接线：combo 键、环境读取、已故 / 长生 / 附身、ABO 演出标签、复核事件、成就与合成、检定骰、图鉴点亮。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleSkip } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName, hasTrait, traitCatalogOf } from '../src/scene/stats/stat-traits.js';
import { traitEnvOf } from '../src/scene/stats/stat-trait-env.js';
import { traitEdgeOf } from '../src/scene/stats/stat-trait-dice.js';
import { achievementPass, createTraitCodexStore, lightCodex, refreshCombos } from '../src/core/stats-trait-runtime.js';
import { buildReviewPrompt, parseReviewEvents } from '../src/core/trait-review.js';
import { EVENT_TYPES } from '../src/scene/stats/stat-trait-rules-bond.js';

const high = () => 0.99;
const on = { on: true, src: 'manual' };
const tr = (map) => Object.fromEntries(Object.entries(map).map(([who, names]) => [who, Object.fromEntries(names.map((n) => [getTraitByName(n).id, on]))]));
const mk = (patch = {}) => { const b = createCharacter(1, { nsfw: true }); return { ...b, ...patch, dims: { ...b.dims, ...(patch.dims || {}) } }; };
const world = (npcs) => ({ ...createStatsState(), characters: npcs });
const floor = (state, text, traits, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });

test('hasTrait 认 combo:名 合成键；NSFW 合成在 NSFW 关闭时为假', () => {
    const cat = (nsfw) => traitCatalogOf({ 林夏: { 'combo:大型犬': { on: true, src: 'auto', parts: ['犬系'] }, 'combo:永动机': { on: true, src: 'auto', parts: ['体力怪物'] } } }, nsfw);
    assert.equal(hasTrait(world({}), cat(false), '林夏', 'combo:大型犬'), true);
    assert.equal(hasTrait(world({}), cat(false), '林夏', 'combo:永动机'), false);
    assert.equal(hasTrait(world({}), cat(true), '林夏', 'combo:永动机'), true);
});

test('环境读取：场景指令的天气与地点、ABO 演出标签、固定关键词', () => {
    const env = traitEnvOf('[igs-scene:海边|黄昏|小雨]\n她开始唱歌 [igs-fx:suppress|林夏|全场]');
    assert.equal(env.place, '海边');
    assert.equal(env.weather, '小雨');
    assert.deepEqual(env.fx[0], { kind: 'suppress', args: ['林夏', '全场'] });
    assert.deepEqual(env.words, ['唱歌']);
    assert.equal(traitEnvOf('没有标签', ['[igs-scene:天台|夜|晴]']).place, '天台');
});

test('已故：关系标签被丢弃；长生：时间跳跃不冷却', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 30 } }) });
    const r = floor(s, '[igs-stat:favor|林夏|开心]', tr({ 林夏: ['已故'] }));
    assert.equal(r.state.characters.林夏.dims.好感, 30);
    assert.ok(r.meta.diagnostics.some((d) => d.code === 'stat-deceased'));
    const idle = world({ 林夏: mk({ dims: { 好感: 40 }, lastSeenDay: 1 }) });
    const cooled = settleSkip(idle, 10, { random: high, rev: 2, traits: {}, nsfw: true, present: [] });
    const kept = settleSkip(idle, 10, { random: high, rev: 2, traits: tr({ 林夏: ['长生'] }), nsfw: true, present: [] });
    assert.ok(cooled.characters.林夏.dims.好感 < 40);
    assert.equal(kept.characters.林夏.dims.好感, 40);
});

test('ABO 演出标签：压制那一楼 Omega 压力上升，Beta 不受影响', () => {
    const s = world({ 林夏: mk(), 小雪: mk() });
    const traits = tr({ 林夏: ['Omega'], 小雪: ['Beta'] });
    const r = floor(s, '[igs-stat:favor|林夏|平淡]', traits, { env: traitEnvOf('[igs-fx:suppress|主角|全场]'), present: ['林夏', '小雪'] });
    assert.ok(r.state.characters.林夏.bars.stress > 0);
    assert.equal(r.state.characters.小雪.bars.stress, 0);
});

test('复核事件：恩仇走 bondEvents；夸奖走 reviewEvents（自卑）', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 20 } }) });
    const r = floor(s, '平静', tr({ 林夏: ['自卑'] }), { reviewEvents: [{ type: '夸奖', name: '林夏', dir: 'ta' }], present: ['林夏'] });
    assert.ok(r.state.characters.林夏.dims.好感 > 20);
    const b = floor(s, '平静', {}, { bondEvents: [{ type: '救命', target: '林夏', who: '林夏', dir: 'ta' }], present: ['林夏'] });
    assert.ok((b.state.characters.林夏.relStates || []).some((x) => x.id === '救命之恩'));
});

test('复核提示词带事件短表；解析分流恩仇与评定事件、丢弃表外', () => {
    const p = buildReviewPrompt({ nsfw: false, chars: [], floors: [], summary: [] }, [], 'story', ['救命']);
    assert.match(p, /events/);
    assert.match(p, /夸奖/);
    const out = parseReviewEvents('{"events":[{"name":"林夏","type":"救命","dir":"me"},{"name":"林夏","type":"夸奖"},{"name":"林夏","type":"乱写"},{"name":"别人","type":"批评"}]}', { bondTypes: EVENT_TYPES, chars: ['林夏'] });
    assert.deepEqual(out.bond, [{ type: '救命', target: '林夏', who: '林夏', dir: 'me' }]);
    assert.deepEqual(out.review, [{ type: '夸奖', name: '林夏', dir: 'ta' }]);
});

test('合成刷新与成就授予；初体验摘下标记', () => {
    const cat = { traits: tr({ 林夏: ['犬系', '黏人', '爱撒娇'] }), counters: {} };
    const s = world({ 林夏: mk() });
    const r = refreshCombos(cat, s, '林夏', { catalog: { traits: {} }, state: s });
    assert.ok(r.catalog.traits.林夏['combo:大型犬']);
    assert.equal(r.notices[0].type, 'combo');
    const base = { traits: {}, counters: { sturdyDays: 7 } };
    const a = achievementPass(base, createStatsState(), { meta: {}, before: createStatsState() }, []);
    assert.ok(a.catalog.traits.主角.铁打的身体);
    assert.ok(a.catalog.traits.主角.强健);
    const first = floor(world({ 林夏: mk({ dims: { 好感: 30 } }) }), '[igs-stat:intimate|林夏|亲吻]', tr({ 林夏: ['初体验'] }), { present: ['林夏'] });
    assert.deepEqual(first.meta.flags.traitDrops, [{ name: '林夏', id: '初体验' }]);
});

test('检定骰：特质奖惩骰与「欠你人情」折成 edge，返回被用掉的人情对象', () => {
    const s = world({ 林夏: mk({ relStates: [{ id: '欠你人情', dir: 'ta' }] }) });
    const cat = traitCatalogOf(tr({ 主角: ['话痨'] }), true);
    const r = traitEdgeOf(s, cat, { actor: '主角', skill: '话术', toward: '林夏', social: true, present: ['林夏'] });
    assert.equal(r.edge, 2);
    assert.equal(r.favorFrom, '林夏');
});

test('全局图鉴：挂上特质与合成时点亮并记首次，重复不覆盖', () => {
    const mem = {};
    const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
    const store = createTraitCodexStore(() => storage);
    const cat = { traits: tr({ 林夏: ['犬系', '黏人', '爱撒娇'] }), counters: {} };
    const s = world({ 林夏: mk() });
    const withCombo = refreshCombos(cat, s, '林夏').catalog;
    const next = lightCodex(store.get(), withCombo, s, { cardName: '测试卡', nsfwOn: false });
    store.set(next);
    assert.equal(store.get().traits.犬系.card, '测试卡');
    assert.ok(store.get().combos.大型犬);
    assert.equal(lightCodex(store.get(), withCombo, s, { cardName: '别的卡' }), null);
    assert.ok(JSON.parse(mem['igs-trait-codex-v1']).traits.犬系);
});
