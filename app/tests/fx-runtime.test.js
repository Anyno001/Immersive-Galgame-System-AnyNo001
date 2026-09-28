import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyFxToDom,
    cancelFxEffects,
    createFxMemory,
    diffFavorMetrics,
    planPageFx,
} from '../src/visual/igs-ui/fx-runtime.js';
import {
    MANGA_FX_DEFAULT_SYMBOLS,
    matchHeartbeat,
    matchMangaSymbol,
    normalizeFxReaderSettings,
    normalizeMangaFxSettings,
} from '../src/visual/igs-ui/fx-settings.js';
import { FX_SFX_PARTIALS, playFxSfx } from '../src/visual/igs-ui/fx-sfx.js';

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
        this.listeners = {};
        const node = this;
        this.classList = {
            add(name) { if (!node.classes().includes(name)) node.className = `${node.className} ${name}`.trim(); },
            contains(name) { return node.classes().includes(name); },
        };
    }
    classes() { return this.className.split(/\s+/).filter(Boolean); }
    get nextSibling() {
        const list = this.parentNode ? this.parentNode.children : [];
        return list[list.indexOf(this) + 1] || null;
    }
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
    addEventListener(name, fn) { this.listeners[name] = fn; }
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
    return {
        queue,
        schedule(fn) { queue.push(fn); return fn; },
        clear(timer) { const i = queue.indexOf(timer); if (i >= 0) queue.splice(i, 1); },
        flush() { while (queue.length) queue.shift()(); },
    };
}

function snapshot(content, readerSettings, messageId = 7) {
    return { messageId, content: { currentIndex: 0, displayText: '台词', ...content }, readerSettings };
}

test('gate:fx-runtime:settings-default-off-and-keep-explicit-empty-lists', () => {
    const all = normalizeFxReaderSettings(null);
    for (const key of ['titleCard', 'mangaFx', 'heartbeatFx', 'flashFx', 'favorToast', 'fxTags']) assert.equal(all[key].enabled, false, key);
    assert.equal(all.fxSound.enabled, true);
    assert.deepEqual(all.mangaFx.symbols.anger, MANGA_FX_DEFAULT_SYMBOLS.anger);
    const manga = normalizeMangaFxSettings({ enabled: true, symbols: { anger: [] }, speedLines: ['震惊', 'wow'] });
    assert.deepEqual(manga.symbols.anger, []);
    assert.deepEqual(manga.speedLines, ['震惊']);
});

test('gate:fx-runtime:emotion-matching-is-exact-chinese', () => {
    const manga = { enabled: true };
    assert.equal(matchMangaSymbol('生气', manga), 'anger');
    assert.equal(matchMangaSymbol(' 生气 ', manga), 'anger');
    assert.equal(matchMangaSymbol('有点生气', manga), '');
    assert.equal(matchMangaSymbol('生气', { enabled: false }), '');
    assert.equal(matchHeartbeat('害羞', { enabled: true }), 'love');
    assert.equal(matchHeartbeat('紧张', { enabled: true }), 'tense');
});

test('gate:fx-runtime:plan-plays-once-per-page-and-skips-nsfw', () => {
    const memory = createFxMemory();
    const settings = { mangaFx: { enabled: true }, heartbeatFx: { enabled: true } };
    const first = planPageFx(snapshot({ statusEmotion: '心动' }, settings), memory, new Map());
    assert.deepEqual(first.effects.map((e) => e.type), ['symbol', 'heartbeat']);
    const again = planPageFx(snapshot({ statusEmotion: '心动' }, settings), memory, new Map());
    assert.deepEqual(again.effects, []);
    const nsfw = planPageFx(snapshot({ statusEmotion: '生气', sceneNsfw: true, currentIndex: 3 }, settings), memory, new Map());
    assert.deepEqual(nsfw.effects, []);
    const chat = planPageFx(snapshot({ statusEmotion: '生气', chatPage: true, currentIndex: 4 }, settings), memory, new Map());
    assert.deepEqual(chat.effects, []);
});

test('gate:fx-runtime:title-card-on-location-or-time-change-once', () => {
    const memory = createFxMemory();
    const settings = { titleCard: { enabled: true } };
    const a = planPageFx(snapshot({ sceneLocation: '天台', sceneTime: '放学后' }, settings), memory, new Map());
    assert.deepEqual(a.effects, [{ type: 'title', main: '天台', sub: '放学后' }]);
    const same = planPageFx(snapshot({ sceneLocation: '天台', sceneTime: '放学后', currentIndex: 1 }, settings), memory, new Map());
    assert.deepEqual(same.effects, []);
    const later = planPageFx(snapshot({ sceneLocation: '天台', sceneTime: '夜晚', currentIndex: 2 }, settings), memory, new Map());
    assert.deepEqual(later.effects, [{ type: 'title', main: '', sub: '—— 夜晚' }]);
    const off = planPageFx(snapshot({ sceneLocation: '教室', sceneTime: '夜晚', currentIndex: 3 }, { titleCard: { enabled: true, onLocation: false } }), memory, new Map());
    assert.deepEqual(off.effects, []);
});

test('gate:fx-runtime:favor-diff-records-baseline-then-reports-changes', () => {
    const baseline = new Map();
    assert.deepEqual(diffFavorMetrics(baseline, '爱丽丝', [{ label: '好感', percent: 40 }]), []);
    assert.deepEqual(diffFavorMetrics(baseline, '爱丽丝', [{ label: '好感', percent: 40.4 }]), []);
    assert.deepEqual(diffFavorMetrics(baseline, '爱丽丝', [{ label: '好感', percent: 43.4 }]), [{ character: '爱丽丝', label: '好感', delta: 3 }]);
    assert.deepEqual(diffFavorMetrics(baseline, '爱丽丝', [{ label: '好感', percent: 38.4 }]), [{ character: '爱丽丝', label: '好感', delta: -5 }]);
    const plan = planPageFx(snapshot({ statusHud: { character: '爱丽丝', metrics: [{ label: '好感', percent: 50 }] } }, { favorToast: { enabled: true } }), createFxMemory(), baseline);
    assert.deepEqual(plan.effects, [{ type: 'favor', character: '爱丽丝', label: '好感', delta: 11.6 }]);
});

test('gate:fx-runtime:fx-tags-respect-kind-switches', () => {
    const fx = { instants: [{ kind: 'sfx', text: '砰' }, { kind: 'eye', mode: 'close' }], call: { name: 'A' }, flashback: true, letterbox: false };
    const plan = planPageFx(snapshot({ fx }, { fxTags: { enabled: true, sfx: false } }), createFxMemory(), new Map());
    assert.deepEqual(plan.effects.map((e) => e.type), ['eye']);
    assert.equal(plan.eyeHold, true);
    assert.deepEqual(plan.ranges, { flashback: true, letterbox: false, call: { name: 'A' } });
    const off = planPageFx(snapshot({ fx }, { fxTags: { enabled: false } }), createFxMemory(), new Map());
    assert.deepEqual(off.effects, []);
    assert.equal(off.ranges.call, null);
});

test('gate:fx-runtime:dom-apply-spawns-transients-sets-ranges-and-cleans-up', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const sounds = [];
    const settings = { mangaFx: { enabled: true }, fxTags: { enabled: true } };
    const fx = { instants: [{ kind: 'call', name: '爱丽丝' }], call: { name: '爱丽丝' }, flashback: true, letterbox: false };
    const result = applyFxToDom(root, snapshot({ statusEmotion: '生气', fx }, settings), {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: false, anchorX: 50,
        audioScheduler: (job) => { sounds.push(job.kind); return { stop() {} }; },
    });
    assert.deepEqual(result.played, ['symbol', 'call']);
    assert.equal(result.phone, true);
    assert.deepEqual(sounds, ['ring']);
    assert.equal(motion.getAttribute('data-igs-fx-flashback'), '1');
    assert.equal(motion.getAttribute('data-igs-fx-call'), '1');
    const stage = motion.querySelector('#igs-fx-stage');
    const front = motion.querySelector('#igs-fx-front');
    assert.equal(stage.parentNode.children.indexOf(stage), motion.children.indexOf(motion.querySelector('#igs-sprite')) + 1);
    assert.equal(front.parentNode.children.indexOf(front), motion.children.indexOf(motion.querySelector('#igs-dialog-layer')) + 1);
    const symbol = stage.querySelector('.igs-fx-symbol');
    assert.equal(symbol.getAttribute('data-kind'), 'anger');
    assert.equal(symbol.style.left, '59%');
    assert.equal(front.querySelector('.igs-fx-call-badge').textContent, '通话中 · 爱丽丝');
    assert.ok(front.querySelector('.igs-fx-call-screen'));
    timers.flush();
    assert.equal(stage.querySelector('.igs-fx-symbol'), null);
    assert.equal(front.querySelector('.igs-fx-call-screen'), null);
    applyFxToDom(root, snapshot({ statusEmotion: '生气', fx }, settings), { schedule: timers.schedule, clear: timers.clear, reducedMotion: false });
    assert.equal(stage.querySelector('.igs-fx-symbol'), null);
    assert.equal(cancelFxEffects(root), true);
    assert.equal(motion.getAttribute('data-igs-fx-flashback'), null);
    assert.equal(front.querySelector('.igs-fx-call-badge').hidden, true);
});

test('gate:fx-runtime:all-disabled-creates-no-layers', () => {
    const { root, motion } = makeRoot();
    assert.deepEqual(applyFxToDom(root, snapshot({ statusEmotion: '生气' }, {})).played, []);
    assert.equal(motion.querySelector('#igs-fx-stage'), null);
});

test('gate:fx-runtime:reduced-motion-skips-flash-but-keeps-sound', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const sounds = [];
    applyFxToDom(root, snapshot({ statusEmotion: '崩溃' }, { flashFx: { enabled: true } }), {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: true,
        audioScheduler: (job) => { sounds.push(job.kind); return null; },
    });
    assert.equal(motion.querySelector('.igs-fx-flash'), null);
    assert.deepEqual(sounds, ['tinnitus']);
});

test('gate:fx-sfx:respects-sound-switch-and-known-kinds', () => {
    const jobs = [];
    const audioScheduler = (job) => { jobs.push(job); return null; };
    assert.equal(playFxSfx('ring', { enabled: false, volume: 0.5 }, { audioScheduler }), null);
    assert.equal(playFxSfx('nope', { enabled: true, volume: 0.5 }, { audioScheduler }), null);
    playFxSfx('hangup', { enabled: true, volume: 0.4 }, { audioScheduler });
    assert.equal(jobs[0].partials, FX_SFX_PARTIALS.hangup);
    assert.equal(jobs[0].volume, 0.4);
});
