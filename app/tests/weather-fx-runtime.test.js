import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LIGHTNING_DURATION_MS,
    SUNBURST_DURATION_MS,
    WEATHER_FX_DEFAULTS,
    applyWeatherFx,
    cancelWeatherFx,
    isIndoorLocation,
    normalizeWeatherFxSettings,
    resolveWeatherFxKind,
    resolveWeatherFxPlan,
    resolveWeatherFxScene,
    resolveWeatherFxTime,
} from '../src/visual/igs-ui/weather-fx-runtime.js';
import { startWeatherParticles } from '../src/visual/igs-ui/weather-fx-particles.js';
import { WEATHER_FX_STYLE_TEXT } from '../src/visual/igs-ui/weather-fx-style.js';
import { getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';

function makeLayer() {
    const classes = new Set();
    const attrs = new Map();
    return {
        isConnected: true,
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    };
}

function scheduler() {
    const queue = [];
    return {
        queue,
        schedule(fn, delay) { const timer = { fn, delay }; queue.push(timer); return timer; },
        clear(timer) { const i = queue.indexOf(timer); if (i >= 0) queue.splice(i, 1); },
        runNext() { const timer = queue.shift(); if (timer) timer.fn(); return timer; },
    };
}

function particleSpy() {
    const calls = [];
    const factory = (options) => {
        const handle = { options, stopped: false, stop() { handle.stopped = true; } };
        calls.push(handle);
        return handle;
    };
    return { calls, factory };
}

const on = (extra = {}) => ({ enabled: true, intensity: 'medium', ...extra });

test('gate: weather fx settings default to disabled with indoor and outdoor word lists', () => {
    const settings = normalizeWeatherFxSettings(null);
    assert.equal(settings.enabled, false);
    assert.equal(settings.intensity, WEATHER_FX_DEFAULTS.intensity);
    assert.deepEqual(normalizeWeatherFxSettings({ enabled: true, intensity: 'bad' }), {
        enabled: true,
        intensity: 'medium',
        indoorWords: Array.from(WEATHER_FX_DEFAULTS.indoorWords),
        outdoorWords: Array.from(WEATHER_FX_DEFAULTS.outdoorWords),
    });
    assert.equal(normalizeWeatherFxSettings({ enabled: 1 }).enabled, false);
    assert.deepEqual(normalizeWeatherFxSettings({ outdoorWords: [' 天台 ', '天台', '', 3] }).outdoorWords, ['天台', '3']);
});

test('gate: weather words map to kinds by priority, including new cloud/wind/sand kinds', () => {
    assert.equal(resolveWeatherFxKind('小雨'), 'rain');
    assert.equal(resolveWeatherFxKind('雷雨'), 'rain');
    assert.equal(resolveWeatherFxKind('大雪'), 'snow');
    assert.equal(resolveWeatherFxKind('雨夹雪'), 'snow');
    assert.equal(resolveWeatherFxKind('浓雾'), 'fog');
    assert.equal(resolveWeatherFxKind('雾霾'), 'fog');
    assert.equal(resolveWeatherFxKind('沙尘暴'), 'sand');
    assert.equal(resolveWeatherFxKind('大风'), 'wind');
    assert.equal(resolveWeatherFxKind('多云'), 'cloud');
    assert.equal(resolveWeatherFxKind('晴转多云'), 'cloud');
    assert.equal(resolveWeatherFxKind('晴天'), 'sun');
    assert.equal(resolveWeatherFxKind('sunny'), 'sun');
    assert.equal(resolveWeatherFxKind('sandstorm'), 'sand');
    assert.equal(resolveWeatherFxKind('Heavy Rain'), 'rain');
    assert.equal(resolveWeatherFxKind(''), '');
    assert.equal(resolveWeatherFxKind(null), '');
});

test('gate: weather plan derives level, thunder and wind modifiers from the weather word', () => {
    const plan = (weather) => resolveWeatherFxPlan({ weather, settings: on() });
    assert.equal(plan('毛毛雨').level, 'light');
    assert.equal(plan('中雨').level, 'medium');
    assert.equal(plan('倾盆大雨').level, 'heavy');
    assert.deepEqual([plan('雷阵雨').thunder, plan('雷阵雨').level], [true, 'medium']);
    assert.deepEqual([plan('雷暴').thunder, plan('雷暴').level], [true, 'heavy']);
    assert.equal(plan('小雨').thunder, false);
    assert.equal(plan('暴风雪').wind, true);
    assert.equal(plan('暴风雪').level, 'heavy');
    assert.equal(plan('大雪').wind, false);
    assert.equal(plan('大风').wind, false);
    assert.equal(plan('多云').kind, 'cloud');
    assert.equal(plan('未知天象'), null);
});

test('gate: time words and clock times resolve to five weather fx periods', () => {
    assert.equal(resolveWeatherFxTime('深夜'), 'midnight');
    assert.equal(resolveWeatherFxTime('午夜'), 'midnight');
    assert.equal(resolveWeatherFxTime('傍晚'), 'dusk');
    assert.equal(resolveWeatherFxTime('清晨'), 'dawn');
    assert.equal(resolveWeatherFxTime('晚上'), 'night');
    assert.equal(resolveWeatherFxTime('下午'), 'day');
    assert.equal(resolveWeatherFxTime('19:45'), 'night');
    assert.equal(resolveWeatherFxTime('6：30'), 'dawn');
    assert.equal(resolveWeatherFxTime('14点'), 'day');
    assert.equal(resolveWeatherFxTime('2:10'), 'midnight');
    assert.equal(resolveWeatherFxTime('某个时候'), '');
    assert.equal(resolveWeatherFxTime(''), '');
});

test('gate: indoor/outdoor uses the head word at the end of the location phrase', () => {
    assert.equal(resolveWeatherFxScene('B班教室'), 'indoor');
    assert.equal(resolveWeatherFxScene('走廊'), 'indoor');
    assert.equal(resolveWeatherFxScene('学校屋顶'), 'outdoor');
    assert.equal(resolveWeatherFxScene('便利店门口'), 'outdoor');
    assert.equal(resolveWeatherFxScene('图书馆门口'), 'outdoor');
    assert.equal(resolveWeatherFxScene('山间小屋'), 'indoor');
    assert.equal(resolveWeatherFxScene('公园里的咖啡馆'), 'indoor');
    assert.equal(resolveWeatherFxScene('咖啡馆露台'), 'outdoor');
    assert.equal(resolveWeatherFxScene('古城'), 'outdoor');
    assert.equal(resolveWeatherFxScene(''), 'outdoor');
    assert.equal(isIndoorLocation('机库', { indoorWords: ['机库'] }), true);
    assert.equal(isIndoorLocation('教室', { indoorWords: [], outdoorWords: [] }), false);
});

test('gate: outdoor rain starts particles on both layers; indoor rain keeps only window ambience', () => {
    const layer = makeLayer();
    const front = makeLayer();
    const spy = particleSpy();
    const outdoor = applyWeatherFx(layer, { settings: on({ intensity: 'strong' }), weather: '大雨', location: '街道', time: '夜晚', front, particles: spy.factory, reducedMotion: false });
    assert.equal(outdoor.active, true);
    assert.equal(outdoor.kind, 'rain');
    for (const el of [layer, front]) {
        assert.equal(el.getAttribute('data-igs-weather-fx'), 'rain');
        assert.equal(el.getAttribute('data-igs-weather-fx-scene'), 'outdoor');
        assert.equal(el.getAttribute('data-igs-weather-fx-level'), 'heavy');
        assert.equal(el.getAttribute('data-igs-weather-fx-time'), 'night');
        assert.equal(el.getAttribute('data-igs-weather-fx-intensity'), 'strong');
    }
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].options.back, layer);
    assert.equal(spy.calls[0].options.front, front);
    assert.equal(spy.calls[0].options.intensity, 'strong');

    const indoor = applyWeatherFx(layer, { settings: on(), weather: '大雨', location: '卧室', time: '夜晚', front, particles: spy.factory, reducedMotion: false });
    assert.equal(indoor.active, true);
    assert.equal(spy.calls[0].stopped, true);
    assert.equal(spy.calls.length, 1);
    assert.equal(layer.getAttribute('data-igs-weather-fx-scene'), 'indoor');
    assert.equal(front.getAttribute('data-igs-weather-fx-scene'), 'indoor');
    cancelWeatherFx(layer, front);
    assert.equal(layer.getAttribute('data-igs-weather-fx'), null);
    assert.equal(front.getAttribute('data-igs-weather-fx-scene'), null);
});

test('gate: identical weather plans are idempotent and any plan change rebuilds', () => {
    const layer = makeLayer();
    const front = makeLayer();
    const spy = particleSpy();
    const base = { settings: on(), weather: '小雪', location: '公园', time: '白天', front, particles: spy.factory, reducedMotion: false };
    applyWeatherFx(layer, base);
    const repeated = applyWeatherFx(layer, { ...base, weather: '小雪' });
    assert.equal(repeated.replayed, false);
    assert.equal(spy.calls.length, 1);
    applyWeatherFx(layer, { ...base, time: '黄昏' });
    assert.equal(spy.calls.length, 2);
    assert.equal(spy.calls[0].stopped, true);
    assert.equal(layer.getAttribute('data-igs-weather-fx-time'), 'dusk');
    applyWeatherFx(layer, { ...base, weather: '暴雪' });
    assert.equal(layer.getAttribute('data-igs-weather-fx-level'), 'heavy');
    assert.equal(layer.getAttribute('data-igs-weather-fx-time'), 'day');
    const cleared = applyWeatherFx(layer, { ...base, weather: '' });
    assert.equal(cleared.active, false);
    assert.equal(spy.calls.at(-1).stopped, true);
    assert.equal(layer.getAttribute('data-igs-weather-fx'), null);
});

test('gate: fog, cloud and sun never start particles; indoor wind is skipped entirely', () => {
    const spy = particleSpy();
    for (const weather of ['浓雾', '阴天', '晴']) {
        const layer = makeLayer();
        applyWeatherFx(layer, { settings: on(), weather, location: '河边', front: makeLayer(), particles: spy.factory, reducedMotion: false, schedule: () => 0, clear: () => {} });
        assert.equal(layer.getAttribute('data-igs-weather-fx') !== null, true);
    }
    assert.equal(spy.calls.length, 0);
    const layer = makeLayer();
    const indoorWind = applyWeatherFx(layer, { settings: on(), weather: '大风', location: '教室', front: makeLayer(), particles: spy.factory, reducedMotion: false });
    assert.equal(indoorWind.active, false);
    assert.equal(layer.getAttribute('data-igs-weather-fx'), null);
    applyWeatherFx(makeLayer(), { settings: on(), weather: '大风', location: '操场', front: makeLayer(), particles: spy.factory, reducedMotion: false });
    assert.equal(spy.calls.length, 1);
});

test('gate: thunder schedules repeating lightning on the front layer and stops on cancel', () => {
    const layer = makeLayer();
    const front = makeLayer();
    const clock = scheduler();
    const options = { settings: on(), weather: '雷雨', location: '卧室', front, particles: false, reducedMotion: false, schedule: clock.schedule, clear: clock.clear, random: () => 0 };
    applyWeatherFx(layer, options);
    assert.equal(front.getAttribute('data-igs-weather-fx-thunder'), '1');
    assert.equal(clock.queue.length, 1);
    assert.equal(clock.queue[0].delay, 1200);
    clock.runNext();
    assert.equal(front.classList.contains('igs-fx-lightning-active'), true);
    assert.equal(front.getAttribute('data-igs-weather-fx-flash'), 'a');
    assert.equal(clock.queue[0].delay, LIGHTNING_DURATION_MS);
    clock.runNext();
    assert.equal(front.classList.contains('igs-fx-lightning-active'), false);
    assert.equal(clock.queue.length, 1);
    assert.equal(clock.queue[0].delay, 7000);
    assert.equal(applyWeatherFx(layer, options).replayed, false);
    assert.equal(clock.queue.length, 1);
    cancelWeatherFx(layer, front);
    assert.equal(clock.queue.length, 0);
    assert.equal(front.getAttribute('data-igs-weather-fx-thunder'), null);
});

test('gate: lightning stops rescheduling once the reader layer leaves the document', () => {
    const layer = makeLayer();
    const front = makeLayer();
    const clock = scheduler();
    applyWeatherFx(layer, { settings: on(), weather: '雷暴', front, particles: false, reducedMotion: false, schedule: clock.schedule, clear: clock.clear, random: () => 0.5 });
    front.isConnected = false;
    clock.runNext();
    assert.equal(front.classList.contains('igs-fx-lightning-active'), false);
    assert.equal(clock.queue.length, 0);
});

test('gate: outdoor daytime sun plays one sunburst per plan, not per page turn; night and indoor sun do not', () => {
    const layer = makeLayer();
    const front = makeLayer();
    const clock = scheduler();
    const base = { settings: on(), weather: '晴', location: '海边', time: '上午', front, reducedMotion: false, schedule: clock.schedule, clear: clock.clear };
    const first = applyWeatherFx(layer, base);
    assert.equal(first.replayed, true);
    assert.equal(front.classList.contains('igs-fx-sunburst-active'), true);
    assert.equal(clock.queue[0].delay, SUNBURST_DURATION_MS + 80);
    clock.runNext();
    assert.equal(front.classList.contains('igs-fx-sunburst-active'), false);
    assert.equal(front.getAttribute('data-igs-weather-fx'), 'sun');
    assert.equal(applyWeatherFx(layer, base).replayed, false);
    assert.equal(front.classList.contains('igs-fx-sunburst-active'), false);
    assert.equal(applyWeatherFx(layer, { ...base, time: '夜晚' }).replayed, false);
    assert.equal(front.classList.contains('igs-fx-sunburst-active'), false);
    assert.equal(applyWeatherFx(layer, { ...base, location: '客厅' }).replayed, false);
    assert.equal(front.getAttribute('data-igs-weather-fx-scene'), 'indoor');
});

test('gate: disabled settings clear fx; reduced motion keeps static tint only', () => {
    const layer = makeLayer();
    const front = makeLayer();
    const clock = scheduler();
    const spy = particleSpy();
    const disabled = applyWeatherFx(layer, { settings: { enabled: false }, weather: '大雨', front, particles: spy.factory, schedule: clock.schedule, clear: clock.clear, reducedMotion: false });
    assert.equal(disabled.active, false);
    assert.equal(layer.getAttribute('data-igs-weather-fx'), null);
    const reduced = applyWeatherFx(layer, { settings: on(), weather: '雷暴', front, particles: spy.factory, schedule: clock.schedule, clear: clock.clear, reducedMotion: true });
    assert.equal(reduced.active, true);
    assert.equal(layer.getAttribute('data-igs-weather-fx'), 'rain');
    assert.equal(layer.getAttribute('data-igs-weather-fx-motion'), 'off');
    assert.equal(spy.calls.length, 0);
    assert.equal(clock.queue.length, 0);
});

function fakeCanvasEnv({ width = 1280, height = 720 } = {}) {
    const frames = [];
    const ops = { stroke: 0, fill: 0, clear: 0 };
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'stroke' || key === 'fill') return () => { ops[key] += 1; };
            if (key === 'clearRect') return () => { ops.clear += 1; };
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
    const makeParticleLayer = () => {
        const layer = {
            ownerDocument: doc, isConnected: true, clientWidth: width, clientHeight: height, children: [],
            appendChild(child) { child.parentNode = layer; layer.children.push(child); },
            removeChild(child) { layer.children = layer.children.filter((item) => item !== child); child.parentNode = null; },
        };
        return layer;
    };
    const tick = (now) => { const fn = frames.shift(); if (fn) fn(now); return Boolean(fn); };
    return { frames, ops, tick, back: makeParticleLayer(), front: makeParticleLayer() };
}

test('gate: particle engine draws batched frames at CSS pixel size and throttles to 30fps', () => {
    for (const kind of ['rain', 'snow', 'wind', 'sand']) {
        const env = fakeCanvasEnv();
        const plan = { kind, level: 'heavy', scene: 'outdoor', time: 'night', thunder: false, wind: true, particles: true };
        const controller = startWeatherParticles({ back: env.back, front: env.front, plan, intensity: 'strong', random: () => 0.5 });
        assert.ok(controller, kind);
        assert.equal(env.back.children.length, 1);
        assert.equal(env.front.children.length, 1);
        assert.equal(env.back.children[0].className, 'igs-fx-canvas');
        assert.equal(env.back.children[0].width, 1280);
        env.tick(1000);
        env.tick(1016);
        assert.equal(env.ops.clear, 2, `${kind} draws first frame on both surfaces and skips the 16ms frame`);
        env.tick(1034);
        assert.equal(env.ops.clear, 4);
        assert.ok(env.ops.stroke + env.ops.fill > 0);
        controller.stop();
        assert.equal(env.back.children.length, 0);
        assert.equal(env.front.children.length, 0);
        assert.equal(env.frames.length, 0);
    }
});

test('gate: particle engine exits when the layer is detached and refuses non-particle kinds', () => {
    const env = fakeCanvasEnv();
    const plan = { kind: 'rain', level: 'medium', scene: 'outdoor', time: '', thunder: false, wind: false, particles: true };
    startWeatherParticles({ back: env.back, front: env.front, plan });
    env.back.isConnected = false;
    env.tick(0);
    assert.equal(env.frames.length, 0);
    assert.equal(env.back.children.length, 0);
    assert.equal(startWeatherParticles({ back: env.back, front: env.front, plan: { ...plan, kind: 'fog' } }), null);
    assert.equal(startWeatherParticles({ back: {}, plan }), null);
});

test('gate: weather style is a single consolidated block wired into the reader stylesheet', () => {
    const ORIGINAL_READER_STYLE_TEXT = getOriginalReaderStyleText();
    assert.ok(ORIGINAL_READER_STYLE_TEXT.includes(WEATHER_FX_STYLE_TEXT.trim()));
    assert.equal(ORIGINAL_READER_STYLE_TEXT.includes('igs-effect-back'), false);
    assert.equal((ORIGINAL_READER_STYLE_TEXT.match(/@keyframes igs-fx-sunburst/g) || []).length, 1);
    for (const scene of ['indoor', 'outdoor']) assert.match(WEATHER_FX_STYLE_TEXT, new RegExp(`data-igs-weather-fx-scene="${scene}"`));
    for (const time of ['dawn', 'dusk', 'night', 'midnight']) assert.match(WEATHER_FX_STYLE_TEXT, new RegExp(`data-igs-weather-fx-time="${time}"`));
    assert.match(WEATHER_FX_STYLE_TEXT, /data-igs-weather-fx-motion="off"/);
});
