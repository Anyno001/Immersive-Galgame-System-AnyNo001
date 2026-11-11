import test from 'node:test';
import assert from 'node:assert/strict';
import { blk, createHarness } from './origin-host.js';
import { fillSettings } from '../src/scene/origin/origin-state.js';

const TASKLINE = '新任务|类型:主线|标题:找猫|描述:d|条件:c|奖励:积分20|惩罚:|时限:|对象:宿主';

test('收块：块原文存 message.extra.origin，正文剪掉块；通知走 host.notify', () => {
    const h = createHarness();
    h.user('u');
    const i = h.ai('正文。\n' + blk(TASKLINE, '播报|欢迎'));
    const m = h.ctx.chat[i];
    assert.equal(m.mes, '正文。');
    assert.equal(m.swipes[0], '正文。');
    assert.match(m.extra.origin.blocks[0], /新任务\|类型:主线/);
    assert.deepEqual(h.notes.map((n) => n.kind), ['task-new', 'broadcast']);
    assert.equal(h.state().tasks[0].floor, 1, '记录带楼号');
    assert.equal(h.engine.lastFloorStatus().has, true);
    const n = createHarness();
    n.user('u'); n.ai('x' + blk('无'));
    assert.deepEqual(n.engine.lastFloorStatus(), { has: false, lines: 0, wroteNone: true });
});

test('存档：重开后状态一致；格式非法或版本更新时拒收，不覆盖原数据', () => {
    const h = createHarness();
    h.user('u'); h.ai('a' + blk(TASKLINE, '技能|夜视|x'));
    h.engine.dispatch({ type: 'setWorld', value: '雨城' });
    const before = JSON.stringify(h.state());
    h.reopen();
    assert.equal(JSON.stringify(h.engine.getState()), before);
    assert.equal(h.engine.getState().world, '雨城');
    const bad = createHarness();
    bad.ctx.chatMetadata.origin_v2 = { version: 99, entries: [], ops: [] };
    bad.engine.reload();
    assert.equal(bad.engine.isBlocked(), 'origin-save-newer');
    assert.deepEqual(bad.engine.dispatch({ type: 'addItem', name: 'x' }), { ok: false, reason: 'origin-save-newer' });
    assert.equal(bad.ctx.chatMetadata.origin_v2.version, 99, '原数据没被覆盖');
});

test('旧存档导入：检测 chatMetadata.origin 与楼层 originBlocks，按楼重建，不覆盖原数据，只提示一次', () => {
    const h = createHarness();
    h.user('u');
    const m = { ...h.ctx.chat[0] };
    h.ctx.chat.push({ name: 'Bot', is_user: false, is_system: false, mes: '她笑了。', swipe_id: 0, swipes: ['她笑了。'], extra: { originBlocks: { 0: '积分|+30|旧存档\n获得|旧剑|1' } } });
    const legacy = { world: '旧世界', direction: '复仇', skills: [{ name: '旧技', desc: '', turn: 1 }], shop: [{ name: '旧货', price: 10, desc: '', effect: '' }] };
    h.ctx.chatMetadata.origin = legacy;
    assert.ok(m);
    assert.equal(h.engine.legacyDetected(), true);
    const r = h.engine.importLegacy();
    assert.deepEqual({ ok: r.ok, floors: r.floors }, { ok: true, floors: 1 });
    const s = h.state();
    assert.equal(s.points, 30);
    assert.deepEqual(h.bag(), { 旧剑: 1 });
    assert.equal(s.world, '旧世界');
    assert.equal(s.direction, '复仇');
    assert.deepEqual(s.skills.map((k) => k.name), ['旧技']);
    assert.equal(h.ctx.chatMetadata.origin, legacy, '原插件数据原样保留');
    assert.equal(h.engine.legacyDetected(), false);
});

