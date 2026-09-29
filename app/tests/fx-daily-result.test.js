import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_FX_KINDS, dailyFxOf, parseDailyFxBody, rpsOutcome } from '../src/scene/daily-fx-directives.js';
import { enabledDailyFxKinds, normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { dailyGrammarLines } from '../src/visual/igs-ui/fx-daily-prompt.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';
import { applyFxEra } from '../src/scene/fx-era.js';

const NEW_KINDS = ['rps', 'gacha', 'game', 'score'];

test('gate:fx-daily-result rps parses hands and outcome comes from the tag only', () => {
    assert.deepEqual(parseDailyFxBody('rps', ['石头', '剪刀']), ['rps', 'rock', 'scissors']);
    assert.deepEqual(dailyFxOf(['rps', 'rock', 'scissors']), { type: 'rps', mine: 'rock', theirs: 'scissors', outcome: 'win' });
    assert.equal(rpsOutcome('paper', 'scissors'), 'lose');
    assert.equal(rpsOutcome('paper', 'paper'), 'draw');
    assert.equal(parseDailyFxBody('rps', ['石头']), null);
    assert.equal(parseDailyFxBody('rps', ['石头', '锤子']), null);
});

test('gate:fx-daily-result gacha/game/score required fields and fail flag', () => {
    assert.equal(parseDailyFxBody('gacha', []), null);
    assert.deepEqual(dailyFxOf(parseDailyFxBody('gacha', ['兔子挂件'])), { type: 'gacha', item: '兔子挂件' });
    assert.deepEqual(parseDailyFxBody('game', ['胜']), ['game', 'win']);
    assert.equal(parseDailyFxBody('game', ['还行']), null);
    assert.equal(parseDailyFxBody('score', ['数学']), null);
    assert.equal(dailyFxOf(parseDailyFxBody('score', ['数学', '58'])).fail, true);
    assert.equal(dailyFxOf(parseDailyFxBody('score', ['数学', '92分'])).fail, false);
    assert.equal(dailyFxOf(parseDailyFxBody('score', ['体育', '优'])).fail, false);
});

test('gate:fx-daily-result new kinds are opt-in, styled, and era-filtered', () => {
    const legacy = normalizeDailyFxSettings({ enabled: true });
    for (const kind of NEW_KINDS) {
        assert.ok(DAILY_FX_KINDS.includes(kind), kind);
        assert.equal(legacy[kind], false, kind);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`), kind);
    }
    assert.equal(legacy.photo, true);
    assert.doesNotMatch(dailyGrammarLines({ enabled: true }).join('\n'), /rps\||gacha\||game\||score\|/);
    const on = { enabled: true, rps: true, gacha: true, game: true, score: true };
    assert.deepEqual(enabledDailyFxKinds(on).filter((k) => NEW_KINDS.includes(k)), NEW_KINDS);
    const ancient = applyFxEra({ dailyFx: on }, true).dailyFx;
    assert.equal(ancient.rps, true);
    assert.equal(ancient.gacha, false);
    assert.equal(ancient.game, false);
    assert.equal(ancient.score, false);
});
