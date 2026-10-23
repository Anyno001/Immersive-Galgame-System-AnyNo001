import { TAVERN_BACKEND_UNREACHABLE_HINT } from './tavern-cors-proxy.js';

// 副 LLM 只公开受控诊断，不携带上游正文、请求地址或凭据。
export class SecondaryLlmError extends Error {
    constructor(reason, message, diagnostic = {}) {
        super(message);
        this.reason = reason;
        this.diagnostic = { stage: 'secondary-llm', ...diagnostic };
        if (Number.isInteger(diagnostic.status)) this.status = diagnostic.status;
    }
}

export function secondaryLlmHttpError(status, transport, data) {
    const fields = new Set(['model', 'messages', 'role', 'content', 'stream', 'temperature',
        'max_tokens', 'top_p', 'top_k', 'response_format', 'reasoning_effort']);
    const field = typeof data?.error?.param === 'string' && fields.has(data.error.param)
        ? data.error.param : Array.isArray(data?.detail)
            ? data.detail.flatMap(item => Array.isArray(item?.loc) ? item.loc : []).find(item => fields.has(item)) : undefined;
    const validStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
    return new SecondaryLlmError(validStatus ? 'secondary-llm-http-failed' : 'secondary-llm-transport-failed',
        validStatus >= 500 ? `副 LLM 接口返回服务端错误（HTTP ${validStatus}），请求已到达该接口；未自动补发`
            : validStatus ? `副 LLM 请求被拒绝（HTTP ${validStatus}${field ? `；字段 ${field}` : ''}）；未自动补发`
            : transport === 'direct'
                ? '副 LLM 直连请求失败（网络不通或地址不允许浏览器跨域 CORS）；发送状态未知，未自动补发'
                : '副 LLM 请求失败；发送状态未知，未自动补发',
        { transport, ...(validStatus && { status: validStatus }), ...(field && { field }) });
}

const UNREACHABLE = /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|E(?:HOST|NET)UNREACH|socket hang up|fetch failed|network socket|connection refused|request to \S+ failed/i;
const STATUS_TEXT = Object.freeze({ 'bad request': 400, unauthorized: 401, 'payment required': 402, forbidden: 403,
    'not found': 404, 'too many requests': 429, 'internal server error': 500, 'bad gateway': 502,
    'service unavailable': 503, 'gateway timeout': 504 });

// 酒馆后端转发的失败：酒馆自身回 502 表示它没连上上游；上游报错时酒馆回 200 并带状态文字。只归类，不回显正文。
export function secondaryLlmBackendError(message, tavernStatus, data) {
    const text = String(message || '').trim();
    if (tavernStatus === 502 || UNREACHABLE.test(text)) return new SecondaryLlmError('secondary-llm-backend-unreachable',
        `副 LLM 请求失败：${TAVERN_BACKEND_UNREACHABLE_HINT}；发送状态未知，未自动补发`, { transport: 'st-backend' });
    const explicit = Number(tavernStatus);
    const match = text.match(/(?:HTTP|status(?:\s+code)?)\s*[:=(]?\s*([45]\d{2})\b/i);
    const code = explicit >= 400 && explicit <= 599 ? explicit : STATUS_TEXT[text.toLowerCase()] || Number(match?.[1]);
    return secondaryLlmHttpError(code, 'st-backend', data);
}

export function secondaryLlmFailure(error) {
    if (error instanceof SecondaryLlmError) return { ok: false, reason: error.reason, error: error.message,
        diagnostic: { ...error.diagnostic }, ...(error.status && { status: error.status }) };
    if (['request-stale', 'request-timeout'].includes(error?.reason)) return { ok: false,
        reason: error.reason, stopGeneration: true, error: error.reason === 'request-stale'
            ? '副 LLM 任务已取消或目标失效；未继续绘图' : '副 LLM 请求超时；上游可能仍在执行，未继续绘图' };
    return { ok: false, reason: 'template-write-failed', error: '副 LLM 动态写词失败，未增加请求或发送图片' };
}

export function secondaryLlmText(content) {
    let text = typeof content === 'string' ? content : content == null ? '' : JSON.stringify(content);
    // 与 DBG 一致：只剥离前置思考块；未闭合思考不作为正式写词结果。
    while (/^\s*<think>/i.test(text)) {
        const end = text.toLowerCase().indexOf('</think>');
        if (end < 0) return '';
        text = text.slice(end + 8).trimStart();
    }
    return text;
}
