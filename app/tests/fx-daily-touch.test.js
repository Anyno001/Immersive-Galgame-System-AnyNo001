import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { dailyGrammarLines } from '../src/visual/igs-ui/fx-daily-prompt.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';
import { cancelDailyFx, renderDailyFx } from '../src/visual/igs-ui/fx-daily.js';
import { applyFxEra } from '../src/scene/fx-era.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const KINDS = ['pat', 'poke', 'fever'];

test('gate:fx-daily-touch parse, fever needs a number and flags high readings', () => {
    assert.deepEqual(parseDailyFxBody('pat', ['林晚']), ['pat', '林晚']);
    assert.deepEqual(parseDailyFxBody('poke', []), ['poke', '']);
    assert.equal(parseDailyFxBody('fever', ['有点烫']), null);
    assert.equal(dailyFxOf(parseDailyFxBody('fever', ['38.2'])).high, true);
    assert.equal(dailyFxOf(parseDailyFxBody('fever', ['36.6'])).high, false);
});

test('gate:fx-daily-touch kinds are opt-in, styled, era-neutral', () => {
    const legacy = normalizeDailyFxSettings({ enabled: true });
    for (const kind of KINDS) {
        assert.equal(legacy[kind], false, kind);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`), kind);
    }
    assert.doesNotMatch(dailyGrammarLines({ enabled: true }).join('\n'), /pat\||poke\||fever\|/);
    const ancient = applyFxEra({ dailyFx: { enabled: true, pat: true, poke: true, fever: true } }, true).dailyFx;
    for (const kind of KINDS) assert.equal(ancient[kind], true, kind);
});

function snapshotOf(item) {
    return {
        messageId: 3,
        readerSettings: { dailyFx: { enabled: true, petals: false, pat: true, poke: true, fever: true } },
        content: { currentIndex: 0, fx: { daily: [item] } },
    };
}

function render(root, item, extra = {}) {
    const timers = makeTimers();
    const sounds = [];
    const result = renderDailyFx(root, snapshotOf(item), { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, playSfx: (k) => sounds.push(k), ...extra });
    return { result, sounds, timers };
}

test('gate:fx-daily-touch poke squishes the sprite with add composite and never writes inline transform', () => {
    const root = makeStage({ waapi: true });
    const sprite = root.querySelector('#igs-sprite');
    sprite.style.backgroundImage = 'url("a.png")';
    sprite.style.backgroundPosition = '30% 100%';
    const { result, sounds } = render(root, { type: 'poke', who: '' });
    assert.deepEqual(result.played, ['poke']);
    assert.deepEqual(sounds, ['sticky']);
    assert.equal(sprite.animations.length, 1);
    assert.equal(sprite.animations[0].options.composite, 'add');
    assert.equal(sprite.style.transform, undefined);
    cancelDailyFx(root);
});

test('gate:fx-daily-touch poke skips without sprite, without WAAPI or in reduced motion', () => {
    const bare = makeStage({ waapi: true });
    assert.deepEqual(render(bare, { type: 'poke', who: '' }).result.played, []);
    cancelDailyFx(bare);
    const noWaapi = makeStage();
    noWaapi.querySelector('#igs-sprite').style.backgroundImage = 'url("a.png")';
    assert.deepEqual(render(noWaapi, { type: 'poke', who: '' }).result.played, []);
    cancelDailyFx(noWaapi);
    const reduced = makeStage({ waapi: true });
    const sprite = reduced.querySelector('#igs-sprite');
    sprite.style.backgroundImage = 'url("a.png")';
    assert.deepEqual(render(reduced, { type: 'poke', who: '' }, { reducedMotion: true }).result.played, []);
    assert.equal((sprite.animations || []).length, 0);
    cancelDailyFx(reduced);
});

test('gate:fx-daily-touch pat follows sprite x and fever escapes reading', () => {
    const root = makeStage();
    const sprite = root.querySelector('#igs-sprite');
    sprite.style.backgroundImage = 'url("a.png")';
    sprite.style.backgroundPosition = '30% 100%';
    const pat = render(root, { type: 'pat', who: '林晚' });
    assert.deepEqual(pat.result.played, ['pat']);
    const stage = root.querySelector('#igs-fx-stage');
    assert.match(stage.children[stage.children.length - 1].innerHTML, /left:30%/);
    cancelDailyFx(root);
    const other = makeStage();
    render(other, { type: 'fever', temp: '<b>38</b>', high: true });
    const card = other.querySelector('#igs-fx-front').children[0];
    assert.match(card.className, /is-high/);
    assert.doesNotMatch(card.innerHTML, /<b>/);
    cancelDailyFx(other);
});
