// 库存写入计划：把一条账本条目（装备/卸下/获得/消耗/战利品/出售/纪念品）
// 翻译成对「物品表 + 装备定义表」的改动计划，不直接写表。
//   rows    需要新建或更新的定义行 { name, record }（record 为 null 表示删除该行）
//   changes 物品数量变化 { name, delta, ... }
//   after   changes 执行后才能确定的清理（数量归零时删除定义行）
import { itemIdFor } from './schema.js';
import { ABILITY_LABELS } from './abilities.js';

export const STOCK_TYPES = Object.freeze(['equip', 'unequip', 'item', 'consume', 'loot', 'sell', 'keepsake', 'lose']);

export const STOCK_RARITY_LABELS = Object.freeze({ common: '普通', uncommon: '罕见', rare: '稀有', epic: '史诗', mythic: '神话' });
export const STOCK_SLOT_LABELS = Object.freeze({ weapon: '武器', armor: '防具', accessory: '饰品', treasure: '宝物' });
const CATEGORY_LABELS = Object.freeze({ gear: '装备', item: '消耗品', keepsake: '杂物' });

// 两个名字是否指向同一物品（按物品 id 归一）
const sameName = (a, b) => itemIdFor(a) === itemIdFor(b);
// 背包里的全部装备：槽位上的 + 背包里的
const allGear = (inventory) => [...Object.values(inventory.gear.slots), ...inventory.gear.bag];

// 判断名字在背包视图里属于哪一类：gear / item / keepsake / other，不存在返回 null
export function stockKindOf(inventory, name) {
    if (allGear(inventory).some((entry) => sameName(entry.name, name))) return 'gear';
    if (inventory.items.some((entry) => sameName(entry.name, name))) return 'item';
    if (inventory.collection.some((entry) => sameName(entry.name, name))) return 'keepsake';
    if (inventory.others.some((entry) => sameName(entry.name, name))) return 'other';
    return null;
}

// 装备实例 -> 装备定义
const gearDefinition = (gear) => ({
    kind: 'gear',
    slot: gear.slot,
    ...(gear.passive ? { passive: gear.passive } : {}),
    description: gear.description || '',
    ...(gear.rarity ? { rarity: gear.rarity } : {}),
    ...(gear.bonus ? { bonus: gear.bonus } : {}),
    ...(gear.link ? { link: gear.link } : {}),
});

// 以下三个函数把定义转成表行记录（展示用文本字段 + 原始定义）
const gearRecord = (definition, equipped) => ({
    category: CATEGORY_LABELS.gear,
    rarity: STOCK_RARITY_LABELS[definition.rarity] || '',
    slot: STOCK_SLOT_LABELS[definition.slot] || definition.slot,
    bonusText: definition.bonus ? `${ABILITY_LABELS[definition.bonus.ability] || definition.bonus.ability}+${definition.bonus.amount}` : '',
    passiveText: definition.passive?.description || definition.passive?.name || '',
    effectText: definition.description || '',
    equipped,
    definition,
});
const itemRecord = (definition) => ({
    category: CATEGORY_LABELS.item,
    rarity: STOCK_RARITY_LABELS[definition.rarity] || '',
    slot: '',
    bonusText: '',
    passiveText: '',
    effectText: definition.description || '',
    equipped: false,
    definition,
});
const keepsakeRecord = (definition) => ({
    category: CATEGORY_LABELS.keepsake,
    rarity: STOCK_RARITY_LABELS[definition.rarity] || '',
    slot: '',
    bonusText: '',
    passiveText: '',
    effectText: definition.origin || '',
    equipped: false,
    definition,
});

// 穿上装备：自身行置为已装备；同槽位已有别的装备则一并卸下（displaced）
function equipRows(inventory, gear, definition) {
    const occupant = inventory.gear.slots[definition.slot];
    const displaced = occupant && !sameName(occupant.name, gear.name) ? [{ name: occupant.name, record: gearRecord(gearDefinition(occupant), false) }] : [];
    return { own: [{ name: gear.name, record: gearRecord(definition, true) }], displaced };
}

// 同名物品已属于别的类别时拒绝（other 类不算冲突）
const kindConflict = (inventory, name, expected) => {
    const kind = stockKindOf(inventory, name);
    return kind && kind !== expected && kind !== 'other' ? { ok: false, reason: 'inventory-kind-conflict', name } : null;
};

const plan = (rows, changes, after = []) => ({ ok: true, rows, changes, after });
// 数量减到 0 以下时，清理对应的定义行
const cleanupIfEmpty = (name, current, delta) => (current + delta <= 0 ? [{ name, record: null }] : []);
// 再获得已丢失物品时保留原定义，不重置加成、被动与效果。
const revive = (inventory, name, kind, definition) => (inventory.lost || []).find((entry) => entry.definition?.kind === kind && sameName(entry.name, name))?.definition || definition;

// 为一条账本条目生成库存计划。不认识的类型返回 null。
// panelTag：来自战斗面板的装备操作（背包里已有，直接穿上）。
export function stockPlan(entry, inventory, { panelTag } = {}) {
    const payload = entry.payload;
    switch (entry.type) {
        case 'item': {
            const conflict = kindConflict(inventory, payload.name, 'item');
            if (conflict) return conflict;
            const rows = stockKindOf(inventory, payload.name) === 'item' ? [] : [{ name: payload.name, record: itemRecord(revive(inventory, payload.name, 'item', { kind: 'item', effects: payload.effects, description: payload.description || '' })) }];
            return plan(rows, [{ name: payload.name, delta: payload.count, description: payload.description || '', category: CATEGORY_LABELS.item }]);
        }
        case 'equip': {
            // 面板装备：必须是背包里已有的装备
            if (entry.anchor?.tagHash === panelTag) {
                const owned = inventory.gear.bag.find((gear) => gear.gearId === payload.gearId);
                if (!owned) return { ok: false, reason: 'combat-gear-missing' };
                const equipped = equipRows(inventory, owned, gearDefinition(owned));
                return plan(equipped.own, [], equipped.displaced);
            }
            const conflict = kindConflict(inventory, payload.name, 'gear');
            if (conflict) return conflict;
            const known = stockKindOf(inventory, payload.name) === 'gear';
            const definition = known ? gearDefinition(payload) : revive(inventory, payload.name, 'gear', gearDefinition(payload));
            const occupant = inventory.gear.slots[definition.slot];
            // 槽位空闲或本就是同名装备时才标记为已装备
            const rows = [{ name: payload.name, record: gearRecord(definition, !occupant || sameName(occupant.name, payload.name)) }];
            return plan(rows, known ? [] : [{ name: payload.name, delta: 1, description: payload.description || '', category: CATEGORY_LABELS.gear }]);
        }
        case 'unequip': {
            const equipped = Object.values(inventory.gear.slots).find((gear) => gear.gearId === payload.gearId);
            return equipped ? plan([{ name: equipped.name, record: gearRecord(gearDefinition(equipped), false) }], []) : { ok: false, reason: 'combat-gear-missing' };
        }
        case 'consume': {
            const item = inventory.items.find((candidate) => candidate.itemId === payload.itemId);
            if (!item || item.count < payload.count) return { ok: false, reason: 'combat-item-insufficient' };
            return plan([], [{ name: item.name, delta: -payload.count }], cleanupIfEmpty(item.name, item.count, -payload.count));
        }
        case 'lose': {
            const kind = stockKindOf(inventory, payload.name);
            if (!kind) return { ok: false, reason: 'combat-item-missing' };
            const pool = kind === 'gear' ? allGear(inventory) : kind === 'item' ? inventory.items : kind === 'keepsake' ? inventory.collection : inventory.others;
            const hits = pool.filter((item) => sameName(item.name, payload.name));
            const have = hits.reduce((count, item) => count + (Number.isInteger(item.count) ? item.count : 1), 0);
            const count = payload.all ? have : Math.min(payload.count, have);
            if (!hits.length || count <= 0) return { ok: false, reason: 'combat-item-missing' };
            const worn = kind === 'gear' && count >= have ? Object.values(inventory.gear.slots).find((gear) => sameName(gear.name, payload.name)) : null;
            return plan(worn ? [{ name: worn.name, record: gearRecord(gearDefinition(worn), false) }] : [], [{ name: hits[0].name, delta: -count, lost: true }]);
        }
        case 'keepsake': {
            const conflict = kindConflict(inventory, payload.name, 'keepsake');
            if (conflict) return conflict;
            const definition = revive(inventory, payload.name, 'keepsake', { kind: 'keepsake', origin: payload.origin || '', ...(payload.rarity ? { rarity: payload.rarity } : {}) });
            const rows = stockKindOf(inventory, payload.name) === 'keepsake' ? [] : [{ name: payload.name, record: keepsakeRecord(definition) }];
            return plan(rows, [{ name: payload.name, delta: 1, description: definition.origin, category: CATEGORY_LABELS.keepsake }]);
        }
        case 'loot': {
            const slot = payload.slot;
            if (slot.kind === 'gear') {
                const conflict = kindConflict(inventory, slot.gear.name, 'gear');
                if (conflict) return conflict;
                const known = stockKindOf(inventory, slot.gear.name) === 'gear';
                const definition = gearDefinition({ ...slot.gear, rarity: slot.rarity });
                return plan(known ? [] : [{ name: slot.gear.name, record: gearRecord(definition, false) }], [{ name: slot.gear.name, delta: 1, description: definition.description, category: CATEGORY_LABELS.gear }]);
            }
            if (slot.kind === 'item') {
                const conflict = kindConflict(inventory, slot.item.name, 'item');
                if (conflict) return conflict;
                const definition = { kind: 'item', effects: slot.item.effects, description: slot.item.description || '', rarity: slot.rarity };
                const rows = stockKindOf(inventory, slot.item.name) === 'item' ? [] : [{ name: slot.item.name, record: itemRecord(definition) }];
                return plan(rows, [{ name: slot.item.name, delta: slot.item.count, description: definition.description, category: CATEGORY_LABELS.item }]);
            }
            if (slot.kind === 'keepsake') {
                const conflict = kindConflict(inventory, slot.name, 'keepsake');
                if (conflict) return conflict;
                const definition = { kind: 'keepsake', origin: slot.origin || '', rarity: slot.rarity };
                const rows = stockKindOf(inventory, slot.name) === 'keepsake' ? [] : [{ name: slot.name, record: keepsakeRecord(definition) }];
                return plan(rows, [{ name: slot.name, delta: 1, description: definition.origin, category: CATEGORY_LABELS.keepsake }]);
            }
            return null;
        }
        case 'sell': {
            if (payload.gearId) {
                const inSlot = Object.values(inventory.gear.slots).some((gear) => gear.gearId === payload.gearId);
                // 只剩已装备的一件时不能卖
                if (inSlot && !inventory.gear.bag.some((gear) => gear.gearId === payload.gearId)) return { ok: false, reason: 'combat-gear-equipped' };
                const bagGear = inventory.gear.bag.find((gear) => gear.gearId === payload.gearId);
                if (!bagGear) return { ok: false, reason: 'combat-gear-missing' };
                const equippedCount = inSlot ? 1 : 0;
                return plan([], [{ name: bagGear.name, delta: -1 }], cleanupIfEmpty(bagGear.name, bagGear.count + equippedCount, -1));
            }
            const keepsakeId = payload.itemId || payload.lootId;
            const keepsake = inventory.collection.find((candidate) => candidate.itemId === keepsakeId);
            return keepsake ? plan([], [{ name: keepsake.name, delta: -1 }], cleanupIfEmpty(keepsake.name, keepsake.count, -1)) : { ok: false, reason: 'combat-keepsake-missing' };
        }
        default:
            return null;
    }
}
