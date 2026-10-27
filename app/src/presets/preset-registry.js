import { dispatchImportBundle } from '../registry/import-dispatcher.js';
import { createEmptyPresetSnapshot, createPresetStore, normalizePresetSnapshot } from '../storage/preset-store.js';
import { PRESET_TYPES, validatePresetByType } from './preset-types.js';
import { validatePromptActivation } from './prompt-preset.js';
import { createPromptPresetApi } from './prompt-preset-api.js';
import { applyOperationEdits } from '../storage/operation-edits.js';

const PRESET_TYPE_SET = new Set(PRESET_TYPES);

export function createPresetRegistry(options = {}) {
    const store = options.store || createPresetStore(options.storage, options.storeOptions);
    const state = {
        snapshot: createEmptyPresetSnapshot(),
        ready: false,
        imagePromptEpoch: 0,
        imagePromptSignature: '',
    };
    const imagePromptListeners = new Set();

    const registry = {
        store,
        hydrate,
        snapshot,
        register,
        unregister,
        get,
        list,
        setCurrent,
        getCurrent,
        getCurrentData,
        peekImagePromptIndex,
        exportPreset,
        exportGroup,
        importBundle,
        ...createPromptPresetApi({ read: snapshot, commit: commitSnapshot,
            isReady: () => { if (!state.ready) hydrate(); return state.ready; } }),
        getImagePromptEpoch: () => state.ready ? state.imagePromptEpoch : null,
        onImagePromptChanged(handler) {
            imagePromptListeners.add(handler);
            return () => imagePromptListeners.delete(handler);
        },
        getStatus: () => ({ ok: state.ready, reason: state.ready ? '' : 'preset-store-unreadable' }),
    };

    if (options.autoHydrate !== false) {
        hydrate();
    }

    return registry;

    function hydrate() {
        const loadResult = store.load();
        state.ready = loadResult.ok === true;
        if (!state.ready) return { ...loadResult, snapshot: snapshot(), rejected: [] };
        const normalized = sanitizeSnapshot(loadResult.snapshot);
        if (normalized.rejected.length) {
            state.ready = false;
        }
        state.snapshot = normalized.snapshot;
        updateImagePromptEpoch();

        return {
            ...loadResult,
            snapshot: cloneData(state.snapshot),
            rejected: normalized.rejected,
        };
    }

    function snapshot() {
        return cloneData(state.snapshot);
    }

    function register(preset, options = {}) {
        const candidate = withExpectedType(preset, options.type);
        const validation = validatePresetByType(candidate);
        if (!validation.ok) {
            return {
                ok: false,
                item: cloneData(candidate),
                normalized: validation.normalized ? cloneData(validation.normalized) : null,
                errors: validation.errors.map(cloneData),
            };
        }

        const nextSnapshot = cloneData(state.snapshot);
        const type = validation.normalized.type;
        const id = validation.normalized.id;
        const existing = get(type, id);
        if (type === 'prompt-preset' && existing
            && (existing.data.usage === 'imagegen' || validation.normalized.data.usage === 'imagegen'))
            return { ok: false, reason: 'preset-id-conflict', errors: [] };
        if (type === 'prompt-preset' && validation.normalized.data.usage === 'imagegen') {
            if (nextSnapshot.current[type] === id) {
                const active = validatePromptActivation(validation.normalized.data);
                if (!active.ok) return { ok: false, reason: 'prompt-not-activatable', errors: active.errors };
            }
        }

        if (!nextSnapshot.items[type]) {
            nextSnapshot.items[type] = {};
        }

        const replaced = Object.prototype.hasOwnProperty.call(nextSnapshot.items[type], id);
        nextSnapshot.items[type][id] = cloneData(validation.normalized);
        const currentChanged = false;
        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) {
            return {
                ok: false,
                reason: commitResult.reason,
                item: cloneData(candidate),
                normalized: cloneData(validation.normalized),
                errors: validation.errors.map(cloneData),
                message: commitResult.message,
            };
        }

        return {
            ok: true,
            item: cloneData(candidate),
            normalized: cloneData(validation.normalized),
            replaced,
            currentChanged,
            errors: [],
        };
    }

    function unregister(type, id) {
        const normalizedType = normalizeType(type);
        const normalizedId = normalizeId(id);
        if (!normalizedType || !normalizedId) {
            return { ok: false, reason: 'missing-id', type: normalizedType, id: normalizedId };
        }

        const nextSnapshot = cloneData(state.snapshot);
        if (!nextSnapshot.items[normalizedType] || !Object.prototype.hasOwnProperty.call(nextSnapshot.items[normalizedType], normalizedId)) {
            return { ok: false, reason: 'missing-preset', type: normalizedType, id: normalizedId };
        }

        delete nextSnapshot.items[normalizedType][normalizedId];
        if (Object.keys(nextSnapshot.items[normalizedType]).length === 0) {
            delete nextSnapshot.items[normalizedType];
        }
        if (nextSnapshot.current[normalizedType] === normalizedId) {
            delete nextSnapshot.current[normalizedType];
        }

        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) {
            return { ok: false, reason: commitResult.reason, type: normalizedType, id: normalizedId, message: commitResult.message };
        }

        return { ok: true, type: normalizedType, id: normalizedId };
    }

    function get(type, id) {
        const normalizedType = normalizeType(type);
        const normalizedId = normalizeId(id);
        if (!normalizedType || !normalizedId) return null;
        const item = state.snapshot.items[normalizedType] && state.snapshot.items[normalizedType][normalizedId];
        return item ? cloneData(item) : null;
    }

    function list(type) {
        const normalizedType = normalizeType(type);
        if (!normalizedType) return [];
        return Object.values(state.snapshot.items[normalizedType] || {}).map(cloneData);
    }

    function setCurrent(type, id) {
        const normalizedType = normalizeType(type);
        const normalizedId = normalizeId(id);
        if (!normalizedType || !normalizedId) {
            return { ok: false, reason: 'missing-id', type: normalizedType, id: normalizedId };
        }

        const item = state.snapshot.items[normalizedType] && state.snapshot.items[normalizedType][normalizedId];
        if (!item) {
            return { ok: false, reason: 'missing-preset', type: normalizedType, id: normalizedId };
        }

        const validation = validatePresetByType(item);
        if (!validation.ok) {
            return { ok: false, reason: 'invalid-preset', type: normalizedType, id: normalizedId, errors: validation.errors.map(cloneData) };
        }

        if (normalizedType === 'prompt-preset' && validation.normalized.data.usage === 'imagegen') {
            const active = validatePromptActivation(validation.normalized.data);
            if (!active.ok) return { ok: false, reason: 'prompt-not-activatable', errors: active.errors };
        }
        const nextSnapshot = cloneData(state.snapshot);
        nextSnapshot.current[normalizedType] = normalizedId;
        if (!nextSnapshot.items[normalizedType]) nextSnapshot.items[normalizedType] = {};
        nextSnapshot.items[normalizedType][normalizedId] = cloneData(validation.normalized);

        const commitResult = commitSnapshot(nextSnapshot);
        if (!commitResult.ok) {
            return { ok: false, reason: commitResult.reason, type: normalizedType, id: normalizedId, message: commitResult.message };
        }

        return {
            ok: true,
            type: normalizedType,
            id: normalizedId,
            item: cloneData(validation.normalized),
        };
    }

    function getCurrent(type) {
        const normalizedType = normalizeType(type);
        if (!normalizedType) return null;
        const id = state.snapshot.current[normalizedType];
        return id ? get(normalizedType, id) : null;
    }

    function getCurrentData(type) {
        const current = getCurrent(type);
        return current ? cloneData(current.data) : null;
    }

    // 只读轻量索引：不拷贝快照，调用方不得修改返回值之外的任何内部对象（返回值本身是新数组）。
    function peekImagePromptIndex() {
        if (!state.ready) return null;
        const items = [], seen = new Set();
        for (const [id, item] of Object.entries(state.snapshot.items['prompt-preset'] || {})) {
            if (item?.data?.usage !== 'imagegen') continue;
            seen.add(id);
            items.push({ id, name: item.name || id, revision: item.data.revision ?? null, draftOnly: false });
        }
        for (const [id, draft] of Object.entries(state.snapshot.drafts?.['prompt-preset'] || {})) {
            if (seen.has(id) || draft?.preset?.data?.usage !== 'imagegen') continue;
            items.push({ id, name: draft.preset.name || id, revision: null, draftOnly: true });
        }
        return { items, currentId: state.snapshot.current['prompt-preset'] || null };
    }

    function exportPreset(type, id) {
        return get(type, id);
    }

    function exportGroup(type) {
        const normalizedType = normalizeType(type);
        return {
            type: 'igs-import-bundle',
            items: normalizedType ? list(normalizedType) : [],
        };
    }

    function importBundle(bundle, options = {}) {
        return importPresetBundle(registry, bundle, options);
    }

    function commitSnapshot(nextSnapshot) {
        const stored = store.load();
        if (!stored.ok) {
            state.ready = false;
            return { ok: false, reason: 'preset-store-unreadable' };
        }
        const latest = normalizePresetSnapshot(stored.snapshot);
        const normalized = normalizePresetSnapshot(applyOperationEdits(state.snapshot, latest, nextSnapshot));
        // 当前动作只覆盖实际修改字段，外部已保存的其它条目、草稿和选择继续保留。
        for (const [id, item] of Object.entries(normalized.items['prompt-preset'] || {})) {
            const before = state.snapshot.items['prompt-preset']?.[id];
            if (JSON.stringify(before) !== JSON.stringify(nextSnapshot.items['prompt-preset']?.[id])
                && latest.items['prompt-preset']?.[id]?.data?.revision >= item?.data?.revision)
                item.data.revision = latest.items['prompt-preset'][id].data.revision + 1;
        }
        const checked = sanitizeSnapshot(normalized);
        if (checked.rejected.length) return { ok: false, reason: 'invalid-preset-snapshot', rejected: checked.rejected };
        normalized.revision = Math.max(latest.revision || 0, state.snapshot.revision || 0) + 1;
        const saveResult = store.save(normalized);
        if (!saveResult.ok) {
            return saveResult;
        }
        state.snapshot = normalizePresetSnapshot(saveResult.snapshot);
        state.ready = true;
        updateImagePromptEpoch();
        return { ok: true, snapshot: cloneData(state.snapshot) };
    }

    function updateImagePromptEpoch() {
        const id = state.snapshot.current['prompt-preset'];
        const signature = JSON.stringify([id, state.snapshot.items['prompt-preset']?.[id]?.data]);
        if (signature !== state.imagePromptSignature) {
            state.imagePromptSignature = signature;
            state.imagePromptEpoch += 1;
            for (const handler of imagePromptListeners) {
                try { handler(); } catch { /* 订阅失败不能改变已经提交的快照 */ }
            }
        }
    }
}

export function createPresetGroup(registry, type) {
    return {
        register(item) {
            return registry.register(item, { type });
        },
        unregister(id) {
            return registry.unregister(type, id);
        },
        get(id) {
            return registry.get(type, id);
        },
        list() {
            return registry.list(type);
        },
        setCurrent(id) {
            return registry.setCurrent(type, id);
        },
        getCurrent() {
            return registry.getCurrent(type);
        },
        export(id) {
            return registry.exportPreset(type, id);
        },
        exportAll() {
            return registry.exportGroup(type);
        },
    };
}

export function importPresetBundle(registry, bundle, options = {}) {
    const dispatchResult = dispatchImportBundle(bundle, {});
    const accepted = [];
    const rejected = dispatchResult.rejected.map(cloneData);

    for (const item of dispatchResult.accepted) {
        if (!PRESET_TYPE_SET.has(item.type)) {
            rejected.push({
                item: cloneData(item),
                reason: 'no-preset-handler',
            });
            continue;
        }

        const result = registry.register(item, {
            type: item.type,
            ...options,
        });
        if (!result.ok) {
            rejected.push({
                item: cloneData(item),
                reason: 'invalid-preset',
                errors: (result.errors || []).map(cloneData),
            });
            continue;
        }
        accepted.push(cloneData(result.normalized));
    }

    return {
        ok: rejected.length === 0,
        accepted,
        rejected,
    };
}

function sanitizeSnapshot(snapshot) {
    const source = normalizePresetSnapshot(snapshot);
    const nextSnapshot = createEmptyPresetSnapshot();
    nextSnapshot.version = source.version;
    nextSnapshot.updatedAt = source.updatedAt;
    nextSnapshot.revision = source.revision;
    nextSnapshot.drafts = cloneData(source.drafts);
    const rejected = [];

    for (const [type, records] of Object.entries(source.items || {})) {
        if (!PRESET_TYPE_SET.has(type)) continue;
        for (const [id, item] of Object.entries(records || {})) {
            const validation = validatePresetByType(withExpectedType(item, type, id));
            if (!validation.ok) {
                rejected.push({
                    item: cloneData(item),
                    reason: 'invalid-stored-preset',
                    errors: validation.errors.map(cloneData),
                });
                continue;
            }
            if (!nextSnapshot.items[type]) nextSnapshot.items[type] = {};
            nextSnapshot.items[type][validation.normalized.id] = cloneData(validation.normalized);
        }
    }

    for (const [type, id] of Object.entries(source.current || {})) {
        if (!nextSnapshot.items[type] || !Object.prototype.hasOwnProperty.call(nextSnapshot.items[type], id)) {
            continue;
        }
        const item = nextSnapshot.items[type][id];
        if (type === 'prompt-preset' && item.data.usage === 'imagegen') {
            const active = validatePromptActivation(item.data);
            if (!active.ok) {
                rejected.push({ reason: 'invalid-stored-current', id, errors: active.errors });
                continue;
            }
        }
        nextSnapshot.current[type] = id;
    }

    return {
        snapshot: normalizePresetSnapshot(nextSnapshot),
        rejected,
    };
}

function withExpectedType(preset, expectedType, fallbackId) {
    if (!expectedType) return cloneData(preset);
    const source = isPlainObject(preset) ? preset : {};
    return {
        ...cloneData(source),
        type: expectedType,
        id: normalizeId(source.id || fallbackId),
    };
}

function normalizeType(type) {
    const text = typeof type === 'string' ? type.trim() : '';
    return text || '';
}

function normalizeId(id) {
    const text = typeof id === 'string' ? id.trim() : '';
    return text || '';
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
