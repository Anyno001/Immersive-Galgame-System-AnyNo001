import { getSillyTavernContext } from './tavern-helper-adapter.js';
import { isBackgroundGenerationActive } from './background-generation.js';

// 五种阅读器模式共用流式生命周期。
// 官方生成事件负责起止，#chat mutation 只在生成期间同步活动，不做解析。

export const DEFAULT_STABLE_MS = 800;
export const DEFAULT_HARD_TIMEOUT_MS = 120000;
export const DEFAULT_IDLE_MS = 10000;
export const DEFAULT_ACTIVITY_THROTTLE_MS = 150;

const FALLBACK_GENERATION_EVENTS = Object.freeze({
    started: 'generation_started',
    ended: 'generation_ended',
    stopped: 'generation_stopped',
});

// 酒馆生成期间显示 #mes_stop，结束即隐藏；插件后台请求不算。
function isHostGenerating(doc) {
    const button = doc && typeof doc.getElementById === 'function' ? doc.getElementById('mes_stop') : null;
    if (!button) return null;
    if (button.hidden === true) return false;
    const view = doc.defaultView;
    try {
        const style = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(button) : button.style;
        return Boolean(style) && style.display !== 'none' && style.visibility !== 'hidden';
    } catch (error) {
        return null;
    }
}

export function createChatStreamObserver(opts = {}) {
    const globalObject = opts.global || globalThis;
    const onActivity = typeof opts.onActivity === 'function' ? opts.onActivity : () => {};
    const onStable = typeof opts.onStable === 'function' ? opts.onStable : () => {};
    const onTimeout = typeof opts.onTimeout === 'function' ? opts.onTimeout : () => {};
    const stableMs = Number(opts.stableMs) > 0 ? Number(opts.stableMs) : DEFAULT_STABLE_MS;
    const hardTimeoutMs = Number(opts.hardTimeoutMs) > 0 ? Number(opts.hardTimeoutMs) : DEFAULT_HARD_TIMEOUT_MS;
    const idleMs = Number(opts.idleMs) > 0 ? Number(opts.idleMs) : DEFAULT_IDLE_MS;
    const activityThrottleMs = opts.activityThrottleMs != null && Number(opts.activityThrottleMs) >= 0
        ? Number(opts.activityThrottleMs)
        : DEFAULT_ACTIVITY_THROTTLE_MS;
    let activityTimer = null;
    let activityPending = false;
    let observer = null;
    let stableTimer = null;
    let hardTimer = null;
    let active = false;
    let generationActive = false;
    let waitTimedOut = false;
    let manualArmed = false;
    let lifecycleAvailable = false;
    let completion = null;
    let revision = 0;
    let settling = false;
    let replyActivitySeen = false;
    let hostGenerationSeen = false;
    let quietPending = false;
    let lastActivityAt = 0;
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
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

    const scheduleStable = (delay = stableMs) => {
        if (!active) return;
        clearStable();
        stableTimer = getSetter()(() => {
            stableTimer = null;
            if (!active) return;
            if (settling || !hasGenerationSettled()) {
                scheduleStable(idleMs);
                return;
            }
            const expected = revision;
            settling = true;
            Promise.resolve()
                .then(() => onStable({ reason: completion || 'ended', revision: expected }))
                .then((completed) => {
                    if (!active || revision !== expected) return;
                    if (completed !== false) {
                        manualArmed = false;
                        generationActive = false;
                        clearStable();
                        clearHard();
                        clearActivity();
                        return;
                    }
                    scheduleStable();
                })
                .catch(() => { if (active && revision === expected) scheduleStable(); })
                .finally(() => { settling = false; });
        }, delay);
    };

    const ensureHard = () => {
        if (!active || hardTimer != null || waitTimedOut) return;
        hardTimer = getSetter()(() => {
            hardTimer = null;
            waitTimedOut = true;
            const expected = revision;
            if (active) Promise.resolve().then(() => {
                if (active && revision === expected) return onTimeout();
            }).catch(() => {});
        }, hardTimeoutMs);
    };

    const clearActivity = () => {
        if (activityTimer != null) getClearer()(activityTimer);
        activityTimer = null;
        activityPending = false;
    };

    // 流式输出时每几十毫秒一批变更：onActivity 首次立即执行，之后窗口内的合并成窗口末尾一次；稳定判定仍逐批重置。
    const emitActivity = () => {
        if (activityTimer != null) {
            activityPending = true;
            return;
        }
        try { onActivity(); } catch (error) { /* */ }
        if (!activityThrottleMs) return;
        activityTimer = getSetter()(() => {
            activityTimer = null;
            if (!activityPending || !active) {
                activityPending = false;
                return;
            }
            activityPending = false;
            emitActivity();
        }, activityThrottleMs);
    };

    const scheduleActivity = (external = true) => {
        if (!active) return;
        revision += 1;
        lastActivityAt = now();
        replyActivitySeen ||= external;
        if (!generationActive && !hostGenerationSeen) hostGenerationSeen = isHostGenerating(resolveDocument()) === true;
        waitTimedOut = false;
        clearHard();
        emitActivity();
        ensureHard();
        scheduleStable(generationActive ? idleMs : stableMs);
    };

    const onGenerationStarted = (type, params, dryRun) => {
        if (!active) return;
        // quiet 为插件后台请求、dryRun 只组装提示词，二者都不写入楼层；dryRun 还不会发结束事件，
        // 若据此武装，会让之后任意 #chat 变更长期卡在“正在生成”。
        if (dryRun === true) return;
        if (isBackgroundGenerationActive()) return;
        if (type === 'quiet' && !(params && params.quietToLoud)) { quietPending = true; return; }
        quietPending = false;
        revision += 1;
        generationActive = true;
        completion = null;
        waitTimedOut = false;
        clearStable();
        clearHard();
        ensureHard();
        // 酒馆生成事件是全局信号，插件自身的 API 请求也会触发它。
        // 这里只武装生命周期；必须先看到 #chat 的外部变更，或宿主停止按钮亮起（插件请求不亮），才进入载入态。
        // 非流式时 #chat 要等整段回复落地才变，只等 DOM 会让等待过场迟到到回复写完。代写不落楼，不进等待。
        if (type === 'impersonate') return;
        const armed = revision;
        const probe = (left) => getSetter()(() => {
            if (!active || !generationActive || revision !== armed) return;
            if (isHostGenerating(resolveDocument()) === true) { scheduleActivity(false); return; }
            if (left > 0) probe(left - 1);
        }, 120);
        probe(4);
    };

    const onGenerationFinished = (reason) => {
        if (!active || isBackgroundGenerationActive()) return;
        if (quietPending) { quietPending = false; return; }
        if (!generationActive && !manualArmed) return;
        revision += 1;
        generationActive = false;
        if (completion !== 'stopped' && completion !== 'failed') completion = reason;
        manualArmed = true;
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
        const subscribe = (eventName, handler) => {
            eventSource.on(eventName, handler);
            lifecycleCleanup.push(() => {
                if (typeof eventSource.removeListener === 'function') eventSource.removeListener(eventName, handler);
                else if (typeof eventSource.off === 'function') eventSource.off(eventName, handler);
            });
        };
        try {
            subscribe(started, onGenerationStarted);
            subscribe(eventTypes.GENERATION_ENDED || FALLBACK_GENERATION_EVENTS.ended, () => onGenerationFinished('ended'));
            subscribe(eventTypes.GENERATION_STOPPED || FALLBACK_GENERATION_EVENTS.stopped, () => onGenerationFinished('stopped'));
            for (const name of new Set([eventTypes.GENERATION_FAILED, eventTypes.GENERATION_ERROR].filter(Boolean))) {
                subscribe(name, () => onGenerationFinished('failed'));
            }
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
                // 先做廉价的生成状态判断：非生成期间（阅读器演出、HUD 更新等）直接返回，不逐条检查节点归属。
                if (lifecycleAvailable && !generationActive && !manualArmed) return;
                const external = Array.isArray(records) && records.some((record) => !isInternalRecord(record, opts.isUserFloor));
                if (!external) return;
                scheduleActivity();
            });
            try {
                observer.observe(chat, { childList: true, subtree: true, characterData: true });
            } catch (error) {
                observer = null;
            }
        }
        // 流式中途打开时，按宿主的停止按钮补武装；超时只提醒，不当作完成。
        if (lifecycleAvailable && !generationActive && isHostGenerating(doc)) {
            generationActive = true;
            scheduleActivity();
        }
        return { ok: true, observed: Boolean(observer), lifecycle: lifecycleAvailable };
    };

    const cancelPending = () => {
        generationActive = false;
        waitTimedOut = false;
        manualArmed = false;
        completion = null;
        revision += 1;
        replyActivitySeen = false;
        hostGenerationSeen = false;
        quietPending = false;
        lastActivityAt = 0;
        clearStable();
        clearHard();
        clearActivity();
    };

    // 新一次发送：还没看到本轮生成事件时清掉上一轮的“已结束”标记。
    // 生成已经开始则保留，避免发送函数返回前触发的开始事件被立刻抹掉。
    const prepareForReply = () => {
        revision += 1;
        waitTimedOut = false;
        completion = null;
        manualArmed = true;
        replyActivitySeen = false;
        hostGenerationSeen = isHostGenerating(resolveDocument()) === true;
        lastActivityAt = 0;
        clearStable();
        clearHard();
    };

    // 静默与超时都不是完成信号。缺少结束事件时，必须另有宿主停止按钮已收起的证据。
    const hasGenerationSettled = () => {
        const hostGenerating = isHostGenerating(resolveDocument());
        if (hostGenerating === true) { hostGenerationSeen = true; return false; }
        if (completion) return true;
        if (!lastActivityAt) return false;
        const quietMs = now() - lastActivityAt;
        return hostGenerating === false && (hostGenerationSeen || replyActivitySeen)
            && quietMs >= idleMs;
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
        scheduleActivity(false);
    };

    // 等待方兜底：调用方已确认新楼落地。结束事件丢了（观察器重启、事件被吞）时，停止按钮已收起就按生成结束处理。
    const kick = () => {
        if (!active || settling) return false;
        if (isHostGenerating(resolveDocument()) !== false) return false;
        if (!completion) completion = 'ended';
        manualArmed = true;
        scheduleStable();
        return true;
    };

    return {
        start,
        stop,
        cancelPending,
        isActive: () => active,
        hasLifecycle: () => lifecycleAvailable,
        noteActivity,
        kick,
        prepareForReply,
        hasGenerationSettled,
        isCurrentRevision: (expected) => active && revision === expected,
    };
}

// 用户楼一律不算 AI 回复：发送时新增的用户楼、插件改写用户楼（再触发后台请求）都不进载入态、不提示新楼。
// 先看 DOM 的 is_user，插件整块重绘丢了属性时再按楼号问聊天数据（isUserFloor）。
export function isUserFloorNode(node, isUserFloor = null) {
    const element = node && typeof node.closest !== 'function' ? node.parentElement : node;
    const mes = element && typeof element.closest === 'function' ? element.closest('.mes') : null;
    if (!mes || typeof mes.getAttribute !== 'function') return false;
    const flag = mes.getAttribute('is_user') ?? mes.getAttribute('data-is-user');
    if (flag === 'true' || flag === '1') return true;
    if (typeof isUserFloor !== 'function') return false;
    const raw = mes.getAttribute('mesid') ?? mes.getAttribute('data-mesid');
    const id = raw == null || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(id)) return false;
    try { return isUserFloor(id) === true; } catch (error) { return false; }
}

function isInternalRecord(record, isUserFloor) {
    const target = record && record.target;
    if (isInternalNode(target) || isUserFloorNode(target, isUserFloor)) return true;
    const changed = []
        .concat(record && record.addedNodes ? Array.from(record.addedNodes) : [])
        .concat(record && record.removedNodes ? Array.from(record.removedNodes) : []);
    return changed.length > 0 && changed.every((node) => isInternalNode(node) || isUserFloorNode(node, isUserFloor));
}

function isInternalNode(node) {
    if (!node) return false;
    if (typeof node.getAttribute === 'function' && node.getAttribute('data-igs-internal-reader') === '1') return true;
    return Boolean(node.closest && node.closest('[data-igs-internal-reader="1"]'));
}
