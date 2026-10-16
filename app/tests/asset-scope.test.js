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

test('角色首次采用标记随卡保存、借用和移动，主动清空后仍不被生成覆盖', async () => {
    const { adoptSpriteIdentity } = await import('../src/scene/character-identity.js');
    const dna = { identity: '', defaultAppearance: 'legacy coat', negative: '', triggerWords: '', identityInitialized: true, identitySource: 'sprite-a' };
    const root = { cards: { 'card:A': { characters: { Alice: { 默认: 'sprite-a' } }, characterDna: { Alice: dna } } } };
    const saved = JSON.parse(JSON.stringify(root));
    normalizeAssetCards(saved);
    assert.deepEqual(saved.cards['card:A'].characterDna.Alice, dna);
    assert.deepEqual(effectiveSceneAssets(saved, 'card:B').characterDna.Alice, dna);
    assert.equal(moveLibraryEntry(saved, 'card:A', 'card:C', 'characters', 'Alice').ok, true);
    const assets = effectiveSceneAssets(saved, 'card:C');
    assert.deepEqual(assets.characterDna.Alice, dna);
    const adopted = adoptSpriteIdentity(assets, 'Alice', 'sprite-new', { characters: [{ characterKey: 'Alice', identityAnchor: 'New identity.' }] });
    assert.deepEqual(adopted.characterDna.Alice, dna);
});


test('新默认映射随所属角色库保存和移动，同名旧角色不借用其他库默认', () => {
    const root = { characters: { Alice: {} }, characterDefaultOutfits: { Alice: { version: 1, outfitName: '制服' } },
        characterSeeds: { Alice: 0 },

        characterOutfits: { Alice: { 制服: { moods: { 平和: 'uniform.png' } } } },
        cards: { 'card:local': { characters: { Alice: { 默认: 'old.png' } } } } };
    const before = structuredClone(root);
    assert.equal(effectiveSceneAssets(root, 'card:local').characterDefaultOutfits.Alice, undefined);
    assert.equal(effectiveSceneAssets(root, 'card:local').characterSeeds.Alice, undefined);
    assert.equal(effectiveSceneAssets(root, 'card:other').characterSeeds.Alice, 0);
    assert.deepEqual(effectiveSceneAssets(root, 'card:other').characterDefaultOutfits.Alice, root.characterDefaultOutfits.Alice);
    assert.deepEqual(root, before);
    normalizeAssetCards(root);
    assert.equal(Object.hasOwn(root.cards['card:local'], 'characterDefaultOutfits'), false);
    assert.equal(moveLibraryEntry(root, '', 'card:new', 'characters', 'Alice').ok, true);
    assert.equal(root.characterDefaultOutfits.Alice, undefined);
    assert.equal(root.cards['card:new'].characterDefaultOutfits.Alice.outfitName, '制服');
    assert.equal(root.cards['card:new'].characterSeeds.Alice, 0);
    assert.equal(root.characterSeeds.Alice, undefined);
    normalizeAssetCards(root);
    assert.equal(root.cards['card:new'].characterSeeds.Alice, 0);
});

test('新默认映射经过设置存储与预设往返保留，旧档不自动补字段', async () => {
    const { normalizeSceneAssets } = await import('../src/visual/igs-ui/settings-host-normalize.js');
    const { presetFromAssets, legacyPresetToPack } = await import('../src/scene/legacy-preset.js');
    const { writeLegacyIgsSettings, readLegacyIgsSettings } = await import('../src/storage/legacy-igs.js');
    const { buildSettingsExport, parseSettingsImport } = await import('../src/visual/igs-ui/settings-sections.js');
    const old = { characters: { Alice: { 默认: 'old.png' } }, characterDna: { Alice: {
        identity: '', defaultAppearance: 'legacy coat', negative: '', triggerWords: '', identityInitialized: true,
    } }, characterOutfits: { Alice: { 制服: { words: [], moods: { 平和: 'uniform.png' }, default: true } } } };
    const normalized = normalizeSceneAssets(old);
    assert.equal(Object.hasOwn(normalized, 'characterDefaultOutfits'), false);
    assert.equal(Object.hasOwn(normalized, 'characterSeeds'), false);
    assert.equal(normalized.characterDna.Alice.defaultAppearance, 'legacy coat');
    const current = { ...normalized, characterSeeds: { Alice: 4294967295 }, characterDefaultOutfits: { Alice: { version: 1, outfitName: '制服' },
        Future: { version: 9, outfitName: '保留' } } };
    const roundtrip = legacyPresetToPack(presetFromAssets(current)).library;
    assert.deepEqual(roundtrip.characterDefaultOutfits, current.characterDefaultOutfits);
    assert.deepEqual(roundtrip.characterSeeds, current.characterSeeds);
    assert.equal(Object.hasOwn(legacyPresetToPack(presetFromAssets(normalized)).library, 'characterDefaultOutfits'), false);
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const bridge = { sceneAssets: { ...current, generated: { expressionNotes: { note: 'discardable' } } } };
    assert.equal(writeLegacyIgsSettings(storage, { bridge }).ok, true);
    const restored = readLegacyIgsSettings(storage).bridge.sceneAssets;
    assert.deepEqual(restored.characterDefaultOutfits, current.characterDefaultOutfits);
    assert.equal(restored.characterDna.Alice.defaultAppearance, 'legacy coat');
    const exported = buildSettingsExport({ bridge });
    assert.equal(Object.hasOwn(exported.bridge.sceneAssets, 'characterDefaultOutfits'), false);
    assert.deepEqual(parseSettingsImport(exported, { bridge }).bridge.sceneAssets.characterDefaultOutfits, current.characterDefaultOutfits);
});

test('移动或复制角色带走衣装续画键且不改历史生成证据', () => {
    for (const copy of [false, true]) {
        const note = { 喜悦: { positive: 'pending', outfitContext: [{ characterKey: 'Alice' }] } };
        const root = { characters: { Alice: {} }, characterDefaultOutfits: { Alice: { version: 1, outfitName: '制服' } },
            characterOutfits: { Alice: { 制服: { moods: { 平和: 'sprite' } } } },
            generated: { expressionNotes: { 'Alice\u0001制服': note, 'Alice2\u0001制服': { 喜悦: { positive: 'other' } } } } };
        assert.equal(moveLibraryEntry(root, '', 'card:A', 'characters', 'Alice', { copy }).ok, true);
        const card = root.cards['card:A'];
        assert.deepEqual(card.generated.expressionNotes['Alice\u0001制服'], note);
        assert.equal(Boolean(root.generated.expressionNotes['Alice\u0001制服']), copy);
        assert.equal(root.generated.expressionNotes['Alice2\u0001制服'].喜悦.positive, 'other');
        assert.equal(card.characterDefaultOutfits.Alice.outfitName, '制服');
        if (copy) assert.notEqual(card.generated.expressionNotes['Alice\u0001制服'], note);
    }
});


test('gate:seed:角色别名与CG本图顺序选种，缺种子不建档', async () => {
    const { cgGenerationSeed, characterGenerationSeed, adoptCharacterSeed } = await import('../src/scene/generation-seeds.js');
    const assets = { characters: { Alice: {}, Bob: {}, Legacy: {} }, characterAliases: { Alice: ['爱丽丝'] },
        characterSeeds: { Alice: 0, Bob: 42 } };
    const before = structuredClone(assets);
    const record = { promptRecipe: { bindings: [
        { kind: 'named', characterKey: 'Bob', captionIndex: 2 },
        { kind: 'named', characterKey: 'Legacy', captionIndex: 0 },
        { kind: 'named', characterKey: '爱丽丝', captionIndex: 1 },
    ] } };
    assert.equal(characterGenerationSeed(assets, '爱丽丝'), 0);
    assert.equal(cgGenerationSeed(record, assets), 0);
    assert.equal(cgGenerationSeed({ characterMeta: { characters: [
        { characterKey: 'Bob', captionIndex: 0 }, { characterKey: 'Alice', captionIndex: 1 },
    ] } }, assets), 42);
    assert.equal(cgGenerationSeed({ characterContext: [{ characterKey: 'Alice' }] }, assets), undefined);
    assert.equal(cgGenerationSeed({ characterMeta: { characters: [{ characterKey: 'Legacy', captionIndex: 0 }] } }, assets), undefined);
    assert.deepEqual(adoptCharacterSeed(assets, 'Alice', 99), {});
    assert.deepEqual(adoptCharacterSeed(assets, 'Legacy', undefined), {});
    assert.deepEqual(adoptCharacterSeed(assets, 'Legacy', 7).characterSeeds, { Alice: 0, Bob: 42, Legacy: 7 });
    assert.deepEqual(assets, before);
});
