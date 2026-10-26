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

test('gate: tts settings normalize with safe defaults', () => {
    const empty = normalizeTtsSettings(null);
    assert.equal(empty.enabled, false);
    assert.equal(empty.provider, 'system');
    assert.equal(empty.narration, true);
    assert.equal(empty.nsfw, false);
    assert.equal(empty.api.transport, 'direct');
    const odd = normalizeTtsSettings({ enabled: true, provider: 'x', volume: 5, rate: 9, narration: false, api: { transport: 'st-proxy', endpoint: ' http://a/v1 ' } });
    assert.equal(odd.provider, 'system');
    assert.equal(odd.volume, 1);
    assert.equal(odd.rate, 1);
    assert.equal(odd.narration, false);
    assert.equal(odd.api.endpoint, 'http://a/v1');
    assert.deepEqual(ttsApiVoiceList({ api: { voices: 'alex, anna，alex\nbella' } }), ['alex', 'anna', 'bella']);
});

test('gate: tts reads the translation of bilingual lines and drops markup', () => {
    assert.equal(ttsPlainText('おはよう〖早上好〗、今日はいい天気ですね〖今天天气真好呢〗'), '早上好今天天气真好呢');
    assert.equal(ttsPlainText('*真是的*  他又来了'), '真是的 他又来了');
    assert.equal(ttsPlainText('普通的一句话。'), '普通的一句话。');
});

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

test('gate: tts guesses the next page the same way the reader pages it', () => {
    assert.deepEqual(guessTtsLine('[艾莉]：「你好。」'), { textType: 'dialogue', speaker: '艾莉', text: '「你好。」' });
    assert.deepEqual(guessTtsLine('*[艾莉]：他怎么在这*'), { textType: 'thought', speaker: '艾莉', text: '他怎么在这' });
    assert.equal(guessTtsLine('窗外下着雨。').textType, 'narration');
    const api = { model: 'm' };
    assert.equal(ttsCacheKey('u', api, 'anna', '「你好。」'), ttsCacheKey('u', api, 'anna', '你好。'));
    assert.notEqual(ttsCacheKey('u', api, 'anna', '你好。'), ttsCacheKey('u', api, 'alex', '你好。'));
});

test('gate: tts prefetches the next page once over the api and reuses it', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    };
    try {
        const settings = { enabled: true, provider: 'api', api: { endpoint: 'https://tts.test/v1', model: 'm', female: 'anna', male: 'alex' } };
        const sa = assets({ 艾莉: GIRL });
        const next = '[艾莉]：「明天见。」';
        const [a, b] = await Promise.all([prefetchTts(next, settings, sa), prefetchTts(next, settings, sa)]);
        assert.equal(calls.length, 1, 'same line in flight is requested once');
        assert.equal(a.byteLength, 8);
        assert.equal(b.byteLength, 8);
        assert.equal(calls[0].url, 'https://tts.test/v1/audio/speech');
        assert.equal(calls[0].body.voice, 'anna');
        assert.equal(calls[0].body.input, '「明天见。」');
        await prefetchTts('[艾莉]：明天见。', settings, sa);
        assert.equal(calls.length, 1, 'quotes do not matter for the cache');
        // 系统语音、旁白关闭时的旁白页都不提前生成。
        assert.equal(prefetchTts(next, { ...settings, provider: 'system' }, sa), null);
        assert.equal(prefetchTts('窗外下着雨。', { ...settings, narration: false }, sa), null);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('gate: tts never reads the speaker name prefix', () => {
    assert.equal(stripSpeakerPrefix('*[艾莉]：他怎么在这*'), '*他怎么在这*');
    assert.equal(stripSpeakerPrefix('艾莉: 你好', '艾莉'), '你好');
    assert.equal(stripSpeakerPrefix('艾莉今天来了', '艾莉'), '艾莉今天来了');
    const plan = decideTts({}, { textType: 'thought', speaker: '艾莉', text: '*[艾莉]：他怎么在这*' }, { enabled: true }, { sceneAssets: assets({ 艾莉: GIRL }) });
    assert.equal(plan.text, '他怎么在这');
});

test('gate: tts prefetch waits for the reader to dwell, skips fast clicks, and obeys its switch', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push(JSON.parse(init.body).input);
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
    };
    let clock = 0;
    let pending = new Map();
    let seq = 0;
    const timers = {
        setTimeout: (fn, ms) => { seq += 1; pending.set(seq, { fn, at: clock + ms }); return seq; },
        clearTimeout: (id) => pending.delete(id),
    };
    const advance = async (ms) => {
        clock += ms;
        await new Promise((r) => setImmediate(r));
        for (const [id, t] of [...pending]) if (t.at <= clock) { pending.delete(id); t.fn(); }
        await new Promise((r) => setImmediate(r));
    };
    try {
        await clearTtsCache();
        const settings = { enabled: true, provider: 'api', api: { endpoint: 'https://tts.test/v1', female: 'anna' } };
        const sa = assets({ 艾莉: GIRL });
        const root = {};
        const page = (i, next) => applyTts(root, { key: `m:${i}`, textType: 'narration', text: `第${i}页。`, next }, settings, sa, { now: () => clock, timers });
        page(0, '第1页。');
        await advance(1000);
        assert.deepEqual(calls, [], 'not yet: still within the dwell time');
        // 快速点到下一页：上一页的预取作废。
        page(1, '第2页。');
        await advance(300);
        page(2, '第3页。');
        await advance(1200);
        assert.deepEqual(calls, []);
        await advance(400);
        assert.deepEqual(calls, ['第3页。'], 'dwelled 1.6s on page 2, so page 3 is prefetched');
        // 关掉开关就不再提前生成。
        const off = { ...settings, api: { ...settings.api, prefetch: false } };
        applyTts(root, { key: 'm:9', textType: 'narration', text: '第9页。', next: '第10页。' }, off, sa, { now: () => clock, timers });
        await advance(5000);
        assert.deepEqual(calls, ['第3页。']);
    } finally {
        globalThis.fetch = realFetch;
        pending = new Map();
    }
});

const apiOf = (extra = {}) => normalizeTtsSettings({ provider: 'api', api: extra }).api;
const asJson = (req) => JSON.parse(req.body);

test('gate: tts waits for the title card / eye-open lead, fetching the line meanwhile', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push(JSON.parse(init.body).input);
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
    };
    const pending = new Map();
    let seq = 0;
    const timers = {
        setTimeout: (fn, ms) => { seq += 1; pending.set(seq, { fn, ms }); return seq; },
        clearTimeout: (id) => pending.delete(id),
    };
    try {
        await clearTtsCache();
        const settings = { enabled: true, provider: 'api', api: { endpoint: 'https://tts.test/v1', female: 'anna', prefetch: false } };
        applyTts({}, { key: 'lead:1', textType: 'narration', text: '第二天清晨。', delay: 2700 }, settings, assets({}), { now: () => 0, timers });
        await new Promise((r) => setImmediate(r));
        assert.deepEqual(calls, ['第二天清晨。'], 'audio is requested while the card plays');
        assert.deepEqual([...pending.values()].map((t) => t.ms), [2700], 'playback waits for the card');
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('gate: tts api settings normalize new fields with safe defaults', () => {
    const api = normalizeTtsSettings(null).api;
    assert.equal(api.format, 'openai');
    assert.equal(api.responseFormat, 'mp3');
    assert.equal(api.sendSpeed, true);
    assert.equal(api.chunk, true);
    assert.equal(api.customMethod, 'POST');
    assert.equal(api.customResponse, 'audio');
    assert.equal(normalizeTtsSettings(null).allVoices, false);
    const odd = normalizeTtsSettings({ allVoices: true, api: { format: 'nope', responseFormat: 'flac', sendSpeed: false, chunk: false, customMethod: 'PUT', customResponse: 'x' } });
    assert.equal(odd.allVoices, true);
    assert.equal(odd.api.format, 'openai');
    assert.equal(odd.api.responseFormat, 'mp3');
    assert.equal(odd.api.sendSpeed, false);
    assert.equal(odd.api.chunk, false);
    assert.equal(odd.api.customMethod, 'POST');
    assert.equal(odd.api.customResponse, 'audio');
    assert.equal(normalizeTtsSettings({ api: { format: 'fish' } }).api.format, 'fish');
});

test('gate: tts builds the request for every api format', () => {
    const openai = buildTtsRequest(apiOf({ endpoint: 'https://x.test/v1', apiKey: 'k', model: 'm' }), { text: '你好', voice: 'anna', rate: 1.1 });
    assert.equal(openai.url, 'https://x.test/v1/audio/speech');
    assert.equal(openai.headers.Authorization, 'Bearer k');
    assert.deepEqual(asJson(openai), { model: 'm', input: '你好', voice: 'anna', response_format: 'mp3', speed: 1.1 });
    const bare = asJson(buildTtsRequest(apiOf({ endpoint: 'https://x.test/v1', responseFormat: 'none', sendSpeed: false }), { text: 'a', voice: '', rate: 1 }));
    assert.equal('response_format' in bare, false);
    assert.equal('speed' in bare, false);
    assert.equal(bare.voice, 'alloy');
    assert.equal(asJson(buildTtsRequest(apiOf({ endpoint: 'https://x.test/v1', responseFormat: 'wav' }), { text: 'a', voice: 'v', rate: 1 })).response_format, 'wav');

    const sovits = buildTtsRequest(apiOf({ format: 'gpt-sovits', endpoint: 'http://127.0.0.1:9880/' }), { text: 'こんにちは', voice: 'D:/ref/a.wav|你好呀|zh', rate: 1.2, lang: 'ja' });
    assert.equal(sovits.url, 'http://127.0.0.1:9880/tts');
    assert.deepEqual(asJson(sovits), {
        text: 'こんにちは', text_lang: 'ja', ref_audio_path: 'D:/ref/a.wav', prompt_text: '你好呀', prompt_lang: 'zh',
        media_type: 'wav', speed_factor: 1.2, streaming_mode: false,
    });
    const short = asJson(buildTtsRequest(apiOf({ format: 'gpt-sovits', endpoint: 'http://h/tts' }), { text: 'hi', voice: 'D:/ref/a.wav', rate: 1, lang: 'en' }));
    assert.equal(short.prompt_text, '');
    assert.equal(short.prompt_lang, 'en');
    assert.deepEqual(parseGptSovitsVoice('a.wav|文本|ja'), { path: 'a.wav', promptText: '文本', promptLang: 'ja' });
    assert.deepEqual(parseGptSovitsVoice('a.wav'), { path: 'a.wav', promptText: '', promptLang: '' });

    const fish = buildTtsRequest(apiOf({ format: 'fish', apiKey: 'fk', model: 's1', transport: 'st-proxy' }), { text: '你好', voice: 'ref123', rate: 1 });
    assert.equal(fish.url, '/proxy/https://api.fish.audio/v1/tts');
    assert.equal(fish.headers.model, 's1');
    assert.equal(fish.headers.Authorization, 'Bearer fk');
    assert.deepEqual(asJson(fish), { text: '你好', reference_id: 'ref123', format: 'mp3', latency: 'balanced', mp3_bitrate: 192 });

    const mm = buildTtsRequest(apiOf({ format: 'minimax', apiKey: 'mk' }), { text: '你好', voice: 'male-qn', rate: 1.3 });
    assert.equal(mm.url, 'https://api.minimaxi.com/v1/t2a_v2');
    const body = asJson(mm);
    assert.equal(body.stream, false);
    assert.deepEqual(body.voice_setting, { voice_id: 'male-qn', speed: 1.3 });
    assert.deepEqual(body.audio_setting, { format: 'mp3' });
    assert.ok(body.model);
});

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

test('gate: tts splits long api text into segments only past the threshold', () => {
    assert.deepEqual(splitTtsSegments('短短的一句话。'), ['短短的一句话。']);
    const sentence = '这是一句大约有十几个字的话呀。';
    const long = sentence.repeat(6);
    const parts = splitTtsSegments(long);
    assert.ok(parts.length >= 3);
    assert.equal(parts.join(''), long);
    assert.ok(parts.every((p) => p.length >= 15));
    const tiny = `好。嗯。${'啊'.repeat(70)}。是。`;
    const merged = splitTtsSegments(tiny);
    assert.equal(merged.join(''), tiny);
    assert.ok(merged.every((p) => p.length >= 15));
    assert.deepEqual(splitTtsSegments(''), []);
});

test('gate: tts prefetch over non-openai formats and per-segment caching', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, json: async () => ({}), text: async () => JSON.stringify({ data: { audio: '0102' }, base_resp: { status_code: 0 } }), arrayBuffer: async () => new ArrayBuffer(2) };
    };
    try {
        await clearTtsCache();
        const settings = { enabled: true, provider: 'api', api: { format: 'minimax', apiKey: 'k', female: 'girl-1', sendEmotion: false } };
        const sa = assets({ 艾莉: GIRL });
        const out = await prefetchTts('[艾莉]：「明天见。」', settings, sa);
        assert.equal(out.byteLength, 2);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://api.minimaxi.com/v1/t2a_v2');
        assert.equal(calls[0].body.voice_setting.voice_id, 'girl-1');
        await prefetchTts('[艾莉]：「明天见。」', { ...settings, api: { ...settings.api, format: 'fish', audioTags: false } }, sa);
        assert.equal(calls.length, 2);
        assert.equal(calls[1].url, 'https://api.fish.audio/v1/tts');
        calls.length = 0;
        const long = `[艾莉]：${[1, 2, 3, 4, 5, 6].map((n) => `这是第${n}句大约有十几个字的话呀。`).join('')}`;
        await prefetchTts(long, settings, sa);
        const first = calls.length;
        assert.ok(first >= 3);
        await prefetchTts(long, settings, sa);
        assert.equal(calls.length, first);
        calls.length = 0;
        await clearTtsCache();
        await prefetchTts(long, { ...settings, api: { ...settings.api, chunk: false } }, sa);
        assert.equal(calls.length, 1);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('gate: tts cache key includes the api format and format options', () => {
    const base = { model: 'm' };
    assert.notEqual(ttsCacheKey('u', { ...base, format: 'openai' }, 'v', '你好'), ttsCacheKey('u', { ...base, format: 'fish' }, 'v', '你好'));
    assert.notEqual(ttsCacheKey('u', { ...base, responseFormat: 'mp3' }, 'v', '你好'), ttsCacheKey('u', { ...base, responseFormat: 'wav' }, 'v', '你好'));
    assert.notEqual(
        ttsCacheKey('u', { ...base, format: 'custom', customBody: 'a' }, 'v', '你好'),
        ttsCacheKey('u', { ...base, format: 'custom', customBody: 'b' }, 'v', '你好'),
    );
});

test('gate: system voice gender covers common names and says unknown when unsure', () => {
    for (const name of ['Microsoft Yunyang Online (Natural) - Chinese', 'Microsoft Keita Online (Natural) - Japanese', 'Microsoft Ichiro - Japanese', 'Microsoft David Desktop - English', 'Microsoft Mark - English', 'Microsoft Guy Online (Natural)', 'Li-mu', 'Otoya', 'Hattori', 'Daniel', 'Fred', 'Alex', 'Aaron', 'Google UK English Male']) {
        assert.equal(systemVoiceGender(name), 'male', name);
    }
    for (const name of ['Microsoft Xiaoxiao Online (Natural)', 'Microsoft Huihui - Chinese', 'Microsoft Nanami Online (Natural)', 'Microsoft Zira - English', 'Tingting', 'Kyoko', 'Samantha', 'Google UK English Female']) {
        assert.equal(systemVoiceGender(name), 'female', name);
    }
    for (const name of ['Google 日本語', 'Google 普通话（中国大陆）', 'cmn-cn-x-ccc-local', 'Zarvox', '']) {
        assert.equal(systemVoiceGender(name), 'unknown', name);
    }
    const mixed = [v('Google 普通话（中国大陆）', 'zh-CN'), v('Microsoft Yunxi', 'zh-CN'), v('Microsoft Xiaoxiao', 'zh-CN')];
    assert.deepEqual(systemVoicePool(mixed, 'male').map((x) => x.name), ['Microsoft Yunxi']);
    assert.deepEqual(systemVoicePool(mixed, 'female').map((x) => x.name), ['Microsoft Xiaoxiao']);
    const onlyUnknown = [v('Google 普通话（中国大陆）', 'zh-CN')];
    assert.equal(systemVoicePool(onlyUnknown, 'male').length, 1);
    const maleOnly = [mixed[0], mixed[1]];
    assert.deepEqual(systemVoicePool(maleOnly, 'female').map((x) => x.name), ['Google 普通话（中国大陆）']);
});

test('gate: system voice options can list every language and mark unknown gender', () => {
    const options = systemVoiceOptions(WIN_VOICES, { all: true });
    assert.ok(options.some(([id]) => id.includes('Aria')));
    assert.ok(options.find(([id]) => id.includes('Aria'))[1].includes('en-US'));
    assert.equal(systemVoiceOptions(WIN_VOICES).length, WIN_VOICES.length - 1);
    const unknown = systemVoiceOptions([v('Google 日本語', 'ja-JP')])[0][1];
    assert.match(unknown, /性别未知/);
});

test('gate: saved system voice falls back to voiceURI when the name is gone', () => {
    const voices = [{ name: 'Renamed Voice', voiceURI: 'uri://old-name', lang: 'zh-CN' }, ...WIN_VOICES];
    assert.equal(findSystemVoice(voices, 'uri://old-name').name, 'Renamed Voice');
    assert.equal(findSystemVoice(voices, WIN_VOICES[1].name).name, WIN_VOICES[1].name);
    assert.equal(findSystemVoice(voices, 'nobody'), null);
    const sa = assets({ 雷恩: BOY }, { 雷恩: { tts: 'uri://old-name' } });
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '雷恩' }, ON, sa, voices).voice, 'Renamed Voice');
    const preset = resolveTtsVoice({ textType: 'narration' }, { ...ON, system: { narrator: 'uri://old-name' } }, sa, voices);
    assert.equal(preset.voice, 'Renamed Voice');
});

test('gate: system voices subscribe to voiceschanged and cancel safely', () => {
    const listeners = new Set();
    const synth = { addEventListener: (t, fn) => { assert.equal(t, 'voiceschanged'); listeners.add(fn); }, removeEventListener: (t, fn) => listeners.delete(fn) };
    let hits = 0;
    const stop = onSystemVoicesChanged(() => { hits += 1; }, synth);
    for (const fn of listeners) fn();
    assert.equal(hits, 1);
    stop();
    assert.equal(listeners.size, 0);
    assert.equal(typeof onSystemVoicesChanged(() => {}, null), 'function');
    assert.doesNotThrow(() => onSystemVoicesChanged(() => {}, undefined)());
});

test('gate: tts voice list merges without duplicates and fetches per format', async () => {
    const merged = mergeTtsVoices('alex, anna#安娜', [['anna', ''], ['bella', 'Bella'], ['', 'x'], ['claire', '']]);
    assert.equal(merged.added, 2);
    assert.equal(merged.text, 'alex, anna#安娜, bella#Bella, claire');
    assert.deepEqual(ttsApiVoiceList({ api: { voices: merged.text } }), ['alex', 'anna', 'bella', 'claire']);

    const realFetch = globalThis.fetch;
    const calls = [];
    let handler = () => ({ ok: false, status: 404, text: async () => 'nope' });
    globalThis.fetch = async (url, init) => { calls.push({ url, method: init.method, body: init.body, auth: init.headers.Authorization }); return handler(url); };
    try {
        const plain = await fetchTtsVoices({ provider: 'api', api: { endpoint: 'https://api.openai.com/v1' } });
        assert.equal(plain.builtin, true);
        assert.deepEqual(plain.voices.map(([id]) => id), ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse']);
        assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/voice/list');
        const silicon = await fetchTtsVoices({ provider: 'api', api: { endpoint: 'https://api.siliconflow.cn/v1/audio/speech' } });
        assert.ok(silicon.voices.some(([id]) => id === 'FunAudioLLM/CosyVoice2-0.5B:alex'));
        assert.ok(silicon.voices.some(([id]) => id === 'FunAudioLLM/CosyVoice2-0.5B:diana'));
        handler = () => ({ ok: true, json: async () => ({ results: [{ uri: 'speech:mine:abc', customName: '我的' }] }) });
        const custom = await fetchTtsVoices({ provider: 'api', api: { endpoint: 'https://api.siliconflow.cn/v1', apiKey: 'sk' } });
        assert.deepEqual(custom.voices, [['speech:mine:abc', '我的']]);
        assert.equal(custom.builtin, undefined);
        assert.equal(calls.at(-1).auth, 'Bearer sk');
        handler = () => ({ ok: true, json: async () => ({ items: [{ _id: 'f1', title: '少女' }, { _id: 'f2', title: '大叔' }] }) });
        const fish = await fetchTtsVoices({ provider: 'api', api: { format: 'fish', apiKey: 'k' } });
        assert.deepEqual(fish.voices, [['f1', '少女'], ['f2', '大叔']]);
        assert.match(calls.at(-1).url, /^https:\/\/api\.fish\.audio\/model\?self=true/);
        handler = () => ({ ok: true, json: async () => ({ system_voice: [{ voice_id: 's1', voice_name: '甜美' }], voice_cloning: [{ voice_id: 'c1' }], base_resp: { status_code: 0 } }) });
        const mm = await fetchTtsVoices({ provider: 'api', api: { format: 'minimax', apiKey: 'k' } });
        assert.deepEqual(mm.voices.map(([id]) => id), ['s1', 'c1']);
        assert.equal(calls.at(-1).url, 'https://api.minimaxi.com/v1/get_voice');
        assert.equal(calls.at(-1).method, 'POST');
        assert.deepEqual(JSON.parse(calls.at(-1).body), { voice_type: 'all' });
        const none = await fetchTtsVoices({ provider: 'api', api: { format: 'gpt-sovits' } });
        assert.equal(none.ok, false);
        handler = () => ({ ok: false, status: 401, text: async () => 'bad key' });
        const denied = await fetchTtsVoices({ provider: 'api', api: { format: 'fish' } });
        assert.equal(denied.ok, false);
        assert.match(denied.error, /401/);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('gate: tts long text requests the first segment at once and keeps the rest to two in flight', async () => {
    const realFetch = globalThis.fetch;
    let running = 0;
    let peak = 0;
    const started = [];
    globalThis.fetch = async (url, init) => {
        const text = JSON.parse(init.body).input;
        started.push(text);
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 15));
        running -= 1;
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) };
    };
    try {
        await clearTtsCache();
        const settings = { enabled: true, provider: 'api', api: { endpoint: 'https://tts.test/v1', female: 'anna' } };
        const sa = assets({ 艾莉: GIRL });
        const long = `[艾莉]：${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `这是第${n}句大约有十几个字的话呀。`).join('')}`;
        const pending = prefetchTts(long, settings, sa);
        await new Promise((r) => setImmediate(r));
        assert.equal(started.length >= 1, true, 'first segment is requested immediately');
        assert.equal(started[0].startsWith('这是第1句'), true);
        await pending;
        assert.equal(started.length, 8);
        assert.ok(peak <= 3, `first + at most two others in flight, got ${peak}`);
        assert.ok(peak >= 2, 'later segments do run in parallel');
        assert.ok(started.slice(1).every((t, i) => t.includes(`第${i + 2}句`)), 'rest start in order');
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

test('gate: audio bus unlocks the iOS audio session on the first gesture only', async () => {
    const { primeAudioSession, resetAudioBusForTest, getAudioBus } = await import('../src/visual/igs-ui/audio-bus.js');
    const session = {};
    assert.equal(primeAudioSession({ navigator: { audioSession: session } }), 'session');
    assert.equal(session.type, 'playback');
    const made = [];
    class FakeAudio { constructor(src) { made.push(src); } play() { return Promise.reject(new Error('blocked')); } }
    assert.equal(primeAudioSession({ navigator: {}, Audio: FakeAudio }), 'audio');
    assert.match(made[0], /^data:audio\/wav;base64,/);
    assert.equal(primeAudioSession({ navigator: {}, Audio: class { constructor() { throw new Error('no'); } } }), '');
    assert.equal(primeAudioSession({}), '');
    // 首次手势：监听挂在 pointerdown / click / touchend 上，触发一次后全部摘掉。
    const doc = fakeDoc();
    const previous = globalThis.document;
    globalThis.document = doc;
    try {
        resetAudioBusForTest(() => fakeAudio({ state: 'suspended' }));
        getAudioBus();
        const types = doc.listeners.map((l) => l.type).sort();
        assert.deepEqual(types.filter((x) => ['click', 'pointerdown', 'touchend'].includes(x)), ['click', 'pointerdown', 'touchend']);
        doc.listeners.find((l) => l.type === 'touchend').fn();
        assert.equal(doc.listeners.some((l) => ['click', 'pointerdown', 'touchend'].includes(l.type)), false);
    } finally {
        globalThis.document = previous;
        resetAudioBusForTest();
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

test('gate: tts system speech cancels the queue on errors and on the watchdog', async (t) => {
    const synth = fakeSynth();
    await withSystemEnv(t, synth, async ({ tts, errors }) => {
        const job = tts.playTts(systemPlan('啊'.repeat(250)), { enabled: true });
        assert.equal(synth.spoken.length, 3);
        const before = synth.cancels;
        synth.spoken[1].onerror({ error: 'synthesis-failed' });
        assert.equal(synth.cancels, before + 1);
        assert.equal(job.done, true);
        assert.equal(tts.isTtsSpeaking(), false);
        assert.ok(errors.some((m) => m.includes('系统语音合成失败')));
        // 漏发 onend：看门狗先 cancel 再收尾。
        const stuck = tts.playTts(systemPlan('漏发结束事件的一句。'), { enabled: true });
        const cancels = synth.cancels;
        t.mock.timers.tick(120 * 1000);
        assert.equal(stuck.done, true);
        assert.ok(synth.cancels > cancels);
    });
});

test('gate: tts waits up to 800ms for system voices on first use, then picks one voice', async (t) => {
    const synth = fakeSynth({ voices: [] });
    await withSystemEnv(t, synth, async ({ tts }) => {
        tts.resetTtsForTest();
        const settings = { enabled: true, provider: 'system' };
        const root = {};
        tts.applyTts(root, { key: 'v:1', textType: 'narration', text: '第一句旁白。' }, settings, {});
        assert.equal(synth.spoken.length, 0, 'holds back while the voice list is empty');
        synth.voices = [{ name: 'Microsoft Xiaoxiao Online (Natural)', lang: 'zh-CN' }, { name: 'Microsoft Yunxi Online (Natural)', lang: 'zh-CN' }];
        for (const fn of [...synth.listeners]) fn();
        await flushAll();
        assert.equal(synth.spoken.length, 1);
        assert.ok(synth.spoken[0].voice && synth.spoken[0].voice.name.includes('Natural'), 'a real voice was chosen, not the default');
        // 一直等不到：800ms 后用默认声音照常念。
        tts.stopTts();
        synth.voices = [];
        synth.spoken.length = 0;
        tts.resetTtsForTest();
        tts.applyTts({}, { key: 'v:2', textType: 'narration', text: '第二句旁白。' }, settings, {});
        t.mock.timers.tick(799);
        await flushAll();
        assert.equal(synth.spoken.length, 0);
        t.mock.timers.tick(1);
        await flushAll();
        assert.equal(synth.spoken.length, 1);
        // 等过一次就不再等：声音还是空的，下一页立刻念。
        tts.stopTts();
        synth.spoken.length = 0;
        tts.applyTts({}, { key: 'v:3', textType: 'narration', text: '第三句旁白。' }, settings, {});
        assert.equal(synth.spoken.length, 1, 'no second wait');
    });
});

test('gate: tts records why a page was not read, and a page skipped while off can be read later', async () => {
    const { getTtsSkipReason, replayTts } = await import('../src/visual/igs-ui/tts.js');
    const line = (extra = {}) => ({ key: 'k:1', textType: 'dialogue', speaker: '艾莉', text: '你好呀。', ...extra });
    const sa = assets({ 艾莉: GIRL });
    const reasonOf = (settings, l, assetsArg = sa) => {
        const plan = decideTts({}, l, settings, { sceneAssets: assetsArg, voices: WIN_VOICES });
        return { plan, reason: (getTtsSkipReason() || {}).reason, key: (getTtsSkipReason() || {}).key };
    };
    assert.deepEqual(reasonOf({ enabled: false }, line()).reason, '台词朗读没开');
    assert.equal(reasonOf({ enabled: false }, line()).key, 'k:1');
    assert.equal(reasonOf({ enabled: true, volume: 0 }, line()).reason, '朗读音量是 0');
    assert.equal(reasonOf({ enabled: true }, line({ nsfw: true })).reason, 'NSFW 场景的朗读没开');
    assert.equal(reasonOf({ enabled: true, narration: false }, line({ textType: 'narration' })).reason, '旁白朗读已关');
    assert.equal(reasonOf({ enabled: true }, line({ text: '……' })).reason, '这一页没有可读的文字');
    assert.equal(reasonOf({ enabled: true }, line({ textType: 'chat' })).reason, '这一页不是台词或旁白');
    assert.equal(reasonOf({ enabled: true }, line(), assets({ 艾莉: GIRL }, { 艾莉: { ttsVolume: 0, tts: 'x' } })).reason, '这个角色设为不朗读');
    const ok = reasonOf({ enabled: true }, line());
    assert.ok(ok.plan && !ok.plan.skip);
    assert.equal(getTtsSkipReason(), null, 'reading clears the reason');
    // 没开朗读时翻过的页不记入「已念」：打开开关后同一页能念。
    const state = {};
    assert.equal(decideTts(state, line(), { enabled: false }, { sceneAssets: sa, voices: WIN_VOICES }), null);
    const later = decideTts(state, line(), { enabled: true }, { sceneAssets: sa, voices: WIN_VOICES });
    assert.ok(later && !later.skip, 'same page is readable once the switch is on');
    // 预取不改写「这一页为什么没念」。
    decideTts({}, line(), { enabled: false }, { sceneAssets: sa, voices: WIN_VOICES });
    prefetchTts('窗外下着雨。', { enabled: true, provider: 'api', narration: false, api: { endpoint: 'https://x.test/v1' } }, sa);
    assert.equal(getTtsSkipReason().reason, '台词朗读没开');
    // 重听：这一页没念时给出原因；工具栏提示同步。
    const titles = [];
    const root = { querySelector: () => ({ setAttribute: (name, value) => { if (name === 'title') titles.push(value); } }) };
    applyTts(root, line({ key: 'r:1', textType: 'narration' }), { enabled: true, narration: false }, sa);
    assert.equal(titles.at(-1), '本页未朗读：旁白朗读已关');
    assert.deepEqual(replayTts(), { ok: false, error: '本页未朗读：旁白朗读已关' });
    applyTts(root, line({ key: 'r:2', textType: 'narration' }), { enabled: true, narration: false }, sa);
    applyTts(root, line({ key: 'r:2', textType: 'narration' }), { enabled: true, narration: false }, sa);
    assert.equal(titles.at(-1), '本页未朗读：旁白朗读已关');
    applyTts(root, line({ key: 'r:3', textType: 'narration' }), { enabled: false }, sa);
    assert.equal(titles.at(-1), '本页未朗读：台词朗读没开');
});

test('gate: page diagnostic reports why the page was not read aloud', async () => {
    const { buildPageDiagnostic } = await import('../src/visual/igs-ui/page-diagnostic.js');
    const snap = (enabled) => ({ messageId: 7, content: { messageId: 7, currentIndex: 1, segments: ['a', 'b'], textType: 'dialogue' }, readerSettings: { tts: { enabled } } });
    assert.match(buildPageDiagnostic(snap(true), { ttsSkip: { key: '7:1', reason: '旁白朗读已关' } }), /朗读 本页未朗读：旁白朗读已关/);
    assert.match(buildPageDiagnostic(snap(true), { ttsSkip: { key: '7:0', reason: '旁白朗读已关' } }), /朗读 本页会朗读/);
    assert.match(buildPageDiagnostic(snap(false)), /朗读 未开启/);
});

test('gate: a late onerror from a finished utterance cannot cancel the next one', async (t) => {
    const synth = fakeSynth();
    await withSystemEnv(t, synth, async ({ tts }) => {
        const first = tts.playTts(systemPlan('第一句。'), { enabled: true });
        const oldUtterance = first.utterances[0];
        oldUtterance.onend();
        assert.equal(first.done, true);
        const second = tts.playTts(systemPlan('第二句。'), { enabled: true });
        const cancels = synth.cancels;
        oldUtterance.onerror({ error: 'interrupted' });
        oldUtterance.onerror({ error: 'synthesis-failed' });
        assert.equal(synth.cancels, cancels, 'the new sentence is left alone');
        assert.equal(second.done, false);
        // 看门狗收掉的句子，迟到的 onerror 同样不再动手。
        tts.stopTts();
        const stuck = tts.playTts(systemPlan('漏发结束事件。'), { enabled: true });
        t.mock.timers.tick(120 * 1000);
        assert.equal(stuck.cancelled, true);
        const after = synth.cancels;
        stuck.utterances[0].onerror({ error: 'synthesis-failed' });
        assert.equal(synth.cancels, after);
    });
});

test('gate: tts stops requesting the remaining segments after the first one fails', async (t) => {
    const calls = [];
    const pending = [];
    const fetchImpl = (url, init) => {
        calls.push(JSON.parse(init.body).input);
        if (calls.length === 1) return Promise.resolve({ ok: false, status: 500, text: async () => 'boom' });
        return new Promise((resolve) => pending.push(() => resolve({ ok: true, arrayBuffer: async () => AUDIO_BYTES() })));
    };
    await withApiEnv(t, { fetchImpl }, async ({ errors, tts }) => {
        const text = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `这是第${n}句大约有十几个字的话呀。`).join('');
        const job = tts.playTts(apiPlan(text), API_SETTINGS);
        await flushAll();
        assert.equal(job.done, true, 'page ends once the first segment fails');
        assert.ok(errors.some((m) => m.includes('接口返回 500')));
        const started = calls.length;
        assert.equal(started, 3, 'first segment plus the two that were already in flight');
        for (const release of pending.splice(0)) release();
        await flushAll();
        assert.equal(calls.length, started, 'no more segments are requested after the page ended');
    });
});

test('tts: voice list keeps up to 200 entries regardless of id length', () => {
    const fetched = Array.from({ length: 250 }, (_, i) => [`moss_audio_${String(i).padStart(3, "0")}_0123456789abcdef0123456789abcdef`, `音色${i}`]);
    const merged = mergeTtsVoices('', fetched);
    assert.equal(merged.total, 200);
    assert.equal(merged.added, 200);
    assert.equal(merged.dropped, 50);
    const config = normalizeTtsSettings({ api: { voices: merged.text } });
    assert.equal(config.api.voices, merged.text, 'two hundred long entries survive normalization intact');
    const over = normalizeTtsSettings({ api: { voices: Array.from({ length: 210 }, (_, i) => `v${i}`).join('\n') } });
    assert.equal(over.api.voices.split(', ').length, 200);
    assert.equal(normalizeTtsSettings({ api: { voices: 'a\nb' } }).api.voices, 'a\nb', 'under the cap the text is left as typed');
});

test('tts: narrator can use its own interface and a style description', () => {
    const settings = {
        enabled: true, provider: 'system', narratorStyle: '沉稳的说书人',
        narratorApi: { enabled: true, format: 'openai', endpoint: 'https://n.example/v1', model: 'gpt-4o-mini-tts', voice: 'onyx' },
    };
    const narration = decideTts({}, { key: 'n1', textType: 'narration', text: '夜色渐深。' }, settings, { sceneAssets: {} });
    assert.equal(narration.provider, 'api');
    assert.equal(narration.apiSource, 'narrator');
    assert.equal(narration.voice, 'onyx');
    assert.equal(narration.style, '沉稳的说书人');
    const dialogue = decideTts({}, { key: 'd1', textType: 'dialogue', speaker: '甲', text: '你好。' }, settings, { sceneAssets: {} });
    assert.equal(dialogue.provider, 'system', 'dialogue keeps the main source');
    assert.equal(dialogue.style, '');
    const request = buildTtsRequest(normalizeTtsSettings(settings).narratorApi, narration);
    assert.equal(request.url, 'https://n.example/v1/audio/speech');
    assert.equal(JSON.parse(request.body).instructions, '沉稳的说书人');
    const empty = decideTts({}, { key: 'n2', textType: 'narration', text: '夜色渐深。' }, { ...settings, narratorApi: { ...settings.narratorApi, voice: '' } }, { sceneAssets: {} });
    assert.equal(empty, null, 'no narrator voice means narration is skipped');
    const custom = buildTtsRequest(normalizeTtsSettings({ api: { format: 'custom', customUrl: 'https://c.example/tts', customBody: '{"t":"{{text}}","s":"{{style}}"}' } }).api, { text: 'x', voice: 'v', style: '轻声"慢读"' });
    assert.equal(JSON.parse(custom.body).s, '轻声"慢读"');
    assert.notEqual(ttsCacheKey('u', {}, 'v', '你好', '风格'), ttsCacheKey('u', {}, 'v', '你好'));
    assert.equal(ttsCacheKey('u', {}, 'v', '你好', ''), ttsCacheKey('u', {}, 'v', '你好'));
});

test('tts: character style survives normalization and joins the plan style', async () => {
    const { normalizeCharacterVoice, normalizeCharacterVoices } = await import('../src/visual/igs-ui/voice-bark.js');
    assert.equal(normalizeCharacterVoice({ ttsStyle: '  慵懒  ' }).ttsStyle, '慵懒');
    assert.equal(normalizeCharacterVoice({ ttsStyle: 'x'.repeat(400) }).ttsStyle.length, 300);
    assert.equal(normalizeCharacterVoice({}).ttsStyle, '');
    assert.deepEqual(normalizeCharacterVoices({ 甲: { ttsStyle: '慵懒' }, 乙: { ttsStyle: '' } }), { 甲: { pack: '', pitch: 0, speed: 1, ttsStyle: '慵懒' } });
    const assets = { characterVoices: { 甲: { ttsStyle: '慵懒' } } };
    const settings = { enabled: true, provider: 'api', api: { female: 'f' }, thoughtStyle: '自言自语' };
    const say = decideTts({}, { key: 'a', textType: 'dialogue', speaker: '甲', text: '你好。' }, settings, { sceneAssets: assets });
    assert.equal(say.style, '慵懒');
    const other = decideTts({}, { key: 'b', textType: 'dialogue', speaker: '乙', text: '你好。' }, settings, { sceneAssets: assets });
    assert.equal(other.style, '');
    const thought = decideTts({}, { key: 'c', textType: 'thought', speaker: '甲', text: '你好。' }, settings, { sceneAssets: assets });
    assert.equal(thought.style, '自言自语；慵懒');
});

test('tts: mood style is opt-in and joins character style', () => {
    const assets = { characterVoices: { 甲: { ttsStyle: '慵懒' } } };
    const base = { enabled: true, provider: 'api', api: { female: 'f' } };
    const line = { key: 'a', textType: 'dialogue', speaker: '甲', text: '你好。', mood: '愤怒' };
    assert.equal(normalizeTtsSettings({}).moodStyle, false);
    assert.equal(decideTts({}, line, base, { sceneAssets: assets }).style, '慵懒');
    assert.equal(decideTts({}, line, { ...base, moodStyle: true }, { sceneAssets: assets }).style, '慵懒；语气愤怒');
    const whisper = decideTts({}, { ...line, key: 'b', whisper: true }, { ...base, moodStyle: true }, { sceneAssets: {} });
    assert.equal(whisper.style, '压低声音耳语，语气愤怒');
    const calm = decideTts({}, { ...line, key: 'c', mood: '' }, { ...base, moodStyle: true }, { sceneAssets: {} });
    assert.equal(calm.style, '');
    const narration = decideTts({}, { key: 'd', textType: 'narration', text: '夜色渐深。' }, { ...base, moodStyle: true, narratorStyle: '沉稳' }, { sceneAssets: {} });
    assert.equal(narration.style, '沉稳');
});

test('tts: minimax emotion follows the mood and enters the cache key only when present', () => {
    const base = { enabled: true, provider: 'api', api: { format: 'minimax', female: 'f' } };
    const angry = decideTts({}, { key: 'a', textType: 'dialogue', speaker: '甲', text: '你好。', mood: '愤怒' }, base, { sceneAssets: {} });
    assert.equal(angry.emotion, 'angry');
    const calmPlan = decideTts({}, { key: 'b', textType: 'dialogue', speaker: '甲', text: '你好。', mood: '平和' }, base, { sceneAssets: {} });
    assert.equal(calmPlan.emotion, '');
    const shy = decideTts({}, { key: 'c', textType: 'dialogue', speaker: '甲', text: '你好。', mood: '害羞' }, base, { sceneAssets: {} });
    assert.equal(shy.emotion, 'calm', '害羞配平静并降速');
    const narr = decideTts({}, { key: 'd', textType: 'narration', text: '夜色渐深。' }, base, { sceneAssets: {} });
    assert.equal(narr.emotion, '');
    const api = normalizeTtsSettings(base).api;
    assert.equal(api.sendEmotion, true);
    assert.equal(JSON.parse(buildTtsRequest(api, { ...angry, voice: 'f' }).body).voice_setting.emotion, 'angry');
    assert.equal('emotion' in JSON.parse(buildTtsRequest(api, { text: 'x', voice: 'f', emotion: 'bogus' }).body).voice_setting, false);
    assert.equal('emotion' in JSON.parse(buildTtsRequest(api, { text: 'x', voice: 'f' }).body).voice_setting, false);
    const off = normalizeTtsSettings({ api: { format: 'minimax', sendEmotion: false } }).api;
    assert.equal('emotion' in JSON.parse(buildTtsRequest(off, { text: 'x', voice: 'f', emotion: 'angry' }).body).voice_setting, false);
    assert.equal(ttsCacheKey('u', api, 'v', '你好', '', ''), ttsCacheKey('u', api, 'v', '你好'));
    assert.notEqual(ttsCacheKey('u', api, 'v', '你好', '', 'angry'), ttsCacheKey('u', api, 'v', '你好'));
    const narrator = normalizeTtsSettings({ narratorApi: { enabled: true, format: 'minimax' } }).narratorApi;
    assert.equal(JSON.parse(buildTtsRequest(narrator, { text: 'x', voice: 'f', emotion: 'calm' }).body).voice_setting.emotion, 'calm');
});

test('tts: narrator interface keeps its own voice list and fetches it', async () => {
    const config = normalizeTtsSettings({ narratorApi: { enabled: true, voices: Array.from({ length: 210 }, (_, i) => `v${i}`).join('\n') } });
    assert.equal(config.narratorApi.voices.split(', ').length, 200);
    assert.equal(normalizeTtsSettings({}).narratorApi.voices, '');
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, auth: init.headers.Authorization });
        return { ok: true, json: async () => ({ items: [{ _id: 'n1', title: '说书' }] }) };
    };
    try {
        const result = await fetchTtsVoices({ provider: 'system', api: { format: 'openai' }, narratorApi: { enabled: true, format: 'fish', apiKey: 'nk' } }, { narrator: true });
        assert.deepEqual(result.voices, [['n1', '说书']]);
        assert.match(calls[0].url, /^https:\/\/api\.fish\.audio\/model/);
        assert.equal(calls[0].auth, 'Bearer nk');
    } finally {
        globalThis.fetch = realFetch;
    }
    const { ttsNarratorVoiceOptions } = await import('../src/visual/igs-ui/tts.js');
    assert.deepEqual(ttsNarratorVoiceOptions({ narratorApi: { voices: 'n1#说书' } }), [['n1', '说书（n1）']]);
});

test('tts: thought page uses its own volume and style', () => {
    const base = { enabled: true, provider: 'api', api: { female: 'f' }, volume: 1 };
    assert.equal(normalizeTtsSettings({}).thoughtVolume, 0.8);
    assert.equal(normalizeTtsSettings({ thoughtVolume: 0.5 }).thoughtVolume, 0.5, 'continuous values are kept');
    assert.equal(normalizeTtsSettings({ thoughtVolume: 3 }).thoughtVolume, 1);
    assert.equal(normalizeTtsSettings({ thoughtVolume: -1 }).thoughtVolume, 0);
    assert.equal(normalizeTtsSettings({ thoughtVolume: 'x' }).thoughtVolume, 0.8);
    assert.equal(normalizeTtsSettings({ thoughtVolume: '0.6' }).thoughtVolume, 0.6);
    assert.equal(normalizeTtsSettings({ thoughtStyle: 'x'.repeat(400) }).thoughtStyle.length, 300);
    const line = { key: 't', textType: 'thought', speaker: '甲', text: '真麻烦。' };
    assert.equal(decideTts({}, line, base, { sceneAssets: {} }).volume, 0.8);
    assert.equal(decideTts({}, { ...line, key: 't2' }, { ...base, thoughtVolume: 0.4 }, { sceneAssets: {} }).volume, 0.4);
    assert.equal(decideTts({}, { ...line, key: 't3' }, { ...base, thoughtVolume: 1 }, { sceneAssets: {} }).volume, 1);
    assert.equal(decideTts({}, { ...line, key: 't4', textType: 'dialogue' }, { ...base, thoughtVolume: 0.4 }, { sceneAssets: {} }).volume, 1, 'dialogue is not affected');
});

test('tts: a character can use a separate voice for thoughts', () => {
    const settings = { enabled: true, provider: 'api', api: { female: 'f' } };
    const assets = { characterVoices: { 甲: { tts: 'say', ttsThought: 'think' }, 乙: { tts: 'say' } } };
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '甲' }, settings, assets).voice, 'say');
    assert.equal(resolveTtsVoice({ textType: 'thought', speaker: '甲' }, settings, assets).voice, 'think');
    assert.equal(resolveTtsVoice({ textType: 'thought', speaker: '乙' }, settings, assets).voice, 'say', 'no thought voice falls back to the dialogue voice');
});

test('tts: voice library edits entries in place and rejects bad ids', () => {
    let text = editTtsVoices('', { id: 'alloy', title: '少女' }).text;
    text = editTtsVoices(text, { id: 'echo' }).text;
    assert.equal(text, 'alloy#少女, echo');
    assert.equal(editTtsVoices(text, { index: 1, title: '少, 年#' }).text, 'alloy#少女, echo#少 年');
    assert.equal(editTtsVoices(text, { index: 0, id: 'nova' }).text, 'nova#少女, echo');
    assert.equal(editTtsVoices(text, { index: 0, remove: true }).text, 'echo');
    assert.equal(editTtsVoices(text, { index: 1, id: 'alloy' }).ok, false, 'duplicate id');
    assert.equal(editTtsVoices(text, { id: 'a,b' }).ok, false, 'separator in id');
    assert.equal(editTtsVoices(text, { index: 0, id: '' }).ok, false, 'empty id');
});

test('tts: no prefetch for dialogue when the emotion would change the request', () => {
    const settings = { enabled: true, provider: 'api', api: { format: 'minimax', endpoint: 'https://m.example', apiKey: 'k', female: 'v1', narrator: 'v2' } };
    assert.equal(prefetchTts('[甲]：你好。', settings, {}), null);
    assert.equal(prefetchTts('[甲]：你好。', { ...settings, api: { ...settings.api, sendEmotion: false } }, {}) === null, false);
    assert.equal(prefetchTts('夜色渐深。', settings, {}) === null, false, 'narration pages are still prefetched');
});

test('gate: tts audio tags fish sentence-head tags from mood, whisper and thought', () => {
    const base = { enabled: true, provider: 'api', api: { format: 'fish', apiKey: 'k', female: 'v1', narrator: 'v2' } };
    const plan = (line, settings = base) => decideTts({}, { key: String(Math.random()), textType: 'dialogue', speaker: '甲', text: '那个…', ...line }, settings, { sceneAssets: {} });
    assert.equal(plan({ mood: '害羞' }).text, '[shy, soft voice] 那个…');
    assert.equal(plan({ mood: '害羞', whisper: true }).text, '[whisper] [shy, soft voice] 那个…');
    assert.equal(plan({ mood: '平和' }).text, '那个…');
    assert.equal(plan({ textType: 'thought', mood: '紧张' }).text, '[soft inner voice] [nervous] 那个…');
    assert.equal(plan({ mood: '委屈' }).text, '[aggrieved, on the verge of tears] 那个…');
    assert.equal(plan({ mood: '疑惑' }).text, '[confused, questioning] 那个…');
    assert.equal(plan({ mood: '疑惑' }).rate, plan({ mood: '思考' }).rate, '疑惑保留情绪韵律');
    const narration = decideTts({}, { key: 'n', textType: 'narration', text: '夜色渐深。', mood: '紧张' }, base, { sceneAssets: {} });
    assert.equal(narration.text, '[calm, steady narration] 夜色渐深。');
});

test('gate: tts audio tags convert bracket actions for fish and minimax, drop unknown ones', () => {
    assert.equal(ttsPlainText('（轻笑）你好（小声）别动', { tags: 'fish' }), '[chuckle] 你好 [whisper] 别动');
    assert.equal(ttsPlainText('（叹气）算了（倒吸一口气）', { tags: 'fish' }), '[sigh] 算了 [gasp]');
    assert.equal(ttsPlainText('(哭)好疼(喘息)', { tags: 'fish' }), '[sobbing] 好疼 [panting]');
    assert.equal(ttsPlainText('（轻笑）你好（小声）别动（停顿）', { tags: 'minimax' }), '(chuckle) 你好 别动');
    assert.equal(ttsPlainText('（叹气）算了（喘息）（抽泣）', { tags: 'minimax' }), '(sighs) 算了 (pant) (sniffs)');
    assert.equal(ttsPlainText('（翻书）你好（微笑）', { tags: 'fish' }), '你好');
    assert.equal(ttsPlainText('（轻笑）你好（小声）', { tags: '' }), '你好');
    assert.equal(ttsPlainText('（轻笑）你好（小声）'), '你好');
});

test('gate: tts audio tags only apply to fish and minimax and can be turned off', () => {
    const line = { key: 'a', textType: 'dialogue', speaker: '甲', text: '（笑）你好', mood: '喜悦' };
    const run = (api, extra = {}) => decideTts({}, { ...line, key: String(Math.random()) }, { enabled: true, provider: 'api', api: { apiKey: 'k', female: 'v1', ...api }, ...extra }, { sceneAssets: {} });
    assert.equal(run({ format: 'fish' }).text, '[happy] [laugh] 你好');
    assert.equal(run({ format: 'minimax' }).text, '(laughs) 你好');
    assert.equal(run({ format: 'fish', audioTags: false }).text, '你好');
    assert.equal(run({ format: 'minimax', audioTags: false }).text, '你好');
    assert.equal(run({ format: 'openai' }).text, '你好');
    assert.equal(run({ format: 'gpt-sovits' }).text, '你好');
    assert.equal(run({ format: 'custom' }).text, '你好');
    assert.equal(decideTts({}, { ...line, key: 'z' }, { enabled: true }, { sceneAssets: {} }).text, '你好');
    assert.equal(normalizeTtsSettings({}).api.audioTags, true);
    // 只有标签没有字时仍判为没有可读文字
    assert.equal(decideTts({}, { key: 'e', textType: 'narration', text: '（笑）' }, { enabled: true, provider: 'api', api: { format: 'fish', apiKey: 'k', female: 'v1' } }, { sceneAssets: {} }), null);
});

test('gate: tts audio tags follow the narrator api and keep lexicon out of tags', () => {
    const settings = { enabled: true, provider: 'api', lexicon: 'laugh=拉夫\n你好=尼好', api: { format: 'openai', apiKey: 'k', female: 'v1' }, narratorApi: { enabled: true, format: 'minimax', apiKey: 'k', voice: 'nv' } };
    const narration = decideTts({}, { key: 'n', textType: 'narration', text: '（叹气）夜色渐深。' }, settings, { sceneAssets: {} });
    assert.equal(narration.text, '(sighs) 夜色渐深。');
    const fish = decideTts({}, { key: 'd', textType: 'dialogue', speaker: '甲', text: '（笑）你好', mood: '喜悦' }, { ...settings, narratorApi: { enabled: false }, api: { format: 'fish', apiKey: 'k', female: 'v1' } }, { sceneAssets: {} });
    assert.equal(fish.text, '[happy] [laugh] 尼好');
    assert.equal(prefetchTts('[甲]：你好。', { ...settings, provider: 'api', narratorApi: { enabled: false }, api: { format: 'fish', endpoint: 'https://f.example', apiKey: 'k', female: 'v1' } }, {}), null);
});

test('gate: tts prefetch with a mood hint matches the text actually played (fish tags, minimax emotion)', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, json: async () => ({}), text: async () => JSON.stringify({ data: { audio: '0102' }, base_resp: { status_code: 0 } }), arrayBuffer: async () => new ArrayBuffer(2) };
    };
    try {
        const sa = assets({ 艾莉: GIRL });
        const hint = { textType: 'dialogue', speaker: '艾莉', mood: '害羞' };
        const real = (settings, mood = '害羞') => decideTts({}, { key: 'r', textType: 'dialogue', speaker: '艾莉', text: '那个，明天见。', mood }, settings, { sceneAssets: sa });
        const fish = { enabled: true, provider: 'api', api: { format: 'fish', apiKey: 'k', female: 'v1' } };
        await clearTtsCache();
        assert.equal(prefetchTts('[艾莉]：那个，明天见。', fish, sa), null, 'no hint: dialogue page is still skipped');
        await prefetchTts('[艾莉]：那个，明天见。', fish, sa, { hint });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].body.text, real(fish).text);
        assert.equal(calls[0].body.text, '[shy, soft voice] 那个，明天见。');
        const mm = { enabled: true, provider: 'api', api: { format: 'minimax', apiKey: 'k', female: 'v1' } };
        await clearTtsCache();
        calls.length = 0;
        await prefetchTts('[艾莉]：那个，明天见。', mm, sa, { hint: { ...hint, mood: '愤怒' } });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].body.voice_setting.emotion, real(mm, '愤怒').emotion);
        assert.ok(real(mm, '愤怒').emotion);
        // 类型以阅读器的提示为准（「[名字]：*心里话*」猜成台词、阅读器按心里话算）；文字猜成旁白时不信提示（照旁白预取）
        assert.ok(prefetchTts('[艾莉]：那个，明天见。', mm, sa, { hint: { ...hint, textType: 'thought' } }));
        assert.ok(prefetchTts('夜色渐深。', mm, sa, { hint }), 'narration guess: hint is ignored, page still prefetched as narration');
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('tts lexicon also replaces inside square brackets when no audio tags are in use', () => {
    const settings = { enabled: true, provider: 'system', lexicon: '你好=尼好' };
    const plan = decideTts({}, { key: 'b', textType: 'dialogue', speaker: '甲', text: '他说[你好]吧' }, settings, { sceneAssets: {}, voices: [] });
    assert.ok(plan && plan.text.includes('尼好'), plan && plan.text);
});

test('prefetchTtsBubble respects the prefetch switch', () => {
    const base = { enabled: true, provider: 'api', api: { endpoint: 'https://tts.test/v1', female: 'anna', prefetch: false } };
    assert.equal(prefetchTtsBubble({ key: 'k', textType: 'dialogue', speaker: '甲', text: '你好呀' }, base, {}), null);
});

test('cancelPendingTts clears the deferred play and prefetch timers left by a fast flip', () => {
    let seq = 0;
    const pending = new Map();
    const timers = { setTimeout: (fn, ms) => { seq += 1; pending.set(seq, fn); return seq; }, clearTimeout: (id) => pending.delete(id) };
    let clock = 0;
    const settings = { enabled: true, provider: 'api', api: { endpoint: 'https://tts.test/v1', female: 'anna' } };
    const root = {};
    applyTts(root, { key: 'c:0', textType: 'narration', text: '第一页。' }, settings, {}, { now: () => clock, timers });
    clock = 100;
    applyTts(root, { key: 'c:1', textType: 'narration', text: '第二页。' }, settings, {}, { now: () => clock, timers });
    assert.ok(pending.size > 0, 'fast flip leaves a deferred timer');
    cancelPendingTts(root, timers);
    assert.equal(pending.size, 0);
});

test('thoughtBilingual picks original or translation for thought pages only', () => {
    const text = 'こんにちは〖你好〗';
    const run = (settings, type) => decideTts({}, { key: `k${Math.random()}`, textType: type, speaker: '甲', text }, { enabled: true, ...settings }, { sceneAssets: {} });
    assert.equal(normalizeTtsSettings({}).thoughtBilingual, 'same');
    assert.equal(normalizeTtsSettings({ thoughtBilingual: 'x' }).thoughtBilingual, 'same');
    assert.equal(run({}, 'thought').text, '你好');
    assert.equal(run({ thoughtBilingual: 'original' }, 'thought').text, 'こんにちは');
    assert.equal(run({ thoughtBilingual: 'original' }, 'thought').lang, 'ja');
    assert.equal(run({ thoughtBilingual: 'original' }, 'dialogue').text, '你好');
    assert.equal(run({ bilingual: 'original', thoughtBilingual: 'translation' }, 'thought').text, '你好');
    assert.equal(run({ bilingual: 'original', thoughtBilingual: 'translation' }, 'dialogue').text, 'こんにちは');
    assert.equal(run({ bilingual: 'original' }, 'thought').text, 'こんにちは');
});

test('voice library keeps 200 entries through normalize and edit, and rejects the 201st', () => {
    const entries = Array.from({ length: 200 }, (_, i) => `voice-${i}#名称${i}`);
    const text = entries.join(', ');
    const api = normalizeTtsSettings({ api: { voices: text }, narratorApi: { voices: text } });
    assert.equal(ttsVoiceEntries(api.api.voices).length, 200);
    assert.equal(ttsVoiceEntries(api.narratorApi.voices).length, 200);
    assert.equal(normalizeTtsSettings(JSON.parse(JSON.stringify(api))).api.voices, api.api.voices);
    assert.equal(editTtsVoices(api.api.voices, { id: 'extra' }).ok, false);
    const over = normalizeTtsSettings({ api: { voices: `${text}, voice-200` } });
    assert.equal(ttsVoiceEntries(over.api.voices).length, 200);
    const long = Array.from({ length: 200 }, (_, i) => `${'x'.repeat(100)}${i}#${'名'.repeat(40)}`).join(', ');
    assert.equal(ttsVoiceEntries(normalizeTtsSettings({ api: { voices: long } }).api.voices).length, 200);
    const merged = mergeTtsVoices(text, [['new-1', 'N']]);
    assert.equal(merged.added, 0);
    assert.equal(merged.dropped, 1);
});

test('parseTtsVoiceBatch reads json lists and many line layouts', () => {
    const hex = '0123456789abcdef0123456789abcdef';
    const fish = parseTtsVoiceBatch(JSON.stringify({ total: 2, items: [{ _id: hex, title: '少女' }, { reference_id: 'r1', title: 'R', _id: 'z' }, {}] }));
    assert.deepEqual(fish, { voices: [[hex, '少女'], ['r1', 'R']], unrecognized: 1 });
    assert.deepEqual(parseTtsVoiceBatch('[{"voice_id":"male-qn","voice_name":"青年","description":["a"]},{"name":"alloy"}]').voices, [['male-qn', '青年'], ['alloy', '']]);
    assert.deepEqual(parseTtsVoiceBatch('{"voices":[{"id":"v1","name":"N"}]}').voices, [['v1', 'N']]);
    const lines = parseTtsVoiceBatch([
        `温柔女声 ${hex}`, 'female-shaonv 少女', '甜美：voice_01', 'Alice,female-abc1', '旁白\tnarr-1', '旁白|narr-2', '旁白#narr-3', 'alloy#Alloy',
        'fish.audio/app/m/abcDEF12_x', `https://fish.audio/zh-CN/m/${hex}?utm=1`, 'plainvoice', '', '纯中文', 'ab',
    ].join('\n'));
    assert.deepEqual(lines.voices, [
        [hex, '温柔女声'], ['female-shaonv', '少女'], ['voice_01', '甜美'], ['female-abc1', 'Alice'], ['narr-1', '旁白'], ['narr-2', '旁白'], ['narr-3', '旁白'],
        ['alloy', 'Alloy'], ['abcDEF12_x', ''], ['plainvoice', ''],
    ]);
    assert.equal(lines.unrecognized, 2);
    assert.deepEqual(parseTtsVoiceBatch('[少女](https://fish.audio/m/' + hex + ')').voices, [[hex, '少女']]);
    assert.deepEqual(parseTtsVoiceBatch('  '), { voices: [], unrecognized: 0 });
    assert.deepEqual(parseTtsVoiceBatch('{broken').voices, []);
});

test('parseTtsVoiceBatch splits id#name records separated by commas, newlines, semicolons and 、', () => {
    const hex = '8ef4a238714b45718ce04243307c4ade';
    assert.deepEqual(parseTtsVoiceBatch(`${hex}#温柔少女, abc123#阿明`).voices, [[hex, '温柔少女'], ['abc123', '阿明']]);
    assert.deepEqual(parseTtsVoiceBatch('v-one#甲，v-two#乙、v-three#丙;v-four#丁\nv-five#戊').voices.map(([id]) => id), ['v-one', 'v-two', 'v-three', 'v-four', 'v-five']);
    assert.deepEqual(parseTtsVoiceBatch('甲#alpha-1\nalpha-2#乙 丙').voices, [['alpha-1', '甲'], ['alpha-2', '乙 丙']]);
    assert.deepEqual(parseTtsVoiceBatch('abc#def').voices, [['abc', 'def']]);
    assert.deepEqual(parseTtsVoiceBatch('voice-a, voice-b, voice-c').voices.map(([id]) => id), ['voice-a', 'voice-b', 'voice-c']);
    assert.deepEqual(parseTtsVoiceBatch('少女，female-abc1').voices, [['female-abc1', '少女']]);
});

test('matchBatchVoicesToCharacters maps voice names to characters without overriding or guessing', () => {
    const assets = {
        characters: { 艾莉: {}, 小明: {}, 小红: {} },
        characterAliases: { 艾莉: ['Ellie'] },
        characterVoices: { 小红: { tts: 'kept-voice' } },
    };
    const run = (voices) => matchBatchVoicesToCharacters(voices, assets);
    assert.deepEqual(run([['v1', '艾莉']]), [['艾莉', 'v1']]);
    assert.deepEqual(run([['v1', 'Ellie']]), [['艾莉', 'v1']]);
    assert.deepEqual(run([['v1', '艾莉的温柔声']]), [['艾莉', 'v1']]);
    assert.deepEqual(run([['v1', '小红']]), []);
    assert.deepEqual(run([['v1', '小明和小红合唱']]), []);
    assert.deepEqual(run([['v1', '艾莉'], ['v2', 'Ellie']]), [['艾莉', 'v1']]);
    assert.deepEqual(run([['v1', '路人'], ['v2', '']]), []);
    assert.deepEqual(matchBatchVoicesToCharacters([['v1', '艾莉']], assets, { skip: ['艾莉'] }), []);
    assert.deepEqual(assets.characterVoices, { 小红: { tts: 'kept-voice' } });
});

test('gate: voice library actions share one row, preview sits in the voice head, and batch recognition expands and cancels as page state only', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const vn = bootstrapIGS({ global: {}, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'performance', mode: 'pc' }).controller;
        controller.toggle('readerSettings.tts.enabled');
        controller.setValue('readerSettings.tts.provider', 'api');
        const view = () => controller.getSnapshot().html;
        const html = controller.goToPath('readerSettings.tts.provider').html || view();
        const row = html.match(/<div class="igs-tts-voice-actions">(.*?)<\/div>/s)[1];
        const order = [...row.matchAll(/data-action="([a-z-]+)/g)].map((m) => m[1]);
        assert.deepEqual(order, ['tts-voice-add', 'tts-voice-batch', 'tts-fetch-voices']);
        assert.match(html, /<div class="igs-settings-section-head"><div class="igs-settings-subhead">声音<\/div><button[^>]*data-action="tts-preview"/);
        assert.doesNotMatch(html, /data-tts-batch=/);
        await controller.invoke('tts-voice-batch:api');
        assert.match(view(), /data-tts-batch="api"/);
        assert.match(view(), /data-action="tts-voice-batch-run:api"/);
        await controller.invoke('tts-voice-batch-cancel:api');
        assert.doesNotMatch(view(), /data-tts-batch=/);
        assert.equal(JSON.stringify(controller.getSnapshot().draft.readerSettings.tts).includes('batch'), false);
        controller.close();
    } finally {
        vn.destroy();
    }
});

test('batch matching uses card-private characters, two passes, and stricter bare-line ids', async () => {
    const { draftEffectiveAssets } = await import('../src/scene/asset-scope.js');
    const settingsState = {
        draft: { bridge: { sceneAssets: { cards: { cardA: { characters: { 私有角: {} }, characterAliases: { 私有角: ['小私'] } } } } } },
        asyncState: { assetScopeKey: 'cardA' },
    };
    const effective = draftEffectiveAssets(settingsState);
    assert.deepEqual(matchBatchVoicesToCharacters([['v1', '小私']], effective), [['私有角', 'v1']]);
    assert.deepEqual(matchBatchVoicesToCharacters([['v1', '小私']], settingsState.draft.bridge.sceneAssets), []);
    const assets = { characters: { 爱丽丝: {}, 阿明: {} } };
    assert.deepEqual(matchBatchVoicesToCharacters([['v1', '爱丽丝（少女版）'], ['v2', '爱丽丝']], assets), [['爱丽丝', 'v2']]);
    const { voices, unrecognized } = parseTtsVoiceBatch('Bob Smith\nHello world\n2024 年\nalloy\nBob Smith voice-2');
    assert.deepEqual(voices, [['alloy', ''], ['voice-2', 'Bob Smith']]);
    assert.equal(unrecognized, 3);
});

test('speakerKey 与生成区别名：酒馆用户名也按角色设定的声音朗读，并带来源与主名', () => {
    const settings = { enabled: true, provider: 'api', api: { endpoint: 'https://x', female: 'f', male: 'm', voices: 'say#主角声' } };
    const assets = { characterVoices: { 主角: { tts: 'say', ttsThought: 'think' } }, characterDna: { 主角: '1boy' } };
    const viaKey = resolveTtsVoice({ textType: 'dialogue', speaker: '玩家名', speakerKey: '主角' }, settings, assets);
    assert.equal(viaKey.voice, 'say');
    assert.equal(viaKey.name, '主角');
    assert.equal(viaKey.source, '角色指定台词声音');
    assert.equal(resolveTtsVoice({ textType: 'thought', speaker: '玩家名', speakerKey: '主角' }, settings, assets).source, '角色指定心里话声音');
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '玩家名' }, settings, assets).voice, 'f');
    const generated = { characterVoices: { 小明: { tts: 'say' } }, generated: { characterAliases: { 小明: ['明明'] } } };
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '明明' }, settings, generated).voice, 'say');
    assert.equal(resolveTtsVoice({ textType: 'narration' }, settings, assets).source, '旁白未设，回落女角色默认');
    const plan = decideTts({}, { key: 'k1', textType: 'dialogue', text: '你好', speaker: '玩家名', speakerKey: '主角' }, settings, { sceneAssets: assets });
    assert.equal(plan.voiceName, '主角');
    assert.equal(plan.voiceSource, '角色指定台词声音');
    assert.deepEqual([getTtsLastDecision().key, getTtsLastDecision().voiceLabel, getTtsLastDecision().speaker], ['k1', '主角声', '玩家名']);
});

test('台词与心里话各自语速、旁白单独语速', () => {
    const settings = { enabled: true, provider: 'api', narratorRate: 1.5, api: { endpoint: 'https://x', female: 'f' } };
    const assets = { characterVoices: { 甲: { speed: 1.2, ttsSpeed: 0.8 }, 乙: { speed: 1.2, ttsSpeed: 0.8, ttsThoughtSpeed: 1.4 } } };
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '甲' }, settings, assets).rate, 0.8);
    assert.equal(resolveTtsVoice({ textType: 'thought', speaker: '甲' }, settings, assets).rate, 0.8);
    assert.equal(resolveTtsVoice({ textType: 'thought', speaker: '乙' }, settings, assets).rate, 1.4);
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '丙' }, settings, { characterVoices: { 丙: { speed: 1.2 } } }).rate, 1.2);
    assert.equal(decideTts({}, { key: 'n1', textType: 'narration', text: '夜深了。' }, settings, { sceneAssets: assets }).rate, 1.5);
    assert.equal(normalizeTtsSettings({ narratorRate: 7 }).narratorRate, 1);
    assert.equal(normalizeTtsSettings({}).cacheMax, 300);
    assert.equal(normalizeTtsSettings({ cacheMax: 99999 }).cacheMax, 2000);
    assert.equal(normalizeTtsSettings({ cacheMax: 0 }).cacheMax, 0);
});

test('trimTtsCache 没有 Cache Storage 时安全返回 0', async () => {
    assert.equal(await trimTtsCache(10), 0);
});

test('心里话单独音量：未设跟随台词，0 表示心里话不朗读', () => {
    const settings = { enabled: true, provider: 'api', api: { endpoint: 'https://x', female: 'f' } };
    const assets = { characterVoices: { 甲: { ttsVolume: 0.5 }, 乙: { ttsVolume: 0.5, ttsThoughtVolume: 1 }, 丙: { ttsThoughtVolume: 0 } } };
    const volumeOf = (speaker, textType) => resolveTtsVoice({ textType, speaker }, settings, assets).volume;
    assert.equal(volumeOf('甲', 'thought'), 0.5);
    assert.equal(volumeOf('乙', 'thought'), 1);
    assert.equal(volumeOf('乙', 'dialogue'), 0.5);
    assert.equal(volumeOf('丙', 'thought'), 0);
    assert.equal(volumeOf('丙', 'dialogue'), 1);
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

test('cleanupSamples 压低比语音低 40 dB 的底噪，语音段不变且交界处增益平滑', async () => {
    const { cleanupSamples } = await import('../src/visual/igs-ui/tts.js');
    const half = SR / 2;
    const speech = sineOf(half, 0.5);
    const noise = noiseOf(half, rmsOf(speech) * 0.01);
    const input = new Float32Array(half * 2);
    input.set(speech);
    input.set(noise, half);
    const out = cleanupSamples(input, SR);
    assert.equal(out.length, input.length);
    assert.ok(Math.abs(dbOf(rmsOf(out, 0, half), rmsOf(input, 0, half))) < 1, 'speech level unchanged');
    // 80 ms 的释放过程之后（交界后 250 ms 起）才是稳定的衰减量。
    const settled = half + Math.round(SR * 0.25);
    assert.ok(dbOf(rmsOf(input, settled), rmsOf(out, settled)) >= 10, `noise dropped ${dbOf(rmsOf(input, settled), rmsOf(out, settled)).toFixed(1)} dB`);
    assert.ok(dbOf(rmsOf(input, half), rmsOf(out, half)) >= 8, 'the whole noise segment is already clearly quieter');
    let prev = null;
    let step = 0;
    for (let i = half - 2400; i < half + 4800; i += 1) {
        if (Math.abs(input[i]) < 1e-4) { prev = null; continue; }
        const gain = out[i] / input[i];
        if (prev !== null) step = Math.max(step, Math.abs(gain - prev));
        prev = gain;
    }
    assert.ok(step < 0.01, `gain step ${step}`);
});

test('去爆破：低频冲击被压低，男声基频+共振峰的正常语音不动', async () => {
    const { deplosiveSamples } = await import('../src/visual/igs-ui/tts.js');
    const voice = Float32Array.from({ length: SR }, (_, i) => {
        const t = i / SR;
        return 0.12 * Math.sin(2 * Math.PI * 110 * t) + 0.25 * Math.sin(2 * Math.PI * 550 * t) + 0.15 * Math.sin(2 * Math.PI * 1300 * t);
    });
    const kept = deplosiveSamples(voice, SR);
    let diff = 0;
    for (let i = 0; i < SR; i += 1) diff = Math.max(diff, Math.abs(kept[i] - voice[i]));
    assert.ok(diff < 1e-6, `voice untouched, max diff ${diff}`);
    const pop = new Float32Array(SR / 2);
    const start = SR / 10;
    const span = Math.round(SR * 0.04);
    for (let i = 0; i < pop.length; i += 1) pop[i] = 0.05 * Math.sin(2 * Math.PI * 1000 * i / SR);
    for (let i = 0; i < span; i += 1) pop[start + i] += 0.8 * Math.sin(Math.PI * i / span) * Math.sin(2 * Math.PI * 60 * i / SR);
    const out = deplosiveSamples(pop, SR);
    assert.ok(dbOf(rmsOf(pop, start, start + span), rmsOf(out, start, start + span)) >= 6, 'plosive burst reduced');
    assert.ok(Math.abs(dbOf(rmsOf(out, SR / 3), rmsOf(pop, SR / 3))) < 0.5, 'speech after the burst unchanged');
});

test('cleanupSamples 全是静音时原样返回', async () => {
    const { cleanupSamples } = await import('../src/visual/igs-ui/tts.js');
    const out = cleanupSamples(new Float32Array(2000), SR);
    assert.equal(rmsOf(out), 0);
});

test('响度统一：电平差 12 dB 的两段处理后接近，峰值不超过 -1 dBFS，同一句后续段沿用第一段增益', async () => {
    const { conditionVoiceBuffer, loudnessGain } = await import('../src/visual/igs-ui/tts.js');
    const context = {
        createBuffer(channels, length, sampleRate) {
            const data = Array.from({ length: channels }, () => new Float32Array(length));
            return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c) => data[c] };
        },
    };
    const wrap = (data) => ({ numberOfChannels: 1, length: data.length, sampleRate: SR, duration: data.length / SR, getChannelData: () => data });
    const quiet = sineOf(SR, 0.07);
    const loud = sineOf(SR, 0.28);
    const a = conditionVoiceBuffer(context, wrap(quiet)).getChannelData(0);
    const b = conditionVoiceBuffer(context, wrap(loud)).getChannelData(0);
    assert.ok(Math.abs(dbOf(rmsOf(a), rmsOf(b))) < 2, `${dbOf(rmsOf(a), rmsOf(b))}`);
    const limit = 10 ** (-1 / 20);
    for (const data of [a, b]) assert.ok(Math.max(...data.map(Math.abs)) <= limit + 1e-6);
    const peaky = sineOf(SR, 0.9);
    const gain = loudnessGain([peaky], SR);
    assert.ok(gain * 0.9 <= limit + 1e-6, 'peak limit wins over the target');
    const ref = {};
    const first = conditionVoiceBuffer(context, wrap(quiet), { ref }).getChannelData(0);
    const second = conditionVoiceBuffer(context, wrap(sineOf(SR, 0.05)), { ref }).getChannelData(0);
    assert.ok(Math.abs(rmsOf(first) / 0.07 * Math.SQRT2 - rmsOf(second) / 0.05 * Math.SQRT2) < 1e-3, 'same gain on both segments');
    assert.equal(conditionVoiceBuffer(context, { duration: 1 }).duration, 1, 'buffers without samples pass through');
});

test('人声净化设置默认开启；关闭时 plan 不带净化，听筒模式不重复插滤波', async () => {
    const { buildBarkChain } = await import('../src/visual/igs-ui/voice-bark.js');
    assert.equal(normalizeTtsSettings({}).cleanup, true);
    assert.equal(normalizeTtsSettings({ cleanup: false }).cleanup, false);
    const line = { key: 'c1', textType: 'narration', text: '夜深了。' };
    assert.equal(decideTts({}, line, { ...ON }).cleanup, true);
    assert.equal(decideTts({}, line, { ...ON, cleanup: false }).cleanup, false);
    const make = () => {
        const made = [];
        const param = () => ({ value: 0 });
        const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
        return {
            made,
            createGain: () => node({ gain: param() }),
            createBiquadFilter: () => { const f = node({ type: '', frequency: param(), Q: param(), gain: param() }); made.push(f); return f; },
            createStereoPanner: () => node({ pan: param() }),
        };
    };
    const types = (plan) => {
        const context = make();
        buildBarkChain(context, {}, { volume: 1, pan: 0, phone: false, ...plan }, []);
        return context.made.map((f) => f.type);
    };
    assert.deepEqual(types({ cleanup: true }), ['highpass', 'highshelf']);
    assert.deepEqual(types({ cleanup: false }), []);
    assert.deepEqual(types({}), []);
    assert.deepEqual(types({ cleanup: true, phone: true }), ['highpass', 'lowpass']);
});

test('朗读读完后场景声保持压低 800 ms 才回升，保持期内新一句接手，stopTts 立即回升', async (t) => {
    const { sceneAudioDuckFactor } = await import('../src/visual/igs-ui/scene-audio.js');
    const synth = fakeSynth();
    await withSystemEnv(t, synth, async ({ tts }) => {
        const speak = (text) => {
            tts.playTts(systemPlan(text), { enabled: true });
            const u = synth.spoken.at(-1);
            u.onstart();
            return u;
        };
        assert.equal(sceneAudioDuckFactor(), 1);
        speak('第一句。').onend();
        assert.equal(sceneAudioDuckFactor(), 0.55, 'still ducked right after the line ends');
        t.mock.timers.tick(799);
        assert.equal(sceneAudioDuckFactor(), 0.55);
        t.mock.timers.tick(1);
        assert.equal(sceneAudioDuckFactor(), 1, 'released after the hold');

        speak('第二句。').onend();
        tts.playTts(systemPlan('第三句。'), { enabled: true });
        t.mock.timers.tick(2000);
        assert.equal(sceneAudioDuckFactor(), 0.55, 'hold handed to the next line until it starts speaking');
        const third = synth.spoken.at(-1);
        third.onstart();
        assert.equal(sceneAudioDuckFactor(), 0.55);
        third.onend();
        t.mock.timers.tick(800);
        assert.equal(sceneAudioDuckFactor(), 1);

        speak('第四句。').onend();
        tts.stopTts();
        assert.equal(sceneAudioDuckFactor(), 1, 'stopTts after the line ended restores at once');

        speak('第五句。').onend();
        tts.playTts(systemPlan('第六句。'), { enabled: true });
        tts.stopTts();
        assert.equal(sceneAudioDuckFactor(), 1, 'a cancelled new line releases the inherited hold');
        speak('第七句。');
        tts.stopTts();
        assert.equal(sceneAudioDuckFactor(), 1, 'cancelled line releases at once');

        speak('第八句。');
        tts.playTts(systemPlan('第九句。'), { enabled: true });
        t.mock.timers.tick(500);
        assert.equal(sceneAudioDuckFactor(), 0.55, 'a line cut off by the next one keeps the duck until the next starts');
        const ninth = synth.spoken.at(-1);
        ninth.onstart();
        ninth.onend();
        t.mock.timers.tick(800);
        assert.equal(sceneAudioDuckFactor(), 1);
    });
});

test('tts: fish tags follow emotion strength and split mixed groups by the original word', () => {
    const base = { enabled: true, provider: 'api', api: { format: 'fish', apiKey: 'k', female: 'v1' } };
    const plan = (line) => decideTts({}, { key: String(Math.random()), textType: 'dialogue', speaker: '甲', text: '走开。', ...line }, base, { sceneAssets: {} });
    assert.equal(plan({ mood: '愤怒' }).text, '[angry] 走开。');
    assert.equal(plan({ mood: '愤怒', text: '走开！！' }).text, '[furious, shouting] 走开！');
    assert.equal(plan({ mood: '愤怒', text: '走开！' }).text, '[angry] 走开！');
    assert.equal(plan({ mood: '暴怒' }).text, '[furious, shouting] 走开。');
    assert.equal(plan({ mood: '有点愤怒' }).text, '[slightly angry] 走开。');
    assert.equal(plan({ mood: '愤怒', text: '啊啊啊走开' }).level, 'strong');
    assert.equal(plan({ mood: '兴奋' }).text, '[excited] 走开。');
    assert.equal(plan({ mood: '大笑' }).text, '[laughing] 走开。');
    assert.equal(plan({ mood: '害怕' }).text, '[scared, trembling] 走开。');
    assert.equal(plan({ mood: '紧张' }).text, '[nervous] 走开。');
    assert.equal(plan({ mood: '害羞', text: '走开！！' }).text, '[shy, soft voice] 走开！', 'untiered moods keep one tag');
});

test('tts: system prosody scales with strength, whisper stacks on the mood, minimax maps shy moods to calm', () => {
    const base = { enabled: true };
    const plan = (line) => decideTts({}, { key: String(Math.random()), textType: 'dialogue', speaker: '甲', text: '走开。', ...line }, base, { sceneAssets: {} });
    const mid = plan({ mood: '愤怒' }).rate;
    assert.ok(plan({ mood: '微微愤怒' }).rate < mid && plan({ mood: '暴怒' }).rate > mid);
    assert.ok(Math.abs(plan({ mood: '愤怒', whisper: true }).rate - mid * 0.92) < 1e-9, 'whisper multiplies the mood rate');
    assert.equal(plan({ mood: '紧张' }).rate > 1, true);
    assert.equal(plan({ mood: '怀疑' }).rate < 1, true);
    assert.ok(plan({ mood: '哭泣', text: '呜呜呜走开', whisper: true }).rate >= 0.92, 'system mood slowdown stays mild');
    const fish = { enabled: true, provider: 'api', api: { format: 'fish', female: 'f' } };
    for (const line of [{ mood: '哭泣', text: '呜呜呜走开', whisper: true }, { mood: '悲伤' }, { mood: '愤怒' }]) {
        assert.equal(decideTts({}, { key: String(Math.random()), textType: 'dialogue', speaker: '甲', text: '走开。', ...line }, fish, { sceneAssets: {} }).rate, 1, 'api voices never time-stretch for mood');
    }
    const mm = { enabled: true, provider: 'api', api: { format: 'minimax', female: 'f' } };
    for (const mood of ['害羞', '爱恋', '动情']) assert.equal(decideTts({}, { key: mood, textType: 'dialogue', speaker: '甲', text: '你好。', mood }, mm, { sceneAssets: {} }).emotion, 'calm');
    assert.equal(decideTts({}, { key: 'x', textType: 'dialogue', speaker: '甲', text: '你好。', mood: '紧张' }, mm, { sceneAssets: {} }).emotion, 'fearful');
});

test('tts: custom mood groups map to the nearest preset by group name and words', async () => {
    const { resolveBarkMood } = await import('../src/visual/igs-ui/voice-bark.js');
    const groups = [{ label: '炸毛', words: ['愤怒', '气鼓鼓', '怒目'] }, { label: '发懵', words: ['神游'] }];
    assert.equal(resolveBarkMood('气鼓鼓', groups), '愤怒', '自定义词按组内词投票');
    assert.equal(resolveBarkMood('炸毛', groups), '愤怒', '组名本身也能映射');
    assert.equal(resolveBarkMood('神游', groups), '平和', '映射不到落平和');
    assert.equal(resolveBarkMood('气鼓鼓'), '平和', '没有自定义组时照旧');
    const fish = { enabled: true, provider: 'api', api: { format: 'fish', apiKey: 'k', female: 'v1' } };
    const plan = decideTts({}, { key: 'g', textType: 'dialogue', speaker: '甲', text: '哼。', mood: '气鼓鼓' }, fish, { sceneAssets: { moodGroups: groups } });
    assert.equal(plan.text, '[angry] 哼。');
});

test('tts: prefetch with a whisper / nsfw hint matches the page actually played, thought-shaped dialogue is hinted', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push(JSON.parse(init.body));
        return { ok: true, json: async () => ({}), text: async () => JSON.stringify({ data: { audio: '0102' }, base_resp: { status_code: 0 } }), arrayBuffer: async () => new ArrayBuffer(2) };
    };
    try {
        const sa = assets({ 艾莉: GIRL });
        const fish = { enabled: true, provider: 'api', nsfw: false, api: { format: 'fish', apiKey: 'k', female: 'v1' } };
        await clearTtsCache();
        await prefetchTts('[艾莉]：靠近一点。', fish, sa, { hint: { textType: 'dialogue', speaker: '艾莉', mood: '害羞', whisper: true } });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].text, '[whisper] [shy, soft voice] 靠近一点。');
        assert.equal(calls[0].text, decideTts({}, { key: 'r', textType: 'dialogue', speaker: '艾莉', text: '靠近一点。', mood: '害羞', whisper: true }, fish, { sceneAssets: sa }).text);
        // 「[名字]：*心里话*」：文字外形猜成台词，阅读器按心里话算，仍然预取
        calls.length = 0;
        await prefetchTts('[艾莉]：*好紧张。*', fish, sa, { hint: { textType: 'thought', speaker: '艾莉', mood: '紧张' } });
        assert.equal(calls.length, 1);
        assert.match(calls[0].text, /^\[soft inner voice\] \[nervous\]/);
        // NSFW 以下一页自己的为准：当前页 NSFW、下一页不是，照常预取；反过来不预取
        assert.ok(prefetchTts('夜深了。', fish, sa, { nsfw: true, hint: { textType: 'narration', nsfw: false } }));
        assert.equal(prefetchTts('夜深了。', fish, sa, { nsfw: false, hint: { textType: 'narration', nsfw: true } }), null);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('tts: speakTtsLine returns done / cancel and reports completed, cancelled, failed', async (t) => {
    const synth = fakeSynth();
    await withSystemEnv(t, synth, async ({ tts }) => {
        const settings = { enabled: true, provider: 'system' };
        const line = { key: '', textType: 'narration', text: '夜色渐深。' };
        const first = tts.speakTtsLine(line, settings, {});
        assert.equal(first.ok, true);
        assert.equal(typeof first.done.then, 'function');
        assert.equal(typeof first.cancel, 'function');
        synth.spoken[synth.spoken.length - 1].onend();
        t.mock.timers.tick(80);
        assert.deepEqual(await first.done, { completed: true, cancelled: false, failed: false });
        const second = tts.speakTtsLine(line, settings, {});
        second.cancel();
        t.mock.timers.tick(80);
        assert.deepEqual(await second.done, { completed: false, cancelled: true, failed: false });
        // 被下一句掐掉也算 cancelled
        const third = tts.speakTtsLine(line, settings, {});
        const fourth = tts.speakTtsLine(line, settings, {});
        t.mock.timers.tick(80);
        assert.equal((await third.done).cancelled, true);
        fourth.cancel();
        // 系统语音出错
        const fifth = tts.speakTtsLine(line, settings, {});
        synth.spoken[synth.spoken.length - 1].onerror({ error: 'synthesis-failed' });
        t.mock.timers.tick(80);
        assert.deepEqual(await fifth.done, { completed: false, cancelled: false, failed: true });
        // 不朗读时没有 done
        assert.equal(tts.speakTtsLine(line, { enabled: false }, {}).done, undefined);
    });
    // 不支持系统语音：同步失败
    const realSynth = globalThis.speechSynthesis;
    delete globalThis.speechSynthesis;
    try {
        const tts = await import('../src/visual/igs-ui/tts.js');
        const result = tts.speakTtsLine({ key: '', textType: 'narration', text: '夜色渐深。' }, { enabled: true, provider: 'system' }, {});
        assert.equal(result.ok, true);
        assert.deepEqual(await result.done, { completed: false, cancelled: false, failed: true });
    } finally {
        if (realSynth !== undefined) globalThis.speechSynthesis = realSynth;
    }
});

test('默认声音候选池：同名稳定、多选分散、单个与旧配置不变', () => {
    const pool = 'v1\nv2\nv3';
    const settings = { enabled: true, provider: 'api', api: { female: pool } };
    const pick = (speaker) => resolveTtsVoice({ textType: 'dialogue', speaker }, settings, {}).voice;
    const names = ['阿姨A', '阿姨B', '路人甲', '路人乙', '店员', '老板', '小贩', '门卫'];
    for (const n of names) {
        assert.ok(['v1', 'v2', 'v3'].includes(pick(n)));
        assert.equal(pick(n), pick(n));
    }
    assert.ok(new Set(names.map(pick)).size > 1);
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '甲' }, { enabled: true, provider: 'api', api: { female: 'solo' } }, {}).voice, 'solo');
    assert.equal(normalizeTtsSettings({ api: { female: ' a \n\na\nb ' } }).api.female, 'a\nb');
    assert.equal(toggleVoicePool('a\nb', 'a'), 'b');
    assert.equal(toggleVoicePool('b', 'c'), 'b\nc');
    // 系统语音：池里本机有的才参与
    const voices = [{ name: 'Sys A', lang: 'zh-CN' }, { name: 'Sys B', lang: 'zh-CN' }];
    const sys = { enabled: true, provider: 'system', system: { female: 'Sys A\nSys B\nMissing' } };
    const got = resolveTtsVoice({ textType: 'dialogue', speaker: '阿姨A', lang: 'zh' }, sys, {}, voices).voice;
    assert.ok(['Sys A', 'Sys B'].includes(got));
    assert.equal(got, resolveTtsVoice({ textType: 'dialogue', speaker: '阿姨A', lang: 'zh' }, sys, {}, voices).voice);
});

test('路人性别：设定 → 名字称谓 → 正文代词，男路人只抽男池，判定稳定', () => {
    clearTtsGenderCache();
    const settings = { enabled: true, provider: 'api', api: { female: 'f1\nf2', male: 'm1\nm2' } };
    const voice = (speaker, context) => resolveTtsVoice({ textType: 'dialogue', speaker, context }, settings, {}).voice;
    for (const n of ['王大叔', '李大爷', '张先生', '赵老头', '陈伯']) assert.ok(['m1', 'm2'].includes(voice(n)), n);
    for (const n of ['王阿姨', '李大妈', '张奶奶', '赵小姐']) assert.ok(['f1', 'f2'].includes(voice(n)), n);
    // 名字没有称谓：看正文名字附近的代词
    assert.ok(['m1', 'm2'].includes(voice('老王', '老王抬起头，他看了看四周。')));
    assert.ok(['f1', 'f2'].includes(voice('小红', '小红笑了笑，她转身离开。')));
    // 已缓存：之后没有正文也保持同性别
    assert.ok(['m1', 'm2'].includes(voice('老王')));
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '老王' }, settings, {}).gender, 'male');
    // 设定里的性别优先于称谓
    const assets = { characterDna: { 王大叔: { identity: '1girl, female' } } };
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '王大叔' }, settings, assets).gender, 'female');
});

test('路人没有 DNA 时按本聊天生成立绘的 tag 判性别', () => {
    const settings = { enabled: true, provider: 'api', api: { female: 'F1', male: 'M1' } };
    const male = resolveTtsVoice({ textType: 'dialogue', speaker: '路人丙', text: '让一让', spriteTags: { 路人丙: '1boy, short hair' } }, settings, {});
    assert.equal(male.gender, 'male');
    assert.equal(male.voice, 'M1');
});
