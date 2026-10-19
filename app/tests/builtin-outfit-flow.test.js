import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { characterViewsFixture } from './helpers/prompt-provenance.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';

function outfitAssets() {
    return { characters: { Alice: { 默认: 'original.png' } },
        characterSeeds: { Alice: 42 },
        characterDna: { Alice: { version: 2, views: characterViewsFixture() } },
        characterOutfits: { Alice: { 礼服: { words: [], moods: {} } } }, wardrobe: {} };
}
function outfitBuiltinFixture(options = {}) {
    const assets = options.assets || outfitAssets();
    const h = builtinImageHarness(options), indexedDB = createTransactionalIdb();
    const imageIds = [];
    let sequence = 0;
    const readAssets = options.readAssets || (() => assets);
    const open = () => {
        const raw = createIndexedDbGeneratedAssetStore({ indexedDB });
        const store = { ...raw, async putImage(value) { await raw.putImage(value); imageIds.push(value.id); } };
        return createAssetGenerationService({ nai: h.backend, llm: h.llm, store,
            messageHost: { getChatId: () => 'builtin-fixture' },
            getSettings: () => ({ ...h.bridge, sceneAssets: readAssets() }),
            report() {}, newId: () => `builtin-outfit-${++sequence}`, matte: async url => url });
    };
    return { ...h, assets, indexedDB, imageIds, open, service: open(),
        get active() { return h.active; }, get maxActive() { return h.maxActive; } };
}
async function waitFor(check) {
    const end = Date.now() + 3000;
    while (!check() && Date.now() < end) await new Promise(resolve => setImmediate(resolve));
    assert.ok(check(), '隔离端口未到达预期等待点');
}
const outfitAction = suffix => `${suffix}:Alice:${encodeURIComponent('礼服')}`;
function settingsContext(f, assets, persist, extra = {}) {
    const settings = { draft: { bridge: { sceneAssets: assets } }, asyncState: {} };
    return { settings, ctx: { state: { activeSettings: settings },
        options: { global: { alert() {} }, generatedAssets: { ...f.service,
            getImagePrompt() { assert.fail('无旧图的新差分不得读取完整旧词'); }, ...extra } },
        dialogs: { choose: async () => '1', confirm: async () => true, edit: async () => '', alert() {} },
        persistSettingsDraft: persist, rerenderSettings: () => ({ ok: true }) } };
}

for (const mode of ['success', 'save-recovered', 'paint-failed', 'readback-mismatch', 'wrong-outfit']) {
    test(`gate:builtin-outfit:设置页先保存服装再绘图-${mode}`, async t => {
        const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
        const assets = outfitAssets(), storage = createMemoryStorage();
        Object.assign(assets.characterOutfits.Alice, {
            破损衣物: { wardrobe: 'old-torn', moods: { 平和: 'old-torn.png' } },
            干净便服: { wardrobe: 'old-clean', moods: { 平和: 'old-clean.png' } },
        });
        Object.assign(assets.wardrobe, { 'old-torn': { prompt: 'wears a torn gray jacket' },
            'old-clean': { prompt: 'wears a blue cotton shirt' } });
        assets.characterDefaultOutfits = { Alice: { version: 1, outfitName: '破损衣物' } };
        const before = structuredClone(assets);
        storage.setItem('fixture-assets', JSON.stringify(assets));
        const saves = [];
        const f =outfitBuiltinFixture({ assets,
            readAssets: () => JSON.parse(storage.getItem('fixture-assets')),
            paintFailure: () => mode === 'paint-failed',
            beforeWrite(input) {
                const character = input.characterContext[0];
                assert.equal(character.characterKey, 'Alice');
                assert.deepEqual(character.dna.views, before.characterDna.Alice.views);
                assert.equal(character.outfit.name, '礼服');
                assert.equal(character.outfit.description, '');
                assert.equal(Object.hasOwn(character, 'outfits'), false, '资料请求不提供其他衣装');
                assert.equal(Object.hasOwn(input, 'userPrompts'), false, '绘图构图保留在本地');
            },
            ...(mode === 'wrong-outfit' && { reply: () => 'slotid: 1\ncharacter: Alice\n'
                + 'outfit_name: 干净便服\noutfit_description: wears a blue cotton shirt' }),
            beforePaint() {
                const saved = JSON.parse(storage.getItem('fixture-assets'));
                assert.equal(saved.wardrobe['Alice·礼服'].prompt, 'wears a white dress');
                assert.deepEqual(saved.characterOutfits.Alice.礼服.moods, {});
            } });
        t.after(() => f.dispose());
        const { ctx } = settingsContext(f, assets, () => {
            saves.push(structuredClone(assets)); f.events.push('save');
            if (mode === 'save-recovered' && saves.length === 1) return { ok: false, reason: 'fixture-save' };
            if (mode === 'readback-mismatch' && saves.length === 1)
                assets.wardrobe['Alice·礼服'].prompt = 'mismatched saved clothing';
            storage.setItem('fixture-assets', JSON.stringify(assets));
            return { ok: true };
        });
        const result = await handleSettingsAction(outfitAction('outfit-expression-set'), ctx);
        assert.equal(f.writes.length, mode === 'wrong-outfit' ? 3 : 1,
            '合法资料只提取一次；错名回复按既有上限结束，不保存或出图');
        assert.equal(f.writes[0].input.outputs.format, 'sprite-data');

        if (mode === 'wrong-outfit') {
            assert.equal(result.ok, false);
            assert.equal(saves.length, 0); assert.equal(f.wires.length, 0); assert.equal(f.imageIds.length, 0);
            assert.deepEqual(JSON.parse(storage.getItem('fixture-assets')), before);
            assert.deepEqual(assets, before, '不能将错名描述改名保存为目标衣装');
            return;
        }
        assert.deepEqual(saves[0].characterOutfits.Alice.礼服.moods, {});
        if (mode === 'readback-mismatch') {
            assert.equal(result.ok, false); assert.equal(f.wires.length, 0);
            assert.equal(f.imageIds.length, 0);
            return;
        }
        if (mode === 'save-recovered') assert.ok(saves.length >= 2, '保存恢复复用已提取的服装资料');
        assert.equal(f.wires.length, 1);
        assert.ok(f.events.indexOf('save') < f.events.indexOf('paint'));
        assert.deepEqual(assets.characterDna, before.characterDna);
        assert.deepEqual(assets.characters, before.characters);
        assert.deepEqual(assets.characterDefaultOutfits, before.characterDefaultOutfits);
        for (const key of ['old-torn', 'old-clean']) assert.deepEqual(assets.wardrobe[key], before.wardrobe[key]);
        for (const key of ['破损衣物', '干净便服'])
            assert.deepEqual(assets.characterOutfits.Alice[key], before.characterOutfits.Alice[key]);
        assert.equal(assets.wardrobe['Alice·礼服'].prompt, 'wears a white dress');
        if (mode === 'paint-failed') {
            assert.equal(f.imageIds.length, 0);
            const recovery = assets.generated.expressionNotes['Alice\u0001礼服'].平和;
            assert.ok(recovery.promptRecipe); assert.equal(assets.characterOutfits.Alice.礼服.moods.平和, '');
            return;
        }
        assert.equal(result.ok, true, JSON.stringify(result));
        const id = assets.characterOutfits.Alice.礼服.moods.平和.slice('igs-gen:'.length);
        const image = await f.open().readStoredImage(id);
        assert.equal(image.outfitSnapshot.characters[0].source, 'saved');
        assert.equal(image.outfitSnapshot.characters[0].name, '礼服');
        assert.equal(image.outfitSnapshot.characters[0].description, 'wears a white dress');
        assert.deepEqual(image.outfitContext[0].outfits.filter(o => o.name !== '礼服'), [
            { name: '破损衣物', description: 'wears a torn gray jacket', default: true },
            { name: '干净便服', description: 'wears a blue cotton shirt' },
        ], '完整旧衣柜仍留在程序侧来源证据中');
        assert.equal(image.sentPrompt.action, 'generate');
        assert.equal(image.seed, 42);
        assert.equal(f.wires[0].parameters.seed, 42);
        assert.equal(assets.characterSeeds.Alice, 42);
        assert.deepEqual(image.sentPrompt.caption.v4_prompt.caption, f.wires[0].parameters.v4_prompt.caption);
        assert.equal(image.dnaCandidates, undefined);
    });
}

for (const mode of ['success', 'image-save-failed', 'paint-failed', 'existing-default']) {
    test(`gate:builtin-outfit:新衣装立绘保存时接替缺省默认-${mode}`, async t => {
        const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
        const { readDefaultOutfit } = await import('../src/scene/character-appearance.js');
        const assets = outfitAssets(), storage = createMemoryStorage();
        assets.wardrobe.dress = { prompt: 'wears a white dress', promptHalfBody: 'wears a white dress' };
        assets.characterOutfits.Alice.礼服.wardrobe = 'dress';
        if (mode === 'existing-default') {
            assets.characterOutfits.Alice.常服 = { wardrobe: 'coat', moods: { 平和: 'coat.png' } };
            assets.wardrobe.coat = { prompt: 'wears a blue coat' };
            assets.characterDefaultOutfits = { Alice: { version: 1, outfitName: '常服' } };
        }
        storage.setItem('initial-default', JSON.stringify(assets));
        const f = outfitBuiltinFixture({ assets,
            readAssets: () => JSON.parse(storage.getItem('initial-default')),
            paintFailure: () => mode === 'paint-failed',
            beforePaint() {
                assert.equal(readDefaultOutfit(assets, 'Alice').ok, mode === 'existing-default',
                    '绘图尚未成功时不提前设默认');
            } });
        t.after(() => f.dispose());
        let saves = 0;
        const { ctx } = settingsContext(f, assets, () => {
            saves++;
            if (mode === 'image-save-failed' && saves === 1) return { ok: false, reason: 'fixture-save' };
            storage.setItem('initial-default', JSON.stringify(assets)); return { ok: true };
        });
        const result = await handleSettingsAction(outfitAction('outfit-expression-set'), ctx);
        assert.equal(f.writes.length, 0, '保存双 DNA 齐全时不重新写词');
        assert.equal(f.wires.length, 1);
        const saved = JSON.parse(storage.getItem('initial-default'));
        if (['image-save-failed', 'paint-failed'].includes(mode)) {
            assert.equal(readDefaultOutfit(assets, 'Alice').reason, 'default-outfit-unset');
            assert.equal(readDefaultOutfit(saved, 'Alice').reason, 'default-outfit-unset');
            assert.equal(saved.characterOutfits.Alice.礼服.moods.平和 || '', '');
            if (mode === 'image-save-failed') assert.equal(result.ok, false);
        } else {
            assert.equal(result.ok, true, JSON.stringify(result));
            assert.equal(readDefaultOutfit(saved, 'Alice').outfitName,
                mode === 'existing-default' ? '常服' : undefined);
            const imageId = saved.characterOutfits.Alice.礼服.moods.平和.slice(8);
            assert.ok((await f.open().readStoredImage(imageId)).dataUrl);
        }
    });
}

test('gate:builtin-outfit:当前双 DNA 续画零写词，模板与历史发送快照保真', async t => {
    const assets = outfitAssets();
    const full = '1.2::white dress::, ribbon, black footwear, knee boots';
    const half = '1.2::white dress::, ribbon';
    assets.wardrobe.dress = full;
    assets.characterOutfits.Alice.礼服.wardrobe = 'dress';
    const f = outfitBuiltinFixture({ assets, outfitHalfBody: half });
    t.after(() => { f.service.stop(); f.dispose(); });
    const { prepareOutfitDnaSave } = await import('../src/scene/outfit-identity.js');
    let saves = 0;
    const first = await f.service.generateExpressionSet({ name: 'Alice', dna: assets.characterDna.Alice,
        outfit: { name: '礼服' }, moods: ['平和'], onOutfitDna(clothing) {
            saves++;
            const saved = prepareOutfitDnaSave(assets, 'Alice', clothing.name, clothing.description,
                { descriptionHalfBody: clothing.descriptionHalfBody });
            assert.equal(saved.ok, true); Object.assign(assets, saved.patch);
            return { ok: true };
        } });
    assert.equal(first.items[0].ok, true, JSON.stringify(first));
    assert.equal(saves, 1);
    assert.deepEqual(assets.wardrobe.dress, { prompt: full, promptHalfBody: half });

    const original = await f.open().readStoredImage(first.items[0].imageId);
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 1);
    assets.characterDna.Alice.views.half_body.subject = 'Alice, an adult woman with black hair,';
    assets.wardrobe.dress.prompt = 'wears a blue silk dress with a $5 brooch';
    assets.wardrobe.dress.promptHalfBody = 'wears a blue silk dress with a $5 brooch';
    const resumed = await f.open().generateExpressionImage({ name: 'Alice', mood: '平和',
        dna: assets.characterDna.Alice, outfit: { name: '礼服' }, caption: original.prompt.caption,
        promptRecipe: original.promptRecipe, promptTask: original.promptTask,
        characterMeta: original.characterMeta, slotId: original.slotId });
    assert.equal(resumed.items[0].ok, true, JSON.stringify(resumed));
    assert.equal(f.writes.length, 1, '只补一次半身资料，显式续画复用当前已保存资料'); assert.equal(f.wires.length, 2);
    const current = await f.open().readStoredImage(resumed.items[0].imageId);
    assert.equal(current.sentPrompt.caption.v4_prompt.caption.char_captions[0].char_caption,
        original.promptRecipe.caption.v4_prompt.caption.char_captions[0].char_caption
            .replace('<<dna:r0>>', assets.characterDna.Alice.views.half_body.subject)
            .replace('<<outfit:r0>>', assets.wardrobe.dress.prompt));
    assert.deepEqual(current.promptRecipe, original.promptRecipe);
    assert.deepEqual(await f.open().readStoredImage(original.id), original);
    assert.equal(current.outfitSnapshot.characters[0].source, 'saved');
    const edited = await f.open().saveImagePrompt(original.id, { caption: {
        v4_prompt: { caption: { base_caption: 'My saved final scene.', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'my final negative', char_captions: [] } },
    } }, original.revision);
    assert.equal(edited.ok, true, JSON.stringify(edited));
    const final = await f.open().getImagePrompt(original.id);
    const redraw = await f.open().generateExpressionImage({ name: 'Alice', mood: '平和', dna: {},
        outfit: { name: '礼服' }, caption: final.caption, exact: true, history: final });
    assert.equal(redraw.items[0].ok, true, JSON.stringify(redraw));
    assert.equal(f.writes.length, 1);
    assert.equal(f.wires[2].parameters.v4_prompt.caption.base_caption, 'artist:fixture, My saved final scene.');
    assert.equal(f.wires[2].parameters.v4_prompt.caption.char_captions.length, 0);
    assert.deepEqual(f.wires.map(w => w.parameters.seed), [42, 42, 42]);
    assert.equal(current.seed, original.seed);
});

for (const phase of ['writing', 'queued', 'inflight']) {
    test(`gate:builtin-outfit:目标变化-${phase} 拒发或拒收迟到图片`, async t => {
        const assets = outfitAssets();
        assets.wardrobe.dress = { prompt: 'wears a white dress' };
        assets.characterOutfits.Alice.礼服.wardrobe = 'dress';
        const f = outfitBuiltinFixture({ assets }); t.after(() => f.dispose());
        let live = true, blocker;
        if (phase === 'writing') f.waitWriting(); else f.waitImages();
        if (phase === 'queued') {
            blocker = f.backend.generate({ scene: 'credential blocker' }, f.bridge.autoIllustration.nai);
            await waitFor(() => f.gates.length === 1);
        }
        const pending = f.service.generateExpressionSet({ name: 'Alice', dna: assets.characterDna.Alice,
            outfit: { name: '礼服' }, moods: [phase === 'writing' ? '喜悦' : '平和'],
            shouldStart: () => live });
        await waitFor(() => phase === 'writing' ? f.gates.length === 1
            : f.wires.length === 1);
        if (phase === 'queued') await new Promise(resolve => setTimeout(resolve, 20));
        live = false; f.release();
        const stopped = await pending;
        if (blocker) assert.equal((await blocker).ok, true);
        assert.equal(stopped.items?.some(item => item.ok) || false, false, JSON.stringify(stopped));
        assert.equal(f.wires.length, phase === 'writing' ? 0 : 1);
        assert.equal(f.imageIds.length, 0, '目标失效后不存迟到图片');
        assert.equal(f.active, 0);
        assert.deepEqual(assets.characters.Alice, { 默认: 'original.png' });
    });
}


async function storyBuiltinFixture(mode = 'success') {
    const { createStoryOutfitService } = await import('../src/generated-images/illustration/story-outfit-service.js');
    const { effectiveSceneAssets } = await import('../src/scene/asset-scope.js');
    const storage = createMemoryStorage(), source = outfitAssets();
    source.characterOutfits = {};
    const original = { cards: { 'card:Current': source } };
    storage.setItem('fixture-root', JSON.stringify(original));
    const root = () => JSON.parse(storage.getItem('fixture-root'));
    let floorKey = 'chat|39|0', saveFailed = true, autoGenerate = false;
    let paintFailed = ['paint-failed', 'recovery-save-failed'].includes(mode);
    const f = outfitBuiltinFixture({ readAssets: () => effectiveSceneAssets(root(), 'card:Current'),
        outfitHalfBody: 'white dress',
        paintFailure: () => paintFailed,
        beforeWrite(input) {
            assert.equal(input.characterContext[0].outfit.name, '礼服');
            if (mode === 'write-failed') throw new Error('isolated-writing-failure');
        },
        beforePaint() {
            const clothing = root().cards['card:Current'].wardrobe['Alice·礼服'];
            assert.deepEqual(clothing, { prompt: 'wears a white dress', promptHalfBody: 'white dress' },
                '两份服装 DNA 持久化后才出图');
        } });
    const deps = { storage, assets: f.service,
        getContext: () => ({ root: root(), scopeKey: 'card:Current', floorKey,
            messageId: 39, sourceHash: 'source-1', text: 'Alice 换上白色礼服。', autoGenerate }),
        commit(next, expected, guard) {
            assert.equal(guard(), true); assert.deepEqual(root(), expected); f.events.push('save');
            const library = next.cards['card:Current'];
            if (saveFailed && mode === 'save-failed') return { ok: false, reason: 'fixture-save' };
            if (saveFailed && mode === 'image-save-failed' && library.characterOutfits?.Alice?.礼服?.moods?.平和)
                return { ok: false, reason: 'fixture-image-save' };
            if (saveFailed && mode === 'recovery-save-failed' && library.generated?.expressionNotes)
                return { ok: false, reason: 'fixture-recovery-save' };
            storage.setItem('fixture-root', JSON.stringify(next)); return { ok: true };
        } };
    let service = createStoryOutfitService(deps);
    return { f, storage, root, original, get service() { return service; },
        reopen() { service.dispose(); service = createStoryOutfitService(deps); },
        setAutoGenerate(value) { autoGenerate = value; },
        recoverPaint() { paintFailed = false; }, recoverSave() { saveFailed = false; },
        changeTarget() { floorKey = 'other-chat|39|0'; },
        dispose() { service.dispose(); f.dispose(); } };
}

test('衣装入库框：正文更新复用同一候选，旧重复保留成品并只采用一次', async t => {
    const { createStoryOutfitService } = await import('../src/generated-images/illustration/story-outfit-service.js');
    const { loadStoryOutfitCandidates, saveStoryOutfitCandidates, storyOutfitId } = await import('../src/scene/outfit-review-store.js');
    const storage = createMemoryStorage();
    let root = { enabled: true, characters: { 天之音: {} } }, revision = 0, writes = 0, commits = 0;
    const context = () => ({ root, scopeKey: '', floorKey: 'chat|39|0', messageId: 39, sourceHash: `body-${revision}` });
    const service = createStoryOutfitService({ storage, getContext: context,
        assets: { writeWardrobePrompt() { writes++; assert.fail('已准备的衣装资料应直接复用'); } },
        async commit(next) { commits++; root = next; return { ok: true }; } });
    t.after(() => service.dispose());
    const directive = [{ character: '天之音', unknownOutfit: '系统光团' }];
    for (revision = 0; revision < 4; revision++) assert.equal(service.observe(directive).ok, true);
    assert.equal(service.list().length, 1);
    assert.equal(loadStoryOutfitCandidates(storage).items.length, 1);

    const candidate = (hash, extra) => {
        const row = { ...context(), root: undefined, ownerKey: '', sourceHash: hash,
            character: '天之音', word: '系统光团', status: 'ready', ...extra };
        return { ...row, id: storyOutfitId(row) };
    };
    const partial = candidate('old-partial', { prompt: 'white robe' });
    const completed = candidate('old-completed', { prompt: 'white robe, white footwear',
        promptHalfBody: 'white robe', imageId: 'existing-picture' });
    assert.equal(saveStoryOutfitCandidates(storage, [partial, completed]).ok, true);
    assert.equal(service.observe(directive).ok, true);
    assert.equal(service.list().length, 1);
    assert.equal(service.list()[0].id, completed.id);
    assert.equal(service.list()[0].imageId, 'existing-picture');
    assert.equal(loadStoryOutfitCandidates(storage).items.length, 3, '旧记录保留，展示合并');
    service.defer(completed.id);
    assert.equal(service.list().length, 0, '稍后同时隐藏同一衣装的旧重复');
    assert.equal(service.list({ includeDeferred: true }).length, 1);
    service.resume();
    const first = service.adopt(completed.id, 'save');
    const second = service.adopt(partial.id, 'save');
    assert.equal(first, second, '旧按钮也复用正在处理的同一衣装操作');
    assert.equal((await first).ok, true);
    assert.deepEqual([writes, commits], [0, 1]);
    assert.equal(service.list().length, 0);
    const saved = root.wardrobe[root.characterOutfits.天之音.系统光团.wardrobe];
    assert.equal(saved.prompt, completed.prompt);
    assert.equal(saved.promptHalfBody, completed.promptHalfBody);
});

test('新衣装自动开关：关闭零请求，开启后先入库双 DNA 再生成，重绘不双发', async t => {
    const s = await storyBuiltinFixture(), { f } = s; t.after(() => s.dispose());
    const directives = [{ character: 'Alice', unknownOutfit: '礼服' }];
    assert.equal(s.service.observe(directives).ok, true);
    assert.deepEqual(await s.service.autoGenerate(), []);
    assert.deepEqual([f.writes.length, f.wires.length], [0, 0]);
    s.setAutoGenerate(true); f.waitWriting();
    const pending = s.service.autoGenerate();
    await waitFor(() => f.gates.length === 1);
    s.service.observe(directives);
    assert.deepEqual(await s.service.autoGenerate(), []);
    assert.equal(f.writes.length, 1);
    f.waitWriting(false); f.release();
    const [result] = await pending;
    assert.equal(result.ok, true, JSON.stringify(result));
    const library = s.root().cards['card:Current'];
    assert.equal(library.wardrobe['Alice·礼服'].promptHalfBody, 'white dress');
    assert.ok(library.characterOutfits.Alice.礼服.moods.平和);
    assert.equal(library.characterDefaultOutfits, undefined, '不替换用户旧默认立绘');
    s.service.observe(directives);
    assert.deepEqual(await s.service.autoGenerate(), []);
    assert.deepEqual([f.writes.length, f.wires.length], [1, 1]);
});

test('常驻衣装运行时：未开阅读器也生成，同实例重复通知不双发，切分支拒收', { timeout: 6000 }, async t => {
    const { createStoryOutfitRuntime } = await import('../src/core/story-outfit-runtime.js');
    const { effectiveSceneAssets } = await import('../src/scene/asset-scope.js');
    let root = { enabled: true, cards: { 'card:Current': { ...outfitAssets(), characterOutfits: {} } } };
    let autoGenerate = false, ready;
    const storage = createMemoryStorage();
    const floor = { chatId: 'builtin-fixture', messageId: 0, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平和|礼服|我换好衣服了。]' };
    const f = outfitBuiltinFixture({ readAssets: () => effectiveSceneAssets(root, 'card:Current'), outfitHalfBody: 'white dress' });
    const runtime = createStoryOutfitRuntime({ storage, assets: f.service,
        readContext: () => ({ name2: 'Current', chat: [{ mes: floor.text }] }),
        readBridge: () => ({ sceneAssets: root, autoIllustration: { assets: { outfitAutoGenerate: autoGenerate } } }),
        saveAssets(next) { root = next; return { ok: true }; },
        messageHost: { getChatId: () => floor.chatId, readFloor: () => ({ ...floor }),
            onImageFloorReady(fn) { ready = fn; return () => { ready = null; }; } } });
    t.after(() => { runtime.dispose(); f.service.stop(); f.dispose(); });
    runtime.start();
    assert.deepEqual(await ready(0), []);
    assert.deepEqual([f.writes.length, f.wires.length], [0, 0]);
    autoGenerate = true; f.waitWriting();
    const pending = ready(0);
    await waitFor(() => f.gates.length === 1);
    assert.deepEqual(await ready(0), []);
    f.waitWriting(false); f.release();
    const [result] = await pending;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(root.cards['card:Current'].characterOutfits.Alice.礼服.moods.平和);
    assert.deepEqual([f.writes.length, f.wires.length], [1, 1]);
    assert.deepEqual(await ready(0), []);
    floor.text = '[igs-char:Alice|平和|晚装|我换上另一套衣服。]';
    f.waitWriting();
    const stale = ready(0);
    await waitFor(() => f.gates.length === 1);
    floor.swipeId = 1;
    f.waitWriting(false); f.release();
    const [rejected] = await stale;
    assert.equal(rejected.ok, false);
    assert.equal(f.wires.length, 1, '切分支后不继续出图');
    assert.equal(root.cards['card:Current'].characterOutfits.Alice.晚装, undefined);
    runtime.dispose();
    assert.equal(ready, null);
});


test('后台衣装入库同步设置草稿，关闭设置保留新图和未保存编辑', { timeout: 6000 }, async t => {
    const { bootstrapIGS } = await import('../src/index.js');
    const { EventEmitter } = await import('node:events');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const { effectiveSceneAssets } = await import('../src/scene/asset-scope.js');
    const root = { enabled: true, cards: { 'card:Current': { ...outfitAssets(), characterOutfits: {} } } };
    let vn;
    const f = outfitBuiltinFixture({ outfitHalfBody: 'white dress', readAssets: () => effectiveSceneAssets(
        vn?.getUnifiedSettings().bridge.sceneAssets || root, 'card:Current') });
    t.after(async () => { f.dispose(); if (vn) await vn.shutdown(); else f.service.stop(); });
    const eventSource = new EventEmitter();
    const names = ['GENERATION_STARTED', 'GENERATION_ENDED', 'CHARACTER_MESSAGE_RENDERED'];
    const context = { name2: 'Current', chatId: 'builtin-fixture', extensionPrompts: {},
        chat: [{ is_user: false, mes: '[igs-char:Alice|平和|礼服|衣服换好了。]' }], eventSource,
        eventTypes: Object.fromEntries(names.map(name => [name, name])),
        getWorldInfoPrompt: async () => ({ worldInfoString: '' }) };
    vn = bootstrapIGS({ global: { localStorage: createMemoryStorage(), btoa,
        SillyTavern: { getContext: () => context } },
        config: { ...f.bridge, sceneAssets: root, autoIllustration: { ...f.bridge.autoIllustration,
            assets: { ...f.bridge.autoIllustration.assets, outfitAutoGenerate: true } } },
        assetGenerationService: { ...f.service, start() {} }, generatedAssetStore: createMemoryGeneratedAssetStore(),
        illustrationStore: createMemoryIllustrationStore(), autoAttachMagicWand: false });
    const opened = vn.openSettings({ page: 'logs' });
    opened.controller.setValue('bridge.showToasts', false);
    f.waitWriting();
    eventSource.emit('GENERATION_STARTED', 'normal', {}, false);
    eventSource.emit('GENERATION_ENDED', 0);
    await waitFor(() => f.gates.length === 1);
    f.waitWriting(false); f.release();
    await waitFor(() => Boolean(vn.getUnifiedSettings().bridge.sceneAssets.cards['card:Current']
        .characterOutfits?.Alice?.礼服?.moods?.平和));
    const image = vn.getUnifiedSettings().bridge.sceneAssets.cards['card:Current'].characterOutfits.Alice.礼服.moods.平和;
    assert.equal(opened.controller.close().ok, true);
    const saved = vn.getUnifiedSettings().bridge;
    assert.equal(saved.sceneAssets.cards['card:Current'].characterOutfits.Alice.礼服.moods.平和, image);
    assert.equal(saved.showToasts, false);
    assert.deepEqual([f.writes.length, f.wires.length], [1, 1]);
});


for (const mode of ['paint-failed', 'write-failed']) test(`新衣装自动失败-${mode}：重绘及重开不重复请求`, async t => {
    const s = await storyBuiltinFixture(mode), { f } = s; t.after(() => s.dispose());
    s.setAutoGenerate(true);
    s.service.observe([{ character: 'Alice', unknownOutfit: '礼服' }]);
    const [result] = await s.service.autoGenerate();
    assert.equal(result.ok, false);
    assert.equal(result.saved, mode === 'paint-failed');
    if (result.saved) assert.equal(s.root().cards['card:Current'].wardrobe['Alice·礼服'].promptHalfBody, 'white dress');
    else assert.deepEqual(s.root(), s.original);
    const sends = [f.writes.length, f.wires.length];
    assert.deepEqual(await s.service.autoGenerate(), []);
    s.reopen();
    assert.deepEqual(await s.service.autoGenerate(), []);
    assert.deepEqual([f.writes.length, f.wires.length], sends);
});

test('剧情衣装生成期间其它角色保存资料，完成后合并当前库', async t => {
    const s = await storyBuiltinFixture(), { f } = s; t.after(() => s.dispose());
    f.waitImages();
    assert.equal(s.service.observe([{ character: 'Alice', unknownOutfit: '礼服' }]).ok, true);
    const pending = s.service.adopt(s.service.list()[0].id, 'sprite');
    await waitFor(() => f.wires.length === 1);
    const updated = s.root();
    updated.cards['card:Other'] = { characterDna: { Bob: { identity: 'blue eyes' } } };
    s.storage.setItem('fixture-root', JSON.stringify(updated));
    f.release();
    const result = await pending;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(s.root().cards['card:Current'].characterOutfits.Alice.礼服.moods.平和);
    assert.deepEqual(s.root().cards['card:Other'], updated.cards['card:Other']);
    assert.equal(f.wires.length, 1);
});

for (const choice of ['save', 'sprite', 'full-save', 'full-sprite']) {
    test(`gate:builtin-story:选择后提取-${choice} 隐藏确认，重复确认零双发`, async t => {
        const s = await storyBuiltinFixture(), { f } = s; t.after(() => s.dispose());
        const { saveStoryOutfitCandidates, loadStoryOutfitCandidates, storyOutfitId, OUTFIT_REVIEW_LIMIT }
            = await import('../src/scene/outfit-review-store.js');
        const full = choice.startsWith('full-'), mode = choice.replace('full-', '');
        const older = Array.from({ length: full ? OUTFIT_REVIEW_LIMIT : 0 }, (_, i) => {
            const row = { character: 'Alice', word: '旧衣装', scopeKey: 'card:Current', ownerKey: 'card:Current',
                floorKey: `other-chat|${i}|0`, sourceHash: `old-${i}`, messageId: i, status: 'pending' };
            return { ...row, id: storyOutfitId(row) };
        });
        if (full) {
            assert.equal(saveStoryOutfitCandidates(s.storage, older).ok, true);
            s.reopen();
        }
        f.waitWriting();
        assert.equal(s.service.observe([{ character: 'Alice', unknownOutfit: '礼服' }]).ok, true);
        const id = s.service.list()[0].id;
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual([f.writes.length, f.wires.length, f.gates.length], [0, 0, 0], '选择前不写词或绘图');
        const first = s.service.adopt(id, mode), duplicate = s.service.adopt(id, mode);
        assert.equal(first, duplicate); assert.equal(s.service.list().length, 0);
        await waitFor(() => f.gates.length === 1);
        assert.equal(f.writes.length, 1); assert.deepEqual(s.root(), s.original);
        assert.equal(loadStoryOutfitCandidates(s.storage).items.find(row => row.id === id).status, 'writing');
        f.waitWriting(false); f.release();
        assert.equal((await first).ok, true); assert.equal((await duplicate).ok, true);
        assert.equal(f.writes.length, 1, '新衣装同次交付双 DNA，立绘不再次写衣装');
        assert.equal(f.wires.length, mode === 'save' ? 0 : 1);
        const library = s.root().cards['card:Current'];
        assert.equal(library.wardrobe['Alice·礼服'].prompt, 'wears a white dress');
        assert.equal(library.wardrobe['Alice·礼服'].promptHalfBody, 'white dress');
        if (mode === 'sprite') assert.ok(f.wires[0].parameters.v4_prompt.caption.char_captions[0].char_caption
            .includes('white dress calm'), '立绘使用半身衣装 DNA');
        const writes = f.writes.length, paints = f.wires.length;
        assert.equal((await s.service.adopt(id, mode)).ok, false, '已完成候选已清理');
        assert.deepEqual([f.writes.length, f.wires.length], [writes, paints], '迟到重复采用不再写词或出图');
        assert.deepEqual(library.characters, s.original.cards['card:Current'].characters);
        assert.deepEqual(library.characterDna, s.original.cards['card:Current'].characterDna);
        if (mode === 'sprite') assert.ok(await f.open().readStoredImage(library.characterOutfits.Alice.礼服.moods.平和.slice(8)));
        assert.deepEqual(library.characterDefaultOutfits,
            undefined, '旧立绘存在时命名衣装入库不自动切换默认');
        assert.deepEqual(loadStoryOutfitCandidates(s.storage).items, older,
            '其他楼层候选全部保留；完成后仅清理本条');
    });
}

test('gate:builtin-story:首次立绘审核及默认衣装入库不重复提取或绘图', async () => {
    const { createStoryOutfitService } = await import('../src/generated-images/illustration/story-outfit-service.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const { spriteAdoptionFixture } = await import('./helpers/prompt-provenance.js');
    const { prepareSpriteIdentityAdoption } = await import('../src/scene/character-identity.js');
    const storage = createMemoryStorage(), store = createMemoryGeneratedAssetStore();
    const candidate = await spriteAdoptionFixture();
    const word = candidate.outfitSnapshot.characters[0].name;
    let root = { enabled: true, characters: { Alice: {} }, characterAliases: { Alice: ['小爱'] } };
    let chatId = '';
    const assets = createAssetGenerationService({ store, nai: {},
        messageHost: { getChatId: () => chatId }, getSettings: () => ({ sceneAssets: root }) });
    let writes = 0, paints = 0, commits = 0;
    const service = createStoryOutfitService({ storage, assets: { ...assets,
        async writeWardrobePrompt() { writes++; assert.fail('首次立绘衣装不再次写词'); },
        async generateExpressionSet() { paints++; assert.fail('首次立绘衣装不再次绘图'); },
    }, getContext: () => ({ root, scopeKey: '', floorKey: 'first-sprite|3|0',
        messageId: 3, sourceHash: 'first-sprite-source' }),
    commit() { commits++; assert.fail('应沿首次立绘入口采用，不另入库'); } });
    try {
        const directives = [{ character: '小爱', unknownOutfit: word },
            { character: 'Alice', unknownOutfit: '另一套衣装' }];
        assert.equal(service.observe(directives).ok, true);
        const id = service.list().find(row => row.word === word).id;
        await store.putImage(candidate);
        await store.putAsset({ ...candidate, key: 'first-sprite|char|小爱', chatId: 'first-sprite',
            floorKey: 'first-sprite|3|0', type: 'sprite', name: '小爱', status: 'review' });
        chatId = 'first-sprite'; assets.listTemp();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(service.list().map(row => row.word), ['另一套衣装'],
            '同名首次立绘已生成，其他新衣装仍等待选择');
        const late = await service.adopt(id, 'sprite');
        assert.equal(late.alreadyHandled, true, '迟到确认也不能重发');
        await assets.setStatus('first-sprite|char|小爱', 'discarded');
        assert.ok(service.list().some(row => row.word === word), '丢弃首次立绘后恢复候选');
        // 已生成图的采用资料仍交正式入口核验，不由剧情衣装流程重画。
        const adopted = prepareSpriteIdentityAdoption(root, 'Alice', candidate.id, candidate);
        assert.equal(adopted.ok, true, adopted.reason);
        root = { ...root, ...adopted.patch };
        assert.equal(root.characterDefaultOutfits.Alice.outfitName, word);
        assert.ok(Object.values(root.characterOutfits.Alice[word].moods).includes(`igs-gen:${candidate.id}`));
        assert.deepEqual(service.list().map(row => row.word), ['另一套衣装']);
        assert.equal((await service.adopt(id, 'sprite')).alreadyHandled, true);
        service.observe(directives);
        assert.deepEqual(service.list().map(row => row.word), ['另一套衣装'], '旧候选与重复观察均不重弹');
        assert.deepEqual([writes, paints, commits], [0, 0, 0]);
    } finally { service.dispose(); }
});

for (const mode of ['write-failed', 'save-failed', 'paint-failed', 'recovery-save-failed', 'image-save-failed']) {
    test(`gate:builtin-story:失败恢复-${mode} 按入柜阶段保留状态`, async t => {
        const { loadStoryOutfitCandidates } = await import('../src/scene/outfit-review-store.js');
        const s = await storyBuiltinFixture(mode), { f } = s; t.after(() => s.dispose());
        s.service.observe([{ character: 'Alice', unknownOutfit: '礼服' }]);
        const id = s.service.list()[0].id;
        const result = await s.service.adopt(id, 'sprite');
        assert.equal(result.ok, false, JSON.stringify(result));
        if (['write-failed', 'save-failed'].includes(mode)) {
            assert.equal(result.saved, false); assert.equal(result.reopen, true);
            assert.deepEqual(s.root(), s.original); assert.equal(f.wires.length, 0);
            assert.equal(s.service.list().length, 1);
            assert.equal(loadStoryOutfitCandidates(s.storage).items[0].imageId, undefined);
            return;
        }
        assert.equal(result.saved, true); assert.equal(result.reopen, false);
        const library = s.root().cards['card:Current'];
        assert.equal(library.wardrobe['Alice·礼服'].prompt, 'wears a white dress');
        assert.equal(library.wardrobe['Alice·礼服'].promptHalfBody, 'white dress');
        assert.deepEqual(library.characterDna, s.original.cards['card:Current'].characterDna);
        assert.deepEqual(library.characters, s.original.cards['card:Current'].characters);
        assert.equal(library.characterOutfits.Alice.礼服.moods.平和 || '', '');
        assert.equal(library.characterDefaultOutfits, undefined, '绘图或图片保存失败不提前登记默认');
        if (mode === 'recovery-save-failed') {
            assert.equal(result.recoverySaved, false); assert.equal(result.warning, 'fixture-recovery-save');
            assert.equal(library.generated, undefined);
        } else if (mode === 'paint-failed') {
            assert.equal(result.recoverySaved, true);
            const { pendingExpressionCaptions } = await import('../src/visual/igs-ui/settings-outfit-fields.js');
            const items = pendingExpressionCaptions(library.generated.expressionNotes['Alice\u0001礼服'],
                library.characterOutfits.Alice.礼服.moods);
            assert.equal(items.length, 1); assert.ok(items[0].promptRecipe);
            s.recoverPaint(); const writes = f.writes.length;
            const resumed = await f.open().paintExpressionCaptions({ name: 'Alice', dna: library.characterDna.Alice,
                outfit: { name: '礼服' }, items });
            assert.equal(resumed.items[0].ok, true, JSON.stringify(resumed));
            assert.equal(f.writes.length, writes, '素材页恢复不重新写词');
            assert.ok(await f.open().readStoredImage(resumed.items[0].imageId));
        }
        s.reopen(); assert.equal(s.service.list().length, 0, '已入柜失败不重弹确认');
        if (mode === 'image-save-failed') {
            const row = loadStoryOutfitCandidates(s.storage).items[0];
            const image = await f.open().readStoredImage(row.imageId);
            assert.ok(image); const writes = f.writes.length, sends = f.wires.length;
            s.recoverSave();
            assert.equal((await s.service.adopt(id, 'sprite')).ok, true);
            assert.equal(f.writes.length, writes); assert.equal(f.wires.length, sends, '采用重试复用同图');
            assert.deepEqual(await f.open().readStoredImage(row.imageId), image);
            assert.equal(s.root().cards['card:Current'].characterOutfits.Alice.礼服.moods.平和, `igs-gen:${row.imageId}`);
            assert.deepEqual(s.root().cards['card:Current'].characterDefaultOutfits,
                undefined, '重试复用同图，旧立绘仍由用户显式切换默认');
            assert.equal(loadStoryOutfitCandidates(s.storage).items.length, 0);
        }
    });
}

test('gate:builtin-outfit:资料回复重复衣装字段零保存零绘图', async t => {
    const f = outfitBuiltinFixture({ reply: () => 'slotid: 1\ncharacter: Alice\noutfit_name: 礼服\n'
        + 'outfit_description: wears a white dress\noutfit_description: wears a blue coat' });
    t.after(() => f.dispose());
    const before = structuredClone(f.assets);
    let saves = 0;
    const result = await f.service.generateExpressionSet({ name: 'Alice', dna: f.assets.characterDna.Alice,
        outfit: { name: '礼服' }, moods: ['平和', '喜悦'], onOutfitDna() { saves++; return { ok: true }; } });
    assert.equal(result.ok, false); assert.equal(result.reason, 'recovery-exhausted');
    assert.equal(result.diagnostic.failureReason, 'SPRITE_DATA_INVALID');
    assert.equal(result.diagnostic.attempts, 3);
    assert.equal(f.writes.length, 3); assert.equal(saves, 0); assert.equal(f.wires.length, 0);
    assert.deepEqual(f.assets, before);
});

test('gate:builtin-outfit:服装保存与配置更新不取消本批，出图沿用任务快照', async t => {
    const { prepareOutfitDnaSave } = await import('../src/scene/outfit-identity.js');
    const f = outfitBuiltinFixture(); t.after(() => f.dispose());
    const result = await f.service.generateExpressionSet({ name: 'Alice', dna: f.assets.characterDna.Alice,
        outfit: { name: '礼服' }, moods: ['平和'], async onOutfitDna(clothing) {
            const token = f.runtime.capture(); assert.equal(token.ok, true);
            const patch = prepareOutfitDnaSave(f.assets, 'Alice', clothing.name, clothing.description);
            assert.equal(patch.ok, true); Object.assign(f.assets, patch.patch);
            f.runtime.refresh(); assert.equal(token.isCurrent(), true, '服装保存不改绘图租约'); token.release();
            f.bridge.autoIllustration.nai.artistPrefix = 'artist:changed'; f.runtime.refresh();
            return { ok: true };
        } });
    assert.equal(result.items[0].ok, true, JSON.stringify(result));
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 1); assert.equal(f.imageIds.length, 1);
    assert.match(f.wires[0].parameters.v4_prompt.caption.base_caption, /^artist:fixture,/);
    assert.equal(f.bridge.autoIllustration.nai.artistPrefix, 'artist:changed');
    assert.equal(f.assets.wardrobe['Alice·礼服'].prompt, 'wears a white dress');
});

for (const phase of ['writing', 'painting']) for (const stop of ['close', 'switch']) {
    test(`gate:builtin-story:楼末-${phase}-${stop} 不接受迟到结果`, async t => {
        const s = await storyBuiltinFixture(), { f } = s; t.after(() => s.dispose());
        if (phase === 'writing') f.waitWriting(); else f.waitImages();
        s.service.observe([{ character: 'Alice', unknownOutfit: '礼服' }]);
        const id = s.service.list()[0].id;
        const pending = s.service.adopt(id, 'sprite');
        await waitFor(() => f.gates.length === 1);
        if (stop === 'close') s.service.dispose(); else s.changeTarget();
        f.release();
        const result = await pending;
        assert.equal(result.ok, false, JSON.stringify(result));
        assert.equal(result.saved, phase === 'painting');
        assert.equal(f.wires.length, phase === 'painting' ? 1 : 0);
        assert.equal(f.imageIds.length, 0);
        const library = s.root().cards['card:Current'];
        assert.deepEqual(library.characters, s.original.cards['card:Current'].characters);
        assert.deepEqual(library.characterDna, s.original.cards['card:Current'].characterDna);
        if (phase === 'writing') assert.deepEqual(s.root(), s.original);
        else assert.equal(library.characterOutfits.Alice.礼服.moods.平和 || '', '');
    });
}


test('无关资料并行保存：表情出图期间替换衣柜并保存其它衣装，采用合并最新库', async t => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const assets = outfitAssets();
    const f = outfitBuiltinFixture({ assets, beforePaint() {
        assets.wardrobe = { ...assets.wardrobe, 'Bob·雨衣': { prompt: 'yellow raincoat' } };
        assets.characterOutfits = { ...assets.characterOutfits, Alice: { ...assets.characterOutfits.Alice,
            雨衣: { wardrobe: 'Bob·雨衣', moods: { 喜悦: 'other-mood.png' } } } };
        assets.characterAliases = { Bob: ['Other'] };
    } });
    t.after(() => { f.service.stop(); f.dispose(); });
    const { ctx } = settingsContext(f, assets, () => ({ ok: true }));
    const result = await handleSettingsAction(outfitAction('outfit-expression-set'), ctx);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.wires.length, 1);
    assert.equal(assets.wardrobe['Bob·雨衣'].prompt, 'yellow raincoat');
    assert.equal(assets.characterOutfits.Alice.雨衣.moods.喜悦, 'other-mood.png');
    assert.ok(assets.characterOutfits.Alice.礼服.moods.平和.startsWith('igs-gen:'));
});

test('自动恢复：设为默认时缺立绘，沿原衣装补图后完成选择', async t => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const assets = outfitAssets();
    const f = outfitBuiltinFixture({ assets });
    t.after(() => { f.service.stop(); f.dispose(); });
    const { ctx } = settingsContext(f, assets, () => ({ ok: true }));
    ctx.options.global.Image = class {
        set src(value) {
            if (!value) return;
            this.naturalWidth = 32; this.naturalHeight = 48;
            queueMicrotask(() => this.onload?.());
        }
    };
    const result = await handleSettingsAction(outfitAction('scene-set-default-outfit'), ctx);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(assets.characterDefaultOutfits.Alice.outfitName, '礼服');
    assert.ok(assets.characterOutfits.Alice.礼服.moods.平和.startsWith('igs-gen:'));
    assert.equal(f.wires.length, 1);
    assert.equal(assets.characters.Alice.默认, 'original.png');
});
