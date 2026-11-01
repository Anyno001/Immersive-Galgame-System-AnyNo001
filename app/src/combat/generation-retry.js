// 战斗实体生成的重试封装。
// 只对「后台模型 HTTP 失败且状态码属于可重试集合」的结果重试，延迟逐次递增；
// 等待期间若 signal 被中止，立即返回 request-stale，不再发请求。
import { generateEntities } from './generation.js';

// 默认重试延迟（毫秒）：第一次重试等 2 秒，第二次等 6 秒，共重试两次。
export const COMBAT_GENERATION_RETRY_DELAYS = Object.freeze([2000, 6000]);

// 可重试的 HTTP 状态码：请求超时、过早、限流与服务端临时故障。
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503]);

// 判断一次生成结果是否值得重试。
// 没有 requestFailure、或原因是 request-stale（已被中止/过期）时一律不重试。
export function isRetryableGeneration(result) {
    const failure = result?.requestFailure;
    if (!failure || result.reason === 'request-stale') return false;
    return failure.reason === 'secondary-llm-http-failed' && RETRYABLE_STATUSES.has(failure.status);
}

// 等待 ms 毫秒；等待期间被中止则提前结束。
// 返回 true 表示正常等满，false 表示被中止（或一开始就已中止）。
function waitUnlessAborted(ms, signal) {
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
        const onAbort = () => {
            clearTimeout(timer);
            resolve(false);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener?.('abort', onAbort);
            resolve(true);
        }, Math.max(0, ms));
        signal?.addEventListener?.('abort', onAbort, { once: true });
    });
}

// 带重试的实体生成。retryDelays 非数组时回落到默认值；onRetry 抛错会被忽略。
// 重试次数大于 0 时，结果附带 retries 字段。
export async function generateWithRetry(request, { retryDelays = COMBAT_GENERATION_RETRY_DELAYS, onRetry, ...options } = {}) {
    const delays = Array.isArray(retryDelays) ? retryDelays : COMBAT_GENERATION_RETRY_DELAYS;
    let result = await generateEntities(request, options);
    let attempts = 0;
    while (attempts < delays.length && isRetryableGeneration(result)) {
        const delay = Number(delays[attempts]) || 0;
        attempts += 1;
        try {
            onRetry?.({ attempt: attempts, delay, status: result.requestFailure.status });
        } catch {
            // 回调异常不影响重试流程
        }
        // 等待期间被中止：返回过期结果，不再请求
        if (!(await waitUnlessAborted(delay, options.signal))) {
            return { ok: false, reason: 'request-stale', accepted: [], rejected: [], diagnostics: [], retries: attempts };
        }
        result = await generateEntities(request, options);
    }
    return attempts ? { ...result, retries: attempts } : result;
}
