import test from 'node:test';
import assert from 'node:assert/strict';
import { emergencyOf, sirenOf } from '../src/scene/emergency.js';
import { applyFxToDom } from '../src/visual/igs-ui/fx-runtime.js';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { renderFxFeatureFields } from '../src/visual/igs-ui/fx-settings-fields.js';
import { FX_SFX_PARTIALS } from '../src/visual/igs-ui/fx-sfx.js';
import { FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-style.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { DEFAULT_SCENE_PROMPT_RULE } from '../src/visual/igs-ui/reader-host-constants.js';

class FakeNode {
    constructor(doc, tag) {
        this.ownerDocument = doc;
        this.tagName = tag;
        this.children = [];
        this.parentNode = null;
        this.attrs = new Map();
        this.style = {};
        this.hidden = false;
        this.textContent = '';
        this.id = '';
        this.className = '';
        const node = this;
        this.classList = {
            add(name) { if (!node.classes().includes(name)) node.className = `${node.className} ${name}`.trim(); },
            contains(name) { return node.classes().includes(name); },
        };
    }
    classes() { return this.className.split(/\s+/).filter(Boolean); }
    appendChild(child) { return this.insertBefore(child, null); }
    insertBefore(child, ref) {
        child.remove();
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
    addEventListener() {}
    matches(selector) {
        return selector.split(',').map((s) => s.trim()).some((s) => (s.startsWith('#') ? this.id === s.slice(1) : this.classList.contains(s.slice(1))));
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
    const motion = root.appendChild(new FakeNode(doc, 'div'));
    motion.id = 'igs-stage-motion';
    for (const id of ['igs-bg', 'igs-sprite', 'igs-click-layer', 'igs-dialog-layer']) {
        const el = motion.appendChild(new FakeNode(doc, 'div'));
        el.id = id;
    }
    return { root, motion };
}

function clock() {
    const queue = [];
    return { schedule(fn) { queue.push(fn); return fn; }, clear(t) { const i = queue.indexOf(t); if (i >= 0) queue.splice(i, 1); }, flush() { while (queue.length) queue.shift()(); } };
}

function setup(extra = {}) {
    const { root, motion } = makeRoot();
    const timers = clock();
    const sounds = [];
    const state = { now: 1000 };
    const opts = { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, now: () => state.now, audioScheduler: (job) => { sounds.push(job.kind); return null; }, ...extra };
    return { root, motion, timers, sounds, state, opts };
}

const snap = (content, readerSettings, messageId = 7) => ({ messageId, content: { currentIndex: 0, displayText: '台词', ...content }, readerSettings });

test('gate:emergency:recognizes-numbers-and-keywords', () => {
    assert.deepEqual(emergencyOf('110'), { kind: 'police', label: '110 报警中心', number: '110' });
    assert.equal(emergencyOf('120').kind, 'ambulance');
    assert.equal(emergencyOf('119').kind, 'fire');
    assert.equal(emergencyOf('１２２').kind, 'traffic');
    assert.equal(emergencyOf('119火警').label, '119 消防指挥中心');
    assert.equal(emergencyOf('报警电话').kind, 'police');
    assert.equal(emergencyOf('医院急救').kind, 'ambulance');
    assert.deepEqual(emergencyOf('派出所'), { kind: 'police', label: '派出所', number: '110' });
    assert.equal(emergencyOf('消防队').kind, 'fire');
    for (const name of ['爱丽丝', '', null, '1100', '12345', '10086']) assert.equal(emergencyOf(name), null, String(name));
});

test('gate:emergency:siren-follows-worldview-and-keywords', () => {
    assert.equal(sirenOf({ text: '远处传来警笛声' }), 'police');
    assert.equal(sirenOf({ text: '一辆救护车呼啸而过', worldview: 'modern' }), 'ambulance');
    assert.equal(sirenOf({ text: '消防车赶到了', worldview: 'scifi' }), 'fire');
    assert.equal(sirenOf({ text: '红蓝灯在墙上跳动', worldview: 'horror' }), 'police');
    assert.equal(sirenOf({ text: '鸣笛声由远及近', hint: 'ambulance' }), 'ambulance');
    assert.equal(sirenOf({ text: '她笑了' }), null);
    for (const worldview of ['ancient', 'fantasy', 'magic', 'taisho', 'apocalypse']) assert.equal(sirenOf({ text: '警车来了', worldview }), null, worldview);
    assert.equal(sirenOf({ text: '警车来了', ancient: true }), null);
});

test('gate:emergency:call-screen-uses-emergency-style-and-timer', () => {
    const { root, motion, timers, sounds, state, opts } = setup();
    const settings = { fxTags: { enabled: true } };
    const call = { name: '110', dir: 'out', mode: 'voice', at: 3 };
    applyFxToDom(root, snap({ fx: { instants: [{ kind: 'call', ...call }], call } }, settings), opts);
    const front = motion.querySelector('#igs-fx-front');
    const screen = front.querySelector('.igs-fx-call-screen');
    assert.ok(screen.classList.contains('is-emergency'));
    assert.equal(screen.getAttribute('data-emergency'), 'police');
    assert.equal(front.querySelector('.igs-fx-emergency-head').textContent, '紧急呼叫');
    assert.equal(front.querySelector('.igs-fx-emergency-num').textContent, '110');
    assert.equal(front.querySelector('.igs-fx-call-name').textContent, '110 报警中心');
    assert.equal(front.querySelector('.igs-fx-call-state').textContent, '正在呼叫…');
    assert.equal(front.querySelector('.igs-fx-call-label').textContent, '紧急呼叫 · 110 报警中心');
    assert.equal(front.querySelector('.igs-fx-call-badge').getAttribute('data-emergency'), 'police');
    timers.flush();
    state.now = 66400;
    const end = { kind: 'call-end', reason: 'end', name: '110', dir: 'out', mode: 'voice' };
    applyFxToDom(root, snap({ currentIndex: 1, fx: { instants: [end], call: null } }, settings), opts);
    const log = front.querySelector('.igs-fx-call-end');
    assert.ok(log.classList.contains('is-emergency'));
    assert.equal(log.textContent, '110 报警中心 · 已接通 01:03');
    assert.deepEqual(sounds, ['ringback', 'hangup']);
});

test('gate:emergency:normal-call-and-switch-off-keep-old-look', () => {
    const normal = setup();
    const callA = { name: '爱丽丝', dir: 'in', mode: 'voice', at: 1 };
    applyFxToDom(normal.root, snap({ fx: { instants: [{ kind: 'call', ...callA }], call: callA } }, { fxTags: { enabled: true } }), normal.opts);
    const front = normal.motion.querySelector('#igs-fx-front');
    assert.equal(front.querySelector('.igs-fx-call-screen').classList.contains('is-emergency'), false);
    assert.equal(front.querySelector('.igs-fx-emergency-head'), null);

    const off = setup();
    const callB = { name: '110', dir: 'in', mode: 'voice', at: 1 };
    applyFxToDom(off.root, snap({ fx: { instants: [{ kind: 'call', ...callB }], call: callB } }, { fxTags: { enabled: true, emergency: false } }), off.opts);
    const offFront = off.motion.querySelector('#igs-fx-front');
    assert.equal(offFront.querySelector('.igs-fx-call-screen').classList.contains('is-emergency'), false);
    assert.equal(offFront.querySelector('.igs-fx-call-name').textContent, '110');
});

function sirenCount(motion) {
    return motion.querySelector('#igs-fx-stage').querySelectorAll('.igs-fx-siren').length;
}

test('gate:emergency:siren-plays-once-per-floor-with-sound', () => {
    const { root, motion, sounds, opts } = setup();
    const settings = { fxTags: { enabled: true } };
    applyFxToDom(root, snap({ displayText: '远处传来警笛声，红蓝灯映在窗上。' }, settings), opts);
    const siren = motion.querySelector('#igs-fx-stage').querySelector('.igs-fx-siren');
    assert.equal(siren.getAttribute('data-kind'), 'police');
    assert.equal(siren.children.length, 4);
    assert.equal(siren.classList.contains('is-reduced'), false);
    assert.deepEqual(sounds, ['siren-police']);
    // 同一楼换页、重绘都不再播。
    applyFxToDom(root, snap({ currentIndex: 1, displayText: '警车停在楼下。' }, settings), opts);
    applyFxToDom(root, snap({ currentIndex: 0, displayText: '警车停在楼下。' }, settings), opts);
    assert.equal(sounds.filter((k) => k.startsWith('siren')).length, 1);
    // 换一楼可以再播。
    applyFxToDom(root, snap({ displayText: '救护车来了。' }, settings, 8), opts);
    assert.equal(sounds.at(-1), 'siren-ambulance');
});

test('gate:emergency:siren-respects-worldview-switch-and-reduced', () => {
    const settings = { fxTags: { enabled: true } };
    const ancient = setup();
    applyFxToDom(ancient.root, snap({ displayText: '警车来了' }, { ...settings, _ancientEra: true }), ancient.opts);
    assert.equal(sirenCount(ancient.motion), 0);
    const magic = setup();
    applyFxToDom(magic.root, snap({ displayText: '警车来了' }, { ...settings, _worldview: 'magic' }), magic.opts);
    assert.equal(sirenCount(magic.motion), 0);
    const horror = setup();
    applyFxToDom(horror.root, snap({ displayText: '警车来了' }, { ...settings, _worldview: 'horror' }), horror.opts);
    assert.equal(sirenCount(horror.motion), 1);

    const off = setup();
    applyFxToDom(off.root, snap({ displayText: '警车来了' }, { fxTags: { enabled: true, emergency: false } }), off.opts);
    assert.equal(sirenCount(off.motion), 0);
    assert.deepEqual(off.sounds, []);

    const calm = setup({ reducedMotion: true });
    applyFxToDom(calm.root, snap({ displayText: '警车来了' }, settings), calm.opts);
    const el = calm.motion.querySelector('#igs-fx-stage').querySelector('.igs-fx-siren');
    assert.ok(el.classList.contains('is-reduced'));
    assert.match(FX_STYLE_TEXT, /\.igs-fx-siren\.is-reduced > i\.is-a\{animation:none/);
});

test('gate:emergency:setting-defaults-on-boolean-path-and-checkbox', () => {
    assert.equal(normalizeFxReaderSettings(null).fxTags.emergency, true);
    assert.equal(normalizeFxReaderSettings({ fxTags: { emergency: false } }).fxTags.emergency, false);
    assert.equal(normalizeSettingsValue('readerSettings.fxTags.emergency', 'false'), false);
    assert.equal(normalizeSettingsValue('readerSettings.fxTags.emergency', 'true'), true);
    assert.match(renderFxFeatureFields({ fxTags: { enabled: true } }).tags, /readerSettings\.fxTags\.emergency[\s\S]*紧急求助/);
    for (const kind of ['police', 'ambulance', 'fire']) assert.ok(FX_SFX_PARTIALS[`siren-${kind}`].length > 0, kind);
});

test('gate:emergency:prompt-text-is-unchanged-by-the-switch', () => {
    const base = { fxTags: { enabled: true, call: true, notify: true } };
    const build = (fxTags) => buildTagGrammar({ readerSettings: { ...base, fxTags }, sceneRule: DEFAULT_SCENE_PROMPT_RULE, expand: new Set(['daily']) });
    const on = build({ ...base.fxTags, emergency: true });
    const off = build({ ...base.fxTags, emergency: false });
    assert.equal(on.system, off.system);
    assert.equal(on.depth0, off.depth0);
});
