import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { initRecord } from '../src/scene/stats/stat-log.js';
import { createMockHost } from './helpers/combat-mock-host-services.js';

async function fixture(t, { ready = false } = {}) {
    const db = createMockHost({ supportCallbacks: true });
    const table = createCombatTables({ api: db.api });
    assert.equal((await table.ensure()).ok, true);
    const records = [initRecord(createStatsState({ money: 3000 })),
        { id: 'chat-enabled', type: 'chat', character: '主角', anchor: null, createdAt: 1, change: '启用', payload: { key: 'chat:enabled', value: true } }];
    assert.equal((await table.append('stats', records)).ok, true);
    const callbacks = new Map();
    const ctx = { name1: '主角', chat: [], chatMetadata: {}, extensionPrompts: {}, getCurrentChatId: () => 'wallet-test',
        eventTypes: { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' },
        eventSource: { on(n, fn) { callbacks.set(n, fn); }, removeListener(n) { callbacks.delete(n); } } };
    const global = { SillyTavern: { getContext: () => ctx }, ...(ready ? { AutoCardUpdaterAPI: db.api } : {}) };
    const combat = createCombatServices({ global, getChatId: () => 'wallet-test', getUserName: () => '主角',
        getReaderSettings: () => ({ combatExpansion: { enabled: true } }) });
    const runtime = createStatsRuntime({ getContext: () => ctx, readSettings: () => ({ enabled: true }), statsTables: combat.statsTables });
    t.after(() => { runtime.destroy(); combat.resetChat(); });
    runtime.sync();
    return { db, global, runtime, combat, callbacks };
}

test('数据库比数值模块晚就绪：已挂聊天监听且曾报 unsupported，钱包读取仍能恢复原有 3000，不写存档', async (t) => {
    const f = await fixture(t);
    assert.ok(f.callbacks.size > 0);
    assert.equal(f.runtime.chatStatus().blocked, 'combat-table-host-unsupported');
    assert.equal(f.runtime.walletMoney(), 0);
    const before = f.db.calls.insertRow;
    f.global.AutoCardUpdaterAPI = f.db.api;
    assert.equal(f.runtime.walletMoney(), 3000);
    assert.equal(f.runtime.chatStatus().blocked, '');
    assert.equal(f.runtime.isChatEnabled(), true);
    assert.equal(f.db.calls.insertRow, before);
});

test('用户改表后版本更新：钱包重读新金额；未变化时继续复用缓存', async (t) => {
    const f = await fixture(t, { ready: true });
    assert.equal(f.runtime.walletMoney(), 3000);
    const version = f.combat.statsTables().version;
    const sheet = Object.values(f.db.sheets).find((s) => s.name === 'IGS数值·日志');
    const columns = sheet.content[0];
    const row = sheet.content.find((r) => r[columns.indexOf('类型')] === 'init');
    const jsonColumn = columns.indexOf('载荷JSON');
    const payload = JSON.parse(row[jsonColumn]);
    payload.state.protagonist.bars.money = 4500;
    row[jsonColumn] = JSON.stringify(payload);
    f.db.fireTableUpdated();
    assert.notEqual(f.combat.statsTables().version, version);
    assert.equal(f.runtime.walletMoney(), 4500);
    const reads = f.db.calls.exportTableAsJson;
    const state = f.runtime.getState();
    assert.equal(f.runtime.walletMoney(), 4500);
    assert.equal(f.runtime.getState(), state);
    assert.equal(f.db.calls.exportTableAsJson, reads);
});

test('P8 v2 统一共享积分表：三来源收入与跨来源消费同源一致，不叠旧钱包，重复 sourceId 只计一次且切 swipe 回滚', async (t) => {
    const { createIgsChatStore } = await import('../src/data/shujuku/igs-chat-store.js');
    const { IGS_TABLE_SPECS } = await import('../src/data/shujuku/igs-table-specs.js');
    const { readIgsChatEvidence } = await import('../src/storage/igs-chat-evidence.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createOriginRuntime } = await import('../src/core/origin-runtime.js');
    const { createPointsFloorRecord } = await import('../src/host/points-floor-record.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const { createHarness, blk } = await import('./origin-host.js');

    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const game = createHarness({ enabled: false });
    game.engine.stop();
    const globalObj = { AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => game.ctx } };
    const chatStore = createIgsChatStore({
        api: () => db.api,
        chatId: () => game.ctx.chatId,
        chat: () => game.ctx.chat,
        userName: () => '艾拉',
        storage,
        evidence: chatId => readIgsChatEvidence({ context: game.ctx, chatId, storage }),
    });
    const pointsFloorRecord = createPointsFloorRecord(globalObj);
    const combat = createCombatServices({
        global: globalObj,
        chatStore,
        storage,
        pointsFloorRecord,
        getChatId: () => game.ctx.chatId,
        getChat: () => game.ctx.chat,
        getUserName: () => '艾拉',
        // 即使传入非零旧钱包份额，v2 共享积分也绝不叠加。
        getWallet: () => 9999,
        getReaderSettings: () => ({ combatExpansion: { enabled: true } }),
    });
    const origin = createOriginRuntime({
        getContext: () => game.ctx,
        readSettings: () => ({ enabled: true, achieveOn: false }),
        readLlm: () => ({}),
        combatServices: combat,
        chatStore,
        storage,
        pointsFloorRecord,
        notice: (kind, text) => game.notes.push({ kind, text }),
    });
    t.after(() => { origin.destroy(); combat.dispose(); chatStore.dispose(); });
    origin.sync();
    await origin.engine.whenSaved();
    assert.equal(chatStore.get().layout().layout, 'v2');

    // 初始余额严格为 0，不叠加 getWallet()=9999
    assert.equal((await combat.readSharedPoints()).balance, 0);
    assert.equal(origin.engine.getState().points, 0);

    // 1) AI 楼层：Origin 杂项请求 +30 按现行额度策略核准 +20
    game.user();
    const aiFloor = game.ai('第一笔收益' + blk('积分|+30|主线'));
    await origin.engine.whenSaved();
    assert.equal((await combat.readSharedPoints()).balance, 20);
    assert.equal(origin.engine.getState().points, 20);

    // 2) 小游戏收入 +20（贪吃蛇通关）
    const started = await combat.points().start({ game: 'snake', messageId: aiFloor });
    assert.equal(started.ok, true, started.reason);
    const awarded = await combat.points().award(started.roundId, { terminal: true, won: true, score: 25 });
    assert.equal(awarded.ok, true, awarded.reason);
    assert.equal(awarded.amount, 20);
    assert.equal((await combat.readSharedPoints()).balance, 40);

    // 3) 战斗战报收入 +15（重复同 sourceId 只计一次）
    const bp1 = await combat.points().credit({ sourceId: 'combat-battle:cb1:r1', domain: 'combat', amount: 15, messageId: aiFloor });
    assert.equal(bp1.ok, true, bp1.reason);
    const bpDup = await combat.points().credit({ sourceId: 'combat-battle:cb1:r1', domain: 'combat', amount: 15, messageId: aiFloor });
    assert.equal(bpDup.ok, true);
    assert.equal(bpDup.present, true);
    assert.equal((await combat.readSharedPoints()).balance, 55);
    assert.equal(origin.engine.getState().points, 55);

    // 4) 跨来源消费：Origin 商店购买 40 积分凝神丹，共享余额变为 15
    const bought = await origin.engine.dispatch({ type: 'buy', name: '凝神丹' });
    assert.equal(bought.ok, true, bought.reason);
    assert.equal((await combat.readSharedPoints()).balance, 15);
    assert.equal(origin.engine.getState().points, 15);
    assert.equal(origin.engine.getState().bag.find(item => item.name === '凝神丹')?.count, 1);

    // 5) 余额不足时拒绝再次购买（15 < 40）
    assert.equal((await origin.engine.dispatch({ type: 'buy', name: '凝神丹' })).ok, false);
    assert.equal((await combat.readSharedPoints()).balance, 15);

    // 6) 实际核对共享积分表落库流水
    const pointsSheet = db.sheets[IGS_TABLE_SPECS.points.uid];
    assert.ok(pointsSheet && pointsSheet.content.length > 1, '所有来源应落共享积分表');

    // 7) 切 swipe 回滚该楼层锚定的收入（小游戏 +20、战斗 +15、Origin +30 随旧 swipe 失效；已发货支出 -40 保留）
    game.newSwipe(aiFloor, '第二条分支，无奖励');
    await origin.engine.whenSaved();
    assert.equal((await combat.readSharedPoints()).balance, -40);
});

test('P8 v2 扣款成功发货失败阻塞新消费并只补缺阶段，损坏积分记录拒绝消费不假定为零', async (t) => {
    const { createIgsChatStore } = await import('../src/data/shujuku/igs-chat-store.js');
    const { IGS_TABLE_SPECS } = await import('../src/data/shujuku/igs-table-specs.js');
    const { readIgsChatEvidence } = await import('../src/storage/igs-chat-evidence.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createPointsFloorRecord } = await import('../src/host/points-floor-record.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');

    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const ctx = {
        chatId: 'p8-recovery',
        chat: [{ is_user: true, mes: '开局' }, { is_user: false, mes: '世界展开。', swipe_id: 0 }],
        chatMetadata: {},
        saveChat: async () => {},
    };
    const globalObj = { AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => ctx } };
    const chatStore = createIgsChatStore({
        api: () => db.api, chatId: () => ctx.chatId, chat: () => ctx.chat, storage,
        evidence: chatId => readIgsChatEvidence({ context: ctx, chatId, storage }),
    });
    const combat = createCombatServices({
        global: globalObj, chatStore, storage,
        pointsFloorRecord: createPointsFloorRecord(globalObj),
        getChatId: () => ctx.chatId, getChat: () => ctx.chat, getUserName: () => '艾拉',
        getReaderSettings: () => ({ combatExpansion: { enabled: true } }),
    });
    t.after(() => { combat.dispose(); chatStore.dispose(); });

    assert.equal((await combat.points().credit({ sourceId: 'seed-1', domain: 'combat', amount: 100, messageId: 1 })).ok, true);
    assert.equal((await combat.readSharedPoints()).balance, 100);

    // 第一阶段扣款成功（-60），但第二阶段发货（apply）失败
    let applyCalls = 0;
    const failed = await combat.points().spend({
        sourceId: 'op-draw-1', domain: 'combat', cost: 60, action: 'draw', messageId: 1,
        apply: async () => { applyCalls += 1; return { ok: false, reason: 'target-write-failed' }; },
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.stage, 'apply');
    assert.equal(applyCalls, 1);
    assert.equal((await combat.readSharedPoints()).balance, 40);
    // 待恢复状态阻塞冲突的新消费
    assert.equal(combat.pointsSpendingGate().ok, false);
    assert.equal(combat.pointsSpendingGate().reason, 'points-settlement-pending');
    const blockedSpend = await combat.points().spend({
        sourceId: 'op-other', domain: 'combat', cost: 10, action: 'buy', messageId: 1,
        apply: async () => ({ ok: true }),
    });
    assert.equal(blockedSpend.reason, 'points-settlement-pending');

    // 显式恢复只补执行 apply 并落 debit-done，不重复扣分
    const recovered = await combat.points().recoverOperation('op-draw-1', {
        apply: async () => { applyCalls += 1; return { ok: true, delivered: 'card-a' }; },
    });
    assert.equal(recovered.ok, true, recovered.reason);
    assert.equal(recovered.done, true);
    assert.equal(applyCalls, 2);
    assert.equal((await combat.readSharedPoints()).balance, 40, '恢复不得重复扣分');
    assert.equal(combat.pointsSpendingGate().ok, true);

    // 损坏共享积分表时，余额读失败且拒绝消费，绝不假定为零
    const sheet = db.sheets[IGS_TABLE_SPECS.points.uid];
    const jsonCol = sheet.content[0].indexOf('载荷JSON');
    sheet.content[1][jsonCol] = '{corrupted';
    chatStore.get().client.invalidate();
    const badRead = await combat.readSharedPoints();
    assert.equal(badRead.ok, false);
    const badSpend = await combat.points().spend({
        sourceId: 'op-corrupt', domain: 'combat', cost: 10, action: 'buy', messageId: 1,
        apply: async () => ({ ok: true }),
    });
    assert.equal(badSpend.ok, false);
});

test('P8 单开 Origin（无战斗与数值服务）：使用共享积分表与独立锁完成收支、断写恢复且通知只发一次', async (t) => {
    const { createIgsChatStore } = await import('../src/data/shujuku/igs-chat-store.js');
    const { IGS_TABLE_SPECS } = await import('../src/data/shujuku/igs-table-specs.js');
    const { COMBAT_TABLE_SPECS } = await import('../src/data/shujuku/combat-tables.js');
    const { readIgsChatEvidence } = await import('../src/storage/igs-chat-evidence.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createOriginRuntime } = await import('../src/core/origin-runtime.js');
    const { createPointsFloorRecord } = await import('../src/host/points-floor-record.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const { createHarness, blk } = await import('./origin-host.js');

    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const game = createHarness({ enabled: false });
    game.engine.stop();
    const globalObj = { AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => game.ctx } };
    const chatStore = createIgsChatStore({
        api: () => db.api, chatId: () => game.ctx.chatId, chat: () => game.ctx.chat, storage,
        evidence: chatId => readIgsChatEvidence({ context: game.ctx, chatId, storage }),
    });
    const origin = createOriginRuntime({
        getContext: () => game.ctx,
        readSettings: () => ({ enabled: true, achieveOn: false }),
        readLlm: () => ({}),
        chatStore,
        storage,
        pointsFloorRecord: createPointsFloorRecord(globalObj),
        notice: (kind, text) => game.notes.push({ kind, text }),
    });
    t.after(() => { origin.destroy(); chatStore.dispose(); });
    origin.sync();
    await origin.engine.whenSaved();

    // 不建立战斗表和数值表
    assert.equal(db.sheets[COMBAT_TABLE_SPECS.profile.uid], undefined);
    assert.equal(db.sheets[IGS_TABLE_SPECS.stats.uid], undefined);

    // 按现行 Origin 额度策略核准收入（每楼上限 20，分 4 楼累计 80）
    for (let i = 1; i <= 4; i += 1) {
        game.user();
        game.ai(`单开收益${i}` + blk(`积分|+20|奖励${i}`));
        await origin.engine.whenSaved();
    }
    assert.equal(origin.engine.getState().points, 80);

    // 模拟抽奖扣共享积分成功，但写 Origin 独立表失败
    const insert = db.api.insertRow;
    const originSheetName = IGS_TABLE_SPECS.origin.name;
    let failOriginWrite = true;
    db.api.insertRow = (first, second) => {
        const name = typeof first === 'object' ? first.tableName : first;
        if (failOriginWrite && name === originSheetName) return -1;
        return insert(first, second);
    };
    const drawFail = await origin.engine.dispatch({ type: 'draw' });
    assert.equal(drawFail.ok, false);
    assert.equal(game.notes.filter(n => /抽中/.test(n.text)).length, 0);
    // 恢复 Origin 表写能力后重试，只补写原结果并完成 debit-done，积分精确为 20，通知只发一次
    failOriginWrite = false;
    const recovered = await origin.engine.retrySave();
    assert.equal(recovered.ok, true, recovered.reason);
    assert.equal(origin.engine.getState().points, 20);
    assert.equal(game.notes.filter(n => /抽中/.test(n.text)).length, 1);
    assert.equal((await origin.engine.retrySave()).ok, true);
    assert.equal(game.notes.filter(n => /抽中/.test(n.text)).length, 1, '重复重试不发双通知');
    assert.equal(db.sheets[COMBAT_TABLE_SPECS.profile.uid], undefined);
    assert.equal(db.sheets[IGS_TABLE_SPECS.stats.uid], undefined);
});
