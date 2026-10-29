import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoIllustrationService } from './helpers/media-fixtures.js';
import { createIndexedDbIllustrationStore, floorKeyOf } from '../src/media/illustration-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { characterViewsFixture } from './helpers/prompt-provenance.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { secondaryLlmText } from '../src/host/secondary-llm-result.js';
import { buildCgOutfitCatalog } from '../src/generated-images/illustration/cg-outfit-catalog.js';

const assets = () => ({ characters: {}, characterOutfits: { Alice: { 'Navy coat': { words: [], moods: {} } } },
    wardrobe: { 'Navy coat': { prompt: '1.2::navy coat::, long coat' } }, characterDna: {
        Alice: { version: 2, identity: 'silver hair', views: characterViewsFixture('Alice, an adult woman with silver hair,') },
        银狼: { version: 2, identity: 'wolf', creature: { form: 'beast', size: 'large', anchor: 'ground' }, views: characterViewsFixture('no humans, wolf,') },
    } });
const reply = (id, name, description) => ['slotid: 1', 'at: 1', 'prompt_mode: dna_template', 'outfit_mode: template',
    'scene: A bedroom at night.', 'scene_uc: lowres', 'char: 0.5,0.5 | <<dna:r0>> <<outfit:r0>> and lies on the bed.', 'char_uc:',
    'meta_kind: 0 | named', 'meta_key: 0 | Alice', 'meta_token: 0 | r0', 'meta_frame: 0 | half_body',
    'meta_identity: 0 | Alice, an adult woman,', 'meta_signature: 0 |', `meta_outfit_name: 0 | ${name}`,
    `meta_outfit_description: 0 | ${description}`, `meta_outfit_id: 0 | ${id}`];

async function run({ nsfw, lines }) {
    const h = builtinImageHarness({ reply: () => secondaryLlmText(lines.join('\n')) });
    Object.assign(h.bridge.autoIllustration, { nsfwEnabled: true, nsfwCount: 1, interludeEnabled: true, interludeMaxCount: 1 });
    let text = `[igs-scene:卧室|夜晚|晴${nsfw ? '|nsfw' : ''}]\nAlice躺在床上。\n[igs-char:Alice|害羞|嗯……]`;
    const floor = () => ({ chatId: 'nude-cg', messageId: 7, swipeId: 0, isAi: true, isLatest: true, text });
    const host = { getChatId: () => 'nude-cg', readFloor: floor, readPreviousAiTexts: () => [],
        async writeFloor(_id, next) { text = next; return { ok: true }; }, on: () => () => {},
        attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }), destroy() {} };
    const store = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
    const service = createAutoIllustrationService({ nai: h.backend, llm: h.llm, store, messageHost: host,
        getSettings: () => h.bridge.autoIllustration, getSceneAssets: assets, report: () => {} });
    const result = await service.processMessage(7, { manual: true });
    const slots = await store.getSlots(floorKeyOf(floor()));
    const out = { result, slots, writes: h.writes, wire: JSON.stringify(h.wires), sent: h.writes.map(w => JSON.stringify(w.request.messages)).join('\n') };
    h.dispose();
    return out;
}

test('NSFW 楼层衣柜目录多一条「裸体」，选中后角色段是 completely nude 而非保存的衣服', async () => {
    const r = await run({ nsfw: true, lines: reply(2, '裸体', 'completely nude') });
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    assert.deepEqual(r.writes[0].input.outfitCatalog, [{ id: 1, characterKey: 'Alice', name: 'Navy coat' },
        { id: 2, characterKey: 'Alice', name: '裸体' }]);
    assert.match(r.sent, /【NSFW 衣装】/);
    assert.match(r.wire, /completely nude/);
    assert.doesNotMatch(r.wire, /navy coat/);
    assert.equal(r.slots[0].promptRecipe.bindings[0].outfit.name, '裸体');
});

test('NSFW 楼层穿着衣服时照选衣服编号，保存的衣服照常展开', async () => {
    const r = await run({ nsfw: true, lines: reply(1, 'Navy coat', 'navy coat') });
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    assert.match(r.wire, /navy coat/);
    assert.doesNotMatch(r.wire, /completely nude/);
});

test('非 NSFW 楼层目录与写词不出现「裸体」', async () => {
    const r = await run({ nsfw: false, lines: reply(1, 'Navy coat', 'navy coat') });
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    assert.deepEqual(r.writes[0].input.outfitCatalog, [{ id: 1, characterKey: 'Alice', name: 'Navy coat' }]);
    assert.doesNotMatch(r.sent, /【NSFW 衣装】/);
});

test('非人角色不加「裸体」条目', () => {
    const a = assets();
    const catalog = buildCgOutfitCatalog([{ characterKey: '银狼', dna: a.characterDna.银狼, outfits: [] },
        { characterKey: 'Alice', dna: a.characterDna.Alice, outfits: [] }], { nsfw: true });
    assert.deepEqual(catalog.map(c => [c.characterKey, c.name]), [['Alice', '裸体']]);
});
