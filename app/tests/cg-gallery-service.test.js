import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createMemoryCgGalleryStore } from '../src/media/cg-gallery-store.js';
import { createCgGalleryService, cgCountStatus, cgEntryOf, loadCgCatalog } from '../src/media/cg-gallery-service.js';

async function setup(clearResult = { ok: true }) {
    const illustrationStore = createMemoryIllustrationStore();
    await illustrationStore.putSlot('chat|x|3|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,A', scene: 'rain' });
    await illustrationStore.putSlot('chat|x|4|0', { slot: 2, status: 'done', dataUrl: 'data:image/png;base64,B' });
    await illustrationStore.putSlot('other|5|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,C' });
    await illustrationStore.putSlot('other|6|0', { slot: 1, status: 'failed' });
    const galleryStore = createMemoryCgGalleryStore();
    const cleared = [];
    const service = createCgGalleryService({
        illustrationStore, galleryStore, now: () => 't',
        clearIllustration: async (id) => { cleared.push(id); if (clearResult.ok) await illustrationStore.deleteSlot(`${id.chatId}|${id.messageId}|${id.swipeId}`, id.slot); return clearResult; },
    });
    return { service, illustrationStore, galleryStore, cleared };
}

test('cg-gallery-service:catalog-lists-every-done-cg', async () => {
    const illustrationStore = createMemoryIllustrationStore();
    for (let i = 0; i < 50; i += 1) {
        await illustrationStore.putSlot(`chat|${i}|0`, { slot: 1, status: 'done', dataUrl: `data:image/png;base64,${i}` });
    }
    const service = createCgGalleryService({ illustrationStore, clearIllustration: async () => ({ ok: true }) });
    const page = await service.loadPage({ limit: 48 });
    assert.equal(page.items.length, 48);
    assert.ok(page.next);
    const seen = [];
    const catalog = await loadCgCatalog(service, { showHidden: true }, (progress) => seen.push(progress));
    assert.equal(cgCountStatus({ phase: 'cg', seen: 0 }), '正在清点 CG 数量，已看到 0 条。');
    assert.equal(cgCountStatus(seen.find((item) => item.phase === 'cg' && item.seen === 50)), '正在清点 CG 数量，已看到 50 条。');
    assert.ok(seen.some((item) => item.phase === 'marks'));
    assert.equal(catalog.items.length, 50);
    assert.equal(catalog.next, '');
    assert.equal(catalog.items[0].messageId, 49);
    assert.equal(catalog.items[49].messageId, 0);
    assert.equal(catalog.items[0].dataUrl, '');
});

test('cg-gallery-service:entries-parse-source-floor-and-skip-unfinished', async () => {
    const { service } = await setup();
    const page = await service.loadPage({ limit: 24 });
    assert.equal(page.ok, true);
    assert.deepEqual(page.items.map((e) => [e.chatId, e.messageId, e.slot]), [['chat|x', 3, 1], ['chat|x', 4, 2], ['other', 5, 1]]);
    assert.equal(page.items[0].prompt, 'rain');
    assert.equal(cgEntryOf({ floorKey: 'bad', slot: 1 }), null);
});

test('cg-gallery-service:hide-and-favorite-filter-without-touching-slots', async () => {
    const { service, illustrationStore } = await setup();
    await service.setHidden('chat|x|3|0|1', true);
    await service.setFavorite('other|5|0|1', true);
    assert.deepEqual((await service.loadPage()).items.map((e) => e.key), ['chat|x|4|0|2', 'other|5|0|1']);
    assert.equal((await service.loadPage({ showHidden: true })).items.length, 3);
    assert.deepEqual((await service.loadPage({ favoritesOnly: true })).items.map((e) => e.key), ['other|5|0|1']);
    assert.deepEqual((await service.loadPage({ chatId: 'chat|x', showHidden: true })).items.length, 2);
    assert.equal((await illustrationStore.getSlots('chat|x|3|0')).length, 1);
});

test('cg-gallery-service:remove-calls-clear-illustration-then-drops-mark', async () => {
    const { service, galleryStore, cleared } = await setup();
    await service.setFavorite('other|5|0|1', true);
    const [entry] = (await service.loadPage({ favoritesOnly: true })).items;
    assert.equal((await service.remove(entry)).ok, true);
    assert.deepEqual(cleared, [{ chatId: 'other', messageId: 5, swipeId: 0, slot: 1 }]);
    assert.equal(await galleryStore.get('other|5|0|1'), null);
    assert.equal((await service.loadPage()).items.length, 2);
});

test('cg-gallery-service:remove-all-clears-every-done-slot', async () => {
    const { service, illustrationStore } = await setup();
    const result = await service.removeAll();
    assert.equal(result.removed, 3);
    assert.equal(result.failed, 0);
    assert.equal((await service.loadPage()).items.length, 0);
    assert.equal((await illustrationStore.getSlots('chat|x|3|0')).length, 0);
});

test('cg-gallery-service:failed-remove-keeps-mark-and-entry', async () => {
    const { service, galleryStore } = await setup({ ok: false, reason: 'delete-failed' });
    await service.setFavorite('other|5|0|1', true);
    const [entry] = (await service.loadPage({ favoritesOnly: true })).items;
    assert.equal((await service.remove(entry)).reason, 'delete-failed');
    assert.ok(await galleryStore.get('other|5|0|1'));
    assert.equal((await service.loadPage()).items.length, 3);
    assert.equal((await createCgGalleryService({}).loadPage()).reason, 'store-unavailable');
});
