import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatSession, outboxKeyFor, sessionKeyFor } from '../src/combat/session.js';
import { createCombatLedger } from '../src/combat/ledger.js';
import { enemyIdFor } from '../src/combat/generation.js';
import { COMBAT_SKIP_TEXT } from '../src/combat/report.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';

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
const ai = (mes, swipe_id = 0) => ({ mes, swipe_id, is_user: false });
const user = (mes) => ({ mes, is_user: true });

function memoryTables(profile) {
    const t = { profile: clone(profile), ledger: [] };
    t.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(t.profile), ledger: clone(t.ledger) });
    t.append = async (kind, records) => {
        for (const r of records) if (!t[kind].some((x) => x.id === r.id && x.version === r.version)) t[kind].push(clone(r));
        return { ok: true, written: records.map((r) => r.id), present: [], rejected: [], pending: [] };
    };
    return t;
}

// 共享的 chat 与 storage 模拟同一聊天；send 把文本写成用户楼并回执 messageId，可切换为失败。
function harness({ enemy = '狼', profiles, request } = {}) {
    const h = { chat: [user('出发'), ai(`前方有动静。\n[igs-combat:start|狭路|${enemy}]`)], sent: [], sendOk: true };
    h.storage = createMemoryStorage();
    h.tables = memoryTables(profiles || [row(classDef, 1), row(heroDef, 2), row(enemyDef('狼', 4), 3), row(enemyDef('熊', 12), 4)]);
    h.ledger = createCombatLedger({ tables: h.tables, chat: () => h.chat, userName: '主角', now: () => 5 });
    h.send = async (text) => {
        h.sent.push(text);
        if (!h.sendOk) return { ok: false, reason: 'host-send-pending' };
        h.chat.push(user(text));
        return { ok: true, sent: true, messageId: h.chat.length - 1 };
    };
    h.session = () => createCombatSession({ ledger: h.ledger, tables: h.tables, request, llm: { source: 'tavern' }, send: h.send,
        storage: h.storage, chat: () => h.chat, getChatId: 'chat-1', userName: '主角', now: () => 9 });
    return h;
}

// 有可打的牌就打第一张，否则结束回合；passive 为 true 时只结束回合。
function playOut(s, { passive = false } = {}) {
    for (let i = 0; i < 400 && s.state().status === 'battle'; i += 1) {
        const legal = s.state().legal;
        const play = passive ? null : legal.find((a) => a.type === 'play');
        assert.equal(s.act(play || { type: 'end-turn' }).ok, true);
    }
    return s.state();
}

const stored = (h, key) => h.storage.getItem(key) ?? null;
const NO_TABLE_TERMS = /卡牌|手牌|费用|能量|抽牌|HP/;

test('胜利：完整流程产出战报并自动回传，EXP 标签经账本扫描入库', async () => {
    const h = harness();
    const s = h.session();
    const prepared = await s.prepare(1);
    assert.deepEqual([prepared.ok, prepared.session.status, prepared.session.lobby.templated], [true, 'lobby', []]);
    assert.equal(s.start().ok, true);
    assert.notEqual(stored(h, sessionKeyFor('chat-1')), null);
    assert.equal(playOut(s).status, 'ended');
    assert.equal(s.state().battle.outcome, 'victory');
    const finished = await s.finish();
    assert.deepEqual([finished.ok, finished.session.status, h.sent.length], [true, 'done', 1]);
    const [text] = h.sent;
    assert.match(text, /<igs-combat-report id="r[0-9a-z]+" result="win" encounter="狭路">/);
    assert.match(text, /\[igs-combat:exp\|主角\|20\|战斗:r[0-9a-z]+\]/);
    const block = text.slice(text.indexOf('<igs-combat-report'), text.indexOf('</igs-combat-report>'));
    assert.doesNotMatch(block, NO_TABLE_TERMS);
    assert.match(block, /击倒狼/);
    assert.deepEqual([stored(h, sessionKeyFor('chat-1')), stored(h, outboxKeyFor('chat-1'))], [null, null]);
    assert.equal(h.tables.ledger.length, 1);
    assert.equal((await h.ledger.effectiveState()).characters.get('pc-hero').exp, 20);
});

test('失败与撤退：战报照常回传，但不附 EXP、不产生成长条目', async () => {
    const lose = harness({ enemy: '熊' });
    const s1 = lose.session();
    await s1.prepare(1);
    s1.start();
    assert.equal(playOut(s1, { passive: true }).battle.outcome, 'defeat');
    assert.equal((await s1.finish()).ok, true);
    assert.match(lose.sent[0], /result="lose"/);
    assert.doesNotMatch(lose.sent[0], /igs-combat:exp/);
    assert.equal(lose.tables.ledger.length, 0);

    const run = harness();
    const s2 = run.session();
    await s2.prepare(1);
    s2.start();
    assert.equal(s2.state().legal.some((a) => a.type === 'escape'), true);
    assert.deepEqual([s2.act({ type: 'escape' }).session.status, s2.state().battle.outcome], ['ended', 'escape']);
    assert.equal((await s2.finish()).ok, true);
    assert.match(run.sent[0], /result="escape"/);
    assert.doesNotMatch(run.sent[0], /igs-combat:exp/);
    assert.equal(run.tables.ledger.length, 0);
});

test('刷新后断点续战：同一 seed 重放动作得到相同战局', async () => {
    const h = harness();
    const s = h.session();
    await s.prepare(1);
    s.start();
    const play = s.state().legal.find((a) => a.type === 'play');
    assert.equal(s.act(play).ok, true);
    assert.equal(s.act({ type: 'end-turn' }).ok, true);
    const resumed = h.session().resume();
    assert.deepEqual([resumed.ok, resumed.session.status], [true, 'battle']);
    assert.deepEqual(resumed.session.battle, s.state().battle);
    assert.equal(resumed.session.record.actions.length, 2);
});

test('开战楼换了 swipe 后会话作废，续战也拒绝重放', async () => {
    const h = harness();
    const s = h.session();
    await s.prepare(1);
    s.start();
    h.chat[1] = ai('另一个版本，没有遭遇。', 1);
    const moved = s.act({ type: 'end-turn' });
    assert.deepEqual([moved.ok, moved.reason, moved.session.status], [false, 'combat-floor-changed', 'stale']);
    assert.equal(stored(h, sessionKeyFor('chat-1')), null);

    const h2 = harness();
    const s2 = h2.session();
    await s2.prepare(1);
    s2.start();
    h2.chat[1] = ai('改写后的正文。', 1);
    const resumed = h2.session().resume();
    assert.deepEqual([resumed.ok, resumed.reason], [false, 'combat-floor-changed']);
});

test('发送失败保留待回传、不自动重发；手动重试成功后已回传的战斗只能回顾', async () => {
    const h = harness();
    h.sendOk = false;
    const s = h.session();
    await s.prepare(1);
    s.start();
    playOut(s);
    const failed = await s.finish();
    assert.deepEqual([failed.ok, failed.reason, failed.session.status, h.sent.length], [false, 'combat-report-send-failed', 'send-failed', 1]);
    assert.notEqual(stored(h, outboxKeyFor('chat-1')), null);
    assert.equal(h.tables.ledger.length, 0);

    const reopened = h.session();
    const again = await reopened.prepare(1);
    assert.deepEqual([again.session.status, reopened.start().ok, h.sent.length], ['send-failed', false, 1]);
    h.sendOk = true;
    const retried = await reopened.retrySend();
    assert.deepEqual([retried.ok, retried.session.status, h.sent.length], [true, 'done', 2]);
    assert.equal(stored(h, outboxKeyFor('chat-1')), null);
    assert.equal(h.tables.ledger.length, 1);
    assert.equal((await reopened.retrySend()).reason, 'combat-nothing-to-send');

    const later = h.session();
    assert.equal((await later.prepare(1)).session.status, 'done');
    assert.equal(later.start().reason, 'combat-session-not-ready');
    assert.equal(h.sent.length, 2);
});

test('跳过卡牌战斗只发送固定文本，不产生成长条目', async () => {
    const h = harness();
    const s = h.session();
    await s.prepare(1);
    const skipped = await s.skip();
    assert.deepEqual([skipped.ok, skipped.session.status, h.sent], [true, 'skipped', [COMBAT_SKIP_TEXT]]);
    assert.equal((await h.ledger.scan()).entries.length, 0);
    assert.equal(h.tables.ledger.length, 0);
});

test('主角档案生成失败时进入 blocked，不伪造档案、不开战；读表失败同样阻断', async () => {
    let calls = 0;
    const request = async () => { calls += 1; return '{}'; };
    const h = harness({ profiles: [row(classDef, 1), row(enemyDef('狼', 4), 3)], request });
    const s = h.session();
    const blocked = await s.prepare(1);
    assert.deepEqual([blocked.ok, blocked.reason, blocked.session.status, calls], [false, 'combat-protagonist-generation-failed', 'blocked', 3]);
    assert.equal(h.tables.profile.length, 2);
    assert.equal(s.start().ok, false);

    const broken = harness();
    broken.tables.read = () => ({ ok: false, reason: 'combat-table-read-failed' });
    const r = await broken.session().prepare(1);
    assert.deepEqual([r.ok, r.reason, r.session.status], [false, 'combat-table-read-failed', 'blocked']);
});

