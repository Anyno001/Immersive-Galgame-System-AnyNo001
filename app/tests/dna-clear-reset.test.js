import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCharacterDna, characterDnaIdentityCleared, editCharacterDnaField } from '../src/scene/character-dna.js';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { spriteDataReply } from './helpers/prompt-provenance.js';

const views = (half) => ({ full_body: { subject: '1boy, black hair', negative: '' },
    half_body: { subject: half, negative: '' }, portrait: { subject: '1boy, black hair', negative: '' } });

test('身份全部手动清空视为重置：解除锁定；只清部分景别仍锁定', () => {
    let dna = { version: 2, views: views('1boy, black hair'), identityInitialized: true, identitySource: 'img' };
    for (const view of ['full_body', 'half_body', 'portrait']) dna = editCharacterDnaField(dna, `views.${view}.subject`, '');
    const reset = normalizeCharacterDna(dna);
    assert.equal(reset.identityInitialized, undefined);
    assert.equal(reset.clearedViews, undefined);
    assert.equal(characterDnaIdentityCleared(reset), false);
    const partial = editCharacterDnaField({ version: 2, views: views('1boy, black hair'), identityInitialized: true }, 'views.portrait.subject', '');
    assert.equal(characterDnaIdentityCleared(normalizeCharacterDna(partial)), true);
});

async function paint(t, dna, extra = '') {
    const h = builtinImageHarness({ reply: input => spriteDataReply(input, { outfitDescription: 'white shirt, black trousers',
        personality: 'calm' }) + extra });
    t.after(() => h.dispose());
    const assets = { characters: {}, characterDna: {}, scenes: {} };
    let n = 0;
    const service = createAssetGenerationService({ nai: h.backend, store: createIndexedDbGeneratedAssetStore({ indexedDB: createTransactionalIdb() }),
        llm: h.llm, messageHost: { getChatId: () => 'reset' }, getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        matte: async url => url, report: () => {}, newId: () => `s${++n}` });
    const result = await service.generateCharacterSprite({ name: '裴渡', dna });
    return { result, wire: h.wires[0] && JSON.stringify(h.wires[0].parameters.v4_prompt.caption) };
}

test('全部清空后重画默认立绘：重新写身份并出图', async t => {
    let dna = { version: 2, views: views('1boy, black hair'), identityInitialized: true, personality: 'calm' };
    for (const view of ['full_body', 'half_body', 'portrait']) dna = editCharacterDnaField(dna, `views.${view}.subject`, '');
    const { result } = await paint(t, dna);
    assert.equal(result.ok, true, JSON.stringify(result));
});

test('只清头像景别时模型多写的身份被丢弃，不判失败', async t => {
    const dna = editCharacterDnaField({ version: 2, views: views('1boy, black hair, half'), identityInitialized: true, personality: 'calm' },
        'views.portrait.subject', '');
    const { result, wire } = await paint(t, dna);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.match(wire, /black hair, half/);
    assert.doesNotMatch(wire, /Alice/);
});
