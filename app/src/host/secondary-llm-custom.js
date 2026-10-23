import { secondaryLlmBackendError, secondaryLlmText } from './secondary-llm-result.js';

export function customLlmPayload(messages, settings, completionsUrl) {
    const payload = { stream: false, messages: messages.map(message => ({ ...message })),
        model: settings.model, chat_completion_source: 'custom',
        custom_url: completionsUrl.replace(/\/chat\/completions$/i, ''), use_sysprompt: true };
    payload.custom_include_headers = JSON.stringify({ Authorization: settings.apiKey ? `Bearer ${settings.apiKey}` : '' });
    return payload;
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
