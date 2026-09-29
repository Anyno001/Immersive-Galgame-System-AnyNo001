import test from 'node:test';
import assert from 'node:assert/strict';
import { composePhoto, createMemoryPhotoAlbumStore, layoutLayer, normalizePhoto, withPhotoAlbum } from '../src/media/photo-album.js';

const JPEG = 'data:image/jpeg;base64,AAAA';

function baseService(items, next = '') {
    const calls = [];
    return {
        calls,
        async loadPage(filters) { calls.push(filters); return { ok: true, items, next }; },
        async setHidden(key, hidden) { calls.push(['hidden', key, hidden]); return { ok: true }; },
        async setFavorite(key, favorite) { calls.push(['fav', key, favorite]); return { ok: true }; },
        async remove(entry) { calls.push(['remove', entry.key]); return { ok: true }; },
    };
}

test('gate: photo-album normalizes photos and rejects non-image data', () => {
    assert.equal(normalizePhoto({ id: 'a', dataUrl: 'javascript:1' }), null);
    assert.equal(normalizePhoto({ dataUrl: JPEG }), null);
    assert.equal(normalizePhoto({ id: 'a', dataUrl: JPEG, caption: 'x'.repeat(80) }).caption.length, 60);
});

test('gate: photo-album layout matches CSS cover for backgrounds and width-percent for sprites', () => {
    const bg = layoutLayer('bg', { naturalWidth: 1000, naturalHeight: 1000 }, 800, 450, {});
    assert.deepEqual(bg, { x: 0, y: -175, w: 800, h: 800 });
    const sprite = layoutLayer('sprite', { naturalWidth: 400, naturalHeight: 800 }, 800, 450, { size: '50%', position: '70% 100%' });
    assert.deepEqual(sprite, { x: 280, y: -350, w: 400, h: 800 });
});

test('gate: photo-album captures into the store and appends photos after floor CGs', async () => {
    const store = createMemoryPhotoAlbumStore();
    let n = 0;
    const album = withPhotoAlbum(baseService([{ key: 'c|1|0|1', chatId: 'c' }]), store, {
        compose: async () => JPEG, makeId: () => `p${++n}`, now: () => `2026-09-30T00:0${n}:00Z`, getDocument: () => ({}),
    });
    assert.equal((await album.capturePhoto({ caption: '合影', chatId: 'c', messageId: 3 })).ok, true);
    await album.capturePhoto({ caption: '别的聊天', chatId: 'd', messageId: 1 });
    const page = await album.loadPage({ limit: 24 });
    assert.deepEqual(page.items.map((e) => e.key), ['c|1|0|1', 'photo|p2', 'photo|p1']);
    assert.equal(page.items[2].kind, 'photo');
    assert.equal(page.items[2].prompt, '合影');
    const onlyC = await album.loadPage({ limit: 24, chatId: 'c' });
    assert.deepEqual(onlyC.items.map((e) => e.key), ['c|1|0|1', 'photo|p1']);
});

test('gate: photo-album paginates photos with its own cursor once floor CGs are exhausted', async () => {
    const store = createMemoryPhotoAlbumStore();
    for (let i = 0; i < 3; i += 1) await store.put({ id: `p${i}`, dataUrl: JPEG, createdAt: `2026-09-30T00:0${i}:00Z` });
    const base = baseService([], 'floor-next');
    const album = withPhotoAlbum(base, store);
    const first = await album.loadPage({ limit: 2 });
    assert.equal(first.next, 'floor-next', 'floor pages come first');
    base.loadPage = async () => ({ ok: true, items: [], next: '' });
    const second = await album.loadPage({ after: 'floor-next', limit: 2 });
    assert.deepEqual(second.items.map((e) => e.photoId), ['p2', 'p1']);
    assert.equal(second.next, 'photo:2');
    const third = await album.loadPage({ after: 'photo:2', limit: 2 });
    assert.deepEqual(third.items.map((e) => e.photoId), ['p0']);
    assert.equal(third.next, '');
});

test('gate: photo-album marks and deletes photos in its own store and delegates floor CGs', async () => {
    const store = createMemoryPhotoAlbumStore();
    await store.put({ id: 'p1', dataUrl: JPEG });
    const base = baseService([]);
    const album = withPhotoAlbum(base, store);
    await album.setFavorite('photo|p1', true);
    await album.setHidden('photo|p1', true);
    assert.deepEqual(await store.get('p1').then((p) => [p.favorite, p.hidden]), [true, true]);
    await album.setFavorite('c|1|0|1', true);
    assert.deepEqual(base.calls.at(-1), ['fav', 'c|1|0|1', true]);
    await album.remove({ kind: 'photo', photoId: 'p1', key: 'photo|p1' });
    assert.equal(await store.get('p1'), null);
    await album.remove({ key: 'c|1|0|1' });
    assert.deepEqual(base.calls.at(-1), ['remove', 'c|1|0|1']);
    assert.equal((await withPhotoAlbum(base, store, { compose: async () => '' }).capturePhoto({})).ok, false);
});

test('gate: photo-album composes stage cast between background and speaker', async () => {
    const drawn = [];
    class FakeImage {
        constructor() { this.naturalWidth = 100; this.naturalHeight = 200; this.onload = null; this.onerror = null; }
        set src(value) { this._src = value; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
        get src() { return this._src; }
    }
    const doc = {
        defaultView: { Image: FakeImage },
        createElement: () => ({
            width: 0,
            height: 0,
            getContext: () => ({ fillStyle: '', fillRect() {}, drawImage: (img) => drawn.push(img.src) }),
            toDataURL: () => 'data:image/jpeg;base64,AAA',
        }),
    };
    const layer = (url) => ({ image: `url("${url}")`, size: '40%', position: '50% 100%', visible: true });
    const dataUrl = await composePhoto(doc, { aspect: 16 / 9, bg: layer('bg.png'), cast: [layer('a.png'), layer('b.png')], sprite: layer('s.png') });
    assert.match(dataUrl, /^data:image\/jpeg/);
    assert.deepEqual(drawn, ['bg.png', 'a.png', 'b.png', 's.png']);
});
