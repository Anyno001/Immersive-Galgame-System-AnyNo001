import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHAT_SFX_PRESETS,
    CHAT_SFX_PRESET_LABELS,
    normalizeChatSfxPreset,
    CHAT_SFX_PARTIALS,
    chatSfxDuration,
    chatSfxKindForSide,
    playChatSfx,
    renderChatSfx,
} from '../src/visual/igs-ui/chat-sfx.js';

function peak(samples) {
    return samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
}

test('gate: chat sfx maps right side to send and others to receive', () => {
    assert.equal(chatSfxKindForSide('right'), 'send');
    assert.equal(chatSfxKindForSide('left'), 'receive');
    assert.equal(chatSfxKindForSide(undefined), 'receive');
});

test('gate: chat sfx renders short, audible, unclipped samples', () => {
    for (const kind of Object.keys(CHAT_SFX_PARTIALS)) {
        const samples = renderChatSfx(kind, { sampleRate: 22050 });
        assert.equal(samples.length, Math.ceil(chatSfxDuration(kind) * 22050));
        assert.ok(chatSfxDuration(kind) <= 0.3, `${kind} stays a short blip`);
        assert.ok(peak(samples) > 0.1, `${kind} is audible`);
        assert.ok(peak(samples) <= 1, `${kind} does not clip`);
        assert.ok(samples.every(Number.isFinite));
    }
});

test('gate: chat sfx fades out and scales with volume', () => {
    const full = renderChatSfx('receive', { sampleRate: 22050 });
    const half = renderChatSfx('receive', { sampleRate: 22050, volume: 0.5 });
    assert.ok(Math.abs(peak(half) - peak(full) / 2) < 1e-6);
    assert.ok(peak(full.slice(-20)) < 0.01);
});

test('gate: chat sfx ignores unknown kinds and zero volume', () => {
    assert.equal(renderChatSfx('nope').length, 0);
    assert.equal(playChatSfx('nope', { audioScheduler: () => ({ stop() {} }) }), null);
    assert.equal(playChatSfx('send', { volume: 0, audioScheduler: () => ({ stop() {} }) }), null);
});

test('gate: chat sfx hands partials to an injected scheduler', () => {
    const calls = [];
    const handle = playChatSfx('send', { volume: 0.4, audioScheduler: (job) => { calls.push(job); return { stop() {} }; } });
    assert.ok(handle);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, 'send');
    assert.equal(calls[0].volume, 0.4);
    assert.equal(calls[0].partials, CHAT_SFX_PARTIALS.send);
});

test('gate: chat sfx returns null without WebAudio', () => {
    assert.equal(playChatSfx('receive', { volume: 0.5 }), null);
});

test('gate: every chat sfx preset renders both kinds audibly without clipping', () => {
    assert.deepEqual(CHAT_SFX_PRESET_LABELS.map(([id]) => id), Object.keys(CHAT_SFX_PRESETS));
    for (const preset of Object.keys(CHAT_SFX_PRESETS)) {
        for (const kind of ['receive', 'send']) {
            const samples = renderChatSfx(kind, { sampleRate: 22050, preset });
            assert.ok(chatSfxDuration(kind, preset) <= 0.5, `${preset}/${kind} short`);
            assert.ok(peak(samples) > 0.08, `${preset}/${kind} audible`);
            assert.ok(peak(samples) <= 1, `${preset}/${kind} no clip`);
            assert.ok(samples.every(Number.isFinite));
        }
    }
    assert.equal(normalizeChatSfxPreset('nope'), 'cute');
    assert.equal(normalizeChatSfxPreset('water'), 'water');
    assert.notDeepEqual(renderChatSfx('send', { preset: 'water' }), renderChatSfx('send', { preset: 'cute' }));
});

test('gate: chat sfx preset reaches the injected scheduler', () => {
    const jobs = [];
    playChatSfx('receive', { preset: 'soft', audioScheduler: (job) => { jobs.push(job); return {}; } });
    assert.equal(jobs[0].preset, 'soft');
    assert.equal(jobs[0].partials, CHAT_SFX_PRESETS.soft.receive);
});
