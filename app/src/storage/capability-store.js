export const CAPABILITY_STORE_KEY = 'igs:capability-registry:v1';

export function createCapabilityStore(storageLike, options = {}) {
    const key = options.key || CAPABILITY_STORE_KEY;
    const target = isStorageLike(storageLike) ? storageLike : createMemoryStorage();

    return {
        key,
        storage: target,
        load() {
            return readCapabilitySnapshot(target, key);
        },
        save(snapshot) {
            return writeCapabilitySnapshot(target, snapshot, key);
        },
        clear() {
            return removeCapabilitySnapshot(target, key);
        },
    };
}

export function createEmptyCapabilitySnapshot() {
    return {
        version: 1,
        current: {},
        items: {},
        disabled: {},
        drafts: {},
        updatedAt: '',
    };
}

export function normalizeCapabilitySnapshot(snapshot) {
    const source = isPlainObject(snapshot) ? snapshot : {};
    const normalized = createEmptyCapabilitySnapshot();
    normalized.version = normalizePositiveInteger(source.version, 1);
    normalized.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : '';

    if (isPlainObject(source.current)) {
        for (const [type, id] of Object.entries(source.current)) {
            const normalizedId = normalizeString(id);
            if (normalizedId) normalized.current[type] = normalizedId;
        }
    }

    if (isPlainObject(source.items)) {
        for (const [type, records] of Object.entries(source.items)) {
            if (!isPlainObject(records)) continue;
            normalized.items[type] = {};
            for (const [id, item] of Object.entries(records)) {
                const normalizedId = normalizeString(id || item && item.id);
                if (!normalizedId) continue;
                normalized.items[type][normalizedId] = cloneData(item);
            }
        }
    }

    if (isPlainObject(source.disabled)) {
        for (const [type, ids] of Object.entries(source.disabled)) {
            const values = Array.isArray(ids)
                ? ids
                : isPlainObject(ids)
                    ? Object.keys(ids).filter((id) => ids[id])
                    : [];
            const normalizedIds = values.map(normalizeString).filter(Boolean);
            if (normalizedIds.length) normalized.disabled[type] = Array.from(new Set(normalizedIds));
        }
    }

    if (isPlainObject(source.drafts)) {
        normalized.drafts = cloneData(source.drafts);
    }

    return normalized;
}

export function readCapabilitySnapshot(storageLike, key = CAPABILITY_STORE_KEY) {
    if (!isStorageLike(storageLike)) {
        return {
            ok: true,
            key,
            snapshot: createEmptyCapabilitySnapshot(),
        };
    }

    try {
        const raw = storageLike.getItem(key);
        if (raw == null || raw === '') {
            return {
                ok: true,
                key,
                snapshot: createEmptyCapabilitySnapshot(),
            };
        }

        return {
            ok: true,
            key,
            snapshot: normalizeCapabilitySnapshot(JSON.parse(raw)),
        };
    } catch (error) {
        return {
            ok: false,
            reason: 'invalid-capability-snapshot',
            key,
            message: error instanceof Error ? error.message : String(error),
            snapshot: createEmptyCapabilitySnapshot(),
        };
    }
}

export function writeCapabilitySnapshot(storageLike, snapshot, key = CAPABILITY_STORE_KEY) {
    if (!isStorageLike(storageLike)) {
        return {
            ok: false,
            reason: 'missing-storage-like',
            key,
        };
    }

    const normalized = normalizeCapabilitySnapshot(snapshot);
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
            reason: 'capability-store-write-failed',
            key,
            message: error instanceof Error ? error.message : String(error),
            snapshot: normalized,
        };
    }
}

function removeCapabilitySnapshot(storageLike, key = CAPABILITY_STORE_KEY) {
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
            reason: 'capability-store-remove-failed',
            key,
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

function createMemoryStorage(initialData = {}) {
    const data = new Map();
    for (const [key, value] of Object.entries(initialData || {})) {
        data.set(String(key), typeof value === 'string' ? value : JSON.stringify(value));
    }
    return {
        getItem(key) {
            const storageKey = String(key);
            return data.has(storageKey) ? data.get(storageKey) : null;
        },
        setItem(key, value) {
            data.set(String(key), String(value));
        },
        removeItem(key) {
            data.delete(String(key));
        },
        dump() {
            return Object.fromEntries(data.entries());
        },
    };
}

function normalizePositiveInteger(value, fallback) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) return fallback;
    return number;
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : String(value || '').trim();
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
