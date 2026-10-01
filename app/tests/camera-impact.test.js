import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_IMPACT_PARAMS, cancelCameraImpact, playCameraImpact } from '../src/visual/igs-ui/camera-impact.js';

function makeStage() {
    const calls = [];
    return {
        calls,
        animate(frames, opts) {
            const anim = { frames, opts, cancelled: false, onfinish: null, cancel() { this.cancelled = true; } };
            calls.push(anim);
            return anim;
        },
    };
}

function makeSfx() {
    const log = [];
    const playSfx = (kind) => { log.push(kind); return { stop() { log.push('stop'); } }; };
    return { log, playSfx };
}

test('gate:camera-impact:independent-scale-once-per-key-with-synced-sfx', () => {
    const stage = makeStage();
    const sfx = makeSfx();
    const first = playCameraImpact(stage, { key: 'm1:0', reducedMotion: false, playSfx: sfx.playSfx });
    assert.equal(first.played, true);
    assert.equal(stage.calls.length, 1);
    const { frames, opts } = stage.calls[0];
    assert.ok(frames.every((f) => 'scale' in f && !('transform' in f)), 'only the independent scale property');
    assert.equal(frames[1].scale, String(CAMERA_IMPACT_PARAMS.peak));
    assert.equal(frames[2].scale, '1');
    assert.equal(opts.duration, CAMERA_IMPACT_PARAMS.duration);
    assert.deepEqual(sfx.log, ['impact']);

    stage.calls[0].onfinish();
    const repeated = playCameraImpact(stage, { key: 'm1:0', reducedMotion: false, playSfx: sfx.playSfx });
    assert.equal(repeated.played, false);
    assert.equal(stage.calls.length, 1, 'same page re-render does not replay');
    assert.deepEqual(sfx.log, ['impact']);

    const next = playCameraImpact(stage, { key: 'm1:1', reducedMotion: false, playSfx: sfx.playSfx });
    assert.equal(next.played, true);
    assert.equal(stage.calls.length, 2);
});

test('gate:camera-impact:reduced-motion-skips-and-cancel-cleans-up', () => {
    const stage = makeStage();
    const sfx = makeSfx();
    const reduced = playCameraImpact(stage, { key: 'a', reducedMotion: true, playSfx: sfx.playSfx });
    assert.equal(reduced.played, false);
    assert.equal(stage.calls.length, 0);
    assert.deepEqual(sfx.log, []);

    assert.equal(playCameraImpact(stage, { key: 'b', reducedMotion: false, playSfx: sfx.playSfx }).played, true);
    assert.equal(cancelCameraImpact(stage), true);
    assert.equal(stage.calls[0].cancelled, true);
    assert.deepEqual(sfx.log, ['impact', 'stop']);
    assert.equal(cancelCameraImpact(stage), false);
});

test('gate:camera-impact:no-animate-support-is-silent', () => {
    const sfx = makeSfx();
    assert.equal(playCameraImpact({}, { key: 'x', reducedMotion: false, playSfx: sfx.playSfx }).played, false);
    assert.equal(playCameraImpact(null, { key: 'x', reducedMotion: false }).played, false);
    assert.deepEqual(sfx.log, []);
});


test('gate:camera-impact:settings-default-off-and-exact-emotion-match', async () => {
    const { normalizeCameraSettings, pickCameraImpact, CAMERA_IMPACT_DEFAULTS } = await import('../src/visual/igs-ui/stage-direction-settings.js');
    const legacy = normalizeCameraSettings({ enabled: true, closeUp: true });
    assert.equal(legacy.impact, false, 'existing camera settings do not gain impact');
    assert.deepEqual(legacy.impactEmotions, CAMERA_IMPACT_DEFAULTS);
    const on = normalizeCameraSettings({ enabled: true, impact: true });
    assert.equal(pickCameraImpact(' 震惊 ', on), true);
    assert.equal(pickCameraImpact('震惊的', on), false);
    assert.equal(pickCameraImpact('震惊', { ...on, enabled: false }), false);
    assert.deepEqual(normalizeCameraSettings({ impactEmotions: [] }).impactEmotions, []);
});

test('gate:camera-impact:sfx-respects-sound-switch', async () => {
    const { playCameraImpactSfx, CAMERA_IMPACT_PARTIALS } = await import('../src/visual/igs-ui/camera-impact.js');
    assert.ok(CAMERA_IMPACT_PARTIALS.length > 0);
    assert.equal(playCameraImpactSfx({ enabled: false, volume: 0.5 }), null);
    assert.equal(playCameraImpactSfx({ enabled: true, volume: 0 }), null);
    assert.equal(playCameraImpactSfx(null), null);
});

test('gate:camera-impact:low-quality-skips-animation-and-sfx', () => {
    const stage = makeStage();
    const sfx = makeSfx();
    const low = playCameraImpact(stage, { key: 'q', reducedMotion: false, lowQuality: true, playSfx: sfx.playSfx });
    assert.equal(low.played, false);
    assert.equal(stage.calls.length, 0);
    assert.deepEqual(sfx.log, []);
});

test('gate:camera-impact:yields-to-stage-shake-on-the-same-page', async () => {
    const { planCameraImpact } = await import('../src/visual/igs-ui/camera-impact.js');
    const { normalizeCameraSettings } = await import('../src/visual/igs-ui/stage-direction-settings.js');
    const camera = normalizeCameraSettings({ enabled: true, impact: true });
    const base = { newPage: true, motionOn: true, eligible: true, emotion: '震惊', camera };
    assert.equal(planCameraImpact(base), 'play');
    assert.equal(planCameraImpact({ ...base, stageShakeActive: true }), 'yield');
    assert.equal(planCameraImpact({ ...base, newPage: false }), '');
    assert.equal(planCameraImpact({ ...base, eligible: false }), '');
    assert.equal(planCameraImpact({ ...base, motionOn: false }), '');
    assert.equal(planCameraImpact({ ...base, emotion: '开心' }), '');
    assert.equal(planCameraImpact(), '');
});

