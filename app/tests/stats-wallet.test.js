import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createCombatLedger } from '../src/combat/ledger.js';
import { applyBarDirective, walletBalance } from '../src/scene/stats/stat-bars.js';
import { composeStatsHud, dropUserFavor, protagonistStatMetrics, overlayStatsMetrics } from '../src/scene/stats/stat-metrics.js';
import { buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { applyFxToDom, cancelFxEffects, playStatsFeedback, playStatsFeedbackWithHud } from '../src/visual/igs-ui/fx-runtime.js';
import { createStatsLedger, currentStatsState, deleteFloorsFrom } from '../src/scene/stats/stat-ledger.js';
import { settleFloor } from '../src/scene/stats/stat-ledger-settle.js';
import { FakeEl, makeStage, makeTimers } from './helpers/fake-dom.js';

if (!Object.getOwnPropertyDescriptor(FakeEl.prototype, 'classList')) {
    Object.defineProperty(FakeEl.prototype, 'classList', { get() {
        const el = this;
        const list = () => String(el.className).split(/\s+/).filter(Boolean);
        return { add: (...n) => { el.className = [...new Set([...list(), ...n])].join(' '); }, remove: (...n) => { el.className = list().filter((x) => !n.includes(x)).join(' '); }, contains: (n) => list().includes(n) };
    } });
}

// ---------- 战斗花费：积分不足但合并余额足够 ----------
const attack = (id) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] });
const guard = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const STARTER = ['basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend', 'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2'];
const classDef = (id) => ({
    kind: 'class', id, className: id === 'cls-mage' ? '术士' : '剑士', archetype: 'warrior',
    classPassive: { id: `p-${id}`, name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] },
    classPool: [1, 2, 5, 6].map((n) => attack(`c${n}`)).concat([3, 4, 7, 8].map((n) => guard(`c${n}`))),
});
const heroDef = () => ({
    kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
    personalPassive: { id: 'pp-pc-hero', name: '意志', trigger: 'on-low-hp', effects: [{ op: 'block', amount: 6 }] },
    personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')], starterDeck: [...STARTER],
});
const row = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });
const clone = (v) => JSON.parse(JSON.stringify(v));
function memoryTables(profile) {
    const tables = { profile: [...profile], ledger: [] };
    tables.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(tables.profile), ledger: clone(tables.ledger) });
    tables.append = async (kind, records) => {
        const written = [];
        for (const record of records) if (!tables[kind].some((x) => x.id === record.id)) { tables[kind].push(clone(record)); written.push(record.id); }
        return { ok: true, written, present: [], rejected: [], pending: [] };
    };
    return tables;
}
const walletLedger = (money) => {
    const holder = { money };
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(classDef('cls-mage'), 2), row(heroDef(), 3)]);
    const ledger = createCombatLedger({ tables, chat: () => [{ mes: '出发', is_user: true }], userName: '主角', now: () => 7, wallet: () => holder.money });
    return { holder, tables, ledger };
};
const heroOf = (state) => state.characters.get('pc-hero');

test('钱包为 0 或取值抛错时，主角余额与旧行为一致', async () => {
    const { ledger } = walletLedger(0);
    assert.equal(heroOf(await ledger.effectiveState()).points, 0);
    const bad = createCombatLedger({ tables: memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 3)]), chat: () => [{ mes: '出发', is_user: true }], userName: '主角', wallet: () => { throw new Error('x'); } });
    assert.equal(heroOf(await bad.effectiveState()).points, 0);
});

// ---------- 状态栏开、关 + 好感飘字去重 ----------
const favorTexts = (root) => {
    const stack = root.querySelector('.igs-fx-favor-stack');
    return stack ? stack.children.map((el) => el.textContent) : [];
};
const READER = { favorToast: { enabled: true } };
const fx = { messageId: 9, toasts: [{ target: '小雪', delta: 4, up: true, text: '♥' }], growth: [{ skill: '说服', from: 30, to: 33, gain: 3 }], stages: [{ target: '小雪', from: '陌生', to: '熟人' }, { target: '阿福', from: 'a', to: 'b' }] };

// ---------- 数值系统运行时：主角条与钱包 ----------

function runtimeSetup({ combat = false, points = 0, bars, userCharacter = () => '', characterAliases = () => ({}) } = {}) {
    const ctx = { name1: '阿明', name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {}, eventSource: { on() {}, removeListener() {} }, eventTypes: {}, getCurrentChatId: () => 'chat-w', setExtensionPrompt() {}, saveMetadata() {} };
    const tables = { rows: [], version: 0 };
    const rt = createStatsRuntime({
        getContext: () => ctx,
        readSettings: () => ({ enabled: true, ...(bars ? { bars } : {}) }),
        statsTables: () => ({ ok: true, get version() { return tables.version; }, read: () => ({ ok: true, stats: tables.rows.slice() }), append(r) { tables.rows.push(...r); tables.version += 1; return Promise.resolve({ ok: true }); }, ensure: () => Promise.resolve({ ok: true }) }),
        combatEnabled: () => combat,
        userCharacter, characterAliases,
        combatSource: () => ({ readPoints: () => points, readVitals: () => ({ hp: 7, maxHp: 10, down: false }), readAbilities: () => null, refresh: () => Promise.resolve({ ok: true }) }),
    });
    rt.sync();
    rt.enableForChat();
    return rt;
}

// ---------- 楼层回退：数值侧金钱与战斗侧积分各自回退 ----------
test('金钱合并后楼层回退：bars.money 随数值账本回退，战斗积分流水随锚点楼回退，互不牵连', async () => {
    const chat = [{ mes: '出发', is_user: true }, { mes: '她付了款。[igs-stat:money|收入|昂贵]', swipe_id: 0 }, { mes: '继续', is_user: true }, { mes: '又一笔。[igs-stat:money|收入|昂贵]', swipe_id: 0 }];
    const stats = createStatsLedger('chat-r', createStatsState({ money: 0 }));
    for (const messageId of [1, 3]) {
        settleFloor(stats, { messageId, swipeId: 0 }, (before, random) => settleFloorText(before, chat[messageId].mes, { random }), messageId);
    }
    const money = () => currentStatsState(stats).protagonist.bars.money;
    assert.equal(money(), 1000);
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(classDef('cls-mage'), 2), row(heroDef(), 3)]);
    const combat = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7, wallet: money });
    const done = await combat.respecClass('pc-hero', 'cls-mage');
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(heroOf(await combat.effectiveState({ raw: true })).points, -150);
    assert.equal(heroOf(await combat.effectiveState()).points, 850);
    assert.equal(money(), 1000);

    chat.splice(2, 2);
    deleteFloorsFrom(stats, 2);
    assert.equal(money(), 500);
    assert.equal(heroOf(await combat.effectiveState({ raw: true })).points, 0);
    assert.equal(heroOf(await combat.effectiveState()).points, 500);

    chat.splice(0, 2);
    deleteFloorsFrom(stats, 0);
    assert.equal(money(), 0);
    assert.equal(heroOf(await combat.effectiveState({ raw: true })).points, 0);
});

async function sharedRuntime(t, money = 500, originSettings = {}, currencyOptions = null) {
    const { createCombatTables } = await import('../src/data/shujuku/combat-tables.js');
    const { createCombatServices } = await import('../src/core/combat-services.js');
    const { createOriginRuntime } = await import('../src/core/origin-runtime.js');
    const { createPointsFloorRecord } = await import('../src/host/points-floor-record.js');
    const { createHarness } = await import('./origin-host.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const db = createLedgerMockHost();
    db.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: db.api });
    assert.equal((await tables.ensure()).ok, true);
    assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(classDef('cls-mage'), 2), row(heroDef(), 3)])).ok, true);
    const game = createHarness({ enabled: false });
    const holder = { money, enabled: true };
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const host = { AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => game.ctx } };
    const services = createCombatServices({
        global: host, storage, pointsFloorRecord: createPointsFloorRecord(host),
        getChatId: () => game.ctx.chatId, getUserName: () => '主角', getWallet: () => holder.money,
        getReaderSettings: () => ({ combatExpansion: { enabled: holder.enabled } }),
    });
    let statsRuntime = null;
    const openStats = async (exchange = services.points()) => {
        const { createStatsRuntime } = await import('../src/core/stats-runtime.js');
        statsRuntime?.destroy();
        statsRuntime = createStatsRuntime({
            getContext: () => game.ctx, statsTables: () => services.statsTables(),
            currencyInventory: () => services.inventoryTables(), pointsExchange: () => exchange,
            combatSource: () => services.lifeSource(),
            readSettings: () => ({ enabled: true, ruleset: 'coc7', sheetGen: 'off', backfill: 'off', push: { enabled: false } }),
            getBackgroundRequest: () => () => JSON.stringify({ name: '铜钱', initial: 100,
                prices: { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 }, rate: currencyOptions?.rate ?? 0.25 }),
        });
        statsRuntime.sync();
        await statsRuntime.enableForChat({ initial: createStatsState({ money }) });
        await statsRuntime.whenSaved();
        return statsRuntime;
    };
    if (currencyOptions) { game.ai('古城开场'); await openStats(); }
    const runtime = createOriginRuntime({
        getContext: () => ({ ...game.ctx }), readSettings: () => ({ enabled: true, achieveOn: false, ...originSettings }),
        readLlm: () => ({}), combatServices: services,
        ...(currencyOptions && { statsRuntime: {
            exchangeInfo: () => statsRuntime.exchangeInfo(),
            quoteExchange: points => statsRuntime.quoteExchange(points), exchangePoints: quote => statsRuntime.exchangePoints(quote),
            retryExchange: () => statsRuntime.retryExchange(),
        } }),
    });
    runtime.sync();
    t.after(() => { statsRuntime?.destroy(); runtime.destroy(); game.engine.stop(); });
    await runtime.engine.whenSaved();
    assert.equal(runtime.engine.isBlocked(), null);
    return { db, game, holder, services, runtime, host, storage, tables, ledger: services.getLedger(),
        get stats() { return statsRuntime; }, openStats };
}

test('生产失败恢复：分段购买不发货且共享余额拒读，原意图重试后只扣款一次', async (t) => {
    const h = await sharedRuntime(t, 500);
    h.game.ai('购买前的有效来源楼');
    await h.runtime.engine.whenSaved();
    const { runtime } = h;
    h.game.ctx.generateQuietPrompt = async () => '系统回复。'.repeat(4000) + '<origin>\n购买|凝神丹\n</origin>';
    const insert = h.db.api.insertRow;
    let interrupted = false;
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        if (String(cells?.['分段']).startsWith('2/')) { interrupted = true; return false; }
        return insert(...args);
    };
    assert.equal((await runtime.engine.sysChat('购买凝神丹')).ok, false);
    assert.equal(interrupted, true, '实际写入必须跨过生产分段阈值');
    assert.equal(runtime.engine.getState().bag.some((item) => item.name === '凝神丹'), false);
    assert.equal(runtime.engine.getState().points, 500);
    assert.equal((await h.services.readSharedPoints()).ok, false);
    h.db.api.insertRow = insert;
    const recovered = await runtime.engine.retrySave();
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(runtime.engine.getState().bag.find((item) => item.name === '凝神丹').count, 1);
    assert.equal((await h.services.readSharedPoints()).balance, 460);
    const count = h.db.calls.insertRow;
    assert.equal((await runtime.engine.retrySave()).ok, true);
    await runtime.engine.whenSaved();
    assert.equal(h.db.calls.insertRow, count);
    assert.equal(runtime.engine.getState().points, 460);
});

test('积分结算基础：待扣款持久化并阻止新消费，重建服务重试只结算原记录', async t => {
    const h = await sharedRuntime(t, 500);
    const messageId = h.game.ai('牌桌'); await h.runtime.engine.whenSaved();
    const points = h.services.points();
    const started = await points.start({ game: 'mahjong', rules: 'chengdu', messageId });
    assert.equal(started.ok, true, JSON.stringify(started));
    const insert = h.db.api.insertRow;
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        if (String(cells?.['载荷JSON']).includes('"kind":"settle"')) return false;
        return insert(...args);
    };
    const result = await points.hand(started.roundId, { handId: 'debt', rules: 'chengdu', legs: [-20, -20, -20], raw: { source: 'fixture' } });
    assert.equal(result.ok, false);
    assert.equal(points.pending().record.payload.kind, 'settle');
    assert.equal((await h.services.readSharedPoints()).balance, 500);
    assert.equal((await h.ledger.respecClass('pc-hero', 'cls-mage')).reason, 'points-intent-pending');
    assert.equal((await h.runtime.engine.dispatch({ type: 'buy', name: '凝神丹' })).reason, 'points-intent-pending');
    assert.equal(h.runtime.engine.getState().bag.length, 0);
    h.db.api.insertRow = insert;
    const { createCombatServices } = await import('../src/core/combat-services.js');
    const { createPointsFloorRecord } = await import('../src/host/points-floor-record.js');
    const reopened = createCombatServices({ global: h.host, storage: h.storage, pointsFloorRecord: createPointsFloorRecord(h.host),
        getChatId: () => h.game.ctx.chatId, getWallet: () => h.holder.money, getUserName: () => '主角' });
    assert.equal((await reopened.points().retry()).ok, true);
    assert.equal((await reopened.readSharedPoints()).balance, -100);
    assert.equal(reopened.points().pending().record, null);
    const count = h.db.calls.insertRow;
    assert.equal((await reopened.points().retry()).ok, true);
    assert.equal(h.db.calls.insertRow, count);
});

test('积分结算基础：分段中断只补原意图，swipe失效不把奖励转到新分支', async t => {
    const h = await sharedRuntime(t, 0);
    const messageId = h.game.ai('游戏'); await h.runtime.engine.whenSaved();
    const points = h.services.points();
    const started = await points.start({ game: 'rps', messageId });
    assert.equal(started.ok, true, JSON.stringify(started));
    const insert = h.db.api.insertRow;
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        return String(cells?.['分段']).startsWith('2/') ? false : insert(...args);
    };
    const result = { win: true, proof: '本地终局'.repeat(5000) };
    assert.equal((await points.award(started.roundId, result)).ok, false);
    const intent = points.pending().record;
    assert.equal(intent.payload.kind, 'award');
    assert.equal((await h.services.readSharedPoints()).ok, false);
    h.game.ctx.chat[messageId].swipe_id = 1;
    h.db.api.insertRow = insert;
    assert.equal((await points.retry()).skipped, true);
    assert.equal(points.pending().record, null);
    assert.equal((await h.services.readSharedPoints()).balance, 0);
    h.game.ctx.chat[messageId].swipe_id = 0;
    assert.equal((await h.services.readSharedPoints()).balance, 2);
    const count = h.db.calls.insertRow;
    assert.equal((await points.award(started.roundId, result)).present, true);
    assert.equal(h.db.calls.insertRow, count);
});

test('积分结算基础：同楼两奖与同类型一次，窗口逐楼释放且迟到奖励检查后续窗口', async t => {
    const h = await sharedRuntime(t, 0);
    const ids = [];
    for (let i = 0; i < 11; i += 1) ids.push(h.game.ai(`楼${i}`));
    await h.runtime.engine.whenSaved();
    const points = h.services.points();
    const award = async (game, at, result) => {
        const start = await points.start({ game, messageId: ids[at] });
        assert.equal(start.ok, true, JSON.stringify(start));
        return points.award(start.roundId, result);
    };
    assert.equal((await award('ludo', 1, { win: true, humans: 1 })).amount, 20);
    assert.equal((await award('ludo', 1, { win: true, humans: 1 })).amount, 0);
    assert.equal((await award('snake', 1, { terminal: true, score: 20 })).amount, 15);
    assert.equal((await award('rps', 1, { win: true })).amount, 0);
    assert.equal((await award('ludo', 9, { win: true, humans: 1 })).amount, 20);
    assert.equal((await award('ludo', 10, { win: true, humans: 1 })).amount, 5);
    assert.equal((await award('rps', 0, { win: true })).amount, 2);
    assert.equal((await award('snake', 0, { terminal: true, score: 20 })).amount, 3);
    assert.equal(points.read().balance, 65);
    ids.push(h.game.ai('楼11')); await h.runtime.engine.whenSaved();
    assert.equal((await award('snake', 11, { terminal: true, score: 20 })).amount, 15);
});

test('Origin经济：核准收入写失败不发布，重试只写原结果且不重复通知', async t => {
    const h = await sharedRuntime(t, 0);
    h.game.ai('准备'); await h.runtime.engine.whenSaved();
    const insert = h.db.api.insertRow;
    h.db.api.insertRow = () => false;
    h.game.ai('奖励<origin>\n积分|+999|奖励\n</origin>');
    await h.runtime.engine.whenSaved();
    assert.ok(h.runtime.engine.isBlocked());
    assert.equal(h.runtime.engine.getState().points, 0);
    const count = h.game.notes.length;
    h.db.api.insertRow = insert;
    assert.equal((await h.runtime.engine.retrySave()).ok, true);
    assert.equal((await h.services.readSharedPoints()).balance, 20);
    const rows = h.db.calls.insertRow;
    assert.equal((await h.runtime.engine.retrySave()).ok, true);
    assert.equal(h.db.calls.insertRow, rows);
    assert.ok(h.game.notes.length >= count);
});

function chengduEvidence(hand, legs) {
    const transfers = legs.map((fan, index) => ({ from: fan < 0 ? 0 : index + 1,
        to: fan < 0 ? index + 1 : 0, type: 'hu', fan: Math.abs(fan), score: 16 }));
    const scores = [0, 0, 0, 0];
    for (const item of transfers) { scores[item.from] -= item.score; scores[item.to] += item.score; }
    return { points: { version: 1, rules: 'chengdu', hand, transfers }, results: scores.map(score => ({ score })) };
}

async function mahjongSessionHarness(h, messageId, saved, hands = [], rules = 'chengdu') {
    const { createMahjongPointsSession } = await import('../src/visual/igs-ui/wait-stage-mahjong-points.js');
    const { riichiPointsHand } = await import('../src/visual/igs-ui/riichi-points-settlement.js');
    let snapshot, writable = true, final = false;
    const factory = h.services.mahjongPointsRounds(messageId);
    const session = createMahjongPointsSession({ factory: identity => factory(identity, rules), saved,
        adapt: rules === 'riichi' ? riichiPointsHand : undefined,
        evidence: () => hands, terminal: () => final,
        persist() {
            if (!writable) return { ok: false, reason: 'points-table-save-failed' };
            snapshot = structuredClone({ version: 2, points: session.state.identity, pointsExit: session.state.exitRequested });
            return { ok: true };
        } });
    return { session, hands, get snapshot() { return snapshot; },
        writable(value) { writable = value; }, final(value) { final = value; } };
}

async function scmjUiHarness(t, h, messageId, saved, seed = 1) {
    const { JSDOM } = await import('jsdom');
    const { openScmjTable, forgetScmjTable } = await import('../src/visual/igs-ui/wait-stage-scmj.js');
    const dom = new JSDOM('<!doctype html><body><div id="board"></div></body>', { url: 'https://igs.test/' });
    const doc = dom.window.document, board = doc.getElementById('board');
    let closed = 0, detached = false;
    const ctx = { doc, board, model: {}, storage: h.storage, setNote() {}, onVoice() {},
        loadImage: () => '', isSettled: () => detached, requestClose() { closed += 1; detached = true; } };
    const factory = h.services.mahjongPointsRounds(messageId);
    const match = openScmjTable(ctx, ['你', '甲', '乙', '丙'].map(name => ({ name })), saved,
        { seed, present: false, pointsRounds: factory });
    t.after(() => { forgetScmjTable(); dom.window.close(); });
    await match.points.retry();
    return { dom, doc, board, ctx, match, factory, get closed() { return closed; }, detach() { detached = true; } };
}

async function scmjToBoundary(match) {
    const { greedyDecide } = await import('../scripts/scmj-players.mjs');
    for (let guard = 0; !['result', 'final'].includes(match.phase()); guard += 1) {
        assert.ok(guard < 500, '成都牌局必须能推进到局末');
        assert.equal(match.canPlay(), true, JSON.stringify(match.points.state));
        match.answer(greedyDecide(match.view()));
    }
    return match.points.retry();
}

async function settleScmjBranches(prepare) {
    const { createScmjController } = await import('../src/visual/igs-ui/scmj/controller.js');
    const { SCMJ_CONF } = await import('../src/visual/igs-ui/scmj/host.js');
    const { scmjPointsHand } = await import('../src/visual/igs-ui/scmj/points-settlement.js');
    const controller = createScmjController({ seed: 1 });
    const seats = Array.from({ length: 4 }, (_, seatIndex) => ({
        seatIndex, holds: [0, 1, 2, 9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 21], countMap: {},
        pengs: [], angangs: [], diangangs: [], wangangs: [], tingMap: { 21: { fan: 2, pattern: 'normal' } },
        hued: true, actions: [], score: 0, fan: 2, pattern: 'normal',
        numZiMo: 0, numJiePao: 0, numDianPao: 0, numChaJiao: 0,
    }));
    prepare(seats);
    const game = { gameIndex: 0, conf: { ...SCMJ_CONF, menqing: false, jiangdui: false, tiandihu: false }, gameSeats: seats };
    controller.xzdd.__internals.calculateResult(game, { seats: seats.map(() => ({ score: 0 })) });
    const data = { points: game.pointsSettlement, results: seats.map(s => ({ score: s.score })) };
    const result = scmjPointsHand(data);
    assert.equal(result.ok, true, JSON.stringify(data));
    return { data, hand: result.hand, seats };
}

function riichiEvidence(hand, win, jushu = 0, qijia = 0) {
    return { version: 1, rules: 'riichi', hand, self: 0, qijia, qipai: { jushu }, results: [win
        ? { hule: win } : { pingju: { name: '九種九牌', fenpei: [0, 0, 0, 0] } }] };
}

async function riichiUiHarness(t, h, at, { saved, asyncMessages = false } = {}) {
    const { JSDOM } = await import('jsdom');
    const { startMahjong, forgetMahjongTable } = await import('../src/visual/igs-ui/wait-stage-mahjong.js');
    forgetMahjongTable();
    h.storage.setItem('igs-wait-mahjong-mode-v1', 'riichi');
    if (saved) h.storage.setItem('igs-wait-mahjong-v1', JSON.stringify(saved));
    const dom = new JSDOM('<!doctype html><body><div id="board"></div></body>', { url: 'https://igs.test/' });
    const doc = dom.window.document, board = doc.getElementById('board');
    let closed = 0, back = 0;
    const ctx = { doc, board, storage: h.storage, model: {}, setNote() {}, onVoice() {},
        loadImage: () => '', isSettled: () => false, requestClose() { closed += 1; },
        host: { state: () => ({ back: '返回阅读', next: false }), onChange: () => () => {}, back() { back += 1; } } };
    const game = startMahjong(ctx, h.services.mahjongPointsRounds(at));
    const match = globalThis.__IGS_MAHJONG_MATCH__;
    if (!asyncMessages) {
        const dispatch = game.call_players.bind(game);
        game.call_players = (...args) => {
            const sync = game._sync; game._sync = true;
            try { return dispatch(...args); } finally { game._sync = sync; }
        };
    }
    t.after(() => { game.stop(); clearTimeout(game._timeout_id); forgetMahjongTable(); dom.window.close(); });
    const confirmed = await match.points.retry();
    const click = text => {
        const node = [...board.querySelectorAll('button')].find(button => button.textContent === text);
        assert.ok(node, text); assert.equal(node.disabled, false, text); node.click();
    };
    return { game, match, board, doc, ctx, confirmed, click, get closed() { return closed; }, get back() { return back; },
        snapshot: () => JSON.parse(h.storage.getItem('igs-wait-mahjong-v1')) };
}

async function riichiUiWin(ui, winner = 0) {
    const Majiang = (await import('@kobalab/majiang-core')).default;
    ui.game.qipai();
    ui.game._model.shoupai[winner] = Majiang.Shoupai.fromString('z11122233344455');
    ui.game._model.lunban = winner;
    ui.game.hule();
    return ui.match.points.retry();
}

const exchangeBalance = async h => {
    const { currencyBalanceOf } = await import('../src/scene/stats/stat-currency.js');
    const inventory = h.services.inventoryTables();
    inventory.client?.invalidate?.();
    const result = currencyBalanceOf(inventory.read(), '铜钱');
    assert.equal(result.ok, true, result.reason);
    return result.balance;
};

async function segmentedExchange(h) {
    const { createCombatTables } = await import('../src/data/shujuku/combat-tables.js');
    const { createPointsStore } = await import('../src/data/shujuku/points-store.js');
    const { createPointsEngine } = await import('../src/scene/points/points-engine.js');
    const { createPointsIntents } = await import('../src/storage/points-intents.js');
    const { createPointsFloorRecord } = await import('../src/host/points-floor-record.js');
    const chat = () => h.game.ctx.chat, chatId = () => h.game.ctx.chatId;
    const raw = createCombatTables({ api: h.db.api, cellMax: 180 });
    const store = createPointsStore({ tables: raw, chat, chatId });
    return createPointsEngine({ store: () => store, chat, chatId,
        floors: createPointsFloorRecord(h.host), intents: createPointsIntents(h.storage),
        lock: task => h.services.withPointsLock(task), wallet: () => h.services.readSharedPoints() });
}

