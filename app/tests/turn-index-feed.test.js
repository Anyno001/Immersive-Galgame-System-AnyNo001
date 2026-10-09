import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnIndexPanel } from '../src/visual/igs-ui/turn-index-panel.js';

// 最小假 DOM：面板只用 createElement / appendChild / 事件 / innerHTML，点击靠手造的 target。
function makeDoc() {
    const listeners = {};
    const attrs = {};
    const root = {
        id: '', innerHTML: '',
        classList: { add() { }, remove() { }, toggle() { } },
        setAttribute: (k, v) => { attrs[k] = String(v); },
        removeAttribute: (k) => { delete attrs[k]; },
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        addEventListener: (type, fn) => { listeners[type] = fn; },
        removeEventListener: (type) => { delete listeners[type]; },
        querySelector: () => null,
        getBoundingClientRect: () => ({ width: 1000, height: 700 }),
        remove() { },
    };
    const doc = { activeElement: null, createElement: () => root };
    const container = { appendChild() { }, classList: { toggle() { } }, setAttribute() { }, removeAttribute() { } };
    return { doc, container, root, listeners };
}

function makeProgress() {
    return {
        getFarthest: () => null, getLast: () => null, floorState: () => 'unread', chapterAt: () => '',
        listSlots: () => [], getQuick: () => null,
    };
}

const POST_A = '正文[igs-fx:app|微博][igs-fx:post|小明|今天好热 #夏天#|热搜][igs-fx:reply|路人|同感][igs-fx:reply|阿花|+1][igs-fx:app-end]';
const POST_B = '[igs-fx:app|贴吧][igs-fx:post|楼主|<img src=x onerror=1> & "引号"|某吧][igs-fx:app-end]';

function setup(texts, extra = {}) {
    const dom = makeDoc();
    const jumps = [];
    const turns = texts.map((text, i) => ({ id: i * 2, text }));
    const panel = createTurnIndexPanel(dom.doc, {
        progress: makeProgress(),
        tab: 'feed',
        listTurns: async () => turns,
        snippetOf: () => '已剥标签',
        rawOf: (turn) => turn.text,
        currentId: () => null,
        onJump: (target) => { jumps.push(target); },
        ...extra,
    });
    return { dom, panel, jumps };
}

const rowKeys = (html) => [...html.matchAll(/data-ti-act="feed-select" data-ti-value="([^"]+)"/g)].map((m) => m[1]);

test('gate:turn-index-feed lists posts newest floor first and shows only parsed platforms as chips', async () => {
    const { dom, panel } = setup([POST_A, '没有帖子', POST_B]);
    await panel.open(dom.container);
    const html = dom.root.innerHTML;
    assert.equal(panel.getState().tab, 'feed');
    assert.deepEqual(rowKeys(html), ['4:0', '0:0']);
    assert.match(html, /data-ti-value="feed"[^>]*aria-selected="true"/);
    assert.match(html, />全部</);
    assert.match(html, />微博</);
    assert.match(html, />贴吧</);
    assert.doesNotMatch(html, />朋友圈</);
    assert.match(html, /今天好热/);
});

test('gate:turn-index-feed platform filter narrows list and clears selection', async () => {
    const { dom, panel } = setup([POST_A, POST_B]);
    await panel.open(dom.container);
    await panel.act('feed-select', '0:0');
    assert.equal(panel.getState().feedKey, '0:0');
    await panel.act('feed-filter', 'tieba');
    assert.deepEqual(rowKeys(dom.root.innerHTML), ['2:0']);
    assert.equal(panel.getState().feedKey, '');
    assert.match(dom.root.innerHTML, /正文里刷到的帖子会收在这里/);
    await panel.act('feed-filter', '');
    assert.equal(rowKeys(dom.root.innerHTML).length, 2);
});

test('gate:turn-index-feed selecting a post shows detail with replies and jump button calls onJump', async () => {
    const { dom, panel, jumps } = setup([POST_A, POST_B]);
    await panel.open(dom.container);
    await panel.act('feed-select', '0:0');
    const html = dom.root.innerHTML;
    assert.match(html, /<h3>小明<\/h3>/);
    assert.match(html, /微博<i aria-hidden="true">·<\/i>第 0 楼<i aria-hidden="true">·<\/i>热搜/);
    assert.match(html, /<strong>路人<\/strong>：同感/);
    assert.match(html, /<strong>阿花<\/strong>：\+1/);
    assert.match(html, /跳到这一楼/);
    const button = { getAttribute: (k) => ({ 'data-ti-act': 'floor', 'data-ti-value': '0' })[k] || null, parentNode: null };
    dom.listeners.click({ target: button, stopPropagation() { } });
    await panel.whenIdle();
    assert.deepEqual(jumps, [{ id: 0, page: 0 }]);
    assert.equal(panel.isOpen(), false);
});

test('gate:turn-index-feed shows empty state when no floor has posts', async () => {
    const { dom, panel } = setup(['普通正文', '[igs-fx:shake]']);
    await panel.open(dom.container);
    assert.match(dom.root.innerHTML, /还没有刷到过帖子/);
    assert.match(dom.root.innerHTML, /正文里刷到的帖子会收在这里/);
    assert.deepEqual(rowKeys(dom.root.innerHTML), []);
});

test('gate:turn-index-feed escapes AI text in list and detail', async () => {
    const { dom, panel } = setup([POST_B]);
    await panel.open(dom.container);
    assert.doesNotMatch(dom.root.innerHTML, /<img/);
    await panel.act('feed-select', '0:0');
    const html = dom.root.innerHTML;
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img src=x onerror=1&gt; &amp; &quot;引号&quot;/);
});

test('gate:turn-index-feed parses lazily and only once per floor', async () => {
    let calls = 0;
    const { dom, panel } = setup([POST_A], { tab: 'floors', rawOf: (turn) => { calls += 1; return turn.text; } });
    await panel.open(dom.container);
    assert.equal(calls, 0, '楼层分页不解析');
    await panel.act('tab', 'feed');
    assert.equal(calls, 1);
    await panel.act('feed-select', '0:0');
    assert.equal(calls, 1, '缓存命中不重复解析');
    assert.equal(panel.getState().tab, 'feed');
});
