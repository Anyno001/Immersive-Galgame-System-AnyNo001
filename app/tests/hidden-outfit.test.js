import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpriteOutfit, visibleCharacterOutfits, buildOutfitGroupsText } from '../src/scene/character-outfits.js';
import { readVisibleDefaultOutfit, resolveCharacterAppearance } from '../src/scene/character-appearance.js';
import { resolveSpriteAsset } from '../src/scene/asset-match.js';
import { effectiveSceneAssets } from '../src/scene/asset-scope.js';
import { renderCharacterSlotTabs } from '../src/visual/igs-ui/settings-outfit-fields.js';

const base = () => ({
    characters: { 小林: {} },
    characterOutfits: { 小林: {
        校服: { words: [], moods: { 平和: 'school.png' } },
        睡衣: { words: ['睡裙'], moods: { 平和: 'pajama.png' } },
    } },
    characterDefaultOutfits: { 小林: { version: 1, outfitName: '校服' } },
});

test('hidden-outfit:default-hidden-substitutes-next-visible-without-touching-record', () => {
    const assets = { ...base(), hiddenOutfits: { 小林: ['校服'] } };
    const shown = readVisibleDefaultOutfit(assets, '小林');
    assert.equal(shown.ok, true);
    assert.equal(shown.outfitName, '睡衣');
    assert.equal(assets.characterDefaultOutfits.小林.outfitName, '校服');
    const hit = resolveSpriteAsset('小林', '平和', { sceneAssets: assets });
    assert.equal(hit.url, 'pajama.png');
});

test('hidden-outfit:explicit-tag-for-hidden-outfit-falls-back-without-confirmation', () => {
    const assets = { ...base(), hiddenOutfits: { 小林: ['睡衣'] } };
    const picked = resolveCharacterAppearance({ characterKey: '小林', requestedOutfit: '睡衣', mood: '平和', sceneAssets: assets });
    assert.equal(picked.ok, true);
    assert.equal(picked.effectiveOutfit, '校服');
    assert.equal(picked.confirmationRequired, false);
    const traced = resolveSpriteOutfit({ directives: [{ type: 'char', character: '小林', outfit: '睡衣', offset: 0 }],
        character: '小林', offset: 10, sceneAssets: assets });
    assert.equal(traced.outfit, '');
    assert.equal(traced.source, 'reset');
});

test('hidden-outfit:all-hidden-falls-to-original-sprite', () => {
    const assets = { ...base(), characters: { 小林: { 平和: 'orig.png' } }, hiddenOutfits: { 小林: ['校服', '睡衣'] } };
    assert.equal(resolveSpriteAsset('小林', '平和', { sceneAssets: assets }).url, 'orig.png');
});

test('hidden-outfit:prompt-list-drops-hidden', () => {
    const assets = { ...base(), hiddenOutfits: { 小林: ['睡衣'] } };
    const text = buildOutfitGroupsText(visibleCharacterOutfits(assets, assets.characterOutfits));
    assert.match(text, /校服/);
    assert.doesNotMatch(text, /睡衣/);
});

test('hidden-outfit:scoped-per-card', () => {
    const root = { ...base(), cards: { 'card:A': { hiddenOutfits: { 小林: ['睡衣'] } }, 'card:B': {} } };
    assert.deepEqual(effectiveSceneAssets(root, 'card:A').hiddenOutfits, { 小林: ['睡衣'] });
    assert.deepEqual(effectiveSceneAssets(root, 'card:B').hiddenOutfits, {});
});

test('hidden-outfit:settings-tab-marks-hidden-and-offers-restore', () => {
    const assets = { ...base(), hiddenOutfits: { 小林: ['校服'] } };
    const html = renderCharacterSlotTabs({ charName: '小林', baseMoods: [], baseListHtml: '', outfits: assets.characterOutfits.小林,
        activeOutfit: '校服', sceneAssets: assets, icons: { trash: '' } });
    assert.match(html, /校服（本卡隐藏）/);
    assert.match(html, /睡衣（默认）/);
    assert.match(html, /在本卡恢复显示/);
});
