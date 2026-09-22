export const STAGE_SHAKE_EMOTIONS = Object.freeze([
    '惊讶', '吃惊', '惊异', '惊诧', '诧异', '惊愕', '错愕', '愕然',
    '惊呆', '惊住', '目瞪口呆', '瞠目结舌', '震惊', '震撼', '震动', '惊骇', '骇然',
]);



export const STAGE_SHAKE_INTENSITIES = Object.freeze(['weak', 'medium', 'strong']);
export const STAGE_SHAKE_INTENSITY_PARAMS = Object.freeze({
    weak: Object.freeze({ distance: 3, duration: 180 }),
    medium: Object.freeze({ distance: 6, duration: 280 }),
    strong: Object.freeze({ distance: 10, duration: 380 }),
});
export const STAGE_SHAKE_DEFAULTS = Object.freeze({
    enabled: false,
    intensity: 'medium',
    emotions: STAGE_SHAKE_EMOTIONS,
});

const activeStates = new WeakMap();

function normalizeEmotion(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text || /[A-Za-z]/u.test(text) || !/[\u3400-\u9fff]/u.test(text)) return '';
    return text;
}

function normalizeEmotionList(value, fallback) {
    if (!Array.isArray(value)) return Array.from(fallback);
    const output = [];
    for (const item of value) {
        const emotion = normalizeEmotion(item);
        if (emotion && !output.includes(emotion)) output.push(emotion);
    }
    return output;
}

export function normalizeStageShakeSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        enabled: source.enabled === true,
        intensity: STAGE_SHAKE_INTENSITIES.includes(source.intensity) ? source.intensity : STAGE_SHAKE_DEFAULTS.intensity,
        emotions: normalizeEmotionList(source.emotions, STAGE_SHAKE_DEFAULTS.emotions),
    };
}

export function isStageShakeEmotion(emotion, settings) {
    const target = String(emotion == null ? '' : emotion).trim();
    const normalized = normalizeStageShakeSettings(settings);
    return normalized.enabled && Boolean(target) && normalized.emotions.includes(target);
}

function hasReducedMotion(options = {}) {
    return options.reducedMotion === true
        || (options.reducedMotion !== false
            && typeof globalThis.matchMedia === 'function'
            && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function clearState(stage, state) {
    if (!stage || !state) return;
    if (state.timer != null && typeof state.clear === 'function') state.clear(state.timer);
    if (state.listener && typeof stage.removeEventListener === 'function') stage.removeEventListener('animationend', state.listener);
    if (stage.classList && typeof stage.classList.remove === 'function') stage.classList.remove('igs-stage-shake-active');
    if (stage.removeAttribute) {
        stage.removeAttribute('data-igs-stage-shake');
        stage.removeAttribute('data-igs-stage-shake-intensity');
    }
    activeStates.delete(stage);
}

export function cancelStageShakeEffect(stage) {
    const state = stage && activeStates.get(stage);
    if (!state) return false;
    clearState(stage, state);
    return true;
}

export function applyStageShakeEffect(stage, options = {}) {
    if (!stage) return { played: false, cancel() {} };
    const settings = normalizeStageShakeSettings(options.settings);
    const key = String(options.key || '');
    if (!settings.enabled || !isStageShakeEmotion(options.emotion, settings) || hasReducedMotion(options)) {
        cancelStageShakeEffect(stage);
        return { played: false, cancel() {} };
    }
    const previous = activeStates.get(stage);
    if (previous && previous.key === key) return { played: false, active: true, cancel: () => cancelStageShakeEffect(stage) };
    if (previous) clearState(stage, previous);

    const params = STAGE_SHAKE_INTENSITY_PARAMS[settings.intensity];
    const schedule = typeof options.schedule === 'function' ? options.schedule : (fn, delay) => setTimeout(fn, delay);
    const clear = typeof options.clear === 'function' ? options.clear : (timer) => clearTimeout(timer);
    const state = { key, clear, timer: null, listener: null };
    const finish = () => clearState(stage, state);
    state.listener = finish;
    activeStates.set(stage, state);
    if (stage.setAttribute) {
        stage.setAttribute('data-igs-stage-shake', '1');
        stage.setAttribute('data-igs-stage-shake-intensity', settings.intensity);
    }
    if (stage.classList && typeof stage.classList.add === 'function') stage.classList.add('igs-stage-shake-active');
    if (typeof stage.addEventListener === 'function') stage.addEventListener('animationend', state.listener, { once: true });
    state.timer = schedule(finish, params.duration + 40);
    return { played: true, intensity: settings.intensity, params, cancel: finish };
}
