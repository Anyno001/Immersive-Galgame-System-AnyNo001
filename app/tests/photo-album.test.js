import test from 'node:test';
import assert from 'node:assert/strict';
import { composePhoto, createMemoryPhotoAlbumStore, layoutLayer, normalizePhoto } from '../src/media/photo-album.js';

const JPEG = 'data:image/jpeg;base64,AAAA';

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

test('gate: photo-album store lists ids and reads several raw photos at once', async () => {
    const store = createMemoryPhotoAlbumStore();
    await store.put({ id: 'p1', dataUrl: JPEG, createdAt: '2026-09-30T00:01:00Z' });
    await store.put({ id: 'p2', dataUrl: 'user/images/igs-photos/p2.jpg', createdAt: '2026-09-30T00:02:00Z' });
    assert.deepEqual((await store.listIds()).sort(), ['p1', 'p2']);
    const got = await store.getMany(['p2', 'nope', 'p1']);
    assert.deepEqual(got.map((p) => p && p.id), ['p2', null, 'p1']);
    assert.equal(got[0].dataUrl, 'user/images/igs-photos/p2.jpg');
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
