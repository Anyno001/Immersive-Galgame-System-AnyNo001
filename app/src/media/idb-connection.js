// IndexedDB 连接与事务：每一步都有尽头。
// 打开超时 / 被旧连接挡住 / 版本变更 / 浏览器回收连接时都结束等待并清掉缓存的连接，下次调用重新打开；
// 事务完成、出错、中止、超时四种结局都会让 Promise 落地，不会有永远不回来的读写。
export const IDB_OPEN_TIMEOUT_MS = 8000;
export const IDB_TX_TIMEOUT_MS = 20000;

export function createIdbConnection(idb, name, version, upgrade, options = {}) {
    const openTimeout = Number(options.openTimeoutMs) > 0 ? Number(options.openTimeoutMs) : IDB_OPEN_TIMEOUT_MS;
    let current = null;
    const reset = (attempt) => { if (!attempt || current === attempt) current = null; };

    function open() {
        if (current) return current;
        const attempt = new Promise((resolve, reject) => {
            let settled = false;
            let timer = null;
            const finish = (ok, value) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                (ok ? resolve : reject)(value);
            };
            timer = setTimeout(() => finish(false, new Error(`${name} 打开超时`)), openTimeout);
            let req;
            try { req = idb.open(name, version); } catch (error) { finish(false, error); return; }
            req.onupgradeneeded = () => { if (typeof upgrade === 'function') upgrade(req.result); };
            req.onblocked = () => finish(false, new Error(`${name} 被其他页面占用`));
            req.onerror = () => finish(false, req.error || new Error(`${name} 打开失败`));
            req.onsuccess = () => {
                const db = req.result;
                db.onversionchange = () => { try { db.close(); } catch { /* 已关闭 */ } reset(attempt); };
                db.onclose = () => reset(attempt);
                if (settled) { try { db.close(); } catch { /* 已关闭 */ } return; }
                finish(true, db);
            };
        });
        current = attempt;
        attempt.catch(() => reset(attempt));
        return attempt;
    }

    // fn(tx) 返回 IDBRequest（取其 result）或无参函数（事务完成时求值）。
    async function transact(storeNames, mode, fn, txOptions = {}) {
        const timeout = Number(txOptions.timeoutMs) > 0 ? Number(txOptions.timeoutMs) : IDB_TX_TIMEOUT_MS;
        const attempt = open();
        const db = await attempt;
        return new Promise((resolve, reject) => {
            let tx;
            try { tx = db.transaction(storeNames, mode); } catch (error) { reset(attempt); reject(error); return; }
            let out;
            try { out = fn(tx); } catch (error) { try { tx.abort(); } catch { /* 已结束 */ } reject(error); return; }
            const timer = setTimeout(() => reject(new Error(`${name} 读写超时`)), timeout);
            tx.oncomplete = () => {
                clearTimeout(timer);
                try { resolve(typeof out === 'function' ? out() : (out ? out.result : undefined)); } catch (error) { reject(error); }
            };
            tx.onerror = () => { clearTimeout(timer); reject(tx.error || new Error(`${name} 读写失败`)); };
            tx.onabort = () => { clearTimeout(timer); reject(tx.error || new Error(`${name} 读写被中止`)); };
        });
    }

    return { open, transact, reset: () => reset() };
}

// 给任意 Promise 加期限；到期按 fallback 落地，原任务继续在后台走完。
export function withDeadline(promise, ms, reason = 'timeout') {
    let timer = null;
    return Promise.race([
        Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(reason), { code: reason })), ms); }),
    ]);
}
