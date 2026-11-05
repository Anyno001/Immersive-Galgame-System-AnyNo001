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

test('两个独立客户端共享密钥依次获锁，另一密钥并行；仅发送哈希和随机身份', async () => {
    const s = service(), gate = deferred(), entered = deferred();
    let generated = 0;
    const fetch = async (url, init) => {
        if (!String(url).startsWith(endpoint) && generated++ === 0) { entered.resolve(); await gate.promise; }
        return s.fetch(url, init);
    };
    const a = s.client(fetch), b = s.client(fetch);
    const first = a.generate({ scene: 'a room' }, s.settings);
    await entered.promise;
    const second = b.generate({ scene: 'another room' }, s.settings);
    await tick(); await tick();
    assert.equal(generated, 1);
    assert.equal((await b.generate({ scene: 'a tree' }, { ...s.settings, apiKey: 'other-fixture-key' })).ok, true);
    assert.equal(generated, 2);
    gate.resolve();
    assert.equal((await first).ok, true); assert.equal((await second).ok, true);
    assert.equal(generated, 3);
    const joins = s.calls.filter(c => c.path === '/join-queue');
    assert.equal(joins[0].data.key_hash, createHash('sha256').update(naiConfig.apiKey).digest('hex'));
    assert.notEqual(joins[0].data.user_id, joins[1].data.user_id);
    assert.notEqual(joins[0].data.task_id, joins[1].data.task_id);
    for (const { path, data, init } of s.calls) {
        assert.deepEqual(Object.keys(data).sort(), ['key_hash', path === '/join-queue' ? 'greeting' : path === '/my-turn' ? null : 'lock_token', 'task_id', 'user_id'].filter(Boolean).sort());
        assert.equal(JSON.stringify(data).includes(naiConfig.apiKey), false);
        assert.equal(init.headers?.Authorization, undefined); assert.equal(init.credentials, 'omit');
    }
    assert.equal(s.calls.filter(c => c.path === '/complete').length, 3);
});

test('生成和局部重绘走同一云队列，保留 Medium 实际模型且队列字段不进入 NAI', async () => {
    const s = service(), c = s.client();
    assert.equal((await c.generate({ scene: 'room' }, s.settings)).ok, true);
    const png = pngFixture(64, 128).dataUrl;
    assert.equal((await c.edit({ prompt: 'room', width: 64, height: 128, sourceDataUrl: png, maskDataUrl: png }, s.settings)).ok, true);
    assert.deepEqual(s.sends.map(b => b.model), ['nai-diffusion-5-full-medium', 'nai-diffusion-5-full-medium-inpainting']);
    assert.equal(s.calls.filter(c => c.path === '/join-queue').length, 2);
    for (const body of s.sends) assert.equal(JSON.stringify(body).includes('cloudQueue'), false);
});

test('正式任务快照覆盖 CG、立绘、背景和物品，排队日志走原 report 入口', async () => {
    const s = service(), bridge = { imageApi: { mode: 'nai' }, autoIllustration: { nai: s.settings } };
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    const runtime = createBuiltinImageTaskRuntime({ readBridge: () => bridge, registry });
    const logs = [];
    const backend = createImageBackend({ nai: s.client(), taskRuntime: runtime, getBridge: () => bridge,
        report: (level, message) => logs.push({ level, message }) });
    try {
        for (const imageKind of ['cg', 'sprite', 'background', 'item']) {
            const result = await backend.generate({ scene: 'a room' }, {}, { imageKind, size: '64x128' });
            assert.equal(result.ok, true);
        }
        assert.equal(s.calls.filter(c => c.path === '/join-queue').length, 4);
        assert.equal(logs.filter(l => /正在取号/.test(l.message)).length, 4);
        assert.equal(logs.filter(l => /NAI 计时.*队列收尾/.test(l.message)).length, 4);
        assert.equal(JSON.stringify(logs).includes(naiConfig.apiKey), false);
        assert.equal(JSON.stringify(logs).includes('token-'), false);
    } finally { runtime.dispose(); }
});

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

test('关闭时不访问队列；开启但地址无效或回执缺 token 时零生图', async () => {
    const s = service(), c = s.client();
    assert.equal((await c.generate({ scene: 'room' }, { ...s.settings, cloudQueue: { enabled: false } })).ok, true);
    assert.equal(s.calls.length, 0);
    for (const bad of ['https://user:secret@queue.fixture', 'https://queue.fixture/?token=x', 'file:///tmp/queue']) {
        const result = await c.generate({ scene: 'room' }, { ...s.settings, cloudQueue: { enabled: true, endpoint: bad } });
        assert.equal(result.reason, 'nai-cloud-queue-config');
    }
    const bad = s.client(async url => String(url).startsWith(endpoint) ? json({ position: 0 }) : image());
    assert.equal((await bad.generate({ scene: 'room' }, s.settings)).reason, 'nai-cloud-queue-unavailable');
    assert.equal(s.sends.length, 1);
});

test('未填地址时开关打开也不排队、不联网任何默认节点；旧版自动填入的地址在未开启时清空', async () => {
    const s = service();
    const c = s.client(async (input, init) => {
        assert.equal(new URL(input).origin === endpoint, false);
        return s.fetch(input, init);
    });
    for (const value of [undefined, '', '   ', null]) {
        const config = { enabled: true, ...(value !== undefined && { endpoint: value }) };
        assert.equal(normalizeAutoIllustrationSettings({ nai: { cloudQueue: config } }).nai.cloudQueue.endpoint, '');
        assert.equal((await c.generate({ scene: 'room' }, { ...s.settings, cloudQueue: config })).ok, true);
    }
    assert.deepEqual(s.calls, []);
    assert.equal(s.sends.length, 4);
    assert.equal(normalizeSettingsValue('bridge.autoIllustration.nai.cloudQueue.endpoint', ''), '');
    const legacy = 'https://st-chatu-novelai-queue.hf.space';
    assert.equal(normalizeAutoIllustrationSettings({ nai: { cloudQueue: { enabled: false, endpoint: legacy } } }).nai.cloudQueue.endpoint, '');
    assert.equal(normalizeAutoIllustrationSettings({ nai: { cloudQueue: { enabled: true, endpoint: legacy } } }).nai.cloudQueue.endpoint, legacy);
});

test('生图间隔开关关闭时不等待，打开后按设定毫秒等待', async () => {
    for (const [enabled, expectWait] of [[false, false], [true, true]]) {
        const waits = [], queue = createNaiRequestQueue({ now: () => 0, sleep: async ms => waits.push(ms) });
        const client = createNaiOfficialClient({ queue, fetch: async () => image() });
        const settings = { ...naiConfig, cloudQueue: { enabled: false }, minIntervalEnabled: enabled, minIntervalMs: 20000 };
        assert.equal((await client.generate({ scene: 'room' }, settings)).ok, true);
        assert.equal((await client.generate({ scene: 'room' }, settings)).ok, true);
        assert.equal(waits.some(ms => ms > 0), expectWait);
    }
    assert.equal(normalizeAutoIllustrationSettings({}).nai.minIntervalEnabled, false);
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

test('排队总超时退出、轮询连续失败停止；排队不算生图发送', async () => {
    const s = service();
    let time = 0;
    const cloudQueue = createNaiCloudQueue({ now: () => time, sleep: async ms => { time += ms; },
        fetch: async url => String(url).endsWith('/leave-queue') ? json({ status: 'ok' }) : json({ position: 2 }) });
    const c = createNaiOfficialClient({ cloudQueue, fetch: s.fetch, queue: createNaiRequestQueue() });
    const result = await c.generate({ scene: 'room' }, { ...s.settings, cloudQueue: { ...cloudConfig, timeoutMs: 10000 } });
    assert.equal(result.reason, 'nai-cloud-queue-timeout');
    assert.equal(result.timing.startedAt, undefined); assert.equal(s.sends.length, 0);
    let polls = 0;
    const broken = s.client(async url => {
        if (String(url).includes('/my-turn')) { polls++; throw new Error('fixture'); }
        return json(String(url).includes('join-queue') ? { position: 1 } : { status: 'ok' });
    });
    assert.equal((await broken.generate({ scene: 'room' }, s.settings)).reason, 'nai-cloud-queue-unavailable');
    assert.equal(polls, 3);
});

test('队列请求挂起也有独立超时，不绕过队列', { timeout: 1000 }, async () => {
    const s = service();
    const cloudQueue = createNaiCloudQueue({ fetch: () => new Promise(() => {}), requestTimeoutMs: 10 });
    const c = createNaiOfficialClient({ cloudQueue, fetch: s.fetch, queue: createNaiRequestQueue() });
    assert.equal((await c.generate({ scene: 'room' }, s.settings)).reason, 'nai-cloud-queue-unavailable');
    assert.equal(s.sends.length, 0);
});

test('云端未获放行时不制造本机请求完成时间，不给下一项额外冷却', async () => {
    const waits = [], queue = createNaiRequestQueue({ now: () => 0, sleep: async ms => waits.push(ms) });
    const client = createNaiOfficialClient({ queue, fetch: async () => image(),
        cloudQueue: { acquire: async () => ({ ok: false, reason: 'fixture-cloud-failure' }) } });
    assert.equal((await client.generate({ scene: 'room' }, { ...naiConfig, minIntervalMs: 20000 })).ok, false);
    await tick();
    assert.equal((await client.generate({ scene: 'room' }, { ...naiConfig, minIntervalMs: 20000, cloudQueue: { enabled: false } })).ok, true);
    assert.deepEqual(waits, []);
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

test('设置、旧预设和真实设置页面保存重开，间隔和 Medium 不丢失', async () => {
    const base = 'bridge.autoIllustration.nai.cloudQueue';
    assert.deepEqual(normalizeAutoIllustrationSettings({}).nai.cloudQueue, { enabled: false, endpoint: '', timeoutMs: 180000 });
    assert.equal(normalizeSettingsValue(`${base}.timeoutMs`, 'bad'), 180000);
    assert.equal(normalizeSettingsValue(`${base}.timeoutMs`, 9999999), 900000);
    const app = bootstrapIGS({ global: { localStorage: createMemoryStorage() }, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        let panel = app.openSettings({ page: 'source' }).controller;
        for (const [path, value] of [['bridge.imageApi.mode', 'nai'], ['bridge.autoIllustration.nai.model', 'nai-diffusion-5-full'],
            ['bridge.autoIllustration.nai.effort', 'medium'], ['bridge.autoIllustration.nai.minIntervalMs', 20000], ['bridge.autoIllustration.nai.minIntervalEnabled', true],
            [`${base}.endpoint`, `${endpoint}/`], [`${base}.timeoutMs`, 240000], [`${base}.enabled`, true]])
            assert.equal(panel.setValue(path, value).ok, true);
        const draft = panel.getSnapshot().draft;
        const dom = new JSDOM(panel.getSnapshot().html);
        assert.equal(dom.window.document.querySelector(`[data-switch="${base}.enabled"]`).getAttribute('aria-pressed'), 'true');
        assert.equal(dom.window.document.querySelector(`[data-path="${base}.endpoint"]`).value, endpoint);
        dom.window.close();
        const values = collectProfileValues('image', draft), restored = {};
        applyProfileValues('image', values, restored);
        assert.deepEqual(restored.bridge.autoIllustration.nai.cloudQueue, { ...cloudConfig, timeoutMs: 240000 });
        assert.equal(isImmediateSavePath(`${base}.enabled`), true);
        applyProfileValues('image', {}, restored);
        assert.equal(restored.bridge.autoIllustration.nai.cloudQueue.enabled, false);
        await panel.close(); panel = app.openSettings({ page: 'source' }).controller;
        const nai = panel.getSnapshot().draft.bridge.autoIllustration.nai;
        assert.deepEqual(nai.cloudQueue, { ...cloudConfig, timeoutMs: 240000 });
        assert.equal(nai.effort, 'medium'); assert.equal(nai.minIntervalMs, 20000); assert.equal(nai.minIntervalEnabled, true);
        await panel.close();
    } finally { await app.shutdown(); }
});
