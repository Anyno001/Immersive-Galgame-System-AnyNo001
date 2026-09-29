import { parseImageResponse } from './image-api-client.js';
import { buildNaiV4Request, validateNaiV4Request, NAI_DEFAULT_SETTINGS, NAI_OFFICIAL_ENDPOINT } from './request-builders/nai-v4-builder.js';
import { buildNaiInpaintRequest, resolveNaiInpaintModel } from './request-builders/nai-inpaint-builder.js';

export { NAI_OFFICIAL_ENDPOINT };
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 30000;

export function resolveNaiEndpoint(endpoint) {
    return String(endpoint || '').trim() || NAI_OFFICIAL_ENDPOINT;
}

function toProxyUrl(url) {
    return `/proxy/${url}`;
}

function describeStatus(status, detail = '') {
    const suffix = detail ? `：${detail}` : '';
    if (status === 401) return 'NAI 鉴权失败（401）：请检查 NAI Key';
    if (status === 402) return 'NAI 余额/订阅不足（402）';
    if (status === 429) return `NAI 请求过于频繁（429），已自动重试仍失败，请稍后再试或降低同时生成数量${suffix}`;
    if (status >= 500) return `NAI 服务端错误（HTTP ${status}），已自动重试 ${MAX_ATTEMPTS - 1} 次仍失败${suffix || '，多为 NAI 繁忙或参数不被当前模型支持'}`;
    return `NAI 返回 HTTP ${status}${suffix}`;
}

// NAI 出错时返回 {statusCode, message}；中转可能返回纯文本或 HTML，只截一小段。
async function readErrorDetail(response) {
    let text = '';
    try { text = String(await response.text()); } catch (error) { return ''; }
    try {
        const data = JSON.parse(text);
        if (data && (data.message || data.error)) text = String(data.message || data.error);
    } catch (error) { /* 非 JSON */ }
    if (/<html|<!doctype/i.test(text)) return '';
    return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function retryDelayMs(response, attempt) {
    const header = response && response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('retry-after') : null;
    const seconds = Number(header);
    if (header != null && Number.isFinite(seconds) && seconds > 0) return Math.min(MAX_BACKOFF_MS, seconds * 1000);
    const base = response && response.status === 429 ? 5000 : 2000;
    return Math.min(MAX_BACKOFF_MS, base * (2 ** attempt));
}

export function createNaiOfficialClient(deps = {}) {
    const fetchImpl = deps.fetch || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const random = deps.random || Math.random;

    async function send(body, settings) {
        const direct = settings.transport !== 'st-proxy';
        const target = resolveNaiEndpoint(settings.endpoint);
        const url = direct ? target : toProxyUrl(target);
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), Number(settings.timeoutMs) || 120000) : null;
        try {
            return await fetchImpl(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/zip, application/octet-stream, application/json, image/png',
                    Authorization: `Bearer ${settings.apiKey}`,
                },
                body: JSON.stringify(body),
                mode: direct ? 'cors' : 'same-origin',
                credentials: direct ? 'omit' : 'same-origin',
                signal: controller ? controller.signal : undefined,
            });
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    // 生成与局部重绘共用的发送 / 重试 / 响应解析；错误文案不含 Key 与请求体。
    async function sendWithRetry(body, settings) {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            let response;
            try {
                response = await send(body, settings);
            } catch (error) {
                const aborted = error && error.name === 'AbortError';
                return {
                    ok: false,
                    error: aborted ? 'NAI 请求超时' : (settings.transport === 'st-proxy'
                        ? '经酒馆代理请求 NAI 失败：请确认酒馆 config.yaml 中 enableCorsProxy 为 true'
                        : '浏览器直连 NAI 失败（可能是 CORS 或网络不通），可在设置中把传输方式改为「酒馆 CORS 代理」'),
                };
            }
            if (response.ok) {
                try {
                    const parsed = await parseImageResponse(response);
                    if (parsed && parsed.url) return { ok: true, dataUrl: parsed.url };
                } catch (error) {
                    return { ok: false, error: 'NAI 图片响应解析失败' };
                }
                return { ok: false, error: 'NAI 返回中没有图片' };
            }
            if (RETRYABLE.has(response.status) && attempt < MAX_ATTEMPTS - 1) {
                await sleep(retryDelayMs(response, attempt));
                continue;
            }
            const detail = await readErrorDetail(response);
            return { ok: false, error: describeStatus(response.status, detail), status: response.status };
        }
        return { ok: false, error: 'NAI 请求失败' };
    }

    function precheck(settings) {
        if (!fetchImpl) return { ok: false, error: '当前环境无法发起网络请求' };
        if (!String(settings.apiKey || '').trim()) return { ok: false, error: '请先在设置中填写 NAI Key' };
        return null;
    }

    async function generate(slot, naiSettings = {}) {
        const settings = { ...NAI_DEFAULT_SETTINGS, ...naiSettings };
        const blocked = precheck(settings);
        if (blocked) return blocked;
        const body = buildNaiV4Request(slot, settings, random);
        const valid = validateNaiV4Request(body);
        if (!valid.ok) return { ok: false, error: `生图请求无效：${valid.reason}` };
        return sendWithRetry(body, settings);
    }

    // 所选模型存在 inpainting 版本时才支持局部重绘。
    function supportsEdit(naiSettings = {}) {
        return Boolean(resolveNaiInpaintModel(naiSettings.model || NAI_DEFAULT_SETTINGS.model));
    }

    async function edit(request = {}, naiSettings = {}) {
        const settings = { ...NAI_DEFAULT_SETTINGS, ...naiSettings };
        const blocked = precheck(settings);
        if (blocked) return blocked;
        const built = buildNaiInpaintRequest(request, settings, random);
        if (!built.ok) return { ok: false, reason: built.reason, error: `局部重绘请求无效：${built.reason}` };
        return sendWithRetry(built.body, settings);
    }

    return { generate, edit, supportsEdit };
}
