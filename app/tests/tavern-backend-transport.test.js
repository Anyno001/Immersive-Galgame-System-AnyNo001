import test from 'node:test';
import assert from 'node:assert/strict';
import { probeTavernProxy, resetTavernProxyProbe, resolveTavernTransport, tavernProxyFailure } from '../src/host/tavern-cors-proxy.js';
import { createNaiOfficialClient } from '../src/generated-images/nai-official-client.js';
import { createNaiRequestQueue } from '../src/generated-images/nai-request-queue.js';
import { createSecondaryLlm } from '../src/host/secondary-llm.js';
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
    const config = { source: 'openai', endpoint: 'https://upstream.example/v1', apiKey: 'fake-secret', model: 'planner' };
    const prompts = { system: 'SYS', user: 'USR' };
    const network = createSecondaryLlm(serviceHost('request to https://upstream.example/v1/chat/completions failed, reason: connect ETIMEDOUT'));
    await assert.rejects(network.request(prompts, config), error => error.reason === 'secondary-llm-backend-unreachable'
        && /requestProxy/.test(error.message) && !error.message.includes('upstream.example'));
    const upstream = createSecondaryLlm(serviceHost('Internal Server Error'));
    await assert.rejects(upstream.request(prompts, config), error => error.status === 500 && /请求已到达该接口/.test(error.message));
    const raw = createSecondaryLlm(fakeLlmHost(), { fetch: async () => new Response(JSON.stringify({ error: { message: 'fetch failed' } }), { status: 502 }) });
    await assert.rejects(raw.request(prompts, config), error => error.reason === 'secondary-llm-backend-unreachable');
});
