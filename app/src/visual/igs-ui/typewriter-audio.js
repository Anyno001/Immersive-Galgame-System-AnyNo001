import { busInput, resumeAudioBus } from './audio-bus.js';
import { createSynthPartial as p } from './chat-sfx.js';
import { emotionPitch, emotionProfile } from './speech-prosody.js';
import { connectHorrorChain, shapeHorrorNotes } from './typewriter-horror.js';

export { emotionPitch };

// Replaced by the build with the two validated OGG payloads.
const SAMPLES = Object.freeze({
    dududu: '__IGS_TYPEWRITER_AUDIO__dududu.ogg__',
    keyboard: '__IGS_TYPEWRITER_AUDIO__keyboard.ogg__',
});
// Noise partial: band-passed white noise, same timing fields as synth partials.
const n = (band, q, start, duration, gain, extra = {}) => Object.freeze({ noise: true, band, q, start, duration, gain, ...extra });

// Each voice is one note per revealed character: either a bundled sample
// (optionally re-pitched) or a short partial table synthesized at runtime.
export const TYPEWRITER_VOICES = Object.freeze({
    dududu: Object.freeze({ sample: 'dududu' }),
    keyboard: Object.freeze({ sample: 'keyboard' }),
    squeak: Object.freeze({ sample: 'dududu', rate: 1.45 }),
    deep: Object.freeze({ sample: 'dududu', rate: 0.72 }),
    blip: Object.freeze({ partials: Object.freeze([
        p('square', 560, 560, 0, 0.045, 0.5, { attack: 0.002 }),
    ]) }),
    pop: Object.freeze({ partials: Object.freeze([
        p('sine', 380, 920, 0, 0.055, 1, { attack: 0.003, sweep: 1 }),
    ]) }),
    chime: Object.freeze({ partials: Object.freeze([
        p('triangle', 1320, 1320, 0, 0.12, 0.8, { attack: 0.002 }),
        p('sine', 2640, 2640, 0, 0.06, 0.15, { attack: 0.002 }),
    ]) }),
    wood: Object.freeze({ partials: Object.freeze([
        p('triangle', 700, 520, 0, 0.04, 1, { attack: 0.001, sweep: 1 }),
    ]) }),
    typewriter: Object.freeze({ partials: Object.freeze([
        n(2600, 1.2, 0, 0.025, 1.4, { attack: 0.001 }),
        p('sine', 190, 140, 0, 0.03, 0.6, { attack: 0.001, sweep: 1 }),
    ]) }),
    pencil: Object.freeze({ partials: Object.freeze([
        n(5200, 0.8, 0, 0.045, 1.2, { attack: 0.012 }),
    ]) }),
    whisper: Object.freeze({ partials: Object.freeze([
        n(1300, 0.9, 0, 0.07, 1.3, { attack: 0.02 }),
    ]) }),
});
export const TYPEWRITER_VOICE_LABELS = Object.freeze([
    ['dududu', '嘟嘟嘟'],
    ['squeak', '嘟嘟·高音'],
    ['deep', '嘟嘟·低音'],
    ['keyboard', '键盘'],
    ['blip', '电子哔哔'],
    ['pop', '泡泡'],
    ['chime', '音盒'],
    ['wood', '木鱼轻敲'],
    ['typewriter', '老式打字机'],
    ['pencil', '铅笔沙沙'],
    ['whisper', '气声'],
]);
export const TYPEWRITER_VOICE_DEFAULTS = Object.freeze({ dialogue: 'dududu', thought: 'follow', narration: 'keyboard' });

const SYNTH_GAIN = 0.3;
const ATTACK_S = 0.005;
const SWEEP_RATIO = 0.6;
const FLOOR = 0.001;
// Every note drifts slightly so repeated characters don't sound machine-stamped.
const PITCH_JITTER = 0.04;
// Speaker names hash onto one of these steps; the same name always gets the same step.
const SPEAKER_PITCH_STEPS = Object.freeze([0.84, 0.9, 0.95, 1, 1.06, 1.12, 1.2]);
// 角色声线：情绪按词微调音高（情绪表见 speech-prosody.js），台词按说话人立绘的横向位置分左右声道。
const PAN_LIMIT = 0.5;
const NOTE_GAP_MS = 80;
// 说话韵律：词首 / 句首 / 强调字必响，但与上一音至少间隔这么久，避免快速档下短采样叠成一团。
const FORCED_MIN_GAP_MS = 40;

let noiseBuffer = null;
const decoded = new Map();
// 语气音让位：打字音都经过一道闸门再进人声总线；语气音响着时闸门关上，念完再放开，听起来像先开口、再出字声。
const gates = new WeakMap();
const GATE_CLOSE_TC_S = 0.015;
const GATE_OPEN_TC_S = 0.06;

function typingGate(bus) {
    let gate = gates.get(bus);
    if (gate) return gate;
    try {
        gate = bus.context.createGain();
        gate.connect(bus);
    } catch {
        return null;
    }
    gates.set(bus, gate);
    return gate;
}

// seconds 秒内的打字音静音（从现在起算）；总线不可用时返回 false。
export function yieldTypewriterAudio(seconds) {
    const bus = busInput('voice');
    const gate = bus && seconds > 0 ? typingGate(bus) : null;
    if (!gate) return false;
    try {
        const now = bus.context.currentTime;
        const param = gate.gain;
        if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
        else param.cancelScheduledValues(now);
        param.setTargetAtTime(0, now, GATE_CLOSE_TC_S);
        param.setTargetAtTime(1, now + seconds, GATE_OPEN_TC_S);
    } catch {
        return false;
    }
    return true;
}

export function normalizeTypewriterVoice(value, fallback) {
    return Object.hasOwn(TYPEWRITER_VOICES, value) ? value : fallback;
}

export function speakerPitch(name) {
    const text = String(name || '').trim();
    if (!text) return 1;
    let hash = 2166136261;
    for (const char of text) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return SPEAKER_PITCH_STEPS[hash % SPEAKER_PITCH_STEPS.length];
}

// posX 为立绘 background-position 横向百分比（50 居中），映射到 -0.5…0.5；无立绘时居中。
export function spritePan(posX) {
    const x = Number(posX);
    if (posX === null || posX === undefined || posX === '' || !Number.isFinite(x)) return 0;
    return Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, (x - 50) / 100));
}

// Resolves which voice, base pitch and pan a page uses from normalized sound settings.
// 角色声线（sound.speakerPitch）开启时：台词与心里话按说话人定音高并随情绪微调；只有台词按立绘分声道，心里话居中。
// 说话韵律开启时情绪音高改由逐音符语调给出，这里只取说话人音高，避免乘两次。
export function resolveTypewriterVoice(sound = {}, textType, speaker, { emotion, posX, prosody = false } = {}) {
    const spoken = textType === 'dialogue' || textType === 'thought';
    const dialogue = normalizeTypewriterVoice(sound.dialoguePreset, TYPEWRITER_VOICE_DEFAULTS.dialogue);
    let preset = normalizeTypewriterVoice(sound.narrationPreset, TYPEWRITER_VOICE_DEFAULTS.narration);
    if (textType === 'dialogue') preset = dialogue;
    if (textType === 'thought') preset = normalizeTypewriterVoice(sound.thoughtPreset, dialogue);
    const voiced = spoken && sound.speakerPitch === true;
    const pitch = voiced ? speakerPitch(speaker) * (prosody ? 1 : emotionPitch(emotion)) : 1;
    const pan = voiced && textType === 'dialogue' ? spritePan(posX) : 0;
    return { preset, pitch, pan };
}

function sweepOf(q) {
    return q.duration * (q.sweep == null ? SWEEP_RATIO : q.sweep);
}

function getNoiseBuffer(context) {
    if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer;
    const length = Math.ceil(context.sampleRate * 0.1);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
}

export function scheduleTypewriterAudio(events, { textType, volume, audioScheduler, phone = false, preset, pitch = 1, pan = 0, prosody = false, emotion, horror = null } = {}) {
    const voiceId = normalizeTypewriterVoice(preset, textType === 'narration' ? 'keyboard' : textType ? 'dududu' : '');
    const voice = TYPEWRITER_VOICES[voiceId];
    if (!voice || !(volume > 0)) return null;
    const url = voice.sample ? SAMPLES[voice.sample] : '';
    // Short samples overlap badly at character rate: skip spaces and punctuation,
    // cap at 12 notes/second and 40 notes/page. Times stay tied to the reveal.
    // 说话韵律：按词取音（词首必响，词内不足 80ms 才丢，害羞放宽到 120ms），每页上限提到 60，
    // 每个音符带上逐字音高 / 音量 / 尾音延长 / 滑音。
    const mood = prosody ? emotionProfile(emotion) : null;
    const minGap = mood?.minGapMs || NOTE_GAP_MS;
    const cap = prosody ? 60 : 40;
    const notes = [];
    let previous = -Infinity;
    for (const event of events) {
        if (!event.text || !/[\p{L}\p{N}]/u.test(event.text)) continue;
        if (event.timeMs - previous < (prosody && event.force ? FORCED_MIN_GAP_MS : minGap)) continue;
        notes.push(prosody ? {
            timeMs: event.timeMs, pitch: pitch * (Number(event.pitch) || 1), gain: Number(event.gain) || 1,
            hold: Number(event.hold) || 1, glide: Number(event.glide) || 0,
            jitter: event.jitter > 0 ? event.jitter : PITCH_JITTER,
        } : { timeMs: event.timeMs, pitch, gain: 1, hold: 1, glide: 0, jitter: PITCH_JITTER });
        previous = event.timeMs;
        if (notes.length >= cap) break;
    }
    // 恐怖题材特化（typewriter-horror.js）：只在传入档位时改写音符，基础音色不受影响。
    if (horror != null) notes.splice(0, notes.length, ...shapeHorrorNotes(notes, horror));
    if (!notes.length) return null;
    const attackScale = mood?.hardAttack ? 0.5 : 1;
    if (typeof audioScheduler === 'function') {
        // timesMs 保留给现有调用方；notes 为新增的逐音符语调。
        const timesMs = notes.map((note) => note.timeMs);
        const detail = notes.map(({ timeMs, pitch: notePitch, gain, hold }) => ({ timeMs, pitch: notePitch, gain, hold }));
        try { return audioScheduler({ textType, volume, timesMs, notes: detail, url, phone, preset: voiceId, pitch, pan: phone ? 0 : pan, horror }) || null; } catch { return null; }
    }
    if (voice.sample && !url.startsWith('data:audio/ogg;base64,')) return null;
    const bus = busInput('voice');
    if (!bus) return null;
    let cancelled = false;
    const sources = [];
    const nodes = [];
    const stop = () => {
        cancelled = true;
        for (const source of sources) {
            try { source.stop(); } catch { /* already stopped */ }
        }
        for (const node of nodes) {
            try { node.disconnect(); } catch { /* already disconnected */ }
        }
        sources.length = 0;
        nodes.length = 0;
    };
    try {
        const context = bus.context;
        const startedAt = context.currentTime;
        // A decode can finish after this page was skipped; never schedule stale notes.
        if (url && !decoded.has(url)) {
            const bytes = Uint8Array.from(atob(url.slice('data:audio/ogg;base64,'.length)), c => c.charCodeAt(0));
            decoded.set(url, context.decodeAudioData(bytes.buffer).catch(() => null));
        }
        Promise.all([resumeAudioBus(), url ? decoded.get(url) : null]).then(([, buffer]) => {
            if (cancelled || (url && !buffer) || context.state !== 'running') return;
            const sink = typingGate(bus) || bus;
            let output = sink;
            // 声像只给正常台词；通话听筒是单声道，不分左右。
            if (!phone && pan && typeof context.createStereoPanner === 'function') {
                const panner = context.createStereoPanner();
                panner.pan.value = pan;
                panner.connect(sink);
                nodes.push(panner);
                output = panner;
            }
            // 通话态：带通滤波模拟听筒音色。
            if (phone) {
                const band = context.createBiquadFilter();
                band.type = 'bandpass';
                band.frequency.value = 1100;
                band.Q.value = 0.7;
                band.connect(sink);
                nodes.push(band);
                output = band;
            }
            if (horror != null) output = connectHorrorChain(context, output, nodes, horror);
            const track = (source, ...chain) => {
                sources.push(source);
                nodes.push(source, ...chain);
                source.onended = () => {
                    for (const node of [source, ...chain]) {
                        try { node.disconnect(); } catch { /* already disconnected */ }
                    }
                };
            };
            for (const note of notes) {
                const when = startedAt + note.timeMs / 1000;
                if (when <= context.currentTime) continue;
                const notePitch = note.pitch * (1 + (Math.random() * 2 - 1) * note.jitter);
                // 滑音：先上滑 glide 再回落到原值（拖腔末音）。
                const glideTo = (param, base, at, span) => {
                    param.setValueAtTime(base, at);
                    param.linearRampToValueAtTime(base * (1 + note.glide), at + span * 0.4);
                    param.linearRampToValueAtTime(base, at + span);
                };
                if (buffer) {
                    const source = context.createBufferSource();
                    const gain = context.createGain();
                    source.buffer = buffer;
                    const rate = (voice.rate || 1) * notePitch;
                    if (note.glide) glideTo(source.playbackRate, rate, when, (buffer.duration || 0.1) / rate);
                    else source.playbackRate.value = rate;
                    // 音量封顶 1：强调字加重时也不削波。
                    gain.gain.value = Math.min(1, volume * note.gain);
                    source.connect(gain);
                    gain.connect(output);
                    track(source, gain);
                    source.start(when);
                    continue;
                }
                for (const q of voice.partials) {
                    const at = when + q.start;
                    const peak = Math.min(1, q.gain * SYNTH_GAIN * volume * note.gain);
                    const attack = (q.attack == null ? ATTACK_S : q.attack) * attackScale;
                    const duration = q.duration * note.hold;
                    const gain = context.createGain();
                    gain.gain.setValueAtTime(0, at);
                    gain.gain.linearRampToValueAtTime(peak, at + attack);
                    gain.gain.exponentialRampToValueAtTime(peak * FLOOR, at + duration);
                    gain.connect(output);
                    let source;
                    if (q.noise) {
                        const filter = context.createBiquadFilter();
                        filter.type = 'bandpass';
                        if (note.glide) glideTo(filter.frequency, q.band * notePitch, at, duration);
                        else filter.frequency.value = q.band * notePitch;
                        filter.Q.value = q.q;
                        source = context.createBufferSource();
                        source.buffer = getNoiseBuffer(context);
                        // 拖腔可能超过 0.1s 噪声缓冲，循环播放直到 stop。
                        source.loop = true;
                        source.connect(filter);
                        filter.connect(gain);
                        track(source, filter, gain);
                    } else {
                        source = context.createOscillator();
                        source.type = q.wave;
                        if (note.glide) glideTo(source.frequency, q.from * notePitch, at, duration);
                        else {
                            source.frequency.setValueAtTime(q.from * notePitch, at);
                            if (q.from !== q.to) source.frequency.exponentialRampToValueAtTime(q.to * notePitch, at + sweepOf(q));
                        }
                        source.connect(gain);
                        track(source, gain);
                    }
                    source.start(at);
                    source.stop(at + duration + 0.02);
                }
            }
        }).catch(() => { stop(); });
        return { stop };
    } catch {
        stop();
        return null;
    }
}
