// 原操作持有输入和已完成步骤；再次执行必须有修复进展或真实的环境变更。
const recoverySignals = new WeakMap();
export const RECOVERY_ATTEMPTS = 3;

function failureFrom(error) {
    const seen = new Set();
    for (let current = error; current && !seen.has(current); current = current.cause) {
        seen.add(current);
        if (current.result?.recoveryStopped) return current.result;
    }
    return error?.result;
}
const recoverySignalFor = global => {
    if (!recoverySignals.has(global)) recoverySignals.set(global, { revision: 0, storageRevision: 0, listeners: new Set(), notices: new Map(), subscribers: new Set(), sequence: 0 });
    return recoverySignals.get(global);
};

export function recoveryFailureText(result) {
    const reason = result?.error?.message || result?.error || result?.saveError?.message || result?.message || result?.reason;
    return typeof reason === 'string' && reason.trim() ? reason.trim() : '操作没有完成';
}

// 状态由业务层发布、视觉层订阅；关闭提示不会取消或重放原操作。
export function subscribeRecoveries(global = globalThis, listener) {
    const state = recoverySignalFor(global);
    state.subscribers.add(listener);
    listener([...state.notices.values()]);
    return () => state.subscribers.delete(listener);
}

export function trackRecovery(global = globalThis) {
    const state = recoverySignalFor(global), id = ++state.sequence;
    const emit = () => {
        for (const listener of [...state.subscribers]) {
            try { listener([...state.notices.values()]); } catch { /* UI 不影响原任务。 */ }
        }
    };
    const end = () => { if (state.notices.delete(id)) emit(); };
    return {
        update({ phase, message, page, actionLabel }) {
            // 提示不持有请求、模型正文或图片字节。
            state.notices.set(id, { phase, message, page, actionLabel, id, dismiss: end }); emit();
        },
        end,
    };
}
export function recoveryCancelled(value) {
    return value?.cancelled === true || /^(?:cancelled|canceled|user-cancelled|dna-cancelled|abort-by-user|request-stale|stale-target|stale-chat|stale-config)$/.test(value?.reason || '');
}

export function wakeRecoveringOperations(global = globalThis, change) {
    const state = recoverySignalFor(global);
    state.revision++;
    if (change?.type === 'storage-capacity-changed') state.storageRevision++;
    for (const listener of [...state.listeners]) listener();
    if (typeof global.dispatchEvent !== 'function') return;
    const EventCtor = global.Event || globalThis.Event;
    if (EventCtor) global.dispatchEvent(new EventCtor('igs:recovery-wake'));
}

export function waitForRecoveryChange({ signal, global = globalThis, revision } = {}) {
    const state = recoverySignalFor(global);
    return new Promise(resolve => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            state.listeners.delete(finish);
            signal?.removeEventListener?.('abort', finish);
            for (const name of ['online', 'storage', 'igs:recovery-wake']) global.removeEventListener?.(name, finish);
            resolve();
        };
        if (signal?.aborted || (revision !== undefined && state.revision !== revision)) { finish(); return; }
        state.listeners.add(finish);
        signal?.addEventListener?.('abort', finish, { once: true });
        for (const name of ['online', 'storage', 'igs:recovery-wake']) global.addEventListener?.(name, finish, { once: true });
    });
}

export function linkRecoverySignals(inputs) {
    const signals = [...new Set(inputs.filter(Boolean))];
    if (signals.length < 2) return { signal: signals[0], release() {} };
    if (typeof AbortSignal.any === 'function') {
        try { return { signal: AbortSignal.any(signals), release() {} }; } catch { /* 宿主的兼容信号走事件接口。 */ }
    }
    const controller = new AbortController();
    const release = () => signals.forEach(signal => signal.removeEventListener?.('abort', abort));
    const abort = () => { controller.abort(); release(); };
    if (signals.some(signal => signal.aborted)) abort();
    else signals.forEach(signal => signal.addEventListener?.('abort', abort, { once: true }));
    return { signal: controller.signal, release };
}

export function createOperationCheckpoint() {
    const completed = new Map(), pending = new Map();
    return {
        async step(key, execute) {
            if (completed.has(key)) return completed.get(key);
            if (pending.has(key)) return pending.get(key);
            const job = Promise.resolve().then(execute).then(value => {
                if (value !== false && value?.ok !== false && !recoveryCancelled(value)) completed.set(key, value);
                return value;
            }).finally(() => pending.delete(key));
            pending.set(key, job);
            return job;
        },
        forget(key) { completed.delete(key); },
        clear() { completed.clear(); },
    };
}

export function waitForRecovery(ms, { signal, global = globalThis } = {}) {
    return new Promise(resolve => {
        if (signal?.aborted) { resolve(); return; }
        const state = recoverySignalFor(global);
        let timer;
        const done = () => {
            (global.clearTimeout || clearTimeout)(timer);
            signal?.removeEventListener?.('abort', done);
            state.listeners.delete(done);
            global.removeEventListener?.('online', done);
            global.removeEventListener?.('igs:recovery-wake', done);
            resolve();
        };
        timer = (global.setTimeout || setTimeout)(done, ms);
        state.listeners.add(done);
        signal?.addEventListener?.('abort', done, { once: true });
        global.addEventListener?.('online', done, { once: true });
        global.addEventListener?.('igs:recovery-wake', done, { once: true });
    });
}

async function recoveryStep(execute, signal) {
    if (signal?.aborted) return { ok: false, cancelled: true, reason: 'cancelled' };
    const pending = Promise.resolve(execute());
    if (typeof signal?.addEventListener !== 'function') return pending;
    let abort;
    try { return await Promise.race([pending, new Promise(resolve => {
        abort = () => resolve({ ok: false, cancelled: true, reason: 'cancelled' });
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
    })]); } finally { signal.removeEventListener('abort', abort); }
}

export async function recoverOperation(execute, { signal, isActive = () => true,
    shouldRecover = () => true, repair, onRecover, wait = waitForRecovery,
    retryUnchanged = true, canResume, observe, waitFor, repeatable,
    maxAttempts = RECOVERY_ATTEMPTS, passiveObservation = false,
    initialDelayMs = 100, maxDelayMs = 30000, global = globalThis } = {}) {
    const limit = Number.isSafeInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : RECOVERY_ATTEMPTS;
    let attempt = 0, executions = 0, retriedUnchanged = false;
    const notice = trackRecovery(global);
    let failed = false;
    const exhausted = (result, cause, condition) => {
        failed = true;
        const error = `自动处理共尝试 ${executions} 次，仍未完成：${recoveryFailureText(result)}`;
        const failure = { ...(result || {}), ok: false, reason: 'recovery-exhausted', recoveryStopped: true, error,
            diagnostic: { ...result?.diagnostic, attempts: executions, failureReason: result?.reason } };
        notice.update({ ...condition, phase: 'failed', message: error });
        if (cause) { cause.result = failure; throw cause; }
        return failure;
    };
    try {
    while (!signal?.aborted && isActive()) {
        const revision = recoverySignalFor(global).revision;
        const storageRevision = recoverySignalFor(global).storageRevision;
        let result, cause;
        try {
            executions++;
            result = await recoveryStep(execute, signal);
        } catch (error) { cause = error; result = failureFrom(error) || { ok: false,
            reason: error?.code || error?.message || 'operation-pending', error: error?.message || String(error) }; }
        // 用户中途停止时，本次已返回的部分成果（如批量差分里已画好的几张）要交回调用方入库，不能当作取消丢掉。
        if ((signal?.aborted || !isActive()) && Array.isArray(result?.items) && result.items.some(item => item?.ok)) return result;
        if (signal?.aborted || !isActive()) break;
        if (result !== false && result?.ok !== false) return result;
        if (recoveryCancelled(result)) return result;
        if (result?.recoveryStopped) { if (cause) throw cause; return result; }
        if (result?.reason === 'recovery-exhausted') {
            failed = true;
            notice.update({ phase: 'failed', message: recoveryFailureText(result), result });
            return { ...result, recoveryStopped: true };
        }
        if (!shouldRecover(result, cause)) { if (cause) throw cause; return result; }
        attempt++;
        let repaired;
        try { repaired = await recoveryStep(() => repair?.(result, cause), signal); } catch { /* 修复失败不能算作已经取得进展。 */ }
        if (signal?.aborted || !isActive()) break;
        if (repaired?.completed === true) return repaired.value;
        const progressed = repaired === true || repaired?.changed === true;
        // 错误措辞变化和无关配置通知都不是修复证据。
        // 本地幂等操作只允许一次无进展重试；付费请求由调用方禁用这一次。
        let resumed = false;
        if (!progressed && recoverySignalFor(global).revision !== revision) {
            try {
                const ready = await recoveryStep(() => canResume?.(result, cause), signal);
                resumed = ready === true || ready?.changed === true;
            } catch { /* 变化没有解除本次失败原因。 */ }
        }
        const retry = progressed || resumed || (retryUnchanged && !retriedUnchanged);
        if (retry) retriedUnchanged = true;
        const quota = repeatable === 'save' && (cause?.name === 'QuotaExceededError'
            || result?.saveError?.name === 'QuotaExceededError' || /quota|存储.*满|空间不足/i.test(recoveryFailureText(result)));
        const condition = (typeof waitFor === 'function' ? waitFor(result, cause) : waitFor)
            || (quota
                ? { message: `保存尚未完成：${recoveryFailureText(result)}。请在备份中清理缓存或无用素材；释放空间后自动续存原结果。`,
                    page: 'data', actionLabel: '打开备份与缓存' } : null);
        if (executions >= limit && quota) {
            const detail = { ...condition, phase: 'waiting-condition', result,
                message: `存储空间不足，${executions} 次保存仍未完成，已停止重复写入。原结果保留；在备份中清理缓存后自动续存。` };
            notice.update(detail);
            try { onRecover?.(detail); } catch {}
            let observed = recoverySignalFor(global).revision;
            while (!signal?.aborted && isActive() && recoverySignalFor(global).storageRevision === storageRevision) {
                await waitForRecoveryChange({ signal, global, revision: observed });
                observed = recoverySignalFor(global).revision;
            }
            if (signal?.aborted || !isActive()) break;
            executions = 0; retriedUnchanged = false;
            continue;
        }
        if (executions >= limit) return exhausted(result, cause, condition);
        // 条件等待必须显式声明等待对象及可验证的续接条件。observe 则实际重读来源。
        if (!retry && !observe && !repeatable && !(condition?.message && typeof canResume === 'function')) {
            failed = true;
            notice.update({ phase: 'failed', message: recoveryFailureText(result), result });
            const failure = { ...(result || { ok: false }), ok: false, recoveryStopped: true };
            if (cause) { cause.result = failure; throw cause; }
            return failure;
        }
        let observed = recoverySignalFor(global).revision;
        const detail = { attempt, result, phase: retry ? 'repairing' : 'waiting-condition',
            ...(condition || {}),
            message: retry ? `正在恢复：${recoveryFailureText(result)}`
                : condition?.message || `${repeatable === 'save' ? '保存' : '读取'}尚未完成：${recoveryFailureText(result)}。正在自动${repeatable === 'save' ? '续存原结果' : '重新读取'}，成功后自动继续。` };
        notice.update(detail);
        try { onRecover?.(detail); } catch { /* 展示不可阻止恢复。 */ }
        if (!retry) {
            if (repeatable) {
                await wait(Math.min(maxDelayMs, initialDelayMs * 2 ** Math.min(attempt, 16)), { signal, global });
                continue;
            }
            let probes = 0;
            while (!signal?.aborted && isActive()) {
                if (observe) await wait(Math.min(maxDelayMs, initialDelayMs * 2 ** Math.min(probes++, 16)), { signal, global });
                else await waitForRecoveryChange({ signal, global, revision: observed });
                observed = recoverySignalFor(global).revision;
                if (signal?.aborted || !isActive()) break;
                let ready = false;
                if (observe && !passiveObservation) executions++;
                try { ready = await recoveryStep(() => (observe || canResume)(result, cause), signal); }
                catch (error) {
                    cause = error;
                    const held = failureFrom(error);
                    if (held?.recoveryStopped) throw error;
                    result = held || { ok: false, reason: error?.code || error?.message, error: error?.message || String(error) };
                }
                if (ready?.completed === true) return ready.value;
                if (ready?.value?.ok === false) result = ready.value;
                if (executions >= limit) return exhausted(result, cause, condition);
                if (ready === true || ready?.changed === true) break;
            }
            continue;
        }
        await wait(Math.min(maxDelayMs, initialDelayMs * 2 ** Math.min(attempt - 1, 16)), { signal, global });
    }
    return { ok: false, cancelled: true, reason: 'cancelled', stopGeneration: true };
    } finally { if (!failed) notice.end(); }
}

// 服务成功结果跨保存重试复用；读取不缓存，始终取最新状态。
const GENERATED_STEPS = new Set(['generateCharacterSprite', 'generateCharacterAvatar', 'generateExpressionSet',
    'generateExpressionImage', 'paintExpressionCaptions', 'paintDirectorExpressions', 'generateSceneVariants', 'writeWardrobePrompt',
    'paintWardrobeReference', 'importAssetImage', 'upload', 'importFile', 'generate', 'regenerate']);
export function checkpointService(service, checkpoint, prefix = '') {
    if (!service) return service;
    const strings = new Map();
    let sequence = 0;
    return new Proxy(service, { get(target, name) {
        const value = target[name];
        if (typeof value !== 'function') return value;
        if (!GENERATED_STEPS.has(name)) return value.bind(target);
        return (...args) => {
            const input = args[0] || {};
            if (typeof input === 'string' && !strings.has(input)) strings.set(input, ++sequence);
            const key = `${prefix}:${String(name)}:${JSON.stringify([input.name, input.character, input.outfit?.name || input.outfit,
                input.mood, input.moods, input.items?.map(item => item.mood), input.id, input.key, input.messageId, input.slot,
                input.time, input.weather, typeof input === 'string' ? strings.get(input) : ''])}`;
            return checkpoint.step(key, () => value.apply(target, args));
        };
    } });
}
