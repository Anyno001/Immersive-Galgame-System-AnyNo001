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
