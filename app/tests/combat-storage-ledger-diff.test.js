// 差分测试：inventory-tables、combat/ledger 与 v0.39 原包同操作同结果，并统计整表读取次数。
// 两个世界各有一份内存版数据库插件：原包用原版 client（每次读都整表导出），
// 改写版用共用的缓存 client + 账本记忆化。写入表的行、各操作的返回值、effectiveState 必须完全一致。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createCachedTableClient, createCombatTables } from '../src/data/shujuku/combat-tables.js';
import * as mineInventory from '../src/data/shujuku/inventory-tables.js';
import * as mineLedger from '../src/combat/ledger.js';
import { gearIdFor, itemIdFor, ledgerEntryId } from '../src/combat/schema.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';

globalThis.window = globalThis.window || { IGS_AUTO_BOOTSTRAP: false };
globalThis.window.IGS_AUTO_BOOTSTRAP = false;
const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = (path) => globalThis.__igsRequire(path);
const oTables = orig('src/data/shujuku/combat-tables.js');
const oInventory = orig('src/data/shujuku/inventory-tables.js');
const oLedger = orig('src/combat/ledger.js');

const clone = (value) => JSON.parse(JSON.stringify(value));
const NOW = 1700000000000;
const HERO = '艾拉';

// ---- 档案夹具 ----
const card = (id, extra = {}) => ({ id, name: `牌${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6, hits: 1 }], ...extra });
const passive = (id) => ({ id, name: `被${id}`, trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }], description: 'd' });
const pool = (n, rarity, prefix) => Array.from({ length: n }, (_, i) => card(`${prefix}${i}`, { rarity, effects: [{ op: 'damage', amount: [3, 6, 10][i % 3] }], cost: i % 3 }));
const classProfile = { kind: 'class', v: 1, id: 'cls-1', className: '剑士', archetype: 'warrior', classPassive: passive('cp'), classPool: pool(8, 'common', 'c') };
const deckProfile = {
    kind: 'deck-character', v: 1, id: 'pc-1', name: HERO, aliases: ['艾'], classRef: 'cls-1',
    base: { hp: 80, energy: 3, draw: 5, speed: 100 }, growth: { hpPerLevel: 4 },
    personalPassive: passive('pp'), personalPool: pool(4, 'personal', 'p'),
    starterDeck: [...Array(3).fill('basic-strike'), ...Array(3).fill('basic-defend'), 'c0', 'c0', 'c1', 'c1', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'c5', 'p0', 'p1', 'p2', 'p3'].slice(0, 20),
    heroSkill: { id: 'hs', name: '英雄技', effects: [{ op: 'damage', amount: 14 }], description: 'x' },
    signatureCards: [],
};
const profileRow = (profile) => ({ id: profile.id, name: profile.name || profile.className, kind: profile.kind, className: profile.className || '', version: 1, createdAt: 10, definition: profile });

// ---- 世界：原包 / 改写版 ----
function seedHost(host) {
    host.sheets.sheet_userbag = userInventorySheet();
}

function makeOriginalWorld(chat) {
    const host = createLedgerMockHost();
    seedHost(host);
    const tables = oTables.createCombatTables({ api: host.api });
    const inventory = oInventory.createInventoryTables({ api: host.api, serial: tables.serial });
    const ledger = oLedger.createCombatLedger({ tables, chat: () => chat, userName: HERO, difficulty: 'normal', now: () => NOW, inventory });
    return { host, tables, inventory, ledger, chat, lib: oLedger };
}

function makeMineWorld(chat) {
    const host = createLedgerMockHost();
    seedHost(host);
    const client = createCachedTableClient({ api: host.api });
    const tables = createCombatTables({ api: host.api, client });
    const inventory = mineInventory.createInventoryTables({ api: host.api, client, serial: tables.serial });
    const ledger = mineLedger.createCombatLedger({ tables, chat: () => chat, userName: HERO, difficulty: 'normal', now: () => NOW, inventory });
    return { host, tables, inventory, ledger, chat, lib: mineLedger };
}

const baseChat = () => [
    { is_user: true, mes: '出发吧', swipe_id: 0 },
    {
        is_user: false, swipe_id: 0,
        mes: '她击败了哥布林。\n[igs-combat:exp|艾拉|30|击败哥布林]\n[igs-combat:equip|艾拉|铁剑|武器|锋利|稀有]\n[igs-combat:item|艾拉|药水|2|回血|普通]\n[igs-combat:learn|艾拉|火球术|范围伤害|rare]',
    },
    { is_user: true, mes: '继续', swipe_id: 0 },
    { is_user: false, swipe_id: 0, mes: '路上很平静。\n[igs-stat:hurt|轻伤]' },
];

// 把待生成标签补成账本记录（装备/物品/学习），两个世界用同样的载荷。
function generatedEntries(world, pending, heroId) {
    const entries = [];
    for (const item of pending) {
        const anchor = item.anchor;
        if (item.kind === 'equip') {
            entries.push({ id: ledgerEntryId('equip', heroId, anchor), type: 'equip', character: heroId, anchor, createdAt: NOW, payload: { gearId: gearIdFor('铁剑'), name: '铁剑', slot: 'weapon', description: '锋利', rarity: 'rare' } });
        } else if (item.kind === 'item') {
            entries.push({ id: ledgerEntryId('item', heroId, anchor), type: 'item', character: heroId, anchor, createdAt: NOW, payload: { itemId: itemIdFor('药水'), name: '药水', count: 2, effects: [{ op: 'heal', amount: 10 }], description: '回血' } });
        } else if (item.kind === 'learn') {
            entries.push({ id: ledgerEntryId('learn', heroId, anchor), type: 'learn', character: heroId, anchor, createdAt: NOW, payload: { card: card('lc1', { name: '火球术', rarity: 'rare', effects: [{ op: 'damage', amount: 8, hits: 1 }] }) } });
        }
    }
    return entries;
}

// 操作序列：每步返回要比较的结果。读类操作单独标注，便于统计读取次数。
const operations = [
    ['ensure 战斗表', async (w) => w.tables.ensure()],
    ['ensure 背包表', async (w) => w.inventory.ensure()],
    ['写入档案', async (w) => w.tables.append('profile', [profileRow(classProfile), profileRow(deckProfile)].map(clone))],
    ['effectiveState#1', async (w) => w.ledger.effectiveState()],
    ['effectiveState#2（无变化）', async (w) => w.ledger.effectiveState()],
    ['effectiveState#3（无变化）', async (w) => w.ledger.effectiveState()],
    ['scan 写 exp', async (w) => { const r = await w.ledger.scan(); w.pending = r.pendingGeneration; return r; }],
    ['写入 equip/item/learn', async (w) => {
        const state = await w.ledger.effectiveState();
        w.heroId = state.attributes.heroId;
        return w.ledger.append(generatedEntries(w, w.pending, w.heroId));
    }],
    ['effectiveState#4', async (w) => w.ledger.effectiveState()],
    ['effectiveState#5（无变化）', async (w) => w.ledger.effectiveState()],
    ['scanLife 写 hurt', async (w) => w.ledger.scanLife()],
    ['useItem 使用药水', async (w) => w.ledger.useItem(itemIdFor('药水'))],
    ['setGear 卸下', async (w) => w.ledger.setGear(w.heroId, gearIdFor('铁剑'), false)],
    ['setGear 装上', async (w) => w.ledger.setGear(w.heroId, gearIdFor('铁剑'), true)],
    ['saveDeck', async (w) => w.ledger.saveDeck(w.heroId, deckProfile.starterDeck.slice(0, 18))],
    ['effectiveState#6', async (w) => w.ledger.effectiveState()],
    ['切 swipe（exp 失效）', async (w) => { w.chat[1].swipe_id = 1; return w.ledger.effectiveState(); }],
    ['切回 swipe', async (w) => { w.chat[1].swipe_id = 0; return w.ledger.effectiveState(); }],
    ['改正文（标签消失）', async (w) => { w.saved = w.chat[1].mes; w.chat[1].mes = '她击败了哥布林。'; return w.ledger.effectiveState(); }],
    ['恢复正文', async (w) => { w.chat[1].mes = w.saved; return w.ledger.effectiveState(); }],
    ['删最后两楼', async (w) => { w.removed = w.chat.splice(2, 2); return w.ledger.effectiveState(); }],
    ['恢复楼层', async (w) => { w.chat.push(...w.removed); return w.ledger.effectiveState(); }],
    ['sellGear', async (w) => w.ledger.sellGear(gearIdFor('铁剑'))],
    ['effectiveState#7', async (w) => w.ledger.effectiveState()],
    ['read', async (w) => w.ledger.read()],
];

const sheetRows = (host) => Object.fromEntries(Object.values(host.sheets).map((sheet) => [sheet.name, clone(sheet.content)]));

test('账本与背包：与 v0.39 同操作同结果，整表读取次数不增', async () => {
    const worldO = makeOriginalWorld(baseChat());
    const worldM = makeMineWorld(baseChat());
    const table = [];
    for (const [name, run] of operations) {
        const beforeO = worldO.host.calls.exportTableAsJson;
        const beforeM = worldM.host.calls.exportTableAsJson;
        const resultO = await run(worldO);
        const resultM = await run(worldM);
        assert.deepEqual(resultM, resultO, `${name}：返回值不一致`);
        assert.deepEqual(sheetRows(worldM.host), sheetRows(worldO.host), `${name}：写入表的行不一致`);
        table.push({ 操作: name, 原包读表: worldO.host.calls.exportTableAsJson - beforeO, 改写读表: worldM.host.calls.exportTableAsJson - beforeM });
    }
    // 业务确实发生了：exp / equip / item / learn / hurt 都写进了账本表
    const ledgerRows = worldM.host.sheets.sheet_igscbledger.content.length - 1;
    assert.ok(ledgerRows >= 6, `账本行数过少：${ledgerRows}`);
    const totalO = worldO.host.calls.exportTableAsJson;
    const totalM = worldM.host.calls.exportTableAsJson;
    console.table([...table, { 操作: '合计', 原包读表: totalO, 改写读表: totalM }]);
    assert.ok(totalM < totalO, `读表次数应减少：原包 ${totalO}，改写 ${totalM}`);
    for (const row of table) assert.ok(row.改写读表 <= row.原包读表, `${row.操作}：改写版读表更多`);
    // 写入调用次数一致（只是读法变了）
    assert.equal(worldM.host.calls.insertRow, worldO.host.calls.insertRow);
    assert.equal(worldM.host.calls.updateRow, worldO.host.calls.updateRow);
    assert.equal(worldM.host.calls.deleteRow, worldO.host.calls.deleteRow);
});

test('readInventoryTables：与原包同结果，同一份导出数据只解析一次', async () => {
    const worldO = makeOriginalWorld(baseChat());
    const worldM = makeMineWorld(baseChat());
    for (const world of [worldO, worldM]) {
        await world.tables.ensure();
        await world.inventory.ensure();
        await world.inventory.changeQuantities([{ name: '药水', delta: 3, description: '回血', category: '消耗品' }, { name: '绷带', delta: 1 }]);
        await world.inventory.setGearRow('铁剑', { name: '铁剑', category: '装备', rarity: 'rare', slot: 'weapon', equipped: true, definition: { kind: 'gear' } });
    }
    assert.deepEqual(sheetRows(worldM.host), sheetRows(worldO.host));
    assert.deepEqual(worldM.inventory.read(), worldO.inventory.read());
    const first = mineInventory.readInventoryTables(worldM.inventory.client);
    const second = mineInventory.readInventoryTables(worldM.inventory.client);
    assert.equal(first.tables, second.tables, '同一份导出数据应复用解析结果');
    assert.deepEqual(first.inventory.items, second.inventory.items);
    assert.notEqual(first.inventory.items, second.inventory.items, '条目数组每次重新生成');
    // 数量不足、不存在、非法变化的失败结果与原包一致
    for (const changes of [[{ name: '药水', delta: -99 }], [{ name: '不存在', delta: -1 }], [{ name: '', delta: 1 }], [{ name: '药水', delta: 0 }]]) {
        assert.deepEqual(await worldM.inventory.changeQuantities(changes), await worldO.inventory.changeQuantities(changes));
    }
    // 整表删除到 0
    assert.deepEqual(await worldM.inventory.changeQuantities([{ name: '绷带', delta: -1 }]), await worldO.inventory.changeQuantities([{ name: '绷带', delta: -1 }]));
    assert.deepEqual(await worldM.inventory.setGearRow('铁剑', null), await worldO.inventory.setGearRow('铁剑', null));
    assert.deepEqual(sheetRows(worldM.host), sheetRows(worldO.host));
});

test('locateInventoryTable / appendDdlColumns / planInventoryTemplate 与原包一致', () => {
    const tableCases = [
        [],
        [{ name: '背包物品表', columns: ['物品名称', '数量'], rows: [] }],
        [{ name: '背包物品表', columns: ['物品名称', '数量'], rows: [] }, { name: '道具栏', columns: ['名称', '个数'], rows: [] }],
        [{ name: 'IGS背包', columns: ['物品名称', '数量'], rows: [] }, { name: '角色表', columns: ['物品名称', '数量'], rows: [] }],
        [{ name: '物品', columns: ['名称', '数目', '效果', '分类'], rows: [] }],
    ];
    for (const tables of tableCases) assert.deepEqual(mineInventory.locateInventoryTable(tables), oInventory.locateInventoryTable(tables));
    const columns = Object.values(mineInventory.INVENTORY_ADDED_COLUMNS);
    const ddls = [
        sheetDdl(), '', 'CREATE TABLE t (a TEXT /* c */);', 'CREATE TABLE t (\n  a TEXT, -- x\n  PRIMARY KEY(a)\n);',
        'CREATE TABLE t (\n  a TEXT,\n  description TEXT\n);', 'CREATE TABLE t (\n  a TEXT -- "--" 注释\n  \n);', 'no parens',
    ];
    for (const ddl of ddls) {
        assert.equal(mineInventory.appendDdlColumns(ddl, columns), oInventory.appendDdlColumns(ddl, columns));
        assert.equal(mineInventory.appendDdlColumns(ddl, []), oInventory.appendDdlColumns(ddl, []));
    }
    const templates = [{}, { sheet_userbag: userInventorySheet() }, { sheet_x: { uid: 'sheet_x', name: '背包物品表', orderNo: 3, content: [['row_id', '物品名称']] } }];
    for (const template of templates) {
        for (const tables of [[], [{ name: '背包物品表', columns: ['row_id', '物品名称', '数量'], rows: [] }]]) {
            assert.deepEqual(mineInventory.planInventoryTemplate(clone(template), tables), oInventory.planInventoryTemplate(clone(template), tables));
        }
    }
    assert.deepEqual(mineInventory.probeInventorySupport({}), oInventory.probeInventorySupport({}));
    assert.deepEqual(mineInventory.probeInventorySupport(createLedgerMockHost().api), oInventory.probeInventorySupport(createLedgerMockHost().api));
});

function sheetDdl() {
    return userInventorySheet().sourceData.ddl;
}

test('账本记忆化：同版本只算一次，并发共用 Promise，写入后作废', async () => {
    const world = makeMineWorld(baseChat());
    await world.tables.ensure();
    await world.inventory.ensure();
    await world.tables.append('profile', [profileRow(classProfile), profileRow(deckProfile)].map(clone));
    const before = world.host.calls.exportTableAsJson;
    const states = await Promise.all(Array.from({ length: 6 }, () => world.ledger.effectiveState()));
    assert.ok(states.every((state) => state === states[0]), '并发调用应得到同一个对象');
    const stats = world.ledger.stats();
    assert.equal(stats.stateComputes, 1);
    assert.equal(stats.tableReads, 1);
    const again = await world.ledger.effectiveState();
    assert.equal(again, states[0]);
    assert.ok(world.host.calls.exportTableAsJson - before <= 2, '同版本不应反复整表导出');
    // 楼层变化（正文、swipe、数量）使重放缓存失效，但快照仍可复用
    const computes = world.ledger.stats().stateComputes;
    world.chat[1].swipe_id = 1;
    const switched = await world.ledger.effectiveState();
    assert.notEqual(switched, states[0]);
    assert.equal(world.ledger.stats().stateComputes, computes + 1);
    world.chat[1].swipe_id = 0;
    const restored = await world.ledger.effectiveState();
    assert.deepEqual(restored, states[0]);
    // 写入后快照作废
    const reads = world.ledger.stats().tableReads;
    await world.ledger.scan();
    const after = await world.ledger.effectiveState();
    assert.ok(world.ledger.stats().tableReads > reads, "写入后应重新读表");
    assert.ok(after.applied.length > states[0].applied.length, '写入的 exp 应进入有效状态');
    // 表更新事件也使缓存作废（外部改表）
    world.host.sheets.sheet_igscbledger.content.pop();
    world.tables.client.invalidate();
    const external = await world.ledger.effectiveState();
    assert.ok(external.applied.length < after.applied.length);
});

test('账本在 tables 没有版本号接口时退回不缓存，结果不变', async () => {
    const worldO = makeOriginalWorld(baseChat());
    const worldM = makeMineWorld(baseChat());
    const bare = { read: (options) => worldM.tables.read(options), append: (...args) => worldM.tables.append(...args) };
    const ledger = mineLedger.createCombatLedger({ tables: bare, chat: () => worldM.chat, userName: HERO, difficulty: 'normal', now: () => NOW, inventory: worldM.inventory });
    for (const world of [worldO, worldM]) {
        await world.tables.ensure();
        await world.inventory.ensure();
        await world.tables.append('profile', [profileRow(classProfile), profileRow(deckProfile)].map(clone));
    }
    const a = await ledger.effectiveState();
    const b = await ledger.effectiveState();
    assert.notEqual(a, b, '无版本号时不缓存');
    assert.deepEqual(a, await worldO.ledger.effectiveState());
    assert.equal(ledger.stats().stateHits, 0);
});
