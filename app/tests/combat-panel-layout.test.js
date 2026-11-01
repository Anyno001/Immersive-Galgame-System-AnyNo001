// 战斗面板风格化版式：卡面插槽数据（value / unit / stack / 加成明细 / 关键字全称）、敌人圆环站位、渲染标记与 initial 皮肤不变。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, legalActions, seedFor } from '../src/combat/engine.js';
import { battleView, cardKeywordNames, cardSlotView } from '../src/visual/igs-ui/combat-panel-model.js';
import { renderCombatPanelHtml, ringFront, ringSlot } from '../src/visual/igs-ui/combat-panel-render.js';

const dmg = (amount, extra = {}) => ({ op: 'damage', amount, target: 'enemy', ...extra });
const CATALOG = {
    strike: { id: 'strike', name: '火尖枪', type: 'attack', cost: 1, rarity: 'basic', effects: [dmg(6)], upgraded: { effects: [dmg(9)] } },
    ward: { id: 'ward', name: '护体', type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 8, target: 'self' }] },
    sweep: { id: 'sweep', name: '横扫', type: 'attack', cost: 2, rarity: 'rare', effects: [dmg(5, { target: 'all-enemies' }), { op: 'exhaust-self' }] },
    mend: { id: 'mend', name: '回春', type: 'skill', cost: 1, rarity: 'common', retain: true, effects: [{ op: 'heal', amount: 6, target: 'self' }] },
    aura: { id: 'aura', name: '真火', type: 'power', cost: 3, rarity: 'mythic', effects: [{ op: 'status', status: 'strength', stacks: 2, target: 'self' }] },
};
const idle = { id: 'idle', name: '蓄势', intent: 'buff', effects: [{ op: 'status', status: 'strength', stacks: 1, target: 'self' }] };
const foe = (id, name) => ({ id, name, side: 'enemy', kind: 'skill', maxHp: 30, hp: 30, speed: 90, skills: [idle] });

function build(handIds, mutate) {
    const r = createBattle({
        controlledId: 'hero',
        units: [
            { id: 'hero', name: '哪吒', side: 'ally', kind: 'deck', maxHp: 80, hp: 80, speed: 110, energy: 3, draw: 5,
                deck: [...Object.keys(CATALOG).map((cardId) => ({ cardId, upgraded: false })), ...Array(4).fill('strike')], catalog: CATALOG },
            foe('a', '夜叉'), foe('b', '小鬼甲'), foe('c', '小鬼乙'),
        ],
    }, seedFor('layout-test'));
    assert.ok(r.ok);
    const state = r.state;
    const pile = state.piles.hero;
    const all = [...pile.draw, ...pile.hand, ...pile.discard];
    const used = new Set();
    pile.hand = handIds.map((cid) => { const inst = all.find((i) => !used.has(i) && state.cards[i].cardId === cid); used.add(inst); return inst; });
    pile.draw = all.filter((i) => !used.has(i));
    pile.discard = [];
    mutate?.(state);
    return state;
}
const viewOf = (state) => battleView(state, legalActions(state));

test('卡面插槽：伤害 / 格挡 / 回复 / 群伤取第一个主效果，单位正确', () => {
    const v = viewOf(build(['strike', 'ward', 'mend', 'sweep', 'aura']));
    const by = Object.fromEntries(v.hand.map((c) => [c.id, c]));
    assert.deepEqual([by.strike.value, by.strike.unit], [6, '伤害']);
    assert.deepEqual([by.ward.value, by.ward.unit], [8, '格挡']);
    assert.deepEqual([by.mend.value, by.mend.unit], [6, '回复']);
    assert.deepEqual([by.sweep.value, by.sweep.unit], [5, '群伤']);
    assert.equal(by.aura.value, null);
    assert.equal(by.aura.unit, '');
});

test('卡面插槽：力量加成后 value 变大，baseValue 保留原值，bonusNote 写明细', () => {
    const v = viewOf(build(['strike'], (s) => { s.units.hero.statuses.strength = 3; }));
    const c = v.hand[0];
    assert.equal(c.baseValue, 6);
    assert.equal(c.value, 9);
    assert.equal(c.bonusNote, '基础 6 + 攻击力 3');
    const none = viewOf(build(['strike'])).hand[0];
    assert.equal(none.bonusNote, undefined);
});

test('卡面插槽：虚弱打七五折并写进明细，敏捷加格挡', () => {
    const weak = viewOf(build(['strike'], (s) => { s.units.hero.statuses.weak = 1; })).hand[0];
    assert.equal(weak.value, 4);
    assert.match(weak.bonusNote, /虚弱/);
    const dex = viewOf(build(['ward'], (s) => { s.units.hero.statuses.dexterity = 2; })).hand[0];
    assert.equal(dex.value, 10);
    assert.equal(dex.bonusNote, '基础 8 + 防御力 2');
});

test('同名张数：同 id 且同升级状态的张数，至少 2 张才给 stack', () => {
    const state = build(['strike', 'strike', 'strike', 'ward']);
    const hand = viewOf(state).hand;
    assert.deepEqual(hand.map((c) => c.stack), [3, 3, 3, undefined]);
    // 升级过的不与未升级的合并
    const first = state.piles.hero.hand[0];
    state.cards[first].upgraded = true;
    const mixed = viewOf(state).hand;
    assert.deepEqual(mixed.map((c) => c.stack), [undefined, 2, 2, undefined]);
});

test('关键字全称：保留、消耗按全称列出', () => {
    const v = viewOf(build(['mend', 'sweep', 'strike']));
    assert.deepEqual(v.hand[0].keywordNames, ['保留']);
    assert.deepEqual(v.hand[1].keywordNames, ['消耗']);
    assert.deepEqual(v.hand[2].keywordNames, []);
    assert.deepEqual(cardKeywordNames({ unplayable: true, temp: true, effects: [] }), ['不能打出', '临时']);
    assert.deepEqual(cardSlotView(null, null), { value: null, unit: '' });
});

test('圆环：默认第一名存活敌人在正前方；指定 front 后转动；x 左右对称、深度正前方最大', () => {
    const enemies = [{ id: 'a', alive: true }, { id: 'b', alive: true }, { id: 'c', alive: true }];
    assert.equal(ringFront(enemies, ''), 0);
    assert.equal(ringFront(enemies, 'c'), 2);
    assert.equal(ringFront(enemies, 'zz'), 0);
    assert.equal(ringFront([{ id: 'a', alive: false }, { id: 'b', alive: true }], ''), 1);
    assert.equal(ringFront([{ id: 'a', alive: false }], ''), 0);
    const slots = enemies.map((_, i) => ringSlot(enemies, i, 'a'));
    assert.deepEqual([slots[0].x, slots[0].d, slots[0].front], [0, 1, true]);
    assert.equal(slots[1].x, -slots[2].x);
    assert.ok(slots[1].d < 1 && slots[1].d === slots[2].d);
    assert.ok(slots[0].z > slots[1].z);
    const turned = enemies.map((_, i) => ringSlot(enemies, i, 'b'));
    assert.equal(turned[1].front, true);
    assert.equal(turned[1].x, 0);
});

function panelView(skin, extra = {}) {
    const state = build(['strike', 'strike', 'ward', 'sweep'], (s) => { s.units.hero.statuses.strength = 2; });
    return { status: 'battle', reason: '', notice: '', pending: '', selected: null, controlledId: 'hero', rewards: null, encounter: '测试',
        battle: viewOf(state), portraits: {}, enemyArt: {}, canRestart: false, ...(skin ? { skin } : {}), ...extra };
}

test('渲染：风格化皮肤输出数值 / 单位 / 同名角标 / 关键字 / 加成节点与圆环变量', () => {
    // 黑幕已是画布皮肤（combat-skin-veil.js），按画布标记断言。
    const html = renderCombatPanelHtml(panelView('veil', { front: 'b' }));
    assert.match(html, /data-cx="veil"/);
    assert.match(html, /<div class="val"><svg[^]*?<\/svg><b>8<\/b><\/div>/);
    assert.match(html, /<i class="bd">×2<\/i>/);
    assert.match(html, /<span class="kw" data-k="消耗">消耗<\/span>/);
    assert.match(html, /<i class="eh">基础 6 \+ 攻击力 2<\/i>/);
    assert.match(html, /class="foe [^"]*\bfront\b[^"]*" data-unit="b" data-side="enemy" style="[^"]*--fx:0\.0px/);
    assert.equal((html.match(/class="foe [^"]*\bfront\b/g) || []).length, 1);
    // 战斗中没有「重开」键；行动顺序带头顶比例供头像取景。
    assert.doesNotMatch(html, /data-combat-act="restart"/);
    assert.match(html, /class="who cx-dot[^"]*" style="--atop:0" data-unit="b"/);
});

test('渲染：initial 皮肤与未给 skin 时没有圆环变量与停靠区内容，读屏文本不变', () => {
    for (const html of [renderCombatPanelHtml(panelView('initial')), renderCombatPanelHtml(panelView(''))]) {
        assert.doesNotMatch(html, /--fx:|is-front|igs-combat-dock-row|igs-combat-dock-tools/);
        assert.match(html, /<div class="igs-combat-dock"><\/div>/);
        assert.match(html, /class="igs-combat-hero-figure"><div class="igs-combat-energy/);
        assert.match(html, /<div class="igs-combat-piles">/);
    }
    const styled = renderCombatPanelHtml(panelView('veil'));
    const plain = renderCombatPanelHtml(panelView('initial'));
    const labels = (h) => [...h.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(labels(styled).filter((l) => l.includes('消耗 ')), labels(plain).filter((l) => l.includes('消耗 ')));
});
