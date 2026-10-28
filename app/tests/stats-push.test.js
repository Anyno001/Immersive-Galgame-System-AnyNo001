import test from 'node:test';
import assert from 'node:assert/strict';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { detectStatMappings, fingerprintTables, pushStats, withTimeout } from '../src/data/shujuku/stats-push.js';
import { parseTables } from '../src/data/shujuku/table-parser.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';

function sheet(uid, name, content, orderNo = 0) { return { uid, name, content, orderNo }; }

// fake shujuku：updateCell 的 rowIndex 含表头（与真实接口、shujuku-panel 一致），直接对应 content 下标。
function fakeApi(sheets, { failCell = null, readThrows = false } = {}) {
    const calls = { update: [], refresh: 0 };
    const raw = Object.fromEntries(sheets.map((s) => [s.uid, s]));
    return {
        calls,
        raw,
        exportTableAsJson() { if (readThrows) throw new Error('not ready'); return raw; },
        updateCell(tableName, rowIndex, colName, value) {
            calls.update.push({ tableName, rowIndex, colName, value });
            if (failCell && failCell === colName) return false;
            const s = Object.values(raw).find((x) => x.name === tableName);
            const col = s.content[0].indexOf(colName);
            s.content[rowIndex][col] = value;
            return true;
        },
        refreshDataAndWorldbook() { calls.refresh += 1; },
    };
}

function baseSheets() {
    return [
        sheet('sheet_v', '角色数值表', [['角色姓名', '好感度', '信任度', '了解程度', '已知秘密'], ['小雪', '20%', '0%', '0%', '秘密A'], ['路人', '5%', '0%', '0%', '']], 1),
        sheet('sheet_m', '主角信息表', [['姓名', '基础属性', '特有属性', '近况'], ['我', '健康:60；力量:45；', '烹饪:20；', '近况原文']], 2),
        sheet('sheet_r', '重要角色表', [['姓名', '角色类型', '基础属性'], ['我', '主角', '健康:60；'], ['小雪', '恋爱对象', '健康:50；']], 3),
    ];
}

function stateWith(dims) {
    const s = createStatsState();
    const c = createCharacter(1);
    return { ...s, characters: { 小雪: { ...c, dims: { ...c.dims, ...dims } } } };
}

test('只写有变化的目标格，其余单元格与同格其它属性逐字不变，一批只刷新一次（易错点 F2/F3/F12/F13）', async () => {
    const api = fakeApi(baseSheets());
    const r = await pushStats(createShujukuClient(api), stateWith({ 好感: 34, 信任: -20, 了解: 5 }));
    assert.equal(r.ok, true);
    assert.equal(api.calls.refresh, 1);
    const v = api.raw.sheet_v.content;
    assert.deepEqual(v[1], ['小雪', '34%', '-20%', '5%', '秘密A']);
    assert.deepEqual(v[2], ['路人', '5%', '0%', '0%', '']);
    const m = api.raw.sheet_m.content[1];
    assert.equal(m[1], '健康:40；力量:40；敏捷:40；理智:40；观察:40；魅力:40；');
    assert.match(m[2], /^烹饪:50；/);
    assert.equal(m[3], '近况原文');
    const rr = api.raw.sheet_r.content;
    assert.match(rr[1][2], /^健康:40；/);
    assert.equal(rr[2][2], '健康:50；');
    assert.ok(api.calls.update.every((c) => c.colName !== '已知秘密' && c.colName !== '近况'));
});

test('再次推送时表格已是真值：零写入、不刷新', async () => {
    const api = fakeApi(baseSheets());
    const client = createShujukuClient(api);
    const state = stateWith({ 好感: 34, 信任: -20, 了解: 5 });
    await pushStats(client, state);
    const again = await pushStats(client, state);
    assert.equal(again.wrote, 0);
    assert.equal(api.calls.refresh, 1);
});

test('读取失败与空表分开报告，不写入（易错点 F7）', async () => {
    const fail = await pushStats(createShujukuClient(fakeApi([], { readThrows: true })), stateWith({ 好感: 1 }));
    assert.deepEqual([fail.ok, fail.reason], [false, 'stats-push-read-failed']);
    const none = await pushStats(createShujukuClient(null), stateWith({ 好感: 1 }));
    assert.equal(none.reason, 'stats-push-read-failed');
    const empty = await pushStats(createShujukuClient(fakeApi([])), stateWith({ 好感: 1 }));
    assert.deepEqual([empty.ok, empty.wrote, empty.refreshed], [true, 0, false]);
});

test('文字列写阶段名；信任文字列跳过并记诊断（易错点 F10）', async () => {
    const api = fakeApi([sheet('sheet_l', '恋爱对象表', [['姓名', '对主角好感状态', '信任状态'], ['小雪', '略有好感', '一般']])]);
    const r = await pushStats(createShujukuClient(api), stateWith({ 好感: 34, 信任: 10 }));
    assert.equal(api.raw.sheet_l.content[1][1], '明确喜欢');
    assert.equal(api.raw.sheet_l.content[1][2], '一般');
    assert.ok(r.diagnostics.some((d) => d.code === 'stats-push-text-column-skipped' && d.column === '信任状态'));
});

test('写入失败记入 failures；映射可设为不推送；rowOffset 生效', async () => {
    const api = fakeApi(baseSheets(), { failCell: '信任度' });
    const r = await pushStats(createShujukuClient(api), stateWith({ 好感: 34, 信任: -20 }), { overrides: { '主角信息表|基础属性': 'skip' } });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => f.column === '信任度'));
    assert.equal(api.raw.sheet_m.content[1][1], '健康:60；力量:45；');
    const tables = parseTables(baseSheets().reduce((o, s) => ({ ...o, [s.uid]: s }), {}));
    const plain = detectStatMappings(tables);
    assert.ok(plain.mappings.some((m) => m.table === '主角信息表' && m.column === '基础属性'));
    const off = fakeApi(baseSheets());
    await pushStats(createShujukuClient({ ...off, updateCell: (t, i, c, v) => { off.calls.update.push({ i }); return true; } }), stateWith({ 好感: 34 }), { rowOffset: 0 });
    assert.ok(off.calls.update.length > 0 && off.calls.update.some((c) => c.i === 0));
    assert.ok(api.calls.update.every((c) => c.rowIndex >= 1), '默认行号含表头，不会写到第 0 行（表头）');
});

test('模板指纹随表头变化；范围可疑时提示（易错点 F9/F11）', () => {
    const a = parseTables({ s: sheet('sheet_a', '角色数值表', [['角色姓名', '好感度']]) });
    const b = parseTables({ s: sheet('sheet_a', '角色数值表', [['角色姓名', '好感度', '信任度']]) });
    assert.notEqual(fingerprintTables(a), fingerprintTables(b));
    const dnd = parseTables({ s: sheet('sheet_d', '角色关系表', [['姓名', '好感度'], ['甲', '12'], ['乙', '15']]) });
    assert.ok(detectStatMappings(dnd).diagnostics.some((d) => d.code === 'stats-push-range-suspect'));
});

test('生成前补写超时放行（易错点 F6）', async () => {
    const r = await withTimeout(new Promise(() => {}), 20);
    assert.equal(r.reason, 'stats-push-timeout');
    assert.deepEqual(await withTimeout(Promise.resolve({ ok: true }), 20), { ok: true });
});
