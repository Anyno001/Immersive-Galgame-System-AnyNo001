import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureMedia } from './helpers/media-fixtures.js';
import { createEventBus } from '../src/core/event-bus.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { CARD_IMAGE_UPDATED_EVENT, cardAssetKeyOf, createCardImageService } from '../src/generated-images/illustration/card-image-service.js';

// 卡面服务：假副 LLM、假 NAI、内存存储；验证只在 generate 时请求、按聊天隔离、失败保留旧图、重启后从本地读回。
const CARD = { cardId: 'k1', name: '裂空斩', description: '攻击牌：造成 6 点伤害' };
const png = (n) => `data:image/png;base64,${btoa(`card-${n}`)}`;

function setup({ store = createMemoryGeneratedAssetStore(), generate } = {}) {
    let chatId = 'chat-1';
    let id = 0;
    const calls = { llm: [], nai: [] };
    const seen = [];
    const events = createEventBus();
    events.on(CARD_IMAGE_UPDATED_EVENT, (detail) => seen.push(detail));
    const service = createCardImageService({
        messageHost: { getChatId: () => chatId, on: () => () => {} },
        llm: { async request(request) { calls.llm.push(request); return 'id: ch1\ntags: sword slash, glowing blade'; } },
        nai: { async generate(slot, settings, meta) {
            calls.nai.push({ settings, meta });
            return generate ? generate(calls.nai.length) : { ok: true, dataUrl: png(calls.nai.length) };
        } },
        store, events, mediaCache: fixtureMedia(),
        getSettings: () => ({ itemImages: { size: '832x832' } }),
        newId: () => `img${++id}`,
    });
    return { service, store, calls, seen, setChat: (next) => { chatId = next; } };
}

async function until(fn) {
    for (let i = 0; i < 100 && !fn(); i += 1) await new Promise((r) => setImmediate(r));
    assert.ok(fn());
}

test('card-image:不点击不请求；取图与状态只读本地；点击只为这一张卡写词、出图各一次并按聊天键入库', async () => {
    const { service, store, calls, seen } = setup();
    assert.equal(service.imageUrlFor('k1'), '');
    assert.deepEqual(service.stateFor('k1'), { url: '', pending: false, error: '' });
    await until(() => seen.some((e) => e.reason === 'index-loaded'));
    assert.deepEqual([calls.llm.length, calls.nai.length], [0, 0]);
    const job = service.generate(CARD);
    assert.equal(service.generate(CARD), job);
    assert.equal(service.stateFor('k1').pending, true);
    assert.deepEqual(await job, { ok: true, cardId: 'k1' });
    assert.deepEqual([calls.llm.length, calls.nai.length], [1, 1]);
    assert.match(calls.llm[0].user, /裂空斩/);
    assert.deepEqual([calls.nai[0].meta.imageKind, calls.nai[0].settings.size], ['item', '832x832']);
    const key = cardAssetKeyOf('chat-1', 'k1');
    assert.equal(key, 'chat-1|card|k1');
    const record = await store.getAsset(key);
    assert.deepEqual([record.type, record.chatId, record.cardId, record.status, record.imageId], ['card', 'chat-1', 'k1', 'ready', 'img1']);
    assert.equal((await store.getImage('img1')).type, 'card');
    assert.equal(service.stateFor('k1').pending, false);
    await until(() => Boolean(service.imageUrlFor('k1')));
    assert.ok(['pending', 'generated'].every((reason) => seen.some((e) => e.reason === reason)));
});

test('card-image:重画失败保留旧图并按卡记录原因，重试成功清除原因并替换旧图', async () => {
    const { service, store } = setup({ generate: (n) => (n === 2 ? { ok: false, error: 'NAI 请求失败' } : { ok: true, dataUrl: png(n) }) });
    const key = cardAssetKeyOf('chat-1', 'k1');
    assert.equal((await service.generate(CARD)).ok, true);
    const failed = await service.generate(CARD);
    assert.deepEqual([failed.ok, failed.error], [false, 'NAI 请求失败']);
    assert.equal(service.stateFor('k1').error, 'NAI 请求失败');
    assert.equal((await store.getAsset(key)).imageId, 'img1');
    assert.ok(await store.getImage('img1'));
    assert.equal((await service.generate(CARD)).ok, true);
    assert.equal(service.stateFor('k1').error, '');
    assert.equal((await store.getAsset(key)).imageId, 'img2');
    assert.equal(await store.getImage('img1'), null);
});

test('card-image:按聊天隔离；生成途中换聊天作废结果，不落库、不记失败', async () => {
    const h = setup({ generate: (n) => { if (n === 2) h.setChat('chat-3'); return { ok: true, dataUrl: png(n) }; } });
    assert.equal((await h.service.generate(CARD)).ok, true);
    h.setChat('chat-2');
    assert.equal(h.service.imageUrlFor('k1'), '');
    assert.deepEqual(h.service.stateFor('k1'), { url: '', pending: false, error: '' });
    const stale = await h.service.generate(CARD);
    assert.deepEqual([stale.ok, stale.cancelled, stale.reason], [false, true, 'request-stale']);
    h.setChat('chat-2');
    assert.equal(await h.store.getAsset(cardAssetKeyOf('chat-2', 'k1')), null);
    assert.equal(h.service.stateFor('k1').error, '');
    assert.deepEqual((await h.store.getAssetsByChat('chat-1')).map((a) => a.key), ['chat-1|card|k1']);
});

test('card-image:重启后只从本地读回已有卡面、不发请求；无效卡与停止后拒绝生成', async () => {
    const first = setup();
    assert.equal((await first.service.generate(CARD)).ok, true);
    const again = setup({ store: first.store });
    assert.equal(again.service.imageUrlFor('k1'), '');
    await until(() => Boolean(again.service.imageUrlFor('k1')));
    assert.deepEqual([again.calls.llm.length, again.calls.nai.length], [0, 0]);
    assert.equal((await again.service.generate({ cardId: 'k1' })).reason, 'card-art-invalid');
    again.service.stop();
    assert.equal((await again.service.generate(CARD)).reason, 'card-image-stopped');
    assert.equal(again.service.imageUrlFor('k1'), '');
    assert.deepEqual([again.calls.llm.length, again.calls.nai.length], [0, 0]);
});

