import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { characterViewsFixture, spriteDataReply } from './helpers/prompt-provenance.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { characterPromptTask } from '../src/generated-images/illustration/character-prompt-task.js';
import { parseSpriteData } from '../src/generated-images/illustration/sprite-data.js';
import { bootstrapIGS } from '../src/index.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createMemoryIllustrationStore, floorKeyOf } from '../src/media/illustration-store.js';
import { pngFixture } from './helpers/png-fixture.js';
import { setImmediate as tick } from 'node:timers/promises';

for (const outcome of ['save', 'cancel', 'write-failed']) test(`legacy DNA upgrades only by explicit character action-${outcome}`, async () => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const assets = { characters: { Alice: { 默认: 'legacy.png' } }, characterDna: {
        Alice: { identity: 'silver hair', defaultAppearance: 'blue coat', triggerWords: 'alice' } } };
    const before = structuredClone(assets);
    let writes = 0;
    const settings = { draft: { bridge: { sceneAssets: assets } }, asyncState: {} };
    const result = await handleSettingsAction('char-upgrade-dna:Alice', {
        state: { activeSettings: settings }, options: { global: { alert() {} } },
        dialogs: { confirm: async () => outcome !== 'cancel', alert() {} },
        persistSettingsDraft() { writes++; return { ok: outcome !== 'write-failed' }; },
        rerenderSettings: () => ({ ok: true }),
    });
    assert.equal(writes, outcome === 'cancel' ? 0 : 1);
    if (outcome !== 'save') assert.deepEqual(assets, before);
    else {
        assert.equal(result.ok, true);
        assert.equal(assets.characterDna.Alice.version, 2);
        for (const [key, value] of Object.entries(before.characterDna.Alice)) assert.equal(assets.characterDna.Alice[key], value);
        assert.deepEqual(assets.characters, before.characters);
        assert.equal(assets.characterDefaultOutfits, undefined);
    }
});

test('upgraded and legacy DNA both retain the existing DBGen writing and painting APIs', async t => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    let writes = 0, paints = 0;
    const backend = createImageBackend({ global: { btoa,
        NaiDbGen: { async generateSinglePrompt() { writes++; return { ok: true, value: { caption: {
            v4_prompt: { caption: { base_caption: 'silver hair, blue coat', char_captions: [] } },
            v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } },
        } } }; }, async generate() { paints++; return { ok: true, value: [{ blob: new Blob(['fixture'], { type: 'image/png' }) }] }; } } },
        getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const service = createAssetGenerationService({ nai: backend, store: createMemoryGeneratedAssetStore(),
        messageHost: { getChatId: () => 'legacy' }, getSettings: () => ({}), matte: async url => url });
    t.after(() => service.stop());
    const legacy = await service.generateCharacterSprite({ name: 'Alice', dna: { identity: 'silver hair', defaultAppearance: 'blue coat' } });
    assert.equal(legacy.ok, true, JSON.stringify(legacy));
    assert.deepEqual([writes, paints], [1, 1]);
    const upgraded = await service.generateCharacterSprite({ name: 'Alice', dna: { version: 2 } });
    assert.equal(upgraded.ok, true, JSON.stringify(upgraded));
    assert.deepEqual([writes, paints], [2, 2]);
});

function entryFixture(options = {}) {
    const h = builtinImageHarness(options), indexedDB = createTransactionalIdb();
    const assets = options.assets || { characters: { Alice: { 默认: 'original.png' } }, characterDna: {}, scenes: {} };
    let sequence = 0;
    const mattes = [];
    const open = () => createAssetGenerationService({ nai: h.backend, llm: h.llm,
        store: createIndexedDbGeneratedAssetStore({ indexedDB }),
        messageHost: options.messageHost || { getChatId: () => 'builtin-entry' },
        getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        matte: async (url, meta) => { mattes.push(meta); return url; }, report: options.report || ((level, message) => { if (process.env.IGS_DEBUG_FIXTURE) console.log(level, message); }), newId: () => `builtin-entry-${++sequence}` });
    return { ...h, assets, indexedDB, mattes, service: open(), open };
}

for (const action of ['打开日志', '关闭设置', '编辑草稿', '保存角色']) test(`内置三人补全与设置窗口-${action}`, async t => {
    let written;
    const writing = new Promise(resolve => { written = resolve; });
    const h = builtinImageHarness({ beforeWrite: () => written() });
    h.waitWriting();
    h.bridge.sceneAssets = { enabled: true, characters: {}, characterDna: {}, scenes: {} };
    h.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false, maxPerFloor: 16 };
    const floor = { chatId: 'builtin-logs', messageId: 1, swipeId: 0, isAi: true, isLatest: true,
        text: ['阿不思', '老板娘玛莎', '男路人B'].map(name =>
            `[igs-char:${name}|平和|${'正在这里说话。'.repeat(15)}]`).join('\n') };
    const callbacks = [], wires = [], store = createMemoryGeneratedAssetStore();
    const context = { name2: 'Current', extensionPrompts: {},
        getWorldInfoPrompt: async () => ({ worldInfoString: '' }) };
    const vn = bootstrapIGS({
        global: { localStorage: createMemoryStorage(), btoa, SillyTavern: { getContext: () => context } },
        config: h.bridge, secondaryLlm: h.llm, generatedAssetStore: store,
        illustrationStore: createMemoryIllustrationStore(), autoAttachMagicWand: false,
        alphaMatte: async url => url,
        illustrationMessageHost: { getChatId: () => floor.chatId, readFloor: () => ({ ...floor }),
            readPreviousAiTexts: () => [], readCharacterLore: async () => [], on: () => () => {},
            onImageFloorReady(fn) { callbacks.push(fn); return () => {}; }, destroy() {},
            attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }) },
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
        async fetch(_url, init) {
            const body = JSON.parse(init.body); wires.push(body);
            return new Response(pngFixture(body.parameters.width, body.parameters.height).bytes,
                { headers: { 'Content-Type': 'image/png' } });
        },
    });
    t.after(async () => { h.dispose(); await vn.shutdown(); });
    let opened;
    if (action === '关闭设置') {
        opened = vn.openSettings({ page: 'logs' });
    }
    const before = structuredClone(vn.getUnifiedSettings().bridge.sceneAssets);
    for (const callback of callbacks) callback(1);
    await writing;
    if (action === '关闭设置') assert.equal(opened.controller.close().ok, true);
    else {
        opened = vn.openSettings({ page: 'logs' });
        if (['编辑草稿', '保存角色'].includes(action)) {
            opened.controller.setValue('bridge.sceneAssets.characterDna.阿不思.identity', 'manual identity');
            if (action === '保存角色') assert.equal(opened.controller.close().ok, true);
        }
    }
    h.release();
    let result;
    for (let i = 0; i < 200; i++) {
        result = await store.getFloor(floorKeyOf(floor));
        if (['done', 'failed'].includes(result?.status)) break;
        await tick();
    }
    assert.equal(result?.status, 'done', JSON.stringify(result));
    assert.deepEqual([h.writes.length, wires.length, result.count], [1, 3, 3]);
    const live = vn.getUnifiedSettings().bridge.sceneAssets;
    if (action === '保存角色') assert.equal(live.characterDna.阿不思.identity, 'manual identity');
    else {
        assert.deepEqual(live.characters, before.characters);
        assert.deepEqual(live.characterDna, before.characterDna);
        assert.deepEqual(live.characterOutfits || {}, before.characterOutfits || {});
        assert.deepEqual(live.wardrobe || {}, before.wardrobe || {});
    }
});

test('内置自动立绘出图期间切卡不接收迟到图片或进入抠图保存', async t => {
    const floor = { chatId: 'original', messageId: 1, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平静|你好。]' };
    let sent;
    const painting = new Promise(resolve => { sent = resolve; });
    const f = entryFixture({ assets: { enabled: true, characters: {}, characterDna: {}, scenes: {} },
        beforePaint: () => sent(),
        messageHost: { getChatId: () => floor.chatId, readFloor: () => ({ ...floor }),
            readPreviousAiTexts: () => [], on: () => () => {} } });
    t.after(() => { f.service.stop(); f.dispose(); });
    f.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    f.waitImages();
    const pending = f.service.processMessage(1, { manual: true });
    await painting;
    assert.equal(f.wires.length, 1);
    floor.chatId = 'another-card';
    f.release();
    assert.equal((await pending).ok, false);
    assert.equal(f.mattes.length, 0);
    const store = createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB });
    const records = await store.getAssetsByChat('original');
    assert.ok(records.every(record => !record.imageId));
});
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
    assert.equal(saved.characterDefaultOutfits?.Alice, undefined, '旧立绘继续使用，生成命名衣装不自动切换');
    assert.equal(saved.characters.Alice.默认, 'original.png');
    const entry = saved.characterOutfits.Alice[clothing.name];
    assert.equal(entry.moods.平和, `igs-gen:${image.id}`);
    assert.equal(saved.wardrobe[entry.wardrobe].prompt, clothing.description);
    assert.deepEqual(f.assets, before);
});

test('手动默认立绘首次建档附上角色卡与世界书参考', async t => {
    const asked = [];
    const lore = [{ name: 'Alice', text: '角色卡：身高152cm，黑色长发。' }];
    const f = entryFixture({ messageHost: { getChatId: () => 'builtin-entry',
        readCharacterLore: async (names, options) => { asked.push({ names, options }); return lore; } } });
    t.after(() => f.dispose());
    const generated = await f.service.generateCharacterSprite({ name: 'Alice', dna: {} });
    assert.equal(generated.ok, true, JSON.stringify(generated));
    assert.deepEqual(asked, [{ names: ['Alice'], options: { includeWorldInfo: true } }]);
    assert.deepEqual(f.writes[0].input.lore, lore);
});

test('手动默认立绘设定读取失败时不发送写词', async t => {
    const f = entryFixture({ messageHost: { getChatId: () => 'builtin-entry',
        readCharacterLore: async () => { throw new Error('offline'); } } });
    t.after(() => f.dispose());
    const generated = await f.service.generateCharacterSprite({ name: 'Alice', dna: {} });
    assert.equal(generated.ok, false);
    assert.equal(generated.reason, 'dna-lore-unavailable');
    assert.deepEqual([f.writes.length, f.wires.length], [0, 0]);
});

test('手动默认立绘生成期间保存其它衣装，完成后合并而不覆盖', async t => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const assets = { characters: { Alice: {} }, characterDna: { Alice: { version: 2,
        views: characterViewsFixture(), personality: '' } }, characterOutfits: {}, wardrobe: {} };
    const f = entryFixture({ assets, beforePaint() {
        assets.wardrobe['Bob·雨衣'] = { prompt: 'yellow raincoat' };
        assets.characterOutfits.Bob = { 雨衣: { wardrobe: 'Bob·雨衣', moods: {} } };
        assets.characterOutfits.Alice.另一套衣服 = { wardrobe: 'Bob·雨衣', moods: {} };
    } });
    t.after(() => f.dispose());
    const settings = { draft: { bridge: { sceneAssets: assets } }, asyncState: {} };
    const result = await handleSettingsAction('char-generate-sprite:Alice', {
        state: { activeSettings: settings }, options: { global: { alert() {} }, generatedAssets: f.service },
        dialogs: { confirm: async () => true, edit: async () => '', alert() {} },
        persistSettingsDraft: () => ({ ok: true }), rerenderSettings: () => ({ ok: true }),
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual([f.writes.length, f.wires.length], [1, 1]);
    assert.equal(assets.wardrobe['Bob·雨衣'].prompt, 'yellow raincoat');
    assert.equal(assets.characterOutfits.Alice.另一套衣服.wardrobe, 'Bob·雨衣');
    const selected = assets.characterDefaultOutfits.Alice.outfitName;
    assert.notEqual(selected, '另一套衣服');
    assert.ok(assets.characterOutfits.Alice[selected].moods.平和);
});

for (const action of ['同套衣装先加入', '新增其它衣装', '已有说明冲突', '已选择其它默认'])
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
    const { createItemImageService } = await import('./helpers/media-fixtures.js');
    const f = entryFixture({ reply: input => input.outputs.items.map(({ id }) =>
        `id: ${id}\ntags: A brass key on a plain surface.\nuc: text`).join('\n') });
    t.after(() => f.dispose()); f.bridge.itemImages = { enabled: true };
    const floor = { chatId: 'builtin-entry', messageId: 5, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-fx:item|获得|黄铜钥匙|旧钥匙]\n她把黄铜钥匙放在桌上。' };
    const store = createIndexedDbGeneratedAssetStore({ indexedDB: f.indexedDB });
    const service = createItemImageService({ nai: f.backend, llm: f.llm, store,
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
    assert.deepEqual(fragmentInput.writingRequirements, { nsfw: false, transparent: native });
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
    assert.equal(adopted.patch.characterDefaultOutfits?.Alice, undefined);
    const selected = image.outfitSnapshot.characters[0].name;
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


async function cgGrammarFixture(t, transform = text => text) {
    const { secondaryLlmText } = await import('../src/host/secondary-llm-result.js');
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
    const service = createAutoIllustrationService({ nai: h.backend, llm: h.llm, store,
        messageHost: host, getSettings: () => h.bridge.autoIllustration, getSceneAssets: () => assets,
        report: (level, message) => reports.push({ level, message }) });
    const result = await service.processMessage(7, { manual: true });
    assert.equal(h.writes.length, 1, '活动预设不得修词补发');

    assert.deepEqual(assets, before, 'CG 不建档、不清洗存量资料');
    return { ...h, result, reports, store };
}



test('无关资料并行保存：自动立绘写词期间添加同角色其它衣装仍完成', async t => {
    const floor = { chatId: 'merge-outfits', messageId: 1, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平和|你好。]' };
    const f = entryFixture({ assets: { enabled: true, characters: {}, characterDna: {}, scenes: {} },
        beforeWrite() {
            f.assets.characterOutfits = { Alice: { 雨衣: { wardrobe: 'raincoat', moods: {} } } };
            f.assets.wardrobe = { raincoat: { prompt: 'yellow raincoat' } };
        }, messageHost: { getChatId: () => floor.chatId, readFloor: () => ({ ...floor }),
            readPreviousAiTexts: () => [], on: () => () => {} } });
    t.after(() => { f.service.stop(); f.dispose(); });
    f.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    const result = await f.service.processMessage(1, { manual: true });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.wires.length, 1);
    assert.equal(f.assets.wardrobe.raincoat.prompt, 'yellow raincoat');
});


test('无关资料并行保存：头像出图时更新立绘与其它衣装仍采用头像', async t => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const assets = { characters: { Alice: { 默认: 'old.png' } }, characterDna: { Alice: {
        version: 2, views: characterViewsFixture() } }, characterOutfits: {}, wardrobe: {} };
    const f = entryFixture({ assets, beforePaint() {
        assets.characters.Alice.默认 = 'updated-sprite.png';
        assets.wardrobe = { raincoat: { prompt: 'yellow raincoat' } };
        assets.characterOutfits.Alice = { 雨衣: { wardrobe: 'raincoat', moods: {} } };
    } });
    t.after(() => { f.service.stop(); f.dispose(); });
    const settings = { draft: { bridge: { sceneAssets: assets } }, asyncState: {} };
    const result = await handleSettingsAction('status-avatar-generate:Alice', {
        state: { activeSettings: settings }, options: { global: { alert() {} }, generatedAssets: f.service },
        dialogs: { confirm: async () => true, alert() {} },
        persistSettingsDraft: () => ({ ok: true }), rerenderSettings: () => ({ ok: true }),
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.wires.length, 1);
    assert.ok(assets.statusAvatars.Alice);
    assert.equal(assets.characters.Alice.默认, 'updated-sprite.png');
});

test('无关资料并行保存：候选入库回读时添加衣装，采用保留最新资料', async t => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const floor = { chatId: 'adopt-read-merge', messageId: 1, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平和|你好。]' };
    const f = entryFixture({ assets: { enabled: true, characters: {}, characterDna: {}, scenes: {} },
        messageHost: { getChatId: () => floor.chatId, readFloor: () => ({ ...floor }),
            readPreviousAiTexts: () => [], on: () => () => {} } });
    t.after(() => { f.service.stop(); f.dispose(); });
    f.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    assert.equal((await f.service.processMessage(1, { manual: true })).ok, true);
    const record = f.service.listReview(floorKeyOf(floor))[0];
    const settings = { draft: { bridge: { sceneAssets: f.assets } }, asyncState: {} };
    const result = await handleSettingsAction(`gen-temp-accept:${encodeURIComponent(record.key)}`, {
        state: { activeSettings: settings }, options: { global: { alert() {} }, generatedAssets: { ...f.service,
            async readStoredImage(id) {
                f.assets.wardrobe = { ...f.assets.wardrobe, raincoat: { prompt: 'yellow raincoat' } };
                f.assets.characterOutfits = { ...f.assets.characterOutfits,
                    Alice: { ...f.assets.characterOutfits?.Alice, 雨衣: { wardrobe: 'raincoat', moods: {} } } };
                return f.service.readStoredImage(id);
            } } }, dialogs: { prompt: async () => 'Alice', alert() {} },
        persistSettingsDraft: () => ({ ok: true }), rerenderSettings: () => ({ ok: true }),
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.assets.wardrobe.raincoat.prompt, 'yellow raincoat');
    assert.ok(f.assets.characterOutfits.Alice.雨衣);
    assert.equal(f.service.getRecord(record.key).status, 'library');
});
