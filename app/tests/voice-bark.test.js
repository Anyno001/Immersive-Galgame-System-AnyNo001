import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { VOICE_PACKS } from '../src/voice/voice-packs.js';
import {
    decideVoiceBark,
    detectVoiceGender,
    normalizeCharacterVoices,
    normalizeVoiceBarkSettings,
    normalizeVoiceSpeed,
    pickBarkClip,
    resolveBarkMood,
    resolveCharacterVoice,
    stretchSamples,
} from '../src/visual/igs-ui/voice-bark.js';

const appRoot = path.resolve(import.meta.dirname, '..');
const ON = { enabled: true, volume: 0.8, frequency: 'change' };
const female = VOICE_PACKS.find((pack) => pack.gender === 'female');
const male = VOICE_PACKS.find((pack) => pack.gender === 'male');
const line = (over = {}) => ({ key: 'm1:0', textType: 'dialogue', speaker: '艾琳', mood: '开心', ...over });
const assets = (dna = {}, characterVoices = {}) => ({ characterDna: dna, characterVoices });

test('voice packs: every pack covers all 20 moods and every clip exists on disk', () => {
    assert.ok(VOICE_PACKS.length >= 2);
    assert.ok(female && male, 'needs at least one female and one male pack');
    for (const pack of VOICE_PACKS) {
        assert.equal(Object.keys(pack.clips).length, 20, pack.id);
        for (const clips of Object.values(pack.clips)) {
            assert.ok(clips.length > 0, pack.id);
            for (const url of clips) {
                const file = path.join(appRoot, 'assets', 'voice', decodeURIComponent(url.split('/').pop()));
                assert.ok(fs.statSync(file).size > 800, `${file} looks empty`);
            }
        }
    }
});

test('settings normalize: off by default, clamps volume and drops unknown packs', () => {
    assert.deepEqual(normalizeVoiceBarkSettings(null), { enabled: false, volume: 0.8, frequency: 'change' });
    assert.equal(normalizeVoiceBarkSettings({ volume: 5 }).volume, 1);
    assert.equal(normalizeVoiceBarkSettings({ frequency: 'loud' }).frequency, 'change');
    assert.deepEqual(normalizeCharacterVoices({ A: { pack: 'nope', pitch: 9 }, B: { pack: 'off' }, D: { speed: 3 }, __proto__: { pack: 'off' }, C: {} }), {
        A: { pack: '', pitch: 3, speed: 1 },
        B: { pack: 'off', pitch: 0, speed: 1 },
        D: { pack: '', pitch: 0, speed: 1.4 },
    });
    assert.equal(normalizeVoiceSpeed(0.5), 0.8);
    assert.equal(normalizeVoiceSpeed('abc'), 1);
});

test('gender: 1boy/1girl tag wins, otherwise compare Chinese hints, ties stay unknown', () => {
    assert.equal(detectVoiceGender('1boy, black hair, 有个妹妹'), 'male');
    assert.equal(detectVoiceGender('1girl, short hair'), 'female');
    assert.equal(detectVoiceGender('银发少女，学院学生'), 'female');
    assert.equal(detectVoiceGender('青年剑士，沉默寡言'), 'male');
    assert.equal(detectVoiceGender('学院学生'), '');
});

test('character voice: manual beats auto, auto follows DNA gender and is stable per name', () => {
    const dna = { 艾琳: { identity: '1girl, silver hair' }, 雷恩: { identity: '1boy, 青年' }, 路人: { identity: '学生' } };
    const a = resolveCharacterVoice(assets(dna), '艾琳');
    assert.equal(a.source, 'dna');
    assert.equal(a.pack.gender, 'female');
    assert.equal(resolveCharacterVoice(assets(dna), '艾琳').pack.id, a.pack.id);
    assert.equal(resolveCharacterVoice(assets(dna), '雷恩').pack.gender, 'male');
    assert.notEqual(resolveCharacterVoice(assets(dna), '雷恩').pack.id, 'vv-chibijii');
    assert.equal(resolveCharacterVoice(assets(dna), '路人').pack, null);
    const manual = resolveCharacterVoice(assets(dna, { 雷恩: { pack: female.id, pitch: -1 } }), '雷恩');
    assert.deepEqual([manual.pack.id, manual.pitch, manual.source], [female.id, -1, 'manual']);
    // 自动分配时也带上手动调的音高和语速。
    const tuned = resolveCharacterVoice(assets(dna, { 艾琳: { speed: 1.2 } }), '艾琳');
    assert.deepEqual([tuned.pack.id, tuned.speed, tuned.source], [a.pack.id, 1.2, 'dna']);
    assert.equal(resolveCharacterVoice(assets(dna, { 艾琳: { pack: 'off' } }), '艾琳').pack, null);
    // 别名按主名查。
    const aliased = { ...assets(dna), characterAliases: { 艾琳: ['小琳'] } };
    assert.equal(resolveCharacterVoice(aliased, '小琳').pack.id, a.pack.id);
});

test('mood: free words map to the 20 groups, unknown falls back to 平和', () => {
    assert.equal(resolveBarkMood('开心'), '喜悦');
    assert.equal(resolveBarkMood('面无表情'), '平和');
    assert.equal(resolveBarkMood(''), '平和');
});

test('clip pick: avoids repeating the last clip and falls back along the mood chain', () => {
    const pack = { clips: { 平和: ['p1'], 喜悦: ['j1', 'j2'] } };
    assert.equal(pickBarkClip(pack, '喜悦', { last: 'j1', random: () => 0 }), 'j2');
    assert.equal(pickBarkClip(pack, '大笑', { random: () => 0 }), 'j1');
    assert.equal(pickBarkClip(pack, '愤怒', { random: () => 0 }), 'p1');
    assert.equal(pickBarkClip(null, '喜悦'), '');
});

test('decide: only dialogue, skips narration / phone / nsfw / repeats, plays on speaker or mood change', () => {
    const sceneAssets = assets({ 艾琳: { identity: '1girl' }, 雷恩: { identity: '1boy' } });
    const opts = { sceneAssets, random: () => 0 };
    const state = {};
    assert.ok(decideVoiceBark(state, line(), ON, opts));
    assert.equal(decideVoiceBark(state, line(), ON, opts), null, 'same key re-render');
    assert.equal(decideVoiceBark(state, line({ key: 'm1:1' }), ON, opts), null, 'same speaker same mood');
    assert.ok(decideVoiceBark(state, line({ key: 'm1:2', mood: '生气' }), ON, opts), 'mood changed');
    assert.ok(decideVoiceBark(state, line({ key: 'm1:3', speaker: '雷恩', mood: '生气' }), ON, opts), 'speaker changed');
    for (const over of [{ textType: 'narration' }, { textType: 'thought' }, { phone: true }, { nsfw: true }, { speaker: '' }]) {
        assert.equal(decideVoiceBark({}, line(over), ON, opts), null, JSON.stringify(over));
    }
    assert.equal(decideVoiceBark({}, line(), { ...ON, enabled: false }, opts), null);
    assert.equal(decideVoiceBark({}, line({ speaker: '路人' }), ON, opts), null, 'unknown gender stays silent');
    const every = {};
    decideVoiceBark(every, line(), { ...ON, frequency: 'every' }, opts);
    assert.ok(decideVoiceBark(every, line({ key: 'm1:1' }), { ...ON, frequency: 'every' }, opts));
    assert.equal(decideVoiceBark({}, line(), { ...ON, frequency: 'sometimes' }, { sceneAssets, random: () => 0.9 }), null);
});

test('stretch: keeps pitch-period content and scales length by the ratio', () => {
    const rate = 32000;
    const tone = Float32Array.from({ length: rate / 2 }, (_, i) => Math.sin((2 * Math.PI * 220 * i) / rate));
    const longer = stretchSamples(tone, rate, 1.25);
    assert.equal(longer.length, Math.round(tone.length * 1.25));
    assert.equal(stretchSamples(tone, rate, 1), tone);
    // 拉长后仍是 220Hz：数中段过零点，频率误差 5% 以内。
    const mid = longer.subarray(4000, 12000);
    let crossings = 0;
    for (let i = 1; i < mid.length; i += 1) if ((mid[i - 1] < 0) !== (mid[i] < 0)) crossings += 1;
    const hz = crossings / 2 / (mid.length / rate);
    assert.ok(Math.abs(hz - 220) / 220 < 0.05, `got ${hz}Hz`);
});
