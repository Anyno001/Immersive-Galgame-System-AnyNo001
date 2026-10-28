import { getTavernHelper, getSillyTavernContext } from './tavern-helper-adapter.js';
import { runBackgroundGeneration } from './background-generation.js';
import { secondaryLlmMessages } from './secondary-llm-messages.js';
import { customRequestExtras, requestCustomLlm } from './secondary-llm-custom.js';
import { secondaryLlmBackendError, secondaryLlmHttpError, secondaryLlmText } from './secondary-llm-result.js';

function apiBaseUrl(endpoint) {
    const base = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('请先填写副 LLM 地址');
    let parsed;
    try { parsed = new URL(base); } catch { throw new Error('副 LLM 地址无效，请填写 HTTP/HTTPS 接口地址'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash) {
        throw new Error('副 LLM 地址无效，请填写不含查询参数的 HTTP/HTTPS 接口地址');
    }
    const root = base.replace(/\/(?:chat\/completions|models)$/i, '');
    return /\/v\d+$/i.test(root) ? root : `${root}/v1`;
}

function withTimeout(promise, ms, onTimeout = () => {}) {
    let timer = null;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => { reject(new Error('副 LLM 请求超时')); onTimeout(); }, ms); }),
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

function customConnection(llm) {
    return {
        chat_completion_source: 'custom',
        custom_url: apiBaseUrl(llm.endpoint),
        ...customRequestExtras(llm),
    };
}

function safeDetail(value, apiKey) {
    let text = String(value || '');
    const key = String(apiKey || '').trim();
    if (key) text = text.split(key).join('[已隐藏]');
    return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function createSecondaryLlm(globalObject = globalThis, deps = {}) {
    const fetchImpl = deps.fetch || (typeof globalObject.fetch === 'function' ? globalObject.fetch.bind(globalObject) : null);
    const createAbort = () => new (globalObject.AbortController || globalThis.AbortController)();

    async function postToTavern(route, body, llm, signal, label) {
        if (!fetchImpl) throw new Error('当前环境无法发起网络请求');
        const context = getSillyTavernContext(globalObject);
        if (!context || typeof context.getRequestHeaders !== 'function') {
            throw new Error('无法获取酒馆请求头，请确认脚本在酒馆页面内加载');
        }
        let response;
        try {
            response = await fetchImpl(`/api/backends/chat-completions/${route}`, {
                method: 'POST', credentials: 'same-origin', cache: 'no-cache', signal,
                headers: { ...context.getRequestHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch {
            if (route === 'generate') throw secondaryLlmHttpError(null, 'st-backend');
            throw new Error(`${label}：无法连接酒馆后端，请检查酒馆连接`);
        }
        let text = '', data = null;
        if (typeof response.text === 'function') {
            text = String(await response.text());
            try { data = JSON.parse(text); } catch { /* 下方兼容 SSE 或报告无效响应 */ }
        } else data = await response.json();
        if (!response.ok || data?.error) {
            if (route === 'generate') {
                const rejected = secondaryLlmBackendError(data?.error?.message, response.ok ? null : response.status, data);
                if (response.ok) rejected.diagnostic.rejected = true;
                throw rejected;
            }
            const detail = safeDetail(data?.error?.message || (typeof data?.error === 'string' ? data.error : '')
                || data?.message || (!response.ok ? text : '酒馆未返回可用结果，请核对接口地址和密钥'), llm.apiKey);
            throw new Error(`${label}${!response.ok ? `（HTTP ${response.status}）` : ''}${detail ? `：${detail}` : ''}`);
        }
        if (data == null) {
            if (route === 'generate' && /^\s*data:/.test(text)) return { choices: [{ message: { content: readSseContent(text) } }] };
            throw new Error(`${label}：返回的不是 JSON${text ? `：${safeDetail(text, llm.apiKey)}` : ''}`);
        }
        return data;
    }

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
        const base = apiBaseUrl(llm.endpoint);
        const Service = getSillyTavernContext(globalObject)?.ChatCompletionService;
        if (typeof Service?.sendRequest === 'function') return requestCustomLlm(Service, messages, llm, `${base}/chat/completions`);
        const data = await postToTavern('generate', { ...customConnection(llm),
            model: llm.model, stream: false, use_sysprompt: true, messages,
        }, llm, llm.signal, '副 LLM 请求失败');
        return secondaryLlmText(data?.choices?.[0]?.message?.content);
    }

    async function fetchModels(llm = {}) {
        const controller = createAbort();
        return withTimeout((async () => {
            const data = await postToTavern('status', customConnection(llm), llm, controller.signal, '副 LLM 模型拉取失败');
            const entries = Array.isArray(data && data.data) ? data.data : data && data.models;
            const models = [...new Set((Array.isArray(entries) ? entries : [])
                .map((item) => typeof item === 'string' ? item : item && (item.id || item.name))
                .filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))];
            if (!models.length) throw new Error('副 LLM 接口未返回可用模型');
            return { ok: true, models, message: `已拉取 ${models.length} 个副 LLM 模型` };
        })(), 30000, () => controller.abort());
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
                    try { llm.onSlow?.(); } catch { /* 原请求继续接收同一回复。 */ }
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
