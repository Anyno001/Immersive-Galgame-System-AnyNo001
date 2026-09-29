import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryIllustrationStore, parseFloorKey } from '../src/media/illustration-store.js';
import { createMemoryCgGalleryStore, normalizeCgMark } from '../src/media/cg-gallery-store.js';

test('cg-gallery:parse-floor-key-from-right-keeps-pipes-in-chat-id', () => {
    assert.deepEqual(parseFloorKey('chat|x|3|0'), { chatId: 'chat|x', messageId: 3, swipeId: 0 });
    assert.deepEqual(parseFloorKey('c1|12|2'), { chatId: 'c1', messageId: 12, swipeId: 2 });
    assert.equal(parseFloorKey('a|b'), null);
    assert.equal(parseFloorKey('c|-1|0'), null);
    assert.equal(parseFloorKey('|3|0'), null);
    assert.equal(parseFloorKey(null), null);
});

test('cg-gallery:done-slots-page-in-key-order-and-skip-unfinished', async () => {
    const store = createMemoryIllustrationStore();
    await store.putSlot('chat|x|3|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,A' });
    await store.putSlot('chat|x|3|0', { slot: 2, status: 'failed' });
    await store.putSlot('chat|x|4|1', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,B' });
    await store.putSlot('other|5|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,C' });
    await store.putSlot('other|6|0', { slot: 1, status: 'pending' });
    const first = await store.listDoneSlotsPage({ limit: 2 });
    assert.deepEqual(first.items.map((i) => i.key), ['chat|x|3|0|1', 'chat|x|4|1|1']);
    assert.equal(first.next, 'chat|x|4|1|1');
    assert.equal(first.items[0].floorKey, 'chat|x|3|0');
    const second = await store.listDoneSlotsPage({ after: first.next, limit: 2 });
    assert.deepEqual(second.items.map((i) => i.key), ['other|5|0|1']);
    assert.equal(second.next, '');
    assert.equal((await store.listDoneSlotsPage({ limit: 999 })).items.length, 3);
});

test('cg-gallery:marks-hide-and-favorite-without-touching-slots', async () => {
    const slots = createMemoryIllustrationStore();
    await slots.putSlot('chat|3|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,A' });
    const marks = createMemoryCgGalleryStore();
    assert.equal((await marks.put({ key: 'chat|3|0|1', hidden: true })).ok, true);
    assert.equal((await marks.get('chat|3|0|1')).hidden, true);
    assert.equal((await slots.getSlots('chat|3|0')).length, 1);
    await marks.put({ key: 'chat|3|0|1', hidden: false, favorite: true });
    assert.deepEqual((await marks.getAll()).map((m) => [m.key, m.hidden, m.favorite]), [['chat|3|0|1', false, true]]);
    await marks.put({ key: 'chat|3|0|1', hidden: false, favorite: false });
    assert.deepEqual(await marks.getAll(), []);
    assert.equal((await marks.put({ hidden: true })).reason, 'invalid-key');
    assert.equal(normalizeCgMark({ key: ' k ', hidden: 'yes' }).hidden, false);
});
