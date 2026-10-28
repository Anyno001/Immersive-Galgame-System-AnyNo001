import test from 'node:test';
import assert from 'node:assert/strict';
import { STATS_LOG_MAX, createStatsLedger, currentStatsState, deleteFloorsFrom, seededRandom, selectSwipe, statFloorKey } from '../src/scene/stats/stat-ledger.js';
import { resettleFloor, settleFloor } from '../src/scene/stats/stat-ledger-settle.js';
import { cryptoRandom, rollStatCheck } from '../src/scene/stats/stat-rng.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';

function counting() {
    const calls = { n: 0 };
    const settle = (before, random) => {
        calls.n += 1;
        return { state: { ...before, n: (before.n || 0) + 1, r: random() }, changes: [{ source: 'tag', key: 'n' }] };
    };
    return { calls, settle };
}

test('同楼同 swipe 连续结算 3 次只变一次（易错点 A4）', () => {
    const ledger = createStatsLedger('c', { n: 0 });
    const { calls, settle } = counting();
    for (let i = 0; i < 3; i += 1) settleFloor(ledger, { messageId: 1, swipeId: 0 }, settle, 7);
    assert.equal(calls.n, 1);
    assert.equal(currentStatsState(ledger).n, 1);
    assert.equal(ledger.log.length, 1);
});

test('新 swipe 从结算前状态重掷；切回已有 swipe 只读取不重掷（易错点 B1）', () => {
    const ledger = createStatsLedger('c', { n: 0 });
    const { calls, settle } = counting();
    settleFloor(ledger, { messageId: 1, swipeId: 0 }, settle, 1);
    const a = settleFloor(ledger, { messageId: 2, swipeId: 0 }, settle, 11).entry;
    const b = settleFloor(ledger, { messageId: 2, swipeId: 1 }, settle, 22).entry;
    assert.equal(a.before, b.before);
    assert.equal(b.after.n, 2);
    assert.notEqual(a.after.r, b.after.r);
    assert.equal(selectSwipe(ledger, 2, 0), a);
    assert.equal(currentStatsState(ledger), a.after);
    assert.equal(selectSwipe(ledger, 2, 1), b);
    assert.equal(currentStatsState(ledger), b.after);
    assert.equal(calls.n, 3);
    assert.equal(selectSwipe(ledger, 2, 5), null);
    assert.equal(currentStatsState(ledger).n, 1);
});

test('继续生成、编辑正文按原种子从结算前快照重算，不级联后续楼层（易错点 A2/A5）', () => {
    const ledger = createStatsLedger('c', createStatsState());
    const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);
    const settleWith = (text) => (before, random) => settleFloorText(before, text, { random, resolveCharacter });
    const first = settleFloor(ledger, { messageId: 1 }, settleWith('[igs-stat:favor|小雪|开心]'), 99).entry;
    const later = settleFloor(ledger, { messageId: 2 }, settleWith('[igs-stat:favor|小雪|感动]'), 5).entry;
    const again = resettleFloor(ledger, { messageId: 1 }, settleWith('[igs-stat:favor|小雪|开心]')).entry;
    assert.equal(again.seed, first.seed);
    assert.equal(again.before, first.before);
    assert.deepEqual(again.after, first.after);
    const edited = resettleFloor(ledger, { messageId: 1 }, settleWith('[igs-stat:favor|小雪|受伤]')).entry;
    assert.equal(edited.after.characters.小雪.dims.好感, -6);
    assert.equal(ledger.entries.get('c|2|0'), later);
});

test('删楼后回到最后一个存活楼层的状态，日志同步清理（易错点 B3）', () => {
    const ledger = createStatsLedger('c', { n: 0 });
    const { settle } = counting();
    for (const id of [1, 3, 5]) settleFloor(ledger, { messageId: id }, settle, id);
    assert.equal(currentStatsState(ledger).n, 3);
    assert.equal(deleteFloorsFrom(ledger, 3).n, 1);
    assert.deepEqual([...ledger.entries.keys()], ['c|1|0']);
    assert.equal(ledger.log.length, 1);
    assert.equal(deleteFloorsFrom(ledger, 0).n, 0);
});

test('日志限条数（易错点 B4）；种子随机可复现；键与 floorKeyOf 同格式', () => {
    const big = createStatsLedger('c', {});
    settleFloor(big, { messageId: 1 }, (s) => ({ state: s, changes: Array.from({ length: 600 }, (_, i) => ({ i })) }), 1);
    assert.equal(big.log.length, STATS_LOG_MAX);
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = Array.from({ length: 5 }, () => a());
    assert.deepEqual(xs, Array.from({ length: 5 }, () => b()));
    assert.ok(xs.every((x) => x >= 0 && x < 1));
    assert.equal(statFloorKey({ chatId: 'c', messageId: 3, swipeId: '2' }), 'c|3|2');
    assert.equal(statFloorKey({ chatId: 'c', messageId: 3 }), 'c|3|0');
});

test('crypto 随机源落在 [0,1)；奖惩骰互相抵消、最多 2 颗；难度档判定', () => {
    for (let i = 0; i < 50; i += 1) { const x = cryptoRandom(); assert.ok(x >= 0 && x < 1); }
    assert.equal(rollStatCheck(50, { bonus: 1, penalty: 1 }).totals.length, 1);
    assert.equal(rollStatCheck(50, { bonus: 3 }).totals.length, 3);
    const hard = rollStatCheck(50, { difficulty: 1 }, () => 0.35);
    assert.equal(hard.roll, 33);
    assert.equal(hard.tier, '普通成功');
    assert.equal(hard.success, false);
});
