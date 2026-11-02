// 主角背包视图：把酒馆表格读出的物品表与装备定义表，合成为战斗系统使用的背包结构。
// 装备/消耗品的定义经账本规范化（normalizeLedgerEntry）校验后才采用，
// 校验不过或定义缺失的物品落入 others，并记诊断，不丢数据。
import { gearIdFor, itemIdFor, normalizeLedgerEntry } from './schema.js';

// 装备定义表里允许的 kind
export const INVENTORY_DEF_KINDS = Object.freeze(['gear', 'item', 'keepsake']);

const emptyView = () => ({ gear: { slots: {}, bag: [] }, items: [], collection: [], others: [], lost: [] });

// 规范化探针用的占位锚点
const PROBE_ANCHOR = Object.freeze({ messageId: 0, swipeId: 0, tagHash: 'inventory', occurrence: 0 });

// 借用账本规范化来校验一份定义；通过则返回规范化后的 payload，否则 null。
function normalizePayload(type, payload) {
    const entry = normalizeLedgerEntry({
        id: 'inventory-probe',
        type,
        character: 'inventory',
        anchor: PROBE_ANCHOR,
        payload,
        createdAt: 0,
    });
    return entry.ok ? entry.value.payload : null;
}

// 装备定义 -> 规范化的 equip payload
function gearPayload(item, definition) {
    const gearId = gearIdFor(item.name);
    return normalizePayload('equip', {
        gearId,
        name: item.name,
        slot: definition.slot,
        ...(definition.passive ? { passive: definition.passive } : {}),
        description: definition.description || '',
        ...(definition.rarity ? { rarity: definition.rarity } : {}),
        ...(definition.bonus ? { bonus: definition.bonus } : {}),
    });
}

// 消耗品定义 -> 规范化的 item payload（数量固定 1，真实数量由调用方覆盖）
function itemPayload(item, definition) {
    return normalizePayload('item', {
        itemId: itemIdFor(item.name),
        name: item.name,
        count: 1,
        effects: definition.effects,
        description: definition.description || '',
    });
}

// 生成主角背包视图。table 是表格读取结果，读取失败时返回空视图与原因。
export function heroInventoryView(table) {
    if (!table || table.ok !== true) {
        return { ok: false, reason: table?.reason || 'inventory-table-read-failed', ...emptyView(), diagnostics: [] };
    }
    const view = emptyView();
    const diagnostics = [...(table.diagnostics || [])];
    // 装备定义行按 key 索引
    const definitionRows = new Map((table.gear?.rows || []).map((row) => [row.key, row]));

    for (const item of table.inventory.items) {
        const row = definitionRows.get(item.key);
        const definition = row?.definition && typeof row.definition === 'object' ? row.definition : null;
        const plain = { name: item.name, count: item.quantity, description: item.description, category: item.category };
        if (item.lost) {
            view.lost.push({ name: item.name, itemId: itemIdFor(item.name), kind: definition?.kind || 'other', definition });
            continue;
        }
        // 没有定义行：当作普通杂项
        if (!row) {
            view.others.push(plain);
            continue;
        }
        if (!definition || !INVENTORY_DEF_KINDS.includes(definition.kind)) {
            diagnostics.push({ code: 'gear-definition-kind-invalid', name: item.name });
            view.others.push(plain);
            continue;
        }
        // 纪念品：不经规范化，直接进收藏
        if (definition.kind === 'keepsake') {
            view.collection.push({
                itemId: itemIdFor(item.name),
                name: item.name,
                origin: String(definition.origin || ''),
                rarity: definition.rarity || 'common',
                count: item.quantity,
            });
            continue;
        }
        const payload = definition.kind === 'gear' ? gearPayload(item, definition) : itemPayload(item, definition);
        if (!payload) {
            diagnostics.push({ code: 'gear-definition-invalid', name: item.name, kind: definition.kind });
            view.others.push(plain);
            continue;
        }
        if (definition.kind === 'item') {
            view.items.push({ ...payload, count: item.quantity });
            continue;
        }
        // 装备：已装备且槽位空闲则占槽（一件），其余进背包；槽位冲突记诊断
        const takesSlot = row.equipped && !view.gear.slots[payload.slot];
        if (row.equipped && !takesSlot) diagnostics.push({ code: 'gear-slot-conflict', name: item.name, slot: payload.slot });
        if (takesSlot) view.gear.slots[payload.slot] = { ...payload, count: 1 };
        const bagCount = item.quantity - (takesSlot ? 1 : 0);
        if (bagCount > 0) view.gear.bag.push({ ...payload, count: bagCount });
    }

    // 有定义行却没有对应物品的孤儿行
    const inventoryKeys = new Set(table.inventory.items.map((item) => item.key));
    for (const row of definitionRows.values()) {
        if (!inventoryKeys.has(row.key)) diagnostics.push({ code: 'gear-row-orphan', name: row.name });
    }
    return { ok: true, ...view, diagnostics };
}
