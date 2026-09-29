import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AMBIENT_KINDS,
    AMBIENT_LABELS,
    BGM_FADE_MS,
    DUCK_RATIO,
    applySceneAudio,
    cancelSceneAudio,
    duckSceneAudio,
    normalizeAmbientSoundSettings,
    normalizeBgmSettings,
    pickBgmTrack,
    resolveAmbientPlan,
    resolveAmbientSpace,
    resolveAmbientTone,
} from '../src/visual/igs-ui/scene-audio.js';

function scheduler() {
    const queue = [];
    return {
        queue,
        schedule(fn, delay) { const timer = { fn, delay }; queue.push(timer); return timer; },
        clear(timer) { const i = queue.indexOf(timer); if (i >= 0) queue.splice(i, 1); },
        runAll(limit = 5000) {
            let count = 0;
            while (queue.length && count < limit) { queue.shift().fn(); count++; }
            return count;
        },
    };
}

function audioFactory({ reject = false } = {}) {
    const created = [];
    const factory = () => {
        const audio = {
            src: '', loop: false, volume: 1, playing: false, plays: 0, pauses: 0,
            play() {
                this.plays++;
                if (reject && this.plays === 1) return Promise.reject(new Error('NotAllowedError'));
                this.playing = true;
                return Promise.resolve();
            },
            pause() { this.playing = false; this.pauses++; },
        };
        created.push(audio);
        return audio;
    };
    return { created, factory };
}

function fakeRoot() {
    const listeners = [];
    const doc = {
        listeners,
        addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
        removeEventListener(type, fn, capture) {
            const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
            if (i >= 0) listeners.splice(i, 1);
        },
    };
    return { ownerDocument: doc };
}

function param(value = 0) {
    const calls = [];
    const history = [];
    const record = (name) => (...args) => { calls.push(name); history.push([name, ...args]); return undefined; };
    return {
        value, calls, history,
        setValueAtTime: record('set'), linearRampToValueAtTime: record('linear'),
        exponentialRampToValueAtTime: record('exp'), setTargetAtTime: record('target'),
        cancelScheduledValues: record('cancel'),
    };
}

function fakeContext() {
    const nodes = [];
    const node = (extra) => {
        const n = { connected: [], started: false, stopped: false, disconnected: false,
            connect(target) { this.connected.push(target); return target; },
            disconnect() { this.disconnected = true; }, ...extra };
        nodes.push(n);
        return n;
    };
    const source = (extra) => node({ start() { this.started = true; }, stop() { this.stopped = true; }, ...extra });
    return {
        nodes, state: 'running', currentTime: 0, sampleRate: 8000, destination: {},
        suspends: 0,
        resume() { return Promise.resolve(); },
        suspend() { this.suspends++; return Promise.resolve(); },
        createGain: () => node({ gain: param(1) }),
        createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1) }),
        createOscillator: () => source({ type: 'sine', frequency: param(440) }),
        createBufferSource: () => source({ buffer: null, loop: false }),
        createBuffer: (channels, length) => { const data = new Float32Array(length); return { getChannelData: () => data }; },
    };
}

const TRACKS = [
    { id: 'calm', name: '日常', url: 'https://x/calm.mp3', keywords: [] },
    { id: 'sea', name: '海边', url: 'https://x/sea.mp3', keywords: ['海', '沙滩'] },
    { id: 'sad', name: '悲伤', url: 'https://x/sad.mp3', keywords: ['悲伤', '雨'] },
];

function bgmOptions(extra = {}) {
    return { bgm: { enabled: true, volume: 0.6, tracks: TRACKS }, ...extra };
}

test('gate: scene audio exports ambient kinds with Chinese labels', () => {
    assert.deepEqual(AMBIENT_KINDS, ['birds', 'rain', 'wind', 'insects', 'waves', 'crowd', 'thunder', 'stream', 'fire', 'snow']);
    assert.deepEqual(AMBIENT_KINDS.map((kind) => AMBIENT_LABELS[kind]), ['鸟鸣', '雨声', '风声', '虫鸣', '海浪', '人声', '雷声', '溪流', '篝火', '雪夜']);
});

test('gate: bgm settings normalize defaults, clamp volume and drop invalid tracks', () => {
    assert.deepEqual(normalizeBgmSettings(null), { enabled: false, volume: 0.5, tracks: [] });
    assert.deepEqual(normalizeBgmSettings('x'), { enabled: false, volume: 0.5, tracks: [] });
    assert.equal(normalizeBgmSettings({ volume: 3 }).volume, 1);
    assert.equal(normalizeBgmSettings({ volume: -1 }).volume, 0);
    const settings = normalizeBgmSettings({
        enabled: true,
        tracks: [
            { url: ' https://a/b.mp3 ', keywords: [' 海 ', '海', '', 'x'.repeat(21), 3] },
            { url: 'javascript:alert(1)' },
            { url: 'ftp://a/b.mp3' },
            { url: `https://a/${'x'.repeat(2048)}` },
            { id: 'mine', name: 'n'.repeat(60), url: 'data:audio/mp3;base64,AAA' },
            { id: 'mine', url: 'blob:https://a/1' },
            null,
        ],
    });
    assert.equal(settings.enabled, true);
    assert.equal(settings.tracks.length, 3);
    assert.deepEqual(settings.tracks[0], { id: 't1', name: '曲目1', url: 'https://a/b.mp3', keywords: ['海', '3'] });
    assert.equal(settings.tracks[1].id, 'mine');
    assert.equal(settings.tracks[1].name.length, 40);
    assert.notEqual(settings.tracks[2].id, 'mine');
    assert.equal(settings.tracks[2].name, '曲目3');
    const many = normalizeBgmSettings({ tracks: Array.from({ length: 60 }, (_, i) => ({ url: `https://a/${i}.mp3`, keywords: Array.from({ length: 30 }, (__, k) => `k${k}`) })) });
    assert.equal(many.tracks.length, 50);
    assert.equal(many.tracks[0].keywords.length, 20);
    assert.equal(new Set(many.tracks.map((t) => t.id)).size, 50);
});

test('gate: ambient settings default on per kind and honor explicit false', () => {
    assert.deepEqual(normalizeAmbientSoundSettings(undefined), {
        enabled: false, volume: 0.4, birds: true, rain: true, wind: true, insects: true, waves: true, crowd: true,
        thunder: true, stream: true, fire: true, snow: true,
    });
    // 旧存档没有新增音色字段，按默认开启处理。
    const legacy = normalizeAmbientSoundSettings({ enabled: true, birds: true, rain: false });
    assert.equal(legacy.thunder, true);
    assert.equal(legacy.snow, true);
    const settings = normalizeAmbientSoundSettings({ enabled: true, volume: 9, rain: false, birds: 0 });
    assert.equal(settings.enabled, true);
    assert.equal(settings.volume, 1);
    assert.equal(settings.rain, false);
    assert.equal(settings.birds, true);
});

test('gate: bgm picks best keyword score with location weighted and falls back to default', () => {
    assert.equal(pickBgmTrack(TRACKS, { location: '海边沙滩' }).id, 'sea');
    assert.equal(pickBgmTrack(TRACKS, { location: '街道', weather: '大雨', emotion: '悲伤' }).id, 'sad');
    assert.equal(pickBgmTrack(TRACKS, { location: '海边', weather: '雨' }).id, 'sea');
    assert.equal(pickBgmTrack(TRACKS, { location: '教室' }).id, 'calm');
    const tied = [{ id: 'a', url: 'https://a', keywords: ['夜'] }, { id: 'b', url: 'https://b', keywords: ['夜'] }];
    assert.equal(pickBgmTrack(tied, { time: '夜晚' }).id, 'a');
    assert.equal(pickBgmTrack(tied, { location: '教室' }), null);
    assert.equal(pickBgmTrack([], {}), null);
    assert.equal(pickBgmTrack([{ id: 'n', url: 'https://n', keywords: ['night'] }], { time: '清晨' }), null);
    assert.equal(pickBgmTrack([{ id: 'n', url: 'https://n', keywords: ['night'] }], { time: '夜晚' }).id, 'n');
});

const ON = { enabled: true };
const kinds = (plan) => plan.map((layer) => layer.kind);

test('gate: ambient plan covers typical scenes', () => {
    assert.deepEqual(resolveAmbientPlan({ location: '森林', time: '清晨', weather: '晴' }, ON), [{ kind: 'birds', level: 'medium', muffled: false }]);
    assert.deepEqual(kinds(resolveAmbientPlan({ location: '公园', time: '夜晚', weather: '晴' }, ON)), ['insects']);
    assert.deepEqual(kinds(resolveAmbientPlan({ location: '海边沙滩', time: '下午' }, ON)), ['waves']);
    assert.deepEqual(kinds(resolveAmbientPlan({ location: '商业街', time: '下午' }, ON)), ['crowd']);
    assert.deepEqual(kinds(resolveAmbientPlan({ location: '山顶', time: '白天', weather: '大风' }, ON)), ['wind', 'birds']);
});

test('gate: ambient plan handles rain outdoors and indoors', () => {
    const storm = resolveAmbientPlan({ location: '森林', time: '清晨', weather: '暴雨' }, ON);
    assert.deepEqual(storm, [{ kind: 'rain', level: 'heavy', muffled: false }]);
    const drizzle = resolveAmbientPlan({ location: '公园', time: '早上', weather: '小雨' }, ON);
    assert.deepEqual(kinds(drizzle), ['rain', 'birds']);
    assert.equal(drizzle[0].level, 'light');
    const indoor = resolveAmbientPlan({ location: '卧室', time: '夜晚', weather: '中雨' }, ON);
    assert.deepEqual(indoor, [{ kind: 'rain', level: 'medium', muffled: true }]);
    const classroom = resolveAmbientPlan({ location: '教室', weather: '雷阵雨伴大风' }, ON);
    assert.deepEqual(classroom.map((l) => [l.kind, l.muffled]), [['thunder', true], ['rain', true], ['wind', true], ['crowd', false]]);
});

test('gate: ambient plan filters toggles, disabled settings and caps layers', () => {
    assert.deepEqual(resolveAmbientPlan({ location: '森林', time: '清晨' }, { enabled: true, birds: false }), []);
    assert.deepEqual(resolveAmbientPlan({ location: '森林', time: '清晨' }, { enabled: false }), []);
    assert.deepEqual(resolveAmbientPlan({ location: '森林', time: '清晨' }), []);
    const busy = resolveAmbientPlan({ location: '海边公园广场', time: '上午', weather: '小雨大风' }, ON);
    assert.equal(busy.length, 3);
    assert.deepEqual(kinds(busy), ['rain', 'wind', 'waves']);
});

test('gate: scene audio crossfades bgm on track change and pauses old audio after fade', () => {
    const timers = scheduler();
    const audio = audioFactory();
    const root = fakeRoot();
    const opts = (location) => bgmOptions({ context: { location }, audioFactory: audio.factory, schedule: timers.schedule, clear: timers.clear });
    const first = applySceneAudio(root, opts('教室'));
    assert.equal(first.track.id, 'calm');
    assert.equal(audio.created.length, 1);
    const [calm] = audio.created;
    assert.equal(calm.src, 'https://x/calm.mp3');
    assert.equal(calm.loop, true);
    assert.equal(calm.volume, 0);
    timers.runAll();
    assert.ok(Math.abs(calm.volume - 0.6) < 1e-9);

    assert.equal(applySceneAudio(root, opts('海边')).track.id, 'sea');
    assert.equal(audio.created.length, 2);
    const sea = audio.created[1];
    assert.equal(sea.playing, true);
    assert.ok(timers.queue.length >= 2, 'both ramps are running');
    for (let i = 0; i < 10; i++) timers.queue.length && timers.runAll(2);
    assert.ok(calm.volume < 0.6 && calm.volume > 0);
    assert.ok(sea.volume > 0 && sea.volume < 0.6);
    assert.equal(calm.pauses, 0);
    timers.runAll();
    assert.equal(calm.pauses, 1);
    assert.equal(calm.src, '');
    assert.ok(Math.abs(sea.volume - 0.6) < 1e-9);
    assert.ok(BGM_FADE_MS >= 1000);
    cancelSceneAudio(root);
});

test('gate: scene audio keeps the same track playing and only adjusts volume', () => {
    const timers = scheduler();
    const audio = audioFactory();
    const root = fakeRoot();
    const base = { audioFactory: audio.factory, schedule: timers.schedule, clear: timers.clear, context: { location: '沙滩' } };
    applySceneAudio(root, bgmOptions(base));
    timers.runAll();
    applySceneAudio(root, bgmOptions(base));
    assert.equal(timers.queue.length, 0, 'unchanged render schedules nothing');
    applySceneAudio(root, { ...base, context: { location: '海港', emotion: '开心' }, bgm: { enabled: true, volume: 0.2, tracks: TRACKS } });
    timers.runAll();
    assert.equal(audio.created.length, 1);
    assert.equal(audio.created[0].plays, 1);
    assert.ok(Math.abs(audio.created[0].volume - 0.2) < 1e-9);
    cancelSceneAudio(root);
});

test('gate: scene audio fades out and stops when disabled or inactive', () => {
    for (const change of [{ bgm: { enabled: false, tracks: TRACKS } }, { active: false }]) {
        const timers = scheduler();
        const audio = audioFactory();
        const root = fakeRoot();
        const base = { audioFactory: audio.factory, schedule: timers.schedule, clear: timers.clear, context: { location: '教室' } };
        applySceneAudio(root, bgmOptions(base));
        timers.runAll();
        const result = applySceneAudio(root, bgmOptions({ ...base, ...change }));
        assert.equal(result.track, null);
        assert.deepEqual(result.ambient, []);
        assert.equal(audio.created[0].pauses, 0, 'fades before pausing');
        timers.runAll();
        assert.equal(audio.created[0].pauses, 1);
        assert.equal(audio.created[0].volume, 0);
        assert.equal(audio.created.length, 1);
        cancelSceneAudio(root);
    }
});

test('gate: cancel scene audio stops immediately and clears timers', () => {
    const timers = scheduler();
    const audio = audioFactory();
    const root = fakeRoot();
    const base = { audioFactory: audio.factory, schedule: timers.schedule, clear: timers.clear };
    applySceneAudio(root, bgmOptions({ ...base, context: { location: '教室' } }));
    applySceneAudio(root, bgmOptions({ ...base, context: { location: '海边' } }));
    assert.ok(timers.queue.length > 0);
    assert.equal(cancelSceneAudio(root), true);
    assert.equal(timers.queue.length, 0);
    assert.ok(audio.created.every((a) => a.pauses === 1 && a.src === ''));
    assert.equal(cancelSceneAudio(root), false);
    assert.equal(cancelSceneAudio(null), false);
});

test('gate: bgm play rejection is caught and retried once on pointerdown', async () => {
    const timers = scheduler();
    const audio = audioFactory({ reject: true });
    const root = fakeRoot();
    assert.doesNotThrow(() => applySceneAudio(root, bgmOptions({ audioFactory: audio.factory, schedule: timers.schedule, clear: timers.clear, context: { location: '教室' } })));
    await new Promise((resolve) => setImmediate(resolve));
    const pointer = () => root.ownerDocument.listeners.filter((l) => l.type === 'pointerdown');
    assert.equal(pointer().length, 1);
    pointer()[0].fn();
    assert.equal(pointer().length, 0);
    assert.equal(audio.created[0].plays, 2);
    assert.equal(audio.created[0].playing, true);

    const again = audioFactory({ reject: true });
    const other = fakeRoot();
    applySceneAudio(other, bgmOptions({ audioFactory: again.factory, schedule: timers.schedule, clear: timers.clear }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(other.ownerDocument.listeners.filter((l) => l.type === 'pointerdown').length, 1);
    cancelSceneAudio(other);
    assert.equal(other.ownerDocument.listeners.length, 0);
    cancelSceneAudio(root);
});

test('gate: ambient is a safe no-op without WebAudio but still returns the plan', () => {
    const root = fakeRoot();
    const result = applySceneAudio(root, { ambient: { enabled: true }, context: { location: '森林', time: '清晨' } });
    assert.deepEqual(kinds(result.ambient), ['birds']);
    assert.equal(result.track, null);
    assert.equal(cancelSceneAudio(root), true);
    assert.deepEqual(applySceneAudio(null, { ambient: { enabled: true }, context: { location: '海边' } }).ambient.map((l) => l.kind), ['waves']);
});

test('gate: ambient layers synthesize, diff by kind and dispose nodes', () => {
    const timers = scheduler();
    const ctx = fakeContext();
    const root = fakeRoot();
    const base = { ambient: { enabled: true, volume: 0.3 }, contextFactory: () => ctx, schedule: timers.schedule, clear: timers.clear };
    for (const location of ['森林', '公园', '海边', '商业街']) {
        applySceneAudio(root, { ...base, context: { location, time: location === '公园' ? '夜晚' : '清晨', weather: '暴雨伴狂风' } });
    }
    for (let i = 0; i < 200 && timers.queue.length; i++) timers.runAll(1);
    const before = ctx.nodes.length;
    applySceneAudio(root, { ...base, context: { location: '森林', time: '清晨', weather: '晴' } });
    assert.ok(ctx.nodes.length > before, 'new birds layer built');
    const master = ctx.nodes[0];
    assert.ok(master.connected.includes(ctx.destination));
    assert.ok(master.gain.calls.includes('target'));
    for (let i = 0; i < 400 && timers.queue.length; i++) timers.runAll(1);
    assert.equal(cancelSceneAudio(root), true);
    assert.equal(timers.queue.length, 0);
    assert.ok(ctx.nodes.filter((n) => n.started).every((n) => n.stopped));
    assert.ok(ctx.nodes.every((n) => n.disconnected));
});

// 阅读器根节点自身也能收事件（雷声监听闪屏事件）。
function eventRoot() {
    const root = fakeRoot();
    root.listeners = [];
    root.addEventListener = (type, fn) => root.listeners.push({ type, fn });
    root.removeEventListener = (type, fn) => {
        const i = root.listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (i >= 0) root.listeners.splice(i, 1);
    };
    return root;
}

const lastTarget = (param) => param.history.filter(([name]) => name === 'target').at(-1)?.[1];
const startedSources = (ctx) => ctx.nodes.filter((n) => 'buffer' in n && n.started).length;
const settleTimers = (timers) => { for (let i = 0; i < 400 && timers.queue.length; i++) timers.runAll(1); };

test('gate: ambient plan adds stream, fire, snow and thunder scenes', () => {
    assert.deepEqual(kinds(resolveAmbientPlan({ location: '溪边树林', time: '清晨' }, ON)), ['stream', 'birds']);
    assert.deepEqual(resolveAmbientPlan({ location: '壁炉旁的客厅', time: '夜晚' }, ON), [{ kind: 'fire', level: 'medium', muffled: false }]);
    assert.deepEqual(resolveAmbientPlan({ location: '雪原', time: '夜晚', weather: '小雪' }, ON), [{ kind: 'snow', level: 'light', muffled: false }]);
    assert.deepEqual(kinds(resolveAmbientPlan({ location: '雪原', time: '夜晚', weather: '暴风雪' }, ON)), ['wind']);
    assert.deepEqual(resolveAmbientPlan({ location: '卧室', weather: '大雪' }, ON), [{ kind: 'snow', level: 'heavy', muffled: true }]);
    const storm = resolveAmbientPlan({ location: '森林', weather: '雷暴', lightningSynced: true }, ON);
    assert.deepEqual(storm[0], { kind: 'thunder', level: 'heavy', muffled: false, synced: true });
    assert.equal(resolveAmbientPlan({ location: '森林', weather: '雷雨' }, ON)[0].synced, false);
    assert.deepEqual(kinds(resolveAmbientPlan({ location: '森林', weather: '雷雨' }, { enabled: true, thunder: false })), ['rain', 'birds']);
    // thunder 不占常驻图层上限。
    const busy = resolveAmbientPlan({ location: '海边溪口广场', weather: '雷阵雨伴大风' }, ON);
    assert.deepEqual(kinds(busy), ['thunder', 'rain', 'wind', 'waves']);
});

test('gate: synced thunder follows weather flash events with a delay and unhooks on cancel', () => {
    const timers = scheduler();
    const ctx = fakeContext();
    const root = eventRoot();
    applySceneAudio(root, {
        ambient: { enabled: true, rain: false }, contextFactory: () => ctx, schedule: timers.schedule, clear: timers.clear,
        context: { location: '森林', weather: '雷暴', lightningSynced: true },
    });
    const flash = root.listeners.filter((l) => l.type === 'igs-weather-flash');
    assert.equal(flash.length, 1);
    assert.equal(timers.queue.length, 0, 'synced thunder waits for the flash');
    flash[0].fn();
    assert.equal(timers.queue.length, 1);
    assert.ok(timers.queue[0].delay >= 300 && timers.queue[0].delay <= 2000);
    const before = startedSources(ctx);
    timers.runAll(1);
    assert.ok(startedSources(ctx) > before, 'rumble started');
    assert.equal(timers.queue.length, 0, 'no self-scheduling when synced');
    cancelSceneAudio(root);
    assert.equal(root.listeners.length, 0);
    assert.ok(ctx.nodes.filter((n) => n.started).every((n) => n.stopped));
});

test('gate: unsynced thunder schedules itself within the lightning intervals', () => {
    const timers = scheduler();
    const ctx = fakeContext();
    const root = eventRoot();
    applySceneAudio(root, {
        ambient: { enabled: true, rain: false }, contextFactory: () => ctx, schedule: timers.schedule, clear: timers.clear,
        context: { location: '卧室', weather: '雷雨' },
    });
    assert.equal(root.listeners.length, 0);
    assert.equal(timers.queue.length, 1);
    assert.ok(timers.queue[0].delay >= 1500 && timers.queue[0].delay <= 3500);
    const before = startedSources(ctx);
    timers.runAll(1);
    assert.ok(startedSources(ctx) > before);
    assert.equal(timers.queue.length, 1);
    assert.ok(timers.queue[0].delay >= 7000 && timers.queue[0].delay <= 14000);
    cancelSceneAudio(root);
    assert.equal(timers.queue.length, 0);
});

test('gate: stream, fire and snow voices synthesize and dispose all nodes', () => {
    for (const context of [{ location: '溪边', time: '夜晚' }, { location: '篝火旁' }, { location: '雪原', weather: '中雪' }]) {
        const timers = scheduler();
        const ctx = fakeContext();
        const root = fakeRoot();
        const result = applySceneAudio(root, { ambient: { enabled: true }, contextFactory: () => ctx, schedule: timers.schedule, clear: timers.clear, context });
        assert.equal(result.ambient.length, 1);
        assert.ok(ctx.nodes.length > 3, `${result.ambient[0].kind} built nodes`);
        for (let i = 0; i < 100 && timers.queue.length; i++) timers.runAll(1);
        assert.equal(cancelSceneAudio(root), true);
        assert.equal(timers.queue.length, 0);
        assert.ok(ctx.nodes.filter((n) => n.started).every((n) => n.stopped));
        assert.ok(ctx.nodes.every((n) => n.disconnected));
    }
});

test('gate: ducking lowers ambient and bgm, nests, and restores on the last release', () => {
    const timers = scheduler();
    const ctx = fakeContext();
    const audio = audioFactory();
    const root = fakeRoot();
    applySceneAudio(root, {
        ...bgmOptions(), ambient: { enabled: true, volume: 0.4 }, audioFactory: audio.factory, contextFactory: () => ctx,
        schedule: timers.schedule, clear: timers.clear, context: { location: '海边' },
    });
    const master = ctx.nodes[0];
    settleTimers(timers);
    assert.equal(lastTarget(master.gain), 0.4);
    const first = duckSceneAudio();
    const second = duckSceneAudio();
    assert.ok(Math.abs(lastTarget(master.gain) - 0.4 * DUCK_RATIO) < 1e-9);
    settleTimers(timers);
    assert.ok(Math.abs(audio.created[0].volume - 0.6 * DUCK_RATIO) < 1e-9);
    first();
    first();
    assert.ok(Math.abs(lastTarget(master.gain) - 0.4 * DUCK_RATIO) < 1e-9, 'still ducked while nested');
    second();
    assert.equal(lastTarget(master.gain), 0.4);
    settleTimers(timers);
    assert.ok(Math.abs(audio.created[0].volume - 0.6) < 1e-9);
    cancelSceneAudio(root);
    // 没有场景声音时闪避只是计数，释放后不留状态。
    duckSceneAudio()();
});

test('gate: hidden page fades out, pauses and suspends; visible resumes', () => {
    const timers = scheduler();
    const ctx = fakeContext();
    const audio = audioFactory();
    const root = fakeRoot();
    const options = (location) => ({
        ...bgmOptions(), ambient: { enabled: true, volume: 0.4 }, audioFactory: audio.factory, contextFactory: () => ctx,
        schedule: timers.schedule, clear: timers.clear, context: { location },
    });
    applySceneAudio(root, options('海边'));
    settleTimers(timers);
    const doc = root.ownerDocument;
    const visibility = doc.listeners.filter((l) => l.type === 'visibilitychange');
    assert.equal(visibility.length, 1);
    doc.hidden = true;
    visibility[0].fn();
    assert.equal(lastTarget(ctx.nodes[0].gain), 0);
    settleTimers(timers);
    assert.equal(audio.created[0].pauses, 1);
    assert.equal(audio.created[0].volume, 0);
    assert.equal(ctx.suspends, 1);
    // 隐藏期间换曲不自动开播，回到前台再播。
    applySceneAudio(root, options('悲伤的雨夜'));
    assert.equal(audio.created[1].plays, 0);
    doc.hidden = false;
    visibility[0].fn();
    assert.equal(audio.created[1].plays, 1);
    assert.equal(lastTarget(ctx.nodes[0].gain), 0.4);
    cancelSceneAudio(root);
    assert.equal(doc.listeners.filter((l) => l.type === 'visibilitychange').length, 0);
});

test('gate: ambient tone follows fx ranges and thought pages by priority', () => {
    assert.equal(resolveAmbientTone({}), '');
    assert.equal(resolveAmbientTone({ textType: 'thought' }), 'thought');
    assert.equal(resolveAmbientTone({ fxRanges: { letterbox: true } }), 'letterbox');
    assert.equal(resolveAmbientTone({ fxRanges: { letterbox: true }, textType: 'thought' }), 'thought');
    assert.equal(resolveAmbientTone({ fxRanges: { flashback: true, letterbox: true }, textType: 'thought' }), 'flashback');
    assert.equal(resolveAmbientTone({ fxRanges: { dream: true, flashback: true } }), 'dream');
    assert.equal(resolveAmbientTone({ textType: 'dialogue', fxRanges: null }), '');
});

test('gate: ambient space picks hall words, indoor rooms and open air', () => {
    assert.equal(resolveAmbientSpace('学校走廊'), 'hall');
    assert.equal(resolveAmbientSpace('山洞'), 'hall');
    assert.equal(resolveAmbientSpace('卧室'), 'room');
    assert.equal(resolveAmbientSpace('森林'), '');
    assert.equal(resolveAmbientSpace(''), '');
});

test('gate: flashback adds an uncapped vinyl layer', () => {
    const plan = resolveAmbientPlan({ location: '海边溪口广场', weather: '小雨大风', fxRanges: { flashback: true } }, ON);
    assert.deepEqual(kinds(plan), ['rain', 'wind', 'waves', 'vinyl']);
    assert.deepEqual(kinds(resolveAmbientPlan({ location: '卧室', fxRanges: { flashback: true } }, ON)), ['vinyl']);
    assert.deepEqual(resolveAmbientPlan({ location: '卧室', fxRanges: { flashback: true } }, { enabled: false }), []);
});

test('gate: tone chain filters, reverb and gain retarget per tone and space, then disconnect', () => {
    const timers = scheduler();
    const ctx = fakeContext();
    ctx.createConvolver = () => { const n = { connected: [], buffer: null, disconnected: false, connect(t) { this.connected.push(t); return t; }, disconnect() { this.disconnected = true; } }; ctx.nodes.push(n); return n; };
    const root = fakeRoot();
    const apply = (context) => applySceneAudio(root, { ambient: { enabled: true, volume: 0.4 }, contextFactory: () => ctx, schedule: timers.schedule, clear: timers.clear, context });
    const first = apply({ location: '森林', time: '清晨' });
    assert.equal(first.tone, '');
    assert.equal(first.space, '');
    const filters = ctx.nodes.filter((n) => n.type === 'highpass' || n.type === 'lowpass').slice(0, 2);
    const [high, low] = filters;
    const convolver = ctx.nodes.find((n) => 'buffer' in n && !('start' in n));
    assert.ok(convolver, 'convolver built');
    assert.equal(lastTarget(low.frequency), 20000);
    assert.equal(convolver.buffer, null, 'open air has no impulse');

    const dream = apply({ location: '森林', time: '清晨', fxRanges: { dream: true } });
    assert.equal(dream.tone, 'dream');
    assert.equal(lastTarget(low.frequency), 1200);
    assert.ok(convolver.buffer, 'dream loads the long impulse');

    apply({ location: '森林', time: '清晨', fxRanges: { flashback: true } });
    assert.equal(lastTarget(high.frequency), 400);
    assert.equal(lastTarget(low.frequency), 3000);

    const hall = apply({ location: '车站大厅' });
    assert.equal(hall.tone, '');
    assert.equal(hall.space, 'hall');
    const targets = low.frequency.history.length;
    apply({ location: '车站大厅' });
    assert.equal(low.frequency.history.length, targets, 'same tone and space is idempotent');

    for (let i = 0; i < 200 && timers.queue.length; i++) timers.runAll(1);
    assert.equal(cancelSceneAudio(root), true);
    assert.ok(ctx.nodes.every((n) => n.disconnected));
});

test('gate: vinyl voice synthesizes pops and disposes', () => {
    const timers = scheduler();
    const ctx = fakeContext();
    const root = fakeRoot();
    const result = applySceneAudio(root, { ambient: { enabled: true }, contextFactory: () => ctx, schedule: timers.schedule, clear: timers.clear, context: { location: '卧室', fxRanges: { flashback: true } } });
    assert.deepEqual(kinds(result.ambient), ['vinyl']);
    const before = startedSources(ctx);
    for (let i = 0; i < 20 && timers.queue.length; i++) timers.runAll(1);
    assert.ok(startedSources(ctx) > before);
    cancelSceneAudio(root);
    assert.equal(timers.queue.length, 0);
    assert.ok(ctx.nodes.filter((n) => n.started).every((n) => n.stopped));
});

test('gate: thunder and insects get random stereo pan within limits and pan nodes are released', () => {
    const setup = (context, ambient = { enabled: true }) => {
        const timers = scheduler();
        const ctx = fakeContext();
        const panners = [];
        ctx.createStereoPanner = () => { const n = ctx.createGain(); n.pan = param(0); panners.push(n); return n; };
        const root = eventRoot();
        applySceneAudio(root, { ambient, contextFactory: () => ctx, schedule: timers.schedule, clear: timers.clear, context });
        return { timers, panners, root };
    };
    const night = setup({ location: '草地', time: '夜晚', weather: '晴' });
    assert.ok(night.panners.length >= 2, 'each insect voice has its own pan');
    assert.ok(night.panners.every((n) => Math.abs(n.pan.value) <= 0.6));
    cancelSceneAudio(night.root);
    assert.ok(night.panners.every((n) => n.disconnected));
    const storm = setup({ location: '森林', weather: '雷暴', lightningSynced: true }, { enabled: true, rain: false });
    storm.root.listeners.find((l) => l.type === 'igs-weather-flash').fn();
    storm.timers.runAll(1);
    assert.ok(storm.panners.length >= 1);
    assert.ok(storm.panners.every((n) => n.pan.value === storm.panners[0].pan.value), 'crack and rumble share one position');
    assert.ok(Math.abs(storm.panners[0].pan.value) <= 0.4);
    cancelSceneAudio(storm.root);
});

test('gate:perf:hidden-page-parks-ambient-loops-instead-of-queueing-blips', () => {
    const timers = scheduler();
    const ctx = fakeContext();
    const root = fakeRoot();
    const oscillators = () => ctx.nodes.filter((n) => 'frequency' in n && 'start' in n).length;
    applySceneAudio(root, { ambient: { enabled: true }, contextFactory: () => ctx, schedule: timers.schedule, clear: timers.clear, context: { location: '街道', weather: '大雨' } });
    for (let i = 0; i < 20; i++) timers.runAll(1);
    const visibleDrops = oscillators();
    assert.ok(visibleDrops > 0, 'rain drops play while visible');
    const fire = () => root.ownerDocument.listeners.filter((l) => l.type === 'visibilitychange').forEach((l) => l.fn());
    root.ownerDocument.hidden = true;
    fire();
    for (let i = 0; i < 200 && timers.queue.length; i++) timers.runAll(1);
    assert.equal(oscillators(), visibleDrops, 'no one-shot blips pile up while hidden');
    assert.equal(timers.queue.length, 0, 'loops park instead of rescheduling');
    root.ownerDocument.hidden = false;
    fire();
    for (let i = 0; i < 20; i++) timers.runAll(1);
    assert.ok(oscillators() > visibleDrops, 'loops restart once visible');
    cancelSceneAudio(root);
});
