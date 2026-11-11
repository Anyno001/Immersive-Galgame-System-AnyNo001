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

for (const entry of ['manual', 'automatic'])

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

