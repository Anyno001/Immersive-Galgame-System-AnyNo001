import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_FALLBACK_WORLD, fitMapCamera, mapPinWorldPoint, mapScreenToWorld, mapWorldToScreen, mapZoomBounds, panMapCamera, zoomMapCamera } from '../src/visual/igs-ui/map-viewport.js';

test('map viewport fits image into container with contain scale and centering', () => {
    const cam = fitMapCamera(1440, 900, 1672, 941);
    // contain：k = min(1440/1672, 900/941) ≈ 0.8612（受限于宽）
    assert.ok(Math.abs(cam.k - 1440 / 1672) < 1e-9);
    assert.equal(cam.tx, 0);
    assert.ok(Math.abs(cam.ty - (900 - 941 * cam.k) / 2) < 1e-9);
    // 竖屏窄容器：受限于宽，上下留白居中
    const mobile = fitMapCamera(390, 844, 1672, 941);
    assert.ok(Math.abs(mobile.k - 390 / 1672) < 1e-9);
    assert.ok(mobile.ty > 0);
    // 非法输入安全回退
    assert.deepEqual(fitMapCamera(0, 0, 1672, 941), { k: 1, tx: 0, ty: 0 });
});

test('map viewport zoom keeps focal point fixed and clamps to 1–4x of fit', () => {
    const base = fitMapCamera(800, 600, 1600, 900);
    const bounds = mapZoomBounds(base.k);
    assert.equal(bounds.min, base.k);
    assert.equal(bounds.max, base.k * 4);
    // 焦点 (400,300) 世界坐标在缩放后仍在同一屏幕位置
    const zoomed = zoomMapCamera(base, 2, 400, 300, base.k);
    assert.ok(Math.abs(zoomed.k - base.k * 2) < 1e-9);
    const focalWorld = mapScreenToWorld(base, 400, 300);
    const after = mapWorldToScreen(zoomed, focalWorld.x, focalWorld.y);
    assert.ok(Math.abs(after.x - 400) < 1e-6 && Math.abs(after.y - 300) < 1e-6);
    // 上限钳制
    const clamped = zoomMapCamera(base, 100, 400, 300, base.k);
    assert.equal(clamped.k, bounds.max);
    // 下限钳制（不能缩到小于拟合）
    const shrunk = zoomMapCamera(base, 0.01, 400, 300, base.k);
    assert.equal(shrunk.k, bounds.min);
    // 无效倍率不产新对象
    const same = zoomMapCamera(clamped, 2, 0, 0, base.k);
    assert.equal(same.k, bounds.max);
});

test('map viewport pan and world/screen round trip preserve coordinates', () => {
    const cam = panMapCamera(fitMapCamera(390, 300, 1600, 900), 40, -25);
    assert.equal(cam.tx, 40);
    const world = mapPinWorldPoint(0.25, 0.75, MAP_FALLBACK_WORLD.width, MAP_FALLBACK_WORLD.height);
    assert.deepEqual(world, { x: 400, y: 675 });
    const screen = mapWorldToScreen(cam, world.x, world.y);
    const back = mapScreenToWorld(cam, screen.x, screen.y);
    assert.ok(Math.abs(back.x - world.x) < 1e-9 && Math.abs(back.y - world.y) < 1e-9);
});
