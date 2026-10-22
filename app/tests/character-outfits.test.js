import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeCharacterOutfits, normalizeWardrobe, resolveWardrobePrompt, isValidOutfitName, outfitNamesOf, resolveOutfitToken,
    createOutfitResolver, matchOutfitByText, buildOutfitGroupsText,
} from '../src/scene/character-outfits.js';

test('gate:outfits:normalize-drops-invalid-names-default-slot-and-proto-keys', () => {
    const raw = JSON.parse('{"小林":{"泳装":{"words":[" 泳衣 ","泳衣","a|b",""],"moods":{"默认":"x.png","喜悦":"e.png","__proto__":"p.png","害羞":3}},"默认":{"moods":{}},"a|b":{},"__proto__":{},"睡衣":{"words":["泳衣","睡裙"]}},"__proto__":{"x":{}},"空":[]}');
    const out = normalizeCharacterOutfits(raw);
    assert.deepEqual(Object.keys(out), ['小林']);
    assert.deepEqual(out['小林'], {
        泳装: { words: ['泳衣'], moods: { 喜悦: 'e.png' } },
        睡衣: { words: ['睡裙'], moods: {} },
    });
    assert.equal(isValidOutfitName('默认'), false);
    assert.equal(isValidOutfitName('原装'), false);
    assert.equal(isValidOutfitName('校服'), true);
});

test('gate:outfits:alias-reduces-to-main-name-and-words-resolve-outfit', () => {
    const sceneAssets = {
        characterAliases: { 小林海斗: ['小林'] },
        characterOutfits: { 小林海斗: { 泳装: { words: ['泳衣'], moods: {} }, 校服: { words: [], moods: {} } } },
    };
    assert.deepEqual(outfitNamesOf(sceneAssets.characterOutfits, sceneAssets.characterAliases, '小林'), ['泳装', '校服']);
    const resolve = createOutfitResolver(sceneAssets);
    assert.equal(resolve('小林', '泳衣'), '泳装');
    assert.equal(resolve('小林海斗', '校服'), '校服');
    assert.equal(resolve('小林海斗', '默认'), '默认');
    assert.equal(resolve('小林海斗', '原装'), '默认');
    assert.equal(resolve('小林海斗', '前半句'), '');
    assert.equal(resolve('路人', '泳装'), '');
    assert.equal(resolveOutfitToken({}, ''), '');
});
