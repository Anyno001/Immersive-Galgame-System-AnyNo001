import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatStreamObserver } from '../src/host/chat-stream-observer.js';

// 回归：生成结束后别的插件仍在改 #chat，稳定回调读楼期间版本号被推进，结果作废、永远不退出等待。
test('流式结束：结束后外部改动不应让稳定回调一直作废', async () => {
    const listeners = new Map();
    const eventSource = {
        on(n, h) { if (!listeners.has(n)) listeners.set(n, []); listeners.get(n).push(h); },
        off() {},
        emit(n, ...a) { for (const h of listeners.get(n) || []) h(...a); },
    };
    const timers = new Map(); let seq = 0;
    let mutate = () => {};
    const chat = { id: 'chat' };
    const doc = { querySelector: (s) => (s === '#chat' ? chat : null), getElementById: () => null, defaultView: null };
    const g = {
        setTimeout: (h, d) => { timers.set(++seq, { h, d }); return seq; },
        clearTimeout: (id) => timers.delete(id),
        MutationObserver: class { constructor(h) { mutate = () => h([{ target: chat, addedNodes: [], removedNodes: [] }]); } observe() {} disconnect() {} },
        document: doc,
    };
    let applied = 0;
    const obs = createChatStreamObserver({
        global: g, eventSource, eventTypes: { GENERATION_STARTED: 's', GENERATION_ENDED: 'e', GENERATION_STOPPED: 'x' },
        onStable: async ({ revision }) => {
            mutate(); // 读楼期间别的插件改了楼层按钮
            await Promise.resolve();
            if (!obs.isCurrentRevision(revision)) return false;
            applied += 1;
            return true;
        },
    });
    obs.start();
    eventSource.emit('s', 'normal', {}, false);
    mutate();
    eventSource.emit('e');
    for (let i = 0; i < 6 && !applied; i += 1) {
        const entry = [...timers].sort((a, b) => a[1].d - b[1].d)[0];
        if (!entry) break;
        timers.delete(entry[0]); entry[1].h();
        for (let k = 0; k < 5; k += 1) await new Promise((r) => setImmediate(r));
    }
    assert.equal(applied, 1);
});

test('P9 正文最终落地触发：流式延迟落库、非流式去重、编辑与新 swipe 重算及跳过后台模型事件', async () => {
    const { createIllustrationMessageHost } = await import('../src/host/illustration-message-host.js');
    const { runBackgroundGeneration } = await import('../src/host/background-generation.js');
    const listeners = new Map();
    const emit = (event, ...args) => { for (const fn of [...(listeners.get(event) || [])]) fn(...args); };
    const chat = [
        { is_user: true, mes: '你好' },
        { is_user: false, mes: '', swipe_id: 0 },
    ];
    let chatId = 'p9-floor-chat';
    const ctx = {
        chat,
        getCurrentChatId: () => chatId,
        eventTypes: {
            GENERATION_STARTED: 'gs',
            GENERATION_ENDED: 'ge',
            GENERATION_STOPPED: 'gx',
            MESSAGE_RECEIVED: 'mr',
            CHARACTER_MESSAGE_RENDERED: 'cmr',
            MESSAGE_UPDATED: 'mu',
            MESSAGE_EDITED: 'me',
            MESSAGE_SWIPED: 'ms',
            CHAT_CHANGED: 'cc',
        },
        eventSource: {
            on(n, h) { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(h); },
            removeListener(n, h) { listeners.get(n)?.delete(h); },
        },
    };
    const host = createIllustrationMessageHost({ SillyTavern: { getContext: () => ctx } });
    const fired = [];
    const off = host.onImageFloorReady((id, meta) => fired.push({ id, text: meta?.text, swipeId: meta?.swipeId, eventKey: meta?.eventKey }));

    // 1) 流式场景：GENERATION_ENDED 先于最终正文落库到达，正文为空时不派发；随后 MESSAGE_UPDATED 落库后只派发一次
    emit('gs', 'normal', {}, false);
    emit('ge', 1);
    await Promise.resolve();
    assert.equal(fired.length, 0, '流式正文尚未落库时不得提前派发');
    chat[1].mes = '最终流式正文内容。';
    emit('mu', 1);
    emit('cmr', 1);
    assert.equal(fired.length, 1, 'UPDATED 与紧随其后的 RENDERED 同内容合并为一次');
    assert.equal(fired[0].id, 1);
    assert.equal(fired[0].text, '最终流式正文内容。');

    // 2) 非流式场景：RECEIVED + RENDERED 在 ENDED 之前到达，合并去重只派发一次
    chat.push({ is_user: true, mes: '继续' });
    chat.push({ is_user: false, mes: '非流式最终正文。', swipe_id: 0 });
    emit('gs', 'normal', {}, false);
    emit('mr', 3);
    emit('cmr', 3);
    assert.equal(fired.length, 1, '生成尚未结束前暂缓派发');
    emit('ge', 3);
    await Promise.resolve();
    assert.equal(fired.length, 2);
    emit('cmr', 3);
    assert.equal(fired.length, 2, 'ENDED 后重复 RENDERED 同修订去重');

    // 3) 编辑与新 swipe 按新内容修订重新派发
    chat[3].mes = '编辑后的正文。';
    emit('me', 3);
    assert.equal(fired.length, 3);
    assert.equal(fired[2].text, '编辑后的正文。');
    chat[3].swipe_id = 1;
    chat[3].mes = '新的分支正文。';
    emit('ms', 3);
    assert.equal(fired.length, 4);
    assert.equal(fired[3].swipeId, 1);

    // 4) 后台模型事件被跳过，防止递归
    await runBackgroundGeneration(async () => {
        emit('gs', 'quiet', {}, false);
        emit('mu', 3);
        emit('ge', 3);
        await Promise.resolve();
    });
    assert.equal(fired.length, 4, '后台生成事件不得触发派发');

    off();
    host.destroy();
});

test('P9 启动 3 秒可取消缓冲、合并切聊天与设置、战斗开启自动完整启用数值系统', async (t) => {
    const { bootstrapIGS } = await import('../src/core/bootstrap.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const { JSDOM } = await import('jsdom');

    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://igs.invalid/' });
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    let chatId = 'chat-initial';
    const listeners = new Map();
    const emit = (k, ...args) => { for (const fn of [...(listeners.get(k) || [])]) fn(...args); };
    const ctx = {
        name1: '艾拉',
        name2: '小雪',
        chat: [{ is_user: true, mes: '开场' }, { is_user: false, mes: '世界展开。', swipe_id: 0 }],
        chatMetadata: {},
        extensionPrompts: {},
        saveMetadata() {},
        getCurrentChatId: () => chatId,
        eventTypes: { CHAT_CHANGED: 'cc', GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx' },
        eventSource: {
            on(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); },
            removeListener(k, fn) { listeners.get(k)?.delete(fn); },
        },
        setExtensionPrompt(k, value) { ctx.extensionPrompts[k] = { value }; },
    };
    // 冷启动配置：战斗开启，但 stats.enabled 未开启 -> 冷启动装配必须自动完整启用数值系统
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            autoIllustration: { llm: { source: 'custom', endpoint: 'https://example.invalid/v1', apiKey: 'k', model: 'm' } },
            stats: { enabled: false, sheetGen: 'off', backfill: 'off', autoSkill: false },
        }),
        'igs-reader-settings-v9-default': JSON.stringify({ combatExpansion: { enabled: true, kind: 'combat' } }),
    });
    const requests = [];
    const globalObj = {
        document: dom.window.document,
        localStorage: storage,
        AutoCardUpdaterAPI: db.api,
        SillyTavern: { getContext: () => ctx },
        Event: dom.window.Event,
        CustomEvent: dom.window.CustomEvent,
        dispatchEvent: dom.window.dispatchEvent.bind(dom.window),
        addEventListener: dom.window.addEventListener.bind(dom.window),
        removeEventListener: dom.window.removeEventListener.bind(dom.window),
    };
    const makeOpts = () => ({
        global: globalObj,
        autoAttachMagicWand: false,
        secondaryLlm: { request: async (prompt) => { requests.push({ chatId, prompt }); return new Promise(() => {}); } },
    });

    t.mock.timers.enable({ apis: ['setTimeout'] });
    const app1 = bootstrapIGS(makeOpts());
    // 1) bootstrapIGS 同步返回，openSettings/shutdown 契约不变，且缓冲期内不发业务模型请求
    assert.equal(app1.getState().startupStatus, 'buffering');
    const settings1 = app1.openSettings({ page: 'combat' });
    assert.equal(settings1.ok, true);
    assert.equal(settings1.controller.getSnapshot().draft.bridge.stats.enabled, true, '冷启动战斗开启时数值系统自动启用');
    assert.equal(settings1.controller.close().ok, true);
    assert.equal(requests.length, 0);

    // 2) 缓冲期内切聊天、改设置，合并为到期按最新聊天启动；销毁立即取消 timer 且不得唤醒新实例
    chatId = 'chat-switched';
    emit('cc', chatId);
    t.mock.timers.tick(2999);
    assert.equal(requests.length, 0, '未满 3 秒缓冲不得提前发请求');
    await app1.shutdown();
    t.mock.timers.tick(5000);
    assert.equal(requests.length, 0, '销毁后旧启动缓冲定时器不得触发');

    // 3) 重建新实例，到期后按最新聊天身份 chat-switched 启动，且保存开启战斗会持久化写入 stats.enabled=true
    const storage2 = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            autoIllustration: { llm: { source: 'custom', endpoint: 'https://example.invalid/v1', apiKey: 'k', model: 'm' } },
            stats: { enabled: false, sheetGen: 'off', backfill: 'off', autoSkill: false },
        }),
        'igs-reader-settings-v9-default': JSON.stringify({ combatExpansion: { enabled: false, kind: 'combat' } }),
    });
    const app2 = bootstrapIGS({
        ...makeOpts(),
        global: { ...globalObj, localStorage: storage2 },
    });
    t.after(async () => { await app2.shutdown(); dom.window.close(); });
    assert.equal(app2.getState().startupStatus, 'buffering');
    // 在缓冲期内通过设置页保存开启战斗 -> 自动持久化 stats.enabled=true 且仍在缓冲期不提前请求
    const settings2 = app2.openSettings({ page: 'combat' });
    assert.equal(settings2.ok, true);
    assert.equal(settings2.controller.setValue('readerSettings.combatExpansion.enabled', true).ok, true);
    assert.equal(settings2.controller.close().ok, true);
    assert.equal(JSON.parse(storage2.getItem('igs_bridge_config')).stats.enabled, true, '开启战斗设置保存时必须持久化启用数值');
    assert.equal(requests.length, 0);
    t.mock.timers.tick(3000);
    for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve));
    assert.equal(app2.getState().startupStatus, 'ready');
    assert.ok(requests.length >= 1, '缓冲到期后应启动主角与战斗准备');
    assert.ok(requests.every(r => r.chatId === 'chat-switched'), '到期只按当时最新聊天启动');
});
