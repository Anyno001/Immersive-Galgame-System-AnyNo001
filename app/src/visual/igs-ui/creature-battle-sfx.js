// 非人对手战斗的合成音效：咆哮、受创、消散三类，按体型分档（小型尖而短，巨型低频而长）。
// 与神话包、战斗音效同一套合成与音频总线，音量与开关沿用演出音效设置（fxSound）。
import { createSynthPartial as p, playSynthPartials } from './chat-sfx.js';

const f = (list) => Object.freeze(list);

export const CREATURE_SFX_PARTIALS = Object.freeze({
    'creature-roar-small': f([
        p('sawtooth', 1250, 720, 0, 0.26, 0.18, { attack: 0.004, sweep: 1 }),
        p('noise', 2800, 1500, 0, 0.22, 0.12, { filter: 'bandpass', q: 1.1, attack: 0.004, sweep: 1 }),
        p('sawtooth', 900, 1500, 0.2, 0.16, 0.14, { attack: 0.004, sweep: 1 }),
    ]),
    'creature-roar-medium': f([
        p('sawtooth', 420, 190, 0, 0.62, 0.26, { attack: 0.01, sweep: 1 }),
        p('square', 210, 95, 0.02, 0.58, 0.16, { attack: 0.01, sweep: 1 }),
        p('noise', 1000, 420, 0, 0.55, 0.2, { filter: 'bandpass', q: 0.8, attack: 0.01, sweep: 1 }),
    ]),
    'creature-roar-large': f([
        p('sawtooth', 210, 84, 0, 0.95, 0.3, { attack: 0.02, sweep: 1 }),
        p('square', 105, 46, 0.03, 0.9, 0.2, { attack: 0.02, sweep: 1 }),
        p('noise', 520, 180, 0, 0.85, 0.24, { filter: 'lowpass', q: 0.7, attack: 0.02, sweep: 1 }),
    ]),
    'creature-roar-giant': f([
        p('sine', 78, 32, 0, 1.6, 0.85, { attack: 0.04, sweep: 1 }),
        p('sawtooth', 118, 48, 0.02, 1.4, 0.26, { attack: 0.04, sweep: 1 }),
        p('noise', 340, 90, 0, 1.4, 0.32, { filter: 'lowpass', q: 0.6, attack: 0.04, sweep: 1 }),
    ]),
    'creature-hurt-small': f([
        p('square', 1700, 520, 0, 0.16, 0.18, { attack: 0.002, sweep: 1 }),
        p('noise', 3600, 1800, 0, 0.1, 0.1, { filter: 'highpass', q: 0.8, attack: 0.002, sweep: 1 }),
    ]),
    'creature-hurt-medium': f([
        p('sawtooth', 560, 210, 0, 0.26, 0.24, { attack: 0.004, sweep: 1 }),
        p('noise', 1400, 500, 0, 0.18, 0.16, { filter: 'bandpass', q: 0.9, attack: 0.004, sweep: 1 }),
    ]),
    'creature-hurt-large': f([
        p('sawtooth', 280, 112, 0, 0.4, 0.28, { attack: 0.006, sweep: 1 }),
        p('sine', 90, 44, 0.02, 0.36, 0.5, { attack: 0.006, sweep: 1 }),
        p('noise', 700, 240, 0, 0.3, 0.2, { filter: 'lowpass', q: 0.8, attack: 0.006, sweep: 1 }),
    ]),
    'creature-hurt-giant': f([
        p('sine', 120, 38, 0, 0.8, 0.9, { attack: 0.01, sweep: 1 }),
        p('sawtooth', 160, 60, 0.02, 0.6, 0.24, { attack: 0.01, sweep: 1 }),
        p('noise', 420, 120, 0, 0.55, 0.28, { filter: 'lowpass', q: 0.7, attack: 0.01, sweep: 1 }),
    ]),
    'creature-fade-small': f([
        p('noise', 4200, 1400, 0, 0.5, 0.16, { filter: 'bandpass', q: 1.2, attack: 0.01, sweep: 1 }),
        p('sine', 1900, 420, 0.04, 0.5, 0.12, { attack: 0.01, sweep: 1 }),
    ]),
    'creature-fade-medium': f([
        p('noise', 2400, 640, 0, 0.8, 0.2, { filter: 'bandpass', q: 0.9, attack: 0.02, sweep: 1 }),
        p('sine', 760, 190, 0.05, 0.75, 0.16, { attack: 0.02, sweep: 1 }),
    ]),
    'creature-fade-large': f([
        p('noise', 900, 150, 0, 1.15, 0.26, { filter: 'lowpass', q: 0.8, attack: 0.04, sweep: 1 }),
        p('sine', 150, 52, 0.05, 1.1, 0.5, { attack: 0.04, sweep: 1 }),
    ]),
    'creature-fade-giant': f([
        p('noise', 520, 80, 0, 1.8, 0.34, { filter: 'lowpass', q: 0.7, attack: 0.06, sweep: 1 }),
        p('sine', 84, 30, 0.05, 1.7, 0.7, { attack: 0.06, sweep: 1 }),
    ]),
});

// 各种族的咆哮 / 受创 / 消散：以中型为基准写一份，按体型缩放音高与时长，大型、巨型再补一层低频。兽类（growl）沿用上面的手调表。
// 每项 [波形, 起始频率, 终止频率, 起点秒, 时长秒, 增益, 噪声滤波, q]。
const SPECIES_SIZE = Object.freeze({ small: [1.7, 0.75, 0], medium: [1, 1, 0], large: [0.72, 1.2, 0.35], giant: [0.5, 1.5, 0.6] });
const clicks = (count, { hz, q = 3, gain, gap, spread = 0, from = 0, slow = 0 }) => Array.from({ length: count }, (_, i) => {
    const at = from + i * gap + ((i * 37) % 11) / 100 * spread + slow * i * i * 0.01;
    return ['noise', hz * (1 + ((i * 53) % 7) / 20), hz, at, 0.035, gain * (1 - (i % 3) * 0.15), 'bandpass', q];
});
const bubbles = (count, { hz, gap, gain, from = 0, fall = 0 }) => Array.from({ length: count }, (_, i) => {
    const f = hz * (1 + ((i * 29) % 5) / 10) * (1 - fall * i);
    return ['sine', f, f * 2.2, from + i * gap * (1 + ((i * 17) % 3) / 6), gap * 0.8, gain];
});
const SPECIES_SFX = {
    roar: {
        roar: [['sawtooth', 190, 80, 0, 1.2, 0.24], ['sawtooth', 285, 120, 0, 1.1, 0.12], ['noise', 1800, 700, 0, 1.1, 0.22, 'bandpass', 0.7], ['sine', 95, 40, 0.05, 1.3, 0.6]],
        hurt: [['sawtooth', 320, 130, 0, 0.35, 0.26], ['noise', 2000, 800, 0, 0.3, 0.18, 'bandpass', 0.8], ['sine', 110, 50, 0.02, 0.4, 0.5]],
        fade: [['sawtooth', 160, 50, 0, 1.4, 0.2], ['noise', 900, 150, 0, 1.5, 0.22, 'lowpass', 0.7], ['sine', 80, 30, 0.1, 1.6, 0.6]],
    },
    hiss: {
        roar: [['noise', 5200, 3800, 0, 0.7, 0.3, 'bandpass', 1.2], ['sawtooth', 640, 420, 0, 0.6, 0.08], ['noise', 1400, 900, 0.05, 0.5, 0.1, 'bandpass', 0.8]],
        hurt: [['noise', 6000, 3000, 0, 0.25, 0.28, 'bandpass', 1.4], ['sawtooth', 900, 500, 0, 0.2, 0.1]],
        fade: [['noise', 4800, 1200, 0, 0.9, 0.22, 'bandpass', 1], ['sine', 500, 180, 0.05, 0.8, 0.1]],
    },
    chitter: {
        roar: [...clicks(10, { hz: 3200, q: 4, gain: 0.2, gap: 0.045, spread: 0.3 }), ['noise', 2600, 2200, 0, 0.5, 0.06, 'highpass', 0.7]],
        hurt: [...clicks(4, { hz: 3800, q: 4, gain: 0.22, gap: 0.03 }), ['square', 2800, 1400, 0, 0.12, 0.08]],
        fade: [...clicks(8, { hz: 2600, q: 3, gain: 0.16, gap: 0.06, slow: 1.5 }), ['noise', 2000, 600, 0.1, 0.6, 0.08, 'bandpass', 1]],
    },
    screech: {
        roar: [['sawtooth', 1500, 2100, 0, 0.15, 0.14], ['sawtooth', 2100, 900, 0.15, 0.4, 0.16], ['noise', 3000, 1800, 0, 0.5, 0.1, 'bandpass', 3]],
        hurt: [['square', 2400, 1100, 0, 0.18, 0.12], ['noise', 3500, 2000, 0, 0.15, 0.1, 'bandpass', 2]],
        fade: [['sawtooth', 1600, 500, 0, 0.8, 0.12], ['noise', 2600, 700, 0.05, 0.8, 0.12, 'bandpass', 1.5], ...clicks(5, { hz: 1800, q: 1, gain: 0.06, gap: 0.09, from: 0.3 })],
    },
    whisper: {
        roar: [['noise', 520, 560, 0, 1, 0.16, 'bandpass', 6], ['noise', 1480, 1600, 0, 1, 0.12, 'bandpass', 6], ['sine', 210, 240, 0, 1, 0.1], ['sine', 420, 480, 0.1, 0.9, 0.05]],
        hurt: [['noise', 1800, 900, 0, 0.35, 0.18, 'bandpass', 4], ['sine', 700, 300, 0, 0.3, 0.1]],
        fade: [['noise', 1600, 400, 0, 1.4, 0.16, 'bandpass', 3], ['sine', 420, 900, 0, 1.3, 0.06]],
    },
    groan: {
        roar: [['sawtooth', 130, 95, 0, 1.1, 0.2], ['sawtooth', 134, 98, 0, 1.1, 0.12], ['noise', 420, 300, 0, 1.1, 0.18, 'bandpass', 4], ['noise', 900, 700, 0, 1, 0.1, 'bandpass', 4]],
        hurt: [['sawtooth', 170, 110, 0, 0.4, 0.24], ['noise', 500, 350, 0, 0.35, 0.16, 'bandpass', 3]],
        fade: [['sawtooth', 120, 55, 0, 1.6, 0.18], ['noise', 380, 150, 0, 1.5, 0.16, 'bandpass', 3], ['sine', 70, 35, 0.2, 1.4, 0.4]],
    },
    rattle: {
        roar: [...clicks(12, { hz: 1500, gain: 0.22, gap: 0.05, spread: 0.6 }), ['triangle', 1100, 1000, 0, 0.6, 0.04]],
        hurt: [...clicks(5, { hz: 1700, gain: 0.24, gap: 0.035, spread: 0.3 })],
        fade: [...clicks(14, { hz: 1300, gain: 0.2, gap: 0.04, spread: 0.5, slow: 2 }), ['sine', 140, 60, 0.7, 0.4, 0.4], ['noise', 400, 200, 0.7, 0.3, 0.12, 'lowpass', 0.8]],
    },
    gurgle: {
        roar: [...bubbles(6, { hz: 170, gap: 0.11, gain: 0.3 }), ['noise', 300, 260, 0, 0.7, 0.1, 'lowpass', 0.7]],
        hurt: [...bubbles(3, { hz: 240, gap: 0.07, gain: 0.32 }), ['noise', 600, 300, 0, 0.2, 0.14, 'lowpass', 0.8]],
        fade: [...bubbles(8, { hz: 200, gap: 0.12, gain: 0.26, fall: 0.07 }), ['noise', 500, 120, 0, 1.2, 0.18, 'lowpass', 0.7]],
    },
    mech: {
        roar: [['square', 130, 220, 0, 0.12, 0.13], ['square', 220, 220, 0.12, 0.18, 0.13], ['square', 277, 277, 0.3, 0.18, 0.13], ['square', 185, 185, 0.48, 0.25, 0.13],
            ['sawtooth', 880, 880, 0, 0.7, 0.04], ['noise', 4000, 4000, 0, 0.7, 0.04, 'highpass', 0.7]],
        hurt: [['square', 600, 150, 0, 0.2, 0.15], ['noise', 3000, 2000, 0, 0.12, 0.18, 'bandpass', 2], ['square', 1200, 1200, 0.15, 0.04, 0.1], ['square', 900, 900, 0.22, 0.04, 0.1]],
        fade: [['square', 440, 40, 0, 1.2, 0.13], ['sawtooth', 220, 25, 0, 1.3, 0.08], ['noise', 5000, 600, 0, 0.4, 0.12, 'bandpass', 1.5], ['sine', 60, 30, 0.1, 1, 0.4]],
    },
    demon: {
        roar: [['sawtooth', 150, 110, 0, 0.9, 0.17], ['sawtooth', 74, 54, 0, 0.9, 0.2], ['noise', 700, 500, 0, 0.9, 0.14, 'bandpass', 4], ['noise', 1900, 1300, 0, 0.8, 0.08, 'bandpass', 4], ['sine', 37, 30, 0, 1, 0.5]],
        hurt: [['sawtooth', 220, 120, 0, 0.35, 0.2], ['sawtooth', 110, 60, 0, 0.35, 0.18], ['noise', 900, 500, 0, 0.3, 0.14, 'bandpass', 3]],
        fade: [['sawtooth', 140, 40, 0, 1.3, 0.15], ['sawtooth', 70, 22, 0, 1.3, 0.15], ['noise', 2400, 300, 0, 1.4, 0.16, 'bandpass', 1]],
    },
    abyss: {
        roar: [['sine', 48, 62, 0, 1.8, 0.7], ['triangle', 96, 124, 0, 1.7, 0.18], ['noise', 260, 200, 0, 1.8, 0.22, 'bandpass', 1.4], ['sine', 145, 186, 0.1, 1.5, 0.08]],
        hurt: [['sine', 90, 50, 0, 0.6, 0.6], ['triangle', 180, 100, 0, 0.5, 0.15], ['noise', 400, 200, 0, 0.5, 0.2, 'lowpass', 0.8]],
        fade: [['sine', 60, 28, 0, 2.2, 0.6], ['noise', 300, 80, 0, 2.2, 0.24, 'lowpass', 0.7], ...bubbles(5, { hz: 300, gap: 0.25, gain: 0.08, from: 0.4 })],
    },
};
const clampHz = (hz) => Math.min(16000, Math.max(25, hz));
function speciesPartials(list, size) {
    const [pitch, length, sub] = SPECIES_SIZE[size];
    const out = list.map(([wave, from, to, start, duration, gain, filter, q]) => p(wave, clampHz(from * pitch), clampHz(to * pitch), start * length, duration * length, gain,
        { attack: duration < 0.1 ? 0.002 : 0.01, sweep: 1, ...(filter ? { filter, q } : {}) }));
    if (sub) {
        const low = Math.min(...out.filter((q) => q.wave !== 'noise').map((q) => Math.min(q.from, q.to)), 200);
        const end = Math.max(...out.map((q) => q.start + q.duration));
        out.push(p('sine', clampHz(low * 0.5), clampHz(low * 0.35), 0, end, sub, { attack: 0.02, sweep: 1 }));
    }
    return f(out);
}
export const CREATURE_SPECIES_SFX_PARTIALS = Object.freeze(Object.fromEntries(Object.entries(SPECIES_SFX).flatMap(([voice, sounds]) =>
    Object.entries(sounds).flatMap(([sound, list]) => Object.keys(SPECIES_SIZE).map((size) => [`creature-${sound}-${size}-${voice}`, speciesPartials(list, size)])))));

// 带种族后缀的名字没有对应音效时退回同体型的兽类版。
function creaturePartialsOf(kind) {
    return CREATURE_SPECIES_SFX_PARTIALS[kind] || CREATURE_SFX_PARTIALS[kind] || CREATURE_SFX_PARTIALS[String(kind).split('-').slice(0, 3).join('-')] || null;
}

export function playCreatureSfx(kind, sound, { audioScheduler } = {}) {
    if (!sound || sound.enabled === false || !(sound.volume > 0)) return null;
    const partials = creaturePartialsOf(kind);
    if (!partials) return null;
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ kind, volume: sound.volume, partials }) || null; } catch { return null; }
    }
    return playSynthPartials(partials, { volume: sound.volume });
}
