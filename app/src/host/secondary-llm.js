import { getTavernHelper, getSillyTavernContext } from './tavern-helper-adapter.js';

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

export function createSecondaryLlm(globalObject = globalThis, deps = {}) {
    const fetchImpl = deps.fetch || (typeof globalObject.fetch === 'function' ? globalObject.fetch.bind(globalObject) : null);

    async function viaTavern(system, user) {
        const helper = getTavernHelper(globalObject);
        if (helper && typeof helper.generateRaw === 'function') {
            return String(await helper.generateRaw({
                should_stream: false,
                ordered_prompts: [{ role: 'system', content: system }, { role: 'user', content: user }],
            }) || '');
        }
        const ctx = getSillyTavernContext(globalObject);
        if (ctx && typeof ctx.generateRaw === 'function') {
            return String(await ctx.generateRaw({ systemPrompt: system, prompt: user }) || '');
        }
        throw new Error('当前酒馆不支持 generateRaw，请在设置中改用独立 API');
    }

    async function viaOpenAi(system, user, llm) {
        const url = chatCompletionsUrl(llm.endpoint);
        if (!url) throw new Error('请先填写副 LLM 地址');
        if (!fetchImpl) throw new Error('当前环境无法发起网络请求');
        const headers = { 'Content-Type': 'application/json' };
        if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;
        let response;
        try {
            response = await fetchImpl(url, {
                method: 'POST', headers,
                body: JSON.stringify({
                    model: llm.model, stream: false, temperature: 0.7,
                    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                }),
            });
        } catch (error) {
            throw new Error(`无法连接 ${url}（网络不通或该地址不允许浏览器跨域 CORS）`);
        }
        if (!response.ok) {
            let body = '';
            try { body = String(await response.text()).replace(/\s+/g, ' ').slice(0, 160); } catch (error) { body = ''; }
            throw new Error(`HTTP ${response.status}（${url}）${body ? `：${body}` : ''}`);
        }
        const data = await response.json();
        return String(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '');
    }

    return {
        async request({ system, user }, llm = {}) {
            const timeoutMs = Number(llm.timeoutMs) || 90000;
            const job = llm.source === 'openai' ? viaOpenAi(system, user, llm) : viaTavern(system, user);
            return withTimeout(job, timeoutMs);
        },
    };
}
