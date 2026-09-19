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

        async insertRow(tableName, rowData) {
            if (!api || typeof api.insertRow !== 'function')
                return { ok: false, reason: 'missing-api' };
            const result = await api.insertRow(tableName, rowData);
            return isSuccessful(result) ? { ok: true } : { ok: false, reason: 'insert-failed' };
        },

        async deleteRow(tableName, rowIndex) {
            if (!api || typeof api.deleteRow !== 'function')
                return { ok: false, reason: 'missing-api' };
            const result = await api.deleteRow(tableName, rowIndex);
            return isSuccessful(result) ? { ok: true } : { ok: false, reason: 'delete-failed' };
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
