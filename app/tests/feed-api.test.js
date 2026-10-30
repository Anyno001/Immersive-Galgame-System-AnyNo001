import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicApi } from '../src/api/public-api.js';
import { createFeedsApi, createLiveApi } from '../src/api/feed-api.js';
import { collectFeedPosts } from '../src/scene/feed-platforms.js';

const feeds = createFeedsApi();
const live = createLiveApi();

// 与 feed-platforms.test.js 同款的社区黄金样本：普通帖子、评论、偷看别人的手机、舆论风暴。
const FEED_SAMPLE = [
    '他掏出手机。',
    '[igs-fx:app|微博]',
    '[igs-fx:post|甲|内容一|#话题]',
    '[igs-fx:reply|乙|评论|甲]',
    '[igs-fx:post|丙|内容二]',
    '[igs-fx:app-end]',
    '[igs-fx:app|备忘录|林小雨]',
    '[igs-fx:post|林小雨|备忘|草稿]',
    '[igs-fx:app-end]',
    '[igs-fx:app|微博]',
    '[igs-fx:storm|微博|黑|热搜词]',
    '[igs-fx:mention|网友|骂得很凶]',
    '[igs-fx:storm-end]',
].join('\n');

test('createPublicApi：api 带有 feeds / live 及 version', () => {
    const api = createPublicApi({ version: 'test' }).api;
    assert.equal(api.feeds.version, 1);
    assert.equal(api.live.version, 1);
    assert.equal(typeof api.feeds.collectPosts, 'function');
    assert.equal(typeof api.live.collect, 'function');
});

test('feeds.platforms：只读快照，不带 prompt，改返回值不影响下次', () => {
    const list = feeds.platforms();
    assert.ok(list.length >= 20);
    assert.deepEqual(Object.keys(list[0]).sort(), ['aliases', 'extraLabel', 'id', 'name', 'skin']);
    assert.ok(list.every((p) => !('prompt' in p)));
    list[0].name = '被改了';
    list[0].aliases.push('乱加');
    list.pop();
    const again = feeds.platforms();
    assert.equal(again[0].id, 'moments');
    assert.equal(again[0].name, '朋友圈');
    assert.ok(!again[0].aliases.includes('乱加'));
    assert.ok(again.length > list.length);
});

test('feeds.resolvePlatform：别名转 id，认不出返回空串', () => {
    assert.equal(feeds.resolvePlatform('微博'), 'weibo');
    assert.equal(feeds.resolvePlatform('起点'), 'review');
    assert.equal(feeds.resolvePlatform('拼多多'), 'shop');
    assert.equal(feeds.resolvePlatform('XHS'), 'xhs');
    assert.equal(feeds.resolvePlatform('不存在'), '');
    assert.equal(feeds.resolvePlatform(''), '');
});

test('feeds.collectPosts：与 collectFeedPosts 一致，含 owner 与舆论风暴 mention', () => {
    const posts = feeds.collectPosts(FEED_SAMPLE);
    assert.deepEqual(posts, collectFeedPosts(FEED_SAMPLE));
    assert.equal(posts.length, 4);
    assert.deepEqual(posts.map((p) => [p.platform, p.author]), [['weibo', '甲'], ['weibo', '丙'], ['memo', '林小雨'], ['weibo', '网友']]);
    // 偷看别人的手机带主人；自己的手机主人为空串。
    assert.equal(posts[2].owner, '林小雨');
    assert.equal(posts[0].owner, '');
    assert.deepEqual(posts[0].replies, [{ author: '乙', text: '评论', to: '甲' }]);
    // 舆论风暴的 mention 被收进来。
    assert.equal(posts[3].kind, 'storm');
    assert.equal(posts[3].tone, 'black');
    assert.equal(posts[3].extra, '热搜词');
});

test('feeds.collectPosts：返回深拷贝，改了不影响下一次', () => {
    const first = feeds.collectPosts(FEED_SAMPLE);
    first[0].text = '被改了';
    first[0].replies[0].text = '也被改了';
    first[0].replies.push({ author: 'x', text: 'y', to: '' });
    first.pop();
    const second = feeds.collectPosts(FEED_SAMPLE);
    assert.equal(second[0].text, '内容一');
    assert.deepEqual(second[0].replies, [{ author: '乙', text: '评论', to: '甲' }]);
    assert.equal(second.length, 4);
});

test('feeds.parseExtra：书评、淘宝、其他平台', () => {
    assert.deepEqual(feeds.parseExtra('review', '《某书》4星'), { work: '某书', rating: 4 });
    assert.deepEqual(feeds.parseExtra('书评', '《某书》★★★'), { work: '某书', rating: 3 });
    assert.deepEqual(feeds.parseExtra('review', '某电影 5分'), { work: '某电影', rating: 5 });
    assert.deepEqual(feeds.parseExtra('shop', '¥9.9 月销1万+'), { price: '¥9.9', sales: '月销1万+' });
    assert.deepEqual(feeds.parseExtra('淘宝', '月销200'), { price: '', sales: '月销200' });
    assert.deepEqual(feeds.parseExtra('weibo', '#话题#'), { text: '#话题#' });
    assert.deepEqual(feeds.parseExtra('不存在的平台', '随便'), { text: '随便' });
});

test('live.collect：有 live 标签、dm 五种类型', () => {
    const source = [
        '[igs-fx:live|小雨|深夜聊天|主播]',
        '[igs-fx:dm|观众甲|你好呀]',
        '[igs-fx:dm|观众乙|火箭|礼物|火箭x1]',
        '[igs-fx:dm|观众丙|加油|醒目留言|¥30]',
        '[igs-fx:dm|观众丁||上舰]',
        '[igs-fx:dm|观众戊||进场]',
    ].join('\n');
    const segments = live.collect(source);
    assert.equal(segments.length, 1);
    const [seg] = segments;
    assert.deepEqual([seg.host, seg.title, seg.view, seg.end, seg.offset], ['小雨', '深夜聊天', 'host', false, 0]);
    assert.ok(!('platform' in seg));
    assert.deepEqual(seg.danmaku.map((d) => [d.author, d.content, d.type, d.extra]), [
        ['观众甲', '你好呀', 'text', ''],
        ['观众乙', '火箭', 'gift', '火箭x1'],
        ['观众丙', '加油', 'sc', '¥30'],
        ['观众丁', '', 'guard', ''],
        ['观众戊', '', 'enter', ''],
    ]);
    assert.equal(seg.danmaku[1].offset, source.indexOf('[igs-fx:dm|观众乙'));
});

test('live.collect：观众视角、带平台的直播', () => {
    const [seg] = live.collect('[igs-fx:live|主播A|地下拍卖|观看|暗网·拍卖]');
    assert.deepEqual([seg.host, seg.view, seg.platform], ['主播A', 'watch', 'auction']);
});

test('live.collect：danmaku 标签按 / 拆成多条 text', () => {
    const source = '[igs-fx:live|小雨|标题|观看]\n[igs-fx:danmaku|哈哈哈/太强了/前排|scroll]';
    const [seg] = live.collect(source);
    assert.deepEqual(seg.danmaku.map((d) => [d.author, d.content, d.type]), [['', '哈哈哈', 'text'], ['', '太强了', 'text'], ['', '前排', 'text']]);
    assert.equal(new Set(seg.danmaku.map((d) => d.offset)).size, 1);
});

test('live.collect：下播（live-end 标签与多段直播）', () => {
    const source = [
        '[igs-fx:live|小雨|第一场|主播]',
        '[igs-fx:dm|甲|开始了]',
        '[igs-fx:live-end]',
        '[igs-fx:live|小雨|第二场|主播]',
        '[igs-fx:dm|乙|又来了]',
    ].join('\n');
    const segments = live.collect(source);
    assert.deepEqual(segments.map((s) => [s.title, s.end, s.danmaku.length]), [['第一场', true, 1], ['第二场', false, 1]]);
});

test('live.collect：本楼只有 live-end / 只有弹幕时是承接上一楼的一段（host 为空）', () => {
    const [ended] = live.collect('他放下了话筒。\n[igs-fx:live-end]');
    assert.deepEqual([ended.host, ended.end, ended.danmaku.length], ['', true, 0]);
    const [cont] = live.collect('[igs-fx:dm|甲|还在播]');
    assert.deepEqual([cont.host, cont.end, cont.danmaku.length], ['', false, 1]);
});

test('live.collect：只有开播词 / 下播词时兜底，主播是 userName', () => {
    const source = '小明深吸一口气，打开了直播间。过了一会，他下播了。';
    const [seg] = live.collect(source, { userName: '小明' });
    assert.deepEqual([seg.host, seg.title, seg.view, seg.end], ['小明', '小明的直播间', 'host', true]);
    assert.equal(seg.offset, source.indexOf('打开了直播间'));
    assert.equal(live.collect('小明开播了。')[0].host, '主播');
    // 否定词不算；没开着直播时的「收起手机」不凭空造一段。
    assert.deepEqual(live.collect('他今天没开播。'), []);
    assert.deepEqual(live.collect('她收起手机，转身离开。', { userName: '小明' }), []);
});

test('live.collect：写了 live 标签时开播词不再补一段，下播词照认', () => {
    const source = '[igs-fx:live|小雨|标题|主播]\n她打开了直播间。\n[igs-fx:dm|甲|来了]\n她收起手机。';
    const segments = live.collect(source, { userName: '小明' });
    assert.equal(segments.length, 1);
    assert.deepEqual([segments[0].host, segments[0].end, segments[0].danmaku.length], ['小雨', true, 1]);
});

test('live.collect：改返回值不影响下一次', () => {
    const source = '[igs-fx:live|小雨|标题|主播]\n[igs-fx:dm|甲|你好]';
    const first = live.collect(source);
    first[0].host = '被改了';
    first[0].danmaku[0].content = '被改了';
    first[0].danmaku.push({});
    first.pop();
    const second = live.collect(source);
    assert.equal(second[0].host, '小雨');
    assert.deepEqual(second[0].danmaku.map((d) => d.content), ['你好']);
});

test('非法入参不抛错', () => {
    const huge = `${'[igs-fx:dm|甲|弹幕]'.repeat(20000)}${'x'.repeat(200000)}`;
    for (const bad of [null, undefined, 42, {}, [], true, '']) {
        assert.deepEqual(feeds.collectPosts(bad), []);
        assert.deepEqual(live.collect(bad), []);
        assert.equal(feeds.resolvePlatform(bad), '');
        assert.deepEqual(feeds.parseExtra(bad, bad), { text: '' });
    }
    assert.deepEqual(feeds.parseExtra('review', 42), { work: '', rating: 0 });
    assert.deepEqual(feeds.parseExtra('shop', null), { price: '', sales: '' });
    assert.doesNotThrow(() => live.collect('开播', null));
    assert.doesNotThrow(() => live.collect('开播', 5));
    assert.doesNotThrow(() => live.collect('开播', { userName: 42 }));
    assert.doesNotThrow(() => feeds.collectPosts(huge));
    assert.doesNotThrow(() => live.collect(huge));
});
