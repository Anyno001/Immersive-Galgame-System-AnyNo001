import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, FX_STAGE_PAGE_MAX, FX_TAG_KINDS, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { resolveStageCast } from '../src/scene/stage-cast.js';
import {
    CAST_ENTRANCE_SLOW_MS, CAST_POSE_SHIFT, applyCastPoses, applyCastToDom, applySpeakerFlip,
    castFlipOriginX, castStageEntrances, resolveCastPosePlan,
} from '../src/visual/igs-ui/stage-cast-render.js';
import { spriteGeometry } from '../src/visual/igs-ui/fx-runtime.js';
import { normalizeStageCastSettings } from '../src/visual/igs-ui/stage-direction-settings.js';
import { resolveStageCastFxPromptRule, stageCastGrammarLines } from '../src/visual/igs-ui/fx-prompt.js';

function pageFx(text, from, to) {
    const dirs = extractFxDirectives(text);
    return resolveFxAtPage(dirs, to == null ? text.length : text.indexOf(to), from == null ? -1 : text.indexOf(from));
}

test('gate: stage pose tag accumulates and resets', () => {
    const text = '[igs-fx:stage|靠近|Alice|Bob]\n[igs-fx:stage|背对|Bob]\n[igs-fx:stage|离开|Cara]\n第一页\n[igs-fx:stage|探头|Dan]\n[igs-fx:stage|上前|Alice]\n第二页';
    const p1 = pageFx(text, null, '第一页');
    assert.deepEqual(p1.poses, { Bob: { flip: true, front: false } });
    assert.deepEqual(p1.links, [{ a: 'Alice', b: 'Bob', kind: 'near' }]);
    assert.ok(Object.hasOwn(p1.goneAt, 'Cara'));
    assert.deepEqual(p1.entrances, {});
    // 第二页：姿态累积，入场只收本页。
    const p2 = pageFx(text, '第一页');
    assert.deepEqual(p2.poses, { Bob: { flip: true, front: false }, Alice: { flip: false, front: true } });
    assert.deepEqual(p2.entrances, { Dan: 'peek' });
    // 再背对一次转回来。
    assert.deepEqual(pageFx('[igs-fx:stage|背对|Bob]\n[igs-fx:stage|背对|Bob]\n台词').poses, { Bob: { flip: false, front: false } });
    // 复位清空；楼层开头为空。
    const reset = pageFx('[igs-fx:stage|背对|Bob]\n[igs-fx:stage|离开|Cara]\n[igs-fx:stage|复位]\n台词');
    assert.deepEqual([reset.poses, reset.links, reset.goneAt], [{}, [], {}]);
    const empty = pageFx('普通正文');
    assert.deepEqual([empty.poses, empty.links, empty.goneAt, empty.entrances], [{}, [], {}, {}]);
    // 缺栏、动作写错、靠近只写一个人或两人相同：整条丢弃；stage 不进入通用演出标签。
    const bad = pageFx('[igs-fx:stage|靠近|Alice]\n[igs-fx:stage|靠近|Alice|Alice]\n[igs-fx:stage|乱写|Alice]\n[igs-fx:stage|背对]\n台词');
    assert.deepEqual([bad.poses, bad.links], [{}, []]);
    assert.ok(!FX_TAG_KINDS.includes('stage'));
    assert.deepEqual(bad.instants, []);
    // 同一对只留最后一次。
    assert.deepEqual(pageFx('[igs-fx:stage|靠近|Alice|Bob]\n[igs-fx:stage|拉开|Bob|Alice]\n台词').links, [{ a: 'Bob', b: 'Alice', kind: 'apart' }]);
    // 入场同页上限。
    const many = Array.from({ length: FX_STAGE_PAGE_MAX + 2 }, (_, i) => `[igs-fx:stage|跑进来|角色${i}]`).join('\n');
    assert.equal(Object.keys(pageFx(`${many}\n台词`).entrances).length, FX_STAGE_PAGE_MAX);
});

test('gate: gone member returns after speaking', () => {
    const directives = [
        { type: 'char', character: 'Alice', offset: 0 },
        { type: 'char', character: 'Bob', offset: 10 },
        { type: 'char', character: 'Cara', offset: 20 },
        { type: 'char', character: 'Bob', offset: 40 },
    ];
    const names = (goneAt) => resolveStageCast({ directives, offset: 50, goneAt }).map((m) => m.character);
    assert.deepEqual(names(null), ['Bob', 'Cara', 'Alice']);
    assert.deepEqual(names({ Cara: 30 }), ['Bob', 'Alice']);
    // Bob 离开后在 40 又开口：回到台上。
    assert.deepEqual(names({ Bob: 30 }), ['Bob', 'Cara', 'Alice']);
    // 别名经 keyOf 归一。
    const keyOf = (name) => (name === '小卡' ? 'Cara' : name);
    assert.deepEqual(resolveStageCast({ directives, offset: 50, keyOf, goneAt: { 小卡: 30 } }).map((m) => m.character), ['Bob', 'Alice']);
    // 输出条目不带内部偏移字段。
    assert.ok(resolveStageCast({ directives, offset: 50 }).every((m) => !Object.hasOwn(m, 'at')));
});

test('gate: cast poses shift toward each other', () => {
    const plan = { speaker: { posX: 94, scale: 40 }, members: [{ character: 'Alice', posX: 6, scale: 40 }, { character: 'Bob', posX: 50, scale: 40 }], pending: [] };
    // 陪衬与陪衬靠近：左边的人右移、右边的人左移，与标签里的顺序无关。
    const near = applyCastPoses(plan, { speakerKey: 'Cara', links: [{ a: 'Bob', b: 'Alice', kind: 'near' }] });
    assert.equal(near.members[0].posX, 6 + CAST_POSE_SHIFT);
    assert.equal(near.members[1].posX, 50 - CAST_POSE_SHIFT);
    // 其中一人是说话人（在最右）。
    const withSpeaker = applyCastPoses(plan, { speakerKey: 'Cara', links: [{ a: 'Cara', b: 'Bob', kind: 'near' }] });
    assert.equal(withSpeaker.speaker.posX, 94 - CAST_POSE_SHIFT);
    assert.equal(withSpeaker.members[1].posX, 50 + CAST_POSE_SHIFT);
    // 拉开反向。
    const apart = applyCastPoses(plan, { speakerKey: 'Cara', links: [{ a: 'Alice', b: 'Bob', kind: 'apart' }] });
    assert.equal(apart.members[0].posX, 6 - CAST_POSE_SHIFT);
    assert.equal(apart.members[1].posX, 50 + CAST_POSE_SHIFT);
    // 一方不在台上时忽略；上前放大、背对透传；原 plan 不被改写。
    const other = applyCastPoses(plan, { speakerKey: 'Cara', links: [{ a: 'Alice', b: 'Zed', kind: 'near' }], poses: { Bob: { flip: true }, Cara: { front: true } } });
    assert.equal(other.members[0].posX, 6);
    assert.equal(other.members[1].flip, true);
    assert.equal(other.speaker.front, true);
    assert.equal(other.speaker.scale, 42.4);
    assert.deepEqual(plan.members[0], { character: 'Alice', posX: 6, scale: 40 });
    // 子开关关闭时原样返回。
    const snap = (castStage) => ({ readerSettings: { stageCast: { enabled: true, castStage } }, content: { fx: { poses: { Bob: { flip: true } }, links: [], entrances: { Bob: 'run' } } } });
    assert.equal(resolveCastPosePlan(snap(false), plan, 'Cara'), plan);
    assert.equal(resolveCastPosePlan(snap(true), plan, 'Cara').members[1].flip, true);
    assert.deepEqual(castStageEntrances(snap(false)), {});
    assert.deepEqual(castStageEntrances(snap(true)), { Bob: 'run' });
});

test('gate: flipped head mirrors x', () => {
    const head = { x: 0.3, top: 0.1, w: 0.3, aspect: 2 };
    const base = { posX: 18, posY: 100, scale: 40, head };
    assert.equal(spriteGeometry(base, null).head.x, 0.3);
    assert.ok(Math.abs(spriteGeometry({ ...base, flip: true }, null).head.x - 0.7) < 1e-9);
    // 翻转原点：绕图的中心，居中时为 50。
    assert.equal(castFlipOriginX(18, 40), 30.8);
    assert.equal(castFlipOriginX(50, 40), 50);
    assert.equal(castFlipOriginX('x', 40), 50);
});

function fakeStage() {
    const mk = () => {
        const attrs = new Map();
        const props = new Map();
        const el = {
            children: [], parentNode: null, className: '', anims: [],
            style: { setProperty(k, v) { props.set(k, String(v)); }, removeProperty(k) { props.delete(k); }, getPropertyValue(k) { return props.get(k) || ''; } },
            setAttribute(k, v) { attrs.set(k, String(v)); },
            getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
            hasAttribute(k) { return attrs.has(k); },
            removeAttribute(k) { attrs.delete(k); },
            appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
            removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c; },
            animate(frames, opts) { const a = { frames, opts, cancel() {} }; el.anims.push(a); return a; },
        };
        return el;
    };
    const layer = mk();
    layer.ownerDocument = { createElement: () => mk() };
    const root = { querySelector: (s) => (s === '#igs-cast' ? layer : null) };
    const byChar = (n) => layer.children.find((c) => c.getAttribute('data-igs-cast-char') === n);
    return { root, byChar, mk };
}

const member = (character, posX, extra = {}) => ({ character, url: `https://example.com/${character}.png`, posX, posY: 100, scale: 40, ...extra });

test('gate: cast flip writes independent scale and mirrored origin', () => {
    const s = fakeStage();
    applyCastToDom(s.root, [member('Bob', 18, { flip: true })], { reduced: true });
    const bob = s.byChar('Bob');
    assert.equal(bob.style.getPropertyValue('scale'), '-1 1');
    assert.equal(bob.getAttribute('data-igs-cast-flip'), '1');
    assert.equal(bob.style.getPropertyValue('--igs-cast-origin-x'), '30.8%');
    applyCastToDom(s.root, [member('Bob', 18)], { reduced: true });
    assert.equal(bob.style.getPropertyValue('scale'), '');
    assert.equal(bob.getAttribute('data-igs-cast-flip'), null);
    assert.equal(bob.style.getPropertyValue('--igs-cast-origin-x'), '18%');
    // 说话人：独立属性 rotate，不占 scale / transform。
    const sprite = s.mk();
    assert.equal(applySpeakerFlip(sprite, true, 18, 40), true);
    assert.equal(sprite.style.getPropertyValue('rotate'), 'y 180deg');
    assert.equal(sprite.style.getPropertyValue('transform-origin'), '30.8% 100%');
    assert.equal(sprite.getAttribute('data-igs-sprite-flip'), '1');
    assert.equal(sprite.style.getPropertyValue('scale'), '');
    applySpeakerFlip(sprite, false);
    assert.equal(sprite.style.getPropertyValue('rotate'), '');
    assert.equal(sprite.getAttribute('data-igs-sprite-flip'), null);
});

test('gate: cast entrance styles only on entering page', () => {
    const s = fakeStage();
    applyCastToDom(s.root, [member('A', 6), member('B', 94)], { entrances: { A: 'run', B: 'slow' } });
    const a = s.byChar('A');
    const b = s.byChar('B');
    assert.ok(a._igsCastEnter, 'run 叠加一次弹跳');
    assert.equal(a._igsCastEnter.opts.composite, 'add');
    assert.ok(b.anims.some((x) => x.opts.duration === CAST_ENTRANCE_SLOW_MS));
    // 已在台上的人不再播入场。
    const before = a.anims.length;
    applyCastToDom(s.root, [member('A', 6), member('B', 94)], { entrances: { A: 'peek' } });
    assert.equal(a.anims.length, before);
    // 减少动效：不播弹跳。
    const r = fakeStage();
    applyCastToDom(r.root, [member('A', 6)], { reduced: true, entrances: { A: 'run' } });
    assert.ok(!r.byChar('A')._igsCastEnter);
});

test('gate: cast stage switch defaults off and gates both prompt paths', () => {
    assert.equal(normalizeStageCastSettings({}).castStage, false);
    assert.equal(resolveStageCastFxPromptRule({ castStage: true }), '');
    assert.ok(resolveStageCastFxPromptRule({ enabled: true, castStage: true }).includes('[igs-fx:stage|'));
    assert.ok(!resolveStageCastFxPromptRule({ enabled: true, castReact: true }).includes('igs-fx:stage'));
    assert.deepEqual(stageCastGrammarLines({ enabled: true }), []);
    assert.equal(stageCastGrammarLines({ enabled: true, castReact: true, castStage: true }).length, 2);
});
