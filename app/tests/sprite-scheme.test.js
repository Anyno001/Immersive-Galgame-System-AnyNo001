import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createPresetRegistry } from '../src/presets/preset-registry.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { validatePromptActivation } from '../src/presets/prompt-preset.js';
import {
    createDefaultImagePromptPreset, createLivelyImagePromptPreset, createBuiltinImagePromptPresets,
    createBuiltinImagePromptPresetFor, IMAGE_PROMPT_DEFAULT_ID, IMAGE_PROMPT_LIVELY_ID,
    IMAGE_PROMPT_DEFAULT_VERSION, IMAGE_PROMPT_DEFAULT_NAME,
} from '../src/generated-images/image-prompt-defaults.js';
import {
    spriteSchemeOf, schemePrompts, performanceLines, performanceTags, expressionFragmentDescription,
    LIVELY_TASK_TEXT, LIVELY_DNA_TEMPLATE_WRITER_SYSTEM, swap,
} from '../src/generated-images/prompt-scheme.js';
import { DNA_TEMPLATE_WRITER_SYSTEM } from '../src/generated-images/prompt-registry.js';
import {
    buildCharacterSpriteDescription, buildDbgenSpriteBatchDescription, buildDbgenAssetDescription,
    buildExpressionDiffDescription, expressionSpritePrompts, uprightSpriteCaption,
} from '../src/generated-images/dbgen-prompt.js';
import { buildAssetSlot } from '../src/generated-images/illustration/asset-prompt.js';
import { DEFAULT_ASSET_TEMPLATES } from '../src/generated-images/illustration/prompt-kit.js';
import { standardSnapshot } from './helpers/standard-prompt-snapshot.js';
import { spriteExpressionTags, composeSpriteCaption } from '../src/generated-images/sprite-prompt-composition.js';

const here = dirname(fileURLToPath(import.meta.url));
const TYPE = 'prompt-preset';
const LEGACY_NAME = 'IGS 内置生图框架';
const lively = (performance) => spriteSchemeOf({ spriteScheme: 'lively', performance });
const modules = (preset) => Object.fromEntries(preset.data.modules.map(m => [m.task, m]));
const allText = (preset) => JSON.stringify([preset.data.prompts, preset.data.modules]);

test('标准预设各块文字与改动前逐字一致，只改显示名与版本', async () => {
    const expected = JSON.parse(readFileSync(resolve(here, 'fixtures/standard-prompt-snapshot.json'), 'utf8'));
    assert.deepEqual(await standardSnapshot(resolve(here, '../src')), expected);
    const standard = createDefaultImagePromptPreset();
    assert.equal(standard.name, IMAGE_PROMPT_DEFAULT_NAME);
    assert.equal(standard.version, IMAGE_PROMPT_DEFAULT_VERSION);
    assert.equal(standard.data.spriteScheme, undefined);
    assert.equal(spriteSchemeOf(standard.data).id, 'standard');
});

test('灵动预设：合法、带方案与档位字段、含草稿关键句且不含被替换的原句', () => {
    const preset = createLivelyImagePromptPreset(), standard = createDefaultImagePromptPreset();
    assert.equal(preset.id, IMAGE_PROMPT_LIVELY_ID);
    assert.equal(preset.name, 'IGS内置方案·灵动');
    assert.equal(preset.data.spriteScheme, 'lively');
    assert.equal(preset.data.performance, 'subtle');
    assert.equal(validatePromptActivation(preset.data).ok, true);
    assert.deepEqual(preset.data.variables, ['任务提示词', '任务资料', '世界书']);
    // 基线带方案字段，「恢复默认框架」按基线恢复仍是灵动
    assert.equal(preset.data.defaultState.baseline.spriteScheme, 'lively');
    assert.equal(preset.data.defaultState.baseline.performance, 'subtle');
    const text = allText(preset), old = allText(standard);
    for (const key of ['不画小腿以下与鞋袜', 'cowboy shot', 'knee-length dress', '可配一个自然的手势，不遮挡或不完全遮挡面部', 'one hand raised to chest',
        '符合性格的站姿手势与平和表情', '符合性格的站姿手势和平和表情', '未设定体格时按柔和美型', '各张表情差分保持相同站位',
        '唇形、唇色与妆容只在角色资料明确写出时保留', 'outfit_half_body 用于膝上取景'])
        assert.ok(text.includes(key), key);
    // 被删掉的原句不再出现，且不靠追加反向规则对冲
    for (const key of ['正常上半身取景', ', slim, narrow waist', 'thick eyebrows, broad shoulders, muscular male', '不默认人人窄肩', '不写身体姿势、手势、道具',
        '接默认站姿与平和表情', '保持默认站姿和平和表情', '只有画外裙长和鞋袜被删除', '纤细体态'])
        assert.ok(!text.includes(key) && old.includes(key) || key === '纤细体态' && !text.includes(key), key);
    for (const key of ['男性角色默认神态', '女性肩', 'stubble', 'thick lips', 'wasp waist', 'straight eyebrows', '演绎档位', '不遮挡面部', '不遮挡眼睛'])
        assert.ok(!text.includes(key), key);
    // 没有换到的任务与标准逐字相同
    for (const task of ['avatar', 'wardrobe', 'item', 'consistency', 'creature'])
        assert.deepEqual(modules(preset)[task], modules(standard)[task], task);
    // 输出字段名必须保留
    const spriteData = LIVELY_TASK_TEXT.sprite['sprite-data'];
    for (const key of ['slotid:', 'outfit_name', 'outfit_half_body', 'dna_full_body', 'dna_uc_'])
        assert.ok(spriteData.includes(key), key);
    // 场合规则不含任务槽变量
    for (const mod of preset.data.modules) for (const body of Object.values(mod.contentByFormat || {}))
        assert.doesNotMatch(body, /\{\{\s*(?:任务提示词|任务资料)\s*\}\}/);
});

test('按句替换找不到原句即抛错，不静默失效', () => {
    assert.throws(() => swap('甲乙丙', '丁', '戊'), /替换失败/);
    assert.throws(() => swap('甲甲', '甲', '乙'), /替换失败/);
    assert.equal(swap('甲甲', '甲', '乙', 2), '乙乙');
    assert.ok(LIVELY_DNA_TEMPLATE_WRITER_SYSTEM.includes('上述三景别无画外体型标签需删除'));
    assert.doesNotMatch(LIVELY_DNA_TEMPLATE_WRITER_SYSTEM, /narrow shoulders|slim/);
    assert.ok(!LIVELY_DNA_TEMPLATE_WRITER_SYSTEM.includes('tall, long legs'));
    assert.ok(DNA_TEMPLATE_WRITER_SYSTEM.includes('tall, long legs'));
});

function seedOldStandard(registry, { name = LEGACY_NAME } = {}) {
    const old = createDefaultImagePromptPreset();
    old.name = name; old.version = 35;
    old.data.defaultVersion = 35;
    old.data.defaultState.version = 35;
    old.data.defaultState.baseline.defaultVersion = 35;
    assert.equal(registry.savePromptPreset(old, null).ok, true);
    assert.equal(registry.setCurrent(TYPE, old.id).ok, true);
}

test('升级：老用户 current=标准时补入灵动且 current 不变，旧默认名改新名', () => {
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    seedOldStandard(registry);
    const result = registry.ensureImagePromptDefault(createBuiltinImagePromptPresets());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(registry.getCurrent(TYPE).id, IMAGE_PROMPT_DEFAULT_ID);
    assert.equal(registry.getCurrent(TYPE).name, IMAGE_PROMPT_DEFAULT_NAME);
    assert.equal(registry.getCurrent(TYPE).data.defaultVersion, IMAGE_PROMPT_DEFAULT_VERSION);
    const added = registry.get(TYPE, IMAGE_PROMPT_LIVELY_ID);
    assert.equal(added.data.spriteScheme, 'lively');
    assert.equal(added.data.performance, 'subtle');
    // 再次确保不再变化
    assert.equal(registry.ensureImagePromptDefault(createBuiltinImagePromptPresets()).changed, false);
});

test('升级：用户改过的名字不动，用户改过的灵动方案档位不被覆盖', () => {
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    seedOldStandard(registry, { name: '我的方案' });
    assert.equal(registry.ensureImagePromptDefault(createBuiltinImagePromptPresets()).ok, true);
    assert.equal(registry.getCurrent(TYPE).name, '我的方案');
    // 当前是灵动：按灵动自己的版本升级，档位保留
    const preset = registry.get(TYPE, IMAGE_PROMPT_LIVELY_ID);
    preset.data.performance = 'expressive';
    assert.equal(registry.savePromptPreset(preset, preset.data.revision).ok, true);
    assert.equal(registry.activateImagePromptPreset(IMAGE_PROMPT_LIVELY_ID).ok, true);
    const next = createBuiltinImagePromptPresets();
    next[1].data.defaultVersion += 1;
    next[1].data.modules.find(m => m.task === 'avatar').content = '新版头像规则';
    const upgraded = registry.ensureImagePromptDefault(next);
    assert.equal(upgraded.ok, true, JSON.stringify(upgraded));
    assert.equal(upgraded.presetId, IMAGE_PROMPT_LIVELY_ID);
    const saved = registry.getCurrent(TYPE);
    assert.equal(saved.id, IMAGE_PROMPT_LIVELY_ID);
    assert.equal(saved.data.performance, 'expressive');
    assert.equal(saved.data.spriteScheme, 'lively');
    assert.equal(saved.data.modules.find(m => m.task === 'avatar').content, '新版头像规则');
});

test('升级：全新存储默认选中标准，灵动只登记进列表', () => {
    const storage = createMemoryStorage();
    const registry = createPresetRegistry({ storage });
    assert.equal(registry.ensureImagePromptDefault(createBuiltinImagePromptPresets()).ok, true);
    assert.equal(registry.getCurrent(TYPE).id, IMAGE_PROMPT_DEFAULT_ID);
    const reloaded = createPresetRegistry({ storage });
    assert.equal(reloaded.get(TYPE, IMAGE_PROMPT_LIVELY_ID).data.spriteScheme, 'lively');
    // 单个预设的旧调用方式仍可用
    const single = createPresetRegistry({ storage: createMemoryStorage() });
    assert.equal(single.ensureImagePromptDefault(createDefaultImagePromptPreset()).ok, true);
    assert.equal(single.get(TYPE, IMAGE_PROMPT_LIVELY_ID), null);
});

test('恢复默认：内置灵动按基线恢复，复制出的灵动组按方案取内置默认', () => {
    assert.equal(createBuiltinImagePromptPresetFor({ spriteScheme: 'lively' }).id, IMAGE_PROMPT_LIVELY_ID);
    assert.equal(createBuiltinImagePromptPresetFor({ spriteScheme: 'lively', performance: 'expressive' }).data.spriteScheme, 'lively');
    assert.equal(createBuiltinImagePromptPresetFor({}).id, IMAGE_PROMPT_DEFAULT_ID);
    assert.equal(createBuiltinImagePromptPresetFor(undefined).id, IMAGE_PROMPT_DEFAULT_ID);
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    registry.ensureImagePromptDefault(createBuiltinImagePromptPresets());
    const copy = registry.get(TYPE, IMAGE_PROMPT_LIVELY_ID);
    const baseline = copy.data.defaultState.baseline;
    assert.equal(baseline.spriteScheme, 'lively');
    assert.equal(baseline.performance, 'subtle');
    assert.deepEqual(baseline.modules, createLivelyImagePromptPreset().data.modules);
});

test('取景与朝向句按方案取：标准为原句，灵动为膝上版', () => {
    const std = schemePrompts(spriteSchemeOf({})), liv = schemePrompts(lively());
    assert.match(std.framing, /头顶至腰胯/);
    assert.match(std.facing, /正对镜头，身体竖直/);
    assert.match(liv.framing, /膝盖附近/);
    assert.doesNotMatch(liv.framing, /腰胯|upper body/);
    assert.equal(liv.facing, '人物面向镜头，镜头与视线齐平。');
    assert.equal(liv.uprightLine, '面向镜头，平视，不使用倾斜构图与侧脸。');
    assert.equal(liv.poseRule, '按角色性格设计一个自然的手势，不遮挡或不完全遮挡面部。');
    assert.match(liv.expression.designRule, /一个不遮挡或不完全遮挡面部的自然手势/);
    assert.doesNotMatch(liv.expression.designRule, /正面朝向|轻微动作/);
    const dna = { identity: '1girl, black hair' }, outfit = { name: '裙', prompt: 'blue skirt' };
    const sprite = (scheme) => buildCharacterSpriteDescription('甲', dna, { scheme });
    assert.match(sprite(undefined), /头顶至腰胯/);
    assert.match(sprite(lively()), /膝盖附近/);
    assert.doesNotMatch(sprite(lively()), /正对镜头，身体竖直/);
    const batch = (scheme, template) => buildDbgenSpriteBatchDescription([{ name: '甲' }], { scheme, template });
    assert.match(batch(undefined), /头顶至腰胯/);
    assert.match(batch(lively()), /膝盖附近/);
    assert.match(batch(lively(), true), /膝上取景/);
    assert.match(buildDbgenAssetDescription({ type: 'sprite', name: '甲' }, { scheme: lively() }), /膝盖附近/);
    const expr = (scheme, extra = {}) => buildExpressionDiffDescription('甲', null, ['开心'], dna, outfit, { scheme, ...extra });
    assert.match(expr(undefined), /朝向正面，直立，平视，不使用侧身或倾斜构图。/);
    assert.match(expr(lively()), /面向镜头，平视，不使用倾斜构图与侧脸。/);
    assert.doesNotMatch(expr(lively()), /朝向正面，直立/);
    assert.match(expr(lively(), { template: true }), /膝上取景/);
    assert.match(expr(lively(), { includeDna: false }), /膝盖附近/);
});

test('旧组合路径的表情正负词与立绘模板默认值按方案取，用户改过的模板不覆盖', () => {
    const caption = { v4_prompt: { caption: { base_caption: 'solo', char_captions: [{ char_caption: 'smile', centers: [] }] } },
        v4_negative_prompt: { caption: { base_caption: 'text', char_captions: [{ char_caption: 'blur' }] } } };
    const std = JSON.stringify(uprightSpriteCaption(caption)), liv = JSON.stringify(uprightSpriteCaption(caption, lively()));
    assert.match(std, /upper body, standing, facing viewer, straight-on/);
    assert.match(liv, /cowboy shot, standing, facing viewer/);
    assert.match(liv, /upper body, full body, feet, shoes/);
    assert.doesNotMatch(liv, /cropped hands/);
    assert.doesNotMatch(liv, /straight-on/);
    assert.equal(expressionSpritePrompts('a, arms at sides', 'n', lively()).positive, 'a');
    const item = { need: { type: 'sprite', name: '甲' }, tags: '', uc: '' };
    const base = buildAssetSlot(item, { transparent: true, templates: { ...DEFAULT_ASSET_TEMPLATES } });
    const livelySlot = buildAssetSlot(item, { transparent: true, templates: { ...DEFAULT_ASSET_TEMPLATES }, scheme: lively() });
    assert.match(base.scene, /upper body, standing, facing viewer, looking at viewer, straight-on, centered/);
    assert.match(livelySlot.scene, /solo, cowboy shot, standing, facing viewer, looking at viewer, centered/);
    assert.doesNotMatch(livelySlot.scene, /straight-on/);
    assert.match(livelySlot.sceneUc, /portrait, upper body, full body, feet, shoes, head out of frame, cropped arms, arms at sides, 1\.2::scenery/);
    assert.doesNotMatch(livelySlot.sceneUc, /cropped hands/);
    // 用户自定义的立绘模板不被灵动覆盖
    const custom = buildAssetSlot(item, { transparent: true, scheme: lively(), templates: { sprite: '{tags}, my own, {matte}', spriteNegative: 'my negative' } });
    assert.match(custom.scene, /my own/);
    assert.doesNotMatch(custom.scene, /cowboy shot/);
    assert.match(custom.sceneUc, /^my negative/);
});

test('演绎档位只在灵动生效：现实与夸张各插入自己的规则句与正负追加词', () => {
    const std = spriteSchemeOf({ performance: 'expressive' });
    assert.deepEqual(performanceLines(std), []);
    assert.deepEqual(performanceTags(std), { positive: '', negative: '' });
    assert.equal(lively().performance, 'subtle');
    assert.equal(spriteSchemeOf({ spriteScheme: 'lively', performance: '乱写' }).performance, 'subtle');
    assert.deepEqual(performanceTags(lively('subtle')), { positive: 'subtle expression', negative: '' });
    assert.deepEqual(performanceTags(lively('expressive')), { positive: 'expressive', negative: 'chibi' });
    const item = { need: { type: 'sprite', name: '甲' }, tags: '', uc: '' };
    for (const [level, pos, neg] of [['subtle', 'subtle expression', ''], ['expressive', 'expressive', 'chibi']]) {
        const slot = buildAssetSlot(item, { transparent: true, scheme: lively(level) });
        assert.ok(slot.scene.includes(pos), level);
        assert.ok(slot.sceneUc.includes(neg), level);
    }
    assert.doesNotMatch(buildAssetSlot(item, { transparent: true }).scene, /subtle expression|dynamic pose/);
    const desc = (level) => buildCharacterSpriteDescription('甲', null, { scheme: lively(level) });
    assert.match(desc('subtle'), /演绎档位为现实/);
    assert.doesNotMatch(desc('subtle'), /演绎档位为夸张/);
    assert.match(desc('expressive'), /演绎档位为夸张/);
    assert.match(buildExpressionDiffDescription('甲', null, ['开心'], null, null, { template: true, scheme: lively('expressive') }), /动画电影的方式放大/);
    assert.doesNotMatch(desc('expressive'), /情绪参考/);
    assert.doesNotMatch(buildCharacterSpriteDescription('甲', null, {}), /演绎档位/);
});

test('差分写词描述：标准逐字原句，灵动允许写一个手势并带档位', () => {
    const original = '只编写以下表情的可见面部变化，不写身份、服装、身体姿势、道具或场景。按编号逐项输出：1. 开心；2. 惊讶。表情要求：备注';
    assert.equal(expressionFragmentDescription(['开心', '惊讶'], '备注', spriteSchemeOf({})), original);
    const text = expressionFragmentDescription(['开心'], '', lively('expressive'));
    assert.match(text, /可见面部变化与一个配合的手势/);
    assert.doesNotMatch(text, /不写身份、服装、身体姿势/);
    assert.match(text, /演绎档位为夸张/);
});

// ---- 端到端：当前预设的方案一路传到写词描述与出图词 ----
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';

async function spriteRun(t, { current, performance } = {}) {
    const h = builtinImageHarness(); t.after(() => h.dispose());
    assert.equal(h.registry.ensureImagePromptDefault(createBuiltinImagePromptPresets()).ok, true);
    if (current) {
        if (performance) {
            const copy = h.registry.get(TYPE, current);
            copy.data.performance = performance;
            assert.equal(h.registry.savePromptPreset(copy, copy.data.revision).ok, true);
        }
        assert.equal(h.registry.activateImagePromptPreset(current).ok, true);
    }
    const assets = { characters: {}, characterDna: {}, scenes: {} };
    let n = 0;
    const service = createAssetGenerationService({ nai: h.backend, store: createIndexedDbGeneratedAssetStore({ indexedDB: createTransactionalIdb() }),
        llm: h.llm, messageHost: { getChatId: () => 'scheme' }, getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        matte: async url => url, report: () => {}, newId: () => `s${++n}` });
    const result = await service.generateCharacterSprite({ name: '艾', dna: { identity: '1girl, black hair' } });
    assert.equal(result.ok, true, JSON.stringify(result));
    return { write: h.writes[0], wire: h.wires[0].parameters.v4_prompt.caption.base_caption,
        negative: h.wires[0].parameters.v4_negative_prompt.caption.base_caption };
}

test('端到端：选标准时写词与出图词是原句，选灵动时换成膝上版并带档位', async t => {
    const std = await spriteRun(t);
    const text = (run) => JSON.stringify([run.write.request.messages, run.write.input.description]);
    assert.match(text(std), /头顶至腰胯/);
    assert.match(std.wire, /upper body/);
    assert.doesNotMatch(std.wire + std.negative, /subtle expression|cropped hands/);
    const live = await spriteRun(t, { current: IMAGE_PROMPT_LIVELY_ID });
    assert.match(text(live), /膝盖附近/);
    assert.match(text(live), /演绎档位为现实/);
    assert.match(text(live), /不画小腿以下与鞋袜/);
    assert.match(live.wire, /cowboy shot/);
    assert.match(live.wire, /subtle expression/);
    assert.doesNotMatch(live.wire, /upper body|straight-on/);
    assert.match(live.negative, /arms at sides/);
    assert.doesNotMatch(live.negative, /cropped hands/);
    const big = await spriteRun(t, { current: IMAGE_PROMPT_LIVELY_ID, performance: 'expressive' });
    assert.match(text(big), /演绎档位为夸张/);
    assert.match(big.wire, /expressive/);
    assert.match(big.negative, /chibi/);
});

test('灵动保留写词给的手势与上身动作，仍滤掉衣装、道具、背景；标准照旧', () => {
    const tags = 'smile, finger scratching cheek, hands clasped to chest, leaning forward, arms crossed, white shirt, holding sword, shoulder bag, classroom, blue background';
    assert.equal(spriteExpressionTags(tags), 'smile, arms crossed');
    assert.equal(spriteExpressionTags(tags, spriteSchemeOf({})), 'smile, arms crossed');
    assert.equal(spriteExpressionTags(tags, lively()), 'smile, finger scratching cheek, hands clasped to chest, leaning forward, arms crossed');
    const item = { need: { type: 'sprite', name: '甲', dna: { identity: '1girl, black hair' } }, tags: 'finger scratching cheek, white shirt', uc: '' };
    assert.doesNotMatch(buildAssetSlot(item, { transparent: true }).scene, /scratching/);
    const slot = buildAssetSlot(item, { transparent: true, scheme: lively() }).scene;
    assert.match(slot, /finger scratching cheek/);
    assert.doesNotMatch(slot, /white shirt/);
    const caption = { v4_prompt: { caption: { base_caption: 'solo', char_captions: [{ char_caption: 'hands clasped to chest, white shirt', centers: [] }] } },
        v4_negative_prompt: { caption: { base_caption: '', char_captions: [{ char_caption: '' }] } } };
    const dna = { identity: '1girl, black hair' };
    assert.doesNotMatch(JSON.stringify(composeSpriteCaption(caption, dna)), /clasped/);
    assert.match(JSON.stringify(composeSpriteCaption(caption, dna, { scheme: lively() })), /hands clasped to chest/);
});

test('灵动范例不给体型示范，女性不强调窄肩', () => {
    const text = JSON.stringify(LIVELY_TASK_TEXT);
    assert.match(LIVELY_TASK_TEXT.sprite['sprite-data'], /小珍珠耳钉，性格沉静细心/);
    assert.doesNotMatch(text, /纤细体态|narrow shoulders|窄肩|女性肩部较窄|slim, narrow waist/);
    assert.doesNotMatch(text, /muscular male|dna_uc_\* 写该景别/);
});

// ---- 设置器：演绎档位开关与恢复默认 ----
import { createImagePromptEditor } from '../src/visual/igs-ui/settings-image-prompt-editor.js';
import { renderImagePromptPanel } from '../src/visual/igs-ui/settings-image-prompt-view.js';
import { handleImagePromptAction } from '../src/visual/igs-ui/settings-image-prompt-actions.js';

test('设置器：演绎档位只在灵动预设出现，点击写入预设并自动保存，恢复默认与复制都保持灵动', async () => {
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    const editor = createImagePromptEditor(registry);
    assert.equal(editor.initialize().ok, true);
    const run = (action) => handleImagePromptAction(action, { editor, dialogs: {}, isCurrent: () => true, global: {} });
    assert.doesNotMatch(renderImagePromptPanel(editor), /演绎/);
    assert.equal((await run('image-prompt:performance:expressive')).ok, false);
    assert.equal(editor.select(IMAGE_PROMPT_LIVELY_ID).ok, true);
    const html = renderImagePromptPanel(editor);
    assert.match(html, /演绎/);
    assert.ok(html.indexOf('image-prompt:performance:subtle') < html.indexOf('image-prompt:performance:expressive'));
    assert.match(html, /is-active" data-action="image-prompt:performance:subtle"/);
    assert.equal((await run('image-prompt:performance:乱写')).ok, false);
    assert.equal((await run('image-prompt:performance:expressive')).ok, true);
    assert.equal(registry.get(TYPE, IMAGE_PROMPT_LIVELY_ID).data.performance, 'expressive');
    assert.match(renderImagePromptPanel(editor), /is-active" data-action="image-prompt:performance:expressive"/);
    // 恢复默认框架：仍是灵动，档位保持用户选择
    assert.equal(editor.restoreFramework().ok, true);
    let saved = registry.get(TYPE, IMAGE_PROMPT_LIVELY_ID).data;
    assert.equal(saved.spriteScheme, 'lively');
    assert.equal(saved.performance, 'expressive');
    // 复制组没有基线：恢复默认也回到灵动而不是标准
    assert.equal(editor.create('lively-copy', '灵动副本', true).ok, true);
    saved = registry.get(TYPE, 'lively-copy').data;
    assert.equal(saved.spriteScheme, 'lively');
    assert.equal(saved.performance, 'expressive');
    assert.equal(editor.restoreFramework().ok, true);
    saved = registry.get(TYPE, 'lively-copy').data;
    assert.equal(saved.spriteScheme, 'lively');
    assert.equal(saved.performance, 'expressive');
    assert.equal(modules(registry.get(TYPE, 'lively-copy')).sprite.contentByFormat['sprite-data'], LIVELY_TASK_TEXT.sprite['sprite-data']);
    // 初始化后灵动已登记在列表里
    assert.ok(registry.peekImagePromptIndex().items.some(item => item.id === IMAGE_PROMPT_LIVELY_ID));
});

test('灵动手势过滤只放行带动作的写法，外貌与衣装词不放行', () => {
    const kept = 'finger scratching cheek, hands clasped to chest, leaning forward, arms crossed, hand on own cheek, one hand raised to chest, shoulders raised, head down, hand holding own arm';
    assert.equal(spriteExpressionTags(kept, lively()), kept);
    const rejected = 'shoulder-length hair, bare shoulders, broad shoulders, bare arms, arm tattoo, hands, muscular arms, short sleeves, holding sword';
    assert.equal(spriteExpressionTags(rejected, lively()), '');
});

test('灵动范例不给体型示范：cg、sprite、registry 范例都不含体型词', () => {
    // 唯一例外是身份规则里的柔和美型默认：未设体格的男性默认画成宽肩，给 slim, bishounen 锚点。
    const raw = JSON.stringify(LIVELY_TASK_TEXT) + LIVELY_DNA_TEMPLATE_WRITER_SYSTEM;
    assert.match(raw, /未设定体格时按柔和美型：男性写 slim, bishounen，女性写 slim。/);
    const text = raw.split('未设定体格时按柔和美型：男性写 slim, bishounen，女性写 slim。').join('');
    assert.doesNotMatch(text, /\bslim\b|narrow waist|wasp waist|tall, long legs|long legs|narrow shoulders|窄肩|muscular male|broad shoulders/);
    assert.doesNotMatch(LIVELY_TASK_TEXT.cg['dna-template'], /slim|thick eyebrows/);
    assert.match(LIVELY_TASK_TEXT.cg['dna-template'], /light skin\nmeta_signature/);
    assert.doesNotMatch(LIVELY_TASK_TEXT.sprite['sprite-data'], /和 slim/);
});

test('升级：未被选中的标准预设仍是旧默认名时只改名，不动内容与版本', () => {
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    seedOldStandard(registry);
    const [, livelyPreset] = createBuiltinImagePromptPresets();
    assert.equal(registry.savePromptPreset(livelyPreset, null).ok, true);
    assert.equal(registry.setCurrent(TYPE, IMAGE_PROMPT_LIVELY_ID).ok, true);
    const before = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID);
    assert.equal(registry.ensureImagePromptDefault(createBuiltinImagePromptPresets()).ok, true);
    const after = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID);
    assert.equal(registry.getCurrent(TYPE).id, IMAGE_PROMPT_LIVELY_ID);
    assert.equal(after.name, IMAGE_PROMPT_DEFAULT_NAME);
    assert.deepEqual({ ...after.data, revision: 0 }, { ...before.data, revision: 0 });
    assert.equal(after.data.defaultVersion, 35);
    // 用户改过名的不动
    const other = createPresetRegistry({ storage: createMemoryStorage() });
    seedOldStandard(other, { name: '我的方案' });
    other.savePromptPreset(livelyPreset, null); other.setCurrent(TYPE, IMAGE_PROMPT_LIVELY_ID);
    other.ensureImagePromptDefault(createBuiltinImagePromptPresets());
    assert.equal(other.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).name, '我的方案');
});

import { spriteDataReply } from './helpers/prompt-provenance.js';

// 新角色默认立绘：灵动用写词的 pose 替换默认平和词、性格不进画图词、旧版模板的垂手与正面词不进正面。
async function newSpriteWire(t, { lively: live }) {
    const h = builtinImageHarness({ reply: input => spriteDataReply(input, { outfitDescription: 'white shirt, black trousers',
        personality: 'assertive, charismatic' }) + (live ? '\npose: light smile, hand on own hip' : '') });
    t.after(() => h.dispose());
    h.bridge.autoIllustration.assets.templates = {
        sprite: '{tags}, solo, cowboy shot, standing,  facing viewer, looking at viewer, straight-on, arms at sides, centered, {matte}' };
    h.registry.ensureImagePromptDefault(createBuiltinImagePromptPresets());
    if (live) h.registry.activateImagePromptPreset(IMAGE_PROMPT_LIVELY_ID);
    const assets = { characters: {}, characterDna: {}, scenes: {} };
    let n = 0;
    const service = createAssetGenerationService({ nai: h.backend, store: createIndexedDbGeneratedAssetStore({ indexedDB: createTransactionalIdb() }),
        llm: h.llm, messageHost: { getChatId: () => 'scheme' }, getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        matte: async url => url, report: () => {}, newId: () => `s${++n}` });
    const result = await service.generateCharacterSprite({ name: '艾' });
    assert.equal(result.ok, true, JSON.stringify(result));
    return { text: JSON.stringify(h.writes[0].request.messages), caption: h.wires[0].parameters.v4_prompt.caption };
}

test('新角色默认立绘：灵动用 pose 作手势、不带性格、旧模板垂手不进正面；标准照旧', async t => {
    const live = await newSpriteWire(t, { lively: true });
    assert.match(live.text, /pose 用英文 TAG 写平和表情与一个符合性格的自然手势/);
    const char = live.caption.char_captions[0].char_caption;
    assert.match(char, /, white shirt, black trousers, light smile, hand on own hip$/);
    assert.doesNotMatch(char, /assertive|calm, relaxed/);
    assert.doesNotMatch(live.caption.base_caption, /arms at sides|straight-on/);
    const std = await newSpriteWire(t, { lively: false });
    assert.match(std.caption.char_captions[0].char_caption, /, assertive, charismatic, white shirt, black trousers, calm, relaxed, closed mouth$/);
    assert.doesNotMatch(std.caption.base_caption, /arms at sides/);
});
