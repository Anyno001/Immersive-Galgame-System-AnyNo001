import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { dailyGrammarLines } from '../src/visual/igs-ui/fx-daily-prompt.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';
import { cancelDailyFx, renderDailyFx } from '../src/visual/igs-ui/fx-daily.js';
import { applyFxEra, FX_ERA_ANCIENT_ONLY } from '../src/scene/fx-era.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const KINDS = ['guqin', 'go', 'poem', 'edict', 'tea', 'bow'];
const ALL_ON = { enabled: true, petals: false, guqin: true, go: true, poem: true, edict: true, tea: true, bow: true };

test('gate:fx-daily-ancient parse: poem/edict need text, go result optional', () => {
    assert.equal(parseDailyFxBody('poem', []), null);
    assert.equal(parseDailyFxBody('edict', []), null);
    assert.deepEqual(dailyFxOf(parseDailyFxBody('go', ['胜'])), { type: 'go', result: 'win' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('go', ['不知道'])), { type: 'go', result: '' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('go', [])), { type: 'go', result: '' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('poem', ['床前明月光'])), { type: 'poem', text: '床前明月光' });
});

test('gate:fx-daily-ancient kinds are opt-in, styled and prompt-gated', () => {
    const legacy = normalizeDailyFxSettings({ enabled: true });
    for (const kind of KINDS) {
        assert.equal(legacy[kind], false, kind);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`), kind);
    }
    assert.doesNotMatch(dailyGrammarLines({ enabled: true }).join('\n'), /guqin|poem\||edict\|/);
    assert.match(dailyGrammarLines(ALL_ON).join('\n'), /poem\|诗句/);
});

test('gate:fx-daily-ancient modern era strips ancient-only kinds; untouched input returned as-is', () => {
    assert.deepEqual([...FX_ERA_ANCIENT_ONLY.dailyFx].sort(), [...KINDS].sort());
    const reader = { dailyFx: { ...ALL_ON } };
    const modern = applyFxEra(reader, false);
    assert.notEqual(modern, reader);
    for (const kind of KINDS) assert.equal(modern.dailyFx[kind], false, kind);
    assert.equal(reader.dailyFx.poem, true, 'input untouched');
    const plain = { dailyFx: { enabled: true, photo: true } };
    assert.equal(applyFxEra(plain, false), plain);
    const ancient = applyFxEra(reader, true);
    for (const kind of KINDS) assert.equal(ancient.dailyFx[kind], true, kind);
});

function render(root, item, extra = {}) {
    const timers = makeTimers();
    const sounds = [];
    const result = renderDailyFx(root, {
        messageId: 5,
        readerSettings: { dailyFx: ALL_ON, _ancientEra: true },
        content: { currentIndex: 0, fx: { daily: [item] } },
    }, { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, playSfx: (k) => sounds.push(k), ...extra });
    return { result, sounds };
}

test('gate:fx-daily-ancient poem and edict escape text; go shows verdict', () => {
    const root = makeStage();
    render(root, { type: 'poem', text: '<b>诗</b>' });
    assert.doesNotMatch(root.querySelector('#igs-fx-front').children[0].innerHTML, /<b>/);
    cancelDailyFx(root);
    const edict = makeStage();
    render(edict, { type: 'edict', text: '<script>x</script>' });
    assert.doesNotMatch(edict.querySelector('#igs-fx-front').children[0].innerHTML, /<script>/);
    cancelDailyFx(edict);
    const go = makeStage();
    const played = render(go, { type: 'go', result: 'win' });
    assert.deepEqual(played.sounds, ['sticky']);
    assert.match(go.querySelector('#igs-fx-front').children[0].innerHTML, /igs-dfx-go-verdict">胜/);
    cancelDailyFx(go);
});

test('gate:fx-daily-ancient bow sinks sprite with add composite, skips without sprite or in reduced motion', () => {
    const root = makeStage({ waapi: true });
    const sprite = root.querySelector('#igs-sprite');
    sprite.style.backgroundImage = 'url("a.png")';
    assert.deepEqual(render(root, { type: 'bow', who: '' }).result.played, ['bow']);
    assert.equal(sprite.animations[0].options.composite, 'add');
    assert.equal(sprite.style.transform, undefined);
    cancelDailyFx(root);
    const bare = makeStage({ waapi: true });
    assert.deepEqual(render(bare, { type: 'bow', who: '' }).result.played, []);
    cancelDailyFx(bare);
    const reduced = makeStage({ waapi: true });
    reduced.querySelector('#igs-sprite').style.backgroundImage = 'url("a.png")';
    assert.deepEqual(render(reduced, { type: 'bow', who: '' }, { reducedMotion: true }).result.played, []);
    cancelDailyFx(reduced);
});


test('gate:fx-daily world-skin adds is-<id> to built nodes; ancient and modern stay unmarked', async () => {
    const { WORLD_SKIN_IDS } = await import('../src/scene/worldview.js');
    const item = dailyFxOf(parseDailyFxBody('note', ['记得带伞']));
    assert.ok(item, 'note item parses');
    const run = (extra) => {
        const root = makeStage();
        const timers = makeTimers();
        renderDailyFx(root, {
            messageId: 9,
            readerSettings: { dailyFx: { enabled: true, petals: false, note: true }, ...extra },
            content: { currentIndex: 0, fx: { daily: [item] } },
        }, { schedule: timers.schedule, clear: timers.clear, reducedMotion: false, playSfx: () => {} });
        const node = root.querySelector('#igs-fx-front').children[0];
        const classes = node ? String(node.className).split(/\s+/) : [];
        cancelDailyFx(root);
        return classes;
    };
    for (const id of WORLD_SKIN_IDS) {
        const classes = run({ _worldview: id });
        assert.ok(classes.includes('igs-dfx-note'), id);
        assert.ok(classes.includes(`is-${id}`), id);
        assert.equal(classes.includes('is-ancient'), false, id);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`.igs-dfx-note.is-${id} `), id);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`.igs-dfx-letter.is-${id} `), id);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`.igs-dfx-timeskip.is-${id} `), id);
    }
    for (const extra of [{}, { _worldview: 'modern' }, { _ancientEra: true, _worldview: 'ancient' }]) {
        const classes = run(extra);
        assert.ok(classes.includes('igs-dfx-note'), JSON.stringify(extra));
        for (const id of WORLD_SKIN_IDS) assert.equal(classes.includes(`is-${id}`), false, `${JSON.stringify(extra)} ${id}`);
    }
});
