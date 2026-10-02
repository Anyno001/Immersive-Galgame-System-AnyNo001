import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCharacterAssetList, renderGeneratedAssetPane, renderSceneAssetList } from '../src/visual/igs-ui/settings-fields.js';

test('gate:preset:generated-pane-does-not-offer-transfer', () => {
    const html = renderGeneratedAssetPane({
        temp: [{ key: 'k', type: 'sprite', name: '雪乃', imageId: 'sp-a' }],
        resolveUrl: () => '',
    });
    assert.doesNotMatch(html, /data-gen-transfer|data-asset-preset-transfer/);
    assert.match(html, /入库到角色/);
});

test('gate:scene:rows-offer-download-and-stored-prompt', () => {
    const sceneHtml = renderSceneAssetList({
        教室: { url: 'igs-gen:bg-a', words: [], times: { 夜晚: { url: 'igs-gen:bg-b', weathers: {} } } },
    });
    assert.match(sceneHtml, /gen-asset-download:bg-a/);
    assert.match(sceneHtml, /gen-asset-prompt:bg-a/);
    assert.match(sceneHtml, /gen-asset-download:bg-b/);
    assert.doesNotMatch(sceneHtml, /data-asset-preset-transfer/);
    const charHtml = renderCharacterAssetList({ 雪乃: { 默认: 'igs-gen:sp-a' } }, {
        aliases: {},
        moodGroups: [],
        isOpen: () => true,
    });
    assert.match(charHtml, /gen-asset-download:sp-a/);
    assert.match(charHtml, /char-expression-prompt:/);
    assert.match(charHtml, /scene-rename-char:/);
    assert.doesNotMatch(charHtml, /data-asset-preset-transfer/);
});
