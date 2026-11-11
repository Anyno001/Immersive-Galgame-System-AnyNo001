// 与战斗共用数据库日志及 FIFO 写口；只发布经数据库读回确认的 Origin 操作差分。
import { isOriginRecord, mergeOriginRecords, prepareOriginWrite } from '../../scene/origin/origin-log.js';

export function createOriginStore({ tables } = {}) {
    function read({ intent, fresh = false } = {}) {
        let result;
        try {
            if (fresh) tables.client?.invalidate?.();
            result = tables.read({ kinds: ['ledger'] });
        } catch { return { ok: false, reason: 'origin-database-read-failed' }; }
        if (!result?.ok || !Array.isArray(result.ledger)) return { ok: false, reason: result?.reason || 'origin-database-read-failed' };
        const broken = (result.diagnostics || []).filter((d) => d.kind === 'ledger' && String(d.key || '').startsWith('or|'));
        const recoverable = broken.length && intent?.record && broken.every((d) =>
            d.code === 'combat-row-segment-incomplete' && d.key === intent.record.id)
            && tables.matchesIncomplete?.('ledger', intent.record) === true;
        if (broken.length && !recoverable) {
            return { ok: false, reason: 'origin-database-invalid' };
        }
        const merged = mergeOriginRecords(result.ledger);
        if (recoverable && merged.ok && merged.revision !== intent.record.payload.parent) {
            return { ok: false, reason: 'origin-database-conflict' };
        }
        return recoverable && merged.ok ? { ...merged, incomplete: true } : merged;
    }
    async function load({ shouldStart = () => true } = {}) {
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        const made = await tables.ensure();
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        return made?.ok ? read() : { ok: false, reason: made?.reason || 'origin-database-ensure-failed' };
    }
    async function commit(intent, { shouldStart = () => true } = {}) {
        if (!intent?.ok) return { ok: false, reason: intent?.reason || 'origin-database-invalid' };
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        tables.client?.invalidate?.();
        const before = read({ intent });
        if (!before.ok) return before;
        if (intent.unchanged) return before.revision === intent.revision ? before : { ok: false, reason: 'origin-database-conflict' };
        if (before.revision === intent.revision) return before;
        if (before.revision !== intent.record.payload.parent) return { ok: false, reason: 'origin-database-conflict' };
        let result;
        let active = true;
        try { result = await tables.append('ledger', [intent.record], { shouldStart: () => active && shouldStart(), retainOnFailure: false, refresh: false }); }
        catch { result = { ok: false, reason: 'origin-database-write-failed' }; }
        finally { active = false; }
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        tables.client?.invalidate?.();
        const verified = read();
        if (verified.ok && verified.revision === intent.revision) return verified;
        return { ok: false, reason: result?.reason || verified.reason || 'origin-database-write-unverified' };
    }
    return { read, load, prepare: prepareOriginWrite, commit, isRecord: isOriginRecord };
}
