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
        imageSlots: [{ url: 'cg-1.png' }, { url: '' }, { url: 'cg-1.png' }],
    });
    assert.deepEqual(urls, ['cg-1.png', 'class.png', 'igs-gen:joy', 'lin-calm.png', 'roof.png', 'igs-gen:base']);
});

test('gate:floor-assets:skips-narrators-and-keeps-inherited-background', () => {
    const urls = collectFloorAssetUrls({
        source: '[igs-char:旁白|平和|天黑了]\n[igs-char:冬月|默认|我在]',
        sceneAssets,
        inheritedScene: { scene: '教室', time: '夜晚', nsfw: false },
        assetMatchCtx: { sceneAssets },
    });
    assert.deepEqual(urls, ['class.png', 'igs-gen:base']);
});
