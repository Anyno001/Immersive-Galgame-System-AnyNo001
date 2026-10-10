import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_CAST_MAX_SEATS, STAGE_CAST_SCAN_LIMIT, pickCastMembers, resolveCastOffset, resolveStageCast } from '../src/scene/stage-cast.js';
import { extractSceneDirectives } from '../src/scene/scene-directives.js';
import { applyCastToDom, castSlotKey, isCastCollapsed, layoutCastSlots, resolveCastCapacity } from '../src/visual/igs-ui/stage-cast-render.js';
import { applySavedCastSlot, buildCastSlotEditPatch } from '../src/visual/igs-ui/cast-slot-edit.js';
import { normalizeCastSlotLayouts } from '../src/visual/igs-ui/settings-normalize.js';

const castAt = (source, marker, extra = {}) => resolveStageCast({
    directives: extractSceneDirectives(source).directives,
    offset: source.indexOf(marker),
    ...extra,
});

test('gate: stage-cast keeps recent speakers within scene', () => {
    const source = [
        '[igs-scene:教室|上午|晴天]',
        '[igs-char:甲|开心|早。]',
        '[igs-char:乙|平静|早上好。]',
        '[igs-char:甲|害羞|那个……]',
        '[igs-char:丙|惊讶|你们在聊什么]',
    ].join('\n');
    const cast = castAt(source, '你们在聊什么');
    assert.deepEqual(cast.map((m) => m.character), ['丙', '甲', '乙']);
    assert.deepEqual(cast.map((m) => m.order), [2, 0, 1]);
    assert.equal(cast[1].mood, '害羞');
    assert.deepEqual(castAt(source, '早上好').map((m) => m.character), ['乙', '甲']);
});

test('gate: stage-cast clears on scene switch', () => {
    const source = [
        '[igs-scene:教室|上午|晴天]',
        '[igs-char:甲|开心|早。]',
        '[igs-scene:走廊|上午|晴天]',
        '[igs-char:乙|平静|走吧。]',
    ].join('\n');
    assert.deepEqual(castAt(source, '走吧').map((m) => m.character), ['乙']);
});

test('gate: stage-cast evicts least recent over limit', () => {
    const source = ['甲', '乙', '丙', '丁'].map((n) => `[igs-char:${n}|平静|${n}说话。]`).join('\n');
    const cast = castAt(source, '丁说话');
    assert.deepEqual(cast.map((m) => m.character), ['丁', '丙', '乙']);
    const again = `${source}\n[igs-char:甲|平静|甲回来了。]`;
    const back = castAt(again, '甲回来了');
    assert.deepEqual(back.map((m) => m.character), ['甲', '丁', '丙']);
    assert.equal(back[0].order, 4);
});

test('gate: stage-cast merges aliases and skips ineligible speakers', () => {
    const source = [
        '[igs-char:雪乃|平静|你好。]',
        '[igs-char:旁白|平静|……]',
        '[igs-char:雪之下雪乃|开心|嗯。]',
        '[igs-char:乙|平静|在。]',
    ].join('\n');
    const cast = castAt(source, '在。', {
        keyOf: (name) => (name === '雪乃' ? '雪之下雪乃' : name),
        isEligible: (name) => name !== '旁白',
    });
    assert.deepEqual(cast.map((m) => m.character), ['乙', '雪之下雪乃']);
    assert.equal(cast[1].order, 0);
    assert.deepEqual(resolveStageCast({ directives: [], offset: -1 }), []);
});

test('gate: cast capacity by mode and stage rect', () => {
    assert.equal(resolveCastCapacity('pc', {}), 3);
    assert.equal(resolveCastCapacity('mobile', { width: 1920, height: 1080 }), 2);
    assert.equal(resolveCastCapacity('embedded', {}), 2);
    assert.equal(resolveCastCapacity('fullscreen', { width: 1920, height: 1080 }), 3);
    assert.equal(resolveCastCapacity('fullscreen', { width: 390, height: 844 }), 2);
    assert.equal(resolveCastCapacity('web', { width: 700, height: 500 }), 2);
    assert.equal(resolveCastCapacity('web', {}), 3);
});

test('gate: cast slots stay stable when speaker changes', () => {
    const a = { character: '甲', order: 0 };
    const b = { character: '乙', order: 1 };
    const c = { character: '丙', order: 2 };
    const first = layoutCastSlots({ members: [a, b], speakerOrder: 2, hasSpeaker: true, capacity: 3 });
    assert.equal(first.multi, true);
    assert.equal(first.speakerPosX, 94);
    assert.deepEqual(first.members.map((m) => [m.character, m.posX]), [['甲', 6], ['乙', 50]]);
    const second = layoutCastSlots({ members: [c, b], speakerOrder: 0, hasSpeaker: true, capacity: 3 });
    assert.equal(second.speakerPosX, 6);
    assert.deepEqual(second.members.map((m) => [m.character, m.posX]), [['乙', 50], ['丙', 94]]);
    const narrow = layoutCastSlots({ members: [c, b], speakerOrder: 0, hasSpeaker: true, capacity: 2 });
    assert.deepEqual([narrow.speakerPosX, narrow.members.map((m) => [m.character, m.posX])], [18, [['丙', 82]]]);
    const solo = layoutCastSlots({ members: [], speakerOrder: 0, hasSpeaker: true, capacity: 3 });
    assert.equal(solo.multi, false);
    const noSpeaker = layoutCastSlots({ members: [a, b], hasSpeaker: false, capacity: 2 });
    assert.equal(noSpeaker.speakerPosX, null);
    assert.deepEqual(noSpeaker.members.map((m) => m.posX), [18, 82]);
});

test('gate: cast collapses for romance, close-up, nsfw and edit mode but not battle', () => {
    const snap = (content = {}, readerSettings = {}) => ({ content: { textType: 'dialogue', ...content }, readerSettings });
    assert.equal(isCastCollapsed(snap()), false);
    assert.equal(isCastCollapsed(snap(), { spriteEditMode: true }), true);
    assert.equal(isCastCollapsed(snap({ sceneNsfw: true })), true);
    assert.equal(isCastCollapsed(snap({ fx: { romance: 'intimate' } }, { romanceFx: { enabled: true } })), true);
    assert.equal(isCastCollapsed(snap({ fx: { battle: { foe: '魔王' }, hits: [] } }, { battleFx: { enabled: true } })), false);
    assert.equal(isCastCollapsed(snap({ fx: { battle: { foe: '魔王' }, hits: [] } }, {})), false);
    assert.equal(isCastCollapsed(snap({ statusEmotion: '震惊' }, { camera: { enabled: true } })), true);
});

function fakeLayer() {
    const make = (tag) => {
        const attrs = new Map();
        const el = {
            tagName: tag, children: [], parentNode: null, className: '', ownerDocument: null,
            style: { setProperty(k, v) { this[k] = v; } },
            setAttribute(k, v) { attrs.set(k, String(v)); },
            getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
            hasAttribute(k) { return attrs.has(k); },
            removeAttribute(k) { attrs.delete(k); },
            appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
            removeChild(child) { el.children = el.children.filter((c) => c !== child); child.parentNode = null; return child; },
        };
        return el;
    };
    const doc = { createElement: make };
    const layer = make('div');
    layer.ownerDocument = doc;
    const root = { querySelector: (sel) => (sel === '#igs-cast' ? layer : null) };
    return { root, layer };
}

test('gate: cast dom reuses elements by character and removes leavers', () => {
    const { root, layer } = fakeLayer();
    applyCastToDom(root, [
        { character: '甲', url: 'a.png', posX: 6, posY: 100, scale: 100 },
        { character: '乙', url: 'b.png', posX: 50, posY: 100, scale: 90 },
    ]);
    assert.equal(layer.children.length, 2);
    const first = layer.children[0];
    assert.equal(first.getAttribute('data-igs-cast-char'), '甲');
    assert.equal(first.style.backgroundPosition, '6% 100%');
    assert.equal(layer.children[1].style.backgroundSize, 'auto 90%');
    applyCastToDom(root, [{ character: '甲', url: 'a2.png', posX: 18, posY: 100, scale: 100 }]);
    assert.equal(layer.children.length, 1);
    assert.equal(layer.children[0], first);
    assert.equal(first.style.backgroundImage, 'url("a2.png")');
    applyCastToDom(root, []);
    assert.equal(layer.children.length, 0);
    assert.equal(layer.style.display, 'none');
});

test('gate: cast slots report slot index and count for per-slot layouts', () => {
    const a = { character: '甲', order: 0 };
    const b = { character: '乙', order: 1 };
    const out = layoutCastSlots({ members: [b, a], speakerOrder: 2, hasSpeaker: true, capacity: 3 });
    assert.equal(out.count, 3);
    assert.equal(out.speakerSlot, 2);
    assert.deepEqual(out.members.map((m) => [m.character, m.slotIndex]), [['甲', 0], ['乙', 1]]);
    assert.equal(castSlotKey('pc', 3, 1, '乙'), 'pc::3::1::乙');
});

test('gate: stage-cast skips imageless members before capping', () => {
    const source = ['甲', '乙', '丙', '丁'].map((n) => `[igs-char:${n}|平静|${n}说话。]`).join('\n');
    const cast = castAt(source, '丁说话', { limit: STAGE_CAST_SCAN_LIMIT });
    const asked = [];
    const resolve = (m) => {
        asked.push(m.character);
        return m.character === '丙' ? null : { character: m.character, image: `${m.character}.png` };
    };
    const picked = pickCastMembers(cast, { speakerKey: '丁', seats: STAGE_CAST_MAX_SEATS - 1, resolve });
    assert.deepEqual(picked.members.map((m) => [m.character, m.order]), [['乙', 1], ['甲', 0]]);
    assert.equal(picked.speakerOrder, 3);
    assert.deepEqual(asked, ['丙', '乙', '甲']);
    asked.length = 0;
    const one = pickCastMembers(cast, { speakerKey: '丁', seats: 1, resolve });
    assert.deepEqual(one.members.map((m) => m.character), ['乙']);
    assert.deepEqual(asked, ['丙', '乙']);
    const noSpeaker = pickCastMembers(cast, { speakerKey: '', seats: STAGE_CAST_MAX_SEATS, resolve });
    assert.deepEqual(noSpeaker.members.map((m) => m.character), ['丁', '乙', '甲']);
    assert.equal(noSpeaker.speakerOrder, null);
});


test('gate: cast dom waits for decode and cuts same-character swaps', async () => {
    const { root, layer } = fakeLayer();
    const decodes = [];
    class FakeImage {
        decode() { return new Promise((resolve) => decodes.push({ src: this.src, resolve })); }
    }
    layer.ownerDocument.defaultView = { Image: FakeImage };
    const flush = () => new Promise((r) => setImmediate(r));
    const member = (url) => [{ character: '甲', url, posX: 6, posY: 100, scale: 100 }];
    applyCastToDom(root, member('decode-a.png'));
    const el = layer.children[0];
    assert.ok(!el.style.backgroundImage);
    assert.deepEqual(decodes.map((d) => d.src), ['decode-a.png']);
    decodes.shift().resolve();
    await flush();
    assert.equal(el.style.backgroundImage, 'url("decode-a.png")');
    applyCastToDom(root, member('decode-a2.png'));
    assert.equal(el.style.backgroundImage, 'url("decode-a.png")');
    applyCastToDom(root, member('decode-a2.png'));
    assert.equal(decodes.length, 1);
    const appended = [];
    const append = layer.appendChild;
    layer.appendChild = (child) => { appended.push(child); return append(child); };
    decodes.shift().resolve();
    await flush();
    assert.equal(el.style.backgroundImage, 'url("decode-a2.png")');
    assert.equal(appended.length, 0);
    assert.equal(layer.children.length, 1);
});

test('gate: entering cast waits for head-align ready before showing', async () => {
    const { root, layer } = fakeLayer();
    const flush = () => new Promise((r) => setImmediate(r));
    let release;
    const ready = new Promise((r) => { release = r; });
    applyCastToDom(root, [{ character: '甲', url: 'align-a.png', posX: 6, posY: 100, scale: 100 }], { ready });
    const el = layer.children[0];
    await flush();
    assert.ok(!el.style.backgroundImage, 'entering member stays hidden until alignment is ready');
    // 对齐重排：同一元素同步改尺寸，不提前显示。
    applyCastToDom(root, [{ character: '甲', url: 'align-a.png', posX: 6, posY: 92, scale: 110 }], { reduced: true });
    assert.equal(el.style.backgroundSize, 'auto 110%');
    assert.equal(el.style.backgroundPosition, '6% 92%');
    assert.ok(!el.style.backgroundImage);
    release();
    await flush();
    assert.equal(el.style.backgroundImage, 'url("align-a.png")');
    assert.equal(el.style.backgroundSize, 'auto 110%');
    // 已在台上的成员不受 ready 影响，换图照常。
    const pending = new Promise(() => {});
    applyCastToDom(root, [{ character: '甲', url: 'align-a2.png', posX: 6, posY: 92, scale: 110 }], { ready: pending });
    await flush();
    assert.equal(el.style.backgroundImage, 'url("align-a2.png")');
});



test('gate: stage-cast offset falls back to nearest page directive when locate fails', () => {
    const directives = [
        { type: 'scene', offset: 0, segmentIndex: 0 },
        { type: 'char', character: '甲', dialogue: '早。', segmentIndex: 0, offset: 10 },
        { type: 'char', character: '乙', dialogue: '早上好。', segmentIndex: 1, offset: 30 },
        { type: 'thought', character: '丙', thought: '后来的心声', segmentIndex: 3, offset: 60 },
    ];
    const locate = (t) => ({ '早。': 14, '早上好。': 34, '后来的心声': 64 }[t] ?? -1);
    // 定位成功时原样返回。
    assert.equal(resolveCastOffset({ offset: 20, directives, segmentIndex: 1, locate }), 20);
    // 定位失败：取本页及之前最近一条台词重新定位，名单不再清空。
    const at = resolveCastOffset({ offset: -1, directives, segmentIndex: 2, locate });
    assert.equal(at, 34);
    assert.deepEqual(resolveStageCast({ directives, offset: at }).map((m) => m.character), ['乙', '甲']);
    assert.equal(resolveCastOffset({ offset: -1, directives, segmentIndex: 3, locate }), 64);
    // 本页之前没人开口、原文也定位不到或缺 locate：返回 -1，名单为空。
    assert.equal(resolveCastOffset({ offset: -1, directives: directives.slice(0, 1), segmentIndex: 2, locate }), -1);
    assert.equal(resolveCastOffset({ offset: -1, directives, segmentIndex: 2, locate: () => -1 }), -1);
    assert.equal(resolveCastOffset({ offset: -1, directives, segmentIndex: 2 }), -1);
    assert.equal(resolveCastOffset({ offset: Number.NaN, directives, segmentIndex: -1, locate }), -1);
});

test('gate: cast slot stores position only and height stays on the character', () => {
    const shown = applySavedCastSlot({ posX: 30, posY: 100, scale: 80 }, { posX: 40, posY: 90, scale: 180 });
    assert.equal(shown.scale, 80, '槽位里旧的高度不再使用');
    assert.equal(shown.posX, 40);
    assert.equal(shown.posY, 90);
    assert.equal(shown.locked, true);
    assert.deepEqual(shown.auto, { posX: 30, posY: 100, scale: 80 });
    const automatic = applySavedCastSlot({ posX: 30, posY: 100, scale: 80 }, null);
    assert.equal(automatic.scale, 80);
    assert.equal(automatic.locked, undefined);

    assert.deepEqual(normalizeCastSlotLayouts({
        'pc::2::0::甲': { posX: 12, posY: 80, scale: 180 },
        'pc::2::1::乙': { posX: 70, posY: 90, scale: 40 },
    }), {
        'pc::2::0::甲': { posX: 12, posY: 80 },
        'pc::2::1::乙': { posX: 70, posY: 90 },
    });
    const moved = buildCastSlotEditPatch([
        { key: 'pc::2::0::甲', posDirty: true, cur: { posX: 12, posY: 80, scale: 144 } },
        { key: 'pc::2::1::乙', posDirty: false, cur: { posX: 70, posY: 100, scale: 80 } },
    ], { castSlotLayouts: { 'pc::2::0::甲': { posX: 1, posY: 2, scale: 180 }, 'pc::2::1::乙': { posX: 70, posY: 90, scale: 40 } }, globalScale: 100 });
    assert.deepEqual(moved, { castSlotLayouts: { 'pc::2::0::甲': { posX: 12, posY: 80 }, 'pc::2::1::乙': { posX: 70, posY: 90 } } });
    assert.equal(moved.spriteLayouts, undefined);

    const grown = buildCastSlotEditPatch([
        {
            key: 'pc::2::1::乙',
            layoutKey: 'pc::乙',
            heightPos: { posX: 50, posY: 100 },
            heightScale: 64,
            orig: { posX: 70, posY: 100, scale: 64 },
            scaleDirty: true,
            cur: { posX: 70, posY: 100, scale: 128 },
        },
    ], { castSlotLayouts: {}, spriteLayouts: {}, globalScale: 80 });
    assert.equal(grown.castSlotLayouts, undefined);
    assert.deepEqual(grown.spriteLayouts['pc::乙'], { posX: 50, posY: 100, scale: 160 }, '画面高度除掉全局 80% 后写入这个人自己的记录');

    const posed = buildCastSlotEditPatch([
        {
            layoutKey: 'pc::乙',
            heightPos: { posX: 50, posY: 100 },
            heightScale: 80,
            orig: { scale: 84.8 },
            scaleDirty: true,
            cur: { scale: 93.28 },
        },
    ], { spriteLayouts: {}, globalScale: 100 });
    assert.equal(posed.spriteLayouts['pc::乙'].scale, 88, '上前的 6% 不写进高度');

    const keptPos = buildCastSlotEditPatch([
        {
            layoutKey: 'pc::乙::smile',
            heightPos: { posX: 10, posY: 20 },
            heightScale: 80,
            orig: { scale: 80 },
            scaleDirty: true,
            cur: { scale: 80 },
        },
    ], { spriteLayouts: { 'pc::乙::smile': { posX: 33, posY: 44, scale: 90 } }, globalScale: 100 });
    assert.deepEqual(keptPos.spriteLayouts['pc::乙::smile'], { posX: 33, posY: 44, scale: 80 }, '改高度不改这个人原有的单人位置');

    const restored = buildCastSlotEditPatch([
        { key: 'pc::2::0::甲', reset: true, scaleDirty: true, layoutKey: 'pc::甲', cur: { scale: 80 } },
    ], {
        castSlotLayouts: { 'pc::2::0::甲': { posX: 12, posY: 80, scale: 144 } },
        spriteLayouts: {},
        globalScale: 100,
    });
    assert.deepEqual(restored, { castSlotLayouts: {} });
    assert.equal(restored.spriteLayouts, undefined);
});
