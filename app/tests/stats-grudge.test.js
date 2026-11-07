import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState, grudgeOfCharacter, grudgeTier } from '../src/scene/stats/stat-state.js';
import { characterStatMetrics } from '../src/scene/stats/stat-metrics.js';
import { describeCombination } from '../src/scene/stats/stat-prompt.js';

const settle = (text, state = createStatsState()) => settleFloorText(state, text, { random: () => 0.99, resolveCharacter: (name) => (name === '小雪' ? '小雪' : null) });

test('旧档角色缺芥蒂时读取按 0 补齐，0 档不显示', () => {
    const old = { ...createCharacter(1), dims: { 好感: 30, 信任: 10, 了解: 5 } };
    const state = { ...createStatsState(), characters: { 小雪: old } };
    assert.equal(grudgeOfCharacter(state, '小雪'), 0);
    assert.equal(grudgeOfCharacter(state, '路人'), 0);
    assert.equal(characterStatMetrics(old).some((m) => m.label === '芥蒂'), false);
    assert.equal(createCharacter(1).dims.芥蒂, 0);
    assert.equal(describeCombination(old.dims), '');
});

test('档位词按数值显示在状态栏与提示词', () => {
    assert.deepEqual([0, 1, 25, 26, 51, 76, 100].map(grudgeTier), ['', '不满', '不满', '记恨', '怨恨', '积怨', '积怨']);
    const c = { ...createCharacter(1) };
    c.dims = { ...c.dims, 芥蒂: 60 };
    const metric = characterStatMetrics(c).find((m) => m.label === '芥蒂');
    assert.equal(metric.display, '60');
    assert.equal(metric.colorKey, 'grudge');
    assert.match(describeCombination(c.dims), /芥蒂（怨恨）/);
});

test('芥蒂别名标签入账，且不改动好感与信任', () => {
    for (const kind of ['grudge', '芥蒂', '仇怨', '怨气', '恨', '怨', '怨恨', '敌意', '仇恨', '记恨', '心结', '隔阂感']) {
        const r = settle(`[igs-stat:${kind}|小雪|上升]`);
        assert.equal(r.state.characters.小雪.dims.芥蒂, 2, kind);
        assert.equal(r.state.characters.小雪.dims.好感, 0, kind);
    }
});

test('好感与芥蒂可同时升高，互不影响', () => {
    const r = settle('[igs-stat:favor|小雪|感动][igs-stat:grudge|小雪|上升][igs-stat:trust|小雪|上升]');
    const dims = r.state.characters.小雪.dims;
    assert.ok(dims.好感 > 0 && dims.芥蒂 > 0 && dims.信任 > 0);
    const down = settle('[igs-stat:favor|小雪|受伤]', r.state).state.characters.小雪.dims;
    assert.equal(down.芥蒂, dims.芥蒂);
});

test('阶段与数字显示：四个维度在 stage、both、number 下各取对应阶段表', () => {
    const c = createCharacter(1);
    c.dims = { 好感: 0, 信任: 0, 了解: 30, 欲望: 60, 芥蒂: 90 };
    const shown = (hudLabel) => Object.fromEntries(characterStatMetrics(c, { hudLabel, nsfw: true }).map((m) => [m.label, m.display]));
    assert.deepEqual(shown('stage'), { 好感: '无感', 信任: '警惕', 了解: '初识', 欲望: '渴求', 芥蒂: '积怨' });
    assert.deepEqual(shown('both'), { 好感: '无感 · 0', 信任: '警惕 · 0', 了解: '初识 · 30', 欲望: '渴求 · 60', 芥蒂: '积怨 · 90' });
    assert.deepEqual(shown('number'), { 好感: '0', 信任: '0', 了解: '30', 欲望: '60', 芥蒂: '90' });
    c.dims = { ...c.dims, 信任: -20, 了解: 25, 欲望: 26, 芥蒂: 0 };
    const low = Object.fromEntries(characterStatMetrics(c, { hudLabel: 'stage', nsfw: true }).map((m) => [m.label, m.display]));
    assert.deepEqual(low, { 好感: '无感', 信任: '警惕', 了解: '陌生', 欲望: '悸动' });
});

test('角色体力、压力条只在开关开启时出现，排在好感上面', () => {
    const c = { ...createCharacter(1, { nsfw: true }), bars: { stamina: 40 } };
    assert.equal(characterStatMetrics(c, { nsfw: true }).some((m) => m.label === '体力'), false);
    const rows = characterStatMetrics(c, { nsfw: true, stamina: true });
    assert.deepEqual(rows.slice(0, 3).map((m) => m.label), ['体力', '压力', '好感']);
    assert.equal(rows[0].display, '40');
});
