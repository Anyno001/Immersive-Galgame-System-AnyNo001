import { STICKER_TAG_G } from '../../stickers/sticker-render.js';

// 安科的锁：点过的结果随聊天存在 chatMetadata.igs_forum_anke，刷新、翻页、重建列表时原样恢复，不再重骰。
// 值 { kind, pick, roll, die, total, tier, tally, at, floors:[{no,text}], react:[{no,id,time,text}] }；只留最近 ANKE_KEEP 条。读不到 chatMetadata（预览页等）时留在内存。
export const ANKE_METADATA_KEY = 'igs_forum_anke';
export const ANKE_KEEP = 200;

export function createAnkeStore({ getContext, getChatId }) {
    const memory = new Map();
    const heldOf = () => {
        let context = null;
        try { context = getContext(); } catch (_) { context = null; }
        const metadata = context && context.chatMetadata;
        return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { context, metadata } : null;
    };
    const all = () => {
        const held = heldOf();
        if (held) return held.metadata[ANKE_METADATA_KEY] && typeof held.metadata[ANKE_METADATA_KEY] === 'object' ? held.metadata[ANKE_METADATA_KEY] : {};
        return memory.get(String(getChatId() || '')) || {};
    };
    return {
        get: (key) => all()[key] || null,
        put(key, value) {
            const data = { ...all() };
            delete data[key];
            data[key] = value;
            for (const old of Object.keys(data).slice(0, Math.max(0, Object.keys(data).length - ANKE_KEEP))) delete data[old];
            const held = heldOf();
            if (!held) { memory.set(String(getChatId() || ''), data); return; }
            held.metadata[ANKE_METADATA_KEY] = data;
            try { if (typeof held.context.saveMetadata === 'function') Promise.resolve(held.context.saveMetadata()).catch(() => null); } catch (_) { /* 内存里已锁住 */ }
        },
    };
}

const stripSticker = (text) => {
    const names = [...String(text || '').matchAll(STICKER_TAG_G)].map((m) => m[1]);
    const plain = String(text || '').replace(STICKER_TAG_G, '').trim();
    return plain || (names.length ? `（表情包：${names[0]}）` : '');
};

// 用户消息里 >>No.N 或 >>N 引用了内置楼 / 候选楼：查锁里的楼号，命中的返回 [{ no, text }]。
export function ankeQuotedFloors(locks, userText) {
    const nos = new Set([...String(userText || '').matchAll(/>>\s*(?:No\.)?\s*(\d+)/gi)].map((m) => m[1]));
    if (!nos.size || !locks || typeof locks !== 'object') return [];
    const out = [];
    for (const lock of Object.values(locks)) {
        for (const f of [...(lock.floors || []), ...(lock.react || [])]) {
            const no = String(f.no);
            if (nos.has(no) && !out.some((o) => o.no === no)) out.push({ no, text: stripSticker(f.text) });
        }
    }
    return out;
}
