import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FACE, faceVars, liveFaceBox, moveFaceBox, normalizeFaceBox, resizeFaceBox } from '../src/visual/igs-ui/live-face.js';
import { normalizeLiveFxSettings, normalizeLivePortrait } from '../src/visual/igs-ui/danmaku-settings.js';

const head = { x: 0.5, top: 0.05, w: 0.3 };

test('gate:live-face:portrait-box-follows-head-and-frame', () => {
    const base = liveFaceBox({ w: 300, h: 600, source: 'portrait', portrait: { x: 0, y: 0, zoom: 100 }, natural: { w: 500, h: 1000 }, head });
    assert.equal(base.source, 'portrait');
    // 图高 516、宽 258：头中心在水平正中，头顶在 84 + 25.8 处。
    assert.equal(base.cx, 50);
    assert.ok(base.cy > 15 && base.cy < 30, `cy ${base.cy}`);
    assert.ok(base.rx > 10 && base.rx < 20);
    // 取景右移 20%、放大 1.5 倍：脸也跟着右移、变大。
    const moved = liveFaceBox({ w: 300, h: 600, source: 'portrait', portrait: { x: 20, y: 0, zoom: 150 }, natural: { w: 500, h: 1000 }, head });
    assert.ok(moved.cx > base.cx + 15);
    assert.ok(moved.rx > base.rx * 1.4);
});

test('gate:live-face:stage-sprite-uses-draw-rect', () => {
    const box = liveFaceBox({ w: 1000, h: 500, source: 'stage', rect: { left: 300, top: 0, w: 400, h: 500 }, head: { x: 0.5, top: 0.1, w: 0.25 } });
    assert.equal(box.source, 'stage');
    assert.equal(box.cx, 50);
    assert.equal(box.rx, round1(100 / 2 * 1.15 / 1000 * 100));
    assert.ok(box.cy > 10 && box.cy < 25);
});

function round1(n) { return Math.round(n * 10) / 10; }

test('gate:live-face:cg-or-unknown-falls-back-to-default-and-manual-wins', () => {
    const dflt = liveFaceBox({ w: 300, h: 600, source: 'portrait', portrait: { x: 0, y: 0, zoom: 100 }, natural: null, head: null });
    assert.deepEqual({ cx: dflt.cx, cy: dflt.cy, rx: dflt.rx, ry: dflt.ry }, DEFAULT_FACE);
    assert.equal(dflt.source, 'default');
    const manual = liveFaceBox({ w: 300, h: 600, source: 'portrait', portrait: { x: 0, y: 0, zoom: 100 }, natural: { w: 500, h: 1000 }, head, manual: { cx: 30, cy: 40, rx: 12, ry: 9 } });
    assert.deepEqual(manual, { cx: 30, cy: 40, rx: 12, ry: 9, source: 'manual' });
    assert.deepEqual(faceVars(manual), { '--igs-face-x': '30%', '--igs-face-y': '40%', '--igs-face-rx': '12%', '--igs-face-ry': '9%' });
});

test('gate:live-face:normalize-and-drag-math', () => {
    assert.equal(normalizeFaceBox(null), null);
    assert.equal(normalizeFaceBox({ cx: 50, cy: 30 }), null);
    assert.deepEqual(normalizeFaceBox({ cx: 150, cy: -3, rx: 1, ry: 99 }), { cx: 100, cy: 0, rx: 4, ry: 60 });
    const box = { cx: 50, cy: 40, rx: 20, ry: 14 };
    assert.deepEqual(moveFaceBox(box, 10, -5), { cx: 60, cy: 35, rx: 20, ry: 14 });
    const grown = resizeFaceBox(box, 50 + 30 * Math.SQRT1_2, 40 + 21 * Math.SQRT1_2);
    assert.equal(grown.rx, 30);
    assert.equal(grown.ry, 21);
});

test('gate:live-face:settings-defaults-and-portrait-face-roundtrip', () => {
    assert.equal(normalizeLiveFxSettings({}).faceGuard, true);
    assert.equal(normalizeLiveFxSettings({ faceGuard: false }).faceGuard, false);
    assert.equal(normalizeLivePortrait(null).face, null);
    const saved = normalizeLivePortrait({ x: 5, y: -2, zoom: 120, face: { cx: 44, cy: 33, rx: 18, ry: 12 } });
    assert.deepEqual(saved.face, { cx: 44, cy: 33, rx: 18, ry: 12 });
    assert.deepEqual(normalizeLiveFxSettings({ portrait: saved }).portrait, saved);
});
