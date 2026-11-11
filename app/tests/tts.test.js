import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyTts,
    cancelPendingTts,
    prefetchTtsBubble,
    buildTtsRequest,
    clearTtsCache,
    fetchTtsVoices,
    findSystemVoice,
    jsonPathGet,
    mergeTtsVoices,
    onSystemVoicesChanged,
    parseGptSovitsVoice,
    matchBatchVoicesToCharacters,
    parseTtsVoiceBatch,
    parseTtsResponse,
    splitTtsSegments,
    decideTts,
    editTtsVoices,
    guessTtsLine,
    normalizeTtsSettings,
    prefetchTts,
    resolveTtsApiFormat,
    resolveTtsVoice,
    toggleVoicePool,
    clearTtsGenderCache,
    getTtsLastDecision,
    trimTtsCache,
    splitTtsChunks,
    stripSpeakerPrefix,
    systemVoiceGender,
    systemVoiceOptions,
    systemVoicePool,
    ttsApiVoiceList,
    ttsVoiceEntries,
    ttsCacheKey,
    ttsErrorMessage,
    ttsPlainText,
    ttsSpeechUrl,
} from '../src/visual/igs-ui/tts.js';

// Windows 上 Edge 常见的中文声音（在线自然声 + 本地 SAPI）。
const v = (name, lang) => ({ name, lang });
const WIN_VOICES = [
    v('Microsoft Huihui - Chinese (Simplified, PRC)', 'zh-CN'),
    v('Microsoft Kangkang - Chinese (Simplified, PRC)', 'zh-CN'),
    v('Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', 'zh-CN'),
    v('Microsoft Xiaoyi Online (Natural) - Chinese (Mainland)', 'zh-CN'),
    v('Microsoft Yunxi Online (Natural) - Chinese (Mainland)', 'zh-CN'),
    v('Microsoft Yunjian Online (Natural) - Chinese (Mainland)', 'zh-CN'),
    v('Microsoft Xiaobei Online (Natural) - Chinese (Northeastern Mandarin)', 'zh-CN-liaoning'),
    v('Microsoft Nanami Online (Natural) - Japanese (Japan)', 'ja-JP'),
    v('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
];
const ON = { enabled: true };
const assets = (dna = {}, characterVoices = {}) => ({ characterDna: dna, characterVoices });
const GIRL = { triggerWords: '1girl, long hair' };
const BOY = { triggerWords: '1boy, short hair' };

test('gate: settings keep tts and voice barks mutually exclusive, and save a per-character tts voice', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const vn = bootstrapIGS({ global: {}, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'reader', mode: 'pc' }).controller;
        const reader = () => controller.getSnapshot().draft.readerSettings;
        controller.setValue('readerSettings.voiceBark.enabled', true);
        controller.toggle('readerSettings.tts.enabled');
        assert.equal(reader().tts.enabled, true);
        assert.equal(reader().voiceBark.enabled, false);
        controller.toggle('readerSettings.voiceBark.enabled');
        assert.equal(reader().voiceBark.enabled, true);
        assert.equal(reader().tts.enabled, false);
        controller.toggle('readerSettings.tts.enabled');
        controller.setValue('readerSettings.tts.provider', 'api');
        controller.setValue('readerSettings.tts.api.voices', 'alex, anna');
        controller.setValue('bridge.sceneAssets.characters', { 雷恩: { 默认: '' } });
        await controller.invoke(`scene-toggle-dna:${encodeURIComponent('雷恩')}`);
        await controller.invoke(`ui-pick-open:${encodeURIComponent('char-setup:雷恩=voice')}`);
        const name = encodeURIComponent('雷恩');
        await controller.invoke(`char-voice:tts:${name}:alex`);
        assert.deepEqual(controller.getSnapshot().draft.bridge.sceneAssets.characterVoices, { 雷恩: { pack: '', pitch: 0, speed: 1, tts: 'alex' } });
        controller.switchTab('scene');
        const html = controller.switchSceneSubTab('characters').html || controller.getSnapshot().html;
        assert.match(html, /data-char-voice-tts=/);
        assert.match(html, /value="alex" selected/);
        controller.close();
    } finally {
        vn.destroy();
    }
});

const apiOf = (extra = {}) => normalizeTtsSettings({ provider: 'api', api: extra }).api;
const asJson = (req) => JSON.parse(req.body);

test('gate: tts minimax response decodes hex audio and reports api errors', async () => {
    const api = apiOf({ format: 'minimax' });
    const ok = { text: async () => JSON.stringify({ data: { audio: '4944330001ff' }, base_resp: { status_code: 0 } }) };
    assert.deepEqual(Array.from(new Uint8Array(await parseTtsResponse(api, ok))), [0x49, 0x44, 0x33, 0, 1, 0xff]);
    const bad = { text: async () => JSON.stringify({ base_resp: { status_code: 1004, status_msg: 'auth failed' } }) };
    await assert.rejects(parseTtsResponse(api, bad), /1004.*auth failed/);
    const odd = { text: async () => JSON.stringify({ data: { audio: 'xyz' }, base_resp: { status_code: 0 } }) };
    await assert.rejects(parseTtsResponse(api, odd), /hex/);
});

test('gate: tts custom request escapes template values and reads the json path', async () => {
    const api = apiOf({
        format: 'custom', customMethod: 'POST', customUrl: 'https://h.test/say?q={{text}}',
        customHeaders: '{"X-Voice": "{{voice}}"}', customBody: '{"text": "{{text}}", "voice": "{{voice}}", "speed": {{speed}}, "lang": "{{lang}}", "model": "{{model}}"}',
        customResponse: 'json-base64', customPath: 'data.items[0].audio', model: 'mm', apiKey: 'sk',
    });
    const req = buildTtsRequest(api, { text: '他说"你好"\n再见 & 走', voice: 'v"1', rate: 1.5, lang: 'zh' });
    assert.equal(req.url, `https://h.test/say?q=${encodeURIComponent('他说"你好"\n再见 & 走')}`);
    const body = asJson(req);
    assert.equal(body.text, '他说"你好"\n再见 & 走');
    assert.equal(body.voice, 'v"1');
    assert.equal(body.speed, 1.5);
    assert.equal(body.model, 'mm');
    assert.equal(req.headers['X-Voice'], 'v"1');
    assert.equal(req.headers.Authorization, 'Bearer sk');
    assert.equal(req.headers['Content-Type'], 'application/json');
    assert.throws(() => buildTtsRequest({ ...api, customBody: '{"text": {{text}} oops' }, { text: 'a', voice: '', rate: 1 }), /请求体/);
    assert.throws(() => buildTtsRequest({ ...api, customHeaders: 'nope' }, { text: 'a', voice: '', rate: 1 }), /请求头/);
    assert.equal(jsonPathGet({ data: { items: [{ audio: 'QQ==' }] } }, 'data.items[0].audio'), 'QQ==');
    assert.equal(jsonPathGet({ a: 1 }, 'a.b'), undefined);
    const res = { text: async () => JSON.stringify({ data: { items: [{ audio: 'data:audio/mp3;base64,QUJD' }] } }) };
    assert.equal(new TextDecoder().decode(await parseTtsResponse(api, res)), 'ABC');
    const hex = { ...api, customResponse: 'json-hex', customPath: 'a' };
    assert.equal(new TextDecoder().decode(await parseTtsResponse(hex, { text: async () => '{"a":"414243"}' })), 'ABC');
    await assert.rejects(parseTtsResponse({ ...api, customPath: 'nope' }, res), /没有找到音频/);
    const direct = new ArrayBuffer(3);
    assert.equal(await parseTtsResponse({ ...api, customResponse: 'audio' }, { arrayBuffer: async () => direct }), direct);
    const realFetch = globalThis.fetch;
    const fetched = [];
    globalThis.fetch = async (url) => { fetched.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(5) }; };
    try {
        const out = await parseTtsResponse({ ...api, customResponse: 'json-url', customPath: 'u' }, { text: async () => '{"u":"https://cdn.test/a.mp3"}' });
        assert.equal(out.byteLength, 5);
        assert.deepEqual(fetched, ['https://cdn.test/a.mp3']);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('gate: tts custom request only escapes json bodies', () => {
    const base = apiOf({ format: 'custom', customUrl: 'https://h.test/x', customBody: 'text={{text}}&v={{voice}}', customHeaders: '{"Content-Type": "application/x-www-form-urlencoded"}' });
    const form = buildTtsRequest(base, { text: '说"好"\n行', voice: 'v', rate: 1 });
    assert.equal(form.body, 'text=说"好"\n行&v=v');
    assert.equal(form.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.throws(() => buildTtsRequest({ ...base, customHeaders: '' }, { text: 'a', voice: 'v', rate: 1 }), /请求体/);
    assert.notEqual(
        ttsCacheKey('u', { model: 'm', sendSpeed: true }, 'v', '你好'),
        ttsCacheKey('u', { model: 'm', sendSpeed: false }, 'v', '你好'),
    );
});

// —— 第三轮：不出声类问题的兜底 ——
const flushAll = async () => {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
};
const AUDIO_BYTES = () => Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]).buffer;
const apiPlan = (text = '你好，今天天气不错。') => ({
    provider: 'api', text, voice: 'anna', role: 'female', lang: 'zh', volume: 1, rate: 1, pitch: 1, pan: 0, close: false, phone: false,
});
const API_SETTINGS = { enabled: true, provider: 'api', api: { endpoint: 'https://tts.test/v1', female: 'anna', prefetch: false } };

function audioParam(value = 0) {
    return { value, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, cancelAndHoldAtTime() {} };
}

function fakeAudio({ state = 'running', resumeHangs = false, decode } = {}) {
    const ctx = {
        state, currentTime: 0, destination: {}, sources: [],
        resume() {
            if (resumeHangs) return new Promise(() => {});
            this.state = 'running';
            return Promise.resolve();
        },
        suspend() { return Promise.resolve(); },
        decodeAudioData: decode || (() => Promise.resolve({ duration: 1 })),
    };
    const node = (extra = {}) => ({ context: ctx, connect: (target) => target, disconnect() {}, ...extra });
    ctx.createGain = () => node({ gain: audioParam(1) });
    ctx.createBiquadFilter = () => node({ type: '', frequency: audioParam(), Q: audioParam(), gain: audioParam() });
    ctx.createDynamicsCompressor = () => node({ threshold: audioParam(), knee: audioParam(), ratio: audioParam(), attack: audioParam(), release: audioParam() });
    ctx.createBufferSource = () => {
        const source = node({ buffer: null, playbackRate: audioParam(1), onended: null, stopped: false, start() {}, stop() { this.stopped = true; } });
        ctx.sources.push(source);
        return source;
    };
    return ctx;
}

const fakeDoc = () => {
    const listeners = [];
    return {
        hidden: false, listeners,
        addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
        removeEventListener(type, fn, capture) {
            const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
            if (i >= 0) listeners.splice(i, 1);
        },
    };
};

async function withApiEnv(t, { ctx = fakeAudio(), fetchImpl } = {}, body) {
    const { resetAudioBusForTest } = await import('../src/visual/igs-ui/audio-bus.js');
    const tts = await import('../src/visual/igs-ui/tts.js');
    try { t.mock.timers.enable({ apis: ['setTimeout'] }); } catch { /* 同一个测试里第二次进入时已经开着 */ }
    const realFetch = globalThis.fetch;
    const errors = [];
    globalThis.fetch = fetchImpl || (async () => ({ ok: true, arrayBuffer: async () => AUDIO_BYTES() }));
    resetAudioBusForTest(() => ctx);
    tts.setTtsErrorHandler((message) => errors.push(message));
    await tts.clearTtsCache();
    tts.stopTts();
    try {
        await body({ ctx, errors, tts });
    } finally {
        tts.stopTts();
        tts.setTtsErrorHandler(null);
        globalThis.fetch = realFetch;
        resetAudioBusForTest();
    }
}

test('gate: tts api watchdog ends a stuck page so auto play and the sustain queue go on', async (t) => {
    const calls = [];
    await withApiEnv(t, { fetchImpl: async (url, init) => { calls.push(JSON.parse(init.body).input); return { ok: true, arrayBuffer: async () => AUDIO_BYTES() }; } }, async ({ ctx, errors, tts }) => {
        const settings = { ...API_SETTINGS, sustain: true };
        const root = {};
        tts.applyTts(root, { key: 'p:1', textType: 'narration', text: '第一页的旁白。' }, settings, {});
        await flushAll();
        assert.equal(ctx.sources.length, 1, 'first page started playing');
        assert.equal(tts.isTtsSpeaking(), true);
        // 第一页的声音永远不结束（onended 不触发）：第二页排在后面等。
        tts.applyTts(root, { key: 'p:2', textType: 'narration', text: '第二页的旁白。' }, settings, {});
        await flushAll();
        assert.equal(calls.length, 1);
        t.mock.timers.tick(5 * 60 * 1000);
        await flushAll();
        assert.equal(ctx.sources[0].stopped, true);
        assert.ok(errors.some((m) => m.includes('朗读超时')));
        assert.deepEqual(calls, ['第一页的旁白。', '第二页的旁白。'], 'queued page went on after the watchdog');
    });
});

test('gate: tts api gives up on a blocked audio context, says so, and retries on the next tap', async (t) => {
    const doc = fakeDoc();
    const previous = globalThis.document;
    globalThis.document = doc;
    try {
        const ctx = fakeAudio({ state: 'suspended', resumeHangs: true });
        await withApiEnv(t, { ctx }, async ({ errors, tts }) => {
            tts.playTts(apiPlan(), API_SETTINGS);
            await flushAll();
            t.mock.timers.tick(1200);
            await flushAll();
            assert.ok(errors.some((m) => m.includes('浏览器拦住了声音，点一下画面就能播放')));
            assert.equal(tts.isTtsSpeaking(), false);
            assert.equal(ctx.sources.length, 0);
            for (const type of ['pointerdown', 'click', 'touchend']) {
                assert.ok(doc.listeners.filter((l) => l.type === type).length >= 2, `${type} has the unlock and the retry listener`);
            }
        });
    } finally {
        globalThis.document = previous;
    }
});

test('gate: tts decodes both promise and callback style and reports readable errors', async (t) => {
    // 旧 Safari：decodeAudioData 只认回调、不返回 Promise。
    await withApiEnv(t, { ctx: fakeAudio({ decode: (bytes, ok) => { ok({ duration: 1 }); } }) }, async ({ ctx, tts }) => {
        tts.playTts(apiPlan(), API_SETTINGS);
        await flushAll();
        assert.equal(ctx.sources.length, 1);
    });
    await withApiEnv(t, { ctx: fakeAudio({ decode: (bytes, ok, bad) => { bad(new Error('EncodingError: Unable to decode audio data')); } }) }, async ({ errors, tts }) => {
        tts.playTts(apiPlan(), API_SETTINGS);
        await flushAll();
        assert.ok(errors.includes('朗读：音频解码失败'), errors.join('|'));
        assert.equal(tts.isTtsSpeaking(), false);
    });
    // 缓冲为空也必须收尾并报错。
    await withApiEnv(t, { ctx: fakeAudio({ decode: () => Promise.resolve(null) }) }, async ({ errors, tts }) => {
        tts.playTts(apiPlan(), API_SETTINGS);
        await flushAll();
        assert.equal(tts.ttsLastError(), '音频解码失败', '同一条错误 30 秒内不重复弹，但状态里有');
        assert.equal(tts.isTtsSpeaking(), false);
    });
    // 接口 200 却返回了 JSON 文本。
    const json = new TextEncoder().encode('{"error":{"message":"quota exceeded"}}').slice();
    await withApiEnv(t, { fetchImpl: async () => ({ ok: true, arrayBuffer: async () => json.buffer.slice(0) }) }, async ({ errors, tts }) => {
        tts.playTts(apiPlan(), API_SETTINGS);
        await flushAll();
        assert.ok(errors.some((m) => m.startsWith('朗读：接口返回的不是音频：{"error"')), errors.join('|'));
        assert.equal(tts.isTtsSpeaking(), false);
    });
});

test('gate: tts sniffs non-audio bodies and content types', async () => {
    const { describeNonAudio } = await import('../src/visual/igs-ui/tts.js');
    assert.equal(describeNonAudio(AUDIO_BYTES()), '');
    assert.equal(describeNonAudio(new ArrayBuffer(8)), '');
    assert.equal(describeNonAudio(Uint8Array.from([0xff, 0xfb, 0x90, 0x00]).buffer), '');
    assert.equal(describeNonAudio(new ArrayBuffer(0)), '接口返回了空音频');
    assert.match(describeNonAudio(new TextEncoder().encode('<html>Bad Gateway</html>').slice().buffer), /^接口返回的不是音频：<html>Bad Gateway/);
    assert.equal(describeNonAudio(new TextEncoder().encode('x'.repeat(200)).slice().buffer).length, '接口返回的不是音频：'.length + 80);
    const api = apiOf({ endpoint: 'https://x.test/v1' });
    const res = { headers: { get: () => 'application/json; charset=utf-8' }, text: async () => '{"code":401,"msg":"bad key"}' };
    await assert.rejects(parseTtsResponse(api, res), /接口返回的不是音频：\{"code":401/);
});

test('gate: tts aborts only requests nobody else shares, and times out with a clear message', async (t) => {
    const seen = [];
    const hanging = (url, init) => new Promise((resolve, reject) => {
        seen.push(init);
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    // 没人共享：停掉任务就中止请求。
    await withApiEnv(t, { fetchImpl: hanging }, async ({ tts }) => {
        tts.playTts(apiPlan('只有我在等。'), API_SETTINGS);
        await flushAll();
        assert.equal(seen.length, 1);
        assert.equal(seen[0].signal.aborted, false);
        tts.stopTts();
        assert.equal(seen[0].signal.aborted, true);
    });
    // 被预取共享：停掉任务不中止。
    seen.length = 0;
    await withApiEnv(t, { fetchImpl: hanging }, async ({ tts }) => {
        tts.prefetchTts('预取的那一句。', API_SETTINGS, {});
        tts.playTts(apiPlan('预取的那一句。'), API_SETTINGS);
        await flushAll();
        assert.equal(seen.length, 1, 'joined the prefetch request');
        tts.stopTts();
        assert.equal(seen[0].signal.aborted, false, 'shared request is kept');
        t.mock.timers.tick(25000);
        await flushAll();
        assert.equal(seen[0].signal.aborted, true, 'the timeout still ends it');
    });
    // 超时：按「连不上」报错，inflight 清掉后同一句还能重新请求。
    seen.length = 0;
    await withApiEnv(t, { fetchImpl: hanging }, async ({ errors, tts }) => {
        tts.playTts(apiPlan('会超时的一句。'), API_SETTINGS);
        await flushAll();
        t.mock.timers.tick(25000);
        await flushAll();
        assert.ok(errors.some((m) => m.includes('25 秒没有响应')), errors.join('|'));
        assert.equal(tts.isTtsSpeaking(), false);
        tts.playTts(apiPlan('会超时的一句。'), API_SETTINGS);
        await flushAll();
        assert.equal(seen.length, 2, 'inflight entry was cleared, so the retry fetches again');
    });
});

test('gate: tts explains proxy 404 and blocked http endpoints', async () => {
    const { fetchTtsVoices, ttsMixedContentRisk } = await import('../src/visual/igs-ui/tts.js');
    const realFetch = globalThis.fetch;
    const realLocation = globalThis.location;
    try {
        globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => 'Not Found' });
        const proxy = await fetchTtsVoices({ provider: 'api', api: { format: 'fish', transport: 'st-proxy' } });
        assert.equal(proxy.error, '酒馆的转发没开：请在酒馆 config.yaml 里设 enableCorsProxy: true 后重启');
        globalThis.location = { protocol: 'https:' };
        globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
        const mixed = await fetchTtsVoices({ provider: 'api', api: { format: 'fish', endpoint: 'http://192.168.1.5:9880' } });
        assert.equal(mixed.error, '浏览器拦截了 http 接口，请改用酒馆转发或 https');
        const other = await fetchTtsVoices({ provider: 'api', api: { format: 'fish', endpoint: 'https://api.fish.audio' } });
        assert.match(other.error, /连不上接口.*酒馆转发/);
        assert.equal(ttsMixedContentRisk({ endpoint: 'http://192.168.1.5:9880' }), true);
        assert.equal(ttsMixedContentRisk({ endpoint: 'http://127.0.0.1:9880' }), false);
        assert.equal(ttsMixedContentRisk({ endpoint: 'http://localhost:9880' }), false);
        assert.equal(ttsMixedContentRisk({ endpoint: 'https://a.test' }), false);
        assert.equal(ttsMixedContentRisk({ endpoint: 'http://a.test', transport: 'st-proxy' }), false);
        assert.equal(ttsMixedContentRisk({ format: 'custom', customUrl: 'http://a.test/x' }), true);
        assert.equal(ttsMixedContentRisk({ endpoint: 'http://a.test' }, 'http:'), false);
    } finally {
        globalThis.fetch = realFetch;
        if (realLocation === undefined) delete globalThis.location;
        else globalThis.location = realLocation;
    }
});

function fakeSynth({ paused = false, speaking = false, pending = false, voices = [] } = {}) {
    const synth = {
        paused, speaking, pending, voices, spoken: [], cancels: 0, resumes: 0, listeners: new Set(),
        getVoices() { return this.voices; },
        resume() { this.resumes += 1; this.paused = false; },
        cancel() { this.cancels += 1; this.speaking = false; this.pending = false; },
        speak(u) { this.spoken.push(u); },
        addEventListener(type, fn) { this.listeners.add(fn); },
        removeEventListener(type, fn) { this.listeners.delete(fn); },
    };
    return synth;
}

async function withSystemEnv(t, synth, body) {
    const tts = await import('../src/visual/igs-ui/tts.js');
    try { t.mock.timers.enable({ apis: ['setTimeout'] }); } catch { /* 同一个测试里第二次进入时已经开着 */ }
    const realSynth = globalThis.speechSynthesis;
    const realUtterance = globalThis.SpeechSynthesisUtterance;
    globalThis.speechSynthesis = synth;
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    const errors = [];
    tts.setTtsErrorHandler((message) => errors.push(message));
    tts.stopTts();
    try {
        await body({ tts, errors });
    } finally {
        tts.stopTts();
        tts.setTtsErrorHandler(null);
        if (realSynth === undefined) delete globalThis.speechSynthesis; else globalThis.speechSynthesis = realSynth;
        if (realUtterance === undefined) delete globalThis.SpeechSynthesisUtterance; else globalThis.SpeechSynthesisUtterance = realUtterance;
    }
}

const systemPlan = (text = '你好，今天天气不错。') => ({ provider: 'system', text, voice: '', role: 'female', lang: 'zh', volume: 1, rate: 1, pitch: 1, pan: 0 });

test('gate: tts system speech clears a stuck queue, waits briefly, and never speaks after a stop', async (t) => {
    const synth = fakeSynth({ paused: true, speaking: true });
    await withSystemEnv(t, synth, async ({ tts }) => {
        const job = tts.playTts(systemPlan('啊'.repeat(250)), { enabled: true });
        assert.equal(synth.resumes, 1, 'paused queue is resumed first');
        assert.equal(synth.cancels, 1, 'speaking queue is cancelled first');
        assert.equal(synth.spoken.length, 0, 'waits about 60ms before speaking');
        t.mock.timers.tick(60);
        assert.equal(synth.spoken.length, 3, '250 chars → 3 chunks');
        assert.equal(job.utterances.length, 3, 'every utterance stays referenced by the job');
        // 开口前就被停掉或换了新任务：不再开口。
        tts.stopTts();
        synth.speaking = true;
        const stale = tts.playTts(systemPlan('第一句。'), { enabled: true });
        tts.stopTts();
        t.mock.timers.tick(100);
        assert.equal(stale.done, true);
        assert.equal(synth.spoken.length, 3, 'stopped job never spoke');
    });
});

// —— 人声净化、响度统一、BGM 让位保持 ——
const SR = 24000;
const rmsOf = (data, from = 0, to = data.length) => {
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += data[i] * data[i];
    return Math.sqrt(sum / Math.max(1, to - from));
};
const dbOf = (a, b) => 20 * Math.log10(a / b);
const noiseOf = (length, rms, seed = 7) => {
    const out = new Float32Array(length);
    let state = seed;
    for (let i = 0; i < length; i += 1) {
        state = (state * 1664525 + 1013904223) >>> 0;
        out[i] = ((state / 4294967296) * 2 - 1) * rms * Math.sqrt(3);
    }
    return out;
};
const sineOf = (length, amp, freq = 1000) => Float32Array.from({ length }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / SR));

