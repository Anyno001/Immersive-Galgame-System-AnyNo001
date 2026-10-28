// 神话妖魔包的合成音效：只描述振荡器与滤波噪声，播放由 fx-daily-sfx 的 DEFS 合并后统一负责。
const p = (wave, from, to, start, duration, gain, extra = {}) => Object.freeze({ wave, from, to, start, duration, gain, ...extra });
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
    p('sine', freq * 2.76, freq * 2.76, start, ring * 0.35, gain * 0.24, { attack: 0.002 }),
    p('sine', freq * 5.4, freq * 5.4, start, 0.14, gain * 0.1, { attack: 0.001 }),
];

const glints = (count, from, span, seed, lo = 1800, hi = 3200) => {
    const rand = seeded(seed);
    return Array.from({ length: count }, () => {
        const freq = lo + rand() * (hi - lo);
        return p('sine', freq, freq * 1.03, from + rand() * span, 0.22, 0.05 + rand() * 0.04, { attack: 0.006 });
    }).sort((a, b) => a.start - b.start);
};

const crackleRand = seeded(113);
const crackles = Array.from({ length: 14 }, () => n(0.2 + crackleRand() * 1.1, 0.014 + crackleRand() * 0.02, 0.16 + crackleRand() * 0.2, {
    filter: 'highpass', freq: 2600 + crackleRand() * 2000, q: 0.7, attack: 0.001,
})).sort((a, b) => a.start - b.start);

const rollNotes = [392, 440, 523.25, 587.33, 659.25, 783.99].flatMap((freq, i) => bellNote(freq, i * 0.34, 1.0, 0.26));
const heartbeat = [0, 0.42, 0.9, 1.32].flatMap((t, i) => [
    p('sine', 84, 52, t, 0.2, i % 2 ? 0.5 : 0.7, { attack: 0.006, sweep: 1 }),
    p('sine', 56, 44, t + 0.12, 0.2, i % 2 ? 0.3 : 0.4, { attack: 0.006, sweep: 1 }),
]);

export const MYTH_SFX_DEFS = Object.freeze({
    'myth-relic': {
        partials: [
            p('sine', 520, 1560, 0, 0.6, 0.34, { attack: 0.05, sweep: 1 }),
            p('triangle', 260, 780, 0, 0.5, 0.12, { attack: 0.05, sweep: 1 }),
            ...bellNote(1318.5, 0.5, 1.1, 0.3),
            ...glints(5, 0.55, 0.6, 5),
        ],
        noise: [n(0, 0.55, 0.25, { filter: 'bandpass', freq: 600, freqTo: 3200, q: 1.2, attack: 0.08 })],
    },
    'myth-clash': {
        partials: [
            p('sine', 130, 40, 0.62, 0.5, 0.9, { attack: 0.003, sweep: 1 }),
            p('sine', 700, 1400, 0, 0.6, 0.18, { attack: 0.04, sweep: 1 }),
            p('sine', 520, 330, 0.62, 0.9, 0.3, { attack: 0.002 }),
            p('sine', 1430, 1430, 0.62, 0.7, 0.18, { attack: 0.002 }),
            p('sine', 2760, 2760, 0.62, 0.35, 0.1, { attack: 0.001 }),
        ],
        noise: [
            n(0, 0.6, 0.3, { filter: 'bandpass', freq: 500, freqTo: 2400, q: 1, attack: 0.1 }),
            n(0.62, 0.5, 0.8, { filter: 'lowpass', freq: 3200, freqTo: 300, q: 0.7, attack: 0.002 }),
        ],
    },
    'myth-roll': {
        partials: rollNotes,
        noise: [n(0, 0.3, 0.2, { filter: 'bandpass', freq: 2200, q: 1.6, attack: 0.08 })],
    },
    'myth-formation': {
        partials: [
            p('sine', 110, 165, 0, 1.6, 0.4, { attack: 0.5, sweep: 1 }),
            p('triangle', 220, 330, 0, 1.4, 0.12, { attack: 0.5, sweep: 1 }),
            ...bellNote(880, 1.2, 1.2, 0.24),
            ...glints(9, 0.5, 1.0, 23, 2000, 3200),
        ],
        noise: [n(0.1, 1.5, 0.22, { filter: 'bandpass', freq: 400, freqTo: 1800, q: 1.4, attack: 0.6 })],
    },
    'myth-break': {
        partials: [
            p('sine', 160, 50, 0, 0.4, 0.7, { attack: 0.002, sweep: 1 }),
            ...glints(9, 0.04, 0.7, 17, 2400, 4800),
        ],
        noise: [
            n(0, 0.5, 0.7, { filter: 'highpass', freq: 3000, freqTo: 1200, q: 0.8, attack: 0.002 }),
            n(0, 0.3, 0.5, { filter: 'lowpass', freq: 1200, freqTo: 200, q: 0.7, attack: 0.002 }),
        ],
    },
    'myth-flame': {
        partials: [p('sine', 90, 60, 0, 1.4, 0.3, { attack: 0.12, sweep: 1 })],
        noise: [
            n(0, 1.8, 0.7, { filter: 'lowpass', freq: 500, freqTo: 1400, q: 0.8, attack: 0.18 }),
            n(0.3, 1.6, 0.3, { filter: 'bandpass', freq: 900, q: 0.7, attack: 0.3 }),
            ...crackles,
        ],
    },
    'myth-thunder': {
        partials: [
            p('sine', 70, 38, 0.02, 1.4, 0.85, { attack: 0.01, sweep: 1 }),
            p('sine', 110, 55, 0.2, 1.8, 0.4, { attack: 0.05, sweep: 1 }),
        ],
        noise: [
            n(0, 0.35, 0.95, { filter: 'highpass', freq: 2500, freqTo: 800, q: 0.7, attack: 0.001 }),
            n(0.08, 2.2, 0.5, { filter: 'lowpass', freq: 700, freqTo: 120, q: 0.7, attack: 0.05 }),
        ],
    },
    'myth-aura': {
        partials: [
            p('sine', 64, 52, 0, 2.0, 0.5, { attack: 0.8, sweep: 1 }),
            p('sine', 96, 78, 0.1, 1.8, 0.2, { attack: 0.8, sweep: 1 }),
            p('sine', 440, 405, 0.8, 1.4, 0.05, { attack: 0.5, sweep: 1 }),
        ],
        noise: [n(0, 2.2, 0.28, { filter: 'lowpass', freq: 300, freqTo: 180, q: 0.8, attack: 0.9 })],
    },
    'myth-charm': {
        partials: [
            p('sine', 880, 880, 0, 1.4, 0.22, { attack: 0.08 }),
            p('sine', 887, 887, 0, 1.4, 0.2, { attack: 0.08 }),
            p('sine', 1318.5, 1330, 0.3, 1.2, 0.12, { attack: 0.1 }),
            ...glints(6, 0.2, 1.0, 29, 1600, 2600),
        ],
        noise: [n(0, 1.4, 0.12, { filter: 'bandpass', freq: 3200, q: 3, attack: 0.5 })],
    },
    'myth-drain': {
        partials: [
            p('sine', 900, 180, 0, 1.6, 0.3, { attack: 0.05, sweep: 1 }),
            p('triangle', 450, 90, 0.1, 1.5, 0.12, { attack: 0.05, sweep: 1 }),
            p('sine', 70, 56, 1.0, 0.8, 0.4, { attack: 0.1, sweep: 1 }),
        ],
        noise: [n(0, 1.7, 0.26, { filter: 'bandpass', freq: 3000, freqTo: 500, q: 1.3, attack: 0.1 })],
    },
    // 符咒：黄纸拍上，朱砂一震，余下一缕嗡鸣。
    'myth-seal-talisman': {
        partials: [p('sine', 170, 80, 0.36, 0.26, 0.6, { attack: 0.003, sweep: 1 }), p('sine', 392, 392, 0.4, 1.1, 0.1, { attack: 0.08 }), ...glints(3, 0.45, 0.3, 41, 2400, 3600)],
        noise: [n(0, 0.36, 0.3, { filter: 'highpass', freq: 3200, freqTo: 5200, q: 0.7, attack: 0.15 }), n(0.36, 0.08, 0.5, { filter: 'lowpass', freq: 1100, q: 0.8, attack: 0.001 })],
    },
    // 金钵：钵口罩下，一声悠长的钟磬，由高落低。
    'myth-seal-bowl': {
        partials: [p('sine', 220, 120, 0.4, 0.5, 0.6, { attack: 0.004, sweep: 1 }), ...bellNote(523.25, 0.42, 1.8, 0.3), p('sine', 130.8, 128, 0.42, 1.8, 0.14, { attack: 0.03 })],
        noise: [n(0, 0.4, 0.3, { filter: 'bandpass', freq: 700, freqTo: 400, q: 0.9, attack: 0.15 }), n(0.4, 0.06, 0.4, { filter: 'lowpass', freq: 1500, q: 0.8, attack: 0.001 })],
    },
    // 葫芦：拔塞的一声「啵」，随后是被吸入的呼啸。
    'myth-seal-gourd': {
        partials: [p('sine', 260, 640, 0, 0.18, 0.4, { attack: 0.004, sweep: 1 }), p('sine', 900, 180, 0.2, 0.6, 0.3, { attack: 0.02, sweep: 1 }), p('sine', 120, 70, 0.8, 0.2, 0.4, { attack: 0.003, sweep: 1 })],
        noise: [n(0.2, 0.62, 0.34, { filter: 'bandpass', freq: 2600, freqTo: 500, q: 1.2, attack: 0.05 })],
    },
    // 锁链：铁环依次绷直，末了一记落锁。
    'myth-seal-chain': {
        partials: [...[0, 1, 2, 3].map((i) => p('triangle', 1500 + i * 180, 1100 + i * 100, 0.1 + i * 0.12, 0.06, 0.2, { attack: 0.001, sweep: 1 })), p('sine', 95, 50, 0.7, 0.4, 0.6, { attack: 0.003, sweep: 1 }), p('triangle', 1650, 1250, 0.82, 0.09, 0.2, { attack: 0.001, sweep: 1 })],
        noise: [...[0, 1, 2, 3].map((i) => n(0.1 + i * 0.12, 0.04, 0.34, { freq: 3000, q: 2 })), n(0.7, 0.25, 0.5, { filter: 'lowpass', freq: 420, q: 0.7 })],
    },
    'myth-seal': {
        partials: [
            p('sine', 150, 70, 0.38, 0.3, 0.7, { attack: 0.003, sweep: 1 }),
            ...bellNote(1046.5, 0.4, 0.9, 0.26),
            ...glints(4, 0.45, 0.4, 37),
        ],
        noise: [
            n(0, 0.38, 0.4, { filter: 'bandpass', freq: 1800, freqTo: 3000, q: 1, attack: 0.15 }),
            n(0.38, 0.1, 0.5, { filter: 'lowpass', freq: 900, q: 0.8, attack: 0.001 }),
        ],
    },
    'myth-barrier': {
        partials: [
            p('sine', 220, 440, 0, 1.0, 0.3, { attack: 0.3, sweep: 1 }),
            p('triangle', 330, 660, 0, 0.9, 0.1, { attack: 0.3, sweep: 1 }),
            ...bellNote(1174.7, 0.9, 1.0, 0.22),
        ],
        noise: [n(0.2, 0.9, 0.18, { filter: 'bandpass', freq: 800, freqTo: 2600, q: 1.2, attack: 0.4 })],
    },
    'myth-core': {
        partials: [
            ...heartbeat,
            ...bellNote(1568, 1.6, 1.3, 0.22),
            ...glints(5, 1.6, 0.8, 41),
        ],
        noise: [],
    },
    'myth-pact': {
        partials: [
            ...bellNote(196, 0, 2.0, 0.34),
            ...bellNote(293.66, 0.5, 1.8, 0.28),
            p('sine', 60, 48, 0.9, 0.9, 0.4, { attack: 0.15, sweep: 1 }),
            ...glints(4, 1.0, 0.6, 43, 1400, 2200),
        ],
        noise: [n(0.8, 0.9, 0.12, { filter: 'bandpass', freq: 1200, freqTo: 700, q: 2, attack: 0.3 })],
    },
});
