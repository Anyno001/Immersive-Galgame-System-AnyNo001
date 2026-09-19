export function parseTables(raw) {
    if (!raw || typeof raw !== 'object') return [];
    return Object.values(raw)
        .filter(v => v && typeof v.uid === 'string' && v.uid.startsWith('sheet_'))
        .sort((a, b) => (a.orderNo || 0) - (b.orderNo || 0))
        .map(s => ({
            uid: s.uid,
            name: s.name || s.uid,
            columns: Array.isArray(s.content) && Array.isArray(s.content[0]) ? s.content[0] : [],
            rows: Array.isArray(s.content) ? s.content.slice(1) : [],
        }));
}

export function buildShujukuPanelState(input = {}) {
    const settings = normalizePanelSettings(input.settings);
    const result = input.result || {};
    const tables = Array.isArray(result.tables) ? result.tables : [];
    const selectedName = settings.sheetName
        ? settings.sheetName
        : tables[0] && tables[0].name || '';
    const selected = tables.find((table) => table.name === selectedName || table.key === selectedName) || tables[0] || null;

    return {
        ok: result.ok !== false,
        reason: result.reason || '',
        selectedName,
        tables: tables.map((table) => ({
            ...table,
            selected: selected && table.name === selected.name,
        })),
        selected: selected ? limitTableRows(selected, settings.rowLimit) : null,
        rowLimit: settings.rowLimit,
        writeMode: settings.writeMode,
        refreshMode: settings.refreshMode,
    };
}

export function formatShujukuPanelMessage(result, fallback = '') {
    if (!result) return fallback;
    if (result.ok === false) return result.reason || fallback || 'shujuku 操作失败';
    return result.message || fallback || 'shujuku 操作已完成';
}

function limitTableRows(table, rowLimit) {
    const limit = Math.max(1, Math.min(1000, Number(rowLimit) || 50));
    return {
        ...table,
        rows: Array.isArray(table.rows) ? table.rows.slice(0, limit) : [],
        truncated: Array.isArray(table.rows) && table.rows.length > limit,
    };
}

function normalizePanelSettings(settings = {}) {
    return {
        sheetName: String(settings.sheetName || '').trim(),
        rowLimit: clampNumber(settings.rowLimit, 1, 1000, 50),
        writeMode: ['confirm', 'direct', 'readonly'].includes(settings.writeMode) ? settings.writeMode : 'confirm',
        refreshMode: ['after-write', 'manual', 'never'].includes(settings.refreshMode) ? settings.refreshMode : 'after-write',
    };
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(numeric)));
}
