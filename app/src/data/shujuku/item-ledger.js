// 物品账本：按聊天记住出现过的物品与物品表上一份快照，比对出最新 AI 楼的「获得 / 失去」，并判定是否初次获得。
// 只存物品名与楼层号，不存图片与正文；读写本机 localStorage，不进全局配置同步。
import { normalizeItemName } from './item-catalog.js';

export const ITEM_LEDGER_KEY = 'igs:item-ledger:v1';
const CHAT_MAX = 30;
const FLOOR_EVENT_MAX = 40;
// 一楼里物品表变动超过这么多件，多半是整表重建或换存档，按新起点处理，不刷屏演出。
const BULK_CHANGE = 8;
// 相邻两条 AI 楼之间隔着一条用户消息；隔得更远说明中间没同步过（演出关着或换了聊天），重新取起点。
const FLOOR_GAP_MAX = 2;

const floorKey = (messageId, swipeId) => `${Number(messageId)}|${Number(swipeId) || 0}`;

function emptyChat() {
    return { updatedAt: 0, items: {}, present: null, base: null, last: null, events: {} };
}

function sanitizeChat(raw) {
    const chat = emptyChat();
    if (!raw || typeof raw !== 'object') return chat;
    chat.updatedAt = Number(raw.updatedAt) || 0;
    if (raw.items && typeof raw.items === 'object') {
        for (const [key, item] of Object.entries(raw.items)) {
            if (item && typeof item.name === 'string') chat.items[key] = { name: item.name, description: String(item.description || ''), first: Number.isInteger(item.first) ? item.first : null };
        }
    }
    chat.present = Array.isArray(raw.present) ? raw.present.map(String) : null;
    chat.base = raw.base && Number.isInteger(raw.base.messageId) && Array.isArray(raw.base.present)
        ? { messageId: raw.base.messageId, present: raw.base.present.map(String) } : null;
    chat.last = Number.isInteger(raw.last) ? raw.last : null;
    if (raw.events && typeof raw.events === 'object') {
        for (const [key, list] of Object.entries(raw.events)) {
            if (Array.isArray(list)) chat.events[key] = list.filter((e) => e && (e.action === 'gain' || e.action === 'lose') && typeof e.name === 'string')
                .map((e) => ({ action: e.action, name: e.name, description: String(e.description || '') }));
        }
    }
    return chat;
}

export function createItemLedger({ storage, now = () => Date.now() } = {}) {
    let data = null;

    function load() {
        if (data) return data;
        data = {};
        try {
            const parsed = JSON.parse((storage && storage.getItem(ITEM_LEDGER_KEY)) || '{}');
            for (const [chatId, chat] of Object.entries(parsed && parsed.chats || {})) data[chatId] = sanitizeChat(chat);
        } catch { data = {}; }
        return data;
    }

    function save() {
        if (!storage) return;
        const chats = Object.entries(load()).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, CHAT_MAX);
        data = Object.fromEntries(chats);
        try { storage.setItem(ITEM_LEDGER_KEY, JSON.stringify({ version: 1, chats: data })); } catch { /* 存满时只丢账本，不影响阅读 */ }
    }

    function chatOf(chatId, create) {
        const all = load();
        if (!all[chatId] && create) all[chatId] = emptyChat();
        return all[chatId] || null;
    }

    function remember(chat, item, messageId) {
        const key = normalizeItemName(item.name);
        if (!key) return false;
        const known = chat.items[key];
        if (!known) {
            chat.items[key] = { name: String(item.name).trim(), description: String(item.description || ''), first: messageId };
            return true;
        }
        if (!known.description && item.description) { known.description = String(item.description); return true; }
        return false;
    }

    // 物品表同步：catalog 为 buildItemCatalog().items，floor 为最新 AI 楼 { messageId, swipeId }。
    function sync(chatId, catalog, floor) {
        if (!chatId || !floor || !Number.isInteger(floor.messageId)) return { changed: false };
        const chat = chatOf(chatId, true);
        const list = (Array.isArray(catalog) ? catalog : []).filter((item) => item && normalizeItemName(item.name));
        const current = Array.from(new Set(list.map((item) => normalizeItemName(item.name))));
        const byKey = new Map(list.map((item) => [normalizeItemName(item.name), item]));
        const stale = chat.present == null || chat.last == null
            || floor.messageId < chat.last - FLOOR_GAP_MAX || floor.messageId > chat.last + FLOOR_GAP_MAX;
        chat.updatedAt = now();
        if (stale) {
            for (const item of list) { const key = normalizeItemName(item.name); if (!chat.items[key]) chat.items[key] = { name: item.name, description: item.description || '', first: null }; }
            chat.present = current;
            chat.base = { messageId: floor.messageId, present: current };
            chat.last = floor.messageId;
            save();
            return { changed: false, baseline: true };
        }
        if (!chat.base || chat.base.messageId !== floor.messageId) chat.base = { messageId: floor.messageId, present: chat.present };
        chat.last = floor.messageId;
        const before = new Set(chat.base.present);
        const after = new Set(current);
        const gained = current.filter((key) => !before.has(key));
        const lost = chat.base.present.filter((key) => !after.has(key));
        const at = floorKey(floor.messageId, floor.swipeId);
        const previous = JSON.stringify(chat.events[at] || []);
        let events = [];
        if (gained.length + lost.length <= BULK_CHANGE) {
            events = [
                ...gained.map((key) => ({ action: 'gain', name: byKey.get(key).name, description: byKey.get(key).description || '' })),
                ...lost.map((key) => ({ action: 'lose', name: (chat.items[key] && chat.items[key].name) || key, description: '' })),
            ];
        }
        for (const key of gained) remember(chat, byKey.get(key), events.length ? floor.messageId : null);
        if (events.length) chat.events[at] = events;
        else delete chat.events[at];
        const keys = Object.keys(chat.events);
        if (keys.length > FLOOR_EVENT_MAX) for (const key of keys.sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).slice(0, keys.length - FLOOR_EVENT_MAX)) delete chat.events[key];
        chat.present = current;
        save();
        return { changed: JSON.stringify(events) !== previous, events };
    }

    // AI 写的 [igs-fx:item|获得|…]：没见过的物品记下首次出现的楼层。
    function noteTagItems(chatId, items, messageId) {
        if (!chatId || !Number.isInteger(messageId)) return false;
        const gains = (Array.isArray(items) ? items : []).filter((item) => item && item.action === 'gain');
        if (!gains.length) return false;
        const chat = chatOf(chatId, true);
        let changed = false;
        for (const item of gains) changed = remember(chat, item, messageId) || changed;
        if (changed) { chat.updatedAt = now(); save(); }
        return changed;
    }

    function isFirst(chatId, name, messageId) {
        const chat = chatOf(chatId, false);
        const item = chat && chat.items[normalizeItemName(name)];
        return Boolean(item) && item.first === Number(messageId);
    }

    function eventsFor(chatId, messageId, swipeId) {
        const chat = chatOf(chatId, false);
        return chat ? (chat.events[floorKey(messageId, swipeId)] || []).map((e) => ({ ...e })) : [];
    }

    function knownItems(chatId) {
        const chat = chatOf(chatId, false);
        return chat ? Object.values(chat.items).map((item) => ({ name: item.name, description: item.description })) : [];
    }

    return { sync, noteTagItems, isFirst, eventsFor, knownItems };
}
