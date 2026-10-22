import test from 'node:test';
import assert from 'node:assert/strict';

import { collectFloorAssetUrls } from '../src/visual/igs-ui/floor-asset-prefetch.js';

const sceneAssets = {
    enabled: true,
    scenes: { 教室: { url: 'class.png', times: {} }, 天台: { url: 'roof.png', times: {} } },
    characters: {
        冬月: { 默认: 'igs-gen:base', 喜悦: 'igs-gen:joy' },
        小林: { 默认: 'lin.png', 平和: 'lin-calm.png' },
    },
    characterAliases: {},
    characterOutfits: {},
};

test('gate:floor-assets:collects-every-sprite-and-background-in-the-floor', () => {
    const sprites = [];
    const urls = collectFloorAssetUrls({
        source: [
            '[igs-scene:教室|白天|晴]',
            '[igs-char:冬月|喜悦|你好]',
            '旁白走了一段。',
            '[igs-char:小林|平和|嗯]',
            '[igs-scene:天台|黄昏|晴]',
            '[igs-thought:冬月|默认|风好大]',
        ].join('\n'),
        sceneAssets,
        assetMatchCtx: { sceneAssets },
        onSpriteUrl: (url) => sprites.push(url),
        imageSlots: [{ url: 'cg-1.png' }, { url: '' }, { url: 'cg-1.png' }],
    });
    assert.deepEqual(urls, ['cg-1.png', 'class.png', 'igs-gen:joy', 'lin-calm.png', 'roof.png', 'igs-gen:base']);
    assert.deepEqual(sprites, ['igs-gen:joy', 'lin-calm.png', 'igs-gen:base'], '立绘回调不包含背景或 CG');
});
