import assert from 'node:assert/strict';
import test from 'node:test';
import { CROWD_STYLE_TEXT, applyCrowdFx, resolveCrowdDensity } from '../src/visual/igs-ui/crowd-fx.js';
import { PLACES_AMBIENT_KINDS, placesAmbientPlan } from '../src/visual/igs-ui/fx-places-voices.js';
import { PLACES_AMBIENCE_HTML, PLACES_STYLE_TEXT } from '../src/visual/igs-ui/fx-places-style.js';
import { resolveAmbientPlan } from '../src/visual/igs-ui/scene-audio.js';

test('crowd ambience: single-character place words no longer trigger it', () => {
    assert.equal(resolveCrowdDensity('街角', ''), 0);
    assert.equal(resolveCrowdDensity('市长办公室', ''), 0);
    assert.equal(resolveCrowdDensity('车站', ''), 3);
    assert.equal(resolveCrowdDensity('车站', '深夜'), 2);
    assert.equal(resolveCrowdDensity('商店街', ''), 3);
});

test('crowd ambience: no human figures, umbrellas or svg in the style or markup', () => {
    assert.ok(!/igs-crowd-p\b|igs-crowd-near|igs-crowd-far/.test(CROWD_STYLE_TEXT));
    const fake = { querySelector: () => null };
    assert.equal(applyCrowdFx(fake, {}), 0);
});

test('places ambience: police gets a voice, objects are gone from markup and style', () => {
    assert.ok(PLACES_AMBIENT_KINDS.includes('plpolice'));
    assert.ok(!/pol-tape|hos-mon|kon-sign/.test(JSON.stringify(PLACES_AMBIENCE_HTML) + PLACES_STYLE_TEXT));
    assert.deepEqual(placesAmbientPlan({ location: '警察局', worldview: '' }).map((p) => p.kind), ['plpolice']);
});

test('places ambience: a shrine without a festival keeps only chimes and leaves', () => {
    assert.equal(placesAmbientPlan({ location: '神社', worldview: '' })[0].variant, 'quiet');
    assert.notEqual(placesAmbientPlan({ location: '夏日祭典', worldview: '' })[0].variant, 'quiet');
});

test('crowd audio level has three tiers', () => {
    const on = { enabled: true };
    const level = (location) => (resolveAmbientPlan({ location }, on) || []).find((l) => l.kind === 'crowd')?.level;
    assert.equal(level('车站'), 'heavy');
});

test('elevator and eavesdrop use pure black covers', () => {
    assert.match(PLACES_STYLE_TEXT, /\.igs-pl-door\{[^}]*background:#000/);
    assert.match(PLACES_STYLE_TEXT, /\.igs-pl-crack\.is-l\{[^}]*#000/);
});
