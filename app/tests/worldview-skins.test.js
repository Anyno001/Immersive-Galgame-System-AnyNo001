import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDVIEWS } from '../src/scene/worldview.js';
import { effectiveSceneAssets, libraryHasContent, normalizeAssetCards } from '../src/scene/asset-scope.js';
import { ILLUSTRATED_DIALOG_SKINS, normalizeDialogSkin } from '../src/visual/igs-ui/classic-dialog-skin.js';
import { DIALOG_SKIN_CHOICES, dialogSkinLabel } from '../src/visual/igs-ui/dialog-skin-catalog.js';
import { WORLDVIEW_DIALOG_SKINS, effectiveDialogSkin, pickWorldviewDialogSkin, worldviewDialogSkins } from '../src/visual/igs-ui/worldview-skins.js';
import { normalizeReaderSettings } from '../src/visual/igs-ui/settings-host-normalize.js';

test('gate:dialog-skin-catalog:lists-every-skin-once-with-a-label', () => {
    const ids = DIALOG_SKIN_CHOICES.map(([id]) => id);
    assert.equal(new Set(ids).size, ids.length);
    for (const skin of ['default', 'western-classic', 'gradient-veil', ...ILLUSTRATED_DIALOG_SKINS]) {
        assert.ok(ids.includes(skin), skin);
    }
    for (const [id, label] of DIALOG_SKIN_CHOICES) {
        assert.equal(normalizeDialogSkin(id), id, id);
        assert.ok(label && dialogSkinLabel(id) === label, id);
    }
    assert.equal(dialogSkinLabel('bogus'), '默认');
});

test('gate:worldview-skins:every-worldview-has-valid-recommended-skins', () => {
    for (const { id } of WORLDVIEWS) {
        const list = WORLDVIEW_DIALOG_SKINS[id];
        assert.ok(Array.isArray(list) && list.length > 0, id);
        for (const skin of list) assert.equal(normalizeDialogSkin(skin), skin, `${id} → ${skin}`);
        assert.deepEqual(worldviewDialogSkins(id), list);
    }
    assert.equal(worldviewDialogSkins('modern')[0], 'default', '现代默认仍是默认皮肤，老用户不选也不变样');
    assert.deepEqual(worldviewDialogSkins('bogus'), WORLDVIEW_DIALOG_SKINS.modern);
});

test('gate:worldview-skins:preselect-prefers-card-then-global-then-table', () => {
    assert.equal(pickWorldviewDialogSkin('ancient'), 'qinglv-shanshui');
    assert.equal(pickWorldviewDialogSkin('fantasy', { cardSkin: 'western-classic', globalSkin: 'fairy-tale' }), 'western-classic');
    assert.equal(pickWorldviewDialogSkin('fantasy', { cardSkin: 'qinglv-shanshui', globalSkin: 'fairy-tale' }), 'fairy-tale', '卡上记的不属于这个世界观时不硬套');
    assert.equal(pickWorldviewDialogSkin('modern', { globalSkin: 'cute-pink' }), 'cute-pink');
    assert.equal(pickWorldviewDialogSkin('modern', { globalSkin: 'default' }), 'default');
    assert.equal(pickWorldviewDialogSkin('ancient', { globalSkin: 'default' }), 'qinglv-shanshui', '全局是默认皮肤时古代仍换成青绿山水');
    assert.equal(pickWorldviewDialogSkin('scifi', { globalSkin: 'default' }), 'scifi-holo', '全局是默认皮肤时科幻换成全息终端');
    assert.equal(pickWorldviewDialogSkin('apocalypse', { globalSkin: 'default' }), 'wasteland-rust', '全局是默认皮肤时末日换成废土锈铁');
    assert.equal(pickWorldviewDialogSkin('horror', { horrorStyle: 'psych' }), 'horror-psych');
    assert.equal(pickWorldviewDialogSkin('horror', { horrorStyle: 'gore' }), 'horror-gore');
    assert.equal(pickWorldviewDialogSkin('horror', { cardSkin: 'horror-gore', horrorStyle: 'psych' }), 'horror-gore');
});

test('gate:worldview-skins:card-skin-overrides-global-only-for-that-card', () => {
    const root = {
        worldview: 'modern',
        cards: {
            'card:甲': { worldview: 'fantasy', dialogSkin: 'elegant-european' },
            'card:乙': { scenes: { 教室: 'a.png' } },
        },
    };
    const a = effectiveSceneAssets(root, 'card:甲');
    const b = effectiveSceneAssets(root, 'card:乙');
    assert.equal(a.dialogSkin, 'elegant-european');
    assert.equal(b.dialogSkin, undefined);
    assert.equal(effectiveDialogSkin('cute-pink', a), 'elegant-european');
    assert.equal(effectiveDialogSkin('cute-pink', b), 'cute-pink');
    assert.equal(effectiveDialogSkin('cute-pink', { dialogSkin: 'bogus' }), 'default', '卡上存了不认识的皮肤按默认，不回落到别的卡');
    assert.equal(effectiveDialogSkin(undefined, null), 'default');
});

test('gate:worldview-skins:card-skin-survives-normalize-and-counts-as-content', () => {
    const root = { cards: { 'card:甲': { dialogSkin: ' retro-japanese ' }, 'card:乙': { dialogSkin: '' } } };
    assert.equal(libraryHasContent(root.cards['card:甲']), true);
    assert.equal(libraryHasContent(root.cards['card:乙']), false);
    normalizeAssetCards(root);
    assert.equal(root.cards['card:甲'].dialogSkin, 'retro-japanese');
    assert.equal(Object.hasOwn(root.cards['card:乙'], 'dialogSkin'), false);
});

test('gate:title-screen:setting-defaults-on-and-keeps-off', () => {
    assert.equal(normalizeReaderSettings({}).titleScreen, true);
    assert.equal(normalizeReaderSettings({ titleScreen: false }).titleScreen, false);
});
