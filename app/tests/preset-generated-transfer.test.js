import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCharacterAssetList, renderGeneratedAssetPane, renderSceneAssetList } from '../src/visual/igs-ui/settings-fields.js';

test('gate:preset:generated-pane-does-not-offer-transfer', () => {
    const html = renderGeneratedAssetPane({
        temp: [{ key: 'k', type: 'sprite', name: '雪乃', imageId: 'sp-a' }],
        resolveUrl: () => '',
    });
    assert.doesNotMatch(html, /data-gen-transfer|data-asset-preset-transfer/);
    assert.match(html, /存为立绘/);
});
