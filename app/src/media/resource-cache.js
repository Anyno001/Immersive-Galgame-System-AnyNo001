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

export function createImageResourceCache(globalObject = globalThis, options = {}) {
    const entries = new Map();
    const ImageCtor = globalObject && typeof globalObject.Image === 'function' ? globalObject.Image : null;
    const fetcher = globalObject && typeof globalObject.fetch === 'function'
        ? globalObject.fetch.bind(globalObject)
        : null;
    const urlApi = globalObject && globalObject.URL || null;
    const limit = Number(options.limit) > 0 ? Math.floor(Number(options.limit)) : 32;

    function load(url) {
        const source = String(url || '').trim();
        if (!source) return Promise.resolve('');
        const existing = entries.get(source);
        if (existing) {
            entries.delete(source);
            entries.set(source, existing);
            return existing.promise;
        }

        const entry = {
            ready: false,
            resolvedUrl: '',
            objectUrl: '',
            disposed: false,
            promise: null,
        };
        if (!fetcher && !ImageCtor) {
            entry.ready = true;
            entry.resolvedUrl = source;
            entry.promise = Promise.resolve(source);
            entries.set(source, entry);
            trim(source);
            return entry.promise;
        }
        entry.promise = resolveSource(source).then((resolved) => {
            if (entry.disposed) {
                revokeObjectUrl(resolved);
                return source;
            }
            entry.resolvedUrl = resolved || source;
            if (entry.resolvedUrl !== source) entry.objectUrl = entry.resolvedUrl;
            entry.ready = true;
            trim(source);
            return entry.resolvedUrl;
        });
        entries.set(source, entry);
        return entry.promise;
    }

    async function resolveSource(source) {
        if (/^https?:\/\//i.test(source) && fetcher && canCreateObjectUrl()) {
            try {
                const response = await fetcher(source, { cache: 'force-cache', mode: 'cors' });
                if (!response || response.ok === false || typeof response.blob !== 'function') throw new Error('image-fetch-failed');
                const blob = await response.blob();
                return urlApi.createObjectURL(blob);
            } catch (error) {
                return preloadSource(source);
            }
        }
        return preloadSource(source);
    }

    function preloadSource(source) {
        if (!ImageCtor || /^(?:data:|blob:)/i.test(source)) return Promise.resolve(source);
        return new Promise((resolve) => {
            try {
                const image = new ImageCtor();
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    image.onload = null;
                    image.onerror = null;
                    resolve(source);
                };
                image.onload = finish;
                image.onerror = finish;
                image.src = source;
                if (image.complete) finish();
            } catch (error) {
                resolve(source);
            }
        });
    }

    function get(url) {
        const source = String(url || '').trim();
        const entry = entries.get(source);
        if (!entry || !entry.ready) return '';
        entries.delete(source);
        entries.set(source, entry);
        return entry.resolvedUrl || source;
    }

    function trim(protectedSource) {
        while (entries.size > limit) {
            const candidate = Array.from(entries.entries()).find(([source, entry]) => (
                source !== protectedSource && entry.ready
            ));
            if (!candidate) break;
            entries.delete(candidate[0]);
            disposeEntry(candidate[1]);
        }
    }

    function canCreateObjectUrl() {
        return Boolean(urlApi
            && typeof urlApi.createObjectURL === 'function'
            && typeof urlApi.revokeObjectURL === 'function');
    }

    function revokeObjectUrl(url) {
        if (!url || !canCreateObjectUrl() || !String(url).startsWith('blob:')) return;
        urlApi.revokeObjectURL(url);
    }

    function disposeEntry(entry) {
        if (!entry) return;
        entry.disposed = true;
        revokeObjectUrl(entry.objectUrl);
    }

    function clear() {
        for (const entry of entries.values()) disposeEntry(entry);
        entries.clear();
    }

    return { load, get, clear, size: () => entries.size };
}
