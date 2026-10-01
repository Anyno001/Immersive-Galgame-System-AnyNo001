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
    normalizeTitleCardSettings,
} from '../src/visual/igs-ui/fx-settings.js';
import { renderFxFeatureFields } from '../src/visual/igs-ui/fx-settings-fields.js';
import { FX_SFX_PARTIALS, playFxSfx } from '../src/visual/igs-ui/fx-sfx.js';
import { SYMBOL_OFFSETS, headToMarker, markerToHead, normalizeSpriteHeads, resolveSpriteHead, resolveSymbolPlacement, scanHeadFromAlpha, spriteDrawRect } from '../src/visual/igs-ui/fx-anchor.js';
import { spriteGeometry } from '../src/visual/igs-ui/fx-runtime.js';
import { ANCIENT_SYMBOL_PLACEMENT, ANCIENT_SYMBOL_SVG, MANGA_SYMBOL_SVG, pickFxAccent } from '../src/visual/igs-ui/fx-symbols.js';
import { MANGA_SYMBOL_KINDS } from '../src/visual/igs-ui/fx-settings.js';
import { clearSpriteHeadCache, probeSpriteHead } from '../src/visual/igs-ui/fx-anchor.js';
import { exitSpriteEditMode, spriteDragPosition } from '../src/visual/igs-ui/sprite-edit.js';
import { FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-style.js';

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
    const lives = [];
    return {
        queue,
        lives,
        schedule(fn, ms) { queue.push(fn); lives.push(ms); return fn; },
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
    assert.equal(normalizeTitleCardSettings({}).speed, 'medium');
    assert.equal(normalizeTitleCardSettings({ speed: 'fast' }).speed, 'fast');
    assert.equal(normalizeTitleCardSettings({ speed: 'invalid' }).speed, 'medium');
    const titleFields = renderFxFeatureFields({ titleCard: { enabled: true, speed: 'fast' } }).title;
    assert.match(titleFields, /data-segment-path="readerSettings\.titleCard\.speed"[^>]*data-segment-value="fast"/);
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

test('gate:fx-runtime:title-card-temporarily-hides-stage-chrome', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const result = applyFxToDom(root, snapshot({ sceneLocation: '天台', sceneTime: '放学后' }, { titleCard: { enabled: true, speed: 'fast' }, fxStyle: { hold: 'long' } }), {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: false,
    });
    assert.deepEqual(result.played, ['title']);
    assert.equal(timers.lives[0], 1800, '报幕速度独立于全局停留时间');
    assert.equal(motion.getAttribute('data-igs-fx-presentation'), '1');
    assert.ok(motion.querySelector('.igs-fx-title-card'));
    assert.ok(FX_STYLE_TEXT.includes('#igs-stage-motion[data-igs-fx-presentation="1"] #igs-status-hud'));
    assert.ok(FX_STYLE_TEXT.includes('#igs-stage-motion[data-igs-fx-presentation="1"] #igs-sprite'));
    assert.ok(FX_STYLE_TEXT.includes('#igs-stage-motion[data-igs-fx-presentation="1"] #igs-dialog-layer'));
    assert.ok(FX_STYLE_TEXT.includes('{display:none!important;pointer-events:none!important;}'));
    timers.flush();
    assert.equal(motion.getAttribute('data-igs-fx-presentation'), null);
    assert.equal(motion.querySelector('.igs-fx-title-card'), null);

    const slow = clock();
    const slowRoot = makeRoot().root;
    applyFxToDom(slowRoot, snapshot({ sceneLocation: '教室' }, { titleCard: { enabled: true, speed: 'slow' }, fxStyle: { hold: 'short' } }), {
        schedule: slow.schedule, clear: slow.clear, reducedMotion: false,
    });
    assert.equal(slow.lives[0], 4200);
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
    const fx = { instants: [{ kind: 'sfx', text: '砰' }, { kind: 'eye', mode: 'close' }], call: { name: 'A' }, flashback: true, dream: false, letterbox: false };
    const plan = planPageFx(snapshot({ fx }, { fxTags: { enabled: true, sfx: false } }), createFxMemory(), new Map());
    assert.deepEqual(plan.effects.map((e) => e.type), ['eye']);
    assert.equal(plan.eyeHold, true);
    assert.deepEqual(plan.ranges, { flashback: true, dream: false, letterbox: false, call: { name: 'A' } });
    const off = planPageFx(snapshot({ fx }, { fxTags: { enabled: false } }), createFxMemory(), new Map());
    assert.deepEqual(off.effects, []);
    assert.equal(off.ranges.call, null);
});

test('gate:fx-runtime:emotion-symbol-requires-current-sprite', () => {
    const settings = { mangaFx: { enabled: true } };
    const opts = { schedule: () => 0, clear() {}, reducedMotion: false };
    const missing = makeRoot();
    const skipped = applyFxToDom(missing.root, snapshot({ statusEmotion: '生气' }, settings), opts);
    assert.deepEqual(skipped.played, []);
    assert.equal(missing.motion.querySelector('.igs-fx-symbol'), null);

    const visible = makeRoot();
    const shown = applyFxToDom(visible.root, snapshot({ statusEmotion: '生气' }, settings), {
        ...opts,
        sprite: {
            url: '/alice.png', posX: 50, posY: 100, scale: 100,
            head: { x: 0.5, top: 0.08, w: 0.28, aspect: 2 },
        },
    });
    assert.deepEqual(shown.played, ['symbol']);
    assert.equal(visible.motion.querySelector('.igs-fx-symbol').getAttribute('data-kind'), 'anger');
});

test('gate:fx-runtime:dom-apply-spawns-transients-sets-ranges-and-cleans-up', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const sounds = [];
    const settings = { mangaFx: { enabled: true }, fxTags: { enabled: true } };
    const fx = { instants: [{ kind: 'call', name: '爱丽丝' }], call: { name: '爱丽丝' }, flashback: true, dream: true, letterbox: false };
    const result = applyFxToDom(root, snapshot({ statusEmotion: '生气', speaker: '爱丽丝', fx }, settings), {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: false,
        sprite: {
            url: '/alice.png', posX: 50, posY: 100, scale: 100,
            head: { x: 0.5, top: 0.08, w: 0.28, aspect: 2 },
        },
        audioScheduler: (job) => { sounds.push(job.kind); return { stop() {} }; },
    });
    assert.deepEqual(result.played, ['symbol', 'call']);
    assert.deepEqual(result.ranges, { flashback: true, dream: true, letterbox: false });
    assert.equal(result.phone, true);
    assert.deepEqual(sounds, ['ring']);
    assert.equal(motion.getAttribute('data-igs-fx-flashback'), '1');
    assert.equal(motion.getAttribute('data-igs-fx-dream'), '1');
    assert.equal(motion.getAttribute('data-igs-fx-call'), 'voice');
    assert.equal(motion.getAttribute('data-igs-fx-call-remote'), '1');
    const stage = motion.querySelector('#igs-fx-stage');
    const front = motion.querySelector('#igs-fx-front');
    assert.equal(stage.parentNode.children.indexOf(stage), motion.children.indexOf(motion.querySelector('#igs-sprite')) + 1);
    assert.equal(front.parentNode.children.indexOf(front), motion.children.indexOf(motion.querySelector('#igs-dialog-layer')) + 1);
    const symbol = stage.querySelector('.igs-fx-symbol');
    assert.equal(symbol.getAttribute('data-kind'), 'anger');
    assert.equal(symbol.style.left, undefined);
    assert.ok(stage.querySelector('.igs-fx-dream-mist'));
    assert.equal(front.querySelector('.igs-fx-call-label').textContent, '通话中 · 爱丽丝');
    assert.ok(front.querySelector('.igs-fx-call-screen'));
    timers.flush();
    assert.equal(stage.querySelector('.igs-fx-symbol'), null);
    assert.equal(front.querySelector('.igs-fx-call-screen'), null);
    applyFxToDom(root, snapshot({ statusEmotion: '生气', fx }, settings), { schedule: timers.schedule, clear: timers.clear, reducedMotion: false });
    assert.equal(stage.querySelector('.igs-fx-symbol'), null);
    assert.equal(cancelFxEffects(root), true);
    assert.equal(motion.getAttribute('data-igs-fx-flashback'), null);
    assert.equal(motion.getAttribute('data-igs-fx-call-remote'), null);
    assert.equal(front.querySelector('.igs-fx-call-badge').hidden, true);
    assert.equal(stage.querySelector('.igs-fx-call-pip').hidden, true);
});

test('gate:fx-runtime:call-timer-duration-and-end-reasons', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const sounds = [];
    let now = 1000;
    const settings = { fxTags: { enabled: true } };
    const opts = {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: false, now: () => now,
        audioScheduler: (job) => { sounds.push(job.kind); return null; },
    };
    const call = { name: '爱丽丝', dir: 'out', mode: 'voice', at: 3 };
    applyFxToDom(root, snapshot({ fx: { instants: [{ kind: 'call', ...call }], call } }, settings), opts);
    const front = motion.querySelector('#igs-fx-front');
    const screen = front.querySelector('.igs-fx-call-screen');
    assert.equal(screen.getAttribute('data-dir'), 'out');
    assert.equal(front.querySelector('.igs-fx-call-state').textContent, '正在呼叫…');
    assert.equal(front.querySelector('.igs-fx-call-hint').textContent, '点击跳过');
    assert.deepEqual(sounds, ['ringback']);
    // 响铃期间计时停在 00:00：起点记在来电屏播完的那一刻。
    timers.flush();
    now = 30000;
    applyFxToDom(root, snapshot({ currentIndex: 1, fx: { instants: [], call } }, settings), opts);
    now = 65400;
    const end = { kind: 'call-end', reason: 'end', name: '爱丽丝', dir: 'out', mode: 'voice' };
    applyFxToDom(root, snapshot({ currentIndex: 2, fx: { instants: [end], call: null } }, settings), opts);
    const log = front.querySelector('.igs-fx-call-end');
    assert.equal(log.textContent, '爱丽丝 · 通话结束 01:02');
    assert.equal(log.getAttribute('data-fresh'), 'badge');
    assert.equal(front.querySelector('.igs-fx-call-badge').hidden, true);
    assert.deepEqual(sounds, ['ringback', 'hangup']);

    // 挂断记录常驻挂断所在页：翻走即收起，翻回来不重播也不重算时长。
    now = 90000;
    applyFxToDom(root, snapshot({ currentIndex: 3, fx: { instants: [], call: null } }, settings), opts);
    assert.equal(front.querySelector('.igs-fx-call-end'), null);
    applyFxToDom(root, snapshot({ currentIndex: 2, fx: { instants: [end], call: null } }, settings), opts);
    const again = front.querySelector('.igs-fx-call-end');
    assert.equal(again.textContent, '爱丽丝 · 通话结束 01:02');
    assert.equal(again.getAttribute('data-fresh'), null);
    assert.deepEqual(sounds, ['ringback', 'hangup']);

    // 同页来电又未接：没有接听按钮，响铃更久；挂断记录先藏着，等来电屏播完掐掉铃声再出现。
    timers.flush();
    const missedCall = { name: '爱丽丝', dir: 'in', mode: 'voice', at: 9 };
    const missed = { kind: 'call-end', reason: 'missed', name: '爱丽丝', dir: 'in', mode: 'voice' };
    applyFxToDom(root, snapshot({ currentIndex: 4, fx: { instants: [{ kind: 'call', ...missedCall }, missed], call: null } }, settings), opts);
    const screen2 = front.querySelector('.igs-fx-call-screen');
    assert.equal(screen2.getAttribute('data-outcome'), 'missed');
    assert.equal(screen2.getAttribute('data-press'), null, 'nobody pressed the button on a missed incoming call');
    assert.equal(front.querySelector('.igs-fx-call-hint'), null);
    assert.equal(front.querySelector('.igs-fx-call-outcome').textContent, '未接来电');
    assert.ok(front.querySelector('.igs-fx-call-decline'));
    assert.equal(sounds.at(-1), 'ring-long');
    const pill = front.querySelector('.igs-fx-call-end');
    assert.equal(pill.getAttribute('data-wait'), '1');
    assert.ok(timers.lives.includes(3400));
    timers.queue.splice(0, timers.queue.length - 1);
    timers.queue.pop()();
    assert.equal(pill.textContent, '爱丽丝 · 未接来电');
    assert.equal(pill.getAttribute('data-reason'), 'missed');
    assert.equal(pill.getAttribute('data-wait'), null);
    assert.equal(pill.getAttribute('data-fresh'), 'screen');
    assert.equal(sounds.at(-1), 'missed');
    cancelFxEffects(root);
    assert.equal(front.querySelector('.igs-fx-call-end'), null);
});

test('gate:fx-runtime:reject-cuts-the-ring-and-presses-decline', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const sounds = [];
    const stopped = [];
    const opts = {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: false,
        audioScheduler: (job) => { sounds.push(job.kind); return { stop() { stopped.push(job.kind); } }; },
    };
    const settings = { fxTags: { enabled: true } };
    const call = { name: '爱丽丝', dir: 'in', mode: 'voice', at: 1 };
    const reject = { kind: 'call-end', reason: 'reject', name: '爱丽丝', dir: 'in', mode: 'voice' };
    applyFxToDom(root, snapshot({ fx: { instants: [{ kind: 'call', ...call }, reject], call: null } }, settings), opts);
    const front = motion.querySelector('#igs-fx-front');
    const screen = front.querySelector('.igs-fx-call-screen');
    assert.equal(screen.getAttribute('data-press'), '1');
    assert.equal(front.querySelector('.igs-fx-call-outcome').textContent, '已拒接');
    assert.ok(timers.lives.includes(1700));
    timers.flush();
    assert.deepEqual(sounds, ['ring-long', 'reject']);
    assert.deepEqual(stopped, ['ring-long']);
    assert.equal(front.querySelector('.igs-fx-call-end').textContent, '爱丽丝 · 已拒接');

    // 拨出后对方拒接：挂断键不是主角按的。
    const dial = { name: '爱丽丝', dir: 'out', mode: 'voice', at: 5 };
    const rejected = { ...reject, dir: 'out' };
    applyFxToDom(root, snapshot({ currentIndex: 1, fx: { instants: [{ kind: 'call', ...dial }, rejected], call: null } }, settings), opts);
    assert.equal(front.querySelector('.igs-fx-call-screen').getAttribute('data-press'), null);
    assert.equal(front.querySelector('.igs-fx-call-outcome').textContent, '对方已拒接');
    assert.equal(sounds.at(-1), 'ringback-long');
    cancelFxEffects(root);
});

test('gate:fx-runtime:answering-stops-ring-and-pip-leaves-with-a-ghost', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const stopped = [];
    const opts = {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: false,
        audioScheduler: (job) => ({ stop() { stopped.push(job.kind); } }),
    };
    const settings = { fxTags: { enabled: true } };
    const call = { name: '爱丽丝', dir: 'in', mode: 'voice', at: 1 };
    applyFxToDom(root, snapshot({ fx: { instants: [{ kind: 'call', ...call }], call } }, settings), opts);
    const front = motion.querySelector('#igs-fx-front');
    front.querySelector('.igs-fx-call-screen').listeners.click({ stopPropagation() {} });
    assert.deepEqual(stopped, ['ring']);
    const stage = motion.querySelector('#igs-fx-stage');
    assert.equal(stage.querySelector('.igs-fx-call-pip').hidden, false);
    const end = { kind: 'call-end', reason: 'cut', name: '爱丽丝', dir: 'in', mode: 'voice' };
    applyFxToDom(root, snapshot({ currentIndex: 1, fx: { instants: [end], call: null } }, settings), opts);
    assert.equal(stage.querySelector('.igs-fx-call-pip').hidden, true);
    const ghost = stage.querySelector('.igs-fx-call-pip-out');
    assert.ok(ghost);
    assert.equal(ghost.children[1].textContent, '爱丽丝');
    assert.ok(timers.lives.includes(320));
    cancelFxEffects(root);
    assert.equal(stage.querySelector('.igs-fx-call-pip-out'), null);
});

test('gate:fx-runtime:ancient-era-notify-is-a-servant-report', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const sounds = [];
    const fx = { instants: [{ kind: 'notify', sender: '小厮', text: '老爷回府了' }], call: null, flashback: false, dream: false, letterbox: false };
    const opts = { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, audioScheduler: (job) => { sounds.push(job.kind); return null; } };
    applyFxToDom(root, snapshot({ fx }, { fxTags: { enabled: true }, _ancientEra: true }), opts);
    const el = motion.querySelector('#igs-fx-front').querySelector('.igs-fx-notify');
    assert.equal(el.className.includes('is-ancient'), true);
    assert.equal(el.children[0].textContent, '禀');
    assert.equal(el.children[1].textContent, '小厮');
    assert.equal(motion.getAttribute('data-igs-fx-era'), 'ancient');
    assert.deepEqual(sounds, ['notify-ancient']);
    assert.ok(FX_SFX_PARTIALS['notify-ancient'].length);
    assert.match(FX_STYLE_TEXT, /\.igs-fx-notify\.is-ancient\{[^}]*writing-mode:vertical-rl/);
    cancelFxEffects(root);
    assert.equal(motion.getAttribute('data-igs-fx-era'), null);
});

test('gate:fx-runtime:ancient-era-swaps-lamp-ink-snot-symbols-and-scroll-title', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const opts = {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: false,
        sprite: { url: '/alice.png', posX: 50, posY: 100, scale: 100, head: { x: 0.5, top: 0.08, w: 0.28, aspect: 2 } },
    };
    const ancient = { mangaFx: { enabled: true }, titleCard: { enabled: true }, _ancientEra: true };
    applyFxToDom(root, snapshot({ statusEmotion: '灵光一闪', sceneLocation: '醉仙楼', sceneTime: '戌时' }, ancient), opts);
    const symbol = motion.querySelector('.igs-fx-symbol');
    assert.equal(symbol.getAttribute('data-era'), 'ancient');
    assert.equal(symbol.innerHTML, ANCIENT_SYMBOL_SVG.bulb);
    assert.match(symbol.innerHTML, /igs-fx-lamp/);
    const title = motion.querySelector('.igs-fx-title-card');
    assert.equal(title.className.includes('is-ancient'), true);
    applyFxToDom(root, snapshot({ currentIndex: 1, statusEmotion: '开心', sceneLocation: '醉仙楼', sceneTime: '亥时' }, ancient), opts);
    assert.match(motion.querySelector('.igs-fx-symbol').innerHTML, /igs-fx-inkdot-1/);
    assert.equal(motion.querySelector('.igs-fx-title-sub').textContent, '亥时', 'no leading dash in vertical scroll');
    // 其余符号在古代背景下保持原样，不打 data-era。
    applyFxToDom(root, snapshot({ currentIndex: 2, statusEmotion: '生气' }, ancient), opts);
    const anger = motion.querySelector('.igs-fx-symbol');
    assert.equal(anger.getAttribute('data-era'), null);
    assert.equal(anger.innerHTML, MANGA_SYMBOL_SVG.anger);
    for (const kind of Object.keys(ANCIENT_SYMBOL_SVG)) assert.ok(MANGA_SYMBOL_SVG[kind], kind);
    assert.ok(SYMBOL_OFFSETS[ANCIENT_SYMBOL_PLACEMENT.zzz]);
    assert.match(FX_STYLE_TEXT, /\.igs-fx-title-card\.is-ancient\{[^}]*writing-mode:vertical-rl/);
    cancelFxEffects(root);
});

test('gate:fx-runtime:call-timer-style-uses-css-counters', () => {
    assert.match(FX_STYLE_TEXT, /@property --igs-fx-ss/);
    assert.match(FX_STYLE_TEXT, /\.igs-fx-call-timer::after\{counter-reset:igs-fx-mm var\(--igs-fx-mm\)/);
    assert.match(FX_STYLE_TEXT, /data-igs-fx-call="video"\] #igs-sprite/);
    assert.match(FX_STYLE_TEXT, /mask:url\("data:image\/svg\+xml,/);
});

test('gate:fx-runtime:remote-speaker-drives-pip-video-and-phone-audio', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const opts = { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, sprite: { url: '/alice.png', posX: 50, posY: 100, scale: 100 } };
    const assets = { characters: { 爱丽丝: {} }, characterAliases: { 爱丽丝: ['小爱'] } };
    const voice = { name: '爱丽丝', dir: 'in', mode: 'voice', at: 0 };
    const settings = (callSprite) => ({ fxTags: { enabled: true, callSprite }, _sceneAssets: assets });
    let result = applyFxToDom(root, snapshot({ speaker: '小爱', fx: { instants: [], call: voice } }, settings()), opts);
    assert.equal(result.phone, true, 'alias resolves to the caller');
    const stage = motion.querySelector('#igs-fx-stage');
    const pip = stage.querySelector('.igs-fx-call-pip');
    assert.equal(pip.hidden, false);
    assert.equal(pip.getAttribute('data-speaking'), '1');
    assert.equal(motion.getAttribute('data-igs-fx-call-sprite'), 'avatar');
    result = applyFxToDom(root, snapshot({ currentIndex: 1, speaker: '我', fx: { instants: [], call: voice } }, settings()), opts);
    assert.equal(result.phone, false, 'local speaker keeps normal typewriter audio');
    assert.equal(motion.getAttribute('data-igs-fx-call-remote'), null);
    assert.equal(pip.getAttribute('data-speaking'), null);
    applyFxToDom(root, snapshot({ currentIndex: 2, speaker: '爱丽丝', fx: { instants: [], call: voice } }, settings('show')), opts);
    assert.equal(pip.hidden, true);
    assert.equal(motion.getAttribute('data-igs-fx-call-sprite'), 'show');

    const video = { name: '爱丽丝', dir: 'in', mode: 'video', at: 40 };
    applyFxToDom(root, snapshot({ currentIndex: 3, speaker: '我', fx: { instants: [], call: video } }, settings()), opts);
    const win = stage.querySelector('.igs-fx-video');
    assert.equal(motion.getAttribute('data-igs-fx-call'), 'video');
    assert.equal(win.hidden, false);
    assert.equal(win.getAttribute('data-feed'), null, 'no feed before the caller speaks');
    assert.ok(win.querySelector('.igs-fx-video-face').querySelector('.igs-fx-call-avatar'));
    applyFxToDom(root, snapshot({ currentIndex: 4, speaker: '爱丽丝', fx: { instants: [], call: video } }, settings()), opts);
    assert.equal(win.getAttribute('data-feed'), '1');
    assert.equal(win.querySelector('.igs-fx-video-feed').style.backgroundImage, 'url("/alice.png")');
    assert.equal(motion.querySelector('#igs-fx-front').querySelector('.igs-fx-call-label').textContent, '视频通话 · 爱丽丝');
    const end = { kind: 'call-end', reason: 'cut', dir: 'in', mode: 'video' };
    applyFxToDom(root, snapshot({ currentIndex: 5, fx: { instants: [end], call: null } }, settings()), opts);
    assert.equal(win.hidden, true);
    assert.ok(stage.querySelector('.igs-fx-video-close'));
    assert.match(motion.querySelector('#igs-fx-front').querySelector('.igs-fx-call-end').textContent, /^对方已挂断/);
    cancelFxEffects(root);
});

test('gate:fx-settings:new-symbols-have-words-offsets-and-call-sprite-mode', () => {
    assert.equal(matchMangaSymbol('困倦', { enabled: true }), 'zzz');
    assert.equal(matchMangaSymbol('灵光一闪', { enabled: true }), 'bulb');
    assert.equal(matchMangaSymbol('心碎', { enabled: true }), 'heartbreak');
    assert.equal(matchMangaSymbol('毛骨悚然', { enabled: true }), 'frost');
    for (const kind of MANGA_SYMBOL_KINDS) {
        assert.ok(SYMBOL_OFFSETS[kind], kind);
        assert.ok(MANGA_FX_DEFAULT_SYMBOLS[kind].length, kind);
        assert.match(FX_STYLE_TEXT, new RegExp(`data-kind="${kind}"\\]\\{--igs-fx-hue:`), kind);
    }
    // 默认词表之间不重复，保证每个词只落到一个符号上。
    const words = MANGA_SYMBOL_KINDS.flatMap((kind) => MANGA_FX_DEFAULT_SYMBOLS[kind]);
    assert.equal(new Set(words).size, words.length);
    assert.equal(normalizeFxReaderSettings({}).fxTags.callSprite, 'avatar');
    assert.equal(normalizeFxReaderSettings({ fxTags: { callSprite: 'hide' } }).fxTags.callSprite, 'hide');
    assert.equal(normalizeFxReaderSettings({ fxTags: { callSprite: 'bogus' } }).fxTags.callSprite, 'avatar');
    const html = renderFxFeatureFields({ fxTags: { enabled: true } }).tags;
    assert.match(html, /readerSettings\.fxTags\.callSprite/);
    assert.doesNotMatch(renderFxFeatureFields({ fxTags: { enabled: true, call: false } }).tags, /fxTags\.callSprite/);
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

test('gate:fx-runtime:replay-on-return-but-never-on-same-page-rerender', () => {
    const settings = (replay) => ({ mangaFx: { enabled: true }, fxStyle: { replay } });
    for (const replay of [false, true]) {
        const memory = createFxMemory();
        const page = (index) => planPageFx(snapshot({ statusEmotion: '生气', currentIndex: index }, settings(replay)), memory, new Map()).effects.length;
        assert.equal(page(0), 1);
        assert.equal(page(0), 0, 'same-page rerender');
        assert.equal(page(1), 1);
        assert.equal(page(0), replay ? 1 : 0, `return replay=${replay}`);
        assert.equal(page(0), 0);
    }
});

test('gate:fx-runtime:hold-scales-lifetime-and-snappy-flags-stage', () => {
    const lives = {};
    const sprite = {
        url: '/alice.png', posX: 50, posY: 100, scale: 100,
        head: { x: 0.5, top: 0.08, w: 0.28, aspect: 2 },
    };
    for (const hold of ['short', 'medium', 'long']) {
        const { root, motion } = makeRoot();
        const timers = clock();
        applyFxToDom(root, snapshot({ statusEmotion: '生气' }, { mangaFx: { enabled: true }, fxStyle: { hold, motion: 'snappy' } }), {
            schedule: timers.schedule, clear: timers.clear, reducedMotion: false, sprite,
        });
        lives[hold] = timers.lives[0];
        assert.equal(motion.getAttribute('data-igs-fx-motion'), 'snappy');
        cancelFxEffects(root);
        assert.equal(motion.getAttribute('data-igs-fx-motion'), null);
    }
    assert.ok(lives.short < lives.medium && lives.medium < lives.long, JSON.stringify(lives));
    assert.equal(normalizeFxReaderSettings({ fxStyle: { motion: 'x', hold: 'y' } }).fxStyle.motion, 'smooth');
});

test('gate:fx-anchor:symbol-follows-sprite-head-across-desktop-and-phone', () => {
    const head = { x: 0.5, top: 0.05, w: 0.3 };
    const portrait = { naturalW: 600, naturalH: 1200, head };
    const pc = resolveSymbolPlacement('anger', { stageW: 1280, stageH: 720, dialogTop: 520, sprite: { ...portrait, posX: 50, posY: 100, scale: 40 } });
    // 立绘宽 512、高 1024、底对齐：头顶 y = (720-1024) + 51 ≈ -253，被夹到舞台内；x 在头部中心右侧。
    assert.ok(pc.x > 640 && pc.x < 800, JSON.stringify(pc));
    assert.ok(pc.y >= pc.size * 0.55 && pc.y < 520, JSON.stringify(pc));
    const fit = resolveSymbolPlacement('anger', { stageW: 1280, stageH: 720, dialogTop: 520, sprite: { ...portrait, posX: 20, posY: 100, scale: 25 } });
    const imgW = 320;
    const left = (1280 - imgW) * 0.2;
    const top = 720 - imgW * 2;
    assert.ok(Math.abs(fit.x - (left + imgW * 0.5 + 0.45 * imgW * 0.3)) <= 1, JSON.stringify(fit));
    assert.ok(Math.abs(fit.y - (top + imgW * 0.05 * 2 + 0.15 * imgW * 0.3 * 1.1)) <= 1, JSON.stringify(fit));
    const phone = resolveSymbolPlacement('sweat', { stageW: 390, stageH: 780, dialogTop: 560, sprite: { ...portrait, posX: 50, posY: 100, scale: 90 } });
    assert.ok(phone.x > 195 && phone.x < 390 - phone.size * 0.55, JSON.stringify(phone));
    assert.ok(phone.y + phone.size * 0.55 <= 560, JSON.stringify(phone));
    const edge = resolveSymbolPlacement('anger', { stageW: 1280, stageH: 720, sprite: { ...portrait, posX: 100, posY: 100, scale: 25 } });
    assert.equal(edge.flip, true);
    assert.ok(edge.x < 1280 - 320 * 0.5);
    const none = resolveSymbolPlacement('heart', { stageW: 800, stageH: 450 });
    assert.ok(none.x > 400 && none.y < 225);
    assert.equal(resolveSymbolPlacement('heart', { stageW: 0, stageH: 0 }), null);
});

test('gate:fx-anchor:alpha-scan-finds-head-top-and-width', () => {
    const w = 10;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    const fill = (x, y) => { data[(y * w + x) * 4 + 3] = 255; };
    for (let y = 4; y < 20; y += 1) for (let x = 3; x < 7; x += 1) fill(x, y);
    const head = scanHeadFromAlpha(data, w, h);
    assert.equal(head.top, 4 / 20);
    assert.equal(head.x, 0.5);
    assert.equal(head.w, 0.4);
    assert.equal(scanHeadFromAlpha(new Uint8ClampedArray(w * h * 4), w, h), null);
    assert.equal(scanHeadFromAlpha(new Uint8ClampedArray(w * h * 4).fill(255), w, h), null);
});

test('gate:fx-anchor:manual-head-round-trips-and-overrides-probe', () => {
    const rect = spriteDrawRect(1280, 720, { naturalW: 600, naturalH: 1200, posX: 30, posY: 100, scale: 30 });
    const head = { x: 0.42, top: 0.07, w: 0.28 };
    const back = markerToHead(headToMarker(head, rect), rect);
    for (const key of ['x', 'top', 'w']) assert.ok(Math.abs(back[key] - head[key]) < 1e-9, key);
    // 同一份标定在手机尺寸下换算出的落点仍贴着同一张脸。
    const phoneRect = spriteDrawRect(390, 844, { naturalW: 600, naturalH: 1200, posX: 50, posY: 100, scale: 90 });
    const phoneMarker = headToMarker(head, phoneRect);
    assert.ok(Math.abs(phoneMarker.cx - (phoneRect.left + 0.42 * phoneRect.w)) < 1e-9);

    const heads = normalizeSpriteHeads({ 爱丽丝: head, '爱丽丝::害羞': { x: 0.3, top: 0.2, w: 0.2, aspect: 2 }, bad: { x: 'a' } });
    assert.deepEqual(Object.keys(heads), ['爱丽丝', '爱丽丝::害羞']);
    assert.equal(resolveSpriteHead(heads, '爱丽丝', '害羞').x, 0.3);
    assert.equal(resolveSpriteHead(heads, '爱丽丝', '生气').x, 0.42);
    assert.equal(resolveSpriteHead(heads, '鲍勃', ''), null);

    const probed = { naturalW: 600, naturalH: 1200, head: { x: 0.5, top: 0.02, w: 0.4 } };
    assert.equal(spriteGeometry({ posX: 50, posY: 100, scale: 40, head }, probed).head, head);
    assert.equal(spriteGeometry({ posX: 50, posY: 100, scale: 40, head: null }, probed).head, probed.head);
    const noProbe = spriteGeometry({ posX: 50, posY: 100, scale: 40, head: heads['爱丽丝::害羞'] }, null);
    assert.deepEqual([noProbe.naturalW, noProbe.naturalH], [1, 2]);
    assert.equal(spriteGeometry({ posX: 50, posY: 100, scale: 40, head }, null), null);
});

test('gate:sprite-edit:save-writes-head-per-character-and-clears-mood-override', () => {
    const saved = [];
    const current = {
        spriteEditMode: { mode: 'pc', character: '爱丽丝', mood: '害羞', orig: { posX: 50, posY: 100, scale: 40 }, editBar: null, clickLayer: null, headEdit: null },
    };
    const overlay = { querySelector: () => null };
    const ctx = {
        resolveUnifiedSettings: () => ({ bridge: {}, readerSettings: { spriteLayouts: {}, spriteHeads: { '爱丽丝::害羞': { x: 0.1, top: 0.1, w: 0.1 }, 鲍勃: { x: 0.5, top: 0.1, w: 0.3 } } } }),
        saveReaderSettingsPatch: (patch) => saved.push(patch),
    };
    const value = { x: 0.4, top: 0.05, w: 0.3, aspect: 2 };
    exitSpriteEditMode(overlay, current, { posX: 50, posY: 100, scale: 40, head: { key: '爱丽丝', value, clearKey: '爱丽丝::害羞' } }, ctx);
    assert.deepEqual(saved[0].spriteHeads, { 鲍勃: { x: 0.5, top: 0.1, w: 0.3 }, 爱丽丝: value });
    current.spriteEditMode = { ...current.spriteEditMode };
    exitSpriteEditMode(overlay, current, { posX: 50, posY: 100, scale: 40, head: { key: '鲍勃', value: null, clearKey: '' } }, ctx);
    assert.equal('鲍勃' in saved[1].spriteHeads, false);
    current.spriteEditMode = { ...current.spriteEditMode };
    exitSpriteEditMode(overlay, current, { posX: 50, posY: 100, scale: 40, head: null }, ctx);
    assert.equal('spriteHeads' in saved[2], false);
});

test('gate:fx-runtime:page-flip-clears-previous-page-transients', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const settings = { mangaFx: { enabled: true }, heartbeatFx: { enabled: true } };
    const opts = {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: false, audioScheduler: () => null,
        sprite: { url: '/alice.png', posX: 50, posY: 100, scale: 100, head: { x: 0.5, top: 0.08, w: 0.28, aspect: 2 } },
    };
    applyFxToDom(root, snapshot({ statusEmotion: '心动', currentIndex: 0 }, settings), opts);
    const stage = motion.querySelector('#igs-fx-stage');
    assert.equal(stage.querySelectorAll('.igs-fx-transient').length, 2);
    applyFxToDom(root, snapshot({ statusEmotion: '平静', currentIndex: 1 }, settings), opts);
    assert.equal(stage.querySelectorAll('.igs-fx-transient').length, 0);
    assert.equal(timers.queue.length, 0, 'timers of the previous page are cleared');
});

test('gate:fx-runtime:full-screen-fx-flag-busy-until-they-end', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const settings = { mangaFx: { enabled: true, speedLines: ['震惊'] }, fxTags: { enabled: true } };
    const opts = { schedule: timers.schedule, clear: timers.clear, reducedMotion: false };
    applyFxToDom(root, snapshot({ statusEmotion: '震惊' }, settings), opts);
    assert.equal(motion.getAttribute('data-igs-fx-busy'), '1');
    timers.flush();
    assert.equal(motion.getAttribute('data-igs-fx-busy'), null);
    const fx = { instants: [], call: null, flashback: true, letterbox: false };
    applyFxToDom(root, snapshot({ fx, currentIndex: 2 }, settings), opts);
    assert.equal(motion.getAttribute('data-igs-fx-busy'), '1', 'flashback range keeps backdrop blur paused');
    cancelFxEffects(root);
    assert.equal(motion.getAttribute('data-igs-fx-busy'), null);
});

test('gate:fx-symbols:every-kind-has-svg-and-accent-follows-vivid-theme-color', () => {
    for (const kind of MANGA_SYMBOL_KINDS) assert.match(MANGA_SYMBOL_SVG[kind], /^<svg class="igs-fx-svg"/, kind);
    assert.match(MANGA_SYMBOL_SVG.gloom, /igs-fx-wave/);
    const { root, motion } = makeRoot();
    applyFxToDom(root, snapshot({ statusEmotion: '生气' }, { mangaFx: { enabled: true } }), {
        schedule: () => 0, clear() {}, reducedMotion: false,
        sprite: { url: '/alice.png', posX: 50, posY: 100, scale: 100, head: { x: 0.5, top: 0.08, w: 0.28, aspect: 2 } },
    });
    assert.equal(motion.querySelector('.igs-fx-symbol').innerHTML, MANGA_SYMBOL_SVG.anger);
    assert.equal(pickFxAccent({ nameColor: '#ffffff', textColor: '#5d3a4a', thoughtColor: '#c65f86' }), 'hsl(337 88% 60%)');
    assert.equal(pickFxAccent({ nameColor: '#b3b3b3', textColor: '#f4f4f6', dividerColor: '#404040' }), '');
    assert.equal(pickFxAccent(null), '');
});

test('gate:fx-anchor:failed-sprite-probe-is-not-retried-every-render', async () => {
    clearSpriteHeadCache();
    let loads = 0;
    class FailingImage {
        set src(value) { loads += 1; queueMicrotask(() => this.onerror()); }
    }
    const doc = { defaultView: { Image: FailingImage, location: { href: 'http://host/' } } };
    assert.equal(await probeSpriteHead('/broken.png', doc), null);
    assert.equal(await probeSpriteHead('/broken.png', doc), null);
    assert.equal(loads, 1);
    clearSpriteHeadCache();
});

test('gate:sprite-edit:drag-follows-finger-when-sprite-larger-than-stage', () => {
    const stage = { stageW: 400, stageH: 600 };
    const natural = { naturalW: 832, naturalH: 1216 };
    const moved = (layout, dx, dy) => {
        const before = spriteDrawRect(stage.stageW, stage.stageH, { ...layout, ...natural });
        const next = spriteDragPosition({ ...layout, ...stage, ...natural, dx, dy });
        const after = spriteDrawRect(stage.stageW, stage.stageH, { ...layout, ...next, ...natural });
        return { next, dx: after.left - before.left, dy: after.top - before.top };
    };
    // 手机竖屏常见：立绘放大到比舞台宽，手指左移，立绘必须左移同样距离（旧逻辑会反向）。
    const big = moved({ posX: 50, posY: 100, scale: 200 }, -40, -30);
    assert.ok(Math.abs(big.dx - -40) < 1e-6, `横向跟手：${big.dx}`);
    assert.ok(Math.abs(big.dy - -30) < 1e-6, `纵向跟手：${big.dy}`);
    // 立绘比舞台窄（PC 常见）：同样跟手。
    const small = moved({ posX: 50, posY: 100, scale: 50 }, 20, -10);
    assert.ok(Math.abs(small.dx - 20) < 1e-6);
    assert.ok(Math.abs(small.dy - -10) < 1e-6);
    // 立绘恰好与舞台等宽：横向百分比不影响画面，保持不变，不产生跳变。
    const same = spriteDragPosition({ posX: 50, posY: 100, scale: 100, ...stage, ...natural, dx: 30, dy: 0 });
    assert.equal(same.posX, 50);
    // 读不到原图比例：纵向沿用按舞台高度换算。
    const unknown = spriteDragPosition({ posX: 50, posY: 100, scale: 200, ...stage, dx: -40, dy: -60 });
    assert.equal(unknown.posX, 60);
    assert.equal(unknown.posY, 90);
});


test('gate:fx-runtime:onomatopoeia-plays-sound-without-big-text', () => {
    const { root, motion } = makeRoot();
    const timers = clock();
    const jobs = [];
    const fx = { instants: [{ kind: 'sfx', text: '砰！' }], call: null, flashback: false, dream: false, letterbox: false };
    const result = applyFxToDom(root, snapshot({ fx }, { fxTags: { enabled: true } }), {
        schedule: timers.schedule, clear: timers.clear, reducedMotion: false,
        audioScheduler: (job) => { jobs.push(job); return { stop() {} }; },
    });
    assert.deepEqual(result.played, ['sfx']);
    assert.deepEqual(result.ranges, { flashback: false, dream: false, letterbox: false });
    assert.deepEqual(jobs.map((job) => job.kind), ['onomatopoeia:impact']);
    assert.ok(jobs[0].partials.length > 0);
    assert.equal(motion.querySelector('.igs-fx-sfx'), null, 'no onomatopoeia text node');
    assert.equal(timers.queue.length, 0, 'nothing to expire');
    cancelFxEffects(root);
});


test('gate:fx-runtime:cast-react-symbol-lands-on-cast-once-per-page', () => {
    const { root, motion } = makeRoot();
    const cast = [{ character: 'Bob', url: '/bob.png', posX: 18, posY: 100, scale: 100, head: { x: 0.5, top: 0.1, w: 0.3, aspect: 2 } }];
    const opts = { schedule: () => 0, clear() {}, reducedMotion: false, cast, castMarks: [{ character: 'Bob', kind: 'anger' }, { character: 'Zed', kind: 'sweat' }] };
    // 漫画演出等总开关全关：陪衬反应符号照常播放。
    const settings = { stageCast: { enabled: true, castReact: true } };
    const castPlayed = (result) => result.played.filter((p) => String(p).startsWith('castSymbol:'));
    const first = applyFxToDom(root, snapshot({}, settings), opts);
    assert.deepEqual(castPlayed(first), ['castSymbol:Bob:anger']);
    const symbols = motion.querySelectorAll('.igs-fx-symbol');
    assert.equal(symbols.length, 1);
    assert.equal(symbols[0].getAttribute('data-kind'), 'anger');
    assert.equal(symbols[0].getAttribute('data-igs-fx-cast'), 'Bob');
    // 同页重绘不重播；换页再播。
    assert.deepEqual(castPlayed(applyFxToDom(root, snapshot({}, settings), opts)), []);
    assert.deepEqual(castPlayed(applyFxToDom(root, snapshot({ currentIndex: 1 }, settings), opts)), ['castSymbol:Bob:anger']);
    // 没有 castMarks 且总开关全关：不挂演出层。
    const bare = makeRoot();
    assert.deepEqual(applyFxToDom(bare.root, snapshot({}, settings), { schedule: () => 0, clear() {}, reducedMotion: false }).played, []);
    cancelFxEffects(root);
});

test('gate:fx-runtime:ancient-era-light-off-blows-out-a-candle', () => {
    const fx = { instants: [{ kind: 'light', mode: 'off' }], call: null, flashback: false, dream: false, letterbox: false, lightsOff: true };
    const run = (readerSettings, reducedMotion) => {
        const { root, motion } = makeRoot();
        const timers = clock();
        const sounds = [];
        applyFxToDom(root, snapshot({ fx }, readerSettings), {
            schedule: timers.schedule, clear: timers.clear, reducedMotion,
            audioScheduler: (job) => { sounds.push(job.kind); return null; },
        });
        return { root, motion, sounds, candle: motion.querySelector('.igs-fx-candle') };
    };
    const tags = { enabled: true, light: true };
    // 古代背景：舞台层出一支蜡烛（青烟、烛火、烛身），音效为吹气风声，区间压暗照旧。
    const ancient = run({ fxTags: tags, _ancientEra: true }, false);
    assert.ok(ancient.candle, 'ancient era spawns a candle');
    assert.equal(ancient.candle.getAttribute('aria-hidden'), 'true');
    assert.deepEqual(ancient.candle.children.map((c) => c.className), ['igs-fx-candle-smoke', 'igs-fx-candle-flame', 'igs-fx-candle-body']);
    assert.ok(ancient.motion.getAttribute('data-igs-fx-lightsoff') !== null, 'dimming still driven by the range flag');
    assert.deepEqual(ancient.sounds, ['onomatopoeia:whoosh']);
    cancelFxEffects(ancient.root);
    assert.equal(ancient.motion.querySelector('.igs-fx-candle'), null, 'candle cleaned up on cancel');
    // 现代背景：不出蜡烛，保持原来的开关声。
    const modern = run({ fxTags: tags }, false);
    assert.ok(!modern.candle, 'modern era has no candle');
    assert.deepEqual(modern.sounds, ['onomatopoeia:crack']);
    cancelFxEffects(modern.root);
    // 减少动态效果：古代也不出蜡烛，只留压暗与音效。
    const reduced = run({ fxTags: tags, _ancientEra: true }, true);
    assert.ok(!reduced.candle, 'reduced motion skips the candle');
    assert.deepEqual(reduced.sounds, ['onomatopoeia:whoosh']);
    cancelFxEffects(reduced.root);
    assert.match(FX_STYLE_TEXT, /\.igs-fx-candle-flame\{[^}]*animation:igs-fx-candle-blow/);
    assert.match(FX_STYLE_TEXT, /prefers-reduced-motion: reduce\)\{\.igs-fx-candle\{display:none/);
});



test('gate:fx-runtime:world-skin-notify-marks-class-sound-and-style-per-worldview', async () => {
    const { WORLD_SKIN_IDS } = await import('../src/scene/worldview.js');
    assert.deepEqual([...WORLD_SKIN_IDS].sort(), ['apocalypse', 'fantasy', 'scifi', 'taisho']);
    const fx = { instants: [{ kind: 'notify', sender: '信使', text: '有客到' }], call: null, flashback: false, dream: false, letterbox: false };
    for (const id of WORLD_SKIN_IDS) {
        const { root, motion } = makeRoot();
        const timers = clock();
        const sounds = [];
        const opts = { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, audioScheduler: (job) => { sounds.push(job.kind); return null; } };
        applyFxToDom(root, snapshot({ fx }, { fxTags: { enabled: true }, _worldview: id }), opts);
        const el = motion.querySelector('#igs-fx-front').querySelector('.igs-fx-notify');
        assert.ok(el, id);
        assert.ok(el.className.split(/\s+/).includes(`is-${id}`), id);
        assert.equal(el.className.includes('is-ancient'), false, id);
        assert.equal(el.children[0].textContent, '信使', `${id}: no ancient seal`);
        assert.ok(!motion.getAttribute('data-igs-fx-era'), id);
        assert.deepEqual(sounds, [`notify-${id}`], id);
        assert.ok(FX_SFX_PARTIALS[`notify-${id}`].length > 0, id);
        for (const kind of ['notify', 'title-card', 'promise']) assert.ok(FX_STYLE_TEXT.includes(`.igs-fx-${kind}.is-${id}{`), `${id} ${kind}`);
        cancelFxEffects(root);
    }
    const { root, motion } = makeRoot();
    const timers = clock();
    applyFxToDom(root, snapshot({ fx }, { fxTags: { enabled: true }, _worldview: 'modern' }), { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, audioScheduler: () => null });
    const modern = motion.querySelector('#igs-fx-front').querySelector('.igs-fx-notify');
    const modernClasses = String(modern.className).split(/\s+/);
    assert.ok(modernClasses.includes('igs-fx-notify'));
    for (const id of [...WORLD_SKIN_IDS, 'ancient']) assert.equal(modernClasses.includes(`is-${id}`), false, `modern notify carries no is-${id}`);
    cancelFxEffects(root);
});
