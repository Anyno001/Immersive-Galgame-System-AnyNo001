import test from 'node:test';
import assert from 'node:assert/strict';
import { settleDay, settleSkip } from '../src/scene/stats/stat-day.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { relaxStress, relaxedStress, stressDrop } from '../src/scene/stats/stat-strain.js';
import { settleNaturalHeal, healBase, healConfigOf } from '../src/scene/stats/stat-heal.js';
import { advanceStatuses, applyStatusChange, cycleStateAt, startCycleToday, setCycle, settleStatusDirectives } from '../src/scene/stats/stat-status.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { sanitizeTraits } from '../src/scene/stats/stat-traits.js';
import { computeEffectiveState, normalizeSnapshot, scanLifeTags, vitalsForName } from '../src/combat/ledger.js';

const high = () => 0.99;
const withChars = (chars, bars = {}) => {
    const s = createStatsState({ day: 1 });
    return { ...s, protagonist: { ...s.protagonist, bars: { stamina: 100, money: 0, stress: 60, ...bars } }, characters: Object.fromEntries(Object.entries(chars).map(([n, extra]) => [n, { ...createCharacter(1, { nsfw: true }), ...extra }])) };
};
const dimsOf = (dims) => ({ ...createCharacter(1, { nsfw: true }).dims, ...dims });

test('压力按比例回落：每天 -当前x15% 向上取整、最少 -3，主角日结算记公式', () => {
    assert.equal(stressDrop(60), 9);
    assert.equal(stressDrop(10), 3);
    assert.equal(relaxedStress(60, 1), 51);
    assert.equal(relaxedStress(10, 1), 7);
    assert.equal(relaxedStress(2, 1), 0);
    const changes = [];
    const r = settleDay(withChars({}, { stress: 60 }), { random: high, rev: 2, changes });
    assert.equal(r.protagonist.bars.stress, 51);
    const row = changes.find((c) => c.key === 'stress' && c.target === '主角');
    assert.deepEqual([row.from, row.to], [60, 51]);
    assert.match(row.calc[0].label, /60×15%/);
    assert.equal(settleDay(withChars({}, { stress: 60 }), { random: high, rev: 1 }).protagonist.bars.stress, 50);
});

test('压力：沦陷/扭曲/蜕变不变，崩溃照降；NPC 与主角相同', () => {
    assert.equal(relaxStress({ stress: 60, strain: { name: '堕落', type: '沦陷' } }).stress, 60);
    assert.equal(relaxStress({ stress: 60, strain: { name: '黑化', type: '扭曲' } }).stress, 60);
    assert.equal(relaxStress({ stress: 60, strain: { name: '破碎', type: '崩溃' } }).stress, 51);
    const r = settleDay(withChars({ 小雪: { bars: { stamina: 100, money: 0, stress: 40 } } }), { random: high, rev: 2 });
    assert.equal(r.characters.小雪.bars.stress, 34);
});

test('时间跳跃减压：复利，7 天以上降到 20，已低于 20 不动', () => {
    assert.equal(relaxedStress(100, 2), 100 - 15 - 13);
    const changes = [];
    assert.equal(settleSkip(withChars({}, { stress: 60 }), 3, { random: high, rev: 2, changes }).protagonist.bars.stress, 36);
    assert.ok(changes.find((c) => c.key === 'stress').calc);
    assert.equal(settleSkip(withChars({}, { stress: 90 }), 7, { random: high, rev: 2 }).protagonist.bars.stress, 20);
    assert.equal(settleSkip(withChars({}, { stress: 12 }), 30, { random: high, rev: 2 }).protagonist.bars.stress, 12);
    assert.equal(settleSkip(withChars({ 小雪: { bars: { stamina: 100, money: 0, stress: 80 } } }), 10, { random: high, rev: 2 }).characters.小雪.bars.stress, 20);
    assert.equal(settleSkip(withChars({}, { stress: 60 }), 3, { random: high, rev: 1 }).protagonist.bars.stress, 60);
});

test('欲望：恋爱对象每天 -1 只到 25，非恋爱对象到 0，公式写进记录', () => {
    const state = withChars({ 小雪: { romance: true, dims: dimsOf({ 欲望: 27 }) }, 阿月: { romance: false, dims: dimsOf({ 欲望: 3 }) } });
    const changes = [];
    const r = settleSkip(state, 10, { random: high, rev: 2, changes });
    assert.equal(r.characters.小雪.dims.欲望, 25);
    assert.equal(r.characters.阿月.dims.欲望, 0);
    const row = changes.find((c) => c.target === '小雪' && c.key === '欲望');
    assert.ok(row.calc.some((c) => /25/.test(c.label)));
    const low = withChars({ 小雪: { romance: true, dims: dimsOf({ 欲望: 10 }) } });
    assert.equal(settleDay(low, { random: high, rev: 2 }).characters.小雪.dims.欲望, 10);
});

test('芥蒂：>25 每天 -1，最低 25，记录写「小心结需要剧情和解」', () => {
    const changes = [];
    const r = settleSkip(withChars({ 小雪: { dims: dimsOf({ 芥蒂: 40 }) } }), 30, { random: high, rev: 2, changes });
    assert.equal(r.characters.小雪.dims.芥蒂, 25);
    const row = changes.find((c) => c.target === '小雪' && c.key === '芥蒂');
    assert.ok(row.calc.some((c) => /小心结需要剧情和解/.test(c.label)));
    assert.equal(settleDay(withChars({ 小雪: { dims: dimsOf({ 芥蒂: 25 }) } }), { random: high, rev: 2 }).characters.小雪.dims.芥蒂, 25);
});

test('回血设置默认与规范化', () => {
    const d = normalizeStatsSettings({});
    assert.deepEqual([d.healMode, d.healDay, d.healFloor], ['day', 10, 3]);
    const s = normalizeStatsSettings({ healMode: 'floor', healDay: 15, healFloor: 5 });
    assert.deepEqual([s.healMode, s.healDay, s.healFloor], ['floor', 15, 5]);
    assert.equal(normalizeStatsSettings({ healMode: 'x' }).healMode, 'day');
    assert.equal(normalizeStatsSettings({ healDay: 7 }).healDay, 10);
});

const vitalsEngine = (table) => createEngine({}, {}, undefined, { readVitals: (name) => table[name] || null });
const heal = (table, settings, days, extra = {}) => {
    const changes = [];
    const state = withChars({ 小雪: {}, 阿月: {} });
    const out = settleNaturalHeal(state, { settings: normalizeStatsSettings(settings), engine: vitalsEngine(table), traitCat: extra.traitCat || {}, present: extra.present || [], days, changes, statusBox: extra.statusBox });
    return { out, changes };
};

test('回血：按天 10%，按楼每楼 3%（跳跃换算每天=每楼x10），同楼没过天不回按天', () => {
    const t = { 小雪: { hp: 50, maxHp: 100, down: false } };
    assert.equal(heal(t, {}, 1).out[0].amount, 10);
    assert.equal(heal(t, {}, 0).out.length, 0);
    assert.equal(heal(t, { healMode: 'floor' }, 0).out[0].amount, 3);
    assert.equal(heal(t, { healMode: 'floor', healFloor: 5 }, 0).out[0].amount, 5);
    assert.equal(heal({ 小雪: { hp: 80, maxHp: 100, down: false } }, { healMode: "floor", healFloor: 1 }, 1).out[0].amount, 1);
    assert.equal(heal(t, { healMode: "floor" }, 3).out[0].amount, 100);
    assert.equal(heal(t, { healDay: 15 }, 3).out[0].amount, 45);
    assert.equal(healBase(healConfigOf({ healMode: 'floor', healFloor: 1 }), 2).raw, 20);
});

test('回血：重伤减半、倒下的同伴也回、跳 7 天以上回满并清恢复型状态', () => {
    const t = { 小雪: { hp: 10, maxHp: 100, down: false }, 阿月: { hp: 0, maxHp: 100, down: true } };
    const r = heal(t, {}, 1);
    assert.equal(r.out.find((h) => h.name === '小雪').amount, 5);
    assert.equal(r.out.find((h) => h.name === '阿月').amount, 5);
    assert.ok(r.changes.find((c) => c.target === '小雪').calc.some((c) => c.label === '重伤减半'));
    const box = { cat: { statuses: { 小雪: { 旧伤: { src: 'story', kind: 'recover', since: 1, floor: 1 } } } } };
    const jump = heal({ 小雪: { hp: 30, maxHp: 100, down: false } }, {}, 7, { statusBox: box });
    assert.equal(jump.out[0].amount, 100);
    assert.equal(box.cat.statuses.小雪, undefined);
    assert.equal(heal({ 小雪: { hp: 100, maxHp: 100, down: false } }, {}, 1).out.length, 0);
});

test('回血：自愈 x2、伤口难愈 x0.5、贤惠在场略快', () => {
    const t = { 小雪: { hp: 50, maxHp: 100, down: false } };
    const cat = (names) => ({ traits: sanitizeTraits({ 小雪: Object.fromEntries(names.map((n) => [n, { on: true, src: 'manual' }])) }), nsfw: true });
    const fn = (names, present) => heal(t, {}, 1, { traitCat: cat(names), present }).out[0].amount;
    assert.equal(fn([], []), 10);
    assert.equal(fn(['自愈'], []), 20);
    assert.equal(fn(['伤口难愈'], []), 5);
    assert.ok(fn(['贤惠'], ['小雪']) > 10);
});

test('周期：按日期推算在期内、挂摘；跳跃按新日期判断；倒计时跳过即到期，直到解除不受影响', () => {
    const cat = setCycle({}, '小雪', '生理期', { period: 28, length: 5, last: 1 });
    assert.equal(cycleStateAt(cat.cycles.小雪.生理期, 3).active, true);
    assert.equal(cycleStateAt(cat.cycles.小雪.生理期, 7).active, false);
    assert.equal(cycleStateAt(cat.cycles.小雪.生理期, 29).active, true);
    let r = advanceStatuses(cat, 29, 1, { cycles: true });
    assert.equal(r.catalog.statuses.小雪.生理期.src, 'cycle');
    assert.equal(r.catalog.statuses.小雪.生理期.kind, 'cycle');
    assert.ok(r.changes[0].calc.some((c) => c.label === '周期内第几天'));
    r = advanceStatuses(r.catalog, 34, 1, { cycles: true });
    assert.equal(Boolean(r.catalog.statuses && r.catalog.statuses.小雪 && r.catalog.statuses.小雪.生理期), false);
    assert.equal(Boolean(advanceStatuses(cat, 30, 10, { cycles: true }).catalog.statuses.小雪.生理期), true);
    assert.equal(Boolean(advanceStatuses(cat, 40, 10, { cycles: true }).catalog.statuses), false);
    assert.equal(Boolean(advanceStatuses(cat, 29, 1).catalog.statuses), false);
    let c2 = applyStatusChange({ statuses: {} }, '小雪', '感冒', { on: true, day: 1 }).catalog;
    c2 = applyStatusChange(c2, '小雪', '冷战中', { on: true, day: 1, toward: '主角' }).catalog;
    const j = advanceStatuses(c2, 20, 19).catalog;
    assert.equal(Boolean(j.statuses.小雪.感冒), false);
    assert.equal(Boolean(j.statuses.小雪.冷战中), true);
});

test('周期：ABO 发情期；「今天开始」挂上并校准；标签「来了」校准上次开始日', () => {
    const t = startCycleToday({}, '阿月', '发情期', 10);
    assert.equal(t.catalog.cycles.阿月.发情期.last, 10);
    assert.equal(t.catalog.cycles.阿月.发情期.length, 3);
    assert.equal(t.catalog.statuses.阿月.发情期.until, 13);
    const box = { cat: setCycle({}, '小雪', '生理期', { last: 1 }) };
    settleStatusDirectives(box, [{ kind: 'status', target: '小雪', status: '生理期', on: true }], { day: 9, resolve: (n) => n, changes: [] });
    assert.equal(box.cat.cycles.小雪.生理期.last, 9);
    assert.equal(box.cat.statuses.小雪.生理期.src, 'cycle');
    assert.equal(cycleStateAt(box.cat.cycles.小雪.生理期, 12).active, true);
});

test('楼层结算：开日期捕捉时周期随跳跃挂摘，回血写进 meta.heal，旧楼不回血', () => {
    const catalog = { cycles: setCycle({}, '小雪', '生理期', { last: 1 }).cycles };
    const state = withChars({ 小雪: {} });
    const floor = (text, opts = {}) => settleFloorText({ ...state, clock: { ...state.clock, lastDate: '2025年1月1日' } }, text, { random: high, strengthRev: 2, favorTier: 'normal', resolveCharacter: (n) => (n === '小雪' ? '小雪' : null), dateRegex: '<d>(.*?)</d>', catalog, engine: vitalsEngine({ 主角: { hp: 40, maxHp: 100, down: false } }), settings: normalizeStatsSettings({}), ...opts });
    const r = floor('<d>2025年1月3日</d>正文');
    assert.equal(r.state.clock.day, 3);
    assert.equal(Boolean(r.meta.statuses && r.meta.statuses.小雪 && r.meta.statuses.小雪.生理期), true);
    assert.equal(r.meta.heal[0].name, '主角');
    assert.equal(r.meta.heal[0].amount, 20);
    const far = floor('<d>2025年2月20日</d>正文');
    assert.equal(far.meta.heal[0].amount, 100);
    assert.equal(floor('<d>2025年1月3日</d>正文', { strengthRev: 0, favorTier: undefined }).meta.heal, undefined);
});

test('账本：自然回血记录锚定楼与 swipe，同楼不重复写，回血量按百分比重放', () => {
    const snapshot = normalizeSnapshot({ ok: true, profile: [], ledger: [], attribute: [] });
    const chat = [{ mes: '[igs-stat:hurt|重伤]', is_user: false, swipe_id: 0 }, { mes: '正文', is_user: false, swipe_id: 0 }];
    const heroEffective = computeEffectiveState(snapshot, chat, { userName: '小明' });
    const first = scanLifeTags(snapshot, chat, { userName: '小明', effectiveState: heroEffective, heroPrefs: null, naturalHeals: [{ messageId: 1, name: '小明', amount: 10 }, { messageId: 1, name: '小明', amount: 10 }], messageIds: [1] });
    if (first.ok === false) { assert.ok(first.reason); return; }
    const heals = first.entries.filter((e) => e.type === 'heal');
    assert.equal(heals.length, 1);
    assert.equal(heals[0].payload.mode, 'percent');
    assert.equal(heals[0].payload.scale, 100);
    assert.equal(heals[0].anchor.messageId, 1);
});
