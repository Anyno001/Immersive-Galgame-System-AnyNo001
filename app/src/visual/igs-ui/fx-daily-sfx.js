// 日常演出的合成音效：振荡器部分沿用 chat-sfx 的 partial 表，噪声部分（快门、纸张、烟花等）在本文件内合成。
import { createSynthPartial as p } from './chat-sfx.js';
import { audioBusContext, busInput, resumeAudioBus } from './audio-bus.js';
import { duckSceneAudio } from './scene-audio.js';

const TONE_GAIN = 0.35;
const NOISE_GAIN = 0.3;
const FLOOR = 0.001;
const NOISE_SECONDS = 2;

const n = (start, duration, gain, extra = {}) => Object.freeze({ start, duration, gain, filter: 'bandpass', freq: 2000, q: 1, attack: 0.002, ...extra });

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const bellNote = (freq, start, ring, gain) => [
    p('sine', freq, freq, start, ring, gain, { attack: 0.004 }),
    p('sine', freq * 2, freq * 2, start, ring * 0.45, gain * 0.22, { attack: 0.003 }),
    p('sine', freq * 2.76, freq * 2.76, start, 0.32, gain * 0.28, { attack: 0.002 }),
    p('sine', freq * 5.4, freq * 5.4, start, 0.12, gain * 0.14, { attack: 0.001 }),
];

const WESTMINSTER = [329.63, 261.63, 293.66, 196.0, 196.0, 293.66, 329.63, 261.63];
const BELL_STEP = 0.52;

const bell = WESTMINSTER.flatMap((freq, i) => {
    const last = i === WESTMINSTER.length - 1;
    return bellNote(freq, i * BELL_STEP, last ? 0.85 : 1.0, 0.3);
});

const broadcast = [698.46, 880, 1046.5, 1396.91].flatMap((freq, i) => {
    const start = i * 0.3;
    const ring = i === 3 ? 0.7 : 0.5;
    return [
        p('sine', freq, freq, start, ring, 0.3, { attack: 0.003 }),
        p('sine', freq * 3.9, freq * 3.9, start, 0.06, 0.06, { attack: 0.001 }),
        p('triangle', freq * 2, freq * 2, start, 0.18, 0.05, { attack: 0.002 }),
    ];
});

function crackle(rand, from, span, count) {
    return Array.from({ length: count }, () => n(from + rand() * span, 0.012 + rand() * 0.02, 0.14 + rand() * 0.2, {
        filter: 'highpass', freq: 2800 + rand() * 2200, q: 0.7, attack: 0.001,
    })).sort((a, b) => a.start - b.start);
}

function burst(offset, seed) {
    const rand = seeded(seed);
    return {
        partials: [
            p('sine', 62, 40, offset, 0.55, 0.75, { attack: 0.004, sweep: 1 }),
        ],
        noise: [
            n(offset, 0.9, 0.85, { filter: 'lowpass', freq: 900, freqTo: 140, q: 0.7, attack: 0.004 }),
            ...crackle(rand, offset + 0.18, 0.8, 16),
        ],
    };
}

const fireworkMain = burst(0.75, 7);
const fireworkPop = burst(0, 11);

const alarm = [0, 0.62, 1.24, 1.86].flatMap((b) => [0, 1, 2, 3].map((i) => {
    const freq = i % 2 ? 2093 : 1760;
    return p('triangle', freq, freq, b + i * 0.1, 0.075, 0.32, { attack: 0.003 });
}));

const omikujiRand = seeded(23);
const omikujiClicks = Array.from({ length: 42 }, (_, i) => {
    // 按摇动节奏把颗粒聚集成几簇，比均匀随机更像签筒里竹签来回撞击。
    const cluster = Math.floor(i / 7);
    const start = cluster * 0.15 + omikujiRand() * 0.12;
    return n(start, 0.01 + omikujiRand() * 0.016, 0.16 + omikujiRand() * 0.22, {
        freq: 1200 + omikujiRand() * 1200, q: 5, attack: 0.001,
    });
}).sort((a, b) => a.start - b.start);

const clockTicks = Array.from({ length: 10 }, (_, i) => 1.2 * Math.sqrt(i / 9));

const touchRand = seeded(41);
const touchGlints = Array.from({ length: 6 }, (_, i) => {
    const freq = 2000 + touchRand() * 1000;
    return p('sine', freq, freq * 1.02, 0.34 + i * 0.1 + touchRand() * 0.05, 0.28, 0.05 + touchRand() * 0.03, { attack: 0.01 });
});

// 魔法世界：施咒的上扬泛音与火花、坩埚咕嘟、猫头鹰振翅与「咕—咕」、扫帚破风。
const spellRand = seeded(59);
const spellGlints = Array.from({ length: 9 }, (_, i) => {
    const freq = 2600 + spellRand() * 1800;
    return p('sine', freq, freq * 1.04, 0.36 + i * 0.05 + spellRand() * 0.04, 0.22, 0.05 + spellRand() * 0.04, { attack: 0.004 });
});
const potionRand = seeded(67);
const potionBubbles = Array.from({ length: 11 }, () => {
    const start = 0.1 + potionRand() * 2.2;
    const freq = 260 + potionRand() * 260;
    return p('sine', freq, freq * 2.2, start, 0.06, 0.22 + potionRand() * 0.12, { attack: 0.004, sweep: 1 });
}).sort((a, b) => a.start - b.start);
const owlFlaps = [0, 0.2, 0.4, 0.6];
const owlHoot = (start, ring) => [
    p('sine', 410, 372, start, ring, 0.4, { attack: 0.05, sweep: 1 }),
    p('sine', 820, 744, start, ring * 0.8, 0.06, { attack: 0.05, sweep: 1 }),
];

const howlerRand = seeded(73);
const howlerRattle = Array.from({ length: 10 }, (_, i) => n(i * 0.085 + howlerRand() * 0.02, 0.03, 0.3 + howlerRand() * 0.15, {
    filter: 'lowpass', freq: 1400 + howlerRand() * 600, q: 0.8, attack: 0.002,
}));

const DEFS = {
    // 魔法时间跳跃：细沙流泻，接一声城堡塔钟。
    hourglass: {
        partials: bellNote(196, 1.1, 1.6, 0.34),
        noise: [
            n(0, 2.4, 0.1, { filter: 'highpass', freq: 5200, q: 0.7, attack: 0.3, env: 'flat', am: Object.freeze({ rate: 38, depth: 0.6 }) }),
        ],
    },
    // 吼叫信：信封在桌上乱抖，炸开后一声粗粝的怒吼。
    howler: {
        partials: [
            p('sawtooth', 150, 112, 0.9, 1.3, 0.2, { attack: 0.04, sweep: 1 }),
            p('sawtooth', 157, 116, 0.9, 1.3, 0.16, { attack: 0.04, sweep: 1 }),
            p('square', 300, 228, 0.9, 1.1, 0.05, { attack: 0.04, sweep: 1 }),
        ],
        noise: [
            ...howlerRattle,
            n(0.86, 0.12, 0.5, { filter: 'lowpass', freq: 900, q: 0.7, attack: 0.002 }),
            n(0.9, 1.3, 0.3, { freq: 950, freqTo: 620, q: 1.4, attack: 0.05 }),
        ],
    },
    spell: {
        partials: [
            p('sine', 520, 2100, 0, 0.36, 0.2, { attack: 0.02, sweep: 1 }),
            p('triangle', 1040, 4200, 0.02, 0.32, 0.06, { attack: 0.02, sweep: 1 }),
            p('sine', 1568, 1568, 0.38, 0.5, 0.16, { attack: 0.003 }),
            p('sine', 2349, 2349, 0.38, 0.4, 0.08, { attack: 0.003 }),
            ...spellGlints,
        ],
        noise: [
            n(0, 0.4, 0.14, { filter: 'highpass', freq: 3000, freqTo: 6000, q: 0.7, attack: 0.2 }),
        ],
    },
    potion: {
        partials: potionBubbles,
        noise: [
            n(0, 2.6, 0.12, { filter: 'lowpass', freq: 320, q: 0.7, attack: 0.4, env: 'flat', am: Object.freeze({ rate: 7, depth: 0.5 }) }),
        ],
    },
    owl: {
        partials: [...owlHoot(0.95, 0.24), ...owlHoot(1.3, 0.5)],
        noise: owlFlaps.map((start) => n(start, 0.13, 0.32, { filter: 'lowpass', freq: 900, freqTo: 420, q: 0.8, attack: 0.03 })),
    },
    broom: {
        partials: [
            p('sine', 2400, 2400, 0.55, 0.3, 0.05, { attack: 0.02 }),
            p('sine', 3200, 3200, 0.62, 0.26, 0.04, { attack: 0.02 }),
        ],
        noise: [
            n(0, 1.1, 0.4, { freq: 500, freqTo: 2600, q: 1.1, attack: 0.5 }),
            n(0.2, 0.9, 0.12, { filter: 'highpass', freq: 3500, q: 0.7, attack: 0.4 }),
        ],
    },
    shutter: {
        partials: [
            p('triangle', 2400, 2200, 0.004, 0.014, 0.1, { attack: 0.001, sweep: 1 }),
            p('sine', 190, 120, 0, 0.035, 0.2, { attack: 0.001, sweep: 1 }),
        ],
        noise: [
            n(0, 0.026, 0.6, { freq: 3400, q: 1.2, attack: 0.001 }),
            n(0.042, 0.03, 0.5, { freq: 2600, q: 1.2, attack: 0.001 }),
            n(0.043, 0.012, 0.16, { filter: 'highpass', freq: 5500, q: 0.7, attack: 0.001 }),
        ],
    },
    bell: { partials: bell, noise: [] },
    broadcast: { partials: broadcast, noise: [] },
    firework: {
        partials: [
            p('sine', 600, 1800, 0, 0.7, 0.12, { attack: 0.45, sweep: 1 }),
            ...fireworkMain.partials,
        ],
        noise: [
            n(0, 0.7, 0.05, { filter: 'bandpass', freq: 1200, freqTo: 3200, q: 3, attack: 0.4 }),
            ...fireworkMain.noise,
        ],
    },
    'firework-pop': fireworkPop,
    alarm: { partials: alarm, noise: [] },
    vibrate: {
        partials: [],
        noise: [0, 0.55].map((start) => n(start, 0.35, 0.55, {
            tone: 'square', toneFreq: 150, filter: 'lowpass', freq: 320, q: 0.7, attack: 0.02,
            env: 'flat', am: Object.freeze({ rate: 28, depth: 0.45 }),
        })),
    },
    omikuji: {
        partials: [
            p('sine', 700, 500, 1.0, 0.14, 0.6, { attack: 0.001, sweep: 0.35 }),
            p('triangle', 1400, 1000, 1.0, 0.04, 0.08, { attack: 0.001, sweep: 1 }),
        ],
        noise: omikujiClicks,
    },
    receipt: {
        partials: [],
        noise: [
            n(0, 0.9, 0.32, { freq: 3000, q: 2, attack: 0.02, env: 'flat', am: Object.freeze({ rate: 60, depth: 0.85 }) }),
            n(0, 0.9, 0.1, { filter: 'lowpass', freq: 400, q: 0.7, attack: 0.02, env: 'flat', am: Object.freeze({ rate: 60, depth: 0.6 }) }),
            n(0.98, 0.2, 0.42, { filter: 'highpass', freq: 1500, freqTo: 5000, q: 0.8, attack: 0.03 }),
        ],
    },
    paper: {
        partials: [],
        noise: [
            n(0, 0.22, 0.3, { freq: 2400, freqTo: 3400, q: 0.8, attack: 0.08 }),
            n(0.24, 0.28, 0.26, { freq: 3000, freqTo: 2200, q: 0.8, attack: 0.1 }),
            n(0.55, 0.18, 0.22, { freq: 2800, freqTo: 3800, q: 0.9, attack: 0.06 }),
        ],
    },
    sticky: {
        partials: [
            p('sine', 150, 80, 0, 0.09, 0.5, { attack: 0.002, sweep: 1 }),
        ],
        noise: [
            n(0, 0.05, 0.35, { filter: 'lowpass', freq: 700, q: 0.7, attack: 0.001 }),
            n(0.03, 0.012, 0.16, { filter: 'highpass', freq: 4200, q: 0.7, attack: 0.001 }),
        ],
    },
    'tv-on': {
        partials: [
            p('sine', 95, 50, 0, 0.12, 0.35, { attack: 0.002, sweep: 1 }),
            p('sine', 4000, 3800, 0.03, 0.4, 0.06, { attack: 0.01, sweep: 1 }),
            p('sine', 60, 60, 0.05, 0.9, 0.18, { attack: 0.12 }),
            p('sine', 120, 120, 0.05, 0.9, 0.08, { attack: 0.12 }),
        ],
        noise: [
            n(0, 0.25, 0.28, { filter: 'highpass', freq: 1500, q: 0.7, attack: 0.004, env: 'flat' }),
        ],
    },
    // 更鼓：古代背景的时间跳跃，「咚——咚」两声低沉鼓点。
    drum: {
        partials: [0, 0.95].flatMap((start) => [
            p('sine', 118, 64, start, 0.55, 0.9, { attack: 0.004, sweep: 0.5 }),
            p('sine', 236, 128, start, 0.14, 0.22, { attack: 0.003, sweep: 1 }),
        ]),
        noise: [0, 0.95].map((start) => n(start, 0.07, 0.34, { filter: 'lowpass', freq: 380, q: 0.7, attack: 0.002 })),
    },
    // 孔明灯：古代背景的烟花替代，只有一阵缓起缓落的夜风，加两下极轻的纸罩鼓风声，不做爆炸。
    lantern: {
        partials: [],
        noise: [
            n(0, 3.2, 0.22, { filter: 'lowpass', freq: 420, freqTo: 700, q: 0.6, attack: 1.2 }),
            n(0.3, 2.6, 0.08, { freq: 900, freqTo: 1300, q: 0.7, attack: 1.0 }),
            n(0.9, 0.3, 0.07, { freq: 2200, freqTo: 1600, q: 0.9, attack: 0.12 }),
            n(1.7, 0.28, 0.05, { freq: 2000, freqTo: 1500, q: 0.9, attack: 0.1 }),
        ],
    },
    clock: {
        partials: [
            ...clockTicks.map((t, i) => {
                const freq = i % 2 ? 1500 : 1800;
                return p('triangle', freq, freq, t, 0.025, 0.14, { attack: 0.001 });
            }),
            ...bellNote(1568, 1.38, 0.9, 0.22),
        ],
        noise: clockTicks.map((t) => n(t, 0.02, 0.32, { freq: 2500, q: 6, attack: 0.001 })),
    },
    touch: {
        partials: [
            p('sine', 72, 48, 0, 0.16, 0.5, { attack: 0.006, sweep: 1 }),
            p('sine', 66, 44, 0.2, 0.2, 0.4, { attack: 0.006, sweep: 1 }),
            ...touchGlints,
        ],
        noise: [
            n(0.3, 0.6, 0.06, { filter: 'highpass', freq: 6000, q: 0.7, attack: 0.25 }),
        ],
    },
};

export const DAILY_SFX = Object.freeze(Object.fromEntries(Object.entries(DEFS).map(([kind, def]) => [
    kind,
    Object.freeze({ partials: Object.freeze([...def.partials]), noise: Object.freeze([...def.noise]) }),
])));

export const DAILY_SFX_KINDS = Object.freeze(Object.keys(DAILY_SFX));

export function dailySfxDuration(kind) {
    const def = DAILY_SFX[kind];
    if (!def) return 0;
    return [...def.partials, ...def.noise].reduce((max, q) => Math.max(max, q.start + q.duration), 0);
}

let noiseBuffer = null;
let noiseBufferContext = null;

function whiteNoise(context) {
    if (noiseBuffer && noiseBufferContext === context) return noiseBuffer;
    const rate = context.sampleRate || 44100;
    const buffer = context.createBuffer(1, Math.floor(rate * NOISE_SECONDS), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buffer;
    noiseBufferContext = context;
    return buffer;
}

function scheduleTone(context, output, q, base, volume, nodes) {
    const at = base + q.start;
    const peak = q.gain * TONE_GAIN * volume;
    const attack = q.attack == null ? 0.005 : q.attack;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = q.wave;
    osc.frequency.setValueAtTime(q.from, at);
    if (q.from !== q.to) osc.frequency.exponentialRampToValueAtTime(q.to, at + q.duration * (q.sweep == null ? 0.6 : q.sweep));
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(peak * FLOOR, at + q.duration);
    osc.connect(gain);
    gain.connect(output);
    nodes.push(osc, gain);
    osc.start(at);
    osc.stop(at + q.duration + 0.02);
}

function scheduleNoise(context, output, q, base, volume, nodes) {
    const at = base + q.start;
    const end = at + q.duration;
    const peak = q.gain * NOISE_GAIN * volume;
    let source;
    if (q.tone) {
        source = context.createOscillator();
        source.type = q.tone;
        source.frequency.setValueAtTime(q.toneFreq, at);
    } else {
        source = context.createBufferSource();
        source.buffer = whiteNoise(context);
        source.loop = true;
    }
    const filter = context.createBiquadFilter();
    filter.type = q.filter;
    filter.Q.setValueAtTime(q.q, at);
    filter.frequency.setValueAtTime(q.freq, at);
    if (q.freqTo && q.freqTo !== q.freq) filter.frequency.exponentialRampToValueAtTime(q.freqTo, end);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + q.attack);
    if (q.env === 'flat') {
        gain.gain.setValueAtTime(peak, Math.max(at + q.attack, end - 0.03));
        gain.gain.linearRampToValueAtTime(0, end);
    } else {
        gain.gain.exponentialRampToValueAtTime(peak * FLOOR, end);
    }
    source.connect(filter);
    filter.connect(gain);
    let tail = gain;
    if (q.am) {
        const mod = context.createGain();
        const lfo = context.createOscillator();
        const depth = context.createGain();
        mod.gain.setValueAtTime(1 - q.am.depth / 2, at);
        depth.gain.setValueAtTime(q.am.depth / 2, at);
        lfo.type = 'square';
        lfo.frequency.setValueAtTime(q.am.rate, at);
        lfo.connect(depth);
        depth.connect(mod.gain);
        gain.connect(mod);
        tail = mod;
        nodes.push(lfo, depth, mod);
        lfo.start(at);
        lfo.stop(end + 0.02);
    }
    tail.connect(output);
    nodes.push(source, filter, gain);
    source.start(at, q.tone ? undefined : Math.random() * (NOISE_SECONDS - 0.5));
    source.stop(end + 0.02);
}

function synthesize(def, volume, contextFactory) {
    const nodes = [];
    let release = null;
    let stopped = false;
    const stop = () => {
        stopped = true;
        for (const node of nodes) {
            try { node.stop?.(); } catch { /* already stopped */ }
            try { node.disconnect?.(); } catch { /* already disconnected */ }
        }
        nodes.length = 0;
        if (release) { release(); release = null; }
    };
    // 默认走统一混音总线的 sfx 子总线（受总音量、压限与页面隐藏挂起管理）；测试注入的 context 直连 destination。
    const injected = typeof contextFactory === 'function';
    let context;
    try {
        context = injected ? contextFactory() : audioBusContext();
    } catch {
        return null;
    }
    if (!context) return null;
    const output = (!injected && busInput('sfx')) || context.destination;
    const run = () => {
        if (stopped || (context.state && context.state !== 'running')) return;
        try {
            const base = context.currentTime + 0.01;
            for (const q of def.partials) scheduleTone(context, output, q, base, volume, nodes);
            for (const q of def.noise) scheduleNoise(context, output, q, base, volume, nodes);
            const length = [...def.partials, ...def.noise].reduce((max, q) => Math.max(max, q.start + q.duration), 0);
            release = duckSceneAudio({ durationMs: length * 1000 + 150 });
        } catch {
            stop();
        }
    };
    let resumed;
    try { resumed = injected ? context.resume?.() : resumeAudioBus(); } catch { /* 恢复失败时仍尝试按当前状态播放 */ }
    Promise.resolve(resumed).catch(() => {}).then(run);
    return { stop };
}

export function playDailySfx(kind, sound, { audioScheduler, contextFactory } = {}) {
    if (!sound || sound.enabled === false || !(sound.volume > 0)) return null;
    const def = DAILY_SFX[kind];
    if (!def) return null;
    const volume = sound.volume;
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ kind, volume, partials: def.partials, noise: def.noise }) || null; } catch { return null; }
    }
    return synthesize(def, volume, contextFactory);
}
