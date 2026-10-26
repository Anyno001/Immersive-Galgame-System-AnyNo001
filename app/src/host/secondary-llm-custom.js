import { secondaryLlmBackendError, secondaryLlmText } from './secondary-llm-result.js';

// 酒馆按 YAML 解析这三项；JSON 是有效 YAML。显式写 Authorization，空 Key 也不借用主连接的密钥。
export function customRequestExtras(settings) {
    const key = String(settings.apiKey || '').trim();
    const auth = { Authorization: key ? `Bearer ${key}` : '' };
    const headers = String(settings.includeHeaders || '').trim();
    let includeHeaders = JSON.stringify(auth);
    if (headers) {
        let parsed = null;
        try { parsed = JSON.parse(headers); } catch { /* 按 YAML 透传 */ }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) includeHeaders = JSON.stringify({ ...auth, ...parsed });
        else includeHeaders = /^\s*["']?Authorization["']?\s*:/im.test(headers) ? headers : `Authorization: ${JSON.stringify(auth.Authorization)}\n${headers}`;
    }
    const extras = { custom_include_headers: includeHeaders };
    const body = String(settings.includeBody || '').trim();
    const exclude = String(settings.excludeBody || '').trim();
    if (body) extras.custom_include_body = body;
    if (exclude) extras.custom_exclude_body = exclude;
    return extras;
}

export function customLlmPayload(messages, settings, completionsUrl) {
    return { stream: false, messages: messages.map(message => ({ ...message })),
        model: settings.model, chat_completion_source: 'custom',
        custom_url: completionsUrl.replace(/\/chat\/completions$/i, ''), use_sysprompt: true,
        ...customRequestExtras(settings) };
}

// 与 DBG 使用同一宿主通道；不读写酒馆主模型设置或 DBG 配置。
export async function requestCustomLlm(Service, messages, settings, completionsUrl) {
    const payload = customLlmPayload(messages, settings, completionsUrl);
    try {
        const data = typeof Service.createRequestData === 'function'
            ? Service.createRequestData(payload) : { ...payload };
        // 锁住本次私有配置与消息，避免宿主默认值替换请求身份。
        Object.assign(data, payload);
        const result = await Service.sendRequest(data, true, settings.signal);
        return secondaryLlmText(result?.content);
    } catch (cause) {
        if (settings.signal?.aborted || cause?.name === 'AbortError') {
            throw Object.assign(new Error('副 LLM 任务已取消；未继续绘图'), { reason: 'request-stale' });
        }
        throw secondaryLlmBackendError(cause?.message, Number(cause?.status ?? cause?.statusCode));
    }
}
