import test from 'node:test';
import assert from 'node:assert/strict';
import { kindArtist, normalizeArtistByKind, promptKindOf } from '../src/generated-images/prompt-artists.js';
import { BUILTIN_PROMPTS } from '../src/generated-images/prompt-registry.js';
import { DEFAULT_ASSET_TEMPLATES } from '../src/generated-images/illustration/prompt-kit.js';

const conf = { enabled: true, kinds: { sprite: { positive: 'artist:aaa, 1.2::artist:bbb::', negative: 'lowres' }, cg: { positive: '', negative: '' } } };

for (const sourceMode of ['nai', 'dbgen']) for (const target of ['global', 'sprite']) test(`画师下拉直接生效：${sourceMode}选择${target}后不关闭设置即生成立绘`, { timeout: 10000 }, async t => {
    const { bootstrapIGS, createMemoryStorage } = await import('../src/index.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const { spriteDataReply } = await import('./helpers/prompt-provenance.js');
    const { pngFixture } = await import('./helpers/png-fixture.js');
    const wires = [];
    const pluginCaption = {
        v4_prompt: { caption: { base_caption: '1girl, blue dress', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'bad hands', char_captions: [] } },
    };
    const global = { localStorage: createMemoryStorage(), btoa, alert() {}, confirm() { return true; }, prompt() { return ''; },
        Image: class { set src(value) { if (value) { this.naturalWidth = 32; this.naturalHeight = 48; queueMicrotask(() => this.onload?.()); } } },
        SillyTavern: { getContext: () => ({ chatId: 'artist-selection', extensionPrompts: {}, getWorldInfoPrompt: async () => ({ worldInfoString: '' }) }) } };
    if (sourceMode === 'dbgen') global.NaiDbGen = {
        async generateSinglePrompt() { return { ok: true, value: { caption: pluginCaption } }; },
        async generate(request) {
            wires.push(request);
            return { ok: true, value: [{ blob: new Blob([pngFixture(32, 48).bytes], { type: 'image/png' }), mimeType: 'image/png' }] };
        },
    };
    const app = bootstrapIGS({ global, autoAttachMagicWand: false,
        config: { imageApi: { mode: sourceMode }, autoIllustration: { nai: { apiKey: 'fixture', model: 'nai-diffusion-5-full',
            artistPrefix: 'artist:old', artistNegativePrefix: 'old-uc', artistLibrary: { version: 1,
                entries: [{ id: 'new', name: '新画师', positivePrompt: 'artist:new', negativePrompt: 'new-uc' }] } } },
        sceneAssets: { enabled: true, characters: { Alice: {} }, characterDna: {}, scenes: {} } },
        secondaryLlm: { async request(request) {
            assert.equal(sourceMode, 'nai', '数据库生图仍使用插件自己的写词入口');
            const input = request.messages.flatMap(message => {
                try { const value = JSON.parse(message.content); return value?.outputs?.format ? [value] : []; }
                catch { return []; }
            })[0];
            assert.ok(input);
            return spriteDataReply(input, { outfitDescription: 'blue dress' });
        } },
        generatedAssetStore: createMemoryGeneratedAssetStore(), illustrationStore: createMemoryIllustrationStore(), alphaMatte: async value => value,
        illustrationMessageHost: { getChatId: () => 'artist-selection', readFloor: () => null, readPreviousAiTexts: () => [], readCharacterLore: async () => [],
            on: () => () => {}, onImageFloorReady: () => () => {}, destroy() {}, attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }) },
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
        async fetch(_url, init) {
            assert.equal(sourceMode, 'nai', '数据库生图不调用内置 NAI 网络端口');
            const body = JSON.parse(init.body); wires.push(body);
            return new Response(pngFixture(body.parameters.width, body.parameters.height).bytes, { headers: { 'Content-Type': 'image/png' } });
        } });
    t.after(() => app.shutdown());
    const opened = app.openSettings({ page: 'kinds' });
    assert.deepEqual([...opened.controller.getSnapshot().html.matchAll(/data-artist-selection="([^"]+)"/g)].map(match => match[1]).sort(),
        ['global', 'sprite', 'expression', 'avatar', 'wardrobe', 'background', 'item', 'cg', 'nsfwCg'].sort());
    opened.controller.switchPage('source');
    const sourceHtml = opened.controller.getSnapshot().html;
    assert.match(sourceHtml, /data-artist-selection="global"/);
    assert.ok(sourceHtml.indexOf('data-artist-selection="global"') < sourceHtml.indexOf('data-image-source="nai"'), '全局选择在来源公共区显示');
    if (sourceMode === 'dbgen') assert.match(sourceHtml, /使用插件默认画师/);
    opened.controller.switchPage('kinds');
    assert.equal(opened.controller.setArtistSelection(target, 'new').ok, true);
    const nai = app.getUnifiedSettings().bridge.autoIllustration.nai;
    if (target === 'global') assert.equal(nai.artistPrefix, 'artist:new');
    else assert.deepEqual(nai.artistByKind.kinds.sprite, { positive: 'artist:new', negative: 'new-uc' });
    assert.equal((await opened.controller.invoke('char-generate-sprite:Alice')).ok, true);
    assert.equal(wires.length, 1);
    if (sourceMode === 'dbgen') {
        assert.deepEqual(wires[0].artist, { positivePrompt: 'artist:new', negativePrompt: 'new-uc' });
        assert.deepEqual(wires[0].caption, pluginCaption, '画师通过 artist 交接，插件成品提示词保持原样');
    } else {
        assert.ok(wires[0].parameters.v4_prompt.caption.base_caption.startsWith('artist:new, '));
        assert.ok(wires[0].parameters.v4_negative_prompt.caption.base_caption.startsWith('new-uc, '));
    }
    assert.doesNotMatch(JSON.stringify(wires[0]), /artist:old|old-uc/);
});

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
    const naiSettings = { artistPrefix: 'artist:global', artistNegativePrefix: 'global-uc', artistByKind: structuredClone(conf) };
    const backend = createImageBackend({
        global: globalObject,
        getBridge: () => ({ imageApi: { mode: 'dbgen' }, autoIllustration: { nai: naiSettings } }),
    });
    const sprite = await backend.generate({}, {}, { description: '画角色', promptKind: 'sprite' });
    assert.equal(sprite.ok, true);
    assert.equal(calls[0].caption.v4_prompt.caption.base_caption, 'artist:old, 1girl');
    assert.equal(calls[0].caption.v4_negative_prompt.caption.base_caption, 'bad hands');
    assert.deepEqual(calls[0].artist, { positivePrompt: 'artist:aaa, 1.2::artist:bbb::', negativePrompt: 'lowres' });
    calls.length = 0;
    const cg = await backend.generate({}, {}, { description: '画场景', promptKind: 'cg' });
    assert.equal(cg.ok, true);
    assert.deepEqual(calls[0].artist, { positivePrompt: 'artist:global', negativePrompt: 'global-uc' });
    assert.equal(calls[0].caption.v4_prompt.caption.base_caption, 'artist:old, 1girl');
    naiSettings.artistByKind.enabled = false;
    assert.equal((await backend.generate({}, {}, { description: '画角色', promptKind: 'sprite' })).ok, true);
    assert.deepEqual(calls.at(-1).artist, { positivePrompt: 'artist:global', negativePrompt: 'global-uc' });
    naiSettings.artistPrefix = '';
    naiSettings.artistNegativePrefix = '';
    assert.equal((await backend.generate({}, {}, { description: '画场景', promptKind: 'cg' })).ok, true);
    assert.equal(Object.hasOwn(calls.at(-1), 'artist'), false, '没有 IGS 画师时沿用插件默认值');
    assert.equal((await backend.generate({}, {}, { description: '画场景', promptKind: 'cg', artist: null })).ok, true);
    assert.equal(calls.at(-1).artist, null, '保留调用方明确指定的 artist');
    for (const call of calls) assert.deepEqual(call.caption, caption);
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

const artistRow = (extra = {}) => ({ id: 'ink', name: '墨色', positivePrompt: 'artist:ink', negativePrompt: 'lowres', ...extra });

test('gate:artist-library:两种兼容格式仅导入文本，不改原库', async () => {
    const { importArtistLibrary, readArtistLibrary } = await import('../src/generated-images/artist-library.js');
    const raw = JSON.stringify([artistRow({ sequence: 4, referenceImage: 'data:image/png;base64,X', apiKey: 'ignored' })]);
    const imported = importArtistLibrary(raw);
    assert.equal(imported.ok, true);
    assert.deepEqual(imported.value.entries, [artistRow()]);
    const before = structuredClone(imported.value);
    const next = importArtistLibrary(JSON.stringify({ presets: { 水彩: { fixedPrompt: 'artist:water', fixedPrompt_end: 'soft', negativePrompt: 'noise' } }, images: { 水彩: 'ignored' } }), imported.value);
    assert.equal(next.ok, true);
    assert.deepEqual(imported.value, before);
    assert.deepEqual(next.value.entries[1], { id: 'artist-水彩', name: '水彩', positivePrompt: 'artist:water, soft', negativePrompt: 'noise' });
    assert.deepEqual(readArtistLibrary(undefined), { ok: true, value: [] });
});

test('gate:artist-library:无效JSON危险键与无效条目整批拒绝', async () => {
    const { importArtistLibrary, normalizeArtistLibrary } = await import('../src/generated-images/artist-library.js');
    const original = { version: 1, entries: [artistRow()] }, before = structuredClone(original);
    for (const raw of ['{', '[]', '{"version":2,"entries":[]}',
        '[{"name":"A","name":"B","positivePrompt":"","negativePrompt":""}]',
        '[{"__proto__":{"polluted":true}}]', JSON.stringify([artistRow({ name: '' })]),
        JSON.stringify([artistRow({ negativePrompt: 7 })]),
        JSON.stringify([artistRow({ id: 'constructor' })]), JSON.stringify([artistRow({ positivePrompt: 'x'.repeat(20001) })]),
        JSON.stringify({ presets: { A: { fixedPrompt: [] } } })]) {
        assert.equal(importArtistLibrary(raw, original).ok, false, raw.slice(0, 120));
        assert.deepEqual(original, before);
    }
    assert.equal({}.polluted, undefined);
    const broken = { version: 99, entries: [artistRow()] };
    assert.equal(normalizeArtistLibrary(broken), broken, '未知持久版本保持，不伪装空库');
    assert.equal(importArtistLibrary(JSON.stringify([artistRow()]), broken).ok, false);
});

test('gate:artist-library:重复ID名称和文件内重复按统一策略合并', async () => {
    const { importArtistLibrary, readArtistLibrary } = await import('../src/generated-images/artist-library.js');
    const original = { version: 1, entries: [artistRow(), artistRow({ id: 'water', name: 'Water' })] };
    const before = structuredClone(original);
    const rows = [artistRow({ name: '墨色新版', positivePrompt: 'artist:new' }),
        artistRow({ id: 'water-new', name: ' water ', negativePrompt: 'new-uc' }),
        artistRow({ id: 'fresh', name: '新画师' }),
        artistRow({ id: 'fresh-again', name: '新画师', positivePrompt: 'artist:last' })];
    const raw = JSON.stringify({ version: 1, entries: rows });
    const skipped = importArtistLibrary(raw, original);
    assert.equal(skipped.ok, true);
    assert.deepEqual(skipped.value.entries, [...before.entries, rows[2]]);
    assert.equal(skipped.added, 1); assert.equal(skipped.skipped, 3); assert.equal(skipped.overwritten, 0);
    const replaced = importArtistLibrary(raw, original, { overwrite: true });
    assert.equal(replaced.ok, true);
    assert.deepEqual(replaced.value.entries, [rows[0], { ...rows[1], name: 'water' }, rows[3]]);
    assert.equal(replaced.added, 1); assert.equal(replaced.overwritten, 3); assert.equal(replaced.skipped, 0);
    assert.equal(readArtistLibrary(replaced.value).ok, true);
    assert.deepEqual(original, before, '两种策略都不修改传入的原库');
    const onlyDuplicates = importArtistLibrary(JSON.stringify(before.entries), original);
    assert.equal(onlyDuplicates.ok, true, '全部跳过仍是成功导入');
    assert.equal(onlyDuplicates.count, 0);
    assert.deepEqual(onlyDuplicates.value, before);
});

for (const verb of ['import', 'import-text']) for (const overwrite of [true, false]) {
    test(`gate:artist-library:${verb}重复统一询问一次并${overwrite ? '覆盖' : '跳过'}且继续导入`, async () => {
        const { handleArtistLibraryAction } = await import('../src/visual/igs-ui/settings-artist-library.js');
        const original = { artistPrefix: 'artist:active', artistNegativePrefix: 'active-uc', apiKey: 'fixture',
            artistLibrary: { version: 1, entries: [artistRow(), artistRow({ id: 'water', name: '水彩' })] } };
        const before = structuredClone(original);
        const rows = [artistRow({ positivePrompt: 'artist:new' }),
            artistRow({ id: 'water-new', name: '水彩', negativePrompt: 'new-uc' }),
            artistRow({ id: 'fresh', name: '新画师' })];
        const raw = JSON.stringify(rows), asked = [];
        const panel = { draft: { bridge: { autoIllustration: { nai: original } } }, asyncState: {} };
        const result = await handleArtistLibraryAction(`artist-library:${verb}`, {
            panel, isCurrent: () => true,
            readFile: async () => ({ ok: true, text: raw }),
            dialogs: { edit: async () => raw, confirm: async (message, labels) => {
                asked.push({ message, labels }); return overwrite;
            } },
            persistSettingsDraft() { assert.fail('导入只写草稿，不自动保存或应用'); },
        });
        assert.deepEqual(result, { ok: true });
        assert.equal(asked.length, 1);
        assert.deepEqual(asked[0].labels, { okLabel: '覆盖', cancelLabel: '跳过' });
        const nai = panel.draft.bridge.autoIllustration.nai;
        assert.deepEqual(nai.artistLibrary.entries, overwrite ? rows : [...before.artistLibrary.entries, rows[2]]);
        assert.deepEqual({ ...nai, artistLibrary: before.artistLibrary }, before, '当前生效画师与其他配置不变');
        assert.deepEqual(original, before);
    });
}

test('gate:artist-library:无冲突直接导入且全部跳过仍成功', async () => {
    const { handleArtistLibraryAction } = await import('../src/visual/igs-ui/settings-artist-library.js');
    const panel = { draft: { bridge: { autoIllustration: { nai: {} } } }, asyncState: {} };
    let asked = 0;
    const ctx = { panel, isCurrent: () => true, readFile: async () => ({ ok: true, text: JSON.stringify([artistRow()]) }),
        dialogs: { confirm: async () => { asked++; return false; } } };
    assert.deepEqual(await handleArtistLibraryAction('artist-library:import', ctx), { ok: true });
    assert.equal(asked, 0, '无冲突无需二次确认追加');
    const before = structuredClone(panel.draft);
    assert.deepEqual(await handleArtistLibraryAction('artist-library:import', ctx), { ok: true });
    assert.equal(asked, 1);
    assert.deepEqual(panel.draft, before);
});

test('gate:artist-library:覆盖确认后面板过期不写入旧草稿', async () => {
    const { handleArtistLibraryAction } = await import('../src/visual/igs-ui/settings-artist-library.js');
    const panel = { draft: { bridge: { autoIllustration: { nai: { artistLibrary: { version: 1, entries: [artistRow()] } } } } }, asyncState: {} };
    const before = structuredClone(panel.draft);
    let current = true;
    const result = await handleArtistLibraryAction('artist-library:import', {
        panel, isCurrent: () => current,
        readFile: async () => ({ ok: true, text: JSON.stringify([artistRow({ positivePrompt: 'new' })]) }),
        dialogs: { confirm: async () => { current = false; return true; } },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(panel.draft, before);
});

test('gate:artist-library:显式应用全局或分区保留开关及其他字段', async () => {
    const { applyLibraryArtist } = await import('../src/generated-images/artist-library.js');
    const nai = { apiKey: 'fixture', artistPrefix: 'old', negativePrompt: 'old-uc', artistByKind: { enabled: false, kinds: { cg: { positive: 'cg-old', negative: 'cg-uc' } } }, artistLibrary: { version: 1, entries: [artistRow()] } };
    const before = structuredClone(nai);
    const global = applyLibraryArtist(nai, 'ink', 'global').value;
    assert.equal(global.artistPrefix, 'artist:ink'); assert.equal(global.artistNegativePrefix, 'lowres');
    assert.equal(global.negativePrompt, 'old-uc');
    const kind = applyLibraryArtist(nai, 'ink', 'sprite').value;
    assert.equal(kind.artistByKind.enabled, false);
    assert.deepEqual(kind.artistByKind.kinds.sprite, { positive: 'artist:ink', negative: 'lowres' });
    assert.deepEqual(kind.artistByKind.kinds.cg, before.artistByKind.kinds.cg);
    assert.equal(kind.artistPrefix, 'old'); assert.equal(kind.apiKey, 'fixture');
    assert.equal(applyLibraryArtist(nai, 'ink', 'unknown').ok, false);
    assert.equal(applyLibraryArtist(nai, 'absent', 'global').ok, false);
    assert.deepEqual(nai, before);
});

test('gate:artist-library:已应用文本进入最终NAI请求且库管理不改变租约', async t => {
    const { importArtistLibrary, applyLibraryArtist } = await import('../src/generated-images/artist-library.js');
    const { builtinImageHarness } = await import('./helpers/builtin-image-harness.js');
    const h = builtinImageHarness(); t.after(() => h.dispose());
    const captured = h.runtime.capture();
    assert.equal(captured.ok, true);
    const nai = h.bridge.autoIllustration.nai;
    nai.artistLibrary = importArtistLibrary(JSON.stringify([artistRow()])).value;
    h.runtime.refresh();
    assert.equal(captured.isCurrent(), true, '未应用的库管理不影响发送');
    assert.equal(captured.state.config.autoIllustration.nai.artistLibrary, undefined);
    h.bridge.autoIllustration.nai = applyLibraryArtist(nai, 'ink', 'global').value;
    h.runtime.refresh();
    assert.equal(captured.isCurrent(), true, '画师选择供新任务使用，在途任务保留原配置');
    assert.equal(captured.state.config.autoIllustration.nai.artistPrefix, nai.artistPrefix);
    captured.release();
    const caption = {
        v4_prompt: { caption: { base_caption: 'a quiet landscape', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'blur', char_captions: [] } },
    };
    const first = await h.backend.generateCaption({ caption, captionMode: 'final', imageKind: 'cg' });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(h.wires[0].parameters.v4_prompt.caption.base_caption, 'artist:ink, a quiet landscape');
    assert.equal(h.wires[0].parameters.v4_negative_prompt.caption.base_caption, 'lowres, blur');
    assert.deepEqual(first.sentPrompt.artist, { positivePrompt: 'artist:ink', negativePrompt: 'lowres' });
    h.bridge.autoIllustration.nai = applyLibraryArtist(h.bridge.autoIllustration.nai, 'ink', 'background').value;
    h.bridge.autoIllustration.nai.artistPrefix = 'artist:global';
    h.bridge.autoIllustration.nai.negativePrompt = 'global-uc';
    h.bridge.autoIllustration.nai.artistByKind.enabled = true;
    const second = await h.backend.generateCaption({ caption, captionMode: 'final', imageKind: 'background' });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(h.wires[1].parameters.v4_prompt.caption.base_caption, 'artist:ink, a quiet landscape');
    assert.equal(h.wires[1].parameters.v4_negative_prompt.caption.base_caption, 'lowres, blur');
    assert.doesNotMatch(JSON.stringify(h.wires), /artistLibrary|墨色|apiKey|fixture-builtin/);
    assert.equal(h.writes.length, 0);
});

test('gate:artist-library:重绘保留全局负向与画师三态且旧生成不重复前置', async t => {
    const { builtinImageHarness } = await import('./helpers/builtin-image-harness.js');
    const { pngFixture } = await import('./helpers/png-fixture.js');
    const h = builtinImageHarness(); t.after(() => h.dispose());
    Object.assign(h.bridge.autoIllustration.nai, { artistPrefix: 'artist:global', artistNegativePrefix: 'artist-uc', negativePrompt: 'legacy-uc' });
    const caption = { v4_prompt: { caption: { base_caption: 'landscape', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'blur', char_captions: [] } } };
    const config = await h.backend.getEditConfig({ imageKind: 'cg' });
    assert.equal(config.ok, true, JSON.stringify(config));
    assert.deepEqual(config.artist, { positivePrompt: 'artist:global', negativePrompt: 'artist-uc' });
    const png = pngFixture(64, 64).dataUrl;
    for (const artist of [undefined, null, { positivePrompt: 'artist:explicit', negativePrompt: 'explicit-uc' }]) {
        const result = await h.backend.edit({ caption, captionMode: 'final', imageKind: 'cg',
            sourceDataUrl: png, maskDataUrl: png, width: 64, height: 64, strength: 1,
            ...(artist !== undefined && { artist }) });
        assert.equal(result.ok, true, JSON.stringify(result));
        const expected = artist === undefined ? config.artist : artist;
        const body = h.wires.at(-1);
        assert.equal(body.action, 'infill');
        assert.equal(body.parameters.v4_prompt.caption.base_caption, expected ? `${expected.positivePrompt}, landscape` : 'landscape');
        assert.equal(body.parameters.v4_negative_prompt.caption.base_caption, expected ? `${expected.negativePrompt}, blur` : 'blur');
        assert.deepEqual(result.sentPrompt.artist, expected);
        assert.doesNotMatch(JSON.stringify(body), /legacy-uc/);
    }
    h.bridge.autoIllustration.nai.artistByKind = { enabled: true,
        kinds: { background: { positive: 'artist:kind', negative: 'kind-uc' } } };
    const result = await h.backend.generate({ scene: 'landscape', sceneUc: 'blur' }, {}, { imageKind: 'background' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(h.wires.at(-1).input, 'artist:kind, landscape');
    assert.equal(h.wires.at(-1).parameters.negative_prompt, 'kind-uc, blur');
    assert.equal(h.writes.length, 0);
});

test('gate:artist-library:归档原文保真且坏库和满库不产生半成品', async () => {
    const { preserveConfiguredArtists, removeArtistEntry } = await import('../src/generated-images/artist-library.js');
    const nai = { artistPrefix: '  old artist\n', artistNegativePrefix: ' old uc ', negativePrompt: ' legacy uc\n',
        artistByKind: { enabled: false, kinds: { sprite: { positive: 'sprite artist', negative: 'sprite uc' } } } };
    const before = structuredClone(nai);
    const archived = preserveConfiguredArtists(nai);
    assert.equal(archived.ok, true);
    assert.deepEqual(nai, before, '归档只生成新草稿');
    assert.deepEqual(archived.value.artistLibrary.entries.map(row => [row.positivePrompt, row.negativePrompt]),
        [[nai.artistPrefix, nai.artistNegativePrefix], ['sprite artist', 'sprite uc'], ['', nai.negativePrompt]]);
    assert.equal(archived.value.artistLibraryArchived, true);
    const deleted = { ...archived.value, artistLibrary: removeArtistEntry(archived.value.artistLibrary,
        archived.value.artistLibrary.entries[0].id).value };
    assert.deepEqual(preserveConfiguredArtists(deleted).value, deleted, '迁移完成后不重新归档用户删除的条目');
    for (const library of [{ version: 99, entries: [] }, { version: 1,
        entries: Array.from({ length: 500 }, (_, i) => ({ id: `full-${i}`, name: `full-${i}`, positivePrompt: '', negativePrompt: '' })) }]) {
        const original = { ...nai, artistLibrary: library }, copy = structuredClone(original);
        assert.equal(preserveConfiguredArtists(original).ok, false);
        assert.deepEqual(original, copy, '拒绝不改原库、历史文本或归档标记');
        assert.equal(original.artistLibraryArchived, undefined);
    }
});
