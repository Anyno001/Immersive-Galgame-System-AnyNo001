import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';
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

for (const mode of ['success', 'save-failed', 'paint-failed', 'readback-mismatch', 'wrong-outfit']) {
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
            if (mode === 'save-failed' && saves.length === 1) return { ok: false, reason: 'fixture-save' };
            if (mode === 'readback-mismatch' && saves.length === 1)
                assets.wardrobe['Alice·礼服'].prompt = 'mismatched saved clothing';
            storage.setItem('fixture-assets', JSON.stringify(assets));
            return { ok: true };
        });
        const result = await handleSettingsAction(outfitAction('outfit-expression-set'), ctx);
        assert.equal(f.writes.length, 1, '仅提取一次服装资料，平和构图由程序组装');
        assert.equal(f.writes[0].input.outputs.format, 'sprite-data');

        if (mode === 'wrong-outfit') {
            assert.equal(result.ok, false);
            assert.equal(saves.length, 0); assert.equal(f.wires.length, 0); assert.equal(f.imageIds.length, 0);
            assert.deepEqual(JSON.parse(storage.getItem('fixture-assets')), before);
            assert.deepEqual(assets, before, '不能将错名描述改名保存为目标衣装');
            return;
        }
        assert.deepEqual(saves[0].characterOutfits.Alice.礼服.moods, {});
        if (['save-failed', 'readback-mismatch'].includes(mode)) {
            assert.equal(result.ok, false); assert.equal(f.wires.length, 0);
            assert.equal(f.imageIds.length, 0);
            if (mode === 'save-failed') assert.deepEqual(assets, before);
            return;
        }
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
        assets.wardrobe.dress = { prompt: 'wears a white dress' };
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
                mode === 'existing-default' ? '常服' : '礼服');
            const imageId = saved.characterOutfits.Alice.礼服.moods.平和.slice(8);
            assert.ok((await f.open().readStoredImage(imageId)).dataUrl);
        }
    });
}

test('gate:builtin-outfit:当前双 DNA 续画零写词，模板与历史发送快照保真', async t => {
    const assets = outfitAssets();
    assets.wardrobe.dress = { prompt: 'wears a white dress' };
    assets.characterOutfits.Alice.礼服.wardrobe = 'dress';
    const f = outfitBuiltinFixture({ assets }); t.after(() => f.dispose());
    const first = await f.service.generateExpressionSet({ name: 'Alice', dna: assets.characterDna.Alice,
        outfit: { name: '礼服' }, moods: ['平和'] });
    assert.equal(first.items[0].ok, true, JSON.stringify(first));

    const original = await f.open().readStoredImage(first.items[0].imageId);
    assert.equal(f.writes.length, 0); assert.equal(f.wires.length, 1);
    assets.characterDna.Alice.views.half_body.subject = 'Alice, an adult woman with black hair,';
    assets.wardrobe.dress.prompt = 'wears a blue silk dress with a $5 brooch';
    const resumed = await f.open().generateExpressionImage({ name: 'Alice', mood: '平和',
        dna: assets.characterDna.Alice, outfit: { name: '礼服' }, caption: original.prompt.caption,
        promptRecipe: original.promptRecipe, promptTask: original.promptTask,
        characterMeta: original.characterMeta, slotId: original.slotId });
    assert.equal(resumed.items[0].ok, true, JSON.stringify(resumed));
    assert.equal(f.writes.length, 0, '基础图与显式续画均不写词'); assert.equal(f.wires.length, 2);
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
    assert.equal(f.writes.length, 0);
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
    const original = { cards: { 'card:Source': source } };
    storage.setItem('fixture-root', JSON.stringify(original));
    const root = () => JSON.parse(storage.getItem('fixture-root'));
    let hash = 'source-1', saves = 0, paintFailed = ['paint-failed', 'recovery-save-failed'].includes(mode);
    const f = outfitBuiltinFixture({ readAssets: () => effectiveSceneAssets(root(), 'card:Current'),
        paintFailure: () => paintFailed,
        beforeWrite(input) {
            if (input.promptTask) assert.equal(root().cards['card:Source'].wardrobe['Alice·礼服'].prompt,
                'wears a white dress', '衣装持久化并回读后才写立绘');
            if (mode === 'write-failed') throw new Error('isolated-writing-failure');
        } });
    const deps = { storage, assets: f.service,
        getContext: () => ({ root: root(), scopeKey: 'card:Current', floorKey: 'chat|39|0',
            messageId: 39, sourceHash: hash, text: 'Alice 换上白色礼服。' }),
        commit(next, expected, guard) {
            assert.equal(guard(), true); assert.deepEqual(root(), expected); saves++; f.events.push('save');
            if (mode === 'save-failed' && saves === 1) return { ok: false, reason: 'fixture-save' };
            if (mode === 'image-save-failed' && saves === 2) return { ok: false, reason: 'fixture-image-save' };
            if (mode === 'recovery-save-failed' && saves === 2) return { ok: false, reason: 'fixture-recovery-save' };
            storage.setItem('fixture-root', JSON.stringify(next)); return { ok: true };
        } };
    let service = createStoryOutfitService(deps);
    return { f, storage, root, original, get service() { return service; },
        reopen() { service.dispose(); service = createStoryOutfitService(deps); },
        recoverPaint() { paintFailed = false; }, changeTarget() { hash = 'source-2'; },
        dispose() { service.dispose(); f.dispose(); } };
}

for (const choice of ['save', 'sprite', 'full-save', 'full-sprite']) {
    test(`gate:builtin-story:选择后提取-${choice} 隐藏确认，重复确认零双发`, async t => {
        const s = await storyBuiltinFixture(), { f } = s; t.after(() => s.dispose());
        const { saveStoryOutfitCandidates, loadStoryOutfitCandidates, storyOutfitId, OUTFIT_REVIEW_LIMIT }
            = await import('../src/scene/outfit-review-store.js');
        const full = choice.startsWith('full-'), mode = choice.replace('full-', '');
        const older = Array.from({ length: full ? OUTFIT_REVIEW_LIMIT : 0 }, (_, i) => {
            const row = { character: 'Alice', word: '旧衣装', scopeKey: 'card:Current', ownerKey: 'card:Source',
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
        assert.equal(f.writes.length, 1, '衣装提取后基础平和图不再请求写词');
        assert.equal(f.wires.length, mode === 'save' ? 0 : 1);
        const library = s.root().cards['card:Source'];
        assert.equal(library.wardrobe['Alice·礼服'].prompt, 'wears a white dress');
        assert.deepEqual(library.characters, s.original.cards['card:Source'].characters);
        assert.deepEqual(library.characterDna, s.original.cards['card:Source'].characterDna);
        if (mode === 'sprite') assert.ok(await f.open().readStoredImage(library.characterOutfits.Alice.礼服.moods.平和.slice(8)));
        assert.deepEqual(library.characterDefaultOutfits,
            mode === 'sprite' ? { Alice: { version: 1, outfitName: '礼服' } } : undefined,
            '只保存服装文字不设默认，成功保存立绘时建立默认');
        assert.deepEqual(loadStoryOutfitCandidates(s.storage).items, full ? older.slice(1) : [],
            '仅替换最早的纯发现候选，其他楼层记录保真；完成后清理本条');
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
        const library = s.root().cards['card:Source'];
        assert.equal(library.wardrobe['Alice·礼服'].prompt, 'wears a white dress');
        assert.deepEqual(library.characterDna, s.original.cards['card:Source'].characterDna);
        assert.deepEqual(library.characters, s.original.cards['card:Source'].characters);
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
            assert.equal((await s.service.adopt(id, 'sprite')).ok, true);
            assert.equal(f.writes.length, writes); assert.equal(f.wires.length, sends, '采用重试复用同图');
            assert.deepEqual(await f.open().readStoredImage(row.imageId), image);
            assert.equal(s.root().cards['card:Source'].characterOutfits.Alice.礼服.moods.平和, `igs-gen:${row.imageId}`);
            assert.deepEqual(s.root().cards['card:Source'].characterDefaultOutfits,
                { Alice: { version: 1, outfitName: '礼服' } }, '重试复用同图并一并保存默认');
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
    assert.equal(result.ok, false); assert.equal(result.reason, 'SPRITE_DATA_INVALID');
    assert.equal(f.writes.length, 1); assert.equal(saves, 0); assert.equal(f.wires.length, 0);
    assert.deepEqual(f.assets, before);
});

test('gate:builtin-outfit:服装保存不失效租约，绘图配置变化仍拒绝本批发送', async t => {
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
    assert.equal(result.items[0].ok, false, JSON.stringify(result));
    assert.equal(result.items[0].reason, 'stale-config');
    assert.equal(f.writes.length, 1); assert.equal(f.wires.length, 0); assert.equal(f.imageIds.length, 0);
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
        const library = s.root().cards['card:Source'];
        assert.deepEqual(library.characters, s.original.cards['card:Source'].characters);
        assert.deepEqual(library.characterDna, s.original.cards['card:Source'].characterDna);
        if (phase === 'writing') assert.deepEqual(s.root(), s.original);
        else assert.equal(library.characterOutfits.Alice.礼服.moods.平和 || '', '');
    });
}
