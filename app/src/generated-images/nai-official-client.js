import { parseImageResponse } from './image-api-client.js';
import { buildNaiV4Request, validateNaiV4Request, NAI_DEFAULT_SETTINGS, NAI_OFFICIAL_ENDPOINT } from './request-builders/nai-v4-builder.js';
import { promptFromNaiBody } from './generation-prompt.js';
import { buildNaiInpaintRequest, resolveNaiInpaintModel } from './request-builders/nai-inpaint-builder.js';
import { promptSnapshotFromBody } from './final-caption.js';
import { inspectPngDataUrl, validatePngEncoding } from '../media/png-validation.js';
import { CG_PIXEL_CAP } from './illustration/cg-pixel-cap.js';
import { naiRequestQueue } from './nai-request-queue.js';
import { globalArtist } from './prompt-artists.js';
import { resetTavernProxyProbe, resolveTavernTransport, tavernProxyFailure, tavernProxyUrl,
    TAVERN_BACKEND_UNREACHABLE_HINT, TAVERN_PROXY_DISABLED_HINT } from '../host/tavern-cors-proxy.js';

export { NAI_OFFICIAL_ENDPOINT };
const RETRYABLE = new Set([429]);
const MAX_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 30000;

// 与 DBG 的最终 wire 保持一致；领域开关仍是布尔值，不改写调用方请求。
function toNaiWireBody(body) {
    const parameters = { ...body.parameters };
    for (const key of ['tag_hint_qt', 'tag_hint_uc_preset']) {
        if (typeof parameters[key] === 'boolean') {
            parameters[key] = parameters[key] ? 1 : 0;
        }
    }
    return { ...body, parameters };
}

function isOfficialNaiEndpoint(endpoint) {
    const trimmed = String(endpoint || '').trim();
    if (!trimmed) return true;
    try { return /(^|\.)novelai\.net$/i.test(new URL(trimmed).hostname); } catch { return false; }
}

const joinTags = (...parts) => parts.map((p) => String(p || '').trim().replace(/^,+|,+$/g, '').trim())
    .filter(Boolean).join(', ');

// 部分中转只转发场景段、丢弃 V4 角色段；单人图把角色词并入场景段，多人保持分段以免串特征。
export function foldSoloCharForRelay(body, endpoint) {
    const p = body && body.parameters;
    const pos = p?.v4_prompt?.caption, neg = p?.v4_negative_prompt?.caption;
    if (isOfficialNaiEndpoint(endpoint) || !pos || !Array.isArray(pos.char_captions) || pos.char_captions.length !== 1)
        return body;
    const charPos = pos.char_captions[0]?.char_caption;
    const charNeg = Array.isArray(neg?.char_captions) ? neg.char_captions[0]?.char_caption : '';
    const base = joinTags(pos.base_caption, charPos);
    const negBase = neg ? joinTags(neg.base_caption, charNeg) : '';
    return { ...body, input: base, parameters: { ...p,
        v4_prompt: { ...p.v4_prompt, caption: { ...pos, base_caption: base } },
        ...(neg && { negative_prompt: negBase,
            v4_negative_prompt: { ...p.v4_negative_prompt, caption: { ...neg, base_caption: negBase } } }) } };
}

export function resolveNaiEndpoint(endpoint) {
    const trimmed = String(endpoint || '').trim();
    if (!trimmed) return NAI_OFFICIAL_ENDPOINT;
    // 内置 NAI 接受根地址或 /ai；显式自定义路径保留，避免改变旧接口语义。
    try {
        const url = new URL(trimmed);
        if (!['http:', 'https:'].includes(url.protocol)) return trimmed;
        const path = url.pathname.replace(/\/+$/, '');
        if (path === '') url.pathname = '/ai/generate-image';
        else if (path === '/ai') url.pathname = '/ai/generate-image';
        else return trimmed;
        return url.href;
    } catch { return trimmed; }
}

function describeStatus(status, detail = '') {
    const suffix = detail ? `：${detail}` : '';
    if (status === 401) return 'NAI 鉴权失败（401）：请检查 NAI Key';
    if (status === 402) return 'NAI 余额/订阅不足（402）';
    if (status === 429) return `NAI 请求过于频繁（429），已自动重试仍失败，请稍后再试或降低同时生成数量${suffix}`;
    if (status >= 500) return `NAI 服务端错误（HTTP ${status}）${suffix}；发送状态未知，未自动补发`;
    return `NAI 返回 HTTP ${status}${suffix}`;
}

async function readErrorText(response) {
    try { return typeof response.text === 'function' ? String(await response.text()) : ''; } catch { return ''; }
}

// 上游错误说明只取 message 类字段并截短；Key 打码，HTML 去标签。
function safeDetail(text, apiKey) {
    let value = String(text || '');
    try {
        const data = JSON.parse(value);
        const message = data?.message ?? data?.error?.message ?? data?.error ?? data?.detail;
        if (typeof message === 'string') value = message;
    } catch { /* 纯文本响应 */ }
    if (apiKey) value = value.split(apiKey).join('[已隐藏]');
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function retryDelayMs(response, attempt) {
    const header = response && response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('retry-after') : null;
    const seconds = Number(header);
    if (header != null && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    if (header) {
        const date = Date.parse(header);
        if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    }
    const base = response && response.status === 429 ? 5000 : 2000;
    return Math.min(MAX_BACKOFF_MS, base * (2 ** attempt));
}

export function createNaiOfficialClient(deps = {}) {
    const fetchImpl = deps.fetch || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const random = deps.random || Math.random;
    const queue = deps.queue || naiRequestQueue;
    const stale = () => ({ ok: false, reason: 'request-stale', stopGeneration: true,
        error: '任务已取消或配置失效；上游请求可能仍在执行' });
    const allowed = settings => {
        try { return !settings.signal?.aborted
            && (!settings.shouldStart || settings.shouldStart() === true); } catch { return false; }
    };

    async function dispatch(body, inputSettings) {
        const controller = new AbortController();
        const transport = await resolveTavernTransport(inputSettings.transport, fetchImpl);
        const settings = { ...inputSettings, transport, apiKey: String(inputSettings.apiKey).trim(), signal: controller.signal };
        const timeout = Number(inputSettings.timeoutMs);
        const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 300000) : 120000;
        const abort = () => controller.abort();
        inputSettings.signal?.addEventListener('abort', abort, { once: true });
        if (inputSettings.signal?.aborted) abort();
        const timer = setTimeout(() => { try { inputSettings.onSlow?.(); } catch { /* 展示不改变请求状态。 */ } }, timeoutMs);
        const deadline = Date.now() + timeoutMs;
        // 分段计时写进生图排查日志：排队（同 Key 串行锁）、等服务器响应、下载解析。
        const p = body?.parameters || {};
        const timing = { queuedAt: Date.now(), params: `${body?.model || '?'} ${p.width}x${p.height} ${p.steps}步 采样${p.sampler}`
            + `${p.straight_alpha ? ' 透明底' : ''} 角色段${p.v4_prompt?.caption?.char_captions?.length || 0}`
            + ` ${inputSettings.endpoint && !isOfficialNaiEndpoint(inputSettings.endpoint) ? '中转' : '官网'}·${transport === 'st-proxy' ? '酒馆代理' : '直连'}` };
        settings.timing = timing;
        try {
            const result = await queue.run(settings.apiKey, () => {
                timing.startedAt = Date.now();
                return sendWithRetry(body, settings, deadline);
            }, settings);
            timing.doneAt = Date.now();
            if (result && typeof result === 'object') result.timing = timing;
            return allowed(settings) ? result : stale();
        } finally {
            clearTimeout(timer);
            inputSettings.signal?.removeEventListener('abort', abort);
        }
    }

    async function pause(ms, signal) {
        let abort, timer;
        const stopped = new Promise(resolve => {
            abort = () => resolve(false);
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
        });
        try {
            const waiting = deps.sleep ? Promise.resolve().then(() => sleep(ms))
                : new Promise(resolve => { timer = setTimeout(resolve, ms); });
            return await Promise.race([waiting.then(() => true), stopped]);
        } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    }

    async function send(body, settings) {
        const direct = settings.transport !== 'st-proxy';
        const target = resolveNaiEndpoint(settings.endpoint);
        const url = direct ? target : tavernProxyUrl(target);
        if (!allowed(settings)) return null;
        return fetchImpl(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/zip, application/octet-stream, application/json, image/png',
                    Authorization: `Bearer ${settings.apiKey}`,
                },
                body: JSON.stringify(toNaiWireBody(foldSoloCharForRelay(body, settings.endpoint))),
                mode: direct ? 'cors' : 'same-origin',
                credentials: direct ? 'omit' : 'same-origin',
                signal: settings.signal,
            });
    }

    // 生成与局部重绘共用的发送 / 重试 / 响应解析；错误文案不含 Key 与请求体。
    async function sendWithRetry(body, settings, deadline) {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            if (!allowed(settings)) return stale();
            let response;
            try {
                response = await send(body, settings);
                if (settings.timing) settings.timing.headersAt = Date.now();
            } catch (error) {
                if (!allowed(settings)) return stale();
                const aborted = error && error.name === 'AbortError';
                return {
                    ok: false,
                    reason: 'nai-transport-unknown',
                    error: aborted ? 'NAI 请求超时' : (settings.transport === 'st-proxy'
                        ? '经酒馆代理请求 NAI 失败：无法连接酒馆，请确认酒馆正在运行'
                        : '浏览器直连 NAI 失败（可能是 CORS 或网络不通），可在酒馆 config.yaml 中开启 enableCorsProxy，并把传输方式改为「酒馆 CORS 代理」或「自动」'),
                };
            }
            if (!allowed(settings) || !response) return stale();
            if (response.ok) {
                try {
                    const parsed = await parseImageResponse(response);
                    if (!allowed(settings)) return stale();
                    if (parsed && parsed.url) return { ok: true, dataUrl: parsed.url };
                } catch (error) {
                    if (!allowed(settings)) return stale();
                    const labels = {
                        'image-response-unrecognized': '响应不是可识别的图片或 ZIP',
                        'image-zip-truncated': 'ZIP 响应不完整',
                        'image-zip-unsupported': 'ZIP 格式不受支持',
                        'image-zip-directory-required': 'ZIP 数据描述符缺少中央目录',
                        'image-zip-deflate-unavailable': '当前浏览器不支持 ZIP deflate 解压',
                        'image-zip-deflate-failed': 'ZIP deflate 数据损坏或不完整',
                        'image-zip-method-unsupported': 'ZIP 压缩方式不受支持',
                        'image-zip-no-images': 'ZIP 响应中没有图片',
                    };
                    const reason = Object.hasOwn(labels, error?.reason) ? error.reason : 'nai-response-parse-failed';
                    return { ok: false, reason, status: response.status,
                        error: `NAI 图片响应解析失败：${labels[reason] || '响应读取失败'}；未自动补发` };
                }
                return { ok: false, reason: 'nai-response-no-image', status: response.status, error: 'NAI 返回中没有图片；未自动补发' };
            }
            if (RETRYABLE.has(response.status) && attempt < MAX_ATTEMPTS - 1) {
                const delay = retryDelayMs(response, attempt);
                if (delay > MAX_BACKOFF_MS || Date.now() + delay >= deadline)
                    return { ok: false, reason: 'nai-retry-budget-exhausted', status: response.status,
                        error: 'NAI 要求的等待时间超过本次重试上限，未提前补发' };
                try { await response.body?.cancel(); } catch { /* 已结束的错误响应不影响取消 */ }
                if (!await pause(delay, settings.signal) || !allowed(settings)) return stale();
                continue;
            }
            const text = await readErrorText(response);
            const proxyFailure = settings.transport === 'st-proxy' ? tavernProxyFailure(response.status, text) : '';
            if (proxyFailure === 'disabled') resetTavernProxyProbe();
            if (proxyFailure) return { ok: false, reason: proxyFailure === 'disabled' ? 'st-proxy-disabled' : 'nai-http-failed',
                status: response.status, error: proxyFailure === 'disabled' ? TAVERN_PROXY_DISABLED_HINT
                    : `经酒馆代理请求 NAI 失败（HTTP 500）：${TAVERN_BACKEND_UNREACHABLE_HINT}；未自动补发` };
            return { ok: false, reason: response.status === 429 ? 'nai-rate-limited' : 'nai-http-failed',
                error: describeStatus(response.status, safeDetail(text, settings.apiKey)), status: response.status };
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
        const snapshot = slot?.captionMode === 'final' ? promptSnapshotFromBody(body, settings.finalArtist
            !== undefined ? settings.finalArtist : globalArtist(settings)) : null;
        const sent = await dispatch(body, settings);
        if (sent && sent.ok) return { ...sent, seed: body.parameters.seed, prompt: promptFromNaiBody(body), ...(snapshot && { sentPrompt: snapshot }) };
        return sent;
    }

    // 所选模型存在 inpainting 版本时才支持局部重绘。
    function supportsEdit(naiSettings = {}) {
        return Boolean(resolveNaiInpaintModel(Object.hasOwn(naiSettings, 'model') ? naiSettings.model : NAI_DEFAULT_SETTINGS.model));
    }

    async function edit(request = {}, naiSettings = {}) {
        const settings = { ...NAI_DEFAULT_SETTINGS, ...naiSettings };
        const blocked = precheck(settings);
        if (blocked) return blocked;
        const built = buildNaiInpaintRequest(request, settings, random);
        if (!built.ok) return { ok: false, reason: built.reason, error: `局部重绘请求无效：${built.reason}` };
        const dimensions = { width: built.body.parameters.width, height: built.body.parameters.height, maxPixels: CG_PIXEL_CAP };
        for (const dataUrl of [request.sourceDataUrl, request.maskDataUrl]) {
            const checked = await validatePngEncoding(inspectPngDataUrl(dataUrl, dimensions));
            if (!checked.ok) return { ok: false, reason: checked.reason, error: `局部重绘图像无效：${checked.reason}` };
        }
        if (request.signal?.aborted || (typeof request.shouldStart === 'function' && !request.shouldStart()))
            return { ok: false, reason: 'request-stale', error: '任务已取消或目标失效，停止发送' };
        const snapshot = request.captionMode === 'final' ? promptSnapshotFromBody(built.body,
            settings.finalArtist !== undefined ? settings.finalArtist : globalArtist(settings)) : null;
        const sent = await dispatch(built.body, { ...settings,
            ...(request.signal && { signal: request.signal }),
            ...(request.shouldStart && { shouldStart: request.shouldStart }) });
        return sent?.ok ? { ...sent, seed: built.body.parameters.seed, ...(snapshot && { sentPrompt: snapshot }) } : sent;
    }

    return { generate, edit, supportsEdit };
}
