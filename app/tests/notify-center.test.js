import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDanmakuToDom, cancelDanmaku } from '../src/visual/igs-ui/danmaku-runtime.js';
import { NOTICE_MAX, collectNotices, createNoticeStore, groupNotices, normalizeNotifyCenterSettings, recordNotices } from '../src/visual/igs-ui/notify-center.js';
import { NOTIFY_CENTER_STYLE_TEXT } from '../src/visual/igs-ui/notify-center-style.js';

import { grownCount, lowBattery, storyClock } from '../src/visual/igs-ui/phone-sense.js';

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
        this.listeners = {};
        this.innerHTML = '';
        this._text = '';
        this.scrollTop = 0;
        this.scrollHeight = 0;
        this.clientWidth = 0;
        this.clientHeight = 0;
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
    addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); }
    matches(selector) {
        return selector.split(',').map((s) => s.trim()).some((s) => (s.includes(' ') ? false : s.startsWith('#') ? this.id === s.slice(1) : this.classList.contains(s.slice(1))));
    }
    querySelectorAll(selector) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (c.matches(selector)) out.push(c); walk(c); } };
        walk(this);
        return out;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function makeRoot() {
    const doc = { createElement: (tag) => new FakeNode(doc, tag) };
    const root = new FakeNode(doc, 'div');
    root.isRoot = true;
    const motion = root.appendChild(new FakeNode(doc, 'div'));
    motion.id = 'igs-stage-motion';
    motion.clientWidth = 1280;
    motion.clientHeight = 720;
    for (const id of ['igs-bg', 'igs-sprite', 'igs-click-layer', 'igs-dialog-layer']) {
        const el = motion.appendChild(new FakeNode(doc, 'div'));
        el.id = id;
    }
    return { root, motion, doc };
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

function snapshot(content, readerSettings, messageId = 7) {
    return {
        messageId,
        content: { currentIndex: 0, displayText: '台词', textType: 'dialogue', speaker: '爱丽丝', ...content },
        readerSettings,
    };
}

const opts = (c, extra = {}) => ({ schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.9, reducedMotion: false, userName: '小明', chatId: 'c1', ...extra });
const ON = {};
const click = (node) => { for (const fn of node.listeners.click || []) fn({ stopPropagation() {}, target: node }); };

test('gate:notify:collects-every-source-from-the-page-text', () => {
    const fx = {
        instants: [
            { kind: 'notify', sender: '妈妈', text: '早点回家' },
            { kind: 'voicemail', sender: '快递', text: '放门口了' },
            { kind: 'call-end', reason: 'missed', name: '老板', dir: 'in', mode: 'voice' },
            { kind: 'call-end', reason: 'end', name: '老板', dir: 'in', mode: 'voice' },
        ],
        storm: { platform: 'weibo', mentions: [{ author: '路人', text: '笑死', fresh: true }, { author: '旧', text: '旧评', fresh: false }] },
        feed: { platform: 'tieba', posts: [{ author: '甲', text: '@小明 来一下', fresh: true }, { author: '乙', text: '无关', fresh: true }, { author: '丙', text: '@你 看这', fresh: true }, { author: '丁', text: '@小明 旧帖', fresh: false }] },
    };
    const list = collectNotices({ messageId: 3, content: { currentIndex: 2, fx } }, { userName: '小明', feedOn: true, stormOn: true });
    assert.deepEqual(list.map((n) => `${n.kind}:${n.app}:${n.from}:${n.text}`), [
        'notify:notify:妈妈:早点回家', 'voicemail:voicemail:快递:放门口了', 'missed:call:老板:',
        'mention:weibo:路人:笑死', 'post:tieba:甲:@小明 来一下', 'post:tieba:丙:@你 看这',
    ]);
    assert.equal(list[0].messageId, 3);
    assert.equal(list[0].page, 2);
    assert.equal(collectNotices({ messageId: 3, content: { fx } }, {}).length, 3, 'feed and storm need their switches');
});

test('gate:notify:dedupes-same-page-and-caps-at-fifty', () => {
    const store = createNoticeStore('x');
    const n = { messageId: 1, page: 0, kind: 'notify', app: 'notify', from: 'a', text: 'hi' };
    assert.equal(recordNotices(store, [n]), 1);
    assert.equal(recordNotices(store, [{ ...n }]), 0);
    assert.equal(recordNotices(store, [{ ...n, page: 1 }]), 1);
    for (let i = 0; i < 80; i += 1) recordNotices(store, [{ ...n, messageId: 10 + i }]);
    assert.equal(store.items.length, NOTICE_MAX);
    assert.equal(store.items[store.items.length - 1].messageId, 89);
    assert.equal(store.unread <= NOTICE_MAX, true);
    const groups = groupNotices([{ ...n, app: 'call' }, { ...n, app: 'notify', text: 'b' }, { ...n, app: 'call', text: 'c' }]);
    assert.deepEqual(groups.map((g) => g.app), ['call', 'notify']);
    assert.equal(groups[0].list[0].text, 'c');
});

test('gate:notify:entry-appears-with-badge-and-opens-grouped-then-reads', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const fx = { instants: [{ kind: 'notify', sender: '妈妈', text: '早点回家' }, { kind: 'voicemail', sender: '快递', text: '放门口了' }] };
    applyDanmakuToDom(root, snapshot({ fx }, ON, 12), opts(c));
    const entry = motion.querySelector('.igs-nc-entry');
    assert.ok(entry);
    assert.equal(entry.hidden, false);
    assert.equal(entry.querySelector('.igs-nc-badge').textContent, '2');
    assert.match(entry.innerHTML, /<svg/);
    click(entry);
    const panel = motion.querySelector('.igs-nc-panel');
    assert.ok(panel);
    const groups = panel.querySelectorAll('.igs-nc-group');
    assert.equal(groups.length, 2);
    assert.equal(groups[0].getAttribute('data-app'), 'voicemail');
    assert.equal(groups[0].querySelector('.igs-nc-text').textContent, '放门口了');
    assert.equal(groups[0].querySelector('.igs-nc-from').textContent, '快递');
    assert.equal(groups[0].querySelector('.igs-nc-floor').textContent, '第 12 楼');
    assert.equal(groups[0].querySelector('.igs-nc-dot').style.get('background'), '#8a63d2');
    assert.equal(entry.querySelector('.igs-nc-badge').hidden, true);
    assert.equal(entry.getAttribute('data-unread'), '0');
    // 再渲染同一页不重复记。
    applyDanmakuToDom(root, snapshot({ fx }, ON, 12), opts(c));
    assert.equal(motion.querySelectorAll('.igs-nc-group').length, 2);
    assert.equal(motion.querySelectorAll('.igs-nc-item').length, 2);
    // 点遮罩关闭。
    const overlay = motion.querySelector('.igs-nc');
    for (const fn of overlay.listeners.click) fn({ stopPropagation() {}, target: overlay });
    assert.equal(motion.querySelector('.igs-nc'), null);
});

test('gate:notify:clicks-never-bubble-to-the-reader', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    applyDanmakuToDom(root, snapshot({ fx: { instants: [{ kind: 'notify', sender: 'a', text: 'b' }] } }, ON), opts(c));
    click(motion.querySelector('.igs-nc-entry'));
    const panel = motion.querySelector('.igs-nc-panel');
    let stopped = 0;
    for (const name of ['pointerdown', 'click', 'wheel', 'keydown', 'touchstart']) {
        for (const fn of panel.listeners[name] || []) fn({ stopPropagation() { stopped += 1; }, target: panel });
    }
    assert.equal(stopped, 5);
    assert.ok(motion.querySelector('.igs-nc'), 'clicking inside the panel keeps it open');
});

test('gate:notify:clear-all-empties-list-and-hides-entry', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const fx = { instants: [{ kind: 'notify', sender: 'a', text: 'b' }] };
    applyDanmakuToDom(root, snapshot({ fx }, ON), opts(c));
    click(motion.querySelector('.igs-nc-entry'));
    click(motion.querySelector('.igs-nc-clear'));
    assert.equal(motion.querySelector('.igs-nc'), null);
    assert.equal(motion.querySelector('.igs-nc-entry').hidden, true);
    applyDanmakuToDom(root, snapshot({ fx }, ON), opts(c));
    assert.equal(motion.querySelector('.igs-nc-entry'), null, 'same page replay does not bring cleared items back');
});

test('gate:notify:badge-caps-at-fifty-and-keeps-across-cancel', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    for (let i = 0; i < 60; i += 1) applyDanmakuToDom(root, snapshot({ currentIndex: i, fx: { instants: [{ kind: 'notify', sender: 'a', text: `m${i}` }] } }, ON, 5), opts(c));
    assert.equal(motion.querySelector('.igs-nc-badge').textContent, '50');
    cancelDanmaku(root);
    applyDanmakuToDom(root, snapshot({ currentIndex: 61, fx: {} }, ON, 5), opts(c));
    assert.equal(motion.querySelector('.igs-nc-badge').textContent, '50', 'store survives cancel');
    applyDanmakuToDom(root, snapshot({ currentIndex: 62, fx: {} }, ON, 5), opts(c, { chatId: 'c2' }));
    assert.equal(motion.querySelector('.igs-nc-entry'), null, 'switching chat clears');
});

test('gate:notify:text-is-never-parsed-as-html', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const evil = '<img src=x onerror=alert(1)>';
    applyDanmakuToDom(root, snapshot({ fx: { instants: [{ kind: 'notify', sender: '<b>x</b>', text: evil }] } }, ON), opts(c));
    click(motion.querySelector('.igs-nc-entry'));
    const text = motion.querySelector('.igs-nc-text');
    assert.equal(text.textContent, evil);
    assert.equal(text.innerHTML, '');
    assert.equal(motion.querySelector('.igs-nc-from').textContent, '<b>x</b>');
});

test('gate:notify:disabled-or-empty-builds-zero-nodes', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const fx = { instants: [{ kind: 'notify', sender: 'a', text: 'b' }] };
    applyDanmakuToDom(root, snapshot({ fx }, { notifyCenter: { enabled: false } }), opts(c));
    assert.equal(motion.querySelector('#igs-fx-stage'), null);
    assert.equal(motion.querySelector('.igs-nc-entry'), null);
    applyDanmakuToDom(root, snapshot({ fx: {} }, ON), opts(c));
    assert.equal(motion.querySelector('#igs-fx-stage'), null);
    assert.equal(normalizeNotifyCenterSettings(undefined).enabled, true);
    assert.equal(normalizeNotifyCenterSettings({ enabled: false }).enabled, false);
    assert.match(NOTIFY_CENTER_STYLE_TEXT, /translateY\(-100%\)/);
});
