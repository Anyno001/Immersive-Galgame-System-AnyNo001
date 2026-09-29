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
