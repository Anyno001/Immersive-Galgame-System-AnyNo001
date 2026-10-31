import test from 'node:test';
import assert from 'node:assert/strict';
import { appendDdlColumns, createInventoryTables, locateInventoryTable, planInventoryTemplate, GEAR_TABLE, INVENTORY_DEFAULT_NAME } from '../src/data/shujuku/inventory-tables.js';
import { parseTables } from '../src/data/shujuku/table-parser.js';

const DEFAULT_DDL = `CREATE TABLE inventory ( -- 背包物品表
  row_id INTEGER PRIMARY KEY, -- 行号
  item_name TEXT NOT NULL UNIQUE, -- 物品名称
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0), -- 数量
  description TEXT, -- 描述/效果
  category TEXT -- 类别
);`;
const SHORT_DDL = `CREATE TABLE bag ( -- 道具背包
  row_id INTEGER PRIMARY KEY, -- 行号
  item_name TEXT NOT NULL UNIQUE, -- 物品名称
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0) -- 数量
);`;

const sheet = (uid, name, header, ddl, extra = {}) => ({ uid, name, sourceData: { note: '', ...(ddl ? { ddl } : {}) }, content: [['row_id', ...header]], updateConfig: { updateFrequency: -1 }, exportConfig: {}, orderNo: 2, ...extra });
const userSheet = () => sheet('sheet_user', '重要角色表', ['姓名'], '');

// 与宿主 ddl-utils 相同的读法：去行注释后取首个标识符为列名，跳过表级约束；行内「列 … -- 注释」取中文表头。
function ddlColumns(ddl) {
    const body = ddl.slice(ddl.indexOf('(') + 1, ddl.lastIndexOf(')'));
    return body.split('\n').map((l) => {
        const code = l.replace(/--.*$/, '').trim();
        const name = code.match(/^([^\s,()]+)/)?.[1];
        const comment = l.match(/--\s*(.+?)\s*,?\s*$/)?.[1];
        return name && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(code) ? { name, comment } : null;
    }).filter(Boolean);
}

test('appendDdlColumns：逗号补在上一列代码之后、注释留在逗号后，新列带中文表头注释；不安全的 DDL 返回 null', () => {
    const next = appendDdlColumns(SHORT_DDL, [{ header: '描述/效果', sql: 'description' }, { header: '类别', sql: 'category' }]);
    assert.ok(next.includes('CHECK(quantity > 0), -- 数量'));
    assert.deepEqual(ddlColumns(next).map((c) => [c.name, c.comment]), [
        ['row_id', '行号'], ['item_name', '物品名称'], ['quantity', '数量'], ['description', '描述/效果'], ['category', '类别'],
    ]);
    assert.ok(next.trimEnd().endsWith(');'));
    assert.equal(appendDdlColumns(SHORT_DDL, []), SHORT_DDL);
    assert.equal(appendDdlColumns(SHORT_DDL, [{ header: '数量2', sql: 'quantity' }]), null);
    assert.equal(appendDdlColumns(SHORT_DDL.replace('-- 数量\n', '-- 数量,\n  UNIQUE(item_name)\n'), [{ header: '类别', sql: 'category' }]), null);
    assert.equal(appendDdlColumns(`/* x */${SHORT_DDL}`, [{ header: '类别', sql: 'category' }]), null);
});

test('locateInventoryTable：只认唯一一张有名称与数量列的物品表，IGS 表与多张命中都不猜', () => {
    const one = parseTables({ a: sheet('sheet_a', '背包物品表', ['物品名称', '数量', '描述/效果', '类别'], DEFAULT_DDL), b: userSheet(), g: sheet('sheet_g', GEAR_TABLE.name, GEAR_TABLE.columns, '') });
    const hit = locateInventoryTable(one);
    assert.equal(hit.ok, true);
    assert.equal(hit.table.name, '背包物品表');
    assert.deepEqual(hit.index, { name: 1, quantity: 2, description: 3, category: 4 });
    assert.equal(locateInventoryTable(parseTables({ b: userSheet() })).reason, 'inventory-table-missing');
    assert.equal(locateInventoryTable(parseTables({ a: sheet('sheet_a', '物品记录', ['物品名称', '描述'], '') })).reason, 'inventory-table-missing');
    const two = locateInventoryTable(parseTables({ a: sheet('sheet_a', '背包物品表', ['物品名称', '数量'], ''), c: sheet('sheet_c', '道具栏', ['道具名称', '数量'], '') }));
    assert.deepEqual([two.ok, two.reason, two.names], [false, 'inventory-table-ambiguous', ['背包物品表', '道具栏']]);
});

test('planInventoryTemplate：默认物品表只改为程序维护并追加装配表；缺列的物品表同时补表头与 DDL；再次规划无改动', () => {
    const template = { mate: { type: 'chatSheets' }, sheet_a: sheet('sheet_a', '背包物品表', ['物品名称', '数量', '描述/效果', '类别'], DEFAULT_DDL), sheet_user: userSheet() };
    const plan = planInventoryTemplate(template, parseTables(template));
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.changes.map((c) => c.kind), ['inventory-managed', 'gear-created']);
    assert.equal(plan.template.sheet_a.sourceData.ddl, DEFAULT_DDL);
    assert.equal(plan.template.sheet_a.updateConfig.updateFrequency, 0);
    assert.equal(plan.template.sheet_a.sourceData.insertNode, '禁止。');
    const gear = Object.values(plan.template).find((s) => s?.name === GEAR_TABLE.name);
    assert.deepEqual(gear.content[0], ['row_id', ...GEAR_TABLE.columns]);
    assert.equal(gear.updateConfig.updateFrequency, 0);
    assert.equal(plan.template.mate.updateConfigUiSentinel, -1);
    assert.equal(template.sheet_a.updateConfig.updateFrequency, -1);
    assert.deepEqual(planInventoryTemplate(plan.template, parseTables(plan.template)).changes, []);

    const short = { sheet_b: sheet('sheet_b', '道具背包', ['物品名称', '数量'], SHORT_DDL, { content: [['row_id', '物品名称', '数量'], ['1', '草药', '3']] }) };
    const grown = planInventoryTemplate(short, parseTables(short));
    assert.deepEqual(grown.changes[0], { kind: 'inventory-columns', added: ['描述/效果', '类别'] });
    assert.deepEqual(grown.template.sheet_b.content, [['row_id', '物品名称', '数量', '描述/效果', '类别'], ['1', '草药', '3', '', '']]);
    assert.deepEqual(ddlColumns(grown.template.sheet_b.sourceData.ddl).map((c) => c.comment), ['行号', '物品名称', '数量', '描述/效果', '类别']);
});

test('planInventoryTemplate：没有物品表时按默认结构（含 DDL 约束）新建；同名表缺核心列、模板与当前聊天不一致或 DDL 无法追加时不规划', () => {
    const empty = { sheet_user: userSheet() };
    const made = planInventoryTemplate(empty, parseTables(empty));
    assert.deepEqual(made.changes.map((c) => c.kind), ['inventory-created', 'gear-created']);
    const bag = Object.values(made.template).find((s) => s?.name === INVENTORY_DEFAULT_NAME);
    assert.deepEqual(bag.content[0], ['row_id', '物品名称', '数量', '描述/效果', '类别']);
    assert.equal(bag.sourceData.ddl, DEFAULT_DDL.replace('CREATE TABLE inventory', `CREATE TABLE ${bag.uid}`));
    assert.equal(bag.updateConfig.updateFrequency, 0);
    const partial = { sheet_p: sheet('sheet_p', '背包物品表', ['物品名称', '描述'], '') };
    const incomplete = planInventoryTemplate(partial, parseTables(partial));
    assert.deepEqual([incomplete.ok, incomplete.reason, incomplete.name], [false, 'inventory-table-incomplete', '背包物品表']);
    assert.ok(made.template.sheet_user);

    const live = parseTables({ a: sheet('sheet_a', '背包物品表', ['物品名称', '数量', '类别'], '') });
    const drifted = { sheet_a: sheet('sheet_a', '背包物品表', ['物品名称', '数量'], '') };
    assert.equal(planInventoryTemplate(drifted, live).reason, 'inventory-template-mismatch');
    const tail = SHORT_DDL.replace('-- 数量\n', '-- 数量,\n  UNIQUE(item_name)\n');
    const blocked = { sheet_b: sheet('sheet_b', '道具背包', ['物品名称', '数量'], tail) };
    assert.equal(planInventoryTemplate(blocked, parseTables(blocked)).reason, 'inventory-ddl-unsupported');
    const both = { a: sheet('sheet_a', '背包物品表', ['物品名称', '数量'], ''), c: sheet('sheet_c', '道具栏', ['道具名称', '数量'], '') };
    assert.equal(planInventoryTemplate(both, parseTables(both)).reason, 'inventory-table-ambiguous');
});

// 宿主替身：对象参数形式的行增删改；导入按表头对齐保留已有行；corrupt 时更新写错值，用于读回核对。
function hostApi(tables) {
    const calls = { insert: [], update: [], remove: [], imports: [], refresh: 0 };
    const find = (name) => Object.values(tables).find((s) => s && s.name === name);
    const api = {
        calls, tables, corrupt: false,
        exportTableAsJson: () => JSON.parse(JSON.stringify(tables)),
        getTableTemplate() {
            const copy = JSON.parse(JSON.stringify(tables));
            for (const v of Object.values(copy)) if (v && v.content) v.content = [v.content[0]];
            return copy;
        },
        async importTemplateFromData(template, options) {
            calls.imports.push(options);
            for (const [key, s] of Object.entries(template)) {
                if (key === 'mate') { tables.mate = s; continue; }
                const cur = tables[key];
                if (!cur) { tables[key] = JSON.parse(JSON.stringify(s)); continue; }
                const head = s.content[0];
                cur.content = [head, ...cur.content.slice(1).map((r) => head.map((_, i) => r[i] ?? ''))];
                Object.assign(cur, { sourceData: s.sourceData, updateConfig: s.updateConfig });
            }
            return { success: true };
        },
        insertRow({ tableName, data }) {
            calls.insert.push(data);
            const s = find(tableName);
            if (!s) return -1;
            s.content.push(s.content[0].map((h) => (h === 'row_id' ? String(s.content.length) : String(data[h] ?? ''))));
            return s.content.length - 1;
        },
        updateRow({ tableName, rowIndex, data }) {
            calls.update.push(data);
            const s = find(tableName);
            const row = rowIndex >= 1 ? s?.content[rowIndex] : null;
            if (!row) return false;
            for (const [k, v] of Object.entries(data)) row[s.content[0].indexOf(k)] = api.corrupt ? '9' : String(v);
            return true;
        },
        deleteRow({ tableName, rowIndex }) {
            calls.remove.push(rowIndex);
            const s = find(tableName);
            if (!s || rowIndex < 1 || !s.content[rowIndex]) return false;
            s.content.splice(rowIndex, 1);
            return true;
        },
        async refreshDataAndWorldbook() { calls.refresh += 1; },
    };
    return api;
}
const hostTables = () => ({ mate: { type: 'chatSheets' }, sheet_user: userSheet(),
    sheet_a: sheet('sheet_a', '背包物品表', ['物品名称', '数量', '描述/效果', '类别'], DEFAULT_DDL, { content: [['row_id', '物品名称', '数量', '描述/效果', '类别'], ['1', '草药', '3', '回复生命', '消耗品']] }) });

test('createInventoryTables.ensure：默认物品表改为程序维护、追加装配表并读回核对，已有行保留，再次调用不导入；缺接口 fail-closed', async () => {
    const api = hostApi(hostTables());
    const inv = createInventoryTables({ api });
    const made = await inv.ensure();
    assert.deepEqual([made.ok, made.changes.map((c) => c.kind)], [true, ['inventory-managed', 'gear-created']]);
    assert.deepEqual(api.calls.imports, [{ scope: 'chat', dataMode: 'seed' }]);
    assert.deepEqual(api.tables.sheet_a.content[1], ['1', '草药', '3', '回复生命', '消耗品']);
    assert.deepEqual(await inv.ensure(), { ok: true, changes: [] });
    assert.equal(api.calls.imports.length, 1);
    const bare = hostApi(hostTables());
    delete bare.updateRow;
    const blocked = await createInventoryTables({ api: bare }).ensure();
    assert.deepEqual([blocked.reason, blocked.missing], ['inventory-host-unsupported', ['updateRow']]);
    assert.equal(bare.calls.imports.length, 0);
});


test('changeQuantities：增减与新建写后读回，用尽删行，不足或缺物品拒收不写；批次只刷新一次；读回不符报未核实', async () => {
    const api = hostApi(hostTables());
    const inv = createInventoryTables({ api });
    const first = await inv.changeQuantities([{ name: '草药', delta: -1 }, { name: '铁剑', delta: 1, description: '普通的铁剑', category: '武器' }]);
    assert.deepEqual(first, { ok: true, applied: [{ name: '草药', before: 3, after: 2 }, { name: '铁剑', before: 0, after: 1 }] });
    assert.equal(api.calls.refresh, 1);
    assert.deepEqual(api.tables.sheet_a.content.at(-1), ['2', '铁剑', '1', '普通的铁剑', '武器']);
    assert.equal((await inv.changeQuantities({ name: '草药', delta: -2 })).ok, true);
    assert.deepEqual(api.calls.remove, [1]);
    assert.equal(inv.read().inventory.items.some((i) => i.name === '草药'), false);
    assert.equal((await inv.changeQuantities({ name: '草药', delta: -1 })).reason, 'inventory-item-missing');
    const short = await inv.changeQuantities({ name: '铁剑', delta: -5 });
    assert.deepEqual([short.reason, short.have, short.applied], ['inventory-quantity-insufficient', 1, []]);
    assert.equal(api.calls.refresh, 2);
    api.corrupt = true;
    assert.equal((await inv.changeQuantities({ name: '铁剑', delta: 1 })).reason, 'inventory-write-unverified');
});

test('setGearRow：按物品名称插入、整行更新与删除，写后读回核对穿戴状态与定义；装配表缺失时不写', async () => {
    const api = hostApi(hostTables());
    const inv = createInventoryTables({ api });
    assert.equal((await inv.setGearRow('铁剑', { equipped: false })).reason, 'gear-table-missing');
    await inv.ensure();
    const record = { category: '装备', rarity: '稀有', slot: '武器', bonusText: '力量+1', equipped: true, definition: { slot: 'weapon', bonus: { ability: 'str', amount: 1 } } };
    assert.equal((await inv.setGearRow('铁剑', record)).ok, true);
    const row = inv.read().gear.rows[0];
    assert.deepEqual([row.name, row.slot, row.rarity, row.equipped, row.definition.slot], ['铁剑', '武器', '稀有', true, 'weapon']);
    assert.equal((await inv.setGearRow('铁剑', { ...record, equipped: false })).ok, true);
    assert.equal(api.calls.update.length, 1);
    assert.equal(inv.read().gear.rows[0].equipped, false);
    assert.equal((await inv.setGearRow('铁剑', null)).ok, true);
    assert.deepEqual(inv.read().gear.rows, []);
    assert.deepEqual(await inv.setGearRow('铁剑', null), { ok: true, changed: false });
});

