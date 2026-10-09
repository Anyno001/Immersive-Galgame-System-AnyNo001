import test from 'node:test';
import assert from 'node:assert/strict';
import { syncStorm, fitStorm, stopStorm, formatStormCount } from '../src/visual/igs-ui/storm-phone.js';
import { STORM_STYLE_TEXT } from '../src/visual/igs-ui/storm-style.js';

class FakeNode {
    constructor(doc, tag) {
        this.ownerDocument = doc;
        this.tagName = tag;
        this.children = [];
        this.parentNode = null;
        this.attrs = new Map();
        const styleProps = new Map();
        this.style = { setProperty: (k, v) => styleProps.set(k, v), removeProperty: (k) => styleProps.delete(k), get: (k) => styleProps.get(k) };
        this.hidden = false;
        this.id = '';
        this.className = '';
        this.innerHTML = '';
        this._text = '';
        const node = this;
        this.classList = {
            add(name) { if (!node.classes().includes(name)) node.className = `${node.className} ${name}`.trim(); },
            contains(name) { return node.classes().includes(name); },
        };
    }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get isConnected() {
        let n = this;
        while (n.parentNode) n = n.parentNode;
        return n.isRoot === true;
    }
    classes() { return this.className.split(/\s+/).filter(Boolean); }
    appendChild(child) {
        if (child.parentNode) child.remove();
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    insertBefore(child, ref) {
        if (child.parentNode) child.remove();
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(child);
        else this.children.splice(index, 0, child);
        child.parentNode = this;
        return child;
    }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
        this.parentNode = null;
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    removeAttribute(name) { this.attrs.delete(name); }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    hasAttribute(name) { return this.attrs.has(name); }
    matches(selector) { return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tagName === selector; }
    querySelectorAll(selector) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (c.matches(selector)) out.push(c); walk(c); } };
        walk(this);
        return out;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function makeHost() {
    const doc = { createElement: (tag) => new FakeNode(doc, tag) };
    const host = new FakeNode(doc, 'div');
    host.isRoot = true;
    return { doc, host };
}

function clock() {
    const queue = [];
    let t = 1000;
    return {
        queue,
        schedule(fn, ms) { const timer = { fn, due: t + ms }; queue.push(timer); return timer; },
        clear(timer) { const i = queue.indexOf(timer); if (i >= 0) queue.splice(i, 1); },
        now: () => t,
        run(ms) {
            const end = t + ms;
            for (;;) {
                const due = queue.filter((timer) => timer.due <= end).sort((a, b) => a.due - b.due)[0];
                if (!due) break;
                queue.splice(queue.indexOf(due), 1);
                t = Math.max(t, due.due);
                due.fn();
            }
            t = end;
        },
    };
}

const mk = (c, doc, extra = {}) => ({ doc, schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.5, reduced: false, worldview: 'modern', model: 'full', size: 'large', ...extra });
const men = (author, text, fresh = true) => ({ author, text, fresh });
const nums = (host, key) => Number(host.querySelector(`.igs-storm-stat`) && host.querySelectorAll('.igs-storm-stat').find((s) => s.getAttribute('data-stat') === key).querySelector('.igs-storm-num').getAttribute('data-n'));
const notes = (host) => host.querySelectorAll('.igs-storm-note').filter((n) => n.getAttribute('data-leaving') !== '1');

test('storm:raises-with-hot-bar-text', () => {
    const { doc, host } = makeHost();
    const c = clock();
    syncStorm(host, { platform: 'weibo', tone: 'red', topic: '#某人官宣#', mentions: [] }, mk(c, doc));
    const root = host.querySelector('.igs-storm-stage');
    assert.ok(root.classList.contains('igs-live-stage'));
    assert.equal(root.getAttribute('data-platform'), 'weibo');
    assert.ok(root.querySelector('.igs-live-phone').querySelector('.igs-phone-status'));
    assert.equal(root.querySelector('.igs-storm-hot-label').textContent, '热搜');
    assert.equal(root.querySelector('.igs-storm-topic').textContent, '#某人官宣#');
    assert.equal(notes(host).length, 0);
});

test('storm:tone-and-tag', () => {
    const a = makeHost();
    const c = clock();
    syncStorm(a.host, { platform: 'weibo', tone: 'red', topic: 'x', mentions: [] }, mk(c, a.doc));
    assert.equal(a.host.querySelector('.igs-storm-stage').getAttribute('data-tone'), 'red');
    assert.equal(a.host.querySelector('.igs-storm-tag').textContent, '爆');
    assert.equal(a.host.querySelector('.igs-storm-vignette'), null);
    const b = makeHost();
    syncStorm(b.host, { platform: 'weibo', tone: 'black', topic: 'x', mentions: [] }, mk(c, b.doc));
    assert.equal(b.host.querySelector('.igs-storm-stage').getAttribute('data-tone'), 'black');
    assert.equal(b.host.querySelector('.igs-storm-tag').textContent, '沸');
    assert.ok(b.host.querySelector('.igs-storm-vignette'));
    c.run(100);
    assert.equal(b.host.querySelector('.igs-storm-vignette').getAttribute('data-on'), '1');
});

test('storm:notes-max-four-newest-on-top', () => {
    const { doc, host } = makeHost();
    const c = clock();
    const mentions = ['甲', '乙', '丙', '丁', '戊', '己'].map((n) => men(n, `内容${n}`));
    syncStorm(host, { platform: 'weibo', tone: 'red', topic: 't', mentions }, mk(c, doc));
    c.run(20000);
    const list = notes(host);
    assert.ok(list.length <= 4 && list.length >= 1);
    assert.equal(host.querySelectorAll('.igs-storm-note').length <= 5, true);
    // 第一条播的是队首「甲」，随后新的压在上面
    const first = host.querySelector('.igs-storm-notes').children[0];
    assert.ok(first.querySelector('.igs-storm-note-text').textContent.startsWith('内容'));
    const c2 = clock();
    const h2 = makeHost();
    syncStorm(h2.host, { platform: 'weibo', tone: 'red', topic: 't', mentions: mentions.slice(0, 3) }, mk(c2, h2.doc));
    c2.run(2700 * 2);
    const authors = h2.host.querySelectorAll('.igs-storm-author').map((n) => n.textContent);
    assert.deepEqual(authors.slice(0, 3), ['丙', '乙', '甲']);
    assert.equal(h2.host.querySelectorAll('.igs-storm-at')[0].textContent, '@你');
});

test('storm:note-text-clipped-to-40', () => {
    const { doc, host } = makeHost();
    const c = clock();
    syncStorm(host, { platform: 'weibo', tone: 'red', topic: 't', mentions: [men('甲', '字'.repeat(60))] }, mk(c, doc));
    const text = host.querySelector('.igs-storm-note-text').textContent;
    assert.equal(Array.from(text).length, 41);
});

test('storm:keeps-root-across-pages-and-appends', () => {
    const { doc, host } = makeHost();
    const c = clock();
    const s1 = syncStorm(host, { platform: 'weibo', tone: 'red', topic: 't', mentions: [men('甲', 'a')] }, mk(c, doc));
    const root = host.querySelector('.igs-storm-stage');
    c.run(3000);
    const before = nums(host, 'repost');
    const s2 = syncStorm(host, { platform: 'weibo', tone: 'red', topic: 't', mentions: [men('甲', 'a', false), men('乙', 'b')] }, mk(c, doc));
    assert.equal(s1, s2);
    assert.equal(host.querySelectorAll('.igs-storm-stage').length, 1);
    assert.equal(host.querySelector('.igs-storm-stage'), root);
    assert.ok(nums(host, 'repost') >= before);
    c.run(400);
    assert.equal(host.querySelectorAll('.igs-storm-author')[0].textContent, '乙');
    // 跨楼 mentions 为空风暴仍在
    syncStorm(host, { platform: 'weibo', tone: 'red', topic: 't', mentions: [] }, mk(c, doc));
    assert.equal(host.querySelector('.igs-storm-stage'), root);
    // topic 变化 = 新风暴
    syncStorm(host, { platform: 'weibo', tone: 'red', topic: 't2', mentions: [] }, mk(c, doc));
    c.run(1000);
    const roots = host.querySelectorAll('.igs-storm-stage');
    assert.equal(roots.length, 1);
    assert.notEqual(roots[0], root);
});

test('storm:empty-platform-falls-back-by-worldview', () => {
    const a = makeHost();
    const c = clock();
    syncStorm(a.host, { platform: '', tone: 'red', topic: 't', mentions: [] }, mk(c, a.doc));
    assert.equal(a.host.querySelector('.igs-storm-stage').getAttribute('data-platform'), 'weibo');
    const b = makeHost();
    syncStorm(b.host, { platform: '', tone: 'red', topic: 't', mentions: [men('甲', 'a')] }, mk(c, b.doc, { worldview: 'ancient' }));
    assert.equal(b.host.querySelector('.igs-storm-stage').getAttribute('data-platform'), 'notice');
    assert.equal(b.host.querySelector('.igs-storm-plat').textContent, '告示');
});

test('storm:null-retires', () => {
    const { doc, host } = makeHost();
    const c = clock();
    syncStorm(host, { platform: 'weibo', tone: 'black', topic: 't', mentions: [men('甲', 'a')] }, mk(c, doc));
    assert.equal(syncStorm(host, null, mk(c, doc)), null);
    assert.equal(host.querySelector('.igs-storm-stage').getAttribute('data-leaving'), '1');
    c.run(600);
    assert.equal(host.querySelector('.igs-storm-stage'), null);
    assert.equal(c.queue.length, 0);
    assert.equal(stopStorm(host), false);
});

test('storm:stop-clears-timers', () => {
    const { doc, host } = makeHost();
    const c = clock();
    syncStorm(host, { platform: 'weibo', tone: 'red', topic: 't', mentions: [men('甲', 'a')] }, mk(c, doc));
    assert.equal(stopStorm(host), true);
    assert.equal(host.querySelector('.igs-storm-stage'), null);
    assert.equal(c.queue.length, 0);
});

test('storm:reduced-no-shake-no-hearts', () => {
    const { doc, host } = makeHost();
    const c = clock();
    syncStorm(host, { platform: 'weibo', tone: 'red', topic: 't', mentions: [men('甲', 'a')] }, mk(c, doc, { reduced: true }));
    assert.equal(host.querySelector('.igs-storm-screen').getAttribute('data-shake'), null);
    c.run(20000);
    assert.equal(host.querySelectorAll('.igs-storm-heart').length, 0);
    const m = makeHost();
    syncStorm(m.host, { platform: 'weibo', tone: 'red', topic: 't', mentions: [] }, mk(c, m.doc));
    assert.equal(m.host.querySelector('.igs-storm-screen').getAttribute('data-shake'), '1');
    c.run(4000);
    const hearts = m.host.querySelectorAll('.igs-storm-heart').length;
    assert.ok(hearts >= 1 && hearts <= 6);
});

test('storm:text-content-only', () => {
    const { doc, host } = makeHost();
    const c = clock();
    const evil = '<img src=x onerror=alert(1)>';
    syncStorm(host, { platform: 'weibo', tone: 'red', topic: evil, mentions: [men(evil, evil)] }, mk(c, doc));
    assert.equal(host.querySelectorAll('img').length, 0);
    assert.equal(host.querySelector('.igs-storm-topic').textContent, evil);
    assert.equal(host.querySelector('.igs-storm-author').textContent, evil);
    assert.equal(host.querySelector('.igs-storm-note-text').textContent, evil);
});

test('storm:counts-grow-and-black-fans-fall', () => {
    const r = makeHost();
    const c = clock();
    syncStorm(r.host, { platform: 'weibo', tone: 'red', topic: 'g', mentions: [] }, mk(c, r.doc));
    const f0 = nums(r.host, 'fans');
    const r0 = nums(r.host, 'repost');
    c.run(10000);
    assert.ok(nums(r.host, 'fans') > f0);
    assert.ok(nums(r.host, 'repost') > r0);
    const b = makeHost();
    syncStorm(b.host, { platform: 'weibo', tone: 'black', topic: 'g', mentions: [] }, mk(c, b.doc));
    const bf = nums(b.host, 'fans');
    const bc = nums(b.host, 'comment');
    c.run(10000);
    assert.ok(nums(b.host, 'fans') < bf);
    assert.ok(nums(b.host, 'comment') > bc);
});

test('storm:format-and-fit-and-style', () => {
    assert.equal(formatStormCount(5000), '5000');
    assert.equal(formatStormCount(32000), '3.2万');
    assert.equal(formatStormCount(30000), '3万');
    assert.equal(formatStormCount(1500, 999), '999+');
    const { doc, host } = makeHost();
    const c = clock();
    syncStorm(host, { platform: 'weibo', tone: 'red', topic: 't', mentions: [] }, mk(c, doc));
    fitStorm(host, null, { top: 20, height: 500, width: 250, under: 30 });
    const phone = host.querySelector('.igs-live-phone');
    assert.equal(phone.style.get('--igs-live-h'), '500px');
    assert.equal(phone.style.get('--igs-live-w'), '250px');
    assert.ok(!/backdrop-filter|filter:/.test(STORM_STYLE_TEXT));
});
