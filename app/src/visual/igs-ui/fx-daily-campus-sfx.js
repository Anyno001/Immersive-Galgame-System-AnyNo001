// 校园日常演出的合成音效：粉笔、纸张、木抽屉、桌椅、挂钟、彩纸与掌声都用滤波噪声合成，钟音与闪光用带非谐泛音的多个正弦，不用单一的纯正弦 beep。
// 包络与 fx-daily-sfx 一致：每个音有起音与衰减（衰减到 peak*FLOOR，不 ramp 到 0），播放时的音高 / 增益 / 起始随机化由它的 jittered 统一加。
// 增益对齐同类日常音效：振荡器 0.2~0.5、噪声 0.3~0.65，乘上 TONE_GAIN / NOISE_GAIN 后峰值约 0.1~0.2。
import { createSynthPartial as p } from './chat-sfx.js';

const n = (start, duration, gain, extra = {}) => Object.freeze({ start, duration, gain, filter: 'bandpass', freq: 2000, q: 1, attack: 0.002, ...extra });

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// 钟音：基频 + 非谐泛音，用于挂钟铃、纽扣落地的清脆余响与典礼的收尾闪光。
const bellNote = (freq, start, ring, gain) => [
    p('sine', freq, freq, start, ring, gain, { attack: 0.004 }),
    p('sine', freq * 2, freq * 2, start, ring * 0.45, gain * 0.22, { attack: 0.003 }),
    p('sine', freq * 2.76, freq * 2.76, start, 0.3, gain * 0.28, { attack: 0.002 }),
    p('sine', freq * 5.4, freq * 5.4, start, 0.12, gain * 0.14, { attack: 0.001 }),
];
// 木头的「笃」：低通噪声加一记下坠的低频，课桌、抽屉、出席簿敲桌都是它。
const knock = (start, gain = 0.6, freq = 320) => [
    n(start, 0.07, gain, { filter: 'lowpass', freq, q: 0.9, attack: 0.002 }),
    n(start, 0.02, gain * 0.5, { freq: 2600, q: 1.4, attack: 0.001 }),
];
const thump = (start, from, to, gain) => p('sine', from, to, start, 0.12, gain, { attack: 0.003, sweep: 1 });
// 纸张窸窣：几下高通短噪声，间隔与强弱都不均匀。
function rustle(rand, from, span, count, gain = 0.3) {
    return Array.from({ length: count }, () => n(from + rand() * span, 0.015 + rand() * 0.03, gain * (0.5 + rand() * 0.8), {
        filter: 'highpass', freq: 2600 + rand() * 2600, q: 0.7, attack: 0.001,
    })).sort((a, b) => a.start - b.start);
}

// 粉笔：一连串笔画，每画一道有「咚」的落笔、一段沙沙的刮擦，笔画长短与间隔不均；收尾轻轻一点。
const chalkRand = seeded(311);
let chalkAt = 0.42;
const chalkStrokes = Array.from({ length: 10 }, (_, i) => {
    const start = chalkAt;
    const len = 0.08 + chalkRand() * 0.1;
    chalkAt += len + 0.05 + chalkRand() * 0.08;
    return [
        n(start, 0.025, 0.35, { filter: 'lowpass', freq: 520, q: 0.8, attack: 0.002 }),
        n(start + 0.01, len, 0.34 + chalkRand() * 0.2, { filter: 'highpass', freq: 3400 + chalkRand() * 2600, q: 0.7, attack: 0.012 + i * 0.0004 }),
        n(start + 0.01, len, 0.2, { freq: 5200 + chalkRand() * 1800, q: 2.4, attack: 0.01 }),
    ];
});
const chalkEnd = chalkAt;

// 揉开的纸条在桌间滑过：两次起落各一记轻轻的桌面「嗒」，抵达中央后展开，纸张窸窣。
const passRand = seeded(521);

// 考试：试卷一张张拍在桌上，之后挂钟的滴答，最后一声开考铃。
const examRand = seeded(733);
const EXAM_TICKS = 5;
const EXAM_BELL = 1.0 + EXAM_TICKS * 0.42;
const clockTicks = Array.from({ length: EXAM_TICKS }, (_, i) => n(1.0 + i * 0.42, 0.018, 0.34, { freq: i % 2 ? 2300 : 3300, q: 2.6, attack: 0.001 }));

// 文化祭：彩纸筒「啪」的喷发、一阵欢呼的噪声起伏、小号式的上行短句。
const festRand = seeded(947);
// 掌声：很多个零散的短噪声拍击，由疏到密再散去。
const clapRand = seeded(1319);
const claps = Array.from({ length: 46 }, (_, i) => {
    const t = 1.5 + i * 0.05 + clapRand() * 0.06;
    return n(t, 0.012 + clapRand() * 0.016, 0.22 + clapRand() * 0.26, { filter: 'bandpass', freq: 1500 + clapRand() * 2600, q: 0.9 + clapRand() * 0.8, attack: 0.001 });
});

export const CAMPUS_SFX_DEFS = Object.freeze({
    // 黑板写字：落笔的闷响与一串刮擦，收尾轻轻点一下；时长与 CHALK_WRITE_MS 对齐。
    'campus-chalk': {
        partials: [p('triangle', 520, 360, 0.36, 0.05, 0.22, { attack: 0.002, sweep: 1 })],
        noise: [
            n(0.36, 0.03, 0.55, { freq: 2200, q: 2, attack: 0.001 }),
            ...chalkStrokes.flat(),
            n(chalkEnd + 0.04, 0.03, 0.5, { freq: 2400, q: 2, attack: 0.001 }),
        ],
    },
    // 传纸条：纸团掠过的一阵风，两次落在桌面的轻响，展开时的窸窣，末了一下轻轻抚平。
    'campus-pass': {
        partials: [thump(0.42, 220, 140, 0.3), thump(0.9, 210, 130, 0.26)],
        noise: [
            n(0.02, 0.5, 0.28, { freq: 1500, freqTo: 3800, q: 0.8, attack: 0.1 }),
            n(0.4, 0.04, 0.45, { freq: 2800, q: 1.6, attack: 0.001 }),
            n(0.88, 0.04, 0.4, { freq: 2600, q: 1.6, attack: 0.001 }),
            n(1.4, 0.5, 0.2, { filter: 'highpass', freq: 3000, q: 0.7, attack: 0.05 }),
            ...rustle(passRand, 1.4, 0.7, 9, 0.34),
            n(2.2, 0.22, 0.16, { freq: 1200, freqTo: 600, q: 0.8, attack: 0.04 }),
        ],
    },
    // 抽屉里的发现：木抽屉带着摩擦的滑动，到头的一记撞响，纸张窸窣，最后一串亮晶晶的钟音。
    'campus-drawer': {
        partials: [
            thump(0.62, 150, 80, 0.4),
            ...bellNote(1760, 0.95, 0.9, 0.2), ...bellNote(2349.32, 1.12, 0.8, 0.16), ...bellNote(2793, 1.3, 0.7, 0.12),
        ],
        noise: [
            n(0.1, 0.5, 0.42, { filter: 'lowpass', freq: 520, freqTo: 300, q: 0.8, attack: 0.05, am: { rate: 26, depth: 0.7 } }),
            n(0.1, 0.5, 0.2, { freq: 1700, freqTo: 1200, q: 1.2, attack: 0.05, am: { rate: 31, depth: 0.6 } }),
            ...knock(0.62, 0.65, 260),
            ...rustle(seeded(613), 0.8, 0.4, 5, 0.3),
            n(0.95, 0.5, 0.08, { filter: 'highpass', freq: 6000, q: 0.7, attack: 0.04 }),
        ],
    },
    // 点名起立：出席簿敲在讲桌上的两下，教室安静下来，椅子在地上拖开，人站起来的一记闷响。
    'campus-rollcall': {
        partials: [thump(0, 200, 110, 0.4), thump(0.2, 190, 105, 0.36), thump(1.55, 120, 70, 0.34)],
        noise: [
            ...knock(0, 0.7, 340), ...knock(0.2, 0.62, 330),
            n(0.15, 0.9, 0.16, { filter: 'lowpass', freq: 900, freqTo: 400, q: 0.7, attack: 0.15 }),
            n(1.05, 0.4, 0.34, { freq: 700, freqTo: 1500, q: 3, attack: 0.04, am: { rate: 40, depth: 0.5 } }),
            n(1.05, 0.4, 0.14, { filter: 'highpass', freq: 3600, q: 0.7, attack: 0.05 }),
            ...knock(1.52, 0.5, 240),
        ],
    },
    // 考试发卷：试卷一张张拍在桌上，随后挂钟滴答作响，最后一声清脆的开考铃（叮——咚）。
    'campus-exam': {
        partials: [
            thump(0.05, 190, 120, 0.3), thump(0.3, 185, 118, 0.28), thump(0.55, 180, 115, 0.26),
            ...bellNote(988, EXAM_BELL, 1.0, 0.24),
            ...bellNote(784, EXAM_BELL + 0.42, 1.4, 0.24),
        ],
        noise: [
            n(0.0, 0.14, 0.4, { freq: 2600, freqTo: 4200, q: 0.9, attack: 0.02 }), n(0.25, 0.14, 0.38, { freq: 2500, freqTo: 4000, q: 0.9, attack: 0.02 }), n(0.5, 0.14, 0.36, { freq: 2400, freqTo: 3800, q: 0.9, attack: 0.02 }),
            ...knock(0.06, 0.4, 300), ...knock(0.31, 0.38, 290), ...knock(0.56, 0.36, 280),
            ...rustle(examRand, 0.7, 0.4, 5, 0.28),
            ...clockTicks,
            n(EXAM_BELL, 0.03, 0.4, { freq: 3600, q: 1.8, attack: 0.001 }),
        ],
    },
    // 文化祭开场：礼花筒「啪」的一声，欢呼声涨起来，上行的小号式短句，彩纸落下时细碎的沙沙。
    'campus-festival': {
        partials: [
            thump(0, 420, 120, 0.46),
            p('triangle', 523.25, 523.25, 0.5, 0.16, 0.3, { attack: 0.006 }), p('triangle', 659.25, 659.25, 0.66, 0.16, 0.3, { attack: 0.006 }),
            p('triangle', 783.99, 783.99, 0.82, 0.16, 0.3, { attack: 0.006 }), p('triangle', 1046.5, 1046.5, 0.98, 0.7, 0.34, { attack: 0.006, vibrato: { rate: 6, depth: 0.012 } }),
            ...bellNote(1568, 1.02, 0.9, 0.2),
        ],
        noise: [
            n(0, 0.2, 0.6, { filter: 'highpass', freq: 1800, freqTo: 6500, q: 0.7, attack: 0.001 }),
            n(0, 0.06, 0.5, { filter: 'lowpass', freq: 900, q: 0.7, attack: 0.001 }),
            n(0.15, 1.9, 0.3, { freq: 1100, freqTo: 1600, q: 0.55, attack: 0.5, am: { rate: 5.5, depth: 0.3 } }),
            n(0.2, 2.0, 0.12, { freq: 2600, freqTo: 3400, q: 0.6, attack: 0.6 }),
            ...rustle(festRand, 0.3, 2.0, 14, 0.2),
        ],
    },
    // 毕业 / 入学典礼：柔和的和弦琶音，一阵风把花瓣吹起，学士帽抛出时的呼啸，随后是掌声。
    'campus-graduate': {
        partials: [
            ...bellNote(523.25, 0, 1.8, 0.22), ...bellNote(659.25, 0.2, 1.7, 0.2), ...bellNote(783.99, 0.4, 1.7, 0.2), ...bellNote(1046.5, 0.6, 1.8, 0.18),
            p('triangle', 261.63, 261.63, 0, 1.8, 0.2, { attack: 0.08 }),
        ],
        noise: [
            n(0, 2.2, 0.16, { filter: 'lowpass', freq: 380, freqTo: 1300, q: 0.7, attack: 0.7 }),
            n(0.86, 0.5, 0.3, { freq: 600, freqTo: 2600, q: 0.8, attack: 0.12 }),
            n(0.86, 0.5, 0.12, { filter: 'highpass', freq: 3200, q: 0.7, attack: 0.1 }),
            ...claps,
        ],
    },
    // 第二颗纽扣：线「崩」地绷断，金属纽扣弹起、落在地上清脆地弹跳几下（一下比一下低、一下比一下轻），最后一点温柔的闪光。
    'campus-button': {
        partials: [
            p('sine', 3100, 2400, 0, 0.04, 0.2, { attack: 0.001, sweep: 1 }),
            ...bellNote(2093, 0.14, 0.7, 0.3), ...bellNote(1975.53, 0.5, 0.5, 0.2), ...bellNote(1864.66, 0.74, 0.4, 0.14),
            ...bellNote(1568, 1.3, 1.2, 0.18), ...bellNote(2093, 1.46, 1.0, 0.14),
        ],
        noise: [
            n(0, 0.012, 0.6, { freq: 5200, q: 2, attack: 0.001 }),
            n(0.12, 0.02, 0.4, { freq: 4800, q: 3, attack: 0.001 }),
            n(0.48, 0.015, 0.3, { freq: 4600, q: 3, attack: 0.001 }),
            n(0.72, 0.012, 0.2, { freq: 4400, q: 3, attack: 0.001 }),
            n(1.3, 0.6, 0.05, { filter: 'highpass', freq: 6200, q: 0.7, attack: 0.05 }),
        ],
    },
});
