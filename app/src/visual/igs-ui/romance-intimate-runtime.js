import { prefersReducedMotion } from './reduced-motion.js';
import { resumeAudioBus } from './audio-bus.js';
import { duckSceneAudio } from './scene-audio.js';
import { normalizeFxSoundSettings } from './fx-settings.js';
import { createIntimateVoice } from './romance-intimate-audio.js';
import { applySenseToPlan } from './romance-senses.js';
import {
    BG_SWAY,
    BREATH_PERIOD,
    CAST_SWAY,
    DUCK_BY_LEVEL,
    HEART_BPM,
    PHASE_TEMPO,
    SOLO_SWAY,
    SOLO_SWAY_SCALE,
    SOLO_TEMPO,
    SWAY_AMPLITUDE,
    beatPush,
    heartPulse,
    nextBeat,
    resolveIntimateMaterial,
    resolveIntimatePhase,
    resolveIntimateTempo,
    swayAt,
} from './romance-intimate.js';

// 亲密声画：一个节拍时钟同时驱动吱呀声与画面晃动、心跳声与暗角脉动。有声音时以 AudioContext 时间为准，画面每帧读它，不会越跑越偏。
// 前景层 .igs-rm-front 在立绘之上、对话框之下，只画在画面边缘；晃动只改位移与旋转，不给背景、立绘、CG 加任何滤镜。
const LOOKAHEAD_S = 0.3;
const PUMP_MS = 50;
// 顶点：全场静音这么久，再慢慢回来。
const PEAK_HOLD_S = 1.5;
const VEIL_MS = Object.freeze({ flash: 2400, dark: 2600 });
const SWEEP_MS = 1800;
const RIPPLE_MS = 2300;
// 外面有动静：场景声几乎压没，这么久之后再回来。
const NOISE_DUCK_MS = 2600;
// 独处的呼吸：像捂着嘴，高频压低；呼气时偶尔憋住不出声。
const SOLO_BREATH_LOWPASS = 1100;
const SOLO_BREATH_HOLD = 0.25;
// 触屏设备的画面更新限到约 30 帧。
const COARSE_FRAME_MS = 32;
const SWAY_TARGETS = Object.freeze([['#igs-bg', BG_SWAY], ['#igs-sprite', 1], ['#igs-cast', CAST_SWAY]]);
const SWAY_VARS = Object.freeze(['--igs-rm-sx', '--igs-rm-sy', '--igs-rm-sr']);
const RHYTHM_MATERIALS = new Set(['wood', 'metal', 'sofa']);

const states = new WeakMap();

// 纯函数：本页该开哪些声音与画面。level 为亲密档位（3 = 情事），phase 仅情事有意义。
// sense 为本页主导感官（romance-senses），undress 非空表示本页有脱衣动作；
// solo 表示独处的情事段（没有床的往返，只有被褥摩擦与轻颤），noise 为本页门外的动静（steps / knock / phone / door）。
export function resolveIntimatePlan({ level = 0, phase = 'steady', settings = {}, sound = {}, reduced = false, coarse = false, low = false, location = '', sense = '', undress = '', solo = false, noise = '' } = {}) {
    if (!(level > 0)) return null;
    const soundOk = sound.enabled !== false && sound.volume > 0;
    const mild = level === 1 || level === 2;
    const nsfw = level === 3;
    const soft = mild && settings.softSound !== false;
    const nsfwSound = nsfw && settings.nsfwSound === true;
    const edge = settings.edgeFx !== false;
    const heartBpm = level === 2 && (soft || edge) ? HEART_BPM[2] : nsfw && (nsfwSound || edge) ? HEART_BPM[phase] : 0;
    const alone = nsfw && solo === true && settings.solo !== false;
    const rhythmic = nsfw && settings.rhythm === true && phase !== 'after';
    const creak = rhythmic && soundOk && settings.rhythmSound !== false;
    const swayOn = rhythmic && !reduced && settings.sway !== 'off';
    const sway = !swayOn ? null
        : alone ? soloSway(settings.sway) : SWAY_AMPLITUDE[settings.sway] || SWAY_AMPLITUDE.medium;
    const plan = {
        level,
        phase: nsfw ? phase : '',
        volume: soundOk ? sound.volume : 0,
        heartBpm,
        heartAudio: soundOk && ((level === 2 && soft) || nsfwSound),
        breath: soundOk ? (level === 2 && soft ? BREATH_PERIOD[2] : nsfwSound ? BREATH_PERIOD[phase] : 0) : 0,
        cloth: soundOk && ((level === 2 && soft) || nsfwSound),
        duck: soft || nsfwSound || rhythmic ? DUCK_BY_LEVEL[level] : 0,
        tinnitus: soundOk && nsfwSound && phase === 'climax',
        ticks: soundOk && nsfwSound && phase === 'after',
        tempo: creak || sway ? (alone ? SOLO_TEMPO : PHASE_TEMPO)[phase] : null,
        creak,
        material: alone ? 'futon' : resolveIntimateMaterial(location),
        knock: creak && !alone && (phase === 'climax' || settings.strength === 'strong'),
        sway,
        settle: nsfw && !alone && settings.rhythm === true && settings.rhythmSound !== false && soundOk,
        solo: alone,
        breathLowpass: alone ? SOLO_BREATH_LOWPASS : 0,
        noise: soundOk && noise ? noise : '',
        whisper: (level === 2 && soft) || nsfwSound,
        vignette: edge && level >= 2,
        gobo: edge && mild,
        haze: edge && nsfw && !coarse && !low && (phase === 'steady' || phase === 'climax') ? (phase === 'climax' ? 1 : 0.55) : 0,
        fringe: edge && nsfw && phase === 'climax',
        edge,
    };
    let out = plan;
    if (sense && settings.senses !== false) out = applySenseToPlan(plan, sense, { edge, soundOk, coarse, low });
    if (undress && settings.undress !== false) {
        out = { ...out, undress: soundOk && (nsfw ? nsfwSound : soft), undressVisual: edge };
    }
    const any = out.heartBpm || out.breath || out.duck || out.tempo || out.ticks || out.vignette || out.gobo || out.cloth || out.settle
        || (out.sense && out.senseVisual) || out.undress || out.undressVisual || out.noise;
    return any ? out : null;
}

function soloSway(level) {
    const k = SOLO_SWAY_SCALE[level] || 1;
    return { x: SOLO_SWAY.x * k, y: SOLO_SWAY.y * k, r: SOLO_SWAY.r * k, shake: SOLO_SWAY.shake * k };
}

function needsVoice(plan) {
    return Boolean(plan && plan.volume > 0 && (plan.heartAudio || plan.breath || plan.cloth || plan.creak || plan.tinnitus || plan.ticks || plan.settle || plan.undress || plan.noise));
}

function isCoarse() {
    try { return Boolean(globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches); } catch { return false; }
}

function setAttr(el, name, value) {
    if (!el || typeof el.setAttribute !== 'function') return;
    if (value == null || value === false) {
        if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== String(value)) {
        el.setAttribute(name, String(value));
    }
}

function setVar(el, name, value) {
    if (!el || !el.style || typeof el.style.setProperty !== 'function') return;
    if (value == null) el.style.removeProperty(name);
    else el.style.setProperty(name, String(value));
}

function stageOf(root) {
    return (root && typeof root.querySelector === 'function' && root.querySelector('#igs-stage-motion')) || null;
}

function makeState(stage) {
    const view = stage.ownerDocument && stage.ownerDocument.defaultView;
    return {
        stage,
        plan: null,
        voice: null,
        rng: Math.random,
        pump: null,
        frame: null,
        lastFrame: 0,
        requestFrame: view && typeof view.requestAnimationFrame === 'function' ? view.requestAnimationFrame.bind(view) : null,
        cancelFrame: view && typeof view.cancelAnimationFrame === 'function' ? view.cancelAnimationFrame.bind(view) : null,
        perfNow: () => ((view && view.performance) || globalThis.performance || Date).now() / 1000,
        beats: [],
        hearts: [],
        heartBpm: 0,
        nextHeart: 0,
        nextBreath: 0,
        inhale: true,
        nextTick: 0,
        tock: false,
        hold: 0,
        span: null,
        phaseStart: 0,
        duck: null,
        duckRatio: 0,
        front: null,
        swayFade: 0,
        swayAmp: null,
        swayWritten: false,
        timers: new Set(),
        page: null,
        coarse: false,
        earSide: -1,
    };
}

function schedNow(state) {
    return state.voice ? state.voice.ctx.currentTime : state.perfNow();
}

// 画面时间扣掉输出延迟，让晃动落在真正听到吱呀的那一刻。
function viewNow(state) {
    if (!state.voice) return state.perfNow();
    const ctx = state.voice.ctx;
    return ctx.currentTime - (Number(ctx.outputLatency) || Number(ctx.baseLatency) || 0);
}

// Node（测试）里的计时器不拖住进程退出；浏览器返回数字，没有 unref。
function unref(id) {
    if (id && typeof id.unref === 'function') id.unref();
    return id;
}

function later(state, ms, fn) {
    const id = unref(setTimeout(() => {
        state.timers.delete(id);
        fn();
    }, ms));
    state.timers.add(id);
}

function resetQueues(state) {
    state.beats = [];
    state.hearts = [];
    state.nextHeart = 0;
    state.nextBreath = 0;
    state.nextTick = 0;
    state.hold = 0;
}

// 返回时钟是否换了（有声 ↔ 无声切换时，排程队列按新时钟重来）。
function syncVoice(state, plan) {
    if (needsVoice(plan)) {
        if (!state.voice) {
            state.voice = createIntimateVoice(plan.volume);
            if (state.voice) {
                resetQueues(state);
                resumeAudioBus();
                return true;
            }
        } else {
            state.voice.setVolume(plan.volume);
        }
    } else if (state.voice && !(state.voiceHold > state.perfNow())) {
        state.voice.dispose();
        state.voice = null;
        resetQueues(state);
        return true;
    }
    return false;
}

function syncDuck(state, ratio) {
    if (ratio === state.duckRatio) return;
    if (state.duck) state.duck();
    state.duck = ratio > 0 ? duckSceneAudio({ ratio }) : null;
    state.duckRatio = ratio;
}

function scheduleBeat(state, plan, beat) {
    const voice = state.voice;
    if (!voice || !plan.creak) return;
    if (plan.solo) {
        voice.rustle(beat.t, beat.velocity * (plan.creakGain > 0 ? plan.creakGain : 1));
        return;
    }
    const period = 60 / beat.bpm;
    const { material } = plan;
    const velocity = beat.velocity * Math.min(1.15, beat.swell || 1) * (plan.creakGain > 0 ? plan.creakGain : 1);
    voice.creak(beat.t, { material, velocity, down: true, duration: period * 0.5 });
    if (RHYTHM_MATERIALS.has(material)) {
        voice.creak(beat.t + period * 0.45, { material, velocity: velocity * 0.8, down: false, duration: period * 0.4 });
        if (plan.phase !== 'rise' && material !== 'sofa' && state.rng() < 0.3) voice.spring(beat.t + 0.02, velocity);
        if (plan.knock && state.rng() < (plan.phase === 'climax' ? 0.1 : 0.04)) voice.knock(beat.t + 0.01, velocity);
    }
}

// 排程器：往前看 LOOKAHEAD_S 秒，把节拍、心跳、呼吸、钟声排进去；顶点静音期间什么都不排。
function pump(state) {
    const plan = state.plan;
    if (!plan) return;
    const t = schedNow(state);
    if (t < state.hold) return;
    const horizon = t + LOOKAHEAD_S;
    const voice = state.voice;
    const tempo = plan.tempo ? resolveIntimateTempo(plan.phase, state.span, t - state.phaseStart, plan.solo ? SOLO_TEMPO : PHASE_TEMPO) : null;
    if (tempo) {
        let last = state.beats[state.beats.length - 1];
        if (!last || last.t < t - 1) {
            last = { t: t + 0.1, index: 0, bpm: tempo.bpm * 0.8, velocity: tempo.velocity[0], swell: tempo.swell, jx: 0, jy: 0 };
            state.beats = [last];
            scheduleBeat(state, plan, last);
        }
        while (last.t < horizon) {
            last = nextBeat(last, tempo, state.rng);
            state.beats.push(last);
            scheduleBeat(state, plan, last);
        }
        if (state.beats.length > 6) state.beats.splice(0, state.beats.length - 6);
    }
    if (plan.heartBpm) {
        if (!(state.nextHeart > t - 1)) state.nextHeart = t + 0.1;
        while (state.nextHeart < horizon) {
            state.heartBpm = state.heartBpm > 0 ? state.heartBpm + (plan.heartBpm - state.heartBpm) * 0.25 : plan.heartBpm;
            const at = state.nextHeart;
            state.hearts.push({ t: at, bpm: state.heartBpm });
            if (voice && plan.heartAudio) voice.heartbeat(at, { bpm: state.heartBpm, gain: (plan.level === 3 ? 0.7 : 0.5) * (plan.heartGain > 0 ? plan.heartGain : 1) });
            state.nextHeart = at + (60 / state.heartBpm) * (1 + (state.rng() - 0.5) * 0.04);
        }
        if (state.hearts.length > 4) state.hearts.splice(0, state.hearts.length - 4);
    }
    if (voice && plan.breath) {
        if (!(state.nextBreath > t - 1)) state.nextBreath = t + 0.4;
        while (state.nextBreath < horizon) {
            const at = state.nextBreath;
            const share = state.inhale ? 0.4 : 0.6;
            // 耳边：呼吸贴到同一侧耳朵（和画面那一侧的光对上）。
            const pan = plan.breathPan
                ? state.earSide * (state.inhale ? 0.7 : 0.8)
                : plan.phase === 'climax' ? (state.inhale ? -0.35 : 0.35) : (state.rng() - 0.5) * 0.2;
            const gain = (plan.level === 3 ? 0.85 : 0.65) * (plan.breathGain > 0 ? plan.breathGain : 1);
            const held = plan.solo && !state.inhale && state.rng() < SOLO_BREATH_HOLD;
            if (!held) voice.breath(at, { inhale: state.inhale, duration: plan.breath * share * 0.7, gain, pan, lowpass: plan.breathLowpass || 2400 });
            state.nextBreath = at + plan.breath * share * (1 + (state.rng() - 0.5) * 0.12);
            state.inhale = !state.inhale;
        }
    }
    if (voice && plan.ticks) {
        if (!(state.nextTick > t - 1)) state.nextTick = t + 0.6;
        while (state.nextTick < horizon) {
            voice.tick(state.nextTick, state.tock, 0.8);
            state.tock = !state.tock;
            state.nextTick += 1;
        }
    }
}

function latest(list, t) {
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].t <= t) return { item: list[i], next: list[i + 1] || null };
    }
    return null;
}

function writeSway(state, value) {
    const root = state.stage;
    const zero = !value || (value.x === 0 && value.y === 0 && value.r === 0);
    if (zero && !state.swayWritten) return;
    for (const [selector, k] of SWAY_TARGETS) {
        const el = root.querySelector(selector);
        if (!el) continue;
        if (zero) {
            for (const name of SWAY_VARS) setVar(el, name, null);
        } else {
            setVar(el, '--igs-rm-sx', `${(value.x * k).toFixed(2)}px`);
            setVar(el, '--igs-rm-sy', `${(value.y * k).toFixed(2)}px`);
            setVar(el, '--igs-rm-sr', `${(value.r * k).toFixed(3)}deg`);
        }
    }
    state.swayWritten = !zero;
}

function part(state, name) {
    return state.front ? state.front.querySelector(`.igs-rm-${name}`) : null;
}

function wantsFrame(state) {
    const plan = state.plan;
    if (!plan || plan.reduced) return state.swayFade > 0.01;
    return Boolean(plan.sway || plan.fringe || (plan.vignette && plan.heartBpm) || state.swayFade > 0.01);
}

function drawFrame(state) {
    const plan = state.plan;
    const t = viewNow(state);
    const target = plan && plan.sway && t >= state.hold ? 1 : 0;
    state.swayFade += (target - state.swayFade) * 0.08;
    if (state.swayFade < 0.01 && !target) state.swayFade = 0;
    if (plan && plan.sway) state.swayAmp = plan.sway;
    const hit = latest(state.beats, t);
    let sway = null;
    if (hit && state.swayAmp && state.swayFade > 0) {
        const gap = hit.next ? hit.next.t - hit.item.t : 60 / hit.item.bpm;
        sway = swayAt(hit.item, gap, t, state.swayAmp, state.swayFade);
    }
    writeSway(state, sway);
    if (!state.swayFade && !(plan && plan.sway)) setAttr(state.stage, 'data-igs-rm-sway', null);
    if (!plan || plan.reduced) return;
    const heart = latest(state.hearts, t);
    const pulse = plan.vignette && heart ? heartPulse(t - heart.item.t, heart.item.bpm) : 0;
    setVar(part(state, 'vig'), '--igs-rm-pulse', pulse.toFixed(3));
    if (plan.fringe) {
        const beatGap = hit ? (hit.next ? hit.next.t - hit.item.t : 60 / hit.item.bpm) : 0;
        const value = hit ? beatPush((t - hit.item.t) / beatGap) * hit.item.velocity : pulse;
        setVar(part(state, 'fringe'), '--igs-rm-fringe', value.toFixed(3));
    }
}

// 同步回调的 requestAnimationFrame（部分宿主桩）会让逐帧循环无限递归：发现后改用约 60 帧的计时器。
function timerFrames(state) {
    state.requestFrame = (fn) => unref(setTimeout(() => fn(state.perfNow() * 1000), 16));
    state.cancelFrame = (id) => clearTimeout(id);
}

function loop(state) {
    state.frame = null;
    if (!wantsFrame(state) || !state.requestFrame) {
        if (!state.plan || !state.requestFrame) writeSway(state, null);
        return;
    }
    let requesting = true;
    let ranInline = false;
    const id = state.requestFrame((ts) => {
        if (requesting) {
            ranInline = true;
            return;
        }
        state.frame = null;
        if (!state.coarse || !(ts - state.lastFrame < COARSE_FRAME_MS)) {
            state.lastFrame = ts;
            drawFrame(state);
        }
        loop(state);
    });
    requesting = false;
    if (ranInline) {
        timerFrames(state);
        loop(state);
        return;
    }
    state.frame = id;
}

function ensureFront(state) {
    if (state.front && state.front.parentNode) return state.front;
    const stage = state.stage;
    const doc = stage.ownerDocument;
    if (!doc || typeof doc.createElement !== 'function') return null;
    const front = doc.createElement('div');
    front.className = 'igs-rm-front';
    front.setAttribute('aria-hidden', 'true');
    for (const name of ['gobo', 'vig', 'haze', 'fringe', 'sense', 'sweep', 'veil']) {
        const layer = doc.createElement('div');
        layer.className = `igs-rm-${name}`;
        front.appendChild(layer);
    }
    const anchor = stage.querySelector('#igs-click-layer');
    if (anchor && anchor.parentNode === stage) stage.insertBefore(front, anchor);
    else stage.appendChild(front);
    state.front = front;
    return front;
}

function syncFront(state, plan) {
    const front = ensureFront(state);
    if (!front) return;
    setAttr(front, 'data-igs-rm-level', plan.level);
    setAttr(front, 'data-igs-rm-gobo', plan.gobo ? '1' : null);
    setAttr(front, 'data-igs-rm-vig', plan.vignette ? '1' : null);
    setAttr(front, 'data-igs-rm-haze', plan.haze ? '1' : null);
    setVar(front, '--igs-rm-haze', plan.haze ? plan.haze : null);
    setAttr(front, 'data-igs-rm-fringe', plan.fringe ? '1' : null);
    if (!plan.fringe) setVar(part(state, 'fringe'), '--igs-rm-fringe', null);
    if (plan.reduced) setVar(part(state, 'vig'), '--igs-rm-pulse', null);
    const sense = plan.sense && plan.senseVisual ? plan.sense : null;
    setAttr(front, 'data-igs-rm-sense', sense);
    setAttr(front, 'data-igs-rm-ear', sense === 'ear' ? (state.earSide < 0 ? 'l' : 'r') : null);
}

// 一次性动画（白场 / 暗转、触碰涟漪、脱衣扫光）：去掉属性、强制重排、再加上，重复触发时从头播。
function replay(state, name, attr, value, ms) {
    const el = part(state, name);
    if (!el) return;
    el.removeAttribute(attr);
    void el.offsetWidth;
    el.setAttribute(attr, value);
    later(state, ms, () => {
        if (el.getAttribute(attr) === value) el.removeAttribute(attr);
    });
}

// 白场 / 暗转：同一层换动画，重复触发时从头播。
function playVeil(state, kind) {
    replay(state, 'veil', 'data-igs-rm-veil', kind, VEIL_MS[kind]);
}

// 顶点：声音一瞬间全部切断（含 BGM 与环境声），画面过曝成白场；停顿之后心跳、呼吸慢慢回来，床再「落定」两声。
function runPeak(state, plan) {
    const t = schedNow(state);
    state.hold = t + PEAK_HOLD_S;
    state.beats = [];
    state.hearts = [];
    state.heartBpm = HEART_BPM.climax;
    state.nextHeart = t + PEAK_HOLD_S + 0.2;
    state.nextBreath = t + PEAK_HOLD_S + 0.9;
    state.nextTick = t + PEAK_HOLD_S + 1.5;
    duckSceneAudio({ ratio: 0, durationMs: PEAK_HOLD_S * 1000 });
    if (state.voice) {
        state.voice.silence(t, t + PEAK_HOLD_S - 0.1);
        if (plan.settle && plan.material !== 'futon') {
            state.voice.creak(t + PEAK_HOLD_S + 0.4, { material: plan.material, velocity: 0.45, down: true, duration: 0.3 });
            state.voice.creak(t + PEAK_HOLD_S + 1.9, { material: plan.material, velocity: 0.25, down: true, duration: 0.35 });
        }
    }
    if (plan.edge) playVeil(state, 'flash');
}

function stopState(state, { hard = false } = {}) {
    if (state.pump) clearInterval(state.pump);
    state.pump = null;
    if (state.frame != null && state.cancelFrame) state.cancelFrame(state.frame);
    state.frame = null;
    for (const id of state.timers) clearTimeout(id);
    state.timers.clear();
    if (state.voice) state.voice.dispose(hard ? 0.05 : 0.6);
    state.voice = null;
    syncDuck(state, 0);
    writeSway(state, null);
    setAttr(state.stage, 'data-igs-rm-sway', null);
    if (state.front && typeof state.front.remove === 'function') state.front.remove();
    else if (state.front && state.front.parentNode) state.front.parentNode.removeChild(state.front);
    state.front = null;
}

// info：{ level, span, location, settings, fxSound, reduced, low, messageId, index, sense, undress, solo, noise }。返回 { whisper, plan }。
export function syncRomanceIntimate(root, info = {}) {
    const stage = stageOf(root);
    if (!stage) return { whisper: false };
    let state = states.get(stage);
    const settings = info.settings || {};
    const reduced = info.reduced === true;
    const coarse = info.coarse != null ? info.coarse === true : isCoarse();
    const phase = info.level === 3 ? resolveIntimatePhase(info.span) : '';
    const base = resolveIntimatePlan({
        level: info.level, phase, settings, sound: normalizeFxSoundSettings(info.fxSound), reduced, coarse, low: info.low === true, location: info.location,
        sense: info.sense || '', undress: info.undress || '', solo: info.solo === true, noise: info.noise || '',
    });
    if (!base) {
        if (state) {
            stopState(state);
            states.delete(stage);
        }
        return { whisper: false };
    }
    const plan = { ...base, reduced };
    if (!state) {
        state = makeState(stage);
        states.set(stage, state);
    }
    if (typeof info.rng === 'function') state.rng = info.rng;
    state.coarse = coarse;
    const prev = state.plan;
    const prevPage = state.page;
    const page = { messageId: info.messageId, index: Number(info.index), level: plan.level, phase: plan.phase };
    const turned = !prevPage || prevPage.messageId !== page.messageId || prevPage.index !== page.index;
    const forward = Boolean(prevPage && prevPage.messageId === page.messageId && page.index === prevPage.index + 1);
    // 往后读：同楼下一页，或翻进新楼层的第一页。脱衣只在往后读时播，翻回旧页不重播。
    const advanced = forward || Boolean(prevPage && prevPage.messageId !== page.messageId && page.index === 0);
    const senseChanged = (prev && prev.sense || '') !== (plan.sense || '');
    if (senseChanged && plan.sense === 'ear') state.earSide = state.rng() < 0.5 ? -1 : 1;
    state.page = page;
    state.plan = plan;
    // 脱衣声约 1 秒；这期间重绘不能因为「本页已不需要声音」把它掐掉。
    if (turned && advanced && (plan.undress || plan.noise)) state.voiceHold = state.perfNow() + (plan.noise ? 2.6 : 1.6);

    const clockChanged = syncVoice(state, plan);
    state.span = info.span || null;
    if (clockChanged || !prev || prev.phase !== plan.phase || prev.level !== plan.level) state.phaseStart = schedNow(state);
    syncDuck(state, plan.duck);
    const voice = state.voice;
    if (voice) {
        if (plan.tinnitus && !voice.tinnitusOn) voice.startTinnitus(schedNow(state) + 0.2, 6);
        else if (!plan.tinnitus && voice.tinnitusOn) voice.stopTinnitus();
    }
    syncFront(state, plan);
    setAttr(stage, 'data-igs-rm-sway', plan.sway || state.swayFade > 0 ? '1' : null);

    if (turned) {
        const span = info.span;
        const undressing = advanced && (plan.undress || plan.undressVisual);
        if (forward && prevPage.phase === 'climax' && plan.phase === 'after') {
            runPeak(state, plan);
        } else {
            // 从非情事页进入情事段开头：先暗转，只让声音继续推进。
            const entering = plan.level === 3 && prevPage && prevPage.level !== 3 && span && span.index === 0 && !span.continued;
            if (entering && plan.edge) playVeil(state, 'dark');
            // 门外的动静：声音从门那一侧传来，场景声几乎压没（本页的感官同时切成屏息，见 romance-runtime）。
            if (advanced && plan.noise) {
                if (voice) voice.outside(plan.noise, schedNow(state) + 0.05, 1);
                duckSceneAudio({ ratio: 0.15, durationMs: NOISE_DUCK_MS });
            }
            if (undressing) {
                if (voice && plan.undress) voice.undress(schedNow(state) + 0.05, plan.level === 3 ? 1 : 0.8);
                if (plan.undressVisual && !plan.reduced) replay(state, 'sweep', 'data-igs-rm-sweep', '1', SWEEP_MS);
            } else if (voice && plan.cloth && (plan.senseCloth || state.rng() < 0.6)) {
                voice.cloth(schedNow(state) + 0.08, plan.level === 3 ? 1 : 0.7);
            }
        }
    }
    // 触碰：翻到触碰页或刚切到触碰时，边缘泛起一圈涟漪。
    if ((turned || senseChanged) && plan.sense === 'touch' && plan.senseVisual && !plan.reduced) {
        replay(state, 'sense', 'data-igs-rm-ripple', '1', RIPPLE_MS);
    }
    if (!state.pump && (plan.tempo || plan.heartBpm || plan.breath || plan.ticks)) {
        state.pump = unref(setInterval(() => pump(state), PUMP_MS));
    } else if (state.pump && !(plan.tempo || plan.heartBpm || plan.breath || plan.ticks)) {
        clearInterval(state.pump);
        state.pump = null;
    }
    pump(state);
    if (state.frame == null) loop(state);
    return { whisper: plan.whisper || (plan.sense === 'ear' && plan.volume > 0), plan };
}

export function closeRomanceIntimate(root) {
    const stage = stageOf(root);
    const state = stage && states.get(stage);
    if (!state) return;
    stopState(state, { hard: true });
    states.delete(stage);
}
