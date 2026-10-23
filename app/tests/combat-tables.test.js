import test from 'node:test';
import assert from 'node:assert/strict';
import {
    COMBAT_TABLE_SPECS, createCombatTables, decodeCombatRows, encodeCombatRecord, probeCombatTableSupport, withCombatSheets,
} from '../src/data/shujuku/combat-tables.js';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { parseTables } from '../src/data/shujuku/table-parser.js';

const userSheet = () => ({ uid: 'sheet_user', name: '角色表', content: [['row_id', '姓名']], updateConfig: { updateFrequency: -1 }, exportConfig: {}, orderNo: 3 });

function fakeApi({ corrupt = null, failRead = false } = {}) {
    const tables = { mate: { type: 'chatSheets', version: 1, updateConfigUiSentinel: 2 }, sheet_user: userSheet() };
    const calls = { insert: [], imports: [], refresh: 0, writingSeen: [] };
    const api = {
        calls, tables,
        exportTableAsJson() {
            if (api.failRead) throw new Error('boom');
            return JSON.parse(JSON.stringify(tables));
        },
        failRead,
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
            const copy = JSON.parse(JSON.stringify(tables));
            for (const v of Object.values(copy)) if (v && v.content) v.content = [v.content[0]];
            return copy;
        },
        async importTemplateFromData(template, options) {
            calls.imports.push({ template, options });
            for (const [key, sheet] of Object.entries(template)) {
                if (key === 'mate') { tables.mate = sheet; continue; }
                if (!tables[key]) tables[key] = JSON.parse(JSON.stringify(sheet));
            }
            return { success: true };
        },
        async refreshDataAndWorldbook() { calls.refresh += 1; },
    };
    api.corrupt = corrupt;
    return api;
}

const ledger = (id, payload = { amount: 10, reason: '帮忙' }) => ({
    id, type: 'exp', character: 'pc-1', createdAt: 5, payload,
    anchor: { messageId: 3, swipeId: 0, tagHash: 'abc', occurrence: 0 },
});
const profile = (definition) => ({ id: 'pc-1', name: '主角', kind: 'deck-character', className: '剑士', version: 1, createdAt: 9, definition });

async function ready(api) {
    const tables = createCombatTables({ api });
    assert.equal((await tables.ensure({ confirmed: true })).ok, true);
    return tables;
}

test('宿主缺少方法时 fail-closed，不建表也不写入', async () => {
    const api = fakeApi();
    delete api.importTemplateFromData;
    const probe = probeCombatTableSupport(api);
    assert.deepEqual([probe.ok, probe.reason, probe.missing], [false, 'combat-table-host-unsupported', ['importTemplateFromData']]);
    assert.equal(probeCombatTableSupport(null).missing.length, 5);
    const tables = createCombatTables({ api });
    assert.equal((await tables.ensure({ confirmed: true })).reason, 'combat-table-host-unsupported');
    const appended = await tables.append('ledger', ledger('e1'));
    assert.equal(appended.reason, 'combat-table-host-unsupported');
    assert.equal(appended.pending.length, 1);
    assert.equal(api.calls.insert.length, 0);
    assert.equal(tables.read().reason, 'combat-table-host-unsupported');
});

test('建表需要确认、保留已有表、不参与自动填表且不注入世界书，重复调用幂等', async () => {
    const api = fakeApi();
    const tables = createCombatTables({ api });
    const unconfirmed = await tables.ensure();
    assert.deepEqual([unconfirmed.reason, unconfirmed.missing], ['combat-table-confirm-required', ['profile', 'ledger']]);
    assert.equal(api.calls.imports.length, 0);
    const created = await tables.ensure({ confirmed: true });
    assert.deepEqual(created, { ok: true, created: ['profile', 'ledger'] });
    const { template, options } = api.calls.imports[0];
    assert.deepEqual(options, { scope: 'chat', dataMode: 'seed' });
    assert.ok(template.sheet_user);
    assert.equal(template.mate.updateConfigUiSentinel, -1);
    for (const kind of ['profile', 'ledger']) {
        const sheet = Object.values(template).find((s) => s && s.name === COMBAT_TABLE_SPECS[kind].name);
        assert.equal(sheet.updateConfig.updateFrequency, 0);
        assert.deepEqual([sheet.exportConfig.enabled, sheet.exportConfig.injectIntoWorldbook], [false, false]);
        assert.ok(sheet.orderNo > 3);
    }
    assert.deepEqual(await tables.ensure({ confirmed: true }), { ok: true, created: [] });
    assert.equal(api.calls.imports.length, 1);
    const input = { sheet_user: userSheet() };
    withCombatSheets(input);
    assert.deepEqual(Object.keys(input), ['sheet_user']);
});

test('写入后读回核对；重复写入同一记录不再插行，批次只刷新一次', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    const first = await tables.append('ledger', [ledger('e1'), ledger('e2')]);
    assert.deepEqual([first.ok, first.written, first.pending], [true, ['e1', 'e2'], []]);
    assert.equal(api.calls.refresh, 1);
    assert.ok(api.calls.insert.every((c) => c.skipNotify === true));
    const again = await tables.append('ledger', ledger('e1'));
    assert.deepEqual([again.ok, again.present, again.written], [true, ['e1'], []]);
    assert.equal(api.calls.insert.length, 2);
    assert.equal(api.calls.refresh, 1);
    const conflict = await tables.append('ledger', ledger('e1', { amount: 99, reason: '' }));
    assert.deepEqual([conflict.ok, conflict.rejected[0].reason], [false, 'combat-record-conflict']);
    const read = tables.read();
    assert.deepEqual(read.ledger.map((r) => [r.id, r.payload.amount, r.anchor.tagHash]), [['e1', 10, 'abc'], ['e2', 10, 'abc']]);
    assert.equal('ledgerRaw' in read, false);
});

test('读回不一致时保留在待写队列，不报成功；修复后重写成功', async () => {
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

test('读取失败不当作空表，待写条目保留', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    api.failRead = true;
    const read = tables.read();
    assert.deepEqual([read.ok, read.reason], [false, 'combat-table-read-failed']);
    assert.equal('ledger' in read, false);
    const appended = await tables.append('ledger', ledger('e1'));
    assert.deepEqual([appended.ok, appended.reason, appended.pending.length], [false, 'combat-table-read-failed', 1]);
    assert.equal(api.calls.insert.length, 0);
    assert.equal((await tables.ensure({ confirmed: true })).reason, 'combat-table-read-failed');
});

test('JSON 超过单元格上限时分段写入，读回还原原文', async () => {
    const api = fakeApi();
    const tables = createCombatTables({ api, cellMax: 40 });
    await tables.ensure({ confirmed: true });
    const definition = { kind: 'deck-character', name: '主角', note: '长'.repeat(150), pool: [1, 2, 3] };
    const encoded = encodeCombatRecord('profile', profile(definition), 40);
    assert.ok(encoded.rows.length > 3);
    const result = await tables.append('profile', profile(definition));
    assert.deepEqual([result.ok, result.written], [true, ['pc-1|1']]);
    assert.equal(api.calls.insert.length, encoded.rows.length);
    assert.equal(api.calls.refresh, 1);
    const [record] = tables.read().profile;
    assert.deepEqual(record, { ...profile(definition) });
    const sheet = parseTables(api.tables).find((t) => t.name === COMBAT_TABLE_SPECS.profile.name);
    const missingPart = { ...sheet, rows: sheet.rows.slice(1) };
    assert.deepEqual(decodeCombatRows('profile', missingPart).diagnostics.map((d) => d.code), ['combat-row-segment-incomplete']);
});

test('client.insertRow 不传 options 时保持位置参数调用', async () => {
    const seen = [];
    const client = createShujukuClient({ insertRow: (...args) => { seen.push(args); return 2; } });
    assert.deepEqual(await client.insertRow('表', { a: 1 }), { ok: true, rowIndex: 2 });
    assert.deepEqual(seen[0], ['表', { a: 1 }]);
    await client.insertRow('表', { a: 1 }, { skipNotify: true });
    assert.deepEqual(seen[1], [{ skipNotify: true, tableName: '表', data: { a: 1 } }]);
    const failed = createShujukuClient({ insertRow: () => -1 });
    assert.deepEqual(await failed.insertRow('表', {}), { ok: false, reason: 'insert-failed' });
});
