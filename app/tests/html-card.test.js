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

test('gate: unclosed streaming html card is held as a card instead of leaking code', () => {
    const result = extractHtmlCards('正文\n<htm1fenge>\n<div style="color:red">半截', ['htm1fenge']);
    assert.equal(result.cards.length, 1);
    assert.doesNotMatch(result.text, /<div/);
});

const LEGACY_EXCLUDE = 'thinking\nSubtext_think\nStatus_block\ntext_to_image\nparallel_world\naftertalk\nimage';
