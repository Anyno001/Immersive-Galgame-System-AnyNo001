const KEY = 'igs:mood-review:v1';
export const MOOD_REVIEW_LIMIT = 50;

// 待确认情绪词：词库里没有、立绘靠模糊兜底或「默认」显示的情绪词。
// 独立于设置与预设存放，便于渲染时记录而不触发整份设置保存。
export function loadMoodReview(storage) {
    try {
        const raw = storage && storage.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed && parsed.items) ? parsed.items.filter((item) => item && item.word) : [];
    } catch { return []; }
}

export function saveMoodReview(storage, items) {
    try { storage.setItem(KEY, JSON.stringify({ version: 1, items: items.slice(0, MOOD_REVIEW_LIMIT) })); } catch {}
}

// 同词只留最新一条并移到最前；内容未变时不写存储，避免每次翻页都写一次。
export function recordMoodReview(storage, entry) {
    const word = String(entry && entry.word || '').trim();
    if (!word) return false;
    const next = {
        word,
        character: String(entry.character || '').trim(),
        quality: entry.quality === 'fuzzy' ? 'fuzzy' : 'default',
        group: entry.quality === 'fuzzy' ? String(entry.group || '').trim() : '',
    };
    const items = loadMoodReview(storage);
    const current = items.find((item) => item.word === word);
    if (current && current.character === next.character && current.quality === next.quality && current.group === next.group) return false;
    saveMoodReview(storage, [next, ...items.filter((item) => item.word !== word)]);
    return true;
}

export function removeMoodReview(storage, word) {
    const items = loadMoodReview(storage);
    const next = items.filter((item) => item.word !== word);
    if (next.length !== items.length) saveMoodReview(storage, next);
}

export function clearMoodReview(storage) {
    saveMoodReview(storage, []);
}
