import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIgsTextPayload, normalizeSourceFilter } from '../src/scene/message-source.js';
import { extractHtmlCards, parseHtmlCardMarker, sanitizeHtmlCard } from '../src/scene/html-cards.js';

const CARD_MESSAGE = `<content>她把手机递了过来。屏幕亮着。
<htm1fenge>
<span style="display:none;">锁屏通知，冷光</span>
<div style="width:100%;padding:8px;font-size:13px;"><!-- 范式 --><div>【系统】您有 1 条新消息。请查收。</div></div>
</htm1fenge>
「看到了吗？」她问。
</content>`;

test('gate: html card block becomes its own page between narration and dialogue', () => {
    for (const options of [{}, { sentencePaging: true, sceneAssets: { enabled: true } }]) {
        const payload = buildIgsTextPayload({ text: CARD_MESSAGE }, options);
        const cardPages = payload.textSegments.filter((segment) => parseHtmlCardMarker(segment) >= 0);
        assert.equal(cardPages.length, 1);
        assert.equal(payload.htmlCards.length, 1);
        assert.match(payload.htmlCards[0], /^<span style="display:none;">/);
        assert.ok(!payload.textSegments.some((segment) => /<div|htm1fenge|您有 1 条/.test(segment)));
        const cardIndex = payload.textSegments.findIndex((segment) => parseHtmlCardMarker(segment) === 0);
        assert.match(payload.textSegments[cardIndex - 1], /屏幕亮着/);
        assert.match(payload.textSegments[cardIndex + 1], /看到了吗/);
        assert.equal(payload.raw, CARD_MESSAGE);
    }
});

test('gate: html card tags are user configurable and can be disabled', () => {
    assert.equal(normalizeSourceFilter({}).htmlCardTags, 'htm1fenge');
    const custom = buildIgsTextPayload({ text: '<content>前文\n<screen><b>屏幕</b></screen>\n后文</content>' }, {
        sourceFilter: { htmlCardTags: 'htm1fenge\nscreen' },
    });
    assert.deepEqual(custom.htmlCards, ['<b>屏幕</b>']);
    const disabled = buildIgsTextPayload({ text: CARD_MESSAGE }, { sourceFilter: { htmlCardTags: '' } });
    assert.deepEqual(disabled.htmlCards, []);
});

test('gate: unclosed streaming html card is held as a card instead of leaking code', () => {
    const result = extractHtmlCards('正文\n<htm1fenge>\n<div style="color:red">半截', ['htm1fenge']);
    assert.equal(result.cards.length, 1);
    assert.doesNotMatch(result.text, /<div/);
});

test('gate: html card sanitizer strips scripts, handlers and script urls', () => {
    const html = sanitizeHtmlCard('<div onclick="x()">a</div><script>alert(1)</script><a href="javascript:alert(1)">b</a><iframe src="x"></iframe><svg><rect width="10%"/></svg>');
    assert.doesNotMatch(html, /script|onclick|javascript|iframe/i);
    assert.match(html, /<svg><rect width="10%"\/><\/svg>/);
});
