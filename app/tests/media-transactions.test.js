import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createMemoryPhotoAlbumStore } from '../src/media/photo-album.js';
import { createTavernImageFiles } from '../src/media/tavern-image-files.js';
import { withTavernGeneratedAssetFiles } from '../src/media/tavern-generated-assets.js';
import { withTavernIllustrationFiles } from '../src/media/tavern-illustrations.js';
import { withTavernPhotoFiles } from '../src/media/tavern-photos.js';
import { createMediaRecordJournal, flushMediaJournals, stopMediaJournals } from '../src/media/media-record-journal.js';
import { mediaFileGcFor } from '../src/media/media-file-gc.js';
import { mapImageRepositoryFor } from '../src/media/tavern-map-images.js';
import { prepareImageImport } from '../src/media/image-import-transaction.js';
import { legacyImageHash } from '../src/media/legacy-image-recovery.js';
import { imageSha256 } from '../src/media/image-sha256.js';
import { fakeMediaServer, pixel, settleMedia } from './helpers/fake-media-server.js';

test('gate:media:offload-failure-releases-all-write-leases-and-queues-partial-upload', async () => {
    const server = fakeMediaServer(), host = server.host();
    let hashes = 0;
    host.crypto = { subtle: { async digest(...args) { if (++hashes === 2) throw new Error('hash-failed'); return webcrypto.subtle.digest(...args); } } };
    const files = createTavernImageFiles(host, 'igs-assets');
    await assert.rejects(files.offload({ dataUrl: pixel('one'), originalDataUrl: pixel('two') }, 'i', null), /hash-failed/);
    assert.equal((await mediaFileGcFor(host).diagnostics()).activeWrites, 0);
    assert.equal((await mediaFileGcFor(host).diagnostics()).pendingDeletes, 1);
    await mediaFileGcFor(host).drain(); assert.equal(server.images.size, 0);
});

test('gate:media:revision-race-keeps-current-image-and-compensates-the-losing-upload', async () => {
    const server = fakeMediaServer(), host = server.host(), raw = createMemoryGeneratedAssetStore();
    const store = withTavernGeneratedAssetFiles(raw, host);
    await store.putImage({ id: 'i', revision: 1, dataUrl: pixel('old'), originalDataUrl: pixel('original') });
    const old = await raw.getImage('i'), fetch = host.fetch;
    let release, arrived;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { arrived = resolve; });
    host.fetch = async (url, options) => {
        if (url === '/api/images/upload' && JSON.parse(options.body).image === pixel('loser').split(',')[1]) { arrived(); await gate; }
        return fetch(url, options);
    };
    const losing = store.updateImage('i', 1, { dataUrl: pixel('loser') });
    await started;
    assert.equal((await store.updateImage('i', 1, { dataUrl: old.dataUrl })).ok, true);
    release(); assert.equal((await losing).reason, 'stale-revision');
    const kept = await raw.getImage('i'); assert.equal(kept.revision, 2); assert.equal(kept.dataUrl, old.dataUrl);
    await mediaFileGcFor(host).drain();
    assert.equal(server.images.size, 2); assert.ok(server.images.has(old.dataUrl)); assert.ok(server.images.has(old.originalDataUrl));
    assert.equal(server.deletions.length, 1);
});
