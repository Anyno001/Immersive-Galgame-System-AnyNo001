import { localImageCacheFor } from './tavern-image-cache.js';
import { imageFingerprint } from './image-identity.js';
import { isImagePath, normalizeImagePath } from './image-identity.js';
import { createTavernImageFiles } from './tavern-image-files.js';
export function createResourceCache(store = new Map()) {
    return {
        put(id, resource) {
            if (!id) return { ok: false, reason: 'missing-id' };
            store.set(id, { ...resource, id });
            return { ok: true, id };
        },

        get(id) {
            return store.get(id) || null;
        },

        list() {
            return Array.from(store.values());
        },

        clear() {
            store.clear();
        },
    };
}

export function createImageResourceCache(globalObject = globalThis, { limit = 96 } = {}) {
    const cache = localImageCacheFor(globalObject);
    const sources = cache.auxiliary.createMap('reader-sources', { maxEntries: limit,
        onRemove: (_value, key, reason) => { if (reason === 'clear' || reason === 'destroy') cache.forget(key); } });
    const files = createTavernImageFiles(globalObject, 'igs-media');
    const keyOf = source => isImagePath(source) ? normalizeImagePath(source) : /^(data:|blob:)/i.test(source) ? `display:${imageFingerprint(source)}` : `url:${source}`;
    function load(url) {
        const source = String(url || '').trim();
        if (!source) return Promise.resolve('');
        const key = keyOf(source);
        const ready = cache.peek(key);
        if (ready) return Promise.resolve(ready);
        const previous = sources.get(key);
        if (['read-error', 'decode-error'].includes(previous?.status)) return Promise.resolve('');
        const entry = previous?.status === 'loading' ? previous : { status: 'loading' };
        sources.set(key, entry);
        const generation = sources.epoch();
        const mark = status => {
            if (sources.epoch() === generation && sources.get(key) === entry) entry.status = status;
        };
        let task;
        if (isImagePath(source)) task = files.read(source, { display: true, strictRead: true });
        else if (typeof globalObject.Image !== 'function') {
            mark('unverified'); cache.remember(key, source); return Promise.resolve(cache.peek(key) || source);
        } else task = cache.load(key, signal => {
            return new Promise((resolve, reject) => {
                const image = new globalObject.Image();
                let settled = false;
                const finish = error => {
                    if (settled) return;
                    settled = true; signal?.removeEventListener('abort', abort);
                    image.onload = null; image.onerror = null;
                    if (error) reject(error); else resolve(source);
                };
                const abort = () => { finish(new Error('image-read-aborted')); image.src = ''; };
                if (signal?.aborted) { abort(); return; }
                signal?.addEventListener('abort', abort, { once: true });
                image.onload = () => finish(); image.onerror = () => finish(new Error('image-decode-error'));
                image.src = source;
                if (image.complete) finish(image.naturalWidth > 0 ? null : new Error('image-decode-error'));
            });
        }, { persist: false, timeoutMs: 15000 });
        return task.then(value => {
            if (!value || sources.epoch() !== generation) return '';
            mark('available'); return cache.peek(key) || value;
        }).catch(error => { mark(error.message === 'image-decode-error' ? 'decode-error' : 'read-error'); return ''; });
    }
    return { load, get: url => cache.peek(keyOf(String(url || '').trim())), keyOf: url => keyOf(String(url || '').trim()),
        inspect(url) {
            const key = keyOf(String(url || '').trim());
            const status = sources.get(key)?.status || 'unverified';
            return { status: status === 'available' && !cache.peek(key) ? 'unverified' : status };
        },
        clearFailures() {
            for (const [key, entry] of sources) if (['read-error', 'decode-error'].includes(entry.status)) {
                sources.delete(key); cache.forget(key);
            }
        },
        clear() { sources.clear(); }, destroy() { sources.destroy(); },
        size: () => [...sources.keys()].filter(key => cache.peek(key)).length };
}
