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

export function playCreatureSfx(kind, sound, { audioScheduler } = {}) {
    if (!sound || sound.enabled === false || !(sound.volume > 0)) return null;
    const partials = CREATURE_SFX_PARTIALS[kind];
    if (!partials) return null;
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ kind, volume: sound.volume, partials }) || null; } catch { return null; }
    }
    return playSynthPartials(partials, { volume: sound.volume });
}
