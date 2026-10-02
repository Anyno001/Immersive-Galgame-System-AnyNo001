import test from 'node:test';
import assert from 'node:assert/strict';
import {
    bilingualGrammarBlock,
    nextBilingualDisplay,
    normalizeBilingualSettings,
    renderBilingualHtml,
    resolveBilingualDisplay,
    resolveBilingualPromptRule,
    stripBilingualTranslation,
} from '../src/visual/igs-ui/bilingual-text.js';
import { renderDialogueHtml } from '../src/visual/igs-ui/settings-normalize.js';
import { collectGrammarBlocks } from '../src/visual/igs-ui/tag-grammar.js';
import { FX_SETTINGS_NORMALIZERS } from '../src/visual/igs-ui/fx-settings.js';
import { renderStageDirectionFields } from '../src/visual/igs-ui/stage-direction-fields.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { applySentencePaging } from '../src/scene/message-source.js';
import { thoughtFragments } from '../src/visual/igs-ui/danmaku-pools.js';
import { measureClassicReveal } from '../src/visual/igs-ui/typewriter-classic.js';

const JA = 'おはよう〖早上好〗、今日はいい天気ですね〖今天天气真好呢〗';

test('gate: bilingual settings default off and normalize unknown values', () => {
    assert.deepEqual(normalizeBilingualSettings(null), { enabled: false, display: 'ruby', foreign: 'auto', target: 'zh-Hans' });
    assert.deepEqual(normalizeBilingualSettings({ enabled: true, display: 'x', foreign: 'fr', target: 'en' }), { enabled: true, display: 'ruby', foreign: 'auto', target: 'zh-Hans' });
    assert.equal(typeof FX_SETTINGS_NORMALIZERS.bilingual, 'function');
    assert.equal(normalizeSettingsValue('readerSettings.bilingual.enabled', 'true'), true);
    assert.equal(normalizeSettingsValue('readerSettings.bilingual.display', 'source'), 'source');
});

test('gate: bilingual disabled leaves 〖〗 text untouched', () => {
    assert.equal(resolveBilingualDisplay({ enabled: false, display: 'ruby' }), '');
    assert.equal(renderBilingualHtml(JA, ''), JA);
});

test('gate: bilingual ruby annotates the source run before each 〖〗 and keeps lead punctuation outside', () => {
    assert.equal(renderBilingualHtml(JA, 'ruby'),
        '<ruby class="igs-bi">おはよう<rt>早上好</rt></ruby>、<ruby class="igs-bi">今日はいい天気ですね<rt>今天天气真好呢</rt></ruby>');
    assert.equal(renderBilingualHtml('Wait. 〖等等。〗 Don&#39;t go!〖别走！〗', 'ruby'),
        '<ruby class="igs-bi">Wait.<rt>等等。</rt></ruby> <ruby class="igs-bi">Don&#39;t go!<rt>别走！</rt></ruby>');
});

test('gate: bilingual source and translation displays drop the other side', () => {
    assert.equal(renderBilingualHtml(JA, 'source'), 'おはよう、今日はいい天気ですね');
    assert.equal(renderBilingualHtml(JA, 'translation'), '早上好、今天天气真好呢');
});

test('gate: bilingual ruby never pairs across thought markup or line breaks', () => {
    const html = renderBilingualHtml(renderDialogueHtml('*あの人、また来た〖那个人又来了〗*', {}, true), 'ruby');
    assert.equal(html, '<span class="igs-thought"><ruby class="igs-bi">あの人、また来た<rt>那个人又来了</rt></ruby></span>');
    assert.equal(renderBilingualHtml('前の行\n次〖下一个〗', 'ruby'), '前の行\n<ruby class="igs-bi">次<rt>下一个</rt></ruby>');
    assert.equal(renderBilingualHtml('〖孤立的译文〗', 'ruby'), '<span class="igs-bi-loose">孤立的译文</span>');
});

test('gate: long bilingual units split by matching clauses so ruby can wrap', () => {
    const html = renderBilingualHtml('あのね、昨日の夜ずっと考えてたんだけど、やっぱり行く。〖那个啊，昨晚我一直在想，还是去吧。〗', 'ruby');
    assert.equal((html.match(/<ruby/g) || []).length, 3);
    assert.match(html, /<ruby class="igs-bi">あのね、<rt>那个啊，<\/rt><\/ruby>/);
    const mismatch = renderBilingualHtml('あのね、昨日の夜ずっと考えてたんだけど。〖那个啊昨晚我一直在想。〗', 'ruby');
    assert.equal((mismatch.match(/<ruby/g) || []).length, 1);
});

test('gate: T cycles ruby, source, translation and the override wins only when enabled', () => {
    assert.equal(nextBilingualDisplay('ruby'), 'source');
    assert.equal(nextBilingualDisplay('source'), 'translation');
    assert.equal(nextBilingualDisplay('translation'), 'ruby');
    assert.equal(resolveBilingualDisplay({ enabled: true }, 'translation'), 'translation');
    assert.equal(resolveBilingualDisplay({ enabled: false }, 'translation'), '');
});

test('gate: bilingual prompt rule follows the switch and targets tag dialogue fields', () => {
    assert.equal(resolveBilingualPromptRule({ enabled: false }), '');
    const rule = resolveBilingualPromptRule({ enabled: true, foreign: 'en', target: 'zh-Hant' });
    assert.match(rule, /^\[igs双语台词\]/);
    assert.match(rule, /英语原文/);
    assert.match(rule, /〖繁体中文译文〗/);
    assert.match(rule, /\[igs-char\] 的对白栏/);
    assert.match(bilingualGrammarBlock({ foreign: 'auto' }), /各自设定的母语/);
    assert.match(bilingualGrammarBlock({}), /包括主角/);
    assert.deepEqual(collectGrammarBlocks({}).map((b) => b.key).includes('bilingual'), false);
    assert.equal(collectGrammarBlocks({ bilingual: { enabled: true } })[0].key, 'bilingual');
});

test('gate: bilingual settings field shows options only when enabled', () => {
    assert.doesNotMatch(renderStageDirectionFields({}).bilingual, /bilingual\.display/);
    const on = renderStageDirectionFields({ bilingual: { enabled: true } }).bilingual;
    assert.match(on, /readerSettings\.bilingual\.display/);
    assert.match(on, /readerSettings\.bilingual\.foreign/);
    assert.match(on, /readerSettings\.bilingual\.target/);
});

test('gate: sentence paging never cuts between source and 〖translation〗', () => {
    assert.equal(applySentencePaging('[アリス]：そうですね。〖是啊。〗行こう。〖走吧。〗'), '[アリス]：そうですね。〖是啊。〗行こう。〖走吧。〗');
});

test('gate: fingerprints and inner danmaku drop bilingual translations', () => {
    assert.equal(stripBilingualTranslation(JA), 'おはよう、今日はいい天気ですね');
    assert.deepEqual(thoughtFragments('あの人〖那个人〗、また来た〖又来了〗'), ['あの人', 'また来た']);
});

function node(nodeName, ...children) {
    const el = { nodeType: 1, nodeName, childNodes: children };
    for (const child of children) child.parentNode = el;
    return el;
}

function textNode(value) {
    return { nodeType: 3, nodeValue: value, childNodes: [] };
}

test('gate: classic typewriter skips ruby text and lifts its line top to include the annotation', () => {
    const first = textNode('あ');
    const base = textNode('い');
    const rt = textNode('是');
    const root = node('DIV', first, node('RUBY', base, node('RT', rt)));
    const rects = new Map([
        [first, { top: 0, bottom: 20, left: 0, right: 10, width: 10, height: 20 }],
        [base, { top: 40, bottom: 60, left: 0, right: 10, width: 10, height: 20 }],
        [rt, { top: 28, bottom: 38, left: 0, right: 10, width: 10, height: 10 }],
    ]);
    root.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 60, width: 100, height: 60 });
    root.ownerDocument = { createRange() {
        let current;
        return {
            setStart(value) { current = value; },
            setEnd() {},
            selectNodeContents(value) { current = value; },
            getClientRects() { return [rects.get(current)]; },
        };
    } };
    const result = measureClassicReveal(root, 10);
    assert.deepEqual(result.events.map((event) => event.text), ['あ', 'い']);
    assert.equal(result.layout.lines.length, 2);
    assert.equal(result.layout.lines[1].top, 28);
});
