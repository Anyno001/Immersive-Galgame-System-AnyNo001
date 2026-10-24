// ABO 包的合成音效，写法同 fx-daily-sfx.js 的 DEFS；名字都带 abo- 前缀。
// 与 chat-sfx 的 partial 同形；这里自带一份，免得清单模块在 chat-sfx 尚未初始化时（经 scene-audio 成环）读到暂存死区。
const p = (wave, from, to, start, duration, gain, extra = {}) => Object.freeze({ wave, from, to, start, duration, gain, ...extra });

const n = (start, duration, gain, extra = {}) => Object.freeze({ start, duration, gain, filter: 'bandpass', freq: 2000, q: 1, attack: 0.002, ...extra });

const beat = (t, gain) => [
    p('sine', 62, 38, t, 0.16, gain, { attack: 0.004, sweep: 1 }),
    p('sine', 52, 34, t + 0.17, 0.14, gain * 0.7, { attack: 0.004, sweep: 1 }),
];

const bell = (freq, start, ring, gain) => [
    p('sine', freq, freq, start, ring, gain, { attack: 0.004 }),
    p('sine', freq * 2.76, freq * 2.76, start, ring * 0.3, gain * 0.2, { attack: 0.002 }),
];

const pulse = (freq, start, gain) => p('square', freq, freq, start, 0.11, gain, { attack: 0.004 });

export const ABO_SFX_DEFS = Object.freeze({
    'abo-waft': {
        partials: [p('sine', 196, 174, 0, 1.8, 0.07, { attack: 0.5, sweep: 1 }), p('sine', 294, 262, 0.1, 1.6, 0.04, { attack: 0.6, sweep: 1 })],
        noise: [n(0, 1.8, 0.16, { freq: 900, freqTo: 1500, q: 0.8, attack: 0.7 })],
    },
    'abo-link': {
        partials: [...bell(392, 0, 1.2, 0.1), ...bell(494, 0.22, 1.1, 0.08), p('sine', 196, 196, 0, 1.6, 0.05, { attack: 0.4 })],
        noise: [n(0, 1.4, 0.1, { freq: 1200, freqTo: 2000, q: 0.7, attack: 0.5 })],
    },
    'abo-press': {
        partials: [p('sine', 70, 34, 0, 1.4, 0.5, { attack: 0.02, sweep: 1 }), p('sine', 140, 60, 0, 0.9, 0.12, { attack: 0.02, sweep: 1 })],
        noise: [n(0, 1.2, 0.4, { filter: 'lowpass', freq: 320, freqTo: 90, q: 0.7, attack: 0.03 })],
    },
    'abo-calm': {
        partials: [
            p('sine', 261.6, 261.6, 0, 2.2, 0.06, { attack: 0.5 }), p('sine', 329.6, 329.6, 0.1, 2.1, 0.05, { attack: 0.5 }), p('sine', 392, 392, 0.2, 2, 0.045, { attack: 0.5 }),
            ...beat(0.2, 0.28), ...beat(1.1, 0.24), ...beat(2.2, 0.2), ...beat(3.5, 0.16),
        ],
        noise: [],
    },
    'abo-inject': {
        partials: [p('sine', 1800, 900, 0.02, 0.05, 0.12, { attack: 0.001, sweep: 1 })],
        noise: [n(0, 0.02, 0.6, { freq: 3200, q: 1.5, attack: 0.001 }), n(0.06, 0.4, 0.22, { filter: 'highpass', freq: 5000, q: 0.7, attack: 0.02 })],
    },
    'abo-patch': {
        partials: [p('sine', 90, 60, 0.26, 0.12, 0.3, { attack: 0.003, sweep: 1 })],
        noise: [n(0, 0.26, 0.3, { freq: 1800, freqTo: 900, q: 0.6, attack: 0.04 })],
    },
    'abo-warn': {
        partials: [pulse(880, 0, 0.12), pulse(880, 0.2, 0.12), pulse(660, 0.46, 0.14), p('sine', 55, 40, 0, 0.7, 0.2, { attack: 0.01, sweep: 1 })],
        noise: [],
    },
    'abo-bond': {
        partials: [p('sine', 80, 46, 0, 0.3, 0.4, { attack: 0.004, sweep: 1 }), ...bell(659, 0.18, 0.9, 0.06)],
        noise: [n(0, 0.12, 0.2, { filter: 'lowpass', freq: 700, q: 0.7, attack: 0.002 })],
    },
    'abo-seal': {
        partials: [p('sine', 74, 40, 0, 0.5, 0.45, { attack: 0.004, sweep: 1 }), ...bell(523, 1.1, 1.8, 0.1), ...bell(784, 1.2, 1.6, 0.08), ...bell(1047, 1.3, 1.4, 0.05)],
        noise: [n(1.05, 0.5, 0.12, { freq: 3500, freqTo: 5200, q: 1.2, attack: 0.1 })],
    },
    'abo-scan': {
        partials: Array.from({ length: 6 }, (_, i) => p('triangle', 1700, 1700, 0.9 + i * 0.12, 0.03, 0.08, { attack: 0.001 })),
        noise: [n(0, 0.9, 0.2, { freq: 600, freqTo: 3200, q: 1.8, attack: 0.1 })],
    },
    'abo-match': {
        partials: [523.25, 659.25, 783.99, 1046.5].flatMap((freq, i) => bell(freq, i * 0.16, 0.8, 0.09)),
        noise: [],
    },
    'abo-nest': {
        partials: [],
        noise: [0, 0.34, 0.7, 1.05].map((t, i) => n(t, 0.22, 0.2 - i * 0.02, { freq: 1500 + i * 300, freqTo: 800, q: 0.6, attack: 0.05 })),
    },
    'abo-inhale': {
        partials: [],
        noise: [n(0.2, 0.14, 0.22, { freq: 900, freqTo: 1900, q: 0.8, attack: 0.05 }), n(0.42, 0.2, 0.26, { freq: 800, freqTo: 2100, q: 0.8, attack: 0.07 })],
    },
    'abo-exhale': {
        partials: [],
        noise: [n(0, 1.7, 0.22, { freq: 1500, freqTo: 520, q: 0.6, attack: 0.4 })],
    },
    'abo-chomp': {
        partials: [p('sine', 118, 48, 0, 0.22, 0.46, { attack: 0.003, sweep: 1 })],
        noise: [n(0, 0.08, 0.34, { filter: 'lowpass', freq: 520, q: 0.7, attack: 0.002 }), n(0.02, 0.05, 0.22, { freq: 2300, q: 1.2, attack: 0.002 })],
    },
    'abo-cloth': {
        partials: [],
        noise: [0.1, 0.4, 0.62, 0.95, 1.2].map((t, i) => n(t, 0.2 + (i % 2) * 0.05, 0.14, { freq: 2400 - i * 160, freqTo: 1200, q: 0.5, attack: 0.07 })),
    },
    'abo-alarm': {
        partials: Array.from({ length: 8 }, (_, i) => p('square', i % 2 ? 988 : 740, i % 2 ? 988 : 740, i * 0.22, 0.2, 0.1, { attack: 0.01 })),
        noise: [],
    },
    'abo-pulse': {
        partials: [...beat(0, 0.34), ...beat(0.95, 0.3)],
        noise: [],
    },
});
