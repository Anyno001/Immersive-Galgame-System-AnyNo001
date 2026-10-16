// 配置、预设与任务租约只留内存；公开 token 不编码凭据或内部签名。
const taskLeases = new WeakMap();
const objectLike = value => value && typeof value === 'object';
export function inheritImageTaskLease(source, target) {
    const lease = objectLike(source) && taskLeases.get(source);
    if (lease && objectLike(target)) taskLeases.set(target, lease);
    return target;
}
export const staleImageTask = () => ({ ok: false, reason: 'stale-config', stopGeneration: true,
    error: '生图配置或任务已变化，本次请求已停止；上游请求可能仍在执行' });
export function createImageTaskRuntime({ readState, initialize, subscribe } = {}) {
    let version = 0, signature, disposed = false;
    const identity = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    const jobs = new Set();
    function current() {
        if (disposed) throw new Error('disposed');
        const state = readState();
        const next = JSON.stringify(state);
        if (signature !== next) { signature = next; version++; }
        return { token: `igs-image-${identity}-${version}`, state };
    }
    function valid(token) {
        try { return current().token === token; } catch { return false; }
    }
    function refresh() {
        // 即使写词已结束，也要观察每次成功提交；否则改后改回会复活交接中的旧 caption。
        try { current(); } catch { /* 不可读取时下面的守卫统一拒收 */ }
        for (const job of jobs) if (!valid(job.token)) job.controller.abort();
    }
    const unsubscribe = subscribe?.(refresh);
    return {
        refresh,
        capture(meta = {}) {
            try {
                if (initialize && initialize().ok !== true) return staleImageTask();
                const snapshot = current();
                const inherited = [meta, meta.caption, meta.promptRecipe, meta.promptRecipe?.caption]
                    .filter(objectLike).map(value => taskLeases.get(value)).filter(Boolean);
                if ((meta.expectedConfigToken !== undefined && meta.expectedConfigToken !== snapshot.token)
                    || inherited.some(lease => lease.identity !== identity || lease.token !== snapshot.token))
                    return staleImageTask();
                const controller = new AbortController();
                const token = snapshot.token;
                const isCurrent = () => {
                    try { return !controller.signal.aborted && valid(token) && !meta.signal?.aborted
                        && (!meta.shouldStart || meta.shouldStart() === true); } catch { return false; }
                };
                if (!isCurrent()) return staleImageTask();
                const abort = () => controller.abort();
                meta.signal?.addEventListener('abort', abort, { once: true });
                const job = { token, controller }; jobs.add(job);
                return { ok: true, token, state: structuredClone(snapshot.state),
                    signal: controller.signal, isCurrent,
                    bind(value) {
                        if (objectLike(value)) taskLeases.set(value, { identity, token });
                    },
                    release() { jobs.delete(job); meta.signal?.removeEventListener('abort', abort); } };
            } catch { return staleImageTask(); }
        },
        isCurrent: valid,
        dispose() { disposed = true; unsubscribe?.(); for (const job of jobs) job.controller.abort(); jobs.clear(); },
    };
}

// 调用方停止等待后，底层 promise 仍有拒绝处理；不把迟到结果交给业务层。
export async function runImageTask(runtime, meta, execute) {
    if (!runtime) return execute(meta);
    const lease = runtime.capture(meta);
    if (!lease.ok) return lease;
    const guarded = { ...meta, signal: lease.signal, shouldStart: lease.isCurrent };
    let stop;
    const cancelled = new Promise(resolve => { stop = () => resolve(staleImageTask()); });
    lease.signal.addEventListener('abort', stop, { once: true });
    try {
        if (!lease.isCurrent()) return staleImageTask();
        const result = await Promise.race([Promise.resolve().then(() =>
            lease.isCurrent() ? execute(guarded, lease) : staleImageTask()), cancelled]);
        if (!lease.isCurrent()) return staleImageTask();
        if (result?.ok) {
            for (const entry of [result, ...(result.captions || []), ...(result.slots || []), ...(result.items || [])]) {
                lease.bind(entry); lease.bind(entry.caption);
                lease.bind(entry.promptRecipe); lease.bind(entry.promptRecipe?.caption);
            }
        }
        return result;
    } finally {
        lease.signal.removeEventListener('abort', stop); lease.release();
    }
}
