import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_CAST_MAX_SEATS, STAGE_CAST_SCAN_LIMIT, pickCastMembers, resolveStageCast } from '../src/scene/stage-cast.js';
import { extractSceneDirectives } from '../src/scene/scene-directives.js';
import { applyCastToDom, castSlotKey, isCastCollapsed, layoutCastSlots, resolveCastCapacity } from '../src/visual/igs-ui/stage-cast-render.js';

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
