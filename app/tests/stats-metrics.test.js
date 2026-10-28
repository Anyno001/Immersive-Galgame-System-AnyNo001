import test from 'node:test';
import assert from 'node:assert/strict';
import { characterStatMetrics, createStatsMetricsLookup, displayOfFavor, overlayStatsMetrics, preferStatsLookup, protagonistStatMetrics } from '../src/scene/stats/stat-metrics.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';

function stateWith(dims, nsfw = false) {
    const s = createStatsState();
    const c = createCharacter(1, { nsfw });
    return { ...s, characters: { 小雪: { ...c, dims: { ...c.dims, ...dims } } } };
}

test('好感条右侧：阶段名 / 数字 / 两者（Q7）', () => {
    assert.equal(displayOfFavor(34), '明确喜欢');
    assert.equal(displayOfFavor(34, 'number'), '34');
    assert.equal(displayOfFavor(-20, 'both'), '淡淡不喜 · -20');
});

test('metrics 与状态栏同形；负值条长按 0、数字照实；欲望跟随 NSFW（易错点 E5）', () => {
    const m = characterStatMetrics(stateWith({ 好感: -20, 信任: 30 }, true).characters.小雪);
    assert.deepEqual(Object.keys(m[0]).sort(), ['colorKey', 'display', 'label', 'percent', 'quiet', 'sourceUid', 'statValue']);
    assert.equal(m.find((x) => x.label === '好感').percent, 0);
    assert.equal(m.find((x) => x.label === '好感').statValue, -20);
    assert.equal(m.find((x) => x.label === '信任').display, '30');
    assert.equal(m.some((x) => x.label === '欲望'), false);
    const withDesire = characterStatMetrics(stateWith({ 欲望: 10 }, true).characters.小雪, { nsfw: true });
    assert.equal(withDesire.some((x) => x.label === '欲望'), true);
});

test('lookup 与 character-metrics 同形；未登记角色返回空；生活条按子开关', () => {
    const lookup = createStatsMetricsLookup(stateWith({ 好感: 60 }));
    assert.equal(lookup('小雪').stages[0].value, '强烈在意');
    assert.deepEqual(lookup('路人'), { metrics: [], stages: [] });
    assert.deepEqual(protagonistStatMetrics({ health: 80, stamina: 50, stress: 10 }, { enabledBars: { stamina: true, stress: false } }).map((x) => x.label), ['生命', '体力']);
});

test('已登记角色只用 IGS 数据，未登记的人退回表格；表格出错不影响已登记角色（易错点 H3）', () => {
    const tableRow = { metrics: [{ label: '好感度', percent: 90, display: '90' }], stages: [] };
    let tableCalls = 0;
    const lookup = preferStatsLookup(createStatsMetricsLookup(stateWith({ 好感: 10 })), (name) => { tableCalls += 1; return name === '路人' ? tableRow : { metrics: [], stages: [] }; });
    assert.equal(lookup('小雪').metrics.find((m) => m.label === '好感').display, '初步好感');
    assert.equal(tableCalls, 0);
    assert.equal(lookup('路人'), tableRow);
    const broken = preferStatsLookup(createStatsMetricsLookup(stateWith({ 好感: 10 })), () => { throw new Error('read-failed'); });
    assert.equal(broken('小雪').metrics.length > 0, true);
    assert.deepEqual(broken('路人'), { metrics: [], stages: [] });
    assert.deepEqual(preferStatsLookup(null, null)('任何人'), { metrics: [], stages: [] });
});

test('状态栏叠加：已登记角色换成 IGS 数值，未登记、出错、未接管时原样返回（易错点 H3）', () => {
    const base = { character: '小雪', metrics: [{ label: '好感度', percent: 90, display: '90' }], hiddenCount: 2, loadState: 'no-data', loadReason: '', relation: '' };
    const lookup = createStatsMetricsLookup(stateWith({ 好感: 30 }));
    const out = overlayStatsMetrics(base, lookup, '小雪');
    assert.equal(out.metrics.find((m) => m.label === '好感').display, '明确喜欢');
    assert.deepEqual([out.hiddenCount, out.loadState, out.relation], [0, 'ready', '明确喜欢']);
    assert.equal(base.metrics[0].display, '90');
    assert.equal(overlayStatsMetrics({ ...base, relation: '同学' }, lookup, '小雪').relation, '同学');
    assert.equal(overlayStatsMetrics(base, lookup, '路人'), base);
    assert.equal(overlayStatsMetrics(base, () => { throw new Error('x'); }, '小雪'), base);
    assert.equal(overlayStatsMetrics(base, null, '小雪'), base);
});
