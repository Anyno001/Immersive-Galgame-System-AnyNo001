// 战斗面板风格化版式：卡面插槽数据（value / unit / stack / 加成明细 / 关键字全称）、敌人圆环站位、渲染标记与 initial 皮肤不变。
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyAction, createBattle, legalActions, seedFor } from '../src/combat/engine.js';
import { battleView, cardKeywordNames, cardSlotView } from '../src/visual/igs-ui/combat-panel-model.js';
import { renderCombatPanelHtml, ringFront, ringSlot } from '../src/visual/igs-ui/combat-panel-render.js';
import { COMBAT_SWAP_MS, createCombatPanelController } from '../src/visual/igs-ui/combat-panel.js';
import { COMBAT_PANEL_SKINS } from '../src/visual/igs-ui/combat-settings.js';

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

function controllerHarness(t, battle, extra = {}) {
    const dom = new JSDOM('<div id="igs-overlay"></div>');
    const doc = dom.window.document;
    let clock = 0, sequence = 0;
    const timers = new Map();
    t.mock.method(Date, 'now', () => clock);
    const schedule = (fn, ms) => { const id = ++sequence; timers.set(id, { at: clock + ms, fn }); return id; };
    const advance = (ms) => {
        const end = clock + ms;
        for (let n = 0; n < 10000; n += 1) {
            const due = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) { clock = end; return; }
            timers.delete(due[0]); clock = due[1].at; due[1].fn();
        }
        assert.fail('演出计时未收敛');
    };
    const cur = { status: 'battle', combatId: 'controller-test', battle, legal: legalActions(battle), events: [] };
    const session = {
        state: () => cur,
        act(action) {
            const r = applyAction(cur.battle, action);
            if (r.ok) { cur.battle = r.state; cur.legal = legalActions(r.state); cur.events.push(...r.events); }
            return { ...r, session: cur };
        },
    };
    const panel = createCombatPanelController(doc, { getSession: () => session, schedule, clear: id => timers.delete(id), reducedMotion: () => false, ...extra });
    const overlay = doc.querySelector('#igs-overlay');
    panel.open(overlay);
    t.after(() => { panel.close(); dom.window.close(); });
    return { panel, doc, overlay, cur, session, advance, now: () => clock };
}

function reserveBattle(withAlly = false) {
    const r = createBattle({ controlledId: 'hero', openingCharged: true, reserve: ['fresh'], units: [
        { id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 1000, speed: withAlly ? 40 : 110,
            deck: Array(6).fill('strike'), catalog: CATALOG },
        ...(withAlly ? [{ id: 'mate', name: '同伴', side: 'ally', kind: 'skill', maxHp: 100, speed: 150,
            skills: [{ id: 'assist', name: '同伴斩击', intent: 'attack', effects: [dmg(6)] }] }] : []),
        { ...foe('old', '旧敌人'), maxHp: 1, hp: 1 },
        { ...foe('fresh', '补位敌人'), maxHp: 500, hp: 500, speed: 200 },
    ] }, seedFor('reserve-panel'));
    assert.equal(r.ok, true, JSON.stringify(r.error));
    return r.state;
}

for (const skin of COMBAT_PANEL_SKINS) test(`补位（${skin}）：旧敌人受击后退场，新敌人入场，关闭重开不残留`, t => {
    const p = controllerHarness(t, reserveBattle(), { skin: () => skin });
    const card = p.panel.view().battle.hand.find(c => c.playable);
    p.panel.invoke('card', card.inst);
    assert.equal(p.panel.invoke('target', 'old').ok, true);
    assert.deepEqual(p.panel.view().battle.enemies.map(u => u.id), ['old']);
    assert.equal(p.panel.view().battle.track.some(u => u.id === 'fresh'), false);
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) {
        p.advance(20);
        const u = p.panel.view().battle.enemies[0];
        if (u.swap) {
            seen.add(`${u.id}:${u.swap}`);
            assert.equal(p.doc.querySelector(`:is(.igs-combat-unit,.cx-unit)[data-unit="${u.id}"]`)?.getAttribute('data-swap'), u.swap);
        }
    }
    assert.deepEqual([...seen].sort(), ['fresh:in', 'old:out']);
    assert.equal(p.panel.view().battle.enemies[0].id, 'fresh');
    assert.equal(p.panel.view().battle.enemies[0].swap, undefined);
    p.panel.close(); p.panel.open(p.overlay);
    assert.equal(p.panel.view().battle.enemies[0].swap, undefined);
    assert.equal(p.doc.querySelector('[data-igs-combat-auto]'), null);
});

for (const skin of ['initial', 'veil']) test(`补位敌人（${skin}）：同一自动行动序列先入场至少620ms，再显示出手`, t => {
    const p = controllerHarness(t, reserveBattle(true), { skin: () => skin });
    const r = p.panel.invoke('end-turn');
    assert.equal(r.ok, true);
    assert.ok(r.events.some(e => e.type === 'reinforce' && e.unitId === 'fresh'));
    assert.ok(r.events.some(e => e.type === 'act' && e.unitId === 'fresh'));
    let entered = null, acted = null;
    for (let i = 0; i < 3000 && acted === null; i += 1) {
        p.advance(10);
        const el = p.doc.querySelector(':is(.igs-combat-unit,.cx-unit)[data-unit="fresh"]');
        if (el?.getAttribute('data-swap') === 'in' && entered === null) entered = p.now();
        if (el?.classList.contains('is-acting')) acted = p.now();
    }
    assert.notEqual(entered, null, '补位敌人确实入场');
    assert.notEqual(acted, null, '补位敌人确实出手');
    assert.ok(acted - entered >= COMBAT_SWAP_MS.in, `${entered} -> ${acted}`);
});

for (const action of ['finish', 'retry-send']) test(`发送即收起：${action}不等待会话返回，失败可重开`, async t => {
    const p = controllerHarness(t, reserveBattle());
    p.cur.status = action === 'finish' ? 'ended' : 'send-failed';
    let complete, calls = 0;
    p.session[action === 'finish' ? 'finish' : 'retrySend'] = () => {
        calls += 1;
        return new Promise(resolve => { complete = resolve; });
    };
    const job = p.panel.invoke(action);
    assert.equal(calls, 1);
    assert.equal(p.panel.view(), null, '发送尚未完成，面板已经关闭');
    assert.equal(p.overlay.hasAttribute('data-igs-combat-open'), false);
    p.cur.status = 'send-failed';
    complete({ ok: false, reason: 'host-send-failed' });
    assert.equal((await job).ok, false);
    p.panel.open(p.overlay);
    assert.equal(p.panel.view().status, 'send-failed');
});

for (const mode of ['reduced', 'low']) test(`补位降级（${mode}）：直接显示新敌人，不保留退场或入场状态`, t => {
    const p = controllerHarness(t, reserveBattle(), { reducedMotion: () => mode === 'reduced' });
    if (mode === 'low') p.overlay.setAttribute('data-igs-quality', 'low');
    const card = p.panel.view().battle.hand.find(c => c.playable);
    p.panel.invoke('card', card.inst);
    assert.equal(p.panel.invoke('target', 'old').ok, true);
    assert.deepEqual(p.panel.view().battle.enemies.map(u => u.id), ['fresh']);
    assert.equal(p.panel.view().battle.enemies[0].swap, undefined);
    assert.equal(p.doc.querySelector('[data-swap]'), null);
    p.advance(10000);
    assert.deepEqual(p.panel.view().battle.enemies.map(u => u.id), ['fresh']);
    assert.equal(p.doc.querySelector('[data-swap]'), null);
});
