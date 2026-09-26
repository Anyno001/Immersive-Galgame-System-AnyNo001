import { parseTables } from './table-parser.js';
import { isImportantCharactersTable, matchesRecordTable } from './record-tables.js';

const LEGACY_FIELDS = ['地点ID', '上级地点ID', '名称', 'x', 'y', '说明', '角色', '排序'];
const PLACE_FIELDS = ['row_id', '上级地点ID', '地点名称', 'x', 'y', '场景描述'];
const PLACE_SHEET_UID = 'sheet_chang_jing_di_dian_biao';
const mapFields = table => table.uid === PLACE_SHEET_UID || table.name === '场景地点表'
    ? { fields: PLACE_FIELDS, place: true } : { fields: LEGACY_FIELDS, place: false };
const BASEMAP_FIELDS = ['地图底图', '底图'];
const DATA_URL_MAX_CHARS = 12_000_000; // 约 8 MiB 二进制对应的 base64 长度上限
const value = (row, index) => index < 0 ? '' : String(row[index] ?? '').trim();
const coordinate = (raw) => {
    if (raw === '') return null;
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
};

// 新地点表按原有列读取，旧地图表继续使用既有列名与静态人物名单。
export function buildMapModel(tables) {
    const source = Array.isArray(tables) ? tables : [];
    const matches = source.filter(table => matchesRecordTable(table.name, 'map'));
    if (!matches.length) return { status: 'no-tables', tables: [] };
    const maps = matches.map(buildMapTable);
    const characterTable = source.find(isImportantCharactersTable);
    const nameIndex = characterTable?.columns?.indexOf('姓名') ?? -1;
    const locationIndex = characterTable?.columns?.indexOf('所在地点') ?? -1;
    if (nameIndex >= 0 && locationIndex >= 0) {
        const byName = new Map();
        for (const map of maps) for (const location of map.locations) {
            if (!map.place || !location.name || !location.rowId || location.issues.includes('地点ID重复')) continue;
            const hits = byName.get(location.name) || [];
            hits.push(location);
            byName.set(location.name, hits);
        }
        for (const row of characterTable.rows || []) {
            if (!Array.isArray(row)) continue;
            const name = String(row[nameIndex] ?? '').trim();
            const place = String(row[locationIndex] ?? '').trim();
            const hits = byName.get(place) || [];
            if (name && hits.length === 1 && !hits[0].characters.includes(name)) hits[0].characters.push(name);
        }
    }
    return { status: 'ready', tables: maps };
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
    const { fields, place } = mapFields(table);
    const indices = Object.fromEntries(fields.map(key => [key, columns.indexOf(key)]));
    const missingColumns = fields.filter(key => indices[key] < 0);
    const diagnostics = missingColumns.map(key => `缺少列：${key}`);
    const [idKey, parentKey, nameKey, , , descriptionKey] = fields;
    const idCounts = new Map();
    const locations = rows.map((raw, index) => {
        const row = Array.isArray(raw) ? raw : [];
        const rowId = value(row, indices[idKey]);
        const parentRowId = value(row, indices[parentKey]);
        const name = value(row, indices[nameKey]);
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
        const characters = place ? [] : value(row, indices['角色']).split(/[、,，;；\n]+/).map(part => part.trim()).filter(Boolean);
        return {
            id: `${table.uid}:${rowId || `row-${index + 1}`}`,
            rowId, parentRowId, parentId: null, name, x, y,
            description: value(row, indices[descriptionKey]), characters,
            order: place ? 0 : Number(value(row, indices['排序'])) || 0, rowIndex: index, issues,
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
    return { uid: table.uid, name: table.name, columns, rows, missingColumns, diagnostics, locations, ...(place ? { place: true } : {}) };
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

// 底图字段读取：按 BASEMAP_FIELDS 顺序取第一个命中的列；校验为安全 URL。
function basemapColumnIndex(columns) {
    for (const name of BASEMAP_FIELDS) {
        const index = columns.indexOf(name);
        if (index >= 0) return index;
    }
    return -1;
}

// 仅允许 http(s) 或 data:image/png|jpeg|webp；拒绝脚本协议、HTML 与用户 SVG。
export function sanitizeMapBasemapUrl(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(text)) {
        return text.length <= DATA_URL_MAX_CHARS ? text : '';
    }
    return '';
}

// 当前层底图：收集本层子行的底图值，去重后恰好一个才绑定；多个不同值报冲突，不猜选。
// 父行自己的底图字段属于父层，不传给子层。
export function resolveMapBasemap(table, parentId) {
    const index = basemapColumnIndex(table?.columns || []);
    if (index < 0) return { status: 'none', url: '', reason: '' };
    const children = getMapChildren(table, parentId);
    const values = [...new Set(children
        .map(loc => sanitizeMapBasemapUrl(loc.rawBasemap ?? value(table.rows[loc.rowIndex], index)))
        .filter(Boolean))];
    if (values.length === 0) return { status: 'none', url: '', reason: '' };
    if (values.length > 1) return { status: 'conflict', url: '', reason: '本层底图配置不一致' };
    return { status: 'ok', url: values[0], reason: '' };
}

// 本层底图 URL 是否为非法地址（有字段但全部被校验拒绝）。
export function hasInvalidBasemap(table, parentId) {
    const index = basemapColumnIndex(table?.columns || []);
    if (index < 0) return false;
    return getMapChildren(table, parentId).some(loc => {
        const raw = value(table.rows[loc.rowIndex], index);
        return Boolean(raw) && !sanitizeMapBasemapUrl(raw);
    });
}
