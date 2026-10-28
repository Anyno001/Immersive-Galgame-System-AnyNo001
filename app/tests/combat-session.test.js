import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatSession, locateCombatStart, outboxKeyFor, sessionKeyFor } from '../src/combat/session.js';
import { createCombatChatRecord } from '../src/host/combat-chat-record.js';
import { createCombatLedger } from '../src/combat/ledger.js';
import { enemyIdFor } from '../src/combat/generation.js';
import { COMBAT_SKIP_TEXT } from '../src/combat/report.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { victoryExpFor } from '../src/combat/rewards.js';

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
    t.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(t.profile), ledger: clone(t.ledger),
        ...(t.attribute && { attribute: clone(t.attribute) }) });
    t.append = async (kind, records) => {
        for (const r of records) if (!t[kind].some((x) => x.id === r.id && x.version === r.version)) t[kind].push(clone(r));
        return { ok: true, written: records.map((r) => r.id), present: [], rejected: [], pending: [] };
    };
    return t;
}

// 共享的 chat 与 storage 模拟同一聊天；send 把文本写成用户楼并回执 messageId，可切换为失败。
function harness({ enemy = '狼', profiles, request, record = false } = {}) {
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
    // record：开战楼聊天记录经真实 combat-chat-record 读写；宿主上下文是假对象，saveFail 时保存抛错。
    h.saves = 0;
    h.saveFail = false;
    h.chatRecord = record ? createCombatChatRecord({ SillyTavern: { getContext: () => ({ chat: h.chat, saveChat: async () => { if (h.saveFail) throw new Error('save-failed'); h.saves += 1; } }) } }) : undefined;
    h.session = () => createCombatSession({ ledger: h.ledger, tables: h.tables, request, llm: { source: 'tavern' }, send: h.send, chatRecord: h.chatRecord,
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
// 奖励实体与初始化同批请求；只核对初始化的用例里奖励不作答（本场奖励失败，不阻断开战）。
const initEntities = (req) => JSON.parse(req.user).entities.filter((e) => e.kind !== 'battle-reward');
// 奖励回复：按 input.slots 与备用套 input.reserve 的类别逐槽给 [名称, 模板键, 来历]。
const REWARD_TUPLES = { card: ['裂风', 'strike', '狼的爪痕'], gear: ['狼牙刃', 'opening-strength', ''], item: ['回春丹', 'potion', ''], keepsake: ['褪色的发绳', null, '狼窝里捡到'] };
const rewardReply = (req) => JSON.stringify({ entities: JSON.parse(req.user).entities.filter((e) => e.kind === 'battle-reward')
    .map((e) => ({ key: e.key, value: { slots: e.input.slots.map((s) => REWARD_TUPLES[s.kind]), ...(e.input.reserve ? { reserve: e.input.reserve.map((s) => REWARD_TUPLES[s.kind]) } : {}) } })) });

test('开战补初始化：已有档案不重写、缺表不请求、非法值不阻断、已准备只补主角', async () => {
    let calls = 0;
    const init = { className: '剑士', role: 'warrior', major: 'str', minor: 'con', weak: 'cha' };
    const h = harness({ record: true, request: async req => {
        const entities = initEntities(req);
        if (!entities.length) return '{"entities":[]}';
        calls++;
        assert.ok(entities.every(e => e.kind === 'profile-init'));
        if (calls === 2) assert.deepEqual(entities.map(e => e.input.name), ['主角']);
        return JSON.stringify({ entities: entities.map(e => ({ key: e.key,
            value: { init: e.input.name === '狼' ? { ...init, weak: 'str' } : init } })) });
    } });
    assert.equal((await h.session().prepare(1)).ok, true);
    assert.equal(calls, 0, '缺属性表不请求无法保存的资料');
    const withoutRecord = createCombatSession({ ledger: h.ledger, tables: h.tables,
        request: async req => {
            const entities = initEntities(req);
            if (!entities.length) return '{"entities":[]}';
            calls++;
            assert.deepEqual(entities.map(e => e.input.name), ['主角', '狼']);
            return JSON.stringify({ entities: entities.map(e => ({ key: e.key,
                value: { init: e.input.name === '狼' ? { ...init, weak: 'str' } : init } })) });
        }, llm: { source: 'tavern' }, chat: () => h.chat, getChatId: 'chat-1', userName: '主角' });
    h.tables.attribute = [];
    const before = clone(h.tables.profile);
    const prepared = await withoutRecord.prepare(1);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.equal(h.tables.attribute.length, 1);
    assert.deepEqual(h.tables.profile, before);
    assert.ok(prepared.session.initDiagnostics.some(d => d.problem === 'prefs-duplicate'));
    h.tables.attribute = [];
    assert.equal((await h.session().prepare(1)).ok, true);
    assert.equal(calls, 2);
    assert.equal((await h.ledger.effectiveState()).characters.get('pc-hero').attributes.initialized, true);
});

test('胜利：完整流程产出战报并自动回传，EXP 标签经账本扫描入库', async () => {
    const h = harness();
    const s = h.session();
    const prepared = await s.prepare(1);
    assert.deepEqual([prepared.ok, prepared.session.status, prepared.session.lobby.templated], [true, 'lobby', []]);
    assert.equal(s.start().ok, true);
    assert.notEqual(stored(h, sessionKeyFor('chat-1')), null);
    assert.equal(playOut(s).status, 'ended');
    assert.equal(s.state().battle.outcome, 'victory');
    // 奖励没有生成（本用例不作答）：没有 offer，翻牌为 none，照发不带战利品的战报。
    assert.equal((await s.loadFlip()).ok, true);
    assert.equal(s.state().flip.status, 'none');
    const finished = await s.finish();
    assert.deepEqual([finished.ok, finished.session.status, h.sent.length], [true, 'done', 1]);
    const [text] = h.sent;
    assert.match(text, /<igs-combat-report id="r[0-9a-z]+" result="win" encounter="狭路">/);
    assert.match(text, /\[igs-combat:exp\|主角\|20\|战斗:r[0-9a-z]+\]/);
    assert.doesNotMatch(text, /igs-combat:loot|战利品：/);
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



test('战报已落楼但回执未确认：续战时清掉会话与同场待回传，状态为已回传，不再重发', async () => {
    const h = harness();
    // 宿主收下并落楼，但回执没读到：返回等待回执。会话创建时绑定 send，所以先替换再创建。
    h.send = async (text) => { h.sent.push(text); h.chat.push(user(text)); return { ok: false, reason: 'host-send-awaiting-receipt' }; };
    const s = h.session();
    await s.prepare(1);
    s.start();
    playOut(s);
    const sent = await s.finish();
    assert.deepEqual([sent.ok, sent.session.status], [false, 'send-failed']);
    assert.notEqual(stored(h, outboxKeyFor('chat-1')), null);
    const resumed = h.session().resume();
    assert.deepEqual([resumed.ok, resumed.session.status], [true, 'done']);
    assert.deepEqual([stored(h, sessionKeyFor('chat-1')), stored(h, outboxKeyFor('chat-1'))], [null, null]);
    assert.equal(h.sent.length, 1);
});


test('觉醒标签：主战者写入 setup.awaken 并随续战重放保留；点名他人不带入；无标签时 setup 形状不变', async () => {
    const tagged = (line) => {
        const h = harness();
        h.chat[1] = ai(`前方有动静。\n${line}\n[igs-combat:start|狭路|狼]`);
        return h;
    };
    for (const who of ['我', '主角']) {
        const h = tagged(`[igs-combat:awaken|${who}|怒火|绝不让你们得逞！]`);
        const s = h.session();
        await s.prepare(1);
        const started = s.start();
        assert.deepEqual([started.ok, started.awakenDropped], [true, undefined]);
        assert.deepEqual(s.state().record.setup.awaken, { type: 'rage', line: '绝不让你们得逞！' });
        const resumed = h.session().resume();
        assert.deepEqual([resumed.ok, resumed.session.record.setup.awaken.type], [true, 'rage']);
    }
    const other = tagged('[igs-combat:awaken|爱丽丝|守护|我来挡住]');
    const s2 = other.session();
    await s2.prepare(1);
    const started = s2.start();
    assert.deepEqual([started.ok, started.awakenDropped], [true, 'combat-awaken-not-controlled']);
    assert.equal('awaken' in s2.state().record.setup, false);
    const plain = harness();
    const s3 = plain.session();
    await s3.prepare(1);
    s3.start();
    assert.equal('awaken' in s3.state().record.setup, false);
});


test('装备与道具：已装备的被动进入 setup；持有的道具带入本场，战报落楼后按用量写 consume 并读回余量；无道具时 setup 不带 items', async () => {
    const { scanCombatTags } = await import('../src/scene/combat-directives.js');
    const { gearIdFor, itemIdFor, ledgerEntryId } = await import('../src/combat/schema.js');
    const h = harness();
    const tags = '得到宝剑与丹药。[igs-combat:equip|我|青锋剑|武器][igs-combat:item|我|回春丹|2]';
    h.chat[1] = ai(`${tags}\n[igs-combat:start|狭路|狼]`);
    const [eq, it] = scanCombatTags(tags);
    const entry = (type, tag, payload) => {
        const anchor = { messageId: 1, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId(type, 'pc-hero', anchor), type, character: 'pc-hero', anchor, payload, createdAt: 3 };
    };
    h.tables.ledger.push(
        entry('equip', eq, { gearId: gearIdFor('青锋剑'), name: '青锋剑', slot: 'weapon', passive: { id: 'gp1', name: '剑意', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1, target: 'self' }], description: '' }, description: '' }),
        entry('item', it, { itemId: itemIdFor('回春丹'), name: '回春丹', count: 2, effects: [{ op: 'heal', amount: 12, target: 'self' }], description: '' }),
    );
    const s = h.session();
    await s.prepare(1);
    assert.equal(s.start().ok, true);
    const setup = s.state().record.setup;
    const heroUnit = setup.units.find((u) => u.id === 'pc-hero');
    assert.ok(heroUnit.passives.some((p) => p.id === 'gp1'));
    assert.deepEqual(setup.items.map((i) => [i.itemId, i.count]), [[itemIdFor('回春丹'), 2]]);
    assert.equal(s.state().battle.units['pc-hero'].statuses.strength, 1);
    assert.equal(s.act({ type: 'item', itemId: itemIdFor('回春丹') }).ok, true);
    assert.equal(playOut(s).status, 'ended');
    const finished = await s.finish();
    assert.equal(finished.ok, true);
    assert.equal(finished.consume?.ok, true, JSON.stringify(finished.consume));
    const consumed = h.tables.ledger.filter((e) => e.type === 'consume');
    assert.deepEqual(consumed.map((e) => [e.payload.itemId, e.payload.count, e.anchor.messageId]), [[itemIdFor('回春丹'), 1, h.chat.length - 1]]);
    const view = (await h.ledger.effectiveState()).characters.get('pc-hero');
    assert.deepEqual(view.items.map((i) => i.count), [1]);
    const plain = harness();
    const p = plain.session();
    await p.prepare(1);
    p.start();
    assert.equal('items' in p.state().record.setup, false);
});

const recordOf = (h, combatId) => h.chat[1].extra?.igsCombat?.[combatId];
async function settled() { for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r)); }

test('聊天记录留档：准备后写 prepared，出结果当即写 result；换设备、删战报楼后只能重发同一份战报，EXP 只计一次；开战楼换 swipe 是新的一场', async () => {
    const h = harness({ record: true });
    h.sendOk = false;
    const s = h.session();
    await s.prepare(1);
    const { combatId } = s.state();
    assert.equal(typeof recordOf(h, combatId).prepared.at, 'number');
    s.start();
    assert.equal(playOut(s).status, 'ended');
    await settled();
    const saved = recordOf(h, combatId).result;
    assert.deepEqual([saved.result, saved.outcome], ['win', 'victory']);
    const failed = await s.finish();
    assert.deepEqual([failed.ok, h.sent.length, h.sent[0]], [false, 1, saved.text]);
    // 换设备：本机存档与待回传都不在，聊天记录里有结果 → 不能重打，只能重发同一份。
    h.storage = createMemoryStorage();
    const other = h.session();
    const reopened = await other.prepare(1);
    assert.deepEqual([reopened.session.status, other.start().ok, reopened.session.report.reportId], ['send-failed', false, saved.reportId]);
    h.sendOk = true;
    assert.equal((await other.retrySend()).session.status, 'done');
    assert.deepEqual([h.sent.length, h.sent[1]], [2, saved.text]);
    // 删掉战报楼后再开：仍只能重发同一份，EXP 不叠加。
    h.chat.pop();
    h.storage = createMemoryStorage();
    const third = h.session();
    assert.equal((await third.prepare(1)).session.status, 'send-failed');
    assert.equal(third.start().ok, false);
    assert.equal((await third.retrySend()).ok, true);
    assert.equal(h.sent[2], saved.text);
    assert.equal((await h.ledger.effectiveState()).characters.get('pc-hero').exp, 20);
    // 开战楼换 swipe：是另一场，照常准备到战前。
    h.chat.pop();
    h.chat[1].swipe_id = 1;
    h.storage = createMemoryStorage();
    assert.equal((await h.session().prepare(1)).session.status, 'lobby');
});

test('聊天记录已有 prepared：重开只补主角，不再为敌人请求生成，敌人用模板；没有留档时照常请求', async () => {
    let calls = 0;
    const request = async () => { calls += 1; return '{}'; };
    const profiles = [row(classDef, 1), row(heroDef, 2)];
    await harness({ record: true, profiles, request }).session().prepare(1);
    assert.ok(calls > 0);
    calls = 0;
    const h = harness({ record: true, profiles, request });
    const { combatId } = locateCombatStart(h.chat, 1);
    h.chat[1].extra = { igsCombat: { [combatId]: { prepared: { at: 1 } } } };
    const r = await h.session().prepare(1);
    assert.deepEqual([r.session.status, r.session.lobby.templated, calls], ['lobby', ['狼'], 0]);
});

test('奖励 offer：准备时请求并写日志表，大厅带 EXP 与翻牌数；已有 offer 重开不再请求；失败不阻断、重开不自动请求、可重试；开战楼换 swipe 后旧 offer 作废并按新的一场请求', async () => {
    let calls = 0;
    let good = true;
    const request = async (req) => { calls += 1; return good ? rewardReply(req) : '{}'; };
    const h = harness({ record: true, request });
    const exp = victoryExpFor(['normal']);
    const first = await h.session().prepare(1);
    assert.deepEqual([first.session.status, first.session.reward, calls], ['lobby', { status: 'ready', exp, slots: 3 }, 1]);
    assert.deepEqual(h.tables.ledger.map((e) => [e.type, e.anchor.messageId, e.payload.slots.length]), [['offer', 1, 3]]);
    const again = await h.session().prepare(1);
    assert.deepEqual([again.session.reward.status, calls, h.tables.ledger.length], ['ready', 1, 1]);

    h.chat[1] = { ...h.chat[1], swipe_id: 1 };
    const swiped = await h.ledger.effectiveState();
    assert.deepEqual([swiped.offers.size, swiped.inactive.map((x) => x.reason)], [0, ['swipe-changed']]);
    const fresh = await h.session().prepare(1);
    assert.deepEqual([fresh.session.reward.status, calls, (await h.ledger.effectiveState()).offers.has(fresh.session.combatId)], ['ready', 2, true]);

    calls = 0;
    good = false;
    const h2 = harness({ record: true, request });
    const failed = await h2.session().prepare(1);
    assert.deepEqual([failed.ok, failed.session.status, failed.session.reward.status, failed.session.reward.exp, failed.session.reward.slots], [true, 'lobby', 'failed', exp, 3]);
    assert.ok(failed.session.reward.reason);
    const asked = calls;
    const s = h2.session();
    const reopened = await s.prepare(1);
    assert.deepEqual([reopened.session.reward.status, reopened.session.reward.reason, calls], ['failed', 'combat-reward-missing', asked]);
    good = true;
    const retried = await s.retryReward();
    assert.equal(retried.ok, true, JSON.stringify(retried));
    assert.deepEqual([retried.session.reward, calls, h2.tables.ledger.filter((e) => e.type === 'offer').length], [{ status: 'ready', exp, slots: 3 }, asked + 1, 1]);
    assert.equal((await s.retryReward()).reason, 'combat-reward-not-retryable');
    assert.equal(s.start().ok, true);
});

test('聊天记录写入失败不阻断：照常开战与回传，会话带 recordError，内存里的改动撤回', async () => {
    const h = harness({ record: true });
    h.saveFail = true;
    const s = h.session();
    const prepared = await s.prepare(1);
    assert.deepEqual([prepared.session.status, prepared.session.recordError], ['lobby', 'combat-record-save-failed']);
    assert.equal(h.chat[1].extra, undefined);
    s.start();
    playOut(s);
    const finished = await s.finish();
    assert.deepEqual([finished.ok, finished.session.status, h.sent.length], [true, 'done', 1]);
    assert.equal(h.chat[1].extra, undefined);
    assert.equal((await h.ledger.effectiveState()).characters.get('pc-hero').exp, 20);
});

test('同一场并发准备只跑一次、只留档一次，结束时通知订阅者；留档损坏时 fail-closed 阻断', async () => {
    const h = harness({ record: true });
    const s = h.session();
    const seen = [];
    const off = s.subscribe((v) => seen.push(v.status));
    const [a, b] = await Promise.all([s.prepare(1), s.prepare(1)]);
    assert.equal(a, b);
    assert.deepEqual([a.session.status, h.saves, seen], ['lobby', 1, ['lobby']]);
    off();
    await s.prepare(1);
    assert.deepEqual([h.saves, seen], [1, ['lobby']]);
    const bad = harness({ record: true });
    bad.chat[1].extra = { igsCombat: 'broken' };
    const r = await bad.session().prepare(1);
    assert.deepEqual([r.ok, r.reason, r.session.status], [false, 'combat-record-corrupt', 'blocked']);
});

test('翻牌：胜利后读 offer 建背面牌，未翻不能发；翻一张即选定、不能重翻；进度存会话存档与聊天记录，同机续战与换设备都恢复已选的牌；重发时附战利品并入账', async () => {
    const h = harness({ record: true, request: async (req) => rewardReply(req) });
    const s = h.session();
    await s.prepare(1);
    const { combatId, reportId } = s.state();
    s.start();
    assert.equal(playOut(s).status, 'ended');
    await settled();
    assert.equal((await s.loadFlip()).ok, true);
    const flip = s.state().flip;
    assert.deepEqual([flip.status, flip.set, flip.flips, flip.done, flip.cards.length], ['ready', 'main', 1, false, 3]);
    assert.ok(flip.cards.every((c) => !c.faceUp && !('slot' in c)));
    assert.deepEqual([flip.reroll.available, flip.reroll.reason, flip.reroll.cost], [false, 'combat-points-insufficient', 30]);
    const early = await s.finish();
    assert.deepEqual([early.ok, early.reason, h.sent.length], [false, 'combat-flip-required', 0]);
    assert.equal((await s.flip(9)).reason, 'combat-flip-position-invalid');
    assert.equal((await s.flip(1)).ok, true);
    const picked = s.state().flip;
    assert.deepEqual([picked.done, picked.cards.every((c) => c.faceUp), picked.cards.findIndex((c) => c.chosen)], [true, true, 1]);
    const { name } = picked.cards[1].slot;
    assert.equal((await s.flip(0)).reason, 'combat-flip-done');
    assert.equal((await s.reroll()).reason, 'combat-points-insufficient');
    assert.deepEqual(recordOf(h, combatId).flip, { set: 'main', flipped: [1], choice: 1 });
    // 同机续战：会话存档带着已选的牌。
    const again = h.session();
    assert.equal(again.resume().session.status, 'send-failed');
    await again.loadFlip();
    assert.deepEqual([again.state().flip.done, again.state().flip.cards.findIndex((c) => c.chosen)], [true, 1]);
    // 换设备：只剩聊天记录，照样恢复，不能重翻；重发时附上同一件战利品。
    h.storage = createMemoryStorage();
    const other = h.session();
    assert.equal((await other.prepare(1)).session.flip.done, true);
    assert.equal((await other.flip(0)).reason, 'combat-flip-done');
    const sent = await other.retrySend();
    assert.deepEqual([sent.ok, sent.session.status, h.sent.length], [true, 'done', 1]);
    assert.ok(h.sent[0].includes(`「${name}」`) && h.sent[0].includes('战利品：主角'));
    assert.match(h.sent[0], new RegExp(`\\[igs-combat:loot\\|主角\\|${reportId}\\|\\d\\|main\\]$`));
    const state = await h.ledger.effectiveState();
    const loot = h.tables.ledger.filter((e) => e.type === 'loot');
    assert.deepEqual([loot.length, loot[0].payload.slot.name, loot[0].payload.cost, state.loots.get(combatId)?.set], [1, name, 0, 'main']);
    assert.equal(state.characters.get('pc-hero').exp, 20);
});

test('重抽：花积分换备用套重新翻、每场一次，战利品标为 reserve；积分由账本按真实余额裁决；翻牌进度损坏时 fail-closed 不发送', async () => {
    const h = harness({ request: async (req) => rewardReply(req) });
    const real = h.ledger.effectiveState;
    // 只抬高会话看到的余额来走通重抽流程；账本入账仍按真实余额（此处为 0）裁决。
    h.ledger.effectiveState = async () => {
        const st = await real();
        if (st.ok) st.characters.get('pc-hero').points = 100;
        return st;
    };
    const s = h.session();
    await s.prepare(1);
    const { combatId } = s.state();
    s.start();
    playOut(s);
    await s.loadFlip();
    assert.equal(s.state().flip.reroll.available, true);
    assert.equal((await s.flip(0)).ok, true);
    assert.equal((await s.reroll()).ok, true);
    const rerolled = s.state().flip;
    assert.deepEqual([rerolled.set, rerolled.done, rerolled.cards.some((c) => c.faceUp)], ['reserve', false, false]);
    assert.equal((await s.reroll()).reason, 'combat-reroll-used');
    assert.equal((await s.flip(2)).ok, true);
    const finished = await s.finish();
    assert.deepEqual([finished.ok, finished.session.status], [true, 'done']);
    assert.match(h.sent[0], /\|reserve\]$/);
    const loot = h.tables.ledger.find((e) => e.type === 'loot');
    assert.deepEqual([loot.payload.set, loot.payload.cost], ['reserve', 30]);
    const truth = await real();
    assert.deepEqual([truth.loots.has(combatId), truth.diagnostics.some((d) => d.code === 'combat-points-insufficient' && d.id === loot.id)], [false, true]);

    const bad = harness({ record: true, request: async (req) => rewardReply(req) });
    const b = bad.session();
    await b.prepare(1);
    const id = b.state().combatId;
    b.start();
    playOut(b);
    await settled();
    bad.chat[1].extra.igsCombat[id].flip = { set: 'main', flipped: [7], choice: 7 };
    assert.equal((await b.loadFlip()).reason, 'combat-flip-corrupt');
    assert.deepEqual([(await b.finish()).reason, bad.sent.length], ['combat-flip-corrupt', 0]);
});


test('人物特性：准备时按主角装着的特性汇总翻牌联动——再翻多给 1 槽（主套与备用套同为 4 槽）、神话透视亮 2 张；特性被动随主角进入 setup', async () => {
    const h = harness({ request: async (req) => rewardReply(req) });
    const real = h.ledger.effectiveState;
    const passive = (id) => ({ id: `${id}-p`, name: id, trigger: 'battle-start', effects: [{ op: 'block', amount: 6, target: 'self' }], description: '' });
    const traits = [{ traitId: 't1', name: '回眸', rarity: 'rare', link: 'reflip', passive: passive('t1') }, { traitId: 't2', name: '洞明', rarity: 'mythic', link: 'reveal', passive: passive('t2') }];
    // 只给会话看到的主角视图装上特性；联动与被动的汇总由会话完成。
    h.ledger.effectiveState = async () => {
        const st = await real();
        if (st.ok) st.characters.get('pc-hero').traits = traits;
        return st;
    };
    const s = h.session();
    const prepared = await s.prepare(1);
    assert.equal(prepared.session.reward.slots, 4);
    const offer = h.tables.ledger.find((e) => e.type === 'offer');
    assert.deepEqual([offer.payload.slots.length, offer.payload.reserve.length, offer.payload.reveal], [4, 4, 2]);
    assert.equal(s.start().ok, true);
    const unit = s.state().record.setup.units.find((u) => u.id === 'pc-hero');
    assert.deepEqual(['t1-p', 't2-p'].map((id) => unit.passives.some((p) => p.id === id)), [true, true]);
});
