// CG 库服务：只读 igs-illustrations 的 done 槽位分页 + igs-cg-gallery 的隐藏/收藏标记，合成库条目。
// 「隐藏」只写标记库；「删除」调用既有 clearIllustration（楼层 CG 同时消失），成功后才清标记。
import { parseFloorKey } from './illustration-store.js';

const DISPLAY_URL_RE = /^(?:data:image\/|https?:\/\/|blob:)/i;

export function cgEntryOf(slot, mark) {
    if (!slot || !slot.floorKey) return null;
    const floor = parseFloorKey(slot.floorKey);
    const index = Number(slot.slot);
    if (!floor || !Number.isInteger(index) || index < 1) return null;
    return {
        key: `${slot.floorKey}|${index}`,
        floorKey: slot.floorKey,
        ...floor,
        slot: index,
        dataUrl: String(slot.dataUrl || ''),
        prompt: String(slot.scene || ''),
        updatedAt: String(slot.updatedAt || ''),
        hidden: Boolean(mark && mark.hidden),
        favorite: Boolean(mark && mark.favorite),
    };
}

export function createCgGalleryService({ illustrationStore, galleryStore, clearIllustration, now } = {}) {
    const stamp = typeof now === 'function' ? now : () => new Date().toISOString();
    const available = () => Boolean(illustrationStore && typeof illustrationStore.listDoneSlotsPage === 'function');

    async function readMarks() {
        if (!galleryStore) return new Map();
        try { return new Map((await galleryStore.getAll()).map((m) => [m.key, m])); } catch (error) { return new Map(); }
    }

    // 单页结果可能少于 limit（被筛掉的条目不补齐）；next 为空表示已到末尾。
    async function loadPage({ after = '', limit = 24, showHidden = false, favoritesOnly = false, chatId = '', deferImages = false } = {}) {
        if (!available()) return { ok: false, reason: 'store-unavailable', items: [], next: '' };
        let page;
        try { page = await illustrationStore.listDoneSlotsPage({ after, limit, deferImages }); }
        catch (error) { return { ok: false, reason: 'read-error', items: [], next: '' }; }
        const marks = await readMarks();
        const items = (page.items || [])
            .map((slot) => cgEntryOf(slot, marks.get(`${slot.floorKey}|${Number(slot.slot)}`)))
            .filter(Boolean)
            .filter((entry) => (showHidden || !entry.hidden) && (!favoritesOnly || entry.favorite) && (!chatId || entry.chatId === chatId));
        return { ok: true, items, next: String(page.next || '') };
    }

    async function setMark(key, patch) {
        if (!galleryStore) return { ok: false, reason: 'store-unavailable' };
        const current = (await galleryStore.get(key)) || { key, hidden: false, favorite: false };
        return galleryStore.put({ ...current, ...patch, key, updatedAt: stamp() });
    }

    async function remove(entry) {
        if (!entry || typeof clearIllustration !== 'function') return { ok: false, reason: 'delete-unavailable' };
        const result = await clearIllustration({ chatId: entry.chatId, messageId: entry.messageId, swipeId: entry.swipeId, slot: entry.slot });
        if (!result || !result.ok) return { ok: false, reason: (result && result.reason) || 'delete-failed' };
        if (galleryStore) { try { await galleryStore.remove(entry.key); } catch (error) { /* 标记残留不影响楼层，下次加载会被忽略 */ } }
        return { ok: true };
    }

    async function removeMany(entries) {
        const keys = [];
        let failed = 0;
        for (const entry of entries || []) {
            const result = await remove(entry);
            if (result && result.ok) keys.push(entry.key);
            else failed += 1;
        }
        return { ok: failed === 0, removed: keys.length, failed, keys };
    }

    // 按页删完库里的 CG。某一页一张都删不掉就停，避免失败记录被反复读到。
    async function removeAll() {
        let removed = 0;
        let failed = 0;
        for (let guard = 0; guard < 500; guard += 1) {
            const page = await loadPage({ limit: 48, showHidden: true });
            if (!page.ok) return { ok: false, reason: page.reason, removed, failed, keys: [] };
            if (!page.items.length) break;
            const batch = await removeMany(page.items);
            removed += batch.removed;
            failed += batch.failed;
            if (!batch.removed) break;
        }
        return { ok: failed === 0, removed, failed, keys: [] };
    }

    async function hydrateEntry(entry) {
        if (!entry || DISPLAY_URL_RE.test(String(entry.dataUrl || ''))) return entry;
        if (typeof illustrationStore.hydrateSlot !== 'function') return entry;
        const next = await illustrationStore.hydrateSlot({ dataUrl: entry.dataUrl });
        return { ...entry, dataUrl: String(next && next.dataUrl || '') };
    }

    return {
        loadPage,
        hydrateEntry,
        setHidden: (key, hidden) => setMark(key, { hidden: hidden === true }),
        setFavorite: (key, favorite) => setMark(key, { favorite: favorite === true }),
        remove,
        removeMany,
        removeAll,
    };
}
