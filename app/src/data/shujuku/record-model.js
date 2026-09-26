import { selectRecordTables } from './record-tables.js';

const FIELDS = Object.freeze({
    diary: { author: ['写作角色', '作者', '角色'], chapterTitle: ['篇名', '日记标题', '标题', '主题', '名称'], title: ['写作角色', '角色', '标题', '日记标题', '名称', '主题'], date: ['发生时间', '发生日期', '日期', '时间', '记录时间'], body: ['正文', '内容', '日记内容', '记录', '描述'], related: ['关联角色', '相关角色', '对象'] },
    inventory: { title: ['物品名称', '名称', '物品', '道具名称'], quantity: ['数量', '数目', '个数', '数量值', 'amount', 'count'], category: ['类别', '分类', '类型', '种类', '物品类别', '物品类型'] },
});

const DIARY_CORE_FIELDS = new Set(['写作角色', '作者', '角色', '篇名', '标题', '日记标题', '名称', '主题', '发生时间', '发生日期', '日期', '时间', '记录时间', '正文', '内容', '日记内容', '记录', '描述', '关联角色', '相关角色', '对象']);
const INVENTORY_TITLE_FIELDS = new Set(['物品名称', '名称', '物品', '道具名称']);
const INVENTORY_QUANTITY_FIELDS = new Set(['数量', '数目', '个数', '数量值', 'amount', 'count']);
const INVENTORY_CATEGORY_FIELDS = new Set(FIELDS.inventory.category);

// 宽松日期：识别 2024-06-18、2024/6/18、2024年6月18日、6月18日 及可选 HH:MM，只用于排序与短标签，不改写原值。
export function parseLooseDate(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const full = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(text);
    const short = full ? null : /(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/.exec(text);
    if (!full && !short) return null;
    const year = full ? Number(full[1]) : 0;
    const month = Number(full ? full[2] : short[1]);
    const day = Number(full ? full[3] : short[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const time = /(\d{1,2})[:：](\d{2})/.exec(text.slice((full || short).index + (full || short)[0].length));
    const minutes = time && Number(time[1]) < 24 && Number(time[2]) < 60 ? Number(time[1]) * 60 + Number(time[2]) : 0;
    return { key: ((year * 13 + month) * 32 + day) * 1440 + minutes, label: `${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`, hasYear: Boolean(full) };
}

function isHiddenDetailField(category, label) {
    const value = String(label || '').trim();
    const normalized = value.toLowerCase().replace(/[\s_-]/g, '');
    // 背包详情：数量由详情头独立呈现，格位角标与详情行不重复。
    if (category === 'inventory') return normalized === 'rowid' || normalized === 'id' || INVENTORY_TITLE_FIELDS.has(value) || INVENTORY_QUANTITY_FIELDS.has(value) || INVENTORY_CATEGORY_FIELDS.has(value);
    if (category === 'diary') return DIARY_CORE_FIELDS.has(value);
    return false;
}

function fieldIndex(columns, names) {
    return columns.findIndex(column => names.some(name => String(column || '').trim() === name));
}

// 人际关系显式字段契约：只识别明确列名，不从自然语言描述推断关系。
const RELATIONSHIP_FIELDS = Object.freeze({
    name: ['姓名', '人物', '角色', '名称'],
    role: ['角色类型', '身份', '职业', '称谓'],
    description: ['一句话介绍', '人物描述', '描述', '说明'],
    related: ['人际关系', '相关人员', '关联人员', '相关人物'],
    pairFrom: ['人物A', '主体'],
    pairTo: ['人物B', '对象'],
    relation: ['关系'],
});

// 关系页纯展示模型：人物行（主体/身份/描述/显式相关人员）与成对关系行（A+B+关系）。
// 不跨来源合并同名人物；无法定位的相关人员保留为纯名称条目，不捏造身份与生平。
export function buildRelationshipModel(readResult) {
    const selection = selectRecordTables(readResult, 'relationships');
    if (selection.status !== 'ready') return { ...selection, people: [], edges: [] };
    const people = [];
    const edges = [];
    for (const table of selection.tables) {
        const idx = names => fieldIndex(table.columns, names);
        const nameIdx = idx(RELATIONSHIP_FIELDS.name);
        const roleIdx = idx(RELATIONSHIP_FIELDS.role);
        const descIdx = idx(RELATIONSHIP_FIELDS.description);
        const relatedIdx = idx(RELATIONSHIP_FIELDS.related);
        const fromIdx = idx(RELATIONSHIP_FIELDS.pairFrom);
        const toIdx = idx(RELATIONSHIP_FIELDS.pairTo);
        const relIdx = idx(RELATIONSHIP_FIELDS.relation);
        const hasPairSchema = fromIdx >= 0 && toIdx >= 0 && relIdx >= 0;
        table.rows.forEach((row, rowIndex) => {
            const get = index => index >= 0 ? String(row?.[index] ?? '').trim() : '';
            const cells = (Array.isArray(row) ? row : []).map((raw, index) => ({
                label: String(table.columns[index] || `第${index + 1}列`), value: String(raw ?? '').trim(),
            })).filter(cell => cell.value);
            const from = get(fromIdx);
            const to = get(toIdx);
            if (hasPairSchema && from && to) {
                // 混合表中的成对关系行：只有两端都显式填写才生成边。
                edges.push({ id: `${table.uid}:${rowIndex}`, uid: table.uid, from, to, label: get(relIdx), rowIndex });
                return;
            }
            // 人物行：混合表允许人物列与成对关系列共存；只有“名称+关系”而无另一端时，关系保留为主体属性，不凭空连线。
            if (nameIdx < 0) return;
            const name = get(nameIdx);
            if (!name) return;
            const relatedText = get(relatedIdx);
            const hidden = new Set([nameIdx, roleIdx, descIdx, relatedIdx].filter(index => index >= 0));
            people.push({
                id: `${table.uid}:${rowIndex}`, uid: table.uid, source: table.name, rowIndex, name,
                role: get(roleIdx), description: get(descIdx), relatedText,
                cells, detailCells: cells.filter((cell, index) => !hidden.has(index)),
            });
            if (String(table.columns[relatedIdx] || '').trim() === '人际关系') {
                // 角色档案以“姓名:标签1,标签2; 姓名:标签”明确记录关联。
                for (const part of relatedText.split(/[;；]/).map(text => text.trim()).filter(Boolean)) {
                    const match = /^([^:：]+)[:：](.+)$/.exec(part);
                    if (!match) continue;
                    const target = match[1].trim();
                    if (!target || target === name) continue;
                    for (const label of match[2].split(/[,，]/).map(text => text.trim()).filter(Boolean)) {
                        edges.push({ id: `${table.uid}:${rowIndex}→${target}:${label}`, uid: table.uid, from: name, to: target, label, rowIndex });
                    }
                }
                return;
            }
            for (const item of relatedText.split(/[、,，;；]/).map(part => part.trim()).filter(Boolean)) {
                const match = /^(.+?)[（(]([^（）()]+)[）)]$/.exec(item);
                const target = (match ? match[1] : item).trim();
                if (target && target !== name) edges.push({ id: `${table.uid}:${rowIndex}→${target}`, uid: table.uid, from: name, to: target, label: match ? match[2].trim() : '', rowIndex });
            }
        });
    }
    // 去重：同源、同一无序两人、同一标签只保留一条边。
    const seen = new Set();
    const dedupedEdges = edges.filter(edge => {
        const pair = [edge.from, edge.to].sort();
        const key = `${edge.uid}|${pair[0]}|${pair[1]}|${edge.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    // 成对关系中只有名称、没有人物行的端点：保留为纯名称条目，不捏造身份与描述。
    for (const edge of dedupedEdges) for (const name of [edge.from, edge.to]) {
        if (!people.some(person => person.uid === edge.uid && person.name === name))
            people.push({ id: `${edge.uid}:edge-name:${name}`, uid: edge.uid, source: '', rowIndex: -1, name, role: '', description: '', relatedText: '', cells: [], detailCells: [], synthetic: true });
    }
    return { ...selection, people, edges: dedupedEdges, status: people.length || dedupedEdges.length ? 'ready' : 'empty' };
}

export function buildRecordModel(readResult, category) {
    const selection = selectRecordTables(readResult, category);
    if (selection.status !== 'ready') return { ...selection, entries: [] };
    const tables = selection.tables.map(table => {
        const fields = FIELDS[category];
        const missing = fields ? Object.entries(fields).filter(([key, names]) =>
            !['date', 'quantity', 'author', 'chapterTitle', 'related', 'category'].includes(key)
            && fieldIndex(table.columns, names) < 0).map(([key]) => key) : [];
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
        const author = fields?.author ? get(fields.author) : '';
        const chapterTitle = fields?.chapterTitle ? get(fields.chapterTitle) : '';
        // 兼容：篇名优先；无篇名时沿用旧 title 候选，最后退回首个非空单元格。
        const title = chapterTitle || (fields ? get(fields.title) : '') || cells[0]?.value || '';
        const date = fields?.date ? get(fields.date) : '';
        const body = fields?.body ? get(fields.body) : '';
        const quantity = fields?.quantity ? get(fields.quantity) : '';
        const related = fields?.related ? get(fields.related) : '';
        const itemCategory = fields?.category ? get(fields.category) : '';
        const detailCells = cells.filter(cell => !isHiddenDetailField(category, cell.label));
        return { id: `${table.uid}:${rowIndex}`, uid: table.uid, source: table.name, rowIndex,
            title, author, chapterTitle, date, body, quantity, related, category: itemCategory, cells, detailCells, fieldIssues: table.diagnostics };
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
