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

test('gate:illustration:clear-removes-the-marker-and-keeps-the-other-cg', async () => {
    const store = createMemoryIllustrationStore();
    const floor = { chatId: 'chat-1', messageId: 8, swipeId: 2, isAi: true, isLatest: false };
    const key = floorKeyOf(floor);
    await store.putSlot(key, { slot: 1, status: 'done', dataUrl: 'blob:cg-1', caption: { id: 1 } });
    await store.putSlot(key, { slot: 2, status: 'done', dataUrl: 'blob:cg-2', caption: { id: 2 } });
    let text = '[igs-img:1]\n第一段。\n[igs-img:2]\n第二段。';
    const service = createAutoIllustrationService({
        store,
        llm: {},
        nai: { describe: () => ({ ready: { ok: true } }) },
        getSettings: () => ({}),
        events: { emit() {} },
        messageHost: {
            readFloor: () => ({ ...floor, text }),
            writeFloor: async (_id, next) => { text = next; return { ok: true }; },
            getChatId: () => floor.chatId,
        },
    });
    const result = await service.clearIllustration({ ...floor, slot: 1 });
    assert.equal(result.ok, true);
    assert.equal(text.includes('[igs-img:1]'), false);
    assert.equal(text.includes('[igs-img:2]'), true);
    assert.deepEqual((await store.getSlots(key)).map((item) => item.slot), [2]);
});

test('gate:illustration:clear-deletes-the-image-when-the-floor-no-longer-matches', async () => {
    const store = createMemoryIllustrationStore();
    const floor = { chatId: 'old-chat', messageId: 8, swipeId: 0 };
    const key = floorKeyOf(floor);
    await store.putSlot(key, { slot: 1, status: 'done', dataUrl: 'blob:old' });
    let writes = 0;
    const service = createAutoIllustrationService({
        store,
        llm: {},
        nai: { describe: () => ({ ready: { ok: true } }) },
        getSettings: () => ({}),
        events: { emit() {} },
        messageHost: {
            readFloor: () => ({ chatId: 'current-chat', messageId: 8, swipeId: 0, isAi: true, text: '[igs-img:1]\n别的聊天' }),
            writeFloor: async () => { writes += 1; return { ok: true }; },
            getChatId: () => 'current-chat',
        },
    });
    const result = await service.clearIllustration({ ...floor, slot: 1 });
    assert.equal(result.ok, true);
    assert.equal(writes, 0);
    assert.equal((await store.getSlots(key)).length, 0);
});

test('gate:illustration:clear-keeps-the-image-when-the-marker-cannot-be-written', async () => {
    const store = createMemoryIllustrationStore();
    const floor = { chatId: 'chat-1', messageId: 8, swipeId: 0, isAi: true };
    const key = floorKeyOf(floor);
    await store.putSlot(key, { slot: 1, status: 'done', dataUrl: 'blob:cg-1' });
    const service = createAutoIllustrationService({
        store,
        llm: {},
        nai: { describe: () => ({ ready: { ok: true } }) },
        getSettings: () => ({}),
        events: { emit() {} },
        messageHost: {
            readFloor: () => ({ ...floor, text: '[igs-img:1]\n正文' }),
            writeFloor: async () => ({ ok: false, reason: 'write-failed' }),
            getChatId: () => floor.chatId,
        },
    });
    const result = await service.clearIllustration({ ...floor, slot: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'write-failed');
    assert.equal((await store.getSlots(key)).length, 1);
});

test('gate:illustration:clear-floor-removes-every-marker-and-image', async () => {
    const store = createMemoryIllustrationStore();
    const floor = { chatId: 'chat-1', messageId: 8, swipeId: 0, isAi: true, isLatest: true };
    const key = floorKeyOf(floor);
    await store.putSlot(key, { slot: 1, status: 'done', dataUrl: 'blob:cg-1' });
    await store.putSlot(key, { slot: 2, status: 'done', dataUrl: 'blob:cg-2' });
    let text = '[igs-img:1]\n甲。\n[igs-img:2]\n乙。';
    const service = createAutoIllustrationService({
        store,
        llm: {},
        nai: { describe: () => ({ ready: { ok: true } }) },
        getSettings: () => ({}),
        events: { emit() {} },
        messageHost: {
            readFloor: () => ({ ...floor, text }),
            writeFloor: async (_id, next) => { text = next; return { ok: true }; },
            getChatId: () => floor.chatId,
        },
    });
    const result = await service.clearFloorIllustrations(floor);
    assert.equal(result.reason, 'cleared');
    assert.equal(result.count, 2);
    assert.equal(/\[igs-img:|<IMG>/i.test(text), false);
    assert.equal((await store.getSlots(key)).length, 0);
    assert.equal((await store.getFloor(key)).status, 'done');
});

test('gate:illustration:reroll-one-paints-without-rewriting-the-prompt', async () => {
    const store = createMemoryIllustrationStore();
    const floor = { chatId: 'c1', messageId: 5, swipeId: 0, isAi: true, isLatest: true, text: '[igs-img:1]\n二段。' };
    const key = floorKeyOf(floor);
    const caption = { kept: true };
    await store.putSlot(key, { slot: 1, status: 'done', dataUrl: 'old', caption });
    const calls = { floor: 0, paint: 0 };
    const service = createAutoIllustrationService({
        store,
        llm: { request: async () => { throw new Error('不应写词'); } },
        nai: {
            describe: () => ({ via: 'dbgen', ready: { ok: true } }),
            writeDbgenFloorPrompts: async () => { calls.floor += 1; return { ok: false }; },
            generateDbgenCaption: async (req) => { calls.paint += 1; calls.caption = req.caption; return { ok: true, dataUrl: 'new' }; },
        },
        getSettings: () => ({ nsfwEnabled: true }),
        events: { emit() {} },
        messageHost: {
            readFloor: () => floor,
            writeFloor: async () => { throw new Error('单张重画不改正文'); },
            getChatId: () => 'c1',
        },
    });
    const result = await service.rerollSlot({ ...floor, slot: 1 });
    assert.equal(result.reason, 'done');
    assert.equal(calls.floor, 0);
    assert.equal(calls.paint, 1);
    assert.equal(calls.caption.kept, true);
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), 'new');
});

test('gate:illustration:reroll-floor-strips-markers-then-writes-prompts', async () => {
    const store = createMemoryIllustrationStore();
    const floor = { chatId: 'c1', messageId: 5, swipeId: 0, isAi: true, isLatest: true };
    const key = floorKeyOf({ ...floor, swipeId: 0 });
    await store.putSlot(key, { slot: 1, status: 'done', dataUrl: 'old', caption: { old: true } });
    await store.putFloor(key, { kind: 'nsfw', status: 'done', want: 1 });
    let text = '[igs-scene:房间|夜晚|晴|nsfw]\n[igs-img:1]\n二段。';
    const calls = { floor: 0, paint: 0, progress: [] };
    const caption = { next: true };
    const service = createAutoIllustrationService({
        store,
        llm: {},
        nai: {
            describe: () => ({ via: 'dbgen', ready: { ok: true } }),
            writeDbgenFloorPrompts: async () => {
                calls.floor += 1;
                assert.equal(text.includes('[igs-img:'), false);
                return { ok: true, captions: [{ slotId: 1, caption, anchorSentence: '二段。' }] };
            },
            generateDbgenCaption: async () => { calls.paint += 1; return { ok: true, dataUrl: 'new' }; },
        },
        getSettings: () => ({ nsfwEnabled: true, nsfwCount: 1 }),
        events: { emit: (_type, payload) => { if (payload && payload.phase) calls.progress.push(payload.phase === 'paint' ? `${payload.done}/${payload.total}` : payload.phase); } },
        messageHost: {
            readFloor: () => ({ ...floor, text }),
            writeFloor: async (_id, next) => { text = next; return { ok: true }; },
            readPreviousAiTexts: () => [],
            ensureMarkerRegexes: async () => ({ ok: true }),
            getChatId: () => 'c1',
        },
    });
    const result = await service.rerollFloor(5);
    assert.equal(result.reason, 'done');
    assert.equal(calls.floor, 1);
    assert.equal(calls.paint, 1);
    assert.deepEqual(calls.progress.filter((item) => item !== 'done'), ['write', '1/1']);
    assert.ok(text.includes('[igs-img:1]'));
});
