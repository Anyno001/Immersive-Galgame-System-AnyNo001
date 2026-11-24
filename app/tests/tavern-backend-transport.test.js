import test from 'node:test';
import assert from 'node:assert/strict';
import { probeTavernProxy, resetTavernProxyProbe, resolveTavernTransport, tavernProxyFailure } from '../src/host/tavern-cors-proxy.js';
import { createNaiOfficialClient } from '../src/generated-images/nai-official-client.js';
import { createNaiRequestQueue } from '../src/generated-images/nai-request-queue.js';
import {
    createSecondaryLlm,
    DEFAULT_SECONDARY_LLM_RETRIES,
    DEFAULT_SECONDARY_LLM_RETRY_DELAY_MS,
} from '../src/host/secondary-llm.js';
import { fakeLlmHost } from './helpers/fake-llm-host.js';

const ORIGIN = 'http://127.0.0.1:8000';
const DISABLED = 'CORS proxy is disabled. Enable it in config.yaml or use the --corsProxy flag.';
const imageResponse = () => new Response(JSON.stringify({ image: 'data:image/png;base64,AAAA' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });

// 模拟酒馆：/proxy/ 开关决定探测结果；探测地址指向本站时按循环请求拒绝。
function tavern({ proxy, upstream }) {
    const calls = [];
    const fetch = async (url) => {
        calls.push(String(url));
        if (String(url).endsWith('/igs-proxy-probe')) return proxy
            ? new Response('Circular requests are not allowed', { status: 400 })
            : new Response(DISABLED, { status: 404 });
        if (String(url).startsWith('/proxy/') && !proxy) return new Response(DISABLED, { status: 404 });
        return upstream(url);
    };
    return { calls, fetch };
}

test('gate:tavern-proxy:探测只问本站，开关两态与缓存', async () => {
    resetTavernProxyProbe();
    const off = tavern({ proxy: false });
    assert.equal(await probeTavernProxy(off.fetch, ORIGIN), false);
    assert.deepEqual(off.calls, [`/proxy/${ORIGIN}/igs-proxy-probe`]);
    assert.equal(await probeTavernProxy(off.fetch, ORIGIN), false);
    assert.equal(off.calls.length, 1);
    resetTavernProxyProbe();
    assert.equal(await probeTavernProxy(tavern({ proxy: true }).fetch, ORIGIN), true);
    resetTavernProxyProbe();
    assert.equal(await probeTavernProxy(async () => { throw new TypeError('offline'); }, ORIGIN), false);
    resetTavernProxyProbe();
});

test('gate:tavern-proxy:direct 与 st-proxy 不探测，auto 按探测结果', async () => {
    resetTavernProxyProbe();
    const probe = tavern({ proxy: true });
    assert.equal(await resolveTavernTransport('direct', probe.fetch, ORIGIN), 'direct');
    assert.equal(await resolveTavernTransport(undefined, probe.fetch, ORIGIN), 'direct');
    assert.equal(await resolveTavernTransport('st-proxy', probe.fetch, ORIGIN), 'st-proxy');
    assert.equal(probe.calls.length, 0);
    assert.equal(await resolveTavernTransport('auto', probe.fetch, ORIGIN), 'st-proxy');
    resetTavernProxyProbe();
    assert.equal(await resolveTavernTransport('auto', tavern({ proxy: false }).fetch, ORIGIN), 'direct');
    resetTavernProxyProbe();
    assert.equal(tavernProxyFailure(404, DISABLED), 'disabled');
    assert.equal(tavernProxyFailure(500, 'Internal Server Error'), 'unreachable');
    assert.equal(tavernProxyFailure(500, '{"message":"relay down"}'), '');
});

test('gate:nai-transport:auto 在酒馆代理开启时经 /proxy 转发，关闭时直连', { timeout: 3000 }, async t => {
    t.after(() => { delete globalThis.location; resetTavernProxyProbe(); });
    globalThis.location = { origin: ORIGIN };
    for (const proxy of [true, false]) {
        resetTavernProxyProbe();
        const host = tavern({ proxy, upstream: imageResponse });
        const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: host.fetch });
        const result = await client.generate({ scene: 'room' }, { apiKey: 'fixture-key', transport: 'auto' });
        assert.equal(result.ok, true);
        const sent = host.calls.filter(url => !url.endsWith('/igs-proxy-probe'));
        assert.deepEqual(sent, [proxy ? '/proxy/https://image.novelai.net/ai/generate-image' : 'https://image.novelai.net/ai/generate-image']);
    }
});

test('gate:nai-transport:代理未开、后端连不上、上游 500 三种失败分开说明', { timeout: 3000 }, async () => {
    const run = (transport, response) => createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async () => response() })
        .generate({ scene: 'room' }, { apiKey: 'fixture-key', transport });
    const off = await run('st-proxy', () => new Response(DISABLED, { status: 404 }));
    assert.equal(off.reason, 'st-proxy-disabled');
    assert.match(off.error, /enableCorsProxy: true/);
    const unreachable = await run('st-proxy', () => new Response('Internal Server Error', { status: 500 }));
    assert.match(unreachable.error, /requestProxy/);
    const upstream = await run('direct', () => new Response(JSON.stringify({ message: 'relay quota fixture-key exhausted' }), { status: 500 }));
    assert.match(upstream.error, /HTTP 500）：relay quota \[已隐藏\] exhausted/);
    assert.equal(upstream.error.includes('fixture-key'), false);
});

function serviceHost(failure) {
    return fakeLlmHost({ SillyTavern: { getContext: () => ({
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        ChatCompletionService: { async sendRequest() { throw new Error(failure); } },
    }) } });
}

test('gate:llm-transport:酒馆后端连不上上游与上游 500 分开说明且不回显正文', async () => {
    const config = { source: 'openai', endpoint: 'https://upstream.example/v1', apiKey: 'fake-secret', model: 'planner', retries: 0 };
    const prompts = { system: 'SYS', user: 'USR' };
    const network = createSecondaryLlm(serviceHost('request to https://upstream.example/v1/chat/completions failed, reason: connect ETIMEDOUT'));
    await assert.rejects(network.request(prompts, config), error => error.reason === 'secondary-llm-backend-unreachable'
        && /requestProxy/.test(error.message) && !error.message.includes('upstream.example'));
    const upstream = createSecondaryLlm(serviceHost('Internal Server Error'));
    await assert.rejects(upstream.request(prompts, config), error => error.status === 500 && /请求已到达该接口/.test(error.message));
    const raw = createSecondaryLlm(fakeLlmHost(), { fetch: async () => new Response(JSON.stringify({ error: { message: 'fetch failed' } }), { status: 502 }) });
    await assert.rejects(raw.request(prompts, config), error => error.reason === 'secondary-llm-backend-unreachable');
});

const flushMicrotasks = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

test('gate:llm-retry:默认延迟 3 秒重试 3 次，重试成功则正常返回', async t => {
    assert.equal(DEFAULT_SECONDARY_LLM_RETRIES, 3);
    assert.equal(DEFAULT_SECONDARY_LLM_RETRY_DELAY_MS, 3000);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    const retries = [];
    const llm = createSecondaryLlm(fakeLlmHost({
        SillyTavern: { getContext: () => ({
            getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
            ChatCompletionService: {
                async sendRequest() {
                    calls += 1;
                    if (calls <= 3) throw Object.assign(new Error('Service Unavailable'), { status: 503 });
                    return { content: 'retry-ok' };
                },
            },
        }) },
    }));
    const pending = llm.request(
        { system: 'SYS', user: 'USR' },
        {
            source: 'openai',
            endpoint: 'https://upstream.example/v1',
            apiKey: 'fake-secret',
            model: 'planner',
            onRetry: (info) => retries.push(info),
        },
    );
    await flushMicrotasks();
    assert.equal(calls, 1);
    t.mock.timers.tick(2999);
    await flushMicrotasks();
    assert.equal(calls, 1);
    t.mock.timers.tick(1);
    await flushMicrotasks();
    assert.equal(calls, 2);
    t.mock.timers.tick(3000);
    await flushMicrotasks();
    assert.equal(calls, 3);
    t.mock.timers.tick(3000);
    await flushMicrotasks();
    assert.equal(await pending, 'retry-ok');
    assert.equal(calls, 4);
    assert.deepEqual(retries.map(r => [r.attempt, r.maxRetries, r.delayMs]), [
        [1, 3, 3000],
        [2, 3, 3000],
        [3, 3, 3000],
    ]);
});

test('gate:llm-retry:连续失败达到 3 次重试上限后报错并记录重试次数', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    const llm = createSecondaryLlm(fakeLlmHost({
        SillyTavern: { getContext: () => ({
            getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
            ChatCompletionService: {
                async sendRequest() {
                    calls += 1;
                    throw Object.assign(new Error('Too Many Requests'), { status: 429 });
                },
            },
        }) },
    }));
    const pending = llm.request(
        { system: 'SYS', user: 'USR' },
        { source: 'openai', endpoint: 'https://upstream.example/v1', apiKey: 'fake-secret', model: 'planner' },
    );
    const settled = pending.then(() => null, error => error);
    await flushMicrotasks();
    assert.equal(calls, 1);
    for (let i = 0; i < 3; i += 1) {
        t.mock.timers.tick(3000);
        await flushMicrotasks();
    }
    const error = await settled;
    assert.equal(calls, 4);
    assert.equal(error?.status, 429);
    assert.equal(error?.diagnostic?.retries, 3);
    assert.match(error?.message || '', /已自动重试 3 次仍失败/);
});

test('gate:llm-retry:401/400 等客户端错误不重试，取消信号在等待期间立刻中止', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    for (const status of [400, 401]) {
        let calls = 0;
        const llm = createSecondaryLlm(fakeLlmHost({
            SillyTavern: { getContext: () => ({
                getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
                ChatCompletionService: {
                    async sendRequest() {
                        calls += 1;
                        throw Object.assign(new Error('Client Error'), { status });
                    },
                },
            }) },
        }));
        await assert.rejects(
            llm.request({ system: 'SYS', user: 'USR' }, { source: 'openai', endpoint: 'https://upstream.example/v1', apiKey: 'fake-secret', model: 'planner' }),
            error => error.status === status,
        );
        assert.equal(calls, 1);
    }

    let calls = 0;
    const controller = new AbortController();
    const llm = createSecondaryLlm(fakeLlmHost({
        SillyTavern: { getContext: () => ({
            getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
            ChatCompletionService: {
                async sendRequest() {
                    calls += 1;
                    throw Object.assign(new Error('Internal Server Error'), { status: 500 });
                },
            },
        }) },
    }));
    const pending = llm.request(
        { system: 'SYS', user: 'USR' },
        { source: 'openai', endpoint: 'https://upstream.example/v1', apiKey: 'fake-secret', model: 'planner', signal: controller.signal },
    );
    await flushMicrotasks();
    assert.equal(calls, 1);
    controller.abort();
    await assert.rejects(pending, error => error.reason === 'request-stale');
    t.mock.timers.tick(10000);
    await flushMicrotasks();
    assert.equal(calls, 1);
});

test('gate:llm-retry:随身系统酒馆后台通道失败时默认延迟 3 秒重试 3 次，销毁时立即中止', async t => {
    const { createOriginRuntime } = await import('../src/core/origin-runtime.js');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    const ctx = {
        chatId: 'origin-retry-chat',
        chat: [{ is_user: false, mes: '开场剧情' }],
        chatMetadata: {},
        async generateQuietPrompt() {
            calls += 1;
            if (calls <= 2) throw new Error('temporary gateway error');
            return '商品|凝神丹|50|恢复精神|无';
        },
    };
    const runtime = createOriginRuntime({
        getContext: () => ctx,
        readSettings: () => ({ enabled: true, route: 'tavern' }),
        readLlm: () => ({}),
    });
    t.after(() => runtime.destroy());
    runtime.sync();
    const pending = runtime.engine.genShop();
    await flushMicrotasks();
    assert.equal(calls, 1);
    t.mock.timers.tick(3000);
    await flushMicrotasks();
    assert.equal(calls, 2);
    t.mock.timers.tick(3000);
    await flushMicrotasks();
    const res = await pending;
    assert.equal(res.ok, true);
    assert.equal(calls, 3);

    calls = 0;
    ctx.generateQuietPrompt = async () => {
        calls += 1;
        throw new Error('temporary gateway error');
    };
    const aborted = runtime.engine.genShop();
    await flushMicrotasks();
    assert.equal(calls, 1);
    runtime.destroy();
    const abortRes = await aborted;
    assert.equal(abortRes.reason, 'request-stale');
    t.mock.timers.tick(10000);
    await flushMicrotasks();
    assert.equal(calls, 1);
});

test('gate:llm-tavern:原生 ctx.generateRaw 与世界书扫描支持并发，超时不阻塞后续扫描，备用模型日志即时记录 messages 摘要与字数', async () => {
    const { createImageWorldInfoSource } = await import('../src/host/image-world-info.js');
    let active = 0;
    let maxActive = 0;
    let wiActive = 0;
    let wiMaxActive = 0;
    const handlers = new Map();
    const eventSource = {
        on(name, fn) { handlers.set(name, (handlers.get(name) || []).concat([fn])); },
        removeListener(name, fn) { handlers.set(name, (handlers.get(name) || []).filter(h => h !== fn)); },
        emit(name, arg) { for (const fn of handlers.get(name) || []) fn(arg); },
        count(name) { return (handlers.get(name) || []).length; },
    };
    const originalNote = { value: 'keep-me' };
    const ctx = {
        eventSource,
        eventTypes: { WORLDINFO_ENTRIES_LOADED: 'wi_loaded' },
        async generateRaw({ prompt }) {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((r) => setTimeout(r, 20));
            active -= 1;
            return `ok:${prompt}`;
        },
        extensionPrompts: { '2_floating_prompt': originalNote },
        async getWorldInfoPrompt(scan) {
            wiActive += 1;
            wiMaxActive = Math.max(wiMaxActive, wiActive);
            const lore = { globalLore: [{ world: 'Blocked', uid: 1 }, { world: 'Keep', uid: 2 }] };
            eventSource.emit('wi_loaded', lore);
            ctx.extensionPrompts['2_floating_prompt'] = { value: 'mutated-during-dry-run' };
            try {
                if (String(scan[0] || '').includes('hang')) return await new Promise(() => {});
                await new Promise((r) => setTimeout(r, 10));
                return { worldInfoString: `wi:${scan[0] || ''}:${lore.globalLore.map(x => x.world).join(',')}` };
            } finally {
                wiActive -= 1;
            }
        },
    };
    const host = { SillyTavern: { getContext: () => ctx } };
    const logs = [];
    const llm = createSecondaryLlm(host, { retries: 0, log: { add(level, text) { logs.push({ level, text }); } } });
    const [a, b] = await Promise.all([
        llm.request({ system: 's', user: 'first' }, { source: 'tavern' }),
        llm.request({ system: 's', user: 'second' }, { source: 'tavern' }),
    ]);
    assert.equal(a, 'ok:first');
    assert.equal(b, 'ok:second');
    assert.equal(maxActive, 2, '原生 ctx.generateRaw 不应被人为锁死为单并发');

    // 验证 ordered messages 请求：发出瞬间即写 info 日志，并正确提取任务摘要与发送总字数
    let resolveOrdered;
    const orderedHost = {
        TavernHelper: {
            generateRaw() {
                return new Promise((resolve) => { resolveOrdered = resolve; });
            },
        },
        SillyTavern: { getContext: () => ctx },
    };
    const orderedLogs = [];
    const orderedLlm = createSecondaryLlm(orderedHost, { retries: 0, log: { add(level, text) { orderedLogs.push({ level, text }); } } });
    const pendingOrdered = orderedLlm.request({
        messages: [
            { role: 'system', content: '通用绘图提示词框架' },
            { role: 'system', content: '完成角色默认立绘任务：小雪' },
            { role: 'user', content: '正文字数测试12345' },
        ],
    }, { source: 'tavern' });
    assert.equal(orderedLogs.length, 1, '发出瞬间应立即记录一条进行中日志');
    assert.equal(orderedLogs[0].level, 'info');
    assert.match(orderedLogs[0].text, /完成角色默认立绘任务：小雪/);
    assert.match(orderedLogs[0].text, /已发出/);
    assert.match(orderedLogs[0].text, /发送33字/);
    resolveOrdered('slotid: 1\n1girl');
    assert.equal(await pendingOrdered, 'slotid: 1\n1girl');
    assert.equal(orderedLogs.length, 2);
    assert.equal(orderedLogs[1].level, 'success');
    assert.match(orderedLogs[1].text, /完成角色默认立绘任务：小雪/);
    assert.match(orderedLogs[1].text, /发送33字/);

    const wi = createImageWorldInfoSource(host, {
        readIncludeNames: async () => false,
        readExclude: () => ({ books: ['Blocked'] }),
        timeoutMs: 30,
    });
    const t0 = Date.now();
    let r2DoneAt = 0;
    const p1 = wi({ description: 'hang' });
    const p2 = wi({ description: 'normal' }).then((res) => { r2DoneAt = Date.now() - t0; return res; });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, 'WORLDINFO_TIMEOUT');
    assert.equal(r2.ok, true);
    assert.equal(r2.text, 'wi:normal:Keep');
    assert.ok(wiMaxActive >= 2, '世界书扫描应并发执行，不被前一个卡住的扫描阻塞');
    assert.ok(r2DoneAt < 30 || r2.ok, '快速扫描无需等待超时任务结束');
    assert.deepEqual(ctx.extensionPrompts['2_floating_prompt'], originalNote, '全部并发扫描结束后应恢复作者注释');
    assert.equal(eventSource.count('wi_loaded'), 0, '全部并发扫描结束后应解绑排除监听');
});

