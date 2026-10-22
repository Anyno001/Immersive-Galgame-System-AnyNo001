import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverOperation, createOperationCheckpoint, checkpointService, wakeRecoveringOperations, subscribeRecoveries } from '../src/storage/automatic-recovery.js';
import { mediaRequest } from '../src/media/tavern-media-http.js';
import { createArchiveDownload } from '../src/media/archive-download.js';
import { createIdbConnection } from '../src/media/idb-connection.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { createAssetRecordCache } from '../src/media/asset-record-cache.js';
import { fixtureMedia } from './helpers/media-fixtures.js';

test('地图恢复：上传后的保存和删除分别失败，续存原文件并依次完成同位置写入', async t => {
    const { fakeMediaServer, pixel } = await import('./helpers/fake-media-server.js');
    const { createMediaRuntime } = await import('../src/media/media-runtime.js');
    const { mapImageRepositoryFor } = await import('../src/media/tavern-map-images.js');
    const server = fakeMediaServer(), global = server.host();
    const media = createMediaRuntime(global);
    t.after(() => media.destroy());
    const repository = mapImageRepositoryFor(global), key = 'igs-map-custom:chat:table:level';
    let uploads = 0, saveFault = true, deleteFault = true;
    const fetch = global.fetch, set = global.localStorage.setItem.bind(global.localStorage), remove = global.localStorage.removeItem.bind(global.localStorage);
    global.fetch = (...args) => { if (args[0] === '/api/images/upload') uploads++; return fetch(...args); };
    global.localStorage.setItem = (name, value) => {
        if (name === key && saveFault) { saveFault = false; throw new Error('temporary-save'); }
        return set(name, value);
    };
    global.localStorage.removeItem = name => {
        if (name === key && deleteFault) { deleteFault = false; throw new Error('temporary-remove'); }
        return remove(name);
    };
    assert.equal((await repository.set(key, pixel('same-upload'))).ok, true);
    assert.equal(uploads, 1);
    assert.equal(server.images.get(global.localStorage.getItem(key)), pixel('same-upload'));
    const first = repository.set(key, 'https://example.invalid/first.webp');
    const second = repository.set(key, 'https://example.invalid/second.webp');
    assert.equal((await first).ok, true);
    assert.equal((await second).ok, true);
    assert.equal(global.localStorage.getItem(key), 'https://example.invalid/second.webp');
    assert.equal((await repository.remove(key)).ok, true);
    assert.equal(global.localStorage.getItem(key), null);
});

test('字体恢复：已选文件只上传一次，清单保存恢复后才报告完成和删除服务端文件', async () => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const { CUSTOM_FONT_STORE_KEY, loadCustomFonts } = await import('../src/media/custom-fonts.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const localStorage = createMemoryStorage(), set = localStorage.setItem;
    const file = { name: 'fixture.woff2', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    let selected = 0, uploads = 0, deletes = 0, failSave = true;
    localStorage.setItem = (key, value) => {
        if (key === CUSTOM_FONT_STORE_KEY && failSave) { failSave = false; throw new Error('temporary-list-save'); }
        return set(key, value);
    };
    const global = { localStorage, document: { createElement() { return { click() { selected++; this.files = [file]; this.onchange(); } }; } },
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) },
        fetch: async (url, options) => {
            if (url === '/api/files/upload') { uploads++; return { ok: true, json: async () => ({ path: `user/files/${JSON.parse(options.body).name}` }) }; }
            assert.equal(url, '/api/files/delete');
            assert.deepEqual(loadCustomFonts(global), [], '清单持久化成功后才删除文件');
            deletes++; return { ok: true };
        } };
    const context = { state: { activeSettings: { draft: { readerSettings: {}, bridge: {} }, asyncState: {} } },
        options: { global, recoveryCheckpoint: createOperationCheckpoint() },
        persistSettingsDraft: () => ({ ok: true }), rerenderSettings: () => ({ ok: true }),
        dialogs: { confirm: async () => true }, closeSettings() {}, buildRegexPreview() {} };
    assert.equal((await handleSettingsAction('custom-font-upload', context)).ok, true);
    const [font] = loadCustomFonts(global);
    assert.ok(font);
    assert.deepEqual([selected, uploads], [1, 1]);
    failSave = true;
    assert.equal((await handleSettingsAction(`custom-font-remove:${font.id}`, context)).ok, true);
    assert.equal(deletes, 1);
});

test('CG库恢复：拍照不重复合成，收藏和删除成功后仅续做失败的目录步骤', async t => {
    const { createCgLibrary } = await import('../src/media/cg-library.js');
    const { createMemoryPhotoAlbumStore } = await import('../src/media/photo-album.js');
    const { createMemoryCgIndexStore } = await import('../src/media/cg-index-store.js');
    const media = fixtureMedia(); t.after(() => media.destroy());
    const raw = createMemoryPhotoAlbumStore(), index = createMemoryCgIndexStore({ mediaCache: media });
    let compositions = 0, ids = 0, writes = 0, patches = 0, removals = 0, indexWrites = 0, indexPatches = 0, indexRemovals = 0;
    const photos = { ...raw,
        async put(photo) { writes++; if (writes === 1) throw new Error('temporary-photo-save'); return raw.put(photo); },
        async patchMetadata(id, patch) { patches++; const photo = await raw.get(id); return raw.put({ ...photo, ...patch }); },
        async remove(id) { removals++; return raw.remove(id); } };
    const library = createCgLibrary({ mediaCache: media, photoStore: photos,
        indexStore: { ...index,
            async putMany(rows) { indexWrites++; if (indexWrites === 1) throw new Error('temporary-index-save'); return index.putMany(rows); },
            async patch(...args) { indexPatches++; if (indexPatches === 1) throw new Error('temporary-index-patch'); return index.patch(...args); },
            async removeMany(...args) { indexRemovals++; if (indexRemovals === 1) throw new Error('temporary-index-remove'); return index.removeMany(...args); } },
        compose: async () => { compositions++; return 'data:image/jpeg;base64,AAAA'; }, makeId: () => `photo-${++ids}` });
    assert.equal((await library.capturePhoto({ chatId: 'chat', messageId: 1 })).ok, true);
    assert.deepEqual([compositions, ids, writes, indexWrites], [1, 1, 2, 2]);
    const [entry] = (await library.readIndex()).entries;
    assert.equal((await library.setFavorite(entry, true)).ok, true);
    assert.deepEqual([patches, indexPatches], [1, 2]);
    assert.equal((await raw.get('photo-1')).favorite, true);
    assert.equal((await library.remove(entry)).ok, true);
    assert.deepEqual([removals, indexRemovals], [1, 2]);
    assert.deepEqual(await index.getAll(), []);
});

test('媒体目录恢复：关闭能结束目录故障等待，重新启动后从已保存记录同步', async t => {
    const { fakeMediaServer } = await import('./helpers/fake-media-server.js');
    const { createMediaRuntime } = await import('../src/media/media-runtime.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createMemoryCgIndexStore } = await import('../src/media/cg-index-store.js');
    const { withCgIndexSync } = await import('../src/media/cg-library.js');
    const global = fakeMediaServer().host(), raw = createMemoryIllustrationStore();
    let runtime = createMediaRuntime(global), failed = true, entered;
    t.after(() => runtime.destroy());
    const started = new Promise(resolve => { entered = resolve; });
    const rows = new Map();
    const index = { async upsert(entries) {
        if (failed) { entered(); throw new Error('temporary-index-unavailable'); }
        for (const entry of entries) rows.set(entry.key, entry);
    } };
    const first = withCgIndexSync(raw, index, global);
    const pending = first.putSlot('chat|1|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,AAAA' });
    await started;
    await runtime.destroy();
    await pending;
    assert.equal((await raw.getSlotRecord('chat|1|0|1')).dataUrl, 'data:image/png;base64,AAAA');
    assert.equal(rows.size, 0);
    runtime = createMediaRuntime(global); failed = false;
    const catalog = createMemoryCgIndexStore({ mediaCache: runtime.cache });
    const { createCgLibrary } = await import('../src/media/cg-library.js');
    const library = createCgLibrary({ globalObject: global, mediaCache: runtime.cache, illustrationStore: raw, indexStore: catalog });
    assert.equal((await library.syncIndex()).ok, true);
    assert.equal((await catalog.getAll())[0].ready, true);
});
