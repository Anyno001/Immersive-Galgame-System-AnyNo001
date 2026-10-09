import test from 'node:test';
import assert from 'node:assert/strict';
import { kindArtist, normalizeArtistByKind, promptKindOf, replaceArtist, stripArtistTags } from '../src/generated-images/prompt-artists.js';
import { BUILTIN_PROMPTS } from '../src/generated-images/prompt-registry.js';
import { DEFAULT_ASSET_TEMPLATES } from '../src/generated-images/illustration/prompt-kit.js';

const conf = { enabled: true, kinds: { sprite: { positive: 'artist:aaa, 1.2::artist:bbb::', negative: 'lowres' }, cg: { positive: '', negative: '' } } };

test('gate: 分区画师串开关关着或这一类留空时退回全局', () => {
    assert.equal(kindArtist({ ...conf, enabled: false }, { promptKind: 'sprite' }), null);
    assert.equal(kindArtist(conf, { imageKind: 'cg' }), null);
    assert.deepEqual(kindArtist(conf, { promptKind: 'sprite' }), { positive: 'artist:aaa, 1.2::artist:bbb::', negative: 'lowres' });
});

test('gate: promptKind 优先于 imageKind，未知类别按 CG', () => {
    assert.equal(promptKindOf({ promptKind: 'avatar', imageKind: 'sprite' }), 'avatar');
    assert.equal(promptKindOf({ imageKind: 'background' }), 'background');
    assert.equal(promptKindOf({ promptKind: 'nope' }), 'cg');
});

test('gate: 只摘 artist: 写法的画师标签，再把这一类的放最前', () => {
    const r = stripArtistTags('1girl, artist:foo, {artist:bar}, 0.8::artist:baz::, (artist:qux:1.1), smile, wlop');
    assert.deepEqual(r.removed, ['artist:foo', '{artist:bar}', '0.8::artist:baz::', '(artist:qux:1.1)']);
    assert.equal(r.text, '1girl, smile, wlop');
    assert.equal(replaceArtist('artist:old, 1girl', 'artist:new').text, 'artist:new, 1girl');
});

test('gate: 分区画师串设置补齐八类且默认关', () => {
    const n = normalizeArtistByKind(null);
    assert.equal(n.enabled, false);
    assert.deepEqual(Object.keys(n.kinds), ['sprite', 'expression', 'avatar', 'wardrobe', 'background', 'item', 'cg', 'nsfwCg']);
});

test('gate: 内置模板来自 IGS 自带词库', () => {
    assert.equal(DEFAULT_ASSET_TEMPLATES.sprite, BUILTIN_PROMPTS.sprite.positive);
    assert.equal(DEFAULT_ASSET_TEMPLATES.backgroundNegative, BUILTIN_PROMPTS.background.negative);
});

test('gate: 出图入口按类别换画师串，内置 NAI 全局串让位', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const calls = [];
    const reports = [];
    const backend = createImageBackend({
        getBridge: () => ({ imageApi: { mode: 'nai' }, autoIllustration: { nai: { artistByKind: conf } } }),
        nai: { async generate(slot, settings) { calls.push({ slot, settings }); return { ok: true, dataUrl: 'data:image/png;base64,A' }; } },
        report: (level, text) => reports.push(text),
    });
    await backend.generate({ scene: 'artist:old, 1girl', sceneUc: 'bad hands' }, { artistPrefix: 'artist:global', negativePrompt: 'nsfw' }, { promptKind: 'sprite' });
    assert.equal(calls[0].slot.scene, 'artist:aaa, 1.2::artist:bbb::, 1girl');
    assert.equal(calls[0].slot.sceneUc, 'lowres, bad hands');
    assert.equal(calls[0].settings.artistPrefix, '');
    assert.equal(calls[0].settings.negativePrompt, '');
    assert.ok(reports.some((t) => t.includes('摘掉 artist:old')));
    await backend.generate({ scene: '1girl', sceneUc: '' }, { artistPrefix: 'artist:global' }, { imageKind: 'cg' });
    assert.equal(calls[1].settings.artistPrefix, 'artist:global');
    assert.equal(calls[1].slot.scene, '1girl');
});

test('gate: 变身形态三栏：年龄档补标签、徽章区分性转 / 年龄 / 其他', async () => {
    const { normalizeOutfitForm } = await import('../src/scene/character-outfits.js');
    const { expressionPaintDna } = await import('../src/generated-images/dbgen-prompt.js');
    assert.deepEqual(normalizeOutfitForm({ gender: 'female', age: 'child', note: ' 兽耳 ' }), { gender: 'female', age: 'child', note: '兽耳' });
    assert.deepEqual(normalizeOutfitForm({ gender: 'x', age: 'baby' }), { gender: '' });
    const dna = { identity: 'a', defaultAppearance: 'b', triggerWords: '1boy, adult, red eyes' };
    assert.equal(expressionPaintDna(dna, { form: { gender: 'female', age: 'teen' } }).triggerWords, '1girl, teenager, red eyes');
    const { renderCharacterSlotTabs } = await import('../src/visual/igs-ui/settings-outfit-fields.js');
    const html = renderCharacterSlotTabs({ charName: 'A', baseMoods: [], baseListHtml: '', outfits: { 猫: { moods: {}, form: { gender: 'male', age: 'elder', note: '猫化' } } }, activeOutfit: '', sceneAssets: {}, icons: {}, expressionNotes: {}, resolveUrl: (u) => u });
    for (const kind of ['is-sex', 'is-age', 'is-other']) assert.match(html, new RegExp(`igs-form-badge ${kind}`));
});

test('gate: 没变身的服装下拉显示「不是变身」', async () => {
    const { renderCharacterSlotTabs } = await import('../src/visual/igs-ui/settings-outfit-fields.js');
    const html = renderCharacterSlotTabs({ charName: 'A', baseMoods: [], baseListHtml: '', outfits: { 泳装: { moods: {} } }, activeOutfit: '泳装', sceneAssets: {}, icons: {}, expressionNotes: {}, resolveUrl: (u) => u, isOpen: () => true });
    assert.match(html, /<option value=""selected>不是变身|<option value="" selected>不是变身/);
    assert.doesNotMatch(html, /igs-form-badge/);
});
