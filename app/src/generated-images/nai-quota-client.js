// 账户查询独立于生图队列，只在用户主动查询时发送；错误不回显服务端正文或凭据。
import { resolveTavernTransport, tavernProxyUrl, tavernProxyFailure,
    TAVERN_PROXY_DISABLED_HINT, TAVERN_BACKEND_UNREACHABLE_HINT } from '../host/tavern-cors-proxy.js';

export function resolveNaiSubscriptionEndpoint(endpoint) {
    const url = new URL(String(endpoint || '').trim() || 'https://image.novelai.net');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('请填写有效的 HTTP(S) NAI 地址，且不要在地址中包含凭据');
    // 接受根地址、/ai 和完整生图地址；中转的 /v1/novelai 等路径前缀必须保留。
    const path = url.pathname.replace(/\/+$/, '').replace(/\/(?:ai\/generate-image|generate-image|ai)$/, '');
    url.pathname = `${path}/user/subscription`;
    url.search = ''; url.hash = '';
    return url.href;
}

const numeric = value => (typeof value === 'number' || (typeof value === 'string' && value.trim()))
    && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function normalizeNaiQuota(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('账户接口未返回有效的额度数据');
    const fixed = numeric(data.trainingStepsLeft?.fixedTrainingStepsLeft);
    const purchased = numeric(data.trainingStepsLeft?.purchasedTrainingSteps);
    const percent = numeric(data.usage?.percent);
    if (fixed === null && purchased === null && percent === null)
        throw new Error('账户接口未提供 Anlas 或 V5 额度，当前站点可能不支持查询');
    return { tier: numeric(data.tier), active: typeof data.active === 'boolean' ? data.active : null,
        fixed, purchased, total: fixed !== null && purchased !== null ? fixed + purchased : null,
        percent, timeUntilNext: numeric(data.usage?.timeUntilNextPercent),
        isNegative: data.usage?.isNegative === true };
}

export function createNaiQuotaClient(deps = {}) {
    const fetchImpl = deps.fetch || globalThis.fetch?.bind(globalThis);
    return { async query(settings = {}) {
        const apiKey = String(settings.apiKey || '').trim();
        if (!apiKey) return { ok: false, error: '请先填写 NovelAI API Key' };
        let target;
        try { target = resolveNaiSubscriptionEndpoint(settings.endpoint); }
        catch { return { ok: false, error: '请填写有效的 HTTP(S) NAI 地址，且不要在地址中包含凭据' }; }
        if (!fetchImpl) return { ok: false, error: '当前环境不支持网络请求' };
        const controller = new AbortController();
        const abort = () => controller.abort();
        settings.signal?.addEventListener('abort', abort, { once: true });
        if (settings.signal?.aborted) abort();
        let timer, onAbort, timedOut = false;
        const stopped = new Promise(resolve => {
            onAbort = () => resolve({ ok: false, error: timedOut ? '额度查询超时，请稍后重试' : '额度查询已取消' });
            controller.signal.addEventListener('abort', onAbort, { once: true });
            if (controller.signal.aborted) onAbort();
            timer = setTimeout(() => { timedOut = true; abort(); }, deps.timeoutMs || 20000);
        });
        const request = async () => {
            try {
                const transport = await resolveTavernTransport(settings.transport, fetchImpl);
                if (controller.signal.aborted) return { ok: false, error: '额度查询已取消' };
                const direct = transport !== 'st-proxy';
                const response = await fetchImpl(direct ? target : tavernProxyUrl(target), {
                    method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
                    mode: direct ? 'cors' : 'same-origin', credentials: direct ? 'omit' : 'same-origin',
                    cache: 'no-store', redirect: 'error', signal: controller.signal,
                });
                if (!response.ok) {
                    const status = response.status;
                    if (!direct && [404, 500].includes(status)) {
                        const failure = tavernProxyFailure(status, await response.text());
                        if (failure) return { ok: false, error: failure === 'disabled'
                            ? TAVERN_PROXY_DISABLED_HINT : TAVERN_BACKEND_UNREACHABLE_HINT };
                    }
                    const error = [401, 403].includes(status) ? `Key 无效或无查询权限（HTTP ${status}）`
                        : [404, 405].includes(status) ? `当前站点不支持账户额度查询（HTTP ${status}）`
                        : status === 429 ? '查询过于频繁，请稍后重试（HTTP 429）' : `额度查询失败（HTTP ${status}）`;
                    return { ok: false, error };
                }
                let data;
                try { data = await response.json(); }
                catch { return { ok: false, error: '账户接口返回的不是有效 JSON，当前站点可能不支持查询' }; }
                try { return { ok: true, quota: normalizeNaiQuota(data), queriedAt: Date.now() }; }
                catch (error) { return { ok: false, error: error.message }; }
            } catch {
                return { ok: false, error: '额度查询连接失败，请检查地址、网络及所选传输方式' };
            }
        };
        try { return await Promise.race([stopped, request()]); }
        finally {
            clearTimeout(timer);
            settings.signal?.removeEventListener('abort', abort);
            controller.signal.removeEventListener('abort', onAbort);
        }
    } };
}
