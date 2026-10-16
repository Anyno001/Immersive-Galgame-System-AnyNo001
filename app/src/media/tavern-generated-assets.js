import { createTavernImageFiles } from './tavern-image-files.js';
import { createMediaRecordJournal } from './media-record-journal.js';
import { mediaFileGcFor } from './media-file-gc.js';
import { generatedImageReferences, generatedImageAudit } from './image-references.js';
import { IMAGE_FIELDS } from './image-identity.js';
import { applyGeneratedImageUpdate, applyGeneratedPromptUpdate } from './generated-asset-store.js';
import { readReferenceImageUrl } from './reference-image-reader.js';
import { retryInlineMedia } from './media-migration.js';

export function withTavernGeneratedAssetFiles(store, globalObject = globalThis) {
    const files = createTavernImageFiles(globalObject, 'igs-assets');
    const list = async () => [
        ...(await store.listImages()).map(value => [`image:${value.id}`, value]),
        ...(await store.listAssets()).map(value => [`asset:${value.key}`, { ...value, recordKey: value.key }]),
        ...(await store.listFloors()).map(value => [`floor:${value.key}`, { ...value, recordKey: value.key }]),
    ];
    const journal = createMediaRecordJournal(globalObject, {
        fileName: 'igs-asset-records.json', list,
        get: key => key.startsWith('image:') ? store.getImage(key.slice(6)) : key.startsWith('floor:') ? store.getFloor(key.slice(6)) : store.getAsset(key.slice(6)),
        onApply: (key, old, next, previous) => key.startsWith('image:') ? files.acceptRemote(old, next, [`asset:${key.slice(6)}`, `thumb:asset:${key.slice(6)}`], [], previous) : undefined,
        async beforeFlush() { return retryInlineMedia((await store.listImages()).map(record => [record.id, record]), files, (_key, record) => saveImage(record, record)); },
        put: (key, record) => key.startsWith('image:') ? store.putImage(record)
            : key.startsWith('asset:') ? store.putAsset({ ...record, key: record.recordKey || key.slice(6) }) : store.putFloor(key.slice(6), record),
        remove: key => key.startsWith('image:') ? store.deleteImage(key.slice(6))
            : key.startsWith('asset:') ? store.deleteAsset(key.slice(6)) : store.deleteFloor(key.slice(6)),
    });
    mediaFileGcFor(globalObject).register(() => store.listImages());
    let referenceRoot = () => null;
    async function raw(id) {
        try { await journal.restore(); } catch (error) { const local = await store.getImage(id); if (local) return local; throw error; }
        return store.getImage(id);
    }
    async function saveImage(value, expected = null) {
        await journal.restore().catch(() => {});
        const old = await store.getImage(value.id), next = await files.offload(value, value.id, old);
        try {
            await journal.write(`image:${value.id}`, next, async () => {
                if (!files.sameRecord(expected || old, await store.getImage(value.id))) throw new Error('image-write-stale');
                return store.putImage(next);
            });
            await files.dropUnused(old, next);
            return { ok: true, record: next };
        } catch (error) { await files.dropUnused(next, old); throw error; }
        finally { await files.release(next); }
    }
    const wrapper = {
        ...store,
        restore: journal.restore,
        hydrateImage: files.hydrate,
        getImageRecord: raw,
        async readImage(id, options) {
            const record = await store.getImage(id);
            if (!record?.dataUrl || /^data:image\//i.test(record.dataUrl)) return record;
            const dataUrl = await readReferenceImageUrl(record.dataUrl, globalObject, options);
            return dataUrl === null ? null : { ...record, dataUrl };
        },
        // 只读本机记录、不等恢复：给阅读器先显示用，没有时由调用方回到 getImageRecord。
        peekImageRecord: id => store.getImage(id),
        async listImages() { await journal.restore(); return store.listImages(); },
        async listAssets() { await journal.restore(); return store.listAssets(); },
        async listFloors() { await journal.restore(); return store.listFloors(); },
        async putImages(records) { for (const record of records || []) await saveImage(record); },
        async getImage(id, options = {}) {
            let record = await raw(id);
            if (!record && id && !await journal.deleted(`image:${id}`)) {
                record = await files.recover(id).catch(error => { if (options.strictRead) throw error; return null; });
                if (record) await saveImage(record);
            }
            if (files.hasData(record)) files.later(async () => {
                if (files.sameRecord(record, await store.getImage(id))) await saveImage(record, record);
            });
            return files.hydrate(record, options);
        },
        putImage: saveImage,
        async deleteImage(id, options = {}) {
            const old = await raw(id);
            const check = async () => {
                if (options.beforeDelete && !await options.beforeDelete()) return false;
                const references = await generatedImageReferences(store, globalObject, referenceRoot());
                return !references.ids.has(id);
            };
            try {
                await journal.write(`image:${id}`, async () => {
                    if (!await check()) throw Object.assign(new Error('image-referenced'), { retained: true });
                    return null;
                }, async () => {
                    const result = await store.deleteImage(id, { beforeDelete: check });
                    if (result?.retained) throw Object.assign(new Error('image-referenced'), { retained: true });
                    return result;
                });
            } catch (error) { if (error.retained) return { ok: true, retained: [id] }; throw error; }
            await files.dropUnused(old, null);
            return { ok: true, queued: true };
        },
        async patchImageMetadata(id, patch) {
            if (IMAGE_FIELDS.some(field => Object.hasOwn(patch, field)) || Object.hasOwn(patch, 'id')) return { ok: false, reason: 'metadata-only' };
            const old = await raw(id);
            if (!old) return { ok: false, reason: 'not-found' };
            let result;
            await journal.write(`image:${id}`, async () => ({ ...await store.getImage(id), ...patch }), async () => { result = await store.patchImageMetadata(id, patch); return result; });
            return result;
        },
        async updateImagePrompt(id, expectedRevision, prompt, updatedAt) {
            if (typeof store.updateImagePrompt !== 'function') return { ok: false, reason: 'update-unavailable' };
            try {
                return await journal.write(`image:${id}`, async () => {
                    const projected = applyGeneratedPromptUpdate(await store.getImage(id), expectedRevision, prompt, updatedAt);
                    if (!projected.ok) throw Object.assign(new Error(projected.reason), { result: projected });
                    return projected.record;
                }, () => store.updateImagePrompt(id, expectedRevision, prompt, updatedAt));
            } catch (error) {
                if (error.result) return error.result;
                throw error;
            }
        },
        async updateImage(id, expectedRevision, patch, updatedAt) {
            const old = await raw(id), next = await files.offload(patch || {}, id, old);
            let result;
            try {
                await journal.write(`image:${id}`, async () => {
                    const projected = applyGeneratedImageUpdate(await store.getImage(id), expectedRevision, next, updatedAt);
                    if (!projected.ok) throw Object.assign(new Error(projected.reason), { result: projected });
                    return projected.record;
                }, async () => { result = await store.updateImage(id, expectedRevision, next, updatedAt); return result; });
                await files.dropUnused(old, result.record);
                return { ...result, record: await files.hydrate(result.record, { fields: '*' }) };
            } catch (error) { await files.dropUnused(next, await store.getImage(id)); if (error.result) return error.result; throw error; }
            finally { await files.release(next); }
        },
        async putAsset(record) { return journal.write(`asset:${record.key}`, { ...record, recordKey: record.key }, () => store.putAsset(record)); },
        async putFloor(key, record) { return journal.write(`floor:${key}`, { ...record, recordKey: key }, () => store.putFloor(key, record)); },
        async getAssetsByChat(chatId) { await journal.restore(); return store.getAssetsByChat(chatId); },
        async getAssetsByFloor(key) { await journal.restore(); return store.getAssetsByFloor(key); },
        async getAsset(key, options) { await journal.restore(); return store.getAsset(key, options); },
        async queryAssets(options) { await journal.restore(); return store.queryAssets(options); },
        async getFloor(key) { await journal.restore(); return store.getFloor(key); },
        async deleteAsset(key) { return journal.write(`asset:${key}`, null, () => store.deleteAsset(key)); },
        async deleteFloor(key) { return journal.write(`floor:${key}`, null, () => store.deleteFloor(key)); },
        setReferenceResolver(resolve) { referenceRoot = resolve; },
        async auditImages() { await journal.restore(); return generatedImageAudit(store, globalObject, referenceRoot()); },
        flush: journal.flush,
        diagnostics: journal.diagnostics,
    };
    return wrapper;
}
