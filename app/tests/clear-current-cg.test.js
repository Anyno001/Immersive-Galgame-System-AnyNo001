import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryIllustrationStore, floorKeyOf } from '../src/media/illustration-store.js';
import { createAutoIllustrationService } from '../src/generated-images/illustration/auto-illustration-service.js';
import { clearCurrentCg } from '../src/generated-images/illustration/clear-current-cg.js';

const current = { identity: { chatId: 'chat-1', messageId: 8, swipeId: 2 }, slot: 1, url: 'blob:cg-1' };

test('gate:illustration:clear-current-cg-removes-only-current-and-forces-render', async () => {
    const images = new Map([['chat-1|8|2|1', 'blob:cg-1'], ['chat-1|8|2|2', 'blob:cg-2']]);
    const calls = [];
    const result = await clearCurrentCg({
        ...current,
        clear: async ({ chatId, messageId, swipeId, slot }) => {
            calls.push('clear');
            images.delete(`${chatId}|${messageId}|${swipeId}|${slot}`);
            return { ok: true };
        },
        forceRender: async (options) => { calls.push(['render', options]); },
    });
    assert.deepEqual(calls, ['clear', ['render', { force: true, reason: 'clear-current-cg' }]]);
    assert.equal(images.has('chat-1|8|2|1'), false);
    assert.equal(images.get('chat-1|8|2|2'), 'blob:cg-2');
    assert.deepEqual(result, { ok: true, reason: 'cleared', removed: true, rendered: true });
});

test('gate:illustration:clear-current-cg-no-current-is-stable', async () => {
    let calls = 0;
    const result = await clearCurrentCg({ identity: current.identity, slot: 1, url: '', clear: async () => { calls += 1; }, forceRender: async () => { calls += 1; } });
    assert.equal(calls, 0);
    assert.equal(result.reason, 'no-current-cg');
});

test('gate:illustration:clear-current-cg-failure-does-not-report-success-or-render', async () => {
    let renders = 0;
    const result = await clearCurrentCg({ ...current, clear: async () => ({ ok: false, reason: 'storage-failed' }), forceRender: async () => { renders += 1; } });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'storage-failed');
    assert.equal(renders, 0);
});

test('gate:illustration:clear-service-deletes-slot-invalidates-cache-and-emits-update', async () => {
    const store = createMemoryIllustrationStore();
    const floor = { chatId: 'chat-1', messageId: 8, swipeId: 2 };
    const key = floorKeyOf(floor);
    await store.putSlot(key, { slot: 1, status: 'done', dataUrl: 'blob:cg-1' });
    await store.putSlot(key, { slot: 2, status: 'done', dataUrl: 'blob:cg-2' });
    const events = [];
    const service = createAutoIllustrationService({
        store,
        llm: {},
        nai: { describe: () => ({ ready: { ok: true } }) },
        getSettings: () => ({}),
        events: { emit: (type, payload) => events.push({ type, payload }) },
        messageHost: {
            readFloor: () => ({ ...floor, isAi: true, isLatest: true, text: '正文' }),
            getChatId: () => floor.chatId,
        },
    });

    assert.equal(service.getIllustrationUrl({ ...floor, slot: 1 }), '');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(service.getIllustrationUrl({ ...floor, slot: 1 }), 'blob:cg-1');

    const result = await service.clearIllustration({ ...floor, slot: 1 });
    assert.equal(result.ok, true);
    assert.equal(service.getIllustrationUrl({ ...floor, slot: 1 }), '');
    assert.equal(service.getIllustrationUrl({ ...floor, slot: 2 }), 'blob:cg-2');
    assert.deepEqual((await store.getSlots(key)).map((item) => item.slot), [2]);
    assert.equal(events.at(-1).type, 'igs:illustration-updated');
    assert.deepEqual(events.at(-1).payload, { ...floor, slot: 1 });
});
