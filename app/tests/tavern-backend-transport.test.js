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

test('gate:llm-tavern:原生 ctx.generateRaw 并发调用串行排队避免互相顶掉，世界书超时不死锁后续扫描', async () => {
    const { createImageWorldInfoSource } = await import('../src/host/image-world-info.js');
    let active = 0;
    let maxActive = 0;
    const order = [];
    const ctx = {
        async generateRaw({ prompt }) {
            active += 1;
            maxActive = Math.max(maxActive, active);
            order.push(`start:${prompt}`);
            await new Promise((r) => setTimeout(r, 20));
            order.push(`end:${prompt}`);
            active -= 1;
            return `ok:${prompt}`;
        },
        extensionPrompts: {},
        async getWorldInfoPrompt(scan) {
            if (String(scan[0] || '').includes('hang')) return new Promise(() => {});
            return { worldInfoString: `wi:${scan[0] || ''}` };
        },
    };
    const host = { SillyTavern: { getContext: () => ctx } };
    const llm = createSecondaryLlm(host, { retries: 0 });
    const [a, b] = await Promise.all([
        llm.request({ system: 's', user: 'first' }, { source: 'tavern' }),
        llm.request({ system: 's', user: 'second' }, { source: 'tavern' }),
    ]);
    assert.equal(a, 'ok:first');
    assert.equal(b, 'ok:second');
    assert.equal(maxActive, 1, '原生 ctx.generateRaw 回退通道应串行避免酒馆单飞锁冲突');
    assert.deepEqual(order, ['start:first', 'end:first', 'start:second', 'end:second']);

    const wi = createImageWorldInfoSource(host, { readIncludeNames: async () => false, timeoutMs: 30 });
    const [r1, r2] = await Promise.all([
        wi({ description: 'hang' }),
        wi({ description: 'normal' }),
    ]);
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, 'WORLDINFO_TIMEOUT');
    assert.equal(r2.ok, true);
    assert.equal(r2.text, 'wi:normal');
});

