import { imagePaths, normalizeImagePath } from './image-identity.js';
import { collectImageReferences } from './image-references.js';
import { mediaStateStoreFor } from './media-state-store.js';
import { MEDIA_BACKUP_FILES, parseMediaBackup, flushMediaJournals } from './media-record-journal.js';
import { mediaRequest, tavernHeaders } from './tavern-media-http.js';
import { localImageCacheFor } from './tavern-image-cache.js';
import { withMediaLock } from './media-lock.js';
import { RECOVERY_ATTEMPTS, trackRecovery } from '../storage/automatic-recovery.js';
const collectors = new WeakMap();
const WRITE_LEASE_MS = 120000;

export function mediaFileGcFor(globalObject = globalThis) {
    if (collectors.has(globalObject)) return collectors.get(globalObject);
    const state = mediaStateStoreFor(globalObject), sources = new Set(), leases = new Map();
    const owner = globalThis.crypto?.randomUUID?.() || `${Date.now()}:${Math.random()}`;
    let draining = null, starting = null, timer = null, leaseTimer = null, lastError = '', stopped = false;
    let generation = 0;
    const recoveryNotice = trackRecovery(globalObject);
    const eligible = row => row.kind === 'gc' && !row.protected && !row.paused && (row.attempts || 0) < RECOVERY_ATTEMPTS;
    const deleting = new Map();
    const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
    // 删除请求在锁外发出；同一路径的新写入要等它落地，否则刚上传的同哈希文件会被这次删除带走。
    const deletingNow = row => Boolean(row?.deletingBy) && row.deletingUntil > Date.now();
    async function reconnected() {
        if (stopped) return;
        const stamp = generation;
        try {
            let changed = false;
            for (const task of (await state.all()).filter(row => row.kind === 'gc' && row.paused)) {
                if (stopped || generation !== stamp) return;
                await state.update(task.id, current => {
                    if (!current?.paused) return current;
                    changed = true;
                    return { ...current, attempts: 0, paused: false, error: '' };
                });
            }
            if (changed && !stopped && generation === stamp) { recoveryNotice.end(); schedule(); }
        } catch (error) { lastError = error.message || String(error); }
    }
    const leaseId = path => `lease:${owner}:${path}`;
    async function leaseRows() {
        for (const path of leases.keys()) await state.put({ id: leaseId(path), kind: 'lease', path, expiresAt: Date.now() + WRITE_LEASE_MS });
        if (!stopped && leases.size && !leaseTimer) {
            leaseTimer = (globalObject.setTimeout || setTimeout)(() => { leaseTimer = null; void leaseRows().catch(() => {}); }, WRITE_LEASE_MS / 3);
            leaseTimer?.unref?.();
        }
    }
    // 远端备份与配置整份下载放在提交锁外；锁内再并入本机日志、租约和素材库，下载期间的新写入不会漏判。
    async function remoteReferences() {
        const backups = new Map();
        for (const fileName of MEDIA_BACKUP_FILES) {
            if (!tavernHeaders(globalObject)) throw new Error('media-offline');
            const response = await mediaRequest(globalObject, `/user/files/${fileName}?t=${Date.now()}`, { cache: 'no-store', recover: false }, 8000);
            let records = {};
            if (response.status !== 404) {
                if (!response.ok) throw new Error('media-reference-check-failed');
                records = parseMediaBackup(await response.json(), fileName === 'igs-cg-records.json' ? 'slots' : 'records');
            }
            backups.set(fileName, records);
        }
        // 全局配置/预设以图片 ID 间接引用原图；旧设备尚未同步删除时继续保护它们。
        const refs = { ids: new Set(), paths: new Set() };
        const response = await mediaRequest(globalObject, `/user/files/igs-settings.json?t=${Date.now()}`, { cache: 'no-store', recover: false }, 8000);
        if (response.status !== 404) {
            if (!response.ok) throw new Error('media-settings-reference-check-failed');
            const file = await response.json();
            if (!file?.settings || typeof file.settings !== 'object') throw new Error('media-settings-reference-check-failed');
            for (const [key, text] of Object.entries(file.settings)) {
                if (file.deletedKeys?.includes(key)) continue;
                let value = text; try { value = JSON.parse(text); } catch { /* 地图是直接路径 */ }
                collectImageReferences(value, refs);
            }
        }
        return { backups, refs };
    }
    async function localReferences({ backups, refs }) {
        const live = new Set(refs.paths), writing = new Set(leases.keys()), local = await state.all(), catalog = new Map();
        for (const row of local) if (row.kind === 'lease' && row.expiresAt > Date.now()) writing.add(row.path);
        for (const fileName of MEDIA_BACKUP_FILES) {
            const records = { ...backups.get(fileName) };
            for (const row of local) if (row.kind === 'record' && row.id.startsWith(`${fileName}:`)) {
                const key = row.id.slice(fileName.length + 1);
                if (!records[key] || String(row.version) >= String(records[key].version)) records[key] = row;
            }
            for (const [key, row] of Object.entries(records)) {
                catalog.set(`${fileName}:${key}`, row);
                if (!row.deleted) for (const path of imagePaths(row.value)) live.add(path);
            }
        }
        for (const id of refs.ids) {
            const row = catalog.get(`igs-asset-records.json:image:${id}`);
            for (const path of imagePaths(row?.value || row?.previousValue)) live.add(path);
        }
        for (const source of sources) for (const record of await source()) for (const path of imagePaths(record)) live.add(path);
        return { live, writing };
    }
    async function references() { const { live, writing } = await localReferences(await remoteReferences()); return new Set([...live, ...writing]); }
    function clearTimer() { (globalObject.clearTimeout || clearTimeout)(timer); timer = null; }
    function schedule(delay = 5000) {
        if (stopped || timer) return;
        timer = (globalObject.setTimeout || setTimeout)(() => { timer = null; void drain({ automatic: true }).catch(() => {}); }, delay);
        timer?.unref?.();
    }
    async function drain({ automatic = false } = {}) {
        if (draining) return draining;
        if (stopped) throw new Error('media-stopped');
        clearTimer();
        const stamp = generation;
        draining = (async () => {
            let tasks = (await state.all()).filter(row => row.kind === 'gc');
            const paused = tasks.filter(row => row.paused || (row.attempts || 0) >= RECOVERY_ATTEMPTS).length;
            if (!automatic) for (const row of tasks) if (row.error || row.paused) await state.put({ ...row, attempts: 0, paused: false, error: '' });
            if (!automatic) recoveryNotice.end();
            tasks = tasks.filter(row => !automatic || eligible(row));
            if (!tasks.length) return { ok: !paused, pending: paused, protected: 0,
                ...(paused && { reason: 'media-gc-retry-exhausted' }) };
            // flush 自己持有 commit 锁，必须在最终引用检查锁之外执行。
            if (!(await flushMediaJournals(globalObject, { automatic, onlyPending: true })).ok) throw new Error('media-backup-pending');
            const remote = await remoteReferences();
            // 锁内只做本机核对并把待删路径标成「删除中」；网络删除在锁外，保存不用排在整轮回收后面。
            const { claimed, protectedCount } = await withMediaLock(globalObject, 'commit', async () => {
                if (stopped || generation !== stamp) throw new Error('media-stopped');
                const { live, writing } = await localReferences(remote);
                const tasks = (await state.all()).filter(row => row.kind === 'gc' && !deletingNow(row) && (!automatic || eligible(row)));
                const claimed = [];
                let protectedCount = 0;
                for (const task of tasks) {
                    if (stopped || generation !== stamp) throw new Error('media-stopped');
                    if (live.has(task.path) || writing.has(task.path)) {
                        protectedCount += 1;
                        await state.put({ ...task, protected: true, waitingForWrite: !live.has(task.path) && writing.has(task.path), attempts: 0, error: '', paused: false });
                        continue;
                    }
                    const row = { ...task, deletingBy: owner, deletingUntil: Date.now() + WRITE_LEASE_MS };
                    await state.put(row);
                    deleting.set(task.path, deferred());
                    claimed.push(row);
                }
                return { claimed, protectedCount };
            });
            let failed = 0;
            for (const task of claimed) {
                const done = deleting.get(task.path);
                try {
                    if (stopped || generation !== stamp) throw new Error('media-stopped');
                    const response = await mediaRequest(globalObject, '/api/images/delete', { method: 'POST', headers: tavernHeaders(globalObject), body: JSON.stringify({ path: task.path }) });
                    if (!response?.ok && response?.status !== 404) throw new Error('media-file-delete-failed');
                    if (!stopped && generation === stamp) await localImageCacheFor(globalObject).drop(task.path);
                    await state.remove(task.id);
                } catch (error) {
                    const { deletingBy: _by, deletingUntil: _until, ...rest } = task;
                    if (error.message === 'media-stopped') await state.put(rest).catch(() => {});
                    else {
                        failed += 1;
                        const attempts = (task.attempts || 0) + 1;
                        await state.put({ ...rest, protected: false, waitingForWrite: false, attempts, paused: attempts >= RECOVERY_ATTEMPTS, error: error.message }).catch(() => {});
                    }
                } finally {
                    if (deleting.get(task.path) === done) deleting.delete(task.path);
                    done?.resolve();
                }
            }
            if (stopped || generation !== stamp) throw Object.assign(new Error('media-stopped'), { recorded: true });
            if (failed) throw Object.assign(new Error('media-file-delete-failed'), { recorded: true });
            lastError = '';
            if (!(await state.all()).some(row => row.kind === 'gc' && row.paused)) recoveryNotice.end();
            if (!(await state.all()).some(row => row.kind === 'gc' && !row.protected)) clearTimer();
            return { ok: true, pending: protectedCount, protected: protectedCount };
        })().catch(async error => {
            lastError = error.message || String(error);
            if (!stopped && generation === stamp) {
                if (!error.recorded) for (const task of (await state.all()).filter(row => row.kind === 'gc' && !deletingNow(row) && (!automatic || eligible(row)))) {
                    const attempts = (task.attempts || 0) + 1;
                    await state.put({ ...task, protected: false, attempts, paused: attempts >= RECOVERY_ATTEMPTS, error: lastError });
                }
                const rows = await state.all(), retryable = rows.filter(eligible);
                if (rows.some(row => row.kind === 'gc' && row.paused)) recoveryNotice.update({ phase: 'failed',
                    message: `服务端文件回收连续失败，已停止自动尝试：${lastError}。回收队列保留，现有图片继续保留。`,
                    page: 'data', actionLabel: '打开备份与缓存' });
                if (retryable.length) schedule(Math.min(60000, 5000 * 2 ** Math.max(...retryable.map(row => row.attempts || 0))));
                else clearTimer();
            }
            throw error;
        }).finally(() => { draining = null; });
        return draining;
    }
    const gc = {
        register(source) { sources.add(source); return () => sources.delete(source); },
        async hold(path) {
            const key = normalizeImagePath(path);
            while (true) {
                const busy = await withMediaLock(globalObject, 'commit', async () => {
                    if (stopped) throw new Error('media-stopped');
                    if (deletingNow(await state.get(`gc:${key}`))) return true;
                    const previous = leases.get(key) || 0; leases.set(key, previous + 1);
                    try { await leaseRows(); }
                    catch (error) { if (previous) leases.set(key, previous); else leases.delete(key); throw error; }
                    return false;
                });
                if (!busy) return;
                const local = deleting.get(key);
                await (local ? local.promise : new Promise(resolve => (globalObject.setTimeout || setTimeout)(resolve, 200)));
            }
        },
        async release(path) {
            const key = normalizeImagePath(path);
            let wake = false;
            await withMediaLock(globalObject, 'commit', async () => {
                const count = (leases.get(key) || 0) - 1;
                if (count > 0) leases.set(key, count); else {
                    leases.delete(key); await state.remove(leaseId(key));
                    await state.update(`gc:${key}`, task => {
                        if (!task?.waitingForWrite) return task;
                        wake = true;
                        return { ...task, protected: false, waitingForWrite: false };
                    });
                }
                if (!leases.size) { (globalObject.clearTimeout || clearTimeout)(leaseTimer); leaseTimer = null; }
            });
            if (wake) schedule();
        },
        async released(old, next) {
            const keep = imagePaths(next);
            let changed = false;
            for (const path of imagePaths(old)) if (!keep.has(path)) {
                changed = true;
                await state.update(`gc:${path}`, previous => ({ ...previous, id: `gc:${path}`, kind: 'gc', path, queuedAt: previous?.queuedAt || Date.now(), attempts: 0, protected: false, waitingForWrite: false, paused: false, error: '' }));
                if (!stopped) await localImageCacheFor(globalObject).drop(path);
            }
            if (changed) schedule();
        },
        async referencesChanged() {
            if (stopped) return;
            const stamp = generation;
            let changed = false;
            for (const task of (await state.all()).filter(row => row.kind === 'gc' && row.protected && !row.waitingForWrite)) {
                if (stopped || generation !== stamp) return;
                await state.update(task.id, current => {
                    if (!current?.protected || current.waitingForWrite) return current;
                    changed = true;
                    return { ...current, protected: false };
                });
            }
            if (changed) schedule();
        },
        drain, references,
        async audit(paths) { const live = await references(); return { referenced: [...live], candidates: (paths || []).map(normalizeImagePath).filter(path => !live.has(path)), pending: (await state.all()).filter(row => row.kind === 'gc') }; },
        async diagnostics() {
            const rows = await state.all(), tasks = rows.filter(row => row.kind === 'gc');
            return { pendingDeletes: tasks.length, protectedDeletes: tasks.filter(row => row.protected).length, failedDeletes: tasks.filter(row => row.error && !row.protected).length,
                pausedDeletes: tasks.filter(row => row.paused).length, activeWrites: rows.filter(row => row.kind === 'lease' && row.expiresAt > Date.now()).length, lastError };
        },
        start() {
            stopped = false;
            globalObject.addEventListener?.('online', reconnected);
            if (starting) return starting;
            const stamp = generation;
            starting = (async () => {
                const rows = await state.all();
                for (const task of rows.filter(row => row.kind === 'gc' && !row.paused && (row.attempts || 0) >= RECOVERY_ATTEMPTS)) {
                    if (stopped || generation !== stamp) return;
                    await state.put({ ...task, paused: true });
                }
                for (const task of rows.filter(row => row.kind === 'gc' && row.protected)) {
                    if (stopped || generation !== stamp) return;
                    if (task.waitingForWrite && rows.some(row => row.kind === 'lease' && row.path === task.path && row.expiresAt > Date.now())) continue;
                    await state.put({ ...task, protected: false, waitingForWrite: false });
                }
                if ((await state.all()).some(eligible)) schedule();
            })().catch(error => { lastError = error.message || String(error); }).finally(() => { starting = null; });
            return starting;
        },
        stop() { stopped = true; globalObject.removeEventListener?.('online', reconnected); recoveryNotice.end(); generation += 1; sources.clear(); (globalObject.clearTimeout || clearTimeout)(timer); (globalObject.clearTimeout || clearTimeout)(leaseTimer); timer = null; leaseTimer = null; return Promise.allSettled([draining, starting].filter(Boolean)); },
    };
    collectors.set(globalObject, gc);
    return gc;
}
