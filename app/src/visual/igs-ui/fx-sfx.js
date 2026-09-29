import { createSynthPartial as p, playSynthPartials, playChatSfx } from './chat-sfx.js';

const ringBurst = (start) => [
    p('sine', 1318, 1318, start, 0.05, 0.55, { attack: 0.002 }),
    p('sine', 1568, 1568, start + 0.05, 0.05, 0.55, { attack: 0.002 }),
    p('sine', 1318, 1318, start + 0.1, 0.05, 0.55, { attack: 0.002 }),
    p('sine', 1568, 1568, start + 0.15, 0.05, 0.55, { attack: 0.002 }),
];
const rings = (count) => Array.from({ length: count }, (_, i) => [...ringBurst(i * 1.1), ...ringBurst(i * 1.1 + 0.24)]).flat();
const ringbackTone = (start) => [
    p('sine', 440, 440, start, 0.95, 0.34, { attack: 0.01 }),
    p('sine', 480, 480, start, 0.95, 0.34, { attack: 0.01 }),
];
const endBeeps = (start) => [0, 0.3, 0.6].map((at, i) => p('sine', 480, 480, start + at, i === 2 ? 0.42 : 0.18, 0.6, { attack: 0.004 }));
const busyBeeps = (start) => [0, 0.45, 0.9].flatMap((at) => [
    p('sine', 480, 480, start + at, 0.22, 0.4, { attack: 0.004 }),
    p('sine', 620, 620, start + at, 0.22, 0.4, { attack: 0.004 }),
]);
// 按下挂断键的「咔哒」：一下短促的塑料按键噪声叠一个低频闷响。
const handsetClick = [
    p('noise', 3200, 1800, 0, 0.035, 0.7, { filter: 'bandpass', q: 1.6, attack: 0.001, sweep: 1 }),
    p('sine', 180, 90, 0, 0.07, 0.5, { attack: 0.001, sweep: 1 }),
];

export const FX_SFX_PARTIALS = Object.freeze({
    ring: Object.freeze(rings(2)),
    // 同页就已未接 / 拒接时来电屏停留更久，铃声与回铃音也多响一轮，挂断时由演出掐断。
    'ring-long': Object.freeze(rings(3)),
    // 挂断：有人按键是「咔哒」接三声短嘟；没人接听自然断开只剩嘟声；被拒接是咔哒接忙音「嘟嘟嘟」。
    hangup: Object.freeze([...handsetClick, ...endBeeps(0.14)]),
    missed: Object.freeze(endBeeps(0)),
    reject: Object.freeze([...handsetClick, ...busyBeeps(0.14)]),
    // 拨出回铃音「嘟——嘟——」与忙音，取电话局的双频组合。
    ringback: Object.freeze([...ringbackTone(0), ...ringbackTone(1.35)]),
    'ringback-long': Object.freeze([...ringbackTone(0), ...ringbackTone(1.35), ...ringbackTone(2.7)]),
    busy: Object.freeze(busyBeeps(0)),
    // 家仆通报：梆子「梆、梆」两声，短促的木质敲击。
    'notify-ancient': Object.freeze([0, 0.17].flatMap((start) => [
        p('triangle', 1250, 960, start, 0.07, 0.8, { attack: 0.001, sweep: 1 }),
        p('sine', 620, 540, start, 0.1, 0.45, { attack: 0.001, sweep: 1 }),
    ])),
    heartbeat: Object.freeze([
        p('sine', 70, 48, 0, 0.16, 1, { attack: 0.004, sweep: 1 }),
        p('sine', 64, 44, 0.2, 0.2, 0.8, { attack: 0.004, sweep: 1 }),
        p('sine', 70, 48, 1.1, 0.16, 1, { attack: 0.004, sweep: 1 }),
        p('sine', 64, 44, 1.3, 0.2, 0.8, { attack: 0.004, sweep: 1 }),
    ]),
    tinnitus: Object.freeze([
        p('sine', 5200, 5200, 0, 1.3, 0.16, { attack: 0.02 }),
        p('sine', 5240, 5240, 0, 1.3, 0.08, { attack: 0.02 }),
    ]),
    // 物品演出：获得为上行琶音，失去为下滑音，使用为短促提示音，重要物品为小号式和弦。
    'item-gain': Object.freeze([
        p('triangle', 1046, 1046, 0, 0.14, 0.32, { attack: 0.003 }),
        p('triangle', 1318, 1318, 0.07, 0.14, 0.32, { attack: 0.003 }),
        p('triangle', 1568, 1568, 0.14, 0.16, 0.32, { attack: 0.003 }),
        p('sine', 2093, 2093, 0.21, 0.28, 0.26, { attack: 0.003 }),
    ]),
    'item-lose': Object.freeze([
        p('sine', 660, 330, 0, 0.34, 0.42, { attack: 0.004, sweep: 1 }),
        p('sine', 440, 220, 0.12, 0.36, 0.3, { attack: 0.004, sweep: 1 }),
    ]),
    'item-use': Object.freeze([
        p('sine', 520, 880, 0, 0.12, 0.4, { attack: 0.003, sweep: 1 }),
        p('triangle', 880, 880, 0.1, 0.12, 0.24, { attack: 0.003 }),
    ]),
    'item-rare': Object.freeze([
        p('triangle', 523, 523, 0, 0.14, 0.3, { attack: 0.004 }),
        p('triangle', 659, 659, 0.1, 0.14, 0.3, { attack: 0.004 }),
        p('triangle', 784, 784, 0.2, 0.14, 0.3, { attack: 0.004 }),
        p('triangle', 1046, 1046, 0.34, 0.7, 0.26, { attack: 0.004 }),
        p('sine', 1318, 1318, 0.34, 0.7, 0.2, { attack: 0.004 }),
        p('sine', 1568, 1568, 0.34, 0.7, 0.18, { attack: 0.004 }),
    ]),
});

// 拟声词只发声不显示：按字归入音色族，第一个命中的字决定；都不命中时按「！」或字数退化为轻/重撞击。
const n = (from, to, start, duration, gain, extra = {}) => p('noise', from, to, start, duration, gain, extra);
export const ONOMATOPOEIA_PARTIALS = Object.freeze({
    impact: Object.freeze([
        n(900, 120, 0, 0.45, 1, { filter: 'lowpass', q: 0.7, attack: 0.003, sweep: 1 }),
        p('sine', 120, 42, 0, 0.38, 0.9, { attack: 0.003, sweep: 1 }),
    ]),
    crack: Object.freeze([
        n(2600, 2600, 0, 0.06, 1, { filter: 'highpass', attack: 0.001 }),
        n(4200, 3000, 0.025, 0.05, 0.6, { filter: 'bandpass', q: 2, attack: 0.001, sweep: 1 }),
    ]),
    ring: Object.freeze([
        p('sine', 1760, 1760, 0, 0.7, 0.5, { attack: 0.002 }),
        p('sine', 3520, 3520, 0, 0.3, 0.14, { attack: 0.002 }),
        p('sine', 4858, 4858, 0, 0.12, 0.1, { attack: 0.001 }),
    ]),
    whoosh: Object.freeze([
        n(400, 2600, 0, 0.36, 0.9, { filter: 'bandpass', q: 1.4, attack: 0.12, sweep: 1 }),
    ]),
    thud: Object.freeze([
        n(600, 200, 0, 0.22, 0.8, { filter: 'lowpass', attack: 0.003, sweep: 1 }),
    ]),
});
const ONOMATOPOEIA_CHARS = Object.freeze([
    ['impact', '砰轰咚嘭哐隆镗'],
    ['crack', '啪咔嚓喀噼劈啦'],
    ['ring', '叮铛当锵玎'],
    ['whoosh', '唰嗖呼哗飕刷'],
]);

export function resolveOnomatopoeia(text) {
    const chars = Array.from(String(text == null ? '' : text));
    for (const ch of chars) {
        const hit = ONOMATOPOEIA_CHARS.find(([, set]) => set.includes(ch));
        if (hit) return hit[0];
    }
    const letters = chars.filter((ch) => !/[\s!！?？~～…。，、.]/u.test(ch)).length;
    return chars.some((ch) => ch === '!' || ch === '！') || letters >= 3 ? 'impact' : 'thud';
}

export function playFxSfx(kind, sound, { audioScheduler, text } = {}) {
    if (!sound || sound.enabled === false || !(sound.volume > 0)) return null;
    if (kind === 'notify') return playChatSfx('receive', { volume: sound.volume, audioScheduler });
    if (kind === 'onomatopoeia') kind = `onomatopoeia:${resolveOnomatopoeia(text)}`;
    const partials = kind.startsWith('onomatopoeia:') ? ONOMATOPOEIA_PARTIALS[kind.slice(13)] : FX_SFX_PARTIALS[kind];
    if (!partials) return null;
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ kind, volume: sound.volume, partials }) || null; } catch { return null; }
    }
    return playSynthPartials(partials, { volume: sound.volume });
}
