// Synthesized at runtime: no audio assets. The same partial tables drive both
// WebAudio playback and the offline renderer used by tests and previews.
// Partial fields: attack (s, default 5ms) and sweep (share of duration spent gliding, default 0.6).
const p = (wave, from, to, start, duration, gain, extra = {}) => Object.freeze({ wave, from, to, start, duration, gain, ...extra });

export const CHAT_SFX_PRESETS = Object.freeze({
    cute: Object.freeze({
        receive: Object.freeze([
            p('sine', 1046, 1318, 0, 0.09, 0.9),
            p('sine', 2092, 2636, 0, 0.05, 0.12),
            p('sine', 1568, 1760, 0.075, 0.16, 0.8),
            p('sine', 3136, 3520, 0.075, 0.08, 0.1),
        ]),
        send: Object.freeze([
            p('sine', 420, 1250, 0, 0.085, 1),
            p('triangle', 1250, 1480, 0.03, 0.07, 0.22),
        ]),
    }),
    soft: Object.freeze({
        receive: Object.freeze([
            p('sine', 659, 698, 0, 0.26, 0.75, { attack: 0.025 }),
            p('sine', 988, 1047, 0.1, 0.3, 0.5, { attack: 0.03 }),
        ]),
        send: Object.freeze([
            p('sine', 523, 784, 0, 0.18, 0.8, { attack: 0.02, sweep: 0.5 }),
        ]),
    }),
    water: Object.freeze({
        receive: Object.freeze([
            p('sine', 320, 1400, 0, 0.07, 1, { attack: 0.003, sweep: 1 }),
            p('sine', 480, 1900, 0.1, 0.065, 0.85, { attack: 0.003, sweep: 1 }),
        ]),
        send: Object.freeze([
            p('sine', 260, 1150, 0, 0.065, 1, { attack: 0.003, sweep: 1 }),
            p('sine', 900, 2300, 0.05, 0.04, 0.3, { attack: 0.002, sweep: 1 }),
        ]),
    }),
    chime: Object.freeze({
        receive: Object.freeze([
            p('triangle', 1047, 1047, 0, 0.32, 0.8, { attack: 0.002 }),
            p('sine', 2094, 2094, 0, 0.12, 0.18, { attack: 0.002 }),
            p('triangle', 1568, 1568, 0.11, 0.38, 0.75, { attack: 0.002 }),
            p('sine', 3136, 3136, 0.11, 0.14, 0.15, { attack: 0.002 }),
        ]),
        send: Object.freeze([
            p('triangle', 1319, 1319, 0, 0.26, 0.8, { attack: 0.002 }),
            p('sine', 2638, 2638, 0, 0.1, 0.16, { attack: 0.002 }),
        ]),
    }),
    tap: Object.freeze({
        receive: Object.freeze([
            p('triangle', 880, 700, 0, 0.045, 0.9, { attack: 0.001, sweep: 1 }),
            p('triangle', 1175, 950, 0.07, 0.05, 0.8, { attack: 0.001, sweep: 1 }),
        ]),
        send: Object.freeze([
            p('triangle', 1047, 820, 0, 0.04, 0.9, { attack: 0.001, sweep: 1 }),
        ]),
    }),
});
export const CHAT_SFX_PRESET_LABELS = Object.freeze([
    ['cute', '可爱叮啵'],
    ['soft', '柔和'],
    ['water', '水泡'],
    ['chime', '音盒'],
    ['tap', '木鱼轻敲'],
]);
export const CHAT_SFX_PARTIALS = CHAT_SFX_PRESETS.cute;

const MASTER_GAIN = 0.35;
const ATTACK_S = 0.005;
const SWEEP_RATIO = 0.6;
const FLOOR = 0.001;

let audioContext = null;

export function normalizeChatSfxPreset(value) {
    return Object.hasOwn(CHAT_SFX_PRESETS, value) ? value : 'cute';
}

function partialsFor(kind, preset) {
    const table = CHAT_SFX_PRESETS[normalizeChatSfxPreset(preset)];
    return table[kind] || null;
}

export function chatSfxKindForSide(side) {
    return side === 'right' ? 'send' : 'receive';
}

export function chatSfxDuration(kind, preset) {
    const partials = partialsFor(kind, preset) || [];
    return partials.reduce((max, q) => Math.max(max, q.start + q.duration), 0);
}

function waveSample(wave, phase) {
    const x = phase - Math.floor(phase);
    if (wave === 'triangle') return 1 - 4 * Math.abs(x - 0.5);
    return Math.sin(2 * Math.PI * x);
}

function sweepOf(q) {
    return q.duration * (q.sweep == null ? SWEEP_RATIO : q.sweep);
}

function frequencyAt(q, t) {
    const sweep = sweepOf(q);
    if (t >= sweep || q.from === q.to) return q.to;
    return q.from * Math.pow(q.to / q.from, t / sweep);
}

function envelopeAt(q, t) {
    const attack = q.attack == null ? ATTACK_S : q.attack;
    if (t < attack) return q.gain * (t / attack);
    const k = (t - attack) / (q.duration - attack);
    return q.gain * Math.pow(FLOOR, Math.min(1, k));
}

export function renderChatSfx(kind, { sampleRate = 44100, volume = 1, preset } = {}) {
    const partials = partialsFor(kind, preset);
    if (!partials) return new Float32Array(0);
    const out = new Float32Array(Math.ceil(chatSfxDuration(kind, preset) * sampleRate));
    for (const q of partials) {
        const first = Math.floor(q.start * sampleRate);
        const count = Math.floor(q.duration * sampleRate);
        let phase = 0;
        for (let i = 0; i < count && first + i < out.length; i++) {
            const t = i / sampleRate;
            out[first + i] += waveSample(q.wave, phase) * envelopeAt(q, t) * MASTER_GAIN * volume;
            phase += frequencyAt(q, t) / sampleRate;
        }
    }
    return out;
}

export function playChatSfx(kind, { volume = 0.6, preset, audioScheduler, delay = 0 } = {}) {
    const partials = partialsFor(kind, preset);
    if (!partials || !(volume > 0)) return null;
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ kind, volume, preset: normalizeChatSfxPreset(preset), partials }) || null; } catch { return null; }
    }
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return null;
    const nodes = [];
    const stop = () => {
        for (const node of nodes) {
            try { node.stop?.(); } catch { /* already stopped */ }
            try { node.disconnect(); } catch { /* already disconnected */ }
        }
        nodes.length = 0;
    };
    try {
        if (!audioContext) audioContext = new Context();
        const context = audioContext;
        Promise.resolve(context.resume()).then(() => {
            if (context.state !== 'running') return;
            const base = context.currentTime + 0.01 + delay;
            for (const q of partials) {
                const at = base + q.start;
                const peak = q.gain * MASTER_GAIN * volume;
                const attack = q.attack == null ? ATTACK_S : q.attack;
                const osc = context.createOscillator();
                const gain = context.createGain();
                osc.type = q.wave;
                osc.frequency.setValueAtTime(q.from, at);
                if (q.from !== q.to) osc.frequency.exponentialRampToValueAtTime(q.to, at + sweepOf(q));
                gain.gain.setValueAtTime(0, at);
                gain.gain.linearRampToValueAtTime(peak, at + attack);
                gain.gain.exponentialRampToValueAtTime(peak * FLOOR, at + q.duration);
                osc.connect(gain);
                gain.connect(context.destination);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
                nodes.push(osc, gain);
                osc.start(at);
                osc.stop(at + q.duration + 0.02);
            }
        }).catch(stop);
        return { stop };
    } catch {
        stop();
        return null;
    }
}
