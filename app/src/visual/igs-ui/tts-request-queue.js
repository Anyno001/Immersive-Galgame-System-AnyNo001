export function createTtsRequestQueue({ concurrency = 5, timers = globalThis, now = Date.now, retryDelay = 1000 } = {}) {
    const waiting = new Set();
    let running = 0, sequence = 0, timer = null, pausedUntil = 0, limit = concurrency, successes = 0;
    const cancelled = () => new Error('已取消');

    function settle(task, error, value) {
        task.state = 'done';
        waiting.delete(task);
        task.signal?.removeEventListener('abort', task.abort);
        if (error) task.reject(error);
        else task.resolve(value);
    }

    function pump() {
        if (timer != null) timers.clearTimeout(timer);
        timer = null;
        const time = now();
        const candidates = [...waiting].sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
        for (const task of candidates) {
            if (task.signal?.aborted) { settle(task, cancelled()); continue; }
            if (running >= limit || pausedUntil > time) break;
            if (task.readyAt > time) continue;
            waiting.delete(task);
            task.state = 'running';
            running++;
            Promise.resolve().then(() => {
                if (task.signal?.aborted) throw cancelled();
                return task.run();
            }).then(value => {
                if (++successes >= 10) { limit = Math.min(concurrency, limit + 1); successes = 0; }
                settle(task, null, value);
            }, error => {
                if (error?.status === 429 && !task.signal?.aborted && task.retries < 2) {
                    const delay = Math.max(Number(error.retryAfterMs) || 0, Math.min(20000, retryDelay * 2 ** task.retries));
                    pausedUntil = Math.max(pausedUntil, now() + delay);
                    limit = Math.max(1, limit - 1);
                    successes = 0;
                    task.retries++;
                    task.readyAt = pausedUntil;
                    task.state = 'waiting';
                    waiting.add(task);
                } else settle(task, error);
            }).finally(() => { running--; pump(); });
        }
        if (waiting.size && running < limit) {
            const readyAt = Math.max(pausedUntil, Math.min(...[...waiting].map(task => task.readyAt)));
            timer = timers.setTimeout(pump, Math.max(1, readyAt - now()));
        }
    }

    function enqueue(run, { priority = 1, signal = null } = {}) {
        const task = { run, priority, signal, sequence: sequence++, readyAt: 0, retries: 0, state: 'waiting' };
        task.promise = new Promise((resolve, reject) => { task.resolve = resolve; task.reject = reject; });
        task.abort = () => {
            if (task.state === 'waiting') { settle(task, cancelled()); pump(); }
        };
        signal?.addEventListener('abort', task.abort, { once: true });
        waiting.add(task);
        pump();
        return {
            promise: task.promise,
            promote(priority) { task.priority = Math.min(task.priority, priority); },
        };
    }

    return { enqueue };
}

export const ttsRequestQueue = createTtsRequestQueue();
