import test from 'node:test';
import assert from 'node:assert/strict';
import { blk, createHarness } from './origin-host.js';

const TASK = '新任务|类型:支线|标题:跑腿|描述:d|条件:c|奖励:积分10|惩罚:积分-5|时限:|对象:宿主';

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
    const h = createHarness({ achieveOn: false });
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


test('正文报积分：完成时的「奖励积分 N 点」补记并结算对应任务，发布任务的奖励不记，数据块已记的不重复', () => {
    const h = createHarness({ achieveOn: false });
    h.user('u0');
    h.ai('叮！发布任务：替她解围，奖励积分 100 点' + blk('新任务|类型:支线|标题:解围|描述:d|条件:c|奖励:积分100|对象:宿主'));
    assert.equal(h.state().points, 0);
    h.user('u1');
    h.ai('叮！任务完成，奖励积分 100 点' + blk('进度|1|80|快了'));
    assert.equal(h.state().points, 100);
    assert.equal(h.state().tasks[0].status, 'done');
    h.user('u2');
    h.ai('系统小妹：恭喜宿主，获得 50 积分！' + blk('积分|+50|奖励'));
    assert.equal(h.state().points, 150);
    h.user('u3');
    h.ai('当前积分：999。你花费了 300 积分。');
    assert.equal(h.state().points, 150);
});

test('物价第 2 版：新聊天按新价出货；旧存档的初始商城、已抽过的扣费和成就奖励按旧价回放', () => {
    const fresh = createHarness({ drawCost: 60, achieveOn: false });
    fresh.user('u');
    fresh.ai('a' + blk('积分|+100|x'));
    assert.equal(fresh.state().shop.find((x) => x.name === '回溯券').price, 240);
    assert.equal(fresh.engine.dispatch({ type: 'draw' }).ok, true);
    assert.equal(fresh.state().points, 40);

    const old = createHarness({ drawCost: 300, achieveOn: false });
    old.user('u');
    old.ai('a' + blk('积分|+400|x'));
    assert.equal(old.engine.dispatch({ type: 'draw' }).ok, true);
    const raw = old.ctx.chatMetadata.origin_v2;
    delete raw.pv;
    for (const o of raw.ops) delete o.cost;
    old.host.settings = () => ({ ...old.settingsObj, drawCost: 60 });
    old.reopen();
    assert.equal(old.state().shop.find((x) => x.name === '回溯券').price, 1200);
    assert.equal(old.state().points, 100);
});
