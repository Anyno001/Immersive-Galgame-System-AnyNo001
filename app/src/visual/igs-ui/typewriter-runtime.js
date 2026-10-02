import { prefersReducedMotion } from './reduced-motion.js';
import { isBilingualNote } from './bilingual-text.js';
import { measureClassicReveal } from './typewriter-classic.js';
import { startCompositedReveal } from './typewriter-compositor.js';
import { TYPEWRITER_VOICE_DEFAULTS, normalizeTypewriterVoice, resolveTypewriterVoice, scheduleTypewriterAudio } from './typewriter-audio.js';
import { TYPING_DUCK_RATIO, duckSceneAudio } from './scene-audio.js';

export const TYPEWRITER_SPEED_IDS = Object.freeze(['fast', 'medium', 'slow']);
export const TYPEWRITER_SPEED_MS = Object.freeze({
    fast: 14,
    medium: 28,
    slow: 48,
});
export const TYPEWRITER_DEFAULTS = Object.freeze({
    enabled: false,
    speed: 'medium',
    mode: 'soft',
    punctuationPause: false,
    prosody: false,
    sound: Object.freeze({
        enabled: true, volume: 0.5, dialogueVolume: 0.5, narrationVolume: 0.5,
        dialoguePreset: TYPEWRITER_VOICE_DEFAULTS.dialogue,
        thoughtPreset: TYPEWRITER_VOICE_DEFAULTS.thought,
        narrationPreset: TYPEWRITER_VOICE_DEFAULTS.narration,
        speakerPitch: false,
    }),
});

const activeJobs = new WeakMap();
const renderedKeys = new WeakMap();
const TYPEWRITER_VISUAL_MIN_DURATION_MS = 160;
const TYPEWRITER_VISUAL_MAX_DURATION_MS = 1200;
const graphemeSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
const VISUAL_REVEAL_KEYFRAMES = Object.freeze([
    Object.freeze({ opacity: 0, clipPath: 'inset(0 100% 0 0)' }),
    Object.freeze({ opacity: 1, clipPath: 'inset(0 0 0 0)' }),
]);

function readText(root) {
    if (!root) return '';
    if (root.nodeType === 3) return String(root.nodeValue || '');
    if (isBilingualNote(root)) return '';
    return Array.from(root.childNodes || [], readText).join('');
}

function countGraphemesUpTo(text, limit) {
    if (graphemeSegmenter) {
        let count = 0;
        for (const _part of graphemeSegmenter.segment(text)) {
            count += 1;
            if (count >= limit) break;
        }
        return count;
    }
    return Math.min(Array.from(text).length, limit);
}

function getVisualDuration(text, speed) {
    const perGraphemeMs = TYPEWRITER_SPEED_MS[speed];
    const graphemeCount = countGraphemesUpTo(text, Math.ceil(TYPEWRITER_VISUAL_MAX_DURATION_MS / perGraphemeMs));
    if (!graphemeCount) return 0;
    return Math.min(
        TYPEWRITER_VISUAL_MAX_DURATION_MS,
        Math.max(TYPEWRITER_VISUAL_MIN_DURATION_MS, graphemeCount * perGraphemeMs),
    );
}

// 柔和模式的遮罩从左向右整体推进（ease-out），元素左缘被扫到的时刻即其揭开时刻。
function withDelay(revealAt, delay) {
    return delay ? (element) => delay + (Number(revealAt(element)) || 0) : revealAt;
}

function softRevealAt(target, duration) {
    return (element) => {
        if (!element || typeof element.getBoundingClientRect !== 'function' || typeof target.getBoundingClientRect !== 'function') return 0;
        const bounds = target.getBoundingClientRect();
        if (!bounds || !(bounds.width > 0)) return 0;
        const fraction = Math.min(1, Math.max(0, (element.getBoundingClientRect().left - bounds.left) / bounds.width));
        return duration * (1 - Math.sqrt(1 - fraction));
    };
}

function setRunningState(target, running) {
    if (!target) return;
    if (target.dataset) target.dataset.igsTypewriter = running ? 'running' : 'complete';
}

export function normalizeTypewriterSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const sound = source.sound && typeof source.sound === 'object' ? source.sound : {};
    const legacyVolume = clampVolume(sound.volume, TYPEWRITER_DEFAULTS.sound.volume);
    return {
        enabled: source.enabled === true,
        speed: TYPEWRITER_SPEED_IDS.includes(source.speed) ? source.speed : TYPEWRITER_DEFAULTS.speed,
        mode: source.mode === 'classic' ? 'classic' : 'soft',
        punctuationPause: source.punctuationPause === true,
        // 说话韵律（仅经典模式生效）：节奏、语调与文字演出联动共用这一个开关，默认关闭。
        prosody: source.prosody === true,
        sound: {
            enabled: sound.enabled === undefined ? true : sound.enabled === true,
            volume: legacyVolume,
            dialogueVolume: clampVolume(sound.dialogueVolume, legacyVolume),
            narrationVolume: clampVolume(sound.narrationVolume, legacyVolume),
            dialoguePreset: normalizeTypewriterVoice(sound.dialoguePreset, TYPEWRITER_VOICE_DEFAULTS.dialogue),
            // 'follow' plays thoughts with the dialogue voice.
            thoughtPreset: sound.thoughtPreset === 'follow' ? 'follow' : normalizeTypewriterVoice(sound.thoughtPreset, TYPEWRITER_VOICE_DEFAULTS.thought),
            narrationPreset: normalizeTypewriterVoice(sound.narrationPreset, TYPEWRITER_VOICE_DEFAULTS.narration),
            speakerPitch: sound.speakerPitch === true,
        },
    };
}

function clampVolume(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : fallback;
}

export function cancelTypewriter(target, { finish = true } = {}) {
    const job = target && activeJobs.get(target);
    if (!job) return false;
    activeJobs.delete(target);
    // The full text was rendered before this visual effect started, so either
    // cancel path leaves the underlying DOM complete and immediately visible.
    void finish;
    job.audio?.stop?.();
    job.releaseDuck?.();
    if (job.animation && typeof job.animation.cancel === 'function') {
        job.animation.cancel();
    }
    setRunningState(target, false);
    return true;
}

function settleVisualJob(target, job) {
    if (activeJobs.get(target) !== job) return;
    activeJobs.delete(target);
    job.audio?.stop?.();
    job.releaseDuck?.();
    if (job.animation && typeof job.animation.cancel === 'function') {
        job.animation.cancel();
    }
    setRunningState(target, false);
}

function createVisualAnimation(target, options, keyframes, timing) {
    const animate = typeof options.animate === 'function'
        ? () => options.animate(target, keyframes, timing)
        : typeof target.animate === 'function'
            ? () => target.animate(keyframes, timing)
            : null;
    if (!animate) return null;
    try {
        return animate();
    } catch {
        return null;
    }
}

export function applyTypewriterEffect(target, options = {}) {
    if (!target) return { animated: false, finish() {} };
    const settings = normalizeTypewriterSettings(options);
    const key = String(options.key || '');
    const spoken = options.textType === 'dialogue' || options.textType === 'thought';
    const jobVolume = spoken ? settings.sound.dialogueVolume : settings.sound.narrationVolume;
    // 说话韵律：情绪与句调只给台词和心里话；旁白只分拍，不带角色情绪、不起伏。
    const emotion = spoken ? String(options.emotion || '') : '';
    const voice = resolveTypewriterVoice(settings.sound, options.textType, options.speaker, { emotion: options.emotion, posX: options.posX, prosody: settings.prosody });
    const reducedMotion = options.reducedMotion === true
        || (options.reducedMotion !== false
            && prefersReducedMotion());
    if (!settings.enabled || reducedMotion) {
        cancelTypewriter(target, { finish: true });
        setRunningState(target, false);
        return { animated: false, finish() {} };
    }
    const activeJob = activeJobs.get(target);
    if (activeJob && key && activeJob.key === key) {
        const sameSettings = activeJob.mode === settings.mode
            && activeJob.punctuationPause === settings.punctuationPause
            && activeJob.prosody === settings.prosody
            && (!settings.prosody || activeJob.emotion === emotion)
            && activeJob.soundEnabled === settings.sound.enabled
            && activeJob.volume === jobVolume
            && activeJob.voice.preset === voice.preset
            && activeJob.voice.pitch === voice.pitch
            && activeJob.voice.pan === voice.pan;
        if (!sameSettings) {
            cancelTypewriter(target, { finish: true });
            return { animated: false, finish() {} };
        }
        return {
            animated: true,
            finish() {
                cancelTypewriter(target, { finish: true });
            },
        };
    }
    cancelTypewriter(target, { finish: false });
    if (key && renderedKeys.get(target) === key) {
        setRunningState(target, false);
        return { animated: false, finish() {} };
    }

    const classic = settings.mode === 'classic'
        ? measureClassicReveal(target, TYPEWRITER_SPEED_MS[settings.speed], { punctuationPause: settings.punctuationPause, prosody: settings.prosody, intonation: spoken, emotion })
        : null;
    const duration = settings.mode === 'classic' ? classic?.duration : getVisualDuration(readText(target), settings.speed);
    if (!duration) {
        setRunningState(target, false);
        return { animated: false, finish() {} };
    }

    // delay：文字出现前的空白停顿（亲密演出的「回答前停顿一拍」），打字音与行内文字效果同步后移。
    const delay = Math.max(0, Math.min(3000, Number(options.delay) || 0));
    const timing = {
        duration,
        easing: classic ? 'linear' : 'ease-out',
        fill: 'both',
        ...(delay ? { delay } : {}),
    };
    // 真实页面优先走合成线程揭示（不受主线程繁忙影响）；注入 animate 或前提不满足时退回 clip-path 遮罩。
    const composited = typeof options.animate === 'function' ? null
        : startCompositedReveal(target, classic ? { layout: classic.layout } : { soft: true }, timing);
    const animation = composited || createVisualAnimation(target, options, classic ? classic.frames : VISUAL_REVEAL_KEYFRAMES, timing);
    if (!animation || typeof animation.cancel !== 'function') {
        setRunningState(target, false);
        return { animated: false, finish() {} };
    }
    if (key) renderedKeys.set(target, key);

    const job = { animation, key, mode: settings.mode, punctuationPause: settings.punctuationPause, prosody: settings.prosody, emotion, soundEnabled: settings.sound.enabled, volume: jobVolume, voice, audio: null };
    activeJobs.set(target, job);
    setRunningState(target, true);
    if (classic && settings.sound.enabled && jobVolume > 0) {
        job.audio = scheduleTypewriterAudio(delay ? classic.events.map((event) => ({ ...event, timeMs: event.timeMs + delay })) : classic.events, {
            textType: options.textType, volume: jobVolume, audioScheduler: options.audioScheduler, phone: options.phone === true,
            preset: voice.preset, pitch: voice.pitch, pan: voice.pan, prosody: settings.prosody, emotion,
        });
        if (job.audio) job.releaseDuck = duckSceneAudio({ ratio: TYPING_DUCK_RATIO });
    }
    const settle = () => settleVisualJob(target, job);
    if (typeof animation.addEventListener === 'function') {
        animation.addEventListener('finish', settle, { once: true });
        animation.addEventListener('cancel', settle, { once: true });
    } else {
        animation.onfinish = settle;
        animation.oncancel = settle;
    }

    return {
        animated: true,
        revealDelay: withDelay(classic ? classic.revealAt : softRevealAt(target, duration), delay),
        finish() {
            cancelTypewriter(target, { finish: true });
        },
    };
}
