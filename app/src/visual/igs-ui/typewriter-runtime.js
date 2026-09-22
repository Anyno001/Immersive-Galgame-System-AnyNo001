export const TYPEWRITER_SPEED_IDS = Object.freeze(['fast', 'medium', 'slow']);
export const TYPEWRITER_SPEED_MS = Object.freeze({
    fast: 14,
    medium: 28,
    slow: 48,
});
export const TYPEWRITER_DEFAULTS = Object.freeze({
    enabled: false,
    speed: 'medium',
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

function setRunningState(target, running) {
    if (!target) return;
    if (target.dataset) target.dataset.igsTypewriter = running ? 'running' : 'complete';
}

export function normalizeTypewriterSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        enabled: source.enabled === true,
        speed: TYPEWRITER_SPEED_IDS.includes(source.speed) ? source.speed : TYPEWRITER_DEFAULTS.speed,
    };
}

export function cancelTypewriter(target, { finish = true } = {}) {
    const job = target && activeJobs.get(target);
    if (!job) return false;
    activeJobs.delete(target);
    // The full text was rendered before this visual effect started, so either
    // cancel path leaves the underlying DOM complete and immediately visible.
    void finish;
    if (job.animation && typeof job.animation.cancel === 'function') {
        job.animation.cancel();
    }
    setRunningState(target, false);
    return true;
}

function settleVisualJob(target, job) {
    if (activeJobs.get(target) !== job) return;
    activeJobs.delete(target);
    if (job.animation && typeof job.animation.cancel === 'function') {
        job.animation.cancel();
    }
    setRunningState(target, false);
}

function createVisualAnimation(target, options, timing) {
    const animate = typeof options.animate === 'function'
        ? () => options.animate(target, VISUAL_REVEAL_KEYFRAMES, timing)
        : typeof target.animate === 'function'
            ? () => target.animate(VISUAL_REVEAL_KEYFRAMES, timing)
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
    const reducedMotion = options.reducedMotion === true
        || (options.reducedMotion !== false
            && typeof globalThis.matchMedia === 'function'
            && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!settings.enabled || reducedMotion) {
        cancelTypewriter(target, { finish: true });
        setRunningState(target, false);
        return { animated: false, finish() {} };
    }
    const activeJob = activeJobs.get(target);
    if (activeJob && key && activeJob.key === key) {
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

    const duration = getVisualDuration(readText(target), settings.speed);
    if (!duration) {
        setRunningState(target, false);
        return { animated: false, finish() {} };
    }

    const animation = createVisualAnimation(target, options, {
        duration,
        easing: 'ease-out',
        fill: 'both',
    });
    if (!animation || typeof animation.cancel !== 'function') {
        setRunningState(target, false);
        return { animated: false, finish() {} };
    }
    if (key) renderedKeys.set(target, key);

    const job = { animation, key };
    activeJobs.set(target, job);
    setRunningState(target, true);
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
        finish() {
            cancelTypewriter(target, { finish: true });
        },
    };
}
