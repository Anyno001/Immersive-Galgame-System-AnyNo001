import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';
import { createMemoryGeneratedAssetStore, createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { withTavernGeneratedAssetFiles } from '../src/media/tavern-generated-assets.js';
import { localImageCacheFor } from '../src/media/tavern-image-cache.js';
import { stopMediaJournals } from '../src/media/media-record-journal.js';
import { mediaFileGcFor } from '../src/media/media-file-gc.js';
import { createMemoryAssetThumbStore } from '../src/media/asset-thumb-store.js';
import { fakeMediaServer, pixel, settleMedia } from './helpers/fake-media-server.js';

async function fixture(t, { reuseLocal = false, thumbs = false } = {}) {
    const server = fakeMediaServer(), writer = server.host();
    const saved = withTavernGeneratedAssetFiles(createMemoryGeneratedAssetStore(), writer);
    await saved.putImage({ id: 'hero', type: 'sprite', dataUrl: pixel('hero') });
    await saved.putImage({ id: 'room', type: 'background', dataUrl: pixel('room') });
    await saved.flush(); await stopMediaJournals(writer); await mediaFileGcFor(writer).stop();
    const host = server.host(reuseLocal ? writer.indexedDB : undefined), cache = localImageCacheFor(host);
    const store = withTavernGeneratedAssetFiles(createIndexedDbGeneratedAssetStore(host), host);
    const notifications = [];
    const service = createAssetGenerationService({
        store, mediaCache: cache,
        messageHost: { getChatId: () => 'chat', on: () => () => {} },
        getSettings: () => ({ sceneAssets: { enabled: true } }),
        events: { emit: (_name, detail) => notifications.push(detail) },
        ...(thumbs ? { thumbStore: createMemoryAssetThumbStore({ mediaCache: cache }), makeThumb: async () => pixel('thumb') } : {}),
    });
    t.after(async () => { service.stop(); await stopMediaJournals(host); await mediaFileGcFor(host).stop(); await cache.destroy(); });
    return { server, host, cache, store, service, notifications };
}

test('gate:assets:cold-first-read-restores-backup-before-starting-the-image-cache-task', async t => {
    const f = await fixture(t);
    assert.equal(f.service.resolveUrl('igs-gen:hero'), '');
    await settleMedia(); await settleMedia();
    assert.ok(f.notifications.some(row => row.imageId === 'hero' && row.reason === 'image-loaded'), '首楼必须收到图片完成通知，不依赖设置器触发第二次读取');
    assert.ok(f.cache.peek('asset:hero'), '备份恢复不能取消首楼的缓存任务');
    assert.equal(f.notifications.some(row => row.reason === 'image-lost'), false);
});

test('gate:assets:concurrent-first-background-and-sprite-load-without-opening-settings', async t => {
    const f = await fixture(t), uploads = f.server.uploads.length;
    let metadataReads = 0;
    const fetch = f.host.fetch;
    f.host.fetch = (url, options) => { if (String(url).startsWith('/user/files/igs-asset-records.json')) metadataReads += 1; return fetch(url, options); };
    f.service.resolveUrl('igs-gen:hero'); f.service.resolveUrl('igs-gen:room');
    await settleMedia(); await settleMedia();
    assert.deepEqual(new Set(f.notifications.filter(row => row.reason === 'image-loaded').map(row => row.imageId)), new Set(['hero', 'room']));
    assert.ok(f.cache.peek('asset:hero')); assert.ok(f.cache.peek('asset:room'));
    assert.equal(f.server.uploads.length, uploads, '显示已有素材不重写备份');
    assert.equal(metadataReads, 1, '并发素材共享一次记录恢复');
});
