import { createTavernImageFiles } from './tavern-image-files.js';
import { createMediaRecordJournal } from './media-record-journal.js';
import { mediaFileGcFor } from './media-file-gc.js';
import { IMAGE_FIELDS } from './image-identity.js';
import { retryInlineMedia } from './media-migration.js';
import { slotPatch } from './illustration-store.js';
export const CG_RECORDS_FILE = 'igs-cg-records.json';

export function withTavernIllustrationFiles(store, globalObject = globalThis) {
    const files = createTavernImageFiles(globalObject, 'igs-cg');
    const keyOf = (floorKey, slot) => `${floorKey}|${slot}`;
    const getRaw = async key => typeof store.getSlotRecord === 'function' ? store.getSlotRecord(key)
        : (await store.getSlots(key.slice(0, key.lastIndexOf('|')))).find(value => value.slot === Number(key.slice(key.lastIndexOf('|') + 1)));
    const all = async () => {
        const keys = typeof store.listSlotKeys === 'function' ? await store.listSlotKeys() : [];
        return Promise.all(keys.map(async key => [key, await getRaw(key)]));
    };
    const journal = createMediaRecordJournal(globalObject, {
        fileName: CG_RECORDS_FILE, legacyField: 'slots', list: all,
        get: getRaw,
        onApply: (key, old, next, previous) => files.acceptRemote(old, next, [`cg:${key}`], [`thumb:cg:${key}:`], previous),
        async beforeFlush() { return retryInlineMedia(await all(), files, (key, record) => save(key.slice(0, key.lastIndexOf('|')), record, record)); },
        put: (key, value) => store.putSlot(value.floorKey || key.slice(0, key.lastIndexOf('|')), value),
        remove: key => store.deleteSlot(key.slice(0, key.lastIndexOf('|')), Number(key.slice(key.lastIndexOf('|') + 1))),
    });
    mediaFileGcFor(globalObject).register(async () => (await all()).map(([, value]) => value));
    async function save(floorKey, value, expected = null) {
        await journal.restore().catch(() => {});
        const key = keyOf(floorKey, value.slot), old = await getRaw(key);
        const next = await files.offload({ ...value, floorKey }, key, old);
        try {
            const saved = await journal.write(key, next, async () => {
                if (!files.sameRecord(expected || old, await getRaw(key))) throw new Error('image-write-stale');
                return store.putSlot(floorKey, next);
            });
            await files.dropUnused(old, saved || next);
            return files.hydrate(saved || next);
        } catch (error) { await files.dropUnused(next, old); throw error; }
        finally { await files.release(next); }
    }
    async function updateSlot(floorKey, slot, expectedRevision, patch, options = {}) {
        await journal.restore().catch(() => {});
        if (typeof store.updateSlot !== 'function') return { ok: false, reason: 'update-unavailable' };
        const key = keyOf(floorKey, slot), old = await getRaw(key);
        const checked = slotPatch(old, expectedRevision, patch, options);
        if (!checked.ok) return checked;
        const prepared = { ...patch };
        if (options.preserveBaseline && !old.consistencyBaselineDataUrl) prepared.consistencyBaselineDataUrl = old.dataUrl;
        const next = await files.offload(prepared, key, old);
        let result;
        try {
            await options.beforeCommit?.();
            const { beforeCommit, ...commitOptions } = options;
            result = await journal.write(key, async () => {
                const projected = slotPatch(await getRaw(key), expectedRevision, next, commitOptions);
                if (!projected.ok) throw Object.assign(new Error(projected.reason), { result: projected });
                return projected.record;
            }, () => store.updateSlot(floorKey, slot, expectedRevision, next, commitOptions));
            await files.dropUnused(old, result.record);
        } catch (error) {
            await files.dropUnused(next, await getRaw(key));
            if (error.result) return error.result;
            throw error;
        } finally { await files.release(next); }
        try {
            const record = await files.hydrate(result.record);
            if (!record?.dataUrl && patch.dataUrl) return { ...result, record: { ...record, dataUrl: patch.dataUrl }, warning: 'cg-file-read-failed' };
            return { ...result, record };
        } catch {
            return { ...result, record: { ...result.record, ...(patch.dataUrl && { dataUrl: patch.dataUrl }) }, warning: 'cg-file-read-failed' };
        }
    }
    async function fromNames(floorKey) {
        const candidates = await Promise.all(Array.from({ length: 16 }, async (_, index) => {
            const slot = index + 1, key = keyOf(floorKey, slot);
            if (await journal.deleted(key)) return null;
            const found = await files.recover(key);
            if (!found) return null;
            const { id, ...record } = found;
            const recovered = { ...record, floorKey, slot, status: 'done', updatedAt: '' };
            await save(floorKey, recovered);
            return recovered;
        }));
        return candidates.filter(Boolean);
    }
    return {
        ...store,
        async getSlots(floorKey, options = {}) {
            let restoreError = null;
            try { await journal.restore(); } catch (error) { restoreError = error; }
            let list = await store.getSlots(floorKey);
            if (restoreError && !list.length) throw restoreError;
            if (!list.length && files.headers()) list = await fromNames(floorKey).catch(() => []);
            for (const record of list) if (files.hasData(record)) files.later(async () => {
                if (files.sameRecord(record, await getRaw(keyOf(floorKey, record.slot)))) await save(floorKey, record, record);
            });
            if (options.deferImages) return list;
            return Promise.all(list.map(record => files.hydrate(record, options)));
        },
        putSlot: save,
        updateSlot,
        async deleteSlot(floorKey, slot) {
            await journal.restore().catch(() => {});
            const key = keyOf(floorKey, slot), old = await getRaw(key);
            const result = await journal.write(key, null, () => store.deleteSlot(floorKey, slot));
            await files.dropUnused(old, null);
            return result;
        },
        async listSlotKeys(options = {}) {
            try {
                await journal.restore();
                if (options.requireComplete && journal.remoteExists() === null) {
                    throw new Error('media-backup-unavailable');
                }
                return await store.listSlotKeys(options);
            } catch (cause) {
                if (options.requireComplete) throw new Error('image-reference-unavailable', { cause });
                throw cause;
            }
        },
        async getSlotRecord(key) {
            await journal.restore();
            const existing = await getRaw(key);
            if (existing || await journal.deleted(key)) return existing;
            const recovered = await files.recover(key).catch(() => null);
            if (!recovered) return null;
            const { id, ...record } = recovered;
            const floorKey = key.slice(0, key.lastIndexOf('|')), slot = Number(key.slice(key.lastIndexOf('|') + 1));
            const value = { ...record, floorKey, slot, status: 'done', updatedAt: '' };
            await save(floorKey, value); return value;
        },
        async getSlotRecords(keys) { await journal.restore(); return Promise.all(keys.map(getRaw)); },
        async patchSlotMetadata(key, fields) {
            if (IMAGE_FIELDS.some(field => Object.hasOwn(fields, field))) return { ok: false, reason: 'metadata-only' };
            const old = await getRaw(key);
            if (!old) return { ok: false, reason: 'not-found' };
            const floorKey = key.slice(0, key.lastIndexOf('|'));
            await journal.write(key, async () => ({ ...await getRaw(key), ...fields }), value => store.putSlot(floorKey, value));
            return { ok: true };
        },
        hydrateSlot: files.hydrate,
        flush: journal.flush,
        diagnostics: journal.diagnostics,
    };
}
