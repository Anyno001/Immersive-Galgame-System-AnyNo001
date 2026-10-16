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
        const epoch = sources.epoch(), token = cache.token(key);
        const setStatus = status => {
            if (epoch === sources.epoch() && token === cache.token(key)) sources.set(key, { status });
        };
        sources.set(key, { status: 'loading' });
        if (isImagePath(source)) return files.read(source, { display: true }).then(value => {
            setStatus(value ? 'available' : 'read-error');
            return value ? cache.peek(key) || value : '';
        }, () => { setStatus('read-error'); return ''; });
        if (typeof globalObject.Image !== 'function') {
            cache.remember(key, source); sources.set(key, { status: 'unverified' });
            return Promise.resolve(cache.peek(key) || source);
        }
        return cache.load(key, signal => {
            return new Promise(resolve => {
                const image = new globalObject.Image();
                const finish = (status = 'available') => { signal?.removeEventListener('abort', abort); image.onload = null; image.onerror = null; setStatus(status); resolve(source); };
                const abort = () => { image.onload = null; image.onerror = null; image.src = ''; resolve(''); };
                signal?.addEventListener('abort', abort, { once: true });
                image.onload = () => finish(); image.onerror = () => finish('decode-error'); image.src = source;
                if (image.complete) finish(image.naturalWidth > 0 ? 'available' : 'decode-error');
            });
        }, { persist: false, timeoutMs: 15000 }).then(value => value ? cache.peek(key) || source : '').catch(() => { setStatus('read-error'); return source; });
    }
    return { load, get: url => cache.peek(keyOf(String(url || '').trim())), keyOf: url => keyOf(String(url || '').trim()),
        inspect(url) {
            const key = keyOf(String(url || '').trim()), state = sources.get(key);
            if (state?.status === 'decode-error' || state?.status === 'read-error') return state;
            return cache.peek(key) ? { status: 'available' } : { status: state?.status === 'loading' ? 'loading' : 'unverified' };
        },
        clearFailures() {
            for (const [key, state] of [...sources]) {
                if (state.status !== 'decode-error' && state.status !== 'read-error') continue;
                sources.delete(key);
                cache.forget(key);
            }
        },
        clear() { sources.clear(); }, destroy() { sources.destroy(); },
        size: () => [...sources.keys()].filter(key => cache.peek(key)).length };
}
