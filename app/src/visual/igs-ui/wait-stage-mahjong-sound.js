// 立直麻将音效：全部实时合成，不带音频文件。宿主借出主程序混音总线（ctx.audio）时接进 sfx 子总线，
// 跟总音量与离开页面挂起走；没有就自己开一个 AudioContext。开关存本地，默认开。
export const MAHJONG_SOUND_KEY = 'igs-wait-mahjong-sound-v1';
export const MAHJONG_SOUNDS = Object.freeze(['deal', 'draw', 'discard', 'riichi', 'call', 'kan', 'turn', 'win', 'lose', 'dealin', 'drawgame', 'top', 'final']);

const LEVEL = 0.55;

function readEnabled(storage) {
    try { return !storage || storage.getItem(MAHJONG_SOUND_KEY) !== '0'; } catch (error) { return true; }
}

export function createMahjongSound({ audio = null, storage = null, random = Math.random, global = globalThis } = {}) {
    let enabled = readEnabled(storage);
    let own = null;

    function output() {
        if (audio && typeof audio.context === 'function') {
            const ctx = audio.context();
            const input = ctx && typeof audio.input === 'function' ? audio.input() : null;
            if (ctx && input) {
                if (ctx.state === 'suspended' && typeof audio.resume === 'function') audio.resume();
                return { ctx, input };
            }
        }
        if (!own) {
            const Context = global.AudioContext || global.webkitAudioContext;
            if (!Context) return null;
            try { own = new Context(); } catch (error) { return null; }
        }
        if (own.state === 'suspended' && typeof own.resume === 'function') own.resume().catch(() => {});
        return { ctx: own, input: own.destination };
    }

    // freq 可带 to 滑音；type 为振荡器波形。
    function tone(out, at, { freq, to, dur, type = 'sine', gain = 0.2, attack = 0.006 }) {
        const { ctx, input } = out;
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, at);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
        amp.gain.setValueAtTime(0.0001, at);
        amp.gain.exponentialRampToValueAtTime(gain * LEVEL, at + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(amp);
        amp.connect(input);
        osc.start(at);
        osc.stop(at + dur + 0.02);
    }

    function noise(out, at, { dur, freq, q = 1, type = 'bandpass', gain = 0.3 }) {
        const { ctx, input } = out;
        const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i += 1) data[i] = (random() * 2 - 1) * (1 - i / frames) ** 2;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        filter.Q.value = q;
        const amp = ctx.createGain();
        amp.gain.value = gain * LEVEL;
        src.connect(filter);
        filter.connect(amp);
        amp.connect(input);
        src.start(at);
    }

    // 牌落桌面：一声脆响加一点木头闷声，每次音高略有出入。
    function clack(out, at, weight = 1) {
        const shift = 0.92 + random() * 0.16;
        noise(out, at, { dur: 0.05, freq: 2600 * shift, q: 1.4, gain: 0.55 * weight });
        tone(out, at, { freq: 230 * shift, to: 150 * shift, dur: 0.08, gain: 0.3 * weight });
    }

    function notes(out, at, list, { step, dur, type = 'triangle', gain = 0.2, last = dur }) {
        list.forEach((freq, index) => {
            const final = index === list.length - 1;
            tone(out, at + index * step, { freq, dur: final ? last : dur, type, gain });
        });
    }

    const RECIPES = {
        deal(out, at) { for (let i = 0; i < 7; i += 1) noise(out, at + i * 0.045 + random() * 0.015, { dur: 0.035, freq: 1800 + random() * 1200, q: 0.8, gain: 0.22 }); },
        draw(out, at) { noise(out, at, { dur: 0.03, freq: 4200, q: 0.7, type: 'highpass', gain: 0.16 }); },
        discard(out, at) { clack(out, at); },
        riichi(out, at) {
            clack(out, at, 1.1);
            tone(out, at + 0.04, { freq: 420, to: 1260, dur: 0.32, gain: 0.12 });
            notes(out, at + 0.08, [660, 880, 1320], { step: 0.07, dur: 0.22, last: 0.55, gain: 0.16 });
        },
        call(out, at) {
            clack(out, at, 0.9);
            notes(out, at + 0.03, [880, 1175], { step: 0.08, dur: 0.14, gain: 0.2 });
        },
        kan(out, at) {
            clack(out, at, 1.1);
            notes(out, at + 0.03, [784, 988, 1175], { step: 0.07, dur: 0.14, last: 0.26, gain: 0.2 });
        },
        turn(out, at) { notes(out, at, [1319, 1760], { step: 0.07, dur: 0.16, type: 'sine', gain: 0.14 }); },
        win(out, at) {
            notes(out, at, [523, 659, 784, 1047], { step: 0.09, dur: 0.16, last: 0.7, gain: 0.22 });
            tone(out, at + 0.36, { freq: 2093, dur: 0.5, type: 'sine', gain: 0.06 });
        },
        lose(out, at) { notes(out, at, [659, 587, 494], { step: 0.12, dur: 0.2, type: 'sine', last: 0.45, gain: 0.15 }); },
        dealin(out, at) {
            tone(out, at, { freq: 180, to: 90, dur: 0.35, type: 'triangle', gain: 0.28 });
            notes(out, at + 0.05, [494, 466, 392], { step: 0.14, dur: 0.22, type: 'sine', last: 0.5, gain: 0.14 });
        },
        drawgame(out, at) { notes(out, at, [523, 440], { step: 0.16, dur: 0.28, type: 'sine', last: 0.4, gain: 0.14 }); },
        top(out, at) {
            notes(out, at, [523, 659, 784, 1047, 1319], { step: 0.1, dur: 0.18, last: 0.9, gain: 0.22 });
            notes(out, at + 0.5, [1047, 1319, 1568], { step: 0, dur: 0.9, type: 'sine', gain: 0.08 });
        },
        final(out, at) { notes(out, at, [523, 587, 659, 523], { step: 0.14, dur: 0.22, type: 'sine', last: 0.6, gain: 0.15 }); },
    };

    return {
        get enabled() { return enabled; },
        setEnabled(value) {
            enabled = Boolean(value);
            try { if (storage) storage.setItem(MAHJONG_SOUND_KEY, enabled ? '1' : '0'); } catch (error) { /* 存不下就只管这一场 */ }
            return enabled;
        },
        play(name) {
            const recipe = RECIPES[name];
            if (!enabled || !recipe) return false;
            const out = output();
            if (!out) return false;
            try {
                recipe(out, out.ctx.currentTime + 0.01);
                return true;
            } catch (error) {
                return false;
            }
        },
    };
}
