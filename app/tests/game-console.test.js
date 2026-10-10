import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_FX_KINDS, GAME_AMBIENCE_WORDS } from '../src/scene/game-console.js';
import { dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { resolveDateAmbience } from '../src/scene/date-ambience.js';
import { applyFxWorldview } from '../src/scene/fx-era.js';
import { detectPromptTriggers } from '../src/scene/prompt-triggers.js';
import { DAILY_SFX } from '../src/visual/igs-ui/fx-daily-sfx.js';
import { GAME_BUILDERS, comboStages } from '../src/visual/igs-ui/fx-daily-game.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';
import { resolveAmbientPlan } from '../src/visual/igs-ui/scene-audio.js';

const parse = (kind, fields) => dailyFxOf(parseDailyFxBody(kind, fields));
const doc = { createElement: () => ({ className: '', innerHTML: '', style: {} }) };

test('gate:game-console parse is lenient', () => {
    assert.deepEqual(parse('console', ['马里奥', 'Switch']), { type: 'console', game: '马里奥', platform: 'Switch' });
    assert.deepEqual(parse('console', []), { type: 'console', game: '', platform: '' });
    assert.deepEqual(parse('versus', ['小雨', '主角', '60%', '0']), { type: 'versus', p1: '小雨', p2: '主角', hp1: 60, hp2: 0 });
    assert.deepEqual(parse('versus', []), { type: 'versus', p1: '', p2: '', hp1: 100, hp2: 100 });
    assert.deepEqual(parse('versus', ['小雨', '60', '20']), { type: 'versus', p1: '小雨', p2: '', hp1: 60, hp2: 20 });
    assert.deepEqual(parse('combo', ['12', '升龙']), { type: 'combo', count: 12, move: '升龙' });
    assert.deepEqual(parse('combo', ['很多']), { type: 'combo', count: 0, move: '' });
    assert.equal(parse('combo', ['99999']).count, 999);
    assert.deepEqual(parse('snatch', []), { type: 'snatch', act: '', who: '' });
});

test('gate:game-console kinds are modern-only and styled', () => {
    for (const kind of GAME_FX_KINDS) {
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`), kind);
        const all = { dailyFx: { enabled: true, [kind]: true } };
        assert.equal(applyFxWorldview(all, 'ancient').dailyFx[kind], false);
        assert.equal(applyFxWorldview(all, 'modern').dailyFx[kind], true);
    }
});

test('gate:game-console triggers on game words', () => {
    assert.ok(detectPromptTriggers({ userText: '我们一起联机对战吧' }).has('play'));
    assert.ok(!detectPromptTriggers({ userText: '今天天气不错' }).has('play'));
});

test('gate:game-console ambience by place and ambient plan', () => {
    assert.ok(GAME_AMBIENCE_WORDS.length > 0);
    assert.deepEqual(resolveDateAmbience('家里的游戏房'), { kind: 'console', variant: '' });
    assert.ok(resolveAmbientPlan({ location: '游戏室' }, { enabled: true }).some((l) => l.kind === 'console'));
});

test('gate:game-console sfx have full envelopes, noise or bell partials and modest gain', () => {
    for (const kind of ['game-boot', 'game-win', 'game-lose', 'game-draw', 'game-versus', 'game-ko', 'game-combo', 'game-snatch']) {
        const { partials, noise } = DAILY_SFX[kind];
        assert.ok(noise.length > 0 || partials.some((q) => q.wave === 'sine' && q.from > 400), kind);
        assert.ok(partials.some((q) => q.wave !== 'sine') || noise.length, kind);
        for (const q of [...partials, ...noise]) {
            assert.ok(q.gain > 0 && q.gain <= 0.7, `${kind} gain`);
            assert.ok(q.attack > 0, `${kind} attack`);
            assert.notEqual(q.env, 'flat', `${kind} must not ramp to 0`);
        }
    }
    // 连击按键越来越密。
    const starts = DAILY_SFX['game-combo'].noise.filter((q) => q.filter === 'bandpass' && q.freq === 3200).map((q) => q.start);
    assert.ok(starts.length >= 14);
    assert.ok(starts[1] - starts[0] > starts[starts.length - 1] - starts[starts.length - 2]);
});

test('gate:game-console builders: combo escalates, versus remembers hp, ko adds sound', () => {
    const env = { doc, hold: 1 };
    const stages = comboStages(30);
    assert.equal(stages.at(-1), 30);
    assert.ok(stages.length >= 4 && stages.every((v, i) => i === 0 || v > stages[i - 1]));
    const combo = GAME_BUILDERS.combo({ count: 30, move: '' }, env);
    assert.match(combo.node.innerHTML, /is-s4 is-last/);
    assert.deepEqual(combo.sounds, ['game-combo']);
    const first = GAME_BUILDERS.versus({ p1: '甲', p2: '乙', hp1: 80, hp2: 50 }, env);
    assert.match(first.node.innerHTML, /--igs-hp-from:100%;--igs-hp:80%/);
    const second = GAME_BUILDERS.versus({ p1: '甲', p2: '乙', hp1: 20, hp2: 0 }, env);
    assert.match(second.node.innerHTML, /--igs-hp-from:80%;--igs-hp:20%/);
    assert.match(second.node.innerHTML, /K\.O\./);
    assert.deepEqual(second.sounds, ['game-versus', 'game-ko']);
    assert.match(second.node.innerHTML, /is-low/);
});
