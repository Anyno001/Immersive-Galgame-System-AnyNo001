import assert from 'node:assert/strict';
import test from 'node:test';
import { assetOwnerKey, draftAssetLibrary, effectiveSceneAssets, ensureCardLibrary, libraryHasContent, moveLibraryEntry, normalizeAssetCards, relocateLegacyCard, resolveAssetScope } from '../src/scene/asset-scope.js';
import { resolveWorldview } from '../src/scene/worldview.js';

test('角色卡范围用角色卡名字，群聊用群 id', () => {
    assert.equal(resolveAssetScope(null).key, '');
    const scope = resolveAssetScope({
        characterId: 0,
        characters: [{ name: '小雪', avatar: 'xiaoxue.png' }],
        name2: '小雪',
    });
    assert.equal(scope.key, 'card:小雪');
    assert.equal(scope.legacyKey, 'card:xiaoxue.png');
    assert.equal(resolveAssetScope({
        groupId: 'g1',
        groups: [{ id: 'g1', name: '宿舍' }],
        characterId: 0,
        characters: [{ name: '小雪', avatar: 'xiaoxue.png' }],
    }).key, 'group:g1');
});

test('角色卡同名资料盖住全局，卡里没有的名字仍用全局', () => {
    const assets = {
        scenes: { 教室: { url: 'global-room' }, 街道: { url: 'global-street' } },
        characters: { 小雪: { 默认: 'global-snow' }, 林: { 默认: 'global-lin' } },
        wardrobe: { 校服: { prompt: 'global' }, 睡衣: { prompt: 'sleep' } },
        generated: { scenes: { 教室: { url: 'gen-room' } }, characters: {}, characterAliases: {}, expressionNotes: {} },
    };
    const card = ensureCardLibrary(assets, 'card:小雪');
    card.scenes = { 教室: { url: 'card-room' } };
    card.characters = { 小雪: { 默认: 'card-snow' } };
    card.wardrobe = { 校服: { prompt: 'card' } };
    card.generated = { scenes: { 天台: { url: 'card-roof' } }, characters: {}, characterAliases: {}, expressionNotes: {} };
    const effective = effectiveSceneAssets(assets, 'card:小雪');
    assert.equal(effective.scenes.教室.url, 'card-room');
    assert.equal(effective.scenes.街道.url, 'global-street');
    assert.equal(effective.characters.小雪.默认, 'card-snow');
    assert.equal(effective.characters.林.默认, 'global-lin');
    assert.equal(effective.wardrobe.校服.prompt, 'card');
    assert.equal(effective.wardrobe.睡衣.prompt, 'sleep');
    assert.equal(effective.generated.scenes.天台.url, 'card-roof');
    assert.equal(effective.generated.scenes.教室.url, 'gen-room');
    assert.equal(effective.cards, undefined);
    assert.equal(effectiveSceneAssets(assets, '').scenes.教室.url, 'global-room');
    assert.equal(assets.scenes.教室.url, 'global-room');
});
