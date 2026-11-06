// 装备部位的占用规则（规则 v6）：宝物部位最多装 TREASURE_SLOT_MAX 件，gear.slots.treasure 为数组；其余部位一格一件，仍是单值。
// 旧记录与旧视图里的宝物单值按一件处理（slotGearList 归一），写入一律用数组。纯函数，不引用其他战斗模块。
export const TREASURE_SLOT_MAX = 4;

// 某部位最多装几件。
export const slotCapacity = (slot) => (slot === 'treasure' ? TREASURE_SLOT_MAX : 1);

// 某部位当前装着的装备列表（单值、数组、空值统一成数组）。
export const slotGearList = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]).filter(Boolean);

// 已装备的全部装备（展开宝物数组），用于查找、联动、被动与加成汇总。
export const equippedGear = (slots) => Object.values(slots && typeof slots === 'object' ? slots : {}).flatMap(slotGearList);

// 把一件装备放上部位（slots 为部位 → 装备 ID 或 ID 数组，原地修改）。宝物：同一件先移出；指定序号且该格有装备时替换，
// 没满时追加，满了且未指定序号时移出最早的一件再追加。其余部位后装的替换先装的。
export function placeGear(slots, slot, gearId, slotIndex) {
    if (slotCapacity(slot) === 1) {
        slots[slot] = gearId;
        return;
    }
    const list = slotGearList(slots[slot]).filter((id) => id !== gearId);
    if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < list.length) list[slotIndex] = gearId;
    else {
        if (list.length >= slotCapacity(slot)) list.shift();
        list.push(gearId);
    }
    slots[slot] = list;
}

// 从所有部位卸下一件装备（原地修改）；宝物数组卸空时删除该部位。
export function removeGear(slots, gearId) {
    for (const [slot, value] of Object.entries(slots)) {
        if (!Array.isArray(value)) {
            if (value === gearId) delete slots[slot];
            continue;
        }
        const rest = value.filter((id) => id !== gearId);
        if (rest.length) slots[slot] = rest;
        else delete slots[slot];
    }
}
