import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectRecordTables } from '../src/data/shujuku/record-tables.js';
import { buildRecordModel } from '../src/data/shujuku/record-model.js';
import { buildItemCatalog, normalizeItemName } from '../src/data/shujuku/item-catalog.js';

const sheet = (uid, name, content) => ({ uid, name, content });

test('item-catalog:inventory-keywords-fuzzy-match-item-equipment-prop-bag', () => {
    const data = {
        a: sheet('sheet_a', '物品表', [['物品名称'], ['钥匙']]),
        b: sheet('sheet_b', '物品与装备表', [['名称'], ['长剑']]),
        c: sheet('sheet_c', '装备表', [['装备名称'], ['皮甲']]),
        d: sheet('sheet_d', '道具栏', [['道具名称'], ['药水']]),
        e: sheet('sheet_e', '背包', [['名称'], ['地图']]),
        f: sheet('sheet_f', '关系网络表', [['名称'], ['商会']]),
        g: sheet('sheet_g', '城镇地点', [['名称'], ['大街']]),
    };
    const uids = selectRecordTables({ ok: true, data }, 'inventory').tables.map(t => t.uid);
    assert.deepEqual(uids, ['sheet_a', 'sheet_b', 'sheet_c', 'sheet_d', 'sheet_e']);
});

test('item-catalog:equipment-title-column-recognized-without-missing-field-diagnostic', () => {
    const model = buildRecordModel({ ok: true, data: { c: sheet('sheet_c', '装备表', [['装备名称', '描述'], ['皮甲', '轻便']]) } }, 'inventory');
    assert.equal(model.entries[0].title, '皮甲');
    assert.ok(!model.entries[0].detailCells.some(cell => cell.label === '装备名称'));
    assert.deepEqual(model.tables[0].diagnostics, []);
    const plain = buildRecordModel({ ok: true, data: { a: sheet('sheet_a', '物品表', [['物品名称'], ['钥匙']]) } }, 'inventory');
    assert.ok(!plain.tables[0].diagnostics.some(item => item.includes('字段不足')));
});

test('item-catalog:description-column-priority', () => {
    const read = { ok: true, data: {
        a: sheet('sheet_a', '物品表', [['物品名称', '备注', '描述'], ['钥匙', '旧的', '黄铜钥匙'], ['信', '', '']]),
        b: sheet('sheet_b', '装备表', [['装备名称', '效果', '备注'], ['皮甲', '防御+1', '磨损']]),
    } };
    const catalog = buildItemCatalog(read);
    assert.equal(catalog.status, 'ready');
    const byName = Object.fromEntries(catalog.items.map(item => [item.name, item.description]));
    assert.deepEqual(byName, { 钥匙: '黄铜钥匙', 信: '', 皮甲: '磨损' });
});

test('item-catalog:dedupes-normalized-names-across-tables-and-fills-description', () => {
    const read = { ok: true, data: {
        a: sheet('sheet_a', '物品表', [['物品名称'], ['钥匙 ']]),
        b: sheet('sheet_b', '装备表', [['名称', '描述'], ['钥匙', '黄铜']]),
    } };
    const catalog = buildItemCatalog(read);
    assert.equal(catalog.items.length, 1);
    assert.equal(catalog.items[0].name, '钥匙');
    assert.equal(catalog.items[0].description, '黄铜');
    assert.equal(catalog.items[0].uid, 'sheet_a');
});

test('item-catalog:read-error-and-no-tables-pass-through-without-items', () => {
    const failed = buildItemCatalog({ ok: false, reason: 'offline' });
    assert.equal(failed.status, 'read-error');
    assert.deepEqual(failed.items, []);
    const none = buildItemCatalog({ ok: true, data: { g: sheet('sheet_g', '城镇地点', [['名称'], ['大街']]) } });
    assert.equal(none.status, 'no-tables');
    assert.deepEqual(none.items, []);
});

test('item-catalog:normalize-item-name', () => {
    assert.equal(normalizeItemName('  Ｋｅｙ  Ring '), 'key ring');
    assert.equal(normalizeItemName(null), '');
});
