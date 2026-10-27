import { recoverOperation, linkRecoverySignals } from '../storage/automatic-recovery.js';
import { assetBindingMetadata } from './generated-asset-store.js';
import { requireMediaCache } from './media-cache-owner.js';

// variantOf 必须留着：时段差分入库时主图地址要回指原图（asset-match.bindGeneratedBackground）。
// profileWrite：写词即存的改动记录，丢弃图片时用来还原；只在单条读取时带上。
const DISPLAY_FIELDS = ['chatId', 'floorKey', 'type', 'name', 'time', 'status', 'skipReason', 'imageId', 'tags', 'variantOf', 'characterKey', 'outfitName', 'profileWrite'];
const QUERY_FIELDS = DISPLAY_FIELDS.filter(field => field !== 'tags' && field !== 'profileWrite');
const project = record => {
    if (!record) return null;
    const value = { ...record, ...assetBindingMetadata(record) };
    return Object.fromEntries(['key', ...DISPLAY_FIELDS].filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]));
};
const staleError = () => Object.assign(new Error('media-metadata-stale'), { code: 'media-metadata-stale' });

// 缓存 miss 从不代表记录不存在。同步展示按需补载，生图/修改必须 fresh 查权威库。
// 单条记录与页索引共用同一个已登记预算；页索引只存键，不复制记录。
export function createAssetRecordCache({ store, mediaCache, owner, onChanged, onClear, onError, pendingCount = () => 0 }) {
    const media = requireMediaCache(mediaCache, owner);
    const pending = new Map();
    const recoveryController = new AbortController();
    let scopeController = new AbortController();
    let scope = '', generation = 0, revision = 0, disposed = false, error = '', failedKey = '';
    const entries = media.auxiliary.createMap(owner, {
        onClear() { generation += 1; revision += 1; scope = ''; error = ''; failedKey = ''; pending.clear(); onClear?.(); },
        onDestroy() { disposed = true; recoveryController.abort(); scopeController.abort(); },
        stats: () => ({ activeScopes: scope ? 1 : 0, pending: pending.size + pendingCount(), error }),
    });
    function use(chatId) {
        if (disposed) throw new Error('media-cache-disposed');
        if (scope !== chatId) {
            scopeController.abort(); scopeController = new AbortController();
            entries.clear(); scope = chatId;
        }
    }
    function remember(record) {
        if (disposed || !record || record.chatId !== scope) return;
        revision += 1;
        for (const key of [...entries.keys()]) if (key.startsWith('q:') || entries.get(key)?.kind === 'failure') entries.delete(key);
        const old = entries.get(`r:${record.key}`)?.record;
        entries.set(`r:${record.key}`, { kind: 'record', record: { ...old, ...project(record) } });
    }
    const pageKey = options => `q:${JSON.stringify(options)}`;
    function cachedPage(options) {
        const index = entries.get(pageKey(options));
        if (!index || index.kind !== 'page') return null;
        const records = [];
        for (const key of index.keys) {
            const entry = entries.get(`r:${key}`);
            if (!entry || entry.kind !== 'record' || !entry.record) { entries.delete(pageKey(options)); return null; }
            records.push(entry.record);
        }
        const { keys, kind, ...page } = index;
        return { ...page, records };
    }
    async function load(key, loader, accept, { fresh = false } = {}) {
        if (disposed) throw new Error('media-cache-disposed');
        const activeScope = scope, taskKey = `${revision}:${key}`;
        if (pending.has(taskKey)) return pending.get(taskKey);
        const linked = linkRecoverySignals([recoveryController.signal, scopeController.signal]);
        const read = () => {
            const stamp = generation, version = revision;
            if (!scope) scope = activeScope;
            return Promise.resolve().then(loader).then(value => {
            if (disposed || stamp !== generation) throw staleError();
            if (version !== revision) throw staleError();
            accept(value);
            entries.delete(`f:${key}`);
            if (failedKey === key) { error = ''; failedKey = ''; }
            onChanged?.(scope);
            return value;
        }).catch(cause => {
            if (disposed || stamp !== generation || cause.code === 'media-metadata-stale') throw staleError();
            const failure = Object.assign(new Error(cause.message || String(cause)), { code: 'asset-record-read-failed', cause });
            const changed = error !== failure.message;
            error = failure.message;
            failedKey = key;
            entries.set(`f:${key}`, { kind: 'failure' }, { ttlMs: 1000 });
            if (changed) { onError?.(failure); onChanged?.(scope); }
            throw failure;
            });
        };
        const job = recoverOperation(read, { signal: linked.signal, isActive: () => !disposed && (!scope || scope === activeScope),
            repair: (_result, cause) => ({ changed: cause?.code === 'media-metadata-stale' }),
            observe: async () => ({ completed: true, value: await read() }),
        })
            .then(value => { if (disposed || scope !== activeScope) throw staleError(); return value; })
            .finally(() => { linked.release(); if (pending.get(taskKey) === job) pending.delete(taskKey); });
        pending.set(taskKey, job);
        return job;
    }
    function read(chatId, key, { fresh = true } = {}) {
        use(chatId);
        const cacheKey = `r:${key}`, hit = entries.get(cacheKey);
        if (!fresh && hit?.kind === 'record') return Promise.resolve(hit.record);
        return load(cacheKey, () => store.getAsset(key), record => {
            if (record && record.chatId !== chatId) throw new Error('asset-record-scope-mismatch');
            const display = project(record);
            if (display?.type === 'sprite') display.tags = String(record.tags || '');
            entries.set(cacheKey, { kind: 'record', record: display }, { ttlMs: record ? 0 : 2000 });
        }, { fresh });
    }
    function peek(chatId, key) {
        use(chatId);
        const hit = entries.get(`r:${key}`);
        if (hit?.kind === 'record') {
            if (hit.record?.type === 'sprite' && !Object.hasOwn(hit.record, 'tags') && pending.size < 128) void read(chatId, key).catch(() => {});
            return hit.record;
        }
        if (pending.size < 128) void read(chatId, key, { fresh: false }).catch(() => {});
        return null;
    }
    function query(options, { fresh = false } = {}) {
        use(options.chatId);
        if (!fresh) { const hit = cachedPage(options); if (hit) return Promise.resolve(hit); }
        return load(pageKey(options), () => store.queryAssets({ ...options, fields: QUERY_FIELDS }), result => {
            for (const record of result.records) {
                const key = `r:${record.key}`, old = entries.get(key)?.record;
                entries.set(key, { kind: 'record', record: { ...old, ...project(record) } });
            }
            const { records, ...page } = result;
            entries.set(pageKey(options), { kind: 'page', ...page, keys: records.map(record => record.key) }, { ttlMs: records.length ? 0 : 2000 });
        }, { fresh });
    }
    function peekQuery(options) {
        use(options.chatId);
        const page = cachedPage(options);
        if (!page && pending.size < 128) void query(options).catch(() => {});
        return page;
    }
    return { use, read, peek, query, peekQuery, remember,
        get scope() { return scope; }, epoch: () => generation,
        values: () => [...entries.values()].filter(entry => entry.kind === 'record' && entry.record).map(entry => entry.record),
        status: () => ({ pending: pending.size > 0, error }),
        clear: () => entries.clear(), destroy: entries.destroy };
}
