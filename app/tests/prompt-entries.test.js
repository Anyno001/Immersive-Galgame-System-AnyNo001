import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePromptTriggers, defaultPromptKeywords, describePromptTrigger } from '../src/scene/prompt-triggers.js';
import { normalizePromptEntries, parsePromptKeywords } from '../src/scene/prompt-entries.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { buildPageDiagnostic } from '../src/visual/igs-ui/page-diagnostic.js';

const resolve = (opts) => resolvePromptTriggers(opts);
// 一问一答的聊天记录：pairs 为 [用户, AI] 列表，旧 → 新。
const chat = (pairs) => pairs.flatMap(([u, a]) => [{ user: true, text: u }, { user: false, text: a }]);

test('prompt-entries:defaults-match-old-behaviour', () => {
    const { hits, report } = resolve({ userText: '刷刷微博', recentAiTexts: ['她拔剑了'] });
    assert.deepEqual([...hits].sort(), ['battle', 'feed']);
    assert.equal(report.feed.word, '微博');
    assert.equal(report.feed.source, '你的输入');
    assert.equal(report.battle.source, 'AI上1楼');
});

test('prompt-entries:keywords-keep-regex-with-commas', () => {
    assert.deepEqual(parsePromptKeywords('微博、/翻.{0,2}手机/,热搜\n帖子'), ['微博', '/翻.{0,2}手机/', '热搜', '帖子']);
    assert.ok(resolve({ userText: '偷偷翻了下手机' }).hits.has('feed'));
});

test('prompt-entries:exclude-blocks-the-segment', () => {
    const entries = { live: { exclude: '直播间看过的电影' } };
    assert.equal(resolve({ userText: '聊聊直播间看过的电影', entries }).hits.has('live'), false);
    assert.equal(resolve({ userText: '去开播吧', entries }).hits.has('live'), true);
});

test('prompt-entries:secondary-requires-another-word', () => {
    const entries = { feed: { keys: '打开', secondary: '微博、朋友圈' } };
    assert.equal(resolve({ userText: '打开门', entries }).hits.has('feed'), false);
    const r = resolve({ userText: '打开朋友圈', entries });
    assert.equal(r.hits.has('feed'), true);
    assert.equal(r.report.feed.word, '打开+朋友圈');
});

test('prompt-entries:scan-zero-only-reads-user-input-but-tags-still-count', () => {
    const entries = { feed: { scan: 0 } };
    assert.equal(resolve({ userText: '嗯', recentAiTexts: ['热搜上全是她'], entries }).hits.has('feed'), false);
    assert.equal(resolve({ userText: '嗯', recentAiTexts: ['[igs-fx:post|微博|a|b]'], entries }).report.feed.reason, 'tag');
});

test('prompt-entries:sticky-keeps-block-open-for-n-turns', () => {
    const entries = { battle: { sticky: 2 } };
    const history = chat([['开战', '……'], ['嗯', '……']]);
    const r = resolve({ userText: '继续', recentAiTexts: ['……', '……'], history: [...history, { user: true, text: '继续' }], entries });
    assert.equal(r.report.battle.reason, 'sticky');
    assert.equal(r.report.battle.left, 0);
    const later = chat([['开战', '……'], ['嗯', '……'], ['嗯', '……']]);
    assert.equal(resolve({ userText: '继续', recentAiTexts: ['……'], history: later, entries }).hits.has('battle'), false);
});

test('prompt-entries:cooldown-blocks-words-but-not-open-pairs', () => {
    const entries = { battle: { cooldown: 2 } };
    // 第 1 轮命中，第 2 轮收起，第 3 轮再提「敌人」：冷却中。
    const history = chat([['开战', '……'], ['休息', '……']]);
    const r = resolve({ userText: '敌人又来了', recentAiTexts: ['……'], history, entries });
    assert.equal(r.hits.has('battle'), false);
    assert.equal(r.report.battle.reason, 'cooldown');
    assert.match(describePromptTrigger(r.report.battle), /冷却中/);
    // 未闭合的战斗标签照样展开。
    assert.equal(resolve({ userText: '敌人又来了', recentAiTexts: ['[igs-fx:battle|x]'], history, entries }).hits.has('battle'), true);
});

test('prompt-entries:always-and-off-change-the-grammar', () => {
    const readerSettings = { battleFx: { enabled: true }, liveFx: { enabled: true }, camera: { enabled: true } };
    const entries = { battle: { mode: 'always' }, live: { mode: 'off' } };
    const g = buildTagGrammar({ readerSettings, entries });
    assert.match(g.system, /【战斗】/);
    assert.doesNotMatch(g.system + g.depth0, /直播/);
    assert.match(g.system, /【按需】以下演出的完整写法在剧情需要时另附：镜头/);
    assert.ok(g.sizes.battle > 0);
    const r = resolve({ userText: '开播', entries });
    assert.equal(r.hits.has('live'), false);
    assert.equal(r.report.live.reason, 'off');
});

test('prompt-entries:settings-store-default-keywords-as-empty', () => {
    assert.equal(normalizeSettingsValue('bridge.sceneAssets.promptEntries.live.keys', defaultPromptKeywords('live')), '');
    assert.equal(normalizeSettingsValue('bridge.sceneAssets.promptEntries.live.keys', ' 开播 '), '开播');
    assert.equal(normalizeSettingsValue('bridge.sceneAssets.promptEntries.live.sticky', '99'), 10);
    assert.equal(normalizeSettingsValue('bridge.sceneAssets.promptEntries.live.mode', 'weird'), 'auto');
    assert.equal(normalizePromptEntries({ live: { scan: '0' } }).live.scan, 0);
});

test('prompt-entries:page-diagnostic-lists-reasons-and-chars', () => {
    const text = buildPageDiagnostic({ content: { segments: [] } }, {
        promptReport: { blocks: { feed: { active: true, reason: 'word', word: '热搜', source: 'AI上1楼', chars: 412 }, live: { active: false, reason: 'off' } } },
    });
    assert.match(text, /提示词按需块（共展开 412 字）/);
    assert.match(text, /社区 展开 命中「热搜」（AI上1楼） · 412 字/);
    assert.match(text, /直播 已关闭/);
});

test('prompt-entries: 泛指社交媒体也点亮手机社区', () => {
    for (const userText of ['我拿起手机看看社交媒体', '上网看看大家怎么说', '刷到一条知乎回答']) {
        assert.ok(resolve({ userText }).hits.has('feed'), userText);
    }
});
