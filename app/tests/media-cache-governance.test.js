import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalImageCache, localImageCacheFor, disposeLocalImageCache, bindImageCacheDocument } from '../src/media/tavern-image-cache.js';
import { createMemoryImageCacheStore } from '../src/media/image-cache-store.js';
import { createMessageImageCache } from '../src/media/message-image-cache.js';
import { createTavernImageFiles } from '../src/media/tavern-image-files.js';
import { createItemRecordCache } from '../src/generated-images/illustration/item-image-cache.js';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';
import { createMapBasemapGenerator } from '../src/visual/map-gen/index.js';
import { createCgLibraryView } from '../src/visual/igs-ui/cg-library-view.js';
import { peekSpriteHead, probeSpriteHead } from '../src/visual/igs-ui/fx-anchor.js';
import { describeMediaUsage } from '../src/storage/storage-usage.js';
import { createMediaCacheRegistry } from '../src/media/media-cache-registry.js';
import { pixel, settleMedia } from './helpers/fake-media-server.js';

const urls = () => {
    let next = 0;
    const revoked = [];
    return { Blob, atob, btoa, revoked, URL: { createObjectURL: () => `blob:test-${++next}`, revokeObjectURL: url => revoked.push(url) } };
};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('a blocked IndexedDB reports unavailable without allocating fallback image storage', async () => {
    const cache = createLocalImageCache({ indexedDB: { open() { throw new Error('blocked-storage'); } } });
    assert.equal(await cache.load('a', async () => pixel('live')), pixel('live'));
    const stats = await cache.stats();
    assert.equal(stats.backend, 'unavailable'); assert.equal(stats.persistent, false); assert.equal(stats.diskBudget, 0);
    assert.match(stats.lastError, /blocked-storage/);
    await cache.clear({ memoryOnly: true }); assert.equal(cache.peek('a'), '');
    await cache.destroy();
});

test('clearing a directory cancels its pending query; an old failure cannot remove the new query', async () => {
    const requests = [];
    const host = { SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({}) }) },
        fetch: (_url, options) => { const job = deferred(); requests.push({ ...job, signal: options.signal }); return job.promise; } };
    const cache = localImageCacheFor(host), files = createTavernImageFiles(host, 'legacy');
    const old = files.listFiles().catch(error => error); await settleMedia();
    await cache.clear(); assert.equal(requests[0].signal.aborted, true);
    const fresh = files.listFiles(); await settleMedia();
    requests[1].resolve({ ok: true, json: async () => ['fresh.png'] }); assert.deepEqual(await fresh, ['fresh.png']);
    requests[0].resolve({ ok: true, json: async () => ['old.png'] }); assert.match((await old).message, /aborted/);
    assert.deepEqual(await files.listFiles(), ['fresh.png']); assert.equal(requests.length, 2);
    const next = createTavernImageFiles(host, 'other').listFiles().catch(error => error); await settleMedia();
    await disposeLocalImageCache(host); assert.equal(requests[2].signal.aborted, true); assert.match((await next).message, /aborted/);
    assert.equal((await cache.stats()).auxiliary.count, 0);
});
