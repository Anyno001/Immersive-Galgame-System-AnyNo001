import { parseTables } from './table-parser.js';

// Only the sheet name selects a category; never infer a record from its contents.
export const RECORD_TABLE_KEYWORDS = Object.freeze({
    map: Object.freeze(['地图', '地点']),
    diary: Object.freeze(['日记']),
    inventory: Object.freeze(['物品']),
    relationships: Object.freeze(['关系', '势力']),
});

export function matchesRecordTable(name, category) {
    const keywords = RECORD_TABLE_KEYWORDS[category];
    return Boolean(keywords && keywords.some(word => String(name || '').includes(word)));
}

export function selectRecordTables(readResult, category) {
    if (!Object.hasOwn(RECORD_TABLE_KEYWORDS, category)) {
        return { status: 'invalid-category', tables: [], reason: category };
    }
    if (!readResult || readResult.ok === false) {
        return { status: 'read-error', tables: [], reason: String(readResult?.reason || '读取失败') };
    }
    const tables = parseTables(readResult.data).filter(table => matchesRecordTable(table.name, category));
    if (!tables.length) return { status: 'no-tables', tables: [], reason: '' };
    return { status: tables.every(table => table.rows.length === 0) ? 'empty' : 'ready', tables, reason: '' };
}
