import test from 'node:test';
import assert from 'node:assert/strict';
import { blk, createHarness } from './origin-host.js';

const TASK = '新任务|类型:支线|标题:跑腿|描述:d|条件:c|奖励:积分10|惩罚:积分-5|时限:|对象:宿主';

test('D1 用道具 / 系统事件挂在用户楼上：重新生成、生成失败都会再带上，新的 AI 楼出现后才消耗', () => {
    const h = createHarness();
    h.user('你好');
    h.ai('正文' + blk('获得|药水|2'));
    assert.deepEqual(h.engine.dispatch({ type: 'use', name: '药水' }), { ok: true, opId: 1 });
    h.user('继续');
    assert.match(h.injected(), /使用了道具「药水」/);
    assert.match(h.injected('regenerate'), /使用了道具「药水」/, '重新生成仍带上');
    assert.match(h.injected(), /使用了道具「药水」/, '生成失败后再试仍带上');
    h.ai('回应');
    h.user('再来');
    assert.doesNotMatch(h.injected(), /使用了道具/, 'AI 楼出现、新用户楼发出后才算消费掉');

    const g = createHarness();
    g.user('开始');
    g.ai('正文' + blk(TASK));
    g.user('a');
    g.ai('正文' + blk('失败|1'));
    g.user('b');
    assert.match(g.injected(), /【本回合系统事件】任务「跑腿」失败（积分-5）/);
    assert.match(g.injected('swipe'), /本回合系统事件/, '惩罚事件同样随重新生成带上');
    g.ai('后续');
    g.user('c');
    assert.doesNotMatch(g.injected(), /本回合系统事件/);
});

test('D2 切 swipe 不串状态：每个 swipe 各算各的，没快照的 swipe 不会退回「最后写入的那个」', () => {
    const h = createHarness();
    h.user('go');
    const i = h.ai('版本甲' + blk('积分|+100|a'));
    assert.equal(h.state().points, 100);
    h.newSwipe(i, '版本乙' + blk('积分|+7|b'));
    assert.equal(h.state().points, 7);
    h.selectSwipe(i, 0);
    assert.equal(h.state().points, 100);
    h.selectSwipe(i, 1);
    assert.equal(h.state().points, 7);
    // 新 swipe 还在生成（正文为空）时，状态是第 i 楼之前的状态，而不是上一个 swipe 的结果
    const m = h.ctx.chat[i];
    m.swipes.push('');
    m.swipe_id = 2;
    m.mes = '';
    h.emit('msg_swiped', i);
    assert.equal(h.state().points, 0);
});

test('D3 回退时技能 / 权限 / 商城 / 对话都跟楼走', () => {
    const h = createHarness();
    h.user('u0');
    h.ai('a1' + blk('技能|火球|烧', '权限|VIP通道|可插队', '新商品|符纸|50|辟邪|', '私聊|系统|你好'));
    h.user('u2');
    h.ai('a3' + blk('技能|冰锥|冻'));
    assert.deepEqual(h.state().skills.map((k) => k.name), ['火球', '冰锥']);
    h.removeLast(); h.removeLast();
    assert.deepEqual(h.state().skills.map((k) => k.name), ['火球']);
    assert.equal(h.state().perks.length, 1);
    assert.ok(h.state().shop.some((x) => x.name === '符纸'));
    assert.equal(h.state().chat.length, 1);
    h.removeLast(); h.removeLast();
    const s = h.state();
    assert.equal(s.skills.length + s.perks.length + s.chat.length, 0);
    assert.equal(s.shop.length, 6, '商城回到默认');
});

test('D4 / D5 不限楼数回退：删回很早的楼也能精确回到当时状态；只写 chatMetadata，不 saveChat，存档很小', () => {
    const h = createHarness();
    const seen = [0];
    for (let k = 1; k <= 30; k += 1) {
        h.user('u' + k);
        h.ai('a' + k + blk('积分|+' + k + '|x'));
        seen.push(h.state().points);
    }
    assert.equal(seen[30], 465);
    for (let k = 29; k >= 0; k -= 1) {
        h.removeLast(); h.removeLast();
        assert.equal(h.state().points, seen[k], '回到第' + k + '轮');
    }
    assert.equal(h.ctx.saveChatCalls, 0);
    assert.ok(h.saves > 0);
    const h2 = createHarness();
    for (let k = 1; k <= 30; k += 1) { h2.user('u'); h2.ai('a' + blk('积分|+1|x', '播报|嗯')); }
    h2.engine.dispatch({ type: 'buy', name: '凝神丹' });
    assert.equal(h2.ctx.saveChatCalls, 0, '面板操作不整份存聊天');
    const size = JSON.stringify(h2.ctx.chatMetadata.origin_v2).length;
    assert.ok(size < 30 * 400 + 6000, '存档大小 ' + size);
});

test('D6 手动操作记在 after:messageId 名下，roll 那一楼不会冲掉它们', () => {
    const h = createHarness();
    h.user('u0');
    const i = h.ai('甲' + blk('积分|+500|a'));
    assert.equal(h.engine.dispatch({ type: 'buy', name: '凝神丹' }).ok, true);
    assert.equal(h.state().points, 300);
    h.newSwipe(i, '乙' + blk('积分|+500|b'));
    assert.equal(h.state().points, 300, 'roll 之后购买仍在');
    assert.deepEqual(h.bag(), { 凝神丹: 1 });
    h.newSwipe(i, '丙' + blk('积分|+100|c'));
    assert.equal(h.state().points, 100, '积分不够的版本里购买被跳过');
    assert.equal(h.bag().凝神丹, undefined);
    assert.equal(h.state().skipped.length, 1);
    assert.match(h.state().log.at(-1).text, /操作已跳过：积分不够购买「凝神丹」/);
    h.selectSwipe(i, 1);
    assert.equal(h.state().points, 300);
    assert.deepEqual(h.bag(), { 凝神丹: 1 });
    h.removeLast();
    assert.equal(h.state().bag.length, 0, '删掉这一楼时手动操作一起回退');
});

test('D7 回合 = AI 楼序号：删楼后时限按剩余楼数重算，不再沿用旧计数', () => {
    const h = createHarness();
    h.user('u'); h.ai('a1' + blk('新任务|类型:支线|标题:跑腿|描述:d|条件:c|奖励:积分10|惩罚:积分-5|时限:3|对象:宿主'));
    h.user('u'); h.ai('a3');
    h.user('u'); h.ai('a5');
    h.user('u');
    assert.match(h.injected(), /跑腿（进度0%，剩1回合）/);
    h.ai('a7');
    assert.equal(h.state().tasks[0].status, 'failed');
    assert.equal(h.state().points, -5);
    h.removeLast(); h.removeLast();
    assert.equal(h.state().tasks[0].status, 'active');
    assert.equal(h.state().points, 0);
    h.removeLast(); h.removeLast();
    h.user('u');
    assert.match(h.injected(), /跑腿（进度0%，剩2回合）/);
});
