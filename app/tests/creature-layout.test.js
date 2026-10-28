import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_HEAD } from '../src/visual/igs-ui/fx-anchor.js';
import { planCastLayouts, plantFeet } from '../src/visual/igs-ui/stage-cast-motion.js';
import { layoutCastSlots } from '../src/visual/igs-ui/stage-cast-render.js';
import { resolveSpriteLayout } from '../src/visual/igs-ui/settings-normalize.js';
import {
    applyCreatureScale, applyGiantLayer, composeCreatureStage, creatureFace, creatureProfileOf, creatureScalePercent,
    giantAsideCenter, placeCreature, placeGiant, planCreatureEntry, posXForCenterPct, relieveCreatureCrowding, setCreatureFloat,
} from '../src/visual/igs-ui/creature-layout.js';
import { normalizeCreatureProfile } from '../src/scene/creature-profile.js';

const P = (extra) => normalizeCreatureProfile({ form: 'beast', size: 'medium', anchor: 'ground', ...extra });
// 竖屏手机与横屏电脑舞台
const PHONE = { stageW: 390, stageH: 844 };
const DESK = { stageW: 1280, stageH: 720 };
const probedOf = (over = {}) => ({ naturalW: 832, naturalH: 1216, head: { x: 0.5, top: 0.08, w: 0.2 }, feet: 0.96, ...over });

test('体型缩放：small 70 / medium 100 / large 135，巨型不缩放；设置键可覆盖', () => {
    assert.equal(creatureScalePercent(P({ size: 'small' })), 70);
    assert.equal(creatureScalePercent(P({ size: 'medium' })), 100);
    assert.equal(creatureScalePercent(P({ size: 'large' })), 135);
    assert.equal(creatureScalePercent(P({ size: 'large' }), { large: 150 }), 150);
    assert.equal(creatureScalePercent(P({ size: 'large' }), { large: 9999 }), 220);
    const layout = Object.freeze({ posX: 50, posY: 100, scale: 90 });
    assert.equal(applyCreatureScale(P({ size: 'small' }), layout).scale, 63);
    assert.equal(applyCreatureScale(P({ size: 'large' }), layout).scale, 121.5);
    assert.equal(applyCreatureScale(P({ size: 'medium' }), layout), layout);
    assert.equal(applyCreatureScale(P({ size: 'small' }), layout, null, true), layout, '用户手动定过的位置不再乘');
    assert.equal(applyCreatureScale(null, layout), layout, '人类不缩放');
    assert.equal(layout.scale, 90, '不改入参');
});

test('档案查询按表缓存，人类返回 null', () => {
    const map = Object.freeze({ 狼: { creature: { size: 'large' } }, 小红: { identity: 'girl' } });
    assert.equal(creatureProfileOf(map, '狼').size, 'large');
    assert.equal(creatureProfileOf(map, '狼'), creatureProfileOf(map, '狼'));
    assert.equal(creatureProfileOf(map, '小红'), null);
    assert.equal(creatureProfileOf(undefined, '狼'), null);
    assert.equal(creatureProfileOf({ 待定: { creature: { form: 'auto', size: 'giant' } } }, '待定'), null, '待定临时档按人类处理');
});

test('落地 medium：不溢出时 posY 不动（与人类单人一致）', () => {
    const sprite = { scale: 90, posX: 50, posY: 100 };
    const out = placeCreature({ ...PHONE, profile: P(), sprite, probed: probedOf() });
    assert.equal(out.posY, 100);
    assert.equal(out.scale, 90);
});

test('large 溢出：脸留在画面内，宁可裁脚', () => {
    const sprite = { scale: 135, posX: 50, posY: 100 };
    for (const stage of [PHONE, DESK]) {
        const probed = probedOf();
        const out = placeCreature({ ...stage, profile: P({ size: 'large' }), sprite, probed });
        const h = stage.stageH * out.scale / 100;
        const top = (stage.stageH - h) * out.posY / 100;
        assert.ok(h > stage.stageH, '放大后超出舞台');
        assert.ok(top + probed.head.top * h >= stage.stageH * 0.06 - 1, '头顶在安全线内');
        assert.ok(top + h > stage.stageH, '脚被裁掉');
    }
});

test('溢出对齐：横向图宽超出舞台时脸落在舞台中心', () => {
    const probed = probedOf({ head: { x: 0.3, top: 0.08, w: 0.2 } });
    const out = placeCreature({ ...PHONE, profile: P({ size: 'large' }), sprite: { scale: 135, posX: 50, posY: 100 }, probed });
    const h = PHONE.stageH * out.scale / 100;
    const w = h * 832 / 1216;
    const left = (PHONE.stageW - w) * out.posX / 100;
    assert.ok(Math.abs(left + 0.3 * w - PHONE.stageW / 2) < 1.5);
});

test('头部识别失败回落到图上部 25% 居中', () => {
    const face = creatureFace({ naturalW: 832, naturalH: 1216, head: FALLBACK_HEAD, feet: 1 });
    assert.equal(face.fallback, true);
    assert.equal(face.cx, 0.5);
    assert.equal(face.cy, 0.25);
    assert.equal(creatureFace(null).fallback, true);
    assert.equal(creatureFace(probedOf()).fallback, false);
});

test('悬浮：不贴地，有效部分居中偏上', () => {
    const probed = probedOf();
    const sprite = { scale: 60, posX: 50, posY: 100 };
    const out = placeCreature({ ...PHONE, profile: P({ anchor: 'float' }), sprite, probed });
    const h = PHONE.stageH * out.scale / 100;
    const top = (PHONE.stageH - h) * out.posY / 100;
    const center = top + (probed.head.top + probed.feet) / 2 * h;
    assert.ok(Math.abs(center - PHONE.stageH * 0.4) < 1.5);
    assert.ok(top + probed.feet * h < PHONE.stageH, '脚离地');
    const bare = placeCreature({ ...PHONE, profile: P({ anchor: 'float' }), sprite, probed: null });
    assert.ok(bare.posY < 100, '没有探测数据也能摆');
});

test('悬浮标记开关幂等', () => {
    const attrs = new Map();
    const el = { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k), hasAttribute: (k) => attrs.has(k) };
    setCreatureFloat(el, true);
    setCreatureFloat(el, true);
    assert.equal(attrs.get('data-igs-creature-float'), '1');
    setCreatureFloat(el, false);
    assert.equal(attrs.size, 0);
});

test('巨型：铺满舞台并溢出，脸在安全线内，不露底', () => {
    for (const stage of [PHONE, DESK]) {
        const probed = probedOf({ head: { x: 0.5, top: 0.12, w: 0.3 }, feet: 1 });
        const spot = placeGiant({ ...stage, probed });
        const h = stage.stageH * spot.scale / 100;
        const w = h * 832 / 1216;
        const top = (stage.stageH - h) * spot.posY / 100;
        const left = (stage.stageW - w) * spot.posX / 100;
        assert.ok(w >= stage.stageW && h >= stage.stageH);
        assert.ok(top + h >= stage.stageH - 1 && left + w >= stage.stageW - 1 && left <= 1, '盖住舞台');
        assert.ok(top + probed.head.top * h >= stage.stageH * 0.06 - 1);
    }
    assert.equal(placeGiant({ ...PHONE, probed: null }), null);
});

test('巨型取代：最多一只，后来者取代；说话人是巨型时陪衬补位主立绘', () => {
    const members = [{ character: '甲', image: 'a', order: 1, mood: '', outfit: '' }, { character: '乙', image: 'b', order: 2, mood: '', outfit: '' }];
    const out = composeCreatureStage({ speaker: null, members, giants: [{ character: '巨一', image: 'g1' }, { character: '巨二', image: 'g2' }] });
    assert.equal(out.giant.character, '巨二');
    assert.equal(out.speaker.character, '甲');
    assert.deepEqual(out.members.map((m) => m.character), ['乙']);
    const withSpeaker = composeCreatureStage({ speaker: { character: '主', image: 'm' }, members, giants: [{ character: '巨', image: 'g' }] });
    assert.equal(withSpeaker.members.length, 2, '巨型不占座');
    assert.equal(withSpeaker.speaker.character, '主');
});

test('对手自动上台：有主立绘时入陪衬并钉住，没有主立绘时自己当主立绘', () => {
    const foe = { character: '狼妖', image: 'wolf' };
    const a = composeCreatureStage({ speaker: { character: '主', image: 'm' }, members: [], foe });
    assert.deepEqual(a.members.map((m) => m.character), ['狼妖']);
    assert.equal(a.pin, '狼妖');
    const b = composeCreatureStage({ speaker: null, members: [], foe });
    assert.equal(b.speaker.character, '狼妖');
    assert.equal(b.members.length, 0);
    const c = composeCreatureStage({ speaker: { character: '狼妖', image: 'wolf' }, members: [], foe });
    assert.equal(c.members.length, 0);
    const kept = layoutCastSlots({ members: [{ character: '甲', order: 1 }, { character: '乙', order: 2 }, { character: '狼妖', order: 99 }], hasSpeaker: true, capacity: 3, pin: '狼妖' });
    assert.ok(kept.members.some((m) => m.character === '狼妖'), '钉住的对手不被容量截掉');
});

test('同屏分派：带 creature 的条目走非人落位，人类条目仍走 plantFeet', () => {
    const probed = probedOf();
    const peek = () => probed;
    const human = { url: 'h', scale: 100, posX: 18, posY: 100, centerX: 27 };
    const baseline = planCastLayouts({ ...PHONE, align: true, speaker: { url: 's', scale: 100, posX: 82, posY: 100, centerX: 73 }, members: [human], peek });
    const planted = plantFeet(PHONE.stageH, { scale: 100, posY: 100, feet: probed.feet });
    assert.equal(baseline.members[0].posY, planted.posY);
    assert.equal(baseline.members[0].creature, undefined);
    const floaty = planCastLayouts({ ...PHONE, align: true, speaker: { url: 's', scale: 100, posX: 82, posY: 100, centerX: 73 }, members: [{ url: 'f', scale: 60, posX: 18, posY: 100, centerX: 27, creature: P({ anchor: 'float' }) }], peek });
    assert.ok(floaty.members[0].posY < 100, '悬浮不按腿贴地');
    assert.equal(floaty.members[0].heightScale, 60);
});

test('非人条目：未探测时要求探测；锁定的手摆位置不动', () => {
    const entry = { url: 'x', scale: 135, posX: 18, posY: 100, centerX: 27, creature: P({ size: 'large' }) };
    assert.equal(planCreatureEntry({ ...PHONE, align: true, entry, probed: null }).pending, true);
    const locked = planCreatureEntry({ ...PHONE, align: true, entry: { ...entry, locked: true }, probed: probedOf() });
    assert.equal(locked.entry.posY, 100);
    assert.equal(locked.entry.posX, 18);
});

test('人类布局解析不受影响（resolveSpriteLayout 默认值）', () => {
    assert.deepEqual(resolveSpriteLayout({}, 'pc', '小红', '', '', 90, null), { posX: 50, posY: 100, scale: 90 });
});

function fakeNode(cls) {
    return {
        cls, set className(v) { this.cls = v; }, style: {}, attrs: new Map(), children: [], id: '',
        setAttribute(k, v) { this.attrs.set(k, v); },
        removeAttribute(k) { this.attrs.delete(k); },
        appendChild(c) { this.children.push(c); },
        querySelector(sel) { return this.children.find((c) => `.${c.cls}` === sel) || null; },
    };
}

test('applyGiantLayer：同图同尺寸只摆一次，换图取代，去掉后清空', async () => {
    const held = {};
    const cast = fakeNode('igs-cast');
    const parent = fakeNode('motion');
    cast.parentNode = parent;
    parent.insertBefore = (n) => { held.layer = n; };
    const doc = { createElement: () => fakeNode('div') };
    const root = { ownerDocument: doc, querySelector: (sel) => (sel === '#igs-cast' ? cast : sel === '#igs-giant' ? held.layer || null : null) };
    let probes = 0;
    const cache = new Map();
    const probe = async (url) => { probes += 1; const v = probedOf({ head: { x: 0.5, top: 0.1, w: 0.3 }, feet: 1 }); cache.set(url, v); return v; };
    const opts = { ...PHONE, reduced: true, peek: (u) => cache.get(u) || null, probe, schedule: (fn) => fn() };
    applyGiantLayer(root, { character: '巨', url: 'g1' }, opts);
    await new Promise((r) => setTimeout(r, 5));
    const dim = held.layer.children[0];
    const img = held.layer.children[1];
    assert.equal(dim.cls, 'igs-giant-dim');
    assert.match(img.style.backgroundImage, /g1/);
    assert.equal(held.layer.style.display, 'block');
    applyGiantLayer(root, { character: '巨', url: 'g1' }, opts);
    assert.equal(probes, 1);
    applyGiantLayer(root, { character: '另', url: 'g2' }, opts);
    await new Promise((r) => setTimeout(r, 5));
    assert.match(img.style.backgroundImage, /g2/);
    applyGiantLayer(root, null, opts);
    assert.equal(held.layer.style.display, 'none');
    assert.equal(img.style.backgroundImage, '');
});

test('人类单独出场：同屏规划与无非人条目时完全一致，不经过防遮挡', () => {
    const probed = probedOf();
    const peek = () => probed;
    const speaker = { url: 's', scale: 100, posX: 82, posY: 100, centerX: 73 };
    const member = { url: 'h', scale: 100, posX: 18, posY: 100, centerX: 27 };
    for (const stage of [PHONE, DESK]) {
        const plan = planCastLayouts({ ...stage, align: true, speaker, members: [member], peek });
        assert.deepEqual(Object.keys(plan).sort(), ['members', 'pending', 'speaker']);
        const crowd = relieveCreatureCrowding({ ...stage, align: true, ...plan, peek });
        assert.equal(crowd.speaker, plan.speaker);
        assert.equal(crowd.members[0], plan.members[0]);
    }
});

test('窄舞台：放大的非人条目头部不被相邻人物头部盖住，缩回不低于 100%', () => {
    const probed = probedOf();
    const peek = () => probed;
    const human = { url: 's', scale: 100, posX: 82, posY: 100, centerX: 62 };
    const baseline = planCastLayouts({ ...PHONE, align: false, speaker: human, members: [{ url: 'h2', scale: 100, posX: 18, posY: 100, centerX: 40 }], peek });
    const plan = planCastLayouts({ ...PHONE, align: false, speaker: human, members: [{ url: 'd', scale: 135, posX: 18, posY: 100, centerX: 40, creature: P({ size: 'large' }) }], peek });
    const m = plan.members[0];
    assert.ok(m.scale >= 100 && m.scale <= 135);
    assert.deepEqual(plan.speaker, baseline.speaker, '人类条目不动');
    const circle = (e) => {
        const h = PHONE.stageH * e.scale / 100; const w = h * 832 / 1216;
        return { x: (PHONE.stageW - w) * e.posX / 100 + 0.5 * w, y: (PHONE.stageH - h) * e.posY / 100 + (0.08 + 0.2 * 0.684 * 1.1 / 2) * h, r: 0.1 * w };
    };
    const a = circle(m); const b = circle(plan.speaker);
    if (m.scale > 100 || m.centerX === 40) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= b.r + a.r * 0.6 - 1, '不冲突');
});

test('窄舞台仍冲突时保持 100% 并移到边槽；宽舞台不处理', () => {
    const probed = probedOf();
    const peek = () => probed;
    const speaker = { url: 's', scale: 100, posX: 50, posY: 100, centerX: 50 };
    const creature = { url: 'd', scale: 135, posX: 50, posY: 100, centerX: 50, creature: P({ size: 'large' }) };
    const narrow = planCastLayouts({ ...PHONE, align: false, speaker, members: [creature], peek });
    assert.equal(narrow.members[0].scale, 100);
    assert.ok([18, 82].includes(narrow.members[0].centerX));
    const wide = planCastLayouts({ ...DESK, align: false, speaker, members: [creature], peek });
    assert.equal(wide.members[0].scale, 135, '宽舞台行为不变');
});

test('巨型怪在窄舞台：说话人站到与巨型头部相反的一侧', () => {
    const probed = probedOf({ head: { x: 0.3, top: 0.1, w: 0.3 }, feet: 1 });
    assert.equal(giantAsideCenter({ ...PHONE, probed }), 82);
    assert.equal(giantAsideCenter({ ...PHONE, probed: null }), 82);
    const pos = posXForCenterPct(PHONE.stageW, PHONE.stageH, 100, probedOf(), 78);
    const w = PHONE.stageH * 832 / 1216;
    assert.ok(Math.abs((PHONE.stageW - w) * pos / 100 + w / 2 - PHONE.stageW * 0.78) < 1);
});

test('窄舞台巨型：头部锚点可偏到 36% 且仍盖住舞台', () => {
    const probed = probedOf({ head: { x: 0.5, top: 0.12, w: 0.3 }, feet: 1 });
    const spot = placeGiant({ ...PHONE, probed, headX: 0.36 });
    const h = PHONE.stageH * spot.scale / 100; const w = h * 832 / 1216;
    const left = (PHONE.stageW - w) * spot.posX / 100;
    assert.ok(Math.abs(left + 0.5 * w - PHONE.stageW * 0.36) < 1.5);
    assert.ok(left <= 1 && left + w >= PHONE.stageW - 1);
});
