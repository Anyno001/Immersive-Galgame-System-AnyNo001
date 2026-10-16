import { getTavernHelper, getSillyTavernContext } from './tavern-helper-adapter.js';
import { runBackgroundGeneration } from './background-generation.js';
import { secondaryLlmMessages } from './secondary-llm-messages.js';
import { requestCustomLlm } from './secondary-llm-custom.js';
import { SecondaryLlmError, secondaryLlmHttpError, secondaryLlmText } from './secondary-llm-result.js';

function chatCompletionsUrl(endpoint) {
    const base = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!base) return '';
    if (/\/chat\/completions$/i.test(base)) return base;
    return /\/v\d+$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

function withTimeout(promise, ms) {
    let timer = null;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('副 LLM 请求超时')), ms); }),
    ]).finally(() => clearTimeout(timer));
}

export function readSseContent(body) {
    let text = '';
    for (const line of String(body || '').split(/\r?\n/)) {
        const payload = line.replace(/^\s*data:\s*/, '');
        if (payload === line || !payload || payload === '[DONE]') continue;
        try {
            const choice = JSON.parse(payload).choices?.[0];
            text += String(choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? '');
        } catch (error) { /* 心跳或非 JSON 行 */ }
    }
    return text;
}

function modelsUrl(endpoint) {
    const completions = chatCompletionsUrl(endpoint);
    return completions ? completions.replace(/\/chat\/completions$/i, '/models') : '';
}

export function createSecondaryLlm(globalObject = globalThis, deps = {}) {
    const fetchImpl = deps.fetch || (typeof globalObject.fetch === 'function' ? globalObject.fetch.bind(globalObject) : null);

    async function viaTavern(messages) {
        const helper = getTavernHelper(globalObject);
        if (helper && typeof helper.generateRaw === 'function') {
            // should_silence：后台请求不显示停止按钮、不广播生成事件，避免被当成正文流式。
            return String(await helper.generateRaw({
                should_stream: false,
                should_silence: true,
                ordered_prompts: messages,
            }) || '');
        }
        const ctx = getSillyTavernContext(globalObject);
        if (ctx && typeof ctx.generateRaw === 'function') {
            if (messages.length !== 2 || messages[0].role !== 'system' || messages[1].role !== 'user') {
                const error = new Error('当前酒馆接口不支持有序多角色提示词，请启用酒馆助手或改用独立 API');
                error.reason = 'ordered-messages-unsupported';
                throw error;
            }
            return String(await ctx.generateRaw({ systemPrompt: messages[0].content, prompt: messages[1].content }) || '');
        }
        throw new Error('当前酒馆不支持 generateRaw，请在设置中改用独立 API');
    }

    async function viaOpenAi(messages, llm) {
        const url = chatCompletionsUrl(llm.endpoint);
        if (!url) throw new Error('请先填写副 LLM 地址');
        const Service = getSillyTavernContext(globalObject)?.ChatCompletionService;
        if (typeof Service?.sendRequest === 'function') {
            return requestCustomLlm(Service, messages, llm, url);
        }
        if (!fetchImpl) throw new Error('当前环境无法发起网络请求');
        const headers = { 'Content-Type': 'application/json' };
        if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;
        let response;
        try {
            response = await fetchImpl(url, {
                method: 'POST', headers,
                body: JSON.stringify({
                    model: llm.model, stream: false,
                    messages,
                }),
                ...(llm.signal && { signal: llm.signal }),
            });
        } catch (error) {
            if (llm.signal?.aborted) throw Object.assign(new Error('副 LLM 任务已取消；上游可能仍在执行'), { reason: 'request-stale' });
            throw secondaryLlmHttpError(null, 'direct');
        }
        if (!response.ok) {
            let data;
            try { data = JSON.parse(await response.text()); } catch { /* 只提取白名单字段 */ }
            throw secondaryLlmHttpError(response.status, 'direct', data);
        }
        let data;
        if (typeof response.text === 'function') {
            const body = String(await response.text());
            // 部分反代无视 stream:false 仍按 SSE 返回，这里兼容拼接增量内容。
            if (/^\s*data:/.test(body)) return secondaryLlmText(readSseContent(body));
            try { data = JSON.parse(body); } catch (error) { throw new SecondaryLlmError('secondary-llm-response-invalid', '副 LLM 响应不是有效 JSON；未继续绘图', { transport: 'direct' }); }
        } else {
            data = await response.json();
        }
        return secondaryLlmText(data?.choices?.[0]?.message?.content);
    }

    async function fetchModels(llm = {}) {
        const url = modelsUrl(llm.endpoint);
        if (!url) throw new Error('请先填写副 LLM 地址');
        if (!fetchImpl) throw new Error('当前环境无法发起网络请求');
        const ctx = getSillyTavernContext(globalObject);
        const custom = typeof ctx?.ChatCompletionService?.sendRequest === 'function'
            && typeof ctx?.getRequestHeaders === 'function';
        const transport = custom ? 'st-backend' : 'direct';
        const payload = custom ? { chat_completion_source: 'custom',
            custom_url: chatCompletionsUrl(llm.endpoint).replace(/\/chat\/completions$/i, ''),
            ...(llm.apiKey && { custom_include_headers: `Authorization: ${JSON.stringify(`Bearer ${llm.apiKey}`)}` }) } : null;
        const headers = custom ? { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' }
            : llm.apiKey ? { Authorization: `Bearer ${llm.apiKey}` } : {};
        let response;
        try {
            response = await withTimeout(fetchImpl(custom ? '/api/backends/chat-completions/status' : url,
                { method: custom ? 'POST' : 'GET', headers,
                    ...(custom && { body: JSON.stringify(payload), cache: 'no-cache' }) }), 30000);
        } catch (error) {
            throw secondaryLlmHttpError(null, transport);
        }
        if (!response.ok) throw secondaryLlmHttpError(response.status, transport);
        let data;
        try { data = await response.json(); }
        catch { throw new SecondaryLlmError('secondary-llm-response-invalid', '副 LLM 模型列表不是有效 JSON', { transport }); }
        if (data?.error === true) throw secondaryLlmHttpError(null, transport);
        const entries = Array.isArray(data && data.data) ? data.data : data && data.models;
        const models = [...new Set((Array.isArray(entries) ? entries : [])
            .map((item) => typeof item === 'string' ? item : item && (item.id || item.name))
            .filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))];
        if (!models.length) throw new Error('副 LLM 接口未返回可用模型');
        return { ok: true, models, message: `已拉取 ${models.length} 个副 LLM 模型` };
    }

    return {
        fetchModels,
        async request(request, llm = {}) {
            const timeoutMs = Number(llm.timeoutMs) || 90000;
            const messages = secondaryLlmMessages(request, llm);
            const controller = new AbortController();
            const cancelled = () => Object.assign(new Error('副 LLM 任务已取消；上游可能仍在执行'), { reason: 'request-stale' });
            let rejectStop, timer;
            const stopped = new Promise((_, reject) => { rejectStop = reject; });
            const abort = () => { controller.abort(); rejectStop(cancelled()); };
            llm.signal?.addEventListener('abort', abort, { once: true });
            try {
                if (llm.signal?.aborted) throw cancelled();
                timer = setTimeout(() => {
                    controller.abort();
                    rejectStop(Object.assign(new Error('副 LLM 请求超时；上游可能仍在执行'), { reason: 'request-timeout' }));
                }, timeoutMs);
                const job = llm.source === 'openai'
                    ? viaOpenAi(messages, { ...llm, signal: controller.signal })
                    : runBackgroundGeneration(() => {
                        if (controller.signal.aborted) throw cancelled();
                        return viaTavern(messages);
                    });
                const result = await Promise.race([job, stopped]);
                if (controller.signal.aborted) throw cancelled();
                return result;
            } finally { clearTimeout(timer); llm.signal?.removeEventListener('abort', abort); }
        },
    };
}
