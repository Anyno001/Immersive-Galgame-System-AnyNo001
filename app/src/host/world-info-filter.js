import { getSillyTavernContext, getTavernHelper } from './tavern-helper-adapter.js';

// 生图写词的世界书排除名单：books 整本不参与，entries[书名] 是该书里不参与的条目编号。只影响写词，不影响主聊天。
export const CARD_BOOK = '@card';

export function normalizeWorldInfoExclude(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const name = item => String(item == null ? '' : item).trim();
    const books = [...new Set((Array.isArray(src.books) ? src.books : []).map(name).filter(Boolean))];
    const entries = {};
    const map = src.entries && typeof src.entries === 'object' && !Array.isArray(src.entries) ? src.entries : {};
    for (const [book, list] of Object.entries(map)) {
        const ids = [...new Set((Array.isArray(list) ? list : []).map(name).filter(Boolean))];
        if (name(book) && ids.length) entries[name(book)] = ids;
    }
    return { books, entries };
}

export function countWorldInfoExclude(value) {
    const exclude = normalizeWorldInfoExclude(value);
    return exclude.books.length + Object.values(exclude.entries).reduce((sum, list) => sum + list.length, 0);
}

export function isWorldInfoExcluded(exclude, book, uid) {
    if (!exclude) return false;
    const name = String(book == null ? '' : book).trim();
    if (exclude.books.includes(name)) return true;
    const list = exclude.entries[name];
    return Boolean(list && uid != null && list.includes(String(uid).trim()));
}

export function toggleWorldInfoBook(value, book) {
    const exclude = normalizeWorldInfoExclude(value);
    const books = exclude.books.includes(book) ? exclude.books.filter(item => item !== book) : exclude.books.concat([book]);
    return { ...exclude, books };
}

export function toggleWorldInfoEntry(value, book, uid) {
    const exclude = normalizeWorldInfoExclude(value);
    const id = String(uid);
    const list = exclude.entries[book] || [];
    const nextList = list.includes(id) ? list.filter(item => item !== id) : list.concat([id]);
    const entries = { ...exclude.entries };
    if (nextList.length) entries[book] = nextList;
    else delete entries[book];
    return { ...exclude, entries };
}

// 原生扫描前酒馆发 WORLDINFO_ENTRIES_LOADED，交出本次新建的条目数组；只拦本次扫描的第一次，删掉排除的条目。
export function attachWorldInfoExclude(ctx, value) {
    const exclude = normalizeWorldInfoExclude(value);
    const source = ctx && ctx.eventSource;
    const name = ctx && ctx.eventTypes && ctx.eventTypes.WORLDINFO_ENTRIES_LOADED;
    if (!countWorldInfoExclude(exclude) || !source || typeof source.on !== 'function' || !name) return () => {};
    let used = false;
    const handler = (lore) => {
        if (used || !lore || typeof lore !== 'object') return;
        used = true;
        for (const key of ['globalLore', 'characterLore', 'chatLore', 'personaLore']) {
            const list = lore[key];
            if (!Array.isArray(list)) continue;
            for (let i = list.length - 1; i >= 0; i -= 1) {
                if (isWorldInfoExcluded(exclude, list[i] && list[i].world, list[i] && list[i].uid)) list.splice(i, 1);
            }
        }
    };
    source.on(name, handler);
    return () => {
        const off = typeof source.removeListener === 'function' ? source.removeListener : source.off;
        try { if (typeof off === 'function') off.call(source, name, handler); } catch { /* 已解绑 */ }
    };
}

const SOURCE_LABELS = Object.freeze({ chat: '聊天', primary: '角色主世界书', additional: '角色附加', global: '全局', persona: '用户人设', card: '角色卡内嵌' });

// 当前会参与扫描的书名与来源；条目按需读取。
export function listActiveWorldInfoBooks(globalObject = globalThis) {
    const ctx = getSillyTavernContext(globalObject);
    if (!ctx) return { ok: false, reason: 'context-unavailable', books: [] };
    const found = new Map();
    const add = (book, source) => {
        const name = typeof book === 'string' ? book.trim() : '';
        if (!name) return;
        if (!found.has(name)) found.set(name, { name, label: name, sources: [] });
        const row = found.get(name);
        if (!row.sources.includes(SOURCE_LABELS[source])) row.sources.push(SOURCE_LABELS[source]);
    };
    add(ctx.chatMetadata && ctx.chatMetadata.world_info, 'chat');
    const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
    const card = ctx.characterId != null ? characters[ctx.characterId] : null;
    add(card && card.data && card.data.extensions && card.data.extensions.world, 'primary');
    const helper = getTavernHelper(globalObject);
    try {
        const bound = helper && typeof helper.getCharWorldbookNames === 'function' ? helper.getCharWorldbookNames('current') : null;
        if (bound) {
            add(bound.primary, 'primary');
            (Array.isArray(bound.additional) ? bound.additional : []).forEach(book => add(book, 'additional'));
        }
    } catch { /* 读不到附加世界书就只列主世界书 */ }
    try {
        const globals = helper && typeof helper.getGlobalWorldbookNames === 'function'
            ? helper.getGlobalWorldbookNames()
            : (helper && typeof helper.getLorebookSettings === 'function' ? (helper.getLorebookSettings() || {}).selected_global_lorebooks : []);
        (Array.isArray(globals) ? globals : []).forEach(book => add(book, 'global'));
    } catch { /* 读不到全局世界书就不列 */ }
    add(ctx.powerUserSettings && ctx.powerUserSettings.persona_description_lorebook, 'persona');
    const books = [...found.values()];
    const embedded = card && card.data && card.data.character_book && card.data.character_book.entries;
    if (Array.isArray(embedded) && embedded.length) books.push({ name: CARD_BOOK, label: SOURCE_LABELS.card, sources: [] });
    return { ok: true, books };
}

const entryTitle = (entry, uid) => {
    const comment = String(entry.comment || entry.name || '').trim();
    if (comment) return comment;
    const keys = [].concat(entry.key || entry.keys || []).map(k => String(k || '').trim()).filter(Boolean);
    return keys.length ? keys.slice(0, 3).join('、') : `条目 ${uid}`;
};

// 读一本书里开着的条目（标题 + 编号）；卡内嵌的条目按下标编号，和读角色参考时一致。
export async function readWorldInfoBookEntries(globalObject, book) {
    const ctx = getSillyTavernContext(globalObject);
    if (!ctx) return { ok: false, reason: 'context-unavailable', entries: [] };
    if (book === CARD_BOOK) {
        const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
        const card = ctx.characterId != null ? characters[ctx.characterId] : null;
        const list = card && card.data && card.data.character_book && card.data.character_book.entries;
        const entries = (Array.isArray(list) ? list : []).map((entry, index) => ({ entry, uid: String(entry && entry.id != null ? entry.id : index) }))
            .filter(({ entry }) => entry && entry.enabled !== false && String(entry.content || '').trim())
            .map(({ entry, uid }) => ({ uid, title: entryTitle(entry, uid) }));
        return { ok: true, entries };
    }
    if (typeof ctx.loadWorldInfo !== 'function') return { ok: false, reason: 'loader-unavailable', entries: [] };
    try {
        const data = await ctx.loadWorldInfo(book);
        if (!data || !data.entries) return { ok: false, reason: 'book-missing', entries: [] };
        const entries = Object.entries(data.entries).map(([key, entry]) => ({ entry, uid: String(entry && entry.uid != null ? entry.uid : key) }))
            .filter(({ entry }) => entry && !entry.disable && String(entry.content || '').trim())
            .map(({ entry, uid }) => ({ uid, title: entryTitle(entry, uid) }));
        return { ok: true, entries };
    } catch {
        return { ok: false, reason: 'book-read-failed', entries: [] };
    }
}
