// 战斗演出的合成音效：遭遇、各类出招结果与结算；音量与开关沿用演出音效设置（fxSound）。
import { createSynthPartial as p, playSynthPartials } from './chat-sfx.js';

export const BATTLE_SFX_PARTIALS = Object.freeze({
    'battle-encounter': Object.freeze([
        p('square', 220, 880, 0, 0.26, 0.22, { attack: 0.004, sweep: 1 }),
        p('triangle', 440, 440, 0.28, 0.5, 0.3, { attack: 0.004 }),
        p('triangle', 554, 554, 0.28, 0.5, 0.26, { attack: 0.004 }),
        p('triangle', 659, 659, 0.28, 0.5, 0.26, { attack: 0.004 }),
    ]),
    'battle-hit': Object.freeze([
        p('sawtooth', 900, 120, 0, 0.12, 0.2, { attack: 0.002, sweep: 1 }),
        p('sine', 120, 55, 0.04, 0.18, 0.7, { attack: 0.002, sweep: 1 }),
    ]),
    'battle-crit': Object.freeze([
        p('sawtooth', 1400, 150, 0, 0.14, 0.22, { attack: 0.002, sweep: 1 }),
        p('square', 1760, 1760, 0.02, 0.06, 0.14, { attack: 0.002 }),
        p('sine', 95, 40, 0.05, 0.3, 0.9, { attack: 0.002, sweep: 1 }),
    ]),
    'battle-miss': Object.freeze([
        p('sine', 1200, 420, 0, 0.2, 0.18, { attack: 0.01, sweep: 1 }),
    ]),
    'battle-guard': Object.freeze([
        p('triangle', 1500, 1500, 0, 0.05, 0.3, { attack: 0.002 }),
        p('triangle', 2250, 2250, 0.01, 0.28, 0.2, { attack: 0.002 }),
        p('square', 300, 260, 0, 0.06, 0.12, { attack: 0.002, sweep: 1 }),
    ]),
    'battle-ko': Object.freeze([
        p('sawtooth', 600, 80, 0, 0.3, 0.2, { attack: 0.002, sweep: 1 }),
        p('sine', 200, 38, 0.06, 0.6, 0.9, { attack: 0.004, sweep: 1 }),
    ]),
    'battle-heal': Object.freeze([
        p('sine', 784, 784, 0, 0.14, 0.26, { attack: 0.004 }),
        p('sine', 988, 988, 0.08, 0.14, 0.26, { attack: 0.004 }),
        p('sine', 1175, 1175, 0.16, 0.14, 0.26, { attack: 0.004 }),
        p('sine', 1568, 1568, 0.24, 0.4, 0.22, { attack: 0.004 }),
    ]),
    'battle-win': Object.freeze([
        p('triangle', 523, 523, 0, 0.12, 0.3, { attack: 0.004 }),
        p('triangle', 659, 659, 0.12, 0.12, 0.3, { attack: 0.004 }),
        p('triangle', 784, 784, 0.24, 0.12, 0.3, { attack: 0.004 }),
        p('triangle', 1046, 1046, 0.36, 0.2, 0.3, { attack: 0.004 }),
        p('triangle', 880, 880, 0.58, 0.1, 0.26, { attack: 0.004 }),
        p('triangle', 1046, 1046, 0.7, 0.9, 0.28, { attack: 0.004 }),
        p('sine', 1318, 1318, 0.7, 0.9, 0.2, { attack: 0.004 }),
        p('sine', 1568, 1568, 0.7, 0.9, 0.18, { attack: 0.004 }),
    ]),
    'battle-lose': Object.freeze([
        p('sine', 392, 392, 0, 0.4, 0.34, { attack: 0.01 }),
        p('sine', 349, 349, 0.4, 0.4, 0.32, { attack: 0.01 }),
        p('sine', 311, 311, 0.8, 0.4, 0.3, { attack: 0.01 }),
        p('sine', 262, 196, 1.2, 1.1, 0.3, { attack: 0.01, sweep: 1 }),
    ]),
    'battle-escape': Object.freeze([
        p('square', 880, 880, 0, 0.06, 0.12, { attack: 0.002 }),
        p('square', 660, 660, 0.08, 0.06, 0.12, { attack: 0.002 }),
        p('square', 440, 440, 0.16, 0.06, 0.12, { attack: 0.002 }),
        p('sine', 900, 300, 0.26, 0.3, 0.16, { attack: 0.01, sweep: 1 }),
    ]),
});

export function battleSfxKind(event) {
    if (!event) return '';
    if (event.type === 'encounter') return 'battle-encounter';
    return `battle-${event.result}`;
}

export function playBattleSfx(kind, sound, { audioScheduler } = {}) {
    if (!sound || sound.enabled === false || !(sound.volume > 0)) return null;
    const partials = BATTLE_SFX_PARTIALS[kind];
    if (!partials) return null;
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ kind, volume: sound.volume, partials }) || null; } catch { return null; }
    }
    return playSynthPartials(partials, { volume: sound.volume });
}
