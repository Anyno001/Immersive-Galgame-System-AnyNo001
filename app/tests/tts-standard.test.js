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
