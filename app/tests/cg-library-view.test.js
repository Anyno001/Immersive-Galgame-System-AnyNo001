import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCgLibraryView } from '../src/visual/igs-ui/cg-library-view.js';

const entry = (i, extra = {}) => ({
    key: `chat|${i}|0|1`, kind: 'cg', chatId: 'chat', messageId: i, swipeId: 0, slot: 1, photoId: '',
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), ready: true, hidden: false, favorite: false, ...extra,
});

function fakeLibrary({ index = [], synced = null, thumbs = new Map(), makeThumb } = {}) {
    let releaseSync;
    const syncGate = new Promise((resolve) => { releaseSync = resolve; });
    const calls = { make: [], active: 0, maxActive: 0 };
    return {
        calls,
        releaseSync: (result) => releaseSync(result),
        readIndex: async () => ({ ok: true, entries: index }),
        syncIndex: async (onProgress) => {
            onProgress({ phase: 'keys', done: 0, total: 0 });
            const result = await syncGate;
            if (result && result.progress) for (const p of result.progress) onProgress(p);
            return result || synced || { ok: true, entries: index, changed: false };
        },
        readThumbs: async (list) => new Map(list.filter((e) => thumbs.has(e.key)).map((e) => [e.key, thumbs.get(e.key)])),
        makeThumb: makeThumb || (async (e) => {
            calls.make.push(e.key);
            calls.active += 1;
            calls.maxActive = Math.max(calls.maxActive, calls.active);
            await new Promise((resolve) => setTimeout(resolve, 2));
            calls.active -= 1;
            return { ok: true, dataUrl: `data:image/jpeg;base64,${e.messageId}` };
        }),
        readFull: async () => ({ ok: true, dataUrl: 'data:image/png;base64,FULL' }),
    };
}

test('cg-library-view:shows-the-catalog-before-the-background-check-finishes', async () => {
    const index = Array.from({ length: 30 }, (_, i) => entry(i));
    const library = fakeLibrary({ index });
    const events = [];
    const view = createCgLibraryView(library, { onChange: (type) => events.push(type) });
    view.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(view.state.phase, 'ready');
    assert.equal(view.state.list.length, 30);
    assert.equal(view.state.entries[0].messageId, 29, 'newest first');
    assert.match(view.statusText(), /正在核对有没有新图/);
    library.releaseSync({ ok: true, entries: index, changed: false });
    await view.whenIdle();
    assert.equal(view.statusText(), '', 'nothing left over once the check and the thumbnails are done');
    assert.ok(library.calls.maxActive <= 3, 'at most three thumbnails at a time');
    assert.equal(library.calls.make.length, 24, 'only the current page');
});

test('cg-library-view:first-open-says-how-far-the-catalog-build-has-got', async () => {
    const all = Array.from({ length: 3 }, (_, i) => entry(i));
    const library = fakeLibrary({ index: [] });
    const view = createCgLibraryView(library);
    view.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(view.state.phase, 'loading');
    assert.match(view.statusText(), /正在读取插图库和相册的编号/);
    library.releaseSync({ ok: true, entries: all, changed: true, progress: [{ phase: 'index', done: 2, total: 3 }] });
    await view.whenIdle();
    assert.equal(view.state.phase, 'ready');
    assert.equal(view.state.list.length, 3);
});

test('cg-library-view:a-partial-check-keeps-what-it-read-and-names-the-step', async () => {
    const library = fakeLibrary({ index: [entry(1)] });
    const view = createCgLibraryView(library);
    view.open();
    library.releaseSync({ ok: false, reason: 'keys-timeout', entries: [entry(1)], changed: false });
    await view.whenIdle();
    assert.equal(view.state.list.length, 1);
    assert.match(view.statusText(), /插图库 15 秒没有返回编号/);
});

test('cg-library-view:a-hung-thumbnail-does-not-block-paging-and-failures-can-be-retried', async () => {
    const index = Array.from({ length: 30 }, (_, i) => entry(i));
    let attempts = 0;
    const library = fakeLibrary({
        index,
        makeThumb: async (e) => {
            if (e.messageId === 29) return new Promise(() => {});
            if (e.messageId === 28 && attempts++ === 0) return { ok: false, reason: 'full-timeout' };
            return { ok: true, dataUrl: `data:image/jpeg;base64,${e.messageId}` };
        },
    });
    const thumbs = [];
    const view = createCgLibraryView(library, { onChange: (type, key) => { if (type === 'thumb') thumbs.push(key); } });
    view.open();
    library.releaseSync({ ok: true, entries: index, changed: false });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(view.tileOf('chat|28|0|1').state, 'failed');
    assert.match(view.tileOf('chat|28|0|1').reason, /原图读取超时/);
    view.goto(1);
    assert.equal(view.state.page, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(view.tileOf(view.state.entries[0].key).state, 'ok', 'next page fills in while the stuck one is still out');
    view.goto(0);
    view.retry('chat|28|0|1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(view.tileOf('chat|28|0|1').state, 'ok');
    assert.ok(thumbs.includes('chat|28|0|1'));
});

test('cg-library-view:filters-and-removals-work-on-the-catalog-without-reading-again', async () => {
    const index = [entry(1, { favorite: true }), entry(2, { hidden: true }), entry(3, { chatId: 'other', key: 'other|3|0|1' })];
    const library = fakeLibrary({ index });
    const view = createCgLibraryView(library);
    view.open();
    library.releaseSync({ ok: true, entries: index, changed: false });
    await view.whenIdle();
    assert.equal(view.state.list.length, 2);
    view.setFilters({ showHidden: true });
    assert.equal(view.state.list.length, 3);
    view.setFilters({ favoritesOnly: true });
    assert.deepEqual(view.state.list.map((e) => e.messageId), [1]);
    view.setFilters({ favoritesOnly: false, chatId: 'other' });
    assert.deepEqual(view.state.list.map((e) => e.messageId), [3]);
    view.setFilters({ chatId: '' });
    view.removeKeys(['chat|1|0|1']);
    assert.equal(view.state.list.length, 2);
    view.dispose();
});

test('cg-library-view:no-library-says-unavailable', async () => {
    const view = createCgLibraryView(null);
    await view.open();
    assert.equal(view.state.phase, 'error');
    assert.equal(view.statusText(), 'CG 库不可用');
});
