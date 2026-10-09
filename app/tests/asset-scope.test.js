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

test('把角色从全局收进角色卡后，素材跟着进卡，别的卡仍能借用', () => {
    const assets = {
        characters: { 小雪: { 默认: 'snow' } },
        characterAliases: { 小雪: ['雪'] },
        characterDna: { 小雪: { identity: '1girl' } },
        wardrobe: { 校服: { prompt: 'uniform' } },
    };
    assert.equal(moveLibraryEntry(assets, '', 'card:小雪', 'characters', '小雪').ok, true);
    assert.equal(assets.characters.小雪, undefined);
    assert.equal(assets.cards['card:小雪'].characters.小雪.默认, 'snow');
    assert.deepEqual(assets.cards['card:小雪'].characterAliases.小雪, ['雪']);
    const other = effectiveSceneAssets(assets, 'card:林');
    assert.equal(other.characters.小雪.默认, 'snow', '角色跟人走，别的卡直接用');
    const mine = effectiveSceneAssets(assets, 'card:小雪');
    assert.equal(mine.characters.小雪.默认, 'snow');
    assert.equal(mine.wardrobe.校服.prompt, 'uniform');
});

test('角色卡有世界观就用卡上的，没有就用全局', () => {
    const assets = {
        worldview: 'modern',
        ancient: false,
        cards: {
            'card:小雪': { worldview: 'ancient', ancient: true },
            'card:林': { scenes: { 教室: { url: 'room' } } },
        },
    };
    assert.equal(resolveWorldview(effectiveSceneAssets(assets, 'card:小雪')), 'ancient');
    assert.equal(resolveWorldview(effectiveSceneAssets(assets, 'card:林')), 'modern');
    assert.equal(assets.worldview, 'modern');
    assert.equal(libraryHasContent(assets.cards['card:小雪']), true);
    normalizeAssetCards(assets);
    assert.equal(assets.cards['card:小雪'].worldview, 'ancient');
    assert.equal(assets.cards['card:小雪'].ancient, true);
    assert.equal(assets.cards['card:林'].worldview, undefined);
});

test('旧的头像文件名资料会挪到角色卡名字下', () => {
    const assets = { cards: { 'card:xiaoxue.png': { characters: { 小雪: { 默认: 'snow' } } } } };
    assert.equal(relocateLegacyCard(assets, 'card:小雪', 'card:xiaoxue.png'), true);
    assert.equal(assets.cards['card:小雪'].characters.小雪.默认, 'snow');
    assert.equal(assets.cards['card:xiaoxue.png'], undefined);
    assets.cards['card:xiaoxue.png'] = { characters: { 小雪: { 默认: 'old' } } };
    assert.equal(relocateLegacyCard(assets, 'card:小雪', 'card:xiaoxue.png'), false);
    assert.equal(assets.cards['card:小雪'].characters.小雪.默认, 'snow');
});

test('在 A 卡建的角色和衣柜，B 卡直接能用；场景和事件 CG 不跨卡', () => {
    const assets = {
        cards: {
            'card:A': {
                scenes: { 教室: { url: 'a-room' } },
                characters: { 五条悟: { 默认: 'gojo' } },
                characterAliases: { 五条悟: ['悟'] },
                characterDna: { 五条悟: { identity: '1boy' } },
                characterOutfits: { 五条悟: { 制服: { words: ['制服'] } } },
                wardrobe: { 眼罩: { prompt: 'blindfold' } },
                eventCgs: { 初遇: { url: 'cg' } },
                generated: { scenes: {}, characters: {}, characterAliases: {}, expressionNotes: { 五条悟: '轻佻' } },
            },
        },
    };
    const b = effectiveSceneAssets(assets, 'card:B');
    assert.equal(b.characters.五条悟.默认, 'gojo');
    assert.deepEqual(b.characterAliases.五条悟, ['悟']);
    assert.equal(b.characterDna.五条悟.identity, '1boy');
    assert.ok(b.characterOutfits.五条悟.制服);
    assert.equal(b.wardrobe.眼罩.prompt, 'blindfold');
    assert.equal(b.generated.expressionNotes.五条悟, '轻佻');
    assert.equal(b.scenes.教室, undefined, '场景属于那张卡的世界');
    assert.equal(b.eventCgs.初遇, undefined);
});

test('同名角色：本卡优先，其次全局，最后才借别的卡（后建的卡为准）', () => {
    const assets = {
        characters: { 莉莉: { 默认: 'global-lily' } },
        cards: {
            'card:旧': { characters: { 五条悟: { 默认: 'old' } } },
            'card:新': { characters: { 五条悟: { 默认: 'new' }, 莉莉: { 默认: 'new-lily' } } },
            'card:我': { characters: { 莉莉: { 默认: 'mine' } } },
        },
    };
    const mine = effectiveSceneAssets(assets, 'card:我');
    assert.equal(mine.characters.莉莉.默认, 'mine');
    assert.equal(mine.characters.五条悟.默认, 'new');
    assert.equal(effectiveSceneAssets(assets, 'card:空').characters.莉莉.默认, 'global-lily');
    assert.equal(effectiveSceneAssets(assets, '').characters.五条悟, undefined, '没开卡时只看全局');
});

test('改借来的角色写回原来那张卡，不在本卡另起一份', () => {
    const root = { cards: { 'card:A': { characters: { 五条悟: { 默认: 'gojo' } } } } };
    assert.equal(assetOwnerKey(root, 'card:B', ['characters'], '五条悟'), 'card:A');
    assert.equal(assetOwnerKey(root, 'card:B', ['scenes'], '五条悟'), 'card:B', '场景不借，新建进本卡');
    assert.equal(assetOwnerKey(root, 'card:B', ['characters'], '夏油'), 'card:B');
    const settingsState = { draft: { bridge: { sceneAssets: root } }, asyncState: { assetScopeKey: 'card:B' } };
    const lib = draftAssetLibrary(settingsState, { collections: ['characters'], name: '五条悟' });
    lib.characters.五条悟.开心 = 'smile';
    assert.equal(root.cards['card:A'].characters.五条悟.开心, 'smile');
    assert.equal(root.cards['card:B'], undefined);
});
