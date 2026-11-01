// 战斗服务测试的宿主替身：计数存储、手动定时器、模拟 AutoCardUpdaterAPI（数据库插件）。

// 带计数的 localStorage 替身：setItem / removeItem 次数、按键的写入历史。
export function createCountingStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    const log = [];
    return {
        data,
        log,
        counts: { setItem: 0, removeItem: 0, getItem: 0 },
        getItem(key) { this.counts.getItem += 1; return data.has(key) ? data.get(key) : null; },
        setItem(key, value) { this.counts.setItem += 1; log.push(['set', key, String(value)]); data.set(key, String(value)); },
        removeItem(key) { this.counts.removeItem += 1; log.push(['remove', key]); data.delete(key); },
        snapshot() { return Object.fromEntries(data); },
    };
}

// 手动定时器：不依赖真实时间，测试里 runAll() 触发已登记的回调。
export function createManualTimer() {
    let nextId = 1;
    const timers = new Map();
    return {
        setTimer(fn, ms) { const id = nextId++; timers.set(id, { fn, ms }); return id; },
        clearTimer(id) { timers.delete(id); },
        pending: () => timers.size,
        delays: () => [...timers.values()].map((item) => item.ms),
        runAll() { const batch = [...timers]; timers.clear(); for (const [, item] of batch) item.fn(); },
    };
}

// 事件目标替身：可只给 document / 只给 window，用来测容错。
export function createEventTarget(extra = {}) {
    const handlers = new Map();
    return {
        ...extra,
        addEventListener(type, handler) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(handler); },
        removeEventListener(type, handler) { handlers.get(type)?.delete(handler); },
        emit(type) { for (const handler of [...(handlers.get(type) || [])]) handler({ type }); },
        listenerCount: (type) => handlers.get(type)?.size || 0,
    };
}

// 模拟数据库插件。表以 { sheet_xxx: { uid, name, content: [[列...], [行...]], orderNo } } 保存。
// insertRow 同时支持 (tableName, rowData) 与 ({ tableName, data }) 两种调用形式。
export function createMockHost({ supportCallbacks = false, seed = true } = {}) {
    // 默认带一张用户自己的表：数据库插件的模板永远非空，空导出会被判为「表未就绪」
    const sheets = seed ? { sheet_user: { uid: 'sheet_user', name: '用户备忘', content: [['row_id', '内容']], orderNo: 0 } } : {};
    const calls = { exportTableAsJson: 0, insertRow: 0, insertObjectForm: 0, insertPositionalForm: 0, getTableTemplate: 0, importTemplateFromData: 0, refreshDataAndWorldbook: 0, updateRow: 0, deleteRow: 0 };
    const callbacks = new Set();
    const rowsOf = (name) => Object.values(sheets).find((sheet) => sheet.name === name);
    const api = {
        exportTableAsJson() { calls.exportTableAsJson += 1; return JSON.parse(JSON.stringify(sheets)); },
        getTableTemplate() { calls.getTableTemplate += 1; return JSON.parse(JSON.stringify(sheets)); },
        importTemplateFromData(template) {
            calls.importTemplateFromData += 1;
            for (const [key, sheet] of Object.entries(template)) if (sheet && typeof sheet.uid === 'string') sheets[key] = JSON.parse(JSON.stringify(sheet));
            return { success: true };
        },
        refreshDataAndWorldbook() { calls.refreshDataAndWorldbook += 1; return true; },
        insertRow(first, second) {
            calls.insertRow += 1;
            let tableName; let data;
            if (first && typeof first === 'object') { calls.insertObjectForm += 1; tableName = first.tableName; data = first.data; } else { calls.insertPositionalForm += 1; tableName = first; data = second; }
            const sheet = rowsOf(tableName);
            if (!sheet) return false;
            const header = sheet.content[0];
            const row = header.map((column, index) => (index === 0 ? String(sheet.content.length - 1) : String(data?.[column] ?? '')));
            sheet.content.push(row);
            return sheet.content.length - 2;
        },
        updateRow(tableName, rowIndex, patch) {
            calls.updateRow += 1;
            const sheet = rowsOf(tableName);
            if (!sheet || !sheet.content[rowIndex + 1]) return false;
            sheet.content[0].forEach((column, index) => { if (patch && column in patch) sheet.content[rowIndex + 1][index] = String(patch[column]); });
            return true;
        },
        deleteRow(tableName, rowIndex) {
            calls.deleteRow += 1;
            const sheet = rowsOf(tableName);
            if (!sheet || !sheet.content[rowIndex + 1]) return false;
            sheet.content.splice(rowIndex + 1, 1);
            return true;
        },
    };
    if (supportCallbacks) {
        api.registerTableUpdateCallback = (callback) => { callbacks.add(callback); };
        api.unregisterTableUpdateCallback = (callback) => { callbacks.delete(callback); };
    }
    return { api, sheets, calls, callbacks, fireTableUpdated: () => { for (const callback of [...callbacks]) callback(); } };
}
