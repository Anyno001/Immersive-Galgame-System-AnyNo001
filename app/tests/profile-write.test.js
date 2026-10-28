import test from 'node:test';
import assert from 'node:assert/strict';
import { revertProfileWrite } from '../src/scene/profile-write.js';
import { createCharacterDnaStore } from '../src/core/character-dna-store.js';

const storeOf = (initial) => {
    let assets = structuredClone(initial);
    const store = createCharacterDnaStore({ readAssets: () => assets, readContext: () => ({}),
        saveAssets: next => { assets = structuredClone(next); return { ok: true }; } });
    return { store, read: () => assets };
};

test('写词即存：新衣装直接入衣柜，已有同名衣装不覆盖', () => {
    const { store, read } = storeOf({ characterDna: { 小雪: { identity: 'girl' } } });
    const target = store.capture('小雪');
    const saved = target.saveOutfit({ name: '白裙', description: 'white dress' });
    assert.equal(saved.ok, true);
    assert.equal(saved.created, true);
    const entry = read().characterOutfits.小雪.白裙;
    assert.equal(read().wardrobe[entry.wardrobe].prompt, 'white dress');
    const again = store.capture('小雪').saveOutfit({ name: '白裙', description: 'blue dress' });
    assert.equal(again.ok, true);
    assert.equal(again.created, false);
    assert.equal(read().wardrobe[entry.wardrobe].prompt, 'white dress');
});

test('丢弃时还原：DNA 回到写词前，新建且没挂图的衣装删除', () => {
    const write = { character: '小雪', owner: '',
        dna: { before: null, after: { identity: 'girl', identityInitialized: true } },
        outfit: { name: '白裙', entry: { words: [], moods: {}, wardrobe: '小雪·白裙' },
            wardrobeKey: '小雪·白裙', wardrobe: { prompt: 'white dress' } } };
    const library = { characterDna: { 小雪: write.dna.after },
        characterOutfits: { 小雪: { 白裙: write.outfit.entry } }, wardrobe: { '小雪·白裙': { prompt: 'white dress' } } };
    const plan = revertProfileWrite(library, write);
    assert.equal(plan.changed, true);
    assert.equal(plan.dna, true);
    assert.equal(plan.outfit, '白裙');
    assert.equal(plan.patch.characterDna.小雪, undefined);
    assert.equal(plan.patch.characterOutfits.小雪.白裙, undefined);
    assert.equal(plan.patch.wardrobe['小雪·白裙'], undefined);
    assert.equal(library.characterDna.小雪.identity, 'girl', '不原地改');
});

test('写入后又被改过或衣装已挂图：不还原、不提问', () => {
    const write = { character: '小雪', owner: '',
        dna: { before: { identity: 'old' }, after: { identity: 'girl' } },
        outfit: { name: '白裙', entry: { words: [], moods: {}, wardrobe: 'k' } } };
    const library = { characterDna: { 小雪: { identity: 'edited by user' } },
        characterOutfits: { 小雪: { 白裙: { words: [], moods: { 平和: 'igs-gen:1' }, wardrobe: 'k' } } } };
    assert.equal(revertProfileWrite(library, write).changed, false);
});
