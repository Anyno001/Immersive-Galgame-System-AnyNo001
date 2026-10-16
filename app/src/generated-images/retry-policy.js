import { classifyImageError, describeFailure } from './failure-classify.js';

const MAX_BACKOFF_MS = 30000;
const MAX_TOTAL_WAIT_MS = 60000;
const COOLDOWN_MS = 60000;
const COOLDOWN_GAP_MS = 3000;

export const DEFAULT_IMAGE_RETRY = Object.freeze({ enabled: true, times: 2 });

export function readImageRetrySettings(autoIllustration) {
    const raw = autoIllustration && typeof autoIllustration.retry === 'object' && autoIllustration.retry ? autoIllustration.retry : {};
    const times = Math.round(Number(raw.times));
    return {
        enabled: raw.enabled !== false,
        times: Number.isFinite(times) ? Math.min(5, Math.max(0, times)) : DEFAULT_IMAGE_RETRY.times,
    };
}

// 被限流后 60 秒内所有出图请求间隔不少于 3 秒；只记两个时间戳，不排队。
export function createRateGate({ now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    let until = 0;
    let last = 0;
    return {
        note429(retryAfterMs = 0) {
            until = Math.max(until, now() + COOLDOWN_MS, now() + (Number(retryAfterMs) || 0));
        },
        async wait() {
            const at = now();
            if (at < until && last && at - last < COOLDOWN_GAP_MS) await sleep(COOLDOWN_GAP_MS - (at - last));
            last = now();
        },
        state: () => ({ until, last }),
    };
}

export const sharedRateGate = createRateGate();

function retryAfterMs(result) {
    const direct = Number(result && result.retryAfter);
    if (Number.isFinite(direct) && direct > 0) return Math.min(MAX_BACKOFF_MS, direct * 1000);
    return 0;
}

export function backoffMs(kind, attempt, result) {
    if (kind === 'emptyOrBroken') return 0;
    if (kind === 'rateLimit429') return retryAfterMs(result) || Math.min(MAX_BACKOFF_MS, 5000 * (2 ** attempt));
    if (kind === 'network') return attempt === 0 ? 2000 : 6000;
    return Math.min(MAX_BACKOFF_MS, 2000 * (2 ** attempt));
}

function newSeed(random) {
    return Math.max(1, Math.floor(random() * 4294967294) + 1);
}

function failureOf(result, source, attempts) {
    const info = classifyImageError(result, { source });
    return { kind: info.kind, reason: info.reason, retryable: info.retryable, attempts, status: info.status };
}

// run({ attempt, seed })：seed 仅在上一次为空图 / 坏图时给出新值。返回形如 { ok, error, status?, retryAfter? }。
// NAI 自带 3 次重试，外层只记 429 冷却，不再叠加。最终失败的结果附带 failure: { kind, reason, retryable, attempts }。
export async function withImageRetry(run, options = {}) {
    const {
        source = '', settings = DEFAULT_IMAGE_RETRY, gate = sharedRateGate, random = Math.random,
        sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry,
    } = options;
    const max = source === 'nai' || !settings.enabled ? 0 : Math.max(0, Number(settings.times) || 0);
    let seed;
    let waited = 0;
    for (let attempt = 0; ; attempt += 1) {
        await gate.wait();
        let result;
        try { result = await run({ attempt, seed }); } catch (error) { result = { ok: false, error: (error && error.message) || String(error) }; }
        if (result && (result.ok || result.delegate || result.stopGeneration)) return result;
        const failure = failureOf(result, source, attempt + 1);
        if (failure.kind === 'rateLimit429') gate.note429(retryAfterMs(result));
        const delay = backoffMs(failure.kind, attempt, result);
        if (!failure.retryable || attempt >= max || waited + delay > MAX_TOTAL_WAIT_MS) {
            return { ...(result || {}), ok: false, failure };
        }
        if (typeof onRetry === 'function') {
            try { onRetry({ attempt: attempt + 1, max, kind: failure.kind, text: `${describeFailure(failure.kind)}，正在第 ${attempt + 1}/${max} 次重试…` }); } catch (_) { /* 提示出错不影响重试 */ }
        }
        if (failure.kind === 'emptyOrBroken') seed = newSeed(random);
        if (delay > 0) { waited += delay; await sleep(delay); }
    }
}

export function annotateImageFailure(result, source) {
    if (!result || result.ok !== false || result.failure || result.delegate || result.stopGeneration) return result;
    return { ...result, failure: failureOf(result, source, 1) };
}
