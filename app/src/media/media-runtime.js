import { localImageCacheFor, disposeLocalImageCache } from './tavern-image-cache.js';
import { disposeMapImageRepository } from './tavern-map-images.js';
import { mediaFileGcFor, remoteSettingsReferences } from './media-file-gc.js';
import { flushMediaJournals, stopMediaJournals, mediaJournalDiagnostics } from './media-record-journal.js';
import { storedImageReferences } from './image-references.js';
import { startMediaRequests, stopMediaRequests } from './tavern-media-http.js';

export function createMediaRuntime(globalObject, { generatedAssetStore } = {}) {
    startMediaRequests(globalObject);
    const cache = localImageCacheFor(globalObject), gc = mediaFileGcFor(globalObject);
    gc.start();
    const offReferences = gc.register(async () => [...storedImageReferences(globalObject).paths].map(dataUrl => ({ dataUrl })));
    const oldCache = globalObject.indexedDB?.deleteDatabase?.('igs-asset-thumbs');
    if (oldCache) oldCache.onerror = () => {};
    let destroying = null;
    // 本机配置之外再核对酒馆上的配置副本：本机存储被回滚或清掉时，仍在用的图不会被当成无用图。
    async function orphanImages() {
        const audit = await generatedAssetStore?.auditImages?.() || [];
        const remote = await remoteSettingsReferences(globalObject);
        return audit.filter(row => !row.referenced && !remote.ids.has(row.id) && !row.paths.some(path => remote.paths.has(path)));
    }
    return {
        cache,
        clearCache: options => cache.clear(options),
        async stats() { return { cache: await cache.stats(), lifecycle: await gc.diagnostics(), records: await mediaJournalDiagnostics(globalObject), origin: await Promise.resolve(globalObject.navigator?.storage?.estimate?.()).catch(() => null) || null }; },
        auditImages: () => generatedAssetStore?.auditImages?.() || Promise.resolve([]),
        auditFiles: paths => gc.audit(paths),
        orphanImages,
        async collectImages(ids) {
            const candidates = new Set((await orphanImages()).map(row => row.id));
            const removed = [];
            for (const id of ids || []) if (candidates.has(id)) {
                const result = await generatedAssetStore.deleteImage(id);
                if (result?.ok !== false && !result?.retained?.length) removed.push(id);
            }
            return { ok: true, removed, skipped: (ids || []).filter(id => !removed.includes(id)) };
        },
        flush: () => flushMediaJournals(globalObject),
        retryDeletes: () => gc.drain(),
        referencesChanged: () => gc.referencesChanged(),
        destroy() {
            if (destroying) return destroying;
            stopMediaRequests(globalObject);
            offReferences();
            const settled = Promise.allSettled([stopMediaJournals(globalObject), gc.stop()]).then(results => {
                const failed = results.find(result => result.status === 'rejected');
                if (failed) throw failed.reason;
            });
            disposeMapImageRepository(globalObject);
            destroying = disposeLocalImageCache(globalObject, { expectedCache: cache, settled });
            return destroying;
        },
    };
}
