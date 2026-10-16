import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../src/index.js';
import { releasedGeneratedImageIds, unreferencedGeneratedImageIds } from '../src/visual/igs-ui/settings-actions.js';

// 旧版预设还没找回之前，它引用的图要留着；全局和各角色卡引用的同样留着。
test('gate:assets:image-refs-keep-global-cards-and-legacy-presets', () => {
    const storage = createMemoryStorage();
    storage.setItem('igs:scene-presets:v1', JSON.stringify({
        version: 1,
        presets: { 卡A: { scenes: { 教室: { url: 'igs-gen:bg-a', words: [], times: {} } }, characters: { 雪乃: { 默认: 'igs-gen:sp-a' } } } },
    }));
    assert.deepEqual(unreferencedGeneratedImageIds(['bg-a', 'sp-a', 'z'], { scenes: {}, characters: {} }, storage), ['z'], '旧预设引用的图不删');
    assert.deepEqual(releasedGeneratedImageIds(['sp-a', 'bg-a'], { characters: {} }, null), ['sp-a', 'bg-a']);
    assert.deepEqual(releasedGeneratedImageIds(['sp-a'], { characters: {} }, null), ['sp-a']);
    assert.deepEqual(unreferencedGeneratedImageIds(['x'], { cards: { 'card:小雪': { characters: { 小雪: { 默认: 'igs-gen:x' } } } } }, null), []);
});

test('gate:assets:story-outfit-pending-image-is-held-until-confirmed', async () => {
    const { saveStoryOutfitCandidate, removeStoryOutfitCandidate, storyOutfitId } = await import('../src/scene/outfit-review-store.js');
    const storage = createMemoryStorage();
    const row = { scopeKey: 'card:A', ownerKey: 'card:A', floorKey: 'chat|5|0', sourceHash: 'fixture',
        messageId: 5, character: 'Alice', word: 'Dress', prompt: 'wears a white dress', imageId: 'pending' };
    row.id = storyOutfitId(row);
    assert.equal(saveStoryOutfitCandidate(storage, row).ok, true);
    assert.deepEqual(unreferencedGeneratedImageIds(['pending', 'drop'], {}, storage), ['drop']);
    assert.deepEqual(releasedGeneratedImageIds(['pending', 'drop'], {}, storage), ['drop']);
    assert.equal(removeStoryOutfitCandidate(storage, row.id).ok, true);
    assert.deepEqual(releasedGeneratedImageIds(['pending'], { characterOutfits: { Alice: { Dress: {
        moods: { 平和: 'igs-gen:pending' } } } } }, storage), []);
    assert.deepEqual(releasedGeneratedImageIds(['pending'], {}, storage), ['pending']);
    storage.setItem('igs:story-outfit-review:v1', '{invalid');
    assert.deepEqual(unreferencedGeneratedImageIds(['pending'], {}, storage), [], '读取失败不冒充无人引用');
});

test('gate:assets:删除门禁保留全库衣柜、候选和CG来源', async () => {
    const { protectedAssetImageIds } = await import('../src/generated-images/illustration/asset-image-references.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
    const { saveStoryOutfitCandidate, storyOutfitId } = await import('../src/scene/outfit-review-store.js');
    const storage = createMemoryStorage(), illustrationStore = createMemoryIllustrationStore();
    const assets = { characterOutfits: { Alice: { Coat: { moods: { 平和: 'igs-gen:global' } } } },
        cards: { other: { characterOutfits: { Bob: { Suit: { moods: { 喜悦: 'igs-gen:card' } } } } } } };
    storage.setItem('igs:scene-presets:v1', JSON.stringify({ version: 1, presets: { old: { characters: { Alice: { 默认: 'igs-gen:legacy' } } } } }));
    const row = { scopeKey: 'card:A', ownerKey: 'card:A', floorKey: 'chat|5|0', sourceHash: 'fixture',
        messageId: 5, character: 'Alice', word: 'Dress', prompt: 'wears a white dress', imageId: 'pending' };
    row.id = storyOutfitId(row);
    assert.equal(saveStoryOutfitCandidate(storage, row).ok, true);
    await illustrationStore.putSlot('chat|3|0', { slot: 1, consistencyPrompt: { rounds: [
        { appearance: { reference: { url: 'igs-gen:cg-source' } } }] } });
    const store = createMemoryGeneratedAssetStore();
    const ids = ['global', 'card', 'legacy', 'pending', 'cg-source', 'unused'];
    for (const id of ids) await store.putImage({ id, dataUrl: 'data:image/png;base64,QQ==' });
    const service = createAssetGenerationService({ messageHost: { getChatId: () => 'chat' }, store, llm: {}, nai: {},
        getSettings: () => ({ sceneAssets: {} }),
        readProtectedImageIds: () => protectedAssetImageIds({ readSceneAssets: () => assets, storage, illustrationStore }) });
    assert.deepEqual(await service.deleteImages(ids), { ok: true,
        retainedIds: ids.slice(0, -1), retained: ids.slice(0, -1) });
    for (const id of ids.slice(0, -1)) assert.ok(await store.getImage(id), id);
    assert.equal(await store.getImage('unused'), null);
});


for (const fault of ['assets', 'story', 'legacy', 'cg-list', 'cg-record', 'cg-race']) {
    test(`gate:assets:引用读取失败拒删-${fault}`, async () => {
        const { protectedAssetImageIds } = await import('../src/generated-images/illustration/asset-image-references.js');
        const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
        const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
        const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
        const storage = createMemoryStorage(), cg = createMemoryIllustrationStore();
        await cg.putSlot('chat|3|0', { slot: 1 });
        if (fault === 'story') storage.setItem('igs:story-outfit-review:v1', '{bad');
        if (fault === 'legacy') storage.setItem('igs:scene-presets:v1', '{bad');
        if (fault === 'cg-list') cg.listSlotKeys = async () => { throw new Error('read-failed'); };
        if (fault === 'cg-record') cg.getSlotRecords = async () => [null];
        if (fault === 'cg-race') {
            const read = cg.getSlotRecords;
            cg.getSlotRecords = async keys => {
                const records = await read(keys);
                await cg.putSlot('chat|4|0', { slot: 1 });
                return records;
            };
        }
        const store = createMemoryGeneratedAssetStore();
        await store.putImage({ id: 'keep', dataUrl: 'data:image/png;base64,QQ==' });
        const service = createAssetGenerationService({ store, llm: {}, nai: {},
            messageHost: { getChatId: () => 'chat' }, getSettings: () => ({ sceneAssets: {} }),
            readProtectedImageIds: () => protectedAssetImageIds({ storage, illustrationStore: cg,
                readSceneAssets: () => { if (fault === 'assets') throw new Error('read-failed'); return {}; } }) });
        assert.deepEqual(await service.deleteImages(['keep']), { ok: false, reason: 'image-reference-unavailable' });
        assert.ok(await store.getImage('keep'));
    });
}

for (const fault of ['none', 'protected', 'batch', 'write']) {
    test(`gate:assets:衣装候选满额保护与整批保存-${fault}`, async () => {
        const { saveStoryOutfitCandidates, saveStoryOutfitCandidate, loadStoryOutfitCandidates,
            storyOutfitId, OUTFIT_REVIEW_LIMIT } = await import('../src/scene/outfit-review-store.js');
        const storage = createMemoryStorage();
        const make = (i, extra = {}) => {
            const row = { scopeKey: '', ownerKey: '', floorKey: `chat|${i}|0`, sourceHash: `source-${i}`,
                messageId: i, character: 'Alice', word: 'Dress', status: 'pending', ...extra };
            return { ...row, id: storyOutfitId(row) };
        };
        const states = [{ prompt: 'wears a dress' }, { imageId: 'held-image' }, { status: 'writing' },
            { status: 'saved' }, { status: 'failed' }, { status: 'unknown' }];
        const older = Array.from({ length: OUTFIT_REVIEW_LIMIT }, (_, i) => make(i,
            fault !== 'protected' && i === 0 ? {} : states[i % states.length]));
        assert.equal(saveStoryOutfitCandidates(storage, older).ok, true);
        const update = { ...older[1], prompt: 'wears a blue dress' };
        assert.equal(saveStoryOutfitCandidate(storage, update).ok, true, '满额仍可更新同一候选');
        older[1] = update;
        const before = storage.getItem('igs:story-outfit-review:v1');
        const target = fault === 'write' ? { getItem: key => storage.getItem(key),
            setItem() { throw new Error('isolated-quota'); } } : storage;
        const incoming = [make(100), ...(fault === 'batch' ? [make(101)] : [])];
        const result = saveStoryOutfitCandidates(target, incoming);
        if (fault !== 'none') {
            assert.deepEqual(result, { ok: false, reason: fault === 'write' ? 'store-write-failed' : 'candidate-limit' });
            assert.equal(storage.getItem('igs:story-outfit-review:v1'), before, '整批失败不删旧记录、不保存部分候选');
        } else {
            assert.equal(result.ok, true);
            assert.deepEqual(loadStoryOutfitCandidates(storage).items, [...older.slice(1), ...incoming]);
        }
        assert.deepEqual(unreferencedGeneratedImageIds(['held-image', 'unused'], {}, storage), ['unused'],
            '候选中的图片持续受清理保护');
    });
}