import { foldPointsRecords, isPointsRecord } from '../../scene/points/points-log.js';

export function createPointsStore({ tables, chat = () => [], chatId = () => '' }) {
    function read({ intent, fresh = false } = {}) {
        let result;
        try {
            if (fresh) tables.client?.invalidate?.();
            result = tables.read({ kinds: ['ledger'] });
        }
        catch { return { ok: false, reason: 'points-read-failed' }; }
        if (!result?.ok || !Array.isArray(result.ledger)) return { ok: false, reason: result?.reason || 'points-read-failed' };
        const broken = (result.diagnostics || []).filter(d => d.kind === 'ledger' && String(d.key || '').startsWith('pt|'));
        const incomplete = broken.length && intent && broken.every(d => d.code === 'combat-row-segment-incomplete' && d.key === intent.id)
            && tables.matchesIncomplete?.('ledger', intent) === true;
        if (broken.length && !incomplete) return { ok: false, reason: 'points-log-incomplete' };
        const folded = foldPointsRecords(result.ledger, chat(), chatId());
        return folded.ok ? { ...folded, rows: result.ledger, incomplete: Boolean(incomplete) } : folded;
    }
    async function load({ shouldStart = () => true } = {}) {
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        let ready;
        try { ready = await tables.ensure(); }
        catch { return { ok: false, reason: 'points-ensure-failed' }; }
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        return ready?.ok ? read({ fresh: true }) : ready;
    }
    async function commit(record, { shouldStart = () => true } = {}) {
        if (!isPointsRecord(record)) return { ok: false, reason: 'points-log-invalid' };
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        let ready;
        try { ready = await tables.ensure(); }
        catch { return { ok: false, reason: 'points-ensure-failed' }; }
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        if (!ready?.ok) return ready;
        // 调用方在同一把锁里刚读过新数据；写入队列自己会作废缓存重读判重，这里用缓存即可。
        const before = read({ intent: record });
        if (!before.ok) return before;
        const existing = before.rows.find(r => r.id === record.id);
        if (existing) return JSON.stringify(existing.payload) === JSON.stringify(record.payload)
            ? { ...before, present: true } : { ok: false, reason: 'points-log-conflict' };
        const trial = foldPointsRecords([...before.rows, record], chat(), chatId());
        if (!trial.ok) return trial;
        let result;
        let active = true;
        try { result = await tables.append('ledger', [record], {
            retainOnFailure: false, refresh: false, shouldStart: () => active && shouldStart(),
        }); }
        catch { result = { ok: false, reason: 'points-write-failed' }; }
        finally { active = false; }
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        // 写入成功时队列已作废缓存并整表读回核对过，复用那份读数。
        const verified = read({ fresh: result?.ok !== true });
        if (verified.ok && verified.rows.some(r => r.id === record.id && JSON.stringify(r.payload) === JSON.stringify(record.payload))) return verified;
        return { ok: false, reason: result?.reason || verified.reason || 'points-write-unverified' };
    }
    return { read, load, commit };
}
