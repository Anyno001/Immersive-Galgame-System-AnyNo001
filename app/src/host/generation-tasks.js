const stale = () => ({ ok: false, reason: 'request-stale' });
const staleError = () => Object.assign(new Error('request-stale'), { reason: 'request-stale' });

export function createGenerationTasks({ capture, onSlow = () => {}, slowMs = 60000 }) {
    const jobs = new Map();
    let epoch = 0;
    const lease = (captureOwner = capture) => {
        const owner = captureOwner(), revision = epoch;
        let valid = true;
        return () => { try { valid = valid && epoch === revision && owner() === true; } catch { valid = false; } return valid; };
    };
    function invalidate() {
        epoch += 1;
        for (const job of jobs.values()) job.controller.abort();
        jobs.clear();
    }
    function get(key) {
        const job = jobs.get(key);
        if (!job || job.alive()) return job;
        job.controller.abort();
        if (jobs.get(key) === job) jobs.delete(key);
        return null;
    }
    function start(key, run) {
        const previous = get(key);
        if (previous) return previous.promise;
        const owner = capture();
        const revision = epoch;
        const controller = new AbortController();
        const cleanups = new Set();
        const guards = new Set();
        let valid = true;
        const job = {
            key, controller, signal: controller.signal, stage: 'prepare', slow: false, promise: null,
            alive: () => {
                try { valid = valid && epoch === revision && !controller.signal.aborted && owner() === true && [...guards].every(guard => guard() === true); }
                catch { valid = false; }
                return valid;
            },
            check() { if (!job.alive()) throw staleError(); },
            onFinish(fn) { cleanups.add(fn); return () => cleanups.delete(fn); },
            guard(fn) { guards.add(fn); job.check(); },
            async request(request, prompt, ms = slowMs, options = {}) {
                job.check();
                job.stage = 'request';
                const slow = () => {
                    if (!job.alive() || jobs.get(key) !== job || job.slow) return;
                    job.slow = true;
                    onSlow(job);
                };
                const timer = setTimeout(slow, ms);
                try {
                    const reply = await request(prompt, {
                        signal: job.signal,
                        shouldStart: job.alive,
                        onSlow: slow,
                        guard: job.guard,
                        ...(typeof options?.onRetry === 'function' ? { onRetry: options.onRetry } : {}),
                    });
                    job.check();
                    job.stage = 'parse';
                    return reply;
                } finally { clearTimeout(timer); }
            },
        };
        jobs.set(key, job);
        job.promise = Promise.resolve().then(() => { job.check(); return run(job); })
            .then(result => job.alive() ? result : stale(), error => {
                if (!job.alive() || error?.reason === 'request-stale') return stale();
                if (error?.reason) return { ok: false, reason: error.reason, ...(error.stage && { stage: error.stage }) };
                throw error;
            }).finally(() => {
                if (jobs.get(key) === job) jobs.delete(key);
                for (const cleanup of cleanups) {
                    try { cleanup(); } catch { /* 清理不改写原任务结果。 */ }
                }
            });
        return job.promise;
    }
    return { start, get, invalidate, lease };
}
