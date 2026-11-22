import { COMBAT_TABLE_SPECS, decodeCombatRows, matchingCombatParts } from './combat-tables.js';
import { IGS_LAYOUT_ID, IGS_LAYOUT_RECORD, IGS_TABLE_SPECS } from './igs-table-specs.js';

const fail = reason => ({ ok: false, status: 'failed', reason });
const supportedMarker = record => Object.keys(IGS_LAYOUT_RECORD).every(key => key === 'payload'
    ? record.payload?.version === 1 && record.payload.layout === IGS_LAYOUT_ID && Object.keys(record.payload).length === 2
    : record[key] === IGS_LAYOUT_RECORD[key]);
const recoverable = (kind, sheet, diagnostics, records, cellMax, specs) => diagnostics.every(issue => {
    if (issue.code !== 'combat-row-segment-incomplete') return false;
    const spec = specs[kind];
    const expected = records.find(item => item.kind === kind && item.record && spec.keyOf(spec.toCells(item.record)) === issue.key);
    if (!expected) return false;
    const parts = matchingCombatParts(kind, sheet, expected.record, cellMax, specs);
    return parts !== null && parts.size > 0;
});

export function resolveIgsLayout(sheets, evidence, { recoveryRecords = [], cellMax } = {}) {
    if (!Array.isArray(recoveryRecords)) return fail('igs-recovery-record-invalid');
    const markers = sheets.filter(sheet => sheet.name === IGS_TABLE_SPECS.layout.name);
    let markerPending = false;
    if (markers.length > 1) return fail('igs-layout-ambiguous');
    if (markers.length) {
        if (IGS_TABLE_SPECS.layout.columns.some(column => !markers[0].columns.includes(column))) {
            return fail('igs-layout-invalid');
        }
        const decoded = decodeCombatRows('layout', markers[0], IGS_TABLE_SPECS);
        if (decoded.diagnostics.length) {
            markerPending = recoverable('layout', markers[0], decoded.diagnostics,
                [{ kind: 'layout', record: IGS_LAYOUT_RECORD }], cellMax, IGS_TABLE_SPECS);
            if (!markerPending || decoded.records.length) return fail('igs-layout-invalid');
        }
        if (decoded.records.length) {
            if (decoded.records.some(({ record }) => !supportedMarker(record))) return fail('igs-layout-unsupported');
            return { ok: true, status: 'ready', layout: 'v2', marked: true };
        }
        if (markers[0].rows.length && !markerPending) return fail('igs-layout-invalid');
    }
    const legacy = Object.entries(COMBAT_TABLE_SPECS);
    for (const [kind, spec] of legacy) {
        const found = sheets.filter(sheet => sheet.name === spec.name);
        if (found.length > 1) return fail('igs-layout-ambiguous');
        if (found.length && spec.columns.some(column => !found[0].columns.includes(column))) return fail('igs-legacy-table-invalid');
        if (!found[0]?.rows.length) continue;
        const decoded = decodeCombatRows(kind, found[0]);
        if (decoded.diagnostics.length && !recoverable(kind, found[0], decoded.diagnostics,
            recoveryRecords, cellMax, COMBAT_TABLE_SPECS)) {
            return fail('igs-legacy-records-invalid');
        }
    }
    const ownNewTables = ['attribute', 'origin', 'points'].map(kind => IGS_TABLE_SPECS[kind].name);
    if (ownNewTables.some(name => sheets.filter(sheet => sheet.name === name).length > 1)) return fail('igs-layout-ambiguous');
    if (sheets.some(sheet => ownNewTables.includes(sheet.name) && sheet.rows.length)) return fail('igs-layout-marker-missing');
    if (!evidence?.ok) return evidence || fail('igs-legacy-evidence-unavailable');
    const hasRecords = sheets.some(sheet => legacy.some(([, spec]) => spec.name === sheet.name) && sheet.rows.length);
    if (markerPending && (hasRecords || evidence.exists)) return fail('igs-layout-conflict');
    return { ok: true, status: 'ready', layout: hasRecords || evidence.exists ? 'legacy' : 'v2',
        marked: false, markerPending, id: IGS_LAYOUT_ID };
}
