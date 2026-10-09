import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteDrawRect } from '../src/visual/igs-ui/fx-anchor.js';
import { alignToReference, castSideOf, createCastAlignLock, planCastLayouts, playSpeakerCastMotion, resolveCastHandoff } from '../src/visual/igs-ui/stage-cast-motion.js';
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

test('gate: foot alignment matches head width and plants the legs on the stage bottom', () => {
    const stage = { stageW: 1000, stageH: 600 };
    const reference = { posX: 50, posY: 100, scale: 50, naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.2 }, feet: 1 };
    const member = { posX: 50, posY: 100, scale: 50, naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.18 }, feet: 0.8 };
    const out = alignToReference({ ...stage, reference, member });
    const rect = spriteDrawRect(stage.stageW, stage.stageH, { ...member, ...out });
    assert.ok(Math.abs(rect.w * member.head.w - 30) < 0.01);
    assert.ok(Math.abs(rect.top + rect.h * member.feet - stage.stageH) < 0.01);
    assert.ok(rect.top + rect.h > stage.stageH, '图的底边沉到舞台下面，腿留在底边上');
    const refRect = spriteDrawRect(stage.stageW, stage.stageH, reference);
    const refHead = refRect.top + refRect.h * reference.head.top;
    const ownHead = rect.top + rect.h * member.head.top;
    assert.ok(ownHead !== refHead);
    const tiny = alignToReference({ ...stage, reference, member: { ...member, feet: 1, head: { x: 0.5, top: 0.05, w: 0.05 } } });
    assert.equal(tiny.scale, 62.5);
    assert.equal(tiny.posY, 100);
    assert.deepEqual(alignToReference({ ...stage, reference, member: { ...member, head: null, feet: 1 } }), { scale: 50, posY: 100 });
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

test('gate: promotion brighten keeps the scene grade filter', () => {
    const { make } = fakeCastRoot();
    const sprite = make('div');
    sprite.ownerDocument = { defaultView: { getComputedStyle: () => ({ filter: 'url("#igs-grade-tint-1") brightness(0.8)' }) } };
    const prev = { speaker: 'A', speakerX: 50, members: ['B'], memberX: { B: 50 } };
    assert.deepEqual(playSpeakerCastMotion(sprite, prev, { key: 'B', posX: 50, posY: 100 }, { promoted: 'B' }), ['promote']);
    assert.ok(sprite.animations[0].frames.every(({ filter }) => filter.startsWith('url("#igs-grade-tint-1") brightness(0.8) ')));
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

// 「还原自动」预览的 auto 必须等于删掉槽位、保存后画面上的样子，否则保存后立绘会跳回对齐结果。
test('gate: cast reset-auto previews the aligned layout, locked entries included', () => {
    const base = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.2 } };
    const small = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.1, w: 0.16 } };
    const heads = { 's.png': small, 'a.png': base, 'b.png': small };
    const plan = planCastLayouts({
        stageW: 1000, stageH: 600, align: true,
        speaker: { url: 's.png', order: 2, posX: 94, posY: 90, scale: 40, head: null, locked: true, auto: { posX: 94, posY: 100, scale: 50 } },
        members: [
            { character: '甲', url: 'a.png', order: 0, posX: 6, posY: 100, scale: 50, head: null, auto: { posX: 6, posY: 100, scale: 50 } },
            { character: '乙', url: 'b.png', order: 1, posX: 50, posY: 100, scale: 50, head: null, auto: { posX: 50, posY: 100, scale: 50 } },
        ],
        peek: (url) => heads[url],
    });
    assert.equal(plan.speaker.scale, 40, '手调过的人仍按槽位画');
    assert.equal(plan.speaker.auto.scale, 62.5, '它的「还原自动」拿到对齐后的大小');
    assert.equal(plan.speaker.auto.posX, 94);
    assert.equal(plan.members[1].scale, 62.5);
    assert.deepEqual(plan.members[1].auto, { posX: 50, posY: plan.members[1].posY, scale: 62.5 });
    assert.deepEqual(plan.members[0].auto, { posX: 6, posY: 100, scale: 50 }, '参照物不改大小，脚已在底边时 posY 仍是 100');
});

test('gate: head alignment keeps configured sprite heights apart', () => {
    const stage = { stageW: 1000, stageH: 600 };
    const head = { x: 0.5, top: 0.05, w: 0.2 };
    const reference = { posX: 50, posY: 100, scale: 50, naturalW: 1000, naturalH: 2000, head, baseHeight: 100 };
    const member = { posX: 50, posY: 100, scale: 70, naturalW: 1000, naturalH: 2000, head, baseHeight: 140 };
    const out = alignToReference({ ...stage, reference, member });
    assert.ok(Math.abs(out.scale - 70) < 1e-9, '构图相同、设定高 1.4 倍的人不被缩回去');
    const lift = (sprite) => {
        const rect = spriteDrawRect(stage.stageW, stage.stageH, sprite);
        return stage.stageH - (rect.top + rect.h * head.top);
    };
    assert.ok(Math.abs(lift({ ...member, ...out }) - lift(reference) * 1.4) < 0.01, '头顶离底边也按 1.4 倍');
    const framed = alignToReference({ ...stage, reference, member: { ...member, head: { ...head, w: 0.16 } } });
    assert.ok(Math.abs(framed.scale - 87.5) < 1e-9, '构图差别照常抹平');
    const same = alignToReference({ ...stage, reference: { ...reference, baseHeight: undefined }, member: { ...member, scale: 50, baseHeight: undefined, head: { ...head, w: 0.16 } } });
    assert.equal(same.scale, 62.5, '没有设定高度时与原来一致');
});

// 参照一旦定下，只要还在台上就不换：开口更早的人回台、参照换表情都不会让台上原有的人跳。
test('gate: cast alignment keeps its reference while that person stays on stage', () => {
    const base = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.2 } };
    const small = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.1, w: 0.16 } };
    const heads = { 'a.png': small, 'b.png': base, 'c.png': small };
    const peek = (url) => heads[url] || null;
    const lock = createCastAlignLock();
    const stage = { stageW: 1000, stageH: 600, align: true, peek, lock };
    const m = (character, url, order) => ({ character, url, order, posX: 50, posY: 100, scale: 50, head: null });
    const first = planCastLayouts({ ...stage, speaker: { ...m('乙', 'b.png', 1) }, members: [m('丙', 'c.png', 2)] });
    const bing = first.members[0];
    assert.equal(lock.ref, '乙');
    assert.equal(bing.scale, 62.5);
    // 甲本场景开口更早，回台后也不抢参照。
    const back = planCastLayouts({ ...stage, speaker: { ...m('乙', 'b.png', 1) }, members: [m('甲', 'a.png', 0), m('丙', 'c.png', 2)] });
    assert.equal(lock.ref, '乙');
    assert.deepEqual([back.members[1].scale, back.members[1].posY], [bing.scale, bing.posY]);
    assert.equal(back.speaker.scale, 50, '参照物自己不对齐');
    // 参照换了表情、新图还没探测好：其余人沿用上次结果，不先跳回原样。
    const swap = planCastLayouts({ ...stage, speaker: { ...m('乙', 'b2.png', 1) }, members: [m('丙', 'c.png', 2)] });
    assert.deepEqual(swap.pending, ['b2.png']);
    assert.deepEqual([swap.members[0].scale, swap.members[0].posY], [bing.scale, bing.posY]);
    // 参照下台才换人，换成在场者里最早开口的那个。
    planCastLayouts({ ...stage, speaker: { ...m('丙', 'c.png', 2) }, members: [m('甲', 'a.png', 0)] });
    assert.equal(lock.ref, '甲');
    planCastLayouts({ ...stage, align: false, speaker: { ...m('丙', 'c.png', 2) }, members: [m('甲', 'a.png', 0)] });
    assert.equal(lock.ref, null, '关掉对齐就放开参照');
});

// 底边钉死：头顶偏下的人放大后不会被抬离舞台底；原本就悬空的最多悬到原来的高度。
test('gate: head alignment never lifts a sprite off the stage floor', () => {
    const stage = { stageW: 1000, stageH: 600 };
    const reference = { naturalW: 1000, naturalH: 2000, posX: 50, posY: 100, scale: 80, head: { x: 0.5, top: 0.02, w: 0.2 } };
    const member = { naturalW: 1000, naturalH: 2000, posX: 50, posY: 100, scale: 80, head: { x: 0.5, top: 0.3, w: 0.2 } };
    const bottomOf = (sprite) => {
        const h = stage.stageH * sprite.scale / 100;
        return (stage.stageH - h) * sprite.posY / 100 + h;
    };
    const out = alignToReference({ ...stage, reference, member });
    assert.ok(bottomOf(out) >= stage.stageH - 0.5, `脚贴底：${bottomOf(out)}`);
    const floating = { ...member, scale: 60, posY: 50 };
    const lifted = alignToReference({ ...stage, reference, member: floating });
    assert.ok(bottomOf(lifted) >= bottomOf(floating) - 0.5, '悬空的不会悬得更高');
});
