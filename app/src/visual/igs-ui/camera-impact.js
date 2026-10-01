// 镜头冲击推近：翻到新页且情绪命中时，舞台 #igs-stage-motion 用独立 scale 属性做一次「推近 → 回弹」。
// 舞台震动走 transform 动画，scale 与 transform 叠加合成，二者互不覆盖；不写立绘 inline transform。
// 音效由调用方经 options.playSfx 注入，与动画同一时刻起播；同一 key 只播一次，关闭阅读器调用 cancelCameraImpact。
import { prefersReducedMotion } from './reduced-motion.js';
import { createSynthPartial, playSynthPartials } from './chat-sfx.js';
import { FX_RHYTHM } from './fx-rhythm.js';
import { pickCameraImpact } from './stage-direction-settings.js';

// 冲击音：低频下扫的「咚」叠一层短促三角波起音，经 playSynthPartials 进 sfx 总线（与镜头同时起播）。
export const CAMERA_IMPACT_PARTIALS = Object.freeze([
    createSynthPartial('sine', 120, 42, 0, 0.32, 0.9),
    createSynthPartial('triangle', 220, 80, 0, 0.12, 0.35),
]);

// sound 为 normalizeFxSoundSettings 的结果；关闭或音量为 0 时静默。
export function playCameraImpactSfx(sound) {
    if (!sound || sound.enabled === false || !(sound.volume > 0)) return null;
    try {
        return playSynthPartials(CAMERA_IMPACT_PARTIALS, { volume: sound.volume }) || null;
    } catch {
        return null;
    }
}

// 同页演出预算：本页舞台震动已在播放时冲击推近让位（震动为主演出），避免同一情绪同时震、推叠满。
// 返回 '' 不触发；'yield' 命中但让位；'play' 播放。
export function planCameraImpact({ newPage, motionOn, eligible, emotion, camera, stageShakeActive } = {}) {
    if (!newPage || !motionOn || !eligible || !camera || !pickCameraImpact(emotion, camera)) return '';
    return stageShakeActive === true ? 'yield' : 'play';
}

export const CAMERA_IMPACT_PARAMS = Object.freeze({ peak: 1.045, peakOffset: 0.18, duration: FX_RHYTHM.impact.duration });
const EASING = FX_RHYTHM.impact.easing;

const states = new WeakMap();

function hasReducedMotion(options) {
    return options.reducedMotion === true
        || (options.reducedMotion !== false && prefersReducedMotion());
}

export function cancelCameraImpact(stage) {
    const state = stage && states.get(stage);
    if (!state) return false;
    states.delete(stage);
    if (state.anim && typeof state.anim.cancel === 'function') {
        try { state.anim.cancel(); } catch { /* ignore */ }
    }
    if (state.sound && typeof state.sound.stop === 'function') {
        try { state.sound.stop(); } catch { /* ignore */ }
    }
    return true;
}

export function playCameraImpact(stage, options = {}) {
    const idle = { played: false, cancel() {} };
    if (!stage || typeof stage.animate !== 'function') return idle;
    // 低画质档与推镜、呼吸一致：不播冲击（音效随之不播）。
    if (hasReducedMotion(options) || options.lowQuality === true) {
        cancelCameraImpact(stage);
        return idle;
    }
    const key = String(options.key || '');
    const previous = states.get(stage);
    // 播完后保留 key，同页重绘不重播。
    if (previous && previous.key === key) return { played: false, active: Boolean(previous.anim), cancel: () => cancelCameraImpact(stage) };
    if (previous) cancelCameraImpact(stage);

    const p = CAMERA_IMPACT_PARAMS;
    let anim = null;
    try {
        anim = stage.animate(
            [{ scale: '1' }, { scale: String(p.peak), offset: p.peakOffset }, { scale: '1' }],
            { duration: p.duration, easing: EASING },
        );
    } catch {
        return idle;
    }
    const state = { key, anim, sound: null };
    states.set(stage, state);
    if (anim) anim.onfinish = () => { if (states.get(stage) === state) state.anim = null; };
    if (typeof options.playSfx === 'function') {
        try { state.sound = options.playSfx('impact') || null; } catch { state.sound = null; }
    }
    return { played: true, params: p, cancel: () => cancelCameraImpact(stage) };
}
