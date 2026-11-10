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

// ---------- 合并余额计算 ----------
test('合并余额 = 数值侧金钱 + 战斗积分；取不到的一侧按 0', () => {
    assert.equal(walletBalance({ money: 80 }, 120), 200);
    assert.equal(walletBalance({ money: 80 }), 80);
    assert.equal(walletBalance({ money: -30 }, 130), 100);
    assert.equal(walletBalance(null, 'x'), 0);
});

// ---------- 「买不起」按合并余额 ----------
test('花费：数值侧金钱不够但合并余额够时照扣并让 bars.money 为负；合并余额也不够才买不起', () => {
    const bars = { stamina: 100, stress: 0, money: 50 };
    const spend = { kind: 'money', flow: '花费', value: '普通' };
    const short = applyBarDirective(bars, spend);
    assert.equal(short.shortfall, true);
    assert.equal(short.bars.money, 50);
    const paid = applyBarDirective(bars, spend, undefined, 60);
    assert.equal(paid.shortfall, undefined);
    assert.equal(paid.bars.money, -50);
    assert.equal(walletBalance(paid.bars, 60), 10);
    assert.equal(applyBarDirective(bars, spend, undefined, 49).shortfall, true);
    assert.equal(applyBarDirective(bars, { kind: 'money', flow: '收入', value: '少量' }).bars.money, 70);
    assert.equal(applyBarDirective({ ...bars, money: 500 }, spend).bars.money, 400);
});

test('结算：settleFloorText 把战斗积分带进「买不起」判断；提示词里的「金钱」是合并余额', () => {
    const before = createStatsState({ money: 30 });
    const text = '她递来账单。\n[igs-stat:money|花费|普通]';
    const broke = settleFloorText(before, text, { random: () => 0.5 });
    assert.equal(broke.meta.flags.shortfall, true);
    const covered = settleFloorText(before, text, { random: () => 0.5, walletExtra: 80 });
    assert.equal(covered.meta.flags && covered.meta.flags.shortfall, undefined);
    assert.equal(covered.state.protagonist.bars.money, -70);
    const prompt = buildStatsPrompt(covered.state, { walletExtra: 80 });
    assert.match(prompt.content, /积分10/);
});

// ---------- bars.* 开关与状态栏主角条 ----------
test('主角条：金钱条显示合并余额；bars 开关决定出哪几条', () => {
    const bars = { stamina: 60, stress: 20, money: 40 };
    const all = protagonistStatMetrics(bars, { enabledBars: { stamina: true, stress: true, money: true }, walletExtra: 160 });
    assert.deepEqual(all.map((m) => m.label), ['体力', '压力', '积分']);
    assert.equal(all.find((m) => m.label === '积分').display, '200');
    const some = protagonistStatMetrics(bars, { enabledBars: { stamina: false, stress: true, money: false }, vitals: { hp: 9, maxHp: 10, down: false } });
    assert.deepEqual(some.map((m) => m.label), ['生命', '压力']);
    assert.ok(all.every((m) => /^slot-[1-6]$/.test(m.colorKey)));
});

test('状态栏叠加：主角说话时换成主角条；其他名字原样返回', () => {
    const model = { character: '我', metrics: [{ label: '旧', percent: 1, display: '1' }], hiddenCount: 2, loadState: 'idle', relation: '' };
    const metrics = protagonistStatMetrics({ stamina: 60, stress: 20, money: 5 }, { enabledBars: { money: true }, walletExtra: 5 });
    const lookup = (name) => (name === '我' ? { metrics, stages: [] } : null);
    assert.equal(overlayStatsMetrics(model, lookup, '我').metrics, metrics);
    assert.equal(overlayStatsMetrics(model, lookup, '路人'), model);
});

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

test('战斗花费：合并余额不足被拒、足够可通过；写入后合并余额与战斗净流水各自正确', async () => {
    const { holder, ledger } = walletLedger(100);
    assert.equal(heroOf(await ledger.effectiveState()).points, 100);
    assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, 0);
    const refused = await ledger.respecClass('pc-hero', 'cls-mage');
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'combat-points-insufficient');
    holder.money = 150;
    const done = await ledger.respecClass('pc-hero', 'cls-mage');
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, -150);
    assert.equal(heroOf(await ledger.effectiveState()).points, 0);
    holder.money = 400;
    assert.equal(heroOf(await ledger.effectiveState()).points, 250);
});

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

test('igs:stats-fx 反馈：好感与成长走现有飘字，关系阶段只给当前说话人；同楼同角色好感只飘一次', () => {
    const root = makeStage({ hud: true });
    const timers = makeTimers();
    const opts = { readerSettings: READER, speaker: '小雪', schedule: timers.schedule, clear: timers.clear };
    assert.equal(playStatsFeedback(root, fx, opts).played, 3);
    assert.deepEqual(favorTexts(root), ['小雪 ♥', '说服成长 +3', '小雪：陌生 → 熟人']);
    assert.equal(playStatsFeedback(root, fx, opts).played, 2);
    cancelFxEffects(root);
});

test('飘字开关关闭时 igs:stats-fx 反馈直接丢弃，不动 DOM', () => {
    const root = makeStage({ hud: true });
    assert.equal(playStatsFeedback(root, fx, { readerSettings: { favorToast: { enabled: false } }, speaker: '小雪' }).played, 0);
    assert.equal(root.querySelector('.igs-fx-favor-stack'), null);
});

test('页面差分飘字与 igs:stats-fx 去重：stats-fx 先飘过的好感，随后页面差分不再重复', () => {
    const timers = makeTimers();
    const opts = { schedule: timers.schedule, clear: timers.clear, playSfx: () => {}, readerSettings: READER, speaker: '小雪' };
    const page = (value) => ({
        messageId: 9, mode: 'embedded', readerSettings: READER,
        content: { currentIndex: 0, statusHud: { character: '小雪', metrics: [{ label: '好感', percent: value, display: '', statValue: value, quiet: true }] }, fx: { instants: [] } },
    });
    const root = makeStage({ hud: true });
    applyFxToDom(root, page(10), opts);
    playStatsFeedback(root, fx, opts);
    assert.equal(applyFxToDom(root, page(14), opts).played.includes('favor'), false);
    cancelFxEffects(root);
    // 没有先飘过时，页面差分照常出飘字（差分基线是模块级的，上面已记到 14，回落到 10 即有变化）
    const other = makeStage({ hud: true });
    assert.equal(applyFxToDom(other, page(10), opts).played.includes('favor'), true);
    cancelFxEffects(other);
});

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

test('运行时：状态栏主角条只给主角；共享积分不受战斗界面开关影响，生命仍跟随战斗开关', () => {
    const off = runtimeSetup({ combat: false, points: 500 });
    const lookup = off.protagonistLookup();
    assert.equal(lookup('小雪'), null);
    const own = lookup('阿明');
    assert.deepEqual(own.metrics.map((m) => m.label), ['体力', '压力', '积分']);
    assert.equal(own.metrics.find((m) => m.label === '积分').display, '500');
    assert.equal(off.walletMoney(), 0);
    const on = runtimeSetup({ combat: true, points: 120 });
    const mine = on.protagonistLookup()('阿明');
    assert.deepEqual(mine.metrics.map((m) => m.label), ['生命', '体力', '压力', '积分']);
    assert.equal(mine.metrics.find((m) => m.label === '积分').display, '120');
    assert.equal(mine.metrics.find((m) => m.label === '生命').display, '7/10');
});

test('运行时：bars 开关关掉的条不出现；总开关关闭或本聊天未启用时返回 null', () => {
    const rt = runtimeSetup({ bars: { stamina: false, money: false, stress: true } });
    assert.deepEqual(rt.protagonistLookup()('阿明').metrics.map((m) => m.label), ['压力']);
    const idle = createStatsRuntime({ getContext: () => ({ chat: [], chatMetadata: {}, getCurrentChatId: () => 'c' }), readSettings: () => ({ enabled: false }) });
    assert.equal(idle.protagonistLookup(), null);
    assert.equal(idle.walletMoney(), 0);
});

// ---------- 状态栏开关：关着什么都不显示，开着只在主角说话时出主角条 ----------
test('状态栏开关：关着时主角区与数值反馈都不出现，开着时旁白与其他角色不加主角区、反馈照常', () => {
    const rt = runtimeSetup({ combat: true, points: 120 });
    const block = rt.protagonistBlock();
    assert.equal(block.name, '阿明');
    assert.deepEqual(block.metrics.map((m) => m.label), ['生命', '体力', '压力', '积分']);
    const lookup = rt.protagonistLookup();
    const model = (enabled, character) => ({ enabled, character, metrics: [], hiddenCount: 0, relation: '' });
    const compose = (enabled, speaker) => composeStatsHud(model(enabled, speaker), { lookup, speaker });
    for (const speaker of ['', '小雪']) {
        const off = model(false, speaker);
        assert.equal(composeStatsHud(off, { lookup, speaker }), off);
        assert.equal(compose(true, speaker).hero, undefined);
    }
    assert.equal(compose(true, '阿明').hero, undefined);
    assert.deepEqual(compose(true, '阿明').metrics, block.metrics);
    const root = makeStage({ hud: true });
    const timers = makeTimers();
    const opts = (statusHud) => ({ readerSettings: { ...READER, statusHud }, speaker: '小雪', schedule: timers.schedule, clear: timers.clear });
    assert.equal(playStatsFeedbackWithHud(root, fx, opts({ enabled: false })).played, 0);
    assert.equal(playStatsFeedbackWithHud(root, fx, { ...opts(undefined) }).played, 0);
    assert.equal(root.querySelector('.igs-fx-favor-stack'), null);
    assert.equal(playStatsFeedbackWithHud(root, fx, opts({ enabled: true })).played, 3);
    cancelFxEffects(root);
});

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

test('生产共用积分：Origin收入可供战斗消费，重建回读与关闭战斗均不重复加旧钱包', async (t) => {
    const h = await sharedRuntime(t, 120);
    h.game.user(); h.game.ai('委托完成<origin>\n新任务|类型:支线|标题:委托|奖励:积分30\n完成|1\n</origin>');
    await h.runtime.engine.whenSaved();
    assert.equal(h.runtime.engine.getState().points, 150);
    assert.deepEqual(await h.services.readSharedPoints(), { ok: true, wallet: 120, combat: 0, origin: 30, games: 0, flow: 30, balance: 150 });
    assert.equal((await h.ledger.respecClass('pc-hero', 'cls-mage')).ok, true);
    assert.equal((await h.services.readSharedPoints()).balance, 0);
    assert.equal(h.runtime.engine.getState().points, 0);
    assert.equal(h.holder.money, 120);
    assert.equal((await h.ledger.effectiveState({ raw: true })).characters.get('pc-hero').points, -150);
    assert.equal((await h.ledger.effectiveState()).characters.get('pc-hero').points, 0);
    h.holder.enabled = false;
    assert.equal(h.services.getLedger(), null);
    assert.equal((await h.services.readSharedPoints()).balance, 0);
    assert.equal(h.services.lifeSource().readPoints(), -120);
    await h.runtime.engine.reload();
    assert.equal(h.runtime.engine.getState().points, 0);
    assert.equal((await h.services.readSharedPoints()).origin, 30);
});

test('生产共用积分：战斗净流水供Origin购买和本地抽奖，跨系统并发不能超支', async (t) => {
    const h = await sharedRuntime(t, 300);
    h.game.user('出发'); h.game.ai('交易准备');
    await h.runtime.engine.whenSaved();
    const results = await Promise.all([
        h.runtime.engine.dispatch({ type: 'buy', name: '凝神丹' }),
        h.ledger.respecClass('pc-hero', 'cls-mage'),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1, JSON.stringify(results));
    const balance = await h.services.readSharedPoints();
    assert.equal(balance.balance, results[0].ok ? 100 : 150);
    assert.equal(h.runtime.engine.getState().points, balance.balance);
    assert.ok(balance.balance >= 0);
    assert.equal(h.holder.money, 300);
    const short = await h.runtime.engine.dispatch({ type: 'draw' });
    assert.equal(short.reason, 'no-points');
    assert.equal((await h.services.readSharedPoints()).balance, balance.balance);
    h.holder.money += 300;
    const bought = await h.runtime.engine.dispatch({ type: 'draw' });
    assert.equal(bought.ok, true, JSON.stringify(bought));
    const after = await h.services.readSharedPoints();
    assert.equal(after.balance, balance.balance);
    assert.equal(h.holder.money, 600);
    assert.equal(h.runtime.engine.getState().points, after.balance);
    await h.runtime.engine.reload();
    assert.equal(h.runtime.engine.getState().points, after.balance);
});

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
    assert.equal((await h.services.readSharedPoints()).balance, 300);
    const count = h.db.calls.insertRow;
    assert.equal((await runtime.engine.retrySave()).ok, true);
    await runtime.engine.whenSaved();
    assert.equal(h.db.calls.insertRow, count);
    assert.equal(runtime.engine.getState().points, 300);
});

test('积分结算基础：有奖终局只入库一次，战斗可消费第四份额，关闭战斗仍可读', async t => {
    const h = await sharedRuntime(t, 148);
    h.game.user(); const messageId = h.game.ai('休息一下');
    await h.runtime.engine.whenSaved();
    const points = h.services.points();
    const started = await points.start({ game: 'rps', messageId });
    assert.equal(started.ok, true, JSON.stringify(started));
    const result = await points.award(started.roundId, { win: true });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.amount, 2);
    const count = h.db.calls.insertRow;
    assert.equal((await points.award(started.roundId, { win: true })).present, true);
    assert.equal(h.db.calls.insertRow, count);
    assert.deepEqual(await h.services.readSharedPoints(), { ok: true, wallet: 148, combat: 0, origin: 0, games: 2, flow: 2, balance: 150 });
    assert.equal(h.runtime.engine.getState().points, 150);
    assert.equal((await h.ledger.respecClass('pc-hero', 'cls-mage')).ok, true);
    assert.equal((await h.services.readSharedPoints()).balance, 0);
    assert.equal((await h.ledger.effectiveState({ raw: true })).gamePoints, 2);
    h.holder.enabled = false;
    assert.equal((await h.services.readSharedPoints()).balance, 0);
    assert.equal(h.holder.money, 148);
});

test('积分结算基础：600亏损对80余额完整结算为负数，重复回调和重读不重复扣款', async t => {
    const h = await sharedRuntime(t, 80);
    const messageId = h.game.ai('牌桌'); await h.runtime.engine.whenSaved();
    const points = h.services.points();
    const started = await points.start({ game: 'mahjong', rules: 'chengdu', messageId });
    assert.equal(started.ok, true, JSON.stringify(started));
    const hand = { handId: 'hand-1', rules: 'chengdu', legs: [-24, -20, -21], raw: { source: 'fixture' } };
    const ended = await points.hand(started.roundId, hand);
    assert.equal(ended.ok, true, JSON.stringify(ended));
    assert.equal(ended.settled, true);
    assert.equal(ended.amount, -600);
    assert.equal((await h.services.readSharedPoints()).balance, -520);
    assert.equal(h.runtime.engine.getState().points, -520);
    assert.equal((await h.ledger.effectiveState()).characters.get('pc-hero').points, -520);
    const count = h.db.calls.insertRow;
    assert.equal((await points.hand(started.roundId, hand)).present, true);
    assert.equal(h.db.calls.insertRow, count);
    assert.equal((await points.start({ game: 'mahjong', rules: 'chengdu', messageId })).reason, 'points-insufficient');
    assert.equal((await h.ledger.respecClass('pc-hero', 'cls-mage')).reason, 'combat-points-insufficient');
    assert.equal((await h.runtime.engine.dispatch({ type: 'buy', name: '凝神丹' })).reason, 'no-points');
    assert.equal(h.holder.money, 80);
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

test('积分结算基础：楼层身份跨删中间楼和Origin折叠保留，swipe回退收支与占用', async t => {
    const h = await sharedRuntime(t, 0);
    const first = h.game.ai('前楼'); const messageId = h.game.ai('来源楼');
    await h.runtime.engine.whenSaved();
    const points = h.services.points();
    const started = await points.start({ game: 'rps', messageId });
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal((await points.award(started.roundId, { win: true })).amount, 2);
    const uid = h.game.ctx.chat[messageId].extra.igs_points_uid;
    h.game.ctx.chat.splice(first, 1);
    delete h.game.ctx.chat[0].extra.origin;
    assert.equal((await h.services.readSharedPoints()).balance, 2);
    h.game.ctx.chat[0].swipe_id = 1;
    assert.equal((await h.services.readSharedPoints()).balance, 0);
    assert.equal(points.read().grants.length, 0);
    h.game.ctx.chat[0].swipe_id = 0;
    assert.equal((await h.services.readSharedPoints()).balance, 2);
    assert.equal(h.game.ctx.chat[0].extra.igs_points_uid, uid);
    h.game.ctx.chat.splice(0, 1);
    assert.equal((await h.services.readSharedPoints()).balance, 0);
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

test('积分结算基础：未写入的失效奖励重试丢弃，不消耗确认额度', async t => {
    const h = await sharedRuntime(t, 0);
    const messageId = h.game.ai('游戏'); await h.runtime.engine.whenSaved();
    const points = h.services.points();
    const started = await points.start({ game: 'rps', messageId });
    const insert = h.db.api.insertRow; h.db.api.insertRow = () => false;
    assert.equal((await points.award(started.roundId, { win: true })).ok, false);
    h.game.ctx.chat[messageId].swipe_id = 1; h.db.api.insertRow = insert;
    const count = h.db.calls.insertRow;
    assert.equal((await points.retry()).skipped, true);
    assert.equal(h.db.calls.insertRow, count);
    h.game.ctx.chat[messageId].swipe_id = 0;
    assert.equal((await h.services.readSharedPoints()).balance, 0);
    assert.equal(points.read().grants.length, 0);
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

test('积分结算基础：局末余额核对失败保留阻断，等于余额可继续，退桌失败沿原记录恢复', async t => {
    const h = await sharedRuntime(t, 80);
    const messageId = h.game.ai('牌桌'); await h.runtime.engine.whenSaved();
    const points = h.services.points();
    const start = await points.start({ game: 'mahjong', rules: 'chengdu', messageId });
    assert.equal(start.ok, true, JSON.stringify(start));
    const insert = h.db.api.insertRow;
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        return String(cells?.['载荷JSON']).includes('"kind":"check"') ? false : insert(...args);
    };
    assert.equal((await points.hand(start.roundId, { handId: 'equal', rules: 'chengdu', legs: [-8, 0, 0], raw: {} })).ok, false);
    assert.equal(points.read().rounds.get(start.roundId).checked, false);
    assert.equal(h.services.pointsSpendingGate().ok, false);
    h.db.api.insertRow = insert;
    const recovered = await points.retry();
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(recovered.settled, false);
    assert.equal(recovered.round.checked, true);
    assert.equal(h.services.pointsSpendingGate().ok, true);
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        return String(cells?.['载荷JSON']).includes('"kind":"settle"') ? false : insert(...args);
    };
    assert.equal((await points.settle(start.roundId)).ok, false);
    h.db.api.insertRow = insert;
    const closed = await points.retry();
    assert.equal(closed.ok, true, JSON.stringify(closed));
    assert.equal(closed.settled, true);
    assert.equal((await h.services.readSharedPoints()).balance, 0);
});

test('Origin经济：来源100、同楼150及滚动10楼300，消费不释放收入额度', async t => {
    const h = await sharedRuntime(t, 1000);
    const receive = async text => { const id = h.game.ai(text); await h.runtime.engine.whenSaved(); assert.equal(h.runtime.engine.isBlocked(), null); return id; };
    await receive('任务<origin>\n新任务|类型:主线|标题:甲|奖励:积分999\n新任务|类型:支线|标题:乙|奖励:积分100\n完成|1\n完成|2\n</origin>');
    assert.equal((await h.services.readSharedPoints()).origin, 150);
    assert.equal(h.runtime.engine.getState().tasks[0].approvedPoints, 100);
    assert.equal((await h.runtime.engine.dispatch({ type: 'buy', name: '凝神丹' })).ok, true);
    h.game.ctx.generateQuietPrompt = async () => '<origin>\n积分|+999|奖励\n</origin>';
    await h.runtime.engine.sysChat('领取奖励');
    assert.equal((await h.services.readSharedPoints()).origin, -50);
    await receive('后续<origin>\n新任务|类型:主线|标题:丙|奖励:积分100\n完成|3\n</origin>');
    await receive('后续<origin>\n新任务|类型:主线|标题:丁|奖励:积分100\n完成|4\n</origin>');
    assert.equal((await h.services.readSharedPoints()).origin, 100);
    await receive('窗口已满<origin>\n积分|+999|额外\n</origin>');
    assert.equal((await h.services.readSharedPoints()).origin, 100);
    for (let i = 0; i < 6; i += 1) await receive(`推进${i}`);
    await receive('第11楼<origin>\n新任务|类型:主线|标题:戊|奖励:积分100\n完成|5\n</origin>');
    assert.equal((await h.services.readSharedPoints()).origin, 200);
    const before = JSON.stringify(h.services.originStore().read().raw);
    assert.equal((await h.runtime.engine.recalcAll()).ok, true);
    await h.runtime.engine.reload();
    assert.equal((await h.services.readSharedPoints()).origin, 200);
    assert.equal(JSON.stringify(h.services.originStore().read().raw), before);
});

test('Origin经济：同名付费与免费道具分批本金返还，超本金及免费券受来源额度约束', async t => {
    const h = await sharedRuntime(t, 1000);
    h.game.ai('抽奖准备'); await h.runtime.engine.whenSaved();
    const dispatch = async op => { const result = await h.runtime.engine.dispatch(op); assert.equal(result.ok, true, JSON.stringify(result)); };
    await dispatch({ type: 'addShop', name: '返还符', price: 200, effect: '积分+400' });
    await dispatch({ type: 'buy', name: '返还符' });
    await dispatch({ type: 'addItem', name: '返还符', count: 2, effect: '积分+400' });
    assert.equal(h.runtime.engine.getState().bag.find(b => b.name === '返还符').lots.length, 2);
    await dispatch({ type: 'use', name: '返还符' });
    assert.equal((await h.services.readSharedPoints()).balance, 1100);
    await dispatch({ type: 'use', name: '返还符' });
    assert.equal((await h.services.readSharedPoints()).balance, 1150);
    await dispatch({ type: 'use', name: '返还符' });
    assert.equal((await h.services.readSharedPoints()).balance, 1150);
    const receipts = h.services.originStore().read().raw.ops.flatMap(op => op.economy?.receipts || []);
    assert.deepEqual(receipts.filter(r => r.refund > 0).map(r => r.refund), [200]);
    assert.equal(receipts.reduce((n, r) => n + r.income, 0), 150);
    await h.runtime.engine.reload();
    assert.equal((await h.services.readSharedPoints()).balance, 1150);
    assert.equal(h.runtime.engine.getState().bag.some(b => b.name === '返还符'), false);
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

test('Origin经济：原消费切换分支后不借同名免费道具返还本金，切回仅恢复原收支', async t => {
    const h = await sharedRuntime(t, 1000);
    const source = h.game.ai('付费来源'); await h.runtime.engine.whenSaved();
    const dispatch = async op => { const result = await h.runtime.engine.dispatch(op); assert.equal(result.ok, true, JSON.stringify(result)); };
    await dispatch({ type: 'addShop', name: '返还符', price: 200, effect: '积分+200' });
    await dispatch({ type: 'buy', name: '返还符' });
    h.game.ai('使用来源'); await h.runtime.engine.whenSaved();
    await dispatch({ type: 'addItem', name: '返还符', effect: '积分+200' });
    await dispatch({ type: 'use', name: '返还符' });
    assert.equal((await h.services.readSharedPoints()).balance, 1000);
    h.game.newSwipe(source, '没有购买'); await h.runtime.engine.whenSaved();
    assert.equal(h.runtime.engine.isBlocked(), null);
    assert.equal((await h.services.readSharedPoints()).balance, 1000);
    assert.equal(h.runtime.engine.getState().bag.find(item => item.name === '返还符')?.count, 1);
    h.game.selectSwipe(source, 0); await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).balance, 1000);
    const count = h.db.calls.insertRow;
    await h.runtime.engine.reload();
    assert.equal((await h.services.readSharedPoints()).balance, 1000);
    assert.equal(h.db.calls.insertRow, count);
});

test('Origin经济：没有有效AI楼时不回退旧规则发放或消费积分', async t => {
    const h = await sharedRuntime(t, 1000);
    assert.equal((await h.runtime.engine.dispatch({ type: 'addItem', name: '奖励符', effect: '积分+999' })).reason, 'origin-no-anchor');
    assert.equal((await h.runtime.engine.dispatch({ type: 'draw' })).reason, 'origin-no-anchor');
    assert.equal((await h.services.readSharedPoints()).balance, 1000);
    assert.equal(h.runtime.engine.getState().bag.length, 0);
});


test('Origin经济折叠：压缩正文后保留额度和已核准金额，旧楼删除及swipe仍回退积分', async t => {
    const h = await sharedRuntime(t, 1000, { keepFloors: 3 });
    const ids = [];
    for (let i = 1; i <= 14; i += 1) {
        ids.push(h.game.ai(`第${i}楼<origin>\n新任务|类型:主线|标题:任务${i}|奖励:积分100\n完成|${i}\n</origin>`));
        await h.runtime.engine.whenSaved();
        assert.equal(h.runtime.engine.isBlocked(), null);
    }
    const stored = h.services.originStore().read().raw;
    assert.ok(stored.base?.floor >= ids[10], '经济记录不能永久阻止正文折叠');
    assert.ok(stored.entries.length <= 13);
    assert.equal((await h.services.readSharedPoints()).origin, 600);
    h.game.newSwipe(ids[0], '另一条分支');
    await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).origin, 500);
    h.game.selectSwipe(ids[0], 0);
    await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).origin, 600);
    h.game.ctx.chat.splice(ids[1], 1);
    h.game.emit('msg_deleted', h.game.ctx.chat.length);
    await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).origin, 500);
    await h.runtime.engine.reload();
    assert.equal((await h.services.readSharedPoints()).origin, 500);
    h.game.ai('迟到的新奖励<origin>\n新任务|类型:主线|标题:新任务|奖励:积分100\n完成|15\n</origin>');
    await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).origin, 500, '幸存楼的已确认收入仍占窗口，不补发旧的限额差额');
});

test('Origin经济折叠：本金和同名道具来源跨底稿恢复，原消费失效后不返还或重复兑现', async t => {
    const h = await sharedRuntime(t, 1000, { keepFloors: 3 });
    const first = h.game.ai('付费来源');
    await h.runtime.engine.whenSaved();
    const dispatch = async op => {
        const result = await h.runtime.engine.dispatch(op);
        assert.equal(result.ok, true, JSON.stringify(result));
    };
    await dispatch({ type: 'addShop', name: '返还符', price: 200, effect: '积分+400' });
    await dispatch({ type: 'buy', name: '返还符' });
    for (let i = 0; i < 13; i += 1) {
        h.game.ai(`推进${i}`);
        await h.runtime.engine.whenSaved();
    }
    assert.ok(h.services.originStore().read().raw.base?.floor > first);
    await dispatch({ type: 'use', name: '返还符' });
    assert.equal((await h.services.readSharedPoints()).balance, 1100);
    await h.runtime.engine.reload();
    assert.equal((await h.services.readSharedPoints()).balance, 1100);
    h.game.newSwipe(first, '没有消费');
    await h.runtime.engine.whenSaved();
    assert.equal(h.runtime.engine.isBlocked(), null);
    assert.equal((await h.services.readSharedPoints()).balance, 1000);
    h.game.selectSwipe(first, 0);
    await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).balance, 1100);
    assert.equal(h.runtime.engine.getState().bag.some(item => item.name === '返还符'), false);
});

test('Origin经济折叠：连续两次压缩后旧来源仍可回退，重载与重试不重复兑现', async t => {
    const h = await sharedRuntime(t, 1000, { keepFloors: 3 });
    const first = h.game.ai('初始收入<origin>\n积分|+20|初始\n</origin>');
    await h.runtime.engine.whenSaved();
    for (let i = 0; i < 26; i += 1) {
        h.game.ai(`后续${i}<origin>\n积分|+10|推进\n</origin>`);
        await h.runtime.engine.whenSaved();
        assert.equal(h.runtime.engine.isBlocked(), null);
    }
    const raw = h.services.originStore().read().raw;
    assert.ok(raw.base.floor > 20);
    assert.equal(raw.version, 3);
    assert.ok(raw.policy.entries.every(entry => entry.block === null));
    assert.equal((await h.services.readSharedPoints()).origin, 280);
    h.game.newSwipe(first, '没有初始收入');
    await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).origin, 260);
    await h.runtime.engine.reload();
    assert.equal((await h.services.readSharedPoints()).origin, 260);
    h.game.selectSwipe(first, 0);
    await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).origin, 280);
    const writes = h.db.calls.insertRow;
    assert.equal((await h.runtime.engine.retrySave()).ok, true);
    assert.equal(h.db.calls.insertRow, writes);
    while (h.game.ctx.chat.length) {
        h.game.removeLast();
        await h.runtime.engine.whenSaved();
        assert.equal(h.runtime.engine.isBlocked(), null);
    }
    await h.runtime.engine.reload();
    assert.equal(h.runtime.engine.isBlocked(), null);
    assert.equal((await h.services.readSharedPoints()).origin, 0);
});


test('小游戏生产结算：排队前固定已有AI楼，追加消息不转挂，失效来源不发奖', async t => {
    const h = await sharedRuntime(t, 0);
    const first = h.game.ai('开局来源');
    await h.runtime.engine.whenSaved();
    let release;
    const held = h.services.withPointsLock(() => new Promise(resolve => { release = resolve; }));
    await new Promise(resolve => setImmediate(resolve));
    const points = h.services.points();
    const opening = points.start({ game: 'rps' });
    const rounds = h.services.gamePointsRounds('memory', first);
    const round = rounds();
    h.game.ai('追加的新楼');
    release(); await held;
    await h.runtime.engine.whenSaved();
    const opened = await opening;
    assert.equal(opened.ok, true, JSON.stringify(opened));
    assert.equal(opened.round.anchor.floorId, h.game.ctx.chat[first].extra.igs_points_uid);
    const settled = await round.finish({ win: true, levels: 5 });
    assert.equal(settled.ok, true, JSON.stringify(settled));
    assert.equal(settled.round.anchor.floorId, opened.round.anchor.floorId);
    assert.equal((await h.services.readSharedPoints()).games, 15);
    h.game.newSwipe(first, '不同分支');
    await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).games, 0);
    assert.equal((await rounds().finish({ win: true, levels: 5 })).ok, false);
    const missing = h.services.gamePointsRounds('rps', undefined)();
    assert.equal((await missing.finish({ win: true })).ok, false);
    assert.equal((await h.services.readSharedPoints()).games, 0);
});


test('小游戏生产结算：开局和领奖写失败仅恢复原局，并发重试不重复入账', async t => {
    for (const kind of ['start', 'award']) await t.test(kind, async t => {
        const h = await sharedRuntime(t, 0);
        const at = h.game.ai('失败恢复来源');
        await h.runtime.engine.whenSaved();
        const insert = h.db.api.insertRow;
        h.db.api.insertRow = (...args) => {
            const cells = typeof args[0] === 'object' ? args[0].data : args[1];
            return String(cells?.['载荷JSON']).includes(`"kind":"${kind}"`) ? false : insert(...args);
        };
        const round = h.services.gamePointsRounds('rps', at)();
        const failed = await round.finish({ win: true });
        assert.equal(failed.ok, false);
        assert.equal((await h.services.readSharedPoints()).games, 0);
        const intent = h.services.points().pending().record;
        assert.equal(intent.payload.kind, kind);
        h.db.api.insertRow = insert;
        const results = await Promise.all([round.retry(), round.retry()]);
        assert.ok(results.every(result => result.ok), JSON.stringify(results));
        assert.ok(results.every(result => result.roundId === intent.payload.sourceId));
        assert.equal((await h.services.readSharedPoints()).games, 2);
        const stored = h.services.points().read();
        assert.equal(stored.rounds.size, 1);
        assert.equal(stored.rounds.get(intent.payload.sourceId).settled, true);
        assert.equal(h.services.points().pending().record, null);
        const writes = h.db.calls.insertRow;
        assert.equal((await round.finish({ win: true })).amount, 2);
        assert.equal((await round.retry()).amount, 2);
        assert.equal((await round.finish({ win: false })).reason, 'points-result-conflict');
        assert.equal(h.db.calls.insertRow, writes);
    });
});


test('成都积分源头：真实四局逐笔收付守恒，原牌分不变且不以指数分当番数', async () => {
    const { createScmjController } = await import('../src/visual/igs-ui/scmj/controller.js');
    const { greedyDecide } = await import('../scripts/scmj-players.mjs');
    const { scmjPointsHand } = await import('../src/visual/igs-ui/scmj/points-settlement.js');
    const controller = createScmjController({ seed: 1, strict: true });
    const result = controller.play(greedyDecide);
    const hands = result.trace.flatMap(step => step.messages.filter(msg => msg.event === 'game_over_push' && msg.userId === 1001).map(msg => msg.data));
    assert.deepEqual(hands.map(data => data.results.map(row => row.score)), [[1, 1, 1, -3], [-1, -1, 2, 0], [0, -6, 6, 0], [1, -2, -3, 4]]);
    assert.deepEqual(hands.map(data => scmjPointsHand(data).hand.legs), [[0, 0, 0], [0, 0, 0], [0, 0, 1], [0, 0, 0]]);
    for (const data of hands) {
        for (let self = 0; self < 4; self += 1) assert.equal(scmjPointsHand(data, self).ok, true);
        assert.equal(data.results.reduce((sum, row) => sum + row.score, 0), 0);
    }
    const broken = structuredClone(hands[0]); broken.points.transfers.pop();
    assert.equal(scmjPointsHand(broken).reason, 'points-mahjong-evidence-invalid');
    assert.equal(scmjPointsHand({ results: hands[0].results }).ok, false);
});

test('成都积分适配：逐家先净额再封顶，多响与杠不重置单局上限', async () => {
    const { scmjPointsHand } = await import('../src/visual/igs-ui/scmj/points-settlement.js');
    const transfers = [
        { from: 1, to: 0, type: 'hu', fan: 18, score: 16 },
        { from: 1, to: 0, type: 'angang', fan: 2, score: 2 },
        { from: 1, to: 0, type: 'wangang', fan: 1, score: 1 },
        { from: 0, to: 1, type: 'hu', fan: 4, score: 16 },
        { from: 2, to: 0, type: 'hu', fan: 24, score: 16 },
        { from: 0, to: 3, type: 'chadajiao', fan: 23, score: 16 },
    ];
    const scores = [0, 0, 0, 0];
    for (const t of transfers) { scores[t.from] -= t.score; scores[t.to] += t.score; }
    const result = scmjPointsHand({ points: { version: 1, rules: 'chengdu', hand: 2, transfers }, results: scores.map(score => ({ score })) });
    assert.equal(result.ok, true);
    assert.deepEqual(result.hand.legs, [17, 24, -23]);
    assert.deepEqual(result.hand.raw.deltas, [170, 200, -200]);
    assert.equal(result.hand.raw.amount, 170);
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

test('成都牌桌结算：失败保持原桌与原意图，恢复后一次结清且不重复扣款', async t => {
    for (const kind of ['start', 'hand', 'check', 'close', 'settle']) await t.test(kind, async t => {
        const h = await sharedRuntime(t, 80);
        const messageId = h.game.ai('成都牌桌'); await h.runtime.engine.whenSaved();
        const table = await mahjongSessionHarness(h, messageId);
        const insert = h.db.api.insertRow;
        h.db.api.insertRow = (...args) => {
            const cells = typeof args[0] === 'object' ? args[0].data : args[1];
            return String(cells?.['载荷JSON']).includes(`"kind":"${kind}"`) ? false : insert(...args);
        };
        let result = await table.session.sync();
        if (kind !== 'start') {
            assert.equal(result.ok, true, JSON.stringify(result));
            table.hands.push(chengduEvidence(0, kind === 'check' ? [-1, 0, 0] : [-20, -20, -20]));
            result = await table.session.sync();
        }
        assert.equal(result.ok, false, JSON.stringify(result));
        assert.equal(table.session.allowed(), false);
        const identity = table.snapshot.points;
        assert.equal(h.services.points().pending().record.payload.sourceId, identity.roundId);
        assert.equal((await h.services.readSharedPoints()).games, 0);
        h.db.api.insertRow = insert;
        const restored = await mahjongSessionHarness(h, messageId, table.snapshot, table.hands);
        const recovered = await restored.session.retry();
        assert.equal(recovered.ok, true, JSON.stringify(recovered));
        assert.equal(recovered.roundId, identity.roundId);
        if (kind !== 'start' && kind !== 'check') {
            assert.equal(recovered.settled, true);
            assert.equal((await h.services.readSharedPoints()).balance, -520);
        }
        const writes = h.db.calls.insertRow;
        assert.equal((await restored.session.retry()).ok, true);
        assert.equal(h.db.calls.insertRow, writes);
        assert.equal(h.services.points().read().rounds.size, 1);
        assert.equal(h.services.points().pending().record, null);
    });
});


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

test('成都牌桌界面：局末确认后才能继续，收起重接与刷新续原桌，主动退桌只结一次', async t => {
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('成都界面'); await h.runtime.engine.whenSaved();
    const ui = await scmjUiHarness(t, h, at);
    const first = await scmjToBoundary(ui.match);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(ui.board.querySelector('.igs-scmj-next').disabled, false);
    const identity = ui.match.points.state.identity;
    ui.board.querySelector('.igs-ws-close').click();
    assert.equal(ui.closed, 1);
    assert.equal(ui.match.canPlay(), false);
    const board2 = ui.doc.createElement('div'); ui.doc.body.appendChild(board2);
    ui.match.reattach({ ...ui.ctx, board: board2, isSettled: () => false }, h.services.mahjongPointsRounds(at));
    assert.equal((await ui.match.points.retry()).ok, true);
    assert.equal(ui.match.points.state.identity.roundId, identity.roundId);
    board2.querySelector('.igs-scmj-next').click();
    const second = await scmjToBoundary(ui.match);
    assert.equal(second.ok, true, JSON.stringify(second));
    const saved = JSON.parse(h.storage.getItem('igs-wait-mahjong-scmj-v1'));
    const restored = await scmjUiHarness(t, h, at, saved);
    assert.equal(restored.match.points.state.identity.roundId, identity.roundId);
    const expected = restored.match.points.state.result.amount;
    const ended = await restored.match.points.exit();
    assert.equal(ended.ok, true, JSON.stringify(ended));
    assert.equal(restored.closed, 1);
    assert.equal((await h.services.readSharedPoints()).games, expected);
    const writes = h.db.calls.insertRow;
    assert.equal((await restored.match.points.retry()).ok, true);
    assert.equal(h.db.calls.insertRow, writes);
});


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

test('成都积分源头分支：自摸、多响、三类杠、查叫退杠和呼叫转移沿原付款对象记录', async () => {
    const tsumo = await settleScmjBranches(seats => { seats[0].actions = [{ type: 'zimo', iszimo: true, targets: [1, 2, 3] }]; });
    assert.deepEqual(tsumo.hand.legs, [2, 2, 2]);
    assert.deepEqual(tsumo.data.results.map(s => s.score), [15, -5, -5, -5]);
    const multi = await settleScmjBranches(seats => {
        seats[1].actions = [{ type: 'hu', iszimo: false, targets: [0] }];
        seats[2].actions = [{ type: 'hu', iszimo: false, targets: [0] }];
    });
    assert.deepEqual(multi.hand.legs, [-2, -2, 0]);
    for (const [type, fan] of [['angang', 2], ['diangang', 2], ['wangang', 1]]) {
        const gang = await settleScmjBranches(seats => { seats[0].actions = [{ type, score: fan, targets: [1, 2, 3] }]; });
        assert.deepEqual(gang.hand.legs, [fan, fan, fan]);
        assert.ok(gang.data.points.transfers.every(t => t.type === type));
    }

    const draw = await settleScmjBranches(seats => {
        seats[0].hued = false; seats[0].tingMap = {};
        seats[0].actions = [{ type: 'wangang', score: 1, targets: [1, 2, 3] }];
        seats[1].hued = false;
    });
    assert.deepEqual(draw.hand.legs, [-2, 0, 0]);
    assert.deepEqual(draw.data.points.transfers.map(t => t.type), ['chadajiao']);
    assert.equal(draw.seats[0].actions.some(a => a.type === 'wangang'), false);
    const lateGang = await settleScmjBranches(seats => {
        seats[0].hued = false; seats[0].tingMap = {};
        seats[0].actions = [{ type: 'diangang', score: 2, targets: [1] }];
    });
    assert.deepEqual(lateGang.hand.legs, [2, 0, 0]);
    const moved = await settleScmjBranches(seats => {
        const ref = { type: 'wangang', score: 1, targets: [1, 2], state: 'nop', payTimes: 0 };
        seats[3].actions = [ref];
        seats[0].actions = [{ type: 'maozhuanyu', owner: seats[3], ref }];
        seats[1].actions = [{ type: 'maozhuanyu', owner: seats[3], ref }];
    });
    assert.deepEqual(moved.hand.legs, [1, 1, 0]);
    assert.deepEqual(moved.data.points.transfers, [
        { from: 1, to: 0, type: 'maozhuanyu', fan: 1, score: 1 },
        { from: 2, to: 0, type: 'maozhuanyu', fan: 1, score: 1 },
        { from: 3, to: 1, type: 'maozhuanyu', fan: 2, score: 2 },
    ]);
});


test('成都牌桌边界：亏损等于余额可继续，按最新余额超额才完整扣为负数', async t => {
    const h = await sharedRuntime(t, 80);
    const at = h.game.ai('余额边界'); await h.runtime.engine.whenSaved();
    const table = await mahjongSessionHarness(h, at);
    assert.equal((await table.session.sync()).ok, true);
    table.hands.push(chengduEvidence(0, [-8, 0, 0]));
    assert.equal(table.session.allowed(), false);
    const equal = await table.session.sync();
    assert.equal(equal.ok, true, JSON.stringify(equal));
    assert.equal(equal.settled, false);
    assert.equal(table.session.allowed(), true);
    h.holder.money = 70;
    table.hands.push(chengduEvidence(1, [0, 0, 0]));
    const forced = await table.session.sync();
    assert.equal(forced.ok, true, JSON.stringify(forced));
    assert.equal(forced.settled, true);
    assert.equal(forced.round.closeReason, 'insufficient');
    assert.equal(table.session.allowed(), false);
    assert.equal((await h.services.readSharedPoints()).balance, -10);
});

test('成都牌桌兼容：旧档不建积分债务，存档失败不写库，恢复绑定原楼而非最新楼', async t => {
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('原桌来源'); await h.runtime.engine.whenSaved();
    const old = await mahjongSessionHarness(h, at, { version: 1 }, [chengduEvidence(0, [-20, -20, -20])]);
    const writes = h.db.calls.insertRow;
    assert.equal((await old.session.sync()).skipped, true);
    assert.equal(old.session.allowed(), true);
    assert.equal(h.db.calls.insertRow, writes);
    const table = await mahjongSessionHarness(h, at);
    table.writable(false);
    assert.equal((await table.session.sync()).reason, 'points-table-save-failed');
    assert.equal(h.db.calls.insertRow, writes);
    table.writable(true);
    assert.equal((await table.session.retry()).ok, true);
    const saved = table.snapshot;
    h.game.ai('追加新楼'); await h.runtime.engine.whenSaved();
    const resumed = await mahjongSessionHarness(h, h.game.ctx.chat.length - 1, saved, [chengduEvidence(0, [-1, 0, 0])]);
    assert.equal((await resumed.session.sync()).ok, true);
    assert.equal((await resumed.session.exit()).amount, -10);
    assert.deepEqual(h.services.points().read().rounds.get(saved.points.roundId).anchor, saved.points.anchor);
    h.game.newSwipe(at, '新分支'); await h.runtime.engine.whenSaved();
    assert.equal((await h.services.readSharedPoints()).games, 0);
    assert.equal((await resumed.session.retry()).inactive, true);
});


test('成都牌桌界面：局末写失败禁止继续，重试确认与退桌均只结算原桌', async t => {
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('牌桌写入门禁'); await h.runtime.engine.whenSaved();
    const ui = await scmjUiHarness(t, h, at);
    const insert = h.db.api.insertRow;
    let blockedKind = 'hand';
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        return String(cells?.['载荷JSON']).includes(`"kind":"${blockedKind}"`) ? false : insert(...args);
    };
    const failed = await scmjToBoundary(ui.match);
    assert.equal(failed.ok, false);
    assert.equal(ui.board.querySelector('.igs-scmj-next').disabled, true);
    assert.equal(ui.match.canPlay(), false);
    const decisions = ui.match.decisions.length;
    ui.match.continueHand();
    assert.equal(ui.match.decisions.length, decisions);
    assert.equal(ui.match.phase(), 'result');
    assert.ok(ui.board.querySelector('.igs-scmj-retry'));
    assert.equal((await h.services.readSharedPoints()).games, 0);
    const identity = ui.match.points.state.identity;
    blockedKind = '';
    assert.equal((await ui.match.points.retry()).ok, true);
    assert.equal(ui.board.querySelector('.igs-scmj-next').disabled, false);
    blockedKind = 'settle';
    assert.equal((await ui.match.points.exit()).ok, false);
    assert.equal(ui.closed, 0);
    assert.equal(ui.match.canPlay(), false);
    assert.equal(h.services.points().pending().record.payload.kind, 'settle');
    blockedKind = '';
    const ended = await ui.match.points.retry();
    assert.equal(ended.ok, true, JSON.stringify(ended));
    assert.equal(ended.roundId, identity.roundId);
    assert.equal(ui.closed, 1);
    const writes = h.db.calls.insertRow;
    assert.equal((await ui.match.points.retry()).ok, true);
    assert.equal(h.db.calls.insertRow, writes);
    assert.equal(h.services.points().read().rounds.size, 1);
});


test('成都牌桌界面：局末超额亏损写失败保留义务，确认后强制退出并保留负余额', async t => {
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('强制退桌'); await h.runtime.engine.whenSaved();
    const ui = await scmjUiHarness(t, h, at);
    const insert = h.db.api.insertRow;
    let reject = true;
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        return reject && String(cells?.['载荷JSON']).includes('"kind":"settle"') ? false : insert(...args);
    };
    const { greedyDecide } = await import('../scripts/scmj-players.mjs');
    let result, total = 0;
    for (let hand = 0; hand < 4; hand += 1) {
        for (let guard = 0; !['result', 'final'].includes(ui.match.phase()); guard += 1) {
            assert.ok(guard < 500);
            ui.match.answer(greedyDecide(ui.match.view()));
        }
        const { scmjPointsHand } = await import('../src/visual/igs-ui/scmj/points-settlement.js');
        const events = ui.match.controller.trace.flatMap(step => step.messages.filter(msg => msg.event === 'game_over_push' && msg.userId === 1001));
        total = events.reduce((sum, msg) => sum + scmjPointsHand(msg.data).hand.raw.amount, 0);
        if (total < 0) h.holder.money = -total - 1;
        result = await ui.match.points.retry();
        if (total < 0 || ui.match.phase() === 'final') break;
        ui.match.continueHand();
    }
    assert.ok(total < 0, `固定牌局应产生累计亏损，实际 ${total}`);
    assert.equal(result.ok, false);
    assert.equal(ui.closed, 0);
    assert.equal(ui.match.canPlay(), false);
    assert.equal(h.services.points().pending().record.payload.kind, 'settle');
    assert.equal((await h.services.readSharedPoints()).games, 0);
    reject = false;
    const confirmed = await ui.match.points.retry();
    assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
    assert.equal(confirmed.round.closeReason, 'insufficient');
    assert.equal(ui.closed, 1);
    assert.equal(ui.match.generation, -1);
    assert.equal((await h.services.readSharedPoints()).balance, -1);
    const writes = h.db.calls.insertRow;
    assert.equal((await ui.match.points.retry()).ok, true);
    assert.equal(ui.closed, 1);
    assert.equal(h.db.calls.insertRow, writes);
});

test('成都牌桌界面：共享积分不足开桌被拒时显示原因，可直接离桌且不写账', async t => {
    const h = await sharedRuntime(t, 0);
    const at = h.game.ai('积分不足开桌'); await h.runtime.engine.whenSaved();
    const ui = await scmjUiHarness(t, h, at);
    assert.equal(ui.match.points.state.error, 'points-insufficient');
    assert.equal(ui.match.points.unopened(), true);
    assert.equal(ui.match.canPlay(), false);
    assert.match(ui.board.textContent, /共享积分不足，无法开桌/);
    const end = [...ui.board.querySelectorAll('button')]
        .find(node => /结束这局|结算并退出/.test(`${node.getAttribute('aria-label') || ''}${node.title || ''}`));
    assert.ok(end, '牌桌必须有离桌按钮');
    assert.equal(end.disabled, false);
    end.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(ui.closed, 1);
    assert.equal(h.services.points().read().rounds.size, 0);
    assert.equal(h.services.points().pending().record, null);
    assert.equal((await h.services.readSharedPoints()).balance, 0);
});



test('成都牌桌界面：出牌存档失败立即停局，重试保存后才恢复原桌', async t => {
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('出牌存档'); await h.runtime.engine.whenSaved();
    const ui = await scmjUiHarness(t, h, at);
    const { greedyDecide } = await import('../scripts/scmj-players.mjs');
    const write = h.storage.setItem;
    h.storage.setItem = (key, value) => {
        if (key === 'igs-wait-mahjong-scmj-v1') throw new Error('存档失败');
        return write(key, value);
    };
    ui.match.answer(greedyDecide(ui.match.view()));
    assert.equal(ui.match.points.state.error, 'points-table-save-failed');
    assert.equal(ui.match.canPlay(), false);
    const decisions = ui.match.decisions.length;
    ui.match.answer(greedyDecide(ui.match.view()));
    assert.equal(ui.match.decisions.length, decisions);
    assert.ok(ui.board.querySelector('.igs-scmj-retry'));
    h.storage.setItem = write;
    assert.equal((await ui.match.points.retry()).ok, true);
    assert.equal(ui.match.canPlay(), true);
    assert.equal(JSON.parse(h.storage.getItem('igs-wait-mahjong-scmj-v1')).decisions.length, decisions);
});


test('成都牌桌凭据：终局缺少逐笔依据时停局且不漏记为零收入', async t => {
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('终局凭据'); await h.runtime.engine.whenSaved();
    const ui = await scmjUiHarness(t, h, at);
    assert.equal((await scmjToBoundary(ui.match)).ok, true);
    const event = ui.match.controller.trace.flatMap(step => step.messages)
        .find(msg => msg.event === 'game_over_push' && msg.userId === 1001);
    delete event.data.points;
    const writes = h.db.calls.insertRow;
    const result = await ui.match.points.retry();
    assert.equal(result.reason, 'points-mahjong-evidence-invalid');
    assert.equal(ui.match.canPlay(), false);
    assert.equal(ui.board.querySelector('.igs-scmj-next').disabled, true);
    assert.equal((await h.services.readSharedPoints()).games, 0);
    assert.equal(h.db.calls.insertRow, writes);
});

test('成都积分入口：等待层内置牌桌使用私有工厂，收起重开仍绑定同一桌', async t => {
    const { JSDOM } = await import('jsdom');
    const { createWaitStageRuntime, buildWaitStageModel } = await import('../src/visual/igs-ui/wait-stage-runtime.js');
    const { installWaitStageGames, uninstallWaitStageGames } = await import('../src/plugins/wait-stage-games-entry.js');
    const { scmjLiveMatch, forgetScmjTable } = await import('../src/visual/igs-ui/wait-stage-scmj.js');
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('等待层牌桌'); await h.runtime.engine.whenSaved();
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://igs.test/' });
    const doc = dom.window.document, root = {};
    installWaitStageGames(root);
    const storage = dom.window.localStorage;
    storage.setItem('igs-wait-mahjong-mode-v1', 'scmj');
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    let requested;
    const runtime = createWaitStageRuntime({ doc, getPointsMessageId: () => at,
        mahjongPointsRounds(messageId) { requested = messageId; return h.services.mahjongPointsRounds(messageId); },
        timers: { setTimeout: () => 1, clearTimeout() {} } });
    t.after(() => { runtime.dispose(); forgetScmjTable(); uninstallWaitStageGames(root); dom.window.close();
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
    const layer = runtime.open(doc.body, { play: true, model: buildWaitStageModel({ sceneAssets: {} }), settings: { games: true } });
    layer.querySelector('[data-game="mahjong"]').click();
    layer.querySelector('.igs-mj-go').click();
    const match = scmjLiveMatch();
    assert.ok(match);
    assert.equal(requested, at);
    assert.equal((await match.points.retry()).ok, true);
    const identity = match.points.state.identity;
    assert.deepEqual(identity.anchor, { floorId: h.game.ctx.chat[at].extra.igs_points_uid, swipeId: 0 });
    layer.querySelector('.igs-ws-close').click();
    assert.equal(match.canPlay(), false);
    layer.querySelector('[data-game="mahjong"]').click();
    assert.equal(scmjLiveMatch(), match);
    assert.equal((await match.points.retry()).ok, true);
    assert.equal(match.points.state.identity.roundId, identity.roundId);
    assert.equal(h.services.points().read().rounds.size, 1);
});


test('成都牌桌来源失效：先恢复原待写意图再退出，swipe与删楼后新分支可开桌', async t => {
    for (const change of ['swipe', 'delete']) await t.test(change, async t => {
        const h = await sharedRuntime(t, 500);
        const at = h.game.ai('旧桌来源'); await h.runtime.engine.whenSaved();
        const ui = await scmjUiHarness(t, h, at);
        const insert = h.db.api.insertRow;
        let reject = true;
        h.db.api.insertRow = (...args) => {
            const cells = typeof args[0] === 'object' ? args[0].data : args[1];
            return reject && String(cells?.['载荷JSON']).includes('"kind":"hand"') ? false : insert(...args);
        };
        assert.equal((await scmjToBoundary(ui.match)).ok, false);
        const intent = h.services.points().pending().record;
        const roundId = ui.match.points.state.identity.roundId;
        assert.equal(intent.payload.sourceId, roundId);
        if (change === 'swipe') h.game.newSwipe(at, '新的分支');
        else h.game.ctx.chat.splice(at, 1);
        await h.runtime.engine.whenSaved();
        const result = await ui.match.points.retry();
        assert.equal(result.inactive, true, JSON.stringify(result));
        assert.equal(ui.closed, 1);
        assert.equal(ui.match.generation, -1);
        assert.equal(h.services.points().pending().record, null);
        assert.equal((await h.services.readSharedPoints()).games, 0);
        reject = false;
        const next = h.game.ai('新桌来源'); await h.runtime.engine.whenSaved();
        const fresh = await h.services.mahjongPointsRounds(next)();
        const opened = await fresh.ready();
        assert.equal(opened.ok, true, JSON.stringify(opened));
        assert.notEqual(opened.roundId, roundId);
        assert.equal(ui.closed, 1);
    });
});

test('成都积分入口：立直各重入路径换对手后保留私有工厂', async t => {
    const { JSDOM } = await import('jsdom');
    const { startMahjong, forgetMahjongTable } = await import('../src/visual/igs-ui/wait-stage-mahjong.js');
    const { scmjLiveMatch, forgetScmjTable } = await import('../src/visual/igs-ui/wait-stage-scmj.js');
    for (const path of ['direct', 'picker', 'restore', 'again', 'reattach']) await t.test(path, async t => {
        t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
        const h = await sharedRuntime(t, 500);
        let at = h.game.ai('立直入口'); await h.runtime.engine.whenSaved();
        const dom = new JSDOM('<!doctype html><body><div id="board"></div></body>', { url: 'https://igs.test/' });
        const doc = dom.window.document;
        let ctx = { doc, board: doc.getElementById('board'), model: {}, storage: h.storage,
            setNote() {}, onVoice() {}, loadImage: () => '', isSettled: () => false, requestClose() {} };
        const games = [];
        t.after(() => {
            for (const game of games) game.stop();
            forgetMahjongTable(); forgetScmjTable(); dom.window.close();
        });
        const click = text => {
            const node = [...ctx.board.querySelectorAll('button')].find(button => button.textContent === text);
            assert.ok(node, text); assert.equal(node.disabled, false, text); node.click();
        };
        const prime = async game => {
            const dispatch = game.call_players.bind(game);
            game.call_players = (...args) => {
                const sync = game._sync;
                game._sync = true;
                try { return dispatch(...args); } finally { game._sync = sync; }
            };
            const result = await globalThis.__IGS_MAHJONG_MATCH__.points.retry();
            assert.equal(result.ok, true, JSON.stringify(result));
        };
        const summary = async game => {
            game.qipai();
            game.pingju('九種九牌');
            const points = globalThis.__IGS_MAHJONG_MATCH__.points;
            assert.equal((await points.retry()).ok, true);
            game.jieju();
            const result = await points.retry();
            assert.equal(result.ok, true, JSON.stringify(result));
            assert.equal(result.settled, true);
        };
        h.storage.setItem('igs-wait-mahjong-mode-v1', path === 'picker' ? 'scmj' : 'riichi');
        let game = startMahjong(ctx, h.services.mahjongPointsRounds(at));
        if (path === 'picker') {
            assert.equal(game, null);
            click('立直麻将'); ctx.board.querySelector('.igs-mj-go').click();
            game = globalThis.__IGS_MAHJONG_MATCH__?.game;
        }
        assert.ok(game); games.push(game);
        await prime(game);
        if (path === 'restore' || path === 'reattach') {
            ctx.board.querySelector('.igs-ws-close').click();
            assert.ok(JSON.parse(h.storage.getItem('igs-wait-mahjong-v1')).game);
            const previous = game;
            if (path === 'restore') forgetMahjongTable();
            else {
                at = h.game.ai('重接后的来源'); await h.runtime.engine.whenSaved();
                const board = doc.createElement('div'); doc.body.appendChild(board);
                ctx = { ...ctx, board };
            }
            game = startMahjong(ctx, h.services.mahjongPointsRounds(at));
            if (path === 'restore') { assert.notEqual(game, previous); games.push(game); }
            else assert.equal(game, previous);
            if (path === 'restore') await prime(game);
            else assert.equal((await globalThis.__IGS_MAHJONG_MATCH__.points.retry()).ok, true);
        }
        if (path === 'again') {
            await summary(game); click('再来一局');
            const previous = game;
            game = globalThis.__IGS_MAHJONG_MATCH__?.game;
            assert.ok(game); assert.notEqual(game, previous); games.push(game);
            await prime(game);
        }
        const roundsBefore = h.services.points().read().rounds.size;
        assert.ok(roundsBefore > 0, '立直开桌已保存共享积分身份');
        ctx.model = { names: ['甲', '乙', '丙'] };
        await summary(game); click('换对手');
        click('成都麻将');
        for (const person of ctx.board.querySelectorAll('.igs-mj-person:not(.is-on)')) person.click();
        click('开始这局');
        const match = scmjLiveMatch();
        assert.ok(match);
        const result = await match.points.retry();
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.deepEqual(match.points.state.identity.anchor,
            { floorId: h.game.ctx.chat[at].extra.igs_points_uid, swipeId: 0 });
        assert.equal(h.services.points().read().rounds.size, roundsBefore + 1);
        assert.equal((await h.services.readSharedPoints()).games, 0);
        assert.equal(ctx.mahjongPointsRounds, undefined);
        assert.equal(ctx.pointsRounds, undefined);
    });
});

function riichiEvidence(hand, win, jushu = 0, qijia = 0) {
    return { version: 1, rules: 'riichi', hand, self: 0, qijia, qipai: { jushu }, results: [win
        ? { hule: win } : { pingju: { name: '九種九牌', fenpei: [0, 0, 0, 0] } }] };
}

test('立直积分番数：每把净得失封顶200，座位轮转与役满使用引擎依据', async () => {
    const { riichiPointsHand, riichiPointsEvidence } = await import('../src/visual/igs-ui/riichi-points-settlement.js');
    const { mahjongHandAmount } = await import('../src/scene/points/points-policy.js');
    const value = (win, jushu = 0, qijia = 0) => {
        const result = riichiPointsHand(riichiEvidence(0, win, jushu, qijia));
        assert.equal(result.ok, true, JSON.stringify(result));
        return mahjongHandAmount(result.hand);
    };
    const ron = { l: 0, baojia: 1, fanshu: 3, defen: 5800, fenpei: [5800, -5800, 0, 0] };
    assert.equal(value(ron), 30);
    assert.equal(value({ ...ron, fanshu: 19 }), 190);
    assert.equal(value({ ...ron, fanshu: 20 }), 200);
    assert.equal(value({ ...ron, fanshu: 40 }), 200);
    assert.equal(value({ ...ron, fanshu: 40 }, 3), -200);
    assert.equal(value(ron, 1), 0, '旁观荣和不收支');
    assert.equal(value(ron, 0, 3), -30, '按该局门风映射，不缓存上一局座位');
    const tsumo = { ...ron, baojia: null, fanshu: 8, fenpei: [24000, -8000, -8000, -8000] };
    assert.equal(value(tsumo), 80, '三家付款不把玩家整把收入乘三');
    assert.equal(value(tsumo, 2), -80);
    assert.equal(value({ ...ron, fenpei: [12800, -6800, 0, 0] }), 30, '供托与场棒不换算成番数');
    const Majiang = (await import('@kobalab/majiang-core')).default;
    const yakuman = Majiang.Util.hule(Majiang.Shoupai.fromString('z11122233344455'), null,
        Majiang.Util.hule_param({ rule: Majiang.rule(), zhuangfeng: 0, menfeng: 0 }));
    assert.ok(yakuman.damanguan > 0);
    assert.equal(yakuman.fanshu, undefined);
    assert.equal(value({ ...yakuman, l: 0, baojia: null }), 200);
    assert.equal(value({ ...yakuman, l: 0, baojia: null }, 1), -200);
    assert.equal(value({ ...ron, damanguan: 3, fanshu: undefined }), 200);
    const pao = { l: 1, baojia: 2, damanguan: 1, fenpei: [-16000, 32000, -16000, 0] };
    assert.equal(value(pao), -200, '责任付款只决定付款身份，不从牌分猜番数');
    for (const name of ['荒牌平局', '流し満貫', '九種九牌']) {
        const data = riichiEvidence(2); data.results[0].pingju = { name, fenpei: [3000, -1000, -1000, -1000] };
        assert.equal(riichiPointsHand(data).hand.fan, 0);
    }
    assert.equal(riichiPointsHand(riichiEvidence(0, { ...ron, fanshu: undefined })).ok, false);
    assert.equal(riichiPointsHand({ ...riichiEvidence(0, ron), results: [{ hule: ron }, { hule: ron }] }).ok, false);
    const paipu = { qijia: 0, log: [[{ qipai: { jushu: 0 } }, { hule: ron }], [{ qipai: { jushu: 1 } }]] };
    assert.deepEqual(riichiPointsEvidence(paipu).map(data => riichiPointsHand(data).hand.handId), ['riichi:0']);
});


test('立直积分恢复：五阶段写库失败沿原意图恢复，亏损封顶后允许负余额', async t => {
    for (const kind of ['start', 'hand', 'check', 'close', 'settle']) await t.test(kind, async t => {
        const h = await sharedRuntime(t, 80);
        const at = h.game.ai('立直失败恢复'); await h.runtime.engine.whenSaved();
        const table = await mahjongSessionHarness(h, at, undefined, [], 'riichi');
        const insert = h.db.api.insertRow;
        h.db.api.insertRow = (...args) => {
            const cells = typeof args[0] === 'object' ? args[0].data : args[1];
            return String(cells?.['载荷JSON']).includes(`"kind":"${kind}"`) ? false : insert(...args);
        };
        let result = await table.session.sync();
        if (kind !== 'start') {
            assert.equal(result.ok, true, JSON.stringify(result));
            table.hands.push(riichiEvidence(0, { l: 1, baojia: 0, fanshu: kind === 'check' ? 3 : 40,
                fenpei: [-8000, 8000, 0, 0] }));
            result = await table.session.sync();
        }
        assert.equal(result.ok, false, JSON.stringify(result));
        assert.equal(table.session.allowed(), false);
        const identity = table.snapshot.points;
        assert.equal(identity.rules, 'riichi');
        assert.equal(h.services.points().pending().record.payload.sourceId, identity.roundId);
        assert.equal((await h.services.readSharedPoints()).games, 0);
        h.db.api.insertRow = insert;
        const restored = await mahjongSessionHarness(h, at, table.snapshot, table.hands, 'riichi');
        const recovered = await restored.session.retry();
        assert.equal(recovered.ok, true, JSON.stringify(recovered));
        assert.equal(recovered.roundId, identity.roundId);
        if (!['start', 'check'].includes(kind)) {
            assert.equal(recovered.settled, true);
            assert.equal(recovered.amount, -200);
            assert.equal((await h.services.readSharedPoints()).balance, -120);
        }
        const writes = h.db.calls.insertRow;
        assert.equal((await restored.session.retry()).ok, true);
        assert.equal(h.db.calls.insertRow, writes);
        assert.equal(h.services.points().read().rounds.size, 1);
        assert.equal(h.services.points().pending().record, null);
    });
});


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


test('立直牌桌确认：开桌与局末失败停局，收起恢复原桌后只结算一次', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('立直牌桌确认'); await h.runtime.engine.whenSaved();
    const insert = h.db.api.insertRow;
    let rejected = 'start';
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        return rejected && String(cells?.['载荷JSON']).includes(`"kind":"${rejected}"`) ? false : insert(...args);
    };
    const ui = await riichiUiHarness(t, h, at);
    assert.equal(ui.confirmed.ok, false);
    assert.equal(ui.match.canPlay(), false);
    assert.equal(Boolean(ui.game._paipu), false, '开桌未确认时不发牌');
    const identity = ui.match.points.state.identity;
    rejected = '';
    assert.equal((await ui.match.points.retry()).ok, true);
    assert.ok(ui.game._paipu);
    rejected = 'hand';
    const failed = await riichiUiWin(ui);
    assert.equal(failed.ok, false);
    assert.equal(ui.match.canPlay(), false);
    const next = [...ui.board.querySelectorAll('button')].find(node => node.textContent === '继续');
    assert.ok(next); assert.equal(next.disabled, true);
    next.click();
    assert.equal(ui.game._reply[0], undefined);
    assert.equal((await h.services.readSharedPoints()).games, 0);
    assert.equal(h.services.points().pending().record.payload.sourceId, identity.roundId);
    rejected = '';
    const confirmed = await ui.match.points.retry();
    assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
    assert.equal(confirmed.amount, 200);
    assert.equal(next.disabled, false);
    ui.board.querySelector('.igs-ws-close').click();
    assert.equal(ui.closed, 1);
    assert.equal(ui.match.canPlay(), false);
    const restored = await riichiUiHarness(t, h, at, { saved: ui.snapshot() });
    assert.equal(restored.confirmed.ok, true, JSON.stringify(restored.confirmed));
    assert.deepEqual(restored.match.points.state.identity, identity);
    assert.equal(restored.confirmed.round.hands.length, 1);
    assert.equal((await h.services.readSharedPoints()).games, 0);
    restored.click('结算并退出');
    assert.equal((await restored.match.points.retry()).ok, true);
    await new Promise(setImmediate);
    assert.equal(restored.closed, 1);
    assert.equal((await h.services.readSharedPoints()).games, 200);
    const writes = h.db.calls.insertRow;
    assert.equal((await restored.match.points.retry()).ok, true);
    assert.equal(h.db.calls.insertRow, writes);
});


test('立直牌桌存档：写档失败阻止离桌，旧档续玩不追溯积分', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('立直存档'); await h.runtime.engine.whenSaved();
    const ui = await riichiUiHarness(t, h, at);
    assert.equal((await riichiUiWin(ui)).ok, true);
    const identity = ui.match.points.state.identity;
    const write = h.storage.setItem;
    let rejected = true;
    h.storage.setItem = (key, value) => {
        if (rejected && key === 'igs-wait-mahjong-v1') throw new Error('模拟存档失败');
        return write(key, value);
    };
    ui.board.querySelector('.igs-ws-close').click();
    assert.equal(ui.closed, 0);
    assert.equal(ui.match.canPlay(), false);
    assert.equal(ui.match.points.state.error, 'points-table-save-failed');
    ui.board.querySelector('[aria-label="返回阅读"]').click();
    assert.equal(ui.back, 0, '存档未确认时返回阅读也不得丢桌');
    rejected = false;
    assert.equal((await ui.match.points.retry()).ok, true);
    ui.board.querySelector('[aria-label="返回阅读"]').click();
    assert.equal(ui.back, 1);
    assert.equal(ui.match.canPlay(), false);
    assert.deepEqual(ui.snapshot().points, identity);
    const legacy = ui.snapshot();
    legacy.version = 1; delete legacy.points; delete legacy.pointsExit;
    const old = await riichiUiHarness(t, h, at, { saved: legacy });
    const writes = h.db.calls.insertRow;
    assert.equal(old.match.points.state.enabled, false);
    assert.equal((await old.match.points.retry()).skipped, true);
    old.click('继续');
    assert.ok(old.game._reply[0]);
    assert.equal((await h.services.readSharedPoints()).games, 0);
    assert.equal(h.db.calls.insertRow, writes);
});

test('立直异步推进：确认后正常发牌，局末暂停确认且继续只回复一次', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const h = await sharedRuntime(t, 500);
    const at = h.game.ai('立直异步消息'); await h.runtime.engine.whenSaved();
    const ui = await riichiUiHarness(t, h, at, { asyncMessages: true });
    for (let i = 0; i < 8 && !ui.board.querySelector('.igs-mj-self [data-code]'); i += 1) {
        t.mock.timers.tick(250); await new Promise(setImmediate);
    }
    assert.ok(ui.match.feed.some(item => item.id === 0 && item.msg.qipai), '使用引擎异步开局消息');
    assert.equal(ui.match.canPlay(), true);
    ui.game.stop(); clearTimeout(ui.game._timeout_id); ui.game._timeout_id = undefined;
    ui.game.pingju('九種九牌');
    t.mock.timers.tick(0); await new Promise(setImmediate);
    const result = await ui.match.points.retry();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.round.hands.length, 1);
    assert.equal(ui.game._reply[0], undefined);
    let replies = 0;
    const reply = ui.game.reply.bind(ui.game);
    ui.game.reply = (id, value) => { if (id === 0) replies += 1; return reply(id, value); };
    ui.click('继续');
    const next = [...ui.board.querySelectorAll('button')].find(node => node.textContent === '继续');
    next.click();
    assert.equal(replies, 1);
    assert.equal((await h.services.readSharedPoints()).games, 0);
});


test('立直强制退桌：本桌亏损超过余额时完整结清，保留负余额且不能重复扣款', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const h = await sharedRuntime(t, 80);
    const at = h.game.ai('立直强制退桌'); await h.runtime.engine.whenSaved();
    const ui = await riichiUiHarness(t, h, at);
    const result = await riichiUiWin(ui, 1);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.settled, true);
    assert.equal(result.amount, -200);
    assert.equal(result.round.closeReason, 'insufficient');
    assert.equal(ui.closed, 1);
    assert.equal(ui.match.generation, -1);
    assert.equal(ui.match.canPlay(), false);
    assert.equal((await h.services.readSharedPoints()).balance, -120);
    const writes = h.db.calls.insertRow;
    assert.equal((await ui.match.points.retry()).ok, true);
    assert.equal(h.db.calls.insertRow, writes);
    assert.equal(ui.closed, 1);
});

test('立直来源失效：swipe与删楼先恢复待写意图，退出旧桌后新分支可开桌', async t => {
    for (const change of ['swipe', 'delete']) await t.test(change, async t => {
        t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
        const h = await sharedRuntime(t, 500);
        const at = h.game.ai('立直旧来源'); await h.runtime.engine.whenSaved();
        const ui = await riichiUiHarness(t, h, at);
        const insert = h.db.api.insertRow;
        h.db.api.insertRow = (...args) => {
            const cells = typeof args[0] === 'object' ? args[0].data : args[1];
            return String(cells?.['载荷JSON']).includes('"kind":"hand"') ? false : insert(...args);
        };
        assert.equal((await riichiUiWin(ui)).ok, false);
        const roundId = ui.match.points.state.identity.roundId;
        assert.equal(h.services.points().pending().record.payload.sourceId, roundId);
        if (change === 'swipe') h.game.newSwipe(at, '立直新分支');
        else h.game.ctx.chat.splice(at, 1);
        await h.runtime.engine.whenSaved();
        const result = await ui.match.points.retry();
        assert.equal(result.inactive, true, JSON.stringify(result));
        assert.equal(ui.closed, 1);
        assert.equal(ui.match.generation, -1);
        assert.equal(h.services.points().pending().record, null);
        assert.equal((await h.services.readSharedPoints()).games, 0);
        h.db.api.insertRow = insert;
        const next = h.game.ai('立直新来源'); await h.runtime.engine.whenSaved();
        const fresh = await riichiUiHarness(t, h, next);
        assert.equal(fresh.confirmed.ok, true, JSON.stringify(fresh.confirmed));
        assert.notEqual(fresh.match.points.state.identity.roundId, roundId);
    });
});


const exchangeBalance = async h => {
    const { currencyBalanceOf } = await import('../src/scene/stats/stat-currency.js');
    const inventory = h.services.inventoryTables();
    inventory.client?.invalidate?.();
    const result = currencyBalanceOf(inventory.read(), '铜钱');
    assert.equal(result.ok, true, result.reason);
    return result.balance;
};

test('共享积分兑换：固定比例取整、重复确认及重开只扣共享余额一次', async t => {
    const h = await sharedRuntime(t, 500, {}, {});
    assert.equal(await exchangeBalance(h), 100);
    const counts = ['insertRow', 'updateRow', 'deleteRow'].map(key => h.db.calls[key]);
    const { attachedOriginBinding } = await import('../src/visual/igs-ui/origin-attach.js');
    assert.deepEqual(attachedOriginBinding().exchange.info(), { ok: true, name: '铜钱', rate: 0.25 });
    assert.equal(h.services.points().read().exchanges.size, 0);
    assert.deepEqual(['insertRow', 'updateRow', 'deleteRow'].map(key => h.db.calls[key]), counts);
    const chatId = h.game.ctx.chatId;
    h.game.ctx.chatId = `${chatId}-other`;
    assert.equal(h.stats.exchangeInfo().reason, 'stats-chat-not-enabled');
    h.game.ctx.chatId = chatId;
    const quote = await h.stats.quoteExchange(43);
    assert.equal(quote.ok, true, quote.reason);
    assert.equal(quote.amount, 10);
    assert.equal(quote.currency.rate, 0.25);
    const results = await Promise.all([h.stats.exchangePoints(quote), h.stats.exchangePoints(quote)]);
    assert.ok(results.every(r => r.ok && r.done), JSON.stringify(results));
    assert.equal(results.filter(r => !r.present).length, 1);
    assert.equal(h.runtime.engine.getState().points, 457);
    assert.equal(h.services.lifeSource().readPoints(), -43);
    assert.equal((await h.services.readSharedPoints()).balance, 457);
    assert.equal(h.holder.money, 500);
    assert.equal(await exchangeBalance(h), 110);
    const stored = h.services.points().read();
    assert.equal(stored.exchanges.size, 1);
    assert.equal(stored.exchanges.get(quote.exchangeId).done, true);
    await h.openStats();
    assert.deepEqual(h.stats.exchangeInfo(), { ok: true, name: '铜钱', rate: 0.25 });
    assert.equal((await h.stats.exchangePoints(quote)).present, true);
    assert.equal((await h.services.readSharedPoints()).balance, 457);
    assert.equal(await exchangeBalance(h), 110);
});

test('共享积分兑换：不足、负余额、小额零产出及非法数量不写收支', async t => {
    const h = await sharedRuntime(t, 10, {}, {});
    const counts = ['insertRow', 'updateRow', 'deleteRow'].map(key => h.db.calls[key]);
    for (const points of [0, -1, 1.5, NaN, Infinity]) {
        const result = await h.stats.quoteExchange(points);
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'points-exchange-invalid');
    }
    assert.equal((await h.stats.quoteExchange(3)).reason, 'points-exchange-too-small');
    assert.equal((await h.stats.quoteExchange(11)).reason, 'points-insufficient');
    h.holder.money = -1;
    assert.equal((await h.stats.quoteExchange(4)).reason, 'points-insufficient');
    assert.equal(h.services.points().read().exchanges.size, 0);
    assert.equal(await exchangeBalance(h), 100);
    assert.deepEqual(['insertRow', 'updateRow', 'deleteRow'].map(key => h.db.calls[key]), counts);
});


test('共享积分兑换：扣款、到账和完成标记失败只恢复同一意图', async t => {
    for (const stage of ['debit', 'credit', 'done', 'receipt', 'intent', 'clear']) await t.test(stage, async t => {
        const h = await sharedRuntime(t, 500, {}, {});
        const quote = await h.stats.quoteExchange(40);
        assert.equal(quote.ok, true, quote.reason);
        const insert = h.db.api.insertRow, update = h.db.api.updateRow;
        const save = h.storage.setItem, remove = h.storage.removeItem;
        let rejected = false;
        h.db.api.insertRow = (...args) => {
            const cells = typeof args[0] === 'object' ? args[0].data : args[1];
            const payload = String(cells?.['载荷JSON']);
            const block = stage === 'debit' && payload.includes('"kind":"exchange"')
                || stage === 'done' && payload.includes('"kind":"exchange-done"');
            if (block) { rejected = true; return false; }
            return insert(...args);
        };
        h.db.api.updateRow = (...args) => {
            if (stage === 'credit') { rejected = true; return false; }
            const result = update(...args);
            if (stage === 'receipt') { rejected = true; return false; }
            return result;
        };
        h.storage.setItem = (key, value) => {
            if (stage === 'intent' && key.startsWith('igs:points:pending:')) { rejected = true; throw new Error('fixture'); }
            return save(key, value);
        };
        h.storage.removeItem = key => {
            if (stage === 'clear' && key.startsWith('igs:points:pending:')) { rejected = true; throw new Error('fixture'); }
            return remove(key);
        };
        const result = await h.stats.exchangePoints(quote);
        assert.equal(rejected, true, stage);
        assert.equal(result.ok, stage === 'receipt', JSON.stringify(result));
        if (stage === 'receipt') assert.equal(result.done, true);
        else assert.equal(h.services.points().spendingGate().ok, stage === 'intent');
        assert.equal(await exchangeBalance(h), ['done', 'receipt'].includes(stage) ? 110 : 100);
        h.db.api.insertRow = insert; h.db.api.updateRow = update;
        h.storage.setItem = save; h.storage.removeItem = remove;
        await h.openStats();
        assert.equal((await h.stats.retryExchange()).ok, true);
        const retried = await h.stats.exchangePoints(quote);
        assert.equal(retried.ok, true, retried.reason);
        assert.equal(retried.done, true);
        assert.equal((await h.services.readSharedPoints()).balance, 460);
        assert.equal(await exchangeBalance(h), 110);
        assert.equal(h.services.points().read().exchanges.size, 1);
        const count = h.db.calls.insertRow + h.db.calls.updateRow;
        assert.equal((await h.stats.retryExchange()).ok, true);
        assert.equal((await h.stats.exchangePoints(quote)).present, true);
        assert.equal(h.db.calls.insertRow + h.db.calls.updateRow, count);
    });
});


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

test('共享积分兑换：真实分段中断只补原扣款，分支变化不返还已确认支出', async t => {
    for (const change of ['swipe', 'delete']) await t.test(change, async t => {
        const h = await sharedRuntime(t, 500, {}, {});
        let engine = await segmentedExchange(h);
        await h.openStats(engine);
        const quote = await h.stats.quoteExchange(40);
        assert.equal(quote.ok, true, quote.reason);
        const insert = h.db.api.insertRow;
        let rejected = false;
        h.db.api.insertRow = (...args) => {
            const cells = typeof args[0] === 'object' ? args[0].data : args[1];
            if (cells?.['类型'] === 'points' && String(cells['分段']).startsWith('2/')) {
                rejected = true; return false;
            }
            return insert(...args);
        };
        assert.equal((await h.stats.exchangePoints(quote)).ok, false);
        assert.equal(rejected, true);
        const intent = engine.pending().record;
        assert.equal(intent.payload.kind, 'exchange');
        assert.equal((await h.services.readSharedPoints()).ok, false);
        assert.equal(await exchangeBalance(h), 100);
        if (change === 'swipe') h.game.ctx.chat[0].swipe_id = 1;
        else h.game.ctx.chat.pop();
        h.db.api.insertRow = insert;
        engine = await segmentedExchange(h);
        await h.openStats(engine);
        assert.equal((await h.stats.retryExchange()).ok, true);
        assert.equal(engine.pending().record, null);
        assert.equal(engine.read().exchanges.get(quote.exchangeId).done, true);
        assert.equal((await h.services.readSharedPoints()).balance, 460);
        assert.equal(await exchangeBalance(h), 110);
        const counts = [h.db.calls.insertRow, h.db.calls.updateRow];
        assert.equal((await h.stats.exchangePoints(quote)).present, true);
        assert.deepEqual([h.db.calls.insertRow, h.db.calls.updateRow], counts);
    });
});


test('共享积分兑换：未写入的旧分支意图失效，不补扣款也不发货币', async t => {
    for (const change of ['swipe', 'delete']) await t.test(change, async t => {
        const h = await sharedRuntime(t, 500, {}, {});
        const quote = await h.stats.quoteExchange(40);
        const insert = h.db.api.insertRow;
        h.db.api.insertRow = (...args) => {
            const cells = typeof args[0] === 'object' ? args[0].data : args[1];
            return String(cells?.['载荷JSON']).includes('"kind":"exchange"') ? false : insert(...args);
        };
        assert.equal((await h.stats.exchangePoints(quote)).ok, false);
        assert.equal(h.services.points().pending().record.payload.sourceId, quote.exchangeId);
        if (change === 'swipe') h.game.ctx.chat[0].swipe_id = 1;
        else h.game.ctx.chat.pop();
        h.db.api.insertRow = insert;
        assert.equal((await h.stats.retryExchange()).ok, true);
        assert.equal(h.services.points().pending().record, null);
        assert.equal(h.services.points().read().exchanges.size, 0);
        assert.equal((await h.stats.exchangePoints(quote)).reason, 'request-stale');
        assert.equal((await h.services.readSharedPoints()).balance, 500);
        assert.equal(await exchangeBalance(h), 100);
    });
});

test('共享积分兑换：货币外部冲突拒绝覆盖，恢复只补原目标且下一楼先恢复', async t => {
    const h = await sharedRuntime(t, 500, {}, {});
    const quote = await h.stats.quoteExchange(40);
    const update = h.db.api.updateRow;
    h.db.api.updateRow = () => false;
    assert.equal((await h.stats.exchangePoints(quote)).ok, false);
    h.db.api.updateRow = update;
    const inventory = h.services.inventoryTables();
    assert.equal((await inventory.changeQuantities([{ name: '铜钱', delta: 5 }])).ok, true);
    assert.equal((await h.stats.retryExchange()).reason, 'inventory-quantity-conflict');
    assert.equal(h.services.points().spendingGate().ok, false);
    assert.equal(await exchangeBalance(h), 105);
    assert.equal((await h.services.readSharedPoints()).balance, 460);
    assert.equal((await inventory.changeQuantities([{ name: '铜钱', delta: -5 }])).ok, true);
    h.game.emit(h.game.ctx.eventTypes.GENERATION_STARTED, 'normal', {}, false);
    h.game.ai('[igs-stat:money|收入|少量]');
    h.game.emit(h.game.ctx.eventTypes.GENERATION_ENDED);
    await h.stats.whenSaved();
    assert.equal(h.services.points().read().exchanges.get(quote.exchangeId).done, true);
    assert.equal(await exchangeBalance(h), 117);
    assert.equal((await h.stats.exchangePoints(quote)).present, true);
    assert.equal(await exchangeBalance(h), 117);
});

test('共享积分兑换：确认与战斗消费竞争时重新核对同一个余额', async t => {
    const h = await sharedRuntime(t, 200, {}, {});
    const quote = await h.stats.quoteExchange(100);
    const [exchanged, spent] = await Promise.all([
        h.stats.exchangePoints(quote), h.ledger.respecClass('pc-hero', 'cls-mage'),
    ]);
    assert.equal([exchanged, spent].filter(r => r.ok).length, 1, JSON.stringify([exchanged, spent]));
    assert.equal((await h.services.readSharedPoints()).balance, exchanged.ok ? 100 : 50);
    assert.equal(await exchangeBalance(h), exchanged.ok ? 125 : 100);
    assert.equal(h.holder.money, 200);
});


test('共享积分兑换：钱包、战斗、Origin和小游戏合并消费，兑换不释放奖励额度', async t => {
    const h = await sharedRuntime(t, 500, {}, {});
    const receive = async text => { const at = h.game.ai(text); await h.runtime.engine.whenSaved(); return at; };
    await receive('<origin>\n新任务|类型:主线|标题:甲|奖励:积分100\n新任务|类型:支线|标题:乙|奖励:积分100\n完成|1\n完成|2\n</origin>');
    await receive('<origin>\n新任务|类型:主线|标题:丙|奖励:积分100\n完成|3\n</origin>');
    const at = await receive('<origin>\n新任务|类型:主线|标题:丁|奖励:积分100\n完成|4\n</origin>');
    const points = h.services.points();
    const first = await points.start({ game: 'snake', messageId: at });
    assert.equal((await points.award(first.roundId, { terminal: true, won: true, score: 30 })).amount, 20);
    assert.equal((await h.ledger.respecClass('pc-hero', 'cls-mage')).ok, true);
    const before = await h.services.readSharedPoints();
    assert.deepEqual([before.wallet, before.combat, before.origin, before.games, before.balance], [500, -150, 300, 20, 670]);
    const grants = clone(points.read().grants);
    const origin = JSON.stringify(h.services.originStore().read().raw);
    h.holder.enabled = false;
    const quote = await h.stats.quoteExchange(600);
    assert.equal(quote.ok, true, quote.reason);
    assert.equal((await h.stats.exchangePoints(quote)).done, true);
    assert.equal((await h.services.readSharedPoints()).balance, 70);
    assert.equal(h.runtime.engine.getState().points, 70);
    assert.equal(await exchangeBalance(h), 250);
    assert.equal(h.holder.money, 500);
    assert.equal(JSON.stringify(h.services.originStore().read().raw), origin);
    assert.deepEqual(points.read().grants, grants);
    const second = await points.start({ game: 'snake', messageId: at });
    assert.equal((await points.award(second.roundId, { terminal: true, won: true, score: 30 })).amount, 0);
    await receive('<origin>\n新任务|类型:主线|标题:戊|奖励:积分100\n完成|5\n</origin>');
    assert.equal((await h.services.readSharedPoints()).origin, 300);
    assert.equal((await h.services.readSharedPoints()).balance, 70);
});


test('共享积分兑换隔离：普通小游戏待写不阻塞独立的剧情货币结算', async t => {
    const h = await sharedRuntime(t, 500, {}, {});
    const points = h.services.points();
    const round = await points.start({ game: 'rps', messageId: 0 });
    assert.equal(round.ok, true, round.reason);
    const insert = h.db.api.insertRow;
    h.db.api.insertRow = (...args) => {
        const cells = typeof args[0] === 'object' ? args[0].data : args[1];
        return String(cells?.['载荷JSON']).includes('"kind":"award"') ? false : insert(...args);
    };
    assert.equal((await points.award(round.roundId, { win: true })).ok, false);
    const intent = points.pending().record;
    assert.equal(intent.payload.kind, 'award');
    h.game.emit(h.game.ctx.eventTypes.GENERATION_STARTED, 'normal', {}, false);
    h.game.ai('[igs-stat:money|收入|少量]');
    h.game.emit(h.game.ctx.eventTypes.GENERATION_ENDED);
    await h.stats.whenSaved();
    assert.equal(await exchangeBalance(h), 107);
    assert.deepEqual(points.pending().record, intent);
    assert.equal(points.read().exchanges.size, 0);
    h.db.api.insertRow = insert;
    assert.equal((await points.retry()).ok, true);
    assert.equal((await h.services.readSharedPoints()).balance, 502);
});

test('运行时：「设为User立绘」的角色按主角处理，状态栏出生活条、不出好感信任', () => {
    const rt = runtimeSetup({ userCharacter: () => '白墨' });
    assert.deepEqual(rt.protagonistLookup()('白墨').metrics.map((m) => m.label), ['体力', '压力', '积分']);
    assert.deepEqual(rt.metricsLookup()('白墨').metrics, []);
    const table = { metrics: [{ label: '好感度' }, { label: '信赖' }, { label: '体力' }] };
    assert.deepEqual(dropUserFavor(table, '主角').metrics.map((m) => m.label), ['体力']);
});

test('运行时：User 角色与酒馆用户名的别名都按主角处理，不出好感信任', () => {
    const rt = runtimeSetup({ userCharacter: () => '白墨', characterAliases: () => ({ 白墨: ['小白', '墨哥'], 阿明: ['明明'], 小雪: ['雪儿'] }) });
    for (const name of ['小白', '墨哥', '明明']) assert.deepEqual(rt.metricsLookup()(name).metrics, [], name);
    assert.ok(rt.protagonistLookup()('小白'));
    assert.equal(rt.protagonistLookup()('雪儿'), null);
});
