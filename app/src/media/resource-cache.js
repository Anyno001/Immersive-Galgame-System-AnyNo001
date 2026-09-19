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
