// 楼层内嵌的流式生命周期：仅在 embedded 阅读器打开时创建，
// 只观察 #chat，不轮询、不全页监听；每次 token 只重置计时器，不做解析。

export const DEFAULT_STABLE_MS = 800;
export const DEFAULT_HARD_TIMEOUT_MS = 120000;

export function createChatStreamObserver(opts = {}) {
    const globalObject = opts.global || globalThis;
    const doc = opts.document || (globalObject && globalObject.document) || null;
    const onActivity = typeof opts.onActivity === 'function' ? opts.onActivity : () => {};
    const onStable = typeof opts.onStable === 'function' ? opts.onStable : () => {};
    const onTimeout = typeof opts.onTimeout === 'function' ? opts.onTimeout : onStable;
    const stableMs = Number(opts.stableMs) > 0 ? Number(opts.stableMs) : DEFAULT_STABLE_MS;
    const hardTimeoutMs = Number(opts.hardTimeoutMs) > 0 ? Number(opts.hardTimeoutMs) : DEFAULT_HARD_TIMEOUT_MS;
    let observer = null;
    let stableTimer = null;
    let hardTimer = null;
    let active = false;

    const schedule = () => {
        if (!active) return;
        onActivity();
        clearStable();
        const setter = typeof globalObject.setTimeout === 'function' ? globalObject.setTimeout.bind(globalObject) : setTimeout;
        if (hardTimer == null) {
            hardTimer = setter(() => {
                hardTimer = null;
                if (active) onTimeout();
            }, hardTimeoutMs);
        }
        stableTimer = setter(() => {
            stableTimer = null;
            if (!active) return;
            Promise.resolve(onStable()).then((completed) => {
                if (completed !== false) clearHard();
            });
        }, stableMs);
    };

    const clearStable = () => {
        if (stableTimer == null) return;
        const clearer = typeof globalObject.clearTimeout === 'function' ? globalObject.clearTimeout.bind(globalObject) : clearTimeout;
        clearer(stableTimer);
        stableTimer = null;
    };

    const clearHard = () => {
        if (hardTimer == null) return;
        const clearer = typeof globalObject.clearTimeout === 'function' ? globalObject.clearTimeout.bind(globalObject) : clearTimeout;
        clearer(hardTimer);
        hardTimer = null;
    };

    const MutationObserverCtor = globalObject.MutationObserver || globalObject.WebKitMutationObserver || null;

    const start = () => {
        if (active) return { ok: true, already: true };
        active = true;
        const chat = doc && typeof doc.querySelector === 'function' ? doc.querySelector('#chat') : null;
        if (MutationObserverCtor && chat) {
            observer = new MutationObserverCtor((records) => {
                const external = Array.isArray(records) && records.some((record) => !isInternalRecord(record));
                if (!external) return;
                schedule();
            });
            try {
                observer.observe(chat, { childList: true, subtree: true, characterData: true });
            } catch (error) {
                observer = null;
            }
        }
        return { ok: true, observed: Boolean(observer) };
    };

    const stop = () => {
        active = false;
        clearStable();
        clearHard();
        if (observer && typeof observer.disconnect === 'function') observer.disconnect();
        observer = null;
    };

    return { start, stop, isActive: () => active, noteActivity: schedule };
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
