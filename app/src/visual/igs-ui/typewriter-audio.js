// Replaced by the build with the two validated OGG payloads.
const SOURCES = Object.freeze({
    dialogue: '__IGS_TYPEWRITER_AUDIO__dududu.ogg__',
    narration: '__IGS_TYPEWRITER_AUDIO__keyboard.ogg__',
});
let audioContext = null;
const decoded = new Map();

export function scheduleTypewriterAudio(events, { textType, volume, audioScheduler } = {}) {
    const url = SOURCES[textType];
    if (!url || !(volume > 0)) return null;
    // Short samples overlap badly at character rate: skip spaces and punctuation,
    // cap at 12 notes/second and 40 notes/page. Times stay tied to the reveal.
    const notes = [];
    let previous = -Infinity;
    for (const event of events) {
        if (!event.text || !/[\p{L}\p{N}]/u.test(event.text) || event.timeMs - previous < 80) continue;
        notes.push(event.timeMs);
        previous = event.timeMs;
        if (notes.length >= 40) break;
    }
    if (!notes.length) return null;
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ textType, volume, timesMs: notes, url }) || null; } catch { return null; }
    }
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context || !url.startsWith('data:audio/ogg;base64,')) return null;
    let cancelled = false;
    const voices = [];
    const stop = () => {
        cancelled = true;
        for (const voice of voices) {
            try { voice.stop(); } catch { /* already stopped */ }
            try { voice.disconnect(); } catch { /* already disconnected */ }
        }
        voices.length = 0;
    };
    try {
        if (!audioContext) audioContext = new Context();
        const context = audioContext;
        const startedAt = context.currentTime;
        // A decode can finish after this page was skipped; never schedule stale notes.
        if (!decoded.has(url)) {
            const bytes = Uint8Array.from(atob(url.slice('data:audio/ogg;base64,'.length)), c => c.charCodeAt(0));
            decoded.set(url, context.decodeAudioData(bytes.buffer).catch(() => null));
        }
        Promise.all([Promise.resolve(context.resume()), decoded.get(url)]).then(([, buffer]) => {
            if (cancelled || !buffer || context.state !== 'running') return;
            for (const ms of notes) {
                const when = startedAt + ms / 1000;
                if (when <= context.currentTime) continue;
                const voice = context.createBufferSource();
                const gain = context.createGain();
                voice.buffer = buffer;
                gain.gain.value = volume;
                voice.connect(gain);
                gain.connect(context.destination);
                voice.onended = () => {
                    voice.disconnect();
                    gain.disconnect();
                    const index = voices.indexOf(voice);
                    if (index >= 0) voices.splice(index, 1);
                };
                voices.push(voice);
                voice.start(when);
            }
        }).catch(() => { stop(); });
        return { stop };
    } catch {
        stop();
        return null;
    }
}
