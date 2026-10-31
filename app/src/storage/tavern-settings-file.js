import { mediaRequest } from '../media/tavern-media-http.js';
import { withMediaLock } from '../media/media-lock.js';
import { RECOVERY_ATTEMPTS, trackRecovery } from './automatic-recovery.js';
// 全局配置同步到酒馆本地 user/files/igs-settings.json（/api/files/upload），换设备、清浏览器缓存后配置还在。
// 浏览器 localStorage 仍是运行时读写的地方，这里只做镜像：启动时文件比本机新就写回本机，本机改了就防抖上传。
// 跟着同步的还有待确认情绪/服装词、物品账本、恋爱回忆去重——这些清缓存就丢、重建又烦。日志、引导进度仍留在本机。
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';

export const SETTINGS_FILE_NAME = 'igs-settings.json';
const SETTINGS_FILE_URL = `/user/files/${SETTINGS_FILE_NAME}`;
// 本机同步记录：syncedAt 为最近一次与文件一致时的文件时间，changedAt 为之后本机未上传改动的时间。
export const SETTINGS_SYNC_META_KEY = 'igs:settings-file-sync:v1';

const GLOBAL_KEYS = new Set([
    'igs_bridge_config',
    'igs-display-mode',
    'igs:preset-registry:v1',
    'igs:capability-registry:v1',
    'igs:scene-presets:v1',
    'igs-asset-folders-v1',
    'igs_record_fonts',
    'igs-custom-fonts-v1',
    'igs_record_diary_prefs',
    'igs-map-basemap-source',
    'igs-map-gen-palette',
    'igs:mood-review:v1',
    'igs:outfit-review:v1',
    'igs:item-ledger:v1',
    'igs-romance-memory-keys',
]);
// 自定义底图按「聊天:表:层」分键，图本体已挪进 user/images，键里只剩路径时才同步（见 collectGlobalSettings）。
const MAP_CUSTOM_PREFIX = 'igs-map-custom:';
const GLOBAL_PREFIXES = ['igs-reader-settings-v9-', MAP_CUSTOM_PREFIX];

export function isGlobalSettingKey(key) {
    const k = String(key || '');
    return GLOBAL_KEYS.has(k) || GLOBAL_PREFIXES.some((prefix) => k.startsWith(prefix));
}

export function collectGlobalSettings(storage) {
    const out = {};
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!isGlobalSettingKey(key)) continue;
        const value = storage.getItem(key);
        if (value == null) continue;
        // 地图记录与删除标记统一归 igs-map-records.json；不再用第二份配置镜像抢写。
        if (key.startsWith(MAP_CUSTOM_PREFIX)) continue;
        out[key] = value;
    }
    return out;
}

// 只写文件里有的键，不删本机多出来的键（另一台设备没用过的功能不该把这边的设置抹掉）。
export function applyGlobalSettings(storage, settings, deletedKeys = []) {
    let changed = 0;
    const deleted = new Set(Array.isArray(deletedKeys) ? deletedKeys : []);
    for (const key of deleted) if (isGlobalSettingKey(key) && storage.getItem(key) !== null) { storage.removeItem(key); changed += 1; }
    for (const [key, value] of Object.entries(settings || {})) {
        if (deleted.has(key) || !isGlobalSettingKey(key) || typeof value !== 'string' || storage.getItem(key) === value) continue;
        storage.setItem(key, value);
        changed++;
    }
    return changed;
}

function readMeta(storage) {
    try {
        const meta = JSON.parse(storage.getItem(SETTINGS_SYNC_META_KEY) || '{}');
        return { syncedAt: Number(meta.syncedAt) || 0, changedAt: Number(meta.changedAt) || 0, changedKeys: Array.isArray(meta.changedKeys) ? meta.changedKeys : [], deletedKeys: Array.isArray(meta.deletedKeys) ? meta.deletedKeys : [] };
    } catch { return { syncedAt: 0, changedAt: 0, changedKeys: [], deletedKeys: [] }; }
}

function utf8Base64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return globalThis.btoa(binary);
}

// 启动时比较：文件比上次同步新、且比本机未上传的改动新 → 写回本机；否则本机有未上传改动或文件不存在 → 上传。
export function resolveSyncAction(file, meta, hasLocal) {
    const savedAt = file ? Number(file.savedAt) || 0 : 0;
    if (file && savedAt > meta.syncedAt && savedAt >= meta.changedAt) return 'restore';
    if (meta.changedAt > savedAt || (!file && hasLocal)) return 'upload';
    return 'none';
}

export function createTavernSettingsSync(globalObject, { storage, onRestored, onUploaded, debounceMs = 1500, now = () => Date.now() } = {}) {
    let timer = null;
    let stopped = false;
    let applying = false;
    let lastUploaded = '';
    let uploading = null;
    let unhook = null;
    let uploadAttempts = 0, lastError = '';
    const recoveryNotice = trackRecovery(globalObject);
    const listeners = [];

    const headers = () => {
        const ctx = getSillyTavernContext(globalObject);
        return ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : null;
    };
    const writeMeta = (meta) => { try { rawSet.call(storage, SETTINGS_SYNC_META_KEY, JSON.stringify(meta)); } catch { /* 存满时只是少一次同步记录 */ } };
    const proto = Object.getPrototypeOf(storage);
    const rawSet = proto.setItem;
    const rawRemove = proto.removeItem;

    async function fetchFile() {
        const res = await mediaRequest(globalObject, `${SETTINGS_FILE_URL}?t=${now()}`, { cache: 'no-store', recover: false }, 8000);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('settings-file-read-failed');
        const file = await res.json();
        if (!file || typeof file !== 'object' || !file.settings || typeof file.settings !== 'object') throw new Error('settings-file-invalid');
        return file;
    }

    async function uploadNow() {
        clearTimeout(timer);
        timer = null;
        const h = headers();
        if (stopped) return false;
        if (uploadAttempts >= RECOVERY_ATTEMPTS) return false;
        uploadAttempts++;
        if (!h) { queueUpload('酒馆连接尚未就绪'); return false; }
        let file;
        try { file = await fetchFile(); } catch (error) { queueUpload(error.message); return false; }
        if (stopped) return false;
        if (file) {
            const pending = readMeta(storage), changedKeys = new Set(pending.changedKeys);
            const remoteDeletes = (Array.isArray(file.deletedKeys) ? file.deletedKeys : []).filter(key => !changedKeys.has(key));
            applying = true;
            let changed;
            try { changed = applyGlobalSettings(storage, Object.fromEntries(Object.entries(file.settings).filter(([key]) => !key.startsWith(MAP_CUSTOM_PREFIX) && !changedKeys.has(key))), remoteDeletes.filter(key => !key.startsWith(MAP_CUSTOM_PREFIX))); } finally { applying = false; }
            writeMeta({ ...pending, deletedKeys: [...new Set([...remoteDeletes, ...pending.deletedKeys])] });
            if (changed && typeof onRestored === 'function') onRestored({ changed });
        }
        const settings = collectGlobalSettings(storage);
        const body = JSON.stringify(settings);
        const before = readMeta(storage);
        if (body === lastUploaded && !before.changedAt) { uploadAttempts = 0; lastError = ''; recoveryNotice.end(); return true; }
        const savedAt = now();
        // 复用上面已序列化的 body 拼出外层，不再对整份配置序列化第二遍（格式与 JSON.stringify 一致）。
        const text = `{"version":2,"savedAt":${JSON.stringify(savedAt)},"settings":${body},"deletedKeys":${JSON.stringify(before.deletedKeys)}}`;
        try {
            const res = await mediaRequest(globalObject, '/api/files/upload', {
                method: 'POST', headers: h, body: JSON.stringify({ name: SETTINGS_FILE_NAME, data: utf8Base64(text) }),
            });
            if (!res || !res.ok) { queueUpload(`配置上传失败${res?.status ? `（HTTP ${res.status}）` : ''}`); return false; }
        } catch (error) { queueUpload(error.message); return false; }
        lastUploaded = body;
        // 上传途中本机又改了：保留 changedAt，等下一次防抖上传。
        const after = readMeta(storage);
        writeMeta({ ...after, syncedAt: savedAt, changedAt: after.changedAt > before.changedAt ? after.changedAt : 0, changedKeys: after.changedAt > before.changedAt ? after.changedKeys : [] });
        uploadAttempts = 0; lastError = ''; recoveryNotice.end();
        if (typeof onUploaded === 'function') onUploaded({ savedAt });
        return true;
    }

    function upload() {
        if (!uploading) uploading = withMediaLock(globalObject, 'settings', uploadNow)
            .catch(error => { queueUpload(error.message); return false; }).finally(() => { uploading = null; });
        return uploading;
    }

    function queueUpload(error) {
        if (stopped) return;
        if (error) lastError = error;
        clearTimeout(timer);
        timer = null;
        if (uploadAttempts >= RECOVERY_ATTEMPTS) {
            recoveryNotice.update({ phase: 'failed', message: `全局配置同步 ${uploadAttempts} 次仍未完成：${lastError}。本机配置已保留。`,
                page: 'data', actionLabel: '打开备份' });
            return;
        }
        timer = setTimeout(() => { void upload(); }, debounceMs);
        timer?.unref?.();
    }

    function markChanged(key, removed = false) {
        if (applying || stopped) return;
        uploadAttempts = 0; lastError = ''; recoveryNotice.end();
        const meta = readMeta(storage), changedKeys = new Set(meta.changedKeys), deletedKeys = new Set(meta.deletedKeys);
        changedKeys.add(String(key));
        if (removed) deletedKeys.add(String(key)); else deletedKeys.delete(String(key));
        writeMeta({ ...meta, changedAt: Math.max(now(), meta.changedAt + 1), changedKeys: [...changedKeys], deletedKeys: [...deletedKeys] });
        queueUpload();
    }

    // 配置散在各模块直接写 localStorage，只在本机这个 Storage 上、命中全局配置键时才记一笔。
    function hook() {
        if (!proto || proto === Object.prototype || typeof rawSet !== 'function' || typeof rawRemove !== 'function') return null;
        // 先判键：页面上所有脚本的写入都会经过这里，不是全局配置键就直接写，不多读两遍（大值读一次就是一次同步 IO）。
        const setItem = function setItem(key, value) {
            if (this !== storage || !isGlobalSettingKey(key)) return rawSet.call(this, key, value);
            const previous = this.getItem(key);
            const result = rawSet.call(this, key, value);
            if (previous !== this.getItem(key)) markChanged(key);
            return result;
        };
        const removeItem = function removeItem(key) {
            if (this !== storage || !isGlobalSettingKey(key)) return rawRemove.call(this, key);
            const previous = this.getItem(key);
            const result = rawRemove.call(this, key);
            if (previous !== null) markChanged(key, true);
            return result;
        };
        proto.setItem = setItem;
        proto.removeItem = removeItem;
        // 之后别的脚本又包了一层时不动它，免得把对方的包装拆掉。
        return () => {
            if (proto.setItem === setItem) proto.setItem = rawSet;
            if (proto.removeItem === removeItem) proto.removeItem = rawRemove;
        };
    }

    // 页面切走或关闭时把还在防抖的改动立刻发出去。
    function onHide() {
        if (timer && (globalObject.document ? globalObject.document.visibilityState === 'hidden' : true)) void upload();
    }

    function reconnected() { if (!stopped) { uploadAttempts = 0; recoveryNotice.end(); queueUpload(); } }

    async function start() {
        if (!headers() || typeof globalObject.fetch !== 'function') return { ok: false, reason: 'no-tavern' };
        if (globalObject.addEventListener) {
            globalObject.addEventListener('online', reconnected);
            listeners.push(() => globalObject.removeEventListener('online', reconnected));
            for (const type of ['pagehide', 'visibilitychange']) {
                const target = type === 'visibilitychange' && globalObject.document ? globalObject.document : globalObject;
                target.addEventListener(type, onHide);
                listeners.push(() => target.removeEventListener(type, onHide));
            }
        }
        // 先拉文件再挂写钩子：拉取期间启动流程写进来的默认配置不该被记成「本机未上传改动」，
        // 否则 changedAt 会盖过云端文件时间，把该 restore 的首启判成 upload，用默认值覆盖掉云端 DNA 等配置。
        let file;
        try { file = await fetchFile(); } catch (error) { if (!stopped) { uploadAttempts = 1; unhook = hook(); queueUpload(error.message); } return { ok: false, reason: 'settings-file-read-failed' }; }
        if (stopped) return { ok: false, reason: 'stopped' };
        const meta = readMeta(storage);
        unhook = hook();
        const action = resolveSyncAction(file, meta, Object.keys(collectGlobalSettings(storage)).length > 0);
        if (action === 'restore') {
            applying = true;
            let changed = 0;
            try { changed = applyGlobalSettings(storage, Object.fromEntries(Object.entries(file.settings).filter(([key]) => !key.startsWith(MAP_CUSTOM_PREFIX))), (file.deletedKeys || []).filter(key => !key.startsWith(MAP_CUSTOM_PREFIX))); } finally { applying = false; }
            writeMeta({ syncedAt: Number(file.savedAt) || 0, changedAt: 0, changedKeys: [], deletedKeys: file.deletedKeys || [] });
            lastUploaded = JSON.stringify(collectGlobalSettings(storage));
            if (changed && typeof onRestored === 'function') onRestored({ changed });
            return { ok: true, action, changed };
        }
        if (action === 'upload') return { ok: await upload(), action };
        if (file) lastUploaded = JSON.stringify(collectGlobalSettings(storage));
        return { ok: true, action };
    }

    function stop() {
        stopped = true;
        recoveryNotice.end();
        clearTimeout(timer);
        timer = null;
        if (unhook) unhook();
        unhook = null;
        for (const off of listeners.splice(0)) off();
    }

    return { start, stop, flush() {
        if (uploading) return uploading;
        if (!timer && !lastError && !readMeta(storage).changedAt) return Promise.resolve(true);
        uploadAttempts = 0; recoveryNotice.end();
        return upload();
    }, diagnostics: () => ({ attempts: uploadAttempts, retryPaused: uploadAttempts >= RECOVERY_ATTEMPTS, lastError }) };
}
