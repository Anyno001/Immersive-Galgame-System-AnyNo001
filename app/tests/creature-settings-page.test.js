import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresetRegistry } from '../src/presets/preset-registry.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { validatePromptActivation, clonePromptData } from '../src/presets/prompt-preset.js';
import { renderImagePromptPreset } from '../src/presets/prompt-preset-renderer.js';
import { createDefaultImagePromptPreset, completeImagePromptPreset, IMAGE_PROMPT_DEFAULT_ID } from '../src/generated-images/image-prompt-defaults.js';
import { createImagePromptLlm } from '../src/generated-images/image-prompt-runtime.js';
import { createImagePromptEditor } from '../src/visual/igs-ui/settings-image-prompt-editor.js';
import { CREATURE_SPRITE_DATA_RULE, CREATURE_EXPRESSION_FRAGMENTS_RULE, creatureFacts } from '../src/generated-images/prompt-tasks/creature.js';
import { creatureFixedPrompts } from '../src/generated-images/creature-sprite.js';
import {
    CREATURE_DISPLAY_DEFAULTS, creatureFraming, creatureMoodLabels, creatureOf, confirmedCreatureOf, normalizeCreatureDisplaySettings,
    normalizeCreatureProfile, setCreatureSystem, storedCreatureOf,
} from '../src/scene/creature-profile.js';
import { creatureDisplayProfileOf, creatureProfileOf, isGiantCreature, applyCreatureScale } from '../src/visual/igs-ui/creature-layout.js';
import { editCharacterCreature, renderCharacterCreatureRows, renderCharacterCreatureTag } from '../src/visual/igs-ui/creature-settings.js';
import { normalizeBattleFxSettings } from '../src/visual/igs-ui/fx-battle-model.js';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { renderFxFeatureFields } from '../src/visual/igs-ui/fx-settings-fields.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { SETTINGS_SEARCH_INDEX, searchSettings } from '../src/visual/igs-ui/settings-search.js';
import { buildPageDiagnostic } from '../src/visual/igs-ui/page-diagnostic.js';
import { checkbox } from '../src/visual/igs-ui/settings-fields.js';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';

const humanoid = (extra = {}) => normalizeCreatureProfile({ form: 'humanoid', size: 'medium', anchor: 'ground', ...extra });
const dnaOf = (creature) => ({ identity: 'x', creature });

// ---- 设置值 ----

test('非人显示设置：默认值、范围与总开关', () => {
    assert.deepEqual(normalizeCreatureDisplaySettings(undefined), { enabled: true, ...CREATURE_DISPLAY_DEFAULTS, giantFill: true });
    assert.deepEqual(CREATURE_DISPLAY_DEFAULTS, { small: 70, medium: 100, large: 135 });
    const custom = normalizeCreatureDisplaySettings({ enabled: false, giantFill: 'false', small: 10, large: 999, medium: '90' });
    assert.deepEqual(custom, { enabled: false, small: 30, medium: 90, large: 220, giantFill: false });
    assert.equal(normalizeFxReaderSettings(null).creatureDisplay.large, 135);
    assert.equal(normalizeBattleFxSettings({ enabled: true }).creature, true);
    assert.equal(normalizeBattleFxSettings({ enabled: true, creature: false }).creature, false);
    assert.equal(normalizeSettingsValue('readerSettings.creatureDisplay.large', '500'), 220);
    assert.equal(normalizeSettingsValue('readerSettings.creatureDisplay.giantFill', false), false);
    assert.equal(normalizeSettingsValue('readerSettings.battleFx.creature', 'false'), false);
});

test('体型缩放读设置：小中大三项生效，手摆高度不再乘', () => {
    const profile = confirmedCreatureOf(dnaOf({ form: 'beast', size: 'large' }));
    const layout = { scale: 100, posX: 50, posY: 100 };
    assert.equal(applyCreatureScale(profile, layout, { large: 150 }).scale, 150);
    assert.equal(applyCreatureScale(profile, layout, normalizeCreatureDisplaySettings({})).scale, 135);
    assert.equal(applyCreatureScale(profile, layout, { large: 150 }, true), layout);
});

// ---- 总开关与巨型铺满 ----

test('总开关关闭：所有角色按人类处理，档案保留；再开恢复', () => {
    const map = Object.freeze({ 狐: dnaOf({ form: 'beast', size: 'giant' }) });
    try {
        assert.ok(creatureProfileOf(map, '狐'));
        setCreatureSystem({ enabled: false });
        assert.equal(creatureOf(map.狐), null);
        assert.equal(confirmedCreatureOf(map.狐), null);
        assert.equal(creatureProfileOf(map, '狐'), null);
        assert.equal(storedCreatureOf(map.狐).size, 'giant');
        assert.equal(editCharacterCreature(map.狐, 'size', 'small').creature.size, 'small');
        assert.match(renderCharacterCreatureTag(map.狐), /非人/);
        setCreatureSystem({ enabled: true });
        assert.equal(creatureProfileOf(map, '狐').size, 'giant');
    } finally { setCreatureSystem({}); }
});

test('巨型铺满关闭：显示层按大型处理，生成取景不变', () => {
    const map = Object.freeze({ 龙: dnaOf({ form: 'beast', size: 'giant' }) });
    try {
        assert.equal(isGiantCreature(creatureProfileOf(map, '龙')), true);
        setCreatureSystem({ giantFill: false });
        const shown = creatureProfileOf(map, '龙');
        assert.equal(shown.size, 'large');
        assert.equal(isGiantCreature(shown), false);
        assert.equal(creatureFraming(confirmedCreatureOf(map.龙)), 'half_body');
    } finally { setCreatureSystem({}); }
});

// ---- 半身取景 ----

test('取景字段：仅半人形保留半身，全身不写字段，改形态时清除', () => {
    assert.equal(normalizeCreatureProfile({ form: 'beast', framing: 'half' }).framing, undefined);
    assert.equal(humanoid({ framing: 'full' }).framing, undefined);
    assert.equal(humanoid({ framing: 'half' }).framing, 'half');
    let dna = editCharacterCreature(dnaOf({ form: 'humanoid' }), 'framing', 'half');
    assert.equal(dna.creature.framing, 'half');
    dna = editCharacterCreature(dna, 'framing', 'full');
    assert.equal('framing' in dna.creature, false);
    dna = editCharacterCreature(editCharacterCreature(dna, 'framing', 'half'), 'form', 'beast');
    assert.equal('framing' in dna.creature, false);
});

test('半身取景接到出图：景别、固定词、描述与姿态规则换成非人半身版', () => {
    const full = humanoid(), half = humanoid({ framing: 'half' });
    assert.equal(creatureFraming(full), 'full_body');
    assert.equal(creatureFraming(half), 'half_body');
    const fullPrompt = creatureFixedPrompts(full), halfPrompt = creatureFixedPrompts(half);
    assert.match(fullPrompt.positive, /full body/);
    assert.match(halfPrompt.positive, /upper body/);
    assert.doesNotMatch(halfPrompt.positive, /full body/);
    assert.match(halfPrompt.negative, /full body/);
    // 悬浮词不进半身构图
    assert.doesNotMatch(creatureFixedPrompts(humanoid({ framing: 'half', anchor: 'float' })).positive, /floating/);
    // 人类半身词不借用：非人固定词保持 no humans 之外的半人形写法
    assert.doesNotMatch(halfPrompt.positive, /facing viewer, looking at viewer/);
    const facts = creatureFacts(half);
    assert.match(facts.line, /取景 upper body/);
    assert.match(facts.poseRule, /半身/);
    assert.match(creatureFacts(full).poseRule, /完整入画/);
    // 巨型保持局部取景
    assert.match(creatureFixedPrompts(humanoid({ framing: 'half', size: 'giant' })).positive, /from below/);
});

test('半身取景接到显示：显示层按人类布局，战斗侧仍认得非人', () => {
    const map = Object.freeze({ 狐: dnaOf({ form: 'humanoid', size: 'large', anchor: 'float', framing: 'half' }), 熊: dnaOf({ form: 'humanoid', size: 'large' }) });
    assert.equal(creatureDisplayProfileOf(map, '狐'), null);
    assert.ok(creatureProfileOf(map, '狐'));
    assert.ok(creatureDisplayProfileOf(map, '熊'));
    const giantHalf = Object.freeze({ 巨: dnaOf({ form: 'humanoid', size: 'giant', framing: 'half' }) });
    assert.equal(isGiantCreature(creatureProfileOf(giantHalf, '巨')), false);
});

test('情绪档：半人形默认完整，选四档后用四档姿态', () => {
    assert.equal(creatureMoodLabels(humanoid()), null);
    assert.equal(creatureMoodLabels(humanoid({ tiers: 'four' })).length, 4);
    const html = renderCharacterCreatureRows('狐', dnaOf({ form: 'humanoid' }));
    assert.match(html, /data-creature-field="framing"/);
    assert.match(html, /data-creature-field="tiers"/);
    assert.match(html, /取景/);
    assert.match(html, /情绪档/);
    const beast = renderCharacterCreatureRows('狐', dnaOf({ form: 'beast' }));
    assert.doesNotMatch(beast, /data-creature-field="framing"/);
    assert.doesNotMatch(beast, /data-creature-field="tiers"/);
    assert.doesNotMatch(beast, /creatureAutoProfile/);
});

// ---- 演出页 ----

test('非人演出开关：跟随战斗演出总开关，关闭时置灰', () => {
    const on = renderFxFeatureFields({ battleFx: { enabled: true } });
    assert.match(on.battleCreature, /data-switch="readerSettings\.battleFx\.creature"[^>]* aria-pressed="true"/);
    assert.doesNotMatch(on.battleCreature, /disabled/);
    const off = renderFxFeatureFields({ battleFx: { enabled: false } });
    assert.match(off.battleCreature, /disabled/);
    const closed = renderFxFeatureFields({ battleFx: { enabled: true, creature: false } });
    assert.match(closed.battleCreature, /aria-pressed="false"/);
    assert.match(checkbox('a.b', true, '项', true), /disabled aria-disabled="true"/);
});

// ---- 搜索与诊断 ----

test('设置搜索能找到非人角色各项', () => {
    const hit = (q, id) => assert.ok(searchSettings(q, SETTINGS_SEARCH_INDEX).some((entry) => entry.id === id), `${q} -> ${id}`);
    hit('非人', 'creature-system');
    hit('怪物', 'creature-system');
    hit('巨型', 'creature-system');
    hit('非人演出', 'creature-battle-fx');
    hit('半身', 'creature-framing');
    hit('情绪档', 'creature-framing');
    hit('非人画师串', 'creature-artist');
    hit('非人写词', 'creature-prompt-rule');
});

test('本页诊断带上非人角色设置', () => {
    const snapshot = { messageId: 3, content: { messageId: 3, currentIndex: 0, segments: [1], speaker: '狐', spriteCharacter: '狐', textType: 'x' },
        readerSettings: { creatureDisplay: { enabled: true, giantFill: false }, battleFx: { enabled: true, creature: false },
            _sceneAssets: { characterDna: { 狐: dnaOf({ form: 'humanoid', size: 'large', framing: 'half', tiers: 'four' }) } } } };
    const text = buildPageDiagnostic(snapshot, { version: '1' });
    assert.match(text, /非人角色 开 · 非人演出关 · 巨型铺满关 · 说话人「狐」半人形\/大型\/落地\/取景半身\/情绪档四档/);
    const human = buildPageDiagnostic({ ...snapshot, readerSettings: { creatureDisplay: { enabled: false } } }, { version: '1' });
    assert.match(human, /非人角色 关（所有角色按人类处理）/);
});

// ---- 旧预设补齐 ----

const oldPreset = () => {
    const preset = createDefaultImagePromptPreset();
    delete preset.data.taskMap.creature;
    preset.data.modules = preset.data.modules.filter((module) => module.task !== 'creature');
    preset.data.defaultState.baseline.modules = preset.data.defaultState.baseline.modules.filter((module) => module.task !== 'creature');
    delete preset.data.defaultState.baseline.taskMap.creature;
    return preset;
};
const input = (format) => ({ description: '写词', outputs: { format, slotIds: [1] } });

test('旧预设没有非人条目：校验通过，不报错', () => {
    const old = oldPreset();
    assert.equal(Object.hasOwn(old.data.taskMap, 'creature'), false);
    assert.equal(validatePromptActivation(old.data).ok, true);
    // 其余任务缺失仍然报错
    const broken = clonePromptData(old.data);
    delete broken.taskMap.sprite;
    assert.equal(validatePromptActivation(broken).ok, false);
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    assert.equal(registry.savePromptPreset(old, null).ok, true);
    assert.equal(registry.activateImagePromptPreset(old.id).ok, true);
});

test('旧预设读取时补入内置默认：不改入参、不改已有条目', () => {
    const old = oldPreset();
    const before = JSON.stringify(old.data);
    const completed = completeImagePromptPreset(old.data);
    assert.equal(JSON.stringify(old.data), before);
    assert.notEqual(completed, old.data);
    assert.equal(completed.taskMap.creature, 'igs-task-creature');
    const module = completed.modules.find((item) => item.task === 'creature');
    assert.equal(module.contentByFormat['sprite-data'], CREATURE_SPRITE_DATA_RULE);
    assert.equal(module.contentByFormat['expression-fragments'], CREATURE_EXPRESSION_FRAGMENTS_RULE);
    for (const item of old.data.modules) assert.deepEqual(completed.modules.find((other) => other.identifier === item.identifier), item);
    assert.equal(completeImagePromptPreset(completed), completed);
    assert.equal(validatePromptActivation(completed).ok, true);
    // 基线副本也补上，恢复默认正文才找得到
    assert.ok(completed.defaultState.baseline.modules.some((item) => item.task === 'creature'));
    assert.equal(old.data.defaultState.baseline.modules.some((item) => item.task === 'creature'), false);
});

test('补齐后非人写词用内置默认，人类任务渲染逐字不变', () => {
    const old = oldPreset(), fresh = createDefaultImagePromptPreset();
    const creature = renderImagePromptPreset(completeImagePromptPreset(old.data), 'creature', input('sprite-data'));
    assert.equal(creature.ok, true);
    assert.match(creature.request.messages.map((m) => m.content).join('\n'), /仅 outputs\.format 为 sprite-data 且角色带 dna\.creature/);
    assert.deepEqual(creature.request.messages, renderImagePromptPreset(fresh.data, 'creature', input('sprite-data')).request.messages);
    for (const [task, format] of [['sprite', 'sprite-data'], ['expression', 'expression-fragments'], ['cg', 'dna-template']]) {
        const a = renderImagePromptPreset(completeImagePromptPreset(old.data), task, input(format));
        const b = renderImagePromptPreset(old.data, task, input(format));
        assert.equal(a.ok, true);
        assert.deepEqual(a.request, b.request);
    }
    const fragments = renderImagePromptPreset(completeImagePromptPreset(old.data), 'creature', input('expression-fragments'));
    assert.match(fragments.request.messages.map((m) => m.content).join('\n'), /非人差分是整体姿态差分/);
});

test('用户改写非人条目后生效，补齐不覆盖', () => {
    const old = oldPreset();
    const own = clonePromptData(old.data);
    own.modules.push({ identifier: 'mine', task: 'creature', role: 'system', enabled: true, content: '我自己的非人规则', dataFields: ['description', 'outputs'], requiredFields: ['description', 'outputs'] });
    own.taskMap.creature = 'mine';
    const completed = completeImagePromptPreset(own);
    assert.equal(completed, own);
    const rendered = renderImagePromptPreset(completed, 'creature', input('sprite-data'));
    assert.match(rendered.request.messages.map((m) => m.content).join('\n'), /我自己的非人规则/);
    assert.doesNotMatch(rendered.request.messages.map((m) => m.content).join('\n'), /仅 outputs\.format 为 sprite-data/);
});

test('装配链：旧预设的非人写词走补齐的默认，用户改写后走改写', async () => {
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    const old = oldPreset();
    assert.equal(registry.savePromptPreset(old, null).ok, true);
    assert.equal(registry.setCurrent('prompt-preset', old.id).ok, true);
    const llm = createImagePromptLlm({}, registry, null, null);
    const prepared = await llm.prepareImagePrompt('creature', { ...input('sprite-data'), promptTask: { purpose: 'sprite' } });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.match(JSON.stringify(prepared.request.messages), /dna\.creature/);
    // 装配只读：已保存的预设没有被改写
    assert.equal(registry.getCurrent('prompt-preset').data.modules.some((module) => module.task === 'creature'), false);
    // 用户在编辑器里改写后保存，之后的装配使用改写后的文本
    const editor = createImagePromptEditor(registry);
    assert.equal(editor.initialize().ok, true);
    assert.equal(editor.state.preset.data.taskMap.creature, 'igs-task-creature');
    assert.equal(editor.edit(JSON.stringify(['modules', 'igs-task-creature', 'content']), '改写后的非人任务').ok, true);
    assert.equal(editor.save().ok, true, JSON.stringify(editor.save()));
    assert.equal(registry.getCurrent('prompt-preset').data.modules.find((module) => module.task === 'creature').content, '改写后的非人任务');
    const again = await createImagePromptLlm({}, registry, null, null).prepareImagePrompt('creature', { ...input('sprite-data'), promptTask: { purpose: 'sprite' } });
    assert.match(JSON.stringify(again.request.messages), /改写后的非人任务/);
    // 人类条目保持不变
    const saved = registry.getCurrent('prompt-preset').data.modules.filter((module) => module.task !== 'creature');
    assert.deepEqual(saved, old.data.modules);
});

test('编辑器打开旧预设：补入非人条目但不写入，保存时才写入', () => {
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    const old = oldPreset();
    assert.equal(old.id, IMAGE_PROMPT_DEFAULT_ID);
    registry.savePromptPreset(old, null);
    registry.setCurrent('prompt-preset', old.id);
    const editor = createImagePromptEditor(registry);
    editor.initialize();
    assert.equal(editor.state.dirty, false);
    assert.ok(editor.state.preset.data.modules.some((module) => module.task === 'creature'));
    assert.equal(registry.getCurrent('prompt-preset').data.modules.some((module) => module.task === 'creature'), false);
    assert.equal(editor.view().activation.ok, true);
    editor.edit(JSON.stringify(['preset', '', 'name']), '改名');
    assert.equal(editor.save().ok, true);
    assert.equal(registry.getCurrent('prompt-preset').data.modules.some((module) => module.task === 'creature'), true);
});

// ---- 端到端：半身取景与旧预设 ----
const lizard = (task, row) => [`slotid: ${row.slotId}`, `character: ${task.characters.find(c => c.token === row.tokens[0]).characterKey}`,
    'personality: wary,', 'dna_full_body: 1girl, 1.2::lizard tail::, scales, long tail,', 'dna_uc_full_body: ',
    'dna_half_body: 1girl, 1.2::lizard tail::, scales,', 'dna_uc_half_body: ', 'dna_portrait: 1girl, 1.2::lizard tail::,', 'dna_uc_portrait: ',
    'pose: arms crossed, calm,', 'pose_uc: jumping,'].join('\n');
const reply = (input) => input.promptTask.slots.map(slot => lizard(input.promptTask, slot)).join('\n---\n');
function fixture(assets, { oldPresets = false } = {}) {
    const h = builtinImageHarness({ reply });
    if (oldPresets) {
        const old = oldPreset();
        assert.equal(h.registry.savePromptPreset(old, null).ok, true);
        assert.equal(h.registry.setCurrent('prompt-preset', old.id).ok, true);
    }
    let n = 0;
    const service = createAssetGenerationService({ nai: h.backend, store: createIndexedDbGeneratedAssetStore({ indexedDB: createTransactionalIdb() }),
        llm: h.llm, messageHost: { getChatId: () => 'creature' }, getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        matte: async url => url, report: () => {}, newId: () => `c${++n}` });
    return { h, service };
}

for (const [label, framing, expectPositive, expectView] of [
    ['全身（默认）', undefined, /full body/, 'full_body'],
    ['半身', 'half', /upper body, standing/, 'half_body'],
]) test(`半人形默认立绘端到端：${label}`, async t => {
    const assets = { characters: {}, characterDna: { 蜥: { creature: { form: 'humanoid', size: 'medium', ...(framing && { framing }) } } }, scenes: {} };
    const { h, service } = fixture(assets); t.after(() => h.dispose());
    const result = await service.generateCharacterSprite({ name: '蜥', dna: assets.characterDna.蜥 });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(h.writes[0].input.promptTask.characters[0].framing, expectView);
    assert.match(h.wires[0].parameters.v4_prompt.caption.base_caption, expectPositive);
    if (framing) assert.doesNotMatch(h.wires[0].parameters.v4_prompt.caption.base_caption, /full body/);
});

test('旧预设（无非人条目）端到端：非人写词不报错，规则来自补齐的默认', async t => {
    const assets = { characters: {}, characterDna: { 蜥: { creature: { form: 'humanoid' } } }, scenes: {} };
    const { h, service } = fixture(assets, { oldPresets: true }); t.after(() => h.dispose());
    const result = await service.generateCharacterSprite({ name: '蜥', dna: assets.characterDna.蜥 });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(h.writes[0].request.messages.some(m => m.content.includes('【非人身份】')), true);
    assert.equal(h.registry.getCurrent('prompt-preset').data.modules.some(module => module.task === 'creature'), false);
});
