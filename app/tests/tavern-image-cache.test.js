import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalImageCache } from '../src/media/tavern-image-cache.js';
import { withTavernIllustrationFiles } from '../src/media/tavern-image-files.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createCgGalleryService } from '../src/media/cg-gallery-service.js';

function createFakeIndexedDB() {
    const databases = new Map();
    return {
        open(name, version) {
            const req = {};
            queueMicrotask(() => {
                let record = databases.get(name);
                if (!record) {
                    record = { stores: new Map(), version: 0 };
                    databases.set(name, record);
                }
                const db = {
                    objectStoreNames: { contains: (storeName) => record.stores.has(storeName) },
                    createObjectStore(storeName) {
                        record.stores.set(storeName, new Map());
                        return {};
                    },
                    transaction(storeName) {
                        const data = record.stores.get(storeName);
                        const request = {};
                        const store = {
                            get: (key) => { request.result = data.get(key); return request; },
                            getAll: () => { request.result = Array.from(data.values()); return request; },
                            put: (value) => { data.set(value.path, value); return request; },
                            delete: (key) => { data.delete(key); return request; },
                        };
                        const tx = { objectStore: () => store };
                        queueMicrotask(() => { if (typeof tx.oncomplete === 'function') tx.oncomplete(); });
                        return tx;
                    },
                };
                req.result = db;
                if (record.version < version && typeof req.onupgradeneeded === 'function') {
                    req.onupgradeneeded();
                    record.version = version;
                }
                if (typeof req.onsuccess === 'function') req.onsuccess();
            });
            return req;
        },
    };
}

test('gate:image-cache:second-read-uses-local-copy-and-drop-fetches-again', async () => {
    const indexedDB = createFakeIndexedDB();
    const first = createLocalImageCache({ indexedDB }, { maxCount: 4 });
    await first.put('/user/images/igs-cg/a.png', 'data:image/png;base64,AAA');
    const second = createLocalImageCache({ indexedDB }, { maxCount: 4 });
    assert.equal(await second.get('user/images/igs-cg/a.png'), 'data:image/png;base64,AAA');
    await second.drop('user/images/igs-cg/a.png');
    const third = createLocalImageCache({ indexedDB }, { maxCount: 4 });
    assert.equal(await third.get('user/images/igs-cg/a.png'), '');
});

test('gate:image-cache:drops-the-oldest-when-over-the-count', async () => {
    let clock = 0;
    const cache = createLocalImageCache({}, { maxCount: 2, now: () => { clock += 1; return clock; } });
    await cache.put('a.png', 'data:image/png;base64,A');
    await cache.put('b.png', 'data:image/png;base64,B');
    await cache.get('a.png');
    await cache.put('c.png', 'data:image/png;base64,C');
    assert.equal(await cache.get('b.png'), '');
    assert.equal(await cache.get('a.png'), 'data:image/png;base64,A');
    assert.equal(await cache.get('c.png'), 'data:image/png;base64,C');
});

test('gate:image-cache:illustration-hydrate-downloads-a-path-once', async () => {
    let downloads = 0;
    const globalObject = {
        setTimeout,
        indexedDB: createFakeIndexedDB(),
        fetch(_url, options = {}) {
            if (options.method === 'POST') return Promise.resolve(null);
            downloads += 1;
            return Promise.resolve({
                ok: true,
                blob: async () => new Blob(['cg-bytes']),
            });
        },
        FileReader: class {
            readAsDataURL(blob) {
                blob.text().then((text) => {
                    this.result = `data:image/png;base64,${Buffer.from(text).toString('base64')}`;
                    if (typeof this.onload === 'function') this.onload();
                }).catch(() => { if (typeof this.onerror === 'function') this.onerror(); });
            }
        },
    };
    const path = 'user/images/igs-cg/floor@cg@dataUrl@abc.png';
    const store = createMemoryIllustrationStore();
    await store.putSlot('chat|1|0', { slot: 1, status: 'done', dataUrl: path });
    const files = withTavernIllustrationFiles(store, globalObject);
    const first = await files.getSlots('chat|1|0');
    const second = await files.getSlots('chat|1|0');
    assert.equal(downloads, 1);
    assert.equal(first[0].dataUrl, second[0].dataUrl);
    assert.match(first[0].dataUrl, /^data:image\/png;base64,/);

    await files.deleteSlot('chat|1|0', 1);
    await store.putSlot('chat|1|0', { slot: 1, status: 'done', dataUrl: path });
    await files.getSlots('chat|1|0');
    assert.equal(downloads, 2);
});

test('gate:image-cache:cg-library-shows-a-ready-image-before-the-slow-one', async () => {
    let releaseSlow;
    const slowGate = new Promise((resolve) => { releaseSlow = resolve; });
    const globalObject = {
        setTimeout,
        fetch(url) {
            const pending = String(url).includes('slow') ? slowGate : Promise.resolve();
            return pending.then(() => ({ ok: true, blob: async () => new Blob([String(url)]) }));
        },
        FileReader: class {
            readAsDataURL(blob) {
                blob.text().then((text) => {
                    this.result = `data:image/png;base64,${Buffer.from(text).toString('base64')}`;
                    if (typeof this.onload === 'function') this.onload();
                }).catch(() => { if (typeof this.onerror === 'function') this.onerror(); });
            }
        },
    };
    const store = createMemoryIllustrationStore();
    await store.putSlot('chat|1|0', { slot: 1, status: 'done', dataUrl: 'user/images/igs-cg/fast.png' });
    await store.putSlot('chat|2|0', { slot: 1, status: 'done', dataUrl: 'user/images/igs-cg/slow.png' });
    const service = createCgGalleryService({
        illustrationStore: withTavernIllustrationFiles(store, globalObject),
        clearIllustration: async () => ({ ok: true }),
    });
    const page = await service.loadPage({ limit: 24, showHidden: true, deferImages: true });
    assert.equal(page.items.length, 2);
    assert.match(page.items[0].dataUrl, /fast\.png$/);
    const jobs = page.items.map((entry) => service.hydrateEntry(entry));
    const fast = await jobs[0];
    assert.match(fast.dataUrl, /^data:image\/png;base64,/);
    let slowDone = false;
    jobs[1].then(() => { slowDone = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(slowDone, false);
    releaseSlow();
    const slow = await jobs[1];
    assert.match(slow.dataUrl, /^data:image\/png;base64,/);
});

test('gate:image-cache:clear-drops-every-cached-image', async () => {
    const cache = createLocalImageCache({});
    await cache.put('user/images/igs-cg/a.png', 'data:image/png;base64,AAA');
    await cache.clear();
    assert.equal(await cache.get('user/images/igs-cg/a.png'), '');
});
