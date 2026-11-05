import { PHASE_TEMPO, SWAY_AMPLITUDE, nextBeat, swayAt } from './romance-intimate.js';
import { createIntimateVoice } from './romance-intimate-audio.js';
import { intimateCreakWindow, intimateHeartBpm, isWhisperCard } from '../../scene/intimate-duel.js';

const SLOW_TEMPO = Object.freeze({ ...PHASE_TEMPO.rise, bpm: 44, velocity: Object.freeze([0.35, 0.55]) });
const SWAY = Object.freeze({ x: SWAY_AMPLITUDE.weak.x * 0.7, y: SWAY_AMPLITUDE.weak.y * 0.7, r: SWAY_AMPLITUDE.weak.r * 0.7, shake: 0 });
const CREAK_VOLUME = 0.35;
const DIM_MS = 520;

export const INTIMATE_DUEL_FX_STYLE_TEXT = `
@keyframes igs-duel-beat{0%,100%{outline-color:transparent;}8%,22%{outline-color:var(--igs-cb-duel-accent,#c8506e);}}
#igs-combat-panel[data-igs-duel-beat] :is(.igs-combat-card,.cx-card){outline:2px solid transparent;outline-offset:-2px;animation:igs-duel-beat var(--igs-duel-beat,0.9s) ease-out infinite;}
#igs-combat-panel[data-igs-combat-reduced] :is(.igs-combat-card,.cx-card){animation:none;}
.igs-duel-dim{position:absolute;inset:0;z-index:5;background:var(--igs-cb-duel-ground,#121212);opacity:0;pointer-events:none;animation:igs-duel-dim ${DIM_MS}ms ease-in-out both;}
@keyframes igs-duel-dim{0%{opacity:0;}45%{opacity:.5;}100%{opacity:0;}}
.igs-duel-result{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;flex:1;min-height:0;background:var(--igs-cb-duel-ground,#121212);animation:igs-duel-fade 900ms ease-out both;}
.igs-duel-result-line{margin:0;padding:0 24px;color:var(--igs-cb-duel-ink,#d8d8d8);font-size:14px;letter-spacing:.14em;line-height:1.9;text-align:center;}
@keyframes igs-duel-fade{0%{opacity:0;}100%{opacity:1;}}
#igs-overlay[data-igs-duel] #igs-sprite{translate:var(--igs-duel-sway-x,0) var(--igs-duel-sway-y,0);rotate:var(--igs-duel-sway-r,0deg);}
`;

export function createIntimateDuelFx({ doc, getRoot, getOverlay, sfx, getRhythmSound = () => true, reduced = () => false, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
    let lastBpm = 0;
    let creaking = false;
    let timer = null;
    let beat = null;
    let gap = 1;
    let voice = null;

    const root = () => getRoot?.() || null;
    const stageEl = () => getOverlay?.() || null;

    function setBeat(bpm) {
        const el = root();
        if (!el) return;
        if (reduced() || !(bpm > 0)) {
            el.removeAttribute?.('data-igs-duel-beat');
            return;
        }
        if (bpm !== lastBpm) el.style?.setProperty?.('--igs-duel-beat', `${(60 / bpm).toFixed(3)}s`);
        el.setAttribute?.('data-igs-duel-beat', '');
        lastBpm = bpm;
    }

    function swayVars(x, y, r) {
        const overlay = stageEl();
        if (!overlay) return;
        const set = (name, value) => (value === null ? overlay.style?.removeProperty?.(name) : overlay.style?.setProperty?.(name, value));
        set('--igs-duel-sway-x', x === null ? null : `${x}px`);
        set('--igs-duel-sway-y', y === null ? null : `${y}px`);
        set('--igs-duel-sway-r', r === null ? null : `${r}deg`);
    }

    function tick() {
        const t = now() / 1000;
        if (!beat) {
            beat = { t, index: 0, bpm: 0, velocity: 0.4 };
            beat = nextBeat(beat, SLOW_TEMPO, Math.random);
            gap = Math.max(0.2, beat.t - t);
        }
        while (t >= beat.t) {
            const prev = beat;
            beat = nextBeat(prev, SLOW_TEMPO, Math.random);
            gap = Math.max(0.2, beat.t - prev.t);
            creakOnce(prev);
        }
        if (reduced()) return;
        const offset = swayAt({ ...beat, t: beat.t - gap }, gap, t, SWAY);
        swayVars(offset.x, offset.y, offset.r);
    }

    function creakOnce(at) {
        if (!getRhythmSound()) return;
        if (!voice) voice = createIntimateVoice(CREAK_VOLUME);
        const ctx = voice?.ctx;
        if (!ctx) return;
        voice.creak(ctx.currentTime + 0.02, { material: 'wood', velocity: Math.min(0.5, at.velocity * 0.6), down: true, duration: 0.45 });
    }

    function startCreak() {
        if (creaking) return;
        creaking = true;
        beat = null;
        timer = setTimer(function loop() {
            if (!creaking) return;
            tick();
            timer = setTimer(loop, 50);
        }, 50);
    }

    function stopCreak() {
        if (!creaking) return;
        creaking = false;
        if (timer !== null) clearTimer(timer);
        timer = null;
        beat = null;
        swayVars(null, null, null);
        try { voice?.dispose?.(); } catch { /* 已释放 */ }
        voice = null;
    }

    function sync({ ratio = 1, turn = 1, rounds = 0, ended = false } = {}) {
        if (ended) {
            stopCreak();
            setBeat(0);
            return;
        }
        setBeat(intimateHeartBpm(ratio));
        if (intimateCreakWindow(turn, rounds)) startCreak(); else stopCreak();
    }

    function onPlay(cardName) {
        if (!isWhisperCard(cardName)) return;
        sfx?.('range-whisper');
        const el = root();
        if (!el || reduced() || typeof doc?.createElement !== 'function') return;
        const dim = doc.createElement('div');
        dim.className = 'igs-duel-dim';
        el.appendChild(dim);
        setTimer(() => dim.remove?.(), DIM_MS + 50);
    }

    function stop() {
        stopCreak();
        setBeat(0);
        lastBpm = 0;
    }

    return { sync, onPlay, stop };
}
