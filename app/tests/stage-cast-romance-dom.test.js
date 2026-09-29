import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCastToDom, castRomanceAttr } from '../src/visual/igs-ui/stage-cast-render.js';
import { CAST_DIM_FRAME, CAST_FOCUS_FRAME, playSpeakerMove } from '../src/visual/igs-ui/stage-cast-motion.js';
import { computeRomanceApproach, resolveRomanceParams, resolveRomanceRivalTarget } from '../src/visual/igs-ui/romance-settings.js';
import { normalizeStageCastSettings } from '../src/visual/igs-ui/stage-direction-settings.js';

const amb = (target = '') => ({ romance: 'ambiguous', romanceAt: 0, romanceTarget: target });

test('gate: cast romance attr, rival target and setting default', () => {
    assert.equal(castRomanceAttr('pc', 'recede'), 'recede');
    assert.equal(castRomanceAttr('mobile', 'recede'), 'recede-lite');
    assert.equal(castRomanceAttr('embedded', 'recede'), 'recede-lite');
    assert.equal(castRomanceAttr('pc', 'rival'), 'rival');
    assert.equal(castRomanceAttr('pc', 'collapse'), '');
    assert.equal(castRomanceAttr('pc', 'none'), '');
    const keyOf = (n) => (n === '小乙' ? '乙' : n);
    assert.equal(resolveRomanceRivalTarget(amb('小乙'), '甲', keyOf), '乙');
    assert.equal(resolveRomanceRivalTarget(amb('小乙'), '乙', keyOf), '');
    assert.equal(resolveRomanceRivalTarget(amb(''), '甲', keyOf), '');
    assert.equal(resolveRomanceRivalTarget({ romance: '', romanceAt: -1, romanceTarget: '乙' }, '甲'), '');
    assert.equal(normalizeStageCastSettings({}).romanceDuo, false);
    assert.equal(normalizeStageCastSettings({ romanceDuo: true }).romanceDuo, true);
});

test('gate: romance approach drops pull when multi', () => {
    const params = resolveRomanceParams(1, 'medium');
    const sprite = { posX: 18, posY: 100, scale: 80 };
    assert.ok(computeRomanceApproach({ stageW: 0, stageH: 0, sprite, head: null, params }).dx !== 0);
    const flat = computeRomanceApproach({ stageW: 0, stageH: 0, sprite, head: null, params: { ...params, pull: 0 } });
    assert.equal(flat.dx, 0);
    assert.equal(flat.zoom, params.zoom);
});

function fakeRoot() {
    const make = () => {
        const attrs = new Map();
        const el = {
            children: [], parentNode: null, className: '', style: { setProperty(k, v) { this[k] = v; } },
            setAttribute(k, v) { attrs.set(k, String(v)); },
            getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
            hasAttribute(k) { return attrs.has(k); },
            removeAttribute(k) { attrs.delete(k); },
            appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
            removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c; },
        };
        return el;
    };
    const layer = make();
    layer.ownerDocument = { createElement: make };
    return { root: { querySelector: (s) => (s === '#igs-cast' ? layer : null) }, layer };
}

test('gate: cast dom focuses romance target', () => {
    const { root, layer } = fakeRoot();
    const members = [
        { character: '甲', url: 'a.png', posX: 6, posY: 100, scale: 100 },
        { character: '乙', url: 'b.png', posX: 50, posY: 100, scale: 100 },
    ];
    applyCastToDom(root, members, { focus: '乙' });
    const [a, b] = layer.children;
    assert.equal(b.getAttribute('data-igs-cast-focus'), '1');
    assert.equal(b.style.filter, CAST_FOCUS_FRAME);
    assert.equal(a.hasAttribute('data-igs-cast-focus'), false);
    assert.equal(a.style.filter, CAST_DIM_FRAME);
    applyCastToDom(root, members, {});
    assert.equal(b.hasAttribute('data-igs-cast-focus'), false);
    assert.equal(b.style.filter, CAST_DIM_FRAME);
});

test('gate: speaker move animates only on x change', () => {
    const calls = [];
    const el = { animate: (frames, opts) => { calls.push({ frames, opts }); return {}; } };
    assert.equal(playSpeakerMove(el, 50, 50, 100), false);
    assert.equal(playSpeakerMove(el, null, 50, 100), false);
    assert.equal(playSpeakerMove(el, 94, 50, 100), true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].frames, [{ backgroundPosition: '94% 100%' }, { backgroundPosition: '50% 100%' }]);
    assert.equal(calls[0].opts.fill, 'backwards');
});
