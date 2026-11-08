import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFavorTier } from '../src/scene/stats/stat-favor.js';
import { KEY_CRIT_BONUS, applyKeyEvent, keyGrade } from '../src/scene/stats/stat-favor-events.js';
import { favorHints, statsFxOf } from '../src/scene/stats/stat-fx.js';
import { mandatesFromFlags } from '../src/scene/stats/stat-prompt.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';

const high = () => 0.99;
const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);
const withFavor = (favor, patch = {}) => { const c = createCharacter(1); return { ...c, ...patch, dims: { ...c.dims, 好感: favor } }; };
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter, favorTier: 'vivid', strengthRev: 2, ...opts });
const labels = (change) => change.calc.map((r) => r.label);

test('鲜明档中档：公式含基础、阶段倍率、结果，且不被截', () => {
    const r = applyFavorTier(withFavor(30), { kind: 'favor', dim: '好感', value: '感动', strength: '中' }, { tier: 'vivid', random: high, floorRoom: 8, dailyMax: 12, rev: 1 });
    const c = r.change;
    assert.ok(labels(c).some((l) => l.startsWith('感动·中 基础')));
    assert.ok(labels(c).some((l) => l.startsWith('阶段倍率 明确喜欢')));
    assert.equal(c.calc.at(-1).label, '结果');
    assert.equal(c.calc.at(-1).value, c.to - c.from);
    assert.equal(c.capped, null);
});

test('心意槽：未满时好感不动，change 带 heartFrom/heartTo 与心意槽公式', () => {
    const r = applyFavorTier(withFavor(10), { kind: 'favor', dim: '好感', value: '开心', strength: '小' }, { tier: 'vivid', random: high, floorRoom: 8, dailyMax: 12, rev: 1 });
    assert.equal(r.change.to, r.change.from);
    assert.ok(r.change.heartTo > r.change.heartFrom);
    assert.ok(labels(r.change).some((l) => l === '心意槽'));
});

test('卡关口记 gate，日上限满记 daily，大档已用记 bigUsed', () => {
    const gate = applyFavorTier(withFavor(24), { kind: 'favor', dim: '好感', value: '感动', strength: '中' }, { tier: 'vivid', random: high, floorRoom: 20, dailyMax: 20, rev: 1 });
    assert.equal(gate.change.capped, 'gate');
    const full = applyFavorTier(withFavor(10, { daily: { day: 1, gained: { 好感: 15 } } }), { kind: 'favor', dim: '好感', value: '感动', strength: '中' }, { tier: 'vivid', random: high, floorRoom: 20, dailyMax: 20, rev: 1 });
    assert.equal(full.change.capped, 'daily');
    const big = applyFavorTier(withFavor(10, { daily: { day: 1, gained: {}, bigUsed: true } }), { kind: 'favor', dim: '好感', value: '感动', strength: '大' }, { tier: 'vivid', random: high, floorRoom: 20, dailyMax: 20, rev: 1 });
    assert.equal(big.change.capped, 'bigUsed');
});

test('结算写进 changes：带 calc 与 capped；零增量的截断也记录；favorHints 出飘字数据', () => {
    let state = createStatsState();
    state = { ...state, characters: { 小雪: withFavor(25) } };
    const r = floor(state, '[igs-stat:favor|小雪|感动|中]');
    const c = r.changes.find((x) => x.key === '好感');
    assert.ok(c && Array.isArray(c.calc) && c.calc.length >= 2);
    assert.equal(c.capped, 'gate');
    const hints = favorHints(r.changes);
    assert.ok(hints.some((h) => h.kind === 'gate' && h.text === '需要一次关键事件'));
});

test('同楼正负标签取较大者，被丢弃的写进 dropped 与 merged', () => {
    const r = floor(createStatsState(), '[igs-stat:favor|小雪|感动|中][igs-stat:favor|小雪|受伤|小]');
    const c = r.changes.find((x) => x.key === '好感');
    assert.ok(c);
    assert.ok(c.dropped && c.dropped.includes('好感'));
    assert.equal(c.capped, 'merged');
});

test('四档判定：检定 tier 与 success 决定四档', () => {
    assert.equal(keyGrade({ success: true, tier: '大成功' }), '大成功');
    assert.equal(keyGrade({ success: true, tier: '普通成功' }), '成功');
    assert.equal(keyGrade({ success: false, tier: '失败' }), '失败');
    assert.equal(keyGrade({ success: false, tier: '大失败' }), '大失败');
});

const rollOf = (tier, success) => () => ({ roll: 50, target: 50, tier, success });

test('大成功：解锁、好感额外 +3、心意槽充满', () => {
    const r = applyKeyEvent(withFavor(25), '约会', { roll: rollOf('大成功', true), grades: true, day: 3 });
    assert.equal(r.result.grade, '大成功');
    assert.equal(r.character.dims.好感, 25 + 1 + KEY_CRIT_BONUS);
    assert.equal(r.character.heart, 4);
    assert.deepEqual(r.character.unlocked, ['gate-25']);
});

test('成功：只解锁并升一点；不开 grades 时大成功也不加成', () => {
    const r = applyKeyEvent(withFavor(25), '约会', { roll: rollOf('普通成功', true), grades: true, day: 3 });
    assert.equal(r.character.dims.好感, 26);
    const plain = applyKeyEvent(withFavor(25), '约会', { roll: rollOf('大成功', true) });
    assert.equal(plain.character.dims.好感, 26);
});

test('失败：不解锁，两天内同关口第二次失败记为再试', () => {
    const a = applyKeyEvent(withFavor(25), '约会', { roll: rollOf('失败', false), grades: true, day: 3 });
    assert.equal(a.character.dims.好感, 25);
    assert.deepEqual(a.character.keyFail, { gate: 25, day: 3 });
    assert.equal(a.result.retry, false);
    const b = applyKeyEvent(a.character, '约会', { roll: rollOf('失败', false), grades: true, day: 5 });
    assert.equal(b.result.retry, true);
    const c = applyKeyEvent(a.character, '约会', { roll: rollOf('失败', false), grades: true, day: 9 });
    assert.equal(c.result.retry, false);
});

test('大失败：不解锁，好感 -3、芥蒂 +2', () => {
    const r = applyKeyEvent(withFavor(25), '约会', { roll: rollOf('大失败', false), grades: true, day: 3 });
    assert.equal(r.character.dims.好感, 22);
    assert.equal(r.character.dims.芥蒂, 2);
    assert.deepEqual(r.character.unlocked, []);
});

test('结算里大失败：扫随机源找到大失败，好感与芥蒂各一条记录并置 keyFumble', () => {
    const state = { ...createStatsState(), characters: { 小雪: withFavor(25) } };
    let found = null;
    for (let i = 0; i < 400 && !found; i += 1) {
        const random = () => ((i * 37 + 11) % 100) / 100;
        const r = settleFloorText(state, '[igs-stat:event|小雪|约会]', { random, resolveCharacter, favorTier: 'vivid', strengthRev: 2 });
        if (r.meta.flags.keyFumble) found = r;
    }
    assert.ok(found, '应能掷出大失败');
    assert.equal(found.meta.flags.keyFumble.event, '约会');
    assert.ok(found.changes.some((c) => c.key === '好感' && c.to === 22 && c.calc));
    assert.ok(found.changes.some((c) => c.key === '芥蒂' && c.to === 2));
});

test('mandatesFromFlags：大失败一句客观要求，没有标记时不出现', () => {
    assert.deepEqual(mandatesFromFlags({ keyFumble: { target: '小雪', event: '约会' } }), ['上一楼的约会出了岔子，本楼正文需体现']);
    assert.deepEqual(mandatesFromFlags({}), []);
});

test('statsFxOf：成功带 grade，hints 随变动出现', () => {
    const fx = statsFxOf({ changes: [{ source: 'tag', target: '小雪', key: '好感', from: 10, to: 10, heartFrom: 1, heartTo: 3 }], meta: { events: [{ target: '小雪', event: '约会', gate: 25, success: true, grade: '大成功' }] } });
    assert.equal(fx.hints[0].text, '♡ +2');
    assert.equal(fx.keys[0].grade, '大成功');
});
