import { createCgLibraryView } from './helpers/media-fixtures.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLocalImageCache } from '../src/media/tavern-image-cache.js';
import { pixel, settleMedia } from './helpers/fake-media-server.js';

const entry = (i, extra = {}) => ({
    key: `chat|${i}|0|1`, kind: 'cg', chatId: 'chat', messageId: i, swipeId: 0, slot: 1, photoId: '',
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), ready: true, hidden: false, favorite: false, ...extra,
});

test('gate:media:cg-clear-starts-current-thumbnails-without-waiting-for-old-generation', async () => {
    const cache = createLocalImageCache({}), item = entry(1);
    let finishOld, calls = 0;
    const library = { mediaCache: cache, readIndex: async () => ({ ok: true, entries: [item] }), syncIndex: async () => ({ ok: true, entries: [item] }), readThumbs: async () => new Map(),
        makeThumb: async () => ++calls === 1 ? new Promise(resolve => { finishOld = resolve; }) : { ok: true, dataUrl: pixel('new') } };
    const view = createCgLibraryView(library); await view.open(); await settleMedia();
    await cache.clear(); await view.whenIdle();
    assert.equal(view.tileOf(item.key).url, pixel('new'));
    finishOld({ ok: true, dataUrl: pixel('old') }); await settleMedia();
    assert.equal(view.tileOf(item.key).url, pixel('new')); view.dispose();
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
    assert.match(view.statusText(), /正在检查是否有新图/);
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

test('cg-library-view:a-new-round-while-thumbnails-are-out-neither-orphans-nor-hides-them', async () => {
    const index = Array.from({ length: 4 }, (_, i) => entry(i));
    let releaseThumbs;
    const thumbsGate = new Promise((resolve) => { releaseThumbs = resolve; });
    const makes = [];
    const library = fakeLibrary({
        index,
        makeThumb: (e) => new Promise((resolve) => { makes.push(() => resolve({ ok: true, dataUrl: `data:image/jpeg;base64,${e.messageId}` })); }),
    });
    library.readThumbs = async () => { await thumbsGate; return new Map(); };
    const shown = new Set();
    const view = createCgLibraryView(library, { onChange: (type, key) => { if (type === 'thumb') shown.add(key); } });
    view.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // 目录先出列表、开始查已存缩略图；还没查完，对账就带回一张新图，又开一轮。
    library.releaseSync({ ok: true, entries: [...index, entry(4)], changed: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseThumbs();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(makes.length, 3, 'three thumbnails being made');
    // 现做途中又开一轮（比如收藏了一张）：已经在做的不能被丢掉，也不能重复做。
    view.patchEntry('chat|0|0|1', { favorite: true });
    while (makes.length) makes.shift()();
    for (let i = 0; i < 5 && makes.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    while (makes.length) makes.shift()();
    await view.whenIdle();
    assert.equal(view.state.entries.length, 5);
    for (const e of view.state.entries) {
        assert.equal(view.tileOf(e.key).state, 'ok', `${e.key} has its thumbnail`);
        assert.ok(shown.has(e.key), `${e.key} was announced so the tile gets swapped in`);
    }
    assert.equal(view.statusText(), '', 'no tile left saying it is still loading');
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

test('cg-library-view:同槽通知拒收迟到旧缩略图并解绑订阅', async () => {
    const old = entry(1, { revisionToken: 'old' });
    const next = { ...old, revisionToken: 'new' };
    let notify, releaseOld, removed = 0;
    const library = fakeLibrary({ index: [old], makeThumb: e => e.revisionToken === 'old'
        ? new Promise(resolve => { releaseOld = resolve; })
        : Promise.resolve({ ok: true, dataUrl: 'data:image/jpeg;base64,NEW' }) });
    library.onChanged = fn => { notify = fn; return () => { removed++; }; };
    library.refreshEntry = async () => ({ ok: true, entry: next });
    const view = createCgLibraryView(library);
    view.open();
    library.releaseSync({ ok: true, entries: [old], changed: false });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(typeof releaseOld, 'function');
    notify({ chatId: 'chat', messageId: 1, swipeId: 0, slot: 1 });
    await new Promise(resolve => setTimeout(resolve, 0));
    releaseOld({ ok: true, dataUrl: 'data:image/jpeg;base64,OLD' });
    await view.whenIdle();
    assert.equal(view.state.entries.length, 1);
    assert.equal(view.find(old.key).revisionToken, 'new');
    assert.equal(view.tileOf(old.key).url, 'data:image/jpeg;base64,NEW');
    library.refreshEntry = async () => ({ ok: true, entry: null });
    notify({ chatId: 'chat', messageId: 1, swipeId: 0, slot: 1 });
    await view.whenIdle();
    assert.equal(view.state.entries.length, 0);
    assert.equal(view.tileOf(old.key).url, '');
    view.dispose();
    assert.equal(removed, 1);
});

test('cg-library-view:后台对账同槽新版本使已显示缩略图失效', async () => {
    const old = entry(1, { revisionToken: 'old' });
    const next = { ...old, revisionToken: 'new' };
    const library = fakeLibrary({ index: [old] });
    library.readThumbs = async entries => new Map(entries.map(e =>
        [e.key, `data:image/jpeg;base64,${e.revisionToken}`]));
    const view = createCgLibraryView(library);
    view.open();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(view.tileOf(old.key).url, 'data:image/jpeg;base64,old');
    library.releaseSync({ ok: true, entries: [next], changed: true });
    await view.whenIdle();
    assert.equal(view.tileOf(old.key).url, 'data:image/jpeg;base64,new');
    assert.equal(view.state.entries.length, 1);
    view.dispose();
});
