import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FEED_MARK_MAX, feedDmThread, feedMarksForSnapshot, feedPageOf, isDmLine, mentionsUser, planFeedMarks,
} from '../src/visual/igs-ui/feed-extras.js';
import { FEED_PING_BY_PLATFORM, FEED_PING_PARTIALS, feedPingKind, playFeedPing, shouldFeedPing } from '../src/visual/igs-ui/feed-ping.js';
import { phoneWallUrl } from '../src/visual/igs-ui/my-phone.js';

test('mentionsUser：@我、@玩家名、@{{user}} 算，@别人和「我们」不算', () => {
    assert.equal(mentionsUser('@我 晚上见', '陈默'), true);
    assert.equal(mentionsUser('@陈默 晚上见', '陈默'), true);
    assert.equal(mentionsUser('@陈默你好', '陈默'), true);
    assert.equal(mentionsUser('@{{user}} 来', '陈默'), true);
    assert.equal(mentionsUser('@林夏 晚上见', '陈默'), false);
    assert.equal(mentionsUser('@我们 一起', '陈默'), false);
    assert.equal(mentionsUser('没有艾特', '陈默'), false);
});

test('isDmLine：@玩家或写明私信算，玩家自己写的不算', () => {
    assert.equal(isDmLine({ author: '林夏', text: '@陈默 私下说' }, '陈默'), true);
    assert.equal(isDmLine({ author: '林夏', text: '给你发私信了' }, '陈默'), true);
    assert.equal(isDmLine({ author: '林夏', text: '今天天气好' }, '陈默'), false);
    assert.equal(isDmLine({ author: '陈默', text: '私信你了' }, '陈默'), false);
    assert.equal(isDmLine({ author: '我', text: '私信你了' }, '陈默'), false);
});

test('feedDmThread：只取正文里写了的私信行与玩家自己的评论，按原顺序', () => {
    const post = {
        author: '林夏', text: '@陈默 看私信',
        replies: [
            { author: '路人', text: '围观', to: '' },
            { author: '陈默', text: '收到', to: '林夏' },
            { author: '林夏', text: '我私信你了', to: '陈默' },
        ],
    };
    assert.deepEqual(feedDmThread(post, '陈默'), {
        peer: '林夏',
        items: [{ side: 'peer', text: '@陈默 看私信' }, { side: 'self', text: '收到' }, { side: 'peer', text: '我私信你了' }],
    });
    assert.equal(feedDmThread({ author: '林夏', text: '随便聊聊', replies: [] }, '陈默'), null);
    assert.equal(feedDmThread(null, '陈默'), null);
});

test('planFeedMarks：只看 fresh 帖子牵涉到的在场角色，说话人单独标记，最多 FEED_MARK_MAX 个', () => {
    const feed = {
        platform: 'weibo',
        posts: [
            { author: '林夏', text: '今天好冷', fresh: true, replies: [{ author: '路人', text: '@苏晴 你看', to: '' }] },
            { author: '苏晴', text: '旧帖', fresh: false, replies: [] },
            { author: '赵雷', text: '@林夏你好', fresh: true, replies: [] },
        ],
    };
    const marks = planFeedMarks({ feed, userName: '陈默', speakerKey: '林夏', members: ['苏晴', '赵雷'] });
    assert.deepEqual(marks, [{ character: '林夏', kind: 'surprise', speaker: true }, { character: '苏晴', kind: 'surprise' }]);
    assert.equal(marks.length <= FEED_MARK_MAX, true);
    // 没有 fresh 帖、不在场的人、玩家自己都不冒
    assert.deepEqual(planFeedMarks({ feed: { posts: [{ author: '林夏', text: 'x', fresh: false }] }, speakerKey: '林夏' }), []);
    assert.deepEqual(planFeedMarks({ feed: { posts: [{ author: '路人', text: 'x', fresh: true }] }, speakerKey: '林夏', members: ['苏晴'] }), []);
    assert.deepEqual(planFeedMarks({ feed: { posts: [{ author: '陈默', text: 'x', fresh: true }] }, userName: '陈默', speakerKey: '陈默' }), []);
    // 同一角色同页只冒一次
    const dup = planFeedMarks({ feed: { posts: [{ author: '林夏', text: '@林夏', fresh: true, replies: [{ author: '林夏', text: 'y', to: '林夏' }] }] }, speakerKey: '林夏' });
    assert.equal(dup.length, 1);
});

test('feedPageOf：开关、NSFW、聊天页、回忆梦境与风暴优先', () => {
    const on = { enabled: true, muteOnNsfw: true, storm: { enabled: true } };
    const fx = { feed: { platform: 'weibo', posts: [] } };
    assert.equal(feedPageOf({ fx }, on).feed, fx.feed);
    assert.equal(feedPageOf({ fx }, { ...on, enabled: false }).feed, null);
    assert.equal(feedPageOf({ fx, sceneNsfw: true }, on).feed, null);
    assert.equal(feedPageOf({ fx, sceneNsfw: true }, { ...on, muteOnNsfw: false }).feed, fx.feed);
    assert.equal(feedPageOf({ fx, chatPage: true }, on).allowed, false);
    assert.equal(feedPageOf({ fx: { ...fx, dream: true } }, on).feed, null);
    const storm = { mentions: [] };
    const both = feedPageOf({ fx: { ...fx, storm } }, on);
    assert.equal(both.storm, storm);
    assert.equal(both.feed, null);
});

test('feedMarksForSnapshot：需要漫符开关与社区手机，NSFW 场景不冒', () => {
    const snap = (extra = {}, mangaOn = true) => ({
        readerSettings: { mangaFx: { enabled: mangaOn }, feedFx: { enabled: true } },
        content: { fx: { feed: { platform: 'weibo', posts: [{ author: '林夏', text: 'x', fresh: true }] } }, ...extra },
    });
    const opts = { userName: '陈默', speakerKey: '林夏', members: [] };
    assert.equal(feedMarksForSnapshot(snap(), opts).length, 1);
    assert.equal(feedMarksForSnapshot(snap({}, false), opts).length, 0);
    assert.equal(feedMarksForSnapshot(snap({ sceneNsfw: true }), opts).length, 0);
});

test('提示音：平台分四类音色，偷看专用平台与纸面不响', () => {
    assert.equal(feedPingKind('moments'), 'soft');
    assert.equal(feedPingKind('weibo'), 'blip');
    assert.equal(feedPingKind('tieba'), 'wood');
    assert.equal(feedPingKind('shop'), 'bell');
    for (const id of ['search', 'memo', 'album', 'chats', 'notice']) assert.equal(feedPingKind(id), '');
    assert.equal(new Set(Object.values(FEED_PING_BY_PLATFORM)).size, 4);
    for (const kind of new Set(Object.values(FEED_PING_BY_PLATFORM))) assert.ok(FEED_PING_PARTIALS[kind].length > 0);
});

test('shouldFeedPing：首次亮出或换页有新帖才响，快翻、静置、间隔内不响', () => {
    const base = { kind: 'blip', appeared: false, fresh: false, newPage: false, skipping: false, idle: false, last: undefined, now: 10000 };
    assert.equal(shouldFeedPing({ ...base, appeared: true }), true);
    assert.equal(shouldFeedPing({ ...base, fresh: true, newPage: true }), true);
    assert.equal(shouldFeedPing({ ...base, fresh: true, newPage: false }), false);
    assert.equal(shouldFeedPing({ ...base, newPage: true }), false);
    assert.equal(shouldFeedPing({ ...base, appeared: true, skipping: true }), false);
    assert.equal(shouldFeedPing({ ...base, appeared: true, idle: true }), false);
    assert.equal(shouldFeedPing({ ...base, appeared: true, kind: '' }), false);
    assert.equal(shouldFeedPing({ ...base, appeared: true, last: 9000 }), false);
    assert.equal(shouldFeedPing({ ...base, appeared: true, last: 8000 }), true);
});

test('playFeedPing：音效关闭或音量为 0 时不响', () => {
    assert.equal(playFeedPing('blip', { enabled: false, volume: 0.5 }), false);
    assert.equal(playFeedPing('blip', { enabled: true, volume: 0 }), false);
    assert.equal(playFeedPing('nope', { enabled: true, volume: 0.5 }), false);
});

test('phoneWallUrl：自选图片 > 相册图 > 场景背景，纯色都不用', () => {
    assert.equal(phoneWallUrl({ wallpaper: 'https://x/a.png' }, 'scene.png', 'album.png'), 'https://x/a.png');
    assert.equal(phoneWallUrl({ wallpaper: 'scene' }, 'scene.png', 'album.png'), 'album.png');
    assert.equal(phoneWallUrl({ wallpaper: 'scene' }, 'scene.png', ''), 'scene.png');
    assert.equal(phoneWallUrl({}, 'scene.png'), 'scene.png');
    assert.equal(phoneWallUrl({ wallpaper: 'none' }, 'scene.png', 'album.png'), '');
    assert.equal(phoneWallUrl({ wallpaper: 'custom' }, 'scene.png', 'album.png'), '');
});
