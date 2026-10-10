// 日常演出的合成音效：振荡器部分沿用 chat-sfx 的 partial 表，噪声部分（快门、纸张、烟花等）在本文件内合成。
import { createSynthPartial as p } from './chat-sfx.js';
import { audioBusContext, busInput, resumeAudioBus } from './audio-bus.js';
import { duckSceneAudio } from './scene-audio.js';
import { GAME_SFX_DEFS } from './fx-daily-game-sfx.js';
import { CAMPUS_SFX_DEFS } from './fx-daily-campus-sfx.js';

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

// 拨弦：基频加略带非谐的上泛音，起音极快，高泛音先衰；琴弦的「啪」一声轻拨由噪声点出。
const pluck = (freq, start, ring, gain) => [
    p('sine', freq, freq, start, ring, gain, { attack: 0.003 }),
    p('sine', freq * 2.01, freq * 2.01, start, ring * 0.5, gain * 0.35, { attack: 0.002 }),
    p('sine', freq * 3.02, freq * 3.02, start, ring * 0.3, gain * 0.18, { attack: 0.002 }),
    p('sine', freq * 4.05, freq * 4.05, start, ring * 0.15, gain * 0.08, { attack: 0.001 }),
];
const pluckClick = (start, gain, freq = 2400) => n(start, 0.03, gain, { freq, q: 1.2, attack: 0.001 });

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

// 敲门：每下一记闷响（低频冲击 + 木板的短促噪声），间隔与 fx-daily.js 的 KNOCK_MS.gap 一致。
const knockHits = (count) => Array.from({ length: count }, (_, i) => i * 0.42);
const knockDef = (count) => ({
    partials: knockHits(count).map((start) => p('sine', 120, 70, start, 0.16, 0.6, { attack: 0.002, sweep: 1 })),
    noise: knockHits(count).map((start) => n(start, 0.07, 0.5, { filter: 'lowpass', freq: 900, q: 0.9, attack: 0.001 })),
});

// 载具：蹄声成对（嘚、嘚），刹车与起步按地点换声；洗浴：水声都是滤波噪声，不用采样。
const hoofPair = (start, gain) => [0, 0.12].map((o) => n(start + o, 0.06, gain, { filter: 'lowpass', freq: 750, q: 0.8, attack: 0.002 }));
const splashRand = seeded(83);
const splashDrops = Array.from({ length: 7 }, () => {
    const freq = 700 + splashRand() * 900;
    return p('sine', freq, freq * 2, 0.12 + splashRand() * 0.7, 0.1, 0.12 + splashRand() * 0.1, { attack: 0.003, sweep: 1 });
}).sort((a, b) => a.start - b.start);

// 水下：气泡是快速上滑的正弦「啵」；入水先一声水花，再闷成低频的水压声。
const bubbleBlips = (count, from, span, seed) => {
    const rand = seeded(seed);
    return Array.from({ length: count }, () => {
        const freq = 260 + rand() * 340;
        return p('sine', freq, freq * 3, from + rand() * span, 0.07, 0.16 + rand() * 0.12, { attack: 0.004, sweep: 1 });
    }).sort((x, y) => x.start - y.start);
};

const rideRand = seeded(97);

const DEFS = {
    dive: {
        partials: bubbleBlips(9, 0.35, 1.3, 89),
        noise: [
            n(0, 0.35, 0.65, { filter: 'lowpass', freq: 3000, freqTo: 400, q: 0.7, attack: 0.003 }),
            n(0.2, 1.8, 0.3, { filter: 'lowpass', freq: 260, freqTo: 140, q: 0.7, attack: 0.25 }),
        ],
    },
    blub: { partials: bubbleBlips(6, 0, 0.9, 97), noise: [] },
    // 泄压：空气「呼」地冲走，越来越细，最后只剩一点点低鸣——真空里没有声音。
    vacuum: {
        partials: [p('sine', 60, 40, 1.1, 1.6, 0.12, { attack: 0.3, sweep: 1 })],
        noise: [
            n(0, 1.2, 0.7, { freq: 900, freqTo: 3800, q: 0.6, attack: 0.02 }),
            n(0, 1.1, 0.3, { filter: 'lowpass', freq: 500, freqTo: 120, q: 0.7, attack: 0.02 }),
        ],
    },
    // 急刹：轮胎尖啸由高往下滑，末了车身一顿的闷响。
    screech: {
        partials: [p('sine', 90, 50, 0.82, 0.26, 0.5, { attack: 0.004, sweep: 1 })],
        noise: [
            n(0, 0.85, 0.34, { freq: 2700, freqTo: 2000, q: 7, attack: 0.03 }),
            n(0, 0.85, 0.1, { freq: 4200, freqTo: 3300, q: 5, attack: 0.03 }),
            n(0.8, 0.14, 0.4, { filter: 'lowpass', freq: 500, q: 0.7, attack: 0.002 }),
        ],
    },
    // 马车急停：蹄声乱了两下，车身「吱呀」一声停住。
    rein: {
        partials: [],
        noise: [
            ...hoofPair(0, 0.4), ...hoofPair(0.3, 0.32),
            n(0.55, 0.6, 0.16, { tone: 'sawtooth', toneFreq: 118, filter: 'bandpass', freq: 820, q: 5, attack: 0.12 }),
        ],
    },
    // 汽车起步：转速往上拉。
    engine: {
        partials: [
            p('sine', 52, 104, 0, 1.5, 0.32, { attack: 0.2, sweep: 0.8 }),
            p('sawtooth', 52, 104, 0, 1.4, 0.05, { attack: 0.2, sweep: 0.8 }),
        ],
        noise: [n(0, 1.6, 0.2, { filter: 'lowpass', freq: 260, freqTo: 620, q: 0.7, attack: 0.3 })],
    },
    // 马车启程：一声鞭响，蹄声由慢到快。
    giddyup: {
        partials: [],
        noise: [
            n(0, 0.05, 0.55, { filter: 'highpass', freq: 3000, q: 0.7, attack: 0.001 }),
            ...hoofPair(0.35, 0.36), ...hoofPair(0.85, 0.38), ...hoofPair(1.25, 0.4), ...hoofPair(1.6, 0.36),
        ],
    },
    // 列车：关门提示音「叮咚」、车门气阀一声，然后轰鸣起来。
    'train-depart': {
        partials: [...bellNote(659.25, 0, 0.7, 0.24), ...bellNote(523.25, 0.42, 0.9, 0.24)],
        noise: [
            n(1.1, 0.4, 0.3, { filter: 'highpass', freq: 2400, q: 0.7, attack: 0.01, env: 'flat' }),
            n(1.3, 1.1, 0.2, { filter: 'lowpass', freq: 160, freqTo: 320, q: 0.7, attack: 0.5 }),
        ],
    },
    // 列车到站：高低两声提示音，接刹车的长长放气声。
    'arrive-chime': {
        partials: [...bellNote(783.99, 0, 0.8, 0.24), ...bellNote(659.25, 0.45, 1.1, 0.24)],
        noise: [n(1.2, 0.7, 0.24, { filter: 'highpass', freq: 2200, freqTo: 1600, q: 0.7, attack: 0.02 })],
    },
    // 船笛：两个低音叠在一起拉长。
    horn: {
        partials: [
            p('sine', 98, 98, 0, 1.6, 0.34, { attack: 0.12 }),
            p('sawtooth', 98, 98, 0, 1.5, 0.05, { attack: 0.12 }),
            p('sawtooth', 147, 147, 0, 1.5, 0.035, { attack: 0.12 }),
        ],
        noise: [],
    },
    // 汽车到了：熄火后车门「砰」一声。
    door: {
        partials: [p('sine', 110, 60, 0.02, 0.22, 0.55, { attack: 0.003, sweep: 1 })],
        noise: [
            n(0, 0.04, 0.24, { filter: 'highpass', freq: 2500, q: 0.7, attack: 0.001 }),
            n(0.02, 0.16, 0.45, { filter: 'lowpass', freq: 600, q: 0.7, attack: 0.002 }),
        ],
    },
    // 客机起飞：涡扇由低沉慢慢推到高亢的轰鸣，机身一阵气流呼啸。
    jet: {
        partials: [
            p('sawtooth', 70, 150, 0, 2.2, 0.14, { attack: 0.4, sweep: 0.8, lowpass: 500, jitter: 0.05 }),
            p('sine', 48, 96, 0, 2.2, 0.2, { attack: 0.4, sweep: 0.8, jitter: 0.05 }),
        ],
        noise: [
            n(0, 2.4, 0.42, { freq: 1200, freqTo: 3600, q: 0.5, attack: 0.5, env: 'flat', jitter: 0.05 }),
            n(0, 2.4, 0.2, { filter: 'lowpass', freq: 240, freqTo: 520, q: 0.7, attack: 0.5, env: 'flat', jitter: 0.05 }),
        ],
    },
    // 客机降落：轮胎触地「吱」一声，接反推的轰鸣慢慢收住。
    touchdown: {
        partials: [p('sine', 150, 70, 0.02, 0.3, 0.3, { attack: 0.004, sweep: 1 })],
        noise: [
            n(0, 0.22, 0.5, { freq: 2800, freqTo: 1600, q: 4, attack: 0.004 }),
            n(0.1, 1.8, 0.34, { freq: 2200, freqTo: 900, q: 0.5, attack: 0.08, env: 'flat' }),
            n(0.1, 1.8, 0.16, { filter: 'lowpass', freq: 320, freqTo: 160, q: 0.7, attack: 0.1, env: 'flat' }),
        ],
    },
    // 露天飞行腾空（御剑、骑龙、乘云）：一道由低往高扬起的风声，衬一点清亮的剑鸣似的长音。
    soar: {
        // 风声里叠两缕剑鸣的非谐泛音（御剑时像剑脊在风中轻颤）；频率与起始偏移每次 ±5% 随机，连着播不会一模一样。
        partials: [
            p('sine', 660, 990, 0.3, 1.2, 0.05, { attack: 0.3, sweep: 1, jitter: 0.05 }),
            p('sine', 1480, 1560, 0.45, 1.0, 0.025, { attack: 0.3, sweep: 1, jitter: 0.05 }),
            p('sine', 3430, 3600, 0.5, 0.7, 0.012, { attack: 0.3, sweep: 1, jitter: 0.05 }),
        ],
        noise: [
            n(0, 1.6, 0.46, { freq: 300, freqTo: 2400, q: 0.9, attack: 0.4, jitter: 0.05 }),
            n(0.2, 1.3, 0.14, { filter: 'highpass', freq: 3000, freqTo: 5200, q: 0.6, attack: 0.5, jitter: 0.05 }),
        ],
    },
    // 露天飞行颠簸：一阵乱风猛地扑过来又散掉。
    gust: {
        partials: [],
        noise: [
            n(0, 0.7, 0.5, { freq: 1600, freqTo: 600, q: 0.8, attack: 0.03 }),
            n(0, 0.8, 0.2, { filter: 'lowpass', freq: 260, q: 0.7, attack: 0.05 }),
        ],
    },
    // 露天飞行落地：风声由高往低收住，末了脚下轻轻一踏。
    alight: {
        partials: [p('sine', 120, 70, 1.05, 0.2, 0.3, { attack: 0.004, sweep: 1 })],
        noise: [
            n(0, 1.1, 0.34, { freq: 2200, freqTo: 400, q: 0.8, attack: 0.1 }),
            n(1.05, 0.12, 0.3, { filter: 'lowpass', freq: 500, q: 0.7, attack: 0.002 }),
        ],
    },
    // 飞艇 / 热气球启航：螺旋桨「突突」由慢转稳，一阵风从身边掠过。没有喷气轰鸣。
    propeller: {
        partials: [p('sine', 46, 62, 0, 2.2, 0.16, { attack: 0.5, sweep: 0.8 })],
        noise: [
            n(0, 2.2, 0.16, { filter: 'lowpass', freq: 220, freqTo: 340, q: 0.8, attack: 0.4, env: 'flat', am: Object.freeze({ rate: 9, depth: 0.6 }) }),
            n(0.4, 1.6, 0.22, { freq: 500, freqTo: 1600, q: 0.7, attack: 0.6 }),
        ],
    },
    // 飞艇颠簸：一阵乱风，船身木梁「吱呀」一声。
    creak: {
        partials: [],
        noise: [
            n(0, 0.6, 0.26, { freq: 700, freqTo: 1500, q: 0.7, attack: 0.08 }),
            n(0.3, 0.55, 0.16, { tone: 'sawtooth', toneFreq: 132, filter: 'bandpass', freq: 860, q: 5, attack: 0.12 }),
        ],
    },
    // 入睡：一声长长的呼气慢慢沉下去，衬一点极低的暖鸣。
    sleep: {
        partials: [p('sine', 70, 50, 0, 2.4, 0.1, { attack: 0.6, sweep: 1 })],
        noise: [
            n(0, 1.6, 0.14, { filter: 'lowpass', freq: 1400, freqTo: 500, q: 0.6, attack: 0.5 }),
            n(0, 2.2, 0.06, { filter: 'lowpass', freq: 260, q: 0.7, attack: 0.8 }),
        ],
    },
    // 起床：高低两声柔和的上行铃音，像晨光里的一记提示。
    wake: {
        partials: [...bellNote(523.25, 0, 1.0, 0.2), ...bellNote(659.25, 0.4, 1.4, 0.22)],
        noise: [n(0, 0.5, 0.05, { filter: 'highpass', freq: 3000, q: 0.6, attack: 0.2 })],
    },
    // 换装登场：一道上行的清亮「叮——」光鸣，衬一层轻柔的闪光气声。
    dressup: {
        partials: [
            p('sine', 880, 1318.5, 0, 1.1, 0.2, { attack: 0.004, sweep: 1 }),
            p('sine', 1318.5, 1760, 0.12, 0.9, 0.1, { attack: 0.004, sweep: 1 }),
            ...bellNote(1760, 0.24, 0.8, 0.12),
        ],
        noise: [n(0, 0.9, 0.08, { filter: 'highpass', freq: 5000, freqTo: 8000, q: 0.6, attack: 0.1 })],
    },
    // 披衣 / 整理着装：两段轻柔的布料窸窣，像外套搭上肩、领口理顺。
    rustle: {
        partials: [],
        noise: [
            n(0, 0.4, 0.16, { filter: 'bandpass', freq: 3200, freqTo: 2200, q: 0.8, attack: 0.04 }),
            n(0.3, 0.5, 0.12, { filter: 'bandpass', freq: 2600, freqTo: 1800, q: 0.8, attack: 0.05 }),
        ],
    },
    // 检票钳「咔嚓」。
    punch: {
        partials: [p('triangle', 1800, 1500, 0.6, 0.03, 0.12, { attack: 0.001, sweep: 1 })],
        noise: [
            n(0, 0.2, 0.2, { freq: 2600, freqTo: 3400, q: 0.8, attack: 0.06 }),
            n(0.6, 0.03, 0.5, { filter: 'highpass', freq: 3200, q: 0.7, attack: 0.001 }),
            n(0.61, 0.05, 0.3, { filter: 'lowpass', freq: 700, q: 0.7, attack: 0.001 }),
        ],
    },
    // 水汽涌过来：一阵柔和的「嘶——」。
    hiss: {
        partials: [],
        noise: [
            n(0, 2, 0.18, { filter: 'highpass', freq: 2600, freqTo: 1800, q: 0.6, attack: 0.5 }),
            n(0, 1.6, 0.08, { filter: 'lowpass', freq: 500, q: 0.6, attack: 0.6 }),
        ],
    },
    // 淋浴：阀门一拧，水「哗」地落下来。
    shower: {
        partials: [],
        noise: [
            n(0, 0.08, 0.3, { filter: 'lowpass', freq: 900, q: 0.8, attack: 0.002 }),
            n(0.1, 2.2, 0.32, { freq: 3400, q: 0.5, attack: 0.12, env: 'flat' }),
            n(0.1, 2.2, 0.12, { filter: 'lowpass', freq: 400, q: 0.6, attack: 0.15, env: 'flat' }),
        ],
    },
    splash: {
        partials: splashDrops,
        noise: [
            n(0, 0.5, 0.7, { filter: 'lowpass', freq: 2600, freqTo: 500, q: 0.7, attack: 0.003 }),
            n(0, 0.3, 0.2, { filter: 'highpass', freq: 4000, q: 0.7, attack: 0.002 }),
        ],
    },
    // 吹风机：电机的嗡声加呼呼的风，开关各「咔」一下。
    dryer: {
        partials: [],
        noise: [
            n(0, 0.02, 0.3, { filter: 'highpass', freq: 3000, q: 0.7, attack: 0.001 }),
            n(0.05, 2.3, 0.26, { freq: 1400, q: 0.7, attack: 0.15, env: 'flat' }),
            n(0.05, 2.3, 0.08, { tone: 'sawtooth', toneFreq: 205, filter: 'lowpass', freq: 900, q: 0.7, attack: 0.15, env: 'flat' }),
            n(2.38, 0.02, 0.24, { filter: 'highpass', freq: 3000, q: 0.7, attack: 0.001 }),
        ],
    },
    // 停电：灯管两下接触不良的电流声，「啪」一声断电，余下一段低沉的嗡鸣。
    blackout: {
        partials: [
            p('sawtooth', 100, 100, 0, 0.12, 0.05, { attack: 0.002 }),
            p('sawtooth', 100, 100, 0.22, 0.1, 0.05, { attack: 0.002 }),
            p('sine', 55, 38, 0.5, 1.6, 0.22, { attack: 0.01, sweep: 1 }),
        ],
        noise: [
            n(0, 0.1, 0.18, { filter: 'highpass', freq: 3800, q: 0.7 }),
            n(0.22, 0.08, 0.16, { filter: 'highpass', freq: 3800, q: 0.7 }),
            n(0.48, 0.05, 0.6, { filter: 'lowpass', freq: 1800, q: 0.8, attack: 0.001 }),
        ],
    },
    knock1: knockDef(1),
    knock2: knockDef(2),
    knock3: knockDef(3),
    knock4: knockDef(4),
    knock5: knockDef(5),
    knock6: knockDef(6),
    // 耳边低语：两段带气声的高频噪声，像贴着耳朵吐字。
    murmur: {
        partials: [],
        noise: [
            n(0.2, 1.1, 0.16, { freq: 2600, freqTo: 1800, q: 2.2, attack: 0.25, am: Object.freeze({ rate: 7, depth: 0.7 }) }),
            n(1.4, 1.2, 0.12, { freq: 2200, freqTo: 1500, q: 2.2, attack: 0.3, am: Object.freeze({ rate: 6, depth: 0.7 }) }),
        ],
    },
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
    // 玩乐 · 唱歌：三个柔和的上行音，像哼出的一小段旋律。
    sing: {
        partials: [523.25, 659.25, 783.99].flatMap((freq, i) => [
            p('sine', freq, freq, i * 0.28, 0.5, 0.2, { attack: 0.06, vibrato: Object.freeze({ rate: 5.5, depth: 0.012 }) }),
            p('triangle', freq * 2, freq * 2, i * 0.28, 0.3, 0.04, { attack: 0.06, vibrato: Object.freeze({ rate: 5.5, depth: 0.012 }) }),
        ]),
        // 换气的呼吸声：每个音起头一小口气。
        noise: [0, 1, 2].map((i) => n(i * 0.28, 0.2, 0.05, { filter: 'highpass', freq: 4200, q: 0.6, attack: 0.05 })),
    },
    // 跳舞：两下轻快的鼓点，衬一声亮片般的高频闪音。
    dance: {
        partials: [0, 0.3].map((start) => p('sine', 140, 70, start, 0.18, 0.45, { attack: 0.004, sweep: 1 })),
        noise: [n(0.6, 0.5, 0.06, { filter: 'highpass', freq: 5500, freqTo: 8000, q: 0.6, attack: 0.1 })],
    },
    // 钓鱼：甩竿的一声破风，接一记「噗通」入水。
    fish: {
        partials: [p('sine', 220, 70, 0.35, 0.3, 0.4, { attack: 0.004, sweep: 1 })],
        noise: [
            n(0, 0.3, 0.2, { freq: 1200, freqTo: 3000, q: 0.8, attack: 0.1 }),
            n(0.35, 0.35, 0.25, { filter: 'lowpass', freq: 900, freqTo: 300, q: 0.7, attack: 0.004 }),
        ],
    },
    // 画画：笔尖在纸上划过的沙沙声，两笔。
    draw: {
        partials: [],
        noise: [
            n(0, 0.35, 0.16, { filter: 'highpass', freq: 3200, freqTo: 4800, q: 0.7, attack: 0.08 }),
            n(0.45, 0.3, 0.14, { filter: 'highpass', freq: 4600, freqTo: 3200, q: 0.7, attack: 0.06 }),
        ],
    },
    // 演奏乐器：一小段琶音，每个音带一点泛音。
    music: {
        partials: [392, 493.88, 587.33, 783.99].flatMap((freq, i) => pluck(freq, i * 0.22, 0.5, 0.16)),
        noise: [392, 493.88, 587.33, 783.99].map((freq, i) => pluckClick(i * 0.22, 0.08, freq * 5)),
    },
    // 游乐设施：链条拉着车厢爬升的咔嗒声，最后一阵俯冲的风声。
    ride: {
        // 链条爬升：每一下是带通噪声的「咔」加一记 90Hz 的闷「咚」，不再是电子 beep。
        partials: Array.from({ length: 8 }, (_, i) => p('sine', 90, 62, i * 0.12, 0.04, 0.18, { attack: 0.001, sweep: 1 })),
        noise: [
            ...Array.from({ length: 8 }, (_, i) => n(i * 0.12, 0.03, 0.2, { freq: 2200 + rideRand() * 500, q: 3, attack: 0.001 })),
            n(1.0, 0.8, 0.22, { freq: 600, freqTo: 2600, q: 0.7, attack: 0.3 }),
        ],
    },
    // 打扫（键名 sweep，与 builder 的 sounds:['sweep'] 对应）：扫帚扫过地面两三下沙沙声，收尾一记「叮」的亮晶。
    sweep: {
        partials: [p('sine', 2093, 2093, 0.78, 0.3, 0.08, { attack: 0.004 })],
        noise: [
            n(0, 0.3, 0.2, { freq: 2400, freqTo: 3400, q: 0.8, attack: 0.1 }),
            n(0.34, 0.3, 0.18, { freq: 3400, freqTo: 2400, q: 0.8, attack: 0.1 }),
            n(0.66, 0.02, 0.16, { filter: 'highpass', freq: 5000, q: 0.7, attack: 0.001 }),
        ],
    },
    // 购物：门铃一样清脆的两声叮铃，加一下纸袋窸窣。
    shopping: {
        partials: [...bellNote(1318.5, 0, 0.6, 0.14), ...bellNote(1568, 0.16, 0.8, 0.14)],
        noise: [n(0.4, 0.25, 0.1, { freq: 3000, freqTo: 2200, q: 0.8, attack: 0.08 })],
    },
    // 散步：四下轻缓的脚步声。
    stroll: {
        // 左右脚交替：右脚略重、音高略低，落地的噪声亮度也差一点。
        partials: [0, 0.4, 0.8, 1.2].map((start, i) => p('sine', i % 2 ? 98 : 116, i % 2 ? 62 : 74, start, 0.07, i % 2 ? 0.33 : 0.28, { attack: 0.002, sweep: 1 })),
        noise: [0, 0.4, 0.8, 1.2].map((start, i) => n(start, 0.06, 0.12, { filter: 'lowpass', freq: i % 2 ? 820 : 980, q: 0.7, attack: 0.002 })),
    },
    // 自行车铃：清脆的「叮铃」两声，金属质感的高频 sine 短促衰减。
    'bike-bell': {
        partials: [...bellNote(2093, 0, 0.5, 0.24), ...bellNote(2794, 0.18, 0.5, 0.22)],
        noise: [],
    },
    // 自行车起步：一下低频蹬踏推力，接链条、轮子渐渐转起来的细碎噪声。
    'bike-ride': {
        partials: [p('sine', 70, 48, 0, 0.4, 0.3, { attack: 0.01, sweep: 1 })],
        noise: [
            n(0, 1.2, 0.14, { filter: 'bandpass', freq: 2600, q: 0.9, attack: 0.3, env: 'flat', am: Object.freeze({ rate: 7, depth: 0.5 }) }),
            n(0.1, 1.1, 0.1, { filter: 'lowpass', freq: 300, freqTo: 520, q: 0.7, attack: 0.35 }),
        ],
    },
    // 自行车刹停：刹皮捏住「吱」的一下短促高频摩擦，随即一声车铃。
    'bike-skid': {
        partials: [...bellNote(2093, 0.55, 0.45, 0.2), ...bellNote(2794, 0.72, 0.4, 0.16)],
        noise: [n(0, 0.5, 0.22, { freq: 3000, freqTo: 2000, q: 6, attack: 0.03 })],
    },
    // 剑鸣：金属长鸣，非谐泛音依次衰减，起头一点剑刃出鞘的金属擦声。
    'sword-ring': {
        partials: [
            p('sine', 1480, 1476, 0, 1.8, 0.22, { attack: 0.002 }),
            p('sine', 1480 * 2.32, 1480 * 2.32, 0, 1.2, 0.1, { attack: 0.002 }),
            p('sine', 1480 * 4.07, 1480 * 4.07, 0, 0.7, 0.06, { attack: 0.001 }),
            p('sine', 1480 * 6.8, 1480 * 6.8, 0, 0.35, 0.03, { attack: 0.001 }),
        ],
        noise: [
            n(0, 0.08, 0.22, { filter: 'highpass', freq: 4200, q: 0.7, attack: 0.001 }),
            n(0, 0.5, 0.08, { freq: 5200, q: 6, attack: 0.002 }),
        ],
    },
    // 符咒：符纸轻燃的「嗤」一声短促呼啸，下面一缕低吟，末尾几点火星。
    talisman: {
        partials: [
            p('sine', 180, 130, 0.05, 0.7, 0.12, { attack: 0.12, sweep: 1 }),
            p('sine', 391, 352, 0.1, 0.5, 0.04, { attack: 0.15, sweep: 1 }),
        ],
        noise: [
            n(0, 0.55, 0.3, { freq: 700, freqTo: 3000, q: 0.8, attack: 0.1 }),
            n(0.05, 0.6, 0.12, { filter: 'lowpass', freq: 400, freqTo: 220, q: 0.7, attack: 0.12 }),
            ...crackle(seeded(103), 0.25, 0.4, 5),
        ],
    },
    // 古琴：几根弦依次拨响，泛音略带非谐，余韵悠长。
    guqin: {
        partials: [146.83, 196, 220, 293.66].flatMap((freq, i) => pluck(freq, [0, 0.32, 0.62, 1.0][i], 1.5, 0.2)),
        noise: [0, 0.32, 0.62, 1.0].map((start) => pluckClick(start, 0.08, 1500)),
    },
    // 点蜡烛：先是擦火柴的一下短促「嚓」，随即烛焰点燃的一声轻「呼」，带一点火苗的细碎噼啪。
    candle: {
        partials: [p('sine', 150, 90, 0.24, 0.3, 0.1, { attack: 0.03, sweep: 1 })],
        noise: [
            n(0, 0.2, 0.34, { freq: 2600, freqTo: 5200, q: 0.8, attack: 0.02 }),
            n(0.24, 0.35, 0.28, { filter: 'lowpass', freq: 1000, freqTo: 320, q: 0.7, attack: 0.04 }),
            n(0.24, 0.12, 0.1, { filter: 'highpass', freq: 5200, q: 0.7, attack: 0.005 }),
            ...crackle(seeded(107), 0.5, 0.35, 3),
        ],
    },
    // 炼丹：炉火低鸣、火舌舔过炉壁，丹成时清脆一声「叮」，带非谐的余音。
    pill: {
        partials: [
            p('sawtooth', 62, 70, 0, 1.4, 0.07, { attack: 0.3, lowpass: 320 }),
            p('sine', 95, 110, 0, 1.4, 0.16, { attack: 0.3 }),
            ...bellNote(1568, 1.5, 0.9, 0.16),
        ],
        noise: [
            n(0, 1.5, 0.2, { filter: 'lowpass', freq: 380, freqTo: 600, q: 0.7, attack: 0.3, env: 'flat' }),
            ...crackle(seeded(109), 0.2, 1.2, 6),
        ],
    },
    // 运功 / 闭关：低沉的气息渐渐涌起的嗡声，由弱到强，末了缓缓收住。
    qi: {
        partials: [
            p('sine', 55, 82, 0, 2.6, 0.22, { attack: 0.9, sweep: 1 }),
            p('sine', 110, 164, 0, 2.6, 0.08, { attack: 0.9, sweep: 1 }),
            p('triangle', 82.4, 123.5, 0.2, 2.2, 0.05, { attack: 0.9, sweep: 1 }),
        ],
        noise: [
            n(0, 2.8, 0.22, { filter: 'lowpass', freq: 260, freqTo: 720, q: 0.8, attack: 1.0, env: 'flat' }),
            n(0.4, 2.2, 0.05, { freq: 1800, freqTo: 2600, q: 1.5, attack: 1.0 }),
        ],
    },
    // 点穴：指尖一点，短促的轻响。
    tap: {
        partials: [
            p('sine', 900, 520, 0, 0.08, 0.3, { attack: 0.001, sweep: 1 }),
            p('sine', 2310, 2310, 0, 0.04, 0.08, { attack: 0.001 }),
        ],
        noise: [n(0, 0.03, 0.24, { freq: 3000, q: 2, attack: 0.001 })],
    },
};

// 在家玩游戏机的音效（开机、胜负、对战、连击、抢手柄）在 fx-daily-game-sfx.js。
Object.assign(DEFS, GAME_SFX_DEFS);
// 校园演出的音效（粉笔、传纸条、抽屉、点名、考试、文化祭、毕业、纽扣）在 fx-daily-campus-sfx.js。
Object.assign(DEFS, CAMPUS_SFX_DEFS);

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

// 每次播放的轻微随机：rnd() 取 [0,1)，0.5 为不偏移（测试注入的上下文用恒定 0.5，保证结果确定）。
// 音高 ±2%、增益 0.9~1.1、起始 ±10ms；带 jitter 字段的（风声、喷气等一次性噪声）再加 ±jitter 的频率与起始偏移。
function jittered(q, rnd) {
    const spread = q.jitter || 0;
    const ratio = 1 + (rnd() - 0.5) * 2 * (0.02 + spread);
    const start = Math.max(0, q.start * (1 + (rnd() - 0.5) * 2 * spread) + (rnd() - 0.5) * 0.02);
    return { ratio, start, gain: 0.9 + rnd() * 0.2 };
}

function scheduleTone(context, output, q, base, volume, nodes, rnd = () => 0.5) {
    const j = jittered(q, rnd);
    const at = base + j.start;
    const peak = q.gain * j.gain * TONE_GAIN * volume;
    const attack = q.attack == null ? 0.005 : q.attack;
    const from = q.from * j.ratio;
    const to = q.to * j.ratio;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = q.wave;
    osc.frequency.setValueAtTime(from, at);
    if (from !== to) osc.frequency.exponentialRampToValueAtTime(to, at + q.duration * (q.sweep == null ? 0.6 : q.sweep));
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(peak * FLOOR, at + q.duration);
    const parts = [osc, gain];
    let head = osc;
    if (q.lowpass) {
        // 锯齿波先过低通，去掉刺耳的高频。
        const lp = context.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(q.lowpass, at);
        lp.Q.setValueAtTime(0.7, at);
        osc.connect(lp);
        parts.push(lp);
        head = lp;
    }
    head.connect(gain);
    gain.connect(output);
    if (q.vibrato) {
        const lfo = context.createOscillator();
        const depth = context.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(q.vibrato.rate, at);
        depth.gain.setValueAtTime(from * q.vibrato.depth, at);
        lfo.connect(depth);
        depth.connect(osc.frequency);
        parts.push(lfo, depth);
        lfo.start(at);
        lfo.stop(at + q.duration + 0.02);
    }
    nodes.push(...parts);
    osc.onended = () => {
        for (const node of parts) { try { node.disconnect?.(); } catch { /* already disconnected */ } }
    };
    osc.start(at);
    osc.stop(at + q.duration + 0.02);
}

function scheduleNoise(context, output, q, base, volume, nodes, rnd = () => 0.5) {
    const j = jittered(q, rnd);
    const at = base + j.start;
    const end = at + q.duration;
    const peak = q.gain * j.gain * NOISE_GAIN * volume;
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
    filter.frequency.setValueAtTime(q.freq * j.ratio, at);
    if (q.freqTo && q.freqTo !== q.freq) filter.frequency.exponentialRampToValueAtTime(q.freqTo * j.ratio, end);
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
    // 源播完后统一断开整条链，避免节点残留。
    const chainNodes = [source, filter, gain, tail];
    source.onended = () => {
        for (const node of chainNodes) { try { node.disconnect?.(); } catch { /* already disconnected */ } }
    };
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
            const rnd = injected ? () => 0.5 : Math.random;
            for (const q of def.partials) scheduleTone(context, output, q, base, volume, nodes, rnd);
            for (const q of def.noise) scheduleNoise(context, output, q, base, volume, nodes, rnd);
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
