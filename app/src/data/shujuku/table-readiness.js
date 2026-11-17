export function createTableReadiness({ client, chatId, generation, isCurrent, serial }) {
    const listeners = new Set();
    const waits = new Set();
    let disposed = false;
    let subscribed = false;
    let queued = null;
    const current = () => !disposed && isCurrent();
    const stale = () => ({ ok: false, status: 'failed', reason: 'request-stale', chatId, generation });

    function read() {
        if (!current()) return stale();
        const version = client.version();
        let loaded;
        try { loaded = client.readSheets(); }
        catch { loaded = { ok: false, reason: 'read-failed' }; }
        if (!current()) return stale();
        const changed = version !== client.version();
        const waiting = changed || loaded.reason === 'not-ready' || loaded.reason === 'missing-api';
        return { ok: loaded.ok === true && !changed, chatId, generation, version: client.version(),
            status: waiting ? 'waiting' : loaded.ok ? 'ready' : 'failed',
            reason: waiting ? 'combat-table-not-ready' : loaded.ok ? '' : 'combat-table-read-failed' };
    }

    function updated() {
        if (!current() || queued) return;
        client.invalidate();
        const job = {};
        queued = job;
        Promise.resolve().then(() => serial(() => null)).then(() => {
            if (queued !== job || !current()) return;
            const value = read();
            queued = null;
            for (const listener of [...listeners]) {
                try { listener({ ...value, notifications: subscribed }); } catch { /* 单个消费者不影响其余订阅 */ }
            }
        }).catch(() => {}).finally(() => { if (queued === job) queued = null; });
    }

    function unsubscribeHost() {
        if (!subscribed) return;
        subscribed = false;
        try { client.unregisterCallback(updated); } catch { /* 宿主释放失败不保留本地监听 */ }
    }

    function subscribe(listener) {
        if (!current() || typeof listener !== 'function') return () => {};
        listeners.add(listener);
        if (!subscribed) {
            try { subscribed = client.registerCallback(updated) === true; } catch { /* 保留手动检查 */ }
        }
        const value = read();
        try { listener({ ...value, notifications: subscribed }); } catch { /* */ }
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            listeners.delete(listener);
            if (!listeners.size) unsubscribeHost();
        };
    }

    function delay(ms, { signal, shouldStart = () => true } = {}) {
        if (!current() || signal?.aborted || !shouldStart()) return Promise.resolve(false);
        return new Promise(resolve => {
            let timer;
            const finish = () => {
                clearTimeout(timer);
                waits.delete(finish);
                signal?.removeEventListener('abort', finish);
                resolve(current() && !signal?.aborted && shouldStart());
            };
            waits.add(finish);
            signal?.addEventListener('abort', finish, { once: true });
            timer = setTimeout(finish, Math.max(0, ms));
        });
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        queued = null;
        unsubscribeHost();
        for (const finish of [...waits]) finish();
        listeners.clear();
    }

    return { read, subscribe, delay, dispose };
}
