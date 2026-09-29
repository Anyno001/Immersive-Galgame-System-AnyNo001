const KEY = 'igs:outfit-review:v1';
export const OUTFIT_REVIEW_LIMIT = 50;

// 待确认服装词：AI 在服装栏写出、但该角色没有登记的服装名。独立于设置与预设存放，渲染时记录不触发设置保存。
export function loadOutfitReview(storage) {
    try {
        const raw = storage && storage.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed && parsed.items) ? parsed.items.filter((item) => item && item.word && item.character) : [];
    } catch { return []; }
}

function saveOutfitReview(storage, items) {
    try {
        storage.setItem(KEY, JSON.stringify({ version: 1, items: items.slice(0, OUTFIT_REVIEW_LIMIT) }));
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: 'store-write-failed', saveError: error };
    }
}

const same = (item, character, word) => item.character === character && item.word === word;

// 同角色同词只记一条；已在列表里时不写存储，避免每次翻页都写。
export function recordOutfitReview(storage, entry) {
    const word = String(entry && entry.word || '').trim();
    const character = String(entry && entry.character || '').trim();
    if (!word || !character) return false;
    const items = loadOutfitReview(storage);
    if (items.some((item) => same(item, character, word))) return false;
    saveOutfitReview(storage, [{ character, word }, ...items]);
    return true;
}

export function removeOutfitReview(storage, character, word) {
    const items = loadOutfitReview(storage);
    const next = items.filter((item) => !same(item, character, word));
    return next.length !== items.length ? saveOutfitReview(storage, next) : { ok: true };
}

export function clearOutfitReview(storage) {
    return saveOutfitReview(storage, []);
}
