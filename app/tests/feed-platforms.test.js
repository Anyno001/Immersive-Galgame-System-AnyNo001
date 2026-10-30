import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FEED_REPLY_MAX, FEED_VIEW_MAX, collectFeedPosts, foldFeedDirectives, foldStormDirectives, hasFeedPeekHint, mentionedFeedPlatforms, parseFeedBody,
} from '../src/scene/feed-platforms.js';
import { resolveFxAtPage } from '../src/scene/fx-directives.js';
import { feedGrammarBlocks, resolveFeedPromptRule } from '../src/visual/igs-ui/feed-prompt.js';

const PROMPT_BUDGET = 3150;

// 把 [{ kind, ... }] 简写成 foldFeedDirectives 吃的指令表。
function dirs(...rows) {
    return rows.map(([body, offset]) => ({ ...parseFeedBody(body), offset }));
}

test('FEED_VIEW_MAX 为 12', () => {
    assert.equal(FEED_VIEW_MAX, 12);
});

test('parseFeedBody：app / post / reply 基本写法', () => {
    assert.deepEqual(parseFeedBody('app|微博'), { kind: 'app', end: false, args: ['weibo'] });
    assert.deepEqual(parseFeedBody('app|搜索记录|林小雨'), { kind: 'app', end: false, args: ['search', '林小雨'] });
    assert.deepEqual(parseFeedBody('app-end'), { kind: 'app', end: true, args: [] });
    assert.deepEqual(parseFeedBody('post|小雨|下雨了|学校门口'), { kind: 'post', end: false, args: ['小雨', '下雨了', '学校门口'] });
    assert.deepEqual(parseFeedBody('post||匿名帖'), { kind: 'post', end: false, args: ['匿名', '匿名帖', ''] });
    assert.equal(parseFeedBody('igs-unknown|x'), undefined);
});

test('parseFeedBody：reply 第 4 栏是回复谁，可省', () => {
    assert.deepEqual(parseFeedBody('reply|陈默|照片呢'), { kind: 'reply', end: false, args: ['陈默', '照片呢', ''] });
    assert.deepEqual(parseFeedBody('reply|陈默|照片呢|林小雨'), { kind: 'reply', end: false, args: ['陈默', '照片呢', '林小雨'] });
});

test('parseFeedBody：内容里多写的竖线拼回内容', () => {
    // post：第 3 栏起到倒数第 2 栏拼回内容，最后一栏当附加
    assert.deepEqual(parseFeedBody('post|小雨|一|二|三|定位'), { kind: 'post', end: false, args: ['小雨', '一|二|三', '定位'] });
    // reply：中间拼回内容，最后一栏当回复谁
    assert.deepEqual(parseFeedBody('reply|陈默|一|二|林小雨'), { kind: 'reply', end: false, args: ['陈默', '一|二', '林小雨'] });
    assert.deepEqual(parseFeedBody('reply|陈默|一|二|三|林小雨'), { kind: 'reply', end: false, args: ['陈默', '一|二|三', '林小雨'] });
    // 恰好 4 栏的 post 不拼
    assert.deepEqual(parseFeedBody('post|小雨|内容|附加'), { kind: 'post', end: false, args: ['小雨', '内容', '附加'] });
    // app / storm / mention 不受影响
    assert.deepEqual(parseFeedBody('app|微博|林小雨|多余'), { kind: 'app', end: false, args: ['weibo', '林小雨'] });
    assert.deepEqual(parseFeedBody('storm|微博|黑|热搜|多余'), { kind: 'storm', end: false, args: ['weibo', 'black', '热搜'] });
    assert.deepEqual(parseFeedBody('mention|网友|内容|多余'), { kind: 'mention', end: false, args: ['网友', '内容'] });
});

test('parseFeedBody：坏标签', () => {
    assert.equal(parseFeedBody('app|不存在的平台'), null);
    assert.equal(parseFeedBody('post|小雨|'), null);
    assert.equal(parseFeedBody('post|小雨'), null);
    assert.equal(parseFeedBody('reply|陈默|'), null);
    assert.equal(parseFeedBody('mention|网友|'), null);
});

test('parseFeedBody：内容 140 字上限、附加 40 字、回复谁 24 字', () => {
    const long = 'a'.repeat(200);
    assert.equal(parseFeedBody(`post|小雨|${long}|${long}`).args[1].length, 140);
    assert.equal(parseFeedBody(`post|小雨|${long}|${long}`).args[2].length, 40);
    assert.equal(parseFeedBody(`reply|陈默|内容|${long}`).args[2].length, 24);
});

test('foldFeedDirectives：app 区间内收帖子，评论带回复对象', () => {
    const list = dirs(
        ['app|微博', 0], ['post|甲|第一条|话题', 10], ['reply|乙|评论一', 20], ['reply|丙|评论二|乙', 30], ['post|丁|第二条', 40], ['app-end', 50],
    );
    const feed = foldFeedDirectives(list, 45);
    assert.equal(feed.platform, 'weibo');
    assert.equal(feed.owner, '');
    assert.equal(feed.posts.length, 2);
    assert.deepEqual(feed.posts[0].replies, [{ author: '乙', text: '评论一', to: '' }, { author: '丙', text: '评论二', to: '乙' }]);
    assert.equal(feed.posts[0].extra, '话题');
    assert.equal(feed.posts[1].offset, 40);
});

test('foldFeedDirectives：区间开关，结束后与区间前返回 null', () => {
    const list = dirs(['app|微博', 10], ['post|甲|内容', 20], ['app-end', 30]);
    assert.equal(foldFeedDirectives(list, 5), null);
    assert.equal(foldFeedDirectives(list, 25).posts.length, 1);
    assert.equal(foldFeedDirectives(list, 35), null);
});

test('foldFeedDirectives：新 app 开区间清空旧帖，主人沿用 app 标签', () => {
    const list = dirs(['app|微博', 0], ['post|甲|旧帖', 5], ['app|备忘录|林小雨', 10], ['post|林小雨|新帖|草稿', 15]);
    const feed = foldFeedDirectives(list, 20);
    assert.equal(feed.platform, 'memo');
    assert.equal(feed.owner, '林小雨');
    assert.deepEqual(feed.posts.map((p) => p.text), ['新帖']);
});

test('foldFeedDirectives：同一帖子评论最多 FEED_REPLY_MAX 条；没有帖子时评论忽略', () => {
    const rows = [['app|微博', 0], ['reply|游离|没有帖子', 1], ['post|甲|内容', 2]];
    for (let n = 0; n < FEED_REPLY_MAX + 2; n += 1) rows.push([`reply|网友${n}|评论${n}`, 10 + n]);
    const feed = foldFeedDirectives(dirs(...rows), Infinity);
    assert.equal(feed.posts.length, 1);
    assert.equal(feed.posts[0].replies.length, FEED_REPLY_MAX);
});

test('foldFeedDirectives：整块区间落在两页之间时挂到前一页', () => {
    const list = dirs(['app|微博', 100], ['post|甲|内容', 110], ['reply|乙|评论|甲', 120], ['app-end', 130]);
    // 本页 offset=50，下一页起点 200，区间 100~130 不含任何页起点
    const feed = foldFeedDirectives(list, 50, 200);
    assert.equal(feed.platform, 'weibo');
    assert.deepEqual(feed.posts[0].replies, [{ author: '乙', text: '评论', to: '甲' }]);
    // 下一页起点落在区间内，就不挂到前一页
    assert.equal(foldFeedDirectives(list, 50, 105), null);
    // 空区间不挂
    assert.equal(foldFeedDirectives(dirs(['app|微博', 100], ['app-end', 130]), 50, 200), null);
});

test('foldFeedDirectives：跨页累积，同一区间后页看得到前页的帖子', () => {
    const list = dirs(['app|微博', 0], ['post|甲|一', 10], ['post|乙|二', 110], ['post|丙|三', 210]);
    assert.deepEqual(foldFeedDirectives(list, 50).posts.map((p) => p.text), ['一']);
    assert.deepEqual(foldFeedDirectives(list, 150).posts.map((p) => p.text), ['一', '二']);
    assert.deepEqual(foldFeedDirectives(list, 250).posts.map((p) => p.text), ['一', '二', '三']);
});

test('resolveFxAtPage：帖子最多 12 条，fresh 只标本页新出现的', () => {
    const rows = [['app|微博', 0]];
    for (let n = 0; n < 15; n += 1) rows.push([`post|网友|第${n}条`, 10 + n * 10]);
    const list = dirs(...rows);
    // 本页 offset=200（含前 14 条），上页 offset=100（含前 9 条）
    const fx = resolveFxAtPage(list, 200, 100);
    assert.equal(fx.feed.posts.length, FEED_VIEW_MAX);
    assert.equal(fx.feed.posts.length, 12);
    const fresh = fx.feed.posts.filter((p) => p.fresh).map((p) => p.text);
    assert.ok(fresh.length > 0);
    assert.ok(fx.feed.posts.filter((p) => !p.fresh).every((p) => p.offset <= 100));
    assert.ok(fx.feed.posts.filter((p) => p.fresh).every((p) => p.offset > 100));
    // 少于 12 条时全部保留
    assert.equal(resolveFxAtPage(list, 60, -1).feed.posts.length, 6);
    // 评论的回复对象一并带到渲染侧
    const withReply = dirs(['app|微博', 0], ['post|甲|内容', 10], ['reply|乙|评论|甲', 20]);
    assert.deepEqual(resolveFxAtPage(withReply, 30, -1).feed.posts[0].replies, [{ author: '乙', text: '评论', to: '甲' }]);
});

test('collectFeedPosts：收出全部帖子，带平台、主人、评论与回复对象', () => {
    const source = [
        '他掏出手机。',
        '[igs-fx:app|微博]',
        '[igs-fx:post|甲|内容一|#话题]',
        '[igs-fx:reply|乙|评论|甲]',
        '[igs-fx:post|丙|内容二]',
        '[igs-fx:app-end]',
        '[igs-fx:post|游离|区间外的帖子]',
        '[igs-fx:app|备忘录|林小雨]',
        '[igs-fx:post|林小雨|备忘|草稿]',
        '[igs-fx:app-end]',
    ].join('\n');
    const posts = collectFeedPosts(source);
    assert.deepEqual(posts.map((p) => [p.platform, p.owner, p.author, p.text]), [
        ['weibo', '', '甲', '内容一'], ['weibo', '', '丙', '内容二'], ['memo', '林小雨', '林小雨', '备忘'],
    ]);
    assert.deepEqual(posts[0].replies, [{ author: '乙', text: '评论', to: '甲' }]);
    assert.equal(posts[0].extra, '#话题');
    assert.equal(posts[0].offset, source.indexOf('[igs-fx:post|甲'));
    assert.deepEqual(collectFeedPosts('没有标签'), []);
});

test('collectFeedPosts：风暴评论进列表，评论不挂到风暴条目，评论数上限', () => {
    const lines = [
        '[igs-fx:app|微博]',
        '[igs-fx:post|甲|内容]',
        '[igs-fx:storm|微博|黑|热搜词]',
        '[igs-fx:mention|网友|骂得很凶]',
        '[igs-fx:reply|乙|不该挂到风暴条目]',
        '[igs-fx:storm-end]',
        '[igs-fx:mention|网友|区间外的 mention]',
    ];
    for (let n = 0; n < FEED_REPLY_MAX + 2; n += 1) lines.push(`[igs-fx:reply|网友${n}|评论${n}]`);
    const posts = collectFeedPosts(lines.join('\n'));
    assert.equal(posts.length, 2);
    assert.equal(posts[0].kind, undefined);
    assert.equal(posts[1].kind, 'storm');
    assert.equal(posts[1].tone, 'black');
    assert.equal(posts[1].extra, '热搜词');
    assert.equal(posts[1].platform, 'weibo');
    assert.deepEqual(posts[1].replies, []);
    assert.equal(posts[0].replies.length, 0);
});

test('foldStormDirectives：区间内累积 mention，storm-end 之后为 null', () => {
    const list = dirs(['storm|微博|红|热搜', 0], ['mention|网友|夸', 10], ['mention|网友2|又夸', 20], ['storm-end', 30]);
    const storm = foldStormDirectives(list, 25, 15);
    assert.equal(storm.tone, 'red');
    assert.deepEqual(storm.mentions.map((m) => m.fresh), [false, true]);
    assert.equal(foldStormDirectives(list, 35), null);
});

test('mentionedFeedPlatforms：名字、别名、app 标签都算点名', () => {
    assert.deepEqual(mentionedFeedPlatforms(['他刷着微博']), ['weibo']);
    assert.ok(mentionedFeedPlatforms('[igs-fx:app|朋友圈]').includes('moments'));
    assert.ok(mentionedFeedPlatforms(['看看红书', '晋江有新章']).includes('xhs'));
    assert.deepEqual(mentionedFeedPlatforms([]), []);
    assert.deepEqual(mentionedFeedPlatforms(['什么也没提']), []);
});

test('hasFeedPeekHint：点名偷看专用平台或出现偷看说法', () => {
    assert.equal(hasFeedPeekHint(['他看了看微博']), false);
    assert.equal(hasFeedPeekHint([]), false);
    assert.equal(hasFeedPeekHint(['她去翻搜索记录']), true);
    assert.equal(hasFeedPeekHint(['点开备忘录']), true);
    assert.equal(hasFeedPeekHint(['打开相册看看']), true);
    assert.equal(hasFeedPeekHint(['[igs-fx:app|聊天列表|林小雨]']), true);
    assert.equal(hasFeedPeekHint(['趁她睡着偷看']), true);
    assert.equal(hasFeedPeekHint(['他翻了翻她的手机']), true);
    assert.equal(hasFeedPeekHint(['他解锁了她的手机']), true);
    assert.equal(hasFeedPeekHint(['输入密码']), true);
    assert.equal(hasFeedPeekHint(['他拿起林小雨的手机']), true);
    assert.equal(hasFeedPeekHint(['他拿起手机']), false);
});

const PEEK_NAMES = ['搜索记录', '备忘录', '相册', '聊天列表'];

function blockOf(feedFx, options) {
    const blocks = feedGrammarBlocks({ feedFx: { enabled: true, ...feedFx } }, options);
    return blocks.length ? blocks[0].full : '';
}

test('提示词：没有偷看迹象时偷看专用平台不进名单也不展开', () => {
    const hidden = blockOf({ peekHint: false }, { detailed: true });
    for (const name of PEEK_NAMES) assert.ok(!hidden.includes(name), `${name} 不该出现`);
    assert.ok(hidden.includes('朋友圈'));
    // 点名了偷看专用平台或有偷看迹象：名单里出现
    const shown = blockOf({ peekHint: true, mentioned: ['search'] }, { detailed: false });
    assert.ok(shown.includes('搜索记录（附加写'));
    assert.ok(shown.includes('备忘录'));
    // 旧路径（没有 peekHint）照旧全列
    const legacy = blockOf({}, { detailed: true });
    for (const name of PEEK_NAMES) assert.ok(legacy.includes(name), `${name} 应在旧路径出现`);
    assert.ok(resolveFeedPromptRule({ feedFx: { enabled: true } }).includes('搜索记录'));
});

test('提示词：reply 行写明第 4 栏可省，内容字数口径', () => {
    const text = blockOf({ peekHint: false }, { detailed: true });
    assert.ok(text.includes('reply|作者|内容|回复谁'));
    assert.ok(text.includes('可省'));
    assert.ok(text.includes('内容一般≤80字，豆瓣、知乎、书评可到140字'));
});

test('提示词：示例两条帖，第一条两条评论且第二条评论带回复对象，第二条无评论', () => {
    const text = blockOf({ peekHint: false, worldview: 'modern' }, { detailed: true });
    const example = text.slice(text.indexOf('示例：'));
    assert.equal((example.match(/\[igs-fx:post\|/g) || []).length, 2);
    const replies = example.match(/\[igs-fx:reply\|[^\]]*\]/g) || [];
    assert.equal(replies.length, 2);
    assert.equal(replies[0].split('|').length, 3);
    assert.equal(replies[1].split('|').length, 4);
    assert.ok(example.indexOf(replies[1]) < example.lastIndexOf('[igs-fx:post|'));
    assert.ok(example.includes('他往下划了划。'));
});

test('提示词：各世界观全展开字数不超预算', () => {
    for (const worldview of ['modern', 'horror', 'scifi', 'ancient', 'fantasy', 'magic', 'apocalypse', 'taisho']) {
        for (const carryPhone of [false, true]) {
            for (const peekHint of [undefined, false, true]) {
                const feedFx = { worldview, ...(carryPhone ? { carryPhone: true } : {}), ...(peekHint === undefined ? {} : { peekHint }) };
                const full = blockOf(feedFx, { detailed: true });
                assert.ok(full.length > 0 && full.length <= PROMPT_BUDGET, `${worldview}/${carryPhone}/${peekHint} 字数 ${full.length}`);
                assert.ok(resolveFeedPromptRule({ feedFx: { enabled: true, ...feedFx } }).length <= PROMPT_BUDGET);
            }
        }
    }
});

test('提示词：关闭社区时不出块', () => {
    assert.deepEqual(feedGrammarBlocks({ feedFx: { enabled: false } }, { detailed: true }), []);
});
