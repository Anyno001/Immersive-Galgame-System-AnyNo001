import { normalizeAttributeRecord } from '../../combat/schema.js';

const fail = reason => ({ ok: false, reason });
const conflict = () => fail('stats-attribute-conflict');
const stamp = row => JSON.stringify(row);
const baseOf = (rows, targets) => rows.filter(row => !targets.has(row.id)).map(stamp).sort();

// 只读校验也用于战斗冷回放；仅显式恢复可为残段提供证据。
export function readAttributeRows(snapshot, tables, records = []) {
    if (!snapshot?.ok) return snapshot || fail('stats-attribute-read-failed');
    if (!Array.isArray(snapshot.attribute)) return fail('combat-attribute-table-missing');
    const proof = records.map(record => ({ kind: 'attribute', record }));
    for (const issue of snapshot.diagnostics || []) {
        if (issue.kind !== 'attribute') continue;
        const record = records.find(row => row.id === issue.key);
        if (!record || issue.code !== 'combat-row-segment-incomplete' || !tables.matchesIncomplete('attribute', record, proof))
            return { ...fail('stats-attribute-record-invalid'), diagnostics: [issue] };
    }
    const rows = [], ids = new Set();
    for (const raw of snapshot.attribute) {
        const parsed = normalizeAttributeRecord(raw);
        if (!parsed.ok || ids.has(parsed.value.id)) return fail('stats-attribute-record-invalid');
        ids.add(parsed.value.id);
        rows.push(parsed.value);
    }
    return { ok: true, rows, layout: snapshot.layout };
}

export function createAttributeStore({ tables, chatId, journal, isCurrent, onConfirmed, onPending }) {
    let tail = Promise.resolve();
    const serial = task => {
        const run = tail.then(task, task);
        tail = run.catch(() => {});
        return run;
    };
    const current = options => isCurrent() && !options?.signal?.aborted && (!options?.shouldStart || options.shouldStart() === true);
    const stale = () => fail('request-stale');
    function status() {
        if (!isCurrent()) return stale();
        const pending = journal.read();
        return pending.ok && pending.intent ? { ...fail('stats-attribute-save-pending'), operation: JSON.stringify(pending.intent.records.map(row => row.id)) } : pending;
    }
    function inspect(records = []) {
        tables.client.invalidate();
        const snapshot = tables.read({ recoveryRecords: records.map(record => ({ kind: 'attribute', record })) });
        if (snapshot.layoutPending) return fail('igs-layout-unconfirmed');
        return readAttributeRows(snapshot, tables, records);
    }
    function compare(view, intent) {
        if (!view.ok) return view;
        const targets = new Map(intent.records.map(row => [row.id, row]));
        if (intent.layout !== view.layout || stamp(baseOf(view.rows, targets)) !== stamp(intent.base)) return conflict();
        const present = [];
        for (const row of view.rows) {
            if (!targets.has(row.id)) continue;
            if (stamp(row) !== stamp(targets.get(row.id))) return conflict();
            present.push(row.id);
            targets.delete(row.id);
        }
        return { ok: true, present, missing: [...targets.values()] };
    }
    async function finish(intent, options, recovery) {
        const alive = () => current(options);
        if (!alive()) return stale();
        const proof = recovery ? intent.records : [];
        const before = compare(inspect(proof), intent);
        if (!before.ok) return before;
        let result = { ok: true, written: [], rejected: [], pending: [] };
        if (before.missing.length) result = await tables.append('attribute', before.missing, {
            shouldStart: alive, signal: options?.signal, retainOnFailure: false, recoverSegments: recovery,
            recoveryRecords: proof.map(record => ({ kind: 'attribute', record })),
        });
        if (!alive()) return stale();
        const after = compare(inspect(), intent);
        if (!after.ok || after.missing.length) return !result.ok ? result : !after.ok ? after : fail('stats-attribute-write-unverified');
        if (!alive()) return stale();
        const cleared = journal.replace(intent, null);
        if (!cleared.ok) return cleared;
        if (alive()) onConfirmed?.();
        return { ...result, ok: true, present: before.present };
    }
    function recover(options) {
        return serial(async () => {
            if (!current(options)) return stale();
            const saved = journal.read();
            if (!saved.ok) return saved;
            if (options?.operation !== undefined && (!saved.intent || JSON.stringify(saved.intent.records.map(row => row.id)) !== options.operation)) return stale();
            return saved.intent ? finish(saved.intent, options, true) : inspect();
        });
    }
    function append(input, options = {}) {
        return serial(async () => {
            if (!current(options)) return stale();
            const ready = status();
            if (!ready.ok) return ready;
            const view = inspect();
            if (!view.ok) return view;
            const existing = new Map(view.rows.map(row => [row.id, row]));
            const records = [], present = [];
            for (const value of Array.isArray(input) ? input : [input]) {
                const parsed = normalizeAttributeRecord(value);
                if (!parsed.ok) return fail('combat-attribute-invalid');
                const row = parsed.value, previous = existing.get(row.id);
                if (previous) {
                    if (stamp(previous) !== stamp(row)) return conflict();
                    present.push(row.id);
                } else { records.push(row); existing.set(row.id, row); }
            }
            if (!records.length) return { ok: true, written: [], present, pending: [], rejected: [] };
            const base = baseOf(view.rows, new Set());
            if (options.expectedRows && stamp(baseOf(options.expectedRows, new Set())) !== stamp(base)) return conflict();
            if (!current(options)) return stale();
            const intent = { version: 1, chatId, layout: view.layout, records, base };
            const saved = journal.replace(null, intent);
            if (!saved.ok) return saved;
            try { return await finish(intent, options, false); }
            finally { if (isCurrent() && status().reason === 'stats-attribute-save-pending') onPending?.(); }
        });
    }
    return { status, read() { const s = status(); return s.ok ? inspect() : s; }, append, recover };
}
