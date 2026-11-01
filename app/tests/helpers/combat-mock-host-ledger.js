// 账本与背包测试用的内存版数据库插件（AutoCardUpdaterAPI）。
// 表以 { sheet_xxx: { uid, name, content: [[列...], [行...]], orderNo } } 保存，首行为表头。
// rowIndex 与真实插件一致：0 是表头，1 是第一行数据。
// insertRow 同时支持 (tableName, rowData) 与 ({ tableName, data, skipNotify }) 两种调用。
// exportTableAsJson 每次返回深拷贝，并计数。

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createLedgerMockHost({ supportCallbacks = false } = {}) {
    const sheets = {};
    const calls = {
        exportTableAsJson: 0, insertRow: 0, insertObjectForm: 0, insertPositionalForm: 0, updateRow: 0, deleteRow: 0,
        getTableTemplate: 0, importTemplateFromData: 0, refreshDataAndWorldbook: 0,
    };
    const callbacks = new Set();
    const sheetNamed = (name) => Object.values(sheets).find((sheet) => sheet.name === name);
    const api = {
        exportTableAsJson() {
            calls.exportTableAsJson += 1;
            return clone(sheets);
        },
        getTableTemplate() {
            calls.getTableTemplate += 1;
            return clone(sheets);
        },
        importTemplateFromData(template) {
            calls.importTemplateFromData += 1;
            for (const [key, sheet] of Object.entries(template)) {
                if (!sheet || typeof sheet.uid !== 'string') continue;
                // 已有的表保留现有数据行，只换结构（与真实插件的 seed 模式一致）
                const existing = sheets[key];
                const next = clone(sheet);
                if (existing && existing.content.length > 1) {
                    const oldHeader = existing.content[0];
                    next.content = [next.content[0], ...existing.content.slice(1).map((row) => next.content[0].map((column, at) => {
                        const old = oldHeader.indexOf(column);
                        return old >= 0 ? row[old] : '';
                    }))];
                }
                sheets[key] = next;
            }
            return { success: true };
        },
        refreshDataAndWorldbook() {
            calls.refreshDataAndWorldbook += 1;
            return true;
        },
        insertRow(first, second) {
            calls.insertRow += 1;
            let tableName;
            let data;
            if (first && typeof first === 'object') { calls.insertObjectForm += 1; tableName = first.tableName; data = first.data; }
            else { calls.insertPositionalForm += 1; tableName = first; data = second; }
            const sheet = sheetNamed(tableName);
            if (!sheet) return false;
            const row = sheet.content[0].map((column, at) => (at === 0 ? String(sheet.content.length) : String(data?.[column] ?? '')));
            sheet.content.push(row);
            return sheet.content.length - 1;
        },
        updateRow(first, second, third) {
            calls.updateRow += 1;
            const [tableName, rowIndex, patch] = first && typeof first === 'object' ? [first.tableName, first.rowIndex, first.data] : [first, second, third];
            const sheet = sheetNamed(tableName);
            if (!sheet || rowIndex < 1 || !sheet.content[rowIndex]) return false;
            sheet.content[0].forEach((column, at) => { if (patch && column in patch) sheet.content[rowIndex][at] = String(patch[column]); });
            return true;
        },
        deleteRow(first, second) {
            calls.deleteRow += 1;
            const [tableName, rowIndex] = first && typeof first === 'object' ? [first.tableName, first.rowIndex] : [first, second];
            const sheet = sheetNamed(tableName);
            if (!sheet || rowIndex < 1 || !sheet.content[rowIndex]) return false;
            sheet.content.splice(rowIndex, 1);
            return true;
        },
    };
    if (supportCallbacks) {
        api.registerTableUpdateCallback = (callback) => { callbacks.add(callback); };
        api.unregisterTableUpdateCallback = (callback) => { callbacks.delete(callback); };
    }
    return { api, sheets, calls, fireTableUpdated: () => { for (const callback of [...callbacks]) callback(); } };
}

// 用户模板里自带的背包表（缺描述/类别列，用来覆盖补列分支）。
export function userInventorySheet() {
    return {
        uid: 'sheet_userbag', name: '背包物品表', orderNo: 0,
        sourceData: { ddl: 'CREATE TABLE sheet_userbag (\n  row_id INTEGER PRIMARY KEY, -- 行号\n  item_name TEXT NOT NULL UNIQUE, -- 物品名称\n  quantity INTEGER NOT NULL DEFAULT 1 -- 数量\n);' },
        content: [['row_id', '物品名称', '数量']],
    };
}

// 清掉所有表的数据行，只留表头（跑第二组操作前复位用）。
export function snapshotRows(host) {
    return Object.fromEntries(Object.values(host.sheets).map((sheet) => [sheet.name, clone(sheet.content)]));
}
