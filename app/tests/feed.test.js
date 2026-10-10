import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { applyFxWorldview } from '../src/scene/fx-era.js';
import { detectPromptTriggers } from '../src/scene/prompt-triggers.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';
import { feedGrammarBlocks, resolveFeedPromptRule } from '../src/visual/igs-ui/feed-prompt.js';

const fxBlock = (title, lines, intro = '') => `【${title}】${intro}\n${lines.join('\n')}`;

test('parseFxBody parses app / post / reply and keeps long content', () => {
    assert.deepEqual(parseFxBody('app|微博'), { kind: 'app', end: false, args: ['weibo'] });
    assert.deepEqual(parseFxBody('app-end'), { kind: 'app', end: true, args: [] });
    assert.equal(parseFxBody('app|不存在的平台'), null);
    const long = '字'.repeat(100);
    const post = parseFxBody(`post|甲|${long}|#话题#`);
    assert.equal(post.kind, 'post');
    assert.equal(post.args[1].length, 100, 'not cut at 60');
    assert.equal(post.args[2], '#话题#');
    assert.deepEqual(parseFxBody('reply|乙|沙发'), { kind: 'reply', end: false, args: ['乙', '沙发'] });
});

function docOf(lines) {
    const text = lines.join('\n');
    return { text, directives: extractFxDirectives(text) };
}

test('resolveFxAtPage feed: at most 3 posts, fresh flag, null outside range', () => {
    const lines = ['开头', '[igs-fx:app|朋友圈]'];
    for (let i = 1; i <= 5; i++) lines.push(`[igs-fx:post|友${i}|第${i}条|]`, `[igs-fx:reply|路人|评${i}]`);
    lines.push('[igs-fx:app-end]', '结尾');
    const { text, directives } = docOf(lines);
    const mid = text.indexOf('[igs-fx:post|友3');
    const end = text.indexOf('[igs-fx:app-end]');
    const atEnd = resolveFxAtPage(directives, end - 1, mid - 1);
    assert.equal(atEnd.feed.platform, 'moments');
    assert.equal(atEnd.feed.posts.length, 3);
    assert.deepEqual(atEnd.feed.posts.map((p) => p.author), ['友3', '友4', '友5']);
    assert.deepEqual(atEnd.feed.posts.map((p) => p.fresh), [true, true, true]);
    assert.equal(atEnd.feed.posts[0].replies[0].text, '评3');
    const later = resolveFxAtPage(directives, end - 1, end - 2);
    assert.deepEqual(later.feed.posts.map((p) => p.fresh), [false, false, false]);
    assert.equal(resolveFxAtPage(directives, text.length, 0).feed, null, 'after app-end');
    assert.equal(resolveFxAtPage(directives, 1, -1).feed, null, 'before app');
});

test('feed tags are stripped from the displayed text', () => {
    const out = stripMarkerDirectives('前[igs-fx:app|微博]\n[igs-fx:post|甲|内容|]\n[igs-fx:app-end]后');
    assert.doesNotMatch(out, /igs-fx/);
});

test('feedGrammarBlocks lists only active platforms with custom prompts', () => {
    assert.deepEqual(feedGrammarBlocks({}, fxBlock), []);
    assert.deepEqual(feedGrammarBlocks({ feedFx: { enabled: false } }, fxBlock), []);
    const rs = { feedFx: { enabled: true, worldview: 'ancient', mentioned: ['notice', 'teahouse'], platforms: { teahouse: { enabled: true, prompt: '自定义茶馆写法' } } } };
    const [block] = feedGrammarBlocks(rs, fxBlock);
    assert.equal(block.key, 'feed');
    assert.equal(block.adaptive, true);
    assert.match(block.full, /告示（附加写张贴处）/);
    assert.match(block.full, /茶馆闲话（附加写茶馆）：自定义茶馆写法/);
    assert.doesNotMatch(block.full, /微博/);
    // 按需：只展开最近提到的平台，其余只列名字。
    const [only] = feedGrammarBlocks({ feedFx: { ...rs.feedFx, mentioned: ['teahouse'] } }, fxBlock);
    assert.match(only.full, /茶馆闲话（附加写茶馆）：自定义茶馆写法/);
    assert.doesNotMatch(only.full, /告示（附加写/);
    assert.match(only.full, /其他可用平台：告示/);
    const off = { feedFx: { enabled: true, worldview: 'ancient', platforms: { notice: { enabled: false }, teahouse: { enabled: false } } } };
    assert.deepEqual(feedGrammarBlocks(off, fxBlock), []);
    const rule = resolveFeedPromptRule(rs);
    assert.match(rule, /【手机社区】/);
    assert.match(rule, /写作 \[igs-fx:app\|平台\|主人\] 开始、\[igs-fx:app-end\] 结束：/);
    assert.match(rule, /示例：\n他停下看告示。\n\[igs-fx:app\|告示\]/);
    assert.match(rule, /自定义茶馆写法/);
    assert.equal(resolveFeedPromptRule({}), '');
});

test('buildTagGrammar folds feed into adaptive index and expands on demand', () => {
    const rs = { feedFx: { enabled: true, worldview: 'modern' } };
    const idle = buildTagGrammar({ readerSettings: rs });
    assert.match(idle.system, /【按需】.*社区/);
    assert.doesNotMatch(idle.depth0, /手机社区/);
    const hot = buildTagGrammar({ readerSettings: rs, expand: new Set(['feed']) });
    assert.match(hot.depth0, /微博/);
    const weibo = buildTagGrammar({ readerSettings: { feedFx: { enabled: true, worldview: 'modern', mentioned: ['weibo'] } }, expand: new Set(['feed']) });
    assert.match(weibo.depth0, /【手机社区】角色看微博的那一段使用。写作 \[igs-fx:app\|平台\|主人\] 开始、\[igs-fx:app-end\] 结束：/);
    assert.match(weibo.depth0, /示例：\n他掏出手机看微博。\n\[igs-fx:app\|微博\]\n\[igs-fx:post\|校园墙\|今天校门口停了辆黑车，有人看见\{\{user\}\}从车上下来。\|#校门口那辆车\]\n\[igs-fx:reply\|路过的\|我在现场，车窗还摇着\]\n\[igs-fx:reply\|不想惹事\|没看清脸就别@\{\{user\}\}\]\n\[igs-fx:post\|食堂阿姨\|糖醋排骨卖完了，明天早点来。\|#食堂日常\]\n\[igs-fx:post\|林小雨\|那辆车跟我没关系，别再传了。\|#校门口那辆车\]\n\[igs-fx:reply\|热心网友\|解释没用，截图都在传\]\n\[igs-fx:app-end\]\n他看完那几条，把手机扣在桌上。/);
});

test('prompt triggers recognise feed words and unclosed app', () => {
    assert.ok(detectPromptTriggers({ userText: '打开微博看看' }).has('feed'));
    assert.ok(detectPromptTriggers({ recentAiTexts: ['[igs-fx:app|微博]\n[igs-fx:post|甲|内容|]'] }).has('feed'));
    assert.equal(detectPromptTriggers({ recentAiTexts: ['[igs-fx:app|微博]', '[igs-fx:app-end]', '', '', ''] }).has('feed'), false);
});

test('applyFxWorldview writes worldview into feedFx without mutating input', () => {
    const input = { feedFx: { enabled: true } };
    const out = applyFxWorldview(input, 'ancient');
    assert.equal(out.feedFx.worldview, 'ancient');
    assert.equal(input.feedFx.worldview, undefined);
    const plainInput = { fxTags: {} };
    assert.equal(applyFxWorldview(plainInput, 'modern'), plainInput);
});
