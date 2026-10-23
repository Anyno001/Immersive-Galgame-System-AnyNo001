import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatSession } from '../src/combat/session.js';
import { createCombatLedger } from '../src/combat/ledger.js';
import { enemyIdFor } from '../src/combat/generation.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { battleView, combatFxSource, endView, lobbyView, resolvePlay } from '../src/visual/igs-ui/combat-panel-model.js';
import { FakeEl, makeTimers } from './helpers/fake-dom.js';
import { createCombatPanelController } from '../src/visual/igs-ui/combat-panel.js';
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

export function combatHarness({ enemy = '狼' } = {}) {
    const h = { chat: [user('出发'), ai(`前方有动静。\n[igs-combat:start|狭路|${enemy}]`)], sent: [] };
    h.storage = createMemoryStorage();
    h.tables = memoryTables([row(classDef, 1), row(heroDef, 2), row(enemyDef('狼', 4), 3)]);
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
function panelHarness() {
    const h = combatHarness();
    const doc = { createElement: (tag) => new FakeEl(doc, tag), activeElement: null };
    const overlay = new FakeEl(doc, 'div');
    overlay.id = 'igs-overlay';
    const timers = makeTimers();
    const panel = createCombatPanelController(doc, { getSession: () => h.session, getLedger: () => h.ledger, reducedMotion: () => true, schedule: timers.schedule, clear: timers.clear });
    return { ...h, doc, overlay, panel, timers };
}

async function until(fn) {
    for (let i = 0; i < 50 && !fn(); i += 1) await new Promise((r) => setImmediate(r));
    assert.ok(fn());
}

const paused = (overlay) => String(overlay.getAttribute('data-igs-paused') || '').split(' ').filter(Boolean);

test('面板：打开加 panel:combat 暂停原因并进入战前，关闭只撤销自己的原因', async () => {
    const p = panelHarness();
    setStagePauseReason(p.overlay, 'offscreen', true);
    assert.equal(p.panel.open(p.overlay, { messageId: 1 }).ok, true);
    assert.deepEqual(paused(p.overlay).sort(), ['offscreen', 'panel:combat']);
    await until(() => p.panel.view().status === 'lobby');
    assert.match(p.overlay.querySelector('.igs-combat-body').innerHTML, /data-combat-act="start"/);
    assert.equal(p.panel.close().ok, true);
    assert.equal(p.panel.isOpen(), false);
    assert.deepEqual(paused(p.overlay), ['offscreen']);
    assert.equal(p.overlay.querySelector('#igs-combat-panel'), null);
});

test('面板：能量不足的牌不能打出，结束回合推进托管与敌方阶段', async () => {
    const p = panelHarness();
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'lobby');
    assert.equal(p.panel.invoke('start').ok, true);
    for (let i = 0; i < 3; i += 1) {
        const card = p.panel.view().battle.hand[0];
        const r = p.panel.invoke('card', card.inst);
        if (!r.ok) assert.equal(p.panel.invoke('target', card.targets[0]).ok, true);
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
    assert.ok(ended.events.some((e) => e.type === 'turn-start' && e.side === 'enemy'));
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
    for (let i = 0; i < 400 && p.panel.view().status === 'battle'; i += 1) {
        const card = p.panel.view().battle.hand.find((c) => c.playable);
        if (!card) { p.panel.invoke('end-turn'); continue; }
        if (!p.panel.invoke('card', card.inst).ok) p.panel.invoke('target', card.targets[0]);
    }
    assert.equal(p.panel.view().end.outcome, 'victory');
    const sent = await p.panel.invoke('finish');
    assert.equal(sent.ok, true);
    assert.equal(p.sent.length, 1);
    p.panel.close();
    p.panel.open(p.overlay, { messageId: 1 });
    await until(() => p.panel.view().status === 'done');
    assert.doesNotMatch(p.overlay.querySelector('.igs-combat-body').innerHTML, /data-combat-act="start"/);
    assert.equal(p.sent.length, 1);
    p.panel.close();
});

test('设置：combatExpansion 非法值回到默认，经 normalizeReaderSettings 读入', async () => {
    const { normalizeCombatExpansionSettings } = await import('../src/visual/igs-ui/combat-settings.js');
    const { normalizeReaderSettings } = await import('../src/visual/igs-ui/settings-host-normalize.js');
    const defaults = { enabled: false, autoOpen: false, difficulty: 'normal', reportDetail: 'normal' };
    assert.deepEqual(normalizeCombatExpansionSettings({ enabled: 'true', autoOpen: 1, difficulty: 'nightmare', reportDetail: 'full' }), defaults);
    assert.deepEqual(normalizeCombatExpansionSettings(null), defaults);
    assert.deepEqual(normalizeReaderSettings({}).combatExpansion, defaults);
    const kept = { enabled: true, autoOpen: true, difficulty: 'hard', reportDetail: 'brief' };
    assert.deepEqual(normalizeReaderSettings({ combatExpansion: kept }).combatExpansion, kept);
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

test('入口：只在开启、最新 AI 楼末页且末尾有开战标签时出现，autoOpen 同一开战楼只触发一次', async () => {
    const { resolveCombatEntry, syncCombatEntry, COMBAT_ENTRY_ID } = await import('../src/visual/igs-ui/combat-entry.js');
    const on = { combatExpansion: { enabled: true, autoOpen: true } };
    const floor = { isAi: true, isLatest: true, chatId: 'c1', messageId: 1, swipeId: 0, text: '前方有动静。\n[igs-combat:start|狭路|狼]' };
    assert.equal(resolveCombatEntry({ readerSettings: {}, floor, lastPage: true }), null);
    assert.equal(resolveCombatEntry({ readerSettings: on, floor, lastPage: false }), null);
    assert.equal(resolveCombatEntry({ readerSettings: on, floor: { ...floor, isLatest: false }, lastPage: true }), null);
    assert.equal(resolveCombatEntry({ readerSettings: on, floor: { ...floor, text: '[igs-combat:start|狭路|狼]\n后来又说了一句。' }, lastPage: true }), null);
    const entry = resolveCombatEntry({ readerSettings: on, floor, lastPage: true });
    assert.deepEqual([entry.messageId, entry.encounter, entry.autoOpen], [1, '狭路', true]);
    const doc = { createElement: (tag) => new FakeEl(doc, tag) };
    const overlay = new FakeEl(doc, 'div');
    overlay.ownerDocument = doc;
    const seen = new Set();
    let opened = 0;
    const onOpen = () => { opened += 1; };
    assert.equal(syncCombatEntry(overlay, entry, { seen, onOpen }), true);
    assert.equal(syncCombatEntry(overlay, entry, { seen, onOpen }), false);
    overlay.querySelector(`#${COMBAT_ENTRY_ID}`).fire('click', { target: { closest: () => ({}) } });
    assert.equal(opened, 1);
    assert.equal(syncCombatEntry(overlay, null, { seen }), false);
    assert.equal(overlay.querySelector(`#${COMBAT_ENTRY_ID}`), null);
});

