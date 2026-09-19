export const PRESET_STORE_KEY = 'igs:preset-registry:v1';

export function createPresetStore(storageLike, options = {}) {
    const key = options.key || PRESET_STORE_KEY;
    const target = isStorageLike(storageLike) ? storageLike : createMemoryStorage();

    return {
        key,
        storage: target,
        load() {
            return readPresetSnapshot(target, key);
        },
        save(snapshot) {
            return writePresetSnapshot(target, snapshot, key);
        },
        clear() {
            return removePresetSnapshot(target, key);
        },
    };
}

export function createMemoryStorage(initialData = {}) {
    const data = new Map();

    for (const [key, value] of Object.entries(initialData || {})) {
        data.set(String(key), normalizeStorageValue(value));
    }

    return {
        getItem(key) {
            const storageKey = String(key);
            return data.has(storageKey) ? data.get(storageKey) : null;
        },
        setItem(key, value) {
            data.set(String(key), normalizeStorageValue(value));
        },
        removeItem(key) {
            data.delete(String(key));
        },
        dump() {
            return Object.fromEntries(data.entries());
        },
    };
}

export function createEmptyPresetSnapshot() {
    return {
        version: 1,
        current: {},
        items: {},
        drafts: {},
        updatedAt: '',
    };
}

export function normalizePresetSnapshot(snapshot) {
    const source = isPlainObject(snapshot) ? snapshot : {};
    const normalized = createEmptyPresetSnapshot();
    normalized.version = normalizePositiveInteger(source.version, 1);
    normalized.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : '';

    if (isPlainObject(source.current)) {
        for (const [type, id] of Object.entries(source.current)) {
            const normalizedId = typeof id === 'string' ? id.trim() : '';
            if (normalizedId) normalized.current[type] = normalizedId;
        }
    }

    if (isPlainObject(source.items)) {
        for (const [type, records] of Object.entries(source.items)) {
            if (!isPlainObject(records)) continue;
            normalized.items[type] = {};
            for (const [id, item] of Object.entries(records)) {
                normalized.items[type][id] = cloneData(item);
            }
        }
    }

    if (isPlainObject(source.drafts)) {
        normalized.drafts = cloneData(source.drafts);
    }

    return normalized;
}

export function readPresetSnapshot(storageLike, key = PRESET_STORE_KEY) {
    if (!isStorageLike(storageLike)) {
        return {
            ok: true,
            key,
            snapshot: createEmptyPresetSnapshot(),
        };
    }

    try {
        const raw = storageLike.getItem(key);
        if (raw == null || raw === '') {
            return {
                ok: true,
                key,
                snapshot: createEmptyPresetSnapshot(),
            };
        }

        return {
            ok: true,
            key,
            snapshot: normalizePresetSnapshot(JSON.parse(raw)),
        };
    } catch (error) {
        return {
            ok: false,
            reason: 'invalid-preset-snapshot',
            key,
            message: error instanceof Error ? error.message : String(error),
            snapshot: createEmptyPresetSnapshot(),
        };
    }
}

export function writePresetSnapshot(storageLike, snapshot, key = PRESET_STORE_KEY) {
    if (!isStorageLike(storageLike)) {
        return {
            ok: false,
            reason: 'missing-storage-like',
            key,
        };
    }

    const normalized = normalizePresetSnapshot(snapshot);
    normalized.updatedAt = new Date().toISOString();

    try {
        storageLike.setItem(key, JSON.stringify(normalized));
        return {
            ok: true,
            key,
            snapshot: normalized,
        };
    } catch (error) {
        return {
            ok: false,
            reason: 'preset-store-write-failed',
            key,
            message: error instanceof Error ? error.message : String(error),
            snapshot: normalized,
        };
    }
}

function removePresetSnapshot(storageLike, key = PRESET_STORE_KEY) {
    if (!isStorageLike(storageLike)) {
        return {
            ok: false,
            reason: 'missing-storage-like',
            key,
        };
    }

    try {
        storageLike.removeItem(key);
        return { ok: true, key };
    } catch (error) {
        return {
            ok: false,
            reason: 'preset-store-remove-failed',
            key,
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

function normalizeStorageValue(value) {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

function normalizePositiveInteger(value, fallback) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) return fallback;
    return number;
}

function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStorageLike(value) {
    return !!value
        && typeof value.getItem === 'function'
        && typeof value.setItem === 'function'
        && typeof value.removeItem === 'function';
}
