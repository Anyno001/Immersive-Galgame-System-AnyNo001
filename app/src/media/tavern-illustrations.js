import { createTavernImageFiles } from './tavern-image-files.js';
import { createMediaRecordJournal } from './media-record-journal.js';
import { mediaFileGcFor } from './media-file-gc.js';
import { IMAGE_FIELDS } from './image-identity.js';
import { retryInlineMedia } from './media-migration.js';
import { applyIllustrationSlotUpdate, unchangedIllustrationSlot } from './illustration-store.js';
export const CG_RECORDS_FILE = 'igs-cg-records.json';

export function withTavernIllustrationFiles(store, globalObject = globalThis) {
    const files = createTavernImageFiles(globalObject, 'igs-cg');
    const keyOf = (floorKey, slot) => `${floorKey}|${slot}`;
    const getRaw = async key => typeof store.getSlotRecord === 'function' ? store.getSlotRecord(key)
        : (await store.getSlots(key.slice(0, key.lastIndexOf('|')))).find(value => value.slot === Number(key.slice(key.lastIndexOf('|') + 1)));
    const all = async () => {
        const keys = typeof store.listSlotKeys === 'function' ? await store.listSlotKeys() : [];
        // 一个事务批量取：逐条 getSlotRecord 各开一个事务，CG 多时启动恢复和每轮同步都被拖慢。
        if (typeof store.getSlotRecords === 'function') {
            const values = await store.getSlotRecords(keys);
            return keys.map((key, index) => [key, values[index] || null]);
        }
        return Promise.all(keys.map(async key => [key, await getRaw(key)]));
    };
    const journal = createMediaRecordJournal(globalObject, {
        fileName: CG_RECORDS_FILE, legacyField: 'slots', list: all,
        get: getRaw,
        onApply: (key, old, next, previous) => files.acceptRemote(old, next, [`cg:${key}`], [`thumb:cg:${key}:`], previous),
        async beforeFlush() { return retryInlineMedia(await all(), files, (key, record) => save(key.slice(0, key.lastIndexOf('|')), record, record)); },
        put: (key, value) => store.putSlot(value.floorKey || key.slice(0, key.lastIndexOf('|')), value, { restore: true }),
        remove: key => store.deleteSlot(key.slice(0, key.lastIndexOf('|')), Number(key.slice(key.lastIndexOf('|') + 1))),
    });
    mediaFileGcFor(globalObject).register(async () => (await all()).map(([, value]) => value));
    async function save(floorKey, value, expected = null) {
        await journal.restore().catch(() => {});
        const key = keyOf(floorKey, value.slot), old = await getRaw(key);
        const next = await files.offload({ ...value, floorKey }, key, old);
        let saved;
        try {
            if (unchangedIllustrationSlot(old, next, floorKey)) {
                if (!files.sameRecord(expected || old, await getRaw(key))) throw new Error('image-write-stale');
                return old;
            }
            await journal.write(key, next, async () => {
                if (!files.sameRecord(expected || old, await getRaw(key))) throw new Error('image-write-stale');
                saved = await store.putSlot(floorKey, next);
                return { ok: true, record: saved };
            });
            await files.dropUnused(old, next);
            return saved;
        } catch (error) { await files.dropUnused(next, old); throw error; }
        finally { await files.release(next); }
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
        async updateSlot(floorKey, slot, expectedRevision, patch, options = {}) {
            await journal.restore().catch(() => {});
            await options.beforeCommit?.();
            const key = keyOf(floorKey, slot), old = await getRaw(key);
            const checked = applyIllustrationSlotUpdate(old, expectedRevision, patch, options);
            if (!checked.ok) return checked;
            const next = await files.offload(checked.record, key, old);
            try {
                const result = await journal.write(key, async () => {
                    const latest = await getRaw(key);
                    const valid = applyIllustrationSlotUpdate(latest, expectedRevision, patch, options);
                    if (!valid.ok) throw Object.assign(new Error(valid.reason), { result: valid });
                    return next;
                }, () => store.updateSlot(floorKey, slot, expectedRevision, next,
                    { ...options, beforeCommit: undefined, preserveBaseline: false }));
                await files.dropUnused(old, result.record);
                return result;
            } catch (error) {
                await files.dropUnused(next, await getRaw(key));
                if (error.result) return error.result;
                throw error;
            } finally { await files.release(next); }
        },
        async deleteSlot(floorKey, slot) {
            await journal.restore().catch(() => {});
            const key = keyOf(floorKey, slot), old = await getRaw(key);
            const result = await journal.write(key, null, () => store.deleteSlot(floorKey, slot));
            await files.dropUnused(old, null);
            return result;
        },
        async listSlotKeys() { await journal.restore(); return store.listSlotKeys(); },
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
