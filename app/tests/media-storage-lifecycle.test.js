import { createAssetGenerationService, createAutoIllustrationService } from './helpers/media-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createMemoryPhotoAlbumStore } from '../src/media/photo-album.js';
import { withTavernGeneratedAssetFiles } from '../src/media/tavern-generated-assets.js';
import { withTavernIllustrationFiles } from '../src/media/tavern-illustrations.js';
import { withTavernPhotoFiles } from '../src/media/tavern-photos.js';


import { createLocalImageCache, localImageCacheFor } from '../src/media/tavern-image-cache.js';
import { mediaFileGcFor } from '../src/media/media-file-gc.js';
import { fakeMediaServer, pixel, settleMedia } from './helpers/fake-media-server.js';

const assetService = (store, mediaCache) => createAssetGenerationService({ store, mediaCache, messageHost: { getChatId: () => '' }, getSettings: () => ({}) });

test('图片缓存兼容已存在的 v4：直接续读续写，图片和共享别名保留', { timeout: 3000 }, async () => {
    const { createFakeIndexedDB } = await import('./helpers/fake-idb.js');
    const { createIdbImageCacheStore } = await import('../src/media/image-cache-store.js');
    const { createIdbConnection } = await import('../src/media/idb-connection.js');
    const indexedDB = createFakeIndexedDB();
    const initial = createIdbImageCacheStore(indexedDB);
    await initial.put('/old.png', pixel('old'), 1, 12, 'same-pixels');
    await initial.put('/alias.png', pixel('old'), 2, 12, 'same-pixels');
    await initial.close();
    const upgraded = createIdbConnection(indexedDB, 'igs-image-cache', 4);
    await upgraded.open(); await upgraded.close();
    const opened = [], open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => { opened.push(args); return open(...args); };
    const current = createIdbImageCacheStore(indexedDB);
    assert.equal(await current.get('/old.png'), pixel('old'));
    assert.deepEqual(opened, [['igs-image-cache', 3], ['igs-image-cache']]);
    assert.equal(await current.get('/alias.png'), pixel('old'));
    await current.put('/new.webp', pixel('webp'), 3, 8, 'new-pixels', true);
    assert.equal(await current.get('/new.webp'), pixel('webp'));
    assert.equal((await current.allMeta()).length, 3);
    const existing = indexedDB.databases.get('igs-image-cache');
    assert.equal(existing.version, 4);
    assert.equal(existing.stores.get('files').rows.size, 2);
    await current.close();
});

test('图片缓存新建仍使用 v3，兼容重开仅适用于相同表结构', { timeout: 3000 }, async () => {
    const { createFakeIndexedDB } = await import('./helpers/fake-idb.js');
    const { createIdbImageCacheStore } = await import('../src/media/image-cache-store.js');
    const { createIdbConnection } = await import('../src/media/idb-connection.js');
    const fresh = createFakeIndexedDB(), current = createIdbImageCacheStore(fresh);
    await current.put('/normal.png', pixel('normal'), 1, 12);
    assert.equal(fresh.databases.get('igs-image-cache').version, 3);
    await current.close();
    const different = createFakeIndexedDB();
    const newer = createIdbConnection(different, 'igs-image-cache', 4, db => {
        db.createObjectStore('files', { keyPath: 'other' });
        db.createObjectStore('meta', { keyPath: 'path' });
    });
    await newer.open(); await newer.close();
    const incompatible = createIdbImageCacheStore(different);
    await assert.rejects(incompatible.get('/normal.png'), { name: 'VersionError' });
    assert.equal(different.databases.get('igs-image-cache').version, 4);
    await incompatible.close();
});
