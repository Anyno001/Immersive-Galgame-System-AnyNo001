import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { spriteDataReply } from './helpers/prompt-provenance.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { createCharacterDnaStore } from '../src/core/character-dna-store.js';

for (const kind of ['new', 'card', 'card-noscope']) test(`写词即存后入库：DNA 与衣装先存、记录带 profileWrite、入库成功-${kind}`, async t => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const floor = { chatId: 'repro', messageId: 4, swipeId: 0, isAi: true, isLatest: true,
        text: '[igs-char:Alice|平静|职业套装|你好。]' };
    const assets = { enabled: true, characters: {}, characterDna: {}, scenes: {}, ...(kind !== 'new' && { cards: { 'card:Current': { characters: {}, characterDna: {} } } }) };
    const ctx = kind === 'new' ? {} : { name2: 'Current' };
    const h = builtinImageHarness({ reply: input => spriteDataReply(input, { outfitName: '职业套装',
        outfitDescription: 'orange blazer, pencil skirt' }) });
    h.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false };
    const dnaStore = createCharacterDnaStore({ readAssets: () => assets, readContext: () => ctx,
        saveAssets: next => { for (const k of Object.keys(assets)) delete assets[k]; Object.assign(assets, structuredClone(next)); return { ok: true }; } });
    const service = createAssetGenerationService({ nai: h.backend, llm: h.llm,
        store: createIndexedDbGeneratedAssetStore({ indexedDB: createTransactionalIdb() }),
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor, readPreviousAiTexts: () => [], on: () => () => {} },
        getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        captureCharacterDnaTarget: name => dnaStore.capture(name),
        matte: async url => url });
    t.after(() => service.stop());
    const generated = await service.processMessage(4, { manual: true });
    assert.equal(generated.ok, true);
    const [listed] = service.listReview('repro|4|0');
    const record = await service.readRecord(listed.key);
    const settings = { draft: { bridge: { sceneAssets: assets }, readerSettings: {} }, asyncState: kind === 'card' ? { assetScopeKey: 'card:Current' } : {} };
    const adopted = await handleSettingsAction(`gen-temp-accept:${encodeURIComponent(record.key)}`, {
        state: { activeSettings: settings }, options: { global: { alert() {} }, generatedAssets: service },
        dialogs: { confirm: async () => true, prompt: async (_m, v) => v, alert() {} },
        persistSettingsDraft: () => ({ ok: true }), rerenderSettings: () => ({ ok: true }) }).catch(e => ({ thrown: e.stack }));
    assert.ok(record.profileWrite?.dna && record.profileWrite?.outfit, 'profileWrite 应保留');
    assert.equal(adopted.ok, true, JSON.stringify(adopted));
    assert.equal(service.getRecord(record.key)?.status, 'library');
});
