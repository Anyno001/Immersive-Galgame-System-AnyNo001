import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicApi } from '../src/api/public-api.js';
import { createStatsRuntime } from '../src/core/stats-runtime.js';

const sample = () => [
    { name: '名气', owner: '主角', cls: '热度', value: 60, tier: '中' },
    { name: '组合热度', owner: '主角', cls: '热度', value: 70, tier: '大', pairs: [{ partner: '小明', value: 70, tier: '大' }] },
];

test('IGS.stats.fame：未开声望、无读取器、读取器抛错都返回 []', () => {
    assert.deepEqual(createPublicApi({ version: 't' }).stats.fame(), []);
    assert.deepEqual(createPublicApi({ version: 't', statsReaders: { fame: () => [] } }).api.stats.fame(), []);
    assert.deepEqual(createPublicApi({ version: 't', statsReaders: { fame: () => { throw new Error('x'); } } }).stats.fame(), []);
});

test('createStatsRuntime.fameSnapshot：没有账本时返回 []', () => {
    const runtime = createStatsRuntime({ getContext: () => null, readSettings: () => ({}) });
    assert.deepEqual(runtime.fameSnapshot(), []);
});

test('IGS.stats.fame：结构正确（含 pairs），修改返回值不影响内部', () => {
    const inner = sample();
    const api = createPublicApi({ version: 't', statsReaders: { fame: () => inner } }).stats;
    const out = api.fame();
    assert.deepEqual(out, sample());
    assert.deepEqual(out[1].pairs, [{ partner: '小明', value: 70, tier: '大' }]);
    out[0].value = 1;
    out[1].pairs.push({ partner: 'x', value: 1, tier: '小' });
    assert.deepEqual(inner, sample());
    assert.deepEqual(api.fame(), sample());
    assert.notEqual(api.fame()[0], api.fame()[0]);
});
