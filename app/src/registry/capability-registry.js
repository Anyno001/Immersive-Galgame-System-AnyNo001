import { dispatchImportBundle } from './import-dispatcher.js';
import {
    createCapabilityStore,
    createEmptyCapabilitySnapshot,
    normalizeCapabilitySnapshot,
} from '../storage/capability-store.js';

const NON_PRESET_TYPES = new Set([
    'image-provider',
    'image-request-builder',
    'ui-component',
    'choice-component',
    'background-pack',
    'character-pack',
]);

const SERIALIZABLE_OMIT_KEYS = new Set([
    'detect',
    'generate',
    'poll',
    'extractImages',
    'fetchModels',
    'validateRequest',
    'buildRequest',
    'setup',
    'teardown',
]);

export function createCapabilityRegistry(options = {}) {
    const store = options.store || createCapabilityStore(options.storage, options.storeOptions);
    const runtimeItems = new Map();
    const state = {
        snapshot: createEmptyCapabilitySnapshot(),
    };

    const registry = {
        store,
        hydrate,
        snapshot,
        register,
        unregister,
        enable,
        disable,
        rename,
        get,
        list,
        listAll,
        clearCurrent,
        setCurrent,
        getCurrent,
        exportItem,
        exportGroup,
        importBundle,
        group,
    };

    if (options.autoHydrate !== false) {
        hydrate();
    }

    return registry;

    function hydrate() {
        const loadResult = store.load();
        state.snapshot = sanitizeSnapshot(loadResult.snapshot);
        return {
            ...loadResult,
            snapshot: snapshot(),
        };
    }

    function snapshot() {
        return normalizeCapabilitySnapshot(state.snapshot);
    }

    function register(item, registerOptions = {}) {
        const normalized = normalizeCapabilityItem(item, registerOptions.type);
        if (!normalized.type || !normalized.id) {
            return { ok: false, reason: 'missing-id', item: cloneData(normalized) };
        }
        if (!NON_PRESET_TYPES.has(normalized.type)) {
            return { ok: false, reason: 'unsupported-capability-type', type: normalized.type, id: normalized.id };
        }

        const nextSnapshot = snapshot();
        if (!nextSnapshot.items[normalized.type]) nextSnapshot.items[normalized.type] = {};

        const existing = nextSnapshot.items[normalized.type][normalized.id];
        const storedItem = {
            ...cloneData(existing || {}),
            ...toStoredCapabilityItem(normalized),
        };
        if (existing && existing.name && !registerOptions.replaceName) {
            storedItem.name = existing.name;
            storedItem.label = existing.label || existing.name;
        }
        nextSnapshot.items[normalized.type][normalized.id] = storedItem;

        const shouldEnable = registerOptions.enabled !== false && !isDisabled(nextSnapshot, normalized.type, normalized.id);
        if (shouldEnable) {
            removeDisabled(nextSnapshot, normalized.type, normalized.id);
        } else {
            addDisabled(nextSnapshot, normalized.type, normalized.id);
        }

        if ((registerOptions.current === true || !nextSnapshot.current[normalized.type]) && shouldEnable) {
            nextSnapshot.current[normalized.type] = normalized.id;
        }

        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) return commitResult;
        setRuntimeItem(normalized.type, normalized.id, item, storedItem);
        return {
            ok: true,
            type: normalized.type,
            id: normalized.id,
            item: mergeRuntimeItem(item, storedItem, shouldEnable),
            replaced: Boolean(existing),
        };
    }

    function unregister(type, id) {
        const normalizedType = normalizeString(type);
        const normalizedId = normalizeString(id);
        const existing = getStoredItem(normalizedType, normalizedId);
        if (!existing) return { ok: false, reason: 'missing-capability', type: normalizedType, id: normalizedId };

        const nextSnapshot = snapshot();
        if (existing.builtin && existing.detachable !== false) {
            addDisabled(nextSnapshot, normalizedType, normalizedId);
            if (nextSnapshot.current[normalizedType] === normalizedId) delete nextSnapshot.current[normalizedType];
            const commitResult = commitSnapshot(nextSnapshot);
            if (!commitResult.ok) return commitResult;
            return { ok: true, type: normalizedType, id: normalizedId, disabled: true };
        }

        delete nextSnapshot.items[normalizedType][normalizedId];
        if (Object.keys(nextSnapshot.items[normalizedType]).length === 0) delete nextSnapshot.items[normalizedType];
        removeDisabled(nextSnapshot, normalizedType, normalizedId);
        if (nextSnapshot.current[normalizedType] === normalizedId) delete nextSnapshot.current[normalizedType];

        const typeMap = runtimeItems.get(normalizedType);
        if (typeMap) typeMap.delete(normalizedId);

        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) return commitResult;
        return { ok: true, type: normalizedType, id: normalizedId, removed: true };
    }

    function enable(type, id) {
        const normalizedType = normalizeString(type);
        const normalizedId = normalizeString(id);
        if (!getStoredItem(normalizedType, normalizedId)) {
            return { ok: false, reason: 'missing-capability', type: normalizedType, id: normalizedId };
        }
        const nextSnapshot = snapshot();
        removeDisabled(nextSnapshot, normalizedType, normalizedId);
        if (!nextSnapshot.current[normalizedType]) nextSnapshot.current[normalizedType] = normalizedId;
        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) return commitResult;
        return { ok: true, type: normalizedType, id: normalizedId };
    }

    function disable(type, id) {
        const normalizedType = normalizeString(type);
        const normalizedId = normalizeString(id);
        if (!getStoredItem(normalizedType, normalizedId)) {
            return { ok: false, reason: 'missing-capability', type: normalizedType, id: normalizedId };
        }
        const nextSnapshot = snapshot();
        addDisabled(nextSnapshot, normalizedType, normalizedId);
        if (nextSnapshot.current[normalizedType] === normalizedId) delete nextSnapshot.current[normalizedType];
        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) return commitResult;
        return { ok: true, type: normalizedType, id: normalizedId };
    }

    function rename(type, id, name) {
        const normalizedType = normalizeString(type);
        const normalizedId = normalizeString(id);
        const normalizedName = normalizeString(name);
        if (!normalizedName) return { ok: false, reason: 'missing-name', type: normalizedType, id: normalizedId };
        const existing = getStoredItem(normalizedType, normalizedId);
        if (!existing) return { ok: false, reason: 'missing-capability', type: normalizedType, id: normalizedId };

        const nextSnapshot = snapshot();
        nextSnapshot.items[normalizedType][normalizedId] = {
            ...cloneData(existing),
            name: normalizedName,
            label: normalizedName,
        };
        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) return commitResult;
        return { ok: true, type: normalizedType, id: normalizedId, name: normalizedName };
    }

    function get(type, id, options = {}) {
        const normalizedType = normalizeString(type);
        const normalizedId = normalizeString(id);
        const stored = getStoredItem(normalizedType, normalizedId);
        if (!stored) return null;
        const disabled = isDisabled(state.snapshot, normalizedType, normalizedId);
        if (disabled && options.includeDisabled !== true) return null;
        const runtime = getRuntimeItem(normalizedType, normalizedId);
        return mergeRuntimeItem(runtime, stored, !disabled);
    }

    function list(type) {
        const normalizedType = normalizeString(type);
        return listAll(normalizedType).filter((item) => item.enabled !== false);
    }

    function listAll(type) {
        const normalizedType = normalizeString(type);
        const storedItems = Object.values(state.snapshot.items[normalizedType] || {});
        return storedItems.map((stored) => {
            const disabled = isDisabled(state.snapshot, normalizedType, stored.id);
            return mergeRuntimeItem(getRuntimeItem(normalizedType, stored.id), stored, !disabled);
        });
    }

    function setCurrent(type, id) {
        const normalizedType = normalizeString(type);
        const normalizedId = normalizeString(id);
        const item = get(normalizedType, normalizedId);
        if (!item) return { ok: false, reason: 'missing-capability', type: normalizedType, id: normalizedId };
        const nextSnapshot = snapshot();
        nextSnapshot.current[normalizedType] = normalizedId;
        removeDisabled(nextSnapshot, normalizedType, normalizedId);
        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) return commitResult;
        return { ok: true, type: normalizedType, id: normalizedId, item: get(normalizedType, normalizedId) };
    }

    function clearCurrent(type) {
        const normalizedType = normalizeString(type);
        if (!normalizedType) return { ok: false, reason: 'missing-type', type: normalizedType };
        const nextSnapshot = snapshot();
        delete nextSnapshot.current[normalizedType];
        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) return commitResult;
        return { ok: true, type: normalizedType };
    }

    function getCurrent(type) {
        const normalizedType = normalizeString(type);
        const id = state.snapshot.current[normalizedType];
        return id ? get(normalizedType, id) : null;
    }

    function exportItem(type, id) {
        const item = get(type, id, { includeDisabled: true });
        return item ? toExportableItem(item) : null;
    }

    function exportGroup(type) {
        const normalizedType = normalizeString(type);
        return {
            type: 'igs-import-bundle',
            items: listAll(normalizedType).map(toExportableItem),
        };
    }

    function importBundle(bundle, importOptions = {}) {
        const dispatchResult = dispatchImportBundle(bundle, {});
        const accepted = [];
        const rejected = dispatchResult.rejected.map(cloneData);

        for (const item of dispatchResult.accepted) {
            if (!NON_PRESET_TYPES.has(item.type)) {
                rejected.push({
                    item: cloneData(item),
                    reason: 'no-capability-handler',
                });
                continue;
            }
            const result = register(item, {
                type: item.type,
                current: importOptions.current === true,
                replaceName: true,
            });
            if (!result.ok) {
                rejected.push({
                    item: cloneData(item),
                    reason: result.reason || 'invalid-capability',
                });
                continue;
            }
            accepted.push(toExportableItem(result.item));
        }

        return {
            ok: rejected.length === 0,
            accepted,
            rejected,
        };
    }

    function group(type) {
        return createCapabilityGroup(registry, type);
    }

    function commitSnapshot(nextSnapshot) {
        const normalized = sanitizeSnapshot(nextSnapshot);
        const saveResult = store.save(normalized);
        if (!saveResult.ok) return saveResult;
        state.snapshot = normalizeCapabilitySnapshot(saveResult.snapshot);
        return { ok: true, snapshot: snapshot() };
    }

    function getStoredItem(type, id) {
        return state.snapshot.items[type] && state.snapshot.items[type][id] || null;
    }

    function setRuntimeItem(type, id, item, stored) {
        if (!runtimeItems.has(type)) runtimeItems.set(type, new Map());
        runtimeItems.get(type).set(id, mergeRuntimeItem(item, stored, true));
    }

    function getRuntimeItem(type, id) {
        const typeMap = runtimeItems.get(type);
        return typeMap ? typeMap.get(id) || null : null;
    }
}

export function createCapabilityGroup(registry, type) {
    return {
        register(item) {
            return registry.register(item, { type });
        },
        unregister(id) {
            return registry.unregister(type, id);
        },
        enable(id) {
            return registry.enable(type, id);
        },
        disable(id) {
            return registry.disable(type, id);
        },
        rename(id, name) {
            return registry.rename(type, id, name);
        },
        setCurrent(id) {
            return registry.setCurrent(type, id);
        },
        clearCurrent() {
            return registry.clearCurrent(type);
        },
        getCurrent() {
            return registry.getCurrent(type);
        },
        get(id) {
            return registry.get(type, id);
        },
        list() {
            return registry.list(type);
        },
        listAll() {
            return registry.listAll(type);
        },
        export(id) {
            return registry.exportItem(type, id);
        },
        exportAll() {
            return registry.exportGroup(type);
        },
    };
}

function sanitizeSnapshot(snapshot) {
    const source = normalizeCapabilitySnapshot(snapshot);
    const next = createEmptyCapabilitySnapshot();
    next.version = source.version;
    next.updatedAt = source.updatedAt;
    next.drafts = cloneData(source.drafts);

    for (const [type, records] of Object.entries(source.items || {})) {
        if (!NON_PRESET_TYPES.has(type)) continue;
        for (const item of Object.values(records || {})) {
            const normalized = normalizeCapabilityItem(item, type);
            if (!normalized.id) continue;
            if (!next.items[type]) next.items[type] = {};
            next.items[type][normalized.id] = toStoredCapabilityItem(normalized);
        }
    }

    for (const [type, ids] of Object.entries(source.disabled || {})) {
        if (!next.items[type]) continue;
        const disabledIds = ids.filter((id) => next.items[type][id]);
        if (disabledIds.length) next.disabled[type] = disabledIds;
    }

    for (const [type, id] of Object.entries(source.current || {})) {
        if (!next.items[type] || !next.items[type][id]) continue;
        if (isDisabled(next, type, id)) continue;
        next.current[type] = id;
    }

    return normalizeCapabilitySnapshot(next);
}

function normalizeCapabilityItem(item, expectedType) {
    const source = isPlainObject(item) ? item : {};
    const type = normalizeString(expectedType || source.type);
    const id = normalizeString(source.id || source.name);
    const name = normalizeString(source.name || source.label || id || type);
    const label = normalizeString(source.label || name);
    const data = isPlainObject(source.data) ? cloneData(source.data) : collectInlineData(source);
    return {
        ...cloneData(source),
        type,
        id,
        name,
        label,
        data,
        builtin: source.builtin === true,
        detachable: source.detachable !== false,
        source: normalizeString(source.source || (source.builtin ? 'builtin' : 'user')),
    };
}

function toStoredCapabilityItem(item) {
    const normalized = normalizeCapabilityItem(item, item && item.type);
    const stored = {};
    for (const [key, value] of Object.entries(normalized)) {
        if (SERIALIZABLE_OMIT_KEYS.has(key) || typeof value === 'function') continue;
        stored[key] = cloneData(value);
    }
    return stored;
}

function toExportableItem(item) {
    const stored = toStoredCapabilityItem(item);
    return {
        type: stored.type,
        id: stored.id,
        name: stored.name,
        version: stored.version || 1,
        data: cloneData(stored.data || {}),
        builtin: stored.builtin === true,
        detachable: stored.detachable !== false,
        source: stored.source || 'user',
    };
}

function mergeRuntimeItem(runtime, stored, enabled) {
    const runtimeObject = runtime && typeof runtime === 'object' ? runtime : {};
    const storedObject = stored && typeof stored === 'object' ? stored : {};
    return {
        ...runtimeObject,
        ...cloneData(storedObject),
        enabled,
        disabled: enabled === false,
    };
}

function collectInlineData(source) {
    const data = {};
    for (const [key, value] of Object.entries(source || {})) {
        if (['format', 'type', 'id', 'name', 'label', 'version', 'data', 'builtin', 'detachable', 'source'].includes(key)) continue;
        if (SERIALIZABLE_OMIT_KEYS.has(key) || typeof value === 'function') continue;
        data[key] = cloneData(value);
    }
    return data;
}

function isDisabled(snapshot, type, id) {
    return Array.isArray(snapshot.disabled[type]) && snapshot.disabled[type].includes(id);
}

function addDisabled(snapshot, type, id) {
    if (!snapshot.disabled[type]) snapshot.disabled[type] = [];
    if (!snapshot.disabled[type].includes(id)) snapshot.disabled[type].push(id);
}

function removeDisabled(snapshot, type, id) {
    if (!Array.isArray(snapshot.disabled[type])) return;
    snapshot.disabled[type] = snapshot.disabled[type].filter((itemId) => itemId !== id);
    if (!snapshot.disabled[type].length) delete snapshot.disabled[type];
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
