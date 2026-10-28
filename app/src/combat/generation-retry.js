import { generateEntities } from './generation.js';

// 生成请求的有界自动重试：只重发上游明确拒绝、可安全补发的请求（HTTP 408 / 425 / 429 / 500 / 502 / 503）。
// 取消与迟到（request-stale）、配置不完整、副 LLM 不可用、回复格式修正耗尽都不重试；
// 发送状态未知的传输失败与 504 也不自动补发（上游可能已执行，避免重复计费），交给手动重试。
// 生成本身不落账，重试只重新请求，不会重复写表。
export const COMBAT_GENERATION_RETRY_DELAYS = Object.freeze([2000, 6000]);
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503]);

export function isRetryableGeneration(result) {
    const failure = result?.requestFailure;
    if (!failure || result.reason === 'request-stale') return false;
    return failure.reason === 'secondary-llm-http-failed' && RETRYABLE_STATUS.has(failure.status);
}

function wait(ms, signal) {
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
        const onAbort = () => { clearTimeout(timer); resolve(false); };
        const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(true); }, Math.max(0, ms));
        signal?.addEventListener?.('abort', onAbort, { once: true });
    });
}

// onRetry({ attempt, delay, status }) 在每次等待前回调；等待中取消返回 request-stale。
// 发生过重试时结果附 retries（实际重试次数），未重试时结果与 generateEntities 完全一致。
export async function generateWithRetry(entities, { retryDelays = COMBAT_GENERATION_RETRY_DELAYS, onRetry, ...options } = {}) {
    const delays = Array.isArray(retryDelays) ? retryDelays : COMBAT_GENERATION_RETRY_DELAYS;
    let result = await generateEntities(entities, options);
    let retries = 0;
    while (retries < delays.length && isRetryableGeneration(result)) {
        const delay = Number(delays[retries]) || 0;
        retries += 1;
        try { onRetry?.({ attempt: retries, delay, status: result.requestFailure.status }); } catch (error) { /* 订阅者异常不影响重试 */ }
        if (!(await wait(delay, options.signal))) return { ok: false, reason: 'request-stale', accepted: [], rejected: [], diagnostics: [], retries };
        result = await generateEntities(entities, options);
    }
    return retries ? { ...result, retries } : result;
}
