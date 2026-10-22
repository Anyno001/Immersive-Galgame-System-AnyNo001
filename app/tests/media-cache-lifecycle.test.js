import { createMessageImageCache } from './helpers/media-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalImageCache } from '../src/media/tavern-image-cache.js';
import { createFakeIndexedDB } from './helpers/fake-idb.js';
import { pixel } from './helpers/fake-media-server.js';

import { createImageResourceCache } from '../src/media/resource-cache.js';

test('gate:media:cache-clear-cancels-old-flights-and-prevents-disk-refill', async () => {
    const cache = createLocalImageCache({});
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let calls = 0;
    const first = cache.load('image', () => { calls += 1; return gate; });
    const second = cache.load('image', () => { calls += 1; return gate; });
    await new Promise(resolve => setTimeout(resolve, 0));
    await cache.clear(); release(pixel('old'));
    assert.deepEqual(await Promise.all([first, second]), ['', '']);
    assert.equal(calls, 1); assert.equal(await cache.get('image'), '');
    assert.equal(await cache.load('image', async () => pixel('new')), pixel('new'));
});
