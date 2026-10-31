// 数值日志表测试夹具：fake shujuku（AutoCardUpdaterAPI 形状，与 combat-tables.test.js 同一套行为）
// 经真实的 createCombatTables 读写，数值运行时拿到的 statsTables 与 combat-services.statsTables 同形。
import { COMBAT_TABLE_SPECS, buildCombatSheet, createCombatTables } from '../../src/data/shujuku/combat-tables.js';

export function fakeShujuku({ withStats = true } = {}) {
    const tables = { mate: { type: 'chatSheets', version: 1, updateConfigUiSentinel: 2 } };
    let order = 0;
    for (const kind of Object.keys(COMBAT_TABLE_SPECS)) {
        if (kind === 'stats' && !withStats) continue;
        const sheet = buildCombatSheet(kind, order);
        order += 1;
        tables[sheet.uid] = sheet;
    }
    const calls = { insert: 0, imports: 0 };
    const api = {
        tables, calls, failInsert: false, notReady: false,
        exportTableAsJson() { return api.notReady ? {} : JSON.parse(JSON.stringify(tables)); },
        insertRow(opts) {
            calls.insert += 1;
            if (api.failInsert) return -1;
            const sheet = Object.values(tables).find((s) => s && s.name === opts.tableName);
            if (!sheet) return -1;
            const headers = sheet.content[0];
            sheet.content.push(headers.map((h) => (h === 'row_id' ? String(sheet.content.length) : String(opts.data[h] ?? ''))));
            return sheet.content.length - 1;
        },
        getTableTemplate() {
            const copy = JSON.parse(JSON.stringify(tables));
            for (const v of Object.values(copy)) if (v && v.content) v.content = [v.content[0]];
            return copy;
        },
        async importTemplateFromData(template) {
            calls.imports += 1;
            for (const [key, sheet] of Object.entries(template)) {
                if (key === 'mate') { tables.mate = sheet; continue; }
                if (!tables[key]) tables[key] = JSON.parse(JSON.stringify(sheet));
            }
            return { success: true };
        },
        async refreshDataAndWorldbook() { return true; },
    };
    return api;
}

// 数值日志表的行（解码前），供测试核对实际写入。
export function statRows(api) {
    const sheet = Object.values(api.tables).find((s) => s && s.name === COMBAT_TABLE_SPECS.stats.name);
    return sheet ? sheet.content.slice(1) : null;
}

export function fakeStatsTables(api = fakeShujuku()) {
    const raw = createCombatTables({ api });
    return {
        api,
        raw,
        statsTables: () => ({ ok: true, read: () => raw.read(), append: (records, options) => raw.append('stats', records, options), ensure: () => raw.ensure() }),
    };
}
