import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BURST_TYPES,
    FIREWORK_PALETTES,
    createBurst,
    planLanterns,
    planShow,
    resolvePetalKind,
    startFireworks,
    startLanterns,
    startPetals,
    stepSparks,
} from '../src/visual/igs-ui/fx-daily-particles.js';

function seeded(seed = 1) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function recordingContext() {
    const calls = [];
    const props = [];
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => { calls.push(key); return undefined; };
        },
        set(target, key, value) { target[key] = value; props.push([key, value]); return true; },
    });
    return { ctx, calls, props, count: (name) => calls.filter((c) => c === name).length };
}

function fakeEnv({ width = 800, height = 600, hidden = false } = {}) {
    const recorder = recordingContext();
    const frames = [];
    let time = 0;
    const listeners = new Map();
    const doc = {
        hidden,
        createElement(tag) {
            return { tag, width: 0, height: 0, className: '', style: {}, parentNode: null, setAttribute() {}, getContext: () => recorder.ctx };
        },
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
    };
    const layer = {
        ownerDocument: doc, isConnected: true, clientWidth: width, clientHeight: height, children: [],
        appendChild(child) { child.parentNode = layer; layer.children.push(child); },
        removeChild(child) { layer.children = layer.children.filter((item) => item !== child); child.parentNode = null; },
    };
    const raf = (fn) => { frames.push(fn); return frames.length; };
    const cancelRaf = () => { frames.length = 0; };
    const now = () => time;
    const tick = (step = 34) => {
        time += step;
        const fn = frames.shift();
        if (fn) fn(time);
        return Boolean(fn);
    };
    const runAll = (limit = 2000, step = 34) => {
        let n = 0;
        while (frames.length && n < limit) { tick(step); n += 1; }
        return n;
    };
    return { doc, layer, frames, recorder, listeners, raf, cancelRaf, now, tick, runAll };
}

test('gate: petal kind resolves from location/time/season text and yields to rain or snow', () => {
    assert.equal(resolvePetalKind({ location: '樱花大道' }), 'sakura');
    assert.equal(resolvePetalKind({ season: '春' }), 'sakura');
    assert.equal(resolvePetalKind({ location: '河堤', time: '花见之日' }), 'sakura');
    assert.equal(resolvePetalKind({ season: 'Spring' }), 'sakura');
    assert.equal(resolvePetalKind({ location: '枫林小径' }), 'leaves');
    assert.equal(resolvePetalKind({ time: '深秋的傍晚' }), 'leaves');
    assert.equal(resolvePetalKind({ location: '红叶谷' }), 'leaves');
    assert.equal(resolvePetalKind({ season: 'autumn' }), 'leaves');
    assert.equal(resolvePetalKind({ location: '樱花大道', weather: '小雨' }), '');
    assert.equal(resolvePetalKind({ season: '秋', weather: '大雪' }), '');
    assert.equal(resolvePetalKind({ location: '河堤', weather: '樱吹雪' }), 'sakura');
    assert.equal(resolvePetalKind({ location: '青春公寓' }), '');
    assert.equal(resolvePetalKind({ location: '秋叶原' }), '');
    assert.equal(resolvePetalKind({ location: '教室', time: '上午', weather: '晴' }), '');
    assert.equal(resolvePetalKind({}), '');
    assert.equal(resolvePetalKind(), '');
});

test('gate: bursts are deterministic under seeded random with 60-120 sparks and known palettes/types', () => {
    const a = createBurst({ x: 100, y: 80, random: seeded(7) });
    const b = createBurst({ x: 100, y: 80, random: seeded(7) });
    assert.deepEqual(a, b);
    const seen = new Set();
    for (let seed = 1; seed < 60; seed += 1) {
        const burst = createBurst({ x: 0, y: 0, random: seeded(seed) });
        assert.ok(burst.sparks.length >= 60 && burst.sparks.length <= 120, `seed ${seed}: ${burst.sparks.length}`);
        assert.ok(BURST_TYPES.includes(burst.type));
        assert.ok(FIREWORK_PALETTES[burst.palette]);
        assert.equal(burst.color, `rgb(${FIREWORK_PALETTES[burst.palette][0]})`);
        for (const spark of burst.sparks) assert.ok(spark.colorIndex >= 0 && spark.colorIndex < burst.colors.length);
        seen.add(burst.type);
    }
    assert.deepEqual([...seen].sort(), ['peony', 'ring', 'willow']);
    const ring = createBurst({ type: 'ring', palette: 'cyan', count: 64, random: seeded(3) });
    assert.equal(ring.sparks.length, 64);
    assert.equal(ring.palette, 'cyan');
    const willow = createBurst({ type: 'willow', random: seeded(3) });
    const peony = createBurst({ type: 'peony', random: seeded(3) });
    assert.ok(willow.sparks[0].trailMax > peony.sparks[0].trailMax, 'willow keeps longer drooping trails');
    assert.ok(willow.sparks[0].life > peony.sparks[0].life);
});

test('gate: stepSparks applies gravity, drag and fade, and drops dead sparks in place', () => {
    const spark = (extra) => ({ x: 0, y: 0, vx: 100, vy: 0, age: 0, life: 1, drag: 1.5, gravity: 1, alpha: 1, trail: [], trailMax: 3, colorIndex: 0, ...extra });
    const sparks = [spark(), spark({ age: 0.95 })];
    const out = stepSparks(sparks, 0.1, { gravity: 100 });
    assert.equal(out, sparks);
    assert.equal(sparks.length, 1);
    const [s] = sparks;
    assert.ok(s.vx < 100 && s.vx > 80, `drag slows vx: ${s.vx}`);
    assert.ok(s.vy > 0, 'gravity pulls down');
    assert.ok(s.x > 0 && s.y > 0);
    assert.equal(s.trail.length, 2);
    for (let i = 0; i < 6; i += 1) stepSparks(sparks, 0.1, { gravity: 100 });
    assert.ok(s.alpha < 0.6, `fades: ${s.alpha}`);
    assert.equal(s.trail.length, 6, 'trail is capped');
    stepSparks(sparks, 0.5);
    assert.equal(sparks.length, 0);
});

test('gate: show plan spreads launches within the duration and targets the upper sky', () => {
    const plan = planShow({ count: 5, width: 800, height: 600, random: seeded(2) });
    assert.equal(plan.length, 5);
    for (let i = 1; i < plan.length; i += 1) assert.ok(plan[i].at >= plan[i - 1].at);
    assert.ok(plan.at(-1).at < 3.5);
    for (const shot of plan) assert.ok(shot.ty < 600 * 0.45 && shot.tx > 0 && shot.tx < 800);
});

test('gate: fireworks run to completion at 30fps, fire callbacks count times, remove canvas and resolve done', async () => {
    const env = fakeEnv();
    const launches = [];
    const bursts = [];
    const handle = startFireworks(env.layer, {
        count: 4, random: seeded(11), raf: env.raf, cancelRaf: env.cancelRaf, now: env.now, reducedMotion: false,
        onLaunch: (index) => launches.push(index),
        onBurst: (index, info) => bursts.push({ index, ...info }),
    });
    assert.equal(env.layer.children.length, 1);
    const canvas = env.layer.children[0];
    assert.equal(canvas.tag, 'canvas');
    assert.equal(canvas.style.position, 'absolute');
    assert.equal(canvas.style.pointerEvents, 'none');
    assert.equal(canvas.width, 800);
    env.tick(34);
    env.tick(16);
    assert.equal(env.recorder.count('clearRect'), 1, '16ms frame is skipped');
    const frames = env.runAll();
    assert.ok(frames > 100 && frames < 2000, `frames: ${frames}`);
    assert.deepEqual(launches, [0, 1, 2, 3]);
    assert.deepEqual(bursts.map((b) => b.index).sort(), [0, 1, 2, 3]);
    for (const b of bursts) {
        assert.match(b.color, /^rgb\(\d+,\d+,\d+\)$/);
        assert.ok(b.x >= 0 && b.x <= 800 && b.y >= 0 && b.y <= 600);
    }
    assert.ok(env.recorder.props.some(([key, value]) => key === 'globalCompositeOperation' && value === 'lighter'));
    assert.ok(env.recorder.count('stroke') > 0);
    assert.equal(env.layer.children.length, 0);
    assert.equal(env.frames.length, 0);
    assert.deepEqual(await handle.done, { completed: true });
});

test('gate: fireworks honor devicePixelRatio capped at 2', () => {
    const env = fakeEnv();
    env.doc.defaultView = { devicePixelRatio: 3 };
    const handle = startFireworks(env.layer, { raf: env.raf, cancelRaf: env.cancelRaf, now: env.now, reducedMotion: false, random: seeded(1) });
    assert.equal(env.layer.children[0].width, 1600);
    handle.stop();
});

test('gate: fireworks stop early, and self-stop when the layer is detached', async () => {
    const env = fakeEnv();
    const launches = [];
    const handle = startFireworks(env.layer, { raf: env.raf, cancelRaf: env.cancelRaf, now: env.now, reducedMotion: false, random: seeded(5), onLaunch: (i) => launches.push(i) });
    for (let i = 0; i < 20; i += 1) env.tick();
    handle.stop();
    handle.stop();
    assert.equal(env.layer.children.length, 0);
    assert.equal(env.frames.length, 0);
    assert.deepEqual(await handle.done, { completed: false });
    assert.ok(launches.length < 5);

    const detached = fakeEnv();
    const second = startFireworks(detached.layer, { raf: detached.raf, cancelRaf: detached.cancelRaf, now: detached.now, reducedMotion: false });
    detached.layer.isConnected = false;
    detached.tick();
    assert.equal(detached.layer.children.length, 0);
    assert.deepEqual(await second.done, { completed: false });

    const zero = fakeEnv({ width: 0, height: 0 });
    assert.deepEqual(await startFireworks(zero.layer, { raf: zero.raf, now: zero.now, reducedMotion: false }).done, { completed: false });
    assert.equal(zero.layer.children.length, 0);
    assert.deepEqual(await startFireworks(null).done, { completed: false });
});

test('gate: reduced motion fireworks draw one static bloom, fade quickly and skip callbacks', async () => {
    const env = fakeEnv();
    const calls = [];
    const handle = startFireworks(env.layer, {
        count: 5, reducedMotion: true, random: seeded(9), raf: env.raf, cancelRaf: env.cancelRaf, now: env.now,
        onLaunch: () => calls.push('launch'), onBurst: () => calls.push('burst'),
    });
    assert.equal(env.recorder.count('clearRect'), 1);
    assert.ok(env.recorder.count('stroke') > 0);
    const canvas = env.layer.children[0];
    const strokes = env.recorder.count('stroke');
    env.tick(500);
    assert.ok(Number(canvas.style.opacity) < 1);
    const frames = env.runAll();
    assert.ok(frames < 40, `fades within ~1s: ${frames}`);
    assert.equal(env.recorder.count('stroke'), strokes, 'no redraw while fading');
    assert.equal(env.layer.children.length, 0);
    assert.deepEqual(calls, []);
    assert.deepEqual(await handle.done, { completed: true });
});

test('gate: lanterns rise slowly from the lower sky, launch once each, finish within the show and clean up', async () => {
    const plan = planLanterns({ count: 7, width: 800, height: 600, random: seeded(4), duration: 5600 });
    assert.equal(plan.length, 7);
    for (const l of plan) {
        assert.ok(l.y0 >= 0.6 * 600 && l.y0 - l.rise > 0, 'starts low, ends inside the sky');
        assert.ok(l.x0 > 0 && l.x0 < 800);
        assert.ok(l.at + l.life <= 6.2, `ends near the fireworks duration: ${l.at + l.life}`);
    }
    const env = fakeEnv();
    const launches = [];
    const handle = startLanterns(env.layer, { count: 5, random: seeded(8), raf: env.raf, cancelRaf: env.cancelRaf, now: env.now, reducedMotion: false, onLaunch: (i) => launches.push(i) });
    assert.equal(env.layer.children[0].className, 'igs-fx-lanterns-canvas');
    const frames = env.runAll();
    assert.ok(frames > 100 && frames < 260, `frames: ${frames}`);
    assert.deepEqual(launches, [0, 1, 2, 3, 4]);
    assert.ok(env.recorder.count('fill') > 0);
    assert.ok(env.recorder.props.some(([key, value]) => key === 'globalCompositeOperation' && value === 'lighter'));
    assert.equal(env.layer.children.length, 0);
    assert.deepEqual(await handle.done, { completed: true });

    const early = fakeEnv();
    const stopped = startLanterns(early.layer, { raf: early.raf, cancelRaf: early.cancelRaf, now: early.now, reducedMotion: false, random: seeded(2) });
    for (let i = 0; i < 10; i += 1) early.tick();
    stopped.stop();
    assert.equal(early.layer.children.length, 0);
    assert.deepEqual(await stopped.done, { completed: false });
    assert.deepEqual(await startLanterns(null).done, { completed: false });
});

test('gate: reduced motion lanterns draw a static frame, fade quickly and skip callbacks', async () => {
    const env = fakeEnv();
    const calls = [];
    const handle = startLanterns(env.layer, { count: 7, reducedMotion: true, random: seeded(3), raf: env.raf, cancelRaf: env.cancelRaf, now: env.now, onLaunch: () => calls.push('launch') });
    const fills = env.recorder.count('fill');
    assert.ok(fills > 0);
    assert.ok(env.runAll() < 40);
    assert.equal(env.recorder.count('fill'), fills, 'no redraw while fading');
    assert.deepEqual(calls, []);
    assert.equal(env.layer.children.length, 0);
    assert.deepEqual(await handle.done, { completed: true });
});

test('gate: petals start, draw batched fills at 30fps, switch kind and stop cleanly', () => {
    const env = fakeEnv();
    const handle = startPetals(env.layer, { raf: env.raf, cancelRaf: env.cancelRaf, now: env.now, random: seeded(4), reducedMotion: false });
    assert.equal(env.layer.children.length, 1);
    assert.equal(env.layer.children[0].style.pointerEvents, 'none');
    assert.ok(env.listeners.has('visibilitychange'));
    env.tick(34);
    env.tick(16);
    assert.equal(env.recorder.count('clearRect'), 1);
    const fills = env.recorder.count('fill');
    assert.ok(fills > 0 && fills <= 6, `sakura fills batched by color/side: ${fills}`);
    assert.ok(env.recorder.count('bezierCurveTo') >= 18 * 2);
    for (let i = 0; i < 60; i += 1) env.tick();
    handle.setKind('leaves');
    env.recorder.calls.length = 0;
    env.tick();
    assert.ok(env.recorder.count('fill') > 0 && env.recorder.count('fill') <= 8);
    assert.equal(env.recorder.count('stroke'), 1, 'leaf midribs in one stroke');
    handle.setKind('');
    env.runAll(5);
    assert.equal(env.frames.length, 0, 'idle without a kind');
    handle.setKind('sakura');
    assert.equal(env.frames.length, 1);
    handle.stop();
    assert.equal(env.layer.children.length, 0);
    assert.equal(env.frames.length, 0);
    assert.equal(env.listeners.has('visibilitychange'), false);
});

test('gate: petals pause while the document is hidden and exit when detached', () => {
    const env = fakeEnv();
    startPetals(env.layer, { raf: env.raf, cancelRaf: env.cancelRaf, now: env.now, random: seeded(4), reducedMotion: false, density: 'medium', wind: 'left' });
    env.tick();
    env.doc.hidden = true;
    env.tick();
    assert.equal(env.frames.length, 0);
    env.doc.hidden = false;
    env.listeners.get('visibilitychange')();
    assert.equal(env.frames.length, 1);
    env.layer.isConnected = false;
    env.tick();
    assert.equal(env.frames.length, 0);
    assert.equal(env.layer.children.length, 0);
});

test('gate: reduced motion petals are a no-op handle', () => {
    const env = fakeEnv();
    const handle = startPetals(env.layer, { raf: env.raf, reducedMotion: true });
    assert.equal(env.layer.children.length, 0);
    assert.equal(env.frames.length, 0);
    handle.setKind('leaves');
    handle.stop();
    assert.equal(env.frames.length, 0);
});
