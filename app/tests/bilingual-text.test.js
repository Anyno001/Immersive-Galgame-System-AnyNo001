import test from 'node:test';
import assert from 'node:assert/strict';
import {
    bilingualGrammarBlock,
    fitBilingualRuby,
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
    assert.deepEqual(normalizeBilingualSettings(null), { enabled: false, display: 'ruby', layout: 'interleave', foreign: 'auto', target: 'zh-Hans' });
    assert.deepEqual(normalizeBilingualSettings({ enabled: true, display: 'x', layout: 'y', foreign: 'fr', target: 'en' }), { enabled: true, display: 'ruby', layout: 'interleave', foreign: 'auto', target: 'zh-Hans' });
    assert.equal(normalizeBilingualSettings({ layout: 'stack' }).layout, 'stack');
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

test('gate: interleave keeps one whole ruby per 〖〗 and stack puts the full translation above', () => {
    const line = 'あのね、昨日の夜ずっと考えてたんだけど、やっぱり行く。〖那个啊，昨晚我一直在想，还是去吧。〗';
    assert.equal(renderBilingualHtml(line, 'ruby'),
        '<ruby class="igs-bi">あのね、昨日の夜ずっと考えてたんだけど、やっぱり行く。<rt>那个啊，昨晚我一直在想，还是去吧。</rt></ruby>');
    assert.equal(renderBilingualHtml('Wait. 〖等等。〗 Go!〖走！〗', 'ruby', 'stack'),
        '<span class="igs-bi-stack"><span class="igs-bi-note">等等。</span>Wait.</span> <span class="igs-bi-stack"><span class="igs-bi-note">走！</span>Go!</span>');
    assert.equal(renderBilingualHtml(line, 'source', 'stack'), 'あのね、昨日の夜ずっと考えてたんだけど、やっぱり行く。');
});

test('gate: bilingual prompt asks for one 〖〗 per segment unless layout is clause', () => {
    assert.match(bilingualGrammarBlock({}), /只在末尾跟一个〖〗/);
    assert.doesNotMatch(bilingualGrammarBlock({}), /每个分句或短句后/);
    assert.match(bilingualGrammarBlock({ layout: 'stack' }), /只在末尾跟一个〖〗/);
    assert.match(bilingualGrammarBlock({ layout: 'clause' }), /每个分句或短句后紧跟一个〖〗/);
});

test('gate: clause layout splits long bilingual units by matching clauses', () => {
    const html = renderBilingualHtml('あのね、昨日の夜ずっと考えてたんだけど、やっぱり行く。〖那个啊，昨晚我一直在想，还是去吧。〗', 'ruby', 'clause');
    assert.equal((html.match(/<ruby/g) || []).length, 3);
    assert.match(html, /<ruby class="igs-bi">あのね、<rt>那个啊，<\/rt><\/ruby>/);
    const mismatch = renderBilingualHtml('あのね、昨日の夜ずっと考えてたんだけど。〖那个啊昨晚我一直在想。〗', 'ruby', 'clause');
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
    assert.match(rule, /^【双语台词】/);
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

// 压力测试（最小锚点）：AI 犯蠢把 igs 指令与旁白黏在同一段、且旁白用非句号收尾时，分页与译文归页是否正常。
test('stress: sentence paging splits narration after igs directive and keeps 〖〗 translation on the same page', () => {
    // 场景A：applySentencePaging 只按句末分页，不吞字；igs 指令与旁白同段的断段由 breakAfterIgsDirectiveClose 在 body-format 阶段负责（见 message-source.js:253）。
    // 这里锚定：分页后 〗 后旁白与「傘を取った」之间按句号切开，译文不跨页。
    const withDirective = applySentencePaging('[アリス]：行こう。〖走吧。〗その後、雨が降った。傘を取った。');
    assert.equal(withDirective, '[アリス]：行こう。〖走吧。〗その後、雨が降った。\n傘を取った。', '句号分页行为被意外改变');
    // 场景B：AI 用非句号句末（！？!?）时，当前实现是否仍分页；译文必须留在原文同一页。
    const bang = applySentencePaging('待って！〖等等！〗どうして？〖为什么？〗');
    // 契约：句子分页不在 〖〗 前后断开，双语单元整行保持一页，译文随原文归页。
    assert.equal(bang, '待って！〖等等！〗どうして？〖为什么？〗', '双语单元在 〖〗 前被切开，译文掉到第二页');
    // 场景C：中文旁白用！号收尾多句连写，应能分页（当前只认。，预期失败=复现你报的问题）。
    const zh = applySentencePaging('他冲了过来！她愣住了。门开了。');
    assert.ok(zh.includes('！\n'), '中文！号未被识别为句末，多句黏在一起');
    // 场景D：省略号收尾（……/…）也应分页；译文场景同理。
    const dots = applySentencePaging('她沉默了很久……转身离开。');
    assert.ok(dots.includes('……\n'), '省略号未被识别为句末，与后句黏在一起');
    const dotsBi = applySentencePaging('そうか……〖这样啊……〗じゃあね。');
    assert.equal(dotsBi, 'そうか……〖这样啊……〗じゃあね。', '省略号后在 〖〗 前断页，译文掉到第二页');
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

test('gate: classic typewriter lifts each wrapped line under its own ruby text fragment', () => {
    const a = textNode('ab');
    const rt = textNode('甲乙');
    const root = node('DIV', node('RUBY', a, node('RT', rt)));
    root.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 80, width: 100, height: 80 });
    const rects = [
        { top: 14, bottom: 34, left: 0, right: 10, width: 10, height: 20 },
        { top: 54, bottom: 74, left: 0, right: 10, width: 10, height: 20 },
    ];
    root.ownerDocument = { createRange() {
        let start = 0;
        let current;
        return {
            setStart(value, offset) { current = value; start = offset; },
            setEnd() {},
            selectNodeContents(value) { current = value; },
            getClientRects() {
                if (current === rt) return [{ top: 2, bottom: 12, left: 0, right: 10, width: 10, height: 10 }, { top: 42, bottom: 52, left: 0, right: 10, width: 10, height: 10 }];
                return [rects[start]];
            },
        };
    } };
    const result = measureClassicReveal(root, 10);
    assert.deepEqual(result.layout.lines.map((line) => line.top), [0, 42]);
});

test('gate: classic typewriter skips a stacked bilingual note and lifts the next line to include it', () => {
    const first = textNode('あ');
    const noteText = textNode('是');
    const base = textNode('い');
    const note = node('SPAN', noteText);
    note.classList = { contains: (name) => name === 'igs-bi-note' };
    const root = node('DIV', first, node('SPAN', note, base));
    const rects = new Map([
        [first, { top: 0, bottom: 20, left: 0, right: 10, width: 10, height: 20 }],
        [noteText, { top: 24, bottom: 36, left: 0, right: 10, width: 10, height: 12 }],
        [base, { top: 40, bottom: 60, left: 0, right: 10, width: 10, height: 20 }],
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
    assert.equal(result.layout.lines[1].top, 24);
});

function fakeElement(nodeName, className, rects = []) {
    return {
        nodeType: 1, nodeName, className, childNodes: [], rects, parent: null,
        classList: { contains(name) { return className.split(/\s+/).includes(name); } },
        get children() { return this.childNodes.filter((child) => child.nodeType === 1); },
        get firstChild() { return this.childNodes[0] || null; },
        appendChild(child) {
            if (child.parent) child.parent.childNodes.splice(child.parent.childNodes.indexOf(child), 1);
            child.parent = this;
            this.childNodes.push(child);
            return child;
        },
        replaceWith(next) {
            const siblings = this.parent.childNodes;
            siblings.splice(siblings.indexOf(this), 1, next);
            next.parent = this.parent;
        },
        getClientRects() { return this.rects; },
    };
}

test('gate: ruby that overflows the text box becomes a stacked note line, fitting ruby stays', () => {
    const doc = { defaultView: { getComputedStyle: () => ({ paddingLeft: '10px', paddingRight: '10px' }) }, createElement: (tag) => fakeElement(tag.toUpperCase(), '') };
    const box = fakeElement('DIV', '');
    box.ownerDocument = doc;
    box.offsetWidth = 200;
    box.getBoundingClientRect = () => ({ left: 0, right: 200, width: 200 });
    const make = (base, note, rect) => {
        const ruby = fakeElement('RUBY', 'igs-bi', [rect]);
        ruby.appendChild({ nodeType: 3, nodeValue: base });
        const rt = ruby.appendChild(fakeElement('RT', '', []));
        rt.appendChild({ nodeType: 3, nodeValue: note });
        return box.appendChild(ruby);
    };
    make('Wait.', '等等。', { left: 10, right: 60, width: 50 });
    make('My young mistress does not speak English.', '我家小主人不会说英语。', { left: 60, right: 400, width: 340 });
    box.querySelectorAll = () => box.childNodes.filter((child) => child.nodeName === 'RUBY');
    assert.equal(fitBilingualRuby(box), 1);
    assert.deepEqual(box.childNodes.map((child) => child.nodeName), ['RUBY', 'SPAN']);
    const stack = box.childNodes[1];
    assert.equal(stack.className, 'igs-bi-stack');
    assert.equal(stack.childNodes[0].className, 'igs-bi-note');
    assert.equal(stack.childNodes[0].childNodes[0].nodeValue, '我家小主人不会说英语。');
    assert.equal(stack.childNodes[1].nodeValue, 'My young mistress does not speak English.');
});
