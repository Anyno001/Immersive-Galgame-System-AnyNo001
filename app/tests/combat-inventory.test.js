import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatLedger, CONSUME_TAG_HASH } from '../src/combat/ledger.js';
import { heroInventoryView } from '../src/combat/inventory-view.js';
import { gearIdFor, itemIdFor, ledgerEntryId } from '../src/combat/schema.js';
import { sellPrice } from '../src/combat/points.js';
import { normalizeItemName } from '../src/data/shujuku/item-catalog.js';
import { scanCombatTags } from '../src/scene/combat-directives.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const attack = (id) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] });
const guard = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const passive = (id, trigger = 'battle-start') => ({ id, name: '被动', trigger, effects: [{ op: 'block', amount: 2 }] });
const STARTER = [
    'basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend',
    'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2',
];
const classDef = { kind: 'class', id: 'cls-blade', className: '剑士', archetype: 'warrior', classPassive: passive('p-edge'),
    classPool: [1, 2, 5, 6].map((n) => attack(`c${n}`)).concat([3, 4, 7, 8].map((n) => guard(`c${n}`))) };
const heroDef = { kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
    personalPassive: passive('p-will', 'on-low-hp'), personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')], starterDeck: [...STARTER] };
const row = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });
const POTION = [{ op: 'heal', amount: 12, target: 'self' }];

// 内存版战斗表：按记录 ID 幂等，已有时回 present。
function memoryTables(profile) {
    const t = { profile: clone(profile), ledger: [] };
    t.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(t.profile), ledger: clone(t.ledger) });
    t.append = async (kind, records) => {
        const written = [];
        const present = [];
        for (const r of records) {
            if (t[kind].some((x) => x.id === r.id)) present.push(r.id);
            else { t[kind].push(clone(r)); written.push(r.id); }
        }
        return { ok: true, written, present, rejected: [], pending: [] };
    };
    return t;
}

// 内存版背包（read 形状与 inventory-tables.read() 一致）：failChange 时数量写入失败、不改表。
function memoryInventory() {
    const inv = { items: [], gear: [], failChange: false, failEnsure: '', ensureCalls: 0 };
    const key = normalizeItemName;
    // 与 inventory-tables.ensure() 同形：已接管时无改动；failEnsure 模拟模板导入失败。
    inv.ensure = async () => { inv.ensureCalls += 1; return inv.failEnsure ? { ok: false, reason: inv.failEnsure } : { ok: true, changes: [] }; };
    inv.read = () => ({ ok: true,
        inventory: { name: '背包物品表', items: inv.items.map((i, n) => ({ rowIndex: n + 1, name: i.name, key: key(i.name), quantity: i.quantity, description: i.description || '', category: i.category || '' })) },
        gear: { name: 'IGS战斗·装配', rows: inv.gear.map((r, n) => ({ rowIndex: n + 1, name: r.name, key: key(r.name), category: r.category, rarity: r.rarity, slot: r.slot, equipped: r.equipped, definition: clone(r.definition) })) },
        diagnostics: [] });
    inv.setGearRow = async (name, record) => {
        inv.gear = inv.gear.filter((r) => key(r.name) !== key(name));
        if (record) inv.gear.push({ name, ...clone(record) });
        return { ok: true, changed: true };
    };
    inv.changeQuantities = async (changes) => {
        if (inv.failChange) return { ok: false, reason: 'inventory-write-failed', applied: [] };
        const applied = [];
        for (const c of changes) {
            const cur = inv.items.find((i) => key(i.name) === key(c.name));
            const before = cur ? cur.quantity : 0;
            const next = before + c.delta;
            if (next < 0) return { ok: false, reason: 'inventory-quantity-insufficient', applied };
            if (!cur) inv.items.push({ name: c.name, quantity: next, description: c.description, category: c.category });
            else if (next === 0) inv.items = inv.items.filter((i) => i !== cur);
            else cur.quantity = next;
            applied.push({ name: c.name, before, after: next });
        }
        return { ok: true, applied };
    };
    inv.qty = (name) => inv.items.find((i) => key(i.name) === key(name))?.quantity ?? 0;
    return inv;
}

const TAGS = '得到丹药。[igs-combat:item|我|回春丹|2]';
function harness() {
    const h = { chat: [{ mes: '出发', is_user: true }, { mes: TAGS, swipe_id: 0, is_user: false }] };
    h.tables = memoryTables([row(classDef, 1), row(heroDef, 2)]);
    h.inv = memoryInventory();
    h.ledger = createCombatLedger({ tables: h.tables, chat: () => h.chat, userName: '主角', now: () => 5, inventory: h.inv });
    h.hero = async () => (await h.ledger.effectiveState()).characters.get('pc-hero');
    const [tag] = scanCombatTags(TAGS);
    h.itemEntry = () => {
        const anchor = { messageId: 1, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId('item', 'pc-hero', anchor), type: 'item', character: 'pc-hero', anchor, payload: { itemId: itemIdFor('回春丹'), name: '回春丹', count: 2, effects: POTION, description: '' }, createdAt: 3 };
    };
    h.consume = (count, occurrence = 0) => {
        const anchor = { messageId: 1, swipeId: 0, tagHash: CONSUME_TAG_HASH, occurrence };
        return { id: ledgerEntryId('consume', 'pc-hero', anchor), type: 'consume', character: 'pc-hero', anchor, payload: { itemId: itemIdFor('回春丹'), count, reportId: '' }, createdAt: 4 };
    };
    return h;
}


test('主角背包：获得先写日志标记再改物品表，重复入账幂等；消耗扣物品表，超过余量跳过不写', async () => {
    const h = harness();
    const first = await h.ledger.append([h.itemEntry()]);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(h.inv.qty('回春丹'), 2);
    assert.equal(h.tables.ledger.filter((e) => e.type === 'item').length, 1);
    assert.equal(h.inv.gear.find((r) => r.name === '回春丹').definition.kind, 'item');
    assert.deepEqual((await h.hero()).items.map((i) => [i.itemId, i.count]), [[itemIdFor('回春丹'), 2]]);
    const again = await h.ledger.append([h.itemEntry()]);
    assert.deepEqual([again.ok, again.present, h.inv.qty('回春丹')], [true, [h.itemEntry().id], 2]);
    assert.equal((await h.ledger.append([h.consume(1)])).ok, true);
    assert.equal(h.inv.qty('回春丹'), 1);
    const short = await h.ledger.append([h.consume(5, 1)]);
    assert.deepEqual([short.ok, short.stock[0].skipped, short.stock[0].reason, h.inv.qty('回春丹')], [true, true, 'combat-item-insufficient', 1]);
    assert.equal(h.tables.ledger.some((e) => e.id === h.consume(5, 1).id), false);
    assert.equal((await h.ledger.append([h.consume(1, 2)])).ok, true);
    assert.equal(h.inv.qty('回春丹'), 0);
    assert.equal(h.inv.gear.some((r) => r.name === '回春丹'), false);
});

test('主角背包：每次写入前先经 inventory.ensure 接管物品表；接管失败时不写日志标记、不改物品表与装配表', async () => {
    const h = harness();
    h.inv.failEnsure = 'inventory-template-import-failed';
    const blocked = await h.ledger.append([h.itemEntry()]);
    assert.deepEqual([blocked.ok, blocked.reason, h.inv.ensureCalls], [false, 'inventory-template-import-failed', 1]);
    assert.deepEqual([h.inv.qty('回春丹'), h.inv.gear.length, h.tables.ledger.length], [0, 0, 0]);
    h.inv.failEnsure = '';
    assert.equal((await h.ledger.append([h.itemEntry()])).ok, true);
    assert.deepEqual([h.inv.qty('回春丹'), h.inv.ensureCalls], [2, 2]);
});

test('主角背包：数量写失败时撤销已入账标记，补扫重新列出该标签，重试以「基础ID|r1」入账一次', async () => {
    const h = harness();
    const id = h.itemEntry().id;
    h.inv.failChange = true;
    const failed = await h.ledger.append([h.itemEntry()]);
    assert.equal(failed.ok, false);
    assert.equal(h.inv.qty('回春丹'), 0);
    assert.deepEqual(h.tables.ledger.filter((e) => e.type === 'revoke').map((e) => e.payload.targetEntryId), [id]);
    const rescan = await h.ledger.scan();
    assert.deepEqual(rescan.pendingGeneration.map((p) => [p.kind, p.name]), [['item', '回春丹']]);
    h.inv.failChange = false;
    const retry = await h.ledger.append([h.itemEntry()]);
    assert.equal(retry.ok, true, JSON.stringify(retry));
    assert.deepEqual(retry.written, [`${id}|r1`]);
    assert.equal(h.inv.qty('回春丹'), 2);
    assert.deepEqual((await h.ledger.scan()).pendingGeneration, []);
    assert.deepEqual((await h.ledger.append([h.itemEntry()])).present, [`${id}|r1`]);
    assert.equal(h.inv.qty('回春丹'), 2);
});

test('主角背包：杂物同名叠数量，卖出物品表减一并按稀有度记积分；物品表读失败时不写标记', async () => {
    const h = harness();
    h.inv.items.push({ name: '褪色的发绳', quantity: 2 });
    h.inv.gear.push({ name: '褪色的发绳', category: '杂物', rarity: '史诗', slot: '', equipped: false, definition: { kind: 'keepsake', origin: '狼窝里捡到', rarity: 'epic' } });
    const id = itemIdFor('褪色的发绳');
    assert.deepEqual((await h.hero()).collection.map((k) => [k.itemId, k.count, k.rarity]), [[id, 2, 'epic']]);
    const sold = await h.ledger.sellKeepsake(id);
    assert.equal(sold.ok, true, JSON.stringify(sold));
    assert.equal(sold.price, sellPrice('epic', id));
    assert.deepEqual(sold.entry.payload, { itemId: id, rarity: 'epic' });
    assert.equal(h.inv.qty('褪色的发绳'), 1);
    assert.equal((await h.hero()).points, sold.price);
    h.inv.read = () => ({ ok: false, reason: 'inventory-table-read-failed' });
    const blocked = await h.ledger.append([h.itemEntry()]);
    assert.deepEqual([blocked.ok, blocked.reason], [false, 'inventory-table-read-failed']);
    assert.equal(h.tables.ledger.some((e) => e.type === 'item'), false);
});

test('主角背包：面板换装只改装配表穿戴状态，不改数量；加成随穿戴计入属性', async () => {
    const h = harness();
    h.inv.items.push({ name: '铜戒', quantity: 1 });
    h.inv.gear.push({ name: '铜戒', category: '装备', rarity: '罕见', slot: '饰品', equipped: false, definition: { kind: 'gear', slot: 'accessory', description: '', rarity: 'uncommon', bonus: { ability: 'con', amount: 2 } } });
    const gearId = gearIdFor('铜戒');
    const base = (await h.hero()).attributes.scores.con;
    assert.deepEqual((await h.hero()).gear.bag.map((g) => g.gearId), [gearId]);
    const on = await h.ledger.setGear('pc-hero', gearId, true);
    assert.equal(on.ok, true, JSON.stringify(on));
    const worn = await h.hero();
    assert.equal(worn.gear.slots.accessory?.name, '铜戒');
    assert.equal(worn.gear.bag.length, 0);
    assert.ok(worn.attributes.scores.con > base);
    assert.equal(h.inv.qty('铜戒'), 1);
    assert.equal((await h.ledger.setGear('pc-hero', gearId, false)).ok, true);
    const off = await h.hero();
    assert.deepEqual([off.gear.slots.accessory, off.gear.bag.length, off.attributes.scores.con], [undefined, 1, base]);
});

test('heroInventoryView：同部位多件标记装备时只认先出现的一件并记诊断；没有装配定义的物品归入 others', () => {
    const def = (rarity) => ({ kind: 'gear', slot: 'weapon', description: '', rarity, bonus: { ability: 'con', amount: 1 } });
    const gearRow = (name, n) => ({ rowIndex: n, name, key: normalizeItemName(name), equipped: true, definition: def('common') });
    const item = (name, n, quantity = 1) => ({ rowIndex: n, name, key: normalizeItemName(name), quantity, description: '', category: '' });
    const view = heroInventoryView({ ok: true, inventory: { items: [item('甲剑', 1), item('乙剑', 2), item('钥匙', 3)] }, gear: { rows: [gearRow('甲剑', 1), gearRow('乙剑', 2)] }, diagnostics: [] });
    assert.equal(view.gear.slots.weapon.name, '甲剑');
    assert.deepEqual(view.gear.bag.map((g) => g.name), ['乙剑']);
    assert.ok(view.diagnostics.some((d) => d.code === 'gear-slot-conflict' && d.name === '乙剑'));
    assert.deepEqual(view.others.map((o) => o.name), ['钥匙']);
    assert.equal(heroInventoryView({ ok: false, reason: 'inventory-table-missing' }).ok, false);
});


test('场外使用（P7c）：回复道具数量减一并恢复主角伤势；纯战斗道具与满血时拒绝、不改表；扣数量失败时撤销回血', async () => {
    const h = harness();
    assert.equal((await h.ledger.append([h.itemEntry()])).ok, true);
    h.inv.items.push({ name: '爆炎符', quantity: 1 });
    h.inv.gear.push({ name: '爆炎符', category: '消耗品', rarity: '', slot: '', equipped: false, definition: { kind: 'item', effects: [{ op: 'damage', amount: 6 }], description: '' } });
    const potion = itemIdFor('回春丹');
    const fire = itemIdFor('爆炎符');
    assert.equal((await h.ledger.useItem(potion)).reason, 'combat-use-full-hp');
    h.chat.push({ mes: '被划了一刀。[igs-stat:hurt|重伤]', swipe_id: 0, is_user: false });
    assert.equal((await h.ledger.scanLife()).ok, true);
    const hurt = (await h.hero()).wound;
    assert.ok(hurt && hurt.hp < hurt.maxHp, JSON.stringify(hurt));
    assert.equal((await h.ledger.useItem(fire)).reason, 'combat-use-battle-only');
    assert.equal(h.inv.qty('爆炎符'), 1);
    const before = h.tables.ledger.length;
    h.inv.failChange = true;
    const failed = await h.ledger.useItem(potion, { messageId: 2 });
    assert.equal(failed.ok, false);
    assert.equal(failed.revoked, true);
    assert.equal(h.inv.qty('回春丹'), 2);
    assert.deepEqual((await h.hero()).wound, hurt);
    assert.ok(h.tables.ledger.length > before);
    h.inv.failChange = false;
    const used = await h.ledger.useItem(potion, { messageId: 2 });
    assert.equal(used.ok, true, JSON.stringify(used));
    assert.equal(h.inv.qty('回春丹'), 1);
    const healed = (await h.hero()).wound;
    assert.ok(healed === null || healed.hp > hurt.hp, JSON.stringify(healed));
});


test('正文获得装备（N5）：部位空着时自动装上，已穿着别的装备时只进背包不顶替；剧情杂物数量 +1 并写杂物定义', async () => {
    const { stockPlan } = await import('../src/combat/inventory-writes.js');
    const empty = { gear: { slots: {}, bag: [] }, items: [], collection: [], others: [] };
    const equip = (name) => ({ type: 'equip', anchor: { tagHash: 'tagx' }, payload: { gearId: gearIdFor(name), name, slot: 'weapon', description: '', rarity: 'rare', bonus: { ability: 'str', amount: 3 } } });
    const first = stockPlan(equip('青锋剑'), empty, { panelTag: 'gear' });
    assert.deepEqual([first.rows[0].record.equipped, first.changes.map((c) => c.delta), first.after], [true, [1], []]);
    const worn = { ...empty, gear: { slots: { weapon: { gearId: gearIdFor('青锋剑'), name: '青锋剑', slot: 'weapon' } }, bag: [] } };
    const second = stockPlan(equip('玄铁剑'), worn, { panelTag: 'gear' });
    assert.deepEqual([second.rows.map((r) => [r.name, r.record.equipped]), second.changes.map((c) => c.delta), second.after], [[['玄铁剑', false]], [1], []]);
    const again = stockPlan(equip('青锋剑'), worn, { panelTag: 'gear' });
    assert.deepEqual([again.rows[0].record.equipped, again.changes], [true, []]);
    const keep = stockPlan({ type: 'keepsake', payload: { itemId: itemIdFor('旧发绳'), name: '旧发绳', origin: '母亲留下的', rarity: 'uncommon' } }, empty);
    assert.deepEqual([keep.rows[0].record.definition, keep.changes], [{ kind: 'keepsake', origin: '母亲留下的', rarity: 'uncommon' }, [{ name: '旧发绳', delta: 1, description: '母亲留下的', category: '杂物' }]]);
});

test('统一获得物端到端：扫描到「杂物」获得标签时写 keepsake 标记并经物品表 +1，补扫幂等；换 swipe 后标记失效', async () => {
    const h = harness();
    h.chat[1] = { mes: '顺手捡起一根发绳。\n[igs-fx:item|获得|旧发绳|母亲留下的|杂物]', swipe_id: 0, is_user: false };
    await h.ledger.scan();
    assert.equal(h.inv.qty('旧发绳'), 1);
    assert.equal(h.inv.gear.find((r) => r.name === '旧发绳').definition.kind, 'keepsake');
    assert.deepEqual(h.tables.ledger.filter((e) => e.type === 'keepsake').map((e) => [e.character, e.payload.name]), [['pc-hero', '旧发绳']]);
    assert.deepEqual((await h.hero()).collection.map((k) => [k.name, k.count]), [['旧发绳', 1]]);
    await h.ledger.scan();
    assert.equal(h.inv.qty('旧发绳'), 1);
    h.chat[1] = { ...h.chat[1], swipe_id: 1 };
    const state = await h.ledger.effectiveState();
    assert.deepEqual(state.inactive.filter((x) => x.id.startsWith('keepsake|')).map((x) => x.reason), ['swipe-changed']);
});

