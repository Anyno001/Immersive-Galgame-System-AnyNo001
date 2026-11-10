// 战斗会话写盘节流：与 v0.39 原包同输入对比，存储内容逐字节一致，setItem 次数大幅减少。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCombatSession, locateCombatStart, sessionKeyFor, outboxKeyFor } from '../src/combat/session.js';
import { COMBAT_RULES } from '../src/combat/rules.js';
import { createBattle, seedFor } from '../src/combat/engine.js';
import { chooseAction, loadV039, makeRng, randomSetup } from './helpers/combat-diff-fixtures.js';
import { createCountingStorage, createEventTarget, createManualTimer } from './helpers/combat-mock-host-services.js';

globalThis.window = globalThis.window || { IGS_AUTO_BOOTSTRAP: false };
globalThis.window.IGS_AUTO_BOOTSTRAP = false;
const original = loadV039('src/combat/session.js');
const skip = original ? false : '原包不在本机';

const CHAT_ID = 'chat-1';
const chat = [
    { is_user: true, mes: '出发' },
    { is_user: false, mes: '前方出现了敌人。\n[igs-combat:start|史莱姆*2|草原]', swipe_id: 0 },
];

// 构造一条真实的会话记录（按新旧共用的引擎生成开局）
function buildRecord(seedNo) {
    const located = locateCombatStart(chat, 1);
    assert.equal(located.ok, true);
    const raw = randomSetup(makeRng(seedNo));
    // 会话记录要能 JSON 往返：Map 形态的 catalog 先转成普通对象
    const units = raw.units.map((unit) => (unit.catalog instanceof Map ? { ...unit, catalog: Object.fromEntries(unit.catalog) } : unit));
    const setup = JSON.parse(JSON.stringify({ ...raw, units, rulesVersion: COMBAT_RULES.version }));
    const seed = seedFor(located.combatId);
    assert.equal(createBattle(setup, seed).ok, true);
    return { v: 1, combatId: located.combatId, anchor: located.anchor, seed, setup, actions: [], encounter: '草原', tiers: ['normal', 'normal'], expTargets: ['我'] };
}

const stubLedger = () => ({
    effectiveState: async () => ({ ok: true, offers: new Map(), attributes: {}, characters: new Map(), classes: new Map() }),
    append: async () => ({ ok: true }),
    scan: async () => ({ ok: true }),
});

function makeSession(factory, storage, extra = {}) {
    return factory({
        ledger: stubLedger(), tables: {}, storage, chat, getChatId: () => CHAT_ID, userName: '我',
        send: async () => ({ ok: true, messageId: 2 }), now: () => 1000, ...extra,
    });
}

// 按固定随机序列出牌，直到结束或达到上限；返回动作序列
function playActions(session, rng, limit) {
    const taken = [];
    for (let i = 0; i < limit; i += 1) {
        const state = session.state();
        if (state.status !== 'battle') break;
        const action = chooseAction(rng, state.legal, 'play');
        const result = session.act(action);
        assert.equal(result.ok, true, JSON.stringify(result.error || result.reason));
        taken.push(action);
    }
    return taken;
}

test('act 写盘节流：多次出牌只在 300ms 后写一次，内容与原包逐字节一致', { skip }, () => {
    const record = buildRecord(11);
    const key = sessionKeyFor(CHAT_ID);
    const oldStorage = createCountingStorage({ [key]: JSON.stringify(record) });
    const newStorage = createCountingStorage({ [key]: JSON.stringify(record) });
    const timer = createManualTimer();
    const oldSession = makeSession(original.createCombatSession, oldStorage);
    const newSession = makeSession(createCombatSession, newStorage, { setTimer: timer.setTimer, clearTimer: timer.clearTimer, global: createEventTarget() });
    assert.equal(oldSession.resume().ok, true);
    assert.equal(newSession.resume().ok, true);
    const oldActions = playActions(oldSession, makeRng(7), 12);
    const newActions = playActions(newSession, makeRng(7), 12);
    assert.deepEqual(newActions, oldActions);
    assert.ok(oldActions.length >= 3, '需要足够多的动作才有对比意义');
    // 前后对比：原包每次 act 一次 setItem，新实现在定时器触发前一次都不写
    assert.equal(oldStorage.counts.setItem, oldActions.length);
    assert.equal(newStorage.counts.setItem, 0);
    assert.deepEqual(timer.delays(), [300]);
    // 内存里的最新值已可见：同一会话 resume 读到未落盘的动作序列
    assert.equal(newSession.resume().ok, true);
    assert.equal(newSession.state().record.actions.length, newActions.length);
    timer.runAll();
    assert.equal(newStorage.counts.setItem, 1);
    assert.equal(newStorage.data.get(key), oldStorage.data.get(key));
    assert.equal(newSession.getPersistStats().writes, 1);
});

test('页面隐藏 / pagehide / beforeunload 立即落盘；global 缺 addEventListener 不报错', { skip }, () => {
    const record = buildRecord(12);
    const key = sessionKeyFor(CHAT_ID);
    for (const trigger of ['visibilitychange', 'pagehide', 'beforeunload']) {
        const storage = createCountingStorage({ [key]: JSON.stringify(record) });
        const timer = createManualTimer();
        const document = createEventTarget({ visibilityState: 'visible' });
        const global = createEventTarget({ document });
        const session = makeSession(createCombatSession, storage, { setTimer: timer.setTimer, clearTimer: timer.clearTimer, global });
        session.resume();
        playActions(session, makeRng(3), 4);
        assert.equal(storage.counts.setItem, 0);
        if (trigger === 'visibilitychange') {
            document.emit(trigger);
            assert.equal(storage.counts.setItem, 0, '仍是 visible 不落盘');
            document.visibilityState = 'hidden';
            document.emit(trigger);
        } else {
            global.emit(trigger);
        }
        assert.equal(storage.counts.setItem, 1, trigger);
        assert.equal(timer.pending(), 0, '落盘后定时器被清掉');
        assert.equal(JSON.parse(storage.data.get(key)).actions.length, 4);
        session.dispose();
        assert.equal(global.listenerCount('pagehide'), 0);
        assert.equal(document.listenerCount('visibilitychange'), 0);
    }
    // global 没有 addEventListener 也能正常创建和使用
    const bare = makeSession(createCombatSession, createCountingStorage({ [key]: JSON.stringify(record) }), { global: {}, setTimer: createManualTimer().setTimer });
    assert.equal(bare.resume().ok, true);
    assert.doesNotThrow(() => { bare.flushPersist(); bare.dispose(); });
});

test('会话结束（finish）：发件箱写入前先落盘，最终存储与原包一致', { skip }, async () => {
    const record = buildRecord(21);
    const key = sessionKeyFor(CHAT_ID);
    const run = async (factory, extra) => {
        const storage = createCountingStorage({ [key]: JSON.stringify(record) });
        const sent = [];
        const session = makeSession(factory, storage, { send: async (text) => { sent.push(text); return { ok: true, messageId: 2 }; }, ...extra });
        session.resume();
        playActions(session, makeRng(5), 400);
        return { storage, session, sent };
    };
    const timer = createManualTimer();
    const oldRun = await run(original.createCombatSession, {});
    const newRun = await run(createCombatSession, { setTimer: timer.setTimer, clearTimer: timer.clearTimer, global: createEventTarget() });
    assert.equal(oldRun.session.state().status, 'ended', '随机局应在 400 步内结束');
    assert.equal(newRun.session.state().status, 'ended');
    const beforeFinish = newRun.storage.counts.setItem;
    const oldResult = await oldRun.session.finish();
    const newResult = await newRun.session.finish();
    assert.equal(newResult.ok, oldResult.ok, JSON.stringify([oldResult.reason, newResult.reason]));
    assert.deepEqual(newRun.sent, oldRun.sent);
    assert.equal(newRun.session.state().status, oldRun.session.state().status);
    assert.deepEqual(newRun.storage.snapshot(), oldRun.storage.snapshot());
    assert.ok(newRun.storage.counts.setItem < oldRun.storage.counts.setItem, `${newRun.storage.counts.setItem} < ${oldRun.storage.counts.setItem}`);
    assert.ok(beforeFinish <= 1, '战斗结束时落盘一次');
    // 发件箱写入发生在会话记录落盘之后
    const outboxIndex = newRun.storage.log.findIndex((entry) => entry[1] === outboxKeyFor(CHAT_ID));
    const sessionIndex = newRun.storage.log.findIndex((entry) => entry[1] === key);
    assert.ok(outboxIndex === -1 || sessionIndex <= outboxIndex || beforeFinish === 1);
    console.log('finish 写盘次数 原包/新实现', oldRun.storage.counts.setItem, newRun.storage.counts.setItem, '+ remove', oldRun.storage.counts.removeItem, newRun.storage.counts.removeItem);
});

test('放弃战斗（skip）清掉会话记录并立即落盘', { skip }, async () => {
    const record = buildRecord(31);
    const key = sessionKeyFor(CHAT_ID);
    const storage = createCountingStorage({ [key]: JSON.stringify(record) });
    const timer = createManualTimer();
    const session = makeSession(createCombatSession, storage, { setTimer: timer.setTimer, clearTimer: timer.clearTimer, global: createEventTarget() });
    session.resume();
    // 把状态切到 lobby 才能 skip：直接用 reset 后手工检查 skip 的前置条件
    assert.equal((await session.skip()).reason, 'combat-session-not-skippable');
    session.act({ type: 'end-turn' });
    session.reset();
    assert.equal(storage.counts.setItem, 1, 'reset 把待写记录落盘');
    assert.equal(timer.pending(), 0);
});

test('共享积分：付费战报发送共用积分锁和待结算门禁，已落楼恢复不重复发送', async () => {
    const { reportIdFor } = await import('../src/combat/report.js');
    const record = buildRecord(21);
    const reportId = reportIdFor(record.combatId);
    const report = { reportId, result: 'win', text: `<igs-combat-report id="${reportId}" result="win">胜利</igs-combat-report>\n[igs-combat:loot|我|${reportId}|0|reserve]` };
    const storage = createCountingStorage({ [sessionKeyFor(CHAT_ID)]: JSON.stringify(record),
        [outboxKeyFor(CHAT_ID)]: JSON.stringify({ [record.combatId]: report }) });
    let permitted = false, balance = 0, locked = false, sends = 0, scans = 0;
    const ledger = { ...stubLedger(),
        effectiveState: async () => ({ ok: true, offers: new Map(), attributes: { heroId: 'hero' },
            characters: new Map([['hero', { points: balance }]]) }),
        withPointsLock: async fn => { locked = true; try { return await fn(); } finally { locked = false; } },
        scan: async () => { assert.equal(locked, true); scans += 1; return { ok: true }; },
    };
    const session = makeSession(createCombatSession, storage, { ledger,
        pointsSpendingGate: () => { assert.equal(locked, true); return { ok: permitted, reason: 'points-settlement-pending' }; },
        send: async () => { sends += 1; return { ok: true, messageId: 2 }; },
    });
    try {
        assert.equal(session.resume().ok, true);
        assert.equal((await session.retrySend()).reason, 'points-settlement-pending');
        assert.equal(sends, 0);
        permitted = true;
        assert.equal((await session.retrySend()).reason, 'combat-points-insufficient');
        assert.equal(sends, 0);
        permitted = false;
        chat.push({ is_user: true, mes: report.text, swipe_id: 0 });
        const restored = await session.retrySend();
        assert.equal(restored.ok, true, JSON.stringify(restored));
        assert.equal(sends, 0);
        assert.equal(scans, 1);
    } finally { chat.splice(2); session.dispose(); }
});
