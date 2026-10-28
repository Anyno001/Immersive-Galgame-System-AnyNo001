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
import { playChatSfx, playSynthPartials, createSynthPartial as p } from '../src/visual/igs-ui/chat-sfx.js';
import { scheduleTypewriterAudio } from '../src/visual/igs-ui/typewriter-audio.js';
import { applySceneAudio, cancelSceneAudio, canRouteBgm } from '../src/visual/igs-ui/scene-audio.js';
import { playVoiceBark, stopVoiceBark } from '../src/visual/igs-ui/voice-bark.js';

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

test('gate: chat bubble sound retries once after autoplay unlock and cancelled cues stay silent', async () => {
    const doc = fakeDocument();
    const previous = globalThis.document;
    globalThis.document = doc;
    try {
        const ctx = fakeContext({ state: 'suspended', resumeTo: 'suspended' });
        resetAudioBusForTest(counted(ctx));
        getAudioBus();
        // 总线创建时已挂上「第一次手势解锁」的监听，重试监听要在它之外另数。
        const base = doc.listeners.filter((l) => l.type === 'pointerdown').length;
        const cue = playChatSfx('receive', { volume: 0.6 });
        assert.ok(cue);
        await flush();
        assert.equal(ctx.nodes.filter((node) => node.kind === 'osc').length, 0, 'blocked context cannot play the first bubble');
        assert.equal(doc.listeners.filter((l) => l.type === 'pointerdown').length, base + 1);
        ctx.resume = function () { this.resumes++; this.state = 'running'; return Promise.resolve(); };
        doc.fire('pointerdown');
        await flush();
        assert.ok(ctx.nodes.some((node) => node.kind === 'osc'), 'unlock plays the bubble lost on first render');
        assert.equal(doc.listeners.filter((l) => l.type === 'pointerdown').length, 0);
        cue.stop();

        const second = fakeContext({ state: 'suspended', resumeTo: 'suspended' });
        resetAudioBusForTest(counted(second));
        const cancelled = playChatSfx('send', { volume: 0.6 });
        await flush();
        cancelled.stop();
        second.resume = function () { this.resumes++; this.state = 'running'; return Promise.resolve(); };
        doc.fire('pointerdown');
        await flush();
        assert.equal(second.nodes.filter((node) => node.kind === 'osc').length, 0, 'cancelled page must not emit a late cue');
    } finally {
        resetAudioBusForTest();
        globalThis.document = previous;
    }
});

test('gate: pending audio resume unlocks chat bubble once without a late cancelled cue', async () => {
    const doc = fakeDocument();
    const previous = globalThis.document;
    globalThis.document = doc;
    try {
        const ctx = fakeContext({ state: 'suspended' });
        let settle;
        ctx.resume = function () {
            this.resumes++;
            if (this.resumes === 1) return new Promise((resolve) => { settle = resolve; });
            this.state = 'running';
            return Promise.resolve();
        };
        resetAudioBusForTest(counted(ctx));
        getAudioBus();
        const base = doc.listeners.filter((l) => l.type === 'pointerdown').length;
        const cue = playChatSfx('receive');
        assert.ok(cue);
        assert.equal(doc.listeners.filter((l) => l.type === 'pointerdown').length, base + 1, 'arm while the initial resume is pending');
        doc.fire('pointerdown');
        await flush();
        assert.equal(ctx.nodes.filter((n) => n.kind === 'osc').length, 4, 'one receive cue is scheduled');
        settle();
        await flush();
        assert.equal(ctx.nodes.filter((n) => n.kind === 'osc').length, 4, 'late initial resume does not replay the cue');
        cue.stop();

        const blocked = fakeContext({ state: 'suspended' });
        blocked.resume = () => new Promise(() => {});
        resetAudioBusForTest(counted(blocked));
        getAudioBus();
        const blockedBase = doc.listeners.filter((l) => l.type === 'pointerdown').length;
        const cancelled = playChatSfx('send');
        assert.equal(doc.listeners.filter((l) => l.type === 'pointerdown').length, blockedBase + 1);
        cancelled.stop();
        assert.equal(doc.listeners.filter((l) => l.type === 'pointerdown').length, blockedBase, 'leaving the page removes the retry listener');
    } finally {
        resetAudioBusForTest();
        globalThis.document = previous;
    }
});

function addNode(ctx, kind, extra) {
    const n = { kind, context: ctx, connected: [], connect(target) { this.connected.push(target); return target; }, disconnect() { this.gone = true; }, ...extra };
    ctx.nodes.push(n);
    return n;
}

test('默认音频环境按播放场景开大缓冲，不支持参数时退回无参构造', () => {
    const previous = globalThis.AudioContext;
    const seen = [];
    try {
        globalThis.AudioContext = function Fake(options) { seen.push(options); return fakeContext(); };
        resetAudioBusForTest();
        assert.ok(getAudioBus());
        assert.deepEqual(seen, [{ latencyHint: 'playback' }]);

        seen.length = 0;
        globalThis.AudioContext = function Old(options) {
            seen.push(options);
            if (options) throw new TypeError('no options');
            return fakeContext();
        };
        resetAudioBusForTest();
        assert.ok(getAudioBus(), '旧浏览器不认 latencyHint 也能建出总线');
        assert.deepEqual(seen, [{ latencyHint: 'playback' }, undefined]);
    } finally {
        globalThis.AudioContext = previous;
        resetAudioBusForTest();
    }
});

test('朗读限幅只在音量超过 100% 时接入', async () => {
    const { buildBarkChain } = await import('../src/visual/igs-ui/voice-bark.js');
    const compressors = (volume) => {
        const ctx = fakeContext();
        buildBarkChain(ctx, ctx.destination, { volume, limit: true, gainCap: 2 }, []);
        return ctx.nodes.filter((node) => node.kind === 'compressor');
    };
    assert.equal(compressors(1).length, 0, '100% 不压，免得每个字都被压变形');
    assert.equal(compressors(0.6).length, 0);
    const loud = compressors(1.6);
    assert.equal(loud.length, 1, '放大时末端限幅防削波');
    assert.equal(loud[0].attack.value, 0.003);
});
