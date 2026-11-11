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

const PEEK_NAMES = ['搜索记录', '备忘录', '相册', '聊天列表'];

function blockOf(feedFx, options) {
    const blocks = feedGrammarBlocks({ feedFx: { enabled: true, ...feedFx } }, options);
    return blocks.length ? blocks[0].full : '';
}

