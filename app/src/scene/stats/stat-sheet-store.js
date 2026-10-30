// 跨聊天沿用 NPC 角色卡（数值 v2 §6.4 末条）：按「角色卡 + 角色名」存一份已生成的卡，新聊天出现同一角色时直接复制。
// 存在一个 localStorage 键里，最多 120 张，按最近使用淘汰；写入经 writeCheckedStorage（配额满时只清 IGS 白名单键）。
import { writeCheckedStorage } from '../../storage/checked-storage-write.js';

export const SHEET_STORE_KEY = 'igs-stats-sheets-v1';
export const SHEET_STORE_MAX = 120;

export function sheetStoreKey(card, name) {
    return `${String(card || '').slice(0, 80)}|${String(name || '').slice(0, 20)}`;
}

export function createSheetStore(getStorage) {
    const storage = () => { try { return getStorage(); } catch (error) { return null; } };
    function readAll() {
        const s = storage();
        if (!s) return {};
        try {
            const raw = JSON.parse(s.getItem(SHEET_STORE_KEY) || '{}');
            return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        } catch (error) { return {}; }
    }
    return {
        get(card, name) {
            if (!card || !name) return null;
            const row = readAll()[sheetStoreKey(card, name)];
            return row && row.sheet ? row.sheet : null;
        },
        put(card, name, sheet) {
            const s = storage();
            if (!s || !card || !name || !sheet) return { ok: false, reason: 'stats-sheet-store-unavailable' };
            const all = readAll();
            all[sheetStoreKey(card, name)] = { at: Date.now(), sheet: { rank: sheet.rank, attributes: sheet.attributes, skills: sheet.skills, signature: sheet.signature || [] } };
            const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
            for (const key of keys.slice(SHEET_STORE_MAX)) delete all[key];
            return writeCheckedStorage(s, SHEET_STORE_KEY, JSON.stringify(all));
        },
        remove(card, name) {
            const s = storage();
            if (!s) return { ok: false };
            const all = readAll();
            if (!all[sheetStoreKey(card, name)]) return { ok: true, skipped: true };
            delete all[sheetStoreKey(card, name)];
            return writeCheckedStorage(s, SHEET_STORE_KEY, JSON.stringify(all));
        },
    };
}
