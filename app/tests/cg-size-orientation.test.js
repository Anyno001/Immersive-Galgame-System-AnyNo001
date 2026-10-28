import test from 'node:test';
import assert from 'node:assert/strict';
import { cgSizeForMode } from '../src/generated-images/illustration/auto-illustration-service.js';

const phone = { width: 390, height: 520 };
const wide = { width: 800, height: 600 };

test('方形背景尺寸在手机内嵌出竖图、宽屏内嵌出横图，像素不超过原尺寸', () => {
    assert.equal(cgSizeForMode('1024x1024', 'embedded', phone), '832x1216');
    assert.equal(cgSizeForMode('1024x1024', 'embedded', wide), '1216x832');
    assert.equal(cgSizeForMode('1024x1024', 'mobile', null), '832x1216');
    assert.equal(cgSizeForMode('1024x1024', 'pc', null), '1216x832');
    const [w, h] = cgSizeForMode('832x832', 'embedded', phone).split('x').map(Number);
    assert.ok(h > w && w * h <= 832 * 832);
});

test('横竖背景尺寸的既有行为不变', () => {
    assert.equal(cgSizeForMode('1216x832', 'embedded', phone), '832x1216');
    assert.equal(cgSizeForMode('1216x832', 'embedded', wide), '1216x832');
    assert.equal(cgSizeForMode('832x1216', 'embedded', phone), '832x1216');
});
