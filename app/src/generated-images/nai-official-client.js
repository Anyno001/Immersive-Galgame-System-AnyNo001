import { parseImageResponse } from './image-api-client.js';
import { buildNaiV4Request, validateNaiV4Request, NAI_DEFAULT_SETTINGS } from './request-builders/nai-v4-builder.js';

export const NAI_OFFICIAL_ENDPOINT = 'https://image.novelai.net/ai/generate-image';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function toProxyUrl(url) {
    return `/proxy/${url}`;
}

function describeStatus(status) {
    if (status === 401) return 'NAI 鉴权失败（401）：请检查 NAI Key';
    if (status === 402) return 'NAI 余额/订阅不足（402）';
    if (status === 429) return 'NAI 请求过于频繁（429）';
    return `NAI 返回 HTTP ${status}`;
}

export function createNaiOfficialClient(deps = {}) {
    const fetchImpl = deps.fetch || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const random = deps.random || Math.random;

    async function send(body, settings) {
        const direct = settings.transport !== 'st-proxy';
        const url = direct ? NAI_OFFICIAL_ENDPOINT : toProxyUrl(NAI_OFFICIAL_ENDPOINT);
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

    async function generate(slot, naiSettings = {}) {
        const settings = { ...NAI_DEFAULT_SETTINGS, ...naiSettings };
        if (!fetchImpl) return { ok: false, error: '当前环境无法发起网络请求' };
        if (!String(settings.apiKey || '').trim()) return { ok: false, error: '请先在设置中填写 NAI Key' };
        const body = buildNaiV4Request(slot, settings, random);
        const valid = validateNaiV4Request(body);
        if (!valid.ok) return { ok: false, error: `生图请求无效：${valid.reason}` };
        for (let attempt = 0; attempt < 2; attempt += 1) {
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
            if (RETRYABLE.has(response.status) && attempt === 0) {
                await sleep(response.status === 429 ? 5000 : 2000);
                continue;
            }
            return { ok: false, error: describeStatus(response.status), status: response.status };
        }
        return { ok: false, error: 'NAI 请求失败' };
    }

    return { generate };
}
