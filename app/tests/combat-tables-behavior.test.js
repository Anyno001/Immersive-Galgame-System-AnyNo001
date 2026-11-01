// 战斗表写入与读取的行为用例（v0.39.1 云端行为的增量对齐）：读回不一致留队列、读取失败不当空表、
// 可选属性表缺失、受控写队列、同一宿主 api 上多个缓存客户端共享失效、空导出不缓存。
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_TABLE_SPECS, createCachedTableClient, createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createCombatServices } from '../src/core/combat-services.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function fakeApi({ corrupt = null } = {}) {
    const tables = { mate: { type: 'chatSheets', version: 1, updateConfigUiSentinel: 2 }, sheet_user: { uid: 'sheet_user', name: '角色表', content: [['row_id', '姓名']], updateConfig: { updateFrequency: -1 }, exportConfig: {}, orderNo: 3 } };
    const calls = { insert: [], imports: 0 };
    const api = {
        calls, tables, corrupt, failRead: false, emptyExport: false,
        exportTableAsJson() {
            if (api.failRead) throw new Error('boom');
            return api.emptyExport ? {} : clone(tables);
        },
        insertRow(opts) {
            calls.insert.push(opts);
            const sheet = Object.values(tables).find((s) => s && s.name === opts.tableName);
            if (!sheet) return -1;
            const headers = sheet.content[0];
            const row = headers.map((h) => (h === 'row_id' ? String(sheet.content.length) : String(opts.data[h] ?? '')));
            if (api.corrupt) api.corrupt(row, headers);
            sheet.content.push(row);
            return sheet.content.length - 1;
        },
        getTableTemplate() {
            const copy = clone(tables);
            for (const v of Object.values(copy)) if (v && v.content) v.content = [v.content[0]];
            return copy;
        },
        async importTemplateFromData(template) {
            calls.imports += 1;
            for (const [key, sheet] of Object.entries(template)) {
                if (key === 'mate') { tables.mate = sheet; continue; }
                if (!tables[key]) tables[key] = clone(sheet);
            }
            return { success: true };
        },
        async refreshDataAndWorldbook() {},
    };
    return api;
}

const ledger = (id, payload = { amount: 10, reason: '帮忙' }) => ({
    id, type: 'exp', character: 'pc-1', createdAt: 5, payload,
    anchor: { messageId: 3, swipeId: 0, tagHash: 'abc', occurrence: 0 },
});
const attribute = {
    id: 'a1', type: 'story', character: 'pc-1', createdAt: 5, change: '力量+1', payload: { ability: 'str', amount: 1 },
    anchor: { messageId: 3, swipeId: 0, tagHash: 'abc', occurrence: 0 },
};

async function ready(api, options = {}) {
    const tables = createCombatTables({ api, ...options });
    assert.equal((await tables.ensure()).ok, true);
    return tables;
}

test('读回不一致：条目留在待写队列、不报成功，首条标明原因，其余标 queued；修复后重写成功', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    api.corrupt = (row, headers) => { const i = headers.indexOf('载荷JSON'); row[i] = row[i].slice(0, -1); };
    const bad = await tables.append('ledger', [ledger('e1'), ledger('e2')]);
    assert.deepEqual([bad.ok, bad.reason, bad.key], [false, 'combat-ledger-write-unverified', 'e1']);
    assert.deepEqual(bad.pending.map((p) => [p.key, p.reason]), [['e1', 'combat-ledger-write-unverified'], ['e2', 'queued']]);
    assert.equal(tables.read().ledger.length, 0);
    api.corrupt = null;
    const retried = await tables.flush();
    assert.deepEqual([retried.ok, retried.written, retried.pending], [true, ['e1', 'e2'], []]);
    assert.deepEqual(tables.read().ledger.map((r) => r.id), ['e1', 'e2']);
});

test('读取失败不当作空表：待写条目保留，不插行；ensure 同样报读取失败；恢复后重写成功', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    api.failRead = true;
    tables.client.invalidate();
    const read = tables.read();
    assert.deepEqual([read.ok, read.reason], [false, 'combat-table-read-failed']);
    assert.equal('ledger' in read, false);
    const appended = await tables.append('ledger', ledger('e1'));
    assert.deepEqual([appended.ok, appended.reason, appended.pending.length], [false, 'combat-table-read-failed', 1]);
    assert.equal(api.calls.insert.length, 0);
    assert.equal((await tables.ensure()).reason, 'combat-table-read-failed');
    api.failRead = false;
    const flushed = await tables.flush();
    assert.deepEqual([flushed.ok, flushed.written, flushed.pending], [true, ['e1'], []]);
});

test('写入前判重读新数据：缓存里的旧快照读取失败时不被沿用', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    tables.read();
    api.failRead = true;
    const appended = await tables.append('ledger', ledger('e1'));
    assert.deepEqual([appended.ok, appended.reason], [false, 'combat-table-read-failed']);
    assert.equal(api.calls.insert.length, 0);
});

test('属性表是可选表：缺表不阻断读取，写属性表拒收但不卡住日志写入，补建后可写', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    const key = Object.keys(api.tables).find((k) => api.tables[k]?.name === COMBAT_TABLE_SPECS.attribute.name);
    delete api.tables[key];
    tables.client.invalidate();
    const read = tables.read();
    assert.deepEqual([read.ok, read.missing, read.optionalMissing, read.attribute], [true, [], ['attribute'], null]);
    const [first, second] = await Promise.all([tables.append('attribute', attribute), tables.append('ledger', ledger('e1'))]);
    assert.deepEqual(first.rejected, [{ key: 'a1', kind: 'attribute', reason: 'combat-table-missing' }]);
    assert.deepEqual([first.ok, first.written, first.pending], [false, ['e1'], []]);
    assert.deepEqual([second.ok, second.pending], [true, []]);
    assert.deepEqual(await tables.ensure(), { ok: true, created: ['attribute'] });
    const written = await tables.append('attribute', attribute);
    assert.deepEqual([written.ok, written.written], [true, ['a1']]);
    const after = tables.read();
    assert.deepEqual(after.attribute, [attribute]);
    assert.equal('attributeRaw' in after, false);
});

test('受控写队列：失效任务拒写，待重试条目过期后不再插入，不影响普通写入', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    const controller = new AbortController();
    const pending = tables.append('ledger', ledger('cancelled'), { signal: controller.signal });
    controller.abort();
    const cancelled = await pending;
    assert.equal(cancelled.ok, false);
    assert.equal(cancelled.rejected[0].reason, 'request-stale');
    assert.equal(api.calls.insert.length, 0);
    let active = true;
    api.failRead = true;
    const failed = await tables.append('ledger', ledger('later'), { shouldStart: () => active });
    assert.equal(failed.pending.length, 1);
    active = false;
    api.failRead = false;
    const flushed = await tables.append('ledger', ledger('live'));
    assert.deepEqual(flushed.rejected, [{ key: 'later', reason: 'request-stale' }]);
    assert.deepEqual(tables.read().ledger.map((r) => r.id), ['live']);
    assert.deepEqual(tables.pending(), []);
});

test('同一宿主 api 上的缓存客户端共享失效：一方写入后另一方立即读到新数据', async () => {
    const api = fakeApi();
    const writer = await ready(api);
    const reader = createCombatTables({ api, client: createCachedTableClient({ api }) });
    assert.equal(reader.read().ledger.length, 0);
    assert.equal((await writer.append('ledger', ledger('e1'))).ok, true);
    assert.deepEqual(reader.read().ledger.map((r) => r.id), ['e1']);
    const other = createCachedTableClient({ api });
    const before = other.version();
    await writer.append('ledger', ledger('e2'));
    assert.ok(other.version() > before, '版本号在同一宿主上共享');
    assert.equal(createCachedTableClient({ api: fakeApi() }).version(), 0, '其他宿主的版本号互不影响');
});

test('空导出（数据库尚未载入）不进缓存：载入后的下一次读取立即生效', () => {
    const api = fakeApi();
    const client = createCachedTableClient({ api });
    api.emptyExport = true;
    assert.equal(client.readSheets().reason, 'not-ready');
    api.emptyExport = false;
    assert.equal(client.readSheets().ok, true);
    assert.equal(api.calls.insert.length, 0);
});

test('服务层：数据库未载入时不导入模板，载入后照常补建（空导出不残留在缓存里）', async () => {
    const api = fakeApi();
    const host = { chatId: 'chat-1' };
    const services = createCombatServices({
        global: { AutoCardUpdaterAPI: api, SillyTavern: { getContext: () => ({ chat: [] }) } },
        request: async () => '{}', retryDelays: [0, 0], getReaderSettings: () => ({ combatExpansion: { enabled: true } }),
        getChatId: () => host.chatId, getUserName: () => '', getAutoIllustration: () => ({}),
    });
    api.emptyExport = true;
    assert.equal((await services.getLedger().effectiveState()).reason, 'combat-table-not-ready');
    assert.equal((await services.ensureTables()).reason, 'combat-table-not-ready');
    assert.equal(api.calls.imports, 0);
    api.emptyExport = false;
    assert.equal((await services.getLedger().effectiveState()).ok, true);
    assert.equal(api.calls.imports, 1);
});
