import { createItemImageService } from './helpers/media-fixtures.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';


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
