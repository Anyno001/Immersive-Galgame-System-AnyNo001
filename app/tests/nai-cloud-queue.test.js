import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createNaiCloudQueue } from '../src/generated-images/nai-cloud-queue.js';
import { createNaiOfficialClient } from '../src/generated-images/nai-official-client.js';
import { createNaiRequestQueue } from '../src/generated-images/nai-request-queue.js';
import { createImageBackend } from '../src/generated-images/image-backend.js';
import { createBuiltinImageTaskRuntime } from '../src/generated-images/builtin-image-task-runtime.js';
import { createPresetRegistry } from '../src/presets/preset-registry.js';
import { normalizeAutoIllustrationSettings } from '../src/generated-images/illustration/auto-illustration-settings.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { applyProfileValues, collectProfileValues, isImmediateSavePath } from '../src/visual/igs-ui/settings-model-profiles.js';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { pngFixture } from './helpers/png-fixture.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const endpoint = 'https://queue.fixture';
const cloudConfig = { enabled: true, endpoint, timeoutMs: 180000 };
const naiConfig = { apiKey: 'fixture-shared-key', model: 'nai-diffusion-5-full', effort: 'medium', minIntervalMs: 0, cloudQueue: cloudConfig };
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const image = () => json({ image: 'data:image/png;base64,AAAA' });

// 按公开协议模拟 15 秒租约；不启动真实服务，也不加入公共队列。
function service() {
    const queues = new Map(), calls = [], sends = [], reports = [];
    let clock = 0, serial = 0;
    const promote = q => { if (q[0]) { q[0].token = `token-${++serial}`; q[0].expires = clock + 15000; } };
    const cleanup = q => { while (q[0] && q[0].expires < clock) { q.shift(); promote(q); } };
    const fetch = async (input, init = {}) => {
        const url = new URL(input);
        if (url.origin !== endpoint) {
            sends.push(JSON.parse(init.body)); return image();
        }
        const data = init.body ? JSON.parse(init.body) : Object.fromEntries(url.searchParams);
        calls.push({ path: url.pathname, data, init });
        let q = queues.get(data.key_hash);
        if (!q) { q = []; queues.set(data.key_hash, q); }
        cleanup(q);
        if (url.pathname === '/join-queue') {
            if (!q.some(t => t.task_id === data.task_id)) { q.push({ ...data, expires: Infinity }); if (q.length === 1) promote(q); }
        } else if (url.pathname === '/complete' || url.pathname === '/leave-queue') {
            const index = q.findIndex(t => t.task_id === data.task_id);
            if (url.pathname === '/complete' && index !== 0) return json({ status: 'ignored' });
            if (index >= 0) {
                if (index === 0 && data.lock_token && data.lock_token !== q[0].token) return new Response('', { status: 403 });
                q.splice(index, 1); if (index === 0) promote(q);
            }
            return json({ status: 'ok' });
        }
        const position = q.findIndex(t => t.task_id === data.task_id);
        if (position < 0) return new Response('', { status: 404 });
        return json({ position, queue_size: q.length, is_my_turn: position === 0,
            lock_token: position === 0 ? q[0].token : null });
    };
    function client(customFetch = fetch, extras = {}) {
        const cloudQueue = createNaiCloudQueue({ fetch: customFetch, sleep: tick, now: () => clock });
        return createNaiOfficialClient({ fetch: customFetch, queue: createNaiRequestQueue(), cloudQueue, ...extras });
    }
    const settings = { ...naiConfig, onQueueEvent: (level, message) => reports.push({ level, message }) };
    return { calls, sends, queues, reports, fetch, client, settings, advance: ms => { clock += ms; }, now: () => clock };
}

test('已获放行但发送前取消也归还任务；确认锁失败不发送', async () => {
    const s = service(), controller = new AbortController(), entered = deferred(), gate = deferred();
    const cloudQueue = createNaiCloudQueue({ fetch: s.fetch, sleep: async () => { entered.resolve(); await gate.promise; } });
    const c = createNaiOfficialClient({ fetch: s.fetch, cloudQueue, queue: createNaiRequestQueue() });
    const pending = c.generate({ scene: 'room' }, { ...s.settings, signal: controller.signal });
    await entered.promise; controller.abort(); gate.resolve(); await pending; await tick(); await tick();
    assert.equal(s.sends.length, 0); assert.equal([...s.queues.values()].flat().length, 0);
    const broken = s.client(async (url, init) => {
        if (String(url).includes('/my-turn')) throw new Error('fixture');
        return s.fetch(url, init);
    });
    assert.equal((await broken.generate({ scene: 'room' }, s.settings)).reason, 'nai-cloud-queue-lock-lost');
    assert.equal(s.sends.length, 0);
});

test('排队取消退出，迟到的加入回执再清理，不发送 NAI', async () => {
    const s = service(), controller = new AbortController(), gate = deferred(), entered = deferred();
    const c = s.client(async (url, init) => {
        if (String(url).endsWith('/join-queue')) { entered.resolve(); await gate.promise; }
        return s.fetch(url, init);
    });
    const pending = c.generate({ scene: 'room' }, { ...s.settings, signal: controller.signal });
    await entered.promise; controller.abort();
    assert.equal((await pending).reason, 'request-stale');
    gate.resolve(); await tick(); await tick(); await tick();
    assert.equal(s.sends.length, 0);
    assert.ok(s.calls.some(c => c.path === '/leave-queue'));
    assert.equal([...s.queues.values()].flat().length, 0);
});

test('发送后取消不提前 complete；未知网络状态留给租约回收', async () => {
    const s = service(), entered = deferred(), gate = deferred(), controller = new AbortController();
    const c = s.client(async (url, init) => {
        if (!String(url).startsWith(endpoint)) { entered.resolve(); await gate.promise; }
        return s.fetch(url, init);
    });
    const pending = c.generate({ scene: 'room' }, { ...s.settings, signal: controller.signal });
    await entered.promise; controller.abort(); await pending;
    assert.equal(s.calls.some(c => c.path === '/complete'), false);
    gate.resolve(); await tick(); await tick();
    assert.equal(s.calls.filter(c => c.path === '/complete').length, 1);
    const unknown = s.client(async (url, init) => {
        if (!String(url).startsWith(endpoint)) throw new Error('fixture transport unknown');
        return s.fetch(url, init);
    });
    const r = await unknown.generate({ scene: 'room' }, s.settings);
    assert.equal(r.reason, 'nai-transport-unknown');
    assert.equal(s.calls.filter(c => c.path === '/complete').length, 1);
    assert.ok(s.reports.some(x => /未提前释放/.test(x.message)));
});

test('释放失败保留已生成结果，429 重试前发现 15 秒锁过期就停止', async () => {
    const s = service();
    const releaseFailure = s.client(async (url, init) => {
        if (String(url).endsWith('/complete')) throw new Error('fixture');
        return s.fetch(url, init);
    });
    assert.equal((await releaseFailure.generate({ scene: 'room' }, s.settings)).ok, true);
    assert.ok(s.reports.some(x => /释放未确认/.test(x.message)));
    s.advance(16000);
    let sends = 0;
    const c = s.client(async (url, init) => {
        if (!String(url).startsWith(endpoint)) { sends++; return new Response('{}', { status: 429 }); }
        return s.fetch(url, init);
    }, { sleep: async () => s.advance(20000) });
    const r = await c.generate({ scene: 'room' }, { ...s.settings, minIntervalMs: 20000 });
    assert.equal(r.reason, 'nai-cloud-queue-lock-lost'); assert.equal(sends, 1);
});

