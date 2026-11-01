import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatSession } from '../src/combat/session.js';
import { createCombatLedger } from '../src/combat/ledger.js';
import { enemyIdFor } from '../src/combat/generation.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { battleView, combatCutins, combatFxSource, combatHitMarks, endView, lobbyView, resolvePlay } from '../src/visual/igs-ui/combat-panel-model.js';
import { FakeEl, makeTimers } from './helpers/fake-dom.js';
import { COMBAT_CHAIN_MS, createCombatPanelController } from '../src/visual/igs-ui/combat-panel.js';
import { renderCombatPanelHtml } from '../src/visual/igs-ui/combat-panel-render.js';
import { chooseCard, emptyPick, flipCard, flipOrder, flipView, rerollPick, revealedOf } from '../src/combat/flip.js';
import { enemyArtCell, enemyArtThemeOf } from '../src/visual/igs-ui/combat-enemy-art.js';
import { setStagePauseReason } from '../src/visual/igs-ui/stage-pause.js';


const clone = (v) => JSON.parse(JSON.stringify(v));
const attack = (id) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] });
const guard = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const passive = (id, trigger = 'battle-start') => ({ id, name: '被动', trigger, effects: [{ op: 'block', amount: 2 }] });
const STARTER = [
    'basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend',
    'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2',
];
const classDef = { kind: 'class', id: 'cls-blade', className: '剑士', archetype: 'warrior', classPassive: passive('p-edge'),
    classPool: [1, 2, 5, 6].map((n) => attack(`c${n}`)).concat([3, 4, 7, 8].map((n) => guard(`c${n}`))) };
const heroDef = { kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
    personalPassive: passive('p-will', 'on-low-hp'), personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')], starterDeck: [...STARTER] };
const enemyDef = (name, amount) => ({ kind: 'enemy', id: enemyIdFor(name, 'normal'), name, tier: 'normal', base: { hp: 40 },
    skills: [{ id: 'e1', name: '撕咬', intent: 'attack', effects: [{ op: 'damage', amount }] }, { id: 'e2', name: '扑击', intent: 'attack', effects: [{ op: 'damage', amount }] }] });
const row = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });
const ai = (mes) => ({ mes, swipe_id: 0, is_user: false });
const user = (mes) => ({ mes, is_user: true });

export function memoryTables(profile) {
    const t = { profile: clone(profile), ledger: [] };
    t.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(t.profile), ledger: clone(t.ledger) });
    t.append = async (kind, records) => {
        for (const r of records) if (!t[kind].some((x) => x.id === r.id && x.version === r.version)) t[kind].push(clone(r));
        return { ok: true, written: records.map((r) => r.id), present: [], rejected: [], pending: [] };
    };
    return t;
}

export function combatHarness({ enemy = '狼', hero = heroDef } = {}) {
    const h = { chat: [user('出发'), ai(`前方有动静。\n[igs-combat:start|狭路|${enemy}]`)], sent: [] };
    h.storage = createMemoryStorage();
    h.tables = memoryTables([row(classDef, 1), row(hero, 2), row(enemyDef('狼', 4), 3)]);
    h.ledger = createCombatLedger({ tables: h.tables, chat: () => h.chat, userName: '主角', now: () => 5 });
    h.send = async (text) => { h.sent.push(text); h.chat.push(user(text)); return { ok: true, messageId: h.chat.length - 1 }; };
    h.session = createCombatSession({ ledger: h.ledger, tables: h.tables, llm: { source: 'tavern' }, send: h.send,
        storage: h.storage, chat: () => h.chat, getChatId: 'chat-1', userName: '主角', now: () => 9 });
    return h;
}

test('视图模型：战前只列可操控角色，对局手牌可用性与引擎 legal 一致，能量耗尽后不能出牌', async () => {
    const h = combatHarness();
    const prepared = await h.session.prepare(1);
    const lobby = lobbyView(prepared.session);
    assert.deepEqual([lobby.encounter, lobby.allies.map((a) => [a.name, a.controllable]), lobby.enemies.map((e) => e.name)], ['狭路', [['主角', true]], ['狼']]);
    assert.equal(h.session.start().ok, true);
    let s = h.session.state();
    let view = battleView(s.battle, s.legal);
    assert.deepEqual([view.energy, view.hand.length, view.hand.every((c) => c.playable)], [3, 5, true]);
    for (let i = 0; i < 3; i += 1) {
        const card = battleView(h.session.state().battle, h.session.state().legal).hand[0];
        const pick = resolvePlay(h.session.state().legal, card.inst, card.targets[0]);
        assert.equal(pick.ok, true);
        assert.equal(h.session.act(pick.action).ok, true);
    }
    s = h.session.state();
    view = battleView(s.battle, s.legal);
    assert.equal(view.energy, 0);
    assert.ok(view.hand.length > 0);
    assert.ok(view.hand.every((c) => !c.playable && !c.affordable));
    assert.deepEqual(resolvePlay(s.legal, view.hand[0].inst), { ok: false, reason: 'combat-card-unplayable' });
    assert.equal(view.canEndTurn, true);
});

test('视图模型：引擎事件转成演出标签形状，结束后给出结算与伤势', async () => {
    const h = combatHarness();
    await h.session.prepare(1);
    h.session.start();
    const before = h.session.state().events.length;
    const card = battleView(h.session.state().battle, h.session.state().legal).hand.find((c) => c.needsTarget);
    const r = h.session.act(resolvePlay(h.session.state().legal, card.inst, card.targets[0]).action);
    const fx = combatFxSource(r.events, r.session.battle, { foe: '狼', title: '狭路' });
    assert.equal(fx.hits.length, 1);
    assert.deepEqual([fx.hits[0].attacker, fx.hits[0].target, fx.hits[0].result, fx.battleEnd], ['主角', '狼', 'hit', '']);
    assert.ok(h.session.state().events.length > before);
    for (let i = 0; i < 400 && h.session.state().status === 'battle'; i += 1) {
        const legal = h.session.state().legal;
        h.session.act(legal.find((a) => a.type === 'play') || { type: 'end-turn' });
    }
    const end = endView(h.session.state().battle);
    assert.equal(end.outcome, 'victory');
    assert.equal(end.label, '胜利');
    assert.equal(end.allies[0].name, '主角');
});


// 面板控制器：FakeEl 假 DOM，overlay 以 #igs-overlay 身份承载暂停原因。
function panelHarness(extra = {}, harness = {}) {
    const h = combatHarness(harness);
    const doc = { createElement: (tag) => new FakeEl(doc, tag), activeElement: null };
    const overlay = new FakeEl(doc, 'div');
    overlay.id = 'igs-overlay';
    const timers = makeTimers();
    // 立绘：狼给网络图片，主角给被拒协议，验证过滤后回退剪影。
    const resolvePortrait = (name) => (name === '狼' ? 'https://example.test/wolf.png' : 'javascript:alert(1)');
    const panel = createCombatPanelController(doc, { getSession: () => h.session, getLedger: () => h.ledger, reducedMotion: () => true, schedule: timers.schedule, clear: timers.clear, resolvePortrait, ...extra });
    return { ...h, doc, overlay, panel, timers };
}

async function until(fn) {
    for (let i = 0; i < 50 && !fn(); i += 1) await new Promise((r) => setImmediate(r));
    assert.ok(fn());
}

const paused = (overlay) => String(overlay.getAttribute('data-igs-paused') || '').split(' ').filter(Boolean);
// 队友与敌人的自动行动演出还在播（根节点 data-igs-combat-auto）：面板此时拒绝新动作。
const autoBusy = (p) => p.overlay.querySelector('#igs-combat-panel')?.getAttribute('data-igs-combat-auto') != null;
// 按手牌顺序出牌、无牌可出时结束回合，直到战斗结束（400 步内没打完就停下，由调用方断言结果）；每步前先等自动行动演出播完，与玩家操作一致。
function playToEnd(p) {
    for (let i = 0; i < 400 && p.panel.view().status === 'battle'; i += 1) {
        for (let j = 0; j < 400 && autoBusy(p); j += 1) p.timers.advance(100);
        const card = p.panel.view().battle.hand.find((c) => c.playable);
        if (!card) { p.panel.invoke('end-turn'); continue; }
        if (!p.panel.invoke('card', card.inst).ok) p.panel.invoke('target', card.targets[0] ?? card.affects[0]);
    }
}

test('行动顺序：结束回合后回放队友与敌人的自动行动期间拒绝新动作，回放走完解锁；演出中关闭再打开不残留锁', async () => {
    const p = panelHarness();
    const settle = () => { for (let j = 0; j < 400 && autoBusy(p); j += 1) p.timers.advance(100); };
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    p.panel.invoke('start');
    settle();
    assert.equal(autoBusy(p), false);
    assert.equal(p.panel.invoke('end-turn').ok, true);
    assert.equal(autoBusy(p), true);
    const before = structuredClone(p.session.state());
    const view = p.panel.view();
    const html = p.overlay.querySelector('.igs-combat-body').innerHTML;
    const card = view.battle.hand.find((c) => c.playable);
    assert.ok(card);
    const target = card.targets[0] ?? card.affects[0];
    for (const [name, id] of [['card', card.inst], ['target', target], ['hero-skill'], ['awaken'], ['item', 'unused'], ['end-turn'], ['escape'], ['cancel']]) {
        const blocked = p.panel.invoke(name, id);
        assert.deepEqual([blocked.ok, blocked.reason], [false, 'combat-busy'], name);
        assert.deepEqual(p.session.state(), before, name);
        assert.deepEqual(p.panel.view(), view, name);
        assert.equal(p.overlay.querySelector('.igs-combat-body').innerHTML, html, name);
    }
    settle();
    assert.equal(autoBusy(p), false);
    assert.equal(p.panel.invoke('card', card.inst).reason, 'combat-target-required');
    assert.equal(p.panel.invoke('target', target).ok, true);
    assert.equal(p.panel.view().battle.hand.some((c) => c.inst === card.inst), false);
    assert.equal(p.panel.invoke('end-turn').ok, true);
    assert.equal(autoBusy(p), true);
    assert.equal(p.panel.invoke('close').ok, true);
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'battle');
    assert.equal(autoBusy(p), false);
    assert.equal(p.panel.invoke('end-turn').ok, true);
    p.panel.close();
});

test('面板：打开加 panel:combat 暂停原因并进入战前，关闭只撤销自己的原因', async () => {
    const p = panelHarness();
    setStagePauseReason(p.overlay, 'offscreen', true);
    assert.equal(p.panel.open(p.overlay, { messageId: 1 }).ok, true);
    assert.deepEqual(paused(p.overlay).sort(), ['offscreen', 'panel:combat']);
    assert.equal(p.overlay.getAttribute('data-igs-combat-open'), '');
    await until(() => p.panel.view().status === 'lobby');
    const lobbyHtml = p.overlay.querySelector('.igs-combat-body').innerHTML;
    assert.match(lobbyHtml, /data-combat-act="start"/);
    assert.deepEqual(p.panel.view().portraits, { 主角: '', 狼: 'https://example.test/wolf.png' });
    assert.match(lobbyHtml, /<img src="https:\/\/example\.test\/wolf\.png"/);
    assert.doesNotMatch(lobbyHtml, /javascript:/);
    assert.equal((lobbyHtml.match(/<svg viewBox="0 0 100 120"/g) || []).length, 1);
    // 夹具默认减少动态效果：战前不带入场标记（只留静态斜切），选操控角色照常。
    assert.match(lobbyHtml, /<section class="igs-combat-lobby" data-tier="normal">/);
    assert.equal(p.panel.invoke('pick', p.panel.view().lobby.heroId).ok, true);
    assert.doesNotMatch(p.overlay.querySelector('.igs-combat-body').innerHTML, /data-intro/);
    assert.equal(p.panel.close().ok, true);
    assert.equal(p.panel.isOpen(), false);
    assert.deepEqual(paused(p.overlay), ['offscreen']);
    assert.equal(p.overlay.getAttribute('data-igs-combat-open'), null);
    assert.equal(p.overlay.querySelector('#igs-combat-panel'), null);
});

test('面板：素材库立绘读回后经 subscribePortraits 重算，地址有变才重绘战前；关闭时退订', async () => {
    let heroUrl = '';
    let notify = null;
    let offCalls = 0;
    const p = panelHarness({
        resolvePortrait: (name) => (name === '狼' ? 'https://example.test/wolf.png' : heroUrl),
        subscribePortraits: (handler) => { notify = handler; return () => { offCalls += 1; notify = null; }; },
    });
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    const body = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    assert.equal(typeof notify, 'function');
    assert.doesNotMatch(body(), /hero\.png/);
    // 读回的不是当前显示的立绘：地址不变，不重绘。
    const before = body();
    notify({ imageId: 'other', reason: 'image-loaded' });
    assert.equal(body(), before);
    // 立绘读回：解析出地址后重绘，战前我方框换成立绘。
    heroUrl = 'https://example.test/hero.png';
    notify({ imageId: 'hero', reason: 'image-loaded' });
    assert.match(body(), /<img src="https:\/\/example\.test\/hero\.png"/);
    assert.equal(p.panel.view().portraits['主角'], 'https://example.test/hero.png');
    p.panel.close();
    assert.equal(offCalls, 1);
    assert.equal(notify, null);
});


test('面板：后台准备进行中打开只显示准备中、不另发准备，准备结束经会话订阅刷新到战前并定好操控角色', async () => {
    const p = panelHarness();
    const background = p.session.prepare(1);
    assert.equal(p.session.state().status, 'preparing');
    assert.equal(p.panel.open(p.overlay, { messageId: 1 }).ok, true);
    assert.match(p.overlay.querySelector('.igs-combat-body').innerHTML, /aria-busy="true"/);
    assert.equal(p.panel.view().pending, '');
    await background;
    assert.equal(p.panel.view().status, 'lobby');
    assert.equal(p.panel.view().controlledId, p.session.state().lobby.heroId);
    assert.match(p.overlay.querySelector('.igs-combat-body').innerHTML, /data-combat-act="start"/);
    assert.equal(p.panel.invoke('start').ok, true);
    p.panel.close();
});

test('战前对阵：我方 · VS · 敌方三段；我方等大、立绘下选操控角色或标托管；敌人按数量逐个画出，首领档标出；未参战与操作在下方', () => {
    const view = { status: 'lobby', pending: '', notice: '', controlledId: 'h', portraits: {}, enemyArt: {}, encounter: '王座',
        lobby: { encounter: '王座', tier: 'boss', tierLabel: '首领', heroId: 'h', absent: ['青岚'], skipped: [],
            allies: [{ id: 'h', name: '主角', level: 3, controllable: true }, { id: 'm', name: '白露', level: 2, controllable: false }],
            enemies: [{ name: '魔王', count: 1, templated: false, tier: 'boss' }, { name: '小鬼', count: 2, templated: true, tier: 'normal' }] } };
    const html = renderCombatPanelHtml(view);
    assert.match(html, /<section class="igs-combat-lobby" data-tier="boss">/);
    assert.match(html, /class="igs-combat-lobby-banner"><b class="igs-combat-lobby-name">王座<\/b><span class="igs-combat-lobby-tier">首领<\/span>/);
    assert.match(html, /igs-combat-lobby-side is-ally[\s\S]*igs-combat-lobby-vs[\s\S]*igs-combat-lobby-side is-enemy" data-n="3"/);
    assert.equal((html.match(/<figure class="igs-combat-lobby-figure" data-side="ally"/g) || []).length, 2);
    assert.equal((html.match(/<figure class="igs-combat-lobby-figure" data-side="enemy"/g) || []).length, 3);
    assert.equal((html.match(/data-side="enemy" data-tier="boss"/g) || []).length, 1);
    assert.equal((html.match(/<small>模板<\/small>/g) || []).length, 2);
    // 名牌：可操控角色的名牌就是选择按钮，选中的主战者叠在最前；其余标托管；首领加斜标。
    assert.match(html, /data-side="ally" data-picked=""><div class="igs-combat-portrait"/);
    assert.match(html, /<button type="button" class="igs-combat-plate" data-combat-act="pick" data-combat-id="h" aria-pressed="true"><span class="igs-combat-plate-row"><b>主角<\/b><small>Lv3<\/small><\/span><\/button>/);
    assert.match(html, /<span class="igs-combat-plate"><span class="igs-combat-plate-row"><b>白露<\/b><small>Lv2<\/small><\/span><em data-tag="auto">托管<\/em><\/span>/);
    assert.equal((html.match(/<em data-tag="boss">首领<\/em>/g) || []).length, 1);
    assert.match(html, /未参战[\s\S]*青岚/);
    assert.match(html, /data-combat-act="skip"[\s\S]*data-combat-act="start"/);
    assert.match(renderCombatPanelHtml({ ...view, intro: true }), /data-tier="boss" data-intro="">/);
});

test('战前持续伤势：名牌在 Lv 后写开战生命；倒下的队友单列「倒下」行，在未参战之前；没有伤势时生命满值', async () => {
    const view = { status: 'lobby', pending: '', notice: '', controlledId: 'h', portraits: {}, enemyArt: {},
        lobby: { encounter: '狭路', tier: 'normal', tierLabel: '普通', heroId: 'h', absent: ['青岚'], downed: ['赤羽'], skipped: [],
            allies: [{ id: 'h', name: '主角', level: 3, controllable: true, hp: 1, maxHp: 80 }], enemies: [{ name: '狼', count: 1, templated: false, tier: 'normal' }] } };
    const html = renderCombatPanelHtml(view);
    assert.match(html, /<b>主角<\/b><small>Lv3<\/small><small data-hp="">生命 1\/80<\/small>/);
    assert.match(html, /data-kind="down"><span class="igs-combat-label">倒下<\/span><span class="igs-combat-chip">赤羽<\/span>[\s\S]*未参战[\s\S]*青岚/);
    assert.doesNotMatch(renderCombatPanelHtml({ ...view, lobby: { ...view.lobby, downed: [] } }), /倒下/);
    const h = combatHarness();
    const prepared = await h.session.prepare(1);
    const model = lobbyView(prepared.session);
    assert.deepEqual(model.downed, []);
    assert.ok(model.allies[0].maxHp > 0);
    assert.equal(model.allies[0].hp, model.allies[0].maxHp);
});

test('战前奖励行：会话奖励进大厅视图；生成成功不显示；失败只显示「奖励生成失败」与「重试」，忙碌时置灰；重试进行中显示生成中；没有奖励时不出该行', async () => {
    const h = combatHarness();
    const prepared = await h.session.prepare(1);
    assert.equal(prepared.session.status, 'lobby', JSON.stringify(prepared));
    const model = lobbyView(prepared.session);
    assert.deepEqual([model.reward.status, model.reward.exp, model.reward.slots, Boolean(model.reward.reason)], ['failed', 20, 3, true]);
    const base = { status: 'lobby', pending: '', notice: '', controlledId: 'h', portraits: {}, enemyArt: {},
        lobby: { encounter: '狭路', tier: 'normal', tierLabel: '普通', heroId: 'h', absent: [], skipped: [],
            allies: [{ id: 'h', name: '主角', level: 1, controllable: true }], enemies: [{ name: '狼', count: 1, templated: false, tier: 'normal' }] } };
    const at = (reward, pending = '') => renderCombatPanelHtml({ ...base, pending, lobby: { ...base.lobby, reward } });
    const row = (html) => html.match(/<div class="igs-combat-row igs-combat-lobby-reward"[\s\S]*?<\/div>/)?.[0] || '';
    assert.equal(row(at({ status: 'ready', exp: 20, slots: 3 })), '');
    assert.equal(row(at({ status: 'pending', exp: 20, slots: 3 })), '<div class="igs-combat-row igs-combat-lobby-reward" data-state="pending"><span class="igs-combat-label">奖励生成中</span></div>');
    // 生成失败、写库失败、重开未生成一律只显示「奖励生成失败」与「重试」，不显示 EXP 与原因。
    for (const reason of ['combat-reward-generation-failed', 'combat-offer-write-failed', 'combat-reward-missing']) {
        assert.equal(row(at({ status: 'failed', exp: 20, slots: 3, reason })), '<div class="igs-combat-row igs-combat-lobby-reward" data-state="failed"><span class="igs-combat-label">奖励生成失败</span><button type="button" class="igs-combat-btn" data-combat-act="retry-reward">重试</button></div>');
    }
    assert.match(row(at({ status: 'failed', exp: 20, slots: 3, reason: 'combat-reward-missing' }, 'reward')), /data-combat-act="retry-reward" aria-disabled="true">重试</);
    assert.doesNotMatch(renderCombatPanelHtml(base), /igs-combat-lobby-reward/);
});

test('战前我方立绘框色调：取到立绘最亮色时框上写 r,g,b 变量；色值不合法、没有立绘或敌人都不写', async () => {
    const { tintTriplet } = await import('../src/visual/igs-ui/combat-panel-render.js');
    assert.equal(tintTriplet('rgb(240,212,196)'), '240,212,196');
    for (const bad of ['', null, undefined, 'rgb(256,0,0)', 'rgba(1,2,3,.5)', 'rgb(1,2,3);color:red', '#fff']) assert.equal(tintTriplet(bad), '');
    const view = { status: 'lobby', pending: '', notice: '', controlledId: 'h', encounter: '林道', enemyArt: {},
        portraits: { 主角: 'data:image/png;base64,QUFB', 白露: 'data:image/png;base64,QkJC', 野狼: 'data:image/png;base64,Q0ND' },
        tints: { 主角: 'rgb(240,212,196)', 白露: 'rgb(1,2,3);background:red', 青岚: 'rgb(9,9,9)', 野狼: 'rgb(200,10,10)' },
        lobby: { encounter: '林道', tier: 'normal', tierLabel: '', heroId: 'h', absent: [], skipped: [],
            allies: [{ id: 'h', name: '主角', level: 3, controllable: true }, { id: 'm', name: '白露', level: 2, controllable: false }, { id: 'q', name: '青岚', level: 1, controllable: false }],
            enemies: [{ name: '野狼', count: 1, templated: true, tier: 'normal' }] } };
    const html = renderCombatPanelHtml(view);
    assert.equal((html.match(/--igs-combat-ally-tint:/g) || []).length, 1);
    assert.match(html, /data-side="ally" data-picked="" style="--igs-combat-ally-tint:240,212,196">/);
    assert.doesNotMatch(html, /background:red/);
});

test('战前入场与开战过场：每次打开只在第一次画战前时播入场；点「开始战斗」先闪入「开战」，走完再播开局演出；减少动态效果时都不播；过场不画速度线，低画质过场不闪白', async () => {
    const { COMBAT_CUTIN_MS } = await import('../src/visual/igs-ui/combat-cutin.js');
    const heard = [];
    const p = panelHarness({ reducedMotion: () => false, playSfx: (kind) => heard.push(kind) });
    const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    const openings = (h) => h.overlay.querySelectorAll('.igs-combat-opening');
    const encounter = () => heard.some((k) => /^battle-encounter/.test(k));
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    assert.match(html(), /<section class="igs-combat-lobby" data-tier="normal" data-intro="">/);
    assert.equal(p.panel.invoke('pick', p.panel.view().lobby.heroId).ok, true);
    assert.doesNotMatch(html(), /data-intro/);
    p.panel.close();
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    assert.match(html(), /data-intro=""/);
    assert.equal(p.panel.invoke('start').ok, true);
    const [cut] = openings(p);
    assert.equal(cut.className, 'igs-combat-opening');
    assert.equal(cut.querySelector('.igs-combat-opening-word').textContent, '开战');
    assert.equal(cut.querySelectorAll('.igs-combat-cutin-band').length, 1);
    assert.equal(cut.querySelectorAll('.igs-combat-cutin-flash').length, 1);
    p.timers.advance(COMBAT_CUTIN_MS.opening - 1);
    assert.equal(encounter(), false);
    p.timers.advance(1);
    assert.equal(openings(p).length, 0);
    p.timers.advance(10000);
    assert.equal(encounter(), true, heard.join(','));
    p.panel.close();

    const low = panelHarness({ reducedMotion: () => false });
    low.overlay.setAttribute('data-igs-quality', 'low');
    low.panel.open(low.overlay, { messageId: 1 });
    await until(() => low.panel.view().status === 'lobby');
    assert.equal(low.panel.invoke('start').ok, true);
    const [quiet] = openings(low);
    assert.equal(quiet.className, 'igs-combat-opening is-low');
    assert.equal(quiet.querySelectorAll('.igs-combat-cutin-flash').length, 0);
    low.panel.close();

    const still = panelHarness();
    still.panel.open(still.overlay, { messageId: 1 });
    await until(() => still.panel.view().status === 'lobby');
    assert.doesNotMatch(still.overlay.querySelector('.igs-combat-body').innerHTML, /data-intro/);
    assert.equal(still.panel.invoke('start').ok, true);
    assert.equal(openings(still).length, 0);
    still.panel.close();
});

test('面板：能量不足的牌不能打出，结束回合推进托管与敌方阶段', async () => {
    const p = panelHarness();
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    assert.equal(p.panel.invoke('start').ok, true);
    // 行动条：对局中标题栏有行动条，操控角色头像停在出手点（--p:1）。
    assert.match(p.overlay.querySelector('.igs-combat-body').innerHTML, /igs-combat-track-dot[^>]*data-controlled=""[^>]*--p:1"/);
    // 回合横幅：标题后是斜切的「第 N 回合」。
    assert.match(p.overlay.querySelector('.igs-combat-body').innerHTML, /<span class="igs-combat-title">[^<]*<\/span><span class="igs-combat-round">第 1 回合<\/span>/);
    for (let i = 0; i < 3; i += 1) {
        const card = p.panel.view().battle.hand[0];
        const r = p.panel.invoke('card', card.inst);
        if (!r.ok) assert.equal(p.panel.invoke('target', card.targets[0] ?? card.affects[0]).ok, true);
    }
    const view = p.panel.view();
    assert.equal(view.battle.energy, 0);
    const before = p.session.state().record.actions.length;
    const refused = p.panel.invoke('card', view.battle.hand[0].inst);
    assert.deepEqual([refused.ok, refused.reason], [false, 'combat-card-unplayable']);
    assert.match(p.panel.view().notice, /能量不足/);
    assert.equal(p.session.state().record.actions.length, before);
    const ended = p.panel.invoke('end-turn');
    assert.equal(ended.ok, true);
    assert.ok(ended.events.some((e) => e.type === 'act' && e.side === 'enemy'));
    assert.ok(ended.events.some((e) => e.type === 'skill'));
    assert.equal(p.panel.view().battle.turn, 2);
    assert.equal(p.panel.view().battle.energy, 3);
    p.panel.close();
});

test('面板：打到结束后发送战报，已回传的开战楼再打开只显示回顾', async () => {
    const p = panelHarness();
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    p.panel.invoke('start');
    playToEnd(p);
    assert.equal(p.panel.view().end.outcome, 'victory');
    const sent = await p.panel.invoke('finish');
    assert.equal(sent.ok, true);
    assert.equal(p.sent.length, 1);
    // 战报送达且没有待领的升级奖励时，面板自动关闭，露出阅读器里的新楼层。
    assert.equal(p.panel.isOpen(), false);
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'done');
    assert.doesNotMatch(p.overlay.querySelector('.igs-combat-body').innerHTML, /data-combat-act="start"/);
    assert.equal(p.sent.length, 1);
    p.panel.close();
});

test('结算：结束战斗的那次动作先按战斗画面播完演出再换结算画面；胜利隐藏敌方、放光芒粒子、我方等大立绘；演出中关闭后重开直接显示结算', async () => {
    const p = panelHarness({ reducedMotion: () => false });
    const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    p.panel.invoke('start');
    playToEnd(p);
    assert.equal(p.panel.view().end.outcome, 'victory');
    // 最后一击的演出还在播：仍是战斗画面，敌方单位节点保留（命中与飘字落得下去），还没有结算画面与发送按钮。
    assert.equal(p.panel.view().settling, true);
    assert.match(html(), /class="igs-combat-field"/);
    assert.match(html(), /data-side="enemy"/);
    assert.doesNotMatch(html(), /igs-combat-result|data-combat-act="finish"/);
    // 结果横幅只是过渡：最后一击后很快亮出、放到一大半就换结算画面，横幅还叠在结算画面上淡出（不等它完全消失再硬切）；结算入场动画此时开始。
    let waited = 0;
    for (let i = 0; i < 400 && p.panel.view().settling; i += 1) { p.timers.advance(100); waited += 100; }
    assert.ok(waited < 4050, `${waited}`);
    assert.equal(p.panel.view().settling, undefined);
    assert.notEqual(p.overlay.querySelector('.igs-fx-battle-result'), null);
    assert.equal(p.overlay.querySelector('#igs-combat-panel').getAttribute('data-igs-combat-result-in'), '');
    assert.match(html(), /<section class="igs-combat-result" data-outcome="victory">/);
    assert.match(html(), /class="igs-combat-result-title">胜利</);
    assert.match(html(), /igs-combat-result-rays[\s\S]*igs-combat-result-sparks/);
    assert.doesNotMatch(html(), /data-side="enemy"|igs-combat-field/);
    assert.equal((html().match(/class="igs-combat-result-figure"/g) || []).length, p.panel.view().end.allies.length);
    assert.match(html(), /data-combat-act="finish"/);
    assert.equal(p.overlay.querySelector('#igs-combat-panel').getAttribute('data-igs-combat-reduced'), null);
    // 更早动作没播完的时间轴已被最后一击收掉：走完所有计时器后，对手名牌不会重新挂回结算画面，画面仍是结算。
    p.timers.advance(20000);
    assert.equal(p.overlay.querySelector('.igs-fx-battle-plate'), null);
    assert.equal(p.overlay.querySelector('.igs-fx-battle-result'), null);
    assert.match(html(), /data-outcome="victory"/);
    p.panel.close();

    const q = panelHarness({ reducedMotion: () => false });
    const qHtml = () => q.overlay.querySelector('.igs-combat-body').innerHTML;
    q.panel.open(q.overlay, { messageId: 1 });
    await until(() => q.panel.view().status === 'lobby');
    q.panel.invoke('start');
    playToEnd(q);
    assert.equal(q.panel.view().settling, true);
    q.panel.close();
    assert.equal(q.panel.open(q.overlay, { messageId: 1 }).ok, true);
    assert.equal(q.panel.view().settling, undefined);
    assert.match(qHtml(), /data-outcome="victory"/);
    // 关闭前排下的演出计时器不会把画面改回去。
    q.timers.advance(20000);
    assert.match(qHtml(), /data-outcome="victory"/);
    q.panel.close();
});

test('结算：撤退保留敌人但不显示意图、不放光芒粒子；减少动态效果时动作后直接显示结算画面', async () => {
    const p = panelHarness();
    const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    p.panel.invoke('start');
    assert.match(html(), /data-combat-act="escape"/);
    assert.match(html(), /data-intent=/);
    assert.equal(p.panel.invoke('escape').ok, true);
    assert.equal(p.panel.view().settling, undefined);
    assert.match(html(), /<section class="igs-combat-result" data-outcome="escape">/);
    assert.match(html(), /class="igs-combat-result-title">撤退</);
    assert.match(html(), /data-side="enemy"/);
    assert.doesNotMatch(html(), /data-intent=|igs-combat-result-(rays|sparks)/);
    assert.match(html(), /data-combat-act="finish"/);
    assert.equal(p.overlay.querySelector('#igs-combat-panel').getAttribute('data-igs-combat-reduced'), '');
    p.panel.close();
});

test('面板：单位呼吸跟随宿主 breathing 设置，减少动态效果或未开启时不写呼吸标记', async () => {
    const cases = [[{ reducedMotion: () => false, breathing: () => true }, ''], [{ breathing: () => true }, null], [{ reducedMotion: () => false, breathing: () => false }, null], [{ reducedMotion: () => false }, null]];
    for (const [opts, want] of cases) {
        const p = panelHarness(opts);
        p.panel.open(p.overlay, { messageId: 1 });
        await until(() => p.panel.view().status === 'lobby');
        assert.equal(p.overlay.querySelector('#igs-combat-panel').getAttribute('data-igs-combat-breathe'), want);
        p.panel.close();
    }
});

test('面板：能量圆标不显示「能量」字，可访问名称保留当前/每回合，外环按占比填充，空能量标 is-empty', async () => {
    const p = panelHarness();
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    p.panel.invoke('start');
    const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    assert.match(html(), /class="igs-combat-energy" role="img" aria-label="能量 3\/3"/);
    assert.match(html(), /igs-combat-energy-orb" style="--fill:1\.000"><i class="igs-combat-energy-liquid" aria-hidden="true"><\/i><b>3<\/b>/);
    assert.doesNotMatch(html(), /igs-combat-energy-label|>能量</);
    for (let i = 0; i < 3; i += 1) {
        const card = p.panel.view().battle.hand[0];
        if (!p.panel.invoke('card', card.inst).ok) p.panel.invoke('target', card.targets[0] ?? card.affects[0]);
    }
    assert.equal(p.panel.view().battle.energy, 0);
    assert.match(html(), /class="igs-combat-energy is-empty" role="img" aria-label="能量 0\/3"/);
    assert.match(html(), /--fill:0\.000/);
    p.panel.close();
});

test('窄屏操作区：随面板宽度移动同一份能量与技能，切回宽屏还原，关闭后解绑尺寸监听', async () => {
    const p = panelHarness();
    let sync;
    let disconnected = false;
    p.doc.defaultView = { ResizeObserver: class {
        constructor(fn) { sync = fn; }
        observe() {}
        disconnect() { disconnected = true; }
    } };
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    p.panel.invoke('start');
    const root = p.overlay.querySelector('#igs-combat-panel');
    const body = root.querySelector('.igs-combat-body');
    const node = (cls, parent) => { const el = new FakeEl(p.doc, 'div'); el.className = cls; parent.appendChild(el); return el; };
    const core = node('igs-combat-hero-core', body);
    const figure = node('igs-combat-hero-figure', core);
    const energy = node('igs-combat-energy', figure);
    const ring = node('igs-combat-trait-ring', figure);
    const controls = node('igs-combat-controls', figure);
    const skill = node('igs-combat-hero-skill', controls);
    const dock = node('igs-combat-dock', body);
    controls.contains = (el) => controls.descendants().includes(el);
    let focused = 0;
    skill.focus = () => { focused += 1; p.doc.activeElement = skill; };
    p.doc.activeElement = skill;
    let width = 430;
    Object.defineProperty(root, 'clientWidth', { get: () => width });
    const before = structuredClone(p.session.state());
    sync();
    assert.deepEqual(dock.children, [energy, ring, controls]);
    assert.equal(root.getAttribute('data-igs-combat-docked'), '');
    assert.equal(focused, 1);
    width = 720; sync();
    assert.deepEqual(dock.children, [energy, ring, controls]);
    assert.equal(focused, 1);
    width = 721; sync();
    assert.equal(energy.parentNode, figure);
    assert.deepEqual(figure.children, [energy, ring, controls]);
    assert.equal(controls.parentNode, figure);
    assert.equal(dock.children.length, 0);
    assert.equal(root.getAttribute('data-igs-combat-docked'), null);
    assert.equal(focused, 2);
    assert.deepEqual(p.session.state(), before);
    width = 430; sync();
    assert.equal(root.querySelectorAll('.igs-combat-energy').length, 1);
    assert.equal(root.querySelectorAll('.igs-combat-controls').length, 1);
    assert.equal(root.querySelectorAll('.igs-combat-trait-ring').length, 1);
    p.panel.close();
    assert.equal(disconnected, true);
    assert.doesNotThrow(() => sync());
});

test('面板：点牌先选中不打出；取消按钮、Esc 与再点一次牌撤销，重绘时指针所在的手牌保持抬起；己方牌必须点高亮的承受方才打出；攻击牌点敌人打出', async () => {
    const p = panelHarness();
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    p.panel.invoke('start');
    const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    const count = () => p.session.state().record.actions.length;
    const heroId = p.panel.view().battle.heroId;
    const guard = p.panel.view().battle.hand.find((c) => !c.needsTarget);
    assert.ok(guard, '起手应有不选目标的牌');
    assert.deepEqual(guard.affects, [heroId]);
    const before = count();
    assert.equal(p.panel.invoke('card', guard.inst).reason, 'combat-target-required');
    assert.equal(count(), before);
    assert.equal(p.panel.view().selected, guard.inst);
    assert.match(html(), new RegExp(`class="igs-combat-unit[^"]*is-targetable" data-unit="${heroId}"`));
    assert.match(html(), /data-combat-act="cancel"/);
    assert.equal(p.panel.invoke('cancel').ok, true);
    assert.equal(p.panel.view().selected, null);
    p.panel.invoke('card', guard.inst);
    assert.equal(p.panel.cancelSelection(), true);
    assert.equal(p.panel.view().selected, null);
    assert.equal(p.panel.cancelSelection(), false);
    // 再点一次已选中的牌撤销；重绘时指针（鼠标）所在的手牌带 .is-hover，撤销后仍保持抬起；指针离开或触摸时不带。
    const panelRoot = p.overlay.querySelector('#igs-combat-panel');
    panelRoot.contains = () => true;
    const stub = { getAttribute: (k) => (k === 'data-combat-id' ? String(guard.inst) : null) };
    const over = (pointerType) => ({ pointerType, target: { closest: (sel) => (sel.includes('data-combat-act="card"') ? stub : null) } });
    const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cardCls = () => html().match(new RegExp(`class="([^"]*)" style="[^"]*" data-combat-act="card" data-combat-id="${reEsc(guard.inst)}"`))?.[1] || '';
    panelRoot.fire('pointerover', over('mouse'));
    p.panel.invoke('card', guard.inst);
    assert.match(cardCls(), /is-selected/);
    assert.match(cardCls(), /is-hover/);
    assert.equal(p.panel.invoke('card', guard.inst).reason, 'combat-selection-cleared');
    assert.deepEqual([p.panel.view().selected, count()], [null, before]);
    assert.doesNotMatch(cardCls(), /is-selected/);
    assert.match(cardCls(), /is-hover/);
    panelRoot.fire('pointerout', { relatedTarget: null });
    p.panel.invoke('card', guard.inst);
    assert.doesNotMatch(cardCls(), /is-hover/);
    p.panel.invoke('card', guard.inst);
    panelRoot.fire('pointerover', over('touch'));
    p.panel.invoke('card', guard.inst);
    assert.doesNotMatch(cardCls(), /is-hover/);
    p.panel.invoke('card', guard.inst);
    assert.equal(p.panel.view().selected, null);
    assert.equal(count(), before);
    p.panel.invoke('card', guard.inst);
    assert.equal(p.panel.invoke('target', p.panel.view().battle.enemies[0].id).reason, 'combat-target-invalid');
    assert.equal(count(), before);
    assert.equal(p.panel.invoke('target', heroId).ok, true);
    assert.equal(count(), before + 1);
    const next = p.panel.view().battle.hand.find((c) => !c.needsTarget);
    if (next) {
        p.panel.invoke('card', next.inst);
        assert.equal(p.panel.invoke('target', p.panel.view().battle.enemies[0].id).reason, 'combat-target-invalid');
        assert.equal(p.panel.invoke('target', heroId).ok, true);
        assert.equal(count(), before + 2);
    }
    const atk = p.panel.view().battle.hand.find((c) => c.needsTarget && c.playable);
    if (atk) {
        const n = count();
        p.panel.invoke('card', atk.inst);
        assert.equal(count(), n);
        assert.equal(p.panel.invoke('target', atk.targets[0]).ok, true);
        assert.equal(count(), n + 1);
    }
    // 牌面数字的加成详情：点数字弹出详情，不选中也不打出；点面板其他地方或重绘时收起；牌面不再单列属性要求行。
    const root = p.overlay.querySelector('#igs-combat-panel');
    root.contains = (el) => el === root || root.descendants().includes(el);
    const anchor = p.doc.createElement('span');
    anchor.setAttribute('data-scale-tip', '力量要求 10 · 倍率 ×1.24\n6 → 7（+1）');
    root.querySelector('.igs-combat-body').appendChild(anchor);
    const onTip = { target: { closest: (sel) => (sel === '[data-scale-tip]' ? anchor : null) } };
    const tip = () => root.querySelector('.igs-combat-scale-tip');
    const picked = p.panel.view().selected;
    const acted = count();
    root.fire('click', onTip);
    assert.equal(tip()?.textContent, '力量要求 10 · 倍率 ×1.24\n6 → 7（+1）');
    assert.deepEqual([p.panel.view().selected, count()], [picked, acted]);
    root.fire('click', { target: { closest: () => null } });
    assert.equal(tip(), null);
    root.querySelector('.igs-combat-body').appendChild(anchor);
    root.fire('click', onTip);
    assert.ok(tip());
    p.panel.invoke('cancel');
    assert.equal(tip(), null);
    assert.doesNotMatch(html(), /igs-combat-card-req/);

    p.panel.close();
});

test('拖牌出牌：按住手牌拖过阈值才选中；松在承受方上按点选同一路径打出，随后补发的点击不再选牌；不选目标的牌松在手牌区外也打出；松回手牌区、打出被拒、Esc 与指针取消都撤销选中', async () => {
    const p = panelHarness();
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    p.panel.invoke('start');
    const root = p.overlay.querySelector('#igs-combat-panel');
    root.contains = () => true;
    const count = () => p.session.state().record.actions.length;
    const view = () => p.panel.view();
    const heroId = view().battle.heroId;
    const cardStub = (c) => ({ getAttribute: (k) => ({ 'data-combat-id': String(c.inst), 'data-combat-act': 'card' })[k] ?? null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 150 }) });
    const press = (c) => ({ pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 500, target: { closest: (sel) => (sel.includes('data-combat-act="card"') ? cardStub(c) : null) } });
    const at = (x, y) => ({ pointerId: 1, clientX: x, clientY: y });
    let under = '';
    p.doc.elementFromPoint = () => (under ? { closest: () => ({ getAttribute: () => under }) } : null);
    // 手牌区：x 0–400、y 450–650（按下点 (100,500) 在区内）。
    const handRect = { left: 0, top: 450, width: 400, height: 200 };
    const query = root.querySelector.bind(root);
    root.querySelector = (sel) => (sel === '.igs-combat-hand' ? { getBoundingClientRect: () => handRect } : query(sel));
    const lift = (c) => { root.fire('pointerdown', press(c)); root.fire('pointermove', at(160, 300)); };
    const guard = view().battle.hand.find((c) => !c.needsTarget && c.playable);
    assert.ok(guard, '起手应有不选目标的牌');
    const before = count();

    root.fire('pointerdown', press(guard));
    root.fire('pointermove', at(104, 497));
    assert.equal(view().selected, null);
    root.fire('pointermove', at(160, 300));
    assert.deepEqual([view().selected, root.getAttribute('data-igs-combat-dragging')], [guard.inst, '']);
    // 松回手牌区：撤销，不打出。
    root.fire('pointermove', at(160, 520));
    root.fire('pointerup', at(160, 520));
    assert.deepEqual([view().selected, count(), root.getAttribute('data-igs-combat-dragging')], [null, before, null]);
    root.fire('click', { target: { closest: (sel) => (sel === '[data-combat-act]' ? cardStub(guard) : null) } });
    assert.equal(view().selected, null);

    lift(guard);
    assert.equal(p.panel.cancelSelection(), true);
    root.fire('pointerup', at(160, 300));
    assert.deepEqual([view().selected, count(), root.getAttribute('data-igs-combat-dragging')], [null, before, null]);

    lift(guard);
    root.fire('pointercancel', at(160, 300));
    assert.deepEqual([view().selected, count()], [null, before]);

    lift(guard);
    under = view().battle.enemies[0].id;
    root.fire('pointermove', at(170, 200));
    root.fire('pointerup', at(170, 200));
    assert.deepEqual([view().selected, count()], [null, before]);
    assert.match(view().notice, /\S/);

    lift(guard);
    under = heroId;
    root.fire('pointermove', at(170, 260));
    root.fire('pointerup', at(170, 260));
    assert.deepEqual([view().selected, count()], [null, before + 1]);

    // 空处松手：不选目标的牌拖出手牌区、松在没有角色的地方也打出。
    under = '';
    const loose = view().battle.hand.find((c) => !c.needsTarget && c.playable);
    assert.ok(loose, '还应有不选目标、能打出的牌');
    lift(loose);
    root.fire('pointerup', at(160, 300));
    assert.deepEqual([view().selected, count()], [null, before + 2]);

    const atk = view().battle.hand.find((c) => c.needsTarget && c.playable);
    if (atk) {
        lift(atk);
        under = atk.targets[0];
        root.fire('pointermove', at(200, 120));
        root.fire('pointerup', at(200, 120));
        assert.deepEqual([view().selected, count()], [null, before + 3]);
    }
    p.panel.close();
});

test('主动特性圆球：放在主战者头像框里（觉醒 / 道具列不再放圆球）；拖过阈值按点选选中技能，松在可选目标上发动，松在空处、指针取消与 Esc 撤销；点头像弹出单位详情，点浮层内不收起、点别处或再点头像收起', async () => {
    const { unitDetailView } = await import('../src/visual/igs-ui/combat-panel-model.js');
    const p = panelHarness();
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    p.panel.invoke('start');
    const root = p.overlay.querySelector('#igs-combat-panel');
    root.contains = () => true;
    const body = () => root.querySelector('.igs-combat-body');
    const count = () => p.session.state().record.actions.length;
    const view = () => p.panel.view();
    const heroId = view().battle.heroId;
    const orb = view().battle.traits.find((t) => t.kind === 'active');
    assert.ok(orb?.usable, '起手应有可用的主动特性');

    const html = body().innerHTML;
    const lg = html.indexOf('data-size="lg"');
    const ring = html.indexOf('<div class="igs-combat-trait-ring" role="group" aria-label="主动特性" data-orbs="1">');
    const ctrl = html.indexOf('igs-combat-controls');
    const hand = html.indexOf('igs-combat-hand');
    assert.ok(html.indexOf('igs-combat-hero-figure') >= 0 && lg > 0 && ring > lg && ring < hand && (ctrl < 0 || ring < ctrl), '圆球组紧跟主战者单位块、在头像框里');
    assert.ok(ctrl < 0 || !html.slice(ctrl, hand).includes('igs-combat-trait'), '控件列不再放圆球');
    assert.ok(html.includes(`data-combat-act="unit-info" data-combat-id="${heroId}"`), '主战者头像可点开详情');

    const orbStub = { getAttribute: (k) => ({ 'data-combat-act': 'hero-skill', 'data-combat-id': orb.skillId || '', 'data-trait': orb.id })[k] ?? null,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 44, height: 44 }) };
    const press = { pointerId: 2, isPrimary: true, button: 0, clientX: 100, clientY: 400, target: { closest: (sel) => (sel.includes('data-combat-act="hero-skill"') ? orbStub : null) } };
    const at = (x, y) => ({ pointerId: 2, clientX: x, clientY: y });
    const lift = () => { root.fire('pointerdown', press); root.fire('pointermove', at(160, 250)); };
    let under = '';
    p.doc.elementFromPoint = () => (under ? { closest: () => ({ getAttribute: () => under }) } : null);
    const sel = orb.skillId ? `hero-skill:${orb.skillId}` : 'hero-skill';
    const before = count();

    root.fire('pointerdown', press);
    root.fire('pointermove', at(103, 398));
    assert.equal(view().selected, null);
    root.fire('pointermove', at(160, 250));
    assert.deepEqual([view().selected, root.getAttribute('data-igs-combat-dragging')], [sel, '']);
    root.fire('pointerup', at(160, 250));
    assert.deepEqual([view().selected, count(), root.getAttribute('data-igs-combat-dragging')], [null, before, null]);
    root.fire('click', { target: { closest: (s) => (s === '[data-combat-act]' ? orbStub : null) } });
    assert.equal(view().selected, null);

    lift();
    root.fire('pointercancel', at(160, 250));
    assert.deepEqual([view().selected, count()], [null, before]);
    lift();
    assert.equal(p.panel.cancelSelection(), true);
    root.fire('pointerup', at(160, 250));
    assert.deepEqual([view().selected, count(), root.getAttribute('data-igs-combat-dragging')], [null, before, null]);

    lift();
    under = orb.targets[0] ?? orb.affects[0];
    root.fire('pointermove', at(170, 200));
    root.fire('pointerup', at(170, 200));
    assert.deepEqual([view().selected, count(), p.session.state().record.actions.at(-1).type], [null, before + 1, 'hero-skill']);

    const battle = p.session.state().battle;
    const enemyId = view().battle.enemies[0].id;
    assert.equal(unitDetailView(battle, heroId).name, view().battle.allies.find((u) => u.id === heroId).name);
    assert.ok(unitDetailView(battle, enemyId).groups.some((g) => g.label === '技能'), '敌人详情列出技能');
    assert.equal(unitDetailView(battle, 'nobody'), null);
    const anchor = p.doc.createElement('div');
    anchor.setAttribute('data-unit-info', enemyId);
    body().appendChild(anchor);
    const tip = () => root.querySelector('.igs-combat-scale-tip');
    assert.deepEqual(p.panel.invoke('unit-info', enemyId), { ok: true, reason: 'combat-unit-tip-open' });
    assert.equal(tip()?.className, 'igs-combat-scale-tip is-trait is-unit');
    assert.match(tip().innerHTML, /igs-combat-unit-tip-label">技能</);
    root.fire('click', { target: { closest: (s) => (s === '.igs-combat-scale-tip' ? tip() : null) } });
    assert.ok(tip(), '点浮层内不收起');
    root.fire('click', { target: { closest: () => null } });
    assert.equal(tip(), null);
    p.panel.invoke('unit-info', enemyId);
    assert.deepEqual(p.panel.invoke('unit-info', enemyId), { ok: true, reason: 'combat-unit-tip-closed' });
    assert.equal(tip(), null);
    assert.deepEqual(p.panel.invoke('unit-info', 'nobody'), { ok: false, reason: 'combat-unit-missing' });
    p.panel.close();
});




test('设置：combatExpansion 非法值回到默认，经 normalizeReaderSettings 读入', async () => {
    const { normalizeCombatExpansionSettings } = await import('../src/visual/igs-ui/combat-settings.js');
    const { normalizeReaderSettings } = await import('../src/visual/igs-ui/settings-host-normalize.js');
    const defaults = { enabled: false, difficulty: 'normal', reportDetail: 'normal' };
    assert.deepEqual(normalizeCombatExpansionSettings({ enabled: 'true', difficulty: 'insane', reportDetail: 'full' }), defaults);
    assert.deepEqual(normalizeCombatExpansionSettings(null), defaults);
    assert.deepEqual(normalizeReaderSettings({}).combatExpansion, defaults);
    // 旧设置里的 autoOpen 已取消（翻到开战页总是自动打开），读取时丢弃。
    const kept = { enabled: true, difficulty: 'nightmare', reportDetail: 'brief' };
    assert.deepEqual(normalizeReaderSettings({ combatExpansion: { ...kept, autoOpen: false } }).combatExpansion, kept);
});

test('设置：开启前检查 fail-closed（无数据库、缺接口、独立副 LLM 缺地址或模型）', async () => {
    const { checkCombatExpansionReady } = await import('../src/visual/igs-ui/combat-settings.js');
    const { COMBAT_TABLE_REQUIRED_API } = await import('../src/data/shujuku/combat-tables.js');
    const full = Object.fromEntries(COMBAT_TABLE_REQUIRED_API.map((name) => [name, () => null]));
    assert.equal(checkCombatExpansionReady({ api: null }).reason, 'combat-table-host-unsupported');
    const partial = checkCombatExpansionReady({ api: { ...full, insertRow: undefined } });
    assert.deepEqual([partial.ok, partial.missing], [false, ['insertRow']]);
    const llm = checkCombatExpansionReady({ api: full, autoIllustration: { llm: { source: 'openai', endpoint: '', model: '' } } });
    assert.deepEqual([llm.ok, llm.reason], [false, 'combat-llm-config-incomplete']);
    assert.deepEqual(checkCombatExpansionReady({ api: full, autoIllustration: {} }), { ok: true });
});

test('入口：只在开启、最新 AI 楼末页且末尾有开战标签时出现；翻到即自动打开，调用方打开成功才记入 seen，同一开战楼只弹一次', async () => {
    const { resolveCombatEntry, syncCombatEntry, COMBAT_ENTRY_ID } = await import('../src/visual/igs-ui/combat-entry.js');
    const on = { combatExpansion: { enabled: true } };
    const floor = { isAi: true, isLatest: true, chatId: 'c1', messageId: 1, swipeId: 0, text: '前方有动静。\n[igs-combat:start|狭路|狼]' };
    assert.equal(resolveCombatEntry({ readerSettings: {}, floor, lastPage: true }), null);
    assert.equal(resolveCombatEntry({ readerSettings: on, floor, lastPage: false }), null);
    assert.equal(resolveCombatEntry({ readerSettings: on, floor: { ...floor, isLatest: false }, lastPage: true }), null);
    assert.equal(resolveCombatEntry({ readerSettings: on, floor: { ...floor, text: '[igs-combat:start|狭路|狼]\n后来又说了一句。' }, lastPage: true }), null);
    const entry = resolveCombatEntry({ readerSettings: on, floor, lastPage: true });
    assert.deepEqual([entry.messageId, entry.encounter, 'autoOpen' in entry], [1, '狭路', false]);
    const doc = { createElement: (tag) => new FakeEl(doc, tag) };
    const overlay = new FakeEl(doc, 'div');
    overlay.ownerDocument = doc;
    const seen = new Set();
    let opened = 0;
    const onOpen = () => { opened += 1; };
    assert.equal(syncCombatEntry(overlay, entry, { seen, onOpen }), true);
    // 被其他面板挡住、没打开成功时调用方不记：下一次渲染仍应自动打开；打开成功记入后不再弹。
    assert.equal(syncCombatEntry(overlay, entry, { seen, onOpen }), true);
    seen.add(entry.key);
    assert.equal(syncCombatEntry(overlay, entry, { seen, onOpen }), false);
    overlay.querySelector(`#${COMBAT_ENTRY_ID}`).fire('click', { target: { closest: () => ({}) } });
    assert.equal(opened, 1);
    assert.equal(syncCombatEntry(overlay, null, { seen }), false);
    assert.equal(overlay.querySelector(`#${COMBAT_ENTRY_ID}`), null);
});



test('觉醒：视图给出按钮与台词，用后标记已用；特写为觉醒类，战报写入觉醒类型与台词；无觉醒时视图为 null', async () => {
    const h = combatHarness();
    h.chat[1] = ai('前方有动静。\n[igs-combat:awaken|我|决意|到此为止]\n[igs-combat:start|狭路|狼]');
    await h.session.prepare(1);
    assert.equal(h.session.start().ok, true);
    let st = h.session.state();
    const v = battleView(st.battle, st.legal);
    assert.deepEqual([v.awaken.type, v.awaken.label, v.awaken.line, v.awaken.usable, v.awaken.used], ['resolve', '决意', '到此为止', true, false]);
    assert.match(v.awaken.text, /手牌费用 -1/);
    const r = h.session.act({ type: 'awaken' });
    assert.equal(r.ok, true);
    assert.deepEqual(combatCutins(r.events, r.session.battle).map((c) => [c.kind, c.awakenType, c.line, c.skill]), [['awaken', 'resolve', '到此为止', '决意']]);
    st = h.session.state();
    assert.deepEqual([battleView(st.battle, st.legal).awaken.used, battleView(st.battle, st.legal).awaken.usable], [true, false]);
    for (let i = 0; i < 400 && h.session.state().status === 'battle'; i += 1) {
        const legal = h.session.state().legal;
        assert.equal(h.session.act(legal.find((a) => a.type === 'play') || { type: 'end-turn' }).ok, true);
    }
    assert.equal(h.session.state().status, 'ended');
    assert.equal((await h.session.finish()).ok, true);
    assert.match(h.sent[0], /主角 觉醒：决意『到此为止』/);
    const plain = combatHarness();
    await plain.session.prepare(1);
    plain.session.start();
    const ps = plain.session.state();
    assert.equal(battleView(ps.battle, ps.legal).awaken, null);
});

test('道具选目标（助手 10-30）：回复道具在多名存活己方单位时列出全部可选目标，不带目标时要求选目标，带队友目标得到对应动作；选中态高亮可选单位', async () => {
    const { createBattle, legalActions, seedFor } = await import('../src/combat/engine.js');
    const { BASIC_CARDS } = await import('../src/combat/rules.js');
    const { resolveItem, itemSelection } = await import('../src/visual/igs-ui/combat-panel-model.js');
    const idle = { id: 'idle', name: '蓄势', intent: 'buff', effects: [{ op: 'heal', amount: 1, target: 'self' }] };
    const created = createBattle({ controlledId: 'hero', units: [
        { id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 50, hp: 20, deck: Array(5).fill('basic-defend'), catalog: BASIC_CARDS },
        { id: 'mate', name: '白露', side: 'ally', kind: 'skill', maxHp: 30, hp: 10, skills: [idle] },
        { id: 'foe', name: '狼', side: 'enemy', kind: 'skill', maxHp: 40, skills: [idle] },
    ], items: [{ itemId: 'it-potion', name: '回春丹', count: 1, effects: [{ op: 'heal', amount: 12, target: 'ally' }] }] }, seedFor('chat-1|items'));
    assert.equal(created.ok, true, JSON.stringify(created.error));
    const legal = legalActions(created.state);
    const view = battleView(created.state, legal);
    assert.deepEqual([...view.items[0].targets].sort(), ['hero', 'mate']);
    assert.deepEqual(view.items[0].affects, []);
    assert.equal(resolveItem(legal, 'it-potion').reason, 'combat-target-required');
    assert.deepEqual(resolveItem(legal, 'it-potion', 'mate').action, { type: 'item', itemId: 'it-potion', targetId: 'mate' });
    assert.equal(resolveItem(legal, 'it-potion', 'foe').reason, 'combat-target-invalid');
    const html = renderCombatPanelHtml({ status: 'battle', pending: '', notice: '', controlledId: 'hero', selected: itemSelection('it-potion'), battle: view, portraits: {}, enemyArt: {} });
    assert.match(html, /is-targetable" data-unit="mate"/);
    assert.doesNotMatch(html, /is-targetable" data-unit="foe"/);
});



test('道具栏：点「道具」展开列表与余量，点一项直接使用、不耗能量并收起；同回合再点给出原因；无道具时点「道具」给出原因', async () => {
    const { scanCombatTags } = await import('../src/scene/combat-directives.js');
    const { itemIdFor, ledgerEntryId } = await import('../src/combat/schema.js');
    const p = panelHarness();
    const tags = '[igs-combat:item|我|回春丹|2]';
    p.chat[1] = ai(`前方有动静。${tags}\n[igs-combat:start|狭路|狼]`);
    const [t] = scanCombatTags(tags);
    const anchor = { messageId: 1, swipeId: 0, tagHash: t.tagHash, occurrence: t.occurrence };
    p.tables.ledger.push({ id: ledgerEntryId('item', 'pc-hero', anchor), type: 'item', character: 'pc-hero', anchor,
        payload: { itemId: itemIdFor('回春丹'), name: '回春丹', count: 2, effects: [{ op: 'heal', amount: 12, target: 'self' }], description: '' }, createdAt: 3 });
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    assert.equal(p.panel.invoke('start').ok, true);
    const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    assert.match(html(), /data-combat-act="items" aria-haspopup="menu" aria-expanded="false"/);
    assert.equal(p.panel.invoke('items').ok, true);
    assert.match(html(), /igs-combat-items is-open/);
    assert.match(html(), /data-combat-act="item" data-combat-id="it-/);
    assert.match(html(), /igs-combat-item-count">2</);
    const used = p.panel.invoke('item', itemIdFor('回春丹'));
    assert.equal(used.ok, true);
    assert.ok(used.events.some((e) => e.type === 'item'));
    assert.doesNotMatch(html(), /igs-combat-items is-open/);
    const b = p.panel.view().battle;
    assert.deepEqual([b.energy, b.items[0].count, b.items[0].usable], [3, 1, false]);
    const again = p.panel.invoke('item', itemIdFor('回春丹'));
    assert.deepEqual([again.ok, again.reason], [false, 'combat-item-unusable']);
    assert.match(p.panel.view().notice, /用过道具/);
    p.panel.close();
    const plain = panelHarness();
    plain.panel.open(plain.overlay, { messageId: 1 });
    await until(() => plain.panel.view().status === 'lobby');
    plain.panel.invoke('start');
    assert.doesNotMatch(plain.overlay.querySelector('.igs-combat-body').innerHTML, /data-combat-act="item"/);
    const empty = plain.panel.invoke('items');
    assert.deepEqual([empty.ok, empty.reason], [false, 'combat-items-empty']);
    plain.panel.close();
});


test('面板：手牌有本地卡面时用图，无图或协议被拒时回退线条图标；卡面更新等演出计时结束后才重绘；关闭时退订', async () => {
    let urls = {};
    const listeners = new Set();
    const p = panelHarness({ resolveCardImage: (id) => urls[id] || '', subscribeCardImages: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } });
    const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    assert.equal(listeners.size, 1);
    assert.equal(p.panel.invoke('start').ok, true);
    const hand = p.panel.view().battle.hand;
    assert.ok(hand.every((c) => !Object.hasOwn(c, 'artUrl')));
    assert.doesNotMatch(html(), /igs-combat-card-art"><img/);
    const [a, b] = [...new Set(hand.map((c) => c.id))];
    urls = { [a]: 'data:image/png;base64,QUFB', ...(b ? { [b]: 'javascript:alert(1)' } : {}) };
    for (const fn of [...listeners]) fn();
    assert.doesNotMatch(html(), /igs-combat-card-art"><img/);
    await until(() => { p.timers.advance(1000); return /igs-combat-card-art"><img src="data:image\/png;base64,QUFB"/.test(html()); });
    assert.doesNotMatch(html(), /javascript:/);
    assert.ok(p.panel.view().battle.hand.filter((c) => c.id !== a).every((c) => !c.artUrl));
    p.panel.close();
    assert.equal(listeners.size, 0);
});


test('战斗 cut-in：独立 .igs-combat-cutin-* 命名空间，名称只经 textContent，立绘地址按 CSS 字符串转义；减少动态效果不闪白，无立绘不画分格；裁切不放大到露空', async () => {
    const { buildSkillCutin, buildAwakenCutin, combatCutinCrop, combatEyeCrop, COMBAT_AWAKEN_EYE_MS, COMBAT_CUTIN_MS } = await import('../src/visual/igs-ui/combat-cutin.js');
    const { FALLBACK_HEAD } = await import('../src/visual/igs-ui/fx-anchor.js');
    const doc = { createElement: (tag) => new FakeEl(doc, tag) };
    const probed = { naturalW: 400, naturalH: 800, head: { x: 0.5, top: 0.08, w: 0.25 }, tint: 'rgb(240,212,196)' };
    const el = buildSkillCutin(doc, { name: '<b>林夕</b>', skill: '星落', url: 'https://example.test/a"b\\c.png', probed });
    const classes = [el, ...el.descendants()].flatMap((n) => String(n.className).split(/\s+/).filter(Boolean));
    assert.ok(classes.every((c) => c.startsWith('igs-combat-cutin')), classes.join(' '));
    assert.equal(el.querySelector('.igs-combat-cutin-name').textContent, '<b>林夕</b>');
    assert.equal(el.querySelector('.igs-combat-cutin-name').children.length, 0);
    assert.equal(el.querySelector('.igs-combat-cutin-skill').textContent, '星落');
    const fig = el.querySelector('.igs-combat-cutin-figure');
    assert.equal(fig.getAttribute('data-igs-cutin-focus'), 'bust');
    assert.equal(fig.querySelector('.igs-combat-cutin-portrait').style.backgroundImage, 'url("https://example.test/a\\"b\\\\c.png")');
    assert.equal(el.style.vars['--igs-fx-life'], `${COMBAT_CUTIN_MS.skill}ms`);
    assert.equal(el.style.vars['--igs-combat-cutin-tint'], 'rgb(240,212,196)');
    assert.equal(el.querySelectorAll('.igs-combat-cutin-flash').length, 1);
    const quiet = buildSkillCutin(doc, { name: '林夕', url: '', reduced: true, low: true });
    assert.equal(quiet.className, 'igs-combat-cutin is-reduced is-low');
    assert.equal(quiet.querySelector('.igs-combat-cutin-figure'), null);
    assert.equal(quiet.querySelector('.igs-combat-cutin-flash'), null);
    assert.equal(quiet.querySelector('.igs-combat-cutin-skill').textContent, '林夕');
    assert.equal(quiet.style.vars['--igs-combat-cutin-tint'], undefined);
    assert.equal(combatCutinCrop(null).guessed, true);
    assert.equal(combatCutinCrop({ naturalW: 400, naturalH: 800, head: FALLBACK_HEAD }).guessed, true);
    const bust = combatCutinCrop(probed);
    assert.equal(bust.guessed, false);
    assert.ok([bust.crop.x, bust.crop.y].every((n) => n >= 0 && n <= 100));
    // 同一头位：默认猜测的头位取较宽景（放大倍数更小）。
    assert.ok(combatCutinCrop(null).crop.size < combatCutinCrop({ naturalW: 400, naturalH: 800, head: { ...FALLBACK_HEAD } }).crop.size);
    // 头很宽时放大倍数封顶在整幅图铺满分格宽度（size ≥ 100%），两侧不露空。
    assert.ok(combatCutinCrop({ naturalW: 400, naturalH: 800, head: { x: 0.5, top: 0.02, w: 0.9 } }).crop.size >= 100);
    // 觉醒特写（方案 A）：头位可信时先切眼部斜切条（--aw-lead），默认头位、减少动态效果或没有立绘时不切；减少动态效果不闪白；台词只经 textContent，--n 为字数。
    const aw = buildAwakenCutin(doc, { name: '林夕', skill: '怒火', line: '<i>到此为止</i>', awakenType: 'rage', url: 'https://example.test/a.png', probed });
    assert.equal(aw.getAttribute('data-awaken'), 'rage');
    assert.equal(aw.style.vars['--igs-fx-life'], `${COMBAT_CUTIN_MS.awaken}ms`);
    assert.equal(aw.style.vars['--aw-lead'], `${COMBAT_AWAKEN_EYE_MS}ms`);
    assert.equal(aw.querySelectorAll('.igs-combat-awaken-eye-strip').length, 1);
    assert.equal(aw.querySelectorAll('.igs-combat-cutin-flash').length, 2);
    assert.equal(aw.querySelector('.igs-combat-awaken-kind').textContent, '觉醒·怒火');
    const awLine = aw.querySelector('.igs-combat-awaken-line');
    assert.equal(awLine.textContent, '「<i>到此为止</i>」');
    assert.equal(awLine.children.length, 0);
    assert.equal(awLine.style.vars['--n'], String(Array.from('「<i>到此为止</i>」').length));
    const eyeCrop = combatEyeCrop(probed);
    assert.ok(eyeCrop && [eyeCrop.x, eyeCrop.y].every((n) => n >= 0 && n <= 100));
    assert.equal(combatEyeCrop({ naturalW: 400, naturalH: 800, head: FALLBACK_HEAD }), null);
    const guessedAw = buildAwakenCutin(doc, { name: '林夕', url: 'https://example.test/a.png', probed: { naturalW: 400, naturalH: 800, head: FALLBACK_HEAD } });
    assert.equal(guessedAw.querySelector('.igs-combat-awaken-eye'), null);
    assert.equal(guessedAw.style.vars['--aw-lead'], '0ms');
    const stillAw = buildAwakenCutin(doc, { name: '林夕', url: 'https://example.test/a.png', probed, reduced: true });
    assert.equal(stillAw.querySelector('.igs-combat-awaken-eye'), null);
    assert.equal(stillAw.querySelector('.igs-combat-cutin-flash'), null);
    assert.equal(buildAwakenCutin(doc, { name: '林夕', probed }).querySelector('.igs-combat-cutin-figure'), null);
});

test('面板：人物技能先播 cut-in，命中演出在特写开始淡出时落下，特写到时移除；立绘读不到时按较宽取景；没有立绘时不播特写、命中照旧立即落下', async () => {
    const { COMBAT_CUTIN_MS } = await import('../src/visual/igs-ui/combat-cutin.js');
    let portrait = 'data:image/png;base64,QUFB';
    const p = panelHarness({ resolvePortrait: (name) => (name === '主角' ? portrait : '') });
    const q = (sel) => p.overlay.querySelectorAll(sel);
    const useSkill = () => {
        let r = p.panel.invoke('hero-skill');
        if (!r.ok) { const hs = p.panel.view().battle.heroSkill; r = p.panel.invoke('target', hs.targets[0] ?? hs.affects[0]); }
        assert.equal(r.ok, true);
        return combatFxSource(r.events, r.session.battle, {}).hits.length > 0;
    };
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    assert.equal(p.panel.invoke('start').ok, true);
    p.timers.advance(10000);
    assert.equal(q('.igs-combat-cutin').length, 0);
    let hits = q('.igs-fx-battle-hit').length;
    const expectHit = useSkill();
    // 主角档案没有 heroSkill，按 warrior 原型回落「奋战」（单体伤害），一定有命中演出。
    assert.equal(expectHit, true);
    await until(() => q('.igs-combat-cutin').length === 1);
    const cut = q('.igs-combat-cutin')[0];
    assert.equal(cut.querySelector('.igs-combat-cutin-figure').getAttribute('data-igs-cutin-focus'), 'fallback');
    assert.equal(cut.querySelector('.igs-combat-cutin-name').textContent, '主角');
    assert.match(cut.className, /is-reduced/);
    assert.equal(q('.igs-fx-battle-hit').length, hits);
    p.timers.advance(1500);
    assert.equal(q('.igs-fx-battle-hit').length, hits);
    p.timers.advance(40);
    assert.ok(q('.igs-fx-battle-hit').length > hits);
    assert.ok(cut.parentNode);
    p.timers.advance(COMBAT_CUTIN_MS.skill - 1540 + 1);
    assert.equal(q('.igs-combat-cutin').length, 0);
    portrait = '';
    assert.equal(p.panel.invoke('end-turn').ok, true);
    // 结束回合时上一次人物技能的演出还没播完：敌方阶段的演出排在它之后，和玩家操作一样先等演出锁解开。
    assert.equal(autoBusy(p), true);
    for (let j = 0; j < 400 && autoBusy(p); j += 1) p.timers.advance(100);
    p.timers.advance(20000);
    assert.equal(p.panel.view().status, 'battle');
    hits = q('.igs-fx-battle-hit').length;
    assert.equal(useSkill(), true);
    assert.equal(q('.igs-combat-cutin').length, 0);
    assert.ok(q('.igs-fx-battle-hit').length > hits);
    p.panel.close();
});

test('面板：觉醒特写为放大的半身立绘，减少动态效果时不切眼部斜切条；关闭面板清掉特写节点与计时器，迟到的立绘探测不再挂节点', async () => {
    const setup = async (url) => {
        const p = panelHarness({ resolvePortrait: (name) => (name === '主角' ? url : '') });
        p.chat[1] = ai('前方有动静。\n[igs-combat:awaken|我|决意|到此为止]\n[igs-combat:start|狭路|狼]');
        p.panel.open(p.overlay, { messageId: 1 });
        await until(() => p.panel.view().status === 'lobby');
        assert.equal(p.panel.invoke('start').ok, true);
        p.timers.advance(10000);
        return p;
    };
    const p = await setup('data:image/png;base64,QkJC');
    assert.equal(p.panel.invoke('awaken').ok, true);
    await until(() => p.overlay.querySelectorAll('.igs-combat-awaken-cutin').length === 1);
    const cut = p.overlay.querySelector('.igs-combat-awaken-cutin');
    assert.equal(cut.getAttribute('data-awaken'), 'resolve');
    assert.match(cut.className, /is-reduced/);
    assert.equal(cut.querySelectorAll('.igs-combat-awaken-eye').length, 0);
    assert.match(cut.querySelector('.igs-combat-cutin-figure').className, /is-awaken/);
    assert.equal(cut.querySelector('.igs-combat-awaken-line').textContent, '「到此为止」');
    p.panel.close();
    assert.equal(cut.parentNode, null);
    assert.equal(p.timers.size(), 0);
    const late = await setup('data:image/png;base64,Q0ND');
    const host = late.overlay.querySelector('#igs-fx-front');
    assert.ok(host);
    assert.equal(late.panel.invoke('awaken').ok, true);
    assert.equal(host.querySelectorAll('.igs-combat-awaken-cutin').length, 0);
    late.panel.close();
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
    assert.equal(host.querySelectorAll('.igs-combat-awaken-cutin').length, 0);
    assert.equal(late.timers.size(), 0);
});

test('面板：演出音效经宿主 playSfx 发出——开战遭遇、出牌挥出、命中按世界观取变体；减少动态效果时不出声；开合时经 setBattleMusic 切换战斗音乐', async () => {
    const playAttack = (p) => {
        for (let i = 0; i < 6; i += 1) {
            const atk = p.panel.view().battle.hand.find((c) => c.needsTarget && c.playable);
            if (atk) {
                p.panel.invoke('card', atk.inst);
                assert.equal(p.panel.invoke('target', atk.targets[0]).ok, true);
                return true;
            }
            p.panel.invoke('end-turn');
            p.timers.advance(20000);
        }
        return false;
    };
    const heard = [];
    const music = [];
    const p = panelHarness({ reducedMotion: () => false, playSfx: (kind) => heard.push(kind), getFxSkin: () => ({ worldview: 'magic' }), setBattleMusic: (overlay, on) => music.push([overlay, on]) });
    p.panel.open(p.overlay, { messageId: 1 });
    assert.deepEqual(music, [[p.overlay, true]]);
    await until(() => p.panel.view().status === 'lobby');
    assert.equal(p.panel.invoke('start').ok, true);
    p.timers.advance(10000);
    assert.ok(heard.includes('battle-encounter-magic'), heard.join(','));
    heard.length = 0;
    assert.equal(playAttack(p), true);
    assert.equal(heard[0], 'battle-card');
    p.timers.advance(10000);
    assert.ok(heard.some((k) => /^battle-(hit|crit|ko)(-magic)?$/.test(k)), heard.join(','));
    p.panel.close();
    assert.deepEqual(music, [[p.overlay, true], [p.overlay, false]]);
    const quiet = [];
    const q = panelHarness({ playSfx: (kind) => quiet.push(kind) });
    q.panel.open(q.overlay, { messageId: 1 });
    await until(() => q.panel.view().status === 'lobby');
    assert.equal(q.panel.invoke('start').ok, true);
    q.timers.advance(10000);
    assert.equal(playAttack(q), true);
    q.timers.advance(10000);
    assert.deepEqual(quiet, []);
    q.panel.close();
});


test('打击感：引擎事件按单位分组（掉血 / 全挡 / 治疗 / 获得格挡 / 击倒）；暂存血量依次落笔、保留其他类名；飘字只经 textContent、到时移除；受击反馈到时摘除；影子卡按舞台坐标飞向目标，量不到尺寸或无 WAAPI 时不飞', async () => {
    const fx = await import('../src/visual/igs-ui/combat-hit-fx.js');
    const marks = combatHitMarks([
        { type: 'card', unitId: 'h', name: '斩' },
        { type: 'damage', kind: 'attack', target: 'e1', amount: 9, blocked: 3, hpLoss: 6 },
        { type: 'damage', kind: 'attack', target: 'e2', amount: 4, blocked: 4, hpLoss: 0 },
        { type: 'block', target: 'h', amount: 5 },
        { type: 'heal', target: 'h', amount: 0 },
        { type: 'heal', target: 'h', amount: 7 },
        { type: 'damage', kind: 'poison', target: 'e1', amount: 34, blocked: 0, hpLoss: 34 },
        { type: 'defeated', unitId: 'e1' },
        { type: 'draw', unitId: 'h', count: 1 },
    ]);
    assert.deepEqual(marks, [
        { unitId: 'e1', marks: [{ kind: 'damage', amount: 6 }, { kind: 'damage', amount: 34 }, { kind: 'ko' }] },
        { unitId: 'e2', marks: [{ kind: 'guard', amount: 4 }] },
        { unitId: 'h', marks: [{ kind: 'block', amount: 5 }, { kind: 'heal', amount: 7 }] },
    ]);
    assert.deepEqual(fx.applyHitMarks({ hp: 40, maxHp: 40, alive: true }, marks[0].marks), { hp: 0, maxHp: 40, alive: false });
    assert.deepEqual(fx.applyHitMarks({ hp: 30, maxHp: 40, alive: true }, [{ kind: 'heal', amount: 15 }]), { hp: 40, maxHp: 40, alive: true });

    const doc = { createElement: (tag) => new FakeEl(doc, tag) };
    const unit = doc.createElement('div');
    unit.className = 'igs-combat-unit is-controlled';
    const bar = doc.createElement('div'); bar.className = 'igs-combat-hp';
    const value = doc.createElement('span'); value.className = 'igs-combat-hp-value';
    bar.appendChild(value); unit.appendChild(bar);
    fx.paintUnitHp(unit, { hp: 12, maxHp: 40, alive: true });
    assert.equal(bar.style.vars['--igs-combat-hp'], '30%');
    assert.equal(value.textContent, '12/40');
    assert.equal(unit.className, 'igs-combat-unit is-controlled');
    fx.paintUnitHp(unit, { hp: 0, maxHp: 40, alive: false });
    assert.equal(unit.className, 'igs-combat-unit is-controlled is-down');

    const timers = makeTimers();
    const nodes = fx.showHitFloats(doc, unit, [{ kind: 'damage', amount: 6 }, { kind: 'guard', amount: 4 }, { kind: 'block', amount: 5 }, { kind: 'heal', amount: 7 }, { kind: 'ko' }], { schedule: timers.schedule });
    assert.deepEqual(nodes.map((n) => n.textContent), ['-6', '格挡', '+5 格挡', '+7', '击倒']);
    assert.ok(nodes.every((n) => n.children.length === 0 && n.getAttribute('aria-hidden') === 'true'));
    assert.equal(nodes[1].style.vars['--i'], '1');
    assert.equal(unit.querySelectorAll('.igs-combat-float').length, 5);
    timers.advance(fx.COMBAT_HIT_FLOAT_MS + fx.COMBAT_HIT_FLOAT_STAGGER_MS * 4 - 1);
    assert.equal(unit.querySelectorAll('.igs-combat-float').length, 5);
    timers.advance(1);
    assert.equal(unit.querySelectorAll('.igs-combat-float').length, 0);
    const [still] = fx.showHitFloats(doc, unit, [{ kind: 'heal', amount: 2 }], { reduced: true, schedule: timers.schedule });
    assert.equal(still.className, 'igs-combat-float is-heal is-reduced');

    assert.equal(fx.reactUnit(unit, [{ kind: 'heal', amount: 2 }], { reduced: true, schedule: timers.schedule }), '');
    assert.equal(unit.getAttribute(fx.COMBAT_HIT_REACT_ATTR), null);
    assert.equal(fx.reactUnit(unit, [{ kind: 'block', amount: 5 }, { kind: 'damage', amount: 6 }], { schedule: timers.schedule }), 'hit');
    assert.equal(unit.getAttribute(fx.COMBAT_HIT_REACT_ATTR), 'hit');
    timers.advance(fx.COMBAT_HIT_REACT_MS);
    assert.equal(unit.getAttribute(fx.COMBAT_HIT_REACT_ATTR), null);

    const ldoc = { layout: true, waapi: true, createElement: (tag) => new FakeEl(ldoc, tag) };
    const stage = ldoc.createElement('div');
    stage.rect = { left: 100, top: 50, width: 800, height: 600 };
    const ghost = ldoc.createElement('button');
    const from = { left: 400, top: 500, width: 116, height: 176 };
    const to = { left: 300, top: 120, width: 160, height: 220 };
    assert.equal(fx.launchCardGhost(stage, ghost, from, to, { schedule: timers.schedule }), fx.COMBAT_CARD_FLY_MS);
    assert.equal(ghost.parentNode, stage);
    assert.deepEqual([ghost.style.vars.left, ghost.style.vars.top, ghost.style.vars.width, ghost.style.vars.height], ['300px', '450px', '116px', '176px']);
    const end = ghost.animations[0].frames.at(-1);
    assert.equal(end.transform, 'translate(-78px,-358px) scale(.42) rotate(-10deg)');
    assert.equal(end.opacity, 0);
    timers.advance(fx.COMBAT_CARD_FLY_MS);
    assert.equal(ghost.parentNode, null);
    const plain = doc.createElement('button');
    assert.equal(fx.launchCardGhost(stage, plain, from, to), 0);
    assert.equal(plain.parentNode, null);
    assert.equal(fx.launchCardGhost(stage, ldoc.createElement('button'), from, undefined), 0);
    assert.equal(fx.cloneCardGhost(plain), null);
});


test('敌人图集：基础格随世界观换题材，西幻独有物种在各题材共用西幻格；未知世界观用都市', () => {
    assert.deepEqual(['fantasy', 'magic', 'ancient', 'modern', 'scifi', 'xianxia', ''].map((w) => enemyArtThemeOf(w)), ['western', 'western', 'wuxia', 'urban', 'urban', 'urban', 'urban']);
    assert.deepEqual(enemyArtCell({ art: 'boss-f', worldview: 'ancient' }), { atlas: 'wuxia', x: '100%', y: '50%' });
    assert.deepEqual(enemyArtCell({ art: 'boss-f', worldview: 'fantasy' }), { atlas: 'western', x: '100%', y: '20%' });
    assert.deepEqual(enemyArtCell({ art: 'dragon', worldview: 'modern' }), { atlas: 'western', x: '0%', y: '60%' });
    assert.deepEqual(enemyArtCell({ art: 'dwarf-f', worldview: 'ancient' }), { atlas: 'western', x: '100%', y: '100%' });
    // 本场遭遇题材标注优先于世界观；非法值回落世界观；西幻独有格不受标注影响。
    assert.deepEqual(enemyArtCell({ name: '神秘水贼', tier: 'normal', worldview: 'modern', theme: 'wuxia' }), enemyArtCell({ name: '神秘水贼', tier: 'normal', worldview: 'ancient' }));
    assert.equal(enemyArtCell({ art: 'grunt-m', worldview: 'ancient', theme: 'bogus' }).atlas, 'wuxia');
    assert.equal(enemyArtCell({ art: 'dragon', worldview: 'ancient', theme: 'urban' }).atlas, 'western');
});

test('面板：素材库立绘优先；没有立绘的敌人在战前、对局与行动条用通用图集一格，题材随世界观，我方不取图集', async () => {
    let worldview = 'ancient';
    const p = panelHarness({ resolvePortrait: () => '', getFxSkin: () => ({ worldview }) });
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    assert.deepEqual(p.panel.view().enemyArt, { 狼: { atlas: 'wuxia', x: '0%', y: '100%' } });
    assert.match(html(), /<span class="igs-combat-art" data-atlas="wuxia" style="--ea-x:0%;--ea-y:100%" aria-hidden="true">/);
    assert.equal((html().match(/<svg viewBox="0 0 100 120"/g) || []).length, 1);
    worldview = 'fantasy';
    assert.equal(p.panel.invoke('start').ok, true);
    const b = p.panel.view().battle;
    assert.equal(b.enemies[0].art, 'beast');
    assert.equal(Object.hasOwn(b.allies[0], 'art'), false);
    assert.equal((html().match(/data-atlas="western" style="--ea-x:0%;--ea-y:40%"/g) || []).length, 2);
    p.panel.close();
    const q = panelHarness();
    q.panel.open(q.overlay, { messageId: 1 });
    await until(() => q.panel.view().status === 'lobby');
    assert.deepEqual(q.panel.view().enemyArt, {});
    assert.doesNotMatch(q.overlay.querySelector('.igs-combat-body').innerHTML, /igs-combat-art/);
    q.panel.close();
});

test('稀有度演出：分级、降级与节点生命周期；抽牌不挂光效', async () => {
    const fx = await import('../src/visual/igs-ui/combat-hit-fx.js');
    assert.deepEqual(['basic', 'common', 'uncommon', 'personal', 'rare', 'epic', 'mythic', 'signature', 'constructor'].map(r => fx.cardRarityFx(r).rank), [0, 0, 0, 0, 1, 2, 3, 3, 0]);
    for (const rarity of ['rare', 'epic', 'mythic', 'signature']) {
        const still = fx.cardRarityFx(rarity, { reduced: true });
        assert.deepEqual([still.hold, still.life, still.banner, still.trail, still.particles, still.shake, still.floatScale, still.sfx], [0, 0, false, false, false, 0, 1, '']);
        const low = fx.cardRarityFx(rarity, { low: true });
        assert.deepEqual([low.trail, low.particles, low.shake, low.hold > 0], [false, false, 0, true]);
    }
    const { BATTLE_SFX_PARTIALS } = await import('../src/visual/igs-ui/fx-battle-sfx.js');
    const tiers = ['rare', 'epic', 'mythic', 'signature'].map(r => fx.cardRarityFx(r));
    assert.deepEqual(tiers.map(t => [t.hold, t.shake, t.life, t.banner]), [[50, 3, 600, false], [90, 5, 750, false], [120, 8, 900, true], [120, 8, 900, true]]);
    assert.ok(tiers.every(t => BATTLE_SFX_PARTIALS[t.sfx]));
    assert.equal(fx.cardRarityFx('common').sfx, '');
    assert.equal('drawnCards' in fx, false);
    const battle = { controlledId: 'h', catalog: { h: { a: { name: '<卡名>', rarity: 'mythic' } } } };
    const rarity = fx.playedCardFx([{ type: 'card', unitId: 'h', cardId: 'a' }], battle);
    assert.deepEqual([rarity.unitId, rarity.strike.form], ['h', 'slash']);
    const timers = makeTimers(), doc = { createElement: tag => new FakeEl(doc, tag) }, host = doc.createElement('div');
    const [banner] = fx.showRarityFx(doc, host, rarity, 'play', { schedule: timers.schedule });
    assert.equal(banner.textContent, '<卡名>');
    assert.equal(banner.children.length, 0);
    assert.deepEqual(fx.showRarityFx(doc, host, rarity, 'draw', { schedule: timers.schedule }), []);
    const [hit] = fx.showRarityFx(doc, host, rarity, 'hit', { schedule: timers.schedule });
    assert.equal(hit.querySelectorAll('.igs-combat-rarity-spark').length, 8);
    assert.equal(hit.querySelectorAll('.igs-combat-strike').length, 1);
    assert.equal(hit.getAttribute('data-strike'), 'slash');
    assert.equal(hit.style.vars['--strike'], rarity.strike.color);
    const rare = fx.cardRarityFx('rare');
    assert.equal(fx.showRarityFx(doc, host, rare, 'hit', { schedule: timers.schedule }).length, 1);
    assert.deepEqual(fx.showRarityFx(doc, host, rare, 'play', { schedule: timers.schedule }), []);
    assert.deepEqual(fx.showRarityFx(doc, host, fx.cardRarityFx('common'), 'hit', { schedule: timers.schedule }), []);
    for (const mode of [{ low: true }, { reduced: true }]) {
        const [el] = fx.showRarityFx(doc, host, { ...fx.cardRarityFx('mythic', mode), strike: rarity.strike }, 'hit', { schedule: timers.schedule });
        assert.equal(el.children.length, 0);
        assert.equal(el.getAttribute('data-strike'), null);
    }
    // 基础命中：没有稀有及以上的卡时取第一个出手动作（这里是敌方技能）的形态，只画主图形，不停顿、不出声；减少动态效果与低画质不挂。
    const skillBattle = { units: { w: { skills: [{ id: 's1', name: '撕咬', effects: [{ op: 'damage', amount: 5 }] }] } } };
    const bite = fx.playedCardFx([{ type: 'skill', unitId: 'w', skillId: 's1', name: '撕咬' }], skillBattle);
    assert.deepEqual([bite.rank, bite.unitId, bite.strike.form, bite.strike.delivery, bite.hold, bite.sfx], [0, 'w', 'slash', 'melee', 0, '']);
    const [basic] = fx.showRarityFx(doc, host, bite, 'hit', { schedule: timers.schedule });
    assert.equal(basic.className, 'igs-combat-rarity-fx is-hit is-rank-0');
    assert.deepEqual([basic.querySelectorAll('.igs-combat-strike').length, basic.querySelectorAll('.igs-combat-rarity-spark').length, basic.style.vars['--rar']], [1, 0, undefined]);
    assert.deepEqual(fx.showRarityFx(doc, host, bite, 'play', { schedule: timers.schedule }), []);
    assert.deepEqual(fx.showRarityFx(doc, host, { ...fx.cardRarityFx('', { low: true }), strike: bite.strike }, 'hit', { schedule: timers.schedule }), []);
    // 前摇：单体近战没有；远程为射击（每道弹道末端一枚锁定准星）、施法为吟唱，范围攻击近战为横扫；
    // 范围射击每个受击单位一道弹道，量不到受击单位时扇形三道；减少动态效果与低画质没有前摇。
    const { cardStrike } = await import('../src/visual/igs-ui/combat-strike.js');
    const all = [{ op: 'damage', amount: 4, target: 'all-enemies' }];
    const lead = (card, rank = 0) => fx.windupFx({ rank, strike: cardStrike(card) });
    assert.equal(fx.windupFx(bite), null);
    assert.deepEqual(['霰弹枪', '奥术飞弹'].map((name) => lead({ name, effects: [{ op: 'damage', amount: 6 }] }).kind), ['shot', 'cast']);
    assert.deepEqual([lead({ name: '横扫', effects: all }).kind, lead({ name: '横扫', effects: all }).aoe], ['sweep', true]);
    assert.equal(fx.windupFx({ ...fx.cardRarityFx('', { reduced: true }), strike: cardStrike({ name: '霰弹枪' }) }), null);
    assert.equal(fx.windupFx({ ...fx.cardRarityFx('', { low: true }), strike: cardStrike({ name: '霰弹枪' }) }), null);
    const [shot] = fx.showWindupFx(doc, host, lead({ name: '霰弹枪' }),{ angle: -60, reach: 240, schedule: timers.schedule });
    assert.deepEqual([shot.className, shot.querySelectorAll('.igs-combat-windup-ray').length, shot.style.vars['--aim'], shot.style.vars['--reach']], ['igs-combat-windup is-shot is-rank-0', 1, '-60deg', '240px']);
    assert.deepEqual([shot.querySelectorAll('.igs-combat-windup-lock').length, shot.style.vars['--impact'], shot.style.vars['--life']], [1, `${fx.COMBAT_WINDUP_MS.shot}ms`, `${fx.COMBAT_WINDUP_MS.shot + 180}ms`]);
    const [volley] = fx.showWindupFx(doc, host, lead({ name: '箭雨', effects: all }, 2), { schedule: timers.schedule });
    assert.deepEqual([volley.className, volley.querySelectorAll('.igs-combat-windup-ray').length, volley.style.vars['--reach']], ['igs-combat-windup is-shot is-aoe is-rank-2', 3, undefined]);
    const [aimed] = fx.showWindupFx(doc, host, lead({ name: '箭雨', effects: all }, 2), { angle: -90, reach: 200, rays: [{ angle: -120, reach: 210 }, { angle: -60, reach: 230 }], schedule: timers.schedule });
    const rays = aimed.querySelectorAll('.igs-combat-windup-ray');
    assert.deepEqual(rays.map((r) => [r.style.vars['--aim'], r.style.vars['--reach'], r.style.vars['--turn']]), [['-120deg', '210px', undefined], ['-60deg', '230px', undefined]]);
    assert.equal(aimed.querySelectorAll('.igs-combat-windup-lock').length, 2);
    // 多段射击一段一道弹道，按段错开（--wave），节点总时长加上最晚一道的错开时长。
    const [staggered] = fx.showWindupFx(doc, host, lead({ name: '连射' }), { rays: [{ angle: -100, reach: 200 }, { angle: -80, reach: 220, delay: 280 }, { angle: -100, reach: 200, delay: 560 }], schedule: timers.schedule });
    assert.deepEqual([staggered.style.vars['--life'], staggered.querySelectorAll('.igs-combat-windup-ray').map((r) => r.style.vars['--wave'])], [`${fx.COMBAT_WINDUP_MS.shot + 180 + 560}ms`, [undefined, '280ms', '560ms']]);
    const [circle] = fx.showWindupFx(doc, host, lead({ name: '奥术飞弹' }), { schedule: timers.schedule });
    assert.deepEqual([circle.className, circle.children.length, circle.style.vars['--life']], ['igs-combat-windup is-cast is-rank-0', 0, `${fx.COMBAT_WINDUP_MS.cast + 180}ms`]);
    timers.advance(1200);
    assert.equal(host.children.length, 0);
});

test('命中形态：卡名、风味与效果说明关键词模糊匹配，以末字定性、同位取长词；匹配不到按要求属性兜底；元素只换配色', async () => {
    const { cardStrike, STRIKE_ELEMENT_COLORS, STRIKE_FORM_COLORS } = await import('../src/visual/igs-ui/combat-strike.js');
    const dmg = [{ op: 'damage', amount: 6 }];
    const of = (name, extra = {}) => { const s = cardStrike({ name, effects: dmg, ...extra }); return [s.form, s.element]; };
    assert.deepEqual(of('火焰拳'), ['blunt', 'fire']);
    assert.deepEqual(of('爆裂斩'), ['slash', '']);
    assert.deepEqual(of('霜刃'), ['slash', 'ice']);
    assert.deepEqual(of('霰弹枪'), ['gun', '']);
    assert.deepEqual(of('红缨枪'), ['slash', '']);
    assert.deepEqual(of('火箭炮'), ['blast', 'fire']);
    assert.deepEqual(of('手雷'), ['blast', '']);
    assert.deepEqual(of('诅咒之言'), ['curse', '']);
    assert.deepEqual(of('奥术飞弹'), ['arcane', '']);
    assert.deepEqual(of('雷霆'), ['arcane', 'thunder']);
    assert.deepEqual(of('冰锥', { flavor: '烈火' }), ['arcane', 'ice']);
    assert.deepEqual(of('无名一式', { scaling: { ability: 'str' } }), ['blunt', '']);
    assert.deepEqual(of('无名一式', { scaling: { ability: 'dex' } }), ['slash', '']);
    assert.deepEqual(of('无名一式'), ['slash', '']);
    assert.deepEqual(of('阴招', { effects: [{ op: 'status', status: 'poison', stacks: 3 }], scaling: { ability: 'cha' } }), ['curse', 'poison']);
    assert.equal(cardStrike({ name: '火焰拳' }).color, STRIKE_ELEMENT_COLORS.fire);
    assert.equal(cardStrike({ name: '爆裂斩' }).color, STRIKE_FORM_COLORS.slash);
    // 出手方式：近战（拳、长兵）、远程（枪、爆炸、弓箭）、施法（咒术、法术，含只有元素的招式）；范围攻击看效果是否打全体敌人（含条件分支）。
    const via = (name, effects = dmg) => { const s = cardStrike({ name, effects }); return [s.delivery, s.aoe]; };
    assert.deepEqual(['火焰拳', '红缨枪', '霰弹枪', '手雷', '穿云箭', '诅咒之言', '奥术飞弹', '雷霆'].map((n) => via(n)[0]), ['melee', 'melee', 'ranged', 'ranged', 'ranged', 'spell', 'spell', 'spell']);
    assert.deepEqual(via('横扫', [{ op: 'damage', amount: 4, target: 'all-enemies' }]), ['melee', true]);
    assert.deepEqual(via('连环', [{ op: 'conditional', when: { kind: 'hp-below', value: 50 }, then: [{ op: 'status', status: 'weak', stacks: 1, target: 'all-enemies' }] }]), ['melee', true]);
    assert.deepEqual(via('无名一式', [{ op: 'damage', amount: 6, target: 'random-enemy' }]), ['melee', false]);
});

test('高稀有度出牌：攻击牌只给招式条上色，命中首帧停顿后定向震屏；没有命中的牌才出中间横幅；己方出牌不加演出锁，演出结束与关闭时清理', async () => {
    for (const reduced of [false, true]) {
        const p = panelHarness({ reducedMotion: () => reduced });
        p.panel.open(p.overlay, { messageId: 1 });
        await until(() => p.panel.view().status === 'lobby');
        assert.equal(p.panel.invoke('start').ok, true);
        p.timers.advance(10000);
        // 每次取会话当前快照：动作结算后战斗状态可能换成新对象，旧快照上的改动不会进入下一次结算。
        const mythic = (c) => { const b = p.session.state().battle; const ref = b.cards[c.inst]; b.catalog[ref.owner][ref.cardId].rarity = 'mythic'; };
        const card = p.panel.view().battle.hand.find(c => c.playable && c.type === 'attack');
        assert.ok(card);
        mythic(card);
        p.panel.invoke('card', card.inst);
        assert.equal(p.panel.invoke('target', card.targets[0]).ok, true);
        const root = p.overlay.querySelector('#igs-combat-panel');
        const stage = p.overlay.querySelector('.igs-combat-fx');
        assert.equal(root.getAttribute('data-igs-combat-auto'), null);
        assert.equal(stage.getAttribute('data-igs-rarity'), 'mythic');
        const seen = [...p.overlay.querySelectorAll('.igs-combat-rarity-fx')];
        assert.equal(seen.filter(n => n.className.includes('is-play')).length, 0);
        if (!reduced) {
            let waited = 0;
            while (root.getAttribute('data-igs-combat-hold') === null && waited < 3000) { p.timers.advance(10); waited += 10; }
            assert.equal(root.getAttribute('data-igs-combat-hold'), '');
            assert.equal(root.getAttribute('data-igs-combat-shake'), null);
            p.timers.advance(120);
            assert.equal(root.getAttribute('data-igs-combat-hold'), null);
            assert.equal(root.getAttribute('data-igs-combat-shake'), '3');
            p.timers.advance(20000);
            assert.equal(root.getAttribute('data-igs-combat-auto'), null);
            assert.equal(root.getAttribute('data-igs-combat-shake'), null);
            assert.equal(p.overlay.querySelectorAll('.igs-combat-rarity-fx').length, 0);
            assert.equal(stage.getAttribute('data-igs-rarity'), null);
        } else {
            // 演出按出牌顺序逐条播放：减少动态效果时攻击牌的时间轴同样还在播，等它播完再出下一张。
            p.timers.advance(20000);
        }
        const guard = p.panel.view().battle.hand.find(c => c.playable && !c.needsTarget);
        assert.ok(guard);
        mythic(guard);
        p.panel.invoke('card', guard.inst);
        assert.equal(p.panel.invoke('target', p.panel.view().battle.heroId).ok, true);
        const plays = p.overlay.querySelectorAll('.igs-combat-rarity-fx').filter(n => n.className.includes('is-play'));
        assert.equal(plays.length, reduced ? 0 : 1);
        assert.equal(stage.getAttribute('data-igs-rarity'), null);
        seen.push(...plays);
        p.panel.close();
        assert.equal(p.timers.size(), 0);
        assert.ok(seen.every(n => !n.parentNode));
        p.panel.open(p.overlay, { messageId: 1 });
        assert.equal(p.overlay.querySelector('#igs-combat-panel').getAttribute('data-igs-combat-auto'), null);
        p.panel.close();
    }
});


test('多段与范围攻击：同一次出手的各段并成一招，同一段各目标同时落下、各段依次落下；击倒取上一次伤害的段号', async () => {
    const { combatLandings, volleyTargets, COMBAT_VOLLEY_GAP_MS } = await import('../src/visual/igs-ui/combat-panel-model.js');
    const { planBattleFx } = await import('../src/visual/igs-ui/fx-battle-model.js');
    const state = { controlledId: 'h', units: { h: { name: '主角' }, a: { name: '狼' }, b: { name: '狼' } } };
    const plan = (fx) => planBattleFx(fx, { settings: { enabled: true, letterbox: false } });
    const sweep = [
        { type: 'card', unitId: 'h', name: '横扫千军' },
        { type: 'damage', kind: 'attack', target: 'a', amount: 5, blocked: 0, hpLoss: 5, strike: 1 },
        { type: 'damage', kind: 'attack', target: 'b', amount: 5, blocked: 0, hpLoss: 5, strike: 1 },
        { type: 'defeated', unitId: 'b' },
    ];
    const fxA = combatFxSource(sweep, state);
    assert.deepEqual(fxA.hits, [{ attacker: '主角', target: '狼', skill: '横扫千军', result: 'ko', strikes: [1] }]);
    const landA = combatLandings(fxA, plan(fxA));
    assert.deepEqual([[...landA.strikes.keys()], landA.extra, landA.named.length], [[1], 0, 0]);
    assert.deepEqual(combatHitMarks(sweep), [
        { unitId: 'a', marks: [{ kind: 'damage', amount: 5, strike: 1 }] },
        { unitId: 'b', marks: [{ kind: 'damage', amount: 5, strike: 1 }, { kind: 'ko', strike: 1 }] },
    ]);
    const scatter = [
        { type: 'card', unitId: 'h', name: '散射' },
        { type: 'damage', kind: 'attack', target: 'a', amount: 2, blocked: 0, hpLoss: 2, strike: 1 },
        { type: 'damage', kind: 'attack', target: 'b', amount: 2, blocked: 2, hpLoss: 0, strike: 2 },
        { type: 'damage', kind: 'attack', target: 'a', amount: 2, blocked: 0, hpLoss: 2, strike: 3 },
    ];
    const fxB = combatFxSource(scatter, state);
    assert.deepEqual(fxB.hits.map((h) => [h.result, h.strikes]), [['hit', [1, 2, 3]]]);
    const landB = combatLandings(fxB, plan(fxB));
    const base = landB.strikes.get(1).at;
    assert.deepEqual([...landB.strikes].map(([n, w]) => [n, w.at - base, w.first]), [[1, 0, true], [2, COMBAT_VOLLEY_GAP_MS, false], [3, COMBAT_VOLLEY_GAP_MS * 2, false]]);
    assert.equal(landB.extra, COMBAT_VOLLEY_GAP_MS * 2);
    assert.deepEqual(combatHitMarks(scatter).map((g) => [g.unitId, g.marks.map((m) => `${m.kind}${m.strike}`)]), [['a', ['damage1', 'damage3']], ['b', ['guard2']]]);
    // 随机目标多段：弹道按落下先后一段一道；只有一段（范围攻击）时为空，面板按受击单位各一道同时到达。
    assert.deepEqual(volleyTargets(combatHitMarks(scatter), landB, 'h'), [{ unitId: 'a', strike: 1, delay: 0 }, { unitId: 'b', strike: 2, delay: COMBAT_VOLLEY_GAP_MS }, { unitId: 'a', strike: 3, delay: COMBAT_VOLLEY_GAP_MS * 2 }]);
    assert.deepEqual(volleyTargets(combatHitMarks(sweep), landA, 'h'), []);
    // 没有段号的变化（治疗等）仍按目标各出一招，按名字认领落点。
    const fxC = combatFxSource([{ type: 'card', unitId: 'h', name: '包扎' }, { type: 'heal', target: 'h', amount: 4 }], state);
    assert.deepEqual(fxC.hits, [{ attacker: '主角', target: '主角', skill: '包扎', result: 'heal' }]);
    const landC = combatLandings(fxC, plan(fxC));
    assert.deepEqual([landC.strikes.size, landC.named.map((h) => h.target)], [0, ['主角']]);
});


test('演出二倍速：右上角按钮切换并记住；二倍速时演出计时减半，演出进行中也能切换；关闭后不留计时器', async () => {
    const memory = (init) => {
        const m = new Map(init ? [['igs:combat-fx-speed:v1', init]] : []);
        return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, get: () => m.get('igs:combat-fx-speed:v1') ?? null };
    };
    const run = async (storage) => {
        const delays = [];
        const p = panelHarness({ storage, schedule: (fn, ms) => { delays.push(ms); return p.timers.schedule(fn, ms); } });
        p.panel.open(p.overlay, { messageId: 1 });
        await until(() => p.panel.view().status === 'lobby');
        const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
        assert.doesNotMatch(html(), /data-combat-act="speed"/);
        assert.equal(p.panel.invoke('start').ok, true);
        for (let j = 0; j < 400 && autoBusy(p); j += 1) p.timers.advance(100);
        p.timers.advance(6000);
        const head = html().match(/<button[^>]*data-combat-act="speed"[^>]*>/)?.[0] || '';
        const card = p.panel.view().battle.hand.find((c) => c.playable && c.type === 'attack');
        delays.length = 0;
        if (!p.panel.invoke('card', card.inst).ok) p.panel.invoke('target', card.targets[0]);
        return { p, head, played: delays.slice(), storage };
    };
    const slow = await run(memory());
    const fast = await run(memory('2'));
    assert.match(slow.head, /aria-pressed="false"/);
    assert.match(fast.head, /aria-pressed="true"/);
    assert.deepEqual([slow.p.panel.view().fxSpeed, fast.p.panel.view().fxSpeed], [undefined, 2]);
    assert.ok(slow.played.length > 0);
    assert.deepEqual(fast.played, slow.played.map((t) => (Number.isFinite(t) ? Math.round(t / 2) : t)));
    // 演出进行中（自动行动演出锁）也能切换，切换后记住；其余动作照旧被锁拒绝。
    slow.p.panel.invoke('end-turn');
    assert.equal(autoBusy(slow.p), true);
    assert.deepEqual(slow.p.panel.invoke('speed'), { ok: true, speed: 2 });
    assert.deepEqual([slow.storage.get(), slow.p.panel.view().fxSpeed], ['2', 2]);
    assert.equal(slow.p.panel.invoke('end-turn').reason, 'combat-busy');
    assert.deepEqual(slow.p.panel.invoke('speed'), { ok: true, speed: 1 });
    assert.equal(slow.storage.get(), '1');
    for (const { p } of [slow, fast]) { p.panel.close(); assert.equal(p.timers.size(), 0); }
    assert.equal(slow.p.panel.invoke('speed').reason, 'combat-panel-closed');
});

test('连续出牌：己方出牌不加演出锁，上一张的演出没播完也能出下一张；结束回合立即加锁，队友与敌方阶段的演出排在己方演出之后', async () => {
    const run = async (immediate) => {
        const p = panelHarness({ reducedMotion: () => false });
        p.panel.open(p.overlay, { messageId: 1 });
        await until(() => p.panel.view().status === 'lobby');
        assert.equal(p.panel.invoke('start').ok, true);
        p.timers.advance(10000);
        const hand = () => p.panel.view().battle.hand;
        const play = (c) => {
            let r = p.panel.invoke('card', c.inst);
            if (hand().some((h) => h.inst === c.inst)) r = p.panel.invoke('target', c.targets[0] ?? c.affects[0]);
            return r;
        };
        const a = hand().find((c) => c.playable && c.type === 'attack');
        assert.ok(a);
        const battle = p.session.state().battle;
        const ref = battle.cards[a.inst];
        battle.catalog[ref.owner][ref.cardId].rarity = 'mythic';
        assert.equal(play(a).ok, true);
        assert.equal(autoBusy(p), false);
        if (!immediate) p.timers.advance(20000);
        const b = hand().find((c) => c.playable);
        assert.ok(b);
        assert.equal(play(b).ok, true);
        if (!immediate) p.timers.advance(20000);
        assert.equal(p.panel.invoke('end-turn').ok, true);
        assert.equal(autoBusy(p), true);
        let locked = 0;
        while (autoBusy(p) && locked < 60000) { p.timers.advance(50); locked += 50; }
        assert.equal(autoBusy(p), false);
        p.panel.close();
        assert.equal(p.timers.size(), 0);
        return locked;
    };
    const waited = await run(false);
    const queued = await run(true);
    // 结束回合时己方两张牌还没交棒：队友与敌方阶段的演出等它们依次交棒（最后一次命中落下、停顿后再隔 COMBAT_CHAIN_MS）才开始，演出锁相应更久；
    // 不再等招式条整段放完，多出的时长不超过两次交棒。已经播完时照常立即开始。
    assert.ok(queued - waited >= COMBAT_CHAIN_MS && queued - waited <= 2 * (COMBAT_CHAIN_MS + 400), `${queued} vs ${waited}`);
});

test('连续出牌衔接：排队的下一张在上一张最后一次命中落下后隔 COMBAT_CHAIN_MS 开始结算，不等上一张的招式条放完；二倍速时衔接减半', async () => {
    const run = async (speed) => {
        const p = panelHarness({ reducedMotion: () => false });
        p.panel.open(p.overlay, { messageId: 1 });
        await until(() => p.panel.view().status === 'lobby');
        assert.equal(p.panel.invoke('start').ok, true);
        p.timers.advance(20000);
        if (speed > 1) assert.equal(p.panel.invoke('speed').speed, speed);
        const b = p.session.state().battle;
        const foeId = b.order.find((id) => b.units[id].side === 'enemy');
        // 全部换成普通稀有度的单体近战攻击：没有前摇与停顿，命中在出手时刻落下。
        for (const def of Object.values(b.catalog[b.controlledId])) Object.assign(def, { name: '斩击', type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6, target: 'enemy' }] });
        const foeHp = () => p.panel.view().battle.enemies.find((u) => u.id === foeId).hp;
        const play = () => { const c = p.panel.view().battle.hand.find((h) => h.playable); p.panel.invoke('card', c.inst); return p.panel.invoke('target', foeId); };
        const before = foeHp();
        for (let i = 0; i < 3; i += 1) assert.equal(play().ok, true);
        let last = foeHp();
        const drops = last < before ? [0] : [];
        for (let t = 10; t <= 5000; t += 10) {
            p.timers.advance(10);
            const hp = foeHp();
            if (hp < last) { drops.push(t); last = hp; }
        }
        assert.equal(last, before - 18);
        p.panel.close();
        assert.equal(p.timers.size(), 0);
        return drops;
    };
    assert.deepEqual(await run(1), [0, COMBAT_CHAIN_MS, 2 * COMBAT_CHAIN_MS]);
    assert.deepEqual(await run(2), [0, COMBAT_CHAIN_MS / 2, COMBAT_CHAIN_MS]);
});


test('拼手速连续出牌：演出按出牌顺序逐张播放；鞭尸期间被击倒的敌人仍显示存活、可再选为目标，全部演出放完才倒下；全灭后停顿自动结束回合判胜；中途关面板重开照常收尾；结算画面出成就牌子', async () => {
    const setup = async (extra = {}) => {
        const p = panelHarness({ reducedMotion: () => false, ...extra });
        p.panel.open(p.overlay, { messageId: 1 });
        await until(() => p.panel.view().status === 'lobby');
        assert.equal(p.panel.invoke('start').ok, true);
        p.timers.advance(20000);
        const b = p.session.state().battle;
        assert.equal(b.overkill, true);
        const foeId = b.order.find((id) => b.units[id].side === 'enemy');
        b.units[foeId].hp = 1;
        for (const def of Object.values(b.catalog[b.controlledId])) { def.type = 'attack'; def.cost = 1; def.effects = [{ op: 'damage', amount: 6, target: 'enemy' }]; }
        const play = () => { const c = p.panel.view().battle.hand.find((h) => h.playable); p.panel.invoke('card', c.inst); return p.panel.invoke('target', foeId); };
        const foe = () => p.panel.view().battle.enemies.find((u) => u.id === foeId);
        return { p, foeId, play, foe };
    };
    const heard = [];
    const { p, foeId, play, foe } = await setup({ playSfx: (k) => heard.push(k) });
    heard.length = 0;
    assert.equal(play().ok, true);
    assert.deepEqual([p.session.state().status, p.session.state().battle.units[foeId].alive, foe().alive], ['battle', false, true]);
    assert.equal(play().ok, true);
    // 出手即反馈：两张牌各自立即一声挥出（影子卡同时飞出），特效与伤害排队依次结算。
    assert.equal(heard.filter((k) => k === 'battle-card').length, 2);
    let t = 0; let down = -1; let ended = -1; let busyInBeat = false;
    while (t < 30000 && (ended < 0 || p.panel.view().settling)) {
        p.timers.advance(50); t += 50;
        if (down < 0 && foe() && !foe().alive) down = t;
        if (down >= 0 && ended < 0 && autoBusy(p)) busyInBeat = true;
        if (ended < 0 && p.session.state().status === 'ended') ended = t;
    }
    assert.ok(down > 0 && ended > down, `${down} ${ended}`);
    assert.ok(ended - down >= 600, `${down} → ${ended}`);
    assert.equal(busyInBeat, true);
    const v = p.panel.view();
    assert.deepEqual([v.end.outcome, v.end.feats, v.settling], ['victory', undefined, undefined]);
    const heroId = p.session.state().battle.controlledId;
    const src = { unitId: heroId, kind: 'card', id: 'x' };
    const whip = (n) => [{ type: 'card', unitId: heroId, name: 'x' }, ...Array.from({ length: n }, (_, i) => ({ type: 'damage', kind: 'attack', source: src, target: foeId, amount: 6, blocked: 0, hpLoss: 0, overkill: true, strike: i + 1 }))];
    const events = [{ type: 'card', unitId: heroId, name: 'x' }, { type: 'damage', kind: 'attack', source: src, target: foeId, amount: 4, blocked: 3, hpLoss: 1, strike: 1 }, { type: 'defeated', unitId: foeId }, ...whip(3), ...whip(3)];
    const end = endView(p.session.state().battle, events);
    assert.deepEqual(end.feats.map((f) => [f.id, f.hits, f.title, f.line]), [['honor-kill', undefined, '荣誉击杀', '计划通り——最后一滴血，分毫不差。'], ['overkill', 6, '超杀', '堕落，忙死他卡多！']]);
    const html = renderCombatPanelHtml({ ...v, end });
    assert.ok(html.includes('data-feat="honor-kill"') && html.includes('data-feat="overkill"') && html.includes('×6') && html.includes('堕落，忙死他卡多！'), html);
    assert.ok(!renderCombatPanelHtml(v).includes('igs-combat-feat'));
    p.panel.close();
    assert.equal(p.timers.size(), 0);
    const q = await setup();
    // 鞭尸期间手动结束回合：结束回合排在出牌演出之后，先让被击倒的敌人倒下、停顿，再播判胜演出换结算画面。
    const r = await setup();
    assert.equal(r.play().ok, true);
    assert.equal(r.play().ok, true);
    assert.equal(r.p.panel.invoke('end-turn').ok, true);
    assert.equal(r.p.session.state().status, 'ended');
    let rt = 0; let rDown = -1; let rEnd = -1;
    while (rt < 30000 && rEnd < 0) {
        r.p.timers.advance(50); rt += 50;
        const view = r.p.panel.view();
        if (rDown < 0 && view.battle && !view.battle.enemies.find((u) => u.id === r.foeId).alive) rDown = rt;
        if (view.end && !view.settling) rEnd = rt;
    }
    assert.ok(rDown > 0 && rEnd - rDown >= 600, `${rDown} → ${rEnd}`);
    r.p.panel.close();
    assert.equal(r.p.timers.size(), 0);
    assert.equal(q.play().ok, true);
    q.p.panel.close();
    assert.equal(q.p.session.state().status, 'battle');
    q.p.panel.open(q.p.overlay, { messageId: 1 });
    q.p.timers.advance(1000);
    assert.equal(q.p.session.state().status, 'ended');
    q.p.panel.close();
});


// 翻牌界面（v3 §5.3）：真实会话照常打到胜利；state() 叠加由 flip.js 纯函数算出的翻牌视图，flip / choose / reroll 记下调用并推进进度。
const lootSlot = (index, rarity, name, origin = '') => ({ index, kind: 'keepsake', rarity, name, origin });
const LOOT_MAIN = [lootSlot(0, 'common', '褪色的发绳', '狼窝里捡到'), lootSlot(1, 'rare', '银狼牙'), lootSlot(2, 'mythic', '月下狼魂')];
const LOOT_RESERVE = [lootSlot(0, 'uncommon', '旧皮囊'), lootSlot(1, 'epic', '狼王之冠'), lootSlot(2, 'common', '碎骨')];
function flipHarness({ slots, reserve, reveal = 0, points = 0, ready = true, extra = {} }) {
    let wrap = null;
    const p = panelHarness({ getSession: () => wrap, ...extra });
    const offer = { combatId: 'c-flip', character: 'pc-hero', reveal, slots, reserve };
    const f = { pick: emptyPick(), ready, calls: [], subs: new Set() };
    const real = p.session;
    const state = () => {
        const s = real.state();
        if (s.status !== 'ended' && s.status !== 'send-failed') return s;
        return { ...s, flip: f.ready ? flipView(offer, f.pick, { points, payer: true }) : { status: 'loading' } };
    };
    const step = (call, r) => { f.calls.push(call); if (!r.ok) return { ok: false, reason: r.reason }; f.pick = r.pick; return { ok: true, session: state() }; };
    wrap = {
        ...real, state,
        subscribe: (fn) => { f.subs.add(fn); const off = real.subscribe(() => fn(state())); return () => { f.subs.delete(fn); off?.(); }; },
        flip: async (pos) => step(['flip', pos], flipCard(offer, f.pick, pos)),
        choose: async (pos) => step(['choose', pos], chooseCard(offer, f.pick, pos)),
        reroll: async () => step(['reroll'], rerollPick(offer, f.pick, { points, payer: true })),
    };
    f.emit = () => { for (const fn of f.subs) fn(state()); };
    const html = () => p.overlay.querySelector('.igs-combat-body').innerHTML;
    const cards = () => html().match(/<(?:button|div) (?:type="button" )?class="igs-combat-loot-card[^>]*>/g) || [];
    const at = (name, set = 'main') => flipOrder(offer, set).indexOf((set === 'main' ? slots : reserve).findIndex((s) => s.name === name));
    const flashes = () => p.overlay.querySelectorAll('.igs-combat-lobby-flash').length;
    return { p, offer, f, html, cards, at, flashes };
}
async function winFlip(t) {
    t.p.panel.open(t.p.overlay, { messageId: 1 });
    await until(() => t.p.panel.view().status === 'lobby');
    t.p.panel.invoke('start');
    playToEnd(t.p);
    for (let i = 0; i < 400 && t.p.panel.view().settling; i += 1) t.p.timers.advance(100);
    assert.equal(t.p.panel.view().status, 'ended');
}

test('翻牌：胜利后卡背一律相同、不带稀有度与名称，未选定时发送置灰；翻一张即选定，自己翻开的按稀有度出光效、其余随后翻开降一档；选定后才出重新抽取、积分不足置灰；减少动态效果不闪白；重绘与重开不重播光效', async () => {
    const t = flipHarness({ slots: LOOT_MAIN, reserve: LOOT_RESERVE, points: 12 });
    await winFlip(t);
    const v0 = t.p.panel.view().flip;
    assert.deepEqual([v0.status, v0.flips, v0.cards.length], ['ready', 1, 3]);
    assert.equal(t.cards().length, 3);
    assert.ok(t.cards().every((c) => /data-combat-act="flip"/.test(c) && !/data-rarity|data-fx|is-face/.test(c)));
    assert.doesNotMatch(t.html(), /褪色的发绳|银狼牙|月下狼魂/);
    assert.match(t.html(), /data-combat-act="finish" aria-disabled="true">发送战报</);
    assert.match(t.html(), /<div class="igs-combat-loot-cap">战利品<\/div>/);
    assert.doesNotMatch(t.html(), /data-combat-act="reroll"/);
    const before = t.flashes();
    const mythic = t.at('月下狼魂');
    assert.equal((await t.p.panel.invoke('flip', String(mythic))).ok, true);
    assert.deepEqual(t.f.calls, [['flip', mythic]]);
    const v1 = t.p.panel.view().flip;
    assert.ok(v1.done && v1.cards.every((c) => c.faceUp));
    const card = (name) => t.cards()[t.at(name)];
    assert.match(card('月下狼魂'), /class="igs-combat-loot-card is-face is-chosen is-fresh" data-rarity="mythic" data-fx="4"/);
    assert.match(card('银狼牙'), /class="igs-combat-loot-card is-face is-dim is-fresh is-later" data-rarity="rare" data-fx="1"/);
    assert.match(card('褪色的发绳'), /class="igs-combat-loot-card is-face is-dim is-fresh is-later" data-rarity="common" role="img"/);
    assert.equal((t.html().match(/igs-combat-loot-pillar/g) || []).length, 1);
    assert.match(t.html(), /<section class="igs-combat-loot" data-n="3" data-pause>/);
    assert.match(t.html(), /杂物·神话<\/span><span class="igs-combat-loot-name">月下狼魂/);
    assert.doesNotMatch(t.html(), /data-combat-act="(?:flip|choose)"/);
    assert.match(t.html(), /data-combat-act="finish">发送战报</);
    assert.match(t.html(), /data-combat-act="reroll" aria-disabled="true">重新抽取（消耗30积分）</);
    assert.notEqual(t.p.overlay.querySelector('#igs-combat-panel').getAttribute('data-igs-combat-reduced'), null);
    assert.equal(t.flashes(), before);
    t.p.panel.refresh();
    assert.doesNotMatch(t.html(), /is-fresh|data-fx/);
    t.p.panel.close();
    t.p.panel.open(t.p.overlay, { messageId: 1 });
    assert.match(card('月下狼魂'), /is-chosen/);
    assert.doesNotMatch(t.html(), /is-fresh|data-fx/);
    assert.equal((await t.p.panel.invoke('finish')).ok, true);
    assert.equal(t.p.sent.length, 1);
    t.p.panel.close();
});

const LOOT_FOUR = [lootSlot(0, 'common', '旧绳结'), lootSlot(1, 'uncommon', '狼毛围巾'), lootSlot(2, 'rare', '灰烬护符'), lootSlot(3, 'epic', '暗月刃')];
const LOOT_FOUR_RESERVE = [lootSlot(0, 'common', '碎石'), lootSlot(1, 'rare', '星砂瓶'), lootSlot(2, 'uncommon', '旧地图'), lootSlot(3, 'mythic', '狼神之眼')];
const LOOT_TIER = { common: 1, uncommon: 1, rare: 2, epic: 3, mythic: 4 };
test('再翻与透视：读取中发送置灰，读到后状态不变也重绘；透视亮出的牌朝上仍可翻、翻开时出光效；翻两张后只能在两张里选；重抽可用时换上备用套重新翻，用过后不再出重抽', async () => {
    const t = flipHarness({ slots: LOOT_FOUR, reserve: LOOT_FOUR_RESERVE, reveal: 1, points: 40, ready: false });
    await winFlip(t);
    assert.match(t.html(), /<section class="igs-combat-loot" aria-busy="true">/);
    assert.match(t.html(), /data-combat-act="finish" aria-disabled="true"/);
    t.p.timers.advance(20000);
    t.f.ready = true;
    t.f.emit();
    assert.equal(t.cards().length, 4);
    assert.match(t.html(), /<div class="igs-combat-loot-cap">战利品<\/div>/);
    assert.doesNotMatch(t.html(), /data-combat-act="reroll"/);
    const slotAt = (pos, set = 'main') => (set === 'main' ? LOOT_FOUR : LOOT_FOUR_RESERVE)[flipOrder(t.offer, set)[pos]];
    const [rp] = revealedOf(t.offer, 'main');
    assert.match(t.cards()[rp], new RegExp(`class="igs-combat-loot-card is-face" data-rarity="${slotAt(rp).rarity}" data-combat-act="flip" data-combat-id="${rp}"`));
    assert.equal((t.html().match(/data-combat-act="flip"/g) || []).length, 4);
    assert.equal((await t.p.panel.invoke('flip', String(rp))).ok, true);
    assert.match(t.cards()[rp], new RegExp(`<div class="igs-combat-loot-card is-face" data-rarity="${slotAt(rp).rarity}" data-fx="${LOOT_TIER[slotAt(rp).rarity]}" role="img"`));
    const q = [0, 1, 2, 3].find((i) => i !== rp);
    assert.equal((await t.p.panel.invoke('flip', String(q))).ok, true);
    assert.equal(t.p.panel.view().flip.needChoice, true);
    assert.doesNotMatch(t.html(), /data-combat-act="reroll"/);
    assert.equal((t.html().match(/data-combat-act="choose"/g) || []).length, 2);
    assert.doesNotMatch(t.html(), /data-combat-act="flip"/);
    assert.match(t.cards()[q], new RegExp(`class="igs-combat-loot-card is-face is-fresh" data-rarity="${slotAt(q).rarity}" data-fx="${LOOT_TIER[slotAt(q).rarity]}" data-combat-act="choose" data-combat-id="${q}"`));
    assert.doesNotMatch(t.cards()[rp], /data-fx/);
    assert.match(t.html(), /data-combat-act="finish" aria-disabled="true"/);
    const other = [0, 1, 2, 3].find((i) => i !== rp && i !== q);
    const bad = await t.p.panel.invoke('choose', String(other));
    assert.deepEqual([bad.ok, bad.reason], [false, 'combat-flip-position-invalid']);
    assert.match(t.p.panel.view().notice, /这张牌不能选/);
    assert.equal((await t.p.panel.invoke('choose', 'x')).reason, 'combat-flip-position-invalid');
    assert.equal((await t.p.panel.invoke('choose', String(q))).ok, true);
    assert.match(t.cards()[q], /is-chosen/);
    for (const i of [0, 1, 2, 3].filter((n) => n !== rp && n !== q)) assert.match(t.cards()[i], new RegExp(`is-dim is-fresh is-later" data-rarity="${slotAt(i).rarity}"`));
    assert.match(t.html(), /data-combat-act="finish">发送战报</);
    assert.match(t.html(), /data-combat-act="reroll">重新抽取（消耗30积分）</);
    assert.equal((await t.p.panel.invoke('reroll')).ok, true);
    const v3 = t.p.panel.view().flip;
    assert.deepEqual([v3.set, v3.done, v3.cards.filter((c) => c.faceUp).length], ['reserve', false, 1]);
    assert.doesNotMatch(t.html(), /is-fresh|data-fx|data-combat-act="reroll"/);
    assert.equal((t.html().match(/data-combat-act="flip"/g) || []).length, 4);
    assert.match(t.html(), /data-combat-act="finish" aria-disabled="true"/);
    assert.deepEqual(t.f.calls, [['flip', rp], ['flip', q], ['choose', other], ['choose', q], ['reroll']]);
    t.p.panel.close();
});

test('翻开神话：有动态效果时复用战前白闪铺满面板，低画质不闪；光效档位不受画质影响（低画质由样式层去粒子与光柱）', async () => {
    for (const quality of ['high', 'low']) {
        const t = flipHarness({ slots: LOOT_MAIN, reserve: LOOT_RESERVE, extra: { reducedMotion: () => false } });
        t.p.overlay.setAttribute('data-igs-quality', quality);
        await winFlip(t);
        t.p.timers.advance(20000);
        const before = t.flashes();
        assert.equal((await t.p.panel.invoke('flip', String(t.at('月下狼魂')))).ok, true);
        assert.equal(t.p.overlay.querySelector('#igs-combat-panel').getAttribute('data-igs-combat-reduced'), null);
        assert.equal(t.flashes() - before, quality === 'low' ? 0 : 1, quality);
        assert.match(t.html(), /data-rarity="mythic" data-fx="4"/);
        t.p.panel.close();
    }
});

test('战报未发送：重新发送前同样要先选定战利品；读取失败显示原因、重新发送仍可点；战利品已附进战报时只展示不再操作；没有 offer 时与原画面一致', () => {
    const offer = { combatId: 'c-x', character: 'pc-hero', reveal: 0, slots: LOOT_MAIN };
    const base = { status: 'send-failed', pending: '', notice: '' };
    assert.match(renderCombatPanelHtml(base), /<p class="igs-combat-state">战报未发送<\/p><div class="igs-combat-actions"><button type="button" class="igs-combat-btn is-primary" data-combat-act="retry-send">重新发送<\/button><\/div>/);
    const open = renderCombatPanelHtml({ ...base, flip: flipView(offer, emptyPick(), { payer: false }) });
    assert.match(open, /data-combat-act="retry-send" aria-disabled="true">重新发送</);
    assert.equal((open.match(/data-combat-act="flip"/g) || []).length, 3);
    assert.doesNotMatch(open, /data-combat-act="reroll"/);
    const failed = renderCombatPanelHtml({ ...base, flip: { status: 'error', reason: 'combat-ledger-read-failed' } });
    assert.match(failed, /战利品读取失败：读取战斗记录失败/);
    assert.match(failed, /data-combat-act="retry-send">重新发送</);
    const locked = renderCombatPanelHtml({ ...base, flip: flipView(offer, flipCard(offer, emptyPick(), 0).pick, { payer: true, points: 99, locked: true }) });
    assert.match(locked, /data-combat-act="retry-send">重新发送</);
    assert.doesNotMatch(locked, /data-combat-act="(?:flip|choose|reroll)"/);
    assert.equal((locked.match(/class="igs-combat-loot-card is-face/g) || []).length, 3);
});


test('v4 手牌视图：关键字、临时牌与原费用只在有值时出现；新事件不打断战报、成就与演出', async () => {
    const { createBattle, applyAction, legalActions } = await import('../src/combat/engine.js');
    const { collectTurns } = await import('../src/combat/report.js');
    const { combatFeats } = await import('../src/combat/feats.js');
    const { BASIC_CARDS } = await import('../src/combat/rules.js');
    const skill = (id, cost, effects, extra = {}) => ({ id, name: id, type: 'skill', cost, rarity: 'common', effects, ...extra });
    const catalog = { ...BASIC_CARDS,
        lead: skill('lead', 1, [{ op: 'block', amount: 2, target: 'self' }], { innate: true }),
        dud: skill('dud', 0, [], { unplayable: true, onDiscard: [{ op: 'draw', amount: 1 }] }),
        forge: skill('forge', 1, [{ op: 'create', card: 'token-shard', amount: 1, to: 'hand' }]) };
    const units = [{ id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 50, deck: ['lead', 'dud', 'forge', 'basic-strike', 'basic-defend'], catalog },
        { id: 'foe', name: '狼', side: 'enemy', kind: 'skill', maxHp: 40, skills: [{ id: 'e1', name: '撕咬', intent: 'attack', effects: [{ op: 'damage', amount: 3 }] }] }];
    const begun = createBattle({ controlledId: 'hero', units }, 7);
    assert.equal(begun.ok, true, JSON.stringify(begun.error));
    const find = (view, id) => view.hand.find((c) => c.id === id);
    let view = battleView(begun.state, legalActions(begun.state));
    const strike = find(view, 'basic-strike');
    for (const key of ['keywords', 'temp', 'baseCost']) assert.equal(Object.hasOwn(strike, key), false, key);
    assert.equal(find(view, 'lead').keywords, '固有');
    assert.deepEqual([find(view, 'dud').keywords, find(view, 'dud').playable], ['不能打出。被丢弃时：抽 1 张牌', false]);
    const played = applyAction(begun.state, { type: 'play', inst: find(view, 'forge').inst });
    assert.equal(played.error, undefined, JSON.stringify(played.error));
    view = battleView(played.state, legalActions(played.state));
    const shard = view.hand.find((c) => c.temp);
    assert.deepEqual([shard?.temp, shard?.keywords], [true, '临时']);
    played.state.units.hero.handCost = -1;
    view = battleView(played.state, legalActions(played.state));
    assert.deepEqual([find(view, 'lead').cost, find(view, 'lead').baseCost], [0, 1]);
    assert.equal(Object.hasOwn(find(view, 'dud'), 'baseCost'), false);
    const events = [...begun.events, ...played.events];
    assert.ok(events.some((e) => e.type === 'card-created'), JSON.stringify(events.map((e) => e.type)));
    assert.doesNotThrow(() => {
        collectTurns(events, played.state.units);
        combatFeats(events, played.state);
        combatFxSource(events, played.state, {});
    });
});


test('v4 牌面关键字注释：固有、临时与效果里的消耗带 data-scale-tip；不能打出与被丢弃时不带注释；普通卡视图形状不变', async () => {
    const { createBattle, applyAction, legalActions } = await import('../src/combat/engine.js');
    const { BASIC_CARDS } = await import('../src/combat/rules.js');
    const { KEYWORD_TIPS } = await import('../src/visual/igs-ui/combat-card-art.js');
    const { cardTextHtml } = await import('../src/visual/igs-ui/combat-panel-render.js');
    const skill = (id, cost, effects, extra = {}) => ({ id, name: id, type: 'skill', cost, rarity: 'common', effects, ...extra });
    const catalog = { ...BASIC_CARDS,
        lead: skill('lead', 1, [{ op: 'block', amount: 2, target: 'self' }], { innate: true }),
        dud: skill('dud', 0, [], { unplayable: true, onDiscard: [{ op: 'draw', amount: 1 }] }),
        forge: skill('forge', 1, [{ op: 'create', card: 'token-shard', amount: 1, to: 'hand' }]) };
    const units = [{ id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 50, deck: ['lead', 'dud', 'forge', 'basic-strike', 'basic-defend'], catalog },
        { id: 'foe', name: '狼', side: 'enemy', kind: 'skill', maxHp: 40, skills: [{ id: 'e1', name: '撕咬', intent: 'attack', effects: [{ op: 'damage', amount: 3 }] }] }];
    const begun = createBattle({ controlledId: 'hero', units }, 7);
    const find = (view, id) => view.hand.find((c) => c.id === id);
    let view = battleView(begun.state, legalActions(begun.state));
    for (const key of ['keywordParts', 'textParts']) assert.equal(Object.hasOwn(find(view, 'basic-strike'), key), false, key);
    assert.deepEqual(find(view, 'lead').keywordParts, [{ text: '固有', tip: KEYWORD_TIPS.innate }]);
    const dud = find(view, 'dud');
    assert.equal(dud.keywordParts.map((p) => p.text).join(''), dud.keywords);
    assert.equal(dud.keywordParts.some((p) => Object.hasOwn(p, 'tip')), false);
    assert.equal(cardTextHtml({ textParts: dud.keywordParts }), '不能打出。被丢弃时：抽 1 张牌');
    const played = applyAction(begun.state, { type: 'play', inst: find(view, 'forge').inst });
    view = battleView(played.state, legalActions(played.state));
    const shard = view.hand.find((c) => c.temp);
    assert.deepEqual(shard.keywordParts, [{ text: '临时', tip: KEYWORD_TIPS.temp }]);
    assert.equal(shard.textParts.map((p) => p.text).join(''), shard.text);
    assert.ok(cardTextHtml(shard).endsWith(`<span data-scale-tip="${KEYWORD_TIPS.exhaust}">消耗</span>`), cardTextHtml(shard));
});


test('卡面纹样：先按卡名匹配（不受牌型限制），同分看效果结构，名字没命中才按本类型回退；同一张卡同一纹样；卡名不进 SVG；临时牌带残影', async () => {
    const { cardArtSvg } = await import('../src/visual/igs-ui/combat-card-art.js');
    const { cardMotifKey } = await import('../src/visual/igs-ui/combat-card-motifs.js');
    const { TOKEN_CARDS } = await import('../src/combat/rules.js');
    const card = (id, name, type, effects, extra = {}) => ({ id, name, type, cost: 1, rarity: 'common', effects, ...extra });
    const hit = (extra = {}) => ({ op: 'damage', amount: 6, hits: 1, target: 'enemy', ...extra });
    const cases = [
        [card('a1', '寒冰护盾', 'skill', [{ op: 'block', amount: 6, target: 'self' }]), 'ward'],
        [card('a2', '腐蚀', 'skill', [{ op: 'status', status: 'poison', stacks: 4, target: 'enemy' }]), 'vial'],
        [card('a3', '旋风斩', 'attack', [hit({ target: 'all-enemies' })], { cost: 'X' }), 'whirl'],
        [card('a4', '连抓', 'attack', [hit({ hits: 3 })]), 'claw'],
        [card('a5', '铸刃', 'skill', [{ op: 'create', card: 'token-shard', amount: 1, to: 'hand' }]), 'anvil'],
        [card('a6', '霸气', 'power', [{ op: 'each-turn', then: [{ op: 'status', status: 'strength', stacks: 1, target: 'self' }] }]), 'crown'],
        [card('a7', '流光', 'attack', [hit()]), 'comet'],
        [card('a8', '烈焰', 'skill', [{ op: 'block', amount: 6, target: 'self' }]), 'flame'],
        [TOKEN_CARDS['token-shard'], 'shard'], [TOKEN_CARDS['token-ward'], 'talisman'], [TOKEN_CARDS['token-spark'], 'spark'],
    ];
    assert.deepEqual(cases.map(([c]) => cardMotifKey(c)), cases.map(([, k]) => k));
    const strike = card('s1', '打击', 'attack', [hit()]);
    assert.equal(cardArtSvg(strike), cardArtSvg(JSON.parse(JSON.stringify(strike))));
    assert.equal(cardMotifKey({ ...strike, upgraded: true, effects: [hit({ amount: 9 })] }), cardMotifKey(strike));
    const plain = Array.from({ length: 12 }, (_, i) => cardMotifKey(card(`p${i}`, '无名', 'attack', [hit()])));
    assert.ok(new Set(plain).size >= 3, plain.join());
    const evil = cardArtSvg(card('<x>', '<script>alert(1)</script>"斩', 'attack', [hit()]));
    assert.match(evil, /^<svg viewBox="0 0 24 24" [^>]*aria-hidden="true">/);
    assert.doesNotMatch(evil, /script|alert|<x>|斩/);
    const base = cardArtSvg(strike);
    const temp = cardArtSvg({ ...strike, temp: true });
    assert.doesNotMatch(base, /stroke-dasharray/);
    assert.match(temp, /stroke-dasharray/);
    assert.ok(temp.includes(base.replace(/^<svg[^>]*>|<\/svg>$/g, '')));
    for (const odd of [null, {}, card('o1', '', 'curse', [])]) assert.match(cardArtSvg(odd), /^<svg [\s\S]*<\/svg>$/);
});


test('v4 待选阶段：打出选牌弃牌后视图给出 choice 与候选牌，确认钮显示「弃掉 k/N」、选够才可点、替换结束回合；没有待选时视图不写 choice', async () => {
    const { createBattle, applyAction, legalActions } = await import('../src/combat/engine.js');
    const { BASIC_CARDS } = await import('../src/combat/rules.js');
    const skill = (id, cost, effects, extra = {}) => ({ id, name: id, type: 'skill', cost, rarity: 'common', effects, ...extra });
    const catalog = { ...BASIC_CARDS, sift: skill('sift', 1, [{ op: 'draw', amount: 2 }, { op: 'discard', amount: 1, mode: 'choose' }], { innate: true }) };
    const deck = ['sift', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-strike', 'basic-defend', 'basic-strike'];
    const units = [{ id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 50, deck, catalog },
        { id: 'foe', name: '狼', side: 'enemy', kind: 'skill', maxHp: 40, skills: [{ id: 'e1', name: '撕咬', intent: 'attack', effects: [{ op: 'damage', amount: 3 }] }] }];
    const begun = createBattle({ controlledId: 'hero', units }, 7);
    assert.equal(begun.ok, true, JSON.stringify(begun.error));
    const idle = battleView(begun.state, legalActions(begun.state));
    assert.equal(Object.hasOwn(idle, 'choice'), false);
    assert.equal(idle.hand.some((c) => Object.hasOwn(c, 'choosable')), false);
    const played = applyAction(begun.state, { type: 'play', inst: idle.hand.find((c) => c.id === 'sift').inst });
    assert.equal(played.ok, true, JSON.stringify(played.error));
    const view = battleView(played.state, legalActions(played.state));
    assert.deepEqual([view.choice.kind, view.choice.count], ['discard', 1]);
    assert.deepEqual(view.hand.filter((c) => c.choosable).map((c) => c.inst), view.choice.options);
    assert.deepEqual([view.hand.some((c) => c.playable), view.canEndTurn], [false, false]);
    const base = { status: 'battle', pending: '', notice: '', selected: null, battle: view };
    const confirm = (html) => html.match(/<button[^>]*data-combat-act="choose-confirm"[^>]*>[^<]*<\/button>/)?.[0] || '';
    const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cardTag = (html, inst) => html.match(new RegExp(`<button type="button" class="[^"]*" style="[^"]*" data-combat-act="card" data-combat-id="${reEsc(inst)}"[^>]*>`))?.[0] || '';
    const none = renderCombatPanelHtml({ ...base, chosen: [] });
    assert.match(confirm(none), /aria-disabled="true">弃掉 0\/1</);
    assert.doesNotMatch(none, /data-combat-act="end-turn"/);
    const pick = view.choice.options[0];
    assert.match(cardTag(none, pick), /is-choosable/);
    assert.doesNotMatch(cardTag(none, pick), /is-disabled|is-chosen|aria-disabled/);
    assert.match(cardTag(none, pick), /aria-pressed="false"/);
    const one = renderCombatPanelHtml({ ...base, chosen: [pick] });
    assert.match(confirm(one), />弃掉 1\/1</);
    assert.doesNotMatch(confirm(one), /aria-disabled/);
    assert.match(cardTag(one, pick), /is-chosen[^"]*"[\s\S]*aria-pressed="true"/);
    assert.match(renderCombatPanelHtml({ ...base, battle: idle }), /data-combat-act="end-turn"/);
});

test('v4 选牌确认：打出选牌弃牌后点候选牌选中，确认钮按 legal 派发 choose 并记入会话动作；张数不够与待选期间结束回合给原因；只选 1 张时点另一张换选，Esc 清空已选', async () => {
    const sift = { id: 'm2', name: '筛选', type: 'skill', cost: 1, rarity: 'personal', innate: true, effects: [{ op: 'draw', amount: 2 }, { op: 'discard', amount: 1, mode: 'choose' }] };
    const hero = { ...clone(heroDef), personalPool: [attack('m1'), sift, attack('m3'), guard('m4')] };
    const p = panelHarness({}, { hero });
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    assert.equal(p.panel.invoke('start').ok, true);
    const count = () => p.session.state().record.actions.length;
    const card = p.panel.view().battle.hand.find((c) => c.name === '筛选');
    assert.ok(card, '固有的「筛选」应在首手');
    assert.equal(p.panel.invoke('card', card.inst).reason, 'combat-target-required');
    const played = card.affects.length ? p.panel.invoke('target', card.affects[0]) : p.panel.invoke('card', card.inst);
    assert.equal(played.ok, true, JSON.stringify(played));
    const choice = p.panel.view().battle.choice;
    assert.deepEqual([choice.kind, choice.count], ['discard', 1]);
    assert.ok(choice.options.length > 1);
    const [a, b] = choice.options;
    const before = count();
    assert.equal(p.panel.invoke('end-turn').reason, 'combat-choice-pending');
    assert.equal(p.panel.invoke('choose-confirm').reason, 'combat-choice-count');
    assert.deepEqual(p.panel.invoke('card', a).chosen, [a]);
    assert.deepEqual(p.panel.invoke('card', b).chosen, [b]);
    assert.equal(p.panel.cancelSelection(), true);
    assert.deepEqual(p.panel.view().chosen, []);
    assert.equal(count(), before);
    p.panel.invoke('card', a);
    const discardBefore = p.panel.view().battle.piles.discard;
    const r = p.panel.invoke('choose-confirm');
    assert.equal(r.ok, true, JSON.stringify(r.reason));
    assert.equal(count(), before + 1);
    assert.deepEqual(p.session.state().record.actions.at(-1), { type: 'choose', insts: [a] });
    const after = p.panel.view();
    assert.equal(Object.hasOwn(after.battle, 'choice'), false);
    assert.equal(Object.hasOwn(after, 'chosen'), false);
    assert.equal(after.battle.hand.some((c) => c.inst === a), false);
    // 选中的牌被弃掉，「筛选」本身结算完也进弃牌堆：弃牌堆多 2 张。
    const pile = p.session.state().battle.piles[after.battle.heroId];
    assert.deepEqual([pile.discard.includes(a), pile.discard.includes(card.inst)], [true, true]);
    assert.equal(after.battle.piles.discard, discardBefore + 2);
    p.panel.close();
});
