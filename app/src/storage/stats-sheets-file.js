// 跨聊天沿用的 NPC 角色卡（localStorage 键 igs-stats-sheets-v1）镜像到酒馆本地 user/files/igs-stats-sheets.json，清浏览器缓存后还在。
// 运行时仍读写 localStorage；启动时读回文件，与本机按卡合并（同一张卡取 at 较新的），合并后超出上限按最近使用淘汰；本机改了就防抖上传。
// 卡片体积较大，不并进 igs-settings.json，免得每次改设置都整份上传。
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';
import { SHEET_STORE_KEY, SHEET_STORE_MAX } from '../scene/stats/stat-sheet-store.js';
import { writeCheckedStorage } from './checked-storage-write.js';

export const STATS_SHEETS_FILE_NAME = 'igs-stats-sheets.json';
const FILE_URL = `/user/files/${STATS_SHEETS_FILE_NAME}`;

const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

function utf8Base64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return globalThis.btoa(binary);
}

// 按卡合并：同键取 at 较新的；结果超过上限时按 at 从新到旧保留。返回新对象，不改入参。
export function mergeSheetMaps(local, fromFile, max = SHEET_STORE_MAX) {
    const out = { ...(plain(local) || {}) };
    for (const [key, row] of Object.entries(plain(fromFile) || {})) {
        if (!plain(row) || !plain(row.sheet)) continue;
        const own = out[key];
        if (!plain(own) || (Number(row.at) || 0) > (Number(own.at) || 0)) out[key] = row;
    }
    const keys = Object.keys(out).sort((a, b) => (out[b].at || 0) - (out[a].at || 0));
    for (const key of keys.slice(max)) delete out[key];
    return out;
}

export function createStatsSheetsFile(globalObject, { storage, debounceMs = 2000 } = {}) {
    let timer = null;
    let loaded = false;
    let lastUploaded = '';
    const headers = () => {
        const ctx = getSillyTavernContext(globalObject);
        return ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : null;
    };
    const readLocal = () => {
        try { return plain(JSON.parse(storage.getItem(SHEET_STORE_KEY) || '{}')) || {}; } catch { return {}; }
    };

    async function upload() {
        timer = null;
        const h = headers();
        if (!h || !loaded) return false;
        const body = JSON.stringify(readLocal());
        if (body === lastUploaded) return true;
        const text = `{"version":1,"savedAt":${Date.now()},"sheets":${body}}`;
        try {
            const res = await globalObject.fetch('/api/files/upload', {
                method: 'POST', headers: h, body: JSON.stringify({ name: STATS_SHEETS_FILE_NAME, data: utf8Base64(text) }),
            });
            if (res && res.ok) { lastUploaded = body; return true; }
        } catch { /* 下次改动再试 */ }
        return false;
    }

    // 读回文件并与本机合并；本机比文件多出内容时再上传一次。读回之前不上传，免得用不全的本机内容覆盖文件。
    async function load() {
        if (typeof globalObject.fetch !== 'function' || !storage) return { ok: false, reason: 'no-tavern' };
        let fromFile = null;
        try {
            const res = await globalObject.fetch(`${FILE_URL}?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) { const file = await res.json(); fromFile = plain(file && file.sheets); }
            else if (res.status !== 404) return { ok: false, reason: 'stats-sheets-file-read-failed' };
        } catch { return { ok: false, reason: 'stats-sheets-file-read-failed' }; }
        loaded = true;
        if (fromFile) lastUploaded = JSON.stringify(fromFile);
        const local = readLocal();
        const merged = mergeSheetMaps(local, fromFile);
        const text = JSON.stringify(merged);
        if (text !== JSON.stringify(local)) writeCheckedStorage(storage, SHEET_STORE_KEY, text);
        if (text !== lastUploaded) changed();
        return { ok: true, restored: fromFile ? Object.keys(fromFile).length : 0 };
    }

    function changed() {
        if (!loaded) return;
        clearTimeout(timer);
        timer = setTimeout(() => { void upload(); }, debounceMs);
        timer?.unref?.();
    }

    function flush() {
        if (timer) { clearTimeout(timer); return upload(); }
        return Promise.resolve(true);
    }

    return { load, changed, flush };
}
