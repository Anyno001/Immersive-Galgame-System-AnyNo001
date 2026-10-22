import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecondaryLlm } from '../src/host/secondary-llm.js';
import { fakeLlmHost } from './helpers/fake-llm-host.js';

const config = { source: 'openai', endpoint: 'https://upstream.example/v1', apiKey: 'fake-secret', model: 'planner' };
const prompts = { system: 'SYS', user: 'USR' };
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status });

function nativeOnly(response) {
    const calls = [];
    const fetch = async (url, init) => {
        if (!String(url).startsWith('/api/backends/chat-completions/')) throw new TypeError('upstream has no Access-Control-Allow-Origin');
        const body = JSON.parse(init.body);
        calls.push({ url, init, body });
        return response(url, init, body);
    };
    return { calls, fetch };
}

test('gate:llm:root-version-and-full-endpoints-resolve-to-the-same-api-base', async () => {
    const backend = nativeOnly(() => jsonResponse({ models: ['planner'] }));
    const llm = createSecondaryLlm(fakeLlmHost(), { fetch: backend.fetch });
    for (const endpoint of ['https://upstream.example', 'https://upstream.example/', config.endpoint, `${config.endpoint}/`, `${config.endpoint}/chat/completions`, `${config.endpoint}/models`]) {
        await llm.fetchModels({ ...config, endpoint });
        assert.equal(backend.calls.at(-1).body.custom_url, config.endpoint);
    }
});

test('gate:llm:model-list-timeout-also-aborts-a-hung-response-body', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const backend = nativeOnly(() => ({ ok: true, status: 200, text: () => new Promise(() => {}) }));
    const llm = createSecondaryLlm(fakeLlmHost(), { fetch: backend.fetch });
    const checked = assert.rejects(llm.fetchModels(config), /超时/);
    await Promise.resolve();
    t.mock.timers.tick(30000);
    await checked;
    assert.equal(backend.calls[0].init.signal.aborted, true);
});
