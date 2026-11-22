import assert from 'node:assert/strict';
import test from 'node:test';
import { createCombatSession, locateCombatStart, sessionKeyFor } from '../src/combat/session.js';
import { seedFor } from '../src/combat/engine.js';
import { flipOrder, revealedOf } from '../src/combat/flip.js';
import { planRewardSlots } from '../src/combat/rewards.js';
import { planChallengeReward } from '../src/combat/challenge-reward.js';
import { battleRandomKeyFor } from '../src/combat/random-domain.js';
import { generateEntities, generationWrites, rewardEntity, templateEnemy } from '../src/combat/generation.js';
import { reportIdFor } from '../src/combat/report.js';
import { createCombatChatRecord } from '../src/host/combat-chat-record.js';
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
    const makeSession = (overrides = {}) => createCombatSession({ ledger, tables: {}, chat, getChatId: () => chatId, userName: '艾拉', storage, chatRecord,
        request: async (p) => { requests.push(JSON.parse(p.user)); return reply(p); }, llm: { source: 'tavern' }, retryDelays: [], now: () => 1, ...overrides });
    const session = makeSession();
    t.after(() => session.dispose());
    return { ...f, ledger, storage, records, requests, makeSession, session, located, floor };
}

test('候选保存未确认后，重建会话再双击重试只保存一次原候选，不再请求模型', async (t) => {
    const f = await fixture(t, 'reward-save-retry');
    const submitted = [];
    let enterSave, finishSave;
    const entered = new Promise((resolve) => { enterSave = resolve; });
    const pending = new Promise((resolve) => { finishSave = resolve; });
    const ledger = { ...f.ledger, async append(entries, options) {
        if (entries.some((entry) => entry.type === 'offer')) {
            submitted.push(structuredClone(entries));
            if (submitted.length === 1) return { ok: false, reason: 'combat-ledger-insert-failed' };
            enterSave();
            await pending;
        }
        return f.ledger.append(entries, options);
    } };
    const initial = f.makeSession({ ledger, generationMaxRounds: 0 });
    t.after(() => { finishSave(); initial.dispose(); });

    assert.equal((await initial.prepare(f.floor)).ok, true);
    assert.equal(initial.state().reward.stage, 'save');
    initial.dispose();
    const session = f.makeSession({ ledger, generationMaxRounds: 0 });
    t.after(() => session.dispose());
    assert.equal((await session.prepare(f.floor)).ok, true);
    assert.equal(session.state().reward.status, 'failed');
    assert.equal(session.state().reward.stage, 'save');
    assert.equal(submitted.length, 1, '重新打开不自动补写');
    assert.equal(f.requests.length, 1);
    const first = session.retryReward();
    const second = session.retryReward();
    await entered;
    assert.equal(session.state().reward.status, 'pending');
    finishSave();
    assert.ok((await Promise.all([first, second])).every((result) => result.ok));
    assert.equal(f.requests.length, 1, '保存重试不能重发模型');
    assert.deepEqual(submitted, [submitted[0], submitted[0]]);
    assert.equal(session.state().reward.status, 'ready');
    assert.ok((await f.ledger.effectiveState()).offers.has(f.located.combatId));
});

test('停止奖励生成后迟到回包不落账、不通知，也不解除新重试的单飞', async (t) => {
    for (const outcome of ['success', 'failure']) await t.test(outcome, async t => {
        const f = await fixture(t, 'reward-retry-failure');
        const old = Promise.withResolvers(), next = Promise.withResolvers();
        const oldStarted = Promise.withResolvers(), nextStarted = Promise.withResolvers();
        let calls = 0;
        const session = f.makeSession({ generationMaxRounds: 0, request: async (p, opts) => {
            calls += 1;
            if (calls === 1) return '不是 JSON';
            if (calls === 2) {
                oldStarted.resolve(opts.signal);
                await old.promise;
                if (outcome === 'failure') throw Error('模拟迟到失败');
            } else if (calls === 3) {
                nextStarted.resolve();
                await next.promise;
            } else assert.fail('重试未合并');
            return reply(p);
        } });
        t.after(() => { old.resolve(); next.resolve(); session.dispose(); });
        assert.equal((await session.prepare(f.floor)).ok, true);
        assert.equal(session.state().reward.status, 'failed');

        const abort = new AbortController();
        const first = session.retryReward({ signal: abort.signal });
        const sentSignal = await oldStarted.promise;
        const follower = session.retryReward();
        assert.equal(session.state().reward.status, 'pending');
        abort.abort();
        assert.equal(sentSignal.aborted, true);
        assert.equal(session.state().reward.status, 'failed');

        const newer = session.retryReward();
        await nextStarted.promise;
        const notices = [];
        const unsubscribe = session.subscribe(value => notices.push(value));
        t.after(unsubscribe);
        old.resolve();
        for (const result of await Promise.all([first, follower])) assert.equal(result.reason, 'request-stale');
        assert.equal(notices.length, 0);
        assert.equal((await f.ledger.effectiveState()).offers.has(f.located.combatId), false);
        assert.equal(session.state().reward.status, 'pending');
        const newerFollower = session.retryReward();
        next.resolve();
        assert.ok((await Promise.all([newer, newerFollower])).every(result => result.ok));
        assert.equal(calls, 3);
        assert.equal(session.state().reward.status, 'ready', JSON.stringify(session.state().reward));
    });
});

test('备战保存已落库但回执迟到：停止后不发布旧大厅，再备战只回读原候选', async (t) => {
    const f = await fixture(t, 'reward-save-retry');
    const dispatched = Promise.withResolvers(), callback = Promise.withResolvers();
    let appends = 0;
    const ledger = { ...f.ledger, async append(entries, options) {
        appends += 1;
        const saved = await f.ledger.append(entries, options);
        dispatched.resolve(saved);
        await callback.promise;
        return saved;
    } };
    const session = f.makeSession({ ledger, generationMaxRounds: 0 });
    const abort = new AbortController();
    t.after(() => { callback.resolve(); session.dispose(); });
    const states = [];
    t.after(session.subscribe(state => states.push(state.status)));

    const first = session.prepare(f.floor, { signal: abort.signal });
    assert.equal((await dispatched.promise).ok, true);
    assert.equal(session.state().status, 'preparing');
    const follower = session.prepare(f.floor);
    abort.abort();
    assert.equal(session.state().status, 'blocked');
    assert.equal(session.state().reason, 'request-stale');
    assert.equal(f.records.size, 0);
    const original = (await f.ledger.effectiveState()).offers.get(f.located.combatId);
    assert.ok(original);
    callback.resolve();
    for (const result of await Promise.all([first, follower])) assert.equal(result.reason, 'request-stale');
    assert.deepEqual(states, []);

    assert.equal((await session.prepare(f.floor, { recoverReward: true })).ok, true);
    assert.equal(session.state().reward.status, 'ready');
    assert.equal(appends, 1);
    assert.equal(f.requests.flatMap(request => request.entities).filter(e => e.kind === 'battle-reward').length, 1);
    assert.deepEqual((await f.ledger.effectiveState()).offers.get(f.located.combatId), original);
    assert.deepEqual(states, ['lobby']);
});

test('恢复已留档战报期间停止备战，迟到账本回读不发布翻牌状态', async (t) => {
    const f = await fixture(t, 'reward-save-retry');
    const started = Promise.withResolvers(), read = Promise.withResolvers();
    const { combatId } = f.located;
    f.records.set(combatId, { result: { reportId: reportIdFor(combatId), result: 'win', text: '已留档战报' } });
    const session = f.makeSession({ ledger: { ...f.ledger, async effectiveState() {
        started.resolve();
        await read.promise;
        return f.ledger.effectiveState();
    } } });
    t.after(() => { read.resolve(); session.dispose(); });
    const notices = [];
    t.after(session.subscribe(state => notices.push(state.flip?.status)));
    const abort = new AbortController();
    const pending = session.prepare(f.floor, { signal: abort.signal });
    await started.promise;
    abort.abort();
    read.resolve();
    assert.equal((await pending).reason, 'request-stale');
    assert.deepEqual(notices, []);
});

test('战斗留档失败只回滚原楼层中本次仍持有的记录，迟到回执不确认另一滑页', async (t) => {
    const anchor = { messageId: 0, swipeId: 0 };
    const opening = { prepared: { at: 1 } };
    for (const mode of ['save-failure', 'stopped-failure', 'newer-record', 'swipe']) await t.test(mode, async () => {
        const original = () => ({ unrelated: true, igsCombat: { fight: structuredClone(opening) } });
        const firstSwipe = { extra: original() }, otherSwipe = { extra: { otherSwipe: true } };
        const floor = { swipe_id: 0, extra: original(), swipe_info: [firstSwipe, otherSwipe] };
        const saved = Promise.withResolvers();
        const chat = [floor];
        let saves = 0, alive = true;
        const record = createCombatChatRecord({ SillyTavern: { getContext: () => ({ chat, saveChat: () => { saves += 1; return saved.promise; } }) } });

        const pending = record.write(anchor, 'fight', { prepared: { at: 2 } }, { shouldStart: () => alive });
        assert.equal(saves, 1);
        if (mode === 'swipe') {
            floor.swipe_id = 1;
            floor.extra = otherSwipe.extra;
            saved.resolve();
            assert.equal((await pending).reason, 'combat-record-stale');
            assert.deepEqual(otherSwipe.extra, { otherSwipe: true });
            assert.equal(record.read({ ...anchor, swipeId: 1 }, 'fight').value, null);
        } else {
            if (mode === 'stopped-failure') alive = false;
            const latest = { prepared: { at: 3 } };
            if (mode === 'newer-record') floor.extra.igsCombat.fight = latest;
            saved.reject(new Error('模拟宿主保存失败'));
            assert.equal((await pending).reason, alive ? 'combat-record-save-failed' : 'combat-record-stale');
            assert.deepEqual(record.read(anchor, 'fight').value, mode === 'newer-record' ? latest : opening);
            assert.deepEqual(firstSwipe.extra, original());
        }
        assert.equal(saves, 1, '旧回执不能再调用宿主写口');
    });
});

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
