import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyRenderQualityToDom,
    getQualityFactor,
    getRenderQuality,
    normalizeRenderQualitySetting,
    resolveRenderQuality,
    setRenderQuality,
} from '../src/visual/igs-ui/render-quality.js';
import { normalizePerformanceSettings, normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { renderQualityRow } from '../src/visual/igs-ui/render-quality-fields.js';
import { startWeatherParticles } from '../src/visual/igs-ui/weather-fx-particles.js';
import { createBurst, startFireworks, startLanterns, startPetals } from '../src/visual/igs-ui/fx-daily-particles.js';

function withEnv({ navigator, media = {} }, fn) {
    const saved = {
        navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
        matchMedia: Object.getOwnPropertyDescriptor(globalThis, 'matchMedia'),
    };
    Object.defineProperty(globalThis, 'navigator', { value: navigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'matchMedia', {
        value: (query) => ({ matches: Boolean(media[query]) }),
        configurable: true,
        writable: true,
    });
    try {
        return fn();
    } finally {
        for (const [key, desc] of Object.entries(saved)) {
            if (desc) Object.defineProperty(globalThis, key, desc);
            else delete globalThis[key];
        }
    }
}

function withTier(tier, fn) {
    const prev = getRenderQuality();
    setRenderQuality(tier);
    try {
        return fn();
    } finally {
        setRenderQuality(prev);
    }
}

test('gate:render-quality:normalize-defaults-to-auto', () => {
    assert.equal(normalizeRenderQualitySetting(undefined), 'auto');
    assert.equal(normalizeRenderQualitySetting('ultra'), 'auto');
    assert.equal(normalizeRenderQualitySetting('low'), 'low');
    assert.deepEqual(normalizePerformanceSettings(undefined), { quality: 'auto' });
    assert.deepEqual(normalizePerformanceSettings({ quality: 'normal' }), { quality: 'normal' });
    assert.equal(normalizeSettingsValue('readerSettings.performance.quality', null), 'auto');
    assert.equal(normalizeSettingsValue('readerSettings.performance.quality', 'bogus'), 'auto');
    assert.equal(normalizeSettingsValue('readerSettings.performance.quality', 'low'), 'low');
});

test('gate:render-quality:auto-detects-low-end-devices', () => {
    const desktop = { deviceMemory: 8, hardwareConcurrency: 8, maxTouchPoints: 0 };
    withEnv({ navigator: desktop }, () => assert.equal(resolveRenderQuality('auto'), 'normal'));
    withEnv({ navigator: { ...desktop, deviceMemory: 4 } }, () => assert.equal(resolveRenderQuality('auto'), 'low'));
    withEnv({ navigator: { ...desktop, hardwareConcurrency: 4 } }, () => assert.equal(resolveRenderQuality('auto'), 'normal'));
    withEnv({ navigator: { ...desktop, hardwareConcurrency: 4 }, media: { '(pointer: coarse)': true } }, () => assert.equal(resolveRenderQuality('auto'), 'low'));
    withEnv({ navigator: desktop, media: { '(prefers-reduced-motion: reduce)': true } }, () => assert.equal(resolveRenderQuality('auto'), 'low'));
    withEnv({ navigator: { hardwareConcurrency: 2, maxTouchPoints: 0 } }, () => assert.equal(resolveRenderQuality(undefined), 'normal'));
    withEnv({ navigator: { ...desktop, deviceMemory: 2 } }, () => {
        assert.equal(resolveRenderQuality('normal'), 'normal');
        assert.equal(resolveRenderQuality('low'), 'low');
    });
});

test('gate:render-quality:overlay-attribute-and-factor-follow-tier', () => {
    const attrs = new Map();
    const overlay = {
        getAttribute: (key) => (attrs.has(key) ? attrs.get(key) : null),
        setAttribute: (key, value) => attrs.set(key, value),
        removeAttribute: (key) => attrs.delete(key),
    };
    const prev = getRenderQuality();
    try {
        assert.equal(applyRenderQualityToDom(overlay, 'low'), 'low');
        assert.equal(attrs.get('data-igs-quality'), 'low');
        assert.equal(getRenderQuality(), 'low');
        assert.deepEqual({ ...getQualityFactor() }, { density: 0.5, fps: 20, dprCap: 1 });
        assert.equal(applyRenderQualityToDom(overlay, 'normal'), 'normal');
        assert.equal(attrs.has('data-igs-quality'), false);
        assert.deepEqual({ ...getQualityFactor() }, { density: 1, fps: null, dprCap: null });
    } finally {
        setRenderQuality(prev);
    }
});

test('gate:render-quality:settings-row-binds-performance-quality', () => {
    const html = renderQualityRow({ performance: { quality: 'low' } });
    assert.match(html, /data-path="readerSettings\.performance\.quality"/);
    assert.match(html, /<option value="low" selected>/);
    assert.match(renderQualityRow({}), /<option value="auto" selected>/);
});

function weatherEnv() {
    const frames = [];
    let clears = 0;
    let moves = 0;
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'clearRect') return () => { clears += 1; };
            if (key === 'moveTo') return () => { moves += 1; };
            return () => {};
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    const view = {
        devicePixelRatio: 2,
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
        cancelAnimationFrame() { frames.length = 0; },
    };
    const doc = {
        defaultView: view,
        createElement() {
            return { width: 0, height: 0, className: '', parentNode: null, setAttribute() {}, getContext: () => ctx };
        },
    };
    const layer = () => {
        const el = {
            ownerDocument: doc, isConnected: true, clientWidth: 1280, clientHeight: 720, children: [],
            appendChild(child) { child.parentNode = el; el.children.push(child); },
            removeChild(child) { el.children = el.children.filter((item) => item !== child); child.parentNode = null; },
        };
        return el;
    };
    return { back: layer(), front: layer(), tick: (now) => { const fn = frames.shift(); if (fn) fn(now); }, clears: () => clears, moves: () => moves };
}

function weatherCounts(tier) {
    return withTier(tier, () => {
        const env = weatherEnv();
        const plan = { kind: 'rain', level: 'medium', scene: 'outdoor', time: '', thunder: false, wind: false, particles: true };
        let captured = null;
        const controller = startWeatherParticles({ back: env.back, front: env.front, plan, random: () => 0.5 });
        env.tick(1000);
        const firstFrameMoves = env.moves();
        env.tick(1040);
        captured = { clearsAfter40ms: env.clears(), firstFrameMoves: 0 };
        env.tick(1060);
        captured.clearsAfter60ms = env.clears();
        captured.firstFrameMoves = firstFrameMoves;
        controller.stop();
        return captured;
    });
}

test('gate:render-quality:low-tier-halves-weather-particles-and-caps-fps', () => {
    const normal = weatherCounts('normal');
    const low = weatherCounts('low');
    assert.equal(normal.clearsAfter40ms, 4);
    assert.equal(low.clearsAfter40ms, 2, 'low tier skips the 40ms frame at 20fps');
    assert.equal(low.clearsAfter60ms, 4);
    assert.ok(normal.firstFrameMoves > 0);
    assert.ok(Math.abs(low.firstFrameMoves * 2 - normal.firstFrameMoves) <= 2, `low ${low.firstFrameMoves} vs normal ${normal.firstFrameMoves}`);
});

function dailyEnv({ dpr = 2 } = {}) {
    const frames = [];
    const ctx = new Proxy({}, {
        get(target, key) { return key in target ? target[key] : () => {}; },
        set(target, key, value) { target[key] = value; return true; },
    });
    const canvases = [];
    const doc = {
        hidden: false,
        defaultView: { devicePixelRatio: dpr },
        createElement() {
            const canvas = { width: 0, height: 0, className: '', style: {}, parentNode: null, setAttribute() {}, getContext: () => ctx };
            canvases.push(canvas);
            return canvas;
        },
        addEventListener() {},
        removeEventListener() {},
    };
    const layer = {
        ownerDocument: doc, isConnected: true, clientWidth: 800, clientHeight: 600, children: [],
        appendChild(child) { child.parentNode = layer; layer.children.push(child); },
        removeChild(child) { layer.children = layer.children.filter((item) => item !== child); child.parentNode = null; },
    };
    let time = 0;
    return {
        layer,
        canvases,
        raf: (fn) => { frames.push(fn); return frames.length; },
        cancelRaf: () => { frames.length = 0; },
        now: () => time,
        frames,
    };
}

test('gate:render-quality:low-tier-halves-daily-particles-and-caps-dpr', () => {
    const seededRandom = () => 0.5;
    assert.equal(createBurst({ random: seededRandom, count: 80 }).sparks.length, 80);
    assert.equal(createBurst({ random: seededRandom, count: 80, density: 0.5 }).sparks.length, 40);

    for (const [tier, dprCanvasWidth] of [['normal', 1600], ['low', 800]]) {
        withTier(tier, () => {
            const env = dailyEnv();
            const fw = startFireworks(env.layer, { raf: env.raf, cancelRaf: env.cancelRaf, now: env.now, random: seededRandom, reducedMotion: false });
            assert.equal(env.canvases[0].width, dprCanvasWidth, `${tier} fireworks dpr`);
            fw.stop();
            const lanternEnv = dailyEnv();
            const ln = startLanterns(lanternEnv.layer, { raf: lanternEnv.raf, cancelRaf: lanternEnv.cancelRaf, now: lanternEnv.now, random: seededRandom, reducedMotion: false });
            assert.equal(lanternEnv.canvases[0].width, dprCanvasWidth, `${tier} lanterns dpr`);
            ln.stop();
        });
    }
});

test('gate:render-quality:low-tier-halves-petals', () => {
    const count = (tier) => withTier(tier, () => {
        const env = dailyEnv({ dpr: 1 });
        let traced = 0;
        env.layer.ownerDocument.createElement = () => {
            const ctx = new Proxy({}, {
                get(target, key) {
                    if (key in target) return target[key];
                    if (key === 'ellipse' || key === 'bezierCurveTo' || key === 'quadraticCurveTo') return () => { traced += 1; };
                    return () => {};
                },
                set(target, key, value) { target[key] = value; return true; },
            });
            return { width: 0, height: 0, className: '', style: {}, parentNode: null, setAttribute() {}, getContext: () => ctx };
        };
        const petals = startPetals(env.layer, { raf: env.raf, cancelRaf: env.cancelRaf, now: env.now, random: () => 0.5, reducedMotion: false, kind: 'sakura', density: 'light' });
        const fn = env.frames.shift();
        if (fn) fn(1000);
        petals.stop();
        return traced;
    });
    const normal = count('normal');
    const low = count('low');
    assert.ok(normal > 0);
    assert.ok(Math.abs(low * 2 - normal) <= normal * 0.1, `low ${low} vs normal ${normal}`);
});
