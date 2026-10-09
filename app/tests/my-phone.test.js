import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDanmakuToDom } from '../src/visual/igs-ui/danmaku-runtime.js';
import { applyPhoneLook, myPhoneOf, normalizeMyPhone, phoneWallUrl } from '../src/visual/igs-ui/my-phone.js';
import { renderMyPhoneFields } from '../src/visual/igs-ui/my-phone-fields.js';
import { renderDanmakuFields } from '../src/visual/igs-ui/danmaku-settings-fields.js';
import { FX_SETTINGS_NORMALIZERS, normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { searchSettings } from '../src/visual/igs-ui/settings-search.js';


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

const post = (author, text) => ({ author, text, extra: '', replies: [], fresh: true });
const opts = (c) => ({ schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.9, reducedMotion: false });
const LOOK = { myPhone: { model: 'notch', caseColor: '#7a2f3a' } };

test('gate:my-phone:normalize-defaults-and-clamps', () => {
    assert.deepEqual(normalizeMyPhone(undefined), { model: 'full', size: 'large', caseColor: '#111215', wallpaper: 'scene', ringtone: 'classic' });
    const bad = normalizeMyPhone({ model: 'x', size: 'y', caseColor: 'red', wallpaper: 'javascript:alert(1)', ringtone: 'loud' });
    assert.deepEqual(bad, { model: 'full', size: 'large', caseColor: '#111215', wallpaper: 'scene', ringtone: 'classic' });
    assert.equal(normalizeMyPhone({ wallpaper: 'https://a.test/w.png' }).wallpaper, 'https://a.test/w.png');
    assert.equal(normalizeMyPhone({ wallpaper: 'https://a.test/"x".png' }).wallpaper, 'scene');
    assert.equal(normalizeMyPhone({ wallpaper: 'data:image/png;base64,AAAA' }).wallpaper, 'data:image/png;base64,AAAA');
    assert.equal(normalizeMyPhone({ wallpaper: '/img/w.png' }).wallpaper, '/img/w.png');
    assert.equal(normalizeMyPhone({ wallpaper: 'none' }).wallpaper, 'none');
    assert.equal(normalizeMyPhone({ caseColor: '#ABCDEF' }).caseColor, '#abcdef');
});

test('gate:my-phone:migrates-model-and-size-from-live-fx', () => {
    assert.deepEqual(
        { model: myPhoneOf({ liveFx: { model: 'fold', size: 'fit' } }).model, size: myPhoneOf({ liveFx: { model: 'fold', size: 'fit' } }).size },
        { model: 'fold', size: 'fit' },
    );
    assert.equal(myPhoneOf({ liveFx: { model: 'fold' }, myPhone: { model: 'tablet' } }).model, 'tablet');
    assert.equal(myPhoneOf({ liveFx: { model: 'fold' }, myPhone: { caseColor: '#2f4a7a' } }).model, 'fold');
    assert.equal(normalizeFxReaderSettings({ liveFx: { model: 'notch' } }).myPhone.model, 'notch');
    assert.ok(FX_SETTINGS_NORMALIZERS.myPhone);
});

test('gate:my-phone:apply-look-writes-only-on-change', () => {
    let writes = 0;
    const el = { style: { setProperty() { writes += 1; }, removeProperty() { writes += 1; } }, setAttribute() { writes += 1; } };
    const look = { model: 'tablet', caseColor: '#2f4a7a', wallpaper: 'scene' };
    assert.equal(applyPhoneLook(el, look), true);
    const first = writes;
    assert.ok(first >= 3);
    assert.equal(applyPhoneLook(el, { ...look }), false);
    assert.equal(writes, first);
    assert.equal(applyPhoneLook(el, { ...look, caseColor: '#e8e6e1' }), true);
    assert.ok(writes > first);
    assert.equal(phoneWallUrl({ wallpaper: 'scene' }, 'bg.png'), 'bg.png');
    assert.equal(phoneWallUrl({ wallpaper: 'none' }, 'bg.png'), '');
    assert.equal(phoneWallUrl({ wallpaper: 'https://a.test/w.png' }, 'bg.png'), 'https://a.test/w.png');
});

function stageOf(motion, cls) {
    const stage = motion.querySelector(cls);
    assert.ok(stage, cls);
    return stage;
}

test('gate:my-phone:live-feed-storm-share-one-look', () => {
    const live = { name: '爱丽丝', title: 't', view: 'watch' };
    const a = makeRoot();
    applyDanmakuToDom(a.root, snapshot({ fx: { live } }, { ...LOOK, liveFx: { enabled: true } }), opts(clock()));
    const feed = makeRoot();
    applyDanmakuToDom(feed.root, snapshot({ fx: { feed: { platform: 'weibo', posts: [post('甲', '一')] } } }, { ...LOOK, feedFx: { enabled: true } }), opts(clock()));
    const storm = makeRoot();
    const stormFx = { platform: 'weibo', tone: 'black', topic: '#塌房#', mentions: [{ author: '路人', text: '@你', fresh: true }] };
    applyDanmakuToDom(storm.root, snapshot({ fx: { storm: stormFx } }, { ...LOOK, feedFx: { enabled: true } }), opts(clock()));
    const stages = [
        stageOf(a.motion, '.igs-live-stage'),
        stageOf(feed.motion, '.igs-feed-stage'),
        stageOf(storm.motion, '.igs-storm-stage'),
    ];
    for (const stage of stages) {
        assert.equal(stage.getAttribute('data-model'), 'notch');
        assert.equal(stage.style.get('--igs-phone-case'), '#7a2f3a');
    }
});

test('gate:my-phone:live-fx-model-still-migrates-at-runtime', () => {
    const a = makeRoot();
    applyDanmakuToDom(a.root, snapshot({ fx: { live: { name: '爱丽丝', title: 't', view: 'watch' } } }, { liveFx: { enabled: true, model: 'fold' } }), opts(clock()));
    assert.equal(stageOf(a.motion, '.igs-live-stage').getAttribute('data-model'), 'fold');
});

test('gate:my-phone:settings-row-and-live-fields', () => {
    const html = renderMyPhoneFields({ myPhone: { model: 'fold', caseColor: '#2f6b52', wallpaper: 'none', ringtone: 'soft' } });
    for (const text of ['我的手机', '机型', '大小', '手机壳', '壁纸', '铃声']) assert.ok(html.includes(text), text);
    assert.ok(html.includes('readerSettings.myPhone.model'));
    assert.ok(html.includes('readerSettings.myPhone.caseColor'));
    assert.ok(html.includes('readerSettings.myPhone.wallpaper'));
    assert.ok(html.includes('readerSettings.myPhone.ringtone'));
    const live = renderDanmakuFields({ liveFx: { enabled: true, layout: 'phone' } }).live;
    assert.ok(live.includes('readerSettings.liveFx.layout'));
    assert.ok(!live.includes('机型'));
    assert.ok(!live.includes('liveFx.model'));
    assert.ok(!live.includes('liveFx.size'));
    const custom = renderMyPhoneFields({ myPhone: { wallpaper: 'https://a.test/w.png' } });
    assert.ok(custom.includes('https://a.test/w.png'));
    assert.ok(searchSettings('手机壳').some((e) => e.label === '我的手机'));
    assert.ok(searchSettings('壁纸').some((e) => e.label === '我的手机'));
});
