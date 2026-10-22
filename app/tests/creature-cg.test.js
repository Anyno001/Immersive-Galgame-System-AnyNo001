import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoIllustrationService } from './helpers/media-fixtures.js';
import { createIndexedDbIllustrationStore, floorKeyOf } from '../src/media/illustration-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { characterViewsFixture } from './helpers/prompt-provenance.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { secondaryLlmText } from '../src/host/secondary-llm-result.js';
import { creatureCgRule } from '../src/generated-images/prompt-tasks/creature.js';
import { withCreatureCast, isUnclothedCreature, stripOutfitSlot } from '../src/generated-images/illustration/creature-cg.js';
import { checkOutfitTemplates } from '../src/schemas/outfit-template.js';
import { tidyCreatureCaption } from '../src/generated-images/creature-caption.js';

const WOLF = 'no humans, 1.2::wolf::, quadruped, grey fur, yellow eyes, scar over left eye,';
const baseAssets = () => ({ characters: {}, characterOutfits: {}, wardrobe: {}, characterDna: {
    Alice: { version: 2, identity: 'silver hair', views: characterViewsFixture('Alice, an adult woman with silver hair,') },
    银狼: { version: 2, identity: 'wolf', creature: { form: 'beast', size: 'large', anchor: 'ground' }, views: characterViewsFixture(WOLF) },
} });
const head = ['slotid: 1', 'at: 1', 'prompt_mode: dna_template', 'outfit_mode: template'];
const alice = (i, token = `r${i}`) => [`meta_kind: ${i} | named`, `meta_key: ${i} | Alice`, `meta_token: ${i} | ${token}`, `meta_frame: ${i} | half_body`,
    `meta_identity: ${i} | Alice, an adult woman,`, `meta_signature: ${i} |`, `meta_outfit_name: ${i} | Navy coat`,
    `meta_outfit_description: ${i} | wears a navy coat`, `meta_outfit_id: ${i} |`];
const wolf = (i, outfit = true) => [`meta_kind: ${i} | named`, `meta_key: ${i} | 银狼`, `meta_token: ${i} | r${i}`, `meta_frame: ${i} | full_body`,
    `meta_identity: ${i} | ${WOLF}`, `meta_signature: ${i} |`,
    ...(outfit ? [`meta_outfit_name: ${i} | `, `meta_outfit_description: ${i} | `, `meta_outfit_id: ${i} |`] : [])];

async function run({ text, reply, assets = baseAssets() }) {
    const h = builtinImageHarness({ reply: () => secondaryLlmText(reply.join('\n')) });
    Object.assign(h.bridge.autoIllustration, { interludeEnabled: true, interludeMaxCount: 1 });
    let body = text;
    const floor = () => ({ chatId: 'creature-cg', messageId: 7, swipeId: 0, isAi: true, isLatest: true, text: body });
    const host = { getChatId: () => 'creature-cg', readFloor: floor, readPreviousAiTexts: () => [],
        async writeFloor(_id, next) { body = next; return { ok: true }; }, on: () => () => {},
        attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }), destroy() {} };
    const store = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
    const service = createAutoIllustrationService({ nai: h.backend, llm: h.llm, store, messageHost: host,
        getSettings: () => h.bridge.autoIllustration, getSceneAssets: () => assets, report: () => {} });
    const result = await service.processMessage(7, { manual: true });
    const slots = await store.getSlots(floorKeyOf(floor()));
    const sent = h.writes.map(w => JSON.stringify(w.request.messages)).join('\n');
    const out = { result, slots, writes: h.writes, wires: h.wires, sent };
    h.dispose();
    return out;
}

const TEXT = '[igs-scene:森林|夜晚|晴]\n银狼扑向Alice。\n[igs-char:Alice|惊讶|小心！]\n[igs-char:银狼|愤怒|嗷！]';

test('已登记的非人角色在 CG 里作为 named 出镜，带 DNA，衣装留空不报错', async () => {
    const r = await run({ text: TEXT, reply: [...head, 'scene: A dark forest.', 'scene_uc: lowres',
        'char: 0.3,0.5 | <<dna:r0>> <<outfit:r0>> and ducks.', 'char_uc:',
        'char: 0.7,0.5 | <<dna:r1>> <<outfit:r1>> and lunges, snarling.', 'char_uc: <<dna_uc:r1>>',
        ...alice(0), ...wolf(1)] });
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    assert.match(r.sent, /非人角色 CG 出镜/);
    assert.match(r.sent, /银狼（完全非人形（beast）/);
    const chars = r.wires[0].parameters.v4_prompt.caption.char_captions;
    assert.match(chars[1].char_caption, /^no humans, 1\.2::wolf::/);
    assert.match(chars[1].char_caption, /lunges, snarling/);
    assert.doesNotMatch(chars[1].char_caption, /1girl|1boy|<<|navy/);
    assert.match(chars[0].char_caption, /Alice, an adult woman with silver hair, wears a navy coat and ducks\./);
    const [slot] = r.slots;
    assert.equal(slot.promptRecipe.bindings[1].outfit.source, 'none');
    assert.equal(slot.promptRecipe.bindings[0].outfit.source, 'candidate');
    assert.deepEqual(slot.outfitSnapshot.characters.map(c => c.characterKey), ['Alice']);
});

test('非人角色衣装三项整体省略也可以', async () => {
    const r = await run({ text: '[igs-scene:森林|夜晚|晴]\n银狼蹲伏着低吼。\n[igs-char:银狼|愤怒|嗷！]', reply: [...head, 'scene: A dark forest.', 'scene_uc: lowres',
        'char: 0.5,0.5 | <<dna:r0>> and crouches, growling.', 'char_uc:', ...wolf(0, false)] });
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    assert.equal(r.slots[0].promptRecipe.bindings[0].outfit.source, 'none');
});

test('战斗对手没有说话标签时，已登记的非人档案并入可出镜角色池', async () => {
    const r = await run({ text: '[igs-scene:森林|夜晚|晴]\n银狼扑向Alice。\n[igs-fx:battle|银狼|森林恶狼]\n[igs-char:Alice|惊讶|小心！]',
        reply: [...head, 'scene: A dark forest.', 'scene_uc: lowres',
            'char: 0.3,0.5 | <<dna:r0>> <<outfit:r0>> and ducks.', 'char_uc:',
            'char: 0.7,0.5 | <<dna:r1>> and lunges.', 'char_uc:', ...alice(0), ...wolf(1)] });
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    assert.deepEqual(r.writes[0].input.promptTask.characters.map(c => c.characterKey), ['Alice', '银狼']);
});

test('未登记的路人怪物仍为 generic，且纯人类池不附加非人规则', async () => {
    const assets = baseAssets(); delete assets.characterDna.银狼;
    const r = await run({ assets, text: '[igs-scene:森林|夜晚|晴]\nAlice遇到一只野狼。\n[igs-char:Alice|惊讶|啊！]',
        reply: [...head, 'scene: A dark forest.', 'scene_uc: lowres',
            'char: 0.3,0.5 | <<dna:r0>> <<outfit:r0>> and steps back.', 'char_uc:',
            'char: 0.8,0.5 | wolf, no humans, snarling.', 'char_uc:', ...alice(0), 'meta_kind: 1 | generic'] });
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    assert.equal(r.slots[0].promptRecipe.bindings[1].kind, 'generic');
    assert.doesNotMatch(r.sent, /非人角色 CG 出镜/);
});

test('人类缺衣装仍被拒绝；source=none 只对非人角色有效', async () => {
    const bad = await run({ text: '[igs-scene:森林|夜晚|晴]\nAlice站着。\n[igs-char:Alice|平静|嗯。]',
        reply: [...head, 'scene: A forest.', 'scene_uc: lowres', 'char: 0.5,0.5 | <<dna:r0>> and stands.', 'char_uc:',
            'meta_kind: 0 | named', 'meta_key: 0 | Alice', 'meta_token: 0 | r0', 'meta_frame: 0 | half_body',
            'meta_identity: 0 | Alice, an adult woman,', 'meta_signature: 0 |', 'meta_outfit_name: 0 |', 'meta_outfit_description: 0 |', 'meta_outfit_id: 0 |'] });
    assert.equal(bad.result.ok, false);
    const recipe = { outfitMode: 'template', outfitSelection: 'catalog', bindings: [{ kind: 'named', characterKey: 'Alice', token: 'r0', captionIndex: 0,
        outfit: { name: '', description: '', source: 'none' } }],
        caption: { v4_prompt: { caption: { base_caption: '', char_captions: [{ char_caption: '<<dna:r0>> stands' }] } },
            v4_negative_prompt: { caption: { base_caption: '', char_captions: [{ char_caption: '' }] } } } };
    const meta = { characters: [{ characterKey: 'Alice', captionIndex: 0, outfit: { name: '', description: '' } }] };
    const task = { purpose: 'cg', outfitMode: 'template', outfitSelection: 'catalog' };
    assert.equal(checkOutfitTemplates(recipe, meta, [{ characterKey: 'Alice', dna: { identity: 'x' } }], task).ok, false);
    assert.equal(checkOutfitTemplates(recipe, meta, [{ characterKey: 'Alice', dna: { creature: { form: 'beast' } } }], task).ok, true);
});

test('规则文本与辅助函数', () => {
    assert.equal(creatureCgRule([{ characterKey: 'Alice', dna: { identity: 'x' } }]), '');
    assert.equal(creatureCgRule(undefined), '');
    const text = creatureCgRule([{ characterKey: '岩甲蜥', dna: { creature: { form: 'beast', size: 'giant', anchor: 'float' } } }]);
    assert.match(text, /岩甲蜥（完全非人形（beast）；巨型（giant）；悬浮（float））/);
    assert.match(text, /no humans/);
    const humans = ['Alice'];
    assert.equal(withCreatureCast(humans, '[igs-fx:battle|路人|x]', baseAssets()), humans);
    assert.deepEqual(withCreatureCast(humans, '[igs-fx:battle|银狼|x]', baseAssets()), ['Alice', '银狼']);
    assert.equal(isUnclothedCreature([{ characterKey: '银狼', dna: { creature: {} } }], { meta_kind: 'named', meta_key: '银狼', meta_outfit_name: '' }), true);
    assert.equal(isUnclothedCreature([{ characterKey: '银狼', dna: { creature: {} } }], { meta_kind: 'named', meta_key: '银狼', meta_outfit_name: '项圈', meta_outfit_description: 'collar' }), false);
    assert.equal(isUnclothedCreature([{ characterKey: 'Alice', dna: {} }], { meta_kind: 'named', meta_key: 'Alice' }), false);
    assert.equal(stripOutfitSlot('<<dna:r1>> <<outfit:r1>> and growls', 'r1'), '<<dna:r1>> and growls');
    assert.equal(stripOutfitSlot('<<dna:r1>>, <<outfit:r1>>, growls', 'r1'), '<<dna:r1>>, growls');
});

test('CG 里只整理非人角色自己的人物词，场景与人类逐字不动', () => {
    const caption = { v4_prompt: { caption: { base_caption: 'smile, smile', char_captions: [{ char_caption: 'smile, smile' }, { char_caption: 'fur, fur, smile' }] } },
        v4_negative_prompt: { caption: { base_caption: '', char_captions: [{ char_caption: 'a, a' }, { char_caption: 'b, b' }] } } };
    tidyCreatureCaption(caption, { only: [1] });
    assert.equal(caption.v4_prompt.caption.base_caption, 'smile, smile');
    assert.equal(caption.v4_prompt.caption.char_captions[0].char_caption, 'smile, smile');
    assert.equal(caption.v4_prompt.caption.char_captions[1].char_caption, 'fur, smile');
    assert.equal(caption.v4_negative_prompt.caption.char_captions[0].char_caption, 'a, a');
    assert.equal(caption.v4_negative_prompt.caption.char_captions[1].char_caption, 'b');
});

test('形态待判定（auto）的临时档按人类处理：不入池、不写非人规则、无衣装不放行', () => {
    const assets = baseAssets();
    assets.characterDna.山贼 = { version: 2, identity: 'bandit', creature: { form: 'auto', temp: true } };
    const cast = ['Alice'];
    assert.equal(withCreatureCast(cast, '[igs-fx:battle|山贼|山贼]', assets), cast);
    assert.equal(creatureCgRule([{ characterKey: '山贼', dna: assets.characterDna.山贼 }]), '');
    assert.equal(isUnclothedCreature([{ characterKey: '山贼', dna: assets.characterDna.山贼 }], { meta_kind: 'named', meta_key: '山贼' }), false);
});

test('source=none 没有角色资料时不放行', async () => {
    const { checkPromptRecipe } = await import('../src/schemas/prompt-recipe.js');
    const caption = { v4_prompt: { caption: { base_caption: '', char_captions: [{ char_caption: '<<dna:r0>> x' }] } },
        v4_negative_prompt: { caption: { base_caption: '', char_captions: [{ char_caption: '' }] } } };
    const recipe = { version: 1, mode: 'dna_template', outfitMode: 'template', outfitSelection: 'catalog', caption,
        bindings: [{ kind: 'named', characterKey: '银狼', token: 'r0', captionIndex: 0, framing: 'full_body', outfit: { name: '', description: '', source: 'none' } }] };
    const task = { version: 1, mode: 'dna_template', purpose: 'cg', outfitMode: 'template', outfitSelection: 'catalog', characters: [{ characterKey: '银狼', token: 'r0', kind: 'named' }] };
    assert.equal(checkPromptRecipe(recipe, caption, task).ok, false);
    assert.equal(checkPromptRecipe(recipe, caption, task, { context: [{ characterKey: '银狼', dna: { creature: { form: 'auto' } } }] }).ok, false);
    assert.equal(checkPromptRecipe(recipe, caption, task, { context: [{ characterKey: '银狼', dna: { creature: { form: 'beast' } } }] }).ok, true);
});
