import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalImageCache } from '../src/media/tavern-image-cache.js';
import { mediaRequest } from '../src/media/tavern-media-http.js';
import { createFakeIndexedDB } from './helpers/fake-idb.js';
import { pixel, settleMedia } from './helpers/fake-media-server.js';

test('gate:media:clear-during-file-reader-rejects-old-memory-hits-and-cancels-load-immediately', async () => {
    const readers = [];
    const host = { Blob, atob, btoa, FileReader: class {
        readAsDataURL() { readers.push(this); }
    } };
    const cache = createLocalImageCache(host);
    cache.remember('one', pixel('old'));
    const get = cache.get('one'), load = cache.load('one', () => assert.fail('memory-hit-must-not-download'));
    await cache.clear();
    assert.equal(await load, '');
    for (const reader of readers) { reader.result = pixel('old'); reader.onload?.(); }
    assert.equal(await get, ''); assert.equal(cache.peek('one'), '');
    assert.equal((await cache.stats()).diskCount, 0);
});
