import test from 'node:test';
import assert from 'node:assert/strict';
import { createNaiRequestQueue } from '../src/generated-images/nai-request-queue.js';
import { createNaiOfficialClient } from '../src/generated-images/nai-official-client.js';
import { normalizeAutoIllustrationSettings } from '../src/generated-images/illustration/auto-illustration-settings.js';
import { applyProfileValues, collectProfileValues, isImmediateSavePath } from '../src/visual/igs-ui/settings-model-profiles.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { pngFixture } from './helpers/png-fixture.js';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { JSDOM } from 'jsdom';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
function clockQueue() {
    let time = 0;
    const sleeps = [];
    const queue = createNaiRequestQueue({ now: () => time, sleep: async ms => { sleeps.push(ms); time += ms; } });
    return { queue, sleeps, now: () => time, advance: ms => { time += ms; } };
}

test('同密钥等实际结束后再冷却，队列曾清空也不跳过剩余间隔', async () => {
    const f = clockQueue(), starts = [], gate = deferred();
    const first = f.queue.run('fixture-key', async () => { starts.push(f.now()); await gate.promise; }, { minIntervalMs: 2000 });
    const second = f.queue.run('fixture-key', () => starts.push(f.now()), { minIntervalMs: 2000 });
    await tick(); assert.deepEqual(starts, [0]);
    f.advance(700); gate.resolve(); await Promise.all([first, second]); await tick();
    assert.deepEqual(starts, [0, 2700]);
    f.advance(500);
    await f.queue.run('fixture-key', () => starts.push(f.now()), { minIntervalMs: 2000 });
    assert.deepEqual(starts, [0, 2700, 4700]);
    assert.deepEqual(f.sleeps, [2000, 1500]);
});

test('一个密钥冷却时另一密钥仍可发送', async () => {
    const gate = deferred(), entered = deferred(), sends = [];
    const queue = createNaiRequestQueue({ now: () => 0, sleep: async () => { entered.resolve(); await gate.promise; } });
    await queue.run('key-a', () => sends.push('a1')); await tick();
    const second = queue.run('key-a', () => sends.push('a2'), { minIntervalMs: 2000 });
    await entered.promise;
    await queue.run('key-b', () => sends.push('b'));
    assert.deepEqual(sends, ['a1', 'b']);
    gate.resolve(); await second;
    assert.deepEqual(sends, ['a1', 'b', 'a2']);
});

test('0 关闭额外等待；失败后仍遵守下一项的间隔', async () => {
    const f = clockQueue();
    await f.queue.run('key', () => { throw new Error('模拟失败'); }); await tick();
    await f.queue.run('key', () => ({ ok: true }), { minIntervalMs: 1000 }); await tick();
    assert.deepEqual(f.sleeps, [1000]);
    await f.queue.run('key', () => ({ ok: true }), { minIntervalMs: 0 });
    assert.deepEqual(f.sleeps, [1000]);
});

test('冷却中取消不发送、不留下长定时器，也不延长下一项冷却', { timeout: 2000 }, async () => {
    let sends = 0;
    const queue = createNaiRequestQueue({ now: () => 0 });
    await queue.run('key', () => { sends++; }); await tick();
    const controller = new AbortController();
    const cancelled = queue.run('key', () => { sends++; }, { minIntervalMs: 60000, signal: controller.signal });
    await tick(); controller.abort();
    assert.equal((await cancelled).reason, 'request-stale');
    await queue.run('key', () => { sends++; }, { minIntervalMs: 0 });
    assert.equal(sends, 2);
});

test('普通生成与局部重绘通过实际客户端共用间隔，间隔不进入 NAI 请求体', async () => {
    const f = clockQueue(), sends = [];
    const client = createNaiOfficialClient({ queue: f.queue, fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        sends.push({ at: f.now(), body });
        return new Response(JSON.stringify({ image: 'data:image/png;base64,AAAA' }), { headers: { 'Content-Type': 'application/json' } });
    } });
    const settings = { apiKey: 'fixture-key', minIntervalMs: 2500, model: 'nai-diffusion-5-full' };
    assert.equal((await client.generate({ scene: 'room' }, settings)).ok, true); await tick();
    const png = pngFixture(64, 128).dataUrl;
    assert.equal((await client.edit({ prompt: 'room', width: 64, height: 128, sourceDataUrl: png, maskDataUrl: png }, settings)).ok, true);
    assert.deepEqual(sends.map(row => [row.at, row.body.action]), [[0, 'generate'], [2500, 'infill']]);
    for (const { body } of sends) assert.equal(JSON.stringify(body).includes('minIntervalMs'), false);
});

test('间隔设置规范化、模型预设和即时保存往返，旧配置默认两秒', () => {
    const path = 'bridge.autoIllustration.nai.minIntervalMs';
    assert.equal(normalizeAutoIllustrationSettings({}).nai.minIntervalMs, 2000);
    for (const [input, expected] of [[0, 0], ['3500', 3500], [-10, 0], [999999, 60000], ['bad', 2000], ['', 2000]]) {
        assert.equal(normalizeSettingsValue(path, input), expected);
        assert.equal(normalizeAutoIllustrationSettings({ nai: { minIntervalMs: input } }).nai.minIntervalMs, expected);
    }
    const draft = { bridge: { autoIllustration: { nai: { minIntervalMs: 3500 } } } };
    const values = collectProfileValues('image', draft);
    draft.bridge.autoIllustration.nai.minIntervalMs = 0;
    applyProfileValues('image', values, draft);
    assert.equal(draft.bridge.autoIllustration.nai.minIntervalMs, 3500);
    assert.equal(isImmediateSavePath(path), true);
});

test('长时间本机排队不耗尽发送后的 429 重试预算', async t => {
    let time = 0, sends = 0;
    t.mock.method(Date, 'now', () => time);
    const client = createNaiOfficialClient({
        queue: { run: async (_key, execute) => { time += 20000; return execute(); } },
        sleep: async ms => { time += ms; },
        fetch: async () => ++sends === 1 ? new Response('{}', { status: 429 })
            : new Response(JSON.stringify({ image: 'data:image/png;base64,AAAA' }), { headers: { 'Content-Type': 'application/json' } }),
    });
    const result = await client.generate({ scene: 'room' }, { apiKey: 'fixture-key', minIntervalMs: 0, timeoutMs: 10000 });
    assert.equal(result.ok, true);
    assert.equal(sends, 2);
});

test('429 自动重试同时遵守用户间隔，不按更短的默认退避提前发送', async () => {
    let sends = 0;
    const sleeps = [];
    const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), sleep: async ms => { sleeps.push(ms); },
        fetch: async () => ++sends === 1 ? new Response('{}', { status: 429 })
            : new Response(JSON.stringify({ image: 'data:image/png;base64,AAAA' }), { headers: { 'Content-Type': 'application/json' } }),
    });
    const result = await client.generate({ scene: 'room' }, { apiKey: 'fixture-key', minIntervalMs: 8000 });
    assert.equal(result.ok, true);
    assert.deepEqual(sleeps, [8000]);
    assert.equal(sends, 2);
});

test('实际设置页显示可编辑间隔，保存关闭后重新打开仍保留数值', async () => {
    const app = bootstrapIGS({ global: { localStorage: createMemoryStorage() }, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    const path = 'bridge.autoIllustration.nai.minIntervalMs';
    let dom;
    try {
        const opened = app.openSettings({ page: 'source' });
        assert.equal(opened.controller.setValue('bridge.imageApi.mode', 'nai').ok, true);
        dom = new JSDOM(opened.controller.getSnapshot().html);
        const input = dom.window.document.querySelector(`[data-path="${path}"]`);
        assert.equal(input.type, 'number');
        assert.equal(input.value, '2000');
        assert.equal(input.disabled, false);
        assert.equal(input.closest('[hidden]'), null);
        assert.equal(opened.controller.setValue(path, '3500').ok, true);
        assert.equal((await opened.controller.close()).ok, true);
        const reopened = app.openSettings({ page: 'source' });
        assert.equal(reopened.controller.getSnapshot().draft.bridge.autoIllustration.nai.minIntervalMs, 3500);
        assert.equal((await reopened.controller.close()).ok, true);
    } finally { dom?.window.close(); await app.shutdown(); }
});
