import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryIconHtml, resolveInventoryImage } from '../src/visual/igs-ui/inventory-slot-image.js';

const SVG = '<svg data-fallback></svg>';

test('inventory-slot-image:image-mode-shows-generated-image-else-svg-placeholder', () => {
    const resolve = (name) => (name === '钥匙' ? 'data:image/png;base64,AA' : '');
    assert.match(inventoryIconHtml('钥匙', SVG, resolve), /<img class="igs-record-item-image" src="data:image\/png;base64,AA"/);
    assert.equal(inventoryIconHtml('信', SVG, resolve), SVG);
    assert.equal(inventoryIconHtml('钥匙', SVG, undefined), SVG);
});

test('inventory-slot-image:rejects-unsafe-urls-and-throwing-lookups', () => {
    assert.equal(inventoryIconHtml('钥匙', SVG, () => 'javascript:alert(1)'), SVG);
    assert.equal(inventoryIconHtml('钥匙', SVG, () => 'https://x/a.png"onerror="x'), SVG);
    assert.equal(inventoryIconHtml('钥匙', SVG, () => { throw new Error('x'); }), SVG);
    assert.equal(resolveInventoryImage(() => 'data:image/png;base64,AA', '  '), '');
});

test('inventory-slot-image:svg-choice-never-shows-generated-image', () => {
    let looked = false;
    const resolve = () => { looked = true; return 'data:image/png;base64,AA'; };
    assert.equal(inventoryIconHtml('钥匙', SVG, resolve, 'svg'), SVG);
    assert.equal(looked, false);
    assert.match(inventoryIconHtml('钥匙', SVG, resolve, 'image'), /<img /);
});

test('inventory-slot-image:settings-normalize-inventory-icon-choice', async () => {
    const { normalizeItemImageSettings } = await import('../src/generated-images/illustration/item-image-settings.js');
    assert.equal(normalizeItemImageSettings(undefined).inventoryIcon, 'image');
    assert.equal(normalizeItemImageSettings({ inventoryIcon: 'svg' }).inventoryIcon, 'svg');
    assert.equal(normalizeItemImageSettings({ inventoryIcon: 'bogus' }).inventoryIcon, 'image');
    assert.equal(normalizeItemImageSettings({ enabled: false, inventoryIcon: 'svg' }).enabled, false);
});
