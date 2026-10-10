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
        // 旧版底图还是整张 data URL / 超大图：不塞进配置文件，免得把 igs-settings.json 撑成几 MB。
        if (key.startsWith(MAP_CUSTOM_PREFIX) && /^data:/i.test(value)) continue;
        out[key] = value;
    }
    return out;
}

// 只写文件里有的键，不删本机多出来的键（另一台设备没用过的功能不该把这边的设置抹掉）。
export function applyGlobalSettings(storage, settings) {
    let changed = 0;
    for (const [key, value] of Object.entries(settings || {})) {
        if (!isGlobalSettingKey(key) || typeof value !== 'string' || storage.getItem(key) === value) continue;
        storage.setItem(key, value);
        changed++;
    }
    return changed;
}

function readMeta(storage) {
    try {
        const meta = JSON.parse(storage.getItem(SETTINGS_SYNC_META_KEY) || '{}');
        return { syncedAt: Number(meta.syncedAt) || 0, changedAt: Number(meta.changedAt) || 0 };
    } catch { return { syncedAt: 0, changedAt: 0 }; }
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

export function createTavernSettingsSync(globalObject, { storage, onRestored, debounceMs = 1500, now = () => Date.now() } = {}) {
    let timer = null;
    let stopped = false;
    let applying = false;
    let lastUploaded = '';
    let uploading = null;
    let unhook = null;
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
        try {
            const res = await globalObject.fetch(`${SETTINGS_FILE_URL}?t=${now()}`, { cache: 'no-store' });
            if (!res.ok) return null;
            const file = await res.json();
            return file && typeof file === 'object' && file.settings && typeof file.settings === 'object' ? file : null;
        } catch { return null; }
    }

    async function upload() {
        clearTimeout(timer);
        timer = null;
        const h = headers();
        if (stopped || !h) return false;
        const settings = collectGlobalSettings(storage);
        const body = JSON.stringify(settings);
        const before = readMeta(storage);
        if (body === lastUploaded && !before.changedAt) return true;
        const savedAt = now();
        const text = JSON.stringify({ version: 1, savedAt, settings });
        try {
            const res = await globalObject.fetch('/api/files/upload', {
                method: 'POST', headers: h, body: JSON.stringify({ name: SETTINGS_FILE_NAME, data: utf8Base64(text) }),
            });
            if (!res || !res.ok) return false;
        } catch { return false; }
        lastUploaded = body;
        // 上传途中本机又改了：保留 changedAt，等下一次防抖上传。
        const after = readMeta(storage);
        writeMeta({ syncedAt: savedAt, changedAt: after.changedAt > before.changedAt ? after.changedAt : 0 });
        return true;
    }

    function queueUpload() {
        if (stopped) return;
        clearTimeout(timer);
        timer = setTimeout(() => { uploading = upload().finally(() => { uploading = null; }); }, debounceMs);
    }

    function markChanged() {
        if (applying || stopped) return;
        writeMeta({ ...readMeta(storage), changedAt: now() });
        queueUpload();
    }

    // 配置散在各模块直接写 localStorage，只在本机这个 Storage 上、命中全局配置键时才记一笔。
    function hook() {
        if (!proto || proto === Object.prototype || typeof rawSet !== 'function' || typeof rawRemove !== 'function') return null;
        const setItem = function setItem(key, value) {
            const result = rawSet.call(this, key, value);
            if (this === storage && isGlobalSettingKey(key)) markChanged();
            return result;
        };
        const removeItem = function removeItem(key) {
            const result = rawRemove.call(this, key);
            if (this === storage && isGlobalSettingKey(key)) markChanged();
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

    async function start() {
        if (!headers() || typeof globalObject.fetch !== 'function') return { ok: false, reason: 'no-tavern' };
        if (globalObject.addEventListener) {
            for (const type of ['pagehide', 'visibilitychange']) {
                const target = type === 'visibilitychange' && globalObject.document ? globalObject.document : globalObject;
                target.addEventListener(type, onHide);
                listeners.push(() => target.removeEventListener(type, onHide));
            }
        }
        // 先拉文件再挂写钩子：拉取期间启动流程写进来的默认配置不该被记成「本机未上传改动」，
        // 否则 changedAt 会盖过云端文件时间，把该 restore 的首启判成 upload，用默认值覆盖掉云端 DNA 等配置。
        const file = await fetchFile();
        if (stopped) return { ok: false, reason: 'stopped' };
        const meta = readMeta(storage);
        unhook = hook();
        const action = resolveSyncAction(file, meta, Object.keys(collectGlobalSettings(storage)).length > 0);
        if (action === 'restore') {
            applying = true;
            let changed = 0;
            try { changed = applyGlobalSettings(storage, file.settings); } finally { applying = false; }
            writeMeta({ syncedAt: Number(file.savedAt) || 0, changedAt: 0 });
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
        clearTimeout(timer);
        timer = null;
        if (unhook) unhook();
        unhook = null;
        for (const off of listeners.splice(0)) off();
    }

    return { start, stop, flush: () => (timer ? upload() : uploading || Promise.resolve(true)) };
}
