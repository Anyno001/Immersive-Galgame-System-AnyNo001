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

function splitGraphemes(value) {
    const text = String(value || '');
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment);
    }
    return Array.from(text);
}

function collectTextNodes(root) {
    const result = [];
    const visit = (node) => {
        if (!node) return;
        if (node.nodeType === 3) {
            if (node.nodeValue) result.push(node);
            return;
        }
        for (const child of Array.from(node.childNodes || [])) visit(child);
    };
    visit(root);
    return result;
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
    job.cancelled = true;
    job.clear(job.timer);
    if (finish) {
        for (const entry of job.entries) entry.node.nodeValue = entry.text;
    }
    activeJobs.delete(target);
    setRunningState(target, false);
    return true;
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

    const entries = collectTextNodes(target).map((node) => ({
        node,
        text: String(node.nodeValue || ''),
        graphemes: splitGraphemes(node.nodeValue),
    }));
    if (!entries.some((entry) => entry.graphemes.length)) {
        setRunningState(target, false);
        return { animated: false, finish() {} };
    }

    const schedule = typeof options.schedule === 'function' ? options.schedule : (fn, delay) => setTimeout(fn, delay);
    const clear = typeof options.clear === 'function' ? options.clear : (timer) => clearTimeout(timer);
    const job = { entries, clear, timer: null, cancelled: false, entryIndex: 0, graphemeIndex: 0, key };
    for (const entry of entries) entry.node.nodeValue = '';
    activeJobs.set(target, job);
    if (key) renderedKeys.set(target, key);
    setRunningState(target, true);

    const tick = () => {
        if (job.cancelled) return;
        while (job.entryIndex < entries.length) {
            const entry = entries[job.entryIndex];
            if (job.graphemeIndex >= entry.graphemes.length) {
                job.entryIndex += 1;
                job.graphemeIndex = 0;
                continue;
            }
            do {
                entry.node.nodeValue += entry.graphemes[job.graphemeIndex];
                job.graphemeIndex += 1;
            } while (job.graphemeIndex < entry.graphemes.length && /^\s$/u.test(entry.graphemes[job.graphemeIndex]));
            job.timer = schedule(tick, TYPEWRITER_SPEED_MS[settings.speed]);
            return;
        }
        activeJobs.delete(target);
        setRunningState(target, false);
    };
    tick();

    return {
        animated: true,
        finish() {
            cancelTypewriter(target, { finish: true });
        },
    };
}
