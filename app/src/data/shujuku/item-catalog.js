import { buildRecordModel } from './record-model.js';

// 物品图消费的物品目录：名称与背包页同源（复用 buildRecordModel 的 inventory 条目），描述列按优先级查找。
// 描述不进入 FIELDS.inventory，避免让没有描述列的物品表出现「字段不足」诊断。
export const ITEM_DESCRIPTION_FIELDS = Object.freeze(['描述', '物品描述', '备注', '说明', '效果']);
const DESCRIPTION_MAX = 200;

// 物品合并键：全角转半角、折叠空白、忽略大小写；表格与 igs-fx:item 标签共用。
export function normalizeItemName(name) {
    return String(name ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function pickDescription(cells) {
    for (const field of ITEM_DESCRIPTION_FIELDS) {
        const cell = cells.find(item => String(item.label || '').trim() === field && item.value);
        if (cell) return String(cell.value).slice(0, DESCRIPTION_MAX);
    }
    return '';
}

export function buildItemCatalog(readResult) {
    const model = buildRecordModel(readResult, 'inventory');
    const byKey = new Map();
    for (const entry of model.entries || []) {
        const name = String(entry.title || '').trim();
        const key = normalizeItemName(name);
        if (!key) continue;
        const description = pickDescription(entry.cells || []);
        const existing = byKey.get(key);
        if (existing) {
            // 同名物品跨表出现时保留首条，只补齐缺失的描述。
            if (!existing.description && description) existing.description = description;
            continue;
        }
        byKey.set(key, { key, name, description, source: entry.source, uid: entry.uid, rowIndex: entry.rowIndex });
    }
    const items = Array.from(byKey.values());
    const status = items.length ? 'ready' : (model.status === 'ready' ? 'empty' : model.status);
    return { status, reason: model.reason || '', items };
}
