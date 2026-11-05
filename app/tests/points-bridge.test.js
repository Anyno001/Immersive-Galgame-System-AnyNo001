// 战斗积分与随身系统积分互通：主角只有一个余额 = 战斗原始流水 + 随身系统原始流水。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatLedger, heroPointLog } from '../src/combat/ledger.js';
import { blk, createHarness } from './origin-host.js';

// 带战斗积分的随身系统假宿主：combat.raw 是战斗侧原始积分。
function origin(settings = {}, combatRaw = 0) {
    const combat = { raw: combatRaw };
    const h = createHarness({ drawCost: 100, ...settings });
    h.host.extraPoints = () => combat.raw;
    return { h, combat };
}
const d = (h, op) => h.engine.dispatch(op);

test('合计显示：界面状态与注入提示词都是 随身系统 + 战斗', () => {
    const { h, combat } = origin({}, 300);
    h.user('hi'); h.ai('a' + blk('积分|+50|奖励'));
    assert.equal(h.state().points, 350);
    assert.equal(h.engine.rawPoints(), 50);
    h.user('go');
    assert.match(h.injected(), /积分：350 ｜/);
    combat.raw = 0;
    assert.equal(h.state().points, 50, '战斗侧回退后合计随之变化');
});

test('花费按合计判断并扣在本方：随身系统变负，合计不小于 0', () => {
    const { h, combat } = origin({}, 300);
    h.user('hi'); h.ai('a');
    assert.equal(d(h, { type: 'addGacha', name: '小奖', tier: 'N', weight: 5 }).ok, true);
    assert.equal(d(h, { type: 'addShop', name: '盾', price: 250, desc: '', effect: '' }).ok, true);
    assert.equal(d(h, { type: 'draw' }).ok, true, '合计 300 够抽 100');
    assert.equal(h.engine.rawPoints(), -100);
    assert.equal(h.state().points, 200);
    const poor = d(h, { type: 'buy', name: '盾' });
    assert.equal(poor.ok, false, '合计 200 不够 250');
    assert.equal(poor.reason, 'no-points');
    combat.raw = 400;
    assert.equal(d(h, { type: 'buy', name: '盾' }).ok, true);
    assert.equal(h.engine.rawPoints(), -350);
    assert.equal(h.state().points, 50);
    assert.ok(h.state().points >= 0);
});

test('balance 同步：AI 报的是合计，同步回来扣掉战斗份', () => {
    const { h } = origin({}, 300);
    h.user('hi'); h.ai('a' + blk('积分：500'));
    assert.equal(h.state().points, 500);
    assert.equal(h.engine.rawPoints(), 200, '随身系统原始值 = 500 - 300');
    h.user('go'); h.ai('b' + blk('积分|+10|奖励', '积分：510'));
    assert.equal(h.state().points, 510, '数据块变动后余额与 AI 所报一致，不重复计入');
    assert.equal(h.engine.rawPoints(), 210);
});

test('回退各自撤销：战斗份变化不动随身系统流水，随身系统重 roll 不动战斗份', () => {
    const { h, combat } = origin({}, 100);
    h.user('hi'); const i = h.ai('a' + blk('积分|+40|x'));
    assert.equal(h.state().points, 140);
    h.newSwipe(i, 'a2' + blk('积分|+5|y'));
    assert.equal(h.engine.rawPoints(), 5);
    assert.equal(combat.raw, 100);
    assert.equal(h.state().points, 105);
    combat.raw = 20;
    assert.equal(h.engine.rawPoints(), 5);
    assert.equal(h.state().points, 25);
});

test('防翻倍：两边只读对方原始值，反复读取与互读合计恒定', async () => {
    const h = createHarness({ drawCost: 100 });
    const combatRaw = { v: 120 };
    let ledger = null;
    h.host.extraPoints = () => combatRaw.v;
    h.user('hi'); h.ai('a' + blk('积分|+30|x'));
    const tables = { profile: [], ledger: [], read: () => ({ ok: true, missing: [], diagnostics: [], profile: [], ledger: [] }) };
    // 战斗侧钱包 = 随身系统原始积分；这里只验证钱包取值口径，不依赖具体战斗账本数据。
    ledger = createCombatLedger({ tables, chat: () => [], userName: '主角', wallet: () => h.engine.rawPoints() });
    for (let n = 0; n < 5; n += 1) {
        assert.equal(h.state().points, 150);
        assert.equal(h.engine.rawPoints(), 30);
        await ledger.effectiveState();
    }
    assert.equal(h.engine.rawPoints(), 30, '战斗侧读取不改变随身系统原始值');
    assert.equal(combatRaw.v, 120);
});

test('单边关闭：随身系统未启用时原始积分为 0；没有战斗积分时与旧行为一致', () => {
    const off = createHarness({ enabled: false });
    off.host.extraPoints = () => 999;
    assert.equal(off.engine.rawPoints(), 0);
    const { h } = origin({}, 0);
    h.user('hi'); h.ai('a' + blk('积分|+30|x'));
    assert.equal(h.state().points, 30);
    assert.equal(h.state().rawPoints, undefined, '额外值为 0 时不加字段');
    const plain = createHarness({ drawCost: 100 });
    plain.user('hi'); plain.ai('a');
    assert.equal(d(plain, { type: 'addGacha', name: '小奖', tier: 'N', weight: 5 }).ok, true);
    assert.equal(d(plain, { type: 'draw' }).ok, false, '无战斗积分时仍按自身余额判断');
});

test('重放用记账当时的战斗份：靠战斗积分买的东西，战斗份花光后仍然成立', () => {
    const { h, combat } = origin({}, 300);
    h.user('hi'); h.ai('a');
    d(h, { type: 'addShop', name: '盾', price: 250, desc: '', effect: '' });
    assert.equal(d(h, { type: 'buy', name: '盾' }).ok, true);
    combat.raw = 0;
    h.user('go'); h.ai('b');
    assert.deepEqual(h.state().skipped, [], '购买不会被判积分不够而跳过');
    assert.equal(h.bag()['盾'], 1);
    assert.equal(h.engine.rawPoints(), -250);
    assert.equal(h.state().points, -250, '战斗份已花掉，合计按当前战斗份显示');
    h.reopen();
    assert.equal(h.bag()['盾'], 1, '存档重开后仍成立');
    assert.equal(h.engine.rawPoints(), -250);
});

test('balance 同步用记账当时的战斗份：之后战斗份变化，原始积分不漂移', () => {
    const { h, combat } = origin({}, 300);
    h.user('hi'); h.ai('a' + blk('积分：500'));
    assert.equal(h.engine.rawPoints(), 200);
    combat.raw = 50;
    h.user('go'); h.ai('b');
    assert.equal(h.engine.rawPoints(), 200, '原始积分不随战斗份漂移');
    assert.equal(h.state().points, 250);
    h.reopen();
    assert.equal(h.engine.rawPoints(), 200);
});

test('重算同一楼沿用旧快照；旧档没有 extra 字段时退回当前战斗份', () => {
    const { h, combat } = origin({}, 300);
    h.user('hi'); const i = h.ai('a' + blk('积分：500'));
    // 改正文触发同楼重算，战斗份已变，快照仍是 300
    combat.raw = 0;
    h.ctx.chat[i].mes = 'a' + blk('积分：500') + '。';
    h.emit('msg_edited', i);
    assert.equal(h.engine.rawPoints(), 200, '重算沿用旧快照 300');
    // 旧档：抹掉 extra 字段后重开，按当前战斗份（0）重放
    const saved = JSON.parse(JSON.stringify(h.ctx.chatMetadata));
    const key = Object.keys(saved)[0];
    for (const e of saved[key].entries) delete e.extra;
    for (const o of saved[key].ops) delete o.extra;
    h.ctx.chatMetadata = saved;
    h.engine.stop();
    h.reopen();
    assert.equal(h.engine.rawPoints(), 500, '无快照退回当前战斗份 0');
});

// ---------- 流水合并 ----------
const atk = (id) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] });
const grd = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const STARTER = ['basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend', 'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2'];
const clsDef = (id) => ({
    kind: 'class', id, className: id === 'cls-mage' ? '术士' : '剑士', archetype: 'warrior',
    classPassive: { id: `p-${id}`, name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] },
    classPool: [1, 2, 5, 6].map((n) => atk(`c${n}`)).concat([3, 4, 7, 8].map((n) => grd(`c${n}`))),
});
const heroDefn = () => ({
    kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
    personalPassive: { id: 'pp-pc-hero', name: '意志', trigger: 'on-low-hp', effects: [{ op: 'block', amount: 6 }] },
    personalPool: [atk('m1'), grd('m2'), atk('m3'), grd('m4')], starterDeck: [...STARTER],
});
const rowOf = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });
const cl = (v) => JSON.parse(JSON.stringify(v));
function memTables(profile) {
    const t = { profile: [...profile], ledger: [] };
    t.read = () => ({ ok: true, missing: [], diagnostics: [], profile: cl(t.profile), ledger: cl(t.ledger) });
    t.append = async (kind, records) => {
        const written = [];
        for (const r of records) if (!t[kind].some((x) => x.id === r.id)) { t[kind].push(cl(r)); written.push(r.id); }
        return { ok: true, written, present: [], rejected: [], pending: [] };
    };
    return t;
}

test('战斗账本给出主角积分流水：累加等于原始积分，且只读', async () => {
    const wallet = { v: 150 };
    const tables = memTables([rowOf(clsDef('cls-blade'), 1), rowOf(clsDef('cls-mage'), 2), rowOf(heroDefn(), 3)]);
    const ledger = createCombatLedger({ tables, chat: () => [{ mes: '出发', is_user: true }], userName: '主角', now: () => 7, wallet: () => wallet.v });
    assert.deepEqual([...heroPointLog(await ledger.effectiveState({ raw: true }))], []);
    assert.equal((await ledger.respecClass('pc-hero', 'cls-mage')).ok, true);
    const raw = await ledger.effectiveState({ raw: true });
    const plog = heroPointLog(raw);
    assert.equal(plog.length, 1);
    assert.equal(plog[0].reason, '转职');
    assert.equal(plog.reduce((a, r) => a + r.delta, 0), raw.characters.get('pc-hero').points);
});

test('合并流水按楼号排序，战斗行标「战斗」；累加等于合计余额的变化', () => {
    const { h, combat } = origin({}, 0);
    const log = [{ floor: 3, delta: -100, reason: '转职' }, { floor: 1, delta: 80, reason: '出售' }];
    h.host.extraPointLog = () => log;
    h.user('u'); h.ai('a' + blk('积分|+30|奖励')); // 楼 1
    h.user('u'); h.ai('b' + blk('积分|+20|奖励')); // 楼 3
    combat.raw = log.reduce((a, r) => a + r.delta, 0); // -20
    const rows = h.state().log;
    const floors = rows.map((r) => r.floor);
    assert.deepEqual(floors, [...floors].sort((a, b) => a - b), '按楼号排序');
    const fight = rows.filter((r) => r.mark === '战斗');
    assert.deepEqual(fight.map((r) => r.text), ['出售 +80', '转职 -100']);
    // 流水里的数字能对上合计：随身系统 +50，战斗 -20，合计 30
    assert.equal(h.engine.rawPoints() + log.reduce((a, r) => a + r.delta, 0), h.state().points);
    assert.equal(h.state().points, 30);
});

test('战斗关闭（无流水）时记录与原来一致，存档不含战斗行', () => {
    const { h } = origin({}, 0);
    h.user('u'); h.ai('a' + blk('积分|+30|奖励'));
    const before = JSON.stringify(h.state().log);
    h.host.extraPointLog = () => null;
    assert.equal(JSON.stringify(h.state().log), before);
    h.host.extraPointLog = () => [{ floor: 1, delta: 5, reason: '出售' }];
    assert.ok(h.state().log.some((r) => r.mark === '战斗'));
    assert.ok(!JSON.stringify(h.ctx.chatMetadata).includes('出售'), '战斗流水不写进随身系统存档');
});
