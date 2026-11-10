import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createNaiQuotaClient, normalizeNaiQuota, resolveNaiSubscriptionEndpoint } from '../src/generated-images/nai-quota-client.js';
import { querySettingsNaiQuota, renderNaiQuota } from '../src/visual/igs-ui/settings-nai-quota.js';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';

const payload = { tier: 3, active: true, trainingStepsLeft: { fixedTrainingStepsLeft: 1000, purchasedTrainingSteps: '23' },
    usage: { percent: 42, timeUntilNextPercent: 120, isNegative: false } };
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('账户地址兼容官方、完整生图地址和中转前缀；不携带查询参数', () => {
    assert.equal(resolveNaiSubscriptionEndpoint(''), 'https://image.novelai.net/user/subscription');
    for (const tail of ['', '/', '/ai', '/ai/', '/ai/generate-image', '/generate-image?x=1#x'])
        assert.equal(resolveNaiSubscriptionEndpoint(`https://relay.test/v1/novelai${tail}`), 'https://relay.test/v1/novelai/user/subscription');
    assert.throws(() => resolveNaiSubscriptionEndpoint('file:///tmp/file'));
    assert.throws(() => resolveNaiSubscriptionEndpoint('https://user:pass@relay.test'));
});

test('GET 沿用直连/酒馆代理，结果按套餐加充值计算；禁止缓存、重定向及直连 cookie', async () => {
    for (const transport of ['direct', 'st-proxy']) {
        let wire;
        const client = createNaiQuotaClient({ fetch: async (url, init) => { wire = { url, ...init }; return json(payload); } });
        const result = await client.query({ apiKey: ' fixture-key ', transport });
        assert.equal(result.ok, true);
        assert.equal(result.quota.total, 1023);
        assert.equal(result.quota.percent, 42);
        assert.equal(wire.url, `${transport === 'direct' ? '' : '/proxy/'}https://image.novelai.net/user/subscription`);
        assert.equal(wire.method, 'GET');
        assert.equal(wire.headers.Authorization, 'Bearer fixture-key');
        assert.equal(wire.cache, 'no-store'); assert.equal(wire.redirect, 'error');
        assert.equal(wire.credentials, transport === 'direct' ? 'omit' : 'same-origin');
        assert.equal(wire.body, undefined);
    }
});

test('未提供额度不猜测为零或满额，确实为零的余额保持为零', () => {
    const q = normalizeNaiQuota({ tier: 3, trainingStepsLeft: { fixedTrainingStepsLeft: 0, purchasedTrainingSteps: 0 } });
    assert.equal(q.total, 0); assert.equal(q.percent, null); assert.equal(q.active, null);
    assert.equal(normalizeNaiQuota({ usage: { percent: '12' } }).total, null);
    for (const data of [{}, [], null, { usage: { percent: false } }, { trainingStepsLeft: { fixedTrainingStepsLeft: -1 } }])
        assert.throws(() => normalizeNaiQuota(data));
    const html = renderNaiQuota({ result: { ok: true, quota: q, queriedAt: 0 } });
    assert.match(html, /V5 额度：未提供/);
    assert.doesNotMatch(html, /100%/);
});

test('错误响应、非法 JSON、空 Key、网络异常均不泄露凭据和响应正文', async () => {
    let count = 0;
    const empty = createNaiQuotaClient({ fetch: async () => { count++; return json(payload); } });
    assert.equal((await empty.query({})).ok, false); assert.equal(count, 0);
    for (const status of [401, 403, 404, 405, 429, 500]) {
        const client = createNaiQuotaClient({ fetch: async () => new Response('fixture-secret <html>private</html>', { status }) });
        const r = await client.query({ apiKey: 'fixture-secret' });
        assert.equal(r.ok, false); assert.match(r.error, new RegExp(String(status)));
        assert.doesNotMatch(r.error, /fixture-secret|private/);
    }
    for (const fetch of [async () => new Response('<html>fixture-secret</html>'), async () => { throw new Error('fixture-secret'); }]) {
        const r = await createNaiQuotaClient({ fetch }).query({ apiKey: 'fixture-secret' });
        assert.equal(r.ok, false); assert.doesNotMatch(r.error, /fixture-secret|<html>/);
    }
    const proxy = await createNaiQuotaClient({ fetch: async () => new Response('CORS proxy is disabled', { status: 404 }) })
        .query({ apiKey: 'fixture-key', transport: 'st-proxy' });
    assert.match(proxy.error, /enableCorsProxy/);
});

test('超时和取消及时结束，不依赖 fetch 是否响应 abort', async () => {
    let signal;
    const pending = deferred();
    const client = createNaiQuotaClient({ timeoutMs: 10, fetch: async (_url, init) => { signal = init.signal; return pending.promise; } });
    assert.match((await client.query({ apiKey: 'fixture-key' })).error, /超时/);
    assert.equal(signal.aborted, true); pending.resolve(json(payload));
    const controller = new AbortController(); controller.abort();
    let called = false;
    const r = await createNaiQuotaClient({ fetch: async () => { called = true; return json(payload); } })
        .query({ apiKey: 'fixture-key', signal: controller.signal });
    assert.equal(called, false); assert.match(r.error, /取消/);
});

test('真实设置控制器查询、保存重开不持久化余额，更换 Key 清除旧结果', async () => {
    let calls = 0;
    const app = bootstrapIGS({ global: { localStorage: createMemoryStorage(), fetch: async url => { if (String(url).endsWith('/user/subscription')) { calls++; return json(payload); } return new Response('', { status: 404 }); } },
        autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        let panel = app.openSettings({ page: 'source' }).controller;
        panel.setValue('bridge.imageApi.mode', 'nai');
        panel.setValue('bridge.autoIllustration.nai.apiKey', 'fixture-key');
        assert.equal(calls, 0);
        assert.equal((await panel.invoke('query-nai-quota')).ok, true);
        const dom = new JSDOM(panel.getSnapshot().html);
        assert.match(dom.window.document.querySelector('[data-nai-quota]').textContent, /1,023/);
        assert.match(dom.window.document.querySelector('[data-nai-quota]').textContent, /Opus/);
        dom.window.close();
        assert.equal(panel.getSnapshot().draft.bridge.autoIllustration.nai.quota, undefined);
        panel.setValue('bridge.autoIllustration.nai.apiKey', 'other-key');
        assert.doesNotMatch(panel.getSnapshot().html, /Anlas 余额：/);
        await panel.invoke('query-nai-quota');
        await panel.close();
        panel = app.openSettings({ page: 'source' }).controller;
        assert.doesNotMatch(panel.getSnapshot().html, /Anlas 余额：/);
        assert.equal(calls, 2);
    } finally { await app.shutdown(); }
});

test('防重复点击，换配置/关闭面板后的迟到响应不能覆盖新面板', async () => {
    const pending = deferred();
    const panel = { draft: { bridge: { autoIllustration: { nai: { apiKey: 'fixture-key' } } } }, asyncState: {} };
    const state = { activeSettings: panel };
    let renders = 0;
    const ctx = { state, options: { global: { fetch: () => pending.promise } }, rerenderSettings: () => { renders++; } };
    const first = querySettingsNaiQuota(ctx);
    assert.equal((await querySettingsNaiQuota(ctx)).reason, 'quota-query-busy');
    panel.draft.bridge.autoIllustration.nai.apiKey = 'changed-key';
    state.activeSettings = { ...panel, asyncState: {} };
    pending.resolve(json(payload));
    assert.equal((await first).reason, 'quota-query-stale');
    assert.equal(renders, 1); assert.equal(state.activeSettings.asyncState.naiQuota, undefined);
});

test('挂载面板的输入事件即时清除旧结果；关闭时终止在途查询', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://tavern.test' });
    const pending = deferred();
    let signal, waiting = false;
    dom.window.fetch = async (url, init) => {
        if (!String(url).endsWith('/user/subscription')) return new Response('', { status: 404 });
        signal = init.signal;
        return waiting ? pending.promise : json(payload);
    };
    const app = bootstrapIGS({ global: dom.window, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const panel = app.openSettings({ page: 'source' }).controller;
        panel.setValue('bridge.imageApi.mode', 'nai');
        panel.setValue('bridge.autoIllustration.nai.apiKey', 'fixture-key');
        await panel.invoke('query-nai-quota');
        const doc = dom.window.document;
        assert.match(doc.querySelector('[data-nai-quota]').textContent, /1,023/);
        const input = doc.querySelector('[data-path="bridge.autoIllustration.nai.apiKey"]');
        input.value = 'other-key'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.doesNotMatch(doc.querySelector('[data-nai-quota]').textContent, /1,023/);
        assert.equal(doc.querySelectorAll('[data-nai-quota]').length, 1);
        waiting = true;
        const task = panel.invoke('query-nai-quota');
        await Promise.resolve();
        assert.equal(doc.querySelector('[data-action="query-nai-quota"]').disabled, true);
        await panel.close();
        assert.equal(signal.aborted, true);
        assert.equal((await task).reason, 'quota-query-stale');
        pending.resolve(json(payload));
    } finally { pending.resolve(json(payload)); await app.shutdown(); dom.window.close(); }
});
