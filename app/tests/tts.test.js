import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyTts,
    clearTtsCache,
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
    ttsSpeechRequest,
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
