import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalImageCache, localImageCacheFor } from '../src/media/tavern-image-cache.js';
import { createTavernImageFiles } from '../src/media/tavern-image-files.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { withTavernGeneratedAssetFiles } from '../src/media/tavern-generated-assets.js';
import { exportAssetArchive, readAssetArchive } from '../src/scene/asset-archive.js';
import { snapshotAssetLibrary } from '../src/scene/asset-scope.js';
import { buildCharacterCardPack, parseCharacterCardPack } from '../src/scene/card-pack.js';
import { prepareImageImport } from '../src/media/image-import-transaction.js';
import { readZip, writeZip } from '../src/media/archive-zip.js';
import { createMemoryImageCacheStore } from '../src/media/image-cache-store.js';
import { normalizeBridgeConfig } from '../src/visual/igs-ui/settings-host-normalize.js';
import { fakeMediaServer, pixel } from './helpers/fake-media-server.js';

function sink() {
    const parts = [];
    return { mode: 'fixture', parts, closed: false, aborted: false,
        async write(bytes) { parts.push(bytes.slice()); }, async close() { this.closed = true; }, async abort() { this.aborted = true; },
        blob() { return new Blob(parts, { type: 'application/zip' }); } };
}

test('整包按需读取图片、校验损坏并回滚先前写入，直接服务端图片也跟包走', async () => {
    const server = fakeMediaServer(), host = server.host();
    const path = 'user/images/igs-media/direct.png'; server.images.set(path, pixel('direct'));
    const output = sink();
    const inline = pixel('inline');
    await exportAssetArchive({ format: 'igs-character-card', characterName: 'Fixture', library: { characters: { A: { 默认: path } },
        statusAvatars: { A: `/${path}`, B: inline } } }, null, host, 'direct.zip', { sink: output });
    const archive = await readAssetArchive(output.blob(), host);
    const id = archive.images[0].id; assert.equal(archive.library.characters.A.默认, `igs-gen:${id}`);
    assert.equal(archive.library.statusAvatars.A, `igs-gen:${id}`);
    assert.match(archive.library.statusAvatars.B, /^igs-gen:/); assert.equal(archive.images.length, 2);
    const payload = new Uint8Array(await output.blob().arrayBuffer()), view = new DataView(payload.buffer);
    payload[30 + view.getUint16(26, true)] ^= 1;
    const corrupt = await readAssetArchive(new Blob([payload]), host);
    let writes = 0;
    const result = await prepareImageImport(corrupt.images, corrupt.library, { writeStoredImage: async () => { writes++; return { ok: true }; } });
    assert.equal(result.ok, false); assert.match(result.error, /checksum/); assert.equal(writes, 0);
    const rollback = [];
    const failed = await prepareImageImport([archive.images[0], corrupt.images[0] && { ...corrupt.images[0], id: 'broken', dataUrl: pixel('second') }], archive.library,
        { async writeStoredImage(record) { if (++writes === 2) return { ok: false }; return { ok: true }; }, async deleteImages(ids) { rollback.push(...ids); return { ok: true }; } });
    assert.equal(failed.ok, false); assert.equal(rollback.length, 2);
});
