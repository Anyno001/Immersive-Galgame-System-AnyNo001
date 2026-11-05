export function createShujukuClient(api) {
    return {
        // kept for backward compat — simulate.test.js depends on this
        async updateRowAndRefresh(tableName, rowIndex, patch) {
            if (!api || typeof api.updateRow !== 'function')
                return { ok: false, reason: 'missing-update-row' };
            const updateResult = await api.updateRow(tableName, rowIndex, patch);
            if (!isSuccessful(updateResult))
                return { ok: false, reason: 'update-row-failed', result: updateResult };
            if (typeof api.refreshDataAndWorldbook === 'function') {
                const refreshResult = await api.refreshDataAndWorldbook();
                if (!isSuccessful(refreshResult))
                    return { ok: false, reason: 'refresh-worldbook-failed', result: refreshResult };
            }
            return { ok: true, tableName, rowIndex, patch };
        },

        readTables() {
            if (!api || typeof api.exportTableAsJson !== 'function')
                return { ok: false, reason: 'missing-api' };
            try {
                return { ok: true, data: api.exportTableAsJson() };
            } catch (e) {
                return { ok: false, reason: String(e && e.message || 'read-failed') };
            }
        },

        async updateCell(tableName, rowIndex, colName, value) {
            if (!api || typeof api.updateCell !== 'function')
                return { ok: false, reason: 'missing-api' };
            const result = await api.updateCell(tableName, rowIndex, colName, String(value));
            return isSuccessful(result) ? { ok: true } : { ok: false, reason: 'update-failed' };
        },

        // options 只在调用方传入时使用对象参数形式（如 skipNotify），不传时保持原来的位置参数调用。
        async insertRow(tableName, rowData, options) {
            if (!api || typeof api.insertRow !== 'function')
                return { ok: false, reason: 'missing-api' };
            const result = options && typeof options === 'object'
                ? await api.insertRow({ ...options, tableName, data: rowData })
                : await api.insertRow(tableName, rowData);
            if (!isSuccessful(result)) return { ok: false, reason: 'insert-failed' };
            return typeof result === 'number' ? { ok: true, rowIndex: result } : { ok: true };
        },

        // rowIndex 为宿主表内容下标（表头为 0，首条数据为 1）；options 只在调用方传入时使用对象参数形式（如 skipNotify），不传时保持位置参数调用。
        async updateRow(tableName, rowIndex, patch, options) {
            if (!api || typeof api.updateRow !== 'function')
                return { ok: false, reason: 'missing-api' };
            const result = options && typeof options === 'object'
                ? await api.updateRow({ ...options, tableName, rowIndex, data: patch })
                : await api.updateRow(tableName, rowIndex, patch);
            return isSuccessful(result) ? { ok: true } : { ok: false, reason: 'update-failed' };
        },

        async deleteRow(tableName, rowIndex, options) {
            if (!api || typeof api.deleteRow !== 'function')
                return { ok: false, reason: 'missing-api' };
            const result = options && typeof options === 'object'
                ? await api.deleteRow({ ...options, tableName, rowIndex })
                : await api.deleteRow(tableName, rowIndex);
            return isSuccessful(result) ? { ok: true } : { ok: false, reason: 'delete-failed' };
        },

        // 当前聊天生效的表格模板（只读副本由调用方自行克隆）；宿主返回字符串时按 JSON 解析。
        getTableTemplate() {
            if (!api || typeof api.getTableTemplate !== 'function')
                return { ok: false, reason: 'missing-api' };
            try {
                const raw = api.getTableTemplate({ scope: 'chat' });
                const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return data && typeof data === 'object' && !Array.isArray(data)
                    ? { ok: true, data }
                    : { ok: false, reason: 'template-unavailable' };
            } catch (e) {
                return { ok: false, reason: 'template-read-failed', message: String(e && e.message || e) };
            }
        },

        // 只调用宿主自带的模板导入，不自行实现导入逻辑。
        async importTemplate(template, options = {}) {
            if (!api || typeof api.importTemplateFromData !== 'function')
                return { ok: false, reason: 'missing-api' };
            try {
                const result = await api.importTemplateFromData(template, options);
                if (result && typeof result === 'object' && result.success === true) return { ok: true, result };
                return { ok: false, reason: 'import-failed', message: String(result && (result.error || result.message) || '') };
            } catch (e) {
                return { ok: false, reason: 'import-failed', message: String(e && e.message || e) };
            }
        },

        async refresh() {
            if (!api || typeof api.refreshDataAndWorldbook !== 'function')
                return { ok: false, reason: 'missing-api' };
            await api.refreshDataAndWorldbook();
            return { ok: true };
        },

        registerCallback(cb) {
            if (api && typeof api.registerTableUpdateCallback === 'function')
                api.registerTableUpdateCallback(cb);
        },

        // AI 开始填表的回调；旧版数据库插件没有这个接口时什么都不做。
        registerFillStartCallback(cb) {
            if (api && typeof api.registerTableFillStartCallback === 'function')
                api.registerTableFillStartCallback(cb);
        },

        unregisterFillStartCallback(cb) {
            if (api && typeof api.unregisterTableFillStartCallback === 'function')
                api.unregisterTableFillStartCallback(cb);
        },

        unregisterCallback(cb) {
            if (api && typeof api.unregisterTableUpdateCallback === 'function')
                api.unregisterTableUpdateCallback(cb);
        },
    };
}

function isSuccessful(result) {
    if (result == null || result === false || result === -1) return false;
    if (typeof result === 'object' && result.success === false) return false;
    return true;
}
