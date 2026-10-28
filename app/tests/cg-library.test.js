import { createMemoryCgIndexStore, createCgLibrary } from './helpers/media-fixtures.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createMemoryCgGalleryStore } from '../src/media/cg-gallery-store.js';

import { createMemoryPhotoAlbumStore } from '../src/media/photo-album.js';
import { filterCgEntries, withCgIndexSync, cgPageSlice, parseCgSlotKey } from '../src/media/cg-library.js';

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
            const result = typeof clearResult === 'function' ? clearResult() : clearResult;
            if (result.ok) await illustrationStore.deleteSlot(`${id.chatId}|${id.messageId}|${id.swipeId}`, id.slot);
            return result;
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

test('cg-library:slow-storage-keeps-the-original-read-and-delivers-its-late-result', { timeout: 3000 }, async () => {
    const { indexStore, photoStore } = await setup();
    let release, reads = 0, finished = false;
    const slow = new Promise(resolve => { release = resolve; });
    const library = createCgLibrary({
        illustrationStore: { listSlotKeys: async () => { await slow; return ['chat|3|0|1']; },
            getSlotRecord: async () => { reads++; await slow; return { status: 'done', dataUrl: PNG('late') }; } },
        photoStore, indexStore, timeouts: { keys: 5, batch: 5, index: 5, write: 5 },
    });
    const pending = library.syncIndex().then(result => { finished = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(finished, false);
    release();
    const synced = await pending;
    assert.equal(synced.ok, true);
    assert.equal(reads, 1);
    const full = await library.readFull(synced.entries.find(e => e.key === 'chat|3|0|1'));
    assert.deepEqual(full, { ok: true, dataUrl: PNG('late') });
    assert.equal(reads, 2);
});

test('cg-library:keep-photo-stores-a-finished-image-as-is', async () => {
    const { library, photoStore, indexStore } = await setup();
    const image = PNG('PENALTY');
    const kept = await library.keepPhoto({ dataUrl: image, chatId: 'chat', caption: '麻将惩罚 · 凛' });
    assert.equal(kept.ok, true);
    assert.equal((await photoStore.get(kept.photo.id)).dataUrl, image);
    assert.ok((await indexStore.getAll()).some((entry) => entry.photoId === kept.photo.id));
    const full = await library.readFull({ kind: 'photo', photoId: kept.photo.id, key: `photo|${kept.photo.id}` });
    assert.deepEqual(full, { ok: true, dataUrl: image });
});
