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

test('gate:media:queued-downloads-only-time-their-own-read', async () => {
    const timers = new Map();
    let next = 0;
    const host = { Blob, atob, btoa,
        setTimeout: (fn) => { next += 1; timers.set(next, fn); return next; },
        clearTimeout: (id) => { timers.delete(id); } };
    const cache = createLocalImageCache(host);
    const running = [];
    const slow = () => new Promise((resolve) => running.push(resolve));
    const busy = ['a', 'b', 'c', 'd'].map((key) => cache.load(key, slow, { persist: false, download: true }));
    const queued = cache.load('e', async () => pixel('e'), { persist: false, download: true });
    await settleMedia();
    assert.equal(running.length, 4, '四个名额占满');
    assert.equal(timers.size, 4, '排队的那张不计时');
    running[0](pixel('a'));
    assert.equal(await queued, pixel('e'), '轮到它才开始下，不会排队排到超时');
    for (const fn of [...timers.values()]) fn();
    await Promise.allSettled(busy);
});
