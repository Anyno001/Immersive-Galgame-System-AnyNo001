// 离线事务 fixture：串行读写、请求事件、提交快照及回滚；不替代浏览器 IndexedDB。
export function createTransactionalIdb() {
    const databases = new Map();
    const faults = [];
    const transactions = [];
    const clone = (v) => v === undefined ? undefined : structuredClone(v);
    const defer = (fn) => setTimeout(fn, 0);
    function database(record) {
        return {
            objectStoreNames: { contains: (name) => record.stores.has(name) },
            createObjectStore(name, { keyPath }) {
                record.stores.set(name, { keyPath, data: new Map(), indexes: new Map() });
                return { createIndex: (name2, field) => record.stores.get(name).indexes.set(name2, field) };
            },
            close() {},
            transaction(name, mode) {
                const source = record.stores.get(name);
                const queue = [];
                let data, ended = false;
                const tx = { mode, error: null, abort: () => finish(new Error('fixture-abort')) };
                transactions.push(tx);
                function finish(error) {
                    if (ended) return;
                    ended = true;
                    if (!error && mode === 'readwrite') source.data = data;
                    if (error) tx.error = error;
                    defer(() => {
                        if (error) tx.onabort?.(); else tx.oncomplete?.();
                        record.pending.shift();
                        record.pending[0]?.();
                    });
                }
                function request(op, fn, req = {}) {
                    if (ended) throw new Error('TransactionInactiveError');
                    queue.push(() => {
                        const fault = op === 'put' ? faults.shift() : undefined;
                        if (fault) { req.error = fault; req.onerror?.(); finish(fault); return; }
                        try { req.result = fn(); req.onsuccess?.(); }
                        catch (error) { req.error = error; req.onerror?.(); finish(error); }
                    });
                    return req;
                }
                tx.objectStore = () => ({
                    get: (key) => request('get', () => clone(data.get(key))),
                    put: (value) => { const copy = clone(value); return request('put', () => { data.set(copy[source.keyPath], copy); return copy[source.keyPath]; }); },
                    delete: (key) => request('delete', () => data.delete(key)),
                    getAllKeys: () => request('keys', () => [...data.keys()]),
                    index: (index) => ({
                        getAll: (key) => request('index', () => [...data.values()].filter((v) => v[source.indexes.get(index)] === key).map(clone)),
                        openCursor(key, direction = 'next') {
                            let rows, position = 0;
                            const req = {};
                            const next = () => {
                                const field = source.indexes.get(index);
                                if (!rows) {
                                    rows = [...data].filter(([, value]) => value[field] === key)
                                        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
                                    if (direction === 'prev') rows.reverse();
                                }
                                const entry = rows[position++];
                                return entry ? { key: entry[1][field], primaryKey: entry[0], value: clone(entry[1]),
                                    continue() { request('cursor', next, req); } } : null;
                            };
                            return request('cursor', next, req);
                        },
                    }),
                });

                function pump() {
                    if (ended) return;
                    const next = queue.shift();
                    if (!next) { finish(); return; }
                    next();
                    if (!ended) defer(pump);
                }
                const start = () => {
                    data = new Map([...source.data].map(([key, value]) => [key, clone(value)]));
                    defer(pump);
                };
                record.pending.push(start);
                if (record.pending.length === 1) start();
                return tx;
            },
        };
    }
    return {
        transactions,
        failNextPut(error = new Error('fixture-quota')) { faults.push(error); },
        open(name, version) {
            const req = {};
            defer(() => {
                let record = databases.get(name);
                if (!record) {
                    record = { stores: new Map(), version: 0, pending: [] };
                    databases.set(name, record);
                }
                req.result = database(record);
                if (record.version < version) { req.onupgradeneeded?.(); record.version = version; }
                req.onsuccess?.();
            });
            return req;
        },
    };
}
