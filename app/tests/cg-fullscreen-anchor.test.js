import test from 'node:test';
import assert from 'node:assert/strict';
import { lockedFullscreenSize, resolutionNearCap } from '../src/generated-images/illustration/auto-illustration-service.js';

test('锚定出图取不超过 1024×1024 的最大尺寸，不把屏幕 CSS 像素当分辨率', () => {
    const phone = resolutionNearCap(390, 844);
    assert.deepEqual(phone, { width: 640, height: 1408 });
    assert.ok(phone.width * phone.height <= 1024 * 1024);
    assert.equal(lockedFullscreenSize({ anchoredWidth: 390, anchoredHeight: 844 }), '640x1408');
    assert.equal(lockedFullscreenSize({ anchoredWidth: 640, anchoredHeight: 1408 }), '640x1408');
    assert.equal(lockedFullscreenSize({}), '');
});
