import test from 'node:test';
import assert from 'node:assert/strict';
import { blk, createHarness } from './origin-host.js';
import { fillSettings } from '../src/scene/origin/origin-state.js';
import { getSharedOriginEngine, ORIGIN_ENGINE_SYMBOL } from '../src/scene/origin/origin-engine.js';
import { createOriginRuntime } from '../src/core/origin-runtime.js';
import { renderOriginBody } from '../src/visual/igs-ui/origin-panel-view.js';
import { runOriginAction } from '../src/visual/igs-ui/origin-panel-actions.js';

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

test('共享引擎生命周期：最后宿主释放后重新创建，重复释放不影响新实例', t => {
    const savedHub = globalThis[ORIGIN_ENGINE_SYMBOL];
    delete globalThis[ORIGIN_ENGINE_SYMBOL];
    const h = createHarness();
    h.engine.stop();
    const first = getSharedOriginEngine(h.host);
    const peer = getSharedOriginEngine({ ...h.host });
    let next, rejoined;
    t.after(() => {
        first.release(); peer.release(); next?.release(); rejoined?.release();
        if (savedHub) globalThis[ORIGIN_ENGINE_SYMBOL] = savedHub;
        else delete globalThis[ORIGIN_ENGINE_SYMBOL];
    });
    first.start();
    const original = globalThis[ORIGIN_ENGINE_SYMBOL].engine;
    first.release();
    assert.equal(globalThis[ORIGIN_ENGINE_SYMBOL].engine, original);
    rejoined = getSharedOriginEngine(h.host);
    first.release();
    assert.ok(globalThis[ORIGIN_ENGINE_SYMBOL].hosts.includes(h.host));
    rejoined.release();
    peer.release();
    assert.equal(globalThis[ORIGIN_ENGINE_SYMBOL], undefined);
    next = getSharedOriginEngine(h.host);
    next.start();
    assert.notEqual(globalThis[ORIGIN_ENGINE_SYMBOL].engine, original);
    const active = globalThis[ORIGIN_ENGINE_SYMBOL];
    peer.release();
    assert.equal(globalThis[ORIGIN_ENGINE_SYMBOL], active);
    assert.equal(next.sync().attached, true);
});

const deferredOrigin = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const settleOriginGeneration = async () => {
    for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve));
};

test('Origin慢请求超过60秒仍单飞，失败不自动重发，明确重试才新建请求', async t => {
    const h = createHarness();
    t.after(() => h.engine.stop());
    const replies = [deferredOrigin(), deferredOrigin()];
    let calls = 0;
    h.generateImpl = () => replies[calls++].promise;
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const first = h.engine.genTask();
    await settleOriginGeneration();
    t.mock.timers.tick(60001);
    assert.equal((await h.engine.genTask()).reason, 'busy');
    assert.equal(calls, 1);
    assert.ok(h.notes.some(n => n.text.includes('同一次请求')));
    replies[0].reject(Error('模型失败'));
    assert.equal((await first).ok, false);
    assert.equal(calls, 1);
    const retry = h.engine.genTask();
    assert.equal((await h.engine.genTask()).reason, 'busy');
    await settleOriginGeneration();
    replies[1].resolve(TASKLINE);
    assert.equal((await retry).ok, true);
    assert.equal(calls, 2);
    assert.equal(h.state().tasks.length, 1);
});

test('Origin迟到成功和失败在聊天往返、API替换、停止和重载后不保存或通知', async t => {
    for (const mode of ['chat', 'api', 'stop', 'reload']) {
        for (const outcome of ['success', 'failure']) await t.test(`${mode}-${outcome}`, async t => {
            let identity = {};
            const h = createHarness({}, { generationIdentity: () => identity });
            t.after(() => h.engine.stop());
            const reply = deferredOrigin();
            h.generateImpl = () => reply.promise;
            const first = h.engine.genTask();
            await settleOriginGeneration();
            if (mode === 'chat') {
                h.ctx.chatId = 'chat-b'; h.emit('chat_changed');
                h.ctx.chatId = 'chat-a'; h.emit('chat_changed');
            } else if (mode === 'api') identity = {};
            else if (mode === 'stop') h.engine.stop();
            else h.engine.reload();
            const saved = h.saves, notes = h.notes.length;
            if (outcome === 'success') reply.resolve(TASKLINE);
            else reply.reject(Error('迟到失败'));
            assert.equal((await first).reason, 'request-stale');
            assert.equal(h.saves, saved);
            assert.equal(h.notes.length, notes);
            assert.equal(h.state().tasks.length, 0);
        });
    }
});

test('Origin系统对话失败后冷重建：按持久化提问标识重试，不重复提问或奖励', async t => {
    const h = createHarness();
    t.after(() => h.engine.stop());
    let calls = 0;
    h.generateImpl = async () => { calls += 1; throw Error('fixture-model-failed'); };
    assert.equal((await h.engine.sysChat('请给我一个提示')).reason, 'origin-generation-failed');
    assert.equal(calls, 1);
    assert.equal(h.state().chat.length, 1);
    const requestId = h.state().chat[0].requestId;
    assert.ok(requestId);
    h.reopen();
    const settings = fillSettings({ enabled: true });
    const dom = new (await import('jsdom')).JSDOM(renderOriginBody('chat', h.state(), settings, {}));
    t.after(() => dom.window.close());
    const button = dom.window.document.querySelector('[data-oa="chat-retry"]');
    assert.equal(button?.getAttribute('data-id'), requestId);
    const reply = deferredOrigin();
    h.generateImpl = () => { calls += 1; return reply.promise; };
    const retry = runOriginAction('chat-retry', button, { engine: h.engine, notice() {} });
    await settleOriginGeneration();
    assert.equal((await h.engine.retrySysChat(requestId)).reason, 'busy');
    assert.equal(calls, 2);
    reply.resolve('沿河寻找。' + blk('积分|+5|提示奖励'));
    assert.equal((await retry).ok, true);
    assert.equal(h.state().chat.filter(row => row.who === 'me').length, 1);
    assert.equal(h.state().chat.find(row => row.who === 'sys').replyTo, requestId);
    const points = h.state().points;
    assert.equal((await h.engine.retrySysChat(requestId)).reason, 'origin-chat-retry-unavailable');
    assert.equal(calls, 2);
    assert.equal(h.state().points, points);
    assert.equal(renderOriginBody('chat', h.state(), settings, {}).includes('data-oa="chat-retry"'), false);
    h.reopen();
    assert.equal(h.state().chat[0].requestId, requestId);
    assert.equal(h.state().chat[1].replyTo, requestId);
    h.generateImpl = async () => { calls += 1; throw Error('fixture-model-failed'); };
    assert.equal((await h.engine.sysChat('请给我一个提示')).ok, false);
    const nextId = h.state().chat.at(-1).requestId;
    assert.notEqual(nextId, requestId, '同样文本的新提问仍是独立操作');
    h.engine.dispatch({ type: 'chatClear' });
    assert.equal((await h.engine.retrySysChat(nextId)).reason, 'origin-chat-retry-unavailable');
    assert.equal(calls, 3);
});

test('Origin宿主路由与模型预设变化拒收迟到成功和失败，不自动重发', async t => {
    for (const mode of ['model', 'secret', 'config', 'profile']) {
        for (const outcome of ['success', 'failure']) await t.test(`${mode}-${outcome}`, async t => {
            const h = createHarness();
            h.engine.stop();
            const reply = deferredOrigin();
            let calls = 0;
            const request = () => { calls += 1; return reply.promise; };
            h.ctx.generateQuietPrompt = request;
            h.ctx.mainApi = 'openai';
            h.ctx.chatCompletionSettings = { custom_model: 'first' };
            h.ctx.getChatCompletionModel = () => h.ctx.chatCompletionSettings.custom_model;
            h.ctx.eventTypes = { ...h.ctx.eventTypes, SECRET_ROTATED: 'secret_rotated' };
            let llm = { source: 'openai', endpoint: 'https://fixture.invalid/v1', model: 'first', apiKey: 'fixture-key' };
            let profiles = [{ id: 'chosen', kind: 'llm', values: { 'bridge.autoIllustration.llm.model': 'profile-first' } }];
            const settings = { enabled: true, route: mode === 'config' || mode === 'profile' ? 'llm' : 'tavern',
                llmProfile: mode === 'profile' ? 'chosen' : '' };
            const runtime = createOriginRuntime({ getContext: () => h.ctx, readSettings: () => settings,
                readLlm: () => llm, readProfiles: async () => structuredClone(profiles),
                secondaryLlm: { request }, notice: (kind, text) => h.notes.push({ kind, text }) });
            t.after(() => runtime.destroy());
            runtime.sync();
            const pending = runtime.engine.genTask();
            await settleOriginGeneration();
            assert.equal(calls, 1);
            const before = structuredClone(h.ctx.chatMetadata);
            if (mode === 'model') h.ctx.chatCompletionSettings.custom_model = 'second';
            else if (mode === 'secret') h.emit('secret_rotated');
            else if (mode === 'config') llm = { ...llm, apiKey: 'fixture-key-2' };
            else profiles[0].values['bridge.autoIllustration.llm.model'] = 'profile-second';
            const notes = h.notes.length;
            if (outcome === 'success') reply.resolve(TASKLINE);
            else reply.reject(Error('fixture-late-failure'));
            assert.equal((await pending).reason, 'request-stale');
            assert.deepEqual(h.ctx.chatMetadata, before);
            assert.equal(runtime.engine.getState().tasks.length, 0);
            assert.equal(h.notes.length, notes);
            assert.equal(calls, 1);
        });
    }
});