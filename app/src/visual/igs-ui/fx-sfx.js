import { createSynthPartial as p, playSynthPartials, playChatSfx } from './chat-sfx.js';

const ringBurst = (start) => [
    p('sine', 1318, 1318, start, 0.05, 0.55, { attack: 0.002 }),
    p('sine', 1568, 1568, start + 0.05, 0.05, 0.55, { attack: 0.002 }),
    p('sine', 1318, 1318, start + 0.1, 0.05, 0.55, { attack: 0.002 }),
    p('sine', 1568, 1568, start + 0.15, 0.05, 0.55, { attack: 0.002 }),
];

export const FX_SFX_PARTIALS = Object.freeze({
    ring: Object.freeze([...ringBurst(0), ...ringBurst(0.24), ...ringBurst(1.1), ...ringBurst(1.34)]),
    hangup: Object.freeze([
        p('sine', 480, 480, 0, 0.18, 0.6, { attack: 0.004 }),
        p('sine', 480, 480, 0.3, 0.18, 0.6, { attack: 0.004 }),
        p('sine', 480, 480, 0.6, 0.42, 0.6, { attack: 0.004 }),
    ]),
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
});

export function playFxSfx(kind, sound, { audioScheduler } = {}) {
    if (!sound || sound.enabled === false || !(sound.volume > 0)) return null;
    if (kind === 'notify') return playChatSfx('receive', { volume: sound.volume, audioScheduler });
    const partials = FX_SFX_PARTIALS[kind];
    if (!partials) return null;
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ kind, volume: sound.volume, partials }) || null; } catch { return null; }
    }
    return playSynthPartials(partials, { volume: sound.volume });
}
