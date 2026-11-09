import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createOriginStore } from '../src/data/shujuku/origin-store.js';
import { createLedger, serializeLedger, setEntry, makeEntry } from '../src/scene/origin/origin-ledger.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';

async function setup() {
    const host = createLedgerMockHost();
    host.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: host.api });
    assert.equal((await tables.ensure()).ok, true);
    return { host, tables, store: createOriginStore({ tables }) };
}

test('Origin数据库：按差分追加、读回确认、同笔重试不重复，重建写口可恢复', async () => {
    const h = await setup();
    const initial = h.store.read();
    assert.equal(initial.ok, true);
    assert.equal(initial.raw, null);
    const ledger = createLedger('c');
    setEntry(ledger, 1, 0, makeEntry('积分|+30|委托', '正文', 7));
    const raw = serializeLedger(ledger);
    const intent = h.store.prepare(initial, raw);
    assert.equal(intent.ok, true);
    assert.equal((await h.store.commit(intent)).ok, true);
    const count = h.host.calls.insertRow;
    assert.equal((await h.store.commit(intent)).ok, true);
    assert.equal(h.host.calls.insertRow, count);
    assert.deepEqual(createOriginStore({ tables: h.tables }).read().raw, raw);
});

test('数据库引擎：购买用共享积分，写失败不发货，重试同笔后重开不重复扣款', async (t) => {
    const h = await setup();
    const { createHarness, blk } = await import('./origin-host.js');
    const game = createHarness({ achieveOn: false }, { database: () => h.store, wallet: () => 500 });
    t.after(() => game.engine.stop());
    await game.engine.whenSaved();
    game.user(); game.ai('委托完成' + blk('积分|+30|委托'));
    await game.engine.whenSaved();
    assert.equal(game.state().points, 530);
    const insert = h.host.api.insertRow;
    h.host.api.insertRow = () => false;
    const result = await game.engine.dispatch({ type: 'buy', name: '凝神丹' });
    assert.equal(result.ok, false);
    assert.equal(game.bag().凝神丹, undefined);
    assert.equal(game.state().points, 530);
    h.host.api.insertRow = insert;
    assert.equal((await game.engine.retrySave()).ok, true);
    assert.equal(game.bag().凝神丹, 1);
    assert.equal(game.state().points, 330);
    game.reopen();
    await game.engine.whenSaved();
    assert.equal(game.state().points, 330);
    assert.equal(game.bag().凝神丹, 1);
});

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
    await check(-170);
    game.newSwipe(first, '第二版本' + blk('积分|+10|乙'));
    await check(-190);
    assert.equal(game.bag().凝神丹, 1);
    game.selectSwipe(first, 0);
    await check(-170);
    game.user(); game.ai('后续收入' + blk('积分|+7|丙'));
    await check(-163);
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

test('数据库底稿：折叠、底稿前删楼及重开保留净流水，不重复发放', async (t) => {
    const h = await setup();
    const { createHarness, blk } = await import('./origin-host.js');
    const { originPointsOf } = await import('../src/scene/origin/origin-log.js');
    const game = createHarness({ achieveOn: false, keepFloors: 3 }, { database: () => h.store, wallet: () => 500 });
    t.after(() => game.engine.stop());
    await game.engine.whenSaved();
    for (let i = 0; i < 18; i += 1) {
        game.user(); game.ai(`第${i}段` + blk('积分|+10|委托'));
        await game.engine.whenSaved();
    }
    const saved = h.store.read().raw;
    assert.ok(saved.base?.floor > 0);
    assert.ok(saved.entries.length <= 13);
    assert.equal(originPointsOf(h.store.read(), game.ctx.chat).balance, 180);
    const floor = saved.base.floor;
    game.ctx.chat.splice(2, 1); game.emit('msg_deleted', game.ctx.chat.length);
    await game.engine.whenSaved();
    assert.equal(h.store.read().raw.base.floor, floor - 1);
    assert.equal(game.state().points, 680);
    game.reopen(); await game.engine.whenSaved();
    assert.equal(game.state().points, 680);
    game.removeLast(); await game.engine.whenSaved();
    assert.equal(game.state().points, 670);
    assert.equal(originPointsOf(h.store.read(), game.ctx.chat).balance, 170);
});

test('旧存档首次入库：只导入一次，原metadata保留，绝对余额操作不生效', async (t) => {
    const h = await setup();
    const { createHarness, blk } = await import('./origin-host.js');
    const game = createHarness({ achieveOn: false, keepFloors: 0 });
    t.after(() => game.engine.stop());
    game.user(); game.ai('旧收入' + blk('积分|+100|委托'));
    const old = game.ctx.chatMetadata.origin_v2;
    old.entries[0].ops.push({ k: 'balance', v: 9999 });
    old.entries[0].facts.bal = 8888;
    const backup = JSON.stringify(old);
    game.engine.stop();
    game.host.database = () => h.store;
    game.host.wallet = () => 500;
    game.reopen();
    await game.engine.whenSaved();
    assert.equal(game.engine.isBlocked(), null);
    assert.equal(game.state().points, 600);
    assert.equal(JSON.stringify(game.ctx.chatMetadata.origin_v2), backup);
    assert.equal((await game.engine.dispatch({ type: 'buy', name: '凝神丹' })).ok, true);
    assert.equal(game.state().points, 400);
    const revision = h.store.read().revision;
    game.reopen(); await game.engine.whenSaved();
    assert.equal(game.state().points, 400);
    assert.equal(game.bag().凝神丹, 1);
    assert.equal(h.store.read().revision, revision);
    assert.equal(JSON.stringify(game.ctx.chatMetadata.origin_v2), backup);
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

test('数据库提示词：同步事件当轮注入已确认操作，绑定异步保存且不重复扣款', async (t) => {
    const h = await setup();
    const { createHarness } = await import('./origin-host.js');
    const game = createHarness({ achieveOn: false }, { database: () => h.store, wallet: () => 500 });
    t.after(() => game.engine.stop());
    await game.engine.whenSaved();
    game.user(); game.ai('正文');
    await game.engine.whenSaved();
    assert.equal((await game.engine.rpChatCall('交付暗号')).ok, true);
    const target = game.user();
    const injected = game.injected();
    assert.match(injected, /交付暗号/, '宿主不等待事件Promise时，本轮请求也必须已含注入');
    await game.engine.whenSaved();
    const saved = h.store.read().raw.ops.find((rec) => rec.op.type === 'chatCall');
    assert.equal(saved.boundTo, target);
    assert.equal(game.state().points, 500);
});

test('数据库队列：连续到达两楼均入库，失败后追加消息可按序恢复', async (t) => {
    const h = await setup();
    const { createHarness, blk } = await import('./origin-host.js');
    const game = createHarness({ achieveOn: false, keepFloors: 0 }, { database: () => h.store, wallet: () => 500 });
    t.after(() => game.engine.stop());
    await game.engine.whenSaved();
    game.user(); game.ai('第一笔' + blk('积分|+30|甲'));
    game.user(); game.ai('第二笔' + blk('积分|+7|乙'));
    await game.engine.whenSaved();
    assert.equal(game.state().points, 537, '连续到达不能漏掉第一楼');
    assert.equal(h.store.read().raw.entries.length, 2);
    const insert = h.host.api.insertRow;
    h.host.api.insertRow = () => false;
    game.user(); game.ai('第三笔' + blk('积分|+11|丙'));
    await game.engine.whenSaved();
    assert.ok(game.engine.isBlocked());
    game.user(); game.ai('第四笔' + blk('积分|+13|丁'));
    await game.engine.whenSaved();
    h.host.api.insertRow = insert;
    const recovered = await game.engine.retrySave();
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    await game.engine.whenSaved();
    assert.equal(game.state().points, 561);
    assert.equal(h.store.read().raw.entries.length, 4);
    game.reopen(); await game.engine.whenSaved();
    assert.equal(game.state().points, 561);
});

test('数据库队列：并发重试同一意图只发布一次事件与通知', async (t) => {
    const h = await setup();
    const { createHarness } = await import('./origin-host.js');
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
    const results = await Promise.all([game.engine.retrySave(), game.engine.retrySave()]);
    assert.ok(results.every((result) => result.ok), JSON.stringify(results));
    assert.equal(events.filter((event) => event.type === 'op').length, 1);
    assert.equal(game.notes.filter((note) => note.kind === 'gacha').length, 1);
    assert.equal(game.state().points, 200);
    assert.equal(h.store.read().raw.ops.length, 1);
});

test('数据库分支恢复：失败后切换swipe或删楼可解除旧意图，不发布旧分支奖励', async (t) => {
    const { createHarness, blk } = await import('./origin-host.js');
    for (const outcome of ['unwritten', 'partial', 'unconfirmed']) {
      for (const change of ['swipe', 'delete']) {
        await t.test(`${outcome}:${change}`, async (t) => {
            const h = await setup();
            const tables = createCombatTables({ api: h.host.api, cellMax: 120 });
            const store = createOriginStore({ tables });
            let fail = false;
            const database = { ...store, commit: async (intent, options) => {
                const result = await store.commit(intent, options);
                return fail && outcome === 'unconfirmed' && result.ok
                    ? { ok: false, reason: 'origin-database-write-unverified' } : result;
            } };
            const game = createHarness({ achieveOn: false, keepFloors: 0 }, { database: () => database, wallet: () => 500 });
            t.after(() => game.engine.stop());
            await game.engine.whenSaved();
            const insert = h.host.api.insertRow;
            fail = true;
            h.host.api.insertRow = (...args) => {
                const cells = typeof args[0] === 'object' ? args[0].data : args[1];
                if (outcome === 'unwritten' || (outcome === 'partial' && String(cells?.['分段']).startsWith('2/'))) return false;
                return insert(...args);
            };
            game.user(); const floor = game.ai('旧分支' + blk('积分|+30|旧', '获得|旧奖励|1', '播报|旧分支已结算'));
            await game.engine.whenSaved();
            assert.ok(game.engine.isBlocked());
            assert.equal(game.bag().旧奖励, undefined);
            if (change === 'swipe') game.newSwipe(floor, '新分支' + blk('积分|+7|新'));
            else game.removeLast();
            await game.engine.whenSaved();
            h.host.api.insertRow = insert;
            fail = false;
            const recovered = await game.engine.retrySave();
            assert.equal(recovered.ok, true, JSON.stringify(recovered));
            await game.engine.whenSaved();
            assert.equal(game.engine.isBlocked(), null);
            assert.equal(game.state().points, change === 'swipe' ? 507 : 500);
            assert.equal(game.bag().旧奖励, undefined);
            assert.equal(game.notes.some((note) => note.kind === 'broadcast' && note.text.includes('旧分支已结算')), false);
            assert.equal((await game.engine.dispatch({ type: 'addItem', name: '后续物品' })).ok, true);
            game.reopen(); await game.engine.whenSaved();
            assert.equal(game.state().points, change === 'swipe' ? 507 : 500);
            assert.equal(game.bag().旧奖励, undefined);
        });
      }
    }
});
