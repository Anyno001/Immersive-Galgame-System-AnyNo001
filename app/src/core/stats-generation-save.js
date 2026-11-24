const fail = (reason, stage = 'save') => ({ ok: false, reason, stage });
const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const slot = record => record.payload?.key || (record.type === 'floor'
    ? `floor:${record.anchor?.messageId}:${record.anchor?.swipeId}` : record.type);

function matchesBase(intent, rows) {
    if (intent.records.some(record => rows.some(row => row.id === record.id && !same(row, record)))) return false;
    return intent.bases.every(([key, base]) => {
        const history = rows.filter(row => slot(row) === key);
        const at = base === null ? -1 : history.findIndex(row => row.id === base);
        if (base !== null && at < 0) return false;
        const added = history.slice(at + 1);
        const expected = intent.records.filter(row => slot(row) === key);
        return added.length <= expected.length && added.every((row, i) => same(row, expected[i]));
    });
}

export function createStatsGenerationSave({ intents, tables, chatId }) {
    function pending() { return intents.read(chatId()); }
    function read(intent, alive, { allowMissing = true } = {}) {
        if (!alive()) return fail('request-stale');
        const db = tables();
        if (!db.ok) return fail(db.reason || 'stats-log-read-failed', 'read');
        db.invalidate?.();
        const proof = intent?.records.map(record => ({ kind: 'stats', record })) || [];
        const value = db.read({ kinds: ['stats'], recoveryRecords: proof });
        if (!alive()) return fail('request-stale');
        if (!value?.ok) return fail(value?.reason || 'stats-log-read-failed', 'read');
        if (!Array.isArray(value.stats) || value.layoutPending) {
            if (allowMissing) return { ok: true, db, rows: [], tableMissing: true, layout: value.layout === 'v2' ? 'v2' : 'legacy' };
            return fail(value?.reason || 'stats-log-read-failed', 'read');
        }
        for (const issue of value.diagnostics || []) {
            if (issue.kind !== 'stats') continue;
            const record = intent?.records.find(item => item.id === issue.key);
            if (issue.code !== 'combat-row-segment-incomplete' || !record || db.matchesIncomplete?.(record) !== true)
                return record ? fail('stats-generation-record-conflict') : fail('stats-log-damaged', 'read');
        }
        return { ok: true, db, rows: value.stats, tableMissing: false, layout: value.layout === 'v2' ? 'v2' : 'legacy' };
    }
    function prepare(key, records, result, alive, beforeRows, layout) {
        const held = pending();
        if (!held.ok || held.intent) return held.ok ? fail('stats-generation-save-pending') : held;
        if (!Array.isArray(beforeRows)) return fail('stats-generation-base-unavailable');
        let resolvedLayout = layout === 'v2' || layout === 'legacy' ? layout : null;
        if (!resolvedLayout) {
            try {
                const db = tables();
                const probe = db?.ok ? db.read({ kinds: ['stats'] }) : null;
                if (probe?.ok && (probe.layout === 'v2' || probe.layout === 'legacy')) resolvedLayout = probe.layout;
            } catch { /* 无可用布局时按缺省省略 */ }
        }
        const bases = [...new Set(records.map(slot))].map(key => [key, beforeRows.filter(row => slot(row) === key).at(-1)?.id || null]);
        const intent = JSON.parse(JSON.stringify({ version: 1, id: `sg-${records[0].id}`,
            chatId: chatId(), ...(resolvedLayout ? { layout: resolvedLayout } : {}), key, records, bases, result }));
        if (!alive()) return fail('request-stale');
        const saved = intents.save(intent.chatId, intent);
        return saved.ok ? { ok: true, intent } : saved;
    }

    async function recover(alive) {
        const held = pending();
        if (!held.ok || !held.intent) return held.ok ? { ok: true, skipped: true } : held;
        const intent = held.intent;
        let state = read(intent, alive, { allowMissing: true });
        if (!state.ok) return state;
        // 延迟建表：成功生成待写入数据时若数值表尚不存在，先建表再插数据。
        if (state.tableMissing) {
            const made = typeof state.db.ensure === 'function' ? await state.db.ensure({ shouldStart: alive }) : { ok: false, reason: 'stats-log-create-failed' };
            if (!alive()) return fail('request-stale');
            if (!made?.ok) return fail(made?.reason || 'stats-log-create-failed');
            state = read(intent, alive, { allowMissing: false });
            if (!state.ok) return state;
        }
        if (intent.records.some(record => state.rows.some(row => row.id === record.id && !same(row, record))))
            return fail('stats-generation-record-conflict');
        const missing = intent.records.filter(record => !state.rows.some(row => same(row, record)));
        if (missing.length) {
            if (!matchesBase(intent, state.rows)) return fail('stats-generation-log-conflict');
            const shouldStart = () => {
                const current = read(intent, alive, { allowMissing: false });
                return current.ok && matchesBase(intent, current.rows);
            };
            try {
                await state.db.append(missing, { shouldStart, retainOnFailure: false, refresh: false,
                    recoverSegments: true, recoveryRecords: intent.records.map(record => ({ kind: 'stats', record })) });
            } catch { /* 只以原记录的权威回读判定提交结果。 */ }
            state = read(intent, alive, { allowMissing: false });
            if (!state.ok) return state;
        }
        if (intent.records.some(record => state.rows.some(row => row.id === record.id && !same(row, record))))
            return fail('stats-generation-record-conflict');
        if (!intent.records.every(record => state.rows.some(row => same(row, record)))) return fail('stats-generation-save-unverified');
        if (!alive()) return fail('request-stale');
        const cleared = intents.save(intent.chatId, null);
        return cleared.ok ? { ...intent.result, effects: matchesBase(intent, state.rows) ? intent.result.effects : {}, ok: true, recovered: true, rows: state.rows } : cleared;
    }
    return { pending, read, prepare, recover };
}
