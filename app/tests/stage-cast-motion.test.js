import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteDrawRect } from '../src/visual/igs-ui/fx-anchor.js';
import { castSideOf, planCastLayouts, plantFeet, playSpeakerCastMotion, posXForCenter, resolveCastHandoff } from '../src/visual/igs-ui/stage-cast-motion.js';
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

test('gate: feet alignment plants the legs and leaves each sprite height alone', () => {
    const stageH = 600;
    const wide = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.05, w: 0.05 }, feet: 0.8 };
    const narrow = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.3, w: 0.2 }, feet: 0.8 };
    const heads = { 'a.png': wide, 'b.png': narrow, 'c.png': wide };
    const footOf = (sprite, feet) => {
        const rect = spriteDrawRect(1000, stageH, { ...sprite, naturalW: 1000, naturalH: 2000 });
        return rect.top + rect.h * feet;
    };
    const input = {
        stageW: 1000, stageH, align: true,
        speaker: { character: '乙', url: 'b.png', order: 1, posX: 82, posY: 40, scale: 80 },
        members: [{ character: '甲', url: 'a.png', order: 0, posX: 18, posY: 40, scale: 70 }],
        peek: (url) => heads[url] || null,
    };
    const plan = planCastLayouts(input);
    assert.equal(plan.speaker.scale, 80, '头宽不同也不改说话人高度');
    assert.equal(plan.members[0].scale, 70, '头宽不同也不改陪衬高度');
    assert.equal(plan.speaker.heightScale, 80);
    assert.ok(Math.abs(footOf(plan.speaker, 0.8) - stageH) < 0.5, '说话人的脚贴底');
    assert.ok(Math.abs(footOf(plan.members[0], 0.8) - stageH) < 0.5, '陪衬的脚贴底');
    assert.notEqual(plan.speaker.posY, 40);
    // 第三个人上下台，原来两个人的高度和贴底位置不变。
    const three = planCastLayouts({
        ...input,
        members: [...input.members, { character: '丙', url: 'c.png', order: 2, posX: 50, posY: 10, scale: 90 }],
    });
    assert.equal(three.speaker.scale, 80);
    assert.equal(three.members[0].scale, 70);
    assert.equal(three.members[1].scale, 90);
    assert.equal(three.speaker.posY, plan.speaker.posY);
    assert.equal(three.members[0].posY, plan.members[0].posY);
    const waiting = planCastLayouts({ ...input, peek: () => null });
    assert.deepEqual(waiting.pending, ['b.png', 'a.png']);
    assert.equal(waiting.speaker.scale, 80);
    assert.equal(waiting.speaker.posY, 40, '脚还没探测到时不先挪');
    const off = planCastLayouts({ ...input, align: false });
    assert.equal(off.speaker.scale, 80);
    assert.equal(off.speaker.posY, 40);
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

// 「还原自动」预览的 auto 必须等于删掉槽位后画面上的样子：高度不变，脚贴底。
test('gate: cast reset-auto keeps the sprite height and plants the feet', () => {
    const probed = { naturalW: 1000, naturalH: 2000, head: { x: 0.5, top: 0.1, w: 0.16 }, feet: 1 };
    const plan = planCastLayouts({
        stageW: 1000, stageH: 600, align: true,
        speaker: { url: 's.png', order: 2, posX: 94, posY: 90, scale: 40, locked: true, auto: { posX: 94, posY: 100, scale: 50 } },
        members: [
            { character: '甲', url: 'a.png', order: 0, posX: 6, posY: 100, scale: 50, auto: { posX: 6, posY: 100, scale: 50 } },
            { character: '乙', url: 'b.png', order: 1, posX: 50, posY: 40, scale: 70, auto: { posX: 50, posY: 40, scale: 70 } },
        ],
        peek: () => probed,
    });
    assert.equal(plan.speaker.scale, 40, '手摆过的人保持当前高度');
    assert.equal(plan.speaker.posY, 90, '手摆过的位置不被贴底改掉');
    assert.equal(plan.speaker.auto.scale, 50, '还原后仍是这个人自己的高度');
    assert.equal(plan.speaker.auto.posX, 94);
    assert.equal(plan.members[0].scale, 50);
    assert.equal(plan.members[1].scale, 70);
    assert.deepEqual(plan.members[0].auto, { posX: 6, posY: 100, scale: 50 }, '脚已经在图底、posY 已是 100 时不再挪');
    assert.equal(plan.members[1].auto.scale, 70);
    assert.notEqual(plan.members[1].posY, 40, '没手摆过的人把脚贴到底');
});

test('gate: feet alignment pulls a floating sprite down to the floor without changing its height', () => {
    const stageH = 600;
    const planted = plantFeet(stageH, { posX: 50, posY: 50, scale: 60, feet: 0.9 });
    assert.equal(planted.scale, 60);
    const rect = spriteDrawRect(1000, stageH, { ...planted, naturalW: 1000, naturalH: 2000 });
    assert.ok(Math.abs(rect.top + rect.h * 0.9 - stageH) < 0.5);
});

test('gate: cast slots center by real sprite width so stage-wide phone sprites do not stack', () => {
    // 竖屏手机：390×700，立绘 1:2、高 100% → 宽 350，几乎和舞台一样宽。旧写法 18/82 两人只差 26px。
    const W = 390;
    const H = 700;
    const probed = { naturalW: 500, naturalH: 1000, head: null, feet: 1 };
    const centerOf = (s) => { const r = spriteDrawRect(W, H, { ...probed, ...s }); return (r.left + r.w / 2) / W * 100; };
    assert.ok(Math.abs(centerOf({ posX: 18, posY: 100, scale: 100 }) - centerOf({ posX: 82, posY: 100, scale: 100 })) < 7);
    const plan = planCastLayouts({
        stageW: W, stageH: H, align: false,
        speaker: { character: 'A', url: 'a', order: 0, posX: 18, centerX: 27, posY: 100, scale: 100 },
        members: [{ character: 'B', url: 'b', order: 1, posX: 82, centerX: 73, posY: 100, scale: 100 }],
        peek: () => probed,
    });
    assert.equal(Math.round(centerOf(plan.speaker)), 27);
    assert.equal(Math.round(centerOf(plan.members[0])), 73);
    assert.deepEqual(plan.pending, []);
    // 桌面图宽约 28% 时与旧槽位基本一致；比舞台还宽时不再左右对调。
    assert.ok(Math.abs(posXForCenter(1280, 720, { scale: 100, naturalW: 358, naturalH: 720 }, 27) - 18) < 1);
    const wide = { scale: 100, naturalW: 800, naturalH: 1000 };
    assert.equal(Math.round(centerOf({ ...wide, posX: posXForCenter(390, 700, wide, 27), posY: 100 })), 27);
    // 没探测过图：照旧用原 posX，并交给调用方探测后重排；用户存过的槽位不动，只换算「还原自动」。
    const waiting = planCastLayouts({
        stageW: W, stageH: H, align: false,
        speaker: { character: 'A', url: 'a', order: 0, posX: 18, centerX: 27, posY: 100, scale: 100 },
        members: [{ character: 'B', url: 'b', order: 1, posX: 40, centerX: 73, posY: 100, scale: 100, locked: true, auto: { posX: 82, posY: 100, scale: 100 } }],
        peek: () => null,
    });
    assert.equal(waiting.speaker.posX, 18);
    assert.deepEqual(waiting.pending.sort(), ['a', 'b']);
    const saved = planCastLayouts({
        stageW: W, stageH: H, align: false,
        speaker: { character: 'A', url: 'a', order: 0, posX: 18, centerX: 27, posY: 100, scale: 100 },
        members: [{ character: 'B', url: 'b', order: 1, posX: 40, centerX: 73, posY: 100, scale: 100, locked: true, auto: { posX: 82, posY: 100, scale: 100 } }],
        peek: () => probed,
    });
    assert.equal(saved.members[0].posX, 40);
    assert.equal(Math.round(centerOf(saved.members[0].auto)), 73);
});

test('gate: feet plant at default 100% height and near it instead of floating', () => {
    const H = 700;
    const footOf = (s) => { const r = spriteDrawRect(1280, H, s); return (r.top + r.h * s.feet) / H; };
    for (const scale of [100, 99, 98, 95, 90, 120]) {
        const s = { posX: 50, posY: 100, scale, naturalW: 500, naturalH: 1000, feet: 0.9 };
        const planted = plantFeet(H, s);
        assert.ok(Math.abs(footOf({ ...s, ...planted }) - 1) < 1e-6, `scale ${scale}`);
        if (scale !== 100) assert.equal(planted.scale, scale);
    }
    // 腿本来就到图底：不缩。
    assert.equal(plantFeet(H, { posY: 100, scale: 100, feet: 1 }).scale, 100);
});
