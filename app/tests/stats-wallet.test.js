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
    assert.match(prompt.content, /金钱[^\n]*10/);
});

// ---------- bars.* 开关与状态栏主角条 ----------
test('主角条：金钱条显示合并余额；bars 开关决定出哪几条', () => {
    const bars = { stamina: 60, stress: 20, money: 40 };
    const all = protagonistStatMetrics(bars, { enabledBars: { stamina: true, stress: true, money: true }, walletExtra: 160 });
    assert.deepEqual(all.map((m) => m.label), ['体力', '压力', '金钱']);
    assert.equal(all.find((m) => m.label === '金钱').display, '200');
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

test('运行时：状态栏主角条只给主角；金钱只算数值侧，不并入战斗积分（积分与金钱分开）', () => {
    const off = runtimeSetup({ combat: false, points: 500 });
    const lookup = off.protagonistLookup();
    assert.equal(lookup('小雪'), null);
    const own = lookup('阿明');
    assert.deepEqual(own.metrics.map((m) => m.label), ['体力', '压力', '金钱']);
    assert.equal(own.metrics.find((m) => m.label === '金钱').display, '0');
    assert.equal(off.walletMoney(), 0);
    const on = runtimeSetup({ combat: true, points: 120 });
    const mine = on.protagonistLookup()('阿明');
    assert.deepEqual(mine.metrics.map((m) => m.label), ['生命', '体力', '压力', '金钱']);
    assert.equal(mine.metrics.find((m) => m.label === '金钱').display, '0');
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
    assert.deepEqual(block.metrics.map((m) => m.label), ['生命', '体力', '压力', '金钱']);
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

test('运行时：「设为User立绘」的角色按主角处理，状态栏出生活条、不出好感信任', () => {
    const rt = runtimeSetup({ userCharacter: () => '白墨' });
    assert.deepEqual(rt.protagonistLookup()('白墨').metrics.map((m) => m.label), ['体力', '压力', '金钱']);
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
