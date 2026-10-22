// 武侠江湖包的合成音效：只描述振荡器与滤波噪声，播放由 fx-daily-sfx 合并后统一负责。单项增益不超过 0.4，时长不超过 5s。
const p = (wave, from, to, start, duration, gain, extra = {}) => Object.freeze({ wave, from, to, start, duration, gain, ...extra });
const n = (start, duration, gain, extra = {}) => Object.freeze({ start, duration, gain, filter: 'bandpass', freq: 2000, q: 1, attack: 0.002, ...extra });
// 磬：基音加两个非整数泛音，长尾；鼓：低频下滑。
const qing = (freq, start, gain) => [
    p('sine', freq, freq, start, 2.2, gain, { attack: 0.003 }),
    p('sine', freq * 2.71, freq * 2.71, start, 0.9, gain * 0.3, { attack: 0.002 }),
    p('sine', freq * 4.16, freq * 4.16, start, 0.4, gain * 0.12, { attack: 0.001 }),
];
const drum = (start, gain) => [
    p('sine', 110, 48, start, 0.5, gain, { attack: 0.004, sweep: 1 }),
    p('triangle', 70, 40, start, 0.35, gain * 0.4, { attack: 0.004, sweep: 1 }),
];

export const WUXIA_SFX_DEFS = Object.freeze({
    'wx-name': { partials: [...drum(0, 0.38), ...qing(523.25, 1.2, 0.22)], noise: [n(0, 0.4, 0.18, { filter: 'lowpass', freq: 900, q: 0.7 })] },
    'wx-palm': {
        partials: [p('sine', 90, 120, 0, 1.3, 0.2, { attack: 0.3, sweep: 1 }), ...drum(1.4, 0.4)],
        noise: [n(0, 1.3, 0.12, { filter: 'lowpass', freq: 400, freqTo: 1200, q: 0.8, attack: 0.4 }), n(1.4, 0.5, 0.35, { filter: 'lowpass', freq: 2600, freqTo: 300, q: 0.7 })],
    },
    'wx-dart': {
        partials: [p('sine', 2600, 1800, 0, 0.12, 0.12, { attack: 0.001, sweep: 1 }), p('triangle', 900, 700, 0.38, 0.12, 0.25, { attack: 0.001 })],
        noise: [0, 0.07, 0.14, 0.21].map((t) => n(t, 0.12, 0.2, { filter: 'highpass', freq: 3600, q: 0.8, attack: 0.001 })),
    },
    'wx-manual': { partials: qing(659.25, 0.5, 0.2), noise: [n(0, 0.45, 0.16, { filter: 'bandpass', freq: 1800, freqTo: 900, q: 0.9, attack: 0.05 })] },
    'wx-token': { partials: [...drum(0.3, 0.34), p('triangle', 420, 380, 0.3, 0.3, 0.16, { attack: 0.002 })], noise: [n(0.3, 0.2, 0.2, { freq: 1400, q: 1.4 })] },
    'wx-oath': { partials: [...qing(392, 0.3, 0.22), ...qing(587.33, 1.1, 0.2)], noise: [n(0.3, 0.3, 0.08, { freq: 1200, q: 2, attack: 0.01 })] },
    'wx-mad': {
        partials: [p('sawtooth', 80, 60, 0, 2.2, 0.12, { attack: 0.2, sweep: 1 }), p('sine', 160, 90, 0.3, 1.8, 0.18, { attack: 0.1, sweep: 1 })],
        noise: [n(0, 2.4, 0.22, { filter: 'lowpass', freq: 300, freqTo: 1600, q: 1.2, attack: 0.3 })],
    },
});
