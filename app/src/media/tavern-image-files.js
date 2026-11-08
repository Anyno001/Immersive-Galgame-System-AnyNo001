import { IMAGE_FIELDS, IMAGE_RECOVERY_PIXELS, isImageData, isImagePath, imageContentId, imagePaths, blobDataUrl } from './image-identity.js';
import { createLegacyImageRecovery } from './legacy-image-recovery.js';
import { localImageCacheFor } from './tavern-image-cache.js';
import { mediaRequest, tavernHeaders } from './tavern-media-http.js';
import { mediaFileGcFor } from './media-file-gc.js';
export const IMAGE_PROVENANCE = Symbol('igs-image-provenance');

const uploads = new WeakMap();
const IMAGE_LEASES = Symbol('igs-image-write-leases');
const sameRecord = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const slug = value => String(value || '').replace(/[^\w-]/g, '_').slice(0, 80);

export function createTavernImageFiles(globalObject, legacyDir) {
    const cache = localImageCacheFor(globalObject), gc = mediaFileGcFor(globalObject);
    if (!uploads.has(globalObject)) uploads.set(globalObject, new Map());
    const flights = uploads.get(globalObject);
    const directories = cache.auxiliary.sharedMap('directories', { onRemove: entry => entry.controller?.abort() });
    async function upload(dataUrl, hash, { cacheDisplay = true } = {}) {
        if (flights.has(hash)) return flights.get(hash);
        const job = (async () => {
            const match = /^data:image\/([^;]+);base64,/i.exec(dataUrl);
            const ext = /^(?:jpeg|jpg)$/i.test(match[1]) ? 'jpg' : match[1].toLowerCase();
            try {
                const response = await mediaRequest(globalObject, '/api/images/upload', { method: 'POST', headers: tavernHeaders(globalObject), body: JSON.stringify({ image: dataUrl.slice(match[0].length), ch_name: 'igs-media', filename: hash, format: ext }) });
                if (!response?.ok) return dataUrl;
                const path = String((await response.json())?.path || '').replace(/\\/g, '/').replace(/^\//, '');
                if (!isImagePath(path)) return dataUrl;
                if (cacheDisplay) await cache.put(path, dataUrl).catch(() => {});
                return path;
            } catch { return dataUrl; }
        })().finally(() => { if (flights.get(hash) === job) flights.delete(hash); });
        flights.set(hash, job);
        return job;
    }
    async function readBlob(path, { signal } = {}) {
        const response = await mediaRequest(globalObject, `/${String(path).replace(/^\//, '')}`, { cache: 'no-store', signal });
        if (!response?.ok) throw Object.assign(new Error(response?.status === 404 || response?.status === 410 ? 'image-file-not-found' : 'image-file-unreadable'), { status: response?.status });
        const blob = await response.blob();
        // 部分酒馆/反代不带图片类型头，转成 dataUrl 会变 octet-stream，被当成不是图片。
        if (/^image\//i.test(blob?.type || '') || typeof globalObject.Blob !== 'function') return blob;
        const ext = (/\.(\w+)$/.exec(String(path)) || [])[1]?.toLowerCase();
        return new globalObject.Blob([blob], { type: `image/${ext === 'jpg' ? 'jpeg' : ext || 'png'}` });
    }
    // 原图任务绕过显示缓存，显示通道是否压缩由中央缓存开关决定。
    async function read(path, { strictRead = false, display = false, original = false, ticket = null, signal } = {}) {
        if (original) {
            if (!cache.compressDisplay && cache.peek(path)) return cache.dataUrl(path);
            const task = readBlob(path, { signal }).then(blob => blobDataUrl(blob, globalObject, { signal }));
            return strictRead ? task : task.catch(() => '');
        }
        const fetchBlob = signal => readBlob(path, { signal });
        // 没有 createObjectURL 的环境（测试桩）无法给 Blob 生成地址，退回 dataUrl。
        const useBlob = typeof globalObject.URL?.createObjectURL === 'function';
        const loader = useBlob ? fetchBlob : async signal => blobDataUrl(await fetchBlob(signal), globalObject, { signal });
        const task = cache.load(path, loader, { download: true, blob: display && useBlob, ticket }).then(async shown => {
            if (display || !shown || typeof shown === 'string' && shown.startsWith('data:')) return shown;
            return cache.dataUrl(path);
        });
        if (!strictRead) return task.catch(() => '');
        const value = await task;
        if (!value) throw new Error('image-read-incomplete');
        return value;
    }
    async function offload(record, key, old, options = {}) {
        if (!record) return record;
        const next = { ...record };
        const held = new Set();
        Object.defineProperty(next, IMAGE_LEASES, { value: held });
        const hold = async path => { if (!held.has(path)) { await gc.hold(path); held.add(path); } };
        const provenance = record[IMAGE_PROVENANCE] || {};
        const seen = new Map();
        try { for (const field of IMAGE_FIELDS) {
            if (next[field] === '' && provenance[field]) next[field] = provenance[field];
            const value = next[field];
            if (!isImageData(value) || !tavernHeaders(globalObject)) continue;
            const hash = await imageContentId(value, globalObject);
            const existing = [...imagePaths(old)].find(path => path.includes(hash));
            const type = /^data:image\/([^;]+);/i.exec(value)[1].toLowerCase();
            await hold(existing || `user/images/igs-media/${hash}.${/^(jpeg|jpg)$/.test(type) ? 'jpg' : type}`);
            if (!seen.has(value)) seen.set(value, existing || await upload(value, hash, options));
            next[field] = seen.get(value);
        }
        for (const path of imagePaths(next)) await hold(path);
        return next;
        } catch (error) {
            await Promise.allSettled([...held].map(path => gc.release(path)));
            await gc.released(next, old).catch(() => {});
            throw error;
        }
    }
    async function hydrate(record, options = {}) {
        if (!record) return record;
        const next = { ...record };
        const fields = options.fields === '*' ? IMAGE_FIELDS : options.fields || ['dataUrl'];
        const readOptions = { original: options.fields === '*', ...options };
        const references = {};
        await Promise.all(fields.map(async field => {
            if (isImagePath(record[field])) {
                references[field] = record[field];
                const recovered = record[IMAGE_RECOVERY_PIXELS]?.get(record[field]);
                if (recovered && readOptions.original) next[field] = recovered;
                else if (recovered) next[field] = await cache.load(record[field], async () => recovered, { blob: readOptions.display === true });
                else next[field] = await read(record[field], readOptions);
            }
        }));
        Object.defineProperty(next, IMAGE_PROVENANCE, { value: references, enumerable: true });
        return next;
    }
    async function listFiles() {
        if (!tavernHeaders(globalObject)) return [];
        const current = directories.get(legacyDir);
        if (current) return current.promise;
        const Abort = globalObject.AbortController || globalThis.AbortController;
        const entry = { status: 'pending', controller: Abort ? new Abort() : null, promise: null };
        const generation = directories.epoch();
        entry.promise = (async () => {
            const response = await mediaRequest(globalObject, '/api/images/list', { method: 'POST', headers: tavernHeaders(globalObject), signal: entry.controller?.signal, body: JSON.stringify({ folder: legacyDir, sortField: 'date', sortOrder: 'asc' }) });
            if (!response?.ok) throw new Error('image-list-failed');
            const names = await response.json();
            if (generation !== directories.epoch() || directories.get(legacyDir) !== entry) return [];
            entry.status = 'ready';
            directories.set(legacyDir, entry);
            return Array.isArray(names) ? names.map(String) : [];
        })().catch(error => { if (directories.get(legacyDir) === entry) directories.delete(legacyDir); throw error; });
        directories.set(legacyDir, entry, { ttlMs: 0 });
        return entry.promise;
    }
    const recover = createLegacyImageRecovery(globalObject, { dir: legacyDir, listFiles, read: path => read(path, { original: true }), slug });
    return { offload, hydrate, read, readBlob, recover, listFiles, sameRecord,
        hasData: record => IMAGE_FIELDS.some(field => isImageData(record?.[field])),
        async release(record) { const results = await Promise.allSettled([...record?.[IMAGE_LEASES] || []].map(path => gc.release(path))); const failed = results.find(result => result.status === 'rejected'); if (failed) throw failed.reason; },
        dropUnused: (old, next) => gc.released(old, next),
        async acceptRemote(old, next, keys = [], prefixes = [], previous = null) {
            await gc.released(old, next);
            await gc.released(previous, next);
            for (const key of keys) await cache.drop(key);
            for (const prefix of prefixes) await cache.dropPrefix(prefix);
        },
        headers: () => tavernHeaders(globalObject),
        later(task) { Promise.resolve().then(task).catch(() => {}); },
    };
}
