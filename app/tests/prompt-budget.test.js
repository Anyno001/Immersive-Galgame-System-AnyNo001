import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { buildTagGrammar, collectGrammarBlocks, DEPTH0_REMINDER, normalizePromptPlacement } from '../src/visual/igs-ui/tag-grammar.js';
import { ADAPTIVE_PROMPT_BLOCKS, DAILY_TRIGGER_WORDS, detectPromptTriggers, estimatePromptTokens } from '../src/scene/prompt-triggers.js';
import { DAILY_FX_KINDS } from '../src/scene/daily-fx-directives.js';
import { applyFxWorldview } from '../src/scene/fx-era.js';
import { buildCompactMoodGroupsText, capVocabItems, DEFAULT_MOOD_GROUPS, resolveMoodGroup } from '../src/scene/mood-groups.js';
import { buildScopedOutfitGroupsText, NO_OUTFIT_GROUPS_TEXT } from '../src/scene/character-outfits.js';
import { DEFAULT_SCENE_PROMPT_RULE, LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3 } from '../src/visual/igs-ui/reader-host-constants.js';
import { resolveChatShowPromptRule } from '../src/visual/igs-ui/chat-show-runtime.js';
import { resolveFxPromptRule, resolveItemFxPromptRule } from '../src/visual/igs-ui/fx-prompt.js';
import { resolveTextFxPromptRule } from '../src/visual/igs-ui/text-fx.js';

const MAIN = 'igs-scene-assets-format-rule';
const DEPTH0 = 'igs-scene-assets-depth0';

const ALL_ON = Object.freeze({
    textFx: { enabled: true },
    fxTags: { enabled: true, call: true, notify: true, flashback: true, dream: true, letterbox: true, sfx: true, eye: true },
    itemFx: { enabled: true },
    chatShow: { enabled: true },
    dailyFx: { enabled: true, ...Object.fromEntries(DAILY_FX_KINDS.map((kind) => [kind, true])) },
    battleFx: { enabled: true },
    romanceFx: { enabled: true, rival: true, confess: true, memories: true },
    camera: { enabled: true },
    liveFx: { enabled: true },
    feedFx: { enabled: true },
});

const len = (text) => Array.from(String(text || '')).length;

function sceneRuleWithMoods() {
    return DEFAULT_SCENE_PROMPT_RULE
        .replace('{{mood_groups}}', buildCompactMoodGroupsText(DEFAULT_MOOD_GROUPS))
        .replace('{{outfit_groups}}', NO_OUTFIT_GROUPS_TEXT)
        .replace(/\{\{(time|weather|scene)_groups\}\}\n?/g, '');
}

test('gate:prompt-budget:all-on-fixed-part-stays-under-3000-chars-with-one-shared-header', () => {
    const { system, depth0 } = buildTagGrammar({ readerSettings: ALL_ON, sceneRule: sceneRuleWithMoods() });
    assert.equal(depth0, '');
    assert.equal(system.split('[igs标签语法]').length - 1, 1);
    assert.equal(system.split('通用规则：').length - 1, 1);
    assert.doesNotMatch(system, /语法要求：/);
    assert.match(system, /新衣服示例：去宴会，上面没有能对上的说明/);
    assert.match(system, /去宴会，没有能对上的衣服，新起短名/);
    // 按需块只列索引行，不出现完整说明。
    assert.match(system, /【按需】.*线上聊天/);
    assert.doesNotMatch(system, /【线上聊天】/);
    assert.match(system, /效果只有以下9种/);
    assert.ok(len(system) <= 3000, `system ${len(system)} 字 / ${estimatePromptTokens(system)} token`);
});

// 阈值 = 2026-10-05 全开实测（单块最大 daily 983 字、全展开 2414 字）+ 约 15% 余量。
// ALL_ON 把各世界观的专属日常同时打开，实际不会出现；10-07 加载具洗浴后这个全集 daily 为 1201 字，单独给 1380，
// 真实上限由下一条按世界观逐个量（10-07 最多 842 字）。
const DAILY_SUPERSET_MAX = 1380;
test('gate:prompt-budget:adaptive-blocks-stay-within-measured-budget', () => {
    const sceneRule = sceneRuleWithMoods();
    const sizes = Object.fromEntries(ADAPTIVE_PROMPT_BLOCKS.map((key) => [key, len(buildTagGrammar({ readerSettings: ALL_ON, sceneRule, expand: new Set([key]) }).depth0)]));
    const report = JSON.stringify(sizes);
    for (const [key, size] of Object.entries(sizes)) assert.ok(size <= (key === 'daily' ? DAILY_SUPERSET_MAX : 1150), `${key} 单块超预算 ${report}`);
    const all = buildTagGrammar({ readerSettings: ALL_ON, sceneRule, expand: new Set(ADAPTIVE_PROMPT_BLOCKS) });
    // 10-10 加手机社区后全展开 3053 字。社区示例改成三条帖的完整正文后，未点名平台时单块 655 字，全展开 3415 字。
    assert.ok(len(all.depth0) <= 3600,`全展开 ${len(all.depth0)} 字 / ${estimatePromptTokens(all.depth0)} token ${report}`);
});

test('gate:prompt-budget:daily-block-per-worldview-stays-under-1150', () => {
    const sceneRule = sceneRuleWithMoods();
    for (const worldview of ['modern', 'ancient', 'fantasy', 'scifi', 'apocalypse', 'taisho', 'magic', 'horror']) {
        const readerSettings = applyFxWorldview(ALL_ON, worldview);
        const size = len(buildTagGrammar({ readerSettings, sceneRule, expand: new Set(['daily']) }).depth0);
        assert.ok(size <= 1150, `${worldview} daily ${size} 字`);
    }
});

test('gate:prompt-budget:every-adaptive-block-has-a-trigger-route', () => {
    const adaptive = collectGrammarBlocks(ALL_ON).filter((b) => b.adaptive).map((b) => b.key).sort();
    assert.deepEqual(adaptive, [...ADAPTIVE_PROMPT_BLOCKS].sort());
    assert.ok(detectPromptTriggers({ userText: '镜头特写她的脸' }).has('camera'));
    assert.ok(detectPromptTriggers({ recentAiTexts: ['[igs-fx:cam|拉远]'] }).has('camera'));
    assert.equal(detectPromptTriggers({ userText: '看她的脸，她走远了' }).has('camera'), false);
});

test('gate:prompt-budget:every-daily-kind-has-chinese-trigger-words', () => {
    assert.deepEqual(Object.keys(DAILY_TRIGGER_WORDS).sort(), [...DAILY_FX_KINDS].sort());
    for (const [kind, words] of Object.entries(DAILY_TRIGGER_WORDS)) {
        assert.ok(detectPromptTriggers({ userText: `她${words[0]}了` }).has('daily'), kind);
    }
    assert.equal(detectPromptTriggers({ userText: '他成绩不错' }).has('daily'), false);
});

test('gate:prompt-budget:expanding-adaptive-blocks-only-changes-depth0', () => {
    const base = buildTagGrammar({ readerSettings: ALL_ON, sceneRule: sceneRuleWithMoods() });
    const expanded = buildTagGrammar({ readerSettings: ALL_ON, sceneRule: sceneRuleWithMoods(), expand: new Set(['chat', 'battle']) });
    assert.equal(expanded.system, base.system);
    assert.match(expanded.depth0, /【线上聊天】/);
    assert.match(expanded.depth0, /【战斗】/);
    assert.doesNotMatch(expanded.depth0, /【日常演出】/);
    assert.deepEqual(expanded.expanded.sort(), ['battle', 'chat']);
});

test('gate:prompt-budget:expanded-blocks-stay-in-full', () => {
    const sceneRule = sceneRuleWithMoods();
    const full = buildTagGrammar({ readerSettings: ALL_ON, sceneRule, expand: new Set(['chat', 'daily', 'battle', 'romance']) });
    assert.match(full.system, /【场景与台词】/);
    assert.match(full.system, /【文字演出】/);
    assert.match(full.system, /看这个角色现在在什么地方、正在做什么/);
    assert.match(full.system, /剧情里写明这个角色换了衣服/);
    assert.match(full.depth0, /【亲密氛围】/);
    assert.equal(full.indexed.includes('romance'), false);
});

test('gate:prompt-budget:custom-chat-rule-is-always-sent-in-full', () => {
    const blocks = collectGrammarBlocks({ chatShow: { enabled: true, promptRule: '自定义聊天规则' } });
    assert.equal(blocks.find((b) => b.key === 'chat').adaptive, false);
    const { system } = buildTagGrammar({ readerSettings: { chatShow: { enabled: true, promptRule: '自定义聊天规则' } } });
    assert.match(system, /自定义聊天规则/);
});

test('gate:prompt-budget:triggers-follow-recent-tags-user-words-and-unclosed-pairs', () => {
    assert.deepEqual([...detectPromptTriggers({})], []);
    assert.deepEqual([...detectPromptTriggers({ userText: '拿出手机给她发消息' })], ['chat']);
    assert.deepEqual([...detectPromptTriggers({ userText: '拔剑迎战' })], ['battle']);
    assert.deepEqual([...detectPromptTriggers({ recentAiTexts: ['[igs-fx:photo|合影]'] })], ['daily']);
    // 超出回看层数的标签不算。
    assert.deepEqual([...detectPromptTriggers({ recentAiTexts: ['[igs-fx:photo|合影]', '一', '二', '三'] })], []);
    // 未闭合的成对标签即使在回看范围外也要展开。
    assert.deepEqual([...detectPromptTriggers({ recentAiTexts: ['[igs-fx:romance|暧昧]\n正文', '一', '二', '三'], lookback: 3 })], ['romance']);
    assert.deepEqual([...detectPromptTriggers({ recentAiTexts: ['[igs-chat:群聊]\n[igs-msg:A|hi]'] })], ['chat']);
    assert.deepEqual([...detectPromptTriggers({ recentAiTexts: ['[igs-fx:battle|哥布林]', '战斗继续'], lookback: 1 })], ['battle']);
    assert.deepEqual([...detectPromptTriggers({ recentAiTexts: ['[igs-fx:battle|哥布林]', '[igs-fx:battle-end|胜利]', '一', '二', '三'] })], []);
    // AI 上一层自然写出事件但漏了标签，用户只说继续也能展开；再往前一层的就不算。
    assert.deepEqual([...detectPromptTriggers({ recentAiTexts: ['她系上围裙开始做饭'], userText: '继续' })], ['daily']);
    assert.deepEqual([...detectPromptTriggers({ recentAiTexts: ['她系上围裙开始做饭', '一'], userText: '继续' })], []);
});

test('gate:prompt-budget:compact-vocab-keeps-slot-words-and-unlisted-words-still-resolve', () => {
    const compact = buildCompactMoodGroupsText(DEFAULT_MOOD_GROUPS, new Set(['狂喜']));
    assert.match(compact, /大笑：狂喜/);
    for (const group of DEFAULT_MOOD_GROUPS) {
        for (const word of group.words) {
            assert.equal(resolveMoodGroup(word, DEFAULT_MOOD_GROUPS), group.label, word);
        }
    }
    const capped = capVocabItems(Array.from({ length: 200 }, (_, i) => `词${i}`), 40);
    assert.equal(capped.at(-1), '等');
    assert.ok(len(capped.join('、')) <= 42);
});

test('gate:prompt-budget:outfit-vocab-lists-only-present-characters-or-falls-back-capped', () => {
    const outfits = { 林小雨: { 校服: {}, 睡衣: {} }, 王老师: { 西装: {} } };
    assert.equal(buildScopedOutfitGroupsText(outfits, { presentText: '林小雨走进教室' }), '林小雨：校服 / 睡衣');
    assert.equal(buildScopedOutfitGroupsText(outfits, { presentText: '小雨走进教室', characterAliases: { 林小雨: ['小雨'] } }), '林小雨：校服 / 睡衣');
    assert.equal(buildScopedOutfitGroupsText(outfits, { presentText: null }), '林小雨：校服 / 睡衣\n王老师：西装');
    assert.equal(buildScopedOutfitGroupsText(outfits, { presentText: null, limit: 12 }), '林小雨：校服 / 睡衣\n等');
    const noted = { 林小雨: { 校服: { note: '上学、在教室' }, 睡衣: { note: '在家睡觉' } } };
    assert.equal(buildScopedOutfitGroupsText(noted, { presentText: '林小雨' }), '林小雨：校服（上学、在教室） / 睡衣（在家睡觉）');
    assert.equal(normalizePromptPlacement('depth0'), 'depth0');
    assert.equal(normalizePromptPlacement('bogus'), 'system');
});

function mountWithHost({ sceneAssets = {}, readerSettings = {}, chat = [] } = {}) {
    const extensionPrompts = {};
    const handlers = new Map();
    const context = {
        chat,
        name2: '林小雨',
        extensionPrompts,
        event_types: { CHAT_CHANGED: 'chat_changed', GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended' },
        eventSource: {
            on(name, fn) { handlers.set(name, [...(handlers.get(name) || []), fn]); },
            removeListener(name, fn) { handlers.set(name, (handlers.get(name) || []).filter((h) => h !== fn)); },
        },
        setExtensionPrompt(key, value, position, depth, scan, role) {
            extensionPrompts[key] = { value, position, depth, scan, role };
        },
    };
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({ sceneAssets: { enabled: true, promptRule: DEFAULT_SCENE_PROMPT_RULE, scenes: {}, characters: {}, ...sceneAssets } }),
        'igs-reader-settings-v9-default': JSON.stringify(readerSettings),
    });
    const vn = bootstrapIGS({
        global: { localStorage: storage, SillyTavern: { getContext: () => context }, setTimeout: () => 0, clearTimeout() {} },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    const emit = (name, ...args) => { for (const fn of handlers.get(name) || []) fn(...args); };
    return { vn, extensionPrompts, emit, context };
}

test('gate:prompt-budget:generation-start-reinjects-with-triggers-and-skips-impersonate', () => {
    const { vn, extensionPrompts, emit, context } = mountWithHost({ readerSettings: { chatShow: { enabled: true } } });
    try {
        emit('generation_started', 'normal', {}, false);
        assert.equal(extensionPrompts[MAIN].position, 0);
        assert.match(extensionPrompts[MAIN].value, /【按需】.*线上聊天/);
        assert.equal(extensionPrompts[DEPTH0].value, DEPTH0_REMINDER);
        const systemBefore = extensionPrompts[MAIN].value;

        context.chat.push({ is_user: true, mes: '掏出手机给她发了条微信' });
        emit('generation_started', 'normal', {}, false);
        assert.equal(extensionPrompts[MAIN].value, systemBefore);
        assert.match(extensionPrompts[DEPTH0].value, /【线上聊天】/);

        emit('generation_started', 'impersonate', {}, false);
        assert.equal(Object.hasOwn(extensionPrompts, MAIN), false);
        assert.equal(Object.hasOwn(extensionPrompts, DEPTH0), false);
        emit('generation_ended');
        assert.equal(extensionPrompts[MAIN].value, systemBefore);
    } finally {
        vn.destroy();
    }
});

test('gate:prompt-budget:depth0-placement-merges-into-one-in-chat-prompt', () => {
    const { vn, extensionPrompts, emit } = mountWithHost({ sceneAssets: { promptPlacement: 'depth0' } });
    try {
        emit('chat_changed');
        assert.equal(extensionPrompts[MAIN].position, 1);
        assert.equal(Object.hasOwn(extensionPrompts, DEPTH0), false);
        assert.doesNotMatch(extensionPrompts[MAIN].value, /本轮按系统说明/);
    } finally {
        vn.destroy();
    }
});

test('gate:prompt-budget:adaptive-off-sends-the-old-full-concatenation', () => {
    const readerSettings = { chatShow: { enabled: true }, fxTags: ALL_ON.fxTags, itemFx: { enabled: true }, textFx: { enabled: true } };
    const { vn, extensionPrompts, emit } = mountWithHost({ sceneAssets: { promptAdaptive: false, promptPlacement: 'depth0' }, readerSettings });
    try {
        emit('generation_started', 'impersonate', {}, false);
        const expectedScene = LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3;
        const value = extensionPrompts[MAIN].value;
        assert.equal(extensionPrompts[MAIN].position, 1);
        assert.ok(value.startsWith('[igs标签语法]'), value.slice(0, 40));
        assert.ok(value.endsWith([
            resolveChatShowPromptRule({ enabled: true }),
            resolveFxPromptRule(ALL_ON.fxTags),
            resolveItemFxPromptRule(true),
            resolveTextFxPromptRule(true),
        ].join('\n\n')));
        assert.ok(expectedScene.includes('{{mood_groups}}'));
        assert.doesNotMatch(value, /\{\{mood_groups\}\}/);
        assert.doesNotMatch(value, /【按需】/);
    } finally {
        vn.destroy();
    }
});

test('gate:prompt-budget:adaptive-off-honours-fx-prompt-overrides-and-inject', () => {
    const base = { chatShow: { enabled: true }, fxTags: ALL_ON.fxTags, itemFx: { enabled: true } };
    const custom = mountWithHost({ sceneAssets: { promptAdaptive: false, promptPlacement: 'depth0' }, readerSettings: { ...base, fxPrompts: { item: '我写的物品规则' } } });
    try {
        custom.emit('generation_started', 'impersonate', {}, false);
        const value = custom.extensionPrompts[MAIN].value;
        assert.match(value, /我写的物品规则/);
        assert.doesNotMatch(value, /\[igs物品标签\]/);
        assert.ok(value.includes(resolveFxPromptRule(ALL_ON.fxTags)));
    } finally {
        custom.vn.destroy();
    }
    const off = mountWithHost({ sceneAssets: { promptAdaptive: false, promptPlacement: 'depth0' }, readerSettings: { ...base, fxPrompts: { inject: false } } });
    try {
        off.emit('generation_started', 'impersonate', {}, false);
        const value = off.extensionPrompts[MAIN].value;
        assert.doesNotMatch(value, /\[igs演出标签\]|\[igs物品标签\]|igs-chat:/);
    } finally {
        off.vn.destroy();
    }
});

test('gate:prompt-budget:ancient-era-applies-to-adaptive-grammar', () => {
    const { vn, extensionPrompts, emit } = mountWithHost({ sceneAssets: { ancient: true }, readerSettings: { fxTags: ALL_ON.fxTags, chatShow: { enabled: true }, dailyFx: ALL_ON.dailyFx } });
    try {
        emit('chat_changed');
        const value = extensionPrompts[MAIN].value;
        assert.match(value, /igs时代背景/);
        assert.match(value, /【按需】.*书信往来/);
        assert.match(value, /notify\|来人\|/);
        assert.doesNotMatch(value, /\bcall\|/);
        assert.doesNotMatch(value, /photo/);
    } finally {
        vn.destroy();
    }
});
