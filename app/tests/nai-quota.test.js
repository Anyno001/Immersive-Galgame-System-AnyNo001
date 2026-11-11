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

