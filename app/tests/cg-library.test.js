import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createMemoryCgGalleryStore } from '../src/media/cg-gallery-store.js';
import { createMemoryCgIndexStore } from '../src/media/cg-index-store.js';
import { createMemoryPhotoAlbumStore } from '../src/media/photo-album.js';
import { createCgLibrary, filterCgEntries, withCgIndexSync, cgPageSlice, parseCgSlotKey } from '../src/media/cg-library.js';

const PNG = (n) => `data:image/png;base64,${n}`;
const at = (minute) => new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();

async function setup(clearResult = { ok: true }) {
    const raw = createMemoryIllustrationStore();
    const indexStore = createMemoryCgIndexStore();
    const illustrationStore = withCgIndexSync(raw, indexStore);
    await raw.putSlot('chat|3|0', { slot: 1, status: 'done', dataUrl: PNG('A'), updatedAt: at(3) });
    await raw.putSlot('chat|4|1', { slot: 1, status: 'done', dataUrl: PNG('B'), updatedAt: at(4) });
    await raw.putSlot('other|5|0', { slot: 2, status: 'done', dataUrl: PNG('C'), updatedAt: at(5) });
    await raw.putSlot('other|6|0', { slot: 1, status: 'failed', updatedAt: at(6) });
    const photoStore = createMemoryPhotoAlbumStore();
    await photoStore.put({ id: 'p1', chatId: 'chat', messageId: 9, dataUrl: 'data:image/jpeg;base64,P', createdAt: at(1) });
    const marksStore = createMemoryCgGalleryStore();
    const cleared = [];
    const reads = [];
    const counted = { ...illustrationStore, async getSlotRecords(keys) { reads.push(...keys); return illustrationStore.getSlotRecords(keys); } };
    const library = createCgLibrary({
        illustrationStore: counted, photoStore, marksStore, indexStore, now: () => 't',
        clearIllustration: async (id) => {
            cleared.push(id);
            if (clearResult.ok) await illustrationStore.deleteSlot(`${id.chatId}|${id.messageId}|${id.swipeId}`, id.slot);
            return clearResult;
        },
    });
    return { library, raw, illustrationStore, indexStore, photoStore, marksStore, cleared, reads };
}

test('cg-library:first-sync-builds-the-catalog-and-the-next-open-reads-no-records', async () => {
    const { library, reads } = await setup();
    const first = await library.syncIndex();
    assert.equal(first.ok, true);
    const shown = filterCgEntries(first.entries, { showHidden: true });
    assert.deepEqual(shown.map((e) => e.key), ['other|5|0|2', 'chat|4|1|1', 'chat|3|0|1', 'photo|p1']);
    assert.equal(shown[3].kind, 'photo');
    assert.ok(first.entries.find((e) => e.key === 'other|6|0|1' && e.ready === false), 'failed slot is indexed but not shown');
    const index = await library.readIndex();
    assert.equal(index.entries.length, 5);
    reads.length = 0;
    const second = await library.syncIndex();
    assert.deepEqual(reads, ['other|6|0|1'], 'only the not-yet-done slot is re-checked');
    assert.equal(second.changed, false);
});

test('cg-library:slot-writes-and-deletes-keep-the-catalog-in-step', async () => {
    const { library, illustrationStore, indexStore } = await setup();
    await library.syncIndex();
    await illustrationStore.putSlot('other|6|0', { slot: 1, status: 'done', dataUrl: PNG('D'), updatedAt: at(7) });
    await illustrationStore.putSlot('new|1|0', { slot: 1, status: 'pending', updatedAt: at(8) });
    await illustrationStore.deleteSlot('chat|3|0', 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const keys = (await indexStore.getAll()).filter((e) => e.ready).map((e) => e.key).sort();
    assert.deepEqual(keys, ['chat|4|1|1', 'other|5|0|2', 'other|6|0|1', 'photo|p1']);
});

test('cg-library:sync-drops-vanished-slots-and-picks-up-ones-written-elsewhere', async () => {
    const { library, raw } = await setup();
    await library.syncIndex();
    await raw.deleteSlot('chat|4|1', 1);
    await raw.putSlot('late|2|0', { slot: 1, status: 'done', dataUrl: PNG('L'), updatedAt: at(30) });
    const synced = await library.syncIndex();
    const keys = filterCgEntries(synced.entries, {}).map((e) => e.key);
    assert.equal(keys[0], 'late|2|0|1');
    assert.equal(keys.includes('chat|4|1|1'), false);
});

test('cg-library:a-store-that-never-answers-ends-with-a-named-reason-not-a-hang', async () => {
    const { indexStore, photoStore } = await setup();
    await indexStore.putMany([{ key: 'chat|3|0|1', kind: 'cg', chatId: 'chat', messageId: 3, swipeId: 0, slot: 1, updatedAt: at(3), ready: true, hidden: false, favorite: false }]);
    const never = new Promise(() => {});
    const library = createCgLibrary({
        illustrationStore: { listSlotKeys: () => never, getSlotRecord: () => never },
        photoStore, indexStore, timeouts: { keys: 30, batch: 30, index: 30, write: 30 },
    });
    const started = Date.now();
    const synced = await library.syncIndex();
    assert.ok(Date.now() - started < 1000);
    assert.equal(synced.ok, false);
    assert.equal(synced.reason, 'keys-timeout');
    assert.deepEqual(filterCgEntries(synced.entries, {}).map((e) => e.key), ['chat|3|0|1', 'photo|p1'], 'what the catalog already had stays visible');
    const full = await library.readFull(synced.entries.find((e) => e.key === 'chat|3|0|1'));
    assert.deepEqual(full, { ok: false, reason: 'batch-timeout' });
});

test('cg-library:a-broken-catalog-database-still-lists-every-cg', async () => {
    const { raw, photoStore } = await setup();
    const brokenIndex = { getAll: () => Promise.reject(new Error('boom')), putMany: () => Promise.reject(new Error('boom')) };
    const library = createCgLibrary({ illustrationStore: raw, photoStore, indexStore: brokenIndex });
    const synced = await library.syncIndex();
    assert.equal(synced.ok, false);
    assert.equal(filterCgEntries(synced.entries, {}).length, 4);
});

test('cg-library:thumbnails-are-kept-and-redone-when-the-cg-is-redrawn', async () => {
    const { raw, indexStore, photoStore } = await setup();
    let made = 0;
    const library = createCgLibrary({ illustrationStore: raw, photoStore, indexStore, makeThumbnail: async (src) => { made += 1; return `data:image/jpeg;base64,small-${src.slice(-1)}`; } });
    const synced = await library.syncIndex();
    const entry = synced.entries.find((e) => e.key === 'chat|3|0|1');
    assert.deepEqual(await library.makeThumb(entry), { ok: true, dataUrl: 'data:image/jpeg;base64,small-A' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal((await library.readThumbs([entry])).get(entry.key), 'data:image/jpeg;base64,small-A');
    assert.equal((await library.readThumbs([{ ...entry, updatedAt: at(50) }])).size, 0, 'stale thumbnail is ignored');
    assert.equal(made, 1);
});

test('cg-library:missing-record-and-unreadable-file-say-why', async () => {
    const { library, raw } = await setup();
    const synced = await library.syncIndex();
    const entry = synced.entries.find((e) => e.key === 'chat|3|0|1');
    await raw.deleteSlot('chat|3|0', 1);
    assert.deepEqual(await library.readFull(entry), { ok: false, reason: 'missing' });
    await raw.putSlot('path|1|0', { slot: 1, status: 'done', dataUrl: 'user/images/igs-cg/x.png' });
    const withFiles = createCgLibrary({ illustrationStore: { ...raw, hydrateSlot: async () => ({ dataUrl: '' }) } });
    assert.deepEqual(await withFiles.readFull({ key: 'path|1|0|1', kind: 'cg' }), { ok: false, reason: 'file-unreadable' });
});

test('cg-library:hide-and-favorite-write-their-own-store-and-survive-a-rebuild', async () => {
    const { library, marksStore, photoStore, raw } = await setup();
    const synced = await library.syncIndex();
    const cg = synced.entries.find((e) => e.key === 'chat|3|0|1');
    const photo = synced.entries.find((e) => e.key === 'photo|p1');
    assert.equal((await library.setHidden(cg, true)).ok, true);
    assert.equal((await library.setFavorite(photo, true)).ok, true);
    assert.equal((await marksStore.get('chat|3|0|1')).hidden, true);
    assert.equal((await photoStore.get('p1')).favorite, true);
    assert.equal((await raw.getSlots('chat|3|0')).length, 1, 'slots untouched');
    const fresh = createCgLibrary({ illustrationStore: raw, photoStore, marksStore, indexStore: createMemoryCgIndexStore() });
    const rebuilt = await fresh.syncIndex();
    assert.equal(filterCgEntries(rebuilt.entries, {}).some((e) => e.key === 'chat|3|0|1'), false);
    assert.deepEqual(filterCgEntries(rebuilt.entries, { favoritesOnly: true }).map((e) => e.key), ['photo|p1']);
});

test('cg-library:remove-clears-the-floor-cg-and-its-catalog-entry', async () => {
    const { library, cleared, indexStore } = await setup();
    const synced = await library.syncIndex();
    const entry = synced.entries.find((e) => e.key === 'other|5|0|2');
    assert.equal((await library.remove(entry)).ok, true);
    assert.deepEqual(cleared, [{ chatId: 'other', messageId: 5, swipeId: 0, slot: 2 }]);
    assert.equal((await indexStore.getAll()).some((e) => e.key === 'other|5|0|2'), false);
    const batch = await library.removeMany([{ kind: 'photo', photoId: 'p1', key: 'photo|p1' }]);
    assert.deepEqual(batch, { ok: true, removed: 1, failed: 0, keys: ['photo|p1'] });
});

test('cg-library:failed-remove-keeps-the-entry', async () => {
    const { library, indexStore } = await setup({ ok: false, reason: 'boom' });
    const synced = await library.syncIndex();
    const entry = synced.entries.find((e) => e.key === 'other|5|0|2');
    assert.deepEqual(await library.remove(entry), { ok: false, reason: 'boom' });
    assert.equal((await indexStore.getAll()).some((e) => e.key === 'other|5|0|2'), true);
});

test('cg-library:remove-all-clears-every-ready-entry', async () => {
    const { library, cleared } = await setup();
    const result = await library.removeAll();
    assert.equal(result.removed, 4);
    assert.equal(cleared.length, 3);
    assert.equal(filterCgEntries((await library.syncIndex()).entries, { showHidden: true }).length, 0);
});

test('cg-library:capture-adds-the-photo-and-trims-without-downloading-images', async () => {
    const { indexStore } = await setup();
    const photoStore = createMemoryPhotoAlbumStore();
    const listCalls = [];
    const wrapped = { ...photoStore, list: (opts) => { listCalls.push(opts); return photoStore.list(); } };
    let n = 0;
    const library = createCgLibrary({ photoStore: wrapped, indexStore, compose: async () => 'data:image/jpeg;base64,AAAA', makeId: () => `q${++n}`, now: () => at(n), getDocument: () => ({}) });
    assert.equal((await library.capturePhoto({ caption: '合影', chatId: 'c', messageId: 3 })).ok, true);
    assert.ok((await indexStore.getAll()).some((e) => e.key === 'photo|q1' && e.ready));
    assert.deepEqual(listCalls, [{ deferImages: true }]);
    assert.equal((await createCgLibrary({ photoStore, compose: async () => '' }).capturePhoto({})).ok, false);
});

test('cg-library:keys-parse-from-the-right-and-pages-slice', () => {
    assert.deepEqual(parseCgSlotKey('chat|x|3|0|2'), { floorKey: 'chat|x|3|0', slot: 2, chatId: 'chat|x', messageId: 3, swipeId: 0 });
    assert.equal(parseCgSlotKey('chat|3|0|0'), null);
    const sliced = cgPageSlice(Array.from({ length: 50 }, (_, i) => i), 5);
    assert.deepEqual([sliced.page, sliced.pages, sliced.items.length], [2, 3, 2]);
});
