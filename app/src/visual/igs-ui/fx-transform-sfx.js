// 立绘变形层的合成音效：镜面清响、水滴、磨砂、屏幕电流、故障噪声、元神与兽形低吼都用滤波噪声加少量正弦合成。
// 写法同 fx-daily-sfx：振荡器 partial 与 chat-sfx 的 createSynthPartial 同形。chat-sfx 经 scene-audio 会回头 import 题材包登记，
// 清单的辅助文件不能 import 它（成环），所以 p 在本文件内自备。
const p = (wave, from, to, start, duration, gain, extra = {}) => Object.freeze({ wave, from, to, start, duration, gain, ...extra });

const n = (start, duration, gain, extra = {}) => Object.freeze({ start, duration, gain, filter: 'bandpass', freq: 2000, q: 1, attack: 0.002, ...extra });

const bell = (freq, start, ring, gain) => [
    p('sine', freq, freq, start, ring, gain, { attack: 0.004 }),
    p('sine', freq * 2.76, freq * 2.76, start, ring * 0.35, gain * 0.26, { attack: 0.002 }),
    p('sine', freq * 5.4, freq * 5.4, start, ring * 0.15, gain * 0.12, { attack: 0.001 }),
];

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const dropRand = seeded(731);
const drops = Array.from({ length: 5 }, (_, i) => {
    const at = 0.1 + i * 0.34 + dropRand() * 0.16;
    const f = 520 + dropRand() * 420;
    return p('sine', f * 1.6, f, at, 0.14, 0.2, { attack: 0.002, sweep: 1 });
});

const glitchRand = seeded(977);
const glitchBursts = Array.from({ length: 6 }, (_, i) => n(i * 0.13 + glitchRand() * 0.05, 0.04 + glitchRand() * 0.06, 0.4, {
    filter: i % 2 ? 'highpass' : 'bandpass', freq: 1800 + glitchRand() * 3600, q: 1.4, attack: 0.001,
}));

export const TRANSFORM_SFX_DEFS = Object.freeze({
    // 镜面：一记清亮的玻璃「叮」，尾音带一点上升的闪光。
    xfglass: {
        partials: [...bell(1568, 0, 1.3, 0.16), ...bell(2093, 0.18, 1.0, 0.1)],
        noise: [n(0.05, 0.6, 0.05, { filter: 'highpass', freq: 5200, freqTo: 8000, q: 0.6, attack: 0.15 })],
    },
    // 水面倒影：几声不均匀的水滴。
    xfdrop: {
        partials: drops,
        noise: [n(0, 1.8, 0.04, { filter: 'lowpass', freq: 700, q: 0.6, attack: 0.4 })],
    },
    // 磨砂玻璃与逆光：隔着一层的低通气声，像水汽里的人影。
    xffrost: {
        partials: [p('sine', 196, 220, 0, 1.4, 0.05, { attack: 0.4 })],
        noise: [n(0, 1.5, 0.1, { filter: 'lowpass', freq: 900, freqTo: 400, q: 0.7, attack: 0.3 })],
    },
    // 监控与全息：电流「嘀」一声开机，带一点扫描的高频沙沙。
    xfscreen: {
        partials: [p('square', 1200, 1200, 0, 0.06, 0.05, { attack: 0.001 }), p('sine', 320, 880, 0.08, 0.5, 0.08, { attack: 0.03, sweep: 1 })],
        noise: [n(0.05, 0.5, 0.1, { filter: 'highpass', freq: 4000, q: 0.7, attack: 0.05 })],
    },
    // 回忆：柔和的两声上行铃音，像旧时光慢慢亮起。
    xfmemory: {
        partials: [...bell(659.25, 0, 1.4, 0.14), ...bell(880, 0.32, 1.6, 0.12)],
        noise: [n(0, 1.0, 0.04, { filter: 'highpass', freq: 3500, q: 0.6, attack: 0.3 })],
    },
    // 局部特写：镜头对焦的短促「咔——」与一道很轻的推近气声。
    xfzoom: {
        partials: [p('triangle', 1500, 1100, 0, 0.04, 0.12, { attack: 0.001, sweep: 1 }), p('sine', 260, 520, 0.06, 0.35, 0.05, { attack: 0.05, sweep: 1 })],
        noise: [n(0.02, 0.3, 0.12, { filter: 'bandpass', freq: 2600, freqTo: 4200, q: 0.8, attack: 0.05 })],
    },
    // 贴片浮现：一点柔软的「噗」。
    xfmark: {
        partials: [p('sine', 330, 190, 0, 0.18, 0.16, { attack: 0.004, sweep: 1 }), ...bell(988, 0.06, 0.5, 0.05)],
        noise: [n(0, 0.12, 0.08, { filter: 'lowpass', freq: 800, q: 0.8, attack: 0.002 })],
    },
    // 异化：一串断续的噪声碎响，底下压一条失真的低音。
    xfglitch: {
        partials: [p('sawtooth', 90, 60, 0, 0.8, 0.07, { attack: 0.01, sweep: 0.8 })],
        noise: glitchBursts,
    },
    // 元神出窍：一道清冷的上升气流，尾部散成细碎的高泛音。
    xfspirit: {
        partials: [p('sine', 440, 1320, 0, 1.6, 0.08, { attack: 0.3, sweep: 1 }), ...bell(1760, 0.9, 1.4, 0.07)],
        noise: [n(0, 1.8, 0.09, { filter: 'bandpass', freq: 1200, freqTo: 4200, q: 0.6, attack: 0.5 })],
    },
});
