import test from 'node:test';
import assert from 'node:assert/strict';
import { createTtsRequestQueue } from '../src/visual/igs-ui/tts-request-queue.js';
import { clearTtsCache, decideTts, prefetchTtsFloor, prefetchTtsLine } from '../src/visual/igs-ui/tts.js';
import { prepareTtsFloorPlan, ttsFloorLines, ttsPageHint } from '../src/visual/igs-ui/tts-floor-plan.js';
import { createTtsFloorPreloader } from '../src/visual/igs-ui/tts-floor-preloader.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const audio = () => Uint8Array.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]).buffer;
const settings = { enabled: true, provider: 'api', api: {
    format: 'fish', endpoint: 'https://tts.test', model: 's2.1-pro-free', female: 'voice-f', male: 'voice-m', narrator: 'voice-n', prefetchFloor: true,
} };
const sceneAssets = { enabled: true, characterDna: { 甲: { triggerWords: '1girl' }, 乙: { triggerWords: '1boy' } } };
const line = text => ({ textType: 'narration', text });
const response = () => ({ ok: true, headers: new Headers({ 'content-type': 'audio/mpeg' }), arrayBuffer: async () => audio() });

test('请求直到音频体读完才释放并发槽，播放插队并合并已经排队的同句', async t => {
    const original = globalThis.fetch;
    const started = [], pending = [];
    let active = 0, peak = 0;
    globalThis.fetch = async (_url, init) => {
        const text = JSON.parse(init.body).text;
        started.push(text); active++; peak = Math.max(peak, active);
        return { ok: true, arrayBuffer: () => new Promise((resolve, reject) => {
            let done = false;
            const finish = error => {
                if (done) return;
                done = true; active--;
                error ? reject(error) : resolve(audio());
            };
            init.signal.addEventListener('abort', () => finish(new Error('已取消')), { once: true });
            pending.push(() => finish());
        }) };
    };
    const controller = new AbortController();
    t.after(async () => { controller.abort(); pending.splice(0).forEach(done => done()); await flush(); globalThis.fetch = original; await clearTtsCache(); });
    await clearTtsCache();
    const pages = Array.from({ length: 10 }, (_, index) => ({ line: line(`这是第${index}页。`) }));
    const floor = prefetchTtsFloor(pages, settings, sceneAssets, { signal: controller.signal });
    await flush();
    assert.equal(started.length, 5, '收到响应头不能提前释放槽位');
    const urgent = prefetchTtsLine(pages[9].line, settings, sceneAssets, { priority: 0, releases: [] });
    pending.shift()();
    await flush();
    assert.equal(started[5], '[calm, steady narration] 这是第9页。');
    for (let i = 0; i < 10; i++) { pending.splice(0).forEach(done => done()); await flush(); }
    assert.equal(await floor, 10);
    assert.ok(await urgent);
    assert.equal(started.length, 10, '当前播放与整楼预取只生成同一句一次');
    assert.equal(peak, 5);
});

test('全楼长句分段仍共享五路并发，取消后不再发送排队的段', async t => {
    const original = globalThis.fetch;
    const controller = new AbortController();
    const started = [], aborts = [];
    globalThis.fetch = async (_url, init) => {
        started.push(JSON.parse(init.body).text);
        return { ok: true, arrayBuffer: () => new Promise((_resolve, reject) => {
            const abort = () => reject(new Error('已取消'));
            aborts.push(abort);
            init.signal.addEventListener('abort', abort, { once: true });
        }) };
    };
    t.after(async () => { controller.abort(); aborts.forEach(abort => abort()); await flush(); globalThis.fetch = original; await clearTtsCache(); });
    await clearTtsCache();
    const pages = Array.from({ length: 8 }, (_, i) => ({ line: line(Array.from({ length: 5 }, (_, n) => `第${i}页第${n}段是足够长的一句话。`).join('')) }));
    const task = prefetchTtsFloor(pages, settings, sceneAssets, { signal: controller.signal });
    await flush(); assert.equal(started.length, 5);
    controller.abort();
    await task; await flush();
    assert.equal(started.length, 5);
});

test('没有持久缓存时预生成七十页，回到首页仍命中当前楼音频', async t => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return response(); };
    t.after(async () => { globalThis.fetch = original; await clearTtsCache(); });
    await clearTtsCache();
    const pages = Array.from({ length: 70 }, (_, i) => ({ line: line(`缓存第${i}页。`) }));
    assert.equal(await prefetchTtsFloor(pages, settings, sceneAssets), 70);
    assert.equal(calls, 70);
    assert.ok(await prefetchTtsLine(pages[0].line, settings, sceneAssets));
    assert.equal(calls, 70, '全楼缓存不被六十条普通内存缓存的淘汰挤掉');
    await clearTtsCache();
    await prefetchTtsLine(pages[0].line, settings, sceneAssets);
    assert.equal(calls, 71, '清理缓存同时清理当前楼的保留副本');
});

test('限流遵守服务端退避，取消排队任务不占用后续请求', async () => {
    let clock = 0, sequence = 0, calls = 0;
    const timers = new Map();
    const queue = createTtsRequestQueue({ concurrency: 1, now: () => clock, retryDelay: 20, timers: {
        setTimeout(fn, ms) { timers.set(++sequence, { fn, at: clock + ms }); return sequence; },
        clearTimeout(id) { timers.delete(id); },
    } });
    const first = queue.enqueue(async () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error('限流'), { status: 429, retryAfterMs: 80000 });
        return '完成';
    });
    const controller = new AbortController();
    const cancelled = queue.enqueue(() => assert.fail('取消的任务不应发请求'), { signal: controller.signal });
    const rejected = assert.rejects(cancelled.promise, /已取消/);
    await flush();
    controller.abort(); await rejected;
    assert.equal(calls, 1);
    clock = 79999;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    await flush(); assert.equal(calls, 1);
    clock = 80000;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    assert.equal(await first.promise, '完成');
    assert.equal(calls, 2);
});

test('预生成沿用实际分页的角色、情绪、心里话和独立旁白，并展开聊天气泡', async t => {
    const original = globalThis.fetch;
    const sent = [];
    globalThis.fetch = async (_url, init) => { sent.push({ model: init.headers.model, ...JSON.parse(init.body) }); return response(); };
    t.after(async () => { globalThis.fetch = original; await clearTtsCache(); });
    await clearTtsCache();
    const readerSettings = { tts: { ...settings, narratorApi: { enabled: true, ...settings.api, voice: 'separate-narrator' } },
        _sceneAssets: sceneAssets, chatShow: { enabled: true } };
    const floor = { messageId: 8, text: '[igs-char:甲|害羞|你好呀。]\n[igs-thought:乙|思考|今天应该怎么做呢。]\n夜色渐深。\n[igs-chat:讨论]\n[igs-msg:甲|明天见。]\n[igs-msg:乙|好的。]\n[igs-chat-end]' };
    const prepared = prepareTtsFloorPlan(floor, readerSettings, { sourceFilter: { enabled: false } });
    const pages = ttsFloorLines(prepared, readerSettings);
    assert.equal(pages.length, 5);
    const expected = pages.map(({ line }) => decideTts({}, line, readerSettings.tts, { sceneAssets, record: false }));
    assert.ok(expected.every(Boolean));
    assert.equal(await prefetchTtsFloor(pages, readerSettings.tts, sceneAssets), 5);
    for (const plan of expected) {
        const actual = sent.find(item => item.text === plan.text);
        assert.ok(actual, plan.text);
        assert.equal(actual.reference_id, plan.voice);
        assert.equal(actual.model, 's2.1-pro-free');
    }
    for (const page of pages) await prefetchTtsLine(page.line, readerSettings.tts, sceneAssets);
    assert.equal(sent.length, 5, '实际朗读请求复用所有已生成音频');
    const whisper = ttsPageHint({ textType: 'dialogue', fx: { romance: 'close' }, bubbleSpeaker: '甲' }, null, readerSettings);
    assert.equal(typeof whisper.whisper, 'boolean');
});

test('楼层完成在阅读器关闭时起跑，打开同楼复用缓存，中途启用也补齐整楼', async t => {
    const original = globalThis.fetch;
    const sent = [];
    globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body).text); return response(); };
    let ready;
    const raw = '[igs-char:甲|喜悦|第一句话。]\n[igs-char:乙|平和|第二句话。]\n普通旁白。';
    const floor = { chatId: 'test-chat', messageId: 8, swipeId: 0, isAi: true, text: raw };
    const host = createIgsReaderHost({ global: {}, pageRenderGapMs: 0,
        getUnifiedSettings: () => ({ readerSettings: { titleScreen: false, tts: settings }, bridge: { sceneAssets, sourceFilter: { enabled: false } } }),
        getCurrentChatId: () => 'test-chat', readTtsFloor: id => id === 8 ? floor : null,
        onTtsFloorReady(handler) { ready = handler; return () => { ready = null; }; },
    });
    t.after(async () => { host.destroy(); globalThis.fetch = original; await clearTtsCache(); });
    await clearTtsCache();
    await ready(floor);
    assert.equal(host.getState().activeReader, null);
    assert.equal(sent.length, 3, '不需要先退出等待或打开阅读器');
    assert.equal(host.openReader({ messageId: 8, raw }, { mode: 'pc', skipTitle: true }).ok, true);
    await flush();
    assert.equal(sent.length, 3);
    host.destroy();
    await clearTtsCache(); sent.length = 0;
    let enabled = false, settingsChanged;
    const opened = createIgsReaderHost({ global: {}, getCurrentChatId: () => 'test-chat',
        getUnifiedSettings: () => ({ readerSettings: { titleScreen: false, tts: { ...settings, api: { ...settings.api, prefetchFloor: enabled } } }, bridge: { sceneAssets, sourceFilter: { enabled: false } } }),
        onSettingsUpdated(handler) { settingsChanged = handler; return () => {}; },
    });
    t.after(() => opened.destroy());
    opened.openReader({ messageId: 8, raw }, { mode: 'pc', skipTitle: true });
    await flush();
    assert.equal(sent.length, 0);
    enabled = true; settingsChanged();
    await new Promise(resolve => setTimeout(resolve, 180));
    await flush();
    assert.equal(sent.length, 3, '已有楼层开启整楼预载时也启动');
});

test('同楼重绘只启动一次，修改音色或回复分支会取消旧任务并重新准备', async () => {
    const tasks = [];
    const preloader = createTtsFloorPreloader({ prefetch(_lines, _settings, _assets, options) {
        tasks.push(options);
        return new Promise(resolve => options.signal.addEventListener('abort', () => resolve(0), { once: true }));
    } });
    const readerSettings = { tts: settings, _sceneAssets: sceneAssets };
    const prepared = prepareTtsFloorPlan({ messageId: 8, text: '正文。' }, readerSettings, { sourceFilter: { enabled: false } });
    const a = preloader.startPrepared(prepared, readerSettings, { identity: 'chat|8|0' });
    assert.equal(preloader.startPrepared(prepared, readerSettings, { identity: 'chat|8|0' }), a);
    assert.equal(tasks.length, 1);
    preloader.startPrepared(prepared, { ...readerSettings, tts: { ...settings, api: { ...settings.api, narrator: 'changed' } } }, { identity: 'chat|8|0' });
    assert.equal(tasks[0].signal.aborted, true);
    preloader.startPrepared(prepared, readerSettings, { identity: 'chat|8|1' });
    assert.equal(tasks[1].signal.aborted, true);
    preloader.dispose();
    assert.equal(tasks[2].signal.aborted, true);
});

test('实际宿主完成事件连接语音预载，静默生成与中止的回复不合成', async t => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return response(); };
    const listeners = new Map();
    const types = Object.fromEntries(['CHAT_CHANGED', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHARACTER_MESSAGE_RENDERED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED'].map(name => [name, name]));
    const events = {
        on(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
        off(name, handler) { listeners.get(name)?.delete(handler); },
        emit(name, ...args) { for (const handler of listeners.get(name) || []) handler(...args); },
    };
    const ctx = { getCurrentChatId: () => 'host-events', eventSource: events, event_types: types, chat: [{ mes: '<content>第一句。</content>' }] };
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({ sourceFilter: { enabled: false }, sceneAssets }),
        'igs-reader-settings-v9-default': JSON.stringify({ tts: settings }),
    });
    const vn = bootstrapIGS({ global: { localStorage: storage, SillyTavern: { getContext: () => ctx } }, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    t.after(async () => { vn.destroy(); await flush(); globalThis.fetch = original; await clearTtsCache(); });
    await clearTtsCache();
    events.emit('GENERATION_STARTED', 'normal', {}, false);
    events.emit('GENERATION_ENDED', 0);
    await flush(); await flush();
    assert.equal(calls, 1);
    ctx.chat[0].mes = '<content>静默内容。</content>';
    events.emit('GENERATION_STARTED', 'quiet', {}, false);
    events.emit('GENERATION_ENDED', 0);
    await flush(); assert.equal(calls, 1);
    events.emit('GENERATION_STARTED', 'normal', {}, false);
    events.emit('GENERATION_STOPPED');
    events.emit('GENERATION_ENDED', 0);
    await flush(); assert.equal(calls, 1);
});
