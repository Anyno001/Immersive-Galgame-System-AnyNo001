import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { spriteDataReply } from './helpers/prompt-provenance.js';
import { normalizeCharacterDna, normalizeCharacterDnaMap, isCharacterDnaEmpty } from '../src/scene/character-dna.js';
import {
    normalizeCreatureProfile, parseCreatureForm, parseCreatureSize, parseCreatureAnchor, creatureCanvasSize,
    creatureFraming, creatureMoodLabels, ensureTempCreature, promoteTempCreature, CREATURE_TEMP_LIMIT, CREATURE_TIERS,
} from '../src/scene/creature-profile.js';
import { creatureHintsOf, planCreatureProfiles } from '../src/scene/creature-registry.js';
import { createCharacterDnaStore } from '../src/core/character-dna-store.js';
import { creatureFixedPrompts } from '../src/generated-images/creature-sprite.js';
import { buildAssetSlot } from '../src/generated-images/illustration/asset-prompt.js';
import { CREATURE_SPRITE_DATA_RULE, CREATURE_EXAMPLE_LINES } from '../src/generated-images/prompt-tasks/creature.js';
import { promptKindOf } from '../src/generated-images/prompt-artists.js';

test('creature 档案归一化：默认值、同义词与无效值回落', () => {
    assert.equal(normalizeCreatureProfile(undefined), null);
    assert.equal(normalizeCreatureProfile('x'), null);
    assert.deepEqual(normalizeCreatureProfile({}), { form: 'beast', size: 'medium', anchor: 'ground', temp: false, group: false, canvas: 'portrait', tiers: 'four' });
    const p = normalizeCreatureProfile({ form: '半人', size: '巨型', anchor: '飞行', canvas: 'square', tiers: 'bad', seenAt: 5 });
    assert.deepEqual([p.form, p.size, p.anchor, p.canvas, p.tiers, p.seenAt], ['humanoid', 'giant', 'float', 'square', 'full', 5]);
    assert.equal(normalizeCreatureProfile({ size: 'enormous' }).size, 'medium');
    assert.deepEqual([parseCreatureForm('兽'), parseCreatureForm('beast'), parseCreatureSize('小'), parseCreatureAnchor('悬浮'), parseCreatureSize('?')], ['beast', 'beast', 'small', 'float', '']);
});

test('creature 挂在 DNA 上：人类不产生该字段，带档案的空 DNA 不算空', () => {
    assert.equal('creature' in normalizeCharacterDna({ identity: 'a' }), false);
    const dna = normalizeCharacterDna({ creature: { size: 'large' } });
    assert.equal(dna.creature.size, 'large');
    assert.equal(isCharacterDnaEmpty(dna), false);
    assert.equal(isCharacterDnaEmpty(normalizeCharacterDna({})), true);
    assert.equal(normalizeCharacterDnaMap({ 怪: { creature: { form: 'beast' } } }).怪.creature.form, 'beast');
});

test('画布、取景景别与四档姿态', () => {
    assert.equal(creatureCanvasSize({ canvas: 'portrait' }), '832x1216');
    assert.equal(creatureCanvasSize({ canvas: 'square' }), '1216x1216');
    assert.equal(creatureCanvasSize({ canvas: 'landscape' }), '1216x832');
    assert.equal(creatureFraming({ size: 'giant' }), 'half_body');
    assert.equal(creatureFraming({ size: 'large' }), 'full_body');
    assert.deepEqual(creatureMoodLabels({ form: 'beast' }), CREATURE_TIERS.map(t => t.mood));
    assert.equal(creatureMoodLabels({ form: 'humanoid' }), null);
    assert.equal(creatureMoodLabels({ form: 'humanoid', tiers: 'four' }).length, 4);
});

test('临时档案：同名不重复、刷新出场、超上限按最近出场淘汰、可转正', () => {
    let map = {};
    let r = ensureTempCreature(map, '史莱姆', { now: 1 });
    assert.equal(r.created, true); assert.equal(r.map.史莱姆.creature.temp, true);
    map = r.map;
    r = ensureTempCreature(map, '史莱姆', { now: 9 });
    assert.equal(r.created, false); assert.equal(r.map.史莱姆.creature.seenAt, 9);
    for (let i = 0; i < CREATURE_TEMP_LIMIT; i += 1) map = ensureTempCreature(map, `怪${i}`, { now: 100 + i }).map;
    assert.equal(Object.keys(map).length, CREATURE_TEMP_LIMIT);
    assert.equal(map.史莱姆, undefined, '最久未出场的被淘汰');
    assert.ok(map.怪49);
    assert.equal(promoteTempCreature(map, '怪0').怪0.creature.temp, false);
    const human = { 艾莉: { identity: 'x' } };
    assert.equal(ensureTempCreature(human, '艾莉').created, false);
});

test('正文线索与登记规划：战斗对手建临时档，已登记人物不动，标注可建档与改体型', () => {
    const text = '[igs-fx:creature|岩甲蜥|兽|大型|落地]\n[igs-fx:battle|岩甲蜥|山中霸主]\n[igs-fx:battle|艾莉|对手]\n[igs-fx:battle|我|x]';
    const hints = creatureHintsOf(text);
    assert.deepEqual(hints.map(h => [h.name, h.source, h.size || '']), [['岩甲蜥', 'creature', 'large'], ['艾莉', 'battle', '']]);
    const effective = { characterDna: { 艾莉: { identity: 'silver hair' } }, characters: { 艾莉: { 默认: 'a.png' } } };
    const plan = planCreatureProfiles({ effective, cardDna: effective.characterDna, hints, now: 5 });
    assert.deepEqual(plan.created, ['岩甲蜥']);
    assert.equal(plan.cardDna.岩甲蜥.creature.size, 'large');
    assert.equal(plan.cardDna.岩甲蜥.creature.temp, false);
    assert.equal(plan.cardDna.艾莉.creature, undefined);
    const foe = planCreatureProfiles({ effective: {}, cardDna: {}, hints: creatureHintsOf('[igs-fx:battle|哥布林|x]'), now: 7 });
    assert.deepEqual([foe.cardDna.哥布林.creature.temp, foe.cardDna.哥布林.creature.form, foe.cardDna.哥布林.creature.size], [true, 'auto', 'medium']);
    assert.equal(planCreatureProfiles({ effective: {}, cardDna: {}, hints: creatureHintsOf('[igs-fx:battle|山贼们|x]') }).changed, false, '群体名不建档');
    // 多对手写法「甲、乙」逐个登记（第三期起），顿号不再当作群体名整体丢弃。
    assert.deepEqual(planCreatureProfiles({ effective: {}, cardDna: {}, hints: creatureHintsOf('[igs-fx:battle|甲、乙|x]'), now: 9 }).created, ['甲', '乙']);
    const discarded = planCreatureProfiles({ effective: { characterDna: foe.cardDna }, cardDna: foe.cardDna, hints: [{ name: '哥布林', source: 'discard' }] });
    assert.equal(discarded.cardDna.哥布林, undefined);
    const resize = planCreatureProfiles({ effective: { characterDna: foe.cardDna }, cardDna: foe.cardDna, hints: creatureHintsOf('[igs-fx:creature|哥布林|兽|巨型]') });
    assert.equal(resize.cardDna.哥布林.creature.size, 'giant');
    assert.equal(planCreatureProfiles({ effective: {}, cardDna: {}, hints: [] }).changed, false);
});

test('存储接线：只写本卡 characterDna，不动全局', () => {
    const root = { characterDna: { 全局角色: { identity: 'g' } }, cards: {} };
    let saved = null;
    const store = createCharacterDnaStore({ readAssets: () => root, readContext: () => ({ name2: '测试卡' }),
        saveAssets: next => { saved = next; return { ok: true }; } });
    const result = store.registerCreatures(creatureHintsOf('[igs-fx:battle|影狼|x]'), { now: 3 });
    assert.equal(result.ok, true); assert.deepEqual(result.created, ['影狼']);
    assert.equal(saved.cards['card:测试卡'].characterDna.影狼.creature.temp, true);
    assert.deepEqual(saved.characterDna, root.characterDna);
    assert.equal(root.cards['card:测试卡'], undefined, '不原地修改入参');
});

test('非人固定词：按体型取景、落地方式与形态分开，不含人类取景词', () => {
    const small = creatureFixedPrompts({ form: 'beast', size: 'small' });
    assert.match(small.positive, /no humans, solo, full body/);
    assert.doesNotMatch(small.positive, /upper body|standing/);
    assert.match(small.negative, /1girl, 1boy/);
    const giant = creatureFixedPrompts({ form: 'beast', size: 'giant' });
    assert.match(giant.positive, /from below, upper body, close-up, out of frame/);
    assert.doesNotMatch(giant.negative, /out of frame/);
    const float = creatureFixedPrompts({ form: 'beast', size: 'medium', anchor: 'float' }, { transparent: true });
    assert.match(float.positive, /^floating, hovering/); assert.match(float.positive, /transparent background/);
    const humanoid = creatureFixedPrompts({ form: 'humanoid', size: 'medium' });
    assert.doesNotMatch(humanoid.positive, /no humans/);
    assert.match(humanoid.negative, /cropped tail/);
    assert.doesNotMatch(creatureFixedPrompts({ form: 'beast' }, { whiteBackground: true }).negative, /white background/);
});

test('旧组合路径：buildAssetSlot 对非人角色分派，人类立绘词不变', () => {
    const creature = buildAssetSlot({ need: { type: 'sprite', name: '蜥', dna: normalizeCharacterDna({ creature: { size: 'large' }, identity: 'no humans, lizard' }) }, tags: 'coiled', uc: 'bad' });
    assert.match(creature.scene, /full body, towering/); assert.doesNotMatch(creature.scene, /upper body/);
    assert.match(creature.scene, /lizard/); assert.match(creature.sceneUc, /bad/);
    const human = buildAssetSlot({ need: { type: 'sprite', name: '艾莉' }, tags: 'smile', uc: '' });
    assert.match(human.scene, /upper body, standing/);
    assert.equal(promptKindOf({ promptKind: 'creature' }), 'creature');
});

test('写词规则：非人规则不要求衣装，含非人示例', () => {
    assert.doesNotMatch(CREATURE_SPRITE_DATA_RULE, /outfit_name: /);
    assert.ok(CREATURE_EXAMPLE_LINES.some(l => /^dna_full_body: no humans/.test(l)));
    assert.ok(CREATURE_EXAMPLE_LINES.some(l => /^pose:/.test(l)));
});

const lizard = (task, row) => [`slotid: ${row.slotId}`, `character: ${task.characters.find(c => c.token === row.tokens[0]).characterKey}`,
    'personality: wary,', 'dna_full_body: no humans, 1.2::lizard::, four legs, stone plates,', 'dna_uc_full_body: ',
    'dna_half_body: no humans, 1.2::lizard::, stone plates,', 'dna_uc_half_body: ', 'dna_portrait: no humans, 1.2::lizard::,', 'dna_uc_portrait: ',
    'pose: all fours, head lowered,', 'pose_uc: jumping,'].join('\n');
function reply(input) {
    if (!input.characterContext?.some(c => c.dna?.creature || c.creature)) return spriteDataReply(input, { outfitDescription: 'wears a white dress' });
    if (input.outputs.format === 'sprite-data') return input.promptTask.slots.map(slot => lizard(input.promptTask, slot)).join('\n---\n');
    return input.outputs.rows.map(row => `slotid: ${row.slotId}\ncharacter: ${row.characterKey}\nexpression: roaring, mouth open,\nexpression_uc: sleeping`).join('\n---\n');
}
function fixture(assets, extra = {}) {
    const h = builtinImageHarness({ reply });
    let n = 0;
    const service = createAssetGenerationService({ nai: h.backend, store: createIndexedDbGeneratedAssetStore({ indexedDB: createTransactionalIdb() }),
        llm: extra.judge ? Object.assign(Object.create(h.llm), { request: (req, settings) => (String(req.system).includes('判定战斗对手') ? Promise.resolve(extra.judge(req)) : h.llm.request(req, settings)) }) : h.llm,
        messageHost: extra.messageHost || { getChatId: () => 'creature' }, getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        matte: async url => url, report: () => {}, newId: () => `c${++n}`, ...extra.deps });
    return { h, service };
}

for (const [label, creature, expectSize, expectText] of [
    ['中型四足兽', { form: 'beast', size: 'medium' }, [832, 1216], /no humans, solo, full body, battle stance/],
    ['巨型方图', { form: 'beast', size: 'giant', canvas: 'square' }, [1024, 1024], /from below, upper body/],
]) test(`非人默认立绘端到端：${label}`, async t => {
    const assets = { characters: {}, characterDna: { 怪: { creature } }, scenes: {} };
    const { h, service } = fixture(assets); t.after(() => h.dispose());
    const result = await service.generateCharacterSprite({ name: '怪', dna: assets.characterDna.怪 });
    assert.equal(result.ok, true, JSON.stringify(result));
    const write = h.writes[0];
    assert.equal(write.request.messages.some(m => m.content.includes('【非人身份】')), true, '使用非人写词规则');
    assert.equal(write.input.promptTask.outfitMode, undefined);
    assert.equal(write.input.promptTask.characters[0].framing, creature.size === 'giant' ? 'half_body' : 'full_body');
    const body = h.wires[0].parameters;
    assert.deepEqual([body.width, body.height], expectSize);
    const caption = body.v4_prompt.caption;
    assert.match(caption.base_caption, expectText);
    assert.doesNotMatch(caption.base_caption, /upper body, standing/);
    assert.match(caption.char_captions[0].char_caption, /1.2::lizard::/);
    assert.match(caption.char_captions[0].char_caption, /all fours, head lowered/);
    assert.doesNotMatch(JSON.stringify(h.wires[0]), /outfit/);
});

test('非人四档姿态差分：同一整套种子，只写姿态，身份原样', async t => {
    const assets = { characters: {}, characterDna: { 怪: { creature: { form: 'beast' } } }, scenes: {} };
    const { h, service } = fixture(assets); t.after(() => h.dispose());
    const first = await service.generateCharacterSprite({ name: '怪', dna: assets.characterDna.怪 });
    const image = await service.readStoredImage(first.imageId);
    assets.characterDna.怪 = { creature: { form: 'beast' }, version: 2, personality: 'wary,', views: image.dnaCandidates.characters[0].views, identityInitialized: true };
    const set = await service.generateExpressionSet({ name: '怪', moods: ['微笑'], dna: assets.characterDna.怪 });
    assert.equal(set.ok, true, JSON.stringify(set));
    assert.deepEqual(set.items.map(i => i.mood), ['平和', '愤怒', '哭泣', '不满']);
    assert.ok(set.items.every(i => i.ok), JSON.stringify(set.items));
    const sets = h.wires.slice(1);
    assert.equal(sets.length, 4);
    assert.equal(new Set(sets.map(w => w.parameters.seed)).size, 1);
    for (const w of sets) assert.match(w.parameters.v4_prompt.caption.char_captions[0].char_caption, /1.2::lizard::.*roaring/);
});

test('自动补全：战斗对手建临时档并出立绘，人类角色同楼流程分开', async t => {
    const assets = { enabled: true, characters: { 艾莉: { 默认: 'a.png' } }, characterDna: {}, scenes: {} };
    const floor = { chatId: 'creature', messageId: 3, swipeId: 0, isAi: true, isLatest: true,
        text: `[igs-fx:battle|岩甲蜥|守卫]\n[igs-char:艾莉|平静|${'迎战。'.repeat(30)}]` };
    const { h, service } = fixture(assets, { judge: () => '岩甲蜥: beast',
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor, readPreviousAiTexts: () => [], readCharacterLore: async () => [], on: () => () => {} },
        deps: { registerCreatureProfiles(hints) {
            const plan = planCreatureProfiles({ effective: assets, cardDna: assets.characterDna, hints, now: 1 });
            if (plan.changed) assets.characterDna = plan.cardDna;
            return { ok: true, changed: plan.changed };
        } } });
    t.after(() => h.dispose());
    h.bridge.autoIllustration.assets = { ...h.bridge.autoIllustration.assets, spriteEnabled: true, backgroundEnabled: false, maxPerFloor: 8 };
    const result = await service.processMessage(3, { manual: true });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(assets.characterDna.岩甲蜥.creature.temp, true);
    assert.equal(assets.characterDna.岩甲蜥.creature.form, 'beast', '写词前判定为完全非人形');
    assert.equal(result.count, 1, '艾莉已有立绘，只补怪');
    assert.match(h.wires[0].parameters.v4_prompt.caption.base_caption, /no humans, solo, full body/);
});

test('非人最终提示词整理：按标签去重并保留权重写法，差分让固定姿态词让位，无首尾多余逗号', async () => {
    const { tidyCreatureCaption } = await import('../src/generated-images/creature-caption.js');
    const make = () => ({ v4_prompt: { caption: { base_caption: 'no humans, solo, full body, battle stance, centered', char_captions: [{ char_caption: '1.2::No Humans::, wolf, wary, territorial, idle stance,' }] } },
        v4_negative_prompt: { caption: { base_caption: 'human, full body', char_captions: [{ char_caption: ', full body, sitting,' }] } } });
    const sprite = tidyCreatureCaption(make());
    assert.equal(sprite.v4_prompt.caption.base_caption, '1.2::No Humans::, solo, full body, battle stance, centered');
    assert.equal(sprite.v4_prompt.caption.char_captions[0].char_caption, 'wolf, wary, territorial, idle stance');
    assert.equal(sprite.v4_negative_prompt.caption.char_captions[0].char_caption, 'sitting');
    assert.equal(tidyCreatureCaption(make(), { derived: true }).v4_prompt.caption.base_caption, '1.2::No Humans::, solo, full body, centered');
    const { normalizeAutoIllustrationSettings } = await import('../src/generated-images/illustration/auto-illustration-settings.js');
    assert.equal(normalizeAutoIllustrationSettings({}).assets.creatureAutoProfile, true);
    assert.equal(normalizeAutoIllustrationSettings({ assets: { creatureAutoProfile: false } }).assets.creatureAutoProfile, false);
});

function battleFloor(text, assets, judge) {
    const floor = { chatId: 'creature', messageId: 4, swipeId: 0, isAi: true, isLatest: true, text };
    const made = fixture(assets, { judge,
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor, readPreviousAiTexts: () => [], readCharacterLore: async () => [], on: () => () => {} },
        deps: { registerCreatureProfiles(hints) {
            const plan = planCreatureProfiles({ effective: assets, cardDna: assets.characterDna, hints, now: 1 });
            if (plan.changed) assets.characterDna = plan.cardDna;
            return { ok: true, changed: plan.changed };
        } } });
    made.h.bridge.autoIllustration.assets = { ...made.h.bridge.autoIllustration.assets, spriteEnabled: true, backgroundEnabled: false, maxPerFloor: 8 };
    return made;
}

test('战斗对手判为人类：删除临时档案并按人类立绘流程出图', async t => {
    const assets = { enabled: true, characters: {}, characterDna: {}, scenes: {} };
    const { h, service } = battleFloor('[igs-fx:battle|黑衣剑客|x]', assets, () => '黑衣剑客: human');
    t.after(() => h.dispose());
    const result = await service.processMessage(4, { manual: true });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(assets.characterDna.黑衣剑客, undefined);
    assert.equal(h.wires.length, 1);
    assert.match(h.wires[0].parameters.v4_prompt.caption.base_caption, /upper body, standing/);
    assert.doesNotMatch(h.wires[0].parameters.v4_prompt.caption.base_caption, /no humans/);
});

test('战斗对手同楼说话、群体称呼或判定失败：不按怪物出图', async t => {
    const spoken = { enabled: true, characters: {}, characterDna: {}, scenes: {} };
    const a = battleFloor('[igs-fx:battle|黑衣剑客|x]\n[igs-char:黑衣剑客|平静|' + '拔剑。'.repeat(30) + ']', spoken, () => '黑衣剑客: beast');
    t.after(() => a.h.dispose());
    await a.service.processMessage(4, { manual: true });
    assert.equal(spoken.characterDna.黑衣剑客, undefined, '已作为角色出现，不建档');
    const group = { enabled: true, characters: {}, characterDna: {}, scenes: {} };
    const b = battleFloor('[igs-fx:battle|山贼们|x]', group, () => '山贼们: beast');
    t.after(() => b.h.dispose());
    await b.service.processMessage(4, { manual: true });
    assert.deepEqual(group.characterDna, {});
    const failed = { enabled: true, characters: {}, characterDna: {}, scenes: {} };
    const c = battleFloor('[igs-fx:battle|影狼|x]', failed, () => '无法判断');
    t.after(() => c.h.dispose());
    await c.service.processMessage(4, { manual: true });
    assert.equal(c.h.wires.length, 0, '判定失败本轮不出图');
});
