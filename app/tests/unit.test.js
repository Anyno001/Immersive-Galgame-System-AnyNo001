import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createInputChannel } from '../src/host/input-channel.js';
import { createPresetRegistry } from '../src/presets/preset-registry.js';
import { findOptionTable, extractOptionTexts, readOptionItems, OPTION_TABLE_NAMES } from '../src/choices/option-table.js';
import {
    buildIgsTextPayload,
    cleanNarrativeSource,
    DEFAULT_SOURCE_FILTER,
    DEFAULT_VIRTUAL_REGEX,
} from '../src/scene/message-source.js';
import {
    buildSegmentImageMap,
    parseImageSlots,
} from '../src/scene/image-slots.js';
import { parseSceneText } from '../src/scene/text-parser.js';
import { applyAlignStyle } from '../src/visual/igs-ui/reader-dom-render.js';
import { resolveSpriteLayout, resolveActiveTheme } from '../src/visual/igs-ui/settings-normalize.js';
import { runTextPipeline } from '../src/scene/text-pipeline.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { resolveScene } from '../src/scene/scene-resolver.js';
import { getResponsiveLayout } from '../src/visual/responsive-layout.js';
import { createReaderState } from '../src/visual/reader-state.js';
import { createStageModel } from '../src/visual/stage-model.js';
import { resolveVisualMode, VISUAL_MODES } from '../src/visual/visual-mode.js';
import { createPromptAdapter } from '../src/prompts/adapters/prompt-adapter.js';
import { naiRequestBuilder } from '../src/generated-images/request-builders/nai-builder.js';
import { chamiProvider } from '../src/generated-images/providers/chami-provider.js';
import { fetchModels as fetchImageModels, generateImage as generateImageFromApi } from '../src/generated-images/image-api-client.js';
import { createReaderImageService } from '../src/generated-images/reader-image-service.js';
import { createPublicApi, attachPublicApi } from '../src/api/public-api.js';
import {
    createTavernHelperAdapter,
    ensureMessageImagePlaceholders,
} from '../src/host/tavern-helper-adapter.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { createPromptInjector } from '../src/host/prompt-injector.js';
import {
    extractSceneDirectives,
    lookupSceneAssetUrls,
    resolveSceneStateAtIndex,
} from '../src/scene/scene-directives.js';
import {
    DEFAULT_MOOD_GROUPS,
    buildMoodGroupsText,
    normalizeMoodGroups,
    resolveMoodGroup,
} from '../src/scene/mood-groups.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';

const appRoot = path.resolve(import.meta.dirname, '..');

test('gate:host:input-channel rejects empty text and sends valid text', async () => {
    const sent = [];
    const channel = createInputChannel({
        typeAndSend: async (text) => {
            sent.push(text);
            return { ok: true };
        },
    });

    assert.equal((await channel.typeAndSend('')).ok, false);
    assert.deepEqual(await channel.typeAndSend('继续'), { ok: true });
    assert.deepEqual(sent, ['继续']);
});

test('gate:scene:parses tags and resolves background and character rules', () => {
    const textScene = parseSceneText('[角色: 艾莉]\n[情绪: 微笑]\n[时间: 夜晚]\n[天气: 雨]\n[地点: 图书馆]\n我们到了。', { messageId: 1 });
    const scene = resolveScene({
        textScene,
        backgroundRules: [
            { id: 'bg.library', priority: 10, match: { location: ['图书馆'], time: ['夜晚'], weather: ['雨'] } },
        ],
        characterRules: [
            { id: 'char.eli.smile', character: '艾莉', emotion: '微笑' },
        ],
    });

    assert.equal(scene.messageId, 1);
    assert.equal(scene.speaker, '艾莉');
    assert.equal(scene.background.id, 'bg.library');
    assert.equal(scene.character.id, 'char.eli.smile');
});

test('gate:presets:registry-registers-and-lists-text-presets', () => {
    const bundle = readJson('fixtures/presets/text-presets-import-bundle.json');
    const registry = createPresetRegistry();
    const result = registry.importBundle(bundle);

    assert.equal(result.ok, true);
    assert.equal(result.accepted.length, 3);
    assert.equal(registry.list('text-filter-preset').length, 1);
    assert.equal(registry.list('text-format-preset').length, 1);
    assert.equal(registry.list('scene-regex-preset').length, 1);
    assert.equal(registry.get('text-format-preset', 'preset.text-format.bubble-line').name, 'Bubble 转对话行');
});

test('gate:presets:registry-current-survives-storage-reload', () => {
    const bundle = readJson('fixtures/presets/text-presets-import-bundle.json');
    const storage = createMemoryStorage();
    const registry = createPresetRegistry({ storage });

    registry.importBundle(bundle);
    registry.setCurrent('text-filter-preset', 'preset.text-filter.content-only');
    registry.setCurrent('text-format-preset', 'preset.text-format.bubble-line');
    registry.setCurrent('scene-regex-preset', 'preset.scene-regex.stage-fields');

    const reloaded = createPresetRegistry({ storage });
    assert.equal(reloaded.snapshot().current['text-filter-preset'], 'preset.text-filter.content-only');
    assert.equal(reloaded.snapshot().current['text-format-preset'], 'preset.text-format.bubble-line');
    assert.equal(reloaded.snapshot().current['scene-regex-preset'], 'preset.scene-regex.stage-fields');
    assert.equal(reloaded.getCurrent('text-format-preset').name, 'Bubble 转对话行');
});

test('gate:presets:bad-preset-does-not-overwrite-current', () => {
    const bundle = readJson('fixtures/presets/text-presets-import-bundle.json');
    const badBundle = readJson('fixtures/presets/bad-current-overwrite-bundle.json');
    const registry = createPresetRegistry();

    registry.importBundle(bundle);
    registry.setCurrent('text-format-preset', 'preset.text-format.bubble-line');
    const before = registry.getCurrent('text-format-preset');
    const result = registry.importBundle(badBundle);
    const after = registry.getCurrent('text-format-preset');

    assert.equal(result.ok, false);
    assert.equal(result.rejected.length, 1);
    assert.equal(before.id, after.id);
    assert.equal(after.data.pattern, '@bubble:([^|\\n]+)\\|([^|\\n]+)\\|([^\\n]+)');
});

test('gate:presets:export-group-keeps-igs-bundle-shape', () => {
    const bundle = readJson('fixtures/presets/text-presets-import-bundle.json');
    const registry = createPresetRegistry();

    registry.importBundle(bundle);
    const exported = registry.exportGroup('text-format-preset');

    assert.equal(exported.type, 'igs-import-bundle');
    assert.equal(exported.items.length, 1);
    assert.equal(exported.items[0].type, 'text-format-preset');
});

test('gate:scene:text-filter-preset:extracts-content', () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const scene = parseSceneText(message.text, {
        messageId: message.id,
        textFilterPreset,
    });

    assert.equal(scene.messageId, 12);
    assert.equal(scene.text.includes('不要进入正文'), false);
    assert.equal(scene.text.includes('prompt://ignore-me'), false);
    assert.equal(scene.text.includes('@bubble:玉子|开心|你好，欢迎来到图书馆。'), true);
    assert.equal(scene.sourceKind, 'tagged-content');
    assert.deepEqual(scene.textPipelineErrors, []);
});

test('gate:scene:text-filter-preset:extracts-content-with-attributes', () => {
    // 真机回归：content 带属性（<content data-igs-formatted="1">）时，
    // 此前 text-pipeline 正则不容忍属性 → 匹配失败 → 兜底吐出含思考草稿的全文。
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const raw = [
        '<!-- begin_of_Subtext_think -->',
        'Atri: 大段思考草稿，不应进入正文。',
        '<!-- end_of_Subtext_think -->',
        '</thinking>',
        '### 正文',
        '<now_plot>',
        '<content data-igs-formatted="1">',
        '[igs-scene:白府偏房|早晨|晴天]',
        '正文第一句。',
        '正文第二句。',
        '</content>',
        '</now_plot>',
    ].join('\n');
    const scene = parseSceneText(raw, { messageId: 1, textFilterPreset });

    assert.equal(scene.sourceKind, 'tagged-content');
    assert.equal(scene.text.includes('大段思考草稿'), false);
    assert.equal(scene.text.includes('</thinking>'), false);
    assert.equal(scene.text.includes('### 正文'), false);
    assert.equal(scene.text.includes('now_plot'), false);
    assert.equal(scene.text.includes('正文第一句。'), true);
    assert.equal(scene.text.includes('正文第二句。'), true);
});

test('gate:scene:text-format-preset:applies-replacement', () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const textFormatPreset = readJson('fixtures/text/text-format-preset.json');
    const pipeline = runTextPipeline(message.text, {
        textFilterPreset,
        textFormatPreset,
    });

    assert.equal(pipeline.ok, true);
    assert.match(pipeline.formattedText, /玉子（开心）：你好，欢迎来到图书馆。/);
    assert.equal(pipeline.formatSourceKind, 'regex-replace');
});

test('gate:scene:scene-regex-preset:extracts-fields', () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const textFormatPreset = readJson('fixtures/text/text-format-preset.json');
    const sceneRegexPreset = readJson('fixtures/text/scene-regex-preset.json');
    const pipeline = runTextPipeline(message.text, {
        textFilterPreset,
        textFormatPreset,
        sceneRegexPreset,
    });

    assert.equal(pipeline.ok, true);
    assert.equal(pipeline.scenePatch.location, '图书馆');
    assert.equal(pipeline.scenePatch.time, '夜晚');
    assert.equal(pipeline.scenePatch.weather, '雨');
    assert.equal(pipeline.scenePatch.speaker, '玉子');
    assert.equal(pipeline.scenePatch.emotion, '开心');
});

test('gate:scene:text-pipeline:bad-regex-does-not-throw', () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const badTextFormatPreset = readJson('fixtures/text/bad-text-format-preset.json');

    const scene = parseSceneText(message.text, {
        messageId: message.id,
        textFilterPreset,
        textFormatPreset: badTextFormatPreset,
    });

    assert.equal(scene.messageId, 12);
    assert.match(scene.text, /@bubble:玉子\|开心\|你好，欢迎来到图书馆。/);
    assert.equal(scene.textPipelineErrors.length > 0, true);
    assert.equal(scene.textPipelineErrors[0].presetType, 'text-format-preset');
});

test('gate:scene:igs-message-source:extracts-readable-text-from-host-ui-html', () => {
    const message = readJson('fixtures/tavern/host-ui-leak-message.json');
    const payload = buildIgsTextPayload(message);

    assert.equal(payload.formattedText.includes('API Connections'), false);
    assert.equal(payload.formattedText.includes('rightNavHolder'), false);
    assert.equal(payload.formattedText.includes('<div'), false);
    assert.equal(payload.formattedText.includes('<button'), false);
    assert.match(payload.formattedText, /玉子: 今晚我们先从这里开始。/);
    assert.equal(payload.usedFallback, true);
});

test('gate:scene:igs-message-source:prefers-dom-text-when-keyword-filter-rewrites-word', () => {
    const dataLayer = '<content>这一步迈出去，好像就真的踏进了那个名为“自相残杀”的怪圈里。</content>';
    const domVisible = '这一步迈出去，好像就真的踏进了那个名为“互相杀”的怪圈里。';
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible });

    assert.equal(payload.usedDomOverride, true);
    assert.match(payload.formattedText, /互相杀/);
    assert.equal(payload.formattedText.includes('自相残杀'), false);
});

test('gate:scene:igs-message-source:keeps-data-text-when-dom-is-different-content', () => {
    const dataLayer = '<content>玉子站在门口，犹豫着要不要敲门。</content>';
    const domVisible = '完全不相干的另一段文字，长度也明显不同，理应判定为不同内容而保留原文。';
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible });

    assert.equal(Boolean(payload.usedDomOverride), false);
    assert.match(payload.formattedText, /犹豫着要不要敲门/);
});

test('gate:scene:igs-message-source:keeps-data-directives-when-dom-strips-igs-tags', () => {
    // 守卫场景：若宿主真的把 [igs-*:] 标签从渲染层清洗掉（DOM 无标签），即便长度量级接近，
    // 也不能用 DOM 覆盖，否则全部对白/心理话标签丢失。此时回落数据层 strict 解析。
    const dataLayer = [
        '<content>',
        '[igs-scene:厢房|早晨|晴天]',
        '他烦躁地拨弄着头发。',
        '[igs-thought:哪吒|烦躁|什么破头发，剪了算了。]',
        '[igs-char:白墨|玩味|吒儿姐姐，起了么？]',
        '</content>',
    ].join('\n');
    const domVisible = '他烦躁地拨弄着头发。\n什么破头发，剪了算了。\n吒儿姐姐，起了么？';
    const sceneAssets = {
        enabled: true,
        promptRule: 'r',
        characters: { 哪吒: { 烦躁: 'u' }, 白墨: { 玩味: 'u' } },
    };
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible }, { sceneAssets });

    assert.equal(Boolean(payload.usedDomOverride), false);
    assert.notEqual(payload.sourceKind, 'dom-visible-override');
    assert.match(payload.formattedText, /\*什么破头发，剪了算了。\*/);
    assert.match(payload.formattedText, /\[白墨\]：吒儿姐姐，起了么？/);
    const thoughts = payload.sceneDirectives.filter((d) => d.type === 'thought');
    const chars = payload.sceneDirectives.filter((d) => d.type === 'char');
    assert.equal(thoughts.length, 1);
    assert.equal(chars.length, 1);
});

test('gate:scene:igs-message-source:dom-override-applies-veridis-replacements-when-host-strips-igs-tags', () => {
    // Veridis 真机场景：宿主把 [igs-*:] 从 DOM 清洗掉 + Veridis 替换了正文词。
    // 修复前：domClobbersDirectiveTags=true 阻断整个 DOM override，阅读器显示原词。
    // 修复后：文本覆盖照常生效（Veridis 替换词进阅读器），指令从数据层提取（不丢失）。
    const dataLayer = [
        '<content>',
        '[igs-scene:厢房|早晨|晴天]',
        '他烦躁地拨弄着头发。',
        '[igs-thought:哪吒|烦躁|什么破头发，剪了算了。]',
        '[igs-char:白墨|玩味|吒儿姐姐，起了么？]',
        '</content>',
    ].join('\n');
    // 宿主清洗了 [igs-*:] 标签，Veridis 把"头发"替换成了"鬓发"
    const domVisible = '他烦躁地拨弄着鬓发。\n什么破鬓发，剪了算了。\n吒儿姐姐，起了么？';
    const sceneAssets = {
        enabled: true,
        promptRule: 'r',
        characters: { 哪吒: { 烦躁: 'u' }, 白墨: { 玩味: 'u' } },
    };
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible }, { sceneAssets });

    assert.equal(payload.usedDomOverride, true);
    assert.match(payload.formattedText, /鬓发/);
    assert.equal(payload.formattedText.includes('头发'), false);
    // 指令从数据层提取，不丢失
    const thoughts = payload.sceneDirectives.filter((d) => d.type === 'thought');
    const chars = payload.sceneDirectives.filter((d) => d.type === 'char');
    assert.equal(thoughts.length, 1);
    assert.equal(chars.length, 1);
});

test('gate:scene:igs-message-source:dom-override-formats-igs-tags-into-bubbles', () => {
    // 真机场景：宿主 DOM .mes_text 仍保留原始 [igs-char/thought:] 标签，且与数据层有词级差异
    // 触发 DOM override。override 必须对 DOM 文本跑正文格式化，把标签转成 [名]：… 与 *…*，
    // 否则阅读器把整段当旁白、角色名/分割线/标签心理话全部丢失。
    const dataLayer = [
        '<content>',
        '[igs-thought:哪吒|烦躁|什么破头发，剪了算了。]',
        '[igs-char:白墨|玩味|吒儿姐姐，起了么？]',
        '</content>',
    ].join('\n');
    // DOM 文本含原始标签，但某个词被关键词插件改过（破头发→破头毛），构成词级差异。
    const domVisible = [
        '[igs-thought:哪吒|烦躁|什么破头毛，剪了算了。]',
        '[igs-char:白墨|玩味|吒儿姐姐，起了么？]',
    ].join('\n');
    const sceneAssets = {
        enabled: true,
        promptRule: 'r',
        characters: { 哪吒: { 烦躁: 'u' }, 白墨: { 玩味: 'u' } },
    };
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible }, { sceneAssets });

    assert.equal(payload.usedDomOverride, true);
    // DOM 文本里的标签被格式化成气泡/心理话形态，而非保留原始 [igs-*:] 标签。
    assert.match(payload.formattedText, /\*什么破头毛，剪了算了。\*/);
    assert.match(payload.formattedText, /\[白墨\]：吒儿姐姐，起了么？/);
    assert.equal(payload.formattedText.includes('[igs-thought:'), false);
    assert.equal(payload.formattedText.includes('[igs-char:'), false);
});

test('gate:scene:igs-message-source:still-overrides-dom-when-both-sides-have-igs-tags', () => {
    // 数据层和 DOM 都含 igs 标签（插件只改了标签内的词），守卫不触发，DOM override 照常生效。
    const dataLayer = '<content>[igs-char:哪吒|平静|这一步迈进了自相残杀的怪圈。]</content>';
    const domVisible = '[igs-char:哪吒|平静|这一步迈进了互相杀的怪圈。]';
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible }, {
        sceneAssets: { enabled: true, promptRule: 'r', characters: { 哪吒: { 平静: 'u' } } },
    });

    assert.equal(payload.usedDomOverride, true);
    assert.match(payload.formattedText, /互相杀/);
    assert.equal(payload.formattedText.includes('自相残杀'), false);
    // 标签被格式化为对白气泡，不残留原始 igs 标签。
    assert.match(payload.formattedText, /\[哪吒\]：/);
    assert.equal(payload.formattedText.includes('[igs-char:'), false);
});

test('gate:scene:igs-message-source:reader-segments-skip-scene-tags', () => {
    const payload = buildIgsTextPayload({
        text: '[角色: 艾莉]\n艾莉: 第一句。 第二句。',
    });

    assert.deepEqual(payload.textSegments, ['第一句。 第二句。']);
    assert.deepEqual(payload.segmentImageSlots, []);
});

test('gate:scene:image-slots:parses-image-tags-in-order', () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const slots = parseImageSlots(source, source, DEFAULT_SOURCE_FILTER);

    assert.equal(slots.length, 6);
    assert.deepEqual(slots.map((slot) => slot.title), [
        '望月的抗拒背影',
        '海斗的冷静观察',
        '望月的不甘与动摇',
        '致命的诱惑：海斗的笔记',
        '海斗的离去与望月的注视',
        '海斗的笔记本与指尖',
    ]);
    assert.deepEqual(slots.map((slot) => slot.promptText), [
        'image###slot-1###',
        'image###slot-2###',
        'image###slot-3###',
        'image###slot-4###',
        'image###slot-5###',
        'image###slot-6###',
    ]);
});

test('gate:scene:image-slots:maps-reader-segments-to-slot-indexes', () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const mapped = buildSegmentImageMap(source, payload.textSegments, payload.imageSlots);

    assert.deepEqual(payload.textSegments, ['第一段正文。', '第二段正文。', '第三段正文。']);
    assert.deepEqual(mapped, [0, 1, 2]);
    assert.deepEqual(payload.segmentImageSlots, [0, 1, 2]);
});

test('gate:scene:sentence-paging-splits-all-body-by-period-when-scene-assets-off', () => {
    const source = '今天天气很好。我们一起去图书馆。她笑了。';
    const off = buildIgsTextPayload({ text: source });
    const on = buildIgsTextPayload({ text: source }, { sentencePaging: true });

    assert.equal(off.textSegments.length, 1);
    assert.deepEqual(on.textSegments, ['今天天气很好。', '我们一起去图书馆。', '她笑了。']);
});

test('gate:scene:sentence-paging-only-splits-narration-when-scene-assets-on', () => {
    const source = '旁白第一句。旁白第二句。\n[玉子]：你好呀。请坐。';
    const payload = buildIgsTextPayload({ text: source }, {
        sentencePaging: true,
        sceneAssets: { enabled: true },
    });

    assert.deepEqual(payload.textSegments, ['旁白第一句。', '旁白第二句。', '[玉子]：你好呀。请坐。']);
});

test('gate:igs-ui:apply-align-style-maps-left-center-indent', () => {
    const makeEl = () => ({ style: {} });
    const left = makeEl();
    applyAlignStyle(left, 'left');
    assert.equal(left.style.textAlign, 'left');
    assert.equal(left.style.textIndent, '');

    const center = makeEl();
    applyAlignStyle(center, 'center');
    assert.equal(center.style.textAlign, 'center');
    assert.equal(center.style.textIndent, '');

    const indent = makeEl();
    applyAlignStyle(indent, 'indent');
    assert.equal(indent.style.textAlign, 'left');
    assert.equal(indent.style.textIndent, '2em');
});

test('gate:igs-ui:resolve-active-theme-exposes-align-fields', () => {
    const genshin = resolveActiveTheme({ readerSettings: { _vnTheme: { preset: 'genshin' } } });
    assert.equal(genshin.nameAlign, 'center');
    assert.equal(genshin.textAlign, 'left');
    assert.equal(genshin.narrationAlign, 'left');
    assert.equal(genshin.thoughtAlign, 'left');

    const custom = resolveActiveTheme({ readerSettings: { _vnTheme: { preset: 'custom', textAlign: 'indent', thoughtAlign: 'center' } } });
    assert.equal(custom.textAlign, 'indent');
    assert.equal(custom.thoughtAlign, 'center');
    assert.equal(custom.narrationAlign, 'left');
});

test('gate:igs-ui:resolve-sprite-layout-keeps-mode-isolated', () => {
    const layouts = {
        'pc::小林海斗::平和': { posX: 70, posY: 30, scale: 180 },
        'mobile::小林海斗::平和': { posX: 40, posY: 90, scale: 110 },
    };
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林海斗', '平和'), { posX: 70, posY: 30, scale: 180 });
    assert.deepEqual(resolveSpriteLayout(layouts, 'mobile', '小林海斗', '平和'), { posX: 40, posY: 90, scale: 110 });
    // 切到没有该 key 的模式回退默认，不会串用其他模式的数据
    assert.deepEqual(resolveSpriteLayout(layouts, 'web', '小林海斗', '平和'), { posX: 50, posY: 100, scale: 100 });
});

test('gate:scene:igs-message-source:formats-default-bubble-body', () => {
    const payload = buildIgsTextPayload({
        text: '<content>[igs-char:玉子|开心|欢迎来到图书馆。]</content>',
    }, {
        virtualRegex: DEFAULT_VIRTUAL_REGEX,
    });

    assert.equal(payload.formattedText, '[玉子]：欢迎来到图书馆。');
    assert.equal(payload.virtualRegexChanged, true);
});

test('gate:host:prompt-injector-registers-scene-rule-as-in-chat-extension-prompt', () => {
    const extensionPrompts = {};
    const calls = [];
    const globalObject = {
        TavernHelper: {
            injectPrompts() {
                throw new Error('TavernHelper fallback should not be used when SillyTavern context exists');
            },
        },
        SillyTavern: {
            getContext() {
                return {
                    extensionPrompts,
                    setExtensionPrompt(key, value, position, depth, scan, role) {
                        calls.push({ key, value, position, depth, scan, role });
                        extensionPrompts[key] = { value, position, depth, scan, role };
                    },
                };
            },
        },
    };
    const injector = createPromptInjector(globalObject);
    const result = injector.inject('rule: @igs-scene');

    assert.deepEqual(result, { ok: true, method: 'extension-prompt', verified: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].position, 1);
    assert.equal(calls[0].role, 0);
    assert.equal(extensionPrompts['igs-scene-assets-format-rule'].value, 'rule: @igs-scene');
    assert.equal(extensionPrompts['igs-scene-assets-format-rule'].position, 1);
    assert.equal(injector.isActive(), true);

    injector.clear();
    assert.equal(Object.hasOwn(extensionPrompts, 'igs-scene-assets-format-rule'), false);
    assert.equal(injector.isActive(), false);
});

test('gate:scene:scene-assets-resolves-by-exact-match-and-default-key-only', () => {
    // exact match: scene key = 'B班教室', mood = '平静'
    const assets1 = lookupSceneAssetUrls({
        scene: 'B班教室', time: '', weather: '',
        character: '小林海斗', mood: '平静',
    }, {
        scenes: { 'B班教室': { url: 'https://example.com/classroom.png', times: {} } },
        characters: { '小林海斗': { '平静': 'https://example.com/kaito.png' } },
    });
    assert.deepEqual(assets1, { backgroundUrl: 'https://example.com/classroom.png', spriteUrl: 'https://example.com/kaito.png', spriteSlot: '平静' });

    // '默认' fallback when scene name doesn't match
    const assets2 = lookupSceneAssetUrls({
        scene: '走廊', time: '', weather: '',
        character: '小林海斗', mood: '随和',
    }, {
        scenes: { '默认': { url: 'https://example.com/default.png', times: {} } },
        characters: { '小林海斗': { '默认': 'https://example.com/kaito.png' } },
    });
    assert.deepEqual(assets2, { backgroundUrl: 'https://example.com/default.png', spriteUrl: 'https://example.com/kaito.png', spriteSlot: '默认' });

    // no scene fallback when only non-matching named key exists, but character still matches exactly
    const assets3 = lookupSceneAssetUrls({
        scene: '走廊', time: '', weather: '',
        character: '小林海斗', mood: '随和',
    }, {
        scenes: { '场景1': { url: 'https://example.com/classroom.png', times: {} } },
        characters: { '小林海斗': { '随和': 'https://example.com/kaito.png' } },
    });
    assert.deepEqual(assets3, { backgroundUrl: null, spriteUrl: 'https://example.com/kaito.png', spriteSlot: '随和' });
});

test('gate:scene:mood-groups-resolve-fine-word-to-group-label', () => {
    assert.equal(resolveMoodGroup('欣喜', DEFAULT_MOOD_GROUPS), '喜悦');
    assert.equal(resolveMoodGroup('喜悦', DEFAULT_MOOD_GROUPS), '喜悦');
    assert.equal(resolveMoodGroup('慌张', DEFAULT_MOOD_GROUPS), '紧张');
    assert.equal(resolveMoodGroup('不存在的词', DEFAULT_MOOD_GROUPS), null);
    assert.equal(resolveMoodGroup('', DEFAULT_MOOD_GROUPS), null);
});

test('gate:scene:mood-groups-build-text-renders-label-and-words', () => {
    const text = buildMoodGroupsText([
        { label: '喜悦', words: ['开心', '欣喜'] },
        { label: '愤怒', words: ['生气'] },
    ]);
    assert.equal(text, '喜悦组：开心、欣喜\n愤怒组：生气');
});

test('gate:scene:mood-groups-normalize-falls-back-to-default', () => {
    assert.deepEqual(normalizeMoodGroups(null), DEFAULT_MOOD_GROUPS.map((g) => ({ label: g.label, words: g.words.slice() })));
    assert.deepEqual(normalizeMoodGroups([]), DEFAULT_MOOD_GROUPS.map((g) => ({ label: g.label, words: g.words.slice() })));
    assert.deepEqual(
        normalizeMoodGroups([{ label: ' 自定义 ', words: ['词A', '', '词B'] }, { label: '', words: [] }]),
        [{ label: '自定义', words: ['词A', '词B'] }],
    );
});

test('gate:scene:scene-assets-sprite-resolves-by-mood-group-reduction', () => {
    // AI 写细分词「欣喜」，立绘只配了组名槽「喜悦」→ 归约命中
    const reduced = lookupSceneAssetUrls({
        scene: '', time: '', weather: '',
        character: '小林海斗', mood: '欣喜',
    }, {
        characters: { '小林海斗': { '喜悦': 'https://example.com/joy.png', '默认': 'https://example.com/default.png' } },
        moodGroups: DEFAULT_MOOD_GROUPS,
    });
    assert.equal(reduced.spriteUrl, 'https://example.com/joy.png');

    // 自定义细分词槽精确命中优先于归约
    const exact = lookupSceneAssetUrls({
        scene: '', time: '', weather: '',
        character: '小林海斗', mood: '欣喜',
    }, {
        characters: { '小林海斗': { '欣喜': 'https://example.com/exact.png', '喜悦': 'https://example.com/joy.png' } },
        moodGroups: DEFAULT_MOOD_GROUPS,
    });
    assert.equal(exact.spriteUrl, 'https://example.com/exact.png');

    // 归约不到 + 无精确槽 → 默认兜底
    const fallback = lookupSceneAssetUrls({
        scene: '', time: '', weather: '',
        character: '小林海斗', mood: '生造词',
    }, {
        characters: { '小林海斗': { '喜悦': 'https://example.com/joy.png', '默认': 'https://example.com/default.png' } },
        moodGroups: DEFAULT_MOOD_GROUPS,
    });
    assert.equal(fallback.spriteUrl, 'https://example.com/default.png');
});

test('gate:scene:scene-bg-resolves-by-group-reduction-across-three-layers', () => {
    const assets = {
        scenes: {
            '便利店': {
                url: 'https://example.com/store.png',
                words: ['世田谷区某便利店'],
                times: {
                    '夜晚': {
                        url: 'https://example.com/store-night.png',
                        weathers: { '雨天': { url: 'https://example.com/store-night-rain.png' } },
                    },
                },
            },
        },
        timeGroups: [{ label: '夜晚', words: ['深夜', '晚上'] }],
        weatherGroups: [{ label: '雨天', words: ['小雨', '大雨'] }],
    };

    // 场景名归约：AI 写细分词「世田谷区某便利店」→ 命中组「便利店」
    const sceneOnly = lookupSceneAssetUrls({ scene: '世田谷区某便利店', time: '', weather: '' }, assets);
    assert.equal(sceneOnly.backgroundUrl, 'https://example.com/store.png');

    // 时间归约：AI 写「深夜」→ 归约到时间组「夜晚」
    const sceneTime = lookupSceneAssetUrls({ scene: '世田谷区某便利店', time: '深夜', weather: '' }, assets);
    assert.equal(sceneTime.backgroundUrl, 'https://example.com/store-night.png');

    // 天气归约：AI 写「大雨」→ 归约到天气组「雨天」
    const full = lookupSceneAssetUrls({ scene: '便利店', time: '晚上', weather: '大雨' }, assets);
    assert.equal(full.backgroundUrl, 'https://example.com/store-night-rain.png');
});

test('gate:scene:settings-action-set-time-url-survives-colon-in-time-name', async () => {
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                scenes: { '便利店': { url: '', times: { '19:45': { url: '', weathers: {} } } } },
                characters: {},
            },
        },
        readerSettings: {},
    };
    let persistCount = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: {} },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persistCount += 1; return { ok: true }; },
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    // time name '19:45' contains a colon; encoded by the input handler before invoke
    const enc = (s) => encodeURIComponent(s);
    const action = `scene-set-time-url:${enc('便利店')}:${enc('19:45')}:https://example.com/a.png?x=1:2`;
    const result = await handleSettingsAction(action, ctx);
    assert.equal(result.ok, true);
    assert.equal(draft.bridge.sceneAssets.scenes['便利店'].times['19:45'].url, 'https://example.com/a.png?x=1:2');
    assert.equal(persistCount, 1);
});

test('gate:scene:settings-action-mood-groups-toggle-and-reset', async () => {
    const draft = { bridge: { sceneAssets: { enabled: true, scenes: {}, characters: { '小林': { '喜悦': '' } }, moodGroups: [{ label: '自定义', words: ['词A'] }] } }, readerSettings: {} };
    const asyncState = {};
    let rerenders = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState } },
        options: { global: {} },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => { rerenders += 1; return { ok: true }; },
        buildRegexPreview: () => '',
    };
    await handleSettingsAction(`scene-toggle-mood:${encodeURIComponent('小林')}:${encodeURIComponent('喜悦')}`, ctx);
    assert.ok(asyncState.expandedSpriteSlots instanceof Set);
    assert.equal(asyncState.expandedSpriteSlots.size, 1);
    await handleSettingsAction(`scene-toggle-mood:${encodeURIComponent('小林')}:${encodeURIComponent('喜悦')}`, ctx);
    assert.equal(asyncState.expandedSpriteSlots.size, 0);
    await handleSettingsAction('reset-mood-groups', ctx);
    assert.equal(draft.bridge.sceneAssets.moodGroups.length, DEFAULT_MOOD_GROUPS.length);
    assert.ok(rerenders >= 3);
});

test('gate:scene:mood-create-group-auto-first-word-and-blocks-dup', async () => {
    const draft = { bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {}, moodGroups: [{ label: '喜悦', words: ['开心'] }] } }, readerSettings: {} };
    let alerts = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: { alert: () => { alerts += 1; } } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    // 新建组：组名自动作为第一个词
    await handleSettingsAction(`mood-create-group:${encodeURIComponent('愤怒')}`, ctx);
    const created = draft.bridge.sceneAssets.moodGroups.find((g) => g.label === '愤怒');
    assert.ok(created);
    assert.deepEqual(created.words, ['愤怒']);
    // 组名撞名：阻止 + alert
    const before = draft.bridge.sceneAssets.moodGroups.length;
    await handleSettingsAction(`mood-create-group:${encodeURIComponent('喜悦')}`, ctx);
    assert.equal(draft.bridge.sceneAssets.moodGroups.length, before);
    assert.equal(alerts, 1);
});

test('gate:scene:mood-add-word-dup-confirm-moves-word', async () => {
    const draft = { bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {}, moodGroups: [{ label: '喜悦', words: ['开心', '愉悦'] }, { label: '平和', words: ['平静'] }] } }, readerSettings: {} };
    let confirmed = true;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: { prompt: () => '开心', confirm: () => confirmed } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    // 向「平和」加「开心」（已在喜悦组）→ confirm 后从喜悦删、加到平和
    await handleSettingsAction(`mood-add-word:${encodeURIComponent('平和')}`, ctx);
    const joy = draft.bridge.sceneAssets.moodGroups.find((g) => g.label === '喜悦');
    const calm = draft.bridge.sceneAssets.moodGroups.find((g) => g.label === '平和');
    assert.equal(joy.words.includes('开心'), false);
    assert.equal(calm.words.includes('开心'), true);
});

test('gate:scene:rename-mood-blocks-dup-and-syncs-group-label', async () => {
    const make = (prompt) => {
        const draft = { bridge: { sceneAssets: { enabled: true, scenes: {}, characters: { A: { 喜悦: 'u1', 平和: 'u2' }, B: { 喜悦: 'u3' } }, moodGroups: [{ label: '喜悦', words: ['喜悦', '开心'] }, { label: '平和', words: ['平静'] }] } }, readerSettings: {} };
        let alerts = 0;
        const ctx = {
            state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
            options: { global: { prompt: () => prompt, alert: () => { alerts += 1; } } },
            closeSettings: () => ({ ok: true }),
            persistSettingsDraft: () => ({ ok: true }),
            rerenderSettings: () => ({ ok: true }),
            buildRegexPreview: () => '',
        };
        return { draft, ctx, getAlerts: () => alerts };
    };

    // 撞该角色已有的槽名「平和」→ 阻止，不动数据
    const blocked = make('平和');
    await handleSettingsAction(`scene-rename-mood:${encodeURIComponent('A')}:${encodeURIComponent('喜悦')}`, blocked.ctx);
    assert.equal(blocked.getAlerts(), 1);
    assert.equal('喜悦' in blocked.draft.bridge.sceneAssets.characters.A, true);

    // 改成全新名「欢喜」→ 角色槽名 + 词库组名 + 其他角色同名槽 一起改
    const ok = make('欢喜');
    await handleSettingsAction(`scene-rename-mood:${encodeURIComponent('A')}:${encodeURIComponent('喜悦')}`, ok.ctx);
    assert.equal('欢喜' in ok.draft.bridge.sceneAssets.characters.A, true);
    assert.equal('喜悦' in ok.draft.bridge.sceneAssets.characters.A, false);
    assert.equal('欢喜' in ok.draft.bridge.sceneAssets.characters.B, true);
    const group = ok.draft.bridge.sceneAssets.moodGroups.find((g) => g.label === '欢喜');
    assert.ok(group);
    assert.equal(group.words.includes('欢喜'), true);
    assert.equal(group.words.includes('喜悦'), false);
});

test('gate:scene:extracts-directives-with-trailing-translation-tail', () => {
    // [igs-char] / [igs-thought] lines often carry a translation tail like *（…）*
    // after the closing bracket; the directive must still be extracted (no end anchor).
    const { directives } = extractSceneDirectives([
        '[igs-char:小林海斗|淡然|まさか。]*（怎么可能。）*',
        '[igs-thought:望月|疑惑|这家伙晚饭？]*（…）*',
    ].join('\n'));
    assert.equal(directives.length, 2);
    assert.equal(directives[0].type, 'char');
    assert.equal(directives[0].character, '小林海斗');
    assert.equal(directives[0].mood, '淡然');
    assert.equal(directives[1].type, 'thought');
    assert.equal(directives[1].mood, '疑惑');
});

test('gate:scene:scene-assets-state-follows-current-reader-segment', () => {
    const { directives } = extractSceneDirectives([
        'Opening narration.',
        '[igs-scene:Room|morning|sunny]',
        '[igs-char:Alice|calm|Hello.]',
        'Alice keeps working.',
        '[igs-char:Bob|annoyed|Move faster.]',
        'Bob leaves later.',
    ].join('\n'));

    // directive lines don't count toward segmentIndex — only non-directive lines do
    assert.deepEqual(directives.map((d) => d.segmentIndex), [1, 1, 2]);
    const empty = { scene: '', time: '', weather: '', character: '', mood: '', dialogue: '', thought: '', lastDirectiveType: '' };
    assert.deepEqual(resolveSceneStateAtIndex(directives, 0), empty);
    assert.deepEqual(resolveSceneStateAtIndex(directives, 1), { scene: 'Room', time: 'morning', weather: 'sunny', character: 'Alice', mood: 'calm', dialogue: 'Hello.', thought: '', lastDirectiveType: 'char' });
    assert.deepEqual(resolveSceneStateAtIndex(directives, 2), { scene: 'Room', time: 'morning', weather: 'sunny', character: 'Bob', mood: 'annoyed', dialogue: 'Move faster.', thought: '', lastDirectiveType: 'char' });
});

test('gate:igs-ui:scene-assets-keeps-sprite-with-existing-background', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.4.9',
            bridge: {
                openMode: 'pc',
                sceneAssets: {
                    enabled: true,
                    scenes: {
                        Room: 'https://example.com/room.png',
                    },
                    characters: {
                        Kaito: {
                            calm: 'https://example.com/kaito.png',
                        },
                    },
                },
            },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    const opened = host.openReader({
        message: {
            text: '[igs-scene:Room|morning|sunny]\n[igs-char:Kaito|calm|Ready.]\nKaito keeps working.',
        },
        render: {
            stage: {
                layers: {
                    background: {
                        resource: {
                            url: 'https://example.com/generated-background.png',
                        },
                    },
                },
            },
        },
    }, { mode: 'pc' });

    assert.equal(opened.snapshot.content.backgroundImage, 'https://example.com/room.png');
    assert.equal(opened.snapshot.content.spriteImage, 'https://example.com/kaito.png');
    assert.match(opened.snapshot.html, /id="igs-sprite"/);
    assert.equal(opened.snapshot.styles['#igs-sprite'].display, 'block');

    host.destroy();
});

test('gate:igs-ui:sprite-slot-expand-shows-thumbnail-and-words', async () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.4.9',
            bridge: {
                openMode: 'pc',
                sceneAssets: {
                    enabled: true,
                    scenes: {},
                    characters: { Kaito: { 喜悦: 'https://example.com/k.png' } },
                    moodGroups: [{ label: '喜悦', words: ['开心', '欣喜'] }],
                },
            },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });
    host.openReader({ message: { text: '旁白。' } }, { mode: 'pc' });
    const opened = host.openSettings({ tab: 'scene' });
    const controller = opened.controller;
    controller.switchTab('scene');
    controller.switchSceneSubTab('characters');

    // 折叠态：不含缩略图
    const snap = controller.getSnapshot();
    assert.equal(/igs-sprite-thumb/.test(snap.html), false);

    // 展开后：含缩略图和该情绪组的词
    const after = await controller.invoke(`scene-toggle-mood:${encodeURIComponent('Kaito')}:${encodeURIComponent('喜悦')}`);
    assert.match(after.snapshot.html, /igs-sprite-thumb/);
    assert.match(after.snapshot.html, /开心/);

    host.destroy();
});

test('gate:igs-ui:toolbar-first-last-page-jump', async () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({ version: '0.4.9', bridge: { openMode: 'pc', sceneAssets: { enabled: false } }, readerMode: 'pc', readerSettings: {} }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });
    const opened = host.openReader({ message: { text: '第一段。\n第二段。\n第三段。' } }, { mode: 'pc' });
    const controller = opened.controller;
    assert.equal(opened.snapshot.content.segments.length, 3);
    assert.equal(opened.snapshot.content.currentIndex, 0);

    await controller.invokeAction('last-page');
    assert.equal(host.getState().activeReader.index, 2);
    await controller.invokeAction('first-page');
    assert.equal(host.getState().activeReader.index, 0);

    host.destroy();
});

test('gate:igs-ui:scene-assets-classifies-dialogue-vs-narration-per-segment', () => {
    const makeHost = () => createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.4.9',
            bridge: {
                openMode: 'pc',
                sceneAssets: { enabled: true, scenes: {}, characters: {} },
            },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    // dialogue segment: name stripped from body, shown as speaker, textType=dialogue
    const host1 = makeHost();
    const dlg = host1.openReader({
        message: { text: '<content>[igs-char:小林海斗|平静|これは台詞です。]</content>' },
    }, { mode: 'pc' });
    assert.equal(dlg.snapshot.content.textType, 'dialogue');
    assert.equal(dlg.snapshot.content.speaker, '小林海斗');
    assert.equal(dlg.snapshot.content.displayText, 'これは台詞です。');
    assert.equal(dlg.snapshot.content.displayText.includes('['), false);
    host1.destroy();

    // narration segment: no speaker, no name, textType=narration
    const host2 = makeHost();
    const narr = host2.openReader({
        message: { text: '<content>小林海斗静静地看着窗外。</content>' },
    }, { mode: 'pc' });
    assert.equal(narr.snapshot.content.textType, 'narration');
    assert.equal(narr.snapshot.content.speaker, '');
    assert.equal(narr.snapshot.content.displayText, '小林海斗静静地看着窗外。');
    host2.destroy();
});

test('gate:scene:igs-message-source:extracts-scene-directives-from-fallback-text', () => {
    const payload = buildIgsTextPayload({
        text: '[igs-scene:B班教室|下午|晴天]\n[igs-char:小林海斗|平静|できるもん！]',
    }, {
        sceneAssets: { enabled: true },
    });

    assert.equal(payload.sceneDirectives.length, 2);
    assert.equal(payload.sceneDirectives[0].type, 'scene');
    assert.equal(payload.sceneDirectives[0].scene, 'B班教室');
    assert.equal(payload.sceneDirectives[1].type, 'char');
    assert.equal(payload.sceneDirectives[1].character, '小林海斗');
    assert.equal(payload.sceneDirectives[1].mood, '平静');
});

test('gate:igs-ui:reader-host-skips-empty-scene-text-and-falls-back-to-readable-text', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.3.20',
            bridge: { openMode: 'pc', showToasts: true },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    const opened = host.openReader({
        messageId: 99,
        scene: {
            speaker: '艾莉',
            text: '',
        },
        formattedText: '可读正文',
    }, { mode: 'pc' });

    assert.equal(opened.ok, true);
    assert.equal(opened.snapshot.content.text, '可读正文');
    assert.equal(opened.snapshot.content.displayText, '艾莉: 可读正文');
    host.destroy();
});

test('gate:igs-ui:reader-host-keeps-one-line-multi-sentence-on-a-single-page', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.3.20',
            bridge: { openMode: 'pc', showToasts: true },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    const opened = host.openReader({
        messageId: 100,
        scene: {
            speaker: '艾莉',
            text: '第一句。 第二句。',
        },
    }, { mode: 'pc' });

    assert.equal(opened.ok, true);
    assert.deepEqual(opened.snapshot.content.segments, ['第一句。 第二句。']);
    assert.equal(opened.snapshot.content.progress, '1 / 1');
    host.destroy();
});

test('gate:igs-ui:reader-host-splits-single-newline-paragraphs-into-multiple-pages', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.3.20',
            bridge: { openMode: 'pc', showToasts: true },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    const opened = host.openReader({
        messageId: 101,
        scene: {
            speaker: '艾莉',
            text: '第一段。\n第二段。',
        },
    }, { mode: 'pc' });

    assert.equal(opened.ok, true);
    assert.deepEqual(opened.snapshot.content.segments, ['第一段。', '第二段。']);
    assert.equal(opened.snapshot.content.progress, '1 / 2');
    host.destroy();
});

test('gate:scene:igs-message-source:clean-narrative-source-strips-host-ui-tags', () => {
    const cleaned = cleanNarrativeSource(readJson('fixtures/tavern/host-ui-leak-message.json').text);

    assert.equal(cleaned.includes('<div'), false);
    assert.equal(cleaned.includes('<button'), false);
    assert.equal(cleaned.includes('API Connections'), true);
});

test('gate:visual:generated image scene selects generated-first mode', () => {
    const mode = resolveVisualMode({ generatedImage: { value: 'placeholder://image' } });
    assert.equal(mode, VISUAL_MODES.GENERATED_FIRST);
});

test('gate:visual-reader-state:normalizes-settings', () => {
    const fixture = {
        mode: 'web',
        isMobile: true,
        viewport: { width: 844, height: 390 },
        readerSettings: {
            fontSize: 15,
            toolbarPlacement: 'bottom-right',
            toolbarDirection: 'auto',
            showAvatar: true,
        },
    };

    const state = createReaderState(fixture);
    assert.equal(state.layout, 'mobile-landscape');
    assert.equal(state.toolbarLayout, 'vertical');
    assert.equal(state.toolbarPlacement, 'bottom-right');
    assert.equal(state.avatarVisible, true);
    assert.equal(state.cssVars['--igs-dialogue-font-size'], '15px');
    assert.equal(state.attributes['data-igs-dialogue-style'], 'panel');
});

test('gate:visual-responsive-layout:desktop-portrait-landscape', () => {
    assert.equal(getResponsiveLayout({ width: 1280, height: 720 }, { mode: 'pc' }), 'desktop');
    assert.equal(getResponsiveLayout({ width: 390, height: 844 }, { mode: 'web', isMobile: true }), 'mobile-portrait');
    assert.equal(getResponsiveLayout({ width: 844, height: 390 }, { mode: 'fullscreen', isMobile: true }), 'mobile-landscape');
});

test('gate:visual-stage-model:exposes-stable-stage-shape', () => {
    const readerState = createReaderState({
        mode: 'pc',
        viewport: { width: 1280, height: 720 },
        readerSettings: { fontSize: 18, toolbarDirection: 'horizontal' },
    });
    const stage = createStageModel({
        speaker: '艾莉',
        text: '我们到了。',
        background: { id: 'bg.library' },
        character: { id: 'char.eli.smile' },
        visualMode: 'background-character',
    }, readerState);

    assert.equal(stage.type, 'igs-stage-model');
    assert.equal(stage.layers.background.visible, true);
    assert.equal(stage.layers.generated.visible, false);
    assert.equal(stage.layers.dialogue.text, '我们到了。');
    assert.equal(stage.layers.hud.toolbar.layout, 'horizontal');
});

test('gate:prompts:nai request builder renders prompt context', () => {
    const adapter = createPromptAdapter({ nai: naiRequestBuilder });
    const context = adapter.createPromptContext({ speaker: '艾莉', location: '图书馆' });
    const result = adapter.buildRequest(
        'nai',
        context,
        { data: { prompt: '{{speaker}} in {{location}}', negativePrompt: 'low quality' } },
        { data: { model: 'nai-diffusion-test' } },
    );

    assert.equal(result.ok, true);
    assert.equal(result.request.prompt, '艾莉 in 图书馆');
    assert.equal(result.request.model, 'nai-diffusion-test');
});

test('gate:api:public api attaches stable global aliases', async () => {
    const globalObject = {};
    const api = createPublicApi({
        version: '0.3.20',
        refresh: async () => ({ ok: true }),
        typeAndSend: async () => ({ ok: true }),
        getState: () => ({ config: { mode: 'test' } }),
        destroy: () => ({ ok: true }),
    });

    attachPublicApi(globalObject, api);
    assert.equal(globalObject.IGS, api);
    assert.equal(globalObject.ImmersiveGalgameSystem, api);
    assert.equal(api.api.imageProviders.register({ id: 'provider.fake' }).ok, true);
    assert.equal(api.api.imageProviders.list().length, 1);
    assert.equal(api.api.textFilterPresets.register(readJson('fixtures/text/text-filter-preset.json')).ok, true);
    assert.equal(typeof api.api.textFilterPresets.setCurrent, 'function');
    assert.equal(api.api.textFilterPresets.setCurrent('preset.text-filter.content-only').ok, true);
    assert.equal(api.api.textFilterPresets.getCurrent().id, 'preset.text-filter.content-only');
    assert.equal(api.api.textFilterPresets.exportAll().type, 'igs-import-bundle');
    assert.equal(api.ensureMagicWandEntry().reason, 'magic-wand-entry-not-mounted');
});

test('gate:host:tavern-helper-adapter-detects-user-messages-from-role-flags-and-dom', async () => {
    const domUserMessage = {
        getAttribute(name) {
            if (name === 'is_user') return 'true';
            return null;
        },
    };
    const messages = [
        { id: 1, text: '玩家发言', role: 'user' },
        { id: 2, text: '玩家发言 2', is_user: 'true' },
        { id: 3, text: '玩家发言 3', element: domUserMessage },
        { id: 4, text: '旁白发言' },
    ];
    const adapter = createTavernHelperAdapter({
        TavernHelper: {
            getLastMessageId: () => 4,
            getChatMessages: () => messages,
        },
        document: {
            querySelectorAll: () => [],
        },
    });

    const normalized = await adapter.listMessages();

    assert.equal(normalized[0].isUser, true);
    assert.equal(normalized[1].isUser, true);
    assert.equal(normalized[2].isUser, true);
    assert.equal(normalized[3].isUser, false);
});

test('gate:generated-images:image-api-client-fetch-models-parses-nested-payload', async () => {
    const calls = [];
    const result = await fetchImageModels({
        endpoint: 'https://example.com/v1',
        apiKey: 'demo-token',
    }, {
        fetch: async (url, options = {}) => {
            calls.push({ url, options });
            return new Response(JSON.stringify({
                data: [
                    { id: 'nai-diffusion-3' },
                    { name: 'nai-diffusion-4-curated-preview' },
                ],
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        },
    });

    assert.equal(result.ok, true);
    assert.equal(result.count, 2);
    assert.deepEqual(result.models, ['nai-diffusion-3', 'nai-diffusion-4-curated-preview']);
    assert.equal(calls[0].url, 'https://example.com/v1/models');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer demo-token');
});

test('gate:generated-images:image-api-client-generates-and-polls-pending-task', async () => {
    const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Zq4cAAAAASUVORK5CYII=';
    const calls = [];
    const result = await generateImageFromApi({
        prompt: 'moon lake',
    }, {
        endpoint: 'https://example.com/v1',
        apiKey: 'demo-token',
        mode: 'nai',
        pollIntervalMs: 1,
        pollAttempts: 2,
    }, {
        fetch: async (url, options = {}) => {
            calls.push({ url, options });
            if (String(url).endsWith('/images/generations')) {
                return new Response(JSON.stringify({
                    status: 'pending',
                    status_url: '/tasks/1',
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            return new Response(JSON.stringify({
                data: [
                    { b64_json: base64Image },
                ],
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        },
        setTimeout(callback) {
            callback();
            return 1;
        },
        clearTimeout() {},
    });

    assert.ok(result.url.startsWith('data:image/png;base64,'));
    assert.equal(calls[0].url, 'https://example.com/v1/images/generations');
    assert.equal(calls[1].url, 'https://example.com/tasks/1');
});

test('gate:generated-images:image-api-client-parses-zip-image-response', async () => {
    const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8ffff3f0005fe02fea57d7fa60000000049454e44ae426082', 'hex');
    const zipBytes = buildStoredZip('scene.png', pngBytes);
    const result = await generateImageFromApi({
        prompt: 'zip image',
    }, {
        endpoint: 'https://example.com/v1',
        mode: 'nai',
    }, {
        fetch: async () => new Response(zipBytes, {
            status: 200,
            headers: { 'content-type': 'application/zip' },
        }),
    });

    assert.ok(result.url.startsWith('data:image/png;base64,'));
});

test('gate:generated-images:reader-image-service-prefers-slot-binding-over-scan-order', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const service = createReaderImageService({
        providers: [
            {
                id: 'test.slot-provider',
                async detect() {
                    return true;
                },
                extractImages() {
                    return [{
                        url: 'https://example.com/slot-3.png',
                        slotIndex: 2,
                    }];
                },
            },
        ],
    });

    const imageState = await service.collect({
        messageId: 77,
        message: { id: 77, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 2,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.count, 6);
    assert.equal(imageState.currentIndex, 2);
    assert.equal(imageState.displayUrl, 'https://example.com/slot-3.png');
    assert.equal(imageState.slots[2].url, 'https://example.com/slot-3.png');
    assert.equal(imageState.slots.filter((slot) => slot.url).length, 1);
    assert.equal(imageState.unboundImages.length, 0);
});

test('gate:generated-images:reader-image-service-keeps-single-unnumbered-image-unbound-with-image-tags', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const service = createReaderImageService({
        providers: [
            {
                id: 'test.unnumbered-provider',
                async detect() {
                    return true;
                },
                extractImages() {
                    return [{
                        url: 'https://example.com/latest-visible-image.png',
                    }];
                },
            },
        ],
    });

    const imageState = await service.collect({
        messageId: 80,
        message: { id: 80, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 0,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.count, 6);
    assert.equal(imageState.currentIndex, 0);
    assert.equal(imageState.currentUrl, '');
    assert.equal(imageState.displayUrl, '');
    assert.equal(imageState.boundCount, 0);
    assert.equal(imageState.unboundCount, 1);
    assert.equal(imageState.availableCount, 1);
    assert.equal(imageState.slots.filter((slot) => slot.url).length, 0);
    assert.equal(imageState.unboundImages[0].url, 'https://example.com/latest-visible-image.png');
});

test('gate:generated-images:reader-image-service-orders-multiple-unkeyed-provider-images-into-slots', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const service = createReaderImageService({
        providers: [
            {
                id: 'test.unkeyed-multi-provider',
                async detect() {
                    return true;
                },
                extractImages() {
                    return [
                        { url: 'https://example.com/chami-a.png', order: 1 },
                        { url: 'https://example.com/chami-b.png', order: 2 },
                    ];
                },
            },
        ],
    });

    const imageState = await service.collect({
        messageId: 81,
        message: { id: 81, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 0,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.boundCount, 2);
    assert.equal(imageState.slots[0].url, 'https://example.com/chami-a.png');
    assert.equal(imageState.slots[1].url, 'https://example.com/chami-b.png');
    assert.equal(imageState.unboundCount, 0);
});

test('gate:generated-images:reader-image-service-does-not-show-later-slot-on-first-segment', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const service = createReaderImageService({
        providers: [
            {
                id: 'test.slot-provider',
                async detect() {
                    return true;
                },
                extractImages() {
                    return [{
                        url: 'https://example.com/slot-6.png',
                        slotIndex: 5,
                    }];
                },
            },
        ],
    });

    const imageState = await service.collect({
        messageId: 78,
        message: { id: 78, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 0,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.count, 6);
    assert.equal(imageState.currentIndex, 0);
    assert.equal(imageState.currentUrl, '');
    assert.equal(imageState.displayUrl, '');
    assert.equal(imageState.slots[5].url, 'https://example.com/slot-6.png');
});

test('gate:generated-images:reader-image-service-keeps-global-generic-images-out-when-message-scope-is-required', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const leakedImage = createFakeImageNode('https://example.com/role-card.png');
    const globalDocument = {
        querySelectorAll(selector) {
            if (
                selector === '.mes_text img[src]'
                || selector === '.mes_text img[data-src]'
                || selector === 'img[src]'
                || selector === 'img[data-src]'
                || selector === 'img[src^="blob:"]'
                || selector === 'img[src^="data:image"]'
                || selector === 'video'
                || selector === 'a[href^="blob:"]'
                || selector === 'a[href^="data:image"]'
                || selector === '[style*="background-image"]'
            ) {
                return [leakedImage];
            }
            return [];
        },
    };
    const service = createReaderImageService({
        global: {
            document: globalDocument,
        },
    });

    const imageState = await service.collect({
        messageId: 79,
        message: { id: 79, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 0,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.scopeKind, 'message');
    assert.equal(imageState.scopeOk, false);
    assert.equal(imageState.reason, 'message-scope-not-found');
    assert.equal(imageState.currentUrl, '');
    assert.equal(imageState.displayUrl, '');
    assert.equal(imageState.unboundImages.length, 0);
    assert.equal(imageState.diagnostics.providerCounts.generic, 0);
});

test('gate:host:ensure-message-image-placeholders-reuses-owned-placeholder', () => {
    const mesText = createTestMesTextRoot();
    const message = {
        element: {
            getAttribute() {
                return null;
            },
            querySelector(selector) {
                return selector === '.mes_text' ? mesText : null;
            },
        },
    };
    const slots = [
        { rawBlock: '<image>[图 1]\nimage###one###</image>' },
        { rawBlock: '<image>[图 2]\nimage###two###</image>' },
    ];

    const first = ensureMessageImagePlaceholders(message, slots);
    const second = ensureMessageImagePlaceholders(message, slots);

    assert.equal(first.ok, true);
    assert.equal(first.reason, 'placeholder-injected');
    assert.equal(second.ok, true);
    assert.equal(second.reason, 'placeholder-present');
    assert.equal(mesText.children.length, 2);
    assert.equal(mesText.children[0].getAttribute('data-igs-image-placeholder'), '1');
    assert.equal(mesText.children[0].getAttribute('data-igs-image-slot'), '0');
    assert.equal(mesText.children[1].getAttribute('data-igs-image-slot'), '1');
    assert.match(mesText.children[0].textContent, /image###one###/);
    assert.match(mesText.children[1].textContent, /image###two###/);
});

test('gate:host:tavern-helper-adapter-uses-hide-state-fallback-for-hidden-messages', async () => {
    const messages = [
        { id: 0, text: '玩家', role: 'user' },
        { id: 1, text: '隐藏楼层' },
        { id: 2, text: '可见楼层' },
    ];
    const adapter = createTavernHelperAdapter({
        TavernHelper: {
            getLastMessageId: () => 2,
            getChatMessages(_range, options = {}) {
                if (options.hide_state === 'hidden') {
                    return [{ message_id: 1 }];
                }
                return messages;
            },
        },
        document: {
            querySelectorAll: () => [],
        },
    });

    const normalized = await adapter.listMessages();
    const current = await adapter.getCurrentMessage();

    assert.equal(normalized[1].isHidden, true);
    assert.equal(current.id, 2);
});

test('gate:host:tavern-helper-adapter-falls-back-to-sillytavern-context-chat', async () => {
    const adapter = createTavernHelperAdapter({
        SillyTavern: {
            getContext() {
                return {
                    chat: [
                        { mes: '玩家发言', is_user: true },
                        { mes: '第一条 AI 楼层' },
                        { mes: '隐藏楼层', is_hidden: true },
                        { mes: '第二条 AI 楼层' },
                    ],
                };
            },
        },
        document: {
            querySelectorAll: () => [],
        },
    });

    const current = await adapter.getCurrentMessage();
    const hidden = await adapter.getMessageById(2);

    assert.equal(current.id, 3);
    assert.equal(current.text, '第二条 AI 楼层');
    assert.equal(hidden.isHidden, true);
});

test('gate:host:tavern-helper-adapter-type-and-send-falls-back-to-host-dom', async () => {
    const events = [];
    let sentValue = null;
    const textarea = {
        tagName: 'TEXTAREA',
        value: '',
        dispatchEvent(event) { events.push(event.type); return true; },
    };
    const sendButton = {
        click() { sentValue = textarea.value; },
    };
    const doc = {
        querySelector(selector) {
            if (selector === '#send_textarea') return textarea;
            if (selector === '#send_but') return sendButton;
            return null;
        },
        querySelectorAll: () => [],
    };
    const adapter = createTavernHelperAdapter({
        TavernHelper: { triggerSlash: () => {} },
        document: doc,
    });

    const result = await adapter.typeAndSend('选择：继续调查');

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'host-dom-send');
    assert.equal(sentValue, '选择：继续调查');
    assert.ok(events.includes('input'));
});

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function buildStoredZip(filename, bytes) {
    const nameBytes = Buffer.from(String(filename || ''), 'utf8');
    const dataBytes = Buffer.from(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(dataBytes.length, 18);
    header.writeUInt32LE(dataBytes.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    return Buffer.concat([header, nameBytes, dataBytes]);
}

function createFakeImageNode(url) {
    return {
        tagName: 'IMG',
        src: url,
        currentSrc: url,
        ownerDocument: null,
        className: '',
        style: {
            backgroundImage: '',
        },
        getAttribute() {
            return null;
        },
        closest() {
            return null;
        },
        querySelector() {
            return null;
        },
    };
}

function createTestMesTextRoot() {
    const children = [];
    return {
        ownerDocument: {
            createElement() {
                return createTestElement();
            },
        },
        children,
        appendChild(node) {
            node.parentNode = this;
            node.parentElement = this;
            children.push(node);
            return node;
        },
        dispatchEvent() {
            return true;
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            const owned = children.filter((child) => {
                const hasOwnedClass = String(child.className || '').split(/\s+/).includes('igs-image-placeholder');
                const hasOwnedAttr = child.getAttribute && child.getAttribute('data-igs-image-placeholder') === '1';
                const hasLegacyClass = String(child.className || '').split(/\s+/).includes('igs-img-ph');
                return selector === '[data-igs-image-placeholder="1"], .igs-image-placeholder'
                    ? hasOwnedClass || hasOwnedAttr
                    : selector === '.igs-img-ph'
                        ? hasLegacyClass
                        : false;
            });
            return owned;
        },
    };
}

function createTestElement() {
    const attributes = new Map();
    return {
        className: '',
        style: {},
        textContent: '',
        parentNode: null,
        parentElement: null,
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.has(name) ? attributes.get(name) : null;
        },
        remove() {
            if (!this.parentNode || !Array.isArray(this.parentNode.children)) return;
            const index = this.parentNode.children.indexOf(this);
            if (index >= 0) this.parentNode.children.splice(index, 1);
            this.parentNode = null;
            this.parentElement = null;
        },
    };
}

test('gate:generated-images:chami-provider-extracts-images-from-indexeddb-by-id-order', async () => {
    function fakeImg(id, hash) {
        const attrs = { 'data-image-id': String(id), 'data-location-hash': hash, 'data-is-loaded': 'false', class: 'tsp-generated-image' };
        return { getAttribute: (name) => (name in attrs ? attrs[name] : null) };
    }
    // DOM order scrambled: 70, 69, 71
    const nodes = [fakeImg(70, 'hash70'), fakeImg(69, 'hash69'), fakeImg(71, 'hash71')];
    const root = { querySelectorAll: (sel) => (sel === '.tsp-generated-image' ? nodes.slice() : []) };
    const records = {
        69: { id: 69, locationHash: 'hash69', imageData: 'data:image/png;base64,AAA69' },
        70: { id: 70, locationHash: 'hash70', imageData: 'data:image/png;base64,AAA70' },
        71: { id: 71, locationHash: 'hash71', imageData: 'data:image/png;base64,AAA71' },
    };
    const requestedBatches = [];
    const globalObject = {
        TavernScenePlugin: {
            db: {
                async getImageDataBatch(ids) {
                    requestedBatches.push(ids.slice());
                    return ids.map((id) => records[id]).filter(Boolean);
                },
            },
        },
    };

    const images = await chamiProvider.extractImages({ roots: [root], global: globalObject, scopePolicy: {} });

    assert.equal(images.length, 3);
    // batch requested in ascending id order regardless of scrambled DOM order
    assert.deepEqual(requestedBatches[0], [69, 70, 71]);
    // order field equals imageId so downstream sorts correctly
    assert.deepEqual(images.map((i) => i.order), [69, 70, 71]);
    assert.deepEqual(images.map((i) => i.url), [
        'data:image/png;base64,AAA69',
        'data:image/png;base64,AAA70',
        'data:image/png;base64,AAA71',
    ]);
    assert.equal(images[0].source, 'provider-db');
    assert.equal(images[0].locationHash, 'hash69');
});

test('gate:generated-images:chami-provider-falls-back-to-dom-when-db-unavailable', async () => {
    const root = { querySelectorAll: () => [] };
    const images = await chamiProvider.extractImages({ roots: [root], global: {}, scopePolicy: {} });
    assert.ok(Array.isArray(images));
    assert.equal(images.length, 0);
});

test('gate:choices:option-table finds 同名表 and extracts text column', () => {
    const tables = [
        { uid: 'sheet_1', name: '主角信息表', columns: ['row_id', '名称'], rows: [['1', '望月']] },
        { uid: 'sheet_2', name: '选项表', columns: ['row_id', '选项内容'], rows: [['1', '报警'], ['2', '找工具'], ['3', '报警'], ['4', '']] },
    ];
    const table = findOptionTable(tables);
    assert.ok(table);
    assert.equal(table.name, '选项表');
    const items = extractOptionTexts(table);
    // 跳过 row_id 列、去空、去重（两个"报警"只保留一个）；返回 {display,send} 对象
    assert.deepEqual(items, [{ display: '报警', send: '报警' }, { display: '找工具', send: '找工具' }]);
});

test('gate:choices:option-table extracts wide option rows', () => {
    const table = {
        uid: 'sheet_2',
        name: '选项表',
        columns: ['row_id', '选项一', '选项二', '选项三', '选项四'],
        rows: [['1', '报警', '找工具', '原地等待', '离开']],
    };
    assert.deepEqual(extractOptionTexts(table), [
        { display: '报警', send: '报警' },
        { display: '找工具', send: '找工具' },
        { display: '原地等待', send: '原地等待' },
        { display: '离开', send: '离开' },
    ]);
});

test('gate:choices:option-table 检定建议表 only extracts 展示文本 column', () => {
    const table = {
        uid: 'sheet_3',
        name: '检定建议表',
        columns: ['row_id', '展示文本', '对抗', '角色', '属性'],
        rows: [
            ['1', '力量对抗试试看', '对抗', '哪吒', '力量'],
            ['2', '用话术周旋', '对抗', '白墨', '话术'],
        ],
    };
    // 多业务字段表只取「展示文本」列，display===send（无骰子命令列）。
    assert.deepEqual(extractOptionTexts(table), [
        { display: '力量对抗试试看', send: '力量对抗试试看' },
        { display: '用话术周旋', send: '用话术周旋' },
    ]);
});

test('gate:choices:option-table 检定建议表 appends 骰子命令 to send', () => {
    const table = {
        uid: 'sheet_4',
        name: '检定建议表',
        columns: ['row_id', '展示文本', '骰子命令'],
        rows: [
            ['1', '力量对抗试试看', '对抗 哪吒 力量 vs 白墨 力量'],
            ['2', '用话术周旋', '检定 白墨 话术 [难度=困难]'],
            ['3', '静观其变', ''],
        ],
    };
    // 有骰子命令列时 send = 展示文本 + 空格 + 骰子命令；骰子命令为空时 send===display。
    assert.deepEqual(extractOptionTexts(table), [
        { display: '力量对抗试试看', send: '力量对抗试试看 对抗 哪吒 力量 vs 白墨 力量' },
        { display: '用话术周旋', send: '用话术周旋 检定 白墨 话术 [难度=困难]' },
        { display: '静观其变', send: '静观其变' },
    ]);
});

test('gate:choices:option-table accepts 选项/行动选项 aliases', () => {
    assert.deepEqual(OPTION_TABLE_NAMES, ['选项', '选项表', '行动选项', '检定建议表']);
    for (const name of ['选项', '行动选项', '检定建议表']) {
        const t = findOptionTable([{ uid: 'sheet_1', name, columns: ['row_id', 'x'], rows: [['1', 'A']] }]);
        assert.ok(t, `应命中表名 ${name}`);
    }
    assert.equal(findOptionTable([{ uid: 'sheet_1', name: '其他表', columns: [], rows: [] }]), null);
});

test('gate:choices:readOptionItems returns empty when api/table missing', () => {
    assert.deepEqual(readOptionItems(null), []);
    const noApiClient = { readTables: () => ({ ok: false, reason: 'missing-api' }) };
    assert.deepEqual(readOptionItems(noApiClient), []);
    const noTableClient = { readTables: () => ({ ok: true, data: { sheet_1: { uid: 'sheet_1', name: '别的表', content: [['row_id']] } } }) };
    assert.deepEqual(readOptionItems(noTableClient), []);
});
