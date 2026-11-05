// 随身系统属性加成接进 IGS：两边各记各的，读属性或技能时相加（百分制）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, heroBonusOf, profileOf, PROTAGONIST } from '../src/scene/stats/stat-engine.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { blk, createHarness } from './origin-host.js';

const FLAT = { scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }; // 每项 50 点（百分制）
const engineWith = (stats, ruleset = 'coc7', catalog = {}) => createEngine(catalog, {}, ruleset, { readAbilities: () => FLAT, readBonus: () => stats });
const hero = (engine, name) => profileOf(engine, createStatsState(), PROTAGONIST, name);

test('同名加成生效：六维与技能都直接加在百分制值上，随身系统为空时一切照旧', () => {
    const plain = engineWith(null);
    const boosted = engineWith([{ name: '力量', val: 2 }, { name: '侦查', val: 7 }]);
    assert.equal(hero(plain, '力量').value, 50);
    assert.equal(hero(boosted, '力量').value, 52);
    assert.equal(hero(boosted, '侦查').value, hero(plain, '侦查').value + 7);
    assert.equal(hero(boosted, '敏捷').value, 50, '别的属性不受影响');
    assert.equal(hero(engineWith([]), '力量').value, 50);
});

test('旧名映射：健康→体质、观察→感知，别名按技能注册表对应；D&D 下理智归智力', () => {
    const e = engineWith([{ name: '健康', val: 3 }, { name: '观察', val: 4 }, { name: '厨艺', val: 10 }]);
    assert.equal(hero(e, '体质').value, 53);
    assert.equal(hero(e, '感知').value, 54);
    assert.equal(hero(e, '烹饪').value, hero(engineWith(null), '烹饪').value + 10, '别名厨艺 = 烹饪');
    assert.equal(heroBonusOf(e, '健康'), 3, '用旧名查也一样');
    const dnd = engineWith([{ name: '理智', val: 5 }], 'dnd5e');
    assert.equal(hero(dnd, '智力').value, 55);
});

test('加成不进账本：seed 与手改基数不含加成，同名多条相加', () => {
    const e = engineWith([{ name: '电脑', val: 5 }, { name: '电脑', val: 3 }]);
    const p = hero(e, '电脑');
    assert.equal(p.value, p.seed + 8);
    assert.equal(p.learned, true);
});

// ---------- 运行时 ----------
const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };
function runtimeWith(origin, extra = {}) {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
    };
    const ctx = { name1: '阿明', name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {}, eventSource, eventTypes: T, getCurrentChatId: () => 'chat-o', setExtensionPrompt() {}, saveMetadata() {} };
    const rows = [];
    const tables = { ok: true, version: 0, read: () => ({ ok: true, stats: rows.slice() }), append(r) { rows.push(...r); this.version += 1; return Promise.resolve({ ok: true }); }, ensure: () => Promise.resolve({ ok: true }) };
    const rt = createStatsRuntime({ getContext: () => ctx, readSettings: () => ({ enabled: true, ruleset: 'coc7', ...(extra.settings || {}) }), statsTables: () => tables, originStats: () => origin.stats, ...(extra.opts || {}) });
    rt.sync();
    rt.enableForChat();
    return { rt, ctx };
}

const skillTable = (rows) => ({ sheet_s: { uid: 'sheet_s', name: '才艺技能表', orderNo: 2, content: [['角色姓名', '技能', '数值'], ...rows] } });
function withTable(origin, rows) {
    const data = skillTable(rows);
    const updateCbs = new Set();
    const api = {
        exportTableAsJson: () => data,
        updateCell(table, rowIndex, col, value) { const t = Object.values(data).find((x) => x.name === table); t.content[rowIndex][t.content[0].indexOf(col)] = value; return true; },
        refreshDataAndWorldbook() {},
        registerTableUpdateCallback: (cb) => updateCbs.add(cb),
        unregisterTableUpdateCallback: (cb) => updateCbs.delete(cb),
        registerTableFillStartCallback() {},
    };
    const client = createShujukuClient(api);
    const env = runtimeWith(origin, { settings: { register: 'auto', push: { enabled: true } }, opts: { getPushClient: () => client } });
    return { ...env, data, updateCbs, cell: (i) => data.sheet_s.content[i] };
}
const storyNames = (rt) => rt.getCatalog().story.map((x) => x.name);

test('新名自动收进 IGS 技能且只收一次；随身系统关闭（无数据）时不收', () => {
    const origin = { stats: [{ name: '神识', val: 12 }] };
    const { rt } = runtimeWith(origin);
    const dice = () => rt.resolveDice('检定 <user> 神识 难度=普通', { userName: '阿明' });
    assert.equal(dice().ok, true);
    dice(); dice();
    assert.equal(storyNames(rt).filter((n) => n === '神识').length, 1);
    const queued = rt.getCatalog().queue.skills.filter((n) => n === '神识').length;
    assert.equal(queued, 1, '补全队列里也只有一条');
    const off = runtimeWith({ stats: null });
    off.rt.resolveDice('检定 <user> 神识 难度=普通', { userName: '阿明' });
    assert.ok(storyNames(off.rt).includes('神识'), '检定本身仍按剧情新技能处理');
    const none = runtimeWith({ stats: [] });
    none.rt.pushNow();
    assert.deepEqual(storyNames(none.rt), [], '无数据时不会凭空收技能');
});

test('写回才艺技能表的是生效值（含随身系统加成）', async () => {
    const origin = { stats: [{ name: '神识', val: 12 }, { name: '侦查', val: 6 }] };
    const env = withTable(origin, [['阿明', '神识', '1'], ['阿明', '侦查', '1']]);
    await env.rt.pushNow();
    const shown = Object.fromEntries(env.data.sheet_s.content.slice(1).map((r) => [r[1], Number(r[2])]));
    assert.equal(shown.神识, 13, '新技能初值 1 + 加成 12');
    assert.equal(shown.侦查, 25 + 6, '侦查基础值 25 + 加成 6');
});

test('手改采纳扣掉加成：界面手改与表格手改存回 IGS 的都是不含加成的值', async () => {
    const origin = { stats: [{ name: '电脑', val: 10 }] };
    const env = withTable(origin, [['阿明', '电脑', '1']]);
    env.rt.heroOp('set', '电脑', { value: '60' });
    assert.equal(env.rt.getCatalog().protagonistEdit['电脑'].value, 50, '界面填 60（生效值），存回 50');
    // 表格里手改成 80（生效值），采纳后存回 70；这里不先推送，避开自写后的静默窗口
    env.cell(1)[2] = '80';
    for (const cb of [...env.updateCbs]) cb({}, { persisted: true });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(env.rt.getCatalog().protagonistEdit['电脑'].value, 70, '表格填 80（生效值），存回 70');
});

test('随身系统关闭时一切照旧：同样的手改不扣任何东西', () => {
    const env = withTable({ stats: null }, [['阿明', '电脑', '1']]);
    env.rt.heroOp('set', '电脑', { value: '60' });
    assert.equal(env.rt.getCatalog().protagonistEdit['电脑'].value, 60);
});

test('随身系统只读自己的 st.stats：rawStats 返回自己的属性，未启用为空', () => {
    const h = createHarness({});
    h.user('hi'); h.ai('a' + blk('属性|力量|+2'));
    assert.ok(Array.isArray(h.engine.rawStats()));
    const off = createHarness({ enabled: false });
    assert.deepEqual([...off.engine.rawStats()], []);
});

// ---------- 按规则体系换算 ----------
import { getSharedOriginEngine, ORIGIN_ENGINE_SYMBOL } from '../src/scene/origin/origin-engine.js';

function ruleOrigin(id, settings = {}) {
    const rule = { id };
    const h = createHarness({ ...settings });
    h.host.readRuleset = () => rule.id;
    return { h, rule };
}
const statOf = (h, name) => (h.engine.rawStats().find((x) => x.name === name) || {}).val;
const shownOf = (h, name) => (h.state().stats.find((x) => x.name === name) || {}).val;

test('D&D 下属性点 +1 生效为百分制 +5；CoC 下 1:1；rawStats 是百分制', () => {
    const dnd = ruleOrigin('dnd5e');
    dnd.h.user('u'); dnd.h.ai('a' + blk('属性|力量|+1', '属性|敏捷|+2'));
    assert.equal(statOf(dnd.h, '力量'), 5);
    assert.equal(statOf(dnd.h, '敏捷'), 10);
    assert.equal(shownOf(dnd.h, '力量'), 1, '面板按 D&D 显示属性点');
    const coc = ruleOrigin('coc7');
    coc.h.user('u'); coc.h.ai('a' + blk('属性|力量|+5'));
    assert.equal(statOf(coc.h, '力量'), 5);
    assert.equal(shownOf(coc.h, '力量'), 5, '面板按 CoC 显示百分制');
    const none = createHarness({});
    none.user('u'); none.ai('a' + blk('属性|力量|+5'));
    assert.equal(none.engine.rawStats().find((x) => x.name === '力量').val, 5, 'host 没提供 readRuleset 按 CoC');
});

test('旧名与别名也按六维换算；技能名与自创属性 1:1', () => {
    const { h } = ruleOrigin('dnd5e');
    h.user('u'); h.ai('a' + blk('属性|健康|+1', '属性|神识|+3', '属性|侦查|+4'));
    assert.equal(statOf(h, '健康'), 5);
    assert.equal(statOf(h, '神识'), 3, '自创属性 1:1');
    assert.equal(statOf(h, '侦查'), 4, '技能 1:1');
});

test('中途换体系后旧奖励数值不变，新奖励按新体系换算', () => {
    const { h, rule } = ruleOrigin('dnd5e');
    h.user('u'); h.ai('a' + blk('属性|力量|+1'));
    rule.id = 'coc7';
    assert.equal(statOf(h, '力量'), 5, '旧奖励仍是百分制 5');
    assert.equal(shownOf(h, '力量'), 5, '面板按新体系显示');
    h.user('u'); h.ai('b' + blk('属性|力量|+10'));
    assert.equal(statOf(h, '力量'), 15, '新奖励 CoC 下 1:1');
    h.reopen();
    assert.equal(statOf(h, '力量'), 15, '存档重开后仍然一致');
    rule.id = 'dnd5e';
    assert.equal(statOf(h, '力量'), 15, '换回 D&D 也不改旧值');
    assert.equal(shownOf(h, '力量'), 3);
});

test('旧档没有倍数快照时按当前体系；手动加属性也按当前体系换算', () => {
    const { h, rule } = ruleOrigin('dnd5e');
    h.user('u'); h.ai('a' + blk('属性|力量|+1'));
    const key = Object.keys(h.ctx.chatMetadata)[0];
    for (const e of h.ctx.chatMetadata[key].entries) delete e.scale;
    rule.id = 'coc7';
    h.reopen();
    assert.equal(statOf(h, '力量'), 1, '无快照退回当前体系 CoC：1');
    assert.equal(h.engine.dispatch({ type: 'addStat', name: '体质', val: 2 }).ok, true);
    assert.equal(statOf(h, '体质'), 2);
});

test('提示词用一句话说明当前体系与单位，自创属性 1:1', () => {
    const dnd = ruleOrigin('dnd5e');
    dnd.h.user('hi');
    assert.match(dnd.h.injected(), /D&D 第五版写：六维属性写属性点整数，常见 \+1、\+2/);
    assert.match(dnd.h.injected(), /自创属性名不论体系都按 1:1/);
    const coc = ruleOrigin('coc7');
    coc.h.user('hi');
    assert.match(coc.h.injected(), /CoC 第七版写：六维属性写百分制整数，常见 \+5、\+10/);
    const none = createHarness({});
    none.user('hi');
    assert.match(none.injected(), /CoC 第七版写/);
});

test('共享 hub：被选中的 host 没提供可选字段时，取登记顺序里第一个提供了的 host', () => {
    const g = globalThis;
    const saved = g[ORIGIN_ENGINE_SYMBOL];
    delete g[ORIGIN_ENGINE_SYMBOL];
    try {
        const base = createHarness({ enabled: true });
        const selected = { ...base.host };
        const other = { ...base.host, settings: () => ({ enabled: false }), extraPoints: () => 300, extraPointLog: () => [{ floor: 0, delta: 5, reason: '出售' }], readRuleset: () => 'dnd5e' };
        const first = getSharedOriginEngine(selected);
        getSharedOriginEngine(other);
        assert.equal(first.getState().points, 300, '取到另一个 host 的战斗积分');
        assert.ok(first.getState().log.some((r) => r.mark === '战斗'), '战斗流水也取得到');
        const withOwn = { ...base.host, extraPoints: () => 40 };
        delete g[ORIGIN_ENGINE_SYMBOL];
        const e2 = getSharedOriginEngine(withOwn);
        getSharedOriginEngine(other);
        assert.equal(e2.getState().points, 40, '被选中的 host 自己提供就优先用它的');
        delete g[ORIGIN_ENGINE_SYMBOL];
        const e3 = getSharedOriginEngine(selected);
        getSharedOriginEngine(other);
        e3.dispatch({ type: 'addStat', name: '力量', val: 1 });
        assert.equal(e3.rawStats().find((x) => x.name === '力量').val, 5, 'readRuleset 同样回退到另一个 host');
    } finally {
        if (saved) g[ORIGIN_ENGINE_SYMBOL] = saved; else delete g[ORIGIN_ENGINE_SYMBOL];
    }
});

test('技能残留不固化：加成关闭后 push 把表格写回底数，之后采纳底数不变', async () => {
    const origin = { stats: [{ name: '侦查', val: 10 }] };
    const env = withTable(origin, [['阿明', '侦查', '1']]);
    await env.rt.pushNow();
    assert.equal(env.cell(1)[2], '35', '侦查基础值 25 + 加成 10 = 生效值');
    origin.stats = null;
    await env.rt.pushNow();
    assert.equal(env.cell(1)[2], '25', '关闭后表格回到底数');
    // 再采纳：表格值与生效值一致，没有手改，不产生任何底数或覆盖
    for (const cb of [...env.updateCbs]) cb({}, { persisted: true });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const cat = env.rt.getCatalog();
    assert.equal(cat.protagonistBase['侦查'], undefined, '底数没有被固化');
    assert.equal(cat.protagonistEdit['侦查'], undefined);
});

test('认得但不在名单里的行按普通手改走：值不同才采纳，采纳前扣掉加成', async () => {
    const origin = { stats: [{ name: '侦查', val: 10 }] };
    const env = withTable(origin, [['阿明', '侦查', '1']]);
    await env.rt.pushNow();
    await new Promise((resolve) => setTimeout(resolve, 2700));
    env.cell(1)[2] = '50';
    for (const cb of [...env.updateCbs]) cb({}, { persisted: true });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(env.rt.getCatalog().protagonistBase['侦查'], 40, '表格填 50（生效值），存回 40');
});

test('关闭随身系统后、下次写表前先触发采纳：表里还是上次写入的旧生效值，不当手改固化', async () => {
    const origin = { stats: [{ name: '侦查', val: 10 }] };
    const env = withTable(origin, [['阿明', '侦查', '1']]);
    await env.rt.pushNow();
    assert.equal(env.cell(1)[2], '35');
    await new Promise((resolve) => setTimeout(resolve, 2700));
    origin.stats = null;
    for (const cb of [...env.updateCbs]) cb({}, { persisted: true });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const cat = env.rt.getCatalog();
    assert.equal(cat.protagonistBase['侦查'], undefined, '旧生效值 35 没被当成底数');
    assert.equal(cat.protagonistEdit['侦查'], undefined);
    assert.equal(env.cell(1)[2], '25', '随后写表刷新回底数');
});

test('关闭随身系统后用户真改了表（不是上次写入的值）：照常采纳', async () => {
    const origin = { stats: [{ name: '侦查', val: 10 }] };
    const env = withTable(origin, [['阿明', '侦查', '1']]);
    await env.rt.pushNow();
    await new Promise((resolve) => setTimeout(resolve, 2700));
    origin.stats = null;
    env.cell(1)[2] = '60';
    for (const cb of [...env.updateCbs]) cb({}, { persisted: true });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(env.rt.getCatalog().protagonistBase['侦查'], 60);
});

// ---------- 场景：只开天音的随身系统，IGS 的随身系统关着、战斗开着 ----------
for (const order of ['igs-first', 'tianyin-first']) {
    test(`只开天音：合计、原始值、花费与流水、属性都取对（登记顺序 ${order}）`, () => {
        const g = globalThis;
        const saved = g[ORIGIN_ENGINE_SYMBOL];
        delete g[ORIGIN_ENGINE_SYMBOL];
        try {
            const igs = createHarness({ enabled: false, drawCost: 100 });
            const tianyin = createHarness({ enabled: true, drawCost: 100 });
            igs.engine.stop(); tianyin.engine.stop();
            const combat = { raw: 300 };
            const igsHost = { ...igs.host, settings: () => ({ enabled: false }), extraPoints: () => combat.raw, extraPointLog: () => [{ floor: 0, delta: 5, reason: '出售' }], readRuleset: () => 'dnd5e' };
            const tianyinHost = { ...tianyin.host };
            const hosts = order === 'igs-first' ? [igsHost, tianyinHost] : [tianyinHost, igsHost];
            let engine = null;
            for (const h of hosts) engine = getSharedOriginEngine(h);
            engine.sync();
            tianyin.user('u');
            tianyin.ai('a' + blk('积分|+50|奖励', '属性|力量|+1'));
            assert.ok(tianyin.saves > 0 && igs.saves === 0, '选中的是天音，IGS 那边没有被写');
            assert.equal(engine.rawPoints(), 50, 'rawPoints 是天音的随身积分');
            assert.equal(engine.getState().points, 350, '合计 = 天音随身积分 + IGS 战斗积分');
            assert.ok(engine.getState().log.some((r) => r.mark === '战斗'), '记录页并入了战斗流水');
            assert.equal(engine.rawStats().find((x) => x.name === '力量').val, 5, 'rawStats 是天音的数据（体系取 IGS host 的 D&D：+1 = 5）');
            engine.dispatch({ type: 'addGacha', name: '小奖', tier: 'N', weight: 5 });
            engine.dispatch({ type: 'addShop', name: '盾', price: 400, desc: '', effect: '' });
            assert.equal(engine.dispatch({ type: 'draw' }).ok, true, '按合计 350 够抽 100');
            assert.equal(engine.rawPoints(), -50, '扣款扣在天音的随身积分上');
            assert.equal(engine.getState().points, 250);
            assert.equal(engine.dispatch({ type: 'buy', name: '盾' }).ok, false, '合计 250 买不起 400');
            combat.raw = 500;
            assert.equal(engine.dispatch({ type: 'buy', name: '盾' }).ok, true, '合计 450 买得起');
            assert.equal(engine.rawPoints(), -450);
            assert.equal(engine.getState().points, 50);
            assert.equal(combat.raw, 500, '战斗那份不被改');
        } finally {
            if (saved) g[ORIGIN_ENGINE_SYMBOL] = saved; else delete g[ORIGIN_ENGINE_SYMBOL];
        }
    });
}
