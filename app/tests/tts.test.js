import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyTts,
    buildTtsRequest,
    clearTtsCache,
    fetchTtsVoices,
    findSystemVoice,
    jsonPathGet,
    mergeTtsVoices,
    onSystemVoicesChanged,
    parseGptSovitsVoice,
    parseTtsResponse,
    splitTtsSegments,
    decideTts,
    guessTtsLine,
    normalizeTtsSettings,
    prefetchTts,
    resolveTtsApiFormat,
    resolveTtsVoice,
    splitTtsChunks,
    stripSpeakerPrefix,
    systemVoiceGender,
    systemVoiceOptions,
    systemVoicePool,
    ttsApiVoiceList,
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
    assert.deepEqual(asJson(fish), { text: '你好', reference_id: 'ref123', format: 'mp3' });

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
        const settings = { enabled: true, provider: 'api', api: { format: 'minimax', apiKey: 'k', female: 'girl-1' } };
        const sa = assets({ 艾莉: GIRL });
        const out = await prefetchTts('[艾莉]：「明天见。」', settings, sa);
        assert.equal(out.byteLength, 2);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://api.minimaxi.com/v1/t2a_v2');
        assert.equal(calls[0].body.voice_setting.voice_id, 'girl-1');
        await prefetchTts('[艾莉]：「明天见。」', { ...settings, api: { ...settings.api, format: 'fish' } }, sa);
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
