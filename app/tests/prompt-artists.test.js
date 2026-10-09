import test from 'node:test';
import assert from 'node:assert/strict';
import { kindArtist, normalizeArtistByKind, promptKindOf } from '../src/generated-images/prompt-artists.js';
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
    assert.equal(calls[0].slot.scene, 'artist:aaa, 1.2::artist:bbb::, artist:old, 1girl');
    assert.equal(calls[0].slot.sceneUc, 'lowres, bad hands');
    assert.equal(calls[0].settings.artistPrefix, '');
    assert.equal(calls[0].settings.negativePrompt, '');
    assert.ok(reports.some((t) => t.includes('拼到提示词前面')));
    await backend.generate({ scene: '1girl', sceneUc: '' }, { artistPrefix: 'artist:global' }, { imageKind: 'cg' });
    assert.equal(calls[1].settings.artistPrefix, 'artist:global');
    assert.equal(calls[1].slot.scene, '1girl');
});

test('gate: 数据库生图把分区画师串作为对象传入，不写进提示词', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const calls = [];
    const caption = {
        v4_prompt: { caption: { base_caption: 'artist:old, 1girl', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'bad hands', char_captions: [] } },
    };
    const globalObject = {
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        NaiDbGen: {
            async generateSinglePrompt() {
                return { ok: true, value: { caption } };
            },
            async generate(req) { calls.push(req); return { ok: true, value: [{ blob: new Blob([Uint8Array.from([1])], { type: 'image/png' }), mimeType: 'image/png' }] }; },
        },
    };
    const backend = createImageBackend({
        global: globalObject,
        getBridge: () => ({ imageApi: { mode: 'dbgen' }, autoIllustration: { nai: { artistByKind: conf } } }),
    });
    const sprite = await backend.generate({}, {}, { description: '画角色', promptKind: 'sprite' });
    assert.equal(sprite.ok, true);
    assert.equal(calls[0].caption.v4_prompt.caption.base_caption, 'artist:old, 1girl');
    assert.equal(calls[0].caption.v4_negative_prompt.caption.base_caption, 'bad hands');
    assert.deepEqual(calls[0].artist, { positivePrompt: 'artist:aaa, 1.2::artist:bbb::', negativePrompt: 'lowres' });
    calls.length = 0;
    const cg = await backend.generate({}, {}, { description: '画场景', promptKind: 'cg' });
    assert.equal(cg.ok, true);
    assert.equal(calls[0].artist, undefined);
    assert.equal(calls[0].caption.v4_prompt.caption.base_caption, 'artist:old, 1girl');
});

test('gate: 智绘姬和柏宝绘不改分区画师串，退回内置 NAI 才拼到前面', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const baibaiCalls = [];
    const baibai = createImageBackend({
        global: {
            STBaiBaiImage: {
                apiVersion: 1,
                getBackendStatus: () => ({ configured: true }),
                async generate(req) { baibaiCalls.push(req); return { dataUrl: 'data:image/png;base64,A' }; },
            },
        },
        getBridge: () => ({ imageApi: { mode: 'baibai' }, autoIllustration: { nai: { artistByKind: conf } } }),
    });
    const painted = await baibai.generate({ scene: 'artist:old, 1girl', sceneUc: 'bad hands' }, {}, { promptKind: 'sprite' });
    assert.equal(painted.ok, true);
    assert.equal(baibaiCalls[0].prompt, 'artist:old, 1girl');
    assert.equal(baibaiCalls[0].negative, 'bad hands');

    const prompts = [];
    const chatu8 = createImageBackend({
        getBridge: () => ({ imageApi: { mode: 'extension' }, autoIllustration: { nai: { artistByKind: conf } } }),
        chatu8: {
            findHost: () => ({ win: {}, eventSource: {} }),
            async request(_host, prompt) { prompts.push(prompt); return { ok: true, imageData: 'data:image/png;base64,C8' }; },
        },
    });
    const drawn = await chatu8.generate({ scene: 'artist:old, 1girl', sceneUc: 'bad hands' }, {}, { promptKind: 'sprite' });
    assert.equal(drawn.ok, true);
    assert.equal(prompts[0], 'artist:old, 1girl');

    const naiCalls = [];
    const fallback = createImageBackend({
        global: {
            STBaiBaiImage: {
                apiVersion: 1,
                getBackendStatus: () => ({ configured: true }),
                async generate() { throw new Error('boom'); },
            },
        },
        getBridge: () => ({ imageApi: { mode: 'baibai' }, autoIllustration: { nai: { apiKey: 'k', artistByKind: conf } } }),
        nai: { async generate(slot, settings) { naiCalls.push({ slot, settings }); return { ok: true, dataUrl: 'data:image/png;base64,NAI' }; } },
    });
    const recovered = await fallback.generate({ scene: '1girl', sceneUc: 'bad hands' }, { apiKey: 'k', artistPrefix: 'artist:global', negativePrompt: 'nsfw' }, { promptKind: 'sprite' });
    assert.equal(recovered.via, 'nai');
    assert.equal(naiCalls[0].slot.scene, 'artist:aaa, 1.2::artist:bbb::, 1girl');
    assert.equal(naiCalls[0].slot.sceneUc, 'lowres, bad hands');
    assert.equal(naiCalls[0].settings.artistPrefix, '');
    assert.equal(naiCalls[0].settings.negativePrompt, '');
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
