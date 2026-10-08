import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyTts,
    clearTtsCache,
    decideTts,
    guessTtsLine,
    normalizeTtsSettings,
    prefetchTts,
    resolveTtsVoice,
    splitTtsChunks,
    stripSpeakerPrefix,
    systemVoiceGender,
    systemVoiceOptions,
    systemVoicePool,
    ttsApiVoiceList,
    ttsCacheKey,
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

test('gate: tts splits long text into short sentence chunks', () => {
    const text = '第一句话。第二句话！第三句话？';
    assert.deepEqual(splitTtsChunks(text, 100), [text]);
    assert.deepEqual(splitTtsChunks(text, 6), ['第一句话。', '第二句话！', '第三句话？']);
    const long = '啊'.repeat(250);
    assert.ok(splitTtsChunks(long, 120).every((c) => c.length <= 120));
    assert.equal(splitTtsChunks(long, 120).join(''), long);
});

test('gate: system voices split by gender, prefer natural Mandarin, skip dialects', () => {
    assert.equal(systemVoiceGender('Microsoft Yunxi Online (Natural)'), 'male');
    assert.equal(systemVoiceGender('Microsoft Kangkang'), 'male');
    assert.equal(systemVoiceGender('Microsoft Xiaoxiao Online (Natural)'), 'female');
    const female = systemVoicePool(WIN_VOICES, 'female').map((x) => x.name);
    assert.deepEqual(female, [WIN_VOICES[2].name, WIN_VOICES[3].name]);
    const male = systemVoicePool(WIN_VOICES, 'male').map((x) => x.name);
    assert.deepEqual(male, [WIN_VOICES[4].name, WIN_VOICES[5].name]);
    // 下拉只列中文和日文，中文自然声在前。
    const options = systemVoiceOptions(WIN_VOICES).map(([id]) => id);
    assert.ok(!options.some((id) => id.includes('Aria')));
    assert.ok(options.indexOf(WIN_VOICES[2].name) < options.indexOf(WIN_VOICES[0].name));
});

test('gate: tts voice follows DNA gender, manual pick, and narrator setting', () => {
    const sa = assets({ 艾莉: GIRL, 雷恩: BOY });
    const girl = resolveTtsVoice({ textType: 'dialogue', speaker: '艾莉' }, ON, sa, WIN_VOICES);
    assert.equal(systemVoiceGender(girl.voice), 'female');
    assert.ok(girl.voice.includes('Natural'));
    const boy = resolveTtsVoice({ textType: 'dialogue', speaker: '雷恩' }, ON, sa, WIN_VOICES);
    assert.equal(systemVoiceGender(boy.voice), 'male');
    // 同一角色每次都是同一个声音。
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '雷恩' }, ON, sa, WIN_VOICES).voice, boy.voice);
    // 角色单独指定优先。
    const manual = assets({ 雷恩: BOY }, { 雷恩: { tts: WIN_VOICES[1].name } });
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '雷恩' }, ON, manual, WIN_VOICES).voice, WIN_VOICES[1].name);
    // 旁白用设置里选的旁白声音。
    const narr = resolveTtsVoice({ textType: 'narration' }, { ...ON, system: { narrator: WIN_VOICES[0].name } }, sa, WIN_VOICES);
    assert.equal(narr.role, 'narrator');
    assert.equal(narr.voice, WIN_VOICES[0].name);
    // 接口来源：按性别取对应声音名，旁白留空用女声。
    const api = { ...ON, provider: 'api', api: { female: 'anna', male: 'alex' } };
    assert.equal(resolveTtsVoice({ textType: 'dialogue', speaker: '雷恩' }, api, sa).voice, 'alex');
    assert.equal(resolveTtsVoice({ textType: 'narration' }, api, sa).voice, 'anna');
});

test('gate: tts decides per page, honours narration and NSFW switches, never replays the same page', () => {
    const sa = assets({ 艾莉: GIRL });
    const state = {};
    const line = { key: 'm1:0', textType: 'dialogue', speaker: '艾莉', text: '你好呀。', mood: '愤怒' };
    const plan = decideTts(state, line, ON, { sceneAssets: sa, voices: WIN_VOICES });
    assert.equal(plan.text, '你好呀。');
    assert.ok(plan.rate > 1, 'angry lines speak a little faster');
    assert.deepEqual(decideTts(state, line, ON, { sceneAssets: sa, voices: WIN_VOICES }), { skip: true });
    const narration = { key: 'm1:1', textType: 'narration', text: '窗外下着雨。' };
    assert.ok(decideTts(state, narration, ON, { sceneAssets: sa, voices: WIN_VOICES }));
    assert.equal(decideTts({}, narration, { ...ON, narration: false }, { sceneAssets: sa }), null);
    const nsfw = { ...line, key: 'm1:2', nsfw: true };
    assert.equal(decideTts({}, nsfw, ON, { sceneAssets: sa }), null);
    assert.ok(decideTts({}, nsfw, { ...ON, nsfw: true }, { sceneAssets: sa }));
    assert.equal(decideTts({}, { ...line, key: 'm1:3', text: '……' }, ON, { sceneAssets: sa }), null);
    assert.equal(decideTts({}, { ...line, key: 'm1:4', textType: 'chat' }, ON, { sceneAssets: sa }), null);
    const thought = decideTts({}, { ...line, key: 'm1:5', textType: 'thought', mood: '' }, ON, { sceneAssets: sa });
    assert.ok(thought.volume < normalizeTtsSettings(ON).volume, 'inner thoughts are quieter');
});

test('gate: tts api url appends /audio/speech and supports the tavern CORS proxy', () => {
    assert.equal(ttsSpeechUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1/audio/speech');
    assert.equal(ttsSpeechUrl('http://127.0.0.1:9880/v1/audio/speech'), 'http://127.0.0.1:9880/v1/audio/speech');
    assert.equal(ttsSpeechUrl('https://x.cn/v1', 'st-proxy'), '/proxy/https://x.cn/v1/audio/speech');
    assert.equal(ttsSpeechUrl(''), '');
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
