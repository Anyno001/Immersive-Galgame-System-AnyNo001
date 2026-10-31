import test from 'node:test';
import assert from 'node:assert/strict';
import { blk, createHarness } from './origin-host.js';

const A = '版本甲' + blk('获得|汉堡|2');
const B = '版本乙' + blk('获得|汉堡|1', '获得|包子|1');

// 聊天布局：0 用户 / 1 AI / 2 用户 / 3 AI / 4 用户 / 5 AI（第 5 楼，有 A、B 两版）
function floor5() {
    const h = createHarness();
    h.user('u0'); h.ai('a1');
    h.user('u2'); h.ai('a3');
    h.user('u4');
    const i = h.ai(A);
    assert.equal(i, 5);
    return h;
}

test('汉堡 / 包子：第 5 楼 A 版汉堡×2、B 版汉堡×1 包子×1，A→B→A 来回切背包正确', () => {
    const h = floor5();
    assert.deepEqual(h.bag(), { 汉堡: 2 });
    h.newSwipe(5, B);
    assert.deepEqual(h.bag(), { 汉堡: 1, 包子: 1 });
    h.selectSwipe(5, 0);
    assert.deepEqual(h.bag(), { 汉堡: 2 });
    h.selectSwipe(5, 1);
    assert.deepEqual(h.bag(), { 汉堡: 1, 包子: 1 });
    h.selectSwipe(5, 0);
    assert.deepEqual(h.bag(), { 汉堡: 2 });
});

test('第 6 楼以选中的那一版为底；「数据块写了又在正文写一遍」的去重只在同楼同 swipe 内', () => {
    const h = floor5();
    h.newSwipe(5, B);
    h.user('u6');
    h.ai('a7' + blk('获得|汉堡|1'));
    assert.deepEqual(h.bag(), { 汉堡: 2, 包子: 1 }, '以 B 为底');
    h.selectSwipe(5, 0);
    assert.deepEqual(h.bag(), { 汉堡: 3 }, '切回 A，第 7 楼叠在 A 之上');
    h.selectSwipe(5, 1);
    assert.deepEqual(h.bag(), { 汉堡: 2, 包子: 1 });
    // 同一楼同一 swipe：块里写了、正文又写一遍，只算一次
    const g = createHarness();
    g.user('u'); g.ai('结算：获得 汉堡×2。' + blk('获得|汉堡|2'));
    assert.deepEqual(g.bag(), { 汉堡: 2 });
});

test('B 版下手动吃包子后切回 A：这条操作被跳过并写记录；切回 B 自动恢复', () => {
    const h = floor5();
    h.newSwipe(5, B);
    assert.equal(h.engine.dispatch({ type: 'use', name: '包子' }).ok, true);
    assert.deepEqual(h.bag(), { 汉堡: 1 });
    h.selectSwipe(5, 0);
    assert.deepEqual(h.bag(), { 汉堡: 2 }, 'A 版没有包子，操作跳过，汉堡不受影响');
    const s = h.state();
    assert.equal(s.skipped.length, 1);
    assert.equal(s.skipped[0].reason, 'no-item');
    assert.match(s.log.at(-1).text, /操作已跳过：当前版本的背包里没有「包子」/);
    h.selectSwipe(5, 1);
    assert.deepEqual(h.bag(), { 汉堡: 1 });
    assert.equal(h.state().skipped.length, 0);
    assert.equal(h.state().log.some((l) => /操作已跳过/.test(l.text)), false);
});

test('删第 5 楼：背包回退，挂在这一楼之后的手动操作一起回退', () => {
    const h = floor5();
    h.engine.dispatch({ type: 'addItem', name: '钥匙', count: 1 });
    assert.deepEqual(h.bag(), { 汉堡: 2, 钥匙: 1 });
    h.removeLast();
    assert.deepEqual(h.bag(), {});
    h.ai(A);
    assert.deepEqual(h.bag(), { 汉堡: 2 }, '重新来一版，被删掉的手动操作不会复活');
});

test('抽奖：同 swipe 重算（编辑、全楼重算、存档重开）结果不变；切 swipe 来回结果不变', () => {
    const h = createHarness();
    h.user('u0'); h.ai('a1' + blk('积分|+5000|发钱'));
    h.user('u2');
    const i = h.ai('抽！' + blk('抽奖', '抽奖', '抽奖'));
    const before = JSON.stringify(h.state().bag);
    assert.ok(h.state().log.filter((l) => /抽奖 →/.test(l.text)).length === 3);
    h.emit('msg_updated', i);
    assert.equal(JSON.stringify(h.state().bag), before, '编辑后同种子重算');
    h.engine.recalcAll();
    assert.equal(JSON.stringify(h.state().bag), before, '全楼重算');
    h.newSwipe(i, '另一版' + blk('积分|+1|x'));
    h.selectSwipe(i, 0);
    assert.equal(JSON.stringify(h.state().bag), before, '切走再切回');
    h.reopen();
    assert.equal(JSON.stringify(h.engine.getState().bag), before, '存档重开');
    // 手动抽奖种子随操作存，回放不变
    h.engine.dispatch({ type: 'draw' });
    const after = JSON.stringify(h.engine.getState().bag);
    h.reopen();
    assert.equal(JSON.stringify(h.engine.getState().bag), after);
    assert.equal(h.engine.getState().points, 5000 + 50 - 4 * 300, '含「腰缠万贯」成就奖励 50');
});

test('抽奖换新 swipe 用新种子（重 roll 重新掷骰）', () => {
    const results = new Set();
    for (let k = 0; k < 12; k += 1) {
        const h = createHarness();
        h.user('u'); h.ai('a' + blk('积分|+9000|x'));
        h.user('u');
        const i = h.ai('r' + blk('抽奖', '抽奖', '抽奖', '抽奖', '抽奖', '抽奖'));
        results.add(JSON.stringify(h.state().bag));
        h.newSwipe(i, 'r2' + blk('抽奖', '抽奖', '抽奖', '抽奖', '抽奖', '抽奖'));
        results.add(JSON.stringify(h.state().bag));
    }
    assert.ok(results.size > 1);
});
