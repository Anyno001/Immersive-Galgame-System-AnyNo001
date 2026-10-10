// 在家玩游戏机的合成音效：芯片方波（过低通去刺耳）+ 三角波低音 + 钟音泛音 + 噪声点击，不用纯正弦 beep。
// 包络与 fx-daily-sfx 一致：每个音有起音与衰减（衰减到 peak*FLOOR，不 ramp 到 0），播放时的音高 / 增益 / 起始随机化由它的 jittered 统一加。
// 增益对齐同类日常音效：振荡器 0.3~0.6、噪声 0.35~0.7，乘上 TONE_GAIN / NOISE_GAIN 后峰值约 0.1~0.25。
import { createSynthPartial as p } from './chat-sfx.js';

const n = (start, duration, gain, extra = {}) => Object.freeze({ start, duration, gain, filter: 'bandpass', freq: 2000, q: 1, attack: 0.002, ...extra });

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// 芯片音：方波 + 低通，起音极快。
const chip = (freq, start, ring, gain, extra = {}) => p('square', freq, freq, start, ring, gain, { attack: 0.003, lowpass: 3200, ...extra });
// 钟音：基频 + 非谐泛音，用于胜利 / 开机的收尾闪光。
const bellNote = (freq, start, ring, gain) => [
    p('sine', freq, freq, start, ring, gain, { attack: 0.004 }),
    p('sine', freq * 2, freq * 2, start, ring * 0.45, gain * 0.22, { attack: 0.003 }),
    p('sine', freq * 2.76, freq * 2.76, start, 0.3, gain * 0.28, { attack: 0.002 }),
    p('sine', freq * 5.4, freq * 5.4, start, 0.12, gain * 0.14, { attack: 0.001 }),
];
// 手柄按键：清脆的塑料「嗒」加键帽闷响。
const padClick = (start, gain = 0.5) => [
    n(start, 0.02, gain, { freq: 3200, q: 1.6, attack: 0.001 }),
    n(start + 0.003, 0.05, gain * 0.7, { filter: 'lowpass', freq: 460, q: 0.8, attack: 0.002 }),
];

// 16 下按键，间隔越来越短（越按越快），音高沿五声音阶往上蹿，间隔与音高带随机。
const comboRand = seeded(131);
const COMBO_SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637, 3135.96, 3520, 4186];
let comboAt = 0;
const comboTicks = COMBO_SCALE.map((freq, i) => {
    comboAt += (0.1 - i * 0.004) * (0.85 + comboRand() * 0.3);
    const start = comboAt;
    return { tone: chip(freq * (0.99 + comboRand() * 0.02), start, 0.06, 0.32, { lowpass: 3800 }), click: padClick(start, 0.3 + comboRand() * 0.2) };
});
const comboEnd = comboAt + 0.08;

export const GAME_SFX_DEFS = Object.freeze({
    // 开机：显像管「啪」一声通电，芯片琶音向上，收在一记钟音闪光。
    'game-boot': {
        partials: [
            p('sine', 95, 48, 0, 0.3, 0.55, { attack: 0.004, sweep: 1 }),
            chip(523.25, 0.3, 0.14, 0.34), chip(659.25, 0.4, 0.14, 0.34), chip(783.99, 0.5, 0.14, 0.34), chip(1046.5, 0.6, 0.3, 0.36),
            p('triangle', 261.63, 261.63, 0.3, 0.6, 0.3, { attack: 0.01 }),
            ...bellNote(1568, 0.62, 0.9, 0.3),
        ],
        noise: [
            n(0, 0.05, 0.6, { filter: 'highpass', freq: 3200, q: 0.7, attack: 0.001 }),
            n(0.02, 0.28, 0.4, { freq: 900, freqTo: 6000, q: 0.7, attack: 0.02 }),
            n(0.05, 0.9, 0.12, { filter: 'lowpass', freq: 380, freqTo: 200, q: 0.7, attack: 0.1 }),
        ],
    },
    // 胜利：四音上行的小号式短句，末音长鸣，三角波垫一个三度，最后撒一把闪光。
    'game-win': {
        partials: [
            chip(392, 0, 0.12, 0.38), chip(523.25, 0.13, 0.12, 0.38), chip(659.25, 0.26, 0.12, 0.38), chip(783.99, 0.4, 0.7, 0.42, { vibrato: { rate: 6, depth: 0.012 } }),
            p('triangle', 196, 196, 0, 1.0, 0.34, { attack: 0.01 }),
            p('triangle', 987.77, 987.77, 0.4, 0.7, 0.2, { attack: 0.01 }),
            ...bellNote(1567.98, 0.46, 1.0, 0.26),
            ...bellNote(2093, 0.62, 0.8, 0.18),
        ],
        noise: [n(0.4, 0.05, 0.4, { filter: 'highpass', freq: 5000, q: 0.7, attack: 0.001 })],
    },
    // 失败：音高一级级往下掉，末音拖着下滑的哀鸣，一记闷响收尾。
    'game-lose': {
        partials: [
            chip(392, 0, 0.16, 0.36, { lowpass: 2400 }), chip(349.23, 0.2, 0.16, 0.36, { lowpass: 2400 }), chip(311.13, 0.4, 0.16, 0.36, { lowpass: 2400 }),
            p('square', 261.63, 130.81, 0.6, 0.8, 0.38, { attack: 0.006, sweep: 1, lowpass: 1800 }),
            p('triangle', 130.81, 98, 0.6, 0.8, 0.3, { attack: 0.01, sweep: 1 }),
            p('sine', 90, 50, 1.35, 0.3, 0.5, { attack: 0.004, sweep: 1 }),
        ],
        noise: [n(1.35, 0.1, 0.5, { filter: 'lowpass', freq: 500, q: 0.8, attack: 0.002 })],
    },
    // 平局：两声平平的提示音，再落到一个中性的低音。
    'game-draw': {
        partials: [
            chip(523.25, 0, 0.12, 0.36), chip(523.25, 0.18, 0.12, 0.36), chip(440, 0.38, 0.4, 0.36),
            p('triangle', 220, 220, 0.38, 0.5, 0.3, { attack: 0.01 }),
        ],
        noise: [n(0, 0.03, 0.4, { freq: 3000, q: 1.4, attack: 0.001 })],
    },
    // 对战开场：「预备 预备 开打」两声短促方波然后一记重击，余下金属铛的一声。
    'game-versus': {
        partials: [
            chip(329.63, 0, 0.1, 0.36), chip(329.63, 0.22, 0.1, 0.36), chip(659.25, 0.44, 0.4, 0.42),
            p('sine', 78, 38, 0.44, 0.55, 0.6, { attack: 0.003, sweep: 1 }),
            p('sawtooth', 164.81, 164.81, 0.44, 0.45, 0.22, { attack: 0.005, lowpass: 900 }),
            ...bellNote(880, 0.46, 0.8, 0.22),
        ],
        noise: [
            n(0.44, 0.45, 0.65, { filter: 'lowpass', freq: 1100, freqTo: 160, q: 0.7, attack: 0.003 }),
            n(0.44, 0.04, 0.45, { filter: 'highpass', freq: 4200, q: 0.7, attack: 0.001 }),
        ],
    },
    // K.O.：与 game-versus 同时触发，延后 1.5s（等血条掉完）才响：一记重击、铙钹般的噪声、音高坠落的方波。
    'game-ko': {
        partials: [
            p('sine', 110, 40, 1.5, 0.6, 0.6, { attack: 0.003, sweep: 1 }),
            p('square', 784, 196, 1.5, 0.7, 0.36, { attack: 0.004, sweep: 1, lowpass: 2600 }),
            ...bellNote(523.25, 1.55, 1.2, 0.22),
        ],
        noise: [
            n(1.5, 0.7, 0.6, { filter: 'highpass', freq: 3500, freqTo: 7000, q: 0.7, attack: 0.002 }),
            n(1.5, 0.5, 0.5, { filter: 'lowpass', freq: 900, freqTo: 140, q: 0.7, attack: 0.003 }),
        ],
    },
    // 连击：音阶一路往上蹿，每一下伴一声按键，最后一记硬币般的「叮」。
    'game-combo': {
        partials: [
            ...comboTicks.map((t) => t.tone),
            chip(1318.51, comboEnd, 0.1, 0.34), chip(1975.53, comboEnd + 0.08, 0.45, 0.36),
            ...bellNote(2637, comboEnd + 0.1, 0.5, 0.14),
        ],
        noise: comboTicks.flatMap((t) => t.click),
    },
    // 抢手柄：一阵窸窣的拉扯、塑料手柄磕碰两下，最后一声滑稽的「啵嗯」上滑。
    'game-snatch': {
        partials: [
            p('sine', 280, 760, 0.55, 0.3, 0.5, { attack: 0.006, sweep: 1 }),
            p('triangle', 560, 1520, 0.55, 0.26, 0.16, { attack: 0.006, sweep: 1 }),
        ],
        noise: [
            n(0, 0.35, 0.45, { freq: 1500, freqTo: 2600, q: 1.1, attack: 0.04 }),
            ...padClick(0.28, 0.6), ...padClick(0.42, 0.55),
            n(0.55, 0.06, 0.3, { filter: 'highpass', freq: 3800, q: 0.7, attack: 0.001 }),
        ],
    },
});
