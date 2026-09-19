import { parseTables } from '../shujuku-panel/panel-model.js';

// 约定的选项表名：命中任一即作为选项来源。「检定建议表」是选项表的别名，与选项表互斥出现。
export const OPTION_TABLE_NAMES = Object.freeze(['选项', '选项表', '行动选项', '检定建议表']);

// 第一列通常是 row_id（只读主键），选项文本取首个非 row_id 列。
function isRowIdColumn(name) {
    const n = String(name || '').trim().toLowerCase();
    return n === 'row_id' || n === 'rowid' || n === 'id' || n === '序号';
}

// 「检定建议表」是多业务字段表（展示文本/对抗/角色/属性…），只取「展示文本」列；
// 其余选项表是宽表（每列一个并列选项），取全部非 row_id 列。
function findDisplayTextColumn(columns) {
    return columns.findIndex((column) => String(column || '').replace(/\s+/g, '') === '展示文本');
}

export function findOptionTable(tables) {
    const list = Array.isArray(tables) ? tables : [];
    for (const wanted of OPTION_TABLE_NAMES) {
        const hit = list.find((t) => String(t && t.name || '').trim() === wanted);
        if (hit) return hit;
    }
    return null;
}

function findDiceCommandColumn(columns) {
    return columns.findIndex((column) => String(column || '').replace(/\s+/g, '') === '骰子命令');
}

// 从一张表里提取选项：返回 {display, send}[]。
// 若表含「展示文本」+「骰子命令」两列（检定建议表），display=展示文本，
// send=展示文本+空格+骰子命令（骰子系统前端凭 DSL 短命令触发数值判定）。
// 只有「展示文本」时，display===send===展示文本；普通宽表取全部非 row_id 列，
// display===send===列值，与旧行为完全兼容。
export function extractOptionTexts(table) {
    if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return [];
    const displayCol = findDisplayTextColumn(table.columns);
    const diceCol = findDiceCommandColumn(table.columns);
    let textCols;
    if (displayCol >= 0) {
        textCols = [displayCol];
    } else {
        textCols = table.columns
            .map((column, index) => ({ column, index }))
            .filter((item) => !isRowIdColumn(item.column))
            .map((item) => item.index);
        if (!textCols.length) textCols = table.columns.length > 1 ? [1] : [0];
    }
    const seen = new Set();
    const out = [];
    for (const row of table.rows) {
        for (const textCol of textCols) {
            const display = String((Array.isArray(row) ? row[textCol] : '') ?? '').trim();
            if (!display) continue;
            const key = display.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            if (displayCol >= 0 && diceCol >= 0) {
                const dice = String((Array.isArray(row) ? row[diceCol] : '') ?? '').trim();
                out.push({ display, send: dice ? `${display} ${dice}` : display });
            } else {
                out.push({ display, send: display });
            }
        }
    }
    return out;
}

// 读取选项：从 shujuku client 读所有表 → 找同名表 → 提取文本。
// 不可用（无插件/无表/读失败）时返回空数组，调用方据此静默不弹。
export function readOptionItems(client) {
    if (!client || typeof client.readTables !== 'function') return [];
    let result;
    try {
        result = client.readTables();
    } catch (error) {
        return [];
    }
    if (!result || result.ok === false) return [];
    const tables = parseTables(result.data);
    const table = findOptionTable(tables);
    if (!table) return [];
    return extractOptionTexts(table);
}
