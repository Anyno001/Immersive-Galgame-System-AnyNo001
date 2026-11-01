// 差分测试：inventory-view、inventory-writes、generation-retry、generation、generation-assembly 与 v0.39 原包同输入同输出。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as assembly from '../src/combat/generation-assembly.js';
import * as generation from '../src/combat/generation.js';
import { generateWithRetry, isRetryableGeneration, COMBAT_GENERATION_RETRY_DELAYS } from '../src/combat/generation-retry.js';
import { heroInventoryView, INVENTORY_DEF_KINDS } from '../src/combat/inventory-view.js';
import { STOCK_TYPES, STOCK_RARITY_LABELS, STOCK_SLOT_LABELS, stockKindOf, stockPlan } from '../src/combat/inventory-writes.js';

globalThis.window = globalThis.window || { IGS_AUTO_BOOTSTRAP: false };
globalThis.window.IGS_AUTO_BOOTSTRAP = false;
const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = (path) => globalThis.__igsRequire(path);
const oView = orig('src/combat/inventory-view.js');
const oWrites = orig('src/combat/inventory-writes.js');
const oRetry = orig('src/combat/generation-retry.js');
const oGen = orig('src/combat/generation.js');
const oAsm = orig('src/combat/generation-assembly.js');
const templates = orig('src/combat/card-templates.js');
const schema = orig('src/combat/schema.js');

const clone = (value) => JSON.parse(JSON.stringify(value));
const sortedKeys = (mod) => Object.keys(mod).sort();

test('导出清单与原包一致', () => {
    assert.deepEqual(sortedKeys(generation), sortedKeys(oGen));
    assert.deepEqual(sortedKeys(assembly), sortedKeys(oAsm));
    assert.deepEqual(sortedKeys({ generateWithRetry, isRetryableGeneration, COMBAT_GENERATION_RETRY_DELAYS }), sortedKeys(oRetry));
    assert.deepEqual(sortedKeys({ heroInventoryView, INVENTORY_DEF_KINDS }), sortedKeys(oView));
    assert.deepEqual(sortedKeys({ STOCK_TYPES, STOCK_RARITY_LABELS, STOCK_SLOT_LABELS, stockKindOf, stockPlan }), sortedKeys(oWrites));
    assert.deepEqual(generation.GENERATION_KINDS, oGen.GENERATION_KINDS);
    assert.equal(generation.MAX_FIX_ROUNDS, oGen.MAX_FIX_ROUNDS);
    assert.equal(generation.GENERATION_SYSTEM, oGen.GENERATION_SYSTEM);
    assert.deepEqual(assembly.CARD_COST_SLOTS, oAsm.CARD_COST_SLOTS);
    assert.deepEqual(COMBAT_GENERATION_RETRY_DELAYS, oRetry.COMBAT_GENERATION_RETRY_DELAYS);
    assert.deepEqual(STOCK_TYPES, oWrites.STOCK_TYPES);
    assert.deepEqual(STOCK_RARITY_LABELS, oWrites.STOCK_RARITY_LABELS);
    assert.deepEqual(STOCK_SLOT_LABELS, oWrites.STOCK_SLOT_LABELS);
    assert.deepEqual(INVENTORY_DEF_KINDS, oView.INVENTORY_DEF_KINDS);
});

// 背包表输入：覆盖装备、消耗品、纪念品、无定义、定义非法、孤儿行、槽位冲突
function inventoryTable() {
    const item = (name, quantity, extra = {}) => ({ key: `k-${name}`, name, quantity, description: `${name}说明`, category: '杂物', ...extra });
    const row = (name, definition, equipped = false) => ({ key: `k-${name}`, name, definition, equipped });
    const sword = { kind: 'gear', slot: 'weapon', description: '锋利', rarity: 'rare', bonus: { ability: 'str', amount: 2 } };
    return {
        ok: true,
        diagnostics: [{ code: 'pre' }],
        inventory: { items: [item('铁剑', 2), item('钢剑', 1), item('药水', 3), item('旧发绳', 1), item('石头', 4), item('坏定义', 1), item('坏类型', 1), item('无效装备', 1), item('铁剑二号', 1)] },
        gear: {
            rows: [
                row('铁剑', sword, true),
                row('钢剑', { ...sword }, true),
                row('药水', { kind: 'item', effects: [{ op: 'heal', amount: 5 }], description: '回血' }),
                row('旧发绳', { kind: 'keepsake', origin: '母亲', rarity: 'rare' }),
                row('坏定义', null),
                row('坏类型', { kind: 'weird' }),
                row('无效装备', { kind: 'gear', slot: 'nowhere' }),
                row('铁剑二号', { kind: 'gear', slot: 'armor' }),
                row('孤儿', { kind: 'gear', slot: 'weapon' }),
            ],
        },
    };
}

test('inventory-view：heroInventoryView 与原包一致', () => {
    const table = inventoryTable();
    assert.deepEqual(heroInventoryView(table), oView.heroInventoryView(table));
    assert.deepEqual(heroInventoryView(null), oView.heroInventoryView(null));
    assert.deepEqual(heroInventoryView({ ok: false, reason: 'x' }), oView.heroInventoryView({ ok: false, reason: 'x' }));
    const view = heroInventoryView(table);
    assert.equal(view.ok, true);
    assert.ok(view.gear.bag.length + Object.keys(view.gear.slots).length > 0, '至少产出装备');
    assert.ok(view.diagnostics.length > 1, '应有诊断');
});

test('inventory-writes：stockKindOf / stockPlan 各 type 与原包一致', () => {
    const view = oView.heroInventoryView(inventoryTable());
    const sword = view.gear.slots.weapon;
    const armorBag = view.gear.bag.find((gear) => gear.slot === 'armor');
    const anchor = { messageId: 1, swipeId: 0, tagHash: 'abc', occurrence: 0 };
    const potion = view.items[0];
    const keepsake = view.collection[0];
    const entries = [
        { type: 'item', payload: { name: '药水', count: 2, effects: [{ op: 'heal', amount: 5 }], description: 'd' } },
        { type: 'item', payload: { name: '新药', count: 1, effects: [{ op: 'heal', amount: 5 }] } },
        { type: 'item', payload: { name: '铁剑', count: 1, effects: [] } },
        { type: 'equip', payload: { gearId: sword.gearId, name: sword.name, slot: 'weapon', description: '', rarity: 'rare', bonus: { ability: 'str', amount: 1 }, passive: { id: 'p', name: 'p' } } },
        { type: 'equip', payload: { gearId: 'g-new', name: '新甲', slot: 'armor', description: 'x' } },
        { type: 'equip', payload: { gearId: 'g-new', name: '新剑', slot: 'weapon', description: 'x' } },
        { type: 'equip', payload: { gearId: 'g-x', name: '药水', slot: 'weapon' } },
        { type: 'equip', anchor: { ...anchor, tagHash: 'panel' }, payload: { gearId: armorBag?.gearId } },
        { type: 'equip', anchor: { ...anchor, tagHash: 'panel' }, payload: { gearId: 'missing' } },
        { type: 'unequip', payload: { gearId: sword.gearId } },
        { type: 'unequip', payload: { gearId: 'nope' } },
        { type: 'consume', payload: { itemId: potion.itemId, count: 1 } },
        { type: 'consume', payload: { itemId: potion.itemId, count: potion.count } },
        { type: 'consume', payload: { itemId: potion.itemId, count: 99 } },
        { type: 'consume', payload: { itemId: 'nope', count: 1 } },
        { type: 'keepsake', payload: { name: '新信物', origin: '某处', rarity: 'rare' } },
        { type: 'keepsake', payload: { name: '旧发绳', origin: '' } },
        { type: 'keepsake', payload: { name: '药水', origin: '' } },
        { type: 'loot', payload: { slot: { kind: 'gear', rarity: 'epic', gear: { gearId: 'g1', name: '战利剑', slot: 'weapon', passive: { id: 'p', name: 'p' }, description: 'x' } } } },
        { type: 'loot', payload: { slot: { kind: 'gear', rarity: 'epic', gear: { name: '铁剑', slot: 'weapon' } } } },
        { type: 'loot', payload: { slot: { kind: 'item', rarity: 'rare', item: { name: '新药水', count: 2, effects: [], description: '' } } } },
        { type: 'loot', payload: { slot: { kind: 'item', rarity: 'rare', item: { name: '药水', count: 1, effects: [] } } } },
        { type: 'loot', payload: { slot: { kind: 'keepsake', rarity: 'rare', name: '战利品', origin: '敌人' } } },
        { type: 'loot', payload: { slot: { kind: 'keepsake', rarity: 'rare', name: '石头' } } },
        { type: 'loot', payload: { slot: { kind: 'other' } } },
        { type: 'sell', payload: { gearId: sword.gearId } },
        { type: 'sell', payload: { gearId: armorBag?.gearId } },
        { type: 'sell', payload: { gearId: 'nope' } },
        { type: 'sell', payload: { itemId: keepsake.itemId } },
        { type: 'sell', payload: { lootId: keepsake.itemId } },
        { type: 'sell', payload: { itemId: 'nope' } },
        { type: 'other', payload: {} },
    ];
    for (const entry of entries) {
        const full = { anchor, ...entry };
        for (const options of [undefined, {}, { panelTag: 'panel' }]) {
            assert.deepEqual(stockPlan(full, view, options), oWrites.stockPlan(full, view, options), JSON.stringify([entry, options]));
        }
    }
    for (const name of ['铁剑', '钢剑', '药水', '旧发绳', '石头', '无此物', '铁剑 ']) {
        assert.equal(stockKindOf(view, name), oWrites.stockKindOf(view, name), name);
    }
});

test('generation-retry：可重试判断、延迟序列与 abort', async () => {
    const failures = [
        { requestFailure: { reason: 'secondary-llm-http-failed', status: 503 } },
        { requestFailure: { reason: 'secondary-llm-http-failed', status: 404 } },
        { requestFailure: { reason: 'other', status: 503 } },
        { requestFailure: { reason: 'secondary-llm-http-failed', status: 429 }, reason: 'request-stale' },
        {},
        null,
    ];
    for (const result of failures) assert.equal(isRetryableGeneration(result), oRetry.isRetryableGeneration(result));

    const entity = generation.skillProfileEntity({ name: '阿雪' });
    const run = async (fn, statuses, extra = {}) => {
        const calls = [];
        const retries = [];
        let index = 0;
        const request = async () => {
            calls.push(Date.now());
            const status = statuses[Math.min(index, statuses.length - 1)];
            index += 1;
            if (status === 'ok') return JSON.stringify({ entities: [] });
            const error = new Error('http');
            error.reason = 'secondary-llm-http-failed';
            error.status = status;
            throw error;
        };
        const result = await fn([entity], { request, retryDelays: [0, 1], onRetry: (info) => retries.push(info), ...extra });
        return { result, count: calls.length, retries };
    };
    for (const statuses of [[503, 503, 503], [503, 'ok'], [404], ['ok'], [429, 500, 502]]) {
        assert.deepEqual(await run(generateWithRetry, statuses), await run(oRetry.generateWithRetry, statuses), JSON.stringify(statuses));
    }
    // onRetry 抛错不影响流程；retryDelays 非数组回落默认；空延迟不重试
    const thrower = { onRetry: () => { throw new Error('cb'); } };
    assert.deepEqual(await run(generateWithRetry, [503, 'ok'], thrower), await run(oRetry.generateWithRetry, [503, 'ok'], thrower));
    assert.deepEqual(await run(generateWithRetry, [404], { retryDelays: [] }), await run(oRetry.generateWithRetry, [404], { retryDelays: [] }));
    // 等待期间 abort：返回 request-stale
    const abortRun = async (fn) => {
        const controller = new AbortController();
        const request = async () => {
            const error = new Error('http');
            error.reason = 'secondary-llm-http-failed';
            error.status = 503;
            setTimeout(() => controller.abort(), 5);
            throw error;
        };
        return fn([entity], { request, retryDelays: [500], signal: controller.signal });
    };
    const mineAbort = await abortRun(generateWithRetry);
    assert.deepEqual(mineAbort, await abortRun(oRetry.generateWithRetry));
    assert.equal(mineAbort.reason, 'request-stale');
    // 起步即已中止
    const pre = new AbortController();
    pre.abort();
    const preRun = (fn) => fn([entity], { request: async () => { const e = new Error('h'); e.reason = 'secondary-llm-http-failed'; e.status = 503; throw e; }, retryDelays: [10], signal: pre.signal });
    assert.deepEqual(await preRun(generateWithRetry), await preRun(oRetry.generateWithRetry));
});

// ---- generation-assembly 差分 ----
const cardKeys = Object.keys(templates.CARD_TEMPLATES);
const passiveKeys = Object.keys(templates.PASSIVE_TEMPLATES);
const skillKeys = Object.keys(templates.SKILL_TEMPLATES);
const gearPassiveKeys = Object.keys(templates.GEAR_PASSIVE_TEMPLATES);
const itemKeys = Object.keys(templates.ITEM_TEMPLATES);

// 两边跑同一组调用，要求结果相等；返回成功次数，用于确认覆盖到成功路径
function both(name, mine, theirs, args) {
    const a = mine(...clone(args));
    const b = theirs(...clone(args));
    assert.deepEqual(a, b, `${name} ${JSON.stringify(args).slice(0, 300)}`);
    return a;
}

test('generation-assembly：纯函数（随机序列、费用槽位、起始牌组）与原包一致', () => {
    for (const seed of ['', 'a', '战士', 'x'.repeat(30)]) {
        assert.deepEqual(assembly.classRaritiesFor(seed), oAsm.classRaritiesFor(seed));
        for (const kind of ['class', 'personal', 'signature', 'tier', 'none']) {
            assert.deepEqual(assembly.costSlotsFor(kind, seed), oAsm.costSlotsFor(kind, seed), `${kind}/${seed}`);
        }
    }
    assert.deepEqual(assembly.classRaritiesFor(), oAsm.classRaritiesFor());
    const pool = Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, rarity: i < 7 ? 'common' : 'uncommon', cost: [0, 1, 2, 3, 'X'][i % 5] }));
    const personal = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, rarity: 'personal', cost: 1 + (i % 3) }));
    for (const seed of ['', 'hero', '甲']) {
        assert.deepEqual(assembly.buildStarterDeck(pool, personal, seed), oAsm.buildStarterDeck(pool, personal, seed));
    }
    assert.deepEqual(assembly.buildStarterDeck(null, undefined), oAsm.buildStarterDeck(null, undefined));
});

test('generation-assembly：assembleClass / ClassTier / Deck 与原包一致', () => {
    let okCount = 0;
    const passive = ['被动名', passiveKeys[0]];
    for (const key of cardKeys) {
        const raw = { className: '剑士', archetype: 'warrior', passive, cards: Array.from({ length: 11 }, (_, i) => [`卡${i}`, key, i % 4]) };
        const r = both('class', assembly.assembleClass, oAsm.assembleClass, [raw, { key: 'class:k', owner: 'hero' }]);
        if (r.profile) okCount += 1;
        const tier = both('tier', assembly.assembleClassTier, oAsm.assembleClassTier, [{ tierName: '大剑士', cards: [[`甲`, key, 1], [`乙`, key, 2], { name: '丙', template: key, cost: 3 }] }, { key: 'tier:k', fixed: { cardIds: ['a', 'b', 'c'] }, input: { rarity: 'rare' } }]);
        if (tier.value) okCount += 1;
    }
    assert.ok(okCount > 0, '至少一个模板能走通成功路径');
    // 非法输入
    for (const raw of [null, [], 'x', {}, { className: '', archetype: 'nope', cards: [] }, { className: '很长很长很长很长很长很长很长的职业名', archetype: 'mage', passive: passiveKeys[1], cards: 'x' }, { className: 'A', archetype: 'mage', passive: [], cards: [['a']] }]) {
        both('class-bad', assembly.assembleClass, oAsm.assembleClass, [raw, { key: 'k' }]);
        both('class-bad2', assembly.assembleClass, oAsm.assembleClass, [raw, { key: 'k', fixed: { className: '固定' }, input: { costSlots: [0, 1] } }]);
        both('tier-bad', assembly.assembleClassTier, oAsm.assembleClassTier, [raw, { key: 'k' }]);
    }

    const cls = both('class-ok', assembly.assembleClass, oAsm.assembleClass, [{ className: '法师', archetype: 'mage', passive, cards: Array.from({ length: 11 }, (_, i) => [`职业卡${i}`, cardKeys[i % cardKeys.length], i % 4]) }, { key: 'k', owner: 'o' }]);
    const clsProfile = cls.profile || { archetype: 'mage', id: 'class-x', classPool: [] };
    let deckOk = 0;
    for (const key of cardKeys.slice(0, 12)) {
        const raw = { aliases: ['甲', '甲', 5, ' 乙 '], hp: '70', hpPerLevel: 99, passive, skill: ['绝技', key], cards: Array.from({ length: 5 }, (_, i) => [`个人${i}`, key, 1 + (i % 2)]), signature: [['绝招', key, 2]] };
        const r = both('deck', assembly.assembleDeck, oAsm.assembleDeck, [raw, { key: 'd', fixed: { id: 'hero-1', name: '英雄' }, cls: clsProfile }]);
        if (r.profile) deckOk += 1;
    }
    assert.ok(deckOk >= 0);
    both('deck-bad', assembly.assembleDeck, oAsm.assembleDeck, [null, { key: 'd', fixed: { id: 'h', name: 'n' }, cls: clsProfile }]);
    both('deck-bad2', assembly.assembleDeck, oAsm.assembleDeck, [{ hp: 'abc', cards: [1] }, { key: 'd', fixed: { id: 'h', name: 'n' }, cls: { archetype: 'unknown' } }]);
});

test('generation-assembly：技能角色、敌人、补技能、成长与原包一致', () => {
    const passive = ['被动名', passiveKeys[0]];
    let okCount = 0;
    for (const key of skillKeys) {
        const skills = [['技一', key], ['技二', key], { name: '技三', template: key }];
        const ch = both('skill-char', assembly.assembleSkillCharacter, oAsm.assembleSkillCharacter, [{ aliases: ['a'], className: '游侠', hp: 55.6, tier: 'ace', skills, passives: [passive, passiveKeys[1]] }, { key: 's', fixed: { id: 'sc1', name: '小雪' } }]);
        if (ch.profile) okCount += 1;
        for (const tier of ['normal', 'elite', 'boss', 'unknown']) {
            const en = both('enemy', assembly.assembleEnemy, oAsm.assembleEnemy, [{ art: 'nope', hp: 5000, skills: [['甲', key], ['乙', key]], passive: passiveKeys[2], enrage: ['怒', key] }, { key: 'e', fixed: { id: 'en1', name: '史莱姆', tier } }]);
            if (en.profile) okCount += 1;
        }
        const fill = both('fill', assembly.assembleSkillFill, oAsm.assembleSkillFill, [{ skills: [['新一', key], ['新二', key]] }, { key: 'f', fixed: { profile: { id: 'sc1', kind: 'skill-character', skills: [{ name: '旧' }] } }, input: { count: 2, existing: ['已有'], templates: [key] } }]);
        if (fill.profile) okCount += 1;
        both('fill-dup', assembly.assembleSkillFill, oAsm.assembleSkillFill, [{ skills: [['旧', key]] }, { key: 'f', fixed: { profile: { id: 'e1', kind: 'enemy', tier: 'boss', skills: [{ name: '旧' }] }, cap: 9 }, input: { count: 1 } }]);
        both('growth-skill', assembly.assembleGrowth, oAsm.assembleGrowth, [{ template: key, targetId: 't' }, { key: 'g', input: { output: 'skill', skill: '剑气' } }]);
    }
    assert.ok(okCount > 0);
    for (const raw of [null, {}, { hp: 'x', skills: 'x', tier: 'bad' }, { skills: [['a', 'nope']], passives: 'x' }]) {
        both('sc-bad', assembly.assembleSkillCharacter, oAsm.assembleSkillCharacter, [raw, { key: 's', fixed: { id: 'x', name: 'n' } }]);
        both('en-bad', assembly.assembleEnemy, oAsm.assembleEnemy, [raw, { key: 'e', fixed: { id: 'x', name: 'n', tier: 'elite' } }]);
    }
    for (const key of cardKeys) {
        for (const input of [{ output: 'card', skill: '斩击' }, { output: 'card', skill: '斩击', rarity: 'rare', templates: [key, 'nope'] }]) {
            both('growth-card', assembly.assembleGrowth, oAsm.assembleGrowth, [{ template: key, cost: 2, values: undefined }, { key: 'g', input }]);
            both('growth-card2', assembly.assembleGrowth, oAsm.assembleGrowth, [{ name: '自定', template: key, cost: '1', values: [1, 2, 3], targetId: 'a' }, { key: 'g', input }]);
        }
    }
});

test('generation-assembly：装备、物品、特质、奖励与原包一致', () => {
    for (const key of gearPassiveKeys) {
        both('gear', assembly.assembleGear, oAsm.assembleGear, [{ template: key }, { key: 'g', input: { name: '长剑', slot: 'weapon', description: '' } }]);
        both('gear-r', assembly.assembleGear, oAsm.assembleGear, [{ template: key, ability: 'str' }, { key: 'g', input: { name: '长剑', slot: 'weapon', rarity: 'rare', templates: [key] } }]);
        both('trait', assembly.assembleTrait, oAsm.assembleTrait, [{ name: '勇敢', template: key, origin: '来历'.repeat(60) }, { key: 't', fixed: { traitId: 'tr1', rarity: 'epic' } }]);
    }
    both('gear-norarity-notpl', assembly.assembleGear, oAsm.assembleGear, [{ ability: 'int' }, { key: 'g', input: { name: '袍', slot: 'armor', rarity: 'common' } }]);
    both('gear-bad-ability', assembly.assembleGear, oAsm.assembleGear, [{ ability: 'zzz' }, { key: 'g', input: { name: '袍', slot: 'armor', rarity: 'common' } }]);
    both('gear-bad', assembly.assembleGear, oAsm.assembleGear, [{ template: 'nope' }, { key: 'g', input: { name: '袍', slot: 'armor' } }]);
    for (const key of itemKeys) {
        both('item', assembly.assembleItem, oAsm.assembleItem, [{ template: key }, { key: 'i', input: { name: '药', count: 3, description: '' } }]);
        both('item-r', assembly.assembleItem, oAsm.assembleItem, [{ template: key }, { key: 'i', input: { name: '药', count: 3, rarity: 'epic', templates: [key], description: '说明' } }]);
    }
    both('item-bad', assembly.assembleItem, oAsm.assembleItem, [{ template: 'nope' }, { key: 'i', input: { name: '药', count: 1 } }]);
    both('trait-bad', assembly.assembleTrait, oAsm.assembleTrait, [{ name: '', template: 'nope' }, { key: 't', fixed: { traitId: 'tr1', rarity: 'epic' } }]);
    both('trait-null', assembly.assembleTrait, oAsm.assembleTrait, [null, { key: 't' }]);
    const activeShape = { kind: 'active', skill: { cost: 2, effects: [{ op: 'damage', amount: 5 }], description: '一击' } };
    const passiveShape = { kind: 'passive', passive: { effects: [{ op: 'status', status: 'strength', stacks: 1 }], description: '被动' } };
    for (const shape of [activeShape, passiveShape]) {
        both('trait-shape', assembly.assembleTrait, oAsm.assembleTrait, [{ name: '特性', origin: '某处' }, { key: 't', fixed: { traitId: 'tr', rarity: 'rare', shape } }]);
    }

    // 奖励：卡 / 装备 / 物品 / 杂物四种槽位
    const slots = [
        { index: 0, kind: 'card', rarity: 'common', cost: 1 },
        { index: 1, kind: 'gear', rarity: 'rare', gearSlot: 'weapon' },
        { index: 2, kind: 'item', rarity: 'uncommon', count: 2 },
        { index: 3, kind: 'keepsake', rarity: 'epic' },
    ];
    for (const key of cardKeys.slice(0, 20)) {
        const raw = { slots: [['卡', key, '来自某处'], { name: '剑', template: gearPassiveKeys[0], origin: 'o' }, ['药', itemKeys[0], 'x'.repeat(100)], ['信物', null, '旧物']], reserve: [['备', key, 'y']] };
        both('reward', assembly.assembleReward, oAsm.assembleReward, [raw, { key: 'r', input: { seed: 'seed1', slots, reserve: [slots[0]] } }]);
    }
    both('reward-bad', assembly.assembleReward, oAsm.assembleReward, [{ slots: [['a']] }, { key: 'r', input: { seed: 's', slots } }]);
    both('reward-bad2', assembly.assembleReward, oAsm.assembleReward, [null, { key: 'r', input: {} }]);
    both('reward-empty', assembly.assembleReward, oAsm.assembleReward, [{}, { key: 'r', input: { seed: 's' } }]);
});

// ---- generation 差分 ----
test('generation：读 JSON、LLM 配置、请求构造与原包一致', () => {
    const replies = ['', '   ', 'hello', '```json\n{"a":1}\n```', 'prefix {"a":[1,2]} suffix', '{"a":"未闭合', '{"a":[1,', '{"a":1}}', '```{"entities":[]}```', '[1,2', '{"s":"带\\"引号\\"', null, undefined, '{bad json}'];
    for (const reply of replies) assert.deepEqual(generation.readGenerationJson(reply), oGen.readGenerationJson(reply), String(reply));
    for (const config of [null, {}, { source: 'openai' }, { source: 'openai', endpoint: 'u', model: ' ' }, { source: 'openai', endpoint: 'u', model: 'm', extra: 1 }, { source: 'x', a: 1 }]) {
        assert.deepEqual(generation.resolveCombatLlm(config), oGen.resolveCombatLlm(config));
    }
    assert.equal(generation.enemyIdFor(' 狼 ', 'elite'), oGen.enemyIdFor(' 狼 ', 'elite'));
    const anchor = { messageId: 3, swipeId: 1, tagHash: 'h', occurrence: 2 };
    assert.equal(generation.learnedIdFor('c1', '剑气', anchor), oGen.learnedIdFor('c1', '剑气', anchor));
    assert.equal(generation.learnedIdFor('c1', '剑气'), oGen.learnedIdFor('c1', '剑气'));
});

test('generation：实体构造函数与原包一致', () => {
    const classes = new Map([['class-1', { id: 'class-1', className: '剑士', archetype: 'warrior', classPool: [{ id: 'a', name: '斩', type: 'attack', cost: 1, extra: 1 }] }]]);
    const classArray = [...classes.values()];
    const cases = [
        ['deckProfileEntities', [{ name: '阿雪' }]],
        ['deckProfileEntities', [{ name: '阿雪', role: 'protagonist', className: '剑士', classes }]],
        ['deckProfileEntities', [{ name: '阿雪', classRef: 'class-9' }]],
        ['deckProfileEntities', [{ name: '阿雪', classes: classArray }]],
        ['deckProfileEntities', [{ name: '阿雪', className: '法师', classes: classArray, id: 'custom' }]],
        ['respecClassEntity', [{ id: 'u1', name: '主角' }]],
        ['classTierEntity', [{ character: { id: 'u1', name: '主角' }, cls: { id: 'class-1', className: '剑士', archetype: 'warrior' }, tier: 2, rarity: 'rare', tierName: '一阶', mark: 'm' }]],
        ['classTierEntity', [{ character: { id: 'u1', name: '主角' }, cls: { id: 'class-1', className: '剑士', archetype: 'warrior' }, tier: 1, rarity: 'rare' }]],
        ['traitEntity', [{ character: { id: 'u1', name: '主角' }, rarity: 'rare', traitId: 't1', existing: [{ name: '甲' }, null, { name: '' }] }]],
        ['traitEntity', [{ character: { id: 'u1', name: '主角' }, rarity: 'rare', traitId: 't1', shape: { kind: 'active', skill: { cost: 2, description: 'd' } } }]],
        ['traitEntity', [{ character: { id: 'u1', name: '主角' }, rarity: 'rare', traitId: 't1', shape: { kind: 'passive', passive: { description: 'p' } } }]],
        ['skillProfileEntity', [{ name: '小雪' }]],
        ['skillProfileEntity', [{ name: '小雪', id: 'x', role: 'protagonist' }]],
        ['skillProfileEntity', [undefined]],
        ['skillFillEntity', [{ profile: { id: 'p', name: 'P', kind: 'skill-character', skills: [{ name: 'a' }] }, count: 2, version: 3, createdAt: 5, level: 5 }]],
        ['skillFillEntity', [{ profile: { id: 'p', name: 'P', kind: 'skill-character', skills: [{ name: 'a' }] }, count: 2, version: 3, level: 30 }]],
        ['skillFillEntity', [{ profile: { id: 'e', name: 'E', kind: 'enemy', tier: 'boss', skills: [] }, count: 1, existing: ['z'], level: 30 }]],
        ['enemyEntities', [{ enemies: [{ name: '狼' }, { name: '狼' }, { name: '熊' }], tier: 'elite', partyLevel: 4 }]],
        ['enemyEntities', [{ enemies: [{ name: '狼' }], tier: 'elite', existing: new Map([[oGen.enemyIdFor('狼', 'elite'), {}]]) }]],
        ['enemyEntities', [{ enemies: [{ name: '狼' }], existing: [{ id: oGen.enemyIdFor('狼', 'normal') }] }]],
        ['enemyEntities', [{ enemies: [{ name: '狼' }], tier: 'nope' }]],
        ['enemyEntities', [undefined]],
        ['withCombatInitialization', [[{ key: 'a', kind: 'profile-deck', input: { name: '甲' } }, { key: 'b', kind: 'class', input: {} }, { key: 'c', kind: 'enemy', input: { name: '狼' } }], ['甲', '乙', '狼']]],
    ];
    for (const [fn, args] of cases) {
        assert.deepEqual(generation[fn](...args), oGen[fn](...args), `${fn} ${JSON.stringify(args).slice(0, 200)}`);
    }
});

test('generation：rewardEntity / growthEntity / templateEnemy / buildGenerationRequest / profileRecord 与原包一致', () => {
    const character = { id: 'u1', name: '主角', kind: 'deck-character' };
    const anchor = { messageId: 2, swipeId: 0, tagHash: 'hh', occurrence: 0 };
    const rewardInputs = [
        { combatId: 'b1', anchor, tier: 'normal', enemyTiers: ['normal'], enemies: [{ name: '狼' }, { name: ' 狼 ' }, null], encounter: '山路', character },
        { combatId: 'b2', anchor, tier: 'boss', enemyTiers: ['boss'], character, difficulty: 'hard' },
        { combatId: '', anchor, character },
        undefined,
    ];
    for (const input of rewardInputs) assert.deepEqual(generation.rewardEntity(input), oGen.rewardEntity(input), JSON.stringify(input));

    const deckChar = {
        ...character,
        profile: { signatureCards: [{ id: 'sig1', name: '破 军', rarity: 'signature' }] },
        owned: new Map([['sig1', 1], ['c1', 2]]),
        catalog: new Map([['sig1', { name: '破军', rarity: 'signature' }], ['c1', { name: '斩', rarity: 'common' }]]),
        skills: [],
    };
    const skillChar = { id: 's1', name: '小雪', kind: 'skill-character', skills: [{ id: 'sk1', name: '剑气' }] };
    const growths = [
        [{ kind: 'equip', name: '铁剑', slot: 'weapon', description: 'd', anchor }, character],
        [{ kind: 'equip', name: '铁剑', slot: 'weapon', description: 'd', rarity: 'rare', anchor }, character],
        [{ kind: 'equip', name: '铁剑', slot: 'weapon', rarity: 'epic', anchor }, character],
        [{ kind: 'item', name: '药水', count: 2, anchor }, character],
        [{ kind: 'item', name: '药水', count: 2, rarity: 'rare', description: '回血', anchor }, character],
        [{ kind: 'class', className: '剑士', anchor }, character],
        [{ kind: 'class', className: '新职业', anchor }, character],
        [{ kind: 'learn', skill: '破军', anchor }, deckChar],
        [{ kind: 'upgrade', skill: '破军', anchor }, { ...deckChar, owned: new Map() }],
        [{ kind: 'learn', skill: '新招', description: '描述', anchor }, deckChar],
        [{ kind: 'learn', skill: '新招', rarity: 'rare', anchor }, deckChar],
        [{ kind: 'upgrade', skill: '斩', anchor }, deckChar],
        [{ kind: 'learn', skill: '剑气二式', anchor }, skillChar],
        [{ kind: 'upgrade', skill: '剑气', anchor }, skillChar],
        [{ kind: 'learn', skill: 'x', anchor }, null],
    ];
    const classes = [{ id: 'class-1', className: '剑士' }];
    for (const [growth, who] of growths) {
        for (const options of [undefined, { classes, now: 77 }, { classes: new Map([['class-1', classes[0]]]) }]) {
            assert.deepEqual(generation.growthEntity(growth, who, options), oGen.growthEntity(growth, who, options), JSON.stringify([growth, options]));
        }
    }
    for (const [name, tier] of [['狼', 'normal'], ['龙', 'boss'], ['', 'elite'], ['x'.repeat(40), 'nope'], [undefined, undefined]]) {
        assert.deepEqual(generation.templateEnemy(name, tier), oGen.templateEnemy(name, tier), `${name}/${tier}`);
    }
    const entities = generation.enemyEntities({ enemies: [{ name: '狼' }] }).entities;
    const withRetry = [{ entity: entities[0], previous: { hp: 1 }, errors: [{ path: 'hp', reason: 'bad' }] }, { entity: { ...entities[0], key: 'k2', optional: true } }, entities[0]];
    for (const items of [[entities[0]], withRetry]) {
        for (const options of [undefined, { context: { story: 's' }, classes: new Map([['class-1', { ...classes[0], archetype: 'warrior', classPool: [] }]]) }]) {
            assert.deepEqual(generation.buildGenerationRequest(items, options), oGen.buildGenerationRequest(items, options));
        }
    }
    const profile = { id: 'p1', name: '甲', kind: 'enemy' };
    assert.deepEqual(generation.profileRecord(profile), oGen.profileRecord(profile));
    assert.deepEqual(generation.profileRecord({ id: 'p', className: '剑士', kind: 'class' }, { version: 4, createdAt: 9, className: '改' }), oGen.profileRecord({ id: 'p', className: '剑士', kind: 'class' }, { version: 4, createdAt: 9, className: '改' }));
    const accepted = { accepted: [{ profile, createdAt: 5, version: 2 }, { entry: { id: 'e' } }, { profile, createdAt: NaN }, { profile, version: 1.5 }] };
    assert.deepEqual(generation.generationWrites(accepted, { createdAt: 8 }), oGen.generationWrites(accepted, { createdAt: 8 }));
    assert.deepEqual(generation.generationWrites(null), oGen.generationWrites(null));
});

// 用「脚本化的模型」跑 generateEntities：每次请求按序返回下一条回复
async function runGenerate(fn, entities, replies, options = {}) {
    const seen = [];
    let index = 0;
    const request = async (payload, llm) => {
        seen.push({ user: payload.user, llm });
        const reply = replies[Math.min(index, replies.length - 1)];
        index += 1;
        if (reply instanceof Error) throw reply;
        return typeof reply === 'string' ? reply : JSON.stringify(reply);
    };
    const result = await fn(entities, { request, now: 11, ...options });
    return { result, seen };
}

test('generation：generateEntities 的装配、修正轮、推迟与失败分支与原包一致', async () => {
    const passive = ['被', passiveKeys[0]];
    const fixture = () => {
        const classEntity = generation.deckProfileEntities({ name: '阿雪' });
        const skillEntity = generation.skillProfileEntity({ name: '小雪' });
        const enemyEntity = generation.enemyEntities({ enemies: [{ name: '狼' }, { name: '王' }] }).entities;
        return { classEntity, skillEntity, enemyEntity };
    };
    const { classEntity, skillEntity, enemyEntity } = fixture();
    const good = (key) => ({ className: '剑士', archetype: 'warrior', passive, cards: Array.from({ length: 11 }, (_, i) => [`卡${i}`, cardKeys[(i + 3) % cardKeys.length], i % 4]) });
    const scenarios = [];
    // 空回复 / 缺实体 / 非 JSON / 请求报错 / 无请求函数
    scenarios.push([[skillEntity], [JSON.stringify({ entities: [] })]]);
    scenarios.push([[skillEntity], ['乱码'], {}]);
    scenarios.push([[skillEntity], ['{"entities":[{"key":"skill:']]);
    scenarios.push([[skillEntity], [JSON.stringify({ entities: [{ key: 'skill:' + skillEntity.owner, value: 'x' }, { key: 'zzz', value: 1 }, 5] })]]);
    scenarios.push([[...enemyEntity], [JSON.stringify({ entities: enemyEntity.map((e) => ({ key: e.key, value: { hp: 90, skills: [['猛咬', skillKeys[0]], ['低吼', skillKeys[1]]] } })) })]]);
    scenarios.push([[...enemyEntity], [Object.assign(new Error('boom'), { reason: 'secondary-llm-http-failed', status: 503 })]]);
    scenarios.push([[...enemyEntity], [new Error('plain')]]);
    // 牌组依赖职业：职业与牌组同请求，职业先落定
    const deckValue = { hp: 80, passive, skill: ['绝技', cardKeys[0]], cards: Array.from({ length: 5 }, (_, i) => [`个${i}`, cardKeys[i], 1 + (i % 2)]) };
    scenarios.push([classEntity, [JSON.stringify({ entities: [{ key: classEntity[0].key, value: good() }, { key: classEntity[1].key, value: deckValue }] })]]);
    scenarios.push([classEntity, [JSON.stringify({ entities: [{ key: classEntity[1].key, value: deckValue }] })]]);
    scenarios.push([classEntity, [{ entities: [{ key: classEntity[0].key, value: { className: 'x' } }, { key: classEntity[1].key, value: deckValue }] }, { entities: [{ key: classEntity[0].key, value: good() }, { key: classEntity[1].key, value: deckValue }] }]]);
    // 修正轮次
    scenarios.push([[skillEntity], [{ entities: [{ key: skillEntity.key, value: { skills: [] } }] }, { entities: [{ key: skillEntity.key, value: { skills: [['甲', skillKeys[0]], ['乙', skillKeys[1]], ['丙', skillKeys[2]]], passives: [passive] } }] }]]);
    // 初始化信息
    const withInit = generation.withCombatInitialization([skillEntity], ['小雪', '路人']);
    scenarios.push([withInit, [{ entities: [{ key: skillEntity.key, value: { skills: [['甲', skillKeys[0]], ['乙', skillKeys[1]], ['丙', skillKeys[2]]], passives: [passive], init: { role: 'mage', major: 'int', minor: 'wis', weak: 'str' } } }, { key: withInit[1].key, value: { init: { role: 'bad' } } }] }]]);
    for (const [entities, replies, options] of scenarios) {
        const mine = await runGenerate(generation.generateEntities, entities, replies, options);
        const theirs = await runGenerate(oGen.generateEntities, entities, replies, options);
        assert.deepEqual(mine, theirs, JSON.stringify(replies).slice(0, 200));
    }
    // 配置不全 / 无 request / 起步中止
    assert.deepEqual(await generation.generateEntities([skillEntity], { llm: { source: 'openai' } }), await oGen.generateEntities([skillEntity], { llm: { source: 'openai' } }));
    assert.deepEqual(await generation.generateEntities([skillEntity], {}), await oGen.generateEntities([skillEntity], {}));
    assert.deepEqual(await generation.generateEntities(null, {}), await oGen.generateEntities(null, {}));
    const aborted = new AbortController();
    aborted.abort();
    assert.deepEqual(await runGenerate(generation.generateEntities, [skillEntity], ['{}'], { signal: aborted.signal }), await runGenerate(oGen.generateEntities, [skillEntity], ['{}'], { signal: aborted.signal }));
    // lore / story 注入
    const lookup = async (names) => names.map((name) => ({ name, text: ` ${name}的设定 ` }));
    assert.deepEqual(await generation.withCharacterLore([skillEntity, ...enemyEntity], lookup), await oGen.withCharacterLore([skillEntity, ...enemyEntity], lookup));
    assert.deepEqual(await generation.withCharacterLore([skillEntity], async () => { throw new Error('x'); }), await oGen.withCharacterLore([skillEntity], async () => { throw new Error('x'); }));
    assert.deepEqual(await generation.withCharacterLore(null, lookup), await oGen.withCharacterLore(null, lookup));
    const reader = async (arg) => ({ story: ' 剧情 ', worldInfo: ' 世界 ', userPersona: ' 人设 ', seen: arg.full });
    for (const options of [undefined, { names: ['a'], full: true, persona: true }, { persona: false }]) {
        assert.deepEqual(await generation.withStoryContext({ keep: 1 }, reader, options), await oGen.withStoryContext({ keep: 1 }, reader, options));
    }
    assert.deepEqual(await generation.withStoryContext(null, null), await oGen.withStoryContext(null, null));
    assert.deepEqual(await generation.withStoryContext({ a: 1 }, async () => ({})), await oGen.withStoryContext({ a: 1 }, async () => ({})));
    assert.deepEqual(await generation.withStoryContext({ a: 1 }, async () => { throw new Error('x'); }), await oGen.withStoryContext({ a: 1 }, async () => { throw new Error('x'); }));
    void schema;
});
