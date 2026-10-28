// 生图前的存储空间预检：剩余空间明显装不下这一批时，直接不出图，免得生完才发现存不下。
// 浏览器不提供 estimate、读取失败或返回值不可信时一律放行，只拦「明确不够」。
import { isQuotaError } from './generated-asset-store.js';
import { describeLocalStorageUsage } from '../storage/storage-usage.js';

// 单张图（原图、透明结果、遮罩）落盘的保守估计。
export const IMAGE_STORAGE_ESTIMATE_BYTES = 3 * 1024 * 1024;

export const IMAGE_STORAGE_FULL_MESSAGE = '图片缓存空间不足，已暂停生成。请先在备份中清理缓存。';
export const SETTINGS_STORAGE_FULL_MESSAGE = '浏览器本地存储已满，新图无法记入设置，已暂停生成。请先删除不再使用的预设或素材条目。';

const COUNTERS = {
    generateExpressionSet: (request) => (Array.isArray(request?.moods) ? request.moods.length : 0) || 1,
    paintExpressionCaptions: (request) => (Array.isArray(request?.items) ? request.items.length : 0) || 1,
    generateExpressionImage: () => 1,
    generateCharacterSprite: () => 1,
    generateCharacterAvatar: () => 1,
};

// 这个入口一次会出几张图；不是出图入口返回 0。
export function plannedImageCount(method, request) {
    const count = COUNTERS[method];
    return count ? Math.max(1, Math.trunc(Number(count(request))) || 1) : 0;
}

// 每张图生完要往设置（localStorage，酒馆与各插件共用约数 MB）里记一条格子；按条留足余量。
export const SETTINGS_ENTRY_ESTIMATE_CHARS = 2048;
const SETTINGS_PROBE_KEY = 'igs:storage-room-probe';

// 设置写不进去时，图生完了格子也会整批回滚（看起来像「生了却没多」），所以出图前先试写一块同等大小的占位。
function settingsHaveRoom(globalObject, total) {
    let storage = null;
    try { storage = globalObject?.localStorage; } catch { return true; }
    if (!storage || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') return true;
    try {
        storage.setItem(SETTINGS_PROBE_KEY, 'x'.repeat(SETTINGS_ENTRY_ESTIMATE_CHARS * total));
        return true;
    } catch (error) {
        return !isQuotaError(error);
    } finally {
        try { storage.removeItem(SETTINGS_PROBE_KEY); } catch { /* 占位没写进去就没有可删的 */ }
    }
}

export async function checkImageStorageRoom(globalObject, count, { perImageBytes = IMAGE_STORAGE_ESTIMATE_BYTES } = {}) {
    const total = Math.trunc(Number(count));
    if (!(total > 0)) return { ok: true };
    if (!settingsHaveRoom(globalObject, total)) {
        let usage = '';
        try { usage = describeLocalStorageUsage(globalObject.localStorage, { topKeys: 3 }); } catch { /* 读不到占用就只报已满 */ }
        return { ok: false, reason: 'image-storage-full', error: usage ? `${SETTINGS_STORAGE_FULL_MESSAGE}${usage}。` : SETTINGS_STORAGE_FULL_MESSAGE };
    }
    const storage = globalObject?.navigator?.storage;
    if (!storage || typeof storage.estimate !== 'function') return { ok: true };
    let estimate;
    try { estimate = await storage.estimate(); } catch { return { ok: true }; }
    const quota = Number(estimate?.quota), usage = Number(estimate?.usage);
    if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(usage) || usage < 0) return { ok: true };
    const free = quota - usage, needed = perImageBytes * total;
    if (free >= needed) return { ok: true, free, needed };
    return { ok: false, reason: 'image-storage-full', free, needed, error: IMAGE_STORAGE_FULL_MESSAGE };
}
