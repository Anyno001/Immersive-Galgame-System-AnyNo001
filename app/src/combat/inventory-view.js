import { gearIdFor, itemIdFor, normalizeLedgerEntry } from './schema.js';

// 主角背包投影（P7b）：物品表是数量的唯一来源，「IGS战斗·装配」定义JSON 的 kind 说明该行是装备、道具还是杂物。
// 输出与账本角色视图同形：gear { slots, bag }、items、collection；others 为物品表里没有装配定义的剧情物品，只显示、不可卖。
// 定义经日志 schema 的装备 / 道具载荷校验（与正文获得同一口径）；不合规的行不进引擎，归入 others 并记诊断。
export const INVENTORY_DEF_KINDS = Object.freeze(['gear', 'item', 'keepsake']);
const empty = () => ({ gear: { slots: {}, bag: [] }, items: [], collection: [], others: [] });
const PROBE_ANCHOR = Object.freeze({ messageId: 0, swipeId: 0, tagHash: 'inventory', occurrence: 0 });

// 借日志条目校验装配定义：type 为 equip / item，名称与 ID 取物品表，道具数量按 1 校验（实际数量取物品表）。
function checked(type, payload) {
    const n = normalizeLedgerEntry({ id: 'inventory-probe', type, character: 'inventory', anchor: PROBE_ANCHOR, payload, createdAt: 0 });
    return n.ok ? n.value.payload : null;
}

function gearOf(item, def) {
    const gearId = gearIdFor(item.name);
    return checked('equip', { gearId, name: item.name, slot: def.slot, ...(def.passive ? { passive: def.passive } : {}), description: def.description || '',
        ...(def.rarity ? { rarity: def.rarity } : {}), ...(def.bonus ? { bonus: def.bonus } : {}) });
}

function itemOf(item, def) {
    return checked('item', { itemId: itemIdFor(item.name), name: item.name, count: 1, effects: def.effects, description: def.description || '' });
}

// read 为 data/shujuku/inventory-tables 的 read() 结果。读取失败原样带出原因（调用方不得当作空背包落账）。
export function heroInventoryView(read) {
    if (!read || read.ok !== true) return { ok: false, reason: read?.reason || 'inventory-table-read-failed', ...empty(), diagnostics: [] };
    const out = empty();
    const diagnostics = [...(read.diagnostics || [])];
    const rows = new Map((read.gear?.rows || []).map((r) => [r.key, r]));
    for (const item of read.inventory.items) {
        const row = rows.get(item.key);
        const def = row?.definition && typeof row.definition === 'object' ? row.definition : null;
        const plain = { name: item.name, count: item.quantity, description: item.description, category: item.category };
        if (!row) { out.others.push(plain); continue; }
        if (!def || !INVENTORY_DEF_KINDS.includes(def.kind)) { diagnostics.push({ code: 'gear-definition-kind-invalid', name: item.name }); out.others.push(plain); continue; }
        if (def.kind === 'keepsake') {
            out.collection.push({ itemId: itemIdFor(item.name), name: item.name, origin: String(def.origin || ''), rarity: def.rarity || 'common', count: item.quantity });
            continue;
        }
        const value = def.kind === 'gear' ? gearOf(item, def) : itemOf(item, def);
        if (!value) { diagnostics.push({ code: 'gear-definition-invalid', name: item.name, kind: def.kind }); out.others.push(plain); continue; }
        if (def.kind === 'item') { out.items.push({ ...value, count: item.quantity }); continue; }
        // 同部位只认先出现的一件已装备；其余记诊断留在背包。数量多于 1 时装着一件，余下的在背包。
        const worn = row.equipped && !out.gear.slots[value.slot];
        if (row.equipped && !worn) diagnostics.push({ code: 'gear-slot-conflict', name: item.name, slot: value.slot });
        if (worn) out.gear.slots[value.slot] = { ...value, count: 1 };
        const spare = item.quantity - (worn ? 1 : 0);
        if (spare > 0) out.gear.bag.push({ ...value, count: spare });
    }
    // 装配表有、物品表已无的行（用尽删了行或回退）只记诊断，不进视图。
    const have = new Set(read.inventory.items.map((i) => i.key));
    for (const r of rows.values()) if (!have.has(r.key)) diagnostics.push({ code: 'gear-row-orphan', name: r.name });
    return { ok: true, ...out, diagnostics };
}
