import test from 'node:test';
import assert from 'node:assert/strict';
import { incenseSvg, lanternSvg, guqinSvg, teaSvg, traySvg } from '../src/visual/igs-ui/fx-selected-svg.js';
import { SELECTED_SVG_STYLE_TEXT } from '../src/visual/igs-ui/fx-selected-svg-style.js';
import { HAREM_BUILDERS } from '../src/visual/igs-ui/fx-harem.js';
import { MYTH_BUILDERS } from '../src/visual/igs-ui/fx-myth.js';
import { HAREM_STYLE_TEXT } from '../src/visual/igs-ui/fx-harem-style.js';
import { RITES_BUILDERS } from '../src/visual/igs-ui/fx-daily-rites.js';
import { cancelDailyFx, renderDailyFx } from '../src/visual/igs-ui/fx-daily.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const drawings = [incenseSvg, lanternSvg, guqinSvg, teaSvg, () => traySvg('silk'), () => traySvg('wine'), () => traySvg('dagger')];
const idsOf = (svg) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const envOf = () => {
    const root = makeStage({ waapi: true });
    root.querySelector('#igs-sprite').style.backgroundImage = 'url("actor.png")';
    return { root, doc: root.ownerDocument, hold: 1, reduced: false, ancient: true, worldview: 'ancient' };
};

function mounted(item, { reduced = false, hold = 'medium' } = {}) {
    const root = makeStage();
    const timers = makeTimers();
    const sounds = [];
    const snapshot = {
        messageId: 1,
        readerSettings: { _ancientEra: true, fxStyle: { hold }, dailyFx: { enabled: true, petals: false, timeskip: true, candle: true, guqin: true, tea: true, packHarem: true, hmtray: true } },
        content: { currentIndex: 0, fx: { daily: [item] } },
    };
    const ctx = { schedule: timers.schedule, clear: timers.clear, reducedMotion: reduced, playSfx: (sound) => sounds.push(sound) };
    const result = renderDailyFx(root, snapshot, ctx);
    const node = root.querySelector('.igs-dfx');
    return { root, timers, node, result, sounds, snapshot, ctx };
}

// Fake DOM stores nested SVG as a string. Validate all fragment references and
// lifecycle there, while real browser rendering is a separate visual check.
test('approved SVG instances isolate every gradient, mask, clip, use and accessible title', () => {
    const all = Array.from({ length: 3 }, () => drawings.map((draw) => draw())).flat();
    const everyId = all.flatMap(idsOf);
    assert.equal(new Set(everyId).size, everyId.length);
    for (const svg of all) {
        const ids = new Set(idsOf(svg));
        for (const match of svg.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"|aria-labelledby="([^"]+)"/g)) {
            for (const id of (match[1] || match[2] || match[3]).split(/\s+/)) assert.ok(ids.has(id), id);
        }
        assert.doesNotMatch(svg, /<(?:image|script|foreignObject)\b|(?:href|src)="(?:https?:|data:)/);
    }
});

test('approved guqin has seven strings and thirteen badges, tea has lid and low foot', () => {
    const qin = guqinSvg();
    assert.equal([...qin.matchAll(/class="q32-clean-string q32-clean-s\d"/g)].length, 7);
    assert.equal([...qin.matchAll(/<circle /g)].length, 13);
    for (const [string, delay] of [[4, 350], [2, 670], [5, 970], [1, 1350]]) {
    }
    assert.match(teaSvg(), /class="t34-clean-lid"/);
    assert.match(teaSvg(), /M65 124V133Q80 139 95 133V124/);
    assert.match(SELECTED_SVG_STYLE_TEXT, /width:81\.5686274507%/);
});

test('54/55/56 use v2 tray artwork while retaining label, sound, fade and original 4200 ms life', () => {
    for (const [mode, label] of [['silk', '白绫三尺'], ['wine', '鸩酒一杯'], ['dagger', '匕首一柄']]) {
        const built = HAREM_BUILDERS.hmtray({ mode, who: '<周氏>' }, envOf());
        assert.equal(built.life, 4200);
        assert.equal(built.layer, 'front');
        assert.deepEqual(built.sounds, ['hm-tray']);
        assert.ok(built.node.innerHTML.includes(label));
        assert.match(built.node.innerHTML, /赐 &lt;周氏&gt;/);
        assert.match(built.node.innerHTML, /hm-trayfull-plate/);
    }
    const wine = traySvg('wine');
    assert.match(wine, /M5 66H115V74H5Z/);
    assert.equal([...wine.matchAll(/<ellipse /g)].length, 1, 'one low cup mouth, no spare cup');
    assert.match(wine, /M70 19C72 25 71 33 67 41/);
    assert.match(traySvg('silk'), /viewBox="0 0 120 124"/);
    assert.match(HAREM_STYLE_TEXT, /animation:hm-rise \.6s ease-out \.7s both/);
    assert.match(HAREM_STYLE_TEXT, /animation:hm-rise \.6s ease-out 1s both/);
});

test('guqin and tea keep original actor actions, dynamic anchors, sounds and lifecycle', () => {
    for (const [kind, life, sound, artClass] of [['guqin', 4200, 'guqin', 'q32-clean-art'], ['tea', 3400, 'tea-pour', 't34-clean-art']]) {
        const env = envOf();
        const built = RITES_BUILDERS[kind]({}, env);
        assert.equal(built.life, life);
        assert.equal(built.layer, 'stage');
        assert.deepEqual(built.sounds, [sound]);
        const container = built.node.querySelector(kind === 'guqin' ? '.igs-dfx-guqin-qin' : '.igs-dfx-tea-set');
        assert.ok(container.innerHTML.includes(artClass));
        assert.match(container.getAttribute('style'), /left:[\d.-]+%;top:[\d.-]+%/);
        assert.equal(env.root.querySelector('#igs-sprite').animations[0].options.duration, life);
    }
});

test('selected effects use the existing mount/remove and cancellation timers', () => {
    for (const [item, life] of [[{ type: 'timeskip', text: '一炷香后' }, 2900], [{ type: 'candle', style: 'lamp' }, 3000], [{ type: 'guqin' }, 4200], [{ type: 'tea' }, 3400], [{ type: 'hmtray', mode: 'silk' }, 4200]]) {
        const run = mounted(item);
        assert.ok(run.result.played.includes(item.type), item.type);
        assert.ok(run.node, item.type);
        assert.equal(run.node.style.vars['--igs-dfx-life'], `${life}ms`);
        run.timers.advance(life - 1);
        assert.ok(run.node.parentNode, `${item.type} still mounted`);
        run.timers.advance(1);
        assert.equal(run.node.parentNode, null, `${item.type} removed on schedule`);
        cancelDailyFx(run.root);
        assert.equal(run.timers.size(), 0);
        const interrupted = mounted(item);
        cancelDailyFx(interrupted.root);
        assert.equal(interrupted.node.parentNode, null);
        assert.equal(interrupted.timers.size(), 0);
    }
});

test('21 incense, ordinary candle and 64 三昧真火 remain the original CSS artwork', () => {
    for (const style of ['incense', 'candle']) {
        const run = mounted({ type: 'candle', style });
        assert.doesNotMatch(run.node.innerHTML, /new-lantern|<svg/);
        assert.match(run.node.innerHTML, style === 'incense' ? /igs-dfx-candle-stick/ : /igs-dfx-candle-flame/);
        assert.deepEqual(run.sounds, ['candle']);
        cancelDailyFx(run.root);
    }
    const myth = MYTH_BUILDERS.flame({ who: '沈清辞' }, envOf());
    assert.equal([...myth.node.innerHTML.matchAll(/class="igs-myth-tongue"/g)].length, 5);
    assert.equal([...myth.node.innerHTML.matchAll(/class="igs-myth-ember"/g)].length, 6);
    assert.deepEqual(myth.sounds, ['myth-flame']);
    assert.doesNotMatch(myth.node.innerHTML, /new-lantern|<svg/);
    const reduced = mounted({ type: 'candle', style: 'lamp' }, { reduced: true });
    assert.doesNotMatch(reduced.node.innerHTML, /<animate/);
    cancelDailyFx(reduced.root);
});


test('hold settings scale SVG burn/lighting with the same existing runtime clocks', () => {
    for (const [type, normal, short] of [['timeskip', 2900, 2900], ['candle', 3000, 1950], ['guqin', 4200, 4200], ['tea', 3400, 3400], ['hmtray', 4200, 2730]]) {
        for (const [hold, life] of [['short', short], ['long', normal * 1.6]]) {
            const run = mounted({ type, style: 'lamp', mode: 'wine', text: '一炷香后' }, { hold });
            assert.equal(run.node.style.vars['--igs-dfx-life'], `${life}ms`, `${type}/${hold}`);
            if (type === 'timeskip' || type === 'candle') assert.ok(run.node.innerHTML.includes(`dur="${life}ms"`));
            cancelDailyFx(run.root);
            assert.equal(run.timers.size(), 0);
        }
    }
});

test('new pages replace unfinished SVG instances without leaking old timers or fragment IDs', () => {
    for (const item of [{ type: 'timeskip', text: '一炷香后' }, { type: 'candle', style: 'lamp' }, { type: 'hmtray', mode: 'silk' }]) {
        const run = mounted(item);
        const oldIds = idsOf(run.node.innerHTML);
        run.timers.advance(500);
        run.snapshot.messageId = 2;
        assert.ok(renderDailyFx(run.root, run.snapshot, run.ctx).played.includes(item.type));
        const next = run.root.querySelector('.igs-dfx');
        assert.notEqual(next, run.node);
        assert.equal(run.node.parentNode, null);
        assert.equal(run.root.querySelectorAll('.igs-dfx').length, 1);
        for (const id of idsOf(next.innerHTML)) assert.ok(!oldIds.includes(id), id);
        cancelDailyFx(run.root);
        assert.equal(run.timers.size(), 0);
    }
});
