import test from 'node:test';
import assert from 'node:assert/strict';
import {
    STAGE_PAUSED_ATTR,
    STAGE_PAUSE_STYLE_TEXT,
    isStagePaused,
    onStageResume,
    setStagePauseReason,
    watchStagePause,
} from '../src/visual/igs-ui/stage-pause.js';
import { startWeatherParticles } from '../src/visual/igs-ui/weather-fx-particles.js';
import { startPetals } from '../src/visual/igs-ui/fx-daily-particles.js';
import { getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';

function matchesOne(el, selector) {
    const s = selector.trim();
    if (s.startsWith('#')) return el.id === s.slice(1);
    if (s.startsWith('.')) return String(el.className || '').split(/\s+/).includes(s.slice(1));
    return false;
}

function fakeDoc() {
    const listeners = new Map();
    const frames = [];
    const view = {
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
        cancelAnimationFrame() { frames.length = 0; },
    };
    const doc = {
        hidden: false,
        defaultView: view,
        listeners,
        frames,
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
        createElement() {
            const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
            return { width: 0, height: 0, className: '', style: {}, parentNode: null, setAttribute() {}, getContext: () => ctx };
        },
    };
    return doc;
}

function el(doc, { id = '', className = '', parent = null } = {}) {
    const node = {
        id, className, parentNode: parent, ownerDocument: doc, isConnected: true, clientWidth: 800, clientHeight: 600, children: [], attrs: new Map(),
        setAttribute(k, v) { node.attrs.set(k, String(v)); },
        removeAttribute(k) { node.attrs.delete(k); },
        getAttribute(k) { return node.attrs.has(k) ? node.attrs.get(k) : null; },
        hasAttribute(k) { return node.attrs.has(k); },
        appendChild(child) { child.parentNode = node; node.children.push(child); return child; },
        removeChild(child) { node.children = node.children.filter((c) => c !== child); child.parentNode = null; },
        closest(selector) {
            for (let cur = node; cur; cur = cur.parentNode) {
                if (selector.split(',').some((s) => matchesOne(cur, s))) return cur;
            }
            return null;
        },
    };
    return node;
}

function stage() {
    const doc = fakeDoc();
    const overlay = el(doc, { id: 'igs-overlay' });
    const motion = el(doc, { id: 'igs-stage-motion', parent: overlay });
    const back = el(doc, { id: 'igs-effect-layer', parent: motion });
    const front = el(doc, { id: 'igs-effect-front-layer', parent: motion });
    const fxStage = el(doc, { id: 'igs-fx-stage', parent: motion });
    const petals = el(doc, { className: 'igs-dfx-petals', parent: fxStage });
    const dbLayer = el(doc, { id: 'igs-db-layer', parent: motion });
    const mapWeather = el(doc, { className: 'igs-map-weather', parent: dbLayer });
    return { doc, overlay, back, front, petals, mapWeather };
}

test('gate:stage-pause:reasons-merge-into-one-flag-and-overlay-attribute', () => {
    const { overlay, back } = stage();
    assert.equal(isStagePaused(overlay), false);
    setStagePauseReason(overlay, 'panel:settings', true);
    setStagePauseReason(overlay, 'offscreen', true);
    assert.equal(isStagePaused(back), true, 'stage layers resolve to their overlay');
    assert.equal(overlay.getAttribute(STAGE_PAUSED_ATTR), 'panel:settings offscreen');
    setStagePauseReason(overlay, 'panel:settings', false);
    assert.equal(isStagePaused(overlay), true, 'still paused while another reason holds');
    assert.equal(overlay.getAttribute(STAGE_PAUSED_ATTR), 'offscreen');
    setStagePauseReason(overlay, 'offscreen', false);
    assert.equal(isStagePaused(overlay), false);
    assert.equal(overlay.hasAttribute(STAGE_PAUSED_ATTR), false);
});

test('gate:stage-pause:resume-callbacks-fire-once-on-transition-and-unsubscribe', () => {
    const { overlay } = stage();
    let calls = 0;
    const off = onStageResume(overlay, () => { calls += 1; });
    setStagePauseReason(overlay, 'offscreen', false);
    assert.equal(calls, 0, 'no resume without a prior pause');
    setStagePauseReason(overlay, 'hidden', true);
    setStagePauseReason(overlay, 'panel:map', true);
    setStagePauseReason(overlay, 'hidden', false);
    assert.equal(calls, 0);
    setStagePauseReason(overlay, 'panel:map', false);
    assert.equal(calls, 1);
    off();
    setStagePauseReason(overlay, 'hidden', true);
    setStagePauseReason(overlay, 'hidden', false);
    assert.equal(calls, 1);
});

test('gate:stage-pause:panel-canvases-are-not-stage', () => {
    const { overlay, mapWeather } = stage();
    setStagePauseReason(overlay, 'panel:map', true);
    assert.equal(isStagePaused(mapWeather), false, 'map panel weather keeps running while the map covers the stage');
    setStagePauseReason(overlay, 'panel:map', false);
});

test('gate:stage-pause:weather-particles-stop-while-paused-and-restart-on-resume', () => {
    const { doc, overlay, back, front } = stage();
    const plan = { kind: 'rain', level: 'medium', scene: 'outdoor', time: '', thunder: false, wind: false, particles: true };
    const controller = startWeatherParticles({ back, front, plan });
    assert.equal(doc.frames.length, 1);
    setStagePauseReason(overlay, 'panel:settings', true);
    doc.frames.shift()(1000);
    assert.equal(doc.frames.length, 0, 'no frame requested while paused');
    setStagePauseReason(overlay, 'panel:settings', false);
    assert.equal(doc.frames.length, 1, 'resume restarts the loop');
    controller.stop();
    setStagePauseReason(overlay, 'hidden', true);
    setStagePauseReason(overlay, 'hidden', false);
    assert.equal(doc.frames.length, 0, 'stopped loop is unsubscribed');
});

test('gate:stage-pause:petal-loop-stops-while-paused-and-restarts-on-resume', () => {
    const { overlay, petals } = stage();
    const frames = [];
    const handle = startPetals(petals, { kind: 'sakura', raf: (fn) => { frames.push(fn); return frames.length; }, cancelRaf: () => { frames.length = 0; }, now: () => 0, reducedMotion: false });
    assert.equal(frames.length, 1);
    setStagePauseReason(overlay, 'offscreen', true);
    frames.shift()(0);
    assert.equal(frames.length, 0);
    setStagePauseReason(overlay, 'offscreen', false);
    assert.equal(frames.length, 1);
    handle.stop();
});

test('gate:stage-pause:watch-drives-hidden-and-offscreen-and-cleans-up', () => {
    const { doc, overlay } = stage();
    let observed = null;
    let disconnected = false;
    let callback = null;
    doc.defaultView.IntersectionObserver = class {
        constructor(cb) { callback = cb; }
        observe(target) { observed = target; }
        disconnect() { disconnected = true; }
    };
    const root = { id: 'root' };
    const stop = watchStagePause(overlay, { offscreen: true, root });
    assert.equal(observed, root);
    callback([{ isIntersecting: false }]);
    assert.equal(isStagePaused(overlay), true);
    callback([{ isIntersecting: true }]);
    assert.equal(isStagePaused(overlay), false);
    doc.hidden = true;
    doc.listeners.get('visibilitychange')();
    assert.equal(overlay.getAttribute(STAGE_PAUSED_ATTR), 'hidden');
    stop();
    assert.equal(disconnected, true);
    assert.equal(doc.listeners.has('visibilitychange'), false);
    assert.equal(isStagePaused(overlay), false);
});

test('gate:stage-pause:css-pauses-only-stage-layers', () => {
    assert.ok(getOriginalReaderStyleText().includes(STAGE_PAUSE_STYLE_TEXT));
    assert.match(STAGE_PAUSE_STYLE_TEXT, /animation-play-state:paused!important/);
    for (const id of ['#igs-bg', '#igs-sprite', '#igs-cast', '#igs-effect-layer', '#igs-fx-stage', '#igs-fx-front']) assert.ok(STAGE_PAUSE_STYLE_TEXT.includes(id), id);
    for (const panel of ['#igs-dialog', '#igs-text', '#igs-db-layer', '#igs-record-panel', '#igs-map-panel', '#igs-cg-gallery', '#igs-unified-settings', '#igs-toolbar']) {
        assert.equal(STAGE_PAUSE_STYLE_TEXT.includes(panel), false, panel);
    }
});
