// 人类角色提示词基线：收集静态任务文本、纯函数拼装结果，以及内置 NAI 链路的写词请求与最终出图请求。
// 改动前取得快照固化到 fixtures/human-prompt-baseline.json，之后任何改动都必须逐字一致。
import { createAssetGenerationService } from './media-fixtures.js';
import { createIndexedDbGeneratedAssetStore } from '../../src/media/generated-asset-store.js';
import { createTransactionalIdb } from './transactional-idb.js';
import { characterViewsFixture } from './prompt-provenance.js';
import { builtinImageHarness } from './builtin-image-harness.js';

import { BUILTIN_PROMPTS, DNA_TEMPLATE_WRITER_SYSTEM, SPRITE_HALF_BODY_RULE, SCENE_DICTIONARY } from '../../src/generated-images/prompt-registry.js';
import * as spriteTasks from '../../src/generated-images/prompt-tasks/sprite.js';
import * as expressionTasks from '../../src/generated-images/prompt-tasks/expression.js';
import * as commonTasks from '../../src/generated-images/prompt-tasks/common.js';
import * as templateTasks from '../../src/generated-images/prompt-tasks/template.js';
import * as cgTasks from '../../src/generated-images/prompt-tasks/cg.js';
import * as consistencyTasks from '../../src/generated-images/prompt-tasks/consistency.js';
import * as outfitTasks from '../../src/generated-images/prompt-tasks/outfit.js';
import * as wardrobeTasks from '../../src/generated-images/prompt-tasks/wardrobe.js';
import * as avatarTasks from '../../src/generated-images/prompt-tasks/avatar.js';
import * as dnaTasks from '../../src/generated-images/prompt-tasks/dna.js';
import { SPRITE_DATA_RULE } from '../../src/generated-images/illustration/sprite-data.js';
import { DEFAULT_ASSET_TEMPLATES } from '../../src/generated-images/illustration/prompt-kit.js';
import { ASSET_PLANNER_SYSTEM_PROMPT, buildAssetPlannerUserPrompt, buildAssetSlot, describeAssetNeed } from '../../src/generated-images/illustration/asset-prompt.js';
import { composeSpritePromptParts } from '../../src/generated-images/sprite-prompt-composition.js';
import { buildCharacterSpriteDescription, buildDbgenSpriteBatchDescription, buildExpressionDiffDescription, buildDbgenAssetDescription, expressionSpritePrompts } from '../../src/generated-images/dbgen-prompt.js';
import { characterPromptTask, singleCharacterContext, savedExpressionTemplate, spriteIdentityRequirements } from '../../src/generated-images/illustration/character-prompt-task.js';
import { normalizeCharacterDna, buildCharacterDnaPromptParts, isCharacterDnaEmpty } from '../../src/scene/character-dna.js';
import { PLANNER_SYSTEM_PROMPT, CG_TEMPLATE_PLANNER_SYSTEM } from '../../src/generated-images/illustration/planner-prompt.js';

const plainTexts = (mod) => JSON.parse(JSON.stringify(mod));
const scrub = (value) => JSON.parse(JSON.stringify(value, (key, item) => (key === 'seed' && typeof item === 'number' ? '<seed>' : item)));

const HUMAN_DNA = {
    version: 2, identity: 'silver hair', triggerWords: 'alice_trigger', personality: 'composed, attentive',
    defaultAppearance: 'blue coat, white skirt', negative: 'extra fingers',
    views: characterViewsFixture('1girl, adult, 1.2::silver hair::, blue eyes,'),
};
const ENGLISH_ONLY_DNA = { identity: '1girl, silver hair, blue eyes', defaultAppearance: 'blue coat', negative: 'bad hands' };

function staticSection() {
    return scrub({
        builtin: plainTexts(BUILTIN_PROMPTS), halfBody: SPRITE_HALF_BODY_RULE, scene: plainTexts(SCENE_DICTIONARY),
        writer: DNA_TEMPLATE_WRITER_SYSTEM, spriteData: SPRITE_DATA_RULE,
        tasks: { sprite: plainTexts(spriteTasks), expression: plainTexts(expressionTasks), common: plainTexts({ ...commonTasks,
            outfitRule: commonTasks.outfitRule() }), template: plainTexts({ ...templateTasks, templateRule: templateTasks.templateRule(),
            tagDynamics: templateTasks.templateRule({ tagDynamics: true }), catalog: templateTasks.templateRule({ outfitSelection: 'catalog' }) }),
            cg: plainTexts(cgTasks), consistency: plainTexts(consistencyTasks), outfit: plainTexts(outfitTasks),
            wardrobe: plainTexts(wardrobeTasks), avatar: plainTexts(avatarTasks), dna: plainTexts(dnaTasks) },
        templates: plainTexts(DEFAULT_ASSET_TEMPLATES), assetSystem: ASSET_PLANNER_SYSTEM_PROMPT,
        planner: PLANNER_SYSTEM_PROMPT, cgPlanner: CG_TEMPLATE_PLANNER_SYSTEM,
    });
}

function pureSection() {
    const needs = [
        { type: 'sprite', name: '艾莉' },
        { type: 'sprite', name: '艾莉', outfitName: '礼服', dna: normalizeCharacterDna(ENGLISH_ONLY_DNA) },
        { type: 'sprite', name: '小林', dna: normalizeCharacterDna({ identity: '黑发少女', defaultAppearance: '校服' }) },
        { type: 'background', name: '教室', time: '夜晚', weather: '雨' },
    ];
    const slots = {};
    for (const [name, options] of Object.entries({
        plain: {}, transparent: { transparent: true }, white: { whiteBackground: true },
        custom: { templates: { sprite: '{tags}, solo, custom pose, {matte}', spriteNegative: 'custom neg' }, fixedSpritePrompts: true },
        context: { transparent: true, positiveContext: 'artist:test, transparent background' },
    })) {
        slots[name] = needs.map(need => buildAssetSlot({ need, tags: need.type === 'background' ? 'classroom' : 'smile, hand on hip', uc: 'bad' }, options));
    }
    const dnaA = normalizeCharacterDna(ENGLISH_ONLY_DNA), dnaB = normalizeCharacterDna(HUMAN_DNA);
    const context = singleCharacterContext('Alice', dnaB, { name: '礼服', prompt: 'blue dress', promptHalfBody: 'blue dress top' }, { characters: {} });
    const task = characterPromptTask(context, 'sprite', 'half_body', [['Alice']]);
    const expressionContext = singleCharacterContext('Alice', dnaB, { name: '礼服', prompt: 'blue dress', promptHalfBody: 'top' }, {});
    const derivedTask = characterPromptTask(expressionContext, 'derived', 'half_body', [['Alice']]);
    const prompts = { positive: 'p, upper body', negative: 'n, full body' };
    return scrub({
        slots, describe: needs.map((need, index) => describeAssetNeed(need, index)),
        planner: buildAssetPlannerUserPrompt({ needs, readableText: '正文', previousText: '前文', lore: [{ name: '艾莉', text: '银发' }] }),
        compose: [composeSpritePromptParts(dnaA, { expression: 'smile' }), composeSpritePromptParts(dnaB, { outfit: 'red coat' }),
            composeSpritePromptParts(normalizeCharacterDna({ identity: '黑发' }), {})],
        dnaParts: [buildCharacterDnaPromptParts(dnaA), buildCharacterDnaPromptParts(dnaB, { includeDefaultAppearance: true })],
        dnaEmpty: [isCharacterDnaEmpty({}), isCharacterDnaEmpty(dnaA)],
        dnaNormalized: [normalizeCharacterDna(HUMAN_DNA), normalizeCharacterDna(ENGLISH_ONLY_DNA), normalizeCharacterDna({}), normalizeCharacterDna(null)],
        dbgen: [buildCharacterSpriteDescription('艾莉', dnaA, {}), buildCharacterSpriteDescription('艾莉', dnaA, { nude: true, note: 'x', transparent: true }),
            buildCharacterSpriteDescription('艾莉', dnaB, { template: true, note: 'n' }), buildDbgenSpriteBatchDescription(needs.slice(0, 3), {}),
            buildDbgenSpriteBatchDescription(needs.slice(0, 3), { template: true }), buildDbgenAssetDescription(needs[1], { transparent: true }),
            buildExpressionDiffDescription('艾莉', 'p', ['微笑', '愤怒'], dnaA, { name: '礼服', prompt: 'blue' }, { note: 'n', nsfw: true }),
            buildExpressionDiffDescription('艾莉', 'p', ['微笑'], dnaB, { name: '礼服', prompt: 'blue' }, { template: true })],
        expressionPrompts: expressionSpritePrompts('a, arms at sides, b', 'neg'),
        task, derivedTask, identity: spriteIdentityRequirements(task.promptTask, task.characterContext),
        expressionTemplate: [savedExpressionTemplate(context, '平和', prompts), savedExpressionTemplate(context, '平和', prompts, { expression: { positive: 'smile', negative: 'frown' } }),
            savedExpressionTemplate(singleCharacterContext('Bob', dnaB, undefined, {}), '平和', prompts)],
    });
}

function entryFixture(options = {}) {
    const deps = options.deps || {};
    const h = builtinImageHarness(options), indexedDB = createTransactionalIdb();
    const assets = options.assets || { characters: { Alice: { 默认: 'original.png' } }, characterDna: {}, scenes: {} };
    let sequence = 0;
    const service = createAssetGenerationService({ nai: h.backend, llm: h.llm,
        store: createIndexedDbGeneratedAssetStore({ indexedDB }),
        messageHost: options.messageHost || { getChatId: () => 'baseline' },
        getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        matte: async url => url, report: () => {}, newId: () => `baseline-${++sequence}`, ...deps });
    return { ...h, assets, service };
}

const snapshotIo = (f) => scrub({ writes: f.writes.map(w => ({ system: w.request.messages.find(m => m.role === 'system')?.content,
    messages: w.request.messages.map(m => ({ role: m.role, content: m.content })), input: w.input })),
    wires: f.wires });

async function endToEnd() {
    const out = {};
    // 首次立绘：无 DNA。
    { const f = entryFixture();
        const first = await f.service.generateCharacterSprite({ name: 'Alice', dna: {} });
        out.firstSprite = { ok: first.ok, io: snapshotIo(f) }; f.dispose(); }
    // 已有 DNA：默认立绘、表情差分、NSFW 差分、独立重画。
    for (const nsfw of [false, true]) {
        const assets = { characters: { Alice: { 默认: 'original.png' } }, scenes: {}, characterDna: { Alice: HUMAN_DNA } };
        const f = entryFixture({ assets });
        const sprite = await f.service.generateCharacterSprite({ name: 'Alice', dna: HUMAN_DNA });
        const set = await f.service.generateExpressionSet({ name: 'Alice', moods: ['微笑', '平静', '愤怒'], dna: HUMAN_DNA, note: '轻微', nsfw });
        out[nsfw ? 'nsfwSet' : 'savedDna'] = { sprite: sprite.ok, set: set.ok, io: snapshotIo(f) }; f.dispose();
    }
    // 自动补全：楼层触发的批量立绘。
    { const floor = { chatId: 'baseline', messageId: 8, swipeId: 0, isAi: true, isLatest: true,
            text: `[igs-char:Bob|平静|${'你好。'.repeat(30)}]\n[igs-char:Carol|平静|${'再见。'.repeat(30)}]` };
        const f = entryFixture({ messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
            readPreviousAiTexts: () => [], readCharacterLore: async () => [], on: () => () => {} } });
        f.assets.enabled = true; f.bridge.autoIllustration.assets = { ...f.bridge.autoIllustration.assets, spriteEnabled: true, backgroundEnabled: false, maxPerFloor: 8 };
        const result = await f.service.processMessage(8, { manual: true });
        out.automatic = { ok: result.ok, count: result.count, io: snapshotIo(f) }; f.dispose(); }
    // 战斗对手同时是本楼说话的人类角色：自动建档接线后流程必须与改前一致。
    { const floor = { chatId: 'baseline', messageId: 9, swipeId: 0, isAi: true, isLatest: true,
            text: `[igs-fx:battle|黑衣剑客|拦路人]
[igs-char:黑衣剑客|平静|${'拔剑出鞘。'.repeat(30)}]` };
        const assets = { enabled: true, characters: {}, characterDna: {}, scenes: {} };
        const f = entryFixture({ assets, messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
            readPreviousAiTexts: () => [], readCharacterLore: async () => [], on: () => () => {} },
        deps: { async registerCreatureProfiles(hints) {
            try {
                const { planCreatureProfiles } = await import('../../src/scene/creature-registry.js');
                const plan = planCreatureProfiles({ effective: assets, cardDna: assets.characterDna, hints, now: 1 });
                if (plan.changed) assets.characterDna = plan.cardDna;
                return { ok: true, changed: plan.changed };
            } catch { return { ok: true, changed: false }; }
        } } });
        f.bridge.autoIllustration.assets = { ...f.bridge.autoIllustration.assets, spriteEnabled: true, backgroundEnabled: false, maxPerFloor: 8 };
        const result = await f.service.processMessage(9, { manual: true });
        out.automaticBattle = { ok: result.ok, count: result.count, dna: assets.characterDna, io: snapshotIo(f) }; f.dispose(); }
    return out;
}

export async function captureHumanBaseline() {
    return { static: staticSection(), pure: pureSection(), e2e: await endToEnd() };
}
