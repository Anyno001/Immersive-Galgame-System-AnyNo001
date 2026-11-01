// 差分测试：combat-tables 与 v0.39 原包同操作同结果，并统计整表读取次数（exportTableAsJson 调用数）。
// 覆盖：表规格与模板、编码解码、建表、append/flush、分段、冲突、缓存与失效、只解码需要的 sheet。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
    COMBAT_TABLE_SPECS, buildCombatSheet, buildIgsSheet, createCachedTableClient, createCombatTables, decodeCombatRows,
    encodeCombatRecord, probeCombatTableSupport, readCombatTables, withCombatSheets,
} from '../src/data/shujuku/combat-tables.js';
import { parseTables } from '../src/data/shujuku/table-parser.js';
import { createLedgerMockHost } from './helpers/combat-mock-host-ledger.js';

globalThis.window = globalThis.window || { IGS_AUTO_BOOTSTRAP: false };
globalThis.window.IGS_AUTO_BOOTSTRAP = false;
const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = globalThis.__igsRequire('src/data/shujuku/combat-tables.js');
const clone = (value) => JSON.parse(JSON.stringify(value));

// 用户已有一张表，ensure 才能在其基础上补建战斗表。
function seededHost(options) {
    const host = createLedgerMockHost(options);
    host.sheets.sheet_user = { uid: 'sheet_user', name: '用户表', orderNo: 0, content: [['row_id', '列A']] };
    return host;
}

const ledgerRecord = (n, size = 10) => ({
    id: `entry-${n}`, type: 'exp', character: '艾拉', anchor: { messageId: n, swipeId: 0, tagHash: `h${n}`, occurrence: 0 },
    createdAt: 1700000000000 + n, payload: { amount: n, pad: 'x'.repeat(size) },
});
const statsRecord = (n) => ({
    id: `sf|${n}|0|h|o`, character: '艾拉', type: 'floor', anchor: { messageId: n, swipeId: 0, tagHash: 'h', occurrence: 0 },
    createdAt: 1700000000000 + n, change: '+1', payload: { n },
});
const profileRecord = (n) => ({ id: `pc-${n}`, name: `角色${n}`, kind: 'deck-character', className: '', version: 1, createdAt: 1700000000000, definition: { n } });

async function bothWorlds(task) {
    const a = seededHost(); const b = seededHost();
    const before = orig.createCombatTables({ api: a.api });
    const after = createCombatTables({ api: b.api });
    return task({ a, b, before, after });
}

test('表规格、模板、编码、解码与原包一致', () => {
    assert.deepEqual(COMBAT_TABLE_SPECS.profile.columns, orig.COMBAT_TABLE_SPECS.profile.columns);
    for (const kind of Object.keys(orig.COMBAT_TABLE_SPECS)) {
        const o = orig.COMBAT_TABLE_SPECS[kind]; const m = COMBAT_TABLE_SPECS[kind];
        assert.equal(m.name, o.name); assert.equal(m.uid, o.uid); assert.equal(!!m.optional, !!o.optional);
        assert.deepEqual(m.columns, o.columns); assert.equal(m.jsonColumn, o.jsonColumn);
        assert.deepEqual(buildCombatSheet(kind, 3), orig.buildCombatSheet(kind, 3));
    }
    const base = { sheet_a: { uid: 'sheet_a', name: 'A', orderNo: 4, content: [['row_id']] }, sheet_igscbledger: { uid: 'sheet_igscbledger', name: '占位', orderNo: 1, content: [['row_id']] } };
    assert.deepEqual(withCombatSheets(base), orig.withCombatSheets(base));
    assert.deepEqual(buildIgsSheet({ name: 'N', columns: ['a'], note: 'n' }, 2, 'u'), orig.buildIgsSheet({ name: 'N', columns: ['a'], note: 'n' }, 2, 'u'));
    assert.deepEqual(probeCombatTableSupport({}), orig.probeCombatTableSupport({}));
    for (const [kind, record, cellMax] of [['ledger', ledgerRecord(1, 50), 20], ['profile', profileRecord(1), 16000], ['stats', statsRecord(1), 7], ['attribute', { ...statsRecord(2), id: 'a1' }, 9]]) {
        assert.deepEqual(encodeCombatRecord(kind, record, cellMax), orig.encodeCombatRecord(kind, record, cellMax));
    }
});

test('分段行解码与原包一致，含缺段、段数不符、JSON 非法', () => {
    const header = COMBAT_TABLE_SPECS.ledger.columns;
    const rowsOf = (record, cellMax) => encodeCombatRecord('ledger', record, cellMax).rows.map((row) => header.map((column) => row[column]));
    const good = rowsOf(ledgerRecord(1, 80), 25);
    const missingOne = rowsOf(ledgerRecord(2, 80), 25).slice(1);
    const badJson = rowsOf(ledgerRecord(3), 100000).map((row) => { const copy = [...row]; copy[copy.length - 1] = '{坏'; return copy; });
    const sheet = { name: COMBAT_TABLE_SPECS.ledger.name, columns: header, rows: [...good, ...missingOne, ...badJson, ['', '', '', '', '', '', '']] };
    assert.deepEqual(decodeCombatRows('ledger', sheet), orig.decodeCombatRows('ledger', sheet));
});

test('建表 ensure + 批量 append：写入的行与原包完全一致，整表读取次数大幅减少', async () => {
    await bothWorlds(async ({ a, b, before, after }) => {
        assert.deepEqual(await after.ensure(), await before.ensure());
        const records = Array.from({ length: 12 }, (_, n) => ledgerRecord(n, n === 5 ? 40000 : 10)); // 第 5 条拆成多段
        a.calls.exportTableAsJson = 0; b.calls.exportTableAsJson = 0;
        const oldResult = await before.append('ledger', records);
        const newResult = await after.append('ledger', records);
        assert.deepEqual(newResult, oldResult);
        assert.deepEqual(b.sheets, a.sheets); // 表内容逐行一致
        assert.equal(b.calls.refreshDataAndWorldbook, a.calls.refreshDataAndWorldbook);
        console.log('append 12 条（含 1 条 3 段）整表读取 原包/新实现', a.calls.exportTableAsJson, b.calls.exportTableAsJson);
        assert.ok(b.calls.exportTableAsJson <= 2);
        assert.ok(a.calls.exportTableAsJson >= 12 * 2);
        // 再写同一批：全部判为 present，不再插入
        const insertsBefore = b.calls.insertRow;
        const again = await after.append('ledger', records);
        assert.deepEqual(again, await before.append('ledger', records));
        assert.equal(b.calls.insertRow, insertsBefore);
        // 同键不同内容：冲突
        const conflict = { ...ledgerRecord(1), payload: { amount: 999 } };
        assert.deepEqual(await after.append('ledger', conflict), await before.append('ledger', conflict));
        assert.deepEqual(after.read(), before.read());
    });
});

test('批内重复键、混合种类、可选表缺失、未知种类，结果与原包一致', async () => {
    await bothWorlds(async ({ a, b, before, after }) => {
        await before.ensure(); await after.ensure();
        const dupe = ledgerRecord(7);
        for (const tables of [before, after]) {
            const results = [];
            results.push(await tables.append('ledger', [dupe, dupe, ledgerRecord(8)]));
            results.push(await tables.append('profile', [profileRecord(1), profileRecord(2)]));
            results.push(await tables.append('stats', [statsRecord(1)]));
            results.push(await tables.append('nope', [{}]));
            tables.results = results;
        }
        assert.deepEqual(after.results, before.results);
        assert.deepEqual(b.sheets, a.sheets);
        // 去掉属性表后，属性记录按「可选表缺失」被拒绝
        for (const host of [a, b]) {
            const key = Object.keys(host.sheets).find((k) => host.sheets[k].name === COMBAT_TABLE_SPECS.attribute.name);
            delete host.sheets[key];
        }
        before.client?.invalidate?.(); after.client.invalidate();
        const attr = { ...statsRecord(3), id: 'attr-1' };
        assert.deepEqual(await after.append('attribute', [attr]), await before.append('attribute', [attr]));
    });
});

test('读取缓存：同版本复用，自己写入、插件事件、聊天切换、TTL 都会使其失效', async () => {
    const host = seededHost({ supportCallbacks: true });
    let clock = 1000;
    const client = createCachedTableClient({ api: host.api, now: () => clock });
    const tables = createCombatTables({ api: host.api, client });
    await tables.ensure();
    client.invalidate();
    host.calls.exportTableAsJson = 0;
    for (let i = 0; i < 20; i += 1) tables.read();
    assert.equal(host.calls.exportTableAsJson, 1, '20 次读取只导出一次');
    await tables.append('ledger', [ledgerRecord(1)]);
    const afterWrite = host.calls.exportTableAsJson;
    tables.read(); tables.read();
    assert.ok(host.calls.exportTableAsJson - afterWrite <= 1, '写入后第一次读取重新导出，之后复用');
    // 插件事件使缓存失效
    const mark = host.calls.exportTableAsJson;
    host.fireTableUpdated(); tables.read(); tables.read();
    assert.equal(host.calls.exportTableAsJson, mark + 1);
    // 聊天切换
    client.invalidate(); tables.read();
    assert.equal(host.calls.exportTableAsJson, mark + 2);
    // dispose 取消订阅
    client.dispose();
    const versionAfterDispose = client.version();
    host.fireTableUpdated();
    assert.equal(client.version(), versionAfterDispose, 'dispose 后不再响应插件事件');
});

test('没有事件订阅的插件：缓存只在 TTL 窗口内复用', () => {
    const host = seededHost();
    let clock = 0;
    const client = createCachedTableClient({ api: host.api, now: () => clock, ttlMs: 1500 });
    client.readTables(); clock = 1000; client.readTables();
    assert.equal(host.calls.exportTableAsJson, 1);
    clock = 1600; client.readTables();
    assert.equal(host.calls.exportTableAsJson, 2);
});

test('只解码需要的 sheet：读 stats 不解析其他三张表，缺表统计仍按全部种类', async () => {
    const host = seededHost();
    const client = createCachedTableClient({ api: host.api });
    const tables = createCombatTables({ api: host.api, client });
    await tables.ensure();
    await tables.append('ledger', Array.from({ length: 30 }, (_, n) => ledgerRecord(n)));
    await tables.append('stats', [statsRecord(1), statsRecord(2)]);
    client.invalidate();
    const decodesBefore = client.stats.decodes;
    const statsOnly = tables.read({ kinds: ['stats'] });
    assert.equal(client.stats.decodes - decodesBefore, 1);
    assert.equal(statsOnly.stats.length, 2);
    assert.equal(statsOnly.ledger, undefined);
    const full = tables.read();
    assert.equal(client.stats.decodes - decodesBefore, 4, '补读全部时只多解码其余 3 张');
    // 与原包全量读取的内容一致
    const originalHost = seededHost();
    const originalTables = orig.createCombatTables({ api: originalHost.api });
    await originalTables.ensure();
    await originalTables.append('ledger', Array.from({ length: 30 }, (_, n) => ledgerRecord(n)));
    await originalTables.append('stats', [statsRecord(1), statsRecord(2)]);
    assert.deepEqual(full, originalTables.read());
    // 缺可选表时，限定 kinds 仍报告缺失
    for (const key of Object.keys(host.sheets)) if (host.sheets[key].name === COMBAT_TABLE_SPECS.stats.name) delete host.sheets[key];
    client.invalidate();
    const missing = readCombatTables(client, { kinds: ['ledger'] });
    assert.deepEqual(missing.optionalMissing, ['stats']);
    assert.equal(missing.stats, null);
});

test('宿主缺函数、表未就绪、读取异常的返回值与原包一致', async () => {
    const empty = createLedgerMockHost();
    const noApi = { exportTableAsJson: () => ({}) };
    const throwing = { ...empty.api, exportTableAsJson() { throw new Error('boom'); } };
    for (const api of [noApi, empty.api, throwing, null]) {
        const before = orig.createCombatTables({ api }); const after = createCombatTables({ api });
        assert.deepEqual(after.read(), before.read());
        assert.deepEqual(await after.ensure(), await before.ensure());
        assert.deepEqual(await after.append('ledger', [ledgerRecord(1)]), await before.append('ledger', [ledgerRecord(1)]));
        assert.deepEqual(after.pending(), before.pending());
    }
});

test('parseTables 结果不被缓存读取改写（同一份导出数据可重复读）', async () => {
    const host = seededHost();
    const client = createCachedTableClient({ api: host.api });
    const tables = createCombatTables({ api: host.api, client });
    await tables.ensure();
    await tables.append('ledger', [ledgerRecord(1)]);
    const first = clone(tables.read());
    const second = clone(tables.read());
    assert.deepEqual(first, second);
    assert.equal(parseTables(client.readTables().data).length, host.api.exportTableAsJson() && Object.keys(host.sheets).length);
});
