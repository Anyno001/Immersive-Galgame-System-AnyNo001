import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createItemImageService } from '../src/generated-images/illustration/item-image-service.js';

const TABLES = { ok: true, data: { a: { uid: 'sheet_a', name: '物品表', content: [['物品名称', '描述'], ['信', '一封信']] } } };
const FAIL = { ok: false, error: 'NAI 请求失败' };

function setup({ generate, describe } = {}) {
    let chatId = 'chat-1';
    let id = 0;
    const calls = { nai: 0 };
    const logs = [];
    const store = createMemoryGeneratedAssetStore();
    const service = createItemImageService({
        messageHost: { getChatId: () => chatId, readFloor: () => ({ chatId, messageId: 5, swipeId: 0, isAi: true, isLatest: true, text: '她点点头。' }), on: () => () => {} },
        llm: { async request() { return 'id: ch1\ntags: letter'; } },
        nai: { describe, async generate() { calls.nai += 1; return generate ? generate(calls.nai) : { ok: true, dataUrl: `data:image/png;base64,${calls.nai}` }; } },
        store,
        readTables: () => TABLES,
        report: (level, message) => logs.push(String(message)),
        getSettings: () => ({ itemImages: { enabled: true }, autoIllustration: { nai: { apiKey: 'SECRET-KEY' } } }),
        newId: () => `img${++id}`,
    });
    return { service, store, calls, logs, setChat: (next) => { chatId = next; } };
}

test('item-image:failed-item-retries-and-failed-regenerate-keeps-previous-image', async () => {
    const { service, store } = setup({ generate: (n) => (n === 1 || n === 3 ? FAIL : { ok: true, dataUrl: `data:image/png;base64,${n}` }) });
    const first = await service.processMessage(5);
    assert.deepEqual([first.ok, first.failedCount], [false, 1]);
    assert.equal(service.imageUrlFor('信'), '');
    assert.equal((await service.processMessage(5)).count, 1);
    assert.equal(service.imageUrlFor('信'), 'data:image/png;base64,2');
    assert.equal((await service.regenerate('信')).ok, false);
    assert.equal(service.imageUrlFor('信'), 'data:image/png;base64,2');
    assert.ok(await store.getImage('img1'));
    assert.equal((await service.regenerate('信')).ok, true);
    assert.equal(service.imageUrlFor('信'), 'data:image/png;base64,4');
    assert.equal(await store.getImage('img1'), null);
});

test('item-image:records-are-isolated-per-chat', async () => {
    const { service, store, calls, setChat } = setup();
    assert.equal((await service.processMessage(5)).count, 1);
    setChat('chat-2');
    assert.equal(service.imageUrlFor('信'), '');
    assert.equal((await service.processMessage(5)).count, 1);
    assert.equal(calls.nai, 2);
    assert.equal((await store.getAssetsByChat('chat-1')).length, 1);
    assert.equal((await store.getAssetsByChat('chat-2')).length, 1);
});

test('item-image:discard-drops-image-and-is-not-auto-regenerated', async () => {
    const { service, store, calls } = setup();
    await service.processMessage(5);
    assert.equal((await service.discard('信')).ok, true);
    assert.equal(service.imageUrlFor('信'), '');
    assert.equal(await store.getImage('img1'), null);
    assert.equal((await service.processMessage(5)).reason, 'nothing-missing');
    assert.equal(calls.nai, 1);
});

test('item-image:backend-not-ready-sends-no-request', async () => {
    const { service, calls } = setup({ describe: () => ({ ready: { ok: false, error: '未配置生图' } }) });
    assert.equal((await service.processMessage(5)).reason, 'backend-unavailable');
    assert.equal(calls.nai, 0);
});

test('item-image:errors-never-log-api-key', async () => {
    const { service, logs } = setup({ generate: () => { throw new Error('boom'); } });
    assert.equal((await service.processMessage(5)).ok, false);
    assert.ok(logs.length > 0);
    assert.ok(logs.every((line) => !line.includes('SECRET-KEY')));
});
