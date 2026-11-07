// 特质接线：combo 键、环境读取、已故 / 长生 / 附身、ABO 演出标签、复核事件、成就与合成、检定骰、图鉴点亮。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay, settleSkip } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { applyTraitChange, getTraitByName, hasTrait, traitCatalogOf } from '../src/scene/stats/stat-traits.js';
import { traitEnvOf } from '../src/scene/stats/stat-trait-env.js';
import { luckyReroll, traitEdgeOf } from '../src/scene/stats/stat-trait-dice.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { achievementPass, traitNoticeText, createTraitCodexStore, lightCodex, refreshCombos } from '../src/core/stats-trait-runtime.js';
import { buildReviewPrompt, parseReviewEvents, reviewMemoryOf, reviewMemoryWrite } from '../src/core/trait-review.js';
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
    assert.equal(env.words, undefined);
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

const heroBase = (bars = {}, clock = {}) => { const s = createStatsState(); return { ...s, clock: { ...s.clock, ...clock }, protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, ...bars } } }; };
const sureCheck = (success) => ({ actor: '主角', skill: '话术', success, tier: success ? '普通成功' : '失败' });

test('贵人相助：失败且当天未用则重掷并记「贵人相助·重掷」；用过不再重掷；日结算清标记', () => {
    const cat = traitCatalogOf(tr({ 主角: ['贵人相助'] }), true);
    const fail = sureCheck(false);
    const again = luckyReroll(heroBase(), cat, fail, () => ({ ...sureCheck(true), notes: [] }));
    assert.equal(again.success, true);
    assert.equal(again.reroll, '贵人相助·重掷');
    assert.ok(again.notes.includes('贵人相助·重掷'));
    assert.equal(luckyReroll(heroBase({}, { luckyUsed: true }), cat, fail, () => sureCheck(true)), fail);
    assert.equal(luckyReroll(heroBase(), cat, sureCheck(true), () => sureCheck(false)).success, true);
    const r = floor(heroBase(), '平静', tr({ 主角: ['贵人相助'] }), { check: again });
    assert.equal(r.state.clock.luckyUsed, true);
    const day = settleDay({ ...r.state, clock: { ...r.state.clock, luckyUsed: true } }, { random: high, rev: 2, traits: {}, nsfw: true });
    assert.equal(day.clock.luckyUsed, false);
});

test('赌徒：成功收入翻倍、失败花费翻倍；当天无检定则日结算压力小升', () => {
    const t = tr({ 主角: ['赌徒'] });
    const win = floor(heroBase({ money: 0 }), '[igs-stat:money|收入|普通]', t, { check: sureCheck(true) });
    assert.equal(win.state.protagonist.bars.money, 200);
    const lose = floor(heroBase({ money: 500 }), '[igs-stat:money|花费|普通]', t, { check: sureCheck(false) });
    assert.equal(lose.state.protagonist.bars.money, 300);
    assert.equal(win.state.clock.checkDay, win.state.clock.day);
    const idle = settleDay(heroBase({ stress: 50 }, { day: 3, checkDay: 1 }), { random: high, rev: 2, traits: t, nsfw: true });
    const busy = settleDay(heroBase({ stress: 50 }, { day: 3, checkDay: 3 }), { random: high, rev: 2, traits: t, nsfw: true });
    assert.equal(idle.protagonist.bars.stress - busy.protagonist.bars.stress, 3);
});

test('拼命三郎：体力扣到 0 不力竭，记透支日，次日只恢复到 70，再过一天回满', () => {
    const t = tr({ 主角: ['拼命三郎'] });
    const r = floor(heroBase({ stamina: 10 }), '[igs-stat:stamina|重]', t);
    assert.equal(r.meta.flags.forcedRest, undefined);
    assert.equal(r.state.clock.overdrawDay, r.state.clock.day);
    const d1 = settleDay(r.state, { random: high, rev: 2, traits: t, nsfw: true });
    assert.equal(d1.protagonist.bars.stamina, 70);
    assert.equal(settleDay(d1, { random: high, rev: 2, traits: t, nsfw: true }).protagonist.bars.stamina, 100);
    assert.equal(floor(heroBase({ stamina: 10 }), '[igs-stat:stamina|重]', {}).meta.flags.forcedRest, true);
});

test('勤奋：成长检定多掷一次取好', () => {
    const skills = { 话术: { value: 50, marked: true } };
    const seq = (values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };
    const run = (traits, random) => { const s = heroBase(); return settleDay({ ...s, protagonist: { ...s.protagonist, skills } }, { random, rev: 2, traits, nsfw: true }).protagonist.skills.话术.value; };
    assert.equal(run({}, seq([0.1, 0.1, 0.1])), 50);
    assert.ok(run(tr({ 主角: ['勤奋'] }), seq([0.1, 0.99, 0.5, 0.5])) > 50);
});

test('自愈 / 伤口难愈：伤势账存活天数减半 / 加倍', () => {
    const hurts = [{ day: 1, dim: '信任', amount: 3 }];
    const run = (name, day) => settleDay({ ...world({ 林夏: mk({ recentHurts: hurts }) }), clock: { ...createStatsState().clock, day: day - 1 } }, { random: high, rev: 2, traits: tr({ 林夏: name ? [name] : [] }), nsfw: true }).characters.林夏.recentHurts;
    assert.equal(run('自愈', 6), undefined);
    assert.equal(run(null, 6).length, 1);
    assert.equal(run(null, 10), undefined);
    assert.equal(run('伤口难愈', 10).length, 1);
});

test('社牛：起始关系「陌生」按「熟人」计', () => {
    const r = floor(createStatsState(), '[igs-stat:start|小雪|陌生]', tr({ 小雪: ['社牛'] }));
    assert.equal(r.state.characters.小雪.dims.好感, 15);
    assert.equal(floor(createStatsState(), '[igs-stat:start|小雪|陌生]', {}).state.characters.小雪.dims.好感, 0);
});

test('万事通：检定技能值不低于 30；了解上升 ×1.5', () => {
    const cat = traitCatalogOf(tr({ 主角: ['万事通'] }), true);
    assert.equal(traitEdgeOf(world({}), cat, { actor: '主角', skill: '话术' }).floor, 30);
    assert.equal(traitEdgeOf(world({}), traitCatalogOf({}, true), { actor: '主角', skill: '话术' }).floor, 0);
    const plain = floor(world({ 林夏: mk() }), '[igs-stat:know|林夏|上升]', {}).state.characters.林夏.dims.了解;
    const boosted = floor(world({ 林夏: mk() }), '[igs-stat:know|林夏|上升]', tr({ 主角: ['万事通'] })).state.characters.林夏.dims.了解;
    assert.ok(boosted > plain);
});

test('评定节流记录落盘到 counters：刚变动与每日一次跨重载保留，次日清每日记录', () => {
    const ids = ['fragile', 'tough'];
    const applied = [{ charName: '林夏', id: 'fragile', on: true }];
    const counters = reviewMemoryWrite({ reviewFloor: 3 }, applied, ids, 5);
    assert.equal(counters.reviewFloor, 3);
    const memory = reviewMemoryOf(counters, [{ charName: '林夏', id: 'fragile', on: false }], ['林夏'], ids, 5);
    assert.deepEqual(memory.recent.林夏, [{ id: 'fragile', on: true }]);
    assert.equal(memory.changeLog['林夏|fragile'], 5);
    assert.equal(reviewMemoryOf(reviewMemoryWrite(counters, [], ids, 6), [{ charName: '林夏', id: 'fragile', on: false }], ['林夏'], ids, 6).changeLog['林夏|fragile'], undefined);
    assert.equal(sanitizeCatalog({ counters }).counters[Object.keys(counters).find((k) => k.startsWith('rr:'))], counters[Object.keys(counters).find((k) => k.startsWith('rr:'))]);
});

test('初体验摘下：摘除成功并产生「失去」通知文案', () => {
    const cat = { traits: tr({ 林夏: ['初体验'] }) };
    const r = applyTraitChange(world({ 林夏: mk() }), cat, '林夏', '初体验', false, 'story');
    assert.equal(r.notices[0].type, 'lose');
    assert.match(traitNoticeText(r.notices[0]), /失去特质「初体验」/);
    assert.equal(hasTrait(world({ 林夏: mk() }), traitCatalogOf(r.catalog.traits, true), '林夏', '初体验'), false);
});
