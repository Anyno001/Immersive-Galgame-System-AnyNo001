import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { collectFeedPosts, STORM_DEFAULT_PROMPT } from '../src/scene/feed-platforms.js';
import { createStormHistoryScanner, readStormCarry, resolveStormContextFromHistory, withStormCarry } from '../src/scene/storm-context.js';
import { detectPromptTriggers } from '../src/scene/prompt-triggers.js';
import { feedGrammarBlocks, resolveFeedPromptRule } from '../src/visual/igs-ui/feed-prompt.js';
import { normalizeFeedFxSettings, stormPromptOf } from '../src/visual/igs-ui/feed-settings.js';
import { renderFeedFields } from '../src/visual/igs-ui/feed-settings-fields.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';

const fxBlock = (title, lines, intro = '') => `【${title}】${intro}\n${lines.join('\n')}`;

test('storm:parse:storm-mention-end-and-red-black-defaults', () => {
    assert.deepEqual(parseFxBody('storm|微博|黑|#某某塌房#'), { kind: 'storm', end: false, args: ['weibo', 'black', '#某某塌房#'] });
    assert.deepEqual(parseFxBody('storm|微博|红|热搜'), { kind: 'storm', end: false, args: ['weibo', 'red', '热搜'] });
    assert.equal(parseFxBody('storm|微博|乱写|x').args[1], 'red', '写错按红');
    assert.equal(parseFxBody('storm|微博').args[1], 'red', '缺省按红');
    assert.equal(parseFxBody('storm|不认识的平台|黑|x').args[0], '', '认不出平台留空');
    assert.deepEqual(parseFxBody('storm-end'), { kind: 'storm', end: true, args: [] });
    assert.deepEqual(parseFxBody('mention|路人|@她 好甜'), { kind: 'mention', end: false, args: ['路人', '@她 好甜'] });
    assert.equal(parseFxBody('mention|路人|'), null);
    assert.equal(parseFxBody('mention|甲|' + '字'.repeat(200)).args[1].length, 140);
});

function docOf(lines) {
    const text = lines.join('\n');
    return { text, directives: extractFxDirectives(text) };
}

test('storm:resolve:accumulates-fresh-caps-at-12-and-null-outside', () => {
    const lines = ['开头', '[igs-fx:storm|微博|黑|热搜]'];
    for (let i = 1; i <= 15; i++) lines.push(`[igs-fx:mention|网友${i}|第${i}条]`);
    lines.push('[igs-fx:storm-end]', '结尾');
    const { text, directives } = docOf(lines);
    const end = text.indexOf('[igs-fx:storm-end]');
    const mid = text.indexOf('[igs-fx:mention|网友13');
    const r = resolveFxAtPage(directives, end - 1, mid - 1);
    assert.equal(r.storm.platform, 'weibo');
    assert.equal(r.storm.tone, 'black');
    assert.equal(r.storm.topic, '热搜');
    assert.equal(r.storm.mentions.length, 12);
    assert.equal(r.storm.mentions[0].author, '网友4');
    assert.equal(r.storm.mentions[11].author, '网友15');
    assert.deepEqual(r.storm.mentions.map((m) => m.fresh).slice(-3), [true, true, true]);
    assert.equal(r.storm.mentions[0].fresh, false);
    assert.equal(resolveFxAtPage(directives, text.length, 0).storm, null, 'storm-end 之后');
    assert.equal(resolveFxAtPage(directives, 1, -1).storm, null, 'storm 之前');
    const early = resolveFxAtPage(directives, text.indexOf('[igs-fx:mention|网友2') + 5, -1);
    assert.equal(early.storm.mentions.length, 2);
    assert.equal(resolveFxAtPage([], 5).storm, null);
});

test('storm:carry:inherits-until-end-and-quiet-floors', () => {
    assert.equal(readStormCarry('普通正文'), null);
    assert.deepEqual(readStormCarry('[igs-fx:storm|微博|黑|热搜]\n[igs-fx:mention|甲|骂]'), { storm: { platform: 'weibo', tone: 'black', topic: '热搜' } });
    assert.deepEqual(readStormCarry('[igs-fx:mention|甲|骂]'), { active: true });
    assert.deepEqual(readStormCarry('[igs-fx:storm|微博|红|x]\n[igs-fx:storm-end]'), { storm: null });
    const started = '[igs-fx:storm|微博|红|热搜]';
    const mentionOnly = '[igs-fx:mention|甲|好]';
    // 近的在前：只有 mention 的楼层继续往前找，找到开始标签即继承。
    assert.deepEqual(resolveStormContextFromHistory([{ text: mentionOnly }, { text: mentionOnly }, { text: started }]), { platform: 'weibo', tone: 'red', topic: '热搜' });
    assert.equal(resolveStormContextFromHistory([{ text: '[igs-fx:storm-end]' }, { text: started }]), null, '最近是平息');
    // 连续 4 个 AI 楼层没有任何标签视为平息，3 个还算。
    assert.equal(resolveStormContextFromHistory([{ text: '甲' }, { text: '乙' }, { text: '丙' }, { text: '丁' }, { text: started }]), null);
    assert.ok(resolveStormContextFromHistory([{ text: '甲' }, { text: '乙' }, { text: '丙' }, { text: started }]));
    // 用户楼层不计入安静楼层，也不中断。
    assert.ok(resolveStormContextFromHistory([{ text: '甲' }, { isUser: true, text: '继续' }, { text: '乙' }, { text: '丙' }, { text: started }]));
    // 最多读 20 条。
    const scanner = createStormHistoryScanner();
    let stopped = 0;
    for (let i = 0; i < 25; i++) { stopped = i; if (scanner.push({ isUser: true, text: '嗯' })) break; }
    assert.equal(stopped, 19);
});

test('storm:carry:withStormCarry-adds-offset-0-directive-without-mentions', () => {
    const own = extractFxDirectives('开头\n[igs-fx:mention|甲|在吗]\n[igs-fx:storm-end]');
    const list = withStormCarry(own, { platform: 'weibo', tone: 'black', topic: '热搜' });
    assert.equal(list[0].offset, 0);
    assert.equal(list.length, own.length + 1);
    assert.equal(withStormCarry(own, null), own);
    const text = '开头\n[igs-fx:mention|甲|在吗]\n[igs-fx:storm-end]\n结尾';
    const r = resolveFxAtPage(list, text.indexOf('[igs-fx:mention') + 3, -1);
    assert.equal(r.storm.tone, 'black');
    assert.equal(r.storm.mentions.length, 1, '只有本楼的评论');
    assert.equal(resolveFxAtPage(list, text.length, -1).storm, null);
    assert.equal(resolveFxAtPage(withStormCarry([], { platform: '', tone: 'red', topic: '' }), 3, -1).storm.mentions.length, 0);
});

test('storm:prompt:follows-switches-and-custom-text', () => {
    const rs = { feedFx: { enabled: true, mentioned: [], storm: { enabled: true } } };
    const [on] = feedGrammarBlocks(rs, fxBlock);
    assert.match(on.full, /storm\|平台\|红或黑\|热搜词 … storm-end/);
    assert.match(on.full, /mention\|网友\|内容/);
    assert.ok(on.full.includes(STORM_DEFAULT_PROMPT));
    assert.match(on.index, /storm/);
    const [off] = feedGrammarBlocks({ feedFx: { enabled: true, mentioned: [], storm: { enabled: false } } }, fxBlock);
    assert.doesNotMatch(off.full, /storm|mention/);
    const [custom] = feedGrammarBlocks({ feedFx: { enabled: true, mentioned: [], storm: { prompt: '只写骂的' } } }, fxBlock);
    assert.match(custom.full, /舆论风暴：只写骂的/);
    assert.ok(!custom.full.includes(STORM_DEFAULT_PROMPT));
    const legacy = resolveFeedPromptRule({ feedFx: { enabled: true } });
    assert.match(legacy, /\[igs-fx:storm\|平台\|红或黑\|热搜词\] … \[igs-fx:storm-end\]/);
    assert.match(legacy, /\[igs-fx:mention\|网友\|内容\]/);
    assert.doesNotMatch(resolveFeedPromptRule({ feedFx: { enabled: true, storm: { enabled: false } } }), /storm/);
    assert.ok(detectPromptTriggers({ recentAiTexts: ['[igs-fx:mention|甲|x]'] }).has('feed'));
    assert.ok(detectPromptTriggers({ userText: '她塌房了' }).has('feed'));
    assert.ok(detectPromptTriggers({ recentAiTexts: ['[igs-fx:storm|微博|红|x]\n正文', '一', '二', '三'], lookback: 3 }).has('feed'), '未平息的风暴继续展开');
});

test('storm:settings:normalize-reset-and-render', () => {
    const d = normalizeFeedFxSettings(undefined);
    assert.deepEqual(d.storm, { enabled: true, prompt: '' });
    assert.equal(stormPromptOf(d), STORM_DEFAULT_PROMPT);
    assert.equal(normalizeFeedFxSettings({ storm: { enabled: false } }).storm.enabled, false);
    assert.equal(normalizeFeedFxSettings({ storm: { prompt: STORM_DEFAULT_PROMPT } }).storm.prompt, '', '等于默认存空');
    const mine = normalizeFeedFxSettings({ storm: { prompt: ' 我的写法 ' } });
    assert.equal(mine.storm.prompt, '我的写法');
    assert.equal(stormPromptOf(mine), '我的写法');
    assert.equal(normalizeSettingsValue('readerSettings.feedFx.storm.enabled', 'false'), false);
    assert.equal(normalizeSettingsValue('readerSettings.feedFx.storm.enabled', '1'), true);
    const html = renderFeedFields({ feedFx: { enabled: true, storm: { prompt: '我的写法' } } });
    assert.match(html, /舆论风暴/);
    assert.ok(html.includes('data-switch="readerSettings.feedFx.storm.enabled"'));
    assert.ok(html.includes('data-path="readerSettings.feedFx.storm.prompt"'));
    assert.ok(html.includes('data-action="feed-storm-prompt-reset"'));
    assert.ok(html.indexOf('舆论风暴') < html.indexOf('平台写法'));
    assert.ok(renderFeedFields({ feedFx: { enabled: true } }).includes(STORM_DEFAULT_PROMPT.slice(0, 20)));
});

test('storm:catalog:collectFeedPosts-takes-mentions', () => {
    const raw = [
        '[igs-fx:mention|路人|storm 之外不收]',
        '[igs-fx:storm|微博|黑|#塌房#]',
        '[igs-fx:mention|网友甲|滚出娱乐圈]',
        '[igs-fx:app|朋友圈]',
        '[igs-fx:post|友|帖子|]',
        '[igs-fx:reply|乙|沙发]',
        '[igs-fx:app-end]',
        '[igs-fx:mention|网友乙|替你说话]',
        '[igs-fx:storm-end]',
        '[igs-fx:mention|丙|平息后不收]',
    ].join('\n');
    const posts = collectFeedPosts(raw);
    assert.equal(posts.length, 3);
    assert.deepEqual(posts[0], { platform: 'weibo', author: '网友甲', text: '滚出娱乐圈', extra: '#塌房#', kind: 'storm', tone: 'black', replies: [], offset: posts[0].offset });
    assert.equal(posts[1].kind, undefined);
    assert.equal(posts[1].replies.length, 1);
    assert.equal(posts[2].kind, 'storm');
    assert.equal(posts[2].author, '网友乙');
});
