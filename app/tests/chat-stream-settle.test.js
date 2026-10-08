import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatStreamObserver, DEFAULT_IDLE_MS } from '../src/host/chat-stream-observer.js';

function harness() {
    const timers = new Map();
    let timerId = 0;
    let clock = 1000;
    const listeners = new Map();
    const created = [];
    const eventSource = {
        on(name, handler) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(handler); },
        off(name, handler) { listeners.set(name, (listeners.get(name) || []).filter((h) => h !== handler)); },
        emit(name, ...args) { for (const h of listeners.get(name) || []) h(...args); },
    };
    const globalObject = {
        setTimeout(handler, delay) { timerId += 1; timers.set(timerId, { handler, delay }); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        MutationObserver: class {
            constructor(handler) { this.handler = handler; created.push(this); }
            observe() {}
            disconnect() {}
        },
    };
    const observer = createChatStreamObserver({
        global: globalObject,
        document: { querySelector: () => ({}), defaultView: globalObject },
        eventSource,
        eventTypes: { GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended' },
        now: () => clock,
        onStable: () => true,
    });
    observer.start();
    return {
        observer, eventSource,
        mutate: () => created[0].handler([{ target: {} }]),
        advance: (ms) => { clock += ms; },
    };
}

test('gate:fullscreen-wait:settles-after-quiet-even-without-generation-started', () => {
    // 全屏发送后宿主没发 generation_started（quiet / 后台生成 / 版本差异），只有 #chat 变更：
    // 以前 hasGenerationSettled 永远为假，「正在生成」要挂满 120 秒硬超时。
    const h = harness();
    h.observer.prepareForReply();
    h.observer.noteActivity();
    h.mutate();
    assert.equal(h.observer.hasGenerationSettled(), false, '刚有变更时还在等');
    h.advance(DEFAULT_IDLE_MS - 1);
    assert.equal(h.observer.hasGenerationSettled(), false);
    h.advance(2);
    assert.equal(h.observer.hasGenerationSettled(), true, '静默超过 idle 窗口即视为结束');
});

test('gate:fullscreen-wait:active-generation-waits-longer-and-normal-path-unchanged', () => {
    const h = harness();
    h.observer.prepareForReply();
    h.eventSource.emit('generation_started', 'normal', {}, false);
    h.mutate();
    h.advance(DEFAULT_IDLE_MS * 2);
    assert.equal(h.observer.hasGenerationSettled(), false, '模型思考间隙不收起');
    h.eventSource.emit('generation_ended');
    assert.equal(h.observer.hasGenerationSettled(), true, '正常结束事件立即收起');
    // 新一轮发送重置静默计时。
    h.observer.prepareForReply();
    assert.equal(h.observer.hasGenerationSettled(), false);
});
