import assert from 'node:assert/strict';
import test from 'node:test';
import { createCombatSession, locateCombatStart, sessionKeyFor } from '../src/combat/session.js';
import { seedFor } from '../src/combat/engine.js';
import { flipOrder, revealedOf } from '../src/combat/flip.js';
import { planRewardSlots } from '../src/combat/rewards.js';
import { planChallengeReward } from '../src/combat/challenge-reward.js';
import { battleRandomKeyFor } from '../src/combat/random-domain.js';
import { generateEntities, generationWrites, rewardEntity, templateEnemy } from '../src/combat/generation.js';
import { createCountingStorage } from './helpers/combat-mock-host-services.js';
import { createGenerationFixture } from './helpers/combat-generation-fixture.js';

const reply = async (prompt) => JSON.stringify({ entities: JSON.parse(prompt.user).entities.map((e) => {
    if (e.kind === 'encounter-theme') return { key: e.key, value: { theme: 'western' } };
    assert.equal(e.kind, 'battle-reward', e.kind);
    const values = (slots) => slots.map((s, i) => [`奖励${i}`, s.kind === 'card' ? (s.cost === 0 ? 'flex' : 'strike') : s.kind === 'gear' ? (s.relic ? null : s.templates[0]) : s.kind === 'item' ? 'potion' : null, '测试来历']);
    return { key: e.key, value: { slots: values(e.input.slots), reserve: values(e.input.reserve) } };
}) });

async function fixture(t, chatId) {
    const f = await createGenerationFixture({ chatId });
    t.after(f.dispose);
    const chat = f.host.SillyTavern.getContext().chat;
    chat.push({ is_user: false, mes: '[igs-combat:start|林间遭遇|史莱姆|我|elite]', swipe_id: 0 });
    const floor = chat.length - 1;
    const located = locateCombatStart(chat, floor);
    assert.equal(located.ok, true);
    const raw = f.services.getLedger();
    const enemy = templateEnemy('史莱姆', 'elite');
    const ledger = { ...raw, effectiveState: async () => {
        const state = await raw.effectiveState();
        return { ...state, attributes: { ...state.attributes, table: 'missing' }, enemies: new Map([[enemy.id, enemy]]) };
    } };
    const storage = createCountingStorage();
    const records = new Map();
    const chatRecord = {
        read: (_, id) => ({ ok: true, value: records.get(id) || null }),
        write: async (_, id, patch) => { records.set(id, { ...(records.get(id) || {}), ...structuredClone(patch) }); return { ok: true }; },
    };
    const requests = [];
    const makeSession = () => createCombatSession({ ledger, tables: {}, chat, getChatId: () => chatId, userName: '艾拉', storage, chatRecord,
        request: async (p) => { requests.push(JSON.parse(p.user)); return reply(p); }, llm: { source: 'tavern' }, retryDelays: [], now: () => 1 });
    const session = makeSession();
    t.after(() => session.dispose());
    return { ...f, ledger, storage, records, requests, makeSession, session, located, floor };
}

test('相同开战锚点跨聊天使用独立随机域，奖励的随机键通过账本保留', async (t) => {
    const a = await fixture(t, 'battle-chat-a');
    const b = await fixture(t, 'battle-chat-b');
    const offers = [];
    for (const f of [a, b]) {
        const prepared = await f.session.prepare(f.floor);
        assert.equal(prepared.ok, true, JSON.stringify(prepared));
        const state = f.session.state();
        const offer = (await f.ledger.effectiveState()).offers.get(state.combatId);
        assert.ok(offer, JSON.stringify(state.reward));
        assert.equal(offer.randomKey, state.randomKey);
        assert.equal(f.records.get(state.combatId).randomKey, state.randomKey);
        assert.equal(f.session.start().ok, true);
        assert.equal(f.session.state().record.randomKey, state.randomKey);
        offers.push(offer);
    }
    assert.equal(a.session.state().combatId, b.session.state().combatId, '保留原有场次引用');
    assert.notEqual(a.session.state().record.seed, b.session.state().record.seed);
    assert.notEqual(offers[0].randomKey, offers[1].randomKey);
    const sequence = (chatId) => Array.from({ length: 20 }, (_, i) => {
        const combatId = `cb|${i}|0|test|0`;
        const randomKey = battleRandomKeyFor(chatId, combatId);
        const plan = planRewardSlots({ combatId, randomKey, tier: 'elite', character: { id: 'same', kind: 'deck-character' } });
        const offer = { ...plan, combatId, randomKey, reveal: 2 };
        return { slots: plan.slots, reserve: plan.reserve, main: flipOrder(offer, 'main'), reserveOrder: flipOrder(offer, 'reserve'), revealed: revealedOf(offer, 'main') };
    });
    assert.notDeepEqual(sequence('battle-chat-a'), sequence('battle-chat-b'));
});

test('新战斗重读、续战与重开保留同一随机域，重开只增加重开次数', async (t) => {
    const f = await fixture(t, 'battle-chat-a');
    assert.equal((await f.session.prepare(f.floor)).ok, true);
    assert.equal(f.session.start().ok, true);
    const record = structuredClone(f.session.state().record);
    f.session.flushPersist();
    const resumed = f.makeSession();
    t.after(() => resumed.dispose());
    assert.equal(resumed.resume().ok, true);
    assert.equal(resumed.state().randomKey, record.randomKey);
    assert.equal(resumed.state().record.seed, record.seed);
    assert.deepEqual(resumed.state().battle, f.session.state().battle);
    assert.equal((await resumed.restart()).ok, true);
    assert.equal(resumed.state().record.seed, seedFor(`${record.randomKey}#1`));
    const again = f.makeSession();
    t.after(() => again.dispose());
    assert.equal((await again.prepare(f.floor)).ok, true);
    assert.equal(again.state().randomKey, record.randomKey);
    assert.equal(f.requests.length, 1, '已有奖励和准备记录不重新生成');
});

test('没有随机域的旧奖励、准备记录及续战存档继续使用旧种子和翻牌顺序', async (t) => {
    const f = await fixture(t, 'legacy-chat');
    const hero = await f.hero();
    const { entity } = rewardEntity({ combatId: f.located.combatId, anchor: f.located.anchor, tier: 'elite', character: hero });
    const generated = await generateEntities([entity], { request: reply, llm: { source: 'tavern' } });
    assert.equal(generated.ok, true, JSON.stringify(generated));
    assert.equal((await f.ledger.append(generationWrites(generated, { createdAt: 1 }).entries)).ok, true);
    const before = (await f.ledger.effectiveState()).offers.get(f.located.combatId);
    f.records.set(f.located.combatId, { prepared: { at: 1 } });
    assert.equal((await f.session.prepare(f.floor)).ok, true);
    assert.equal(f.session.state().randomKey, undefined);
    assert.equal(f.session.start().ok, true);
    assert.equal(f.session.state().record.seed, seedFor(f.located.combatId));
    assert.deepEqual((await f.ledger.effectiveState()).offers.get(f.located.combatId), before);
    assert.deepEqual(flipOrder(before, 'main'), flipOrder({ ...before, randomKey: before.combatId }, 'main'));
    f.session.flushPersist();
    const saved = JSON.parse(f.storage.getItem(sessionKeyFor('legacy-chat')));
    assert.equal(saved.randomKey, undefined);
    const resumed = f.makeSession();
    t.after(() => resumed.dispose());
    assert.equal(resumed.resume().ok, true);
    assert.equal(resumed.state().record.seed, saved.seed);
    assert.equal(resumed.state().randomKey, undefined);
});

test('日常挑战跨聊天分开种子与经验奖励，恢复时仍使用已存随机域', async (t) => {
    const sessions = [];
    for (const chatId of ['daily-a', 'daily-b']) {
        const storage = createCountingStorage();
        const chat = [{ is_user: false, mes: '[igs-challenge:期末考试|学习|轻松|压力]', swipe_id: 0 }];
        const make = () => createCombatSession({ chat, getChatId: () => chatId, userName: '我', storage,
            kinds: { combat: false, challenge: true }, challenge: { state: { bars: { stamina: 100, stress: 0 }, skills: { 学习: { value: 100 } } } },
            retryDelays: [] });
        const session = make();
        t.after(() => session.dispose());
        assert.equal((await session.prepare(0)).ok, true);
        assert.equal(session.start().ok, true);
        const state = session.state();
        const reward = planChallengeReward({ combatId: state.combatId, randomKey: state.randomKey, outcome: '圆满', tier: '轻松', foe: state.challenge.foe, domain: '学习' });
        assert.equal(reward.ok, true);
        session.flushPersist();
        const reload = make();
        t.after(() => reload.dispose());
        assert.equal(reload.resume().ok, true);
        assert.equal(reload.state().randomKey, state.randomKey);
        assert.equal(reload.state().record.seed, state.record.seed);
        sessions.push({ seed: state.record.seed, reward });
    }
    assert.notEqual(sessions[0].seed, sessions[1].seed);
    assert.notEqual(sessions[0].reward.seed, sessions[1].reward.seed);
    assert.notEqual(sessions[0].reward.card.id, sessions[1].reward.card.id);
});
