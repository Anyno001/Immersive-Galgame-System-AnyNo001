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
        const h = await setup();
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
        await game.engine.whenSaved();
        assert.equal(game.engine.isBlocked(), 'origin-economy-invalid');
        assert.equal((await game.engine.dispatch({ type: 'draw' })).ok, false);
        assert.equal(JSON.stringify(h.store.read().raw), original);
        assert.equal(h.host.calls.insertRow, writes);
    });
});
