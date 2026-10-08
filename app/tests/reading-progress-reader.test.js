import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { createIllustrationMessageHost } from '../src/host/illustration-message-host.js';

// 阅读进度接进阅读器：刚打开不冲掉书签、翻页切轮才记、续读回到原楼原页、旧楼末页进下一楼、Home/End 对应的首楼/最新。
function setup(chatMetadata = null) {
    const messages = [0, 2, 4, 6].map((id) => ({ id, text: `[角色: 艾莉]\n艾莉: 第${id}楼第一句。\n第${id}楼第二句。\n第${id}楼第三句。` }));
    const storage = createMemoryStorage({});
    const saved = [];
    const global = { localStorage: storage };
    if (chatMetadata) {
        global.SillyTavern = { getContext: () => ({ chatMetadata, saveMetadata: async () => { saved.push(JSON.parse(JSON.stringify(chatMetadata))); } }) };
    }
    const vn = bootstrapIGS({
        global,
        autoAttachMagicWand: false,
        illustrationMessageHost: { ...createIllustrationMessageHost(global), getChatId: () => 'chat-progress' },
        hostAdapter: {
            getCurrentMessage: async () => messages[messages.length - 1],
            getMessageById: async (messageId) => messages.find((message) => message.id === Number(messageId)) || null,
            getAdjacentMessage: async (messageId, delta) => {
                const index = messages.findIndex((message) => message.id === Number(messageId));
                return index < 0 ? null : messages[index + (delta < 0 ? -1 : 1)] || null;
            },
            listTurns: async () => messages,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    return { vn, storage, saved, messages };
}

const readStored = (storage) => JSON.parse(storage.getItem('igs-reading:chat-progress') || 'null');

test('gate:reading-progress:open-does-not-overwrite-then-navigation-records', async () => {
    const { vn, storage } = setup();
    storage.setItem('igs-reading:chat-progress', JSON.stringify({ last: { id: 2, page: 1, at: 1 } }));
    const opened = await vn.openLatestAvailable('pc');
    assert.equal(opened.reader.snapshot.messageId, 6);
    assert.equal(readStored(storage).last.id, 2, '刚打开停在最新楼不冲掉书签');

    const resumed = await opened.reader.controller.invokeAction('resume-reading');
    assert.equal(resumed.moved, true);
    assert.equal(resumed.messageId, 2);
    const state = vn.getState().igsUi.activeReader;
    assert.equal(state.snapshot.messageId, 2);
    assert.equal(state.snapshot.content.currentIndex, 1);
    assert.deepEqual([readStored(storage).last.id, readStored(storage).last.page], [2, 1]);
    vn.destroy();
});

test('gate:reading-progress:last-page-of-old-floor-continues-to-next-floor', async () => {
    const { vn, storage } = setup();
    const opened = await vn.openLatestAvailable('pc');
    let result = await opened.reader.controller.invokeAction('turn-first');
    assert.equal(result.messageId, 0);
    // 直接翻到最后一页再点下一页。
    const controller = () => vn.getState().igsUi.activeReader;
    await opened.reader.controller.invokeAction('last-page');
    assert.equal(readStored(storage).read, '0', '读到最后一页算读完');
    const next = await opened.reader.controller.invokeAction('next');
    assert.equal(next.moved, true);
    assert.equal(controller().snapshot.messageId, 2);
    const latest = await opened.reader.controller.invokeAction('turn-latest');
    assert.equal(latest.messageId, 6);
    vn.destroy();
});

test('gate:reading-progress:close-syncs-chat-metadata-once', async () => {
    const meta = {};
    const { vn, saved } = setup(meta);
    const opened = await vn.openLatestAvailable('pc');
    await opened.reader.controller.invokeAction('turn-first');
    vn.getState();
    await opened.reader.controller.invokeAction('close');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].igs_reading.last.id, 0);
    vn.destroy();
});
