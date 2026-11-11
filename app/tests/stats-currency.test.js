import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createCachedTableClient, createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createInventoryTables } from '../src/data/shujuku/inventory-tables.js';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { chatEntries, diffChatRecords, initRecord, mergeStatLog } from '../src/scene/stats/stat-log.js';
import { currencyBalanceOf, currencyForPoints, normalizeCurrencyRecord, parseCurrencyReply } from '../src/scene/stats/stat-currency.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';

const prices = { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 };
const reply = (extra = {}) => JSON.stringify({ name: '铜钱', initial: 100, prices, rate: 0.25, ...extra });
const clone = (v) => JSON.parse(JSON.stringify(v));
const events = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', MESSAGE_UPDATED: 'upd', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', CHAT_CHANGED: 'chat' };

async function setup({ request = () => reply(), beforeStart = null, noInventory = false, push = false } = {}) {
    const host = createLedgerMockHost();
    host.sheets.sheet_userbag = userInventorySheet();
    if (push) {
        host.sheets.sheet_main = { uid: 'sheet_main', name: '主角信息表', content: [['row_id', '姓名', '积分', '铜钱'], ['1', '阿明', '500', '0']] };
        host.api.updateCell = (tableName, rowIndex, column, value) => host.api.updateRow(tableName, rowIndex, { [column]: value });
    }
    const client = createCachedTableClient({ api: host.api });
    const raw = createCombatTables({ api: host.api, client });
    assert.equal((await raw.ensure()).ok, true);
    if (noInventory) {
        delete host.sheets.sheet_userbag;
        client.invalidate();
    }
    const inventory = createInventoryTables({ api: host.api, client, serial: raw.serial });
    if (!noInventory) assert.equal((await inventory.ensure()).ok, true);
    const handlers = new Map();
    const source = {
        on(k, fn) { if (!handlers.has(k)) handlers.set(k, new Set()); handlers.get(k).add(fn); },
        removeListener(k, fn) { handlers.get(k)?.delete(fn); },
        emit(k, ...args) { return Promise.all([...(handlers.get(k) || [])].map((fn) => fn(...args))); },
    };
    const ctx = { name1: '阿明', name2: '小雪', chat: [{ is_user: false, mes: '古城开场', swipe_id: 0 }], chatMetadata: {}, eventSource: source, eventTypes: events, chatId: 'c', getCurrentChatId() { return this.chatId; } };
    const statsTables = () => ({ ok: true, get version() { return client.version(); }, read: (opts) => raw.read(opts), append: (rows, opts) => raw.append('stats', rows, opts), ensure: () => raw.ensure() });
    const rt = createStatsRuntime({ getContext: () => ctx, statsTables, currencyInventory: () => inventory, getPushClient: () => createShujukuClient(host.api), readSettings: () => ({ enabled: true, ruleset: 'coc7', sheetGen: 'off', backfill: 'off', push: { enabled: push } }), getBackgroundRequest: () => request, worldviewOf: () => 'ancient' });

    const h = { host, client, raw, inventory, ctx, source, rt, statsTables };
    if (beforeStart) await beforeStart(h);
    rt.sync();
    rt.enableForChat({ initial: createStatsState({ money: 500 }) });
    await rt.whenSaved();
    h.balance = () => currencyBalanceOf(inventory.read(), '铜钱').balance;
    h.config = () => mergeStatLog(raw.read({ kinds: ['stats'] }).stats, { chatId: ctx.chatId, chat: ctx.chat }).currency;
    h.generate = async (text) => {
        await source.emit('gs', 'normal', {}, false);
        ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 });
        await source.emit('ge');
        await rt.whenSaved();
        return ctx.chat.length - 1;
    };
    return h;
}

test('货币配置校验与聊天记录往返：档位递增、初始上限、兑换比例和归零标记', () => {
    const parsed = parseCurrencyReply(reply());
    assert.equal(parsed.ok, true);
    for (const extra of [{ name: '超过六个字的货币' }, { name: '积分' }, { initial: 3001 }, { prices: { ...prices, 普通: 7 } }, { rate: 0 }, { rate: 101 }]) {
        assert.equal(parseCurrencyReply(reply(extra)).ok, false);
    }
    const currency = normalizeCurrencyRecord({ ...parsed.config, initial: parsed.initial, seeded: true });
    assert.equal(currencyForPoints(currency, 4), 1);
    const rows = diffChatRecords(chatEntries(), chatEntries({ currency }), { tag: 'currency' });
    const restored = mergeStatLog([initRecord(createStatsState()), ...rows], { chatId: 'c', chat: [] });
    assert.deepEqual(restored.currency, currency);
    assert.equal(restored.currency.seeded, true);
    assert.equal(currencyBalanceOf({ ok: false, reason: 'read-failed' }, '铜钱').ok, false);
    assert.equal(currencyBalanceOf({ ok: true, inventory: { items: [] } }, '铜钱').balance, 0);
});

test('进入聊天判定货币并只发一次初始金额，归零缺行后重入不再发放', async (t) => {
    let requests = 0;
    const h = await setup({ request: () => { requests += 1; return reply(); } });
    t.after(() => h.rt.destroy());
    assert.equal(h.balance(), 100);
    assert.equal(h.config().seeded, true);
    await h.inventory.changeQuantities([{ name: '铜钱', delta: -100 }]);
    await h.source.emit('chat');
    await h.rt.whenSaved();
    assert.equal(h.balance(), 0);
    assert.equal(requests, 1);
    assert.equal(h.rt.walletMoney(), 500);
});

test('首次判定货币时物品表缺失，补建后只发一次初始金额', async (t) => {
    const h = await setup({ noInventory: true });
    t.after(() => h.rt.destroy());
    assert.equal(h.inventory.read().ok, true);
    assert.equal(h.balance(), 100);
    assert.equal(h.config().seeded, true);
    assert.equal(h.rt.walletMoney(), 500);
});


test('货币收入与花费只改物品表；重算写差额，原积分保持不变', async (t) => {
    const h = await setup();
    t.after(() => h.rt.destroy());
    const id = await h.generate('[igs-stat:money|花费|普通]');
    assert.equal(h.balance(), 70);
    assert.equal(h.rt.walletMoney(), 500);
    h.ctx.chat[id].mes = '[igs-stat:money|花费|少量]';
    await h.source.emit('upd', id);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 93);
    const count = h.host.calls.updateRow;
    await h.source.emit('upd', id);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 93);
    assert.equal(h.host.calls.updateRow, count);
    await h.generate('[igs-stat:money|收入|普通]');
    assert.equal(h.balance(), 123);
    await h.generate('[igs-stat:money|花费|巨额]');
    assert.equal(h.balance(), 123);
    assert.equal(h.rt.walletMoney(), 500);
});

test('货币落表后推送最终余额，重算和失败恢复不改积分列', async (t) => {
    const h = await setup({ push: true });
    t.after(() => h.rt.destroy());
    const id = await h.generate('[igs-stat:money|花费|普通]');
    assert.equal(h.balance(), 70);
    assert.equal(h.host.sheets.sheet_main.content[1][3], '70');
    h.ctx.chat[id].mes = '[igs-stat:money|花费|少量]';
    await h.source.emit('upd', id);
    await h.rt.whenSaved();
    assert.equal(h.host.sheets.sheet_main.content[1][3], '93');
    const update = h.host.api.updateRow;
    h.host.api.updateRow = (...args) => args[0]?.tableName === '背包物品表' ? false : update(...args);
    await h.generate('[igs-stat:money|收入|普通]');
    assert.equal(h.host.sheets.sheet_main.content[1][3], '93');
    h.host.api.updateRow = update;
    assert.equal((await h.rt.noticeAction('currency', 'retry')).ok, true);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 123);
    assert.equal(h.host.sheets.sheet_main.content[1][3], '123');
    assert.equal(h.host.sheets.sheet_main.content[1][2], '500');
});

test('早楼收入被后楼消耗后，下调收入不足以补差时保留原结算，不阻塞后续楼', async (t) => {
    const h = await setup();
    t.after(() => h.rt.destroy());
    const id = await h.generate('[igs-stat:money|收入|普通]');
    await h.generate('[igs-stat:money|花费|昂贵]');
    await h.generate('[igs-stat:money|花费|普通]');
    assert.equal(h.balance(), 10);
    h.ctx.chat[id].mes = '[igs-stat:money|收入|少量]';
    await h.source.emit('upd', id);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 10);
    const restored = mergeStatLog(h.raw.read({ kinds: ['stats'] }).stats, { chatId: h.ctx.chatId, chat: h.ctx.chat });
    const prior = [...restored.ledger.entries.values()].find((entry) => entry.messageId === id);
    assert.equal(prior.meta.currency.delta, 30);
    assert.equal(prior.meta.currency.applied, true);
    assert.ok(h.rt.notices().some((notice) => notice.id === 'currency'));
    await h.source.emit('chat');
    await h.rt.whenSaved();
    await h.generate('[igs-stat:money|收入|少量]');
    assert.equal(h.balance(), 17);
    h.ctx.chat[id].mes = '[igs-stat:money|收入|昂贵]';
    await h.source.emit('upd', id);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 77);
    assert.equal(h.rt.walletMoney(), 500);
});

test('无效货币回复最多三次，失败后手动重试才重新请求', async (t) => {
    let requests = 0;
    // 后台请求通道与特质评定共用，只数货币判定的请求。
    const h = await setup({ request: (prompt) => {
        if (!/判定剧情里使用的货币/.test(String(prompt?.system || ''))) return '{}';
        requests += 1;
        return requests <= 3 ? reply({ rate: 101 }) : reply();
    } });
    t.after(() => h.rt.destroy());
    assert.equal(requests, 3);
    assert.equal(h.config(), null);
    assert.equal(h.balance(), 0);
    await h.generate('[igs-stat:money|收入|普通]');
    assert.equal(h.balance(), 0);
    assert.equal(h.rt.walletMoney(), 500);
    const result = await h.rt.noticeAction('currency', 'retry');
    await h.rt.whenSaved();
    assert.equal(result.ok, true);
    assert.equal(requests, 4);
    assert.equal(h.balance(), 100);
});

test('初始金额已写但确认记录失败：重入只补标记，不重复发钱', async (t) => {
    let fail = true;
    const h = await setup({ beforeStart: ({ raw }) => {
        const append = raw.append.bind(raw);
        raw.append = (kind, rows, opts) => fail && rows.some((row) => row.payload?.key === 'chat:currency' && row.payload.value?.seeded)
            ? Promise.resolve({ ok: false, reason: 'fixture-save-failed' }) : append(kind, rows, opts);
    } });
    t.after(() => h.rt.destroy());
    assert.equal(h.balance(), 100);
    assert.equal(h.config().seeded, false);
    fail = false;
    await h.source.emit('chat');
    await h.rt.whenSaved();
    assert.equal(h.balance(), 100);
    assert.equal(h.config().seeded, true);
});

test('物品表写入失败后，下一楼先恢复前笔增量，再结算本楼', async (t) => {
    const h = await setup();
    t.after(() => h.rt.destroy());
    const update = h.host.api.updateRow;
    let reject = true;
    h.host.api.updateRow = (...args) => reject && args[0]?.tableName === '背包物品表' ? false : update(...args);
    await h.generate('[igs-stat:money|花费|普通]');
    assert.equal(h.balance(), 100);
    assert.ok(h.rt.notices().some((n) => n.id === 'currency'));
    reject = false;
    await h.generate('[igs-stat:money|收入|少量]');
    assert.equal(h.balance(), 77);
    const records = h.raw.read({ kinds: ['stats'] }).stats;
    const merged = mergeStatLog(records, { chatId: h.ctx.chatId, chat: h.ctx.chat });
    assert.ok([...merged.ledger.entries.values()].every((entry) => entry.meta.currency.applied));
});

test('楼层写入意图未保存时不改货币；手动重试恢复且只写一次', async (t) => {
    const h = await setup();
    t.after(() => h.rt.destroy());
    const append = h.raw.append.bind(h.raw);
    let reject = true;
    h.raw.append = (kind, rows, opts) => reject && rows.some((row) => row.type === 'floor')
        ? Promise.resolve({ ok: false, reason: 'fixture-save-failed' }) : append(kind, rows, opts);
    await h.generate('[igs-stat:money|花费|普通]');
    assert.equal(h.balance(), 100);
    reject = false;
    assert.equal((await h.rt.noticeAction('currency', 'retry')).ok, true);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 70);
    await h.source.emit('chat');
    await h.rt.whenSaved();
    assert.equal(h.balance(), 70);
});

test('物品表已改但回执返回失败，确认后重试不重复扣款', async (t) => {
    const h = await setup();
    t.after(() => h.rt.destroy());
    const update = h.host.api.updateRow;
    h.host.api.updateRow = (...args) => {
        const result = update(...args);
        return args[0]?.tableName === '背包物品表' ? false : result;
    };
    await h.generate('[igs-stat:money|花费|普通]');
    assert.equal(h.balance(), 70);
    const count = h.host.calls.updateRow;
    await h.source.emit('upd', 1);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 70);
    assert.equal(h.host.calls.updateRow, count);
});

for (const boundary of ['chat', 'swipe', 'delete', 'detach']) {
    test(`货币写表前${boundary}使旧楼请求失效，不开始物品表写入`, { timeout: 5000 }, async (t) => {
        const h = await setup();
        t.after(() => h.rt.destroy());
        let release;
        let entered;
        const gate = new Promise((resolve) => { release = resolve; });
        const waiting = new Promise((resolve) => { entered = resolve; });
        t.after(() => release());
        const ensure = h.inventory.ensure.bind(h.inventory);
        h.inventory.ensure = async (opts) => {
            entered();
            await gate;
            return ensure(opts);
        };
        const updates = h.host.calls.updateRow;
        const generating = h.generate('[igs-stat:money|花费|普通]');
        await waiting;
        if (boundary === 'chat') {
            h.ctx.chatId = 'other';
            h.ctx.chat = [{ is_user: false, mes: '另一个聊天', swipe_id: 0 }];
            await h.source.emit('chat');
        } else if (boundary === 'swipe') {
            h.ctx.chat[1].swipe_id = 1;
            h.ctx.chat[1].mes = '另一个回复';
            await h.source.emit('sw', 1);
        } else if (boundary === 'delete') {
            h.ctx.chat.pop();
            await h.source.emit('del');
        } else h.rt.destroy();
        release();
        await generating;
        assert.equal(h.balance(), 100);
        assert.equal(h.host.calls.updateRow, updates);
    });
}


test('固定支出保存到聊天记录，重入还原；具体金额与支出共用差额且重复结算不重扣', async (t) => {
    const h = await setup();
    t.after(() => h.rt.destroy());
    const expenses = [{ name: '房租', amount: 30, every: 1 }];
    assert.equal((await h.rt.relationOp('expenses-set', '', { expenses })).ok, true);
    await h.rt.whenSaved();
    const restored = mergeStatLog(h.raw.read({ kinds: ['stats'] }).stats, { chatId: h.ctx.chatId, chat: h.ctx.chat });
    assert.deepEqual(restored.catalog.expenses, expenses);
    await h.source.emit('chat');
    await h.rt.whenSaved();
    assert.deepEqual(h.rt.relationOp('expenses-read').expenses, expenses);
    const id = await h.generate('[igs-stat:money|收入|13][igs-stat:sleep]');
    assert.equal(h.balance(), 83);
    assert.equal(h.rt.walletMoney(), 500);
    h.ctx.chat[id].mes = '[igs-stat:money|收入|23][igs-stat:sleep]';
    await h.source.emit('upd', id);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 93);
    const count = h.host.calls.updateRow;
    await h.source.emit('upd', id);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 93);
    assert.equal(h.host.calls.updateRow, count);
});

test('主角手改余额直接写物品表，重入与删楼不回退，也不改积分', async (t) => {
    const h = await setup();
    t.after(() => h.rt.destroy());
    await h.generate('平常的一楼');
    assert.equal((await h.rt.relationOp('money-set', '主角', { value: 321 })).ok, true);
    await h.rt.whenSaved();
    assert.equal(h.balance(), 321);
    assert.equal(h.rt.walletMoney(), 500);
    const count = h.host.calls.updateRow;
    assert.equal((await h.rt.relationOp('money-set', '主角', { value: 321 })).cancelled, true);
    assert.equal(h.host.calls.updateRow, count);
    h.ctx.chat.pop();
    await h.source.emit('del');
    await h.rt.whenSaved();
    await h.source.emit('chat');
    await h.rt.whenSaved();
    assert.equal(h.balance(), 321);
    assert.equal(h.rt.walletMoney(), 500);
    for (const value of [-1, 1.5, null, '12']) assert.equal((await h.rt.relationOp('money-set', '主角', { value })).ok, false);
});

test('货币设置整表校验并保存四档价格，保持货币名与兑换比例，重入后还原', async (t) => {
    const h = await setup();
    t.after(() => h.rt.destroy());
    for (const table of [{ 少量: 7 }, { ...prices, 普通: 7 }, { ...prices, 少量: 0 }, { ...prices, 昂贵: 90.5 }]) {
        assert.equal((await h.rt.relationOp('money-config', '', { table })).ok, false);
        assert.deepEqual(h.config().table, prices);
    }
    const table = { 少量: 10, 普通: 40, 昂贵: 100, 巨额: 400 };
    assert.equal((await h.rt.relationOp('money-config', '', { table, name: '金币', rate: 9 })).ok, true);
    await h.rt.whenSaved();
    assert.deepEqual(h.config().table, table);
    assert.equal(h.config().name, '铜钱');
    assert.equal(h.config().rate, 0.25);
    assert.equal(h.balance(), 100);
    await h.source.emit('chat');
    await h.rt.whenSaved();
    assert.deepEqual(h.rt.relationOp('money-config-read').config, { name: '铜钱', table });
    await h.generate('[igs-stat:money|花费|普通]');
    assert.equal(h.balance(), 60);
    assert.equal(h.rt.walletMoney(), 500);
});

test('货币配置保存失败保持原配置，恢复后可重新提交并回读', async (t) => {
    const h = await setup();
    t.after(() => h.rt.destroy());
    const append = h.raw.append.bind(h.raw);
    let reject = true;
    h.raw.append = (kind, rows, opts) => reject && rows.some((row) => row.payload?.key === 'chat:currency')
        ? Promise.resolve({ ok: false, reason: 'fixture-save-failed' }) : append(kind, rows, opts);
    const table = { 少量: 10, 普通: 40, 昂贵: 100, 巨额: 400 };
    assert.equal((await h.rt.relationOp('money-config', '', { table })).ok, false);
    assert.deepEqual(h.rt.relationOp('money-config-read').config.table, prices);
    assert.deepEqual(h.config().table, prices);
    assert.equal(h.balance(), 100);
    reject = false;
    assert.equal((await h.rt.relationOp('money-config', '', { table })).ok, true);
    await h.rt.whenSaved();
    assert.deepEqual(h.config().table, table);
    assert.equal(h.rt.walletMoney(), 500);
});


for (const op of ['money-config', 'money-set']) {
    test(`${op}先恢复待落账楼层，恢复失败不改配置或余额，重试不重复入账`, async (t) => {
        const h = await setup();
        t.after(() => h.rt.destroy());
        const update = h.host.api.updateRow;
        let reject = true;
        h.host.api.updateRow = (...args) => reject && args[0]?.tableName === '背包物品表' ? false : update(...args);
        await h.generate('[igs-stat:money|花费|普通]');
        assert.equal(h.balance(), 100);
        const table = { 少量: 10, 普通: 40, 昂贵: 100, 巨额: 400 };
        const payload = op === 'money-config' ? { table } : { value: 321 };
        assert.equal((await h.rt.relationOp(op, '主角', payload)).ok, false);
        assert.equal(h.balance(), 100);
        assert.deepEqual(h.config().table, prices);
        reject = false;
        assert.equal((await h.rt.relationOp(op, '主角', payload)).ok, true);
        await h.rt.whenSaved();
        const balance = op === 'money-config' ? 70 : 321;
        assert.equal(h.balance(), balance);
        assert.deepEqual(h.config().table, op === 'money-config' ? table : prices);
        const restored = mergeStatLog(h.raw.read({ kinds: ['stats'] }).stats, { chatId: h.ctx.chatId, chat: h.ctx.chat });
        assert.ok([...restored.ledger.entries.values()].every((entry) => entry.meta.currency.applied));
        const count = h.host.calls.updateRow;
        assert.equal((await h.rt.relationOp(op, '主角', payload)).cancelled, true);
        assert.equal(h.host.calls.updateRow, count);
        await h.generate('[igs-stat:money|收入|13]');
        assert.equal(h.balance(), balance + 13);
        assert.equal(h.rt.walletMoney(), 500);
    });
}
