// 与战斗共用数据库日志及 FIFO 写口；只发布经数据库读回确认的 Origin 操作差分。
import { isOriginRecord, mergeOriginRecords, prepareOriginWrite } from '../../scene/origin/origin-log.js';

export function createOriginStore({ tables, kind = 'ledger' } = {}) {
    function layout() {
        return typeof tables.layout === 'function' ? tables.layout() : { ok: true, layout: kind === 'origin' ? 'v2' : 'legacy' };
    }
    function read({ intent, fresh = false } = {}) {
        let result;
        try {
            if (fresh) tables.client?.invalidate?.();
            result = tables.read({ kinds: [kind], recoveryRecords: intent?.record ? [{ kind, record: intent.record }] : [] });
        } catch { return { ok: false, reason: 'origin-database-read-failed' }; }
        if (!result?.ok || !Array.isArray(result[kind])) return { ok: false, reason: result?.reason || 'origin-database-read-failed' };
        // v2 独立表内所有诊断都属于 Origin；legacy 共享战斗日志表只认 or| 记录。
        const isV2 = result.layout === 'v2' || kind === 'origin' && result.layout !== 'legacy';
        const broken = (result.diagnostics || []).filter((d) => d.kind === kind && (isV2 || String(d.key || '').startsWith('or|')));
        const recoverable = broken.length && intent?.record && broken.every((d) =>
            d.code === 'combat-row-segment-incomplete' && d.key === intent.record.id)
            && tables.matchesIncomplete?.(kind, intent.record) === true;
        if (broken.length && !recoverable) {
            return { ok: false, reason: 'origin-database-invalid' };
        }
        const merged = mergeOriginRecords(result[kind]);
        if (recoverable && merged.ok && merged.revision !== intent.record.payload.parent) {
            return { ok: false, reason: 'origin-database-conflict' };
        }
        if (!merged.ok) return merged;
        return { ...merged, layout: result.layout || (isV2 ? 'v2' : 'legacy'), ...(recoverable ? { incomplete: true } : {}) };
    }
    function subscribe(listener) {
        if (typeof tables.subscribe === 'function') return tables.subscribe(listener);
        const client = tables.client;
        let active = true;
        const updated = () => {
            if (!active) return;
            client?.invalidate?.();
            listener();
        };
        const off = () => {
            if (!active) return;
            active = false;
            client?.unregisterCallback?.(updated);
        };
        try { client?.registerCallback?.(updated); }
        catch { off(); }
        return off;
    }
    async function load({ shouldStart = () => true, intent = null } = {}) {
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        const recoveryRecords = intent?.record ? [{ kind, record: intent.record }] : [];
        const made = await tables.ensure({ shouldStart, ...(recoveryRecords.length ? { recoveryRecords } : {}) });
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        return made?.ok ? read({ intent }) : { ok: false, reason: made?.reason || 'origin-database-ensure-failed' };
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
        try { result = await tables.append(kind, [intent.record], {
            shouldStart: () => active && shouldStart(), retainOnFailure: false, refresh: false, recoverSegments: true,
        }); }
        catch { result = { ok: false, reason: 'origin-database-write-failed' }; }
        finally { active = false; }
        if (!shouldStart()) return { ok: false, reason: 'request-stale' };
        tables.client?.invalidate?.();
        const verified = read();
        if (verified.ok && verified.revision === intent.revision) return verified;
        return { ok: false, reason: result?.reason || verified.reason || 'origin-database-write-unverified' };
    }
    return { read, load, subscribe, layout, prepare: prepareOriginWrite, commit, isRecord: isOriginRecord };
}
