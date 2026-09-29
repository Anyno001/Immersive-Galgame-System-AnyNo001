import { createFxMemory, planPageFx } from '../src/visual/igs-ui/fx-runtime.js';

import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPromises, promiseDay, readStoryNow, resolveDuePromises } from '../src/scene/promise-reminder.js';

const table = (value) => [{ name: '全局状态表', columns: ['row_id', '全局状态', '当前时间', '上轮场景时间', '经过的时间', '当前位置'], rows: [['1', '全局状态', value, '', '', '车站']] }];

test('gate:promise-reminder reads story now from 全局状态表 当前时间', () => {
    const now = readStoryNow(table('2026-04-07 16:00'));
    assert.equal(now.raw, '2026-04-07 16:00');
    assert.equal(now.year, 2026);
    assert.equal(readStoryNow(table('')), null);
    assert.equal(readStoryNow(table('第三天傍晚')), null);
    assert.equal(readStoryNow([{ name: '其他表', columns: ['当前时间'], rows: [['2026-04-07']] }]), null);
    assert.equal(readStoryNow(null), null);
});

test('gate:promise-reminder fuzzy matches any table containing 全局 and tolerant time column', () => {
    assert.equal(readStoryNow([{ name: '全局信息', columns: ['row_id', '现在时间'], rows: [['1', '2026-05-01 08:00']] }]).year, 2026);
    assert.equal(readStoryNow([{ name: '世界全局表', columns: ['当前日期时间'], rows: [['2026-05-01']] }]).table, '世界全局表');
    // 上轮 / 经过 类时间列不当作现在。
    assert.equal(readStoryNow([{ name: '全局状态表', columns: ['上轮场景时间', '经过的时间'], rows: [['2026-05-01', '2天']] }]), null);
    // 第一张全局表读不出日期时继续找下一张。
    const now = readStoryNow([
        { name: '全局设定', columns: ['时间'], rows: [['第三天']] },
        { name: '全局状态表', columns: ['当前时间'], rows: [['2026-06-02 10:00']] },
    ]);
    assert.equal(now.table, '全局状态表');
});

test('gate:promise-reminder due only on the same story day; unparseable times never remind', () => {
    const now = readStoryNow(table('2026-04-07 16:00'));
    const promises = collectPromises([
        { id: 1, text: '[igs-fx:promise|4月7日|车站]\n[igs-fx:promise|周六下午|公园]' },
        { id: 2, text: '[igs-fx:promise|2026-04-08]\n[igs-fx:promise|4月7日|车站]' },
    ]);
    assert.deepEqual(promises.map((p) => `${p.messageId}:${p.time}`), ['1:4月7日', '1:周六下午', '2:2026-04-08']);
    assert.deepEqual(resolveDuePromises(promises, now).map((p) => p.time), ['4月7日']);
    assert.equal(promiseDay('周六下午', now), null);
    assert.equal(promiseDay('2026-04-07', now), now.day);
    assert.deepEqual(resolveDuePromises(promises, null), []);
    const next = readStoryNow(table('2026-04-08 09:00'));
    assert.deepEqual(resolveDuePromises(promises, next).map((p) => p.time), ['2026-04-08']);
});

test('gate:promise-reminder plan plays due card once per floor and only when promise tag enabled', () => {
    const snap = (fxTags, index) => ({ messageId: 11, readerSettings: { fxTags }, content: { currentIndex: index, fx: { instants: [], promiseDue: [{ time: '4月7日', place: '车站' }] } } });
    const memory = createFxMemory();
    const first = planPageFx(snap({ enabled: true, promise: true }, 0), memory);
    assert.deepEqual(first.effects.filter((e) => e.type === 'promise-due'), [{ type: 'promise-due', time: '4月7日', place: '车站' }]);
    const second = planPageFx(snap({ enabled: true, promise: true }, 1), memory);
    assert.equal(second.effects.some((e) => e.type === 'promise-due'), false);
    const off = planPageFx(snap({ enabled: true }, 0), createFxMemory());
    assert.equal(off.effects.some((e) => e.type === 'promise-due'), false);
});
