import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { ancientPaperLayout, makeAncientPaper } from '../src/visual/igs-ui/fx-ancient-paper.js';
import { ANCIENT_PAPER_STYLE_TEXT } from '../src/visual/igs-ui/fx-ancient-paper-style.js';
import { ANCIENT_PAPER_TEXTURE, ANCIENT_PAPER_SEALS } from '../src/visual/igs-ui/fx-ancient-paper-assets.js';
import { cancelDailyFx, DAILY_FX_LIFETIME_MS, renderDailyFx } from '../src/visual/igs-ui/fx-daily.js';
import { RITES_BUILDERS } from '../src/visual/igs-ui/fx-daily-rites.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

function paper(item = {}, options = {}, reduced = false) {
    const dom = new JSDOM('<!doctype html><body></body>');
    const node = makeAncientPaper(item, { doc: dom.window.document, ancient: true, reduced }, options);
    dom.window.document.body.append(node);
    return { dom, node, scroll: node.querySelector('.igs-dfx-document-scroll') };
}

function event(dom, type, props = {}) {
    const result = new dom.window.Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries(props)) Object.defineProperty(result, key, { value });
    return result;
}

test('ancient paper ships a complete external font, original texture and transparent decorative seals', () => {
    const font = readFileSync(new URL('../src/visual/igs-ui/assets/fonts/MaShanZheng-Regular.woff2', import.meta.url));
    assert.equal(font.subarray(0, 4).toString(), 'wOF2');
    assert.ok(font.length > 3000000, 'full font, not sample-only glyphs');
    const build = readFileSync(new URL('../scripts/build.js', import.meta.url), 'utf8');
    assert.match(build, /family: 'IGS-MaShanZheng', file: 'MaShanZheng-Regular\.woff2'/);
    assert.match(build, /MaShanZheng-OFL\.txt/);
    assert.match(ANCIENT_PAPER_TEXTURE, /^data:image\/jpeg;base64,/);
    for (const shape of ['rect', 'square']) assert.equal(Buffer.from(ANCIENT_PAPER_SEALS[shape].split(',')[1], 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('short and long letters preserve arbitrary dynamic text and escape text and signer attributes', () => {
    for (const text of ['见字如晤。\n今夜子时，旧亭相见。', '书信长文。\n'.repeat(220) + '<img src=x onerror=alert(1)> & "终" 🕊️']) {
        const { dom, node } = paper({ text, from: '<script>落款</script>"' });
        assert.equal(node.querySelector('.igs-dfx-document-text').getAttribute('aria-label'), text);
        assert.equal([...node.querySelectorAll('.igs-dfx-document-text > .igs-dfx-document-ink')].map((span) => span.textContent).join(''), text);
        assert.equal(node.querySelector('script'), null);
        assert.equal(node.querySelector('img[onerror]'), null);
        assert.equal(node.querySelector('.igs-dfx-document-sign').textContent, '<script>落款</script>"');
        assert.equal(node.querySelectorAll('img').length, 1);
        assert.equal(node.querySelector('.igs-dfx-document-scroll').tabIndex, 0);
        dom.window.close();
    }
});

test('signature and small seal share a separate final vertical column, including blank signer', () => {
    for (const from of ['', '沈清辞']) {
        const { dom, node } = paper({ text: '展信舒颜', from });
        const column = node.querySelector('.igs-dfx-document-sign-column');
        assert.equal(column.previousElementSibling.tagName, 'BR');
        assert.equal(column.parentNode.lastElementChild, column);
        const tail = column.firstElementChild;
        assert.equal(tail.classList.contains('igs-dfx-document-tail'), true);
        assert.equal(tail.lastElementChild.getAttribute('data-shape'), 'rect');
        if (from) assert.equal(tail.firstElementChild.textContent, from);
        assert.equal(column.lastElementChild.className, 'igs-dfx-document-lower-inset');
        assert.equal(tail.style.animationDelay, `${620 + 4 * 55}ms`);
        dom.window.close();
    }
    assert.match(ANCIENT_PAPER_STYLE_TEXT, /lower-inset\{[^}]*flex:0 0 25%/);
    assert.doesNotMatch(ANCIENT_PAPER_STYLE_TEXT, /document-(?:tail|seal)\{[^}]*position:absolute/);
});

test('notes omit seals, poems use the same paper, edicts and notices use square seals', () => {
    for (const kind of ['note', 'poem', 'edict', 'notice']) {
        const { dom, node } = paper({ text: '动态文书正文' }, { kind, stepMs: 0, startMs: 0 });
        assert.ok(node.querySelector('.igs-dfx-document-paper'));
        const stamp = node.querySelector('.igs-dfx-document-seal');
        if (kind === 'note') assert.equal(stamp, null);
        else assert.equal(stamp.getAttribute('data-shape'), kind === 'poem' ? 'rect' : 'square');
        assert.equal(Boolean(node.querySelector('.igs-dfx-document-heading')), kind === 'edict');
        assert.equal(node.querySelectorAll('.igs-dfx-document-rod').length, kind === 'edict' ? 2 : 0);
        dom.window.close();
    }
});

test('paper sizing uses bounded text-column budgets and the real dialogue-safe stage', () => {
    const short = ancientPaperLayout('今夜子时，竹林见。', 'note');
    const tiny = ancientPaperLayout('稍候', 'note');
    const letter = ancientPaperLayout('见字如晤。山雨将至，盼君早归。', 'letter', '沈清辞');
    const long = ancientPaperLayout('长信正文。'.repeat(200), 'letter', '沈清辞');
    assert.ok(short.rows < letter.rows);
    assert.ok(short.columns < letter.columns);
    assert.ok(tiny.rows < short.rows);
    assert.ok(tiny.columns <= short.columns);
    assert.equal(long.rows, 10);
    assert.equal(long.columns, 6, 'long letters scroll instead of becoming stage-sized posters');
    assert.ok(ancientPaperLayout('山中何事？\n松花酿酒，春水煎茶。', 'poem').columns > 1);
    const { dom, node } = paper({ text: '长信正文。'.repeat(200) });
    assert.equal(node.querySelector('.igs-dfx-document-paper').style.getPropertyValue('--igs-document-columns'), '6');
    assert.match(ANCIENT_PAPER_STYLE_TEXT, /height:min\(100%,var\(--igs-document-max-h\)/);
    assert.match(ANCIENT_PAPER_STYLE_TEXT, /calc\(\(var\(--igs-document-rows,7\) \+ 1\) \* var\(--igs-document-font\)/, 'one vertical glyph of layout slack covers brush-font metrics and punctuation line-break rules');
    dom.window.close();
});

test('the original note preserves all nine literal characters for the browser visibility regression', () => {
    const text = '今夜子时，竹林见。';
    const { dom, node, scroll } = paper({ text }, { kind: 'note', stepMs: 0, startMs: 0 });
    assert.equal([...node.querySelectorAll('.igs-dfx-document-ink')].map((n) => n.textContent).join(''), text);
    assert.equal(node.querySelector('.igs-dfx-document-text').getAttribute('aria-label'), text);
    assert.equal(scroll.scrollTop, 0);
    assert.equal(scroll.scrollLeft, 0);
    assert.equal(ancientPaperLayout(text, 'note').rows, 5);
    assert.equal(ancientPaperLayout(text, 'note').columns, 2);
    dom.window.close();
});

test('official notice has a large horizontal title and double fine frame; imperial edict has yellow paper', () => {
    for (const [text, title, kind] of [['告示：明日辰时前往演武场。', '告示', 'notice'], ['皇榜：征召天下贤才。', '皇榜', 'edict']]) {
        const { dom, node } = paper({ text }, { kind, stepMs: 0, startMs: 0 });
        assert.ok(node.classList.contains('is-notice'));
        assert.equal(node.querySelector('.igs-dfx-document-notice-title').textContent, title);
        assert.equal(node.querySelector('.igs-dfx-document-text').getAttribute('aria-label'), text);
        assert.equal(node.querySelector('.igs-dfx-document-heading'), null, 'official notices do not receive the imperial salutation');
        assert.equal(node.querySelector('.igs-dfx-document-seal').getAttribute('data-shape'), 'square');
        assert.doesNotMatch([...node.querySelectorAll('.igs-dfx-document-text > .igs-dfx-document-ink')].map((n) => n.textContent).join(''), /^(告示|皇榜)/);
        dom.window.close();
    }
    assert.match(ANCIENT_PAPER_STYLE_TEXT, /document-notice-title\{[^}]*writing-mode:horizontal-tb/);
    assert.match(ANCIENT_PAPER_STYLE_TEXT, /:not\(\.is-notice\) \.igs-dfx-document-paper\{[^}]*width:min\(96%,calc\(var\(--igs-document-columns,3\)[^}]*max-width:96%/);
});

test('RTL keyboard, pointer dragging and reduced-motion documents retain horizontal navigation', () => {
    const { dom, node, scroll } = paper({ text: '长信'.repeat(100), from: '寄信人' }, {}, true);
    assert.ok(node.classList.contains('is-reduced'));
    Object.defineProperty(scroll, 'clientWidth', { value: 200 });
    Object.defineProperty(scroll, 'scrollWidth', { value: 1000 });
    scroll.scrollLeft = 0;
    let bubbled = 0;
    node.addEventListener('keydown', () => { bubbled++; });
    scroll.dispatchEvent(event(dom, 'keydown', { key: 'ArrowLeft' }));
    assert.equal(scroll.scrollLeft, -160);
    scroll.dispatchEvent(event(dom, 'keydown', { key: 'ArrowRight' }));
    assert.equal(scroll.scrollLeft, 0);
    scroll.dispatchEvent(event(dom, 'keydown', { key: 'End' }));
    assert.equal(scroll.scrollLeft, -1000);
    scroll.dispatchEvent(event(dom, 'keydown', { key: 'Home' }));
    assert.equal(scroll.scrollLeft, 0);
    assert.equal(bubbled, 0, 'navigation keys do not flip the underlying reading page');
    scroll.setPointerCapture = () => {};
    scroll.hasPointerCapture = () => true;
    scroll.releasePointerCapture = () => {};
    scroll.dispatchEvent(event(dom, 'pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 20 }));
    scroll.dispatchEvent(event(dom, 'pointermove', { pointerId: 1, clientX: 22 }));
    assert.equal(scroll.scrollLeft, 0, 'small tap jitter is not a drag');
    scroll.dispatchEvent(event(dom, 'pointermove', { pointerId: 1, clientX: 140 }));
    assert.equal(scroll.scrollLeft, -120);
    assert.equal(scroll.style.cursor, 'grabbing');
    scroll.dispatchEvent(event(dom, 'pointercancel', { pointerId: 1 }));
    assert.equal(scroll.style.cursor, 'grab');
    scroll.dispatchEvent(event(dom, 'pointermove', { pointerId: 1, clientX: 220 }));
    assert.equal(scroll.scrollLeft, -120, 'cancelled drag never keeps moving');
    dom.window.close();
});

test('animation follows freshly revealed columns only until the reader manually browses', () => {
    const { dom, scroll, node } = paper({ text: '长信正文' });
    const ink = node.querySelector('.igs-dfx-document-ink');
    scroll.getBoundingClientRect = () => ({ left: 100, right: 300 });
    ink.getBoundingClientRect = () => ({ left: 50, right: 75 });
    ink.dispatchEvent(event(dom, 'animationstart'));
    assert.equal(scroll.scrollLeft, -54);
    scroll.dispatchEvent(event(dom, 'touchstart'));
    ink.dispatchEvent(event(dom, 'animationstart'));
    assert.equal(scroll.scrollLeft, -54, 'touch browsing pauses automatic follow');
    dom.window.close();
    const immediate = paper({ text: '即时全文' }, { stepMs: 0, startMs: 0 });
    immediate.scroll.getBoundingClientRect = () => ({ left: 100, right: 300 });
    const first = immediate.node.querySelector('.igs-dfx-document-ink');
    first.getBoundingClientRect = () => ({ left: 50, right: 75 });
    first.dispatchEvent(event(immediate.dom, 'animationstart'));
    assert.equal(immediate.scroll.scrollLeft, 0, 'immediate documents start at the right-hand opening');
    immediate.dom.window.close();
});

test('ancient-only integration keeps original lifetimes, modern DOM, page cleanup and replay', () => {
    for (const ancient of [true, false]) for (const type of ['letter', 'note', 'poem', 'edict']) {
        const root = makeStage();
        const timers = makeTimers();
        const text = '山雨将至，盼君早归。';
        const snapshot = { messageId: 4, readerSettings: { _ancientEra: ancient, dailyFx: { enabled: true, petals: false, [type]: true } }, content: { currentIndex: 0, fx: { daily: [{ type, text, from: '沈清辞' }] } } };
        const ctx = { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, playSfx() {} };
        renderDailyFx(root, snapshot, ctx);
        const front = root.querySelector('#igs-fx-front');
        const node = front.children[0];
        assert.equal(node.className.includes('igs-dfx-document'), ancient);
        const life = type === 'letter' ? DAILY_FX_LIFETIME_MS.letterBase + Array.from(text).length * 55 + 2800 : type === 'note' ? 3800 : type === 'edict' ? 5400 : 4200;
        assert.equal(node.style.vars['--igs-dfx-life'], `${life}ms`);
        timers.advance(life - 1);
        assert.equal(front.children.length, 1);
        timers.advance(1);
        assert.equal(front.children.length, 0);
        cancelDailyFx(root);
        assert.equal(timers.size(), 0);
        snapshot.content.currentIndex = 1;
        renderDailyFx(root, snapshot, ctx);
        assert.equal(front.children.length, 1);
        snapshot.content.currentIndex = 2;
        snapshot.content.fx = { daily: [] };
        renderDailyFx(root, snapshot, ctx);
        assert.equal(front.children.length, 0, 'changing page removes the scroll document');
        cancelDailyFx(root);
        assert.equal(timers.size(), 0);
    }
});

test('edict builder selects official notices without changing modern output', () => {
    for (const ancient of [true, false]) for (const text of ['奉旨前往山门', '告示：明日辰时前往演武场']) {
        const root = makeStage();
        const built = RITES_BUILDERS.edict({ text }, { root, doc: root.ownerDocument, hold: 1, ancient });
        assert.equal(built.life, 5400);
        assert.deepEqual(built.sounds, ['edict-open']);
        assert.equal(built.node.className.includes('is-notice'), text.startsWith('告示'));
        if (ancient) assert.match(built.node.innerHTML, /data-shape="square"/);
        else assert.match(built.node.innerHTML, /igs-dfx-edict-sheet/);
    }
    assert.match(ANCIENT_PAPER_STYLE_TEXT, /overflow-x:auto;overflow-y:hidden/);
    assert.match(ANCIENT_PAPER_STYLE_TEXT, /scrollbar-width:none/);
    assert.match(ANCIENT_PAPER_STYLE_TEXT, /omikuji\.is-ancient \.igs-dfx-slip\{[^}]*background-image:url/);
});
