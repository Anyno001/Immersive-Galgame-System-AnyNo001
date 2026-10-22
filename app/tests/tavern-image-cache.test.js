import { createCgLibrary } from './helpers/media-fixtures.js';
import { createFakeIndexedDB } from './helpers/fake-idb.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalImageCache, localImageCacheFor, normalizeImageCacheCount, DEFAULT_IMAGE_CACHE_COUNT } from '../src/media/tavern-image-cache.js';
import { withTavernIllustrationFiles } from '../src/media/tavern-illustrations.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createMemoryImageCacheStore } from '../src/media/image-cache-store.js';


test('gate:image-cache:drops-the-oldest-when-over-the-count', async () => {
    let clock = 0;
    const cache = createLocalImageCache({}, { maxCount: 3, now: () => { clock += 1; return clock; } });
    await cache.put('a.png', 'data:image/png;base64,A');
    await cache.put('b.png', 'data:image/png;base64,B');
    await cache.put('older.png', 'data:image/png;base64,OLD');
    await cache.get('a.png');
    await cache.put('c.png', 'data:image/png;base64,C');
    assert.equal(await cache.get('b.png'), '');
    assert.equal(await cache.get('older.png'), '');
    assert.equal(await cache.get('a.png'), 'data:image/png;base64,A');
    assert.equal(await cache.get('c.png'), 'data:image/png;base64,C');
});

test('gate:image-cache:a-stalled-download-is-aborted-instead-of-waiting-forever', async () => {
    const realSetTimeout = setTimeout;
    let aborted = false;
    const globalObject = {
        setTimeout: (fn, ms) => realSetTimeout(fn, ms >= 30000 ? 5 : ms),
        clearTimeout,
        AbortController,
        fetch(_url, options = {}) {
            return new Promise((_, reject) => {
                options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
            });
        },
        FileReader: class {},
    };
    const store = createMemoryIllustrationStore();
    await store.putSlot('chat|1|0', { slot: 1, status: 'done', dataUrl: 'user/images/igs-cg/stuck.png' });
    const files = withTavernIllustrationFiles(store, globalObject);
    const out = await files.hydrateSlot({ dataUrl: 'user/images/igs-cg/stuck.png' });
    assert.equal(aborted, true);
    assert.equal(out.dataUrl, '');
});
