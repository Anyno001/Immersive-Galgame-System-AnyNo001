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
