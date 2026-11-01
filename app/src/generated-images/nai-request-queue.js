// 仅内存凭据锁：生成与 infill 共用；取消等待不代表上游已停止。
const stale = () => ({ ok: false, reason: 'request-stale', error: '任务已取消或目标失效，停止发送' });
export const naiRequestQueue = createNaiRequestQueue();

function pause(ms, signal) {
    return new Promise(resolve => {
        const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, ms);
        signal?.addEventListener('abort', finish, { once: true });
        if (signal?.aborted) finish();
    });
}

export function createNaiRequestQueue({ now = Date.now, sleep = pause } = {}) {
    const active = new Set(), queue = [], finished = new Map();
    const allowed = entry => {
        try { return !entry.signal?.aborted && (!entry.shouldStart || entry.shouldStart() === true); }
        catch { return false; }
    };
    function drain() {
        for (const [key, at] of finished) if (now() - at >= 60000) finished.delete(key);
        for (let i = 0; i < queue.length;) {
            const entry = queue[i];
            if (!allowed(entry)) {
                queue.splice(i, 1); entry.cleanup(); entry.resolve(stale()); continue;
            }
            if (active.has(entry.key)) { i++; continue; }
            queue.splice(i, 1); active.add(entry.key);
            let sent = false;
            // 不因调用方取消而提前释放凭据；实际执行结束才释放，防止忽略 abort 的宿主双发。
            Promise.resolve().then(async () => {
                const wait = Math.max(0, (finished.get(entry.key) ?? -Infinity) + entry.minIntervalMs - now());
                if (wait > 0) await sleep(wait, entry.signal);
                if (!allowed(entry)) return stale();
                sent = true;
                return entry.execute();
            })
                .then(value => entry.resolve(allowed(entry) ? value : stale()), () => entry.resolve({
                    ok: false, reason: 'nai-request-failed', error: 'NAI 请求失败；发送状态未知，未自动补发' }))
                .finally(() => {
                    if (sent && (!entry.wasSent || entry.wasSent())) finished.set(entry.key, now());
                    entry.cleanup(); active.delete(entry.key); drain();
                });
        }
    }
    return {
        run(key, execute, { signal, shouldStart, minIntervalMs = 0, wasSent } = {}) {
            return new Promise(resolve => {
                const entry = { key, execute, signal, shouldStart, resolve, wasSent,
                    minIntervalMs: Math.max(0, Math.min(60000, Math.round(Number(minIntervalMs)) || 0)),
                    cleanup: () => signal?.removeEventListener('abort', cancel) };
                const cancel = () => {
                    const index = queue.indexOf(entry);
                    // 在途取消立即结束调用方等待，执行和凭据锁仍等实际 settle。
                    if (index < 0) { resolve(stale()); return; }
                    queue.splice(index, 1); entry.cleanup(); resolve(stale()); drain();
                };
                if (!allowed(entry)) { resolve(stale()); return; }
                signal?.addEventListener('abort', cancel, { once: true });
                queue.push(entry); drain();
            });
        },
    };
}
