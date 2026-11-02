import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageBackend } from '../src/generated-images/image-backend.js';

const caption = {
    v4_prompt: { caption: { base_caption: 'plugin composition, soft light',
        char_captions: [{ char_caption: 'purple hair, sitting', centers: [{ x: 0.5, y: 0.5 }] }] } },
    v4_negative_prompt: { caption: { base_caption: 'plugin negative', char_captions: [{ char_caption: '' }] } },
};
const image = { ok: true, value: [{ blob: new Blob(['fixture'], { type: 'image/png' }) }] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function backendWith(api, dbgenTimeouts) {
    const logs = [];
    const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
        global: { NaiDbGen: api, btoa }, dbgenTimeouts, report: (level, text) => logs.push([level, text]) });
    return { backend, logs };
}

test('DBGen 出图开始后不回：到时限由 IGS 中断同一次调用并交回失败', async () => {
    let received;
    const { backend, logs } = backendWith({ generate(request) {
        received = request;
        assert.equal(request.shouldStart(), true);
        return new Promise(() => {});
    } }, { paint: 0, paintLimit: 40, queueLimit: 0 });
    const result = await backend.generateCaption({ caption });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'plugin-timeout');
    assert.match(result.error, /出图超时/);
    assert.equal(received.signal.aborted, true, '必须把中断交给插件，插件才会撤回排队或掐断请求');
    assert.ok(logs.some(([level, text]) => level === 'error' && /出图超时/.test(text)));
});

test('DBGen 出图排队等名额不计出图时限，开始后按时返回照常收图', async () => {
    const { backend } = backendWith({ async generate(request) {
        await sleep(120);
        if (!request.shouldStart()) return { ok: false };
        await sleep(10);
        return image;
    } }, { paint: 0, paintLimit: 60, queueLimit: 1000 });
    const result = await backend.generateCaption({ caption });
    assert.equal(result.ok, true, result.error);
    assert.match(result.dataUrl, /^data:image\/png/);
});

test('DBGen 一直轮不到这次请求：排队兜底时限到了撤回，不会永远挂着', async () => {
    let received;
    const { backend } = backendWith({ generate(request) {
        received = request;
        return new Promise(() => {});
    } }, { paint: 0, paintLimit: 30, queueLimit: 80 });
    const result = await backend.generateCaption({ caption });
    assert.equal(result.reason, 'plugin-timeout');
    assert.match(result.error, /排队/);
    assert.equal(received.signal.aborted, true);
});

test('DBGen 写词不回：到时限中断并交回失败，不再无限等待', async () => {
    let received;
    const { backend } = backendWith({ generate() { assert.fail('写词失败不得出图'); },
        generateSinglePrompt(request) { received = request; return new Promise(() => {}); } },
    { write: 0, writeLimit: 40 });
    const result = await backend.writeFloorPrompts({ description: '生成剧情 CG' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'plugin-timeout');
    assert.match(result.error, /写词超时/);
    assert.equal(received.signal.aborted, true);
});

test('调用方先取消：照旧按任务失效收尾，并把取消交给插件', async () => {
    let received;
    const { backend } = backendWith({ generate(request) {
        received = request;
        request.shouldStart();
        return new Promise(() => {});
    } }, { paint: 0, paintLimit: 10000, queueLimit: 0 });
    const controller = new AbortController();
    const pending = backend.generateCaption({ caption, signal: controller.signal });
    await sleep(20);
    controller.abort();
    const result = await pending;
    assert.equal(result.ok, false);
    assert.notEqual(result.reason, 'plugin-timeout');
    assert.equal(received.signal.aborted, true);
});
