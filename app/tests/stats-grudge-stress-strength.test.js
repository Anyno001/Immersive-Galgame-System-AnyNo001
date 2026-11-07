import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBarDirective } from '../src/scene/stats/stat-bars.js';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { FAVOR_DIRECTIONS, FAVOR_WORDS, favorFromMoodGroup, resolveFavorWord } from '../src/scene/stats/stat-vocab.js';
import { capMajorStrength, settleFloorText } from '../src/scene/stats/stat-settle.js';
import { buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';

const high = () => 0.99;
const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);
const R = { favorTier: 'normal', strengthRev: 1 };
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter, ...R, ...opts });
const withDims = (dims, extra = {}) => ({ ...createStatsState(), characters: { 小雪: { ...createCharacter(1), dims: { ...createCharacter(1).dims, ...dims }, ...extra } } });
const dim = (state, key) => state.characters.小雪.dims[key];
const favor = (text, opts, from = 0) => dim(floor(withDims({ 好感: from }), text, opts).state, '好感') - from;

// ---------- 芥蒂 ----------
test('芥蒂上升四档：不掷骰、不设单楼与每日上限，省略按小', () => {
    for (const tier of ['vivid', 'normal', 'hard']) {
        const got = ['小', '中', '大', '重大'].map((lv) => dim(floor(createStatsState(), `[igs-stat:grudge|小雪|上升|${lv}]`, { favorTier: tier }).state, '芥蒂'));
        assert.deepEqual(got, [2, 5, 10, 20]);
    }
    assert.equal(dim(floor(createStatsState(), '[igs-stat:grudge|小雪|上升]').state, '芥蒂'), 2);
    assert.equal(dim(floor(withDims({ 芥蒂: 70 }), '[igs-stat:grudge|小雪|上升|大]', { random: () => 0.0 }).state, '芥蒂'), 80);
    let state = createStatsState();
    for (let i = 0; i < 4; i += 1) state = floor(state, '[igs-stat:grudge|小雪|上升|大]').state;
    assert.equal(dim(state, '芥蒂'), 40);
});

test('芥蒂下降：每日最多 -10，重大无 event 降为大，有 event 保留', () => {
    const s0 = withDims({ 芥蒂: 60 });
    assert.equal(dim(floor(s0, '[igs-stat:grudge|小雪|下降|中]').state, '芥蒂'), 55);
    let state = s0;
    state = floor(state, '[igs-stat:grudge|小雪|下降|大]').state;
    state = floor(state, '[igs-stat:grudge|小雪|下降|大]').state;
    assert.equal(dim(state, '芥蒂'), 50);
    assert.equal(dim(floor(state, '[igs-stat:grudge|小雪|下降|小]').state, '芥蒂'), 50);
    assert.equal(dim(floor(s0, '[igs-stat:grudge|小雪|下降|重大]').state, '芥蒂'), 50);
    const evented = floor(withDims({ 芥蒂: 60 }), '[igs-stat:event|小雪|共患难][igs-stat:grudge|小雪|下降|重大]');
    assert.equal(dim(evented.state, '芥蒂'), 50);
    const strengthOf = (list) => capMajorStrength(list, 'normal', 1)[0].strength;
    const g = { kind: 'dim', target: '小雪', dim: '芥蒂', value: '下降', strength: '重大' };
    assert.equal(strengthOf([g]), '大');
    assert.equal(strengthOf([g, { kind: 'event', target: '小雪', value: '共患难' }]), '重大');
    assert.equal(capMajorStrength([{ ...g, value: '上升' }], 'normal', 1)[0].strength, '重大');
});

test('芥蒂：旧楼（无 strengthRev）仍固定 ±2 走 applyDim，强度字段被忽略', () => {
    const r = floor(createStatsState(), '[igs-stat:grudge|小雪|上升|大]', { strengthRev: 0 });
    assert.equal(dim(r.state, '芥蒂'), 2);
    assert.equal(r.meta.strengthRev, undefined);
    assert.equal(parseStatDirectives('[igs-stat:grudge|小雪|上升|大]').directives[0].strength, undefined);
});

test('芥蒂强度写成数字整条丢弃', () => {
    assert.equal(parseStatDirectives('[igs-stat:grudge|小雪|上升|10]', { rev: 1 }).directives.length, 0);
});

// ---------- 压力 ----------
test('压力三档：小 ±5、中 ±10、大 ±20，省略按中', () => {
    const bars = { stamina: 50, stress: 50, money: 0 };
    const run = (d) => applyBarDirective(bars, { kind: 'stress', ...d }).bars.stress;
    assert.deepEqual(['小', '中', '大'].map((strength) => run({ value: '上升', strength })), [55, 60, 70]);
    assert.deepEqual(['小', '中', '大'].map((strength) => run({ value: '下降', strength })), [45, 40, 30]);
    assert.equal(run({ value: '上升' }), 60);
    assert.equal(run({ value: '下降' }), 40);
});

test('压力标签解析：方向在前时第二段为强度，带角色名时第三段为强度', () => {
    const p = (t, rev = 1) => parseStatDirectives(t, { rev }).directives[0];
    assert.deepEqual(p('[igs-stat:stress|上升|大]'), { kind: 'stress', value: '上升', strength: '大' });
    assert.deepEqual(p('[igs-stat:stress|小雪|下降|小]'), { kind: 'stress', value: '下降', target: '小雪', strength: '小' });
    assert.deepEqual(p('[igs-stat:stress|上升]'), { kind: 'stress', value: '上升' });
    assert.deepEqual(p('[igs-stat:stress|小雪|上升]'), { kind: 'stress', value: '上升', target: '小雪' });
    assert.equal(p('[igs-stat:stress|上升|20]'), undefined);
    assert.equal(p('[igs-stat:stress|上升|大]', 0).strength, undefined);
});

test('压力结算：新楼按强度，旧楼按 ±10', () => {
    const stress = (opts) => floor(createStatsState(), '[igs-stat:stress|上升|大]', opts).state.protagonist.bars.stress;
    const base = createStatsState().protagonist.bars.stress;
    assert.equal(stress({}) - base, 20);
    assert.equal(stress({ strengthRev: 0 }) - base, 10);
});

// ---------- 好感方向词 ----------
test('18 个方向词的正负与默认强度（普通档新楼）', () => {
    assert.equal(Object.keys(FAVOR_WORDS).length, 18);
    const expect = { 喜悦: 2, 大笑: 2, 欣赏: 2, 安心: 2, 害羞: 4, 感动: 4, 爱恋: 4, 平淡: 0, 悲伤: -3, 冷淡: -3, 委屈: -3, 怀疑: -3, 不满: -8, 嫌弃: -8, 愤怒: -8, 害怕: -8, 受伤: -15 };
    for (const [word, delta] of Object.entries(expect)) assert.equal(favor(`[igs-stat:favor|小雪|${word}]`, {}, delta < 0 ? 30 : 0), delta, word);
});

test('旧方向词与旧近义词：新楼等同对应新词，旧楼数值不变', () => {
    assert.equal(favor('[igs-stat:favor|小雪|开心]'), 2);
    assert.equal(favor('[igs-stat:favor|小雪|心动]'), 4);
    assert.equal(favor('[igs-stat:favor|小雪|失望]', {}, 30), -3);
    assert.equal(favor('[igs-stat:favor|小雪|反感]', {}, 30), -8);
    assert.equal(favor('[igs-stat:favor|小雪|讨厌]', {}, 30), -8);
    const old = { favorTier: undefined, strengthRev: 0 };
    assert.equal(favor('[igs-stat:favor|小雪|开心]', old), 2);
    assert.equal(favor('[igs-stat:favor|小雪|心动]', old), 3);
    assert.equal(favor('[igs-stat:favor|小雪|失望]', old, 30), -2);
    assert.equal(favor('[igs-stat:favor|小雪|反感]', old, 30), -4);
    assert.equal(favor('[igs-stat:favor|小雪|嫌弃]', old, 30), -4);
    assert.equal(parseStatDirectives('[igs-stat:favor|小雪|喜悦]').directives.length, 0);
    assert.equal(parseStatDirectives('[igs-stat:favor|小雪|哭泣]').directives.length, 0);
});

test('新近义词与情绪组兜底', () => {
    const v = (w, groups) => resolveFavorWord(w, groups).value;
    assert.equal(v('敬佩'), '欣赏');
    assert.equal(v('放心'), '安心');
    assert.equal(v('恐惧'), '害怕');
    assert.equal(v('心疼'), '感动');
    assert.equal(v('冷漠'), '冷淡');
    assert.equal(v('冤枉'), '委屈');
    assert.equal(v('猜疑'), '怀疑');
    assert.equal(v('嫉妒'), '吃醋');
    assert.equal(v('哽咽'), '受伤');
    assert.equal(v('欣慰'), '安心');
    assert.equal(v('平静'), '平淡');
    assert.equal(v('害怕'), '害怕');
    assert.equal(v('焦虑'), '平淡');
    assert.equal(v('惊讶'), '平淡');
    assert.equal(favor('[igs-stat:favor|小雪|哽咽]', {}, 30), -15);
    assert.equal(favor('[igs-stat:favor|小雪|平静]'), 0);
});

test('自建组按平淡并记诊断，未知词丢弃并记诊断', () => {
    const groups = [{ label: '自建', words: ['嘿嘿'] }];
    assert.deepEqual(favorFromMoodGroup('嘿嘿', groups), { group: '自建', value: '平淡', valued: false });
    const p = parseStatDirectives('[igs-stat:favor|小雪|嘿嘿][igs-stat:favor|小雪|莫名词]', { rev: 1, moodGroups: groups });
    assert.equal(p.directives.length, 1);
    assert.equal(p.directives[0].value, '平淡');
    const codes = p.diagnostics.map((d) => d.code);
    assert.ok(codes.includes('stat-favor-group-unvalued'));
    assert.ok(codes.includes('stat-favor-unknown'));
    assert.equal(resolveFavorWord('嘿嘿', [{ label: '愤怒', words: ['嘿嘿'] }]).value, '愤怒');
});

test('检定失败：新楼所有正向方向保持、强度降一档；小降为平淡', () => {
    const fail = { social: true, success: false, toward: '小雪' };
    const lv = (text) => favor(text, { storyChecks: [{ ...fail, skill: '话术' }] });
    assert.equal(lv('[igs-stat:favor|小雪|喜悦|大]'), 4);
    assert.equal(lv('[igs-stat:favor|小雪|爱恋]'), 2);
    assert.equal(lv('[igs-stat:favor|小雪|喜悦]'), 0);
    assert.equal(lv('[igs-stat:favor|小雪|感动|重大]'), 4);
});

test('正向重大需同楼 event：新方向词同样适用', () => {
    assert.equal(favor('[igs-stat:favor|小雪|爱恋|重大]'), 6);
});

test('提示词：好感档位按正负分组，含压力强度与总则', () => {
    const { content } = buildStatsPrompt(createStatsState(), {});
    assert.ok(content.includes('正向：喜悦/大笑/欣赏/安心/害羞/感动/爱恋'));
    assert.ok(content.includes('负向：悲伤/冷淡/委屈/怀疑/不满/嫌弃/愤怒/吃醋/害怕/受伤'));
    assert.ok(content.includes('[igs-stat:stress|上升/下降|小/中/大]'));
    assert.ok(content.includes('[igs-stat:grudge|角色名|上升/下降|小/中/大/重大]'));
    assert.ok(content.includes('关系类标签只记角色对主角本人（而非其身体）态度的变化'));
    assert.equal(FAVOR_DIRECTIONS.length, 22);
});
