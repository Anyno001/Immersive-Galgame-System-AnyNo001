import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, makeStage, makeTimers } from './helpers/fake-dom.js';
import { advanceChatReveal, applyChatToDom, cancelChatShow, getChatRevealState } from '../src/visual/igs-ui/chat-layer.js';
import { chatRevealDelayMs } from '../src/visual/igs-ui/chat-show-runtime.js';

// 假 DOM 没有 classList：补一个空壳，气泡弹出动画只加类名。
if (!Object.getOwnPropertyDescriptor(FakeEl.prototype, 'classList')) {
    Object.defineProperty(FakeEl.prototype, 'classList', { get() { return { add() {}, remove() {}, toggle() {}, contains() { return false; } }; } });
}

const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

function msg(text, side, displayName, extra = {}) {
    return { kind: 'msg', type: 'text', text, side, displayName, self: side === 'right', color: '#ffffff', textColor: '#000000', initial: '', ...extra };
}

function snapshotOf(messages, { tts = { enabled: true }, messageId = 'm1' } = {}) {
    return {
        messageId,
        content: { chatPage: true, currentIndex: 0, chat: { title: '', messages } },
        readerSettings: { chatShow: { enabled: true, revealMode: 'auto', typingIndicator: false, sound: { enabled: false } }, tts, _sceneAssets: { marker: 1 } },
    };
}

function fakeTts({ mode = 'pending' } = {}) {
    const calls = { speak: [], prefetch: [], cancel: 0, stop: 0 };
    const jobs = [];
    return {
        calls, jobs,
        speak(line) {
            calls.speak.push(line);
            if (mode === 'null') return null;
            if (mode === 'throw') throw new Error('boom');
            let finish;
            let fail;
            const done = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
            const job = { done, finish, fail, cancelled: false, cancel() { job.cancelled = true; calls.cancel += 1; finish(); } };
            jobs.push(job);
            return job;
        },
        prefetch(line) { calls.prefetch.push(line); },
        stop() { calls.stop += 1; },
    };
}

function setup(messages, options = {}) {
    const root = makeStage();
    const timers = makeTimers();
    const tts = options.tts === undefined ? fakeTts() : options.tts;
    const ctx = { setTimeout: timers.schedule, clearTimeout: timers.clear, userName: '主角', tts };
    const snapshot = snapshotOf(messages, options.snapshot);
    applyChatToDom(root, snapshot, ctx);
    return { root, timers, tts, ctx, snapshot, revealed: () => getChatRevealState(root).revealed };
}

const THREE = () => [msg('早上好', 'left', '小林'), msg('你也早', 'right', '我'), msg('今天去哪', 'left', '小林')];

test('朗读关闭时节奏与原来一致，也不调用朗读', async () => {
    const h = setup(THREE(), { snapshot: { tts: { enabled: false } } });
    assert.equal(h.revealed(), 0);
    h.timers.advance(250);
    assert.equal(h.revealed(), 1);
    h.timers.advance(chatRevealDelayMs('早上好', 'normal') - 1);
    assert.equal(h.revealed(), 1);
    h.timers.advance(1);
    assert.equal(h.revealed(), 2);
    assert.equal(h.tts.calls.speak.length, 0);
    assert.equal(h.tts.calls.stop, 0);
});

test('朗读开启：每条气泡出现时读本条，下一条等本条读完', async () => {
    const h = setup(THREE());
    h.timers.advance(250);
    assert.equal(h.revealed(), 1);
    assert.equal(h.tts.calls.speak.length, 1);
    const first = h.tts.calls.speak[0];
    assert.equal(first.text, '早上好');
    assert.equal(first.speaker, '小林');
    assert.equal(first.textType, 'dialogue');
    assert.equal(first.phone, false);
    assert.equal(first.key, 'm1:0:0');
    // 当前条播放时预取下一条。
    assert.equal(h.tts.calls.prefetch.length, 1);
    assert.equal(h.tts.calls.prefetch[0].text, '你也早');
    // 原延迟到了但还没读完：不出下一条。
    h.timers.advance(5000);
    assert.equal(h.revealed(), 1);
    assert.equal(getChatRevealState(h.root).pending, true);
    // 读完后立刻出下一条并读它（主角用主角名）。
    h.tts.jobs[0].finish();
    await flush();
    assert.equal(h.revealed(), 2);
    assert.equal(h.tts.calls.speak.length, 2);
    assert.equal(h.tts.calls.speak[1].speaker, '主角');
    assert.equal(h.tts.calls.speak[1].key, 'm1:0:1');
});

test('读得比原延迟短时仍按原延迟出下一条', async () => {
    const h = setup(THREE());
    h.timers.advance(250);
    h.tts.jobs[0].finish();
    await flush();
    assert.equal(h.revealed(), 1);
    h.timers.advance(chatRevealDelayMs('早上好', 'normal'));
    assert.equal(h.revealed(), 2);
});

test('朗读失败、被跳过、抛错、done 被拒绝都不卡住', async () => {
    for (const mode of ['null', 'throw']) {
        const h = setup(THREE(), { tts: fakeTts({ mode }) });
        h.timers.advance(250);
        h.timers.advance(chatRevealDelayMs('早上好', 'normal'));
        assert.equal(h.revealed(), 2, mode);
    }
    const h = setup(THREE());
    h.timers.advance(250);
    h.tts.jobs[0].fail(new Error('x'));
    await flush();
    h.timers.advance(chatRevealDelayMs('早上好', 'normal'));
    assert.equal(h.revealed(), 2);
});

test('朗读超过上限（15 秒）不再卡住下一条', async () => {
    const h = setup(THREE());
    h.timers.advance(250);
    h.timers.advance(14000);
    assert.equal(h.revealed(), 1);
    h.timers.advance(1000);
    assert.equal(h.revealed(), 2);
});

test('快进跳过：露出剩余气泡、停读、不补读', async () => {
    const h = setup(THREE());
    h.timers.advance(250);
    assert.equal(h.tts.calls.speak.length, 1);
    assert.equal(advanceChatReveal(h.root), true);
    assert.equal(h.revealed(), 3);
    assert.equal(h.tts.jobs[0].cancelled, true);
    assert.equal(h.tts.calls.speak.length, 1);
    h.timers.advance(60000);
    await flush();
    assert.equal(h.tts.calls.speak.length, 1);
});

test('重绘同一页不重读也不重置节奏；离开聊天页停读', async () => {
    const h = setup(THREE());
    h.timers.advance(250);
    applyChatToDom(h.root, h.snapshot, h.ctx);
    applyChatToDom(h.root, snapshotOf(THREE()), h.ctx);
    assert.equal(h.tts.calls.speak.length, 1);
    assert.equal(h.revealed(), 1);
    assert.equal(cancelChatShow(h.root), true);
    assert.equal(h.tts.jobs[0].cancelled, true);
});

test('撤回的原话正在读时，灰字出现就停掉', async () => {
    const recall = { kind: 'recall', text: '小林撤回了一条消息', original: '算了不说了', side: 'left', displayName: '小林', self: false, color: '#fff', textColor: '#000', initial: '' };
    const h = setup([msg('在吗', 'left', '小林'), recall, msg('没事', 'left', '小林')]);
    h.timers.advance(250);
    h.tts.jobs[0].finish();
    await flush();
    h.timers.advance(chatRevealDelayMs('在吗', 'normal'));
    assert.equal(h.revealed(), 2);
    assert.equal(h.tts.calls.speak[1].text, '算了不说了');
    h.timers.advance(1200);
    assert.equal(h.tts.jobs[1].cancelled, true);
});

test('图片、表情包气泡不朗读，节奏照旧', async () => {
    const h = setup([msg('[自拍]', 'left', '小林', { type: 'image' }), msg('哈哈', 'left', '小林')]);
    h.timers.advance(250);
    assert.equal(h.tts.calls.speak.length, 0);
    h.timers.advance(chatRevealDelayMs('[自拍]', 'normal'));
    assert.equal(h.revealed(), 2);
    assert.equal(h.tts.calls.speak.length, 1);
});

test('窗口缩放等重绘不掐掉正在读的气泡，也不提前出下一条', async () => {
    const h = setup(THREE());
    h.timers.advance(250);
    h.timers.advance(5000);
    const resized = snapshotOf(THREE());
    resized.content.chat = { title: '改了标题', messages: THREE() };
    applyChatToDom(h.root, resized, h.ctx);
    await flush();
    assert.equal(h.tts.jobs[0].cancelled, false);
    assert.equal(h.revealed(), 1);
    h.tts.jobs[0].finish();
    await flush();
    assert.equal(h.revealed(), 2);
});

test('气泡旁播放键：手动重念指定一条，不丢缓存，不翻页', async () => {
    const h = setup(THREE());
    h.timers.advance(250);
    const layer = h.root.querySelector('#igs-chat-layer');
    assert.equal(layer.getAttribute('data-igs-chat-tts'), 'system');
    const spoken = h.tts.calls.speak.length;
    const actions = [];
    h.ctx.handleReaderAction = (action) => actions.push(action);
    let stopped = false;
    const button = { getAttribute: (name) => (name === 'data-igs-chat-tts' ? 'play' : name === 'data-index' ? '2' : null) };
    const speakArgs = [];
    const realSpeak = h.tts.speak;
    h.tts.speak = (line, settings, assets, opts) => { speakArgs.push(opts); return realSpeak(line); };
    layer.fire('click', { target: { closest: (sel) => (sel === '.igs-chat-tts-btn' ? button : null) }, stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.deepEqual(actions, []);
    assert.equal(h.tts.calls.speak.length, spoken + 1);
    assert.equal(h.tts.calls.speak.at(-1).text, '今天去哪');
    assert.equal(speakArgs[0], undefined);
});

test('朗读开着时点画面空白处照常推进气泡，不被当成播放按钮', () => {
    const h = setup(THREE());
    h.timers.advance(250);
    const layer = h.root.querySelector('#igs-chat-layer');
    const actions = [];
    h.ctx.handleReaderAction = (action) => actions.push(action);
    const spoken = h.tts.calls.speak.length;
    // 真实 DOM 里空白处向上 closest 会命中带 data-igs-chat-tts 的聊天层本身。
    layer.fire('click', { target: { closest: (sel) => (sel === '[data-igs-chat-tts]' ? layer : null) } });
    assert.deepEqual(actions, ['next']);
    assert.equal(h.tts.calls.speak.length, spoken);
});

test('朗读关闭时气泡层不标记朗读，按钮隐藏', () => {
    const h = setup(THREE(), { snapshot: { tts: { enabled: false } } });
    assert.equal(h.root.querySelector('#igs-chat-layer').getAttribute('data-igs-chat-tts'), null);
});
