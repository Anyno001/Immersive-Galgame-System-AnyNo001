import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNudeSpriteAsset } from '../src/scene/asset-match.js';
import { applyCgPortrait, computeCgPortraitCrop } from '../src/visual/igs-ui/cg-portrait.js';
import { normalizeStatusHudSettings } from '../src/data/shujuku/status-hud-model.js';

const sceneAssets = {
    characters: { 小雪: { 默认: 'clothed.png', 害羞: 'clothed-shy.png' } },
    characterOutfits: {
        小雪: {
            校服: { words: [], moods: { 害羞: 'uniform-shy.png' } },
            裸身: { words: [], wardrobe: '裸体', base: 'nude-base.png', moods: { 害羞: 'nude-shy.png' } },
        },
        阿光: { 校服: { words: [], moods: { 默认: 'a.png' } } },
    },
};

test('CG 头像：只取引用「裸体」那套的表情差分，没差分用裸体底图', () => {
    assert.equal(resolveNudeSpriteAsset('小雪', '害羞', { sceneAssets }).url, 'nude-shy.png');
    assert.equal(resolveNudeSpriteAsset('小雪', '生气', { sceneAssets }).url, 'nude-base.png');
});

test('CG 头像：没有裸体服装就不显示，不退回穿衣立绘', () => {
    assert.equal(resolveNudeSpriteAsset('阿光', '默认', { sceneAssets }).url, '');
    assert.equal(resolveNudeSpriteAsset('路人', '默认', { sceneAssets }).url, '');
    assert.equal(resolveNudeSpriteAsset('', '默认', { sceneAssets }).url, '');
});

test('CG 头像：地址暂时解析为空时保留已挂上的头像', () => {
    const attrs = new Map([['data-igs-cgp', ''], ['data-igs-cgp-src', 'sprite.png']]);
    const dialog = {
        getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
        hasAttribute: (name) => attrs.has(name),
        setAttribute: (name, value) => attrs.set(name, String(value)),
        removeAttribute: (name) => attrs.delete(name),
    };
    const root = { querySelector: (selector) => (selector === '#igs-dialog' ? dialog : null) };
    applyCgPortrait(root, { content: { nsfwCgPortrait: 'sprite.png' }, readerSettings: {} }, {
        resolveAssetUrl: () => '',
    });
    assert.equal(dialog.getAttribute('data-igs-cgp'), '');
    assert.equal(dialog.getAttribute('data-igs-cgp-src'), 'sprite.png');
});

test('CG 头像：取景以头位为中心，缩放放大脸、偏移下移取景', () => {
    const info = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.2 } };
    const crop = computeCgPortraitCrop(info);
    // 头宽 200px → 框宽 500px：图宽 200%，头中心对准框中线。
    assert.equal(crop.width, 200);
    assert.equal(crop.left, -50);
    assert.ok(crop.top < 0);
    assert.ok(computeCgPortraitCrop(info, { zoom: 150 }).width > crop.width);
    assert.ok(computeCgPortraitCrop(info, { shift: 20 }).top < crop.top);
    assert.equal(computeCgPortraitCrop(null), null);
    assert.equal(computeCgPortraitCrop({ naturalW: 0, naturalH: 0, head: info.head }), null);
});

test('CG 头像开关默认关闭，拖动偏移和捏合缩放取整并限幅', () => {
    const hud = normalizeStatusHudSettings({});
    assert.equal(hud.nsfwCgPortrait, false);
    assert.equal(hud.nsfwCgPortraitShift, 0);
    assert.equal(hud.nsfwCgPortraitZoom, 100);
    const custom = normalizeStatusHudSettings({ nsfwCgPortrait: true, nsfwCgPortraitShift: '10', nsfwCgPortraitZoom: 33 });
    assert.equal(custom.nsfwCgPortrait, true);
    assert.equal(custom.nsfwCgPortraitShift, 10);
    assert.equal(custom.nsfwCgPortraitZoom, 50);
    const dragged = normalizeStatusHudSettings({ nsfwCgPortraitShift: 17.6, nsfwCgPortraitShiftX: -999 });
    assert.equal(dragged.nsfwCgPortraitShift, 18);
    assert.equal(dragged.nsfwCgPortraitShiftX, -120);
});
