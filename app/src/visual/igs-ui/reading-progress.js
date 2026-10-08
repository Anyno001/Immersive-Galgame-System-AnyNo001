// 阅读进度库：每个聊天一份，存 localStorage `igs-reading:<chatId>`，关闭阅读器时另存一份进聊天元数据跟着聊天走。
// 位置 = { id 楼号, page 页码, head 页首指纹, hash 楼文本哈希, at 时间 }；分页或楼内容变了用 head / hash 找回或退回第 1 页。
// last 上次读到哪（任何楼都记）；far 最远读到哪（往回翻不倒退）；read 读完的楼；partial 读了一半的楼的最大页码；
// chapters 读过的楼里地点变化处（楼号 → 地点名），目录按它分章；slots 手动存档位（上限 10）；quick 快速存档。
export const READING_PROGRESS_PREFIX = 'igs-reading:';
export const LEGACY_TURN_BOOKMARK_PREFIX = 'igs-turn-bookmark:';
export const READING_SLOT_LIMIT = 10;
export const READING_METADATA_KEY = 'igs_reading';
const HEAD_LENGTH = 24;
const CHAPTER_LIMIT = 300;

export function textHead(value) {
    return String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, '').slice(0, HEAD_LENGTH);
}

export function segmentText(segment) {
    if (segment == null) return '';
    if (typeof segment === 'string') return segment;
    return String(segment.text ?? segment.displayText ?? segment.content ?? '');
}

export function textHash(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

// 已读楼号压成区间串："0-4,6,8-12"。
export function encodeIdSet(ids) {
    const sorted = Array.from(new Set(Array.from(ids || []).map(Number).filter(Number.isInteger))).sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < sorted.length; i += 1) {
        const start = sorted[i];
        let end = start;
        while (sorted[i + 1] === end + 1) { end += 1; i += 1; }
        parts.push(start === end ? String(start) : `${start}-${end}`);
    }
    return parts.join(',');
}

export function decodeIdSet(text) {
    const set = new Set();
    for (const part of String(text || '').split(',')) {
        const [a, b] = part.split('-').map((n) => Number(n));
        if (!Number.isInteger(a)) continue;
        const end = Number.isInteger(b) && b >= a && b - a < 100000 ? b : a;
        for (let id = a; id <= end; id += 1) set.add(id);
    }
    return set;
}

function cleanPosition(pos) {
    if (!pos || typeof pos !== 'object') return null;
    const id = Number(pos.id);
    if (!Number.isInteger(id) || id < 0) return null;
    return {
        id,
        page: Math.max(0, Number(pos.page) || 0),
        head: String(pos.head || '').slice(0, HEAD_LENGTH),
        hash: String(pos.hash || ''),
        at: Number(pos.at) || 0,
    };
}

function cleanSlot(slot) {
    const pos = cleanPosition(slot);
    if (!pos) return null;
    const thumb = typeof slot.thumb === 'string' && /^(https?:|\/)/.test(slot.thumb) && slot.thumb.length < 600 ? slot.thumb : '';
    return { ...pos, key: String(slot.key || `s${pos.at || Date.now()}`), name: String(slot.name || '').slice(0, 40), thumb, place: String(slot.place || '').slice(0, 40) };
}

function emptyData() {
    return { v: 1, last: null, far: null, read: '', partial: {}, chapters: {}, slots: [], quick: null };
}

export function normalizeReadingData(raw) {
    const data = emptyData();
    if (!raw || typeof raw !== 'object') return data;
    data.last = cleanPosition(raw.last);
    data.far = cleanPosition(raw.far);
    data.read = encodeIdSet(decodeIdSet(raw.read));
    for (const [id, page] of Object.entries(raw.partial || {})) {
        if (Number.isInteger(Number(id)) && Number(page) >= 0) data.partial[id] = Math.floor(Number(page));
    }
    for (const [id, name] of Object.entries(raw.chapters || {})) {
        if (Number.isInteger(Number(id)) && name) data.chapters[id] = String(name).slice(0, 40);
    }
    data.slots = (Array.isArray(raw.slots) ? raw.slots : []).map(cleanSlot).filter(Boolean).slice(0, READING_SLOT_LIMIT);
    data.quick = raw.quick ? cleanSlot(raw.quick) : null;
    return data;
}

// 两份进度合并（本机 + 聊天元数据）：位置取更新的，已读取并集，存档位按 key 取更新的。
export function mergeReadingData(a, b) {
    const left = normalizeReadingData(a);
    const right = normalizeReadingData(b);
    const newer = (x, y) => (!x ? y : !y ? x : (y.at > x.at ? y : x));
    const farther = (x, y) => (!x ? y : !y ? x : (y.id > x.id || (y.id === x.id && y.page > x.page) ? y : x));
    const read = decodeIdSet(left.read);
    for (const id of decodeIdSet(right.read)) read.add(id);
    const partial = { ...left.partial };
    for (const [id, page] of Object.entries(right.partial)) partial[id] = Math.max(partial[id] || 0, page);
    for (const id of read) delete partial[id];
    const slots = new Map();
    for (const slot of [...left.slots, ...right.slots]) slots.set(slot.key, newer(slots.get(slot.key), slot));
    return normalizeReadingData({
        last: newer(left.last, right.last),
        far: farther(left.far, right.far),
        read: encodeIdSet(read),
        partial,
        chapters: { ...right.chapters, ...left.chapters },
        slots: Array.from(slots.values()).sort((x, y) => y.at - x.at),
        quick: newer(left.quick, right.quick),
    });
}

// 在新分页里找回位置：先按页首指纹，再按原页码（夹在范围内），楼文本变了退回第 1 页。
export function resolvePositionPage(pos, segments, floorText = null) {
    const list = Array.isArray(segments) ? segments : [];
    const max = Math.max(0, list.length - 1);
    if (!pos) return { page: 0, reason: 'none' };
    if (floorText != null && pos.hash && textHash(floorText) !== pos.hash) {
        const byHead = pos.head ? list.findIndex((seg) => textHead(segmentText(seg)) === pos.head) : -1;
        return byHead >= 0 ? { page: byHead, reason: 'head' } : { page: 0, reason: 'changed' };
    }
    if (pos.head) {
        const at = list[Math.min(pos.page, max)];
        if (at != null && textHead(segmentText(at)) === pos.head) return { page: Math.min(pos.page, max), reason: 'exact' };
        const byHead = list.findIndex((seg) => textHead(segmentText(seg)) === pos.head);
        if (byHead >= 0) return { page: byHead, reason: 'head' };
        return { page: Math.min(pos.page, max), reason: pos.page > max ? 'clamped' : 'repaged' };
    }
    return { page: Math.min(pos.page, max), reason: pos.page > max ? 'clamped' : 'exact' };
}

// 书签楼没了：退到它前面最近的楼，再没有就第一楼。
export function resolvePositionFloor(pos, ids) {
    const list = (ids || []).map(Number);
    if (!pos || !list.length) return { index: -1, reason: 'none' };
    const exact = list.indexOf(pos.id);
    if (exact >= 0) return { index: exact, reason: 'exact' };
    let index = -1;
    for (let i = 0; i < list.length; i += 1) if (list[i] < pos.id) index = i;
    return { index: Math.max(0, index), reason: 'missing' };
}

export function createReadingProgress(options = {}) {
    const getChatId = () => { try { return String(options.getChatId?.() || ''); } catch (_) { return ''; } };
    const storage = () => { try { return options.storage?.() || null; } catch (_) { return null; } };
    const now = () => (typeof options.now === 'function' ? options.now() : Date.now());
    let cache = { chatId: '', data: emptyData(), readSet: new Set() };

    function load() {
        const chatId = getChatId();
        if (cache.chatId === chatId && chatId) return cache;
        let data = emptyData();
        const store = storage();
        if (chatId && store) {
            try {
                const raw = store.getItem(READING_PROGRESS_PREFIX + chatId);
                if (raw) data = normalizeReadingData(JSON.parse(raw));
                else {
                    // 旧书签「楼号:页码」迁过来，迁完删旧键。
                    const legacy = store.getItem(LEGACY_TURN_BOOKMARK_PREFIX + chatId);
                    const [id, page] = String(legacy || '').split(':').map(Number);
                    if (legacy && Number.isInteger(id)) data.last = cleanPosition({ id, page, at: now() });
                    if (legacy) store.removeItem(LEGACY_TURN_BOOKMARK_PREFIX + chatId);
                }
            } catch (_) { data = emptyData(); }
        }
        cache = { chatId, data, readSet: decodeIdSet(data.read) };
        return cache;
    }

    function save() {
        const store = storage();
        if (!cache.chatId || !store) return;
        cache.data.read = encodeIdSet(cache.readSet);
        try { store.setItem(READING_PROGRESS_PREFIX + cache.chatId, JSON.stringify(cache.data)); } catch (_) { /* 存储满时进度只留在内存 */ }
    }

    // 读到某页：更新上次位置、最远位置、已读和章节。
    function notePage(info = {}) {
        const c = load();
        if (!c.chatId) return null;
        const id = Number(info.id);
        if (!Number.isInteger(id) || id < 0) return null;
        const total = Math.max(1, Number(info.total) || 1);
        const page = Math.max(0, Math.min(total - 1, Number(info.page) || 0));
        const pos = cleanPosition({ id, page, head: textHead(info.text), hash: info.floorText != null ? textHash(info.floorText) : '', at: now() });
        c.data.last = pos;
        const far = c.data.far;
        if (!far || id > far.id || (id === far.id && page > far.page)) c.data.far = pos;
        if (page >= total - 1) {
            c.readSet.add(id);
            delete c.data.partial[id];
        } else if (!c.readSet.has(id)) {
            c.data.partial[id] = Math.max(c.data.partial[id] || 0, page);
        }
        const place = String(info.place || '').trim().slice(0, 40);
        if (place && chapterAt(id) !== place) {
            c.data.chapters[id] = place;
            const keys = Object.keys(c.data.chapters).map(Number).sort((a, b) => a - b);
            for (const k of keys.slice(0, Math.max(0, keys.length - CHAPTER_LIMIT))) delete c.data.chapters[k];
        }
        save();
        return pos;
    }

    function chapterAt(id) {
        const chapters = load().data.chapters;
        let best = -1;
        for (const key of Object.keys(chapters)) {
            const k = Number(key);
            if (k <= id && k > best) best = k;
        }
        return best >= 0 ? chapters[best] : '';
    }

    function floorState(id) {
        const c = load();
        if (c.readSet.has(Number(id))) return 'read';
        return c.data.partial[Number(id)] != null ? 'partial' : 'unread';
    }

    function firstUnread(ids) {
        return (ids || []).map(Number).find((id) => floorState(id) !== 'read') ?? null;
    }

    function isPageRead(id, page) {
        const c = load();
        if (c.readSet.has(Number(id))) return true;
        const max = c.data.partial[Number(id)];
        return max != null && Number(page) <= max;
    }

    function saveSlot(pos, extra = {}) {
        const c = load();
        const clean = cleanSlot({ ...pos, ...extra, key: extra.key || `s${now()}`, at: now() });
        if (!c.chatId || !clean) return { ok: false, reason: 'no-position' };
        const index = c.data.slots.findIndex((slot) => slot.key === clean.key);
        if (index >= 0) c.data.slots[index] = { ...clean, name: extra.name != null ? clean.name : c.data.slots[index].name };
        else if (c.data.slots.length >= READING_SLOT_LIMIT) return { ok: false, reason: 'slots-full' };
        else c.data.slots.unshift(clean);
        save();
        return { ok: true, slot: clean };
    }

    function removeSlot(key) {
        const c = load();
        c.data.slots = c.data.slots.filter((slot) => slot.key !== key);
        save();
    }

    function renameSlot(key, name) {
        const slot = load().data.slots.find((item) => item.key === key);
        if (!slot) return false;
        slot.name = String(name || '').slice(0, 40);
        save();
        return true;
    }

    function quickSave(pos, extra = {}) {
        const c = load();
        const clean = cleanSlot({ ...pos, ...extra, key: 'quick', at: now() });
        if (!c.chatId || !clean) return null;
        c.data.quick = clean;
        save();
        return clean;
    }

    function exportData() {
        const c = load();
        c.data.read = encodeIdSet(c.readSet);
        return JSON.parse(JSON.stringify(c.data));
    }

    function importData(raw) {
        const c = load();
        if (!c.chatId || !raw) return false;
        c.data = mergeReadingData(c.data, raw);
        c.readSet = decodeIdSet(c.data.read);
        save();
        return true;
    }

    return {
        load: () => load().data,
        notePage,
        getLast: () => load().data.last,
        getFarthest: () => load().data.far,
        getQuick: () => load().data.quick,
        listSlots: () => load().data.slots.slice(),
        floorState,
        firstUnread,
        isPageRead,
        chapterAt,
        saveSlot,
        removeSlot,
        renameSlot,
        quickSave,
        exportData,
        importData,
        reset() { cache = { chatId: '', data: emptyData(), readSet: new Set() }; },
    };
}
