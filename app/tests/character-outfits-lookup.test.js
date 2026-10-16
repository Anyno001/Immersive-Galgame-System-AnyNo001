import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpriteAsset } from '../src/scene/asset-match.js';

const sceneAssets = {
    characters: { 小林海斗: { 默认: 'base.png', 喜悦: 'base-joy.png' } },
    characterAliases: { 小林海斗: ['小林'] },
    characterDefaultOutfits: { 小林海斗: { version: 1, outfitName: '泳装' } },
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
    // 服装缺这一格：用这一套的「平和」，不闪回原装的衣服；整套没图才回角色默认立绘。
    const missingMood = resolveSpriteAsset('小林海斗', '害羞', ctx, '泳装');
    assert.deepEqual([missingMood.url, missingMood.source, missingMood.slot, missingMood.outfit], ['swim-calm.png', 'user-outfit', '平和', '泳装']);
    const noBase = { ...ctx, sceneAssets: { ...ctx.sceneAssets, characters: { 小林海斗: { 喜悦: 'base-joy.png' } } } };
    assert.deepEqual(resolveSpriteAsset('小林海斗', '害羞', noBase, '泳装').url, 'swim-calm.png');
    assert.equal(resolveSpriteAsset('小林海斗', '平和', ctx, '睡衣').url, 'sleep-default.png');
    assert.equal(resolveSpriteAsset('小林海斗', '喜悦', ctx, '默认').url, 'swim-joy.png');
    const unknown = resolveSpriteAsset('小林海斗', '喜悦', ctx, '不存在');
    assert.deepEqual([unknown.url, unknown.requestedOutfit, unknown.outfit, unknown.source, unknown.fallbackReason],
        ['swim-joy.png', '不存在', '泳装', 'user-default-outfit', 'outfit-unregistered']);
    const nudeCtx = {
        sceneAssets: {
            ...sceneAssets,
            characterOutfits: {
                小林海斗: { 日常: { words: [], moods: {}, wardrobe: '裸体', base: 'nude.png' } },
            },
        },
    };
    assert.equal(resolveSpriteAsset('小林海斗', '害羞', nudeCtx, '日常').url, 'nude.png');
    const legacy = resolveSpriteAsset('小林海斗', '喜悦', ctx);
    assert.deepEqual([legacy.url, legacy.source, legacy.outfit], ['swim-joy.png', 'user-default-outfit', '泳装']);
});


import { readDefaultOutfit, prepareDefaultOutfitSelection, prepareInitialDefaultOutfitSelection, resolveCharacterAppearance } from '../src/scene/character-appearance.js';

const appearanceAssets = () => ({
    characters: { Alice: { 默认: 'old.png' } },
    characterAliases: { Alice: ['艾莉'] },
    characterDna: { Alice: { defaultAppearance: 'legacy clothes' } },
    characterOutfits: { Alice: {
        制服: { default: true, wardrobe: 'uniform', moods: { 平和: 'uniform.png', 喜悦: 'smile.png' } },
        战斗服: { wardrobe: 'combat', moods: {} },
        礼服: { wardrobe: 'dress', moods: { 平和: 'dress.png' } },
    } },
    wardrobe: { uniform: { prompt: 'blue uniform' }, combat: { prompt: 'combat suit' }, dress: { prompt: 'red dress' } },
});
const available = () => ({ status: 'available', revision: 1 });

test('默认衣装只由明确选择建立，旧图与旧字段不隐式建档', () => {
    const assets = appearanceAssets(), original = structuredClone(assets);
    assert.equal(readDefaultOutfit(assets, 'Alice').reason, 'default-outfit-unset');
    assert.equal(resolveCharacterAppearance({ characterKey: 'Alice', sceneAssets: assets }).reason, 'default-outfit-unset');
    assert.equal(prepareDefaultOutfitSelection(assets, 'Alice', '制服').reason, 'default-outfit-unverified');
    const selection = prepareDefaultOutfitSelection(assets, '艾莉', '制服', available);
    assert.equal(selection.ok, true);
    assert.deepEqual(assets, original);
    Object.assign(assets, selection.patch);
    assert.equal(readDefaultOutfit(assets, 'Alice').outfitName, '制服');
    assert.equal(assets.characterDna.Alice.defaultAppearance, 'legacy clothes');
});

test('新立绘保存事件只在无默认且图片已核验时建立默认', () => {
    const assets = appearanceAssets(), before = structuredClone(assets);
    assert.equal(prepareInitialDefaultOutfitSelection(assets, 'Alice', '礼服').ok, false);
    assert.deepEqual(assets, before);
    const initial = prepareInitialDefaultOutfitSelection(assets, '艾莉', '礼服', available);
    assert.equal(initial.ok, true);
    assert.deepEqual(assets, before, '准备补丁不修改原资料');
    Object.assign(assets, initial.patch);
    assert.equal(readDefaultOutfit(assets, 'Alice').outfitName, '礼服');
    assert.deepEqual(prepareInitialDefaultOutfitSelection(assets, 'Alice', '制服', available),
        { ok: true, patch: {} }, '保留已有默认');
    assets.characterDefaultOutfits.Alice = { version: 9, outfitName: '制服' };
    assert.equal(prepareInitialDefaultOutfitSelection(assets, 'Alice', '礼服', available).reason,
        'default-outfit-invalid');
    assets.characterDefaultOutfits.Alice = { version: 1, outfitName: '已移除衣装' };
    assert.equal(prepareInitialDefaultOutfitSelection(assets, 'Alice', '礼服', available).reason,
        'default-outfit-missing');
    assert.equal(assets.characterDefaultOutfits.Alice.outfitName, '已移除衣装');
});

test('缺单个表情不换衣，整套缺图才把图和衣装DNA一起回退', () => {
    const assets = appearanceAssets();
    Object.assign(assets, prepareDefaultOutfitSelection(assets, 'Alice', '制服', available).patch);
    const resolve = requestedOutfit => resolveCharacterAppearance({ characterKey: 'Alice',
        requestedOutfit, mood: '害羞', purpose: 'consistency', sceneAssets: assets, imageAvailability: available });
    const dress = resolve('礼服');
    assert.equal(dress.effectiveOutfit, '礼服');
    assert.equal(dress.spriteImage.url, 'dress.png');
    assert.equal(dress.confirmationRequired, false);
    const fallback = resolve('战斗服');
    assert.equal(fallback.effectiveOutfit, '制服');
    assert.equal(fallback.outfitDescription, 'blue uniform');
    assert.equal(fallback.referenceImage.url, 'uniform.png');
    assert.equal(fallback.confirmationRequired, true);
    assert.equal(fallback.requestedOutfit, '战斗服');
    assert.equal(assets.characterOutfits.Alice.战斗服.wardrobe, 'combat');
});


test('读取错误不当缺图换衣，无默认与未知版本保留准确原因', () => {
    const assets = appearanceAssets();
    Object.assign(assets, prepareDefaultOutfitSelection(assets, 'Alice', '制服', available).patch);
    const resolve = status => resolveCharacterAppearance({ characterKey: 'Alice', requestedOutfit: '礼服',
        sceneAssets: assets, imageAvailability: url => url === 'dress.png' ? { status } : available() });
    assert.equal(resolve('read-error').reason, 'outfit-image-read-error');
    assert.equal(resolve('loading').reason, 'outfit-image-pending');
    assert.equal(resolve('missing').confirmationRequired, true);
    assets.characterDefaultOutfits.Alice = { version: 9, outfitName: '制服' };
    assert.equal(readDefaultOutfit(assets, 'Alice').reason, 'default-outfit-invalid');
    assert.equal(assets.characterDefaultOutfits.Alice.version, 9);
    assets.characterOutfits.Alice.静物 = { moods: {}, avatar: 'face.png', wardrobe: 'static' };
    assets.wardrobe.static = { prompt: 'coat', reference: 'igs-gen:static' };
    assert.equal(prepareDefaultOutfitSelection(assets, 'Alice', '静物', available).reason, 'outfit-image-empty');
});

test('可用图优先于未验证图，同衣装坏图不遮挡其余可用图', () => {
    const assets = appearanceAssets();
    const select = prepareDefaultOutfitSelection(assets, 'Alice', '制服', url =>
        url === 'smile.png' ? available() : { status: 'unverified' });
    assert.equal(select.ok, true);
    const result = resolveCharacterAppearance({ characterKey: 'Alice', requestedOutfit: '制服', mood: '平和',
        sceneAssets: assets, imageAvailability: url => url === 'uniform.png' ? 'missing' : 'available' });
    assert.equal(result.spriteImage.url, 'smile.png');
    assert.equal(result.confirmationRequired, false);
});
