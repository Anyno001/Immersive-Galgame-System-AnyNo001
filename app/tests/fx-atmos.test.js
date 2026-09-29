import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { applyFxEra } from '../src/scene/fx-era.js';
import { normalizeFxTagsSettings } from '../src/visual/igs-ui/fx-settings.js';
import { fxGrammarLines } from '../src/visual/igs-ui/fx-prompt.js';
import { createFxMemory, planPageFx } from '../src/visual/igs-ui/fx-runtime.js';

const TEXT = ['[igs-fx:movie]', 'A', '[igs-fx:movie-end]', '[igs-fx:light|off]', 'B', '[igs-fx:light|on]', '[igs-fx:umbrella]', 'C'].join('\n');
const at = (needle) => TEXT.indexOf(needle);

test('gate:fx-atmos light modes; unknown mode dropped', () => {
    assert.deepEqual(parseFxBody('light|off'), { kind: 'light', end: false, args: ['off'] });
    assert.equal(parseFxBody('light|开').end, true);
    assert.equal(parseFxBody('light-end').end, true);
    assert.equal(parseFxBody('light|dim'), null);
    assert.equal(parseFxBody('light'), null);
});

test('gate:fx-atmos ranges open and close; unclosed lasts to floor end', () => {
    const d = extractFxDirectives(TEXT);
    const a = resolveFxAtPage(d, at('A'));
    assert.equal(a.movie, true);
    assert.equal(a.lightsOff, false);
    const b = resolveFxAtPage(d, at('B'));
    assert.equal(b.movie, false);
    assert.equal(b.lightsOff, true);
    assert.deepEqual(b.instants, [{ kind: 'light', mode: 'off' }]);
    const c = resolveFxAtPage(d, at('C'));
    assert.equal(c.lightsOff, false);
    assert.equal(c.umbrella, true);
});

test('gate:fx-atmos opt-in, prompt gating and era', () => {
    const legacy = normalizeFxTagsSettings({ enabled: true });
    for (const kind of ['movie', 'light', 'umbrella']) assert.equal(legacy[kind], false, kind);
    assert.doesNotMatch(fxGrammarLines({ enabled: true }).join('\n'), /movie|light\||umbrella/);
    const on = { enabled: true, movie: true, light: true, umbrella: true };
    assert.match(fxGrammarLines(on).join('\n'), /light\|off … light\|on：关灯/);
    assert.match(fxGrammarLines(on, { ancient: true }).join('\n'), /吹灯/);
    const ancient = applyFxEra({ fxTags: on }, true).fxTags;
    assert.equal(ancient.movie, false);
    assert.equal(ancient.light, true);
    assert.equal(ancient.umbrella, true);
});

function plan(fxTags, needle) {
    return planPageFx({ messageId: 9, readerSettings: { fxTags }, content: { currentIndex: 0, fx: resolveFxAtPage(extractFxDirectives(TEXT), at(needle)) } }, createFxMemory());
}

test('gate:fx-atmos plan exposes atmos without changing ranges; light plays once when enabled', () => {
    const on = plan({ enabled: true, movie: true, light: true, umbrella: true }, 'B');
    assert.deepEqual(on.atmos, { movie: false, lightsOff: true, umbrella: false });
    assert.deepEqual(Object.keys(on.ranges).sort(), ['call', 'dream', 'flashback', 'letterbox']);
    assert.ok(on.effects.some((e) => e.type === 'light'));
    const off = plan({ enabled: true, movie: true }, 'B');
    assert.equal(off.atmos.lightsOff, false);
    assert.equal(off.effects.some((e) => e.type === 'light'), false);
});
