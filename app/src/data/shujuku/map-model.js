import { parseTables } from './table-parser.js';
import { matchesRecordTable } from './record-tables.js';

const REQUIRED = ['地点ID', '上级地点ID', '名称', 'x', 'y', '说明', '角色', '排序'];
const value = (row, index) => index < 0 ? '' : String(row[index] ?? '').trim();
const coordinate = (raw) => {
    if (raw === '') return null;
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
};

// This contract describes newly authored map sheets, not a migration of existing user sheets.
export function buildMapModel(tables) {
    const matches = (Array.isArray(tables) ? tables : []).filter(table => matchesRecordTable(table.name, 'map'));
    if (!matches.length) return { status: 'no-tables', tables: [] };
    return { status: 'ready', tables: matches.map(buildMapTable) };
}

export function readMapModel(readResult) {
    if (!readResult || readResult.ok === false) {
        return { status: 'read-error', reason: String(readResult && readResult.reason || '读取地图失败'), tables: [] };
    }
    return buildMapModel(parseTables(readResult.data));
}

function buildMapTable(table) {
    const columns = Array.isArray(table.columns) ? table.columns : [];
    const rows = Array.isArray(table.rows) ? table.rows : [];
    const indices = Object.fromEntries(REQUIRED.map(key => [key, columns.indexOf(key)]));
    const missingColumns = REQUIRED.filter(key => indices[key] < 0);
    const diagnostics = missingColumns.map(key => `缺少列：${key}`);
    const idCounts = new Map();
    const locations = rows.map((raw, index) => {
        const row = Array.isArray(raw) ? raw : [];
        const rowId = value(row, indices['地点ID']);
        const parentRowId = value(row, indices['上级地点ID']);
        const name = value(row, indices['名称']);
        const rawX = value(row, indices.x);
        const rawY = value(row, indices.y);
        const x = coordinate(rawX);
        const y = coordinate(rawY);
        const issues = [];
        if (!rowId) issues.push('缺少地点ID');
        if (!name) issues.push('缺少名称');
        if ((rawX && x === null) || (rawY && y === null)) issues.push('坐标超出 0–1');
        if (Boolean(rawX) !== Boolean(rawY)) issues.push('坐标未成对填写');
        if (rowId) idCounts.set(rowId, (idCounts.get(rowId) || 0) + 1);
        const characters = value(row, indices['角色']).split(/[、,，;；\n]+/).map(part => part.trim()).filter(Boolean);
        return {
            id: `${table.uid}:${rowId || `row-${index + 1}`}`,
            rowId, parentRowId, parentId: null, name, x, y,
            description: value(row, indices['说明']), characters,
            order: Number(value(row, indices['排序'])) || 0, rowIndex: index, issues,
        };
    });
    for (const loc of locations) {
        if (loc.rowId && idCounts.get(loc.rowId) > 1) {
            loc.id += `:row-${loc.rowIndex + 1}`;
            loc.issues.push('地点ID重复');
        }
    }
    const byId = new Map(locations.filter(loc => loc.rowId && idCounts.get(loc.rowId) === 1).map(loc => [loc.rowId, loc]));
    for (const loc of locations) {
        if (!loc.parentRowId) continue;
        const parent = byId.get(loc.parentRowId);
        if (!parent) { loc.issues.push('上级地点不存在或不唯一'); continue; }
        const seen = new Set([loc.rowId]);
        let cursor = parent;
        while (cursor && !seen.has(cursor.rowId)) {
            seen.add(cursor.rowId);
            cursor = byId.get(cursor.parentRowId);
        }
        if (cursor) { loc.issues.push('父级循环'); continue; }
        loc.parentId = parent.id;
    }
    if (!rows.length) diagnostics.push('地图表为空');
    return { uid: table.uid, name: table.name, columns, rows, missingColumns, diagnostics, locations };
}

export function getMapChildren(table, parentId = null) {
    return (table && table.locations || [])
        .filter(loc => loc.parentId === parentId)
        .sort((a, b) => a.order - b.order || a.rowIndex - b.rowIndex);
}

export function locateMapScene(model, sceneName) {
    const name = String(sceneName || '').trim();
    if (!name) return { location: null, ambiguous: false };
    const hits = (model && model.tables || []).flatMap(table => table.locations
        .filter(loc => loc.name === name && !loc.issues.includes('地点ID重复'))
        .map(location => ({ table, location })));
    return { location: hits.length === 1 ? hits[0] : null, ambiguous: hits.length > 1 };
}
