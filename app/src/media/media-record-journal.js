import { withMediaLock } from './media-lock.js';
import { mediaStateStoreFor } from './media-state-store.js';
import { mediaRequest, tavernHeaders, utf8Base64 } from './tavern-media-http.js';
import { IMAGE_FIELDS, isImageData, isImagePath, imagePaths } from './image-identity.js';
import { RECOVERY_ATTEMPTS, trackRecovery } from '../storage/automatic-recovery.js';

export const MEDIA_BACKUP_FILES = ['igs-cg-records.json', 'igs-asset-records.json', 'igs-photo-records.json', 'igs-map-records.json'];
const journals = new WeakMap();
const lean = value => {
    if (!value) return null;
    if (IMAGE_FIELDS.some(field => isImageData(value[field]))) return null;
    const { key, ...record } = value;
    return record;
};
const versionOf = row => String(row?.version || '0000000000000:000000:legacy');
const newer = (a, b) => versionOf(a) > versionOf(b) || (versionOf(a) === versionOf(b) && a?.deleted && !b?.deleted);
const referenceSnapshot = value => {
    const fields = IMAGE_FIELDS.filter(field => isImagePath(value?.[field]));
    return fields.length ? Object.fromEntries(fields.map(field => [field, value[field]])) : null;
};
const sameValue = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
};
const sameRecord = (a, b) => Boolean(a && b) && versionOf(a) === versionOf(b) && Boolean(a.deleted) === Boolean(b.deleted)
    && sameValue(a.value, b.value) && sameValue(a.previousValue || null, b.previousValue || null);

export function parseMediaBackup(file, legacyField) {
    if (!file || typeof file !== 'object') throw new Error('media-backup-invalid');
    if (file.version >= 2 && file.records && typeof file.records === 'object') return file.records;
    if (!file[legacyField] || typeof file[legacyField] !== 'object') throw new Error('media-backup-invalid');
    return Object.fromEntries(Object.entries(file[legacyField]).map(([key, value]) => [key, { value, version: '0000000000000:000000:legacy', deleted: false }]));
}

export function createMediaRecordJournal(globalObject, { fileName, legacyField = 'records', list, get = async key => new Map(await list()).get(key), put, remove, beforeFlush = async () => {}, onApply = async () => {} }) {
    const state = mediaStateStoreFor(globalObject);
    const prefix = `${fileName}:`;
    let queue = Promise.resolve(), restoring = null, restored = false, timer = null, lastError = '', stopped = false;
    let logicalTime = 0;
    let retryDelay = 2000;
    let retryAttempts = 0;
    const recoveryNotice = trackRecovery(globalObject);
    let migrationFailures = [];
    let remoteExists = null;
    const pending = new Set();
    const track = job => { pending.add(job); job.finally(() => pending.delete(job)).catch(() => {}); return job; };
    const device = Math.random().toString(36).slice(2, 10);
    const serial = callback => {
        const job = queue.then(() => withMediaLock(globalObject, 'commit', callback));
        queue = job.catch(error => { lastError = error.message || String(error); });
        return job;
    };
    const stamp = () => { logicalTime = Math.max(Date.now(), logicalTime + 1); return `${String(logicalTime).padStart(13, '0')}:000000:${device}`; };
    const localRows = async () => Object.fromEntries((await state.all()).filter(row => row.id.startsWith(prefix) && row.kind === 'record').map(row => [row.id.slice(prefix.length), row]));
    async function readRemote() {
        if (!tavernHeaders(globalObject)) return null;
        // 同步器已有持久化队列和调度；单次失败交还队列，不能在锁内永久等待网络。
        const response = await mediaRequest(globalObject, `/user/files/${fileName}?t=${Date.now()}`, { cache: 'no-store', recover: false }, 8000);
        if (response.status === 404) { remoteExists = false; return {}; }
        if (!response.ok) throw new Error('media-backup-read-failed');
        remoteExists = true;
        return parseMediaBackup(await response.json(), legacyField);
    }
    async function apply(records) {
        // 一次读出本机日志再逐条比对：逐条 state.get 在记录多的手机上会把每次同步拖到数分钟。
        const known = await localRows();
        for (const [key, incoming] of Object.entries(records)) {
            if (stopped) throw new Error('media-stopped');
            if (!incoming || (!incoming.deleted && !incoming.value)) continue;
            const current = known[key] || null;
            logicalTime = Math.max(logicalTime, Number(versionOf(incoming).slice(0, 13)) || 0);
            if (current && !newer(incoming, current)) continue;
            const previous = await get(key) || current?.value || incoming.previousValue;
            await onApply(key, previous, incoming.deleted ? null : incoming.value, incoming.previousValue);
            if (incoming.deleted) await remove(key);
            else await put(key, incoming.value);
            await state.put({ ...incoming, id: prefix + key, kind: 'record', dirty: false });
        }
    }
    function schedule() {
        if (stopped || timer) return;
        if (retryAttempts >= RECOVERY_ATTEMPTS) {
            recoveryNotice.update({ phase: 'failed', message: `媒体备份自动同步 ${retryAttempts} 次仍未完成：${lastError || '备份服务不可用'}。待同步数据已保留在本机。`,
                page: 'data', actionLabel: '打开备份' });
            return;
        }
        timer = (globalObject.setTimeout || setTimeout)(() => {
            timer = null;
            const retry = () => { retryDelay = Math.min(60000, retryDelay * 2); schedule(); };
            void track(flush({ automatic: true, onlyPending: true })).then(result => { if (!result.ok) retry(); }).catch(retry);
        }, retryDelay);
        timer?.unref?.();
    }
    function resetRetry() {
        retryAttempts = 0; retryDelay = 2000;
        recoveryNotice.end();
        (globalObject.clearTimeout || clearTimeout)(timer); timer = null;
    }
    async function restore() {
        if (stopped) throw new Error('media-stopped');
        if (restored) return;
        if (restoring) return restoring;
        restoring = serial(async () => {
            const current = await localRows();
            const initial = new Map(await list());
            for (const [key, row] of Object.entries(current)) {
                if (row.prepared || row.deleted || !initial.has(key)) {
                    await onApply(key, initial.get(key), row.deleted ? null : row.value, row.previousValue);
                    if (row.deleted) await remove(key); else if (row.value) await put(key, row.value);
                    await state.put({ ...row, prepared: false, dirty: true });
                }
            }
            const remote = await readRemote();
            if (remote) await apply(Object.fromEntries(Object.entries(remote).filter(([key, row]) => row.deleted || current[key] || !initial.has(key))));
            const existing = await list();
            const known = await localRows();
            for (const [key, record] of existing) {
                if (known[key]) continue;
                const value = lean(record);
                await state.put({ id: prefix + key, kind: 'record', value, localOnly: !value, version: stamp(), dirty: true, deleted: false });
            }
            restored = true;
            if (Object.values(await localRows()).some(row => row.dirty)) schedule();
        }).catch(error => { lastError = error.message || String(error); schedule(); throw error; })
            .finally(() => { restoring = null; });
        return restoring;
    }
    async function write(key, value, action) {
        if (stopped) throw new Error('media-stopped');
        // 网络恢复失败仍可写本机；本机日志比随后读回的旧备份新。
        await restore().catch(() => {});
        return serial(async () => {
            if (stopped) throw new Error('media-stopped');
            const previous = await state.get(prefix + key);
            const resolved = typeof value === 'function' ? await value() : value;
            const record = lean(resolved);
            const existing = await get(key);
            const comparable = existing && resolved?.recordKey ? { ...existing, recordKey: resolved.recordKey } : existing;
            if (previous && !previous.prepared && Boolean(previous.deleted) === !resolved
                && (previous.localOnly || sameValue(previous.value, record || resolved)) && sameValue(lean(comparable) || comparable, record || resolved)) {
                const result = await action(resolved);
                if (result?.ok === false) throw Object.assign(new Error(result.reason || 'media-write-failed'), { result });
                return result;
            }
            const previousValue = referenceSnapshot(existing) || referenceSnapshot(previous?.value) || previous?.previousValue || null;
            const row = { id: prefix + key, kind: 'record', value: record || resolved, previousValue, deleted: !resolved, localOnly: Boolean(resolved && !record), version: stamp(), prepared: true, dirty: true };
            await state.put(row);
            let result;
            try {
                result = await action(resolved);
                if (result && result.ok === false) throw Object.assign(new Error(result.reason || 'media-write-failed'), { result });
            } catch (error) {
                if (previous) await state.put({ ...previous, version: stamp(), prepared: false, dirty: true });
                else await state.remove(row.id);
                throw error;
            }
            // prepared 已持久化且业务事务已提交；最后的日志标记失败可在下次恢复重放。
            try { await state.put({ ...row, value: lean(result?.record || result?.photo || resolved), prepared: false }); }
            catch (error) { lastError = error.message || String(error); }
            resetRetry();
            schedule();
            return result;
        });
    }
    async function flush({ automatic = false, onlyPending = false } = {}) {
        if (stopped) throw new Error('media-stopped');
        if (automatic) {
            if (retryAttempts >= RECOVERY_ATTEMPTS) return { ok: false, reason: 'media-backup-retry-exhausted', recoveryStopped: true };
            retryAttempts += 1;
        }
        await restore();
        if (onlyPending && !Object.values(await localRows()).some(row => row.dirty || row.localOnly)) { resetRetry(); return { ok: true, skipped: true }; }
        migrationFailures = await beforeFlush() || [];
        const result = await serial(async () => {
            if (stopped) throw new Error('media-stopped');
            const headers = tavernHeaders(globalObject);
            if (!headers) return { ok: false, reason: 'media-offline' };
            const remote = await readRemote();
            if (!remote) return { ok: false, reason: 'media-offline' };
            await apply(remote);
            const local = await localRows();
            const records = { ...remote, ...Object.fromEntries(Object.entries(local).filter(([, row]) => !row.localOnly)) };
            const changed = Object.entries(local).some(([key, row]) => !row.localOnly && !sameRecord(row, remote[key]));
            if (changed) {
                const compatible = Object.fromEntries(Object.entries(records).filter(([, row]) => !row.deleted && row.value).map(([key, row]) => [key, row.value]));
                const backup = { version: 2, savedAt: Date.now(), records };
                if (legacyField !== 'records') backup[legacyField] = compatible;
                if (stopped) throw new Error('media-stopped');
                const response = await mediaRequest(globalObject, '/api/files/upload', { method: 'POST', headers, body: JSON.stringify({ name: fileName, data: utf8Base64(JSON.stringify(backup), globalObject) }) });
                if (!response?.ok) throw new Error('media-backup-upload-failed');
                const verified = await readRemote();
                if (!verified || Object.entries(records).some(([key, row]) => !verified[key] || newer(row, verified[key]))) throw new Error('media-backup-concurrent-write');
                await apply(verified);
            }
            // 只有脏行需要清标记；全量逐条 update 与记录总数成正比。
            for (const row of Object.values(records)) if (row.dirty && row.id?.startsWith(prefix)) await state.update(row.id, current => current?.version === row.version ? { ...current, dirty: false } : current);
            lastError = migrationFailures[0]?.error || '';
            return { ok: !Object.values(local).some(row => row.localOnly), skipped: !changed, reason: Object.values(local).some(row => row.localOnly) ? 'media-pixels-pending-upload' : '' };
        });
        if (result.ok) resetRetry();
        else { lastError = result.reason || 'media-backup-failed'; if (!automatic) schedule(); }
        return result;
    }
    const journal = { restore: () => track(restore()), write: (...args) => track(write(...args)), flush: options => {
        if (!options?.automatic) resetRetry();
        return track(flush(options).catch(error => { lastError = error.message || String(error); if (!options?.automatic) schedule(); throw error; }));
    }, remoteExists: () => remoteExists, async deleted(key) { return Boolean((await state.get(prefix + key))?.deleted); },
        async diagnostics() { const rows = await localRows(); return { fileName, records: Object.values(rows).filter(row => !row.deleted).length, tombstones: Object.values(rows).filter(row => row.deleted).length, dirty: Object.values(rows).filter(row => row.dirty).length, pendingPixelUploads: Object.values(rows).filter(row => row.localOnly).length, migrationFailures, lastError, retryAttempts, retryPaused: retryAttempts >= RECOVERY_ATTEMPTS }; },
        stop() { stopped = true; globalObject.removeEventListener?.('online', reconnected); recoveryNotice.end(); (globalObject.clearTimeout || clearTimeout)(timer); timer = null; return Promise.allSettled([...pending, queue]); },
    };
    const reconnected = () => { if (!stopped) { resetRetry(); schedule(); } };
    globalObject.addEventListener?.('online', reconnected);
    let group = journals.get(globalObject);
    if (!group) { group = new Set(); journals.set(globalObject, group); }
    group.add(journal);
    return journal;
}

export async function flushMediaJournals(globalObject, options) {
    const group = [...(journals.get(globalObject) || [])];
    const results = await Promise.allSettled(group.map(journal => journal.flush(options)));
    return { ok: results.every(result => result.status === 'fulfilled' && result.value?.ok), results };
}

export function stopMediaJournals(globalObject) {
    const stopped = [...(journals.get(globalObject) || [])].map(journal => journal.stop());
    journals.delete(globalObject);
    return Promise.all(stopped);
}

export async function mediaJournalDiagnostics(globalObject) {
    return Promise.all([...(journals.get(globalObject) || [])].map(journal => journal.diagnostics()));
}

export async function mediaJournalReferences(globalObject) {
    const rows = await mediaStateStoreFor(globalObject).all();
    const paths = new Set();
    for (const row of rows) if (row.kind === 'record' && !row.deleted) for (const path of imagePaths(row.value)) paths.add(path);
    return paths;
}
