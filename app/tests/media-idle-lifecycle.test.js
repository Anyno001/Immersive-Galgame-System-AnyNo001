import test from 'node:test';
import assert from 'node:assert/strict';
import { withTavernIllustrationFiles } from '../src/media/tavern-illustrations.js';
import { withTavernPhotoFiles } from '../src/media/tavern-photos.js';
import { withTavernGeneratedAssetFiles } from '../src/media/tavern-generated-assets.js';
import { mapImageRepositoryFor } from '../src/media/tavern-map-images.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createMemoryPhotoAlbumStore } from '../src/media/photo-album.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { flushMediaJournals, stopMediaJournals } from '../src/media/media-record-journal.js';
import { mediaFileGcFor } from '../src/media/media-file-gc.js';
import { createTavernSettingsSync } from '../src/storage/tavern-settings-file.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { fakeMediaServer, pixel, settleMedia } from './helpers/fake-media-server.js';

function fixture(t, server = fakeMediaServer(), indexedDB) {
    const host = server.host(indexedDB), timers = new Map(), requests = [];
    let now = 0, nextId = 0;
    host.navigator = { locks: { request: (_name, callback) => callback() } };
    host.setTimeout = (callback, delay) => {
        const handle = { id: ++nextId, unref() {} };
        timers.set(handle, { callback, at: now + delay });
        return handle;
    };
    host.clearTimeout = handle => timers.delete(handle);
    const fetch = host.fetch;
    host.fetch = (url, options) => { requests.push(url); return fetch(url, options); };
    const gc = mediaFileGcFor(host);
    t.after(async () => { await stopMediaJournals(host); await gc.stop(); });
    return { server, host, gc, timers, requests, async advance(ms) {
        const target = now + ms;
        for (let count = 0; count < 100; count += 1) {
            const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) { now = target; return; }
            now = next[1].at; timers.delete(next[0]); next[1].callback();
            await settleMedia();
        }
        assert.fail('background work did not become idle');
    } };
}

function repositories(host) {
    return {
        cg: withTavernIllustrationFiles(createMemoryIllustrationStore(), host),
        photos: withTavernPhotoFiles(createMemoryPhotoAlbumStore(), host),
        assets: withTavernGeneratedAssetFiles(createMemoryGeneratedAssetStore(), host),
        maps: mapImageRepositoryFor(host),
    };
}
const floor = 'chat|1|0', key = `${floor}|1`;

test('gate:media:empty-repositories-never-create-four-backups-or-an-idle-gc-timer', async t => {
    const f = fixture(t); repositories(f.host);
    assert.equal((await flushMediaJournals(f.host)).ok, true);
    f.gc.start(); await settleMedia();
    const requests = f.requests.length;
    await f.advance(600000);
    assert.deepEqual(f.server.uploads, []);
    assert.equal(f.requests.length, requests);
    assert.equal(f.timers.size, 0);
});

test('gate:media:stable-floor-only-uploads-the-changed-backup-once', async t => {
    const f = fixture(t), { cg } = repositories(f.host);
    await cg.putSlot(floor, { slot: 1, status: 'done', dataUrl: pixel('cg') });
    await flushMediaJournals(f.host);
    const saved = structuredClone(f.server.files.get('igs-cg-records.json'));
    await flushMediaJournals(f.host); await flushMediaJournals(f.host);
    const requests = f.requests.length;
    await f.advance(600000);
    assert.deepEqual(f.server.uploads, ['igs-cg-records.json']);
    assert.deepEqual(f.server.files.get('igs-cg-records.json'), saved);
    assert.equal(f.requests.length, requests);
    assert.equal(f.timers.size, 0);
});

test('gate:media:writing-equal-metadata-with-different-property-order-does-not-dirty-backup', async t => {
    const f = fixture(t), { assets } = repositories(f.host);
    await assets.putImage({ id: 'stable', dataUrl: 'user/images/igs-media/stable.png', prompt: { positive: 'a', negative: 'b' } });
    await assets.flush();
    const saved = structuredClone(f.server.files.get('igs-asset-records.json'));
    await assets.patchImageMetadata('stable', { prompt: { negative: 'b', positive: 'a' } });
    await assets.flush();
    assert.equal((await assets.diagnostics()).dirty, 0);
    assert.deepEqual(f.server.files.get('igs-asset-records.json'), saved);
    assert.deepEqual(f.server.uploads, ['igs-asset-records.json']);
    assert.equal(f.timers.size, 0);
});

test('gate:media:shared-picture-parks-without-polling-and-last-reference-removal-reclaims-it', async t => {
    const f = fixture(t), { cg, photos } = repositories(f.host);
    await cg.putSlot(floor, { slot: 1, status: 'done', dataUrl: pixel('shared') });
    await photos.put({ id: 'p', dataUrl: pixel('shared') });
    await flushMediaJournals(f.host);
    await cg.deleteSlot(floor, 1);
    assert.equal((await f.gc.drain()).protected, 1);
    assert.equal(f.server.images.size, 1);
    const uploads = [...f.server.uploads], requests = f.requests.length;
    await f.advance(3600000);
    assert.deepEqual(f.server.uploads, uploads);
    assert.equal(f.requests.length, requests);
    assert.equal(f.timers.size, 0);
    await photos.remove('p'); await f.advance(10000);
    assert.equal(f.server.images.size, 0);
    assert.equal(f.server.deletions.length, 1);
    assert.deepEqual(f.server.uploads.slice(uploads.length), ['igs-photo-records.json']);
    assert.equal(f.timers.size, 0);
});

test('gate:media:write-protection-wakes-on-lease-release-without-reference-polling', async t => {
    const f = fixture(t), path = 'user/images/igs-media/temporary.png';
    f.server.images.set(path, pixel('temporary'));
    await f.gc.hold(path); await f.gc.released({ dataUrl: path }, null);
    assert.equal((await f.gc.drain()).protected, 1);
    const requests = f.requests.length;
    await f.advance(30000);
    assert.equal(f.requests.length, requests);
    assert.equal(f.server.images.size, 1);
    await f.gc.release(path); await f.advance(5000);
    assert.equal(f.server.images.size, 0);
    assert.deepEqual(f.server.uploads, []);
    assert.equal(f.timers.size, 0);
});

test('gate:media:deletion-errors-stop-after-three-attempts-and-explicit-retry-resumes', async t => {
    const f = fixture(t), path = 'user/images/igs-media/failed.png';
    f.server.images.set(path, pixel('failed')); f.server.failDelete = true;
    await f.gc.released({ dataUrl: path }, null); await f.advance(300000);
    assert.equal(f.requests.filter(url => url === '/api/images/delete').length, 3);
    assert.equal((await f.gc.diagnostics()).pausedDeletes, 1);
    assert.equal(f.timers.size, 0);
    const requests = f.requests.length; await f.advance(3600000);
    assert.equal(f.requests.length, requests);
    f.server.failDelete = false; await f.gc.drain();
    assert.equal(f.server.images.size, 0);
    assert.equal((await f.gc.diagnostics()).pendingDeletes, 0);
});

test('gate:media:reference-query-errors-also-pause-without-deleting-or-uploading', async t => {
    const f = fixture(t), path = 'user/images/igs-media/network.png';
    f.server.images.set(path, pixel('network')); f.server.failRead = true;
    await f.gc.released({ dataUrl: path }, null); await f.advance(300000);
    assert.equal((await f.gc.diagnostics()).pausedDeletes, 1);
    assert.equal(f.server.images.size, 1);
    assert.deepEqual(f.server.uploads, []);
    assert.equal(f.timers.size, 0);
    f.server.failRead = false; await f.gc.drain();
    assert.equal(f.server.images.size, 0);
});

test('gate:media:paused-deletion-does-not-restart-polling-when-runtime-reloads', async t => {
    const f = fixture(t), path = 'user/images/igs-media/paused.png';
    f.server.images.set(path, pixel('paused')); f.server.failDelete = true;
    await f.gc.released({ dataUrl: path }, null); await f.advance(300000);
    await f.gc.stop();
    const resumed = fixture(t, f.server, f.host.indexedDB);
    resumed.gc.start(); await settleMedia(); await resumed.advance(3600000);
    assert.equal(resumed.requests.length, 0);
    assert.equal(resumed.timers.size, 0);
    assert.equal((await resumed.gc.diagnostics()).pausedDeletes, 1);
});

test('gate:media:failed-pixel-migration-is-bounded-and-never-reuploads-unchanged-json', async t => {
    const f = fixture(t), { assets } = repositories(f.host);
    f.server.failUpload = true;
    await assets.putImage({ id: 'i', dataUrl: pixel('offline'), prompt: { positive: 'keep' } });
    await f.advance(300000);
    assert.equal(f.requests.filter(url => url === '/api/images/upload').length, 4);
    assert.equal((await assets.diagnostics()).retryPaused, true);
    assert.deepEqual(f.server.uploads, []);
    assert.equal(f.timers.size, 0);
    f.server.failUpload = false; assert.equal((await assets.flush()).ok, true);
    assert.equal((await assets.diagnostics()).pendingPixelUploads, 0);
    assert.equal((await assets.getImage('i')).prompt.positive, 'keep');
    assert.deepEqual(f.server.uploads, ['igs-asset-records.json']);
    assert.equal(f.timers.size, 0);
});

test('gate:media:backup-errors-pause-with-dirty-record-intact-and-manual-flush-recovers', async t => {
    const f = fixture(t), { cg } = repositories(f.host);
    f.server.failBackup = true;
    await cg.putSlot(floor, { slot: 1, status: 'done', dataUrl: 'user/images/igs-media/local.png' });
    await f.advance(300000);
    assert.equal(f.requests.filter(url => url === '/api/files/upload').length, 3);
    assert.equal((await cg.diagnostics()).dirty, 1);
    assert.equal((await cg.diagnostics()).retryPaused, true);
    assert.equal(f.timers.size, 0);
    f.server.failBackup = false; assert.equal((await cg.flush()).ok, true);
    assert.equal((await cg.diagnostics()).dirty, 0);
    assert.equal(f.timers.size, 0);
});

test('gate:media:explicit-flush-restores-a-missing-backup-without-losing-clean-local-records', async t => {
    const f = fixture(t), { cg } = repositories(f.host);
    await cg.putSlot(floor, { slot: 1, status: 'done', dataUrl: 'user/images/igs-media/local.png' });
    await cg.flush(); f.server.files.delete('igs-cg-records.json');
    await cg.flush();
    assert.equal(f.server.files.get('igs-cg-records.json').records[key].value.dataUrl, 'user/images/igs-media/local.png');
    assert.equal(f.server.uploads.length, 2);
});

test('gate:media:newer-remote-record-is-applied-without-echo-upload', async t => {
    const f = fixture(t), { cg } = repositories(f.host);
    await cg.putSlot(floor, { slot: 1, status: 'done', dataUrl: 'user/images/igs-media/shared.png', prompt: 'old' });
    await cg.flush();
    const remote = f.server.files.get('igs-cg-records.json').records[key];
    remote.version = `${Date.now() + 10000}:000000:remote`; remote.value.prompt = 'remote';
    await cg.flush();
    assert.equal((await cg.getSlotRecord(key)).prompt, 'remote');
    assert.equal(f.server.uploads.length, 1);
});

test('gate:media:settings-commit-wakes-a-protected-old-map-without-periodic-gc', async t => {
    const f = fixture(t), { maps } = repositories(f.host), mapKey = 'igs-map-custom:c:t:l';
    const saved = await maps.set(mapKey, pixel('map'));
    f.server.files.set('igs-settings.json', { version: 1, savedAt: 100, settings: { [mapKey]: saved.url } });
    await maps.remove(mapKey); await f.gc.drain();
    assert.equal((await f.gc.diagnostics()).protectedDeletes, 1);
    assert.equal(f.timers.size, 0);
    const sync = createTavernSettingsSync(f.host, { storage: f.host.localStorage, debounceMs: 10000,
        onUploaded: () => { void f.gc.referencesChanged(); } });
    t.after(() => sync.stop());
    await sync.start(); f.host.localStorage.setItem('igs-map-gen-palette', 'bright'); await sync.flush();
    await settleMedia(); await f.advance(5000);
    assert.equal(f.server.images.size, 0);
    assert.equal(f.timers.size, 0);
});

test('gate:media:equal-setting-writes-and-absent-key-removal-do-not-trigger-upload', async t => {
    const f = fixture(t);
    f.host.localStorage.setItem('igs-map-gen-palette', 'classic');
    f.server.files.set('igs-settings.json', { version: 2, savedAt: 100, settings: { 'igs-map-gen-palette': 'classic' } });
    let uploaded = 0;
    const sync = createTavernSettingsSync(f.host, { storage: f.host.localStorage, debounceMs: 10000, onUploaded: () => { uploaded += 1; } });
    t.after(() => sync.stop());
    await sync.start(); f.host.localStorage.setItem('igs-map-gen-palette', 'classic');
    f.host.localStorage.removeItem('igs-custom-fonts-v1'); await sync.flush();
    assert.equal(uploaded, 0);
    assert.deepEqual(f.server.uploads, []);
});

test('gate:media:metadata-edit-queued-during-backup-remains-dirty-until-its-own-upload', async t => {
    const f = fixture(t), { cg } = repositories(f.host);
    await cg.putSlot(floor, { slot: 1, status: 'done', dataUrl: 'user/images/igs-media/concurrent.png', prompt: 'initial' });
    await cg.flush(); await cg.patchSlotMetadata(key, { prompt: 'first' });
    const fetch = f.host.fetch;
    let release, arrived;
    const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { arrived = resolve; });
    let held = false;
    f.host.fetch = async (url, options) => {
        if (!held && String(url).startsWith('/user/files/igs-cg-records.json')) { held = true; arrived(); await gate; }
        return fetch(url, options);
    };
    const syncing = cg.flush(); await started;
    const editing = cg.patchSlotMetadata(key, { prompt: 'second' });
    release(); await syncing; await editing;
    assert.equal((await cg.diagnostics()).dirty, 1);
    assert.equal(f.server.files.get('igs-cg-records.json').records[key].value.prompt, 'first');
    await cg.flush(); await f.advance(600000);
    assert.equal(f.server.files.get('igs-cg-records.json').records[key].value.prompt, 'second');
    assert.equal(f.server.uploads.length, 3);
    assert.equal(f.timers.size, 0);
});

test('gate:media:runtime-start-rechecks-a-parked-remote-reference-once', async t => {
    const f = fixture(t), path = 'user/images/igs-media/remote-reference.png';
    f.server.images.set(path, pixel('remote'));
    f.server.files.set('igs-settings.json', { settings: { 'igs-map-custom:c:t:l': path } });
    await f.gc.released({ dataUrl: path }, null); await f.gc.drain(); await f.gc.stop();
    f.server.files.set('igs-settings.json', { settings: {} });
    const resumed = fixture(t, f.server, f.host.indexedDB);
    await resumed.gc.start(); await resumed.advance(600000);
    assert.equal(f.server.images.size, 0);
    assert.deepEqual(f.server.uploads, []);
    assert.equal(resumed.timers.size, 0);
});

test('gate:media:backup-retry-button-resumes-paused-records-and-refreshes-diagnostics', async t => {
    const f = fixture(t), { cg } = repositories(f.host);
    f.server.failBackup = true;
    await cg.putSlot(floor, { slot: 1, status: 'done', dataUrl: 'user/images/igs-media/retry.png' });
    await f.advance(300000); f.server.failBackup = false;
    const state = { activeSettings: { draft: { bridge: {}, readerSettings: {} }, asyncState: {} } };
    const result = await handleSettingsAction('image-records-retry-backup', {
        state, options: { media: { flush: () => flushMediaJournals(f.host),
            stats: async () => ({ cache: {}, records: [await cg.diagnostics()], lifecycle: await f.gc.diagnostics() }) } },
        rerenderSettings: () => ({ ok: true }),
    });
    assert.equal(result.ok, true);
    assert.equal((await cg.diagnostics()).dirty, 0);
    assert.match(state.activeSettings.asyncState.imageCacheStatus, /待备份 0 条/);
    assert.doesNotMatch(state.activeSettings.asyncState.imageCacheStatus, /自动重试已暂停/);
    assert.deepEqual(f.server.uploads, ['igs-cg-records.json']);
});

test('gate:media:backup-timer-and-gc-share-one-bounded-upload-retry-budget', async t => {
    const f = fixture(t), { cg } = repositories(f.host), path = 'user/images/igs-media/orphan.png';
    f.server.images.set(path, pixel('orphan')); f.server.failBackup = true;
    await cg.putSlot(floor, { slot: 1, status: 'done', dataUrl: 'user/images/igs-media/kept.png' });
    await f.gc.released({ dataUrl: path }, null); await f.advance(300000);
    assert.equal(f.requests.filter(url => url === '/api/files/upload').length, 3);
    assert.equal((await cg.diagnostics()).retryPaused, true);
    assert.equal((await f.gc.diagnostics()).pausedDeletes, 1);
    assert.equal(f.server.images.size, 1);
    assert.equal(f.timers.size, 0);
    f.server.failBackup = false; await f.gc.drain();
    assert.equal((await cg.diagnostics()).dirty, 0);
    assert.equal(f.server.images.size, 0);
});
