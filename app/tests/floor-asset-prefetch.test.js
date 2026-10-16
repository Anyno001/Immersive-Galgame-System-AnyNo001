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
    characterOutfits: {
        冬月: { 常服: { moods: { 平和: 'igs-gen:base', 喜悦: 'igs-gen:joy' } } },
        小林: { 常服: { moods: { 平和: 'lin-calm.png' } } },
    },
    characterDefaultOutfits: {
        冬月: { version: 1, outfitName: '常服' }, 小林: { version: 1, outfitName: '常服' },
    },
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

test('gate:floor-assets:skips-narrators-and-keeps-inherited-background', () => {
    const urls = collectFloorAssetUrls({
        source: '[igs-char:旁白|平和|天黑了]\n[igs-char:冬月|默认|我在]',
        sceneAssets,
        inheritedScene: { scene: '教室', time: '夜晚', nsfw: false },
        assetMatchCtx: { sceneAssets },
    });
    assert.deepEqual(urls, ['class.png', 'igs-gen:base']);
});
test('gate:floor-assets:chat-temp-display-is-separate-from-formal-outfits', async () => {
    const { resolveReaderSpriteAsset } = await import('../src/visual/igs-ui/reader-sprite-asset.js');
    const { resolveSpriteAsset } = await import('../src/scene/asset-match.js');
    const assets = structuredClone(sceneAssets);
    assets.characters.Alice = {};
    assets.characterAliases.Alice = ['小爱'];
    const before = structuredClone(assets);
    let available = 'available';
    const ctx = { sceneAssets: assets, tempSprite: name => name === 'Alice' ? 'igs-gen:pending' : '',
        imageAvailability: () => ({ status: available }) };
    assert.equal(resolveSpriteAsset('小爱', '', ctx).url, '', '正式衣装解析不采用临时图');
    const hit = resolveReaderSpriteAsset('小爱', '平和', ctx);
    assert.deepEqual([hit.url, hit.source, hit.outfit], ['igs-gen:pending', 'temp', '']);
    assert.deepEqual(collectFloorAssetUrls({ source: '[igs-char:小爱|平和|Hello.]',
        sceneAssets: assets, assetMatchCtx: ctx }), ['igs-gen:pending']);
    const emptyCharacter = resolveReaderSpriteAsset('小爱', '', ctx, '礼服');
    assert.deepEqual([emptyCharacter.url, emptyCharacter.outfit], ['igs-gen:pending', ''],
        '人物没有正式立绘时只按名字显示，不依赖衣装快照');
    assert.equal(resolveReaderSpriteAsset('小爱', '', ctx, '冬装').url, 'igs-gen:pending');
    assert.equal(resolveReaderSpriteAsset('Bob', '', ctx, '礼服').url, '', '不借其他人物的临时图');
    assert.deepEqual(collectFloorAssetUrls({ source: '[igs-char:小爱|平和|礼服|Hello.]',
        sceneAssets: assets, assetMatchCtx: ctx }), ['igs-gen:pending']);
    assets.characterOutfits.Alice = { 常服: { moods: { 平和: 'other-outfit.png' } } };
    assert.equal(resolveReaderSpriteAsset('小爱', '', ctx, '礼服').url, '',
        '人物已有正式立绘时保留衣装匹配规则');
    ctx.tempSpriteForOutfit = (name, outfit) => name === 'Alice' && outfit === '礼服' ? 'igs-gen:pending' : '';
    const named = resolveReaderSpriteAsset('小爱', '', ctx, '礼服');
    assert.deepEqual([named.url, named.outfit, named.selectionSource], ['igs-gen:pending', '礼服', 'chat-temp']);
    assert.deepEqual(collectFloorAssetUrls({ source: '[igs-char:小爱|平和|礼服|Hello.]',
        sceneAssets: assets, assetMatchCtx: ctx }), ['igs-gen:pending'], '未登记衣装仍可预取精确匹配的候选');
    assert.equal(resolveReaderSpriteAsset('小爱', '', ctx, '冬装').url, '', '不同衣装不借用候选');
    assets.characterOutfits.Alice = { 礼服: { moods: {} } };
    assert.deepEqual(collectFloorAssetUrls({ source: '[igs-char:小爱|平和|礼服|Hello.]',
        sceneAssets: assets, assetMatchCtx: ctx }), ['igs-gen:pending']);
    delete assets.characterOutfits.Alice;
    for (available of ['missing', 'read-error', 'decode-error', 'review']) {
        assert.equal(resolveReaderSpriteAsset('小爱', '', ctx).url, '', available);
        assert.equal(resolveReaderSpriteAsset('小爱', '', ctx, '礼服').url, '', available);
    }
    available = 'available';
    assets.characterOutfits.Alice = { 常服: { moods: { 平和: 'saved.png' } } };
    assets.characterDefaultOutfits.Alice = { version: 1, outfitName: '常服' };
    assert.equal(resolveReaderSpriteAsset('小爱', '', ctx).url, 'saved.png', '正式图优先');
    assets.characterOutfits.Alice.礼服 = { moods: { 平和: 'dress.png' } };
    assert.equal(resolveReaderSpriteAsset('小爱', '', ctx, '礼服').url, 'dress.png', '同名衣装入库后正式图优先');
    delete assets.characterOutfits.Alice.礼服;
    assert.equal(resolveReaderSpriteAsset('小爱', '', ctx, '礼服').url, 'saved.png',
        '已有正式默认图时保留原衣装回退规则');
    available = 'read-error';
    assert.equal(resolveReaderSpriteAsset('小爱', '', ctx).url, '', '正式图读取失败不换成临时图');
    delete assets.characterOutfits.Alice;
    delete assets.characterDefaultOutfits.Alice;
    assert.deepEqual(assets, before, '显示和预取不修改资料');
});
