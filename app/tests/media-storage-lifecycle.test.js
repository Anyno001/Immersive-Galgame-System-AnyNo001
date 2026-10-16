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

test('gate:media:failed-pixel-read-cannot-erase-images-when-saving-a-prompt', async () => {
    const server = fakeMediaServer(), host = server.host(), raw = createMemoryGeneratedAssetStore();
    const store = withTavernGeneratedAssetFiles(raw, host), service = assetService(store, localImageCacheFor(host));
    await store.putImage({ id: 'sprite', type: 'sprite', revision: 1, dataUrl: pixel('transparent'), originalDataUrl: pixel('original'), alphaMaskDataUrl: pixel('mask') });
    const before = await raw.getImage('sprite');
    await localImageCacheFor(host).clear(); server.images.clear();
    assert.equal((await store.getImage('sprite')).dataUrl, '');
    assert.equal((await service.saveImagePrompt('sprite', { positive: 'new tags', negative: '' })).ok, true);
    const after = await raw.getImage('sprite');
    for (const field of ['dataUrl', 'originalDataUrl', 'alphaMaskDataUrl']) assert.equal(after[field], before[field]);
    assert.equal(after.prompt.positive, 'new tags'); assert.deepEqual(server.deletions, []);
});

test('gate:media:metadata-queries-do-not-read-original-working-or-mask-pixels', async () => {
    const server = fakeMediaServer(), host = server.host(), raw = createMemoryGeneratedAssetStore();
    const store = withTavernGeneratedAssetFiles(raw, host), service = assetService(store, localImageCacheFor(host));
    await store.putImage({ id: 'sprite', type: 'sprite', revision: 1, dataUrl: pixel('a'), originalDataUrl: pixel('b'), workingDataUrl: pixel('c'), alphaMaskDataUrl: pixel('d'), prompt: { positive: 'tags', negative: '' } });
    await localImageCacheFor(host).clear();
    assert.equal((await service.getImagePrompt('sprite')).positive, 'tags');
    await service.saveImagePrompt('sprite', { positive: 'edited', negative: '' });
    assert.equal(server.downloads.length, 0);
    await store.getImage('sprite'); assert.equal(server.downloads.length, 1);
    await service.getEditableImage('sprite'); assert.equal(server.downloads.length, 4);
});

test('gate:media:cg-reroll-keeps-the-old-file-during-generation-and-after-failure', async () => {
    const server = fakeMediaServer(), host = server.host(), raw = createMemoryIllustrationStore();
    const store = withTavernIllustrationFiles(raw, host), key = '聊天|1|0';
    await store.putSlot(key, { slot: 1, status: 'done', caption: { kept: true }, dataUrl: pixel('old') });
    const old = await raw.getSlotRecord(`${key}|1`);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const service = createAutoIllustrationService({ store, mediaCache: localImageCacheFor(host), getSettings: () => ({ nsfwEnabled: true }),
        nai: { describe: () => ({ via: 'dbgen', ready: { ok: true } }), generateDbgenCaption: () => gate },
        messageHost: { getChatId: () => '聊天', readFloor: () => ({ chatId: '聊天', messageId: 1, swipeId: 0, isAi: true, text: '[igs-img:1]' }) }, events: { emit() {} } });
    const job = service.rerollSlot({ chatId: '聊天', messageId: 1, swipeId: 0, slot: 1 });
    await settleMedia(); assert.equal((await raw.getSlotRecord(`${key}|1`)).dataUrl, old.dataUrl);
    release({ ok: false, error: 'provider-failed' });
    assert.equal((await job).ok, false);
    assert.equal((await raw.getSlotRecord(`${key}|1`)).dataUrl, old.dataUrl);
    assert.equal(server.images.has(old.dataUrl), true); assert.equal(server.deletions.length, 0);
});

test('gate:media:cg-returns-after-eviction-even-after-reading-more-than-forty-images', async () => {
    const store = createMemoryIllustrationStore(), cache = createLocalImageCache({}, { maxCount: 2 });
    for (let i = 0; i < 50; i += 1) await store.putSlot(`chat|${i}|0`, { slot: 1, status: 'done', dataUrl: pixel(i) });
    const service = createAutoIllustrationService({ store, mediaCache: cache, messageHost: { getChatId: () => 'chat', readFloor: () => ({ chatId: 'chat', swipeId: 0 }) }, events: { emit() {} } });
    for (let i = 0; i < 50; i += 1) { service.getIllustrationUrl({ messageId: i, slot: 1 }); await settleMedia(); }
    assert.equal(service.getIllustrationUrl({ messageId: 0, slot: 1 }), '');
    await settleMedia(); assert.equal(service.getIllustrationUrl({ messageId: 0, slot: 1 }), pixel(0));
    assert.ok((await cache.stats()).memoryCount <= 2);
});

test('gate:media:shared-files-are-kept-until-the-last-cg-photo-reference-is-released', async () => {
    const server = fakeMediaServer(), host = server.host();
    const rawCg = createMemoryIllustrationStore(), rawPhotos = createMemoryPhotoAlbumStore();
    const cg = withTavernIllustrationFiles(rawCg, host), photos = withTavernPhotoFiles(rawPhotos, host);
    await cg.putSlot('chat|1|0', { slot: 1, status: 'done', dataUrl: pixel('shared') });
    await photos.put({ id: 'p', dataUrl: pixel('shared'), createdAt: '2026-10-12' });
    assert.equal(server.images.size, 1);
    await cg.deleteSlot('chat|1|0', 1); await mediaFileGcFor(host).drain();
    assert.equal(server.images.size, 1); assert.equal(server.deletions.length, 0);
    await photos.remove('p'); await mediaFileGcFor(host).drain();
    assert.equal(server.images.size, 0); assert.equal(server.deletions.length, 1);
});

test('gate:media:failed-file-deletion-stays-in-the-durable-queue-and-retries', async () => {
    const server = fakeMediaServer(), host = server.host();
    const store = withTavernIllustrationFiles(createMemoryIllustrationStore(), host);
    await store.putSlot('chat|1|0', { slot: 1, status: 'done', dataUrl: pixel('old') });
    await store.deleteSlot('chat|1|0', 1); server.failDelete = true;
    await assert.rejects(mediaFileGcFor(host).drain(), /delete-failed/);
    assert.equal((await mediaFileGcFor(host).diagnostics()).pendingDeletes, 1);
    const freshHost = server.host(host.indexedDB);
    withTavernIllustrationFiles(createMemoryIllustrationStore(), freshHost);
    server.failDelete = false;
    assert.equal((await mediaFileGcFor(freshHost).drain()).pending, 0);
    assert.equal(server.images.size, 0);
});

test('gate:media:deletion-tombstones-defeat-a-stale-backup-and-old-filename-recovery', async () => {
    const server = fakeMediaServer(), host = server.host();
    const store = withTavernIllustrationFiles(createMemoryIllustrationStore(), host);
    await store.putSlot('chat|1|0', { slot: 16, status: 'done', dataUrl: pixel('old') }); await store.flush();
    const stale = structuredClone(server.files.get('igs-cg-records.json'));
    await store.deleteSlot('chat|1|0', 16); server.files.set('igs-cg-records.json', stale);
    server.images.set('user/images/igs-cg/chat_1_0_16@@dataUrl@abc.png', pixel('old'));
    const fresh = withTavernIllustrationFiles(createMemoryIllustrationStore(), server.host(host.indexedDB));
    assert.deepEqual(await fresh.getSlots('chat|1|0'), []);
    await fresh.flush();
    const emptyBrowser = withTavernIllustrationFiles(createMemoryIllustrationStore(), server.host());
    assert.deepEqual(await emptyBrowser.getSlots('chat|1|0'), []);
});

test('gate:media:photo-metadata-and-unicode-chat-slot-sixteen-survive-browser-data-loss', async () => {
    const server = fakeMediaServer(), host = server.host();
    const photos = withTavernPhotoFiles(createMemoryPhotoAlbumStore(), host), cg = withTavernIllustrationFiles(createMemoryIllustrationStore(), host);
    await photos.put({ id: 'p', chatId: '角色|长聊天', messageId: 3, caption: '纪念', favorite: true, hidden: true, dataUrl: pixel('photo'), createdAt: '2026-10-12' });
    const key = `${'角色'.repeat(100)}|3|2`;
    await cg.putSlot(key, { slot: 16, status: 'done', dataUrl: pixel('cg') }); await photos.flush(); await cg.flush();
    const fresh = server.host();
    const restoredPhotos = withTavernPhotoFiles(createMemoryPhotoAlbumStore(), fresh), restoredCg = withTavernIllustrationFiles(createMemoryIllustrationStore(), fresh);
    const photo = await restoredPhotos.get('p');
    assert.equal(photo.caption, '纪念'); assert.equal(photo.favorite, true); assert.equal(photo.hidden, true);
    assert.equal(photo.chatId, '角色|长聊天'); assert.equal((await restoredCg.getSlots(key))[0].slot, 16);
});
