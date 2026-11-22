import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createOriginStore } from '../src/data/shujuku/origin-store.js';
import { createLedger, serializeLedger, setEntry, makeEntry } from '../src/scene/origin/origin-ledger.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';
import { createHarness, blk } from './origin-host.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { attachOriginEngine } from '../src/visual/igs-ui/origin-attach.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { createOriginRuntime } from '../src/core/origin-runtime.js';
import { createOriginPageController } from '../src/visual/igs-ui/origin-panel.js';
import { JSDOM } from 'jsdom';

async function setup(options) {
    const host = createLedgerMockHost(options);
    host.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: host.api });
    assert.equal((await tables.ensure()).ok, true);
    return { host, tables, store: createOriginStore({ tables }) };
}

test('失败写入隔离：其他数据库操作不补交Origin旧意图，明确重试才提交一次', async () => {
    const h = await setup();
    const raw = serializeLedger(createLedger('c'));
    const intent = h.store.prepare(h.store.read(), raw);
    const insert = h.host.api.insertRow;
    h.host.api.insertRow = () => false;
    assert.equal((await h.store.commit(intent)).ok, false);
    h.host.api.insertRow = insert;
    const other = { id: 'other', type: 'revoke', character: '主角', anchor: null, createdAt: 1, payload: { targetId: 'unused' } };
    const result = await h.tables.append('ledger', [other]);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(h.store.read().raw, null, '其他写入不得补交失败意图');
    assert.equal((await h.store.commit(intent)).ok, true);
    const count = h.host.calls.insertRow;
    assert.equal((await h.store.commit(intent)).ok, true);
    assert.equal(h.host.calls.insertRow, count);
});

test('数据库回放：swipe、删中间楼、重算和重开只派生当前积分，不改外部钱包', async (t) => {
    const h = await setup();
    const { createHarness, blk } = await import('./origin-host.js');
    const { originPointsOf } = await import('../src/scene/origin/origin-log.js');
    const game = createHarness({ achieveOn: false, keepFloors: 0 }, { database: () => h.store, wallet: () => 500 });
    t.after(() => game.engine.stop());
    const check = async (net) => {
        await game.engine.whenSaved();
        assert.equal(game.engine.isBlocked(), null);
        assert.equal(game.state().points, 500 + net);
        assert.equal(originPointsOf(h.store.read(), game.ctx.chat).balance, net);
    };
    await check(0);
    game.user(); const first = game.ai('第一笔' + blk('积分|+30|甲'));
    await check(30);
    assert.equal((await game.engine.dispatch({ type: 'buy', name: '凝神丹' })).ok, true);
    await check(-10);
    game.newSwipe(first, '第二版本' + blk('积分|+10|乙'));
    await check(-30);
    assert.equal(game.bag().凝神丹, 1);
    game.selectSwipe(first, 0);
    await check(-10);
    game.user(); game.ai('后续收入' + blk('积分|+7|丙'));
    await check(-3);
    game.ctx.chat.splice(first, 1); game.emit('msg_deleted', game.ctx.chat.length);
    await check(7);
    assert.equal(game.bag().凝神丹, undefined);
    assert.equal((await game.engine.recalcAll()).ok, true);
    await check(7);
    game.reopen(); await check(7);
    const count = h.host.calls.insertRow;
    game.state(); game.state(); await game.engine.whenSaved();
    assert.equal(h.host.calls.insertRow, count, '读取与memo命中不得写库');
});

test('分段写入中断：余额读取拒绝残缺记录，同一意图重试补齐且不重复提交', async () => {
    const h = await setup();
    const tables = createCombatTables({ api: h.host.api, cellMax: 120 });
    const store = createOriginStore({ tables });
    const before = store.read();
    const intent = store.prepare(before, serializeLedger(createLedger('c')));
    const insert = h.host.api.insertRow;
    let calls = 0;
    h.host.api.insertRow = (...args) => (++calls === 2 ? false : insert(...args));
    assert.equal((await store.commit(intent)).ok, false);
    assert.equal(store.read().ok, false, '不能将已写入但缺段的记录当成空账本');
    h.host.api.insertRow = insert;
    const recovered = await store.commit(intent);
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(recovered.revision, intent.revision);
    assert.deepEqual(recovered.raw, intent.raw);
    const count = h.host.calls.insertRow;
    assert.equal((await store.commit(intent)).ok, true);
    assert.equal(h.host.calls.insertRow, count);
});

test('数据库队列：并发重试同一意图只发布一次事件与通知', async (t) => {
    const h = await setup({ supportCallbacks: true });
    const game = createHarness({ achieveOn: false }, { database: () => h.store, wallet: () => 500 });
    t.after(() => game.engine.stop());
    await game.engine.whenSaved();
    const events = [];
    game.engine.subscribe((state, event) => events.push(event));
    const insert = h.host.api.insertRow;
    h.host.api.insertRow = () => false;
    assert.equal((await game.engine.dispatch({ type: 'draw' })).ok, false);
    assert.equal(game.notes.filter((note) => note.kind === 'gacha').length, 0);
    h.host.api.insertRow = insert;
    const writes = h.host.calls.insertRow;
    h.host.fireTableUpdated();
    await game.engine.whenSaved();
    assert.equal(game.engine.isBlocked() != null, true);
    assert.equal(h.host.calls.insertRow, writes, '表更新不得自动补交失败的消费');
    assert.equal(game.notes.filter((note) => note.kind === 'gacha').length, 0);
    const results = await Promise.all([game.engine.retrySave(), game.engine.retrySave()]);
    assert.ok(results.every((result) => result.ok), JSON.stringify(results));
    assert.equal(events.filter((event) => event.type === 'op').length, 1);
    assert.equal(game.notes.filter((note) => note.kind === 'gacha').length, 1);
    assert.equal(game.state().points, 440);
    assert.equal(h.store.read().raw.ops.length, 1);
});

test('Origin经济读回：损坏凭据拒收并阻止消费，不覆盖数据库原记录', async t => {
    const { economyPlan } = await import('../src/scene/origin/origin-economy.js');
    const { originPointsOf } = await import('../src/scene/origin/origin-log.js');
    const { createHarness } = await import('./origin-host.js');
    const anchor = { floorId: 'floor-a', swipeId: 0 };
    const receipt = { eventId: 0, sourceId: 'source-a', sourceType: 'origin-task', anchor,
        requested: 100, approved: 100, refund: 0, income: 100, amount: 100, reason: '' };
    const cases = [
        ['未知版本', p => { p.version = 99; }],
        ['缺少消费列表', p => { delete p.charges; }],
        ['超额收入', p => { p.receipts[0].income = 101; p.receipts[0].amount = 101; }],
        ['无消费来源的返还', p => { Object.assign(p.receipts[0], { refund: 50, income: 50, approved: 50 }); }],
        ['回执锚点不符', p => { p.receipts[0].anchor = { ...anchor, floorId: 'other' }; }],
    ];
    for (const [name, corrupt] of cases) await t.test(name, async t => {
        const h = await setup({ supportCallbacks: true });
        const ledger = createLedger('chat-a');
        const entry = makeEntry(null, '已确认来源', 1);
        entry.economy = economyPlan('origin:chat-a:test', anchor);
        entry.economy.receipts.push(JSON.parse(JSON.stringify(receipt)));
        corrupt(entry.economy);
        setEntry(ledger, 0, 0, entry);
        const intent = h.store.prepare(h.store.read(), serializeLedger(ledger));
        assert.equal((await h.store.commit(intent)).ok, true);
        const original = JSON.stringify(h.store.read().raw);
        const writes = h.host.calls.insertRow;
        assert.deepEqual(originPointsOf(h.store.read(), []), { ok: false, reason: 'origin-economy-invalid' });
        const game = createHarness({ achieveOn: false }, { database: () => h.store, wallet: () => 500 });
        t.after(() => game.engine.stop());
        t.after(() => h.tables.client.dispose());
        await game.engine.whenSaved();
        assert.equal(game.engine.isBlocked(), 'origin-economy-invalid');
        h.host.fireTableUpdated();
        await game.engine.whenSaved();
        assert.equal(game.engine.isBlocked(), 'origin-economy-invalid');
        assert.equal((await game.engine.dispatch({ type: 'draw' })).ok, false);
        assert.equal(JSON.stringify(h.store.read().raw), original);
        assert.equal(h.host.calls.insertRow, writes);
    });
});

test('数据库延迟就绪：自动恢复旧存档、补处理等待楼层，重复通知不重复结算', async t => {
    const h = await setup({ supportCallbacks: true });
    const seed = createHarness({ achieveOn: false }, { database: () => h.store, wallet: () => 500 });
    await seed.engine.whenSaved();
    assert.equal((await seed.engine.dispatch({ type: 'setWorld', value: '原有世界' })).ok, true);
    seed.engine.stop();
    const original = JSON.stringify(h.host.sheets);
    const writes = h.host.calls.insertRow;
    const exported = h.host.api.exportTableAsJson;
    let ready = false;
    h.host.api.exportTableAsJson = () => ready ? exported() : {};
    h.tables.client.invalidate();
    const game = createHarness({ achieveOn: false }, { database: () => h.store, wallet: () => 500 });
    t.after(() => game.engine.stop());
    t.after(() => h.tables.client.dispose());
    await game.engine.whenSaved();
    assert.equal(game.engine.isBlocked(), 'combat-table-not-ready');
    assert.equal(JSON.stringify(h.host.sheets), original);
    assert.equal(h.host.calls.insertRow, writes);
    game.user(); game.ai('等待期间收入' + blk('积分|+7|恢复'));
    await game.engine.whenSaved();
    ready = true;
    h.host.fireTableUpdated(); h.host.fireTableUpdated();
    await game.engine.whenSaved();
    assert.equal(game.engine.isBlocked(), null);
    assert.equal(game.state().world, '原有世界');
    assert.equal(game.state().points, 507);
    const saved = h.host.calls.insertRow;
    h.host.fireTableUpdated();
    await game.engine.whenSaved();
    assert.equal(game.state().points, 507);
    assert.equal(h.host.calls.insertRow, saved);
});

test('数据库恢复监听：关闭时退订，已排队的恢复在停止后不读写', async t => {
    const h = await setup({ supportCallbacks: true });
    const exported = h.host.api.exportTableAsJson;
    let ready = false;
    h.host.api.exportTableAsJson = () => ready ? exported() : {};
    h.tables.client.invalidate();
    const callbacks = new Set();
    const register = h.host.api.registerTableUpdateCallback;
    const unregister = h.host.api.unregisterTableUpdateCallback;
    h.host.api.registerTableUpdateCallback = cb => { callbacks.add(cb); register(cb); };
    h.host.api.unregisterTableUpdateCallback = cb => { callbacks.delete(cb); unregister(cb); };
    const game = createHarness({ achieveOn: false }, { database: () => h.store, wallet: () => 500 });
    t.after(() => game.engine.stop());
    t.after(() => h.tables.client.dispose());
    await game.engine.whenSaved();
    assert.equal(game.engine.isBlocked(), 'combat-table-not-ready');
    assert.equal(callbacks.size, 1);
    ready = true;
    h.host.fireTableUpdated();
    game.engine.stop();
    const before = { ...h.host.calls };
    await game.engine.whenSaved();
    h.host.fireTableUpdated();
    await game.engine.whenSaved();
    assert.equal(callbacks.size, 0);
    assert.deepEqual(h.host.calls, before);
});

test('数据库恢复隔离：切聊天撤销旧恢复与等待楼层，旧通知不触碰新存档', async t => {
    const old = await setup({ supportCallbacks: true });
    const next = await setup({ supportCallbacks: true });
    const exported = old.host.api.exportTableAsJson;
    let ready = false;
    old.host.api.exportTableAsJson = () => ready ? exported() : {};
    old.tables.client.invalidate();
    let active = old.store;
    const game = createHarness({ achieveOn: false }, { database: () => active, wallet: () => 500 });
    t.after(() => { game.engine.stop(); old.tables.client.dispose(); next.tables.client.dispose(); });
    await game.engine.whenSaved();
    assert.equal(game.engine.isBlocked(), 'combat-table-not-ready');
    game.user(); game.ai('旧聊天等待收入' + blk('积分|+7|旧聊天'));
    await game.engine.whenSaved();
    const before = { ...old.host.calls };
    ready = true;
    old.host.fireTableUpdated();
    active = next.store;
    Object.assign(game.ctx, { chatId: 'chat-b', chat: [], chatMetadata: {} });
    game.emit('chat_changed', 'chat-b');
    await game.engine.whenSaved();
    assert.equal(game.engine.isBlocked(), null);
    assert.equal(game.state().points, 500);
    assert.deepEqual(old.host.calls, before);
    const saved = next.host.calls.insertRow;
    old.host.fireTableUpdated();
    await game.engine.whenSaved();
    assert.equal(next.host.calls.insertRow, saved);
    assert.deepEqual(old.host.calls, before);
    game.user(); game.ai('新聊天收入' + blk('积分|+3|新聊天'));
    await game.engine.whenSaved();
    assert.equal(game.state().points, 503);
    assert.equal(old.host.calls.insertRow, 0);
});

test('随身系统设置：数据库恢复后当前页面自动更新，未保存草稿保留，关闭后退订', async t => {
    const h = await setup({ supportCallbacks: true });
    const exported = h.host.api.exportTableAsJson;
    let ready = false;
    h.host.api.exportTableAsJson = () => ready ? exported() : {};
    h.tables.client.invalidate();
    const game = createHarness({ achieveOn: false }, { database: () => h.store, wallet: () => 500 });
    const watching = new Set();
    const subscribe = game.engine.subscribe;
    game.engine.subscribe = listener => {
        watching.add(listener);
        const off = subscribe(listener);
        return () => { watching.delete(listener); off(); };
    };
    const detach = attachOriginEngine(game.engine);
    const ui = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({ bridge: { origin: { enabled: true } }, readerSettings: {} }),
        saveUnifiedSettings: () => ({ ok: true }),
    });
    t.after(() => { ui.destroy(); detach(); game.engine.stop(); h.tables.client.dispose(); });
    await game.engine.whenSaved();
    const opened = ui.openSettings({ page: 'origin' });
    assert.equal(opened.ok, true);
    assert.match(ui.getState().activeSettings.snapshot.html, /combat-table-not-ready/);
    opened.controller.setValue('bridge.origin.keepFloors', 17);
    ready = true;
    h.host.fireTableUpdated();
    await game.engine.whenSaved();
    await Promise.resolve();
    assert.equal(game.engine.isBlocked(), null);
    const restored = ui.getState().activeSettings.snapshot;
    assert.doesNotMatch(restored.html, /combat-table-not-ready/);
    assert.match(restored.html, /本聊天正在运行/);
    assert.equal(restored.draft.bridge.origin.keepFloors, 17);
    assert.equal(watching.size, 1);
    assert.equal(opened.controller.switchPage('dash').ok, true);
    assert.equal(watching.size, 0);
    assert.equal(opened.controller.switchPage('origin').ok, true);
    assert.equal(watching.size, 1);
    const pausing = game.engine.dispatch({ type: 'pause' });
    assert.equal(opened.controller.close().ok, true);
    assert.equal(watching.size, 0);
    await pausing;
    await game.engine.dispatch({ type: 'setWorld', value: '关闭后' });
    await Promise.resolve();
    assert.equal(ui.getState().activeSettings, null);
    const reopened = ui.openSettings({ page: 'origin' });
    assert.equal(reopened.ok, true);
    const fresh = ui.getState().activeSettings;
    assert.equal(watching.size, 1);
    assert.match(fresh.snapshot.html, /本聊天已暂停/);
    assert.equal(reopened.controller.setValue('bridge.origin.keepFloors', 23).ok, true);
    assert.equal(ui.destroy().ok, true);
    assert.equal(watching.size, 0);
});

const settleOrigin = async engine => {
    for (let i = 0; i < 12; i += 1) await new Promise(resolve => setImmediate(resolve));
    await engine.whenSaved();
};

test('生产 Origin runtime：只等共享数据库，读取失败手动恢复且面板保持同源', async t => {
    const h = await setup({ supportCallbacks: true });
    const game = createHarness({ enabled: false });
    game.engine.stop();
    const global = { AutoCardUpdaterAPI: h.host.api };
    const services = createCombatServices({ global, getChatId: () => game.ctx.chatId,
        getChat: () => game.ctx.chat, getWallet: () => 500 });
    const runtime = createOriginRuntime({ getContext: () => game.ctx, readSettings: () => ({ enabled: true }),
        readLlm: () => ({}), combatServices: services, notice: (kind, text) => game.notes.push({ kind, text }) });
    const dom = new JSDOM('<div id="overlay"></div>');
    const panel = createOriginPageController(dom.window.document);
    t.after(() => { panel.dispose(); dom.window.close(); runtime.destroy(); services.dispose(); h.tables.client.dispose(); });
    const exported = h.host.api.exportTableAsJson;
    let loaded = false;
    h.host.api.exportTableAsJson = () => loaded ? exported() : {};
    const imports = h.host.calls.importTemplateFromData;
    runtime.sync();
    await settleOrigin(runtime.engine);
    assert.equal(runtime.engine.recoveryStatus().status, 'waiting');
    assert.equal(h.host.calls.importTemplateFromData, imports);
    assert.equal(game.notes.length, 0);
    panel.open(dom.window.document.querySelector('#overlay'));
    assert.match(dom.window.document.body.textContent, /等待本聊天数据库就绪/);
    assert.ok(dom.window.document.querySelector('[data-oa="retry-read"]'));
    loaded = true;
    for (let i = 0; i < 5; i += 1) h.host.fireTableUpdated();
    await settleOrigin(runtime.engine);
    assert.equal(runtime.engine.isBlocked(), null);
    assert.equal(runtime.engine.getState().points, 500);
    assert.equal(dom.window.document.querySelector('[data-oa="retry-read"]'), null);
    h.host.api.exportTableAsJson = () => { throw Error('fixture-read-error'); };
    h.host.fireTableUpdated();
    await settleOrigin(runtime.engine);
    const failed = await runtime.engine.retryRead();
    assert.equal(failed.stage, 'read');
    assert.equal(runtime.engine.recoveryStatus().status, 'failed');
    assert.match(dom.window.document.body.textContent, /读取失败/);
    h.host.api.exportTableAsJson = exported;
    h.host.fireTableUpdated();
    await settleOrigin(runtime.engine);
    assert.equal(runtime.engine.recoveryStatus().status, 'failed', '实际失败不随通知自动重读');
    const first = runtime.engine.retryRead();
    assert.equal(runtime.engine.retryRead(), first);
    assert.equal((await first).ok, true);
    assert.equal(runtime.engine.getState().points, 500);
});

test('读取重试无通知也可恢复，读取中换聊天不发布旧状态', async t => {
    const h = await setup();
    const exported = h.host.api.exportTableAsJson;
    let loaded = false;
    h.host.api.exportTableAsJson = () => loaded ? exported() : {};
    h.tables.client.invalidate();
    const game = createHarness({}, { database: () => h.store, wallet: () => 500 });
    t.after(() => { game.engine.stop(); h.tables.client.dispose(); });
    await game.engine.whenSaved();
    assert.equal(game.engine.recoveryStatus().canRetryRead, true);
    loaded = true;
    let release;
    const load = h.store.load;
    h.store.load = async options => { await new Promise(resolve => { release = resolve; }); return load(options); };
    const first = game.engine.retryRead();
    assert.equal(game.engine.retryRead(), first);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(game.engine.recoveryStatus().busy, true);
    h.store.load = load;
    game.ctx.chatId = 'chat-b';
    game.ctx.chat = [];
    game.ctx.chatMetadata = {};
    game.emit('chat_changed', 'chat-b');
    release();
    assert.equal((await first).reason, 'request-stale');
    await game.engine.whenSaved();
    assert.equal(game.engine.isBlocked(), null);
    assert.equal(game.state().points, 500);
});

test('保存失败的原意图和等待楼层保留，读取与通知不补交，双击保存单飞', async t => {
    const h = await setup({ supportCallbacks: true });
    const game = createHarness({ achieveOn: false }, { database: () => h.store, wallet: () => 500 });
    t.after(() => { game.engine.stop(); h.tables.client.dispose(); });
    await game.engine.whenSaved();
    const insert = h.host.api.insertRow;
    h.host.api.insertRow = () => false;
    assert.equal((await game.engine.dispatch({ type: 'draw' })).ok, false);
    assert.equal(game.engine.recoveryStatus().canRetrySave, true);
    assert.equal((await game.engine.retryRead()).reason, 'origin-save-pending');
    assert.equal((await game.engine.reload()).reason, 'origin-save-pending');
    game.user(); game.ai('等待期间收入' + blk('积分|+7|恢复'));
    await game.engine.whenSaved();
    h.host.api.insertRow = insert;
    const writes = h.host.calls.insertRow;
    h.host.fireTableUpdated();
    await settleOrigin(game.engine);
    assert.equal(h.host.calls.insertRow, writes);
    const first = game.engine.retrySave();
    assert.equal(game.engine.retrySave(), first);
    assert.equal((await first).ok, true);
    await game.engine.whenSaved();
    assert.equal(game.state().points, 447);
    assert.equal(game.notes.filter(note => note.kind === 'gacha').length, 1);
    assert.equal(game.engine.recoveryStatus().canRetrySave, false);
});

test('生成结果保存失败后停止和重载：显式恢复原结果，不重新请求模型', async t => {
    const h = await setup({ supportCallbacks: true });
    const game = createHarness({}, { database: () => h.store, wallet: () => 500 });
    t.after(() => { game.engine.stop(); h.tables.client.dispose(); });
    await game.engine.whenSaved();
    let requests = 0;
    game.generateImpl = async () => { requests += 1; return '新任务|类型:主线|标题:找猫|描述:d|条件:c|奖励:积分20|惩罚:|时限:|对象:宿主'; };
    const insert = h.host.api.insertRow;
    h.host.api.insertRow = () => false;
    assert.equal((await game.engine.genTask()).ok, false);
    assert.equal(game.state().tasks.length, 0);
    game.engine.stop();
    game.engine.start();
    assert.equal((await game.engine.reload()).reason, 'origin-save-pending');
    h.host.api.insertRow = insert;
    const writes = h.host.calls.insertRow;
    h.host.fireTableUpdated();
    await game.engine.whenSaved();
    assert.equal(h.host.calls.insertRow, writes);
    const retry = game.engine.retrySave();
    assert.equal(game.engine.retrySave(), retry);
    assert.equal((await retry).ok, true);
    assert.equal(requests, 1);
    assert.equal(game.state().tasks.filter(task => task.title === '找猫').length, 1);
    assert.equal(game.engine.recoveryStatus().canRetrySave, false);
});

test('保存失败后聊天往返：保留原聊天意图，新聊天零补交，返回后显式恢复', async t => {
    const a = await setup(), b = await setup();
    let active = a.store;
    const game = createHarness({}, { database: () => active, wallet: () => 500 });
    t.after(() => { game.engine.stop(); a.tables.client.dispose(); b.tables.client.dispose(); });
    await game.engine.whenSaved();
    const original = { chatId: game.ctx.chatId, chat: game.ctx.chat, chatMetadata: game.ctx.chatMetadata };
    const insert = a.host.api.insertRow;
    a.host.api.insertRow = () => false;
    assert.equal((await game.engine.dispatch({ type: 'addItem', name: '原结果', count: 1 })).ok, false);
    a.host.api.insertRow = insert;
    const writes = a.host.calls.insertRow;
    active = b.store;
    Object.assign(game.ctx, { chatId: 'chat-b', chat: [], chatMetadata: {} });
    game.emit('chat_changed');
    await game.engine.whenSaved();
    assert.equal(game.bag().原结果, undefined);
    assert.equal(game.engine.recoveryStatus().canRetrySave, false);
    assert.equal(a.host.calls.insertRow, writes);
    active = a.store;
    Object.assign(game.ctx, original);
    game.emit('chat_changed');
    await game.engine.whenSaved();
    assert.equal(a.host.calls.insertRow, writes);
    assert.equal(game.engine.recoveryStatus().canRetrySave, true);
    assert.equal((await game.engine.retrySave()).ok, true);
    assert.equal(game.bag().原结果, 1);
    assert.equal(b.store.read().raw.ops.length, 0);
});

test('P7 v2 独立表：数值与战斗关闭时 Origin 独立恢复和保存，不建战斗/数值表，未接入共享积分前拒收经济操作', async t => {
    const { createIgsChatStore } = await import('../src/data/shujuku/igs-chat-store.js');
    const { IGS_TABLE_SPECS } = await import('../src/data/shujuku/igs-table-specs.js');
    const { COMBAT_TABLE_SPECS } = await import('../src/data/shujuku/combat-tables.js');
    const { readIgsChatEvidence } = await import('../src/storage/igs-chat-evidence.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const host = createLedgerMockHost({ supportCallbacks: true });
    host.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const game = createHarness({ enabled: false });
    game.engine.stop();
    let currentApi = host.api;
    const chatStore = createIgsChatStore({
        api: () => currentApi,
        chatId: () => game.ctx.chatId,
        chat: () => game.ctx.chat,
        storage,
        evidence: chatId => readIgsChatEvidence({ context: game.ctx, chatId, storage }),
    });
    const runtime = createOriginRuntime({
        getContext: () => game.ctx,
        readSettings: () => ({ enabled: true, achieveOn: false }),
        readLlm: () => ({}),
        chatStore,
        notice: (kind, text) => game.notes.push({ kind, text }),
    });
    t.after(() => { runtime.destroy(); chatStore.dispose(); });
    runtime.sync();
    await settleOrigin(runtime.engine);
    assert.equal(runtime.engine.isBlocked(), null);
    assert.equal(chatStore.get().layout().layout, 'v2');
    assert.ok(host.sheets[IGS_TABLE_SPECS.origin.uid], 'v2 Origin 独立表应已建立');
    assert.equal(host.sheets[COMBAT_TABLE_SPECS.profile.uid], undefined, '不得建立战斗档案表');
    assert.equal(host.sheets[COMBAT_TABLE_SPECS.ledger.uid], undefined, '不得建立战斗日志表');
    assert.equal(host.sheets[IGS_TABLE_SPECS.stats.uid], undefined, '不得建立数值日志表');
    // 非经济操作独立读写
    assert.equal((await runtime.engine.dispatch({ type: 'setWorld', value: 'v2独立世界' })).ok, true);
    assert.equal((await runtime.engine.dispatch({ type: 'addItem', name: '独立手札', count: 2 })).ok, true);
    assert.equal(runtime.engine.getState().world, 'v2独立世界');
    assert.equal(runtime.engine.getState().bag.find(i => i.name === '独立手札')?.count, 2);
    // 未接入共享积分前，v2 经济操作明确返回未就绪，不降级覆盖旧余额也不阻塞引擎
    assert.equal((await runtime.engine.dispatch({ type: 'draw' })).reason, 'igs-points-not-integrated');
    assert.equal((await runtime.engine.dispatch({ type: 'buy', name: '凝神丹' })).reason, 'igs-points-not-integrated');
    assert.equal(runtime.engine.isBlocked(), null);
    assert.equal(runtime.engine.getState().points, 0);
    // 冷重建与 API 替换：销毁重建后仍从 v2 独立表冷读回
    runtime.destroy();
    const replacedHost = createLedgerMockHost({ supportCallbacks: true });
    Object.assign(replacedHost.sheets, JSON.parse(JSON.stringify(host.sheets)));
    currentApi = replacedHost.api;
    const runtime2 = createOriginRuntime({
        getContext: () => game.ctx,
        readSettings: () => ({ enabled: true, achieveOn: false }),
        readLlm: () => ({}),
        chatStore,
        notice: (kind, text) => game.notes.push({ kind, text }),
    });
    t.after(() => runtime2.destroy());
    runtime2.sync();
    await settleOrigin(runtime2.engine);
    assert.equal(runtime2.engine.isBlocked(), null);
    assert.equal(runtime2.engine.getState().world, 'v2独立世界');
    assert.equal(runtime2.engine.getState().bag.find(i => i.name === '独立手札')?.count, 2);
});