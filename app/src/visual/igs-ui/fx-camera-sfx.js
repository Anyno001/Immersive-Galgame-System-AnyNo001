const p = (wave, from, to, start, duration, gain, extra = {}) => Object.freeze({ wave, from, to, start, duration, gain, ...extra });
const n = (start, duration, gain, extra = {}) => Object.freeze({ start, duration, gain, filter: 'bandpass', freq: 2000, q: 1, attack: 0.002, ...extra });

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const bell = (freq, start, ring, gain) => [
    p('sine', freq, freq, start, ring, gain, { attack: 0.006 }),
    p('sine', freq * 2, freq * 2, start, ring * 0.4, gain * 0.2, { attack: 0.004 }),
];

const tickRand = seeded(523);
const clockTicks = Array.from({ length: 14 }, (_, i) => n(i * 0.1 + tickRand() * 0.01, 0.02, 0.2 + i * 0.012, { filter: 'highpass', freq: 3200 + i * 90, q: 0.8, attack: 0.001 }));
const leafRand = seeded(809);
const leafRustle = Array.from({ length: 9 }, () => n(leafRand() * 0.5, 0.05 + leafRand() * 0.06, 0.1 + leafRand() * 0.1, { filter: 'bandpass', freq: 3000 + leafRand() * 2200, q: 0.9, attack: 0.008 }));

export const CAMERA_SFX_DEFS = Object.freeze({
    'cm-whoosh': {
        partials: [],
        noise: [n(0, 0.55, 0.3, { filter: 'bandpass', freq: 400, freqTo: 3200, q: 0.8, attack: 0.18, env: 'flat' })],
    },
    'cm-whip': {
        partials: [p('sine', 900, 200, 0, 0.22, 0.08, { attack: 0.004, sweep: 1 })],
        noise: [n(0, 0.32, 0.42, { filter: 'highpass', freq: 900, freqTo: 4800, q: 0.7, attack: 0.04 }), n(0.28, 0.12, 0.2, { filter: 'lowpass', freq: 600, q: 0.8, attack: 0.002 })],
    },
    'cm-swish': {
        partials: [],
        noise: [n(0, 0.45, 0.26, { filter: 'bandpass', freq: 700, freqTo: 1800, q: 1.2, attack: 0.14 }), ...leafRustle.slice(0, 3)],
    },
    'cm-leaf': { partials: [], noise: leafRustle },
    'cm-flare': {
        partials: [...bell(1760, 0, 1.5, 0.05), ...bell(2349, 0.12, 1.3, 0.04), ...bell(2960, 0.26, 1.1, 0.03)],
        noise: [n(0, 1.1, 0.06, { filter: 'highpass', freq: 5200, q: 0.7, attack: 0.4, env: 'flat' })],
    },
    'cm-cell': {
        partials: [p('sine', 190, 80, 0, 0.1, 0.22, { attack: 0.001, sweep: 1 })],
        noise: [n(0, 0.035, 0.4, { freq: 2600, q: 1.4, attack: 0.001 }), n(0.015, 0.05, 0.16, { filter: 'lowpass', freq: 700, q: 0.8, attack: 0.001 })],
    },
    'cm-thud': {
        partials: [p('sine', 95, 38, 0, 0.34, 0.5, { attack: 0.003, sweep: 1 })],
        noise: [n(0, 0.2, 0.3, { filter: 'lowpass', freq: 420, freqTo: 120, q: 0.8, attack: 0.002 })],
    },
    'cm-thunder': {
        partials: [p('sine', 70, 34, 0.1, 1.4, 0.14, { attack: 0.2, sweep: 1 })],
        noise: [
            n(0, 0.08, 0.5, { filter: 'highpass', freq: 2400, q: 0.7, attack: 0.001 }),
            n(0.05, 2.4, 0.46, { filter: 'lowpass', freq: 380, freqTo: 80, q: 0.7, attack: 0.08 }),
        ],
    },
    'cm-door': {
        partials: [p('sine', 130, 70, 0, 0.14, 0.34, { attack: 0.002, sweep: 1 })],
        noise: [n(0, 0.05, 0.36, { filter: 'lowpass', freq: 800, q: 1.1, attack: 0.001 }), n(0.07, 0.03, 0.2, { freq: 2400, q: 4, attack: 0.001 })],
    },
    'cm-creak': {
        partials: [p('triangle', 170, 340, 0, 0.32, 0.05, { attack: 0.06, sweep: 1 }), p('triangle', 340, 230, 0.32, 0.4, 0.045, { attack: 0.02, sweep: 1 })],
        noise: [n(0, 0.72, 0.1, { filter: 'bandpass', freq: 520, freqTo: 900, q: 6, attack: 0.1 })],
    },
    'cm-title': {
        partials: [...bell(523.25, 0, 1.8, 0.16), ...bell(783.99, 0.2, 2.2, 0.12)],
        noise: [n(0, 0.4, 0.04, { filter: 'highpass', freq: 4000, q: 0.7, attack: 0.15 })],
    },
    'cm-tick': {
        partials: [p('sine', 400, 1600, 0, 1.4, 0.04, { attack: 0.3, sweep: 1 })],
        noise: clockTicks,
    },
    'cm-montage-2': { partials: [], noise: [0, 0.25].map((at) => n(at, 0.04, 0.34, { filter: 'bandpass', freq: 2400, q: 1.4, attack: 0.001 })) },
    'cm-montage-3': { partials: [], noise: [0, 0.25, 0.5].map((at) => n(at, 0.04, 0.34, { filter: 'bandpass', freq: 2400, q: 1.4, attack: 0.001 })) },
    'cm-montage-4': { partials: [], noise: [0, 0.25, 0.5, 0.75].map((at) => n(at, 0.04, 0.34, { filter: 'bandpass', freq: 2400, q: 1.4, attack: 0.001 })) },
    'cm-chase-escape': {
        partials: [p('sine', 130, 70, 3.1, 0.16, 0.34, { attack: 0.002, sweep: 1 })],
        noise: [n(0, 1.2, 0.2, { filter: 'bandpass', freq: 500, freqTo: 2800, q: 0.8, attack: 0.4, env: 'flat' }), n(3.1, 0.05, 0.36, { filter: 'lowpass', freq: 800, q: 1.1, attack: 0.001 }), n(3.2, 0.5, 0.1, { filter: 'lowpass', freq: 300, q: 0.7, attack: 0.1 })],
    },
    'cm-chase-caught': {
        partials: [p('sine', 95, 38, 3, 0.34, 0.52, { attack: 0.003, sweep: 1 })],
        noise: [n(0, 1.4, 0.2, { filter: 'bandpass', freq: 500, freqTo: 2400, q: 0.8, attack: 0.4, env: 'flat' }), n(3, 0.12, 0.44, { filter: 'highpass', freq: 2400, q: 0.7, attack: 0.001 }), n(3.2, 0.4, 0.2, { filter: 'bandpass', freq: 800, freqTo: 1500, q: 0.9, attack: 0.15 })],
    },
    'cm-chase-saved': {
        partials: [...bell(1318.5, 3, 1.4, 0.12), ...bell(1760, 3.15, 1.3, 0.1)],
        noise: [n(0, 1.2, 0.18, { filter: 'bandpass', freq: 500, freqTo: 2400, q: 0.8, attack: 0.4, env: 'flat' }), n(3, 1.6, 0.08, { filter: 'bandpass', freq: 600, freqTo: 300, q: 0.6, attack: 0.5, env: 'flat' })],
    },
    'cm-gasp': {
        partials: [],
        noise: [n(0, 0.35, 0.18, { filter: 'bandpass', freq: 700, freqTo: 1500, q: 0.9, attack: 0.18 })],
    },
});
