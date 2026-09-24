import { getSillyTavernContext } from './tavern-helper-adapter.js';

// 楼层内嵌的流式生命周期：仅在 embedded 阅读器打开时创建，
// 官方生成事件负责起止，#chat mutation 只在生成期间同步活动，不做解析。

export const DEFAULT_STABLE_MS = 800;
export const DEFAULT_HARD_TIMEOUT_MS = 120000;

const FALLBACK_GENERATION_EVENTS = Object.freeze({
    started: 'generation_started',
    ended: 'generation_ended',
    stopped: 'generation_stopped',
});

export function createChatStreamObserver(opts = {}) {
    const globalObject = opts.global || globalThis;
    const onActivity = typeof opts.onActivity === 'function' ? opts.onActivity : () => {};
    const onStable = typeof opts.onStable === 'function' ? opts.onStable : () => {};
    const onTimeout = typeof opts.onTimeout === 'function' ? opts.onTimeout : onStable;
    const stableMs = Number(opts.stableMs) > 0 ? Number(opts.stableMs) : DEFAULT_STABLE_MS;
    const hardTimeoutMs = Number(opts.hardTimeoutMs) > 0 ? Number(opts.hardTimeoutMs) : DEFAULT_HARD_TIMEOUT_MS;
    let observer = null;
    let stableTimer = null;
    let hardTimer = null;
    let active = false;
    let generationActive = false;
    let manualArmed = false;
    let lifecycleAvailable = false;
    const lifecycleCleanup = [];

    const getSetter = () => typeof globalObject.setTimeout === 'function'
        ? globalObject.setTimeout.bind(globalObject)
        : setTimeout;

    const getClearer = () => typeof globalObject.clearTimeout === 'function'
        ? globalObject.clearTimeout.bind(globalObject)
        : clearTimeout;

    const clearStable = () => {
        if (stableTimer == null) return;
        getClearer()(stableTimer);
        stableTimer = null;
    };

    const clearHard = () => {
        if (hardTimer == null) return;
        getClearer()(hardTimer);
        hardTimer = null;
    };

    const scheduleStable = () => {
        if (!active) return;
        clearStable();
        stableTimer = getSetter()(() => {
            stableTimer = null;
            if (!active) return;
            Promise.resolve()
                .then(onStable)
                .then((completed) => {
                    if (completed !== false) {
                        manualArmed = false;
                        clearHard();
                        return;
                    }
                    scheduleStable();
                })
                .catch(() => scheduleStable());
        }, stableMs);
    };

    const ensureHard = () => {
        if (!active || hardTimer != null) return;
        hardTimer = getSetter()(() => {
            hardTimer = null;
            generationActive = false;
            manualArmed = false;
            clearStable();
            if (active) Promise.resolve().then(onTimeout).catch(() => {});
        }, hardTimeoutMs);
    };

    const scheduleActivity = () => {
        if (!active) return;
        try { onActivity(); } catch (error) { /* */ }
        ensureHard();
        if (!lifecycleAvailable || (manualArmed && !generationActive)) scheduleStable();
    };

    const onGenerationStarted = () => {
        if (!active) return;
        generationActive = true;
        manualArmed = false;
        // 酒馆生成事件是全局信号，插件自身的 API 请求也会触发它。
        // 这里只武装生命周期；必须先看到 #chat 的外部变更，才进入载入态。
        // 不清理已有稳定定时器，避免无关请求打断正文结束收尾。
    };

    const onGenerationFinished = () => {
        if (!active) return;
        generationActive = false;
        manualArmed = false;
        ensureHard();
        scheduleStable();
    };

    const detachLifecycle = () => {
        while (lifecycleCleanup.length) {
            const cleanup = lifecycleCleanup.pop();
            try { cleanup(); } catch (error) { /* */ }
        }
        lifecycleAvailable = false;
    };

    const attachLifecycle = () => {
        detachLifecycle();
        const context = opts.context || getSillyTavernContext(globalObject);
        const eventSource = opts.eventSource || context && context.eventSource;
        const eventTypes = opts.eventTypes || context && (context.event_types || context.eventTypes) || {};
        if (!eventSource || typeof eventSource.on !== 'function') return false;
        const started = eventTypes.GENERATION_STARTED || FALLBACK_GENERATION_EVENTS.started;
        const finished = Array.from(new Set([
            eventTypes.GENERATION_ENDED || FALLBACK_GENERATION_EVENTS.ended,
            eventTypes.GENERATION_STOPPED || FALLBACK_GENERATION_EVENTS.stopped,
        ].filter(Boolean)));
        const subscribe = (eventName, handler) => {
            eventSource.on(eventName, handler);
            lifecycleCleanup.push(() => {
                if (typeof eventSource.removeListener === 'function') eventSource.removeListener(eventName, handler);
                else if (typeof eventSource.off === 'function') eventSource.off(eventName, handler);
            });
        };
        try {
            subscribe(started, onGenerationStarted);
            finished.forEach((eventName) => subscribe(eventName, onGenerationFinished));
            lifecycleAvailable = true;
            return true;
        } catch (error) {
            detachLifecycle();
            return false;
        }
    };

    const resolveDocument = () => {
        if (typeof opts.getDocument === 'function') {
            try {
                const resolved = opts.getDocument();
                if (resolved) return resolved;
            } catch (error) { /* */ }
        }
        return opts.document || (globalObject && globalObject.document) || null;
    };

    const start = () => {
        if (active) return { ok: true, already: true };
        active = true;
        attachLifecycle();
        const doc = resolveDocument();
        const observerWindow = doc && doc.defaultView;
        const MutationObserverCtor = globalObject.MutationObserver || globalObject.WebKitMutationObserver
            || observerWindow && (observerWindow.MutationObserver || observerWindow.WebKitMutationObserver) || null;
        const chat = doc && typeof doc.querySelector === 'function' ? doc.querySelector('#chat') : null;
        if (MutationObserverCtor && chat) {
            observer = new MutationObserverCtor((records) => {
                const external = Array.isArray(records) && records.some((record) => !isInternalRecord(record));
                if (!external) return;
                if (lifecycleAvailable && !generationActive && !manualArmed) return;
                scheduleActivity();
            });
            try {
                observer.observe(chat, { childList: true, subtree: true, characterData: true });
            } catch (error) {
                observer = null;
            }
        }
        return { ok: true, observed: Boolean(observer), lifecycle: lifecycleAvailable };
    };

    const cancelPending = () => {
        generationActive = false;
        manualArmed = false;
        clearStable();
        clearHard();
    };

    const stop = () => {
        active = false;
        cancelPending();
        if (observer && typeof observer.disconnect === 'function') observer.disconnect();
        observer = null;
        detachLifecycle();
    };

    const noteActivity = () => {
        if (!active) return;
        manualArmed = true;
        scheduleActivity();
    };

    return {
        start,
        stop,
        cancelPending,
        isActive: () => active,
        hasLifecycle: () => lifecycleAvailable,
        noteActivity,
    };
}

function isInternalRecord(record) {
    const target = record && record.target;
    if (isInternalNode(target)) return true;
    const changed = []
        .concat(record && record.addedNodes ? Array.from(record.addedNodes) : [])
        .concat(record && record.removedNodes ? Array.from(record.removedNodes) : []);
    return changed.length > 0 && changed.every(isInternalNode);
}

function isInternalNode(node) {
    if (!node) return false;
    if (typeof node.getAttribute === 'function' && node.getAttribute('data-igs-internal-reader') === '1') return true;
    return Boolean(node.closest && node.closest('[data-igs-internal-reader="1"]'));
}
