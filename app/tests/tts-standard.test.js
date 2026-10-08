import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyTts,
    applyTtsLexicon,
    decideTts,
    detectTtsLang,
    parseTtsLexicon,
    replayTts,
    setTtsErrorHandler,
    stopTts,
    ttsPlainText,
} from '../src/visual/igs-ui/tts.js';
import { normalizeCharacterVoices } from '../src/visual/igs-ui/voice-bark.js';
import { ORIGINAL_READER_TOOLBAR_BUTTONS } from '../src/visual/igs-ui/original-reader-source.js';
import { TOOLBAR_ACTIONS } from '../src/visual/igs-ui/reader-host-constants.js';

const v = (name, lang) => ({ name, lang });
const VOICES = [
    v('Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', 'zh-CN'),
    v('Microsoft Yunxi Online (Natural) - Chinese (Mainland)', 'zh-CN'),
    v('Microsoft Nanami Online (Natural) - Japanese (Japan)', 'ja-JP'),
    v('Microsoft Keita Online (Natural) - Japanese (Japan)', 'ja-JP'),
    v('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
];
const GIRL = { triggerWords: '1girl' };
const assets = (characterVoices = {}) => ({ characterDna: { 艾莉: GIRL }, characterVoices });
const ON = { enabled: true };

// 假的系统语音：记下念了什么，手动触发 onend / onerror。
function fakeSpeech() {
    const spoken = [];
    let cancels = 0;
    const synth = {
        getVoices: () => VOICES,
        speak: (u) => spoken.push(u),
        cancel: () => { cancels += 1; },
    };
    const prev = { synth: globalThis.speechSynthesis, U: globalThis.SpeechSynthesisUtterance };
    globalThis.speechSynthesis = synth;
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    return {
        spoken,
        cancels: () => cancels,
        end: () => spoken[spoken.length - 1].onend?.(),
        restore() {
            stopTts();
            globalThis.speechSynthesis = prev.synth;
            globalThis.SpeechSynthesisUtterance = prev.U;
        },
    };
}

test('gate: tts filters urls, emoji, kaomoji, short stage directions and repeated marks', () => {
    assert.equal(ttsPlainText('你好呀♥（笑）😀 看 https://a.b/c ～～～ 真的！！！'), '你好呀 看 ～ 真的！');
    assert.equal(ttsPlainText('(^_^) 早上好'), '早上好');
    // 长的括号说明是正文，保留。
    assert.equal(ttsPlainText('他（就是昨天在车站遇到的那个人）来了'), '他（就是昨天在车站遇到的那个人）来了');
});

test('gate: tts pronunciation table replaces longest words first', () => {
    const pairs = parseTtsLexicon('雫=shizuku\nΛ → 兰姆达\n雫石＝Shizukuishi\n\n乱写一行');
    assert.equal(pairs[0][0], '雫石');
    assert.equal(applyTtsLexicon('雫石的雫和Λ', pairs), 'Shizukuishi的shizuku和兰姆达');
    const plan = decideTts({}, { textType: 'narration', text: '雫来了。' }, { ...ON, lexicon: '雫=shizuku' }, { sceneAssets: assets() });
    assert.equal(plan.text, 'shizuku来了。');
});

test('gate: tts reads bilingual originals with a voice of that language', () => {
    assert.equal(detectTtsLang('おはよう、元気？'), 'ja');
    assert.equal(detectTtsLang('Good morning!'), 'en');
    assert.equal(detectTtsLang('早上好'), 'zh');
    const line = { textType: 'dialogue', speaker: '艾莉', text: 'おはよう〖早上好〗' };
    // 设了中文女声预设，读日文原文时不拿它念。
    const settings = { ...ON, system: { female: VOICES[0].name } };
    const zh = decideTts({}, line, settings, { sceneAssets: assets(), voices: VOICES });
    assert.equal(zh.text, '早上好');
    assert.equal(zh.voice, VOICES[0].name);
    const ja = decideTts({}, line, { ...settings, bilingual: 'original' }, { sceneAssets: assets(), voices: VOICES });
    assert.equal(ja.text, 'おはよう');
    assert.equal(ja.lang, 'ja');
    assert.ok(ja.voice.includes('Japanese'));
});

test('gate: a character can be muted or turned down for tts only', () => {
    const line = { textType: 'dialogue', speaker: '艾莉', text: '你好。' };
    assert.equal(decideTts({}, line, ON, { sceneAssets: assets({ 艾莉: { ttsVolume: 0 } }) }), null);
    const full = decideTts({}, line, ON, { sceneAssets: assets() });
    const half = decideTts({}, line, ON, { sceneAssets: assets({ 艾莉: { ttsVolume: 0.5 } }) });
    assert.ok(Math.abs(half.volume - full.volume / 2) < 1e-9);
    // 存储：默认值不写，改过的才写；语气音的老数据原样不变。
    assert.deepEqual(normalizeCharacterVoices({ A: { ttsVolume: 0 }, B: { ttsVolume: 1 }, C: { pack: 'off' } }), {
        A: { pack: '', pitch: 0, speed: 1, ttsVolume: 0 },
        C: { pack: 'off', pitch: 0, speed: 1 },
    });
});

test('gate: tts sustain lets the current line finish and queues only the newest page; replay repeats it', () => {
    const speech = fakeSpeech();
    try {
        const root = {};
        const page = (i, settings) => applyTts(root, { key: `s:${i}`, textType: 'narration', text: `第${i}页。` }, settings, assets());
        const sustain = { ...ON, sustain: true };
        page(1, sustain);
        assert.deepEqual(speech.spoken.map((u) => u.text), ['第1页。']);
        page(2, sustain);
        page(3, sustain);
        assert.equal(speech.spoken.length, 1, 'page 1 keeps talking');
        speech.end();
        assert.deepEqual(speech.spoken.map((u) => u.text), ['第1页。', '第3页。'], 'skipped page 2, read the newest');
        assert.equal(replayTts().ok, true);
        assert.equal(speech.spoken[speech.spoken.length - 1].text, '第3页。');
        // 不开「翻页不打断」：翻页立刻掐掉上一句。
        const before = speech.cancels();
        page(4, ON);
        assert.ok(speech.cancels() > before);
        assert.equal(speech.spoken[speech.spoken.length - 1].text, '第4页。');
        // 不念的页（旁白关了）之后，重听不会念回上一页。
        page(5, { ...ON, narration: false });
        assert.equal(replayTts().ok, false);
    } finally {
        speech.restore();
    }
});

test('gate: tts errors while reading show once, previews stay quiet', () => {
    const speech = fakeSpeech();
    const shown = [];
    setTtsErrorHandler((message) => shown.push(message));
    try {
        const root = {};
        applyTts(root, { key: 'e:1', textType: 'narration', text: '一。' }, ON, assets());
        speech.spoken[0].onerror({ error: 'not-allowed' });
        applyTts(root, { key: 'e:2', textType: 'narration', text: '二。' }, ON, assets());
        speech.spoken[1].onerror({ error: 'not-allowed' });
        assert.equal(shown.length, 1);
        assert.match(shown[0], /点一下画面/);
        // 翻页掐掉不算错。
        applyTts(root, { key: 'e:3', textType: 'narration', text: '三。' }, ON, assets());
        speech.spoken[2].onerror({ error: 'interrupted' });
        assert.equal(shown.length, 1);
    } finally {
        setTtsErrorHandler(null);
        speech.restore();
    }
});

test('gate: the replay button sits in the toolbar and in the button manager', () => {
    assert.ok(ORIGINAL_READER_TOOLBAR_BUTTONS.some((b) => b.id === 'tts-replay'));
    assert.ok(TOOLBAR_ACTIONS.some(([id]) => id === 'tts-replay'));
});

test('gate: tts settings show sustain, pronunciation table, bilingual choice and per-character volume', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const vn = bootstrapIGS({ global: {}, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'reader', mode: 'pc' }).controller;
        controller.toggle('readerSettings.tts.enabled');
        controller.switchReaderSubTab('performance');
        // 细项要展开才渲染。
        const opened = await controller.invoke('ui-toggle-open:perf-tts');
        const html = opened.html || controller.getSnapshot().html;
        assert.match(html, /data-switch="readerSettings\.tts\.sustain"/);
        assert.match(html, /data-path="readerSettings\.tts\.lexicon"/);
        assert.doesNotMatch(html, /readerSettings\.tts\.bilingual/, 'bilingual choice hidden until bilingual lines are on');
        controller.setValue('bridge.sceneAssets.characters', { 艾莉: { 默认: '' } });
        await controller.invoke(`scene-toggle-dna:${encodeURIComponent('艾莉')}`);
        await controller.invoke(`char-voice:ttsVolume:${encodeURIComponent('艾莉')}:0`);
        assert.deepEqual(controller.getSnapshot().draft.bridge.sceneAssets.characterVoices, { 艾莉: { pack: '', pitch: 0, speed: 1, ttsVolume: 0 } });
        controller.close();
    } finally {
        vn.destroy();
    }
});
