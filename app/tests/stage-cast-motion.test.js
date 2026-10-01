import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteDrawRect } from '../src/visual/igs-ui/fx-anchor.js';
import { alignToReference, castSideOf, planCastLayouts, playSpeakerCastMotion, resolveCastHandoff } from '../src/visual/igs-ui/stage-cast-motion.js';
import { applyCastToDom } from '../src/visual/igs-ui/stage-cast-render.js';

function fakeCastRoot() {
    const make = (tag) => {
        const attrs = new Map();
        const el = {
            tagName: tag, children: [], parentNode: null, className: '', ownerDocument: null, animations: [],
            style: { setProperty(k, v) { this[k] = v; } },
            setAttribute(k, v) { attrs.set(k, String(v)); },
            getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
            hasAttribute(k) { return attrs.has(k); },
            removeAttribute(k) { attrs.delete(k); },
            appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
            removeChild(child) { el.children = el.children.filter((c) => c !== child); child.parentNode = null; return child; },
            animate(frames, options) { const anim = { frames, options, onfinish: null, cancel() {} }; el.animations.push(anim); return anim; },
        };
        return el;
    };
    const doc = { createElement: make };
    const layer = make('div');
    layer.ownerDocument = doc;
    const root = { querySelector: (sel) => (sel === '#igs-cast' ? layer : null) };
    return { root, layer, make };
}

test('gate: cast handoff finds promoted and demoted speakers', () => {
    const prev = { speaker: 'A', members: ['B'] };
    assert.deepEqual(resolveCastHandoff(prev, { speaker: 'B', members: ['A'] }), { promoted: 'B', demoted: 'A' });
    assert.deepEqual(resolveCastHandoff(prev, { speaker: 'C', members: ['A', 'B'] }), { promoted: '', demoted: 'A' });
    assert.deepEqual(resolveCastHandoff(prev, { speaker: 'A', members: ['B'] }), { promoted: '', demoted: '' });
    assert.deepEqual(resolveCastHandoff(null, { speaker: 'A', members: ['B'] }), { promoted: '', demoted: '' });
});

test('gate: cast side follows slot position', () => {
    assert.equal(castSideOf(6), -1);
    assert.equal(castSideOf(50), 0);
    assert.equal(castSideOf(94), 1);
});

test('gate: head alignment matches head width and head top within limits', () => {
    const stage = { stageW: 1000, stageH: 600 };
    const reference = { posX: 50, posY: 100, scale: 50, naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.2 } };
    const member = { posX: 50, posY: 100, scale: 50, naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.18 } };
    const out = alignToReference({ ...stage, reference, member });
    const rect = spriteDrawRect(stage.stageW, stage.stageH, { ...member, ...out });
    assert.ok(Math.abs(rect.w * member.head.w - 30) < 0.01);
    assert.ok(Math.abs(rect.top + rect.h * member.head.top - 315) < 0.01);
    const tiny = alignToReference({ ...stage, reference, member: { ...member, head: { x: 0.5, top: 0.05, w: 0.05 } } });
    assert.equal(tiny.scale, 62.5);
    assert.deepEqual(alignToReference({ ...stage, reference, member: { ...member, head: null } }), { scale: 50, posY: 100 });
});

test('gate: cast alignment uses the earliest speaker in scene as reference and waits for probes', () => {
    const base = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.2 } };
    const small = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.1, w: 0.16 } };
    const heads = { 's.png': small, 'a.png': base, 'b.png': base };
    const input = {
        stageW: 1000, stageH: 600, align: true,
        speaker: { url: 's.png', order: 2, posX: 94, posY: 100, scale: 50, head: null },
        members: [
            { character: '甲', url: 'a.png', order: 0, posX: 6, posY: 100, scale: 50, head: null },
            { character: '乙', url: 'b.png', order: 1, posX: 50, posY: 100, scale: 50, head: null },
        ],
    };
    const plan = planCastLayouts({ ...input, peek: (url) => heads[url] || null });
    assert.deepEqual(plan.pending, []);
    assert.equal(plan.members[0].character, '甲');
    assert.equal(plan.members[0].scale, 50);
    assert.equal(plan.members[1].scale, 50);
    assert.equal(plan.speaker.scale, 62.5);
    assert.equal(plan.speaker.posX, 94);
    const waiting = planCastLayouts({ ...input, peek: () => null });
    assert.deepEqual(waiting.pending, ['s.png', 'a.png', 'b.png']);
    assert.equal(waiting.speaker.scale, 50);
    const off = planCastLayouts({ ...input, align: false, peek: (url) => heads[url] });
    assert.equal(off.speaker.scale, 50);
    assert.deepEqual(off.pending, []);
});

test('gate: cast dom slides members in, moves stayers and hands off speakers', () => {
    const { root, layer } = fakeCastRoot();
    const m = (character, posX) => ({ character, url: `${character}.png`, posX, posY: 100, scale: 60 });
    applyCastToDom(root, [m('A', 18)]);
    const a = layer.children[0];
    assert.equal(a.animations.at(-1).frames[0].transform, 'translateX(-4%)');
    applyCastToDom(root, [m('A', 6), m('B', 50)], { handoff: { promoted: '', demoted: 'B' } });
    assert.equal(a.animations.at(-1).frames[0].backgroundPosition, '18% 100%');
    const b = layer.children.find((el) => el.getAttribute('data-igs-cast-char') === 'B');
    assert.equal(b.animations.at(-1).frames[0].filter, 'brightness(1) saturate(1)');
    applyCastToDom(root, [m('B', 50)], { handoff: { promoted: 'A', demoted: '' } });
    assert.equal(layer.children.includes(a), false);
    const before = b.animations.length;
    applyCastToDom(root, [m('B', 50)]);
    assert.equal(b.animations.length, before);
    applyCastToDom(root, [], { reduced: true });
    assert.equal(b.getAttribute('data-igs-cast-leaving'), '1');
    assert.deepEqual(Object.keys(b.animations.at(-1).frames[0]), ['opacity']);
    assert.equal(layer.style.display, '');
});

test('gate: speaker motion enters, moves and brightens on promotion', () => {
    const { make } = fakeCastRoot();
    const sprite = make('div');
    const prev = { speaker: 'A', speakerX: 18, members: ['B'], memberX: { B: 82 } };
    assert.deepEqual(playSpeakerCastMotion(sprite, prev, { key: 'B', posX: 50, posY: 100 }, { promoted: 'B' }), ['move', 'promote']);
    assert.equal(sprite.animations[0].frames[0].backgroundPosition, '82% 100%');
    assert.deepEqual(playSpeakerCastMotion(sprite, prev, { key: 'C', posX: 94, posY: 100 }, {}), ['enter']);
    assert.deepEqual(playSpeakerCastMotion(sprite, prev, { key: 'C', posX: 94, posY: 100 }, {}, { skipEnter: true }), []);
    assert.deepEqual(playSpeakerCastMotion(sprite, prev, { key: 'A', posX: 18, posY: 100 }, {}), []);
});

test('gate: locked cast entries keep their saved slot layout', () => {
    const base = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.2 } };
    const small = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.1, w: 0.16 } };
    const plan = planCastLayouts({
        stageW: 1000, stageH: 600, align: true,
        speaker: { url: 's.png', order: 2, posX: 94, posY: 90, scale: 40, head: null, locked: true, slotKey: 'pc::2::1::乙' },
        members: [{ character: '甲', url: 'a.png', order: 0, posX: 6, posY: 100, scale: 50, head: null }],
        peek: (url) => (url === 's.png' ? small : base),
    });
    assert.equal(plan.speaker.scale, 40);
    assert.equal(plan.speaker.posY, 90);
    assert.equal(plan.speaker.slotKey, 'pc::2::1::乙');
});
