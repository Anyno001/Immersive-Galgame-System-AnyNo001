// Synthesized at runtime: no audio assets. The same partial table drives both
// WebAudio playback and the offline renderer used by tests and previews.
export const CHAT_SFX_PARTIALS = Object.freeze({
    receive: Object.freeze([
        Object.freeze({ wave: 'sine', from: 1046, to: 1318, start: 0, duration: 0.09, gain: 0.9 }),
        Object.freeze({ wave: 'sine', from: 2092, to: 2636, start: 0, duration: 0.05, gain: 0.12 }),
        Object.freeze({ wave: 'sine', from: 1568, to: 1760, start: 0.075, duration: 0.16, gain: 0.8 }),
        Object.freeze({ wave: 'sine', from: 3136, to: 3520, start: 0.075, duration: 0.08, gain: 0.1 }),
    ]),
    send: Object.freeze([
        Object.freeze({ wave: 'sine', from: 420, to: 1250, start: 0, duration: 0.085, gain: 1 }),
        Object.freeze({ wave: 'triangle', from: 1250, to: 1480, start: 0.03, duration: 0.07, gain: 0.22 }),
    ]),
});

const MASTER_GAIN = 0.35;
const ATTACK_S = 0.005;
const SWEEP_RATIO = 0.6;
const FLOOR = 0.001;

let audioContext = null;

export function chatSfxKindForSide(side) {
    return side === 'right' ? 'send' : 'receive';
}

export function chatSfxDuration(kind) {
    const partials = CHAT_SFX_PARTIALS[kind] || [];
    return partials.reduce((max, p) => Math.max(max, p.start + p.duration), 0);
}

function waveSample(wave, phase) {
    const x = phase - Math.floor(phase);
    if (wave === 'triangle') return 1 - 4 * Math.abs(x - 0.5);
    return Math.sin(2 * Math.PI * x);
}

function frequencyAt(p, t) {
    const sweep = p.duration * SWEEP_RATIO;
    if (t >= sweep) return p.to;
    return p.from * Math.pow(p.to / p.from, t / sweep);
}

function envelopeAt(p, t) {
    if (t < ATTACK_S) return p.gain * (t / ATTACK_S);
    const k = (t - ATTACK_S) / (p.duration - ATTACK_S);
    return p.gain * Math.pow(FLOOR, Math.min(1, k));
}

export function renderChatSfx(kind, { sampleRate = 44100, volume = 1 } = {}) {
    const partials = CHAT_SFX_PARTIALS[kind];
    if (!partials) return new Float32Array(0);
    const out = new Float32Array(Math.ceil(chatSfxDuration(kind) * sampleRate));
    for (const p of partials) {
        const first = Math.floor(p.start * sampleRate);
        const count = Math.floor(p.duration * sampleRate);
        let phase = 0;
        for (let i = 0; i < count && first + i < out.length; i++) {
            const t = i / sampleRate;
            out[first + i] += waveSample(p.wave, phase) * envelopeAt(p, t) * MASTER_GAIN * volume;
            phase += frequencyAt(p, t) / sampleRate;
        }
    }
    return out;
}

export function playChatSfx(kind, { volume = 0.6, audioScheduler } = {}) {
    const partials = CHAT_SFX_PARTIALS[kind];
    if (!partials || !(volume > 0)) return null;
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ kind, volume, partials }) || null; } catch { return null; }
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
            const base = context.currentTime + 0.01;
            for (const p of partials) {
                const at = base + p.start;
                const peak = p.gain * MASTER_GAIN * volume;
                const osc = context.createOscillator();
                const gain = context.createGain();
                osc.type = p.wave;
                osc.frequency.setValueAtTime(p.from, at);
                osc.frequency.exponentialRampToValueAtTime(p.to, at + p.duration * SWEEP_RATIO);
                gain.gain.setValueAtTime(0, at);
                gain.gain.linearRampToValueAtTime(peak, at + ATTACK_S);
                gain.gain.exponentialRampToValueAtTime(peak * FLOOR, at + p.duration);
                osc.connect(gain);
                gain.connect(context.destination);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
                nodes.push(osc, gain);
                osc.start(at);
                osc.stop(at + p.duration + 0.02);
            }
        }).catch(stop);
        return { stop };
    } catch {
        stop();
        return null;
    }
}
