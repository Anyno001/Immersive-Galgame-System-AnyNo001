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

test('heaven ambience: celestial place words hit, false friends and flight do not', async () => {
    const { resolvePlaceAmbience, STILL_PLACE_KINDS } = await import('../src/scene/place-ambience.js');
    const kind = (location, worldview = '') => resolvePlaceAmbience(location, { worldview })?.kind || null;
    for (const word of ['天庭', '天宫', '天界', '仙界', '天堂', '凌霄殿', '南天门', '瑶池', '蓬莱仙境', 'Heaven', '神域']) {
        assert.equal(kind(word), 'heaven', word);
    }
    assert.equal(kind('天庭', 'ancient'), 'heaven');
    for (const word of ['学校天台', '人行天桥', '天堂鸟花园', '天花板', '天上人间夜总会', '天宫空间站', '太平天国', '天庭饱满']) {
        assert.notEqual(kind(word), 'heaven', word);
    }
    assert.equal(kind('驾云飞向南天门'), 'sky');
    assert.equal(kind('云海', 'ancient'), 'cloudsea');
    assert.ok(STILL_PLACE_KINDS.includes('heaven'));
});

test('heaven ambience: light mist only, gated by the place light switch, borrows the high wind', async () => {
    const { AMB_DETAIL_STYLE_TEXT } = await import('../src/visual/igs-ui/fx-daily-amb-style.js');
    const { makeStage, makeTimers } = await import('./helpers/fake-dom.js');
    const { renderDailyFx } = await import('../src/visual/igs-ui/fx-daily.js');
    assert.match(AMB_DETAIL_STYLE_TEXT, /\.is-heaven\.is-night/);
    assert.ok(!/blur\(|mix-blend-mode|<svg/.test(AMB_DETAIL_STYLE_TEXT.split('-hveil')[1].split('-innbeam')[0]));
    const timers = makeTimers();
    const ambOf = (placeLight) => {
        const root = makeStage({ waapi: true });
        renderDailyFx(root, {
            messageId: 'h1',
            readerSettings: { dailyFx: { enabled: true, placeLight }, fxSound: { enabled: false, volume: 0 } },
            content: { currentIndex: 0, sceneLocation: '南天门' },
        }, { reducedMotion: false, schedule: timers.schedule, clear: timers.clear, playSfx: () => {} });
        const find = (el) => (/igs-dfx-amb/.test(el.className) && /is-heaven/.test(el.className) ? el : el.children.map(find).find(Boolean));
        return find(root);
    };
    const on = ambOf(true);
    assert.ok(on, 'placeLight on mounts the layer');
    assert.equal((on.innerHTML.match(/<i /g) || []).length, 3);
    assert.equal(ambOf(false), undefined, 'placeLight off mounts nothing');
    const wind = (resolveAmbientPlan({ location: '南天门' }, { enabled: true }) || []).find((l) => l.kind === 'sky');
    assert.equal(wind?.level, 'light');
});
