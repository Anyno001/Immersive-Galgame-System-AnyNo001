import { resolvePlaceAmbience } from '../../scene/place-ambience.js';

// 水下打字机：人在水底时，打字音隔着水变闷、略低，逐字间偶尔「啵」地冒个泡，句末一串「咕嘟咕嘟」；
// 文字逐行揭开时从下往上浮起，文字框上沿冒几个小气泡。基础打字机不变，只在地点是水下时启用，不分世界观。
export const UNDERWATER_TYPEWRITER = Object.freeze({ cutoff: 900, pitch: 0.9, bubbleChance: 0.22, maxBubbles: 10, tail: Object.freeze([110, 210, 290]) });
const BUBBLE_VISUAL_COUNT = 5;
const BUBBLE_VISUAL_MS = 1400;
const FLOAT_MS = 700;

export function isUnderwaterScene(content, readerSettings) {
    const location = content && content.sceneLocation;
    const worldview = readerSettings && readerSettings._worldview;
    const place = resolvePlaceAmbience(location, { worldview });
    return Boolean(place && place.kind === 'underwater');
}

function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// 改写音符（整体降调）并给出气泡时刻：按固定种子在少量字后冒泡，句末追加一串；同一句重放位置不变。
export function shapeUnderwaterNotes(notes) {
    if (!Array.isArray(notes) || !notes.length) return { notes: Array.isArray(notes) ? notes : [], bubbles: [] };
    const rand = seeded(11 + notes.length * 31);
    const shaped = notes.map((note) => ({ ...note, pitch: note.pitch * UNDERWATER_TYPEWRITER.pitch }));
    const bubbles = [];
    for (const note of notes.slice(0, -1)) {
        if (bubbles.length >= UNDERWATER_TYPEWRITER.maxBubbles - UNDERWATER_TYPEWRITER.tail.length) break;
        if (rand() < UNDERWATER_TYPEWRITER.bubbleChance) bubbles.push({ timeMs: note.timeMs + 40, freq: 300 + rand() * 220 });
    }
    const last = notes[notes.length - 1].timeMs;
    for (const offset of UNDERWATER_TYPEWRITER.tail) bubbles.push({ timeMs: last + offset, freq: 260 + rand() * 260 });
    return { notes: shaped, bubbles };
}

export function connectUnderwaterChain(context, output, nodes) {
    if (!context || typeof context.createBiquadFilter !== 'function') return output;
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = UNDERWATER_TYPEWRITER.cutoff;
    low.Q.value = 0.8;
    low.connect(output);
    nodes.push(low);
    return low;
}

// 气泡：极短的正弦上滑，绕过低通直接进总线，才清楚地「啵」一声。
export function scheduleBubbleBlips(context, output, bubbles, startedAt, peak, track) {
    for (const bubble of bubbles) {
        const at = startedAt + bubble.timeMs / 1000;
        if (at <= context.currentTime) continue;
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(bubble.freq, at);
        osc.frequency.exponentialRampToValueAtTime(bubble.freq * 2.6, at + 0.06);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(peak, at + 0.004);
        gain.gain.exponentialRampToValueAtTime(peak * 0.0001, at + 0.08);
        osc.connect(gain);
        gain.connect(output);
        track(osc, gain);
        osc.start(at);
        osc.stop(at + 0.1);
    }
}

function lowQuality(target) {
    return Boolean(target && typeof target.closest === 'function' && target.closest('[data-igs-quality="low"]'));
}

export function underwaterVisualsAllowed(target) {
    return !lowQuality(target);
}

// 文字框上沿冒几个小气泡：一次性 WAAPI，播完自己移除；翻页取消时 remove() 立即清掉。
export function spawnTypingBubbles(target, { duration = 0, delay = 0 } = {}) {
    const doc = target && target.ownerDocument;
    const parent = target && target.parentNode;
    if (!doc || !parent || typeof doc.createElement !== 'function' || typeof parent.insertBefore !== 'function' || lowQuality(target)) return null;
    const width = Number(target.offsetWidth) || 0;
    if (!(width > 0)) return null;
    const layer = doc.createElement('div');
    layer.className = 'igs-tw-bubbles';
    layer.setAttribute('aria-hidden', 'true');
    const style = (el, map) => { for (const [k, v] of Object.entries(map)) el.style.setProperty(k, v); };
    style(layer, { position: 'absolute', left: `${target.offsetLeft || 0}px`, top: `${target.offsetTop || 0}px`, width: `${width}px`, height: '0', 'pointer-events': 'none', overflow: 'visible' });
    const rand = seeded(7 + width);
    const span = Math.max(400, duration);
    for (let i = 0; i < BUBBLE_VISUAL_COUNT; i++) {
        const size = 5 + Math.round(rand() * 5);
        const bubble = doc.createElement('i');
        style(bubble, {
            position: 'absolute', left: `${Math.round(8 + rand() * 84)}%`, top: '0', width: `${size}px`, height: `${size}px`, 'border-radius': '50%',
            border: '1.5px solid rgba(225,248,255,.8)', background: 'radial-gradient(circle at 35% 30%,rgba(255,255,255,.75),rgba(255,255,255,.06) 55%)',
            opacity: '0', 'box-sizing': 'border-box',
        });
        layer.appendChild(bubble);
        if (typeof bubble.animate === 'function') {
            try {
                bubble.animate([
                    { opacity: 0, transform: 'translate3d(0,0,0) scale(.6)' },
                    { opacity: 1, offset: 0.2 },
                    { opacity: 0, transform: `translate3d(${Math.round(rand() * 10 - 5)}px,-46px,0) scale(1.1)` },
                ], { duration: BUBBLE_VISUAL_MS, delay: delay + (span * i) / BUBBLE_VISUAL_COUNT, easing: 'ease-out', fill: 'both' });
            } catch { /* 无 WAAPI 时气泡保持透明 */ }
        }
    }
    parent.insertBefore(layer, target.nextSibling || null);
    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        if (layer.parentNode) layer.parentNode.removeChild(layer);
    };
    const timer = setTimeout(remove, delay + span + BUBBLE_VISUAL_MS + 100);
    return { remove() { clearTimeout(timer); remove(); } };
}

// 逐行浮起：叠加在揭示动画上的一次性 translateY（composite add），每行从被揭开的那一刻起浮。
export function floatKeyframes() {
    return [{ transform: 'translateY(5px)' }, { transform: 'translateY(-1.5px)', offset: 0.6 }, { transform: 'translateY(0px)' }];
}

export function floatTiming(startMs) {
    return { duration: FLOAT_MS, delay: Math.max(0, startMs), easing: 'ease-out', fill: 'backwards', composite: 'add' };
}
