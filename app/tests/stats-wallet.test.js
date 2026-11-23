import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createCombatLedger } from '../src/combat/ledger.js';
import { applyBarDirective, walletBalance } from '../src/scene/stats/stat-bars.js';
import { composeStatsHud, dropUserFavor, protagonistStatMetrics, overlayStatsMetrics } from '../src/scene/stats/stat-metrics.js';
import { buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { applyFxToDom, cancelFxEffects, playStatsFeedback, playStatsFeedbackWithHud, playExternalNotify } from '../src/visual/igs-ui/fx-runtime.js';
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
    const openStats = async (exchange = services.points(), runtimeOptions = {}) => {
        const { wait = true, ...extra } = runtimeOptions;
        const { createStatsRuntime } = await import('../src/core/stats-runtime.js');
        statsRuntime?.destroy();
        statsRuntime = createStatsRuntime({
            getContext: () => game.ctx, statsTables: () => services.statsTables(),
            currencyInventory: () => services.inventoryTables(), pointsExchange: () => exchange,
            currencyEditStorage: storage,
            combatSource: () => services.lifeSource(),
            readSettings: () => ({ enabled: true, ruleset: 'coc7', sheetGen: 'off', backfill: 'off', push: { enabled: false } }),
            getBackgroundRequest: () => () => JSON.stringify({ name: '铜钱', initial: 100,
                prices: { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 }, rate: currencyOptions?.rate ?? 0.25 }),
            ...extra,
        });
        statsRuntime.sync();
        await statsRuntime.enableForChat({ initial: createStatsState({ money }) });
        if (wait) await statsRuntime.whenSaved();
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


// ---------- 对外通知卡 ----------
test('外部通知卡：空文本不播，正常播出带发件人与截断文本', () => {
    const root = makeStage();
    const timers = makeTimers();
    const opts = { readerSettings: { fxTags: { enabled: true, notify: true } }, schedule: timers.schedule, clear: timers.clear, reducedMotion: false };
    assert.deepEqual(playExternalNotify(root, { sender: '小雪', text: '  ' }, opts), { played: 0 });
    assert.deepEqual(playExternalNotify(root, { sender: '小雪', text: '到楼下了'.repeat(40) }, opts), { played: 1 });
    const card = root.querySelector('.igs-fx-notify');
    assert.ok(card);
    assert.equal(card.querySelector('.igs-fx-notify-sender').textContent, '小雪');
    assert.equal(Array.from(card.querySelector('.igs-fx-notify-text').textContent).length, 80);
    cancelFxEffects(root);
});

const currencyReply = () => JSON.stringify({ name: '铜钱', initial: 100, prices: { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 }, rate: 0.25 });
const flushCurrency = async () => { for (let i = 0; i < 8; i += 1) await new Promise(resolve => setImmediate(resolve)); };

test('货币慢请求：跨过60秒与宿主慢通知仍单飞，原回复可完成入账', async t => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const { renderStatsHeroDashboard } = await import('../src/visual/igs-ui/stats-hero-card.js');
    for (const source of ['tavern', 'openai']) await t.test(source, async t => {
        const h = await sharedRuntime(t, 0);
        h.game.ai('古城开场');
        await h.runtime.engine.whenSaved();
        let resolve, calls = 0;
        const pending = new Promise(done => { resolve = done; });
        const network = createSecondaryLlm({
            TavernHelper: { generateRaw: () => { calls += 1; return pending; } },
            SillyTavern: { getContext: () => ({ ChatCompletionService: { sendRequest: () => { calls += 1; return pending.then(content => ({ content })); } } }) },
        });
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const rt = await h.openStats(null, { wait: false, getBackgroundRequest: () => (prompt, task) => network.request(prompt,
            { source, endpoint: 'https://fixture.invalid/v1', model: 'fixture', apiKey: 'fixture', ...task }) });
        await flushCurrency();
        const job = rt.retryCurrency();
        assert.equal(job, rt.retryCurrency());
        assert.equal(calls, 1);
        let finished = false;
        job.then(() => { finished = true; });
        t.mock.timers.tick(60001);
        await flushCurrency();
        assert.equal(finished, false);
        t.mock.timers.tick(120000);
        await flushCurrency();
        assert.equal(calls, 1);
        assert.equal(rt.archive().currency.pending, true);
        assert.equal(rt.archive().currency.slow, true);
        assert.match(renderStatsHeroDashboard(rt.archive()), /disabled[^>]*>仍在处理/);
        assert.match(rt.diagnose(0), /stage=request.*slow=true/);
        resolve(currencyReply());
        assert.equal((await job).ok, true);
        await rt.whenSaved();
        assert.equal(rt.archive().currency.balance, 100);
        assert.equal(rt.archive().currency.pending, false);
        assert.equal(rt.notices().some(n => n.id === 'currency'), false);
        assert.equal(calls, 1);
    });
});

test('货币失败：请求与解析原因保留，一次动作只请求一次，显式重试才重发', async t => {
    const cases = [
        ['拒绝', () => { throw Object.assign(new Error('fixture-secret-provider-body'), { reason: 'secondary-llm-http-failed', status: 429 }); }, 'request', 'secondary-llm-http-failed'],
        ['传输', () => { throw new TypeError('fixture-secret-provider-body'); }, 'request', 'stats-hero-init-request-failed'],
        ['空回复', () => '', 'parse', 'stats-hero-init-reply-empty'],
        ['非法 JSON', () => '{not-json}', 'parse', 'stats-hero-init-not-json'],
        ['配置非法', () => '{}', 'parse', 'stats-currency-config-invalid'],
        ['初始金额非法', () => JSON.stringify({ ...JSON.parse(currencyReply()), initial: -1 }), 'parse', 'stats-currency-initial-invalid'],
    ];
    for (const [label, fail, stage, reason] of cases) await t.test(label, async t => {
        const h = await sharedRuntime(t, 0);
        h.game.ai('古城开场');
        await h.runtime.engine.whenSaved();
        let calls = 0;
        const rt = await h.openStats(null, { getBackgroundRequest: () => () => { calls += 1; return calls === 1 ? fail() : currencyReply(); } });
        const notice = rt.notices().find(n => n.id === 'currency');
        assert.equal(calls, 1);
        assert.equal(notice.stage, stage);
        assert.equal(notice.reason, reason);
        assert.equal(rt.archive().currency.pending, false);
        assert.match(rt.diagnose(0), new RegExp(`stage=${stage} reason=${reason}`));
        assert.equal(JSON.stringify(notice).includes('fixture-secret'), false);
        rt.sync();
        h.game.emit(h.game.ctx.eventTypes.GENERATION_ENDED);
        await flushCurrency();
        assert.equal(calls, 1);
        assert.equal((await rt.noticeAction('currency', 'retry')).ok, true);
        await rt.whenSaved();
        assert.equal(calls, 2);
        assert.equal(rt.archive().currency.balance, 100);
    });
});

test('货币任务失效：换聊天、暂停与销毁拒绝迟到成功和失败，不写新目标', async t => {
    for (const action of ['chat', 'pause', 'destroy']) for (const rejected of [false, true]) await t.test(`${action}/${rejected ? '失败' : '成功'}`, async t => {
        const h = await sharedRuntime(t, 0);
        h.game.ai('古城开场');
        await h.runtime.engine.whenSaved();
        const tasks = [];
        const rt = await h.openStats(null, {
            wait: false,
            statsTables: () => h.game.ctx.chatId === 'chat-a' ? h.services.statsTables()
                : { ok: true, version: 0, read: () => ({ ok: true, stats: [] }), append: async () => ({ ok: true, written: [] }) },
            getBackgroundRequest: () => (prompt, options) => new Promise((resolve, reject) => { tasks.push({ options, resolve, reject }); }),
        });
        await flushCurrency();
        const job = rt.retryCurrency();
        const first = tasks[0];
        if (action === 'chat') {
            h.game.ctx.chatId = 'chat-b';
            h.game.ctx.chat = [];
            h.game.emit(h.game.ctx.eventTypes.CHAT_CHANGED);
        } else if (action === 'pause') assert.equal(rt.disableForChat().ok, true);
        else rt.destroy();
        assert.equal(first.options.signal.aborted, true);
        assert.equal((await job).reason, 'request-stale');
        if (action !== 'chat') await rt.whenSaved();
        const before = h.db.calls.insertRow + h.db.calls.updateRow;
        if (rejected) first.reject(new Error('late-provider-body')); else first.resolve(currencyReply());
        await flushCurrency();
        assert.equal(h.db.calls.insertRow + h.db.calls.updateRow, before);
        assert.equal(h.services.inventoryTables().read().inventory.items.some(item => item.name === '铜钱'), false);
    });
});


test('bootstrap 货币接线：公开设置动作单飞，慢状态局部刷新并保留输入，失败可见且重试后读回', async t => {
    const { JSDOM } = await import('jsdom');
    const { bootstrapIGS } = await import('../src/core/bootstrap.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { initRecord } = await import('../src/scene/stats/stat-log.js');
    const h = await sharedRuntime(t, 0);
    h.game.ctx.name1 = '主角';
    h.game.ctx.getCurrentChatId = () => h.game.ctx.chatId;
    h.game.ctx.setExtensionPrompt = () => {};
    assert.equal((await h.tables.append('stats', [initRecord(createStatsState()),
        { id: 'chat-enabled', type: 'chat', character: '主角', anchor: null, createdAt: 1, change: '启用', payload: { key: 'chat:enabled', value: true } },
        { id: 'hero-init-auto', type: 'chat', character: '主角', anchor: null, createdAt: 2, change: '自动', payload: { key: 'hero:initChoice', value: 'auto' } }])).ok, true);
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://igs.invalid/' });
    const storage = createMemoryStorage({ igs_bridge_config: JSON.stringify({ stats: {
        enabled: true, newChat: 'ask', ruleset: 'coc7', autoSkill: false, sheetGen: 'off', backfill: 'off', push: { enabled: false },
    } }) });
    const tasks = [];
    const app = bootstrapIGS({ global: { document: dom.window.document, localStorage: storage, AutoCardUpdaterAPI: h.db.api,
        SillyTavern: { getContext: () => h.game.ctx }, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
        dispatchEvent: dom.window.dispatchEvent.bind(dom.window), addEventListener: dom.window.addEventListener.bind(dom.window),
        removeEventListener: dom.window.removeEventListener.bind(dom.window) }, autoAttachMagicWand: false, startupDelayMs: 0,
        secondaryLlm: { request: (prompt, config) => new Promise(resolve => tasks.push({ prompt, config, resolve })) } });
    t.after(async () => { await app.shutdown(); dom.window.close(); });
    await flushCurrency();
    assert.equal(tasks.length, 1);
    assert.ok(tasks[0].config.signal);
    const opened = app.openSettings({ tab: 'stats' });
    assert.equal(opened.ok, true);
    const doc = dom.window.document;
    const retry = () => doc.querySelector('[data-action="stats-op:currency-retry"]');
    assert.ok(retry());
    assert.equal(retry().disabled, true);
    const input = doc.createElement('input');
    input.value = '未保存输入';
    doc.querySelector('#igs-unified-settings').appendChild(input);
    tasks[0].config.onSlow();
    await flushCurrency();
    assert.equal(retry().textContent, '仍在处理');
    assert.equal(input.isConnected, true);
    assert.equal(input.value, '未保存输入');
    tasks[0].resolve('{invalid}');
    await flushCurrency();
    assert.equal(retry().disabled, false);
    assert.match(retry().title, /解析失败/);
    const job = opened.controller.invoke('stats-op:currency-retry');
    await flushCurrency();
    assert.equal(tasks.length, 2);
    assert.equal(retry().disabled, true);
    tasks[1].resolve('');
    await flushCurrency();
    assert.match(doc.querySelector('.igs-settings-dialog-msg').textContent, /解析失败.*回复为空/);
    doc.querySelector('[data-settings-dialog="ok"]').click();
    const heroInitReply = () => JSON.stringify({
        attributes: { 力量: 12, 敏捷: 14, 体质: 11, 智力: 13, 感知: 10, 魅力: 15 },
        currency: JSON.parse(currencyReply()),
    });
    assert.equal((await job).reason, 'stats-hero-init-reply-empty');
    const recovery = opened.controller.invoke('stats-op:currency-retry');
    await flushCurrency();
    assert.equal(tasks.length, 3);
    tasks[2].resolve(heroInitReply());
    assert.equal((await recovery).ok, true);
    await flushCurrency();
    assert.match(doc.querySelector('.igs-stats-wallets').textContent, /铜钱100/);
    assert.equal(retry(), null);
    const editButton = () => doc.querySelector('[data-action="stats-op:money-config:"]');
    assert.equal(editButton().textContent, '修改货币');
    const beginEdit = async () => {
        const job = opened.controller.invoke('stats-op:money-config:');
        await flushCurrency();
        assert.ok(doc.querySelector('.igs-settings-dialog.is-currency'));
        return { job };
    };
    const field = key => doc.querySelector(`[data-dialog-field="${key}"]`);
    const inputValue = (key, value) => {
        field(key).value = String(value);
        field(key).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const beforeEdit = clone(h.db.sheets);
    let edit = await beginEdit();
    assert.equal(field('name').value, '铜钱');
    assert.equal(field('rate').value, '0.25');
    doc.querySelector('[data-settings-dialog="cancel"]').click();
    assert.equal((await edit.job).cancelled, true);
    edit = await beginEdit();
    doc.querySelector('[data-settings-dialog="ok"]').click();
    assert.equal((await edit.job).cancelled, true);
    assert.deepEqual(h.db.sheets, beforeEdit);
    edit = await beginEdit();
    inputValue('name', '金币');
    inputValue('rate', 0.255);
    doc.querySelector('[data-settings-dialog="ok"]').click();
    assert.ok(doc.querySelector('.igs-settings-dialog.is-currency'));
    assert.deepEqual(h.db.sheets, beforeEdit);
    inputValue('rate', 0.5);
    for (const [key, value] of Object.entries({ 少量: 1, 普通: 2, 昂贵: 3, 巨额: 4 })) inputValue(key, value);
    dom.window.dispatchEvent(new dom.window.CustomEvent('igs:stats-changed'));
    await flushCurrency();
    assert.equal(field('name').value, '金币', '钱包局部刷新不丢表单草稿');
    doc.querySelector('[data-settings-dialog="ok"]').click();
    assert.equal((await edit.job).ok, true);
    assert.match(doc.querySelector('.igs-stats-wallets').textContent, /金币100/);
    edit = await beginEdit();
    assert.equal(field('rate').value, '0.5');
    assert.equal(field('巨额').value, '4');
    doc.querySelector('[data-settings-dialog="cancel"]').click();
    assert.equal((await edit.job).cancelled, true);
});

test('bootstrap 生命周期：聊天与API替换、关闭和销毁隔离迟到货币，重建仅发新任务', async t => {
    const { JSDOM } = await import('jsdom');
    const { bootstrapIGS } = await import('../src/core/bootstrap.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createCombatTables } = await import('../src/data/shujuku/combat-tables.js');
    const { createInventoryTables } = await import('../src/data/shujuku/inventory-tables.js');
    const { initRecord, chatEntries, diffChatRecords } = await import('../src/scene/stats/stat-log.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const databases = [];
    for (let i = 0; i < 3; i += 1) {
        const db = createLedgerMockHost({ supportCallbacks: true });
        db.sheets.sheet_userbag = userInventorySheet();
        const tables = createCombatTables({ api: db.api });
        databases.push(db);
        t.after(() => tables.client.dispose());
        assert.equal((await tables.ensure()).ok, true);
        assert.equal((await createInventoryTables({ api: db.api, client: tables.client, serial: tables.serial }).ensure()).ok, true);
        assert.equal((await tables.append('stats', [initRecord(createStatsState()),
            ...diffChatRecords(chatEntries(), chatEntries({ chatEnabled: true, catalog: { heroInitChoice: 'auto' } }), { tag: 'lifecycle' })])).ok, true);
    }
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://igs.invalid/' });
    const handlers = new Map();
    const context = { name1: '主角', name2: '小雪', chatId: 'lifecycle-a', chatMetadata: {},
        chat: [{ is_user: true, mes: '出发' }, { is_user: false, mes: '古城开场。', swipe_id: 0 }],
        getCurrentChatId: () => context.chatId, setExtensionPrompt() {}, saveMetadata() {},
        eventTypes: { CHAT_CHANGED: 'chat' }, eventSource: {
            on(key, fn) { if (!handlers.has(key)) handlers.set(key, new Set()); handlers.get(key).add(fn); },
            removeListener(key, fn) { handlers.get(key)?.delete(fn); },
        } };
    const emitChat = () => { for (const fn of [...handlers.get('chat') || []]) fn(); };
    const storage = createMemoryStorage({ igs_bridge_config: JSON.stringify({
        stats: { enabled: true, newChat: 'ask', autoSkill: false, sheetGen: 'off', backfill: 'off', push: { enabled: false } },
        origin: { enabled: true, taskSource: 'manual', achieveOn: false,
            mods: { stat: false, bag: false, shop: false, gacha: false, ach: false, chat: false } },
    }) });
    const global = { document: dom.window.document, localStorage: storage, AutoCardUpdaterAPI: databases[0].api,
        SillyTavern: { getContext: () => context }, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
        dispatchEvent: dom.window.dispatchEvent.bind(dom.window), addEventListener: dom.window.addEventListener.bind(dom.window),
        removeEventListener: dom.window.removeEventListener.bind(dom.window) };
    const tasks = [];
    const options = { global, autoAttachMagicWand: false, startupDelayMs: 0,
        secondaryLlm: { request: (prompt, config) => new Promise(resolve => tasks.push({ config, resolve })) } };
    let app = bootstrapIGS(options);
    t.after(async () => { await app.shutdown(); dom.window.close(); });
    const waitFor = async (read, message) => {
        for (let i = 0; i < 80; i += 1) { if (read()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
        assert.fail(message);
    };
    const changeSetting = (path, value) => {
        const opened = app.openSettings({ page: 'stats' });
        assert.equal(opened.controller.setValue(path, value).ok, true);
        assert.equal(opened.controller.close().ok, true);
    };
    await waitFor(() => tasks.length === 1, '首次货币请求未启动');
    const opened = app.openSettings({ page: 'stats' });
    for (let i = 0; i < 8; i += 1) databases[0].fireTableUpdated();
    await flushCurrency();
    assert.equal(tasks.length, 1, '表通知突发不重复发模型请求');
    assert.equal(dom.window.document.querySelector('[data-action="stats-op:currency-retry"]').disabled, true);

    context.chatId = 'lifecycle-b';
    context.chatMetadata = {};
    global.AutoCardUpdaterAPI = databases[1].api;
    emitChat();
    await waitFor(() => tasks.length === 2, '聊天事件未启动新聊天货币任务');
    assert.equal(tasks[0].config.signal.aborted, true);
    let before = databases.map(db => clone(db.sheets));
    tasks[0].config.onSlow();
    tasks[0].resolve(currencyReply());
    await flushCurrency();
    assert.deepEqual(databases.map(db => db.sheets), before, '旧聊天响应不写入任一数据库');

    global.AutoCardUpdaterAPI = databases[2].api;
    const apiRetry = opened.controller.invoke('stats-op:currency-retry');
    await waitFor(() => tasks.length === 3, '显式重试未采用替换后的 API');
    assert.equal(tasks[1].config.signal.aborted, true);
    before = databases.map(db => clone(db.sheets));
    tasks[1].config.onSlow();
    tasks[1].resolve(currencyReply());
    await flushCurrency();
    assert.deepEqual(databases.map(db => db.sheets), before, '旧 API 响应不写入新通道');

    changeSetting('bridge.stats.enabled', false);
    assert.equal(tasks[2].config.signal.aborted, true);
    const origin = app.openSettings({ page: 'origin' });
    await waitFor(() => /本聊天正在运行/.test(dom.window.document.querySelector('#igs-unified-settings').textContent),
        '数值关闭不应阻断独立 Origin');
    before = databases.map(db => clone(db.sheets));
    tasks[2].resolve(currencyReply());
    assert.equal((await apiRetry).reason, 'request-stale');
    await flushCurrency();
    assert.deepEqual(databases.map(db => db.sheets), before);
    origin.controller.close();
    changeSetting('bridge.stats.enabled', true);
    const resumed = app.openSettings({ page: 'stats' });
    const stopped = resumed.controller.invoke('stats-op:currency-retry');
    await waitFor(() => tasks.length === 4, '重新启用后的显式请求未启动');
    assert.equal((await app.shutdown()).ok, true);
    assert.equal(tasks[3].config.signal.aborted, true);
    before = databases.map(db => clone(db.sheets));
    tasks[3].config.onSlow();
    tasks[3].resolve(currencyReply());
    assert.equal((await stopped).reason, 'request-stale');
    for (const db of databases) db.fireTableUpdated();
    emitChat();
    await flushCurrency();
    assert.deepEqual(databases.map(db => db.sheets), before);
    assert.equal(dom.window.document.querySelector('#igs-unified-settings'), null);
    assert.equal([...handlers.values()].every(set => set.size === 0), true, '销毁退订宿主事件');
    assert.equal(tasks.length, 4);

    const heroInitReply = () => JSON.stringify({
        attributes: { 力量: 11, 敏捷: 13, 体质: 12, 智力: 14, 感知: 10, 魅力: 12 },
        currency: JSON.parse(currencyReply()),
    });
    app = bootstrapIGS(options);
    await waitFor(() => tasks.length === 5, '冷重建未启动自己的任务');
    app.openSettings({ page: 'stats' });
    tasks[4].resolve(heroInitReply());
    await waitFor(() => /铜钱100/.test(dom.window.document.querySelector('.igs-stats-wallets')?.textContent || ''),
        '新实例未完成权威余额读回');
    assert.equal(tasks.length, 5);
    assert.deepEqual(databases.slice(0, 2).map(db => db.sheets), before.slice(0, 2));
});


test('货币恢复：已初始化且无待写也须确认权威余额，读错与合法零严格分开', async t => {
    const h = await sharedRuntime(t, 500);
    h.game.ai('古城开场');
    let calls = 0;
    const rt = await h.openStats(null, { getBackgroundRequest: () => () => { calls += 1; return currencyReply(); } });
    const inventory = h.services.inventoryTables();
    const read = inventory.read;
    const before = h.db.calls.insertRow + h.db.calls.updateRow;
    inventory.read = () => ({ ok: false, reason: 'inventory-table-read-failed' });
    const failed = await rt.retryCurrency();
    assert.equal(failed.ok, false);
    assert.equal(failed.stage, 'read');
    assert.equal(failed.reason, 'inventory-table-read-failed');
    assert.equal(rt.archive().currency.ready, false);
    assert.equal(rt.archive().currency.balance, null);
    assert.equal(rt.notices().find(n => n.id === 'currency').reason, failed.reason);
    inventory.read = read;
    const restored = await rt.retryCurrency();
    assert.equal(restored.ok, true);
    assert.equal(restored.balance, 100);
    assert.equal(rt.archive().currency.balance, restored.balance);
    assert.equal(calls, 1);
    assert.equal(h.db.calls.insertRow + h.db.calls.updateRow, before);
    const sheet = h.db.sheets.sheet_userbag;
    const nameAt = sheet.content[0].indexOf('物品名称');
    const quantityAt = sheet.content[0].indexOf('数量');
    const row = sheet.content.find(r => r[nameAt] === '铜钱');
    row[quantityAt] = '坏数量';
    inventory.client.invalidate();
    assert.equal((await rt.retryCurrency()).reason, 'inventory-quantity-invalid');
    row[quantityAt] = '100';
    h.db.sheets.sheet_duplicatebag = { ...clone(sheet), uid: 'sheet_duplicatebag', name: '备用背包物品表' };
    inventory.client.invalidate();
    assert.equal((await rt.retryCurrency()).reason, 'inventory-table-ambiguous');
    delete h.db.sheets.sheet_duplicatebag;
    sheet.content.splice(sheet.content.indexOf(row), 1);
    inventory.client.invalidate();
    const zero = await rt.retryCurrency();
    assert.equal(zero.ok, true);
    assert.equal(zero.balance, 0);
    assert.equal(rt.archive().currency.ready, true);
    assert.equal(rt.archive().currency.balance, 0);
    assert.equal(calls, 1);
    assert.equal(h.db.calls.insertRow + h.db.calls.updateRow, before);
});

test('货币兑换恢复：完成标记失败只补标记，完成后读回失败不重扣或重入账', async t => {
    const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
    const points = await segmentedExchange(h);
    const rt = await h.openStats(points);
    const quote = await rt.quoteExchange(100);
    assert.equal(quote.ok, true, JSON.stringify(quote));
    const insert = h.db.api.insertRow;
    let interrupted = false;
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        const intent = points.pending().record;
        if (intent?.payload.kind === 'exchange-done' && cells?.['记录ID'] === intent.id && String(cells['分段']).startsWith('2/')) {
            interrupted = true;
            return false;
        }
        return insert(...args);
    };
    const partial = await rt.exchangePoints(quote);
    assert.equal(interrupted, true, '完成标记实际写入首段后中断');
    assert.equal(partial.ok, false);
    assert.equal(points.pending().record.payload.kind, 'exchange-done');
    assert.equal(await exchangeBalance(h), 125);
    h.db.api.insertRow = insert;
    assert.equal((await rt.retryCurrency()).ok, true);
    assert.equal(await exchangeBalance(h), 125);
    assert.equal((await h.services.readSharedPoints()).balance, 400);
    assert.equal(points.pending().record, null);
    const inventory = h.services.inventoryTables();
    const read = inventory.read;
    inventory.read = () => ({ ok: false, reason: 'inventory-table-read-failed' });
    assert.equal((await rt.retryCurrency()).ok, false);
    inventory.read = read;
    const count = h.db.calls.insertRow + h.db.calls.updateRow;
    assert.equal((await rt.retryCurrency()).balance, 125);
    assert.equal((await rt.exchangePoints(quote)).present, true);
    assert.equal(await exchangeBalance(h), 125);
    assert.equal((await h.services.readSharedPoints()).balance, 400);
    assert.equal(h.db.calls.insertRow + h.db.calls.updateRow, count);
});


test('兑换已完成后的积分钱包读回失败保留 done，冷重建只确认余额不重复结算', async t => {
    const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
    const points = await segmentedExchange(h);
    const rt = await h.openStats(points);
    const quote = await rt.quoteExchange(100);
    assert.equal(quote.ok, true, JSON.stringify(quote));
    const wallet = h.services.readSharedPoints;
    h.services.readSharedPoints = () => points.read().exchanges.get(quote.exchangeId)?.done
        ? Promise.resolve({ ok: false, reason: 'points-wallet-unavailable' }) : wallet();
    const { runOriginAction } = await import('../src/visual/igs-ui/origin-panel-actions.js');
    const notices = [];
    const result = await runOriginAction('exchange', null, {
        engine: h.runtime.engine, closeMenu() {}, notice: (level, text) => notices.push({ level, text }),
        modal: { prompt: async () => '100', confirm: async () => true },
        exchange: { info: () => rt.exchangeInfo(), quote: () => Promise.resolve(quote), confirm: value => rt.exchangePoints(value) },
    });
    assert.equal(result.ok, false);
    assert.equal(result.stage, 'read');
    assert.equal(result.done, true);
    assert.equal(result.walletReady, false);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].level, 'warn');
    assert.match(notices[0].text, /兑换已完成，余额暂不可确认/);
    assert.match(notices[0].text, /请勿再次提交兑换/);
    assert.equal(rt.notices().find(n => n.id === 'currency').done, true);
    assert.equal(points.read().exchanges.get(quote.exchangeId).done, true);
    assert.equal(await exchangeBalance(h), 125);
    h.services.readSharedPoints = wallet;
    assert.equal((await wallet()).balance, 400);
    const reopenedPoints = await segmentedExchange(h);
    const reopened = await h.openStats(reopenedPoints, { getBackgroundRequest: () => () => assert.fail('已有货币不得重新请求模型') });
    const before = h.db.calls.insertRow + h.db.calls.updateRow;
    assert.equal((await reopened.retryCurrency()).balance, 125);
    assert.equal((await reopened.exchangePoints(quote)).present, true);
    assert.equal(reopenedPoints.read().exchanges.get(quote.exchangeId).done, true);
    assert.equal((await wallet()).balance, 400);
    assert.equal(await exchangeBalance(h), 125);
    assert.equal(h.db.calls.insertRow + h.db.calls.updateRow, before);
});


test('货币编辑：完整配置改名保余额，旧报价与旧表单失效，降低价格后可冷加载', async t => {
    const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
    const rt = h.stats;
    const oldQuote = await rt.quoteExchange(100);
    const model = await rt.relationOp('money-config-read');
    assert.equal(model.ok, true, JSON.stringify(model));
    assert.equal(model.config.rate, 0.25);
    const sheet = h.db.sheets.sheet_userbag;
    const nameAt = sheet.content[0].indexOf('物品名称');
    const oldRow = clone(sheet.content.find(r => r[nameAt] === '铜钱'));
    const input = { name: '金币', table: { 少量: 1, 普通: 2, 昂贵: 3, 巨额: 4 }, rate: 0.5, base: model.base };
    const updates = h.db.calls.updateRow;
    const edited = await rt.relationOp('money-config', '', input);
    assert.equal(edited.ok, true, JSON.stringify(edited));
    assert.equal(edited.balance, 100);
    assert.equal(h.db.calls.updateRow, updates + 1);
    const newRow = sheet.content.find(r => r[nameAt] === '金币');
    assert.deepEqual(newRow, oldRow.map((v, at) => at === nameAt ? '金币' : v));
    assert.equal(sheet.content.some(r => r[nameAt] === '铜钱'), false);
    const next = await rt.relationOp('money-config-read');
    assert.deepEqual(next.config, { name: input.name, table: input.table, rate: input.rate });
    assert.notEqual(next.base, model.base);
    assert.equal((await rt.relationOp('money-config', '', { ...input, name: '银币' })).reason, 'stats-currency-edit-stale');
    assert.equal((await rt.exchangePoints(oldQuote)).reason, 'points-exchange-currency-conflict');
    assert.equal((await h.services.readSharedPoints()).balance, 500);
    const reopened = await h.openStats(undefined, { getBackgroundRequest: () => () => assert.fail('历史 initial 不因降价失效或重新生成') });
    assert.equal(reopened.archive().currency.name, '金币');
    assert.equal(reopened.archive().currency.balance, 100);
    const fresh = await reopened.quoteExchange(100);
    assert.equal(fresh.amount, 50);
    assert.equal((await reopened.exchangePoints(fresh)).ok, true);
    assert.equal(reopened.currencyBalance(), 150);
});


test('货币编辑：非法和越权字段不写库，无变化不产生意图', async t => {
    const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
    const rt = h.stats;
    const model = await rt.relationOp('money-config-read');
    const input = { ...model.config, base: model.base };
    const before = clone(h.db.sheets);
    const invalid = [null, { ...input, name: '积分' }, { ...input, name: '含 空格' },
        { ...input, name: 'Ａ｜Ｂ' }, { ...input, name: '一二三四五六七' },
        { ...input, table: { ...input.table, 少量: '7' } }, { ...input, table: { ...input.table, 普通: 7 } },
        { ...input, table: { ...input.table, 额外: 3 } }, { ...input, rate: 0 }, { ...input, rate: 100.01 },
        { ...input, rate: 0.251 }, { ...input, rate: '0.5' }, { ...input, base: '' },
        ...['initial', 'seeded', 'seed', 'balance', 'unknown'].map(key => ({ ...input, [key]: 1 }))];
    for (const value of invalid) assert.equal((await rt.relationOp('money-config', '', value)).reason, 'stats-currency-config-invalid');
    assert.equal((await rt.relationOp('money-config', '', input)).cancelled, true);
    assert.deepEqual(h.db.sheets, before);
    assert.equal(h.storage.getItem(`igs:currency-edit:pending:v1:${encodeURIComponent(h.game.ctx.chatId)}`), null);
});

test('货币编辑：零余额不建零数量行，同规范键显示名可原位修改', async t => {
    const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
    const rt = h.stats;
    assert.equal((await rt.relationOp('money-set', '主角', { value: 0 })).ok, true);
    const inventory = h.services.inventoryTables();
    let model = await rt.relationOp('money-config-read');
    const updates = h.db.calls.updateRow;
    assert.equal((await rt.relationOp('money-config', '', { ...model.config, name: 'Gold', base: model.base })).ok, true);
    assert.equal(inventory.read().inventory.items.length, 0);
    assert.equal(rt.currencyBalance(), 0);
    assert.equal(h.db.calls.updateRow, updates);
    assert.equal((await rt.relationOp('money-set', '主角', { value: 37 })).ok, true);
    model = await rt.relationOp('money-config-read');
    assert.equal((await rt.relationOp('money-config', '', { ...model.config, name: 'ＧＯＬＤ', base: model.base })).ok, true);
    const items = inventory.read().inventory.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'ＧＯＬＤ');
    assert.equal(items[0].quantity, 37);
    const cold = await h.openStats();
    assert.equal(cold.currencyBalance(), 37);
});


test('货币编辑：各提交阶段中断后冷重建只续作原意图，不假零或重复改名', async t => {
    for (const stage of ['local', 'intent', 'rename', 'rename-read', 'config', 'config-read', 'done', 'done-read', 'clear']) {
        await t.test(stage, async t => {
            const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
            const rt = h.stats;
            const model = await rt.relationOp('money-config-read');
            const input = { ...model.config, name: '金币', rate: 0.5, base: model.base };
            const api = h.db.api, storage = h.storage;
            const original = { insert: api.insertRow, update: api.updateRow, read: api.exportTableAsJson,
                set: storage.setItem, remove: storage.removeItem };
            let blocked = true, failRead = false, hit = false;
            let renames = 0;
            storage.setItem = (key, value) => {
                if (blocked && stage === 'local' && key.startsWith('igs:currency-edit:')) { hit = true; throw new Error('fixture-save'); }
                return original.set(key, value);
            };
            storage.removeItem = key => {
                if (blocked && stage === 'clear' && key.startsWith('igs:currency-edit:')) { hit = true; throw new Error('fixture-clear'); }
                return original.remove(key);
            };
            api.exportTableAsJson = () => failRead ? {} : original.read();
            api.insertRow = (...args) => {
                const cells = typeof args[0] === 'object' ? args[0].data : args[1];
                const step = String(cells?.['记录ID'] || '').match(/^sc\|ce-.*-(intent|config|done)\|/)?.[1];
                if (blocked && step === stage) { hit = true; return false; }
                const result = original.insert(...args);
                if (blocked && step && stage === `${step}-read`) { hit = true; failRead = true; }
                return result;
            };
            api.updateRow = (...args) => {
                const patch = typeof args[0] === 'object' ? args[0].data : args[2];
                if (patch?.['物品名称'] === '金币') {
                    if (blocked && stage === 'rename') { hit = true; return false; }
                    renames += 1;
                    const result = original.update(...args);
                    if (blocked && stage === 'rename-read') { hit = true; failRead = true; }
                    return result;
                }
                return original.update(...args);
            };
            const failed = await rt.relationOp('money-config', '', input);
            assert.equal(hit, true, stage);
            assert.equal(failed.ok, false, JSON.stringify(failed));
            if (!failRead && stage !== 'local') {
                assert.equal(rt.archive().currency.ready, false);
                assert.equal(rt.archive().currency.balance, null);
                assert.equal(rt.currencyBalance(), null);
            }
            blocked = false; failRead = false;
            const cold = await h.openStats(undefined, { getBackgroundRequest: () => () => assert.fail('不得重新判定或发初始余额') });
            if (stage === 'local') {
                assert.equal(cold.archive().currency.name, '铜钱');
                const fresh = await cold.relationOp('money-config-read');
                assert.equal((await cold.relationOp('money-config', '', { ...input, base: fresh.base })).ok, true);
            } else assert.equal((await cold.retryCurrency()).ok, true);
            assert.equal(cold.archive().currency.name, '金币');
            assert.equal(cold.currencyBalance(), 100);
            assert.equal(renames, 1);
            assert.equal((await h.services.readSharedPoints()).balance, 500);
            assert.equal(storage.getItem(`igs:currency-edit:pending:v1:${encodeURIComponent(h.game.ctx.chatId)}`), null);
            const count = h.db.calls.insertRow + h.db.calls.updateRow;
            assert.equal((await cold.retryCurrency()).balance, 100);
            assert.equal(h.db.calls.insertRow + h.db.calls.updateRow, count);
        });
    }
});


test('货币编辑：目标名称占用与外部行变化拒绝覆盖，恢复仅接受原指纹', async t => {
    for (const conflict of ['occupied', 'lost', 'quantity', 'description']) await t.test(conflict, async t => {
        const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
        const rt = h.stats, inventory = h.services.inventoryTables();
        const model = await rt.relationOp('money-config-read');
        const input = { ...model.config, name: '金币', base: model.base };
        const bag = h.db.sheets.sheet_userbag;
        const at = key => bag.content[0].indexOf(key);
        const source = bag.content.find(row => row[at('物品名称')] === '铜钱');
        if (conflict === 'occupied' || conflict === 'lost') {
            assert.equal((await inventory.changeQuantities([{ name: '金币', delta: 3, category: '普通' }])).ok, true);
            if (conflict === 'lost') {
                const { INVENTORY_LOST_MARK } = await import('../src/data/shujuku/inventory-tables.js');
                bag.content.find(row => row[at('物品名称')] === '金币')[at('类别')] = INVENTORY_LOST_MARK;
                inventory.client.invalidate();
            }
            const before = clone(h.db.sheets);
            assert.equal((await rt.relationOp('money-config', '', input)).reason, 'inventory-rename-target-occupied');
            assert.deepEqual(h.db.sheets, before);
        } else {
            const insert = h.db.api.insertRow;
            let changed = false;
            const field = conflict === 'quantity' ? at('数量') : at('描述/效果');
            const old = source[field];
            h.db.api.insertRow = (...args) => {
                const cells = typeof args[0] === 'object' ? args[0].data : args[1];
                const result = insert(...args);
                if (!changed && /^sc\|ce-.*-intent\|/.test(cells?.['记录ID'] || '')) {
                    changed = true;
                    source[field] = conflict === 'quantity' ? '101' : '外部描述';
                }
                return result;
            };
            assert.equal((await rt.relationOp('money-config', '', input)).reason, 'inventory-rename-conflict');
            assert.equal(changed, true);
            const before = clone(h.db.sheets);
            assert.equal((await rt.retryCurrency()).reason, 'inventory-rename-conflict');
            assert.equal(rt.currencyBalance(), null);
            assert.deepEqual(h.db.sheets, before);
            source[field] = old;
            inventory.client.invalidate();
            assert.equal((await rt.retryCurrency()).balance, 100);
        }
        assert.equal((await h.services.readSharedPoints()).balance, 500);
    });
});


test('货币编辑：缺段仅补原记录，残段不一致停止恢复且不写余额', async t => {
    for (const corrupt of [false, true]) await t.test(corrupt ? '残段冲突' : '原段恢复', async t => {
        const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
        const { createIgsChatStore } = await import('../src/data/shujuku/igs-chat-store.js');
        const { readIgsChatEvidence } = await import('../src/storage/igs-chat-evidence.js');
        const store = createIgsChatStore({ api: () => h.host.AutoCardUpdaterAPI, cellMax: 180,
            chatId: () => h.game.ctx.chatId, chat: () => h.game.ctx.chat,
            evidence: chatId => readIgsChatEvidence({ context: h.game.ctx, chatId, storage: h.storage }) });
        t.after(() => store.dispose());
        const ports = { statsTables: () => store.get().statsAccess, currencyInventory: () => store.get().inventory };
        const rt = await h.openStats(undefined, ports);
        const model = await rt.relationOp('money-config-read');
        const insert = h.db.api.insertRow;
        let interrupted = false;
        h.db.api.insertRow = (...args) => {
            const cells = typeof args[0] === 'object' ? args[0].data : args[1];
            if (/^sc\|ce-.*-intent\|/.test(cells?.['记录ID'] || '') && String(cells['分段']).startsWith('2/')) {
                interrupted = true;
                return false;
            }
            return insert(...args);
        };
        assert.equal((await rt.relationOp('money-config', '', { ...model.config, name: '金币', base: model.base })).ok, false);
        assert.equal(interrupted, true);
        const sheet = Object.values(h.db.sheets).find(s => s.name === 'IGS数值·日志');
        const idAt = sheet.content[0].indexOf('记录ID');
        const part = sheet.content.find(row => /^sc\|ce-.*-intent\|/.test(row[idAt]));
        assert.ok(part);
        if (corrupt) part[sheet.content[0].indexOf('载荷JSON')] += 'x';
        h.db.api.insertRow = insert;
        store.reset();
        assert.equal(store.get().statsAccess.read().ok, false, '普通读取不得绕过残段校验');
        const before = h.db.calls.updateRow;
        const cold = await h.openStats(undefined, ports);
        const result = await cold.retryCurrency();
        assert.equal(result.ok, !corrupt, JSON.stringify(result));
        if (corrupt) {
            assert.ok(['stats-currency-edit-log-conflict', 'igs-legacy-records-invalid', 'stats-chat-not-enabled'].includes(result.reason), result.reason);
            assert.equal(cold.currencyBalance(), null);
            assert.equal(h.db.calls.updateRow, before);
        } else {
            assert.equal(cold.currencyBalance(), 100);
            assert.equal(sheet.content.filter(row => row[idAt] === part[idAt]
                && row[sheet.content[0].indexOf('分段')] === part[sheet.content[0].indexOf('分段')]).length, 1);
        }
    });
});


test('货币编辑：在途单飞且聊天或API失效不写新目标，回原目标后恢复', async t => {
    for (const change of ['chat', 'api']) await t.test(change, async t => {
        const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
        const rt = h.stats, inv = h.services.inventoryTables();
        const model = await rt.relationOp('money-config-read');
        const input = { ...model.config, name: '金币', base: model.base };
        const prepare = inv.prepareRename;
        let release, entered;
        const paused = new Promise(resolve => { entered = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        inv.prepareRename = async (...args) => {
            const result = await prepare(...args);
            entered();
            await gate;
            return result;
        };
        const job = rt.relationOp('money-config', '', input);
        await paused;
        assert.equal((await rt.relationOp('money-config', '', input)).reason, 'busy');
        assert.equal(rt.archive().currency.pending, true);
        assert.equal(rt.archive().currency.ready, false);
        assert.equal(rt.exchangeInfo().ok, false);
        const before = clone(h.db.sheets);
        const oldChat = h.game.ctx.chatId;
        if (change === 'chat') h.game.ctx.chatId = 'chat-b';
        else h.host.AutoCardUpdaterAPI = { ...h.db.api };
        release();
        assert.equal((await job).reason, 'request-stale');
        assert.deepEqual(h.db.sheets, before);
        h.game.ctx.chatId = oldChat;
        h.host.AutoCardUpdaterAPI = h.db.api;
        inv.prepareRename = prepare;
        const cold = await h.openStats();
        assert.equal(cold.currencyBalance(), 100);
        const fresh = await cold.relationOp('money-config-read');
        assert.equal((await cold.relationOp('money-config', '', { ...input, base: fresh.base })).ok, true);
        assert.equal(cold.currencyBalance(), 100);
    });
});

test('货币编辑：新编辑先恢复旧兑换，只扣一次且保留恢复后的余额', async t => {
    const h = await sharedRuntime(t, 500, {}, { rate: 0.25 });
    const rt = h.stats, inv = h.services.inventoryTables();
    const model = await rt.relationOp('money-config-read');
    const quote = await rt.quoteExchange(100);
    const change = inv.changeQuantities;
    inv.changeQuantities = async () => ({ ok: false, reason: 'inventory-write-failed' });
    assert.equal((await rt.exchangePoints(quote)).ok, false);
    assert.equal((await h.services.readSharedPoints()).balance, 400);
    inv.changeQuantities = change;
    const result = await rt.relationOp('money-config', '', { ...model.config, name: '金币', rate: 0.5, base: model.base });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.balance, 125);
    assert.equal((await h.services.readSharedPoints()).balance, 400);
    assert.equal((await rt.exchangePoints(quote)).present, true);
    assert.equal(rt.currencyBalance(), 125);
});

test('P4 主角统一建档（v2 无战斗表）：一次请求补齐六维与货币，不建战斗表，确认后才展示技能/NPC交互', async t => {
    const { createIgsChatStore } = await import('../src/data/shujuku/igs-chat-store.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { readIgsChatEvidence } = await import('../src/storage/igs-chat-evidence.js');
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const handlers = new Map();
    const context = {
        name1: '主角', name2: '小雪', chatId: 'v2-hero-init-1', chatMetadata: {},
        chat: [{ is_user: true, mes: '进城打探消息' }, { is_user: false, mes: '街市热闹。', swipe_id: 0 }],
        getCurrentChatId: () => context.chatId, setExtensionPrompt() {}, saveMetadata() {},
        eventTypes: { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', CHAT_CHANGED: 'cc' },
        eventSource: {
            on(k, fn) { if (!handlers.has(k)) handlers.set(k, new Set()); handlers.get(k).add(fn); },
            removeListener(k, fn) { handlers.get(k)?.delete(fn); },
        },
    };
    const chatStore = createIgsChatStore({
        api: () => db.api,
        chatId: () => context.chatId,
        chat: () => context.chat,
        userName: () => context.name1,
        evidence: id => readIgsChatEvidence({ context, chatId: id, storage }),
        storage,
    });
    t.after(() => chatStore.dispose());
    const requests = [];
    const rt = createStatsRuntime({
        getContext: () => context,
        readSettings: () => ({ enabled: true, ruleset: 'dnd5e', autoSkill: false, sheetGen: 'prompt', backfill: 'off', push: { enabled: false } }),
        statsTables: () => chatStore.get().statsAccess,
        attributeAccess: () => chatStore.get().attributeAccess,
        currencyInventory: () => chatStore.get().inventory,
        currencyEditStorage: storage,
        generationIdentity: () => chatStore.get(),
        getBackgroundRequest: () => (prompt, opts) => new Promise(resolve => requests.push({ prompt, opts, resolve })),
    });
    t.after(() => rt.destroy());
    rt.sync();
    for (let i = 0; i < 40 && !rt.notices().some(n => n.id === 'hero-init-mode'); i += 1) await new Promise(r => setTimeout(r, 10));
    assert.equal(rt.notices().some(n => n.id === 'hero-init-mode'), true, '开局先询问自行填写还是自动生成，不抢跑请求模型');
    assert.equal(requests.length, 0);
    void rt.noticeAction('hero-init-mode', 'auto');
    for (let i = 0; i < 40 && requests.length === 0; i += 1) await new Promise(r => setTimeout(r, 10));
    assert.equal(requests.length, 1, '选择自动生成后仅发一次统一主角初始化请求');
    assert.equal(rt.heroBasicReady(), false, '主角基础确认前不就绪');
    assert.equal(rt.notices().some(n => n.id === 'hero-pick'), true, '主角擅长技能与 NPC 建档策略提示可并发出现');
    assert.equal(rt.notices().some(n => n.id === 'npc-policy'), true, 'NPC 建档策略提示与主角建档并发出现');

    requests[0].resolve(JSON.stringify({
        attributes: { 力量: 13, 敏捷: 15, 体质: 12, 智力: 11, 感知: 14, 魅力: 10 },
        currency: { name: '银币', initial: 50, prices: { 少量: 5, 普通: 20, 昂贵: 100, 巨额: 500 }, rate: 1 },
        bio: '出身港城的年轻调查员，做事谨慎且善于观察细节。',
    }));
    await rt.whenSaved();
    assert.equal(rt.heroBasicReady(), true);
    assert.equal(rt.currencyBalance(), 50);
    assert.equal(rt.archive().heroBio, '出身港城的年轻调查员，做事谨慎且善于观察细节。');
    assert.equal(rt.protagonistLookup()('主角')?.bio, '出身港城的年轻调查员，做事谨慎且善于观察细节。');
    const heroAttrs = chatStore.get().attributeAccess.source().readAbilities('主角');
    assert.equal(heroAttrs.initialized, true);
    assert.deepEqual(heroAttrs.permanentScores, { str: 13, dex: 15, con: 12, int: 11, wis: 14, cha: 10 });
    assert.equal(rt.notices().some(n => n.id === 'hero-pick'), true, '未选技能前仍保留技能选择提示');
    const sheetNames = Object.values(db.sheets).map(s => s.name);
    assert.equal(sheetNames.includes('IGS战斗·档案'), false, '纯数值初始化不得建立战斗档案表');
    assert.equal(sheetNames.includes('IGS战斗·日志'), false, '纯数值初始化不得建立战斗日志表');
    assert.equal(sheetNames.includes('IGS战斗·装配'), false, '纯数值初始化不得建立战斗装配表');
    assert.equal(sheetNames.includes('IGS数值·属性'), true);
    assert.equal(sheetNames.includes('IGS·存储'), true);
    assert.notEqual(db.sheets.sheet_userbag.updateConfig?.updateFrequency, 0, '未开战斗时不得接管用户物品表');
});

test('P4 部分补缺、回包前手改防覆盖与分阶段中断冷恢复（不重发模型、不重复发初始金钱）', async t => {
    const { createIgsChatStore } = await import('../src/data/shujuku/igs-chat-store.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { readIgsChatEvidence } = await import('../src/storage/igs-chat-evidence.js');
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const context = {
        name1: '主角', name2: '小雪', chatId: 'v2-hero-recover-1', chatMetadata: {},
        chat: [{ is_user: true, mes: '出发' }, { is_user: false, mes: '开局。', swipe_id: 0 }],
        getCurrentChatId: () => context.chatId, setExtensionPrompt() {}, saveMetadata() {},
        eventTypes: { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', CHAT_CHANGED: 'cc' },
        eventSource: { on() {}, removeListener() {} },
    };
    const makeStore = () => createIgsChatStore({
        api: () => db.api,
        chatId: () => context.chatId,
        chat: () => context.chat,
        userName: () => context.name1,
        evidence: id => readIgsChatEvidence({ context, chatId: id, storage }),
        storage,
    });
    const store1 = makeStore();
    t.after(() => store1.dispose());
    // 1. 回包前手改补足六维：模型回包后绝不覆盖手改六维，但仍补货币；且在初始发钱阶段注入失败，验证冷恢复不重发模型
    const reqs = [];
    let failBag = true;
    const inv1 = store1.get().inventory;
    const origChange = inv1.changeQuantities;
    inv1.changeQuantities = async (...args) => failBag
        ? { ok: false, reason: 'inventory-write-failed' }
        : origChange(...args);
    const rt1 = createStatsRuntime({
        getContext: () => context,
        readSettings: () => ({ enabled: true, ruleset: 'dnd5e', autoSkill: false, sheetGen: 'off', backfill: 'off', push: { enabled: false } }),
        statsTables: () => store1.get().statsAccess,
        attributeAccess: () => store1.get().attributeAccess,
        currencyInventory: () => store1.get().inventory,
        currencyEditStorage: storage,
        generationIdentity: () => store1.get(),
        getBackgroundRequest: () => (prompt) => new Promise(resolve => reqs.push({ prompt, resolve })),
    });
    t.after(() => rt1.destroy());
    rt1.sync();
    for (let i = 0; i < 40 && !rt1.notices().some(n => n.id === 'hero-init-mode'); i += 1) await new Promise(r => setTimeout(r, 10));
    void rt1.noticeAction('hero-init-mode', 'auto');
    for (let i = 0; i < 40 && reqs.length === 0; i += 1) await new Promise(r => setTimeout(r, 10));
    assert.equal(reqs.length, 1);
    // 在模型返回之前，用户手改补足主角六维
    const heroRead = store1.get().attributeAccess.readHero('主角');
    assert.equal(heroRead.ok, true);
    const manualScores = { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 };
    assert.equal((await store1.get().attributeAccess.editHero('主角', manualScores, { expectedRevision: heroRead.view.revision })).ok, true);
    // 模型回包给出了另一套六维和银币 80，但物品表写入失败
    reqs[0].resolve(JSON.stringify({
        attributes: { 力量: 8, 敏捷: 8, 体质: 8, 智力: 18, 感知: 18, 魅力: 18 },
        currency: { name: '银币', initial: 80, prices: { 少量: 5, 普通: 20, 昂贵: 100, 巨额: 500 }, rate: 1 },
    }));
    await rt1.whenSaved();
    assert.equal(rt1.heroBasicReady(), false, '初始发钱失败时基础未完成');
    assert.deepEqual(store1.get().attributeAccess.source().readAbilities('主角').permanentScores, manualScores, '回包不得覆盖并发手改的六维');
    rt1.destroy();

    // 2. 冷重建恢复：修复物品表后重启，只补原结果的初始发钱，模型请求数仍为 1，不重复发钱
    failBag = false;
    inv1.changeQuantities = origChange;
    const store2 = makeStore();
    t.after(() => store2.dispose());
    let coldCalls = 0;
    const rt2 = createStatsRuntime({
        getContext: () => context,
        readSettings: () => ({ enabled: true, ruleset: 'dnd5e', autoSkill: false, sheetGen: 'off', backfill: 'off', push: { enabled: false } }),
        statsTables: () => store2.get().statsAccess,
        attributeAccess: () => store2.get().attributeAccess,
        currencyInventory: () => store2.get().inventory,
        currencyEditStorage: storage,
        generationIdentity: () => store2.get(),
        getBackgroundRequest: () => () => { coldCalls += 1; throw new Error('must-not-call-model-on-recovery'); },
    });
    t.after(() => rt2.destroy());
    rt2.sync();
    await rt2.whenSaved();
    assert.equal(coldCalls, 0, '中断冷恢复只补缺阶段，绝不重发模型请求');
    assert.equal(rt2.heroBasicReady(), true);
    assert.equal(rt2.currencyBalance(), 80, '只入账一次 80 银币');
    assert.deepEqual(store2.get().attributeAccess.source().readAbilities('主角').permanentScores, manualScores);

    // 3. 合法零余额 + 已有货币，再检查不重发模型、不重发初始金额
    assert.equal((await store2.get().inventory.changeQuantities([{ name: '银币', delta: -80, expectedBefore: 80, category: '货币' }])).ok, true);
    assert.equal(rt2.currencyBalance(), 0);
    await rt2.ensureHeroInit({ force: true });
    assert.equal(coldCalls, 0);
    assert.equal(rt2.currencyBalance(), 0, '合法零余额不得触发重复发放初始金钱');
});

test('回归：物品表描述列 NOT NULL 约束不触发 SQL_CONSTRAINT，且未开战斗时不建 IGS战斗·装配 也不接管物品表', async t => {
    const { createIgsChatStore } = await import('../src/data/shujuku/igs-chat-store.js');
    const { createLedgerMockHost } = await import('./helpers/combat-mock-host-ledger.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { readIgsChatEvidence } = await import('../src/storage/igs-chat-evidence.js');
    const db = createLedgerMockHost({ supportCallbacks: true });
    // 复刻官方「恋爱Gal_IGS数值系统适配版」物品表：description TEXT NOT NULL CHECK(LENGTH(description) <= 80)
    db.sheets.sheet_wu_pin_biao = {
        uid: 'sheet_wu_pin_biao',
        name: '物品表',
        orderNo: 0,
        updateConfig: { updateFrequency: 1 },
        sourceData: {
            insertNode: '主角获得新物品时插入。',
            ddl: [
                'CREATE TABLE sheet_wu_pin_biao (',
                '  row_id INTEGER PRIMARY KEY,',
                '  item_name TEXT NOT NULL UNIQUE CHECK(LENGTH(item_name) <= 15), -- 物品名称',
                '  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 0), -- 数量',
                '  description TEXT NOT NULL CHECK(LENGTH(description) <= 80), -- 描述',
                '  states_now TEXT -- 状态',
                ');',
            ].join('\n'),
        },
        content: [['row_id', '物品名称', '数量', '描述', '状态']],
    };
    const origInsert = db.api.insertRow;
    const insertedPayloads = [];
    db.api.insertRow = (first, second) => {
        const tableName = first && typeof first === 'object' ? first.tableName : first;
        const data = first && typeof first === 'object' ? first.data : second;
        if (tableName === '物品表') {
            insertedPayloads.push(clone(data));
            // 严格模拟 SQLite NOT NULL：缺失/undefined/null 直接拒绝
            for (const required of ['物品名称', '数量', '描述']) {
                if (!data || !Object.hasOwn(data, required) || data[required] === null || data[required] === undefined) {
                    return { success: false, error: 'SQL_CONSTRAINT' };
                }
            }
            if (String(data['描述']).length > 80) return { success: false, error: 'SQL_CONSTRAINT' };
        }
        return origInsert(first, second);
    };
    const storage = createMemoryStorage();
    const context = {
        name1: '主角', name2: '小雪', chatId: 'v2-sql-constraint-1', chatMetadata: {},
        chat: [{ is_user: true, mes: '出发' }, { is_user: false, mes: '开局。', swipe_id: 0 }],
        getCurrentChatId: () => context.chatId, setExtensionPrompt() {}, saveMetadata() {},
        eventTypes: { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', CHAT_CHANGED: 'cc' },
        eventSource: { on() {}, removeListener() {} },
    };
    const chatStore = createIgsChatStore({
        api: () => db.api,
        chatId: () => context.chatId,
        chat: () => context.chat,
        userName: () => context.name1,
        evidence: id => readIgsChatEvidence({ context, chatId: id, storage }),
        storage,
    });
    t.after(() => chatStore.dispose());
    const requests = [];
    const rt = createStatsRuntime({
        getContext: () => context,
        readSettings: () => ({ enabled: true, ruleset: 'coc7', autoSkill: false, sheetGen: 'off', backfill: 'off', push: { enabled: false } }),
        combatEnabled: () => false,
        statsTables: () => chatStore.get().statsAccess,
        attributeAccess: () => chatStore.get().attributeAccess,
        currencyInventory: () => chatStore.get().inventory,
        currencyEditStorage: storage,
        generationIdentity: () => chatStore.get(),
        getBackgroundRequest: () => (prompt) => new Promise(resolve => requests.push({ prompt, resolve })),
    });
    t.after(() => rt.destroy());
    rt.sync();
    for (let i = 0; i < 40 && !rt.notices().some(n => n.id === 'hero-init-mode'); i += 1) await new Promise(r => setTimeout(r, 10));
    void rt.noticeAction('hero-init-mode', 'auto');
    for (let i = 0; i < 40 && requests.length === 0; i += 1) await new Promise(r => setTimeout(r, 10));
    assert.equal(requests.length, 1);
    requests[0].resolve(JSON.stringify({
        attributes: { 力量: 12, 敏捷: 13, 体质: 11, 智力: 14, 感知: 12, 魅力: 13 },
        currency: { name: '日元', initial: 5000, prices: { 少量: 500, 普通: 2000, 昂贵: 8000, 巨额: 30000 }, rate: 10 },
    }));
    await rt.whenSaved();
    assert.equal(rt.heroBasicReady(), true);
    assert.equal(rt.currencyBalance(), 5000);
    // 1) 写入边界显式带上非空描述，未触发 SQL_CONSTRAINT
    assert.equal(insertedPayloads.length, 1);
    assert.equal(insertedPayloads[0]['物品名称'], '日元');
    assert.equal(insertedPayloads[0]['描述'], '剧情货币');
    assert.equal(insertedPayloads[0]['类别'], '货币');
    // 2) 未开战斗时，严禁插入任何 IGS战斗·* 表，也不得接管/冻结用户物品表
    const sheetNamesOff = Object.values(db.sheets).map(s => s.name);
    assert.equal(sheetNamesOff.includes('IGS战斗·装配'), false, '未开战斗不得插入 IGS战斗·装配');
    assert.equal(sheetNamesOff.includes('IGS战斗·档案'), false, '未开战斗不得插入 IGS战斗·档案');
    assert.equal(sheetNamesOff.includes('IGS战斗·日志'), false, '未开战斗不得插入 IGS战斗·日志');
    assert.equal(db.sheets.sheet_wu_pin_biao.updateConfig.updateFrequency, 1, '未开战斗不得关闭用户物品表的自动更新');
    assert.equal(db.sheets.sheet_wu_pin_biao.sourceData.insertNode, '主角获得新物品时插入。');
    // 3) 即使业务侧省略 description 新增普通物品，inventory-tables 也在写入边界传 "" 而非省略/NULL
    const plain = await chatStore.get().inventory.changeQuantities([{ name: '铁钥匙', delta: 1 }]);
    assert.equal(plain.ok, true, JSON.stringify(plain));
    assert.equal(insertedPayloads.length, 2);
    assert.equal(insertedPayloads[1]['描述'], '');
    assert.equal(insertedPayloads[1]['类别'], '');
    // 4) 后续开启战斗后，调用默认 inventory.ensure() 才会补建 IGS战斗·装配 并接管物品表
    const combatEnsure = await chatStore.get().inventory.ensure();
    assert.equal(combatEnsure.ok, true, JSON.stringify(combatEnsure));
    const sheetNamesOn = Object.values(db.sheets).map(s => s.name);
    assert.equal(sheetNamesOn.includes('IGS战斗·装配'), true, '开启战斗后应补建 IGS战斗·装配');
    assert.equal(db.sheets.sheet_wu_pin_biao.updateConfig.updateFrequency, 0, '开启战斗后应接管物品表');
});
