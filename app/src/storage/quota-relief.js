// 配额告急时只在 IGS 自己的存储层腾空间：仅处理下列白名单键，不碰其它任何键（含 draft、非 IGS 键）。
import { IMAGE_JOB_LOG_STORAGE_KEY } from '../generated-images/image-job-log.js';

export const LOADER_LATEST_REF_KEY = 'igs:loader:latest-ref';

export function isQuotaError(error) {
    return Boolean(error) && (error.name === 'QuotaExceededError' || error.code === 22 || /quota/i.test(String(error.message || error.name || '')));
}

// 返回实际释放的内容：[{ key, action: 'halved' | 'cleared' | 'removed' }]
export function relieveStorageQuota(storage) {
    const freed = [];
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.removeItem !== 'function') return freed;
    try {
        const raw = storage.getItem(IMAGE_JOB_LOG_STORAGE_KEY);
        if (raw != null) {
            let list = null;
            try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) list = parsed; } catch { /* 损坏则直接清空 */ }
            let halved = false;
            if (list && list.length > 1 && typeof storage.setItem === 'function') {
                try { storage.setItem(IMAGE_JOB_LOG_STORAGE_KEY, JSON.stringify(list.slice(Math.floor(list.length / 2)))); halved = true; } catch { /* 对半写不进则清空 */ }
            }
            if (halved) freed.push({ key: IMAGE_JOB_LOG_STORAGE_KEY, action: 'halved' });
            else { storage.removeItem(IMAGE_JOB_LOG_STORAGE_KEY); freed.push({ key: IMAGE_JOB_LOG_STORAGE_KEY, action: 'cleared' }); }
        }
    } catch { /* 清理失败不影响主流程 */ }
    try {
        if (storage.getItem(LOADER_LATEST_REF_KEY) != null) {
            storage.removeItem(LOADER_LATEST_REF_KEY);
            freed.push({ key: LOADER_LATEST_REF_KEY, action: 'removed' });
        }
    } catch { /* 同上 */ }
    return freed;
}
