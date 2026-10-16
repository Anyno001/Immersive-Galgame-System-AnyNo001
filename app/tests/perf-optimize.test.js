import test from 'node:test';
import assert from 'node:assert/strict';
import { getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';
import { createChatStreamObserver } from '../src/host/chat-stream-observer.js';

test('gate:perf:bg-blur-layer-hidden-unless-romance-blurs-background', () => {
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-bg-blur\{[^}]*display:none;/);
    assert.match(css, /#igs-stage-motion\[data-igs-rm-glow\]:not\(\[data-igs-fx-flashback\]\):not\(\[data-igs-fx-dream\]\) #igs-bg-blur\{display:block;\}/);
    assert.match(css, /#igs-bg\{[^}]*background-color:var\(--igs-empty-bg,#16181a\)/, 'opaque #igs-bg is what makes the blur layer invisible elsewhere');
});

test('gate:perf:stream-observer-throttles-activity-leading-and-trailing', () => {
    const { createChatStreamObserverForTest, fire, timers, calls } = streamObserverHarness();
    const observer = createChatStreamObserverForTest();
    observer.start();
    fire();
    assert.equal(calls.count, 1, 'first mutation handled immediately');
    fire();
    fire();
    fire();
    assert.equal(calls.count, 1, 'bursts inside the window are merged');
    const throttle = [...timers.entries()].find(([, t]) => t.delay === 150);
    assert.ok(throttle);
    timers.delete(throttle[0]);
    throttle[1].handler();
    assert.equal(calls.count, 2, 'trailing call catches the last mutation');
    assert.ok([...timers.values()].some((t) => t.delay === 800), 'stable detection still armed');
    observer.stop();
    assert.ok(![...timers.values()].some((t) => t.delay === 150), 'stop clears the throttle timer');
});

function streamObserverHarness() {
    const timers = new Map();
    let id = 0;
    const created = [];
    const calls = { count: 0 };
    const globalObject = {
        setTimeout(handler, delay) { id += 1; timers.set(id, { handler, delay }); return id; },
        clearTimeout(timer) { timers.delete(timer); },
        MutationObserver: class {
            constructor(handler) { this.handler = handler; created.push(this); }
            observe() {}
            disconnect() {}
        },
    };
    return {
        timers,
        calls,
        fire: () => created[0].handler([{ target: {} }]),
        createChatStreamObserverForTest: () => createChatStreamObserver({
            global: globalObject,
            document: { querySelector: () => ({}), defaultView: globalObject },
            onActivity: () => { calls.count += 1; },
        }),
    };
}

test('gate:perf:text-fx-promotes-layers-only-for-looping-effects', async () => {
    const { TEXT_FX_STYLE_TEXT } = await import('../src/visual/igs-ui/text-fx.js');
    assert.match(TEXT_FX_STYLE_TEXT, /\.igs-tfx-ch\{display:inline-block;white-space:pre;\}/);
    assert.match(TEXT_FX_STYLE_TEXT, /\.igs-tfx-shake \.igs-tfx-ch\{will-change:transform;/);
    assert.match(TEXT_FX_STYLE_TEXT, /\.igs-tfx-wave \.igs-tfx-ch\{will-change:transform;/);
    assert.equal(TEXT_FX_STYLE_TEXT.match(/will-change:transform/g).length, 2);
});

test('gate:perf:romance-bokeh-has-no-filter-and-pauses-kenburns', async () => {
    const { ROMANCE_STYLE_TEXT } = await import('../src/visual/igs-ui/romance-style.js');
    const bokehRules = [...ROMANCE_STYLE_TEXT.matchAll(/[^\n}]*\.igs-rm-bokeh\{[^}]*\}/g)].map((m) => m[0]);
    assert.ok(bokehRules.length >= 3);
    for (const rule of bokehRules) assert.doesNotMatch(rule, /filter/);
    assert.match(ROMANCE_STYLE_TEXT, /#igs-overlay\[data-igs-quality="low"\] #igs-stage-motion \.igs-rm-bokeh\{display:none;\}/);
    assert.match(ROMANCE_STYLE_TEXT, /#igs-stage-motion\[data-igs-rm-glow\]:not\(\[data-igs-fx-flashback\]\):not\(\[data-igs-fx-dream\]\) #igs-bg\{[^}]*animation-play-state:paused;/);
});

test('gate:perf:inactive-romance-layers-hide-after-fade-and-bokeh-stops-drifting', async () => {
    const { ROMANCE_STYLE_TEXT } = await import('../src/visual/igs-ui/romance-style.js');
    assert.match(ROMANCE_STYLE_TEXT, /\.igs-rm-back>div\{[^}]*opacity:0;visibility:hidden;transition:opacity 1\.6s ease,visibility 0s linear 1\.6s;\}/);
    for (const name of ['glow', 'bokeh', 'backlight']) {
        const rule = new RegExp(String.raw`#igs-stage-motion\[data-igs-rm-${name}\] \.igs-rm-${name}\{[^}]*visibility:visible;transition-delay:0s;\}`);
        assert.match(ROMANCE_STYLE_TEXT, rule, name);
    }
    assert.match(ROMANCE_STYLE_TEXT, /#igs-stage-motion:not\(\[data-igs-rm-bokeh\]\) \.igs-rm-bokeh\{animation-play-state:paused;\}/);
});

test('gate:perf:rain-splashes-batch-into-fixed-alpha-levels', async () => {
    const { splashLevel } = await import('../src/visual/igs-ui/weather-fx-particles.js');
    assert.equal(splashLevel(0), 8);
    assert.equal(splashLevel(0.05), 8);
    assert.equal(splashLevel(0.5), 4);
    assert.equal(splashLevel(0.99), 1);
    assert.equal(splashLevel(1), 1);
    let prev = Infinity;
    for (let p = 0; p <= 1; p += 0.01) {
        const level = splashLevel(p);
        assert.ok(level >= 1 && level <= 8 && level <= prev);
        prev = level;
    }
});

test('gate:perf:lightning-skips-flash-while-stage-paused-but-keeps-thunder-event', async () => {
    const { applyWeatherFx, cancelWeatherFx, WEATHER_FLASH_EVENT } = await import('../src/visual/igs-ui/weather-fx-runtime.js');
    const { setStagePauseReason } = await import('../src/visual/igs-ui/stage-pause.js');
    const overlay = { id: 'igs-overlay', attrs: new Map(), setAttribute(k, v) { this.attrs.set(k, v); }, removeAttribute(k) { this.attrs.delete(k); } };
    const makeLayer = (id) => {
        const classes = new Set();
        const attrs = new Map();
        const node = {
            id, isConnected: true, className: '', parentNode: overlay, events: [],
            classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n), contains: (n) => classes.has(n) },
            setAttribute(k, v) { attrs.set(k, String(v)); },
            removeAttribute(k) { attrs.delete(k); },
            getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
            dispatchEvent(event) { node.events.push(event.type); return true; },
            closest(selector) {
                for (let cur = node; cur; cur = cur.parentNode) {
                    if (selector.split(',').some((s) => s.trim() === `#${cur.id}`)) return cur;
                }
                return null;
            },
        };
        return node;
    };
    const layer = makeLayer('igs-effect-layer');
    const front = makeLayer('igs-effect-front-layer');
    const queue = [];
    const schedule = (fn) => { const timer = { fn }; queue.push(timer); return timer; };
    const clear = (timer) => { const i = queue.indexOf(timer); if (i >= 0) queue.splice(i, 1); };
    applyWeatherFx(layer, { settings: { enabled: true }, weather: '雷暴', front, particles: false, reducedMotion: false, schedule, clear, random: () => 0 });
    setStagePauseReason(overlay, 'panel:settings', true);
    queue.shift().fn();
    assert.equal(front.classList.contains('igs-fx-lightning-active'), false, 'no flash under a panel');
    assert.equal(front.getAttribute('data-igs-weather-fx-flash'), null);
    assert.deepEqual(front.events, [WEATHER_FLASH_EVENT], 'thunder sound still follows');
    queue.shift().fn();
    setStagePauseReason(overlay, 'panel:settings', false);
    queue.shift().fn();
    assert.equal(front.classList.contains('igs-fx-lightning-active'), true, 'flashes again once the stage resumes');
    assert.equal(front.events.length, 2);
    cancelWeatherFx(layer, front);
});
