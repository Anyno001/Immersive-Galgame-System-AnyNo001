// 特质规则·B 批合成专属效果：每个新接的合成至少一例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName } from '../src/scene/stats/stat-traits.js';

const high = () => 0.99;
const low = () => 0.01; // d100 掷出 100：关键事件大失败
const mid = () => 0.3; // d100 掷出 33：成长检定（当前值 40）失败；卷王一半机会通过，涨幅 1d10=4
const resolve = (n) => n;
const idOf = (n) => (n.startsWith('combo:') ? n : getTraitByName(n).id);
const on = (n) => (n.startsWith('combo:') ? { on: true, src: 'manual', parts: ['犬系', '黏人'] } : { on: true, src: 'manual' });
const mk = (map) => Object.fromEntries(Object.entries(map).map(([who, names]) => [who, Object.fromEntries(names.map((n) => [idOf(n), on(n)]))]));
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const mkChar = (patch = {}, bars = {}) => {
    const base = createCharacter(1, { nsfw: true });
    return { ...base, ...patch, dims: { ...base.dims, ...(patch.dims || {}) }, bars: { ...base.bars, ...bars } };
};
const world = (chars = {}, hero = {}, clock = {}, skills = null) => {
    const s = createStatsState();
    return { ...s, characters: chars, protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, ...hero }, ...(skills ? { skills } : {}) }, clock: { ...s.clock, ...clock } };
};
const d = (r, who = '林夏') => r.state.characters[who].dims;
const HERO = (...combos) => mk({ 主角: combos.map((c) => `combo:${c}`) });

test('天选之子：每天第一次关键事件大失败改为普通失败', () => {
    const w = world({ 林夏: mkChar({ dims: { 好感: 25 } }) });
    const text = '[igs-stat:event|林夏|约会]';
    const o = { present: ['林夏'], random: low };
    const plain = floor(w, text, {}, o);
    assert.equal(d(plain).好感, 22, '对照：大失败好感 -3');
    assert.equal(d(plain).芥蒂, 2);
    const lucky = floor(w, text, HERO('天选之子'), o);
    assert.equal(d(lucky).好感, 25);
    assert.equal(d(lucky).芥蒂, 0);
    assert.ok(!lucky.meta.flags.keyFumble, '不再记大失败强制事项');
    const again = floor(lucky.state, text, HERO('天选之子'), o);
    assert.equal(d(again).好感, 22, '同日第二次照常大失败');
});

test('笨蛋美人（主角）：检定失败那一楼在场角色好感小升', () => {
    const w = world({ 林夏: mkChar() });
    const opts = { present: ['林夏'], storyChecks: [{ skill: '话术', success: false }] };
    const base = d(floor(w, '', {}, opts)).好感;
    assert.equal(d(floor(w, '', HERO('笨蛋美人'), opts)).好感, base + 2);
    assert.equal(d(floor(w, '', HERO('笨蛋美人'), { ...opts, storyChecks: [{ skill: '话术', success: true }] })).好感, base, '成功不触发');
});

test('万人迷（主角）：初次见面那一楼对方好感小升', () => {
    const text = '[igs-stat:favor|林夏|喜悦|小]';
    const base = d(floor(world(), text)).好感;
    assert.equal(d(floor(world(), text, HERO('万人迷'))).好感, base + 2);
    const known = world({ 林夏: mkChar() });
    assert.equal(d(floor(known, text, HERO('万人迷'))).好感, d(floor(known, text)).好感, '已建档不再加');
});

test('万人迷（主角）：三人以上心动时吃醋芥蒂减半', () => {
    const fans = () => world({ 甲: mkChar({ dims: { 好感: 60 } }), 乙: mkChar({ dims: { 好感: 60 } }), 丙: mkChar({ dims: { 好感: 60 } }) });
    const text = '[igs-stat:favor|甲|吃醋|大]';
    const opts = { present: ['甲', '乙', '丙'] };
    const plain = d(floor(fans(), text, {}, opts), '甲').芥蒂;
    assert.ok(plain > 1, `对照吃醋应加芥蒂：${plain}`);
    assert.equal(d(floor(fans(), text, HERO('万人迷'), opts), '甲').芥蒂, plain - Math.floor(plain / 2));
});

test('天才（NPC）：剧情成长不受每日次数限制', () => {
    const text = '[igs-stat:grow|林夏|话术]';
    const w = world({ 林夏: mkChar() });
    const plain1 = floor(w, text);
    const plain2 = floor(plain1.state, text);
    assert.ok(plain2.meta.diagnostics.some((x) => x.code === 'stat-grow-daily-limit'), '对照：第二次被拦');
    const tr = mk({ 林夏: ['combo:天才'] });
    const g1 = floor(w, text, tr);
    const g2 = floor(g1.state, text, tr);
    assert.ok(!g2.meta.diagnostics.some((x) => x.code === 'stat-grow-daily-limit'));
    assert.ok(g2.changes.some((c) => c.target === '林夏' && c.note === '天才' && c.to > c.from));
});

test('卷王（主角）：成长检定失败仍有一半机会成长', () => {
    const skills = { 话术: { value: 40, marked: true } };
    const w = world({}, {}, {}, skills);
    const tr = HERO('卷王');
    const r = floor(w, '', tr, { random: mid });
    assert.ok(r.state.protagonist.grindRolls && r.state.protagonist.grindRolls.话术 > 0, '打勾技能已预掷');
    const plain = settleDay(floor(w, '', {}, { random: mid }).state, { random: mid, rev: 2, traits: {}, nsfw: true, present: [] });
    assert.equal(plain.protagonist.skills.话术.value, 40, '对照：失败不成长');
    const grind = settleDay(r.state, { random: mid, rev: 2, traits: tr, nsfw: true, present: [] });
    assert.equal(grind.protagonist.skills.话术.value, 44);
    assert.equal(grind.protagonist.grindRolls, undefined, '用完即清');
});

test('吸血鬼：满三天未吸血每天压力 +3；首次过天只记日期', () => {
    const tr = mk({ 林夏: ['吸血鬼'] });
    const day = (clock) => settleDay(world({ 林夏: mkChar({}, { stress: 40 }) }, {}, clock), { random: high, rev: 2, traits: tr, nsfw: true, present: ['林夏'] });
    const base = settleDay(world({ 林夏: mkChar({}, { stress: 40 }) }, {}, { day: 5, biteDays: { 林夏: 1 } }), { random: high, rev: 2, traits: {}, nsfw: true, present: ['林夏'] }).characters.林夏.bars.stress;
    assert.equal(day({ day: 5, biteDays: { 林夏: 1 } }).characters.林夏.bars.stress, base + 3);
    assert.equal(day({ day: 5, biteDays: { 林夏: 4 } }).characters.林夏.bars.stress, base, '不满三天不扣');
    const first = day({ day: 5 });
    assert.equal(first.characters.林夏.bars.stress, base);
    assert.equal(first.clock.biteDays.林夏, 6);
});

test('吸血鬼：吸血那一楼记下日期', () => {
    const r = floor(world({ 林夏: mkChar() }, {}, { day: 7 }), '[igs-stat:event|林夏|吸血]', mk({ 林夏: ['吸血鬼'] }), { present: ['林夏'] });
    assert.equal(r.state.clock.biteDays.林夏, 7);
});

test('人鱼：离水满三天每天压力 +3；深海之心主角在场时取消', () => {
    const run = (names, present) => settleDay(world({ 林夏: mkChar({}, { stress: 40 }) }, {}, { day: 5, waterDays: { 林夏: 1 } }), { random: high, rev: 2, traits: mk({ 林夏: names }), nsfw: true, present }).characters.林夏.bars.stress;
    const base = run([], ['林夏']);
    assert.equal(run(['人鱼'], ['林夏']), base + 3);
    assert.equal(run(['人鱼', 'combo:深海之心'], ['林夏']), base, '深海之心在场取消');
});

test('永夜伴侣：满三天未吸血也不加压力', () => {
    const run = (names) => settleDay(world({ 林夏: mkChar({}, { stress: 40 }) }, {}, { day: 5, biteDays: { 林夏: 1 } }), { random: high, rev: 2, traits: mk({ 林夏: names }), nsfw: true, present: ['林夏'] }).characters.林夏.bars.stress;
    assert.equal(run(['吸血鬼']) - run(['吸血鬼', 'combo:永夜伴侣']), 3);
});

test('小笨蛋：主角对其发起的检定失败时好感上升，成功或对象是别人时不触发', () => {
    const w = world({ 林夏: mkChar({ dims: { 好感: 30 } }) });
    const tr = mk({ 林夏: ['小笨蛋'] });
    const run = (check) => d(floor(w, '', tr, { present: ['林夏'], storyChecks: [check] })).好感;
    const base = run({ skill: '话术', success: true, against: '林夏' });
    assert.ok(run({ skill: '话术', success: false, against: '林夏' }) > base);
    assert.equal(run({ skill: '话术', success: false, against: '周舟' }), base);
});
