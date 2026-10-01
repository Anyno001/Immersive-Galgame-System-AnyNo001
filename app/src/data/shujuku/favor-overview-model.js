import { parseTables } from './table-parser.js';
import { normalizeStatusHudTables, parseMetricCell } from './status-hud-model.js';

// 好感总览：只读状态栏「读取表格」里用户自选的表（与 HUD 条同一读取路径），每行一位角色。
// 数值解析复用 HUD 条的 parseMetricCell，页面数值与状态栏一致；不写数据库、不推断数值。
const NAME_COLUMNS = Object.freeze(['角色姓名', '角色名', '姓名', '名字', '人物', '角色', '名称']);
const ROW_ID_RE = /^(row_?id|id|序号)$/i;
const TIME_HEADER_RE = /时间|日期|time|date/i;
// 与 HUD 条「好感」配色规则同一词族；其余指标（信任、了解等）不进总览。
const FAVOR_LABEL_RE = /好感|喜欢|爱意|爱慕/;

function pickTables(all, picks) {
    const chosen = [];
    for (const pick of picks) {
        const table = all.find(item => pick.uid && item.uid === pick.uid) || all.find(item => pick.name && item.name === pick.name);
        if (table && !chosen.includes(table)) chosen.push(table);
    }
    return chosen;
}

function nameColumnIndex(columns) {
    for (const name of NAME_COLUMNS) {
        const index = columns.findIndex(column => String(column || '').trim() === name);
        if (index >= 0) return index;
    }
    return columns.findIndex(column => !ROW_ID_RE.test(String(column || '').trim()));
}

// 状态：no-selection（状态栏未选表）/ read-error / no-tables（所选表已不存在）/ empty（表里没有数值）/ ready。
export function buildFavorOverviewModel(readResult, selectedTables) {
    const picks = normalizeStatusHudTables(selectedTables);
    if (!picks.length) return { status: 'no-selection', tables: [], people: [] };
    if (!readResult || readResult.ok === false) {
        return { status: 'read-error', reason: String(readResult?.reason || readResult?.error || '读取失败'), tables: [], people: [] };
    }
    const tables = pickTables(parseTables(readResult.data), picks);
    if (!tables.length) return { status: 'no-tables', tables: [], people: [] };
    const people = [];
    for (const table of tables) {
        const columns = Array.isArray(table.columns) ? table.columns : [];
        const nameIdx = nameColumnIndex(columns);
        if (nameIdx < 0) continue;
        (table.rows || []).forEach((row, rowIndex) => {
            const name = String(row?.[nameIdx] ?? '').trim();
            if (!name) return;
            const metrics = [];
            columns.forEach((column, index) => {
                const header = String(column || '').trim();
                if (index === nameIdx || ROW_ID_RE.test(header) || TIME_HEADER_RE.test(header)) return;
                const text = String(row?.[index] ?? '').trim();
                if (!text) return;
                for (const metric of parseMetricCell(text, header) || []) {
                    if (FAVOR_LABEL_RE.test(metric.label) && !metrics.some(item => item.label === metric.label)) metrics.push({ label: metric.label, percent: metric.percent, display: metric.display });
                }
            });
            if (metrics.length) people.push({ id: `${table.uid}:${rowIndex}`, uid: table.uid, source: table.name, name, metrics });
        });
    }
    return { status: people.length ? 'ready' : 'empty', tables: tables.map(table => ({ uid: table.uid, name: table.name })), people };
}
