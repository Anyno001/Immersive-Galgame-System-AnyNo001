import { selectRecordTables } from './record-tables.js';

const FIELDS = Object.freeze({
    diary: { title: ['标题', '日记标题', '名称', '主题'], date: ['日期', '时间', '记录时间'], body: ['正文', '内容', '日记内容', '记录', '描述'] },
    inventory: { title: ['物品名称', '名称', '物品', '道具名称'] },
});

function fieldIndex(columns, names) {
    return columns.findIndex(column => names.some(name => String(column || '').trim() === name));
}

export function buildRecordModel(readResult, category) {
    const selection = selectRecordTables(readResult, category);
    if (selection.status !== 'ready') return { ...selection, entries: [] };
    const tables = selection.tables.map(table => {
        const fields = FIELDS[category];
        const missing = fields ? Object.entries(fields).filter(([key, names]) =>
            key !== 'date' && fieldIndex(table.columns, names) < 0).map(([key]) => key) : [];
        const diagnostics = missing.length ? [`字段不足：未识别${missing.join('、')}列，保留原始单元格`] : [];
        if (!table.rows.length) diagnostics.push('表为空');
        return { ...table, diagnostics };
    });
    const entries = tables.flatMap(table => table.rows.map((row, rowIndex) => {
        const cells = (Array.isArray(row) ? row : []).map((raw, index) => ({
            label: String(table.columns[index] || `第${index + 1}列`), value: String(raw ?? '').trim(),
        })).filter(cell => cell.value);
        const fields = FIELDS[category];
        const get = names => { const index = fieldIndex(table.columns, names); return index >= 0 ? String(row?.[index] ?? '').trim() : ''; };
        const title = fields ? get(fields.title) : '';
        const date = fields?.date ? get(fields.date) : '';
        const body = fields?.body ? get(fields.body) : '';
        return { id: `${table.uid}:${rowIndex}`, uid: table.uid, source: table.name, rowIndex,
            title: title || cells[0]?.value || '', date, body, cells, fieldIssues: table.diagnostics };
    }).filter(entry => entry.cells.length));
    if (category === 'diary') {
        // Sort only within a source whose every visible entry has a canonical date.
        // Never reorder rows across sources or invent dates for undated entries.
        for (const table of tables) {
            const indices = entries.map((entry, index) => entry.uid === table.uid ? index : -1).filter(index => index >= 0);
            if (!indices.length || !indices.every(index => {
                const date = entries[index].date;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
                const parsed = new Date(`${date}T00:00:00Z`);
                return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
            })) continue;
            const sorted = indices.map(index => entries[index]).sort((a, b) => a.date.localeCompare(b.date) || a.rowIndex - b.rowIndex);
            indices.forEach((index, position) => { entries[index] = sorted[position]; });
        }
    }
    return { ...selection, tables, status: !entries.length ? 'empty'
        : tables.every(table => table.diagnostics.length) ? 'insufficient-fields' : 'ready', entries };
}
