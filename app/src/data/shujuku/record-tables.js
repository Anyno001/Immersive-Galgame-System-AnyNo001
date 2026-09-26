import { parseTables } from './table-parser.js';

export function isImportantCharactersTable(table) {
    return table?.uid === 'sheet_zhong_yao_jue_se_biao' || table?.name === '重要角色表';
}

// 角色档案按稳定身份优先选择；其余资料页按表名匹配，不从内容推断类型。
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
    const parsed = parseTables(readResult.data);
    // 人物关系以角色档案为真源；旧关系表只在没有重要角色表时兼容读取。
    const characterTables = category === 'relationships' ? parsed.filter(isImportantCharactersTable) : [];
    const tables = characterTables.length ? characterTables : parsed.filter(table => matchesRecordTable(table.name, category)
        && (category !== 'relationships'
            || (table.uid !== 'sheet_guan_xi_wang_luo_biao' && table.name !== '关系网络表')));
    if (!tables.length) return { status: 'no-tables', tables: [], reason: '' };
    return { status: tables.every(table => table.rows.length === 0) ? 'empty' : 'ready', tables, reason: '' };
}
