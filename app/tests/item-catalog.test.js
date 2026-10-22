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
