import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCharacterVoice, decideVoiceBark } from '../src/visual/igs-ui/voice-bark.js';
import { creatureVoiceKind, creatureVoiceRecipe, resolveCreatureVoice, synthCreatureBark, CREATURE_VOICE_KINDS, CREATURE_VOICE_SIZES } from '../src/visual/igs-ui/creature-voice.js';

const assets = (extra = {}) => ({
    characters: {},
    characterDna: {
        Alice: { identity: '1girl, silver hair' },
        Bob: { identity: '1boy, black hair' },
        银狼: { identity: 'no humans, wolf, grey fur', creature: { form: 'beast', size: 'large' } },
        蛇女: { identity: '1girl, adult, lamia, snake tail', creature: { form: 'humanoid', size: 'medium' } },
        小虫: { identity: 'no humans, beetle, chitin', creature: { form: 'beast', size: 'small' } },
        幽魂: { identity: 'no humans, ghost, translucent', creature: { form: 'beast', size: 'medium', anchor: 'float' } },
        巨龙: { identity: 'no humans, dragon, scales', creature: { form: 'beast', size: 'giant' } },
        史莱姆: { identity: 'no humans, slime, gel body', creature: { form: 'beast', size: 'small' } },
    },
    ...extra,
});

test('按形态与物种关键词自动选声线，未知回落低吼', () => {
    assert.deepEqual(CREATURE_VOICE_KINDS.map(([id]) => id), ['growl', 'hiss', 'chitter', 'whisper']);
    assert.equal(creatureVoiceKind('no humans, wolf'), 'growl');
    assert.equal(creatureVoiceKind('1girl, lamia, snake tail'), 'hiss');
    assert.equal(creatureVoiceKind('no humans, dragon'), 'hiss');
    assert.equal(creatureVoiceKind('giant spider, chitin'), 'chitter');
    assert.equal(creatureVoiceKind('translucent ghost, wraith'), 'whisper');
    assert.equal(creatureVoiceKind('幽灵少女'), 'whisper');
    assert.equal(creatureVoiceKind('no humans, slime'), 'growl');
    assert.equal(creatureVoiceKind(''), 'growl');
    const a = assets();
    assert.equal(resolveCreatureVoice('银狼', a.characterDna.银狼).kind, 'growl');
    assert.equal(resolveCreatureVoice('蛇女', a.characterDna.蛇女).kind, 'hiss');
    assert.equal(resolveCreatureVoice('小虫', a.characterDna.小虫).kind, 'chitter');
    assert.equal(resolveCreatureVoice('幽魂', a.characterDna.幽魂).kind, 'whisper');
    assert.equal(resolveCreatureVoice('史莱姆', a.characterDna.史莱姆).kind, 'growl');
    assert.equal(resolveCreatureVoice('Alice', a.characterDna.Alice), null);
    assert.equal(resolveCreatureVoice('x', undefined), null);
});

test('体型调音高与低频：小型尖、巨型低沉', () => {
    for (const [kind] of CREATURE_VOICE_KINDS) {
        const f = (size) => creatureVoiceRecipe({ kind, size }).f0;
        assert.ok(f('small') > f('medium') && f('medium') > f('large') && f('large') > f('giant'), kind);
        assert.ok(creatureVoiceRecipe({ kind, size: 'giant' }).duration > creatureVoiceRecipe({ kind, size: 'small' }).duration, kind);
        assert.ok(creatureVoiceRecipe({ kind, size: 'giant' }).sub > creatureVoiceRecipe({ kind, size: 'medium' }).sub, kind);
    }
    assert.deepEqual(Object.keys(CREATURE_VOICE_SIZES), ['small', 'medium', 'large', 'giant']);
    const base = creatureVoiceRecipe({ kind: 'growl', size: 'medium' });
    assert.ok(creatureVoiceRecipe({ kind: 'growl', size: 'medium', pitch: 3 }).f0 > base.f0);
    assert.ok(creatureVoiceRecipe({ kind: 'growl', size: 'medium', speed: 1.4 }).duration < base.duration);
    assert.ok(creatureVoiceRecipe({ kind: 'growl', mood: '愤怒' }).drive > creatureVoiceRecipe({ kind: 'growl', mood: '悲伤' }).drive);
    assert.equal(creatureVoiceRecipe({ kind: 'nope', size: 'nope' }).kind, 'growl');
});

test('非人角色用非人声线代替人声；人类声线分配不变', () => {
    const a = assets();
    const wolf = resolveCharacterVoice(a, '银狼');
    assert.equal(wolf.source, 'creature');
    assert.equal(wolf.pack, null);
    assert.equal(wolf.creature.size, 'large');
    // 半人形带 1girl 标签也不再分到女声。
    assert.equal(resolveCharacterVoice(a, '蛇女').source, 'creature');
    // 人类：与没有任何非人档案时的结果逐项相同。
    const plain = assets(); for (const key of ['银狼', '蛇女', '小虫', '幽魂', '巨龙', '史莱姆']) delete plain.characterDna[key];
    for (const name of ['Alice', 'Bob']) {
        const before = resolveCharacterVoice(plain, name), after = resolveCharacterVoice(a, name);
        assert.equal(after.source, 'dna');
        assert.equal(after.pack.id, before.pack.id);
        assert.equal(after.creature, undefined);
    }
    // 手动指定的声线优先于自动的非人声线；不发声照旧。
    assert.equal(resolveCharacterVoice({ ...a, characterVoices: { 银狼: { pack: 'amitaro' } } }, '银狼').source, 'manual');
    assert.equal(resolveCharacterVoice({ ...a, characterVoices: { 银狼: { pack: 'off' } } }, '银狼').source, 'off');
    // 手动音高与语速也带给非人声线。
    const tuned = resolveCharacterVoice({ ...a, characterVoices: { 银狼: { pitch: -2, speed: 1.2 } } }, '银狼');
    assert.equal(tuned.source, 'creature');
    assert.equal(tuned.pitch, -2);
    assert.equal(tuned.speed, 1.2);
});

test('非人声线沿用语气音的频率、旁白与 NSFW 规则', () => {
    const a = assets();
    const settings = { enabled: true, volume: 0.8, frequency: 'change' };
    const line = (extra) => ({ key: `k${Math.random()}`, textType: 'dialogue', speaker: '银狼', mood: '愤怒', ...extra });
    const state = {};
    const first = decideVoiceBark(state, line(), settings, { sceneAssets: a });
    assert.equal(first.creature.kind, 'growl');
    assert.equal(first.mood, '愤怒');
    assert.ok(first.volume > 0.8 && first.volume <= 1.2, '愤怒更响');
    assert.equal(decideVoiceBark(state, line(), settings, { sceneAssets: a }), null, '同人同情绪不重复');
    assert.ok(decideVoiceBark(state, line({ mood: '悲伤' }), settings, { sceneAssets: a }), '情绪变化再响');
    assert.equal(decideVoiceBark({}, line({ textType: 'narration' }), settings, { sceneAssets: a }), null, '旁白不发声');
    assert.equal(decideVoiceBark({}, line({ textType: 'thought' }), settings, { sceneAssets: a }), null);
    assert.equal(decideVoiceBark({}, line({ nsfw: true }), settings, { sceneAssets: a }), null);
    assert.equal(decideVoiceBark({}, line(), { ...settings, enabled: false }, { sceneAssets: a }), null);
    const phone = decideVoiceBark({}, line({ phone: true }), settings, { sceneAssets: a });
    assert.equal(phone.phone, true);
    assert.equal(phone.pan, 0);
    const whisper = decideVoiceBark({}, line({ whisper: true }), settings, { sceneAssets: a });
    assert.equal(whisper.close, true);
    // 人类仍返回带音频地址的方案。
    const human = decideVoiceBark({}, line({ speaker: 'Alice', mood: '平和' }), settings, { sceneAssets: a });
    assert.ok(human.url && human.pack && !human.creature);
});

// 最小的 Web Audio 替身：记录节点，验证四组声线都能搭起来并按时停止。
function fakeContext() {
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
    const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
    const created = [];
    const make = (kind, extra) => { const n = node({ kind, ...extra }); created.push(n); return n; };
    return { created, currentTime: 0, sampleRate: 8000,
        createGain: () => make('gain', { gain: param() }),
        createOscillator: () => make('osc', { frequency: param(), start() {}, stop() { this.stopped = true; } }),
        createBiquadFilter: () => make('filter', { frequency: param(), Q: param() }),
        createBuffer: (_c, length) => ({ getChannelData: () => new Float32Array(length) }),
        createBufferSource: () => make('noise', { start() {}, stop() { this.stopped = true; } }) };
}

test('四组非人声线都能合成并可中途掐断', () => {
    for (const [kind] of CREATURE_VOICE_KINDS) for (const size of Object.keys(CREATURE_VOICE_SIZES)) {
        const context = fakeContext(), nodes = [];
        const synth = synthCreatureBark(context, { connect() {} }, creatureVoiceRecipe({ kind, size, mood: '愤怒' }), nodes);
        assert.ok(synth.duration > 0.15, `${kind}/${size}`);
        assert.ok(nodes.length >= 3, `${kind}/${size}`);
        synth.stop();
        assert.ok(context.created.filter(n => n.kind === 'osc' || n.kind === 'noise').every(n => n.stopped), `${kind}/${size}`);
    }
});

test('形态待判定（auto）的临时档不配非人声线', () => {
    const a = assets();
    a.characterDna.山贼 = { identity: '1boy, bandit', creature: { form: 'auto', temp: true } };
    assert.equal(resolveCreatureVoice('山贼', a.characterDna.山贼), null);
    const voice = resolveCharacterVoice(a, '山贼');
    assert.equal(voice.creature, undefined);
    assert.equal(voice.source, 'dna');
});
