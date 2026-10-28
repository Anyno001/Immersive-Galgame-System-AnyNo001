import { isQuotaError, relieveStorageQuota } from './quota-relief.js';

export function writeCheckedStorage(storage, key, value) {
    let previous, attempted = false;
    try {
        previous = storage.getItem(key);
        attempted = true;
        if (value === null) storage.removeItem(key);
        else try { storage.setItem(key, value); } catch (quotaError) {
            // 配额满：仅清理 IGS 白名单键后重试一次；清理自身不会再触发兜底，仍失败照常抛出。
            if (!isQuotaError(quotaError) || !relieveStorageQuota(storage).length) throw quotaError;
            storage.setItem(key, value);
        }
        if (storage.getItem(key) !== value) throw new Error('store-write-not-persisted');
        return { ok: true };
    } catch (saveError) {
        let rollbackFailed = false;
        if (attempted) try {
            if (previous === null) storage.removeItem(key); else storage.setItem(key, previous);
            rollbackFailed = storage.getItem(key) !== previous;
        } catch { rollbackFailed = true; }
        return { ok: false, reason: 'store-write-failed', saveError, rollbackFailed };
    }
}
