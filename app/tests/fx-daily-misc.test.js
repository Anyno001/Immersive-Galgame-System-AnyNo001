import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { dailyGrammarLines } from '../src/visual/igs-ui/fx-daily-prompt.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';
import { cancelDailyFx, renderDailyFx } from '../src/visual/igs-ui/fx-daily.js';
import { applyFxEra } from '../src/scene/fx-era.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const KINDS = ['cheers', 'cook', 'cat'];

test('gate:fx-daily-misc parse; cook needs a dish name', () => {
    assert.deepEqual(parseDailyFxBody('cheers', []), ['cheers']);
    assert.deepEqual(parseDailyFxBody('cat', []), ['cat']);
    assert.equal(parseDailyFxBody('cook', []), null);
    assert.deepEqual(dailyFxOf(parseDailyFxBody('cook', ['蛋包饭'])), { type: 'cook', dish: '蛋包饭' });
});

test('gate:fx-daily-misc kinds are opt-in, styled, era-neutral', () => {
    const legacy = normalizeDailyFxSettings({ enabled: true });
    for (const kind of KINDS) {
        assert.equal(legacy[kind], false, kind);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`), kind);
    }
    assert.doesNotMatch(dailyGrammarLines({ enabled: true }).join('\n'), /cheers|cook\||cat：/);
    const ancient = applyFxEra({ dailyFx: { enabled: true, cheers: true, cook: true, cat: true } }, true).dailyFx;
    for (const kind of KINDS) assert.equal(ancient[kind], true, kind);
});

function render(item) {
    const root = makeStage();
    const timers = makeTimers();
    const sounds = [];
    const result = renderDailyFx(root, {
        messageId: 4,
        readerSettings: { dailyFx: { enabled: true, petals: false, cheers: true, cook: true, cat: true } },
        content: { currentIndex: 0, fx: { daily: [item] } },
    }, { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, playSfx: (k) => sounds.push(k) });
    return { root, result, sounds };
}

test('gate:fx-daily-misc render cards with reused sounds and escaped dish', () => {
    const cook = render({ type: 'cook', dish: '<i>咖喱</i>' });
    assert.deepEqual(cook.result.played, ['cook']);
    assert.deepEqual(cook.sounds, ['lantern']);
    const card = cook.root.querySelector('#igs-fx-front').children[0];
    assert.doesNotMatch(card.innerHTML, /<i>咖喱/);
    cancelDailyFx(cook.root);
    const cat = render({ type: 'cat' });
    assert.deepEqual(cat.result.played, ['cat']);
    assert.deepEqual(cat.sounds, ['sticky']);
    cancelDailyFx(cat.root);
    const cheers = render({ type: 'cheers' });
    assert.deepEqual(cheers.sounds, ['touch']);
    cancelDailyFx(cheers.root);
});

test('gate:fx-daily-touch-skipped-inside-battle', async () => {
    const { planDailyFx } = await import('../src/visual/igs-ui/fx-daily-model.js');
    const settings = { enabled: true, touch: true };
    const daily = [{ type: 'touch', what: '环抱' }];
    assert.equal(planDailyFx({ daily }, { settings }).length, 1);
    assert.equal(planDailyFx({ daily, battle: { foe: '狼人' } }, { settings }).length, 0);
    assert.equal(planDailyFx({ daily, hits: [{ result: 'hit' }] }, { settings }).length, 0);
});
