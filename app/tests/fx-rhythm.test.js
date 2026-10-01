import test from 'node:test';
import assert from 'node:assert/strict';
import { FX_RHYTHM, fxRhythm } from '../src/visual/igs-ui/fx-rhythm.js';
import { CAMERA_IMPACT_PARAMS } from '../src/visual/igs-ui/camera-impact.js';

test('gate:fx-rhythm:named-specs-frozen-and-unknown-falls-back-to-enter', () => {
    assert.ok(Object.isFrozen(FX_RHYTHM));
    for (const spec of Object.values(FX_RHYTHM)) {
        assert.ok(spec.duration > 0);
        assert.match(spec.easing, /^cubic-bezier\(/);
    }
    assert.equal(fxRhythm('impact'), FX_RHYTHM.impact);
    assert.equal(fxRhythm('nope'), FX_RHYTHM.enter);
    assert.equal(fxRhythm('__proto__'), FX_RHYTHM.enter);
});

test('gate:fx-rhythm:camera-impact-keeps-original-timing', () => {
    assert.equal(CAMERA_IMPACT_PARAMS.duration, 420);
    assert.equal(FX_RHYTHM.impact.duration, CAMERA_IMPACT_PARAMS.duration);
});
