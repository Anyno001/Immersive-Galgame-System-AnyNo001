// 直白亲密包的合成音效：心跳、衣料、脚步、提示音都用滤波噪声加短正弦合成，写法同 fx-daily-sfx。
// partial 与 chat-sfx 同形；本地定义是为避开 chat-sfx -> scene-audio -> fx-packs 的循环引用。
const p = (wave, from, to, start, duration, gain, extra = {}) => Object.freeze({ wave, from, to, start, duration, gain, ...extra });

const n = (start, duration, gain, extra = {}) => Object.freeze({ start, duration, gain, filter: 'bandpass', freq: 2000, q: 1, attack: 0.002, ...extra });

// 一次心跳：「咚—咚」两下，第二下略轻略低。
const lubdub = (start, gain = 0.8, scale = 1) => [
    p('sine', 72, 44, start, 0.16 * scale, gain, { attack: 0.004, sweep: 1 }),
    p('sine', 62, 40, start + 0.17 * scale, 0.18 * scale, gain * 0.72, { attack: 0.004, sweep: 1 }),
];

const beats = (count, gap, gain) => Array.from({ length: count }, (_, i) => lubdub(i * gap, gain * (1 - i * 0.06))).flat();

const step = (start, gain, freq = 380) => [
    n(start, 0.06, gain, { filter: 'lowpass', freq, q: 0.9, attack: 0.002 }),
    n(start + 0.012, 0.03, gain * 0.35, { freq: 2200, q: 1.3, attack: 0.001 }),
];

export const NSFW_SFX_DEFS = Object.freeze({
    // 档位越高，心跳越多越重；最高档末尾收一记低沉的余振。
    'nsfw-peak1': { partials: beats(2, 0.62, 0.7), noise: [n(0, 0.5, 0.1, { filter: 'lowpass', freq: 900, q: 0.7, attack: 0.1 })] },
    'nsfw-peak2': {
        partials: [...beats(3, 0.52, 0.8), p('sine', 160, 90, 0, 0.9, 0.12, { attack: 0.15, sweep: 1 })],
        noise: [n(0, 0.7, 0.16, { filter: 'lowpass', freq: 1200, freqTo: 400, q: 0.7, attack: 0.15 })],
    },
    'nsfw-peak3': {
        partials: [
            ...beats(4, 0.44, 0.9),
            p('sine', 220, 70, 0, 1.4, 0.18, { attack: 0.08, sweep: 1 }),
            p('sine', 55, 38, 1.7, 1.2, 0.3, { attack: 0.02, sweep: 1 }),
        ],
        noise: [n(0, 1.1, 0.22, { filter: 'lowpass', freq: 1600, freqTo: 300, q: 0.7, attack: 0.1 }), n(0.02, 0.35, 0.18, { filter: 'highpass', freq: 3000, q: 0.7, attack: 0.01, env: 'flat' })],
    },
    // 计数：木牌上一笔刻痕，轻叩加一声收尾的清响。
    'nsfw-count': {
        partials: [p('sine', 1180, 1180, 0.3, 0.12, 0.2, { attack: 0.002 }), p('sine', 1760, 1760, 0.37, 0.16, 0.14, { attack: 0.002 }), p('sine', 240, 150, 0.24, 0.1, 0.22, { attack: 0.002, sweep: 1 })],
        noise: [n(0.24, 0.05, 0.16, { filter: 'bandpass', freq: 1800, q: 1.4, attack: 0.001, env: 'flat' })],
    },
    'nsfw-after': { partials: [p('sine', 196, 180, 0, 1.4, 0.1, { attack: 0.4 })], noise: [n(0, 1.4, 0.12, { filter: 'lowpass', freq: 700, freqTo: 260, q: 0.7, attack: 0.4 })] },
    // 床幔：绸缎滑动的轻响，加一点烛芯爆花。
    'nsfw-curtain': {
        partials: [],
        noise: [
            n(0, 0.7, 0.2, { filter: 'highpass', freq: 3200, freqTo: 2200, q: 0.7, attack: 0.18 }),
            n(0.9, 0.02, 0.35, { filter: 'highpass', freq: 3600, q: 0.7, attack: 0.001, env: 'flat' }),
        ],
    },
    // 双修：由低渐高的清越长音，两条不同步的泛音交缠。
    'nsfw-cult': {
        partials: [
            p('sine', 262, 330, 0, 2.2, 0.22, { attack: 0.5, sweep: 1 }),
            p('sine', 392, 440, 0.3, 2.0, 0.14, { attack: 0.5, sweep: 1 }),
            p('sine', 1046, 1046, 0.9, 0.9, 0.06, { attack: 0.02 }),
        ],
        noise: [],
    },
    'nsfw-tip-down': {
        partials: [p('sine', 700, 700, 0, 0.14, 0.24, { attack: 0.002 }), p('sine', 466, 466, 0.1, 0.26, 0.22, { attack: 0.002 })],
        noise: [],
    },
    'nsfw-tip': {
        partials: [p('sine', 880, 880, 0, 0.14, 0.26, { attack: 0.002 }), p('sine', 1318, 1318, 0.1, 0.24, 0.22, { attack: 0.002 })],
        noise: [],
    },
    'nsfw-sigil': {
        partials: [p('sine', 330, 495, 0, 1.3, 0.2, { attack: 0.25, sweep: 1 }), p('triangle', 660, 990, 0.1, 1.1, 0.06, { attack: 0.25, sweep: 1 })],
        noise: [n(0, 1.2, 0.08, { filter: 'highpass', freq: 5000, q: 0.7, attack: 0.3 })],
    },
    // 门外脚步：木地板上软底鞋，由远及近逐步变响。
    'nsfw-footfall': {
        partials: [],
        noise: [0.0, 0.55, 1.1, 1.62, 2.12].flatMap((t, i) => step(t, 0.12 + i * 0.07, 300 + i * 40)),
    },
    'nsfw-footfall-leave': {
        partials: [],
        noise: [0.0, 0.5, 1.02, 1.6, 2.25].flatMap((t, i) => step(t, 0.4 - i * 0.07, 380 - i * 40)),
    },
    'nsfw-knot': {
        partials: [p('sine', 174, 160, 0, 2.4, 0.16, { attack: 0.6 }), p('sine', 261, 246, 0.4, 2.0, 0.08, { attack: 0.6 })],
        noise: [n(0, 2.2, 0.08, { filter: 'lowpass', freq: 600, q: 0.7, attack: 0.6 })],
    },
    // 胎心：比成人心跳快一倍的细小双响。
    'nsfw-fetal': {
        partials: Array.from({ length: 8 }, (_, i) => [
            p('sine', 190, 150, i * 0.4, 0.08, 0.34, { attack: 0.003, sweep: 1 }),
            p('sine', 170, 140, i * 0.4 + 0.11, 0.08, 0.26, { attack: 0.003, sweep: 1 }),
        ]).flat(),
        noise: Array.from({ length: 8 }, (_, i) => n(i * 0.4, 0.2, 0.06, { filter: 'bandpass', freq: 600, q: 1.2, attack: 0.01 })),
    },
});
