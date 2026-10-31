import { itemIdFor } from './schema.js';
import { ABILITY_LABELS } from './abilities.js';

// 主角背包写入计划（P7b，纯函数）：一条主角的装备 / 道具 / 杂物条目 + 当前背包投影（inventory-view.js）→ 要写的装配表行与物品表数量变化。
// 账本写口按计划执行：先写日志条目（已入账标记），再写装配行（按名称整行覆盖，可重放），最后改数量；数量写失败时撤销标记。
// 返回 null 表示不是背包条目（如战利品里的卡牌），走普通日志写入；{ ok:false, reason } 表示不写标记、不改表。
export const STOCK_TYPES = Object.freeze(['equip', 'unequip', 'item', 'consume', 'loot', 'sell']);
export const STOCK_RARITY_LABELS = Object.freeze({ common: '普通', uncommon: '罕见', rare: '稀有', epic: '史诗', mythic: '神话' });
export const STOCK_SLOT_LABELS = Object.freeze({ weapon: '武器', armor: '防具', accessory: '饰品', treasure: '宝物' });
const CATEGORY = Object.freeze({ gear: '装备', item: '消耗品', keepsake: '杂物' });

const same = (a, b) => itemIdFor(a) === itemIdFor(b);
const allGear = (view) => [...Object.values(view.gear.slots), ...view.gear.bag];

// 背包里同名物品的种类：gear / item / keepsake / other（只在物品表、没有装配定义）；没有时为 null。
export function stockKindOf(view, name) {
    if (allGear(view).some((g) => same(g.name, name))) return 'gear';
    if (view.items.some((i) => same(i.name, name))) return 'item';
    if (view.collection.some((k) => same(k.name, name))) return 'keepsake';
    if (view.others.some((o) => same(o.name, name))) return 'other';
    return null;
}

const gearDef = (g) => ({ kind: 'gear', slot: g.slot, ...(g.passive ? { passive: g.passive } : {}), description: g.description || '',
    ...(g.rarity ? { rarity: g.rarity } : {}), ...(g.bonus ? { bonus: g.bonus } : {}) });
const gearRecord = (def, equipped) => ({
    category: CATEGORY.gear, rarity: STOCK_RARITY_LABELS[def.rarity] || '', slot: STOCK_SLOT_LABELS[def.slot] || def.slot,
    bonusText: def.bonus ? `${ABILITY_LABELS[def.bonus.ability] || def.bonus.ability}+${def.bonus.amount}` : '',
    passiveText: def.passive?.description || def.passive?.name || '', effectText: def.description || '', equipped, definition: def,
});
const itemRecord = (def) => ({ category: CATEGORY.item, rarity: STOCK_RARITY_LABELS[def.rarity] || '', slot: '', bonusText: '', passiveText: '', effectText: def.description || '', equipped: false, definition: def });
const keepsakeRecord = (def) => ({ category: CATEGORY.keepsake, rarity: STOCK_RARITY_LABELS[def.rarity] || '', slot: '', bonusText: '', passiveText: '', effectText: def.origin || '', equipped: false, definition: def });

// 装上 target（装备视图值）：own 为本件的装配行（在改数量之前写），displaced 为同部位被顶替的另一件（数量写成之后再卸下）。
function wear(view, target, def) {
    const worn = view.gear.slots[def.slot];
    const displaced = worn && !same(worn.name, target.name) ? [{ name: worn.name, record: gearRecord(gearDef(worn), false) }] : [];
    return { own: [{ name: target.name, record: gearRecord(def, true) }], displaced };
}

const conflict = (view, name, kind) => {
    const have = stockKindOf(view, name);
    return have && have !== kind && have !== 'other' ? { ok: false, reason: 'inventory-kind-conflict', name } : null;
};
const plan = (rows, changes, after = []) => ({ ok: true, rows, changes, after });
// 数量用完时删掉装配行（物品表已删行，不留孤儿）。
const dropRow = (name, count, delta) => (count + delta <= 0 ? [{ name, record: null }] : []);

export function stockPlan(entry, view, { panelTag } = {}) {
    const p = entry.payload;
    switch (entry.type) {
        case 'item': {
            const bad = conflict(view, p.name, 'item');
            if (bad) return bad;
            const rows = stockKindOf(view, p.name) === 'item' ? [] : [{ name: p.name, record: itemRecord({ kind: 'item', effects: p.effects, description: p.description || '' }) }];
            return plan(rows, [{ name: p.name, delta: p.count, description: p.description || '', category: CATEGORY.item }]);
        }
        case 'equip': {
            if (entry.anchor?.tagHash === panelTag) {
                const g = view.gear.bag.find((x) => x.gearId === p.gearId);
                if (!g) return { ok: false, reason: 'combat-gear-missing' };
                const w = wear(view, g, gearDef(g));
                return plan(w.own, [], w.displaced);
            }
            const bad = conflict(view, p.name, 'gear');
            if (bad) return bad;
            const owned = stockKindOf(view, p.name) === 'gear';
            const w = wear(view, p, gearDef(p));
            return plan(w.own, owned ? [] : [{ name: p.name, delta: 1, description: p.description || '', category: CATEGORY.gear }], w.displaced);
        }
        case 'unequip': {
            const g = Object.values(view.gear.slots).find((x) => x.gearId === p.gearId);
            return g ? plan([{ name: g.name, record: gearRecord(gearDef(g), false) }], []) : { ok: false, reason: 'combat-gear-missing' };
        }
        case 'consume': {
            const i = view.items.find((x) => x.itemId === p.itemId);
            if (!i || i.count < p.count) return { ok: false, reason: 'combat-item-insufficient' };
            return plan([], [{ name: i.name, delta: -p.count }], dropRow(i.name, i.count, -p.count));
        }
        case 'loot': {
            const slot = p.slot;
            if (slot.kind === 'gear') {
                const bad = conflict(view, slot.gear.name, 'gear');
                if (bad) return bad;
                const owned = stockKindOf(view, slot.gear.name) === 'gear';
                const def = gearDef({ ...slot.gear, rarity: slot.rarity });
                return plan(owned ? [] : [{ name: slot.gear.name, record: gearRecord(def, false) }], [{ name: slot.gear.name, delta: 1, description: def.description, category: CATEGORY.gear }]);
            }
            if (slot.kind === 'item') {
                const bad = conflict(view, slot.item.name, 'item');
                if (bad) return bad;
                const def = { kind: 'item', effects: slot.item.effects, description: slot.item.description || '', rarity: slot.rarity };
                const rows = stockKindOf(view, slot.item.name) === 'item' ? [] : [{ name: slot.item.name, record: itemRecord(def) }];
                return plan(rows, [{ name: slot.item.name, delta: slot.item.count, description: def.description, category: CATEGORY.item }]);
            }
            if (slot.kind === 'keepsake') {
                const bad = conflict(view, slot.name, 'keepsake');
                if (bad) return bad;
                const def = { kind: 'keepsake', origin: slot.origin || '', rarity: slot.rarity };
                const rows = stockKindOf(view, slot.name) === 'keepsake' ? [] : [{ name: slot.name, record: keepsakeRecord(def) }];
                return plan(rows, [{ name: slot.name, delta: 1, description: def.origin, category: CATEGORY.keepsake }]);
            }
            return null;
        }
        case 'sell': {
            if (p.gearId) {
                if (Object.values(view.gear.slots).some((g) => g.gearId === p.gearId) && !view.gear.bag.some((g) => g.gearId === p.gearId)) return { ok: false, reason: 'combat-gear-equipped' };
                const g = view.gear.bag.find((x) => x.gearId === p.gearId);
                if (!g) return { ok: false, reason: 'combat-gear-missing' };
                const worn = Object.values(view.gear.slots).some((x) => x.gearId === p.gearId) ? 1 : 0;
                return plan([], [{ name: g.name, delta: -1 }], dropRow(g.name, g.count + worn, -1));
            }
            const id = p.itemId || p.lootId;
            const k = view.collection.find((x) => x.itemId === id);
            if (!k) return { ok: false, reason: 'combat-keepsake-missing' };
            return plan([], [{ name: k.name, delta: -1 }], dropRow(k.name, k.count, -1));
        }
        default: return null;
    }
}
