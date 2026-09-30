import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AUDIO_BUS_NAMES,
    audioMasterVolume,
    busInput,
    getAudioBus,
    normalizeAudioMasterSettings,
    parkAudioBus,
    unparkAudioBus,
    resetAudioBusForTest,
    resumeAudioBus,
    setAudioBusSpace,
    setAudioMasterVolume,
} from '../src/visual/igs-ui/audio-bus.js';
import { playSynthPartials, createSynthPartial as p } from '../src/visual/igs-ui/chat-sfx.js';
import { scheduleTypewriterAudio } from '../src/visual/igs-ui/typewriter-audio.js';
import { applySceneAudio, cancelSceneAudio } from '../src/visual/igs-ui/scene-audio.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function param(value = 0) {
    const history = [];
    const record = (name) => (...args) => { history.push([name, ...args]); };
    return {
        value, history,
        setValueAtTime: record('set'), linearRampToValueAtTime: record('linear'),
        exponentialRampToValueAtTime: record('exp'), setTargetAtTime: record('target'),
        cancelScheduledValues: record('cancel'),
    };
}

function fakeContext({ state = 'running', resumeTo = 'running' } = {}) {
    const nodes = [];
    const ctx = {
        nodes, state, currentTime: 0, sampleRate: 8000, destination: { kind: 'destination' },
        resumes: 0, suspends: 0,
        resume() { this.resumes++; this.state = resumeTo; return Promise.resolve(); },
        suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); },
    };
    const node = (kind, extra) => {
        const n = { kind, context: ctx, connected: [], connect(target) { this.connected.push(target); return target; }, disconnect() {}, ...extra };
        nodes.push(n);
        return n;
    };
    const source = (kind, extra) => node(kind, { start() {}, stop() {}, ...extra });
    Object.assign(ctx, {
        createGain: () => node('gain', { gain: param(1) }),
        createDynamicsCompressor: () => node('compressor', {
            threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25),
        }),
        createBiquadFilter: () => node('filter', { type: 'lowpass', frequency: param(350), Q: param(1) }),
        createOscillator: () => source('osc', { type: 'sine', frequency: param(440) }),
        createBufferSource: () => source('buffer', { buffer: null, loop: false, playbackRate: param(1) }),
        createBuffer: (channels, length, sampleRate) => { const data = new Float32Array(length); return { sampleRate, getChannelData: () => data }; },
    });
    return ctx;
}

function counted(ctx) {
    const factory = () => { factory.calls++; return ctx; };
    factory.calls = 0;
    return factory;
}

function fakeDocument() {
    const listeners = [];
    return {
        hidden: false, listeners,
        addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
        removeEventListener(type, fn, capture) {
            const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
            if (i >= 0) listeners.splice(i, 1);
        },
        fire(type) { for (const l of listeners.filter((x) => x.type === type)) l.fn(); },
    };
}

test.afterEach(() => resetAudioBusForTest());

test('gate: audio bus creates one context with four sub-buses into a compressor and master', () => {
    const ctx = fakeContext();
    const factory = counted(ctx);
    resetAudioBusForTest(factory);
    const bus = getAudioBus();
    assert.equal(getAudioBus(), bus);
    for (const name of AUDIO_BUS_NAMES) assert.equal(busInput(name), bus.inputs[name]);
    assert.equal(factory.calls, 1);
    assert.deepEqual(AUDIO_BUS_NAMES, ['bgm', 'ambient', 'sfx', 'voice']);
    for (const name of AUDIO_BUS_NAMES) assert.deepEqual(bus.inputs[name].connected, [bus.compressor]);
    assert.deepEqual(bus.compressor.connected, [bus.master]);
    assert.deepEqual(bus.master.connected, [ctx.destination]);
    assert.equal(bus.compressor.threshold.value, -10);
    assert.equal(busInput('bogus'), bus.inputs.sfx);
});

test('gate: audio bus stays silent without WebAudio and players return null', () => {
    resetAudioBusForTest(() => null);
    assert.equal(getAudioBus(), null);
    assert.equal(busInput('sfx'), null);
    assert.equal(playSynthPartials([p('sine', 440, 440, 0, 0.1, 1)], { volume: 0.5 }), null);
    assert.equal(scheduleTypewriterAudio([{ text: '啊', timeMs: 0 }], { textType: 'dialogue', volume: 0.5, preset: 'blip' }), null);
});

test('gate: sfx and typewriter voices share the bus context and route to their sub-buses', async () => {
    const ctx = fakeContext();
    const factory = counted(ctx);
    resetAudioBusForTest(factory);
    const bus = getAudioBus();
    assert.ok(playSynthPartials([p('sine', 440, 440, 0, 0.1, 1)], { volume: 0.5 }));
    ctx.currentTime = 0;
    assert.ok(scheduleTypewriterAudio([{ text: '啊', timeMs: 100 }], { textType: 'dialogue', volume: 0.5, preset: 'blip' }));
    await flush();
    assert.equal(factory.calls, 1);
    const into = (target) => ctx.nodes.filter((n) => n.kind === 'gain' && n.connected.includes(target));
    assert.equal(into(bus.inputs.sfx).length, 1);
    assert.equal(into(bus.inputs.voice).length, 1);
    assert.equal(ctx.nodes.some((n) => n.kind !== 'gain' && n.connected.includes(ctx.destination)), false);
});

test('gate: scene audio uses the ambient sub-bus by default; master volume scales bgm once', async () => {
    // 上一条用例的提示音闪避约 250ms 后释放，等它结束再量 BGM 音量。
    await new Promise((resolve) => setTimeout(resolve, 400));
    const ctx = fakeContext();
    resetAudioBusForTest(counted(ctx));
    const bus = getAudioBus();
    const root = {};
    const audio = { volume: 0, play: () => Promise.resolve(), pause() {} };
    const timers = [];
    const opts = (master) => ({
        master, bgm: { enabled: true, volume: 0.8, tracks: [{ id: 'a', url: 'https://x/a.mp3', keywords: [] }] },
        ambient: { enabled: true, volume: 0.4 }, context: { location: '海边' },
        audioFactory: () => audio, schedule: (fn) => { timers.push(fn); return fn; }, clear() {},
    });
    // 环境音图层会不断重新排程，只跑够 BGM 淡入的步数。
    const drain = () => { for (let i = 0; i < 5000 && timers.length; i++) timers.shift()(); };
    applySceneAudio(root, opts({ volume: 0.5 }));
    drain();
    assert.equal(audioMasterVolume(), 0.5);
    const ambientMaster = ctx.nodes.find((n) => n.kind === 'gain' && n.connected.includes(bus.inputs.ambient));
    assert.ok(ambientMaster, 'scene audio master feeds the ambient sub-bus');
    assert.ok(Math.abs(audio.volume - 0.4) < 1e-9, `bgm 0.8 × master 0.5, got ${audio.volume}`);
    assert.deepEqual(bus.master.gain.history.at(-1).slice(0, 2), ['target', 0.5]);
    applySceneAudio(root, opts({ volume: 1 }));
    drain();
    assert.ok(Math.abs(audio.volume - 0.8) < 1e-9);
    cancelSceneAudio(root);
});

test('gate: audio master settings normalize and clamp', () => {
    assert.deepEqual(normalizeAudioMasterSettings(null), { volume: 1 });
    assert.deepEqual(normalizeAudioMasterSettings({ volume: 2 }), { volume: 1 });
    assert.deepEqual(normalizeAudioMasterSettings({ volume: '0.3' }), { volume: 0.3 });
    assert.deepEqual(normalizeAudioMasterSettings({ volume: '' }), { volume: 1 });
    assert.equal(setAudioMasterVolume(-1), 0);
});

test('gate: hidden page suspends the bus; visible resumes it even with no ambient layers', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const doc = fakeDocument();
    const previous = globalThis.document;
    globalThis.document = doc;
    try {
        const ctx = fakeContext();
        resetAudioBusForTest(counted(ctx));
        getAudioBus();
        doc.hidden = true;
        doc.fire('visibilitychange');
        assert.equal(ctx.suspends, 1, 'suspends at once: background JS may freeze before any timer fires');
        doc.hidden = false;
        doc.fire('visibilitychange');
        assert.equal(ctx.resumes, 1);
        assert.equal(ctx.state, 'running');
    } finally {
        globalThis.document = previous;
    }
});

test('gate: blocked resume arms a one-shot pointerdown retry', async () => {
    const doc = fakeDocument();
    const previous = globalThis.document;
    globalThis.document = doc;
    try {
        const ctx = fakeContext({ state: 'suspended', resumeTo: 'suspended' });
        resetAudioBusForTest(counted(ctx));
        await resumeAudioBus();
        const retries = () => doc.listeners.filter((l) => l.type === 'pointerdown');
        assert.equal(retries().length, 1);
        await resumeAudioBus();
        assert.equal(retries().length, 1, 'retry is not armed twice');
        retries()[0].fn();
        await flush();
        assert.equal(ctx.resumes, 3);
        assert.equal(retries().length, 0, 'gesture retry does not re-arm');
    } finally {
        globalThis.document = previous;
    }
});

test('gate:perf:closing-reader-parks-bus-after-fades-and-next-play-resumes', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const ctx = fakeContext();
    resetAudioBusForTest(counted(ctx));
    getAudioBus();
    assert.equal(parkAudioBus(), true);
    t.mock.timers.tick(399);
    assert.equal(ctx.suspends, 0, 'waits for module fades first');
    t.mock.timers.tick(1);
    assert.equal(ctx.suspends, 1);
    await resumeAudioBus();
    assert.equal(ctx.state, 'running');

    parkAudioBus();
    unparkAudioBus();
    t.mock.timers.tick(1000);
    assert.equal(ctx.suspends, 1, 'reopening the reader cancels the pending suspend');

    parkAudioBus();
    resumeAudioBus();
    t.mock.timers.tick(1000);
    assert.equal(ctx.suspends, 1, 'playing again cancels the pending suspend');
    resetAudioBusForTest();
    assert.equal(parkAudioBus(), false);
});

test('gate: scene space sends voice and sfx into one shared reverb and closing the reader dries it', () => {
    cancelSceneAudio(null);
    const ctx = fakeContext();
    ctx.createConvolver = () => { const n = { kind: 'convolver', buffer: null, connected: [], connect(t) { this.connected.push(t); return t; }, disconnect() {} }; ctx.nodes.push(n); return n; };
    resetAudioBusForTest(counted(ctx));
    assert.equal(setAudioBusSpace(null, 0), false, 'drying a missing bus is a no-op');
    const root = {};
    applySceneAudio(root, { ambient: { enabled: true }, context: { location: '车站大厅' } });
    const bus = getAudioBus();
    const convolver = ctx.nodes.find((n) => n.kind === 'convolver');
    assert.ok(convolver && convolver.buffer, 'hall impulse loaded');
    assert.ok(bus.inputs.voice.connected.includes(convolver));
    assert.ok(bus.inputs.sfx.connected.includes(convolver));
    assert.ok(!bus.inputs.ambient.connected.includes(convolver), 'ambient has its own tone chain');
    const send = convolver.connected[0];
    assert.ok(send.connected.includes(bus.compressor));
    assert.equal(send.gain.history.at(-1)[1], 0.12);
    applySceneAudio(root, { ambient: { enabled: true }, context: { location: '车站大厅' } });
    assert.equal(send.gain.history.filter((h) => h[0] === 'target').length, 1, 'same space is idempotent');
    applySceneAudio(root, { ambient: { enabled: false }, context: { location: '车站大厅' } });
    assert.equal(send.gain.history.at(-1)[1], 0, 'ambient off dries the voice');
    applySceneAudio(root, { ambient: { enabled: true }, context: { location: '森林', fxRanges: { dream: true } } });
    assert.equal(send.gain.history.at(-1)[1], 0.15, 'dream uses the long tail');
    cancelSceneAudio(root);
    assert.equal(send.gain.history.at(-1)[1], 0);
});
