import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyTypewriterEffect,
    cancelTypewriter,
    normalizeTypewriterSettings,
} from '../src/visual/igs-ui/typewriter-runtime.js';
import { measureClassicReveal } from '../src/visual/igs-ui/typewriter-classic.js';
import { TYPEWRITER_VOICES, TYPEWRITER_VOICE_LABELS, emotionPitch, resolveTypewriterVoice, scheduleTypewriterAudio, speakerPitch, spritePan } from '../src/visual/igs-ui/typewriter-audio.js';
import { TYPING_DUCK_RATIO, applySceneAudio, cancelSceneAudio } from '../src/visual/igs-ui/scene-audio.js';

function text(value) {
    return { nodeType: 3, nodeValue: value, childNodes: [] };
}

function lockedText(value) {
    let current = value;
    return {
        nodeType: 3,
        get nodeValue() {
            return current;
        },
        set nodeValue(_nextValue) {
            throw new Error('pure visual typewriter must not write a text node during playback');
        },
        childNodes: [],
    };
}

function element(...children) {
    return { nodeType: 1, childNodes: children, dataset: {} };
}

function createAnimator() {
    const calls = [];
    return {
        calls,
        animate(target, keyframes, timing) {
            const animation = {
                cancelled: false,
                cancel() {
                    this.cancelled = true;
                    this.oncancel?.();
                },
                finish() {
                    this.onfinish?.();
                },
            };
            calls.push({ target, keyframes, timing, animation });
            return animation;
        },
    };
}

test('typewriter settings default to disabled medium and reject invalid speed', () => {
    assert.deepEqual(normalizeTypewriterSettings(null), { enabled: false, speed: 'medium', mode: 'soft', punctuationPause: false, prosody: false, sound: { enabled: true, volume: 0.5, dialogueVolume: 0.5, narrationVolume: 0.5, dialoguePreset: 'dududu', thoughtPreset: 'follow', narrationPreset: 'keyboard', speakerPitch: false } });
    assert.deepEqual(normalizeTypewriterSettings({ enabled: true, speed: 'fast' }), { enabled: true, speed: 'fast', mode: 'soft', punctuationPause: false, prosody: false, sound: { enabled: true, volume: 0.5, dialogueVolume: 0.5, narrationVolume: 0.5, dialoguePreset: 'dududu', thoughtPreset: 'follow', narrationPreset: 'keyboard', speakerPitch: false } });
    assert.deepEqual(normalizeTypewriterSettings({ enabled: 'true', speed: 'instant' }), { enabled: false, speed: 'medium', mode: 'soft', punctuationPause: false, prosody: false, sound: { enabled: true, volume: 0.5, dialogueVolume: 0.5, narrationVolume: 0.5, dialoguePreset: 'dududu', thoughtPreset: 'follow', narrationPreset: 'keyboard', speakerPitch: false } });
    assert.deepEqual(normalizeTypewriterSettings({ enabled: true, mode: 'classic', sound: { enabled: false, volume: 0 } }),
        { enabled: true, speed: 'medium', mode: 'classic', punctuationPause: false, prosody: false, sound: { enabled: false, volume: 0, dialogueVolume: 0, narrationVolume: 0, dialoguePreset: 'dududu', thoughtPreset: 'follow', narrationPreset: 'keyboard', speakerPitch: false } });
    assert.equal(normalizeTypewriterSettings({ sound: { volume: 4 } }).sound.volume, 1);
    assert.equal(normalizeTypewriterSettings({ sound: { volume: 'bad' } }).sound.volume, 0.5);
    const splitVolumes = normalizeTypewriterSettings({ sound: { volume: 0.8, dialogueVolume: 0.2 } }).sound;
    assert.equal(splitVolumes.dialogueVolume, 0.2);
    assert.equal(splitVolumes.narrationVolume, 0.8);
});

test('typewriter voice presets normalize, resolve per text type and pitch by speaker', () => {
    const sound = normalizeTypewriterSettings({ sound: { dialoguePreset: 'blip', thoughtPreset: 'nope', narrationPreset: 'pencil', speakerPitch: 'yes' } }).sound;
    assert.equal(sound.dialoguePreset, 'blip');
    assert.equal(sound.thoughtPreset, 'follow');
    assert.equal(sound.narrationPreset, 'pencil');
    assert.equal(sound.speakerPitch, false);
    assert.equal(normalizeTypewriterSettings({ sound: { dialoguePreset: 'bogus' } }).sound.dialoguePreset, 'dududu');
    assert.deepEqual(resolveTypewriterVoice(sound, 'dialogue', '甲'), { preset: 'blip', pitch: 1, pan: 0 });
    assert.deepEqual(resolveTypewriterVoice(sound, 'thought', '甲'), { preset: 'blip', pitch: 1, pan: 0 });
    assert.deepEqual(resolveTypewriterVoice({ ...sound, thoughtPreset: 'whisper' }, 'thought'), { preset: 'whisper', pitch: 1, pan: 0 });
    assert.deepEqual(resolveTypewriterVoice(sound, 'narration', '甲'), { preset: 'pencil', pitch: 1, pan: 0 });
    const pitched = { ...sound, speakerPitch: true };
    assert.equal(resolveTypewriterVoice(pitched, 'dialogue', '甲').pitch, speakerPitch('甲'));
    assert.equal(resolveTypewriterVoice(pitched, 'narration', '甲').pitch, 1);
    assert.equal(speakerPitch(''), 1);
    assert.equal(speakerPitch('爱丽丝'), speakerPitch('爱丽丝'));
    assert.ok(new Set(['甲', '乙', '丙', '丁', '戊', '己'].map(speakerPitch)).size > 1);
    assert.deepEqual(TYPEWRITER_VOICE_LABELS.map(([id]) => id).sort(), Object.keys(TYPEWRITER_VOICES).sort());
});

test('typewriter audio passes the chosen voice and pitch to the scheduler', () => {
    const events = [{ text: '甲', timeMs: 0 }, { text: '，', timeMs: 30 }, { text: '乙', timeMs: 100 }];
    const calls = [];
    const audioScheduler = (info) => { calls.push(info); return { stop() {} }; };
    scheduleTypewriterAudio(events, { textType: 'dialogue', volume: 0.5, audioScheduler, preset: 'chime', pitch: 1.12 });
    scheduleTypewriterAudio(events, { textType: 'narration', volume: 0.5, audioScheduler });
    scheduleTypewriterAudio(events, { textType: 'dialogue', volume: 0.5, audioScheduler, preset: 'bogus' });
    assert.deepEqual(calls.map(({ preset, pitch, timesMs }) => [preset, pitch, timesMs]),
        [['chime', 1.12, [0, 100]], ['keyboard', 1, [0, 100]], ['dududu', 1, [0, 100]]]);
    assert.equal(calls[0].url, '');
    assert.match(calls[1].url, /keyboard/);
});

test('classic hands speaker voice settings to the audio scheduler', () => {
    const { root } = classicRoot();
    const sounds = [];
    applyTypewriterEffect(root, {
        enabled: true, mode: 'classic', reducedMotion: false, animate: createAnimator().animate,
        sound: { enabled: true, dialoguePreset: 'pop', speakerPitch: true }, textType: 'dialogue', speaker: '爱丽丝',
        audioScheduler(info) { sounds.push(info); return { stop() {} }; },
    });
    cancelTypewriter(root);
    assert.equal(sounds[0].preset, 'pop');
    assert.equal(sounds[0].pitch, speakerPitch('爱丽丝'));
});

test('prosody applies emotion pitch once and leaves narration flat', () => {
    const play = (textType) => {
        const { root } = classicRoot();
        const sounds = [];
        applyTypewriterEffect(root, {
            enabled: true, mode: 'classic', prosody: true, reducedMotion: false, animate: createAnimator().animate,
            sound: { enabled: true, speakerPitch: true }, textType, speaker: '爱丽丝', emotion: '开心',
            audioScheduler(info) { sounds.push(info); return { stop() {} }; },
        });
        cancelTypewriter(root);
        return sounds[0];
    };
    const dialogue = play('dialogue');
    // 整页音高只含说话人；情绪 ×1.06 只在逐音符里出现一次。
    assert.equal(dialogue.pitch, speakerPitch('爱丽丝'));
    assert.ok(Math.abs(dialogue.notes[0].pitch - speakerPitch('爱丽丝') * 1.06) < 1e-9);
    const narration = play('narration');
    assert.ok(narration.notes.every((note) => note.pitch === 1 && note.gain === 1));
});

test('typewriter uses one visual animation without mutating fully rendered nested text', () => {
    const first = lockedText('你好');
    const emphasized = element(lockedText('，世界'));
    const root = element(first, emphasized);
    const animator = createAnimator();
    const result = applyTypewriterEffect(root, {
        enabled: true,
        speed: 'fast',
        key: 'page-1',
        reducedMotion: false,
        animate: animator.animate,
        schedule() {
            throw new Error('pure visual typewriter must not schedule per-character work');
        },
    });

    assert.equal(result.animated, true);
    assert.equal(root.dataset.igsTypewriter, 'running');
    assert.equal(first.nodeValue + emphasized.childNodes[0].nodeValue, '你好，世界');
    assert.equal(animator.calls.length, 1);
    assert.deepEqual(animator.calls[0].keyframes[0], { opacity: 0, clipPath: 'inset(0 100% 0 0)' });
    assert.deepEqual(animator.calls[0].keyframes[1], { opacity: 1, clipPath: 'inset(0 0 0 0)' });
    assert.equal(animator.calls[0].timing.fill, 'both');
    assert.ok(animator.calls[0].timing.duration > 0);
    animator.calls[0].animation.finish();
    assert.equal(root.dataset.igsTypewriter, 'complete');
    assert.equal(first.nodeValue + emphasized.childNodes[0].nodeValue, '你好，世界');
});

test('typewriter safely falls back to already rendered text when visual animations are unavailable', () => {
    const node = lockedText('不支持动画也可读');
    const root = element(node);
    const result = applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'no-waapi', reducedMotion: false });

    assert.equal(result.animated, false);
    assert.equal(root.dataset.igsTypewriter, 'complete');
    assert.equal(node.nodeValue, '不支持动画也可读');
});

test('typewriter maps fast and slow modes to one bounded visual reveal', () => {
    const content = '纯视觉揭示'.repeat(8);
    const fastRoot = element(text(content));
    const slowRoot = element(text(content));
    const fastAnimator = createAnimator();
    const slowAnimator = createAnimator();

    applyTypewriterEffect(fastRoot, { enabled: true, speed: 'fast', key: 'fast', reducedMotion: false, animate: fastAnimator.animate });
    applyTypewriterEffect(slowRoot, { enabled: true, speed: 'slow', key: 'slow', reducedMotion: false, animate: slowAnimator.animate });

    assert.equal(fastAnimator.calls.length, 1);
    assert.equal(slowAnimator.calls.length, 1);
    assert.ok(fastAnimator.calls[0].timing.duration < slowAnimator.calls[0].timing.duration);
    assert.ok(slowAnimator.calls[0].timing.duration <= 1200);
    assert.equal(fastRoot.childNodes[0].nodeValue, content);
    assert.equal(slowRoot.childNodes[0].nodeValue, content);
    fastAnimator.calls[0].animation.finish();
    slowAnimator.calls[0].animation.finish();
});

test('rerendering the same active page does not restart its visual animation', () => {
    const node = text('不会重启');
    const root = element(node);
    const animator = createAnimator();
    applyTypewriterEffect(root, {
        enabled: true,
        speed: 'medium',
        key: 'stable-page',
        reducedMotion: false,
        animate: animator.animate,
    });

    const repeated = applyTypewriterEffect(root, {
        enabled: true,
        speed: 'medium',
        key: 'stable-page',
        reducedMotion: false,
        animate: animator.animate,
    });
    assert.equal(repeated.animated, true);
    assert.equal(animator.calls.length, 1);
    assert.equal(node.nodeValue, '不会重启');
    animator.calls[0].animation.finish();
});

test('cancelling an active typewriter keeps the already rendered page visible', () => {
    const node = text('完整显示');
    const root = element(node);
    const animator = createAnimator();
    applyTypewriterEffect(root, {
        enabled: true,
        speed: 'slow',
        key: 'page-2',
        reducedMotion: false,
        animate: animator.animate,
    });

    assert.equal(node.nodeValue, '完整显示');
    assert.equal(cancelTypewriter(root), true);
    assert.equal(node.nodeValue, '完整显示');
    assert.equal(root.dataset.igsTypewriter, 'complete');
    assert.equal(animator.calls[0].animation.cancelled, true);
});

test('reduced motion and repeated render keys do not replay animation', () => {
    const root = element(text('直接显示'));
    const animator = createAnimator();
    const reduced = applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'page-3', reducedMotion: true, animate: animator.animate });
    assert.equal(reduced.animated, false);
    applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'page-3', reducedMotion: false, animate: animator.animate });
    animator.calls[0].animation.finish();
    const replay = applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'page-3', reducedMotion: false, animate: animator.animate });
    assert.equal(replay.animated, false);
    assert.equal(root.childNodes[0].nodeValue, '直接显示');
});

function classicRoot() {
    const first = lockedText('甲😀');
    const second = lockedText('乙丙');
    const root = element(first, element(second));
    const boxes = [
        { top: 0, bottom: 20, left: 0, right: 10, width: 10, height: 20 },
        { top: 0, bottom: 20, left: 10, right: 30, width: 20, height: 20 },
        { top: 20, bottom: 40, left: 0, right: 10, width: 10, height: 20 },
        { top: 20, bottom: 40, left: 10, right: 20, width: 10, height: 20 },
    ];
    const calls = [];
    root.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40 });
    root.ownerDocument = { createRange() {
        let node;
        let start;
        let end;
        return {
            setStart(value, offset) { node = value; start = offset; },
            setEnd(value, offset) { assert.equal(node, value); end = offset; },
            getClientRects() {
                calls.push([node, start, end]);
                if (node === first) return [boxes[start === 0 ? 0 : 1]];
                return [boxes[2 + start]];
            },
        };
    } };
    return { root, first, second, calls };
}

test('classic measures rendered lines and Unicode graphemes once, then animates a single stepped mask', () => {
    const { root, first, second, calls } = classicRoot();
    const animator = createAnimator();
    const sounds = [];
    const options = {
        enabled: true, mode: 'classic', speed: 'slow', key: 'classic-page', reducedMotion: false,
        sound: { enabled: true, volume: 0.5 }, textType: 'dialogue', animate: animator.animate,
        audioScheduler(info) { sounds.push(info); return { stop() { sounds.push('stop'); } }; },
        schedule() { throw new Error('per-character scheduling is forbidden'); },
    };
    const result = applyTypewriterEffect(root, options);
    assert.equal(result.animated, true);
    assert.deepEqual(calls.map(([node, start, end]) => [node === first ? 'first' : 'second', start, end]),
        [['first', 0, 1], ['first', 1, 3], ['second', 0, 1], ['second', 1, 2]]);
    assert.equal(animator.calls.length, 1);
    const { keyframes, timing } = animator.calls[0];
    assert.equal(timing.duration, 4 * 48);
    assert.equal(timing.easing, 'linear');
    assert.match(keyframes[1].clipPath, /10\.0000%/);
    assert.match(keyframes[2].clipPath, /30\.0000%/);
    assert.match(keyframes[3].clipPath, /50\.0000%/); // second line starts below the full first line
    assert.deepEqual(new Set(keyframes.slice(0, -1).map(frame => frame.easing)), new Set(['steps(1, end)']));
    assert.deepEqual(new Set(keyframes.slice(0, -1).map(frame => frame.offset)).size, 5);
    assert.equal(sounds[0].textType, 'dialogue');
    assert.deepEqual(sounds[0].timesMs, [48, 144]);
    assert.equal(applyTypewriterEffect(root, options).animated, true);
    assert.equal(animator.calls.length, 1);
    assert.equal(cancelTypewriter(root, { finish: true }), true);
    assert.deepEqual(sounds.slice(1), ['stop']);
    assert.equal(first.nodeValue + second.nodeValue, '甲😀乙丙');
    assert.equal(applyTypewriterEffect(root, options).animated, false);
});

test('classic keeps DOM grapheme order when glyph tops differ within one visual line', () => {
    const node = lockedText('ABCD');
    let offset = 0;
    const boxes = [
        { top: 0, bottom: 20, left: 0, right: 10, width: 10, height: 20 },
        { top: 4, bottom: 24, left: 10, right: 20, width: 10, height: 20 },
        { top: 0, bottom: 20, left: 20, right: 30, width: 10, height: 20 },
        { top: 4, bottom: 24, left: 30, right: 40, width: 10, height: 20 },
    ];
    const root = element(node);
    root.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40 });
    root.ownerDocument = { createRange() {
        return {
            setStart(_node, start) { offset = start; },
            setEnd() {},
            getClientRects() { return [boxes[offset]]; },
        };
    } };

    const result = measureClassicReveal(root, 28);
    assert.deepEqual(result.events.map(event => event.text), ['A', 'B', 'C', 'D']);
    assert.match(result.frames[1].clipPath, /60\.0000%/);
    assert.deepEqual(new Set(result.frames.slice(0, -1).map(frame => frame.easing)), new Set(['steps(1, end)']));
});

test('classic preserves DOM order when visual lines span nested text nodes', () => {
    const first = lockedText('AB');
    const second = lockedText('CD');
    let currentNode = null;
    let offset = 0;
    const boxes = [
        { top: 0, bottom: 20, left: 0, right: 10, width: 10, height: 20 },
        { top: 20, bottom: 40, left: 0, right: 10, width: 10, height: 20 },
        { top: 0, bottom: 20, left: 10, right: 20, width: 10, height: 20 },
        { top: 20, bottom: 40, left: 10, right: 20, width: 10, height: 20 },
    ];
    const root = element(first, second);
    root.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40 });
    root.ownerDocument = { createRange() {
        return {
            setStart(node, start) { currentNode = node; offset = start; },
            setEnd() {},
            getClientRects() { return [currentNode === first ? boxes[offset] : boxes[2 + offset]]; },
        };
    } };

    const result = measureClassicReveal(root, 28);
    assert.deepEqual(result.events.map(event => event.text), ['A', 'B', 'C', 'D']);
});

test('classic skips audio for mute, zero volume, reduced motion and unavailable geometry', () => {
    const scheduler = () => { throw new Error('unexpected audio'); };
    for (const variant of [
        { sound: { enabled: false, volume: 0.5 } },
        { sound: { enabled: true, volume: 0, narrationVolume: 0 } }, { reducedMotion: true },
    ]) {
        const { root } = classicRoot();
        const animator = createAnimator();
        applyTypewriterEffect(root, { enabled: true, mode: 'classic', sound: { enabled: true, volume: 0.5 }, textType: 'narration', reducedMotion: false, animate: animator.animate, audioScheduler: scheduler, ...variant });
        cancelTypewriter(root);
    }
    const root = element(lockedText('布局不可用'));
    const result = applyTypewriterEffect(root, { enabled: true, mode: 'classic', textType: 'dialogue', reducedMotion: false, audioScheduler: scheduler });
    assert.equal(result.animated, false);
    assert.equal(root.dataset.igsTypewriter, 'complete');
});

test('classic sound ducks scene audio while playing and releases on cancel', () => {
    const queue = [];
    const timers = {
        schedule(fn, delay) { const timer = { fn, delay }; queue.push(timer); return timer; },
        clear(timer) { const i = queue.indexOf(timer); if (i >= 0) queue.splice(i, 1); },
    };
    const settle = () => { for (let i = 0; i < 400 && queue.length; i++) queue.shift().fn(); };
    const bgmAudio = { volume: 1, play() { return Promise.resolve(); }, pause() {} };
    const sceneRoot = { ownerDocument: { addEventListener() {}, removeEventListener() {} } };
    applySceneAudio(sceneRoot, {
        bgm: { enabled: true, volume: 0.6, tracks: [{ url: 'https://x/calm.mp3', keywords: [] }] },
        audioFactory: () => bgmAudio, schedule: timers.schedule, clear: timers.clear,
    });
    settle();
    assert.ok(Math.abs(bgmAudio.volume - 0.6) < 1e-9);
    const { root } = classicRoot();
    const options = {
        enabled: true, mode: 'classic', speed: 'slow', reducedMotion: false, sound: { enabled: true, volume: 0.5 },
        textType: 'dialogue', animate: createAnimator().animate, audioScheduler: () => ({ stop() {} }),
    };
    assert.equal(applyTypewriterEffect(root, options).animated, true);
    settle();
    assert.ok(Math.abs(bgmAudio.volume - 0.6 * TYPING_DUCK_RATIO) < 1e-9, 'typing ducks gently');
    cancelTypewriter(root, { finish: true });
    settle();
    assert.ok(Math.abs(bgmAudio.volume - 0.6) < 1e-9);
    cancelSceneAudio(sceneRoot);
});

test('gate: character voice tunes pitch by emotion and pans dialogue by sprite position', () => {
    assert.deepEqual(['开心地笑', '有点难过', '平静', ''].map(emotionPitch), [1.06, 0.92, 1, 1]);
    assert.deepEqual([0, 20, 50, 80, 100, undefined, 'x'].map(spritePan), [-0.5, -0.3, 0, 0.3, 0.5, 0, 0]);
    const on = { speakerPitch: true };
    const happy = resolveTypewriterVoice(on, 'dialogue', '甲', { emotion: '兴奋', posX: 80 });
    assert.ok(Math.abs(happy.pitch - speakerPitch('甲') * 1.06) < 1e-9);
    assert.equal(happy.pan, 0.3);
    assert.equal(resolveTypewriterVoice(on, 'thought', '甲', { emotion: '低落', posX: 80 }).pan, 0, '心里话居中');
    assert.ok(Math.abs(resolveTypewriterVoice(on, 'thought', '甲', { emotion: '低落' }).pitch - speakerPitch('甲') * 0.92) < 1e-9);
    assert.deepEqual(resolveTypewriterVoice({}, 'dialogue', '甲', { emotion: '开心', posX: 0 }), { preset: 'dududu', pitch: 1, pan: 0 }, '关闭时统一音高、居中');
    assert.deepEqual(resolveTypewriterVoice(on, 'narration', '甲', { emotion: '开心', posX: 0 }).pan, 0);
    const calls = [];
    const audioScheduler = (info) => { calls.push(info); return { stop() {} }; };
    const events = [{ text: '甲', timeMs: 0 }];
    scheduleTypewriterAudio(events, { textType: 'dialogue', volume: 0.5, audioScheduler, pan: -0.3 });
    scheduleTypewriterAudio(events, { textType: 'dialogue', volume: 0.5, audioScheduler, pan: -0.3, phone: true });
    assert.deepEqual(calls.map((c) => c.pan), [-0.3, 0], '通话听筒不分声道');
    const { root } = classicRoot();
    const sounds = [];
    applyTypewriterEffect(root, {
        enabled: true, mode: 'classic', reducedMotion: false, animate: createAnimator().animate,
        sound: { enabled: true, speakerPitch: true }, textType: 'dialogue', speaker: '甲', emotion: '开心', posX: 20,
        audioScheduler(info) { sounds.push(info); return { stop() {} }; },
    });
    cancelTypewriter(root);
    assert.equal(sounds[0].pan, -0.3);
    assert.ok(Math.abs(sounds[0].pitch - speakerPitch('甲') * 1.06) < 1e-9);
});
