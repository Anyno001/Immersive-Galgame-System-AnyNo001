import { parseTables } from './table-parser.js';
import { matchesRecordTable } from './record-tables.js';
import { OUTFIT_CLUE_FIELDS } from './record-model.js';
import { ITEM_DESCRIPTION_FIELDS } from './item-catalog.js';

// 装备表方案 A：只有表头含持有者类列才参与，不按物品名或描述猜归属。
export const ITEM_HOLDER_FIELDS = Object.freeze(['持有者', '所属角色', '拥有者', '穿戴者', '角色']);
export const WORN_STATUS_WORDS = Object.freeze(['穿着', '正在穿', '已穿戴', '已装备', '装备中']);
export const NOT_WORN_STATUS_WORDS = Object.freeze(['收纳', '脱下', '未穿戴', '未装备', '损坏', '遗失']);

const cell = (row, index) => (index >= 0 && Array.isArray(row) ? String(row[index] ?? '').trim() : '');
const indexOf = (columns, names) => columns.findIndex((column) => names.includes(String(column || '').trim()));

export function isWornStatus(status) {
    const text = String(status || '');
    return WORN_STATUS_WORDS.some((w) => text.includes(w)) && !NOT_WORN_STATUS_WORDS.some((w) => text.includes(w));
}

// 只读收集某角色的服装线索：角色表「穿着打扮」等列（profile）与装备表中正在穿戴的衣物（worn）。
// 读取失败返回 read-error 与原因，不当作空数据；names 为主名与别名，按单元格全文精确匹配。
export function collectOutfitClues(readResult, names) {
    if (!readResult || readResult.ok === false) {
        return { status: 'read-error', reason: String((readResult && readResult.reason) || '读取失败'), profile: [], worn: [] };
    }
    const wanted = new Set((Array.isArray(names) ? names : [names]).map((n) => String(n || '').trim()).filter(Boolean));
    const profile = [];
    const worn = [];
    for (const table of parseTables(readResult.data)) {
        const columns = table.columns;
        if (matchesRecordTable(table.name, 'inventory')) {
            const holderIdx = indexOf(columns, ITEM_HOLDER_FIELDS);
            const statusIdx = indexOf(columns, OUTFIT_CLUE_FIELDS.itemStatus);
            if (holderIdx < 0 || statusIdx < 0) continue;
            const textIdx = [indexOf(columns, OUTFIT_CLUE_FIELDS.itemTitle), indexOf(columns, ITEM_DESCRIPTION_FIELDS)];
            for (const row of table.rows) {
                if (!wanted.has(cell(row, holderIdx)) || !isWornStatus(cell(row, statusIdx))) continue;
                const text = textIdx.map((i) => cell(row, i)).filter(Boolean).join(' ');
                if (text) worn.push(text);
            }
            continue;
        }
        const nameIdx = indexOf(columns, OUTFIT_CLUE_FIELDS.name);
        const outfitIdx = indexOf(columns, OUTFIT_CLUE_FIELDS.outfit);
        if (nameIdx < 0 || outfitIdx < 0) continue;
        for (const row of table.rows) {
            const text = wanted.has(cell(row, nameIdx)) ? cell(row, outfitIdx) : '';
            if (text) profile.push(text);
        }
    }
    return { status: profile.length || worn.length ? 'ready' : 'empty', reason: '', profile, worn };
}
