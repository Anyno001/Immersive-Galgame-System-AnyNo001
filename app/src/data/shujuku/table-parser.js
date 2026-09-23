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
