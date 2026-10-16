import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { characterViewsFixture, spriteDataReply } from './helpers/prompt-provenance.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { characterPromptTask } from '../src/generated-images/illustration/character-prompt-task.js';
import { parseSpriteData } from '../src/generated-images/illustration/sprite-data.js';

function entryFixture(options = {}) {
    const h = builtinImageHarness(options), indexedDB = createTransactionalIdb();
    const assets = options.assets || { characters: { Alice: { 默认: 'original.png' } }, characterDna: {}, scenes: {} };
    let sequence = 0;
    const mattes = [];
    const open = () => createAssetGenerationService({ nai: h.backend, llm: h.llm, mediaCache: h.mediaCache,
        store: createIndexedDbGeneratedAssetStore({ indexedDB }),
        messageHost: options.messageHost || { getChatId: () => 'builtin-entry' },
        getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        matte: async (url, meta) => { mattes.push(meta); return url; }, report: options.report || (() => {}), newId: () => `builtin-entry-${++sequence}` });
    return { ...h, assets, indexedDB, mattes, service: open(), open };
}
test('gate:builtin-entry:首次立绘同次 DNA 候选，权威回读采用才建档', async t => {
    const { prepareSpriteIdentityAdoption } = await import('../src/scene/character-identity.js');
    const f = entryFixture(); t.after(() => f.dispose());
    const before = structuredClone(f.assets);
    const generated = await f.service.generateCharacterSprite({ name: 'Alice', dna: {} });
    assert.equal(generated.ok, true, JSON.stringify(generated));
    assert.deepEqual(f.assets, before);
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 1);
    const image = await f.open().readStoredImage(generated.imageId);
    assert.equal(image.promptTask.purpose, 'sprite');
    assert.deepEqual(Object.keys(image.dnaCandidates.characters[0].views).sort(), ['full_body', 'half_body', 'portrait']);
    assert.equal(image.dnaSnapshot.characters[0].source, 'candidate');
    assert.deepEqual(image.sentPrompt.caption.v4_prompt.caption, f.wires[0].parameters.v4_prompt.caption);
    const adopted = prepareSpriteIdentityAdoption(f.assets, 'Alice', image.id, image, { hadDefault: true });
    assert.equal(adopted.ok, true, JSON.stringify(adopted));
    const storage = createMemoryStorage();
    storage.setItem('fixture-adopted', JSON.stringify({ ...f.assets, ...adopted.patch }));
    const saved = JSON.parse(storage.getItem('fixture-adopted'));
    assert.deepEqual(saved.characterDna.Alice.views, image.dnaCandidates.characters[0].views);
    assert.equal(saved.characterDna.Alice.identitySource, image.id);
    assert.equal(saved.characterDna.Alice.defaultAppearance || '', '');
    const clothing = image.outfitSnapshot.characters[0];
    assert.deepEqual(saved.characterDefaultOutfits.Alice, { version: 1, outfitName: clothing.name });
    const entry = saved.characterOutfits.Alice[clothing.name];
    assert.equal(entry.moods.平和, `igs-gen:${image.id}`);
    assert.equal(saved.wardrobe[entry.wardrobe].prompt, clothing.description);
    assert.deepEqual(f.assets, before);
});

test('gate:builtin-entry:同名衣装删除角色后同楼补全并入库建立新默认', async t => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const { readDefaultOutfit } = await import('../src/scene/character-appearance.js');
    const storage = createMemoryStorage();
    const floor = { chatId: 'builtin-entry', messageId: 4, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平静|干净便服|你好。]' };
    const assets = { enabled: true, characters: { Alice: {} }, scenes: {},
        characterDna: { Alice: { version: 2, views: characterViewsFixture(), personality: '' } },
        characterOutfits: { Alice: {
            破损衣物: { wardrobe: 'old-torn', moods: { 平和: 'old-torn.png' } },
            干净便服: { wardrobe: 'old-clean', moods: { 平和: 'old-clean.png' } },
        } }, characterDefaultOutfits: { Alice: { version: 1, outfitName: '破损衣物' } },
        wardrobe: { 'old-torn': { prompt: 'wears a torn gray jacket' },
            'old-clean': { prompt: 'wears a blue cotton shirt' } } };
    const f = entryFixture({ assets,
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
            readPreviousAiTexts: () => [], on: () => () => {} },
        reply: input => spriteDataReply(input, { outfitName: '干净便服',
            outfitDescription: 'wears a clean navy cotton shirt and trousers' }) });
    t.after(() => f.dispose());
    f.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    const settings = { draft: { bridge: { sceneAssets: assets }, readerSettings: {} }, asyncState: {} };
    const ctx = { state: { activeSettings: settings },
        options: { global: { alert() {} }, generatedAssets: f.service },
        dialogs: { confirm: async () => true, prompt: async (_message, value) => value, alert() {} },
        persistSettingsDraft() {
            storage.setItem('recreated-assets', JSON.stringify(assets)); return { ok: true };
        }, rerenderSettings: () => ({ ok: true }) };
    const removed = await handleSettingsAction('scene-remove-char:Alice', ctx);
    assert.equal(removed.ok, true);
    assert.equal(assets.characters.Alice, undefined);
    assert.equal(assets.characterOutfits.Alice, undefined);
    assert.equal(assets.characterDna.Alice, undefined);
    assert.equal(readDefaultOutfit(assets, 'Alice').reason, 'default-outfit-unset');
    const before = structuredClone(assets);
    const generated = await f.service.processMessage(4, { manual: true });
    assert.equal(generated.ok, true, JSON.stringify(generated));
    assert.deepEqual([f.writes.length, f.wires.length], [1, 1]);
    assert.equal(f.writes[0].input.characterContext[0].outfit.name, '干净便服');
    assert.deepEqual(assets, before, '候选未采用前不登记默认');
    const [record] = f.service.listReview('builtin-entry|4|0');
    const image = await f.open().readStoredImage(record.imageId);
    assert.equal(image.characterMeta.characters[0].outfit.name, '干净便服');
    assert.equal(image.outfitSnapshot.characters[0].name, '干净便服');
    const adopted = await handleSettingsAction(`gen-temp-accept:${encodeURIComponent(record.key)}`, ctx);
    assert.equal(adopted.ok, true, JSON.stringify(adopted));
    const saved = JSON.parse(storage.getItem('recreated-assets'));
    assert.equal(readDefaultOutfit(saved, 'Alice').outfitName, '干净便服');
    assert.equal(saved.characterOutfits.Alice.干净便服.moods.平和, `igs-gen:${record.imageId}`);
    assert.equal(saved.characterDna.Alice.identitySource, record.imageId);
    assert.equal(saved.wardrobe['old-clean'].prompt, before.wardrobe['old-clean'].prompt);
    assert.equal(f.service.getRecord(record.key).status, 'library');
    assert.deepEqual([f.writes.length, f.wires.length], [1, 1], '采用不重复生成');
});

test('gate:builtin-entry:单份立绘缺号仅绑定唯一请求槽，其他协议校验保持', async t => {
    const makeMeta = (purpose = 'sprite', format = 'sprite-data', keys = [['Alice']]) => ({
        ...characterPromptTask([...new Set(keys.flat())].map(characterKey => ({ characterKey, dna: {
            ...(purpose === 'derived' && { version: 2, views: characterViewsFixture(), personality: '' }),
        }, outfit: { name: '常服', description: 'wears a blue coat' } })), purpose, 'half_body', keys),
        outputs: { format }, userPrompts: { positive: 'single adult, white background', negative: '' },
    });
    const meta = makeMeta(); meta.promptTask.slots[0].slotId = 7;
    const complete = spriteDataReply(meta), missing = complete.replace(/^slotid: 7\n/, '');
    for (const [name, text] of [['explicit', complete], ['missing', missing]]) await t.test(name, () => {
        const result = parseSpriteData(text, meta);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.deepEqual(result.captions.map(c => c.slotId), [7]);
        assert.deepEqual(result.promptTask.slots, [{ slotId: 7, tokens: ['r0'] }]);
        assert.equal(result.characterMeta.characters[0].characterKey, 'Alice');
        assert.equal(result.dnaCandidates.characters[0].characterKey, 'Alice');
    });
    await t.test('schema-default-slot', () => {
        const request = makeMeta(); delete request.promptTask.slots;
        const result = parseSpriteData(spriteDataReply(request).replace(/^slotid: 1\n/, ''), request);
        assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.slotId, 1);
    });
    const multi = makeMeta('sprite', 'sprite-data', [['Alice'], ['Bob']]);
    const repeated = makeMeta('sprite', 'sprite-data', [['Alice'], ['Alice']]);
    const shared = makeMeta('sprite', 'sprite-data', [['Alice', 'Bob']]);
    const derived = makeMeta('derived'), fragments = makeMeta('derived', 'expression-fragments');
    const cases = [
        ['wrong-id', meta, complete.replace('slotid: 7', 'slotid: 8'), 'slots', 'mismatch'],
        ['duplicate-id', meta, complete + '\n---\n' + complete, 'slotid', 'invalid'],
        ['late-id', meta, missing + '\nslotid: 7', 'slotid', 'invalid'],
        ['duplicate-character', meta, missing + '\ncharacter: Alice', 'character', 'duplicate'],
        ['duplicate-field', meta, missing + '\noutfit_name: 常服', 'outfit_name', 'duplicate'],
        ['wrong-character', meta, missing.replace('character: Alice', 'character: Bob'), 'character', 'mismatch'],
        ['unknown-field', meta, missing + '\nscene: private', 'response_format', 'invalid'],
        ['missing-character', meta, missing.replace(/^character: Alice\n/, ''), 'slotid', 'missing'],
        ['second-headerless-row', meta, missing + '\n---\n' + missing, 'slotid', 'missing'],
        ['multi-no-id', multi, spriteDataReply(multi).replace(/^slotid: \d+\n/gm, ''), 'slotid', 'missing'],
        ['multi-partial-no-id', multi, spriteDataReply(multi).replace(/^slotid: \d+\n/, ''), 'slotid', 'missing'],
        ['multi-truncated', multi, spriteDataReply(multi).split('\n---\n')[0], 'slots', 'mismatch'],
        ['same-character-multi-slot', repeated, spriteDataReply(repeated).replace(/^slotid: \d+\n/gm, ''), 'slotid', 'missing'],
        ['multi-character-single-slot', shared, missing, 'slotid', 'missing'],
        ['derived-no-id', derived, spriteDataReply(derived).replace(/^slotid: 1\n/, ''), 'slotid', 'missing'],
        ['fragments-no-id', fragments, spriteDataReply(fragments).replace(/^slotid: 1\n/, ''), 'slotid', 'missing'],
    ];
    for (const [name, request, text, field, issue] of cases) await t.test(name, () => {
        const result = parseSpriteData(text, request);
        assert.equal(result.ok, false, name);
        assert.equal(result.reason, 'SPRITE_DATA_INVALID');
        assert.equal(result.diagnostic.field, field); assert.equal(result.diagnostic.issue, issue);
        if (issue === 'missing') assert.equal(result.diagnostic.lineNumber,
            name === 'second-headerless-row' ? missing.split('\n').length + 2 : 1);
    });
});

for (const entry of ['manual', 'automatic'])
test(`gate:builtin-entry:首次立绘漏slotid经实际入口生成且采用前不建档-${entry}`, async t => {
    const floor = { chatId: 'builtin-entry', messageId: 4, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平静|你好。]' };
    const f = entryFixture({ assets: { enabled: true, characters: {}, characterDna: {}, scenes: {} },
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
            readPreviousAiTexts: () => [], on: () => () => {} },
        reply: input => spriteDataReply(input).replace(/^slotid: \d+\n/, '') });
    t.after(() => f.dispose());
    f.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    const before = structuredClone(f.assets);
    const result = entry === 'manual' ? await f.service.generateCharacterSprite({ name: 'Alice', dna: {} })
        : await f.service.processMessage(4, { manual: true });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 1);
    const store = createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB });
    const imageId = entry === 'manual' ? result.imageId : (await store.getAssetsByChat(floor.chatId))[0].imageId;
    const image = await f.open().readStoredImage(imageId);
    const requested = f.writes[0].input.promptTask;
    assert.equal(image.slotId, requested.slots[0].slotId);
    assert.deepEqual(image.promptTask.characters, requested.characters);
    assert.equal(image.promptRecipe.bindings[0].token, requested.slots[0].tokens[0]);
    assert.equal(image.dnaCandidates.characters[0].characterKey, 'Alice');
    assert.equal(image.dnaSnapshot.characters[0].source, 'candidate');
    assert.deepEqual(f.assets, before);
});

for (const [name, transform, multi = false] of [
    ['wrong-id', text => text.replace(/^slotid: 1/, 'slotid: 8')],
    ['duplicate-id', text => text + '\n---\n' + text],
    ['duplicate-character', text => text.replace(/^slotid: 1\n/, '') + '\ncharacter: Alice'],
    ['duplicate-field', text => text.replace(/^slotid: 1\n/, '') + '\noutfit_name: 常服'],
    ['wrong-character', text => text.replace(/^slotid: 1\n/, '').replace('character: Alice', 'character: Bob')],
    ['multi-no-id', text => text.replace(/^slotid: \d+\n/gm, ''), true],
    ['multi-later-no-id', text => text.replace(/^slotid: 1\n/m, ''), true],
]) test(`gate:builtin-entry:立绘缺号兼容不放宽其他错误且零绘图-${name}`, async t => {
    const floor = { chatId: 'builtin-entry', messageId: 4, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平静|你好。]\n[igs-char:Bob|平静|你好。]' };
    const f = entryFixture({ assets: { enabled: true, characters: {}, characterDna: {}, scenes: {} },
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
            readPreviousAiTexts: () => [], on: () => () => {} },
        reply: input => transform(spriteDataReply(input)) });
    t.after(() => f.dispose());
    f.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    const before = structuredClone(f.assets);
    const result = multi ? await f.service.processMessage(4, { manual: true })
        : await f.service.generateCharacterSprite({ name: 'Alice', dna: {} });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(f.writes.length, 1, '拒收后不得自动修词补发');
    if (multi) assert.equal(f.writes[0].input.promptTask.slots.length, 2);
    assert.equal(f.wires.length, 0); assert.equal(f.mattes.length, 0);
    assert.deepEqual(f.assets, before);
});

test('gate:builtin-entry:现场混合模板结构拒绝且素材日志保留脱敏位置', async t => {
    const { secondaryLlmText } = await import('../src/host/secondary-llm-result.js');
    const reports = [];
    const floor = { chatId: 'builtin-entry', messageId: 4, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:ExampleAdult|平静|你好。]' };
    const f = entryFixture({ assets: { enabled: true, characters: {}, characterDna: {}, scenes: {} },
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
            readPreviousAiTexts: () => [], on: () => () => {} },
        report: (level, message) => reports.push({ level, message }),
        reply: input => secondaryLlmText(['<think>private reasoning</think>',
            'slotid: 1', 'prompt_mode: dna_template', 'scene: A bunker.', 'scene_uc: crowd',
            'size: 832x1216', 'analysis: Fixture description.', 'at: 1', '---',
            `0: named | ExampleAdult | <<dna:${input.promptTask.characters[0].token}>> <<outfit:armor>> waves.`,
            '<<dna_uc:r0>>', '---', 'meta_kind: 0 | named', 'meta_key: ExampleAdult',
            'meta_token: r0', 'meta_frame: half_body', 'meta_outfit_name: 0 | armor',
            'meta_outfit_description: 0 | wears armor'].join('\n')) });
    t.after(() => f.dispose());
    f.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    const before = structuredClone(f.assets);
    const result = await f.service.processMessage(4, { manual: true });
    assert.equal(result.ok, false);
    assert.equal(f.writes.length, 1);
    assert.equal(f.wires.length, 0, '协议错误不得绘图或自动修词补发');
    assert.ok(reports.some(row => /字段=response_format.*lineNumber=2/.test(row.message)));
    assert.doesNotMatch(JSON.stringify(reports), /private reasoning|<<dna|<<outfit|wears armor/);
    const records = await createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB }).getAssetsByChat(floor.chatId);
    assert.equal(records.length, 1);
    assert.equal(records[0].status, 'failed');
    assert.match(records[0].error, /字段=response_format.*lineNumber=2/);
    assert.deepEqual(f.assets, before);
});


test('gate:builtin-entry:头像使用 portrait 保存身份，缺景别零发送', async t => {
    const assets = { characters: { Alice: {} }, characterDna: { Alice: { version: 2,
        views: characterViewsFixture(), defaultAppearance: 'wears a blue coat' } } };
    const f = entryFixture({ assets }); t.after(() => f.dispose());
    const before = structuredClone(assets);
    const avatar = await f.service.generateCharacterAvatar({ name: 'Alice', dna: assets.characterDna.Alice });
    assert.equal(avatar.ok, true, JSON.stringify(avatar));
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 1);
    assert.equal(f.writes[0].input.promptTask.characters[0].framing, 'portrait');
    assert.equal(f.writes[0].input.writingRequirements.size, '1024x1024');

    assert.equal(avatar.dnaSnapshot.characters[0].source, 'saved');
    assert.equal(avatar.dnaSnapshot.characters[0].framing, 'portrait');
    assert.deepEqual(avatar.sentPrompt.caption.v4_prompt.caption, f.wires[0].parameters.v4_prompt.caption);
    assert.deepEqual(assets, before);
    const incomplete = structuredClone(assets.characterDna.Alice); delete incomplete.views.portrait;
    assert.equal((await f.service.generateCharacterAvatar({ name: 'Alice', dna: incomplete })).ok, false);
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 1);
});

test('gate:builtin-entry:物品 task 经实际客户端发送并从 IDB 回读', async t => {
    const { createItemImageService } = await import('../src/generated-images/illustration/item-image-service.js');
    const f = entryFixture({ reply: input => input.outputs.items.map(({ id }) =>
        `id: ${id}\ntags: A brass key on a plain surface.\nuc: text`).join('\n') });
    t.after(() => f.dispose()); f.bridge.itemImages = { enabled: true };
    const floor = { chatId: 'builtin-entry', messageId: 5, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-fx:item|获得|黄铜钥匙|旧钥匙]\n她把黄铜钥匙放在桌上。' };
    const store = createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB });
    const service = createItemImageService({ nai: f.backend, llm: f.llm, store, mediaCache: f.mediaCache,
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor, on: () => () => {} },
        getSettings: () => f.bridge, readTables: () => [], matte: async url => url, newId: () => 'builtin-key' });
    const result = await service.processMessage(5);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.count, 1);
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 1);

    assert.match(f.writes[0].input.userPrompts.positive, /still life/);
    assert.equal(f.writes[0].input.writingRequirements.size, '1024x1024');
    assert.equal(f.writes[0].input.outputs.format, 'asset-plan');
    assert.equal(f.wires[0].input, 'artist:fixture, A brass key on a plain surface.');
    assert.equal(f.wires[0].parameters.negative_prompt, 'text');
    assert.deepEqual(f.wires[0].parameters.v4_prompt.caption.char_captions, []);
    const reopened = createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB });
    const record = (await reopened.getAssetsByChat(floor.chatId))[0];
    assert.equal(record.type, 'item'); assert.equal(record.status, 'ready');
    assert.equal(record.imageId, 'builtin-key'); assert.ok((await reopened.getImage(record.imageId)).dataUrl);
    assert.equal((await service.processMessage(5)).reason, 'nothing-missing');
    assert.equal(f.wires.length, 1);
});

test('gate:builtin-entry:背景 task 无人物无 DNA，实际发送后跨连接回读', async t => {
    const floor = { chatId: 'builtin-entry', messageId: 3, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-scene:空教室|白天|晴]\n阳光照在空教室的课桌上。' };
    const assets = { enabled: true, characters: {}, characterDna: {}, scenes: {} };
    const f = entryFixture({ assets, messageHost: { getChatId: () => floor.chatId,
        readFloor: () => floor, readPreviousAiTexts: () => [], on: () => () => {} },
        reply: () => '#1\nscene: An empty classroom in daylight.\nchar:\nuc: people, text' });
    t.after(() => f.dispose());
    f.bridge.autoIllustration.assets = { backgroundEnabled: true, spriteEnabled: false };
    const before = structuredClone(assets);
    const result = await f.service.processMessage(3, { manual: true });
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.count, 1);
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 1);

    assert.deepEqual(f.writes[0].input.outputs.slotIds, [1]);
    assert.match(f.writes[0].input.userPrompts.positive, /visual novel background/);
    assert.equal(f.writes[0].input.writingRequirements.transparent, false);
    assert.equal(f.writes[0].input.outputs.format, 'caption-slots');
    assert.equal(f.wires[0].input, 'artist:fixture, An empty classroom in daylight.');
    assert.equal(f.wires[0].parameters.negative_prompt, 'people, text');
    assert.deepEqual(f.wires[0].parameters.v4_prompt.caption.char_captions, []);
    const raw = createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB });
    const record = (await raw.getAssetsByChat(floor.chatId))[0];
    assert.equal(record.type, 'background'); assert.equal(record.status, 'review');
    const image = await f.open().readStoredImage(record.imageId);
    assert.ok(image.dataUrl); assert.ok(image.prompt);
    assert.deepEqual(assets, before);
    assert.equal(image.seed, f.wires[0].parameters.seed);
    assert.equal(record.seed, image.seed);
    const { bindGeneratedBackground } = await import('../src/scene/asset-match.js');
    assets.scenes = bindGeneratedBackground(assets, record, record.name).scenes;
    assert.equal(assets.scenes[record.name].seed, image.seed);
    const variants = await f.open().generateSceneVariants({ baseImageId: image.id, scene: record.name,
        variants: [{ time: '夜晚' }, { time: '黄昏', weather: '雨' }] });
    assert.equal(variants.ok, true, JSON.stringify(variants));
    assert.deepEqual(f.wires.map(w => w.parameters.seed), [image.seed, image.seed, image.seed]);
    for (const item of variants.items) assert.equal((await f.open().readStoredImage(item.imageId)).seed, image.seed);
});

for (const scenario of ['legacy', 'named', 'renamed', 'invalid-at', 'missing-at', 'empty-at', 'unknown-key', 'invalid-region'])
test(`gate:builtin-entry:普通 CG 当次身份不建档，模板重画零写词且保留原衣装-${scenario}`, async t => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const assets = { characters: { Alice: {} }, characterDna: {}, characterOutfits: {}, wardrobe: {} };
    if (scenario === 'named') assets.characterSeeds = { Alice: 0 };
    const before = structuredClone(assets);
    const h = builtinImageHarness({ reply(input) {
        const row = input.promptTask.characters[0];
        return ['slotid: 1',
            ...(scenario === 'missing-at' ? []
                : [`at: ${scenario === 'empty-at' ? '' : scenario === 'invalid-at' ? 999 : 1}`]),
            'prompt_mode: dna_template', 'outfit_mode: template',
            'scene: Alice meets a friend in a cafe.', 'scene_uc: blurry',
            `char: 0.3,0.5 | <<dna:${row.token}>> <<outfit:${row.token}>> and waves.`,
            `char_uc: <<dna_uc:${row.token}>>`, 'meta_kind: 0 | named',
            `meta_key: 0 | ${scenario === 'unknown-key' ? 'PrivateUnknown' : row.characterKey}`, `meta_token: 0 | ${row.token}`, 'meta_frame: 0 | half_body',
            `meta_outfit_name: 0 | ${scenario === 'legacy' ? 'Coat' : scenario === 'renamed' ? 'Blue coat' : '蓝色外套'}`,
            'meta_outfit_description: 0 | wears a blue coat',
            'meta_outfit_id: 0 |',
            'meta_identity: 0 | Alice, an adult woman with silver hair and blue eyes,',
            'meta_signature: 0 | silver hair',
            ...(scenario === 'invalid-region' ? ['meta_region: 0 | 0.9,0.2,0.2,0.3'] : [])].join('\n');
    } });
    t.after(() => h.dispose());
    Object.assign(h.bridge.autoIllustration, { interludeEnabled: true, interludeMaxCount: 1 });
    let text = scenario === 'legacy'
        ? '[igs-scene:咖啡馆|白天|晴]\nAlice在咖啡馆向朋友挥手。\n[igs-char:Alice|喜悦|你好。]'
        : '[igs-scene:咖啡馆|白天|晴]\n[igs-char:Alice|喜悦|蓝色外套|你好。]\nAlice向朋友挥手。'
            + '\n[igs-scene:家中|夜晚|晴]\n[igs-char:Alice|平和|晚礼服|晚上好。]';
    const floor = () => ({ chatId: 'builtin-cg', messageId: 5, swipeId: 0, isAi: true, isLatest: true, text });
    const host = { getChatId: () => 'builtin-cg', readFloor: floor, readPreviousAiTexts: () => [],
        async writeFloor(_id, next) { text = next; return { ok: true }; }, on: () => () => {},
        attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }), destroy() {} };
    const indexedDB = createTransactionalIdb(), store = createIndexedDbIllustrationStore({ indexedDB });
    const service = createAutoIllustrationService({ nai: h.backend, llm: h.llm, store, mediaCache: h.mediaCache,
        messageHost: host, getSettings: () => h.bridge.autoIllustration, getSceneAssets: () => assets, report() {} });
    const result = await service.processMessage(5, { manual: true });
    if (['unknown-key', 'invalid-region'].includes(scenario)) {
        const unknown = scenario === 'unknown-key';
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'plan-failed');
        assert.deepEqual(result.diagnostic, {
            code: unknown ? 'character-meta-binding' : 'character-meta-region',
            field: unknown ? 'binding.characterKey' : 'meta_region',
            issue: unknown ? 'mismatch' : 'invalid', captionIndex: 0,
            stage: 'prompt-parse', slotId: 1, lineNumber: unknown ? 10 : 18 });
        assert.match(result.error, /角色资料无法可靠绑定.*slotId=1.*lineNumber=/);
        assert.doesNotMatch(JSON.stringify(result), /PrivateUnknown|silver hair|wears a blue coat|<<dna/);
        assert.equal(h.writes.length, 1);
        assert.equal(h.wires.length, 0, '角色元数据失败不得补发或绘图');
        assert.deepEqual(assets, before);
        return;
    }
    if (scenario.endsWith('-at')) {
        assert.equal(result.ok, false, JSON.stringify(result));
        assert.match(result.error, /字段=at/);
        if (scenario.endsWith('-at')) assert.match(result.error,
            scenario === 'missing-at' ? /缺少必需字段/ : /格式或取值无效/);
        assert.equal(h.writes.length, 1);
        assert.equal(h.wires.length, 0, '缺号或无效生成点不补发、不绘图');
        assert.deepEqual(assets, before);
        return;
    }
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.count, 1);
    assert.equal(h.writes.length, 1); assert.equal(h.wires.length, 1);

    assert.equal(h.writes[0].input.outputs.selection, 'numbered-text');
    const raw = createIndexedDbIllustrationStore({ indexedDB });
    const original = await raw.getSlotRecord('builtin-cg|5|0|1');
    assert.equal(original.status, 'done'); assert.equal(original.dnaCandidates, undefined);
    assert.equal(original.seed, h.wires[0].parameters.seed);
    if (scenario === 'named') assert.equal(original.seed, 0);
    assert.deepEqual(original.sentPrompt.caption.v4_prompt.caption, h.wires[0].parameters.v4_prompt.caption);
    assert.equal(original.outfitAnchor.version, 1);
    assert.ok(Number.isSafeInteger(original.outfitAnchor.offset));
    const outfitName = scenario === 'legacy' ? 'Coat' : scenario === 'renamed' ? 'Blue coat' : '蓝色外套';
    assert.deepEqual(original.outfitAnchor.characters, [{ characterKey: 'Alice',
        requestedOutfit: outfitName, effectiveOutfit: outfitName,
        requirementSource: 'cg-selection', source: 'cg-selection', reason: '', effectiveSource: 'snapshot' }]);
    assert.equal(original.outfitSnapshot.characters[0].source, 'candidate');
    assert.equal(original.outfitSnapshot.characters[0].name, outfitName);
    assert.deepEqual(assets, before, '普通 CG 不登记永久 DNA 或衣装');
    assets.characterDna.Alice = { version: 2, views: characterViewsFixture('Alice, an adult with black hair,') };
    const rerollAssets = structuredClone(assets);
    const reroll = await service.rerollSlot({ chatId: 'builtin-cg', messageId: 5, swipeId: 0, slot: 1 });
    assert.equal(reroll.ok, true, JSON.stringify(reroll));
    assert.equal(h.writes.length, 1); assert.equal(h.wires.length, 2);
    assert.equal(h.wires[1].parameters.v4_prompt.caption.char_captions[0].char_caption,
        'Alice, an adult with black hair, wears a blue coat and waves.');
    const current = await raw.getSlotRecord(original.key);
    assert.deepEqual(current.promptRecipe, original.promptRecipe);
    assert.equal(current.seed, h.wires[1].parameters.seed);
    if (scenario === 'named') assert.equal(current.seed, 0);
    assert.deepEqual(current.outfitSnapshot, original.outfitSnapshot);
    assert.deepEqual(current.outfitAnchor, original.outfitAnchor, '普通重画保留原图正文衣装锚点');
    assert.deepEqual(current.prompt.outfitSnapshot, original.outfitSnapshot);
    assert.deepEqual(current.sentPrompt.caption.v4_prompt.caption, h.wires[1].parameters.v4_prompt.caption);
    assert.equal(current.dnaSnapshot.characters[0].source, 'saved');
    assert.deepEqual(assets, rerollAssets, '重画不登记候选衣装或改写当前 DNA');

    const { cgPaintRequests } = await import('../src/generated-images/illustration/cg-character-bindings.js');
    const request = cgPaintRequests([current], assets)[0];
    const mutations = [
        snapshot => { snapshot.version = 2; },
        snapshot => { snapshot.characters.push(structuredClone(snapshot.characters[0])); },
        ...['characterKey', 'token', 'name', 'description', 'source'].map(field => snapshot => {
            snapshot.characters[0][field] = 'invalid';
        }),
    ];
    for (const mutate of mutations) {
        const invalid = structuredClone(request); mutate(invalid.outfitSnapshot);
        const rejected = await h.backend.generateCaption(invalid);
        assert.equal(rejected.ok, false);
        assert.equal(rejected.reason, 'OUTFIT_TEMPLATE_INVALID');
        assert.equal(h.writes.length, 1); assert.equal(h.wires.length, 2);
    }
    assert.deepEqual(await raw.getSlotRecord(original.key), current, '拒发不覆盖权威原图记录');
});


for (const [model, enabled, native] of [
    ['nai-diffusion-5-full', true, true],
    ['nai-diffusion-5-full', false, false],
    ['nai-diffusion-4-5-full', true, false],
]) test(`gate:nai-transparent:${model} 开关 ${enabled} 最终请求与抠图`, async t => {
    const floor = { chatId: 'builtin-entry', messageId: 8, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Bob|平静|你好。]' };
    const f = entryFixture({ messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
        readPreviousAiTexts: () => [], on: () => () => {} } });
    t.after(() => f.dispose());
    f.bridge.autoIllustration.nai.model = model;
    Object.assign(f.bridge.imageApi, { naiSpriteTransparent: enabled, dbgenSpriteTransparent: !enabled });
    const first = await f.service.generateCharacterSprite({ name: 'Alice', dna: {} });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(f.writes[0].input.writingRequirements.transparent, native);
    assert.match(f.writes[0].input.userPrompts.positive, native ? /transparent background/ : /white background/);
    const image = await f.open().readStoredImage(first.imageId);
    f.assets.characterDna.Alice = { version: 2, views: image.dnaCandidates.characters[0].views,
        defaultAppearance: image.outfitSnapshot.characters[0].description };
    const expressions = await f.service.generateExpressionSet({ name: 'Alice', moods: ['微笑', '平静'],
        dna: f.assets.characterDna.Alice, note: '轻微笑意，不眯眼' });
    assert.equal(expressions.ok, true, JSON.stringify(expressions));

    const fragmentWrites = f.writes.filter(row => row.input.outputs.format === 'expression-fragments');
    assert.equal(fragmentWrites.length, 1);
    const fragmentInput = fragmentWrites[0].input;
    assert.deepEqual(Object.keys(fragmentInput).sort(), ['characterContext', 'description', 'outputs', 'writingRequirements']);
    assert.deepEqual(fragmentInput.outputs, { format: 'expression-fragments', rows: [
        { slotId: 1, characterKey: 'Alice' }, { slotId: 2, characterKey: 'Alice' },
    ] });
    assert.deepEqual(fragmentInput.writingRequirements, { nsfw: false });
    assert.ok(fragmentInput.description.includes('轻微笑意，不眯眼'));
    const { readCharacterDnaView } = await import('../src/scene/character-dna.js');
    assert.deepEqual(fragmentInput.characterContext, [{ characterKey: 'Alice',
        dna: readCharacterDnaView(f.assets.characterDna.Alice, 'half_body').value,
        outfit: { name: image.outfitSnapshot.characters[0].name, description: 'wears a white dress' },
    }]);
    for (const entry of expressions.items) {
        const saved = await f.open().readStoredImage(entry.imageId);
        assert.equal(saved.promptTask.purpose, 'derived', '完整绑定留在程序侧');
        assert.equal(saved.dnaSnapshot.characters[0].framing, 'half_body');
        assert.equal(saved.outfitSnapshot.characters[0].description, 'wears a white dress');
        assert.ok(saved.expression.positive);
    }

    const final = await f.service.generateCharacterSprite({ name: 'Alice', caption: image.sentPrompt.caption, exact: true });
    assert.equal(final.ok, true, JSON.stringify(final));
    f.assets.enabled = true;
    f.bridge.autoIllustration.assets.spriteEnabled = true;
    const automatic = await f.service.processMessage(8, { manual: true });
    assert.equal(automatic.ok, true, JSON.stringify(automatic));
    assert.equal(automatic.count, 1);
    assert.equal(f.writes.at(-1).input.writingRequirements.transparent, native);
    assert.equal(f.wires.length, 5);
    assert.equal(f.mattes.length, 5);
    for (const wire of f.wires) {
        assert.equal(wire.model, model);
        assert.equal(wire.parameters.straight_alpha, native ? true : undefined);
        assert.equal(wire.parameters.tag_hint_transparent_background, native ? false : undefined);
    }
    assert.ok(f.mattes.every(meta => meta.alreadyTransparent === native && meta.detailed === true));
    assert.match(f.wires[0].input, native ? /transparent background/ : /white background/);
    for (const wire of f.wires.slice(1, 3)) {
        assert.match(wire.input, native ? /transparent background/ : /white background/);
        assert.match(wire.input, /upper body/);
        assert.ok(wire.parameters.v4_prompt.caption.char_captions[0].char_caption.includes('wears a white dress'));
    }
});

test('gate:nai-transparent:开关保存变更使已写词租约失效且改回不复活', async t => {
    const h = builtinImageHarness(); t.after(() => h.dispose());
    const written = await h.backend.writePrompt({ description: 'A quiet room.' });
    assert.equal(written.ok, true, JSON.stringify(written));
    h.bridge.imageApi.naiSpriteTransparent = false; h.runtime.refresh();
    h.bridge.imageApi.naiSpriteTransparent = true; h.runtime.refresh();
    const result = await h.backend.generateCaption(written);
    assert.equal(result.reason, 'stale-config');
    assert.equal(result.stopGeneration, true);
    assert.equal(h.wires.length, 0);
});


test('gate:nai-transparent:在途切换拒收图片且不进入抠图存储', async t => {
    const f = entryFixture(); t.after(() => f.dispose());
    f.waitImages();
    const pending = f.service.generateCharacterSprite({ name: 'Alice', dna: {} });
    for (let i = 0; i < 100 && !f.wires.length; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.wires.length, 1);
    f.bridge.imageApi.naiSpriteTransparent = false; f.runtime.refresh();
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'stale-config');
    assert.equal(result.stopGeneration, true);
    f.release(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.mattes.length, 0);
    const store = createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB });
    assert.equal(await store.getImage('builtin-entry-1'), null);
});

test('gate:nai-transparent:infill 保持非透明契约', async t => {
    const { pngFixture } = await import('./helpers/png-fixture.js');
    const h = builtinImageHarness(); t.after(() => h.dispose());
    const source = pngFixture(64, 64).dataUrl;
    const result = await h.backend.edit({ sourceDataUrl: source, maskDataUrl: source,
        width: 64, height: 64, prompt: 'A quiet room.', transparent: true, strength: 0.4 });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(h.wires.length, 1);
    const wire = h.wires[0];
    assert.equal(wire.action, 'infill');
    assert.equal(wire.parameters.tag_hint_qt, 1);
    assert.equal(wire.parameters.tag_hint_uc_preset, 1);
    assert.equal(wire.parameters.straight_alpha, false);
    assert.equal(wire.parameters.tag_hint_transparent_background, false);
    assert.equal(wire.parameters.inpaintImg2ImgStrength, 0.4);
});


for (const [detail, field, transform] of [
    ['empty-subject', 'dna.views.portrait.subject', views => { views.portrait.subject = ''; }],
    ['subject-required', 'dna.views.partial.subject', views => { views.partial = { negative: 'private negative' }; }],
    ['view-required', 'dna.views.portrait', views => { delete views.portrait; }],
    ['text-too-long', 'dna.views.half_body.subject', views => { views.half_body.subject = 'private'.repeat(600); }],
    ['recursive-placeholder', 'dna.views.portrait.negative', views => { views.portrait.negative = '<<dna_uc:private_token>>'; }],
]) test(`gate:builtin-entry:DNA格式 ${detail} 具体诊断且零绘图`, async t => {
    const reports = [];
    const floor = { chatId: 'builtin-entry', messageId: 4, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平静|你好。]' };
    const f = entryFixture({ assets: { enabled: true, characters: {}, characterDna: {}, scenes: {} },
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
            readPreviousAiTexts: () => [], on: () => () => {} },
        report: (level, message) => reports.push({ level, message }),
        transformWritten(written) { transform(written.dnaCandidates.characters[0].views); } });
    t.after(() => f.dispose());
    f.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    const before = structuredClone(f.assets);
    const manual = await f.service.generateCharacterSprite({ name: 'Alice', dna: {} });
    assert.equal(manual.ok, false);
    assert.equal(manual.reason, 'DNA_VIEW_INVALID');
    assert.equal(manual.diagnostic.field, field);
    assert.equal(manual.diagnostic.detail, detail);
    assert.equal(manual.diagnostic.slotId, 1);
    assert.equal(manual.diagnostic.captionIndex, 0);
    if (['view-required', 'subject-required'].includes(detail)) assert.equal(manual.diagnostic.lineNumber, undefined);
    else assert.ok(Number.isInteger(manual.diagnostic.lineNumber));
    const result = await f.service.processMessage(4, { manual: true });
    assert.equal(result.ok, false);
    assert.equal(f.writes.length, 2, '两个显式入口各写词一次，不自动补发');
    assert.equal(f.wires.length, 0);
    assert.equal(f.mattes.length, 0);
    const records = await createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB }).getAssetsByChat(floor.chatId);
    assert.equal(records.length, 1);
    assert.equal(records[0].status, 'failed');
    assert.ok(reports.some(row => row.message.includes(field)));
    assert.doesNotMatch(JSON.stringify({ manual, reports, error: records[0].error }), /private|<<dna|silver hair/);
    assert.deepEqual(f.assets, before);
});


test('gate:builtin-entry:v4身份衣装动态分层发送且采用资料不串层', async t => {
    const { prepareSpriteIdentityAdoption } = await import('../src/scene/character-identity.js');
    const identity = 'Alice, an adult woman with a black ponytail, dark eyes, an oval face and fair skin,';
    const outfit = 'wears a military combat suit with tactical armor and a tactical headset';
    const dynamic = 'and maintains a serious expression and looks alert.';
    const f = entryFixture({ transformWritten(written) {
        for (const entry of written.captions) {
            for (const candidate of entry.dnaCandidates.characters)
                candidate.views = characterViewsFixture(identity);
            entry.characterMeta.characters[0].outfit.description = outfit;
            const caption = entry.caption.v4_prompt.caption.char_captions[0];
            caption.char_caption = caption.char_caption.replace('and smiles.', dynamic);
        }
    } });
    t.after(() => f.dispose());
    const before = structuredClone(f.assets);
    const generated = await f.service.generateCharacterSprite({ name: 'Alice', dna: {},
        note: '黑发马尾、深色眼睛、椭圆脸、白皙皮肤，穿军用战斗服、护甲和战术耳机，严肃警戒。' });
    assert.equal(generated.ok, true, JSON.stringify(generated));
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 1);
    const image = await f.open().readStoredImage(generated.imageId);
    const adopted = prepareSpriteIdentityAdoption(f.assets, 'Alice', image.id, image, { hadDefault: true });
    assert.equal(adopted.ok, true, JSON.stringify(adopted));
    assert.equal(adopted.patch.characterDna.Alice.defaultAppearance || '', '');
    const selected = adopted.patch.characterDefaultOutfits.Alice.outfitName;
    const entry = adopted.patch.characterOutfits.Alice[selected];
    assert.equal(adopted.patch.wardrobe[entry.wardrobe].prompt, outfit);
    for (const view of Object.values(adopted.patch.characterDna.Alice.views)) {
        assert.equal(view.subject, identity);
        assert.doesNotMatch(view.subject, /wears|combat suit|armor|headset|expression|alert/);
    }
    assert.equal(image.outfitSnapshot.characters[0].description, outfit);
    assert.doesNotMatch(JSON.stringify(image.promptRecipe), /serious expression|looks alert/);
    assert.match(image.promptRecipe.caption.v4_prompt.caption.char_captions[0].char_caption, /<<outfit:.*calm, relaxed, closed mouth/);
    assert.equal(f.wires[0].parameters.v4_prompt.caption.char_captions[0].char_caption,
        `${identity} ${outfit} calm, relaxed, closed mouth`);
    assert.deepEqual(f.assets, before, '生成和准备采用都不直接改已有资料');
});


for (const reply of ['', 'private refusal', 'id: ch2\ntags: private\nuc:',
    'id: ch1\ntags: private\ntags: duplicate\nuc:', 'id: ch1\ntags: private',
    'id: ch1\ntags: private\nuc:\nid: ch1\ntags: duplicate\nuc:']) {
    test(`gate:builtin-entry:v4物品非法回复零绘图-${reply.length}`, async t => {
        const { createItemImageService } = await import('../src/generated-images/illustration/item-image-service.js');
        const f = entryFixture({ reply: () => reply }); t.after(() => f.dispose());
        f.bridge.itemImages = { enabled: true };
        const service = createItemImageService({ nai: f.backend, llm: f.llm, mediaCache: f.mediaCache,
            store: createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB }),
            messageHost: { getChatId: () => 'builtin-entry' }, getSettings: () => f.bridge, readTables: () => [] });
        const result = await service.regenerate('Brass Key');
        assert.equal(result.ok, false); assert.equal(result.stopGeneration, true);
        assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 0);
        assert.doesNotMatch(JSON.stringify(result), /private/);
    });
}

for (const [name, reply, expected] of [
    ['empty', '', { field: 'slots', issue: 'missing-field', slotId: 1 }],
    ['unknown-id', '#2\nscene: private\nchar:\nuc:', { field: 'slots', issue: 'unknown-id', slotId: 2, lineNumber: 1 }],
    ['duplicate-id', '#1\nscene: private\nchar:\nuc:\n#1\nscene: repeated\nchar:\nuc:', { field: 'slots', issue: 'duplicate-id', slotId: 1, lineNumber: 5 }],
    ['duplicate-field', '#1\nscene: private\nscene: repeated\nchar:\nuc:', { field: 'scene', issue: 'duplicate-field', slotId: 1, lineNumber: 3 }],
    ['missing-field', '#1\nscene: private\nchar:', { field: 'uc', issue: 'missing-field', slotId: 1 }],
    ['unexpected-character', '#1\nscene: private\nchar: An intruder.\nuc:', { field: 'char', issue: 'unexpected-character', slotId: 1, lineNumber: 3 }],
    ['code-fence', '```text\n#1\nscene: private\nchar:\nuc:\n```', { field: 'response_format', issue: 'code-fence', lineNumber: 1 }],
    ['invalid-field', '#1\nprivate_key: private', { field: 'slots', issue: 'invalid-field', slotId: 1, lineNumber: 2 }],
]) test(`gate:builtin-entry:v6背景非法回复具体诊断零绘图-${name}`, async t => {
    const reports = [];
    const floor = { chatId: 'builtin-entry', messageId: 3, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-scene:空教室|白天|晴]\n阳光照在空教室的课桌上。' };
    const assets = { enabled: true, characters: {}, characterDna: {}, scenes: {} };
    const f = entryFixture({ assets, reply: () => reply, report: (level, message) => reports.push({ level, message }),
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
            readPreviousAiTexts: () => [], on: () => () => {} } });
    t.after(() => f.dispose());
    f.bridge.autoIllustration.assets = { backgroundEnabled: true, spriteEnabled: false };
    const before = structuredClone(assets);
    const result = await f.service.processMessage(3, { manual: true });
    assert.equal(result.ok, false);
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 0);
    assert.doesNotMatch(JSON.stringify({ result, reports }), /private|An intruder/);
    assert.deepEqual(assets, before);
    const records = await createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB }).getAssetsByChat(floor.chatId);
    assert.equal(records.length, 1); assert.equal(records[0].status, 'failed');
    for (const [key, value] of Object.entries(expected)) {
        const label = key === 'field' ? '字段' : key;
        assert.ok(records[0].error.includes(`${label}=${value}`), records[0].error);
    }
    if (expected.lineNumber === undefined) assert.doesNotMatch(records[0].error, /lineNumber=/);
    assert.ok(reports.some(row => row.level === 'error' && row.message.includes(`issue=${expected.issue}`)));
    assert.doesNotMatch(JSON.stringify({ result, reports, error: records[0].error }), /private|An intruder/);
});

async function cgGrammarFixture(t, transform = text => text) {
    const { secondaryLlmText } = await import('../src/host/secondary-llm-result.js');
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const reply = [
        'slotid: 1', 'at: 1',
        'prompt_mode: dna_template', 'outfit_mode: template',
        'scene: A quiet shelter.', 'scene_uc: lowres',
        'char: 0.5,0.5 | <<dna:r0>> <<outfit:r0>> and waves.', 'char_uc:',
        'meta_kind: 0 | named', 'meta_key: 0 | ExampleAdult',
        'meta_token: 0 | r0', 'meta_frame: 0 | half_body',
        'meta_identity: 0 | ExampleAdult, an adult woman,', 'meta_signature: 0 |',
        'meta_outfit_name: 0 | Navy coat', 'meta_outfit_description: 0 | wears a navy coat',
        'meta_outfit_id: 0 |',
    ].join('\n');
    const reports = [], assets = { characters: {}, characterDna: {}, characterOutfits: {}, wardrobe: {} };
    const before = structuredClone(assets);
    const h = builtinImageHarness({ reply(input) {
        const row = input.promptTask.characters[0];
        assert.equal(row.characterKey, 'ExampleAdult');
        return secondaryLlmText(transform(reply.replaceAll('r0', row.token), row));
    } });
    t.after(() => h.dispose());
    Object.assign(h.bridge.autoIllustration, { interludeEnabled: true, interludeMaxCount: 1 });
    let text = '[igs-scene:避难所|傍晚|阴]\nExampleAdult在物资箱旁挥手。\n[igs-char:ExampleAdult|平静|你好。]';
    const floor = () => ({ chatId: 'cg-grammar', messageId: 7, swipeId: 0, isAi: true, isLatest: true, text });
    const host = { getChatId: () => 'cg-grammar', readFloor: floor, readPreviousAiTexts: () => [],
        async writeFloor(_id, next) { text = next; return { ok: true }; }, on: () => () => {},
        attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }), destroy() {} };
    const store = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
    const service = createAutoIllustrationService({ nai: h.backend, llm: h.llm, store, mediaCache: h.mediaCache,
        messageHost: host, getSettings: () => h.bridge.autoIllustration, getSceneAssets: () => assets,
        report: (level, message) => reports.push({ level, message }) });
    const result = await service.processMessage(7, { manual: true });
    assert.equal(h.writes.length, 1, '活动预设不得修词补发');

    assert.deepEqual(assets, before, 'CG 不建档、不清洗存量资料');
    return { ...h, result, reports, store };
}


for (const [issue, transform, errorPattern] of [
    ['code-fence', text => '<think>private reasoning</think>\n```\n' + text + '\n```', /字段=response_format.*代码围栏.*detail=code-fence.*lineNumber=1/],
    ['tilde-fence', text => '~~~text\n' + text + '\n~~~', /字段=response_format.*detail=code-fence.*lineNumber=1/],
    ['char-layout', (text, row) => text.replace(/^char:.*$/m,
        `char: 0 | named | ExampleAdult | x,y | private body | <<outfit:${row.token}>>`), /字段=char.*captionIndex=0/],
    ['missing-identity-slot', (text, row) => text.replace(`<<dna:${row.token}>>`, 'private body'), /caption.char.*身份占位/],
    ['outfit-name-token', (text, row) => text.replace(`<<outfit:${row.token}>>`, '<<outfit:Navy coat>>'), /衣装模板校验失败/],
    ['missing-outfit-id', text => text.replace('\nmeta_outfit_id: 0 |', ''), /字段=meta_outfit_id.*missing/],
    ['unknown-outfit-id', text => text.replace('meta_outfit_id: 0 |', 'meta_outfit_id: 0 | 999'), /字段=meta_outfit_id.*mismatch/],
    ['invalid-outfit-id', text => text.replace('meta_outfit_id: 0 |', 'meta_outfit_id: 0 | 1.5'), /字段=meta_outfit_id.*invalid/],
    ['duplicate-outfit-id', text => text + '\nmeta_outfit_id: 0 |', /字段=meta_outfit_id.*重复/],
    ['empty-outfit-description', text => text.replace('meta_outfit_description: 0 | wears a navy coat', 'meta_outfit_description: 0 |'), /衣装名称和描述必须完整交付/],
]) test(`gate:builtin-entry:v5CG协议拒收零补发零绘图-${issue}`, async t => {
    const f = await cgGrammarFixture(t, transform);
    assert.equal(f.result.ok, false); assert.equal(f.wires.length, 0);
    const row = await f.store.getFloor('cg-grammar|7|0');
    assert.equal(row.status, 'failed'); assert.match(row.error, errorPattern);
    assert.match(f.result.error, errorPattern);
    assert.ok(f.reports.some(row => row.level === 'error' && errorPattern.test(row.message)));
    assert.doesNotMatch(JSON.stringify({ result: f.result, reports: f.reports, row }),
        /private reasoning|private body|<<dna|<<outfit|navy coat|shoulder-length black hair/);
});

for (const [state, dna, mode] of [
    ['new', {}, 'candidate-required'],
    ['partial', { version: 2, views: { half_body: { subject: 'Alice, an adult with black hair,', negative: 'wrong eyes' } } }, 'candidate-required'],
    ['complete', { version: 2, views: characterViewsFixture('Alice, an adult with black hair,') }, 'saved-only'],
    ['cleared', { identityInitialized: true, identity: '' }, 'identity-cleared'],
]) test(`gate:builtin-entry:显式立绘保留身份且缺默认不自动补图-${state}`, async t => {
    const floor = { chatId: 'builtin-entry', messageId: 4, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平静|你好。]' };
    const f = entryFixture({ assets: { enabled: true, characters: {}, characterDna: { Alice: dna }, scenes: {} },
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
            readPreviousAiTexts: () => [], on: () => () => {} } });
    t.after(() => f.dispose());
    f.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    const before = structuredClone(f.assets);
    const manual = await f.service.generateCharacterSprite({ name: 'Alice', dna });
    const automatic = await f.service.processMessage(4, { manual: true });
    assert.equal(manual.ok, state !== 'cleared', JSON.stringify(manual));
    assert.deepEqual(automatic, { ok: true, reason: 'nothing-missing' });
    assert.equal(f.writes.length, 1, '已知角色缺新默认不自动发起写词');
    assert.equal(f.wires.length, state === 'cleared' ? 0 : 1);

    assert.deepEqual(f.assets, before, '声明清单与生成不改写保存身份');
    if (manual.ok) {
        const image = await f.open().readStoredImage(manual.imageId);
        if (mode === 'saved-only') {
            assert.deepEqual(image.dnaCandidates.characters[0].views, dna.views);
            assert.equal(image.dnaCandidates.characters[0].personality, '', '仅补缺失性格，不重写已有景别');
        }
        else {
            assert.deepEqual(Object.keys(image.dnaCandidates.characters[0].views).sort(), ['full_body', 'half_body', 'portrait']);
            if (state === 'partial') assert.deepEqual(image.dnaCandidates.characters[0].views.half_body, dna.views.half_body);
        }
    }
});

test('gate:builtin-entry:v6半身only候选缺全身头像仍严格拒收', async t => {
    const f = entryFixture({ transformWritten(written) {
        const views = written.dnaCandidates.characters[0].views;
        delete views.full_body; delete views.portrait;
    } });
    t.after(() => f.dispose());
    const before = structuredClone(f.assets);
    const result = await f.service.generateCharacterSprite({ name: 'Alice', dna: {} });
    assert.equal(result.ok, false); assert.equal(result.reason, 'DNA_VIEW_INVALID');
    assert.equal(result.diagnostic.field, 'dna.views.full_body');
    assert.equal(result.diagnostic.detail, 'view-required');
    assert.equal(result.diagnostic.lineNumber, undefined, '缺失字段不伪造行号');
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 0);
    assert.deepEqual(f.assets, before);
});

for (const mode of ['success', 'save-failed', 'default-changed']) {
    test(`gate:builtin-entry:默认衣装再生成保持归属-${mode}`, async t => {
        const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
        const assets = {
            characters: { Alice: { 默认: 'legacy.png' } },
            characterDna: { Alice: { version: 2, views: characterViewsFixture(), defaultAppearance: '旧衣装' } },
            characterOutfits: { Alice: {
                常服: { wardrobe: 'coat', moods: { 平和: 'https://fixture.example/coat.png', 喜悦: 'kept.png' } },
                礼服: { wardrobe: 'dress', moods: { 平和: 'dress.png' } },
            } },
            characterDefaultOutfits: { Alice: { version: 1, outfitName: '常服' } },
            wardrobe: { coat: { prompt: 'wears a blue coat' }, dress: { prompt: 'wears a white dress' } },
        };
        const before = structuredClone(assets);
        const f = entryFixture({ assets, afterWrite() {
            if (mode === 'default-changed') assets.characterDefaultOutfits.Alice.outfitName = '礼服';
        } });
        t.after(() => f.dispose());
        const saves = [];
        const result = await handleSettingsAction('char-generate-sprite:Alice', {
            state: { activeSettings: { draft: { bridge: { ...f.bridge, sceneAssets: assets } }, asyncState: {} } },
            options: { global: { alert() {} }, generatedAssets: f.service },
            dialogs: { confirm: async () => true, edit: async () => '', alert() {} },
            persistSettingsDraft() {
                saves.push(structuredClone(assets));
                return mode === 'save-failed' && saves.length === 1 ? { ok: false, reason: 'save-failed' } : { ok: true };
            }, rerenderSettings: () => ({ ok: true }),
        });
        assert.equal(f.writes.length, 1);
        if (mode === 'default-changed') {
            assert.equal(result.ok, false);
            assert.equal(f.wires.length, 0);
            assert.equal(saves.length, 0);
            before.characterDefaultOutfits.Alice.outfitName = '礼服';
            assert.deepEqual(assets, before);
            return;
        }
        assert.equal(f.wires.length, 1);
        if (mode === 'save-failed') {
            assert.equal(result.ok, false);
            assert.deepEqual(assets, before);
            assert.deepEqual(saves[1], before);
            return;
        }
        assert.equal(result.ok, true, result.error);
        assert.deepEqual(assets.characterDefaultOutfits, before.characterDefaultOutfits);
        assert.deepEqual(assets.characters, before.characters);
        assert.deepEqual(assets.characterOutfits.Alice.礼服, before.characterOutfits.Alice.礼服);
        assert.equal(assets.characterOutfits.Alice.常服.moods.喜悦, 'kept.png');
        const id = assets.characterOutfits.Alice.常服.moods.平和.slice(8);
        const image = await f.open().readStoredImage(id);
        assert.equal(image.outfitSnapshot.characters[0].name, '常服');
        assert.equal(image.outfitSnapshot.characters[0].description, assets.wardrobe.coat.prompt);
        assert.equal(image.outfitSnapshot.characters[0].source, 'saved');
        assert.equal(assets.characterDna.Alice.defaultAppearance, '旧衣装');
        assert.equal(assets.characterSeeds.Alice, f.wires[0].parameters.seed);
        assert.equal(image.seed, assets.characterSeeds.Alice);
    });
}

for (const mode of ['success', 'save-failed', 'readback-mismatch']) {
    test(`gate:builtin-entry:默认立绘新衣装先保存再绘图-${mode}`, async t => {
        const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
        const assets = { characters: { Alice: { 默认: 'original.png' } }, characterDna: {},
            characterOutfits: {}, wardrobe: {} };
        const before = structuredClone(assets), saves = [];
        const f = entryFixture({ assets }); t.after(() => f.dispose());
        const result = await handleSettingsAction('char-generate-sprite:Alice', {
            state: { activeSettings: { draft: { bridge: { ...f.bridge, sceneAssets: assets } }, asyncState: {} } },
            options: { global: { alert() {} }, generatedAssets: f.service },
            dialogs: { confirm: async () => true, edit: async () => '', alert() {} },
            persistSettingsDraft() {
                saves.push(structuredClone(assets));
                if (saves.length === 1) {
                    assert.equal(f.wires.length, 0, '衣装提交之前不发图');
                    assert.deepEqual(assets.characterDna, before.characterDna, '候选尚未采用');
                    if (mode === 'save-failed') return { ok: false, reason: 'fixture-save' };
                    if (mode === 'readback-mismatch') assets.wardrobe = {};
                }
                return { ok: true };
            }, rerenderSettings: () => ({ ok: true }),
        });
        assert.equal(f.writes.length, 1);
        assert.equal(saves.length > 0, true);
        assert.equal(result.ok, mode === 'success', JSON.stringify(result));
        assert.equal(f.wires.length, mode === 'success' ? 1 : 0);
        if (mode === 'save-failed') assert.deepEqual(assets, before);
        if (mode === 'success') {
            const name = assets.characterDefaultOutfits.Alice.outfitName;
            const outfit = assets.characterOutfits.Alice[name];
            const image = await f.open().readStoredImage(outfit.moods.平和.slice(8));
            assert.equal(image.outfitSnapshot.characters[0].description, assets.wardrobe[outfit.wardrobe].prompt);
            assert.deepEqual(image.dnaCandidates.characters[0].views, assets.characterDna.Alice.views);
            assert.equal(assets.characterSeeds.Alice, image.seed);
            assert.equal(image.seed, f.wires[0].parameters.seed);
            const next = await f.open().generateCharacterSprite({ name: 'Alice', dna: assets.characterDna.Alice });
            assert.equal(next.ok, true, JSON.stringify(next));
            assert.equal(next.seed, image.seed);
            assert.equal(f.wires.at(-1).parameters.seed, image.seed);
        }
    });
}