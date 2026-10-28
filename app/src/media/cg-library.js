import { requireMediaCache } from './media-cache-owner.js';
import { recoverMediaOperation } from './tavern-media-http.js';
import { cgEntryStamp } from './image-identity.js';
export { cgEntryStamp } from './image-identity.js';
// CG 库服务。三层数据各管各的：
// 1. 目录（igs-cg-index entries）：每张楼层 CG / 照片一条轻记录，打开 CG 库只读这里。
// 2. 缩略图（igs-cg-index thumbs）：网格只放缩略图，第一次看到某张时由原图生成后留下。
// 3. 原图（igs-illustrations / igs-photo-album 记录 + 酒馆文件）：只在生成缩略图和看大图时读。
// 目录靠两条路保持准确：插图写入 / 删除时 withCgIndexSync 顺手更新；每次打开 syncIndex 拿两个库的主键对账，
// 补登新增、删掉消失的、复查还没出图的。暂时失败在原步骤恢复，媒体关闭结束等待。
import { parseFloorKey } from './illustration-store.js';
import { composePhoto, PHOTO_ALBUM_LIMIT } from './photo-album.js';

export const CG_PAGE_SIZE = 24;
export const CG_LIBRARY_TIMEOUTS = { index: 8000, keys: 15000, batch: 20000, full: 45000, thumb: 20000, write: 15000 };
const PHOTO_KEY_PREFIX = 'photo|';
const SYNC_BATCH = 20;
const DISPLAY_URL_RE = /^(?:data:image\/|https?:\/\/|blob:)/i;

const REASON_TEXT = {
    'index-timeout': '目录库 8 秒没有响应',
    'index-error': '目录库打不开',
    'index-unavailable': '目录库不可用',
    'keys-timeout': '插图库 15 秒没有返回编号',
    'keys-error': '插图库打不开',
    'photos-timeout': '相册库 15 秒没有返回编号',
    'photos-error': '相册库打不开',
    'marks-timeout': '收藏 / 隐藏记录读取超时',
    'batch-timeout': '读取插图记录超时',
    'batch-error': '读取插图记录出错',
    'full-timeout': '原图读取超时（网络慢或酒馆没响应）',
    'thumb-timeout': '缩略图生成超时',
    'thumb-failed': '缩略图生成失败',
    'file-unreadable': '图片文件读不到（酒馆文件夹里可能已删除，或网络不通）',
    missing: '这张图的记录已经不在了',
    'write-timeout': '保存超时',
    'store-unavailable': 'CG 库不可用',
};

export function cgReasonText(reason) {
    return REASON_TEXT[reason] || '读取出错';
}

const reasonOf = (error, fallback) => (error && typeof error.code === 'string' ? error.code : fallback);

async function settle(promise, fallbackReason) {
    try { return { ok: true, value: await promise }; } catch (error) { return { ok: false, reason: reasonOf(error, fallbackReason), value: null }; }
}

export function parseCgSlotKey(key) {
    const raw = String(key || '');
    const cut = raw.lastIndexOf('|');
    if (cut <= 0) return null;
    const slot = Number(raw.slice(cut + 1));
    const floorKey = raw.slice(0, cut);
    const floor = parseFloorKey(floorKey);
    if (!floor || !Number.isInteger(slot) || slot < 1) return null;
    return { floorKey, slot, ...floor };
}

export function cgEntryFromSlot(key, rec, mark) {
    const parsed = parseCgSlotKey(key);
    if (!parsed) return null;
    return {
        key: String(key),
        kind: 'cg',
        chatId: parsed.chatId,
        messageId: parsed.messageId,
        swipeId: parsed.swipeId,
        slot: parsed.slot,
        photoId: '',
        updatedAt: String((rec && rec.updatedAt) || ''),
        ...(rec?.revisionToken && { revisionToken: rec.revisionToken }),
        ready: Boolean(rec && rec.status === 'done' && rec.dataUrl),
        hidden: Boolean((mark || rec)?.hidden),
        favorite: Boolean((mark || rec)?.favorite),
    };
}

export function cgEntryFromPhoto(photo) {
    if (!photo || !photo.id) return null;
    return {
        key: `${PHOTO_KEY_PREFIX}${photo.id}`,
        kind: 'photo',
        chatId: String(photo.chatId || ''),
        messageId: Number(photo.messageId) || 0,
        swipeId: 0,
        slot: '照片',
        photoId: String(photo.id),
        updatedAt: String(photo.createdAt || ''),
        ready: Boolean(photo.dataUrl),
        hidden: photo.hidden === true,
        favorite: photo.favorite === true,
    };
}

function cgTime(entry) {
    const time = Date.parse(entry && entry.updatedAt);
    return Number.isFinite(time) ? time : 0;
}

// 新图在前。时间一样时，楼层号大的在前。
export function compareCgNewestFirst(a, b) {
    const byTime = cgTime(b) - cgTime(a);
    if (byTime) return byTime;
    const byFloor = (Number(b && b.messageId) || 0) - (Number(a && a.messageId) || 0);
    if (byFloor) return byFloor;
    return String((b && b.key) || '').localeCompare(String((a && a.key) || ''));
}

// filters.oldestFirst：倒过来看，最早的在前（按剧情顺序回看）。
export function filterCgEntries(entries, filters = {}) {
    const chatId = String(filters.chatId || '');
    const order = filters.oldestFirst ? (a, b) => compareCgNewestFirst(b, a) : compareCgNewestFirst;
    return (entries || [])
        .filter((e) => e && e.ready && (filters.showHidden || !e.hidden) && (!filters.favoritesOnly || e.favorite) && (!chatId || e.chatId === chatId))
        .sort(order);
}

export function cgPageCount(total, size = CG_PAGE_SIZE) {
    const count = Math.max(0, Number(total) || 0);
    const pageSize = Math.max(1, Number(size) || CG_PAGE_SIZE);
    return Math.max(1, Math.ceil(count / pageSize));
}

export function cgPageSlice(items, page, size = CG_PAGE_SIZE) {
    const list = Array.isArray(items) ? items : [];
    const pageSize = Math.max(1, Number(size) || CG_PAGE_SIZE);
    const pages = cgPageCount(list.length, pageSize);
    const index = Math.min(Math.max(0, Number(page) || 0), pages - 1);
    const start = index * pageSize;
    return { page: index, pages, total: list.length, items: list.slice(start, start + pageSize) };
}

const sameEntry = (a, b) => Boolean(a && b) && a.ready === b.ready && cgEntryStamp(a) === cgEntryStamp(b) && a.hidden === b.hidden && a.favorite === b.favorite;

// 插图库写入 / 删除槽位时同步目录；目录写失败不影响插图本身，下次打开对账补上。
export function withCgIndexSync(store, indexStore, globalObject = globalThis) {
    if (!store || !indexStore) return store;
    const pending = new Map();
    const syncEntry = async (entry) => {
        if (!entry) return;
        const stamp = cgEntryStamp(entry);
        pending.set(entry.key, stamp);
        await recoverMediaOperation(globalObject, () => indexStore.upsert([entry]));
        if (pending.get(entry.key) === stamp) pending.delete(entry.key);
    };
    return {
        ...store,
        getCgIndexPendingKeys: () => [...pending.keys()],
        confirmCgIndexSynced(entries) {
            for (const entry of entries || []) {
                if (pending.get(entry.key) === cgEntryStamp(entry)) pending.delete(entry.key);
            }
        },
        async putSlot(floorKey, value) {
            const result = await store.putSlot(floorKey, value);
            const entry = cgEntryFromSlot(`${floorKey}|${value && value.slot}`, result, null);
            await syncEntry(entry);
            return result;
        },
        async updateSlot(floorKey, slot, expectedRevision, patch, options = {}) {
            if (typeof store.updateSlot !== 'function') return { ok: false, reason: 'update-unavailable' };
            const result = await store.updateSlot(floorKey, slot, expectedRevision, patch, options);
            if (!result?.ok) return result;
            const entry = cgEntryFromSlot(`${floorKey}|${slot}`, result.record, null);
            await syncEntry(entry);
            return result;
        },
        async deleteSlot(floorKey, slot) {
            const result = await store.deleteSlot(floorKey, slot);
            await recoverMediaOperation(globalObject, () => indexStore.removeMany([`${floorKey}|${slot}`]));
            pending.delete(`${floorKey}|${slot}`);
            return result;
        },
    };
}

export function createCgLibrary(deps = {}) {
    const { illustrationStore, photoStore, marksStore, indexStore, clearIllustration } = deps;
    const recover = (execute, options) => recoverMediaOperation(deps.globalObject || globalThis, execute, options);
    const mediaCache = requireMediaCache(deps.mediaCache || deps.indexStore?.mediaCache, 'cg-library', deps.indexStore?.mediaCache);
    const thumbKey = entry => `thumb:cg:${entry.key}:${cgEntryStamp(entry)}`;
    const timeouts = { ...CG_LIBRARY_TIMEOUTS, ...(deps.timeouts || {}) };
    const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
    const makeId = typeof deps.makeId === 'function' ? deps.makeId : () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const compose = typeof deps.compose === 'function' ? deps.compose : composePhoto;
    const getDocument = typeof deps.getDocument === 'function' ? deps.getDocument : () => globalThis.document;
    const makeThumbnail = typeof deps.makeThumbnail === 'function' ? deps.makeThumbnail : null;
    // 存储和文件读取各自持有生命周期；本地计时不能丢弃同一次操作的迟到结果。
    const step = promise => Promise.resolve(promise);
    const hasPhotos = Boolean(photoStore && typeof photoStore.listIds === 'function');

    async function readIndex() {
        if (!indexStore) return { ok: false, reason: 'index-unavailable', entries: [] };
        const got = await settle(step(indexStore.getAll(), timeouts.index, 'index-timeout'), 'index-error');
        return got.ok ? { ok: true, entries: got.value || [] } : { ok: false, reason: got.reason, entries: [] };
    }

    async function readSlotRecords(keys) {
        if (typeof illustrationStore.getSlotRecords === 'function') return illustrationStore.getSlotRecords(keys);
        return Promise.all(keys.map((key) => illustrationStore.getSlotRecord(key)));
    }

    // 对账：两个库的主键 vs 目录。只读缺的、没出图的那几条记录；目录库坏了也照样返回结果，只是不落盘。
    async function syncIndex(onProgress) {
        const tell = (progress) => { try { if (typeof onProgress === 'function') onProgress(progress); } catch { /* 界面回调出错不影响对账 */ } };
        if (!illustrationStore || typeof illustrationStore.listSlotKeys !== 'function') return { ok: false, reason: 'store-unavailable', entries: [], changed: false };
        tell({ phase: 'keys', done: 0, total: 0 });
        const [indexed, slotKeys, photoIds, marks] = await Promise.all([
            readIndex(),
            settle(step(illustrationStore.listSlotKeys(), timeouts.keys, 'keys-timeout'), 'keys-error'),
            hasPhotos ? settle(step(photoStore.listIds(), timeouts.keys, 'photos-timeout'), 'photos-error') : Promise.resolve({ ok: true, value: [] }),
            marksStore ? settle(step(marksStore.getAll(), timeouts.index, 'marks-timeout'), 'marks-timeout') : Promise.resolve({ ok: true, value: [] }),
        ]);
        const problems = [indexed, slotKeys, photoIds, marks].filter((r) => !r.ok).map((r) => r.reason);
        const byKey = new Map(indexed.entries.map((e) => [e.key, e]));
        const markOf = new Map((marks.value || []).map((m) => [m.key, m]));
        const cgToRead = [];
        const photoToRead = [];
        const drop = [];
        if (slotKeys.ok) {
            const want = new Set((slotKeys.value || []).map(String));
            const pending = new Set(illustrationStore.getCgIndexPendingKeys?.() || []);
            for (const key of want) { const e = byKey.get(key); if (!e || !e.ready || pending.has(key)) cgToRead.push(key); }
            for (const e of byKey.values()) if (e.kind !== 'photo' && !want.has(e.key)) drop.push(e.key);
        }
        if (photoIds.ok) {
            const want = new Set((photoIds.value || []).map((id) => `${PHOTO_KEY_PREFIX}${id}`));
            for (const key of want) { const e = byKey.get(key); if (!e || !e.ready) photoToRead.push(key.slice(PHOTO_KEY_PREFIX.length)); }
            for (const e of byKey.values()) if (e.kind === 'photo' && !want.has(e.key)) drop.push(e.key);
        }
        const total = cgToRead.length + photoToRead.length;
        let done = 0;
        let changed = false;
        const persist = indexed.ok;
        const save = async (rows) => {
            if (!persist || !rows.length) return;
            const saved = await settle(step(indexStore.putMany(rows), timeouts.write, 'write-timeout'), 'write-timeout');
            if (!saved.ok) problems.push(saved.reason);
            else illustrationStore.confirmCgIndexSynced?.(rows);
        };
        if (total) tell({ phase: 'index', done, total });
        for (let i = 0; i < cgToRead.length; i += SYNC_BATCH) {
            const batch = cgToRead.slice(i, i + SYNC_BATCH);
            const got = await settle(step(readSlotRecords(batch), timeouts.batch, 'batch-timeout'), 'batch-error');
            if (!got.ok) { problems.push(got.reason); done += batch.length; tell({ phase: 'index', done, total }); continue; }
            const rows = [];
            batch.forEach((key, index) => {
                const rec = got.value[index];
                const old = byKey.get(key);
                if (!rec) { if (old) drop.push(key); return; }
                const entry = cgEntryFromSlot(key, rec, markOf.get(key) || old);
                if (!entry) return;
                if (!sameEntry(entry, old)) changed = true;
                if (!sameEntry(entry, old) || (illustrationStore.getCgIndexPendingKeys?.() || []).includes(key)) rows.push(entry);
                byKey.set(key, entry);
            });
            await save(rows);
            done += batch.length;
            tell({ phase: 'index', done, total });
        }
        for (let i = 0; i < photoToRead.length; i += SYNC_BATCH) {
            const batch = photoToRead.slice(i, i + SYNC_BATCH);
            const got = await settle(step(photoStore.getMany(batch), timeouts.batch, 'batch-timeout'), 'batch-error');
            if (!got.ok) { problems.push(got.reason); done += batch.length; tell({ phase: 'index', done, total }); continue; }
            const rows = [];
            batch.forEach((id, index) => {
                const key = `${PHOTO_KEY_PREFIX}${id}`;
                const old = byKey.get(key);
                const entry = cgEntryFromPhoto(got.value[index]);
                if (!entry) { if (old) drop.push(key); return; }
                if (!sameEntry(entry, old)) { rows.push(entry); changed = true; }
                byKey.set(key, entry);
            });
            await save(rows);
            done += batch.length;
            tell({ phase: 'index', done, total });
        }
        if (drop.length) {
            changed = true;
            for (const key of drop) byKey.delete(key);
            if (persist) {
                const removed = await settle(step(indexStore.removeMany(drop), timeouts.write, 'write-timeout'), 'write-timeout');
                if (!removed.ok) problems.push(removed.reason);
            }
        }
        return { ok: problems.length === 0, reason: problems[0] || '', entries: Array.from(byKey.values()), changed };
    }

    // 更新通知只是定位依据；从同一权威槽位重读，不把阅读器内存图另存成图库副本。
    async function refreshEntry(key) {
        if (!parseCgSlotKey(key) || !illustrationStore) return { ok: false, reason: 'missing' };
        try {
            const [rec, indexed, mark] = await Promise.all([
                step(illustrationStore.getSlotRecord(key), timeouts.batch, 'batch-timeout'),
                readIndex(),
                marksStore ? step(marksStore.get(key), timeouts.index, 'marks-timeout') : null,
            ]);
            if (!indexed.ok) return { ok: false, reason: indexed.reason };
            if (!rec) {
                await step(indexStore.removeMany([key]), timeouts.write, 'write-timeout');
                return { ok: true, entry: null };
            }
            const old = indexed.entries.find((e) => e.key === key);
            const entry = cgEntryFromSlot(key, rec, mark || old);
            const saved = await recover(() => step(indexStore.putMany([entry]), timeouts.write, 'write-timeout'));
            if (saved?.cancelled) return saved;
            illustrationStore.confirmCgIndexSynced?.([entry]);
            return { ok: true, entry };
        } catch (error) {
            return { ok: false, reason: reasonOf(error, 'batch-error') };
        }
    }

    function forget(entry) {
        if (indexStore && entry) Promise.resolve().then(() => indexStore.patch(entry.key, { ready: false })).catch(() => {});
        return { ok: false, reason: 'missing' };
    }

    // 原图：楼层 CG 先取记录，路径再经酒馆文件层（本地缓存 → 下载）还原；照片同理。
    function readFull(entry, options = {}) {
        const read = () => readFullOnce(entry);
        return recover(read, { ...options, shouldRecover: result => result?.reason !== 'missing',
            observe: async () => {
                const value = await read();
                return { completed: value?.ok === true, value };
            } });
    }

    async function readFullOnce(entry) {
        if (!entry) return { ok: false, reason: 'missing' };
        try {
            if (entry.kind === 'photo') {
                if (!photoStore) return { ok: false, reason: 'store-unavailable' };
                const [raw] = await step(photoStore.getMany([entry.photoId]), timeouts.batch, 'batch-timeout');
                if (!raw || !raw.dataUrl) return forget(entry);
                const photo = await step(photoStore.get(entry.photoId), timeouts.full, 'full-timeout');
                const url = String((photo && photo.dataUrl) || '');
                return DISPLAY_URL_RE.test(url) ? { ok: true, dataUrl: url } : { ok: false, reason: 'file-unreadable' };
            }
            if (!illustrationStore) return { ok: false, reason: 'store-unavailable' };
            const rec = await step(illustrationStore.getSlotRecord(entry.key), timeouts.batch, 'batch-timeout');
            if (!rec || rec.status !== 'done' || !rec.dataUrl) return forget(entry);
            let url = String(rec.dataUrl);
            if (!DISPLAY_URL_RE.test(url) && typeof illustrationStore.hydrateSlot === 'function') {
                const next = await step(illustrationStore.hydrateSlot({ dataUrl: url }), timeouts.full, 'full-timeout');
                url = String((next && next.dataUrl) || '');
            }
            return DISPLAY_URL_RE.test(url) ? { ok: true, dataUrl: url } : { ok: false, reason: 'file-unreadable' };
        } catch (error) {
            return { ok: false, reason: reasonOf(error, 'batch-error') };
        }
    }

    // 已存的缩略图：stamp 与条目时间对得上才算数（同一格重画过就重新生成）。
    async function readThumbs(entries) {
        const list = (entries || []).filter(Boolean);
        if (!indexStore || !list.length) return new Map();
        const stamps = new Map(list.map(entry => [entry.key, mediaCache.token(thumbKey(entry))]));
        const got = await settle(step(indexStore.getThumbs(list.map((e) => e.key)), timeouts.index, 'index-timeout'), 'index-error');
        const out = new Map();
        if (!got.ok || !got.value) return out;
        for (const e of list) {
            const t = got.value.get(e.key);
            if (t && mediaCache.token(thumbKey(e)) === stamps.get(e.key) && DISPLAY_URL_RE.test(t.dataUrl) && t.stamp === cgEntryStamp(e)) out.set(e.key, mediaCache.remember(thumbKey(e), t.dataUrl));
        }
        return out;
    }

    async function makeThumb(entry) {
        const key = thumbKey(entry), generation = mediaCache.token(key);
        try {
            const dataUrl = await mediaCache.load(key, async () => {
                const full = await readFull(entry);
                if (!full.ok) throw Object.assign(new Error(full.reason), { code: full.reason });
                if (!makeThumbnail) return full.dataUrl;
                const small = await step(Promise.resolve().then(() => makeThumbnail(full.dataUrl)), timeouts.thumb, 'thumb-timeout');
                if (!DISPLAY_URL_RE.test(String(small || ''))) throw new Error('thumb-failed');
                return small;
            });
            if (!dataUrl || mediaCache.token(key) !== generation) return { ok: false, reason: 'cache-cleared' };
            return { ok: true, dataUrl: mediaCache.peek(key) || dataUrl };
        } catch (error) { return { ok: false, reason: reasonOf(error, 'thumb-failed') }; }
    }

    async function setFlag(entry, field, value) {
        if (!entry) return { ok: false, reason: 'missing' };
        const saved = await recover(async () => {
            if (entry.kind === 'photo') {
                if (!photoStore) return { ok: false, reason: 'store-unavailable' };
                let result;
                if (photoStore.patchMetadata) result = await step(photoStore.patchMetadata(entry.photoId, { [field]: value }), timeouts.write, 'write-timeout');
                else {
                    const [raw] = await step(photoStore.getMany([entry.photoId]), timeouts.write, 'write-timeout');
                    if (!raw) return { ok: false, reason: 'missing' };
                    result = await step(photoStore.put({ ...raw, [field]: value }), timeouts.write, 'write-timeout');
                }
                if (!result || !result.ok) return result || { ok: false, reason: 'write-timeout' };
            } else {
                if (!marksStore) return { ok: false, reason: 'store-unavailable' };
                const current = (await step(marksStore.get(entry.key), timeouts.write, 'write-timeout')) || { key: entry.key, hidden: false, favorite: false };
                if (illustrationStore?.patchSlotMetadata) {
                    const updated = await illustrationStore.patchSlotMetadata(entry.key, { [field]: value });
                    if (!updated?.ok) return updated;
                }
                const result = await step(marksStore.put({ ...current, [field]: value, key: entry.key, updatedAt: now() }), timeouts.write, 'write-timeout');
                if (!result || !result.ok) return result || { ok: false, reason: 'write-timeout' };
            }
            return { ok: true };
        }, { shouldRecover: result => result?.reason !== 'missing' });
        if (!saved?.ok) return saved;
        if (indexStore) {
            const indexed = await recover(() => step(indexStore.patch(entry.key, { [field]: value }), timeouts.write, 'write-timeout'));
            if (indexed?.cancelled) return indexed;
        }
        return { ok: true };
    }

    async function remove(entry) {
        if (!entry) return { ok: false, reason: 'missing' };
        if (entry.kind === 'photo') {
            if (!photoStore || typeof photoStore.remove !== 'function') return { ok: false, reason: 'delete-unavailable' };
            const result = await recover(() => photoStore.remove(entry.photoId));
            if (!result?.ok) return result;
        } else {
            if (typeof clearIllustration !== 'function') return { ok: false, reason: 'delete-unavailable' };
            const result = await recover(() => clearIllustration({ chatId: entry.chatId, messageId: entry.messageId, swipeId: entry.swipeId, slot: entry.slot }));
            if (!result?.ok) return result;
            if (marksStore) {
                const marked = await recover(() => marksStore.remove(entry.key));
                if (marked?.cancelled) return marked;
            }
        }
        if (indexStore) {
            const indexed = await recover(() => step(indexStore.removeMany([entry.key]), timeouts.write, 'write-timeout'));
            if (indexed?.cancelled) return indexed;
        }
        return { ok: true };
    }

    async function removeMany(entries) {
        const keys = [];
        let failed = 0;
        for (const entry of entries || []) {
            const result = await remove(entry);
            if (result && result.ok && entry && entry.key) keys.push(entry.key);
            else failed += 1;
        }
        return { ok: failed === 0, removed: keys.length, failed, keys };
    }

    async function removeAll() {
        const synced = await syncIndex();
        if (!synced.entries.length && !synced.ok) return { ok: false, reason: synced.reason, removed: 0, failed: 0, keys: [] };
        return removeMany(synced.entries.filter((e) => e.ready));
    }

    async function capturePhoto(shot = {}) {
        if (!photoStore) return { ok: false, reason: 'store-unavailable' };
        const dataUrl = await recover(async () => (await compose(getDocument(), shot)) || { ok: false, reason: 'compose-failed' });
        if (dataUrl?.cancelled) return dataUrl;
        return keepPhoto({ ...shot, dataUrl });
    }

    // 已经是成图（小游戏惩罚 CG 等）：不再合成缩小，原图直接进相册。
    async function keepPhoto(shot = {}) {
        if (!photoStore) return { ok: false, reason: 'store-unavailable' };
        const { dataUrl } = shot;
        const photo = { id: makeId(), chatId: shot.chatId, messageId: shot.messageId, caption: shot.caption, dataUrl, createdAt: now() };
        const result = await recover(() => photoStore.put(photo));
        if (result && result.ok) {
            const entry = cgEntryFromPhoto(result.photo);
            if (indexStore && entry) {
                const indexed = await recover(() => indexStore.putMany([entry]));
                if (indexed?.cancelled) return indexed;
            }
            const photos = await recover(() => photoStore.list({ deferImages: true }));
            if (photos?.cancelled) return photos;
            const extra = photos.slice(PHOTO_ALBUM_LIMIT).filter((p) => !p.favorite);
            for (const old of extra) {
                const removed = await recover(() => photoStore.remove(old.id));
                if (removed?.cancelled) return removed;
            }
            if (indexStore && extra.length) {
                const indexed = await recover(() => indexStore.removeMany(extra.map((p) => `${PHOTO_KEY_PREFIX}${p.id}`)));
                if (indexed?.cancelled) return indexed;
            }
        }
        return result;
    }

    return {
        readIndex,
        syncIndex,
        refreshEntry,
        onChanged: (handler) => deps.onIllustrationUpdated?.(handler) || (() => {}),
        readThumbs,
        makeThumb,
        mediaCache,
        readFull,
        setHidden: (entry, hidden) => setFlag(entry, 'hidden', hidden === true),
        setFavorite: (entry, favorite) => setFlag(entry, 'favorite', favorite === true),
        remove,
        removeMany,
        removeAll,
        capturePhoto,
        keepPhoto,
    };
}
