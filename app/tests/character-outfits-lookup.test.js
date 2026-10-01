import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpriteAsset } from '../src/scene/asset-match.js';

const sceneAssets = {
    characters: { 小林海斗: { 默认: 'base.png', 喜悦: 'base-joy.png' } },
    characterAliases: { 小林海斗: ['小林'] },
    moodGroups: [{ label: '喜悦', words: ['喜悦', '欣喜'] }, { label: '害羞', words: ['害羞'] }, { label: '平和', words: ['平和'] }],
    characterOutfits: {
        小林海斗: {
            泳装: { words: ['泳衣'], moods: { 喜悦: 'swim-joy.png', 平和: 'swim-calm.png' } },
            睡衣: { words: [], moods: { 默认: 'sleep-default.png' } },
        },
    },
};
const ctx = { sceneAssets };

test('gate:outfits:sprite-lookup-uses-outfit-exact-and-group', () => {
    const exact = resolveSpriteAsset('小林海斗', '喜悦', ctx, '泳装');
    assert.deepEqual([exact.url, exact.source, exact.outfit, exact.slot], ['swim-joy.png', 'user-outfit', '泳装', '喜悦']);
    const group = resolveSpriteAsset('小林海斗', '欣喜', ctx, '泳装');
    assert.deepEqual([group.url, group.quality], ['swim-joy.png', 'group']);
    const alias = resolveSpriteAsset('小林', '喜悦', ctx, '泳装');
    assert.deepEqual([alias.url, alias.character], ['swim-joy.png', '小林海斗']);
});

test('gate:outfits:sprite-lookup-miss-uses-this-outfit-calm', () => {
    const missingMood = resolveSpriteAsset('小林海斗', '害羞', ctx, '泳装');
    assert.deepEqual([missingMood.url, missingMood.source, missingMood.slot, missingMood.outfit], ['swim-calm.png', 'user-outfit', '平和', '泳装']);
    assert.equal(resolveSpriteAsset('小林海斗', '平和', ctx, '睡衣').url, 'base.png');
    assert.equal(resolveSpriteAsset('小林海斗', '喜悦', ctx, '默认').url, 'base-joy.png');
    assert.equal(resolveSpriteAsset('小林海斗', '喜悦', ctx, '不存在').url, 'base-joy.png');
    const legacy = resolveSpriteAsset('小林海斗', '喜悦', ctx);
    assert.deepEqual([legacy.url, legacy.source, 'outfit' in legacy], ['base-joy.png', 'user', false]);
});
