import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { CREATURE_EXAMPLE_LINES } from '../src/generated-images/prompt-tasks/creature.js';
import { characterPromptTask } from '../src/generated-images/illustration/character-prompt-task.js';
import { parseSpriteData } from '../src/generated-images/illustration/sprite-data.js';
import { normalizeCharacterDna } from '../src/scene/character-dna.js';

const names = ['岩甲蜥', '石甲兽'];
const fields = Object.fromEntries(CREATURE_EXAMPLE_LINES.map(line => {
    const colon = line.indexOf(':');
    return [line.slice(0, colon), line.slice(colon + 1).trim()];
}));
const views = Object.fromEntries(['full_body', 'half_body', 'portrait'].map(view => [view, {
    subject: fields[`dna_${view}`], negative: fields[`dna_uc_${view}`],
}]));
const savedDna = () => normalizeCharacterDna({ version: 2, creature: { form: 'beast', size: 'small' },
    views: structuredClone(views), personality: fields.personality });
const creatureReply = input => input.promptTask.slots.map(slot => {
    const name = input.promptTask.characters.find(c => c.token === slot.tokens[0]).characterKey;
    return CREATURE_EXAMPLE_LINES.map(line => line.startsWith('slotid:') ? `slotid: ${slot.slotId}`
        : line.startsWith('character:') ? `character: ${name}` : line).join('\n');
}).join('\n---\n');

function fixture(t, options = {}) {
    const assets = { enabled: true, characters: {}, scenes: {}, characterDna: Object.fromEntries(
        names.map(name => [name, { creature: { form: 'beast', size: 'small' } }])) };
    const hints = options.battle ? names.map(name => `[igs-fx:battle|${name}|对手]`)
        : names.map(name => `[igs-fx:creature|${name}|兽|小型|落地]`);
    let floor = { chatId: 'creature-reuse', messageId: 12, swipeId: 0, isAi: true, isLatest: true,
        text: hints.join('\n') + '\n' + '溪水漫过石阶，石甲兽在岸边等待。'.repeat(10) };
    const store = createIndexedDbGeneratedAssetStore({ indexedDB: createTransactionalIdb() });
    let sequence = 0, service, updated = false;
    const logs = [], services = [];
    const h = builtinImageHarness({
        async reply(input) { await options.onWrite?.(input); return options.reply?.(input) ?? creatureReply(input); },
        beforePaint() {
            if (options.updateDuringPaint && !updated) {
                updated = true;
                floor = { ...floor, text: floor.text + '\n溪水继续上涨。' };
                void service.processMessage(floor.messageId);
            }
        },
    });
    h.bridge.autoIllustration.assets = { spriteEnabled: true, backgroundEnabled: false, maxPerFloor: 8 };
    const open = (assetStore = store) => {
        service = createAssetGenerationService({ nai: h.backend, llm: h.llm, store: assetStore,
            getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
            messageHost: { getChatId: () => floor.chatId, readFloor: () => ({ ...floor }),
                readPreviousAiTexts: () => [], readCharacterLore: async () => [], on: () => () => {} },
            captureCharacterDnaTarget: name => ({ name, scope: 'fixture', owner: 'fixture',
                dna: assets.characterDna[name], rawDna: () => assets.characterDna[name],
                save(dna) { assets.characterDna[name] = dna; return { ok: true, dna }; } }),
            matte: async url => url, report: (level, message) => logs.push({ level, message }),
            newId: () => `creature-reuse-${++sequence}`,
        });
        services.push(service);
        return service;
    };
    t.after(() => { services.forEach(s => s.stop()); h.dispose(); });
    return { h, assets, store, logs, open, service: open() };
}

for (const battle of [false, true]) test(`怪物仅通过${battle ? '战斗' : '非人'}标签出场，正文更新和重查均复用已生成图片`, async t => {
    const f = fixture(t, { battle, updateDuringPaint: true });
    const result = await f.service.processMessage(12);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.h.writes.length, 1, '同楼更新不重复写词');
    assert.equal(f.h.wires.length, 2, '每只怪物只生成一张图');
    const records = await f.store.getAssetsByChat('creature-reuse');
    assert.equal(records.length, 2);
    assert.ok(records.every(r => r.status === 'review' && r.imageId));
    assert.equal((await f.service.processMessage(12, { manual: true })).ok, true);
    f.service.stop();
    const reopened = f.open();
    assert.equal((await reopened.processMessage(12, { manual: true })).ok, true);
    assert.deepEqual(await f.store.getAssetsByChat('creature-reuse'), records, '重启后从持久记录复用');
    assert.deepEqual([f.h.writes.length, f.h.wires.length], [1, 2]);
});

test('写词失败不覆盖本轮开始后可见的成功素材，也不删除原图', async t => {
    let malformed = false, hideExisting = false;
    const f = fixture(t, { onWrite: () => { hideExisting = false; },
        reply: input => malformed ? 'invalid output' : creatureReply(input) });
    assert.equal((await f.service.processMessage(12)).ok, true);
    const records = await f.store.getAssetsByChat('creature-reuse');
    const images = await Promise.all(records.map(record => f.store.getImage(record.imageId)));
    f.service.stop();
    malformed = true;
    hideExisting = true;
    const resumed = f.open({ ...f.store,
        getAsset: async (...args) => hideExisting ? null : f.store.getAsset(...args) });
    const result = await resumed.processMessage(12, { manual: true });
    assert.equal(result.ok, false, '本次失败仍如实返回');
    assert.ok(f.logs.some(log => log.level === 'error'));
    assert.deepEqual(await f.store.getAssetsByChat('creature-reuse'), records);
    assert.deepEqual(await Promise.all(records.map(record => f.store.getImage(record.imageId))), images);
    assert.equal(f.h.wires.length, 2, '资料未通过时不继续绘图');
});

test('怪物图片确实丢失时只补缺图者，保留另一只的成功记录', async t => {
    const f = fixture(t);
    assert.equal((await f.service.processMessage(12)).ok, true);
    const records = await f.store.getAssetsByChat('creature-reuse');
    f.service.stop();
    await f.store.deleteImage(records[0].imageId);
    const result = await f.open().processMessage(12, { manual: true });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.count, 1);
    assert.deepEqual([f.h.writes.length, f.h.wires.length], [2, 3]);
    assert.deepEqual(f.h.writes[1].input.promptTask.characters.map(c => c.characterKey), [records[0].name]);
    assert.deepEqual(await f.store.getAsset(records[1].key), records[1]);
    assert.notEqual((await f.store.getAsset(records[0].key)).imageId, records[0].imageId);
});

function dataMeta(dna = savedDna()) {
    return { ...characterPromptTask([{ characterKey: '岩甲蜥', dna }], 'sprite', 'full_body', [['岩甲蜥']]),
        outputs: { format: 'sprite-data' }, userPrompts: { positive: '', negative: '' } };
}

for (const echo of ['all', 'one', 'none']) test(`已有完整怪物资料允许${echo}原样回传，且不产生新的身份候选`, () => {
    const reply = CREATURE_EXAMPLE_LINES.filter(line => echo === 'all'
        || (!line.startsWith('dna_') && !line.startsWith('personality:'))
        || (echo === 'one' && line.startsWith('dna_full_body:'))).join('\n');
    const meta = dataMeta(), before = structuredClone(meta.characterContext);
    const result = parseSpriteData(reply, meta);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.dnaCandidates, undefined);
    assert.deepEqual(meta.characterContext, before);
    assert.match(result.caption.v4_prompt.caption.char_captions[0].char_caption, /<<dna:r0>>/);
});

test('显式空性格可原样回传，但不能自动补成新的性格', () => {
    const dna = savedDna();
    dna.personality = '';
    const reply = CREATURE_EXAMPLE_LINES.map(line => line.startsWith('personality:') ? 'personality:' : line).join('\n');
    assert.equal(parseSpriteData(reply, dataMeta(dna)).ok, true);
    const changed = parseSpriteData(reply.replace('personality:', 'personality: friendly,'), dataMeta(dna));
    assert.equal(changed.ok, false);
    assert.equal(changed.diagnostic.field, 'personality');
});

for (const [field, value] of [
    ['dna_full_body', 'no humans, dragon,'], ['dna_uc_portrait', 'fur,'],
    ['personality', 'friendly,'], ['dna_partial', 'no humans, lizard,'],
]) test(`已有资料拒绝改写 ${field}，诊断定位到实际字段`, () => {
    const lines = CREATURE_EXAMPLE_LINES.map(line => line.startsWith(`${field}:`) ? `${field}: ${value}` : line);
    if (!lines.some(line => line.startsWith(`${field}:`))) lines.push(`${field}: ${value}`);
    const meta = dataMeta(), before = structuredClone(meta.characterContext);
    const result = parseSpriteData(lines.join('\n'), meta);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.issue, 'preserved');
    assert.equal(result.diagnostic.field, field);
    assert.equal(result.diagnostic.lineNumber, lines.findIndex(line => line.startsWith(`${field}:`)) + 1);
    assert.deepEqual(meta.characterContext, before);
});

test('已有身份被改写后，纠错明确要求沿用保存值，修正回复可完成出图', async t => {
    const f = fixture(t, { reply: input => f.h.writes.length === 1
        ? creatureReply(input).replace('1.2::lizard::', '1.2::dragon::') : creatureReply(input) });
    f.assets.characterDna = Object.fromEntries(names.map(name => [name, savedDna()]));
    const result = await f.service.processMessage(12);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.h.writes.length, 2);
    const feedback = f.h.writes[1].request.messages.find(m => m.content.startsWith('请重新交付'))?.content || '';
    assert.match(feedback, /dna_full_body/);
    assert.match(feedback, /已保存/);
    assert.match(feedback, /省略|逐字/);
    assert.equal(f.h.wires.length, 2);
});
