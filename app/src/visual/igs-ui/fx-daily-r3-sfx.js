// 古风修仙与体贴动作演出的专属音效：落子、斟茶、衣袖、圣旨展开与落玺、点穴、轻功点水、灵气金光、盾光、照料、抱起、气泡破裂。
// 时间点与对应构建器的动画节拍对齐；包络与 fx-daily-sfx 一致，只用滤波噪声与带非谐泛音的正弦，增益保持克制。
import { createSynthPartial as p } from './chat-sfx.js';

const n = (start, duration, gain, extra = {}) => Object.freeze({ start, duration, gain, filter: 'bandpass', freq: 2000, q: 1, attack: 0.002, ...extra });

const bell = (freq, start, ring, gain) => [
    p('sine', freq, freq, start, ring, gain, { attack: 0.004 }),
    p('sine', freq * 2.76, freq * 2.76, start, ring * 0.3, gain * 0.26, { attack: 0.002 }),
    p('sine', freq * 5.4, freq * 5.4, start, ring * 0.1, gain * 0.12, { attack: 0.001 }),
];

// 木棋子落在棋盘上清脆的「嗒」：一记短促的高频敲击、一点木质的低共鸣、一个略下坠的音头。
const clack = (start, freq, gain = 0.5) => [
    p('triangle', freq, freq * 0.62, start, 0.09, gain * 0.5 * 0.8, { attack: 0.001, sweep: 1 }),
    n(start, 0.03, gain * 0.8, { freq: 1900, q: 1.6, attack: 0.001 }),
    n(start, 0.1, gain * 0.5, { filter: 'lowpass', freq: 700, q: 0.8, attack: 0.002 }),
];

export const R3_SFX_DEFS = Object.freeze({
    // 舞曲节拍：三拍（每拍 0.5s）轻鼓点，偶数拍间夹一记细碎的踩镲。
    'dance-beat': {
        partials: [0, 0.5, 1.0].map((start) => p('sine', 120, 58, start, 0.16, 0.34, { attack: 0.004, sweep: 1 })),
        noise: [0.25, 0.75, 1.25].map((start) => n(start, 0.05, 0.1, { filter: 'highpass', freq: 6500, q: 0.7, attack: 0.001 })),
    },
    // 膝盖落地：一记闷响、稍后一记更轻的回压，夹着衣料摩擦的低沙声。
    'kneel-thud': {
        partials: [p('sine', 95, 48, 0.62, 0.24, 0.5, { attack: 0.004, sweep: 1 }), p('sine', 82, 46, 0.78, 0.2, 0.3, { attack: 0.004, sweep: 1 })],
        noise: [
            n(0.25, 0.4, 0.08, { filter: 'bandpass', freq: 1800, freqTo: 900, q: 0.6, attack: 0.1 }),
            n(0.62, 0.12, 0.3, { filter: 'lowpass', freq: 420, q: 0.7, attack: 0.003 }),
            n(0.78, 0.1, 0.16, { filter: 'lowpass', freq: 380, q: 0.7, attack: 0.003 }),
        ],
    },
    // 门把手轻响：金属把手一压、锁舌缩回的两下细碎轻敲。
    'door-handle': {
        partials: [p('triangle', 2100, 1500, 0, 0.05, 0.12, { attack: 0.001, sweep: 1 }), p('triangle', 1700, 1200, 0.09, 0.04, 0.1, { attack: 0.001, sweep: 1 })],
        noise: [n(0, 0.02, 0.16, { freq: 3200, q: 1.4, attack: 0.001 }), n(0.09, 0.025, 0.14, { freq: 2600, q: 1.4, attack: 0.001 })],
    },
    // 落子：开局几下旧子归位的轻响，随后四记落子，节拍对应棋盘上新子落下的时刻。
    'go-play': {
        partials: [720, 660, 700, 650].flatMap((f, i) => clack(0.9 + i * 0.65, f, 0.5).slice(0, 1)),
        noise: [
            n(0.08, 0.02, 0.14, { freq: 2200, q: 1.2, attack: 0.001 }), n(0.22, 0.02, 0.1, { freq: 2000, q: 1.2, attack: 0.001 }), n(0.36, 0.02, 0.12, { freq: 2300, q: 1.2, attack: 0.001 }),
            ...[0.9, 1.55, 2.2, 2.85].flatMap((t, i) => clack(t, 700 + [-60, 40, -30, 60][i], 0.5).slice(1)),
        ],
    },
    // 斟茶：一线细水冲入盏中、音调渐高，随后盏底轻轻碰上托碟的瓷声，衣袖一动。
    'tea-pour': {
        partials: [...bell(2930, 1.28, 0.22, 0.12), p('sine', 420, 380, 1.28, 0.1, 0.06, { attack: 0.004 })],
        noise: [
            n(0.05, 1.0, 0.2, { freq: 1100, freqTo: 2300, q: 1.2, attack: 0.08 }),
            n(0.05, 1.0, 0.08, { filter: 'highpass', freq: 4200, q: 0.7, attack: 0.1 }),
            n(1.28, 0.03, 0.3, { freq: 3400, q: 2, attack: 0.001 }),
            n(1.5, 0.35, 0.1, { freq: 2400, freqTo: 1800, q: 0.8, attack: 0.05 }),
        ],
    },
    // 行礼：衣袖垂落的「簌」，起身时再一声，躬到最低时一点极轻的落定声。
    'bow-sleeve': {
        partials: [p('sine', 170, 105, 0.36, 0.18, 0.1, { attack: 0.01, sweep: 1 })],
        noise: [
            n(0, 0.36, 0.2, { freq: 2800, freqTo: 1800, q: 0.8, attack: 0.05 }),
            n(0.7, 0.34, 0.14, { freq: 1900, freqTo: 2800, q: 0.8, attack: 0.05 }),
        ],
    },
    // 圣旨：开卷一声磬响，绢帛滑开的长长一道摩擦，玉轴分开的清脆一碰，末尾落玺的沉闷一声。
    'edict-open': {
        partials: [
            p('sine', 330, 330, 0, 1.8, 0.2, { attack: 0.01 }), p('sine', 330 * 2.4, 330 * 2.4, 0, 0.54, 0.052, { attack: 0.01 }), p('sine', 330 * 4.1, 330 * 4.1, 0, 0.18, 0.024, { attack: 0.01 }),
            p('sine', 98, 70, 0.02, 0.5, 0.2, { attack: 0.004, sweep: 1 }),
            p('sine', 110, 58, 2.6, 0.3, 0.3, { attack: 0.002, sweep: 1 }),
        ],
        noise: [
            n(0.15, 1.0, 0.22, { freq: 1400, freqTo: 3400, q: 0.7, attack: 0.15 }),
            n(0.15, 1.0, 0.1, { filter: 'highpass', freq: 5000, q: 0.7, attack: 0.2 }),
            n(1.18, 0.04, 0.3, { freq: 2600, q: 1.6, attack: 0.001 }),
            n(2.6, 0.12, 0.34, { filter: 'lowpass', freq: 420, q: 0.8, attack: 0.002 }),
            n(2.62, 0.3, 0.1, { filter: 'highpass', freq: 3600, q: 0.7, attack: 0.01 }),
        ],
    },
    // 点穴：指尖一点的短促「笃」，一声细而冷的清鸣，被定住后一缕低沉的、渐强又渐隐的嗡。
    'freeze-point': {
        partials: [
            p('sine', 1400, 1200, 0.3, 0.45, 0.14, { attack: 0.002 }),
            p('sine', 4100, 4100, 0.3, 0.18, 0.03, { attack: 0.002 }),
            p('sine', 320, 296, 0.35, 1.4, 0.08, { attack: 0.3 }),
        ],
        noise: [
            n(0.12, 0.2, 0.12, { filter: 'highpass', freq: 3600, q: 0.7, attack: 0.04 }),
            n(0.28, 0.03, 0.45, { freq: 3200, q: 2, attack: 0.001 }),
            n(0.4, 1.0, 0.05, { filter: 'highpass', freq: 6000, q: 0.7, attack: 0.3 }),
        ],
    },
    // 轻功点水：三下几乎听不见的足尖轻点，各带一滴水珠的上扬。
    'light-step': {
        partials: [0.18, 0.62, 1.04].map((t, i) => p('sine', 900 + i * 120, 1500 + i * 160, t, 0.07, 0.09, { attack: 0.002, sweep: 1 })),
        noise: [0.15, 0.6, 1.02].map((t) => n(t, 0.03, 0.24, { filter: 'lowpass', freq: 900, q: 0.8, attack: 0.002 })),
    },
    // 灵气汇成金光的一闪：清亮的钟声叠一个更高的泛音，呼吸末尾落下。
    'qi-chime': {
        partials: [p('sine', 1046.5, 1046.5, 2.4, 1.0, 0.12, { attack: 0.004 }), p('sine', 1046.5 * 2.76, 1046.5 * 2.76, 2.4, 0.3, 0.03, { attack: 0.002 })],
        noise: [n(2.4, 0.5, 0.06, { filter: 'highpass', freq: 6000, q: 0.7, attack: 0.05 })],
    },
    // 运功失败：光点碎裂的一记脆响，随后一声下坠的低叹。
    'qi-break': {
        partials: [p('sine', 600, 180, 1.0, 0.5, 0.1, { attack: 0.004, sweep: 1 })],
        noise: [
            n(1.0, 0.08, 0.4, { filter: 'highpass', freq: 3000, q: 0.7, attack: 0.001 }),
            n(1.02, 0.4, 0.14, { freq: 4600, freqTo: 2600, q: 2, attack: 0.002 }),
        ],
    },
    // 盾光：来袭光矢撞上盾面的一记闷响与清亮的回声，随后几声细小的偏折弹开。
    'shield-ward': {
        partials: [...bell(1174.7, 0.5, 0.9, 0.16), p('sine', 130, 70, 0.5, 0.2, 0.22, { attack: 0.002, sweep: 1 }), ...[0.62, 0.78, 0.92].map((t, i) => p('sine', 2600 + i * 300, 3400 + i * 300, t, 0.08, 0.06, { attack: 0.001, sweep: 1 }))],
        noise: [n(0.45, 0.12, 0.3, { freq: 1600, q: 1, attack: 0.002 }), n(0.5, 0.2, 0.12, { filter: 'lowpass', freq: 500, q: 0.8, attack: 0.002 })],
    },
    // 照料：软布轻抚，随后一声极轻的铃，像把东西递到对方手里。
    'tend-soft': {
        partials: [...bell(1568, 0.55, 0.9, 0.08)],
        noise: [n(0, 0.5, 0.12, { freq: 2400, freqTo: 1800, q: 0.8, attack: 0.08 }), n(0.2, 0.4, 0.06, { filter: 'highpass', freq: 5000, q: 0.7, attack: 0.1 })],
    },
    // 抱起：衣料拢起的窸窣，一口轻轻的气，托起时一缕渐升的软音。
    'carry-lift': {
        partials: [p('sine', 392, 523, 0.25, 0.9, 0.08, { attack: 0.25, sweep: 1 })],
        noise: [
            n(0, 0.55, 0.2, { freq: 2000, freqTo: 3200, q: 0.8, attack: 0.08 }),
            n(0.1, 0.5, 0.1, { freq: 1200, freqTo: 2200, q: 0.6, attack: 0.2 }),
        ],
    },
    // 气泡破裂：高处几个泡先后「啵」地破开。
    'bubble-pop': {
        partials: [1.1, 1.55, 2.0, 2.45].map((t, i) => p('sine', 700 + i * 60, 1500 + i * 80, t, 0.05, 0.16, { attack: 0.001, sweep: 1 })),
        noise: [1.1, 1.55, 2.0, 2.45].map((t) => n(t, 0.02, 0.1, { freq: 3600, q: 1.4, attack: 0.001 })),
    },
});
