import test from 'node:test';
import assert from 'node:assert/strict';
import { favorToasts, growthResults, jealousySignals, statsFxOf, statsNoticeLines } from '../src/scene/stats/stat-fx.js';
import { diffFavorMetrics } from '../src/visual/igs-ui/fx-runtime.js';

const changes = [
    { source: 'tag', target: '小雪', key: '好感', from: 10, to: 12, note: '开心' },
    { source: 'tag', target: '小雪', key: '信任', from: 0, to: 1, note: '上升' },
    { source: 'tag', target: '阿澄', key: '好感', from: 30, to: 27, note: '吃醋' },
    { source: 'daily', target: '主角', key: '烹饪', from: 20, to: 27, note: '成长' },
    { source: 'daily', target: '小雪', key: '好感', from: 40, to: 39, note: '冷却' },
];

test('好感飘字：阶段名模式只出心形，数字模式带增减；冷却不飘字（§10）', () => {
    assert.deepEqual(favorToasts(changes).map((t) => [t.target, t.text]), [['小雪', '♥'], ['阿澄', '♡']]);
    assert.deepEqual(favorToasts(changes, { hudLabel: 'number' }).map((t) => t.text), ['♥ +2', '♡ -3']);
});

test('成长掷骰结果与吃醋信号', () => {
    assert.deepEqual(growthResults(changes), [{ skill: '烹饪', from: 20, to: 27, gain: 7 }]);
    assert.deepEqual(jealousySignals(changes), ['阿澄']);
});

test('一楼没有可播内容时返回 null；战斗结果一并带出', () => {
    assert.equal(statsFxOf({ changes: [], meta: { events: [] } }), null);
    const fx = statsFxOf({ changes, meta: { events: [{ kind: 'battle', outcome: '胜' }] } });
    assert.equal(fx.battle.outcome, '胜');
    assert.equal(fx.toasts.length, 2);
});

test('提示文案：成长与战斗各一行，好感不重复；空汇总返回空数组', () => {
    const fx = statsFxOf({ changes, meta: { events: [{ kind: 'battle', outcome: '险胜' }] } });
    assert.deepEqual(statsNoticeLines(fx), ['烹饪成长 +7（20→27）', '战斗结果：险胜']);
    assert.deepEqual(statsNoticeLines(null), []);
});

test('状态栏好感提示：数值系统指标按原始值算增减（负区间继续下降也提示），阶段名模式标记静默；表格指标照旧按条长', () => {
    const baseline = new Map();
    assert.deepEqual(diffFavorMetrics(baseline, '小雪', [{ label: '好感', percent: 0, statValue: -6, quiet: true }]), []);
    assert.deepEqual(diffFavorMetrics(baseline, '小雪', [{ label: '好感', percent: 0, statValue: -10, quiet: true }]), [{ character: '小雪', label: '好感', delta: -4, quiet: true }]);
    assert.deepEqual(diffFavorMetrics(baseline, '阿澄', [{ label: '好感度', percent: 40 }]), []);
    assert.deepEqual(diffFavorMetrics(baseline, '阿澄', [{ label: '好感度', percent: 45 }]), [{ character: '阿澄', label: '好感度', delta: 5 }]);
});
