import { wakeRecoveringOperations, linkRecoverySignals } from '../storage/automatic-recovery.js';

// 配置、预设与任务租约只留内存；公开 token 不编码凭据或内部签名。
const taskLeases = new WeakMap();
const objectLike = value => value && typeof value === 'object';
export function imageTaskState(meta) {
    const own = (value, key) => objectLike(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
    const recipe = own(meta, 'promptRecipe');
    for (const value of [meta, own(meta, 'signal'), own(meta, 'caption'), recipe, own(recipe, 'caption')]) {
        const lease = objectLike(value) && taskLeases.get(value);
        if (lease?.state) return lease.state;
    }
    return null;
}
export function inheritImageTaskLease(source, target) {
    const lease = objectLike(source) && (taskLeases.get(source) || taskLeases.get(source.signal));
    if (lease && objectLike(target)) taskLeases.set(target, lease);
    return target;
}

// 用户在设置器里亲手点的生成：给这次任务的 signal 打标记，出图时在本机 NAI 队列里排最前。
const urgentSignals = new WeakSet();
export function markUrgentImageSignal(signal) { if (objectLike(signal)) urgentSignals.add(signal); return signal; }
export function isUrgentImageSignal(...signals) { return signals.some(signal => objectLike(signal) && urgentSignals.has(signal)); }

// 聊天和回复分支的真实事件结束旧目标；普通设置提交不属于这些事件。
export function bindImageTaskTarget({ signal, subscribe, isCurrent }) {
    const controller = new AbortController();
    const linked = linkRecoverySignals([signal, controller.signal]);
    const check = () => { if (!isCurrent()) controller.abort(); };
    const offs = typeof subscribe === 'function'
        ? ['CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED'].map(name => subscribe(name, check)) : [];
    check();
    return { signal: linked.signal, shouldStart: () => !linked.signal.aborted && isCurrent(),
        release() { for (const off of offs) if (typeof off === 'function') off(); linked.release(); } };
}
export const staleImageTask = () => ({ ok: false, reason: 'stale-config', stopGeneration: true,
    error: '生图配置或任务已变化，本次请求已停止；上游请求可能仍在执行' });
export function createImageTaskRuntime({ readState, initialize, subscribe, global = globalThis } = {}) {
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
        if (disposed || typeof token !== 'string') return false;
        const prefix = `igs-image-${identity}-`;
        const issued = token.startsWith(prefix) ? Number(token.slice(prefix.length)) : NaN;
        return Number.isSafeInteger(issued) && issued > 0 && issued <= version;
    }
    function refresh() {
        // 新配置属于下一次任务；在途请求和写词后的交接继续使用原快照。
        const previous = version;
        try {
            current();
            if (version !== previous) wakeRecoveringOperations(global);
        } catch { /* 当前配置暂不可读不影响已经捕获的任务。 */ }
    }
    const unsubscribe = subscribe?.(refresh);
    return {
        refresh,
        recoveryGlobal: global,
        readCurrentState: () => structuredClone(current().state),
        capture(meta = {}) {
            try {
                const inherited = [meta, meta.signal, meta.caption, meta.promptRecipe, meta.promptRecipe?.caption]
                    .filter(objectLike).map(value => taskLeases.get(value))
                    .find(lease => lease?.identity === identity && lease.state && valid(lease.token));
                if (!inherited && initialize && initialize().ok !== true) return staleImageTask();
                const snapshot = inherited || current();
                const privateState = inherited ? inherited.state : structuredClone(snapshot.state);
                const controller = new AbortController();
                const token = snapshot.token;
                const isCurrent = () => {
                    try { return !disposed && !controller.signal.aborted && !meta.signal?.aborted
                        && (!meta.shouldStart || meta.shouldStart() === true); } catch { return false; }
                };
                if (!isCurrent()) return staleImageTask();
                const abort = () => controller.abort();
                meta.signal?.addEventListener?.('abort', abort, { once: true });
                const job = { token, controller }; jobs.add(job);
                return { ok: true, token, state: structuredClone(privateState),
                    signal: controller.signal, isCurrent,
                    bind(value) {
                        if (objectLike(value)) taskLeases.set(value, { identity, token, state: privateState });
                    },
                    release() { jobs.delete(job); meta.signal?.removeEventListener?.('abort', abort); } };
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
    // 租约换了新 signal：用户亲手点的标记跟着传下去，嵌套任务一路保留。
    if (isUrgentImageSignal(meta?.signal)) urgentSignals.add(lease.signal);
    lease.bind(guarded);
    lease.bind(guarded.signal);
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
