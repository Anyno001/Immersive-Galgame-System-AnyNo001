import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';
import { createMemoryGeneratedAssetStore, createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { withTavernGeneratedAssetFiles } from '../src/media/tavern-generated-assets.js';
import { createLocalImageCache, localImageCacheFor } from '../src/media/tavern-image-cache.js';
import { stopMediaJournals } from '../src/media/media-record-journal.js';
import { mediaFileGcFor } from '../src/media/media-file-gc.js';
import { createMemoryAssetThumbStore } from '../src/media/asset-thumb-store.js';
import { renderCharacterAssetList } from '../src/visual/igs-ui/settings-fields.js';
import { fakeMediaServer, pixel, settleMedia } from './helpers/fake-media-server.js';

// fetchDelay：每张原图下载耗时；cacheTimeoutMs：把缓存里 30 秒的超时缩短，方便在测试里撞上排队。
async function fixture(t, ids, { fetchDelay = 0, cacheTimeoutMs = 0, failImages = 0 } = {}) {
    const server = fakeMediaServer(), writer = server.host();
    const saved = withTavernGeneratedAssetFiles(createMemoryGeneratedAssetStore(), writer);
    for (const id of ids) await saved.putImage({ id, type: 'sprite', dataUrl: pixel(id) });
    await saved.flush(); await stopMediaJournals(writer); await mediaFileGcFor(writer).stop();
    const host = server.host();
    if (cacheTimeoutMs) host.setTimeout = (fn, ms) => setTimeout(fn, ms >= 30000 ? cacheTimeoutMs : ms);
    const fetch = host.fetch;
    let failures = failImages;
    host.fetch = async (url, options) => {
        if (String(url).startsWith('/user/images/')) {
            if (fetchDelay) await new Promise(resolve => setTimeout(resolve, fetchDelay));
            // 5xx 会被 mediaRequest 自己重试；400 原样报读不到，才轮到缩略图这层处理。
            if (failures > 0) { failures -= 1; server.rejected = (server.rejected || 0) + 1; return { ok: false, status: 400 }; }
        }
        return fetch(url, options);
    };
    const cache = localImageCacheFor(host);
    const store = withTavernGeneratedAssetFiles(createIndexedDbGeneratedAssetStore(host), host);
    const notifications = [];
    const service = createAssetGenerationService({
        store, mediaCache: cache,
        messageHost: { getChatId: () => 'chat', on: () => () => {} },
        getSettings: () => ({ sceneAssets: { enabled: true } }),
        events: { emit: (_name, detail) => notifications.push(detail) },
        thumbStore: createMemoryAssetThumbStore({ mediaCache: cache }), makeThumb: async () => pixel('thumb'),
    });
    t.after(async () => { service.stop(); await stopMediaJournals(host); await mediaFileGcFor(host).stop(); await cache.destroy(); });
    return { server, cache, service, notifications };
}
const until = async (check, ms = 5000) => {
    const end = Date.now() + ms;
    while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
    return check();
};

test('gate:thumb-cache:display-images-never-push-out-thumbnails', async () => {
    const cache = createLocalImageCache({}, { maxCount: 3 });
    await cache.put('thumb:asset:a', 'data:image/webp;base64,TA');
    await cache.put('thumb:cg:b:1', 'data:image/webp;base64,TB');
    for (let i = 0; i < 8; i += 1) await cache.put(`asset:big${i}`, `data:image/png;base64,BIG${i}`);
    assert.ok(cache.peek('thumb:asset:a'), '显示图再多也不能把缩略图挤掉');
    assert.ok(cache.peek('thumb:cg:b:1'));
    assert.equal(cache.peek('asset:big0'), '', '显示图照旧按自己的名额淘汰');
    assert.ok(cache.peek('asset:big7'));
});

test('gate:thumb-cache:thumbnails-have-their-own-count', async () => {
    const cache = createLocalImageCache({}, { maxCount: 3, thumbCount: 2 });
    await cache.put('asset:shown', 'data:image/png;base64,SHOWN');
    for (let i = 0; i < 4; i += 1) await cache.put(`thumb:asset:t${i}`, `data:image/webp;base64,T${i}`);
    assert.ok(cache.peek('asset:shown'), '缩略图多了只淘汰缩略图');
    assert.equal(cache.peek('thumb:asset:t0'), '');
    assert.ok(cache.peek('thumb:asset:t3'));
});

test('gate:thumb-cache:disk-keeps-thumbnails-when-display-images-overflow', async () => {
    const host = fakeMediaServer().host();
    const cache = createLocalImageCache(host, { maxCount: 2 });
    await cache.put('thumb:asset:a', 'data:image/webp;base64,TA');
    for (let i = 0; i < 6; i += 1) await cache.put(`asset:big${i}`, `data:image/png;base64,BIG${i}`);
    const stats = await cache.stats();
    assert.equal(stats.thumbs.diskCount, 1, '磁盘上的缩略图不被显示图挤掉');
    assert.ok(stats.diskCount - stats.thumbs.diskCount <= 2);
    await cache.clear({ memoryOnly: true });
    assert.ok(await cache.get('thumb:asset:a'), '内存清掉后缩略图还能从磁盘读回');
    await cache.destroy();
});

test('gate:thumb-cache:wrapper-without-timer-waits-for-the-queued-download', async () => {
    const cache = createLocalImageCache({ setTimeout, clearTimeout, AbortController }, { maxCount: 50 });
    const slow = () => new Promise(resolve => setTimeout(() => resolve('data:image/png;base64,X'), 40));
    const jobs = Array.from({ length: 12 }, (_, i) => cache.load(`thumb:asset:w${i}`,
        () => cache.load(`file${i}.png`, slow, { download: true, timeoutMs: 60 }), { timeoutMs: 0 }));
    const values = await Promise.all(jobs);
    assert.ok(values.every(Boolean), '排队等下载的时间不算超时，12 张都要读回');
});

test('gate:thumb-cache:many-thumbnails-at-once-all-arrive-on-a-slow-server', async t => {
    const ids = Array.from({ length: 40 }, (_, i) => `s${i}`);
    const f = await fixture(t, ids, { fetchDelay: 20, cacheTimeoutMs: 100 });
    for (const id of ids) f.service.resolveThumbUrl(`igs-gen:${id}`);
    assert.ok(await until(() => ids.every(id => f.cache.peek(`thumb:asset:${id}`))), '40 张同时要、每张 20ms、4 路并发要 200ms，超过 100ms 的超时也不能丢');
    const loaded = new Set(f.notifications.filter(row => row.reason === 'image-loaded').map(row => row.imageId));
    assert.equal(loaded.size, ids.length, '每张读回都要通知设置页重画');
});

test('gate:thumb-cache:a-failed-thumbnail-retries-by-itself', async t => {
    const f = await fixture(t, ['hero'], { failImages: 1 });
    f.service.resolveThumbUrl('igs-gen:hero');
    assert.ok(await until(() => f.cache.peek('thumb:asset:hero'), 8000), '第一次读失败，隔几秒自己重读');
    assert.equal(f.server.rejected, 1, '确实失败过一次');
    assert.ok(f.notifications.some(row => row.imageId === 'hero' && row.reason === 'image-loaded'));
});

test('gate:thumb-cache:a-missing-file-is-reported-and-not-fetched-again', async t => {
    const f = await fixture(t, ['gone']);
    for (const path of [...f.server.images.keys()]) f.server.images.delete(path);
    f.service.resolveThumbUrl('igs-gen:gone');
    assert.ok(await until(() => f.notifications.some(row => row.imageId === 'gone' && row.reason === 'image-lost')), '文件没了要发 image-lost，设置页随之重画');
    const downloads = f.server.downloads.length;
    f.service.resolveThumbUrl('igs-gen:gone');
    await settleMedia(); await settleMedia();
    assert.equal(f.server.downloads.length, downloads, '确定缺图后重画不再反复下载');
});

test('gate:thumb-cache:collapsed-characters-do-not-request-sprite-thumbnails', () => {
    const asked = [];
    const resolveUrl = url => { asked.push(url); return ''; };
    const characters = { 甲: { 默认: 'igs-gen:a0', 喜悦: 'igs-gen:a1' }, 乙: { 默认: 'igs-gen:b0', 害羞: 'igs-gen:b1' } };
    const characterOutfits = { 甲: { 校服: { moods: { 平和: 'igs-gen:a2', 愤怒: 'igs-gen:a3' } } } };
    const sceneAssets = { characters, characterOutfits };
    renderCharacterAssetList(characters, { resolveUrl, characterOutfits, sceneAssets, isOpen: () => false });
    assert.deepEqual(asked.filter(url => /igs-gen:[ab]\d/.test(url)), [], '折叠着的角色一张差分都不读');
    renderCharacterAssetList(characters, { resolveUrl, characterOutfits, sceneAssets, isOpen: key => key === 'char-open:甲' });
    assert.ok(asked.some(url => /igs-gen:a\d/.test(url)), '展开的角色照常读');
    assert.ok(!asked.some(url => /igs-gen:b\d/.test(url)), '没展开的照旧不读');
});
